# Roadmap: AI 版球球王国（Evolved Marble）

## Overview

This is a single-milestone project delivered as **8 phases, one per system, in a fixed order**: 单位 → 物理模拟 → 操控 → 王国 → 渲染 → 录制 → AI 接入 → 统计与精彩回放. The systems are intentionally **relatively independent and low-coupling**; each phase attacks exactly one system and is **not** structured as a vertical end-to-end slice.

**There is intentionally no runnable intermediate state.** No phase produces a playable/complete simulation on its own; the final runnable simulation only exists once all 8 systems are assembled. Success criteria below describe what must be TRUE for *that system's* module contract and behavior (verified in isolation via tests/harnesses), not a shippable app per phase.

**Foundational design rules (apply to every phase):**

- **Type-first gate (mandatory per phase).** Each phase begins with type-declaration-only work: a per-folder `types.ts` plus `I*` interface definitions for that system. Between the type-declaration plan(s) and the implementation plan(s) there is a **MANDATORY user review gate** — the user reviews and approves the type/interface design before any implementation begins.
- **Code conventions (enforced in every phase).** Every class writes interface `I<Name>` first, then `implements` it; interfaces always start with uppercase `I`. All type declarations live in one `types.ts` per folder. Enums are **numeric enums** (string enums forbidden). Interface members/methods carry JSDoc; private members/methods carry JSDoc; no public members that are not in an interface; top-level `const` declarations carry JSDoc. Refactoring during implementation is expected.
- **No determinism.** No replay, no instruction recording, no cross-run/cross-platform reproducibility is designed or claimed anywhere. Highlight replay (Phase 8) works by **slicing the always-on recording**, never by deterministic simulation replay.
- **Pluggable, but only what's necessary.** AI unit control (Phase 3) and LLM commander/director (Phase 7) are pluggable interfaces. No superfluous customization points. The Python training link is a reserved design point only (v2).
- **Stack.** Physics = Rapier2D (`@dimforge/rapier2d`, WASM); rendering = PixiJS 2D top-down; recording = frame capture → browser **WebCodecs** (+ **Mediabunny**) video encoding (no ffmpeg); **Chrome-only**.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [x] **Phase 1: 单位系统** - 16 项单位属性、7 职业、6 武器、2 防具、等级/经验/升级、正态随机生成 (completed 2026-10-18)
- [x] **Phase 2: 物理模拟系统** - Rapier2D 复合刚体（部位打标）、类型化接触事件、伤害计算、固定 tick 推进 (completed 2026-10-19)
- [x] **Phase 3: 操控系统** - 单位级 AI 输入/输出契约、0.1s 决策节奏、可插拔控制 + 默认基线实现 (completed 2026-10-20)
- [x] **Phase 4: 王国系统** - 地图、行军、视野、军队、城池、驻扎/训练、军队/城池战斗触发与战后结算 (completed 2026-10-21)
- [ ] **Phase 5: 渲染系统** - PixiJS 顶视渲染、可辨单位/装备/阵营、HUD、自动镜头、Chrome 帧率
- [ ] **Phase 6: 录制系统** - 全程持续帧采集 → WebCodecs + Mediabunny 视频，附时间戳/索引
- [ ] **Phase 7: AI 接入系统** - 可插拔 LLM 指挥官/导演接口、信息申请机制、占位实现（不实际接入）
- [ ] **Phase 8: 统计与精彩回放系统** - 战斗与全局统计采集；精彩回放从已有录像原样截取

## Phase Details

### Phase 1: 单位系统

**Goal**: 建立完整可用的单位数据模型——16 项属性、7 个职业、6 种武器、2 种防具、正态随机生成与等级/经验/升级机制。
**Depends on**: Nothing (first phase)
**Requirements**: UNIT-01, UNIT-02, UNIT-03, UNIT-04, UNIT-05, UNIT-06
**Success Criteria** (what must be TRUE):

  1. 能按职业创建一个单位并读到全部 16 项属性（含加成与装备），属性集与规格一致。
  2. 7 个职业的初始属性、每级成长与装备/技能解锁表可查询，数值与规格一致。
  3. 6 种武器与 2 种防具的攻击/防御/破甲比率、质量数据完整，且可按「武器 × 防具」查到破甲比率。
  4. 生成同一职业的多个单位时，受随机影响的 7 项属性（生命上限/控制等级/攻击/防御/武器比率/防具比率/质量）呈均值按职业、标准差 = 均值/8 的正态分布，而非固定值。
  5. 按攻击/防御经验公式与击杀经验累积达到阈值时单位升级，基础属性按职业增长、生命值恢复「生命上限增加值」、并按解锁表获得装备/技能。

**Plans:** 5/5 plans complete
Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Wave 0：修复 Vitest `@` 别名与 tsconfig tests 覆盖；`tests/units/` 脚手架（为全部 6 项需求提供可验证 harness）
- [x] 01-02-PLAN.md — 类型先行：`src/units/types.ts` 数字枚举 + `I*` 接口（仅类型，无实现）→ **用户审查门禁**

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-03-PLAN.md — `src/units/data.ts` 职业/武器/防具常量表 + 破甲矩阵（UNIT-02/03/04）

**Wave 3** *(blocked on Wave 2 completion)*

- [x] 01-04-PLAN.md — `class Unit implements IUnit`：`getAttribute` + 升级/经验机制（UNIT-01/06）

**Wave 4** *(blocked on Wave 3 completion)*

- [x] 01-05-PLAN.md — `IRng` + `sampleNormal` + `spawnUnit` 正态生成（UNIT-05）

**Type-first gate**: Wave 1 (type declarations only) writes the unit folder's `types.ts` + `IUnit`/`IClass`/`IWeapon`/`IArmor`/`IUpgrade` interfaces; **user must review and approve the interface design before implementation begins** in Wave 2. Numeric enums for class/weapon/armor kinds; JSDoc on all interface members and top-level `const`.

### Phase 2: 物理模拟系统

**Goal**: 用 Rapier2D 复合刚体承载单位，把物理接触转为带部位标记的类型化事件，并按文档公式完成伤害与防具减伤计算，以固定步长 tick 推进。
**Depends on**: Phase 1
**Requirements**: PHYS-01, PHYS-02, PHYS-03, PHYS-04, PHYS-05
**Success Criteria** (what must be TRUE):

  1. 一个单位被实例化为复合刚体，本体/武器/防具为独立碰撞体且各自带有部位标记。
  2. 单位间碰撞产生**带部位标记的类型化事件**，可区分击中本体 / 武器 / 防具。
  3. 击中的伤害按 `max[A_A·P_A·W_A·(√Δv−1), 0]` 计算，并带均值/20 的正态抖动，结果可观测。
  4. 击中防具时按破甲比率应用减伤公式、击中本体时不触发减伤，数值与公式一致。
  5. 模拟以固定步长 tick（tick = 游戏 1 分钟）推进，且推进与渲染解耦。

**Plans:** 7/7 plans complete
Plans:

**Wave 0** *(prerequisite)*

- [x] 02-01-PLAN.md — 安装精确钉版 `@dimforge/rapier2d-compat@0.21.0`（`checkpoint:human-verify` 门禁）+ `tests/physics/` 脚手架 + Vitest worker-pool 验证（Pitfall 7）+ 共享确定性 `IRng` 测试辅助

**Wave 1** *(blocked on Wave 0)*

- [x] 02-02-PLAN.md — 类型先行：`src/physics/types.ts` 数字枚举 + `I*` 接口（仅声明）→ **用户类型设计审查门禁**

**Wave 2** *(round 2 — implementation; blocked on the Wave-1 gate)*

- [x] 02-03-PLAN.md — 纯伤害/减伤数学：`src/physics/damage.ts`（`computeDamageMean`/`rollDamage` σ=均值/20/`computeDamageReduction` D-11/D-13 分类）+ `tests/physics/damage.test.ts`（PHYS-03/04）
- [x] 02-04-PLAN.md — 物理常量 + 复合刚体：`src/physics/constants.ts` + `PhysicsWorld implements IPhysicsWorld`（本体/武器/防具逐 collider 质量与偏移、handle→部位索引、生命周期、状态读数、力/力矩、固定步 tick）+ `tests/physics/compound.test.ts`（PHYS-01/05）

**Wave 3** *(blocked on Wave 2)*

- [x] 02-05-PLAN.md — 接触→类型化事件：`tick()` 排空 `EventQueue`（仅 started）→ 部位打标 `IContactEvent[]`（无自碰撞）+ `tests/physics/events.test.ts`（PHYS-02）

**Wave 4** *(blocked on Wave 3)*

- [x] 02-06-PLAN.md — Δv（碰撞前速度·接触法向）+ 伤害事件：`tick()` 发出最终数值 `IDamageEvent`（防具减伤/本体不减伤/武器↔武器不伤害）+ `tests/physics/tick.test.ts`（PHYS-03/04）

**Wave 5** *(gap closure — 02-VERIFICATION.md G1)*

- [x] 02-07-PLAN.md — 修正旋转体 Δv 的旋转中心：ω×r 的力臂改以 `body.worldCom()`（质心）为参考点，与 `linvel()` 的质心速度配对 + `tests/physics/rotation.test.ts` 用 `applyTorque` 钉住质心正确的 Δv（PHYS-03）

**Type-first gate**: Wave 1 (02-02, type declarations only) writes the physics folder's `types.ts` — the numeric `ColliderPart` enum, the compound-body registration spec, the part-tagged `IContactEvent`/`IDamageEvent` shapes, the geometry/config types, and the `IPhysicsWorld` contract; **user must review and approve the interface design before implementation is planned**. Round 1 plans type declarations ONLY; the Wave-2 implementation plans (compound-body registration, event pipeline, damage/armor formulas, tick driver) are authored in round 2 after the gate. OQ-1 is confirmed at the gate: `B_A = 破甲比率` (sign-consistent, D-11).

### Phase 3: 操控系统

**Goal**: 定义单位级 AI 的输入/输出契约与 0.1s 决策节奏，并把 AI 控制做成可插拔模块 + 一个默认基线实现，使模拟可自主运行。
**Depends on**: Phase 2
**Requirements**: CTRL-01, CTRL-02, CTRL-03, CTRL-04
**Success Criteria** (what must be TRUE):

  1. 单位级 AI 输入契约可实现：自身属性、位置、64 条射线距离、射弹距离、16 个最近敌方简讯、16 个最近友方简讯。
  2. 单位级 AI 输出契约可实现：四向力、旋转力、武器技能、单位技能。
  3. 默认基线 AI 驱动下单位自主决策，每 0.1s（6 帧）决策一次。
  4. 控制模块可插拔：换入另一个 AI 实现时无需改动物理/单位系统，模拟仍可持续运行。
  5. 默认基线 AI 使单位能自主完成接近、攻击、脱离等行为，模拟无需人工输入即可持续运行。

**Plans:** 3/3 plans complete
Plans:

**Wave 1** *(round 1 — the type-first gate)*

- [x] 03-01-PLAN.md — 类型先行：`src/control/types.ts`（`SkillIntentKind` 数字枚举 + `IUnitObservation`/`IUnitAction`/`IUnitAI`/`IUnitAIProvider`/`ISensor`/`ISensingWorld`/`IDamageSink`/`IControlSystem` 等全部契约，仅声明）+ `tests/control/types.test.ts`（枚举钉版 + 编译期契约断言）→ **用户类型设计审查门禁（已批准）**

**Wave 2** *(round 2 — implementation; blocked on the approved type gate)*

- [x] 03-02-PLAN.md — 感知 + 控制循环：`src/control/constants.ts`、`Sensor implements ISensor`（64 射线解析几何、16 敌/16 友）、`ControlSystem implements IControlSystem`（注册/6-tick 决策/动作保持重施加/钳制/伤害路由/死亡注销）、`DefaultUnitAI implements IUnitAI` 基线 + `tests/control/{arena,damage-sink,loop,sensing}`（CTRL-01/02/03/04；首个 tracer 端到端切片）

**Wave 3** *(blocked on Wave 2)*

- [x] 03-03-PLAN.md — 默认 AI 完整行为树（追击/攻击/脱离 + 速度误差/PD 转向 + 技能意图/冷却）+ `tests/control/{default-ai,pluggable}`（CTRL-02/04；Provider 热插拔验收）

**Type-first gate**: Wave 1 (03-01, type declarations only) wrote the control folder's `types.ts` + `IUnitAI` (input/output contracts) and the pluggable provider interface; **the user approved the contract on 2026-10-19**. Wave 2/3 implement against the frozen contract. The default baseline AI is a separate `implements IUnitAI` class written in round 2.

### Phase 4: 王国系统

**Goal**: 交付地图与势力层——1000×1000 地图、时间系统、行军、视野、军队、城池、驻扎/训练，以及军队/城池战斗的触发与战后结算。
**Depends on**: Phase 3
**Requirements**: KING-01, KING-02, KING-03, KING-04, KING-05, KING-06, KING-07, KING-08
**Success Criteria** (what must be TRUE):

  1. 1000×1000 地图上有多个势力，各自拥有军队与城池；军队以固定 10m/h 行军、碰到地图边缘反弹。
  2. 时间系统按规格运行：战斗时 1× 速、无战斗时 24× 速，tick 间隔随速率同比（= 现实 1 秒对应时长的 1/60）。
  3. 行军时单位聚集在军队中心 25m 圆内并由**程序控制**（非 AI），且行军回血 1/h。
  4. 视野生效：军队半径 100m、城池半径 150m，决定势力可获取的信息。
  5. 军队战斗（距离 <80m 触发、80m 加权中心正方形战斗区、离区/结束判定）与城池战斗（同流程 + 战后获胜方接管、可能入驻、败方重组行军）按规格触发与结算。

**Plans:** 5/5 plans complete
Plans:

**Wave 1** *(round 1 — the type-first gate)*

- [x] 04-01-PLAN.md — 类型先行：`src/kingdom/types.ts`（8 个数字枚举 + `IFaction`/`IArmy`/`ICity`/`IBattle`/`IBattleSystem`/`IWorld`/`ITimeSystem`/`ICommander`/`IScenario` 等全部契约，仅声明）+ 两个阻塞型加性接缝（G-1 `IHealableUnit`、G-2 `IStaticObstacleWorld`，仅类型）+ `tests/kingdom/types.test.ts`（枚举钉版 + 编译期契约断言）→ **用户类型设计审查门禁**

**Wave 2** *(round 2 — implementation, parallel)*

- [x] 04-02-PLAN.md — 王国运行时竖切（tracer）：`constants`/`TimeSystem`/`scenario`/`Faction`/`City`/`Army`/`SensingWorld`/`MarchAI`/`IdleAI`/`BrakeAI`/`BattleAI`/`BattleSystem`/`DamageSink`/`KingdomWorld` + `time`/`march`/`battle`/`tracer` 测试（场景 → tick → 行军 → 遭遇 → 单位加入 → 伤害 → 结束）
- [x] 04-03-PLAN.md — 三个加性接缝实现（G-1 `Unit.heal` + `spawnUnit` 返回 `IHealableUnit`、G-2 `PhysicsWorld` 静态障碍、G-5 `setUnitAI` 所有权完成）+ `heal`/`static-obstacles`/`set-unit-ai` 测试

**Wave 3** *(depends on Wave 2)*

- [x] 04-04-PLAN.md — 城池训练/驻军/回血接线 + 100m/150m 视野并集 + 地形障碍与四面边界墙 + `city`/`vision`/`terrain` 测试

**Wave 4** *(depends on Wave 3)*

- [x] 04-05-PLAN.md — 城池战触发与战后结算（接管/入驻/败方重组）+ 占位指挥官 `ICommander` + `validateScenario` + `city`/`commander`/`scenario` 测试

**Type-first gate**: Wave 1 (04-01, type declarations only) writes the kingdom folder's `types.ts` — the numeric enums (`TimeRate`/`ArmyState`/`UnitControlMode`/`ArmyOrderKind`/`BattleState`/`BattleTriggerKind`/`BattleLifecycleKind`/`CityKind`) plus `IFaction`/`IArmy`/`ICity`/`IBattle`/`IBattleSystem`/`IWorld`/`ITimeSystem`/`ICommander`/`IScenario` and the two injected function types — together with two additive, declaration-only seams in the frozen folders: `IHealableUnit extends IUnit` (`src/units/types.ts`, G-1) and `IStaticObstacleWorld`/`IStaticObstacleSpec` (`src/physics/types.ts`, G-2). **The user must review and approve the type design — including G-1 (march 1/h + garrison 2/h healing) and G-2 (terrain blocking movement in the same Rapier world) — before round-2 implementation is planned.** `IUnit`, `IPhysicsWorld` and `src/control/types.ts` stay unchanged; `Unit.heal`, `PhysicsWorld.addStaticObstacle` and every kingdom implementation file are round 2.

### Phase 5: 渲染系统

**Goal**: 用 PixiJS 实现 2D 顶视渲染，使单位/武器/防具/阵营可辨，提供 HP/等级/阵营 HUD 与自动镜头，并在 Chrome 下维持数十单位混战的可交互帧率。
**Depends on**: Phase 2
**Requirements**: REND-01, REND-02, REND-03, REND-04, REND-05
**Success Criteria** (what must be TRUE):

  1. 使用 PixiJS 顶视渲染出模拟画面。
  2. 单位、武器、防具、阵营在画面上可辨（无需逐单位 filter/mask）。
  3. HUD 显示每个单位的 HP / 等级 / 阵营。
  4. 镜头自动跟拍激烈战斗区域，无需人工控制。
  5. Chrome-only 下数十单位混战维持可交互帧率。

**Plans**: 1 plan (round 1: type gate)
Plans:
- [ ] 05-01-PLAN.md — Wave 0 exact-pinned `pixi.js@8.22.0` install + `src/render/types.ts` contract + `tests/render/types.test.ts`; stops at the blocking type-design review
**Type-first gate**: Wave 1 writes the render folder's `types.ts` + `IRenderer`/`IHud`/`ICamera`/`IUnitView` interfaces; **user reviews and approves before implementation**.
**UI hint**: yes

### Phase 6: 录制系统

**Goal**: 对模拟全程持续采集帧并用浏览器 WebCodecs（配合 Mediabunny 库）编码导出为视频，录像附带时间戳/索引供后续精彩回放定位。
**Depends on**: Phase 5
**Requirements**: REC-01, REC-02, REC-03
**Success Criteria** (what must be TRUE):

  1. 模拟全程以固定步长持续采集帧，不遗漏且不阻塞模拟推进。
  2. 采集的帧经浏览器 WebCodecs（配合 Mediabunny）编码导出为视频文件。
  3. 录像附带时间戳/索引，可按时间定位到片段。

**Plans**: TBD
**Type-first gate**: Wave 1 writes the recording folder's `types.ts` + `IFrameCapture`/`IVideoEncoder`/`IRecordingIndex` interfaces; **user reviews and approves before implementation**. No determinism/replay semantics — recording is a capture of what was rendered.

### Phase 7: AI 接入系统

**Goal**: 定义可插拔的 LLM 指挥官 / 导演接入接口与信息申请机制，首期只提供接口与占位模块，不实际接入 LLM。
**Depends on**: Phase 4
**Requirements**: AI-01, AI-02, AI-03, AI-04
**Success Criteria** (what must be TRUE):

  1. LLM 指挥官接口可插拔：输入为影响范围/城池/军队/事件簿，输出为军队指令，决策节奏为每 84h 常规 + 重要事件。
  2. LLM 导演接口可插拔：输出视角分配与文字展示。
  3. 信息申请机制可用：可申请模拟现状 / 截图 / 历史事件；指挥官受限视野、导演上帝视角。
  4. 首期仅接口 + 占位实现：不发起任何真实 LLM 调用，占位模块不阻塞模拟独立运行。

**Plans**: TBD
**Type-first gate**: Wave 1 writes the AI-access folder's `types.ts` + `ILlmCommander`/`ILlmDirector`/`IInfoRequest` interfaces and the pluggable provider contracts; **user reviews and approves before implementation**. Placeholder implementations only — no real LLM calls.

### Phase 8: 统计与精彩回放系统

**Goal**: 采集战斗与全局统计，并实现「从已有录像中原样截取片段」的精彩回放，不依赖模拟重放。
**Depends on**: Phase 6
**Requirements**: STAT-01, STAT-02
**Success Criteria** (what must be TRUE):

  1. 采集战斗与全局统计（伤害、击杀、升级、战局结果等）并可查询。
  2. 精彩回放从已有录像中原样截取片段（不依赖模拟重放），产出片段可播放。
  3. 截取片段与录像时间戳/索引对齐，可定位到对应战局事件。

**Plans**: TBD
**Type-first gate**: Wave 1 writes the stats folder's `types.ts` + `IStatsCollector`/`IHighlightExtractor` interfaces; **user reviews and approves before implementation**. Highlight extraction operates purely on recorded video + index (slicing, not re-simulation).

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6 → 7 → 8

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. 单位系统 | 5/5 | Complete    | 2026-10-18 |
| 2. 物理模拟系统 | 7/7 | Complete    | 2026-10-19 |
| 3. 操控系统 | 3/3 | Complete    | 2026-10-20 |
| 4. 王国系统 | 5/5 | Complete    | 2026-10-21 |
| 5. 渲染系统 | 0/0 | Not started | - |
| 6. 录制系统 | 0/0 | Not started | - |
| 7. AI 接入系统 | 0/0 | Not started | - |
| 8. 统计与精彩回放系统 | 0/0 | Not started | - |
