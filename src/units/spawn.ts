/**
 * 单位生成：以职业基础值为均值、σ = 均值/8 的正态分布抽取 7 项随机属性，
 * 生成带唯一显示名的 `Unit`（D-08/D-12）。
 * 随机源经 `IRng` 注入，生产用 `MathRng`，测试可注入固定序列以复现分布断言。
 */

import { sampleNormal } from '@/common/rng';
import type { IRng } from '@/common/types';
import { CLASS_DEFS, CONTROL_LEVEL_BASE } from '@/units/data';
import type { ClassKind, ISpawnAttributes, IUnit } from '@/units/types';
import { Unit } from '@/units/Unit';

/**
 * 生成序号：跨所有职业单调递增，用于拼装唯一显示名 `<职业名>#<序号>`（D-12）。
 * 源码级模块状态，进程存活期间持续递增。
 */
let spawnIndex = 0;

/**
 * 按职业生成一个单位：7 项属性以职业基础值为均值、σ = 均值/8 正态抽取并截断到非负，
 * 随后分配唯一显示名并构造 `Unit`。
 *
 * 被随机抽取的 7 项属性为：生命上限 / 控制等级 / 攻击 / 防御 / 武器比率 / 防具比率 / 质量。
 * 其中控制等级的均值对所有职业统一取共享常量 `CONTROL_LEVEL_BASE`（规格固定初始均值为 10）。
 * 抽取的质量为该职业的**本体质量**，不含装备质量（OQ-6，装备质量在物理层另行累加）。
 *
 * @param classKind 职业。
 * @param rng 注入的随机源。
 * @returns 新生成、带唯一显示名 `<职业名>#<序号>` 的单位。
 */
export function spawnUnit(classKind: ClassKind, rng: IRng): IUnit {
    const def = CLASS_DEFS[classKind];

    /**
     * 以 `mean` 为均值、`mean / 8` 为标准差抽取一项非负属性。
     * @param mean 该属性的职业基础均值。
     */
    const roll = (mean: number): number => sampleNormal(rng, mean, mean / 8);

    const attributes: ISpawnAttributes = {
        maxHp: roll(def.maxHp),
        controlLevel: roll(CONTROL_LEVEL_BASE),
        attack: roll(def.attack),
        defense: roll(def.defense),
        weaponRatio: roll(def.weaponRatio),
        armorRatio: roll(def.armorRatio),
        mass: roll(def.mass)
    };

    const name = `${def.name}#${spawnIndex}`;
    spawnIndex += 1;

    return new Unit(classKind, attributes, [], name);
}
