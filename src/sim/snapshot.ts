import { FIXED_DT } from '../config/sim';
import { CommandQueue } from './commands';
import { TickClock } from './core/clock';
import { EventLog } from './core/events';
import { RandomStreams, type RngState } from './core/rng';
import { EntityStore, type IEntitySnapshot } from './world/entity-store';
import type { ISimState } from './world/world';

/**
 * 规范序列化 + 指纹（SIM-04 门禁原语）。
 *
 * 关注点分离（Pitfall 3）：`serializeState()` 产出**规范、有序、量化**的字节；
 * `fingerprint()` 对字节做哈希。二者保持可分离，日后状态变大时可单独把哈希换成
 * 原生/向量化实现，而**无需触碰**模拟逻辑（D-03）。
 *
 * 序列化是**穷尽**的：时钟步数 + 全部命名随机流状态 + 实体 id 游标 + 全部实体（含 id）。
 * 命令队列与事件日志被刻意排除——它们是**每 tick 的瞬时输入/输出**（命令在
 * `step()` 顶部 drain 后为空，事件每 tick 清空），不影响未来走向，故不属于
 * "状态"。两个分岔的世界若仅命令/事件不同，其未来演进仍一致。
 */

/**
 * 量化栅格：1/256（研究假设 A3）。序列化前把浮点量化到该栅格，避免良性分配顺序
 * 差异造成的假分歧；栅格同时是"变异者普查"的判据（扰动超过一个栅格必须改变指纹）。
 */
export const QUANT_GRID = 256;

/**
 * 快照格式魔数（'EMS1'）与版本号，用于确定性反序列化与版本护栏。
 *
 * VERSION=2 起，规范字节在实体计数后新增 **id 游标**（`EntityStore.nextId`）字段——见 CR-01。
 * 版本护栏对任何非当前版本确定性抛错（无 v1 迁移路径：本阶段快照不出进程）。
 */
const MAGIC = 0x454d5331;
const VERSION = 2;
/** 头部预留 2 字节（对齐/扩展）。 */
const HEADER_SIZE = 8;
/** 每个随机流的固定字节数：4 × uint32。 */
const STREAM_STATE_BYTES = 16;
/** 每个实体的固定字节数：7 × int32（id + hp + level + x + y + vx + vy）。 */
const ENTITY_BYTES = 28;
/** 有符号 int32 上界（`DataView.setInt32` 溢出会静默按模 2³² 回绕）。 */
const INT32_MAX = 2147483647;

/**
 * 量化：把浮点值吸附到 `1/QUANT_GRID` 栅格并转为整数。
 *
 * 写入路径用 `DataView.setInt32`，其对越界值**静默**按 ToInt32（模 2³²）回绕——会让
 * `fingerprint(restore(serialize(s)))` 与 `fingerprint(serialize(s))` 分歧且无任何信号
 * （WR-03）。故此处对越界值**确定性抛错**，而不是任其回绕；Phase-1 量级远低于上界，
 * 但 Phase-2 物理速度/位移可能突破 `±(INT32_MAX / QUANT_GRID)`。栅格、取整与字节序保持不变。
 *
 * @param v 待量化的原始浮点值。
 * @returns 栅格化后的整数（保证落在有符号 int32 范围内）。
 * @throws 当 `Math.round(v * QUANT_GRID)` 越出有符号 int32 范围时抛出（消息含原值）。
 */
function quantize(v: number): number {
    const q = Math.round(v * QUANT_GRID);
    if (q > INT32_MAX || q < -INT32_MAX - 1) {
        throw new Error(`snapshot: value out of quantized int32 range: ${v}`);
    }
    return q;
}

function dequantize(q: number): number {
    return q / QUANT_GRID;
}

/**
 * 规范字节编码。字段顺序固定；实体按 `EntityStore.ids()` 的**有序数组**遍历；
 * 随机流按名字**字典序**排序以保证规范（与构造顺序无关）；浮点量化到 `QUANT_GRID` 栅格。
 * 字节序固定为小端。同一逻辑状态在任何调用点都编码为**完全相同**的字节。
 */
export function serializeState(s: ISimState): Uint8Array {
    const rngEntries = Object.entries(s.rng.save()).sort(([a], [b]) =>
        a < b ? -1 : a > b ? 1 : 0
    );
    const ids = s.store.ids();

    let size = HEADER_SIZE + 4 + 2; // header + tick(int32) + streamCount(uint16)
    for (const [name] of rngEntries) {
        size += 2 + name.length + STREAM_STATE_BYTES;
    }
    size += 4; // entityCount(uint32)
    size += 4; // nextId cursor(uint32)
    size += ids.length * ENTITY_BYTES;

    const bytes = new Uint8Array(size);
    const view = new DataView(bytes.buffer);
    let o = 0;
    const u16 = (v: number): void => {
        view.setUint16(o, v, true);
        o += 2;
    };
    const u32 = (v: number): void => {
        view.setUint32(o, v >>> 0, true);
        o += 4;
    };
    const i32 = (v: number): void => {
        view.setInt32(o, v, true);
        o += 4;
    };

    u32(MAGIC);
    u16(VERSION);
    u16(0); // reserved
    i32(s.clock.tick);
    u16(rngEntries.length);
    for (const [name, state] of rngEntries) {
        u16(name.length);
        for (let i = 0; i < name.length; i++) {
            bytes[o++] = name.charCodeAt(i) & 0xff;
        }
        u32(state[0]);
        u32(state[1]);
        u32(state[2]);
        u32(state[3]);
    }
    u32(ids.length);
    u32(s.store.nextId); // id 游标：属未来影响状态，必须序列化（D-05，CR-01）
    for (const id of ids) {
        const c = s.store.get(id);
        i32(id);
        i32(quantize(c.attrs.hp));
        i32(quantize(c.attrs.level));
        i32(quantize(c.xform.x));
        i32(quantize(c.xform.y));
        i32(quantize(c.xform.vx));
        i32(quantize(c.xform.vy));
    }
    return bytes;
}

/**
 * 反序列化：`serializeState()` 的逆操作，重建一个**等价**的 `ISimState`。
 *
 * 恢复时钟步数、全部随机流状态（整数状态为**精确**恢复，非量化）与全部实体
 * （id + 组件，浮点为量化后的栅格值）。命令队列/事件日志为全新的空实例。
 * 自描述：随机流名字编码在字节内，故无需外部传入配置。
 *
 * `dt` 不属于序列化状态（它是构造期配置），默认取 `FIXED_DT`；`BattleSim.restore`
 * 会传入其自身的 `dt`。
 */
export function deserializeState(
    bytes: Uint8Array,
    dt: number = FIXED_DT
): ISimState {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    let o = 0;
    const readU16 = (): number => {
        const v = view.getUint16(o, true);
        o += 2;
        return v;
    };
    const readU32 = (): number => {
        const v = view.getUint32(o, true);
        o += 4;
        return v;
    };
    const readI32 = (): number => {
        const v = view.getInt32(o, true);
        o += 4;
        return v;
    };

    if (readU32() !== MAGIC) throw new Error('snapshot: bad magic');
    const version = readU16();
    if (version !== VERSION) {
        throw new Error(`snapshot: unsupported version ${version}`);
    }
    readU16(); // reserved

    const tick = readI32();

    const streamCount = readU16();
    const names: string[] = [];
    const states: Record<string, RngState> = {};
    for (let i = 0; i < streamCount; i++) {
        const nameLen = readU16();
        let name = '';
        for (let k = 0; k < nameLen; k++) {
            name += String.fromCharCode(bytes[o++]);
        }
        names.push(name);
        states[name] = [readU32(), readU32(), readU32(), readU32()];
    }

    const entityCount = readU32();
    const nextId = readU32();
    const entries: IEntitySnapshot[] = [];
    for (let i = 0; i < entityCount; i++) {
        const id = readI32();
        const hp = readI32();
        const level = readI32();
        const x = readI32();
        const y = readI32();
        const vx = readI32();
        const vy = readI32();
        entries.push({
            id,
            components: {
                attrs: { hp: dequantize(hp), level: dequantize(level) },
                xform: {
                    x: dequantize(x),
                    y: dequantize(y),
                    vx: dequantize(vx),
                    vy: dequantize(vy)
                }
            }
        });
    }

    const store = new EntityStore();
    store.restore(entries, nextId);
    const rng = new RandomStreams(0, names);
    rng.restore(states);
    const clock = new TickClock(dt);
    clock.restore(tick);

    return {
        store,
        clock,
        rng,
        commands: new CommandQueue(),
        events: new EventLog()
    };
}

/**
 * 对规范字节做**非加密**哈希（cyrb53 变体，53 位）。
 *
 * 注意：这是**诊断**用途的状态指纹，**绝不可**作为安全令牌/认证器（研究安全域 V6，
 * 威胁 T-01-03 disposition=accept）。任何安全决策都不应消费它。哈希与序列化保持
 * 可分离：状态规模变大时可在此处换成原生/向量化哈希，模拟逻辑不受影响（D-03）。
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
