import { describe, expect, it } from 'vitest';

import {
    computeDamageMean,
    computeDamageReduction,
    computeFinalDamage,
    DAMAGE_JITTER_SIGMA_DIVISOR,
    isDamageBearingPair,
    rollDamage
} from '@/physics/damage';
import { ColliderPart } from '@/physics/types';

// 复用 02-01 建立的确定性 IRng 辅助（AGENTS §9：不重复造采样器）。
import { mulberry32 } from '../helpers/rng';

describe('computeDamageMean — spec mean D̄_R', () => {
    it('matches hand-computed values for the spec formula', () => {
        // 60·1·1.2·(√9 − 1) = 60·1.2·2 = 144
        expect(computeDamageMean(60, 1, 1.2, 9)).toBeCloseTo(144, 6);
        // 80·1·0.8·(√4 − 1) = 80·0.8·1 = 64
        expect(computeDamageMean(80, 1, 0.8, 4)).toBeCloseTo(64, 6);
    });

    it('clamps the max(…,0) when the (√Δv − 1) term is ≤ 0', () => {
        // Δv 1 → (1 − 1) = 0 → 0
        expect(computeDamageMean(60, 1, 1.2, 1)).toBe(0);
        // Δv 0.25 → √ = 0.5 → (0.5 − 1) = −0.5 → clamped to 0
        expect(computeDamageMean(60, 1, 1.2, 0.25)).toBe(0);
        expect(computeDamageMean(60, 1, 1.2, 0)).toBe(0);
    });

    it('guards non-finite / negative Δv to a finite, non-negative result', () => {
        for (const deltaV of [Number.NaN, Number.POSITIVE_INFINITY, -9]) {
            const result = computeDamageMean(60, 1, 1.2, deltaV);
            expect(Number.isFinite(result)).toBe(true);
            expect(result).toBeGreaterThanOrEqual(0);
        }
        expect(computeDamageMean(60, 1, 1.2, Number.NaN)).toBe(0);
        expect(computeDamageMean(60, 1, 1.2, Number.POSITIVE_INFINITY)).toBe(0);
        expect(computeDamageMean(60, 1, 1.2, -9)).toBe(0);
    });
});

describe('rollDamage — shared sampleNormal jitter (σ = mean/20)', () => {
    it('exposes the spec jitter divisor as 20', () => {
        expect(DAMAGE_JITTER_SIGMA_DIVISOR).toBe(20);
    });

    it('produces finite, non-negative samples with mean ≈ μ and σ ≈ μ/20', () => {
        const sampleCount = 2000;
        const mean = 100;
        const sigma = mean / DAMAGE_JITTER_SIGMA_DIVISOR; // 5
        const rng = mulberry32(0xc0ffee);

        const samples: number[] = [];
        for (let i = 0; i < sampleCount; i += 1) {
            samples.push(rollDamage(rng, mean));
        }

        for (const value of samples) {
            expect(Number.isFinite(value)).toBe(true);
            expect(value).toBeGreaterThanOrEqual(0);
        }

        const sampleMean =
            samples.reduce((sum, value) => sum + value, 0) / sampleCount;
        const variance =
            samples.reduce((sum, value) => sum + (value - sampleMean) ** 2, 0) /
            sampleCount;
        const sampleSd = Math.sqrt(variance);

        // 宽松容差：均值 ±10%，标准差 ±25%。
        expect(sampleMean).toBeGreaterThan(mean * 0.9);
        expect(sampleMean).toBeLessThan(mean * 1.1);
        expect(sampleSd).toBeGreaterThan(sigma * 0.75);
        expect(sampleSd).toBeLessThan(sigma * 1.25);
    });
});

describe('computeDamageReduction / computeFinalDamage — worked example', () => {
    // 守方剑士：A_D 24，P_D 0.8；头盔 S_D 1.0 → X = 24·0.8·1 = 19.2；D_R = 100。
    const defense = 24;
    const armorRatio = 0.8;
    const helmetDefenseRatio = 1.0;
    const damage = 100;

    it('锤子 (pen 5) bypasses most of the armor → final ≈ 96.30', () => {
        const reduction = computeDamageReduction(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            5
        );
        expect(reduction).toBeCloseTo(3.7, 2);
        expect(
            computeFinalDamage(
                damage,
                defense,
                armorRatio,
                helmetDefenseRatio,
                5
            )
        ).toBeCloseTo(96.3, 2);
    });

    it('短剑 (pen 1) lets more reduction through → final ≈ 83.89', () => {
        const reduction = computeDamageReduction(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            1
        );
        expect(reduction).toBeCloseTo(16.11, 2);
        expect(
            computeFinalDamage(
                damage,
                defense,
                armorRatio,
                helmetDefenseRatio,
                1
            )
        ).toBeCloseTo(83.89, 2);
    });

    it('returns a finite result when the denominator would be 0 (pen 0, no defense)', () => {
        expect(computeDamageReduction(100, 0, 0, 0, 0)).toBe(0);
        expect(computeFinalDamage(100, 0, 0, 0, 0)).toBe(100);
    });
});

describe('D-11 sign-consistency — higher penetration bypasses more armor', () => {
    it('锤子 (pen 5) deals more final damage than 弓箭 (pen 0.2) at equal D_R', () => {
        const defense = 24;
        const armorRatio = 0.8;
        const helmetDefenseRatio = 1.0;
        const damage = 100;

        const hammerFinal = computeFinalDamage(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            5
        );
        const bowFinal = computeFinalDamage(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            0.2
        );
        const hammerReduction = computeDamageReduction(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            5
        );
        const bowReduction = computeDamageReduction(
            damage,
            defense,
            armorRatio,
            helmetDefenseRatio,
            0.2
        );

        // 破甲越高 → 减伤越少、最终伤害越大（倒数读法会使该断言翻转）。
        expect(hammerFinal).toBeGreaterThan(bowFinal);
        expect(hammerReduction).toBeLessThan(bowReduction);
        expect(hammerFinal).toBeCloseTo(96.3, 2);
        expect(bowFinal).toBeCloseTo(51.02, 2);
    });
});

describe('isDamageBearingPair — D-13/OQ-4 classifier', () => {
    it('weapon↔body and weapon↔armor bear damage (either side order)', () => {
        expect(
            isDamageBearingPair(ColliderPart.Weapon, ColliderPart.Body)
        ).toBe(true);
        expect(
            isDamageBearingPair(ColliderPart.Body, ColliderPart.Weapon)
        ).toBe(true);
        expect(
            isDamageBearingPair(ColliderPart.Weapon, ColliderPart.Armor)
        ).toBe(true);
        expect(
            isDamageBearingPair(ColliderPart.Armor, ColliderPart.Weapon)
        ).toBe(true);
    });

    it('body↔body, weapon↔weapon and armor↔armor bear no damage', () => {
        expect(isDamageBearingPair(ColliderPart.Body, ColliderPart.Body)).toBe(
            false
        );
        expect(
            isDamageBearingPair(ColliderPart.Weapon, ColliderPart.Weapon)
        ).toBe(false);
        expect(
            isDamageBearingPair(ColliderPart.Armor, ColliderPart.Armor)
        ).toBe(false);
        expect(isDamageBearingPair(ColliderPart.Body, ColliderPart.Armor)).toBe(
            false
        );
    });
});
