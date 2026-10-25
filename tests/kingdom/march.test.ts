import RAPIER from '@dimforge/rapier2d-compat';
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import type {
    IDamageContext,
    IDamageSink,
    IUnitAI,
    IUnitAIProvider
} from '@/control/types';
import {
    ARMY_FORMATION_RADIUS,
    MAP_HEIGHT,
    MAP_WIDTH
} from '@/kingdom/constants';
import { Army, advanceArmyCenter, computeFormationSlots } from '@/kingdom/Army';
import { IdleAI } from '@/kingdom/IdleAI';
import { MarchAI } from '@/kingdom/MarchAI';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import { ArmyOrderKind, CityKind } from '@/kingdom/types';
import type { IScenario, IVec2 } from '@/kingdom/types';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { spawnUnit } from '@/units/spawn';
import type { IUnit } from '@/units/types';
import { AttributeKind, ClassKind } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { createKingdom } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 测试用行军夹具：真实物理 + 王国感知 + 控制系统 + 一支由 MarchAI 驱动的军队。
 */
interface IMarchRig {
    /** 真实 Rapier 物理世界。 */
    physics: PhysicsWorld;
    /** 控制系统（每 tick 重施加 AI 动作）。 */
    control: ControlSystem;
    /** 被测军队。 */
    army: Army;
    /** 名册单位 id（升序）。 */
    unitIds: number[];
    /** 当前阵型槽位表（每子步重算，MarchAI 经闭包读取）。 */
    slots: Map<number, IVec2>;
}

/**
 * 只创建待命 AI 的 Provider：注册后立即被 `setUnitAI` 换成 `MarchAI`。
 */
class IdleProvider implements IUnitAIProvider {
    /**
     * 为注册单位创建一个待命 AI。
     * @param _unitId 单位 id（未使用）。
     * @param _unit 单位实例（未使用）。
     * @returns 新的 `IdleAI`。
     */
    create(_unitId: number, _unit: IUnit): IUnitAI {
        return new IdleAI();
    }

    /**
     * 无内部状态需要释放。
     * @param _unitId 单位 id（未使用）。
     */
    destroy(_unitId: number): void {
        // 无状态。
    }
}

/**
 * 空伤害接收方：行军测试不关心伤害，只保证控制循环可运行。
 */
class NoopDamageSink implements IDamageSink {
    /**
     * 丢弃所有伤害。
     * @param _context 已解析的伤害上下文（未使用）。
     */
    applyDamage(_context: IDamageContext): void {
        // 行军测试不结算伤害。
    }
}

/**
 * 构造一支由真实物理驱动的行军夹具：单位以 3 m 环围绕中心注册。
 * @param centerX 军队初始中心 x 坐标（米）。
 * @param centerY 军队初始中心 y 坐标（米）。
 * @param heading 军队初始朝向（弧度）。
 * @param count 单位数量。
 * @returns 已安装 `MarchAI` 的夹具。
 */
function createRig(
    centerX: number,
    centerY: number,
    heading: number,
    count: number
): IMarchRig {
    const physics = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(4242)
    );
    const control = new ControlSystem(
        physics,
        new KingdomSensingWorld(MAP_WIDTH, MAP_HEIGHT, []),
        new IdleProvider(),
        new NoopDamageSink()
    );

    const unitIds: number[] = [];
    for (let index = 0; index < count; index += 1) {
        const unitId = index + 1;
        const angle = (Math.PI * 2 * index) / count;
        control.registerUnit({
            unitId,
            unit: spawnUnit(ClassKind.Swordsman, mulberry32(seedFor(unitId))),
            teamId: 1,
            x: centerX + Math.cos(angle) * 3,
            y: centerY + Math.sin(angle) * 3
        });
        unitIds.push(unitId);
    }

    const army = new Army(1, 1, centerX, centerY, heading, () => undefined);
    army.setUnitIds(unitIds);

    const rig: IMarchRig = {
        physics,
        control,
        army,
        unitIds,
        slots: computeFormationSlots(
            centerX,
            centerY,
            heading,
            unitIds,
            ARMY_FORMATION_RADIUS
        )
    };
    for (const unitId of unitIds) {
        control.setUnitAI(
            unitId,
            new MarchAI(unitId, id => rig.slots.get(id) ?? null)
        );
    }
    return rig;
}

/**
 * 由单位 id 生成稳定的随机种子（让生成属性可复现）。
 * @param unitId 单位 id。
 * @returns 种子。
 */
function seedFor(unitId: number): number {
    return 1000 + unitId * 17;
}

/**
 * 推进一个游戏分钟：中心按 10 m/h 前进、重算槽位、跑一个控制 tick。
 * @param rig 夹具。
 * @param targetX 目标 x（`null` 表示无目标）。
 * @param targetY 目标 y（`null` 表示无目标）。
 */
function marchStep(
    rig: IMarchRig,
    targetX: number | null,
    targetY: number | null
): void {
    const center = rig.army.getCenter();
    const next = advanceArmyCenter(
        center.x,
        center.y,
        rig.army.getHeading(),
        targetX,
        targetY,
        1,
        MAP_WIDTH,
        MAP_HEIGHT
    );
    rig.army.setCenter(next.x, next.y);
    rig.army.setHeading(next.heading);
    rig.slots = computeFormationSlots(
        next.x,
        next.y,
        next.heading,
        rig.army.getUnitIds(),
        ARMY_FORMATION_RADIUS
    );
    rig.control.tick();
}

/**
 * 夹具持有者：每个测试结束后统一释放。
 */
let rig: IMarchRig | null = null;

describe('march — real Rapier formation control', () => {
    beforeAll(async () => {
        // WASM 必须在使用任何 Rapier 方法前异步加载完成（init 幂等）。
        await RAPIER.init();
    });

    afterEach(() => {
        rig?.control.dispose();
        rig?.physics.dispose();
        rig = null;
    });

    it('advances the centre 100 m in 600 game minutes while units stay in the disc', () => {
        const created = createRig(300, 500, 0, 4);
        rig = created;

        for (let minute = 0; minute < 600; minute += 1) {
            marchStep(created, 700, 500);
        }

        const center = created.army.getCenter();
        expect(Math.abs(center.x - 300 - 100)).toBeLessThanOrEqual(2);
        expect(center.y).toBeCloseTo(500, 6);

        for (const unitId of created.unitIds) {
            const state = created.physics.getUnitState(unitId);
            expect(state).not.toBeNull();
            if (state === null) {
                continue;
            }
            const distance = Math.hypot(state.x - center.x, state.y - center.y);
            expect(distance).toBeLessThanOrEqual(ARMY_FORMATION_RADIUS);
        }
    });

    it('converges every unit inside the 25 m circle within 60 ticks', () => {
        const created = createRig(300, 500, 0, 4);
        rig = created;

        for (let minute = 0; minute < 60; minute += 1) {
            marchStep(created, 700, 500);
        }

        const center = created.army.getCenter();
        for (const unitId of created.unitIds) {
            const state = created.physics.getUnitState(unitId);
            expect(state).not.toBeNull();
            if (state === null) {
                continue;
            }
            const distance = Math.hypot(state.x - center.x, state.y - center.y);
            expect(distance).toBeLessThanOrEqual(ARMY_FORMATION_RADIUS);
        }
    });

    it('reports the travel direction as the heading so the strategic arrow follows the march', () => {
        const created = createRig(300, 500, Math.PI / 4, 4);
        rig = created;

        // 初始朝向 π/4 与实际目标方向无关；第一步之后必须改写成行进方向。
        marchStep(created, 700, 700);

        const center = created.army.getCenter();
        const heading = created.army.getHeading();
        expect(center.x).toBeGreaterThan(300);
        expect(center.y).toBeGreaterThan(500);
        expect(heading).toBeCloseTo(
            Math.atan2(center.y - 500, center.x - 300),
            9
        );
        expect(heading).toBeCloseTo(Math.atan2(700 - 500, 700 - 300), 9);

        // 方向不变时每步重复写入同一个角度，不会漂移。
        for (let minute = 0; minute < 30; minute += 1) {
            marchStep(created, 700, 700);
        }
        expect(created.army.getHeading()).toBeCloseTo(
            Math.atan2(700 - 500, 700 - 300),
            9
        );
    });

    it('freezes the centre on Hold while the physics keeps stepping', () => {
        const created = createRig(300, 500, 0, 4);
        rig = created;

        for (let minute = 0; minute < 30; minute += 1) {
            marchStep(created, 700, 500);
        }
        const held = created.army.getCenter();

        for (let minute = 0; minute < 30; minute += 1) {
            marchStep(created, null, null);
        }

        const after = created.army.getCenter();
        expect(after.x).toBe(held.x);
        expect(after.y).toBe(held.y);
        for (const unitId of created.unitIds) {
            const state = created.physics.getUnitState(unitId);
            expect(state).not.toBeNull();
            if (state === null) {
                continue;
            }
            const distance = Math.hypot(state.x - after.x, state.y - after.y);
            expect(distance).toBeLessThanOrEqual(ARMY_FORMATION_RADIUS);
        }
    });

    it('bounces off the edge and keeps advancing along the reflected heading', () => {
        const created = createRig(900, 500, 0, 2);
        rig = created;

        // 1/6 m per game minute: 600 minutes reach the east edge.
        for (let minute = 0; minute < 620; minute += 1) {
            marchStep(created, 2000, 500);
            const center = created.army.getCenter();
            expect(center.x).toBeGreaterThanOrEqual(0);
            expect(center.x).toBeLessThanOrEqual(MAP_WIDTH);
            expect(center.y).toBeGreaterThanOrEqual(0);
            expect(center.y).toBeLessThanOrEqual(MAP_HEIGHT);
        }

        const bounced = created.army.getCenter();
        expect(Math.cos(created.army.getHeading())).toBeLessThan(0);

        for (let minute = 0; minute < 120; minute += 1) {
            marchStep(created, 2000, 500);
        }

        const after = created.army.getCenter();
        const inward = bounced.x - after.x;
        expect(inward).toBeGreaterThan(10);
        expect(after.x).toBeLessThanOrEqual(MAP_WIDTH);

        // 反射后的朝向就是实际位移方向（箭头指向真正前进的方向）。
        const beforeStep = created.army.getCenter();
        marchStep(created, 2000, 500);
        const afterStep = created.army.getCenter();
        expect(created.army.getHeading()).toBeCloseTo(
            Math.atan2(afterStep.y - beforeStep.y, afterStep.x - beforeStep.x),
            9
        );
        expect(afterStep.x).toBeLessThan(beforeStep.x);
    });

    it('keeps every roster id from start to finish', () => {
        const created = createRig(300, 500, 0, 4);
        rig = created;

        for (let minute = 0; minute < 60; minute += 1) {
            marchStep(created, 700, 500);
        }

        expect(created.army.getUnitIds()).toEqual(created.unitIds);
    });
});

describe('kingdom — march and battle healing on game time', () => {
    /** 当前用例持有的王国夹具。 */
    let kingdom: IKingdomFixture | null = null;

    /**
     * 构造回血场景：两势力、各一城（一方有地形空表）、无地形；
     * 敌方默认远在另一角，只有显式放到 50 m 的用例才会开战。
     * @param options 位置选项。
     * @returns 场景表。
     */
    function healingScenario(options: {
        armyX: number;
        armyY: number;
        cityX: number;
        cityY: number;
        enemyX: number;
        enemyY: number;
        enemyUnits?: number;
    }): IScenario {
        return {
            width: 1000,
            height: 1000,
            factions: [
                { id: 1, name: 'Red' },
                { id: 2, name: 'Blue' }
            ],
            cities: [
                {
                    id: 1,
                    factionId: 1,
                    x: options.cityX,
                    y: options.cityY,
                    kind: CityKind.Normal,
                    garrisonCap: 10,
                    trainingClass: ClassKind.Swordsman
                },
                {
                    id: 2,
                    factionId: 2,
                    x: 950,
                    y: 50,
                    kind: CityKind.Normal,
                    garrisonCap: 10,
                    trainingClass: ClassKind.Swordsman
                }
            ],
            armies: [
                {
                    id: 1,
                    factionId: 1,
                    x: options.armyX,
                    y: options.armyY,
                    heading: 0,
                    units: [{ classKind: ClassKind.Swordsman, count: 4 }]
                },
                {
                    id: 2,
                    factionId: 2,
                    x: options.enemyX,
                    y: options.enemyY,
                    heading: 0,
                    units: [
                        {
                            classKind: ClassKind.Swordsman,
                            count: options.enemyUnits ?? 1
                        }
                    ]
                }
            ],
            terrain: []
        };
    }

    /**
     * 构造并登记回血夹具。
     * @param options 位置选项。
     * @returns 已接线的夹具。
     */
    function createHealingKingdom(options: {
        armyX: number;
        armyY: number;
        cityX: number;
        cityY: number;
        enemyX: number;
        enemyY: number;
        enemyUnits?: number;
    }): IKingdomFixture {
        kingdom = createKingdom({
            scenario: healingScenario(options),
            seed: 41
        });
        return kingdom;
    }

    /**
     * 读取单位生命值。
     * @param target 夹具。
     * @param unitId 单位 id。
     * @returns 生命值。
     */
    function healthOf(target: IKingdomFixture, unitId: number): number {
        const unit = target.control.getUnit(unitId);
        if (unit === null) {
            throw new Error(`unit ${unitId} is not registered`);
        }
        return unit.getAttribute(AttributeKind.Health);
    }

    /**
     * 让名册内每个单位失去相同生命值，制造回血余量。
     * @param target 夹具。
     * @param unitIds 单位 id 列表。
     * @param amount 扣除量。
     */
    function damageAll(
        target: IKingdomFixture,
        unitIds: readonly number[],
        amount: number
    ): void {
        for (const unitId of unitIds) {
            const unit = target.control.getUnit(unitId);
            if (unit === null) {
                throw new Error(`unit ${unitId} is not registered`);
            }
            unit.takeDamage(amount);
        }
    }

    beforeAll(async () => {
        await RAPIER.init();
    });

    afterEach(() => {
        if (kingdom !== null) {
            kingdom.world.dispose();
            kingdom.control.dispose();
            kingdom.physics.dispose();
            kingdom = null;
        }
    });

    it('heals a marching army at roughly 1/h', () => {
        const created = createHealingKingdom({
            armyX: 200,
            armyY: 300,
            cityX: 100,
            cityY: 100,
            enemyX: 900,
            enemyY: 100
        });
        created.world.issueOrder({
            armyId: 1,
            kind: ArmyOrderKind.MoveTo,
            targetX: 900,
            targetY: 300
        });
        const unitIds = created.world.getArmy(1)?.getUnitIds() ?? [];
        expect(unitIds).toHaveLength(4);
        damageAll(created, unitIds, 10);
        const before = unitIds.map(unitId => healthOf(created, unitId));

        // 72 game minutes = 3 peace ticks (24 substeps each) → 1.2 health.
        for (let tick = 0; tick < 3; tick += 1) {
            created.world.tick();
        }

        unitIds.forEach((unitId, index) => {
            const healed = healthOf(created, unitId) - before[index];
            expect(healed).toBeGreaterThan(0.2);
            expect(healed).toBeLessThan(2.2);
        });
    });

    it('heals nothing while a unit is in an active battle', () => {
        const created = createHealingKingdom({
            armyX: 500,
            armyY: 500,
            cityX: 500,
            cityY: 500,
            enemyX: 550,
            enemyY: 500,
            enemyUnits: 4
        });
        created.world.issueOrder({
            armyId: 1,
            kind: ArmyOrderKind.Garrison,
            cityId: 1
        });
        const unitIds = created.world.getArmy(1)?.getUnitIds() ?? [];
        damageAll(created, unitIds, 10);

        // 第一个 tick 只跑一个子步（开战立即切 1×）。
        created.world.tick();
        expect(created.world.getBattleSystem().hasActiveBattle()).toBe(true);
        const before = unitIds.map(unitId => healthOf(created, unitId));

        for (let tick = 0; tick < 4; tick += 1) {
            created.world.tick();
        }

        unitIds.forEach((unitId, index) => {
            expect(healthOf(created, unitId)).toBe(before[index]);
        });
    });
});

describe('KingdomSensingWorld — 64-ray fan', () => {
    it('returns exactly 64 distances inside [0, maxDistance]', () => {
        const world = new KingdomSensingWorld(MAP_WIDTH, MAP_HEIGHT, []);
        const distances = world.castRayFan(500, 500, 50, []);

        expect(distances).toHaveLength(64);
        for (const distance of distances) {
            expect(Number.isFinite(distance)).toBe(true);
            expect(distance).toBeGreaterThanOrEqual(0);
            expect(distance).toBeLessThanOrEqual(50);
        }
    });

    it('stops at the map boundary on the east ray', () => {
        const world = new KingdomSensingWorld(MAP_WIDTH, MAP_HEIGHT, []);
        const distances = world.castRayFan(990, 500, 50, []);

        expect(distances[0]).toBeCloseTo(10, 6);
        expect(distances[32]).toBeCloseTo(50, 6);
    });

    it('stops at a terrain rectangle', () => {
        const world = new KingdomSensingWorld(MAP_WIDTH, MAP_HEIGHT, [
            { x: 520, y: 500, halfWidth: 5, halfHeight: 5 }
        ]);
        const distances = world.castRayFan(500, 500, 50, []);

        expect(distances[0]).toBeCloseTo(15, 6);
    });

    it('stops at an enemy blocker circle', () => {
        const world = new KingdomSensingWorld(MAP_WIDTH, MAP_HEIGHT, []);
        const distances = world.castRayFan(500, 500, 50, [
            { unitId: 9, teamId: 2, x: 510, y: 500, radius: 2 }
        ]);

        expect(distances[0]).toBeCloseTo(8, 6);
    });
});
