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

export type EntityId = number;

/** 单位组件（Phase 1 仅含基础属性与位姿；后续阶段扩展 ai/equip/faction）。 */
export interface UnitComponents {
    attrs: { hp: number; level: number };
    xform: { x: number; y: number; vx: number; vy: number };
}

export class EntityStore {
    private nextId = 1;
    /** 迭代契约：有序 id 数组。 */
    private orderedIds: EntityId[] = [];
    /** 仅作查找索引，绝不用于迭代。 */
    private byId = new Map<EntityId, UnitComponents>();

    /** 以单调 id（D-05）生成实体，追加到有序数组。 */
    spawn(): EntityId {
        const id = this.nextId++;
        this.orderedIds.push(id);
        this.byId.set(id, {
            attrs: { hp: 100, level: 1 },
            xform: { x: 0, y: 0, vx: 0, vy: 0 }
        });
        return id;
    }

    /** 同时从索引与有序数组移除，保持数组顺序。 */
    despawn(id: EntityId): void {
        if (!this.byId.delete(id)) return;
        const i = this.orderedIds.indexOf(id);
        if (i >= 0) this.orderedIds.splice(i, 1);
    }

    /** 按 id 取组件；未知 id 抛错（程序性错误，不静默）。 */
    get(id: EntityId): UnitComponents {
        const c = this.byId.get(id);
        if (!c) throw new Error(`Unknown entity: ${id}`);
        return c;
    }

    /** 迭代契约：只读的有序 id 视图。 */
    ids(): readonly EntityId[] {
        return this.orderedIds;
    }
}
