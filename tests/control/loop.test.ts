import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import {
    DECISION_INTERVAL_TICKS,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE
} from '@/control/constants';
import { SkillIntentKind } from '@/control/types';
import type {
    IControlTickResult,
    IDamageContext,
    IProjectileSighting,
    ISensedUnit,
    ISensingWorld,
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitObservation
} from '@/control/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { ColliderPart } from '@/physics/types';
import type {
    IDamageEvent,
    IPhysicsTickResult,
    IPhysicsWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind, SkillKind, WeaponKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { ArenaSensingWorld } from './arena';
import { TestDamageSink } from './damage-sink';

/**
 * 构造一个静止的运动读数。
 * @param x 位置的 x 坐标。
 * @param y 位置的 y 坐标。
 * @returns 静止状态。
 */
function stateAt(x: number, y: number): IUnitState {
    return { x, y, angle: 0, vx: 0, vy: 0, angularVelocity: 0 };
}

/**
 * 构造一个空的物理 tick 结果。
 * @returns 无接触、无伤害的结果。
 */
function emptyTick(): IPhysicsTickResult {
    return { contacts: [], damages: [] };
}

/**
 * 生成一个用于注册的真实单位。
 * @param seed 确定性随机种子。
 * @returns 单位实例。
 */
function makeUnit(seed: number): IUnit {
    return spawnUnit(ClassKind.Swordsman, mulberry32(seed));
}

/**
 * 构造全零动作。
 * @returns 全零动作。
 */
function zeroAction(): IUnitAction {
    return {
        forceUp: 0,
        forceDown: 0,
        forceLeft: 0,
        forceRight: 0,
        torqueClockwise: 0,
        torqueCounterClockwise: 0,
        skillIntent: null
    };
}

/**
 * 记录型物理世界：把力/力矩/注册/移除事件通过回调外泄，便于断言调用语义；
 * 除 `IPhysicsWorld` 外不暴露任何公共成员。
 */
class RecordingPhysicsWorld implements IPhysicsWorld {
    /** unitId → 对外报告的运动读数。 */
    private readonly states: Map<number, IUnitState>;
    /** 每次 `applyForce` 的回调。 */
    private readonly forceSink: (
        unitId: number,
        forceX: number,
        forceY: number
    ) => void;
    /** 每次 `applyTorque` 的回调。 */
    private readonly torqueSink: (unitId: number, torque: number) => void;
    /** 每次 `tick()` 返回的结果。 */
    private readonly nextTickResult: () => IPhysicsTickResult;
    /** 注册回调（可抛错以模拟物理注册失败）。 */
    private readonly onRegister?: (unitId: number) => void;
    /** 移除回调。 */
    private readonly onRemove?: (unitId: number) => void;
    /** 释放回调。 */
    private readonly onDispose?: () => void;
    /** 当前已注册的 id 集合（`hasUnit` 的数据源）。 */
    private readonly registered = new Set<number>();

    /**
     * 构造记录型物理世界。
     * @param states 运动读数表。
     * @param forceSink 力回调。
     * @param torqueSink 力矩回调。
     * @param nextTickResult 每次 tick 的结果工厂。
     * @param onRegister 注册回调。
     * @param onRemove 移除回调。
     * @param onDispose 释放回调。
     */
    constructor(
        states: Map<number, IUnitState>,
        forceSink: (unitId: number, forceX: number, forceY: number) => void,
        torqueSink: (unitId: number, torque: number) => void,
        nextTickResult: () => IPhysicsTickResult,
        onRegister?: (unitId: number) => void,
        onRemove?: (unitId: number) => void,
        onDispose?: () => void
    ) {
        this.states = states;
        this.forceSink = forceSink;
        this.torqueSink = torqueSink;
        this.nextTickResult = nextTickResult;
        this.onRegister = onRegister;
        this.onRemove = onRemove;
        this.onDispose = onDispose;
    }

    registerUnit(spec: IUnitPhysicsSpec): void {
        this.onRegister?.(spec.unitId);
        this.registered.add(spec.unitId);
    }

    removeUnit(unitId: number): void {
        this.onRemove?.(unitId);
        this.registered.delete(unitId);
    }

    hasUnit(unitId: number): boolean {
        return this.registered.has(unitId);
    }

    applyForce(unitId: number, forceX: number, forceY: number): void {
        this.forceSink(unitId, forceX, forceY);
    }

    applyTorque(unitId: number, torque: number): void {
        this.torqueSink(unitId, torque);
    }

    getUnitState(unitId: number): IUnitState | null {
        return this.states.get(unitId) ?? null;
    }

    tick(): IPhysicsTickResult {
        return this.nextTickResult();
    }

    dispose(): void {
        this.onDispose?.();
    }
}

/**
 * 记录型 AI：把决策转交给闭包，便于记录 tick 或返回畸形值。
 */
class RecordingAI implements IUnitAI {
    /** 决策函数。 */
    private readonly decideFn: (observation: IUnitObservation) => IUnitAction;

    /**
     * 构造记录型 AI。
     * @param decideFn 决策函数。
     */
    constructor(decideFn: (observation: IUnitObservation) => IUnitAction) {
        this.decideFn = decideFn;
    }

    decide(observation: IUnitObservation): IUnitAction {
        return this.decideFn(observation);
    }
}

/**
 * 记录型 Provider：把所有创建/销毁经回调外泄，便于断言生命周期与顺序。
 */
class RecordingProvider implements IUnitAIProvider {
    /** 每单位 AI 工厂。 */
    private readonly aiFactory: (unitId: number, unit: IUnit) => IUnitAI;
    /** 创建回调。 */
    private readonly onCreate?: (unitId: number) => void;
    /** 销毁回调。 */
    private readonly onDestroy?: (unitId: number) => void;

    /**
     * 构造记录型 Provider。
     * @param aiFactory 每单位 AI 工厂。
     * @param onCreate 创建回调。
     * @param onDestroy 销毁回调。
     */
    constructor(
        aiFactory: (unitId: number, unit: IUnit) => IUnitAI,
        onCreate?: (unitId: number) => void,
        onDestroy?: (unitId: number) => void
    ) {
        this.aiFactory = aiFactory;
        this.onCreate = onCreate;
        this.onDestroy = onDestroy;
    }

    create(unitId: number, unit: IUnit): IUnitAI {
        this.onCreate?.(unitId);
        return this.aiFactory(unitId, unit);
    }

    destroy(unitId: number): void {
        this.onDestroy?.(unitId);
    }
}

/**
 * 抛错型感知世界：探测 `tick()` 是否隔离感知失败。
 * 除 `ISensingWorld` 外不暴露任何公共成员。
 */
class ThrowingSensingWorld implements ISensingWorld {
    castRayFan(
        _originX: number,
        _originY: number,
        _maxDistance: number,
        _blockers: readonly ISensedUnit[]
    ): readonly number[] {
        throw new Error('sensing boom');
    }

    queryProjectiles(
        _x: number,
        _y: number,
        _radius: number
    ): readonly IProjectileSighting[] {
        throw new Error('sensing boom');
    }
}

describe('ControlSystem — execution semantics', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的真实物理世界（仅 tracer 与同队碰撞测试使用）。 */
    let physics: PhysicsWorld | null = null;
    /** 当前测试持有的控制系统（同上）。 */
    let control: ControlSystem | null = null;

    afterEach(() => {
        control?.dispose();
        physics?.dispose();
        control = null;
        physics = null;
    });

    it('decides exactly on ticks 0/6/12/18 and never between', () => {
        const decided: number[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(observation => {
                    decided.push(observation.tick);
                    return zeroAction();
                })
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(1),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 13; tick += 1) {
            controller.tick();
        }
        expect(decided).toEqual([
            0,
            DECISION_INTERVAL_TICKS,
            DECISION_INTERVAL_TICKS * 2
        ]);

        for (let tick = 0; tick < 6; tick += 1) {
            controller.tick();
        }
        expect(decided).toEqual([0, 6, 12, 18]);
    });

    it('composes net force/torque and re-applies the held action on every physics tick', () => {
        const forceCalls: [number, number, number][] = [];
        const torqueCalls: [number, number][] = [];
        const decided: number[] = [];
        const action: IUnitAction = {
            forceRight: 10,
            forceLeft: 3,
            forceUp: 5,
            forceDown: 2,
            torqueCounterClockwise: 7,
            torqueClockwise: 4,
            skillIntent: null
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            (unitId, torque) => torqueCalls.push([unitId, torque]),
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(observation => {
                    decided.push(observation.tick);
                    return action;
                })
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(2),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 13; tick += 1) {
            controller.tick();
        }

        expect(forceCalls).toHaveLength(13);
        expect(
            forceCalls.every(
                ([unitId, forceX, forceY]) =>
                    unitId === 1 && forceX === 7 && forceY === 3
            )
        ).toBe(true);
        expect(torqueCalls).toHaveLength(13);
        expect(
            torqueCalls.every(
                ([unitId, torque]) => unitId === 1 && torque === 3
            )
        ).toBe(true);
        expect(decided).toEqual([0, 6, 12]);
    });

    it('replaces the held action at the next decision instead of reusing the first', () => {
        const forceCalls: [number, number, number][] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(observation =>
                    observation.tick === 0
                        ? { ...zeroAction(), forceRight: 10 }
                        : { ...zeroAction(), forceUp: 20 }
                )
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(44),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 13; tick += 1) {
            controller.tick();
        }

        const actionA: [number, number, number] = [1, 10, 0];
        const actionB: [number, number, number] = [1, 0, 20];
        const expected = [
            ...Array.from({ length: DECISION_INTERVAL_TICKS }, () => actionA),
            ...Array.from(
                { length: 13 - DECISION_INTERVAL_TICKS },
                () => actionB
            )
        ];
        expect(forceCalls).toEqual(expected);
    });

    it('skips applyForce/applyTorque when the composed action is all zero', () => {
        const forceCalls: [number, number, number][] = [];
        const torqueCalls: [number, number][] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            (unitId, torque) => torqueCalls.push([unitId, torque]),
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction())
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(3),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 3; tick += 1) {
            controller.tick();
        }

        expect(forceCalls).toHaveLength(0);
        expect(torqueCalls).toHaveLength(0);
    });

    it('maps non-finite and negative magnitudes to zero', () => {
        const forceCalls: [number, number, number][] = [];
        const torqueCalls: [number, number][] = [];
        const malformed: IUnitAction = {
            forceUp: Number.POSITIVE_INFINITY,
            forceDown: Number.NEGATIVE_INFINITY,
            forceLeft: -5,
            forceRight: Number.NaN,
            torqueClockwise: -3,
            torqueCounterClockwise: Number.NaN,
            skillIntent: null
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            (unitId, torque) => torqueCalls.push([unitId, torque]),
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => malformed)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(4),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 2; tick += 1) {
            controller.tick();
        }

        expect(forceCalls).toHaveLength(0);
        expect(torqueCalls).toHaveLength(0);
    });

    it('caps net force magnitude and torque at their limits', () => {
        const forceCalls: [number, number, number][] = [];
        const torqueCalls: [number, number][] = [];
        const huge: IUnitAction = {
            forceUp: 1e9,
            forceDown: 0,
            forceLeft: 0,
            forceRight: 1e9,
            torqueClockwise: 0,
            torqueCounterClockwise: 1e9,
            skillIntent: null
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            (unitId, torque) => torqueCalls.push([unitId, torque]),
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => huge)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(5),
            teamId: 1,
            x: 0,
            y: 0
        });

        controller.tick();

        expect(forceCalls).toHaveLength(1);
        const [, forceX, forceY] = forceCalls[0];
        const magnitude = Math.hypot(forceX, forceY);
        expect(magnitude).toBeLessThanOrEqual(MAX_FORCE_MAGNITUDE + 1e-6);
        expect(magnitude).toBeCloseTo(MAX_FORCE_MAGNITUDE, 6);
        expect(torqueCalls).toHaveLength(1);
        expect(torqueCalls[0][1]).toBeLessThanOrEqual(MAX_TORQUE_MAGNITUDE);
        expect(torqueCalls[0][1]).toBeCloseTo(MAX_TORQUE_MAGNITUDE, 6);
    });

    it('emits skill intents only on decision ticks', () => {
        const results: IControlTickResult[] = [];
        const action: IUnitAction = {
            ...zeroAction(),
            skillIntent: {
                kind: SkillIntentKind.Unit,
                unitId: 1,
                skill: SkillKind.Charge
            }
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => action)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(6),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 13; tick += 1) {
            results.push(controller.tick());
        }

        expect(results[0].skillIntents).toHaveLength(1);
        expect(results[1].skillIntents).toHaveLength(0);
        expect(results[6].skillIntents).toHaveLength(1);
        expect(results[12].skillIntents).toHaveLength(1);
        expect(
            results.reduce((sum, item) => sum + item.skillIntents.length, 0)
        ).toBe(3);
    });

    it('drops a spoofed skill intent whose unitId differs from the deciding unit', () => {
        const action: IUnitAction = {
            ...zeroAction(),
            skillIntent: {
                kind: SkillIntentKind.Weapon,
                unitId: 2,
                weapon: WeaponKind.Bow
            }
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => action)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(7),
            teamId: 1,
            x: 0,
            y: 0
        });

        const results: IControlTickResult[] = [];
        for (let tick = 0; tick < 13; tick += 1) {
            results.push(controller.tick());
        }

        expect(results.every(result => result.skillIntents.length === 0)).toBe(
            true
        );
    });

    it('drops skill intents whose payload is invalid for the selected kind', () => {
        const malformedIntents: unknown[] = [
            { kind: SkillIntentKind.Weapon, unitId: 1, weapon: 999 },
            { kind: SkillIntentKind.Weapon, unitId: 1 },
            { kind: SkillIntentKind.Weapon, unitId: 1, weapon: undefined },
            { kind: SkillIntentKind.Unit, unitId: 1, skill: 999 },
            { kind: SkillIntentKind.Unit, unitId: 1 },
            { kind: SkillIntentKind.Unit, unitId: 1, skill: undefined }
        ];

        for (const intent of malformedIntents) {
            const action = {
                ...zeroAction(),
                skillIntent: intent
            } as unknown as IUnitAction;
            const fake = new RecordingPhysicsWorld(
                new Map([[1, stateAt(0, 0)]]),
                () => {},
                () => {},
                emptyTick
            );
            const provider = new RecordingProvider(
                () => new RecordingAI(() => action)
            );
            const controller = new ControlSystem(
                fake,
                new ArenaSensingWorld(50),
                provider,
                new TestDamageSink()
            );
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(25),
                teamId: 1,
                x: 0,
                y: 0
            });

            const results: IControlTickResult[] = [];
            for (let tick = 0; tick < 13; tick += 1) {
                results.push(controller.tick());
            }

            expect(
                results.reduce(
                    (sum, result) => sum + result.skillIntents.length,
                    0
                )
            ).toBe(0);
            controller.dispose();
        }
    });

    it('emits a rebuilt skill intent that plugin mutation cannot change', () => {
        const pluginIntent: {
            kind: SkillIntentKind.Unit;
            unitId: number;
            skill: SkillKind;
        } = {
            kind: SkillIntentKind.Unit,
            unitId: 1,
            skill: SkillKind.Charge
        };
        const action: IUnitAction = {
            ...zeroAction(),
            skillIntent: pluginIntent
        };
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => action)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(26),
            teamId: 1,
            x: 0,
            y: 0
        });

        const result = controller.tick();
        const emitted = result.skillIntents[0];

        expect(emitted).not.toBe(pluginIntent);
        pluginIntent.skill = SkillKind.Spin;
        expect(emitted).toEqual({
            kind: SkillIntentKind.Unit,
            unitId: 1,
            skill: SkillKind.Charge
        });
    });

    it('isolates a throwing decide, falls back to a zero action, and keeps deciding', () => {
        const forceCalls: [number, number, number][] = [];
        const decided: number[] = [];
        let calls = 0;
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(observation => {
                    calls += 1;
                    decided.push(observation.tick);
                    if (calls === 1) {
                        throw new Error('plugin exploded');
                    }
                    return zeroAction();
                })
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(8),
            teamId: 1,
            x: 0,
            y: 0
        });

        for (let tick = 0; tick < 13; tick += 1) {
            expect(() => controller.tick()).not.toThrow();
        }

        expect(decided).toEqual([0, 6, 12]);
        expect(forceCalls).toHaveLength(0);
    });

    it('isolates a throwing sensing world and keeps the tick alive', () => {
        const forceCalls: [number, number, number][] = [];
        let decideCalls = 0;
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(() => {
                    decideCalls += 1;
                    return { ...zeroAction(), forceRight: 10 };
                })
        );
        const controller = new ControlSystem(
            fake,
            new ThrowingSensingWorld(),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(31),
            teamId: 1,
            x: 0,
            y: 0
        });

        expect(() => controller.tick()).not.toThrow();
        expect(decideCalls).toBe(0);
        expect(forceCalls).toHaveLength(0);
    });

    it('does not decide or apply actions for a unit already dead before the tick', () => {
        const forceCalls: [number, number, number][] = [];
        let decideCalls = 0;
        const destroyed: number[] = [];
        const dead = makeUnit(29);
        dead.takeDamage(dead.getAttribute(AttributeKind.MaxHealth) + 1);
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(() => {
                    decideCalls += 1;
                    return { ...zeroAction(), forceRight: 10 };
                }),
            undefined,
            unitId => destroyed.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: dead,
            teamId: 1,
            x: 0,
            y: 0
        });

        const result = controller.tick();

        expect(decideCalls).toBe(0);
        expect(forceCalls).toHaveLength(0);
        expect(result.skillIntents).toHaveLength(0);
        expect(destroyed).toEqual([1]);
        expect(controller.getUnit(1)).toBeNull();
    });

    it('drops the action and skill intent when decide re-enters and unregisters the unit', () => {
        const forceCalls: [number, number, number][] = [];
        let controller: ControlSystem | null = null;
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            (unitId, forceX, forceY) =>
                forceCalls.push([unitId, forceX, forceY]),
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () =>
                new RecordingAI(() => {
                    controller?.unregisterUnit(1);
                    return {
                        ...zeroAction(),
                        forceRight: 10,
                        skillIntent: {
                            kind: SkillIntentKind.Unit,
                            unitId: 1,
                            skill: SkillKind.Charge
                        }
                    };
                })
        );
        controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(30),
            teamId: 1,
            x: 0,
            y: 0
        });

        const result = controller.tick();

        expect(result.skillIntents).toHaveLength(0);
        expect(forceCalls).toHaveLength(0);
        expect(controller.getUnit(1)).toBeNull();
        expect(fake.hasUnit(1)).toBe(false);
    });

    it('routes a queued damage event once with resolved units and team ids', () => {
        const event: IDamageEvent = {
            attackerId: 1,
            defenderId: 2,
            attackerPart: ColliderPart.Weapon,
            defenderPart: ColliderPart.Body,
            weaponKind: WeaponKind.Longsword,
            deltaV: 12,
            damageMean: 100,
            damage: 60,
            damageReduced: 0
        };
        let tickCount = 0;
        const fake = new RecordingPhysicsWorld(
            new Map([
                [1, stateAt(0, 0)],
                [2, stateAt(1, 0)]
            ]),
            () => {},
            () => {},
            () => {
                tickCount += 1;
                return tickCount === 1
                    ? { contacts: [], damages: [event] }
                    : emptyTick();
            }
        );
        const applied: IDamageContext[] = [];
        const sink = new TestDamageSink(context => applied.push(context));
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction())
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            sink
        );
        const attackerUnit = makeUnit(9);
        const defenderUnit = makeUnit(10);
        controller.registerUnit({
            unitId: 1,
            unit: attackerUnit,
            teamId: 1,
            x: 0,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: defenderUnit,
            teamId: 2,
            x: 1,
            y: 0
        });
        const healthBefore = defenderUnit.getAttribute(AttributeKind.Health);

        controller.tick();

        expect(applied).toHaveLength(1);
        expect(applied[0].attacker).toBe(attackerUnit);
        expect(applied[0].defender).toBe(defenderUnit);
        expect(applied[0].attackerTeamId).toBe(1);
        expect(applied[0].defenderTeamId).toBe(2);
        expect(defenderUnit.getAttribute(AttributeKind.Health)).toBeCloseTo(
            healthBefore - event.damage,
            6
        );
    });

    it('does not let XP level-ups resurrect units killed by the same blow', () => {
        const sink = new TestDamageSink();
        const event: IDamageEvent = {
            attackerId: 1,
            defenderId: 2,
            attackerPart: ColliderPart.Weapon,
            defenderPart: ColliderPart.Body,
            weaponKind: WeaponKind.Longsword,
            deltaV: 1e6,
            damageMean: 1e9,
            damage: 1e9,
            damageReduced: 1e9
        };

        const attacker = makeUnit(36);
        const defender = makeUnit(37);
        sink.applyDamage({
            event,
            attacker,
            defender,
            attackerTeamId: 1,
            defenderTeamId: 2
        });

        expect(defender.isAlive()).toBe(false);
        expect(defender.getAttribute(AttributeKind.Health)).toBe(0);

        const deadAttacker = makeUnit(38);
        deadAttacker.takeDamage(
            deadAttacker.getAttribute(AttributeKind.MaxHealth) + 1
        );
        const victim = makeUnit(39);
        sink.applyDamage({
            event,
            attacker: deadAttacker,
            defender: victim,
            attackerTeamId: 1,
            defenderTeamId: 2
        });

        expect(deadAttacker.isAlive()).toBe(false);
    });

    it('test sink drops same-team damage before touching either unit', () => {
        const sink = new TestDamageSink();
        const attacker = makeUnit(40);
        const defender = makeUnit(41);
        const event: IDamageEvent = {
            attackerId: 1,
            defenderId: 2,
            attackerPart: ColliderPart.Weapon,
            defenderPart: ColliderPart.Body,
            weaponKind: WeaponKind.Longsword,
            deltaV: 12,
            damageMean: 100,
            damage: 1e9,
            damageReduced: 0
        };
        const healthBefore = defender.getAttribute(AttributeKind.Health);

        sink.applyDamage({
            event,
            attacker,
            defender,
            attackerTeamId: 7,
            defenderTeamId: 7
        });

        expect(defender.getAttribute(AttributeKind.Health)).toBe(healthBefore);
        expect(defender.isAlive()).toBe(true);
    });

    it('keeps same-team bodies colliding while the test sink drops same-team damage (production sinks must re-apply the filter)', () => {
        const world = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(4242)
        );
        physics = world;
        const routed: IDamageContext[] = [];
        const applied: IDamageContext[] = [];
        const innerSink = new TestDamageSink(context => applied.push(context));
        const sink = {
            applyDamage(context: IDamageContext): void {
                routed.push(context);
                innerSink.applyDamage(context);
            }
        };
        const provider = new RecordingProvider(
            unitId =>
                new RecordingAI(() =>
                    unitId === 1
                        ? { ...zeroAction(), forceRight: 500 }
                        : { ...zeroAction(), forceLeft: 500 }
                )
        );
        const controller = new ControlSystem(
            world,
            new ArenaSensingWorld(50),
            provider,
            sink
        );
        control = controller;

        const first = makeUnit(21);
        const second = makeUnit(22);
        controller.registerUnit({
            unitId: 1,
            unit: first,
            teamId: 1,
            x: -1,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: second,
            teamId: 1,
            x: 1,
            y: 0
        });
        const healthOne = first.getAttribute(AttributeKind.Health);
        const healthTwo = second.getAttribute(AttributeKind.Health);
        let minDistance = Number.POSITIVE_INFINITY;

        for (let tick = 0; tick < 120; tick += 1) {
            controller.tick();
            const one = world.getUnitState(1);
            const two = world.getUnitState(2);
            if (one !== null && two !== null) {
                minDistance = Math.min(
                    minDistance,
                    Math.hypot(one.x - two.x, one.y - two.y)
                );
            }
        }

        // 同队碰撞确实发生：物理层发出了伤害事件（经控制层路由到 sink），
        // 但 TestDamageSink 的同队过滤使其一条都未被应用（D-09）。
        expect(routed.length).toBeGreaterThan(0);
        expect(applied).toHaveLength(0);
        expect(first.getAttribute(AttributeKind.Health)).toBe(healthOne);
        expect(second.getAttribute(AttributeKind.Health)).toBe(healthTwo);
        expect(minDistance).toBeGreaterThanOrEqual(0.9);
        expect(minDistance).toBeLessThanOrEqual(1.4);
    });

    it('batch-removes a dead unit after routing and destroys its AI exactly once', () => {
        const order: string[] = [];
        const destroyed: number[] = [];
        const event: IDamageEvent = {
            attackerId: 1,
            defenderId: 2,
            attackerPart: ColliderPart.Weapon,
            defenderPart: ColliderPart.Body,
            weaponKind: WeaponKind.Longsword,
            deltaV: 20,
            damageMean: 1e9,
            damage: 1e9,
            damageReduced: 0
        };
        let tickCount = 0;
        const fake = new RecordingPhysicsWorld(
            new Map([
                [1, stateAt(0, 0)],
                [2, stateAt(1, 0)]
            ]),
            () => {},
            () => {},
            () => {
                tickCount += 1;
                return tickCount === 1
                    ? { contacts: [], damages: [event] }
                    : emptyTick();
            }
        );
        const sink = new TestDamageSink(() => order.push('sink:2'));
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            undefined,
            unitId => {
                destroyed.push(unitId);
                order.push(`provider.destroy:${unitId}`);
            }
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            sink
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(11),
            teamId: 1,
            x: 0,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: makeUnit(12),
            teamId: 2,
            x: 1,
            y: 0
        });

        controller.tick();

        expect(controller.getUnit(2)).toBeNull();
        expect(fake.hasUnit(2)).toBe(false);
        expect(controller.getUnit(1)).not.toBeNull();
        expect(destroyed).toEqual([2]);
        expect(order.indexOf('sink:2')).toBeGreaterThanOrEqual(0);
        expect(order.indexOf('sink:2')).toBeLessThan(
            order.indexOf('provider.destroy:2')
        );
    });

    it('creates the AI before registering with physics', () => {
        const order: string[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick,
            unitId => order.push(`physics.registerUnit:${unitId}`)
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            unitId => order.push(`provider.create:${unitId}`)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        const unit = makeUnit(13);

        controller.registerUnit({ unitId: 1, unit, teamId: 1, x: 0, y: 0 });

        expect(order).toEqual(['provider.create:1', 'physics.registerUnit:1']);
        expect(controller.getUnit(1)).toBe(unit);
        expect(fake.hasUnit(1)).toBe(true);
    });

    it('destroys the AI and leaves no partial state when physics registration throws', () => {
        const created: number[] = [];
        const destroyed: number[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick,
            unitId => {
                if (unitId === 1) {
                    throw new Error('physics boom');
                }
            }
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            unitId => created.push(unitId),
            unitId => destroyed.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );

        expect(() =>
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(14),
                teamId: 1,
                x: 0,
                y: 0
            })
        ).toThrow('physics boom');

        expect(created).toEqual([1]);
        expect(destroyed).toEqual([1]);
        expect(controller.getUnit(1)).toBeNull();
        expect(controller.listUnitIds()).toHaveLength(0);
        expect(fake.hasUnit(1)).toBe(false);
    });

    it('deregisters in provider.destroy → catalog delete → physics.removeUnit order', () => {
        const order: string[] = [];
        let controller: ControlSystem | null = null;
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick,
            undefined,
            unitId => {
                expect(controller?.getUnit(unitId)).toBeNull();
                order.push(`physics.removeUnit:${unitId}`);
            }
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            undefined,
            unitId => order.push(`provider.destroy:${unitId}`)
        );
        controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(15),
            teamId: 1,
            x: 0,
            y: 0
        });

        controller.unregisterUnit(1);

        expect(order).toEqual(['provider.destroy:1', 'physics.removeUnit:1']);
        expect(fake.hasUnit(1)).toBe(false);
    });

    it('handles duplicate registration, updateTeam, and unregisterUnit', () => {
        const destroyed: number[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            undefined,
            unitId => destroyed.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(16),
            teamId: 1,
            x: 0,
            y: 0
        });

        expect(() =>
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(17),
                teamId: 1,
                x: 0,
                y: 0
            })
        ).toThrow(/already registered/);

        controller.updateTeam(1, 9);
        expect(controller.getTeam(1)).toBe(9);

        controller.unregisterUnit(1);
        expect(controller.getUnit(1)).toBeNull();
        expect(controller.getTeam(1)).toBeUndefined();
        expect(fake.hasUnit(1)).toBe(false);
        expect(destroyed).toEqual([1]);

        controller.unregisterUnit(1);
        expect(destroyed).toEqual([1]);
    });

    it('does not double-destroy or recurse when provider.destroy re-enters unregisterUnit', () => {
        const destroyed: number[] = [];
        let controller: ControlSystem | null = null;
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            undefined,
            unitId => {
                destroyed.push(unitId);
                controller?.unregisterUnit(unitId);
            }
        );
        controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(28),
            teamId: 1,
            x: 0,
            y: 0
        });

        expect(() => controller?.unregisterUnit(1)).not.toThrow();

        expect(destroyed).toEqual([1]);
        expect(controller.getUnit(1)).toBeNull();
        expect(fake.hasUnit(1)).toBe(false);
    });

    it('dispose is idempotent, destroys remaining AIs, and does not dispose physics', () => {
        const destroyed: number[] = [];
        let physicsDisposeCalls = 0;
        const fake = new RecordingPhysicsWorld(
            new Map([
                [1, stateAt(0, 0)],
                [2, stateAt(1, 0)]
            ]),
            () => {},
            () => {},
            emptyTick,
            undefined,
            undefined,
            () => {
                physicsDisposeCalls += 1;
            }
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            undefined,
            unitId => destroyed.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(18),
            teamId: 1,
            x: 0,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: makeUnit(19),
            teamId: 1,
            x: 1,
            y: 0
        });

        controller.dispose();
        controller.dispose();

        expect(destroyed.sort((left, right) => left - right)).toEqual([1, 2]);
        expect(physicsDisposeCalls).toBe(0);
        expect(fake.hasUnit(1)).toBe(true);
        expect(fake.hasUnit(2)).toBe(true);
        expect(controller.listUnitIds()).toHaveLength(0);
        expect(controller.tick().skillIntents).toHaveLength(0);
    });

    it('rejects registration after dispose instead of leaking an AI', () => {
        const created: number[] = [];
        const destroyed: number[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            unitId => created.push(unitId),
            unitId => destroyed.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );
        controller.dispose();

        expect(() =>
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(27),
                teamId: 1,
                x: 0,
                y: 0
            })
        ).toThrow(/disposed/);

        expect(created).toHaveLength(0);
        expect(destroyed).toHaveLength(0);
        expect(fake.hasUnit(1)).toBe(false);
        expect(controller.listUnitIds()).toHaveLength(0);
    });

    it('rejects non-finite team ids at registration and updateTeam', () => {
        const created: number[] = [];
        const fake = new RecordingPhysicsWorld(
            new Map([[1, stateAt(0, 0)]]),
            () => {},
            () => {},
            emptyTick
        );
        const provider = new RecordingProvider(
            () => new RecordingAI(() => zeroAction()),
            unitId => created.push(unitId)
        );
        const controller = new ControlSystem(
            fake,
            new ArenaSensingWorld(50),
            provider,
            new TestDamageSink()
        );

        expect(() =>
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(42),
                teamId: Number.NaN,
                x: 0,
                y: 0
            })
        ).toThrow(/teamId must be finite/);
        expect(created).toHaveLength(0);
        expect(fake.hasUnit(1)).toBe(false);

        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(43),
            teamId: 1,
            x: 0,
            y: 0
        });
        expect(() =>
            controller.updateTeam(1, Number.POSITIVE_INFINITY)
        ).toThrow(/teamId must be finite/);
        expect(controller.getTeam(1)).toBe(1);
    });

    it('falls back to a zero action for null, undefined, partial, and undefined skillIntent returns', () => {
        const malformedCases: (() => IUnitAction)[] = [
            () => null as unknown as IUnitAction,
            () => undefined as unknown as IUnitAction,
            () => ({}) as unknown as IUnitAction,
            () =>
                ({
                    ...zeroAction(),
                    skillIntent: undefined
                }) as unknown as IUnitAction
        ];

        for (const makeMalformed of malformedCases) {
            const forceCalls: [number, number, number][] = [];
            const torqueCalls: [number, number][] = [];
            let calls = 0;
            const fake = new RecordingPhysicsWorld(
                new Map([[1, stateAt(0, 0)]]),
                (unitId, forceX, forceY) =>
                    forceCalls.push([unitId, forceX, forceY]),
                (unitId, torque) => torqueCalls.push([unitId, torque]),
                emptyTick
            );
            const provider = new RecordingProvider(
                () =>
                    new RecordingAI(() => {
                        calls += 1;
                        return makeMalformed();
                    })
            );
            const controller = new ControlSystem(
                fake,
                new ArenaSensingWorld(50),
                provider,
                new TestDamageSink()
            );
            controller.registerUnit({
                unitId: 1,
                unit: makeUnit(20),
                teamId: 1,
                x: 0,
                y: 0
            });

            for (let tick = 0; tick < 7; tick += 1) {
                expect(() => controller.tick()).not.toThrow();
            }

            expect(calls).toBe(2);
            expect(forceCalls).toHaveLength(0);
            expect(torqueCalls).toHaveLength(0);
        }
    });

    it('tracer: two opposite teams decide, move, and route a damage event to the sink', () => {
        const world = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(20261020)
        );
        physics = world;
        const createdIds: number[] = [];
        const decidedTicks: number[] = [];
        const applied: IDamageContext[] = [];
        const provider = new RecordingProvider(
            () => {
                const ai = new DefaultUnitAI();
                return new RecordingAI(observation => {
                    decidedTicks.push(observation.tick);
                    return ai.decide(observation);
                });
            },
            unitId => createdIds.push(unitId)
        );
        const sink = new TestDamageSink(context => applied.push(context));
        const controller = new ControlSystem(
            world,
            new ArenaSensingWorld(50),
            provider,
            sink
        );
        control = controller;

        controller.registerUnit({
            unitId: 1,
            unit: makeUnit(23),
            teamId: 1,
            x: -0.8,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: makeUnit(24),
            teamId: 2,
            x: 0.8,
            y: 0
        });
        expect(createdIds).toEqual([1, 2]);

        const startOne = world.getUnitState(1);
        const startTwo = world.getUnitState(2);
        if (startOne === null || startTwo === null) {
            throw new Error('expected both tracer units to be registered');
        }
        let sawMovement = false;

        for (let tick = 0; tick < 300; tick += 1) {
            const result = controller.tick();
            expect(Array.isArray(result.skillIntents)).toBe(true);

            const one = world.getUnitState(1);
            if (
                one !== null &&
                (Math.abs(one.x - startOne.x) > 1e-6 ||
                    Math.abs(one.y - startOne.y) > 1e-6)
            ) {
                sawMovement = true;
            }
            const two = world.getUnitState(2);
            if (
                two !== null &&
                (Math.abs(two.x - startTwo.x) > 1e-6 ||
                    Math.abs(two.y - startTwo.y) > 1e-6)
            ) {
                sawMovement = true;
            }

            if (applied.length > 0) {
                break;
            }
        }

        expect(decidedTicks[0]).toBe(0);
        expect(sawMovement).toBe(true);
        expect(applied.length).toBeGreaterThan(0);
        expect(applied[0].attackerTeamId).not.toBe(applied[0].defenderTeamId);
    });
});
