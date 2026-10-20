/**
 * 时间系统：`class TimeSystem implements ITimeSystem`（D-07/D-08/D-09）。
 * 只以**游戏分钟**计时，不存在 wall-clock 或帧时间（research Pitfall 18）：
 * 本文件不引用 `performance`、`Date` 或任何渲染时钟，时间只由 `IWorld` 推进。
 *
 * 速率用普通数字表达（每外层 tick 的游戏分钟数），没有倍率枚举（G-6）：
 * 战斗进行中为 `BATTLE_TICK_MINUTES = 1`，否则为 `PEACE_TICK_MINUTES = 24`。
 * 新建世界的起点是无战斗状态，故初始速率为 24。
 */

import { PEACE_TICK_MINUTES } from '@/kingdom/constants';
import type { ITimeSystem } from '@/kingdom/types';

/**
 * 时间系统：累计游戏分钟、外层 tick 序号与每个 tick 的分钟数/子步数。
 */
export class TimeSystem implements ITimeSystem {
    /** 自开局累计的游戏分钟；只经 `advance` 增长。 */
    private gameMinutes = 0;
    /** 外层 tick 序号；只经 `advanceTick` 递增（C-17）。 */
    private tickIndex = 0;
    /** 当前每个外层 tick 覆盖的游戏分钟数（1 = 战斗，24 = 和平）。 */
    private minutesPerTick = PEACE_TICK_MINUTES;

    /**
     * 自开局累计的游戏分钟。
     * @returns 游戏分钟数。
     */
    getGameMinutes(): number {
        return this.gameMinutes;
    }

    /**
     * 当前每个外层 tick 覆盖的游戏分钟数：战斗进行中为 1，否则为 24。
     * @returns 每个 tick 的游戏分钟数。
     */
    getMinutesPerTick(): number {
        return this.minutesPerTick;
    }

    /**
     * 外层 tick 序号：每次 `advanceTick` 恰好加一，与子步数无关。
     * @returns 已结束的外层 tick 数。
     */
    getTickIndex(): number {
        return this.tickIndex;
    }

    /**
     * 当前每个外层 tick 的物理子步数：显式镜像「1 子步 = 1 游戏分钟」的映射，
     * 因此返回当前分钟数（四舍五入并至少为 1），可独立校准（D-10）。
     * @returns 子步数（1 或 24）。
     */
    getSubstepsPerTick(): number {
        const rounded = Math.round(this.minutesPerTick);
        return Number.isFinite(rounded) && rounded >= 1 ? rounded : 1;
    }

    /**
     * 推进游戏分钟。非有限或非正输入被忽略（保持状态不产生 NaN）。
     * 仅由 `IWorld` 调用。
     * @param gameMinutes 要推进的游戏分钟数。
     */
    advance(gameMinutes: number): void {
        if (!Number.isFinite(gameMinutes) || gameMinutes <= 0) {
            return;
        }
        this.gameMinutes += gameMinutes;
    }

    /**
     * 结束一个外层 tick：序号恰好加一。仅由 `IWorld` 调用。
     */
    advanceTick(): void {
        this.tickIndex += 1;
    }

    /**
     * 设置每个外层 tick 的游戏分钟数（内置值 1 / 24）。非有限或非正输入被忽略。
     * 仅由 `IWorld` 调用；最后一个决策生效（World 在子步循环后重新决策）。
     * @param minutes 新的每 tick 分钟数。
     */
    setMinutesPerTick(minutes: number): void {
        if (!Number.isFinite(minutes) || minutes <= 0) {
            return;
        }
        this.minutesPerTick = minutes;
    }
}
