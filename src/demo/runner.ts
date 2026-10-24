/**
 * 演示帧驱动：`class ManualRunner implements IManualRunner`（D-12/D-17/D-18）。
 * 本类是 Phase 5 唯一的循环：每个输出帧恰好一次 `renderer.renderFrame()`；非冻结帧在此之外
 * 还做恰好一次 `world.tick()`，然后用**单个** `setTimeout` 让出事件循环并排定下一帧。
 * 战斗入场时先冻结固定帧数（只渲染、不推进）：此时镜头**没有**目标，渲染器因此停在
 * 全景层（整张地图 + 军队/城池标志），让观众看清战斗发生在哪；冻结结束后才设置目标，
 * 由 `Camera` 用 6 帧推近战斗，并在同一帧恢复模拟。
 * 它从不推进控制或物理（`KingdomWorld` 已在每个子步内推进控制，Pitfall 8），
 * 也不使用 rAF、重复计时器或固定 fps 累加器；延时就是操作面板的“速度”。
 */

import type { IManualRunner, IRunnerDeps, IRunnerWorld } from '@/demo/types';
import type { IBattle } from '@/kingdom/types';
import { MAX_FRAME_DELAY_MS, MIN_FRAME_DELAY_MS } from '@/render/constants';

/**
 * 战斗入场冻结的输出帧数：30 fps 下 0.8 s。冻结期间镜头无目标、画面是全景，
 * 结束后才设置目标并开始 `Camera` 的 6 帧推近。
 * 按输出帧计数而非墙钟，因此冻结时长与每帧延时、单步或快进都无关。
 */
export const BATTLE_ENTRY_FREEZE_FRAMES = 24;

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
 * 单计时器帧驱动器：一次渲染 → （非冻结时）一次 tick → 一次 `setTimeout`。
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
    /** 战斗入场冻结剩余的输出帧数；0 表示正常推进（按帧计数，绝不读墙钟）。 */
    private freezeFramesRemaining: number;
    /** 冻结期间待应用的战斗 id；冻结结束时才写入镜头（缺失字面量 → `undefined`）。 */
    private pendingBattleId: number | undefined;

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
        this.freezeFramesRemaining = 0;
        this.pendingBattleId = undefined;
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
     * 复位会话：暂停 → 注入的会话重置 → 帧计数、冻结计数与待应用目标清零 → 恢复默认自动跟拍。
     */
    reset(): void {
        this.pause();
        this.deps.resetSession();
        this.frameCount = 0;
        this.freezeFramesRemaining = 0;
        this.pendingBattleId = undefined;
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
     * 关闭还会立即丢弃冻结中的待应用目标与剩余冻结帧，使“关闭即不冻结”依然成立。
     * @param enabled 是否启用自动跟拍。
     */
    setAutoFollow(enabled: boolean): void {
        this.autoFollow = enabled === true;
        if (!this.autoFollow) {
            this.freezeFramesRemaining = 0;
            this.pendingBattleId = undefined;
        }
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
     * 幂等释放：暂停、丢弃待完成的冻结与待应用目标并阻止后续调度。
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.pause();
        this.freezeFramesRemaining = 0;
        this.pendingBattleId = undefined;
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
     * 执行一个输出帧：冻结帧只渲染，普通帧先释放待应用目标、推进世界并更新目标再渲染，
     * 最后帧计数加一。冻结期间**不**调用 `world.tick()`、**不**重解目标，且镜头目标保持
     * `undefined`，因此渲染器停在全景层——观众在入场那一刻看到的是整张地图与军队/城池标志。
     * 冻结计数归零后的下一帧先 `setBattleTarget`，再在同一帧恢复 `world.tick()`。
     * tick 或渲染抛出的异常会暂停循环并经 `onError` 上报一次，绝不排定后续帧。
     * @param scheduleNext 是否在成功后继续排定下一帧（单步为 `false`）。
     */
    private runOneFrame(scheduleNext: boolean): void {
        this.timer = null;
        if (this.disposed) {
            return;
        }
        try {
            if (this.freezeFramesRemaining > 0) {
                this.freezeFramesRemaining -= 1;
            } else {
                const world = this.deps.getWorld();
                this.releasePendingTarget(world);
                world.tick();
                this.updateTarget(world);
            }
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
     * 冻结结束后的目标落地：只有自动跟拍仍开启且该战斗仍活跃才写入镜头，
     * 否则丢弃待应用目标、让画面留在全景（下一帧 `updateTarget` 会按常规重新选目标）。
     * 没有待应用目标时为空操作，因此普通帧可以直接调用。
     * @param world 当前世界。
     */
    private releasePendingTarget(world: IRunnerWorld): void {
        const pending = this.pendingBattleId;
        if (pending === undefined) {
            return;
        }
        this.pendingBattleId = undefined;
        if (!this.autoFollow) {
            return;
        }
        const stillActive = world
            .getBattleSystem()
            .listActiveBattles()
            .some(battle => battle.getId() === pending);
        if (stillActive) {
            this.deps.camera.setBattleTarget(pending);
        }
    }

    /**
     * 自动跟拍策略（D-12/D-15/OQ-6）：自动跟拍关闭时直接返回，镜头目标保持不变；
     * 否则保留仍然活跃的当前目标，没有则选第一场活跃战斗，再没有则请求全景。
     * 只有 `undefined → 数字` 的入场切换会启动冻结，且**不**立即写镜头目标——
     * 待冻结结束才由 `releasePendingTarget` 应用，从而先播完全景节拍再推近；
     * 战斗间切换、退出全景、关闭自动跟拍都不冻结，既有语义保持不变。
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
        const next = active.length > 0 ? active[0].getId() : undefined;
        if (current === undefined && next !== undefined) {
            this.pendingBattleId = next;
            this.freezeFramesRemaining = BATTLE_ENTRY_FREEZE_FRAMES;
            return;
        }
        this.deps.camera.setBattleTarget(next);
    }
}
