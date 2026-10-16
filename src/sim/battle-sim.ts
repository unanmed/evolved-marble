import type { RigidBody } from '@dimforge/rapier2d-deterministic-compat';
import {
    FIXED_DT,
    SAFETY_BELT_MARGIN,
    WORLD_HEIGHT,
    WORLD_WIDTH
} from '../config/sim';
import { CommandKind, CommandQueue, type Command } from './commands';
import {
    ARMOR_HALF_X,
    ARMOR_HALF_Y,
    ARMOR_MASS,
    BODY_MASS,
    BODY_RADIUS,
    SPAWN_ANGLE_STEP,
    SPAWN_RING_RADIUS,
    SPAWN_SPEED,
    WEAPON_HALF_LEN,
    WEAPON_MASS,
    WEAPON_RADIUS
} from './content/physics';
import { TickClock } from './core/clock';
import { ArmorSubtype, EventLog, SimEventKind } from './core/events';
import { clamp } from './core/math';
import { RandomStreams } from './core/rng';
import { deserializeState, fingerprint, serializeState } from './snapshot';
import {
    CompositeFactory,
    type ICompositeFactory,
    type ICompositeSpec
} from './world/composite';
import { ContactBridge, type IContactBridge } from './world/contact';
import { EntityStore, type EntityId } from './world/entity-store';
import { PhysicsWorld } from './world/physics-world';
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
    /** 便捷入口：以 Store 的单调 id 生成一个复合单位。 */
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
 *
 * Phase 2 起 **Rapier 为真源**（D-34）：`step()` 在应用命令（经冲量）后推进物理、
 * drain 接触事件、把刚体位姿镜像进 `EntityStore`（只读视图），最后施加安全带软钳制。
 */
export class BattleSim implements IBattleSim {
    /** 运行期配置。 */
    private readonly cfg: IBattleSimConfig;
    /** 聚合状态根。 */
    private simState: ISimState;
    /** 复合单位工厂（与当前 `simState.physics` 绑定；`restore()` 后重建）。 */
    private factory!: ICompositeFactory;
    /** 接触桥（与当前 `simState.physics`/`events` 绑定；`restore()` 后重建）。 */
    private bridge!: IContactBridge;

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
     * 以种子构造聚合状态，并装配与物理世界绑定的工厂/接触桥。
     *
     * 物理世界为**同步构造**（WASM 须已由 `initPhysics()` 初始化，D-21）；本方法不做任何异步。
     *
     * @param seed 主种子。
     * @returns 全新的状态根（含 `physics`）。
     */
    private build(seed: number): ISimState {
        const events = new EventLog();
        const physics = new PhysicsWorld(this.cfg.dt);
        const bridge = new ContactBridge(physics, events);
        this.bridge = bridge;
        this.factory = new CompositeFactory(
            physics.world,
            (handle, ref) => bridge.register(handle, ref),
            handle => physics.unregisterPart(handle)
        );
        return {
            store: new EntityStore(),
            clock: new TickClock(this.cfg.dt),
            rng: new RandomStreams(seed, this.cfg.streams),
            commands: new CommandQueue(),
            events,
            physics
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
     * 便捷入口：以 Store 的单调 id 生成一个复合单位。
     *
     * 顺序（决定 Rapier 竞技场顺序，故确定）：Store 分配单调 id → 按 id 构造确定性的
     * 生成规格 → 工厂按 `store.ids()` 顺序装配（本体 + 防具碰撞体 + 铰接武器体）。
     *
     * @returns 新实体 id。
     */
    spawn(): EntityId {
        const id = this.simState.store.spawn();
        const unit = this.factory.spawn(this.spawnSpec(id), id);
        this.simState.store.get(id).physics = unit;
        return id;
    }

    /**
     * 构造某 id 的复合单位生成规格（确定性）。
     *
     * 位置按有序 id 落在中心环上（同种子不变）；初速度取自带种子的 `'ai'` 流，
     * 使不同种子产生不同轨迹——确定性门禁的"不同种子 → 不同轨迹"据此保持。
     *
     * @param id 目标实体 id。
     * @returns 该单位的复合装配规格。
     */
    private spawnSpec(id: EntityId): ICompositeSpec {
        const ai = this.simState.rng.stream('ai');
        const angle = id * SPAWN_ANGLE_STEP;
        return {
            x: WORLD_WIDTH / 2 + Math.cos(angle) * SPAWN_RING_RADIUS,
            y: WORLD_HEIGHT / 2 + Math.sin(angle) * SPAWN_RING_RADIUS,
            vx: (ai.next() * 2 - 1) * SPAWN_SPEED,
            vy: (ai.next() * 2 - 1) * SPAWN_SPEED,
            bodyRadius: BODY_RADIUS,
            bodyMass: BODY_MASS,
            weapons: [
                {
                    halfLen: WEAPON_HALF_LEN,
                    radius: WEAPON_RADIUS,
                    mass: WEAPON_MASS
                }
            ],
            armors: [
                {
                    subtype: ArmorSubtype.Helmet,
                    offsetX: ARMOR_HALF_X,
                    offsetY: 0,
                    halfX: ARMOR_HALF_X,
                    halfY: ARMOR_HALF_Y,
                    mass: ARMOR_MASS
                }
            ]
        };
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
     * 顺序（研究 Pattern 4/5，D-34）：清空上一 tick 事件 → drain 命令队列（每 tick 一次，
     * 外部时序永不进入步内）→ 时钟前进 → 应用命令（Force/Torque 经 Rapier 冲量）→
     * `physics.step(dt)` → 接触桥 drain（把类型化接触写入本 tick 事件）→ 位姿镜像 →
     * 安全带软钳制。全程同步、无跨 tick 接触归属。
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
        this.simState.physics.step(this.cfg.dt);
        this.bridge.drain(tick);
        this.mirrorAndClamp();
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
     * 取某单位本体刚体（Rapier 为真源；命令经此施加冲量）。
     *
     * @param id 目标实体 id（调用方须已确认其存在）。
     * @returns 该单位本体刚体。
     */
    private bodyOf(id: EntityId): RigidBody {
        const handle = this.simState.store.get(id).physics.bodyHandle;
        return this.simState.physics.world.getRigidBody(handle);
    }

    /**
     * 应用本 tick 的命令（已在步内 drain）。
     *
     * Force/Torque 经 Rapier 冲量 API 施加（绝不直接改 `xform`——Rapier 为真源，D-34）；
     * 武器/单位能力在 Phase 2 仍只记录事件（非静默 no-op）。
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
                    this.bodyOf(cmd.unit).applyImpulse(
                        { x: cmd.fx, y: cmd.fy },
                        true
                    );
                    this.emitCommand(cmd, tick);
                    break;
                }
                case CommandKind.Torque: {
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    this.bodyOf(cmd.unit).applyTorqueImpulse(cmd.amount, true);
                    this.emitCommand(cmd, tick);
                    break;
                }
                case CommandKind.WeaponAbility:
                case CommandKind.UnitAbility: {
                    // Phase 2 无武器/能力实现：记录事件（非静默），Phase 3+ 落地。
                    if (!this.hasUnit(cmd.unit)) {
                        this.rejectUnit(cmd.unit, tick);
                        break;
                    }
                    this.emitCommand(cmd, tick);
                    break;
                }
                case CommandKind.Spawn: {
                    // 保留（王国层）：Phase 2 只记录不落地。
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
     * 把 Rapier 刚体位姿镜像进 `EntityStore`，随后施加 D-33 安全带软钳制。
     *
     * 迭代契约：严格按 `store.ids()` 的**有序数组**迭代（Pitfall 4）。镜像是**只读视图**的
     * 唯一写入点；安全带仅在单位越出安全区（1000×1000 m）时把位置/速度拉回（平时不干预），
     * 且同时写回 Rapier（真源）与 store（镜像），使二者保持一致。
     */
    private mirrorAndClamp(): void {
        const world = this.simState.physics.world;
        const minX = SAFETY_BELT_MARGIN;
        const maxX = WORLD_WIDTH - SAFETY_BELT_MARGIN;
        const minY = SAFETY_BELT_MARGIN;
        const maxY = WORLD_HEIGHT - SAFETY_BELT_MARGIN;
        for (const id of this.simState.store.ids()) {
            const c = this.simState.store.get(id);
            const body = world.getRigidBody(c.physics.bodyHandle);
            const t = body.translation();
            const v = body.linvel();
            const x = clamp(t.x, minX, maxX);
            const y = clamp(t.y, minY, maxY);
            const outX = x !== t.x;
            const outY = y !== t.y;
            let vx = v.x;
            let vy = v.y;
            /* 越界时把外向速度分量拉回（软钳制，非反弹墙） */
            if (outX && (x === minX ? vx < 0 : vx > 0)) vx = 0;
            if (outY && (y === minY ? vy < 0 : vy > 0)) vy = 0;
            if (outX || outY) {
                body.setTranslation({ x, y }, true);
                body.setLinvel({ x: vx, y: vy }, true);
            }
            c.xform.x = x;
            c.xform.y = y;
            c.xform.vx = vx;
            c.xform.vy = vy;
            c.xform.rotation = body.rotation();
            c.xform.angularVelocity = body.angvel();
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
     * @returns 规范化的状态字节（含 Rapier 快照字节与部件映射，见 `snapshot.ts`）。
     */
    snapshot(): Uint8Array {
        return serializeState(this.simState);
    }

    /**
     * 用快照字节恢复状态（`snapshot()` 的逆操作）。
     *
     * 重建时钟步数、随机流状态、实体（含位姿/物理句柄）与物理世界（含部件映射）；
     * 命令队列/事件日志重置为空。随后重建与还原后物理世界绑定的工厂/接触桥。
     * `dt` 保持本实例的配置值。
     *
     * @param bytes `snapshot()` 产出的字节。
     */
    restore(bytes: Uint8Array): void {
        this.simState = deserializeState(bytes, this.cfg.dt);
        const bridge = new ContactBridge(
            this.simState.physics,
            this.simState.events
        );
        this.bridge = bridge;
        this.factory = new CompositeFactory(
            this.simState.physics.world,
            (handle, ref) => bridge.register(handle, ref),
            handle => this.simState.physics.unregisterPart(handle)
        );
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
