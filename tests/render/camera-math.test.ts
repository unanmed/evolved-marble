import { describe, expect, it } from 'vitest';

import type { IMapBounds, IVec2 } from '@/kingdom/types';
import {
    easeInOutCubic,
    fitBox,
    fitTransform,
    interpolateTransform,
    lerp,
    screenToWorld,
    smoothstep,
    strategicTransform,
    trackTransform,
    worldToScreen
} from '@/render/cameraMath';
import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import type {
    ICameraConfig,
    ICameraTransform,
    IFitBox,
    IViewport
} from '@/render/types';

// 复用 02-01 建立的确定性 IRng 辅助（AGENTS §9：测试里不出现 Math.random）。
import { mulberry32 } from '../helpers/rng';

/** 测试统一使用的镜头参数：出厂默认值本身就是被测对象（D-20）。 */
const CAMERA: ICameraConfig = DEFAULT_RENDER_CONFIG.camera;

/** 测试统一使用的地图尺寸（米）：与默认场景一致。 */
const BOUNDS: IMapBounds = { width: 1000, height: 1000 };

/** 测试统一使用的画布视口（像素）：默认 1920×1080（D-13）。 */
const VIEWPORT: IViewport = { width: 1920, height: 1080 };

/** 允许的浮点误差：缩放与坐标都经过对数/线性往返。 */
const EPSILON = 1e-9;

/** 一场 40m 见方、位于 (300, 300) 的战斗：与全景构图明显不同。 */
const BATTLE_POINTS: readonly IVec2[] = [
    { x: 280, y: 280 },
    { x: 320, y: 280 },
    { x: 320, y: 320 },
    { x: 280, y: 320 }
];

/**
 * 在 (500, 500) 附近生成 `count` 个确定性点。
 * @param count 点数。
 * @param seed PRNG 种子。
 * @param spread 分布跨度（米）。
 * @returns 世界坐标点集。
 */
function seededPoints(
    count: number,
    seed: number,
    spread = 400
): readonly IVec2[] {
    const rng = mulberry32(seed);
    const points: IVec2[] = [];
    for (let index = 0; index < count; index += 1) {
        points.push({
            x: 500 + (rng.next() - 0.5) * spread,
            y: 500 + (rng.next() - 0.5) * spread
        });
    }
    return points;
}

/**
 * 统计落在盒内（含边界）的点数。
 * @param box 拟合盒。
 * @param points 待统计的点。
 * @returns 盒内点数。
 */
function countInside(box: IFitBox, points: readonly IVec2[]): number {
    return points.filter(
        point =>
            point.x >= box.minX &&
            point.x <= box.maxX &&
            point.y >= box.minY &&
            point.y <= box.maxY
    ).length;
}

/**
 * 断言拟合盒的四个边界都是有限数。
 * @param box 待检查的盒。
 */
function expectFiniteBox(box: IFitBox): void {
    for (const value of [box.minX, box.maxX, box.minY, box.maxY]) {
        expect(Number.isFinite(value)).toBe(true);
    }
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

/**
 * 地图四角的世界坐标。
 * @param width 地图宽度（米）。
 * @param height 地图高度（米）。
 * @returns 四个角点。
 */
function mapCorners(width: number, height: number): readonly IVec2[] {
    return [
        { x: 0, y: 0 },
        { x: width, y: 0 },
        { x: 0, y: height },
        { x: width, y: height }
    ];
}

/**
 * 断言一组世界点全部落在视口内（含边界）。
 * @param points 世界点。
 * @param transform 镜头变换。
 * @param viewport 视口。
 */
function expectAllInsideViewport(
    points: readonly IVec2[],
    transform: ICameraTransform,
    viewport: IViewport
): void {
    for (const point of points) {
        const screen = worldToScreen(point, transform, viewport);
        expect(screen.x).toBeGreaterThanOrEqual(-EPSILON);
        expect(screen.x).toBeLessThanOrEqual(viewport.width + EPSILON);
        expect(screen.y).toBeGreaterThanOrEqual(-EPSILON);
        expect(screen.y).toBeLessThanOrEqual(viewport.height + EPSILON);
    }
}

/**
 * 取一个必定存在的拟合盒（空输入是测试错误，不是产品行为）。
 * @param points 世界点。
 * @returns 拟合盒。
 */
function boxOf(points: readonly IVec2[]): IFitBox {
    const box = fitBox(points, CAMERA.coverage, CAMERA.minSpanMeters);
    if (box === null) {
        throw new Error('expected a fit box for a non-empty finite point set');
    }
    return box;
}

describe('render/camera-math — percentile fit box covers at least 90%', () => {
    it('keeps ceil(coverage x n) points inside for n = 1, 2, 16 and 100', () => {
        const expectedInside: readonly (readonly [number, number])[] = [
            [1, 1],
            [2, 2],
            [16, 15],
            [100, 90]
        ];

        for (const [count, guaranteed] of expectedInside) {
            const points = seededPoints(count, 0x5eed + count);
            const box = fitBox(points, CAMERA.coverage, CAMERA.minSpanMeters);

            expect(box).not.toBeNull();
            if (box === null) {
                continue;
            }
            expectFiniteBox(box);
            expect(guaranteed).toBe(Math.ceil(CAMERA.coverage * count));
            expect(countInside(box, points)).toBeGreaterThanOrEqual(guaranteed);
            expect(countInside(box, points) / count).toBeGreaterThanOrEqual(
                0.9
            );
        }
    });

    it('gives a single point the minimum span instead of an unbounded zoom', () => {
        const box = fitBox([{ x: 500, y: 500 }], CAMERA.coverage, 24);

        expect(box).toEqual({
            minX: 488,
            maxX: 512,
            minY: 488,
            maxY: 512
        });
    });

    it('does not let a single outlier drag the composition', () => {
        const clustered = seededPoints(16, 0xabc, 20);
        const outlier: IVec2 = { x: 900, y: 500 };
        const points = [...clustered, outlier];
        const box = fitBox(points, CAMERA.coverage, CAMERA.minSpanMeters);

        expect(box).not.toBeNull();
        if (box === null) {
            return;
        }
        // 17 点中至少 16 点（ceil(0.9 × 17)）在盒内，离群点被排除在外。
        expect(countInside(box, points)).toBeGreaterThanOrEqual(16);
        expect(countInside(box, [outlier])).toBe(0);
        expect(box.maxX).toBeLessThan(outlier.x);
    });

    it('returns null for an empty or all-non-finite point set', () => {
        expect(fitBox([], CAMERA.coverage, CAMERA.minSpanMeters)).toBeNull();
        expect(
            fitBox(
                [
                    { x: Number.NaN, y: 0 },
                    { x: 1, y: Number.POSITIVE_INFINITY }
                ],
                CAMERA.coverage,
                CAMERA.minSpanMeters
            )
        ).toBeNull();
    });

    it('ignores non-finite points but keeps the finite ones', () => {
        const points: readonly IVec2[] = [
            { x: 100, y: 100 },
            { x: Number.NaN, y: 0 },
            { x: 120, y: 120 }
        ];
        const box = fitBox(points, CAMERA.coverage, CAMERA.minSpanMeters);

        expect(box).not.toBeNull();
        if (box === null) {
            return;
        }
        const finite: readonly IVec2[] = [
            { x: 100, y: 100 },
            { x: 120, y: 120 }
        ];
        expect(countInside(box, finite)).toBe(2);
    });

    it('clamps coverage 0 and 1.5 without dividing by zero', () => {
        for (const coverage of [0, 1.5]) {
            const points: readonly IVec2[] = [
                { x: 0, y: 0 },
                { x: 10, y: 10 }
            ];
            const box = fitBox(points, coverage, CAMERA.minSpanMeters);

            expect(box).not.toBeNull();
            if (box === null) {
                continue;
            }
            expectFiniteBox(box);
            expect(countInside(box, points)).toBe(2);
        }
    });
});

describe('render/camera-math — panoramic composition shows the whole map', () => {
    it('centres the map and keeps all four corners inside the padded viewport', () => {
        const transform = strategicTransform(BOUNDS, VIEWPORT, CAMERA);
        const padding = CAMERA.paddingPx;

        expect(transform.centerX).toBe(500);
        expect(transform.centerY).toBe(500);
        expect(transform.scale).toBeCloseTo(984 / 1000, 12);
        expect(transform.shakeX).toBe(0);
        expect(transform.shakeY).toBe(0);
        expectAllInsideViewport(mapCorners(1000, 1000), transform, VIEWPORT);

        for (const corner of mapCorners(1000, 1000)) {
            const screen = worldToScreen(corner, transform, VIEWPORT);
            expect(screen.x).toBeGreaterThanOrEqual(padding - EPSILON);
            expect(screen.x).toBeLessThanOrEqual(VIEWPORT.width - padding);
            expect(screen.y).toBeGreaterThanOrEqual(padding - EPSILON);
            expect(screen.y).toBeLessThanOrEqual(
                VIEWPORT.height - padding + EPSILON
            );
        }
    });

    it('still contains all four corners on a small viewport', () => {
        const small: IViewport = { width: 640, height: 360 };
        const transform = strategicTransform(BOUNDS, small, CAMERA);

        expect(transform.scale).toBeCloseTo(264 / 1000, 12);
        expectAllInsideViewport(mapCorners(1000, 1000), transform, small);
    });

    it('returns a finite fallback for a zero-size viewport', () => {
        const zero: IViewport = { width: 0, height: 0 };
        const transform = strategicTransform(BOUNDS, zero, CAMERA);

        expectFiniteTransform(transform);
        expect(transform.scale).toBe(1);
    });
});

describe('render/camera-math — battle fit never leaves the map behind', () => {
    it('zooms in above the panoramic scale for a small battle', () => {
        const transform = fitTransform(boxOf(BATTLE_POINTS), VIEWPORT, CAMERA);
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, CAMERA);

        expect(transform.centerX).toBe(300);
        expect(transform.centerY).toBe(300);
        expect(transform.scale).toBeGreaterThan(panoramic.scale);
        expect(transform.scale).toBeCloseTo(984 / 40, 12);
        expectAllInsideViewport(BATTLE_POINTS, transform, VIEWPORT);
    });

    it('never fits a full-map point set below the panoramic scale', () => {
        const corners = mapCorners(1000, 1000);
        const transform = fitTransform(boxOf(corners), VIEWPORT, CAMERA);
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, CAMERA);

        expect(transform.scale).toBeGreaterThanOrEqual(
            panoramic.scale - EPSILON
        );
        expectAllInsideViewport(corners, transform, VIEWPORT);
    });

    it('caps a single-point battle at maxScale', () => {
        const capped: ICameraConfig = { ...CAMERA, maxScale: 5 };
        const transform = fitTransform(
            boxOf([{ x: 500, y: 500 }]),
            VIEWPORT,
            capped
        );

        expect(transform.scale).toBe(5);
    });

    it('returns a finite fallback for a degenerate box and viewport', () => {
        const degenerate: IFitBox = {
            minX: Number.NaN,
            maxX: Number.POSITIVE_INFINITY,
            minY: Number.NEGATIVE_INFINITY,
            maxY: Number.NaN
        };
        const guarded: ICameraConfig = {
            ...CAMERA,
            minScale: Number.NaN,
            maxScale: Number.NaN
        };
        const transform = fitTransform(
            degenerate,
            { width: 0, height: 0 },
            guarded
        );

        expectFiniteTransform(transform);
        expect(transform.scale).toBeGreaterThan(0);
    });
});

describe('render/camera-math — tracking never teleports', () => {
    it('converges without landing in one frame and never overshoots', () => {
        const from = strategicTransform(BOUNDS, VIEWPORT, CAMERA);
        const to = fitTransform(boxOf(BATTLE_POINTS), VIEWPORT, CAMERA);
        const alpha = 1 - Math.exp(-1 / Math.max(1, CAMERA.smoothingFrames));

        expect(alpha).toBeGreaterThan(0);
        expect(alpha).toBeLessThan(1);

        let current = from;
        for (let frame = 0; frame < 10; frame += 1) {
            const next = trackTransform(current, to, CAMERA);
            const remaining = Math.hypot(
                to.centerX - current.centerX,
                to.centerY - current.centerY
            );
            const moved = Math.hypot(
                next.centerX - current.centerX,
                next.centerY - current.centerY
            );

            expectFiniteTransform(next);
            expect(moved).toBeLessThan(remaining + EPSILON);
            current = next;
        }

        expect(Math.abs(current.centerX - to.centerX)).toBeGreaterThan(1e-6);
        expect(Math.abs(current.scale - to.scale)).toBeGreaterThan(1e-6);
    });
});

describe('render/camera-math — fixed-length transition interpolation', () => {
    it('returns the exact endpoints and a monotonic log-space scale', () => {
        const from = strategicTransform(BOUNDS, VIEWPORT, CAMERA);
        const to = fitTransform(boxOf(BATTLE_POINTS), VIEWPORT, CAMERA);
        const start = interpolateTransform(from, to, 0);
        const end = interpolateTransform(from, to, 1);
        const quarter = interpolateTransform(from, to, 0.25);
        const middle = interpolateTransform(from, to, 0.5);

        expect(start.centerX).toBe(from.centerX);
        expect(start.centerY).toBe(from.centerY);
        expect(start.scale).toBe(from.scale);
        expect(end.centerX).toBeCloseTo(to.centerX, 12);
        expect(end.centerY).toBeCloseTo(to.centerY, 12);
        expect(end.scale).toBeCloseTo(to.scale, 12);

        expect(middle.centerX).toBeGreaterThan(to.centerX);
        expect(middle.centerX).toBeLessThan(from.centerX);
        expect(quarter.scale).toBeGreaterThan(from.scale);
        expect(quarter.scale).toBeLessThan(middle.scale);
        expect(middle.scale).toBeLessThan(end.scale);
    });
});

describe('render/camera-math — interpolation helpers', () => {
    it('lerps and falls back to the start for a non-finite t', () => {
        expect(lerp(10, 20, 0.5)).toBe(15);
        expect(lerp(10, 20, Number.NaN)).toBe(10);
        expect(lerp(10, 20, Number.POSITIVE_INFINITY)).toBe(10);
        expect(lerp(10, 20, 2)).toBe(20);
        expect(lerp(10, 20, -2)).toBe(10);
        expect(lerp(Number.NaN, 20, 0.5)).toBe(10);
    });

    it('smoothsteps between the edges and degrades to a step', () => {
        expect(smoothstep(0, 1, -1)).toBe(0);
        expect(smoothstep(0, 1, 2)).toBe(1);
        expect(smoothstep(0, 1, 0.5)).toBeCloseTo(0.5, 12);
        expect(smoothstep(10, 5, 6)).toBe(1);
        expect(smoothstep(10, 5, 4)).toBe(0);
        expect(smoothstep(Number.NaN, Number.NaN, Number.NaN)).toBe(0);
    });

    it('eases in and out with exact endpoints', () => {
        expect(easeInOutCubic(0)).toBe(0);
        expect(easeInOutCubic(1)).toBe(1);
        expect(easeInOutCubic(0.5)).toBeCloseTo(0.5, 12);
        expect(easeInOutCubic(-1)).toBe(0);
        expect(easeInOutCubic(2)).toBe(1);
        expect(easeInOutCubic(0.25)).toBeLessThan(0.25);
        expect(easeInOutCubic(0.75)).toBeGreaterThan(0.75);
    });
});

describe('render/camera-math — world and screen mapping', () => {
    /** 一个非平凡变换：中心不在原点、缩放也不为 1。 */
    const TRANSFORM: ICameraTransform = {
        centerX: 420,
        centerY: 610,
        scale: 3.25,
        shakeX: 0,
        shakeY: 0
    };

    it('round-trips a world point through the screen and back', () => {
        const point: IVec2 = { x: 397.25, y: 623.5 };
        const screen = worldToScreen(point, TRANSFORM, VIEWPORT);
        const roundTrip = screenToWorld(screen, TRANSFORM, VIEWPORT);

        expect(roundTrip.x).toBeCloseTo(point.x, 9);
        expect(roundTrip.y).toBeCloseTo(point.y, 9);
    });

    it('separates the shake offset so picking never drifts', () => {
        const point: IVec2 = { x: 400, y: 600 };
        const shaken: ICameraTransform = {
            ...TRANSFORM,
            shakeX: 6,
            shakeY: -4
        };
        const steady = worldToScreen(point, TRANSFORM, VIEWPORT);
        const shifted = worldToScreen(point, shaken, VIEWPORT);

        expect(shifted.x).toBeCloseTo(steady.x + 6, 12);
        expect(shifted.y).toBeCloseTo(steady.y - 4, 12);

        const back = screenToWorld(shifted, shaken, VIEWPORT);
        expect(back.x).toBeCloseTo(point.x, 9);
        expect(back.y).toBeCloseTo(point.y, 9);
    });

    it('maps the camera centre to the viewport centre', () => {
        const panoramic = strategicTransform(BOUNDS, VIEWPORT, CAMERA);
        const centre = worldToScreen(
            { x: panoramic.centerX, y: panoramic.centerY },
            panoramic,
            VIEWPORT
        );

        expect(centre.x).toBeCloseTo(VIEWPORT.width / 2, 9);
        expect(centre.y).toBeCloseTo(VIEWPORT.height / 2, 9);
    });

    it('keeps the world y axis unflipped', () => {
        const base: ICameraTransform = {
            centerX: 0,
            centerY: 0,
            scale: 2,
            shakeX: 0,
            shakeY: 0
        };
        const low = worldToScreen({ x: 0, y: 10 }, base, VIEWPORT);
        const high = worldToScreen({ x: 0, y: 20 }, base, VIEWPORT);

        expect(high.y).toBeGreaterThan(low.y);
    });

    it('returns a finite fallback for a degenerate transform', () => {
        const broken: ICameraTransform = {
            centerX: 5,
            centerY: 7,
            scale: 0,
            shakeX: 0,
            shakeY: 0
        };

        expect(worldToScreen({ x: 1, y: 1 }, broken, VIEWPORT)).toEqual({
            x: VIEWPORT.width / 2,
            y: VIEWPORT.height / 2
        });
        expect(screenToWorld({ x: 1, y: 1 }, broken, VIEWPORT)).toEqual({
            x: 5,
            y: 7
        });

        const zeroViewport: IViewport = { width: 0, height: 0 };
        const fallback = strategicTransform(BOUNDS, zeroViewport, CAMERA);
        const screen = worldToScreen({ x: 1, y: 1 }, fallback, zeroViewport);

        expect(Number.isFinite(screen.x)).toBe(true);
        expect(Number.isFinite(screen.y)).toBe(true);
    });
});
