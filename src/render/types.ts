/**
 * 渲染系统的全部类型声明：数字枚举 `CameraMode`、两个函数类型别名与 `I*` 接口。
 * 本文件只含声明，不含任何算法、类、顶层 `const`、函数体或绘制调用；
 * 唯一的外部非类型依赖是 v8 场景图规则要求的 type-only `Container` 引用。
 * 上游契约（王国 / 控制 / 物理 / 单位）一律经 `import type` 复用，不重声明、不扩宽；
 * 依赖方向始终是 render → 上游，绝不反向（D-03/D-19）。
 */

import type { Container } from 'pixi.js';
import type { IUnitCatalog } from '@/control/types';
import type { CityKind, IMapBounds, IVec2, IWorld } from '@/kingdom/types';
import type {
    ColliderPart,
    IPhysicsGeometry,
    IPhysicsWorld,
    IUnitState
} from '@/physics/types';
import type { ArmorKind, ClassKind, WeaponKind } from '@/units/types';

/**
 * 镜头的两种渲染模式（D-14/D-15）：只有两个状态，没有第三种。
 * 跟拍目标只经 `ICamera.setBattleTarget` 改变；`ICamera.getMode()` 报告**当前渲染模式**，
 * 因此拉回全景的过程中仍是 `BattleFocus`——单位不能在镜头还在拉远时突然消失；
 * 没有独立的模式设置方法，模式永远由目标推导，二者不可能互相矛盾。
 */
export enum CameraMode {
    /** 无战斗全景：整张地图 + 军队箭头 + 城池标志，**不渲染单位**（D-14）。 */
    Strategic = 0,
    /** 战斗特写：平滑推近并拟合被指定战斗的参战单位（D-14/D-21）。 */
    BattleFocus = 1
}

/**
 * 只读服务提供者（D-18/D-19）：每个输出帧重新读取一次，
 * 使一次 reset 可以整体替换 world / catalog / physics / damageFeed，
 * 而不必重建 Pixi 应用。
 */
export type RenderServicesProvider = () => IRenderServices;

/**
 * 窄运动读数查询（AGENTS §8）：供 Round 2 的伤害旁路与测试注入，
 * 使其无需持有整个 `IPhysicsWorld`；单位未知或已移除时返回 `null`（缺失对象 → `null`），
 * 与冻结的 `IPhysicsWorld.getUnitState` 保持一致。
 */
export type UnitStateLookup = (unitId: number) => IUnitState | null;

/** 画布视口（D-13）：固定 16:9 的像素尺寸，默认 1920×1080 在 Round 2 常量中落地。 */
export interface IViewport {
    /** 画布宽度（像素）。 */
    readonly width: number;
    /** 画布高度（像素）。 */
    readonly height: number;
}

/** 屏幕坐标（D-14/D-24）：像素，左上原点，y 轴向下；用于全景标记与 canvas 点击拾取。 */
export interface IScreenPoint {
    /** 屏幕 x 坐标（像素）。 */
    readonly x: number;
    /** 屏幕 y 坐标（像素）。 */
    readonly y: number;
}

/**
 * 正方形拟合盒（D-14）：世界坐标（米），由 Round 2 的百分位拟合纯函数产出。
 * 消费方是 `cameraMath` 与 Round 2 渲染器的镜头层，不是独立的接口方法。
 */
export interface IFitBox {
    /** 盒左边界（米）。 */
    readonly minX: number;
    /** 盒右边界（米）。 */
    readonly maxX: number;
    /** 盒上边界（米）。 */
    readonly minY: number;
    /** 盒下边界（米）。 */
    readonly maxY: number;
}

/**
 * 一帧生效的镜头变换（D-14/D-24）。
 * 映射关系：`screen = viewportCentre + (world − centre) × scale + shake`。
 * 世界 y 轴**刻意不翻转**，因此物理角度可以直接用作子容器的旋转；
 * 拾取时必须排除 `shakeX`/`shakeY`，否则点击会随震动漂移。
 */
export interface ICameraTransform {
    /** 镜头中心的世界 x 坐标（米）。 */
    readonly centerX: number;
    /** 镜头中心的世界 y 坐标（米）。 */
    readonly centerY: number;
    /** 缩放：每米对应的像素数。 */
    readonly scale: number;
    /** 屏幕空间震动偏移 x（像素）；与中心分离，便于拾取时排除。 */
    readonly shakeX: number;
    /** 屏幕空间震动偏移 y（像素）；与中心分离，便于拾取时排除。 */
    readonly shakeY: number;
}

/**
 * 一次镜头更新的输入（D-06/D-14/D-21/D-24）。
 * 空 `points` 表示全景拟合；否则这些点是被指定战斗的存活成员位置。
 * `shakeImpulsePx` 是**本输出帧**请求的屏幕像素震动量：调用方（Round 2 的 `Renderer`）
 * 用本帧排空的 `IRenderDamageEvent` 与 `IEffectsConfig.shakeDamageThreshold` 决定是否
 * 触发，并用 `ICameraConfig.shakeAmplitudePx` 封顶，无事发生时传 `0`；
 * `update()` 把它并入内部衰减的振幅、钳制到上限，并按 `shakeDecayPerFrame` 衰减，
 * 最终输出到 `ICameraTransform.shakeX`/`shakeY`——这是震动输出的唯一声明写入方。
 */
export interface ICameraUpdateInput {
    /** 当前画布视口（像素）。 */
    readonly viewport: IViewport;
    /** 地图尺寸（米），全景拟合的上限。 */
    readonly bounds: IMapBounds;
    /** 拟合点（世界米）：为空表示全景，否则为目标战斗的存活成员位置。 */
    readonly points: readonly IVec2[];
    /** 本输出帧请求的屏幕震动冲量（像素）；无震动时为 0。 */
    readonly shakeImpulsePx: number;
    /**
     * 当前战斗权重：目标战斗存活成员的等级之和；无目标战斗时为 0。
     * 只缩短**战斗内稳态跟随**的追赶时间，绝不改变进入/退出过渡的时长。
     */
    readonly battleWeight: number;
}

/** 镜头可调参数（D-06/D-14/D-15/D-20/D-21）。 */
export interface ICameraConfig {
    /** 拟合边距（像素）：同时为头顶 HUD 元素预留空间。 */
    readonly paddingPx: number;
    /** **目标构图**必须容纳的参战点比例（默认 0.9）；当前变换在平滑切换中允许短暂不足。 */
    readonly coverage: number;
    /** 拟合盒的最小边长（米）：防止单点战斗把镜头推到无限近。 */
    readonly minSpanMeters: number;
    /** 允许的最小缩放（像素/米）。 */
    readonly minScale: number;
    /** 允许的最大缩放（像素/米）。 */
    readonly maxScale: number;
    /** 跟踪的时间常数（输出帧）：指数平滑越远越慢，永不瞬移；战斗中按 `weightScale` 缩短。 */
    readonly smoothingFrames: number;
    /** **退出**（拉回全景）单段过渡的输出帧数：中心与缩放同时缓动到全景构图。 */
    readonly panFrames: number;
    /** **进入**（推近战斗）单段过渡的输出帧数：中心与缩放同时从当前构图缓动到目标构图。 */
    readonly zoomFrames: number;
    /** 权重标度：等级和达到此值时稳态跟随的平滑帧数减半（默认 20），必须为正。 */
    readonly weightScale: number;
    /** 震动振幅上限（屏幕像素）：冲量与累计振幅都钳制到此值。 */
    readonly shakeAmplitudePx: number;
    /** 每帧振幅衰减乘数：震动以输出帧计，不用 wall-clock。 */
    readonly shakeDecayPerFrame: number;
}

/**
 * 自动镜头契约（D-02/D-14/D-15/D-21）：只有两个模式、只做平滑运动。
 * **目标构图**永远满足配置的 `coverage`，而当前变换在平滑切换期间允许短暂滞后；
 * `reset` 是唯一允许的瞬时跳变（初始化）。
 */
export interface ICamera {
    /**
     * 只改变跟拍目标，**绝不改变当前变换**（因此不会瞬移）；
     * `undefined` 请求全景——缺失字面量用 `undefined`（AGENTS §8），
     * 与冻结的 `IArmy.getEngagedBattleId`/`IBattle.getCityId` 一致。
     */
    setBattleTarget(battleId: number | undefined): void;
    /** 当前跟拍目标；无目标时为 `undefined`（缺失字面量）。 */
    getBattleTarget(): number | undefined;
    /** 当前渲染模式：由目标推导，拉回全景过渡完成前保持 `BattleFocus`。 */
    getMode(): CameraMode;
    /** 每个输出帧调用恰好一次，返回本帧实际应用的变换。 */
    update(input: ICameraUpdateInput): ICameraTransform;
    /** 最近一次应用的变换；首次 update 前也已定义。 */
    getTransform(): ICameraTransform;
    /**
     * 清空跟拍目标并组合初始全景视图（唯一允许的瞬时跳变）。
     * 因为 `getMode()` 由目标推导，调用后 `getMode()` 必为
     * `CameraMode.Strategic`，返回的变换必为全景构图。
     */
    reset(bounds: IMapBounds, viewport: IViewport): ICameraTransform;
}

/**
 * 基础视口裁剪查询（D-01）：替代空间索引的最小形状。
 * 消费方是 `frameModel` 与 Round 2 渲染器的单位层：结果告知是否可整棵子树跳过绘制。
 */
export interface ICullQuery {
    /** 待测点的世界 x 坐标（米）。 */
    readonly x: number;
    /** 待测点的世界 y 坐标（米）。 */
    readonly y: number;
    /** 本帧的镜头变换。 */
    readonly transform: ICameraTransform;
    /** 当前画布视口（像素）。 */
    readonly viewport: IViewport;
    /** 视口外仍视为可见的边距（米）。 */
    readonly marginMeters: number;
}

/**
 * 单位不可变的视觉身份（D-03/D-04）：用于挑选几何造型。
 * 阵营只以解析后的颜色表达；职业只是数据（供图例/调试），不单独造型；
 * 6 种武器与 2 种防具全部经冻结的数字枚举区分，无需渲染侧重复枚举。
 */
export interface IUnitVisualSpec {
    /** 阵营色（0xRRGGBB），由注册时的 `teamId`（= 势力 id）解析得到。 */
    readonly factionColor: number;
    /** 职业：仅作数据保留，不产生独立视觉。 */
    readonly classKind: ClassKind;
    /** 已装备武器；赤手空拳时为 `undefined`（缺失字面量）。 */
    readonly weapon: WeaponKind | undefined;
    /** 已装备防具（顺序稳定）；未着甲时为空数组。 */
    readonly armors: readonly ArmorKind[];
}

/**
 * 创建一个单位视图的输入（D-03）。
 * 视觉身份在单位**首次出现**时快照，之后装备/等级变化**不重建**：
 * 物理刚体在注册时已冻结，画面上出现了刚体并不具备的护甲会误导观众；
 * 等级数字由 HUD 实时读取，不进入本快照。
 */
export interface IUnitViewSpec {
    /** 单位 id。 */
    readonly unitId: number;
    /** 创建时快照的视觉身份。 */
    readonly visual: IUnitVisualSpec;
}

/**
 * 每帧应用到单位视图的状态（D-06）：只改变换/透明度/着色/可见性，
 * 永不重建几何。
 */
export interface IUnitViewState {
    /** 世界 x 坐标（米）。 */
    readonly x: number;
    /** 世界 y 坐标（米）。 */
    readonly y: number;
    /** 朝向角（弧度）：应用到**旋转子容器**。 */
    readonly angle: number;
    /** 本帧是否受击闪白。 */
    readonly flash: boolean;
    /** 裁剪结果：false 时整棵子树隐藏。 */
    readonly visible: boolean;
}

/**
 * 可替换的单位视觉接缝（D-03）：默认几何实现，未来可换成贴图实现，
 * 而 `IRenderer`/`ICamera`/`IHud` 不需要改动。
 */
export interface IUnitView {
    /**
     * 交给单位层的场景图根节点。v8 的叶节点不能带子节点，故根是 `Container`；
     * 本体旋转放在其**子容器**上，等级数字等不旋转元素可作为兄弟节点。
     */
    getRoot(): Container;
    /** 应用一帧状态：只改变换/透明度/着色/可见性。 */
    apply(state: IUnitViewState): void;
    /** 释放本实例；**不得**销毁工厂共享的几何上下文。 */
    destroy(): void;
}

/** 单位视图工厂（D-03）：共享几何归工厂所有，不归单个视图。 */
export interface IUnitViewFactory {
    /** 同步创建一个单位视图（今天为几何，未来可为贴图）。 */
    create(spec: IUnitViewSpec): IUnitView;
    /** 释放共享几何/贴图资源，恰好一次。 */
    dispose(): void;
}

/** 单个单位的 HUD 数据（D-07/D-08/D-09）。 */
export interface IHudUnitState {
    /** 单位 id。 */
    readonly unitId: number;
    /** 世界 x 坐标（米）。 */
    readonly x: number;
    /** 世界 y 坐标（米）。 */
    readonly y: number;
    /** 阵营色（0xRRGGBB）：血条填充色。 */
    readonly factionColor: number;
    /** 生命比例，已钳制到 [0, 1]。 */
    readonly healthRatio: number;
    /** 等级：常亮、直立、始终跟随镜头缩放。 */
    readonly level: number;
    /** 本帧血条是否可见（由计时/阈值规则解析）。 */
    readonly healthVisible: boolean;
    /** 血条混合缩放系数：1 = 世界尺寸。 */
    readonly hudScale: number;
}

/**
 * HUD 计时模型的唯一可变工作状态（D-07）。
 * 消费方是 `hudModel` 纯函数与 Round 2 的 `Hud`：键是**输出帧**序号，绝不用 wall-clock；
 * 条目在单位死亡或 reset 时清除。
 */
export interface IHudTimers {
    /** unitId → 血条可见到（不含）的输出帧序号。 */
    readonly visibleUntil: Map<number, number>;
}

/** HUD 可调参数（D-07/D-08/D-09/D-11/D-23）。 */
export interface IHudConfig {
    /** 受击后血条显示的秒数（15）：实际帧数 = 本值 × `IRenderConfig.outputFps`。 */
    readonly healthBarSeconds: number;
    /** 场上存活单位数低于此值时血条常亮（6）。 */
    readonly alwaysVisibleBelowUnits: number;
    /** 血条世界宽度（米）。 */
    readonly barWorldWidth: number;
    /** 血条世界高度（米）。 */
    readonly barWorldHeight: number;
    /** 血条相对本体的 y 偏移（米）；负值在头顶上方。 */
    readonly barOffsetY: number;
    /** 屏幕恒定模式下的血条宽度（像素）。 */
    readonly screenBarWidthPx: number;
    /** 缩放达到或高于此值时，血条完全屏幕恒定（D-09）。 */
    readonly screenScaleAt: number;
    /** 缩放达到或低于此值时，血条完全世界尺寸（D-09）；必须严格小于 `screenScaleAt`。 */
    readonly worldScaleAt: number;
    /** 等级数字的世界高度（米）：始终世界缩放，不做屏幕恒定（D-08/D-23）。 */
    readonly levelWorldHeight: number;
    /** 信息条距画面边缘的像素间距（D-11）。 */
    readonly infoMarginPx: number;
    /** 信息条字号（像素，D-11）。 */
    readonly infoFontSizePx: number;
}

/** 一帧的 HUD 输入（D-07/D-11/D-17）：全部用输出帧与游戏时间表达，无 wall-clock。 */
export interface IHudFrame {
    /** 输出帧序号：每次 `renderFrame` 递增一次，使 15 × `outputFps` 规则可计算。 */
    readonly frameIndex: number;
    /** 当前画布视口（像素）。 */
    readonly viewport: IViewport;
    /** 本帧镜头变换：血条混合缩放与屏幕层排版的依据。 */
    readonly camera: ICameraTransform;
    /** 本帧需要绘制的单位 HUD 数据。 */
    readonly units: readonly IHudUnitState[];
    /** 场上存活单位总数（不是可见数）：常亮规则针对整个战场。 */
    readonly totalUnits: number;
    /** 本帧排空的伤害事件：伤害数字与特效的输入。 */
    readonly damage: readonly IRenderDamageEvent[];
    /** 当前游戏分钟（D-11）。 */
    readonly gameMinutes: number;
    /** 每 tick 游戏分钟数：信息条“N×”的显示依据（D-11）。 */
    readonly minutesPerTick: number;
}

/**
 * HUD 绘制契约（D-06/D-07/D-08/D-09/D-10/D-11）：只负责画；
 * 可见性/缩放/阈值等判断属于 Round 2 的纯 HUD 模型，以保持可单测。
 */
export interface IHud {
    /** 更新对象池并绘制一帧：血条、等级、伤害数字、火花、死亡特效与信息条。 */
    update(frame: IHudFrame): void;
    /** 清空对象池与计时。 */
    reset(): void;
    /** 幂等释放。 */
    dispose(): void;
}

/** 战斗反馈预算（D-06/D-10）：所有同屏上限与寿命都以输出帧计。 */
export interface IEffectsConfig {
    /** 只有伤害达到此值才显示伤害数字（50，D-10）。 */
    readonly damageNumberThreshold: number;
    /** 伤害数字的世界高度（米）。 */
    readonly damageNumberWorldHeight: number;
    /** 伤害数字寿命（输出帧）。 */
    readonly damageNumberLifetimeFrames: number;
    /** 伤害数字每帧上升距离（米）。 */
    readonly damageNumberRiseMetersPerFrame: number;
    /** 同屏伤害数字上限。 */
    readonly maxDamageNumbers: number;
    /** 同屏粒子上限。 */
    readonly maxParticles: number;
    /** 单次命中的粒子数。 */
    readonly particlesPerHit: number;
    /** 粒子寿命（输出帧）。 */
    readonly particleLifetimeFrames: number;
    /** 同屏死亡特效上限。 */
    readonly maxDeathEffects: number;
    /** 死亡特效寿命（输出帧）。 */
    readonly deathEffectLifetimeFrames: number;
    /** 受击闪白持续的帧数。 */
    readonly flashFrames: number;
    /**
     * 触发镜头震动的伤害阈值：Round 2 渲染器用本帧最大实际伤害（或任一 `killed`）
     * 与它比较，决定传给 `ICameraUpdateInput.shakeImpulsePx` 的冲量。
     */
    readonly shakeDamageThreshold: number;
}

/**
 * 视觉基调（D-05）：暗底高饱和——单位与特效必须是画面中最跳的元素。
 * 全部为 0xRRGGBB；无主城池使用 `neutral`。
 */
export interface IRenderPalette {
    /** 画布背景色。 */
    readonly background: number;
    /** 地图地面色。 */
    readonly mapFloor: number;
    /** 网格线色。 */
    readonly grid: number;
    /** 地形色块色（低饱和）。 */
    readonly terrain: number;
    /** 文本色。 */
    readonly text: number;
    /** 血条底槽色。 */
    readonly healthBackground: number;
    /** 血条描边色。 */
    readonly healthBorder: number;
    /** 武器默认色（未按阵营着色时）。 */
    readonly weapon: number;
    /** 防具默认色。 */
    readonly armor: number;
    /** 受击闪白色。 */
    readonly flash: number;
    /** 中立色：无主城池与未知阵营回退。 */
    readonly neutral: number;
}

/**
 * 渲染配置（D-13/D-20）：**唯一**的视觉/时序调参入口，
 * 不允许在别处出现魔法数。默认值由 Round 2 的 `constants.ts` 落地，并须经 Round 2 校验。
 */
export interface IRenderConfig {
    /** 画布宽度（像素）；文档默认 1920。 */
    readonly width: number;
    /** 画布高度（像素）；文档默认 1080。 */
    readonly height: number;
    /** 输出帧率：仅用于 HUD 帧数换算与 Phase 6 编码元数据，**绝不**作为循环节流。 */
    readonly outputFps: number;
    /** 调用方/runner 的默认每帧延时（毫秒）；渲染器自身从不调度。 */
    readonly frameDelayMs: number;
    /** 势力 id → 颜色（0xRRGGBB）；未知 id 回退到调色板。 */
    readonly factionColors: Readonly<Record<number, number>>;
    /** 视觉足迹基准：必须等于物理几何，否则武器/防具会画在错误位置。 */
    readonly geometry: IPhysicsGeometry;
    /** 调色板（D-05）。 */
    readonly palette: IRenderPalette;
    /** 镜头参数。 */
    readonly camera: ICameraConfig;
    /** HUD 参数。 */
    readonly hud: IHudConfig;
    /** 反馈预算。 */
    readonly effects: IEffectsConfig;
}

/**
 * 一条渲染用伤害事件（D-06/D-07/D-10）：由 Round 2 的装饰器在包装既有
 * `IDamageSink` 后产出，故冻结的控制/物理契约不受影响。
 * 位置字段之所以存在，是因为死亡刚体在下一帧已被移除——只有命中当刻可读。
 */
export interface IRenderDamageEvent {
    /** 攻方单位 id。 */
    readonly attackerId: number;
    /** 守方单位 id。 */
    readonly defenderId: number;
    /** 攻方阵营 id。 */
    readonly attackerTeamId: number;
    /** 守方阵营 id。 */
    readonly defenderTeamId: number;
    /** 实际扣除的生命值（不含溢出伤害）：伤害数字阈值比较的对象。 */
    readonly damage: number;
    /** 守方被击中的部位。 */
    readonly defenderPart: ColliderPart;
    /** 攻方武器种类；缺失时为 `undefined`（缺失字面量）。 */
    readonly weaponKind: WeaponKind | undefined;
    /** 守方被击中防具种类；击中本体时为 `undefined`（缺失字面量）。 */
    readonly armorKind: ArmorKind | undefined;
    /** 守方命中时的世界 x 坐标（米），在刚体移除前捕获。 */
    readonly x: number;
    /** 守方命中时的世界 y 坐标（米），在刚体移除前捕获。 */
    readonly y: number;
    /** 守方（死亡时为生前）等级。 */
    readonly level: number;
    /** 本次命中是否造成死亡。 */
    readonly killed: boolean;
}

/** 伤害/死亡读取接缝（D-06）：每个输出帧排空一次。 */
export interface IDamageFeed {
    /** 返回新数组并清空缓冲；每个输出帧调用一次。 */
    drain(): readonly IRenderDamageEvent[];
    /** 丢弃未读事件（reset / 切回全景时）。 */
    clear(): void;
}

/**
 * 渲染层完整的只读依赖集合（D-19）：由组合根一次性交给渲染层。
 * `IWorld` 不暴露控制或物理，渲染不得复制单位读数，故三者一并提供。
 */
export interface IRenderServices {
    /** 王国世界读取面（时间/地图/军队/城池/战斗/地形）。 */
    readonly world: IWorld;
    /** 单位目录（单位实例与阵营）。 */
    readonly catalog: IUnitCatalog;
    /** 物理世界（运动读数）。 */
    readonly physics: IPhysicsWorld;
    /** 伤害/死亡旁路。 */
    readonly damageFeed: IDamageFeed;
}

/**
 * 渲染器契约（D-17/D-18）：按需绘制一帧，不拥有循环。
 * 推进、暂停、单步与延时归调用方；Phase 6 每帧先推进再取 canvas。
 */
export interface IRenderer {
    /** 读取服务、推进镜头、同步/释放单位视图、更新 HUD，然后恰好绘制一帧；不调度任何东西。 */
    renderFrame(): void;
    /** 固定尺寸后备存储，供 Phase 6 逐帧编码。 */
    getCanvas(): HTMLCanvasElement;
    /** 镜头：Phase 6 与操作面板经它驱动跟拍目标。 */
    getCamera(): ICamera;
    /** 清空视图/HUD/对象池/帧计数，并把镜头复位到全景构图；**不**销毁 Pixi 应用。 */
    reset(): void;
    /** 幂等释放：应用、视图工厂与对象池。 */
    dispose(): void;
}

/**
 * 全景军队标志（D-14）：阵营色箭头 + 实力数字；
 * 不携带任何单位 id，因此“全景不渲染单位”是结构性质而非需要记住的行为。
 */
export interface IStrategicArmyMarker {
    /** 军队 id。 */
    readonly armyId: number;
    /** 所属势力 id（决定箭头颜色）。 */
    readonly factionId: number;
    /** 屏幕坐标（像素）。 */
    readonly screen: IScreenPoint;
    /** 朝向角（弧度）。 */
    readonly heading: number;
    /** 实力：存活单位数。 */
    readonly strength: number;
}

/**
 * 全景城池标志（D-14）：形状/旗帜由 `kind` 推导，主城更大；
 * 驻军、训练与名册信息**不**进入全景。
 */
export interface IStrategicCityMarker {
    /** 城池 id。 */
    readonly cityId: number;
    /** 归属势力 id；无主城池为 `undefined`（缺失字面量，AGENTS §8）。 */
    readonly factionId: number | undefined;
    /** 屏幕坐标（像素）。 */
    readonly screen: IScreenPoint;
    /** 城池规模。 */
    readonly kind: CityKind;
}

/**
 * 无战斗全景帧（D-14）：地图 + 军队箭头 + 城池标志。
 * 类型中没有单位列表，故“全景不渲染单位”是结构性质。
 */
export interface IStrategicFrame {
    /** 全部军队标志。 */
    readonly armies: readonly IStrategicArmyMarker[];
    /** 全部城池标志。 */
    readonly cities: readonly IStrategicCityMarker[];
}
