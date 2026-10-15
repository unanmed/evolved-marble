import { MOVEMENT_NUDGE_SCALE } from '../content/formulas';
import { clamp } from '../core/math';
import type { ISimState } from '../world/world';

/**
 * Phase-1 最小确定性系统（研究假设 A1 的显式占位）。
 *
 * 刻意保持极小：按**有序 id** 迭代，用带种子的 `'ai'` 流给 `vx` 施加微扰，
 * 再积分位置。它是每 tick 状态变化的唯一来源，用于让 SIM-04 指纹门禁
 * **非空**（Pitfall 8：对静态状态取指纹证明不了任何东西）。Phase 2 将以真实物理替换。
 *
 * 微扰尺度集中在 `content/formulas.ts`（`MOVEMENT_NUDGE_SCALE`，D-06 单一数值来源）；
 * `nudge` 经 `clamp` 夹紧到 [-0.5, 0.5] 作为防御性不变量（`ai.next()` 已在 [0,1)，故为无副作用）。
 * 尺度取 0.05 而非更小的值：快照以 1/256 栅格量化，过小的 `vx` 变化会被量化抹平、
 * 使门禁退化为空（见 01-02 SUMMARY 偏差记录）。
 *
 * 确定性：按 `ids()` 的**有序数组**迭代，微扰取自带种子的 `'ai'` 流，故同一状态与种子
 * 必产生同一结果。绝不使用 `Math.random`（`sim/**` 内由 lint 硬性拦截）。
 *
 * @param w 聚合状态根（读取有序实体与带种子的 `'ai'` 随机流）。
 * @param dt 固定步长（秒），用于对速度积分位置。
 * @returns 无（原地修改 `w.store` 中各实体的位姿）。
 */
export function movementSystem(w: ISimState, dt: number): void {
    const ai = w.rng.stream('ai');
    for (const id of w.store.ids()) {
        const c = w.store.get(id);
        const nudge = clamp(ai.next() - 0.5, -0.5, 0.5);
        c.xform.vx += nudge * MOVEMENT_NUDGE_SCALE;
        c.xform.x += c.xform.vx * dt;
        c.xform.y += c.xform.vy * dt;
    }
}
