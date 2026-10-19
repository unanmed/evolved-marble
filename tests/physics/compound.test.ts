import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { ARMOR_DEFS, WEAPON_DEFS } from '@/units/data';
import { ArmorKind, WeaponKind } from '@/units/types';
import type { IArmorDef, IWeaponDef } from '@/units/types';
import type { IUnitPhysicsSpec, IUnitState } from '@/physics/types';
import { mulberry32 } from '../helpers/rng';

describe('PhysicsWorld — compound body, lifecycle, state, fixed-step advance', () => {
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
            mulberry32(1234)
        );
    }

    /**
     * 构造一个数值型注册输入（本体质量 70，无单位类引用，D-07）。
     * @param unitId 单位 id。
     * @param x 生成位置 x。
     * @param y 生成位置 y。
     * @param weapon 武器定义或 `null`。
     * @param armors 防具定义数组。
     * @returns 注册输入。
     */
    function makeSpec(
        unitId: number,
        x: number,
        y: number,
        weapon: IWeaponDef | null,
        armors: readonly IArmorDef[]
    ): IUnitPhysicsSpec {
        return {
            unitId,
            x,
            y,
            mass: 70,
            attack: 60,
            weaponRatio: 1,
            defense: 24,
            armorRatio: 0.8,
            weapon,
            armors
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

    it('registers a unit, reports hasUnit, and reads finite spawn state (unknown id → null)', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(makeSpec(1, 2, 3, null, []));

        expect(w.hasUnit(1)).toBe(true);
        expect(w.hasUnit(404)).toBe(false);

        const state = stateOf(w, 1);
        expect(Number.isFinite(state.x)).toBe(true);
        expect(Number.isFinite(state.y)).toBe(true);
        expect(Number.isFinite(state.angle)).toBe(true);
        expect(Number.isFinite(state.vx)).toBe(true);
        expect(Number.isFinite(state.vy)).toBe(true);
        expect(Number.isFinite(state.angularVelocity)).toBe(true);
        expect(state.x).toBeCloseTo(2, 4);
        expect(state.y).toBeCloseTo(3, 4);

        expect(w.getUnitState(404)).toBeNull();
    });

    it('sums per-collider masses: the equipped unit accelerates less under the same force', () => {
        const w = createWorld();
        world = w;
        // 裸装：本体质量 70；全装：本体 70 + 锤子 25 + 头盔 8 = 103。
        w.registerUnit(makeSpec(1, 0, 0, null, []));
        w.registerUnit(
            makeSpec(2, 100, 0, WEAPON_DEFS[WeaponKind.Hammer], [
                ARMOR_DEFS[ArmorKind.Helmet]
            ])
        );

        const force = 60;
        w.applyForce(1, force, 0);
        w.applyForce(2, force, 0);
        w.tick();

        const bare = stateOf(w, 1);
        const armed = stateOf(w, 2);

        expect(Number.isFinite(bare.vx)).toBe(true);
        expect(Number.isFinite(armed.vx)).toBe(true);
        expect(bare.vx).toBeGreaterThan(0);
        expect(armed.vx).toBeGreaterThan(0);
        // 相同力、相同时长：更重（多装备）的单位获得更小的速度。
        expect(Math.abs(bare.vx)).toBeGreaterThan(Math.abs(armed.vx));
        // 裸装速度 ≈ F / m · dt（松容差，f32 求解器噪声）。
        expect(bare.vx).toBeCloseTo((force / 70) * DT, 3);
    });

    it('removeUnit purges state + handle index, so re-registration at a new position is clean', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(makeSpec(7, 1, 1, null, []));
        expect(w.hasUnit(7)).toBe(true);

        w.removeUnit(7);
        expect(w.hasUnit(7)).toBe(false);
        expect(w.getUnitState(7)).toBeNull();

        // 同一 id 在别处重新注册：不得残留旧映射（handle 复用风险，Pitfall 3）。
        w.registerUnit(
            makeSpec(7, 5, 6, WEAPON_DEFS[WeaponKind.Longsword], [])
        );
        expect(w.hasUnit(7)).toBe(true);
        const state = stateOf(w, 7);
        expect(state.x).toBeCloseTo(5, 4);
        expect(state.y).toBeCloseTo(6, 4);
    });

    it('tick advances exactly one fixed step: still without force, tiny move with force, then monotonic', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(makeSpec(1, 0, 0, null, []));

        // 零重力、无力：多步之后仍原地不动。
        for (let i = 0; i < 5; i++) {
            w.tick();
        }
        const still = stateOf(w, 1);
        expect(still.x).toBeCloseTo(0, 5);
        expect(still.y).toBeCloseTo(0, 5);

        // 单次施加力 → 恰好一步推进一小段有限位移。
        w.applyForce(1, 60, 0);
        w.tick();
        const moved = stateOf(w, 1);
        expect(moved.x).toBeGreaterThan(0);
        expect(moved.x).toBeLessThan(0.1);

        // 连续每步施力：位移单调递增（无 wall-clock 输入）。
        let prev = moved.x;
        for (let i = 0; i < 10; i++) {
            w.applyForce(1, 60, 0);
            w.tick();
            const s = stateOf(w, 1);
            expect(s.x).toBeGreaterThan(prev);
            prev = s.x;
        }
    });
});
