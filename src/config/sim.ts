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
