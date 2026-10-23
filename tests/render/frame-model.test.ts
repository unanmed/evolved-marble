import { describe, expect, it } from 'vitest';

import { FALLBACK_FACTION_COLORS } from '@/render/constants';
import {
    isUnitVisible,
    resolveFactionColor,
    resolveTargetPoints
} from '@/render/frameModel';
import type { ICameraTransform, ICullQuery, IViewport } from '@/render/types';
import type { IUnitState } from '@/physics/types';

import { makeBattle, makeLookup, makeUnitState } from './fakes';

/** 裁剪测试视口：1920×1080。 */
const VIEWPORT: IViewport = { width: 1920, height: 1080 };

/** 裁剪测试镜头：中心 (100, 200)、2 px/m、无震动（半宽 480 m、半高 270 m）。 */
const TRANSFORM: ICameraTransform = {
    centerX: 100,
    centerY: 200,
    scale: 2,
    shakeX: 0,
    shakeY: 0
};

/** 默认裁剪边距（米）。 */
const MARGIN = 4;

/** 默认中立色（0xRRGGBB）。 */
const NEUTRAL = 0x8a8f98;

/**
 * 构造一个裁剪查询，允许逐项覆盖。
 * @param x 世界 x 坐标（米）。
 * @param y 世界 y 坐标（米）。
 * @param overrides 需要覆盖的字段。
 * @returns 完整的 `ICullQuery`。
 */
function cullQuery(
    x: number,
    y: number,
    overrides: Partial<ICullQuery> = {}
): ICullQuery {
    return {
        x,
        y,
        transform: TRANSFORM,
        viewport: VIEWPORT,
        marginMeters: MARGIN,
        ...overrides
    };
}

describe('render/frame-model — resolveTargetPoints', () => {
    it('returns living member positions in member order with values unchanged', () => {
        const states = new Map<number, IUnitState>([
            [11, makeUnitState(5, -6, 0.25)],
            [7, makeUnitState(1, 2)],
            [9, makeUnitState(-3, 4)]
        ]);

        const points = resolveTargetPoints(
            makeBattle([11, 7, 9]),
            makeLookup(states)
        );

        expect(points).toEqual([
            { x: 5, y: -6 },
            { x: 1, y: 2 },
            { x: -3, y: 4 }
        ]);
    });

    it('skips members whose physics state is missing', () => {
        const states = new Map<number, IUnitState>([
            [7, makeUnitState(1, 2)],
            [11, makeUnitState(5, -6)]
        ]);

        expect(
            resolveTargetPoints(makeBattle([7, 9, 11]), makeLookup(states))
        ).toEqual([
            { x: 1, y: 2 },
            { x: 5, y: -6 }
        ]);
    });

    it('skips members with non-finite coordinates', () => {
        const states = new Map<number, IUnitState>([
            [1, makeUnitState(Number.NaN, 2)],
            [2, makeUnitState(3, Number.POSITIVE_INFINITY)],
            [3, makeUnitState(4, 5)]
        ]);

        expect(
            resolveTargetPoints(makeBattle([1, 2, 3]), makeLookup(states))
        ).toEqual([{ x: 4, y: 5 }]);
    });

    it('returns an empty array for a battle with no resolvable members', () => {
        expect(
            resolveTargetPoints(makeBattle([]), makeLookup(new Map()))
        ).toEqual([]);
    });

    it('returns a fresh array on every call', () => {
        const states = new Map<number, IUnitState>([[1, makeUnitState(1, 1)]]);
        const battle = makeBattle([1]);

        const first = resolveTargetPoints(battle, makeLookup(states));
        const second = resolveTargetPoints(battle, makeLookup(states));

        expect(first).not.toBe(second);
        expect(second).toEqual(first);
    });
});

describe('render/frame-model — resolveFactionColor', () => {
    it('returns the configured colour for a known faction id', () => {
        expect(
            resolveFactionColor(1, { 1: 0xd0342c, 2: 0x2f6fe0 }, NEUTRAL)
        ).toBe(0xd0342c);
        expect(
            resolveFactionColor(2, { 1: 0xd0342c, 2: 0x2f6fe0 }, NEUTRAL)
        ).toBe(0x2f6fe0);
    });

    it('maps an unconfigured id deterministically onto the fallback table', () => {
        const expected =
            FALLBACK_FACTION_COLORS[5 % FALLBACK_FACTION_COLORS.length];
        const first = resolveFactionColor(5, {}, NEUTRAL);

        expect(first).toBe(expected);
        expect(resolveFactionColor(5, {}, NEUTRAL)).toBe(first);
        expect(resolveFactionColor(-5, {}, NEUTRAL)).toBe(first);
    });

    it('returns the neutral colour for an absent or non-finite id', () => {
        expect(resolveFactionColor(undefined, { 1: 0xd0342c }, NEUTRAL)).toBe(
            NEUTRAL
        );
        expect(resolveFactionColor(Number.NaN, { 1: 0xd0342c }, NEUTRAL)).toBe(
            NEUTRAL
        );
        expect(
            resolveFactionColor(
                Number.POSITIVE_INFINITY,
                { 1: 0xd0342c },
                NEUTRAL
            )
        ).toBe(NEUTRAL);
    });

    it('returns the neutral colour when no fallback table exists', () => {
        expect(resolveFactionColor(3, {}, NEUTRAL, [])).toBe(NEUTRAL);
    });

    it('ignores malformed configured values instead of returning them', () => {
        expect(resolveFactionColor(1, { 1: Number.NaN }, NEUTRAL)).toBe(
            NEUTRAL
        );
        expect(resolveFactionColor(1, { 1: 0x1000000 }, NEUTRAL)).toBe(NEUTRAL);
        expect(resolveFactionColor(1, { 1: -1 }, NEUTRAL)).toBe(NEUTRAL);
        expect(resolveFactionColor(1, { 1: 1.5 }, NEUTRAL)).toBe(NEUTRAL);
    });
});

describe('render/frame-model — isUnitVisible', () => {
    it('keeps the viewport centre and the inclusive boundary visible', () => {
        expect(isUnitVisible(cullQuery(100, 200))).toBe(true);
        expect(isUnitVisible(cullQuery(100 + 480 + MARGIN, 200))).toBe(true);
        expect(isUnitVisible(cullQuery(100 - 480 - MARGIN, 200))).toBe(true);
        expect(isUnitVisible(cullQuery(100, 200 + 270 + MARGIN))).toBe(true);
        expect(isUnitVisible(cullQuery(100, 200 - 270 - MARGIN))).toBe(true);
    });

    it('keeps a point just inside the margin visible and hides one just outside', () => {
        expect(isUnitVisible(cullQuery(100 + 483.5, 200))).toBe(true);
        expect(isUnitVisible(cullQuery(100 + 484.5, 200))).toBe(false);
        expect(isUnitVisible(cullQuery(100, 200 + 273.5))).toBe(true);
        expect(isUnitVisible(cullQuery(100, 200 + 274.5))).toBe(false);
    });

    it('hides non-finite coordinates and non-finite margins', () => {
        expect(isUnitVisible(cullQuery(Number.NaN, 200))).toBe(false);
        expect(isUnitVisible(cullQuery(100, Number.POSITIVE_INFINITY))).toBe(
            false
        );
        expect(
            isUnitVisible(cullQuery(100, 200, { marginMeters: Number.NaN }))
        ).toBe(false);
    });

    it('hides every point when the scale is non-positive', () => {
        expect(
            isUnitVisible(
                cullQuery(100, 200, {
                    transform: { ...TRANSFORM, scale: 0 }
                })
            )
        ).toBe(false);
        expect(
            isUnitVisible(
                cullQuery(100, 200, {
                    transform: { ...TRANSFORM, scale: -2 }
                })
            )
        ).toBe(false);
    });

    it('hides every point when a viewport dimension is non-positive', () => {
        expect(
            isUnitVisible(
                cullQuery(100, 200, { viewport: { width: 0, height: 1080 } })
            )
        ).toBe(false);
        expect(
            isUnitVisible(
                cullQuery(100, 200, { viewport: { width: 1920, height: 0 } })
            )
        ).toBe(false);
    });

    it('treats a negative margin as zero', () => {
        expect(
            isUnitVisible(cullQuery(100 + 480, 200, { marginMeters: -10 }))
        ).toBe(true);
        expect(
            isUnitVisible(cullQuery(100 + 480.5, 200, { marginMeters: -10 }))
        ).toBe(false);
    });

    it('hides points when the camera centre is non-finite', () => {
        expect(
            isUnitVisible(
                cullQuery(100, 200, {
                    transform: { ...TRANSFORM, centerX: Number.NaN }
                })
            )
        ).toBe(false);
    });
});
