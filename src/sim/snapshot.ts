import type { SimState } from './world/world';

/**
 * 规范序列化 + 指纹（SIM-04 门禁原语）。
 *
 * 与哈希分离：`serializeState()` 产出规范、有序、量化的字节；
 * `fingerprint()` 对字节做哈希。日后状态变大时可单独把哈希换成原生/向量化实现（Pitfall 3）。
 */

/** 量化栅格 1/256（研究假设 A3）：先量化再哈希，避免良性分配顺序差异造成假分歧。 */
const QUANT_SCALE = 256;

function quantize(v: number): number {
    return Math.round(v * QUANT_SCALE);
}

/**
 * 规范字节编码：字段顺序固定；实体按 `EntityStore.ids()` 的有序数组遍历；
 * 浮点量化到 1/256 栅格。字节序固定为小端。
 */
export function serializeState(s: SimState): Uint8Array {
    const ids = s.store.ids();
    const values: number[] = [s.clock.tick, ids.length];
    for (const id of ids) {
        const c = s.store.get(id);
        values.push(
            id,
            quantize(c.attrs.hp),
            quantize(c.attrs.level),
            quantize(c.xform.x),
            quantize(c.xform.y),
            quantize(c.xform.vx),
            quantize(c.xform.vy)
        );
    }
    const bytes = new Uint8Array(values.length * 4);
    const view = new DataView(bytes.buffer);
    for (let i = 0; i < values.length; i++) {
        view.setUint32(i * 4, values[i] >>> 0, true);
    }
    return bytes;
}

/**
 * 对规范字节做**非加密**哈希（cyrb53 变体，53 位）。
 *
 * 注意：这是**诊断**用途的状态指纹，**绝不可**作为安全令牌/认证器（研究安全域 V6，
 * 威胁 T-01-03 disposition=accept）。任何安全决策都不应消费它。
 */
export function fingerprint(bytes: Uint8Array): string {
    let h1 = 0xdeadbeef ^ bytes.length;
    let h2 = 0x41c6ce57 ^ bytes.length;
    for (let i = 0; i < bytes.length; i++) {
        const ch = bytes[i];
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 =
        Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^
        Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 =
        Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^
        Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(16);
}
