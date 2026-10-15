import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config/sim';
import { TickClock } from '../../src/sim/core/clock';

/**
 * 固定步长逻辑时钟（SIM-01）。
 *
 * 时间是一个单调递增的步计数，绝不读取墙上时钟：`step()` 是时间前进的唯一途径。
 */

/** 被 mock 的 `performance` 全局的最小契约（D-16）。 */
interface IPerformanceStub {
    /** 返回当前时间（本测试中被打桩）。 */
    now: () => number;
}

/** 承载可选 `performance` 的全局对象视图（D-16：具名接口，避免内联类型）。 */
interface IPerformanceGlobal {
    /** 浏览器的 performance 全局（可选）。 */
    performance?: IPerformanceStub;
}

describe('TickClock (fixed-step, SIM-01)', () => {
    it('starts at tick 0', () => {
        expect(new TickClock(FIXED_DT).tick).toBe(0);
    });

    it('step() increments the tick counter by exactly 1', () => {
        const clock = new TickClock(FIXED_DT);
        clock.step();
        expect(clock.tick).toBe(1);
        for (let i = 0; i < 100; i++) clock.step();
        expect(clock.tick).toBe(101);
    });

    it('never reads the wall clock', () => {
        const realNow = Date.now;
        const perf = (globalThis as IPerformanceGlobal).performance;
        const realPerfNow = perf?.now;

        let wallClockReads = 0;
        Date.now = () => {
            wallClockReads++;
            return 0;
        };
        if (perf) {
            perf.now = () => {
                wallClockReads++;
                return 0;
            };
        }
        try {
            const clock = new TickClock(FIXED_DT);
            for (let i = 0; i < 10; i++) clock.step();
            // 断言置于补丁窗口内：`toBe` 不读时钟，故不会污染计数
            expect(clock.tick).toBe(10);
        } finally {
            Date.now = realNow;
            if (perf && realPerfNow) perf.now = realPerfNow;
        }

        expect(wallClockReads).toBe(0);
    });
});
