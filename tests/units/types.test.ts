import { describe, expect, expectTypeOf, it } from 'vitest';

import type { IRng } from '@/common/types';
import {
    ArmorKind,
    AttributeKind,
    ClassKind,
    EquipmentKind,
    ModifierMode,
    SkillKind,
    WeaponKind,
    type IRng as IRngViaUnits
} from '@/units/types';

describe('unit-system types — numeric enums', () => {
    it('AttributeKind uses integer ordinals', () => {
        expect(AttributeKind.Health).toBe(0);
        expect(AttributeKind.Mass).toBe(12);
    });

    it('ClassKind uses integer ordinals', () => {
        expect(ClassKind.Swordsman).toBe(0);
        expect(ClassKind.Spearman).toBe(6);
    });

    it('WeaponKind and ArmorKind use integer ordinals', () => {
        expect(WeaponKind.Longsword).toBe(0);
        expect(WeaponKind.Spear).toBe(5);
        expect(ArmorKind.Helmet).toBe(0);
        expect(ArmorKind.Shield).toBe(1);
    });

    it('SkillKind, EquipmentKind and ModifierMode use integer ordinals', () => {
        expect(SkillKind.ArrowStorm).toBe(0);
        expect(EquipmentKind.Weapon).toBe(0);
        expect(ModifierMode.Flat).toBe(0);
    });

    it('every AttributeKind member is an integer with a reverse mapping 0..12', () => {
        const members: readonly number[] = [
            AttributeKind.Health,
            AttributeKind.MaxHealth,
            AttributeKind.Level,
            AttributeKind.Experience,
            AttributeKind.ExperienceRatio,
            AttributeKind.AttackExpRatio,
            AttributeKind.DefenseExpRatio,
            AttributeKind.ControlLevel,
            AttributeKind.Attack,
            AttributeKind.Defense,
            AttributeKind.WeaponRatio,
            AttributeKind.ArmorRatio,
            AttributeKind.Mass
        ];
        expect(members).toHaveLength(13);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        // 数字枚举带反向映射：0..12 每个序号应映射回成员名（字符串）
        for (let ordinal = 0; ordinal <= 12; ordinal += 1) {
            expect(typeof AttributeKind[ordinal]).toBe('string');
        }
    });
});

describe('unit-system types — shared IRng re-export', () => {
    it('re-exports the same IRng type from @/common/types through @/units/types', () => {
        // 类型级断言（`pnpm typecheck` 校验）：再导出的 IRng 与 src/common/types.ts
        // 中声明的 IRng 是同一类型，证明随机源已迁至 src/common 且别名可解析。
        expectTypeOf<IRngViaUnits>().toEqualTypeOf<IRng>();
    });
});
