import RAPIER from '@dimforge/rapier2d-compat';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

/**
 * Wave-0 物理测试持有的 Rapier world；在 `afterAll` 中 `free()` 释放 WASM 堆。
 */
let world: InstanceType<typeof RAPIER.World>;

/**
 * 与 `world` 配套的事件队列；同样在 `afterAll` 中 `free()`。
 */
let eventQueue: InstanceType<typeof RAPIER.EventQueue>;

describe('Rapier harness — WASM init under the Vitest worker pool', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何库方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    afterAll(() => {
        world?.free();
        eventQueue?.free();
    });

    it('loads the exact pinned engine version at runtime', () => {
        expect(RAPIER.version()).toBe('0.21.0');
    });

    it('creates a World, sets the f32 timestep, and steps a dynamic body headless', () => {
        world = new RAPIER.World({ x: 0, y: 0 });
        world.timestep = 1 / 60;
        // timestep 经 f32 往返，不能断言精确相等。
        expect(world.timestep).toBeCloseTo(1 / 60, 5);

        const body = world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0)
        );
        world.createCollider(
            RAPIER.ColliderDesc.ball(0.5)
                .setMass(1)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body
        );

        eventQueue = new RAPIER.EventQueue(true);
        world.step(eventQueue);

        const translation = body.translation();
        expect(Number.isFinite(translation.x)).toBe(true);
        expect(Number.isFinite(translation.y)).toBe(true);
    });
});
