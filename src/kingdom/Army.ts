/**
 * 军队模型：`class Army implements IMutableArmy`（D-01/D-12），外加两个纯函数
 * `computeFormationSlots` 与 `advanceArmyCenter`。
 * 军队只承载宏观状态（中心、朝向、名册、状态、指令），没有刚体，也不参与战斗成员判定——
 * 战斗成员是单位 id 集合（D-02）。
 */

import {
    ARMY_SPEED_METERS_PER_HOUR,
    MINUTES_PER_HOUR
} from '@/kingdom/constants';
import { ArmyState } from '@/kingdom/types';
import type { IArmyOrder, IMutableArmy, IVec2 } from '@/kingdom/types';

/**
 * 计算一次行军的阵型槽位（D-12/KING-03）：确定性均匀圆盘。
 * 第 `i` 个（共 `n` 个）槽位位于半径 `radius · sqrt((i + 0.5) / n)`、
 * 角度 `heading + 2π·i/n`，因此槽位严格位于半径圆内、互不重合，也不会塌缩到圆心；
 * 同一输入永远得到同一结果（不随机、不读时钟）。
 * @param centerX 军队中心 x 坐标（米）。
 * @param centerY 军队中心 y 坐标（米）。
 * @param heading 军队朝向角（弧度；0 = +x，正值朝 +y 旋转，即屏幕坐标下顺时针）。
 * @param unitIds 名册单位 id（顺序决定槽位顺序）。
 * @param radius 圆盘半径（米）。
 * @returns unitId → 槽位坐标的映射；无名册单位时为空映射。
 */
export function computeFormationSlots(
    centerX: number,
    centerY: number,
    heading: number,
    unitIds: readonly number[],
    radius: number
): Map<number, IVec2> {
    const slots = new Map<number, IVec2>();
    const count = unitIds.length;
    if (count === 0) {
        return slots;
    }

    const step = (Math.PI * 2) / count;
    for (let index = 0; index < count; index += 1) {
        const slotRadius = radius * Math.sqrt((index + 0.5) / count);
        const angle = heading + step * index;
        slots.set(unitIds[index], {
            x: centerX + Math.cos(angle) * slotRadius,
            y: centerY + Math.sin(angle) * slotRadius
        });
    }
    return slots;
}

/**
 * 推进军队中心一个游戏时段（D-12/KING-01）：以 10 m/h 的固定速度向目标移动，
 * 越界时钳制并在被越界的轴上反射行进方向，随后沿反射后的方向继续前进。
 *
 * 朝向约定：弧度，`0` = +x，正值朝 +y 旋转（世界 y 向下，所以在屏幕上是顺时针）。
 * 返回值中的 `heading` **等于本时段实际的行进方向**（反射之后），
 * 因此全景箭头总能指向军队真正走的方向；未移动时保持输入朝向。
 *
 * 规则：
 * - `targetX`/`targetY` 为 `null`（或任一侧缺失）表示 `Hold`：中心与朝向都不变。
 * - 每个轴的方向独立决定：默认取「中心 → 目标」的单位向量分量；
 *   但若目标在该轴上**位于地图外**，该轴方向改取当前朝向的对应分量
 *   （`cos(heading)` / `sin(heading)`）。这正是「反射后能沿新朝向走回地图内」的关键。
 * - 位置钳制到 `[0, width] × [0, height]`；发生钳制时在被钳制的轴上翻转**行进方向**分量
 *   （水平钳制取反 x 分量、垂直钳制取反 y 分量），使军队只反弹一次。
 * - 任一输入非有限时原样返回输入（不产生 NaN）；函数从不修改参数。
 * @param centerX 当前中心 x 坐标（米）。
 * @param centerY 当前中心 y 坐标（米）。
 * @param heading 当前朝向角（弧度；0 = +x，正值朝 +y）。
 * @param targetX 目标 x 坐标（米）；`null` 表示无目标。
 * @param targetY 目标 y 坐标（米）；`null` 表示无目标。
 * @param gameMinutes 本时段推进的游戏分钟数。
 * @param width 地图宽度（米）。
 * @param height 地图高度（米）。
 * @returns 新的中心坐标与实际行进朝向（新对象，永不修改参数）。
 */
export function advanceArmyCenter(
    centerX: number,
    centerY: number,
    heading: number,
    targetX: number | null,
    targetY: number | null,
    gameMinutes: number,
    width: number,
    height: number
): { x: number; y: number; heading: number } {
    const unchanged = { x: centerX, y: centerY, heading };
    const inputs = [centerX, centerY, heading, gameMinutes, width, height];
    for (const value of inputs) {
        if (!Number.isFinite(value)) {
            return unchanged;
        }
    }
    if (targetX === null || targetY === null) {
        return unchanged;
    }
    if (!Number.isFinite(targetX) || !Number.isFinite(targetY)) {
        return unchanged;
    }
    if (!(gameMinutes > 0) || !(width > 0) || !(height > 0)) {
        return unchanged;
    }

    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const distance = Math.hypot(dx, dy);
    if (!Number.isFinite(distance) || distance === 0) {
        return unchanged;
    }

    const targetOutsideX = targetX < 0 || targetX > width;
    const targetOutsideY = targetY < 0 || targetY > height;
    const dirX = targetOutsideX ? Math.cos(heading) : dx / distance;
    const dirY = targetOutsideY ? Math.sin(heading) : dy / distance;

    const step = (ARMY_SPEED_METERS_PER_HOUR * gameMinutes) / MINUTES_PER_HOUR;
    const rawX = centerX + dirX * step;
    const rawY = centerY + dirY * step;

    const clampedX = Math.min(Math.max(rawX, 0), width);
    const clampedY = Math.min(Math.max(rawY, 0), height);
    const clampOnX = clampedX !== rawX;
    const clampOnY = clampedY !== rawY;

    // 实际行进方向：反射后仍是「下一步往哪走」，与尚未发生位移的单轴情况一致。
    const travelX = clampOnX ? -dirX : dirX;
    const travelY = clampOnY ? -dirY : dirY;
    if (travelX === 0 && travelY === 0) {
        // 方向退化（目标轴外且朝向分量为 0）：无从推断行进方向，保留旧朝向。
        return { x: clampedX, y: clampedY, heading };
    }

    return {
        x: clampedX,
        y: clampedY,
        heading: Math.atan2(travelY, travelX)
    };
}

/**
 * 军队：宏观容器，只持有状态与名册，不持有刚体或单位引用。
 *
 * `getEngagedBattleId()` 经注入的闭包读取：冻结的 `IMutableArmy` 没有对应 setter，
 * 而 army → battle 映射由 `KingdomWorld` 拥有，闭包让契约无需任何改动。
 */
export class Army implements IMutableArmy {
    /** 军队 id（跨战斗持久，D-05）。 */
    private readonly id: number;
    /** 所属势力 id。 */
    private readonly factionId: number;
    /** 中心位置的 x 坐标（米）。 */
    private x: number;
    /** 中心位置的 y 坐标（米）。 */
    private y: number;
    /** 朝向角（弧度；0 = +x，正值朝 +y，即屏幕坐标下顺时针；行军中等于实际行进方向）。 */
    private heading: number;
    /** 宏观状态。 */
    private state = ArmyState.Marching;
    /** 当前单位 id 名册。 */
    private unitIds: number[] = [];
    /** 驻扎城池 id；未驻扎为 `undefined`。 */
    private garrisonedCityId: number | undefined;
    /** 当前宏观指令；无指令为 `null`。 */
    private order: IArmyOrder | null = null;
    /** 正在增援的活跃战场 id 的只读来源（由 World 拥有映射）。 */
    private readonly engagedBattleOf: () => number | undefined;

    /**
     * 构造一支军队。
     * @param id 军队 id。
     * @param factionId 所属势力 id。
     * @param centerX 初始中心 x 坐标（米）。
     * @param centerY 初始中心 y 坐标（米）。
     * @param heading 初始朝向角（弧度）。
     * @param engagedBattleOf 返回当前增援战场 id 的闭包（无则 `undefined`）。
     */
    constructor(
        id: number,
        factionId: number,
        centerX: number,
        centerY: number,
        heading: number,
        engagedBattleOf: () => number | undefined
    ) {
        this.id = id;
        this.factionId = factionId;
        this.x = centerX;
        this.y = centerY;
        this.heading = heading;
        this.engagedBattleOf = engagedBattleOf;
    }

    /**
     * 军队 id。
     * @returns 军队 id。
     */
    getId(): number {
        return this.id;
    }

    /**
     * 所属势力 id。
     * @returns 势力 id。
     */
    getFactionId(): number {
        return this.factionId;
    }

    /**
     * 军队中心位置（新对象）。
     * @returns 中心坐标。
     */
    getCenter(): IVec2 {
        return { x: this.x, y: this.y };
    }

    /**
     * 朝向角（弧度）：0 = +x、正值朝 +y（屏幕顺时针）；
     * 行军中由 `advanceArmyCenter` 写为实际行进方向。
     * @returns 朝向。
     */
    getHeading(): number {
        return this.heading;
    }

    /**
     * 宏观状态。
     * @returns 状态枚举。
     */
    getState(): ArmyState {
        return this.state;
    }

    /**
     * 当前名册的只读快照（新数组）。
     * @returns 单位 id 列表。
     */
    getUnitIds(): readonly number[] {
        return [...this.unitIds];
    }

    /**
     * 驻扎城池 id；未驻扎为 `undefined`。
     * @returns 城池 id 或 `undefined`。
     */
    getGarrisonedCityId(): number | undefined {
        return this.garrisonedCityId;
    }

    /**
     * 正在增援的活跃战场 id；没有单位为战斗成员时为 `undefined`。
     * @returns 战场 id 或 `undefined`。
     */
    getEngagedBattleId(): number | undefined {
        return this.engagedBattleOf();
    }

    /**
     * 当前宏观指令；无指令为 `null`。
     * @returns 指令或 `null`。
     */
    getOrder(): IArmyOrder | null {
        return this.order;
    }

    /**
     * 覆盖军队中心位置。
     * @param x 新的中心 x 坐标（米）。
     * @param y 新的中心 y 坐标（米）。
     */
    setCenter(x: number, y: number): void {
        this.x = x;
        this.y = y;
    }

    /**
     * 覆盖朝向角（弧度）。
     * @param heading 新的朝向。
     */
    setHeading(heading: number): void {
        this.heading = heading;
    }

    /**
     * 覆盖宏观状态。
     * @param state 新状态。
     */
    setState(state: ArmyState): void {
        this.state = state;
    }

    /**
     * 覆盖名册（保存副本）。
     * @param unitIds 新的单位 id 列表。
     */
    setUnitIds(unitIds: readonly number[]): void {
        this.unitIds = [...unitIds];
    }

    /**
     * 覆盖驻扎城池 id；`undefined` 表示不再驻扎。
     * @param cityId 城池 id 或 `undefined`。
     */
    setGarrisonedCityId(cityId: number | undefined): void {
        this.garrisonedCityId = cityId;
    }

    /**
     * 覆盖当前宏观指令；`null` 表示无指令。
     * @param order 指令或 `null`。
     */
    setOrder(order: IArmyOrder | null): void {
        this.order = order;
    }
}
