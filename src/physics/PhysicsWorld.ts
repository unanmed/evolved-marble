/**
 * 物理世界：`class PhysicsWorld implements IPhysicsWorld`（D-07）。
 * 拥有一个 Rapier `World` 与一个 `EventQueue`，按 `unitId` 注册单位（每个单位 =
 * 一个复合刚体：本体 / 武器 / 防具各一个碰撞体，固定局部偏移、逐 collider 设质量，D-03/D-05），
 * 并用「碰撞体 handle → 部位标签」映射承载部位标识（D-04）。
 * `tick()` 把本步的 `started` 碰撞转为带部位标记的接触事件，并对可产生伤害的
 * 配对（恰有一侧为武器：武器↔本体 / 武器↔防具）计算并发出带**最终数值**的伤害事件（D-08/D-09/D-14）。
 *
 * 前置条件：调用方**必须**先 `await RAPIER.init()` 再构造本类（research Pitfall 1）。
 * 物理层只持有 id 与数值，不拥有、不引用 `Unit`（D-07）。
 */

import RAPIER from '@dimforge/rapier2d-compat';
import { ColliderPart } from '@/physics/types';
import type {
    IContactEvent,
    IDamageEvent,
    IPhysicsConfig,
    IPhysicsTickResult,
    IPhysicsWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import {
    computeDamageMean,
    computeDamageReduction,
    isDamageBearingPair,
    rollDamage
} from '@/physics/damage';
import type { ArmorKind, WeaponKind } from '@/units/types';
import type { IRng } from '@/common/types';

/**
 * 复合刚体：`class PhysicsWorld implements IPhysicsWorld`。
 */
export class PhysicsWorld implements IPhysicsWorld {
    /** 构造参数（固定步长与几何尺寸，D-06/D-10）。 */
    readonly #config: IPhysicsConfig;
    /** 本世界拥有的 Rapier 世界；`dispose()` 时释放。 */
    readonly #world: InstanceType<typeof RAPIER.World>;
    /** 本世界拥有的碰撞事件队列；`dispose()` 时释放（research Pitfall 12）。 */
    readonly #eventQueue: InstanceType<typeof RAPIER.EventQueue>;
    /** 注入的随机源：伤害抖动的唯一来源（`rollDamage` 经 `sampleNormal` 消费，D-08/AGENTS §9）。 */
    readonly #rng: IRng;
    /** unitId → 该单位的复合刚体。 */
    #bodies = new Map<number, InstanceType<typeof RAPIER.RigidBody>>();
    /** unitId → 注册时保留的数值（伤害计算所需的攻击/防御/装备数值，plan 02-06）。 */
    #specs = new Map<number, IUnitPhysicsSpec>();
    /** unitId → 该单位的全部碰撞体（用于移除时清空 handle 索引）。 */
    #colliders = new Map<number, InstanceType<typeof RAPIER.Collider>[]>();
    /**
     * 碰撞体 handle → 部位标签（D-04）：记载该 handle 所属单位、部位，
     * 及武器/防具种类（用于破甲查表，D-13/OQ-4）。
     */
    #index = new Map<
        number,
        {
            unitId: number;
            part: ColliderPart;
            weaponKind?: WeaponKind;
            armorKind?: ArmorKind;
        }
    >();
    /** unitId → 步进**前**线速度快照：Δv 的唯一来源（D-08；绝不用步进后速度，research Pitfall 6）。 */
    #preVelocities = new Map<number, { vx: number; vy: number }>();

    /**
     * 构造物理世界。
     * @param config 固定步长与几何尺寸。
     * @param rng 注入的随机源，供伤害抖动管线（`rollDamage`）消费。
     */
    constructor(config: IPhysicsConfig, rng: IRng) {
        this.#config = config;
        this.#world = new RAPIER.World({ x: 0, y: 0 });
        this.#eventQueue = new RAPIER.EventQueue(true);
        this.#world.timestep = config.dt;
        this.#rng = rng;
    }

    registerUnit(spec: IUnitPhysicsSpec): void {
        if (this.#bodies.has(spec.unitId)) {
            throw new Error(
                `PhysicsWorld.registerUnit: unit ${spec.unitId} is already registered`
            );
        }
        const geometry = this.#config.geometry;
        const body = this.#world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic().setTranslation(spec.x, spec.y)
        );
        const colliders: InstanceType<typeof RAPIER.Collider>[] = [];

        const bodyCollider = this.#world.createCollider(
            RAPIER.ColliderDesc.ball(geometry.bodyRadius)
                .setMass(spec.mass)
                .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
            body
        );
        colliders.push(bodyCollider);
        this.#index.set(bodyCollider.handle, {
            unitId: spec.unitId,
            part: ColliderPart.Body
        });

        if (spec.weapon !== null) {
            const weaponCollider = this.#world.createCollider(
                RAPIER.ColliderDesc.capsule(
                    geometry.weaponHalfLength,
                    geometry.weaponRadius
                )
                    .setTranslation(geometry.weaponOffsetX, 0)
                    .setMass(spec.weapon.mass)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                body
            );
            colliders.push(weaponCollider);
            this.#index.set(weaponCollider.handle, {
                unitId: spec.unitId,
                part: ColliderPart.Weapon,
                weaponKind: spec.weapon.id
            });
        }

        for (const armor of spec.armors) {
            const armorCollider = this.#world.createCollider(
                RAPIER.ColliderDesc.ball(geometry.armorRadius)
                    .setMass(armor.mass)
                    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
                body
            );
            colliders.push(armorCollider);
            this.#index.set(armorCollider.handle, {
                unitId: spec.unitId,
                part: ColliderPart.Armor,
                armorKind: armor.id
            });
        }

        this.#bodies.set(spec.unitId, body);
        this.#specs.set(spec.unitId, spec);
        this.#colliders.set(spec.unitId, colliders);
    }

    removeUnit(unitId: number): void {
        const body = this.#bodies.get(unitId);
        if (body === undefined) {
            return;
        }
        const colliders = this.#colliders.get(unitId) ?? [];
        for (const collider of colliders) {
            this.#index.delete(collider.handle);
        }
        this.#world.removeRigidBody(body);
        this.#bodies.delete(unitId);
        this.#specs.delete(unitId);
        this.#colliders.delete(unitId);
        this.#preVelocities.delete(unitId);
    }

    hasUnit(unitId: number): boolean {
        return this.#bodies.has(unitId);
    }

    applyForce(unitId: number, forceX: number, forceY: number): void {
        const body = this.#bodies.get(unitId);
        if (body === undefined) {
            return;
        }
        body.addForce({ x: forceX, y: forceY }, true);
    }

    applyTorque(unitId: number, torque: number): void {
        const body = this.#bodies.get(unitId);
        if (body === undefined) {
            return;
        }
        body.addTorque(torque, true);
    }

    getUnitState(unitId: number): IUnitState | null {
        const body = this.#bodies.get(unitId);
        if (body === undefined) {
            return null;
        }
        const translation = body.translation();
        const velocity = body.linvel();
        return {
            x: translation.x,
            y: translation.y,
            angle: body.rotation(),
            vx: velocity.x,
            vy: velocity.y,
            angularVelocity: body.angvel()
        };
    }

    tick(): IPhysicsTickResult {
        // 步进前快照线速度：Δv 只能取自碰撞**前**速度（D-08；步进后速度已被求解器
        // 消耗，会使 Δv 低估至 ≈0 —— research Pitfall 6）。Δv 仅含线速度、不含
        // `ω×r` 角向项，这是 CONTEXT 授权的校准简化（research A2）。
        for (const [unitId, body] of this.#bodies) {
            const velocity = body.linvel();
            this.#preVelocities.set(unitId, {
                vx: velocity.x,
                vy: velocity.y
            });
        }

        this.#world.step(this.#eventQueue);
        // 仅把 `started` 碰撞转变转为类型化事件（D-08）；同时对本步可产生伤害的
        // 配对计算最终伤害数值（PHYS-03/PHYS-04）。
        const contacts: IContactEvent[] = [];
        const damages: IDamageEvent[] = [];
        // 每 tick、每 `(attackerId, defenderId)` 唯一伤害：护甲命中优先于本体命中。
        // 仅本步有效——`damages` 去重，`contacts` 保持完整（见下方守卫）。
        const damageCandidates = new Map<string, IDamageEvent>();

        this.#eventQueue.drainCollisionEvents((handle1, handle2, started) => {
            if (!started) {
                return;
            }
            const tagA = this.#index.get(handle1);
            const tagB = this.#index.get(handle2);
            if (tagA === undefined || tagB === undefined) {
                return;
            }
            // 防御性守卫：同一单位的碰撞体不会互相配对（research Pitfall 4），此处兜底。
            if (tagA.unitId === tagB.unitId) {
                return;
            }
            contacts.push({
                unitAId: tagA.unitId,
                partA: tagA.part,
                unitBId: tagB.unitId,
                partB: tagB.part
            });

            // 仅武器↔本体 / 武器↔防具产生伤害；武器↔武器、本体↔本体不产生（D-13/OQ-4）。
            if (!isDamageBearingPair(tagA.part, tagB.part)) {
                return;
            }

            // 攻方 = 武器一侧；守方 = 另一侧（部位组合已保证恰有一侧为武器）。
            const weaponOnA = tagA.part === ColliderPart.Weapon;
            const attackerTag = weaponOnA ? tagA : tagB;
            const defenderTag = weaponOnA ? tagB : tagA;

            const attackerSpec = this.#specs.get(attackerTag.unitId);
            const defenderSpec = this.#specs.get(defenderTag.unitId);
            const attackerWeapon = attackerSpec?.weapon ?? null;
            if (
                attackerSpec === undefined ||
                defenderSpec === undefined ||
                attackerWeapon === null
            ) {
                return;
            }

            // 世界系接触法向：`drainCollisionEvents` 回调不携带法向，需经
            // `world.contactPair` 获取，并在闭包内**复制**分量（manifold 是临时对象，
            // 绝不在闭包外保留 —— research Pitfall 2）。碰撞体已失效时跳过本配对。
            let nx = 0;
            let ny = 0;
            try {
                this.#world.contactPair(
                    this.#world.getCollider(handle1),
                    this.#world.getCollider(handle2),
                    manifold => {
                        const normal = manifold.normal();
                        nx = normal.x;
                        ny = normal.y;
                    }
                );
            } catch {
                return;
            }

            const attackerVelocity = this.#preVelocities.get(
                attackerTag.unitId
            ) ?? { vx: 0, vy: 0 };
            const defenderVelocity = this.#preVelocities.get(
                defenderTag.unitId
            ) ?? { vx: 0, vy: 0 };
            const projectedDeltaV =
                (attackerVelocity.vx - defenderVelocity.vx) * nx +
                (attackerVelocity.vy - defenderVelocity.vy) * ny;
            // 非有限值时按 0 处理，保证 NaN/Infinity 绝不离开物理层（数据完整性护栏）。
            const deltaV = Number.isFinite(projectedDeltaV)
                ? Math.abs(projectedDeltaV)
                : 0;

            const damageMean = computeDamageMean(
                attackerSpec.attack,
                attackerSpec.weaponRatio,
                attackerWeapon.attackRatio,
                deltaV
            );
            const rolled = rollDamage(this.#rng, damageMean);

            let armorKind: ArmorKind | undefined;
            let damage = rolled;
            let damageReduced = 0;

            if (defenderTag.part === ColliderPart.Armor) {
                // 被击中的具体防具 collider 决定 armorKind，并据此查武器的破甲比率（D-13/OQ-4）。
                armorKind = defenderTag.armorKind;
                if (armorKind !== undefined) {
                    const armorDef = defenderSpec.armors.find(
                        armor => armor.id === armorKind
                    );
                    if (armorDef !== undefined) {
                        const penetration =
                            attackerWeapon.penetration[armorKind];
                        damageReduced = computeDamageReduction(
                            rolled,
                            defenderSpec.defense,
                            defenderSpec.armorRatio,
                            armorDef.defenseRatio,
                            penetration
                        );
                        damage = rolled - damageReduced;
                    }
                }
            }
            // 击中本体不减伤：`armorKind` 保持 `undefined`，`damageReduced` 为 0（D-11）。

            const candidate: IDamageEvent = {
                attackerId: attackerTag.unitId,
                defenderId: defenderTag.unitId,
                attackerPart: ColliderPart.Weapon,
                defenderPart: defenderTag.part,
                weaponKind: attackerWeapon.id,
                armorKind,
                deltaV,
                damageMean,
                damage,
                damageReduced
            };

            const key = `${attackerTag.unitId}:${defenderTag.unitId}`;
            const existing = damageCandidates.get(key);
            if (existing === undefined) {
                damageCandidates.set(key, candidate);
            } else if (
                existing.defenderPart === ColliderPart.Body &&
                candidate.defenderPart === ColliderPart.Armor
            ) {
                // 本体命中后补上护甲命中：以减伤的一击替换（护甲优先）。
                damageCandidates.set(key, candidate);
            } else if (
                existing.defenderPart === ColliderPart.Armor &&
                candidate.defenderPart === ColliderPart.Body
            ) {
                // 已有护甲命中：丢弃本体候选，绝不绕开减伤（本研究段的核心不变量）。
            } else if (
                existing.defenderPart === ColliderPart.Armor &&
                candidate.defenderPart === ColliderPart.Armor
            ) {
                // 同一步内两次护甲命中：保留减伤更大者，再以较小 armorKind 决胜，保证顺序无关。
                const candidateKind = candidate.armorKind ?? -1;
                const existingKind = existing.armorKind ?? -1;
                if (
                    candidate.damageReduced > existing.damageReduced ||
                    (candidate.damageReduced === existing.damageReduced &&
                        candidateKind < existingKind)
                ) {
                    damageCandidates.set(key, candidate);
                }
            }
            // 两侧同为本体：保留首个（单个武器同一步不可发生，兜底）。
        });

        // 仅在碰撞循环结束后按插入顺序发出伤害事件——一次打击至多一个（每 tick 每配对）。
        for (const candidate of damageCandidates.values()) {
            damages.push(candidate);
        }

        for (const body of this.#bodies.values()) {
            body.resetForces(false);
            body.resetTorques(false);
        }
        return { contacts, damages };
    }

    dispose(): void {
        this.#world.free();
        this.#eventQueue.free();
        this.#bodies.clear();
        this.#specs.clear();
        this.#colliders.clear();
        this.#index.clear();
        this.#preVelocities.clear();
    }
}
