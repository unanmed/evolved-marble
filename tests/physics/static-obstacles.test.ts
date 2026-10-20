import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import type {
    IStaticObstacleSpec,
    IStaticObstacleWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { mulberry32 } from '../helpers/rng';

describe('PhysicsWorld — static obstacles (G-2)', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    /** 当前测试持有的物理世界；在每个测试的 `afterEach` 中释放 WASM 资源。 */
    let world: PhysicsWorld | null = null;

    afterEach(() => {
        world?.dispose();
        world = null;
    });

    /**
     * 构造一个可复现的物理世界（固定种子注入 mulberry32）。
     * @returns 新的 `PhysicsWorld`。
     */
    function createWorld(): PhysicsWorld {
        return new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(777)
        );
    }

    /**
     * 构造一个裸装单位的注册输入（无武器、无防具）。
     * @param unitId 单位 id。
     * @param x 生成位置 x。
     * @param y 生成位置 y。
     * @returns 注册输入。
     */
    function makeSpec(unitId: number, x: number, y: number): IUnitPhysicsSpec {
        return {
            unitId,
            x,
            y,
            mass: 70,
            attack: 60,
            weaponRatio: 1,
            defense: 24,
            armorRatio: 0.8,
            weapon: null,
            armors: []
        };
    }

    /**
     * 读取单位状态，未知 id 直接抛错以便测试断言处收窄类型。
     * @param w 物理世界。
     * @param unitId 单位 id。
     * @returns 该单位的运动学读数。
     */
    function stateOf(w: PhysicsWorld, unitId: number): IUnitState {
        const state = w.getUnitState(unitId);
        if (state === null) {
            throw new Error(`expected unit ${unitId} to be registered`);
        }
        return state;
    }

    /**
     * 构造一面沿 y 轴延伸的竖直墙（中心 x、半宽 0.5、半高 5）。
     * @param centerX 墙体中心的 x 坐标。
     * @returns 障碍规格。
     */
    function wall(centerX: number): IStaticObstacleSpec {
        return {
            x: centerX,
            y: 0,
            halfWidth: 0.5,
            halfHeight: 5
        };
    }

    it('blocks a forced unit before the wall and emits no contact or damage events', () => {
        const w = createWorld();
        world = w;
        const obstacles: IStaticObstacleWorld = w;
        w.registerUnit(makeSpec(1, 0, 0));
        // 墙左面位于 x = 4.0，本体半径 0.5 → 单位应停在 x ≈ 3.5。
        obstacles.addStaticObstacle(wall(4.5));

        const results = [];
        for (let step = 0; step < 180; step += 1) {
            w.applyForce(1, 5000, 0);
            results.push(w.tick());
        }

        const state = stateOf(w, 1);
        expect(state.x).toBeGreaterThan(3.0);
        expect(state.x).toBeLessThan(3.5 + 0.1);
        expect(
            results.every(
                result =>
                    result.contacts.length === 0 && result.damages.length === 0
            )
        ).toBe(true);
    });

    it('returns strictly increasing integer ids for successive obstacles', () => {
        const w = createWorld();
        world = w;

        const first = w.addStaticObstacle(wall(4.5));
        const second = w.addStaticObstacle(wall(-4.5));
        const third = w.addStaticObstacle(wall(9.5));

        expect(Number.isInteger(first)).toBe(true);
        expect(Number.isInteger(second)).toBe(true);
        expect(second).toBeGreaterThan(first);
        expect(third).toBeGreaterThan(second);
    });

    it('treats removal of an unknown id as a no-op and keeps the world usable', () => {
        const w = createWorld();
        world = w;
        w.addStaticObstacle(wall(4.5));
        w.registerUnit(makeSpec(1, 0, 0));

        expect(() => w.removeStaticObstacle(9999)).not.toThrow();

        w.applyForce(1, 60, 0);
        expect(() => w.tick()).not.toThrow();
        expect(stateOf(w, 1).x).toBeGreaterThan(0);
    });

    it('lets the same unit pass the former wall position after removal', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(makeSpec(1, 0, 0));
        const obstacleId = w.addStaticObstacle(wall(4.5));

        for (let step = 0; step < 180; step += 1) {
            w.applyForce(1, 5000, 0);
            w.tick();
        }
        expect(stateOf(w, 1).x).toBeLessThan(3.5 + 0.1);

        w.removeStaticObstacle(obstacleId);
        for (let step = 0; step < 60; step += 1) {
            w.applyForce(1, 5000, 0);
            w.tick();
        }

        expect(stateOf(w, 1).x).toBeGreaterThan(4.6);
    });

    it('rejects invalid specs before any world mutation and stays usable', () => {
        const w = createWorld();
        world = w;

        const invalid: IStaticObstacleSpec[] = [
            { x: NaN, y: 0, halfWidth: 0.5, halfHeight: 5 },
            { x: 0, y: Infinity, halfWidth: 0.5, halfHeight: 5 },
            { x: 0, y: 0, halfWidth: 0, halfHeight: 5 },
            { x: 0, y: 0, halfWidth: 0.5, halfHeight: -1 }
        ];
        for (const spec of invalid) {
            expect(() => w.addStaticObstacle(spec)).toThrow();
        }

        // 无效规格绝不消耗 id，也不留下半成品刚体。
        expect(w.addStaticObstacle(wall(4.5))).toBe(1);
        w.registerUnit(makeSpec(1, 0, 0));
        w.applyForce(1, 60, 0);
        expect(() => w.tick()).not.toThrow();
    });

    it('dispose stays idempotent after obstacles were added', () => {
        const w = createWorld();
        world = w;
        w.addStaticObstacle(wall(4.5));
        w.registerUnit(makeSpec(1, 0, 0));

        expect(() => w.dispose()).not.toThrow();
        expect(() => w.dispose()).not.toThrow();
    });
});
