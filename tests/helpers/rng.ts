import type { IRng } from '@/common/types';

/**
 * mulberry32 确定性伪随机发生器：固定种子下产生可复现的 `[0, 1)` 均匀序列。
 * @param seed 初始种子。
 * @returns 一个确定性的 `IRng`。
 */
export function mulberry32(seed: number): IRng {
    let state = seed >>> 0;
    return {
        next(): number {
            state = (state + 0x6d2b79f5) >>> 0;
            let t = state;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    };
}
