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

/** 单实体的快照条目（`restore()` 的输入，见 `src/sim/snapshot.ts`）。 */
export interface EntitySnapshot {
    id: EntityId;
    components: UnitComponents;
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

    /**
     * 恢复：清空并按下标顺序重建实体，保持 `orderedIds` 契约（SIM-04 快照反序列化）。
     *
     * 组件做深拷贝，使恢复后的 store 独占其数据（不回指调用方的对象）。
     * `nextId` 重置为 `max(id) + 1`，从而保证 id 继续单调（D-05），绝不与既有 id 冲突。
     */
    restore(entries: readonly EntitySnapshot[]): void {
        this.orderedIds = [];
        this.byId.clear();
        let maxId = 0;
        for (const entry of entries) {
            const { hp, level } = entry.components.attrs;
            const { x, y, vx, vy } = entry.components.xform;
            this.byId.set(entry.id, {
                attrs: { hp, level },
                xform: { x, y, vx, vy }
            });
            this.orderedIds.push(entry.id);
            if (entry.id > maxId) maxId = entry.id;
        }
        this.nextId = maxId + 1;
    }
}
