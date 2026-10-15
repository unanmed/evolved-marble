import { FIXED_DT } from '../config/sim';
import { CommandQueue, type Command } from './commands';
import { TickClock } from './core/clock';
import { EventLog } from './core/events';
import { RandomStreams } from './core/rng';
import { deserializeState, fingerprint, serializeState } from './snapshot';
import { movementSystem } from './systems/movement';
import { EntityStore, type EntityId } from './world/entity-store';
import type { SimState } from './world/world';

/** BattleSim 的运行期配置。 */
export interface BattleSimConfig {
    dt: number;
    streams: readonly string[];
}

const DEFAULT_STREAMS: readonly string[] = ['ai'];

/**
 * 模拟的唯一公开门面（Phase 2/4/6 接入的接缝）。
 *
 * 显式构造并注入，绝不作为模块级全局。暴露唯一的推进原语 `step()`；
 * 谁调用它、多久调用一次，是宿主（host）的职责。
 */
export class BattleSim {
    private readonly cfg: BattleSimConfig;
    private _state: SimState;

    constructor(seed: number, cfg: Partial<BattleSimConfig> = {}) {
        this.cfg = {
            dt: cfg.dt ?? FIXED_DT,
            streams: cfg.streams ?? DEFAULT_STREAMS
        };
        this._state = this.build(seed);
    }

    private build(seed: number): SimState {
        return {
            store: new EntityStore(),
            clock: new TickClock(this.cfg.dt),
            rng: new RandomStreams(seed, this.cfg.streams),
            commands: new CommandQueue(),
            events: new EventLog()
        };
    }

    /** 只读状态视图（供测试/序列化读取；不暴露可变更入口）。 */
    get state(): SimState {
        return this._state;
    }

    /** 从种子重建状态（同种子可复现）。 */
    reset(seed: number): void {
        this._state = this.build(seed);
    }

    /** 便捷入口：以 Store 的单调 id 生成实体。 */
    spawn(): EntityId {
        return this._state.store.spawn();
    }

    /**
     * 提交外部命令（信任边界入口）。
     *
     * 参数类型为 `readonly unknown[]`（而非 `readonly Command[]`）：外部输入在**运行期**
     * 才是不可信的，队列必须能对未知 `kind`/缺失字段做结构校验并确定性拒绝（T-01-05）。
     */
    submit(commands: readonly unknown[]): void {
        this._state.commands.submit(commands);
    }

    /**
     * 推进一个固定步。
     *
     * 顺序（研究 Pattern 4）：先清空上一 tick 事件 → 在**顶部 drain 命令队列**（每 tick 一次，
     * 外部时序永不进入步内）→ 时钟前进 → 应用命令 → 运行 Phase-1 系统。
     */
    step(): void {
        this._state.events.clear();
        const cmds = this._state.commands.drain();
        const rejections = this._state.commands.drainRejections();
        this._state.clock.step();
        const tick = this._state.clock.tick;
        for (const r of rejections) {
            this._state.events.emit({
                kind: 'rejected',
                tick,
                reason: r.reason
            });
        }
        this.applyCommands(cmds, tick);
        movementSystem(this._state, this.cfg.dt);
    }

    /** 本 tick 是否已知该实体（命令目标存在性检查；未知则确定性丢弃，不抛错）。 */
    private hasUnit(id: EntityId): boolean {
        return this._state.store.ids().includes(id);
    }

    /** 应用本 tick 的命令（已在步内 drain）。 */
    private applyCommands(cmds: readonly Command[], tick: number): void {
        for (const cmd of cmds) {
            switch (cmd.kind) {
                case 'force': {
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    const c = this._state.store.get(cmd.unit);
                    c.xform.vx += cmd.fx;
                    c.xform.vy += cmd.fy;
                    this.emitCommand(cmd, tick);
                    break;
                }
                case 'torque':
                case 'weaponAbility':
                case 'unitAbility': {
                    // Phase 1 无角速度/武器/能力实现：记录事件（非静默），Phase 2+ 落地。
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    this.emitCommand(cmd, tick);
                    break;
                }
                case 'spawn': {
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

    private emitCommand(cmd: Command, tick: number): void {
        this._state.events.emit({
            kind: 'command',
            tick,
            command: cmd.kind,
            unit: cmd.unit
        });
    }

    private rejectUnit(unit: EntityId, tick: number): void {
        this._state.events.emit({
            kind: 'rejected',
            tick,
            reason: `unknown entity: ${unit}`
        });
    }

    /** 规范状态字节（SIM-04 门禁原语）。 */
    snapshot(): Uint8Array {
        return serializeState(this._state);
    }

    /**
     * 用快照字节恢复状态（`snapshot()` 的逆操作）。
     *
     * 重建时钟步数、随机流状态与实体；命令队列/事件日志重置为空。恢复后继续
     * `step()` 即从该 tick 起确定性地重放。`dt` 保持本实例的配置值。
     */
    restore(bytes: Uint8Array): void {
        this._state = deserializeState(bytes, this.cfg.dt);
    }

    /** 状态指纹（非加密诊断值）。 */
    fingerprint(): string {
        return fingerprint(this.snapshot());
    }
}
