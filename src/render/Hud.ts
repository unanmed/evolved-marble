/**
 * HUD 适配器 `class Hud implements IHud`（D-06/D-07/D-08/D-09/D-10/D-11/D-23）。
 * 它只画 `IHudFrame` 已经决定好的东西：血条长度取 `healthRatio`、混合缩放取 `hudScale`、
 * 显隐取 `healthVisible`、等级取 `level`——本类**不**重新计算任何显隐或阈值规则。
 * 全部特效（伤害数字、火花、死亡碎裂环）都走固定上限的对象池：
 * 到上限时回收最旧条目，绝不增长（T-05-07）。
 * 不读 wall-clock、不用随机源，也不逐帧改 `Text.text`（Pitfall 4）。
 */

import { Container, Graphics, GraphicsContext, Text } from 'pixi.js';

import { formatGameTime } from '@/render/calendar';
import type {
    IHud,
    IHudFrame,
    IHudUnitState,
    IRenderConfig,
    IRenderDamageEvent
} from '@/render/types';

/**
 * 世界层文本的栅格化字号（像素）：只决定贴图清晰度，
 * 最终世界尺寸一律由配置（`levelWorldHeight`/`damageNumberWorldHeight`）换算。
 */
const HUD_RASTER_FONT_PX = 48;

/**
 * 粒子扇形分布的角度步长（弧度）：黄金角使连续命中的火花不会重复同一图案，
 * 同时保持完全确定性（无随机源）。
 */
const PARTICLE_ANGLE_STEP = 2.399963;

/** 文本描边宽度相对字号的比例：避免写死像素值。 */
const TEXT_STROKE_RATIO = 0.12;

/** 血条描边宽度相对血条高度的比例。 */
const BAR_STROKE_RATIO = 0.2;

/** 火花点半径相对物理武器半径的倍数。 */
const PARTICLE_RADIUS_FACTOR = 1.2;

/** 火花每帧飞行距离相对物理武器半径的倍数。 */
const PARTICLE_SPEED_FACTOR = 0.6;

/** 死亡碎裂环的起始半径相对物理防具半径的倍数。 */
const DEATH_RING_START_FACTOR = 1;

/** 死亡碎裂环的终止半径相对物理防具半径的倍数。 */
const DEATH_RING_END_FACTOR = 3;

/** 死亡碎裂环的线宽相对物理武器半径的倍数。 */
const DEATH_RING_STROKE_FACTOR = 1.2;

/** 单个字符之外的通用空白文本：池中节点在被占用前保持这个内容。 */
const EMPTY_TEXT = '';

/**
 * 血条底槽几何：深色矩形 + 深色细描边，所有单位共享一份。
 * @param config 渲染配置（尺寸来自 `hud`，颜色来自 `palette`）。
 * @returns 共享的底槽几何上下文。
 */
function buildBarBackgroundContext(config: IRenderConfig): GraphicsContext {
    const width = config.hud.barWorldWidth;
    const height = config.hud.barWorldHeight;
    return new GraphicsContext()
        .rect(-width / 2, -height / 2, width, height)
        .fill(config.palette.healthBackground)
        .stroke({
            width: Math.max(0.01, height * BAR_STROKE_RATIO),
            color: config.palette.healthBorder
        });
}

/**
 * 血条填充几何：从原点向右的白色矩形，长度靠 `scale.x` 收缩、颜色靠 `tint` 变阵营色。
 * @param config 渲染配置（尺寸来自 `hud`）。
 * @returns 共享的填充几何上下文。
 */
function buildBarFillContext(config: IRenderConfig): GraphicsContext {
    const width = config.hud.barWorldWidth;
    const height = config.hud.barWorldHeight;
    return new GraphicsContext()
        .rect(0, -height / 2, width, height)
        .fill(0xffffff);
}

/**
 * 火花点几何：一个白色小圆，所有粒子共享一份。
 * @param config 渲染配置（半径由 `geometry.weaponRadius` 缩放）。
 * @returns 共享的火花几何上下文。
 */
function buildParticleContext(config: IRenderConfig): GraphicsContext {
    return new GraphicsContext()
        .circle(0, 0, config.geometry.weaponRadius * PARTICLE_RADIUS_FACTOR)
        .fill(config.palette.flash);
}

/**
 * 死亡碎裂环几何：半径 1 的白色圆环，扩张完全靠节点 `scale`，不重建几何。
 * @param config 渲染配置（线宽由 `geometry.weaponRadius` 缩放）。
 * @returns 共享的死亡环几何上下文。
 */
function buildDeathRingContext(config: IRenderConfig): GraphicsContext {
    return new GraphicsContext().circle(0, 0, 1).stroke({
        width: config.geometry.weaponRadius * DEATH_RING_STROKE_FACTOR,
        color: config.palette.flash
    });
}

/** 血条与等级等世界层 HUD 元素的适配器；全部上限与寿命来自配置。 */
export class Hud implements IHud {
    /** 渲染配置：尺寸、配色与全部上限/寿命的唯一来源。 */
    private readonly config: IRenderConfig;
    /** 世界层血条容器（随镜头缩放）。 */
    private readonly barLayer: Container;
    /** 世界层特效容器（伤害数字、火花、死亡环）。 */
    private readonly effectLayer: Container;
    /** 屏幕层信息条：只显示时间 + 速度，镜头无法移动它（D-11）。 */
    private readonly infoText: Text;
    /** 单位 id → 血条根节点（位置 = 单位世界坐标）。 */
    private readonly bars = new Map<number, Container>();
    /** 单位 id → 被 `hudScale` 缩放的盒节点（偏移因此仍以米计）。 */
    private readonly barBoxes = new Map<number, Container>();
    /** 单位 id → 血条填充图形（`scale.x = healthRatio`）。 */
    private readonly barFills = new Map<number, Graphics>();
    /** 单位 id → 等级文本（直立、世界尺寸，D-08/D-23）。 */
    private readonly levels = new Map<number, Text>();
    /** 单位 id → 已写入的等级：只在等级变化时改字（Pitfall 4）。 */
    private readonly lastLevels = new Map<number, number>();
    /** 本帧出现过的单位 id 集合：复用同一个集合，避免逐帧分配。 */
    private readonly seenUnits = new Set<number>();
    /** 共享血条底槽几何。 */
    private readonly barBackgroundContext: GraphicsContext;
    /** 共享血条填充几何（白色 + `tint`）。 */
    private readonly barFillContext: GraphicsContext;
    /** 共享火花点几何。 */
    private readonly particleContext: GraphicsContext;
    /** 共享死亡环几何（半径 1 米，靠 `scale` 扩张）。 */
    private readonly deathRingContext: GraphicsContext;
    /** 伤害数字池（惰性增长到 `maxDamageNumbers`）。 */
    private readonly damageNumbers: Text[] = [];
    /** 伤害数字年龄（输出帧），与池同下标。 */
    private readonly damageNumberAges: number[] = [];
    /** 伤害数字是否活跃，与池同下标。 */
    private readonly damageNumberActive: boolean[] = [];
    /** 伤害数字的基准世界 y（米）：上升量按年龄重算，避免浮点漂移。 */
    private readonly damageNumberBaseY: number[] = [];
    /** 火花池（惰性增长到 `maxParticles`）。 */
    private readonly particles: Graphics[] = [];
    /** 火花年龄（输出帧），与池同下标。 */
    private readonly particleAges: number[] = [];
    /** 火花是否活跃，与池同下标。 */
    private readonly particleActive: boolean[] = [];
    /** 火花出生点世界 x（米）。 */
    private readonly particleOriginX: number[] = [];
    /** 火花出生点世界 y（米）。 */
    private readonly particleOriginY: number[] = [];
    /** 火花每帧位移 x（米）。 */
    private readonly particleVelocityX: number[] = [];
    /** 火花每帧位移 y（米）。 */
    private readonly particleVelocityY: number[] = [];
    /** 死亡碎裂环池（惰性增长到 `maxDeathEffects`）。 */
    private readonly deathRings: Graphics[] = [];
    /** 死亡环年龄（输出帧），与池同下标。 */
    private readonly deathRingAges: number[] = [];
    /** 死亡环是否活跃，与池同下标。 */
    private readonly deathRingActive: boolean[] = [];
    /** 是否已释放：保证 `dispose()` 幂等。 */
    private disposed = false;

    /**
     * 构造 HUD：把血条/特效层挂到世界层，把信息条挂到屏幕层。
     * @param worldLayer 受镜头变换的世界层（HUD 层）。
     * @param screenLayer 不受镜头影响的屏幕层。
     * @param config 渲染配置。
     */
    constructor(
        worldLayer: Container,
        screenLayer: Container,
        config: IRenderConfig
    ) {
        this.config = config;
        this.barLayer = new Container();
        this.effectLayer = new Container();
        worldLayer.addChild(this.barLayer, this.effectLayer);

        this.infoText = new Text({
            text: EMPTY_TEXT,
            style: {
                fill: config.palette.text,
                fontSize: config.hud.infoFontSizePx,
                stroke: {
                    color: config.palette.healthBorder,
                    width: Math.max(
                        1,
                        config.hud.infoFontSizePx * TEXT_STROKE_RATIO
                    )
                }
            }
        });
        this.infoText.position.set(
            config.hud.infoMarginPx,
            config.hud.infoMarginPx
        );
        screenLayer.addChild(this.infoText);

        this.barBackgroundContext = buildBarBackgroundContext(config);
        this.barFillContext = buildBarFillContext(config);
        this.particleContext = buildParticleContext(config);
        this.deathRingContext = buildDeathRingContext(config);
    }

    /**
     * 更新对象池并绘制一帧：血条、等级、伤害数字、火花、死亡环与信息条。
     * 顺序固定为同步血条 → 生成特效 → 推进特效 → 刷新信息条。
     * @param frame 本帧已解析的 HUD 数据。
     */
    update(frame: IHudFrame): void {
        this.syncBars(frame.units);
        this.spawnEffects(frame.damage, frame.frameIndex);
        this.advanceEffects();
        this.updateInfoBar(frame);
    }

    /** 清空对象池、血条/等级节点与信息条文本；不动共享几何。 */
    reset(): void {
        for (let index = 0; index < this.damageNumbers.length; index += 1) {
            this.deactivateDamageNumber(index);
        }
        for (let index = 0; index < this.particles.length; index += 1) {
            this.deactivateParticle(index);
        }
        for (let index = 0; index < this.deathRings.length; index += 1) {
            this.deactivateDeathRing(index);
        }
        for (const unitId of [...this.bars.keys()]) {
            this.releaseBar(unitId);
        }
        for (const unitId of [...this.levels.keys()]) {
            this.releaseLevel(unitId);
        }
        this.lastLevels.clear();
        this.seenUnits.clear();
        this.infoText.text = EMPTY_TEXT;
    }

    /** 幂等释放：销毁层、文本与共享几何，重复调用是空操作。 */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        this.barLayer.destroy({ children: true });
        this.effectLayer.destroy({ children: true });
        this.infoText.destroy();
        this.barBackgroundContext.destroy();
        this.barFillContext.destroy();
        this.particleContext.destroy();
        this.deathRingContext.destroy();
        this.bars.clear();
        this.barBoxes.clear();
        this.barFills.clear();
        this.levels.clear();
        this.lastLevels.clear();
        this.seenUnits.clear();
        this.damageNumbers.length = 0;
        this.damageNumberAges.length = 0;
        this.damageNumberActive.length = 0;
        this.damageNumberBaseY.length = 0;
        this.particles.length = 0;
        this.particleAges.length = 0;
        this.particleActive.length = 0;
        this.particleOriginX.length = 0;
        this.particleOriginY.length = 0;
        this.particleVelocityX.length = 0;
        this.particleVelocityY.length = 0;
        this.deathRings.length = 0;
        this.deathRingAges.length = 0;
        this.deathRingActive.length = 0;
    }

    /**
     * 同步本帧的血条与等级：出现在 `units` 里的复用/新建，消失的释放。
     * @param units 本帧单位 HUD 数据（战略模式下为空）。
     */
    private syncBars(units: readonly IHudUnitState[]): void {
        this.seenUnits.clear();
        for (const unit of units) {
            this.seenUnits.add(unit.unitId);
            this.updateBar(unit);
            this.updateLevel(unit);
        }
        for (const unitId of [...this.bars.keys()]) {
            if (!this.seenUnits.has(unitId)) {
                this.releaseBar(unitId);
            }
        }
        for (const unitId of [...this.levels.keys()]) {
            if (!this.seenUnits.has(unitId)) {
                this.releaseLevel(unitId);
            }
        }
        for (const unitId of [...this.lastLevels.keys()]) {
            if (!this.seenUnits.has(unitId)) {
                this.lastLevels.delete(unitId);
            }
        }
    }

    /**
     * 绘制或更新一个单位的血条：位置、显隐、混合缩放、长度与阵营色。
     * @param unit 本帧单位 HUD 数据。
     */
    private updateBar(unit: IHudUnitState): void {
        let root = this.bars.get(unit.unitId);
        let box = this.barBoxes.get(unit.unitId);
        let fill = this.barFills.get(unit.unitId);

        if (root === undefined || box === undefined || fill === undefined) {
            root = new Container();
            box = new Container();
            const background = new Graphics(this.barBackgroundContext);
            fill = new Graphics(this.barFillContext);
            fill.position.x = -this.config.hud.barWorldWidth / 2;
            box.addChild(background, fill);
            root.addChild(box);
            this.barLayer.addChild(root);
            this.bars.set(unit.unitId, root);
            this.barBoxes.set(unit.unitId, box);
            this.barFills.set(unit.unitId, fill);
        }

        root.position.set(unit.x, unit.y);
        root.visible = unit.healthVisible;
        box.position.y = this.config.hud.barOffsetY;
        box.scale.set(unit.hudScale);
        fill.scale.x = unit.healthRatio;
        fill.visible = unit.healthRatio > 0;
        if (fill.tint !== unit.factionColor) {
            fill.tint = unit.factionColor;
        }
    }

    /**
     * 绘制或更新一个单位的等级：常亮、直立、始终世界尺寸（D-08/D-23）。
     * @param unit 本帧单位 HUD 数据。
     */
    private updateLevel(unit: IHudUnitState): void {
        let text = this.levels.get(unit.unitId);
        if (text === undefined) {
            text = new Text({
                text: EMPTY_TEXT,
                anchor: 0.5,
                style: {
                    fill: this.config.palette.text,
                    fontSize: HUD_RASTER_FONT_PX,
                    stroke: {
                        color: this.config.palette.healthBorder,
                        width: Math.max(
                            1,
                            HUD_RASTER_FONT_PX * TEXT_STROKE_RATIO
                        )
                    }
                }
            });
            this.levels.set(unit.unitId, text);
            this.barLayer.addChild(text);
        }

        text.position.set(unit.x, unit.y);
        if (this.lastLevels.get(unit.unitId) !== unit.level) {
            text.text = String(unit.level);
            this.lastLevels.set(unit.unitId, unit.level);
            this.applyWorldHeight(text, this.config.hud.levelWorldHeight);
        }
    }

    /**
     * 释放一个单位的血条节点（连带被缩放的盒与填充）。
     * @param unitId 单位 id。
     */
    private releaseBar(unitId: number): void {
        const root = this.bars.get(unitId);
        if (root !== undefined) {
            root.destroy({ children: true });
        }
        this.bars.delete(unitId);
        this.barBoxes.delete(unitId);
        this.barFills.delete(unitId);
    }

    /**
     * 释放一个单位的等级文本。
     * @param unitId 单位 id。
     */
    private releaseLevel(unitId: number): void {
        const text = this.levels.get(unitId);
        if (text !== undefined) {
            text.destroy();
        }
        this.levels.delete(unitId);
        this.lastLevels.delete(unitId);
    }

    /**
     * 按本帧伤害事件生成特效：伤害数字（仅大伤害）、火花与死亡碎裂环。
     * @param events 本帧排空的伤害事件。
     * @param frameIndex 当前输出帧序号（用于确定性的火花扇形）。
     */
    private spawnEffects(
        events: readonly IRenderDamageEvent[],
        frameIndex: number
    ): void {
        for (const event of events) {
            if (!Number.isFinite(event.x) || !Number.isFinite(event.y)) {
                continue;
            }
            if (event.damage >= this.config.effects.damageNumberThreshold) {
                this.spawnDamageNumber(event);
            }
            this.spawnParticles(event, frameIndex);
            if (event.killed) {
                this.spawnDeathRing(event);
            }
        }
    }

    /**
     * 从池中取一个伤害数字并写入本次伤害（只在取出时改字）。
     * @param event 造成伤害的事件。
     */
    private spawnDamageNumber(event: IRenderDamageEvent): void {
        const index = this.acquireDamageNumber();
        const text = this.damageNumbers[index];
        text.text = String(Math.round(event.damage));
        text.visible = true;
        text.alpha = 1;
        this.applyWorldHeight(
            text,
            this.config.effects.damageNumberWorldHeight
        );
        this.damageNumberAges[index] = 0;
        this.damageNumberActive[index] = true;
        this.damageNumberBaseY[index] = event.y;
        text.position.set(event.x, event.y);
    }

    /**
     * 取得一个空闲伤害数字槽位：池未满则新建，已满则回收最旧条目。
     * @returns 可用的池下标。
     */
    private acquireDamageNumber(): number {
        for (let index = 0; index < this.damageNumbers.length; index += 1) {
            if (!this.damageNumberActive[index]) {
                return index;
            }
        }
        if (this.damageNumbers.length < this.config.effects.maxDamageNumbers) {
            this.damageNumbers.push(
                new Text({
                    text: EMPTY_TEXT,
                    anchor: 0.5,
                    style: {
                        fill: this.config.palette.text,
                        fontSize: HUD_RASTER_FONT_PX,
                        stroke: {
                            color: this.config.palette.healthBorder,
                            width: Math.max(
                                1,
                                HUD_RASTER_FONT_PX * TEXT_STROKE_RATIO
                            )
                        }
                    }
                })
            );
            this.damageNumberAges.push(0);
            this.damageNumberActive.push(false);
            this.damageNumberBaseY.push(0);
            const created = this.damageNumbers[this.damageNumbers.length - 1];
            created.visible = false;
            this.effectLayer.addChild(created);
            return this.damageNumbers.length - 1;
        }
        let oldest = 0;
        for (let index = 1; index < this.damageNumberAges.length; index += 1) {
            if (this.damageNumberAges[index] > this.damageNumberAges[oldest]) {
                oldest = index;
            }
        }
        return oldest;
    }

    /**
     * 生成一次命中的火花：方向由粒子序号与帧序号确定性导出，不用随机源。
     * @param event 造成伤害的事件。
     * @param frameIndex 当前输出帧序号。
     */
    private spawnParticles(
        event: IRenderDamageEvent,
        frameIndex: number
    ): void {
        const perHit = this.config.effects.particlesPerHit;
        const speed = this.config.geometry.weaponRadius * PARTICLE_SPEED_FACTOR;
        for (let shot = 0; shot < perHit; shot += 1) {
            const index = this.acquireParticle();
            const node = this.particles[index];
            const angle =
                (shot / perHit) * Math.PI * 2 +
                frameIndex * PARTICLE_ANGLE_STEP;
            this.particleOriginX[index] = event.x;
            this.particleOriginY[index] = event.y;
            this.particleVelocityX[index] = Math.cos(angle) * speed;
            this.particleVelocityY[index] = Math.sin(angle) * speed;
            this.particleAges[index] = 0;
            this.particleActive[index] = true;
            node.position.set(event.x, event.y);
            node.alpha = 1;
            node.visible = true;
        }
    }

    /**
     * 取得一个空闲火花槽位：池未满则新建，已满则回收最旧条目。
     * @returns 可用的池下标。
     */
    private acquireParticle(): number {
        for (let index = 0; index < this.particles.length; index += 1) {
            if (!this.particleActive[index]) {
                return index;
            }
        }
        if (this.particles.length < this.config.effects.maxParticles) {
            const node = new Graphics(this.particleContext);
            node.visible = false;
            this.effectLayer.addChild(node);
            this.particles.push(node);
            this.particleAges.push(0);
            this.particleActive.push(false);
            this.particleOriginX.push(0);
            this.particleOriginY.push(0);
            this.particleVelocityX.push(0);
            this.particleVelocityY.push(0);
            return this.particles.length - 1;
        }
        let oldest = 0;
        for (let index = 1; index < this.particleAges.length; index += 1) {
            if (this.particleAges[index] > this.particleAges[oldest]) {
                oldest = index;
            }
        }
        return oldest;
    }

    /**
     * 在死亡位置生成一个扩散的碎裂环。
     * @param event 造成死亡的事件。
     */
    private spawnDeathRing(event: IRenderDamageEvent): void {
        const index = this.acquireDeathRing();
        const node = this.deathRings[index];
        node.position.set(event.x, event.y);
        node.scale.set(
            this.config.geometry.armorRadius * DEATH_RING_START_FACTOR
        );
        node.alpha = 1;
        node.visible = true;
        this.deathRingAges[index] = 0;
        this.deathRingActive[index] = true;
    }

    /**
     * 取得一个空闲死亡环槽位：池未满则新建，已满则回收最旧条目。
     * @returns 可用的池下标。
     */
    private acquireDeathRing(): number {
        for (let index = 0; index < this.deathRings.length; index += 1) {
            if (!this.deathRingActive[index]) {
                return index;
            }
        }
        if (this.deathRings.length < this.config.effects.maxDeathEffects) {
            const node = new Graphics(this.deathRingContext);
            node.visible = false;
            this.effectLayer.addChild(node);
            this.deathRings.push(node);
            this.deathRingAges.push(0);
            this.deathRingActive.push(false);
            return this.deathRings.length - 1;
        }
        let oldest = 0;
        for (let index = 1; index < this.deathRingAges.length; index += 1) {
            if (this.deathRingAges[index] > this.deathRingAges[oldest]) {
                oldest = index;
            }
        }
        return oldest;
    }

    /** 把所有活跃特效推进一个输出帧，寿命到即归还池。 */
    private advanceEffects(): void {
        const effects = this.config.effects;

        for (let index = 0; index < this.damageNumbers.length; index += 1) {
            if (!this.damageNumberActive[index]) {
                continue;
            }
            const age = this.damageNumberAges[index] + 1;
            this.damageNumberAges[index] = age;
            if (age >= effects.damageNumberLifetimeFrames) {
                this.deactivateDamageNumber(index);
                continue;
            }
            const node = this.damageNumbers[index];
            node.position.y =
                this.damageNumberBaseY[index] -
                effects.damageNumberRiseMetersPerFrame * age;
            node.alpha = 1 - age / effects.damageNumberLifetimeFrames;
        }

        for (let index = 0; index < this.particles.length; index += 1) {
            if (!this.particleActive[index]) {
                continue;
            }
            const age = this.particleAges[index] + 1;
            this.particleAges[index] = age;
            if (age >= effects.particleLifetimeFrames) {
                this.deactivateParticle(index);
                continue;
            }
            const node = this.particles[index];
            node.position.set(
                this.particleOriginX[index] +
                    this.particleVelocityX[index] * age,
                this.particleOriginY[index] +
                    this.particleVelocityY[index] * age
            );
            node.alpha = 1 - age / effects.particleLifetimeFrames;
        }

        const ringStart =
            this.config.geometry.armorRadius * DEATH_RING_START_FACTOR;
        const ringEnd =
            this.config.geometry.armorRadius * DEATH_RING_END_FACTOR;
        for (let index = 0; index < this.deathRings.length; index += 1) {
            if (!this.deathRingActive[index]) {
                continue;
            }
            const age = this.deathRingAges[index] + 1;
            this.deathRingAges[index] = age;
            if (age >= effects.deathEffectLifetimeFrames) {
                this.deactivateDeathRing(index);
                continue;
            }
            const progress = age / effects.deathEffectLifetimeFrames;
            const node = this.deathRings[index];
            node.scale.set(ringStart + (ringEnd - ringStart) * progress);
            node.alpha = 1 - progress;
        }
    }

    /**
     * 归还一个伤害数字到池。
     * @param index 池下标。
     */
    private deactivateDamageNumber(index: number): void {
        this.damageNumberActive[index] = false;
        this.damageNumberAges[index] = 0;
        const node = this.damageNumbers[index];
        if (node !== undefined) {
            node.visible = false;
        }
    }

    /**
     * 归还一个火花到池。
     * @param index 池下标。
     */
    private deactivateParticle(index: number): void {
        this.particleActive[index] = false;
        this.particleAges[index] = 0;
        const node = this.particles[index];
        if (node !== undefined) {
            node.visible = false;
        }
    }

    /**
     * 归还一个死亡环到池。
     * @param index 池下标。
     */
    private deactivateDeathRing(index: number): void {
        this.deathRingActive[index] = false;
        this.deathRingAges[index] = 0;
        const node = this.deathRings[index];
        if (node !== undefined) {
            node.visible = false;
        }
    }

    /**
     * 只在格式化字符串确实变化时写入信息条（Pitfall 4）。
     * @param frame 本帧 HUD 数据。
     */
    private updateInfoBar(frame: IHudFrame): void {
        const next = formatGameTime(frame.gameMinutes, frame.minutesPerTick);
        if (this.infoText.text !== next) {
            this.infoText.text = next;
        }
    }

    /**
     * 把文本缩放到目标世界高度：先把缩放归一化再测量，因此重复调用不会累乘。
     * @param text 世界层文本节点。
     * @param worldHeight 目标世界高度（米）。
     */
    private applyWorldHeight(text: Text, worldHeight: number): void {
        text.scale.set(1);
        const localHeight = text.getLocalBounds().height;
        const height = localHeight > 0 ? localHeight : HUD_RASTER_FONT_PX;
        text.scale.set(worldHeight / height);
    }
}
