import type { CommandKind } from '../commands';
import type { EntityId } from '../world/entity-store';

/**
 * 每 tick 的类型化事件日志（研究 Pattern 5/6）。
 *
 * 事件记录"本 tick 发生了什么"，**每 tick 清空**；消费者拿到的是**副本数组**，非活句柄。
 * Phase 1 至少含 `command`/`rejected`；`damage`/`kill`/`levelup`/`contact` 为后续阶段预留
 * （Phase 2 物理接触、Phase 3 战斗与成长）。
 */
export type SimEvent =
    | { kind: 'command'; tick: number; command: CommandKind; unit: EntityId }
    | { kind: 'rejected'; tick: number; reason: string }
    | {
          kind: 'damage';
          tick: number;
          source: EntityId;
          target: EntityId;
          amount: number;
      }
    | { kind: 'kill'; tick: number; victim: EntityId; killer: EntityId }
    | { kind: 'levelup'; tick: number; unit: EntityId; level: number }
    | { kind: 'contact'; tick: number; a: EntityId; b: EntityId };

/**
 * 类型化事件日志。`emit` 记录（浅拷贝，避免消费者持有生产者可变对象），
 * `drain` 取走并清空副本数组，`clear` 丢弃未读事件。
 */
export class EventLog {
    private events: SimEvent[] = [];

    /** 当前未读事件数。 */
    get size(): number {
        return this.events.length;
    }

    /** 记录一个事件（存浅拷贝：外部后续改动不影响已记录事件）。 */
    emit(event: SimEvent): void {
        this.events.push({ ...event });
    }

    /** 取走全部事件（副本数组）并清空。 */
    drain(): readonly SimEvent[] {
        const out = this.events.slice();
        this.events.length = 0;
        return out;
    }

    /** 丢弃未读事件（每 tick 起始调用，保证事件按 tick 归属）。 */
    clear(): void {
        this.events.length = 0;
    }
}
