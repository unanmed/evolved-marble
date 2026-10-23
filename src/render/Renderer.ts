/**
 * 渲染器 `class Renderer implements IRenderer` 与模块级 `createRenderer` 工厂
 * （D-01/D-13/D-14/D-17/D-18/D-21）。
 * 本类是**薄适配器**：每个决定都来自 `cameraMath` / `frameModel` / `hudModel` / 配置，
 * 自身只决定“何时读取、创建、销毁与绘制”。
 * 它不拥有循环、不推进物理或控制、不排空战斗生命周期事件：
 * `renderFrame()` 只同步画一帧并恰好调用一次 `app.render()`，
 * 因此 Phase 6 可以逐帧取 canvas 而不会有隐藏的 ticker 与它竞争。
 * 全景军队/城池标志由模块级纯函数 `buildStrategicFrame` 产出，
 * 全景层不含单位列表——“全景不渲染单位”因此是结构性质（D-14）。
 */

import { Application, Container, Graphics, Text } from 'pixi.js';

import { Camera } from '@/render/Camera';
import { worldToScreen } from '@/render/cameraMath';
import {
    CULL_MARGIN_METERS,
    FALLBACK_FACTION_COLORS,
    validateRenderConfig
} from '@/render/constants';
import {
    isUnitVisible,
    resolveFactionColor,
    resolveTargetPoints,
    resolveUnitViewSpec
} from '@/render/frameModel';
import { Hud } from '@/render/Hud';
import {
    computeHudScale,
    computeShakeImpulsePx,
    healthRatio,
    isHealthVisible,
    pruneTimers,
    registerDamage
} from '@/render/hudModel';
import { CameraMode } from '@/render/types';
import type {
    ICamera,
    ICameraTransform,
    IHud,
    IHudFrame,
    IHudTimers,
    IHudUnitState,
    IRenderConfig,
    IRenderDamageEvent,
    IRenderServices,
    IRenderer,
    IStrategicArmyMarker,
    IStrategicCityMarker,
    IStrategicFrame,
    IUnitView,
    IUnitViewFactory,
    IViewport,
    RenderServicesProvider
} from '@/render/types';
import { CityKind } from '@/kingdom/types';
import type { IMapBounds, ITerrainRect, IVec2, IWorld } from '@/kingdom/types';
import { UnitViewFactory } from '@/render/UnitViewFactory';
import { AttributeKind } from '@/units/types';

/** 静态地图网格的线间隔（米）：本阶段“地图分区”的全部答案（D-01）。 */
const GRID_STEP_METERS = 100;

/** 网格线宽度（米）：与地面同属世界尺寸。 */
const GRID_LINE_WIDTH_METERS = 0.8;

/** 全景军队箭头的长度（屏幕像素）。 */
const ARMY_ARROW_SIZE_PX = 16;

/** 全景普通城池方块的边长（屏幕像素）。 */
const CITY_MARKER_SIZE_PX = 12;

/** 全景主城方块的边长（屏幕像素）：主城明显更大（D-14）。 */
const CITY_MARKER_CAPITAL_SIZE_PX = 20;

/** 全景标记描边宽度（屏幕像素）。 */
const MARKER_STROKE_PX = 2;

/** 全景标签字号（屏幕像素）：比信息条小，避免遮挡地图。 */
const STRATEGIC_LABEL_FONT_PX = 14;

/** 全景标签描边宽度相对字号的比例。 */
const STRATEGIC_LABEL_STROKE_RATIO = 0.15;

/** 军队兵力标签相对箭头的横向偏移（屏幕像素）。 */
const ARMY_LABEL_OFFSET_PX = 12;

/** 城池标签相对方块的纵向偏移（屏幕像素）。 */
const CITY_LABEL_OFFSET_PX = 16;

/** 主城标签文案（城池没有名称访问器，只有规模）。 */
const CITY_LABEL_CAPITAL = '主城';

/** 普通城标签文案。 */
const CITY_LABEL_NORMAL = '城';

/** 空文本：新建标签在首次写入前的内容。 */
const EMPTY_TEXT = '';

/**
 * 由上帝视角读取面构建无战斗全景帧（D-14）：
 * 只读 `getFactions` → `getArmyIds`/`getCityIds` → `getArmy`/`getCity`，
 * 绝不使用受视野限制的查询；不解析颜色（由调用方决定），也不做任何投影以外的工作。
 * 非有限坐标被跳过，因此镜头不会被一个坏点拖走（T-05-36）。
 * @param world 王国世界读取面（上帝视角）。
 * @param transform 本帧镜头变换。
 * @param viewport 当前画布视口（像素）。
 * @returns 契约批准的 `IStrategicFrame`（军队箭头 + 城池标志）。
 */
export function buildStrategicFrame(
    world: IWorld,
    transform: ICameraTransform,
    viewport: IViewport
): IStrategicFrame {
    const armies: IStrategicArmyMarker[] = [];
    const cities: IStrategicCityMarker[] = [];

    for (const faction of world.getFactions()) {
        for (const armyId of faction.getArmyIds()) {
            const army = world.getArmy(armyId);
            if (army === null) {
                continue;
            }
            const center = army.getCenter();
            if (!Number.isFinite(center.x) || !Number.isFinite(center.y)) {
                continue;
            }
            armies.push({
                armyId,
                factionId: army.getFactionId(),
                screen: worldToScreen(center, transform, viewport),
                heading: army.getHeading(),
                strength: army.getUnitIds().length
            });
        }

        for (const cityId of faction.getCityIds()) {
            const city = world.getCity(cityId);
            if (city === null) {
                continue;
            }
            const position = city.getPosition();
            if (!Number.isFinite(position.x) || !Number.isFinite(position.y)) {
                continue;
            }
            cities.push({
                cityId,
                factionId: city.getFactionId(),
                screen: worldToScreen(position, transform, viewport),
                kind: city.getKind()
            });
        }
    }

    return { armies, cities };
}

/**
 * 校验配置、初始化 Pixi 应用并构建渲染器（D-13/D-18/T-05-32/T-05-35）。
 * 校验先于任何 Pixi 分配；应用以手动渲染（`autoStart: false`）与
 * 保留绘制缓冲（`preserveDrawingBuffer: true`）启动，
 * 后备存储恒为 `config.width × config.height`（`resolution: 1`、`autoDensity: false`）。
 * 若 `app.init` 拒绝，本函数直接抛出且不返回渲染器。
 * @param provider 只读服务提供者（每个输出帧重新读取）。
 * @param config 渲染配置（先校验）。
 * @returns 已初始化、尚未绘制任何帧的渲染器。
 */
export async function createRenderer(
    provider: RenderServicesProvider,
    config: IRenderConfig
): Promise<IRenderer> {
    validateRenderConfig(config);

    const app = new Application();
    await app.init({
        width: config.width,
        height: config.height,
        backgroundColor: config.palette.background,
        antialias: true,
        resolution: 1,
        autoDensity: false,
        preference: 'webgl',
        autoStart: false,
        preserveDrawingBuffer: true
    });

    return new Renderer(app, provider, config);
}

/** 逐帧绘制器：拥有场景图、镜头、单位视图、全景标志与 HUD，但不拥有循环。 */
export class Renderer implements IRenderer {
    /** Pixi 应用：`getCanvas()` 的后备存储持有人。 */
    private readonly app: Application;
    /** 只读服务提供者：每个输出帧重新读取一次（D-18/D-19）。 */
    private readonly provider: RenderServicesProvider;
    /** 渲染配置：全部尺寸、上限与阈值的唯一来源。 */
    private readonly config: IRenderConfig;
    /** 画布视口（像素）：恒等于配置尺寸。 */
    private readonly viewport: IViewport;
    /** 自动镜头：Phase 6 与操作面板经 `getCamera()` 驱动。 */
    private readonly camera: ICamera;
    /** 单位视图工厂：视图的唯一创建者与共享几何的所有者（D-03）。 */
    private readonly factory: IUnitViewFactory;
    /** HUD 适配器。 */
    private readonly hud: IHud;
    /** 受镜头变换的世界层。 */
    private readonly worldLayer: Container;
    /** 静态地图层（地面/网格/地形）：每个世界只画一次。 */
    private readonly mapLayer: Container;
    /** 单位视图层：只在战斗特写可见。 */
    private readonly unitLayer: Container;
    /** 世界层 HUD（血条/等级/特效）。 */
    private readonly hudLayer: Container;
    /** 全景层：军队/城池标志，不受镜头变换。 */
    private readonly strategicLayer: Container;
    /** 屏幕层：信息条等固定像素元素。 */
    private readonly screenLayer: Container;
    /** unitId → 单位视图：跨模式保留，只在单位离开目录时销毁（G-6）。 */
    private readonly unitViews = new Map<number, IUnitView>();
    /** unitId → 闪白持续到的输出帧（不含）。 */
    private readonly flashUntil = new Map<number, number>();
    /** armyId → 全景箭头。 */
    private readonly armyArrows = new Map<number, Graphics>();
    /** armyId → 兵力标签。 */
    private readonly armyLabels = new Map<number, Text>();
    /** cityId → 全景城池标志。 */
    private readonly cityMarkers = new Map<number, Graphics>();
    /** cityId → 城池标签。 */
    private readonly cityLabels = new Map<number, Text>();
    /** HUD 血条计时工作状态（一律以输出帧计）。 */
    private readonly hudTimers: IHudTimers = { visibleUntil: new Map() };
    /** 当前目录中的单位 id 集合：复用同一个集合，避免逐帧分配。 */
    private readonly liveUnitIds = new Set<number>();
    /** 本帧出现过的军队 id 集合（复用）。 */
    private readonly seenArmyIds = new Set<number>();
    /** 本帧出现过的城池 id 集合（复用）。 */
    private readonly seenCityIds = new Set<number>();
    /** 输出帧序号：每次 `renderFrame` 递增一次。 */
    private frameIndex = 0;
    /** 是否已释放：保证 `dispose()` 幂等。 */
    private disposed = false;

    /**
     * 构建渲染器：装配层图、镜头、视图工厂与 HUD，并画出第一张静态地图。
     * Pixi 应用必须已 `init`，本类不再触碰 `init`（工厂函数负责）。
     * @param app 已初始化的 Pixi 应用。
     * @param provider 只读服务提供者。
     * @param config 已校验的渲染配置。
     */
    constructor(
        app: Application,
        provider: RenderServicesProvider,
        config: IRenderConfig
    ) {
        this.app = app;
        this.provider = provider;
        this.config = config;
        this.viewport = { width: config.width, height: config.height };
        this.camera = new Camera(config.camera);
        this.factory = new UnitViewFactory(config);

        this.worldLayer = new Container();
        this.mapLayer = new Container();
        this.unitLayer = new Container();
        this.hudLayer = new Container();
        this.worldLayer.addChild(this.mapLayer, this.unitLayer, this.hudLayer);
        this.strategicLayer = new Container();
        this.screenLayer = new Container();
        app.stage.addChild(this.worldLayer);
        app.stage.addChild(this.strategicLayer);
        app.stage.addChild(this.screenLayer);

        this.hud = new Hud(this.hudLayer, this.screenLayer, config);

        const services = provider();
        this.drawMapLayer(
            services.world.getBounds(),
            services.world.getTerrain()
        );
        this.camera.reset(services.world.getBounds(), this.viewport);
        this.applyTransform(this.camera.getTransform());
    }

    /**
     * 绘制恰好一帧（D-17/D-18）：读取服务 → 推进镜头 → 应用变换 →
     * 同步/裁剪单位视图或全景标志 → 更新 HUD → `app.render()` 一次。
     * 不调度任何东西，也不推进模拟。
     */
    renderFrame(): void {
        const services = this.provider();
        this.frameIndex += 1;

        const points = this.collectTargetPoints(services);
        const events = services.damageFeed.drain();
        const shakeImpulsePx = computeShakeImpulsePx(
            events,
            this.config.effects,
            this.config.camera
        );
        const transform = this.camera.update({
            viewport: this.viewport,
            bounds: services.world.getBounds(),
            points,
            shakeImpulsePx
        });
        this.applyTransform(transform);

        const focus = this.camera.getMode() === CameraMode.BattleFocus;
        this.unitLayer.visible = focus;
        this.hudLayer.visible = focus;
        this.strategicLayer.visible = !focus;

        this.registerFlash(events);
        this.syncUnitViews(services);
        if (focus) {
            this.updateUnitViews(services, transform);
        } else {
            this.updateStrategic(services, transform);
        }
        this.updateHud(services, transform, events, focus);

        this.app.render();
    }

    /**
     * 固定尺寸后备存储：Phase 6 逐帧编码的输入（D-13）。
     * @returns Pixi 渲染器的 canvas 元素。
     */
    getCanvas(): HTMLCanvasElement {
        return this.app.canvas;
    }

    /**
     * 镜头实例：Phase 6 与操作面板经它切换跟拍目标。
     * @returns 本渲染器使用的镜头。
     */
    getCamera(): ICamera {
        return this.camera;
    }

    /**
     * 清空视图/HUD/对象池/帧计数并把镜头复位到全景构图，
     * 但**不**销毁 Pixi 应用（D-18）。
     */
    reset(): void {
        const services = this.provider();
        for (const view of this.unitViews.values()) {
            view.destroy();
        }
        this.unitViews.clear();
        this.flashUntil.clear();
        this.hudTimers.visibleUntil.clear();
        this.clearStrategicNodes();
        this.hud.reset();
        services.damageFeed.clear();
        this.frameIndex = 0;
        this.drawMapLayer(
            services.world.getBounds(),
            services.world.getTerrain()
        );
        this.camera.reset(services.world.getBounds(), this.viewport);
        this.applyTransform(this.camera.getTransform());
    }

    /** 幂等释放：视图、共享几何、HUD 与 Pixi 应用各自恰好释放一次。 */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const view of this.unitViews.values()) {
            view.destroy();
        }
        this.unitViews.clear();
        this.clearStrategicNodes();
        this.flashUntil.clear();
        this.hudTimers.visibleUntil.clear();
        this.liveUnitIds.clear();
        this.seenArmyIds.clear();
        this.seenCityIds.clear();
        this.factory.dispose();
        this.hud.dispose();
        this.app.destroy(true, { children: true });
    }

    /**
     * 解析本帧镜头拟合点：目标战斗的存活成员位置；无目标或目标已消失时为空集。
     * 战斗存在但成员读数全部缺失时退回战斗中心，使拟合盒不会退化为空（D-21）。
     * @param services 本帧只读服务。
     * @returns 拟合点（世界米）；空数组表示全景拟合。
     */
    private collectTargetPoints(services: IRenderServices): readonly IVec2[] {
        const targetId = this.camera.getBattleTarget();
        if (targetId === undefined) {
            return [];
        }
        const battle = services.world
            .getBattleSystem()
            .listActiveBattles()
            .find(candidate => candidate.getId() === targetId);
        if (battle === undefined) {
            return [];
        }
        const points = resolveTargetPoints(battle, unitId =>
            services.physics.getUnitState(unitId)
        );
        if (points.length > 0) {
            return points;
        }
        const center = battle.getCenter();
        return [{ x: center.x, y: center.y }];
    }

    /**
     * 把本帧变换写到世界层：`position = 视口中心 − 镜头中心 × scale + 震动`。
     * 战略层与屏幕层不在此列，因此它们不会随镜头移动（D-14/D-24）。
     * @param transform 本帧镜头变换。
     */
    private applyTransform(transform: ICameraTransform): void {
        this.worldLayer.position.set(
            this.viewport.width / 2 -
                transform.centerX * transform.scale +
                transform.shakeX,
            this.viewport.height / 2 -
                transform.centerY * transform.scale +
                transform.shakeY
        );
        this.worldLayer.scale.set(transform.scale);
    }

    /**
     * 用本帧排空的伤害事件刷新闪白计时（D-06）。
     * @param events 本帧排空的伤害事件。
     */
    private registerFlash(events: readonly IRenderDamageEvent[]): void {
        const until = this.frameIndex + this.config.effects.flashFrames;
        for (const event of events) {
            if (Number.isFinite(event.defenderId)) {
                this.flashUntil.set(event.defenderId, until);
            }
        }
    }

    /**
     * 让单位视图与目录对齐：只为首次出现的 id 创建视图（视觉身份快照一次），
     * 只为已离开目录的 id 销毁视图；画面模式切换**不**销毁任何视图（G-6）。
     * @param services 本帧只读服务。
     */
    private syncUnitViews(services: IRenderServices): void {
        const unitIds = services.catalog.listUnitIds();
        this.liveUnitIds.clear();
        for (const unitId of unitIds) {
            this.liveUnitIds.add(unitId);
        }

        for (const unitId of unitIds) {
            if (this.unitViews.has(unitId)) {
                continue;
            }
            const unit = services.catalog.getUnit(unitId);
            if (unit === null) {
                continue;
            }
            const factionColor = resolveFactionColor(
                services.catalog.getTeam(unitId),
                this.config.factionColors,
                this.config.palette.neutral,
                FALLBACK_FACTION_COLORS
            );
            const view = this.factory.create(
                resolveUnitViewSpec(unitId, unit, factionColor)
            );
            this.unitViews.set(unitId, view);
            this.unitLayer.addChild(view.getRoot());
        }

        for (const unitId of [...this.unitViews.keys()]) {
            if (this.liveUnitIds.has(unitId)) {
                continue;
            }
            const view = this.unitViews.get(unitId);
            if (view !== undefined) {
                view.destroy();
            }
            this.unitViews.delete(unitId);
        }

        for (const unitId of [...this.flashUntil.keys()]) {
            if (!this.liveUnitIds.has(unitId)) {
                this.flashUntil.delete(unitId);
            }
        }
    }

    /**
     * 把本帧运动读数与裁剪结果写进每个单位视图（只在战斗特写调用）。
     * @param services 本帧只读服务。
     * @param transform 本帧镜头变换。
     */
    private updateUnitViews(
        services: IRenderServices,
        transform: ICameraTransform
    ): void {
        for (const unitId of services.catalog.listUnitIds()) {
            const view = this.unitViews.get(unitId);
            if (view === undefined) {
                continue;
            }
            const state = services.physics.getUnitState(unitId);
            if (state === null) {
                continue;
            }
            view.apply({
                x: state.x,
                y: state.y,
                angle: state.angle,
                flash: this.frameIndex < (this.flashUntil.get(unitId) ?? 0),
                visible: isUnitVisible({
                    x: state.x,
                    y: state.y,
                    transform,
                    viewport: this.viewport,
                    marginMeters: CULL_MARGIN_METERS
                })
            });
        }
    }

    /**
     * 绘制无战斗全景：只消费 `IStrategicFrame` 的军队/城池标志，
     * 不投影、不读取受视野限制的查询，也不绘制任何单位（D-14）。
     * @param services 本帧只读服务。
     * @param transform 本帧镜头变换。
     */
    private updateStrategic(
        services: IRenderServices,
        transform: ICameraTransform
    ): void {
        const frame = buildStrategicFrame(
            services.world,
            transform,
            this.viewport
        );

        this.seenArmyIds.clear();
        for (const marker of frame.armies) {
            this.seenArmyIds.add(marker.armyId);
            this.upsertArmyMarker(marker);
        }
        for (const armyId of [...this.armyArrows.keys()]) {
            if (!this.seenArmyIds.has(armyId)) {
                this.releaseArmyMarker(armyId);
            }
        }

        this.seenCityIds.clear();
        for (const marker of frame.cities) {
            this.seenCityIds.add(marker.cityId);
            this.upsertCityMarker(marker);
        }
        for (const cityId of [...this.cityMarkers.keys()]) {
            if (!this.seenCityIds.has(cityId)) {
                this.releaseCityMarker(cityId);
            }
        }
    }

    /**
     * 取用或新建一个军队标志：阵营色箭头按朝向旋转，旁边写兵力数字。
     * @param marker 契约批准的全景军队标志。
     */
    private upsertArmyMarker(marker: IStrategicArmyMarker): void {
        let arrow = this.armyArrows.get(marker.armyId);
        if (arrow === undefined) {
            arrow = new Graphics()
                .poly([
                    ARMY_ARROW_SIZE_PX / 2,
                    0,
                    -ARMY_ARROW_SIZE_PX / 2,
                    -ARMY_ARROW_SIZE_PX / 3,
                    -ARMY_ARROW_SIZE_PX / 2,
                    ARMY_ARROW_SIZE_PX / 3
                ])
                .fill(0xffffff)
                .stroke({
                    width: MARKER_STROKE_PX,
                    color: this.config.palette.healthBorder
                });
            this.armyArrows.set(marker.armyId, arrow);
            this.strategicLayer.addChild(arrow);
        }

        arrow.tint = resolveFactionColor(
            marker.factionId,
            this.config.factionColors,
            this.config.palette.neutral,
            FALLBACK_FACTION_COLORS
        );
        arrow.position.set(marker.screen.x, marker.screen.y);
        arrow.rotation = marker.heading;

        const label = this.ensureArmyLabel(marker.armyId);
        const strength = String(marker.strength);
        if (label.text !== strength) {
            label.text = strength;
        }
        label.position.set(
            marker.screen.x + ARMY_LABEL_OFFSET_PX,
            marker.screen.y
        );
    }

    /**
     * 取用或新建一个城池标志：方块尺寸由规模决定，无主城池用中性色。
     * @param marker 契约批准的全景城池标志。
     */
    private upsertCityMarker(marker: IStrategicCityMarker): void {
        const capital = marker.kind === CityKind.Capital;
        const size = capital
            ? CITY_MARKER_CAPITAL_SIZE_PX
            : CITY_MARKER_SIZE_PX;

        let square = this.cityMarkers.get(marker.cityId);
        if (square === undefined) {
            square = new Graphics()
                .rect(-size / 2, -size / 2, size, size)
                .fill(0xffffff)
                .stroke({
                    width: MARKER_STROKE_PX,
                    color: this.config.palette.healthBorder
                });
            this.cityMarkers.set(marker.cityId, square);
            this.strategicLayer.addChild(square);
        }

        square.tint = resolveFactionColor(
            marker.factionId,
            this.config.factionColors,
            this.config.palette.neutral,
            FALLBACK_FACTION_COLORS
        );
        square.position.set(marker.screen.x, marker.screen.y);

        const label = this.ensureCityLabel(marker.cityId);
        const caption = capital ? CITY_LABEL_CAPITAL : CITY_LABEL_NORMAL;
        if (label.text !== caption) {
            label.text = caption;
        }
        label.position.set(
            marker.screen.x,
            marker.screen.y + CITY_LABEL_OFFSET_PX
        );
    }

    /**
     * 取用或新建军队兵力标签。
     * @param armyId 军队 id。
     * @returns 该军队的标签节点。
     */
    private ensureArmyLabel(armyId: number): Text {
        let label = this.armyLabels.get(armyId);
        if (label === undefined) {
            label = this.createStrategicLabel();
            this.armyLabels.set(armyId, label);
            this.strategicLayer.addChild(label);
        }
        return label;
    }

    /**
     * 取用或新建城池标签。
     * @param cityId 城池 id。
     * @returns 该城池的标签节点。
     */
    private ensureCityLabel(cityId: number): Text {
        let label = this.cityLabels.get(cityId);
        if (label === undefined) {
            label = this.createStrategicLabel();
            this.cityLabels.set(cityId, label);
            this.strategicLayer.addChild(label);
        }
        return label;
    }

    /**
     * 新建一个全景标签（屏幕层像素尺寸，居中锚点）。
     * @returns 尚未写入文本的标签节点。
     */
    private createStrategicLabel(): Text {
        return new Text({
            text: EMPTY_TEXT,
            anchor: 0.5,
            style: {
                fill: this.config.palette.text,
                fontSize: STRATEGIC_LABEL_FONT_PX,
                stroke: {
                    color: this.config.palette.healthBorder,
                    width: Math.max(
                        1,
                        STRATEGIC_LABEL_FONT_PX * STRATEGIC_LABEL_STROKE_RATIO
                    )
                }
            }
        });
    }

    /**
     * 释放一个军队标志（箭头 + 标签）。
     * @param armyId 军队 id。
     */
    private releaseArmyMarker(armyId: number): void {
        const arrow = this.armyArrows.get(armyId);
        if (arrow !== undefined) {
            arrow.destroy();
        }
        this.armyArrows.delete(armyId);
        const label = this.armyLabels.get(armyId);
        if (label !== undefined) {
            label.destroy();
        }
        this.armyLabels.delete(armyId);
    }

    /**
     * 释放一个城池标志（方块 + 标签）。
     * @param cityId 城池 id。
     */
    private releaseCityMarker(cityId: number): void {
        const square = this.cityMarkers.get(cityId);
        if (square !== undefined) {
            square.destroy();
        }
        this.cityMarkers.delete(cityId);
        const label = this.cityLabels.get(cityId);
        if (label !== undefined) {
            label.destroy();
        }
        this.cityLabels.delete(cityId);
    }

    /** 释放全景层上的全部军队/城池标志（reset 与 dispose 共用）。 */
    private clearStrategicNodes(): void {
        for (const armyId of [...this.armyArrows.keys()]) {
            this.releaseArmyMarker(armyId);
        }
        for (const armyId of [...this.armyLabels.keys()]) {
            this.releaseArmyMarker(armyId);
        }
        for (const cityId of [...this.cityMarkers.keys()]) {
            this.releaseCityMarker(cityId);
        }
        for (const cityId of [...this.cityLabels.keys()]) {
            this.releaseCityMarker(cityId);
        }
    }

    /**
     * 组装本帧 HUD 输入并交给 HUD 适配器（D-07/D-08/D-09/D-10/D-11）。
     * 血条计时先按本帧事件登记再按存活 id 清理；
     * 战略模式下单位列表为空、伤害为空，但事件仍已被排空一次（D-06）。
     * @param services 本帧只读服务。
     * @param transform 本帧镜头变换。
     * @param events 本帧排空的伤害事件。
     * @param focus 是否战斗特写。
     */
    private updateHud(
        services: IRenderServices,
        transform: ICameraTransform,
        events: readonly IRenderDamageEvent[],
        focus: boolean
    ): void {
        const unitIds = services.catalog.listUnitIds();
        registerDamage(
            this.hudTimers,
            events,
            this.frameIndex,
            this.config.outputFps,
            this.config.hud.healthBarSeconds
        );
        pruneTimers(this.hudTimers, unitIds);

        const units: IHudUnitState[] = [];
        if (focus) {
            for (const unitId of unitIds) {
                const state = services.physics.getUnitState(unitId);
                if (state === null) {
                    continue;
                }
                const unit = services.catalog.getUnit(unitId);
                if (unit === null) {
                    continue;
                }
                units.push({
                    unitId,
                    x: state.x,
                    y: state.y,
                    factionColor: resolveFactionColor(
                        services.catalog.getTeam(unitId),
                        this.config.factionColors,
                        this.config.palette.neutral,
                        FALLBACK_FACTION_COLORS
                    ),
                    healthRatio: healthRatio(
                        unit.getAttribute(AttributeKind.Health),
                        unit.getAttribute(AttributeKind.MaxHealth)
                    ),
                    level: unit.getAttribute(AttributeKind.Level),
                    healthVisible: isHealthVisible(
                        unitId,
                        this.hudTimers,
                        this.frameIndex,
                        unitIds.length,
                        this.config.hud.alwaysVisibleBelowUnits
                    ),
                    hudScale: computeHudScale(transform.scale, this.config.hud)
                });
            }
        }

        const time = services.world.getTime();
        const frame: IHudFrame = {
            frameIndex: this.frameIndex,
            viewport: this.viewport,
            camera: transform,
            units,
            totalUnits: unitIds.length,
            damage: focus ? events : [],
            gameMinutes: time.getGameMinutes(),
            minutesPerTick: time.getMinutesPerTick()
        };
        this.hud.update(frame);
    }

    /**
     * 重画静态地图层：地面、每 `GRID_STEP_METERS` 米的网格与地形矩形。
     * 只在构造与 `reset()` 时调用——这是本阶段全部的地图“分区”策略（D-01）。
     * @param bounds 地图尺寸（米）。
     * @param terrain 地形矩形列表。
     */
    private drawMapLayer(
        bounds: IMapBounds,
        terrain: readonly ITerrainRect[]
    ): void {
        for (const child of this.mapLayer.removeChildren()) {
            child.destroy();
        }

        const graphics = new Graphics();
        graphics
            .rect(0, 0, bounds.width, bounds.height)
            .fill(this.config.palette.mapFloor);

        for (
            let x = GRID_STEP_METERS;
            x < bounds.width;
            x += GRID_STEP_METERS
        ) {
            graphics.moveTo(x, 0).lineTo(x, bounds.height);
        }
        for (
            let y = GRID_STEP_METERS;
            y < bounds.height;
            y += GRID_STEP_METERS
        ) {
            graphics.moveTo(0, y).lineTo(bounds.width, y);
        }
        graphics.stroke({
            width: GRID_LINE_WIDTH_METERS,
            color: this.config.palette.grid
        });

        for (const rect of terrain) {
            graphics.rect(
                rect.x - rect.halfWidth,
                rect.y - rect.halfHeight,
                rect.halfWidth * 2,
                rect.halfHeight * 2
            );
        }
        graphics.fill(this.config.palette.terrain);

        this.mapLayer.addChild(graphics);
    }
}
