import { describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config/sim';
import {
    BODY_MASS,
    BODY_RADIUS,
    GROUP_UNIT_CAPACITY
} from '../../src/sim/content/physics';
import { EventLog, PartKind, type IEventLog } from '../../src/sim/core/events';
import {
    CompositeFactory,
    type ICompositeFactory,
    type ICompositeSpec
} from '../../src/sim/world/composite';
import {
    ContactBridge,
    type IContactBridge
} from '../../src/sim/world/contact';
import type { EntityId } from '../../src/sim/world/entity-store';
import {
    PhysicsWorld,
    type IPhysicsWorld
} from '../../src/sim/world/physics-world';

/**
 * D-27 规模回归套件：单位级碰撞分组在 **>16 并发单位**下的正确性、耗尽/释放语义与
 * 顺序稳定性（PHYS-01 / D-27 / D-17）。
 *
 * 旧实现按 `(entityId - 1) % 16` 复用成员位，使 id 相差 16 的整数倍的单位互不碰撞
 * （10v10 = 20 单位时丢失 4 组配对）。本套件以真实 `PhysicsWorld` + `CompositeFactory`
 * 读取碰撞体上**编码后的** `InteractionGroups`，断言任意不同单位必交互、同单位自身掩码
 * 被自身过滤掩码清除、超出容量抛错（fail loud）、释放后掩码可复用，且同一构造序列产出
 * 逐字节一致的编码值（同机确定性）。
 */

/** 一个无头碰撞分组测试台（世界 + 部件映射 + 工厂 + 事件日志）。 */
interface ICollisionRig {
    /** 物理世界。 */
    physics: IPhysicsWorld;
    /** 接触桥（部件映射代理）。 */
    bridge: IContactBridge;
    /** 复合工厂。 */
    factory: ICompositeFactory;
    /** 每 tick 事件日志。 */
    events: IEventLog;
}

/**
 * 构造一个独立的碰撞分组测试台（Rapier 须已由共享 setup 初始化）。
 *
 * @returns 全新的测试台（世界、接触桥、工厂、事件日志）。
 */
function makeRig(): ICollisionRig {
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
 * 构造一个**最小**复合装配规格（仅本体球，无武器/防具）。
 *
 * 规模回归只读取本体碰撞体的分组编码，故不装配武器/防具以降低构造开销。
 *
 * @param x 生成位置 x（米）。
 * @returns 仅含本体球的复合装配规格。
 */
function bareSpec(x: number): ICompositeSpec {
    return {
        x,
        y: 0,
        vx: 0,
        vy: 0,
        bodyRadius: BODY_RADIUS,
        bodyMass: BODY_MASS,
        weapons: [],
        armors: []
    };
}

/**
 * 判定两组编码后的 `InteractionGroups` 是否允许交互（研究 Pattern 3）。
 *
 * 用**逻辑右移**以正确处理位 31 置位（高位成员掩码会把编码值推过 2³¹）。
 *
 * @param a 组 a 的编码值。
 * @param b 组 b 的编码值。
 * @returns 当且仅当双方成员位均命中对方过滤掩码时为 `true`。
 */
function interacts(a: number, b: number): boolean {
    return ((a >>> 16) & b) !== 0 && ((b >>> 16) & a) !== 0;
}

/**
 * 取编码值的成员位（高 16 位）。
 *
 * @param groups 编码后的 `InteractionGroups`。
 * @returns 该组的成员位（0..0xffff）。
 */
function members(groups: number): number {
    return (groups >>> 16) & 0xffff;
}

/**
 * 取编码值的过滤掩码（低 16 位）。
 *
 * @param groups 编码后的 `InteractionGroups`。
 * @returns 该组的过滤掩码（0..0xffff）。
 */
function filter(groups: number): number {
    return groups & 0xffff;
}

/**
 * 从物理世界读回每个单位**本体**碰撞体上编码后的 `InteractionGroups`（仅登记单位）。
 *
 * @param physics 物理世界。
 * @returns 单位 id → 本体碰撞体分组编码（升序 partEntries 序）。
 */
function groupsByEntity(physics: IPhysicsWorld): Map<EntityId, number> {
    const out = new Map<EntityId, number>();
    for (const entry of physics.partEntries()) {
        if (entry.ref.part !== PartKind.Body) continue;
        out.set(
            entry.ref.entityId,
            physics.world.getCollider(entry.handle).collisionGroups()
        );
    }
    return out;
}

/**
 * 生成 `1..count` 的实体 id 序列。
 *
 * @param count 序列长度。
 * @returns 从 1 起的连续 id 数组。
 */
function ids(count: number): EntityId[] {
    return Array.from({ length: count }, (_, i) => i + 1);
}

describe('collision groups beyond 16 units (D-27)', () => {
    it('every distinct pair of 20 concurrent units interacts; each unit excludes its own membership (D-27)', () => {
        const rig = makeRig();
        const live = ids(20);
        for (const id of live) {
            rig.factory.spawn(bareSpec(id), id);
        }

        const groups = groupsByEntity(rig.physics);
        expect(groups.size).toBe(20);

        for (let i = 0; i < live.length; i++) {
            for (let j = i + 1; j < live.length; j++) {
                const a = groups.get(live[i]) as number;
                const b = groups.get(live[j]) as number;
                /* 交互必须**双向**成立 */
                expect(((a >>> 16) & b) !== 0).toBe(true);
                expect(((b >>> 16) & a) !== 0).toBe(true);
                expect(interacts(a, b)).toBe(true);
            }
        }

        for (const id of live) {
            const g = groups.get(id) as number;
            /* 同单位自身成员位不得与自身过滤掩码相交 → 同单位各部件互为无损 */
            expect(members(g) & filter(g)).toBe(0);
        }
    });

    it(`spawning exactly GROUP_UNIT_CAPACITY (${GROUP_UNIT_CAPACITY}) units succeeds; one more throws (fail loud)`, () => {
        const rig = makeRig();
        for (const id of ids(GROUP_UNIT_CAPACITY)) {
            rig.factory.spawn(bareSpec(id), id);
        }

        /* 第 GROUP_UNIT_CAPACITY + 1 个必须抛错，且消息点名容量——绝不静默复用成员位 */
        expect(() =>
            rig.factory.spawn(
                bareSpec(GROUP_UNIT_CAPACITY + 1),
                GROUP_UNIT_CAPACITY + 1
            )
        ).toThrow(new RegExp(`${GROUP_UNIT_CAPACITY}`));
    });

    it('despawned masks are reusable — refilling to capacity does not throw and interacts with every live unit (D-27)', () => {
        const rig = makeRig();
        const initial = ids(GROUP_UNIT_CAPACITY);
        for (const id of initial) {
            rig.factory.spawn(bareSpec(id), id);
        }

        /* 释放 5 个成员掩码 */
        const freed = initial.slice(0, 5);
        for (const id of freed) rig.factory.despawn(id);

        /* 再补 5 个（与释放数量相同）→ 不得抛错 */
        const refill: EntityId[] = [121, 122, 123, 124, 125];
        expect(() => {
            for (const id of refill) rig.factory.spawn(bareSpec(id), id);
        }).not.toThrow();

        const groups = groupsByEntity(rig.physics);
        const live = [...groups.keys()];
        expect(live.length).toBe(GROUP_UNIT_CAPACITY);
        for (const id of freed) expect(groups.has(id)).toBe(false);

        for (const newId of refill) {
            const g = groups.get(newId) as number;
            for (const otherId of live) {
                if (otherId === newId) continue;
                expect(interacts(g, groups.get(otherId) as number)).toBe(true);
            }
        }
    });

    it('two identical spawn/despawn sequences yield byte-identical collision-group values (order-stable, D-17)', () => {
        /**
         * 在同一构造序列上跑一个固定 spawn/despawn 操作流，返回存活单位的编码值。
         *
         * @param rig 测试台。
         * @returns 存活单位 id → 本体碰撞体分组编码。
         */
        const runSequence = (rig: ICollisionRig): Map<EntityId, number> => {
            for (const id of ids(20)) rig.factory.spawn(bareSpec(id), id);
            for (const id of [3, 7, 11]) rig.factory.despawn(id);
            for (const id of [21, 22, 23]) rig.factory.spawn(bareSpec(id), id);
            return groupsByEntity(rig.physics);
        };

        const first = runSequence(makeRig());
        const second = runSequence(makeRig());

        expect([...first.keys()].sort((a, b) => a - b)).toEqual(
            [...second.keys()].sort((a, b) => a - b)
        );
        for (const [id, groups] of first) {
            expect(second.get(id)).toBe(groups);
        }
    });
});
