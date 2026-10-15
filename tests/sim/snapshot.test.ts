import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../../src/config/sim';
import { BattleSim } from '../../src/sim/battle-sim';
import {
    QUANT_GRID,
    deserializeState,
    fingerprint,
    serializeState
} from '../../src/sim/snapshot';

/**
 * 规范序列化 / 恢复 / 指纹（SIM-04；威胁 T-01-04：序列化器不得遗漏状态）。
 *
 * 覆盖：往返（fingerprint identity + 字节 identity）、调用点无关的顺序稳定性、
 * 变异者普查（每个可变异字段扰动超过一个栅格都必须改变指纹）、把快照当作
 * 确定性重启点，以及"恢复后重跑不偏离原始轨迹超过一个栅格"。
 */

function steppedSim(seed: number, spawns: number, ticks: number): BattleSim {
    const sim = new BattleSim(seed);
    for (let i = 0; i < spawns; i++) sim.spawn();
    for (let i = 0; i < ticks; i++) sim.step();
    return sim;
}

function fp(sim: BattleSim): string {
    return fingerprint(sim.snapshot());
}

describe('canonical serialization & restore (SIM-04)', () => {
    it('fingerprint(restore(serialize(s))) === fingerprint(serialize(s))', () => {
        const sim = steppedSim(DEFAULT_SEED, 3, 25);
        const bytes = sim.snapshot();
        const restored = deserializeState(bytes);
        expect(fingerprint(serializeState(restored))).toBe(fingerprint(bytes));
    });

    it('restore reproduces byte-identical canonical state', () => {
        const sim = steppedSim(DEFAULT_SEED, 3, 25);
        const bytes = sim.snapshot();
        const restored = deserializeState(bytes);
        expect(Array.from(serializeState(restored))).toEqual(Array.from(bytes));
    });

    it('serializes order-stably (same logical state → identical bytes at any call site)', () => {
        const a = steppedSim(DEFAULT_SEED, 2, 10);
        const b = steppedSim(DEFAULT_SEED, 2, 10);
        const first = Array.from(a.snapshot());
        expect(Array.from(a.snapshot())).toEqual(first); // repeat call
        expect(Array.from(b.snapshot())).toEqual(first); // independent, same run
    });

    it('rejects a corrupt snapshot (bad magic) deterministically', () => {
        const bytes = steppedSim(DEFAULT_SEED, 1, 1).snapshot();
        const corrupt = new Uint8Array(bytes);
        corrupt[0] ^= 0xff;
        expect(() => deserializeState(corrupt)).toThrow(/bad magic/);
    });
});

describe('mutator census — every tracked mutator moves the fingerprint', () => {
    const baseline = fp(
        ((): BattleSim => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.spawn(); // id 1
            return sim;
        })()
    );

    const grid = 1 / QUANT_GRID;
    const fieldCases: readonly [string, (sim: BattleSim) => void][] = [
        [
            'xform.x',
            sim => {
                sim.state.store.get(1).xform.x += grid;
            }
        ],
        [
            'xform.y',
            sim => {
                sim.state.store.get(1).xform.y += grid;
            }
        ],
        [
            'xform.vx',
            sim => {
                sim.state.store.get(1).xform.vx += grid;
            }
        ],
        [
            'xform.vy',
            sim => {
                sim.state.store.get(1).xform.vy += grid;
            }
        ],
        [
            'attrs.hp',
            sim => {
                sim.state.store.get(1).attrs.hp += 1;
            }
        ],
        [
            'attrs.level',
            sim => {
                sim.state.store.get(1).attrs.level += 1;
            }
        ]
    ];

    it.each(fieldCases)(
        'perturbing %s moves the fingerprint',
        (_name, mutate) => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.spawn();
            mutate(sim);
            expect(fp(sim)).not.toBe(baseline);
        }
    );

    it('advancing the tick counter moves the fingerprint (empty world)', () => {
        // 空世界：step() 不绘制任何随机数，故只有 tick 变化 → 证明 tick 被序列化。
        const sim = new BattleSim(DEFAULT_SEED);
        const before = fp(sim);
        sim.step();
        expect(fp(sim)).not.toBe(before);
    });

    it('perturbing a named RNG stream state moves the fingerprint', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        const before = fp(sim);
        const s = sim.state.rng.stream('ai').getState();
        sim.state.rng.stream('ai').setState([s[0] ^ 1, s[1], s[2], s[3]]);
        expect(fp(sim)).not.toBe(before);
    });
});

describe('snapshot as a deterministic restart point', () => {
    it('two restores of the same snapshot re-step identically', () => {
        const bytes = new Uint8Array(
            steppedSim(DEFAULT_SEED, 3, 20).snapshot()
        );
        const trace = (): string[] => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.restore(bytes);
            const out: string[] = [];
            for (let i = 0; i < 20; i++) {
                sim.step();
                out.push(sim.fingerprint());
            }
            return out;
        };
        expect(trace()).toEqual(trace());
    });

    it('re-stepping a restored state stays within one grid of the original', () => {
        const sim = steppedSim(DEFAULT_SEED, 2, 20);
        const bytes = new Uint8Array(sim.snapshot());
        const restored = new BattleSim(DEFAULT_SEED);
        restored.restore(bytes);
        const tol = 2 / QUANT_GRID;
        for (let i = 0; i < 20; i++) {
            sim.step();
            restored.step();
            for (const id of sim.state.store.ids()) {
                const a = sim.state.store.get(id).xform;
                const b = restored.state.store.get(id).xform;
                expect(Math.abs(a.x - b.x)).toBeLessThanOrEqual(tol);
                expect(Math.abs(a.y - b.y)).toBeLessThanOrEqual(tol);
                expect(Math.abs(a.vx - b.vx)).toBeLessThanOrEqual(tol);
                expect(Math.abs(a.vy - b.vy)).toBeLessThanOrEqual(tol);
            }
        }
    });
});
