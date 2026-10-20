import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { Army } from '@/kingdom/Army';
import { City } from '@/kingdom/City';
import { PlaceholderCommander } from '@/kingdom/Commander';
import { DEFAULT_GARRISON_RATIO } from '@/kingdom/constants';
import {
    createDefaultKingdomConfig,
    rememberUnitIdentity
} from '@/kingdom/strategies';
import { ArmyOrderKind, ArmyState, CityKind } from '@/kingdom/types';
import type {
    IArmy,
    IArmyOrder,
    ICommander,
    ICommanderContext,
    IScenario,
    IVisibleArmyBrief,
    IVisibleCityBrief
} from '@/kingdom/types';
import type { IUnitBrief } from '@/control/types';
import { AttributeKind, ClassKind } from '@/units/types';
import { spawnUnit } from '@/units/spawn';
import { mulberry32 } from '../helpers/rng';
import { createKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 构造一支用于上下文的手工军队。
 * @param id 军队 id。
 * @param factionId 势力 id。
 * @param x 中心 x。
 * @param y 中心 y。
 * @param unitIds 名册。
 * @returns 军队。
 */
function makeArmy(
    id: number,
    factionId: number,
    x: number,
    y: number,
    unitIds: readonly number[] = []
): Army {
    const army = new Army(id, factionId, x, y, 0, () => undefined);
    army.setUnitIds(unitIds);
    return army;
}

/**
 * 构造一座用于上下文的手工城池。
 * @param id 城池 id。
 * @param factionId 归属势力。
 * @param x 城池点 x。
 * @param y 城池点 y。
 * @param garrisonCap 驻军上限。
 * @returns 城池。
 */
function makeCity(
    id: number,
    factionId: number | undefined,
    x: number,
    y: number,
    garrisonCap = 10
): City {
    return new City(
        id,
        factionId,
        x,
        y,
        CityKind.Normal,
        garrisonCap,
        ClassKind.Swordsman
    );
}

/**
 * 构造一个可见敌城简讯。
 * @param id 城池 id。
 * @param x 位置 x。
 * @param y 位置 y。
 * @param factionId 归属势力。
 * @returns 简讯。
 */
function visibleCity(
    id: number,
    x: number,
    y: number,
    factionId: number | undefined = 2
): IVisibleCityBrief {
    return {
        id,
        factionId,
        position: { x, y },
        kind: CityKind.Normal
    };
}

/**
 * 构造一个可见敌军简讯。
 * @param id 军队 id。
 * @param x 中心 x。
 * @param y 中心 y。
 * @param factionId 势力 id。
 * @returns 简讯。
 */
function visibleArmy(
    id: number,
    x: number,
    y: number,
    factionId = 2
): IVisibleArmyBrief {
    return {
        id,
        factionId,
        center: { x, y },
        heading: 0,
        state: ArmyState.Marching
    };
}

/**
 * 上下文选项。
 */
interface IContextOptions {
    /** 本势力 id；默认 1。 */
    readonly factionId?: number;
    /** 己方军队。 */
    readonly armies?: readonly IArmy[];
    /** 己方城池。 */
    readonly cities?: readonly City[];
    /** 可见敌军简讯。 */
    readonly enemyArmies?: readonly IVisibleArmyBrief[];
    /** 可见敌城简讯。 */
    readonly enemyCities?: readonly IVisibleCityBrief[];
    /** 可见敌方单位简讯。 */
    readonly enemyUnits?: readonly IUnitBrief[];
}

/**
 * 构造一个完整的指挥官上下文。
 * @param options 选项。
 * @returns 上下文。
 */
function commanderContext(options: IContextOptions = {}): ICommanderContext {
    return {
        factionId: options.factionId ?? 1,
        gameMinutes: 0,
        armies: options.armies ?? [],
        cities: options.cities ?? [],
        visibleEnemyArmies: options.enemyArmies ?? [],
        visibleEnemyCities: options.enemyCities ?? [],
        visibleEnemyUnits: options.enemyUnits ?? []
    };
}

/**
 * 判断指令种类是否属于允许的三种。
 * @param order 指令。
 * @returns 是否允许。
 */
function isAllowedKind(order: IArmyOrder): boolean {
    return (
        order.kind === ArmyOrderKind.MoveTo ||
        order.kind === ArmyOrderKind.Garrison ||
        order.kind === ArmyOrderKind.Hold
    );
}

/**
 * 脚本化指挥官：第一次给一个近目标，抵达后给第二个目标，其余返回空。
 */
class ScriptedCommander implements ICommander {
    /** 真正下达的指令次数。 */
    calls = 0;

    /**
     * 只在军队无指令时下达下一段 `MoveTo`。
     * @param context 上下文。
     * @returns 指令列表。
     */
    decide(context: ICommanderContext): readonly IArmyOrder[] {
        const army = context.armies[0];
        if (army === undefined || army.getOrder() !== null) {
            return [];
        }
        this.calls += 1;
        if (this.calls === 1) {
            return [
                {
                    armyId: army.getId(),
                    kind: ArmyOrderKind.MoveTo,
                    targetX: 500,
                    targetY: 530
                }
            ];
        }
        if (this.calls === 2) {
            return [
                {
                    armyId: army.getId(),
                    kind: ArmyOrderKind.MoveTo,
                    targetX: 500,
                    targetY: 560
                }
            ];
        }
        return [];
    }
}

/**
 * 只在第一次下达 `Hold`，其余返回空。
 */
class HoldCommander implements ICommander {
    /** 决策次数。 */
    calls = 0;

    /**
     * 第一次 `Hold`，之后不再下令。
     * @param context 上下文。
     * @returns 指令列表。
     */
    decide(context: ICommanderContext): readonly IArmyOrder[] {
        this.calls += 1;
        const army = context.armies[0];
        if (this.calls !== 1 || army === undefined) {
            return [];
        }
        return [{ armyId: army.getId(), kind: ArmyOrderKind.Hold }];
    }
}

/**
 * 单势力、单军队、无城池的场景。
 * @returns 场景表。
 */
function singleArmyScenario(): IScenario {
    return {
        width: 1000,
        height: 1000,
        factions: [{ id: 1, name: 'Red' }],
        cities: [],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 500,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 2 }]
            }
        ],
        terrain: []
    };
}

/**
 * 红方军队在 90 m 外看到蓝方空城的场景（无战斗，但会触发 `Garrison` 指令）。
 * @returns 场景表。
 */
function cityApproachScenario(): IScenario {
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
                factionId: 2,
                x: 190,
                y: 500,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 100,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 2 }]
            },
            {
                id: 2,
                factionId: 2,
                x: 900,
                y: 900,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 1 }]
            }
        ],
        terrain: []
    };
}

/**
 * 单势力、一城一军、军队出生在城池点的场景。
 * @returns 场景表。
 */
function homeCityScenario(): IScenario {
    return {
        width: 1000,
        height: 1000,
        factions: [{ id: 1, name: 'Red' }],
        cities: [
            {
                id: 1,
                factionId: 1,
                x: 500,
                y: 500,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 500,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 3 }]
            }
        ],
        terrain: []
    };
}

/**
 * 当前测试持有的夹具。
 */
let fixture: IKingdomFixture | null = null;

describe('PlaceholderCommander — deterministic, context-only orders', () => {
    it('returns identical orders for equal contexts and only allowed kinds without afterMinutes', () => {
        const commander = new PlaceholderCommander(1);
        const own = makeArmy(1, 1, 0, 0, [1, 2]);
        const contexts = [
            commanderContext({
                armies: [own],
                enemyCities: [visibleCity(5, 100, 0)],
                enemyArmies: [visibleArmy(7, 0, 100)]
            }),
            commanderContext({
                armies: [own],
                enemyArmies: [visibleArmy(7, 0, 100)]
            }),
            commanderContext({ armies: [own] })
        ];

        for (const context of contexts) {
            const first = commander.decide(context);
            const second = commander.decide(context);
            expect(first).toEqual(second);
            for (const order of first) {
                expect(isAllowedKind(order)).toBe(true);
                expect(order.afterMinutes).toBeUndefined();
            }
        }

        expect(commander.decide(contexts[0])).toEqual([
            { armyId: 1, kind: ArmyOrderKind.Garrison, cityId: 5 }
        ]);
        expect(commander.decide(contexts[1])).toEqual([
            { armyId: 1, kind: ArmyOrderKind.MoveTo, targetX: 0, targetY: 100 }
        ]);
        expect(commander.decide(contexts[2])).toEqual([
            { armyId: 1, kind: ArmyOrderKind.Hold }
        ]);
    });

    it('skips armies with an existing order or an empty roster', () => {
        const commander = new PlaceholderCommander(1);
        const busy = makeArmy(1, 1, 0, 0, [1]);
        busy.setOrder({
            armyId: 1,
            kind: ArmyOrderKind.MoveTo,
            targetX: 10,
            targetY: 10
        });
        const empty = makeArmy(2, 1, 10, 0, []);

        expect(
            commander.decide(commanderContext({ armies: [busy, empty] }))
        ).toEqual([]);
    });

    it('only targets entities present in the context and ignores own-faction briefs', () => {
        const commander = new PlaceholderCommander(1);
        const own = makeArmy(1, 1, 0, 0, [1]);
        const context = commanderContext({
            armies: [own],
            enemyCities: [visibleCity(99, 5, 0, 1), visibleCity(5, 40, 0, 2)],
            enemyUnits: [
                {
                    unitId: 500,
                    health: 10,
                    level: 1,
                    x: 1,
                    y: 1,
                    equipment: []
                }
            ]
        });

        expect(commander.decide(context)).toEqual([
            { armyId: 1, kind: ArmyOrderKind.Garrison, cityId: 5 }
        ]);
        expect(
            commander.decide(
                commanderContext({
                    armies: [own],
                    enemyUnits: context.visibleEnemyUnits
                })
            )
        ).toEqual([{ armyId: 1, kind: ArmyOrderKind.Hold }]);
    });

    it('breaks distance ties by id and orders armies in id order', () => {
        const commander = new PlaceholderCommander(1);
        const first = makeArmy(1, 1, 0, 0, [1]);
        const second = makeArmy(2, 1, 0, 0, [2]);
        const context = commanderContext({
            armies: [second, first],
            enemyCities: [visibleCity(9, 10, 0), visibleCity(3, -10, 0)]
        });

        expect(commander.decide(context)).toEqual([
            { armyId: 1, kind: ArmyOrderKind.Garrison, cityId: 3 },
            { armyId: 2, kind: ArmyOrderKind.Garrison, cityId: 3 }
        ]);

        const armyTie = commanderContext({
            armies: [first],
            enemyArmies: [visibleArmy(9, 10, 0), visibleArmy(3, -10, 0)]
        });
        expect(commander.decide(armyTie)).toEqual([
            { armyId: 1, kind: ArmyOrderKind.MoveTo, targetX: -10, targetY: 0 }
        ]);
    });
});

describe('commander wiring — cadence, fulfilment and isolation (real Rapier)', () => {
    beforeAll(async () => {
        await initRapier();
    });

    afterEach(() => {
        if (fixture !== null) {
            fixture.world.dispose();
            fixture.control.dispose();
            fixture.physics.dispose();
            fixture = null;
        }
    });

    it('applies a placeholder Garrison order and moves the army', () => {
        fixture = createKingdom({
            scenario: cityApproachScenario(),
            seed: 81
        });
        const kingdom = fixture;

        kingdom.world.tick();
        kingdom.world.tick();

        const order = kingdom.world.getArmy(1)?.getOrder();
        expect(order?.kind).toBe(ArmyOrderKind.Garrison);
        expect(order?.cityId).toBe(1);
        expect(kingdom.world.getArmy(1)?.getCenter().x).toBeGreaterThan(100);
        expect(kingdom.world.getBattleSystem().hasActiveBattle()).toBe(false);
    });

    it('issues a second order after the first MoveTo arrives', () => {
        const commander = new ScriptedCommander();
        fixture = createKingdom({
            scenario: singleArmyScenario(),
            seed: 82,
            commanderFactory: () => commander
        });
        const kingdom = fixture;

        kingdom.world.tick();
        expect(kingdom.world.getArmy(1)?.getOrder()?.targetY).toBe(530);
        expect(commander.calls).toBe(1);

        for (
            let tick = 0;
            tick < 30 && kingdom.world.getArmy(1)?.getOrder() !== null;
            tick += 1
        ) {
            kingdom.world.tick();
        }
        expect(kingdom.world.getArmy(1)?.getOrder()).toBeNull();
        expect(kingdom.world.getArmy(1)?.getCenter().y).toBeCloseTo(530, 0);

        kingdom.world.tick();
        expect(commander.calls).toBe(2);
        expect(kingdom.world.getArmy(1)?.getOrder()?.targetY).toBe(560);

        const before = kingdom.world.getArmy(1)?.getCenter().y ?? 0;
        kingdom.world.tick();
        expect(kingdom.world.getArmy(1)?.getCenter().y).toBeGreaterThan(before);
    });

    it('clears a Hold at the start of the next outer tick', () => {
        const commander = new HoldCommander();
        fixture = createKingdom({
            scenario: singleArmyScenario(),
            seed: 83,
            commanderFactory: () => commander
        });
        const kingdom = fixture;

        kingdom.world.tick();
        expect(kingdom.world.getArmy(1)?.getOrder()?.kind).toBe(
            ArmyOrderKind.Hold
        );
        expect(commander.calls).toBe(1);

        kingdom.world.tick();
        expect(commander.calls).toBe(2);
        expect(kingdom.world.getArmy(1)?.getOrder()).toBeNull();
    });

    it('keeps a garrison satisfied across commander cycles', () => {
        fixture = createKingdom({
            scenario: homeCityScenario(),
            seed: 84
        });
        const kingdom = fixture;
        kingdom.world.issueOrder({
            armyId: 1,
            kind: ArmyOrderKind.Garrison,
            cityId: 1
        });

        kingdom.world.tick();
        for (let tick = 0; tick < 4; tick += 1) {
            kingdom.world.tick();
        }

        expect(kingdom.world.getArmy(1)?.getOrder()?.kind).toBe(
            ArmyOrderKind.Garrison
        );
        expect(kingdom.world.getArmy(1)?.getGarrisonedCityId()).toBe(1);
        expect(kingdom.world.getCity(1)?.getGarrisonArmyId()).toBe(1);
        expect(kingdom.world.getArmy(1)?.getState()).toBe(ArmyState.Garrisoned);
    });

    it('isolates a throwing commander so the world keeps ticking', () => {
        fixture = createKingdom({
            scenario: singleArmyScenario(),
            seed: 85,
            commanderFactory: () => ({
                decide(): readonly IArmyOrder[] {
                    throw new Error('commander down');
                }
            })
        });
        const kingdom = fixture;
        const before = kingdom.world.getTime().getGameMinutes();

        expect(() => kingdom.world.tick()).not.toThrow();
        expect(kingdom.world.getTime().getGameMinutes()).toBeGreaterThan(
            before
        );
    });

    it('isolates a throwing commander factory at construction', () => {
        fixture = createKingdom({
            scenario: singleArmyScenario(),
            seed: 86,
            commanderFactory: () => {
                throw new Error('factory down');
            }
        });
        const kingdom = fixture;

        expect(() => kingdom.world.tick()).not.toThrow();
        expect(kingdom.world.getTime().getGameMinutes()).toBeGreaterThan(0);
    });
});

describe('createDefaultKingdomConfig — production strategies', () => {
    it('uses the level weight and the placeholder commander factory', () => {
        const config = createDefaultKingdomConfig();
        const unit = spawnUnit(ClassKind.Swordsman, mulberry32(91));

        expect(config.unitWeight(unit)).toBe(
            unit.getAttribute(AttributeKind.Level)
        );
        expect(config.commanderFactory(1)).toBeInstanceOf(PlaceholderCommander);
    });

    it('selects max(1, floor(25%)) capped by the city limit, and nothing for no candidates', () => {
        const config = createDefaultKingdomConfig();
        const units = Array.from({ length: 8 }, (_, index) =>
            spawnUnit(ClassKind.Swordsman, mulberry32(index + 1))
        );
        units.forEach((unit, index) => rememberUnitIdentity(unit, index + 1));

        const city = makeCity(1, 1, 0, 0, 10);
        const selected = config.garrisonSelector(city, units);
        expect(selected).toHaveLength(
            Math.max(1, Math.floor(units.length * DEFAULT_GARRISON_RATIO))
        );
        expect(selected.every(id => id >= 1 && id <= 8)).toBe(true);

        expect(config.garrisonSelector(city, [])).toEqual([]);

        const capped = makeCity(2, 1, 0, 0, 1);
        expect(config.garrisonSelector(capped, units)).toHaveLength(1);

        const unregistered = spawnUnit(ClassKind.Swordsman, mulberry32(99));
        expect(config.garrisonSelector(city, [unregistered])).toEqual([]);
    });
});
