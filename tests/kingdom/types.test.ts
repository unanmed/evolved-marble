import { describe, expect, expectTypeOf, it } from 'vitest';

// 从 `@/kingdom/types` 导入枚举值：该导入本身就是别名解析的证明，
// 并会传递性解析 `@/control/types` 与 `@/units/types`。
import {
    ArmyOrderKind,
    ArmyState,
    BattleLifecycleKind,
    BattleState,
    BattleTriggerKind,
    CityKind,
    UnitControlMode
} from '@/kingdom/types';
import type {
    IArmy,
    IArmyOrder,
    IBattle,
    IBattleLifecycleEvent,
    IBattleSystem,
    ICity,
    ICommanderContext,
    IFaction,
    ITimeSystem,
    IScenario,
    IVec2,
    IVisibleArmyBrief,
    IVisibleCityBrief,
    IWorld,
    IWorldTickResult,
    GarrisonSelector,
    UnitWeight
} from '@/kingdom/types';
import type {
    IStaticObstacleSpec,
    IStaticObstacleWorld
} from '@/physics/types';
import { ClassKind } from '@/units/types';
import type { IHealableUnit, IUnit } from '@/units/types';

/**
 * 军队只读 stub：完整实现 9 个方法，并覆盖缺失值约定
 * （无指令 → `null`，未驻扎 / 未交战 → `undefined`）。
 */
function makeArmy(id: number, factionId: number): IArmy {
    const order: IArmyOrder | null = null;
    const center: IVec2 = { x: 12, y: 34 };
    return {
        getId: () => id,
        getFactionId: () => factionId,
        getCenter: () => center,
        getHeading: () => 0.5,
        getState: () => ArmyState.Marching,
        getUnitIds: () => [101, 102],
        getGarrisonedCityId: () => undefined,
        getEngagedBattleId: () => undefined,
        getOrder: () => order
    };
}

/**
 * 城池只读 stub：完整实现 8 个方法，并覆盖无主城池与无驻军两种缺失字面量。
 */
function makeCity(id: number, factionId: number | undefined): ICity {
    return {
        getId: () => id,
        getFactionId: () => factionId,
        getPosition: () => ({ x: 900, y: 100 }),
        getKind: () => CityKind.Capital,
        getGarrisonArmyId: () => undefined,
        getGarrisonCap: () => 20,
        getTrainingClass: () => ClassKind.Swordsman,
        getTrainingProgressMinutes: () => 0
    };
}

/** 战斗只读 stub：完整实现 9 个方法，军队战与未结束分别用 `undefined`。 */
function makeBattle(id: number): IBattle {
    return {
        getId: () => id,
        getState: () => BattleState.Active,
        getTriggerKind: () => BattleTriggerKind.Army,
        getCityId: () => undefined,
        getCenter: () => ({ x: 50, y: 50 }),
        getHalfExtent: () => 40,
        getMemberUnitIds: () => [101],
        getStartedAtMinutes: () => 120,
        getEndedAtMinutes: () => undefined
    };
}

describe('kingdom types — numeric ArmyState enum', () => {
    it('pins all five macro states', () => {
        expect(ArmyState.Marching).toBe(0);
        expect(ArmyState.Garrisoned).toBe(1);
        expect(ArmyState.InBattle).toBe(2);
        expect(ArmyState.Reorganizing).toBe(3);
        expect(ArmyState.Engaging).toBe(4);
    });

    it('all members are integers and distinct', () => {
        const members: readonly number[] = [
            ArmyState.Marching,
            ArmyState.Garrisoned,
            ArmyState.InBattle,
            ArmyState.Reorganizing,
            ArmyState.Engaging
        ];
        expect(members).toHaveLength(5);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(5);
    });
});

describe('kingdom types — numeric UnitControlMode enum', () => {
    it('pins all four unit control modes', () => {
        expect(UnitControlMode.March).toBe(0);
        expect(UnitControlMode.Battle).toBe(1);
        expect(UnitControlMode.Brake).toBe(2);
        expect(UnitControlMode.Idle).toBe(3);
    });

    it('all members are integers and distinct', () => {
        const members: readonly number[] = [
            UnitControlMode.March,
            UnitControlMode.Battle,
            UnitControlMode.Brake,
            UnitControlMode.Idle
        ];
        expect(members).toHaveLength(4);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(4);
    });
});

describe('kingdom types — numeric ArmyOrderKind enum', () => {
    it('pins all four order kinds', () => {
        expect(ArmyOrderKind.March).toBe(0);
        expect(ArmyOrderKind.AttackCity).toBe(1);
        expect(ArmyOrderKind.Garrison).toBe(2);
        expect(ArmyOrderKind.Hold).toBe(3);
    });

    it('all members are integers and distinct', () => {
        const members: readonly number[] = [
            ArmyOrderKind.March,
            ArmyOrderKind.AttackCity,
            ArmyOrderKind.Garrison,
            ArmyOrderKind.Hold
        ];
        expect(members).toHaveLength(4);
        for (const member of members) {
            expect(Number.isInteger(member)).toBe(true);
        }
        expect(new Set<number>(members).size).toBe(4);
    });
});

describe('kingdom types — numeric battle and city enums', () => {
    it('pins BattleState, BattleTriggerKind, BattleLifecycleKind and CityKind', () => {
        expect(BattleState.Active).toBe(0);
        expect(BattleState.Ended).toBe(1);
        expect(BattleTriggerKind.Army).toBe(0);
        expect(BattleTriggerKind.City).toBe(1);
        expect(BattleLifecycleKind.Started).toBe(0);
        expect(BattleLifecycleKind.Ended).toBe(1);
        expect(CityKind.Normal).toBe(0);
        expect(CityKind.Capital).toBe(1);
    });

    it('each pair is integral and distinct', () => {
        const pairs: readonly (readonly number[])[] = [
            [BattleState.Active, BattleState.Ended],
            [BattleTriggerKind.Army, BattleTriggerKind.City],
            [BattleLifecycleKind.Started, BattleLifecycleKind.Ended],
            [CityKind.Normal, CityKind.Capital]
        ];
        for (const pair of pairs) {
            expect(pair).toHaveLength(2);
            for (const member of pair) {
                expect(Number.isInteger(member)).toBe(true);
            }
            expect(new Set<number>(pair).size).toBe(2);
        }
    });
});

describe('kingdom types — read surfaces compile as complete literals', () => {
    it('accepts a complete IFaction literal', () => {
        const faction: IFaction = {
            getId: () => 1,
            getName: () => 'Red',
            getArmyIds: () => [20],
            getCityIds: () => [10]
        };
        expect(faction.getId()).toBe(1);
        expect(faction.getArmyIds()).toHaveLength(1);
    });

    it('accepts complete IArmy and ICity literals (absent literals omitted or undefined)', () => {
        const army = makeArmy(20, 1);
        const city = makeCity(10, undefined);

        expect(army.getOrder()).toBeNull();
        expect(army.getGarrisonedCityId()).toBeUndefined();
        expect(city.getFactionId()).toBeUndefined();
        expect(city.getGarrisonArmyId()).toBeUndefined();
        expectTypeOf(army).toEqualTypeOf<IArmy>();
        expectTypeOf(city).toEqualTypeOf<ICity>();
    });

    it('accepts a complete IBattle literal and both lifecycle event shapes', () => {
        const battle = makeBattle(7);
        const startedEvent: IBattleLifecycleEvent = {
            kind: BattleLifecycleKind.Started,
            battleId: 7,
            gameMinutes: 120
        };
        const mergedEvent: IBattleLifecycleEvent = {
            kind: BattleLifecycleKind.Ended,
            battleId: 8,
            gameMinutes: 150,
            mergedIntoBattleId: 7
        };

        expect(battle.getCityId()).toBeUndefined();
        expect(battle.getEndedAtMinutes()).toBeUndefined();
        expect(startedEvent.gameMinutes).toBe(120);
        expect(mergedEvent.mergedIntoBattleId).toBe(7);
    });

    it('accepts a fully populated march order and a minimal hold order', () => {
        const marchOrder: IArmyOrder = {
            armyId: 20,
            kind: ArmyOrderKind.March,
            targetX: 500,
            targetY: 500,
            startAtMinutes: 0
        };
        const holdOrder: IArmyOrder = {
            armyId: 20,
            kind: ArmyOrderKind.Hold
        };

        expect(marchOrder.kind).toBe(ArmyOrderKind.March);
        expect(holdOrder.startAtMinutes).toBeUndefined();
    });

    it('accepts a complete IScenario literal with an ownerless city', () => {
        const scenario: IScenario = {
            width: 1000,
            height: 1000,
            factions: [
                { id: 1, name: 'Red' },
                { id: 2, name: 'Blue' }
            ],
            cities: [
                {
                    id: 10,
                    factionId: 1,
                    x: 100,
                    y: 100,
                    kind: CityKind.Capital,
                    garrisonCap: 20,
                    trainingClass: ClassKind.Swordsman
                },
                {
                    id: 11,
                    x: 900,
                    y: 900,
                    kind: CityKind.Normal,
                    garrisonCap: 10,
                    trainingClass: ClassKind.Archer
                }
            ],
            armies: [
                {
                    id: 20,
                    factionId: 1,
                    x: 150,
                    y: 150,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 10 }]
                },
                {
                    id: 21,
                    factionId: 2,
                    x: 850,
                    y: 850,
                    heading: 0,
                    units: [{ classKind: ClassKind.Spearman, count: 8 }]
                }
            ],
            terrain: [{ x: 95, y: 95, halfWidth: 30, halfHeight: 5 }]
        };

        expect(scenario.cities[1].factionId).toBeUndefined();
        expect(scenario.armies[0].units[0].count).toBe(10);
        expect(scenario.terrain).toHaveLength(1);
    });

    it('accepts a complete ICommanderContext literal with brief-only enemy slots', () => {
        const visibleArmy: IVisibleArmyBrief = {
            id: 21,
            factionId: 2,
            center: { x: 850, y: 850 },
            heading: 0,
            state: ArmyState.Marching
        };
        const visibleCity: IVisibleCityBrief = {
            id: 11,
            factionId: undefined,
            position: { x: 900, y: 900 },
            kind: CityKind.Normal
        };
        const context: ICommanderContext = {
            factionId: 1,
            gameMinutes: 120,
            armies: [makeArmy(20, 1)],
            cities: [makeCity(10, 1)],
            visibleEnemyArmies: [visibleArmy],
            visibleEnemyCities: [visibleCity],
            visibleEnemyUnits: [
                {
                    unitId: 301,
                    health: 80,
                    level: 3,
                    x: 850,
                    y: 850,
                    equipment: []
                }
            ]
        };

        expect(context.armies).toHaveLength(1);
        expect(context.visibleEnemyArmies[0].id).toBe(21);
        expect(context.visibleEnemyCities[0].factionId).toBeUndefined();
        expect(context.visibleEnemyUnits[0].level).toBe(3);
    });
});

describe('kingdom types — numeric time contract (no rate enum)', () => {
    it('pins per-tick minutes as plain numbers', () => {
        expectTypeOf<
            ITimeSystem['getMinutesPerTick']
        >().returns.toEqualTypeOf<number>();
        expectTypeOf<ITimeSystem['setMinutesPerTick']>()
            .parameter(0)
            .toEqualTypeOf<number>();
        expectTypeOf<
            ITimeSystem['setMinutesPerTick']
        >().returns.toEqualTypeOf<void>();
        expectTypeOf<
            ITimeSystem['getSubstepsPerTick']
        >().returns.toEqualTypeOf<number>();
        expectTypeOf<
            ITimeSystem['getTickIndex']
        >().returns.toEqualTypeOf<number>();
        expectTypeOf<
            ITimeSystem['advanceTick']
        >().returns.toEqualTypeOf<void>();
        expectTypeOf<
            IWorldTickResult['minutesPerTick']
        >().toEqualTypeOf<number>();
        expectTypeOf<IWorldTickResult['gameMinutes']>().toEqualTypeOf<number>();
    });
});

describe('kingdom types — world read surface', () => {
    it('pins tick, getArmy, getFaction and the three visibility queries', () => {
        expectTypeOf<
            IWorld['tick']
        >().returns.toEqualTypeOf<IWorldTickResult>();
        expectTypeOf<IWorld['getArmy']>().returns.toEqualTypeOf<IArmy | null>();
        expectTypeOf<
            IWorld['getFaction']
        >().returns.toEqualTypeOf<IFaction | null>();
        expectTypeOf<IWorld['getCity']>().returns.toEqualTypeOf<ICity | null>();
        expectTypeOf<IWorld['getVisibleArmies']>().returns.toEqualTypeOf<
            readonly IVisibleArmyBrief[]
        >();
        expectTypeOf<IWorld['getVisibleCities']>().returns.toEqualTypeOf<
            readonly IVisibleCityBrief[]
        >();
        expectTypeOf<IWorld['getVisibleUnitIds']>().returns.toEqualTypeOf<
            readonly number[]
        >();
    });
});

describe('kingdom types — battle system signatures', () => {
    it('pins getBattleForUnit and drainEvents', () => {
        expectTypeOf<
            IBattleSystem['getBattleForUnit']
        >().returns.toEqualTypeOf<IBattle | null>();
        expectTypeOf<IBattleSystem['drainEvents']>().returns.toEqualTypeOf<
            readonly IBattleLifecycleEvent[]
        >();
        expectTypeOf<
            IBattleSystem['hasActiveBattle']
        >().returns.toEqualTypeOf<boolean>();
    });
});

describe('kingdom types — injectable strategy seams', () => {
    it('pins UnitWeight exactly', () => {
        expectTypeOf<UnitWeight>().toEqualTypeOf<(unit: IUnit) => number>();
    });

    it('pins GarrisonSelector parameters and return type exactly', () => {
        expectTypeOf<GarrisonSelector>().parameters.toEqualTypeOf<
            [ICity, readonly IUnit[]]
        >();
        expectTypeOf<GarrisonSelector>().returns.toEqualTypeOf<
            readonly number[]
        >();
    });
});

describe('kingdom types — absent literals are undefined', () => {
    it('pins every optional literal return to number | undefined', () => {
        expectTypeOf<ICity['getFactionId']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<ICity['getGarrisonArmyId']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<IArmy['getGarrisonedCityId']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<IArmy['getEngagedBattleId']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<IBattle['getCityId']>().returns.toEqualTypeOf<
            number | undefined
        >();
        expectTypeOf<IBattle['getEndedAtMinutes']>().returns.toEqualTypeOf<
            number | undefined
        >();
    });
});

describe('kingdom types — G-1 healing seam', () => {
    it('IHealableUnit widens to IUnit and adds heal(amount): void', () => {
        // 参数声明为 IHealableUnit、返回声明为 IUnit：该注解就是 extends 关系的编译期证明。
        const widenHealable = (unit: IHealableUnit): IUnit => unit;

        expectTypeOf(widenHealable).returns.toEqualTypeOf<IUnit>();
        expectTypeOf<IHealableUnit['heal']>()
            .parameter(0)
            .toEqualTypeOf<number>();
        expectTypeOf<IHealableUnit['heal']>().returns.toEqualTypeOf<void>();
        expect(typeof widenHealable).toBe('function');
    });
});

describe('kingdom types — G-2 static obstacle seam', () => {
    it('accepts a complete IStaticObstacleSpec and pins the world signatures', () => {
        const spec: IStaticObstacleSpec = {
            x: 10,
            y: 20,
            halfWidth: 5,
            halfHeight: 3
        };

        expect(spec.halfWidth).toBe(5);
        expectTypeOf<IStaticObstacleWorld['addStaticObstacle']>()
            .parameter(0)
            .toEqualTypeOf<IStaticObstacleSpec>();
        expectTypeOf<
            IStaticObstacleWorld['addStaticObstacle']
        >().returns.toEqualTypeOf<number>();
        expectTypeOf<IStaticObstacleWorld['removeStaticObstacle']>()
            .parameter(0)
            .toEqualTypeOf<number>();
        expectTypeOf<
            IStaticObstacleWorld['removeStaticObstacle']
        >().returns.toEqualTypeOf<void>();
    });
});

describe('kingdom types — reduced vision surface (A21)', () => {
    it('pins the exact key sets of both briefs', () => {
        expectTypeOf<keyof IVisibleArmyBrief>().toEqualTypeOf<
            'id' | 'factionId' | 'center' | 'heading' | 'state'
        >();
        expectTypeOf<keyof IVisibleCityBrief>().toEqualTypeOf<
            'id' | 'factionId' | 'position' | 'kind'
        >();
        expectTypeOf<IVisibleCityBrief['factionId']>().toEqualTypeOf<
            number | undefined
        >();
    });

    it('pins the commander enemy slots to the reduced briefs', () => {
        expectTypeOf<ICommanderContext['visibleEnemyArmies']>().toEqualTypeOf<
            readonly IVisibleArmyBrief[]
        >();
        expectTypeOf<ICommanderContext['visibleEnemyCities']>().toEqualTypeOf<
            readonly IVisibleCityBrief[]
        >();
    });
});
