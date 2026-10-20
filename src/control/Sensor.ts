/**
 * 感知器：`class Sensor implements ISensor`（D-01/D-05/D-08）。
 * 把「单位目录（`IUnit` + `teamId`）+ 物理运动读数 + 感知世界（`ISensingWorld`）」
 * 三者拼装成一次决策的**纯数据快照**；AI 永不接触物理世界或单位可变方法。
 * 射线距离只来自 `ISensingWorld.castRayFan`，绝不依赖物理层射线（`IPhysicsWorld`
 * 无射线能力且已冻结，D-01/research Pitfall 6）。
 */

import { DEFAULT_GEOMETRY } from '@/physics/constants';
import type { IPhysicsWorld } from '@/physics/types';
import {
    MAX_NEIGHBORS,
    NEIGHBOR_QUERY_RADIUS,
    RAY_COUNT,
    SENSING_MAX_DISTANCE
} from '@/control/constants';
import { AttributeKind } from '@/units/types';
import type { IUnit } from '@/units/types';
import type {
    ISensedUnit,
    ISensingWorld,
    ISensor,
    IUnitBrief,
    IUnitCatalog,
    IUnitObservation
} from '@/control/types';

/**
 * 感知器：把目录/物理/世界三个来源 join 成 `IUnitObservation`。
 */
export class Sensor implements ISensor {
    /** 物理运动读数的唯一来源（`getUnitState`）。 */
    private readonly physics: IPhysicsWorld;
    /** 单位目录的只读路径（`getUnit`/`getTeam`/`listUnitIds`）。 */
    private readonly catalog: IUnitCatalog;
    /** 环境几何与射弹查询接缝（边界 + 敌方遮挡圆）。 */
    private readonly world: ISensingWorld;
    /** 注入的绝对 tick 来源：快照的 `tick` 字段由控制循环提供。 */
    private readonly getTick: () => number;

    /**
     * 构造感知器。
     * @param physics 物理世界（只读运动状态）。
     * @param catalog 单位目录（单位与阵营）。
     * @param world 感知世界（边界/障碍几何与射弹）。
     * @param getTick 返回当前绝对 tick 的函数。
     */
    constructor(
        physics: IPhysicsWorld,
        catalog: IUnitCatalog,
        world: ISensingWorld,
        getTick: () => number
    ) {
        this.physics = physics;
        this.catalog = catalog;
        this.world = world;
        this.getTick = getTick;
    }

    /**
     * 为单位 `unitId` 组装一次决策快照。
     * 单位或其运动读数不可用时返回 `null`（Pitfall 8）；阵营未知时同样返回 `null`
     * （无法把邻居分类为敌/友）。
     * @param unitId 单位 id。
     * @returns 完整快照，或 `null`。
     */
    sense(unitId: number): IUnitObservation | null {
        const unit = this.catalog.getUnit(unitId);
        const motion = this.physics.getUnitState(unitId);
        if (unit === null || motion === null) {
            return null;
        }
        const selfTeam = this.catalog.getTeam(unitId);
        if (selfTeam === undefined) {
            return null;
        }

        const { enemies, allies } = this.collectBriefs(
            unitId,
            selfTeam,
            motion.x,
            motion.y
        );
        const blockers = this.buildBlockers(enemies);
        const rayDistances = this.sanitizeRayDistances(
            this.world.castRayFan(
                motion.x,
                motion.y,
                SENSING_MAX_DISTANCE,
                blockers
            )
        );
        const projectiles = this.world
            .queryProjectiles(motion.x, motion.y, SENSING_MAX_DISTANCE)
            .map(sighting => ({ ...sighting }));

        return {
            unitId,
            tick: this.getTick(),
            attributes: this.buildAttributes(unit),
            classKind: unit.getClass(),
            equipment: unit.getEquipment().map(item => ({ ...item })),
            skills: [...unit.getSkills()],
            motion: { ...motion },
            rayDistances,
            enemies,
            allies,
            projectiles
        };
    }

    /**
     * 读取单位的全部 13 项属性；显式 `Record` 字面量让编译器证明覆盖完整（CTRL-01）。
     * @param unit 单位。
     * @returns 覆盖每个 `AttributeKind` 的属性读数。
     */
    private buildAttributes(unit: IUnit): Record<AttributeKind, number> {
        return {
            [AttributeKind.Health]: unit.getAttribute(AttributeKind.Health),
            [AttributeKind.MaxHealth]: unit.getAttribute(
                AttributeKind.MaxHealth
            ),
            [AttributeKind.Level]: unit.getAttribute(AttributeKind.Level),
            [AttributeKind.Experience]: unit.getAttribute(
                AttributeKind.Experience
            ),
            [AttributeKind.ExperienceRatio]: unit.getAttribute(
                AttributeKind.ExperienceRatio
            ),
            [AttributeKind.AttackExpRatio]: unit.getAttribute(
                AttributeKind.AttackExpRatio
            ),
            [AttributeKind.DefenseExpRatio]: unit.getAttribute(
                AttributeKind.DefenseExpRatio
            ),
            [AttributeKind.ControlLevel]: unit.getAttribute(
                AttributeKind.ControlLevel
            ),
            [AttributeKind.Attack]: unit.getAttribute(AttributeKind.Attack),
            [AttributeKind.Defense]: unit.getAttribute(AttributeKind.Defense),
            [AttributeKind.WeaponRatio]: unit.getAttribute(
                AttributeKind.WeaponRatio
            ),
            [AttributeKind.ArmorRatio]: unit.getAttribute(
                AttributeKind.ArmorRatio
            ),
            [AttributeKind.Mass]: unit.getAttribute(AttributeKind.Mass)
        };
    }

    /**
     * 收集半径内的存活邻居并按阵营分类。
     * 跳过：自身、物理读数缺失、单位缺失、已死亡、阵营未知、超出
     * `NEIGHBOR_QUERY_RADIUS` 的条目；按距离升序、`unitId` 升序决胜，各取前
     * `MAX_NEIGHBORS` 个（D-03/D-08）。
     * @param selfId 自身单位 id。
     * @param selfTeam 自身阵营 id。
     * @param selfX 自身位置的 x 坐标。
     * @param selfY 自身位置的 y 坐标。
     * @returns 已分类的敌方/友方简讯。
     */
    private collectBriefs(
        selfId: number,
        selfTeam: number,
        selfX: number,
        selfY: number
    ): { enemies: IUnitBrief[]; allies: IUnitBrief[] } {
        const candidates: [number, IUnitBrief, number][] = [];

        for (const otherId of this.catalog.listUnitIds()) {
            if (otherId === selfId) {
                continue;
            }
            const state = this.physics.getUnitState(otherId);
            if (state === null) {
                continue;
            }
            const otherUnit = this.catalog.getUnit(otherId);
            if (otherUnit === null || !otherUnit.isAlive()) {
                continue;
            }
            const otherTeam = this.catalog.getTeam(otherId);
            if (otherTeam === undefined) {
                continue;
            }
            const distance = Math.hypot(state.x - selfX, state.y - selfY);
            if (
                !Number.isFinite(distance) ||
                distance > NEIGHBOR_QUERY_RADIUS
            ) {
                continue;
            }
            candidates.push([
                distance,
                {
                    unitId: otherId,
                    health: otherUnit.getAttribute(AttributeKind.Health),
                    level: otherUnit.getAttribute(AttributeKind.Level),
                    x: state.x,
                    y: state.y,
                    equipment: otherUnit
                        .getEquipment()
                        .map(item => ({ ...item }))
                },
                otherTeam
            ]);
        }

        candidates.sort((left, right) => {
            if (left[0] !== right[0]) {
                return left[0] - right[0];
            }
            return left[1].unitId - right[1].unitId;
        });

        const enemies: IUnitBrief[] = [];
        const allies: IUnitBrief[] = [];
        for (const [_distance, brief, teamId] of candidates) {
            if (teamId === selfTeam) {
                if (allies.length < MAX_NEIGHBORS) {
                    allies.push(brief);
                }
            } else if (enemies.length < MAX_NEIGHBORS) {
                enemies.push(brief);
            }
        }
        return { enemies, allies };
    }

    /**
     * 把敌方简讯转成射线遮挡事实。`IUnitBrief` 不携带 `teamId`，故在此经目录解析；
     * 解析失败则跳过。半径统一取本体半径 `DEFAULT_GEOMETRY.bodyRadius`（A10）。
     * 只传入敌人是「友方永不遮挡」的结构性保证（D-02）。
     * @param enemies 敌方简讯。
     * @returns 射线遮挡事实。
     */
    private buildBlockers(enemies: readonly IUnitBrief[]): ISensedUnit[] {
        const blockers: ISensedUnit[] = [];
        for (const brief of enemies) {
            const teamId = this.catalog.getTeam(brief.unitId);
            if (teamId === undefined) {
                continue;
            }
            blockers.push({
                unitId: brief.unitId,
                teamId,
                x: brief.x,
                y: brief.y,
                radius: DEFAULT_GEOMETRY.bodyRadius
            });
        }
        return blockers;
    }

    /**
     * 把感知世界的输出清洗为恰好 `RAY_COUNT` 个有限距离，每个位于
     * `[0, SENSING_MAX_DISTANCE]`：非有限或负值、超出上限 → 上限；不足补上限、
     * 超出截断。返回新数组，绝不泄漏世界的数组引用（T-03-07）。
     * @param raw 感知世界返回的原始距离数组。
     * @returns 清洗后的射线距离。
     */
    private sanitizeRayDistances(raw: readonly number[]): number[] {
        const sanitized: number[] = [];
        for (let index = 0; index < RAY_COUNT; index += 1) {
            const value =
                index < raw.length ? raw[index] : SENSING_MAX_DISTANCE;
            if (
                !Number.isFinite(value) ||
                value < 0 ||
                value > SENSING_MAX_DISTANCE
            ) {
                sanitized.push(SENSING_MAX_DISTANCE);
            } else {
                sanitized.push(value);
            }
        }
        return sanitized;
    }
}
