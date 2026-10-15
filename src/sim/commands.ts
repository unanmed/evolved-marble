import type { EntityId } from './world/entity-store';

/**
 * driver → sim 的唯一**内向控制契约**（SIM-02/SIM-03，研究 Pattern 4）。
 *
 * 一切外部控制（本地输入、日后的 RL/Python、王国/LLM）都以判别联合（discriminated union）
 * 形式进入，提交给 `CommandQueue`，并在 `BattleSim.step()` **每 tick 起始一次性 drain**。
 * 模拟永不轮询设备/套接字/时钟——因此一局可由"记录的命令日志 + 种子"复现，
 * 且异步 driver 迟到只会使其命令在对应 tick 被跳过（确定性的、可记录的行为）。
 *
 * 形状取自权威规格 `.planning/reference/ai-marble-kingdom.md:153-158`：AI 输出包括
 * 上下左右四个方向的力、顺/逆时针旋转力、武器特殊能力、单位自身特殊能力。
 */

/**
 * 命令种类（数字枚举，D-14/D-16）。
 *
 * 作为判别联合 `Command` 的判别字段。数字成员值便于 `switch` 收窄（TS 编译期可判定），
 * 并避免以字符串字面量联合冒充枚举。
 */
export enum CommandKind {
    /** 施加线性力（spec：上下左右四方向力）。 */
    Force = 0,
    /** 施加旋转力（spec：顺/逆时针旋转力）。 */
    Torque = 1,
    /** 触发武器的特殊能力。 */
    WeaponAbility = 2,
    /** 触发单位自身的特殊能力。 */
    UnitAbility = 3,
    /** 保留（未来王国层：地图单位生成）。 */
    Spawn = 4
}

/** 施加线性力：把 `(fx, fy)` 加到单位线速度上。 */
export interface IForceCommand {
    /** 判别字段。 */
    kind: CommandKind.Force;
    /** 受力单位 id。 */
    unit: EntityId;
    /** x 方向力。 */
    fx: number;
    /** y 方向力。 */
    fy: number;
    /** 期望生效的 tick（副作用：异步 driver 迟到则跳过）。 */
    atTick: number;
}

/** 施加旋转力（Phase 1 无角速度实现：仅记录事件，Phase 2+ 落地）。 */
export interface ITorqueCommand {
    /** 判别字段。 */
    kind: CommandKind.Torque;
    /** 受力单位 id。 */
    unit: EntityId;
    /** 旋转力大小。 */
    amount: number;
    /** 期望生效的 tick。 */
    atTick: number;
}

/** 触发武器的特殊能力（Phase 1 为 wired-but-inert 契约面）。 */
export interface IWeaponAbilityCommand {
    /** 判别字段。 */
    kind: CommandKind.WeaponAbility;
    /** 施放单位 id。 */
    unit: EntityId;
    /** 武器标识。 */
    weaponId: number;
    /** 期望生效的 tick。 */
    atTick: number;
}

/** 触发单位自身的特殊能力（Phase 1 为 wired-but-inert 契约面）。 */
export interface IUnitAbilityCommand {
    /** 判别字段。 */
    kind: CommandKind.UnitAbility;
    /** 施放单位 id。 */
    unit: EntityId;
    /** 能力标识。 */
    abilityId: number;
    /** 期望生效的 tick。 */
    atTick: number;
}

/** 保留（未来王国层：地图单位生成）；Phase 1 只记录不落地。 */
export interface ISpawnCommand {
    /** 判别字段。 */
    kind: CommandKind.Spawn;
    /** 目标单位 id。 */
    unit: EntityId;
    /** 职业/类别标识。 */
    classId: number;
    /** 生成位置 x。 */
    x: number;
    /** 生成位置 y。 */
    y: number;
}

/**
 * 内向控制契约的判别联合（D-16：每个成员为**具名 interface**，无内联对象成员）。
 */
export type Command =
    | IForceCommand
    | ITorqueCommand
    | IWeaponAbilityCommand
    | IUnitAbilityCommand
    | ISpawnCommand;

/** 全部已知命令种类（数字枚举值集合）。 */
const KNOWN_KINDS: readonly CommandKind[] = [
    CommandKind.Force,
    CommandKind.Torque,
    CommandKind.WeaponAbility,
    CommandKind.UnitAbility,
    CommandKind.Spawn
];

/** 每种 kind 必需的数字字段（结构校验用）。 */
const REQUIRED_FIELDS: Record<CommandKind, readonly string[]> = {
    [CommandKind.Force]: ['unit', 'fx', 'fy', 'atTick'],
    [CommandKind.Torque]: ['unit', 'amount', 'atTick'],
    [CommandKind.WeaponAbility]: ['unit', 'weaponId', 'atTick'],
    [CommandKind.UnitAbility]: ['unit', 'abilityId', 'atTick'],
    [CommandKind.Spawn]: ['unit', 'classId', 'x', 'y']
};

/** 一条被确定性拒绝的命令（连同原因），用于诊断与事件输出。 */
export interface IRejectedCommand {
    /** 人类可读的拒绝原因。 */
    reason: string;
    /** 触发拒绝的原始输入。 */
    raw: unknown;
}

/**
 * 是否为对象（非 null）。
 *
 * @param v 待判定的值。
 * @returns 当 `v` 为非 null 的对象时为 `true`。
 */
function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

/**
 * 是否为有限数值。
 *
 * @param v 待判定的值。
 * @returns 当 `v` 为有限 number 时为 `true`。
 */
function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

/**
 * 是否为已知命令种类（仅接受数字枚举值）。
 *
 * @param v 待判定的判别字段值。
 * @returns 当 `v` 属于 `CommandKind` 集合时为 `true`（字符串/NaN/未知数字均 `false`）。
 */
function isKnownKind(v: unknown): v is CommandKind {
    return (
        typeof v === 'number' && (KNOWN_KINDS as readonly number[]).includes(v)
    );
}

/**
 * 命令队列：外部控制的**信任边界入口**（威胁 T-01-05）。
 *
 * 结构校验是**全函数（total）**：未知 `kind` 或缺失/非法字段者被**确定性丢弃并计入拒绝记录**，
 * 绝不静默忽略、绝不因 `undefined` 解引用而抛错（旧原型 `TypeError` 类缺陷的反面）。
 */
export class CommandQueue {
    /** 尚未 drain 的命令缓冲（插入顺序）。 */
    private buffer: Command[] = [];
    /** 尚未 drain 的拒绝记录。 */
    private rejections: IRejectedCommand[] = [];
    /** 累计被拒绝命令数（单调）。 */
    private _rejectedTotal = 0;

    /** 累计被拒绝命令数（单调，直到重建队列）。 */
    get rejectedTotal(): number {
        return this._rejectedTotal;
    }

    /** 当前缓冲（尚未 drain）的命令数。 */
    get pending(): number {
        return this.buffer.length;
    }

    /**
     * 接受一批外部命令：结构合法者入队，非法者确定性丢弃并记录。
     *
     * @param commands 外部提交的原始命令（运行期不可信）。
     */
    submit(commands: readonly unknown[]): void {
        for (const raw of commands) {
            const parsed = validate(raw);
            if (parsed.ok) {
                this.buffer.push(parsed.command);
            } else {
                this.rejections.push({ reason: parsed.reason, raw });
                this._rejectedTotal++;
            }
        }
    }

    /**
     * 取走全部缓冲命令（**插入顺序**）并清空缓冲：每 tick 只 drain 一次。
     *
     * @returns 本批命令（插入顺序）。
     */
    drain(): Command[] {
        const out = this.buffer;
        this.buffer = [];
        return out;
    }

    /**
     * 取走本批拒绝记录并清空（供上层转为事件）。
     *
     * @returns 本批拒绝记录。
     */
    drainRejections(): IRejectedCommand[] {
        const out = this.rejections;
        this.rejections = [];
        return out;
    }
}

/** 结构校验通过：把 `unknown` 收窄为 `Command`。 */
interface IValidateOk {
    /** 成功标记。 */
    ok: true;
    /** 解析出的合法命令。 */
    command: Command;
}

/** 结构校验失败：给出确定性的拒绝原因。 */
interface IValidateErr {
    /** 失败标记。 */
    ok: false;
    /** 拒绝原因。 */
    reason: string;
}

/** 结构校验结果（具名接口联合，D-16）。 */
type ValidateResult = IValidateOk | IValidateErr;

/**
 * 结构校验：把 `unknown` 收窄为 `Command`，或给出确定性的拒绝原因。
 *
 * @param raw 待校验的原始命令。
 * @returns 成功时携带 `Command`，失败时携带原因。
 */
function validate(raw: unknown): ValidateResult {
    if (!isRecord(raw))
        return { ok: false, reason: 'command is not an object' };
    const kind = raw.kind;
    if (!isKnownKind(kind)) {
        return { ok: false, reason: `unknown command kind: ${String(kind)}` };
    }
    for (const field of REQUIRED_FIELDS[kind]) {
        if (!isFiniteNumber(raw[field])) {
            return {
                ok: false,
                reason: `field '${field}' must be a finite number`
            };
        }
    }
    return { ok: true, command: raw as unknown as Command };
}
