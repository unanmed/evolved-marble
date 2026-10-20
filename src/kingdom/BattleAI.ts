/**
 * 战斗 AI：`class BattleAI implements IUnitAI`（D-11/D-14）。
 * 把快照中的敌人过滤到本单位所在战斗的正方形内，再交给内层基线 AI（默认 `DefaultUnitAI`）。
 * 射线距离保持不过滤——地形/友方遮挡仍然有效；AI 自身不保存模式或战斗状态。
 */

import { DefaultUnitAI } from '@/control/DefaultUnitAI';
import type { IUnitAction, IUnitAI, IUnitObservation } from '@/control/types';
import { ZERO_ACTION } from '@/kingdom/constants';
import type { IBattle } from '@/kingdom/types';

/**
 * 战斗 AI：只对同一战斗区内的敌人决策。
 */
export class BattleAI implements IUnitAI {
    /** 本 AI 所属单位 id。 */
    private readonly unitId: number;
    /** 读取本单位当前活跃战斗的闭包；不在战斗时返回 `null`。 */
    private readonly battleOf: (unitId: number) => IBattle | null;
    /** 内层基线 AI（默认复用 Phase 3 的 `DefaultUnitAI`）。 */
    private readonly inner: IUnitAI;

    /**
     * 构造战斗 AI。
     * @param unitId 本 AI 所属单位 id。
     * @param battleOf 返回本单位当前活跃战斗的闭包。
     * @param inner 内层基线 AI，默认 `DefaultUnitAI`。
     */
    constructor(
        unitId: number,
        battleOf: (unitId: number) => IBattle | null,
        inner: IUnitAI = new DefaultUnitAI()
    ) {
        this.unitId = unitId;
        this.battleOf = battleOf;
        this.inner = inner;
    }

    /**
     * 基于快照选择动作：把敌人过滤到本战斗区后委托内层 AI。
     * 不在战斗时返回全零动作。
     * @param observation 纯数据快照。
     * @returns 内层 AI 的动作或全零动作。
     */
    decide(observation: IUnitObservation): IUnitAction {
        const battle = this.battleOf(this.unitId);
        if (battle === null) {
            return ZERO_ACTION;
        }

        const center = battle.getCenter();
        const halfExtent = battle.getHalfExtent();
        const enemies = observation.enemies.filter(
            enemy =>
                Math.abs(enemy.x - center.x) <= halfExtent &&
                Math.abs(enemy.y - center.y) <= halfExtent
        );

        return this.inner.decide({ ...observation, enemies });
    }
}
