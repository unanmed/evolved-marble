import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { ColliderPart } from '@/physics/types';
import type { IDamageEvent, IUnitPhysicsSpec } from '@/physics/types';
import { WEAPON_DEFS } from '@/units/data';
import { WeaponKind } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

describe('PhysicsWorld — rotating body Δv about the centre of mass', () => {
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
     * 计算接触点相对速度在接触法向上的绝对值。
     * 接触点速度 = 旋转中心速度 + `ω×r`（2D：`(-ω·ry, ω·rx)`），`r` 从给定中心量起。
     * @param attackerCenter 攻方旋转中心（世界系）。
     * @param defenderCenter 守方旋转中心（世界系）。
     * @param attackerVelocity 攻方步进前速度快照。
     * @param defenderVelocity 守方步进前速度快照。
     * @param contact 世界系接触法向与接触点。
     * @returns 法向投影后的速度差绝对值。
     */
    function contactPointDeltaV(
        attackerCenter: { x: number; y: number },
        defenderCenter: { x: number; y: number },
        attackerVelocity: { vx: number; vy: number; omega: number },
        defenderVelocity: { vx: number; vy: number; omega: number },
        contact: { nx: number; ny: number; x: number; y: number }
    ): number {
        const attackerRx = contact.x - attackerCenter.x;
        const attackerRy = contact.y - attackerCenter.y;
        const defenderRx = contact.x - defenderCenter.x;
        const defenderRy = contact.y - defenderCenter.y;
        const attackerVx =
            attackerVelocity.vx - attackerVelocity.omega * attackerRy;
        const attackerVy =
            attackerVelocity.vy + attackerVelocity.omega * attackerRx;
        const defenderVx =
            defenderVelocity.vx - defenderVelocity.omega * defenderRy;
        const defenderVy =
            defenderVelocity.vy + defenderVelocity.omega * defenderRx;
        return Math.abs(
            (attackerVx - defenderVx) * contact.nx +
                (attackerVy - defenderVy) * contact.ny
        );
    }

    it('pins the COM-based Δv and rejects the rigid-body-origin value', () => {
        const physics = new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(20261019)
        );
        world = physics;

        // IPhysicsWorld 不暴露 Rapier world；临时包裹 createRigidBody 捕获其 `this`。
        const worldHolder: {
            value: InstanceType<typeof RAPIER.World> | null;
        } = { value: null };
        const originalCreateRigidBody = RAPIER.World.prototype.createRigidBody;
        RAPIER.World.prototype.createRigidBody = function (
            this: InstanceType<typeof RAPIER.World>,
            body: Parameters<typeof originalCreateRigidBody>[0]
        ): ReturnType<typeof originalCreateRigidBody> {
            worldHolder.value = this;
            return originalCreateRigidBody.call(this, body);
        };

        try {
            const attackerId = 1;
            const defenderId = 2;
            const shared = {
                mass: 70,
                attack: 60,
                weaponRatio: 1,
                defense: 24,
                armorRatio: 0.8
            };
            const attackerSpec: IUnitPhysicsSpec = {
                ...shared,
                unitId: attackerId,
                x: 0,
                y: 0,
                weapon: WEAPON_DEFS[WeaponKind.Hammer],
                armors: []
            };
            const defenderSpec: IUnitPhysicsSpec = {
                ...shared,
                unitId: defenderId,
                x: 3,
                y: 0,
                weapon: null,
                armors: []
            };
            physics.registerUnit(attackerSpec);
            physics.registerUnit(defenderSpec);

            const rapierWorld = worldHolder.value;
            if (rapierWorld === null) {
                throw new Error('failed to capture the Rapier world instance');
            }

            const colliders = rapierWorld.colliders.getAll();
            const weaponCollider =
                colliders.find(
                    collider =>
                        collider.shapeType() === RAPIER.ShapeType.Capsule
                ) ?? null;
            if (weaponCollider === null) {
                throw new Error('expected exactly one capsule weapon collider');
            }
            const attackerBody = weaponCollider.parent();
            if (attackerBody === null) {
                throw new Error(
                    'expected the weapon capsule to have a parent body'
                );
            }
            const defenderCollider =
                colliders.find(
                    collider =>
                        collider.shapeType() === RAPIER.ShapeType.Ball &&
                        collider.parent()?.handle !== attackerBody.handle
                ) ?? null;
            if (defenderCollider === null) {
                throw new Error('expected a defender body collider');
            }
            const defenderBody = defenderCollider.parent();
            if (defenderBody === null) {
                throw new Error(
                    'expected the defender collider to have a parent body'
                );
            }

            // 命中步的窄相流形只能在 tick() 后读取；闭包内复制分量（manifold 是临时对象）。
            const contactHolder: {
                value: {
                    nx: number;
                    ny: number;
                    x: number;
                    y: number;
                } | null;
            } = { value: null };
            /**
             * 读取本步捕获的接触数据：闭包内对 holder 的赋值不被 TS 控制流追踪，
             * 故经函数读取以免后续读取被错误收窄为 `null`。
             * @returns 世界系接触法向与接触点；尚未捕获时为 `null`。
             */
            function readCapturedContact(): {
                nx: number;
                ny: number;
                x: number;
                y: number;
            } | null {
                return contactHolder.value;
            }
            let hit = false;

            for (let step = 0; step < 120 && !hit; step++) {
                physics.applyForce(attackerId, 3000, 0);
                physics.applyTorque(attackerId, 4000);

                // 步进前速度快照：与 PhysicsWorld.tick() 的 #preVelocities 同源。
                const preAttackerLinvel = attackerBody.linvel();
                const preAttackerVx = preAttackerLinvel.x;
                const preAttackerVy = preAttackerLinvel.y;
                const preAttackerOmega = attackerBody.angvel();
                const preDefenderLinvel = defenderBody.linvel();
                const preDefenderVx = preDefenderLinvel.x;
                const preDefenderVy = preDefenderLinvel.y;
                const preDefenderOmega = defenderBody.angvel();

                const result = physics.tick();
                const event: IDamageEvent | undefined = result.damages.find(
                    damage =>
                        damage.attackerId === attackerId &&
                        damage.defenderId === defenderId
                );
                if (event === undefined) {
                    continue;
                }

                contactHolder.value = null;
                rapierWorld.contactPair(
                    weaponCollider,
                    defenderCollider,
                    manifold => {
                        if (contactHolder.value !== null) {
                            return;
                        }
                        if (manifold.numSolverContacts() === 0) {
                            return;
                        }
                        const point = manifold.solverContactPoint(0);
                        if (point === null) {
                            return;
                        }
                        const normal = manifold.normal();
                        contactHolder.value = {
                            nx: normal.x,
                            ny: normal.y,
                            x: point.x,
                            y: point.y
                        };
                    }
                );
                const contact = readCapturedContact();
                if (contact === null) {
                    throw new Error(
                        'damage tick produced no usable solver contact manifold'
                    );
                }

                const attackerVelocity = {
                    vx: preAttackerVx,
                    vy: preAttackerVy,
                    omega: preAttackerOmega
                };
                const defenderVelocity = {
                    vx: preDefenderVx,
                    vy: preDefenderVy,
                    omega: preDefenderOmega
                };
                const comDeltaV = contactPointDeltaV(
                    attackerBody.worldCom(),
                    defenderBody.worldCom(),
                    attackerVelocity,
                    defenderVelocity,
                    contact
                );
                const originDeltaV = contactPointDeltaV(
                    attackerBody.translation(),
                    defenderBody.translation(),
                    attackerVelocity,
                    defenderVelocity,
                    contact
                );

                // 攻方确实高速旋转；两种旋转中心的投影必须可区分。
                expect(Math.abs(preAttackerOmega)).toBeGreaterThan(5);
                expect(Math.abs(comDeltaV - originDeltaV)).toBeGreaterThan(0.5);
                // 发出的 Δv 必须是 COM 参考值，且明显偏离刚体原点参考值。
                expect(event.deltaV).toBeCloseTo(comDeltaV, 3);
                expect(Math.abs(event.deltaV - originDeltaV)).toBeGreaterThan(
                    0.5
                );

                // 独立验算：把步进前速度写回刚体，由 Rapier 的 velocityAtPoint 作裁判。
                attackerBody.setLinvel(
                    { x: preAttackerVx, y: preAttackerVy },
                    false
                );
                attackerBody.setAngvel(preAttackerOmega, false);
                defenderBody.setLinvel(
                    { x: preDefenderVx, y: preDefenderVy },
                    false
                );
                defenderBody.setAngvel(preDefenderOmega, false);
                const attackerPoint = attackerBody.velocityAtPoint({
                    x: contact.x,
                    y: contact.y
                });
                const defenderPoint = defenderBody.velocityAtPoint({
                    x: contact.x,
                    y: contact.y
                });
                const oracleDeltaV = Math.abs(
                    (attackerPoint.x - defenderPoint.x) * contact.nx +
                        (attackerPoint.y - defenderPoint.y) * contact.ny
                );
                expect(oracleDeltaV).toBeCloseTo(comDeltaV, 6);
                expect(oracleDeltaV).toBeCloseTo(event.deltaV, 3);

                // 事件语义保持不变：武器命中本体、无减伤、数值有限且非负。
                expect(event.attackerPart).toBe(ColliderPart.Weapon);
                expect(event.defenderPart).toBe(ColliderPart.Body);
                expect(event.damageReduced).toBe(0);
                expect(event.armorKind).toBeUndefined();
                expect(Number.isFinite(event.deltaV)).toBe(true);
                expect(event.deltaV).toBeGreaterThanOrEqual(0);
                expect(Number.isFinite(event.damageMean)).toBe(true);
                expect(event.damageMean).toBeGreaterThanOrEqual(0);
                expect(Number.isFinite(event.damage)).toBe(true);
                expect(event.damage).toBeGreaterThanOrEqual(0);

                hit = true;
            }

            expect(hit).toBe(true);
        } finally {
            RAPIER.World.prototype.createRigidBody = originalCreateRigidBody;
        }
    });
});
