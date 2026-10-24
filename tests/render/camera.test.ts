import { describe, expect, it } from 'vitest';

import type { IMapBounds, IVec2 } from '@/kingdom/types';
import { Camera } from '@/render/Camera';
import {
    fitBox,
    fitTransform,
    strategicTransform,
    trackTransform
} from '@/render/cameraMath';
import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import { CameraMode } from '@/render/types';
import type {
    ICameraConfig,
    ICameraTransform,
    ICameraUpdateInput,
    IViewport
} from '@/render/types';

/** 测试视口：默认 1920×1080（D-13）。 */
const VIEWPORT: IViewport = { width: 1920, height: 1080 };

/** 测试地图：1000×1000 米。 */
const BOUNDS: IMapBounds = { width: 1000, height: 1000 };

/** 一场 40m 见方、位于 (300, 300) 的战斗：目标构图与全景明显不同。 */
const BATTLE_POINTS: readonly IVec2[] = [
    { x: 280, y: 280 },
    { x: 320, y: 280 },
    { x: 320, y: 320 },
    { x: 280, y: 320 }
];

/**
 * 过渡/平滑/震动的固定测试值：`zoomFrames: 6` 让单段推近“首帧即动、第 6 帧落地”可断言，
 * `panFrames: 10` 让单段拉回可断言。
 */
const TEST_OVERRIDES = {
    panFrames: 10,
    zoomFrames: 6,
    smoothingFrames: 4,
    shakeAmplitudePx: 8,
    shakeDecayPerFrame: 0.5
};

/** 进入过渡的更新次数：单段推近占 `zoomFrames`。 */
const ENTRY_FRAMES = TEST_OVERRIDES.zoomFrames;

/**
 * 构造测试用镜头参数：在出厂默认值上钉死过渡、平滑与震动。
 * @returns 镜头参数。
 */
function makeConfig(): ICameraConfig {
    return { ...DEFAULT_RENDER_CONFIG.camera, ...TEST_OVERRIDES };
}

/**
 * 构造一次更新输入。
 * @param points 拟合点（空数组 = 全景）。
 * @param shakeImpulsePx 本帧震动冲量（像素）。
 * @param battleWeight 本帧战斗权重（存活成员等级和），默认 0。
 * @returns 镜头输入。
 */
function makeInput(
    points: readonly IVec2[],
    shakeImpulsePx = 0,
    battleWeight = 0
): ICameraUpdateInput {
    return {
        viewport: VIEWPORT,
        bounds: BOUNDS,
        points,
        shakeImpulsePx,
        battleWeight
    };
}

/**
 * 用与 `Camera` 相同的有效最小缩放口径计算期望的战斗构图（Pitfall 22）。
 * @param config 镜头参数。
 * @param points 参战点。
 * @returns 目标变换。
 */
function expectedBattleTransform(
    config: ICameraConfig,
    points: readonly IVec2[]
): ICameraTransform {
    const box = fitBox(points, config.coverage, config.minSpanMeters);
    if (box === null) {
        throw new Error('expected a fit box for the battle point set');
    }
    const panoramic = strategicTransform(BOUNDS, VIEWPORT, config).scale;
    return fitTransform(box, VIEWPORT, {
        ...config,
        minScale: Math.min(config.minScale, panoramic)
    });
}

/**
 * 断言变换的五个分量都是有限数。
 * @param transform 待检查的变换。
 */
function expectFiniteTransform(transform: ICameraTransform): void {
    for (const value of [
        transform.centerX,
        transform.centerY,
        transform.scale,
        transform.shakeX,
        transform.shakeY
    ]) {
        expect(Number.isFinite(value)).toBe(true);
    }
}

describe('render/Camera — reset is the only instant jump', () => {
    it('returns the panoramic composition and reports Strategic', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const transform = camera.reset(BOUNDS, VIEWPORT);

        expect(camera.getMode()).toBe(CameraMode.Strategic);
        expect(camera.getBattleTarget()).toBeUndefined();
        expect(transform).toEqual(strategicTransform(BOUNDS, VIEWPORT, config));
        expect(camera.getTransform()).toEqual(transform);
    });

    it('starts from a defined finite transform before the first update', () => {
        const camera = new Camera(makeConfig());

        expectFiniteTransform(camera.getTransform());
        expect(camera.getMode()).toBe(CameraMode.Strategic);
        expect(camera.getBattleTarget()).toBeUndefined();
    });
});

describe('render/Camera — target changes never teleport', () => {
    it('leaves the current transform untouched when a target is set', () => {
        const camera = new Camera(makeConfig());
        const before = camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);

        expect(camera.getTransform()).toEqual(before);
        expect(camera.getBattleTarget()).toBe(7);
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);
    });

    it('lands exactly on the target on the zoomFrames-th update', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const start = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        // 首帧即同时向目标推进：不跳变到目标，也不空转在起点。
        expect(first.centerX).toBeLessThan(start.centerX);
        expect(first.centerX).toBeGreaterThan(target.centerX);
        expect(first.scale).toBeGreaterThan(start.scale);
        expect(first.scale).toBeLessThan(target.scale);

        const frames: ICameraTransform[] = [first];
        for (let frame = 2; frame <= ENTRY_FRAMES; frame += 1) {
            frames.push(camera.update(makeInput(BATTLE_POINTS)));
        }
        expect(frames).toHaveLength(ENTRY_FRAMES);

        const penultimate = frames[ENTRY_FRAMES - 2];
        expect(Math.abs(penultimate.scale - target.scale)).toBeGreaterThan(
            1e-6
        );

        const last = frames[ENTRY_FRAMES - 1];
        expect(last.centerX).toBeCloseTo(target.centerX, 6);
        expect(last.centerY).toBeCloseTo(target.centerY, 6);
        expect(last.scale).toBeCloseTo(target.scale, 6);
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);
    });

    it('moves centre and scale in the same frame, never in two phases', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const start = camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);

        const frames: ICameraTransform[] = [];
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            frames.push(camera.update(makeInput(BATTLE_POINTS)));
        }

        // 首帧就已离开全景快照：中心与缩放同时开始推进，没有一个“只平移”的段。
        expect(frames[0].centerX).toBeLessThan(start.centerX);
        expect(frames[0].scale).toBeGreaterThan(start.scale);

        for (let index = 1; index < ENTRY_FRAMES - 1; index += 1) {
            expect(frames[index].centerX).toBeLessThan(
                frames[index - 1].centerX
            );
            expect(frames[index].scale).toBeGreaterThan(
                frames[index - 1].scale
            );
        }
    });

    it('never moves further in one frame than the remaining distance', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        let previous = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            const next = camera.update(makeInput(BATTLE_POINTS));
            const remaining = Math.hypot(
                target.centerX - previous.centerX,
                target.centerY - previous.centerY
            );
            const moved = Math.hypot(
                next.centerX - previous.centerX,
                next.centerY - previous.centerY
            );

            expectFiniteTransform(next);
            expect(moved).toBeLessThanOrEqual(remaining + 1e-9);
            previous = next;
        }
    });

    it('does not restart the transition for an unchanged target', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        const second = camera.update(makeInput(BATTLE_POINTS));
        camera.setBattleTarget(7);
        const third = camera.update(makeInput(BATTLE_POINTS));

        expect(first.centerX).toBeGreaterThan(target.centerX);
        expect(third.centerX).toBeLessThan(second.centerX);
        expect(third.centerX).toBeGreaterThan(target.centerX);
    });
});

describe('render/Camera — mode follows the target, one frame late on pull-back', () => {
    it('stays BattleFocus until the single-phase pull-back lands', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS));
        }
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        camera.setBattleTarget(undefined);
        expect(camera.getBattleTarget()).toBeUndefined();
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        for (let frame = 1; frame < config.panFrames; frame += 1) {
            camera.update(makeInput([]));
            expect(camera.getMode()).toBe(CameraMode.BattleFocus);
        }

        camera.update(makeInput([]));
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });

    it('fits the panorama for empty points without flipping the mode', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);

        const transform = camera.update(makeInput([]));

        expect(transform.scale).toBeCloseTo(
            strategicTransform(BOUNDS, VIEWPORT, config).scale,
            9
        );
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });
});

describe('render/Camera — the pull-back is one simultaneous interpolation', () => {
    /**
     * 推进到一场战斗的稳态构图（进入过渡已落地）。
     * @param config 镜头参数。
     * @returns 已跟拍战斗 7 的镜头。
     */
    function focusBattle(config: ICameraConfig): Camera {
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS));
        }
        return camera;
    }

    it('shrinks from the first exit frame and lands on the panorama in panFrames frames', () => {
        const config = makeConfig();
        const camera = focusBattle(config);
        const battle = camera.getTransform();
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, config);
        camera.setBattleTarget(undefined);

        const frames: ICameraTransform[] = [];
        for (let frame = 0; frame < config.panFrames; frame += 1) {
            frames.push(camera.update(makeInput([])));
        }

        // 缩放自第一帧起就收缩：旧的“先以战斗缩放平移”签名不再出现。
        expect(frames[0].scale).toBeLessThan(battle.scale);
        for (let index = 1; index < frames.length; index += 1) {
            expect(frames[index].scale).toBeLessThan(frames[index - 1].scale);
        }

        const landing = frames[config.panFrames - 1];
        expect(landing.centerX).toBeCloseTo(panoramic.centerX, 6);
        expect(landing.centerY).toBeCloseTo(panoramic.centerY, 6);
        expect(landing.scale).toBeCloseTo(panoramic.scale, 6);
        expect(camera.getTransform()).toEqual(landing);
        expect(camera.getMode()).toBe(CameraMode.Strategic);
    });

    it('moves centre and scale in the same frame, never in two phases', () => {
        const config = makeConfig();
        const camera = focusBattle(config);
        const battle = camera.getTransform();
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, config);
        camera.setBattleTarget(undefined);

        const halfway = Math.ceil(config.panFrames / 2);
        let frame = battle;
        for (let index = 0; index < halfway; index += 1) {
            frame = camera.update(makeInput([]));
        }

        // 中点处中心已向全景推进，但缩放也已离开战斗缩放——两者同步发生。
        expect(frame.centerX).toBeGreaterThan(battle.centerX);
        expect(frame.centerX).toBeLessThan(panoramic.centerX);
        expect(frame.scale).toBeLessThan(battle.scale);
        expect(frame.scale).toBeGreaterThan(panoramic.scale);
    });

    it('ignores battle weight during the exit transition', () => {
        const config = makeConfig();
        const light = focusBattle(config);
        const heavy = focusBattle(config);
        light.setBattleTarget(undefined);
        heavy.setBattleTarget(undefined);

        for (let frame = 0; frame < config.panFrames; frame += 1) {
            const a = light.update(makeInput([], 0, 0));
            const b = heavy.update(makeInput([], 0, 5000));

            expect(a).toEqual(b);
        }
        expect(light.getMode()).toBe(heavy.getMode());
    });
});

describe('render/Camera — battle weight only shortens in-battle tracking', () => {
    /**
     * 进入战斗后把参战点整体平移 40 米，再跟随若干帧，返回最终变换。
     * @param config 镜头参数。
     * @param battleWeight 每帧传入的战斗权重。
     * @param frames 稳态跟随时长（输出帧）。
     * @returns 跟随时长结束时的变换。
     */
    function followMovingBattle(
        config: ICameraConfig,
        battleWeight: number,
        frames: number
    ): ICameraTransform {
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS, 0, battleWeight));
        }
        const moved = BATTLE_POINTS.map(point => ({
            x: point.x + 40,
            y: point.y
        }));
        let transform = camera.getTransform();
        for (let frame = 0; frame < frames; frame += 1) {
            transform = camera.update(makeInput(moved, 0, battleWeight));
        }
        return transform;
    }

    it('converges to a moving battle centre faster with a larger weight', () => {
        const config = makeConfig();
        const target = expectedBattleTransform(
            config,
            BATTLE_POINTS.map(point => ({ x: point.x + 40, y: point.y }))
        );
        const light = followMovingBattle(config, 0, 3);
        const heavy = followMovingBattle(config, 200, 3);

        expect(Math.abs(heavy.centerX - target.centerX)).toBeLessThan(
            Math.abs(light.centerX - target.centerX)
        );
    });

    it('keeps the configured smoothing at weight 0', () => {
        const config = makeConfig();
        const steady = followMovingBattle(config, 0, 0);
        const configTarget = expectedBattleTransform(
            config,
            BATTLE_POINTS.map(point => ({ x: point.x + 40, y: point.y }))
        );
        const expected = trackTransform(steady, configTarget, config);

        const actual = followMovingBattle(config, 0, 1);

        expect(actual.centerX).toBeCloseTo(expected.centerX, 9);
        expect(actual.centerY).toBeCloseTo(expected.centerY, 9);
        expect(actual.scale).toBeCloseTo(expected.scale, 9);
    });

    it('leaves the entry timeline untouched by battle weight', () => {
        const config = makeConfig();
        const light = new Camera(config);
        const heavy = new Camera(config);
        light.reset(BOUNDS, VIEWPORT);
        heavy.reset(BOUNDS, VIEWPORT);
        light.setBattleTarget(7);
        heavy.setBattleTarget(7);

        for (let frame = 0; frame < ENTRY_FRAMES; frame += 1) {
            const a = light.update(makeInput(BATTLE_POINTS, 0, 0));
            const b = heavy.update(makeInput(BATTLE_POINTS, 0, 5000));

            expect(a).toEqual(b);
        }
        expect(light.getMode()).toBe(CameraMode.BattleFocus);
        expect(light.getTransform()).toEqual(heavy.getTransform());
    });
});

describe('render/Camera — shake is capped, decayed and deterministic', () => {
    it('emits no offset at all under the shipped default config', () => {
        const camera = new Camera(DEFAULT_RENDER_CONFIG.camera);
        camera.reset(BOUNDS, VIEWPORT);

        const frame = camera.update(makeInput([], 1000));

        expect(DEFAULT_RENDER_CONFIG.camera.shakeAmplitudePx).toBe(0);
        expect(Math.abs(frame.shakeX)).toBe(0);
        expect(Math.abs(frame.shakeY)).toBe(0);
    });

    it('clamps an oversized impulse to the configured amplitude', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);

        const frame = camera.update(makeInput([], 1000));
        const magnitude = Math.hypot(frame.shakeX, frame.shakeY);

        expect(Math.abs(frame.shakeX)).toBeLessThanOrEqual(
            config.shakeAmplitudePx + 1e-9
        );
        expect(Math.abs(frame.shakeY)).toBeLessThanOrEqual(
            config.shakeAmplitudePx + 1e-9
        );
        expect(magnitude).toBeLessThanOrEqual(config.shakeAmplitudePx + 1e-9);
        expect(magnitude).toBeGreaterThan(0);
    });

    it('decays monotonically once impulses stop', () => {
        const camera = new Camera(makeConfig());
        camera.reset(BOUNDS, VIEWPORT);

        const first = camera.update(makeInput([], 1000));
        let previous = Math.hypot(first.shakeX, first.shakeY);
        for (let frame = 0; frame < 5; frame += 1) {
            const next = camera.update(makeInput([]));
            const magnitude = Math.hypot(next.shakeX, next.shakeY);

            expect(magnitude).toBeLessThanOrEqual(previous + 1e-12);
            previous = magnitude;
        }
        expect(previous).toBeLessThan(Math.hypot(first.shakeX, first.shakeY));
    });

    it('returns identical transforms for identical frame sequences', () => {
        const config = makeConfig();
        const left = new Camera(config);
        const right = new Camera(config);
        left.reset(BOUNDS, VIEWPORT);
        right.reset(BOUNDS, VIEWPORT);
        left.setBattleTarget(3);
        right.setBattleTarget(3);

        for (const impulse of [1000, 0, 500, 0, 0, 0]) {
            const a = left.update(makeInput(BATTLE_POINTS, impulse));
            const b = right.update(makeInput(BATTLE_POINTS, impulse));

            expect(a).toEqual(b);
        }
    });
});

describe('render/Camera — degenerate input stays finite', () => {
    it('emits finite transforms for NaN points, zero viewport and empty points', () => {
        const camera = new Camera(makeConfig());
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(1);

        const inputs: readonly ICameraUpdateInput[] = [
            {
                viewport: VIEWPORT,
                bounds: BOUNDS,
                points: [{ x: Number.NaN, y: Number.NaN }],
                shakeImpulsePx: Number.NaN,
                battleWeight: Number.NaN
            },
            {
                viewport: { width: 0, height: 0 },
                bounds: BOUNDS,
                points: [],
                shakeImpulsePx: 0,
                battleWeight: -5
            },
            {
                viewport: VIEWPORT,
                bounds: { width: 0, height: 0 },
                points: [{ x: 1, y: 1 }],
                shakeImpulsePx: Number.POSITIVE_INFINITY,
                battleWeight: Number.POSITIVE_INFINITY
            }
        ];

        for (const input of inputs) {
            const transform = camera.update(input);

            expectFiniteTransform(transform);
            expect(transform).toEqual(camera.getTransform());
            expect(transform.scale).toBeGreaterThan(0);
        }
    });
});
