/**
 * 可配置场景数据（D-28）：`DEFAULT_SCENARIO` 是默认可跑世界，`SCENARIO_MINIMAL`
 * 是测试用的最小世界。两者都只是 `IScenario` 数据表——本文件不做任何校验，
 * 也不构造单位；校验与单位物化是 `KingdomWorld` 的职责。
 */

import {
    GARRISON_CAP_CAPITAL,
    GARRISON_CAP_NORMAL,
    MAP_HEIGHT,
    MAP_WIDTH
} from '@/kingdom/constants';
import { CityKind } from '@/kingdom/types';
import type { IScenario } from '@/kingdom/types';
import { ClassKind } from '@/units/types';

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
