import { describe, expect, it } from 'vitest';

import {
    ALL_CLASS_KINDS,
    ATTACK_EXP_DAMAGE_GATE,
    CLASS_DEFS,
    CONTROL_LEVEL_BASE,
    CONTROL_LEVEL_GROWTH_PER_LEVEL,
    DEFENSE_EXP_DAMAGE_GATE,
    KILL_EXP_LEVEL_FACTOR,
    LEVEL_THRESHOLD_BASE
} from '@/units/data';
import {
    ArmorKind,
    ClassKind,
    EquipmentKind,
    SkillKind,
    WeaponKind
} from '@/units/types';

describe('units/data — CLASS_DEFS completeness', () => {
    it('holds exactly the 7 ClassKind entries', () => {
        expect(Object.keys(CLASS_DEFS)).toHaveLength(7);
        expect(ALL_CLASS_KINDS).toHaveLength(7);
    });

    it('ALL_CLASS_KINDS lists the 7 values in order and no reverse-mapped strings', () => {
        expect(ALL_CLASS_KINDS).toEqual([
            ClassKind.Swordsman,
            ClassKind.Archer,
            ClassKind.Berserker,
            ClassKind.Hammer,
            ClassKind.Knight,
            ClassKind.SwordShield,
            ClassKind.Spearman
        ]);
        for (const kind of ALL_CLASS_KINDS) {
            expect(typeof kind).toBe('number');
        }
    });

    it('exposes the shared control-level calibration constants', () => {
        expect(CONTROL_LEVEL_BASE).toBe(10);
        expect(CONTROL_LEVEL_GROWTH_PER_LEVEL).toBe(5);
    });

    it('pins every level/experience calibration constant to its spec value', () => {
        expect(ATTACK_EXP_DAMAGE_GATE).toBe(50);
        expect(DEFENSE_EXP_DAMAGE_GATE).toBe(50);
        expect(KILL_EXP_LEVEL_FACTOR).toBe(10);
        expect(LEVEL_THRESHOLD_BASE).toBe(100);
    });
});

describe('units/data — CLASS_DEFS spec-exact base values', () => {
    it('Swordsman 剑士', () => {
        const def = CLASS_DEFS[ClassKind.Swordsman];
        expect(def.id).toBe(ClassKind.Swordsman);
        expect(def.name).toBe('剑士');
        expect(def.maxHp).toBe(200);
        expect(def.attack).toBe(60);
        expect(def.defense).toBe(24);
        expect(def.weaponRatio).toBe(1.0);
        expect(def.armorRatio).toBe(0.8);
        expect(def.mass).toBe(70);
        expect(def.experienceRatio).toBe(0.1);
        expect(def.attackExpRatio).toBe(0.5);
        expect(def.defenseExpRatio).toBe(0.5);
        expect(def.attackGrowth).toBe(10);
        expect(def.defenseGrowth).toBe(6);
        expect(def.maxHpGrowth).toBe(20);
    });

    it('Archer 弓箭手', () => {
        const def = CLASS_DEFS[ClassKind.Archer];
        expect(def.maxHp).toBe(140);
        expect(def.attack).toBe(50);
        expect(def.defense).toBe(9);
        expect(def.weaponRatio).toBe(0.9);
        expect(def.armorRatio).toBe(0.6);
        expect(def.mass).toBe(55);
        expect(def.experienceRatio).toBe(0.12);
        expect(def.attackExpRatio).toBe(0.8);
        expect(def.defenseExpRatio).toBe(0.2);
        expect(def.attackGrowth).toBe(15);
        expect(def.defenseGrowth).toBe(3);
        expect(def.maxHpGrowth).toBe(14);
    });

    it('Berserker 狂战士', () => {
        const def = CLASS_DEFS[ClassKind.Berserker];
        expect(def.maxHp).toBe(260);
        expect(def.attack).toBe(75);
        expect(def.defense).toBe(15);
        expect(def.weaponRatio).toBe(1.3);
        expect(def.armorRatio).toBe(0.5);
        expect(def.mass).toBe(85);
        expect(def.experienceRatio).toBe(0.15);
        expect(def.attackExpRatio).toBe(0.7);
        expect(def.defenseExpRatio).toBe(0.3);
        expect(def.attackGrowth).toBe(15);
        expect(def.defenseGrowth).toBe(4);
        expect(def.maxHpGrowth).toBe(26);
    });

    it('Hammer 锤兵', () => {
        const def = CLASS_DEFS[ClassKind.Hammer];
        expect(def.maxHp).toBe(240);
        expect(def.attack).toBe(80);
        expect(def.defense).toBe(20);
        expect(def.weaponRatio).toBe(1.0);
        expect(def.armorRatio).toBe(0.7);
        expect(def.mass).toBe(110);
        expect(def.experienceRatio).toBe(0.15);
        expect(def.attackExpRatio).toBe(0.8);
        expect(def.defenseExpRatio).toBe(0.5);
        expect(def.attackGrowth).toBe(10);
        expect(def.defenseGrowth).toBe(6);
        expect(def.maxHpGrowth).toBe(24);
    });

    it('Knight 骑士', () => {
        const def = CLASS_DEFS[ClassKind.Knight];
        expect(def.maxHp).toBe(280);
        expect(def.attack).toBe(55);
        expect(def.defense).toBe(30);
        expect(def.weaponRatio).toBe(1.0);
        expect(def.armorRatio).toBe(1.0);
        expect(def.mass).toBe(120);
        expect(def.experienceRatio).toBe(0.1);
        expect(def.attackExpRatio).toBe(0.5);
        expect(def.defenseExpRatio).toBe(0.6);
        expect(def.attackGrowth).toBe(15);
        expect(def.defenseGrowth).toBe(6);
        expect(def.maxHpGrowth).toBe(28);
    });

    it('SwordShield 剑盾', () => {
        const def = CLASS_DEFS[ClassKind.SwordShield];
        expect(def.maxHp).toBe(220);
        expect(def.attack).toBe(40);
        expect(def.defense).toBe(40);
        expect(def.weaponRatio).toBe(0.8);
        expect(def.armorRatio).toBe(1.4);
        expect(def.mass).toBe(95);
        expect(def.experienceRatio).toBe(0.08);
        expect(def.attackExpRatio).toBe(0.4);
        expect(def.defenseExpRatio).toBe(0.9);
        expect(def.attackGrowth).toBe(10);
        expect(def.defenseGrowth).toBe(8);
        expect(def.maxHpGrowth).toBe(22);
    });

    it('Spearman 长矛兵', () => {
        const def = CLASS_DEFS[ClassKind.Spearman];
        expect(def.maxHp).toBe(200);
        expect(def.attack).toBe(48);
        expect(def.defense).toBe(22);
        expect(def.weaponRatio).toBe(1.1);
        expect(def.armorRatio).toBe(0.9);
        expect(def.mass).toBe(85);
        expect(def.experienceRatio).toBe(0.1);
        expect(def.attackExpRatio).toBe(0.7);
        expect(def.defenseExpRatio).toBe(0.4);
        expect(def.attackGrowth).toBe(12);
        expect(def.defenseGrowth).toBe(4);
        expect(def.maxHpGrowth).toBe(20);
    });
});

describe('units/data — initial equipment and unlocks', () => {
    it('Swordsman starts with a Longsword and unlocks Shield at level 3', () => {
        expect(CLASS_DEFS[ClassKind.Swordsman].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Longsword }
        ]);
        expect(CLASS_DEFS[ClassKind.Swordsman].unlocks).toEqual([
            {
                level: 3,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]);
    });

    it('Archer starts with a Bow, learns ArrowStorm at 5 and Helmet at 8', () => {
        expect(CLASS_DEFS[ClassKind.Archer].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Bow }
        ]);
        expect(CLASS_DEFS[ClassKind.Archer].unlocks).toEqual([
            { level: 5, equipment: [], skills: [SkillKind.ArrowStorm] },
            {
                level: 8,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            }
        ]);
    });

    it('Berserker has 3 unlocks: Helmet@2, a second Axe@4, Charge skill@6', () => {
        expect(CLASS_DEFS[ClassKind.Berserker].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Axe }
        ]);
        const unlocks = CLASS_DEFS[ClassKind.Berserker].unlocks;
        expect(unlocks).toHaveLength(3);
        expect(unlocks[0]).toEqual({
            level: 2,
            equipment: [{ kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }],
            skills: []
        });
        expect(unlocks[1]).toEqual({
            level: 4,
            equipment: [{ kind: EquipmentKind.Weapon, weapon: WeaponKind.Axe }],
            skills: []
        });
        expect(unlocks[2]).toEqual({
            level: 6,
            equipment: [],
            skills: [SkillKind.Charge]
        });
    });

    it('Hammer starts with a Hammer, gets Helmet@2 and Spin skill@6', () => {
        expect(CLASS_DEFS[ClassKind.Hammer].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Hammer }
        ]);
        expect(CLASS_DEFS[ClassKind.Hammer].unlocks).toEqual([
            {
                level: 2,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            },
            { level: 6, equipment: [], skills: [SkillKind.Spin] }
        ]);
    });

    it('Knight starts with Longsword + Helmet and unlocks Shield at level 6', () => {
        expect(CLASS_DEFS[ClassKind.Knight].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Longsword },
            { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
        ]);
        expect(CLASS_DEFS[ClassKind.Knight].unlocks).toEqual([
            {
                level: 6,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]);
    });

    it('SwordShield starts with Shortsword + Shield and unlocks Helmet at level 7', () => {
        expect(CLASS_DEFS[ClassKind.SwordShield].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Shortsword },
            { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
        ]);
        expect(CLASS_DEFS[ClassKind.SwordShield].unlocks).toEqual([
            {
                level: 7,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            }
        ]);
    });

    it('Spearman starts with a Spear, gets Helmet@3 and Shield@8', () => {
        expect(CLASS_DEFS[ClassKind.Spearman].initialEquipment).toEqual([
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Spear }
        ]);
        expect(CLASS_DEFS[ClassKind.Spearman].unlocks).toEqual([
            {
                level: 3,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            },
            {
                level: 8,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]);
    });

    it('every class names itself with its Chinese label and carries only body mass', () => {
        const names = ALL_CLASS_KINDS.map(kind => CLASS_DEFS[kind].name);
        expect(names).toEqual([
            '剑士',
            '弓箭手',
            '狂战士',
            '锤兵',
            '骑士',
            '剑盾',
            '长矛兵'
        ]);
        const masses = ALL_CLASS_KINDS.map(kind => CLASS_DEFS[kind].mass);
        expect(masses).toEqual([70, 55, 85, 110, 120, 95, 85]);
    });
});
