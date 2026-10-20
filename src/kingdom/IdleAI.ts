/**
 * 驻扎待命 AI：`class IdleAI implements IUnitAI`（D-11/D-14）。
 * 恒返回全零动作：零力不唤醒睡眠刚体，驻扎中的单位保持静止并可由物理层休眠
 * （research Pitfall 3）。
 */

import type { IUnitAction, IUnitAI, IUnitObservation } from '@/control/types';
import { ZERO_ACTION } from '@/kingdom/constants';

/**
 * 待命 AI：不做任何决策，只输出零动作。
 */
export class IdleAI implements IUnitAI {
    /**
     * 恒返回全零动作，不读取快照中的任何量。
     * @param _observation 纯数据快照（未使用）。
     * @returns 全零动作。
     */
    decide(_observation: IUnitObservation): IUnitAction {
        return ZERO_ACTION;
    }
}
