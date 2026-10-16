/**
 * 组合优先的轻量实体模型（D-04 / D-05）。
 *
 * 实体就是对象：稳定且单调的 `entityId` + 组件字段；系统写成显式函数。
 * **不引入 ECS 框架**（同屏高保真单位仅十几/方，archetype 存储纯属开销）。
 *
 * 迭代契约：一切系统必须遍历 `ids()` 返回的**有序数组**，
 * 绝不遍历 `Map`/`Set`/对象键顺序——`delete` 后再 `add` 会把元素挪到末尾，
 * 杀怪/重生会静默改序从而破坏确定性（Pitfall 4）。
 */

import type { IUnitPhysics } from './composite';

/** 实体标识（稳定、单调递增的整数）。 */
export type EntityId = number;

/** 单位属性组件（D-16：具名接口，避免内联对象类型）。 */
export interface IUnitAttrs {
    /** 生命值。 */
    hp: number;
    /** 等级。 */
    level: number;
}

/** 单位位姿组件（D-16：具名接口）。 */
export interface IUnitXform {
    /** 位置 x。 */
    x: number;
    /** 位置 y。 */
    y: number;
    /** 线速度 vx。 */
    vx: number;
    /** 线速度 vy。 */
    vy: number;
    /** 朝向角（弧度，D-34：Rapier 为真源，此处为只读镜像）。 */
    rotation: number;
    /** 角速度（rad/s，D-34：Rapier 为真源，此处为只读镜像）。 */
    angularVelocity: number;
}

/** 单位组件（Phase 1 含基础属性与位姿；Phase 2 增物理句柄组件）。 */
export interface IUnitComponents {
    /** 属性组件。 */
    attrs: IUnitAttrs;
    /** 位姿组件。 */
    xform: IUnitXform;
    /** 物理句柄组件（Rapier 为真源；此处仅为句柄镜像，D-34）。 */
    physics: IUnitPhysics;
}

/** 单实体的快照条目（`restore()` 的输入，见 `src/sim/snapshot.ts`）。 */
export interface IEntitySnapshot {
    /** 实体 id。 */
    id: EntityId;
    /** 组件。 */
    components: IUnitComponents;
}

/**
 * 实体存储的公开契约（D-13：先接口后类）。
 */
export interface IEntityStore {
    /** 实体 id 游标（下一个待分配 id，属未来影响状态）。 */
    readonly nextId: number;
    /** 以单调 id 生成实体，追加到有序数组。 */
    spawn(): EntityId;
    /** 同时从索引与有序数组移除，保持数组顺序。 */
    despawn(id: EntityId): void;
    /** 按 id 取组件；未知 id 抛错。 */
    get(id: EntityId): IUnitComponents;
    /** 迭代契约：只读的有序 id 视图。 */
    ids(): readonly EntityId[];
    /** 恢复：清空并按下标顺序重建实体。 */
    restore(entries: readonly IEntitySnapshot[], nextId?: number): void;
}

/**
 * 组合优先的实体存储（D-04/D-05）。
 */
export class EntityStore implements IEntityStore {
    /** id 游标：下一个 `spawn()` 分配的 id。属"未来影响状态"（D-05）。 */
    private nextEntityId = 1;
    /** 迭代契约：有序 id 数组。 */
    private orderedIds: EntityId[] = [];
    /** 仅作查找索引，绝不用于迭代。 */
    private byId = new Map<EntityId, IUnitComponents>();

    /**
     * 只读访问器：实体 id 游标（下一个待分配 id）。
     *
     * 该游标是**未来影响状态**：序列化快照必须包含它，否则恢复后会重用已死 id（D-05，CR-01）。
     *
     * @returns 下一次 `spawn()` 将分配的实体 id。
     */
    get nextId(): number {
        return this.nextEntityId;
    }

    /**
     * 以单调 id（D-05）生成实体，追加到有序数组。
     *
     * @returns 新分配的实体 id。
     */
    spawn(): EntityId {
        const id = this.nextEntityId++;
        this.orderedIds.push(id);
        this.byId.set(id, {
            attrs: { hp: 100, level: 1 },
            xform: {
                x: 0,
                y: 0,
                vx: 0,
                vy: 0,
                rotation: 0,
                angularVelocity: 0
            },
            /* 占位句柄：`BattleSim.spawn()` 随即用复合工厂返回的真实句柄覆盖。 */
            physics: { entityId: id, bodyHandle: 0, weaponHandles: [] }
        });
        return id;
    }

    /**
     * 同时从索引与有序数组移除，保持数组顺序。未知 id 为无副作用 no-op。
     *
     * @param id 要移除的实体 id。
     */
    despawn(id: EntityId): void {
        if (!this.byId.delete(id)) return;
        const i = this.orderedIds.indexOf(id);
        if (i >= 0) this.orderedIds.splice(i, 1);
    }

    /**
     * 按 id 取组件；未知 id 抛错（程序性错误，不静默）。
     *
     * @param id 实体 id。
     * @returns 该实体的组件。
     */
    get(id: EntityId): IUnitComponents {
        const c = this.byId.get(id);
        if (!c) throw new Error(`Unknown entity: ${id}`);
        return c;
    }

    /**
     * 迭代契约：只读的有序 id 视图。
     *
     * @returns 有序 id 数组。
     */
    ids(): readonly EntityId[] {
        return this.orderedIds;
    }

    /**
     * 恢复：清空并按下标顺序重建实体，保持 `orderedIds` 契约（SIM-04 快照反序列化）。
     *
     * 组件做深拷贝，使恢复后的 store 独占其数据（不回指调用方的对象）。
     *
     * @param entries 按下标顺序排列的实体快照条目（含 id 与组件）。
     * @param nextId 调用方序列化出的 id 游标；传入时直接采用（D-05，CR-01 的正确来源）。
     *   省略时回退为 `max(id) + 1`，仅供未序列化游标的旧调用方保持 id 单调。
     */
    restore(entries: readonly IEntitySnapshot[], nextId?: number): void {
        this.orderedIds = [];
        this.byId.clear();
        let maxId = 0;
        for (const entry of entries) {
            const { hp, level } = entry.components.attrs;
            const { x, y, vx, vy, rotation, angularVelocity } =
                entry.components.xform;
            const physics = entry.components.physics;
            this.byId.set(entry.id, {
                attrs: { hp, level },
                xform: { x, y, vx, vy, rotation, angularVelocity },
                physics: {
                    entityId: physics.entityId,
                    bodyHandle: physics.bodyHandle,
                    weaponHandles: [...physics.weaponHandles]
                }
            });
            this.orderedIds.push(entry.id);
            if (entry.id > maxId) maxId = entry.id;
        }
        this.nextEntityId = nextId ?? maxId + 1;
    }
}
