/**
 * 行军 AI：`class MarchAI implements IUnitAI`（D-11/D-12）。
 * 程序阵型控制：追自己的阵型槽位（速度误差控制）、用 64 条射线做轻微排斥、
 * 用 PD 力矩朝向期望方向。不保存模式/目标/军队状态——槽位由 World 经注入闭包提供。
 */

import {
    DEFAULT_AI_LINEAR_GAIN,
    FORCE_EPSILON,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE,
    RAY_COUNT
} from '@/control/constants';
import type { IUnitAction, IUnitAI, IUnitObservation } from '@/control/types';
import {
    MARCH_ANGULAR_DAMPING,
    MARCH_ANGULAR_GAIN,
    MARCH_APPROACH_GAIN,
    MARCH_AVOID_DISTANCE,
    MARCH_AVOID_STRENGTH,
    MARCH_MAX_SPEED,
    ZERO_ACTION
} from '@/kingdom/constants';
import type { IVec2 } from '@/kingdom/types';
import { AttributeKind } from '@/units/types';

/**
 * 行军 AI：确定性槽位追击 + 射线排斥，不含行为树。
 */
export class MarchAI implements IUnitAI {
    /** 本 AI 所属单位 id。 */
    private readonly unitId: number;
    /** 读取本 AI 当前阵型槽位的闭包；无槽位时返回 `null`。 */
    private readonly slotOf: (unitId: number) => IVec2 | null;

    /**
     * 构造行军 AI。
     * @param unitId 本 AI 所属单位 id。
     * @param slotOf 返回该单位当前阵型槽位的闭包（由 World 从 `computeFormationSlots` 填充）。
     */
    constructor(unitId: number, slotOf: (unitId: number) => IVec2 | null) {
        this.unitId = unitId;
        this.slotOf = slotOf;
    }

    /**
     * 基于一次决策快照选择动作：追槽位 + 射线排斥 + PD 朝向。
     * 无槽位或距离非有限时返回全零动作。
     * @param observation 纯数据快照。
     * @returns 世界坐标四向力 + 双向力矩 + 技能意图（恒 `null`）。
     */
    decide(observation: IUnitObservation): IUnitAction {
        const slot = this.slotOf(this.unitId);
        if (slot === null) {
            return ZERO_ACTION;
        }

        const dx = slot.x - observation.motion.x;
        const dy = slot.y - observation.motion.y;
        const distance = Math.hypot(dx, dy);
        if (!Number.isFinite(distance) || distance <= FORCE_EPSILON) {
            return ZERO_ACTION;
        }

        const dirX = dx / distance;
        const dirY = dy / distance;
        const desiredSpeed = Math.min(
            distance * MARCH_APPROACH_GAIN,
            MARCH_MAX_SPEED
        );

        const repulsion = this.avoidance(observation.rayDistances);
        const desiredVx = dirX * desiredSpeed + repulsion.x;
        const desiredVy = dirY * desiredSpeed + repulsion.y;

        const mass = observation.attributes[AttributeKind.Mass];
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

        const torque = this.torqueToward(observation, dirX, dirY);

        return {
            forceUp: fy > 0 ? fy : 0,
            forceDown: fy < 0 ? -fy : 0,
            forceLeft: fx < 0 ? -fx : 0,
            forceRight: fx > 0 ? fx : 0,
            torqueClockwise: torque < 0 ? -torque : 0,
            torqueCounterClockwise: torque > 0 ? torque : 0,
            skillIntent: null
        };
    }

    /**
     * 由 64 条射线计算排斥速度：每条近于 `MARCH_AVOID_DISTANCE` 的射线按
     * `(1 − d / MARCH_AVOID_DISTANCE) · MARCH_AVOID_STRENGTH` 沿射线反方向推。
     * @param rayDistances 世界坐标固定方向的射线距离（米）。
     * @returns 排斥速度向量。
     */
    private avoidance(rayDistances: readonly number[]): {
        x: number;
        y: number;
    } {
        let x = 0;
        let y = 0;
        const step = (Math.PI * 2) / RAY_COUNT;
        for (let index = 0; index < RAY_COUNT; index += 1) {
            const distance = rayDistances[index];
            if (
                !Number.isFinite(distance) ||
                distance >= MARCH_AVOID_DISTANCE
            ) {
                continue;
            }
            const weight =
                (1 - distance / MARCH_AVOID_DISTANCE) * MARCH_AVOID_STRENGTH;
            const angle = index * step;
            x -= Math.cos(angle) * weight;
            y -= Math.sin(angle) * weight;
        }
        return { x, y };
    }

    /**
     * PD 朝向控制：`torque = gain · angleError − damping · ω`，截到力矩上限。
     * 方向向量为零或非有限时输出 0。
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
        const angleError = Math.atan2(
            Math.sin(desiredAngle - observation.motion.angle),
            Math.cos(desiredAngle - observation.motion.angle)
        );
        const rawTorque =
            MARCH_ANGULAR_GAIN * angleError -
            MARCH_ANGULAR_DAMPING * observation.motion.angularVelocity;
        if (!Number.isFinite(rawTorque)) {
            return 0;
        }
        return Math.max(
            -MAX_TORQUE_MAGNITUDE,
            Math.min(MAX_TORQUE_MAGNITUDE, rawTorque)
        );
    }
}
