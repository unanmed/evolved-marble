/**
 * 默认基线 AI：`class DefaultUnitAI implements IUnitAI`（D-14/D-15/D-16/D-17）。
 * 固定优先级选择器：无敌人 → 静止；低生命 → 远离最近敌人；僵持 → 脱离；进入攻击距离
 * → 冲撞；否则 → 追击。行为树以私有方法表达，不引入节点类、状态枚举或外部 BT 库。
 *
 * 实现要点：
 * - **确定性**：不使用 `IRng`，也不读取 wall-clock（D-15）；横向脱离方向只由 `unitId` 奇偶决定。
 * - 转向用速度误差控制与 PD 朝向控制：Rapier 无默认阻尼，恒定力会持续加速
 *   （research Pitfall 2）。
 * - 输出保持契约的四向力 + 双向力矩；伤害来自物理碰撞，契约没有独立「攻击」字段。
 * - 技能只输出意图 + 实例内 tick 冷却，不实现任何技能物理（D-17）。
 * - **僵持 → 脱离 → 再冲撞**：伤害只在**新接触**（物理层只 drain `started` 事件）产生，
 *   因此被顶死时持续推挤永远不会再产生伤害。AI 在攻击距离内连续若干次决策都测不到
 *   接近速度时后退一小段，再重新加速冲撞，从而持续制造高 Δv 的新接触。
 */

import type {
    IUnitBrief,
    IUnitAI,
    IUnitAction,
    IUnitObservation
} from '@/control/types';
import { SkillIntentKind } from '@/control/types';
import type { SkillIntent } from '@/control/types';
import {
    ARROW_STORM_COOLDOWN_TICKS,
    BOW_SHOT_INTERVAL_TICKS,
    CHARGE_COOLDOWN_TICKS,
    DEFAULT_AI_ANGULAR_DAMPING,
    DEFAULT_AI_ANGULAR_GAIN,
    DEFAULT_AI_APPROACH_SPEED,
    DEFAULT_AI_ATTACK_RANGE,
    DEFAULT_AI_ATTACK_SPEED,
    DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT,
    DEFAULT_AI_DISENGAGE_SPEED,
    DEFAULT_AI_DISENGAGE_TICKS,
    DEFAULT_AI_LINEAR_GAIN,
    DEFAULT_AI_LOW_HEALTH_RATIO,
    DEFAULT_AI_RETREAT_SPEED,
    DEFAULT_AI_SKILL_RANGE,
    DEFAULT_AI_STALL_DECISIONS,
    DEFAULT_AI_STALL_SPEED_THRESHOLD,
    FORCE_EPSILON,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE,
    SPIN_COOLDOWN_TICKS
} from '@/control/constants';
import {
    AttributeKind,
    EquipmentKind,
    SkillKind,
    WeaponKind
} from '@/units/types';
import { DT } from '@/physics/constants';

/**
 * 默认基线 AI：确定性的追击 / 冲撞 / 撤退 / 脱离选择器，附带一次性技能意图。
 */
export class DefaultUnitAI implements IUnitAI {
    /** 弓箭射击的下一次可用 tick：0 表示出生即可用（D-17）。 */
    private bowReadyTick = 0;
    /** 万箭齐发的下一次可用 tick。 */
    private arrowStormReadyTick = 0;
    /** 冲锋的下一次可用 tick。 */
    private chargeReadyTick = 0;
    /** 旋转的下一次可用 tick。 */
    private spinReadyTick = 0;
    /** 连续判定为僵持的决策次数：达到阈值即触发一次脱离。 */
    private stalledDecisions = 0;
    /** 脱离窗口的结束 tick（不含）：当前 tick 小于该值时处于脱离状态，0 表示未脱离。 */
    private disengageUntilTick = 0;
    /** 脱离时的横向符号（±1）：由 `unitId` 奇偶决定，保证同一单位每次一致。 */
    private lateralSign = 1;
    /** 上一次决策跟踪的目标 id：`null` 表示尚无基线。 */
    private lastTargetId: number | null = null;
    /** 上一次决策到该目标的距离（米）：接近速度的差分基线。 */
    private lastDistance = 0;
    /** 上一次决策的绝对 tick：接近速度的差分时基。 */
    private lastDecisionTick = 0;

    /**
     * 基于一次决策快照选择动作。纯计算，不持有物理或单位引用。
     * 优先级：无敌人 → 低生命撤退 → 脱离窗口 → 攻击距离内冲撞（僵持则转脱离）→ 追击。
     * @param observation 纯数据快照。
     * @returns 世界坐标四向力 + 双向力矩 + 技能意图。
     */
    decide(observation: IUnitObservation): IUnitAction {
        const target = this.nearestEnemy(observation);
        if (target === null) {
            return this.zeroAction();
        }

        const dx = target.brief.x - observation.motion.x;
        const dy = target.brief.y - observation.motion.y;
        const distance = Math.hypot(dx, dy);
        const closingSpeed = this.measureClosingSpeed(
            observation,
            target.brief.unitId,
            distance
        );

        if (this.isLowHealth(observation)) {
            return this.buildAction(
                observation,
                -dx,
                -dy,
                DEFAULT_AI_RETREAT_SPEED,
                null
            );
        }

        const hasDirection =
            Number.isFinite(distance) && distance > FORCE_EPSILON;
        // 目标与自身重合时没有可用方向：取 +x 作为确定性的退化基准，绝不使用随机数。
        const towardX = hasDirection ? dx / distance : 1;
        const towardY = hasDirection ? dy / distance : 0;

        if (observation.tick < this.disengageUntilTick) {
            return this.buildDisengageAction(observation, towardX, towardY);
        }

        const inAttackRange = distance <= DEFAULT_AI_ATTACK_RANGE;
        if (inAttackRange) {
            this.noteStall(closingSpeed);
            if (this.stalledDecisions >= DEFAULT_AI_STALL_DECISIONS) {
                this.beginDisengage(observation);
                return this.buildDisengageAction(observation, towardX, towardY);
            }
        } else {
            this.stalledDecisions = 0;
        }

        const speed = inAttackRange
            ? DEFAULT_AI_ATTACK_SPEED
            : DEFAULT_AI_APPROACH_SPEED;
        return this.buildAction(
            observation,
            dx,
            dy,
            speed,
            this.chooseSkillIntent(observation, distance)
        );
    }

    /**
     * 测量本次决策相对上一次决策的「接近速度」（米/秒）：到同一目标距离的缩小量
     * 除以两次决策之间经过的 tick 数（折算成秒）。
     *
     * 为什么用差分而不是自身速度投影：快照的 `IUnitBrief` 不含目标速度，目标以相近速度
     * 平移时自身速度投影仍然很大，却永远拉不近距离（互相追逐的绕圈），差分才是真正
     * 「还在不在接近」。每次决策都更新基线，目标切换或时间未前进时没有基线。
     * @param observation 纯数据快照。
     * @param targetId 当前目标的单位 id。
     * @param distance 当前到目标的距离（米）。
     * @returns 接近速度；尚无基线时返回 `null`。
     */
    private measureClosingSpeed(
        observation: IUnitObservation,
        targetId: number,
        distance: number
    ): number | null {
        const elapsedTicks = observation.tick - this.lastDecisionTick;
        const previousTargetId = this.lastTargetId;
        const previousDistance = this.lastDistance;
        this.lastTargetId = targetId;
        this.lastDistance = distance;
        this.lastDecisionTick = observation.tick;
        if (previousTargetId !== targetId || elapsedTicks <= 0) {
            return null;
        }
        return (previousDistance - distance) / (elapsedTicks * DT);
    }

    /**
     * 记录一次接近速度读数：低于僵持阈值（含非有限值或无基线）累加僵持计数，否则清零。
     * @param closingSpeed 接近速度（米/秒），无基线时为 `null`。
     */
    private noteStall(closingSpeed: number | null): void {
        if (
            closingSpeed !== null &&
            Number.isFinite(closingSpeed) &&
            closingSpeed < DEFAULT_AI_STALL_SPEED_THRESHOLD
        ) {
            this.stalledDecisions += 1;
            return;
        }
        this.stalledDecisions = 0;
    }

    /**
     * 开启一次脱离窗口：清零僵持计数，按 tick 设定窗口结束时刻，并按 `unitId` 奇偶
     * 固定横向符号（偶数 → +1，奇数 → -1）。
     * @param observation 纯数据快照。
     */
    private beginDisengage(observation: IUnitObservation): void {
        this.stalledDecisions = 0;
        this.disengageUntilTick = observation.tick + DEFAULT_AI_DISENGAGE_TICKS;
        this.lateralSign = observation.unitId % 2 === 0 ? 1 : -1;
    }

    /**
     * 构造脱离动作：方向 = 远离目标 + `DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT` × 横向单位向量，
     * 速度取 `DEFAULT_AI_DISENGAGE_SPEED`，本决策不输出技能意图。
     * @param observation 纯数据快照。
     * @param towardX 指向目标的单位向量 x 分量。
     * @param towardY 指向目标的单位向量 y 分量。
     * @returns 脱离动作。
     */
    private buildDisengageAction(
        observation: IUnitObservation,
        towardX: number,
        towardY: number
    ): IUnitAction {
        const dirX =
            -towardX -
            towardY * this.lateralSign * DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT;
        const dirY =
            -towardY +
            towardX * this.lateralSign * DEFAULT_AI_DISENGAGE_LATERAL_WEIGHT;
        return this.buildAction(
            observation,
            dirX,
            dirY,
            DEFAULT_AI_DISENGAGE_SPEED,
            null
        );
    }
    /**
     * 全零动作：无敌人时的安全回退。
     * @returns 全零动作。
     */
    private zeroAction(): IUnitAction {
        return {
            forceUp: 0,
            forceDown: 0,
            forceLeft: 0,
            forceRight: 0,
            torqueClockwise: 0,
            torqueCounterClockwise: 0,
            skillIntent: null
        };
    }

    /**
     * 在快照的敌方简讯中找出最近者；距离相同时取 `unitId` 较小者以保持确定性。
     * @param observation 纯数据快照。
     * @returns 最近敌人及其距离，或 `null`。
     */
    private nearestEnemy(
        observation: IUnitObservation
    ): { brief: IUnitBrief; distance: number } | null {
        let best: { brief: IUnitBrief; distance: number } | null = null;
        for (const brief of observation.enemies) {
            const distance = Math.hypot(
                brief.x - observation.motion.x,
                brief.y - observation.motion.y
            );
            if (!Number.isFinite(distance)) {
                continue;
            }
            if (
                best === null ||
                distance < best.distance ||
                (distance === best.distance && brief.unitId < best.brief.unitId)
            ) {
                best = { brief, distance };
            }
        }
        return best;
    }

    /**
     * 判断是否处于低生命：`Health / MaxHealth <= DEFAULT_AI_LOW_HEALTH_RATIO`。
     * `MaxHealth` 非正时视为「不低」，避免除零产生无穷/NaN。
     * @param observation 纯数据快照。
     * @returns 是否应撤退。
     */
    private isLowHealth(observation: IUnitObservation): boolean {
        const maxHealth = observation.attributes[AttributeKind.MaxHealth];
        if (!Number.isFinite(maxHealth) || maxHealth <= 0) {
            return false;
        }
        const health = observation.attributes[AttributeKind.Health];
        return health / maxHealth <= DEFAULT_AI_LOW_HEALTH_RATIO;
    }

    /**
     * 每决策至多输出一个技能意图，按「近距单位技能 → 万箭齐发 → 弓箭」优先
     * （D-17）。命中时在实例上记录下一次可用 tick；撤退路径不调用本方法。
     * @param observation 纯数据快照。
     * @param distance 与最近敌人的距离（米）。
     * @returns 本决策的技能意图，或 `null`。
     */
    private chooseSkillIntent(
        observation: IUnitObservation,
        distance: number
    ): SkillIntent | null {
        if (distance <= DEFAULT_AI_ATTACK_RANGE) {
            if (
                observation.skills.includes(SkillKind.Charge) &&
                observation.tick >= this.chargeReadyTick
            ) {
                this.chargeReadyTick = observation.tick + CHARGE_COOLDOWN_TICKS;
                return {
                    kind: SkillIntentKind.Unit,
                    unitId: observation.unitId,
                    skill: SkillKind.Charge
                };
            }
            if (
                observation.skills.includes(SkillKind.Spin) &&
                observation.tick >= this.spinReadyTick
            ) {
                this.spinReadyTick = observation.tick + SPIN_COOLDOWN_TICKS;
                return {
                    kind: SkillIntentKind.Unit,
                    unitId: observation.unitId,
                    skill: SkillKind.Spin
                };
            }
        }

        if (distance <= DEFAULT_AI_SKILL_RANGE) {
            if (
                observation.skills.includes(SkillKind.ArrowStorm) &&
                observation.tick >= this.arrowStormReadyTick
            ) {
                this.arrowStormReadyTick =
                    observation.tick + ARROW_STORM_COOLDOWN_TICKS;
                return {
                    kind: SkillIntentKind.Unit,
                    unitId: observation.unitId,
                    skill: SkillKind.ArrowStorm
                };
            }
            if (
                this.hasBow(observation) &&
                observation.tick >= this.bowReadyTick
            ) {
                this.bowReadyTick = observation.tick + BOW_SHOT_INTERVAL_TICKS;
                return {
                    kind: SkillIntentKind.Weapon,
                    unitId: observation.unitId,
                    weapon: WeaponKind.Bow
                };
            }
        }

        return null;
    }

    /**
     * 快照的装备列表中是否有弓：只有装备弓的单位才能输出射箭意图。
     * @param observation 纯数据快照。
     * @returns 是否装备弓箭。
     */
    private hasBow(observation: IUnitObservation): boolean {
        for (const item of observation.equipment) {
            if (
                item.kind === EquipmentKind.Weapon &&
                item.weapon === WeaponKind.Bow
            ) {
                return true;
            }
        }
        return false;
    }

    /**
     * PD 朝向控制：`torque = gain · angleError − damping · ω`，并截到力矩上限。
     * 方向向量为零或非有限时输出 0（不产生无意义的自旋）。
     * @param observation 纯数据快照。
     * @param dirX 期望朝向的单位向量 x 分量。
     * @param dirY 期望朝向的单位向量 y 分量。
     * @returns 有符号力矩（正 = 逆时针）。
     */
    private torqueToward(
        observation: IUnitObservation,
        dirX: number,
        dirY: number
    ): number {
        const length = Math.hypot(dirX, dirY);
        if (!Number.isFinite(length) || length <= FORCE_EPSILON) {
            return 0;
        }

        const desiredAngle = Math.atan2(dirY, dirX);
        let angleError = desiredAngle - observation.motion.angle;
        angleError = Math.atan2(Math.sin(angleError), Math.cos(angleError));
        const rawTorque =
            DEFAULT_AI_ANGULAR_GAIN * angleError -
            DEFAULT_AI_ANGULAR_DAMPING * observation.motion.angularVelocity;
        if (!Number.isFinite(rawTorque)) {
            return 0;
        }
        return Math.max(
            -MAX_TORQUE_MAGNITUDE,
            Math.min(MAX_TORQUE_MAGNITUDE, rawTorque)
        );
    }

    /**
     * 构造动作：速度误差控制产生力、PD 产生力矩，并分解为契约的非负幅值。
     * 期望速度 = 单位方向 × 目标速度；`force = (vDesired − vCurrent) · Mass · gain`，
     * 向量幅值截到 `MAX_FORCE_MAGNITUDE`。
     * @param observation 纯数据快照。
     * @param dirX 期望方向的 x 分量（无需预先归一化；撤退时传入反向）。
     * @param dirY 期望方向的 y 分量（无需预先归一化；撤退时传入反向）。
     * @param speed 期望线速度大小（米/秒）。
     * @param skillIntent 本决策的技能意图。
     * @returns 动作。
     */
    private buildAction(
        observation: IUnitObservation,
        dirX: number,
        dirY: number,
        speed: number,
        skillIntent: SkillIntent | null
    ): IUnitAction {
        const length = Math.hypot(dirX, dirY);
        const normalizedX =
            Number.isFinite(length) && length > FORCE_EPSILON
                ? dirX / length
                : 0;
        const normalizedY =
            Number.isFinite(length) && length > FORCE_EPSILON
                ? dirY / length
                : 0;

        const mass = observation.attributes[AttributeKind.Mass];
        const desiredVx = normalizedX * speed;
        const desiredVy = normalizedY * speed;
        let fx =
            (desiredVx - observation.motion.vx) * mass * DEFAULT_AI_LINEAR_GAIN;
        let fy =
            (desiredVy - observation.motion.vy) * mass * DEFAULT_AI_LINEAR_GAIN;

        const magnitude = Math.hypot(fx, fy);
        if (!Number.isFinite(magnitude)) {
            fx = 0;
            fy = 0;
        } else if (magnitude > MAX_FORCE_MAGNITUDE) {
            const scale = MAX_FORCE_MAGNITUDE / magnitude;
            fx *= scale;
            fy *= scale;
        }

        const torque = this.torqueToward(observation, normalizedX, normalizedY);

        return {
            forceUp: fy > 0 ? fy : 0,
            forceDown: fy < 0 ? -fy : 0,
            forceLeft: fx < 0 ? -fx : 0,
            forceRight: fx > 0 ? fx : 0,
            torqueClockwise: torque < 0 ? -torque : 0,
            torqueCounterClockwise: torque > 0 ? torque : 0,
            skillIntent
        };
    }
}
