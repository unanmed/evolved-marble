/**
 * 固定步长逻辑时钟的公开契约（D-13：先接口后类）。
 */
export interface ITickClock {
    /** 固定步长（秒）。 */
    readonly dt: number;
    /** 当前步计数（单调递增，从 0 起）。 */
    readonly tick: number;
    /** 时间前进的唯一途径：步计数加一。 */
    step(): void;
    /** 恢复步计数（快照反序列化专用，SIM-04）。 */
    restore(tick: number): void;
}

/**
 * 固定步长逻辑时钟（SIM-01 / D-01）。
 *
 * 时间是一个单调递增的**步计数（tick）**，绝不读取墙上时钟。
 * `step()` 是时间前进的唯一途径；`dt` 为固定步长（秒）。
 */
export class TickClock implements ITickClock {
    /** 当前步计数（私有；只经 `tick` 访问器读出）。 */
    private tickCount = 0;

    /**
     * @param dt 固定步长（秒）。
     */
    constructor(readonly dt: number) {}

    /** 当前步计数。 */
    get tick(): number {
        return this.tickCount;
    }

    /** 时间前进的唯一途径：步计数加一。 */
    step(): void {
        this.tickCount++;
    }

    /**
     * 恢复步计数（快照反序列化专用，SIM-04）。
     *
     * 语义：把时钟设回某一 tick。这是 `step()` 之外**唯一**改变步数的入口，
     * 且只由 `deserializeState()` 调用——正常运行期绝不使用。
     *
     * @param tick 要恢复到的步计数。
     */
    restore(tick: number): void {
        this.tickCount = tick;
    }
}
