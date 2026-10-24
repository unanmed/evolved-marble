import { describe, expect, it } from 'vitest';
import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import {
    ARROW_STORM_COOLDOWN_TICKS,
    BOW_SHOT_INTERVAL_TICKS,
    CHARGE_COOLDOWN_TICKS,
    DEFAULT_AI_APPROACH_SPEED,
    DEFAULT_AI_ATTACK_SPEED,
    DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT,
    DEFAULT_AI_DISENGAGE_SPEED,
    DEFAULT_AI_DISENGAGE_TICKS,
    DEFAULT_AI_LINEAR_GAIN,
    DEFAULT_AI_STALL_DECISIONS,
    DECISION_INTERVAL_TICKS,
    RAY_COUNT,
    SENSING_MAX_DISTANCE,
    SPIN_COOLDOWN_TICKS
} from '@/control/constants';
import { SkillIntentKind } from '@/control/types';
import type {
    IUnitAction,
    IUnitBrief,
    IUnitObservation
} from '@/control/types';
import type { IUnitState } from '@/physics/types';
import {
    AttributeKind,
    ClassKind,
    EquipmentKind,
    SkillKind,
    WeaponKind
} from '@/units/types';

/**
 * 以默认值（Mass = 10，其余属性为 0）为底，叠加指定属性。
 * @param overrides 需要覆盖的属性。
 * @returns 覆盖全部 13 个 `AttributeKind` 的属性读数。
 */
function attributesWith(
    overrides: Partial<Record<AttributeKind, number>> = {}
): Record<AttributeKind, number> {
    return {
        [AttributeKind.Health]: overrides[AttributeKind.Health] ?? 0,
        [AttributeKind.MaxHealth]: overrides[AttributeKind.MaxHealth] ?? 0,
        [AttributeKind.Level]: overrides[AttributeKind.Level] ?? 0,
        [AttributeKind.Experience]: overrides[AttributeKind.Experience] ?? 0,
        [AttributeKind.ExperienceRatio]:
            overrides[AttributeKind.ExperienceRatio] ?? 0,
        [AttributeKind.AttackExpRatio]:
            overrides[AttributeKind.AttackExpRatio] ?? 0,
        [AttributeKind.DefenseExpRatio]:
            overrides[AttributeKind.DefenseExpRatio] ?? 0,
        [AttributeKind.ControlLevel]:
            overrides[AttributeKind.ControlLevel] ?? 0,
        [AttributeKind.Attack]: overrides[AttributeKind.Attack] ?? 0,
        [AttributeKind.Defense]: overrides[AttributeKind.Defense] ?? 0,
        [AttributeKind.WeaponRatio]: overrides[AttributeKind.WeaponRatio] ?? 0,
        [AttributeKind.ArmorRatio]: overrides[AttributeKind.ArmorRatio] ?? 0,
        [AttributeKind.Mass]: overrides[AttributeKind.Mass] ?? 10
    };
}

/**
 * 构造一份完整的 `IUnitObservation`：默认静止于原点、无敌人、无技能、无装备。
 * @param overrides 需要覆盖的字段；属性与运动状态可只给部分键。
 * @returns 完整的纯数据快照。
 */
function makeObservation(
    overrides: Partial<Omit<IUnitObservation, 'attributes' | 'motion'>> & {
        attributes?: Partial<Record<AttributeKind, number>>;
        motion?: Partial<IUnitState>;
    } = {}
): IUnitObservation {
    const { attributes, motion, ...rest } = overrides;
    return {
        unitId: rest.unitId ?? 1,
        tick: rest.tick ?? 0,
        attributes: attributesWith(attributes),
        classKind: rest.classKind ?? ClassKind.Swordsman,
        equipment: rest.equipment ?? [],
        skills: rest.skills ?? [],
        motion: {
            x: motion?.x ?? 0,
            y: motion?.y ?? 0,
            angle: motion?.angle ?? 0,
            vx: motion?.vx ?? 0,
            vy: motion?.vy ?? 0,
            angularVelocity: motion?.angularVelocity ?? 0
        },
        rayDistances: Array.from(
            { length: RAY_COUNT },
            () => SENSING_MAX_DISTANCE
        ),
        enemies: rest.enemies ?? [],
        allies: rest.allies ?? [],
        projectiles: rest.projectiles ?? []
    };
}

/**
 * 构造一条敌方简讯。
 * @param unitId 敌方单位 id。
 * @param x 位置的 x 坐标。
 * @param y 位置的 y 坐标。
 * @returns 敌方简讯。
 */
function enemyAt(unitId: number, x: number, y: number): IUnitBrief {
    return { unitId, health: 100, level: 1, x, y, equipment: [] };
}

/**
 * 由动作的四向力还原世界坐标净力。
 * @param action AI 动作。
 * @returns 净力向量（`x` = 右 − 左，`y` = 上 − 下）。
 */
function forceVector(action: IUnitAction): { x: number; y: number } {
    return {
        x: action.forceRight - action.forceLeft,
        y: action.forceUp - action.forceDown
    };
}

/**
 * 由动作的两个力矩还原有符号力矩（正 = 逆时针）。
 * @param action AI 动作。
 * @returns 有符号力矩。
 */
function torqueScalar(action: IUnitAction): number {
    return action.torqueCounterClockwise - action.torqueClockwise;
}

/**
 * 断言动作携带指定单位技能意图。
 * @param action AI 动作。
 * @param skill 期望的技能。
 */
function expectUnitSkill(action: IUnitAction, skill: SkillKind): void {
    expect(action.skillIntent).toMatchObject({
        kind: SkillIntentKind.Unit,
        unitId: 1,
        skill
    });
}

/**
 * 断言动作携带弓箭武器技能意图。
 * @param action AI 动作。
 */
function expectBowIntent(action: IUnitAction): void {
    expect(action.skillIntent).toMatchObject({
        kind: SkillIntentKind.Weapon,
        unitId: 1,
        weapon: WeaponKind.Bow
    });
}

describe('DefaultUnitAI — baseline behaviour tree', () => {
    it('is idle with zero force, zero torque, and no skill intent when no enemy is visible', () => {
        const action = new DefaultUnitAI().decide(makeObservation());

        expect(action.forceUp).toBe(0);
        expect(action.forceDown).toBe(0);
        expect(action.forceLeft).toBe(0);
        expect(action.forceRight).toBe(0);
        expect(action.torqueClockwise).toBe(0);
        expect(action.torqueCounterClockwise).toBe(0);
        expect(action.skillIntent).toBeNull();
    });

    it('approaches a distant enemy with velocity-error force and no torque when already facing it', () => {
        const observation = makeObservation({
            enemies: [enemyAt(2, 20, 0)]
        });
        const action = new DefaultUnitAI().decide(observation);
        const force = forceVector(action);
        const mass = observation.attributes[AttributeKind.Mass];

        expect(force.x).toBeGreaterThan(0);
        expect(force.y).toBe(0);
        expect(Math.hypot(force.x, force.y)).toBeCloseTo(
            mass * DEFAULT_AI_LINEAR_GAIN * DEFAULT_AI_APPROACH_SPEED,
            6
        );
        expect(torqueScalar(action)).toBe(0);
    });

    it('rams harder once the enemy is inside the attack range', () => {
        const approach = new DefaultUnitAI().decide(
            makeObservation({ enemies: [enemyAt(2, 20, 0)] })
        );
        const attackObservation = makeObservation({
            enemies: [enemyAt(2, 1, 0)]
        });
        const attack = new DefaultUnitAI().decide(attackObservation);
        const attackForce = forceVector(attack);
        const mass = attackObservation.attributes[AttributeKind.Mass];

        expect(attackForce.x).toBeGreaterThan(0);
        expect(Math.hypot(attackForce.x, attackForce.y)).toBeGreaterThan(
            Math.hypot(forceVector(approach).x, forceVector(approach).y)
        );
        expect(Math.hypot(attackForce.x, attackForce.y)).toBeCloseTo(
            mass * DEFAULT_AI_LINEAR_GAIN * DEFAULT_AI_ATTACK_SPEED,
            6
        );
    });

    it('keeps attacking a low-health unit instead of retreating', () => {
        const far = makeObservation({
            attributes: {
                [AttributeKind.Health]: 10,
                [AttributeKind.MaxHealth]: 100
            },
            skills: [SkillKind.Charge],
            equipment: [{ kind: EquipmentKind.Weapon, weapon: WeaponKind.Bow }],
            enemies: [enemyAt(2, 5, 0)]
        });
        const approach = new DefaultUnitAI().decide(far);
        const approachForce = forceVector(approach);
        const mass = far.attributes[AttributeKind.Mass];

        // No health-based flee: the unit still closes on the enemy at the approach speed.
        expect(approachForce.x).toBeGreaterThan(0);
        expect(Math.hypot(approachForce.x, approachForce.y)).toBeCloseTo(
            mass * DEFAULT_AI_LINEAR_GAIN * DEFAULT_AI_APPROACH_SPEED,
            6
        );

        const close = makeObservation({
            attributes: {
                [AttributeKind.Health]: 1,
                [AttributeKind.MaxHealth]: 100
            },
            enemies: [enemyAt(2, 1, 0)]
        });
        const closeForce = forceVector(new DefaultUnitAI().decide(close));
        expect(closeForce.x).toBeGreaterThan(0);
        expect(Math.hypot(closeForce.x, closeForce.y)).toBeCloseTo(
            close.attributes[AttributeKind.Mass] *
                DEFAULT_AI_LINEAR_GAIN *
                DEFAULT_AI_ATTACK_SPEED,
            6
        );
    });

    it('turns toward a perpendicular enemy and lets the PD damping term reduce the torque', () => {
        const undamped = new DefaultUnitAI().decide(
            makeObservation({ enemies: [enemyAt(2, 0, 5)] })
        );
        const damped = new DefaultUnitAI().decide(
            makeObservation({
                enemies: [enemyAt(2, 0, 5)],
                motion: { angularVelocity: 10 }
            })
        );

        expect(torqueScalar(undamped)).toBeGreaterThan(0);
        expect(torqueScalar(damped)).toBeLessThan(torqueScalar(undamped));
        expect(torqueScalar(damped)).toBeLessThan(0);
    });

    it('is deterministic when no cooldown is armed', () => {
        const ai = new DefaultUnitAI();
        const observation = makeObservation({
            enemies: [enemyAt(2, 10, 3)]
        });

        expect(ai.decide(observation)).toEqual(ai.decide(observation));
    });

    it('emits one bow intent per BOW_SHOT_INTERVAL_TICKS window', () => {
        const ai = new DefaultUnitAI();
        const equipment = [
            { kind: EquipmentKind.Weapon, weapon: WeaponKind.Bow }
        ];
        const observationAt = (tick: number): IUnitObservation =>
            makeObservation({
                tick,
                equipment,
                enemies: [enemyAt(9, 10, 0)]
            });

        expectBowIntent(ai.decide(observationAt(0)));
        expect(ai.decide(observationAt(1)).skillIntent).toBeNull();
        expectBowIntent(ai.decide(observationAt(BOW_SHOT_INTERVAL_TICKS)));
    });

    it('emits one Charge intent per CHARGE_COOLDOWN_TICKS window at close range', () => {
        const ai = new DefaultUnitAI();
        const skills = [SkillKind.Charge];
        const observationAt = (tick: number): IUnitObservation =>
            makeObservation({
                tick,
                skills,
                enemies: [enemyAt(9, 1, 0)]
            });

        expectUnitSkill(ai.decide(observationAt(0)), SkillKind.Charge);
        expect(ai.decide(observationAt(1)).skillIntent).toBeNull();
        expectUnitSkill(
            ai.decide(observationAt(CHARGE_COOLDOWN_TICKS)),
            SkillKind.Charge
        );
    });

    it('emits one Spin intent per SPIN_COOLDOWN_TICKS window at close range', () => {
        const ai = new DefaultUnitAI();
        const skills = [SkillKind.Spin];
        const observationAt = (tick: number): IUnitObservation =>
            makeObservation({
                tick,
                skills,
                enemies: [enemyAt(9, 1, 0)]
            });

        expectUnitSkill(ai.decide(observationAt(0)), SkillKind.Spin);
        expect(ai.decide(observationAt(1)).skillIntent).toBeNull();
        expectUnitSkill(
            ai.decide(observationAt(SPIN_COOLDOWN_TICKS)),
            SkillKind.Spin
        );
    });

    it('emits one ArrowStorm intent per ARROW_STORM_COOLDOWN_TICKS window in skill range', () => {
        const ai = new DefaultUnitAI();
        const skills = [SkillKind.ArrowStorm];
        const observationAt = (tick: number): IUnitObservation =>
            makeObservation({
                tick,
                skills,
                enemies: [enemyAt(9, 10, 0)]
            });

        expectUnitSkill(ai.decide(observationAt(0)), SkillKind.ArrowStorm);
        expect(ai.decide(observationAt(1)).skillIntent).toBeNull();
        expectUnitSkill(
            ai.decide(observationAt(ARROW_STORM_COOLDOWN_TICKS)),
            SkillKind.ArrowStorm
        );
    });

    it('prefers Charge over Spin, emitting at most one intent per decision', () => {
        const action = new DefaultUnitAI().decide(
            makeObservation({
                skills: [SkillKind.Spin, SkillKind.Charge],
                enemies: [enemyAt(2, 1, 0)]
            })
        );

        expectUnitSkill(action, SkillKind.Charge);
    });

    it('emits no skill intent when nothing is unlocked or equipped', () => {
        const close = new DefaultUnitAI().decide(
            makeObservation({ enemies: [enemyAt(2, 1, 0)] })
        );
        const far = new DefaultUnitAI().decide(
            makeObservation({ enemies: [enemyAt(2, 10, 0)] })
        );

        expect(close.skillIntent).toBeNull();
        expect(far.skillIntent).toBeNull();
    });

    it('emits only the six force/torque magnitudes plus the intent, never skill physics', () => {
        const action = new DefaultUnitAI().decide(
            makeObservation({
                skills: [SkillKind.Charge],
                equipment: [
                    { kind: EquipmentKind.Weapon, weapon: WeaponKind.Bow }
                ],
                enemies: [enemyAt(2, 1, 0)]
            })
        );

        expect(Object.keys(action).sort()).toEqual([
            'forceDown',
            'forceLeft',
            'forceRight',
            'forceUp',
            'skillIntent',
            'torqueClockwise',
            'torqueCounterClockwise'
        ]);
        expect(action.skillIntent).not.toBeNull();
    });
});

describe('DefaultUnitAI — stall detection and disengage cycle', () => {
    /**
     * 连续在攻击距离内、与目标距离不变的决策（被顶住的典型读数）。
     * @param ai 被测 AI 实例。
     * @param unitId 自身单位 id（决定横向符号）。
     * @param decisions 追加的决策次数。
     * @param startTick 首个决策 tick。
     * @returns 每个决策的返回动作。
     */
    function blockedDecisions(
        ai: DefaultUnitAI,
        unitId: number,
        decisions: number,
        startTick = 0
    ): IUnitAction[] {
        const actions: IUnitAction[] = [];
        for (let index = 0; index < decisions; index += 1) {
            actions.push(
                ai.decide(
                    makeObservation({
                        unitId,
                        tick: startTick + index * DECISION_INTERVAL_TICKS,
                        enemies: [enemyAt(9, 1, 0)]
                    })
                )
            );
        }
        return actions;
    }

    it('keeps charging while the target distance still shrinks', () => {
        const ai = new DefaultUnitAI();
        const actions: IUnitAction[] = [];
        for (let index = 0; index < 6; index += 1) {
            actions.push(
                ai.decide(
                    makeObservation({
                        unitId: 1,
                        tick: index * DECISION_INTERVAL_TICKS,
                        enemies: [enemyAt(9, 10 - index * 0.5, 0)]
                    })
                )
            );
        }

        expect(actions.every(action => forceVector(action).x > 0)).toBe(true);
    });

    it('triggers a back-off after DEFAULT_AI_STALL_DECISIONS blocked decisions', () => {
        const ai = new DefaultUnitAI();
        const actions = blockedDecisions(ai, 1, DEFAULT_AI_STALL_DECISIONS + 1);
        const mass = attributesWith()[AttributeKind.Mass];

        // 前 DEFAULT_AI_STALL_DECISIONS 次仍在冲撞（向 +x）。
        for (const action of actions.slice(0, DEFAULT_AI_STALL_DECISIONS)) {
            expect(forceVector(action).x).toBeGreaterThan(0);
        }

        const backOff = forceVector(actions[DEFAULT_AI_STALL_DECISIONS]);
        expect(backOff.x).toBeLessThan(0);
        expect(backOff.y).not.toBe(0);
        expect(Math.hypot(backOff.x, backOff.y)).toBeCloseTo(
            mass * DEFAULT_AI_LINEAR_GAIN * DEFAULT_AI_DISENGAGE_SPEED,
            6
        );
    });

    it('mixes the lateral component into the back-off instead of reversing straight', () => {
        const ai = new DefaultUnitAI();
        const actions = blockedDecisions(ai, 1, DEFAULT_AI_STALL_DECISIONS + 1);
        const backOff = forceVector(actions[DEFAULT_AI_STALL_DECISIONS]);
        const length = Math.hypot(backOff.x, backOff.y);
        // 目标在 +x：远离分量为 -1，横向量为 ±DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT。
        expect(Math.abs(backOff.x) / length).toBeCloseTo(
            1 / Math.hypot(1, DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT),
            6
        );
        expect(Math.abs(backOff.y) / length).toBeCloseTo(
            DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT /
                Math.hypot(1, DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT),
            6
        );
    });

    it('picks the lateral sign deterministically from unitId parity', () => {
        const odd = new DefaultUnitAI();
        const even = new DefaultUnitAI();
        const oddActions = blockedDecisions(
            odd,
            1,
            DEFAULT_AI_STALL_DECISIONS + 1
        );
        const evenActions = blockedDecisions(
            even,
            2,
            DEFAULT_AI_STALL_DECISIONS + 1
        );

        const oddY = forceVector(oddActions[DEFAULT_AI_STALL_DECISIONS]).y;
        const evenY = forceVector(evenActions[DEFAULT_AI_STALL_DECISIONS]).y;
        expect(Math.sign(oddY)).toBe(-Math.sign(evenY));

        // 同一 unitId 的后续周期保持同一横向符号。
        const nextCycle = blockedDecisions(
            odd,
            1,
            DEFAULT_AI_STALL_DECISIONS + 1,
            DEFAULT_AI_DISENGAGE_TICKS + DECISION_INTERVAL_TICKS * 5
        );
        expect(
            Math.sign(forceVector(nextCycle[DEFAULT_AI_STALL_DECISIONS]).y)
        ).toBe(Math.sign(oddY));
    });

    it('resumes the normal charge once the disengage window ends', () => {
        const ai = new DefaultUnitAI();
        const actions = blockedDecisions(ai, 1, DEFAULT_AI_STALL_DECISIONS + 1);
        const triggerTick =
            DEFAULT_AI_STALL_DECISIONS * DECISION_INTERVAL_TICKS;
        const inWindow = ai.decide(
            makeObservation({
                unitId: 1,
                tick: triggerTick + DECISION_INTERVAL_TICKS,
                enemies: [enemyAt(9, 1, 0)]
            })
        );
        const afterWindow = ai.decide(
            makeObservation({
                unitId: 1,
                tick: triggerTick + DEFAULT_AI_DISENGAGE_TICKS,
                enemies: [enemyAt(9, 3, 0)]
            })
        );

        expect(forceVector(inWindow).x).toBeLessThan(0);
        expect(forceVector(actions[DEFAULT_AI_STALL_DECISIONS]).x).toBeLessThan(
            0
        );
        expect(forceVector(afterWindow).x).toBeGreaterThan(0);
    });

    it('lets low health keep the armed stall/disengage cycle instead of fleeing', () => {
        const ai = new DefaultUnitAI();
        blockedDecisions(ai, 1, DEFAULT_AI_STALL_DECISIONS);
        const action = ai.decide(
            makeObservation({
                unitId: 1,
                tick: DEFAULT_AI_STALL_DECISIONS * DECISION_INTERVAL_TICKS,
                attributes: {
                    [AttributeKind.Health]: 10,
                    [AttributeKind.MaxHealth]: 100
                },
                enemies: [enemyAt(9, 1, 0)]
            })
        );
        const force = forceVector(action);

        // 低生命不再覆盖僵持逻辑：仍是带横向分量的脱离（不是纯反向撤退）。
        expect(force.x).toBeLessThan(0);
        expect(force.y).not.toBe(0);
        expect(Math.hypot(force.x, force.y)).toBeCloseTo(
            attributesWith()[AttributeKind.Mass] *
                DEFAULT_AI_LINEAR_GAIN *
                DEFAULT_AI_DISENGAGE_SPEED,
            6
        );
    });
});
