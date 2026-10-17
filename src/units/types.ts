/**
 * 单位系统的全部类型声明：数字枚举 + `I*` 接口。
 * 本文件只含声明（枚举与接口），不含任何算法、数据表或运行时逻辑。
 * 通用可复用的 `IRng` 声明在 `src/common/types.ts`，此处仅做再导出。
 */

export type { IRng } from '@/common/types';

/**
 * 可通过 `IUnit.getAttribute` 读取的数值型属性。
 * 枚举成员一律为整数——本项目强制使用数字枚举（禁止字符串枚举）。
 */
export enum AttributeKind {
    /** 当前生命值。 */
    Health = 0,
    /** 生命上限：生命值不能超过此值。 */
    MaxHealth = 1,
    /** 等级。 */
    Level = 2,
    /** 当前经验值。 */
    Experience = 3,
    /** 经验比率 R_E：控制升级所需经验。 */
    ExperienceRatio = 4,
    /** 攻击经验比率 R_A：造成伤害时获取经验的比率。 */
    AttackExpRatio = 5,
    /** 防御经验比率 R_D：抵挡伤害时获取经验的比率。 */
    DefenseExpRatio = 6,
    /** 控制等级：表示使用经过多少轮训练的 AI 操控此单位。 */
    ControlLevel = 7,
    /** 基础攻击力。 */
    Attack = 8,
    /** 基础防御力。 */
    Defense = 9,
    /** 武器比率 P_A：使用武器时的伤害倍率。 */
    WeaponRatio = 10,
    /** 防具比率 P_D：使用防具时的防御倍率。 */
    ArmorRatio = 11,
    /** 质量：影响单位的惯性与碰撞。 */
    Mass = 12
}

/** 7 个职业。 */
export enum ClassKind {
    /** 剑士。 */
    Swordsman = 0,
    /** 弓箭手。 */
    Archer = 1,
    /** 狂战士。 */
    Berserker = 2,
    /** 锤兵。 */
    Hammer = 3,
    /** 骑士。 */
    Knight = 4,
    /** 剑盾。 */
    SwordShield = 5,
    /** 长矛兵。 */
    Spearman = 6
}

/** 6 种武器。 */
export enum WeaponKind {
    /** 长剑。 */
    Longsword = 0,
    /** 短剑。 */
    Shortsword = 1,
    /** 斧头。 */
    Axe = 2,
    /** 锤子。 */
    Hammer = 3,
    /** 弓箭。 */
    Bow = 4,
    /** 长矛。 */
    Spear = 5
}

/** 2 种防具。 */
export enum ArmorKind {
    /** 头盔。 */
    Helmet = 0,
    /** 盾牌。 */
    Shield = 1
}

/** 3 种具名技能。 */
export enum SkillKind {
    /** 万箭齐发（同时射出三根箭，形成散射）。 */
    ArrowStorm = 0,
    /** 冲锋（向一个方向冲锋并高速旋转）。 */
    Charge = 1,
    /** 旋转（原地高速旋转一小段时间）。 */
    Spin = 2
}

/** 装备槽位：区分 `IEquipment` 条目是武器还是防具。 */
export enum EquipmentKind {
    /** 武器槽。 */
    Weapon = 0,
    /** 防具槽。 */
    Armor = 1
}

/** 修正器 `IModifier` 与基础值的结合方式。 */
export enum ModifierMode {
    /** 加算：对基础值进行加减。 */
    Flat = 0,
    /** 乘算：对基础值按比例缩放。 */
    Multiplicative = 1
}

/** 单位生成时按正态分布随机得到的 7 项属性。 */
export interface ISpawnAttributes {
    /** 生命上限。 */
    readonly maxHp: number;
    /** 控制等级。 */
    readonly controlLevel: number;
    /** 基础攻击力。 */
    readonly attack: number;
    /** 基础防御力。 */
    readonly defense: number;
    /** 武器比率。 */
    readonly weaponRatio: number;
    /** 防具比率。 */
    readonly armorRatio: number;
    /** 质量。 */
    readonly mass: number;
}

/** 一件已装备的物品。 */
export interface IEquipment {
    /** 槽位判别式，决定下方两个字段哪一个存在。 */
    readonly kind: EquipmentKind;
    /** 武器种类；`kind === EquipmentKind.Weapon` 时存在，否则为 `undefined`。 */
    readonly weapon?: WeaponKind;
    /** 防具种类；`kind === EquipmentKind.Armor` 时存在，否则为 `undefined`。 */
    readonly armor?: ArmorKind;
}

/** 一条加成：修正某个数值型属性。 */
export interface IModifier {
    /** 受影响的属性。 */
    readonly kind: AttributeKind;
    /** 结合方式（加算 / 乘算）。 */
    readonly mode: ModifierMode;
    /** 修改量或倍率。 */
    readonly value: number;
}

/** 一条等级门槛的授予项：某等级获得哪些装备与技能。 */
export interface IUnlockEntry {
    /** 触发授予的等级。 */
    readonly level: number;
    /** 该等级授予的装备（无授予时为空数组）。 */
    readonly equipment: readonly IEquipment[];
    /** 该等级习得的技能（无授予时为空数组）。 */
    readonly skills: readonly SkillKind[];
}

/** 一个职业的完整定义。 */
export interface IClassDef {
    /** 职业标识。 */
    readonly id: ClassKind;
    /** 职业显示名。 */
    readonly name: string;
    /** 生命上限（1 级基础值）。 */
    readonly maxHp: number;
    /** 基础攻击力（1 级基础值）。 */
    readonly attack: number;
    /** 基础防御力（1 级基础值）。 */
    readonly defense: number;
    /** 武器比率（1 级基础值）。 */
    readonly weaponRatio: number;
    /** 防具比率（1 级基础值）。 */
    readonly armorRatio: number;
    /** 质量（1 级基础值）。 */
    readonly mass: number;
    /** 经验比率 R_E。 */
    readonly experienceRatio: number;
    /** 攻击经验比率 R_A。 */
    readonly attackExpRatio: number;
    /** 防御经验比率 R_D。 */
    readonly defenseExpRatio: number;
    /** 攻击成长系数（攻击类成长按 `k·L` 形式计算）。 */
    readonly attackGrowth: number;
    /** 防御成长系数（防御类成长按每级固定值计算）。 */
    readonly defenseGrowth: number;
    /** 生命上限每级成长值（升级时加算）。 */
    readonly maxHpGrowth: number;
    /** 初始装备。 */
    readonly initialEquipment: readonly IEquipment[];
    /** 等级门槛解锁表。 */
    readonly unlocks: readonly IUnlockEntry[];
}

/** 一种武器的定义。 */
export interface IWeaponDef {
    /** 武器标识。 */
    readonly id: WeaponKind;
    /** 武器显示名。 */
    readonly name: string;
    /** 质量。 */
    readonly mass: number;
    /** 攻击比率 W_A。 */
    readonly attackRatio: number;
    /**
     * 对不同防具的破甲比率；以 `ArmorKind` 为键，
     * 保证「武器 × 防具」查表完整且经过类型检查。
     */
    readonly penetration: Readonly<Record<ArmorKind, number>>;
}

/** 一种防具的定义。 */
export interface IArmorDef {
    /** 防具标识。 */
    readonly id: ArmorKind;
    /** 防具显示名。 */
    readonly name: string;
    /** 质量。 */
    readonly mass: number;
    /** 防御比率 S_D。 */
    readonly defenseRatio: number;
}

/** 单位核心契约：数值统一经 `getAttribute` 读取，禁止 getter/setter。 */
export interface IUnit {
    /** 统一数值读取入口；已存储的值直接返回，随等级派生的值按当前等级实时计算。 */
    getAttribute(kind: AttributeKind): number;
    /** 返回单位显示名；名称在生成时确定，用于录像中的辨识与追踪。 */
    getName(): string;
    /** 返回单位职业。 */
    getClass(): ClassKind;
    /** 返回当前装备列表。 */
    getEquipment(): readonly IEquipment[];
    /** 返回当前加成修正器列表。 */
    getModifiers(): readonly IModifier[];
    /** 返回已通过等级解锁习得的技能列表。 */
    getSkills(): readonly SkillKind[];
    /** 扣减生命值（用于让升级回复生命的效果可观察）。 */
    takeDamage(amount: number): void;
    /** 生命值归零后返回 `false`。 */
    isAlive(): boolean;
    /** 造成伤害时按攻击经验比率累积攻击经验。 */
    gainAttackExperience(damageDealt: number): void;
    /** 抵挡伤害时按防御经验比率累积防御经验。 */
    gainDefenseExperience(damageReduced: number): void;
    /** 击杀敌人时按敌人等级额外累积攻击经验。 */
    gainKillExperience(enemyLevel: number): void;
}
