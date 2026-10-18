/**
 * 单位核心实现：`class Unit implements IUnit`。
 * 数值统一经 `getAttribute(kind)` 读取；随等级派生的值实时计算、绝不存储（D-04）；
 * 基础值一律取自生成时随机得到的 rolled 值（`ISpawnAttributes`），职业表只提供成长系数与比例。
 * 本文件只依赖 `@/units/data` 与 `@/units/types`，不引入任何顶层 `const`。
 */

import {
    ATTACK_EXP_DAMAGE_GATE,
    CLASS_DEFS,
    CONTROL_LEVEL_GROWTH_PER_LEVEL,
    DEFENSE_EXP_DAMAGE_GATE,
    KILL_EXP_LEVEL_FACTOR,
    LEVEL_THRESHOLD_BASE
} from '@/units/data';
import { AttributeKind, ModifierMode } from '@/units/types';
import type {
    ClassKind,
    IClassDef,
    IEquipment,
    IModifier,
    ISpawnAttributes,
    IUnit,
    SkillKind
} from '@/units/types';

/** 单位：承载生成属性、区分职业、并实现经验累积与升级的状态机。 */
export class Unit implements IUnit {
    /** 职业定义（基础值、成长系数、初始装备与升级解锁表）。 */
    readonly #def: IClassDef;
    /** 职业标识。 */
    readonly #classKind: ClassKind;
    /** 单位显示名，在生成时确定（D-12）。 */
    readonly #name: string;
    /** 生成时抽取的生命上限（1 级基础值）。 */
    readonly #maxHpBase: number;
    /** 生成时抽取的控制等级（1 级基础值）。 */
    readonly #controlLevelBase: number;
    /** 生成时抽取的基础攻击力（1 级基础值）。 */
    readonly #attackBase: number;
    /** 生成时抽取的基础防御力（1 级基础值）。 */
    readonly #defenseBase: number;
    /** 生成时抽取的武器比率 P_A。 */
    readonly #weaponRatio: number;
    /** 生成时抽取的防具比率 P_D。 */
    readonly #armorRatio: number;
    /** 生成时抽取的质量。 */
    readonly #mass: number;
    /** 当前生命值。 */
    #hp: number;
    /** 当前等级，从 1 开始。 */
    #level: number;
    /** 当前经验值，从 0 开始。 */
    #xp: number;
    /** 当前装备列表（初始装备 + 升级解锁的装备）。 */
    #equipment: IEquipment[];
    /** 当前加成修正器列表（构造时注入，Phase 1 无自身来源）。 */
    #modifiers: IModifier[];
    /** 已通过等级解锁习得的技能列表（未解锁即为空）。 */
    #skills: SkillKind[];

    /**
     * 创建一个单位。
     * @param classKind 职业。
     * @param roll 生成时按正态分布抽取的 7 项属性（作为 1 级基础值）。
     * @param modifiers 注入的加成修正器列表，默认空（Phase 1 无自身加成来源）。
     * @param name 单位显示名；省略时回退为职业名（D-12）。
     * @throws {RangeError} 当 `classKind` 不是有效的 `ClassKind` 枚举序号时（数字枚举在运行时可为任意数）。
     */
    constructor(
        classKind: ClassKind,
        roll: ISpawnAttributes,
        modifiers: readonly IModifier[] = [],
        name?: string
    ) {
        const def: IClassDef | undefined = CLASS_DEFS[classKind];
        if (def === undefined) {
            throw new RangeError(`Unknown ClassKind: ${String(classKind)}`);
        }
        this.#classKind = classKind;
        this.#def = def;
        this.#name = name ?? def.name;

        this.#maxHpBase = roll.maxHp;
        this.#controlLevelBase = roll.controlLevel;
        this.#attackBase = roll.attack;
        this.#defenseBase = roll.defense;
        this.#weaponRatio = roll.weaponRatio;
        this.#armorRatio = roll.armorRatio;
        this.#mass = roll.mass;

        this.#level = 1;
        this.#xp = 0;

        this.#equipment = [...this.#def.initialEquipment];
        /* 必须先于 `#hp` 赋值：`#hp` 的初始值经 `#applyModifiers` 读取本字段。 */
        this.#modifiers = [...modifiers];
        this.#skills = [];

        this.#hp = this.#applyModifiers(
            AttributeKind.MaxHealth,
            this.#maxHealth()
        );
    }

    /** 统一数值读取入口：已存储的值直接返回，随等级派生的值按当前等级与 rolled 基础值实时计算。 */
    getAttribute(kind: AttributeKind): number {
        switch (kind) {
            case AttributeKind.Health:
                return this.#hp;
            case AttributeKind.MaxHealth:
                return this.#applyModifiers(
                    AttributeKind.MaxHealth,
                    this.#maxHealth()
                );
            case AttributeKind.Level:
                return this.#level;
            case AttributeKind.Experience:
                return this.#xp;
            case AttributeKind.ExperienceRatio:
                return this.#def.experienceRatio;
            case AttributeKind.AttackExpRatio:
                return this.#def.attackExpRatio;
            case AttributeKind.DefenseExpRatio:
                return this.#def.defenseExpRatio;
            case AttributeKind.ControlLevel:
                return (
                    this.#controlLevelBase +
                    CONTROL_LEVEL_GROWTH_PER_LEVEL * (this.#level - 1)
                );
            case AttributeKind.Attack:
                return this.#applyModifiers(
                    AttributeKind.Attack,
                    this.#attackValue()
                );
            case AttributeKind.Defense:
                return this.#applyModifiers(
                    AttributeKind.Defense,
                    this.#defenseValue()
                );
            case AttributeKind.WeaponRatio:
                return this.#weaponRatio;
            case AttributeKind.ArmorRatio:
                return this.#armorRatio;
            case AttributeKind.Mass:
                return this.#mass;
            default: {
                const exhaustive: never = kind;
                throw new Error(
                    `Unhandled attribute kind: ${String(exhaustive)}`
                );
            }
        }
    }

    /** 返回单位显示名。 */
    getName(): string {
        return this.#name;
    }

    /** 返回单位职业。 */
    getClass(): ClassKind {
        return this.#classKind;
    }

    /** 返回当前装备列表的副本。 */
    getEquipment(): readonly IEquipment[] {
        return [...this.#equipment];
    }

    /** 返回当前加成修正器列表的副本。 */
    getModifiers(): readonly IModifier[] {
        return [...this.#modifiers];
    }

    /** 返回已习得技能列表的副本。 */
    getSkills(): readonly SkillKind[] {
        return [...this.#skills];
    }

    /**
     * 扣减生命值。策略：`amount` 非有限或非正时视为无效伤害并直接忽略（不改变状态、不引入
     * `NaN`/`Infinity`）；合法伤害将生命值钳制到 `[0, 生命上限]`，其中生命上限取经修正器调整后的
     * 值，以维持 `getAttribute(Health) <= getAttribute(MaxHealth)` 的公开不变量。
     */
    takeDamage(amount: number): void {
        if (!Number.isFinite(amount) || amount <= 0) {
            return;
        }
        const maxHealth = this.#applyModifiers(
            AttributeKind.MaxHealth,
            this.#maxHealth()
        );
        this.#hp = Math.max(0, Math.min(this.#hp - amount, maxHealth));
    }

    /** 生命值大于 0 时返回 `true`。 */
    isAlive(): boolean {
        return this.#hp > 0;
    }

    /**
     * 造成伤害时按攻击经验比率累积经验：`R_A·√(D−门槛)`（伤害须超过门槛）。
     * 仅接受有限且超过门槛的伤害值；非有限输入（`NaN`/`Infinity`）不累加经验，避免污染 `#xp`。
     */
    gainAttackExperience(damageDealt: number): void {
        if (
            Number.isFinite(damageDealt) &&
            damageDealt > ATTACK_EXP_DAMAGE_GATE
        ) {
            this.#xp +=
                this.#def.attackExpRatio *
                Math.sqrt(damageDealt - ATTACK_EXP_DAMAGE_GATE);
        }
        this.#checkLevelUp();
    }

    /**
     * 抵挡伤害时按防御经验比率累积经验：`R_D·√(ΔD−门槛)`（减免值须超过门槛）。
     * 仅接受有限且超过门槛的减免值；非有限输入不累加经验。
     */
    gainDefenseExperience(damageReduced: number): void {
        if (
            Number.isFinite(damageReduced) &&
            damageReduced > DEFENSE_EXP_DAMAGE_GATE
        ) {
            this.#xp +=
                this.#def.defenseExpRatio *
                Math.sqrt(damageReduced - DEFENSE_EXP_DAMAGE_GATE);
        }
        this.#checkLevelUp();
    }

    /**
     * 击杀敌人时按敌人等级额外累积攻击经验：`R_A·KILL_EXP_LEVEL_FACTOR·L`。
     * 策略：`enemyLevel` 非有限或非正时视为无效击杀并直接忽略——既防止 `NaN`/`Infinity` 污染 `#xp`，
     * 也防止 `Infinity` 驱动 `#checkLevelUp` 的多级循环无界膨胀。
     */
    gainKillExperience(enemyLevel: number): void {
        if (!Number.isFinite(enemyLevel) || enemyLevel <= 0) {
            return;
        }
        this.#xp +=
            this.#def.attackExpRatio * KILL_EXP_LEVEL_FACTOR * enemyLevel;
        this.#checkLevelUp();
    }

    /** 计算当前等级的攻击基础值（未叠加加成）：按等级缩放（OQ-2）`base + growth·L·(L−1)/2`。 */
    #attackValue(): number {
        const level = this.#level;
        return (
            this.#attackBase +
            (this.#def.attackGrowth * level * (level - 1)) / 2
        );
    }

    /** 计算当前等级的防御基础值（未叠加加成）：每级固定加算（OQ-2）`base + growth·(L−1)`。 */
    #defenseValue(): number {
        return this.#defenseBase + this.#def.defenseGrowth * (this.#level - 1);
    }

    /** 计算当前等级的生命上限基础值（未叠加加成）：`rolledBase + maxHpGrowth·(L−1)`。 */
    #maxHealth(): number {
        return this.#maxHpBase + this.#def.maxHpGrowth * (this.#level - 1);
    }

    /**
     * 对基础值应用匹配该属性的修正器：`(base + Σ flat) · Π(1 + multiplicative)`，结果钳制为非负。
     * Phase 1 仅对生命上限/攻击/防御三个战斗属性调用；其余属性不在本阶段的加成范围内（见计划范围边界）。
     */
    #applyModifiers(kind: AttributeKind, base: number): number {
        let flat = 0;
        let multiplicative = 1;
        for (const modifier of this.#modifiers) {
            if (modifier.kind !== kind) {
                continue;
            }
            if (modifier.mode === ModifierMode.Flat) {
                flat += modifier.value;
            } else {
                multiplicative *= 1 + modifier.value;
            }
        }
        return Math.max(0, (base + flat) * multiplicative);
    }

    /** 当前等级升级所需的经验：`LEVEL_THRESHOLD_BASE·(1+R_E)^#level`。 */
    #levelThreshold(): number {
        return (
            LEVEL_THRESHOLD_BASE *
            (1 + this.#def.experienceRatio) ** this.#level
        );
    }

    /**
     * 检查并执行升级：扣除阈值、结转余量，循环处理一次经验可触发的多次升级（OQ-4）。
     * 升级时按**生命上限的实际增量**回复生命，该增量取自经修正器调整后的 MaxHealth（`previous` 到
     * `current` 之差），从而让注入的乘算 MaxHealth 修正器得到尊重；回复后钳制到当前上限。
     */
    #checkLevelUp(): void {
        while (this.#xp >= this.#levelThreshold()) {
            this.#xp -= this.#levelThreshold();
            const previousMaxHealth = this.#applyModifiers(
                AttributeKind.MaxHealth,
                this.#maxHealth()
            );
            this.#level += 1;
            const currentMaxHealth = this.#applyModifiers(
                AttributeKind.MaxHealth,
                this.#maxHealth()
            );
            this.#hp = Math.min(
                this.#hp + (currentMaxHealth - previousMaxHealth),
                currentMaxHealth
            );
            this.#applyUnlocks();
        }
    }

    /** 应用当前等级对应的解锁项：将授予的装备与技能分别并入对应列表。 */
    #applyUnlocks(): void {
        for (const entry of this.#def.unlocks) {
            if (entry.level === this.#level) {
                this.#equipment.push(...entry.equipment);
                this.#skills.push(...entry.skills);
            }
        }
    }
}
