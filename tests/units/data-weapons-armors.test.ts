import { describe, expect, it } from 'vitest';

import {
    ALL_ARMOR_KINDS,
    ALL_WEAPON_KINDS,
    ARMOR_DEFS,
    WEAPON_DEFS
} from '@/units/data';
import { ArmorKind, WeaponKind } from '@/units/types';

describe('units/data — WEAPON_DEFS completeness', () => {
    it('holds exactly the 6 WeaponKind entries', () => {
        expect(Object.keys(WEAPON_DEFS)).toHaveLength(6);
        expect(ALL_WEAPON_KINDS).toHaveLength(6);
    });

    it('ALL_WEAPON_KINDS lists the 6 values in order and no reverse-mapped strings', () => {
        expect(ALL_WEAPON_KINDS).toEqual([
            WeaponKind.Longsword,
            WeaponKind.Shortsword,
            WeaponKind.Axe,
            WeaponKind.Hammer,
            WeaponKind.Bow,
            WeaponKind.Spear
        ]);
        for (const kind of ALL_WEAPON_KINDS) {
            expect(typeof kind).toBe('number');
        }
    });
});

describe('units/data — WEAPON_DEFS spec-exact values', () => {
    it('matches name/mass/attackRatio for every weapon', () => {
        const rows: readonly [WeaponKind, string, number, number][] = [
            [WeaponKind.Longsword, '长剑', 12, 1.2],
            [WeaponKind.Shortsword, '短剑', 8, 1.0],
            [WeaponKind.Axe, '斧头', 16, 0.8],
            [WeaponKind.Hammer, '锤子', 25, 1.5],
            [WeaponKind.Bow, '弓箭', 6, 0.6],
            [WeaponKind.Spear, '长矛', 15, 0.8]
        ];
        for (const [kind, name, mass, attackRatio] of rows) {
            const def = WEAPON_DEFS[kind];
            expect(def.id).toBe(kind);
            expect(def.name).toBe(name);
            expect(def.mass).toBe(mass);
            expect(def.attackRatio).toBe(attackRatio);
        }
    });

    it('gives each weapon a penetration entry for BOTH armor kinds', () => {
        for (const kind of ALL_WEAPON_KINDS) {
            expect(Object.keys(WEAPON_DEFS[kind].penetration)).toHaveLength(2);
            expect(
                WEAPON_DEFS[kind].penetration[ArmorKind.Helmet]
            ).toBeDefined();
            expect(
                WEAPON_DEFS[kind].penetration[ArmorKind.Shield]
            ).toBeDefined();
        }
    });

    it('matches the spec penetration matrix exactly', () => {
        expect(WEAPON_DEFS[WeaponKind.Longsword].penetration).toEqual({
            [ArmorKind.Helmet]: 1.5,
            [ArmorKind.Shield]: 0.6
        });
        expect(WEAPON_DEFS[WeaponKind.Shortsword].penetration).toEqual({
            [ArmorKind.Helmet]: 1,
            [ArmorKind.Shield]: 1
        });
        expect(WEAPON_DEFS[WeaponKind.Axe].penetration).toEqual({
            [ArmorKind.Helmet]: 2,
            [ArmorKind.Shield]: 1
        });
        expect(WEAPON_DEFS[WeaponKind.Hammer].penetration).toEqual({
            [ArmorKind.Helmet]: 5,
            [ArmorKind.Shield]: 3
        });
        expect(WEAPON_DEFS[WeaponKind.Bow].penetration).toEqual({
            [ArmorKind.Helmet]: 0.4,
            [ArmorKind.Shield]: 0.2
        });
        expect(WEAPON_DEFS[WeaponKind.Spear].penetration).toEqual({
            [ArmorKind.Helmet]: 2,
            [ArmorKind.Shield]: 1.5
        });
    });

    it('spot-checks Hammer and Bow penetration values', () => {
        expect(
            WEAPON_DEFS[WeaponKind.Hammer].penetration[ArmorKind.Helmet]
        ).toBe(5);
        expect(
            WEAPON_DEFS[WeaponKind.Hammer].penetration[ArmorKind.Shield]
        ).toBe(3);
        expect(WEAPON_DEFS[WeaponKind.Bow].penetration[ArmorKind.Helmet]).toBe(
            0.4
        );
        expect(WEAPON_DEFS[WeaponKind.Bow].penetration[ArmorKind.Shield]).toBe(
            0.2
        );
    });

    it('resolves every weapon × armor lookup to a finite number (total matrix)', () => {
        for (const weapon of ALL_WEAPON_KINDS) {
            for (const armor of ALL_ARMOR_KINDS) {
                const value = WEAPON_DEFS[weapon].penetration[armor];
                expect(Number.isFinite(value)).toBe(true);
            }
        }
    });
});

describe('units/data — ARMOR_DEFS completeness and values', () => {
    it('holds exactly the 2 ArmorKind entries', () => {
        expect(Object.keys(ARMOR_DEFS)).toHaveLength(2);
        expect(ALL_ARMOR_KINDS).toHaveLength(2);
    });

    it('ALL_ARMOR_KINDS lists Helmet then Shield', () => {
        expect(ALL_ARMOR_KINDS).toEqual([ArmorKind.Helmet, ArmorKind.Shield]);
    });

    it('matches spec mass and defenseRatio for both armors', () => {
        const helmet = ARMOR_DEFS[ArmorKind.Helmet];
        expect(helmet.id).toBe(ArmorKind.Helmet);
        expect(helmet.name).toBe('头盔');
        expect(helmet.mass).toBe(8);
        expect(helmet.defenseRatio).toBe(1.0);

        const shield = ARMOR_DEFS[ArmorKind.Shield];
        expect(shield.id).toBe(ArmorKind.Shield);
        expect(shield.name).toBe('盾牌');
        expect(shield.mass).toBe(15);
        expect(shield.defenseRatio).toBe(1.2);
    });
});
