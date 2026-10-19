import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { ColliderPart } from '@/physics/types';
import type {
    IContactEvent,
    IDamageEvent,
    IPhysicsTickResult,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { computeDamageMean, computeDamageReduction } from '@/physics/damage';
import { ARMOR_DEFS, WEAPON_DEFS } from '@/units/data';
import { ArmorKind, WeaponKind } from '@/units/types';
import type { IArmorDef, IWeaponDef } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

describe('PhysicsWorld — Δv damage events, armor vs body, one-strike exclusivity', () => {
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
     * 构造一个可复现的物理世界（固定种子注入 mulberry32）。
     * @returns 新的 `PhysicsWorld`。
     */
    function createWorld(): PhysicsWorld {
        return new PhysicsWorld(
            { dt: DT, geometry: DEFAULT_GEOMETRY },
            mulberry32(20260606)
        );
    }

    /**
     * 构造一个数值型注册输入（本体质量 70，无单位类引用，D-07）。
     * @param unitId 单位 id。
     * @param x 生成位置 x。
     * @param y 生成位置 y。
     * @param weapon 武器定义或 `null`。
     * @param armors 防具定义数组。
     * @returns 注册输入。
     */
    function makeSpec(
        unitId: number,
        x: number,
        y: number,
        weapon: IWeaponDef | null,
        armors: readonly IArmorDef[] = []
    ): IUnitPhysicsSpec {
        return {
            unitId,
            x,
            y,
            mass: 70,
            attack: 60,
            weaponRatio: 1,
            defense: 24,
            armorRatio: 0.8,
            weapon,
            armors
        };
    }

    /**
     * 读取单位状态，未知 id 直接抛错以便测试断言处收窄类型。
     * @param w 物理世界。
     * @param unitId 单位 id。
     * @returns 该单位的运动学读数。
     */
    function stateOf(w: PhysicsWorld, unitId: number): IUnitState {
        const state = w.getUnitState(unitId);
        if (state === null) {
            throw new Error(`expected unit ${unitId} to be registered`);
        }
        return state;
    }

    /**
     * 判断一条无序接触事件是否恰为两个单位的指定部位组合（A/B 顺序无关）。
     * @param contact 接触事件。
     * @param unitAId 期望的一侧单位 id。
     * @param unitBId 期望的另一侧单位 id。
     * @param partAId `unitAId` 一侧期望的部位。
     * @param partBId `unitBId` 一侧期望的部位。
     * @returns 该接触是否与期望配对匹配。
     */
    function touchesPair(
        contact: IContactEvent,
        unitAId: number,
        unitBId: number,
        partAId: ColliderPart,
        partBId: ColliderPart
    ): boolean {
        return (
            (contact.unitAId === unitAId &&
                contact.unitBId === unitBId &&
                contact.partA === partAId &&
                contact.partB === partBId) ||
            (contact.unitAId === unitBId &&
                contact.unitBId === unitAId &&
                contact.partA === partBId &&
                contact.partB === partAId)
        );
    }

    /**
     * 每步对攻方施加恒定线力并推进，直到本步为 `(attackerId, defenderId)` 产生伤害事件。
     * @param w 物理世界。
     * @param attackerId 攻方单位 id。
     * @param defenderId 守方单位 id。
     * @param forceX 每步施加的 +x 线力。
     * @param maxTicks 最大推进步数。
     * @returns 命中步的伤害事件与其完整 tick 结果；未命中返回 `null`。
     */
    function driveUntilDamage(
        w: PhysicsWorld,
        attackerId: number,
        defenderId: number,
        forceX: number,
        maxTicks: number
    ): { event: IDamageEvent; result: IPhysicsTickResult } | null {
        for (let i = 0; i < maxTicks; i++) {
            w.applyForce(attackerId, forceX, 0);
            const result = w.tick();
            const event = result.damages.find(
                damage =>
                    damage.attackerId === attackerId &&
                    damage.defenderId === defenderId
            );
            if (event !== undefined) {
                return { event, result };
            }
        }
        return null;
    }

    it('emits a Weapon↔Body damage event for an unarmored hit — no armorKind, zero reduction, finite non-negative numbers', () => {
        const w = createWorld();
        world = w;
        const attackerId = 1;
        const defenderId = 2;
        const weapon = WEAPON_DEFS[WeaponKind.Longsword];
        // 攻方武器 capsule 指向 +x（局部偏移 0.7）；守方无防具，仅武器↔本体可命中。
        w.registerUnit(makeSpec(attackerId, 0, 0, weapon, []));
        w.registerUnit(makeSpec(defenderId, 3, 0, null, []));

        const hit = driveUntilDamage(w, attackerId, defenderId, 3000, 80);
        expect(hit).not.toBeNull();
        if (hit === null) {
            throw new Error(
                'expected a weapon↔body damage event within the tick bound'
            );
        }
        const { event, result } = hit;

        expect(event.attackerId).toBe(attackerId);
        expect(event.defenderId).toBe(defenderId);
        expect(event.attackerPart).toBe(ColliderPart.Weapon);
        expect(event.defenderPart).toBe(ColliderPart.Body);
        expect(event.weaponKind).toBe(WeaponKind.Longsword);
        // 击中本体不减伤：无 armorKind、damageReduced 为 0（D-11）。
        expect(event.armorKind).toBeUndefined();
        expect(event.damageReduced).toBe(0);
        // 一次打击每 tick 每配对至多一个伤害事件。
        expect(
            result.damages.filter(
                damage =>
                    damage.attackerId === attackerId &&
                    damage.defenderId === defenderId
            )
        ).toHaveLength(1);

        // 全部数值有限且非负（数据完整性护栏）。
        expect(Number.isFinite(event.deltaV)).toBe(true);
        expect(event.deltaV).toBeGreaterThan(0);
        expect(Number.isFinite(event.damageMean)).toBe(true);
        expect(event.damageMean).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(event.damage)).toBe(true);
        expect(event.damage).toBeGreaterThanOrEqual(0);

        // damageMean 与按事件自身 deltaV 重算的公式一致。
        const expectedMean = computeDamageMean(
            60,
            1,
            weapon.attackRatio,
            event.deltaV
        );
        expect(event.damageMean).toBeCloseTo(expectedMean, 6);
    });

    it('emits a Weapon↔Armor damage event for an armored hit — defined armorKind, positive reduction matching the formula', () => {
        const w = createWorld();
        world = w;
        const attackerId = 1;
        const defenderId = 2;
        const weapon = WEAPON_DEFS[WeaponKind.Longsword];
        const helmet = ARMOR_DEFS[ArmorKind.Helmet];
        // 守方防具圆（0.55）包住本体圆（0.5）：一次打击可能同时接触两者，
        // 但 02-06 守卫只发出减伤的护甲事件（本体事件被抑制）。
        w.registerUnit(makeSpec(attackerId, 0, 0, weapon, []));
        w.registerUnit(makeSpec(defenderId, 3, 0, null, [helmet]));

        const hit = driveUntilDamage(w, attackerId, defenderId, 3000, 80);
        expect(hit).not.toBeNull();
        if (hit === null) {
            throw new Error(
                'expected a weapon↔armor damage event within the tick bound'
            );
        }
        const { event, result } = hit;

        expect(event.attackerPart).toBe(ColliderPart.Weapon);
        expect(event.defenderPart).toBe(ColliderPart.Armor);
        expect(event.armorKind).toBe(ArmorKind.Helmet);
        expect(event.damageReduced).toBeGreaterThan(0);
        // 命中护甲：最终伤害小于减伤前伤害。
        expect(event.damage).toBeLessThan(event.damage + event.damageReduced);
        expect(
            result.damages.filter(
                damage =>
                    damage.attackerId === attackerId &&
                    damage.defenderId === defenderId
            )
        ).toHaveLength(1);

        // 减伤关系：damageReduced ≈ computeDamageReduction(damage + damageReduced, ...)。
        const recomputed = computeDamageReduction(
            event.damage + event.damageReduced,
            24,
            0.8,
            helmet.defenseRatio,
            weapon.penetration[ArmorKind.Helmet]
        );
        expect(event.damageReduced).toBeCloseTo(recomputed, 6);
    });

    it('emits exactly one damage event per pair per tick and lets the armor hit win over the enclosed body hit', () => {
        const w = createWorld();
        world = w;
        const attackerId = 1;
        const defenderId = 2;
        // 重锤攻方（本体 70 + 锤 25 = 95）在短斜坡内加速到 ≈20 m/s 的闭合速度；
        // 头盔守方：0.05m 的护甲−本体间距在该速度下被同一步跨过，两个接触同一步发生。
        w.registerUnit(
            makeSpec(attackerId, 0, 0, WEAPON_DEFS[WeaponKind.Hammer], [])
        );
        w.registerUnit(
            makeSpec(defenderId, 4, 0, null, [ARMOR_DEFS[ArmorKind.Helmet]])
        );

        const force = 7000;
        let coOccurrenceSeen = false;
        let damageEventSeen = false;
        for (let i = 0; i < 80; i++) {
            w.applyForce(attackerId, force, 0);
            const result = w.tick();
            const pairEvents = result.damages.filter(
                damage =>
                    damage.attackerId === attackerId &&
                    damage.defenderId === defenderId
            );

            // 每 tick 每配对的不变量：至多一个伤害事件。
            expect(pairEvents.length).toBeLessThanOrEqual(1);
            if (pairEvents.length > 0) {
                damageEventSeen = true;
            }

            const hasWeaponArmor = result.contacts.some(contact =>
                touchesPair(
                    contact,
                    attackerId,
                    defenderId,
                    ColliderPart.Weapon,
                    ColliderPart.Armor
                )
            );
            const hasWeaponBody = result.contacts.some(contact =>
                touchesPair(
                    contact,
                    attackerId,
                    defenderId,
                    ColliderPart.Weapon,
                    ColliderPart.Body
                )
            );

            if (hasWeaponArmor && hasWeaponBody) {
                coOccurrenceSeen = true;
                // 同一步同时命中护甲与本体：恰好一个事件，且为减伤的护甲事件。
                expect(pairEvents).toHaveLength(1);
                expect(pairEvents[0].defenderPart).toBe(ColliderPart.Armor);
                expect(pairEvents[0].armorKind).toBeDefined();
                expect(pairEvents[0].damageReduced).toBeGreaterThan(0);
                // 本体伤害事件被抑制，绝不同步发出。
                expect(
                    pairEvents.some(
                        damage => damage.defenderPart === ColliderPart.Body
                    )
                ).toBe(false);
            }
        }

        expect(damageEventSeen).toBe(true);
        // 共现是必需条件而非期望：若未观察到，需提高闭合速度而不是删除断言。
        expect(coOccurrenceSeen).toBe(true);
    });

    it('emits no damage for a weapon↔weapon contact even though the contact is reported', () => {
        const w = createWorld();
        world = w;
        const weapon = WEAPON_DEFS[WeaponKind.Hammer];
        // 两把武器同为局部 x=0.7 处的竖直 capsule；并肩错开 0.85m 使其彼此接触，
        // 而两本体圆（间距 0.85 < 1.0）亦接触——本体↔本体不产生伤害（D-13/OQ-4）。
        w.registerUnit(makeSpec(1, 0, 0, weapon, []));
        w.registerUnit(makeSpec(2, 0, 0.85, weapon, []));

        const result = w.tick();
        const weaponWeapon = result.contacts.some(contact =>
            touchesPair(contact, 1, 2, ColliderPart.Weapon, ColliderPart.Weapon)
        );
        expect(weaponWeapon).toBe(true);
        expect(result.damages).toHaveLength(0);
    });

    it('skips the damage event when contactPair yields no manifold (never a zero-damage event)', () => {
        const w = createWorld();
        world = w;
        const attackerId = 1;
        const defenderId = 2;
        // 出生即重叠：首步必产生 `started` 碰撞事件，从而进入伤害分支。
        w.registerUnit(
            makeSpec(attackerId, 0, 0, WEAPON_DEFS[WeaponKind.Longsword], [])
        );
        w.registerUnit(makeSpec(defenderId, 1, 0, null, []));

        // 模拟「配对已不再存在流形」：令 `contactPair` 永不调用其回调。真实的
        // 「碰撞体解析失败 → 无流形」路径难以确定性构造，故在此直接行使该守卫。
        const originalContactPair = RAPIER.World.prototype.contactPair;
        RAPIER.World.prototype.contactPair = () => {
            // 故意不调用回调：模拟无流形时的 `hasNormal === false`。
        };
        try {
            const result = w.tick();
            // 接触事件照常发出（在伤害分支之前），说明确实进入了伤害分支。
            expect(
                result.contacts.some(contact =>
                    touchesPair(
                        contact,
                        attackerId,
                        defenderId,
                        ColliderPart.Weapon,
                        ColliderPart.Body
                    )
                )
            ).toBe(true);
            // 无流形 → 跳过该配对：绝不发出 deltaV = 0 的伪伤害事件。
            expect(
                result.damages.filter(
                    damage =>
                        damage.attackerId === attackerId &&
                        damage.defenderId === defenderId
                )
            ).toHaveLength(0);
        } finally {
            RAPIER.World.prototype.contactPair = originalContactPair;
        }
    });

    it('advances exactly one fixed step: vx ≈ force/mass × DT, then repeated ticks advance the position', () => {
        const w = createWorld();
        world = w;
        // 裸装单位：本体质量 70（无武器/防具）。
        w.registerUnit(makeSpec(1, 0, 0, null, []));

        const force = 60;
        w.applyForce(1, force, 0);
        w.tick();
        const afterOne = stateOf(w, 1);
        expect(Number.isFinite(afterOne.vx)).toBe(true);
        expect(afterOne.vx).toBeGreaterThan(0);
        // 单步速度 ≈ F / m · dt（松容差，f32 求解器噪声；绝不用精确相等，Pitfall 5）。
        expect(afterOne.vx).toBeCloseTo((force / 70) * DT, 3);

        // 连续每步施力：位移单调递增（无 wall-clock 输入）。
        let prevX = afterOne.x;
        for (let i = 0; i < 10; i++) {
            w.applyForce(1, force, 0);
            w.tick();
            const state = stateOf(w, 1);
            expect(state.x).toBeGreaterThan(prevX);
            prevX = state.x;
        }
    });
});
