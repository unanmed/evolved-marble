import { describe, expect, it } from 'vitest';
import { Sensor } from '@/control/Sensor';
import {
    MAX_NEIGHBORS,
    NEIGHBOR_QUERY_RADIUS,
    RAY_COUNT,
    SENSING_MAX_DISTANCE
} from '@/control/constants';
import type {
    IProjectileSighting,
    ISensedUnit,
    ISensingWorld,
    IUnitCatalog,
    IUnitObservation
} from '@/control/types';
import { DEFAULT_GEOMETRY } from '@/physics/constants';
import type {
    IPhysicsTickResult,
    IPhysicsWorld,
    IUnitPhysicsSpec,
    IUnitState
} from '@/physics/types';
import { spawnUnit } from '@/units/spawn';
import { AttributeKind, ClassKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import { mulberry32 } from '../helpers/rng';
import { ArenaSensingWorld } from './arena';

/**
 * 构造一个运动读数。
 * @param x 位置的 x 坐标。
 * @param y 位置的 y 坐标。
 * @returns 运动读数。
 */
function stateAt(x: number, y: number): IUnitState {
    return { x, y, angle: 0, vx: 0, vy: 0, angularVelocity: 0 };
}

/**
 * 生成一个真实单位。
 * @param seed 确定性随机种子。
 * @returns 单位实例。
 */
function makeUnit(seed: number): IUnit {
    return spawnUnit(ClassKind.Swordsman, mulberry32(seed));
}

/**
 * 断言感知成功并收窄类型。
 * @param sensor 感知器。
 * @param unitId 单位 id。
 * @returns 非空快照。
 */
function senseOrFail(sensor: Sensor, unitId: number): IUnitObservation {
    const observation = sensor.sense(unitId);
    if (observation === null) {
        throw new Error(`expected an observation for unit ${unitId}`);
    }
    return observation;
}

/**
 * 只读物理世界桩：仅 `getUnitState` 承载运动读数，其余方法为安全空操作。
 * 除 `IPhysicsWorld` 外不暴露任何公共成员。
 */
class StubPhysicsWorld implements IPhysicsWorld {
    /** unitId → 运动读数。 */
    private readonly states: Map<number, IUnitState>;

    /**
     * 构造物理桩。
     * @param states 运动读数表。
     */
    constructor(states: Map<number, IUnitState>) {
        this.states = states;
    }

    registerUnit(spec: IUnitPhysicsSpec): void {
        this.states.set(spec.unitId, stateAt(spec.x, spec.y));
    }

    removeUnit(unitId: number): void {
        this.states.delete(unitId);
    }

    hasUnit(unitId: number): boolean {
        return this.states.has(unitId);
    }

    applyForce(_unitId: number, _forceX: number, _forceY: number): void {
        // 感知测试不施加力。
    }

    applyTorque(_unitId: number, _torque: number): void {
        // 感知测试不施加力矩。
    }

    getUnitState(unitId: number): IUnitState | null {
        return this.states.get(unitId) ?? null;
    }

    tick(): IPhysicsTickResult {
        return { contacts: [], damages: [] };
    }

    dispose(): void {
        // 无资源可释放。
    }
}

/**
 * 只读单位目录桩：单位 + 阵营，供 `Sensor` 分类邻居。
 * 除 `IUnitCatalog` 外不暴露任何公共成员。
 */
class StubCatalog implements IUnitCatalog {
    /** unitId → 单位。 */
    private readonly units: Map<number, IUnit>;
    /** unitId → 阵营 id。 */
    private readonly teams: Map<number, number>;

    /**
     * 构造目录桩。
     * @param units 单位表。
     * @param teams 阵营表。
     */
    constructor(units: Map<number, IUnit>, teams: Map<number, number>) {
        this.units = units;
        this.teams = teams;
    }

    getUnit(unitId: number): IUnit | null {
        return this.units.get(unitId) ?? null;
    }

    getTeam(unitId: number): number | undefined {
        return this.teams.get(unitId);
    }

    listUnitIds(): readonly number[] {
        return [...this.units.keys()];
    }
}

/**
 * 记录型感知世界：捕获传给 `castRayFan` 的 blockers 后委托给内层竞技场。
 * 除 `ISensingWorld` 外不暴露任何公共成员。
 */
class RecordingSensingWorld implements ISensingWorld {
    /** 内层竞技场。 */
    private readonly inner: ISensingWorld;
    /** blockers 捕获回调。 */
    private readonly onRayFan: (blockers: readonly ISensedUnit[]) => void;

    /**
     * 构造记录型世界。
     * @param inner 内层世界。
     * @param onRayFan blockers 捕获回调。
     */
    constructor(
        inner: ISensingWorld,
        onRayFan: (blockers: readonly ISensedUnit[]) => void
    ) {
        this.inner = inner;
        this.onRayFan = onRayFan;
    }

    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[] {
        this.onRayFan(blockers);
        return this.inner.castRayFan(originX, originY, maxDistance, blockers);
    }

    queryProjectiles(
        x: number,
        y: number,
        radius: number
    ): readonly IProjectileSighting[] {
        return this.inner.queryProjectiles(x, y, radius);
    }
}

describe('Sensor — observation contract (CTRL-01)', () => {
    it('returns exactly 64 finite ray distances in [0, 50] with the +x boundary at 50', () => {
        const self = makeUnit(1);
        const states = new Map([[1, stateAt(0, 0)]]);
        const units = new Map([[1, self]]);
        const teams = new Map([[1, 1]]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.rayDistances).toHaveLength(RAY_COUNT);
        for (const distance of observation.rayDistances) {
            expect(Number.isFinite(distance)).toBe(true);
            expect(distance).toBeGreaterThanOrEqual(0);
            expect(distance).toBeLessThanOrEqual(SENSING_MAX_DISTANCE);
        }
        // 四种轴对齐射线（下标 0/16/32/48）都读到 50 m 边界。
        expect(observation.rayDistances[0]).toBeCloseTo(50, 6);
        expect(observation.rayDistances[16]).toBeCloseTo(50, 6);
        expect(observation.rayDistances[32]).toBeCloseTo(50, 6);
        expect(observation.rayDistances[48]).toBeCloseTo(50, 6);
        expect(observation.projectiles).toHaveLength(0);
    });

    it('computes analytic boundary distances for an off-centre origin', () => {
        const self = makeUnit(2);
        const states = new Map([[1, stateAt(10, 0)]]);
        const units = new Map([[1, self]]);
        const teams = new Map([[1, 1]]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        // +x 距边界 40 m；−x 为 60 m，按 50 m 截断；±y 各 50 m。
        expect(observation.rayDistances[0]).toBeCloseTo(40, 6);
        expect(observation.rayDistances[16]).toBeCloseTo(50, 6);
        expect(observation.rayDistances[32]).toBeCloseTo(50, 6);
        expect(observation.rayDistances[48]).toBeCloseTo(50, 6);
    });

    it('passes enemy blockers with their catalog teamId and shortens the ray', () => {
        const self = makeUnit(3);
        const enemy = makeUnit(4);
        const states = new Map([
            [1, stateAt(0, 0)],
            [2, stateAt(10, 0)]
        ]);
        const units = new Map([
            [1, self],
            [2, enemy]
        ]);
        const teams = new Map([
            [1, 1],
            [2, 2]
        ]);
        let captured: readonly ISensedUnit[] = [];
        const world = new RecordingSensingWorld(
            new ArenaSensingWorld(50),
            blockers => {
                captured = blockers;
            }
        );
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            world,
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.enemies).toHaveLength(1);
        expect(observation.allies).toHaveLength(0);
        expect(observation.rayDistances[0]).toBeCloseTo(
            10 - DEFAULT_GEOMETRY.bodyRadius,
            6
        );
        expect(captured).toHaveLength(1);
        expect(captured[0].unitId).toBe(2);
        expect(captured[0].teamId).toBe(2);
        expect(captured[0].x).toBe(10);
        expect(captured[0].y).toBe(0);
        expect(captured[0].radius).toBe(DEFAULT_GEOMETRY.bodyRadius);
    });

    it('does not let an enemy behind the origin affect the +x ray', () => {
        const self = makeUnit(5);
        const enemy = makeUnit(6);
        const states = new Map([
            [1, stateAt(0, 0)],
            [2, stateAt(-10, 0)]
        ]);
        const units = new Map([
            [1, self],
            [2, enemy]
        ]);
        const teams = new Map([
            [1, 1],
            [2, 2]
        ]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.enemies).toHaveLength(1);
        expect(observation.rayDistances[0]).toBeCloseTo(50, 6);
    });

    it('never passes an ally as a blocker while still listing it in allies', () => {
        const self = makeUnit(7);
        const ally = makeUnit(8);
        const states = new Map([
            [1, stateAt(0, 0)],
            [2, stateAt(10, 0)]
        ]);
        const units = new Map([
            [1, self],
            [2, ally]
        ]);
        const teams = new Map([
            [1, 1],
            [2, 1]
        ]);
        let captured: readonly ISensedUnit[] = [];
        const world = new RecordingSensingWorld(
            new ArenaSensingWorld(50),
            blockers => {
                captured = blockers;
            }
        );
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            world,
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.enemies).toHaveLength(0);
        expect(observation.allies).toHaveLength(1);
        expect(observation.allies[0].unitId).toBe(2);
        expect(observation.rayDistances[0]).toBeCloseTo(50, 6);
        expect(captured.every(blocker => blocker.teamId !== 1)).toBe(true);
        expect(captured.some(blocker => blocker.unitId === 2)).toBe(false);
    });

    it('caps distance at 50 m even when an enemy sits within the neighbour radius', () => {
        const self = makeUnit(9);
        const enemy = makeUnit(10);
        const states = new Map([
            [1, stateAt(0, 0)],
            [2, stateAt(80, 0)]
        ]);
        const units = new Map([
            [1, self],
            [2, enemy]
        ]);
        const teams = new Map([
            [1, 1],
            [2, 2]
        ]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        // 敌人仍在邻居查询半径内（100 m），但超出 50 m 感知上限。
        expect(observation.enemies).toHaveLength(1);
        expect(observation.rayDistances).toHaveLength(RAY_COUNT);
        for (const distance of observation.rayDistances) {
            expect(distance).toBeLessThanOrEqual(SENSING_MAX_DISTANCE);
        }
        expect(observation.rayDistances[0]).toBeCloseTo(50, 6);
    });

    it('sorts neighbours by distance, caps each list at 16, and filters dead/out-of-range units', () => {
        const units = new Map<number, IUnit>();
        const teams = new Map<number, number>();
        const states = new Map<number, IUnitState>();
        const self = makeUnit(11);
        units.set(1, self);
        teams.set(1, 1);
        states.set(1, stateAt(0, 0));

        let nextId = 2;
        // 20 个敌人（x = 5..24）与 20 个友方（x = −5..−24）。
        for (let index = 0; index < 20; index += 1) {
            const enemyId = nextId;
            nextId += 1;
            units.set(enemyId, makeUnit(100 + index));
            teams.set(enemyId, 2);
            states.set(enemyId, stateAt(5 + index, 0));

            const allyId = nextId;
            nextId += 1;
            units.set(allyId, makeUnit(200 + index));
            teams.set(allyId, 1);
            states.set(allyId, stateAt(-(5 + index), 0));
        }
        const deadId = nextId;
        nextId += 1;
        const dead = makeUnit(300);
        dead.takeDamage(dead.getAttribute(AttributeKind.MaxHealth) + 1);
        units.set(deadId, dead);
        teams.set(deadId, 2);
        states.set(deadId, stateAt(6, 0));

        const farId = nextId;
        const far = makeUnit(301);
        units.set(farId, far);
        teams.set(farId, 2);
        states.set(farId, stateAt(NEIGHBOR_QUERY_RADIUS + 10, 0));

        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(200),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.enemies).toHaveLength(MAX_NEIGHBORS);
        expect(observation.allies).toHaveLength(MAX_NEIGHBORS);
        // 距离升序：敌人 x 从 5 递增到 20，友方 x 从 −5 递减到 −20。
        expect(observation.enemies[0].x).toBe(5);
        expect(observation.enemies[MAX_NEIGHBORS - 1].x).toBe(20);
        expect(observation.allies[0].x).toBe(-5);
        expect(observation.allies[MAX_NEIGHBORS - 1].x).toBe(-20);
        for (let index = 1; index < observation.enemies.length; index += 1) {
            expect(observation.enemies[index].x).toBeGreaterThan(
                observation.enemies[index - 1].x
            );
        }
        // 死亡单位与超出邻居半径的单位都不出现。
        expect(observation.enemies.some(brief => brief.unitId === deadId)).toBe(
            false
        );
        expect(observation.enemies.some(brief => brief.unitId === farId)).toBe(
            false
        );
    });

    it('breaks distance ties by ascending unitId', () => {
        const self = makeUnit(12);
        const first = makeUnit(13);
        const second = makeUnit(14);
        const states = new Map([
            [1, stateAt(0, 0)],
            [7, stateAt(10, 0)],
            [3, stateAt(10, 0)]
        ]);
        const units = new Map([
            [1, self],
            [7, first],
            [3, second]
        ]);
        const teams = new Map([
            [1, 1],
            [7, 2],
            [3, 2]
        ]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);

        expect(observation.enemies).toHaveLength(2);
        expect(observation.enemies[0].unitId).toBe(3);
        expect(observation.enemies[1].unitId).toBe(7);
    });

    it('builds briefs with documented fields only and copies equipment', () => {
        const self = makeUnit(15);
        const enemy = makeUnit(16);
        const equipment = enemy.getEquipment();
        const states = new Map([
            [1, stateAt(0, 0)],
            [2, stateAt(10, 0)]
        ]);
        const units = new Map([
            [1, self],
            [2, enemy]
        ]);
        const teams = new Map([
            [1, 1],
            [2, 2]
        ]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        const observation = senseOrFail(sensor, 1);
        const brief = observation.enemies[0];

        expect(Object.keys(brief).sort()).toEqual([
            'equipment',
            'health',
            'level',
            'unitId',
            'x',
            'y'
        ]);
        expect(brief.unitId).toBe(2);
        expect(brief.health).toBe(enemy.getAttribute(AttributeKind.Health));
        expect(brief.level).toBe(enemy.getAttribute(AttributeKind.Level));
        expect(brief.x).toBe(10);
        expect(brief.y).toBe(0);
        expect(brief.equipment).not.toBe(equipment);
        expect(brief.equipment).toEqual(equipment);
    });

    it('exposes every attribute key plus motion, tick, class and equipment', () => {
        const self = makeUnit(17);
        const motion: IUnitState = {
            x: 1.5,
            y: -2.5,
            angle: 0.25,
            vx: 3,
            vy: -4,
            angularVelocity: 0.5
        };
        const states = new Map([[1, motion]]);
        const units = new Map([[1, self]]);
        const teams = new Map([[1, 1]]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 42
        );

        const observation = senseOrFail(sensor, 1);

        expect(Object.keys(observation.attributes)).toHaveLength(13);
        expect(observation.attributes[AttributeKind.Health]).toBe(
            self.getAttribute(AttributeKind.Health)
        );
        expect(observation.attributes[AttributeKind.MaxHealth]).toBe(
            self.getAttribute(AttributeKind.MaxHealth)
        );
        expect(observation.attributes[AttributeKind.Mass]).toBe(
            self.getAttribute(AttributeKind.Mass)
        );
        expect(observation.attributes[AttributeKind.Level]).toBe(1);
        expect(observation.motion).toEqual(motion);
        expect(observation.tick).toBe(42);
        expect(observation.unitId).toBe(1);
        expect(observation.classKind).toBe(ClassKind.Swordsman);
        expect(observation.equipment).toEqual(self.getEquipment());
        expect(observation.skills).toEqual(self.getSkills());
        expect(observation.projectiles).toHaveLength(0);
    });

    it('returns null for an unknown unit, missing motion, and unknown team', () => {
        const unit = makeUnit(18);
        const units = new Map([
            [1, unit],
            [2, makeUnit(19)],
            [3, makeUnit(20)]
        ]);
        const teams = new Map([[1, 1]]);
        const states = new Map([
            [1, stateAt(0, 0)],
            [3, stateAt(1, 1)]
        ]);
        const sensor = new Sensor(
            new StubPhysicsWorld(states),
            new StubCatalog(units, teams),
            new ArenaSensingWorld(50),
            () => 0
        );

        // 未知 id。
        expect(sensor.sense(999)).toBeNull();
        // 已注册但物理读数缺失（Pitfall 8）。
        expect(sensor.sense(2)).toBeNull();
        // 物理读数存在但阵营未知：无法分类敌我。
        expect(sensor.sense(3)).toBeNull();
    });
});
