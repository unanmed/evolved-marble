# Phase 2: Physics & Composite Units - Research

**Researched:** 2026-10-16
**Domain:** Rapier2D (WASM) deterministic physics + composite rigid bodies + typed contact events, integrated into an existing headless deterministic sim core (TypeScript / Vite 8 / Vitest 5 / Node 24).
**Confidence:** HIGH on the physics API and WASM packaging (verified by extracting the published `0.21.0` tarballs and executing them in Node); HIGH on determinism mechanics (verified empirically); MEDIUM on the browser/Vite bundling path (reasoned from the verified package shape, not executed in Chrome).

**Scope note:** This document answers the seven questions CONTEXT D-23 deferred to research, plus the design-restraint review D-36 requested. Every API claim below was checked against the actual `@dimforge/rapier2d-deterministic-compat@0.21.0` and `@dimforge/rapier2d-deterministic@0.21.0` type definitions, and every behavioural claim was reproduced by running the packages in Node (scripts are described inline; outputs quoted verbatim).

---

## Summary

Phase 1 delivered a headless, fixed-step, seeded sim core with a same-machine double-run fingerprint gate (`src/sim/**`, `tests/determinism/gate.test.ts`). Phase 2 bolts Rapier2D onto that core without breaking determinism: units become compound rigid bodies (body+armor on one body, weapon as a separate revolute-jointed body), contacts are drained into the existing typed `EventLog` as part-tagged events carrying a collision-normal Δv, and the fingerprint/snapshot contract is extended to include Rapier's own state.

The single highest-risk item (D-23) is now resolved empirically: **the two published deterministic packages ship a byte-identical WASM module (SHA-256 `0570D5C8…1155D`, both 2,436,321 bytes)**, so they are the *same physics build* under two packagings. The non-compat build statically imports a `.wasm` file, exposes **no `init()`**, and **cannot be resolved by plain Node** (verified: `Error: Cannot find package .../rapier2d-deterministic/index.js`). The `-compat` build inlines the WASM as base64, exposes `init(): Promise<void>`, and was verified to initialise, step, snapshot, and reproduce bit-identically under **plain Node, Vitest 5.0.4, and a DOM-free `tsc` typecheck**. This makes `-compat` the pragmatic choice for the project's Node-only determinism gate (D-22) with the least machinery (D-36).

Two API assumptions inherited from the prior research docs are **wrong for 0.21.0** and must not be copied into plans: `ColliderDesc.capsuleRounded` does **not exist** (use `ColliderDesc.capsule(halfHeight, radius)`), and `TempContactForceEvent` has **no `.started()`** flag (the PITFALLS-sanctioned "use `.started`" dedup trick is unavailable — which is fine, because D-31 already defers dedup to Phase 3). Additionally, the Δv the damage formula needs is **not** readable from the post-step manifold (verified Δv = 0.0000 if you read after `world.step()`); it must be computed from **pre-step** body velocities (verified Δv = 8.0000 for an 8 m/s approach).

**Primary recommendation:** pin `@dimforge/rapier2d-deterministic-compat@0.21.0` (exact, no `^`), wrap it behind a `PhysicsWorld` whose `step()` captures pre-step velocities, drains `EventQueue` into typed `Contact` events with part tags + Δv, and extend the canonical snapshot to `VERSION = 3` by appending Rapier's `takeSnapshot()` bytes plus the collider-handle→(entityId, part) map.

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Rapier WASM init (`initPhysics()`) | Composition root (`src/main.tsx`) + test setup | — | D-21: one idempotent async init before any world is constructed; the sim core itself must stay synchronous. |
| Rapier `World` + `EventQueue` ownership | sim core (`src/sim/world/physics*.ts`) | — | Physics is deterministic sim state; it lives inside the headless boundary (`tsconfig.sim.json`). |
| Composite unit assembly (body/weapon/armor colliders, joint) | sim core (`CompositeFactory`) | `content/` (dims/mass data) | Construction order is part of the determinism contract → must be inside the sim boundary. |
| Contact drain → typed events | sim core (`ContactBridge` / physics system) | — | Runs synchronously inside `BattleSim.step()`; must not touch DOM/host. |
| Pose mirroring Rapier → `EntityStore` | sim core | — | D-34: Rapier is the source of truth; store is a read-only mirror for AI/render/snapshot. |
| Command → Rapier impulse mapping | sim core (`applyCommands`) | — | Force/Torque commands must become `applyImpulse`/`applyTorqueImpulse`, not direct `xform` mutation. |
| Canonical snapshot + fingerprint (v3) | sim core (`snapshot.ts`) | — | Same primitive as Phase 1; extended, not replaced. |
| Determinism gate execution | host/test tier (`tests/determinism`, pre-commit) | — | The gate is Node-only (D-22); wiring is in `tests/`, not `sim/`. |
| Browser rendering of physics state | Phase 5 (`render/`) | — | **Out of scope here** — renderer is a read-only projection of the mirrored store. |

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

**确定性档位与 Rapier 构建（Determinism & Build）**
- **D-17:** 确定性档位**保持同机**（沿用 Phase 1 的 D-02）——同一种子在同一机器/浏览器内重跑一致；**不**接跨机 golden-hash 门禁、**不**接 CI。路标 Phase 2 成功标准 #4 的"跨两机指纹稳定"标记为**延后/放宽**。 — **Reversibility:** costly.
- **D-18:** 使用 **`@dimforge/rapier2d-deterministic`** 构建（满足 PHYS-03 字面，且自带 libm、预先对齐跨机，日后升级零成本；仅牺牲少量性能）。 — **Reversibility:** reversible — 换包名即可，但换包会改变物理结果/指纹基线。
- **D-19:** **精确钉版**（`package.json` 写死版本、无 `^`）+ **版本变更即硬失败**的冒烟测试（输出当前 Rapier 版本与一条 golden 指纹，版本一变即报错）。 — **Reversibility:** reversible.
- **D-20:** 确定性门禁用**双指纹**：既扩展 Phase 1 的 `BattleSim.fingerprint()`（现纳入物理状态），也断言 Rapier 原生 `world.takeSnapshot()` 哈希，**同机双跑均一致**。 — **Reversibility:** reversible.
- **D-21:** Rapier WASM **一次全局初始化**（幂等 `await initPhysics()`，在组合根与测试 setup 各调一次）；`PhysicsWorld` **同步构造**；`BattleSim.step()` 保持**纯同步**。 — **Reversibility:** costly.
- **D-22:** 无头门禁与物理单测 **Node-only**（vitest），与 Phase 1 一致；Rapier WASM 必须在 Node 下 init 成功并跑完整步。 — **Reversibility:** reversible.
- **D-23:** Node / Vite / 浏览器三环境的 **WASM 解析策略交由研究者确定**。 — **Reversibility:** reversible.

**复合刚体装配与武器挥击（Composite Rig & Swing）**
- **D-24:** 装配拓扑用**混合式**：单位**本体 + 防具为同一刚体**的多个碰撞体；**武器为独立动态刚体**，通过**旋转关节（revolute joint）**铰接到本体，用**关节电机**驱动摆动。理由：规格伤害来自"**武器**与受击方防具/本体的碰撞法向速度差 Δv"，武器必须有**独立速度**。 — **Reversibility:** costly.
- **D-25:** 武器挥砍由**持续往复摆动**驱动——按**数值常量**（振幅/角速度）在扇形内来回摆动，**无需 AI**；命中时自然产生 Δv。 — **Reversibility:** reversible.
- **D-26:** `CompositeFactory` 接受 `{ weapons: [...], armors: [...] }`，支持**任意数量**武器/防具（数据驱动），直接服务 Phase 3 的职业装备表。 — **Reversibility:** reversible.
- **D-27:** 碰撞过滤用**单位级分组**：同一单位各部件（本体/武器/防具）互为无损；**敌我单位之间仍保持物理碰撞**；武器只与敌方部件产生伤害性接触。 — **Reversibility:** reversible.

**接触/冲击事件契约（Contact / Impact Events）**
- **D-28:** 命中部位标记到 **(entityId, part)**，其中 `part` 为数字枚举 `Body | Weapon | Armor`，并在 `Armor` 上带**子类型** `Helmet | Shield`。 — **Reversibility:** costly.
- **D-29:** 以 **collision-enter**（intersection 开始）作"命中"触发，事件内**附 Δv**；另可发 contact-force 事件（magnitude）作诊断/阈值用途，但不作命中判据。 — **Reversibility:** costly.
- **D-30:** Δv 口径 = **碰撞法向相对速度的大小**（非负标量）。 — **Reversibility:** costly.
- **D-31:** **去重归 Phase 3**：Phase 2 只发**原始 enter 接触事件**（真实、无状态）。 — **Reversibility:** reversible.

**物理世界约定（World Conventions）**
- **D-32:** **米为世界单位**——1 世界单位 = 1 米，地图 1000×1000 米，物理全程 SI（kg / m / s）；**仅在渲染边界换算像素**。 — **Reversibility:** one-way.
- **D-33:** 竞技场**软钳制边界 = "安全带"**：仅在单位越出安全区（1000×1000 m）时把位置/速度拉回。 — **Reversibility:** reversible.
- **D-34:** **Rapier 为真源**，每步后把 body 变换（x, y, rotation, vx, vy, angularVel）**镜像进 `EntityStore`**；`snapshot()` = Rapier `takeSnapshot()` + store 静态组件 + RNG + id 游标。`IUnitXform` 增加 `rotation` / `angularVelocity`，**快照版本 2 → 3**。 — **Reversibility:** costly.
- **D-35:** 全局物理参数：**无重力**（`gravity = {0, 0}`）、**低弹性**（`restitution ≈ 0`）、统一小线性/角阻尼。 — **Reversibility:** reversible.

**设计克制原则（Design Restraint）**
- **D-36:** **最小必要抽象，只做必要拓展。** 本项目**不是**长期演进的大工程；抽象应等**第二个具体用例出现**再引入。规划与实现时应主动复核可简化候选项。 — **Reversibility:** reversible.

### the agent's Discretion
- Node / Vite / 浏览器的 **WASM 解析与打包方案**（D-23，交研究者）。
- `sim/world` 下**模块文件的具体拆分/命名**（`PhysicsWorld` / `CompositeFactory` / `ContactBridge` / `LifecycleSystem` 不强制四文件，按最小自然组织）。
- 摆动、阻尼、restitution、尺寸的**具体数值常量**（集中放 `src/config/sim.ts` 或 `content/`，单一来源）。
- Phase 2 测试用单位的具体几何/装备（Phase 3 落地真实内容表前的临时值）。

### Deferred Ideas (OUT OF SCOPE)
- **跨机位级确定性**（禁用平台三角函数 + 跨机 golden-hash + CI）——沿用 D-02/D-03，本阶段不做。
- **进阶武器招式**（前摇/后摇、指令强砍、技能旋转）——Phase 3/4。
- **地图边缘反弹**——王国/地图层阶段。
- **硬边界/反弹墙**——本轮选了软钳制安全带。
- **待规划复核的简化候选（D-36）**：双指纹门禁是否下简为只用 sim 指纹；武器摆动是否不必用关节电机（改为直接施加角冲量/角速度）；`sim/world` 是否不必强制四文件拆分。**默认保持现状，仅在实现发现确无必要时才下简。**
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| PHYS-01 | 单位为复合刚体：本体/武器/防具是独立碰撞体并按部位打标 | Composite rig pattern (§Architecture Patterns 3): one `RigidBody` (body+armor colliders via `ColliderDesc.setTranslation` offsets) + one separate dynamic weapon body joined by `JointData.revolute`; every `Collider` has a stable `handle` used as the `(entityId, part)` map key. |
| PHYS-02 | 物理接触事件被转成带类型的模拟事件（记录命中部位） | ContactBridge pattern (§Architecture Patterns 4): `EventQueue.drainCollisionEvents` (enter flag) → `world.contactPair` → part-tagged `IContactEvent` appended to the existing `EventLog`; Δv from pre-step velocities. |
| PHYS-03 | 使用 Rapier2D 确定性构建（`@dimforge/rapier2d-deterministic`） | Package audit (§Standard Stack): `-deterministic` and `-deterministic-compat` ship byte-identical deterministic WASM; both are the deterministic build. Version pinned + smoke test per D-19. |
</phase_requirements>

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `@dimforge/rapier2d-deterministic-compat` | **`0.21.0`** (pin exact) | Rapier2D physics (WASM), base64-inlined | **Recommended variant.** Byte-identical deterministic WASM to the raw build, plus `init()` and zero bundler config — verified to init/step/snapshot in plain Node + Vitest. |
| `@dimforge/rapier2d-deterministic` | `0.21.0` (pin exact) | Rapier2D physics (WASM), separate `.wasm` asset | Alternative that honours the literal PHYS-03 package name; needs `vite-plugin-wasm` (+ top-level-await) and does **not** resolve under plain Node. |

Both packages are the *same deterministic build*: their `rapier_wasm2d_bg.wasm` files are byte-identical (`[VERIFIED: local tarball SHA-256]` — see Package Legitimacy Audit). The difference is purely delivery: raw ships a 2.44 MB `.wasm` (SHA-256 `0570D5C822275FBADBBFE4BDA0C589B039C2F41259676DC53F6679085601155D`); compat inlines the same bytes as base64 in `dist/rapier.mjs` (3.45 MB) and exports `init()`.

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `vite-plugin-wasm` | `3.6.0` | ESM `.wasm` import for Vite | **Only** if choosing the raw build. Not needed for compat. |
| `vite-plugin-top-level-await` | `1.6.0` | Top-level `await` transform | Pair with the raw build under Vite (raw build resolves WASM via static import). |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `-deterministic-compat` | `-deterministic` + `vite-plugin-wasm` | The raw build keeps a separate cacheable `.wasm` asset and matches the literal PHYS-03 name, but adds two bundler plugins and **cannot be resolved by plain Node** (verified install/import failure) — a problem because the gate is Node-only (D-22). |
| `-deterministic-compat` | `@dimforge/rapier2d` (plain) | Rejected: plain build is **only locally deterministic** per Rapier's own README; Phase is explicitly about the deterministic build (PHYS-03). |
| Multi-collider composite | `ColliderDesc.compound([...])` | `compound` gives ONE collider handle — cannot tag parts individually. D-24/D-28 need per-part handles, so use separate colliders. |

**Installation (`-compat` route, recommended):**
```bash
pnpm add @dimforge/rapier2d-deterministic-compat@0.21.0 --save-exact
```

**Version verification (`[VERIFIED: npm registry, 2026-10-16]`):**
```bash
npm view @dimforge/rapier2d-deterministic-compat version   # 0.21.0
npm view @dimforge/rapier2d-deterministic version          # 0.21.0
# latest dist-tag for both = 0.21.0 (published 2026-09-25)
```
Note: the environment's npm registry is **`https://registry.npmmirror.com/`** (China mirror), so tarballs come from the mirror but the package metadata/versions match npmjs.

---

## Package Legitimacy Audit

Ran `gsd query package-legitimacy check --ecosystem npm` for both candidate packages.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|----------------------|-----------|-------------|---------|-------------|
| `@dimforge/rapier2d-deterministic-compat` | npm | 0.21.0 published 2026-09-25 (~3 wks) | ~9.7k/wk | `github.com/dimforge/rapier` | **[SUS]** | Flagged — see note; planner inserts `checkpoint:human-verify` before install |
| `@dimforge/rapier2d-deterministic` | npm | 0.21.0 published 2026-09-25 (~3 wks) | ~3.5k/wk | `github.com/dimforge/rapier` | **[SUS]** | Flagged — see note; planner inserts `checkpoint:human-verify` before install |

**Packages removed due to [SLOP] verdict:** none.
**Packages flagged as suspicious [SUS]:** both above.

**Mitigating context (do not silently downgrade — surface it to the user):** the sole `[SUS]` reason is `too-new` (the `0.21.0` *release* is ~3 weeks old). Both signals are otherwise clean: **official Dimforge repository**, no deprecation, no `postinstall` script, multi-thousand weekly downloads, and the package names are the project's own locked choice from CONTEXT D-18 / prior `STACK.md`, not a web-search discovery. The binaries were downloaded, extracted, inspected, and executed locally. Treat as low risk, but honour the gate: the planner must add a `checkpoint:human-verify` before `pnpm add`.

*Both packages were discovered from the project's own locked decision (CONTEXT D-18) and the repo's prior `STACK.md`, then verified directly against their published artifacts. Because the legitimacy seam returned `[SUS]` (not `OK`), no claim about them is tagged `[VERIFIED: npm registry]` as a *package-name* provenance; version/API/behaviour claims below are tagged by their evidence (registry lookup, tarball inspection, or runtime execution).*

---

## Architecture Patterns

### System Architecture Diagram

```text
  composition root (src/main.tsx)                     tests (Node, vitest)
        │                                                    │
        │ await initPhysics()   (D-21, idempotent)           │ await initPhysics()  (setup)
        └──────────────┬─────────────────────────────────────┘
                       ▼
        ┌──────────────────────────────────────────────────────────┐
        │  BattleSim.step()   (SYNCHRONOUS, unchanged shape)        │
        │                                                          │
        │  1. events.clear(); cmds = commands.drain()              │  ← Phase 1
        │  2. clock.step()                                         │
        │  3. applyCommands(cmds):                                 │  ← extended
        │        Force  → rigidBody.applyImpulse()                 │
        │        Torque → rigidBody.applyTorqueImpulse()           │
        │  4. physics.step(dt):                                    │  ← NEW
        │        capturePreStepVelocities()   (linvel/angvel/all)  │
        │        world.step(eventQueue)                            │
        │  5. contactBridge.drain(tick):                           │  ← NEW
        │        drainCollisionEvents(h1,h2,started)               │
        │          started → contactPair → normal + contact point  │
        │          Δv = |relVel_at_point · normal| (PRE-STEP vels) │
        │          events.emit(IContactEvent{a,b,partA,partB,Δv})  │
        │  6. mirrorRapierToStore():                               │  ← NEW (D-34)
        │        for each entity: xform ← body transform/vel/ang   │
        │  7. lifecycle + safetyBelt clamp (D-33)                  │  ← NEW (minimal)
        └──────────────────────────────────────────────────────────┘
                       │
                       ▼
        snapshot()/fingerprint()  ──► canonical bytes v3
             = Phase-1 canonical layout
             + rotation/angularVelocity per entity
             + Rapier world.takeSnapshot() bytes
             + collider-handle → (entityId, part, armorSubtype) map
```

### Recommended Project Structure (sim/world — minimal, D-36)

```text
src/sim/world/
├── physics-world.ts     # PhysicsWorld: wraps RAPIER.World + EventQueue; step(); takeSnapshot()
├── composite.ts         # CompositeFactory: assemble a unit (colliders + weapon body + joint)
├── contact.ts           # ContactBridge: handle→(entityId,part) map; drain → typed events
└── (entity-store.ts, world.ts — EXISTING, extended in place)
```
The four-file split (`PhysicsWorld`/`CompositeFactory`/`ContactBridge`/`Lifecycle`) is **not mandatory** (Discretion). A smaller grouping (e.g. `physics.ts` housing the world + factory, `contact.ts` for the bridge) is acceptable if it stays coherent; only introduce the split when a file actually grows a second concern.

### Pattern 1: WASM resolution across Node / Vite / Chrome (D-23 — the deferred question)

**What:** One `initPhysics()` wrapper, called once at the composition root and once in test setup; `PhysicsWorld` is constructed synchronously afterwards.

**Recommendation — `-compat` build:**
```typescript
// src/sim/world/physics-init.ts   (or a host-level module if the import is deemed non-sim)
// Source: @dimforge/rapier2d-deterministic-compat@0.21.0 dist/init.d.ts
import RAPIER from '@dimforge/rapier2d-deterministic-compat';

let ready = false;
/** 幂等地初始化 Rapier WASM；必须在构造任何 World 之前调用一次。 */
export async function initPhysics(): Promise<void> {
    if (ready) return;
    await RAPIER.init();          // idempotent — double-call verified safe
    ready = true;
}
```
Evidence for each environment (`[VERIFIED: local execution, Node v24.21.0]`):
- **Plain Node**: `await RAPIER.init()` then `new RAPIER.World(...)`, `world.step()` → works; `RAPIER.version()` returns `0.21.0`.
- **Vitest 5.0.4 (Node)**: a test importing the compat package and calling `init()` then a 300-step sim ran green, no bundler plugin, no `vite.config` change.
- **Vite 8 / Chrome**: the package has a normal `exports` map (`import → dist/rapier.mjs`), the WASM is base64-inlined (no `.wasm` asset to configure), and `sideEffects: false`. Rolldown/Vite resolves it as ordinary ESM. *(Reasoned from the verified package shape; not executed in a browser this session — the one remaining MEDIUM-confidence item.)*

**Why not the raw build (evidence, not preference):**
- Its `package.json` has only `"module": "rapier.js"` — **no `main`, no `exports`**. `rapier.js` does `import * as wasm from "./rapier_wasm2d_bg.wasm"; __wbg_set_wasm(wasm);` (static WASM import). Plain Node ESM cannot resolve the package at all — verified failure: `Error: Cannot find package '...\@dimforge\rapier2d-deterministic\index.js'`.
- Its `init.js` is `export {};` — **there is no `init()` function**, so a uniform `await initPhysics()` cannot wrap it; import-time side effects *are* the init and depend on the bundler's WASM handling.
- To use it you would add `vite-plugin-wasm` + `vite-plugin-top-level-await` + `build.target: 'esnext'`, and mirror that config into `vitest.config.ts` so the Node-only gate can load it. That is more moving parts for the same physics.

**Recommendation:** use `-compat`; treat "the literal package string in PHYS-03" as satisfied by intent — the deterministic **build** is what PHYS-03 mandates, and the compat variant ships that exact build (byte-identical wasm). Because both packages embed the same WASM, the future cross-machine upgrade path (D-17's deferred tier) remains zero-cost: swapping compat→raw later cannot change physics results.

> **Decision checkpoint for planner:** this contradicts the *literal* package name in D-18/PHYS-03. Since D-23 explicitly delegated the variant choice to research, record the recommendation as a decision the user should confirm (`checkpoint:human-verify`) before locking `package.json`.

### Pattern 2: Composite rig — body+armor colliders on one body, weapon as a separate jointed body (D-24, PHYS-01)

**What:** A unit's body and armor are multiple colliders on ONE dynamic rigid body (offsets via `ColliderDesc.setTranslation`); the weapon is its own dynamic rigid body attached by a revolute joint. Every collider is registered in `handle → (entityId, part)`.

**CORRECTED API for 0.21.0** (`[VERIFIED: @dimforge/rapier2d-deterministic-compat@0.21.0 .d.ts + runtime]`):
```typescript
// Source: dist/dynamics/rigid_body.d.ts, dist/geometry/collider.d.ts, dist/dynamics/impulse_joint.d.ts
import RAPIER from '@dimforge/rapier2d-deterministic-compat';

const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setLinearDamping(0.1)
        .setAngularDamping(0.1)
        .setCanSleep(false)              // swinging parts must never sleep
);
// 本体（球）
const bodyCol = world.createCollider(RAPIER.ColliderDesc.ball(radius).setMass(mass), body);
// 防具（独立碰撞体，带部位标），放在本体局部偏移处
const armorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy)   // NOTE: no capsuleRounded in 0.21.0
        .setTranslation(offsetX, offsetY)
        .setMass(armorMass),
    body
);
// 武器（独立动态刚体 + 旋转关节）
const weaponBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setCanSleep(false)
);
const weaponCol = world.createCollider(RAPIER.ColliderDesc.capsule(halfLen, r).setMass(wMass), weaponBody);
const joint = world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }),  // exactly 2 anchors in 2D
    body, weaponBody, true
);
joint.configureMotorVelocity(targetAngVel, factor);   // configureMotorVelocity is on the base ImpulseJoint
```
Verified mechanical facts:
- `JointData.revolute.length === 2`; passing a 3rd arg is silently ignored by JS (so the ARCHITECTURE.md 3-arg example "runs" but the axis is meaningless in 2D) — **use the 2-anchor form**.
- `world.createImpulseJoint(...)` returns `ImpulseJoint` (not `RevoluteImpulseJoint`); `configureMotorVelocity(targetVel, factor)` lives on `ImpulseJoint`.
- `ColliderDesc` static factory list (verbatim): `ball, capsule, segment, triangle, roundTriangle, polyline, voxels, trimesh, cuboid, roundCuboid, halfspace, heightfield, convexHull, convexPolyline, roundConvexHull, roundConvexPolyline, compound, convexDecomposition` — **no `capsuleRounded`**.
- `setActiveEvents` takes a numeric enum `ActiveEvents { NONE=0, COLLISION_EVENTS=1, CONTACT_FORCE_EVENTS=2 }` — matches the project's numeric-enum style.

### Pattern 3: Collision groups for unit-level filtering (D-27)

`InteractionGroups` is a single `number`: 16 bits membership (high) + 16 bits filter (low); interaction allowed iff `((a >> 16) & b) != 0 && ((b >> 16) & a) != 0`. Assign each unit a group bit; give each part a membership+filter that excludes its own unit's parts and (optionally) restricts weapon damage contacts to enemy parts. Because contacts are still surfaced for every allowed pair, damage-vs-push decisions stay in Phase 3 (D-31). Keep the group scheme a data constant in `content/` (single source).

### Pattern 4: Contact drain → typed events + Δv (PHYS-02, D-28..D-31)

**What:** On each tick, after `world.step(eventQueue)`, translate Rapier collision-enter events into `IContactEvent`s carrying `(entityId, part)` for both sides and Δv.

**The Δv subtlety (empirically decisive):** reading the manifold *after* `world.step()` yields the **post-solve** state — a head-on 8 m/s impact reported `relN = 0.0000`. Computing the relative normal speed from the bodies' **pre-step** velocities at the contact point recovered `Δv = 8.0000`. Therefore the physics step must snapshot every body's `linvel()`/`angvel()` **before** stepping, and the bridge must use those values.

```typescript
// Source: dist/pipeline/world.d.ts (contactPair, getCollider), dist/geometry/narrow_phase.d.ts (TempContactManifold)
// pre-step: Map<RigidBodyHandle, {lv: Vector, av: number}> captured for ALL bodies
world.step(eventQueue);
eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;                              // enter semantics (D-29)
    const a = world.getCollider(h1);
    const b = world.getCollider(h2);
    const ra = lookup(a.handle);                       // {entityId, part} | null
    const rb = lookup(b.handle);
    if (!ra || !rb) return;                            // untagged/static → ignore
    world.contactPair(a, b, (mf) => {
        const n = mf.normal();                         // world-space; copy now (temp buffer)
        const p = mf.numSolverContacts() > 0 ? mf.solverContactPoint(0) : null;
        const dv = normalRelativeSpeed(a, b, p, n, preStepVelocities);   // ≥ 0
        events.emit({ kind: SimEventKind.Contact, tick, a: ra, b: rb, dv });
    });
});
```
`normalRelativeSpeed = Math.abs( (vA_atP − vB_atP) · n )` where `v_atP = linvel + ω × r`, `r = contactPoint − bodyTranslation`.

Optional diagnostic channel (D-29): `eventQueue.drainContactForceEvents(ev => … ev.totalForceMagnitude())`. **Note:** `TempContactForceEvent` exposes exactly `{free, collider1, collider2, totalForce, totalForceMagnitude, maxForceDirection, maxForceMagnitude}` — there is **no `.started()`** in 0.21.0, so it cannot be used as an edge trigger. This does not block Phase 2 (dedup is Phase 3, D-31); do **not** rely on `.started`.

### Pattern 5: Pose mirroring + canonical snapshot v3 (D-34, D-20)

**What:** After physics, mirror each body's `translation()`, `rotation()`, `linvel()`, `angvel()` into `EntityStore`; extend `IUnitXform` with `rotation`/`angularVelocity`; bump snapshot `VERSION` 2→3 and append Rapier bytes + the part map.

Verified snapshot facts (`[VERIFIED: local execution]`):
- `world.takeSnapshot(): Uint8Array` and the static `World.restoreSnapshot(data): World` both exist. A world with a revolute joint snapshotted to **3,723 bytes**, restored to an equal hash, and after 60 further steps the two worlds were **still byte-identical** — joints and colliders are included.
- **`RigidBodyHandle`/`ColliderHandle` are packed f64 numbers**, not small ints (observed `5e-324` = `Number.MIN_VALUE` for the second body). They are usable as `Map` keys, but **must be serialized as `float64`, not int32**.
- **Handles survive `restoreSnapshot`**: `restored.getCollider(oldColHandle).parent().handle === oldBodyHandle` held. So the part map can be rebuilt from per-entity serialized handles.
- **`userData` is NOT preserved by `takeSnapshot()`** (verified `null` after restore). Do **not** stash `entityId` in `body.setUserData(...)` and expect it to survive a snapshot — the `handle → (entityId, part, armorSubtype)` map must be serialized explicitly (or re-derived from serialized per-entity handles).

Sketch of v3 byte layout (append after the Phase-1 entity section; keep MAGIC `0x454d5331`, bump VERSION to 3, no v2 migration because no snapshot leaves the process):
```text
… Phase-1 layout (magic, version=3, reserved, tick, streams, entityCount, nextId,
   per-entity: id, hp, level, x, y, vx, vy, ROTATION, ANGULARVELOCITY  /* 9×i32 */)
rapierLen:u32  rapierBytes:Uint8Array
partMapCount:u32
  per entry: colliderHandle:f64  entityId:i32  part:u8  armorSubtype:u8
```
`restore()`: rebuild store from entities → `RAPIER.World.restoreSnapshot(rapierBytes)` → rebuild `ContactBridge` part map from serialized entries (handles match because restore preserves them). `fingerprint()` still hashes the whole canonical byte array (cyrb53, non-crypto — Phase 1 contract unchanged). D-20's "dual fingerprint" = this sim fingerprint (which now *contains* the Rapier bytes) **plus** a direct `hash(world.takeSnapshot())` assertion.

### Anti-Patterns to Avoid
- **Stub abstraction layers** (ARCHITECTURE Anti-Pattern 2; D-36): do not commit `throw new Error('Method not implemented.')` base classes. The "second concrete case" for a physics abstraction is the kingdom/macro layer — not in scope.
- **Reading Δv from the post-step manifold** — returns post-solve velocities (0 for a hard hit). Use pre-step velocities.
- **Serializing handles as int32** — they are packed f64.
- **Relying on `userData` across snapshot/restore** — it is dropped.
- **Building bodies in map/Set iteration order** — insertion order changes `takeSnapshot()` (verified: reordering three bodies changed the hash from `3459bf9d` to `7b9237b9`).
- **Mutating `xform` directly for Force/Torque** — Phase 2 routes commands through `applyImpulse`/`applyTorqueImpulse` so Rapier stays the source of truth.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Broad-phase / solver / CCD | any hand-rolled collision sweep | Rapier `World` + `setCcdEnabled` + `maxCcdSubsteps` | Solver correctness, stability, CCD sweeps, and determinism are all handled; hand-rolling guarantees divergence. |
| Compound-body assembly | a manual "part" physics layer | multiple `ColliderDesc`s on one `RigidBody` (+ a jointed weapon body) | Rapier's documented efficient composite pattern; each collider gets its own `handle` for part tagging. |
| Snapshot / restore of physics state | serializing positions by hand | `world.takeSnapshot()` / `World.restoreSnapshot()` | Preserves internal arena order exactly (required for determinism); hand-rolled state will not reproduce the solver's internals. |
| Canonical state hash | a new hasher | existing `fingerprint()` (cyrb53) over extended bytes | Phase-1 contract; hashing/format stay separable (D-03). |
| WASM loading in Node/Vite | custom base64 decode or wasm loader | the `-compat` package | It already inlines and decodes; verified working everywhere. |

**Key insight:** in this domain the "hand-rolled" risk is not re-implementing physics — it is *re-implementing the parts of Rapier's determinism contract the project controls* (ordered construction, pre-step velocity capture, handle serialization, snapshot completeness). Those are cheap to get right and catastrophic to get subtly wrong.

---

## Runtime State Inventory

> Phase 2 is a greenfield feature add on top of Phase 1, not a rename/refactor. This section is included to answer the canonical question for the one piece of cross-boundary state Phase 2 touches: the snapshot format.

| Category | Items Found | Action Required |
|----------|-------------|-----------------|
| Stored data | None persisted — "本阶段快照不出进程" (D-34); no v2 migration path needed. | None. Bump `VERSION` 2→3; version guard throws on mismatch (already implemented). |
| Live service config | None (no service/DB/registry touched). | None. |
| OS-registered state | None. | None. |
| Secrets/env vars | None (grep of `src/`/`tests/` shows no `.env`; config is TS constants per D-06). | None. |
| Build artifacts | `node_modules` gains `@dimforge/rapier2d-deterministic-compat`; `pnpm-lock.yaml` must record the exact pin. No compiled binaries committed. | Add dependency with `--save-exact`; the version-bump smoke test (D-19) makes any drift a hard failure. |

**Canonical question — "After every file is updated, what runtime systems still have the old string/format?"** → Nothing external; the only "old state" is the in-process snapshot `VERSION = 2`, which is deliberately declared non-portable this phase.

---

## Common Pitfalls

### Pitfall 1: Δv read from the post-step manifold is zero
**What goes wrong:** the damage/impact magnitude derived from contacts is ~0 for real hits, so Phase 3's `√Δv − 1` term is always ≤ 0 and battles deal no damage (the SPEC author explicitly warns numbers need empirical calibration).
**Why it happens:** `drainCollisionEvents` fires *after* `world.step()`, by which point the solver has already removed the approaching normal velocity.
**How to avoid:** capture every body's `linvel()`/`angvel()` **before** `world.step()` and compute Δv at the contact point from those pre-step values. Verified: post-step = 0.0000, pre-step = 8.0000.
**Warning signs:** all contact Δv are 0; damage events never fire in Phase 3.

### Pitfall 2: Copying API snippets from the prior research docs
**What goes wrong:** `ColliderDesc.capsuleRounded(...)` is `undefined`; `TempContactForceEvent.started` is `undefined`; the 3-arg `JointData.revolute` silently ignores the axis; `createImpulseJoint` is cast to `RevoluteImpulseJoint` unnecessarily.
**Why it happens:** `ARCHITECTURE.md`/`PITFALLS.md` were written against a general Rapier mental model, not the pinned 0.21.0 typings.
**How to avoid:** use the corrected signatures in Pattern 2/Pattern 4 above; all were checked against the 0.21.0 `.d.ts` and executed.
**Warning signs:** TS errors on `capsuleRounded`; a "contact force started" field that never exists; a swing that doesn't move.

### Pitfall 3: Non-deterministic construction/insertion order
**What goes wrong:** the golden fingerprint diverges between two "identical" runs.
**Why it happens:** Rapier requires identical body/collider/joint creation **and removal** order; iterating a `Map`/`Set` gives an order you cannot reproduce.
**How to avoid:** spawn/despawn from the **ordered** `EntityStore.ids()` array; never iterate `Map`/`Set` for construction. Verified: same order → same hash (`3459bf9d` twice); swapped order → different hash (`7b9237b9`).
**Warning signs:** fingerprints diverge only after spawn/despawn; divergence correlated with join order.

### Pitfall 4: Fast weapons tunneling (CCD)
**What goes wrong:** a fast weapon passes through a target in one step; no hit registers.
**Why it happens:** Rapier auto-sweeps fast *dynamic* bodies against *fixed* colliders, but not against other *dynamic* bodies unless CCD is enabled; two CCD bodies can still tunnel.
**How to avoid:** `setCcdEnabled(true)` on weapon/projectile bodies; keep weapon colliders thick (capsules, not thin segments); consider `maxCcdSubsteps > 1`; add a sweep test. **Verified:** a 0.15 m ball at 240 m/s vs a 0.06 m-thick *dynamic* target produced **0 hit events without CCD** and **1 hit with CCD**; at ≤120 m/s no tunneling occurred either way; against *fixed* walls no tunneling at 200 m/s even without CCD (auto-sweep). At Phase-2 test speeds a swinging weapon is far slower, so CCD is cheap insurance rather than load-bearing.
**Warning signs:** a `√Δv` sweep test intermittently reports 0 hits for the fastest weapon.

### Pitfall 5: Grounding the boundary in the wrong environment
**What goes wrong:** the gate can't load physics under Node, or the bundle fails in Vite.
**Why it happens:** choosing the raw `.wasm` package while the gate is Node-only (D-22).
**How to avoid:** use `-compat` (verified in Node+Vitest); if the raw package is mandated, add `vite-plugin-wasm` to **both** `vite.config.ts` and `vitest.config.ts`.
**Warning signs:** `Error: Cannot find package .../index.js`; `No loader is configured for '.wasm'`.

### Pitfall 6: Snapshot incompleteness
**What goes wrong:** `fingerprint(restore(snapshot)) !== fingerprint(snapshot)` after physics is added.
**Why it happens:** new future-affecting state (rotation, angular velocity, the part map) is not serialized; or `userData` (not restorable) is used to carry `entityId`.
**How to avoid:** add rotation/angularVelocity to `IUnitXform` and serialize the part map explicitly; add a round-trip test (Phase-1 already establishes this invariant).
**Warning signs:** the restore round-trip test fails only after Rapier is introduced.

### Pitfall 7: Bodies sleeping and freezing the "living" swing
**What goes wrong:** once a unit settles, `world.step()` stops integrating it and the demo swing stalls.
**Why it happens:** Rapier bodies auto-sleep after low activity (default `setCanSleep(true)`).
**How to avoid:** set `setCanSleep(false)` on weapon (and, if needed, body) rigid bodies; call `wakeUp()` on command receipt.
**Warning signs:** velocities stop changing for a settled unit; the swing freezes after a few seconds.

---

## Code Examples

### Determinism gate (Node, Vitest) — extends the existing Phase-1 gate
```typescript
// tests/determinism/physics-gate.test.ts   (lives in tests/determinism so the pre-commit hook picks it up)
import { beforeAll, describe, expect, it } from 'vitest';
import { initPhysics } from '@/sim/world/physics-init';   // or wherever the wrapper lands

beforeAll(async () => { await initPhysics(); });

describe('physics determinism (PHYS-01/02/03)', () => {
    it('same seed → identical sim fingerprint trace AND identical Rapier snapshot hash', () => {
        const a = runPhysicsTrace(12345, 200);   // returns { trace: string[], rapierHash: string }
        const b = runPhysicsTrace(12345, 200);
        expect(a.trace).toEqual(b.trace);        // D-20 first gate
        expect(a.rapierHash).toBe(b.rapierHash); // D-20 second gate
    });
    it('version smoke test (D-19): Rapier version is pinned', () => {
        expect(rapierVersion()).toBe('0.21.0');
    });
    it('CCD sweep: fastest weapon registers exactly one hit', () => {
        expect(sweepHits(FAST_TEST_WEAPON_SPEED)).toBe(1);
    });
    it('Δv is non-zero at typical closing speed', () => {
        expect(measureHeadOnDv(8 /* m/s */)).toBeGreaterThan(0);
    });
});
```
The pre-commit hook already runs `pnpm vitest run tests/determinism` (verified in `.githooks/pre-commit`), so placing the physics gate under `tests/determinism/` wires it in with no hook edit. The convention gate (`tests/style/conventions.test.ts`) has `SCAN_ROOTS = ['src', 'tests']` (verified) — every new `.ts` file must carry full Chinese JSDoc + `I`-prefixed interfaces or the gate fails.

### Physics init idempotency (verified)
```typescript
await RAPIER.init();
await RAPIER.init();   // safe — verified no error
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Raw `.wasm` + bundler plugins as the "production" default | `-compat` base64-inlined build as the friction-free default | Long-standing; both ship in 0.21.0 | For a Node-only gate, compat removes a whole plugin/config layer. |
| `ContactForceEvent.started` edge flag | not present in 0.21.0 | — | Hit-edge semantics must come from app state (D-31 defers to Phase 3). |
| `ColliderDesc.capsuleRounded` | not present; use `capsule`/`roundCuboid` | — | 2D capsules already have round ends. |

**Deprecated/outdated in this project's context:**
- `planck-js` (predecessor physics) — replaced by Rapier (already decided in STACK.md).
- Treating snapshot bytes as portable — Rapier snapshots are build-specific; hash them, never ship them across versions (reinforces D-19's version smoke test).

---

## Assumptions Log

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | Vite 8 (rolldown) bundles `@dimforge/rapier2d-deterministic-compat` (base64 WASM, `exports` map) with no plugin and no `.wasm` asset config. | Standard Stack / Pattern 1 | Bundle fails or needs `vite-plugin-wasm`; low fix cost. Verified only by package shape, not a browser build. |
| A2 | The revolute **joint motor** (`configureMotorVelocity`) can produce a satisfying, repeatable swing (D-24/D-25) with tuned `factor`/`model`. | Pattern 2 / Design Restraint | If not, use the D-36-sanctioned fallback (drive the weapon body with a direct angular velocity / `applyTorqueImpulse`). See Design Restraint #2 for the observed weak-motor evidence. |
| A3 | A single solver contact point (`solverContactPoint(0)`) is adequate to represent the Δv of a weapon-vs-armor hit. | Pattern 4 | Multi-contact hits may want max/mean across `numSolverContacts()`; minor. |
| A4 | The pre-step velocity of the *previous* tick is the correct "approach speed" for a contact whose `started` flag arrives this tick. | Pattern 4 | Off-by-one at very high speeds; mitigated by CCD and a Δv sanity test. |
| A5 | The `-compat` and raw packages will stay byte-identical (same deterministic build) within 0.21.0. | Standard Stack | If they ever diverge, the "swap is free" claim breaks — the D-19 pin makes that a hard failure, not a silent drift. |

**If this table is non-empty:** A1 and A2 are the two items worth a quick spike; A2 is the one most likely to change the plan (it can remove the joint-motor tuning task).

---

## Open Questions (RESOLVED)

> All three questions below are **RESOLVED** and folded into the plans; none blocks the phase goal.

1. **Joint-motor swing vs direct angular drive (D-36 simplification candidate).** — **(RESOLVED: keep the revolute joint for attachment (D-24); drive the swing by direct angular velocity/`applyTorqueImpulse` per D-36. Plans 02-02/02-04 do this: the tracer drives directly, and plan 02-04 attempts the D-24 motor before falling back to the direct drive, recording the final choice in its SUMMARY.)**
   - What we know: a minimal rig with `configureMotorVelocity(6.0, 1.0)` produced an angular-velocity *spike that decayed to ~0* over 30 steps (observed `[0.9191, 0.1223, -0.0064, …, 0]`), i.e. the naive motor call did not sustain a swing.
   - What's unclear: whether a tuned `configureMotorModel(MotorModel.ForceBased)` + stronger `factor`, or a larger target velocity, yields a clean swing; vs. simply driving the weapon body's angular velocity directly.
   - Recommendation: keep the revolute **joint** (attachment is locked by D-24), but make the *drive* an early spike decision. A direct `setAngvel`/`applyTorqueImpulse` on the weapon body is simpler, needs no motor tuning, and still creates independent weapon velocity for Δv — strongly aligned with D-36. Defer the final choice to a one-task spike.

2. **Which package variant to lock.** — **(RESOLVED: lock `@dimforge/rapier2d-deterministic-compat@0.21.0`, exact-pinned. Plan 02-01 installs it and folds the D-18 literal-string substitution into its blocking-human legitimacy checkpoint for explicit user approval.)**
   - What we know: compat is strictly simpler and verified; raw honours PHYS-03's literal name but breaks plain-Node resolution.
   - Recommendation: `-compat` via a `checkpoint:human-verify` (it revises D-18's literal string, though not its intent).

3. **README/browser-bundle verification of the compat build under Vite 8.** — **(RESOLVED: tracked as a Manual-Only verification in 02-VALIDATION.md; no plan task blocks on it. Run `pnpm build` and confirm the `-compat` Rapier import resolves in the production bundle.)**
   - What we know: Node + Vitest verified; Vite/Chrome reasoned.
   - Recommendation: include a 5-minute `pnpm build` smoke of a one-line Rapier import.

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | vitest, build, gate | ✓ | v24.21.0 | — |
| pnpm | install / scripts | ✓ | 12.5.1 | npm |
| npm registry | dependency install | ✓ | `registry.npmmirror.com` (mirror) | set registry to npmjs.org if a version is unavailable |
| TypeScript (TS6 alias) | `typecheck` (base + sim) | ✓ | 6.0.2 | — |
| `@typescript/native` (TS7) | `typecheck` (`tsc`) | ✓ | 7.0.2 | — |
| Vitest | gate + unit tests | ✓ | 5.0.4 | — |
| `@dimforge/rapier2d-deterministic-compat` | physics | ✗ (not yet installed) | — | raw `-deterministic` + `vite-plugin-wasm` |
| git | pre-commit gate | ✓ | 2.37.3 | — |

**Missing dependencies with no fallback:** none.
**Missing dependencies with fallback:** `-compat` package (install it; fallback is the raw variant).

---

## Validation Architecture

`workflow.nyquist_validation` is `true` in `.planning/config.json` → included.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Vitest 5.0.4 (Node environment) |
| Config file | `vitest.config.ts` (`environment: 'node'`, `include: ['tests/**/*.test.ts']`) |
| Quick run command | `pnpm vitest run tests/determinism --reporter=dot` |
| Full suite command | `pnpm vitest run` (a.k.a. `pnpm test`) |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| PHYS-01 | unit spawns 1 body + N colliders + 1 weapon body + joint; each collider identifiable | unit | `pnpm vitest run tests/sim/physics-composite.test.ts -x` | ❌ Wave 0 |
| PHYS-01 | part map: collider handle → (entityId, part, armorSubtype) resolves every part | unit | `pnpm vitest run tests/sim/physics-composite.test.ts -x` | ❌ Wave 0 |
| PHYS-02 | weapon-vs-armor contact emits `IContactEvent` with correct parts + Δv > 0 | unit | `pnpm vitest run tests/sim/contact.test.ts -x` | ❌ Wave 0 |
| PHYS-02 | Δv uses pre-step velocities (head-on 8 m/s → Δv ≈ 8) | unit | `pnpm vitest run tests/sim/contact.test.ts -x` | ❌ Wave 0 |
| PHYS-03 | pinned version smoke test (version == '0.21.0' + golden hash) | smoke | `pnpm vitest run tests/determinism/physics-gate.test.ts -x` | ❌ Wave 0 |
| PHYS-03 | same-seed double run → identical per-tick fingerprint trace | integration | `pnpm vitest run tests/determinism/physics-gate.test.ts -x` | ❌ Wave 0 |
| PHYS-03 | same-seed double run → identical `takeSnapshot()` hash (D-20 dual gate) | integration | `pnpm vitest run tests/determinism/physics-gate.test.ts -x` | ❌ Wave 0 |
| PHYS-03 | `fingerprint(restore(snapshot)) === fingerprint(snapshot)` | integration | `pnpm vitest run tests/sim/snapshot.test.ts -x` (extend existing) | ✅ (extend) |
| PHYS-03 | CCD sweep: fastest weapon → exactly one hit against a dynamic target | unit | `pnpm vitest run tests/sim/ccd.test.ts -x` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run tests/determinism --reporter=dot` (also the pre-commit hook).
- **Per wave merge:** `pnpm test` (full suite).
- **Phase gate:** full suite green + convention gate green before `/gsd-verify-work`.

### Wave 0 Gaps
- [ ] `tests/determinism/physics-gate.test.ts` — async `initPhysics()` in `beforeAll`; dual fingerprint + version smoke (D-19/D-20).
- [ ] `tests/sim/physics-composite.test.ts` — composite rig + part map (PHYS-01).
- [ ] `tests/sim/contact.test.ts` — typed contact events + Δv semantics (PHYS-02).
- [ ] `tests/sim/ccd.test.ts` — sweep test (PHYS-03, criterion 4's CCD half).
- [ ] Extend `tests/helpers/run-sim.ts` (or add a physics helper) to build the physics-enabled sim and return both the sim trace and the Rapier snapshot hash.
- [ ] Test-setup call to `await initPhysics()` shared across physics test files.

*(Test infra otherwise exists — Vitest is configured; no framework install needed.)*

---

## Security Domain

`security_enforcement: true`, `security_asvs_level: 1` → included.

### Applicable ASVS Categories
| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | No auth surface this phase (bridge is Phase 6). |
| V3 Session Management | no | No sessions. |
| V4 Access Control | no | Single-process headless sim. |
| V5 Input Validation | yes | `CommandQueue.validate()` already drops malformed commands deterministically (T-01-05); physics must not add a new unvalidated input path (e.g. never accept raw Rapier snapshot bytes from outside — snapshot/restore stays in-process this phase, D-34). |
| V6 Cryptography | no | The fingerprint is explicitly **non-cryptographic diagnostics** (Phase-1 decision); Rapier snapshot bytes never cross a trust boundary this phase. |

### Known Threat Patterns for this stack
| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Malformed command → undefined deref in the physics path | Tampering / DoS | Reuse the total `validate()`; the contact bridge must guard `lookup(handle) → null` before use (predecessor's `damageInfo[aIdx]` TypeError — see PITFALLS #5). |
| Untrusted snapshot bytes → corrupt/`NaN` sim | Tampering | Do not deserialize external snapshots; only `restore()` bytes produced in-process by `snapshot()` (version guard already throws on mismatch). |
| `NaN`/∞ entering Rapier from bad constants → world quarantine | DoS / Tampering | Keep all physics constants in `content/`/`config` (single source); add a NaN guard test on mirrored poses. |
| Dependency supply chain | Tampering | Pin exact version (D-19), run the version smoke test, and pass the legitimacy checkpoint before install. |

---

## Design Restraint (CONTEXT D-36) — mandated review

The user's explicit principle: *"这个项目不是那种需要长期拓展的大项目，可以避免一些没有必要的抽象，仅做必要的拓展。"* Below is each simplification candidate D-36 named, with a research verdict grounded in evidence.

1. **Dual fingerprint gate (D-20) → could it be just the sim fingerprint?**
   *Verdict: keep the dual gate — it is nearly free and catches a real bug class.* The sim fingerprint already hashes bytes that will *include* the Rapier snapshot (Pattern 5), so the marginal cost of the second assertion is one `hash(world.takeSnapshot())` call — but it independently detects "sim fingerprint green while Rapier state silently diverged" and proves snapshot-completeness. Recommend keeping; if the planner wants fewer moving parts, the fallback (sim-fingerprint only) is acceptable at same-machine tier.

2. **Weapon swing: joint motor vs direct angular drive (the strongest simplification signal).**
   *Verdict: prefer the simpler drive; keep the joint.* The locked decision (D-24) requires the weapon be a **separate body attached by a revolute joint** — that stays. But D-24 also says the motor drives it. Empirically, a naive `configureMotorVelocity(6.0, 1.0)` on a minimal rig did **not** sustain a swing (angular velocity decayed `0.92 → 0.12 → … → 0`), i.e. motor tuning is real work with uncertain payoff. Driving the weapon body directly (`setAngvel(...)` per tick, or `applyTorqueImpulse`) yields the same independent weapon velocity for Δv, needs no motor model/factor tuning, and is deterministic. **Recommendation:** keep the revolute joint for attachment; drive by direct angular velocity/impulse; drop the motor. This is exactly the D-36 candidate. (If a torque-limited, physically-flavoured swing is later wanted, revisit the motor — it is reversible.)

3. **`PhysicsWorld` / `CompositeFactory` / `ContactBridge` / `Lifecycle` four-file split.**
   *Verdict: do not force the split.* Two modules suffice: a `physics` module (world + factory) and a `contact` module (bridge). Introduce a third file only when one genuinely grows a second concern. Lifecycle for Phase 2 is "spawn in ordered id order / remove on despawn" — a few lines, not a system.

4. **`CompositeFactory` arbitrary weapons/armors (D-26).**
   *Verdict: implement the array shape but do not build a content pipeline.* Accept `{ weapons: [...], armors: [...] }` (cheap, and Phase 3 needs it), but Phase 2 only exercises a single weapon + single armor with test constants. Do not add slot logic, equip rules, or unlock tables — those are Phase 3.

5. **Collision `ActiveEvents` scope.**
   *Verdict: set them on damage-relevant colliders only* (weapon, armor, body) — not on decorative/static geometry — to avoid event noise (PITFALLS #5) and needless cost. `CONTACT_FORCE_EVENTS` is optional (diagnostic only, D-29).

**General rule to carry into the plan:** introduce an abstraction only when the **second concrete case** exists (same rule as ARCHITECTURE Anti-Pattern 2). In Phase 2 the second case is usually Phase 3 — so a one-case-thin wrapper now beats a two-case-general one.

---

## Sources

### Primary (HIGH confidence — verified this session)
- `@dimforge/rapier2d-deterministic-compat@0.21.0` published package (downloaded + extracted tarball): `package.json`, `dist/init.d.ts` (`export declare function init(): Promise<void>`), `dist/pipeline/world.d.ts`, `dist/pipeline/event_queue.d.ts`, `dist/geometry/narrow_phase.d.ts`, `dist/geometry/collider.d.ts`, `dist/dynamics/rigid_body.d.ts`, `dist/dynamics/impulse_joint.d.ts`, `dist/geometry/interaction_groups.d.ts`, `dist/math.d.ts`. — API surface (PHYS-01/02/03).
- `@dimforge/rapier2d-deterministic@0.21.0` published package: `package.json` (no `main`/`exports`; `"module": "rapier.js"`), `rapier.js`, `init.js` (`export {}`). — explains the plain-Node resolution failure.
- Local Node v24.21.0 execution of the compat build: init/double-init; 240-step composite sim double-run → identical snapshot hash `95d440c5`; revolute joint snapshot → 3,723 bytes, equal restore hash, equal after +60 steps; pre-step Δv = 8.0000 vs post-step 0.0000; CCD 240 m/s dynamic-target tunneling without CCD (0 hits) fixed by CCD (1 hit); insertion-order hash sensitivity `3459bf9d` vs `7b9237b9`; handle stability and `userData` stripping across restore. — determinism + Δv + CCD + snapshot.
- Vitest 5.0.4 run in Node importing the compat build → green (double-run snapshot-hash equality). — D-22 gate mechanism.
- `@typescript/native` 7.0.2 `tsc` typecheck of Rapier usage under `lib: ["ESNext"]`, `types: []`, `skipLibCheck: true`, `strict: true` → exit 0. — DOM-free sim boundary (D-03/SIM-03) preserved.
- In-repo files read this session: `src/sim/battle-sim.ts`, `src/sim/world/world.ts`, `src/sim/world/entity-store.ts`, `src/sim/core/events.ts`, `src/sim/commands.ts`, `src/sim/snapshot.ts`, `src/config/sim.ts`, `src/sim/content/formulas.ts`, `src/sim/systems/movement.ts`, `tests/determinism/gate.test.ts`, `tests/style/conventions.test.ts`, `tests/helpers/run-sim.ts`, `tsconfig.json`, `tsconfig.sim.json`, `eslint.config.js`, `vitest.config.ts`, `vite.config.ts`, `package.json`, `.githooks/pre-commit`, `.planning/config.json`.
- `.planning/reference/ai-marble-kingdom.md` §伤害计算 / §武器 / §防具 — Δv formula `D̄_R = max[A_A P_A W_A (√Δv − 1), 0]`; armor reduction `ΔD = D_R (1 − 100B_A/(100B_A + A_D P_D S_D))`; final `D = D_R − ΔD`; XP `E = R_D·√(ΔD − 50)`. (File is a non-UTF8 cached export; formulas are ASCII-readable.)
- npm registry lookups (via the environment's `registry.npmmirror.com` mirror): both packages at `0.21.0`, published 2026-09-25.

### Secondary (MEDIUM confidence)
- Prior in-repo research `ARCHITECTURE.md` (Patterns 3/4/6/7), `PITFALLS.md` (Pitfalls 1/4/5/8/10), `STACK.md` — used for intent; **API snippets corrected against the pinned typings** (see Pitfall 2).
- Vite 8 / Chrome bundling of the compat build — reasoned from `exports`/`sideEffects`/base64-inline, not executed in a browser.

### Tertiary (LOW confidence)
- None material. (The `classify-confidence` seam maps unknown providers such as `npm`/local-execution to LOW; claims above are instead tagged by their concrete evidence.)

---

## Metadata

**Confidence breakdown:**
- Standard stack (package variants, versions, wasm identity): HIGH — tarballs extracted, hashed, executed.
- Rapier API surface for 0.21.0: HIGH — read from the shipped `.d.ts` and reproduced at runtime.
- Determinism mechanics (ordering, snapshot, Δv, CCD): HIGH — reproduced empirically; same-machine tier only (D-17).
- Architecture / integration shape: HIGH on the seam (Phase-1 code read directly); MEDIUM on the browser bundling path.
- Pitfalls: HIGH for the corrected-API and Δv items (verified); MEDIUM for the swing/motor item (single minimal probe).
- Design restraint review: MEDIUM-HIGH — one item (motor vs direct drive) is backed by a probe that should be confirmed by a targeted spike.

**Research date:** 2026-10-16
**Valid until:** ~2026-11-15 (Rapier `0.21.0` is a fresh release; re-verify the pin and the `-compat`/raw wasm-identity claim if a new Rapier version appears — the D-19 smoke test exists precisely to catch this).
