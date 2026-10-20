/**
 * 默认基线 AI：`class DefaultUnitAI implements IUnitAI`（D-14/D-15/D-16）。
 * 固定优先级选择器：无敌人 → 静止；低生命 → 远离最近敌人；否则追击/冲撞。
 *
 * 实现要点：
 * - **确定性**：不使用 `IRng`（D-15）。
 * - 转向用速度误差控制与 PD 朝向控制：Rapier 无默认阻尼，恒定力会持续加速
 *   （research Pitfall 2）。
 * - 输出保持契约的四向力 + 双向力矩；伤害来自物理碰撞，契约没有独立「攻击」字段。
 * 技能意图与冷却在 03-03 完成；本计划始终输出 `skillIntent: null`。
 */

import type {
    IUnitBrief,
    IUnitAI,
    IUnitAction,
    IUnitObservation
} from '@/control/types';
import type { SkillIntent } from '@/control/types';
import {
    DEFAULT_AI_ANGULAR_DAMPING,
    DEFAULT_AI_ANGULAR_GAIN,
    DEFAULT_AI_APPROACH_SPEED,
    DEFAULT_AI_ATTACK_RANGE,
    DEFAULT_AI_ATTACK_SPEED,
    DEFAULT_AI_LINEAR_GAIN,
    DEFAULT_AI_LOW_HEALTH_RATIO,
    DEFAULT_AI_RETREAT_SPEED,
    FORCE_EPSILON,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE
} from '@/control/constants';
import { AttributeKind } from '@/units/types';

/**
 * 默认基线 AI：确定性的追击 / 冲撞 / 撤退选择器。
 */
export class DefaultUnitAI implements IUnitAI {
    /**
     * 基于一次决策快照选择动作。纯计算，不持有物理或单位引用。
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

        if (this.isLowHealth(observation)) {
            return this.buildAction(
                observation,
                -dx,
                -dy,
                DEFAULT_AI_RETREAT_SPEED,
                null
            );
        }

        const speed =
            target.distance <= DEFAULT_AI_ATTACK_RANGE
                ? DEFAULT_AI_ATTACK_SPEED
                : DEFAULT_AI_APPROACH_SPEED;
        return this.buildAction(observation, dx, dy, speed, null);
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
     * @param dirX 期望方向的 x 分量（无需预先归一化）。
     * @param dirY 期望方向的 y 分量（无需预先归一化）。
     * @param speed 期望线速度大小（米/秒）。
     * @param skillIntent 本决策的技能意图（本计划恒为 `null`）。
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
