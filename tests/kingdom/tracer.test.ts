import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PEACE_TICK_MINUTES } from '@/kingdom/constants';
import { ArmyOrderKind, BattleLifecycleKind } from '@/kingdom/types';
import type { IScenario } from '@/kingdom/types';
import { AttributeKind, ClassKind } from '@/units/types';
import { createKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 端到端场景：1000×1000 空地图，两势力各 1 军 6 单位，无城池、无地形。
 * 两军相距 600 m，让阵型在进入 80 m 触发距离前先收敛。
 */
const TRACER_SCENARIO: IScenario = {
    width: 1000,
    height: 1000,
    factions: [
        { id: 1, name: '赤' },
        { id: 2, name: '蓝' }
    ],
    cities: [],
    armies: [
        {
            id: 1,
            factionId: 1,
            x: 200,
            y: 500,
            heading: 0,
            units: [
                { classKind: ClassKind.Swordsman, count: 4 },
                { classKind: ClassKind.Spearman, count: 2 }
            ]
        },
        {
            id: 2,
            factionId: 2,
            x: 800,
            y: 500,
            heading: Math.PI,
            units: [
                { classKind: ClassKind.Swordsman, count: 4 },
                { classKind: ClassKind.Berserker, count: 2 }
            ]
        }
    ],
    terrain: []
};

/**
 * 当前测试持有的夹具。
 */
let fixture: IKingdomFixture | null = null;

describe('tracer — scenario → march → battle → damage → end → continue', () => {
    beforeAll(async () => {
        await initRapier();
    });

    afterEach(() => {
        fixture?.control.dispose();
        fixture?.physics.dispose();
        fixture = null;
    });

    // End-to-end tracer: ~65 peace ticks (24 substeps each) plus several hundred 1× battle
    // ticks with real Rapier + sensing. Under a 46-worker full-suite run the default 5 s
    // budget is not enough, so the budget is explicit rather than load-dependent.
    it('drives two armies into a unit-level battle and keeps ticking afterwards', () => {
        const created = createKingdom({
            scenario: TRACER_SCENARIO,
            seed: 11
        });
        fixture = created;
        const { world, control } = created;

        const initialHealth = new Map<number, number>();
        for (const armyId of [1, 2]) {
            const army = world.getArmy(armyId);
            expect(army).not.toBeNull();
            if (army === null) {
                continue;
            }
            for (const unitId of army.getUnitIds()) {
                const unit = control.getUnit(unitId);
                expect(unit).not.toBeNull();
                if (unit !== null) {
                    initialHealth.set(
                        unitId,
                        unit.getAttribute(AttributeKind.Health)
                    );
                }
            }
        }
        expect(initialHealth.size).toBe(12);

        world.issueOrder({
            armyId: 1,
            kind: ArmyOrderKind.MoveTo,
            targetX: 800,
            targetY: 500
        });
        world.issueOrder({
            armyId: 2,
            kind: ArmyOrderKind.MoveTo,
            targetX: 200,
            targetY: 500
        });

        let previousMinutes = world.getTime().getGameMinutes();
        let started = false;
        for (let tick = 0; tick < 400 && !started; tick += 1) {
            const result = world.tick();
            const minutes = world.getTime().getGameMinutes();
            expect(minutes).toBeGreaterThan(previousMinutes);
            previousMinutes = minutes;

            const events = world.getBattleSystem().drainEvents();
            if (
                events.some(event => event.kind === BattleLifecycleKind.Started)
            ) {
                started = true;
                // The post-loop rate decision makes a battle-starting tick 1×.
                expect(result.minutesPerTick).toBe(1);
                expect(result.gameMinutes).toBeGreaterThanOrEqual(1);
                expect(result.gameMinutes).toBeLessThanOrEqual(
                    PEACE_TICK_MINUTES
                );
            } else {
                // Before a battle the world runs at 24 game minutes per tick.
                expect(result.minutesPerTick).toBe(PEACE_TICK_MINUTES);
            }
        }
        expect(started).toBe(true);
        expect(world.getBattleSystem().hasActiveBattle()).toBe(true);
        expect(world.getTime().getMinutesPerTick()).toBe(1);

        // Wait for real collision damage from the delegated battle AI.
        let damaged = false;
        for (let tick = 0; tick < 2000 && !damaged; tick += 1) {
            world.tick();
            damaged = [...initialHealth].some(([unitId, health]) => {
                const unit = control.getUnit(unitId);
                if (unit === null) {
                    return true;
                }
                return unit.getAttribute(AttributeKind.Health) < health;
            });
        }
        expect(damaged).toBe(true);

        // Finish the fight deterministically: the losing faction's survivors die.
        for (const unitId of world.getArmy(2)?.getUnitIds() ?? []) {
            const unit = control.getUnit(unitId);
            if (unit !== null) {
                unit.takeDamage(unit.getAttribute(AttributeKind.MaxHealth) * 2);
            }
        }

        let ended = false;
        for (let tick = 0; tick < 50 && !ended; tick += 1) {
            world.tick();
            ended = world
                .getBattleSystem()
                .drainEvents()
                .some(event => event.kind === BattleLifecycleKind.Ended);
        }
        expect(ended).toBe(true);

        expect(world.getBattleSystem().listCompletedBattles()).toHaveLength(1);
        expect(world.getBattleSystem().listActiveBattles()).toHaveLength(0);

        const minutesAtEnd = world.getTime().getGameMinutes();
        for (let tick = 0; tick < 10; tick += 1) {
            const result = world.tick();
            expect(result.minutesPerTick).toBe(PEACE_TICK_MINUTES);
            expect(result.gameMinutes).toBe(PEACE_TICK_MINUTES);
        }
        expect(world.getTime().getGameMinutes()).toBeGreaterThan(minutesAtEnd);
    }, 30000);
});
