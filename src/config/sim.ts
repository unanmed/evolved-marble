/**
 * 模拟核心的集中配置常量。
 *
 * 所有可调数值集中于此（旧原型把常量散落在各文件，本层纠正该问题）。
 * 数值依据 `.planning/reference/ai-marble-kingdom.md`：
 * - §时间系统：tick 间隔 = 游戏 1 分钟；1× 速度下推理间隔为现实 1 秒的 1/60。
 * - §AI 控制：AI 每 6 帧操控一次（0.1 秒）。
 *
 * 本文件为纯数据常量，不导入任何模块，且必须保持无 DOM 依赖（SIM-03）。
 */

/** 固定步长（秒/步）。1× 下 60 步/秒 —— spec §时间系统。 */
export const FIXED_DT = 1 / 60;

/** AI 决策间隔（步）。spec §AI 控制：每 6 帧 = 0.1 秒。Phase 4 使用。 */
export const AI_INTERVAL = 6;

/** 默认随机种子。D-01：所有模拟随机性都来自带种子的 PRNG。 */
export const DEFAULT_SEED = 12345;

/** 单帧最大累加时间（秒），防止螺旋死亡（spiral-of-death）。 */
export const MAX_FRAME = 0.25;

/** 单帧最大步数上限。 */
export const MAX_STEPS = 5;

/* ---------------------------------------------------------------------------
 * Phase 2：物理世界约定（D-32 / D-33 / D-35）。
 *
 * 米为世界单位（1 世界单位 = 1 米），全程 SI（kg / m / s），仅在渲染边界换算像素。
 * 引擎级数值集中于此；内容驱动的尺寸/质量/挥击值在 `src/sim/content/physics.ts`。
 * ------------------------------------------------------------------------- */

/** 地图宽度（米）。D-32：1 世界单位 = 1 米，地图 1000×1000 米。 */
export const WORLD_WIDTH = 1000;

/** 地图高度（米）。D-32。 */
export const WORLD_HEIGHT = 1000;

/** 全局重力 x 分量（m/s²）。D-35：顶视视角，无重力。 */
export const GRAVITY_X = 0;

/** 全局重力 y 分量（m/s²）。D-35：顶视视角，无重力。 */
export const GRAVITY_Y = 0;

/** 接触弹性（恢复系数）。D-35：约 0，避免持续抖动/能量注入。 */
export const RESTITUTION = 0;

/** 统一线性阻尼（1/s）。D-35：统一的小线性阻尼。 */
export const LINEAR_DAMPING = 0.1;

/** 统一角阻尼（1/s）。D-35：统一的小角阻尼。 */
export const ANGULAR_DAMPING = 0.1;

/**
 * 安全带边距（米）。D-33：仅在单位越出安全区（1000×1000 m）时把位置/速度拉回；
 * 取 0 表示软钳制边界恰为地图边界。它是稳定性保险，不干预常规战斗，也不是物理墙。
 */
export const SAFETY_BELT_MARGIN = 0;

/** CCD 最大子步数。D-24 / Pitfall 4：快速武器防穿透的廉价保险。 */
export const MAX_CCD_SUBSTEPS = 4;
