import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../src/sim/world/entity-store';

/**
 * 实体存储的迭代顺序契约（D-04/D-05，Pitfall 4）。
 *
 * 关键点：`entityId` 单调递增；`ids()` 反映生成顺序；**despawn 后再 spawn 绝不
 * 重排既有 id**（Map 的 delete+add 会把元素挪到末尾，是经典静默改序陷阱）。
 */

describe('EntityStore ordering (D-04/D-05)', () => {
    it('assigns strictly increasing monotonic ids in spawn order', () => {
        const store = new EntityStore();
        const a = store.spawn();
        const b = store.spawn();
        const c = store.spawn();
        expect([a, b, c]).toEqual([1, 2, 3]);
        expect(store.ids()).toEqual([a, b, c]);
    });

    it('preserves the relative order of survivors across despawn + spawn', () => {
        const store = new EntityStore();
        const a = store.spawn();
        const b = store.spawn();
        const c = store.spawn();

        store.despawn(b);
        expect(store.ids()).toEqual([a, c]);

        const d = store.spawn();
        // 幸存者 a、c 的相对顺序不变；新 id 追加在末尾（绝不重排到中间）。
        expect(store.ids()).toEqual([a, c, d]);
        expect(store.ids().indexOf(a)).toBeLessThan(store.ids().indexOf(c));
        expect(store.ids().indexOf(c)).toBeLessThan(store.ids().indexOf(d));
    });

    it('keeps ids monotonic and unique across churn (ids are never reused)', () => {
        const store = new EntityStore();
        const a = store.spawn();
        store.despawn(a);
        const b = store.spawn();
        expect(b).toBeGreaterThan(a);
        expect(store.ids()).toEqual([b]);
    });

    it('despawning an unknown id is a no-op', () => {
        const store = new EntityStore();
        store.spawn();
        expect(() => store.despawn(999)).not.toThrow();
        expect(store.ids()).toEqual([1]);
    });
});
