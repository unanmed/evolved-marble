/**
 * 渲染层的纯逐帧投影：阵营色解析、单位视觉/视图规格快照、参战点位提取、
 * 战斗权重汇总与视口裁剪。
 * 本文件无 Pixi、无 Rapier、无类、无模块状态，只把冻结的上游契约读成
 * `@/render/types` 的词表，使渲染器不再包含“长什么样 / 是否在画面内”的分支
 * （D-01/D-04/D-14）。所有函数都只读入参，绝不修改单位或战斗对象。
 */

import { FALLBACK_FACTION_COLORS } from '@/render/constants';
import type {
    ICullQuery,
    IUnitViewSpec,
    IUnitVisualSpec,
    UnitStateLookup
} from '@/render/types';
import type { IBattle, IVec2 } from '@/kingdom/types';
import { AttributeKind, EquipmentKind } from '@/units/types';
import type { ArmorKind, IUnit, WeaponKind } from '@/units/types';

/**
 * 判断一个值是否是合法的 24 位颜色（0xRRGGBB 整数）。
 * @param value 待校验的值；缺失时为 `undefined`。
 * @returns 是合法颜色时为 `true`。
 */
function isColor(value: number | undefined): value is number {
    return (
        value !== undefined &&
        Number.isInteger(value) &&
        value >= 0 &&
        value <= 0xffffff
    );
}

/**
 * 把势力 id 解析为一个总定义的阵营色（D-04/D-05）。
 * 配置表命中且值合法时返回配置色；id 有限但未配置时按
 * `|trunc(id)| % fallbackColors.length` 确定性回退；id 缺失/非有限、
 * 配置值畸形或回退表为空时返回 `neutralColor`。永远不会返回 `undefined`。
 * @param factionId 势力 id；缺失时为 `undefined`（缺失字面量）。
 * @param factionColors 势力 id → 颜色（0xRRGGBB）的配置表。
 * @param neutralColor 中立/回退颜色（0xRRGGBB）。
 * @param fallbackColors 未配置势力的回退色表，默认为 `FALLBACK_FACTION_COLORS`。
 * @returns 合法的 24 位有限颜色。
 */
export function resolveFactionColor(
    factionId: number | undefined,
    factionColors: Readonly<Record<number, number>>,
    neutralColor: number,
    fallbackColors: readonly number[] = FALLBACK_FACTION_COLORS
): number {
    if (factionId === undefined || !Number.isFinite(factionId)) {
        return neutralColor;
    }

    const key = Math.trunc(factionId);
    if (Object.prototype.hasOwnProperty.call(factionColors, key)) {
        const configured: number | undefined = factionColors[key];
        return isColor(configured) ? configured : neutralColor;
    }

    if (fallbackColors.length === 0) {
        return neutralColor;
    }
    const fallback: number | undefined =
        fallbackColors[Math.abs(key) % fallbackColors.length];
    return isColor(fallback) ? fallback : neutralColor;
}

/**
 * 把真实单位投影为不可变的视觉身份（D-04/G-6）。
 * 只遍历一次装备：第一件有定义的武器成为 `weapon`，全部有定义的防具按遭遇顺序
 * 追加到 `armors`；`classKind` 仅作数据保留，不参与造型选择。
 * @param unit 单位实例（只读）。
 * @param factionColor 已解析的阵营色（0xRRGGBB）。
 * @returns 冻结契约的 `IUnitVisualSpec`。
 */
export function resolveUnitVisualSpec(
    unit: IUnit,
    factionColor: number
): IUnitVisualSpec {
    let weapon: WeaponKind | undefined;
    const armors: ArmorKind[] = [];

    for (const entry of unit.getEquipment()) {
        if (entry.kind === EquipmentKind.Weapon) {
            if (weapon === undefined && entry.weapon !== undefined) {
                weapon = entry.weapon;
            }
            continue;
        }
        if (entry.kind === EquipmentKind.Armor && entry.armor !== undefined) {
            armors.push(entry.armor);
        }
    }

    return { factionColor, classKind: unit.getClass(), weapon, armors };
}

/**
 * 把单位投影为创建视图所需的快照（D-03）：调用方在单位首次出现时调用一次。
 * @param unitId 单位 id。
 * @param unit 单位实例（只读）。
 * @param factionColor 已解析的阵营色（0xRRGGBB）。
 * @returns 冻结契约的 `IUnitViewSpec`。
 */
export function resolveUnitViewSpec(
    unitId: number,
    unit: IUnit,
    factionColor: number
): IUnitViewSpec {
    return { unitId, visual: resolveUnitVisualSpec(unit, factionColor) };
}

/**
 * 提取相机拟合所需的参战单位位置（D-14/D-21）。
 * 按 `getMemberUnitIds()` 的顺序读取运动读数：缺失（`null`）或坐标非有限的成员
 * 被跳过；全部无效时返回空数组（合法的全景拟合输入，绝不除零）。
 * @param battle 目标战斗（只读）。
 * @param getUnitState 窄运动读数查询。
 * @returns 存活成员的世界坐标点位（保持成员顺序）。
 */
export function resolveTargetPoints(
    battle: IBattle,
    getUnitState: UnitStateLookup
): readonly IVec2[] {
    const points: IVec2[] = [];

    for (const unitId of battle.getMemberUnitIds()) {
        const state = getUnitState(unitId);
        if (state === null) {
            continue;
        }
        if (!Number.isFinite(state.x) || !Number.isFinite(state.y)) {
            continue;
        }
        points.push({ x: state.x, y: state.y });
    }

    return points;
}

/**
 * 汇总一场战斗的权重 W：存活成员等级之和（REND-04）。
 * 缺失（`null`）、已死亡、等级非有限或为负的成员被跳过；
 * 一个可用成员都没有时返回 0（合法的“无权重”输入，绝不产生 NaN）。
 * 纯函数：只读战斗与单位目录，不缓存，重复调用同输入同输出。
 * @param battle 目标战斗（只读）。
 * @param getUnit 单位查询；不存在时返回 `null`（缺失对象 → `null`）。
 * @returns 存活成员等级之和，非负有限。
 */
export function resolveBattleWeight(
    battle: IBattle,
    getUnit: (unitId: number) => IUnit | null
): number {
    let weight = 0;

    for (const unitId of battle.getMemberUnitIds()) {
        const unit = getUnit(unitId);
        if (unit === null || !unit.isAlive()) {
            continue;
        }
        const level = unit.getAttribute(AttributeKind.Level);
        if (!Number.isFinite(level) || level < 0) {
            continue;
        }
        weight += level;
    }

    return weight;
}

/**
 * 基础视口裁剪判定（D-01）：视口内、外扩 `marginMeters` 内以及边界值均可见。
 * 任何非有限输入、非正缩放或非正视口尺寸一律判为不可见（返回 `false`），
 * 使退化帧隐藏整棵子树而不是把 NaN 变换写进 Pixi；负边距按 0 处理。
 * @param query 待测点、镜头变换、视口与边距。
 * @returns 该点是否可能出现在画面中。
 */
export function isUnitVisible(query: ICullQuery): boolean {
    const { x, y, transform, viewport } = query;

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y) ||
        !Number.isFinite(query.marginMeters) ||
        !Number.isFinite(transform.scale) ||
        !Number.isFinite(transform.centerX) ||
        !Number.isFinite(transform.centerY) ||
        !Number.isFinite(viewport.width) ||
        !Number.isFinite(viewport.height)
    ) {
        return false;
    }
    if (transform.scale <= 0 || viewport.width <= 0 || viewport.height <= 0) {
        return false;
    }

    const margin = query.marginMeters < 0 ? 0 : query.marginMeters;
    const halfW = viewport.width / (2 * transform.scale) + margin;
    const halfH = viewport.height / (2 * transform.scale) + margin;

    return (
        Math.abs(x - transform.centerX) <= halfW &&
        Math.abs(y - transform.centerY) <= halfH
    );
}
