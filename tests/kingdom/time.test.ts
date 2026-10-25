import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { advanceArmyCenter, computeFormationSlots } from '@/kingdom/Army';
import {
    ARMY_FORMATION_RADIUS,
    BATTLE_TICK_MINUTES,
    MAP_HEIGHT,
    MAP_WIDTH,
    PEACE_TICK_MINUTES,
    POST_BATTLE_HOLD_TICKS,
    POST_BATTLE_PULLBACK_TICKS
} from '@/kingdom/constants';
import { TimeSystem } from '@/kingdom/TimeSystem';
import { ArmyOrderKind } from '@/kingdom/types';
import type { IScenario } from '@/kingdom/types';
import { AttributeKind, ClassKind } from '@/units/types';
import { createKingdom, disposeKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 把弧度归一到 (-π, π]，便于比较朝向。
 * @param angle 任意弧度。
 * @returns 归一化弧度。
 */
function normalizeAngle(angle: number): number {
    return Math.atan2(Math.sin(angle), Math.cos(angle));
}

/**
 * 构造一个从 `(100, 500)` 指向正东、目标在地图内的行军输入。
 * @returns 可复用的一组参数。
 */
function eastwardMarch(): {
    centerX: number;
    centerY: number;
    heading: number;
    targetX: number;
    targetY: number;
} {
    return {
        centerX: 100,
        centerY: 500,
        heading: 0,
        targetX: 900,
        targetY: 500
    };
}

describe('TimeSystem — plain-number game clock', () => {
    it('starts at minute 0, tick 0, peace rate 24, and 24 substeps', () => {
        const time = new TimeSystem();
        expect(time.getGameMinutes()).toBe(0);
        expect(time.getTickIndex()).toBe(0);
        expect(time.getMinutesPerTick()).toBe(PEACE_TICK_MINUTES);
        expect(time.getSubstepsPerTick()).toBe(24);
    });

    it('advances by valid minutes and ignores negative and NaN input', () => {
        const time = new TimeSystem();
        time.advance(10);
        expect(time.getGameMinutes()).toBe(10);

        time.advance(-5);
        time.advance(Number.NaN);
        expect(time.getGameMinutes()).toBe(10);
    });

    it('advanceTick moves the tick index by exactly one per call', () => {
        const time = new TimeSystem();
        time.advanceTick();
        expect(time.getTickIndex()).toBe(1);
        time.advanceTick();
        expect(time.getTickIndex()).toBe(2);
        expect(time.getGameMinutes()).toBe(0);
    });

    it('mirrors minutes-per-tick in substeps and pins the battle rate', () => {
        const time = new TimeSystem();
        time.setMinutesPerTick(BATTLE_TICK_MINUTES);
        expect(time.getMinutesPerTick()).toBe(1);
        expect(time.getSubstepsPerTick()).toBe(1);
    });

    it('ignores zero and NaN rates', () => {
        const time = new TimeSystem();
        time.setMinutesPerTick(0);
        expect(time.getMinutesPerTick()).toBe(PEACE_TICK_MINUTES);
        time.setMinutesPerTick(Number.NaN);
        expect(time.getMinutesPerTick()).toBe(PEACE_TICK_MINUTES);
    });

    it('lets the last decision win: 24 then 1 reads 1 for both rate and substeps', () => {
        const time = new TimeSystem();
        time.setMinutesPerTick(PEACE_TICK_MINUTES);
        for (let minute = 0; minute < 24; minute += 1) {
            time.advance(1);
        }
        time.setMinutesPerTick(BATTLE_TICK_MINUTES);

        expect(time.getMinutesPerTick()).toBe(1);
        expect(time.getSubstepsPerTick()).toBe(1);
        expect(time.getGameMinutes()).toBe(24);
    });
});

describe('advanceArmyCenter — 10 m per game hour', () => {
    it('covers exactly 100 m in 600 game minutes', () => {
        const march = eastwardMarch();
        const next = advanceArmyCenter(
            march.centerX,
            march.centerY,
            march.heading,
            march.targetX,
            march.targetY,
            600,
            MAP_WIDTH,
            MAP_HEIGHT
        );

        expect(next.x - march.centerX).toBeCloseTo(100, 9);
        expect(Math.abs(next.x - march.centerX - 100)).toBeLessThan(1e-9);
        expect(next.y).toBeCloseTo(march.centerY, 9);
        expect(next.heading).toBeCloseTo(march.heading, 9);
    });

    it('reports the actual travel direction as the heading on a normal march', () => {
        // 从 (500,500) 走向 (850,300)：真实行进角 atan2(-200,350) ≈ -0.519 rad，
        // 而输入朝向 π/4 ≈ 0.785 rad，旧实现会把这个陈旧角度原样返回。
        const next = advanceArmyCenter(
            500,
            500,
            Math.PI / 4,
            850,
            300,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );

        expect(next.x).toBeGreaterThan(500);
        expect(next.y).toBeLessThan(500);
        expect(normalizeAngle(next.heading)).toBeCloseTo(
            Math.atan2(300 - 500, 850 - 500),
            9
        );
        expect(
            Math.abs(normalizeAngle(next.heading) - Math.PI / 4)
        ).toBeGreaterThan(1);
    });

    it('re-derives the heading from each new target (no stale direction)', () => {
        const eastward = advanceArmyCenter(
            500,
            500,
            Math.PI / 4,
            900,
            500,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );
        expect(normalizeAngle(eastward.heading)).toBeCloseTo(0, 9);

        const southward = advanceArmyCenter(
            eastward.x,
            eastward.y,
            eastward.heading,
            eastward.x,
            900,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );
        expect(normalizeAngle(southward.heading)).toBeCloseTo(Math.PI / 2, 9);
        expect(southward.y).toBeGreaterThan(500);
    });

    it('does not move when the target is null (Hold)', () => {
        const march = eastwardMarch();
        const next = advanceArmyCenter(
            march.centerX,
            march.centerY,
            march.heading,
            null,
            null,
            600,
            MAP_WIDTH,
            MAP_HEIGHT
        );

        expect(next).toEqual({
            x: march.centerX,
            y: march.centerY,
            heading: march.heading
        });
    });

    it('clamps at the east edge, reflects x, and then advances back inward', () => {
        let centerX = 900;
        const centerY = 500;
        let heading = 0;
        const targetX = 2000;
        const targetY = 500;

        // 10 m per 60 minutes: 10 calls reach the edge, the 11th clamps.
        for (let step = 0; step < 11; step += 1) {
            const next = advanceArmyCenter(
                centerX,
                centerY,
                heading,
                targetX,
                targetY,
                60,
                MAP_WIDTH,
                MAP_HEIGHT
            );
            centerX = next.x;
            heading = next.heading;
            expect(centerX).toBeLessThanOrEqual(MAP_WIDTH);
            expect(centerX).toBeGreaterThanOrEqual(0);
        }

        expect(centerX).toBeCloseTo(MAP_WIDTH, 9);
        expect(Math.cos(heading)).toBeLessThan(0);

        const afterBounce = advanceArmyCenter(
            centerX,
            centerY,
            heading,
            targetX,
            targetY,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );
        expect(afterBounce.x).toBeLessThan(centerX);
        expect(MAP_WIDTH - afterBounce.x).toBeCloseTo(10, 9);
    });

    it('clamps and reflects both axes when the target is out of bounds on both', () => {
        let x = 900;
        let y = 900;
        let heading = Math.PI / 4;
        const targetX = 2000;
        const targetY = 2000;

        // 10 m steps along the diagonal: 15 calls pin both axes at the corner.
        for (let step = 0; step < 15; step += 1) {
            const next = advanceArmyCenter(
                x,
                y,
                heading,
                targetX,
                targetY,
                60,
                MAP_WIDTH,
                MAP_HEIGHT
            );
            x = next.x;
            y = next.y;
            heading = next.heading;
            expect(x).toBeLessThanOrEqual(MAP_WIDTH);
            expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
        }

        expect(x).toBeCloseTo(MAP_WIDTH, 9);
        expect(y).toBeCloseTo(MAP_HEIGHT, 9);
        expect(Math.cos(heading)).toBeLessThan(0);
        expect(Math.sin(heading)).toBeLessThan(0);

        const afterBounce = advanceArmyCenter(
            x,
            y,
            heading,
            targetX,
            targetY,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );
        expect(afterBounce.x).toBeLessThan(x);
        expect(afterBounce.y).toBeLessThan(y);
    });

    it('never leaves the map over 5000 minutes aimed at an out-of-bounds target', () => {
        let x = 500;
        let y = 500;
        let heading = 0;
        const targetX = 5000;
        const targetY = 500;

        for (let step = 0; step < 500; step += 1) {
            const next = advanceArmyCenter(
                x,
                y,
                heading,
                targetX,
                targetY,
                10,
                MAP_WIDTH,
                MAP_HEIGHT
            );
            x = next.x;
            y = next.y;
            heading = next.heading;
            expect(x).toBeGreaterThanOrEqual(0);
            expect(x).toBeLessThanOrEqual(MAP_WIDTH);
            expect(y).toBeGreaterThanOrEqual(0);
            expect(y).toBeLessThanOrEqual(MAP_HEIGHT);
        }

        // After the bounce the centre keeps moving inward along the reflected heading.
        expect(x).toBeLessThan(MAP_WIDTH);
        expect(normalizeAngle(heading)).toBeCloseTo(Math.PI, 6);
    });

    it('returns the inputs unchanged for non-finite arguments', () => {
        const next = advanceArmyCenter(
            Number.NaN,
            500,
            0,
            900,
            500,
            60,
            MAP_WIDTH,
            MAP_HEIGHT
        );
        expect(Number.isNaN(next.x)).toBe(true);
        expect(next.y).toBe(500);
        expect(next.heading).toBe(0);
    });
});

describe('computeFormationSlots — deterministic disc', () => {
    it('places one distinct slot per unit strictly inside the 25 m circle', () => {
        const unitIds = [10, 11, 12, 13];
        const slots = computeFormationSlots(
            500,
            500,
            0,
            unitIds,
            ARMY_FORMATION_RADIUS
        );

        expect(slots.size).toBe(unitIds.length);

        const points: string[] = [];
        for (const unitId of unitIds) {
            const slot = slots.get(unitId);
            expect(slot).toBeDefined();
            if (slot === undefined) {
                continue;
            }
            const distance = Math.hypot(slot.x - 500, slot.y - 500);
            expect(distance).toBeLessThan(ARMY_FORMATION_RADIUS);
            expect(distance).toBeGreaterThan(0);
            points.push(`${slot.x.toFixed(6)}:${slot.y.toFixed(6)}`);
        }
        expect(new Set(points).size).toBe(unitIds.length);
    });

    it('rotates the whole disc when the heading changes', () => {
        const unitIds = [1, 2, 3];
        const north = computeFormationSlots(500, 500, 0, unitIds, 25);
        const east = computeFormationSlots(500, 500, Math.PI / 2, unitIds, 25);

        const firstNorth = north.get(1);
        const firstEast = east.get(1);
        expect(firstNorth).toBeDefined();
        expect(firstEast).toBeDefined();
        if (firstNorth === undefined || firstEast === undefined) {
            return;
        }
        expect(firstNorth.x).not.toBeCloseTo(firstEast.x, 6);
        expect(firstNorth.y).not.toBeCloseTo(firstEast.y, 6);
    });

    it('returns an empty map for an empty roster', () => {
        expect(computeFormationSlots(0, 0, 0, [], 25).size).toBe(0);
    });
});

/**
 * 战后余韵场景：两势力各 1 军 1 单位、中心相距 5 m，因此首 tick 即触发战斗；
 * 之后地图上没有任何其他敌对军队，战斗结束便进入余韵并最终回到 24×。
 * @returns 场景表。
 */
function aftermathScenario(): IScenario {
    return {
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
                x: 500,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            },
            {
                id: 2,
                factionId: 2,
                x: 505,
                y: 500,
                heading: Math.PI,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            }
        ],
        terrain: []
    };
}

/**
 * 余韵重置场景：army 1/2 相距 5 m 立刻开战；army 3/4 相距 90 m（触发距离 80 m）
 * 并相向行军，因此第二场战斗会在第一场结束后的余韵期间才触发。
 * @returns 场景表。
 */
function resetScenario(): IScenario {
    return {
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
                x: 500,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            },
            {
                id: 2,
                factionId: 2,
                x: 505,
                y: 500,
                heading: Math.PI,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            },
            {
                id: 3,
                factionId: 1,
                x: 200,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            },
            {
                id: 4,
                factionId: 2,
                x: 290,
                y: 500,
                heading: Math.PI,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            }
        ],
        terrain: []
    };
}

/**
 * 让一支军队的名册全部阵亡（伤害接收方会做同样的工作）。
 * @param fixture 夹具。
 * @param armyId 军队 id。
 */
function killRoster(fixture: IKingdomFixture, armyId: number): void {
    for (const unitId of fixture.world.getArmy(armyId)?.getUnitIds() ?? []) {
        const unit = fixture.control.getUnit(unitId);
        if (unit !== null) {
            unit.takeDamage(unit.getAttribute(AttributeKind.MaxHealth) * 2);
        }
    }
}

/**
 * 推进到第一场战斗出现并已有成员入场（跳过零成员宽限期）。
 * @param world 王国世界。
 */
function waitForMembers(world: IKingdomFixture['world']): void {
    for (
        let tick = 0;
        tick < 30 && !world.getBattleSystem().hasActiveBattle();
        tick += 1
    ) {
        world.tick();
    }
    for (
        let tick = 0;
        tick < 30 &&
        (world.getBattleSystem().listActiveBattles()[0]?.getMemberUnitIds()
            .length ?? 0) === 0;
        tick += 1
    ) {
        world.tick();
    }
}

/** 当前测试持有的夹具（真实 Rapier）。 */
let fixture: IKingdomFixture | null = null;

describe('KingdomWorld — post-battle 1× hold before the peace rate', () => {
    beforeAll(async () => {
        await initRapier();
    });

    afterEach(() => {
        if (fixture !== null) {
            disposeKingdom(fixture);
        }
        fixture = null;
    });

    it('advances 1× for 114 ticks after the last battle, then 24×', () => {
        const created = createKingdom({
            scenario: aftermathScenario(),
            seed: 5
        });
        fixture = created;
        const { world } = created;

        waitForMembers(world);
        expect(world.getBattleSystem().hasActiveBattle()).toBe(true);

        killRoster(created, 2);
        let ended = false;
        for (let tick = 0; tick < 60 && !ended; tick += 1) {
            world.tick();
            ended = !world.getBattleSystem().hasActiveBattle();
        }
        expect(ended).toBe(true);

        const holdTicks = POST_BATTLE_HOLD_TICKS + POST_BATTLE_PULLBACK_TICKS;
        expect(holdTicks).toBe(114);
        const minutesAtEnd = world.getTime().getGameMinutes();
        for (let tick = 0; tick < holdTicks; tick += 1) {
            const result = world.tick();
            expect(result.gameMinutes).toBe(BATTLE_TICK_MINUTES);
            expect(result.minutesPerTick).toBe(BATTLE_TICK_MINUTES);
        }
        expect(world.getTime().getGameMinutes()).toBe(minutesAtEnd + holdTicks);

        const peace = world.tick();
        expect(peace.gameMinutes).toBe(PEACE_TICK_MINUTES);
        expect(peace.minutesPerTick).toBe(PEACE_TICK_MINUTES);
        expect(world.getTime().getMinutesPerTick()).toBe(PEACE_TICK_MINUTES);
        expect(world.getTime().getSubstepsPerTick()).toBe(PEACE_TICK_MINUTES);
    });

    it('resets the hold when a new battle appears during the aftermath', () => {
        const created = createKingdom({ scenario: resetScenario(), seed: 6 });
        fixture = created;
        const { world } = created;

        // army 3/4 相向行军；只有 1× 的余韵期才可能慢慢进入 80 m 触发距离。
        world.issueOrder({
            armyId: 3,
            kind: ArmyOrderKind.MoveTo,
            targetX: 290,
            targetY: 500
        });
        world.issueOrder({
            armyId: 4,
            kind: ArmyOrderKind.MoveTo,
            targetX: 200,
            targetY: 500
        });

        waitForMembers(world);
        expect(world.getBattleSystem().hasActiveBattle()).toBe(true);

        killRoster(created, 2);
        let firstEnded = false;
        for (let tick = 0; tick < 60 && !firstEnded; tick += 1) {
            world.tick();
            firstEnded = !world.getBattleSystem().hasActiveBattle();
        }
        expect(firstEnded).toBe(true);

        // 第一场结束后的余韵期里等第二场开战：确实过了若干 tick 才触发。
        let restarted = false;
        let burned = 0;
        for (let tick = 0; tick < 90 && !restarted; tick += 1) {
            const result = world.tick();
            expect(result.minutesPerTick).toBe(BATTLE_TICK_MINUTES);
            burned += 1;
            restarted = world.getBattleSystem().hasActiveBattle();
        }
        expect(restarted).toBe(true);
        expect(burned).toBeGreaterThan(1);

        // 第二场结束同样走满 114 个 1× tick——余韵预算被新战斗重置过。
        killRoster(created, 4);
        let secondEnded = false;
        for (let tick = 0; tick < 60 && !secondEnded; tick += 1) {
            world.tick();
            secondEnded = !world.getBattleSystem().hasActiveBattle();
        }
        expect(secondEnded).toBe(true);

        for (
            let tick = 0;
            tick < POST_BATTLE_HOLD_TICKS + POST_BATTLE_PULLBACK_TICKS;
            tick += 1
        ) {
            const result = world.tick();
            expect(result.gameMinutes).toBe(BATTLE_TICK_MINUTES);
            expect(result.minutesPerTick).toBe(BATTLE_TICK_MINUTES);
        }

        const peace = world.tick();
        expect(peace.minutesPerTick).toBe(PEACE_TICK_MINUTES);
        expect(peace.gameMinutes).toBe(PEACE_TICK_MINUTES);
    });
});
