import { describe, expect, it } from 'vitest';
import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import { FIXED_DT } from '../../src/config/sim';
import { BODY_MASS, BODY_RADIUS } from '../../src/sim/content/physics';
import { EventLog } from '../../src/sim/core/events';
import { CompositeFactory } from '../../src/sim/world/composite';
import { ContactBridge } from '../../src/sim/world/contact';
import { PhysicsWorld } from '../../src/sim/world/physics-world';

/**
 * CCD（连续碰撞检测）门禁（PHYS-03 / Pitfall 4）。
 *
 * 复现研究已验证的对比：一枚高速"武器"（薄截面）对一枚**动态**薄板目标，
 * 在 240 m/s 下——
 *   - 启用 CCD：恰好 1 次命中；
 *   - 关闭 CCD：0 次命中（穿透）。
 * 并断言 `CompositeFactory` 在武器刚体上启用 CCD。
 */

/** 武器弹丸速度（m/s）——研究验证的穿透阈值之上（Pitfall 4）。 */
const CCD_PROJECTILE_SPEED = 240;

/** 薄板目标的半厚（米）：0.06 m 厚——足够薄，无 CCD 即被穿透。 */
const CCD_TARGET_HALF_THICKNESS = 0.03;

/** 弹丸起始位置 x（米）。 */
const CCD_PROJECTILE_X = -1;

/** 目标起始位置 x（米）。 */
const CCD_TARGET_X = 1;

/** 推进步数（足以跨越 2 m 间隙）。 */
const CCD_STEPS = 12;

/** 一个 CCD 对比用例。 */
interface ICcdCase {
    /** 用例名（vitest `$name` 插值）。 */
    name: string;
    /** 是否在弹丸刚体上启用 CCD。 */
    ccd: boolean;
    /** 期望命中次数。 */
    expectedHits: number;
}

/** CCD 开/关对比用例。 */
const CCD_CASES: readonly ICcdCase[] = [
    { name: 'CCD enabled', ccd: true, expectedHits: 1 },
    { name: 'CCD disabled', ccd: false, expectedHits: 0 }
];

describe('CCD sweep (PHYS-03 / Pitfall 4)', () => {
    it.each(CCD_CASES)(
        'fast weapon vs thin dynamic target — $name → $expectedHits hit(s)',
        c => {
            const physics = new PhysicsWorld(FIXED_DT);
            const world = physics.world;

            const projectile = world.createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(CCD_PROJECTILE_X, 0)
                    .setLinvel(CCD_PROJECTILE_SPEED, 0)
                    .setCcdEnabled(c.ccd)
                    .setCanSleep(false)
            );
            const projectileCol = world.createCollider(
                RAPIER.ColliderDesc.capsule(0.075, 0.075)
                    .setMass(1)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                projectile
            );

            const target = world.createRigidBody(
                RAPIER.RigidBodyDesc.dynamic()
                    .setTranslation(CCD_TARGET_X, 0)
                    .setCanSleep(false)
            );
            const targetCol = world.createCollider(
                RAPIER.ColliderDesc.cuboid(CCD_TARGET_HALF_THICKNESS, 0.5)
                    .setMass(1)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                target
            );

            let hits = 0;
            for (let t = 0; t < CCD_STEPS; t++) {
                physics.step(FIXED_DT);
                physics.eventQueue.drainCollisionEvents((h1, h2, started) => {
                    if (!started) return;
                    const pair = [h1, h2];
                    if (
                        pair.includes(projectileCol.handle) &&
                        pair.includes(targetCol.handle)
                    ) {
                        hits++;
                    }
                });
            }

            expect(hits).toBe(c.expectedHits);
        }
    );

    it('CompositeFactory enables CCD on weapon bodies (Pitfall 4)', () => {
        const physics = new PhysicsWorld(FIXED_DT);
        const events = new EventLog();
        const bridge = new ContactBridge(physics, events);
        const factory = new CompositeFactory(
            physics.world,
            (handle, ref) => bridge.register(handle, ref),
            handle => physics.unregisterPart(handle)
        );

        const unit = factory.spawn(
            {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                bodyRadius: BODY_RADIUS,
                bodyMass: BODY_MASS,
                weapons: [{ halfLen: 0.75, radius: 0.08, mass: 1.5 }],
                armors: []
            },
            1
        );

        expect(
            physics.world.getRigidBody(unit.weaponHandles[0]).isCcdEnabled()
        ).toBe(true);
    });
});
