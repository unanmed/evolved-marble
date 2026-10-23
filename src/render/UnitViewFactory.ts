/**
 * 单位视图工厂 `class UnitViewFactory implements IUnitViewFactory`（D-03/D-04/G-5）。
 * 几何**只建一次**：本体、全部 6 种武器、2 种防具与闪白环各一个共享 `GraphicsContext`，
 * 之后每个 `create()` 只 new 出 `Graphics` 实例引用这些上下文——几十个单位共享约 10 份几何，
 * 而不是各自复制上百份（Pattern 4）。
 * 所有尺寸都取自 `IRenderConfig.geometry`（即物理层的 `DEFAULT_GEOMETRY`）：
 * 武器画在局部 `x ≈ weaponOffsetX`、长轴沿局部 y，正好落在 Rapier 的武器 capsule 上，
 * 因此画面不会对碰撞说谎（D-04/Pitfall 15）。
 */

import { Container, Graphics, GraphicsContext } from 'pixi.js';

import { FLASH_RING_OFFSET_METERS } from '@/render/constants';
import { GeometryUnitView } from '@/render/GeometryUnitView';
import type {
    IRenderConfig,
    IUnitView,
    IUnitViewFactory,
    IUnitViewSpec
} from '@/render/types';
import { ArmorKind, WeaponKind } from '@/units/types';

/**
 * 本体几何：白色圆 + 深色细描边。
 * 白色底是必须的——Pixi 的 `tint` 是乘法，只有白色才能被染成任意阵营色（Pitfall 6）。
 * @param config 渲染配置（尺寸来自 `geometry`，描边色来自 `palette`）。
 * @returns 共享的本体几何上下文。
 */
function buildBodyContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    return new GraphicsContext()
        .circle(0, 0, geometry.bodyRadius)
        .fill(0xffffff)
        .stroke({
            width: geometry.weaponRadius * 0.8,
            color: config.palette.healthBorder
        });
}

/**
 * 闪白环几何：套在防具外一圈的圆环，冷却与受击反馈共用同一份几何。
 * @param config 渲染配置（半径 = `armorRadius + FLASH_RING_OFFSET_METERS`）。
 * @returns 共享的闪白环几何上下文。
 */
function buildFlashContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    return new GraphicsContext()
        .circle(0, 0, geometry.armorRadius + FLASH_RING_OFFSET_METERS)
        .stroke({
            width: geometry.weaponRadius * 1.6,
            color: config.palette.flash
        });
}

/**
 * 握把几何：从本体边缘沿局部 +x 连到武器中心 `weaponOffsetX`，让武器看起来被握着。
 * @param config 渲染配置。
 * @returns 已完成填充的几何上下文（调用方继续追加轮廓）。
 */
function drawGrip(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const gripStart = geometry.bodyRadius * 0.9;
    return new GraphicsContext()
        .rect(
            gripStart,
            -geometry.weaponRadius * 0.6,
            geometry.weaponOffsetX - gripStart,
            geometry.weaponRadius * 1.2
        )
        .fill(config.palette.weapon);
}

/**
 * 长剑：细长刀身沿 y 贯穿半长、垂直护手、尖头。
 * @param config 渲染配置。
 * @returns 共享的长剑几何上下文。
 */
function buildLongswordContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const guardWidth = halfLength * 1.3;
    return drawGrip(config)
        .rect(
            geometry.weaponOffsetX - geometry.weaponRadius,
            -halfLength,
            geometry.weaponRadius * 2,
            halfLength * 2
        )
        .fill(config.palette.weapon)
        .rect(
            geometry.weaponOffsetX - guardWidth / 2,
            -geometry.weaponRadius,
            guardWidth,
            geometry.weaponRadius * 2
        )
        .fill(config.palette.armor)
        .poly([
            geometry.weaponOffsetX - geometry.weaponRadius,
            halfLength,
            geometry.weaponOffsetX + geometry.weaponRadius,
            halfLength,
            geometry.weaponOffsetX,
            halfLength + geometry.weaponRadius * 2.4
        ])
        .fill(config.palette.weapon);
}

/**
 * 短剑：更短更宽的刀身 + 更短的护手，与长剑一眼可分。
 * @param config 渲染配置。
 * @returns 共享的短剑几何上下文。
 */
function buildShortswordContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const bladeHalf = halfLength * 0.7;
    const bladeWidth = geometry.weaponRadius * 2.6;
    const guardWidth = halfLength * 0.9;
    return drawGrip(config)
        .rect(
            geometry.weaponOffsetX - bladeWidth / 2,
            -bladeHalf,
            bladeWidth,
            bladeHalf * 2
        )
        .fill(config.palette.weapon)
        .rect(
            geometry.weaponOffsetX - guardWidth / 2,
            -geometry.weaponRadius * 0.9,
            guardWidth,
            geometry.weaponRadius * 1.8
        )
        .fill(config.palette.armor);
}

/**
 * 斧：细杆 + 只在 +y 端、只向 +x 偏的**不对称**斧刃。
 * @param config 渲染配置。
 * @returns 共享的斧几何上下文。
 */
function buildAxeContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const shaftWidth = geometry.weaponRadius;
    const headStart = halfLength * 0.45;
    return drawGrip(config)
        .rect(
            geometry.weaponOffsetX - shaftWidth / 2,
            -halfLength,
            shaftWidth,
            halfLength * 2
        )
        .fill(config.palette.weapon)
        .poly([
            geometry.weaponOffsetX - shaftWidth / 2,
            headStart,
            geometry.weaponOffsetX - shaftWidth / 2,
            halfLength,
            geometry.weaponOffsetX + halfLength * 0.8,
            halfLength - geometry.weaponRadius,
            geometry.weaponOffsetX + halfLength * 0.55,
            headStart
        ])
        .fill(config.palette.weapon);
}

/**
 * 锤：细杆 + +y 端的**厚矩形**锤头，与斧的尖刃形成对比。
 * @param config 渲染配置。
 * @returns 共享的锤几何上下文。
 */
function buildHammerContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const shaftWidth = geometry.weaponRadius;
    const headHeight = halfLength * 0.55;
    const headWidth = geometry.weaponRadius * 4.8;
    return drawGrip(config)
        .rect(
            geometry.weaponOffsetX - shaftWidth / 2,
            -halfLength,
            shaftWidth,
            halfLength * 2
        )
        .fill(config.palette.weapon)
        .rect(
            geometry.weaponOffsetX - headWidth / 2,
            halfLength - headHeight,
            headWidth,
            headHeight
        )
        .fill(config.palette.armor);
}

/**
 * 弓：一道向 +x 微凸的浅弧 + 一条弦，没有厚刀身——与所有近战武器形状不同。
 * @param config 渲染配置。
 * @returns 共享的弓几何上下文。
 */
function buildBowContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const belly = geometry.weaponOffsetX + halfLength * 0.55;
    return drawGrip(config)
        .poly(
            [
                geometry.weaponOffsetX,
                -halfLength,
                belly,
                0,
                geometry.weaponOffsetX,
                halfLength
            ],
            false
        )
        .stroke({
            width: geometry.weaponRadius * 1.2,
            color: config.palette.weapon
        })
        .poly(
            [
                geometry.weaponOffsetX,
                -halfLength,
                geometry.weaponOffsetX,
                halfLength
            ],
            false
        )
        .stroke({
            width: geometry.weaponRadius * 0.5,
            color: config.palette.armor
        });
}

/**
 * 矛：细杆穿过半长并继续延伸，末端收成尖头。
 * @param config 渲染配置。
 * @returns 共享的矛几何上下文。
 */
function buildSpearContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfLength = geometry.weaponHalfLength;
    const shaftWidth = geometry.weaponRadius * 0.9;
    const tipBase = halfLength * 1.1;
    const tipEnd = halfLength * 1.5;
    return drawGrip(config)
        .rect(
            geometry.weaponOffsetX - shaftWidth / 2,
            -halfLength,
            shaftWidth,
            tipBase + halfLength
        )
        .fill(config.palette.weapon)
        .poly([
            geometry.weaponOffsetX - geometry.weaponRadius * 1.9,
            tipBase,
            geometry.weaponOffsetX + geometry.weaponRadius * 1.9,
            tipBase,
            geometry.weaponOffsetX,
            tipEnd
        ])
        .fill(config.palette.weapon);
}

/**
 * 头盔：贴近防具半径的细圆环 + 前向（+x）小圆顶。
 * @param config 渲染配置。
 * @returns 共享的头盔几何上下文。
 */
function buildHelmetContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    return new GraphicsContext()
        .circle(0, 0, geometry.armorRadius * 0.94)
        .stroke({
            width: geometry.weaponRadius * 1.8,
            color: config.palette.armor
        })
        .circle(geometry.bodyRadius * 0.5, 0, geometry.bodyRadius * 0.36)
        .fill(config.palette.armor);
}

/**
 * 盾牌：前向（+x）120° 的厚重弧带，明显比头盔的细环更重。
 * @param config 渲染配置。
 * @returns 共享的盾牌几何上下文。
 */
function buildShieldContext(config: IRenderConfig): GraphicsContext {
    const geometry = config.geometry;
    const halfArc = Math.PI / 3;
    return new GraphicsContext()
        .arc(
            0,
            0,
            geometry.armorRadius - geometry.weaponRadius * 1.6,
            -halfArc,
            halfArc
        )
        .stroke({
            width: geometry.weaponRadius * 4.4,
            color: config.palette.armor
        });
}

/**
 * 默认程序化几何视图工厂：拥有并统一释放全部共享几何。
 */
export class UnitViewFactory implements IUnitViewFactory {
    /** 渲染配置：尺寸与配色的唯一来源。 */
    private readonly config: IRenderConfig;
    /** 共享本体几何（白色圆）。 */
    private readonly bodyContext: GraphicsContext;
    /** 共享闪白环几何。 */
    private readonly flashContext: GraphicsContext;
    /** 武器种类 → 共享几何。 */
    private readonly weaponContexts: Readonly<
        Record<WeaponKind, GraphicsContext>
    >;
    /** 防具种类 → 共享几何。 */
    private readonly armorContexts: Readonly<
        Record<ArmorKind, GraphicsContext>
    >;
    /** 全部共享几何的所有权清单：`dispose()` 只按它销毁一次。 */
    private readonly sharedContexts: GraphicsContext[] = [];
    /** 是否已释放：保证 `dispose()` 幂等。 */
    private disposed = false;

    /**
     * 构造工厂：在此一次性建好本体、闪白环、6 种武器与 2 种防具的几何。
     * @param config 渲染配置（`geometry` 必须等于物理几何）。
     */
    constructor(config: IRenderConfig) {
        this.config = config;
        this.bodyContext = buildBodyContext(config);
        this.flashContext = buildFlashContext(config);
        this.weaponContexts = {
            [WeaponKind.Longsword]: buildLongswordContext(config),
            [WeaponKind.Shortsword]: buildShortswordContext(config),
            [WeaponKind.Axe]: buildAxeContext(config),
            [WeaponKind.Hammer]: buildHammerContext(config),
            [WeaponKind.Bow]: buildBowContext(config),
            [WeaponKind.Spear]: buildSpearContext(config)
        };
        this.armorContexts = {
            [ArmorKind.Helmet]: buildHelmetContext(config),
            [ArmorKind.Shield]: buildShieldContext(config)
        };
        this.sharedContexts.push(
            this.bodyContext,
            this.flashContext,
            ...Object.values(this.weaponContexts),
            ...Object.values(this.armorContexts)
        );
    }

    /**
     * 创建一个单位视图：只 new 出 `Graphics` 实例，几何全部复用共享上下文。
     * 根容器不旋转，本体/武器/防具挂在旋转子容器上，闪白环挂在根上以保持直立。
     * @param spec 创建时快照的视觉身份（阵营色、武器、防具）。
     * @returns 已装配好的单位视图。
     */
    create(spec: IUnitViewSpec): IUnitView {
        const root = new Container();
        const rotator = new Container();
        root.addChild(rotator);

        const body = new Graphics(this.bodyContext);
        body.tint = spec.visual.factionColor;
        rotator.addChild(body);

        const weapon = spec.visual.weapon;
        if (weapon !== undefined) {
            rotator.addChild(new Graphics(this.weaponContexts[weapon]));
        }
        for (const armor of spec.visual.armors) {
            rotator.addChild(new Graphics(this.armorContexts[armor]));
        }

        const flashRing = new Graphics(this.flashContext);
        flashRing.visible = false;
        root.addChild(flashRing);

        return new GeometryUnitView(
            spec,
            root,
            rotator,
            body,
            flashRing,
            this.config.palette.flash
        );
    }

    /**
     * 幂等释放全部共享几何：每个上下文恰好销毁一次，重复调用是空操作。
     * 单个视图的 `destroy()` 不得触碰这些上下文（G-5/Pitfall 5）。
     */
    dispose(): void {
        if (this.disposed) {
            return;
        }
        this.disposed = true;
        for (const context of this.sharedContexts) {
            context.destroy();
        }
        this.sharedContexts.length = 0;
    }
}
