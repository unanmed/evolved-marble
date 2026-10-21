import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ControlSystem } from '@/control/ControlSystem';
import type { IUnitAI, IUnitAIProvider } from '@/control/types';
import { BattleSystem } from '@/kingdom/BattleSystem';
import { BrakeAI } from '@/kingdom/BrakeAI';
import { BattleDamageSink } from '@/kingdom/DamageSink';
import { IdleAI } from '@/kingdom/IdleAI';
import { KingdomWorld } from '@/kingdom/KingdomWorld';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import { createDefaultKingdomConfig } from '@/kingdom/strategies';
import { MarchAI } from '@/kingdom/MarchAI';
import {
    BATTLE_AREA_HALF_EXTENT,
    BATTLE_AREA_HYSTERESIS,
    BATTLE_JOIN_GRACE_TICKS,
    BATTLE_TRIGGER_DISTANCE,
    BRAKE_MIN_MINUTES
} from '@/kingdom/constants';
import { Army } from '@/kingdom/Army';
import {
    ArmyOrderKind,
    BattleLifecycleKind,
    BattleState
} from '@/kingdom/types';
import type {
    IBattle,
    IBattleLifecycleEvent,
    IKingdomConfig,
    IScenario,
    UnitWeight
} from '@/kingdom/types';
import { ARMOR_DEFS, WEAPON_DEFS } from '@/units/data';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind, EquipmentKind } from '@/units/types';
import type { IArmorDef, IUnit, IWeaponDef } from '@/units/types';
import { ColliderPart } from '@/physics/types';
import type {
    IDamageEvent,
    IPhysicsTickResult,
    IPhysicsWorld,
    IStaticObstacleSpec,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { mulberry32 } from '../helpers/rng';
import { createKingdom, initRapier } from './harness';
import type { IKingdomFixture } from './harness';

/**
 * 两个势力、各 1 军 6 单位的 1000×1000 空地图：
 * 足够长的接近距离让阵型在接触前收敛到槽位。
 * @returns 场景表。
 */
function battleScenario(): IScenario {
    return {
        width: 1000,
        height: 1000,
        factions: [
            { id: 1, name: '赤' },
            { id: 2, name: '蓝' }
        ],
        cities: [],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 200,
                y: 500,
                heading: 0,
                units: [
                    { classKind: ClassKind.Swordsman, count: 4 },
                    { classKind: ClassKind.Spearman, count: 2 }
                ]
            },
            {
                id: 2,
                factionId: 2,
                x: 800,
                y: 500,
                heading: Math.PI,
                units: [
                    { classKind: ClassKind.Swordsman, count: 4 },
                    { classKind: ClassKind.Berserker, count: 2 }
                ]
            }
        ],
        terrain: []
    };
}

/**
 * 以攻击力为权重的配置（1 级单位等级全相同，无法区分加权）。
 * @param weight 权重函数。
 * @returns 完整配置。
 */
function configWithWeight(weight: UnitWeight): IKingdomConfig {
    return {
        unitWeight: weight,
        garrisonSelector: () => [],
        commanderFactory: () => {
            throw new Error('no commander');
        }
    };
}

/**
 * 让两支军队相向行军。
 * @param fixture 夹具。
 */
function driveTogether(fixture: IKingdomFixture): void {
    fixture.world.issueOrder({
        armyId: 1,
        kind: ArmyOrderKind.MoveTo,
        targetX: 800,
        targetY: 500
    });
    fixture.world.issueOrder({
        armyId: 2,
        kind: ArmyOrderKind.MoveTo,
        targetX: 200,
        targetY: 500
    });
}

/**
 * 把单位重建到新位置（物理层没有 set-position，故以移除 + 重新注册实现“传送”）。
 * 重注册会清空速度，这对刹车测试是已知限制。
 * @param physics 物理世界。
 * @param unitId 单位 id。
 * @param unit 单位实例（属性来源）。
 * @param x 新位置 x。
 * @param y 新位置 y。
 */
function teleportUnit(
    physics: IPhysicsWorld,
    unitId: number,
    unit: IUnit,
    x: number,
    y: number
): void {
    let weapon: IWeaponDef | null = null;
    const armors: IArmorDef[] = [];
    for (const item of unit.getEquipment()) {
        if (
            item.kind === EquipmentKind.Weapon &&
            weapon === null &&
            item.weapon !== undefined
        ) {
            weapon = WEAPON_DEFS[item.weapon];
        } else if (
            item.kind === EquipmentKind.Armor &&
            item.armor !== undefined
        ) {
            armors.push(ARMOR_DEFS[item.armor]);
        }
    }

    physics.removeUnit(unitId);
    physics.registerUnit({
        unitId,
        x,
        y,
        mass: unit.getAttribute(AttributeKind.Mass),
        attack: unit.getAttribute(AttributeKind.Attack),
        weaponRatio: unit.getAttribute(AttributeKind.WeaponRatio),
        defense: unit.getAttribute(AttributeKind.Defense),
        armorRatio: unit.getAttribute(AttributeKind.ArmorRatio),
        weapon,
        armors
    });
}

/**
 * 判断一个点是否在战斗正方形内。
 * @param battle 战斗。
 * @param state 运动读数。
 * @returns 是否在区内。
 */
function insideBattle(battle: IBattle, state: IUnitState): boolean {
    const center = battle.getCenter();
    const half = battle.getHalfExtent();
    return (
        Math.abs(state.x - center.x) <= half &&
        Math.abs(state.y - center.y) <= half
    );
}

/**
 * 取某势力当前仍在战斗区内、且仍注册存活的成员 id。
 * @param battle 战斗。
 * @param control 控制系统。
 * @param factionId 势力 id（即注册 teamId）。
 * @returns 成员 id 列表。
 */
function livingMembersOf(
    battle: IBattle,
    control: {
        getUnit(unitId: number): IUnit | null;
        getTeam(unitId: number): number | undefined;
    },
    factionId: number
): number[] {
    return battle.getMemberUnitIds().filter(unitId => {
        const unit = control.getUnit(unitId);
        if (unit === null || !unit.isAlive()) {
            return false;
        }
        return control.getTeam(unitId) === factionId;
    });
}

/**
 * 推进直到活跃战斗拥有至少一个成员（触发所在 tick 的加入流程在下一次 tick 才运行）。
 * @param world 王国世界。
 * @param bound 最大推进 tick 数。
 * @returns 有成员的活跃战斗或 `null`。
 */
function tickUntilMembers(
    world: import('@/kingdom/KingdomWorld').KingdomWorld,
    bound: number
): IBattle | null {
    for (let tick = 0; tick < bound; tick += 1) {
        const active = world.getBattleSystem().listActiveBattles()[0];
        if (active !== undefined && active.getMemberUnitIds().length > 0) {
            return active;
        }
        world.tick();
    }
    return world.getBattleSystem().listActiveBattles()[0] ?? null;
}

/**
 * 当前真实 Rapier 夹具。
 */
let fixture: IKingdomFixture | null = null;

describe('battle — real Rapier trigger, membership, damage and end', () => {
    beforeAll(async () => {
        await initRapier();
    });

    afterEach(() => {
        fixture?.control.dispose();
        fixture?.physics.dispose();
        fixture = null;
    });

    it('triggers only inside 80 m, joins members, weights the centre and pins the transition tick', () => {
        const weight = (unit: IUnit): number =>
            unit.getAttribute(AttributeKind.Attack);
        const created = createKingdom({
            scenario: battleScenario(),
            seed: 21,
            config: configWithWeight(weight)
        });
        fixture = created;
        const { world, control, physics } = created;
        driveTogether(created);

        let started = false;
        let startedEvents: readonly IBattleLifecycleEvent[] = [];
        let transitionMinutes = 0;
        for (let tick = 0; tick < 500 && !started; tick += 1) {
            const result = world.tick();
            const events = world.getBattleSystem().drainEvents();
            const start = events.find(
                event => event.kind === BattleLifecycleKind.Started
            );
            if (start !== undefined) {
                started = true;
                startedEvents = events;
                transitionMinutes = result.gameMinutes;
                expect(result.minutesPerTick).toBe(1);
                break;
            }

            // Before any battle: centres are still at or beyond the trigger distance.
            const first = world.getArmy(1)?.getCenter();
            const second = world.getArmy(2)?.getCenter();
            if (first !== undefined && second !== undefined) {
                const distance = Math.hypot(
                    first.x - second.x,
                    first.y - second.y
                );
                expect(distance).toBeGreaterThanOrEqual(
                    BATTLE_TRIGGER_DISTANCE - 1e-9
                );
            }
        }

        expect(started).toBe(true);
        expect(
            startedEvents.some(event => event.mergedIntoBattleId !== undefined)
        ).toBe(false);
        expect(transitionMinutes).toBeGreaterThanOrEqual(1);
        expect(transitionMinutes).toBeLessThanOrEqual(24);

        const battles = world.getBattleSystem();
        expect(battles.listActiveBattles()).toHaveLength(1);
        const battle = tickUntilMembers(world, 20);
        expect(battle).not.toBeNull();
        if (battle === null) {
            return;
        }
        const members = battle.getMemberUnitIds();
        expect(members.length).toBeGreaterThan(0);

        // Every member is inside the square and both factions are represented.
        const teams = new Set<number>();
        for (const unitId of members) {
            const state = physics.getUnitState(unitId);
            expect(state).not.toBeNull();
            if (state === null) {
                continue;
            }
            expect(insideBattle(battle, state)).toBe(true);
            const team = control.getTeam(unitId);
            if (team !== undefined) {
                teams.add(team);
            }
        }
        expect(teams.size).toBe(2);

        // The centre is the injected weight's weighted mean of member positions.
        let totalWeight = 0;
        let sumX = 0;
        let sumY = 0;
        for (const unitId of members) {
            const state = physics.getUnitState(unitId);
            const unit = control.getUnit(unitId);
            if (state === null || unit === null) {
                continue;
            }
            const unitWeight = weight(unit);
            totalWeight += unitWeight;
            sumX += state.x * unitWeight;
            sumY += state.y * unitWeight;
        }
        const center = battle.getCenter();
        // The centre was computed before this tick's physics step, so allow one step of drift.
        expect(Math.abs(center.x - sumX / totalWeight)).toBeLessThan(0.1);
        expect(Math.abs(center.y - sumY / totalWeight)).toBeLessThan(0.1);
    });

    it('drops a same-team hit inside the battle square', () => {
        const created = createKingdom({
            scenario: battleScenario(),
            seed: 22
        });
        fixture = created;
        const { world, control } = created;
        driveTogether(created);

        let battle: IBattle | null = null;
        for (let tick = 0; tick < 500 && battle === null; tick += 1) {
            world.tick();
            battle = world.getBattleSystem().listActiveBattles()[0] ?? null;
        }
        expect(battle).not.toBeNull();
        battle = tickUntilMembers(world, 20);
        expect(battle).not.toBeNull();
        if (battle === null) {
            return;
        }

        const members = battle.getMemberUnitIds();
        expect(members.length).toBeGreaterThan(0);
        const firstFaction = world.getArmy(1)?.getFactionId() ?? 1;
        const sameTeam = livingMembersOf(battle, control, firstFaction);
        expect(sameTeam.length).toBeGreaterThanOrEqual(2);
        const attacker = control.getUnit(sameTeam[0]);
        const defender = control.getUnit(sameTeam[1]);
        expect(attacker).not.toBeNull();
        expect(defender).not.toBeNull();
        if (attacker === null || defender === null) {
            return;
        }

        const sink = new BattleDamageSink(created.physics, () =>
            world.getBattleSystem()
        );
        const event: IDamageEvent = {
            attackerId: sameTeam[0],
            defenderId: sameTeam[1],
            attackerPart: ColliderPart.Weapon,
            defenderPart: ColliderPart.Body,
            deltaV: 50,
            damageMean: 500,
            damage: 500,
            damageReduced: 0
        };
        const healthBefore = defender.getAttribute(AttributeKind.Health);

        sink.applyDamage({
            event,
            attacker,
            defender,
            attackerTeamId: firstFaction,
            defenderTeamId: firstFaction
        });

        expect(defender.getAttribute(AttributeKind.Health)).toBe(healthBefore);
        expect(defender.isAlive()).toBe(true);
    });

    it('applies a hit when the defender is knocked past the square by that same hit', () => {
        const created = createKingdom({
            scenario: battleScenario(),
            seed: 25
        });
        fixture = created;
        const { world, control, physics } = created;
        driveTogether(created);

        let battle: IBattle | null = null;
        for (let tick = 0; tick < 500 && battle === null; tick += 1) {
            world.tick();
            battle = world.getBattleSystem().listActiveBattles()[0] ?? null;
        }
        battle = tickUntilMembers(world, 20);
        expect(battle).not.toBeNull();
        if (battle === null) {
            return;
        }

        const firstFaction = world.getArmy(1)?.getFactionId() ?? 1;
        const members = battle.getMemberUnitIds();
        const attackerId = members.find(
            unitId => control.getTeam(unitId) === firstFaction
        );
        const defenderId = members.find(
            unitId => control.getTeam(unitId) !== firstFaction
        );
        expect(attackerId).toBeDefined();
        expect(defenderId).toBeDefined();
        if (attackerId === undefined || defenderId === undefined) {
            return;
        }
        const attacker = control.getUnit(attackerId);
        const defender = control.getUnit(defenderId);
        expect(attacker).not.toBeNull();
        expect(defender).not.toBeNull();
        if (attacker === null || defender === null) {
            return;
        }

        const center = battle.getCenter();
        // Move the defender just outside the square WITHOUT a battle tick: membership is
        // still the pre-step snapshot, so this legitimate edge hit must not be dropped.
        teleportUnit(
            physics,
            defenderId,
            defender,
            center.x + battle.getHalfExtent() + 5,
            center.y
        );
        const healthBefore = defender.getAttribute(AttributeKind.Health);
        const attackerTeam = control.getTeam(attackerId);
        const defenderTeam = control.getTeam(defenderId);
        expect(attackerTeam).toBeDefined();
        expect(defenderTeam).toBeDefined();

        const sink = new BattleDamageSink(physics, () =>
            world.getBattleSystem()
        );
        sink.applyDamage({
            event: {
                attackerId,
                defenderId,
                attackerPart: ColliderPart.Weapon,
                defenderPart: ColliderPart.Body,
                deltaV: 5,
                damageMean: 1,
                damage: 1,
                damageReduced: 0
            },
            attacker,
            defender,
            attackerTeamId: attackerTeam ?? 0,
            defenderTeamId: defenderTeam ?? 0
        });

        expect(defender.getAttribute(AttributeKind.Health)).toBe(
            healthBefore - 1
        );
    });

    it('brakes a member that leaves the active battle and lets it rejoin', () => {
        const stub = createStubKingdom(stubBattleScenario());
        const { world, control, physics, positions } = stub;

        const installs: { unitId: number; ai: IUnitAI; minute: number }[] = [];
        const originalSetUnitAI = control.setUnitAI.bind(control);
        control.setUnitAI = (unitId: number, ai: IUnitAI): void => {
            installs.push({
                unitId,
                ai,
                minute: world.getTime().getGameMinutes()
            });
            originalSetUnitAI(unitId, ai);
        };

        let battle: IBattle | null = null;
        for (let tick = 0; tick < 20 && battle === null; tick += 1) {
            world.tick();
            const active = world.getBattleSystem().listActiveBattles()[0];
            if (active !== undefined && active.getMemberUnitIds().length > 0) {
                battle = active;
            }
        }
        expect(battle).not.toBeNull();
        if (battle === null) {
            world.dispose();
            control.dispose();
            physics.dispose();
            return;
        }

        const leaver = battle
            .getMemberUnitIds()
            .find(unitId => control.getTeam(unitId) === 1);
        expect(leaver).toBeDefined();
        if (leaver === undefined) {
            world.dispose();
            control.dispose();
            physics.dispose();
            return;
        }

        // Move the leaver out by writing the stub position directly: control and the
        // world's mode map stay in sync, and no damage can end the battle.
        positions.set(leaver, {
            x: 900,
            y: 900,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0
        });
        world.tick();
        expect(world.getBattleSystem().getBattleForUnit(leaver)).toBeNull();
        expect(
            installs.some(
                entry => entry.unitId === leaver && entry.ai instanceof BrakeAI
            )
        ).toBe(true);

        const leftAt = world.getTime().getGameMinutes();
        let sawPrematureMarch = false;
        let sawMarch = false;
        for (
            let step = 0;
            step < BRAKE_MIN_MINUTES + 10 && !sawMarch;
            step += 1
        ) {
            if (!world.getBattleSystem().hasActiveBattle()) {
                break;
            }
            world.tick();
            if (
                installs.some(
                    entry =>
                        entry.unitId === leaver &&
                        entry.ai instanceof MarchAI &&
                        entry.minute >= leftAt &&
                        entry.minute < leftAt + BRAKE_MIN_MINUTES
                )
            ) {
                sawPrematureMarch = true;
            }
            const march = installs.find(
                entry =>
                    entry.unitId === leaver &&
                    entry.ai instanceof MarchAI &&
                    entry.minute >= leftAt
            );
            if (march !== undefined) {
                sawMarch = true;
                expect(march.minute).toBeGreaterThanOrEqual(
                    leftAt + BRAKE_MIN_MINUTES
                );
            }
        }
        expect(sawPrematureMarch).toBe(false);
        expect(sawMarch).toBe(true);

        // Move it back inside the square: the join pass re-adds it.
        const center = battle.getCenter();
        positions.set(leaver, {
            x: center.x,
            y: center.y,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0
        });
        world.tick();
        expect(world.getBattleSystem().getBattleForUnit(leaver)).not.toBeNull();

        world.dispose();
        control.dispose();
        physics.dispose();
    });

    it('keeps one battle per army pair and never emits a duplicate Started', () => {
        const created = createKingdom({
            scenario: battleScenario(),
            seed: 24
        });
        fixture = created;
        const { world } = created;
        driveTogether(created);

        let startedCount = 0;
        for (let tick = 0; tick < 500; tick += 1) {
            world.tick();
            startedCount += world
                .getBattleSystem()
                .drainEvents()
                .filter(
                    event => event.kind === BattleLifecycleKind.Started
                ).length;
            if (startedCount > 0) {
                break;
            }
        }
        expect(startedCount).toBe(1);

        for (let tick = 0; tick < 50; tick += 1) {
            world.tick();
            startedCount += world
                .getBattleSystem()
                .drainEvents()
                .filter(
                    event => event.kind === BattleLifecycleKind.Started
                ).length;
        }
        expect(startedCount).toBe(1);
    });

    it('finishes a battle when one faction remains and keeps ticking at peace rate', () => {
        const created = createKingdom({
            scenario: battleScenario(),
            seed: 22
        });
        fixture = created;
        const { world, control, physics } = created;

        const initialHealth = new Map<number, number>();
        for (const armyId of [1, 2]) {
            for (const unitId of world.getArmy(armyId)?.getUnitIds() ?? []) {
                const unit = control.getUnit(unitId);
                if (unit !== null) {
                    initialHealth.set(
                        unitId,
                        unit.getAttribute(AttributeKind.Health)
                    );
                }
            }
        }
        expect(initialHealth.size).toBe(12);

        driveTogether(created);

        let started = false;
        for (let tick = 0; tick < 500 && !started; tick += 1) {
            world.tick();
            started = world
                .getBattleSystem()
                .drainEvents()
                .some(event => event.kind === BattleLifecycleKind.Started);
        }
        expect(started).toBe(true);

        // Let the units collide so real damage lands (or a unit dies).
        let damaged = false;
        for (let tick = 0; tick < 4000 && !damaged; tick += 1) {
            world.tick();
            damaged = [...initialHealth].some(([unitId, health]) => {
                const unit = control.getUnit(unitId);
                if (unit === null) {
                    return true;
                }
                return unit.getAttribute(AttributeKind.Health) < health;
            });
        }
        expect(damaged).toBe(true);

        // Finish the fight: kill faction 2's remaining units (the sink does the same work).
        for (const unitId of world.getArmy(2)?.getUnitIds() ?? []) {
            const unit = control.getUnit(unitId);
            if (unit !== null) {
                unit.takeDamage(unit.getAttribute(AttributeKind.MaxHealth) * 2);
            }
        }

        let ended = false;
        for (let tick = 0; tick < 50 && !ended; tick += 1) {
            world.tick();
            ended = world
                .getBattleSystem()
                .drainEvents()
                .some(event => event.kind === BattleLifecycleKind.Ended);
        }
        expect(ended).toBe(true);
        expect(world.getBattleSystem().listActiveBattles()).toHaveLength(0);
        expect(world.getBattleSystem().listCompletedBattles()).toHaveLength(1);

        // After the end the pair stays locked in place, so the world returns to 24×.
        for (let tick = 0; tick < 3; tick += 1) {
            const result = world.tick();
            expect(result.minutesPerTick).toBe(24);
        }
        expect(physics.getUnitState(1)).not.toBeNull();
    });
});

/**
 * 桩物理世界：位置表由测试直接改写，用于精确控制成员进出与合并几何。
 */
class StubPhysics implements IPhysicsWorld {
    /** unitId → 运动读数。 */
    private readonly positions: Map<number, IUnitState>;
    /** 下一个静态障碍 id（桩不模拟几何，仅满足接缝）。 */
    private nextObstacleId = 1;

    /**
     * 构造桩物理世界。
     * @param positions 位置表的共享引用（测试直接改写）。
     */
    constructor(positions: Map<number, IUnitState>) {
        this.positions = positions;
    }

    /**
     * 注册单位：把出生位置写入位置表。
     * @param spec 物理规格。
     */
    registerUnit(spec: IUnitPhysicsSpec): void {
        this.positions.set(spec.unitId, {
            x: spec.x,
            y: spec.y,
            angle: 0,
            vx: 0,
            vy: 0,
            angularVelocity: 0
        });
    }

    /**
     * 移除单位。
     * @param unitId 单位 id。
     */
    removeUnit(unitId: number): void {
        this.positions.delete(unitId);
    }

    /**
     * 是否已注册。
     * @param unitId 单位 id。
     * @returns 是否注册。
     */
    hasUnit(unitId: number): boolean {
        return this.positions.has(unitId);
    }

    /**
     * 空操作（桩不模拟力）。
     * @param _unitId 单位 id。
     * @param _forceX 力 x。
     * @param _forceY 力 y。
     */
    applyForce(_unitId: number, _forceX: number, _forceY: number): void {
        // 无物理。
    }

    /**
     * 空操作（桩不模拟力矩）。
     * @param _unitId 单位 id。
     * @param _torque 力矩。
     */
    applyTorque(_unitId: number, _torque: number): void {
        // 无物理。
    }

    /**
     * 读取位置表。
     * @param unitId 单位 id。
     * @returns 运动读数或 `null`。
     */
    getUnitState(unitId: number): IUnitState | null {
        return this.positions.get(unitId) ?? null;
    }

    /**
     * 不推进任何物理。
     * @returns 空事件。
     */
    tick(): IPhysicsTickResult {
        return { contacts: [], damages: [] };
    }

    /**
     * 添加静态障碍：桩不模拟几何，只返回递增 id。
     * @param _spec 静态障碍规格。
     * @returns 障碍 id。
     */
    addStaticObstacle(_spec: IStaticObstacleSpec): number {
        const id = this.nextObstacleId;
        this.nextObstacleId += 1;
        return id;
    }

    /**
     * 移除静态障碍：桩无几何，空操作。
     * @param _obstacleId 障碍 id。
     */
    removeStaticObstacle(_obstacleId: number): void {
        // 无几何。
    }

    /**
     * 清空位置表。
     */
    dispose(): void {
        this.positions.clear();
    }
}

/**
 * 桩物理王国测试用的双势力场景：两队各 3 单位，中心相距 40 m（< 80 m 触发距离），
 * 单位出生在 4 m 环上，全部落在以中点为心的战斗正方形内。
 * @returns 场景表。
 */
function stubBattleScenario(): IScenario {
    return {
        width: 1000,
        height: 1000,
        factions: [
            { id: 1, name: 'Red' },
            { id: 2, name: 'Blue' }
        ],
        cities: [],
        armies: [
            {
                id: 1,
                factionId: 1,
                x: 480,
                y: 500,
                heading: 0,
                units: [{ classKind: ClassKind.Swordsman, count: 3 }]
            },
            {
                id: 2,
                factionId: 2,
                x: 520,
                y: 500,
                heading: Math.PI,
                units: [{ classKind: ClassKind.Swordsman, count: 3 }]
            }
        ],
        terrain: []
    };
}

/**
 * 用桩物理装配一套王国夹具：位置静止、无伤害，因此战斗在测试期间不会自行结束。
 * @param scenario 场景表。
 * @returns 世界、控制、桩物理与共享位置表。
 */
function createStubKingdom(scenario: IScenario): {
    world: KingdomWorld;
    control: ControlSystem;
    physics: StubPhysics;
    positions: Map<number, IUnitState>;
} {
    const positions = new Map<number, IUnitState>();
    const physics = new StubPhysics(positions);
    const sensing = new KingdomSensingWorld(
        scenario.width,
        scenario.height,
        scenario.terrain
    );
    let worldRef: KingdomWorld | null = null;
    const sink = new BattleDamageSink(
        physics,
        () => worldRef?.getBattleSystem() ?? null
    );
    const provider: IUnitAIProvider = {
        /**
         * 注册时创建待命 AI；World 在第一个子步按模式替换它。
         * @returns 新的待命 AI。
         */
        create(): IUnitAI {
            return new IdleAI();
        },
        /**
         * 无内部状态。
         */
        destroy(): void {
            // 无状态。
        }
    };
    const control = new ControlSystem(physics, sensing, provider, sink);
    const world = new KingdomWorld(
        physics,
        control,
        mulberry32(7),
        scenario,
        createDefaultKingdomConfig(() => ({ decide: () => [] }))
    );
    worldRef = world;
    return { world, control, physics, positions };
}

/**
 * 往位置表放置一个静止单位。
 * @param positions 位置表。
 * @param unitId 单位 id。
 * @param x x 坐标。
 * @param y y 坐标。
 */
function place(
    positions: Map<number, IUnitState>,
    unitId: number,
    x: number,
    y: number
): void {
    positions.set(unitId, {
        x,
        y,
        angle: 0,
        vx: 0,
        vy: 0,
        angularVelocity: 0
    });
}

/**
 * 构造军队（桩测试用），名册已设置。
 * @param id 军队 id。
 * @param factionId 势力 id。
 * @param x 中心 x。
 * @param y 中心 y。
 * @param unitIds 名册。
 * @returns 军队。
 */
function makeArmy(
    id: number,
    factionId: number,
    x: number,
    y: number,
    unitIds: number[]
): Army {
    const army = new Army(id, factionId, x, y, 0, () => undefined);
    army.setUnitIds(unitIds);
    return army;
}

/**
 * 构造一份桩战斗系统。
 * @param positions 位置表。
 * @param armies 军队列表。
 * @param units 单位表。
 * @param teams 阵营表。
 * @param weight 权重函数。
 * @param ended 结束回调记录。
 * @param merged 合并通知记录（可选）。
 * @returns 战斗系统。
 */
function makeBattles(
    positions: Map<number, IUnitState>,
    armies: Army[],
    units: Map<number, IUnit>,
    teams: Map<number, number>,
    weight: UnitWeight,
    ended: IBattle[],
    merged: { absorbed: IBattle; survivor: IBattle }[] = []
): BattleSystem {
    let minute = 0;
    return new BattleSystem(
        new StubPhysics(positions),
        unitId => teams.get(unitId),
        unitId => units.get(unitId) ?? null,
        () => armies,
        () => minute++,
        weight,
        BATTLE_AREA_HALF_EXTENT,
        BATTLE_TRIGGER_DISTANCE,
        BATTLE_AREA_HYSTERESIS,
        battle => ended.push(battle),
        () => [],
        () => null,
        (absorbed, survivor) => merged.push({ absorbed, survivor })
    );
}

describe('BattleSystem — membership, merge, locks and weighting (stub physics)', () => {
    it('merges overlapping battles into the lower id and records mergedIntoBattleId', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        for (const [unitId, team, x] of [
            [1, 1, 100],
            [2, 2, 150],
            [3, 1, 200]
        ] as const) {
            units.set(
                unitId,
                spawnUnit(ClassKind.Swordsman, mulberry32(unitId))
            );
            teams.set(unitId, team);
            place(positions, unitId, x, 100);
        }
        const armies = [
            makeArmy(1, 1, 100, 100, [1]),
            makeArmy(2, 2, 150, 100, [2]),
            makeArmy(3, 1, 200, 100, [3])
        ];
        const ended: IBattle[] = [];
        const merged: { absorbed: IBattle; survivor: IBattle }[] = [];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            ended,
            merged
        );

        battles.tick();
        const events = battles.drainEvents();
        expect(battles.listActiveBattles()).toHaveLength(1);
        expect(battles.listCompletedBattles()).toHaveLength(1);
        expect(
            events.some(
                event =>
                    event.kind === BattleLifecycleKind.Started &&
                    event.battleId === 1
            )
        ).toBe(true);
        const absorbed = battles.listCompletedBattles()[0];
        expect(absorbed.getState()).toBe(BattleState.Ended);
        expect(absorbed.getId()).toBe(2);
        const mergedEvent = events.find(
            event =>
                event.kind === BattleLifecycleKind.Ended && event.battleId === 2
        );
        expect(mergedEvent?.mergedIntoBattleId).toBe(1);
        // Merge must not trigger the settlement callback, but it must notify the World
        // so participant ledgers can be folded (WR-05).
        expect(ended).toHaveLength(0);
        expect(merged).toHaveLength(1);
        expect(merged[0].absorbed.getId()).toBe(2);
        expect(merged[0].survivor.getId()).toBe(1);

        // The surviving battle absorbs the members on the next join pass.
        battles.tick();
        const survivor = battles.listActiveBattles()[0];
        expect([...survivor.getMemberUnitIds()].sort()).toEqual([1, 2]);
    });

    it('uses the injected weight and clamps a throwing weight to 1', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        const first = spawnUnit(ClassKind.Swordsman, mulberry32(1));
        const second = spawnUnit(ClassKind.Swordsman, mulberry32(2));
        units.set(1, first);
        units.set(2, second);
        teams.set(1, 1);
        teams.set(2, 2);
        place(positions, 1, 100, 100);
        place(positions, 2, 140, 100);
        const armies = [
            makeArmy(1, 1, 100, 100, [1]),
            makeArmy(2, 2, 140, 100, [2])
        ];

        const weighted: UnitWeight = unit => (unit === first ? 1 : 3);
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            weighted,
            []
        );
        battles.tick();
        battles.tick();
        const battle = battles.listActiveBattles()[0];
        expect(battle.getMemberUnitIds()).toHaveLength(2);
        expect(battle.getCenter().x).toBeCloseTo((100 * 1 + 140 * 3) / 4, 6);

        const throwing: UnitWeight = () => {
            throw new Error('bad weight');
        };
        const fallback = makeBattles(
            positions,
            armies,
            units,
            teams,
            throwing,
            []
        );
        fallback.tick();
        fallback.tick();
        const fallbackBattle = fallback.listActiveBattles()[0];
        expect(Number.isFinite(fallbackBattle.getCenter().x)).toBe(true);
        expect(fallbackBattle.getCenter().x).toBeCloseTo(120, 6);
    });

    it('drops a member that leaves, then re-admits it when the area covers it again', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        // Two units per faction so a single exit does not end the battle.
        for (const [unitId, team, x, y] of [
            [1, 1, 100, 100],
            [2, 2, 140, 100],
            [3, 1, 110, 110],
            [4, 2, 130, 110]
        ] as const) {
            units.set(
                unitId,
                spawnUnit(ClassKind.Swordsman, mulberry32(unitId))
            );
            teams.set(unitId, team);
            place(positions, unitId, x, y);
        }
        const armies = [
            makeArmy(1, 1, 100, 100, [1, 3]),
            makeArmy(2, 2, 140, 100, [2, 4])
        ];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            []
        );

        battles.tick();
        battles.tick();
        expect(battles.getBattleForUnit(2)).not.toBeNull();

        place(positions, 2, 400, 100);
        battles.tick();
        expect(battles.getBattleForUnit(2)).toBeNull();

        place(positions, 2, 140, 100);
        battles.tick();
        expect(battles.getBattleForUnit(2)).not.toBeNull();
    });

    it('ends when one faction remains and locks the pair until it separates beyond 80 m', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        const first = spawnUnit(ClassKind.Swordsman, mulberry32(5));
        const second = spawnUnit(ClassKind.Swordsman, mulberry32(6));
        units.set(1, first);
        units.set(2, second);
        teams.set(1, 1);
        teams.set(2, 2);
        place(positions, 1, 100, 100);
        place(positions, 2, 140, 100);
        const armyOne = makeArmy(1, 1, 100, 100, [1]);
        const armyTwo = makeArmy(2, 2, 140, 100, [2]);
        const ended: IBattle[] = [];
        const battles = makeBattles(
            positions,
            [armyOne, armyTwo],
            units,
            teams,
            () => 1,
            ended
        );

        battles.tick();
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(1);
        // Drop the trigger events so later assertions only see post-end activity.
        battles.drainEvents();

        second.takeDamage(second.getAttribute(AttributeKind.MaxHealth) * 2);
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(battles.listCompletedBattles()).toHaveLength(1);
        expect(ended).toHaveLength(1);

        // Same place, still locked: no new battle even though centres are 40 m apart.
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(
            battles
                .drainEvents()
                .filter(event => event.kind === BattleLifecycleKind.Started)
        ).toHaveLength(0);

        // Separation beyond 80 m releases the lock, after which the pair can trigger again.
        armyTwo.setCenter(400, 100);
        place(positions, 2, 400, 100);
        battles.tick();
        armyTwo.setCenter(140, 100);
        place(positions, 2, 140, 100);
        battles.tick();
        expect(
            battles
                .drainEvents()
                .filter(event => event.kind === BattleLifecycleKind.Started)
                .length
        ).toBeGreaterThanOrEqual(1);
    });

    it('keeps a freshly triggered zero-member battle alive for the next join pass', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        units.set(1, spawnUnit(ClassKind.Swordsman, mulberry32(7)));
        units.set(2, spawnUnit(ClassKind.Swordsman, mulberry32(8)));
        teams.set(1, 1);
        teams.set(2, 2);
        place(positions, 1, 100, 100);
        place(positions, 2, 140, 100);
        const armies = [
            makeArmy(1, 1, 100, 100, [1]),
            makeArmy(2, 2, 140, 100, [2])
        ];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            []
        );

        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(1);
        expect(battles.listActiveBattles()[0].getMemberUnitIds()).toHaveLength(
            0
        );
        expect(
            battles
                .drainEvents()
                .filter(event => event.kind === BattleLifecycleKind.Ended)
        ).toHaveLength(0);

        battles.tick();
        expect(
            battles.listActiveBattles()[0].getMemberUnitIds().length
        ).toBeGreaterThan(0);
    });

    it('ends a battle when every member dies (mutual annihilation)', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        for (const [unitId, team, x, y] of [
            [1, 1, 100, 100],
            [2, 2, 140, 100],
            [3, 1, 110, 110],
            [4, 2, 130, 110]
        ] as const) {
            units.set(
                unitId,
                spawnUnit(ClassKind.Swordsman, mulberry32(unitId))
            );
            teams.set(unitId, team);
            place(positions, unitId, x, y);
        }
        const armies = [
            makeArmy(1, 1, 100, 100, [1, 3]),
            makeArmy(2, 2, 140, 100, [2, 4])
        ];
        const ended: IBattle[] = [];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            ended
        );

        battles.tick();
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(1);
        expect(
            battles.listActiveBattles()[0].getMemberUnitIds().length
        ).toBeGreaterThan(0);

        for (const unit of units.values()) {
            unit.takeDamage(unit.getAttribute(AttributeKind.MaxHealth) * 2);
        }
        battles.tick();

        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(battles.listCompletedBattles()).toHaveLength(1);
        expect(ended).toHaveLength(1);
    });

    it('ends a battle when every member leaves the square', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        for (const [unitId, team, x, y] of [
            [1, 1, 100, 100],
            [2, 2, 140, 100],
            [3, 1, 110, 110],
            [4, 2, 130, 110]
        ] as const) {
            units.set(
                unitId,
                spawnUnit(ClassKind.Swordsman, mulberry32(unitId))
            );
            teams.set(unitId, team);
            place(positions, unitId, x, y);
        }
        const armies = [
            makeArmy(1, 1, 100, 100, [1, 3]),
            makeArmy(2, 2, 140, 100, [2, 4])
        ];
        const ended: IBattle[] = [];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            ended
        );

        battles.tick();
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(1);

        for (const unitId of [1, 2, 3, 4]) {
            place(positions, unitId, 800, 800);
        }
        battles.tick();

        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(battles.listCompletedBattles()).toHaveLength(1);
        expect(ended).toHaveLength(1);
    });

    it('does not settle a one-sided battle before the other side joins', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        units.set(1, spawnUnit(ClassKind.Swordsman, mulberry32(11)));
        units.set(2, spawnUnit(ClassKind.Swordsman, mulberry32(12)));
        units.set(3, spawnUnit(ClassKind.Swordsman, mulberry32(13)));
        units.set(4, spawnUnit(ClassKind.Swordsman, mulberry32(14)));
        teams.set(1, 1);
        teams.set(3, 1);
        teams.set(2, 2);
        teams.set(4, 2);
        // Army centres 60 m apart trigger, but only faction 1 has units in the square.
        place(positions, 1, 130, 100);
        place(positions, 3, 125, 100);
        place(positions, 2, 600, 100);
        place(positions, 4, 600, 110);
        const armies = [
            makeArmy(1, 1, 100, 100, [1, 3]),
            makeArmy(2, 2, 160, 100, [2, 4])
        ];
        const ended: IBattle[] = [];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            ended
        );

        battles.tick();
        battles.tick();
        expect(battles.listActiveBattles()).toHaveLength(1);
        expect(ended).toHaveLength(0);

        // Still inside the join grace: one-sided membership must not end or settle.
        for (let tick = 0; tick < 5; tick += 1) {
            battles.tick();
        }
        expect(battles.listActiveBattles()).toHaveLength(1);
        expect(ended).toHaveLength(0);

        // Contact: the missing side enters, then dies — a legitimate end/settlement.
        place(positions, 2, 130, 105);
        place(positions, 4, 130, 115);
        battles.tick();
        for (const unitId of [2, 4]) {
            const unit = units.get(unitId);
            unit?.takeDamage(
                (unit?.getAttribute(AttributeKind.MaxHealth) ?? 0) * 2
            );
        }
        battles.tick();

        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(ended).toHaveLength(1);
    });

    it('ends a stale one-sided battle after the join grace without settling it', () => {
        const positions = new Map<number, IUnitState>();
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        units.set(1, spawnUnit(ClassKind.Swordsman, mulberry32(21)));
        units.set(2, spawnUnit(ClassKind.Swordsman, mulberry32(22)));
        teams.set(1, 1);
        teams.set(2, 2);
        place(positions, 1, 130, 100);
        place(positions, 2, 600, 100);
        const armies = [
            makeArmy(1, 1, 100, 100, [1]),
            makeArmy(2, 2, 160, 100, [2])
        ];
        const ended: IBattle[] = [];
        const battles = makeBattles(
            positions,
            armies,
            units,
            teams,
            () => 1,
            ended
        );

        let endedEvents = 0;
        for (let tick = 0; tick < BATTLE_JOIN_GRACE_TICKS + 5; tick += 1) {
            battles.tick();
            endedEvents += battles
                .drainEvents()
                .filter(
                    event => event.kind === BattleLifecycleKind.Ended
                ).length;
        }

        expect(battles.listActiveBattles()).toHaveLength(0);
        expect(battles.listCompletedBattles()).toHaveLength(1);
        expect(endedEvents).toBe(1);
        // Ended as stale/unsettled: the settlement callback still fires but contested=false.
        expect(ended).toHaveLength(1);
    });
});

/**
 * 构造一个只关心运动读数的完整 `IUnitObservation` 字面量。
 * @param vx 线速度 x。
 * @param vy 线速度 y。
 * @param angularVelocity 角速度。
 * @returns 观测快照。
 */
function observationWith(
    vx: number,
    vy: number,
    angularVelocity: number
): import('@/control/types').IUnitObservation {
    const attributes: Record<AttributeKind, number> = {
        [AttributeKind.Health]: 100,
        [AttributeKind.MaxHealth]: 100,
        [AttributeKind.Level]: 1,
        [AttributeKind.Experience]: 0,
        [AttributeKind.ExperienceRatio]: 1,
        [AttributeKind.AttackExpRatio]: 1,
        [AttributeKind.DefenseExpRatio]: 1,
        [AttributeKind.ControlLevel]: 10,
        [AttributeKind.Attack]: 10,
        [AttributeKind.Defense]: 10,
        [AttributeKind.WeaponRatio]: 1,
        [AttributeKind.ArmorRatio]: 1,
        [AttributeKind.Mass]: 10
    };
    return {
        unitId: 1,
        tick: 0,
        attributes,
        classKind: ClassKind.Swordsman,
        equipment: [],
        skills: [],
        motion: {
            x: 0,
            y: 0,
            angle: 0,
            vx,
            vy,
            angularVelocity
        },
        rayDistances: new Array<number>(64).fill(50),
        enemies: [],
        allies: [],
        projectiles: []
    };
}

describe('BrakeAI — damping arithmetic', () => {
    it('opposes linear and angular velocity', () => {
        const action = new BrakeAI().decide(observationWith(5, -2, 3));

        expect(action.forceLeft).toBeGreaterThan(0);
        expect(action.forceRight).toBe(0);
        expect(action.forceUp).toBeGreaterThan(0);
        expect(action.forceDown).toBe(0);
        expect(action.torqueClockwise).toBeGreaterThan(0);
        expect(action.torqueCounterClockwise).toBe(0);
    });

    it('returns the shared zero action at rest', () => {
        const action = new BrakeAI().decide(observationWith(0, 0, 0));

        expect(action.forceUp).toBe(0);
        expect(action.forceDown).toBe(0);
        expect(action.forceLeft).toBe(0);
        expect(action.forceRight).toBe(0);
        expect(action.torqueClockwise).toBe(0);
        expect(action.torqueCounterClockwise).toBe(0);
        expect(action.skillIntent).toBeNull();
    });
});
