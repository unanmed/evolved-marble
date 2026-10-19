import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { ColliderPart } from '@/physics/types';
import type { IContactEvent, IUnitPhysicsSpec } from '@/physics/types';
import { ARMOR_DEFS, WEAPON_DEFS } from '@/units/data';
import { ArmorKind, WeaponKind } from '@/units/types';
import type { IArmorDef, IWeaponDef } from '@/units/types';
import { mulberry32 } from '../helpers/rng';

describe('PhysicsWorld — part-tagged contact events without self-contacts', () => {
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
            mulberry32(2026)
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
     * 连续推进若干步并汇总本步产生的全部碰撞事件。
     * @param w 物理世界。
     * @param ticks 步数。
     * @returns 汇总后的碰撞事件（保留原始 A/B 顺序）。
     */
    function tickMany(w: PhysicsWorld, ticks: number): IContactEvent[] {
        const collected: IContactEvent[] = [];
        for (let i = 0; i < ticks; i++) {
            collected.push(...w.tick().contacts);
        }
        return collected;
    }

    it('emits a part-tagged Weapon↔Body contact for a scripted overlap', () => {
        const w = createWorld();
        world = w;
        // 单位 1 的武器 capsule（局部 x 偏移 0.7）在 x≈0.65..0.75 处，
        // 与单位 2 半径 0.5 的本体圆（x≈0.5..1.5）在出生时即重叠。
        w.registerUnit(makeSpec(1, 0, 0, WEAPON_DEFS[WeaponKind.Longsword]));
        w.registerUnit(makeSpec(2, 1, 0, null));

        const contacts = w.tick().contacts;
        expect(contacts.length).toBeGreaterThan(0);

        const weaponBody = contacts.find(
            contact =>
                (contact.partA === ColliderPart.Weapon &&
                    contact.partB === ColliderPart.Body) ||
                (contact.partA === ColliderPart.Body &&
                    contact.partB === ColliderPart.Weapon)
        );
        expect(weaponBody).toBeDefined();
        if (weaponBody === undefined) {
            throw new Error('expected a Weapon↔Body contact');
        }

        // 接触层 A/B 无序：只断言两侧单位集合，不假设攻守顺序。
        expect(new Set([weaponBody.unitAId, weaponBody.unitBId])).toEqual(
            new Set([1, 2])
        );
        expect(new Set([weaponBody.partA, weaponBody.partB])).toEqual(
            new Set([ColliderPart.Weapon, ColliderPart.Body])
        );
    });

    it('never emits a same-unit self contact across several ticks', () => {
        const w = createWorld();
        world = w;
        // 同一刚体上叠加本体 / 武器 / 防具三个碰撞体。
        w.registerUnit(
            makeSpec(1, 0, 0, WEAPON_DEFS[WeaponKind.Hammer], [
                ARMOR_DEFS[ArmorKind.Helmet]
            ])
        );
        w.registerUnit(makeSpec(2, 1, 0, null));

        const contacts = tickMany(w, 5);
        expect(contacts.length).toBeGreaterThan(0);
        for (const contact of contacts) {
            expect(contact.unitAId).not.toBe(contact.unitBId);
        }
    });

    it('emits no contact for a lone unit (intra-unit colliders never pair)', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(
            makeSpec(1, 0, 0, WEAPON_DEFS[WeaponKind.Spear], [
                ARMOR_DEFS[ArmorKind.Helmet]
            ])
        );

        expect(tickMany(w, 5)).toHaveLength(0);
    });

    it('tags both sides of every contact with a valid ColliderPart', () => {
        const w = createWorld();
        world = w;
        w.registerUnit(makeSpec(1, 0, 0, WEAPON_DEFS[WeaponKind.Longsword]));
        w.registerUnit(makeSpec(2, 1, 0, null));

        const contacts = tickMany(w, 3);
        expect(contacts.length).toBeGreaterThan(0);

        const validParts = [
            ColliderPart.Body,
            ColliderPart.Weapon,
            ColliderPart.Armor
        ];
        for (const contact of contacts) {
            expect(Number.isInteger(contact.partA)).toBe(true);
            expect(Number.isInteger(contact.partB)).toBe(true);
            expect(validParts).toContain(contact.partA);
            expect(validParts).toContain(contact.partB);
        }
    });
});
