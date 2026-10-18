# Phase 2: 物理模拟系统 - Context

**Gathered:** 2026-10-18
**Status:** Ready for planning

<domain>
## Phase Boundary

用 Rapier2D 复合刚体承载单位：本体/武器/防具为按部位打标的独立碰撞体；物理接触转为**带部位标记的类型化事件**；按文档公式完成**伤害与防具减伤**计算；以**固定步长 tick** 推进（与渲染解耦）。本阶段只交付"物理模拟系统"这一模块及其测试；不涉及王国/行军/战斗触发（Phase 4）、渲染（Phase 5）、AI 控制（Phase 3）。

</domain>

<decisions>
## Implementation Decisions

### Rapier 包与版本
- **D-01:** 使用 **`@dimforge/rapier2d-compat`**（WASM 内联，Vite 无需额外 wasm 插件；初始化 `await RAPIER.init()` 一次）。 — **Reversibility:** costly — 物理引擎是后续所有模拟阶段的地基，替换会波及刚体/事件/伤害全部实现。
- **D-02:** Rapier **精确钉版**（如 `0.2x.x`），避免升级带来的物理行为漂移。

### 复合刚体与部位打标
- **D-03:** 复合体 = **单个 `RigidBody` + 多个 `Collider`**（本体/武器/防具各一个 collider，固定相对偏移）；武器随本体刚性旋转。符合文档"本体/武器/防具是独立碰撞体"。
- **D-04:** 部位标记用 **`collider handle → Map({ unitId, part })`**（`part` 用数字枚举：本体/武器/防具）；碰撞组（collision groups）**仅用于必要过滤**，不作为部位的主标识。

### 单位↔刚体映射
- **D-05:** **逐 collider 设质量**：本体 collider 质量 = `Unit.getAttribute(AttributeKind.Mass)`；武器/防具 collider 各自用其 def 质量（`IWeaponDef.mass` / `IArmorDef.mass`）。
- **D-06:** 几何尺寸——单位 = **圆**（球球，半径 R）、武器 = **细长 capsule**、防具 = **环绕弧/circle**；数值由 agent 给**合理默认**、集中在物理常量（单文件、顶层 `const` + JSDoc），**待实测校准**。
- **D-07:** 目录 **`src/physics/`**（含 `types.ts`）；物理层**拥有 Rapier world**、**按 id 注册**单位、持 `Map(id → { body, colliders })`，**不拥有 `Unit` 实例**（只引用 id）。 — **Reversibility:** costly — 目录/边界改动会波及后续 sim/操控/渲染的 import。

### 接触事件与伤害时序
- **D-08:** 用 **collision events（started）** + **碰撞前记录的两体速度**求法向相对速度 Δv（贴近文档"碰撞法向速度差"）。
- **D-09:** 物理层**只计算并发出带部位标记的类型化伤害事件**；把伤害应用回 `Unit`（`takeDamage` / `gainAttackExperience` / `gainDefenseExperience`）由**调用方**（如 sim 胶合层 / 测试）完成。
- **D-10:** **dt = 1/60 s，一次 tick = 一个物理 step**（战斗 1× 下 60 tick/s；AI 每 6 tick = 0.1s 决策一次）。物理推进**与渲染解耦**，按 tick 计数推进，不用 wall-clock。

### 公式与裁决（research 决议，2026-10-18）
- **D-11:** 破甲减伤符号采用 **`B_A = 破甲比率`**（符号一致），即 `ΔD = D_R·(1 − 100·pen/(100·pen + A_D·P_D·S_D))`。文档字面的 `1/破甲比率` 会让高破甲武器伤害反而更低、与武器表/风味文本矛盾——用户裁定用符号一致式。击中本体不减伤。
- **D-12:** Rapier 精确钉 **`@dimforge/rapier2d-compat@0.21.0`**；安装前加 `checkpoint:human-verify`（包合法性 SUS 标记）。
- **D-13:** **武器↔武器**碰撞**不产生伤害**；多防具单位：被击中的**具体防具 collider** 决定 `armorKind`（每个防具 collider 绑定其 `ArmorKind`）。
- **D-14:** 伤害事件只携带**最终数值**（`damage` / `damageReduced`），物理层不外泄 `Unit` 变更；`takeDamage`/`gain*Experience` 由调用方应用（呼应 D-09）。

### the agent's Discretion
- 碰撞组的具体位分配与应用场景；`part` 枚举的成员命名与取值；`Map` 的具体结构；形状常量（圆半径、武器/防具尺寸）的具体数值。
- 类型化接触/伤害事件的字段结构；接触法向与 Δv 的精确取法（同一 body 多 collider 的自碰撞处理等）。
- 伤害/减伤公式的落地细节**以参考文档为准**（实测后校准）。

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### 权威规格
- `.planning/reference/ai-marble-kingdom.md` — 伤害计算（`D̄_R = max[A_A·P_A·W_A·(√Δv − 1), 0]`、正态抖动 σ=均值/20）、防具减伤与破甲（`ΔD = D_R(1 − 100B_A/(100B_A + A_D·P_D·S_D))`）、质量、部位/装备语义。

### 单位契约（Phase 1，已冻结）
- `src/units/types.ts` — `IUnit`（含 `getAttribute`/`getEquipment`）、`AttributeKind`、`IEquipment`、`IWeaponDef`（含 `penetration: Record<ArmorKind, number>`）、`IArmorDef`。
- `.planning/phases/01-unit-system/01-CONTEXT.md` — 单位系统决策 D-01…D-12（约定、null/undefined、`src/common/`）。

### 需求 / 项目约定
- `.planning/REQUIREMENTS.md` § PHYS（PHYS-01..05） — 本阶段 v1 需求。
- `AGENTS.md` § Code Conventions（强制）+ § Constraints — 接口 `I` 前缀、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失值 null/undefined、通用抽象放 `src/common/`。

### 路线图
- `.planning/ROADMAP.md` § Phase 2: 物理模拟系统 — 目标、5 条成功标准、Type-first gate。

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `src/units/{types,data,Unit,spawn}.ts` — 单位契约与数据表；`src/common/{types,rng}.ts`。
- `IUnit.getAttribute(AttributeKind)` 提供 `Mass`/`Attack`/`Defense`/`WeaponRatio`/`ArmorRatio`；`getEquipment()` 提供装备；`IWeaponDef.penetration` / `IArmorDef.defenseRatio` 提供破甲/减伤数值。

### Established Patterns
- interface-first、每文件夹一个 `types.ts`、数字枚举、JSDoc、无 getter/setter、缺失值 null/undefined。
- 路径别名 `@/*` → `./src/*`；Vitest（`pnpm test`）；质量门 `pnpm typecheck` / `pnpm lint`。
- 通用可复用抽象放 `src/common/`（如 `IRng`）。

### Integration Points
- 物理层按 `unitId` 注册单位；后续 sim/操控/渲染消费物理事件与状态。
- 需在 Vite 下加载 Rapier WASM — `-compat` 内联即可，无需额外插件（本阶段首要验证点）。

</code_context>

<specifics>
## Specific Ideas

- 用户明确选择 `@dimforge/rapier2d-compat` + 精确钉版。
- 伤害与减伤严格以参考文档公式为准（实测后校准）。
- 物理层**不拥有 Unit**，只按 id 引用；保持系统低耦合。

</specifics>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope.（射弹/弓箭物理、技能物理效果、战斗触发与结算属后续阶段。）

</deferred>

---

*Phase: 2-物理模拟系统*
*Context gathered: 2026-10-18*
