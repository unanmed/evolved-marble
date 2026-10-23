/**
 * HUD 的纯判断模型（D-06/D-07/D-08/D-09/D-10/D-17）：
 * 血量比、15 秒血条计时、少于 6 单位常亮、混合缩放与镜头震动冲量。
 * 本文件只有纯函数——无 Pixi、无类、无模块状态、无 wall-clock、无随机源；
 * 计时一律以**输出帧**计数（`IHudFrame.frameIndex`），因此暂停或慢速渲染
 * 仍显示同样多的帧数（D-07/D-17）。所有可变状态都在调用方传入的 `IHudTimers` 里。
 */

import { lerp, smoothstep } from '@/render/cameraMath';
import type {
    ICameraConfig,
    IEffectsConfig,
    IHudConfig,
    IHudTimers,
    IRenderDamageEvent
} from '@/render/types';

/**
 * 把非正值或非有限值替换为 0（用于帧数与秒数守卫）。
 * @param value 待检查的数值。
 * @returns 非负有限值。
 */
function nonNegativeFinite(value: number): number {
    return Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * 生命比例（D-07）：`Health / MaxHealth` 钳制到 `[0, 1]`。
 * 任一输入非有限、或 `maxHealth <= 0` 时返回 0，
 * 使血条永远不会画出轨道之外，也不会因 NaN 得到 NaN 宽度。
 * @param health 当前生命值。
 * @param maxHealth 生命上限（随等级/修正器实时计算）。
 * @returns `[0, 1]` 内的生命比例。
 */
export function healthRatio(health: number, maxHealth: number): number {
    if (
        !Number.isFinite(health) ||
        !Number.isFinite(maxHealth) ||
        maxHealth <= 0
    ) {
        return 0;
    }
    return Math.max(0, Math.min(1, health / maxHealth));
}

/**
 * 按本帧伤害事件登记血条可见期限（D-07/D-17）：
 * 每个受击守方的血条显示 `round(outputFps × seconds)` 个输出帧，
 * 再次受击**重置**到 `frameIndex + frames` 而不是累加；致命一击立即删除条目。
 * 帧数在循环外只计算一次，并保证至少 1 帧、始终是有限整数。
 * @param timers HUD 计时工作状态（原地修改）。
 * @param events 本输出帧排空的伤害事件。
 * @param frameIndex 当前输出帧序号。
 * @param outputFps 输出帧率（仅用于换算，不是循环节流）。
 * @param seconds 受击后血条显示的秒数（15）。
 */
export function registerDamage(
    timers: IHudTimers,
    events: readonly IRenderDamageEvent[],
    frameIndex: number,
    outputFps: number,
    seconds: number
): void {
    const frames = Math.max(
        1,
        Math.round(nonNegativeFinite(outputFps) * nonNegativeFinite(seconds))
    );
    const baseIndex = Number.isFinite(frameIndex) ? frameIndex : 0;
    for (const event of events) {
        if (event.killed) {
            timers.visibleUntil.delete(event.defenderId);
            continue;
        }
        timers.visibleUntil.set(event.defenderId, baseIndex + frames);
    }
}

/**
 * 本帧血条是否可见（D-07）：场上总数低于 `alwaysVisibleBelowUnits` 时常亮；
 * 否则仅在存在计时且 `frameIndex < visibleUntil` 时可见（期限不含端点）。
 * @param unitId 单位 id。
 * @param timers HUD 计时工作状态。
 * @param frameIndex 当前输出帧序号。
 * @param totalUnits 场上存活单位总数（不是可见数）。
 * @param alwaysVisibleBelowUnits 常亮阈值（6）。
 * @returns 是否绘制该单位血条。
 */
export function isHealthVisible(
    unitId: number,
    timers: IHudTimers,
    frameIndex: number,
    totalUnits: number,
    alwaysVisibleBelowUnits: number
): boolean {
    if (totalUnits < alwaysVisibleBelowUnits) {
        return true;
    }
    const until = timers.visibleUntil.get(unitId);
    return until !== undefined && frameIndex < until;
}

/**
 * 血条混合缩放系数（D-09）：`1` 表示世界尺寸，输出节点的 `scale`。
 * `t = smoothstep(worldScaleAt, screenScaleAt, cameraScale)`；
 * 远景为 1（屏幕宽度 = `barWorldWidth × cameraScale`），
 * 近景为 `(screenBarWidthPx / barWorldWidth) / cameraScale`
 * （屏幕宽度恒定 = `screenBarWidthPx`），中间连续过渡。
 *
 * 注意：**系数本身不是单调的**（它在 `screenScaleAt` 之前达到峰值再回落）；
 * D-09 的性质断言在屏幕像素宽度 `barWorldWidth × cameraScale × 系数` 上：
 * 它从 `barWorldWidth × worldScaleAt` 非递减地升到 `screenBarWidthPx`，
 * 之后保持 `screenBarWidthPx`。非有限/非正缩放回退到世界尺寸（1）。
 * @param cameraScale 当前镜头缩放（像素/米）。
 * @param config HUD 参数（提供 `worldScaleAt`/`screenScaleAt`/宽度）。
 * @returns 血条节点的缩放系数。
 */
export function computeHudScale(
    cameraScale: number,
    config: IHudConfig
): number {
    if (!Number.isFinite(cameraScale) || cameraScale <= 0) {
        return 1;
    }
    const t = smoothstep(
        config.worldScaleAt,
        config.screenScaleAt,
        cameraScale
    );
    const rawFactor =
        config.screenBarWidthPx / config.barWorldWidth / cameraScale;
    const screenFactor =
        Number.isFinite(rawFactor) && rawFactor > 0 ? rawFactor : 1;
    return lerp(1, screenFactor, t);
}

/**
 * 清理已不存在单位的计时条目（T-05-07）：存活 id 集合只构建一次，
 * 然后删除所有不在其中的键，防止 `Map` 随死亡单位无界增长。
 * @param timers HUD 计时工作状态（原地修改）。
 * @param liveUnitIds 当前全部存活/已注册单位 id。
 */
export function pruneTimers(
    timers: IHudTimers,
    liveUnitIds: readonly number[]
): void {
    const live = new Set(liveUnitIds);
    for (const unitId of [...timers.visibleUntil.keys()]) {
        if (!live.has(unitId)) {
            timers.visibleUntil.delete(unitId);
        }
    }
}

/**
 * 本输出帧请求的镜头震动冲量（像素，D-06/D-10）：
 * 无 `killed` 且最大有限伤害低于 `shakeDamageThreshold` 时返回 0
 * （阈值非有限或为负按 0 处理，于是任何真实命中都触发）；
 * 否则返回 `clamp(maxDamage / threshold, 1, 3) × shakeAmplitudePx`。
 *
 * 返回值**不**再钳制到 `shakeAmplitudePx`：1–3 倍是“打得越重、镜头越晃”的形状，
 * 累计振幅由 `Camera` 按 `ICameraConfig.shakeAmplitudePx` 封顶（05-03），
 * 分工在 `ICameraUpdateInput.shakeImpulsePx` 的契约里写明。结果总是有限值。
 * @param events 本输出帧排空的伤害事件。
 * @param effects 反馈预算（`shakeDamageThreshold`）。
 * @param camera 镜头参数（`shakeAmplitudePx`）。
 * @returns 非负有限的震动冲量（像素）。
 */
export function computeShakeImpulsePx(
    events: readonly IRenderDamageEvent[],
    effects: IEffectsConfig,
    camera: ICameraConfig
): number {
    let maxDamage = 0;
    let killed = false;
    for (const event of events) {
        if (event.killed) {
            killed = true;
        }
        if (Number.isFinite(event.damage)) {
            maxDamage = Math.max(maxDamage, event.damage);
        }
    }

    const threshold =
        Number.isFinite(effects.shakeDamageThreshold) &&
        effects.shakeDamageThreshold > 0
            ? effects.shakeDamageThreshold
            : 0;
    const triggered =
        killed || (threshold > 0 ? maxDamage >= threshold : maxDamage > 0);
    if (!triggered) {
        return 0;
    }

    const amplitude =
        Number.isFinite(camera.shakeAmplitudePx) && camera.shakeAmplitudePx > 0
            ? camera.shakeAmplitudePx
            : 0;
    const ratio =
        threshold > 0 ? maxDamage / threshold : Number.POSITIVE_INFINITY;
    const multiplier = Number.isFinite(ratio)
        ? Math.min(3, Math.max(1, ratio))
        : 3;
    const impulse = multiplier * amplitude;
    return Number.isFinite(impulse) ? impulse : 0;
}
