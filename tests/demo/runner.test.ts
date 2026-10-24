/**
 * 帧驱动器的假计时器测试（REND-04/REND-05/D-12/D-17）：证明每输出帧恰好一次
 * `renderFrame()`、非冻结帧恰好一次 `world.tick()`、战斗入场冻结 24 个纯渲染帧、
 * 暂停不留计时器、单步不排定后续帧、延时钳制、自动跟拍/操作者全景/显式选择的
 * 三种镜头策略、异常暂停与会话复位。
 * 全部依赖都是窄接口的本地假件：不引入 Rapier、不引入 Pixi、不推进真实世界。
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { BATTLE_ENTRY_FREEZE_FRAMES, ManualRunner } from '@/demo/runner';
import type { IRunnerDeps, IRunnerRenderer, IRunnerWorld } from '@/demo/types';
import type {
    IBattle,
    IBattleLifecycleEvent,
    IBattleSystem,
    IMapBounds,
    IWorldTickResult
} from '@/kingdom/types';
import { Camera } from '@/render/Camera';
import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import type { IViewport } from '@/render/types';
import { makeBattle } from '../render/fakes';

/** 默认测试每帧延时（毫秒）：整数便于假计时器推进。 */
const DELAY_MS = 33;

/** 测试视口：固定 1920×1080（D-13）。 */
const VIEWPORT: IViewport = { width: 1920, height: 1080 };

/** 测试地图：1000×1000 米。 */
const BOUNDS: IMapBounds = { width: 1000, height: 1000 };

/** 测试战斗中心（米）。 */
const CENTER = { x: 300, y: 300 };

/** 帧驱动器看到的副作用计数。 */
interface IRunnerProbe {
    /** `world.tick()` 调用次数。 */
    ticks: number;
    /** `renderer.renderFrame()` 调用次数。 */
    renders: number;
}

/** 注入的会话重置计数。 */
interface ISessionCounter {
    /** `resetSession()` 调用次数。 */
    resets: number;
}

/**
 * 活跃战斗容器：读取测试直接持有的同一个可变数组，
 * 因此战斗的出现/结束不需要重建依赖。
 */
class ListingBattleSystem implements IBattleSystem {
    /** 测试持有的活跃战斗数组（同一引用）。 */
    private readonly active: IBattle[];

    /**
     * 构造只读列举型战斗容器。
     * @param active 活跃战斗数组（测试会就地修改）。
     */
    constructor(active: IBattle[]) {
        this.active = active;
    }

    tick(): void {
        // 战斗判定由真实世界负责；本套件只观察活跃列表。
    }

    hasActiveBattle(): boolean {
        return this.active.length > 0;
    }

    getBattleForUnit(_unitId: number): IBattle | null {
        return this.active[0] ?? null;
    }

    listActiveBattles(): readonly IBattle[] {
        return [...this.active];
    }

    listCompletedBattles(): readonly IBattle[] {
        return [];
    }

    drainEvents(): readonly IBattleLifecycleEvent[] {
        return [];
    }
}

/** 计数世界：每次 `tick()` 递增探针并返回递增的游戏分钟。 */
class CountingWorld implements IRunnerWorld {
    /** 副作用计数。 */
    private readonly probe: IRunnerProbe;
    /** 战斗容器。 */
    private readonly battles: IBattleSystem;

    /**
     * 构造计数世界。
     * @param probe 副作用计数。
     * @param battles 战斗容器。
     */
    constructor(probe: IRunnerProbe, battles: IBattleSystem) {
        this.probe = probe;
        this.battles = battles;
    }

    tick(): IWorldTickResult {
        this.probe.ticks += 1;
        return { gameMinutes: this.probe.ticks, minutesPerTick: 24 };
    }

    getBattleSystem(): IBattleSystem {
        return this.battles;
    }
}

/** 抛出型世界：第一次 `tick()` 就抛错，用于验证错误暂停。 */
class ThrowingWorld implements IRunnerWorld {
    /** 副作用计数。 */
    private readonly probe: IRunnerProbe;
    /** 战斗容器。 */
    private readonly battles: IBattleSystem;

    /**
     * 构造抛出型世界。
     * @param probe 副作用计数。
     * @param battles 战斗容器。
     */
    constructor(probe: IRunnerProbe, battles: IBattleSystem) {
        this.probe = probe;
        this.battles = battles;
    }

    tick(): IWorldTickResult {
        this.probe.ticks += 1;
        throw new Error('tick failed');
    }

    getBattleSystem(): IBattleSystem {
        return this.battles;
    }
}

/** 计数渲染器：只记录 `renderFrame` 次数，`reset` 为空操作。 */
class CountingRenderer implements IRunnerRenderer {
    /** 副作用计数。 */
    private readonly probe: IRunnerProbe;

    /**
     * 构造计数渲染器。
     * @param probe 副作用计数。
     */
    constructor(probe: IRunnerProbe) {
        this.probe = probe;
    }

    renderFrame(): void {
        this.probe.renders += 1;
    }

    reset(): void {
        // 本套件不验证渲染器复位，交由 05-07 的渲染器测试覆盖。
    }
}

/** 一套已接线的驱动器与它的探针。 */
interface IRunnerFixture {
    /** 副作用计数。 */
    readonly probe: IRunnerProbe;
    /** 活跃战斗数组（测试就地修改）。 */
    readonly active: IBattle[];
    /** 会话重置计数。 */
    readonly session: ISessionCounter;
    /** `onError` 收到的错误。 */
    readonly errors: unknown[];
    /** 真实镜头（默认渲染配置）。 */
    readonly camera: Camera;
    /** 被测驱动器。 */
    readonly runner: ManualRunner;
}

/**
 * 创建一个复位到全景的真实镜头。
 * @returns 新镜头。
 */
function makeCamera(): Camera {
    const camera = new Camera(DEFAULT_RENDER_CONFIG.camera);
    camera.reset(BOUNDS, VIEWPORT);
    return camera;
}

/**
 * 构造一套假计时器夹具。
 * @param delayMs 初始每帧延时（毫秒）。
 * @param makeWorld 世界工厂；默认返回计数世界。
 * @returns 夹具。
 */
function createFixture(
    delayMs = DELAY_MS,
    makeWorld: (probe: IRunnerProbe, battles: IBattleSystem) => IRunnerWorld = (
        probe,
        battles
    ) => new CountingWorld(probe, battles)
): IRunnerFixture {
    const probe: IRunnerProbe = { ticks: 0, renders: 0 };
    const active: IBattle[] = [];
    const session: ISessionCounter = { resets: 0 };
    const errors: unknown[] = [];
    const battles = new ListingBattleSystem(active);
    const world = makeWorld(probe, battles);
    const camera = makeCamera();
    const deps: IRunnerDeps = {
        getWorld: () => world,
        camera,
        renderer: new CountingRenderer(probe),
        resetSession: () => {
            session.resets += 1;
        },
        onError: error => {
            errors.push(error);
        }
    };
    const runner = new ManualRunner(deps, delayMs);
    return { probe, active, session, errors, camera, runner };
}

/**
 * 走完一次战斗入场冻结：这 24 帧只渲染、不推进世界。
 * 测试在断言“正常 tick 语义”前必须先调用它，否则会落在冻结窗口里。
 * @param fixture 夹具。
 */
function drainEntryFreeze(fixture: IRunnerFixture): void {
    for (let frame = 0; frame < BATTLE_ENTRY_FREEZE_FRAMES; frame += 1) {
        fixture.runner.stepOnce();
    }
}

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
});

describe('demo/runner — one tick and one render per output frame (D-17)', () => {
    it('schedules on start and advances exactly one frame per delay', () => {
        const fixture = createFixture();

        fixture.runner.start();
        expect(fixture.runner.isRunning()).toBe(true);
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(DELAY_MS);
        expect(fixture.probe.ticks).toBe(1);
        expect(fixture.probe.renders).toBe(1);
        expect(fixture.runner.getFrameCount()).toBe(1);

        vi.advanceTimersByTime(DELAY_MS);
        expect(fixture.probe.ticks).toBe(2);
        expect(fixture.probe.renders).toBe(2);
        expect(fixture.runner.getFrameCount()).toBe(2);
    });

    it('cancels the pending timer on pause without leaking one', () => {
        const fixture = createFixture();

        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS);
        fixture.runner.pause();

        expect(fixture.runner.isRunning()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);

        vi.advanceTimersByTime(DELAY_MS * 100);
        expect(fixture.probe.ticks).toBe(1);
        expect(fixture.probe.renders).toBe(1);
    });

    it('steps exactly one unscheduled frame while paused', () => {
        const fixture = createFixture();

        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(1);
        expect(fixture.probe.renders).toBe(1);
        expect(fixture.runner.getFrameCount()).toBe(1);
        expect(vi.getTimerCount()).toBe(0);

        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS);
        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(2);
        expect(fixture.probe.renders).toBe(2);
    });

    it('clamps the frame delay to [0, 1000] and rejects non-finite input', () => {
        const fixture = createFixture();

        fixture.runner.setFrameDelay(-5);
        expect(fixture.runner.getFrameDelay()).toBe(0);

        fixture.runner.setFrameDelay(5000);
        expect(fixture.runner.getFrameDelay()).toBe(1000);

        fixture.runner.setFrameDelay(Number.NaN);
        expect(fixture.runner.getFrameDelay()).toBe(0);

        fixture.runner.setFrameDelay(42);
        expect(fixture.runner.getFrameDelay()).toBe(42);

        expect(createFixture(5000).runner.getFrameDelay()).toBe(1000);
        expect(createFixture(Number.NaN).runner.getFrameDelay()).toBe(0);
    });
});

describe('demo/runner — automatic battle targeting (D-12/D-15/OQ-6)', () => {
    it('selects the first active battle and clears the target when it ends', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
        drainEntryFreeze(fixture);

        fixture.camera.setBattleTarget(undefined);
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
        drainEntryFreeze(fixture);

        fixture.active.length = 0;
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBeUndefined();
    });

    it('keeps an operator panorama while auto-follow is off and resumes when re-enabled', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
        drainEntryFreeze(fixture);

        fixture.runner.setAutoFollow(false);
        fixture.camera.setBattleTarget(undefined);

        for (let frame = 0; frame < 3; frame += 1) {
            fixture.runner.stepOnce();
        }
        expect(fixture.camera.getBattleTarget()).toBeUndefined();
        expect(fixture.runner.isAutoFollow()).toBe(false);

        fixture.runner.setAutoFollow(true);
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
    });

    it('keeps an explicit battle selection while that battle is active', () => {
        const fixture = createFixture();
        fixture.active.push(
            makeBattle([1], CENTER, 5),
            makeBattle([2], CENTER, 7)
        );

        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
        drainEntryFreeze(fixture);

        fixture.camera.setBattleTarget(7);
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(7);

        fixture.active.splice(1, 1);
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(5);
    });
});

describe('demo/runner — battle-entry freeze (REND-05)', () => {
    it('renders 24 frames with zero ticks on battle entry, then resumes ticking', () => {
        expect(BATTLE_ENTRY_FREEZE_FRAMES).toBe(24);

        const fixture = createFixture();
        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS);
        expect(fixture.probe.ticks).toBe(1);
        expect(fixture.probe.renders).toBe(1);

        fixture.active.push(makeBattle([1], CENTER, 5));
        vi.advanceTimersByTime(DELAY_MS);
        expect(fixture.probe.ticks).toBe(2);
        expect(fixture.camera.getBattleTarget()).toBe(5);

        const frozenTicks = fixture.probe.ticks;
        const frozenRenders = fixture.probe.renders;

        vi.advanceTimersByTime(DELAY_MS * BATTLE_ENTRY_FREEZE_FRAMES);
        expect(fixture.probe.ticks).toBe(frozenTicks);
        expect(fixture.probe.renders).toBe(
            frozenRenders + BATTLE_ENTRY_FREEZE_FRAMES
        );
        expect(fixture.runner.getFrameCount()).toBe(
            frozenRenders + BATTLE_ENTRY_FREEZE_FRAMES
        );
        expect(vi.getTimerCount()).toBe(1);

        vi.advanceTimersByTime(DELAY_MS);
        expect(fixture.probe.ticks).toBe(frozenTicks + 1);
        expect(fixture.probe.renders).toBe(
            frozenRenders + BATTLE_ENTRY_FREEZE_FRAMES + 1
        );

        fixture.runner.dispose();
        expect(vi.getTimerCount()).toBe(0);
    });

    it('renders exactly one frame without ticking per stepOnce while frozen', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        const ticks = fixture.probe.ticks;
        const renders = fixture.probe.renders;

        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks);
        expect(fixture.probe.renders).toBe(renders + 1);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('clears a pending freeze on reset', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        const ticks = fixture.probe.ticks;

        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks);

        fixture.runner.reset();
        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks + 1);
    });

    it('never freezes while auto-follow is off', () => {
        const fixture = createFixture();
        fixture.runner.setAutoFollow(false);
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS * 5);

        expect(fixture.probe.ticks).toBe(5);
        expect(fixture.probe.renders).toBe(5);
        expect(fixture.camera.getBattleTarget()).toBeUndefined();
    });

    it('does not freeze on battle-to-battle switches or on clearing the target', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        drainEntryFreeze(fixture);
        const ticks = fixture.probe.ticks;

        fixture.active.splice(0, 1, makeBattle([2], CENTER, 7));
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(7);
        expect(fixture.probe.ticks).toBe(ticks + 1);

        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks + 2);

        fixture.active.length = 0;
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBeUndefined();
        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks + 4);
    });

    it('re-arms the freeze when a target reappears after clearing', () => {
        const fixture = createFixture();
        fixture.active.push(makeBattle([1], CENTER, 5));

        fixture.runner.stepOnce();
        drainEntryFreeze(fixture);

        fixture.active.length = 0;
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBeUndefined();

        fixture.active.push(makeBattle([2], CENTER, 7));
        fixture.runner.stepOnce();
        expect(fixture.camera.getBattleTarget()).toBe(7);

        const ticks = fixture.probe.ticks;
        const renders = fixture.probe.renders;
        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(ticks);
        expect(fixture.probe.renders).toBe(renders + 1);
    });
});

describe('demo/runner — failures and lifecycle (D-12/Pitfall 18)', () => {
    it('pauses and reports once when a tick throws', () => {
        const fixture = createFixture(
            DELAY_MS,
            (probe, battles) => new ThrowingWorld(probe, battles)
        );

        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS);

        expect(fixture.errors).toHaveLength(1);
        expect(fixture.runner.isRunning()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
        expect(fixture.runner.getFrameCount()).toBe(0);

        vi.advanceTimersByTime(DELAY_MS * 10);
        expect(fixture.probe.ticks).toBe(1);
    });

    it('pauses, resets the session once and restores defaults on reset', () => {
        const fixture = createFixture();

        fixture.runner.start();
        vi.advanceTimersByTime(DELAY_MS * 2);
        expect(fixture.probe.ticks).toBe(2);
        fixture.runner.setAutoFollow(false);

        fixture.runner.reset();

        expect(fixture.session.resets).toBe(1);
        expect(fixture.runner.getFrameCount()).toBe(0);
        expect(fixture.runner.isAutoFollow()).toBe(true);
        expect(fixture.runner.isRunning()).toBe(false);
        expect(vi.getTimerCount()).toBe(0);
    });

    it('disposes idempotently and blocks a later start', () => {
        const fixture = createFixture();

        fixture.runner.dispose();
        fixture.runner.dispose();
        fixture.runner.start();

        expect(vi.getTimerCount()).toBe(0);
        expect(fixture.runner.isRunning()).toBe(false);

        fixture.runner.stepOnce();
        expect(fixture.probe.ticks).toBe(0);
    });
});
