/**
 * 演示帧驱动：`class ManualRunner implements IManualRunner`（D-12/D-17/D-18）。
 * 本类是 Phase 5 唯一的循环：每个输出帧恰好一次 `world.tick()`，然后一次
 * `renderer.renderFrame()`，再用**单个** `setTimeout` 让出事件循环并排定下一帧。
 * 它从不推进控制或物理（`KingdomWorld` 已在每个子步内推进控制，Pitfall 8），
 * 也不使用 rAF、重复计时器或固定 fps 累加器；延时就是操作面板的“速度”。
 */

import type { IManualRunner, IRunnerDeps, IRunnerWorld } from '@/demo/types';
import type { IBattle } from '@/kingdom/types';
import { MAX_FRAME_DELAY_MS, MIN_FRAME_DELAY_MS } from '@/render/constants';

/**
 * 每帧延时的解析：非有限值回落到下限，其余钳制到 `[MIN_FRAME_DELAY_MS, MAX_FRAME_DELAY_MS]`。
 * @param ms 请求的延时（毫秒）。
 * @returns 合法的延时（毫秒）。
 */
function clampFrameDelay(ms: number): number {
    if (!Number.isFinite(ms)) {
        return MIN_FRAME_DELAY_MS;
    }
    return Math.min(MAX_FRAME_DELAY_MS, Math.max(MIN_FRAME_DELAY_MS, ms));
}

/**
 * 单计时器帧驱动器：一次 tick → 一次渲染 → 一次 `setTimeout`。
 * 自动跟拍默认开启；关闭后本类绝不写镜头目标，操作者选定的全景得以保留。
 */
export class ManualRunner implements IManualRunner {
    /** 注入的窄依赖（世界读取、镜头、渲染器、会话重置、错误上报）。 */
    private readonly deps: IRunnerDeps;
    /** 循环是否正在运行。 */
    private running: boolean;
    /** 是否已释放：阻止后续调度与单步。 */
    private disposed: boolean;
    /** 待处理的唯一定时器句柄；无挂起帧时为 `null`。 */
    private timer: ReturnType<typeof setTimeout> | null;
    /** 当前每帧延时（毫秒），始终位于合法区间。 */
    private frameDelayMs: number;
    /** 自上次 `reset` 以来成功输出的帧数。 */
    private frameCount: number;
    /** 是否启用自动跟拍（REND-04）；默认 `true`。 */
    private autoFollow: boolean;

    /**
     * 构造帧驱动器。
     * @param deps 窄依赖集合。
     * @param frameDelayMs 初始每帧延时（毫秒）；经 `setFrameDelay` 钳制与 NaN 兜底。
     */
    constructor(deps: IRunnerDeps, frameDelayMs: number) {
        this.deps = deps;
        this.running = false;
        this.disposed = false;
        this.timer = null;
        this.frameDelayMs = MIN_FRAME_DELAY_MS;
        this.frameCount = 0;
        this.autoFollow = true;
        this.setFrameDelay(frameDelayMs);
    }

    /**
     * 启动循环并排定下一帧；已运行时为空操作。
     */
    start(): void {
        if (this.disposed || this.running) {
            return;
        }
        this.running = true;
        this.schedule();
    }

    /**
     * 暂停循环并清空待处理定时器（不留下任何计时器）。
     */
    pause(): void {
        this.running = false;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    /**
     * 暂停时推进恰好一帧，且不排定后续帧；运行中或已释放时为空操作。
     */
    stepOnce(): void {
        if (this.disposed || this.running) {
            return;
        }
        this.runOneFrame(false);
    }

    /**
     * 复位会话：暂停 → 注入的会话重置 → 帧计数清零 → 恢复默认自动跟拍。
     */
    reset(): void {
        this.pause();
        this.deps.resetSession();
        this.frameCount = 0;
        this.autoFollow = true;
    }

    /**
     * 设置每帧延时；非有限值按 `MIN_FRAME_DELAY_MS` 处理，其余钳制到合法区间。
     * @param ms 请求的延时（毫秒）。
     */
    setFrameDelay(ms: number): void {
        this.frameDelayMs = clampFrameDelay(ms);
    }

    /**
     * 当前每帧延时。
     * @returns 延时（毫秒）。
     */
    getFrameDelay(): number {
        return this.frameDelayMs;
    }

    /**
     * 开关自动跟拍。关闭时本类不写镜头目标，因此操作者全景不会被覆盖；
     * 面板可在同一次操作里自行 `setBattleTarget`。
     * @param enabled 是否启用自动跟拍。
     */
    setAutoFollow(enabled: boolean): void {
        this.autoFollow = enabled === true;
    }

    /**
     * 当前是否启用自动跟拍。
     * @returns 自动跟拍开关。
     */
    isAutoFollow(): boolean {
        return this.autoFollow;
    }

    /**
     * 循环是否正在运行。
     * @returns 是否运行中。
     */
    isRunning(): boolean {
        return this.running;
    }

    /**
     * 自上次 `reset` 以来成功输出的帧数。
     * @returns 帧数。
     */
    getFrameCount(): number {
        return this.frameCount;
    }

    /**
     * 幂等释放：暂停并阻止后续调度。
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.pause();
        this.disposed = true;
    }

    /**
     * 排定下一帧（唯一计时器）；仅在运行且未释放时生效。
     */
    private schedule(): void {
        if (!this.running || this.disposed) {
            return;
        }
        this.timer = setTimeout(
            () => this.runOneFrame(true),
            this.frameDelayMs
        );
    }

    /**
     * 执行一个输出帧：一次世界推进、一次目标更新、一次渲染、帧计数加一。
     * tick 或渲染抛出的异常会暂停循环并经 `onError` 上报一次，绝不排定后续帧。
     * @param scheduleNext 是否在成功后继续排定下一帧（单步为 `false`）。
     */
    private runOneFrame(scheduleNext: boolean): void {
        this.timer = null;
        if (this.disposed) {
            return;
        }
        try {
            const world = this.deps.getWorld();
            world.tick();
            this.updateTarget(world);
            this.deps.renderer.renderFrame();
            this.frameCount += 1;
        } catch (error) {
            this.pause();
            this.deps.onError(error);
            return;
        }
        if (scheduleNext) {
            this.schedule();
        }
    }

    /**
     * 自动跟拍策略（D-12/D-15/OQ-6）：自动跟拍关闭时直接返回，镜头目标保持不变；
     * 否则保留仍然活跃的当前目标，没有则选第一场活跃战斗，再没有则请求全景。
     * @param world 当前世界。
     */
    private updateTarget(world: IRunnerWorld): void {
        if (!this.autoFollow) {
            return;
        }
        const active: readonly IBattle[] = world
            .getBattleSystem()
            .listActiveBattles();
        const current = this.deps.camera.getBattleTarget();
        if (
            current !== undefined &&
            active.some(battle => battle.getId() === current)
        ) {
            return;
        }
        this.deps.camera.setBattleTarget(
            active.length > 0 ? active[0].getId() : undefined
        );
    }
}
