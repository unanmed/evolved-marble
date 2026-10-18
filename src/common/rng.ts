/**
 * 通用可复用随机源实现与正态分布辅助。
 * `IRng` 契约声明在 `src/common/types.ts`；本文件只含 `MathRng` 类与 `sampleNormal` 函数，
 * 不含任何顶层 `const`（AGENTS.md 约定 #9：通用可复用抽象放在 `src/common/`）。
 */

import type { IRng } from '@/common/types';

/**
 * `IRng` 的默认实现：直接包装 `Math.random`，是非确定的（无种子、无复现保证）。
 * 该抽象存在的唯一目的，是让测试能够注入固定序列以复现分布断言（D-07）。
 */
export class MathRng implements IRng {
    /** 返回 `[0, 1)` 区间内的均匀随机数。 */
    next(): number {
        return Math.random();
    }
}

/**
 * 用 Box–Muller 变换从均匀随机源抽取一个正态分布样本 `N(mean, sd²)`，并截断到非负。
 *
 * 先在 `u1 <= 0` 时反复重抽以规避 `Math.log(0) = -Infinity`，再由两组均匀样本计算标准正态
 * `z = √(-2·ln u1)·cos(2π·u2)`，最后返回 `Math.max(0, mean + z·sd)`。
 *
 * 在 σ = 均值/8 的用法下，截断点位于均值以下 8 个标准差，命中概率可忽略，
 * 因此这里的非负截断是**正确性护栏**（保证属性不为负、不为 NaN/Infinity），而非塑形手段（D-08）。
 *
 * @param rng 注入的均匀随机源。
 * @param mean 正态分布均值。
 * @param sd 正态分布标准差。
 * @returns 非负的有限样本值。
 */
export function sampleNormal(rng: IRng, mean: number, sd: number): number {
    let u1 = rng.next();
    while (u1 <= 0) {
        u1 = rng.next();
    }
    const u2 = rng.next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.max(0, mean + z * sd);
}
