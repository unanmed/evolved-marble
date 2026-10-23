/**
 * 默认单位视图 `class GeometryUnitView implements IUnitView`（D-03/D-06/D-08/G-5）。
 * 根是 `Container`（v8 的 `Graphics` 是叶节点，不能再有子节点），本体旋转放在**子容器**上，
 * 因此等级数字/血条等不旋转元素将来可以作为兄弟节点挂在根上而不受朝向影响。
 * `apply()` 只写位置、旋转、可见性、本体着色与闪白环可见性——**永不重建几何**；
 * `destroy()` 只释放本实例的显示对象，**绝不**销毁工厂共享的 `GraphicsContext`（Pitfall 5）。
 */

import { Container, Graphics } from 'pixi.js';

import type { IUnitView, IUnitViewSpec, IUnitViewState } from '@/render/types';

/**
 * 程序化几何单位视图：一个根容器 + 一个旋转子容器 + 本体/武器/防具图形 + 共享闪白环。
 */
export class GeometryUnitView implements IUnitView {
    /** 创建时快照的视觉身份：阵营色是唯一的每实例视觉变量。 */
    private readonly spec: IUnitViewSpec;
    /** 交给单位层的场景图根节点：自身不旋转，闪白环挂在这里。 */
    private readonly root: Container;
    /** 承载本体/武器/防具的旋转子容器：`rotation` 直接取物理角度。 */
    private readonly rotator: Container;
    /** 本体图形：白色底，靠 `tint` 变成阵营色。 */
    private readonly body: Graphics;
    /** 工厂共享几何的闪白环：只切换可见性。 */
    private readonly flashRing: Graphics;
    /** 受击闪白色（来自 `IRenderPalette.flash`）：命中时替换本体着色。 */
    private readonly flashColor: number;

    /**
     * 构造单位视图：全部显示对象与几何均已由工厂创建，这里只保存引用。
     * @param spec 创建时快照的视觉身份。
     * @param root 场景图根节点（不旋转）。
     * @param rotator 旋转子容器（本体/武器/防具的父节点）。
     * @param body 本体图形（已按阵营色着色）。
     * @param flashRing 闪白环图形（共享几何，初始隐藏）。
     * @param flashColor 受击闪白色。
     */
    constructor(
        spec: IUnitViewSpec,
        root: Container,
        rotator: Container,
        body: Graphics,
        flashRing: Graphics,
        flashColor: number
    ) {
        this.spec = spec;
        this.root = root;
        this.rotator = rotator;
        this.body = body;
        this.flashRing = flashRing;
        this.flashColor = flashColor;
    }

    /**
     * 场景图根节点：单位层把它挂到自己的层上。
     * @returns 根 `Container`。
     */
    getRoot(): Container {
        return this.root;
    }

    /**
     * 应用一帧状态：只写变换/可见性/着色，不触碰几何（D-06）。
     * 本体为白色底，`tint = factionColor` 得到阵营色；受击时改回闪白色并显示共享圆环——
     * Pixi 的 tint 是乘法，深色本体无法被提亮，故闪白只能靠“去色 + 白环”（Pitfall 6）。
     * @param state 本帧的位置、朝向、闪白标记与裁剪可见性。
     */
    apply(state: IUnitViewState): void {
        this.root.position.set(state.x, state.y);
        this.rotator.rotation = state.angle;
        this.root.visible = state.visible;
        this.body.tint = state.flash
            ? this.flashColor
            : this.spec.visual.factionColor;
        this.flashRing.visible = state.flash && state.visible;
    }

    /**
     * 释放本实例：只销毁自己的根及其子节点，**不传**销毁上下文的选项，
     * 否则会连带销毁工厂共享的几何上下文，使同型号单位全部变空白（G-5/Pitfall 5）。
     */
    destroy(): void {
        this.root.destroy({ children: true });
    }
}
