/**
 * 自动镜头：`class Camera implements ICamera`（D-02/D-14/D-15/D-21）。
 * 只有两种模式，且模式完全由跟拍目标推导——没有独立的模式设置方法，二者不可能互相矛盾。
 * `setBattleTarget` 只记录目标、快照当前变换并启动两段式过渡，**绝不**直接改当前变换；
 * `reset` 是唯一允许的瞬时跳变（初始化）。
 * 两段式过渡：先以**当前缩放**平移中心到目标中心（`panFrames`），再推拉到目标缩放（`zoomFrames`）——
 * 平移期间缩放完全不动，观众能先看清“镜头去了哪”，再看到“镜头推近了”。
 * 全部几何委托给 `cameraMath.ts`，本类只持有状态；不引用 Pixi、不读 wall-clock、不用随机源，
 * 因此可在 Node/Vitest 中直接单测（REND-04）。一切运动以本类自己的 `update()` 调用次数
 * （输出帧）计数，同样的帧序列必然得到同样的变换序列（D-06/D-17）。
 */

import {
    easeInOutCubic,
    fitBox,
    fitTransform,
    interpolateTransform,
    lerp,
    strategicTransform,
    trackTransform
} from '@/render/cameraMath';
import type { IMapBounds } from '@/kingdom/types';
import { CameraMode } from '@/render/types';
import type {
    ICamera,
    ICameraConfig,
    ICameraTransform,
    ICameraUpdateInput,
    IViewport
} from '@/render/types';

/**
 * 震动相位步进（弧度/输出帧）：无理数步长使偏移不会周期性重复。
 * 两个轴共用同一相位，使合位移的模**恰好等于**当前振幅——
 * 这样“振幅上限”与“振幅单调衰减”都是可断言的性质，而不是近似。
 */
const SHAKE_PHASE_STEP = 2.399963;

/**
 * 自动镜头：两态状态机 + 固定长度过渡 + 指数跟踪 + 震动累加/衰减。
 */
export class Camera implements ICamera {
    /** 镜头可调参数（边距/覆盖比例/最小跨度/缩放上下限/平滑/切换/震动）。 */
    private readonly config: ICameraConfig;
    /** 当前跟拍目标；无目标时为 `undefined`（缺失字面量，AGENTS §8）。 */
    private targetBattleId: number | undefined;
    /** 当前渲染模式：由目标推导，拉回全景的过渡完成前保持 `BattleFocus`。 */
    private mode: CameraMode;
    /** 最近一次应用的变换；构造时即为有限零值，首次 `update` 前也已定义。 */
    private current: ICameraTransform;
    /** 过渡起点快照；无过渡时为 `null`（缺失对象 → `null`）。 */
    private transitionFrom: ICameraTransform | null;
    /** 本次过渡已推进的更新次数：第 k 次 `update()` 读到的是 `k - 1`。 */
    private transitionElapsed: number;
    /** 当前震动振幅（屏幕像素）：每帧先累加冲量并钳制，再按衰减系数递减。 */
    private shakeAmplitude: number;
    /** 本类自己的输出帧计数：震动相位只依赖它，绝不读 wall-clock。 */
    private frameIndex: number;

    /**
     * 构造镜头。
     * @param config 镜头参数（通常来自 `DEFAULT_RENDER_CONFIG.camera`）。
     */
    constructor(config: ICameraConfig) {
        this.config = config;
        this.targetBattleId = undefined;
        this.mode = CameraMode.Strategic;
        this.current = {
            centerX: 0,
            centerY: 0,
            scale: 1,
            shakeX: 0,
            shakeY: 0
        };
        this.transitionFrom = null;
        this.transitionElapsed = 0;
        this.shakeAmplitude = 0;
        this.frameIndex = 0;
    }

    /**
     * 只改变跟拍目标并启动两段式过渡：当前变换保持原样，因此不会瞬移。
     * 新目标是数字时立即进入 `BattleFocus`（单位在推近过程中就该出现）；
     * 目标是 `undefined` 时保持 `BattleFocus`，等拉回全景的过渡完成后才由 `update()` 切换模式。
     * @param battleId 目标战斗 id；`undefined` 表示请求全景。
     */
    setBattleTarget(battleId: number | undefined): void {
        if (battleId === this.targetBattleId) {
            return;
        }
        this.targetBattleId = battleId;
        this.transitionFrom = this.current;
        this.transitionElapsed = 0;
        if (battleId !== undefined) {
            this.mode = CameraMode.BattleFocus;
        }
    }

    /**
     * 当前跟拍目标。
     * @returns 目标战斗 id；无目标时为 `undefined`。
     */
    getBattleTarget(): number | undefined {
        return this.targetBattleId;
    }

    /**
     * 当前渲染模式（由目标推导）。
     * @returns `BattleFocus` 或 `Strategic`。
     */
    getMode(): CameraMode {
        return this.mode;
    }

    /**
     * 推进一帧：解析目标构图 → 两段式过渡或跟踪 → 叠加震动。
     * 过渡以**已用帧数**计时，第 k 次更新读到 `elapsed = k - 1`，因此：
     * 第 1 次更新恰为段首（返回起点，不跳变）；平移段占前 `panFrames` 次更新且缩放恒为快照值；
     * 推拉段从第 `panFrames + 1` 次更新开始，第 `panFrames + zoomFrames - 1` 次更新恰落在目标上
     * （并做一次位稳定的吸附）。`panFrames`/`zoomFrames` 为 1 时该段退化为单帧瞬变。
     * @param input 本帧输入（视口、地图、拟合点、震动冲量）。
     * @returns 本帧实际应用的变换；所有分量保证有限。
     */
    update(input: ICameraUpdateInput): ICameraTransform {
        this.frameIndex += 1;
        const target = this.resolveTarget(input);
        const from = this.transitionFrom;
        let next: ICameraTransform;

        if (from !== null) {
            const panFrames = Math.max(1, this.config.panFrames);
            const zoomFrames = Math.max(1, this.config.zoomFrames);
            const totalFrames = panFrames + zoomFrames - 1;
            const elapsed = Math.max(0, this.transitionElapsed);

            next =
                elapsed < panFrames
                    ? this.panTransform(from, target, elapsed, panFrames)
                    : this.zoomTransform(
                          from,
                          target,
                          elapsed - panFrames,
                          zoomFrames
                      );

            this.transitionElapsed = elapsed + 1;
            if (elapsed >= totalFrames - 1) {
                next = {
                    centerX: target.centerX,
                    centerY: target.centerY,
                    scale: target.scale,
                    shakeX: 0,
                    shakeY: 0
                };
                this.transitionFrom = null;
                this.transitionElapsed = 0;
                this.mode =
                    this.targetBattleId === undefined
                        ? CameraMode.Strategic
                        : CameraMode.BattleFocus;
            }
        } else {
            next = trackTransform(this.current, target, this.config);
        }

        const cap = Math.max(
            0,
            Number.isFinite(this.config.shakeAmplitudePx)
                ? this.config.shakeAmplitudePx
                : 0
        );
        const impulse = Number.isFinite(input.shakeImpulsePx)
            ? Math.max(0, input.shakeImpulsePx)
            : 0;
        this.shakeAmplitude = Math.min(
            cap,
            this.shakeAmplitude + Math.min(impulse, cap)
        );
        const phase = this.frameIndex * SHAKE_PHASE_STEP;
        const shakeX = Math.cos(phase) * this.shakeAmplitude;
        const shakeY = Math.sin(phase) * this.shakeAmplitude;
        const decay = Number.isFinite(this.config.shakeDecayPerFrame)
            ? Math.max(0, Math.min(1, this.config.shakeDecayPerFrame))
            : 0;
        this.shakeAmplitude *= decay;

        this.current = {
            centerX: Number.isFinite(next.centerX)
                ? next.centerX
                : target.centerX,
            centerY: Number.isFinite(next.centerY)
                ? next.centerY
                : target.centerY,
            scale:
                Number.isFinite(next.scale) && next.scale > 0
                    ? next.scale
                    : target.scale,
            shakeX: Number.isFinite(shakeX) ? shakeX : 0,
            shakeY: Number.isFinite(shakeY) ? shakeY : 0
        };
        return this.current;
    }

    /**
     * 最近一次应用的变换。
     * @returns 当前变换（首次 `update` 前是有限零值）。
     */
    getTransform(): ICameraTransform {
        return this.current;
    }

    /**
     * 清空跟拍目标并组合初始全景视图——唯一允许的瞬时跳变。
     * 因为模式由目标推导，调用后必然回到 `CameraMode.Strategic`。
     * @param bounds 地图尺寸（米）。
     * @param viewport 当前视口（像素）。
     * @returns 全景构图。
     */
    reset(bounds: IMapBounds, viewport: IViewport): ICameraTransform {
        this.targetBattleId = undefined;
        this.mode = CameraMode.Strategic;
        this.transitionFrom = null;
        this.transitionElapsed = 0;
        this.shakeAmplitude = 0;
        this.frameIndex = 0;
        this.current = strategicTransform(bounds, viewport, this.config);
        return this.current;
    }

    /**
     * 过渡第一段（平移）：中心从快照缓动到目标中心，**缩放严格保持快照值**，
     * 因此平移期间画面不会有任何“偷偷推近”的蠕动。
     * @param from 过渡起点快照。
     * @param target 本帧目标构图（中心为落点）。
     * @param elapsed 本段已推进的帧数（0 = 段首）。
     * @param panFrames 本段总帧数（>= 1）。
     * @returns 本帧变换；震动分量为 0。
     */
    private panTransform(
        from: ICameraTransform,
        target: ICameraTransform,
        elapsed: number,
        panFrames: number
    ): ICameraTransform {
        const alpha = panFrames <= 1 ? 1 : elapsed / (panFrames - 1);
        const eased = easeInOutCubic(alpha);
        return {
            centerX: lerp(from.centerX, target.centerX, eased),
            centerY: lerp(from.centerY, target.centerY, eased),
            scale: from.scale,
            shakeX: 0,
            shakeY: 0
        };
    }

    /**
     * 过渡第二段（推拉）：中心已固定在目标中心，缩放从快照值缓动到目标值（对数空间）。
     * `beta = 0` 恰好返回段首（目标中心 + 快照缩放），`beta = 1` 恰好返回目标。
     * @param from 过渡起点快照（只取其缩放）。
     * @param target 本帧目标构图。
     * @param elapsed 本段已推进的帧数（0 = 段首）。
     * @param zoomFrames 本段总帧数（>= 1）。
     * @returns 本帧变换；震动分量为 0。
     */
    private zoomTransform(
        from: ICameraTransform,
        target: ICameraTransform,
        elapsed: number,
        zoomFrames: number
    ): ICameraTransform {
        const beta = zoomFrames <= 1 ? 1 : elapsed / (zoomFrames - 1);
        const start: ICameraTransform = {
            centerX: target.centerX,
            centerY: target.centerY,
            scale: from.scale,
            shakeX: 0,
            shakeY: 0
        };
        return interpolateTransform(start, target, easeInOutCubic(beta));
    }

    /**
     * 解析本帧的目标构图：空点集或无法拟合时退回全景，否则按百分位盒拟合。
     * 目标构图永远满足 `coverage`；当前变换只负责平滑地追赶它（D-21）。
     * @param input 本帧输入。
     * @returns 目标变换。
     */
    private resolveTarget(input: ICameraUpdateInput): ICameraTransform {
        const strategic = strategicTransform(
            input.bounds,
            input.viewport,
            this.config
        );
        if (input.points.length === 0) {
            return strategic;
        }
        const box = fitBox(
            input.points,
            this.config.coverage,
            this.config.minSpanMeters
        );
        if (box === null) {
            return strategic;
        }
        const effective: ICameraConfig = {
            ...this.config,
            minScale: this.effectiveMinScale(input.bounds, input.viewport)
        };
        return fitTransform(box, input.viewport, effective);
    }

    /**
     * 战斗拟合允许的最小缩放：不超过同一视口下的全景拟合，
     * 否则小视口上的 `minScale` 会强制放大并破坏 ≥90% 构图保证（Pitfall 22）。
     * @param bounds 地图尺寸（米）。
     * @param viewport 当前视口（像素）。
     * @returns `min(config.minScale, 全景拟合缩放)`。
     */
    private effectiveMinScale(bounds: IMapBounds, viewport: IViewport): number {
        const panoramic = strategicTransform(
            bounds,
            viewport,
            this.config
        ).scale;
        return Math.min(this.config.minScale, panoramic);
    }
}
