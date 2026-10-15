import type { ICommandQueue } from '../commands';
import type { ITickClock } from '../core/clock';
import type { IEventLog } from '../core/events';
import type { IRandomStreams } from '../core/rng';
import type { IEntityStore } from './entity-store';

/**
 * 模拟状态聚合根（显式组合，绝非模块级单例）。
 *
 * 由 `BattleSim` 构造后以参数形式传给各系统（如 `movementSystem(w, dt)`），
 * 避免旧原型 `renderer`/`scene`/`recorder` 全局单例导致的 reset 泄漏。
 *
 * 组成：实体存储 + 逻辑时钟 + 命名随机流 + 内向命令队列 + 每 tick 事件日志。
 * 字段类型一律为对应契约接口，绝不使用类名当类型（D-13）。
 */
export interface ISimState {
    /** 实体存储。 */
    store: IEntityStore;
    /** 逻辑时钟。 */
    clock: ITickClock;
    /** 命名随机流。 */
    rng: IRandomStreams;
    /** 内向命令队列。 */
    commands: ICommandQueue;
    /** 每 tick 事件日志。 */
    events: IEventLog;
}
