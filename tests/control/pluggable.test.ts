import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import type {
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitObservation
} from '@/control/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { IUnitState } from '@/physics/types';
import { spawnUnit } from '@/units/spawn';
import { ClassKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { ArenaSensingWorld } from './arena';
import { TestDamageSink } from './damage-sink';

/**
 * 恒定动作 AI：每次决策返回同一动作，用于证明 provider 是唯一的行为差异。
 */
class ConstantActionAI implements IUnitAI {
    /** 每次决策返回的动作。 */
    private readonly action: IUnitAction;

    /**
     * 构造恒定动作 AI。
     * @param action 每次决策返回的动作。
     */
    constructor(action: IUnitAction) {
        this.action = action;
    }

    decide(_observation: IUnitObservation): IUnitAction {
        return this.action;
    }
}

/**
 * 记录型 Provider：AI 工厂 + 生命周期回调，等同一个真实插拔点。
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
 * 抛错 AI：`decide` 每次都抛错，用于验证循环的插件隔离。
 */
class ThrowingAI implements IUnitAI {
    decide(_observation: IUnitObservation): IUnitAction {
        throw new Error('plugin exploded');
    }
}

/**
 * 记录型 AI：把决策转交给闭包，便于捕获快照。
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
 * 构造单轴恒力动作。
 * @param axis 施力轴：`x` 为 +x，`y` 为 +y。
 * @param magnitude 力的大小。
 * @returns 单轴恒力动作。
 */
function axisAction(axis: 'x' | 'y', magnitude: number): IUnitAction {
    return {
        ...zeroAction(),
        forceRight: axis === 'x' ? magnitude : 0,
        forceUp: axis === 'y' ? magnitude : 0
    };
}

/**
 * 生成一个可注册到真实物理世界的单位。
 * @param classKind 职业。
 * @param seed 确定性随机种子。
 * @returns 单位实例。
 */
function makeUnit(classKind: ClassKind, seed: number): IUnit {
    return spawnUnit(classKind, mulberry32(seed));
}

/**
 * 用给定 provider 构造真实物理世界 + 控制系统。
 * @param provider AI 提供者。
 * @param seed 伤害抖动随机种子。
 * @returns 真实物理世界与其控制系统。
 */
function createSetup(
    provider: IUnitAIProvider,
    seed: number
): { physics: PhysicsWorld; control: ControlSystem } {
    const world = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(seed)
    );
    const controller = new ControlSystem(
        world,
        new ArenaSensingWorld(50),
        provider,
        new TestDamageSink()
    );
    return { physics: world, control: controller };
}

/**
 * 在两个相对阵营的出生点注册一对单位。
 * @param controller 控制系统。
 * @param unitA 阵营 0 的单位。
 * @param unitB 阵营 1 的单位。
 */
function registerPair(
    controller: ControlSystem,
    unitA: IUnit,
    unitB: IUnit
): void {
    controller.registerUnit({
        unitId: 1,
        unit: unitA,
        teamId: 0,
        x: -5,
        y: 0
    });
    controller.registerUnit({ unitId: 2, unit: unitB, teamId: 1, x: 5, y: 0 });
}

/**
 * 读取运动读数，缺失时抛出（测试夹具的必备断言）。
 * @param world 物理世界。
 * @param unitId 单位 id。
 * @returns 运动读数。
 */
function requireState(world: PhysicsWorld, unitId: number): IUnitState {
    const state = world.getUnitState(unitId);
    if (state === null) {
        throw new Error(`expected unit ${unitId} to be registered`);
    }
    return state;
}

describe('ControlSystem provider pluggability', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的真实物理世界。 */
    let physics: PhysicsWorld | null = null;
    /** 当前测试持有的控制系统。 */
    let control: ControlSystem | null = null;

    afterEach(() => {
        control?.dispose();
        physics?.dispose();
        control = null;
        physics = null;
    });

    it('drives identical physics/unit setups with two different providers', () => {
        const setupA = createSetup(
            new RecordingProvider(
                () => new ConstantActionAI(axisAction('x', 500))
            ),
            101
        );
        const setupB = createSetup(
            new RecordingProvider(
                () => new ConstantActionAI(axisAction('y', 500))
            ),
            102
        );

        try {
            registerPair(
                setupA.control,
                makeUnit(ClassKind.Swordsman, 11),
                makeUnit(ClassKind.Swordsman, 12)
            );
            registerPair(
                setupB.control,
                makeUnit(ClassKind.Swordsman, 13),
                makeUnit(ClassKind.Swordsman, 14)
            );

            const startA = [
                requireState(setupA.physics, 1),
                requireState(setupA.physics, 2)
            ];
            const startB = [
                requireState(setupB.physics, 1),
                requireState(setupB.physics, 2)
            ];

            for (let tick = 0; tick < 30; tick += 1) {
                expect(() => setupA.control.tick()).not.toThrow();
                expect(() => setupB.control.tick()).not.toThrow();
            }

            for (const unitId of [1, 2]) {
                const endA = requireState(setupA.physics, unitId);
                expect(endA.x).toBeGreaterThan(startA[unitId - 1].x + 0.1);
                expect(Math.abs(endA.y - startA[unitId - 1].y)).toBeLessThan(
                    0.1
                );

                const endB = requireState(setupB.physics, unitId);
                expect(endB.y).toBeGreaterThan(startB[unitId - 1].y + 0.1);
                expect(Math.abs(endB.x - startB[unitId - 1].x)).toBeLessThan(
                    0.1
                );
            }
        } finally {
            setupA.control.dispose();
            setupA.physics.dispose();
            setupB.control.dispose();
            setupB.physics.dispose();
        }
    });

    it('creates one AI per registration and destroys each exactly once', () => {
        const created: number[] = [];
        const destroyed: number[] = [];
        const setup = createSetup(
            new RecordingProvider(
                () => new ConstantActionAI(zeroAction()),
                unitId => created.push(unitId),
                unitId => destroyed.push(unitId)
            ),
            103
        );
        physics = setup.physics;
        control = setup.control;

        registerPair(
            setup.control,
            makeUnit(ClassKind.Swordsman, 15),
            makeUnit(ClassKind.Swordsman, 16)
        );
        expect(created).toEqual([1, 2]);

        setup.control.unregisterUnit(2);
        expect(destroyed).toEqual([2]);

        setup.control.dispose();
        setup.control.dispose();

        expect(destroyed.filter(unitId => unitId === 2)).toHaveLength(1);
        expect(destroyed.filter(unitId => unitId === 1)).toHaveLength(1);
    });

    it('isolates a throwing provider and leaves a fresh loop healthy', () => {
        const setup = createSetup(
            new RecordingProvider(() => new ThrowingAI()),
            104
        );
        physics = setup.physics;
        control = setup.control;
        registerPair(
            setup.control,
            makeUnit(ClassKind.Swordsman, 17),
            makeUnit(ClassKind.Swordsman, 18)
        );

        const startOne = requireState(setup.physics, 1);
        const startTwo = requireState(setup.physics, 2);

        for (let tick = 0; tick < 30; tick += 1) {
            expect(() => setup.control.tick()).not.toThrow();
        }

        expect(requireState(setup.physics, 1).x).toBeCloseTo(startOne.x, 6);
        expect(requireState(setup.physics, 1).y).toBeCloseTo(startOne.y, 6);
        expect(requireState(setup.physics, 2).x).toBeCloseTo(startTwo.x, 6);

        const healthy = createSetup(
            new RecordingProvider(
                () => new ConstantActionAI(axisAction('y', 500))
            ),
            105
        );
        try {
            registerPair(
                healthy.control,
                makeUnit(ClassKind.Swordsman, 19),
                makeUnit(ClassKind.Swordsman, 20)
            );
            const healthyStart = requireState(healthy.physics, 1);

            for (let tick = 0; tick < 30; tick += 1) {
                healthy.control.tick();
            }

            expect(requireState(healthy.physics, 1).y).toBeGreaterThan(
                healthyStart.y + 0.1
            );
        } finally {
            healthy.control.dispose();
            healthy.physics.dispose();
        }
    });

    it('reclassifies a unit after updateTeam without re-registration', () => {
        const observations: IUnitObservation[] = [];
        const setup = createSetup(
            new RecordingProvider(
                unitId =>
                    new RecordingAI(observation => {
                        if (unitId === 1) {
                            observations.push(observation);
                        }
                        return zeroAction();
                    })
            ),
            106
        );
        physics = setup.physics;
        control = setup.control;

        setup.control.registerUnit({
            unitId: 1,
            unit: makeUnit(ClassKind.Swordsman, 21),
            teamId: 0,
            x: -5,
            y: 0
        });
        setup.control.registerUnit({
            unitId: 2,
            unit: makeUnit(ClassKind.Swordsman, 22),
            teamId: 0,
            x: 5,
            y: 0
        });
        setup.control.updateTeam(2, 1);
        expect(setup.control.getTeam(2)).toBe(1);

        setup.control.tick();

        expect(observations).toHaveLength(1);
        const observed = observations[0];
        expect(observed.enemies.map(brief => brief.unitId)).toContain(2);
        expect(observed.allies.map(brief => brief.unitId)).not.toContain(2);
    });

    it('runs the real DefaultUnitAI autonomously and closes the gap', () => {
        const setup = createSetup(
            new RecordingProvider(() => new DefaultUnitAI()),
            107
        );
        physics = setup.physics;
        control = setup.control;
        registerPair(
            setup.control,
            makeUnit(ClassKind.Swordsman, 31),
            makeUnit(ClassKind.Swordsman, 32)
        );

        const startOne = requireState(setup.physics, 1);
        const startTwo = requireState(setup.physics, 2);
        const startDistance = Math.hypot(
            startTwo.x - startOne.x,
            startTwo.y - startOne.y
        );
        let minDistance = startDistance;
        let sawMovement = false;

        for (let tick = 0; tick < 120; tick += 1) {
            const result = setup.control.tick();
            expect(Array.isArray(result.skillIntents)).toBe(true);

            const one = setup.physics.getUnitState(1);
            const two = setup.physics.getUnitState(2);
            if (one === null || two === null) {
                break;
            }
            minDistance = Math.min(
                minDistance,
                Math.hypot(two.x - one.x, two.y - one.y)
            );
            if (
                Math.abs(one.x - startOne.x) > 1e-6 ||
                Math.abs(one.y - startOne.y) > 1e-6 ||
                Math.abs(two.x - startTwo.x) > 1e-6 ||
                Math.abs(two.y - startTwo.y) > 1e-6
            ) {
                sawMovement = true;
            }
        }

        expect(startDistance).toBeCloseTo(10, 6);
        expect(sawMovement).toBe(true);
        expect(minDistance).toBeLessThan(startDistance - 1);
    });
});
