import { describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import { DECISION_INTERVAL_TICKS } from '@/control/constants';
import type {
    IDamageContext,
    IDamageSink,
    IProjectileSighting,
    ISensedUnit,
    ISensingWorld,
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitObservation
} from '@/control/types';
import type {
    IPhysicsTickResult,
    IPhysicsWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { spawnUnit } from '@/units/spawn';
import { ClassKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

/** 记录型物理世界的调用计数器与力调用序列（测试专用）。 */
interface IPhysicsSpy {
    /** `registerUnit` 调用次数。 */
    register: number;
    /** `removeUnit` 调用次数。 */
    remove: number;
    /** `applyForce` 调用次数。 */
    force: number;
    /** `applyTorque` 调用次数。 */
    torque: number;
    /** `tick` 调用次数。 */
    tick: number;
    /** 每次 `applyForce` 的参数序列。 */
    forces: [number, number, number][];
}

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
 * 生成一个用于注册的真实单位。
 * @param seed 确定性随机种子。
 * @returns 单位实例。
 */
function makeUnit(seed: number): IUnit {
    return spawnUnit(ClassKind.Swordsman, mulberry32(seed));
}

/**
 * 记录型物理世界：只计数并报告固定运动读数，不提供任何 `IPhysicsWorld` 之外的公共成员。
 */
class RecordingPhysicsWorld implements IPhysicsWorld {
    /** 调用计数器。 */
    private readonly spy: IPhysicsSpy;
    /** 注册即失败的 id 集合（模拟物理注册失败）。 */
    private readonly failing: readonly number[];
    /** unitId → 对外报告的运动读数。 */
    private readonly states = new Map<number, IUnitState>();
    /** 已注册 id 集合（`hasUnit` 的数据源）。 */
    private readonly registered = new Set<number>();

    /**
     * 构造记录型物理世界。
     * @param spy 调用计数器。
     * @param failing 注册时抛错的 id 列表，默认无。
     */
    constructor(spy: IPhysicsSpy, failing: readonly number[] = []) {
        this.spy = spy;
        this.failing = failing;
        this.states.set(1, stateAt(0, 0));
    }

    registerUnit(spec: IUnitPhysicsSpec): void {
        this.spy.register += 1;
        if (this.failing.includes(spec.unitId)) {
            throw new Error('physics boom');
        }
        this.registered.add(spec.unitId);
    }

    removeUnit(unitId: number): void {
        this.spy.remove += 1;
        this.registered.delete(unitId);
    }

    hasUnit(unitId: number): boolean {
        return this.registered.has(unitId);
    }

    applyForce(unitId: number, forceX: number, forceY: number): void {
        this.spy.force += 1;
        this.spy.forces.push([unitId, forceX, forceY]);
    }

    applyTorque(_unitId: number, _torque: number): void {
        this.spy.torque += 1;
    }

    getUnitState(unitId: number): IUnitState | null {
        return this.states.get(unitId) ?? null;
    }

    tick(): IPhysicsTickResult {
        this.spy.tick += 1;
        return emptyTick();
    }

    dispose(): void {
        // 该 fake 不持有需要释放的资源。
    }
}

/**
 * 恒定感知世界：64 条射线全部命中 `maxDistance`，无射弹。
 */
class ConstantSensingWorld implements ISensingWorld {
    /** 射线最远距离（米）。 */
    private readonly maxDistance: number;

    /**
     * 构造恒定感知世界。
     * @param maxDistance 射线最远距离（米）。
     */
    constructor(maxDistance: number) {
        this.maxDistance = maxDistance;
    }

    castRayFan(
        _originX: number,
        _originY: number,
        maxDistance: number,
        _blockers: readonly ISensedUnit[]
    ): readonly number[] {
        return Array.from({ length: 64 }, () =>
            Math.min(this.maxDistance, maxDistance)
        );
    }

    queryProjectiles(
        _x: number,
        _y: number,
        _radius: number
    ): readonly IProjectileSighting[] {
        return [];
    }
}

/**
 * 计数型 AI：记录自己是第几次被咨询，并返回固定动作。
 */
class CountingAI implements IUnitAI {
    /** 在共享记录中标识本实例的标签。 */
    private readonly label: string;
    /** 共享的决策记录数组。 */
    private readonly decisions: string[];
    /** 每次决策返回的固定动作。 */
    private readonly action: IUnitAction;

    /**
     * 构造计数型 AI。
     * @param label 本实例的标签。
     * @param decisions 共享的决策记录数组。
     * @param action 每次决策返回的动作。
     */
    constructor(label: string, decisions: string[], action: IUnitAction) {
        this.label = label;
        this.decisions = decisions;
        this.action = action;
    }

    decide(_observation: IUnitObservation): IUnitAction {
        this.decisions.push(this.label);
        return this.action;
    }
}

/**
 * 记录型 Provider：把创建/销毁经回调外泄，便于断言所有权与销毁次数。
 */
class SpyProvider implements IUnitAIProvider {
    /** 每单位 AI 工厂。 */
    private readonly aiFactory: (unitId: number) => IUnitAI;
    /** 创建回调。 */
    private readonly onCreate: (unitId: number) => void;
    /** 销毁回调。 */
    private readonly onDestroy: (unitId: number) => void;

    /**
     * 构造记录型 Provider。
     * @param aiFactory 每单位 AI 工厂。
     * @param onCreate 创建回调。
     * @param onDestroy 销毁回调。
     */
    constructor(
        aiFactory: (unitId: number) => IUnitAI,
        onCreate: (unitId: number) => void,
        onDestroy: (unitId: number) => void
    ) {
        this.aiFactory = aiFactory;
        this.onCreate = onCreate;
        this.onDestroy = onDestroy;
    }

    create(unitId: number, _unit: IUnit): IUnitAI {
        this.onCreate(unitId);
        return this.aiFactory(unitId);
    }

    destroy(unitId: number): void {
        this.onDestroy(unitId);
    }
}

/**
 * 空伤害接收方：本套件不产生伤害事件。
 */
class NoopDamageSink implements IDamageSink {
    applyDamage(_context: IDamageContext): void {
        // 伤害路由不在本套件的断言范围内。
    }
}

describe('ControlSystem.setUnitAI — G-5 ownership', () => {
    /**
     * 构造一套带记录装置的控制系统，并注册单个单位（id 1、阵营 7）。
     * @param seed 单位生成的随机种子。
     * @param failing 物理注册即失败的 id 列表。
     * @param preRegister 是否立即注册单位 1（失败路径测试传 `false`）。
     * @returns 控制系统与全部记录数组。
     */
    function setup(
        seed = 1,
        failing: readonly number[] = [],
        preRegister = true
    ) {
        const spy: IPhysicsSpy = {
            register: 0,
            remove: 0,
            force: 0,
            torque: 0,
            tick: 0,
            forces: []
        };
        const physics = new RecordingPhysicsWorld(spy, failing);
        const decisions: string[] = [];
        const creates: number[] = [];
        const destroys: number[] = [];
        const provider = new SpyProvider(
            unitId =>
                new CountingAI(`provider:${unitId}`, decisions, {
                    ...zeroAction(),
                    forceRight: 10
                }),
            unitId => creates.push(unitId),
            unitId => destroys.push(unitId)
        );
        const control = new ControlSystem(
            physics,
            new ConstantSensingWorld(50),
            provider,
            new NoopDamageSink()
        );
        if (preRegister) {
            control.registerUnit({
                unitId: 1,
                unit: makeUnit(seed),
                teamId: 7,
                x: 0,
                y: 0
            });
        }

        return { control, spy, decisions, creates, destroys };
    }
    it('consults only the replacement from the next decision tick on', () => {
        const { control, decisions } = setup();

        control.tick();
        expect(decisions).toEqual(['provider:1']);

        const replacement = new CountingAI(
            'replacement',
            decisions,
            zeroAction()
        );
        control.setUnitAI(1, replacement);
        for (let tick = 0; tick < DECISION_INTERVAL_TICKS * 2; tick += 1) {
            control.tick();
        }

        expect(decisions).toEqual(['provider:1', 'replacement', 'replacement']);
    });

    it('destroys a provider-owned predecessor exactly once on replacement', () => {
        const { control, destroys } = setup();

        control.setUnitAI(1, new CountingAI('injected', [], zeroAction()));

        expect(destroys).toEqual([1]);
    });

    it('destroys a still-installed provider-owned AI exactly once at unregisterUnit', () => {
        const { control, destroys } = setup();

        control.unregisterUnit(1);

        expect(destroys).toEqual([1]);
    });

    it('never destroys an injected instance through the provider at unregisterUnit', () => {
        const { control, destroys } = setup();
        control.setUnitAI(1, new CountingAI('injected', [], zeroAction()));

        control.unregisterUnit(1);

        expect(destroys).toEqual([1]);
    });

    it('never destroys an injected instance through the provider at dispose', () => {
        const { control, destroys } = setup();
        control.setUnitAI(1, new CountingAI('injected', [], zeroAction()));

        control.dispose();

        expect(destroys).toEqual([1]);
    });

    it('throws for an unknown id without mutating state', () => {
        const { control, decisions } = setup();

        expect(() =>
            control.setUnitAI(
                999,
                new CountingAI('ghost', decisions, zeroAction())
            )
        ).toThrow(/not registered/);

        for (let tick = 0; tick < DECISION_INTERVAL_TICKS + 1; tick += 1) {
            control.tick();
        }
        expect(decisions).toEqual(['provider:1', 'provider:1']);
        expect(control.listUnitIds()).toEqual([1]);
        expect(control.getUnit(1)).not.toBeNull();
    });

    it('performs no physics call', () => {
        const { control, spy } = setup();
        const before: IPhysicsSpy = { ...spy, forces: [...spy.forces] };

        control.setUnitAI(1, new CountingAI('injected', [], zeroAction()));

        expect(spy).toEqual(before);
    });

    it('leaves the held action untouched until the next decision tick', () => {
        const { control, spy } = setup();
        for (let tick = 0; tick < DECISION_INTERVAL_TICKS - 1; tick += 1) {
            control.tick();
        }
        expect(spy.forces.at(-1)).toEqual([1, 10, 0]);

        control.setUnitAI(
            1,
            new CountingAI('replacement', [], {
                ...zeroAction(),
                forceUp: 20
            })
        );
        control.tick();
        expect(spy.forces.at(-1)).toEqual([1, 10, 0]);

        control.tick();
        expect(spy.forces.at(-1)).toEqual([1, 0, 20]);
    });

    it('leaves registration and team lookups unchanged', () => {
        const { control } = setup();

        control.setUnitAI(1, new CountingAI('injected', [], zeroAction()));

        expect(control.listUnitIds()).toEqual([1]);
        expect(control.getTeam(1)).toBe(7);
    });

    it('destroys only the provider-owned predecessor when replaced twice in a row', () => {
        const { control, destroys, decisions } = setup();
        const first = new CountingAI('first', decisions, zeroAction());
        const second = new CountingAI('second', decisions, zeroAction());

        control.setUnitAI(1, first);
        control.setUnitAI(1, second);
        expect(destroys).toEqual([1]);

        control.tick();
        expect(decisions).toEqual(['second']);

        control.unregisterUnit(1);
        expect(destroys).toEqual([1]);
    });

    it('leaves no ownership record when physics registration fails', () => {
        const { control, destroys } = setup(2, [1], false);

        expect(() =>
            control.registerUnit({
                unitId: 1,
                unit: makeUnit(3),
                teamId: 7,
                x: 0,
                y: 0
            })
        ).toThrow('physics boom');
        expect(destroys).toEqual([1]);

        control.dispose();
        expect(destroys).toEqual([1]);
    });
});
