# Phase 2: 物理模拟系统 (Physics Simulation) - Research

**Researched:** 2026-10-18
**Domain:** In-browser 2D physics with `@dimforge/rapier2d-compat` (WASM) — compound rigid bodies, part-tagged contact events, spec damage/armor math, fixed-timestep tick
**Confidence:** HIGH for the Rapier API surface and environment (verified against the exact pinned version's `.d.ts` this session, plus a working Node probe); HIGH for in-repo spec transcription; **LOW for one load-bearing formula ambiguity** (§Damage/Armor Formulas — the literal armor formula contradicts the weapon penetration table; flagged OQ-1 / A1).

> **Provenance tags used throughout:** `[VERIFIED: <source>]` = confirmed via tool AND an authoritative source (or an in-repo source-of-truth file `Read` this session, with a verbatim quote). `[CITED: <url>]` = referenced from official/authoritative documentation. `[ASSUMED]` = training knowledge or spec inference, **needs user confirmation** — see Assumptions Log.
>
> **Method note (this session):** The `research-plan` seam returned `context7` for all Rapier questions; no `context7` MCP provider is available in this environment, so per the fallback rule I used WebFetch against `rapier.rs` official docs, then downloaded the exact pinned tarball `@dimforge/rapier2d-compat@0.21.0` and read its TypeScript declarations (`dist/**/*.d.ts`) as the source of truth, and finally **ran two Node probes** (`node rapier-probe*.mjs`) exercising init/compound/events to confirm runtime behavior. Claims verified this way are tagged `[VERIFIED: @dimforge/rapier2d-compat@0.21.0 .d.ts]` / `[VERIFIED: node probe]`.

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**Rapier 包与版本**
- **D-01:** 使用 **`@dimforge/rapier2d-compat`**（WASM 内联，Vite 无需额外 wasm 插件；初始化 `await RAPIER.init()` 一次）。 — **Reversibility:** costly — 物理引擎是后续所有模拟阶段的地基，替换会波及刚体/事件/伤害全部实现。
- **D-02:** Rapier **精确钉版**（如 `0.2x.x`），避免升级带来的物理行为漂移。

**复合刚体与部位打标**
- **D-03:** 复合体 = **单个 `RigidBody` + 多个 `Collider`**（本体/武器/防具各一个 collider，固定相对偏移）；武器随本体刚性旋转。符合文档"本体/武器/防具是独立碰撞体"。
- **D-04:** 部位标记用 **`collider handle → Map({ unitId, part })`**（`part` 用数字枚举：本体/武器/防具）；碰撞组（collision groups）**仅用于必要过滤**，不作为部位的主标识。

**单位↔刚体映射**
- **D-05:** **逐 collider 设质量**：本体 collider 质量 = `Unit.getAttribute(AttributeKind.Mass)`；武器/防具 collider 各自用其 def 质量（`IWeaponDef.mass` / `IArmorDef.mass`）。
- **D-06:** 几何尺寸——单位 = **圆**（球球，半径 R）、武器 = **细长 capsule**、防具 = **环绕弧/circle**；数值由 agent 给**合理默认**、集中在物理常量（单文件、顶层 `const` + JSDoc），**待实测校准**。
- **D-07:** 目录 **`src/physics/`**（含 `types.ts`）；物理层**拥有 Rapier world**、**按 id 注册**单位、持 `Map(id → { body, colliders })`，**不拥有 `Unit` 实例**（只引用 id）。 — **Reversibility:** costly — 目录/边界改动会波及后续 sim/操控/渲染的 import。

**接触事件与伤害时序**
- **D-08:** 用 **collision events（started）** + **碰撞前记录的两体速度**求法向相对速度 Δv（贴近文档"碰撞法向速度差"）。
- **D-09:** 物理层**只计算并发出带部位标记的类型化伤害事件**；把伤害应用回 `Unit`（`takeDamage` / `gainAttackExperience` / `gainDefenseExperience`）由**调用方**（如 sim 胶合层 / 测试）完成。
- **D-10:** **dt = 1/60 s，一次 tick = 一个物理 step**（战斗 1× 下 60 tick/s；AI 每 6 tick = 0.1s 决策一次）。物理推进**与渲染解耦**，按 tick 计数推进，不用 wall-clock。

### the agent's Discretion
- 碰撞组的具体位分配与应用场景；`part` 枚举的成员命名与取值；`Map` 的具体结构；形状常量（圆半径、武器/防具尺寸）的具体数值。
- 类型化接触/伤害事件的字段结构；接触法向与 Δv 的精确取法（同一 body 多 collider 的自碰撞处理等）。
- 伤害/减伤公式的落地细节**以参考文档为准**（实测后校准）。

### Deferred Ideas (OUT OF SCOPE)
None — discussion stayed within phase scope.（射弹/弓箭物理、技能物理效果、战斗触发与结算属后续阶段。）
</user_constraints>

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHYS-01 | 单位由 Rapier2D 复合刚体表示，本体/武器/防具为独立碰撞体并按部位打标 | §Standard Stack + §Pattern 1 (compound body) + §Pattern 2 (handle→part Map); verified: one `RigidBody` + N `Collider`s, per-collider `setMass`, local offsets; same-body colliders never self-collide (node probe) |
| PHYS-02 | 物理接触转换为带部位标记的类型化模拟事件 | §Pattern 3 (EventQueue + drainCollisionEvents) + §Pattern 4 (part-tagged event struct); verified API signatures from the 0.21.0 `.d.ts` |
| PHYS-03 | 伤害按文档公式计算，含碰撞法向速度差 Δv 与正态抖动（σ = 均值/20） | §Damage/Armor Formulas (verbatim) + §Pattern 5 (Δv acquisition via pre-step velocity · contact normal) + reuse of `sampleNormal` (σ = mean/20) |
| PHYS-04 | 防具减伤与破甲按文档公式计算（击中本体不触发减伤） | §Damage/Armor Formulas (verbatim) + **OQ-1: the literal armor formula inverts the penetration table** — must be resolved |
| PHYS-05 | 模拟以固定步长 tick 推进（tick = 游戏 1 分钟），与渲染解耦 | §Pattern 6 (`world.timestep = 1/60`; one `step()` per tick; no wall-clock); §Environment Availability |
</phase_requirements>

---

## Summary

Phase 2 adds the project's **first runtime dependency** (`@dimforge/rapier2d-compat`, exact-pinned) and stands up the second system module, `src/physics/`. The work splits cleanly into (a) a **compound-body layer** that mirrors each unit as one `RigidBody` carrying three mass-tagged `Collider`s, (b) a **contact→typed-event layer** built on Rapier's `EventQueue`, (c) a **pure damage/armor math layer** transcribed from the spec, and (d) a **fixed-timestep driver**. Every one of these was validated this session against the exact pinned version.

The Rapier API is well-suited to every locked decision, and three concrete facts remove the phase's biggest uncertainties: (1) **colliders attached to the same rigid body never generate contacts or collision events with each other** — verified empirically (node probe: 400 steps, compound body with 3 colliders, `SELF_EVENTS=0`) and by the official changelog — so the intra-unit self-collision concern in CONTEXT's discretion list is a non-issue; (2) **the collision event callback carries only two collider handles and a `started` boolean — no normal** — so the contact normal must be read from `world.contactPair(col1, col2, (manifold) => manifold.normal())`; D-08's chosen approach (pre-step velocities + normal) maps directly onto this API; (3) **collision groups are two packed 16-bit masks**, which is exactly the limit the prior-art project hit at ">16 units" — the design's decision to use a `handle → Map` for part identity (D-04) sidesteps it entirely, but the plan must explicitly forbid per-unit group bits.

The single most important thing the planner must not miss is a **self-inconsistent spec formula**. The weapon table's "破甲比率" (penetration) is clearly meant to make heavy weapons better against armor (锤子 vs 头盔 = 5, highest), yet the literal damage-reduction formula `ΔD = D_R(1 − 100B_A/(100B_A + A_D·P_D·S_D))` with `B_A = 1/penetration` makes **higher penetration yield *less* final damage** (algebra below). The two readings coincide only at penetration = 1, so the bug is invisible for 短剑 but inverts the entire weapon roster. This is a design decision the user must confirm before Wave-2 damage code is written (OQ-1 / A1).

**Primary recommendation:** Wave 1 writes **only `src/physics/types.ts`** — the numeric `ColliderPart` enum, the part-tagged contact/damage event interfaces, and the `IPhysicsWorld`-style contract — and stops at the mandatory user review gate. The **first Wave-1 output must also present OQ-1 (the penetration sign)** for a ruling. Wave 2 implements the compound-body registration, the event pipeline, the pure damage/armor functions, and the tick driver, with geometry/`dt` values as top-level JSDoc'd `const`s in one file for calibration. Install the pinned package behind a `checkpoint:human-verify` (the legitimacy seam rates it `SUS` — "too-new" — see §Package Legitimacy Audit; the rating is a freshness artifact, and the checkpoint is cheap insurance).

---

## Architectural Responsibility Map

> Single in-browser process, no server tiers. "Tiers" are architectural layers within that process.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rapier world ownership, body/collider lifecycle, tick advance | Physics module (`src/physics/`) | — | D-07: physics owns the world and the `id → {body, colliders}` map |
| Compound-body construction (body/weapon/armor colliders, offsets, mass) | Physics module | unit data (`IUnit` numbers passed in) | D-03/D-05; physics holds *numbers*, not `Unit` instances (D-07) |
| Part identity (collider handle → `{unitId, part}`) | Physics module | — | D-04; handle-keyed, NOT collision-group-keyed |
| Contact → typed event emission (part-tagged) | Physics module | — | PHYS-02 / D-09 |
| Damage + armor-reduction math | Physics module (pure functions) | — | PHYS-03/04; D-09 says physics computes, caller applies |
| Δv acquisition (pre-step velocity · contact normal) | Physics module | — | D-08 |
| **Applying** damage/exp to a `Unit` (`takeDamage`, `gain*Experience`) | **Caller** (sim glue / tests) | — | D-09 — explicitly out of the physics layer |
| Unit attribute/equipment source of truth | Unit system (`src/units/`, Phase 1) | — | Physics reads numbers the caller supplies; it does not import `Unit` |
| Normal jitter RNG (σ = mean/20) | `src/common/rng.ts` (`IRng` + `sampleNormal`, reused) | injected by caller | Existing shared abstraction (AGENTS §9); no new RNG |
| Geometry/`dt` calibration constants | Physics constants file | — | D-06: single file, top-level `const` + JSDoc |
| Rendering / AI control / battle triggering | **Out of phase** (P5 / P3 / P4) | — | Phase boundary |

---

## Project Constraints (from AGENTS.md)

Actionable directives the planner MUST verify (treated with the same authority as CONTEXT decisions):

1. **Interface-first:** every class writes `I<Name>` first, then `implements` it. Interfaces always start with uppercase `I`.
2. **One `types.ts` per folder:** all type declarations for the physics system live in `src/physics/types.ts`.
3. **Numeric enums only** — string enums are forbidden (`ColliderPart`, and any event-kind enum, must be integer-valued).
4. **JSDoc:** required on every interface member/method; required on private members/methods; optional on public members that implement an interface.
5. **No public members outside the interface:** a `PhysicsWorld` class may not expose any public member absent from its `IPhysicsWorld` interface.
6. **Top-level `const` declarations require JSDoc** — this applies to every geometry/`dt`/formula constant.
7. Keep other comments sparse.
8. **Absent values:** absent *object* reference → `null`; absent *literal* (number/enum/boolean/string) → optional/`undefined`. (E.g. a contact event's `armorKind?` is `undefined` when the defender was hit on the body, not `null`.)
9. **Reusable, system-agnostic abstractions live in `src/common/`.** The damage-jitter RNG must reuse the existing `IRng` / `sampleNormal` from `src/common/` — do **not** create a physics-local RNG.
10. **Path alias** `@/*` → `./src/*` (configured in both `vite.config.ts` and `vitest.config.ts`).
11. **Gates:** `pnpm typecheck`, `pnpm lint` (repaired in Phase 1 via the TypeScript side-by-side alias), `pnpm test`.
12. **No getters/setters** (Phase-1 pattern; read via dedicated methods).

---

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dimforge/rapier2d-compat` | **0.21.0** (exact pin) `[VERIFIED: npm registry — latest = 0.21.0, published 2026-09-25]` | 2D physics engine (WASM) — rigid bodies, colliders, contacts, events | The official Dimforge JS binding; the project's locked choice (D-01). `-compat` = WASM inlined as base64 → **no Vite WASM plugin needed** `[CITED: rapier.rs/docs/user_guides/javascript/getting_started_js]` `[VERIFIED: @dimforge/rapier2d-compat@0.21.0 package.json — zero dependencies, `sideEffects:false`, exports `.` → `dist/rapier.mjs`]` |
| TypeScript | 7.0.2 (`tsc` via `@typescript/native`) `[VERIFIED: node_modules — Phase 1]` | Language; `strict`, ESNext | Project-declared |
| Vitest | 5.0.4, `environment: 'node'` `[VERIFIED: vitest.config.ts]` | Test runner (Rapier verified to run under Node — see probe) | Project-declared |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `IRng` + `sampleNormal` (`src/common/rng.ts`) | in-repo (Phase 1) `[VERIFIED: src/common/rng.ts]` | Normal jitter for damage (`σ = mean/20`) and any test determinism | Reuse — do **not** add a randomness library (AGENTS §9) |

**No other runtime dependency is added by this phase.** No collision-shape, math, or ECS library is needed.

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `@dimforge/rapier2d-compat` (WASM inlined) | `@dimforge/rapier2d` (separate `.wasm` file) | Rejected by D-01: the plain package needs a bundler that copies/emits `.wasm`; `-compat` trades ~3.3 MB of JS for zero build config. |
| `-compat` latest `0.21.0` | prior stable `0.20.0` (published 2026-08-08) | Only relevant if the user wants to avoid a 3-week-old release; `0.21.0` is the current stable and its API is verified here. Flag in OQ-2. |
| Rapier | planck-js (old project) | Explicitly dropped (PROJECT.md Key Decisions). |

**Version verification:** `npm view @dimforge/rapier2d-compat version` → `0.21.0`; version history read this session (`0.20.0` = 2026-08-08, `0.21.0` = 2026-09-25). The full TypeScript surface (`dist/**/*.d.ts`) was downloaded and read for the exact pinned version, and runtime behavior confirmed by a Node probe.

**Installation:**
```bash
# project uses pnpm + exact-pin policy (D-02)
pnpm add -E @dimforge/rapier2d-compat@0.21.0
```
(Note: `-E` writes an exact version into `package.json`. The prior lockfile contains no dimforge entry — this is the project's first runtime dependency `[VERIFIED: pnpm-lock.yaml has no 'dimforge'/'rapier']`.)

---

## Package Legitimacy Audit

> Run via `gsd-tools query package-legitimacy check --ecosystem npm @dimforge/rapier2d-compat` this session.

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `@dimforge/rapier2d-compat` | npm | package first published **2022-01-27** (4+ yrs); latest **0.21.0** published 2026-09-25 (~3 weeks old) | **37,060/wk** | `github.com/dimforge/rapier` (official Dimforge) | **SUS** (reason: `too-new`) | **Flagged — planner must add a `checkpoint:human-verify` before install** |

**Interpretation (important):** the seam's `SUS` verdict rests **solely** on `too-new`, which it computes from the *latest version's* publish date (2026-09-25), not the package's age. The package itself is 4+ years old, is the official Dimforge binding, has ~37k weekly downloads, **zero dependencies**, and no `postinstall` script (`postinstall: null`). This is a legitimate package; the freshness flag is a false-positive-shaped ablation (§Package Legitimacy Protocol: keep + checkpoint). The checkpoint is cheap and satisfies the gate.

- **Note on `@dimforge/rapier2d-compat` vs `@dimforge/rapier2d`:** both exist and are official; `-compat` is the correct one per D-01 (inlined WASM). Not a slopsquat risk.
- **Packages removed due to [SLOP] verdict:** none.
- **Packages flagged as suspicious [SUS]:** `@dimforge/rapier2d-compat` — planner inserts `checkpoint:human-verify` before `pnpm add`.

*No package name in this research was discovered via WebSearch/training alone — the package is named by the locked decision (D-01) and its registry entry was inspected directly, so the name itself is authoritative. The version pin `0.21.0` is `[VERIFIED: npm registry]` + read from the downloaded tarball.*

---

## Architecture Patterns

### System Architecture Diagram

Data/control flow for the physics system (all in-process; render/CPU-tick decoupled):

```
                       caller (sim glue / tests)               Phase 3 (forces) ─┐
                              │  registerUnit(spec)                              │ applyForce/rotate
                              ▼                                                  ▼
   ┌───────────────────────────────────────────────────────────────────────────────────┐
   │ IPhysicsWorld  (src/physics/)                                                      │
   │                                                                                    │
   │  owns: RAPIER.World, EventQueue, IRng(injected)                                     │
   │  maps: unitBodies: Map<unitId, {body, colliders:{body,weapon,armor}}>               │
   │        colliderIndex: Map<colliderHandle, {unitId, part, weaponKind?, armorKind?}>  │
   │                                                                                    │
   │  registerUnit(spec): ONE RigidBody + ColliderDesc.ball / .capsule (offsets+masses)  │
   │                                                                                    │
   └───────────────┬───────────────────────────────────────────────────────────────────┘
                   │ tick()  (one call per game-minute / 1/60 s)
                   ▼
   ① snapshot pre-step velocities of every registered body       (Δv source, D-08)
   ② world.step(eventQueue)                                     (world.timestep fixed)
   ③ eventQueue.drainCollisionEvents((h1,h2,started) => …)
        ├─ started === false → ignore
        ├─ colliderIndex.get(h1), .get(h2) → {unitId, part, …}; same unitId → skip (defensive)
        └─ world.contactPair(c1, c2, (manifold) => n = manifold.normal())   ← world-space normal
   ④ for each qualifying pair: computeDamage(pre-step v·n, attacker weapon, defender armor/body)
        → IDamageEvent { attackerId, defenderId, part, weaponKind?, armorKind?, deltaV,
                         damageMean, damage, damageReduced }          (typed, part-tagged)
   ⑤ return / callback the IDamageEvent[] to the caller
                   │
                   ▼
   CALLER applies: unit.takeDamage(damage); attacker.gainAttackExperience(dealt);
                   defender.gainDefenseExperience(reduced)   ← NOT physics (D-09)
```

Key decision points: (a) register → which colliders/offsets/masses; (b) contact → which part pair (weapon↔armor, weapon↔body, body↔body…); (c) damage → jitter then armor reduction, or no reduction on body hit.

### Recommended Project Structure
```
src/
└── physics/
    ├── types.ts        # ALL enums + I* interfaces (ColliderPart, IContactEvent, IDamageEvent,
    │                   #   IPhysicsWorld, IUnitPhysicsSpec, IUnitBodyRef, IPhysicsEvent…); no logic
    ├── constants.ts    # top-level JSDoc'd consts: DT (1/60), body radius, weapon/armor dims, offsets
    ├── damage.ts       # pure functions: computeDamageMean, rollDamage(σ=mean/20), computeArmorReduction
    └── PhysicsWorld.ts # class PhysicsWorld implements IPhysicsWorld (Rapier world + event pipeline)
tests/
└── physics/
    ├── damage.test.ts        # pure damage/armor math vs hand-computed spec values
    ├── compound.test.ts      # 1 RigidBody + N Colliders; masses sum; handle→part map; removal cleanup
    ├── events.test.ts        # two scripted bodies → started events with correct part tags + Δv
    └── tick.test.ts          # fixed dt; N ticks advance deterministically-ish; world.timestep === 1/60 (f32)
```
`constants.ts` is an addition beyond CONTEXT's example list but is forced by AGENTS §6 (every top-level `const` needs JSDoc) + D-06 (single calibration file). `damage.ts` keeps pure math out of the class so it is trivially unit-testable without Rapier.

### Pattern 1: Compound body — ONE `RigidBody`, N `Collider`s with local offsets and per-collider mass
**What:** Create the body with `world.createRigidBody(RigidBodyDesc.dynamic()...)`, then attach each part with `world.createCollider(colliderDesc, body)`. Give each collider its own mass (`setMass`) and local offset (`setTranslation`); the body's total mass becomes the sum.
**When to use:** Every unit (D-03/D-05).
**Why it works:** Rapier computes the body mass/inertia as the sum of attached colliders' contributions `[CITED: rapier.rs/docs/user_guides/javascript/colliders#mass-properties]`; the multi-collider approach is "much more efficient and numerically efficient than the joint approach" `[CITED: rapier.rs/docs/user_guides/javascript/joints]`.
**Example (verified):**
```js
// Source: @dimforge/rapier2d-compat@0.21.0 dist/geometry/collider.d.ts (ball/capsule/setMass/setTranslation)
// + node probe (bodyA.mass() === 90 for setMass(70)+setMass(12)+setMass(8))
const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y));
const bodyCol = world.createCollider(
  RAPIER.ColliderDesc.ball(BODY_RADIUS).setMass(bodyMass)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
const weaponCol = world.createCollider(
  RAPIER.ColliderDesc.capsule(WEAPON_HALF_LEN, WEAPON_RADIUS)
    .setTranslation(WEAPON_OFFSET_X, 0).setMass(weaponMass)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
// armor = circle (Rapier 2D has no arc primitive) offset from centre; see D-06 / Pattern 7
const armorCol = world.createCollider(
  RAPIER.ColliderDesc.ball(ARMOR_RADIUS).setMass(armorMass), body);
```
In 2D, `ColliderDesc.capsule(halfHeight, radius)` (principal axis = local **y**) and rotation is a **number (angle)** `[VERIFIED: @dimforge/rapier2d-compat@0.21.0 .d.ts — collider.d.ts:688, setRotation(angle)]`.

### Pattern 2: Part identity via `collider.handle → Map` (NOT collision groups)
**What:** A single `Map<number, {unitId, part, weaponKind?, armorKind?}>` keyed by the collider handle. Lookups happen inside the event drain.
**When to use:** All part tagging (D-04).
**Why:** Collision groups are a **single number packing two 16-bit masks** (16 membership bits + 16 filter bits) `[VERIFIED: @dimforge/rapier2d-compat@0.21.0 .d.ts — interaction_groups.d.ts]` `[CITED: rapier.rs/docs/user_guides/javascript/colliders#collision-groups-and-solver-groups]`. Encoding "unit N" needs one bit per unit → hard cap of 16. The handle map is unbounded and is the *only* thing that survives a handle→collider round trip. Reserve collision groups for coarse filtering only (e.g. two or three factions).
**Pitfall hook:** handles are **reused** after `removeCollider` — see Pitfall 3.

### Pattern 3: Collision events via `EventQueue`
**What:** `const q = new RAPIER.EventQueue(true); world.step(q); q.drainCollisionEvents((h1, h2, started) => …)`.
**When to use:** Every tick (PHYS-02).
**Why:** Collision events are generated only if at least one collider of the pair has `ActiveEvents.COLLISION_EVENTS` (= 1) `[CITED: rapier.rs/docs/user_guides/javascript/colliders#active-events]` `[VERIFIED: .d.ts — ActiveEvents.COLLISION_EVENTS = 1]`. `EventQueue(true)` auto-drains before each step, preventing unbounded RAM growth `[VERIFIED: .d.ts — event_queue.d.ts:70-75]`.
**The normal is NOT in the event:** the callback signature is exactly `(handle1: number, handle2: number, started: boolean) => void` `[VERIFIED: @dimforge/rapier2d-compat@0.21.0 .d.ts — event_queue.d.ts:89]`. Fetch it per pair with `world.contactPair(col1, col2, (manifold, flipped) => { const n = manifold.normal(); })` `[VERIFIED: .d.ts + node probe: normal = {x:1,y:0}]`. `TempContactManifold` is a temporary — read `x`/`y` inside the closure, never retain it `[VERIFIED: .d.ts — narrow_phase.d.ts:50]`.

### Pattern 4: Typed, part-tagged event structs
**What:** A numeric `ColliderPart` enum (`Body = 0`, `Weapon = 1`, `Armor = 2`) plus interfaces `IContactEvent` and `IDamageEvent` with optional literal fields for the equipment kinds.
**When to use:** The physics → caller boundary (PHYS-02/03/04; D-09).
**Why:** meets "带部位标记的类型化事件" and the AGENTS absent-literal rule — a body hit carries `armorKind?: undefined`, not `null`. Because penetration is looked up per (weapon × armor *kind*), the part tag must carry the **equipment kind** for weapon/armor colliders, not just the coarse `part`. `[ASSUMED — interface shape is agent discretion pending the review gate]`

### Pattern 5: Δv = pre-step relative normal velocity · contact normal
**What:** Before stepping, snapshot each registered body's linear velocity (and, optionally, angular velocity for offset weapons). On a `started` weapon-hit event, project the pre-step relative velocity onto the world-space contact normal: `Δv = |(vAttackerPoint − vDefenderPoint) · n|`.
**When to use:** Every damage-bearing contact (D-08, PHYS-03).
**Why it matches the spec:** the spec defines Δv as "武器与击中单位的防具（或其本身）的碰撞法向速度差，单位是 m/s" `[VERIFIED: .planning/reference/ai-marble-kingdom.md:182]`. Pre-step velocities are exactly the approach velocities for the step that produced the `started` transition. **Accuracy note:** for an offset, spinning weapon the true contact-point velocity is `v_com + ω × r` (in 2D: `(vx − ω·ry, vy + ω·rx)`); using the body COM velocity alone ignores the rotational term. Recommend capturing `angvel` too so weapons-in-motion register their spin contribution — flag as a calibratable choice (A2). `[ASSUMED]`

### Pattern 6: Fixed-timestep driver
**What:** `world.timestep = 1/60;` then one `world.step(eventQueue)` per tick; the system advances by counting ticks (D-10). Never read wall-clock.
**When to use:** Every tick (PHYS-05).
**Why:** `World.timestep` is a settable seconds value `[VERIFIED: .d.ts — world.d.ts:91/104 — "The timestep length, in seconds"]`. **Caution:** the value round-trips through f32 — the probe returned `0.01666666753590107`, so `world.timestep === 1/60` is **false**; tests must assert approximate equality. The reference's tick = 游戏 1 分钟 at 1× (= 1 real second / 60) maps to `dt = 1/60 s`, consistent with D-10.

### Pattern 7: Armor geometry without an arc primitive
**What:** Rapier 2D has no arc/ring primitive. Model armor as a `ball` (circle) slightly larger than the body, or a `capsule` as a shield arc segment offset to one side; both attached to the same body so they ride rigidly.
**When to use:** D-06 armor collider.
**Why:** Keeps the spec's "围绕的弧/circle" intent while using supported shapes (`ball`, `capsule`, `cuboid`, `roundCuboid`, `segment`, `triangle`, `convexPolygon`, …) `[VERIFIED: .d.ts — collider.d.ts:681-756]`. Since same-body colliders never self-collide (Pattern 1, node probe), an armor circle *surrounding* the body is geometrically legal. Which shape/offset to use is discretto calibrate. `[ASSUMED]`

### Anti-Patterns to Avoid
- **Assigning a collision-group bit per unit** — 16-bit cap; the prior-art project's ">16 units" bug. Use the handle map for identity.
- **Trying to read the contact normal from `drainCollisionEvents`** — it isn't there; use `world.contactPair`.
- **Retaining a `TempContactManifold` outside its closure** — it is temporary and freed.
- **Reading `body.linvel()` *after* `world.step`** to compute Δv — that is post-impact velocity; snapshot *before* the step (D-08).
- **Letting physics own or mutate `Unit`** — physics holds numbers/id only (D-07/D-09).
- **Creating a physics-local RNG** — reuse `src/common/rng.ts` (AGENTS §9).
- **String enums** for `ColliderPart` (AGENTS §3).
- **Setting `world.timestep` once and asserting exact float equality** in tests — it is f32.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Compound body (parts rigidly joined) | Multiple `RigidBody`s + fixed joints between them | One body + multiple colliders | 官方明确：多 collider "much more efficient and numerically efficient than the joint approach" `[CITED: rapier.rs/docs/user_guides/javascript/joints]` |
| Contact normal / manifold | Re-deriving normals from positions/velocities | `world.contactPair(c1,c2, m => m.normal())` | Rapier already computes it; re-deriving is error-prone and misses rotational contact points |
| Part identity | Collision-group bit per unit | `Map<colliderHandle, part>` | 16-bit group cap; handle map is unbounded and correct |
| Normal-distributed damage jitter | A new Gaussian sampler | `sampleNormal(rng, mean, mean/20)` from `src/common/rng.ts` | Already exists, guarded against `NaN`/`Infinity` (`src/common/rng.ts:36-45`) |
| Fixing the timestep | Accumulator/fixed-step loop re-implemented from scratch | Set `world.timestep = 1/60` and step once per tick | Rapier owns integration; a manual accumulator adds drift risk for no benefit at a fixed 60 Hz |
| WASM loading | Custom Vite wasm plugin / `?init` glue | `-compat` package + `await RAPIER.init()` | The package inlines the WASM as base64 precisely to avoid this `[CITED: getting_started_js]` |

**Key insight:** this phase is *configuration + a thin event bridge + a few pure formulas*. The engine does the hard part; the code added is small and mostly declarative. Resist building a general "physics abstraction layer".

---

## Damage / Armor Formulas (verbatim spec) — and the OQ-1 inconsistency

Transcribed verbatim from the in-repo authoritative spec (`[VERIFIED: .planning/reference/ai-marble-kingdom.md]`, quoting):

- Damage mean, no armor: `[VERIFIED: .planning/reference/ai-marble-kingdom.md:180]`
  > "$$\bar{D_R}=\max\left[A_AP_AW_A\left(\sqrt{\Delta v}-1\right),0\right]$$"
  > "其中 $A_A$ 表示单位的基础攻击力，$P_A$ 表示单位的武器比率，$W_A$ 表示武器的攻击比率，$\Delta v$ 为武器与击中单位的防具（或其本身）的碰撞法向速度差，单位是 $m/s$。"
- Jitter: `[VERIFIED: .planning/reference/ai-marble-kingdom.md:184]`
  > "伤害值会有一定的随机性，满足正态分布，均值为 $\bar{D_R}$，标准差为 $\bar{D_R}/20$。"
- Armor reduction: `[VERIFIED: .planning/reference/ai-marble-kingdom.md:186-194]`
  > "$$\Delta D=D_R\left(1-\frac{100B_A}{100B_A+A_DP_DS_D}\right)$$"
  > "其中 $A_D$ 表示单位的基础防御力，$P_D$ 表示单位的防具比率，$S_D$ 表示防具的防御比率，$B_A$ 表示攻击者使用的武器对防具的破甲比例的倒数。"
  > "$$D=D_R-\Delta D$$"
- Body hit ⇒ no reduction: `[VERIFIED: .planning/reference/ai-marble-kingdom.md:116]`
  > "如果直接攻击到单位本身，未攻击到防具，那么不会触发减伤。"

### OQ-1 — the literal armor formula inverts the weapon penetration table

`B_A = 1/penetration`. Substituting, with `k = 100·B_A = 100/penetration` and `X = A_D·P_D·S_D`:

- **Literal reading** (B_A = 1/pen): `D = D_R · 100/(100 + penetration · X)` → **larger penetration ⇒ smaller final damage.**
- **Sign-consistent reading** (B_A = penetration): `D = D_R · 100·penetration/(100·penetration + X)` → larger penetration ⇒ final damage nearer `D_R` (armor bypassed).

The two agree only at `penetration = 1` (短剑). But 锤子 vs 头盔 = 5 and 弓箭 vs 盾牌 = 0.2 `[VERIFIED: .planning/reference/ai-marble-kingdom.md:230,242]`: under the literal reading the **锤子 (flavour text: 专克高防御目标) would deal the *least* post-armor damage of any weapon**, and the 弓箭 the most — the exact opposite of the design intent encoded in the table. The flavour text confirms the intended direction: 破甲比率 "决定武器攻击到防具时，能够使防具的减伤效果削弱多少" `[VERIFIED: .planning/reference/ai-marble-kingdom.md:201]`.

**Recommendation:** treat `B_A` as the penetration ratio itself (equivalently, store the spec's `破甲比率` and use it directly in the `100·penetration` term), so the weapon table behaves as designed. **This MUST be confirmed by the user at the type-first gate (OQ-1 / A1)** — it changes every armor-hit number and PHYS-04's correctness. Worked example (剑士 defender, `X = 24·0.8·1 = 19.2`): 短剑-pen-1 → 83.9% passes either way; 锤子-pen-5 (sign-consistent) → 96.3% passes; 锤子-pen-5 (literal) → 51.0% passes.

### Δv, attacker/defender attribution, and body↔body
- **Δv requires a weapon collider.** The spec computes damage from "武器与击中单位的防具（或其本身）的碰撞" — a body↔body bump has no weapon and therefore no damage. The plan should emit damage events **only when at least one collider is `ColliderPart.Weapon`** whose owner differs from the other collider's owner.
- **Defender part selects the reduction path:** weapon↔armor → apply reduction with `armorKind`; weapon↔body → no reduction.
- **Weapon↔weapon** (two weapons clash) is **unspecified** by the spec. Recommend: no damage (or symmetric damage) — flag as a design choice.
- **Δv uses the *pre-step* velocities** (D-08). If the plan wants the angular contribution for spinning weapons it must snapshot `angvel` too (A2).

---

## Common Pitfalls

### Pitfall 1: `RAPIER.init()` must be awaited before any other call
**What goes wrong:** `new RAPIER.World(...)` before `await RAPIER.init()` throws / misbehaves.
**Why:** the package loads WASM asynchronously `[CITED: rapier.rs/docs/user_guides/javascript/getting_started_js — "has to be loaded asynchronously"]` `[VERIFIED: .d.ts — init.d.ts: "Has to be called and awaited before using any library methods"]`.
**How to avoid:** in each physics test file, `beforeAll(async () => { await RAPIER.init(); })`; in the app, await once at startup. `init()` is **idempotent** — verified: first call ~125 ms (base64→WASM decode), second call ~14 ms, no error `[VERIFIED: node probe]`.
**Warning signs:** `RuntimeError: unreachable`/`table index is out of bounds` from WASM before any test body runs.

### Pitfall 2: Collision events carry no normal
**What goes wrong:** a naive drain callback has `(h1, h2, started)` and the implementer tries to compute Δv = dot with "the normal" that isn't provided.
**Why:** the API is exactly `(handle1, handle2, started)` `[VERIFIED: .d.ts — event_queue.d.ts:89]`.
**How to avoid:** call `world.contactPair(world.getCollider(h1), world.getCollider(h2), (manifold) => { n = manifold.normal(); })` and copy `n.x`/`n.y` out **inside** the closure `[VERIFIED: .d.ts + node probe]`.
**Warning signs:** undefined normal; `normal()` returning a freed object's fields.

### Pitfall 3: Collider handle reuse invalidates a naive part map
**What goes wrong:** after `world.removeCollider(collider, true)`, a later `createCollider` may reuse the **same integer handle**; the stale `handle → part` entry then mis-tags a different unit/part.
**Why:** handles are guaranteed distinct only from *currently existing* colliders; a removed handle can be reused `[CITED: rapier.rs/docs/user_guides/javascript/colliders#creation-and-insertion]`.
**How to avoid:** on every removal, `colliderIndex.delete(collider.handle)` in the same code path that removes the collider; add a test that registers, removes, re-registers, and asserts the map holds the new tag. `[ASSUMED — this is an API-documented behavior, cited]`

### Pitfall 4: Same-body self-contact — a non-issue (do not "fix" it)
**What goes wrong:** the CONTEXT discretion list worries about intra-unit self-collision, inviting defensive hacks (sensors, collision groups per part, `ActiveHooks`).
**Why it is a non-issue:** the broad phase never pairs colliders on the same body; the changelog states "The broad phase no longer creates pairs between colliders attached to the same rigid-body (they can never collide)" `[CITED: github.com/dimforge/rapier CHANGELOG]`, and the Node probe confirmed **zero** collision events among a 3-collider compound body over 400 steps `[VERIFIED: node probe — SELF_EVENTS=0]`.
**How to avoid:** do nothing. (Keep the cheap defensive `if (sameUnit) continue;` in the drain only as a sanity guard.)

### Pitfall 5: f32 timestep / non-exact floats
**What goes wrong:** `expect(world.timestep).toBe(1/60)` fails; similarly, computed damage floats are f32-adjacent.
**Why:** Rapier's `timestep` round-trips through f32 (`0.01666666753590107`) `[VERIFIED: node probe]`.
**How to avoid:** assert with `toBeCloseTo(value, n)`, not exact equality. `[VERIFIED: node probe]`

### Pitfall 6: Δv from post-step velocity is wrong
**What goes wrong:** reading `body.linvel()` *after* `world.step()` yields post-impact velocity (often ≈ 0 for a resolved contact) → Δv understated → damage ≈ 0.
**Why:** the solver already consumed the approach velocity.
**How to avoid:** snapshot all registered bodies' `linvel()`/`angvel()` **before** `world.step(eventQueue)` each tick (D-08).
**Warning signs:** every contact reports `Δv < 1` and `D̄_R = 0` despite fast approaches.

### Pitfall 7: WebAssembly under Vitest worker pools
**What goes wrong:** Vitest may run test files in worker threads; some WASM-init setups misbehave under `threads` and need `forks`.
**Why:** project default pool is `threads` (Vitest 5). The Node ESM probe ran fine in the main thread; worker-thread behavior was **not** tested here.
**How to avoid:** as a **Wave 0 verification step**, add the first physics test and run `pnpm test`; if init fails under threads, set `pool: 'forks'` (or `poolOptions`) in `vitest.config.ts`. `[ASSUMED — not verified this session]`
**Warning signs:** `Cannot instantiate WebAssembly` / worker crash only when running >1 test file.

### Pitfall 8: Numeric-enum iteration / exhaustive switch (carried from Phase 1)
**What goes wrong:** `Object.values(ColliderPart)` yields reverse-mapped names too; a `switch` over an event/part enum without a `never` guard silently returns `undefined`.
**How to avoid:** explicit ordered `readonly ColliderPart[]` arrays; exhaustive switches with `const _x: never = kind`. `[VERIFIED: Phase 1 precedent — tests/units/types.test.ts uses explicit arrays]`

### Pitfall 9: `pnpm lint`/`typecheck` conventions are not lint-enforced
**What goes wrong:** AGENTS §1/§3/§4/§5/§6 (interface-first, numeric enums, JSDoc, no public members outside interface, JSDoc'd top-level const) are **not** enforced by ESLint. A physics `class` can quietly expose public helpers not in `IPhysicsWorld` or use a string enum and still pass `pnpm lint`.
**How to avoid:** plan/code-review checklist items; keep the review gate meaningful. `[VERIFIED: eslint.config.js this session — only @eslint/js + tseslint recommended + prettier]`

### Pitfall 10: Vite bundle size / dev transform
**What goes wrong:** the `-compat` ESM is ~3.3 MB (2.3 MB WASM inlined); Vite may warn on chunk size and dev transforms are heavier.
**Why:** base64-inlined WASM `[CITED: getting_started_js]` `[VERIFIED: tarball — dist/rapier.mjs = 3330 KB]`.
**How to avoid:** acceptable for a Chrome-only, single-bundle sim; if desired, load physics via dynamic `import()` so the ~3 MB chunk is split. Not a blocker; note it. `[ASSUMED — build not run this session]`

### Pitfall 11: `RAPIER` import shape (default vs named)
**What goes wrong:** uncertainty over `import RAPIER from '...'` vs `import { World } from '...'`.
**Reality:** the 0.21.0 ESM module exports **both** a `default` and named exports (`export{…, BC as default, gC as init, Ng as World, …}`) `[VERIFIED: dist/rapier.mjs export statement]`, so the official `import RAPIER from '@dimforge/rapier2d-compat'; await RAPIER.init();` works, as does named import. No pitfall — just pick one and be consistent.
**Note on `@types`:** the package ships its own `dist/rapier.d.ts`; **no `@types/*` package is needed** `[VERIFIED: package.json types field]`.

### Pitfall 12: `world.free()` / `eventQueue.free()` leak WASM memory
**What goes wrong:** creating many Worlds in a test process without freeing leaks WASM heap across the suite.
**Why:** Rapier objects hold raw WASM pointers requiring explicit release `[VERIFIED: .d.ts — World.free, EventQueue.free docs]`.
**How to avoid:** `afterEach`/`afterAll` call `world.free()` and `eventQueue.free()`; prefer one World per test.

---

## Code Examples

### Compound registration (verified node probe)
```js
// Source: @dimforge/rapier2d-compat@0.21.0 .d.ts (world.d.ts, collider.d.ts) + node probe
import RAPIER from '@dimforge/rapier2d-compat';
await RAPIER.init();                                  // once, awaited (idempotent)
const world = new RAPIER.World({ x: 0, y: 0 });
world.timestep = 1 / 60;                              // f32; do not assert exact equality

const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(0, 0));
const cBody = world.createCollider(
  RAPIER.ColliderDesc.ball(0.5).setMass(70)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
const cWeapon = world.createCollider(
  RAPIER.ColliderDesc.capsule(0.4, 0.05).setTranslation(0.7, 0).setMass(12)
    .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS), body);
const cArmor = world.createCollider(RAPIER.ColliderDesc.ball(0.55).setMass(8), body);
// body.mass() === 90  (70 + 12 + 8)                     [VERIFIED: node probe]
```

### Event → Δv → normal (verified node probe)
```js
// Source: .d.ts (EventQueue, World.contactPair, TempContactManifold) + node probe
const queue = new RAPIER.EventQueue(true);
const colliderIndex = new Map([[cBody.handle,{unit:0,part:0}],[cWeapon.handle,{unit:0,part:1}], /* … */]);
const preVel = new Map(); // unitId -> {vx,vy[,w]} snapshotted BEFORE step

queue_free_loop: for (let tick = 0; tick < n; tick++) {
  // ① snapshot pre-step velocities (Δv source, D-08)
  for (const [id, b] of unitBodies) { const v = b.linvel(); preVel.set(id, { vx: v.x, vy: v.y, w: b.angvel() }); }
  // ② step
  world.step(queue);
  // ③ drain started events
  queue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;
    const a = colliderIndex.get(h1), b = colliderIndex.get(h2);
    if (!a || !b || a.unit === b.unit) return;          // defensive; self-pairs never occur
    // ④ world-space contact normal (copy x/y INSIDE the closure)
    let nx = 0, ny = 0;
    world.contactPair(world.getCollider(h1), world.getCollider(h2), (m) => { const n = m.normal(); nx = n.x; ny = n.y; });
    // ⑤ weapon must be one side; damage only then
    //    Δv = |(vAttackerPoint − vDefenderPoint) · n|   (see Pattern 5 for the ω×r term)
  });
}
```

### Damage/armor math (pure functions; sign per OQ-1)
```ts
// Sources: reference §伤害计算 (verbatim quotes above).
// Δv in m/s; below 1 m/s sqrt(Δv)-1 < 0 → clamped 0 (spec max(…,0)).
export function computeDamageMean(attack: number, weaponRatio: number, weaponAttackRatio: number, deltaV: number): number {
  return Math.max(attack * weaponRatio * weaponAttackRatio * (Math.sqrt(deltaV) - 1), 0);
}
// jitter: reuse src/common/rng.ts sampleNormal (σ = mean/20) — NOT a new sampler.
// armor reduction — OQ-1: choose ONE of:
//   literal (per spec wording):  const bA = 1 / penetration;
//   sign-consistent (recommended): const bA = penetration;
export function computeFinalDamage(damageDealt: number, defense: number, armorRatio: number, armorDefenseRatio: number, penetration: number): number {
  const bA = penetration;                       // OQ-1 recommendation
  const reduced = damageDealt * (1 - (100 * bA) / (100 * bA + defense * armorRatio * armorDefenseRatio));
  return damageDealt - reduced;
}
```
`[ASSUMED]` — the recommendation `bA = penetration` is a design inference (OQ-1), not a verified spec fact.

### Tick driver
```ts
// PHYS-05 / D-10: one physics step per game-minute at 1×.
export const DT = 1 / 60;          // JSDoc required (AGENTS §6); calibratable
world.timestep = DT;
tick(): readonly IDamageEvent[] { /* snapshot → step(queue) → drain → compute → return */ }
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| planck-js (old `origin/video-codec` branch) | `@dimforge/rapier2d-compat@0.21.0` | Project restart | Active maintenance; WASM perf; `-compat` avoids build config |
| Deterministic, seeded physics for replay | No determinism (PROJECT.md) | This milestone | No `-deterministic` variant; no serialization/replay; tests must not assume cross-run reproducibility |
| `RigidBodySet`/`ColliderSet` mandatory (pre-0.10 Rust) | Splittable components (Rust 0.10+) | Rust 0.10 | Not directly relevant to the JS binding, but explains the split `.d.ts` layout |
| Colliders attached via child entities (Bevy) | `world.createCollider(desc, parent)` | JS binding | The JS way to attach multiple colliders to one body |

**Deprecated/outdated (do not carry over from the deleted old version):** the old `vitest.config.ts` once referenced a `tests/helpers/physics-setup.ts` + `@/probe-alias` (Phase 1 removed it). The current `vitest.config.ts` is clean (`environment: 'node'`, `@` alias present). Do **not** reintroduce a physics setup file that isn't needed — `await RAPIER.init()` in a `beforeAll` is sufficient.

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | `B_A` should be the penetration ratio itself (sign-consistent), NOT its reciprocal — the literal spec formula inverts the weapon table | §Damage / OQ-1 | Every armor-hit damage number is wrong; heavy weapons underperform; PHYS-04 incorrect |
| A2 | Δv should include the angular (`ω × r`) contribution for offset weapons, or the plan explicitly declares linear-only as a calibration simplification | Pattern 5 / Pitfall 6 | Spinning-weapon hits register too little/too much Δv → damage feels wrong |
| A3 | Damage events are emitted only when a `Weapon` part is involved and owners differ; body↔body bumps deal no damage; weapon↔weapon is a design choice | §Damage attribution | Extra/missing events; unintended chip damage from bumping |
| A4 | Armor is modeled as a `ball`/`capsule` (no 2D arc primitive); exact shape/offset is calibratable | Pattern 7 / D-06 | Armor coverage too broad/narrow → reduction triggers wrongly |
| A5 | Physics receives a numbers-only `IUnitPhysicsSpec` (id + mass + combat numbers + equipment specs) and does not reference `IUnit` | Pattern 4 / D-07 | Interface shape rejected at review gate; or couples physics↔units |
| A6 | Vitest runs the WASM under the default `threads` pool; fallback `pool: 'forks'` if not | Pitfall 7 | CI/test flakiness only under multi-file runs |
| A7 | The `-compat` ~3.3 MB bundle is acceptable for a Chrome-only single-page sim; chunk-splitting is optional | Pitfall 10 | Large initial load if left unaddressed |
| A8 | Pin `0.21.0` (latest, ~3 weeks old) rather than `0.20.0`; a `checkpoint:human-verify` gates the install | §Package Legitimacy Audit / D-02 | Behavior drift only if the user wants an older steady version |

**All A# items that affect game numbers or interface shape (A1–A5) require user confirmation** — A1 in particular is a spec contradiction, not a preference.

---

## Open Questions (RESOLVED)

> **RESOLVED 2026-10-18 with the user before planning proceeds.** Decisions below are binding for Phase 2.

1. **OQ-1 (PHYS-04) — penetration sign — RESOLVED: `B_A = 破甲比率`** (sign-consistent). Higher penetration ⇒ more armor bypassed. The spec's literal `1/破甲比率` would invert the weapon table (锤子 vs 头盔 = 5 would deal the *least* damage) and contradict the flavour text; the user ruled sign-consistent.
2. **OQ-2 — version pin — RESOLVED: `0.21.0`** (exact pin, behind the human-verify install checkpoint).
3. **OQ-3 — damage-event ownership boundary — RESOLVED: physics computes AND emits** the typed event with final `damage`/`damageReduced` numbers; the caller applies `takeDamage`/`gain*Experience`. No `Unit` mutation inside the physics layer.
4. **OQ-4 — weapon↔weapon & multi-armor — RESOLVED:** weapon↔weapon contact ⇒ **no damage**; multi-armor units: the specific armor collider hit determines `armorKind` for the penetration lookup (each armor collider is tied to its `ArmorKind`).
5. **OQ-5 — geometry defaults — RESOLVED (agent discretion, D-06):** agent picks reasonable defaults for body radius / weapon capsule / armor geometry; centralized constants, calibratable.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | toolchain (`engines: >=24`) | ✓ | 24.21.0 | — |
| pnpm | `engines: pnpm@12.5.1` | ✓ | 12.5.1 | — |
| TypeScript (tsc) | typecheck | ✓ | 7.0.2 | — |
| Vitest | tests (`environment: 'node'`) | ✓ | 5.0.4 | — |
| Vite | dev/build | ✓ | 8.3.4 | — |
| `@dimforge/rapier2d-compat` | the entire phase | ✗ (not installed; lockfile has no dimforge entry) | — (pin `0.21.0`) | **must `pnpm add -E @dimforge/rapier2d-compat@0.21.0` behind a human-verify checkpoint** |
| WebAssembly (Node/Chrome) | Rapier runtime | ✓ | Node 24 supports WASM; Chrome target | — |

**Missing dependencies with no fallback:** `@dimforge/rapier2d-compat` — the phase cannot start without it. This is the project's **first runtime dependency**.
**Missing dependencies with fallback:** none.

**Probe evidence that the environment can run it:** `node rapier-probe.mjs` (this session) → `INIT_OK version= 0.21.0`, compound mass `90`, `EVENT started A/1 <-> B/0 normal= {x:1,y:0}`, `TOTAL_START_EVENTS=1 SELF_EVENTS=0`, `bodyA pos … `, `DONE` — i.e. init, compound bodies, per-collider mass, collision events, `contactPair` normals, and same-body self-collision-freedom all confirmed on this machine.

---

## Validation Architecture

> Included because `workflow.nyquist_validation` is `true` in `.planning/config.json` `[VERIFIED: config.json this session]`.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4, `environment: 'node'` `[VERIFIED: vitest.config.ts]` |
| Config file | `vitest.config.ts` — **already clean** (Phase 1 repaired it: `@` alias present, no stale `setupFiles`) — no Wave 0 repair needed for config |
| Quick run command | `pnpm test` |
| Full suite command | `pnpm test` |
| Prereq for every physics test | `await RAPIER.init()` in `beforeAll` (idempotent, ~125 ms first call) `[VERIFIED: node probe]` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PHYS-01 | One `RigidBody` + body/weapon/armor `Collider`s; `body.mass()` == Σ collider masses; each collider tagged `{unitId, part}` in the handle map; removal deletes the map entry | unit (integration) | `pnpm test -- tests/physics/compound.test.ts` | ❌ Wave 0 |
| PHYS-02 | Two scripted bodies collide → `started` events tagged with correct `{unitId, part}`; no same-body self-events; contact normal fetched via `contactPair` | unit (integration) | `pnpm test -- tests/physics/events.test.ts` | ❌ Wave 0 |
| PHYS-03 | `computeDamageMean(A_A,P_A,W_A,Δv)` matches hand-computed values incl. the `max(…,0)` clamp at Δv≤1; jitter uses `sampleNormal(rng, mean, mean/20)` with injected deterministic `IRng` (σ≈mean/20 over samples) | unit (pure + statistical) | `pnpm test -- tests/physics/damage.test.ts` | ❌ Wave 0 |
| PHYS-04 | Weapon↔armor contact applies the reduction formula with per-(weapon×armor) penetration; weapon↔body contact applies **no** reduction (D == D_R); chosen penetration sign (OQ-1) pinned by worked examples | unit (pure) | `pnpm test -- tests/physics/damage.test.ts` | ❌ Wave 0 |
| PHYS-05 | `world.timestep` set to `1/60` (assert `toBeCloseTo`, f32); `tick()` advances exactly one `world.step`; N ticks produce monotonic motion with no wall-clock involvement | unit (integration) | `pnpm test -- tests/physics/tick.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm test` (physics init adds ~125 ms; keep suite well under 30 s).
- **Per wave merge:** `pnpm test` + `pnpm typecheck` (+ `pnpm lint`).
- **Phase gate:** full suite green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] **Install the dependency** — `pnpm add -E @dimforge/rapier2d-compat@0.21.0` behind a `checkpoint:human-verify` (SUS legitimacy flag). Nothing runs without it.
- [ ] `tests/physics/` files (`damage.test.ts`, `compound.test.ts`, `events.test.ts`, `tick.test.ts`) — the `include` glob `tests/**/*.test.ts` already matches; files simply don't exist yet.
- [ ] Rapier lifecycle convention — `beforeAll(await RAPIER.init())` per file; `afterEach`/`afterAll` `world.free()` + `queue.free()`.
- [ ] **Proof the WASM runs under Vitest's worker pool** — run the first physics test; if it fails under `threads`, add `pool: 'forks'` to `vitest.config.ts` (Pitfall 7). This is a Wave-0 verification, not a known breakage.
- [ ] Deterministic `IRng` test helper — `tests/units/spawn-normal.test.ts` defines `mulberry32(seed)` inline (`[VERIFIED: tests/units/spawn-normal.test.ts:27]`); either extract it to a shared `tests/helpers/rng.ts` or redefine it in physics tests. Optional but avoids duplication.
- Framework install: none beyond Rapier (Vitest already present).

### Manual-Only Verifications
| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| (none) | — | All phase behaviors have automated verification (pure in-process module + headless WASM). | — |
| Visual "combat looks good" feel | influenced by PHYS-03/04 numbers | aesthetic/calibration judgement; needs a running sim (Phase 5) | Deferred to post-assembly calibration; not gated here. |

---

## Security Domain

> Included because `security_enforcement: true` and `security_asvs_level: 1` in `.planning/config.json` `[VERIFIED]`.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No users/accounts |
| V3 Session Management | no | Headless in-process module |
| V4 Access Control | no | No protected resources |
| V5 Input Validation | yes (weak) | Validate enum arguments (`ColliderPart`, kinds); guard non-finite values from physics/contacts before they enter damage math or `Unit.takeDamage` (Phase 1 already guards `takeDamage` against non-finite); assert collider/body handles resolve before use |
| V6 Cryptography | no | `IRng`/`Math.random` are gameplay flavor only — non-determinism is explicitly in scope |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| `NaN`/`Infinity` from a degenerate contact (zero-length normal, zero mass) leaking into damage or positions | (data integrity) | Guard `Δv`/normal with `Number.isFinite`; clamp damage mean via the spec's `max(…,0)`; Phase 1's `takeDamage`/`gain*Experience` already reject non-finite input |
| Stale handle → wrong unit/part after handle reuse | Tampering (integrity) | Delete the `handle → part` entry on every `removeCollider` (Pitfall 3) |
| WASM supply chain (first runtime dependency) | Tampering | Exact-pin `0.21.0`; install behind human-verify checkpoint; verify `npm view` provenance (official dimforge repo, zero deps, no postinstall) |
| Unbounded memory growth (undrained events / unfreed worlds) | (availability) | `EventQueue(true)` auto-drain; explicit `free()` in test teardown |

*The physics module has no network, no secrets, no untrusted input. The material risks are data-integrity guards (non-finite propagation, handle reuse) and supply-chain (one new pinned dependency) — not ASVS auth/session controls.*

---

## Sources

### Primary (HIGH confidence)
- **`@dimforge/rapier2d-compat@0.21.0` downloaded tarball `.d.ts`** (read this session): `dist/init.d.ts`, `dist/pipeline/event_queue.d.ts`, `dist/pipeline/world.d.ts`, `dist/geometry/collider.d.ts`, `dist/geometry/interaction_groups.d.ts`, `dist/geometry/narrow_phase.d.ts`, `dist/geometry/contact.d.ts`, `dist/dynamics/rigid_body.d.ts`, `dist/exports.d.ts`, `dist/rapier.mjs` (export statement). Used for every exact API signature.
- **Node probes run this session**: `rapier-probe.mjs` (init, compound body, per-collider mass sum = 90, collision `started` events, `contactPair().normal()`, same-body `SELF_EVENTS=0`), `rapier-probe2.mjs` (init idempotency/timing, two independent Worlds, `mass()`, handle types, f32 timestep, ActiveEvents values).
- **In-repo authoritative spec** `.planning/reference/ai-marble-kingdom.md` (read in full): damage §176-194, unit attributes §105-122, weapons §196-250, armors §252-267, tick/time §18-24, AI cadence §146.
- **In-repo contracts/config (read this session)**: `src/units/types.ts`, `src/common/types.ts`, `src/common/rng.ts`, `src/units/Unit.ts`, `AGENTS.md`, `package.json`, `tsconfig.json`, `vitest.config.ts`, `vite.config.ts`, `eslint.config.js`, `.planning/config.json`, `.planning/phases/02-physics-simulation/02-CONTEXT.md`, `.planning/phases/01-unit-system/01-RESEARCH.md`, `01-VALIDATION.md`, `01-02-PLAN.md`, `tests/units/types.test.ts`, `tests/units/spawn-normal.test.ts`.
- **npm registry reads**: `npm view @dimforge/rapier2d-compat version|time|repository|dependencies|exports`; `gsd-tools query package-legitimacy check`.

### Secondary (MEDIUM confidence)
- **Official Rapier JS user guide** (WebFetch this session): [Getting started](https://rapier.rs/docs/user_guides/javascript/getting_started_js), [Colliders](https://rapier.rs/docs/user_guides/javascript/colliders), [Rigid-bodies](https://rapier.rs/docs/user_guides/javascript/rigid_bodies), [Advanced collision-detection](https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js), [Simulation structures](https://rapier.rs/docs/user_guides/javascript/simulation_structures), [Common mistakes](https://rapier.rs/docs/user_guides/javascript/common_mistakes), [World API reference](https://rapier.rs/javascript2d/classes/World.html).
- **Rapier CHANGELOG** (`github.com/dimforge/rapier`) — "The broad phase no longer creates pairs between colliders attached to the same rigid-body".

### Tertiary (LOW confidence)
- None relied upon. Prior-art (`b8bb56b^`, `origin/video-codec`) is reference-only and superseded.

---

## Metadata

**Confidence breakdown:**
- Standard stack / package: HIGH — exact version + full `.d.ts` read from the downloaded tarball; zero deps; runtime confirmed.
- Rapier API (compound, events, Δv, groups, timestep): HIGH — signatures from the pinned `.d.ts` **and** executable Node probes.
- Environment (init in Node, idempotency, self-collision-freedom): HIGH — reproduced this session.
- Architecture/interface shapes: MEDIUM — patterns are standard Rapier usage, but concrete `types.ts` shapes are agent discretion pending the review gate.
- Damage/armor math: HIGH for transcription; **LOW for the armor/penetration *sign*** — genuine spec self-contradiction (OQ-1/A1), must be user-resolved.
- Pitfalls: HIGH for API/environment ones (reproduced/docs); MEDIUM for Vitest-pool and Vite-bundle ones (not exercised).

**Research date:** 2026-10-18
**Valid until:** ~2026-11-17 (30 days; Rapier is stable at 0.21.0, exact-pinned). Re-verify if the pin changes or if `@dimforge/rapier2d-compat` publishes a newer release than the pinned version.

