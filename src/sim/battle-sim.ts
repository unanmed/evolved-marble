import { FIXED_DT } from '../config/sim';
import { TickClock } from './core/clock';
import { RandomStreams } from './core/rng';
import { fingerprint, serializeState } from './snapshot';
import { movementSystem } from './systems/movement';
import { EntityStore, type EntityId } from './world/entity-store';
import type { SimState } from './world/world';

/** BattleSim 的运行期配置。 */
export interface BattleSimConfig {
    dt: number;
    streams: readonly string[];
}

const DEFAULT_STREAMS: readonly string[] = ['ai'];

/**
 * 模拟的唯一公开门面（Phase 2/4/6 接入的接缝）。
 *
 * 显式构造并注入，绝不作为模块级全局。暴露唯一的推进原语 `step()`；
 * 谁调用它、多久调用一次，是宿主（host）的职责。
 */
export class BattleSim {
    private readonly cfg: BattleSimConfig;
    private _state: SimState;

    constructor(seed: number, cfg: Partial<BattleSimConfig> = {}) {
        this.cfg = {
            dt: cfg.dt ?? FIXED_DT,
            streams: cfg.streams ?? DEFAULT_STREAMS
        };
        this._state = this.build(seed);
    }

    private build(seed: number): SimState {
        return {
            store: new EntityStore(),
            clock: new TickClock(this.cfg.dt),
            rng: new RandomStreams(seed, this.cfg.streams)
        };
    }

    /** 只读状态视图（供测试/序列化读取；不暴露可变更入口）。 */
    get state(): SimState {
        return this._state;
    }

    /** 从种子重建状态（同种子可复现）。 */
    reset(seed: number): void {
        this._state = this.build(seed);
    }

    /** 便捷入口：以 Store 的单调 id 生成实体。 */
    spawn(): EntityId {
        return this._state.store.spawn();
    }

    /** 推进一个固定步：时钟前进，随后运行 Phase-1 系统。 */
    step(): void {
        this._state.clock.step();
        movementSystem(this._state, this.cfg.dt);
    }

    /** 规范状态字节。 */
    snapshot(): Uint8Array {
        return serializeState(this._state);
    }

    /** 状态指纹（非加密诊断值）。 */
    fingerprint(): string {
        return fingerprint(this.snapshot());
    }
}
