/**
 * 自动镜头：`class Camera implements ICamera`（D-02/D-14/D-15/D-21）。
 * 只有两种模式，且模式完全由跟拍目标推导——没有独立的模式设置方法，二者不可能互相矛盾。
 * `setBattleTarget` 只记录目标、快照当前变换并启动过渡，**绝不**直接改当前变换；
 * `reset` 是唯一允许的瞬时跳变（初始化）。
 * 过渡按方向各为**单段**同时插值（中心与缩放同帧动，绝不分成两段）：
 * - **进入**（新目标是数字）：从快照构图（全景）推近到战斗构图，占 `zoomFrames` 帧；
 *   入场前的“冻结全景”节拍由调用方（`ManualRunner`）负责，镜头本身只做这段推近。
 * - **退出**（目标变为 `undefined`）：从战斗构图拉回全景构图，占 `panFrames` 帧，
 *   因此镜头绝不会先以战斗缩放挪到地图中心再缩小。
 * 稳态跟随（无过渡）按战斗权重缩短平滑帧数：参战等级和越大，追赶越快；
 * 该权重**不**影响进入/退出的时长。
 * 全部几何委托给 `cameraMath.ts`，本类只持有状态；不引用 Pixi、不读 wall-clock、不用随机源，
 * 因此可在 Node/Vitest 中直接单测（REND-04）。一切运动以本类自己的 `update()` 调用次数
 * （输出帧）计数，同样的帧序列必然得到同样的变换序列（D-06/D-17）。
 */

import {
    easeInOutCubic,
    fitBox,
    fitTransform,
    interpolateTransform,
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
     * 只改变跟拍目标并启动过渡：当前变换保持原样，因此不会瞬移。
     * 新目标是数字时立即进入 `BattleFocus`（单位在推近过程中就该出现）并启动单段式推近；
     * 目标是 `undefined` 时保持 `BattleFocus`，启动单段式退出，等落地后才由 `update()` 切换模式。
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
     * 推进一帧：解析目标构图 → 过渡或跟踪 → 叠加震动。
     * 过渡以**已用帧数**计时，第 k 次更新读到 `elapsed = k - 1`：
     * - 进入：单段同时插值中心与缩放，第 1 次更新即已推进 `1 / zoomFrames`（不跳变、不空转），
     *   第 `zoomFrames` 次更新恰好落在目标上；`mode` 在 `setBattleTarget` 时已为 `BattleFocus`。
     * - 退出：单段同时插值中心与缩放，第 1 次更新即开始移动，第 `panFrames` 次更新落在全景上。
     * 两段都在落地帧做一次位稳定的吸附；`panFrames`/`zoomFrames` 为 1 时该段退化为单帧瞬变。
     * @param input 本帧输入（视口、地图、拟合点、震动冲量、战斗权重）。
     * @returns 本帧实际应用的变换；所有分量保证有限。
     */
    update(input: ICameraUpdateInput): ICameraTransform {
        this.frameIndex += 1;
        const target = this.resolveTarget(input);
        const from = this.transitionFrom;
        const elapsed = Math.max(0, this.transitionElapsed);
        let next: ICameraTransform;

        if (from !== null && this.targetBattleId === undefined) {
            const panFrames = Math.max(1, this.config.panFrames);
            next = this.exitTransform(from, target, elapsed, panFrames);
            this.transitionElapsed = elapsed + 1;
            if (elapsed >= panFrames - 1) {
                next = this.landingTransform(target);
                this.transitionFrom = null;
                this.transitionElapsed = 0;
                this.mode = CameraMode.Strategic;
            }
        } else if (from !== null) {
            const zoomFrames = Math.max(1, this.config.zoomFrames);
            next = this.entryTransform(from, target, elapsed, zoomFrames);
            this.transitionElapsed = elapsed + 1;
            if (elapsed >= zoomFrames - 1) {
                next = this.landingTransform(target);
                this.transitionFrom = null;
                this.transitionElapsed = 0;
                this.mode = CameraMode.BattleFocus;
            }
        } else {
            next = trackTransform(
                this.current,
                target,
                this.trackingConfig(input.battleWeight)
            );
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
     * 过渡（进入）：中心与缩放**同时**从快照（全景）构图缓动到战斗构图（单段，`easeInOutCubic`）。
     * 第 1 次更新（`elapsed = 0`）即已推进 `1 / zoomFrames`，因此推近从入场第一帧就开始，
     * 不存在“先平移再推拉”的两段式或空转帧；第 `zoomFrames` 次更新恰好落地。
     * @param from 过渡起点快照（全景构图）。
     * @param target 本帧目标构图（战斗）。
     * @param elapsed 本段已推进的帧数（0 = 段首）。
     * @param zoomFrames 本段总帧数（>= 1）。
     * @returns 本帧变换；震动分量为 0。
     */
    private entryTransform(
        from: ICameraTransform,
        target: ICameraTransform,
        elapsed: number,
        zoomFrames: number
    ): ICameraTransform {
        const alpha =
            zoomFrames <= 1 ? 1 : Math.min(1, (elapsed + 1) / zoomFrames);
        return interpolateTransform(from, target, easeInOutCubic(alpha));
    }

    /**
     * 过渡（退出）：中心与缩放**同时**从快照缓动到全景构图（单段，`easeInOutCubic`）。
     * 第 1 次更新（`elapsed = 0`）即已推进 `1 / panFrames`，因此缩放从第一帧就开始收缩，
     * 不存在“先以战斗缩放平移、再缩小”的旧形态；第 `panFrames` 次更新恰好落地。
     * @param from 过渡起点快照（战斗构图）。
     * @param target 本帧目标构图（全景）。
     * @param elapsed 本段已推进的帧数（0 = 段首）。
     * @param panFrames 本段总帧数（>= 1）。
     * @returns 本帧变换；震动分量为 0。
     */
    private exitTransform(
        from: ICameraTransform,
        target: ICameraTransform,
        elapsed: number,
        panFrames: number
    ): ICameraTransform {
        const alpha =
            panFrames <= 1 ? 1 : Math.min(1, (elapsed + 1) / panFrames);
        return interpolateTransform(from, target, easeInOutCubic(alpha));
    }

    /**
     * 落地吸附：过渡最后一帧直接返回目标构图，使“最后一次更新等于目标”是位稳定的性质。
     * @param target 本帧目标构图。
     * @returns 目标构图；震动分量为 0。
     */
    private landingTransform(target: ICameraTransform): ICameraTransform {
        return {
            centerX: target.centerX,
            centerY: target.centerY,
            scale: target.scale,
            shakeX: 0,
            shakeY: 0
        };
    }

    /**
     * 稳态跟随的参数：只有战斗内的跟随按权重缩短平滑帧数，全景跟随与过渡不受影响。
     * 有效平滑帧数 = clamp(round(smoothingFrames × weightScale / (weightScale + W)), 1, smoothingFrames)：
     * W = 0 时保持配置值，等级和越大追赶越快；非有限的 W 或标度按 0 处理。
     * @param battleWeight 本帧战斗权重（存活成员等级和）。
     * @returns 本帧用于 `trackTransform` 的参数。
     */
    private trackingConfig(battleWeight: number): ICameraConfig {
        if (this.targetBattleId === undefined) {
            return this.config;
        }
        const base = Math.max(1, Math.round(this.config.smoothingFrames));
        const weight =
            Number.isFinite(battleWeight) && battleWeight > 0
                ? battleWeight
                : 0;
        const weightScale =
            Number.isFinite(this.config.weightScale) &&
            this.config.weightScale > 0
                ? this.config.weightScale
                : 1;
        const effective = Math.max(
            1,
            Math.min(
                base,
                Math.round((base * weightScale) / (weightScale + weight))
            )
        );
        return effective === base
            ? this.config
            : { ...this.config, smoothingFrames: effective };
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
