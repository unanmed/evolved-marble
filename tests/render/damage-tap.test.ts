import { describe, expect, it } from 'vitest';

import type { IDamageContext, IDamageSink } from '@/control/types';
import type { IDamageEvent, IUnitState } from '@/physics/types';
import { ColliderPart } from '@/physics/types';
import { MAX_BUFFERED_DAMAGE_EVENTS } from '@/render/constants';
import { RenderDamageTap } from '@/render/DamageTap';
import { spawnUnit } from '@/units/spawn';
import type { IUnit } from '@/units/types';
import { ArmorKind, AttributeKind, ClassKind, WeaponKind } from '@/units/types';

import { mulberry32 } from '../helpers/rng';
import {
    makeApplyingSink,
    makeLethalSink,
    makeLookup,
    makeRejectingSink,
    makeUnitState
} from './fakes';

/** 真实单位生成用的固定种子。 */
const UNIT_SEED = 21;

/** 攻方在测试事件中的默认单位 id。 */
const ATTACKER_ID = 1;

/** 守方在测试事件与读数映射中的默认单位 id。 */
const DEFENDER_ID = 2;

/**
 * 生成一个固定种子的真实剑士（Phase 1 的生成路径）。
 * @param seed 随机种子。
 * @returns 真实的 `IUnit`。
 */
function realUnit(seed: number): IUnit {
    return spawnUnit(ClassKind.Swordsman, mulberry32(seed));
}

/**
 * 构造一条字段完整的物理伤害事件。
 * @param attackerId 攻方单位 id。
 * @param defenderId 守方单位 id。
 * @param damage 事件携带的伤害数值。
 * @returns 完整的 `IDamageEvent`。
 */
function makeEvent(
    attackerId: number,
    defenderId: number,
    damage: number
): IDamageEvent {
    return {
        attackerId,
        defenderId,
        attackerPart: ColliderPart.Weapon,
        defenderPart: ColliderPart.Body,
        weaponKind: undefined,
        armorKind: undefined,
        deltaV: 0,
        damageMean: damage,
        damage,
        damageReduced: 0
    };
}

/**
 * 构造一次完整的伤害上下文。
 * @param attacker 攻方单位。
 * @param defender 守方单位。
 * @param damage 事件中的伤害数值。
 * @param defenderId 事件中的守方 id（决定读数查询的键）。
 * @param overrides 需要覆盖的上下文字段。
 * @returns 完整的 `IDamageContext`。
 */
function makeContext(
    attacker: IUnit,
    defender: IUnit,
    damage: number,
    defenderId = DEFENDER_ID,
    overrides: Partial<IDamageContext> = {}
): IDamageContext {
    return {
        event: makeEvent(ATTACKER_ID, defenderId, damage),
        attacker,
        defender,
        attackerTeamId: 1,
        defenderTeamId: 2,
        ...overrides
    };
}

/**
 * 构造只包含给定守方的读数映射。
 * @param x 守方世界 x 坐标（米）。
 * @param y 守方世界 y 坐标（米）。
 * @returns unitId → 运动读数。
 */
function singleState(x: number, y: number): Map<number, IUnitState> {
    return new Map<number, IUnitState>([[DEFENDER_ID, makeUnitState(x, y)]]);
}

describe('render/damage-tap — only applied hits are recorded', () => {
    it('records nothing when the inner sink rejects the hit', () => {
        const attacker = realUnit(UNIT_SEED);
        const defender = realUnit(UNIT_SEED + 1);
        const tap = new RenderDamageTap(
            makeRejectingSink(),
            makeLookup(singleState(0, 0))
        );

        tap.applyDamage(makeContext(attacker, defender, 40));

        expect(tap.drain()).toEqual([]);
    });

    it('records exactly the HP lost for an applied hit', () => {
        const attacker = realUnit(UNIT_SEED + 2);
        const defender = realUnit(UNIT_SEED + 3);
        const before = defender.getAttribute(AttributeKind.Health);
        const tap = new RenderDamageTap(
            makeApplyingSink(20),
            makeLookup(singleState(12.5, -3.5))
        );

        tap.applyDamage(makeContext(attacker, defender, 20));

        const after = defender.getAttribute(AttributeKind.Health);
        const events = tap.drain();

        expect(events).toHaveLength(1);
        expect(events[0].damage).toBe(before - after);
        expect(events[0].killed).toBe(false);
        expect(events[0].attackerId).toBe(ATTACKER_ID);
        expect(events[0].defenderId).toBe(DEFENDER_ID);
        expect(events[0].x).toBe(12.5);
        expect(events[0].y).toBe(-3.5);
        expect(events[0].level).toBe(
            defender.getAttribute(AttributeKind.Level)
        );
    });

    it('records a killing blow with the position read before removal', () => {
        const attacker = realUnit(UNIT_SEED + 4);
        const defender = realUnit(UNIT_SEED + 5);
        const states = singleState(-12.5, 33.25);
        const tap = new RenderDamageTap(makeLethalSink(), makeLookup(states));

        tap.applyDamage(makeContext(attacker, defender, 0));

        const events = tap.drain();
        expect(events).toHaveLength(1);
        expect(events[0].killed).toBe(true);
        expect(events[0].level).toBe(
            defender.getAttribute(AttributeKind.Level)
        );
        expect(events[0].x).toBe(-12.5);
        expect(events[0].y).toBe(33.25);

        // 移除后（真实流程里 ControlSystem 随后注销单位）记录不受影响。
        states.clear();
        expect(events[0].x).toBe(-12.5);
        expect(events[0].y).toBe(33.25);
    });

    it('records nothing for an already dead defender whose HP cannot drop', () => {
        const attacker = realUnit(UNIT_SEED + 6);
        const defender = realUnit(UNIT_SEED + 7);
        defender.takeDamage(defender.getAttribute(AttributeKind.MaxHealth));
        expect(defender.isAlive()).toBe(false);

        const tap = new RenderDamageTap(
            makeApplyingSink(10),
            makeLookup(singleState(0, 0))
        );
        tap.applyDamage(makeContext(attacker, defender, 10));

        expect(tap.drain()).toEqual([]);
    });

    it('skips the event entirely when the physics state is missing', () => {
        const attacker = realUnit(UNIT_SEED + 8);
        const defender = realUnit(UNIT_SEED + 9);
        const tap = new RenderDamageTap(
            makeApplyingSink(10),
            makeLookup(new Map())
        );

        tap.applyDamage(makeContext(attacker, defender, 10));

        expect(tap.drain()).toEqual([]);
    });
});

describe('render/damage-tap — buffer and field fidelity', () => {
    it('caps the buffer and drops the oldest events first', () => {
        const cap = MAX_BUFFERED_DAMAGE_EVENTS;
        const attacker = realUnit(UNIT_SEED + 10);
        const defender = realUnit(UNIT_SEED + 11);
        const states = new Map<number, IUnitState>();
        for (let unitId = 0; unitId < cap + 10; unitId += 1) {
            states.set(unitId, makeUnitState(unitId, unitId * 2));
        }
        const tap = new RenderDamageTap(
            makeApplyingSink(0.1),
            makeLookup(states)
        );

        for (let unitId = 0; unitId < cap + 10; unitId += 1) {
            tap.applyDamage(makeContext(attacker, defender, 0.1, unitId));
        }

        const events = tap.drain();
        expect(events).toHaveLength(cap);
        expect(events[0].defenderId).toBe(10);
        expect(events[events.length - 1].defenderId).toBe(cap + 9);
    });

    it('drains into a fresh array and empties the buffer', () => {
        const attacker = realUnit(UNIT_SEED + 12);
        const defender = realUnit(UNIT_SEED + 13);
        const tap = new RenderDamageTap(
            makeApplyingSink(10),
            makeLookup(singleState(1, 1))
        );

        tap.applyDamage(makeContext(attacker, defender, 10));
        const first = tap.drain();
        const second = tap.drain();

        expect(first).toHaveLength(1);
        expect(second).toEqual([]);
        expect(first).not.toBe(second);
    });

    it('discards pending events on clear', () => {
        const attacker = realUnit(UNIT_SEED + 14);
        const defender = realUnit(UNIT_SEED + 15);
        const tap = new RenderDamageTap(
            makeApplyingSink(10),
            makeLookup(singleState(0, 0))
        );

        tap.applyDamage(makeContext(attacker, defender, 10));
        tap.clear();

        expect(tap.drain()).toEqual([]);
    });

    it('propagates an inner exception without recording anything', () => {
        const attacker = realUnit(UNIT_SEED + 16);
        const defender = realUnit(UNIT_SEED + 17);
        const throwing: IDamageSink = {
            applyDamage(): void {
                throw new Error('inner boom');
            }
        };
        const tap = new RenderDamageTap(
            throwing,
            makeLookup(singleState(0, 0))
        );

        expect(() =>
            tap.applyDamage(makeContext(attacker, defender, 30))
        ).toThrow('inner boom');
        expect(tap.drain()).toEqual([]);
    });

    it('copies teams, part, weapon and armour verbatim', () => {
        const attacker = realUnit(UNIT_SEED + 18);
        const defender = realUnit(UNIT_SEED + 19);
        const event: IDamageEvent = {
            ...makeEvent(7, DEFENDER_ID, 15),
            defenderPart: ColliderPart.Armor,
            weaponKind: WeaponKind.Bow,
            armorKind: ArmorKind.Shield
        };
        const context: IDamageContext = {
            event,
            attacker,
            defender,
            attackerTeamId: 7,
            defenderTeamId: 9
        };
        const tap = new RenderDamageTap(
            makeApplyingSink(15),
            makeLookup(singleState(4, -4))
        );

        tap.applyDamage(context);
        const [recorded] = tap.drain();

        expect(recorded.attackerId).toBe(7);
        expect(recorded.defenderId).toBe(DEFENDER_ID);
        expect(recorded.attackerTeamId).toBe(7);
        expect(recorded.defenderTeamId).toBe(9);
        expect(recorded.defenderPart).toBe(ColliderPart.Armor);
        expect(recorded.weaponKind).toBe(WeaponKind.Bow);
        expect(recorded.armorKind).toBe(ArmorKind.Shield);
    });
});
