import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import type { IDamageContext, IUnitAI, IUnitAIProvider } from '@/control/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { Unit } from '@/units/Unit';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { ArenaSensingWorld } from './arena';
import { TestDamageSink } from './damage-sink';

/**
 * 每单位一个默认 AI 的 Provider：真实物理回归测试只替换 AI 实现，不伪造物理。
 */
class DefaultAIProvider implements IUnitAIProvider {
    create(): IUnitAI {
        return new DefaultUnitAI();
    }

    destroy(): void {}
}

describe('melee damage recurs instead of freezing on the first contact', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的真实物理世界。 */
    let physics: PhysicsWorld | null = null;
    /** 当前测试持有的控制系统。 */
    let control: ControlSystem | null = null;

    afterEach(() => {
        control?.dispose();
        physics?.dispose();
        control = null;
        physics = null;
    });

    it('lands a second duel hit at least 60 ticks after the opening impact', () => {
        const world = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(51101)
        );
        physics = world;
        let tick = 0;
        const hits: [number, number][] = [];
        const sink = new TestDamageSink((context: IDamageContext) => {
            if (context.event.defenderId === 2) {
                hits.push([tick, context.event.damage]);
            }
        });
        const controller = new ControlSystem(
            world,
            new ArenaSensingWorld(50),
            new DefaultAIProvider(),
            sink
        );
        control = controller;

        // 两名骑士对撞：单次伤害远低于生命上限，第二次命中前不会触发低生命撤退。
        const attacker = spawnUnit(ClassKind.Knight, mulberry32(101));
        const defender = spawnUnit(ClassKind.Knight, mulberry32(102));
        controller.registerUnit({
            unitId: 1,
            unit: attacker,
            teamId: 1,
            x: -0.8,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: defender,
            teamId: 2,
            x: 0.8,
            y: 0
        });
        const healthBefore = defender.getAttribute(AttributeKind.Health);

        for (; tick < 900; tick += 1) {
            controller.tick();
        }

        const damaging = hits.filter(([, damage]) => damage > 0);
        // 修复前：只会有一条开场命中（伤害在 tick 6 之后完全停止）。
        expect(damaging.length).toBeGreaterThanOrEqual(2);
        expect(damaging[1][0] - damaging[0][0]).toBeGreaterThanOrEqual(60);
        expect(defender.getAttribute(AttributeKind.Health)).toBeLessThan(
            healthBefore
        );
    });

    it('keeps damaging a surrounded defender past the observed freeze point', () => {
        const world = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(51102)
        );
        physics = world;
        let tick = 0;
        const hits: [number, number][] = [];
        const sink = new TestDamageSink((context: IDamageContext) => {
            if (context.event.defenderId === 1) {
                hits.push([tick, context.event.damage]);
            }
        });
        const controller = new ControlSystem(
            world,
            new ArenaSensingWorld(50),
            new DefaultAIProvider(),
            sink
        );
        control = controller;

        // 高生命、低攻击、重质量的防守方：不会因低生命撤退离场，也不会击杀围攻者，
        // 从而把「重复伤害」这一条从低生命撤退规则中隔离出来单独验证。
        const defender = new Unit(ClassKind.Swordsman, {
            maxHp: 4000,
            controlLevel: 10,
            attack: 1,
            defense: 0,
            weaponRatio: 1,
            armorRatio: 1,
            mass: 200
        });
        controller.registerUnit({
            unitId: 1,
            unit: defender,
            teamId: 1,
            x: 0,
            y: 0
        });
        const ringRadius = 1.3;
        for (let index = 0; index < 4; index += 1) {
            const angle = (Math.PI * 2 * index) / 4;
            controller.registerUnit({
                unitId: index + 2,
                unit: spawnUnit(ClassKind.Swordsman, mulberry32(300 + index)),
                teamId: 2,
                x: Math.cos(angle) * ringRadius,
                y: Math.sin(angle) * ringRadius
            });
        }
        const healthBefore = defender.getAttribute(AttributeKind.Health);
        let healthAfterOpening = healthBefore;

        for (; tick < 1800; tick += 1) {
            controller.tick();
            if (tick === 60) {
                healthAfterOpening = defender.getAttribute(
                    AttributeKind.Health
                );
            }
        }

        const damaging = hits.filter(([, damage]) => damage > 0);
        // 修复前：伤害在 tick 32 之后完全停止，1800 tick 内再无任何命中。
        expect(damaging.length).toBeGreaterThanOrEqual(2);
        expect(damaging.some(([hitTick]) => hitTick > 193)).toBe(true);
        expect(healthAfterOpening).toBeLessThan(healthBefore);
        expect(defender.getAttribute(AttributeKind.Health)).toBeLessThan(
            healthAfterOpening
        );
    });
});
