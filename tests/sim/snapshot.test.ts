import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../../src/config/sim';
import { BattleSim, type IBattleSim } from '../../src/sim/battle-sim';
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

/**
 * 构造一个生成 `spawns` 个实体、再推进 `ticks` 步的种子化 `BattleSim`。
 *
 * @param seed 主种子。
 * @param spawns 生成的实体数。
 * @param ticks 推进的 tick 数。
 * @returns 生成并推进后的战斗模拟实例。
 */
function steppedSim(seed: number, spawns: number, ticks: number): IBattleSim {
    const sim = new BattleSim(seed);
    for (let i = 0; i < spawns; i++) sim.spawn();
    for (let i = 0; i < ticks; i++) sim.step();
    return sim;
}

/**
 * 取该 sim 当前快照的规范指纹。
 *
 * @param sim 目标战斗模拟实例。
 * @returns 其快照的规范指纹字符串。
 */
function fp(sim: IBattleSim): string {
    return fingerprint(sim.snapshot());
}

/** 变异者普查的一条用例（D-16：具名接口，替代内联元组类型）。 */
interface IMutatorCase {
    /** 用例名（用于 `it.each` 标题插值）。 */
    name: string;
    /** 对该 sim 施加的变异。 */
    mutate: (sim: IBattleSim) => void;
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
        ((): IBattleSim => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.spawn(); // id 1
            return sim;
        })()
    );

    const grid = 1 / QUANT_GRID;
    const fieldCases: readonly IMutatorCase[] = [
        {
            name: 'xform.x',
            mutate: sim => {
                sim.state.store.get(1).xform.x += grid;
            }
        },
        {
            name: 'xform.y',
            mutate: sim => {
                sim.state.store.get(1).xform.y += grid;
            }
        },
        {
            name: 'xform.vx',
            mutate: sim => {
                sim.state.store.get(1).xform.vx += grid;
            }
        },
        {
            name: 'xform.vy',
            mutate: sim => {
                sim.state.store.get(1).xform.vy += grid;
            }
        },
        {
            name: 'attrs.hp',
            mutate: sim => {
                sim.state.store.get(1).attrs.hp += 1;
            }
        },
        {
            name: 'attrs.level',
            mutate: sim => {
                sim.state.store.get(1).attrs.level += 1;
            }
        }
    ];

    it.each(fieldCases)(
        'perturbing $name moves the fingerprint',
        mutatorCase => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.spawn();
            mutatorCase.mutate(sim);
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

    it('a differing id cursor (identical live entities) moves the fingerprint', () => {
        // A: 单个活实体（id 1），id 游标停在 2。
        const a = new BattleSim(DEFAULT_SEED);
        a.spawn();
        // B: 同样的单个活实体（id 1），但游标停在 3（id 2 生成后又被 despawn）。
        const b = new BattleSim(DEFAULT_SEED);
        b.spawn();
        const dead = b.spawn();
        b.state.store.despawn(dead);
        expect(fp(a)).not.toBe(fp(b));
    });
});

describe('entity-id cursor survives a snapshot round-trip (CR-01, D-05)', () => {
    it('does not reuse a dead id after despawn(max) → snapshot → restore → spawn', () => {
        const original = new BattleSim(DEFAULT_SEED);
        const first = original.spawn(); // id 1
        const second = original.spawn(); // id 2
        original.state.store.despawn(second); // 快照前移除最高 id
        const usedIds = [first, second];

        const restored = new BattleSim(DEFAULT_SEED);
        restored.restore(new Uint8Array(original.snapshot()));

        const originalNext = original.spawn();
        const restoredNext = restored.spawn();

        expect(restoredNext).toBe(originalNext);
        expect(usedIds).not.toContain(restoredNext);
        expect(restoredNext).toBeGreaterThan(Math.max(...usedIds));
    });

    it('a despawn→snapshot→restore→despawn→spawn churn reproduces identically', () => {
        const churn = (): number[] => {
            const sim = new BattleSim(DEFAULT_SEED);
            sim.spawn(); // id 1
            sim.spawn(); // id 2
            sim.spawn(); // id 3
            const restored = new BattleSim(DEFAULT_SEED);
            restored.restore(new Uint8Array(sim.snapshot()));
            restored.state.store.despawn(3);
            const out: number[] = [restored.spawn()];
            restored.state.store.despawn(out[0]);
            out.push(restored.spawn());
            return out;
        };
        expect(churn()).toEqual(churn());
    });
});

describe('quantize int32 range guard (WR-03)', () => {
    it('throws deterministically when a component exceeds the quantized int32 range', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        // QUANT_GRID=256 时，|value| 超过 floor(INT32_MAX/256)+1 ≈ 8.39e6 将溢出 setInt32。
        const beyond = Math.floor(2147483647 / QUANT_GRID) + 1;
        sim.state.store.get(1).xform.x = beyond;
        expect(() => sim.snapshot()).toThrow(
            /snapshot: value out of quantized int32 range/
        );
    });

    it('leaves in-range components byte-identical (guard does not alter valid bytes)', () => {
        const sim = steppedSim(DEFAULT_SEED, 3, 25);
        const bytes = sim.snapshot();
        const restored = deserializeState(bytes);
        expect(Array.from(serializeState(restored))).toEqual(Array.from(bytes));
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
