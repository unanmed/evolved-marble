import { describe, expect, expectTypeOf, it } from 'vitest';

// 从 `@/control/types` 导入 `SkillIntentKind`：该导入本身就是别名解析的证明，
// 并会传递性地解析 `@/physics/types` 与 `@/units/types`。
import { SkillIntentKind } from '@/control/types';
import type {
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitBrief,
    IUnitObservation,
    IProjectileSighting,
    ISensor,
    IUnitSkillIntent,
    IWeaponSkillIntent,
    SkillIntent
} from '@/control/types';
import type { IUnitState } from '@/physics/types';
import { AttributeKind, ClassKind, SkillKind, WeaponKind } from '@/units/types';

describe('control-system types — numeric SkillIntentKind enum', () => {
    it('pins Weapon to 0 and proves it is numeric', () => {
        expect(SkillIntentKind.Weapon).toBe(0);
        expect(typeof SkillIntentKind.Weapon).toBe('number');
    });

    it('pins Unit to 1', () => {
        expect(SkillIntentKind.Unit).toBe(1);
    });

    it('every member is an integer and the two members are distinct', () => {
        const members: readonly number[] = [
            SkillIntentKind.Weapon,
            SkillIntentKind.Unit
        ];
        expect(members).toHaveLength(2);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(2);
    });
});

describe('control-system types — observation snapshot compiles', () => {
    it('accepts a complete IUnitObservation literal (every AttributeKind key present)', () => {
        // 类型级断言（`pnpm typecheck` 校验）：运动读数来自冻结的 Phase 2 契约。
        const motion: IUnitState = {
            x: 10,
            y: 20,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0
        };
        const enemies: readonly IUnitBrief[] = [];
        const allies: readonly IUnitBrief[] = [];
        const projectiles: readonly IProjectileSighting[] = [];

        const observation: IUnitObservation = {
            unitId: 1,
            tick: 0,
            attributes: {
                [AttributeKind.Health]: 100,
                [AttributeKind.MaxHealth]: 100,
                [AttributeKind.Level]: 1,
                [AttributeKind.Experience]: 0,
                [AttributeKind.ExperienceRatio]: 1,
                [AttributeKind.AttackExpRatio]: 1,
                [AttributeKind.DefenseExpRatio]: 1,
                [AttributeKind.ControlLevel]: 10,
                [AttributeKind.Attack]: 30,
                [AttributeKind.Defense]: 20,
                [AttributeKind.WeaponRatio]: 1,
                [AttributeKind.ArmorRatio]: 1,
                [AttributeKind.Mass]: 50
            },
            classKind: ClassKind.Swordsman,
            equipment: [],
            skills: [SkillKind.Charge],
            motion,
            rayDistances: [50],
            enemies,
            allies,
            projectiles
        };

        expectTypeOf(observation.motion).toEqualTypeOf<IUnitState>();
        expectTypeOf(observation.classKind).toEqualTypeOf<ClassKind>();
        expect(observation.attributes[AttributeKind.Health]).toBe(100);
        expect(observation.skills).toHaveLength(1);
        expect(observation.enemies).toHaveLength(0);
        expect(observation.rayDistances).toHaveLength(1);
    });
});

describe('control-system types — AI and sensing signatures', () => {
    it('IUnitAI.decide maps an observation to an action', () => {
        expectTypeOf<IUnitAI['decide']>()
            .parameter(0)
            .toEqualTypeOf<IUnitObservation>();
        expectTypeOf<
            ReturnType<IUnitAI['decide']>
        >().toEqualTypeOf<IUnitAction>();
    });

    it('IUnitAIProvider.create returns an IUnitAI and ISensor.sense may return null', () => {
        expectTypeOf<
            ReturnType<IUnitAIProvider['create']>
        >().toEqualTypeOf<IUnitAI>();
        expectTypeOf<
            ISensor['sense']
        >().returns.toEqualTypeOf<IUnitObservation | null>();
    });
});

describe('SkillIntent — discriminated union narrows on kind', () => {
    it('exposes weapon on the weapon intent and skill on the unit intent', () => {
        /**
         * 以判别式收窄 `SkillIntent` 的两个分支，并在类型级断言各自形状。
         * 刻意用参数接收意图，避免赋值推断把联合提前收窄成单一分支。
         */
        function assertSkillIntentNarrowing(intent: SkillIntent): void {
            if (intent.kind === SkillIntentKind.Weapon) {
                expectTypeOf(intent).toEqualTypeOf<IWeaponSkillIntent>();
                expect(intent.weapon).toBe(WeaponKind.Bow);
            } else {
                expectTypeOf(intent).toEqualTypeOf<IUnitSkillIntent>();
                expect(intent.skill).toBe(SkillKind.Charge);
            }
        }

        assertSkillIntentNarrowing({
            kind: SkillIntentKind.Weapon,
            unitId: 1,
            weapon: WeaponKind.Bow
        });
        assertSkillIntentNarrowing({
            kind: SkillIntentKind.Unit,
            unitId: 2,
            skill: SkillKind.Charge
        });
    });
});
