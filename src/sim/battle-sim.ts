import { FIXED_DT } from '../config/sim';
import { CommandKind, CommandQueue, type Command } from './commands';
import { TickClock } from './core/clock';
import { EventLog, SimEventKind } from './core/events';
import { RandomStreams } from './core/rng';
import { deserializeState, fingerprint, serializeState } from './snapshot';
import { movementSystem } from './systems/movement';
import { EntityStore, type EntityId } from './world/entity-store';
import type { ISimState } from './world/world';

/** BattleSim 的运行期配置。 */
export interface IBattleSimConfig {
    /** 固定步长（秒）。 */
    dt: number;
    /** 命名随机流名字集合。 */
    streams: readonly string[];
}

/** 默认随机流名字集合。 */
const DEFAULT_STREAMS: readonly string[] = ['ai'];

/**
 * 模拟门面的公开契约（D-13：先接口后类）。
 *
 * 只暴露唯一的推进原语 `step()` 与状态/序列化入口；宿主（host）决定调用时机。
 */
export interface IBattleSim {
    /** 只读状态视图。 */
    readonly state: ISimState;
    /** 从种子重建状态（同种子可复现）。 */
    reset(seed: number): void;
    /** 便捷入口：以 Store 的单调 id 生成实体。 */
    spawn(): EntityId;
    /** 提交外部命令（信任边界入口）。 */
    submit(commands: readonly unknown[]): void;
    /** 推进一个固定步。 */
    step(): void;
    /** 规范状态字节（SIM-04 门禁原语）。 */
    snapshot(): Uint8Array;
    /** 用快照字节恢复状态。 */
    restore(bytes: Uint8Array): void;
    /** 状态指纹（非加密诊断值）。 */
    fingerprint(): string;
}

/**
 * 模拟的唯一公开门面（Phase 2/4/6 接入的接缝）。
 *
 * 显式构造并注入，绝不作为模块级全局。暴露唯一的推进原语 `step()`；
 * 谁调用它、多久调用一次，是宿主（host）的职责。
 */
export class BattleSim implements IBattleSim {
    /** 运行期配置。 */
    private readonly cfg: IBattleSimConfig;
    /** 聚合状态根。 */
    private simState: ISimState;

    /**
     * @param seed 主种子。
     * @param cfg 运行期配置（可部分覆盖）。
     */
    constructor(seed: number, cfg: Partial<IBattleSimConfig> = {}) {
        this.cfg = {
            dt: cfg.dt ?? FIXED_DT,
            streams: cfg.streams ?? DEFAULT_STREAMS
        };
        this.simState = this.build(seed);
    }

    /**
     * 以种子构造聚合状态。
     *
     * @param seed 主种子。
     * @returns 全新的状态根。
     */
    private build(seed: number): ISimState {
        return {
            store: new EntityStore(),
            clock: new TickClock(this.cfg.dt),
            rng: new RandomStreams(seed, this.cfg.streams),
            commands: new CommandQueue(),
            events: new EventLog()
        };
    }

    /** 只读状态视图（供测试/序列化读取；不暴露可变更入口）。 */
    get state(): ISimState {
        return this.simState;
    }

    /**
     * 从种子重建状态（同种子可复现）。
     *
     * @param seed 主种子。
     */
    reset(seed: number): void {
        this.simState = this.build(seed);
    }

    /**
     * 便捷入口：以 Store 的单调 id 生成实体。
     *
     * @returns 新实体 id。
     */
    spawn(): EntityId {
        return this.simState.store.spawn();
    }

    /**
     * 提交外部命令（信任边界入口）。
     *
     * 参数类型为 `readonly unknown[]`（而非 `readonly Command[]`）：外部输入在**运行期**
     * 才是不可信的，队列必须能对未知 `kind`/缺失字段做结构校验并确定性拒绝（T-01-05）。
     *
     * @param commands 外部提交的原始命令。
     */
    submit(commands: readonly unknown[]): void {
        this.simState.commands.submit(commands);
    }

    /**
     * 推进一个固定步。
     *
     * 顺序（研究 Pattern 4）：先清空上一 tick 事件 → 在**顶部 drain 命令队列**（每 tick 一次，
     * 外部时序永不进入步内）→ 时钟前进 → 应用命令 → 运行 Phase-1 系统。
     */
    step(): void {
        this.simState.events.clear();
        const cmds = this.simState.commands.drain();
        const rejections = this.simState.commands.drainRejections();
        this.simState.clock.step();
        const tick = this.simState.clock.tick;
        for (const r of rejections) {
            this.simState.events.emit({
                kind: SimEventKind.Rejected,
                tick,
                reason: r.reason
            });
        }
        this.applyCommands(cmds, tick);
        movementSystem(this.simState, this.cfg.dt);
    }

    /**
     * 本 tick 是否已知该实体（命令目标存在性检查；未知则确定性丢弃，不抛错）。
     *
     * @param id 待检查的实体 id。
     * @returns 当实体存在时为 `true`。
     */
    private hasUnit(id: EntityId): boolean {
        return this.simState.store.ids().includes(id);
    }

    /**
     * 应用本 tick 的命令（已在步内 drain）。
     *
     * @param cmds 本 tick drain 出的命令（插入顺序）。
     * @param tick 当前 tick。
     */
    private applyCommands(cmds: readonly Command[], tick: number): void {
        for (const cmd of cmds) {
            switch (cmd.kind) {
                case CommandKind.Force: {
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    const c = this.simState.store.get(cmd.unit);
                    c.xform.vx += cmd.fx;
                    c.xform.vy += cmd.fy;
                    this.emitCommand(cmd, tick);
                    break;
                }
                case CommandKind.Torque:
                case CommandKind.WeaponAbility:
                case CommandKind.UnitAbility: {
                    // Phase 1 无角速度/武器/能力实现：记录事件（非静默），Phase 2+ 落地。
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    this.emitCommand(cmd, tick);
                    break;
                }
                case CommandKind.Spawn: {
                    // 保留（王国层）：Phase 1 只记录不落地。
                    this.emitCommand(cmd, tick);
                    break;
                }
                default: {
                    // 编译期穷尽性守卫（WR-02）：若新增 Command 变体而未在此处理，
                    // `cmd` 在 default 分支会被收窄为 `never`，赋值即报类型错误——
                    // 从而杜绝"静默 no-op"这一旧原型反模式。运行期到此分支即抛错（不静默）。
                    const unhandled: never = cmd;
                    throw new Error(
                        `unhandled command kind: ${JSON.stringify(unhandled)}`
                    );
                }
            }
        }
    }

    /**
     * 记录一条已应用命令的事件。
     *
     * @param cmd 已应用的命令。
     * @param tick 当前 tick。
     */
    private emitCommand(cmd: Command, tick: number): void {
        this.simState.events.emit({
            kind: SimEventKind.Command,
            tick,
            command: cmd.kind,
            unit: cmd.unit
        });
    }

    /**
     * 记录一次"未知实体"拒绝事件。
     *
     * @param unit 未知实体 id。
     * @param tick 当前 tick。
     */
    private rejectUnit(unit: EntityId, tick: number): void {
        this.simState.events.emit({
            kind: SimEventKind.Rejected,
            tick,
            reason: `unknown entity: ${unit}`
        });
    }

    /**
     * 规范状态字节（SIM-04 门禁原语）。
     *
     * @returns 规范化的状态字节。
     */
    snapshot(): Uint8Array {
        return serializeState(this.simState);
    }

    /**
     * 用快照字节恢复状态（`snapshot()` 的逆操作）。
     *
     * 重建时钟步数、随机流状态与实体；命令队列/事件日志重置为空。恢复后继续
     * `step()` 即从该 tick 起确定性地重放。`dt` 保持本实例的配置值。
     *
     * @param bytes `snapshot()` 产出的字节。
     */
    restore(bytes: Uint8Array): void {
        this.simState = deserializeState(bytes, this.cfg.dt);
    }

    /**
     * 状态指纹（非加密诊断值）。
     *
     * @returns 状态指纹。
     */
    fingerprint(): string {
        return fingerprint(this.snapshot());
    }
}
