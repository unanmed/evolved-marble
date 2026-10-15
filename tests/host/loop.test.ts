import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config/sim';
import { runLoop, type StepTarget } from '../../src/host/loop';

/**
 * 固定步长累加器循环（SIM-01 / 研究 Pattern 1）。
 *
 * 覆盖：整数步数 floor(acc/dt)、子步预算跨帧累加、大尖峰被 maxFrame 夹紧、
 * 命中 maxSteps 时欠账清零（无螺旋）、alpha 恒落于 [0,1)。
 */

class Counter implements StepTarget {
    steps = 0;
    step(): void {
        this.steps++;
    }
}

describe('runLoop accumulator (SIM-01)', () => {
    it('runs exactly floor(budget / dt) whole steps', () => {
        const sim = new Counter();
        let alpha = -1;
        const tick = runLoop(
            () => 0.05,
            sim,
            a => {
                alpha = a;
            },
            { dt: FIXED_DT, maxFrame: 0.25, maxSteps: 100 }
        );
        tick();
        expect(sim.steps).toBe(Math.floor(0.05 / FIXED_DT)); // 3
        expect(alpha).toBeGreaterThanOrEqual(0);
        expect(alpha).toBeLessThan(1);
    });

    it('accumulates a sub-step budget across frames', () => {
        const sim = new Counter();
        const tick = runLoop(
            () => 0.01,
            sim,
            () => {},
            {
                dt: FIXED_DT,
                maxFrame: 1,
                maxSteps: 100
            }
        );
        tick(); // 0.01 < dt → 0 步
        expect(sim.steps).toBe(0);
        tick(); // acc ≈ 0.02 ≥ dt → 1 步
        expect(sim.steps).toBe(1);
    });

    it('clamps a large frame spike to maxFrame', () => {
        const sim = new Counter();
        const tick = runLoop(
            () => 10,
            sim,
            () => {},
            {
                dt: FIXED_DT,
                maxFrame: 0.25,
                maxSteps: 1000
            }
        );
        tick();
        // 未被夹紧会是 600 步；夹紧后恰为 floor(0.25 / dt) = 15
        expect(sim.steps).toBe(Math.floor(0.25 / FIXED_DT));
    });

    it('caps steps per frame and zeroes the accumulator debt (no spiral)', () => {
        const sim = new Counter();
        let budget = 1.0;
        const tick = runLoop(
            () => budget,
            sim,
            () => {},
            {
                dt: FIXED_DT,
                maxFrame: 10,
                maxSteps: 3
            }
        );
        tick();
        expect(sim.steps).toBe(3); // 命中上限
        sim.steps = 0;
        budget = 0;
        tick(); // 欠账已清零 → 0 步（若欠账残留则会继续推进）
        expect(sim.steps).toBe(0);
    });

    it('reports alpha in [0, 1) across many frames', () => {
        const sim = new Counter();
        const alphas: number[] = [];
        const budgets = [0.02, 0.001, 0.033, 0.0166, 0.017, 0];
        let i = 0;
        const tick = runLoop(
            () => budgets[i++ % budgets.length],
            sim,
            a => alphas.push(a),
            { dt: FIXED_DT, maxFrame: 0.25, maxSteps: 100 }
        );
        for (let k = 0; k < 30; k++) tick();
        expect(alphas.length).toBe(30);
        for (const a of alphas) {
            expect(a).toBeGreaterThanOrEqual(0);
            expect(a).toBeLessThan(1);
        }
    });
});
