import type { SimState } from '../world/world';

/**
 * Phase-1 最小确定性系统（研究假设 A1 的显式占位）。
 *
 * 刻意保持极小：按**有序 id** 迭代，用带种子的 `'ai'` 流给 `vx` 施加微扰，
 * 再积分位置。它是每 tick 状态变化的唯一来源，用于让 SIM-04 指纹门禁
 * **非空**（Pitfall 8：对静态状态取指纹证明不了任何东西）。Phase 2 将以真实物理替换。
 *
 * 注：微扰尺度被设为 `0.05`（而非草稿里的 `0.001`）。原因是快照以 1/256 栅格量化：
 * `nudge * 0.001` 远低于该栅格分辨率，会让每 tick 的量化状态不变、门禁退化为空。
 * 取 0.05 使单 tick 的 `vx` 变化稳定跨越量化栅格，保证门禁可判别（见 SUMMARY 偏差记录）。
 */
const NUDGE_SCALE = 0.05;

export function movementSystem(w: SimState, dt: number): void {
    const ai = w.rng.stream('ai');
    for (const id of w.store.ids()) {
        const c = w.store.get(id);
        const nudge = ai.next() - 0.5;
        c.xform.vx += nudge * NUDGE_SCALE;
        c.xform.x += c.xform.vx * dt;
        c.xform.y += c.xform.vy * dt;
    }
}
