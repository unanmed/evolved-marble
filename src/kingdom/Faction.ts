/**
 * 势力模型：`class Faction implements IMutableFaction`（KING-08）。
 * 势力只持有 id、显示名与军队/城池 id 列表；单位阵营由 `KingdomWorld`
 * 在 `control.registerUnit({ teamId: factionId })` 时注入，绝不写回 `IUnit`。
 */

import type { IMutableFaction } from '@/kingdom/types';

/**
 * 势力：拥有军队与城池，其 id 同时是 Phase 3 的注册 `teamId`。
 */
export class Faction implements IMutableFaction {
    /** 势力 id。 */
    private readonly id: number;
    /** 显示名。 */
    private readonly name: string;
    /** 当前军队 id 列表。 */
    private armyIds: number[] = [];
    /** 当前城池 id 列表。 */
    private cityIds: number[] = [];

    /**
     * 构造一个势力。
     * @param id 势力 id（同时作为注册 `teamId`）。
     * @param name 显示名。
     */
    constructor(id: number, name: string) {
        this.id = id;
        this.name = name;
    }

    /**
     * 势力 id。
     * @returns 势力 id。
     */
    getId(): number {
        return this.id;
    }

    /**
     * 显示名。
     * @returns 显示名。
     */
    getName(): string {
        return this.name;
    }

    /**
     * 当前军队 id 的只读快照（新数组，不是内部集合）。
     * @returns 军队 id 列表。
     */
    getArmyIds(): readonly number[] {
        return [...this.armyIds];
    }

    /**
     * 当前城池 id 的只读快照（新数组，不是内部集合）。
     * @returns 城池 id 列表。
     */
    getCityIds(): readonly number[] {
        return [...this.cityIds];
    }

    /**
     * 覆盖军队 id 列表（保存副本，调用方后续修改不影响势力）。
     * @param armyIds 新的军队 id 列表。
     */
    setArmyIds(armyIds: readonly number[]): void {
        this.armyIds = [...armyIds];
    }

    /**
     * 覆盖城池 id 列表（保存副本，调用方后续修改不影响势力）。
     * @param cityIds 新的城池 id 列表。
     */
    setCityIds(cityIds: readonly number[]): void {
        this.cityIds = [...cityIds];
    }
}
