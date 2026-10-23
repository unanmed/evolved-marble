import { describe, expect, it } from 'vitest';

import type { IMapBounds, IVec2 } from '@/kingdom/types';
import { Camera } from '@/render/Camera';
import { fitBox, fitTransform, strategicTransform } from '@/render/cameraMath';
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

/** 过渡/平滑/震动的固定测试值：`switchFrames: 10` 让“第 10 次更新落地”可断言。 */
const TEST_OVERRIDES = {
    switchFrames: 10,
    smoothingFrames: 4,
    shakeAmplitudePx: 8,
    shakeDecayPerFrame: 0.5
};

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
 * @returns 镜头输入。
 */
function makeInput(
    points: readonly IVec2[],
    shakeImpulsePx = 0
): ICameraUpdateInput {
    return {
        viewport: VIEWPORT,
        bounds: BOUNDS,
        points,
        shakeImpulsePx
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

    it('lands exactly on the target on the switchFrames-th update', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        const start = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        expect(first.centerX).toBeCloseTo(start.centerX, 6);
        expect(first.centerY).toBeCloseTo(start.centerY, 6);
        expect(first.scale).toBeCloseTo(start.scale, 6);

        const frames: ICameraTransform[] = [first];
        for (let frame = 2; frame <= config.switchFrames; frame += 1) {
            frames.push(camera.update(makeInput(BATTLE_POINTS)));
        }
        expect(frames).toHaveLength(config.switchFrames);

        const penultimate = frames[config.switchFrames - 2];
        expect(Math.abs(penultimate.scale - target.scale)).toBeGreaterThan(
            1e-6
        );

        const last = frames[config.switchFrames - 1];
        expect(last.centerX).toBeCloseTo(target.centerX, 6);
        expect(last.centerY).toBeCloseTo(target.centerY, 6);
        expect(last.scale).toBeCloseTo(target.scale, 6);
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);
    });

    it('never moves further in one frame than the remaining distance', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        let previous = camera.reset(BOUNDS, VIEWPORT);
        const target = expectedBattleTransform(config, BATTLE_POINTS);
        camera.setBattleTarget(7);

        for (let frame = 0; frame < config.switchFrames; frame += 1) {
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
        camera.setBattleTarget(7);

        const first = camera.update(makeInput(BATTLE_POINTS));
        const second = camera.update(makeInput(BATTLE_POINTS));
        camera.setBattleTarget(7);
        const third = camera.update(makeInput(BATTLE_POINTS));

        expect(first.centerX).toBeCloseTo(500, 6);
        expect(third.centerX).toBeLessThan(second.centerX);
        expect(third.centerX).toBeGreaterThan(
            expectedBattleTransform(config, BATTLE_POINTS).centerX
        );
    });
});

describe('render/Camera — mode follows the target, one frame late on pull-back', () => {
    it('stays BattleFocus until the pull-back completes', () => {
        const config = makeConfig();
        const camera = new Camera(config);
        camera.reset(BOUNDS, VIEWPORT);
        camera.setBattleTarget(7);
        for (let frame = 0; frame < config.switchFrames; frame += 1) {
            camera.update(makeInput(BATTLE_POINTS));
        }
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        camera.setBattleTarget(undefined);
        expect(camera.getBattleTarget()).toBeUndefined();
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

        for (let frame = 1; frame < config.switchFrames; frame += 1) {
            camera.update(makeInput([]));
        }
        expect(camera.getMode()).toBe(CameraMode.BattleFocus);

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

describe('render/Camera — shake is capped, decayed and deterministic', () => {
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
                shakeImpulsePx: Number.NaN
            },
            {
                viewport: { width: 0, height: 0 },
                bounds: BOUNDS,
                points: [],
                shakeImpulsePx: 0
            },
            {
                viewport: VIEWPORT,
                bounds: { width: 0, height: 0 },
                points: [{ x: 1, y: 1 }],
                shakeImpulsePx: Number.POSITIVE_INFINITY
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
