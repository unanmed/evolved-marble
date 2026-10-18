import { describe, expect, it } from 'vitest';

import { MathRng, sampleNormal } from '@/common/rng';
import type { IRng } from '@/common/types';

/**
 * 按脚本返回预设序列的测试随机源；序列耗尽后回退到 0.5。
 * @param values 依次返回的均匀随机数序列。
 * @returns 一个仅按脚本吐出数值的 `IRng`。
 */
function scriptedRng(values: readonly number[]): IRng {
    let index = 0;
    return {
        next(): number {
            const value = values[index];
            index += 1;
            return value ?? 0.5;
        }
    };
}

describe('sampleNormal — Box–Muller known vector', () => {
    it('returns the mean when the two uniform draws give z = 0', () => {
        const rng = scriptedRng([0.5, 0.25]);

        expect(sampleNormal(rng, 100, 10)).toBeCloseTo(100, 10);
    });
});

describe('sampleNormal — zero guard', () => {
    it('skips a zero first draw so Math.log(0) is never taken', () => {
        const rng = scriptedRng([0, 0.5, 0.25]);
        const value = sampleNormal(rng, 100, 10);

        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeCloseTo(100, 10);
    });
});

describe('sampleNormal — non-negative clamp', () => {
    it('clamps a negative sample to exactly 0', () => {
        const rng = scriptedRng([0.5, 0.5]);

        expect(sampleNormal(rng, 0, 10)).toBe(0);
    });
});

describe('sampleNormal — out-of-range / non-finite draw guard (T-01-11)', () => {
    it('re-draws a u1 > 1 instead of returning NaN', () => {
        const rng = scriptedRng([1.5, 0.5, 0.25]);
        const value = sampleNormal(rng, 100, 10);

        expect(Number.isFinite(value)).toBe(true);
        expect(Number.isNaN(value)).toBe(false);
        expect(value).toBeCloseTo(100, 10);
    });

    it('re-draws a non-finite u1 and still returns a finite sample', () => {
        for (const bad of [NaN, Infinity, -Infinity]) {
            const rng = scriptedRng([bad, 0.5, 0.25]);
            const value = sampleNormal(rng, 100, 10);

            expect(Number.isFinite(value)).toBe(true);
            expect(Number.isNaN(value)).toBe(false);
            expect(value).toBeCloseTo(100, 10);
        }
    });

    it('returns a finite non-negative value when every earlier draw is invalid', () => {
        const rng = scriptedRng([2, -1, 0, 0.5, 0.25]);
        const value = sampleNormal(rng, 100, 10);

        expect(Number.isFinite(value)).toBe(true);
        expect(value).toBeGreaterThanOrEqual(0);
    });
});

describe('MathRng — default non-deterministic source', () => {
    it('always returns a number in [0, 1)', () => {
        const rng = new MathRng();

        for (let i = 0; i < 1000; i += 1) {
            const value = rng.next();
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
            expect(value).toBeLessThan(1);
        }
    });
});
