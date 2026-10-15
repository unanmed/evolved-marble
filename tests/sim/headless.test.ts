import { describe, expect, it } from 'vitest';
import {
    DEFAULT_SEED,
    FIXED_DT,
    MAX_FRAME,
    MAX_STEPS
} from '../../src/config/sim';
import { runLoop } from '../../src/host/loop';
import { headlessPump } from '../../src/host/pump';
import { BattleSim, type IBattleSim } from '../../src/sim/battle-sim';

/**
 * 无头固定步长端到端切片（SIM-01 / SIM-03）。
 *
 * 驱动完整链路：种子 → 种子化 RNG → 固定步长时钟 → 有序实体存储 →
 * 最小确定性系统 → 规范快照/指纹 → 宿主累加器循环 → 无头运行。
 * 全程无 DOM、无墙上时钟。
 */

function buildSim(seed: number): IBattleSim {
    const sim = new BattleSim(seed);
    sim.spawn();
    sim.spawn();
    sim.spawn();
    return sim;
}

/** 无头跑 `frames` 帧，返回逐 tick 的指纹轨迹。 */
function runTrace(seed: number, frames: number): string[] {
    const sim = buildSim(seed);
    const trace: string[] = [];
    // runLoop 每调用一次 sim.step() 即推进一个 tick；在每步后记录指纹。
    const recorder = {
        step(): void {
            sim.step();
            trace.push(sim.fingerprint());
        }
    };
    const tick = runLoop(headlessPump(MAX_FRAME), recorder, () => {}, {
        dt: FIXED_DT,
        maxFrame: MAX_FRAME,
        maxSteps: MAX_STEPS
    });
    for (let i = 0; i < frames; i++) tick();
    return trace;
}

describe('headless fixed-step sim', () => {
    it('mutates state tick-over-tick (non-vacuous fingerprint)', () => {
        const trace = runTrace(DEFAULT_SEED, 8);
        expect(trace.length).toBeGreaterThan(1);
        expect(new Set(trace).size).toBeGreaterThan(1);
    });

    it('same seed → identical per-tick fingerprint trace', () => {
        const a = runTrace(DEFAULT_SEED, 8);
        const b = runTrace(DEFAULT_SEED, 8);
        expect(a).toEqual(b);
    });

    it('different seed → different fingerprint', () => {
        const a = runTrace(DEFAULT_SEED, 8);
        const c = runTrace(99999, 8);
        expect(c).not.toEqual(a);
    });
});
