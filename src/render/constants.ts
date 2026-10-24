/**
 * 渲染层唯一的调参入口（D-20）：画布、输出帧率、阵营色表、调色板、
 * 镜头、HUD 与特效预算全部集中在此。
 * 本文件只含带 JSDoc 的类型化顶层 `const` 与一个校验函数，
 * 无类、无 Pixi 引用、无 Rapier 构造；其他模块不得再写视觉/时序默认值。
 */

import { DEFAULT_GEOMETRY } from '@/physics/constants';
import type {
    ICameraConfig,
    IEffectsConfig,
    IHudConfig,
    IRenderConfig,
    IRenderPalette
} from '@/render/types';

/**
 * 输出帧率的校验上限（帧/秒）：仅作为输入合法性边界（ASVS V5），
 * 不是循环节流或性能目标（D-01/D-17）。
 */
const MAX_OUTPUT_FPS = 240;

/**
 * 阵营未知时的回退颜色表（六个高饱和色，D-05）：
 * 当势力 id 不在 `factionColors` 中时，按 id 取模选取，
 * 保证任何势力都有可辨识的颜色而不是落回中性色。
 */
export const FALLBACK_FACTION_COLORS: readonly number[] = [
    0xff3b30, 0x34c759, 0x0a84ff, 0xffd60a, 0xff2d95, 0xbf5af2
];

/**
 * 伤害旁路缓冲上限（事件数，D-06）：超出后丢弃最旧事件，
 * 防止单帧内事件流无限增长（`DamageTap` 消费）。
 */
export const MAX_BUFFERED_DAMAGE_EVENTS = 512;

/**
 * 每帧延时的下限（毫秒）：0 表示让出事件循环后立即推进下一帧。
 */
export const MIN_FRAME_DELAY_MS = 0;

/**
 * 每帧延时的上限（毫秒）：操作者面板的速度滑杆按此钳制（D-12/D-17）。
 */
export const MAX_FRAME_DELAY_MS = 1000;

/**
 * 画布边长的下限（像素）：低于此值无法容纳 HUD 信息条。
 */
export const MIN_CANVAS_DIMENSION = 16;

/**
 * 画布边长的上限（像素）：超出即拒绝，防止异常配置驱动超大画布分配。
 */
export const MAX_CANVAS_DIMENSION = 3840;

/**
 * 视口裁剪的边距（米，D-01）：`Renderer` 调用 `isUnitVisible` 时使用，
 * 使刚离开视口的单位不会在边缘突然消失。
 */
export const CULL_MARGIN_METERS = 4;

/**
 * 受击闪白圆环相对 `geometry.armorRadius` 的外扩量（米，D-06）：
 * 让闪白环包住防具而不与本体几何重叠。
 */
export const FLASH_RING_OFFSET_METERS = 0.08;

/**
 * 暗底高饱和调色板（D-05）：单位与特效是画面中最跳的元素，
 * 背景/地面/网格/地形保持低饱和。
 */
const PALETTE: IRenderPalette = {
    background: 0x0b0d10,
    mapFloor: 0x151a20,
    grid: 0x1f2730,
    terrain: 0x232a26,
    text: 0xe8edf2,
    healthBackground: 0x2a2f3a,
    healthBorder: 0x0b0d12,
    weapon: 0xc9d3dd,
    armor: 0x8f9aa8,
    flash: 0xffffff,
    neutral: 0x8a8f98
};

/**
 * 镜头参数（D-06/D-14/D-21）：拟合边距、目标构图比例、缩放下限/上限、
 * 平滑与两段式过渡（先平移、后推拉）的帧数、震动幅度与衰减。
 * `minScale` 不超过全景拟合缩放，实际下限由 `Camera` 推导。
 * `shakeAmplitudePx` 为 0：受击震动已按 UAT 反馈关闭，代码路径保留以便随时恢复。
 */
const CAMERA: ICameraConfig = {
    paddingPx: 48,
    coverage: 0.9,
    minSpanMeters: 12,
    minScale: 0.5,
    maxScale: 48,
    smoothingFrames: 10,
    panFrames: 24,
    zoomFrames: 6,
    shakeAmplitudePx: 0,
    shakeDecayPerFrame: 0.86
};

/**
 * HUD 参数（D-07/D-08/D-09/D-11/D-23）：15 秒血条、少于 6 单位常亮、
 * 混合缩放阈值（`screenScaleAt` 必须严格大于 `worldScaleAt`）、
 * 等级世界高度与信息条排版。
 */
const HUD: IHudConfig = {
    healthBarSeconds: 15,
    alwaysVisibleBelowUnits: 6,
    barWorldWidth: 1.4,
    barWorldHeight: 0.16,
    barOffsetY: -0.95,
    screenBarWidthPx: 36,
    screenScaleAt: 20,
    worldScaleAt: 10,
    levelWorldHeight: 0.7,
    infoMarginPx: 28,
    infoFontSizePx: 28
};

/**
 * 反馈预算（D-06/D-10）：伤害数字阈值 50、各对象池上限、
 * 寿命与闪白帧数、镜头震动的伤害阈值。
 */
const EFFECTS: IEffectsConfig = {
    damageNumberThreshold: 50,
    damageNumberWorldHeight: 1.1,
    damageNumberLifetimeFrames: 45,
    damageNumberRiseMetersPerFrame: 0.02,
    maxDamageNumbers: 64,
    maxParticles: 256,
    particlesPerHit: 6,
    particleLifetimeFrames: 18,
    maxDeathEffects: 32,
    deathEffectLifetimeFrames: 30,
    flashFrames: 3,
    shakeDamageThreshold: 40
};

/**
 * 默认渲染配置（D-13/D-20）：1920×1080 画布、30 输出帧率、33 ms 默认帧延时。
 * `geometry` 直接复用物理层的 `DEFAULT_GEOMETRY`，使绘制的武器/防具足迹
 * 永不偏离 Rapier 胶囊体（Pitfall 15/Pitfall 22）。
 * `outputFps`/`frameDelayMs` 只是 HUD 换算与 runner 元数据，不是帧率契约。
 */
export const DEFAULT_RENDER_CONFIG: IRenderConfig = {
    width: 1920,
    height: 1080,
    outputFps: 30,
    frameDelayMs: 33,
    factionColors: { 1: 0xd0342c, 2: 0x2f6fe0 },
    geometry: DEFAULT_GEOMETRY,
    palette: PALETTE,
    camera: CAMERA,
    hud: HUD,
    effects: EFFECTS
};

/**
 * 抛出以 `validateRenderConfig:` 开头、并包含出错字段名的校验错误。
 * @param field 出错字段的路径名（如 `camera.coverage`）。
 * @param reason 失败原因描述。
 */
function fail(field: string, reason: string): never {
    throw new Error(`validateRenderConfig: ${field} ${reason}`);
}

/**
 * 断言数值有限且不小于给定下界。
 * @param field 字段路径名。
 * @param value 待校验数值。
 * @param min 允许的最小值（含）。
 */
function assertAtLeast(field: string, value: number, min: number): void {
    if (!Number.isFinite(value) || value < min) {
        fail(field, `must be a finite number >= ${min} (got ${value})`);
    }
}

/**
 * 断言数值有限且严格大于给定下界。
 * @param field 字段路径名。
 * @param value 待校验数值。
 * @param min 不允许达到的下界（不含）。
 */
function assertAbove(field: string, value: number, min: number): void {
    if (!Number.isFinite(value) || value <= min) {
        fail(field, `must be a finite number > ${min} (got ${value})`);
    }
}

/**
 * 断言数值是有限正整数。
 * @param field 字段路径名。
 * @param value 待校验数值。
 */
function assertPositiveInteger(field: string, value: number): void {
    if (!Number.isInteger(value) || value < 1) {
        fail(field, `must be a positive integer (got ${value})`);
    }
}

/**
 * 断言数值是 0xRRGGBB 整数颜色。
 * @param field 字段路径名。
 * @param value 待校验颜色值。
 */
function assertColor(field: string, value: number): void {
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
        fail(field, `must be an integer in [0, 0xffffff] (got ${value})`);
    }
}

/**
 * 在构造任何 Pixi 应用或分配画布之前校验渲染配置（T-05-01/T-05-09）。
 * 只读入参、不修改、不记录日志；任何非法字段都会抛出带字段名的 `Error`。
 * 按字段组顺序检查：画布 → 帧率 → 帧延时 → 颜色 → 几何 → 镜头 → HUD → 特效。
 * @param config 待校验的渲染配置。
 */
export function validateRenderConfig(config: IRenderConfig): void {
    const dimensions: readonly (readonly [string, number])[] = [
        ['width', config.width],
        ['height', config.height]
    ];
    for (const [field, value] of dimensions) {
        if (
            !Number.isInteger(value) ||
            value < MIN_CANVAS_DIMENSION ||
            value > MAX_CANVAS_DIMENSION
        ) {
            fail(
                field,
                `must be an integer in [${MIN_CANVAS_DIMENSION}, ${MAX_CANVAS_DIMENSION}] (got ${value})`
            );
        }
    }

    if (
        !Number.isFinite(config.outputFps) ||
        config.outputFps <= 0 ||
        config.outputFps > MAX_OUTPUT_FPS
    ) {
        fail(
            'outputFps',
            `must be a finite number in (0, ${MAX_OUTPUT_FPS}] (got ${config.outputFps})`
        );
    }

    if (
        !Number.isFinite(config.frameDelayMs) ||
        config.frameDelayMs < MIN_FRAME_DELAY_MS ||
        config.frameDelayMs > MAX_FRAME_DELAY_MS
    ) {
        fail(
            'frameDelayMs',
            `must be a finite number in [${MIN_FRAME_DELAY_MS}, ${MAX_FRAME_DELAY_MS}] (got ${config.frameDelayMs})`
        );
    }

    for (const [id, color] of Object.entries(config.factionColors)) {
        assertColor(`factionColors[${id}]`, color);
    }
    for (const [field, color] of Object.entries(config.palette)) {
        assertColor(`palette.${field}`, color);
    }

    const geometry = config.geometry;
    assertAbove('geometry.bodyRadius', geometry.bodyRadius, 0);
    assertAbove('geometry.weaponHalfLength', geometry.weaponHalfLength, 0);
    assertAbove('geometry.weaponRadius', geometry.weaponRadius, 0);
    assertAbove('geometry.weaponOffsetX', geometry.weaponOffsetX, 0);
    assertAbove('geometry.armorRadius', geometry.armorRadius, 0);

    const camera = config.camera;
    assertAtLeast('camera.paddingPx', camera.paddingPx, 0);
    if (
        !Number.isFinite(camera.coverage) ||
        camera.coverage <= 0 ||
        camera.coverage > 1
    ) {
        fail(
            'camera.coverage',
            `must be a finite number in (0, 1] (got ${camera.coverage})`
        );
    }
    assertAbove('camera.minSpanMeters', camera.minSpanMeters, 0);
    assertAbove('camera.minScale', camera.minScale, 0);
    if (
        !Number.isFinite(camera.maxScale) ||
        camera.maxScale < camera.minScale
    ) {
        fail(
            'camera.maxScale',
            `must be a finite number >= camera.minScale (got ${camera.maxScale})`
        );
    }
    assertAtLeast('camera.smoothingFrames', camera.smoothingFrames, 1);
    assertAtLeast('camera.panFrames', camera.panFrames, 1);
    assertAtLeast('camera.zoomFrames', camera.zoomFrames, 1);
    assertAtLeast('camera.shakeAmplitudePx', camera.shakeAmplitudePx, 0);
    if (
        !Number.isFinite(camera.shakeDecayPerFrame) ||
        camera.shakeDecayPerFrame < 0 ||
        camera.shakeDecayPerFrame > 1
    ) {
        fail(
            'camera.shakeDecayPerFrame',
            `must be a finite number in [0, 1] (got ${camera.shakeDecayPerFrame})`
        );
    }

    const hud = config.hud;
    assertAbove('hud.healthBarSeconds', hud.healthBarSeconds, 0);
    assertAtLeast(
        'hud.alwaysVisibleBelowUnits',
        hud.alwaysVisibleBelowUnits,
        1
    );
    assertAbove('hud.barWorldWidth', hud.barWorldWidth, 0);
    assertAbove('hud.barWorldHeight', hud.barWorldHeight, 0);
    assertAbove('hud.screenBarWidthPx', hud.screenBarWidthPx, 0);
    assertAbove('hud.levelWorldHeight', hud.levelWorldHeight, 0);
    assertAbove('hud.infoFontSizePx', hud.infoFontSizePx, 0);
    assertAtLeast('hud.infoMarginPx', hud.infoMarginPx, 0);
    assertAbove('hud.worldScaleAt', hud.worldScaleAt, 0);
    assertAbove('hud.screenScaleAt', hud.screenScaleAt, 0);
    if (!(hud.screenScaleAt > hud.worldScaleAt)) {
        fail(
            'hud.screenScaleAt',
            `must be strictly greater than hud.worldScaleAt (got ${hud.screenScaleAt} <= ${hud.worldScaleAt})`
        );
    }

    const effects = config.effects;
    assertAtLeast(
        'effects.damageNumberThreshold',
        effects.damageNumberThreshold,
        0
    );
    assertAbove(
        'effects.damageNumberWorldHeight',
        effects.damageNumberWorldHeight,
        0
    );
    assertAtLeast(
        'effects.damageNumberRiseMetersPerFrame',
        effects.damageNumberRiseMetersPerFrame,
        0
    );
    assertPositiveInteger(
        'effects.damageNumberLifetimeFrames',
        effects.damageNumberLifetimeFrames
    );
    assertPositiveInteger('effects.maxDamageNumbers', effects.maxDamageNumbers);
    assertPositiveInteger('effects.maxParticles', effects.maxParticles);
    assertPositiveInteger('effects.particlesPerHit', effects.particlesPerHit);
    assertPositiveInteger(
        'effects.particleLifetimeFrames',
        effects.particleLifetimeFrames
    );
    assertPositiveInteger('effects.maxDeathEffects', effects.maxDeathEffects);
    assertPositiveInteger(
        'effects.deathEffectLifetimeFrames',
        effects.deathEffectLifetimeFrames
    );
    assertPositiveInteger('effects.flashFrames', effects.flashFrames);
    assertAtLeast(
        'effects.shakeDamageThreshold',
        effects.shakeDamageThreshold,
        0
    );
}
