import type { CommandKind } from '../commands';
import type { EntityId } from '../world/entity-store';

/**
 * 每 tick 的类型化事件日志（研究 Pattern 5/6）。
 *
 * 事件记录"本 tick 发生了什么"，**每 tick 清空**；消费者拿到的是**副本数组**，非活句柄。
 * Phase 1 至少含 `command`/`rejected`；`damage`/`kill`/`levelup`/`contact` 为后续阶段预留
 * （Phase 2 物理接触、Phase 3 战斗与成长）。
 */

/**
 * 事件种类（数字枚举，D-14/D-16）。
 *
 * 作为判别联合 `SimEvent` 的判别字段；数字成员值便于 `switch` 收窄，
 * 并避免以字符串字面量联合冒充枚举。
 */
export enum SimEventKind {
    /** 一条命令被应用。 */
    Command = 0,
    /** 一条命令/单位被确定性拒绝。 */
    Rejected = 1,
    /** 造成伤害（Phase 3 预留）。 */
    Damage = 2,
    /** 击杀（Phase 3 预留）。 */
    Kill = 3,
    /** 升级（Phase 3 预留）。 */
    Levelup = 4,
    /** 物理接触（Phase 2 预留）。 */
    Contact = 5
}

/** 本 tick 一条被应用的命令。 */
export interface ICommandEvent {
    /** 判别字段。 */
    kind: SimEventKind.Command;
    /** 事件所属 tick。 */
    tick: number;
    /** 被应用命令的种类。 */
    command: CommandKind;
    /** 命令目标单位 id。 */
    unit: EntityId;
}

/** 本 tick 一条被确定性拒绝的命令。 */
export interface IRejectedEvent {
    /** 判别字段。 */
    kind: SimEventKind.Rejected;
    /** 事件所属 tick。 */
    tick: number;
    /** 拒绝原因。 */
    reason: string;
}

/** 一次伤害结算（Phase 3 预留）。 */
export interface IDamageEvent {
    /** 判别字段。 */
    kind: SimEventKind.Damage;
    /** 事件所属 tick。 */
    tick: number;
    /** 伤害来源单位 id。 */
    source: EntityId;
    /** 受击单位 id。 */
    target: EntityId;
    /** 伤害量。 */
    amount: number;
}

/** 一次击杀（Phase 3 预留）。 */
export interface IKillEvent {
    /** 判别字段。 */
    kind: SimEventKind.Kill;
    /** 事件所属 tick。 */
    tick: number;
    /** 被击杀单位 id。 */
    victim: EntityId;
    /** 击杀者单位 id。 */
    killer: EntityId;
}

/** 一次升级（Phase 3 预留）。 */
export interface ILevelupEvent {
    /** 判别字段。 */
    kind: SimEventKind.Levelup;
    /** 事件所属 tick。 */
    tick: number;
    /** 升级单位 id。 */
    unit: EntityId;
    /** 新等级。 */
    level: number;
}

/** 一次物理接触（Phase 2 预留）。 */
export interface IContactEvent {
    /** 判别字段。 */
    kind: SimEventKind.Contact;
    /** 事件所属 tick。 */
    tick: number;
    /** 接触方 a 单位 id。 */
    a: EntityId;
    /** 接触方 b 单位 id。 */
    b: EntityId;
}

/** 每 tick 事件的判别联合（D-16：每个成员为**具名 interface**）。 */
export type SimEvent =
    | ICommandEvent
    | IRejectedEvent
    | IDamageEvent
    | IKillEvent
    | ILevelupEvent
    | IContactEvent;

/**
 * 类型化事件日志的公开契约（D-13：先接口后类）。
 */
export interface IEventLog {
    /** 当前未读事件数。 */
    readonly size: number;
    /** 记录一个事件（存浅拷贝）。 */
    emit(event: SimEvent): void;
    /** 取走全部事件（副本数组）并清空。 */
    drain(): readonly SimEvent[];
    /** 丢弃未读事件。 */
    clear(): void;
}

/**
 * 类型化事件日志。`emit` 记录（浅拷贝，避免消费者持有生产者可变对象），
 * `drain` 取走并清空副本数组，`clear` 丢弃未读事件。
 */
export class EventLog implements IEventLog {
    /** 尚未读取的事件缓冲。 */
    private events: SimEvent[] = [];

    /** 当前未读事件数。 */
    get size(): number {
        return this.events.length;
    }

    /**
     * 记录一个事件（存浅拷贝：外部后续改动不影响已记录事件）。
     *
     * @param event 待记录的事件。
     */
    emit(event: SimEvent): void {
        this.events.push({ ...event });
    }

    /**
     * 取走全部事件（副本数组）并清空。
     *
     * @returns 本批事件的副本数组。
     */
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
