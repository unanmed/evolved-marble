/**
 * 种子化随机数：单一主种子派生多个命名、独立、可序列化的流（SIM-02 / D-01）。
 *
 * 所有模拟随机性都必须经由本模块；`sim/**` 内禁用 `Math.random`（Plan 01-03 硬性 lint）。
 * 生成器手写 `sfc32`（约 15 行整数运算）——刻意不引第三方库，因为核心诉求是
 * **状态形状可 JSON 往返**，而非算法数量。
 */

/** sfc32 的 128 位状态（四个 uint32）。JSON 可序列化。 */
export type RngState = readonly [number, number, number, number];

/** 单个随机流：只暴露取值与状态读写，绝不暴露内部闭包变量。 */
export interface IRngStream {
    /** 返回 [0,1) 区间的下一个浮点随机数。 */
    next(): number;
    /** 返回当前状态（纯数字，可 JSON 序列化）。 */
    getState(): RngState;
    /** 恢复状态（逆操作）。 */
    setState(s: RngState): void;
}

/**
 * xmur3 字符串散列，用于把 (种子, 流名) 混合为去相关的初始状态。
 * 绝不用朴素的 `seed + index`（会产生相关流）。
 *
 * @param str 待散列的字符串（本模块固定使用 `${流名}#${种子}`）。
 * @returns 一个无参闭包；每次调用返回下一个 32 位无符号散列值。
 */
function xmur3(str: string): () => number {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = (h << 13) | (h >>> 19);
    }
    return () => {
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        h ^= h >>> 16;
        return h >>> 0;
    };
}

/**
 * 由 (主种子, 流名) 派生出 4 个去相关的 uint32 种子。
 *
 * @param seed 主种子（整场模拟共享）。
 * @param name 流名（在同一主种子下区分不同用途的随机来源）。
 * @returns 4 个去相关的 uint32 组成的初始状态。
 */
export function mixSeed(seed: number, name: string): RngState {
    const h = xmur3(`${name}#${seed}`);
    return [h(), h(), h(), h()];
}

/**
 * 用初始状态构造一个 sfc32 随机流。
 *
 * @param init sfc32 的 128 位初始状态（4 个 uint32）。
 * @returns 一个新构造的、以该状态起步的随机流。
 */
export function makeSfc32(init: RngState): IRngStream {
    let a = init[0] >>> 0;
    let b = init[1] >>> 0;
    let c = init[2] >>> 0;
    let d = init[3] >>> 0;

    function next(): number {
        a |= 0;
        b |= 0;
        c |= 0;
        d |= 0;
        const t = (((a + b) | 0) + d) | 0;
        d = (d + 1) | 0;
        a = b ^ (b >>> 9);
        b = (c + (c << 3)) | 0;
        c = (c << 21) | (c >>> 11);
        c = (c + t) | 0;
        return (t >>> 0) / 4294967296;
    }

    return {
        next,
        getState: (): RngState => [a >>> 0, b >>> 0, c >>> 0, d >>> 0],
        setState: (s: RngState): void => {
            a = s[0] >>> 0;
            b = s[1] >>> 0;
            c = s[2] >>> 0;
            d = s[3] >>> 0;
        }
    };
}

/**
 * 命名随机流门面的公开契约（D-13：先接口后类）。
 */
export interface IRandomStreams {
    /** 取命名流；未定义的名字抛错。 */
    stream(name: string): IRngStream;
    /** 导出全部流状态（按构造时的名字顺序）。 */
    save(): Record<string, RngState>;
    /** 恢复全部流状态（逆操作）。 */
    restore(state: Record<string, RngState>): void;
}

/**
 * 命名随机流门面：一个主种子 → 多个独立流。
 *
 * 命名集合可枚举，故整体状态可快照/恢复（save/restore）。
 */
export class RandomStreams implements IRandomStreams {
    /** 构造时的名字顺序（决定 save() 的遍历顺序）。 */
    private readonly names: readonly string[];
    /** 名字 → 流实例。 */
    private readonly streams = new Map<string, IRngStream>();

    /**
     * @param seed 主种子。
     * @param names 命名流的名字集合。
     */
    constructor(seed: number, names: readonly string[]) {
        this.names = names;
        for (const name of names) {
            this.streams.set(name, makeSfc32(mixSeed(seed, name)));
        }
    }

    /**
     * 取命名流；未定义的名字抛错（拼写错误是 bug，不能静默）。
     *
     * @param name 流名。
     * @returns 对应的命名流。
     */
    stream(name: string): IRngStream {
        const s = this.streams.get(name);
        if (!s) throw new Error(`Unknown RNG stream: ${name}`);
        return s;
    }

    /**
     * 导出全部流状态（按构造时的名字顺序，保证规范）。
     *
     * @returns 名字 → 状态。
     */
    save(): Record<string, RngState> {
        const out: Record<string, RngState> = {};
        for (const name of this.names) {
            out[name] = this.stream(name).getState();
        }
        return out;
    }

    /**
     * 恢复全部流状态（逆操作）。
     *
     * @param state 名字 → 状态。
     */
    restore(state: Record<string, RngState>): void {
        for (const name of this.names) {
            this.stream(name).setState(state[name]);
        }
    }
}
