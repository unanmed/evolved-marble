/**
 * 真实 Rapier 的组合根集成测试（REND-01/REND-04/REND-05/D-19）：
 * 证明服务装配的身份、真实开局 `MoveTo` 指令被接受、真实战斗与参战点位、
 * 真实伤害经装饰器进入读取口，以及两套独立 setup 互不干扰。
 * 全部数据都由真实系统产生：不注入单位、不伪造战斗、不构造伤害事件。
 */

import { afterEach, beforeAll, describe, expect, it } from 'vitest';

import {
    createDemoSetup,
    disposeDemoSetup,
    initDemoRuntime
} from '@/demo/composition';
import type { IDemoSetup } from '@/demo/types';
import { SCENARIO_MINIMAL } from '@/kingdom/scenario';
import { ArmyOrderKind } from '@/kingdom/types';
import type { IBattle } from '@/kingdom/types';
import { resolveTargetPoints } from '@/render/frameModel';

/** 战斗开始 + 成员出现的外层 tick 预算：200 次开始 + 20 次成员帧（含边界）。 */
const BATTLE_START_BUDGET = 220;

/** 开战后等待真实伤害的 tick 预算：与 `tests/kingdom/tracer.test.ts` 同量级。 */
const DAMAGE_BUDGET = 2000;

/** 一条从旁路排空的事件中被测试保留的可断言快照。 */
interface IDamageSample {
    /** 实际扣除的生命值。 */
    readonly damage: number;
    /** 命中时的守方世界 x 坐标（米）。 */
    readonly x: number;
    /** 命中时的守方世界 y 坐标（米）。 */
    readonly y: number;
    /** 本次命中是否造成死亡。 */
    readonly killed: boolean;
}

/** 本测试创建的全部 setup：`afterEach` 逐一幂等释放。 */
let setups: IDemoSetup[] = [];

/**
 * 创建一套 setup 并登记，便于 `afterEach` 统一释放。
 * @returns 新建的 setup。
 */
function trackSetup(): IDemoSetup {
    const setup = createDemoSetup(SCENARIO_MINIMAL);
    setups.push(setup);
    return setup;
}

/**
 * 推进世界直到有活跃战斗且该战斗已有真实成员。
 * `KingdomWorld.tick()` 在开战子步后立即跳出和平子步循环，而新战斗初始成员为空，
 * 因此刚开战那一 tick 的 `getMemberUnitIds()` 必为空，需要再走至少一帧。
 * @param setup 目标 setup。
 * @returns 已填入成员的第一场活跃战斗；预算耗尽时为 `null`。
 */
function tickUntilPopulatedBattle(setup: IDemoSetup): IBattle | null {
    const battles = setup.world.getBattleSystem();
    for (let tick = 0; tick < BATTLE_START_BUDGET; tick += 1) {
        const active = battles.listActiveBattles();
        const populated = active.find(
            battle => battle.getMemberUnitIds().length > 0
        );
        if (populated !== undefined) {
            return populated;
        }
        setup.world.tick();
    }
    return null;
}

beforeAll(async () => {
    await initDemoRuntime();
});

afterEach(() => {
    for (const setup of setups) {
        disposeDemoSetup(setup);
    }
    setups = [];
});

describe('demo/composition — real world wiring (D-19)', () => {
    it('feeds the render services from one real world, catalog, physics and tap', () => {
        const setup = trackSetup();
        const services = setup.services;

        expect(services.world).toBe(setup.world);
        expect(services.catalog).toBe(setup.control);
        expect(services.physics).toBe(setup.physics);
        expect(services.damageFeed).toBe(setup.damageFeed);
        expect(setup.scenario).toBe(SCENARIO_MINIMAL);
    });

    it('registers the real scenario roster and issues accepted opening MoveTo orders', () => {
        const setup = trackSetup();

        expect(setup.control.listUnitIds().length).toBe(2);

        for (const armyId of [1, 2]) {
            const army = setup.world.getArmy(armyId);
            expect(army).not.toBeNull();
            expect(army?.getOrder()?.kind).toBe(ArmyOrderKind.MoveTo);
        }
    });
});

describe('demo/composition — real battle and damage (REND-04/REND-01)', () => {
    it('produces a real battle with members and non-empty camera target points', () => {
        const setup = trackSetup();

        const battle = tickUntilPopulatedBattle(setup);
        if (battle === null) {
            const active = setup.world.getBattleSystem().listActiveBattles();
            throw new Error(
                `no populated battle within ${BATTLE_START_BUDGET} ticks: ` +
                    `active=${active.length}, ` +
                    `members=[${active
                        .map(entry => entry.getMemberUnitIds().length)
                        .join(',')}]`
            );
        }

        expect(battle.getMemberUnitIds().length).toBeGreaterThan(0);

        const points = resolveTargetPoints(battle, unitId =>
            setup.physics.getUnitState(unitId)
        );
        expect(points.length).toBeGreaterThan(0);
        for (const point of points) {
            expect(Number.isFinite(point.x)).toBe(true);
            expect(Number.isFinite(point.y)).toBe(true);
        }
    });

    it('delivers real applied damage through the tap drain', () => {
        const setup = trackSetup();

        const battle = tickUntilPopulatedBattle(setup);
        expect(battle).not.toBeNull();
        if (battle === null) {
            return;
        }

        const collected: IDamageSample[] = [];
        let hit: IDamageSample | undefined;

        for (
            let tick = 0;
            tick < DAMAGE_BUDGET && hit === undefined;
            tick += 1
        ) {
            setup.world.tick();
            for (const event of setup.damageFeed.drain()) {
                const record: IDamageSample = {
                    damage: event.damage,
                    x: event.x,
                    y: event.y,
                    killed: event.killed
                };
                collected.push(record);
                if (hit === undefined && event.damage > 0) {
                    hit = record;
                }
            }
        }

        expect(collected.length).toBeGreaterThan(0);
        expect(hit).toBeDefined();
        if (hit === undefined) {
            return;
        }
        expect(hit.damage).toBeGreaterThan(0);
        expect(Number.isFinite(hit.x)).toBe(true);
        expect(Number.isFinite(hit.y)).toBe(true);
        expect(typeof hit.killed).toBe('boolean');
    });
});

describe('demo/composition — lifecycle (D-19/T-05-40)', () => {
    it('keeps two independently created setups consistent and independent', () => {
        const first = trackSetup();
        const second = trackSetup();

        expect(first).not.toBe(second);
        expect(first.world).not.toBe(second.world);
        expect(first.control).not.toBe(second.control);
        expect(first.control.listUnitIds().length).toBe(2);
        expect(second.control.listUnitIds().length).toBe(2);

        disposeDemoSetup(first);

        expect(second.control.listUnitIds().length).toBe(2);
        const result = second.world.tick();
        expect(Number.isFinite(result.gameMinutes)).toBe(true);
    });

    it('disposes idempotently', () => {
        const setup = createDemoSetup(SCENARIO_MINIMAL);
        setups.push(setup);

        expect(() => disposeDemoSetup(setup)).not.toThrow();
        expect(() => disposeDemoSetup(setup)).not.toThrow();
    });
});
