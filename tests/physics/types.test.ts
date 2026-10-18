import { describe, expect, it } from 'vitest';

// 从 `@/physics/types` 导入 `ColliderPart`：该导入本身就是别名解析的证明——
// 类型模块会传递性地解析 `@/units/types`。接口在运行时被擦除，故不导入接口。
import { ColliderPart } from '@/physics/types';

describe('physics-system types — numeric ColliderPart enum', () => {
    it('pins Body to 0', () => {
        expect(ColliderPart.Body).toBe(0);
    });

    it('pins Weapon to 1 and Armor to 2 (numeric enum, not string)', () => {
        expect(ColliderPart.Weapon).toBe(1);
        expect(ColliderPart.Armor).toBe(2);
        expect(typeof ColliderPart.Body).toBe('number');
    });

    it('every ColliderPart member is an integer (ordinals 0..2)', () => {
        const members: readonly number[] = [
            ColliderPart.Body,
            ColliderPart.Weapon,
            ColliderPart.Armor
        ];
        expect(members).toHaveLength(3);
        for (const ordinal of [0, 1, 2]) {
            expect(Number.isInteger(ordinal)).toBe(true);
        }
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
    });

    it('the three members are pairwise distinct', () => {
        const values = new Set<number>([
            ColliderPart.Body,
            ColliderPart.Weapon,
            ColliderPart.Armor
        ]);
        expect(values.size).toBe(3);
    });
});
