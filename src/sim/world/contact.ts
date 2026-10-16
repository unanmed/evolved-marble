import type {
    Collider,
    ColliderHandle
} from '@dimforge/rapier2d-deterministic-compat';
import {
    SimEventKind,
    type IEventLog,
    type IUnitPartRef
} from '../core/events';
import type { IPhysicsWorld } from './physics-world';

/**
 * 接触桥（PHYS-02 / D-28..D-31）。
 *
 * 每 tick 把 Rapier 的 collision-enter 事件翻译为类型化 `IContactEvent` 写入事件日志：
 * 两侧碰撞体经 `colliderHandle → IUnitPartRef` 映射解析出 `(entityId, part, armorSubtype)`，
 * Δv 取**步前**速度在接触点的法向相对速度大小（研究 Pitfall 1：步后读 manifold 恒为 0）。
 *
 * 安全（威胁 T-02-01）：`lookup()` 对未登记句柄返回 `null`（**绝不抛错**）；`drain()` 在
 * 任一侧解析为 `null` 时**提前返回**，从而杜绝对 `undefined` 的解引用（旧原型反模式）。
 */

/** 刚体上某点的世界速度分量（内部具名接口，项目锁定规则 #5：不写内联对象类型）。 */
interface IPointVelocity {
    /** 世界速度 x（m/s）。 */
    vx: number;
    /** 世界速度 y（m/s）。 */
    vy: number;
}

/**
 * 接触桥的公开契约（D-13：先接口后类）。
 */
export interface IContactBridge {
    /**
     * 登记 `colliderHandle → 部位标记` 映射（工厂每创建一个碰撞体即调用）。
     * @param handle 碰撞体句柄。
     * @param ref 该碰撞体的部位标记。
     */
    register(handle: ColliderHandle, ref: IUnitPartRef): void;
    /**
     * 解析句柄对应的部位标记。
     * @param handle 碰撞体句柄。
     * @returns 部位标记；未登记返回 `null`（绝不抛错，T-02-01）。
     */
    lookup(handle: ColliderHandle): IUnitPartRef | null;
    /**
     * 将本 tick 的 Rapier 碰撞事件翻译为类型化 `IContactEvent` 写入事件日志。
     * @param tick 当前 tick（写入事件的归属）。
     */
    drain(tick: number): void;
}

/**
 * 接触桥。持有部件映射（仅作查找，绝不用于迭代）并把 Rapier 事件翻译进 `IEventLog`。
 */
export class ContactBridge implements IContactBridge {
    /** 物理世界（读取队列、世界与步前速度）。 */
    private readonly physics: IPhysicsWorld;
    /** 事件日志（输出目标）。 */
    private readonly events: IEventLog;
    /** 部件映射：碰撞体句柄 → 部位标记（仅查找）。 */
    private readonly parts = new Map<ColliderHandle, IUnitPartRef>();

    /**
     * @param physics 物理世界。
     * @param events 事件日志（输出目标）。
     */
    constructor(physics: IPhysicsWorld, events: IEventLog) {
        this.physics = physics;
        this.events = events;
    }

    /**
     * 登记 `colliderHandle → 部位标记` 映射。
     *
     * @param handle 碰撞体句柄。
     * @param ref 该碰撞体的部位标记。
     */
    register(handle: ColliderHandle, ref: IUnitPartRef): void {
        this.parts.set(handle, ref);
    }

    /**
     * 解析句柄对应的部位标记。
     *
     * @param handle 碰撞体句柄。
     * @returns 部位标记；未登记返回 `null`。
     */
    lookup(handle: ColliderHandle): IUnitPartRef | null {
        return this.parts.get(handle) ?? null;
    }

    /**
     * 将本 tick 的 Rapier 碰撞事件翻译为类型化 `IContactEvent`。
     *
     * 仅处理 `started === true`（collision-enter 命中触发，D-29）；两侧未登记即忽略。
     * Δv = |(vA@P − vB@P) · n|，速度取自**步前**快照（Pitfall 1）。
     *
     * @param tick 当前 tick。
     */
    drain(tick: number): void {
        const world = this.physics.world;
        this.physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
            /* enter 语义（D-29）：结束接触不产生命中事件 */
            if (!started) return;
            const colliderA = world.getCollider(h1);
            const colliderB = world.getCollider(h2);
            const refA = this.lookup(colliderA.handle);
            const refB = this.lookup(colliderB.handle);
            /* 未登记（静态/他物）→ 忽略，防 undefined 解引用（T-02-01） */
            if (!refA || !refB) return;

            world.contactPair(colliderA, colliderB, manifold => {
                /* 临时缓冲：立即拷出法向与世界接触点 */
                const normal = manifold.normal();
                const nx = normal.x;
                const ny = normal.y;
                const point =
                    manifold.numSolverContacts() > 0
                        ? manifold.solverContactPoint(0)
                        : null;
                const px = point ? point.x : null;
                const py = point ? point.y : null;
                const dv = this.relativeNormalSpeed(
                    colliderA,
                    colliderB,
                    px,
                    py,
                    nx,
                    ny
                );
                this.events.emit({
                    kind: SimEventKind.Contact,
                    tick,
                    a: refA.entityId,
                    b: refB.entityId,
                    partA: refA.part,
                    partB: refB.part,
                    armorA: refA.armorSubtype,
                    armorB: refB.armorSubtype,
                    dv
                });
            });
        });
    }

    /**
     * 计算两碰撞体所在刚体在接触点的法向相对速度大小（非负）。
     *
     * @param colliderA 碰撞体 a。
     * @param colliderB 碰撞体 b。
     * @param px 世界接触点 x（无接触点时为空）。
     * @param py 世界接触点 y（无接触点时为空）。
     * @param nx 世界法向 x。
     * @param ny 世界法向 y。
     * @returns 法向相对速度大小 `|(vA@P − vB@P) · n|`。
     */
    private relativeNormalSpeed(
        colliderA: Collider,
        colliderB: Collider,
        px: number | null,
        py: number | null,
        nx: number,
        ny: number
    ): number {
        const va = this.velocityAtPoint(colliderA, px, py);
        const vb = this.velocityAtPoint(colliderB, px, py);
        const relX = va.vx - vb.vx;
        const relY = va.vy - vb.vy;
        return Math.abs(relX * nx + relY * ny);
    }

    /**
     * 取碰撞体所在刚体在某点的世界速度：`v = linvel + ω × r`（2D：`ω × r = (−ω·ry, ω·rx)`）。
     *
     * 速度取自 `PhysicsWorld` 的**步前**快照；接触点为空时退化为刚体质心速度（r = 0）。
     * 无父刚体或刚体无步前快照（静态）时返回零速度。
     *
     * @param collider 碰撞体。
     * @param px 世界接触点 x（无接触点时为空）。
     * @param py 世界接触点 y（无接触点时为空）。
     * @returns 该点的世界速度分量。
     */
    private velocityAtPoint(
        collider: Collider,
        px: number | null,
        py: number | null
    ): IPointVelocity {
        const body = collider.parent();
        if (!body) return { vx: 0, vy: 0 };
        const vel = this.physics.preStepVelocity(body.handle);
        if (!vel) return { vx: 0, vy: 0 };
        const t = body.translation();
        const rx = px === null ? 0 : px - t.x;
        const ry = py === null ? 0 : py - t.y;
        return { vx: vel.lvx - vel.av * ry, vy: vel.lvy + vel.av * rx };
    }
}
