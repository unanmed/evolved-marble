/**
 * demo 场景表（D-16/D-22）：默认仍是 Phase 4 未改动的 `DEFAULT_SCENARIO`，
 * 另提供一个仅在 demo 内构造的 `?classes=all` 变体（每军补 1 Hammer + 1 Knight），
 * 用于目视验证全部 6 武器 + 2 防具。
 * 本文件只含数据与一个查询解析函数，不修改 Phase 4 的场景表，也不读 URL 上的任何其他参数。
 */

import { DEFAULT_SCENARIO } from '@/kingdom/scenario';
import type { IScenario } from '@/kingdom/types';
import { ClassKind } from '@/units/types';

/** demo 默认场景：与 Phase 4 的 `DEFAULT_SCENARIO` **完全同一对象**，不做任何改动（D-16）。 */
export const DEMO_DEFAULT_SCENARIO: IScenario = DEFAULT_SCENARIO;

/**
 * 全职业场景（D-22）：展开默认场景，并为每支军队的 `units` 追加 1 个 Hammer 与 1 个 Knight。
 * 每一层都是新对象/新数组，源场景表与 `DEFAULT_SCENARIO` 不被修改。
 */
export const DEMO_ALL_CLASSES_SCENARIO: IScenario = {
    ...DEFAULT_SCENARIO,
    armies: DEFAULT_SCENARIO.armies.map(army => ({
        ...army,
        units: [
            ...army.units,
            { classKind: ClassKind.Hammer, count: 1 },
            { classKind: ClassKind.Knight, count: 1 }
        ]
    }))
};

/**
 * 按查询串选择 demo 场景（D-22/T-05-41）。
 * 只有字面量 `classes=all` 会选中变体；其余参数一律忽略，绝不从 URL 读取任何数值配置。
 * @param search 查询串（可带或不带前导 `?`）。
 * @returns `classes=all` 时为全职业变体，否则为默认场景。
 */
export function selectDemoScenario(search: string): IScenario {
    const params = new URLSearchParams(search);
    return params.get('classes') === 'all'
        ? DEMO_ALL_CLASSES_SCENARIO
        : DEMO_DEFAULT_SCENARIO;
}
