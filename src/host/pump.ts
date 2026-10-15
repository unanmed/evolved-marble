/**
 * 可换的节奏泵（SIM-01 / 研究 Pattern 1 表）。
 *
 * 两者均**无 DOM/时钟依赖**。浏览器侧的 `rafPump` 不在本任务内创建。
 */

/**
 * 无头泵：每次返回一个固定的大预算，**绝不读取任何时钟**。
 * 用于测试与训练——以最快速度推进，且保持确定性。
 */
export function headlessPump(budget: number): () => number {
    return () => budget;
}

/**
 * 固定帧率泵：每次返回恰好 `1/fps`，使输出帧率与显示器刷新率无关。
 * 用于录制（Phase 6）。
 */
export function fixedFpsPump(fps: number): () => number {
    const budget = 1 / fps;
    return () => budget;
}
