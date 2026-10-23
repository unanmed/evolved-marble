/**
 * 镜头的纯数学：插值辅助、百分位拟合盒、战斗/全景拟合变换、跟踪与过渡插值、
 * 世界↔屏幕映射（D-14/D-21/D-24）。
 * 本文件只有纯函数——无 Pixi、无类、无状态、无 wall-clock、无随机源，
 * 因此整套镜头几何可以在 Node/Vitest 中直接单测（REND-04）。
 * 消费 `ICameraTransform` 的函数都遵循同一条映射：
 * `screen = viewportCentre + (world − centre) × scale + shake`；世界 y 轴**刻意不翻转**，
 * 屏幕 y 与世界 y 同向，故物理角度可直接用作子容器旋转（research §6），
 * 拾取时排除 `shakeX`/`shakeY` 即可（D-24）。
 */

import type { IMapBounds, IVec2 } from '@/kingdom/types';
import type {
    ICameraConfig,
    ICameraTransform,
    IFitBox,
    IScreenPoint,
    IViewport
} from '@/render/types';

/**
 * 非法尺寸/缩放的有限回退值（1 米或 1 像素）：
 * 只用于把 NaN/0/负数挡在计算之外，不是一个可调视觉参数。
 */
const MIN_FINITE_SIZE = 1;

/**
 * 把数值钳制到 `[min, max]`；非有限值回退到 `min`。
 * @param value 待钳制的数值。
 * @param min 允许的最小值（含）。
 * @param max 允许的最大值（含）。
 * @returns 落在 `[min, max]` 内的有限值。
 */
function clampFinite(value: number, min: number, max: number): number {
    if (!Number.isFinite(value)) {
        return min;
    }
    return Math.max(min, Math.min(max, value));
}

/**
 * 非有限值回退到给定默认值。
 * @param value 待检查的数值。
 * @param fallback 回退值（必须自身有限）。
 * @returns 有限的结果。
 */
function finiteOr(value: number, fallback: number): number {
    return Number.isFinite(value) ? value : fallback;
}

/**
 * 把非正值或非有限值替换为有限正回退值。
 * @param value 待检查的数值。
 * @param fallback 回退值（正数）。
 * @returns 严格为正的有限值。
 */
function positiveOr(value: number, fallback: number): number {
    return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * 已按升序排序的非空数组的中位数：奇数取中间值，偶数取中间两值的平均。
 * @param sorted 升序排列的非空数组。
 * @returns 中位数。
 */
function medianSorted(sorted: readonly number[]): number {
    const count = sorted.length;
    const middle = Math.floor(count / 2);
    return count % 2 === 1
        ? sorted[middle]
        : (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * 在对数空间插值缩放，使每帧的缩放**比例**一致（research §Camera 3）；
 * 非正缩放回退到 `MIN_FINITE_SIZE`，保证 `Math.log` 永不产生 -Infinity。
 * @param from 起始缩放（像素/米）。
 * @param to 目标缩放（像素/米）。
 * @param t 插值参数。
 * @returns 插值后的正缩放。
 */
function interpolateScale(from: number, to: number, t: number): number {
    const safeFrom = positiveOr(from, MIN_FINITE_SIZE);
    const safeTo = positiveOr(to, safeFrom);
    return Math.exp(lerp(Math.log(safeFrom), Math.log(safeTo), t));
}

/**
 * 带防护的线性插值：非有限参数不会把 NaN 传播给调用方，
 * `t` 非有限时按下限 0 处理（即返回 `a`）。
 * @param a 起点值。
 * @param b 终点值。
 * @param t 插值参数（0 = `a`，1 = `b`，越界被钳制）。
 * @returns 有限插值结果。
 */
export function lerp(a: number, b: number, t: number): number {
    const safeA = finiteOr(a, 0);
    const safeB = finiteOr(b, safeA);
    const amount = clampFinite(t, 0, 1);
    return safeA + (safeB - safeA) * amount;
}

/**
 * 三次 Hermite 平滑过渡（D-09 的血条混合缩放会复用它）：
 * `edge0` 以下返回 0，`edge1` 以上返回 1，中间为 `t²(3 − 2t)`。
 * 当 `edge1 <= edge0` 时退化为阶跃，保证调用方永远不会除以零。
 * @param edge0 下边界。
 * @param edge1 上边界。
 * @param x 待判定的值。
 * @returns `[0, 1]` 内的平滑系数。
 */
export function smoothstep(edge0: number, edge1: number, x: number): number {
    if (
        !Number.isFinite(edge0) ||
        !Number.isFinite(edge1) ||
        !Number.isFinite(x)
    ) {
        return 0;
    }
    if (edge1 <= edge0) {
        return x >= edge1 ? 1 : 0;
    }
    const t = clampFinite((x - edge0) / (edge1 - edge0), 0, 1);
    return t * t * (3 - 2 * t);
}

/**
 * 标准 ease-in-out cubic 缓动：`t = 0` 恰为 0，`t = 1` 恰为 1。
 * 目标切换用它，使过渡两端速度为零、全程平滑（D-14/D-21）。
 * @param t 归一化时间（越界被钳制到 `[0, 1]`）。
 * @returns 缓动后的时间。
 */
export function easeInOutCubic(t: number): number {
    const clamped = clampFinite(t, 0, 1);
    if (clamped < 0.5) {
        return 4 * clamped * clamped * clamped;
    }
    return 1 - Math.pow(-2 * clamped + 2, 3) / 2;
}

/**
 * 拟合盒：以**中位数**为中心、按切比雪夫距离取第 `coverage` 百分位半径的正方形盒（D-21）。
 * 数学保证：至少 `ceil(coverage × n)` 个点落在盒内——这也是“至少 90% 参战单位在画面内”
 * 的依据，而不是经验调参。非有限的点先被丢弃，全部非法时返回 `null`（缺失对象 → `null`），
 * 调用方据此退回全景拟合而不是把 NaN 带进镜头。
 * @param points 世界坐标（米），通常是被指定战斗的存活成员位置。
 * @param coverage 必须容纳的点比例；被钳制到 `(0, 1]`。
 * @param minSpanMeters 拟合盒最小边长（米），防止单点战斗把镜头推到无限近。
 * @returns 正方形拟合盒；无可用点时返回 `null`。
 */
export function fitBox(
    points: readonly IVec2[],
    coverage: number,
    minSpanMeters: number
): IFitBox | null {
    const finite: IVec2[] = [];
    for (const point of points) {
        if (Number.isFinite(point.x) && Number.isFinite(point.y)) {
            finite.push(point);
        }
    }
    const count = finite.length;
    if (count === 0) {
        return null;
    }

    const xs = finite.map(point => point.x).sort((left, right) => left - right);
    const ys = finite.map(point => point.y).sort((left, right) => left - right);
    const centerX = medianSorted(xs);
    const centerY = medianSorted(ys);

    const distances = finite
        .map(point =>
            Math.max(Math.abs(point.x - centerX), Math.abs(point.y - centerY))
        )
        .sort((left, right) => left - right);

    // coverage 钳制到 (0, 1]：0 与 1.5 都不会把 rank 推到数组之外。
    coverage =
        Number.isFinite(coverage) && coverage > 0 ? Math.min(1, coverage) : 1;
    const rank = Math.max(
        0,
        Math.min(count - 1, Math.ceil(coverage * count) - 1)
    );
    const fallbackHalfSpan = positiveOr(minSpanMeters, MIN_FINITE_SIZE) / 2;
    const halfSpan = Number.isFinite(distances[rank])
        ? Math.max(distances[rank], fallbackHalfSpan)
        : fallbackHalfSpan;

    return {
        minX: centerX - halfSpan,
        maxX: centerX + halfSpan,
        minY: centerY - halfSpan,
        maxY: centerY + halfSpan
    };
}

/**
 * 战斗拟合：把正方形盒按 `paddingPx` 留边后铺满视口，中心取盒中心。
 * 缩放被钳制到 `[minScale, maxScale]`；`maxScale` 只封顶（缩小画面不会裁掉盒），
 * 因此“封顶”永远不破坏覆盖保证。盒或视口非法时用 `minSpanMeters` 见方的原点盒兜底，
 * 输出永远有限（T-05-13）。
 * @param box 拟合盒（世界坐标，米）。
 * @param viewport 当前视口（像素）。
 * @param config 镜头参数。
 * @returns 目标变换；震动分量为 0（震动归 `Camera` 所有）。
 */
export function fitTransform(
    box: IFitBox,
    viewport: IViewport,
    config: ICameraConfig
): ICameraTransform {
    const fallbackSpan = positiveOr(config.minSpanMeters, MIN_FINITE_SIZE);
    const finiteBox =
        Number.isFinite(box.minX) &&
        Number.isFinite(box.maxX) &&
        Number.isFinite(box.minY) &&
        Number.isFinite(box.maxY);
    const minX = finiteBox ? box.minX : 0;
    const maxX = finiteBox ? box.maxX : fallbackSpan;
    const minY = finiteBox ? box.minY : 0;
    const maxY = finiteBox ? box.maxY : fallbackSpan;

    const padding = Math.max(0, finiteOr(config.paddingPx, 0));
    const usableW = Math.max(
        MIN_FINITE_SIZE,
        finiteOr(viewport.width, MIN_FINITE_SIZE) - 2 * padding
    );
    const usableH = Math.max(
        MIN_FINITE_SIZE,
        finiteOr(viewport.height, MIN_FINITE_SIZE) - 2 * padding
    );
    const spanX = Math.max(maxX - minX, fallbackSpan);
    const spanY = Math.max(maxY - minY, fallbackSpan);
    const rawFit = Math.min(usableW / spanX, usableH / spanY);
    const minScale = positiveOr(config.minScale, MIN_FINITE_SIZE);
    const maxScale = Math.max(minScale, positiveOr(config.maxScale, minScale));

    return {
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
        scale: clampFinite(rawFit, minScale, maxScale),
        shakeX: 0,
        shakeY: 0
    };
}

/**
 * 全景拟合：显示整张地图（取宽/高两个方向中更小的缩放，绝不裁切），中心为地图中心。
 * 这是 `reset()` 与空点集的构图；地图外留黑是暗底设计的一部分（D-14/T-05-15）。
 * 尺寸非法时退回中心 `(0, 0)`、缩放 1，输出永远有限（T-05-13）。
 * @param bounds 地图尺寸（米）。
 * @param viewport 当前视口（像素）。
 * @param config 镜头参数。
 * @returns 全景变换；震动分量为 0。
 */
export function strategicTransform(
    bounds: IMapBounds,
    viewport: IViewport,
    config: ICameraConfig
): ICameraTransform {
    const width = finiteOr(bounds.width, 0);
    const height = finiteOr(bounds.height, 0);
    const viewWidth = finiteOr(viewport.width, 0);
    const viewHeight = finiteOr(viewport.height, 0);
    if (width <= 0 || height <= 0 || viewWidth <= 0 || viewHeight <= 0) {
        return { centerX: 0, centerY: 0, scale: 1, shakeX: 0, shakeY: 0 };
    }

    const padding = Math.max(0, finiteOr(config.paddingPx, 0));
    const usableW = Math.max(MIN_FINITE_SIZE, viewWidth - 2 * padding);
    const usableH = Math.max(MIN_FINITE_SIZE, viewHeight - 2 * padding);
    const rawFit = Math.min(usableW / width, usableH / height);
    const maxScale = positiveOr(config.maxScale, rawFit);

    return {
        centerX: width / 2,
        centerY: height / 2,
        scale: Math.min(rawFit, maxScale),
        shakeX: 0,
        shakeY: 0
    };
}

/**
 * 指数平滑跟踪（D-14：目标不变时使用）：每帧只走剩余距离的一个固定比例，
 * 因此永远不会瞬移；缩放走对数空间，视觉上匀速。`alpha` 由 `smoothingFrames`
 * 推导且恒在 `(0, 1)` 内（`smoothingFrames >= 1`）。
 * 震动分量为 0：震动只经 `ICameraUpdateInput.shakeImpulsePx` 写入（D-06）。
 * @param current 当前变换。
 * @param target 目标构图。
 * @param config 镜头参数（使用 `smoothingFrames`）。
 * @returns 平滑后的变换；全部有限。
 */
export function trackTransform(
    current: ICameraTransform,
    target: ICameraTransform,
    config: ICameraConfig
): ICameraTransform {
    const smoothing = positiveOr(config.smoothingFrames, MIN_FINITE_SIZE);
    const alpha = 1 - Math.exp(-1 / Math.max(MIN_FINITE_SIZE, smoothing));
    return {
        centerX: lerp(current.centerX, target.centerX, alpha),
        centerY: lerp(current.centerY, target.centerY, alpha),
        scale: interpolateScale(current.scale, target.scale, alpha),
        shakeX: 0,
        shakeY: 0
    };
}

/**
 * 固定长度的目标切换插值（D-14/D-21）：中心线性、缩放走对数空间，震动分量为 0。
 * 端点精确：`t = 0` 原样返回 `from`，`t = 1` 原样返回 `to` 的中心与缩放，
 * 使“第一次更新等于起点、最后一次更新等于目标”成为可断言的性质，而不是浮点巧合。
 * @param from 过渡起点变换。
 * @param to 目标构图。
 * @param t 归一化进度（越界被钳制）。
 * @returns 插值后的变换；全部有限。
 */
export function interpolateTransform(
    from: ICameraTransform,
    to: ICameraTransform,
    t: number
): ICameraTransform {
    const amount = clampFinite(t, 0, 1);
    if (amount === 0) {
        return {
            centerX: finiteOr(from.centerX, 0),
            centerY: finiteOr(from.centerY, 0),
            scale: positiveOr(from.scale, MIN_FINITE_SIZE),
            shakeX: 0,
            shakeY: 0
        };
    }
    if (amount === 1) {
        return {
            centerX: finiteOr(to.centerX, 0),
            centerY: finiteOr(to.centerY, 0),
            scale: positiveOr(to.scale, MIN_FINITE_SIZE),
            shakeX: 0,
            shakeY: 0
        };
    }
    return {
        centerX: lerp(from.centerX, to.centerX, amount),
        centerY: lerp(from.centerY, to.centerY, amount),
        scale: interpolateScale(from.scale, to.scale, amount),
        shakeX: 0,
        shakeY: 0
    };
}

/**
 * 世界 → 屏幕（不翻转 y）：`viewportCentre + (world − centre) × scale + shake`。
 * 缩放非法时退回视口中心，坐标或震动非法时退回镜头中心，输出永远有限（T-05-13）。
 * 拾取时必须传入排除震动后的变换，否则点击会随震动漂移（D-24）。
 * @param point 世界坐标（米）。
 * @param transform 本帧变换。
 * @param viewport 当前视口（像素）。
 * @returns 屏幕坐标（像素，左上原点）。
 */
export function worldToScreen(
    point: IVec2,
    transform: ICameraTransform,
    viewport: IViewport
): IScreenPoint {
    const halfWidth = finiteOr(viewport.width, 0) / 2;
    const halfHeight = finiteOr(viewport.height, 0) / 2;
    const scale = transform.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
        return { x: halfWidth, y: halfHeight };
    }
    const centerX = finiteOr(transform.centerX, 0);
    const centerY = finiteOr(transform.centerY, 0);
    const shakeX = finiteOr(transform.shakeX, 0);
    const shakeY = finiteOr(transform.shakeY, 0);
    const worldX = finiteOr(point.x, centerX);
    const worldY = finiteOr(point.y, centerY);

    return {
        x: halfWidth + (worldX - centerX) * scale + shakeX,
        y: halfHeight + (worldY - centerY) * scale + shakeY
    };
}

/**
 * 屏幕 → 世界（`worldToScreen` 的精确逆）：先减去震动偏移再反缩放，
 * 因此 canvas 点击不会被震动污染（D-24）。缩放非法时退回镜头中心，
 * 输出永远有限（T-05-13）。
 * @param point 屏幕坐标（像素，左上原点）。
 * @param transform 本帧变换。
 * @param viewport 当前视口（像素）。
 * @returns 世界坐标（米）。
 */
export function screenToWorld(
    point: IScreenPoint,
    transform: ICameraTransform,
    viewport: IViewport
): IVec2 {
    const centerX = finiteOr(transform.centerX, 0);
    const centerY = finiteOr(transform.centerY, 0);
    const scale = transform.scale;
    if (!Number.isFinite(scale) || scale <= 0) {
        return { x: centerX, y: centerY };
    }
    const halfWidth = finiteOr(viewport.width, 0) / 2;
    const halfHeight = finiteOr(viewport.height, 0) / 2;
    const shakeX = finiteOr(transform.shakeX, 0);
    const shakeY = finiteOr(transform.shakeY, 0);
    const screenX = finiteOr(point.x, halfWidth);
    const screenY = finiteOr(point.y, halfHeight);

    return {
        x: centerX + (screenX - halfWidth - shakeX) / scale,
        y: centerY + (screenY - halfHeight - shakeY) / scale
    };
}
