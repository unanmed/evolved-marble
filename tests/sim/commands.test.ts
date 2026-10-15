import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../../src/config/sim';
import { BattleSim } from '../../src/sim/battle-sim';
import { CommandKind, CommandQueue } from '../../src/sim/commands';
import {
    EventLog,
    SimEventKind,
    type IRejectedEvent
} from '../../src/sim/core/events';

/**
 * 内向命令契约 + 每 tick 事件日志（SIM-02/SIM-03，威胁 T-01-05）。
 *
 * 覆盖：force 改变速度、每 tick 单次 drain、未知 kind/缺字段确定性拒绝、
 * 未知实体确定性丢弃（不抛错）、通过事件日志的每 tick 副本语义、命令日志确定性。
 */

describe('CommandQueue', () => {
    it('drains buffered commands in insertion order and clears the buffer', () => {
        const q = new CommandQueue();
        q.submit([
            { kind: CommandKind.Force, unit: 1, fx: 1, fy: 0, atTick: 1 },
            { kind: CommandKind.Torque, unit: 1, amount: 0.5, atTick: 1 }
        ]);
        expect(q.pending).toBe(2);
        const out = q.drain();
        expect(out.map(c => c.kind)).toEqual([
            CommandKind.Force,
            CommandKind.Torque
        ]);
        expect(q.pending).toBe(0);
        expect(q.drain()).toEqual([]);
    });

    it('rejects garbage deterministically without throwing', () => {
        const q = new CommandQueue();
        expect(() =>
            q.submit([
                null,
                42,
                'x',
                {},
                { kind: 'nope' },
                { kind: 'force', unit: 1 } // 缺 fx/fy/atTick
            ])
        ).not.toThrow();
        expect(q.drain()).toEqual([]);
        expect(q.rejectedTotal).toBe(6);
    });
});

describe('EventLog', () => {
    it('emits copies (not live handles) and clears on drain', () => {
        const log = new EventLog();
        const ev: IRejectedEvent = {
            kind: SimEventKind.Rejected,
            tick: 1,
            reason: 'x'
        };
        log.emit(ev);
        const drained = log.drain();
        expect(drained).toEqual([ev]);
        expect(drained[0]).not.toBe(ev);
        expect(log.size).toBe(0);
    });
});

describe('BattleSim commands', () => {
    it('a force submitted before a tick changes the target velocity after that tick', () => {
        const id = 1;
        const base = new BattleSim(DEFAULT_SEED);
        base.spawn();

        const forced = new BattleSim(DEFAULT_SEED);
        forced.spawn();
        forced.submit([
            {
                kind: CommandKind.Force,
                unit: id,
                fx: 0.3,
                fy: -0.2,
                atTick: 1
            }
        ]);

        base.step();
        forced.step();

        const b = base.state.store.get(id).xform;
        const f = forced.state.store.get(id).xform;
        // 两局同种子 → 相同的 'ai' 微扰，差值恰为施加的力
        expect(f.vx - b.vx).toBeCloseTo(0.3, 10);
        expect(f.vy - b.vy).toBeCloseTo(-0.2, 10);
    });

    it('drains commands exactly once (a force is not re-applied on the next step)', () => {
        const id = 1;
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        sim.submit([
            { kind: CommandKind.Force, unit: id, fx: 1, fy: 0, atTick: 1 }
        ]);
        sim.step();
        sim.step();

        const ref = new BattleSim(DEFAULT_SEED);
        ref.spawn();
        ref.step();
        ref.step();

        const v = sim.state.store.get(id).xform.vx;
        const r = ref.state.store.get(id).xform.vx;
        // 一次性施力贡献恒为 1（若被重复 drain 应用，则会是 2）
        expect(v - r).toBeCloseTo(1, 10);
    });

    it('a command submitted after step() does not affect the already-advanced tick', () => {
        const id = 1;
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        sim.step();
        const afterFirst = sim.state.store.get(id).xform.vx;
        sim.submit([
            { kind: CommandKind.Force, unit: id, fx: 5, fy: 0, atTick: 2 }
        ]);
        // 已推进 tick 的状态不受影响
        expect(sim.state.store.get(id).xform.vx).toBe(afterFirst);
    });

    it('rejects an unknown command kind deterministically (dropped, counted, flagged)', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        expect(() => sim.submit([{ kind: 'bogus', unit: 1 }])).not.toThrow();
        expect(sim.state.commands.rejectedTotal).toBe(1);
        sim.step();
        expect(sim.state.commands.rejectedTotal).toBe(1);
        const events = sim.state.events.drain();
        expect(events.some(e => e.kind === SimEventKind.Rejected)).toBe(true);
        // 绝无静默 no-op：未知命令不会产生 command 事件
        expect(events.some(e => e.kind === SimEventKind.Command)).toBe(false);
    });

    it('drops a command for a non-existent entity without throwing', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn(); // id 1
        expect(() => {
            sim.submit([
                { kind: CommandKind.Force, unit: 999, fx: 1, fy: 0, atTick: 1 }
            ]);
            sim.step();
        }).not.toThrow();
        expect(
            sim.state.events.drain().some(e => e.kind === SimEventKind.Rejected)
        ).toBe(true);
        // 形状合法，故不计入 CommandQueue 拒绝计数
        expect(sim.state.commands.rejectedTotal).toBe(0);
    });

    it('same seed + same command log → identical fingerprints', () => {
        const run = (): string[] => {
            const sim = new BattleSim(DEFAULT_SEED);
            const a = sim.spawn();
            const b = sim.spawn();
            const trace: string[] = [];
            for (let t = 0; t < 10; t++) {
                sim.submit([
                    {
                        kind: CommandKind.Force,
                        unit: a,
                        fx: 0.1,
                        fy: 0.05,
                        atTick: t + 1
                    },
                    {
                        kind: CommandKind.Force,
                        unit: b,
                        fx: -0.02,
                        fy: 0.3,
                        atTick: t + 1
                    }
                ]);
                sim.step();
                trace.push(sim.fingerprint());
            }
            return trace;
        };
        expect(run()).toEqual(run());
    });
});
