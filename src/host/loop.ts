/**
 * 固定步长累加器循环（SIM-01 / 研究 Pattern 1）。
 *
 * 纯节奏控制，无游戏逻辑，**无 DOM/时钟依赖**（因此 Vitest 的 node 环境可直接导入）。
 * 时间预算转换为整数个固定步；余数为渲染插值因子 alpha。
 * 泵（pump）——一个 `() => number` 的“本帧预算（秒）”——决定节奏，
 * 是三种运行模式唯一不同之处；模拟本身只见 `step()`。
 */

/** 循环所需的最小接口：只要求能推进一步。 */
export interface StepTarget {
    step(): void;
}

export interface RunLoopConfig {
    /** 固定步长（秒）。 */
    dt: number;
    /** 单帧最大累加时间（秒），防螺旋死亡。 */
    maxFrame: number;
    /** 单帧最大步数上限。 */
    maxSteps: number;
}

/**
 * 返回一个“推进一帧”的函数；调用方按宿主节奏反复调用它。
 * 命中步数上限时清零欠账（绝不累积螺旋）。
 */
export function runLoop(
    pump: () => number,
    sim: StepTarget,
    onRendered: (alpha: number) => void,
    cfg: RunLoopConfig
): () => void {
    let acc = 0;
    return () => {
        acc += Math.min(pump(), cfg.maxFrame);
        let steps = 0;
        while (acc >= cfg.dt && steps < cfg.maxSteps) {
            sim.step();
            acc -= cfg.dt;
            steps++;
        }
        if (steps === cfg.maxSteps) acc = 0;
        onRendered(acc / cfg.dt);
    };
}
