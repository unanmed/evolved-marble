import { describe, expect, it } from 'vitest';

import type { IRng } from '@/common/types';
import { CLASS_DEFS } from '@/units/data';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind } from '@/units/types';

/** 分布统计的默认样本量。 */
const SAMPLE_COUNT = 100000;

/** 生成时会被随机抽取的 7 项属性。 */
const RANDOMIZED_ATTRIBUTES: AttributeKind[] = [
    AttributeKind.MaxHealth,
    AttributeKind.ControlLevel,
    AttributeKind.Attack,
    AttributeKind.Defense,
    AttributeKind.WeaponRatio,
    AttributeKind.ArmorRatio,
    AttributeKind.Mass
];

/**
 * mulberry32 确定性伪随机发生器：固定种子下产生可复现的 `[0, 1)` 均匀序列。
 * @param seed 初始种子。
 * @returns 一个确定性的 `IRng`。
 */
function mulberry32(seed: number): IRng {
    let state = seed >>> 0;
    return {
        next(): number {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    };
}

/**
 * 采集某职业某属性的 `count` 个样本值。
 * @param classKind 职业。
 * @param kind 要采集的属性。
 * @param rng 确定性随机源。
 * @param count 样本数量。
 * @returns 样本值列表。
 */
function sampleAttribute(
    classKind: ClassKind,
    kind: AttributeKind,
    rng: IRng,
    count: number
): number[] {
    const values: number[] = [];
    for (let i = 0; i < count; i += 1) {
        values.push(spawnUnit(classKind, rng).getAttribute(kind));
    }
    return values;
}

/**
 * 计算样本均值。
 * @param values 样本值列表。
 * @returns 算术平均。
 */
function mean(values: readonly number[]): number {
    return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/**
 * 计算样本标准差（分母 n−1）。
 * @param values 样本值列表。
 * @returns 样本标准差。
 */
function sampleStd(values: readonly number[]): number {
    const average = mean(values);
    const variance =
        values.reduce((sum, value) => sum + (value - average) ** 2, 0) /
        (values.length - 1);
    return Math.sqrt(variance);
}

describe('spawnUnit — normal distribution (Swordsman MaxHealth)', () => {
    it('mean is within 2% of the class base (200)', () => {
        const rng = mulberry32(1);
        const values = sampleAttribute(
            ClassKind.Swordsman,
            AttributeKind.MaxHealth,
            rng,
            SAMPLE_COUNT
        );

        expect(mean(values) / 200).toBeCloseTo(1, 2);
    });

    it('standard deviation is within 5% of mean/8 (25)', () => {
        const rng = mulberry32(2);
        const values = sampleAttribute(
            ClassKind.Swordsman,
            AttributeKind.MaxHealth,
            rng,
            SAMPLE_COUNT
        );

        expect(sampleStd(values) / 25).toBeCloseTo(1, 1);
    });
});

describe('spawnUnit — second class spot-check (Hammer Attack)', () => {
    it('mean is within 2% of 80 and deviation is within 5% of 10', () => {
        const rng = mulberry32(3);
        const values = sampleAttribute(
            ClassKind.Hammer,
            AttributeKind.Attack,
            rng,
            SAMPLE_COUNT
        );

        expect(mean(values) / 80).toBeCloseTo(1, 2);
        expect(sampleStd(values) / 10).toBeCloseTo(1, 1);
    });
});

describe('spawnUnit — control level uses the shared base (10)', () => {
    it('mean is within 2% of 10 for every class and every sample is non-negative', () => {
        for (const classKind of Object.values(ClassKind).filter(
            (value): value is ClassKind => typeof value === 'number'
        )) {
            const rng = mulberry32(10 + classKind);
            const values = sampleAttribute(
                classKind,
                AttributeKind.ControlLevel,
                rng,
                SAMPLE_COUNT
            );

            expect(mean(values) / 10).toBeCloseTo(1, 2);
            expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
        }
    });
});

describe('spawnUnit — every randomized attribute stays finite and non-negative', () => {
    it('yields no negative or non-finite value across all 7 attributes', () => {
        for (const kind of RANDOMIZED_ATTRIBUTES) {
            const rng = mulberry32(1000 + kind);
            const values = sampleAttribute(
                ClassKind.Swordsman,
                kind,
                rng,
                10000
            );

            for (const value of values) {
                expect(Number.isFinite(value)).toBe(true);
                expect(value).toBeGreaterThanOrEqual(0);
            }
        }
    });
});

describe('spawnUnit — assigned display name (D-12)', () => {
    it('gives consecutive units distinct non-empty names starting with the class name', () => {
        const rng = mulberry32(7);
        const first = spawnUnit(ClassKind.Swordsman, rng).getName();
        const second = spawnUnit(ClassKind.Swordsman, rng).getName();
        const className = CLASS_DEFS[ClassKind.Swordsman].name;

        expect(first.length).toBeGreaterThan(0);
        expect(second.length).toBeGreaterThan(0);
        expect(first).not.toBe(second);
        expect(first.startsWith(className)).toBe(true);
        expect(second.startsWith(className)).toBe(true);
        expect(first).toMatch(/#\d+$/);
        expect(second).toMatch(/#\d+$/);
    });
});
