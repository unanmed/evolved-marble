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
}
