/**
 * 物理系统的纯伤害与减伤数学：无 Rapier 依赖、无类、无状态，便于单元测试。
 * 公式逐字转写自 `.planning/reference/ai-marble-kingdom.md`（伤害计算）：
 * 伤害均值 `D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0]`，
 * 防具减伤 `ΔD = D_R·(1 − 100·B_A/(100·B_A + A_D·P_D·S_D))`，
 * 最终伤害 `D = D_R − ΔD`。防具减伤按决策 D-11 取**符号自洽**的
 * `B_A = 破甲比率`（而非其倒数），故破甲越高、减伤越少。
 * 随机抖动复用通用 `sampleNormal`（AGENTS §9，不另造采样器）。
 */

import { sampleNormal } from '@/common/rng';
import type { IRng } from '@/common/types';
import { ColliderPart } from '@/physics/types';

/**
 * 伤害抖动的标准差除数：规格规定伤害服从正态分布 `N(D̄_R, (D̄_R/20)²)`，
 * 故标准差 σ = 均值 / 本除数。这是抖动幅度的唯一调参入口。
 */
export const DAMAGE_JITTER_SIGMA_DIVISOR = 20;

/**
 * 计算抖动前的伤害均值 `D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0]`。
 * `Δv` 先经护栏：非有限或负值时按 0 处理，保证 `Math.sqrt` 永不收到负值或 `NaN`；
 * 结果再由规格的 `max(…, 0)` 截断为非负。
 * @param attack 单位基础攻击力 A_A。
 * @param weaponRatio 单位武器比率 P_A。
 * @param weaponAttackRatio 武器攻击比率 W_A。
 * @param deltaV 碰撞法向速度差 Δv（米/秒）。
 * @returns 非负有限的伤害均值 D̄_R。
 */
export function computeDamageMean(
    attack: number,
    weaponRatio: number,
    weaponAttackRatio: number,
    deltaV: number
): number {
    const clampedDeltaV = Number.isFinite(deltaV) && deltaV > 0 ? deltaV : 0;
    return Math.max(
        attack *
            weaponRatio *
            weaponAttackRatio *
            (Math.sqrt(clampedDeltaV) - 1),
        0
    );
}

/**
 * 按规格的正态抖动 `N(mean, (mean/20)²)` 抽取一次伤害值。
 * 复用通用 `sampleNormal`（AGENTS §9），不实现物理层本地采样器。
 * @param rng 注入的均匀随机源。
 * @param mean 抖动前的伤害均值 D̄_R。
 * @returns 非负有限的伤害样本。
 */
export function rollDamage(rng: IRng, mean: number): number {
    return sampleNormal(rng, mean, mean / DAMAGE_JITTER_SIGMA_DIVISOR);
}

/**
 * 计算防具减伤量 `ΔD = D_R·(1 − 100·B_A/(100·B_A + A_D·P_D·S_D))`。
 * 按决策 D-11 采用**符号自洽**取法：`B_A` 即破甲比率本身（**非其倒数**），
 * 因而破甲比率越高、减伤量越小（破甲越多、最终伤害越大）。
 * 分母非有限或为 0 时（如破甲与全部防御项皆 0）返回 0，保证结果有限非负。
 * @param damage 减伤前的伤害 D_R（通常为抖动后的数值）。
 * @param defense 单位基础防御力 A_D。
 * @param armorRatio 单位防具比率 P_D。
 * @param armorDefenseRatio 防具防御比率 S_D。
 * @param penetration 武器对命中防具的破甲比率 B_A。
 * @returns 减伤量 ΔD（有限非负）。
 */
export function computeDamageReduction(
    damage: number,
    defense: number,
    armorRatio: number,
    armorDefenseRatio: number,
    penetration: number
): number {
    const denominator =
        100 * penetration + defense * armorRatio * armorDefenseRatio;
    if (!Number.isFinite(denominator) || denominator === 0) {
        return 0;
    }
    return damage * (1 - (100 * penetration) / denominator);
}

/**
 * 计算经防具减伤后的最终伤害 `D = D_R − ΔD`。
 * 击中本体时不应调用本函数（击中本体不减伤，D-11）——由调用方依 `defenderPart` 跳过。
 * @param damage 减伤前的伤害 D_R。
 * @param defense 单位基础防御力 A_D。
 * @param armorRatio 单位防具比率 P_D。
 * @param armorDefenseRatio 防具防御比率 S_D。
 * @param penetration 武器对命中防具的破甲比率 B_A。
 * @returns 最终伤害 D。
 */
export function computeFinalDamage(
    damage: number,
    defense: number,
    armorRatio: number,
    armorDefenseRatio: number,
    penetration: number
): number {
    return (
        damage -
        computeDamageReduction(
            damage,
            defense,
            armorRatio,
            armorDefenseRatio,
            penetration
        )
    );
}

/**
 * 判断一对碰撞体部位是否可产生伤害（D-13/OQ-4）。
 * 当且仅当二者中恰有一方为 `ColliderPart.Weapon` 时为真——武器↔本体、武器↔防具
 * 产生伤害；本体↔本体、武器↔武器不产生。调用方须另行确认两个碰撞体属于不同单位。
 * @param partA A 侧碰撞体部位。
 * @param partB B 侧碰撞体部位。
 * @returns 该部位组合是否可产生伤害。
 */
export function isDamageBearingPair(
    partA: ColliderPart,
    partB: ColliderPart
): boolean {
    return (partA === ColliderPart.Weapon) !== (partB === ColliderPart.Weapon);
}
