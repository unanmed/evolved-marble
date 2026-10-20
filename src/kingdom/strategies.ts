/**
 * 生产默认策略：等级权重、25% 入驻选择器与占位指挥官工厂。
 * 这里是 `IKingdomConfig` 的生产实现，也是 Phase 7 唯一需要整体替换的入口。
 */

import { DEFAULT_GARRISON_RATIO } from '@/kingdom/constants';
import { PlaceholderCommander } from '@/kingdom/Commander';
import { AttributeKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import type {
    GarrisonSelector,
    ICommander,
    IKingdomConfig,
    UnitWeight
} from '@/kingdom/types';

/**
 * 冻结的 `GarrisonSelector` 只接收 `IUnit` 却要求返回单位 id。为了让默认选择器
 * 能在不扩展 `IUnit` 的前提下给出真实 id，World 在注册单位时把 `IUnit → unitId`
 * 记录到这个 WeakMap；未登记的单位会被默认选择器安全跳过（绝不自造 id）。
 */
const unitIds = new WeakMap<IUnit, number>();

/**
 * 记录 World 分配的单位 id（默认入驻选择器的唯一身份来源）。
 * @param unit 单位实例。
 * @param unitId World 分配的单位 id。
 */
export function rememberUnitIdentity(unit: IUnit, unitId: number): void {
    unitIds.set(unit, unitId);
}

/**
 * 默认战斗区权重：单位等级（D-18）。
 * @param unit 单位。
 * @returns 等级。
 */
export const defaultUnitWeight: UnitWeight = unit =>
    unit.getAttribute(AttributeKind.Level);

/**
 * 默认入驻选择器（D-22）：空候选返回空数组；否则按候选顺序取
 * `min(候选数, max(1, floor(候选数 × 25%)), 城池驻军上限)` 个已登记的单位 id。
 * 未在 World 登记过的候选会被跳过，因此结果永远只能是真实候选。
 * @param city 被攻占的城池（提供驻军上限）。
 * @param candidates 存活候选单位。
 * @returns 入驻单位 id 列表。
 */
export const defaultGarrisonSelector: GarrisonSelector = (city, candidates) => {
    if (candidates.length === 0) {
        return [];
    }
    const cap = city.getGarrisonCap();
    if (!Number.isFinite(cap) || cap <= 0) {
        return [];
    }

    const limit = Math.min(
        candidates.length,
        Math.max(1, Math.floor(candidates.length * DEFAULT_GARRISON_RATIO)),
        cap
    );
    const selected: number[] = [];
    for (const candidate of candidates) {
        const unitId = unitIds.get(candidate);
        if (unitId === undefined) {
            continue;
        }
        selected.push(unitId);
        if (selected.length >= limit) {
            break;
        }
    }
    return selected;
};

/**
 * 生产 `IKingdomConfig`：等级权重、25% 入驻（至少 1、受城池上限约束）与占位指挥官。
 * @param commanderFactory 每势力指挥官工厂；默认 `PlaceholderCommander`。
 * @returns 完整配置。
 */
export function createDefaultKingdomConfig(
    commanderFactory: (factionId: number) => ICommander = factionId =>
        new PlaceholderCommander(factionId)
): IKingdomConfig {
    return {
        unitWeight: defaultUnitWeight,
        garrisonSelector: defaultGarrisonSelector,
        commanderFactory
    };
}
