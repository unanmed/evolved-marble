import { describe, expect, it } from 'vitest';

import { CLASS_DEFS } from '@/units/data';
import {
    AttributeKind,
    ClassKind,
    EquipmentKind,
    ModifierMode,
    WeaponKind
} from '@/units/types';
import type { IModifier } from '@/units/types';
import { Unit } from '@/units/Unit';

/**
 * 全部数值型属性成员的固定列表（取自数字枚举的值侧，剔除反向映射出的字符串键）。
 */
const ALL_ATTRIBUTE_KINDS: AttributeKind[] = Object.values(
    AttributeKind
).filter((value): value is AttributeKind => typeof value === 'number');

/**
 * 与剑士职业基础值完全一致的生成属性，用于得到确定性的期望值。
 */
const SWORDSMAN_ROLL = {
    maxHp: 200,
    controlLevel: 10,
    attack: 60,
    defense: 24,
    weaponRatio: 1.0,
    armorRatio: 0.8,
    mass: 70
};

describe('Unit.getAttribute — every numeric attribute is readable and finite', () => {
    it('returns a finite number for every AttributeKind', () => {
        const unit = new Unit(ClassKind.Swordsman, {
            maxHp: 200,
            controlLevel: 10,
            attack: 60,
            defense: 24,
            weaponRatio: 1.0,
            armorRatio: 0.8,
            mass: 70
        });

        for (const kind of ALL_ATTRIBUTE_KINDS) {
            expect(Number.isFinite(unit.getAttribute(kind))).toBe(true);
        }
    });

    it('covers all 13 numeric AttributeKind members without NaN/Infinity/undefined', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(ALL_ATTRIBUTE_KINDS).toHaveLength(13);
        for (let ordinal = 0; ordinal <= 12; ordinal += 1) {
            const value = unit.getAttribute(ordinal as AttributeKind);
            expect(typeof value).toBe('number');
            expect(Number.isNaN(value)).toBe(false);
            expect(Number.isFinite(value)).toBe(true);
        }
    });
});

describe('Unit — damage and death', () => {
    it('reduces Health by the damage amount and reports death at zero', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.isAlive()).toBe(true);

        unit.takeDamage(30);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(170);
        expect(unit.isAlive()).toBe(true);

        unit.takeDamage(1000);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(0);
        expect(unit.isAlive()).toBe(false);
    });
});

describe('Unit — takeDamage input guard (T-01-08)', () => {
    it('ignores non-finite or non-positive damage without corrupting Health', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        for (const invalid of [NaN, Infinity, -Infinity, -100, 0]) {
            unit.takeDamage(invalid);
            expect(unit.getAttribute(AttributeKind.Health)).toBe(200);
            expect(unit.isAlive()).toBe(true);
        }
    });

    it('never lets Health exceed MaxHealth when given negative damage', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.takeDamage(50);
        unit.takeDamage(-1000);

        expect(unit.getAttribute(AttributeKind.Health)).toBe(150);
        expect(unit.getAttribute(AttributeKind.Health)).toBeLessThanOrEqual(
            unit.getAttribute(AttributeKind.MaxHealth)
        );
    });

    it('keeps Health finite and clamped after a non-finite damage attempt', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.takeDamage(NaN);

        const health = unit.getAttribute(AttributeKind.Health);
        expect(Number.isFinite(health)).toBe(true);
        expect(Number.isNaN(health)).toBe(false);
        expect(health).toBe(200);
    });
});

describe('Unit constructor — classKind validation (WR-03)', () => {
    it('throws a RangeError for an out-of-range class ordinal', () => {
        expect(() => new Unit(99 as ClassKind, SWORDSMAN_ROLL)).toThrowError(
            RangeError
        );
    });

    it('names the offending ClassKind in the error message', () => {
        expect(() => new Unit(-1 as ClassKind, SWORDSMAN_ROLL)).toThrow(
            'Unknown ClassKind: -1'
        );
    });

    it('still constructs successfully for every valid ClassKind', () => {
        for (const kind of Object.values(ClassKind).filter(
            (value): value is ClassKind => typeof value === 'number'
        )) {
            expect(new Unit(kind, SWORDSMAN_ROLL).getClass()).toBe(kind);
        }
    });
});

describe('Unit — non-numeric accessors', () => {
    it('exposes class, initial equipment, modifiers, skills and a non-empty name', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.getClass()).toBe(ClassKind.Swordsman);
        expect(unit.getEquipment()).toContainEqual({
            kind: EquipmentKind.Weapon,
            weapon: WeaponKind.Longsword
        });
        expect(Array.isArray(unit.getModifiers())).toBe(true);
        expect(Array.isArray(unit.getSkills())).toBe(true);
        expect(unit.getSkills()).toEqual([]);
        expect(typeof unit.getName()).toBe('string');
        expect(unit.getName().length).toBeGreaterThan(0);
    });
});

describe('Unit — rolled spawn bases are read, not the static class constants', () => {
    it('reflects a roll that differs from the class base at level 1', () => {
        const unit = new Unit(ClassKind.Swordsman, {
            maxHp: 220,
            controlLevel: 12,
            attack: 66,
            defense: 21,
            weaponRatio: 1.0,
            armorRatio: 0.8,
            mass: 70
        });

        expect(unit.getAttribute(AttributeKind.MaxHealth)).toBe(220);
        expect(unit.getAttribute(AttributeKind.Attack)).toBe(66);
        expect(unit.getAttribute(AttributeKind.Defense)).toBe(21);
        expect(unit.getAttribute(AttributeKind.ControlLevel)).toBe(12);
    });
});

describe('Unit — spawns at full health', () => {
    it('sets Health equal to MaxHealth for a roll matching the class base', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.getAttribute(AttributeKind.Health)).toBe(200);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(
            unit.getAttribute(AttributeKind.MaxHealth)
        );
    });

    it('sets Health equal to the rolled MaxHealth when the roll differs from the base', () => {
        const archer = new Unit(ClassKind.Archer, {
            maxHp: 160,
            controlLevel: 10,
            attack: 50,
            defense: 9,
            weaponRatio: 0.9,
            armorRatio: 0.6,
            mass: 55
        });

        expect(archer.getAttribute(AttributeKind.MaxHealth)).toBe(160);
        expect(archer.getAttribute(AttributeKind.Health)).toBe(160);
        expect(archer.getAttribute(AttributeKind.Health)).toBe(
            archer.getAttribute(AttributeKind.MaxHealth)
        );
    });
});

describe('Unit — injected modifiers affect the three combat stats', () => {
    it('applies a flat modifier to Attack', () => {
        const flat: IModifier = {
            kind: AttributeKind.Attack,
            mode: ModifierMode.Flat,
            value: 25
        };
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL, [flat]);

        expect(unit.getModifiers()).toHaveLength(1);
        expect(unit.getModifiers()).toContainEqual(flat);
        expect(unit.getAttribute(AttributeKind.Attack)).toBe(85);
    });

    it('applies a multiplicative modifier to Attack', () => {
        const multiplicative: IModifier = {
            kind: AttributeKind.Attack,
            mode: ModifierMode.Multiplicative,
            value: 0.5
        };
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL, [
            multiplicative
        ]);

        expect(unit.getAttribute(AttributeKind.Attack)).toBe(90);
    });
});

describe('Unit.getName — name fixed at construction (D-12)', () => {
    it('returns an explicit name verbatim', () => {
        const unit = new Unit(
            ClassKind.Swordsman,
            SWORDSMAN_ROLL,
            [],
            '剑士#7'
        );

        expect(unit.getName()).toBe('剑士#7');
    });

    it('falls back to the class name when the name argument is omitted', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.getName()).toBe(CLASS_DEFS[ClassKind.Swordsman].name);
    });
});
