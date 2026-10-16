import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type {
    EventQueue,
    RigidBodyHandle,
    World
} from '@dimforge/rapier2d-deterministic-compat';
import { GRAVITY_X, GRAVITY_Y, MAX_CCD_SUBSTEPS } from '../../config/sim';

/**
 * 确定性物理世界封装（PHYS-03 / D-20 / D-35）。
 *
 * 本模块把 Rapier 的 `World` + `EventQueue` 收进一个**同步构造**的薄封装（D-21）：
 * WASM 已在构造前由 `initPhysics()` 幂等初始化。除 `step()` 外不暴露任何改变世界的入口。
 *
 * 关键确定性约定（研究 Pitfall 1/3/7）：
 * - `step()` **先**把全部刚体的线/角速度捕获为"步前速度"，**再** `world.step()`；
 *   接触 Δv 必须用步前速度（步后 manifold 读到的已是被求解器抹平的速度，恒为 0）。
 * - 刚体/碰撞体/关节的创建顺序由调用方（工厂）以 `EntityStore.ids()` 的**有序数组**
 *   保证，本模块自身不遍历 `Map`/`Set` 决定创建顺序。
 */

/** 一个刚体的"步前"速度快照（Pitfall 1：Δv 必须取自步前）。 */
export interface IPreStepVelocity {
    /** 步前线速度 x（m/s）。 */
    readonly lvx: number;
    /** 步前线速度 y（m/s）。 */
    readonly lvy: number;
    /** 步前角速度（rad/s）。 */
    readonly av: number;
}

/**
 * 确定性物理世界的公开契约（D-13：先接口后类）。
 */
export interface IPhysicsWorld {
    /** 底层 Rapier 世界（供工厂创建刚体/碰撞体/关节）。 */
    readonly world: World;
    /** Rapier 事件队列（供接触桥 drain）。 */
    readonly eventQueue: EventQueue;
    /** 固定步长（秒）。 */
    readonly dt: number;
    /** 推进一个固定步：先捕获步前速度，再 `world.step`。 @param dt 本步的固定步长（秒）。 */
    step(dt: number): void;
    /**
     * 取某刚体的步前速度。
     * @param handle 刚体句柄。
     * @returns 步前速度；静态/未知刚体返回 `null`。
     */
    preStepVelocity(handle: RigidBodyHandle): IPreStepVelocity | null;
    /** 取 Rapier 原生快照字节（D-20 第二个指纹的输入）。 @returns 世界快照字节。 */
    takeSnapshot(): Uint8Array;
}

/**
 * 确定性物理世界。构造是**同步**的（须在 `await initPhysics()` 之后调用）；
 * `step()` 先捕获步前速度再推进求解器。
 */
export class PhysicsWorld implements IPhysicsWorld {
    /** 底层 Rapier 世界（私有；经 `world` 访问器只读暴露）。 */
    private readonly rapierWorld: World;
    /** Rapier 事件队列（自动 drain 打开，避免无界驻留）。 */
    private readonly queue: EventQueue;
    /** 固定步长（秒）。 */
    private readonly fixedDt: number;
    /** 步前速度快照：刚体句柄 → 速度（每步刷新，仅作查找）。 */
    private readonly preStepVelocities = new Map<
        RigidBodyHandle,
        IPreStepVelocity
    >();

    /**
     * @param dt 固定步长（秒）。
     */
    constructor(dt: number) {
        this.fixedDt = dt;
        this.rapierWorld = new RAPIER.World({ x: GRAVITY_X, y: GRAVITY_Y });
        this.rapierWorld.timestep = dt;
        this.rapierWorld.maxCcdSubsteps = MAX_CCD_SUBSTEPS;
        /* autoDrain=true：求解前自动清空上一批事件，我们每步后立即 drain 本步事件。 */
        this.queue = new RAPIER.EventQueue(true);
    }

    /** 底层 Rapier 世界。 */
    get world(): World {
        return this.rapierWorld;
    }

    /** Rapier 事件队列。 */
    get eventQueue(): EventQueue {
        return this.queue;
    }

    /** 固定步长（秒）。 */
    get dt(): number {
        return this.fixedDt;
    }

    /**
     * 推进一个固定步：**先**捕获全部刚体的步前速度，**再** `world.step(eventQueue)`。
     *
     * @param dt 本步的固定步长（秒）。
     */
    step(dt: number): void {
        this.rapierWorld.timestep = dt;
        this.capturePreStepVelocities();
        this.rapierWorld.step(this.queue);
    }

    /**
     * 捕获全部刚体的步前线/角速度（每步刷新）。
     *
     * 遍历顺序由 Rapier 内部竞技场决定（已有确定性），且本方法**只读**——不创建/删除
     * 任何刚体，故其顺序不影响物理结果。
     */
    private capturePreStepVelocities(): void {
        this.preStepVelocities.clear();
        this.rapierWorld.forEachRigidBody(body => {
            const lv = body.linvel();
            this.preStepVelocities.set(body.handle, {
                lvx: lv.x,
                lvy: lv.y,
                av: body.angvel()
            });
        });
    }

    /**
     * 取某刚体的步前速度。
     *
     * @param handle 刚体句柄。
     * @returns 步前速度；未捕获（静态/未知）返回 `null`。
     */
    preStepVelocity(handle: RigidBodyHandle): IPreStepVelocity | null {
        return this.preStepVelocities.get(handle) ?? null;
    }

    /**
     * 取 Rapier 原生快照字节（D-20 第二个指纹的输入）。
     *
     * @returns 世界快照字节（构建相关，不出进程；仅作同机漂移金丝雀）。
     */
    takeSnapshot(): Uint8Array {
        return this.rapierWorld.takeSnapshot();
    }
}
