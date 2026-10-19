/**
 * 操控系统的全部类型声明：数字枚举 + `I*` 接口（外加唯一类型别名 `SkillIntent`）。
 * 本文件只含声明，不含任何算法、Rapier 调用、类或顶层 `const`。
 * 装备/简讯字段复用 Phase 1 已冻结的类型；运动读数复用 Phase 2 的 `IUnitState`
 * （仅类型引用，不重声明、不扩展 `IPhysicsWorld`）。
 */

import type { IDamageEvent, IUnitState } from '@/physics/types';
import type {
    AttributeKind,
    ClassKind,
    IEquipment,
    IUnit,
    SkillKind,
    WeaponKind
} from '@/units/types';

/**
 * 技能意图的判别式：区分武器技能与单位技能。
 * 成员一律为整数——本项目强制使用数字枚举（禁止字符串枚举）。
 */
export enum SkillIntentKind {
    /** 武器技能意图（如 `WeaponKind.Bow` 的射箭）。 */
    Weapon = 0,
    /** 单位技能意图（`SkillKind.ArrowStorm` / `Charge` / `Spin`）。 */
    Unit = 1
}

/**
 * 单个邻近单位的简讯（D-03）。
 * 感知层按距离升序排列、仅包含存活单位、每类最多 16 个。
 * 本接口只含文档明确字段（不含速度/职业/朝向）；后续新增字段必须声明为
 * **可选成员**，以保证既有 AI 实现继续编译。
 */
export interface IUnitBrief {
    /** 单位 id。 */
    readonly unitId: number;
    /** 当前生命值。 */
    readonly health: number;
    /** 等级。 */
    readonly level: number;
    /** 位置的 x 坐标（米）。 */
    readonly x: number;
    /** 位置的 y 坐标（米）。 */
    readonly y: number;
    /** 当前装备列表（只读快照）。 */
    readonly equipment: readonly IEquipment[];
}

/**
 * 一次射弹感知（D-04）：预留的最小射弹条目，只提供位置与距离。
 * 采用与邻居相同的 50m 最远距离规则。
 * Phase 3 恒返回空数组；后续射弹系统出现时填充，不改变本契约。
 */
export interface IProjectileSighting {
    /** 射弹位置的 x 坐标（米）。 */
    readonly x: number;
    /** 射弹位置的 y 坐标（米）。 */
    readonly y: number;
    /** 射弹到感知单位的距离（米），上限 50m。 */
    readonly distance: number;
}

/**
 * 传给射线查询的单位障碍事实（D-02）。
 * 感知层只传入**敌方**单位：友方单位在结构上永远不会成为射线障碍；
 * 地图边界与预留障碍的几何由世界实现自身提供。
 */
export interface ISensedUnit {
    /** 单位 id。 */
    readonly unitId: number;
    /** 所属阵营 id。 */
    readonly teamId: number;
    /** 位置的 x 坐标（米）。 */
    readonly x: number;
    /** 位置的 y 坐标（米）。 */
    readonly y: number;
    /** 本体碰撞半径（米）。 */
    readonly radius: number;
}

/**
 * 操控层自有的环境感知接缝（D-01/D-02/D-04），**不是** `IPhysicsWorld` 的扩展。
 * 由 Phase 3 的测试竞技场与 Phase 4 的王国世界分别实现。
 */
export interface ISensingWorld {
    /**
     * 以 `(originX, originY)` 为原点投射 64 条**世界坐标固定方向**的射线
     * （不随本体旋转）；每条射线的最远距离为 `maxDistance`。
     * 结果数组恰为 64 个距离，每个值位于 `[0, maxDistance]`；未命中时为 `maxDistance`。
     * 命中集合 = 世界自身的边界/预留障碍几何 + 传入的敌方 `blockers`。
     */
    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[];
    /**
     * 查询半径 `radius` 内、最远 50m 的射弹；Phase 3 恒为空数组。
     */
    queryProjectiles(
        x: number,
        y: number,
        radius: number
    ): readonly IProjectileSighting[];
}

/**
 * 每次 AI 决策的输入：一份**纯数据快照**（D-05）。
 * 不携带 `IUnit` 的可变引用、不携带 Rapier 对象、不携带 `IPhysicsWorld`，
 * 因此可替换、可单测、可序列化。阵营分类由感知层完成（D-08），AI 只读结果。
 */
export interface IUnitObservation {
    /** 自身单位 id。 */
    readonly unitId: number;
    /** 当前绝对 tick 序号：AI 据此按 tick 计数冷却，不依赖 wall-clock。 */
    readonly tick: number;
    /** 自身属性读数，覆盖每一个 `AttributeKind`。 */
    readonly attributes: Readonly<Record<AttributeKind, number>>;
    /** 自身职业。 */
    readonly classKind: ClassKind;
    /** 自身当前装备列表（只读快照）。 */
    readonly equipment: readonly IEquipment[];
    /** 自身已解锁的技能列表。 */
    readonly skills: readonly SkillKind[];
    /** 自身运动状态（Phase 2 冻结的纯数值读数）。 */
    readonly motion: IUnitState;
    /**
     * 64 条世界坐标固定方向射线的最远命中距离（米），
     * 恰好 64 个条目，每个值位于 `[0, 50]`。
     */
    readonly rayDistances: readonly number[];
    /** 已按距离升序、仅存活、最多 16 个的敌方简讯（由感知层分类）。 */
    readonly enemies: readonly IUnitBrief[];
    /** 已按距离升序、仅存活、最多 16 个的友方简讯（由感知层分类）。 */
    readonly allies: readonly IUnitBrief[];
    /** 附近射弹列表；Phase 3 恒为空数组。 */
    readonly projectiles: readonly IProjectileSighting[];
}

/**
 * 武器技能意图（D-17）：使用某件已装备武器的特殊能力。
 */
export interface IWeaponSkillIntent {
    /** 判别式：武器技能。 */
    readonly kind: SkillIntentKind.Weapon;
    /** 施放该技能的单位 id。 */
    readonly unitId: number;
    /** 使用其特殊能力的武器种类（如 `WeaponKind.Bow`）。 */
    readonly weapon: WeaponKind;
}

/**
 * 单位技能意图（D-17）：施放一个已解锁的具名技能。
 */
export interface IUnitSkillIntent {
    /** 判别式：单位技能。 */
    readonly kind: SkillIntentKind.Unit;
    /** 施放该技能的单位 id。 */
    readonly unitId: number;
    /** 要施放的技能（`ArrowStorm` / `Charge` / `Spin` 之一）。 */
    readonly skill: SkillKind;
}

/**
 * 技能意图：以 `kind` 判别的联合类型（D-17）。
 * Phase 3 只表达意图与冷却，不实现射弹/冲锋位移/旋转等技能物理。
 */
export type SkillIntent = IWeaponSkillIntent | IUnitSkillIntent;

/**
 * 每次决策的 AI 输出（D-13）：世界坐标四向力 + 两个方向的力矩 + 技能意图。
 */
export interface IUnitAction {
    /** 向上（世界 +y）的力大小：非负标量。 */
    readonly forceUp: number;
    /** 向下（世界 -y）的力大小：非负标量。 */
    readonly forceDown: number;
    /** 向左（世界 -x）的力大小：非负标量。 */
    readonly forceLeft: number;
    /** 向右（世界 +x）的力大小：非负标量。 */
    readonly forceRight: number;
    /** 顺时针力矩大小：非负标量。 */
    readonly torqueClockwise: number;
    /** 逆时针力矩大小：非负标量。 */
    readonly torqueCounterClockwise: number;
    /**
     * 本决策 tick 要施放的技能意图；不施放技能时为 `null`（缺失对象 → `null`）。
     * 技能意图只在决策 tick 触发一次，不随动作重复施加。
     */
    readonly skillIntent: SkillIntent | null;
}

/**
 * 单个单位的 AI（D-05/D-11/D-14）：每个单位一个实例，决策是快照上的纯函数。
 * 动作由控制层保持并在每个物理 tick 重新施加（物理层每 tick 后清空力/力矩）。
 * 合成规则：`fx = forceRight − forceLeft`、`fy = forceUp − forceDown`、
 * `torque = torqueCounterClockwise − torqueClockwise`（Rapier 正力矩 = 逆时针）。
 */
export interface IUnitAI {
    /** 基于输入快照选择动作；只做选择，不直接驱动物理。 */
    decide(observation: IUnitObservation): IUnitAction;
}

/**
 * 唯一的 AI 可插拔接缝（D-11/D-18）：按单位创建/销毁 AI 实例。
 * `create` 同时拿到 `unitId` 与冻结的 `IUnit`，使未来的 Provider 能依据
 * `AttributeKind.ControlLevel` 选择实现，而不必改动物理层或循环。
 */
export interface IUnitAIProvider {
    /** 为一个单位创建 AI 实例；`unit` 仅用于构造期读取（如控制等级）。 */
    create(unitId: number, unit: IUnit): IUnitAI;
    /** 释放该单位的 AI 实例及其内部状态（目标、冷却、行为树状态）。 */
    destroy(unitId: number): void;
}

/**
 * 感知接缝（D-01/D-05/D-08）：拼装每次决策的纯数据快照。
 * 由感知器（而非 AI）按 `teamId` 完成敌我分类。
 */
export interface ISensor {
    /**
     * 为单位 `unitId` 组装快照；单位或其运动读数不可用时返回 `null`
     * （缺失对象 → `null`，与 `getUnitState` 一致）。
     */
    sense(unitId: number): IUnitObservation | null;
}

/**
 * 单位目录的只读路径（D-07/D-08）：感知器与测试所需的最小读取面，
 * 属于必要能力而非额外的定制点。
 */
export interface IUnitCatalog {
    /** 按 id 读取单位；不存在时返回 `null`（缺失对象 → `null`）。 */
    getUnit(unitId: number): IUnit | null;
    /** 按 id 读取阵营；不存在时返回 `undefined`（缺失字面量 → `undefined`）。 */
    getTeam(unitId: number): number | undefined;
    /** 列出当前全部已注册单位 id。 */
    listUnitIds(): readonly number[];
}

/**
 * 交给伤害接收方的一次已解析伤害上下文（D-09/D-10）。
 * 控制层完成 id → `IUnit` 与 id → `teamId` 的解析，使接收方无需接触目录。
 */
export interface IDamageContext {
    /** Phase 2 冻结的原始伤害事件（携带最终数值）。 */
    readonly event: IDamageEvent;
    /** 攻方单位。 */
    readonly attacker: IUnit;
    /** 守方单位。 */
    readonly defender: IUnit;
    /** 攻方阵营 id。 */
    readonly attackerTeamId: number;
    /** 守方阵营 id。 */
    readonly defenderTeamId: number;
}

/**
 * 可注入的战斗规则边界（D-09/D-10）。
 * Phase 3 的测试胶合层在此实现「同队免伤 + `takeDamage` + 攻击/防御/击杀经验」，
 * Phase 4 可替换为真实战斗结算；`IControlSystem` 只路由事件，不拥有战斗规则。
 */
export interface IDamageSink {
    /** 应用一条已解析的伤害。 */
    applyDamage(context: IDamageContext): void;
}

/**
 * 注册一个单位到操控系统（D-06/D-07）：绑定 `unitId ↔ IUnit ↔ teamId` 并给出出生位置。
 * Round 2 会由 `unit` 的属性与装备构造 `IUnitPhysicsSpec` 注册进冻结的物理世界；
 * `teamId` 在此注入，绝不写回 `IUnit`。
 */
export interface IControlUnitRegistration {
    /** 单位 id。 */
    readonly unitId: number;
    /** 冻结的单位实例。 */
    readonly unit: IUnit;
    /** 注入的阵营 id（按相等判断敌我）。 */
    readonly teamId: number;
    /** 出生位置的 x 坐标（米）。 */
    readonly x: number;
    /** 出生位置的 y 坐标（米）。 */
    readonly y: number;
}

/**
 * 一次控制 tick 的返回值（D-12/D-17）：决策 tick 上收集到的技能意图。
 * 非决策 tick 为空数组；冷却状态保存在 AI 实例内，故这是技能意图离开循环的唯一通道。
 */
export interface IControlTickResult {
    /** 本次 tick 产生的技能意图（无则为空数组）。 */
    readonly skillIntents: readonly SkillIntent[];
}

/**
 * 操控系统契约（D-06/D-07/D-09/D-10/D-11/D-12/D-13/D-19）：
 * 注册/移除单位、驱动决策并执行动作、把物理伤害路由给 `IDamageSink`。
 * 它检测并处理死亡单位，但**不拥有**战斗规则；注册快照保持冻结（WR-01 已接受）。
 */
export interface IControlSystem extends IUnitCatalog {
    /** 注册一个单位：绑定阵营、构造物理规格并创建该单位的 AI 实例。 */
    registerUnit(request: IControlUnitRegistration): void;
    /** 移除一个单位：销毁 AI 实例、从目录移除并删除其物理刚体。 */
    unregisterUnit(unitId: number): void;
    /** 预留的运行时阵营更新入口（Phase 4 城池易手/转阵营）；Phase 3 不调用。 */
    updateTeam(unitId: number, teamId: number): void;
    /**
     * 推进一个控制 tick，按 **6-tick (0.1 s) cadence** 决策：
     * 决策发生在绝对 tick **0/6/12**…（以 tick 计数，不用 wall-clock）；
     * 决策先于执行——决策 tick 上先取得新动作，再从该 tick 起持续施加，
     * 其余物理 tick 重复施加保持中的动作，随后步进物理并把伤害路由给接收方。
     */
    tick(): IControlTickResult;
    /** 释放全部 AI 实例与内部状态。 */
    dispose(): void;
}
