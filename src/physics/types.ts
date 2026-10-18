/**
 * 物理模拟系统的全部类型声明：数字枚举 + `I*` 接口。
 * 本文件只含声明（枚举与接口），不含任何算法、数据表或运行时逻辑——
 * 无 Rapier 调用、无伤害运算、无类、无顶层 `const`。
 * 装备数值复用 Phase 1 已冻结的 `IWeaponDef`/`IArmorDef`（仅类型引用，不引用 `Unit` 类，D-07）。
 */

import type {
    ArmorKind,
    IArmorDef,
    IWeaponDef,
    WeaponKind
} from '@/units/types';

/**
 * 复合刚体中的部位标识：本体 / 武器 / 防具各为一个独立碰撞体（D-03）。
 * 该枚举充当 `collider handle → {unitId, part}` 映射中的部位标签（D-04），
 * 碰撞组（collision groups）只用于必要过滤，不作为部位主标识。
 * 成员一律为整数——本项目强制使用数字枚举（禁止字符串枚举）。
 */
export enum ColliderPart {
    /** 本体：单位自身的圆形碰撞体。 */
    Body = 0,
    /** 武器：细长 capsule 碰撞体，随本体刚性旋转。 */
    Weapon = 1,
    /** 防具：环绕本体的圆形碰撞体。 */
    Armor = 2
}

/**
 * 注册一个单位到物理世界的输入：**纯数值**，不含任何 `Unit` 实例（D-07）。
 * 调用方从单位系统读取这些数值后传入；物理层按 `unitId` 管理一切。
 * 缺失的**对象**引用用 `null`（`weapon`），缺失的**集合**用空数组（`armors`）。
 */
export interface IUnitPhysicsSpec {
    /** 单位 id：物理层以此为键索引刚体与碰撞体。 */
    readonly unitId: number;
    /** 生成位置的 x 坐标（米）。 */
    readonly x: number;
    /** 生成位置的 y 坐标（米）。 */
    readonly y: number;
    /** 本体碰撞体的质量，由调用方取自 `Unit.getAttribute(AttributeKind.Mass)`（D-05）。 */
    readonly mass: number;
    /** 基础攻击力 A_A。 */
    readonly attack: number;
    /** 武器比率 P_A。 */
    readonly weaponRatio: number;
    /** 基础防御力 A_D。 */
    readonly defense: number;
    /** 防具比率 P_D。 */
    readonly armorRatio: number;
    /** 已装备武器定义（用到其 `mass`、攻击比率 W_A 与 `penetration` 表）；未装备武器时为 `null`。 */
    readonly weapon: IWeaponDef | null;
    /** 全部已装备防具定义（每个生成一个绑定其 `ArmorKind` 的防具碰撞体，D-13/OQ-4）；未装备防具时为空数组。 */
    readonly armors: readonly IArmorDef[];
}

/**
 * 单位在物理世界中的运动学读数：供操控（Phase 3）与渲染（Phase 5）消费的纯数值。
 */
export interface IUnitState {
    /** 位置的 x 坐标（米）。 */
    readonly x: number;
    /** 位置的 y 坐标（米）。 */
    readonly y: number;
    /** 朝向角（弧度）。 */
    readonly angle: number;
    /** 线速度的 x 分量（米/秒）。 */
    readonly vx: number;
    /** 线速度的 y 分量（米/秒）。 */
    readonly vy: number;
    /** 角速度（弧度/秒）。 */
    readonly angularVelocity: number;
}

/**
 * 一次带部位标记的类型化碰撞事件（PHYS-02）。
 * `A`/`B` 两侧是**无序**的，并不区分攻方/守方；仅在接触 `started` 转变时发出（D-08）。
 * 同一单位自身多个碰撞体之间不会产生事件（Rapier 宽相不会为同一刚体的碰撞体配对），
 * 因此两侧必属于不同单位。
 */
export interface IContactEvent {
    /** A 侧所属单位 id。 */
    readonly unitAId: number;
    /** A 侧被触碰的碰撞体部位。 */
    readonly partA: ColliderPart;
    /** B 侧所属单位 id。 */
    readonly unitBId: number;
    /** B 侧被触碰的碰撞体部位。 */
    readonly partB: ColliderPart;
}

/**
 * 一次带部位标记的类型化伤害事件，携带**最终数值**（D-09/D-14；OQ-3 RESOLVED）。
 * 物理层只计算并发出此事件；把伤害应用回 `Unit`（`takeDamage` / `gainAttackExperience` /
 * `gainDefenseExperience`）由调用方完成。
 * 缺失的**字面量**字段（`weaponKind?`/`armorKind?`）用可选 / `undefined`，绝不用 `null` 联合。
 */
export interface IDamageEvent {
    /** 攻方单位 id（武器所属单位）。 */
    readonly attackerId: number;
    /** 守方单位 id（被击中单位）。 */
    readonly defenderId: number;
    /** 攻方碰撞体部位（恒为 `ColliderPart.Weapon`）。 */
    readonly attackerPart: ColliderPart;
    /** 守方被击中的碰撞体部位（`ColliderPart.Body` 或 `ColliderPart.Armor`）。 */
    readonly defenderPart: ColliderPart;
    /** 攻方武器种类；缺失时为 `undefined`。 */
    readonly weaponKind?: WeaponKind;
    /** 守方被击中防具的种类；击中本体（不触发减伤）时为 `undefined`。 */
    readonly armorKind?: ArmorKind;
    /** 碰撞法向相对速度差 Δv（米/秒），取自碰撞前速度与接触法向。 */
    readonly deltaV: number;
    /** 抖动前的伤害均值 D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0]。 */
    readonly damageMean: number;
    /** 最终施加的伤害 D（抖动后、减伤后）。 */
    readonly damage: number;
    /** 防具减伤量 ΔD；击中本体时为 0。 */
    readonly damageReduced: number;
}

/**
 * 一次 tick 的返回值（PHYS-02/03）：该步内产生的两类类型化事件。
 * 伤害事件要求至少一侧为 `Weapon` 碰撞体且双方属于不同单位
 * （武器↔武器、本体↔本体不产生伤害，D-13）。
 */
export interface IPhysicsTickResult {
    /** 本步产生的全部带部位标记碰撞事件。 */
    readonly contacts: readonly IContactEvent[];
    /** 本步产生的全部带部位标记伤害事件。 */
    readonly damages: readonly IDamageEvent[];
}

/**
 * 可校准的几何尺寸（D-06）：单位=圆、武器=细长 capsule、防具=环绕圆。
 * 具体数值集中在 Wave-2 的物理常量文件（顶层 `const` + JSDoc），此处只声明形状。
 */
export interface IPhysicsGeometry {
    /** 本体圆的半径（米）。 */
    readonly bodyRadius: number;
    /** 武器 capsule 的半长（米）。 */
    readonly weaponHalfLength: number;
    /** 武器 capsule 的半径（米）。 */
    readonly weaponRadius: number;
    /** 武器局部原点相对本体中心的 x 偏移（米）。 */
    readonly weaponOffsetX: number;
    /** 防具圆的半径（米）。 */
    readonly armorRadius: number;
}

/**
 * 物理世界的构造参数。
 */
export interface IPhysicsConfig {
    /** 固定仿真步长（秒）；生产值为锁定的 1/60（D-10），与渲染解耦。 */
    readonly dt: number;
    /** 几何尺寸（D-06）。 */
    readonly geometry: IPhysicsGeometry;
}

/**
 * 物理系统契约（D-07）：拥有 Rapier world、按 id 注册单位、并在 `tick()` 中
 * 发出带部位标记的类型化事件。物理层只持有 id 与数值，不拥有、不引用 `Unit`。
 * 有意不包含战斗触发/结算（`IBattleSim`）——那属于 Phase 4（王国系统）。
 */
export interface IPhysicsWorld {
    /** 注册一个单位：创建**一个**复合刚体（本体/武器/防具碰撞体，各自质量与固定局部偏移，D-03/D-05）并索引其全部碰撞体 handle。 */
    registerUnit(spec: IUnitPhysicsSpec): void;
    /** 移除单位：删除其刚体与全部碰撞体，并清除该单位在各 handle 映射中的所有条目（handle 复用风险）。 */
    removeUnit(unitId: number): void;
    /** 该单位是否已注册。 */
    hasUnit(unitId: number): boolean;
    /** 对本单位施加线力（操控系统的线性执行器，Phase 3）。 */
    applyForce(unitId: number, forceX: number, forceY: number): void;
    /** 对本单位施加力矩（操控系统的转动执行器）。 */
    applyTorque(unitId: number, torque: number): void;
    /** 读取本单位的运动学读数；未知 id 返回 `null`（缺失对象 → `null`）。 */
    getUnitState(unitId: number): IUnitState | null;
    /** 推进恰好一个固定步长并返回本步的类型化事件（D-10）。 */
    tick(): IPhysicsTickResult;
    /** 释放 Rapier world 与事件队列。 */
    dispose(): void;
}
