# Phase 3: Combat Mechanics, Data & Progression - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 3-Combat Mechanics, Data & Progression
**Areas discussed:** 数据表与属性模型, 伤害公式与校准, 命中去重/冷却, 经验/升级/生成随机, 单位命名（用户追加）

---

## 数据表与属性模型

| Option | Description | Selected |
|--------|-------------|----------|
| 三组件 (attrs/progress/equip) | 各更新节奏/消费者不同 | ✓ |
| 单一 IUnitAttrs 扩全 | 最少抽象，但一个组件被三类逻辑写 | |
| 交由 planner | | |

**User's choice:** 拆为 `IUnitAttrs` / `IUnitProgress` / `IUnitEquip` 三组件

| Option | Description | Selected |
|--------|-------------|----------|
| 分文件 + 数字枚举 id | classes/weapons/armor.ts；ClassKind/WeaponKind/ArmorKind | ✓ |
| 单文件汇总 | | |
| 交由 planner | | |

**User's choice:** 分文件 + 数字枚举 id

| Option | Description | Selected |
|--------|-------------|----------|
| 每级固定增量 | `stat += perLevel` | |
| 成长函数 | 参数存表、按等级求值 | ✓ |
| 照录待 planner | | |

**User's choice:** 成长函数（规格 `kL` 按等级相关项解释；系数为校准目标）

| Option | Description | Selected |
|--------|-------------|----------|
| 解锁真实改物理装备 | 升级增补/重挂碰撞体；技能仅数据 | ✓ |
| 仅改数据不改物理 | | |

**User's choice:** 解锁真实改物理装备

---

## 伤害公式与校准

| Option | Description | Selected |
|--------|-------------|----------|
| 武器侧为攻击方 | 命中防具才减伤；两侧非武器不结算 | ✓ |
| 按速度/质量判定 | | |
| 双向结算 | | |

**User's choice:** 武器侧为攻击方

| Option | Description | Selected |
|--------|-------------|----------|
| 严格照公式 | 不加额外阈值常量 | |
| 加显式校准常量 | | |
| 交由 planner | | |

**User's choice（自由文本）:** "所有的公式、参数都应该放到方便调整的地方，便于调整，不要藏在代码深处" → 所有公式参数集中在 `content/`

| Option | Description | Selected |
|--------|-------------|----------|
| 高破甲→高伤害 | B_A 用破甲比率，不取倒数（记录与规格字面偏离） | ✓ |
| 照字面取倒数 | 与"重锤专克高防"意图相反 | |
| 交由研究者 | | |

**User's choice:** 高破甲→高伤害

| Option | Description | Selected |
|--------|-------------|----------|
| 抖动先、减伤后 | 'damage' 流 N(D̄,D̄/20) 后减伤 | ✓ |
| 先减伤后抖动 | | |
| 交由 planner | | |

**User's choice:** 抖动先、减伤后

---

## 命中去重/冷却

| Option | Description | Selected |
|--------|-------------|----------|
| 挥砍周期 hit-set | 每摆动半周期清空已命中集合 | |
| per-pair 冷却计时 | | |
| 两者结合 | | |

**User's choice（自由文本）:** "不确定摆动周期的设定是否合理…应再预留一个冷却时间（类似无敌帧，仅针对这一个武器），时长可调" → 随后补充："不是说要去掉挥砍周期，两种方式都做，提供一个参数调整。冷却为 per-(武器,目标)"

| Option | Description | Selected |
|--------|-------------|----------|
| 每武器全局冷却 | | |
| per-(武器,目标) | | ✓ |
| 交由 planner | | |

**User's choice:** per-(武器,目标)（摆动周期 hit-set 并存，均可调）

| Option | Description | Selected |
|--------|-------------|----------|
| 无友伤，仅敌我 | 新增阵营字段 | ✓ |
| 允许友伤 | | |
| 交由 planner | | |

**User's choice:** 无友伤，仅敌我结算

| Option | Description | Selected |
|--------|-------------|----------|
| 可序列化入快照 | v3→v4 | ✓ |
| 不入快照 | | |
| 交由 planner | | |

**User's choice:** 可序列化入快照（v3→v4）

---

## 经验/升级/生成随机

| Option | Description | Selected |
|--------|-------------|----------|
| 照规格 + 参数集中 | 攻击用最终伤害 D；防御用 ΔD | ✓ |
| 用减伤前伤害 | | |
| 交由 planner | | |

**User's choice:** 照规格 + 参数集中

| Option | Description | Selected |
|--------|-------------|----------|
| 成长函数重算，无上限 | stat=f(level)，恢复 maxHp 增量 | ✓ |
| 增量累加 + 上限 | | |
| 交由 planner | | |

**User's choice:** 成长函数重算，无上限

| Option | Description | Selected |
|--------|-------------|----------|
| 命名流 + 正态采样 | 'spawn' 流；mean·(1+z/8)；控制等级仅数据 | ✓ |
| 查表近似 | | |
| 交由 planner | | |

**User's choice:** 命名流 + 正态采样

---

## 单位命名（用户追加）

| Option | Description | Selected |
|--------|-------------|----------|
| 达可调阈值等级命名 | 默认 2，可调 | ✓ |
| 出生即命名 | | |
| 交由 planner | | |

**User's choice:** 达可调阈值等级（默认 2）命名

| Option | Description | Selected |
|--------|-------------|----------|
| 内置中文姓名表 | researcher 网搜精简数据集 | ✓ |
| 多语言姓名表 | | |
| 交由研究者 | | |

**User's choice:** 内置中文"姓-名"表

| Option | Description | Selected |
|--------|-------------|----------|
| 确定性+局内唯一+入快照 | 命名流 | ✓ |
| 允许重名 | | |
| 交由 planner | | |

**User's choice:** 确定性 + 局内唯一 + 入快照

---

## 附：延后的新功能

**User's input:** 每单位 uid 记录总伤/总承伤/击杀/助攻/行动轨迹（每 N tick 采样）/战斗胜次，用于录像片尾统计与精彩回放桥段；"这个也可以先延后，看起来是一个独立的功能"。

**Outcome:** 整体延后为独立功能（见 CONTEXT Deferred）。

---

## the agent's Discretion

- `content/` 各表字段名与内部组织。
- 正态采样 / 姓名的实现细节（在流与唯一性约束内）。
- 最终校准数值（规格"需实测"）。

## Deferred Ideas

- 战斗统计/遥测 + 录像片尾统计/回放桥段（独立功能，整体延后）。
- 技能/能力执行本体（v2 ABIL / Phase 4）。
- 控制等级驱动 AI/RL（后续里程碑）。
- 待复核简化候选（成长函数必要性、装备解锁改物理复杂度）。
