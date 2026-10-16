import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config/sim';
import {
    ARMOR_HALF_X,
    ARMOR_HALF_Y,
    ARMOR_MASS,
    BODY_MASS,
    BODY_RADIUS,
    SWING_AMPLITUDE,
    SWING_ANGULAR_SPEED,
    WEAPON_HALF_LEN,
    WEAPON_MASS,
    WEAPON_RADIUS
} from '../../src/sim/content/physics';
import {
    ArmorSubtype,
    EventLog,
    PartKind,
    SimEventKind,
    type IContactEvent
} from '../../src/sim/core/events';
import {
    CompositeFactory,
    type IArmorSpec,
    type ICompositeSpec,
    type IUnitPhysics,
    type IWeaponSpec
} from '../../src/sim/world/composite';
import { ContactBridge } from '../../src/sim/world/contact';
import { PhysicsWorld } from '../../src/sim/world/physics-world';

/**
 * 复合工厂展开后的行为规格（PHYS-01/D-26、D-27、T-02-01、D-25）。
 *
 * 覆盖：任意数量武器/防具的装配与部件解析、单位级碰撞分组（同单位互不伤害、敌我仍碰撞）、
 * 有序生命周期（despawn 移除刚体/碰撞体/关节且不留悬空部件句柄），以及武器"持续往复摆动"
 * （D-25：真摆动而非一次性尖峰）。
 */

/** 一个复合装配测试台（世界 + 部件映射 + 工厂 + 事件日志）。 */
interface ICompositeRig {
    /** 物理世界。 */
    physics: PhysicsWorld;
    /** 接触桥（部件映射代理）。 */
    bridge: ContactBridge;
    /** 复合工厂。 */
    factory: CompositeFactory;
    /** 每 tick 事件日志。 */
    events: EventLog;
}

/**
 * 构造一个独立的复合装配测试台（Rapier 须已由共享 setup 初始化）。
 *
 * @returns 全新的测试台（世界、接触桥、工厂、事件日志）。
 */
function makeRig(): ICompositeRig {
    const physics = new PhysicsWorld(FIXED_DT);
    const events = new EventLog();
    const bridge = new ContactBridge(physics, events);
    const factory = new CompositeFactory(
        physics.world,
        (handle, ref) => bridge.register(handle, ref),
        handle => physics.unregisterPart(handle)
    );
    return { physics, bridge, factory, events };
}

/**
 * 构造一把测试武器规格（内容常量）。
 *
 * @returns 内容常量驱动的武器装配规格。
 */
function weapon(): IWeaponSpec {
    return {
        halfLen: WEAPON_HALF_LEN,
        radius: WEAPON_RADIUS,
        mass: WEAPON_MASS
    };
}

/**
 * 构造一件测试防具规格（内容常量）。
 *
 * @param subtype 防具子类型。
 * @param offsetX 相对本体的局部偏移 x（米）。
 * @returns 内容常量驱动的防具装配规格。
 */
function armor(subtype: ArmorSubtype, offsetX: number): IArmorSpec {
    return {
        subtype,
        offsetX,
        offsetY: 0,
        halfX: ARMOR_HALF_X,
        halfY: ARMOR_HALF_Y,
        mass: ARMOR_MASS
    };
}

/**
 * 构造一个复合装配规格（可覆盖武器/防具/位置）。
 *
 * @param overrides 需覆盖的字段子集。
 * @returns 合并后的复合装配规格。
 */
function spec(overrides: Partial<ICompositeSpec> = {}): ICompositeSpec {
    return {
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        bodyRadius: BODY_RADIUS,
        bodyMass: BODY_MASS,
        weapons: [weapon()],
        armors: [],
        ...overrides
    };
}

/**
 * 推进若干 tick，驱动摆动并收集全部类型化接触事件。
 *
 * @param rig 测试台。
 * @param units 参与推进的单位句柄集合。
 * @param ticks 推进步数。
 * @returns 全程收集到的接触事件。
 */
function runSwing(
    rig: ICompositeRig,
    units: readonly IUnitPhysics[],
    ticks: number
): IContactEvent[] {
    const contacts: IContactEvent[] = [];
    for (let t = 0; t < ticks; t++) {
        rig.events.clear();
        for (const unit of units) rig.factory.driveSwing(unit, t, FIXED_DT);
        rig.physics.step(FIXED_DT);
        rig.bridge.drain(t);
        for (const event of rig.events.drain()) {
            if (event.kind === SimEventKind.Contact) contacts.push(event);
        }
    }
    return contacts;
}

/**
 * 统计序列中相邻元素符号变化的次数（振荡判据）。
 *
 * @param series 数值序列。
 * @returns 符号变化次数。
 */
function countSignChanges(series: readonly number[]): number {
    let changes = 0;
    for (let i = 1; i < series.length; i++) {
        if (Math.sign(series[i]) !== Math.sign(series[i - 1])) changes++;
    }
    return changes;
}

describe('composite factory (PHYS-01 / D-26 / D-27 / T-02-01 / D-25)', () => {
    it('spawns N weapons + N armors and resolves every handle to its part/subtype (D-26)', () => {
        const rig = makeRig();
        const unit = rig.factory.spawn(
            spec({
                weapons: [weapon(), weapon()],
                armors: [
                    armor(ArmorSubtype.Helmet, 0.5),
                    armor(ArmorSubtype.Shield, -0.5)
                ]
            }),
            1
        );

        const parts = rig.physics
            .partEntries()
            .filter(entry => entry.ref.entityId === unit.entityId);

        /* 1 本体 + 2 防具 + 2 武器 = 5 个独立碰撞体 */
        expect(parts.length).toBe(5);
        for (const entry of parts) {
            expect(rig.bridge.lookup(entry.handle)).toEqual(entry.ref);
        }

        const byPart = (part: PartKind) =>
            parts.filter(entry => entry.ref.part === part);
        expect(byPart(PartKind.Body).length).toBe(1);
        expect(byPart(PartKind.Weapon).length).toBe(2);
        expect(byPart(PartKind.Armor).length).toBe(2);
        expect(
            new Set(byPart(PartKind.Armor).map(e => e.ref.armorSubtype))
        ).toEqual(new Set([ArmorSubtype.Helmet, ArmorSubtype.Shield]));
    });

    it('same-unit parts do not produce damaging contacts with each other (D-27)', () => {
        const rig = makeRig();
        /* 两把武器同体同心、胶囊相互重叠：若无单位级分组，二者将互撞产生同单位接触 */
        const unit = rig.factory.spawn(
            spec({ weapons: [weapon(), weapon()], armors: [] }),
            1
        );

        const contacts = runSwing(rig, [unit], 30);

        expect(contacts.filter(c => c.a === c.b)).toEqual([]);
    });

    it('enemy units still collide (D-27)', () => {
        const rig = makeRig();
        /* 两单位相向而行，闭合后应发生敌我接触 */
        const a = rig.factory.spawn(
            spec({ x: -2, vx: 3, weapons: [weapon()] }),
            1
        );
        const b = rig.factory.spawn(
            spec({ x: 2, vx: -3, weapons: [weapon()] }),
            2
        );

        const contacts = runSwing(rig, [a, b], 120);

        expect(contacts.some(c => c.a !== c.b)).toBe(true);
    });

    it('despawn removes the body, colliders and joint and leaves no dangling handle (T-02-01)', () => {
        const rig = makeRig();
        const unit = rig.factory.spawn(
            spec({
                weapons: [weapon(), weapon()],
                armors: [armor(ArmorSubtype.Helmet, 0.5)]
            }),
            5
        );
        const handles = rig.physics
            .partEntries()
            .filter(entry => entry.ref.entityId === unit.entityId)
            .map(entry => entry.handle);
        const collidersBefore = rig.physics.world.colliders.len();
        const bodiesBefore = rig.physics.world.bodies.len();
        const jointsBefore = rig.physics.world.impulseJoints.len();

        rig.factory.despawn(unit.entityId);

        /* 移除 5 个碰撞体、3 个刚体（本体 + 2 武器）与 2 个旋转关节 */
        expect(rig.physics.world.colliders.len()).toBe(
            collidersBefore - handles.length
        );
        expect(rig.physics.world.bodies.len()).toBe(bodiesBefore - 3);
        expect(rig.physics.world.impulseJoints.len()).toBe(jointsBefore - 2);
        for (const handle of handles) {
            expect(rig.bridge.lookup(handle)).toBeNull();
        }
    });

    it('weapon swings continuously — sustained oscillation, not a one-step spike (D-25)', () => {
        const rig = makeRig();
        const unit = rig.factory.spawn(
            spec({ weapons: [weapon()], armors: [] }),
            1
        );

        const ticks = 150;
        const series: number[] = [];
        for (let t = 0; t < ticks; t++) {
            rig.factory.driveSwing(unit, t, FIXED_DT);
            rig.physics.step(FIXED_DT);
            series.push(
                rig.physics.world.getRigidBody(unit.weaponHandles[0]).angvel()
            );
        }

        const peak = SWING_AMPLITUDE * SWING_ANGULAR_SPEED;
        const maxAbs = Math.max(...series.map(Math.abs));
        const lastQuarterMaxAbs = Math.max(
            ...series.slice(-Math.floor(ticks / 4)).map(Math.abs)
        );

        /* 真振荡：符号翻转 ≥ 2 次 */
        expect(countSignChanges(series)).toBeGreaterThanOrEqual(2);
        /* 达到振幅（非死摆） */
        expect(maxAbs).toBeGreaterThan(peak * 0.5);
        /* 持续到末段（非一次性尖峰后衰减为 0） */
        expect(lastQuarterMaxAbs).toBeGreaterThan(peak * 0.5);
    });
});
