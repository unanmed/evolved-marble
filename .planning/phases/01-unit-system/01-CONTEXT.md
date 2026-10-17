# Phase 1: 单位系统 - Context

**Gathered:** 2026-10-17
**Status:** Ready for planning

<domain>
## Phase Boundary

建立完整可用的单位数据模型：17 项单位属性、7 个职业、6 种武器、2 种防具，单位生成的正态随机，以及等级/经验/升级机制（含装备/技能解锁表）。本阶段只交付"单位系统"这一个模块及其测试；不涉及物理、AI、渲染、王国层。

</domain>

<decisions>
## Implementation Decisions

### 数值表组织
- **D-01:** 职业/武器/防具数值存为**类型化常量表**（TS 顶层 `const` + JSDoc），不使用 JSON 数据文件、不使用工厂函数。
- **D-02:** 数值表**单文件集中**在 `src/units/data.ts`（不按类别拆分、不逐项拆文件）。

### 对象与派生模型
- **D-03:** 单位用 `class Unit implements IUnit` 表示（数据 + 方法，符合 interface-first 约定）。 — **Reversibility:** costly — `IUnit` 是后续物理/操控/渲染系统共同依赖的核心契约，改动波及所有引用方。
- **D-04:** 随等级成长的派生属性**不存储**，由**统一方法** `getAttribute(kind: AttributeKind): number` 实时计算。 — **Reversibility:** costly — 所有属性读取都将经由该方法，替换需改动全部调用点。
- **D-05:** **禁止 getter/setter**（用户明确偏好）；属性读取一律走专门方法。
- **D-06:** 装备用**列表**表示（武器/防具，带 kind 区分），加成用 `IModifier` **修正器列表**表示；解锁表决定装备/技能在何时获得。

### 随机源
- **D-07:** 单位生成随机走**可注入的 `IRng` 接口**；默认实现包 `Math.random`（无确定性要求，抽象目的是便于测试注入固定序列）。
- **D-08:** 正态生成（均值按职业、σ = 均值/8）后**截断到非负**，保证属性（生命上限/控制等级/攻击/防御/武器比率/防具比率/质量）不为负。

### 模块布局
- **D-09:** 单位系统代码放在 `src/units/`（如 `types.ts` / `data.ts` / `Unit.ts` / `rng.ts`）；导入走路径别名 `@/units/...`（tsconfig 已配 `@/*` → `./src/*`）。 — **Reversibility:** costly — 目录/路径改动会波及后续所有系统的 import。
- **D-10:** 单位系统的**所有类型与枚举**（`IUnit`、`AttributeKind`、`ClassKind`、`WeaponKind`、`ArmorKind`、`IClassDef`、`IWeaponDef`、`IArmorDef`、`IModifier`、`IRng` 等）集中在 `src/units/types.ts`（遵守"每文件夹一个 types.ts"）。

### the agent's Discretion
- 枚举的具体成员命名与取值、`IClassDef`/`IWeaponDef`/`IArmorDef`/`IModifier` 的字段结构细节。
- 正态分布的具体算法（如 Box–Muller）、`IRng` 的方法集（如 `next()` / `normal()` 的取舍）。
- `data.ts` 的内部组织、各方法的具体签名（除已定的 `getAttribute(kind)` 形态外）。
- 升级/经验公式的落地细节以参考文档为准（实测后校准）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威规格
- `.planning/reference/ai-marble-kingdom.md` — 完整设计规格：单位属性定义、7 职业数值与成长、6 武器/2 防具数值、升级与经验公式、单位生成正态随机、四种部位/装备语义。本阶段数值一律以它为准（文档自述"数值需实测，仅作参考"）。

### 需求
- `.planning/REQUIREMENTS.md` § UNIT（UNIT-01..06） — 本阶段 v1 需求清单。

### 项目约定
- `AGENTS.md` § Code Conventions（强制） — 接口 `I` 前缀、每文件夹一个 `types.ts`、数字枚举、接口成员/顶层 const 的 JSDoc、禁止接口外的公共成员。
- `AGENTS.md` § Constraints — 单里程碑、类型先行+审查门禁、反过度设计。

### 路线图
- `.planning/ROADMAP.md` § Phase 1: 单位系统 — 目标、5 条成功标准、Type-first gate（Wave 1 类型 → 用户审查 → Wave 2 实现）。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- 无。`src/` 当前为空（"全部重写"提交后只剩脚手架）；本阶段从零建立单位系统。

### Established Patterns
- tsconfig：`strict`、`target/module = ESNext`、路径别名 `@/*` → `./src/*`、`include: ["src"]`。
- 测试：Vitest 可用（`pnpm test`），`tests/` 与 `src/` 分离（rootDir 覆盖仓库根）。
- 质量门：`pnpm typecheck` / `pnpm test` / `pnpm lint`。

### Integration Points
- 后续阶段将依赖本阶段契约：物理模拟（读取 `getAttribute` 得到的攻/防/质量/装备）、操控系统（AI 输入含单位属性）、渲染（HP/等级/阵营显示）。因此 `IUnit` 与 `AttributeKind` 需设计稳定。

</code_context>

<specifics>
## Specific Ideas

- 用户明确拒绝 getter/setter 设计，要求"专门方法"（如 `getAttribute` 这种统一方法）读取属性/派生值。
- 用户强调数值要**便于实测校准**——集中式类型化常量表即为此服务（改一处即可）。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.

</deferred>

---

*Phase: 1-单位系统*
*Context gathered: 2026-10-17*
