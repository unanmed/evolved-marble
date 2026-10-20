/**
 * 离区刹车 AI：`class BrakeAI implements IUnitAI`（D-14）。
 * 单位离开仍在进行的战斗区后，用速度误差控制把线速度与角速度压向 0；
 * 不追槽位、不读战斗区、不输出技能。`ControlSystem` 每物理 tick 重新施加该动作，
 * 因此刹车持续有效（research Pitfall 3）。
 */

import {
    FORCE_EPSILON,
    MAX_FORCE_MAGNITUDE,
    MAX_TORQUE_MAGNITUDE
} from '@/control/constants';
import type { IUnitAction, IUnitAI, IUnitObservation } from '@/control/types';
import {
    BRAKE_ANGULAR_DAMPING,
    BRAKE_ANGULAR_GAIN,
    BRAKE_LINEAR_GAIN,
    ZERO_ACTION
} from '@/kingdom/constants';
import { AttributeKind } from '@/units/types';

/**
 * 刹车 AI：线速度与角速度的比例阻尼。
 */
export class BrakeAI implements IUnitAI {
    /**
     * 基于快照返回刹车动作：`force = −velocity · mass · BRAKE_LINEAR_GAIN`，
     * 角速度用 `BRAKE_ANGULAR_GAIN + BRAKE_ANGULAR_DAMPING` 合并为比例阻尼
     * （两项都沿旋转反方向，故可线性相加）。两者都截到执行器上限。
     * @param observation 纯数据快照。
     * @returns 世界坐标四向力 + 双向力矩 + 技能意图（恒 `null`）。
     */
    decide(observation: IUnitObservation): IUnitAction {
        const mass = observation.attributes[AttributeKind.Mass];
        let fx = -observation.motion.vx * mass * BRAKE_LINEAR_GAIN;
        let fy = -observation.motion.vy * mass * BRAKE_LINEAR_GAIN;

        const magnitude = Math.hypot(fx, fy);
        if (!Number.isFinite(magnitude)) {
            fx = 0;
            fy = 0;
        } else if (magnitude > MAX_FORCE_MAGNITUDE) {
            const scale = MAX_FORCE_MAGNITUDE / magnitude;
            fx *= scale;
            fy *= scale;
        }

        const rawTorque =
            -observation.motion.angularVelocity *
            (BRAKE_ANGULAR_GAIN + BRAKE_ANGULAR_DAMPING);
        const torque = Number.isFinite(rawTorque)
            ? Math.max(
                  -MAX_TORQUE_MAGNITUDE,
                  Math.min(MAX_TORQUE_MAGNITUDE, rawTorque)
              )
            : 0;

        if (
            Math.abs(fx) <= FORCE_EPSILON &&
            Math.abs(fy) <= FORCE_EPSILON &&
            Math.abs(torque) <= FORCE_EPSILON
        ) {
            return ZERO_ACTION;
        }

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
}
