/**
 * 占位指挥官：`class PlaceholderCommander implements ICommander`（D-29）。
 * 确定性、无隐藏状态，只输出 `MoveTo`/`Garrison`/`Hold` 三种指令，
 * 且只读取 `ICommanderContext`（敌方信息仅限可见简讯）。Phase 7 会整体替换它。
 */

import { ArmyOrderKind } from '@/kingdom/types';
import type {
    IArmy,
    IArmyOrder,
    ICommander,
    ICommanderContext,
    IVisibleArmyBrief,
    IVisibleCityBrief
} from '@/kingdom/types';

/**
 * 最小占位指挥官：确定性目标选择，绝不是战术 AI。
 */
export class PlaceholderCommander implements ICommander {
    /** 本势力 id；保留用于 Phase 7 对等性与确定性平局决胜。 */
    private readonly factionId: number;

    /**
     * 构造一个势力的占位指挥官。
     * @param factionId 本势力 id。
     */
    constructor(factionId: number) {
        this.factionId = factionId;
    }

    /**
     * 基于受限视野返回本 tick 的宏观指令：按军队 id 升序，只处理无指令且名册非空的
     * 己方军队；最近可见敌城 → `Garrison`，否则最近可见敌军 → `MoveTo`，否则 `Hold`。
     * 相同上下文永远得到相同结果（距离平局按实体 id 决胜），且从不设置 `afterMinutes`。
     * @param context 指挥官上下文（己方完整视图 + 敌方简讯）。
     * @returns 宏观指令列表。
     */
    decide(context: ICommanderContext): readonly IArmyOrder[] {
        const orders: IArmyOrder[] = [];
        const armies = [...context.armies].sort(
            (first, second) => first.getId() - second.getId()
        );

        for (const army of armies) {
            if (army.getOrder() !== null || army.getUnitIds().length === 0) {
                continue;
            }

            const city = this.nearestCity(context.visibleEnemyCities, army);
            if (city !== null) {
                orders.push({
                    armyId: army.getId(),
                    kind: ArmyOrderKind.Garrison,
                    cityId: city.id
                });
                continue;
            }

            const enemy = this.nearestArmy(context.visibleEnemyArmies, army);
            if (enemy !== null) {
                orders.push({
                    armyId: army.getId(),
                    kind: ArmyOrderKind.MoveTo,
                    targetX: enemy.center.x,
                    targetY: enemy.center.y
                });
                continue;
            }

            orders.push({ armyId: army.getId(), kind: ArmyOrderKind.Hold });
        }

        return orders;
    }

    /**
     * 从可见敌城简讯中选最近的（平方距离，平局取较小 id）。
     * @param cities 可见敌城简讯。
     * @param army 决策军队。
     * @returns 最近敌城或 `null`。
     */
    private nearestCity(
        cities: readonly IVisibleCityBrief[],
        army: IArmy
    ): IVisibleCityBrief | null {
        const center = army.getCenter();
        let nearest: IVisibleCityBrief | null = null;
        let best = Number.POSITIVE_INFINITY;

        for (const city of cities) {
            if (city.factionId === this.factionId) {
                continue;
            }
            const dx = city.position.x - center.x;
            const dy = city.position.y - center.y;
            const distance = dx * dx + dy * dy;
            if (
                Number.isFinite(distance) &&
                (distance < best ||
                    (distance === best &&
                        (nearest === null || city.id < nearest.id)))
            ) {
                best = distance;
                nearest = city;
            }
        }
        return nearest;
    }

    /**
     * 从可见敌军简讯中选最近的（平方距离，平局取较小 id）。
     * @param armies 可见敌军简讯。
     * @param army 决策军队。
     * @returns 最近敌军或 `null`。
     */
    private nearestArmy(
        armies: readonly IVisibleArmyBrief[],
        army: IArmy
    ): IVisibleArmyBrief | null {
        const center = army.getCenter();
        let nearest: IVisibleArmyBrief | null = null;
        let best = Number.POSITIVE_INFINITY;

        for (const candidate of armies) {
            if (candidate.factionId === this.factionId) {
                continue;
            }
            const dx = candidate.center.x - center.x;
            const dy = candidate.center.y - center.y;
            const distance = dx * dx + dy * dy;
            if (
                Number.isFinite(distance) &&
                (distance < best ||
                    (distance === best &&
                        (nearest === null || candidate.id < nearest.id)))
            ) {
                best = distance;
                nearest = candidate;
            }
        }
        return nearest;
    }
}
