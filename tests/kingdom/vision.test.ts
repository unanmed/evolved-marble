import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier2d-compat';
import { createKingdom, teleportUnitPhysics } from './harness';
import type { IKingdomFixture } from './harness';
import { ARMY_VISION_RADIUS, CITY_VISION_RADIUS } from '@/kingdom/constants';
import { CityKind } from '@/kingdom/types';
import type { IMutableArmy, IScenario } from '@/kingdom/types';
import { ClassKind } from '@/units/types';

/**
 * 视野场景选项：己方军队/城池与敌方军队/城池各一组位置。
 */
interface IVisionScenarioOptions {
    /** 己方军队中心 x；默认 500。 */
    readonly ownArmyX?: number;
    /** 己方军队中心 y；默认 500。 */
    readonly ownArmyY?: number;
    /** 己方军队单位数；默认 2。 */
    readonly ownArmyUnits?: number;
    /** 己方城池点 x；默认 50。 */
    readonly ownCityX?: number;
    /** 己方城池点 y；默认 50。 */
    readonly ownCityY?: number;
    /** 敌方军队中心 x；默认 900。 */
    readonly enemyArmyX?: number;
    /** 敌方军队中心 y；默认 900。 */
    readonly enemyArmyY?: number;
    /** 敌方军队单位数；默认 1（军队必须有正数名册，中心可见性仍独立于单位）。 */
    readonly enemyArmyUnits?: number;
    /** 敌方城池点 x；默认 900。 */
    readonly enemyCityX?: number;
    /** 敌方城池点 y；默认 900。 */
    readonly enemyCityY?: number;
}

/**
 * 构造视野场景：两势力、各一军一城、无地形。
 * @param options 位置选项。
 * @returns 场景表。
 */
function visionScenario(options: IVisionScenarioOptions = {}): IScenario {
    return {
        width: 1000,
        height: 1000,
        factions: [
            { id: 1, name: 'Red' },
            { id: 2, name: 'Blue' }
        ],
        cities: [
            {
                id: 1,
                factionId: 1,
                x: options.ownCityX ?? 50,
                y: options.ownCityY ?? 50,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            },
            {
                id: 2,
                factionId: 2,
                x: options.enemyCityX ?? 900,
                y: options.enemyCityY ?? 900,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: options.ownArmyX ?? 500,
                y: options.ownArmyY ?? 500,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.ownArmyUnits ?? 2
                    }
                ]
            },
            {
                id: 2,
                factionId: 2,
                x: options.enemyArmyX ?? 900,
                y: options.enemyArmyY ?? 900,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.enemyArmyUnits ?? 1
                    }
                ]
            }
        ],
        terrain: []
    };
}

/** 当前用例持有的夹具。 */
let fixture: IKingdomFixture | null = null;

/**
 * 构造并登记视野夹具。
 * @param options 场景选项。
 * @returns 已接线的夹具。
 */
function createVisionKingdom(
    options: IVisionScenarioOptions = {}
): IKingdomFixture {
    fixture = createKingdom({ scenario: visionScenario(options), seed: 51 });
    return fixture;
}

/**
 * 释放夹具：先世界、再控制、最后物理。
 * @param target 夹具。
 */
function disposeFixture(target: IKingdomFixture): void {
    target.world.dispose();
    target.control.dispose();
    target.physics.dispose();
}

/**
 * 把单位传送到新位置：只经物理层移除/重注册，保持控制系统与王国模式映射同步。
 * @param target 夹具。
 * @param unitId 单位 id。
 * @param x 新位置 x。
 * @param y 新位置 y。
 */
function teleport(
    target: IKingdomFixture,
    unitId: number,
    x: number,
    y: number
): void {
    teleportUnitPhysics(target, unitId, x, y);
}

/**
 * 读取可见军队 id 列表。
 * @param target 夹具。
 * @param factionId 势力 id。
 * @returns 军队 id 列表。
 */
function visibleArmyIds(
    target: IKingdomFixture,
    factionId: number
): readonly number[] {
    return target.world
        .getVisibleArmies(factionId)
        .map(brief => brief.id)
        .sort((first, second) => first - second);
}

/**
 * 读取可见城池 id 列表。
 * @param target 夹具。
 * @param factionId 势力 id。
 * @returns 城池 id 列表。
 */
function visibleCityIds(
    target: IKingdomFixture,
    factionId: number
): readonly number[] {
    return target.world
        .getVisibleCities(factionId)
        .map(brief => brief.id)
        .sort((first, second) => first - second);
}

describe('vision — 100 m army union with 150 m city vision, no memory', () => {
    beforeAll(async () => {
        await RAPIER.init();
    });

    afterEach(() => {
        if (fixture !== null) {
            disposeFixture(fixture);
            fixture = null;
        }
    });

    it('always includes own armies, cities and units, and rejects unknown factions', () => {
        const kingdom = createVisionKingdom({
            ownArmyX: 100,
            ownArmyY: 100,
            ownArmyUnits: 2,
            ownCityX: 900,
            ownCityY: 100,
            enemyArmyX: 500,
            enemyArmyY: 500,
            enemyArmyUnits: 1,
            enemyCityX: 500,
            enemyCityY: 900
        });

        expect(visibleArmyIds(kingdom, 1)).toEqual([1]);
        expect(visibleCityIds(kingdom, 1)).toEqual([1]);
        expect(
            kingdom.world
                .getVisibleUnitIds(1)
                .slice()
                .sort((first, second) => first - second)
        ).toEqual([1, 2]);

        expect(kingdom.world.getVisibleArmies(999)).toEqual([]);
        expect(kingdom.world.getVisibleCities(999)).toEqual([]);
        expect(kingdom.world.getVisibleUnitIds(999)).toEqual([]);
    });

    it('sees an enemy army at 99 m but not at 101 m when all its units are outside', () => {
        const visible = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            enemyArmyX: 599,
            enemyArmyY: 500,
            enemyArmyUnits: 1
        });
        expect(visibleArmyIds(visible, 1)).toEqual([1, 2]);
        // 单个敌方单位出生在中心 +4 m 处（603 m），因此单位级回退看不到它。
        expect(visible.world.getVisibleUnitIds(1).includes(3)).toBe(false);
        disposeFixture(visible);
        fixture = null;

        const hidden = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            enemyArmyX: 601,
            enemyArmyY: 500,
            enemyArmyUnits: 1
        });
        expect(visibleArmyIds(hidden, 1)).toEqual([1]);
        expect(hidden.world.getVisibleUnitIds(1).includes(3)).toBe(false);
    });

    it('sees an enemy army whose centre is outside when one unit is inside', () => {
        const kingdom = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            enemyArmyX: 620,
            enemyArmyY: 500,
            enemyArmyUnits: 1
        });
        expect(visibleArmyIds(kingdom, 1)).toEqual([1]);

        teleport(kingdom, 3, 599, 500);

        expect(visibleArmyIds(kingdom, 1)).toEqual([1, 2]);
        expect(
            kingdom.world
                .getVisibleUnitIds(1)
                .slice()
                .sort((first, second) => first - second)
        ).toEqual([1, 2, 3]);
    });

    it('uses each unit position for visible unit ids', () => {
        const kingdom = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            ownArmyUnits: 2,
            enemyArmyX: 599,
            enemyArmyY: 500,
            enemyArmyUnits: 2
        });

        // Enemy ids are 3 (offset +4 → 603 m) and 4 (offset -4 → 595 m).
        const visible = kingdom.world.getVisibleUnitIds(1);
        expect(visible).toContain(1);
        expect(visible).toContain(2);
        expect(visible).toContain(4);
        expect(visible).not.toContain(3);
    });

    it('sees an enemy city at 149 m from an own city point but not at 151 m', () => {
        const visible = createVisionKingdom({
            ownArmyX: 100,
            ownArmyY: 100,
            ownCityX: 500,
            ownCityY: 500,
            enemyArmyX: 900,
            enemyArmyY: 900,
            enemyArmyUnits: 1,
            enemyCityX: 649,
            enemyCityY: 500
        });
        expect(visibleCityIds(visible, 1)).toEqual([1, 2]);
        disposeFixture(visible);
        fixture = null;

        const hidden = createVisionKingdom({
            ownArmyX: 100,
            ownArmyY: 100,
            ownCityX: 500,
            ownCityY: 500,
            enemyArmyX: 900,
            enemyArmyY: 900,
            enemyArmyUnits: 1,
            enemyCityX: 651,
            enemyCityY: 500
        });
        expect(visibleCityIds(hidden, 1)).toEqual([1]);
    });

    it('drops an enemy as soon as it leaves the radius and brings it back immediately', () => {
        const kingdom = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            enemyArmyX: 599,
            enemyArmyY: 500,
            enemyArmyUnits: 1
        });
        expect(visibleArmyIds(kingdom, 1)).toEqual([1, 2]);

        const enemy = kingdom.world.getArmy(2);
        expect(enemy).not.toBeNull();
        (enemy as IMutableArmy).setCenter(700, 500);

        expect(visibleArmyIds(kingdom, 1)).toEqual([1]);

        (enemy as IMutableArmy).setCenter(599, 500);

        expect(visibleArmyIds(kingdom, 1)).toEqual([1, 2]);
    });

    it('returns reduced briefs with exactly the contract fields', () => {
        const kingdom = createVisionKingdom({
            ownArmyX: 500,
            ownArmyY: 500,
            ownCityX: 500,
            ownCityY: 500,
            enemyArmyX: 599,
            enemyArmyY: 500,
            enemyArmyUnits: 1,
            enemyCityX: 640,
            enemyCityY: 500
        });

        const armies = kingdom.world.getVisibleArmies(1);
        const enemyArmy = armies.find(brief => brief.id === 2);
        expect(enemyArmy).toBeDefined();
        expect(Object.keys(enemyArmy ?? {}).sort()).toEqual([
            'center',
            'factionId',
            'heading',
            'id',
            'state'
        ]);
        expect(Object.keys(enemyArmy?.center ?? {}).sort()).toEqual(['x', 'y']);
        expect('getUnitIds' in (enemyArmy ?? {})).toBe(false);
        expect('getOrder' in (enemyArmy ?? {})).toBe(false);

        const cities = kingdom.world.getVisibleCities(1);
        const enemyCity = cities.find(brief => brief.id === 2);
        expect(enemyCity).toBeDefined();
        expect(Object.keys(enemyCity ?? {}).sort()).toEqual([
            'factionId',
            'id',
            'kind',
            'position'
        ]);
        expect(Object.keys(enemyCity?.position ?? {}).sort()).toEqual([
            'x',
            'y'
        ]);
        expect('getTrainingProgressMinutes' in (enemyCity ?? {})).toBe(false);
        expect('getGarrisonArmyId' in (enemyCity ?? {})).toBe(false);

        expect(kingdom.world.getVisibleArmies(1)).not.toBe(
            kingdom.world.getVisibleArmies(1)
        );
        expect(kingdom.world.getVisibleCities(1)).not.toBe(
            kingdom.world.getVisibleCities(1)
        );
    });

    it('exposes the documented radii', () => {
        expect(ARMY_VISION_RADIUS).toBe(100);
        expect(CITY_VISION_RADIUS).toBe(150);
    });
});
