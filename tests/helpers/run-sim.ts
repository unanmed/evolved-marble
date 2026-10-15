import { FIXED_DT, MAX_FRAME, MAX_STEPS } from '../../src/config/sim';
import { runLoop } from '../../src/host/loop';
import { headlessPump } from '../../src/host/pump';
import { BattleSim } from '../../src/sim/battle-sim';

/**
 * 无头逐 tick 指纹轨迹运行器（SIM-03/SIM-04 共用）。
 *
 * 由种子构造 `BattleSim`，生成一组固定的小实体集，经 `runLoop` + `headlessPump`
 * 以固定步长推进，返回**每 tick 一条**状态指纹。同一逻辑运行必产出相同轨迹——
 * 这是确定性门禁的判据。
 */

/** `runTrace` 的入参。 */
export interface RunTraceOptions {
    seed: number;
    ticks: number;
}

/** 固定实体集大小（与种子无关，保证两次运行面对同一场景）。 */
const FIXED_ENTITY_COUNT = 3;

/**
 * 跑 `ticks` 个固定步，返回逐 tick 指纹轨迹（长度 = `ticks`）。
 *
 * 泵预算取 `FIXED_DT`，故每次 `tick()` 恰好推进 1 步；`ticks` 即轨迹长度。
 */
export function runTrace({ seed, ticks }: RunTraceOptions): string[] {
    const sim = new BattleSim(seed);
    for (let i = 0; i < FIXED_ENTITY_COUNT; i++) sim.spawn();

    const trace: string[] = [];
    const recorder = {
        step(): void {
            sim.step();
            trace.push(sim.fingerprint());
        }
    };
    const tick = runLoop(headlessPump(FIXED_DT), recorder, () => {}, {
        dt: FIXED_DT,
        maxFrame: MAX_FRAME,
        maxSteps: MAX_STEPS
    });
    for (let i = 0; i < ticks; i++) tick();
    return trace;
}
