/**
 * 物理世界：`class PhysicsWorld implements IPhysicsWorld`（D-07）。
 * 拥有一个 Rapier `World` 与一个 `EventQueue`，按 `unitId` 注册单位（每个单位 =
 * 一个复合刚体：本体 / 武器 / 防具各一个碰撞体，固定局部偏移、逐 collider 设质量，D-03/D-05），
 * 并用「碰撞体 handle → 部位标签」映射承载部位标识（D-04）。
 *
 * 前置条件：调用方**必须**先 `await RAPIER.init()` 再构造本类（research Pitfall 1）。
 * 物理层只持有 id 与数值，不拥有、不引用 `Unit`（D-07）。
 */

import RAPIER from '@dimforge/rapier2d-compat';
import { ColliderPart } from '@/physics/types';
import type {
    IContactEvent,
    IPhysicsConfig,
    IPhysicsTickResult,
    IPhysicsWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
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
    /** unitId → 该单位的复合刚体。 */
    #bodies = new Map<number, InstanceType<typeof RAPIER.RigidBody>>();
    /** unitId → 注册时保留的数值（供后续伤害计算使用，plan 02-06）。 */
    #specs = new Map<number, IUnitPhysicsSpec>();
    /** unitId → 该单位的全部碰撞体（用于移除时清空 handle 索引）。 */
    #colliders = new Map<number, InstanceType<typeof RAPIER.Collider>[]>();
    /**
     * 碰撞体 handle → 部位标签（D-04）：记载该 handle 所属单位、部位，
     * 及武器/防具种类（用于后续破甲查表，D-13/OQ-4）。
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
    /** unitId → 步进前速度快照占位（供后续 Δv 计算填充，plan 02-06）。 */
    #preVelocities = new Map<number, { vx: number; vy: number }>();

    /**
     * 构造物理世界。
     * @param config 固定步长与几何尺寸。
     * @param _rng 注入的随机源，预留供后续伤害抖动管线使用（plan 02-06）；本计划不消费。
     */
    constructor(config: IPhysicsConfig, _rng: IRng) {
        this.#config = config;
        this.#world = new RAPIER.World({ x: 0, y: 0 });
        this.#eventQueue = new RAPIER.EventQueue(true);
        this.#world.timestep = config.dt;
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
        this.#world.step(this.#eventQueue);
        // 仅把 `started` 碰撞转变转为类型化事件（D-08）；法向/Δv 留给 02-06 的伤害层。
        const contacts: IContactEvent[] = [];
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
        });
        for (const body of this.#bodies.values()) {
            body.resetForces(false);
            body.resetTorques(false);
        }
        return { contacts, damages: [] };
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
