import { describe, expect, it } from 'vitest';

import { CLASS_DEFS, LEVEL_THRESHOLD_BASE } from '@/units/data';
import {
    ArmorKind,
    AttributeKind,
    ClassKind,
    EquipmentKind
} from '@/units/types';
import { Unit } from '@/units/Unit';

/**
 * 与剑士职业基础值完全一致的生成属性，使每项期望值都精确可断言。
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

/**
 * 剑士在给定等级升级所需经验 `100·(1+R_E)^L`，由数据表实时推导。
 */
const swordsmanThresholdAt = (level: number): number =>
    LEVEL_THRESHOLD_BASE *
    (1 + CLASS_DEFS[ClassKind.Swordsman].experienceRatio) ** level;

describe('Unit — attack/defense/kill experience formulas', () => {
    it('earns R_A·√(D−50) attack experience only above the 50 gate', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.gainAttackExperience(150);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(5);

        unit.gainAttackExperience(50);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(5);
    });

    it('earns R_D·√(ΔD−50) defense experience only above the 50 gate', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.gainDefenseExperience(150);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(5);

        unit.gainDefenseExperience(49);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(5);
    });

    it('earns R_A·10·L kill experience', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.gainKillExperience(3);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(15);
    });
});

describe('Unit — level-up threshold and level change', () => {
    it('does not level up below 100·(1+R_E)^L', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        /* 100 < threshold(1) ≈ 110. */
        unit.gainKillExperience(20);
        expect(unit.getAttribute(AttributeKind.Level)).toBe(1);
        expect(unit.getAttribute(AttributeKind.Experience)).toBe(100);
    });

    it('levels up when experience reaches the threshold and carries the remainder', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        /* 150 ≥ threshold(1) ≈ 110 → level 2, remainder carried. */
        unit.gainKillExperience(30);
        expect(unit.getAttribute(AttributeKind.Level)).toBe(2);
        expect(unit.getAttribute(AttributeKind.Experience)).toBeCloseTo(
            150 - swordsmanThresholdAt(1),
            6
        );
    });
});

describe('Unit — per-class growth on level-up (OQ-2)', () => {
    it('grows Attack (level-scaling), Defense (flat), ControlLevel (+5) and MaxHealth (+maxHpGrowth)', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.gainKillExperience(30); // level 2
        expect(unit.getAttribute(AttributeKind.Level)).toBe(2);
        expect(unit.getAttribute(AttributeKind.Attack)).toBe(70); // 60 + 10
        expect(unit.getAttribute(AttributeKind.Defense)).toBe(30); // 24 + 6
        expect(unit.getAttribute(AttributeKind.ControlLevel)).toBe(15); // 10 + 5
        expect(unit.getAttribute(AttributeKind.MaxHealth)).toBe(220); // 200 + 20

        unit.gainKillExperience(30); // level 3
        expect(unit.getAttribute(AttributeKind.Level)).toBe(3);
        expect(unit.getAttribute(AttributeKind.Attack)).toBe(90); // 60 + 10·3·2/2
        expect(unit.getAttribute(AttributeKind.Defense)).toBe(36); // 24 + 6·2
        expect(unit.getAttribute(AttributeKind.ControlLevel)).toBe(20); // 10 + 5·2
        expect(unit.getAttribute(AttributeKind.MaxHealth)).toBe(240); // 200 + 20·2
    });
});

describe('Unit — health restore on level-up', () => {
    it('spawns at full health', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.getAttribute(AttributeKind.Health)).toBe(
            unit.getAttribute(AttributeKind.MaxHealth)
        );
    });

    it('restores health by the MaxHealth increase and never exceeds MaxHealth', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.takeDamage(50);
        expect(unit.getAttribute(AttributeKind.Health)).toBe(150);

        unit.gainKillExperience(30); // level 2 → +20 MaxHealth
        expect(unit.getAttribute(AttributeKind.Health)).toBe(170);
        expect(unit.getAttribute(AttributeKind.Health)).toBeLessThanOrEqual(
            unit.getAttribute(AttributeKind.MaxHealth)
        );
    });
});

describe('Unit — level unlock table', () => {
    it('grants the Shield armor at level 3', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        expect(unit.getEquipment()).not.toContainEqual({
            kind: EquipmentKind.Armor,
            armor: ArmorKind.Shield
        });

        unit.gainKillExperience(30); // level 2
        unit.gainKillExperience(30); // level 3
        expect(unit.getAttribute(AttributeKind.Level)).toBe(3);
        expect(unit.getEquipment()).toContainEqual({
            kind: EquipmentKind.Armor,
            armor: ArmorKind.Shield
        });
    });
});

describe('Unit — multi-level grant terminates', () => {
    it('raises the level by more than one from a single large grant', () => {
        const unit = new Unit(ClassKind.Swordsman, SWORDSMAN_ROLL);

        unit.gainKillExperience(1000); // 5000 xp → several levels

        expect(unit.getAttribute(AttributeKind.Level)).toBeGreaterThan(2);
        expect(unit.getAttribute(AttributeKind.Health)).toBeLessThanOrEqual(
            unit.getAttribute(AttributeKind.MaxHealth)
        );
    });
});
