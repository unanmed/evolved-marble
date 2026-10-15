import { describe, expect, it } from 'vitest';
import { RandomStreams, type IRandomStreams } from '../../src/sim/core/rng';

/**
 * 命名种子随机流门面（SIM-02 / D-01）。
 *
 * 覆盖：同种子可复现 / 异种子发散、命名流相互独立、save/restore 往返、
 * 未知流名抛错、同 (seed, names) 的 save() 字节一致。
 */

const NAMES = ['ai', 'spawn', 'damage'] as const;

/** 从某命名流连续取 `n` 个数。 */
function draw(rs: IRandomStreams, name: string, n: number): number[] {
    const s = rs.stream(name);
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(s.next());
    return out;
}

describe('RandomStreams facade', () => {
    it('same seed → identical sequence; different seed → different sequence', () => {
        const a = draw(new RandomStreams(1, NAMES), 'ai', 10);
        const b = draw(new RandomStreams(1, NAMES), 'ai', 10);
        const c = draw(new RandomStreams(2, NAMES), 'ai', 10);
        expect(a).toEqual(b);
        expect(c).not.toEqual(a);
    });

    it('drawing extra numbers from one named stream does NOT shift another', () => {
        const baseline = new RandomStreams(42, NAMES);
        const shifted = new RandomStreams(42, NAMES);
        // 先在 `spawn` 流上多抽 100 个 —— 不应影响 `ai` 流序列
        draw(shifted, 'spawn', 100);
        expect(draw(shifted, 'ai', 10)).toEqual(draw(baseline, 'ai', 10));
    });

    it('save() then restore() reproduces the exact subsequent sequence', () => {
        const rs = new RandomStreams(7, NAMES);
        draw(rs, 'ai', 5);
        const saved = rs.save();
        const expected = draw(rs, 'ai', 20);

        const rs2 = new RandomStreams(7, NAMES);
        draw(rs2, 'ai', 5);
        rs2.restore(saved);
        expect(draw(rs2, 'ai', 20)).toEqual(expected);
    });

    it('stream(unknown) throws (a typo is a bug, not a silent default)', () => {
        const rs = new RandomStreams(1, NAMES);
        expect(() => rs.stream('nope')).toThrow();
    });

    it('two facades from the same (seed, names) produce byte-identical save()', () => {
        const a = new RandomStreams(123, NAMES);
        const b = new RandomStreams(123, NAMES);
        draw(a, 'damage', 3);
        draw(b, 'damage', 3);
        // JSON 序列化（纯数字）字节一致 —— 状态形状可 JSON 往返
        expect(JSON.stringify(a.save())).toBe(JSON.stringify(b.save()));
        expect(JSON.parse(JSON.stringify(a.save()))).toEqual(a.save());
    });
});
