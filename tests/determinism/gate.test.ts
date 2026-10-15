import { describe, expect, it } from 'vitest';
import { runTrace } from '../helpers/run-sim';

/**
 * 确定性门禁（SIM-04 / D-09）：同机双跑指纹比对。
 *
 * 三条断言取自研究 Example 3，**逐 tick** 比较（非仅终态）：
 *   1. 同种子跑两遍 → 逐 tick 轨迹完全相同。
 *   2. 不同种子 → 轨迹不同。
 *   3. 轨迹非常量（状态确实在演化）——反"空门禁"护栏（Pitfall 8）。
 */

/** 主种子：同种子双跑应逐 tick 指纹一致。 */
const SEED = 12345;
/** 对照种子：与 `SEED` 不同，用于断言"不同种子 → 不同轨迹"。 */
const OTHER_SEED = 99999;
/** 每条轨迹推进的 tick 数（200 足够让状态充分演化）。 */
const TICKS = 200;

describe('determinism gate (SIM-04)', () => {
    it('same seed → identical per-tick fingerprint trace', () => {
        const a = runTrace({ seed: SEED, ticks: TICKS });
        const b = runTrace({ seed: SEED, ticks: TICKS });
        expect(a).toEqual(b);
    });

    it('different seed → different fingerprint trace', () => {
        const a = runTrace({ seed: SEED, ticks: TICKS });
        const c = runTrace({ seed: OTHER_SEED, ticks: TICKS });
        expect(c).not.toEqual(a);
    });

    it('fingerprint tracks state (anti-vacuous: trace is not a constant)', () => {
        const trace = runTrace({ seed: 1, ticks: TICKS });
        expect(new Set(trace).size).toBeGreaterThan(1);
    });
});
