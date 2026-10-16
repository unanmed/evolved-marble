import RAPIER from '@dimforge/rapier2d-deterministic-compat';
import type {
    ColliderDesc,
    RigidBody
} from '@dimforge/rapier2d-deterministic-compat';
import { beforeAll, describe, expect, it } from 'vitest';
import { DEFAULT_SEED, FIXED_DT } from '../../src/config/sim';
import { BattleSim } from '../../src/sim/battle-sim';
import {
    ArmorSubtype,
    EventLog,
    PartKind,
    SimEventKind,
    type IContactEvent,
    type IUnitPartRef
} from '../../src/sim/core/events';
import { ContactBridge } from '../../src/sim/world/contact';
import { PhysicsWorld } from '../../src/sim/world/physics-world';
import { initPhysics } from '../../src/sim/world/physics-init';

/**
 * 带部位标记的接触语义（PHYS-02 / D-28..D-31）。
 *
 * 覆盖研究 Pattern 4 的每条决定性细节：
 *   1. Δv 取自**步前**速度（步后 manifold 恒为 0）——正面对撞 8 m/s 必须得到 ≈8 而非 0；
 *   2. 武器-防具接触命名正确的 `partA`/`partB` 与防具子类型；
 *   3. 武器-本体接触为 `partB = Body` 且 `armorB === null`；
 *   4. 未登记/静态句柄不产生事件、绝不抛错（威胁 T-02-01 的 `lookup → null` 守卫）；
 *   5. 仅 collision-enter 触发；退出不触发，且同一对重复 enter 不去重（D-31）；
 *   6. **真实 `BattleSim` 入口**的端到端链路：`BattleSim.step()` drain Rapier 队列 →
 *      `EventLog`，在 enter 发生的同一 tick 内可见（杜绝 drain-after-clear / 错 tick 接线）。
 */

/** 接触测试装置：物理世界 + 接触桥 + 事件日志（最低层装配，不含 `BattleSim`）。 */
interface IContactRig {
    /** 确定性物理世界。 */
    physics: PhysicsWorld;
    /** 接触桥。 */
    bridge: ContactBridge;
    /** 每 tick 事件日志。 */
    events: EventLog;
}

/**
 * 构造一套最低层接触测试装置（供 Test 1–5 精确控制几何与速度）。
 *
 * @returns 装配好的物理世界 / 接触桥 / 事件日志。
 */
function makeRig(): IContactRig {
    const physics = new PhysicsWorld(FIXED_DT);
    const events = new EventLog();
    const bridge = new ContactBridge(physics, events);
    return { physics, bridge, events };
}

/**
 * 构造一个"本体"部位标记。
 *
 * @param entityId 单位 id。
 * @returns 本体部位标记（无防具子类型）。
 */
function bodyRef(entityId: number): IUnitPartRef {
    return { entityId, part: PartKind.Body, armorSubtype: null };
}

/**
 * 构造一个"武器"部位标记。
 *
 * @param entityId 单位 id。
 * @returns 武器部位标记（无防具子类型）。
 */
function weaponRef(entityId: number): IUnitPartRef {
    return { entityId, part: PartKind.Weapon, armorSubtype: null };
}

/**
 * 构造一个"防具"部位标记。
 *
 * @param entityId 单位 id。
 * @param subtype 防具子类型。
 * @returns 防具部位标记。
 */
function armorRef(entityId: number, subtype: ArmorSubtype): IUnitPartRef {
    return { entityId, part: PartKind.Armor, armorSubtype: subtype };
}

/**
 * 生成一个带 `COLLISION_EVENTS` 的动态刚体 + 碰撞体，并登记其部位标记（测试用）。
 *
 * @param rig 接触测试装置。
 * @param x 位置 x（米）。
 * @param y 位置 y（米）。
 * @param vx 线速度 x（m/s）。
 * @param vy 线速度 y（m/s）。
 * @param desc 碰撞体描述。
 * @param ref 该碰撞体的部位标记。
 * @returns 新建的刚体（供后续 teleport/改速）。
 */
function addPart(
    rig: IContactRig,
    x: number,
    y: number,
    vx: number,
    vy: number,
    desc: ColliderDesc,
    ref: IUnitPartRef
): RigidBody {
    const body = rig.physics.world.createRigidBody(
        RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(x, y)
            .setLinvel(vx, vy)
            .setCanSleep(false)
    );
    const collider = rig.physics.world.createCollider(
        desc.setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
    );
    rig.bridge.register(collider.handle, ref);
    return body;
}

/**
 * 推进 `ticks` 步，收集跨 tick 的全部类型化接触事件（drain 每 tick 一次）。
 *
 * @param rig 接触测试装置。
 * @param ticks 推进的固定步数。
 * @returns 全部收集到的 `IContactEvent`（按发生顺序）。
 */
function runContacts(rig: IContactRig, ticks: number): IContactEvent[] {
    const out: IContactEvent[] = [];
    for (let tick = 0; tick < ticks; tick++) {
        rig.physics.step(FIXED_DT);
        rig.bridge.drain(tick);
        for (const event of rig.events.drain()) {
            if (event.kind === SimEventKind.Contact) out.push(event);
        }
    }
    return out;
}

/**
 * 就位一个刚体：设置平移 / 线速度 / 朝向 / 角速度归零。
 *
 * @param body 目标刚体。
 * @param x 位置 x。
 * @param y 位置 y。
 * @param vx 线速度 x。
 * @param vy 线速度 y。
 * @param rotation 朝向角（弧度）。
 */
function place(
    body: RigidBody,
    x: number,
    y: number,
    vx: number,
    vy: number,
    rotation: number
): void {
    body.setTranslation({ x, y }, true);
    body.setLinvel({ x: vx, y: vy }, true);
    body.setRotation(rotation, true);
    body.setAngvel(0, true);
}

/** Test 1 的正面对撞单侧速度（m/s）；相对法向速度应为 2×该值 = 8 m/s。 */
const HEAD_ON_SIDE_SPEED = 4;

/** `dv` 断言的容差（m/s）——吸收 Rapier 求解器对步前相对速度的微小修正。 */
const DV_TOLERANCE = 0.2;

/** Test 6 的真实 `BattleSim` 接近速度（m/s）。 */
const APPROACH_SPEED = 0.6;

describe('ContactBridge part-tagged contact semantics (PHYS-02 / D-28..D-31)', () => {
    beforeAll(async () => {
        await initPhysics();
    });

    it('Test 1: a head-on 8 m/s approach yields dv ≈ 8 from PRE-STEP velocities (not the post-step 0)', () => {
        const rig = makeRig();
        addPart(
            rig,
            -0.6,
            0,
            HEAD_ON_SIDE_SPEED,
            0,
            RAPIER.ColliderDesc.ball(0.5),
            bodyRef(1)
        );
        addPart(
            rig,
            0.6,
            0,
            -HEAD_ON_SIDE_SPEED,
            0,
            RAPIER.ColliderDesc.ball(0.5),
            bodyRef(2)
        );

        const contacts = runContacts(rig, 20);
        expect(contacts.length).toBeGreaterThan(0);
        const dv = contacts[0].dv;
        /* dv > 0 alone would pass even on the post-step manifold (≈0); assert the magnitude. */
        expect(dv).toBeGreaterThan(0);
        expect(Math.abs(dv - 2 * HEAD_ON_SIDE_SPEED)).toBeLessThan(
            DV_TOLERANCE
        );
    });

    it('Test 2: weapon-vs-armor names partA=Weapon, partB=Armor with the correct armorB subtype', () => {
        const rig = makeRig();
        addPart(
            rig,
            -0.6,
            0,
            1,
            0,
            RAPIER.ColliderDesc.capsule(0.3, 0.1),
            weaponRef(1)
        );
        addPart(
            rig,
            0.6,
            0,
            0,
            0,
            RAPIER.ColliderDesc.cuboid(0.5, 0.5),
            armorRef(2, ArmorSubtype.Shield)
        );

        const contacts = runContacts(rig, 60);
        expect(contacts.length).toBeGreaterThan(0);
        const first = contacts[0];
        expect(first.partA).toBe(PartKind.Weapon);
        expect(first.partB).toBe(PartKind.Armor);
        expect(first.armorA).toBeNull();
        expect(first.armorB).toBe(ArmorSubtype.Shield);
    });

    it('Test 3: weapon-vs-body names partB=Body and armorB === null', () => {
        const rig = makeRig();
        addPart(
            rig,
            -0.6,
            0,
            1,
            0,
            RAPIER.ColliderDesc.capsule(0.3, 0.1),
            weaponRef(1)
        );
        addPart(rig, 0.6, 0, 0, 0, RAPIER.ColliderDesc.ball(0.5), bodyRef(2));

        const contacts = runContacts(rig, 60);
        expect(contacts.length).toBeGreaterThan(0);
        const first = contacts[0];
        expect(first.partA).toBe(PartKind.Weapon);
        expect(first.partB).toBe(PartKind.Body);
        expect(first.armorB).toBeNull();
    });

    it('Test 4: an unregistered (untagged) collider emits no event and never throws (T-02-01)', () => {
        const rig = makeRig();
        addPart(
            rig,
            -0.6,
            0,
            HEAD_ON_SIDE_SPEED,
            0,
            RAPIER.ColliderDesc.ball(0.5),
            bodyRef(1)
        );
        /* 幽灵：有 COLLISION_EVENTS 但**未登记**部位标记。 */
        const ghost = rig.physics.world.createRigidBody(
            RAPIER.RigidBodyDesc.dynamic()
                .setTranslation(0.6, 0)
                .setLinvel(-HEAD_ON_SIDE_SPEED, 0)
                .setCanSleep(false)
        );
        const ghostCol = rig.physics.world.createCollider(
            RAPIER.ColliderDesc.ball(0.5).setActiveEvents(
                RAPIER.ActiveEvents.COLLISION_EVENTS
            ),
            ghost
        );
        expect(rig.bridge.lookup(ghostCol.handle)).toBeNull();

        let contacts: IContactEvent[] = [];
        expect(() => {
            contacts = runContacts(rig, 20);
        }).not.toThrow();
        expect(contacts).toEqual([]);
    });

    it('Test 5: exit transitions emit nothing; two enters of the same pair both emit (D-31, no dedup)', () => {
        const rig = makeRig();
        const a = addPart(
            rig,
            -3,
            0,
            HEAD_ON_SIDE_SPEED,
            0,
            RAPIER.ColliderDesc.ball(0.5),
            bodyRef(1)
        );
        const b = addPart(
            rig,
            3,
            0,
            -HEAD_ON_SIDE_SPEED,
            0,
            RAPIER.ColliderDesc.ball(0.5),
            bodyRef(2)
        );

        const firstEnter = runContacts(rig, 60);
        expect(firstEnter.length).toBe(1);

        /* 分离：退出转移（started === false）必须不产生事件。 */
        place(a, -3, 0, 0, 0, 0);
        place(b, 3, 0, 0, 0, 0);
        const onExit = runContacts(rig, 3);
        expect(onExit).toEqual([]);

        /* 再次接近：同一对第二次 enter 必须再次发出（无隐式去重，D-31）。 */
        place(a, -3, 0, HEAD_ON_SIDE_SPEED, 0, 0);
        place(b, 3, 0, -HEAD_ON_SIDE_SPEED, 0, 0);
        const secondEnter = runContacts(rig, 60);
        expect(secondEnter.length).toBe(1);
    });

    it('Test 6: a real BattleSim surfaces a Weapon/Armor contact in events.drain() in the enter tick', () => {
        const sim = new BattleSim(DEFAULT_SEED);
        const a = sim.spawn();
        const b = sim.spawn();
        const world = sim.state.physics.world;
        const pa = sim.state.store.get(a).physics;
        const pb = sim.state.store.get(b).physics;

        const aBody = world.getRigidBody(pa.bodyHandle);
        const aWeapon = world.getRigidBody(pa.weaponHandles[0]);
        const bBody = world.getRigidBody(pb.bodyHandle);
        const bWeapon = world.getRigidBody(pb.weaponHandles[0]);

        /*
         * 场景：A 位于 B 右侧向左推进，A 的武器横置（π/2）伸出——B 的防具挂在本体右侧
         * （`spawnSpec` 的 offsetX > 0），故 A 的武器先触及 B 的**防具**而非本体。
         * `BattleSim` 本阶段不驱动摆动，故武器朝向在测试中直接设定（见 SUMMARY 说明）；
         * 关节两侧均就位以免求解器拉拽（否则关节约束会注入巨大冲量）。
         */
        place(aBody, 2.5, 0, -APPROACH_SPEED, 0, 0);
        place(aWeapon, 2.5, 0, -APPROACH_SPEED, 0, Math.PI / 2);
        place(bBody, 0.6, 0, 0, 0, 0);
        place(bWeapon, 0.6, 0, 0, 0, 0);

        let found: IContactEvent | null = null;
        for (let tick = 0; tick < 60 && found === null; tick++) {
            sim.step();
            /* 同一 tick 的 drain：drain-after-clear / 错 tick 接线会在此处丢掉事件。 */
            for (const event of sim.state.events.drain()) {
                if (
                    event.kind === SimEventKind.Contact &&
                    event.partA === PartKind.Weapon &&
                    event.partB === PartKind.Armor
                ) {
                    found = event;
                }
            }
        }

        expect(found).not.toBeNull();
        expect(found?.partA).toBe(PartKind.Weapon);
        expect(found?.partB).toBe(PartKind.Armor);
        expect(found?.armorB).toBe(ArmorSubtype.Helmet);
        expect(Math.abs((found?.dv ?? 0) - APPROACH_SPEED)).toBeLessThan(
            DV_TOLERANCE
        );
    });
});
