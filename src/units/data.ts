/**
 * 单位系统的数值表：职业 / 武器 / 防具的类型化常量表与升级校准常量。
 * 全部数值以 `.planning/reference/ai-marble-kingdom.md` 为准；本文件是唯一的调参入口——
 * 改动一个平衡数值就是改动这里的一行。
 * 按决策 D-01/D-02：全部为类型化顶层 `const` + JSDoc，不使用 JSON 数据文件，不使用工厂函数，不拆分文件。
 */

import {
    ArmorKind,
    ClassKind,
    EquipmentKind,
    SkillKind,
    WeaponKind
} from '@/units/types';
import type { IClassDef } from '@/units/types';

/**
 * 攻击经验门槛：单次造成的伤害必须超过此值，才按攻击经验比率获取经验。
 * 对应规格中的 50（`E = R_A × √(D − 50)`）。
 */
export const ATTACK_EXP_DAMAGE_GATE = 50;

/**
 * 防御经验门槛：单次被防具减免的伤害值必须超过此值，才按防御经验比率获取经验。
 * 对应规格中的 50（`E = R_D × √(ΔD − 50)`）。
 */
export const DEFENSE_EXP_DAMAGE_GATE = 50;

/**
 * 击杀经验的敌人等级系数：击杀敌人时按 `R_A × KILL_EXP_LEVEL_FACTOR × L` 额外获取攻击经验。
 * 对应规格中的 10（`E = R_A × 10L`）。
 */
export const KILL_EXP_LEVEL_FACTOR = 10;

/**
 * 升级经验门槛的基数：升级所需经验为 `LEVEL_THRESHOLD_BASE × (1 + R_E)^L`。
 * 对应规格中的 100（`N_E = 100 × (1 + R_E)^L`）。
 */
export const LEVEL_THRESHOLD_BASE = 100;

/**
 * 控制等级的基础均值：规格固定**所有职业**的初始控制等级均值均为 10，故为共享常量而非职业字段。
 * `spawn.ts` 以 `sampleNormal(rng, CONTROL_LEVEL_BASE, CONTROL_LEVEL_BASE / 8)` 抽取初始控制等级。
 */
export const CONTROL_LEVEL_BASE = 10;

/**
 * 控制等级的每级成长值：每次升级时控制等级增加此值（规格为 5）。
 */
export const CONTROL_LEVEL_GROWTH_PER_LEVEL = 5;

/**
 * 7 职业的完整数值定义，按 `ClassKind` 索引（缺项即编译错误）。
 * 各项基础值均为 1 级数值；`attackGrowth` 为 `k·L` 攻击成长形式的等级缩放系数 `k`，
 * `defenseGrowth` 为每级固定加算值，`maxHpGrowth` 为升级时的生命上限加算值。
 */
export const CLASS_DEFS: Record<ClassKind, IClassDef> = {
    [ClassKind.Swordsman]: {
        id: ClassKind.Swordsman,
        name: '剑士',
        maxHp: 200,
        attack: 60,
        defense: 24,
        weaponRatio: 1.0,
        armorRatio: 0.8,
        mass: 70,
        experienceRatio: 0.1,
        attackExpRatio: 0.5,
        defenseExpRatio: 0.5,
        /** 攻击成长系数 k：每级攻击增加 `10·L` 点。 */
        attackGrowth: 10,
        /** 防御成长：每级防御增加 6 点（固定加算）。 */
        defenseGrowth: 6,
        /** 生命上限成长：每级增加 20 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 20,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Longsword }
        ],
        unlocks: [
            {
                level: 3,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]
    },
    [ClassKind.Archer]: {
        id: ClassKind.Archer,
        name: '弓箭手',
        maxHp: 140,
        attack: 50,
        defense: 9,
        weaponRatio: 0.9,
        armorRatio: 0.6,
        mass: 55,
        experienceRatio: 0.12,
        attackExpRatio: 0.8,
        defenseExpRatio: 0.2,
        /** 攻击成长系数 k：每级攻击增加 `15·L` 点。 */
        attackGrowth: 15,
        /** 防御成长：每级防御增加 3 点（固定加算）。 */
        defenseGrowth: 3,
        /** 生命上限成长：每级增加 14 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 14,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Bow }
        ],
        unlocks: [
            {
                level: 5,
                equipment: [],
                skills: [SkillKind.ArrowStorm]
            },
            {
                level: 8,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            }
        ]
    },
    [ClassKind.Berserker]: {
        id: ClassKind.Berserker,
        name: '狂战士',
        maxHp: 260,
        attack: 75,
        defense: 15,
        weaponRatio: 1.3,
        armorRatio: 0.5,
        mass: 85,
        experienceRatio: 0.15,
        attackExpRatio: 0.7,
        defenseExpRatio: 0.3,
        /** 攻击成长系数 k：每级攻击增加 `15·L` 点。 */
        attackGrowth: 15,
        /** 防御成长：每级防御增加 4 点（固定加算）。 */
        defenseGrowth: 4,
        /** 生命上限成长：每级增加 26 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 26,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Axe }
        ],
        unlocks: [
            {
                level: 2,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            },
            {
                level: 4,
                equipment: [
                    { kind: EquipmentKind.Weapon, weapon: WeaponKind.Axe }
                ],
                skills: []
            },
            {
                level: 6,
                equipment: [],
                skills: [SkillKind.Charge]
            }
        ]
    },
    [ClassKind.Hammer]: {
        id: ClassKind.Hammer,
        name: '锤兵',
        maxHp: 240,
        attack: 80,
        defense: 20,
        weaponRatio: 1.0,
        armorRatio: 0.7,
        mass: 110,
        experienceRatio: 0.15,
        attackExpRatio: 0.8,
        defenseExpRatio: 0.5,
        /** 攻击成长系数 k：每级攻击增加 `10·L` 点。 */
        attackGrowth: 10,
        /** 防御成长：每级防御增加 6 点（固定加算）。 */
        defenseGrowth: 6,
        /** 生命上限成长：每级增加 24 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 24,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Hammer }
        ],
        unlocks: [
            {
                level: 2,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            },
            {
                level: 6,
                equipment: [],
                skills: [SkillKind.Spin]
            }
        ]
    },
    [ClassKind.Knight]: {
        id: ClassKind.Knight,
        name: '骑士',
        maxHp: 280,
        attack: 55,
        defense: 30,
        weaponRatio: 1.0,
        armorRatio: 1.0,
        mass: 120,
        experienceRatio: 0.1,
        attackExpRatio: 0.5,
        defenseExpRatio: 0.6,
        /** 攻击成长系数 k：每级攻击增加 `15·L` 点。 */
        attackGrowth: 15,
        /** 防御成长：每级防御增加 6 点（固定加算）。 */
        defenseGrowth: 6,
        /** 生命上限成长：每级增加 28 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 28,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Longsword },
            { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
        ],
        unlocks: [
            {
                level: 6,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]
    },
    [ClassKind.SwordShield]: {
        id: ClassKind.SwordShield,
        name: '剑盾',
        maxHp: 220,
        attack: 40,
        defense: 40,
        weaponRatio: 0.8,
        armorRatio: 1.4,
        mass: 95,
        experienceRatio: 0.08,
        attackExpRatio: 0.4,
        defenseExpRatio: 0.9,
        /** 攻击成长系数 k：每级攻击增加 `10·L` 点（规格此行误写为“弓箭”，按剑盾持短剑修正）。 */
        attackGrowth: 10,
        /** 防御成长：每级防御增加 8 点（固定加算）。 */
        defenseGrowth: 8,
        /** 生命上限成长：每级增加 22 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 22,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Shortsword },
            { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
        ],
        unlocks: [
            {
                level: 7,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            }
        ]
    },
    [ClassKind.Spearman]: {
        id: ClassKind.Spearman,
        name: '长矛兵',
        maxHp: 200,
        attack: 48,
        defense: 22,
        weaponRatio: 1.1,
        armorRatio: 0.9,
        mass: 85,
        experienceRatio: 0.1,
        attackExpRatio: 0.7,
        defenseExpRatio: 0.4,
        /** 攻击成长系数 k：每级攻击增加 `12·L` 点。 */
        attackGrowth: 12,
        /** 防御成长：每级防御增加 4 点（固定加算）。 */
        defenseGrowth: 4,
        /** 生命上限成长：每级增加 20 点（校准待定 — 规格未给出，取基础值的 10%）。 */
        maxHpGrowth: 20,
        initialEquipment: [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Spear }
        ],
        unlocks: [
            {
                level: 3,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Helmet }
                ],
                skills: []
            },
            {
                level: 8,
                equipment: [
                    { kind: EquipmentKind.Armor, armor: ArmorKind.Shield }
                ],
                skills: []
            }
        ]
    }
};

/**
 * 全部职业的固定顺序列表：数字枚举带反向映射，遍历应使用本数组而非 `Object.keys`。
 */
export const ALL_CLASS_KINDS: readonly ClassKind[] = [
    ClassKind.Swordsman,
    ClassKind.Archer,
    ClassKind.Berserker,
    ClassKind.Hammer,
    ClassKind.Knight,
    ClassKind.SwordShield,
    ClassKind.Spearman
];
