import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type {
    ColliderHandle,
    RigidBody,
    RigidBodyHandle,
    World
} from '@dimforge/rapier2d-deterministic-compat';
import { ANGULAR_DAMPING, LINEAR_DAMPING, RESTITUTION } from '../../config/sim';
import {
    GROUP_COUNT,
    GROUP_MASK_ALL,
    GROUP_MASK_ENEMY,
    GROUP_UNIT_MEMBERSHIP,
    SWING_AMPLITUDE,
    SWING_ANGULAR_SPEED
} from '../content/physics';
import { ArmorSubtype, PartKind, type IUnitPartRef } from '../core/events';
import type { EntityId } from './entity-store';

/**
 * 复合单位装配工厂（PHYS-01 / D-24..D-27）。
 *
 * 装配拓扑（D-24 混合式）：单位**本体 + 防具是同一刚体上的多个碰撞体**；**武器是
 * 独立动态刚体**，通过**恰好 2 锚点的旋转关节（revolute joint）**铰接到本体，从而
 * 武器拥有独立速度（伤害 Δv 的来源）。装配规格为**数组形**（D-26）：任意数量的武器/
 * 防具，直接服务 Phase 3 的职业装备表。
 *
 * 碰撞过滤（D-27）：同一单位各部件互为无损，敌我单位之间仍保持物理碰撞。实现为单位级
 * `InteractionGroups`：同单位各碰撞体共享同一成员位，且过滤掩码排除该成员位（见
 * `unitGroups`）。CCD 装在武器刚体上（Pitfall 4）。
 *
 * 生命周期：`spawn`/`despawn` 只按调用方给定的**有序** `store.ids()` 顺序创建/销毁；
 * `despawn` 移除刚体（连带其碰撞体与关节）并注销全部部件句柄（T-02-01）。
 *
 * 每个创建的碰撞体都立即经 `RegisterCollider` 登记 `handle → IUnitPartRef`，供接触桥
 * 解析部位。武器挥击按 D-25 以**直接角速度**驱动（D-36 认可的可逆简化：不用关节电机——
 * 经有界扫描，关节电机只会把武器驱动到**恒定**角速度而非往复振荡）。
 *
 * ⚠️ 0.21.0 API 校正（研究 Pitfall 2）：本版本**无**带圆角的胶囊静态工厂，一律用
 * `ColliderDesc.capsule(halfHeight, radius)`；2D 旋转关节**恰好 2 锚点**，无轴向参数。
 */

/** 武器装配规格（D-26：数据驱动）。 */
export interface IWeaponSpec {
    /** 武器胶囊半高（米）。 */
    halfLen: number;
    /** 武器胶囊半径（米）。 */
    radius: number;
    /** 武器质量（kg）。 */
    mass: number;
}

/** 防具装配规格（D-26：数据驱动）。 */
export interface IArmorSpec {
    /** 防具子类型（头盔/盾牌，D-28）。 */
    subtype: ArmorSubtype;
    /** 相对本体的局部偏移 x（米）。 */
    offsetX: number;
    /** 相对本体的局部偏移 y（米）。 */
    offsetY: number;
    /** 防具半宽（米）。 */
    halfX: number;
    /** 防具半高（米）。 */
    halfY: number;
    /** 防具质量（kg）。 */
    mass: number;
}

/**
 * 复合单位装配规格（D-26：数组形，支持任意数量武器/防具）。
 *
 * 本计划只以**测试值**装配；**不**含槽位/装备/解锁逻辑（D-36 克制原则）。
 * Phase 3 的内容表将以此数组形装配真实装备。
 */
export interface ICompositeSpec {
    /** 生成位置 x（米）。 */
    x: number;
    /** 生成位置 y（米）。 */
    y: number;
    /** 初始线速度 x（m/s）。 */
    vx: number;
    /** 初始线速度 y（m/s）。 */
    vy: number;
    /** 本体球半径（米）。 */
    bodyRadius: number;
    /** 本体质量（kg）。 */
    bodyMass: number;
    /** 武器列表。 */
    weapons: readonly IWeaponSpec[];
    /** 防具列表。 */
    armors: readonly IArmorSpec[];
}

/**
 * 一个单位在物理世界中的句柄集合（每实体物理组件，plan 02-03 已并入 `IUnitComponents`）。
 */
export interface IUnitPhysics {
    /** 所属单位 id。 */
    entityId: EntityId;
    /** 本体刚体句柄。 */
    bodyHandle: RigidBodyHandle;
    /** 武器刚体句柄列表（与 `ICompositeSpec.weapons` 一一对应）。 */
    weaponHandles: readonly RigidBodyHandle[];
}

/**
 * 碰撞体登记回调：工厂每创建一个碰撞体即以 `handle → 部位标记` 登记（接到接触桥的映射）。
 *
 * @param handle 新建碰撞体句柄。
 * @param ref 该碰撞体的部位标记。
 */
export type RegisterCollider = (
    handle: ColliderHandle,
    ref: IUnitPartRef
) => void;

/**
 * 碰撞体注销回调：工厂 `despawn` 移除碰撞体后注销其句柄（防悬空部件句柄，T-02-01）。
 *
 * @param handle 被移除的碰撞体句柄。
 */
export type UnregisterCollider = (handle: ColliderHandle) => void;

/**
 * 复合单位工厂的公开契约（D-13：先接口后类）。
 *
 * `spawn`/`driveSwing` 为 tracer 冻结的签名（保持不变）；`despawn` 为本计划新增的
 * 有序生命周期入口（D-26）。
 */
export interface ICompositeFactory {
    /**
     * 生成一个复合单位（本体 + 防具同体碰撞体 + 独立铰接武器体），返回其句柄集合。
     * @param spec 装配规格。
     * @param entityId 所属单位 id。
     * @returns 该单位的物理句柄集合。
     */
    spawn(spec: ICompositeSpec, entityId: EntityId): IUnitPhysics;
    /**
     * 以**直接角速度**驱动某单位全部武器的往复摆动（D-25；D-36 直接驱动，非关节电机）。
     * @param unit 目标单位的物理句柄集合。
     * @param tick 当前步计数（用于计算摆动相位）。
     * @param dt 固定步长（秒）。
     */
    driveSwing(unit: IUnitPhysics, tick: number, dt: number): void;
    /**
     * 销毁一个复合单位：移除其全部武器刚体与本体刚体（连带各自碰撞体与旋转关节），
     * 并注销全部部件句柄（不留悬空句柄，T-02-01）。
     * @param entityId 目标单位 id（未知 id 为无副作用 no-op）。
     */
    despawn(entityId: EntityId): void;
}

/**
 * 复合单位装配工厂。创建/销毁顺序由调用方按 `EntityStore.ids()` 的有序数组决定
 * （Pitfall 3）；本类自身的 `units` 索引仅作查找，绝不用作创建顺序来源。
 */
export class CompositeFactory implements ICompositeFactory {
    /** 底层 Rapier 世界。 */
    private readonly world: World;
    /** 碰撞体登记回调。 */
    private readonly register: RegisterCollider;
    /** 碰撞体注销回调。 */
    private readonly unregister: UnregisterCollider;
    /** 已生成单位的句柄索引（仅查找；创建顺序由调用方决定）。 */
    private readonly units = new Map<EntityId, IUnitPhysics>();

    /**
     * @param world 底层 Rapier 世界。
     * @param register 碰撞体登记回调（接到接触桥的部件映射）。
     * @param unregister 碰撞体注销回调（despawn 时清理部件映射）。
     */
    constructor(
        world: World,
        register: RegisterCollider,
        unregister: UnregisterCollider
    ) {
        this.world = world;
        this.register = register;
        this.unregister = unregister;
    }

    /**
     * 生成一个复合单位。
     *
     * 顺序（决定 Rapier 竞技场顺序，故确定）：本体刚体 → 本体球 → 各防具 → 各武器体 →
     * 各武器胶囊 → 各旋转关节。全部碰撞体带单位级碰撞分组（D-27）与 `COLLISION_EVENTS`
     * （仅伤害相关部件，研究 Design Restraint #5）。
     *
     * @param spec 装配规格。
     * @param entityId 所属单位 id。
     * @returns 该单位的物理句柄集合。
     */
    spawn(spec: ICompositeSpec, entityId: EntityId): IUnitPhysics {
        const membership = this.unitMembership(entityId);
        const bodyGroups = this.interactionGroups(membership, GROUP_MASK_ALL);
        const partGroups = this.interactionGroups(membership, GROUP_MASK_ENEMY);

        const body = this.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(spec.x, spec.y)
                .setLinvel(spec.vx, spec.vy)
                .setLinearDamping(LINEAR_DAMPING)
                .setAngularDamping(ANGULAR_DAMPING)
                /* 摆动部件绝不 sleep（Pitfall 7） */
                .setCanSleep(false)
        );

        const bodyCol = this.world.createCollider(
            RAPIER.ColliderDesc.ball(spec.bodyRadius)
                .setMass(spec.bodyMass)
                .setRestitution(RESTITUTION)
                .setCollisionGroups(bodyGroups)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body
        );
        this.register(bodyCol.handle, {
            entityId,
            part: PartKind.Body,
            armorSubtype: null
        });

        for (const armor of spec.armors) {
            const armorCol = this.world.createCollider(
                RAPIER.ColliderDesc.cuboid(armor.halfX, armor.halfY)
                    .setTranslation(armor.offsetX, armor.offsetY)
                    .setMass(armor.mass)
                    .setRestitution(RESTITUTION)
                    .setCollisionGroups(partGroups)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                body
            );
            this.register(armorCol.handle, {
                entityId,
                part: PartKind.Armor,
                armorSubtype: armor.subtype
            });
        }

        const weaponHandles: RigidBodyHandle[] = [];
        for (const weapon of spec.weapons) {
            const weaponBody = this.world.createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(spec.x, spec.y)
                    .setLinearDamping(LINEAR_DAMPING)
                    .setAngularDamping(ANGULAR_DAMPING)
                    .setCanSleep(false)
                    /* 快速武器防穿透的廉价保险（Pitfall 4） */
                    .setCcdEnabled(true)
            );
            const weaponCol = this.world.createCollider(
                RAPIER.ColliderDesc.capsule(weapon.halfLen, weapon.radius)
                    .setMass(weapon.mass)
                    .setRestitution(RESTITUTION)
                    .setCollisionGroups(partGroups)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                weaponBody
            );
            this.register(weaponCol.handle, {
                entityId,
                part: PartKind.Weapon,
                armorSubtype: null
            });

            /* 恰好 2 锚点的旋转关节（0.21.0：2D 无轴向参数）。同单位部件互为无损
               由单位级碰撞分组保证（D-27），无需再禁用关节两侧接触。 */
            this.world.createImpulseJoint(
                RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }),
                body,
                weaponBody,
                true
            );

            weaponHandles.push(weaponBody.handle);
        }

        const unit: IUnitPhysics = {
            entityId,
            bodyHandle: body.handle,
            weaponHandles
        };
        this.units.set(entityId, unit);
        return unit;
    }

    /**
     * 以直接角速度驱动武器往复摆动：`θ'(t) = 振幅·角速度·cos(相位)`，相位 = `tick·角速度·dt`。
     *
     * 该直接驱动（D-36）无需关节电机调参，即可让武器获得独立角速度（Δv 的来源）；
     * 相位仅由步计数推得，故完全确定性。
     *
     * @param unit 目标单位的物理句柄集合。
     * @param tick 当前步计数。
     * @param dt 固定步长（秒）。
     */
    driveSwing(unit: IUnitPhysics, tick: number, dt: number): void {
        const phase = tick * SWING_ANGULAR_SPEED * dt;
        const targetAngularVelocity =
            SWING_AMPLITUDE * SWING_ANGULAR_SPEED * Math.cos(phase);
        for (const handle of unit.weaponHandles) {
            this.world
                .getRigidBody(handle)
                .setAngvel(targetAngularVelocity, true);
        }
    }

    /**
     * 销毁一个复合单位：移除全部武器刚体（连带其碰撞体与旋转关节），再移除本体刚体
     * （连带本体/防具碰撞体与残余关节），并注销全部部件句柄。
     *
     * 移除顺序固定为**武器 → 本体**，且只对已登记单位操作，故确定（Pitfall 3）。未知
     * `entityId` 为无副作用 no-op（与 `IEntityStore.despawn` 语义一致）。
     *
     * @param entityId 目标单位 id。
     */
    despawn(entityId: EntityId): void {
        const unit = this.units.get(entityId);
        if (!unit) return;
        for (const handle of unit.weaponHandles) {
            this.removeBody(handle);
        }
        this.removeBody(unit.bodyHandle);
        this.units.delete(entityId);
    }

    /**
     * 计算某单位全部部件共享的成员位（D-27）：基准成员位按 `(entityId - 1) % GROUP_COUNT`
     * 左移，16 位内循环（`InteractionGroups` 成员字段上限）。
     *
     * @param entityId 单位 id（从 1 起）。
     * @returns 该单位的成员位（高 16 位编码前的值）。
     */
    private unitMembership(entityId: EntityId): number {
        const shift = (entityId - 1) % GROUP_COUNT;
        return (GROUP_UNIT_MEMBERSHIP << shift) & GROUP_MASK_ALL;
    }

    /**
     * 把一个成员位与过滤掩码编码成 Rapier `InteractionGroups`：成员位在**高 16 位**，
     * 过滤掩码在**低 16 位**；交互允许当且仅当 `((a >> 16) & b) != 0 && ((b >> 16) & a) != 0`。
     *
     * 过滤掩码会**排除本单位成员位**，使同单位各部件互为无损；敌我单位成员位不同，
     * 故仍然碰撞（D-27）。
     *
     * @param membership 本单位成员位。
     * @param filterMask 允许交互的过滤掩码（本体用 `GROUP_MASK_ALL`，武器/防具用 `GROUP_MASK_ENEMY`）。
     * @returns 编码后的 `InteractionGroups`。
     */
    private interactionGroups(membership: number, filterMask: number): number {
        const members = membership & GROUP_MASK_ALL;
        const filter = filterMask & ~membership & GROUP_MASK_ALL;
        return (members << 16) | filter;
    }

    /**
     * 移除一个刚体：先注销其全部碰撞体句柄（防悬空，T-02-01），再 `removeRigidBody`
     * （Rapier 连带移除该刚体的碰撞体与关节）。
     *
     * @param handle 目标刚体句柄。
     */
    private removeBody(handle: RigidBodyHandle): void {
        const body = this.world.getRigidBody(handle);
        if (!body) return;
        this.unregisterBodyColliders(body);
        this.world.removeRigidBody(body);
    }

    /**
     * 注销某刚体全部碰撞体的部件句柄。
     *
     * @param body 目标刚体（须在移除前调用）。
     */
    private unregisterBodyColliders(body: RigidBody): void {
        const count = body.numColliders();
        for (let i = 0; i < count; i++) {
            this.unregister(body.collider(i).handle);
        }
    }
}
