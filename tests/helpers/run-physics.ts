import { FIXED_DT } from '../../src/config/sim';
import {
    ARMOR_HALF_X,
    ARMOR_HALF_Y,
    ARMOR_MASS,
    BODY_MASS,
    BODY_RADIUS,
    WEAPON_HALF_LEN,
    WEAPON_MASS,
    WEAPON_RADIUS
} from '../../src/sim/content/physics';
import {
    ArmorSubtype,
    EventLog,
    SimEventKind,
    type IContactEvent
} from '../../src/sim/core/events';
import { fingerprint } from '../../src/sim/snapshot';
import {
    CompositeFactory,
    type ICompositeSpec,
    type IUnitPhysics
} from '../../src/sim/world/composite';
import { ContactBridge } from '../../src/sim/world/contact';
import { EntityStore } from '../../src/sim/world/entity-store';
import {
    PhysicsWorld,
    type IPhysicsWorld
} from '../../src/sim/world/physics-world';

/**
 * 无头物理双跑运行器（PHYS-01/02/03 共用，D-20 双指纹门禁的输入）。
 *
 * 直接构造 `PhysicsWorld` + `CompositeFactory` + `ContactBridge`（尚未接入 `BattleSim`），
 * 以 `EntityStore.ids()` 的**有序数组**生成两个复合单位（Pitfall 3），每 tick 驱动武器
 * 往复摆动后推进一步，返回逐 tick 位姿轨迹、Rapier 原生快照指纹与全部类型化接触事件。
 *
 * 场景**无 RNG**：位置、初速、装备几何全部来自 `src/sim/content/physics.ts` 的常量，
 * 故同参数两次调用必产出相同结果（同机确定性，D-17）。
 */

/** `runPhysics` 的入参。 */
export interface IRunPhysicsOptions {
    /** 推进的固定步数。 */
    ticks: number;
}

/**
 * 物理双跑结果。
 *
 * 前三个字段为 plan 契约（`poseTrace` / `rapierHash` / `contacts`）；
 * `weaponAngularSpeeds` 使 D-25 的"武器确实在动"可被断言。
 */
export interface IPhysicsRunResult {
    /** 逐 tick 位姿轨迹（每 tick 一条，编码两单位本体位姿与武器角速度）。 */
    poseTrace: string[];
    /** 终态 Rapier `takeSnapshot()` 字节的指纹（D-20 第二个指纹）。 */
    rapierHash: string;
    /** 全程收集到的类型化接触事件（含部位标记与 Δv）。 */
    contacts: IContactEvent[];
    /** 逐 tick 首个单位的首个武器角速度（rad/s，D-25 可见性判据）。 */
    weaponAngularSpeeds: number[];
}

/** 固定单位数量（与种子无关，保证两次运行面对同一场景）。 */
const UNIT_COUNT = 2;

/**
 * 跑 `ticks` 个固定步，返回位姿轨迹、Rapier 快照指纹与全部接触事件。
 *
 * @param options 要推进的步数。
 * @returns 双跑比对所需的轨迹/指纹/接触事件集合。
 */
export function runPhysics({ ticks }: IRunPhysicsOptions): IPhysicsRunResult {
    const physics = new PhysicsWorld(FIXED_DT);
    const events = new EventLog();
    const bridge = new ContactBridge(physics, events);
    const factory = new CompositeFactory(
        physics.world,
        (handle, ref) => bridge.register(handle, ref),
        handle => physics.unregisterPart(handle)
    );

    /* 先以 Store 分配单调 id，再**按有序 id 顺序**生成 Rapier 实体（Pitfall 3） */
    const store = new EntityStore();
    for (let i = 0; i < UNIT_COUNT; i++) store.spawn();

    const specs = buildSpecs();
    const ids = store.ids();
    const units: IUnitPhysics[] = [];
    for (let i = 0; i < ids.length; i++) {
        units.push(factory.spawn(specs[i], ids[i]));
    }

    const poseTrace: string[] = [];
    const contacts: IContactEvent[] = [];
    const weaponAngularSpeeds: number[] = [];

    for (let tick = 0; tick < ticks; tick++) {
        events.clear();
        for (const unit of units) factory.driveSwing(unit, tick, FIXED_DT);
        physics.step(FIXED_DT);
        bridge.drain(tick);
        for (const event of events.drain()) {
            if (event.kind === SimEventKind.Contact) contacts.push(event);
        }
        poseTrace.push(poseString(physics, units));
        weaponAngularSpeeds.push(weaponAngularSpeed(physics, units[0]));
    }

    return {
        poseTrace,
        rapierHash: fingerprint(physics.takeSnapshot()),
        contacts,
        weaponAngularSpeeds
    };
}

/**
 * 构造固定的双单位装配规格（相向而行，无 RNG）。
 *
 * A 向右、B 向左；各自防具朝向对面，使 A 的武器扫过 B 的防具时产生武器-防具接触。
 *
 * @returns 两个复合单位的装配规格（与有序 id 一一对应）。
 */
function buildSpecs(): ICompositeSpec[] {
    return [
        {
            x: -1.1,
            y: 0,
            vx: 0.6,
            vy: 0,
            bodyRadius: BODY_RADIUS,
            bodyMass: BODY_MASS,
            weapons: [
                {
                    halfLen: WEAPON_HALF_LEN,
                    radius: WEAPON_RADIUS,
                    mass: WEAPON_MASS
                }
            ],
            armors: [
                {
                    subtype: ArmorSubtype.Helmet,
                    offsetX: 0.9,
                    offsetY: 0,
                    halfX: ARMOR_HALF_X,
                    halfY: ARMOR_HALF_Y,
                    mass: ARMOR_MASS
                }
            ]
        },
        {
            x: 1.1,
            y: 0,
            vx: -0.6,
            vy: 0,
            bodyRadius: BODY_RADIUS,
            bodyMass: BODY_MASS,
            weapons: [
                {
                    halfLen: WEAPON_HALF_LEN,
                    radius: WEAPON_RADIUS,
                    mass: WEAPON_MASS
                }
            ],
            armors: [
                {
                    subtype: ArmorSubtype.Shield,
                    offsetX: -0.9,
                    offsetY: 0,
                    halfX: ARMOR_HALF_X,
                    halfY: ARMOR_HALF_Y,
                    mass: ARMOR_MASS
                }
            ]
        }
    ];
}

/**
 * 编码两单位本体的位姿与武器角速度为一个确定性字符串（逐 tick 轨迹条目）。
 *
 * 固定 6 位小数，避免格式化抖动；不使用任何墙上时钟。
 *
 * @param physics 物理世界（读取刚体变换）。
 * @param units 单位句柄集合。
 * @returns 该 tick 的位姿字符串。
 */
function poseString(
    physics: IPhysicsWorld,
    units: readonly IUnitPhysics[]
): string {
    const parts: string[] = [];
    for (const unit of units) {
        const body = physics.world.getRigidBody(unit.bodyHandle);
        const t = body.translation();
        const angvels = unit.weaponHandles
            .map(h => physics.world.getRigidBody(h).angvel().toFixed(6))
            .join(',');
        parts.push(
            `${t.x.toFixed(6)},${t.y.toFixed(6)},${body.rotation().toFixed(6)},[${angvels}]`
        );
    }
    return parts.join('|');
}

/**
 * 取某单位首个武器刚体的当前角速度。
 *
 * @param physics 物理世界。
 * @param unit 单位句柄集合。
 * @returns 首个武器角速度（rad/s）；无武器时返回 0。
 */
function weaponAngularSpeed(
    physics: IPhysicsWorld,
    unit: IUnitPhysics
): number {
    const handle = unit.weaponHandles[0];
    if (handle === undefined) return 0;
    return physics.world.getRigidBody(handle).angvel();
}
