# Phase 2: Physics & Composite Units - Pattern Map

**Mapped:** 2026-10-16
**Files analyzed:** 17 (9 new, 8 modified) + config/test infra
**Analogs found:** 16 / 17 (1 partial — event bridge adapter has no existing analog)

> **Scope:** the entire Phase-1 codebase under `src/sim/**`, `src/config/**`, `src/host/**`
> is git-tracked source (verified `git ls-files` — 24 tracked files, no `.gsd/` mirrors).
> Every analog below is real tracked source; paths are safe to propagate into plans.

---

## ⚠️ Findings the planner MUST fold in (verified against the live tree)

1. **There is NO composition root yet.** `src/main.tsx` does **not** exist (Phase 1 is headless; Phase 5 adds rendering). D-21 says "call `initPhysics()` once in the composition root **and** in test setup". This phase only the **test setup** call exists — the browser/composition-root call lands in Phase 5. Do not write a plan task that edits `src/main.tsx`.
2. **Test directory is `tests/determinism/`, NOT `tests/deterministic/`.** RESEARCH.md repeatedly says `tests/deterministic/physics-gate.test.ts`; the actual pre-commit hook and `pnpm gate` run `tests/determinism`. Place the new physics gate in **`tests/determinism/`** or the hook will not pick it up.
3. **`src/host/**` is NOT in the DOM-free sim boundary.** `tsconfig.sim.json` includes only `src/sim/**` + `src/config/**`; ESLint's `no-restricted-imports` for the sim boundary forbids `**/host/**`, `**/render/**`, `node:*`, `pixi.js`. `initPhysics` / Rapier imports must therefore live under `src/sim/world/` (Rapier itself is not on the restricted list and was verified to typecheck under `lib: ["ESNext"]`, `types: []`).
4. **The style gate (`tests/style/conventions.test.ts`) has `SCAN_ROOTS = ['src', 'tests']`** — every new `.ts` file under those roots needs a `/**` JSDoc block on every top-level export, and `@param`/`@returns` on every exported function. Non-negotiable.
5. **Model corrections from RESEARCH.md §Pitfall 2** must be carried verbatim: `ColliderDesc.capsule(halfHeight, radius)` (no `capsuleRounded`), Δv from **pre-step** velocities (post-step = 0), `JointData.revolute` with **exactly 2 anchors**, no `TempContactForceEvent.started` in 0.21.0.

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| `src/sim/world/physics-init.ts` (NEW) | utility (init) | request-response (one-shot async) | `src/host/pump.ts` | role-match |
| `src/sim/world/physics-world.ts` (NEW) | service (sim core) | transform (fixed-step) | `src/sim/core/clock.ts` + `src/sim/world/entity-store.ts` | role-match |
| `src/sim/world/composite.ts` (NEW) | factory | CRUD (create) | `src/sim/world/entity-store.ts` | role-match |
| `src/sim/world/contact.ts` (NEW) | adapter/service | event-driven | `src/sim/core/events.ts` | partial |
| `src/sim/systems/physics.ts` (NEW, discretionary) | system (pure fn) | transform | `src/sim/systems/movement.ts` | exact |
| `src/sim/core/events.ts` (MOD) | contract | event-driven | itself | exact |
| `src/sim/world/entity-store.ts` (MOD) | model | CRUD/transform | itself | exact |
| `src/sim/world/world.ts` (MOD) | aggregate root | — | itself | exact |
| `src/sim/battle-sim.ts` (MOD) | facade/orchestrator | request-response | itself | exact |
| `src/sim/snapshot.ts` (MOD) | serialization | batch/transform | itself | exact |
| `src/sim/content/physics.ts` (NEW) | config (data) | — | `src/sim/content/formulas.ts` | exact |
| `src/config/sim.ts` (MOD) | config (data) | — | itself | exact |
| `package.json` (MOD) | config | — | itself | exact |
| `tests/helpers/run-physics.ts` (NEW) | test helper | batch | `tests/helpers/run-sim.ts` | exact |
| `tests/determinism/physics-gate.test.ts` (NEW) | test | batch | `tests/determinism/gate.test.ts` | exact |
| `tests/sim/physics-composite.test.ts` (NEW) | test | unit | `tests/sim/entity-store.test.ts` | role-match |
| `tests/sim/contact.test.ts` (NEW) | test | unit | `tests/sim/snapshot.test.ts` | role-match |
| `tests/sim/ccd.test.ts` (NEW) | test | unit | `tests/sim/snapshot.test.ts` | role-match |
| `tests/sim/snapshot.test.ts` (MOD — extend mutator census) | test | unit | itself | exact |
| `tests/helpers/physics-setup.ts` (NEW) + `vitest.config.ts` (MOD) | test setup | — | `tests/style/conventions.test.ts` (node env) | role-match |

---

## Pattern Assignments

### `src/sim/world/physics-init.ts` (utility, request-response)

**Analog:** `src/host/pump.ts` (module-level pure exported function, JSDoc, no class) + `src/sim/core/math.ts`

This is the one deliberate module-level mutable-state exception (an init latch). Keep it tiny (D-36). It is **async**, unlike everything else in `sim/` — but it is called *before* any construction, so `BattleSim.step()` stays synchronous (D-21).

**Module-function pattern to copy** (`src/host/pump.ts:7-16`):
```typescript
/**
 * 无头泵：每次返回一个固定的大预算，**绝不读取任何时钟**。
 * ...
 * @param budget 每帧时间预算（秒）；恒定值，与真实时间无关。
 * @returns 一个恒返回 `budget` 的 `() => number` 泵。
 */
export function headlessPump(budget: number): () => number {
    return () => budget;
}
```

**Target shape** (RESEARCH.md §Pattern 1 / Code Examples — verified idempotent):
```typescript
import RAPIER from '@dimforge/rapier2d-deterministic-compat';

let ready = false;

/**
 * 幂等地初始化 Rapier WASM；必须在构造任何 World 之前调用一次。
 * @returns 初始化完成后 resolve 的 Promise。
 */
export async function initPhysics(): Promise<void> {
    if (ready) return;
    await RAPIER.init(); // 双调验证安全（RESEARCH §Code Examples）
    ready = true;
}
```
Also export a `rapierVersion()` helper for the D-19 version smoke test (`RAPIER.version()` → `'0.21.0'`).

---

### `src/sim/world/physics-world.ts` (service, transform/fixed-step)

**Analog:** `src/sim/core/clock.ts` (interface-first class, `I` prefix, readonly getters) + `src/sim/world/entity-store.ts` (ordered iteration + `restore()`).

**Interface-before-class idiom** (`src/sim/core/clock.ts:1-13`):
```typescript
/**
 * 固定步长逻辑时钟的公开契约（D-13：先接口后类）。
 */
export interface ITickClock {
    /** 固定步长（秒）。 */
    readonly dt: number;
    /** 当前步计数（单调递增，从 0 起）。 */
    readonly tick: number;
    /** 时间前进的唯一途径：步计数加一。 */
    step(): void;
    /** 恢复步计数（快照反序列化专用，SIM-04）。 */
    restore(tick: number): void;
}
```

**Class shape + private fields (no `_` prefix) + readonly getters** (`src/sim/world/entity-store.ts:72-104`):
```typescript
export class EntityStore implements IEntityStore {
    /** id 游标：下一个 `spawn()` 分配的 id。属"未来影响状态"（D-05）。 */
    private nextEntityId = 1;
    /** 迭代契约：有序 id 数组。 */
    private orderedIds: EntityId[] = [];
    /** 仅作查找索引，绝不用于迭代。 */
    private byId = new Map<EntityId, IUnitComponents>();

    /** 迭代契约：只读的有序 id 视图。 @returns 有序 id 数组。 */
    ids(): readonly EntityId[] {
        return this.orderedIds;
    }
```

**What `IPhysicsWorld` must expose** (from RESEARCH §System Diagram + §Pattern 4/5):
- `step(dt: number): void` — capture pre-step velocities → `world.step(eventQueue)`.
- a typed accessor for the Rapier `World` / `EventQueue` (or methods the ContactBridge uses).
- `takeSnapshot(): Uint8Array` and a static/`restoreSnapshot` seam for `deserializeState`.
- `dispose`/handle-addressing helpers for the composite factory.

**Determinism invariants to mirror from the existing store** (`src/sim/world/entity-store.ts:1-10` doc comment):
> 一切系统必须遍历 `ids()` 返回的**有序数组**，绝不遍历 `Map`/`Set`/对象键顺序 … (Pitfall 4)

Apply identically: **create/destroy bodies in `store.ids()` order**, never from a `Map`/`Set` (RESEARCH §Pitfall 3 verified: reordering changed the snapshot hash `3459bf9d → 7b9237b9`).

**Constructor is synchronous** — `new PhysicsWorld(...)` must not `await`; it may only be built after `await initPhysics()` has resolved (D-21).

---

### `src/sim/world/composite.ts` (factory, CRUD/create)

**Analog:** `src/sim/world/entity-store.ts` `spawn()` (deterministic create) + `src/sim/battle-sim.ts` `build()`.

**Ordered/id-monotonic creation pattern** (`src/sim/world/entity-store.ts:91-104`):
```typescript
spawn(): EntityId {
    const id = this.nextEntityId++;
    this.orderedIds.push(id);
    this.byId.set(id, {
        attrs: { hp: 100, level: 1 },
        xform: { x: 0, y: 0, vx: 0, vy: 0 }
    });
    return id;
}
```

**Target** (RESEARCH §Pattern 2, corrected 0.21.0 API — copy signatures **verbatim**):
```typescript
const body = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(x, y)
        .setLinearDamping(0.1).setAngularDamping(0.1)
        .setCanSleep(false)                 // 摆动部件绝不 sleep（Pitfall 7）
);
const bodyCol  = world.createCollider(RAPIER.ColliderDesc.ball(radius).setMass(mass), body);
const armorCol = world.createCollider(
    RAPIER.ColliderDesc.cuboid(hx, hy)      // 0.21.0 无 capsuleRounded
        .setTranslation(ox, oy).setMass(armorMass),
    body
);
const weaponBody = world.createRigidBody(
    RAPIER.RigidBodyDesc.dynamic().setTranslation(x, y).setCcdEnabled(true).setCanSleep(false)
);
const weaponCol = world.createCollider(
    RAPIER.ColliderDesc.capsule(halfLen, r).setMass(wMass), weaponBody);
const joint = world.createImpulseJoint(
    RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: 0 }),  // 恰好 2 锚点
    body, weaponBody, true
);
```

**Contract:** accept `{ weapons: [...], armors: [...] }` arrays (D-26) but Phase 2 exercises a single weapon + single armor with test constants — do **not** add slot/equip/unlock logic (RESEARCH §Design Restraint #4).
**Every collider handle must be registered** in the `contact.ts` `handle → (entityId, part, armorSubtype)` map at creation time.

---

### `src/sim/world/contact.ts` (adapter, event-driven) — **PARTIAL ANALOG**

**Analog target contract:** `src/sim/core/events.ts` (`EventLog.emit` + typed union). There is **no existing adapter/drainer** in the codebase — this is the one partial match. Build it directly from RESEARCH §Pattern 4, but emit through the existing `IEventLog`.

**Emit contract to satisfy** (`src/sim/core/events.ts:114-164`):
```typescript
export interface IEventLog {
    readonly size: number;
    /** 记录一个事件（存浅拷贝）。 */
    emit(event: SimEvent): void;
    /** 取走全部事件（副本数组）并清空。 */
    drain(): readonly SimEvent[];
    /** 丢弃未读事件。 */
    clear(): void;
}
```

**Drain + Δv pattern** (RESEARCH §Pattern 4 — the empirically decisive correction):
```typescript
world.step(eventQueue);
eventQueue.drainCollisionEvents((h1, h2, started) => {
    if (!started) return;                     // enter 语义（D-29）
    const a = world.getCollider(h1);
    const b = world.getCollider(h2);
    const ra = lookup(a.handle);              // {entityId, part, armorSubtype} | null
    const rb = lookup(b.handle);
    if (!ra || !rb) return;                   // 未登记/静态 → 忽略（防 undefined 解引用）
    world.contactPair(a, b, mf => {
        const n = mf.normal();                // 临时缓冲，立刻拷贝
        const p = mf.numSolverContacts() > 0 ? mf.solverContactPoint(0) : null;
        const dv = normalRelativeSpeed(a, b, p, n, preStepVelocities);  // ≥ 0
        events.emit({ kind: SimEventKind.Contact, tick, a: ra, b: rb, dv });
    });
});
```
`normalRelativeSpeed = Math.abs((vA_atP − vB_atP) · n)`, `v_atP = linvel + ω × r` — computed from **pre-step** velocities (post-step = 0.0000; pre-step = 8.0000 for 8 m/s).

**Guard against the predecessor bug:** `lookup(handle) → null` **must** be checked before use — mirrors the old repo's `damageInfo[aIdx]` TypeError (PITFALLS #5, Threat table).

---

### `src/sim/systems/physics.ts` (system, transform) — DISCRETIONARY

> Per D-36 / RESEARCH §Design Restraint #3, do **not** force a four-file split. The
> "mirror Rapier → store + safety-belt clamp" concern may instead be a private method
> on `PhysicsWorld`. If it *is* split out, copy `movementSystem` exactly.

**Analog:** `src/sim/systems/movement.ts` (the canonical system function shape):

**Ordered-iteration + pure-function signature** (`src/sim/systems/movement.ts:24-33`):
```typescript
/**
 * ...
 * @param w 聚合状态根（读取有序实体与带种子的 `'ai'` 随机流）。
 * @param dt 固定步长（秒），用于对速度积分位置。
 * @returns 无（原地修改 `w.store` 中各实体的位姿）。
 */
export function movementSystem(w: ISimState, dt: number): void {
    const ai = w.rng.stream('ai');
    for (const id of w.store.ids()) {
        const c = w.store.get(id);
        const nudge = clamp(ai.next() - 0.5, -0.5, 0.5);
        c.xform.vx += nudge * MOVEMENT_NUDGE_SCALE;
        c.xform.x += c.xform.vx * dt;
        c.xform.y += c.xform.vy * dt;
    }
}
```
Systems are **free functions taking `ISimState`**, typed params + `@returns`, iterate `store.ids()` only. The Phase-2 mirror step (`xform ← body.translation()/rotation()/linvel()/angvel()`) and the D-33 soft safety-belt clamp follow this exact shape. `clamp` from `src/sim/core/math.ts:29-33` is the reusable primitive for the safety belt.

---

### `src/sim/core/events.ts` (MOD — contract)

**Analog:** itself. Existing numeric-enum + named-interface pattern:

**Numeric enum** (`src/sim/core/events.ts:12-31`):
```typescript
export enum SimEventKind {
    Command = 0,
    Rejected = 1,
    Damage = 2,
    Kill = 3,
    Levelup = 4,
    /** 物理接触（Phase 2 预留）。 */
    Contact = 5
}
```

**Named-interface union, one member per variant** (`src/sim/core/events.ts:93-112`):
```typescript
export interface IContactEvent {
    /** 判别字段。 */
    kind: SimEventKind.Contact;
    /** 事件所属 tick。 */
    tick: number;
    /** 接触方 a 单位 id。 */
    a: EntityId;
    /** 接触方 b 单位 id。 */
    b: EntityId;
}
...
export type SimEvent = ICommandEvent | IRejectedEvent | ... | IContactEvent;
```

**Phase-2 additions** (D-28..D-30), following project-locked rule #3 (numeric enums) and #5 (named interfaces over inline):
```typescript
/** 命中部位（数字枚举，D-28）。 */
export enum PartKind { Body = 0, Weapon = 1, Armor = 2 }
/** 防具子类型（数字枚举，D-28）：破甲矩阵按此区分。 */
export enum ArmorSubtype { Helmet = 0, Shield = 1 }
```
Extend `IContactEvent` with `partA: PartKind`, `partB: PartKind`, `armorA: ArmorSubtype | null`, `armorB: ArmorSubtype | null`, `dv: number`. Keep the `never`-guard exhaustive-switch discipline if a `kind`-switch is added.

---

### `src/sim/world/entity-store.ts` (MOD — model)

**Analog:** itself. Extend `IUnitXform` (`:23-33`) with `rotation` / `angularVelocity` (D-34):
```typescript
/** 单位位姿组件（D-16：具名接口）。 */
export interface IUnitXform {
    x: number; y: number; vx: number; vy: number;
    // Phase 2 新增（D-34）：Rapier 为真源，此处为只读镜像
    // rotation: number; angularVelocity: number;
}
```
Add a **named** physics-handle component interface (rule #5 — no inline object types): e.g. `IUnitPhysics { body: RigidBodyHandle; parts: ... }`. Extend `IUnitComponents` (`:35-41`) and update `spawn()` (`:99-102`) + `restore()` (`:147-162`) to initialize/copy the new fields. `RigidBodyHandle`/`ColliderHandle` are packed f64 — **serialize as float64, never int32** (RESEARCH §Pattern 5).

---

### `src/sim/world/world.ts` (MOD — aggregate root)

**Analog:** itself. Add one field to `ISimState` (`:16-27`), typed by the new contract interface (never a class name — D-13):
```typescript
export interface ISimState {
    store: IEntityStore;
    clock: ITickClock;
    rng: IRandomStreams;
    commands: ICommandQueue;
    events: IEventLog;
    // Phase 2 新增：physics: IPhysicsWorld;
}
```

---

### `src/sim/battle-sim.ts` (MOD — facade/orchestrator)

**Analog:** itself. The step order is the integration seam (CONTEXT §Integration Points).

**Existing step order to extend** (`src/sim/battle-sim.ts:127-142`):
```typescript
step(): void {
    this.simState.events.clear();
    const cmds = this.simState.commands.drain();
    const rejections = this.simState.commands.drainRejections();
    this.simState.clock.step();
    const tick = this.simState.clock.tick;
    for (const r of rejections) { /* emit Rejected */ }
    this.applyCommands(cmds, tick);
    movementSystem(this.simState, this.cfg.dt);
}
```

**Where Phase 2 slots in** (RESEARCH §System Diagram):
- In `build()` (`:76-84`) construct `new PhysicsWorld(...)` (sync) and add `physics` to the returned `ISimState`.
- In `step()`: after `clock.step()` and `applyCommands`, insert `physics.step(dt)` → `contactBridge.drain(tick)` → mirror → safety-belt clamp. `events.clear()` at the top stays first (contact events must be drained within the same tick they occur).

**Force/Torque routing change** — `applyCommands` currently mutates `xform` directly (`:163-173`):
```typescript
case CommandKind.Force: {
    if (!this.hasUnit(cmd.unit)) { this.rejectUnit(cmd.unit, tick); break; }
    const c = this.simState.store.get(cmd.unit);
    c.xform.vx += cmd.fx;            // ← Phase 2: 改经 Rapier applyImpulse()
    c.xform.vy += cmd.fy;
    this.emitCommand(cmd, tick);
    break;
}
```
Route through `applyImpulse` / `applyTorqueImpulse` so Rapier remains source of truth (RESEARCH §Anti-Patterns: "Mutating `xform` directly for Force/Torque"). Keep the `default: { const unhandled: never = cmd; throw … }` exhaustiveness guard (`:190-198`) intact — it is the project's anti-silent-no-op rule (WR-02).

---

### `src/sim/snapshot.ts` (MOD — serialization) — VERSION 2→3

**Analog:** itself. Preserve the separable `serializeState()` / `fingerprint()` design (`:9-20`) and the `quantize()` int32 guard (`:57-63`).

**Header/version constants to bump** (`src/sim/snapshot.ts:26-43`):
```typescript
export const QUANT_GRID = 256;
const MAGIC = 0x454d5331;
const VERSION = 2;               // ← bump to 3
const HEADER_SIZE = 8;
const STREAM_STATE_BYTES = 16;
const ENTITY_BYTES = 28;         // ← 7×i32 → 9×i32 (add rotation/angularVel) = 36
```
Add `readF64`/`writeF64` helpers (paralleling the `i32`/`u32` closures at `:100-111` and `:163-177`) for the packed-f64 collider handles. Append, after the Phase-1 entity section (`:128-139`), the Rapier bytes + the part-map (RESEARCH §Pattern 5 layout):
```text
rapierLen:u32  rapierBytes:Uint8Array
partMapCount:u32
  per entry: colliderHandle:f64  entityId:i32  part:u8  armorSubtype:u8
```
`deserializeState` (`:157-240`) rebuilds entities → `RAPIER.World.restoreSnapshot(bytes)` → rebuild the part map. **No v2 migration** — the version guard already throws (`:181-183`); keep "本阶段快照不出进程".

---

### `src/sim/content/physics.ts` (NEW) + `src/config/sim.ts` (MOD)

**Analogs:** `src/sim/content/formulas.ts` (pure data module, D-06) and `src/config/sim.ts` (engine constants).

**Content data-module convention** (`src/sim/content/formulas.ts:1-20`) — pure data, **imports nothing**, single source:
```typescript
/**
 * Phase 1 数值常量（数据模块，D-06）。
 * **纯数据**：本文件不导入任何模块（A7）…
 */
export const MOVEMENT_NUDGE_SCALE = 0.05;
```
Put content-driven physics data (test-unit geometry/mass, weapon swing amplitude/angular speed, collision-group bits, armor subtype dims) here as **TS type-safe constants** (no JSON/schema layer this phase). Put engine-level constants (gravity `{0,0}`, restitution ≈ 0, linear/angular damping, map 1000×1000 m, safety-belt bounds) in `src/config/sim.ts` alongside `FIXED_DT` (`src/config/sim.ts:12-25`). Both files must remain DOM-free and import-free respectively.

---

### `package.json` (MOD — config)

**Analog:** itself. Add the dependency **exact-pinned, no `^`** (D-19):
```bash
pnpm add @dimforge/rapier2d-deterministic-compat@0.21.0 --save-exact
```
Mirror existing `package.json:17-29` style (4-space indent, no trailing comma). Note the package-legitimacy gate: RESEARCH §Package Legitimacy Audit flags both Rapier packages `[SUS]` (too-new release) → the plan must place a `checkpoint:human-verify` **before** install.

---

### `tests/helpers/run-physics.ts` (NEW — test helper)

**Analog:** `tests/helpers/run-sim.ts` — copy its structure exactly, add an `await initPhysics()` requirement in the caller's `beforeAll`.

**Runner shape** (`tests/helpers/run-sim.ts:14-53`):
```typescript
export interface IRunTraceOptions { seed: number; ticks: number; }
const FIXED_ENTITY_COUNT = 3;

/**
 * 跑 `ticks` 个固定步，返回逐 tick 指纹轨迹（长度 = `ticks`）。
 * @param options 种子与 tick 数。
 * @returns 逐 tick 的状态指纹轨迹。
 */
export function runTrace({ seed, ticks }: IRunTraceOptions): string[] {
    const sim = new BattleSim(seed);
    for (let i = 0; i < FIXED_ENTITY_COUNT; i++) sim.spawn();
    const trace: string[] = [];
    const recorder = { step(): void { sim.step(); trace.push(sim.fingerprint()); } };
    const tick = runLoop(headlessPump(FIXED_DT), recorder, () => {}, { dt: FIXED_DT, maxFrame: MAX_FRAME, maxSteps: MAX_STEPS });
    for (let i = 0; i < ticks; i++) tick();
    return trace;
}
```
Return **both** the sim trace and the Rapier `takeSnapshot()` hash (D-20 dual gate). Spawn physics-enabled composite units (body+weapon+armor) rather than bare `sim.spawn()` — spawn in ordered id order (`spawnComposite()` per unit).

---

### `tests/determinism/physics-gate.test.ts` (NEW — test, batch)

**Analog:** `tests/determinism/gate.test.ts` (note: `determinism`, not `deterministic`).

**Three-assertion + anti-vacuous structure** (`tests/determinism/gate.test.ts:1-37`):
```typescript
import { describe, expect, it } from 'vitest';
import { runTrace } from '../helpers/run-sim';

describe('determinism gate (SIM-04)', () => {
    it('same seed → identical per-tick fingerprint trace', () => {
        const a = runTrace({ seed: SEED, ticks: TICKS });
        const b = runTrace({ seed: SEED, ticks: TICKS });
        expect(a).toEqual(b);
    });
    // ...different seed → different; trace is not constant
});
```
Add `beforeAll(async () => { await initPhysics(); })` and the D-19/D-20 assertions (version `'0.21.0'`, dual fingerprint, CCD sweep) per RESEARCH §Code Examples.

---

### `tests/sim/physics-composite.test.ts`, `contact.test.ts`, `ccd.test.ts` (NEW — unit tests)

**Analogs:** `tests/sim/entity-store.test.ts` (structure), `tests/sim/snapshot.test.ts` (named-interface test-case pattern).

**Named test-case interface over inline tuples** (`tests/sim/snapshot.test.ts:44-50`) — required by project-locked rule #5:
```typescript
interface IMutatorCase {
    name: string;
    mutate: (sim: IBattleSim) => void;
}
...
it.each(fieldCases)('perturbing $name moves the fingerprint', mutatorCase => { ... });
```
**Extend the mutator census** (`tests/sim/snapshot.test.ts:83-170`) with `xform.rotation` and `xform.angularVelocity` cases so the two new future-affecting fields are proven serialized (each perturbation must move the fingerprint).

---

### `tests/helpers/physics-setup.ts` (NEW) + `vitest.config.ts` (MOD)

**Analog:** `tests/style/conventions.test.ts` header (`/// <reference types="node" />`, Node env) + `vitest.config.ts`.

Add a shared `await initPhysics()` in Vitest `setupFiles` so every physics test file need not repeat it (RESEARCH §Validation Architecture Wave-0 gaps). `vitest.config.ts:1-13` currently sets `environment: 'node'`, `include: ['tests/**/*.test.ts']` — add `setupFiles: ['tests/helpers/physics-setup.ts']`. Keep `environment: 'node'` (D-22, headless).

---

## Shared Patterns

### Interface-first, `I` prefix, numeric enums (project-locked rules #2/#3)
**Source:** every Phase-1 module, e.g. `src/sim/core/clock.ts:4-13`, `src/sim/core/events.ts:18-31`.
**Apply to:** `IPhysicsWorld`, `ICompositeFactory`, `IContactBridge`, `IPartKind`/`IArmorSubtype` enums.
Every class declares `export interface I<ClassName>` and `implements` it; fields/params/returns use the interface type, never `new X()`'s class as a type.

### Ordered iteration only (`store.ids()`)
**Source:** `src/sim/world/entity-store.ts:1-10`, `src/sim/systems/movement.ts:26`.
**Apply to:** body/collider/joint construction, mirroring, safety-belt clamp. Never iterate a `Map`/`Set`/object-key order for anything that affects Rapier's arena order (RESEARCH §Pitfall 3).

### Per-tick event lifecycle
**Source:** `src/sim/battle-sim.ts:128` (`events.clear()` at top) + `src/sim/core/events.ts`.
**Apply to:** ContactBridge — Rapier's `EventQueue` must be drained each tick and translated into `EventLog` within the same tick (no cross-tick attribution drift).

### Commands drained once per tick
**Source:** `src/sim/battle-sim.ts:129` (`commands.drain()`).
**Apply to:** Force/Torque→Rapier impulse mapping — apply inside `applyCommands` only.

### Exhaustiveness guard (`never`) / no silent no-op
**Source:** `src/sim/battle-sim.ts:190-198`.
**Apply to:** any new `CommandKind`/`SimEventKind` switch (new Part/Armor enums if switched on).

### DOM-free headless boundary
**Source:** `tsconfig.sim.json:1-11` + `eslint.config.js:51-119`.
**Apply to:** all new `src/sim/**` modules — no DOM globals, no `node:*`, no `Math.random`/`Date.now`/`performance.now` (D-02 keeps `Math.sin/cos` allowed; Rapier import is not restricted).

### Full Chinese JSDoc on every top-level export
**Source:** `tests/style/conventions.test.ts` (`SCAN_ROOTS = ['src','tests']`, requires `/**` + `@param`/`@returns` on functions).
**Apply to:** every new `.ts` file in `src/` and `tests/`.

---

## No Analog Found

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/sim/world/contact.ts` | adapter/service | event-driven | Partial: the **event target** (`EventLog`) exists, but Phase 1 has **no event-drainer/adapter** to copy. Build from RESEARCH §Pattern 4; emit through the existing `IEventLog.emit()`. |

*(No other gaps: `PhysicsWorld`/`CompositeFactory` are role-matches to `EntityStore`/`Clock`; the Rapier API bodies themselves come from RESEARCH §Pattern 2/4/5, corrected for 0.21.0.)*

---

## Metadata

**Analog search scope:** `src/sim/`, `src/config/`, `src/host/`, `tests/` (all git-tracked; verified `git ls-files` = 24 tracked files, no `.gsd/` capability mirrors).
**Files scanned:** 13 source + 10 test/config files read in full.
**Pattern extraction date:** 2026-10-16
**Model corrections applied:** `capsuleRounded`→`capsule`; Δv from pre-step velocities; `JointData.revolute` 2-anchor; no `TempContactForceEvent.started`; handles are packed f64; `userData` not snapshot-preserved; `tests/determinism` not `tests/deterministic`; no `src/main.tsx`.
