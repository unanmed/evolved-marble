/**
 * 可配置场景数据（D-28）：`DEFAULT_SCENARIO` 是默认可跑世界，`SCENARIO_MINIMAL`
 * 是测试用的最小世界。两者都只是 `IScenario` 数据表；`validateScenario` 在
 * `KingdomWorld` 构造时做一次完整校验（ASVS V5），非法表绝不进入物理世界。
 */

import {
    GARRISON_CAP_CAPITAL,
    GARRISON_CAP_NORMAL,
    MAP_HEIGHT,
    MAP_WIDTH,
    MAX_SCENARIO_ARMIES,
    MAX_SCENARIO_UNITS,
    SPAWN_RING_RADIUS
} from '@/kingdom/constants';
import { CityKind } from '@/kingdom/types';
import type { IScenario, ITerrainRect } from '@/kingdom/types';
import { ClassKind } from '@/units/types';

/**
 * 抛出带前缀的场景校验错误。
 * @param what 违规描述。
 * @returns 永不返回。
 */
function fail(what: string): never {
    throw new Error(`validateScenario: ${what}`);
}

/**
 * 是否为有限整数。
 * @param value 数值。
 * @returns 是否有限整数。
 */
function isFiniteInteger(value: number): boolean {
    return Number.isFinite(value) && Number.isInteger(value);
}

/**
 * 是否为已知的 `CityKind` 成员：数字枚举的反向映射同时暴露名称键，
 * 因此必须同时要求数字且为整数，否则 `'Capital'`/`'0'` 会绕过校验。
 * @param value 运行期值。
 * @returns 是否为合法数字枚举成员。
 */
function isKnownCityKind(value: unknown): value is CityKind {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        CityKind[value] !== undefined
    );
}

/**
 * 是否为已知的 `ClassKind` 成员（同样要求数字整数，拒绝反向映射名称）。
 * @param value 运行期值。
 * @returns 是否为合法数字枚举成员。
 */
function isKnownClassKind(value: unknown): value is ClassKind {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        ClassKind[value] !== undefined
    );
}

/**
 * 出生环圆盘是否完整位于地图内（单位在点周围 `SPAWN_RING_RADIUS` 米环上生成）。
 * @param width 地图宽度。
 * @param height 地图高度。
 * @param x 中心 x。
 * @param y 中心 y。
 * @returns 是否完整在界内。
 */
function spawnDiskInsideMap(
    width: number,
    height: number,
    x: number,
    y: number
): boolean {
    return (
        x - SPAWN_RING_RADIUS >= 0 &&
        x + SPAWN_RING_RADIUS <= width &&
        y - SPAWN_RING_RADIUS >= 0 &&
        y + SPAWN_RING_RADIUS <= height
    );
}

/**
 * 出生环圆盘是否与任一地形矩形相交（保守用外扩 `SPAWN_RING_RADIUS` 的 AABB 判定）。
 * @param terrain 已校验的地形表。
 * @param x 中心 x。
 * @param y 中心 y。
 * @returns 是否完全不压地形。
 */
function spawnDiskClearOfTerrain(
    terrain: readonly ITerrainRect[],
    x: number,
    y: number
): boolean {
    for (const rect of terrain) {
        if (
            Math.abs(x - rect.x) < rect.halfWidth + SPAWN_RING_RADIUS &&
            Math.abs(y - rect.y) < rect.halfHeight + SPAWN_RING_RADIUS
        ) {
            return false;
        }
    }
    return true;
}

/**
 * 校验一张场景表（ASVS V5）：在构造任何势力/军队/城池或注册任何单位之前，
 * 拒绝非有限或非正的尺寸、重复或非整数 id、空名字、未知势力引用、越界位置、
 * 非正或非有限的几何、非法枚举成员（含数字枚举反向映射字符串）、非正单位数量、
 * 单位/军队上限，以及出生环圆盘越界或压住地形的军队出生点/城池点。
 * 绝不静默钳制或强制转换。
 * @param scenario 待校验的场景表。
 */
export function validateScenario(scenario: IScenario): void {
    const width = scenario.width;
    const height = scenario.height;
    if (!Number.isFinite(width) || width <= 0) {
        fail('width must be a positive finite number');
    }
    if (!Number.isFinite(height) || height <= 0) {
        fail('height must be a positive finite number');
    }

    if (!Array.isArray(scenario.factions) || scenario.factions.length === 0) {
        fail('factions must be a non-empty array');
    }
    if (!Array.isArray(scenario.cities)) {
        fail('cities must be an array');
    }
    if (!Array.isArray(scenario.armies)) {
        fail('armies must be an array');
    }
    if (!Array.isArray(scenario.terrain)) {
        fail('terrain must be an array');
    }

    const factionIds = new Set<number>();
    for (const faction of scenario.factions) {
        if (!isFiniteInteger(faction.id)) {
            fail(`faction id ${faction.id} must be a finite integer`);
        }
        if (factionIds.has(faction.id)) {
            fail(`duplicate faction id ${faction.id}`);
        }
        factionIds.add(faction.id);
        if (
            typeof faction.name !== 'string' ||
            faction.name.trim().length === 0
        ) {
            fail(`faction ${faction.id} must have a non-empty name`);
        }
    }

    const terrain = scenario.terrain;
    for (const rect of terrain) {
        if (
            !Number.isFinite(rect.x) ||
            !Number.isFinite(rect.y) ||
            !Number.isFinite(rect.halfWidth) ||
            !Number.isFinite(rect.halfHeight)
        ) {
            fail('terrain rectangle values must be finite');
        }
        if (rect.halfWidth <= 0 || rect.halfHeight <= 0) {
            fail('terrain half extents must be positive');
        }
        if (
            rect.x - rect.halfWidth < 0 ||
            rect.x + rect.halfWidth > width ||
            rect.y - rect.halfHeight < 0 ||
            rect.y + rect.halfHeight > height
        ) {
            fail('terrain rectangle must lie inside the map');
        }
    }

    const cityIds = new Set<number>();
    for (const city of scenario.cities) {
        if (!isFiniteInteger(city.id)) {
            fail(`city id ${city.id} must be a finite integer`);
        }
        if (cityIds.has(city.id)) {
            fail(`duplicate city id ${city.id}`);
        }
        cityIds.add(city.id);
        if (city.factionId !== undefined && !factionIds.has(city.factionId)) {
            fail(
                `city ${city.id} references unknown faction ${city.factionId}`
            );
        }
        if (!Number.isFinite(city.x) || !Number.isFinite(city.y)) {
            fail(`city ${city.id} position must be finite`);
        }
        if (city.x < 0 || city.x > width || city.y < 0 || city.y > height) {
            fail(`city ${city.id} position must lie inside the map`);
        }
        if (!isFiniteInteger(city.garrisonCap) || city.garrisonCap <= 0) {
            fail(`city ${city.id} garrisonCap must be a positive integer`);
        }
        if (!isKnownCityKind(city.kind)) {
            fail(`city ${city.id} has an unknown kind`);
        }
        if (!isKnownClassKind(city.trainingClass)) {
            fail(`city ${city.id} has an unknown training class`);
        }
        if (!spawnDiskInsideMap(width, height, city.x, city.y)) {
            fail(`city ${city.id} spawn ring must lie inside the map`);
        }
        if (!spawnDiskClearOfTerrain(terrain, city.x, city.y)) {
            fail(`city ${city.id} spawn ring overlaps terrain`);
        }
    }

    const armyIds = new Set<number>();
    let totalUnits = 0;
    for (const army of scenario.armies) {
        if (!isFiniteInteger(army.id)) {
            fail(`army id ${army.id} must be a finite integer`);
        }
        if (armyIds.has(army.id)) {
            fail(`duplicate army id ${army.id}`);
        }
        armyIds.add(army.id);
        if (!factionIds.has(army.factionId)) {
            fail(
                `army ${army.id} references unknown faction ${army.factionId}`
            );
        }
        if (
            !Number.isFinite(army.x) ||
            !Number.isFinite(army.y) ||
            !Number.isFinite(army.heading)
        ) {
            fail(`army ${army.id} position and heading must be finite`);
        }
        if (army.x < 0 || army.x > width || army.y < 0 || army.y > height) {
            fail(`army ${army.id} spawn point must lie inside the map`);
        }
        if (!Array.isArray(army.units) || army.units.length === 0) {
            fail(`army ${army.id} must have a non-empty unit list`);
        }
        for (const entry of army.units) {
            if (!isKnownClassKind(entry.classKind)) {
                fail(`army ${army.id} has an unknown unit class`);
            }
            if (!isFiniteInteger(entry.count) || entry.count <= 0) {
                fail(`army ${army.id} unit count must be a positive integer`);
            }
            totalUnits += entry.count;
            if (totalUnits > MAX_SCENARIO_UNITS) {
                fail(
                    `total units exceed MAX_SCENARIO_UNITS (${MAX_SCENARIO_UNITS})`
                );
            }
        }
        if (armyIds.size > MAX_SCENARIO_ARMIES) {
            fail(`armies exceed MAX_SCENARIO_ARMIES (${MAX_SCENARIO_ARMIES})`);
        }
        if (!spawnDiskInsideMap(width, height, army.x, army.y)) {
            fail(`army ${army.id} spawn ring must lie inside the map`);
        }
        if (!spawnDiskClearOfTerrain(terrain, army.x, army.y)) {
            fail(`army ${army.id} spawn ring overlaps terrain`);
        }
    }
}

/**
 * 默认场景（D-28）：1000×1000 地图，两个势力（赤 / 蓝），各 1 城 1 军、每军 8 单位。
 * 城池分处对角附近；军队朝向彼此、相距约 790 m（> 300 m 要求）；每座城外
 * 两面相邻地形墙，朝向地图内部留出明显缺口（research Pitfall 13）。
 * 城池规模决定默认驻军上限：主城 20、普通城 10；训练职业均为剑士。
 */
export const DEFAULT_SCENARIO: IScenario = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    factions: [
        { id: 1, name: '赤' },
        { id: 2, name: '蓝' }
    ],
    cities: [
        {
            id: 1,
            factionId: 1,
            x: 150,
            y: 150,
            kind: CityKind.Capital,
            garrisonCap: GARRISON_CAP_CAPITAL,
            trainingClass: ClassKind.Swordsman
        },
        {
            id: 2,
            factionId: 2,
            x: 850,
            y: 850,
            kind: CityKind.Normal,
            garrisonCap: GARRISON_CAP_NORMAL,
            trainingClass: ClassKind.Swordsman
        }
    ],
    armies: [
        {
            id: 1,
            factionId: 1,
            x: 220,
            y: 220,
            heading: Math.PI / 4,
            units: [
                { classKind: ClassKind.Swordsman, count: 4 },
                { classKind: ClassKind.Archer, count: 2 },
                { classKind: ClassKind.Spearman, count: 2 }
            ]
        },
        {
            id: 2,
            factionId: 2,
            x: 780,
            y: 780,
            heading: (-3 * Math.PI) / 4,
            units: [
                { classKind: ClassKind.Berserker, count: 4 },
                { classKind: ClassKind.Archer, count: 2 },
                { classKind: ClassKind.SwordShield, count: 2 }
            ]
        }
    ],
    terrain: [
        {
            x: 150,
            y: 60,
            halfWidth: 110,
            halfHeight: 15
        },
        {
            x: 60,
            y: 150,
            halfWidth: 15,
            halfHeight: 110
        },
        {
            x: 850,
            y: 940,
            halfWidth: 110,
            halfHeight: 15
        },
        {
            x: 940,
            y: 850,
            halfWidth: 15,
            halfHeight: 110
        }
    ]
};

/**
 * 最小场景：400×400 空地图，各势力 1 军 1 单位，无城池、无地形。
 * 战斗与端到端套件用它把运行时间压到最短；字段与 `DEFAULT_SCENARIO` 同形。
 */
export const SCENARIO_MINIMAL: IScenario = {
    width: 400,
    height: 400,
    factions: [
        { id: 1, name: '赤' },
        { id: 2, name: '蓝' }
    ],
    cities: [],
    armies: [
        {
            id: 1,
            factionId: 1,
            x: 100,
            y: 200,
            heading: 0,
            units: [{ classKind: ClassKind.Swordsman, count: 1 }]
        },
        {
            id: 2,
            factionId: 2,
            x: 300,
            y: 200,
            heading: Math.PI,
            units: [{ classKind: ClassKind.Swordsman, count: 1 }]
        }
    ],
    terrain: []
};
