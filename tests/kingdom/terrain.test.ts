import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier2d-compat';
import { createKingdom, disposeKingdom } from './harness';
import type { IKingdomFixture } from './harness';
import { CityKind } from '@/kingdom/types';
import type { IScenario, ITerrainRect } from '@/kingdom/types';
import { ClassKind } from '@/units/types';

/**
 * 构造地形套件场景：400×400、单势力、一城一军、无外来干扰。
 * @param terrain 地形矩形列表。
 * @param armyX 军队中心 x。
 * @param armyY 军队中心 y。
 * @param units 军队单位数。
 * @returns 场景表。
 */
function terrainScenario(
    terrain: readonly ITerrainRect[],
    armyX: number,
    armyY: number,
    units = 1
): IScenario {
    return {
        width: 400,
        height: 400,
        factions: [{ id: 1, name: 'Red' }],
        cities: [
            {
                id: 1,
                factionId: 1,
                x: 50,
                y: 50,
                kind: CityKind.Normal,
                garrisonCap: 4,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: armyX,
                y: armyY,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: units }]
            }
        ],
        terrain
    };
}

/** 当前用例创建的夹具（统一清理）。 */
const fixtures: IKingdomFixture[] = [];

/**
 * 构造并登记地形夹具。
 * @param terrain 地形矩形。
 * @param armyX 军队中心 x。
 * @param armyY 军队中心 y。
 * @returns 已接线的夹具。
 */
function createTerrainKingdom(
    terrain: readonly ITerrainRect[],
    armyX = 100,
    armyY = 200
): IKingdomFixture {
    const kingdom = createKingdom({
        scenario: terrainScenario(terrain, armyX, armyY),
        seed: 61
    });
    fixtures.push(kingdom);
    return kingdom;
}

/**
 * 每个物理步施加「朝目标速度」的阻尼力，直接通过物理层驱动单位；
 * 不调用 `world.tick()`，避免行军 AI 覆盖测试施加的力。
 * @param kingdom 夹具。
 * @param unitId 单位 id。
 * @param dirX 目标速度 x 分量（单位向量）。
 * @param dirY 目标速度 y 分量（单位向量）。
 * @param steps 物理步数。
 */
function drive(
    kingdom: IKingdomFixture,
    unitId: number,
    dirX: number,
    dirY: number,
    steps: number
): void {
    const speed = 12;
    const gain = 300;
    for (let step = 0; step < steps; step += 1) {
        const state = kingdom.physics.getUnitState(unitId);
        if (state === null) {
            return;
        }
        kingdom.physics.applyForce(
            unitId,
            (dirX * speed - state.vx) * gain,
            (dirY * speed - state.vy) * gain
        );
        kingdom.control.tick();
    }
}

/**
 * 读取某个单位的第一条名册 id。
 * @param kingdom 夹具。
 * @returns 单位 id。
 */
function firstUnitId(kingdom: IKingdomFixture): number {
    const ids = kingdom.world.getArmy(1)?.getUnitIds() ?? [];
    if (ids.length === 0) {
        throw new Error('army has no units');
    }
    return ids[0];
}

describe('terrain — blocking obstacles, boundary walls and rays', () => {
    beforeAll(async () => {
        await RAPIER.init();
    });

    afterEach(() => {
        while (fixtures.length > 0) {
            const kingdom = fixtures.pop();
            if (kingdom !== undefined) {
                disposeKingdom(kingdom);
            }
        }
    });

    it('stops a unit before the terrain face', () => {
        const terrain: readonly ITerrainRect[] = [
            { x: 200, y: 200, halfWidth: 20, halfHeight: 20 }
        ];
        const kingdom = createTerrainKingdom(terrain);
        const unitId = firstUnitId(kingdom);

        drive(kingdom, unitId, 1, 0, 900);

        const state = kingdom.physics.getUnitState(unitId);
        expect(state).not.toBeNull();
        expect(state?.x).toBeLessThan(180);
        expect(state?.x).toBeGreaterThan(170);
        expect(state?.y).toBeCloseTo(200, 0);
    });

    it('lets a unit pass through the designed gap', () => {
        const terrain: readonly ITerrainRect[] = [
            { x: 200, y: 200, halfWidth: 20, halfHeight: 5 }
        ];
        const kingdom = createTerrainKingdom(terrain, 100, 150);
        const unitId = firstUnitId(kingdom);

        drive(kingdom, unitId, 1, 0, 900);

        const state = kingdom.physics.getUnitState(unitId);
        expect(state).not.toBeNull();
        expect(state?.x).toBeGreaterThan(230);
        expect(state?.x).toBeLessThanOrEqual(400);
    });

    it('keeps a unit inside the map boundary walls', () => {
        const kingdom = createTerrainKingdom([], 350, 200);
        const unitId = firstUnitId(kingdom);

        drive(kingdom, unitId, 1, 0, 900);

        const state = kingdom.physics.getUnitState(unitId);
        expect(state).not.toBeNull();
        expect(state?.x).toBeGreaterThanOrEqual(0);
        expect(state?.x).toBeLessThanOrEqual(400);
        expect(state?.y).toBeGreaterThanOrEqual(0);
        expect(state?.y).toBeLessThanOrEqual(400);
        expect(state?.x).toBeGreaterThan(395);
    });

    it('stops a sensing ray at the terrain face and uses the map boundary elsewhere', () => {
        const terrain: readonly ITerrainRect[] = [
            { x: 200, y: 200, halfWidth: 20, halfHeight: 20 }
        ];
        const kingdom = createTerrainKingdom(terrain);

        const distances = kingdom.sensing.castRayFan(100, 200, 300, []);

        expect(distances).toHaveLength(64);
        // Index 0 = +x, 16 = +y, 32 = -x.
        expect(distances[0]).toBeCloseTo(80, 6);
        expect(distances[16]).toBeCloseTo(200, 6);
        expect(distances[32]).toBeCloseTo(100, 6);
    });

    it('returns a fresh copy of the scenario terrain without boundary walls', () => {
        const terrain: readonly ITerrainRect[] = [
            { x: 200, y: 200, halfWidth: 20, halfHeight: 20 }
        ];
        const snapshot = JSON.stringify(terrain);
        const kingdom = createTerrainKingdom(terrain);

        const returned = kingdom.world.getTerrain();
        expect(returned).toHaveLength(1);
        expect(returned).toEqual(terrain);
        expect(JSON.stringify(terrain)).toBe(snapshot);
        expect(returned[0]).not.toBe(terrain[0]);
    });

    it('removes only its own obstacles on dispose and leaves physics alive', () => {
        const terrain: readonly ITerrainRect[] = [
            { x: 200, y: 200, halfWidth: 20, halfHeight: 20 }
        ];
        const kingdom = createTerrainKingdom(terrain);
        const unitId = firstUnitId(kingdom);

        kingdom.world.dispose();

        expect(kingdom.world.getTerrain()).toEqual(terrain);
        expect(kingdom.physics.hasUnit(unitId)).toBe(true);

        // The terrain obstacle is gone, so the same unit can now cross x = 200.
        drive(kingdom, unitId, 1, 0, 900);
        const state = kingdom.physics.getUnitState(unitId);
        expect(state).not.toBeNull();
        expect(state?.x).toBeGreaterThan(220);
    });

    it('does not leak obstacle ids across two worlds on two physics instances', () => {
        const first = createTerrainKingdom(
            [{ x: 200, y: 200, halfWidth: 20, halfHeight: 20 }],
            100,
            200
        );
        const second = createTerrainKingdom(
            [{ x: 200, y: 200, halfWidth: 20, halfHeight: 20 }],
            100,
            200
        );
        const secondUnitId = firstUnitId(second);

        disposeKingdom(first);

        expect(second.physics.hasUnit(secondUnitId)).toBe(true);
        expect(second.world.getTerrain()).toHaveLength(1);

        drive(second, secondUnitId, 1, 0, 900);
        const blocked = second.physics.getUnitState(secondUnitId);
        expect(blocked).not.toBeNull();
        expect(blocked?.x).toBeLessThan(180);
    });
});
