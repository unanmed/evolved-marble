/**
 * 王国感知世界：`class KingdomSensingWorld implements ISensingWorld`（D-02/D-27）。
 * 用解析几何提供：地图矩形边界、场景地形矩形与传入的敌方遮挡圆；
 * 绝不使用物理层射线（`IPhysicsWorld` 无射线能力），也不把城池当几何（research Pitfall 19）。
 * 地形在本计划就已进入射线几何，plan 04-04 只需再接上「阻挡移动」的静态障碍。
 */

import { RAY_COUNT } from '@/control/constants';
import type {
    IProjectileSighting,
    ISensedUnit,
    ISensingWorld
} from '@/control/types';
import type { ITerrainRect } from '@/kingdom/types';

/**
 * 恒空的射弹列表：王国层目前没有射弹系统（D-04），共享只读空数组避免每次查询分配。
 */
const EMPTY_PROJECTILES: readonly IProjectileSighting[] = [];

/**
 * 王国感知世界：地图边界 + 地形矩形 + 敌方遮挡圆。
 */
export class KingdomSensingWorld implements ISensingWorld {
    /** 地图宽度（米）。 */
    private readonly width: number;
    /** 地图高度（米）。 */
    private readonly height: number;
    /** 场景地形矩形（轴对齐，挡射线）。 */
    private readonly terrain: readonly ITerrainRect[];

    /**
     * 构造王国感知世界。地图矩形为 `[0, width] × [0, height]`。
     * @param width 地图宽度（米）。
     * @param height 地图高度（米）。
     * @param terrain 场景地形矩形。
     */
    constructor(
        width: number,
        height: number,
        terrain: readonly ITerrainRect[]
    ) {
        this.width = width;
        this.height = height;
        this.terrain = terrain;
    }

    /**
     * 投射 `RAY_COUNT` 条世界坐标固定方向射线：起点角 0（+x），逆时针每步
     * `2π / RAY_COUNT`（与 `tests/control/arena.ts` 约定一致）。每条射线取地图边界、
     * 地形矩形与敌方遮挡圆的最近正向交点，截到 `[0, maxDistance]`；
     * 无命中或非有限值取 `maxDistance`。结果恰为 `RAY_COUNT` 个。
     * @param originX 原点 x 坐标（米）。
     * @param originY 原点 y 坐标（米）。
     * @param maxDistance 最远距离（米）。
     * @param blockers 敌方遮挡圆（友方永不传入，D-02）。
     * @returns 每条射线的最短距离。
     */
    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[] {
        const limit =
            Number.isFinite(maxDistance) && maxDistance > 0 ? maxDistance : 0;
        const distances: number[] = [];
        const step = (Math.PI * 2) / RAY_COUNT;

        for (let index = 0; index < RAY_COUNT; index += 1) {
            const angle = index * step;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);

            let nearest = this.rayRectDistance(
                originX,
                originY,
                dx,
                dy,
                0,
                0,
                this.width,
                this.height
            );

            for (const rect of this.terrain) {
                const hit = this.rayRectDistance(
                    originX,
                    originY,
                    dx,
                    dy,
                    rect.x - rect.halfWidth,
                    rect.y - rect.halfHeight,
                    rect.x + rect.halfWidth,
                    rect.y + rect.halfHeight
                );
                if (hit < nearest) {
                    nearest = hit;
                }
            }

            for (const blocker of blockers) {
                const hit = this.rayCircleDistance(
                    originX,
                    originY,
                    dx,
                    dy,
                    blocker.x,
                    blocker.y,
                    blocker.radius
                );
                if (hit < nearest) {
                    nearest = hit;
                }
            }

            const bounded = Math.min(nearest, limit);
            distances.push(
                Number.isFinite(bounded) ? Math.max(0, bounded) : limit
            );
        }
        return distances;
    }

    /**
     * 王国层目前没有射弹，恒返回共享只读空数组。
     * @returns 空射弹列表。
     */
    queryProjectiles(
        _x: number,
        _y: number,
        _radius: number
    ): readonly IProjectileSighting[] {
        return EMPTY_PROJECTILES;
    }

    /**
     * 射线与轴对齐矩形的最近正向交点（slab 法）。原点在矩形内时返回出口距离；
     * 原点在外且射线指向外部时无命中。
     * @param originX 原点 x 坐标。
     * @param originY 原点 y 坐标。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @param minX 矩形最小 x。
     * @param minY 矩形最小 y。
     * @param maxX 矩形最大 x。
     * @param maxY 矩形最大 y。
     * @returns 最近正向距离；无命中返回 `Infinity`。
     */
    private rayRectDistance(
        originX: number,
        originY: number,
        dx: number,
        dy: number,
        minX: number,
        minY: number,
        maxX: number,
        maxY: number
    ): number {
        const slab = (
            origin: number,
            direction: number,
            min: number,
            max: number
        ): [number, number] => {
            if (Math.abs(direction) < 1e-12) {
                const outside = origin < min || origin > max;
                return outside ? [Infinity, -Infinity] : [-Infinity, Infinity];
            }
            const first = (min - origin) / direction;
            const second = (max - origin) / direction;
            return first < second ? [first, second] : [second, first];
        };

        const [xEnter, xExit] = slab(originX, dx, minX, maxX);
        const [yEnter, yExit] = slab(originY, dy, minY, maxY);
        const enter = Math.max(xEnter, yEnter);
        const exit = Math.min(xExit, yExit);
        if (exit < 0 || enter > exit) {
            return Infinity;
        }
        return enter >= 0 ? enter : exit;
    }

    /**
     * 射线与圆的最近正向交点（二次方程，`a = 1`）。原点在圆内时返回 0（已重叠）。
     * @param originX 原点 x 坐标。
     * @param originY 原点 y 坐标。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @param centerX 圆心 x 坐标。
     * @param centerY 圆心 y 坐标。
     * @param radius 圆半径（米）。
     * @returns 最近正向距离；无命中返回 `Infinity`。
     */
    private rayCircleDistance(
        originX: number,
        originY: number,
        dx: number,
        dy: number,
        centerX: number,
        centerY: number,
        radius: number
    ): number {
        const relX = originX - centerX;
        const relY = originY - centerY;
        const b = 2 * (relX * dx + relY * dy);
        const c = relX * relX + relY * relY - radius * radius;
        const discriminant = b * b - 4 * c;
        if (discriminant < 0) {
            return Infinity;
        }
        const root = Math.sqrt(discriminant);
        const first = (-b - root) / 2;
        if (first >= 0) {
            return first;
        }
        const second = (-b + root) / 2;
        return second >= 0 ? 0 : Infinity;
    }
}
