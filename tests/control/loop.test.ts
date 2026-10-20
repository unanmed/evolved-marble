import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import { RAY_COUNT } from '@/control/constants';
import type {
    IDamageContext,
    IDamageSink,
    ISensedUnit,
    ISensingWorld,
    IUnitAction,
    IUnitAI,
    IUnitAIProvider,
    IUnitObservation,
    IProjectileSighting
} from '@/control/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import type { IUnitState } from '@/physics/types';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

/**
 * 测试用感知世界：矩形边界 + 敌方遮挡圆 + 空射弹（Phase 3 不填充射弹）。
 */
class TracerSensingWorld implements ISensingWorld {
    /** 竞技场半边长（米）。 */
    private readonly halfExtent: number;

    /**
     * 构造竞技场。
     * @param halfExtent 半边长（米）。
     */
    constructor(halfExtent: number) {
        this.halfExtent = halfExtent;
    }

    /**
     * 投射 64 条世界坐标固定方向射线，返回最近命中距离。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param maxDistance 最远距离。
     * @param blockers 敌方遮挡圆。
     * @returns 每条射线的最短距离。
     */
    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[] {
        const distances: number[] = [];
        const step = (Math.PI * 2) / RAY_COUNT;
        for (let index = 0; index < RAY_COUNT; index += 1) {
            const angle = index * step;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            let nearest = this.rayBoundaryDistance(originX, originY, dx, dy);
            for (const blocker of blockers) {
                const hit = this.rayCircleDistance(
                    originX,
                    originY,
                    dx,
                    dy,
                    blocker.x,
                    blocker.y,
                    blocker.radius
                );
                if (hit < nearest) {
                    nearest = hit;
                }
            }
            const bounded = Math.min(nearest, maxDistance);
            distances.push(
                Number.isFinite(bounded) ? Math.max(0, bounded) : maxDistance
            );
        }
        return distances;
    }

    /**
     * Phase 3 恒返回空射弹列表（D-04）。
     * @returns 空数组。
     */
    queryProjectiles(): readonly IProjectileSighting[] {
        return [];
    }

    /**
     * 射线与轴对齐边界矩形的最近正向交点（slab 法）。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @returns 最近正向距离；无命中返回 `Infinity`。
     */
    private rayBoundaryDistance(
        originX: number,
        originY: number,
        dx: number,
        dy: number
    ): number {
        const slab = (origin: number, direction: number): [number, number] => {
            if (Math.abs(direction) < 1e-12) {
                const outside =
                    origin < -this.halfExtent || origin > this.halfExtent;
                return outside ? [Infinity, -Infinity] : [-Infinity, Infinity];
            }
            const first = (-this.halfExtent - origin) / direction;
            const second = (this.halfExtent - origin) / direction;
            return first < second ? [first, second] : [second, first];
        };

        const [xEnter, xExit] = slab(originX, dx);
        const [yEnter, yExit] = slab(originY, dy);
        const enter = Math.max(xEnter, yEnter);
        const exit = Math.min(xExit, yExit);
        if (exit < 0 || enter > exit) {
            return Infinity;
        }
        return enter >= 0 ? enter : exit;
    }

    /**
     * 射线与圆（单位本体）的最近正向交点。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @param centerX 圆心 x。
     * @param centerY 圆心 y。
     * @param radius 圆半径。
     * @returns 最近正向距离；无命中返回 `Infinity`。
     */
    private rayCircleDistance(
        originX: number,
        originY: number,
        dx: number,
        dy: number,
        centerX: number,
        centerY: number,
        radius: number
    ): number {
        const relX = originX - centerX;
        const relY = originY - centerY;
        const b = 2 * (relX * dx + relY * dy);
        const c = relX * relX + relY * relY - radius * radius;
        const discriminant = b * b - 4 * c;
        if (discriminant < 0) {
            return Infinity;
        }
        const root = Math.sqrt(discriminant);
        const first = (-b - root) / 2;
        if (first >= 0) {
            return first;
        }
        const second = (-b + root) / 2;
        return second >= 0 ? 0 : Infinity;
    }
}

/**
 * 记录型 Provider：包装 `DefaultUnitAI`，通过回调记录创建与决策，不暴露额外公共成员。
 */
class TracerProvider implements IUnitAIProvider {
    /** 创建单位 AI 时回调。 */
    private readonly onCreate: (unitId: number) => void;
    /** 每次决策时回调。 */
    private readonly onDecide: (observation: IUnitObservation) => void;

    /**
     * 构造 Provider。
     * @param onCreate 创建回调。
     * @param onDecide 决策回调。
     */
    constructor(
        onCreate: (unitId: number) => void,
        onDecide: (observation: IUnitObservation) => void
    ) {
        this.onCreate = onCreate;
        this.onDecide = onDecide;
    }

    /**
     * 为一个单位创建默认 AI。
     * @param unitId 单位 id。
     * @param _unit 单位实例（此处不使用）。
     * @returns AI 实例。
     */
    create(unitId: number, _unit: IUnit): IUnitAI {
        this.onCreate(unitId);
        const ai = new DefaultUnitAI();
        return {
            decide: (observation: IUnitObservation): IUnitAction => {
                this.onDecide(observation);
                return ai.decide(observation);
            }
        };
    }

    /**
     * 释放单位 AI（无内部状态）。
     * @param _unitId 单位 id。
     */
    destroy(_unitId: number): void {
        // 默认 AI 无状态，无需清理。
    }
}

/**
 * 测试伤害接收方：同队免伤 + 存活守卫 + 伤害/经验 + 击杀经验；绝不触碰物理。
 */
class TracerDamageSink implements IDamageSink {
    /** 成功应用一条伤害时回调。 */
    private readonly onApplied: (context: IDamageContext) => void;

    /**
     * 构造接收方。
     * @param onApplied 应用回调。
     */
    constructor(onApplied: (context: IDamageContext) => void) {
        this.onApplied = onApplied;
    }

    /**
     * 应用一条已解析伤害。
     * @param context 已解析的伤害上下文。
     */
    applyDamage(context: IDamageContext): void {
        if (context.attackerTeamId === context.defenderTeamId) {
            return;
        }
        if (!context.defender.isAlive()) {
            return;
        }
        const wasAlive = context.defender.isAlive();
        context.defender.takeDamage(context.event.damage);
        context.attacker.gainAttackExperience(context.event.damage);
        context.defender.gainDefenseExperience(context.event.damageReduced);
        if (wasAlive && !context.defender.isAlive()) {
            context.attacker.gainKillExperience(
                context.defender.getAttribute(AttributeKind.Level)
            );
        }
        this.onApplied(context);
    }
}

describe('ControlSystem — end-to-end autonomous tracer', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的物理世界。 */
    let physics: PhysicsWorld | null = null;
    /** 当前测试持有的控制系统。 */
    let control: ControlSystem | null = null;

    afterEach(() => {
        control?.dispose();
        physics?.dispose();
        control = null;
        physics = null;
    });

    it('decides, applies forces, steps physics, and routes a damage event to the sink', () => {
        const world = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(20261020)
        );
        physics = world;

        const createdIds: number[] = [];
        const decidedTicks: number[] = [];
        const applied: IDamageContext[] = [];
        const provider = new TracerProvider(
            unitId => createdIds.push(unitId),
            observation => decidedTicks.push(observation.tick)
        );
        const sink = new TracerDamageSink(context => applied.push(context));
        const controller = new ControlSystem(
            world,
            new TracerSensingWorld(50),
            provider,
            sink
        );
        control = controller;

        const first = spawnUnit(ClassKind.Swordsman, mulberry32(11));
        const second = spawnUnit(ClassKind.Swordsman, mulberry32(12));
        controller.registerUnit({
            unitId: 1,
            unit: first,
            teamId: 1,
            x: -0.8,
            y: 0
        });
        controller.registerUnit({
            unitId: 2,
            unit: second,
            teamId: 2,
            x: 0.8,
            y: 0
        });

        expect(createdIds).toEqual([1, 2]);
        expect(controller.listUnitIds()).toEqual([1, 2]);

        const startOne = world.getUnitState(1) as IUnitState;
        const startTwo = world.getUnitState(2) as IUnitState;
        let sawMovement = false;

        for (let tick = 0; tick < 300; tick += 1) {
            const result = controller.tick();
            expect(Array.isArray(result.skillIntents)).toBe(true);

            const one = world.getUnitState(1);
            if (one !== null) {
                if (
                    Math.abs(one.x - startOne.x) > 1e-6 ||
                    Math.abs(one.y - startOne.y) > 1e-6
                ) {
                    sawMovement = true;
                }
            }
            const two = world.getUnitState(2);
            if (two !== null) {
                if (
                    Math.abs(two.x - startTwo.x) > 1e-6 ||
                    Math.abs(two.y - startTwo.y) > 1e-6
                ) {
                    sawMovement = true;
                }
            }

            if (applied.length > 0) {
                break;
            }
        }

        // 第一次决策发生在绝对 tick 0（6-tick 节奏）。
        expect(decidedTicks[0]).toBe(0);
        // 至少一个单位在物理世界中被力推动。
        expect(sawMovement).toBe(true);
        // 至少一条伤害上下文经控制层路由到注入的 sink。
        expect(applied.length).toBeGreaterThan(0);
        expect(applied[0].attackerTeamId).not.toBe(applied[0].defenderTeamId);
    });
});
