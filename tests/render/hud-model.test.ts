import { describe, expect, it } from 'vitest';

import { DEFAULT_RENDER_CONFIG } from '@/render/constants';
import {
    computeHudScale,
    computeShakeImpulsePx,
    healthRatio,
    isHealthVisible,
    pruneTimers,
    registerDamage
} from '@/render/hudModel';
import type {
    ICameraConfig,
    IEffectsConfig,
    IHudConfig,
    IHudTimers,
    IRenderDamageEvent
} from '@/render/types';
import { ColliderPart } from '@/physics/types';

/** 默认 HUD 参数（15 秒、少于 6 单位常亮、14 m / 36 px 血条）。 */
const HUD: IHudConfig = DEFAULT_RENDER_CONFIG.hud;

/** 默认反馈预算（震动伤害阈值 40）。 */
const EFFECTS: IEffectsConfig = DEFAULT_RENDER_CONFIG.effects;

/** 默认镜头参数（震动幅度 8 px）。 */
const CAMERA: ICameraConfig = DEFAULT_RENDER_CONFIG.camera;

/** 默认血条秒数（15）。 */
const HEALTH_SECONDS = HUD.healthBarSeconds;

/**
 * 创建空的 HUD 计时工作状态。
 * @returns 全新的 `IHudTimers`。
 */
function makeTimers(): IHudTimers {
    return { visibleUntil: new Map<number, number>() };
}

/**
 * 构造一条伤害事件，允许逐项覆盖。
 * @param overrides 需要覆盖的字段。
 * @returns 完整的 `IRenderDamageEvent`。
 */
function damageEvent(
    overrides: Partial<IRenderDamageEvent> = {}
): IRenderDamageEvent {
    return {
        attackerId: 1,
        defenderId: 2,
        attackerTeamId: 1,
        defenderTeamId: 2,
        damage: 10,
        defenderPart: ColliderPart.Body,
        weaponKind: undefined,
        armorKind: undefined,
        x: 0,
        y: 0,
        level: 1,
        killed: false,
        ...overrides
    };
}

describe('render/hud-model — healthRatio', () => {
    it('returns the clamped fraction for ordinary values', () => {
        expect(healthRatio(200, 200)).toBe(1);
        expect(healthRatio(100, 200)).toBe(0.5);
        expect(healthRatio(0, 200)).toBe(0);
    });

    it('clamps negative health and health above the maximum', () => {
        expect(healthRatio(-40, 200)).toBe(0);
        expect(healthRatio(500, 200)).toBe(1);
    });

    it('returns 0 for a non-positive or non-finite maximum and NaN health', () => {
        expect(healthRatio(100, 0)).toBe(0);
        expect(healthRatio(100, -5)).toBe(0);
        expect(healthRatio(100, Number.NaN)).toBe(0);
        expect(healthRatio(Number.NaN, 200)).toBe(0);
        expect(healthRatio(Number.POSITIVE_INFINITY, 200)).toBe(0);
    });
});

describe('render/hud-model — registerDamage and isHealthVisible', () => {
    it('keeps the bar visible for exactly 450 frames at 30 fps', () => {
        const timers = makeTimers();
        registerDamage(timers, [damageEvent()], 10, 30, HEALTH_SECONDS);

        const lastVisible = 10 + 30 * HEALTH_SECONDS - 1;
        expect(
            isHealthVisible(
                2,
                timers,
                lastVisible,
                6,
                HUD.alwaysVisibleBelowUnits
            )
        ).toBe(true);
        expect(
            isHealthVisible(
                2,
                timers,
                lastVisible + 1,
                6,
                HUD.alwaysVisibleBelowUnits
            )
        ).toBe(false);
    });

    it('keeps the bar visible for exactly 225 frames at 15 fps', () => {
        const timers = makeTimers();
        registerDamage(timers, [damageEvent()], 10, 15, HEALTH_SECONDS);

        const lastVisible = 10 + 15 * HEALTH_SECONDS - 1;
        expect(
            isHealthVisible(
                2,
                timers,
                lastVisible,
                6,
                HUD.alwaysVisibleBelowUnits
            )
        ).toBe(true);
        expect(
            isHealthVisible(
                2,
                timers,
                lastVisible + 1,
                6,
                HUD.alwaysVisibleBelowUnits
            )
        ).toBe(false);
    });

    it('resets the deadline on a second hit instead of accumulating', () => {
        const timers = makeTimers();
        registerDamage(timers, [damageEvent()], 10, 30, HEALTH_SECONDS);
        registerDamage(timers, [damageEvent()], 100, 30, HEALTH_SECONDS);

        expect(timers.visibleUntil.get(2)).toBe(100 + 30 * HEALTH_SECONDS);
        expect(
            isHealthVisible(2, timers, 100 + 30 * HEALTH_SECONDS - 1, 6, 6)
        ).toBe(true);
        expect(
            isHealthVisible(2, timers, 100 + 30 * HEALTH_SECONDS, 6, 6)
        ).toBe(false);
    });

    it('removes the entry immediately on a killing blow', () => {
        const timers = makeTimers();
        registerDamage(timers, [damageEvent()], 10, 30, HEALTH_SECONDS);
        registerDamage(
            timers,
            [damageEvent({ killed: true })],
            20,
            30,
            HEALTH_SECONDS
        );

        expect(timers.visibleUntil.has(2)).toBe(false);
        expect(isHealthVisible(2, timers, 20, 6, 6)).toBe(false);
    });

    it('shows every bar unconditionally below the threshold and requires a timer at it', () => {
        const timers = makeTimers();
        const below = HUD.alwaysVisibleBelowUnits - 1;

        expect(isHealthVisible(2, timers, 0, below, 6)).toBe(true);
        expect(isHealthVisible(2, timers, 0, 6, 6)).toBe(false);

        registerDamage(timers, [damageEvent()], 0, 30, HEALTH_SECONDS);
        expect(isHealthVisible(2, timers, 0, 6, 6)).toBe(true);
        expect(isHealthVisible(2, timers, 30 * HEALTH_SECONDS, 6, 6)).toBe(
            false
        );
    });
});

describe('render/hud-model — pruneTimers', () => {
    it('keeps entries for live units and removes the rest', () => {
        const timers = makeTimers();
        timers.visibleUntil.set(1, 100);
        timers.visibleUntil.set(2, 100);

        pruneTimers(timers, [1]);
        expect([...timers.visibleUntil.keys()]).toEqual([1]);

        pruneTimers(timers, []);
        expect(timers.visibleUntil.size).toBe(0);
    });

    it('keeps both entries when both units are live', () => {
        const timers = makeTimers();
        timers.visibleUntil.set(1, 100);
        timers.visibleUntil.set(2, 200);

        pruneTimers(timers, [1, 2]);
        expect(timers.visibleUntil.get(1)).toBe(100);
        expect(timers.visibleUntil.get(2)).toBe(200);
    });
});

describe('render/hud-model — computeHudScale', () => {
    it('is exactly 1 at the world-sized endpoint and below it', () => {
        expect(computeHudScale(HUD.worldScaleAt, HUD)).toBe(1);
        expect(computeHudScale(HUD.worldScaleAt / 2, HUD)).toBe(1);
    });

    it('is the screen-constant factor at and above the screen endpoint', () => {
        const expected =
            HUD.screenBarWidthPx / HUD.barWorldWidth / HUD.screenScaleAt;

        expect(computeHudScale(HUD.screenScaleAt, HUD)).toBeCloseTo(
            expected,
            9
        );
        expect(computeHudScale(HUD.screenScaleAt * 2, HUD)).toBeCloseTo(
            HUD.screenBarWidthPx / HUD.barWorldWidth / (HUD.screenScaleAt * 2),
            9
        );
    });

    it('keeps the screen-pixel width non-decreasing and endpoint-exact', () => {
        const scales = [
            HUD.worldScaleAt,
            12,
            15,
            18,
            HUD.screenScaleAt,
            HUD.screenScaleAt + 5,
            HUD.screenScaleAt * 2
        ];

        const widths = scales.map(
            scale => HUD.barWorldWidth * scale * computeHudScale(scale, HUD)
        );

        expect(widths[0]).toBeCloseTo(HUD.barWorldWidth * HUD.worldScaleAt, 9);
        expect(widths[0]).toBeCloseTo(14, 9);
        expect(widths[4]).toBeCloseTo(HUD.screenBarWidthPx, 9);
        expect(widths[4]).toBeCloseTo(36, 9);
        expect(widths[5]).toBeCloseTo(36, 9);
        expect(widths[6]).toBeCloseTo(36, 9);

        for (let i = 1; i < 5; i += 1) {
            expect(widths[i]).toBeGreaterThanOrEqual(widths[i - 1]);
        }
    });

    it('falls back to the world-sized factor for a non-positive or NaN scale', () => {
        expect(computeHudScale(0, HUD)).toBe(1);
        expect(computeHudScale(-3, HUD)).toBe(1);
        expect(computeHudScale(Number.NaN, HUD)).toBe(1);
    });
});

describe('render/hud-model — computeShakeImpulsePx', () => {
    it('returns 0 without events or below the damage threshold', () => {
        expect(computeShakeImpulsePx([], EFFECTS, CAMERA)).toBe(0);
        expect(
            computeShakeImpulsePx(
                [damageEvent({ damage: 10 })],
                EFFECTS,
                CAMERA
            )
        ).toBe(0);
    });

    it('returns the configured amplitude at the threshold and 3x at triple the threshold', () => {
        expect(
            computeShakeImpulsePx(
                [damageEvent({ damage: EFFECTS.shakeDamageThreshold })],
                EFFECTS,
                CAMERA
            )
        ).toBe(CAMERA.shakeAmplitudePx);
        expect(
            computeShakeImpulsePx(
                [damageEvent({ damage: EFFECTS.shakeDamageThreshold * 3 })],
                EFFECTS,
                CAMERA
            )
        ).toBe(CAMERA.shakeAmplitudePx * 3);
    });

    it('triggers on a kill even when the applied damage is low', () => {
        const impulse = computeShakeImpulsePx(
            [damageEvent({ damage: 1, killed: true })],
            EFFECTS,
            CAMERA
        );

        expect(impulse).toBe(CAMERA.shakeAmplitudePx);
    });

    it('uses the largest damage of the frame and never exceeds the 3x cap', () => {
        const impulse = computeShakeImpulsePx(
            [
                damageEvent({ damage: 5 }),
                damageEvent({ damage: EFFECTS.shakeDamageThreshold * 10 })
            ],
            EFFECTS,
            CAMERA
        );

        expect(impulse).toBe(CAMERA.shakeAmplitudePx * 3);
        expect(impulse).toBeLessThanOrEqual(CAMERA.shakeAmplitudePx * 3);
    });

    it('is finite for NaN damage and for a zero threshold', () => {
        const nanDamage = computeShakeImpulsePx(
            [damageEvent({ damage: Number.NaN })],
            EFFECTS,
            CAMERA
        );
        expect(Number.isFinite(nanDamage)).toBe(true);
        expect(nanDamage).toBe(0);

        const zeroThreshold = computeShakeImpulsePx(
            [damageEvent({ damage: 10 })],
            { ...EFFECTS, shakeDamageThreshold: 0 },
            CAMERA
        );
        expect(Number.isFinite(zeroThreshold)).toBe(true);
        expect(zeroThreshold).toBeLessThanOrEqual(CAMERA.shakeAmplitudePx * 3);
    });
});
