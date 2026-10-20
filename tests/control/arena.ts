/**
 * 测试竞技场：`class ArenaSensingWorld implements ISensingWorld`（D-01/D-02/D-04）。
 * 用解析几何提供矩形世界边界 + 敌方遮挡圆 + 恒空射弹列表；
 * Phase 3 不实现地图障碍，Phase 4 由王国世界实现同一接口。
 * 不引入 Rapier：射线计算全部为纯数学。
 */

import { ARENA_DEFAULT_HALF_EXTENT, RAY_COUNT } from '@/control/constants';
import type {
    IProjectileSighting,
    ISensedUnit,
    ISensingWorld
} from '@/control/types';

/** Phase 3 恒空的射弹列表：共享只读空数组，避免每次查询分配（D-04）。 */
const EMPTY_PROJECTILES: readonly IProjectileSighting[] = [];

/**
 * 测试竞技场：轴对齐矩形边界 + 敌方遮挡圆。
 */
export class ArenaSensingWorld implements ISensingWorld {
    /** 矩形边界的半边长（米）：边界为 `[-halfExtent, halfExtent]²`。 */
    private readonly halfExtent: number;

    /**
     * 构造竞技场。
     * @param halfExtent 矩形半边长（米），默认取 `ARENA_DEFAULT_HALF_EXTENT`。
     */
    constructor(halfExtent: number = ARENA_DEFAULT_HALF_EXTENT) {
        this.halfExtent = halfExtent;
    }

    /**
     * 投射 `RAY_COUNT` 条世界坐标固定方向射线：起点角 0（+x），逆时针每步
     * `2π / RAY_COUNT`。每条射线取边界与遮挡圆的最近正向交点，截到
     * `[0, maxDistance]`；无命中或非有限值取 `maxDistance`。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param maxDistance 最远距离（米）。
     * @param blockers 敌方遮挡圆（友方永不传入，D-02）。
     * @returns 每条射线的最短距离，恰好 `RAY_COUNT` 个。
     */
    castRayFan(
        originX: number,
        originY: number,
        maxDistance: number,
        blockers: readonly ISensedUnit[]
    ): readonly number[] {
        const distances: number[] = [];
        const step = (Math.PI * 2) / RAY_COUNT;
        for (let index = 0; index < RAY_COUNT; index += 1) {
            const angle = index * step;
            const dx = Math.cos(angle);
            const dy = Math.sin(angle);
            let nearest = this.rayBoundaryDistance(originX, originY, dx, dy);
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
            const bounded = Math.min(nearest, maxDistance);
            distances.push(
                Number.isFinite(bounded) ? Math.max(0, bounded) : maxDistance
            );
        }
        return distances;
    }

    /**
     * Phase 3 恒返回空射弹列表（D-04）。
     * @returns 共享空数组。
     */
    queryProjectiles(
        _x: number,
        _y: number,
        _radius: number
    ): readonly IProjectileSighting[] {
        return EMPTY_PROJECTILES;
    }

    /**
     * 射线与轴对齐边界矩形的最近正向交点（slab 法）。
     * 原点在矩形内时返回出口距离；原点在外且射线指向外部时无命中。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @returns 最近正向距离；无命中返回 `Infinity`。
     */
    private rayBoundaryDistance(
        originX: number,
        originY: number,
        dx: number,
        dy: number
    ): number {
        const slab = (origin: number, direction: number): [number, number] => {
            if (Math.abs(direction) < 1e-12) {
                const outside =
                    origin < -this.halfExtent || origin > this.halfExtent;
                return outside ? [Infinity, -Infinity] : [-Infinity, Infinity];
            }
            const first = (-this.halfExtent - origin) / direction;
            const second = (this.halfExtent - origin) / direction;
            return first < second ? [first, second] : [second, first];
        };

        const [xEnter, xExit] = slab(originX, dx);
        const [yEnter, yExit] = slab(originY, dy);
        const enter = Math.max(xEnter, yEnter);
        const exit = Math.min(xExit, yExit);
        if (exit < 0 || enter > exit) {
            return Infinity;
        }
        return enter >= 0 ? enter : exit;
    }

    /**
     * 射线与圆的最近正向交点（二次方程，`a = 1`）。
     * 原点在圆内时返回 0（已重叠）。
     * @param originX 原点 x。
     * @param originY 原点 y。
     * @param dx 方向 x 分量（单位向量）。
     * @param dy 方向 y 分量（单位向量）。
     * @param centerX 圆心 x。
     * @param centerY 圆心 y。
     * @param radius 圆半径。
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
