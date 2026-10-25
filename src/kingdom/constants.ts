/**
 * 王国层的数值常量：地图、时间、行军、战斗、回血、训练、驻扎与边界墙。
 * 本文件是王国数值的唯一调参入口——改动一行即改动一个行为参数；
 * 全部为类型化顶层 `const` + JSDoc（AGENTS §6），不使用 JSON 数据文件，不使用工厂函数。
 * 固定步长 `DT` 继续来自 `@/physics/constants`，此处**不重复声明**（D-07/D-09/D-10）。
 */

import type { IUnitAction } from '@/control/types';

/**
 * 地图宽度（米）：规格的 1000×1000 地图（KING-01/D-28）；可校准。
 */
export const MAP_WIDTH = 1000;

/**
 * 地图高度（米）：规格的 1000×1000 地图（KING-01/D-28）；可校准。
 */
export const MAP_HEIGHT = 1000;

/**
 * 战斗进行中每个外层 tick 的游戏分钟数（D-07/D-09）：有任一活跃战斗即 1×。
 * 可校准，但改变会改变所有战略计时的观测节奏。
 */
export const BATTLE_TICK_MINUTES = 1;

/**
 * 无战斗时每个外层 tick 的游戏分钟数（D-07/D-09）：24× 快进。
 * 可校准，但改变会改变所有战略计时的观测节奏（Pitfall 17）。
 */
export const PEACE_TICK_MINUTES = 24;

/**
 * 战后余韵的 1× 外层 tick 数（D-07）：最后一场战斗结束后仍按
 * `BATTLE_TICK_MINUTES` 推进这么多 tick，让观众看清战果（30 fps 下约 3 s）。
 * 只按 tick 计数，绝不读墙钟；可校准。
 */
export const POST_BATTLE_HOLD_TICKS = 90;

/**
 * 战后镜头拉远占用的 1× 外层 tick 数（D-07/D-15）：紧跟 `POST_BATTLE_HOLD_TICKS`
 * 之后、仍不进入 `PEACE_TICK_MINUTES` 的那一段，与 `Camera` 的退出拉远
 * （`panFrames = 24`，0.8 s）同步。可校准；改动须与渲染配置保持一致。
 */
export const POST_BATTLE_PULLBACK_TICKS = 24;

/**
 * 一小时的分钟数：把「每小时」规格值换算成按游戏分钟累计的量。
 * 规格固定值，不可校准。
 */
export const MINUTES_PER_HOUR = 60;

/**
 * 军队中心的行军速度（米/小时）：规格的 10 m/h（D-12/KING-01）。
 * 中心每个游戏分钟恰好前进 1/6 米（Pitfall 5：绝不按 24× 放大位移）。
 */
export const ARMY_SPEED_METERS_PER_HOUR = 10;

/**
 * 行军阵型圆盘半径（米）：单位聚集在中心 25 m 圆内（D-12/KING-03）；可校准。
 */
export const ARMY_FORMATION_RADIUS = 25;

/**
 * 军队视野半径（米）：视野查询按军队中心展开（D-25/KING-04）；可校准。
 */
export const ARMY_VISION_RADIUS = 100;

/**
 * 城池视野半径（米）：视野查询按城池点展开（D-25/KING-04）；可校准。
 */
export const CITY_VISION_RADIUS = 150;

/**
 * 战斗触发距离（米）：军队中心间、军队中心至城池点小于该值即触发（D-16）。
 * 同时是重战锁定的解锁阈值：必须严格大于它才重新武装（D-05）；可校准。
 */
export const BATTLE_TRIGGER_DISTANCE = 80;

/**
 * 战斗区半边长（米）：规格的 80 m 正方形即 40（D-17/KING-06）；可校准。
 */
export const BATTLE_AREA_HALF_EXTENT = 40;

/**
 * 战斗区迟滞（米）：离区判定用 `halfExtent + hysteresis`，抑制中心重算抖动
 * （D-14/research Pitfall 6）；可校准（本阶段锁定 1）。
 */
export const BATTLE_AREA_HYSTERESIS = 1;

/**
 * 新战斗的参与宽限期（战斗子步数，战斗中一个子步恰为一游戏分钟）：
 * 触发距离（80 m）与成员正方形（40 m）不同，任一方可能晚几个子步才进入区内。
 * 战斗只有在**全部期望阵营**都加入过、或宽限期耗尽后才可能结算；
 * 宽限期内的零成员触发不会被误判为幽灵战斗。可校准。
 */
export const BATTLE_JOIN_GRACE_TICKS = 15;

/**
 * 单边战斗结束的防抖窗口（战斗子步数，战斗中一个子步恰为一游戏分钟）：
 * 全部期望阵营都曾加入过之后，若区内只剩一个阵营，必须**连续**这么多个子步
 * 都仍是单边才结束战斗；任一子步重新出现两个阵营即清零重计。
 * 这是为了不让单位在正方形边界上的一次抖动直接终结一场双方仍在互砍的战斗。
 * 全员死亡 / 全员离区的结束不走该窗口，仍然立即生效。可校准。
 */
export const BATTLE_END_DEBOUNCE_TICKS = 10;

/**
 * 单位初始聚集环半径（米）：让同军单位出生时不重叠；远小于阵型半径。
 * 场景校验要求每个出生点/城池点的该半径圆盘完整位于地图内且不压地形。
 */
export const SPAWN_RING_RADIUS = 4;

/**
 * 行军回血速度（点/小时）：按游戏时间累计（D-13/KING-03）；可校准。
 * 实际回血由 plan 04-04 经 G-1 的 `IHealableUnit.heal` 接入。
 */
export const MARCH_HEAL_PER_HOUR = 1;

/**
 * 城池驻扎回血速度（点/小时）：按游戏时间累计（D-13/KING-05）；可校准。
 */
export const GARRISON_HEAL_PER_HOUR = 2;

/**
 * 普通城训练一个单位所需的游戏小时数（D-23/KING-05）；可校准。
 */
export const TRAINING_HOURS_NORMAL = 96;

/**
 * 主城训练一个单位所需的游戏小时数（D-23/KING-05）；可校准。
 */
export const TRAINING_HOURS_CAPITAL = 72;

/**
 * 普通城的默认驻军上限（单位数，D-23）；可校准。
 * 场景可经 `ICitySpawnSpec.garrisonCap` 覆盖。
 */
export const GARRISON_CAP_NORMAL = 10;

/**
 * 主城的默认驻军上限（单位数，D-23）；可校准。
 * 场景可经 `ICitySpawnSpec.garrisonCap` 覆盖。
 */
export const GARRISON_CAP_CAPITAL = 20;

/**
 * 默认驻军比例（D-22）：战后按存活单位的 25 % 留驻；可校准。
 * 至少留 1 个、且不超过城池驻军上限。
 */
export const DEFAULT_GARRISON_RATIO = 0.25;

/**
 * 行军 AI 的接近增益（1/秒）：期望速度 = 槽位距离 × 该增益，再截到最大速度。
 * 可校准（门禁校准值 2）。
 */
export const MARCH_APPROACH_GAIN = 2;

/**
 * 行军 AI 的最大期望速度（米/秒）：槽位较远时的速度上限；可校准（门禁校准值 12）。
 */
export const MARCH_MAX_SPEED = 12;

/**
 * 行军 AI 的避障触发距离（米）：射线命中近于该值时产生排斥；可校准（门禁校准值 6）。
 */
export const MARCH_AVOID_DISTANCE = 6;

/**
 * 行军 AI 的避障强度：最近命中产生的最大排斥权重；可校准（门禁校准值 0.5）。
 */
export const MARCH_AVOID_STRENGTH = 0.5;

/**
 * 行军 AI 的朝向 PD 比例增益（复用默认 AI 的 6）；可校准。
 */
export const MARCH_ANGULAR_GAIN = 6;

/**
 * 行军 AI 的朝向 PD 微分阻尼（复用默认 AI 的 2）；可校准。
 */
export const MARCH_ANGULAR_DAMPING = 2;

/**
 * 离区刹车 AI 的线性增益（1/秒）：`force = −velocity · mass · gain`；可校准（门禁校准值 6）。
 */
export const BRAKE_LINEAR_GAIN = 6;

/**
 * 离区刹车 AI 的角速度比例增益；可校准（门禁校准值 6）。
 */
export const BRAKE_ANGULAR_GAIN = 6;

/**
 * 离区刹车 AI 的角速度微分阻尼；可校准（门禁校准值 2）。
 */
export const BRAKE_ANGULAR_DAMPING = 2;

/**
 * 离区刹车的最短持续游戏分钟数（D-14）：等于一个控制决策间隔
 * `DECISION_INTERVAL_TICKS = 6` 在「1 游戏分钟 / 控制 tick」下的时长，
 * 保证 `BrakeAI` 至少被真正决策一次，不会被立刻换回 `MarchAI`。可校准。
 */
export const BRAKE_MIN_MINUTES = 6;

/**
 * 地图边界墙的厚度（米，G-2/D-27）：静态障碍矩形向地图外侧延伸的宽度；可校准。
 * 实际墙体由 plan 04-04 经 `IStaticObstacleWorld` 添加。
 */
export const BOUNDARY_WALL_THICKNESS = 10;

/**
 * 地图边界墙的数量（四面：上/下/左/右，G-2/D-27）；规格固定值。
 */
export const DEFAULT_BOUNDARY_WALL_COUNT = 4;

/**
 * 单个场景允许的最大单位数（ASVS V5 输入上限）；可校准。
 */
export const MAX_SCENARIO_UNITS = 1000;

/**
 * 单个场景允许的最大军队数（ASVS V5 输入上限）；可校准。
 */
export const MAX_SCENARIO_ARMIES = 200;

/**
 * 共享全零动作：任何 AI 的安全回退（不施力、不施力矩、无技能意图）。
 * 冻结对象——`IUnitAction` 全字段只读，复用可避免每次决策分配（Pitfall 3：零力不唤醒睡眠刚体）。
 */
export const ZERO_ACTION: IUnitAction = {
    forceUp: 0,
    forceDown: 0,
    forceLeft: 0,
    forceRight: 0,
    torqueClockwise: 0,
    torqueCounterClockwise: 0,
    skillIntent: null
};
