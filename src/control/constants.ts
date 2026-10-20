/**
 * 操控系统的数值常量：决策节奏、感知上限、执行器钳制与默认 AI 参数。
 * 本文件是操控数值的唯一调参入口——改动一行即改动一个行为参数；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 * 固定步长 `DT` 继续来自 `@/physics/constants`，此处**不重复声明**。
 */

/**
 * 决策间隔（控制 tick 数）：每 6 个 tick（0.1 s）决策一次（D-12/CTRL-03）。
 * 节奏以 tick 计数，绝不使用 wall-clock 或帧间隔；可校准（本阶段锁定 6）。
 */
export const DECISION_INTERVAL_TICKS = 6;

/**
 * 射线扇的数量：每次决策恰好 64 条世界坐标固定方向射线（D-02/CTRL-01）。
 * 可校准，但改变会改变所有 AI 的空间输入。
 */
export const RAY_COUNT = 64;

/**
 * 感知射线的最大距离（米）：超出的命中按该值截断（D-02）。
 * 可校准，与规格的 50 m 视野一致。
 */
export const SENSING_MAX_DISTANCE = 50;

/**
 * 每类邻居简讯的上限：最多 16 个敌方与 16 个友方（D-03/CTRL-01）。
 * 可校准，但改变会影响 AI 的局部战场感知成本。
 */
export const MAX_NEIGHBORS = 16;

/**
 * 邻居查询半径（米）：只收集该半径内的存活单位，再按距离取最近的 16 个（A6）。
 * 可校准的起始值，需实测校准；过小会漏掉「最近 16」。
 */
export const NEIGHBOR_QUERY_RADIUS = 100;

/**
 * 单个方向的力大小上限（N）：AI 输出经校验后每分量不超过该值（ASVS V5）。
 * 可校准的防御性上限，防止插件把单位弹出世界。
 */
export const MAX_FORCE_MAGNITUDE = 5000;

/**
 * 力矩大小上限（N·m）：AI 输出经校验后不超过该绝对值（ASVS V5）。
 * 可校准的防御性上限。
 */
export const MAX_TORQUE_MAGNITUDE = 2000;

/**
 * 判定「零力/零力矩」的阈值：低于该值时跳过 `applyForce`/`applyTorque`，
 * 避免零力唤醒睡眠刚体（research Pitfall 3）。取极小正数。
 */
export const FORCE_EPSILON = 1e-9;

/**
 * 测试竞技场的默认半边长（米）：`ArenaSensingWorld` 的矩形边界为 `[-h, h]²`。
 * 仅供测试夹具与默认值使用，可校准。
 */
export const ARENA_DEFAULT_HALF_EXTENT = 50;

/**
 * 默认 AI 的接近目标速度（米/秒）：尚未进入攻击距离时的期望线速度。
 * 可校准；默认 AI 只用于验证自主运行（D-16）。
 */
export const DEFAULT_AI_APPROACH_SPEED = 6;

/**
 * 默认 AI 的攻击目标速度（米/秒）：进入攻击距离后加速冲撞的期望线速度。
 * 可校准；伤害来自物理碰撞，而非额外的攻击字段。
 */
export const DEFAULT_AI_ATTACK_SPEED = 12;

/**
 * 默认 AI 的撤退目标速度（米/秒）：低生命时远离最近敌人的期望线速度。
 * 可校准。
 */
export const DEFAULT_AI_RETREAT_SPEED = 7;

/**
 * 默认 AI 的速度误差线性增益：`force = (vDesired − vCurrent) · Mass · gain`。
 * Rapier 无默认阻尼，必须用速度误差控制才能停住（research Pitfall 2）。可校准。
 */
export const DEFAULT_AI_LINEAR_GAIN = 4;

/**
 * 默认 AI 的朝向 PD 比例增益：`torque = gain · angleError − damping · ω`。
 * 可校准。
 */
export const DEFAULT_AI_ANGULAR_GAIN = 6;

/**
 * 默认 AI 的朝向 PD 微分阻尼：抑制角速度振荡。可校准。
 */
export const DEFAULT_AI_ANGULAR_DAMPING = 2;

/**
 * 默认 AI 的攻击距离（米）：中心距不超过该值时切换到冲撞速度。
 * 可校准（略大于本体直径，使冲撞在接触前后发生）。
 */
export const DEFAULT_AI_ATTACK_RANGE = 2;

/**
 * 默认 AI 的技能期望距离（米）：进入该距离才考虑输出技能意图（03-03 使用）。
 * 本计划只声明常量，技能选择在 03-03 完成。
 */
export const DEFAULT_AI_SKILL_RANGE = 20;

/**
 * 默认 AI 的低生命阈值（比例）：`Health / MaxHealth` 不超过该值时撤退。
 * 可校准。
 */
export const DEFAULT_AI_LOW_HEALTH_RATIO = 0.25;

/**
 * 弓箭射击间隔（控制 tick 数）：规格的 1 s 对应 60 tick（D-17）。
 * 本计划只声明常量，冷却逻辑在 03-03 完成；可校准。
 */
export const BOW_SHOT_INTERVAL_TICKS = 60;

/**
 * 万箭齐发冷却（控制 tick 数）：规格的 5 s 对应 300 tick（D-17）。
 * 本计划只声明常量，冷却逻辑在 03-03 完成；可校准。
 */
export const ARROW_STORM_COOLDOWN_TICKS = 300;

/**
 * 冲锋冷却（控制 tick 数）：规格的 7 s 对应 420 tick（D-17）。
 * 本计划只声明常量，冷却逻辑在 03-03 完成；可校准。
 */
export const CHARGE_COOLDOWN_TICKS = 420;

/**
 * 旋转冷却（控制 tick 数）：规格的 6 s 对应 360 tick（D-17）。
 * 本计划只声明常量，冷却逻辑在 03-03 完成；可校准。
 */
export const SPIN_COOLDOWN_TICKS = 360;
