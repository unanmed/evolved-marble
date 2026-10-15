import type { TickClock } from '../core/clock';
import type { RandomStreams } from '../core/rng';
import type { EntityStore } from './entity-store';

/**
 * 模拟状态聚合根（显式组合，绝非模块级单例）。
 *
 * 由 `BattleSim` 构造后以参数形式传给各系统（如 `movementSystem(w, dt)`），
 * 避免旧原型 `renderer`/`scene`/`recorder` 全局单例导致的 reset 泄漏。
 */
export interface SimState {
    store: EntityStore;
    clock: TickClock;
    rng: RandomStreams;
}
