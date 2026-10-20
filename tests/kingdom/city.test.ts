import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier2d-compat';
import { createKingdom } from './harness';
import type { IKingdomFixture } from './harness';
import { ArmyOrderKind, ArmyState, CityKind } from '@/kingdom/types';
import type {
    IArmySpawnSpec,
    IMutableCity,
    IScenario,
    IWorld
} from '@/kingdom/types';
import { AttributeKind, ClassKind } from '@/units/types';

/**
 * 城池套件的场景选项：默认两势力、各一城一军、无地形。
 */
interface ICityScenarioOptions {
    /** 城池规模；默认普通城。 */
    readonly cityKind?: CityKind;
    /** 驻军上限；默认 10。 */
    readonly garrisonCap?: number;
    /** 城池点 x 坐标；默认 500。 */
    readonly cityX?: number;
    /** 城池点 y 坐标；默认 500。 */
    readonly cityY?: number;
    /** 本势力军队中心 x 坐标；默认与城池点相同。 */
    readonly armyX?: number;
    /** 本势力军队中心 y 坐标；默认与城池点相同。 */
    readonly armyY?: number;
    /** 本势力军队的单位数；默认 4。 */
    readonly armyUnits?: number;
    /** 敌方军队中心 x 坐标；默认 200。 */
    readonly enemyX?: number;
    /** 敌方军队中心 y 坐标；默认 900。 */
    readonly enemyY?: number;
    /** 敌方军队单位数；默认 1（只有开战用例需要更多）。 */
    readonly enemyUnits?: number;
    /** 附加军队（同势力第二支等）。 */
    readonly extraArmies?: readonly IArmySpawnSpec[];
}

/**
 * 构造城池套件场景：1000×1000、两势力、无地形；敌方默认远在地图另一角，
 * 避免行军套件以外的战斗干扰训练与回血计时。
 * @param options 场景选项。
 * @returns 场景表。
 */
function cityScenario(options: ICityScenarioOptions = {}): IScenario {
    const cityX = options.cityX ?? 500;
    const cityY = options.cityY ?? 500;
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
                x: cityX,
                y: cityY,
                kind: options.cityKind ?? CityKind.Normal,
                garrisonCap: options.garrisonCap ?? 10,
                trainingClass: ClassKind.Swordsman
            },
            {
                id: 2,
                factionId: 2,
                x: 950,
                y: 50,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: options.armyX ?? cityX,
                y: options.armyY ?? cityY,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.armyUnits ?? 4
                    }
                ]
            },
            {
                id: 2,
                factionId: 2,
                x: options.enemyX ?? 200,
                y: options.enemyY ?? 900,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.enemyUnits ?? 1
                    }
                ]
            },
            ...(options.extraArmies ?? [])
        ],
        terrain: []
    };
}

/**
 * 当前测试持有的夹具：每个用例结束后释放。
 */
let fixture: IKingdomFixture | null = null;

/**
 * 用给定场景构造夹具并登记清理。
 * @param options 场景选项。
 * @returns 已接线的夹具。
 */
function createCityKingdom(
    options: ICityScenarioOptions = {}
): IKingdomFixture {
    fixture = createKingdom({ scenario: cityScenario(options), seed: 31 });
    return fixture;
}

/**
 * 释放夹具：先世界、再控制、最后物理（外部持有者的顺序）。
 * @param target 夹具。
 */
function disposeFixture(target: IKingdomFixture): void {
    target.world.dispose();
    target.control.dispose();
    target.physics.dispose();
}

/**
 * 下达驻扎指令。
 * @param world 世界。
 * @param armyId 军队 id。
 * @param cityId 城池 id。
 */
function orderGarrison(world: IWorld, armyId: number, cityId: number): void {
    world.issueOrder({
        armyId,
        kind: ArmyOrderKind.Garrison,
        cityId
    });
}

/**
 * 读取军队当前名册。
 * @param target 夹具。
 * @param armyId 军队 id。
 * @returns 单位 id 列表。
 */
function rosterOf(target: IKingdomFixture, armyId: number): readonly number[] {
    return target.world.getArmy(armyId)?.getUnitIds() ?? [];
}

/**
 * 读取单位当前生命值。
 * @param target 夹具。
 * @param unitId 单位 id。
 * @returns 生命值。
 */
function healthOf(target: IKingdomFixture, unitId: number): number {
    const unit = target.control.getUnit(unitId);
    if (unit === null) {
        throw new Error(`unit ${unitId} is not registered`);
    }
    return unit.getAttribute(AttributeKind.Health);
}

/**
 * 让名册内每个单位失去相同的生命值（制造回血余量）。
 * @param target 夹具。
 * @param unitIds 单位 id 列表。
 * @param amount 扣除量。
 */
function damageAll(
    target: IKingdomFixture,
    unitIds: readonly number[],
    amount: number
): void {
    for (const unitId of unitIds) {
        const unit = target.control.getUnit(unitId);
        if (unit === null) {
            throw new Error(`unit ${unitId} is not registered`);
        }
        unit.takeDamage(amount);
    }
}

/**
 * 把城池的只读视图当作内部可变视图：训练进度没有公共写入口，
 * 测试用已声明的 `IMutableCity` 预置进度以缩短运行时间。
 * @param world 世界。
 * @param cityId 城池 id。
 * @returns 可变城池视图。
 */
function mutableCity(world: IWorld, cityId: number): IMutableCity {
    const city = world.getCity(cityId);
    if (city === null) {
        throw new Error(`city ${cityId} does not exist`);
    }
    return city as IMutableCity;
}

describe('city — garrison, training and garrison healing', () => {
    beforeAll(async () => {
        await RAPIER.init();
    });

    afterEach(() => {
        if (fixture !== null) {
            disposeFixture(fixture);
            fixture = null;
        }
    });

    it('links both sides of a Garrison order and freezes the centre', () => {
        const kingdom = createCityKingdom();
        orderGarrison(kingdom.world, 1, 1);

        kingdom.world.tick();

        const army = kingdom.world.getArmy(1);
        const city = kingdom.world.getCity(1);
        expect(army).not.toBeNull();
        expect(city).not.toBeNull();
        expect(army?.getState()).toBe(ArmyState.Garrisoned);
        expect(army?.getGarrisonedCityId()).toBe(1);
        expect(city?.getGarrisonArmyId()).toBe(1);

        const frozen = army?.getCenter();
        kingdom.world.tick();
        kingdom.world.tick();
        const after = army?.getCenter();
        expect(after?.x).toBe(frozen?.x);
        expect(after?.y).toBe(frozen?.y);
    });

    it('never overwrites an existing garrison when a second army arrives', () => {
        const kingdom = createCityKingdom({
            armyX: 500,
            armyY: 500,
            extraArmies: [
                {
                    id: 3,
                    factionId: 1,
                    x: 500,
                    y: 520,
                    heading: Math.PI / 2,
                    units: [{ classKind: ClassKind.Swordsman, count: 4 }]
                }
            ]
        });
        orderGarrison(kingdom.world, 1, 1);
        orderGarrison(kingdom.world, 3, 1);

        kingdom.world.tick();
        const first = kingdom.world.getArmy(1);
        expect(first?.getGarrisonedCityId()).toBe(1);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(1);

        for (let tick = 0; tick < 6; tick += 1) {
            kingdom.world.tick();
        }

        const arriving = kingdom.world.getArmy(3);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(1);
        expect(first?.getGarrisonedCityId()).toBe(1);
        expect(first?.getState()).toBe(ArmyState.Garrisoned);
        expect(arriving?.getOrder()).toBeNull();
        expect(arriving?.getGarrisonedCityId()).toBeUndefined();
        expect(arriving?.getState()).toBe(ArmyState.Marching);
    });

    it('clears both links when a garrisoned army receives MoveTo or Hold', () => {
        const kingdom = createCityKingdom();
        orderGarrison(kingdom.world, 1, 1);
        kingdom.world.tick();

        kingdom.world.issueOrder({
            armyId: 1,
            kind: ArmyOrderKind.MoveTo,
            targetX: 900,
            targetY: 900
        });

        const army = kingdom.world.getArmy(1);
        expect(army?.getGarrisonedCityId()).toBeUndefined();
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBeUndefined();
        expect(army?.getState()).toBe(ArmyState.Marching);

        kingdom.world.tick();
        expect(army?.getState()).toBe(ArmyState.Marching);

        orderGarrison(kingdom.world, 1, 1);
        kingdom.world.tick();
        kingdom.world.tick();
        expect(army?.getGarrisonedCityId()).toBe(1);

        kingdom.world.issueOrder({ armyId: 1, kind: ArmyOrderKind.Hold });
        expect(army?.getGarrisonedCityId()).toBeUndefined();
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBeUndefined();
    });

    it('trains exactly one unit after 96 hours in a normal city', () => {
        const kingdom = createCityKingdom({
            cityKind: CityKind.Normal,
            garrisonCap: 8,
            armyUnits: 4
        });
        orderGarrison(kingdom.world, 1, 1);
        const city = mutableCity(kingdom.world, 1);

        for (let tick = 0; tick < 239; tick += 1) {
            kingdom.world.tick();
        }
        expect(rosterOf(kingdom, 1)).toHaveLength(4);
        expect(city.getTrainingProgressMinutes()).toBe(239 * 24);

        kingdom.world.tick();

        const roster = rosterOf(kingdom, 1);
        expect(roster).toHaveLength(5);
        expect(city.getTrainingProgressMinutes()).toBe(0);
        const producedId = roster[4];
        expect(producedId).toBeGreaterThan(5);
        expect(kingdom.physics.hasUnit(producedId)).toBe(true);
        expect(kingdom.control.getUnit(producedId)).not.toBeNull();
        expect(kingdom.control.getTeam(producedId)).toBe(1);
        expect(kingdom.control.getUnit(producedId)?.getClass()).toBe(
            ClassKind.Swordsman
        );
    });

    it('trains exactly one unit after 72 hours in a capital', () => {
        const kingdom = createCityKingdom({
            cityKind: CityKind.Capital,
            garrisonCap: 8,
            armyUnits: 4
        });
        orderGarrison(kingdom.world, 1, 1);
        const city = mutableCity(kingdom.world, 1);

        for (let tick = 0; tick < 179; tick += 1) {
            kingdom.world.tick();
        }
        expect(rosterOf(kingdom, 1)).toHaveLength(4);
        expect(city.getTrainingProgressMinutes()).toBe(179 * 24);

        kingdom.world.tick();

        expect(rosterOf(kingdom, 1)).toHaveLength(5);
        expect(city.getTrainingProgressMinutes()).toBe(0);
    });

    it('keeps the leftover progress after production', () => {
        const kingdom = createCityKingdom({ garrisonCap: 8, armyUnits: 4 });
        orderGarrison(kingdom.world, 1, 1);
        const city = mutableCity(kingdom.world, 1);
        city.setTrainingProgressMinutes(5800);

        kingdom.world.tick();

        expect(rosterOf(kingdom, 1)).toHaveLength(5);
        expect(city.getTrainingProgressMinutes()).toBe(64);
    });

    it('pauses training at the garrison cap', () => {
        const kingdom = createCityKingdom({ garrisonCap: 4, armyUnits: 4 });
        orderGarrison(kingdom.world, 1, 1);
        const city = mutableCity(kingdom.world, 1);
        city.setTrainingProgressMinutes(5000);

        for (let tick = 0; tick < 10; tick += 1) {
            kingdom.world.tick();
        }

        expect(rosterOf(kingdom, 1)).toHaveLength(4);
        expect(city.getTrainingProgressMinutes()).toBe(5000);
    });

    it('pauses training while the garrison is in a battle', () => {
        const kingdom = createCityKingdom({
            garrisonCap: 8,
            armyUnits: 4,
            enemyX: 540,
            enemyY: 500,
            enemyUnits: 4
        });
        orderGarrison(kingdom.world, 1, 1);
        const city = mutableCity(kingdom.world, 1);

        kingdom.world.tick();
        expect(kingdom.world.getBattleSystem().hasActiveBattle()).toBe(true);
        const pausedAt = city.getTrainingProgressMinutes();

        for (let tick = 0; tick < 5; tick += 1) {
            kingdom.world.tick();
        }

        expect(kingdom.world.getArmy(1)?.getState()).toBe(ArmyState.Engaging);
        expect(city.getTrainingProgressMinutes()).toBe(pausedAt);
        expect(rosterOf(kingdom, 1)).toHaveLength(4);
    });

    it('heals a garrisoned army at 2/h and never above the maximum', () => {
        const kingdom = createCityKingdom();
        orderGarrison(kingdom.world, 1, 1);
        kingdom.world.tick();

        const unitIds = rosterOf(kingdom, 1);
        damageAll(kingdom, unitIds, 10);
        const before = unitIds.map(unitId => healthOf(kingdom, unitId));

        for (let tick = 0; tick < 3; tick += 1) {
            kingdom.world.tick();
        }

        unitIds.forEach((unitId, index) => {
            const healed = healthOf(kingdom, unitId) - before[index];
            expect(healed).toBeGreaterThan(1.4);
            expect(healed).toBeLessThan(3.4);
        });

        disposeFixture(kingdom);
        fixture = null;
        const fullKingdom = createCityKingdom();
        orderGarrison(fullKingdom.world, 1, 1);
        const fullIds = rosterOf(fullKingdom, 1);
        const maxes = fullIds.map(unitId =>
            fullKingdom.control
                .getUnit(unitId)
                ?.getAttribute(AttributeKind.MaxHealth)
        );
        for (let tick = 0; tick < 3; tick += 1) {
            fullKingdom.world.tick();
        }
        fullIds.forEach((unitId, index) => {
            expect(healthOf(fullKingdom, unitId)).toBe(maxes[index]);
        });
    });
});
