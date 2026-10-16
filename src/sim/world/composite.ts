import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type {
    ColliderHandle,
    RigidBodyHandle,
    World
} from '@dimforge/rapier2d-deterministic-compat';
import { ANGULAR_DAMPING, LINEAR_DAMPING, RESTITUTION } from '../../config/sim';
import { SWING_AMPLITUDE, SWING_ANGULAR_SPEED } from '../content/physics';
import { ArmorSubtype, PartKind, type IUnitPartRef } from '../core/events';
import type { EntityId } from './entity-store';

/**
 * 复合单位装配工厂（PHYS-01 / D-24..D-27）。
 *
 * 装配拓扑（D-24 混合式）：单位**本体 + 防具是同一刚体上的多个碰撞体**；**武器是
 * 独立动态刚体**，通过**恰好 2 锚点的旋转关节（revolute joint）**铰接到本体，从而
 * 武器拥有独立速度（伤害 Δv 的来源）。
 *
 * 每个创建的碰撞体都立即经 `RegisterCollider` 登记 `handle → IUnitPartRef`，供接触桥
 * 解析部位。武器挥击按 D-25 以**直接角速度**驱动（D-36 认可的简化：不用关节电机）。
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
 * 本计划（tracer）只以**测试值**装配 1 武器 + 1 防具；**不**含槽位/装备/解锁逻辑
 * （D-36 克制原则）。Phase 3 的内容表将以此数组形装配真实装备。
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
 * 一个单位在物理世界中的句柄集合（每实体物理组件，plan 02-03 将并入 `IUnitComponents`）。
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
 * 复合单位工厂的公开契约（D-13：先接口后类）。
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
}

/**
 * 复合单位装配工厂。创建顺序由调用方按 `EntityStore.ids()` 的有序数组决定（Pitfall 3）；
 * 本类自身不遍历 `Map`/`Set` 决定创建顺序。
 */
export class CompositeFactory implements ICompositeFactory {
    /** 底层 Rapier 世界。 */
    private readonly world: World;
    /** 碰撞体登记回调。 */
    private readonly register: RegisterCollider;

    /**
     * @param world 底层 Rapier 世界。
     * @param register 碰撞体登记回调（接到接触桥的部件映射）。
     */
    constructor(world: World, register: RegisterCollider) {
        this.world = world;
        this.register = register;
    }

    /**
     * 生成一个复合单位。
     *
     * 顺序（决定 Rapier 竞技场顺序，故确定）：本体刚体 → 本体球 → 各防具 → 各武器体 →
     * 各武器胶囊 → 各旋转关节。
     *
     * @param spec 装配规格。
     * @param entityId 所属单位 id。
     * @returns 该单位的物理句柄集合。
     */
    spawn(spec: ICompositeSpec, entityId: EntityId): IUnitPhysics {
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
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                weaponBody
            );
            this.register(weaponCol.handle, {
                entityId,
                part: PartKind.Weapon,
                armorSubtype: null
            });

            /* 恰好 2 锚点的旋转关节（0.21.0：2D 无轴向参数） */
            const joint = this.world.createImpulseJoint(
                RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }),
                body,
                weaponBody,
                true
            );
            /* 同单位部件互为无损（D-27）：关节两侧刚体间不计算接触，避免武器与自身本体/防具互撞。 */
            joint.setContactsEnabled(false);

            weaponHandles.push(weaponBody.handle);
        }

        return { entityId, bodyHandle: body.handle, weaponHandles };
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
}
