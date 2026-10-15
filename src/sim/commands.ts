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

export type Command =
    | { kind: 'force'; unit: EntityId; fx: number; fy: number; atTick: number }
    | { kind: 'torque'; unit: EntityId; amount: number; atTick: number }
    | {
          kind: 'weaponAbility';
          unit: EntityId;
          weaponId: number;
          atTick: number;
      }
    | { kind: 'unitAbility'; unit: EntityId; abilityId: number; atTick: number }
    // 保留（未来王国层：地图单位生成）。
    | { kind: 'spawn'; unit: EntityId; classId: number; x: number; y: number };

export type CommandKind = Command['kind'];

const KNOWN_KINDS: readonly CommandKind[] = [
    'force',
    'torque',
    'weaponAbility',
    'unitAbility',
    'spawn'
];

/** 每种 kind 必需的数字字段（结构校验用）。 */
const REQUIRED_FIELDS: Record<CommandKind, readonly string[]> = {
    force: ['unit', 'fx', 'fy', 'atTick'],
    torque: ['unit', 'amount', 'atTick'],
    weaponAbility: ['unit', 'weaponId', 'atTick'],
    unitAbility: ['unit', 'abilityId', 'atTick'],
    spawn: ['unit', 'classId', 'x', 'y']
};

/** 一条被确定性拒绝的命令（连同原因），用于诊断与事件输出。 */
export interface RejectedCommand {
    reason: string;
    raw: unknown;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === 'object' && v !== null;
}

function isFiniteNumber(v: unknown): v is number {
    return typeof v === 'number' && Number.isFinite(v);
}

function isKnownKind(v: unknown): v is CommandKind {
    return (
        typeof v === 'string' && (KNOWN_KINDS as readonly string[]).includes(v)
    );
}

/**
 * 命令队列：外部控制的**信任边界入口**（威胁 T-01-05）。
 *
 * 结构校验是**全函数（total）**：未知 `kind` 或缺失/非法字段者被**确定性丢弃并计入拒绝记录**，
 * 绝不静默忽略、绝不因 `undefined` 解引用而抛错（旧原型 `TypeError` 类缺陷的反面）。
 */
export class CommandQueue {
    private buffer: Command[] = [];
    private rejections: RejectedCommand[] = [];
    private _rejectedTotal = 0;

    /** 累计被拒绝命令数（单调，直到重建队列）。 */
    get rejectedTotal(): number {
        return this._rejectedTotal;
    }

    /** 当前缓冲（尚未 drain）的命令数。 */
    get pending(): number {
        return this.buffer.length;
    }

    /** 接受一批外部命令：结构合法者入队，非法者确定性丢弃并记录。 */
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

    /** 取走全部缓冲命令（**插入顺序**）并清空缓冲：每 tick 只 drain 一次。 */
    drain(): Command[] {
        const out = this.buffer;
        this.buffer = [];
        return out;
    }

    /** 取走本批拒绝记录并清空（供上层转为事件）。 */
    drainRejections(): RejectedCommand[] {
        const out = this.rejections;
        this.rejections = [];
        return out;
    }
}

type ValidateResult =
    { ok: true; command: Command } | { ok: false; reason: string };

/** 结构校验：把 `unknown` 收窄为 `Command`，或给出确定性的拒绝原因。 */
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
