# Phase 1: 单位系统 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-17
**Phase:** 1-单位系统
**Areas discussed:** 数值表组织, 对象与派生模型, 随机源, 模块布局

---

## 数值表组织

### Q1. 7 职业/6 武器/2 防具的数值存成什么形式？

| Option | Description | Selected |
|--------|-------------|----------|
| 类型化常量表 | 直接写在 TS 源文件：`const CLASS_TABLE: Record<ClassKind, IClassDef>`，顶层 const 写 JSDoc；改数值=改一处 | ✓ |
| JSON 数据文件 | 数据与代码解耦，运行时加载；需额外校验/类型断言 | |
| 每职业一个工厂/类 | 行为与数值绑定；体量大、重复 | |

**User's choice:** 类型化常量表
**Notes:** 便于实测校准、类型检查覆盖。

### Q2. 数值表的文件粒度？

| Option | Description | Selected |
|--------|-------------|----------|
| 单文件集中 | 单位文件夹内单一 data.ts 集中所有数值表 | ✓ |
| 按类别拆分 | classes.ts / weapons.ts / armors.ts 按类别拆 | |
| 逐项拆文件 | 每个职业/武器/防具各一个文件 | |

**User's choice:** 单文件集中
**Notes:** 即 `src/units/data.ts`。

---

## 对象与派生模型

### Q1. 单位对象怎么表示？

| Option | Description | Selected |
|--------|-------------|----------|
| class Unit implements IUnit | 数据+方法（levelUp/applyDamage 等），符合 interface-first 约定 | ✓ |
| 纯数据 + 纯函数 | IUnit 纯数据 + 独立纯函数（升级/伤害）处理 | |
| 数据与行为彻底分离 | 单位是纯数据，行为全在 system 类里（更 ECS 风格） | |

**User's choice:** class Unit implements IUnit

### Q2. 随等级成长的属性怎么处理？

| Option | Description | Selected |
|--------|-------------|----------|
| 派生计算 | 只存"基础值+等级"，当前攻击/防御由方法实时算 | ✓（改用专门方法） |
| 升级时改写存储 | 升级时把成长量写回存储的当前值 | |

**User's choice:** 派生计算 —— 但明确：**不喜欢 getter/setter，全用专门方法**（如 `getAttribute`）。
**Notes:** 用户原话："我不喜欢 getter setter 的设计，建议全用专门的方法，比如 getAttribute 这种"。

### Q2b. "专门方法"具体指哪种形态？

| Option | Description | Selected |
|--------|-------------|----------|
| 统一 getAttribute(kind) | 统一一个方法按枚举取值：`getAttribute(kind: AttributeKind): number` | ✓ |
| 每属性一方法 | getAttackPower() / getDefense() … | |
| 两者结合 | 内部走 getAttribute，公共只暴露少量语义化专用方法 | |

**User's choice:** 统一 getAttribute(kind)

### Q3. 装备与加成怎么表示？

| Option | Description | Selected |
|--------|-------------|----------|
| 装备列表 + 修正器 | 装备用带 kind 的列表，加成用 IModifier 列表；解锁表决定何时获得 | ✓ |
| 具体字段 | 装备爆炸成具体字段（weapons[]/armors[]），不用通用修正器 | |
| 先不做加成系统 | 只存装备，暂时不做通用加成 | |

**User's choice:** 装备列表 + 修正器

---

## 随机源

### Q1. 单位生成的随机源怎么做？

| Option | Description | Selected |
|--------|-------------|----------|
| 可注入 RNG | 定义最小 IRng 接口，默认实现包 Math.random；测试可注入固定序列 | ✓ |
| 直接用 Math.random | 不抽象（已无确定性要求） | |
| seeded PRNG | 自带 seeded PRNG（mulberry32 等） | |

**User's choice:** 可注入 RNG

### Q2. σ=μ/8 的正态会取到负值（属性不能为负），怎么处理？

| Option | Description | Selected |
|--------|-------------|----------|
| 截断到非负 | 取绝对值或截断到非负，属性永不为负 | ✓ |
| 不截断 | 按文档原样生成，负值由上层处理 | |
| 限制在 2σ 内 | 正态生成后限制在 [μ−2σ, μ+2σ] | |

**User's choice:** 截断到非负

---

## 模块布局

### Q1. 单位系统的目录结构？

| Option | Description | Selected |
|--------|-------------|----------|
| src/units/ | src/units/ 内含 types.ts、data.ts、Unit.ts、rng.ts 等；导入 @/units/... | ✓ |
| 平铺 src/ | 所有文件平铺在 src/ 下 | |
| domain/units/ | 按职责分 src/domain/units/ 等 | |

**User's choice:** src/units/

### Q2. types.ts 的边界怎么划？

| Option | Description | Selected |
|--------|-------------|----------|
| 全部集中 | 所有类型+枚举全放 src/units/types.ts | ✓ |
| 按子域分 | IRng 单独放 src/units/rng/types.ts | |

**User's choice:** 全部集中

---

## the agent's Discretion

- 枚举成员命名与取值；各 Def 接口字段结构。
- 正态分布算法（Box–Muller 等）与 `IRng` 方法集。
- `data.ts` 内部组织；除 `getAttribute(kind)` 外的具体方法签名。
- 升级/经验公式落地细节（以参考文档为准，实测校准）。

## Deferred Ideas

None — discussion stayed within phase scope.
