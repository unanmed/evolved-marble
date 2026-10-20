/**
 * 城池模型：`class City implements IMutableCity`（D-23/D-26/KING-05）。
 * 城池只是地图上的一个点：没有碰撞体、没有射线几何，本身不影响战斗（research Pitfall 19）。
 * 驻扎是**军队的状态**，城池只持有驻军军队 id；训练进度按累计游戏分钟计，
 * 实际训练/回血行为由 plan 04-04 实现。
 */

import type { IMutableCity, IVec2 } from '@/kingdom/types';
import type { CityKind } from '@/kingdom/types';
import type { ClassKind } from '@/units/types';

/**
 * 城池：归属、点位置、规模、驻军链接、驻军上限、训练职业与训练进度。
 */
export class City implements IMutableCity {
    /** 城池 id。 */
    private readonly id: number;
    /** 归属势力 id；无主城池为 `undefined`。 */
    private factionId: number | undefined;
    /** 城池点位置的 x 坐标（米）。 */
    private readonly x: number;
    /** 城池点位置的 y 坐标（米）。 */
    private readonly y: number;
    /** 城池规模。 */
    private readonly kind: CityKind;
    /** 当前驻扎军队 id；无驻军为 `undefined`。 */
    private garrisonArmyId: number | undefined;
    /** 驻军上限（单位数）。 */
    private readonly garrisonCap: number;
    /** 训练产出的单位职业。 */
    private readonly trainingClass: ClassKind;
    /** 当前训练进度（累计游戏分钟）。 */
    private trainingProgressMinutes = 0;

    /**
     * 构造一座城池。
     * @param id 城池 id。
     * @param factionId 归属势力 id；无主为 `undefined`。
     * @param x 城池点 x 坐标（米）。
     * @param y 城池点 y 坐标（米）。
     * @param kind 城池规模。
     * @param garrisonCap 驻军上限（单位数）。
     * @param trainingClass 训练产出的单位职业。
     */
    constructor(
        id: number,
        factionId: number | undefined,
        x: number,
        y: number,
        kind: CityKind,
        garrisonCap: number,
        trainingClass: ClassKind
    ) {
        this.id = id;
        this.factionId = factionId;
        this.x = x;
        this.y = y;
        this.kind = kind;
        this.garrisonCap = garrisonCap;
        this.trainingClass = trainingClass;
    }

    /**
     * 城池 id。
     * @returns 城池 id。
     */
    getId(): number {
        return this.id;
    }

    /**
     * 归属势力 id；无主城池为 `undefined`（缺失字面量，AGENTS §8）。
     * @returns 势力 id 或 `undefined`。
     */
    getFactionId(): number | undefined {
        return this.factionId;
    }

    /**
     * 城池点位置（新对象，不泄漏内部状态）。
     * @returns 城池点坐标。
     */
    getPosition(): IVec2 {
        return { x: this.x, y: this.y };
    }

    /**
     * 城池规模。
     * @returns 规模枚举。
     */
    getKind(): CityKind {
        return this.kind;
    }

    /**
     * 当前驻扎军队 id；无驻军为 `undefined`（缺失字面量，AGENTS §8）。
     * @returns 军队 id 或 `undefined`。
     */
    getGarrisonArmyId(): number | undefined {
        return this.garrisonArmyId;
    }

    /**
     * 驻军上限（单位数）。
     * @returns 上限。
     */
    getGarrisonCap(): number {
        return this.garrisonCap;
    }

    /**
     * 训练产出的单位职业。
     * @returns 单位职业。
     */
    getTrainingClass(): ClassKind {
        return this.trainingClass;
    }

    /**
     * 当前训练进度（累计游戏分钟）。
     * @returns 训练进度。
     */
    getTrainingProgressMinutes(): number {
        return this.trainingProgressMinutes;
    }

    /**
     * 覆盖城池归属；`undefined` 表示无主。
     * @param factionId 新的归属势力 id。
     */
    setFactionId(factionId: number | undefined): void {
        this.factionId = factionId;
    }

    /**
     * 覆盖驻军军队 id；`undefined` 表示无驻军。
     * @param armyId 新的驻扎军队 id。
     */
    setGarrisonArmyId(armyId: number | undefined): void {
        this.garrisonArmyId = armyId;
    }

    /**
     * 覆盖训练进度（累计游戏分钟）。
     * @param minutes 新的训练进度。
     */
    setTrainingProgressMinutes(minutes: number): void {
        this.trainingProgressMinutes = minutes;
    }
}
