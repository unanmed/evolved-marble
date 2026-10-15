/**
 * 固定步长逻辑时钟（SIM-01 / D-01）。
 *
 * 时间是一个单调递增的**步计数（tick）**，绝不读取墙上时钟。
 * `step()` 是时间前进的唯一途径；`dt` 为固定步长（秒）。
 */
export class TickClock {
    private _tick = 0;

    constructor(readonly dt: number) {}

    get tick(): number {
        return this._tick;
    }

    /** 时间前进的唯一途径：步计数加一。 */
    step(): void {
        this._tick++;
    }

    /**
     * 恢复步计数（快照反序列化专用，SIM-04）。
     *
     * 语义：把时钟设回某一 tick。这是 `step()` 之外**唯一**改变步数的入口，
     * 且只由 `deserializeState()` 调用——正常运行期绝不使用。
     */
    restore(tick: number): void {
        this._tick = tick;
    }
}
