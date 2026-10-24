import { describe, expect, it } from 'vitest';

import { DEFAULT_GEOMETRY } from '@/physics/constants';
import {
    CULL_MARGIN_METERS,
    DEFAULT_RENDER_CONFIG,
    FALLBACK_FACTION_COLORS,
    FLASH_RING_OFFSET_METERS,
    MAX_BUFFERED_DAMAGE_EVENTS,
    MAX_CANVAS_DIMENSION,
    MAX_FRAME_DELAY_MS,
    MIN_CANVAS_DIMENSION,
    MIN_FRAME_DELAY_MS,
    validateRenderConfig
} from '@/render/constants';
import type { IRenderConfig } from '@/render/types';

/** 一条非法配置样例：名称、配置对象与期望出现在错误信息中的字段名。 */
interface IInvalidCase {
    /** 样例名称（断言失败时定位用）。 */
    readonly name: string;
    /** 待校验的配置。 */
    readonly config: IRenderConfig;
    /** 错误信息中必须出现的字段名模式。 */
    readonly field: RegExp;
}

/** 覆盖单一顶层字段，其余沿用已发布的默认配置。 */
function withTopLevel(patch: Partial<IRenderConfig>): IRenderConfig {
    return { ...DEFAULT_RENDER_CONFIG, ...patch };
}

const defaultCamera = DEFAULT_RENDER_CONFIG.camera;
const defaultHud = DEFAULT_RENDER_CONFIG.hud;
const defaultPalette = DEFAULT_RENDER_CONFIG.palette;
const defaultGeometry = DEFAULT_RENDER_CONFIG.geometry;
const defaultEffects = DEFAULT_RENDER_CONFIG.effects;

const invalidCases: readonly IInvalidCase[] = [
    {
        name: 'zero width',
        config: withTopLevel({ width: 0 }),
        field: /width/
    },
    {
        name: 'NaN width',
        config: withTopLevel({ width: Number.NaN }),
        field: /width/
    },
    {
        name: 'oversized width',
        config: withTopLevel({ width: MAX_CANVAS_DIMENSION + 1 }),
        field: /width/
    },
    {
        name: 'NaN outputFps',
        config: withTopLevel({ outputFps: Number.NaN }),
        field: /outputFps/
    },
    {
        name: 'negative frameDelayMs',
        config: withTopLevel({ frameDelayMs: -1 }),
        field: /frameDelayMs/
    },
    {
        name: 'over-cap frameDelayMs',
        config: withTopLevel({ frameDelayMs: MAX_FRAME_DELAY_MS + 1 }),
        field: /frameDelayMs/
    },
    {
        name: 'coverage 0',
        config: withTopLevel({
            camera: { ...defaultCamera, coverage: 0 }
        }),
        field: /camera\.coverage/
    },
    {
        name: 'coverage 1.5',
        config: withTopLevel({
            camera: { ...defaultCamera, coverage: 1.5 }
        }),
        field: /camera\.coverage/
    },
    {
        name: 'screenScaleAt equals worldScaleAt',
        config: withTopLevel({
            hud: { ...defaultHud, screenScaleAt: 10, worldScaleAt: 10 }
        }),
        field: /hud\.screenScaleAt/
    },
    {
        name: 'worldScaleAt above screenScaleAt',
        config: withTopLevel({
            hud: { ...defaultHud, screenScaleAt: 10, worldScaleAt: 25 }
        }),
        field: /hud\.screenScaleAt/
    },
    {
        name: 'non-integer palette colour',
        config: withTopLevel({
            palette: { ...defaultPalette, grid: 1.5 }
        }),
        field: /palette\.grid/
    },
    {
        name: 'palette colour above 0xffffff',
        config: withTopLevel({
            palette: { ...defaultPalette, background: 0x1000000 }
        }),
        field: /palette\.background/
    },
    {
        name: 'zero bodyRadius',
        config: withTopLevel({
            geometry: { ...defaultGeometry, bodyRadius: 0 }
        }),
        field: /geometry\.bodyRadius/
    },
    {
        name: 'maxScale below minScale',
        config: withTopLevel({
            camera: { ...defaultCamera, minScale: 20, maxScale: 10 }
        }),
        field: /camera\.maxScale/
    },
    {
        name: 'panFrames 0',
        config: withTopLevel({
            camera: { ...defaultCamera, panFrames: 0 }
        }),
        field: /camera\.panFrames/
    },
    {
        name: 'zoomFrames 0',
        config: withTopLevel({
            camera: { ...defaultCamera, zoomFrames: 0 }
        }),
        field: /camera\.zoomFrames/
    },
    {
        name: 'weightScale 0',
        config: withTopLevel({
            camera: { ...defaultCamera, weightScale: 0 }
        }),
        field: /camera\.weightScale/
    },
    {
        name: 'flashFrames 0',
        config: withTopLevel({
            effects: { ...defaultEffects, flashFrames: 0 }
        }),
        field: /effects\.flashFrames/
    },
    {
        name: 'maxParticles 0',
        config: withTopLevel({
            effects: { ...defaultEffects, maxParticles: 0 }
        }),
        field: /effects\.maxParticles/
    }
];

describe('render/constants — shipped default config', () => {
    it('passes validateRenderConfig unchanged', () => {
        expect(() => validateRenderConfig(DEFAULT_RENDER_CONFIG)).not.toThrow();
    });

    it('pins the documented canvas, output fps and runner delay', () => {
        expect(DEFAULT_RENDER_CONFIG.width).toBe(1920);
        expect(DEFAULT_RENDER_CONFIG.height).toBe(1080);
        expect(DEFAULT_RENDER_CONFIG.outputFps).toBe(30);
        expect(DEFAULT_RENDER_CONFIG.frameDelayMs).toBe(33);
    });

    it('pins the decision-critical camera, HUD and effects values', () => {
        expect(DEFAULT_RENDER_CONFIG.camera.coverage).toBe(0.9);
        expect(DEFAULT_RENDER_CONFIG.camera.minSpanMeters).toBe(12);
        expect(DEFAULT_RENDER_CONFIG.hud.healthBarSeconds).toBe(15);
        expect(DEFAULT_RENDER_CONFIG.hud.alwaysVisibleBelowUnits).toBe(6);
        expect(DEFAULT_RENDER_CONFIG.effects.damageNumberThreshold).toBe(50);
        expect(DEFAULT_RENDER_CONFIG.hud.screenScaleAt).toBeGreaterThan(
            DEFAULT_RENDER_CONFIG.hud.worldScaleAt
        );
    });

    it('ships a 24 + 6 frame two-phase transition with shake switched off', () => {
        const camera = DEFAULT_RENDER_CONFIG.camera;
        expect(camera.panFrames).toBe(24);
        expect(camera.zoomFrames).toBe(6);
        // 落地更新序号：段首即 t = 0，故总更新次数是 panFrames + zoomFrames - 1。
        expect(camera.panFrames + camera.zoomFrames - 1).toBe(29);
        expect(camera.panFrames / DEFAULT_RENDER_CONFIG.outputFps).toBeCloseTo(
            0.8,
            6
        );
        expect(camera.zoomFrames / DEFAULT_RENDER_CONFIG.outputFps).toBeCloseTo(
            0.2,
            6
        );
        expect(camera.shakeAmplitudePx).toBe(0);
        expect(camera.shakeDecayPerFrame).toBeGreaterThan(0);
        // 等级和达到 weightScale 时跟随平滑帧数减半，故它必须为正。
        expect(camera.weightScale).toBe(20);
    });

    it('keeps the faction table configurable rather than baked in', () => {
        expect(DEFAULT_RENDER_CONFIG.factionColors[1]).toBe(0xd0342c);
        expect(DEFAULT_RENDER_CONFIG.factionColors[2]).toBe(0x2f6fe0);
        expect(FALLBACK_FACTION_COLORS.length).toBeGreaterThan(0);
        for (const color of FALLBACK_FACTION_COLORS) {
            expect(Number.isInteger(color)).toBe(true);
            expect(color).toBeGreaterThanOrEqual(0);
            expect(color).toBeLessThanOrEqual(0xffffff);
        }
    });

    it('reuses the frozen physics geometry instead of copying numbers', () => {
        expect(DEFAULT_RENDER_CONFIG.geometry).toBe(DEFAULT_GEOMETRY);
    });

    it('exports the culling and flash constants consumed by later plans', () => {
        expect(Number.isFinite(CULL_MARGIN_METERS)).toBe(true);
        expect(CULL_MARGIN_METERS).toBeGreaterThanOrEqual(0);
        expect(Number.isFinite(FLASH_RING_OFFSET_METERS)).toBe(true);
        expect(FLASH_RING_OFFSET_METERS).toBeGreaterThan(0);
    });

    it('exports ordered frame-delay and canvas bounds for the runner', () => {
        expect(MIN_FRAME_DELAY_MS).toBeLessThan(MAX_FRAME_DELAY_MS);
        expect(MIN_CANVAS_DIMENSION).toBeLessThan(MAX_CANVAS_DIMENSION);
        expect(Number.isInteger(MAX_BUFFERED_DAMAGE_EVENTS)).toBe(true);
        expect(MAX_BUFFERED_DAMAGE_EVENTS).toBeGreaterThan(0);
    });
});

describe('render/constants — validateRenderConfig rejection table', () => {
    it('throws a field-named error for every malformed class', () => {
        for (const { name, config, field } of invalidCases) {
            expect(() => validateRenderConfig(config), name).toThrow(field);
        }
    });

    it('names the offending field in the error message', () => {
        expect(() => validateRenderConfig(withTopLevel({ width: 0 }))).toThrow(
            /^validateRenderConfig: width /
        );
    });

    it('does not mutate the validated object', () => {
        const snapshot = structuredClone(DEFAULT_RENDER_CONFIG);
        validateRenderConfig(DEFAULT_RENDER_CONFIG);
        expect(DEFAULT_RENDER_CONFIG).toEqual(snapshot);
    });
});
