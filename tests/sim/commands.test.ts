import { describe, expect, it } from 'vitest';
import { DEFAULT_SEED } from '../../src/config/sim';
import { BattleSim } from '../../src/sim/battle-sim';
import { CommandKind, CommandQueue } from '../../src/sim/commands';
import {
    EventLog,
    SimEventKind,
    type IRejectedEvent
} from '../../src/sim/core/events';
import {
    deserializeState,
    fingerprint,
    serializeState
} from '../../src/sim/snapshot';

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
        // 两局同种子 → 相同的初始散布与物理演化，差值恰为命令冲量经 Rapier 产生的速度增量。
        // 质量由复合刚体决定（本体 + 防具 + 关节耦合武器），故断言方向与量级而非精确常数（物理质量模型）。
        expect(f.vx).toBeGreaterThan(b.vx);
        expect(f.vy).toBeLessThan(b.vy);
        expect(f.vx - b.vx).toBeGreaterThan(0.01);
        expect(b.vy - f.vy).toBeGreaterThan(0.01);
    });

    it('drains commands exactly once (a force is not re-applied on the next step)', () => {
        const id = 1;
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        const ref = new BattleSim(DEFAULT_SEED);
        ref.spawn();

        sim.submit([
            { kind: CommandKind.Force, unit: id, fx: 1, fy: 0, atTick: 1 }
        ]);
        sim.step();
        ref.step();
        const d1 =
            sim.state.store.get(id).xform.vx - ref.state.store.get(id).xform.vx;

        sim.step();
        ref.step();
        const d2 =
            sim.state.store.get(id).xform.vx - ref.state.store.get(id).xform.vx;

        // 一次性冲量使速度永久领先；若被重复 drain 应用，差值会在第二 tick 不减反增。
        // Rapier 线性阻尼使领先量单调收缩，故 d2 < d1。
        expect(d1).toBeGreaterThan(0);
        expect(d2).toBeLessThan(d1);
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
        /**
         * 用固定的双向命令流跑 10 tick，收集逐 tick 指纹。
         *
         * @returns 10 个 tick 的状态指纹轨迹。
         */
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

describe('BattleSim physics wiring (PHYS-01 / PHYS-03)', () => {
    it('spawn builds a composite unit and ISimState exposes the physics world', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        const id = sim.spawn();
        expect(sim.state.physics).toBeDefined();
        const phys = sim.state.store.get(id).physics;
        expect(typeof phys.bodyHandle).toBe('number');
        expect(phys.weaponHandles.length).toBeGreaterThan(0);
    });

    it('after step() the mirrored pose (rotation/angularVelocity) matches the Rapier body (D-34)', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        const id = sim.spawn();
        sim.step();
        const x = sim.state.store.get(id).xform;
        const body = sim.state.physics.world.getRigidBody(
            sim.state.store.get(id).physics.bodyHandle
        );
        expect(x.rotation).toBe(body.rotation());
        expect(x.angularVelocity).toBe(body.angvel());
    });

    it('snapshot v3 round-trips with physics present (D-34)', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        sim.spawn();
        for (let i = 0; i < 10; i++) sim.step();
        const bytes = sim.snapshot();
        const restored = deserializeState(bytes);
        expect(restored.physics).toBeDefined();
        expect(fingerprint(serializeState(restored))).toBe(fingerprint(bytes));
    });

    it('anti-vacuous: physics motion moves a mirrored pose value past the 1/256 grid', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        const id = sim.spawn();
        const x0 = sim.state.store.get(id).xform.x;
        const y0 = sim.state.store.get(id).xform.y;
        for (let i = 0; i < 60; i++) sim.step();
        const dx = Math.abs(sim.state.store.get(id).xform.x - x0);
        const dy = Math.abs(sim.state.store.get(id).xform.y - y0);
        expect(Math.max(dx, dy)).toBeGreaterThan(1 / 256);
    });

    it('same seed + same command log → identical per-tick fingerprint trace after physics', () => {
        /**
         * 物理接入后重跑固定命令流，收集逐 tick 指纹。
         *
         * @returns 10 个 tick 的状态指纹轨迹。
         */
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
