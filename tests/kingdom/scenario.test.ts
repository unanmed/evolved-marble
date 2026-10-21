import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import type { IUnitAIProvider } from '@/control/types';
import { BattleDamageSink } from '@/kingdom/DamageSink';
import { IdleAI } from '@/kingdom/IdleAI';
import { KingdomWorld } from '@/kingdom/KingdomWorld';
import {
    DEFAULT_SCENARIO,
    SCENARIO_MINIMAL,
    validateScenario
} from '@/kingdom/scenario';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import { createDefaultKingdomConfig } from '@/kingdom/strategies';
import { ArmyOrderKind, CityKind } from '@/kingdom/types';
import type { IScenario } from '@/kingdom/types';
import { MAX_SCENARIO_ARMIES, MAX_SCENARIO_UNITS } from '@/kingdom/constants';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { ClassKind } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { createKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 递归可变视图（仅测试用：合法场景克隆后逐项破坏）。
 */
type DeepMutable<T> = T extends readonly (infer U)[]
    ? DeepMutable<U>[]
    : T extends object
      ? { -readonly [K in keyof T]: DeepMutable<T[K]> }
      : T;

/**
 * 深拷贝一张场景表并放宽只读限制。
 * @param scenario 场景表。
 * @returns 可变副本。
 */
function mutableClone(scenario: IScenario): DeepMutable<IScenario> {
    return structuredClone(scenario) as DeepMutable<IScenario>;
}

/**
 * 一张完全合法的基准场景：两势力、一城一军、一块不冲突的地形。
 * @returns 场景表。
 */
function validScenario(): IScenario {
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
                x: 200,
                y: 200,
                kind: CityKind.Normal,
                garrisonCap: 10,
                trainingClass: ClassKind.Swordsman
            }
        ],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 300,
                y: 300,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 2 }]
            }
        ],
        terrain: [{ x: 800, y: 800, halfWidth: 50, halfHeight: 50 }]
    };
}

/**
 * 一条拒绝用例。
 */
interface IRejectionCase {
    /** 用例名（同时作为断言消息）。 */
    readonly name: string;
    /** 对合法副本施加的单一破坏。 */
    readonly mutate: (scenario: DeepMutable<IScenario>) => void;
}

/**
 * 覆盖计划列出的全部拒绝类别。
 */
const rejectionCases: readonly IRejectionCase[] = [
    {
        name: 'NaN width',
        mutate: scenario => {
            scenario.width = NaN;
        }
    },
    {
        name: 'zero width',
        mutate: scenario => {
            scenario.width = 0;
        }
    },
    {
        name: 'infinite height',
        mutate: scenario => {
            scenario.height = Number.POSITIVE_INFINITY;
        }
    },
    {
        name: 'non-integer faction id',
        mutate: scenario => {
            scenario.factions[0].id = 1.5;
        }
    },
    {
        name: 'duplicate faction id',
        mutate: scenario => {
            scenario.factions.push({ id: 1, name: 'Other' });
        }
    },
    {
        name: 'empty faction name',
        mutate: scenario => {
            scenario.factions[0].name = '   ';
        }
    },
    {
        name: 'non-integer city id',
        mutate: scenario => {
            scenario.cities[0].id = 1.5;
        }
    },
    {
        name: 'duplicate city id',
        mutate: scenario => {
            scenario.cities.push({ ...scenario.cities[0] });
        }
    },
    {
        name: 'non-integer army id',
        mutate: scenario => {
            scenario.armies[0].id = 1.5;
        }
    },
    {
        name: 'duplicate army id',
        mutate: scenario => {
            scenario.armies.push({ ...scenario.armies[0] });
        }
    },
    {
        name: 'city references unknown faction',
        mutate: scenario => {
            scenario.cities[0].factionId = 99;
        }
    },
    {
        name: 'army references unknown faction',
        mutate: scenario => {
            scenario.armies[0].factionId = 99;
        }
    },
    {
        name: 'non-finite city position',
        mutate: scenario => {
            scenario.cities[0].x = NaN;
        }
    },
    {
        name: 'city outside the map',
        mutate: scenario => {
            scenario.cities[0].y = -1;
        }
    },
    {
        name: 'non-finite army position',
        mutate: scenario => {
            scenario.armies[0].x = NaN;
        }
    },
    {
        name: 'army outside the map',
        mutate: scenario => {
            scenario.armies[0].x = 1001;
        }
    },
    {
        name: 'non-finite army heading',
        mutate: scenario => {
            scenario.armies[0].heading = NaN;
        }
    },
    {
        name: 'non-finite terrain half extent',
        mutate: scenario => {
            scenario.terrain[0].halfWidth = NaN;
        }
    },
    {
        name: 'zero terrain half extent',
        mutate: scenario => {
            scenario.terrain[0].halfHeight = 0;
        }
    },
    {
        name: 'terrain outside the map',
        mutate: scenario => {
            scenario.terrain[0].x = 990;
        }
    },
    {
        name: 'non-integer unit count',
        mutate: scenario => {
            scenario.armies[0].units[0].count = 1.5;
        }
    },
    {
        name: 'zero unit count',
        mutate: scenario => {
            scenario.armies[0].units[0].count = 0;
        }
    },
    {
        name: 'empty unit list',
        mutate: scenario => {
            scenario.armies[0].units = [];
        }
    },
    {
        name: 'unknown unit class',
        mutate: scenario => {
            scenario.armies[0].units[0].classKind = 99 as ClassKind;
        }
    },
    {
        name: 'non-integer garrison cap',
        mutate: scenario => {
            scenario.cities[0].garrisonCap = 2.5;
        }
    },
    {
        name: 'unknown city kind',
        mutate: scenario => {
            scenario.cities[0].kind = 99 as CityKind;
        }
    },
    {
        name: 'unknown training class',
        mutate: scenario => {
            scenario.cities[0].trainingClass = 99 as ClassKind;
        }
    },
    {
        name: 'numeric-enum reverse-map training class',
        mutate: scenario => {
            scenario.cities[0].trainingClass =
                'Swordsman' as unknown as ClassKind;
        }
    },
    {
        name: 'numeric-enum reverse-map city kind',
        mutate: scenario => {
            scenario.cities[0].kind = 'Capital' as unknown as CityKind;
        }
    },
    {
        name: 'numeric string city kind',
        mutate: scenario => {
            scenario.cities[0].kind = '0' as unknown as CityKind;
        }
    },
    {
        name: 'numeric-enum reverse-map unit class',
        mutate: scenario => {
            scenario.armies[0].units[0].classKind =
                'Swordsman' as unknown as ClassKind;
        }
    },
    {
        name: 'total units exceed the ceiling',
        mutate: scenario => {
            scenario.armies[0].units = [
                {
                    classKind: ClassKind.Swordsman,
                    count: MAX_SCENARIO_UNITS + 1
                }
            ];
        }
    },
    {
        name: 'armies exceed the ceiling',
        mutate: scenario => {
            for (let id = 2; id <= MAX_SCENARIO_ARMIES + 1; id += 1) {
                scenario.armies.push({
                    id,
                    factionId: 1,
                    x: 100,
                    y: 100,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 1 }]
                });
            }
        }
    },
    {
        name: 'army spawn point inside terrain',
        mutate: scenario => {
            scenario.armies[0].x = 800;
            scenario.armies[0].y = 800;
        }
    },
    {
        name: 'city point inside terrain',
        mutate: scenario => {
            scenario.cities[0].x = 800;
            scenario.cities[0].y = 800;
        }
    }
];

/**
 * 当前测试持有的夹具。
 */
let fixture: IKingdomFixture | null = null;

describe('validateScenario — complete pre-construction input validation', () => {
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

    it('accepts the built-in scenarios and a complete custom table', () => {
        expect(() => validateScenario(DEFAULT_SCENARIO)).not.toThrow();
        expect(() => validateScenario(SCENARIO_MINIMAL)).not.toThrow();
        expect(() => validateScenario(validScenario())).not.toThrow();
    });

    it('rejects every invalid input class', () => {
        for (const testCase of rejectionCases) {
            const scenario = mutableClone(validScenario());
            testCase.mutate(scenario);
            expect(() => validateScenario(scenario), testCase.name).toThrow(
                /validateScenario/
            );
        }
    });

    it('rejects before any state exists in physics or control', () => {
        const base = validScenario();
        const physics = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(11)
        );
        const sensing = new KingdomSensingWorld(
            base.width,
            base.height,
            base.terrain
        );
        const provider: IUnitAIProvider = {
            create: () => new IdleAI(),
            destroy: () => {
                // 无内部状态。
            }
        };
        const sink = new BattleDamageSink(physics, () => null);
        const control = new ControlSystem(physics, sensing, provider, sink);

        const originalAdd = physics.addStaticObstacle.bind(physics);
        let obstacleCalls = 0;
        physics.addStaticObstacle = spec => {
            obstacleCalls += 1;
            return originalAdd(spec);
        };

        const invalid = mutableClone(base);
        invalid.armies[0].x = -10;

        expect(
            () =>
                new KingdomWorld(
                    physics,
                    control,
                    mulberry32(12),
                    invalid,
                    createDefaultKingdomConfig()
                )
        ).toThrow(/validateScenario/);

        expect(control.listUnitIds()).toEqual([]);
        expect(physics.hasUnit(1)).toBe(false);
        expect(obstacleCalls).toBe(0);

        control.dispose();
        physics.dispose();
    });
});

describe('KingdomWorld — scenario ownership and team mapping (KING-08)', () => {
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

    it('maps every faction, army, city and spawned unit back to the scenario table', () => {
        const scenario = DEFAULT_SCENARIO;
        fixture = createKingdom({ scenario, seed: 101 });
        const { world, control } = fixture;

        expect(world.getScenario()).toBe(scenario);

        for (const factionSpec of scenario.factions) {
            const faction = world.getFaction(factionSpec.id);
            expect(faction).not.toBeNull();
            expect(
                [...(faction?.getArmyIds() ?? [])].sort(
                    (first, second) => first - second
                )
            ).toEqual(
                scenario.armies
                    .filter(army => army.factionId === factionSpec.id)
                    .map(army => army.id)
                    .sort((first, second) => first - second)
            );
            expect(
                [...(faction?.getCityIds() ?? [])].sort(
                    (first, second) => first - second
                )
            ).toEqual(
                scenario.cities
                    .filter(city => city.factionId === factionSpec.id)
                    .map(city => city.id)
                    .sort((first, second) => first - second)
            );
        }

        let expectedUnits = 0;
        for (const armySpec of scenario.armies) {
            const army = world.getArmy(armySpec.id);
            expect(army?.getFactionId()).toBe(armySpec.factionId);
            const count = armySpec.units.reduce(
                (sum, entry) => sum + entry.count,
                0
            );
            expectedUnits += count;
            const roster = army?.getUnitIds() ?? [];
            expect(roster).toHaveLength(count);
            for (const unitId of roster) {
                expect(control.getTeam(unitId)).toBe(armySpec.factionId);
            }
        }
        expect(control.listUnitIds()).toHaveLength(expectedUnits);
    });

    it('rejects a string order kind from the numeric-enum reverse map', () => {
        fixture = createKingdom({ scenario: DEFAULT_SCENARIO, seed: 102 });

        fixture.world.issueOrder({
            armyId: 1,
            kind: 'Hold' as unknown as ArmyOrderKind
        });

        expect(fixture.world.getArmy(1)?.getOrder()).toBeNull();
    });
});
