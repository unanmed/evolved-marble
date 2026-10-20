/**
 * 王国系统的全部类型声明：7 个数字枚举、世界/时间/势力/军队/城池/战斗契约、
 * 可注入策略接缝、场景表，以及 Round 2 使用的内部可变视图。
 * 本文件只含声明（枚举、接口与函数类型别名），不含任何算法、物理调用、类型实现或顶层 `const`。
 * 所有上游引用均为 `import type`，依赖方向始终是 kingdom → units/physics/control，绝不反向。
 */

import type { IUnitBrief } from '@/control/types';
import type { ClassKind, IUnit } from '@/units/types';

/** 军队的宏观状态；军队不是物理实体，也不是战斗层实体（D-01）。 */
export enum ArmyState {
    /** 正在行军：中心按固定速度移动，单位追阵型槽位（D-12）。 */
    Marching = 0,
    /** 驻扎在城池中：中心固定，单位待命，回血按游戏时间累计（D-13/D-26）。 */
    Garrisoned = 1,
    /** 军队位于战斗区内、已有单位在交战（D-14）。 */
    InBattle = 2,
    /** 战斗结束后幸存单位重新集结：中心重算，随后恢复行军（D-20）。 */
    Reorganizing = 3,
    /**
     * 交战增援（D-02/D-04/D-12/D-14）：军队至少有一个单位被卷入战斗；
     * 中心/阵型以 10 m/h 继续朝该战场中心移动，单位保持 25 m 圆内聚集，
     * 并在进入 80 m 战斗区时逐个加入战斗——军队**永不冻结**，其余单位不会被抛下。
     */
    Engaging = 4
}

/**
 * 单位级控制模式：这是**王国层自己的标签**，表示它为某个单位安装了哪个 AI 实例，
 * 任何 AI 都不读取该值（D-11/D-14）。Round 2 的 World 维护每单位模式映射，
 * 按模式创建对应的 `MarchAI`/`BattleAI`/`BrakeAI`/`IdleAI`，
 * 并在模式变化时调用 `IControlSystem.setUnitAI` 完成切换。
 */
export enum UnitControlMode {
    /** 程序阵型控制：追阵型槽位并轻微避障（MarchAI）。 */
    March = 0,
    /** 战斗 AI：只把本战斗区内的敌人作为目标（BattleAI）。 */
    Battle = 1,
    /** 离区刹车：逐渐停止，不再决策也不再结算伤害（BrakeAI）。 */
    Brake = 2,
    /** 驻扎待命：零动作，避免唤醒睡眠刚体（IdleAI）。 */
    Idle = 3
}

/** 指挥官下达给军队的宏观指令种类（D-29）。 */
export enum ArmyOrderKind {
    /** 沿目标点行军；未给目标时保持当前朝向（D-12）。 */
    March = 0,
    /** 向目标城池行军，抵达触发距离后发动城池战斗（D-16/D-21）。 */
    AttackCity = 1,
    /** 返回己方城池并驻扎（D-26）。 */
    Garrison = 2,
    /** 原地待命，中心不再移动（D-29）。 */
    Hold = 3
}

/** 战场生命周期（D-03）。 */
export enum BattleState {
    /** 正在推进。 */
    Active = 0,
    /** 已结束，保留在完成队列中供播放（D-03）。 */
    Ended = 1
}

/** 战场触发来源（D-16）。 */
export enum BattleTriggerKind {
    /** 军队中心到军队中心小于触发距离（D-16）。 */
    Army = 0,
    /** 军队中心到敌方城池点小于触发距离，且该城有真实驻扎的驻军（D-16/D-21）。 */
    City = 1
}

/** 战斗队列事件种类（D-03）；供 Phase 6/7 按发生顺序消费。 */
export enum BattleLifecycleKind {
    /** 战场开始。 */
    Started = 0,
    /** 战场结束；被合并吸收的战场同样发出该事件（D-04）。 */
    Ended = 1
}

/** 城池规模（D-23）；决定训练时长与默认驻军上限。 */
export enum CityKind {
    /** 普通城：每单位训练 96 游戏小时。 */
    Normal = 0,
    /** 主城：每单位训练 72 游戏小时。 */
    Capital = 1
}

/**
 * 二维点/向量（米）。
 * 王国层自有的只读类型，Phase 5 直接复用；仅 kingdom 与渲染消费时不提升到
 * `src/common/`，且全仓库只在此处定义一次（A13/C-4）。
 */
export interface IVec2 {
    /** x 坐标（米）。 */
    readonly x: number;
    /** y 坐标（米）。 */
    readonly y: number;
}

/** 地图尺寸（米）；场景表在构造时提供（D-28）。 */
export interface IMapBounds {
    /** 地图宽度（米）。 */
    readonly width: number;
    /** 地图高度（米）。 */
    readonly height: number;
}

/**
 * 轴对齐矩形地形（D-27）：同时阻挡单位移动（经 G-2 静态障碍接缝）与 64 条感知射线
 * （经 Round 2 的 `ISensingWorld` 实现）。
 * 城池不是地形矩形——城池是地图上的点，无碰撞体也无射线几何（D-26）。
 */
export interface ITerrainRect {
    /** 中心 x 坐标（米）。 */
    readonly x: number;
    /** 中心 y 坐标（米）。 */
    readonly y: number;
    /** 半宽（米）。 */
    readonly halfWidth: number;
    /** 半高（米）。 */
    readonly halfHeight: number;
}

/**
 * 可见军队的简讯（D-25/A21）：**唯一**允许通过视野或指挥官上下文暴露的敌方军队形状。
 * 只承载宏观轮廓——身份、位置、朝向与状态；不含名册访问器，也不含当前指令，
 * 因为敌方单位级细节只经 `IWorld.getVisibleUnitIds` + `IUnitBrief` 暴露。
 * 在此新增任何字段都会扩大每个指挥官（自 Phase 7 起包括 LLM）可获知的信息，
 * 必须与门禁的可见性粒度（A21）一并审查。
 */
export interface IVisibleArmyBrief {
    /** 军队 id。 */
    readonly id: number;
    /** 所属势力 id。 */
    readonly factionId: number;
    /** 军队中心（米）。 */
    readonly center: IVec2;
    /** 朝向角（弧度；0 = +x，逆时针为正）。 */
    readonly heading: number;
    /** 宏观状态。 */
    readonly state: ArmyState;
}

/**
 * 可见城池的简讯（D-25/A21）：**唯一**允许通过视野或指挥官上下文暴露的敌方城池形状。
 * 只承载地图身份——归属与位置；训练职业、训练进度、驻军军队链接与驻军上限留在
 * 上帝视角的 `ICity` 读取面上，指挥官永远看不到。
 */
export interface IVisibleCityBrief {
    /** 城池 id。 */
    readonly id: number;
    /** 归属势力 id；无主城池为 `undefined`（缺失字面量，AGENTS §8）。 */
    readonly factionId: number | undefined;
    /** 城池点位置（米）。 */
    readonly position: IVec2;
    /** 城池规模。 */
    readonly kind: CityKind;
}

/** 势力：拥有军队与城池（KING-08）；其 id 同时作为 Phase 3 注册时的 `teamId`。 */
export interface IFaction {
    /** 势力 id；与 Phase 3 的注册 `teamId` 相等。 */
    getId(): number;
    /** 显示名。 */
    getName(): string;
    /** 当前军队 id 列表；返回只读快照（新数组），不是内部集合。 */
    getArmyIds(): readonly number[];
    /** 当前城池 id 列表；返回只读快照（新数组），不是内部集合。 */
    getCityIds(): readonly number[];
}

/**
 * 军队：只承载宏观状态（中心、朝向、名册、状态、指令）。
 * 它没有刚体，也不参与战斗成员判定——战斗成员是单位 id 集合（D-01/D-02）。
 *
 * 交战增援规则（D-02/D-04/D-12/D-14）：只要任一单位被卷入战斗，军队即进入
 * `ArmyState.Engaging`；其中心/阵型以 10 m/h 朝该战场中心推进，单位保持在 25 m
 * 圆内，并在进入 80 m 战斗区时逐个加入。军队会持续移动，直到全部单位进入或战斗结束——
 * **永不冻结**，其余单位不会被抛下。
 */
export interface IArmy {
    /** 军队 id；跨战斗持久保留（D-05）。 */
    getId(): number;
    /** 所属势力 id。 */
    getFactionId(): number;
    /** 军队中心位置（米）。 */
    getCenter(): IVec2;
    /** 朝向角（弧度；0 = +x，逆时针为正）。 */
    getHeading(): number;
    /** 宏观状态。 */
    getState(): ArmyState;
    /** 当前单位 id 名册的只读快照；死亡单位由 World 剪枝。 */
    getUnitIds(): readonly number[];
    /** 驻扎城池 id；未驻扎时为 `undefined`（缺失字面量，AGENTS §8）。 */
    getGarrisonedCityId(): number | undefined;
    /**
     * 该军队正在增援的活跃战场 id；没有任何单位处于战斗时为 `undefined`
     * （缺失字面量，AGENTS §8）。供 World 与 Phase 5 绘制交战增援。
     */
    getEngagedBattleId(): number | undefined;
    /** 当前宏观指令；无指令时为 `null`（缺失对象，AGENTS §8）。 */
    getOrder(): IArmyOrder | null;
}

/**
 * 城池：地图上的一个点，没有碰撞体、没有射线几何，本身不影响战斗（D-26）。
 * 驻扎是军队的一个状态，而不是城池持有的单位列表；
 * 训练进度按累计游戏分钟计，并在驻军达到上限或正在战斗时暂停（KING-05）。
 */
export interface ICity {
    /** 城池 id。 */
    getId(): number;
    /** 归属势力 id；无主城池为 `undefined`（缺失字面量，AGENTS §8）。 */
    getFactionId(): number | undefined;
    /** 城池点位置（米）。 */
    getPosition(): IVec2;
    /** 城池规模。 */
    getKind(): CityKind;
    /** 当前驻扎军队 id；无驻军时为 `undefined`（缺失字面量，AGENTS §8）。 */
    getGarrisonArmyId(): number | undefined;
    /** 驻军上限（单位数）。 */
    getGarrisonCap(): number;
    /** 训练产出的单位职业。 */
    getTrainingClass(): ClassKind;
    /** 当前训练进度（累计游戏分钟）。 */
    getTrainingProgressMinutes(): number;
}

/**
 * 时间系统：只以**游戏时间**计时，不存在 wall-clock 或帧时间（D-07/D-08）。
 * 倍率一律用普通数字表达（每 tick 的游戏分钟数），**没有倍率枚举**：
 * 战斗进行中为 1，否则为 24；内置值属于 Round 2 的 `constants.ts` 数据。
 * 三个写方法之所以在接口上，是因为 AGENTS §5 不允许接口外的公共成员；
 * 它们只由 `IWorld` 实现调用（C-3/C-17）。
 */
export interface ITimeSystem {
    /** 自开局累计的游戏分钟。 */
    getGameMinutes(): number;
    /** 当前每个外层 tick 覆盖的游戏分钟：战斗中为 1，否则为 24。 */
    getMinutesPerTick(): number;
    /** 外层 tick 序号；只由 `advanceTick` 递增（C-17）。 */
    getTickIndex(): number;
    /** 当前每个外层 tick 的物理子步数（今日为 1 或 24，可独立校准）。 */
    getSubstepsPerTick(): number;
    /** 推进游戏分钟；仅 World 调用。 */
    advance(gameMinutes: number): void;
    /** 结束一个外层 tick 并使 `getTickIndex` 前进一格；仅 World 调用。 */
    advanceTick(): void;
    /** 设置每个外层 tick 的分钟数（内置值 1 / 24）；仅 World 调用。 */
    setMinutesPerTick(minutes: number): void;
}

/** 一场战斗的只读视图：成员是单位 id 集合，不引用军队（D-02/D-17）。 */
export interface IBattle {
    /** 战斗 id；合并时保留较早者（D-04）。 */
    getId(): number;
    /** 生命周期状态。 */
    getState(): BattleState;
    /** 触发来源。 */
    getTriggerKind(): BattleTriggerKind;
    /** 城池战对应的城池 id；军队对军队的战斗为 `undefined`（缺失字面量）。 */
    getCityId(): number | undefined;
    /** 战斗区中心的加权质心（米；D-17/D-18）。 */
    getCenter(): IVec2;
    /** 战斗区半边长（米）；规格的 80 m 正方形即 40。 */
    getHalfExtent(): number;
    /** 当前区内成员单位 id 的只读快照。 */
    getMemberUnitIds(): readonly number[];
    /** 开始时的游戏分钟。 */
    getStartedAtMinutes(): number;
    /** 结束时的游戏分钟；未结束为 `undefined`（缺失字面量）。 */
    getEndedAtMinutes(): number | undefined;
}

/** 战斗队列事件（D-03）；Phase 6/7 按发生顺序消费。 */
export interface IBattleLifecycleEvent {
    /** 事件种类。 */
    readonly kind: BattleLifecycleKind;
    /** 战斗 id。 */
    readonly battleId: number;
    /** 事件发生的游戏分钟。 */
    readonly gameMinutes: number;
    /** 被合并进的战斗 id；仅因合并而结束的 Ended 事件存在（缺失字面量）。 */
    readonly mergedIntoBattleId?: number;
}

/**
 * 战斗容器：成员判定、加权中心、结束判定与播放队列（D-02/D-03/D-04）。
 * 队列存在是为了让 Phase 6/7 按真实并发战斗的发生顺序播放，不用于重放模拟。
 */
export interface IBattleSystem {
    /** 推进一个物理子步的判定：剪枝 → 离区 → 加入 → 触发 → 合并 → 重算中心 → 结束。 */
    tick(): void;
    /** 当前是否有任一活跃战斗；驱动全局 1×/24×（D-09）。 */
    hasActiveBattle(): boolean;
    /** 单位当前所在的活跃战斗；不在战场时为 `null`（缺失对象，AGENTS §8）。 */
    getBattleForUnit(unitId: number): IBattle | null;
    /** 活跃战斗列表（按开始顺序）。 */
    listActiveBattles(): readonly IBattle[];
    /** 已完成战斗列表（按结束顺序；供 Phase 6/7 播放）。 */
    listCompletedBattles(): readonly IBattle[];
    /** 取走自上次调用以来的生命周期事件（新数组，并清空内部缓冲）。 */
    drainEvents(): readonly IBattleLifecycleEvent[];
}

/**
 * 一条军队宏观指令（D-29）。
 * 缺失的字面量一律用可选字段表达；省略 `startAtMinutes` 表示“立即生效”。
 */
export interface IArmyOrder {
    /** 目标军队 id。 */
    readonly armyId: number;
    /** 指令种类。 */
    readonly kind: ArmyOrderKind;
    /** 目标点 x 坐标（米）；仅需要目标点的指令使用。 */
    readonly targetX?: number;
    /** 目标点 y 坐标（米）；仅需要目标点的指令使用。 */
    readonly targetY?: number;
    /** 目标城池 id；`AttackCity` / `Garrison` 使用。 */
    readonly cityId?: number;
    /** 开始生效的游戏分钟；省略表示立即。 */
    readonly startAtMinutes?: number;
}

/**
 * 指挥官决策输入（D-25/D-29）：己方为完整只读视图，敌方被压缩为简讯。
 * 这是占位指挥官（以及 Phase 7 的 LLM 指挥官）能看到的全部信息——
 * 敌方名册、当前指令、训练与驻军内部状态都不可达（A21）。
 */
export interface ICommanderContext {
    /** 本势力 id。 */
    readonly factionId: number;
    /** 当前游戏分钟。 */
    readonly gameMinutes: number;
    /** 本势力军队（完整只读视图）。 */
    readonly armies: readonly IArmy[];
    /** 本势力城池（完整只读视图）。 */
    readonly cities: readonly ICity[];
    /** 当前可见的敌方军队简讯（无限制信息）。 */
    readonly visibleEnemyArmies: readonly IVisibleArmyBrief[];
    /** 当前可见的敌方城池简讯（无限制信息）。 */
    readonly visibleEnemyCities: readonly IVisibleCityBrief[];
    /** 当前可见的敌方单位简讯。 */
    readonly visibleEnemyUnits: readonly IUnitBrief[];
}

/**
 * 唯一可整体替换的策略接缝（D-29）：Phase 4 为最小占位实现，Phase 7 可整体换成 LLM。
 * 返回空数组表示“本 tick 不下新指令”；异常由调用方隔离，不在实现内部处理。
 */
export interface ICommander {
    /** 基于受限视野返回本 tick 的宏观指令（可为空数组）。 */
    decide(context: ICommanderContext): readonly IArmyOrder[];
}

/** 一次外层 tick 的结果，供 Phase 5/6 知道本帧跨了多少游戏时间。 */
export interface IWorldTickResult {
    /** 本次外层 tick 覆盖的游戏分钟（1 或最多 24）。 */
    readonly gameMinutes: number;
    /** 本次 tick 结束时的每 tick 分钟数（普通数字，1 或 24）。 */
    readonly minutesPerTick: number;
}

/**
 * 王国世界：唯一的编排器，也是 Phase 5（渲染）与 Phase 7（指挥官）的读取面。
 * 它**不**暴露 `IControlSystem` 或 `IPhysicsWorld`，也不复制单位读数——组合根把三者
 * 一并交给渲染层（A18/C-6/C-19）；`KingdomWorld` 通过构造函数注入持有
 * `IControlSystem`，只用于内部调用 `setUnitAI` 切换单位 AI 实例。
 * `dispose()` 幂等，且不释放外部持有的物理/控制实例。
 * 三个可见性查询每次调用都实时计算、不保存历史（D-25），且始终包含本势力自身的实体。
 * 可见性粒度是不对称的（A21）：可见的军队/城池查询只返回精简简讯，
 * 完整的 `IArmy`/`ICity` 读取面（`getArmy`/`getCity`/`getFactions` 与己方列表）属于
 * 上帝视角与 World 内部；敌方单位级细节只有这里的 id 加 `IUnitBrief`。
 */
export interface IWorld {
    /** 推进一个外层 tick（1× 跑 1 个子步；24× 最多 24 个子步）。 */
    tick(): IWorldTickResult;
    /** 时间系统读取面。 */
    getTime(): ITimeSystem;
    /** 地图尺寸。 */
    getBounds(): IMapBounds;
    /** 场景地形矩形列表（供渲染/调试与感知）。 */
    getTerrain(): readonly ITerrainRect[];
    /** 构造本世界所用的只读场景表（供渲染/调试与 Phase 6 标注）。 */
    getScenario(): IScenario;
    /** 全部势力（上帝视角）。 */
    getFactions(): readonly IFaction[];
    /** 按 id 读取势力；不存在时为 `null`（缺失对象）。 */
    getFaction(factionId: number): IFaction | null;
    /** 按 id 读取军队；不存在时为 `null`（缺失对象）。 */
    getArmy(armyId: number): IArmy | null;
    /** 按 id 读取城池；不存在时为 `null`（缺失对象）。 */
    getCity(cityId: number): ICity | null;
    /** 该势力当前可见的军队简讯（含己方）；无记忆（D-25/A21）。 */
    getVisibleArmies(factionId: number): readonly IVisibleArmyBrief[];
    /** 该势力当前可见的城池简讯（含己方）；无记忆（D-25/A21）。 */
    getVisibleCities(factionId: number): readonly IVisibleCityBrief[];
    /** 该势力当前可见的单位 id（含己方）。 */
    getVisibleUnitIds(factionId: number): readonly number[];
    /** 战斗系统读取面（队列/事件/成员）。 */
    getBattleSystem(): IBattleSystem;
    /** 下达或覆盖一条军队指令（指挥官与测试使用）。 */
    issueOrder(order: IArmyOrder): void;
    /** 释放内部引用；幂等，且不释放外部传入的物理/控制实例。 */
    dispose(): void;
}

/**
 * 战斗区加权中心的权重函数（D-18），默认实现返回单位等级。
 * 调用方会把非有限/非正结果钳制为 1，并捕获抛出的异常（不中断 tick）。
 */
export type UnitWeight = (unit: IUnit) => number;

/**
 * 战后入驻规则（D-22）：返回要留在被攻占城池中的单位 id。
 * 比例、指定单位、全部、一个都不入驻都可用同一签名表达；
 * 调用方会丢弃不在 `candidates` 中的 id 与重复项，并裁剪到 `getGarrisonCap()`。
 */
export type GarrisonSelector = (
    city: ICity,
    candidates: readonly IUnit[]
) => readonly number[];

/**
 * 王国层全部可注入策略：刻意保持最小，只保留“必须能替换”的接缝。
 * `commanderFactory` 就是 Phase 7 的整体替换入口。
 */
export interface IKingdomConfig {
    /** 战斗区加权中心的权重函数。 */
    readonly unitWeight: UnitWeight;
    /** 战后入驻规则。 */
    readonly garrisonSelector: GarrisonSelector;
    /** 每势力一个指挥官工厂。 */
    readonly commanderFactory: (factionId: number) => ICommander;
}

/** 势力初始配置（D-28）。 */
export interface IFactionSpawnSpec {
    /** 势力 id；同时作为 Phase 3 注册的 `teamId`。 */
    readonly id: number;
    /** 显示名。 */
    readonly name: string;
}

/** 军队内的单位构成配置（D-28）。 */
export interface IUnitSpawnSpec {
    /** 单位职业。 */
    readonly classKind: ClassKind;
    /** 生成数量。 */
    readonly count: number;
}

/** 军队初始配置（D-28）。 */
export interface IArmySpawnSpec {
    /** 军队 id。 */
    readonly id: number;
    /** 所属势力 id。 */
    readonly factionId: number;
    /** 初始中心 x 坐标（米）。 */
    readonly x: number;
    /** 初始中心 y 坐标（米）。 */
    readonly y: number;
    /** 初始朝向角（弧度）。 */
    readonly heading: number;
    /** 单位构成。 */
    readonly units: readonly IUnitSpawnSpec[];
}

/** 城池初始配置（D-28）。 */
export interface ICitySpawnSpec {
    /** 城池 id。 */
    readonly id: number;
    /** 归属势力 id；省略表示无主城池（缺失字面量）。 */
    readonly factionId?: number;
    /** 城池点 x 坐标（米）。 */
    readonly x: number;
    /** 城池点 y 坐标（米）。 */
    readonly y: number;
    /** 城池规模。 */
    readonly kind: CityKind;
    /** 驻军上限（场景可覆盖规模默认值）。 */
    readonly garrisonCap: number;
    /** 训练产出的单位职业。 */
    readonly trainingClass: ClassKind;
}

/**
 * 可配置场景表（D-28）：仅在构造世界时消费一次。
 * 地图边界墙由 World 自行添加，**不**列在这里（A14）；
 * 构造时必须校验 id 唯一性与全部交叉引用（ASVS V5）。
 */
export interface IScenario {
    /** 地图宽度（米）。 */
    readonly width: number;
    /** 地图高度（米）。 */
    readonly height: number;
    /** 势力表。 */
    readonly factions: readonly IFactionSpawnSpec[];
    /** 城池表。 */
    readonly cities: readonly ICitySpawnSpec[];
    /** 军队表。 */
    readonly armies: readonly IArmySpawnSpec[];
    /** 城池附近的可阻挡地形（轴对齐矩形）。 */
    readonly terrain: readonly ITerrainRect[];
}

// ---------------------------------------------------------------------------
// 以下为内部类型，非门禁契约：只供 Round 2 的 World 与模型实现使用。
// 公开读取面始终是上面的只读接口；这些写入口不进入 Phase 5/7 的消费契约
// （AGENTS §5：公共成员必须声明在接口中）。
// ---------------------------------------------------------------------------

/** 内部类型：World 对势力的写入口。 */
export interface IMutableFaction extends IFaction {
    /** 覆盖势力当前军队 id 列表。 */
    setArmyIds(armyIds: readonly number[]): void;
    /** 覆盖势力当前城池 id 列表。 */
    setCityIds(cityIds: readonly number[]): void;
}

/** 内部类型：World 对军队的写入口。 */
export interface IMutableArmy extends IArmy {
    /** 覆盖军队中心位置。 */
    setCenter(x: number, y: number): void;
    /** 覆盖军队朝向角（弧度）。 */
    setHeading(heading: number): void;
    /** 覆盖军队宏观状态。 */
    setState(state: ArmyState): void;
    /** 覆盖军队单位 id 名册。 */
    setUnitIds(unitIds: readonly number[]): void;
    /** 覆盖驻扎城池 id；`undefined` 表示不再驻扎。 */
    setGarrisonedCityId(cityId: number | undefined): void;
    /** 覆盖当前宏观指令；`null` 表示无指令。 */
    setOrder(order: IArmyOrder | null): void;
}

/** 内部类型：World 对城池的写入口。 */
export interface IMutableCity extends ICity {
    /** 覆盖城池归属；`undefined` 表示无主。 */
    setFactionId(factionId: number | undefined): void;
    /** 覆盖驻军军队 id；`undefined` 表示无驻军。 */
    setGarrisonArmyId(armyId: number | undefined): void;
    /** 覆盖训练进度（累计游戏分钟）。 */
    setTrainingProgressMinutes(minutes: number): void;
}

/** 内部类型：战斗系统对单场战斗的写入口。 */
export interface IMutableBattle extends IBattle {
    /** 覆盖生命周期状态。 */
    setState(state: BattleState): void;
    /** 覆盖战斗区中心（米）。 */
    setCenter(x: number, y: number): void;
    /** 覆盖区内成员单位 id 列表。 */
    setMemberUnitIds(unitIds: readonly number[]): void;
    /** 覆盖结束时间；`undefined` 表示仍在进行。 */
    setEndedAtMinutes(minutes: number | undefined): void;
}
