import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier2d-compat';
import { createKingdom } from './harness';
import type { IKingdomFixture } from './harness';
import {
    ArmyOrderKind,
    ArmyState,
    BattleLifecycleKind,
    BattleTriggerKind,
    CityKind
} from '@/kingdom/types';
import type {
    IArmySpawnSpec,
    IBattle,
    GarrisonSelector,
    IKingdomConfig,
    IMutableArmy,
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
 * 静默配置：本套件聚焦驻扎/训练/结算，不让占位指挥官插入宏观指令。
 * @returns 可用的 `IKingdomConfig`。
 */
function silentConfig(): IKingdomConfig {
    return {
        unitWeight: unit => unit.getAttribute(AttributeKind.Level),
        garrisonSelector: () => [],
        commanderFactory: () => ({ decide: () => [] })
    };
}

/**
 * 当前测试持有的夹具：每个用例结束后释放。
 */
let fixture: IKingdomFixture | null = null;

/**
 * 用给定场景构造夹具并登记清理。
 * @param options 场景选项。
 * @param config 可替换策略；默认静默配置。
 * @returns 已接线的夹具。
 */
function createCityKingdom(
    options: ICityScenarioOptions = {},
    config: IKingdomConfig = silentConfig()
): IKingdomFixture {
    fixture = createKingdom({
        scenario: cityScenario(options),
        seed: 31,
        config
    });
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

/**
 * 城池战套件的场景选项：默认红方 6 单位进攻蓝方城池，蓝方 3 单位驻守。
 */
interface ICityBattleOptions {
    /** 攻方中心 x 坐标；默认城池点西侧 60 m。 */
    readonly attackerX?: number;
    /** 攻方中心 y 坐标；默认与城池点相同。 */
    readonly attackerY?: number;
    /** 攻方单位数；默认 6。 */
    readonly attackerUnits?: number;
    /** 守方单位数；默认 3。 */
    readonly garrisonUnits?: number;
    /** 城池点 x 坐标；默认 500。 */
    readonly cityX?: number;
    /** 城池点 y 坐标；默认 500。 */
    readonly cityY?: number;
    /** 驻军上限；默认 10。 */
    readonly garrisonCap?: number;
    /** 蓝方第二座城池（用于败方重组）；省略表示蓝方只有被攻占的城。 */
    readonly secondBlueCity?: {
        readonly id: number;
        readonly x: number;
        readonly y: number;
    };
    /** 附加军队。 */
    readonly extraArmies?: readonly IArmySpawnSpec[];
}

/**
 * 构造城池战场景：红方（1）进攻蓝方（2）的城池 1；蓝方驻军军队 2 出生在城池点。
 * @param options 场景选项。
 * @returns 场景表。
 */
function cityBattleScenario(options: ICityBattleOptions = {}): IScenario {
    const cityX = options.cityX ?? 500;
    const cityY = options.cityY ?? 500;
    const cities = [
        {
            id: 1,
            factionId: 2,
            x: cityX,
            y: cityY,
            kind: CityKind.Normal,
            garrisonCap: options.garrisonCap ?? 10,
            trainingClass: ClassKind.Swordsman
        },
        {
            id: 2,
            factionId: 1,
            x: 100,
            y: 900,
            kind: CityKind.Normal,
            garrisonCap: 10,
            trainingClass: ClassKind.Swordsman
        }
    ];
    if (options.secondBlueCity !== undefined) {
        cities.push({
            id: options.secondBlueCity.id,
            factionId: 2,
            x: options.secondBlueCity.x,
            y: options.secondBlueCity.y,
            kind: CityKind.Normal,
            garrisonCap: 10,
            trainingClass: ClassKind.Swordsman
        });
    }

    return {
        width: 1000,
        height: 1000,
        factions: [
            { id: 1, name: 'Red' },
            { id: 2, name: 'Blue' }
        ],
        cities,
        armies: [
            {
                id: 1,
                factionId: 1,
                x: options.attackerX ?? cityX - 60,
                y: options.attackerY ?? cityY,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.attackerUnits ?? 6
                    }
                ]
            },
            {
                id: 2,
                factionId: 2,
                x: cityX,
                y: cityY,
                heading: 0,
                units: [
                    {
                        classKind: ClassKind.Swordsman,
                        count: options.garrisonUnits ?? 3
                    }
                ]
            },
            ...(options.extraArmies ?? [])
        ],
        terrain: []
    };
}

/**
 * 带可控入驻选择器的配置（指挥官静默）。
 * @param garrisonSelector 入驻选择器。
 * @returns 完整配置。
 */
function configWithSelector(
    garrisonSelector: GarrisonSelector
): IKingdomConfig {
    return {
        unitWeight: unit => unit.getAttribute(AttributeKind.Level),
        garrisonSelector,
        commanderFactory: () => ({ decide: () => [] })
    };
}

/**
 * 构造城池战夹具并把蓝方军队 2 驻扎到城池 1。
 * @param options 场景选项。
 * @param selector 入驻选择器；默认空选择。
 * @returns 已接线的夹具。
 */
function createCityBattle(
    options: ICityBattleOptions = {},
    selector: GarrisonSelector = () => []
): IKingdomFixture {
    fixture = createKingdom({
        scenario: cityBattleScenario(options),
        seed: 71,
        config: configWithSelector(selector)
    });
    orderGarrison(fixture.world, 2, 1);
    return fixture;
}

/**
 * 把单位“传送”到新位置（物理层没有 set-position，移除后以同 id/阵营重新注册）。
 * @param target 夹具。
 * @param unitId 单位 id。
 * @param x 新位置 x。
 * @param y 新位置 y。
 */
function teleportUnit(
    target: IKingdomFixture,
    unitId: number,
    x: number,
    y: number
): void {
    const unit = target.control.getUnit(unitId);
    const teamId = target.control.getTeam(unitId);
    if (unit === null || teamId === undefined) {
        throw new Error(`unit ${unitId} is not registered`);
    }
    target.control.unregisterUnit(unitId);
    target.control.registerUnit({ unitId, unit, teamId, x, y });
}

/**
 * 活跃战斗内出现的不同阵营数量。
 * @param target 夹具。
 * @param battle 战斗。
 * @returns 阵营数量。
 */
function teamCount(target: IKingdomFixture, battle: IBattle): number {
    const teams = new Set<number>();
    for (const unitId of battle.getMemberUnitIds()) {
        const team = target.control.getTeam(unitId);
        if (team !== undefined) {
            teams.add(team);
        }
    }
    return teams.size;
}

/**
 * 推进直到活跃战斗同时拥有双方成员（或达到上界）。
 * @param target 夹具。
 * @param bound 最大推进 tick 数。
 * @returns 活跃战斗。
 */
function tickUntilBothSides(target: IKingdomFixture, bound = 10): IBattle {
    for (let tick = 0; tick < bound; tick += 1) {
        const battles = target.world.getBattleSystem().listActiveBattles();
        if (battles.length > 0 && teamCount(target, battles[0]) === 2) {
            return battles[0];
        }
        target.world.tick();
    }
    const battles = target.world.getBattleSystem().listActiveBattles();
    if (battles.length === 0) {
        throw new Error('no active battle');
    }
    return battles[0];
}

/**
 * 让指定阵营当前仍在战斗中的成员全部阵亡。
 * @param target 夹具。
 * @param battle 战斗。
 * @param teamId 阵营 id。
 */
function killMembersOfTeam(
    target: IKingdomFixture,
    battle: IBattle,
    teamId: number
): void {
    for (const unitId of battle.getMemberUnitIds()) {
        if (target.control.getTeam(unitId) !== teamId) {
            continue;
        }
        const unit = target.control.getUnit(unitId);
        if (unit !== null) {
            unit.takeDamage(unit.getAttribute(AttributeKind.MaxHealth) * 2);
        }
    }
}

/**
 * 推进直到没有活跃战斗（或达到上界）。
 * @param target 夹具。
 * @param bound 最大推进 tick 数。
 */
function tickUntilNoBattle(target: IKingdomFixture, bound = 10): void {
    for (let tick = 0; tick < bound; tick += 1) {
        if (!target.world.getBattleSystem().hasActiveBattle()) {
            return;
        }
        target.world.tick();
    }
}

/**
 * 全部势力名下全部军队名册的并集。
 * @param target 夹具。
 * @returns 单位 id 列表（可能含重复）。
 */
function allRosterIds(target: IKingdomFixture): readonly number[] {
    const ids: number[] = [];
    for (const faction of target.world.getFactions()) {
        for (const armyId of faction.getArmyIds()) {
            ids.push(...(target.world.getArmy(armyId)?.getUnitIds() ?? []));
        }
    }
    return ids;
}

/**
 * 统计一段 tick 中发出的 Started 事件数（每次调用清空缓冲）。
 * @param target 夹具。
 * @param tickCount 推进的 tick 数。
 * @returns Started 事件数。
 */
function countStarted(target: IKingdomFixture, tickCount: number): number {
    let started = 0;
    for (let tick = 0; tick < tickCount; tick += 1) {
        target.world.tick();
        started += target.world
            .getBattleSystem()
            .drainEvents()
            .filter(event => event.kind === BattleLifecycleKind.Started).length;
    }
    return started;
}

describe('city battles — trigger, capture, garrison selection and regroup', () => {
    beforeAll(async () => {
        await RAPIER.init();
    });

    afterEach(() => {
        if (fixture !== null) {
            disposeFixture(fixture);
            fixture = null;
        }
    });

    it('triggers exactly one City battle against a real garrison and settles the capture', () => {
        const selected: number[] = [];
        const kingdom = createCityBattle({}, () => selected);
        const redRoster = kingdom.world.getArmy(1)?.getUnitIds() ?? [];
        expect(redRoster).toHaveLength(6);
        selected.push(redRoster[0], redRoster[1]);
        const teamsBefore = new Map(
            redRoster.map(unitId => [unitId, kingdom.control.getTeam(unitId)])
        );
        orderGarrison(kingdom.world, 1, 1);

        const battle = tickUntilBothSides(kingdom);
        expect(battle.getTriggerKind()).toBe(BattleTriggerKind.City);
        expect(battle.getCityId()).toBe(1);
        expect(
            kingdom.world.getBattleSystem().listActiveBattles()
        ).toHaveLength(1);
        const started = kingdom.world
            .getBattleSystem()
            .drainEvents()
            .filter(event => event.kind === BattleLifecycleKind.Started);
        expect(started).toHaveLength(1);

        killMembersOfTeam(kingdom, battle, 2);
        tickUntilNoBattle(kingdom);

        const city = kingdom.world.getCity(1);
        expect(city?.getFactionId()).toBe(1);
        expect(kingdom.world.getFaction(1)?.getCityIds()).toContain(1);
        expect(kingdom.world.getFaction(2)?.getCityIds()).not.toContain(1);

        for (const unitId of redRoster) {
            expect(kingdom.control.getTeam(unitId)).toBe(
                teamsBefore.get(unitId)
            );
        }

        const garrisonArmyId = city?.getGarrisonArmyId();
        expect(garrisonArmyId).toBe(3);
        const garrison = kingdom.world.getArmy(3);
        expect(garrison?.getFactionId()).toBe(1);
        expect(garrison?.getState()).toBe(ArmyState.Garrisoned);
        expect(garrison?.getGarrisonedCityId()).toBe(1);
        expect(garrison?.getOrder()?.kind).toBe(ArmyOrderKind.Garrison);
        expect(garrison?.getOrder()?.cityId).toBe(1);
        expect(
            [...(garrison?.getUnitIds() ?? [])].sort((a, b) => a - b)
        ).toEqual([redRoster[0], redRoster[1]].sort((a, b) => a - b));

        const fieldArmy = kingdom.world.getArmy(1);
        expect(fieldArmy?.getOrder()).toBeNull();
        expect(fieldArmy?.getGarrisonedCityId()).toBeUndefined();
        expect(fieldArmy?.getUnitIds()).toHaveLength(4);

        const rosterIds = allRosterIds(kingdom);
        expect(rosterIds).toHaveLength(new Set(rosterIds).size);
        const aliveIds = kingdom.control
            .listUnitIds()
            .filter(unitId => kingdom.control.getUnit(unitId)?.isAlive());
        expect(rosterIds).toHaveLength(aliveIds.length);

        for (const faction of kingdom.world.getFactions()) {
            for (const armyId of faction.getArmyIds()) {
                const army = kingdom.world.getArmy(armyId);
                expect(army?.getEngagedBattleId()).toBeUndefined();
                expect(army?.getState()).toBeDefined();
            }
        }

        // A later arrival cannot take the city link away from the new garrison.
        orderGarrison(kingdom.world, 1, 1);
        for (
            let tick = 0;
            tick < 40 && kingdom.world.getArmy(1)?.getOrder() !== null;
            tick += 1
        ) {
            kingdom.world.tick();
        }
        expect(kingdom.world.getArmy(1)?.getOrder()).toBeNull();
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(3);
        expect(kingdom.world.getArmy(1)?.getGarrisonedCityId()).toBeUndefined();
        expect(kingdom.world.getArmy(1)?.getState()).not.toBe(
            ArmyState.Garrisoned
        );
    });

    it('starts no battle for an undefended city and captures it on Garrison arrival', () => {
        const scenario: IScenario = {
            width: 1000,
            height: 1000,
            factions: [
                { id: 1, name: 'Red' },
                { id: 2, name: 'Blue' }
            ],
            cities: [
                {
                    id: 1,
                    factionId: 2,
                    x: 500,
                    y: 500,
                    kind: CityKind.Normal,
                    garrisonCap: 10,
                    trainingClass: ClassKind.Swordsman
                },
                {
                    id: 2,
                    factionId: 1,
                    x: 100,
                    y: 900,
                    kind: CityKind.Normal,
                    garrisonCap: 10,
                    trainingClass: ClassKind.Swordsman
                }
            ],
            armies: [
                {
                    id: 1,
                    factionId: 1,
                    x: 440,
                    y: 500,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 4 }]
                },
                {
                    id: 2,
                    factionId: 2,
                    x: 900,
                    y: 100,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 1 }]
                }
            ],
            terrain: []
        };
        fixture = createKingdom({
            scenario,
            seed: 72,
            config: configWithSelector(() => [])
        });
        const kingdom = fixture;
        orderGarrison(kingdom.world, 1, 1);

        let started = 0;
        for (let tick = 0; tick < 30; tick += 1) {
            kingdom.world.tick();
            started += kingdom.world
                .getBattleSystem()
                .drainEvents()
                .filter(
                    event => event.kind === BattleLifecycleKind.Started
                ).length;
            expect(kingdom.world.getBattleSystem().hasActiveBattle()).toBe(
                false
            );
            if (kingdom.world.getCity(1)?.getFactionId() === 1) {
                break;
            }
        }

        expect(started).toBe(0);
        expect(kingdom.world.getCity(1)?.getFactionId()).toBe(1);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(1);
        expect(kingdom.world.getArmy(1)?.getGarrisonedCityId()).toBe(1);
        expect(kingdom.world.getFaction(2)?.getCityIds()).not.toContain(1);
        expect(kingdom.world.getFaction(1)?.getCityIds()).toContain(1);
    });

    it('keeps the existing garrison and ownership when the defence holds', () => {
        const kingdom = createCityBattle();
        const battle = tickUntilBothSides(kingdom);
        killMembersOfTeam(kingdom, battle, 1);
        tickUntilNoBattle(kingdom);

        expect(kingdom.world.getCity(1)?.getFactionId()).toBe(2);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(2);
        expect(kingdom.world.getArmy(2)?.getGarrisonedCityId()).toBe(1);
        expect(kingdom.world.getArmy(2)?.getOrder()?.kind).toBe(
            ArmyOrderKind.Garrison
        );
        expect(kingdom.world.getArmy(2)?.getState()).toBe(ArmyState.Garrisoned);
        expect(kingdom.world.getArmy(3)).toBeNull();
    });

    it('does not retrigger the army-city pair until the centres separate beyond 80 m', () => {
        const kingdom = createCityBattle();
        const battle = tickUntilBothSides(kingdom);
        const redMembers = battle
            .getMemberUnitIds()
            .filter(unitId => kingdom.control.getTeam(unitId) === 1);
        expect(redMembers.length).toBeGreaterThan(0);
        for (const unitId of redMembers) {
            teleportUnit(kingdom, unitId, 500, 750);
        }
        kingdom.world.tick();
        expect(kingdom.world.getBattleSystem().hasActiveBattle()).toBe(false);
        kingdom.world.getBattleSystem().drainEvents();

        expect(countStarted(kingdom, 3)).toBe(0);

        const fieldArmy = kingdom.world.getArmy(1) as IMutableArmy;
        fieldArmy.setCenter(300, 500);
        kingdom.world.tick();
        fieldArmy.setCenter(440, 500);
        const started = countStarted(kingdom, 1);
        expect(started).toBe(1);
    });

    it('sanitises unknown ids, duplicates and non-finite values from the selector', () => {
        const selected: number[] = [];
        const kingdom = createCityBattle({}, () => selected);
        const redRoster = kingdom.world.getArmy(1)?.getUnitIds() ?? [];
        selected.push(999999, redRoster[1], redRoster[1], NaN, redRoster[2]);
        orderGarrison(kingdom.world, 1, 1);

        const battle = tickUntilBothSides(kingdom);
        killMembersOfTeam(kingdom, battle, 2);
        tickUntilNoBattle(kingdom);

        const garrison = kingdom.world.getArmy(3);
        expect(garrison?.getUnitIds()).toHaveLength(2);
        expect(
            [...(garrison?.getUnitIds() ?? [])].sort((a, b) => a - b)
        ).toEqual([redRoster[1], redRoster[2]].sort((a, b) => a - b));
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(3);
    });

    it('caps the garrison at the city limit', () => {
        const selected: number[] = [];
        const kingdom = createCityBattle({ garrisonCap: 1 }, () => selected);
        const redRoster = kingdom.world.getArmy(1)?.getUnitIds() ?? [];
        selected.push(...redRoster);
        orderGarrison(kingdom.world, 1, 1);

        const battle = tickUntilBothSides(kingdom);
        killMembersOfTeam(kingdom, battle, 2);
        tickUntilNoBattle(kingdom);

        expect(kingdom.world.getArmy(3)?.getUnitIds()).toHaveLength(1);
        expect(kingdom.world.getArmy(1)?.getUnitIds()).toHaveLength(5);
    });

    it('treats a throwing selector as an empty selection and clears the field order', () => {
        const kingdom = createCityBattle({}, () => {
            throw new Error('bad selector');
        });
        orderGarrison(kingdom.world, 1, 1);

        const battle = tickUntilBothSides(kingdom);
        killMembersOfTeam(kingdom, battle, 2);
        tickUntilNoBattle(kingdom);

        expect(kingdom.world.getCity(1)?.getFactionId()).toBe(1);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBeUndefined();
        expect(kingdom.world.getArmy(3)).toBeNull();
        expect(kingdom.world.getArmy(1)?.getUnitIds()).toHaveLength(6);
        expect(kingdom.world.getArmy(1)?.getOrder()).toBeNull();
    });

    it('regroups a defeated garrison toward its nearest remaining city', () => {
        const kingdom = createCityBattle({
            secondBlueCity: { id: 3, x: 900, y: 900 }
        });
        const battle = tickUntilBothSides(kingdom);
        const blueMember = battle
            .getMemberUnitIds()
            .find(unitId => kingdom.control.getTeam(unitId) === 2);
        expect(blueMember).toBeDefined();
        if (blueMember === undefined) {
            return;
        }
        teleportUnit(kingdom, blueMember, 900, 700);
        kingdom.world.tick();

        const active = kingdom.world.getBattleSystem().listActiveBattles()[0];
        expect(active).toBeDefined();
        if (active === undefined) {
            return;
        }
        killMembersOfTeam(kingdom, active, 2);
        tickUntilNoBattle(kingdom);

        const defeated = kingdom.world.getArmy(2);
        expect(defeated?.getGarrisonedCityId()).toBeUndefined();
        expect(defeated?.getOrder()?.kind).toBe(ArmyOrderKind.MoveTo);
        expect(defeated?.getOrder()?.targetX).toBe(900);
        expect(defeated?.getOrder()?.targetY).toBe(900);
        expect(defeated?.getState()).toBe(ArmyState.Reorganizing);
        expect(defeated?.getCenter().x).toBeCloseTo(900, 6);
        expect(defeated?.getCenter().y).toBeCloseTo(700, 6);
    });

    it('regroups toward a deterministic direction when the loser owns no city', () => {
        const kingdom = createCityBattle();
        const battle = tickUntilBothSides(kingdom);
        const blueMember = battle
            .getMemberUnitIds()
            .find(unitId => kingdom.control.getTeam(unitId) === 2);
        expect(blueMember).toBeDefined();
        if (blueMember === undefined) {
            return;
        }
        teleportUnit(kingdom, blueMember, 900, 700);
        kingdom.world.tick();

        const active = kingdom.world.getBattleSystem().listActiveBattles()[0];
        if (active === undefined) {
            return;
        }
        killMembersOfTeam(kingdom, active, 2);
        tickUntilNoBattle(kingdom);

        const defeated = kingdom.world.getArmy(2);
        expect(defeated?.getOrder()?.kind).toBe(ArmyOrderKind.MoveTo);
        const angle = (2 * 2.399963229728653) % (Math.PI * 2);
        expect(defeated?.getOrder()?.targetX).toBeCloseTo(
            Math.min(Math.max(900 + Math.cos(angle) * 400, 0), 1000),
            6
        );
        expect(defeated?.getOrder()?.targetY).toBeCloseTo(
            Math.min(Math.max(700 + Math.sin(angle) * 400, 0), 1000),
            6
        );
    });

    it('keeps the City battle when it overlaps an army battle', () => {
        const kingdom = createCityBattle({
            extraArmies: [
                {
                    id: 3,
                    factionId: 2,
                    x: 380,
                    y: 500,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 1 }]
                }
            ]
        });

        kingdom.world.tick();

        const active = kingdom.world.getBattleSystem().listActiveBattles();
        expect(active).toHaveLength(1);
        expect(active[0].getTriggerKind()).toBe(BattleTriggerKind.City);
        expect(active[0].getCityId()).toBe(1);
    });
});
