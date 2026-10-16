import { beforeAll, describe, expect, it } from 'vitest';
import { FIXED_DT } from '../../src/config/sim';
import { ArmorSubtype, EventLog, PartKind } from '../../src/sim/core/events';
import { initPhysics, rapierVersion } from '../../src/sim/world/physics-init';
import { ContactBridge } from '../../src/sim/world/contact';
import { PhysicsWorld } from '../../src/sim/world/physics-world';
import { runPhysics } from '../helpers/run-physics';

/**
 * 物理确定性门禁（PHYS-01/02/03；D-19/D-20/D-25）。
 *
 * 在一条薄切片上端到端证明整套物理架构：复合刚体装配 + 部位打标 + 类型化接触事件
 * （含步前 Δv）+ 同机双跑确定性。断言（研究 §Code Examples + 本计划验收标准）：
 *   1. 同场景双跑 → 逐 tick 位姿轨迹完全相同 **且** Rapier `takeSnapshot()` 指纹相同（D-20 双指纹）。
 *   2. 至少一次类型化接触事件，两侧部位标记已设且 `dv > 0`（PHYS-02）。
 *   3. 存在一次"武器 vs 防具"接触，名为正确部位（PHYS-02 / must_have）。
 *   4. 反空门禁：位姿轨迹非常量（状态确实在演化）。
 *   5. 武器确实在动（摆动产生非零角速度，D-25）。
 *   6. 版本冒烟（D-19）：版本被精确钉定。
 *   7. `ContactBridge.lookup` 对未登记句柄返回 `null`（绝不抛错，T-02-01）。
 */

/** 每条轨迹推进的 tick 数（足够单位闭合相撞并完成数次抡击）。 */
const TICKS = 150;

describe('physics gate (PHYS-01/02/03)', () => {
    beforeAll(async () => {
        await initPhysics();
    });

    it('same scenario double-run → identical pose trace AND identical Rapier snapshot hash (D-20)', () => {
        const a = runPhysics({ ticks: TICKS });
        const b = runPhysics({ ticks: TICKS });
        expect(a.poseTrace).toEqual(b.poseTrace);
        expect(a.rapierHash).toBe(b.rapierHash);
    });

    it('emits ≥1 typed part-tagged contact with dv > 0 (PHYS-02)', () => {
        const result = runPhysics({ ticks: TICKS });
        const hits = result.contacts.filter(c => c.dv > 0);
        expect(hits.length).toBeGreaterThan(0);
        const parts: readonly PartKind[] = [
            PartKind.Body,
            PartKind.Weapon,
            PartKind.Armor
        ];
        for (const hit of hits) {
            expect(parts).toContain(hit.partA);
            expect(parts).toContain(hit.partB);
        }
    });

    it('a weapon-vs-armor contact names the correct parts (PHYS-02)', () => {
        const result = runPhysics({ ticks: TICKS });
        const weaponArmor = result.contacts.find(
            c =>
                (c.partA === PartKind.Weapon && c.partB === PartKind.Armor) ||
                (c.partA === PartKind.Armor && c.partB === PartKind.Weapon)
        );
        expect(weaponArmor).toBeDefined();
        expect(weaponArmor?.dv).toBeGreaterThan(0);
    });

    it('anti-vacuous: pose trace is not constant', () => {
        const result = runPhysics({ ticks: TICKS });
        expect(new Set(result.poseTrace).size).toBeGreaterThan(1);
    });

    it('weapon swings: produces non-zero angular velocity over the run (D-25)', () => {
        const result = runPhysics({ ticks: TICKS });
        const maxAbs = Math.max(
            ...result.weaponAngularSpeeds.map(v => Math.abs(v))
        );
        expect(maxAbs).toBeGreaterThan(0);
    });

    it('version smoke: Rapier is exact-pinned (D-19)', () => {
        expect(rapierVersion()).toBe('0.21.0');
    });

    it('ContactBridge.lookup resolves registered parts and returns null for unregistered handles (PHYS-01 / T-02-01)', () => {
        const physics = new PhysicsWorld(FIXED_DT);
        const bridge = new ContactBridge(physics, new EventLog());
        const partRef = {
            entityId: 7,
            part: PartKind.Armor,
            armorSubtype: ArmorSubtype.Shield
        };
        bridge.register(123, partRef);
        expect(bridge.lookup(123)).toEqual(partRef);
        expect(bridge.lookup(999999)).toBeNull();
    });
});
