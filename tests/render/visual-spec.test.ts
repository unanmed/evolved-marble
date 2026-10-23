import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import { resolveUnitVisualSpec } from '@/render/frameModel';
import {
    ALL_ARMOR_KINDS,
    ALL_CLASS_KINDS,
    ALL_WEAPON_KINDS,
    ARMOR_DEFS,
    CLASS_DEFS,
    WEAPON_DEFS
} from '@/units/data';
import { spawnUnit } from '@/units/spawn';
import { ArmorKind, ClassKind, EquipmentKind, WeaponKind } from '@/units/types';
import type {
    AttributeKind,
    IEquipment,
    IModifier,
    IUnit,
    SkillKind
} from '@/units/types';

import { mulberry32 } from '../helpers/rng';

/**
 * 测试用最小 `IUnit`：只提供视觉解析读取的职业与装备，其余读数固定。
 * 装备由构造时注入，因此可以覆盖真实职业表里不存在的组合（如两件防具）。
 */
class StubUnit implements IUnit {
    /** 职业。 */
    private readonly classKind: ClassKind;
    /** 装备列表（构造时注入）。 */
    private readonly equipment: readonly IEquipment[];

    /**
     * 构造测试单位。
     * @param classKind 职业。
     * @param equipment 装备列表，默认空（赤手空拳、未着甲）。
     */
    constructor(classKind: ClassKind, equipment: readonly IEquipment[] = []) {
        this.classKind = classKind;
        this.equipment = [...equipment];
    }

    getAttribute(_kind: AttributeKind): number {
        return 0;
    }

    getName(): string {
        return 'stub';
    }

    getClass(): ClassKind {
        return this.classKind;
    }

    getEquipment(): readonly IEquipment[] {
        return [...this.equipment];
    }

    getModifiers(): readonly IModifier[] {
        return [];
    }

    getSkills(): readonly SkillKind[] {
        return [];
    }

    takeDamage(_amount: number): void {
        // 假件无生命值，不改变状态。
    }

    isAlive(): boolean {
        return true;
    }

    gainAttackExperience(_damageDealt: number): void {
        // 假件不累积经验。
    }

    gainDefenseExperience(_damageReduced: number): void {
        // 假件不累积经验。
    }

    gainKillExperience(_enemyLevel: number): void {
        // 假件不累积经验。
    }
}

/**
 * 独立地从职业表推导第一件武器，作为被测映射的对照口径。
 * @param classKind 职业。
 * @returns 第一件已定义的武器；无武器时为 `undefined`。
 */
function expectedWeapon(classKind: ClassKind): WeaponKind | undefined {
    const entry = CLASS_DEFS[classKind].initialEquipment.find(
        item => item.kind === EquipmentKind.Weapon && item.weapon !== undefined
    );
    return entry?.weapon;
}

/**
 * 独立地从职业表推导按遭遇顺序排列的全部防具。
 * @param classKind 职业。
 * @returns 防具种类数组（未着甲时为空）。
 */
function expectedArmors(classKind: ClassKind): readonly ArmorKind[] {
    return CLASS_DEFS[classKind].initialEquipment
        .filter(entry => entry.kind === EquipmentKind.Armor)
        .map(entry => entry.armor)
        .filter((armor): armor is ArmorKind => armor !== undefined);
}

/**
 * 生成一个固定种子的该职业单位（真实 Phase 1 生成路径）。
 * @param classKind 职业。
 * @param seed 随机种子。
 * @returns 真实的 `IUnit`。
 */
function realUnit(classKind: ClassKind, seed: number): IUnit {
    return spawnUnit(classKind, mulberry32(seed));
}

describe('render/visual-spec — class to equipment mapping', () => {
    it('maps every CLASS_DEFS entry onto its own initial equipment projection', () => {
        expect(Object.keys(CLASS_DEFS)).toHaveLength(ALL_CLASS_KINDS.length);

        for (const def of Object.values(CLASS_DEFS)) {
            const visual = resolveUnitVisualSpec(
                realUnit(def.id, def.id + 1),
                0xffffff
            );

            expect(visual.classKind).toBe(def.id);
            expect(visual.weapon).toBe(expectedWeapon(def.id));
            expect(visual.armors).toEqual(expectedArmors(def.id));
        }
    });

    it('routes the first equipped weapon and keeps the named class pairings', () => {
        const rows: readonly [ClassKind, WeaponKind, readonly ArmorKind[]][] = [
            [ClassKind.Archer, WeaponKind.Bow, []],
            [ClassKind.Swordsman, WeaponKind.Longsword, []],
            [ClassKind.SwordShield, WeaponKind.Shortsword, [ArmorKind.Shield]],
            [ClassKind.Knight, WeaponKind.Longsword, [ArmorKind.Helmet]]
        ];

        for (const [classKind, weapon, armors] of rows) {
            const visual = resolveUnitVisualSpec(
                realUnit(classKind, 11),
                0xffffff
            );

            expect(visual.weapon).toBe(weapon);
            expect(visual.armors).toEqual(armors);
        }
    });
});

describe('render/visual-spec — full equipment coverage', () => {
    it('covers all six WeaponKind and both ArmorKind values across the classes', () => {
        const weapons = new Set<WeaponKind>();
        const armors = new Set<ArmorKind>();

        for (const def of Object.values(CLASS_DEFS)) {
            const visual = resolveUnitVisualSpec(
                realUnit(def.id, def.id + 100),
                0xffffff
            );
            if (visual.weapon !== undefined) {
                weapons.add(visual.weapon);
            }
            for (const armor of visual.armors) {
                armors.add(armor);
            }
        }

        expect(weapons.size).toBe(6);
        expect(armors.size).toBe(2);
        expect(weapons.size).toBe(ALL_WEAPON_KINDS.length);
        expect(armors.size).toBe(ALL_ARMOR_KINDS.length);
        expect(Object.keys(WEAPON_DEFS)).toHaveLength(ALL_WEAPON_KINDS.length);
        expect(Object.keys(ARMOR_DEFS)).toHaveLength(ALL_ARMOR_KINDS.length);

        for (const kind of ALL_WEAPON_KINDS) {
            expect(weapons.has(kind)).toBe(true);
        }
        for (const kind of ALL_ARMOR_KINDS) {
            expect(armors.has(kind)).toBe(true);
        }
    });
});

describe('render/visual-spec — class data and faction independence', () => {
    it('treats classKind as data: identical equipment yields identical visual fields', () => {
        const equipment = CLASS_DEFS[ClassKind.Swordsman].initialEquipment;
        const swordsman = resolveUnitVisualSpec(
            new StubUnit(ClassKind.Swordsman, equipment),
            0x123456
        );
        const knight = resolveUnitVisualSpec(
            new StubUnit(ClassKind.Knight, equipment),
            0x123456
        );

        expect(knight.weapon).toBe(swordsman.weapon);
        expect(knight.armors).toEqual(swordsman.armors);
        expect(knight.factionColor).toBe(swordsman.factionColor);
        expect(swordsman.classKind).toBe(ClassKind.Swordsman);
        expect(knight.classKind).toBe(ClassKind.Knight);
    });

    it('keeps faction colour independent of the equipment', () => {
        const unit = realUnit(ClassKind.Knight, 21);
        const firstColor = DEFAULT_RENDER_CONFIG.factionColors[1];
        const secondColor = DEFAULT_RENDER_CONFIG.factionColors[2];

        const first = resolveUnitVisualSpec(unit, firstColor);
        const second = resolveUnitVisualSpec(unit, secondColor);

        expect(first.factionColor).toBe(firstColor);
        expect(second.factionColor).toBe(secondColor);
        expect(second.weapon).toBe(first.weapon);
        expect(second.armors).toEqual(first.armors);
        expect(second.classKind).toBe(first.classKind);
    });
});

describe('render/visual-spec — armour order and missing equipment', () => {
    it('preserves armour order and is stable across repeated calls', () => {
        const knight = realUnit(ClassKind.Knight, 31);
        const first = resolveUnitVisualSpec(knight, 0xffffff);
        const second = resolveUnitVisualSpec(knight, 0xffffff);

        expect(first.armors).toEqual(expectedArmors(ClassKind.Knight));
        expect(second).toEqual(first);

        const twinArmor = new StubUnit(ClassKind.Knight, [
            { kind: EquipmentKind.Armor, armor: ArmorKind.Shield },
            { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
        ]);

        expect(resolveUnitVisualSpec(twinArmor, 0xffffff).armors).toEqual([
            ArmorKind.Shield,
            ArmorKind.Helmet
        ]);
    });

    it('resolves an unarmed, unarmoured unit as weapon undefined with no armours', () => {
        const visual = resolveUnitVisualSpec(
            new StubUnit(ClassKind.Swordsman, []),
            0xffffff
        );

        expect(visual.weapon).toBeUndefined();
        expect(visual.armors).toEqual([]);
        expect(visual.classKind).toBe(ClassKind.Swordsman);
    });
});
