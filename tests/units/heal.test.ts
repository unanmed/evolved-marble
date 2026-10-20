import { describe, expect, it } from 'vitest';

import { AttributeKind, ClassKind, ModifierMode } from '@/units/types';
import type { IHealableUnit, IModifier, ISpawnAttributes } from '@/units/types';
import { Unit } from '@/units/Unit';
import { spawnUnit } from '@/units/spawn';
import { mulberry32 } from '../helpers/rng';

/** 与剑士职业基础值一致的确定性生成属性（无随机抽取）。 */
const SWORDSMAN_ROLL: ISpawnAttributes = {
    maxHp: 200,
    controlLevel: 10,
    attack: 60,
    defense: 24,
    weaponRatio: 1.0,
    armorRatio: 0.8,
    mass: 70
};

/**
 * 读取生命值。
 * @param unit 单位。
 * @returns 当前生命值。
 */
function healthOf(unit: IHealableUnit): number {
    return unit.getAttribute(AttributeKind.Health);
}

/**
 * 读取（经修正器调整后的）生命上限。
 * @param unit 单位。
 * @returns 当前生命上限。
 */
function maxHealthOf(unit: IHealableUnit): number {
    return unit.getAttribute(AttributeKind.MaxHealth);
}

describe('Unit.heal — G-1 healing', () => {
    it('keeps a full-health unit at max health', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.heal(10);

        expect(healthOf(unit)).toBe(200);
        expect(healthOf(unit)).toBe(maxHealthOf(unit));
    });

    it('adds exactly the healed amount to a damaged unit', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);
        unit.takeDamage(30);

        unit.heal(10);

        expect(healthOf(unit)).toBe(180);
    });

    it('clamps to max health when healed for more than the missing amount', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);
        unit.takeDamage(5);

        unit.heal(999);

        expect(healthOf(unit)).toBe(200);
        expect(healthOf(unit)).toBe(maxHealthOf(unit));
    });

    it('clamps to the modifier-adjusted maximum, never the unmodified base', () => {
        const flatMaxHealth: IModifier = {
            kind: AttributeKind.MaxHealth,
            mode: ModifierMode.Flat,
            value: 50
        };
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL, [
            flatMaxHealth
        ]);
        expect(maxHealthOf(unit)).toBe(250);

        unit.takeDamage(100);
        expect(healthOf(unit)).toBe(150);

        unit.heal(999);

        expect(healthOf(unit)).toBe(250);
    });

    it('ignores non-finite, zero and negative amounts without touching health', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);
        unit.takeDamage(30);

        for (const invalid of [NaN, Infinity, -Infinity, 0, -5]) {
            unit.heal(invalid);
            expect(healthOf(unit)).toBe(170);
        }
    });

    it('never revives a dead unit (death stays permanent, D-06)', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);
        unit.takeDamage(9999);
        expect(healthOf(unit)).toBe(0);
        expect(unit.isAlive()).toBe(false);

        unit.heal(100);

        expect(healthOf(unit)).toBe(0);
        expect(unit.isAlive()).toBe(false);
    });

    it('is reachable from spawnUnit through IHealableUnit without a cast (C-2)', () => {
        const unit: IHealableUnit = spawnUnit(
            ClassKind.Swordsman,
            mulberry32(1)
        );
        unit.takeDamage(30);
        const damaged = healthOf(unit);

        unit.heal(10);

        expect(healthOf(unit)).toBeCloseTo(damaged + 10, 6);
        expect(healthOf(unit)).toBeLessThanOrEqual(maxHealthOf(unit));
    });
});
