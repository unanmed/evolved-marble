# Architecture Research

**Domain:** Browser-hosted deterministic 2D physics battle-simulation game (simulation-as-training-environment)
**Project:** Evolved Marble (AI 版球球王国) — tactical combat layer, milestone 1
**Researched:** 2026-10-15
**Confidence:** HIGH (core stack & determinism), MEDIUM (AI/BT library choice)

> Scope note: this document is opinionated and prescriptive. It describes **one recommended architecture** for the combat layer, chosen so the future kingdom/economy macro-sim, unit-RL control, and LLM commander/director layers attach **without rewriting the core**. Where the predecessor prototype (`src/`, `model/`) made a choice that caused pain, the anti-pattern is called out explicitly.

---

## Standard Architecture

### System Overview

The system has **five layers with a strictly downward dependency direction**. The critical design rule: the **Simulation Core is headless and deterministic** — it imports nothing from rendering, the DOM, the network, or the wall clock. Everything that observes the sim (renderer, recorder, Python bridge, future LLM director) is a **read-only projection** or a **command source**, never a mutator of sim internals.

```text
┌──────────────────────────────────────────────────────────────────────────────┐
│ ATTACHMENT LAYER  (future milestones — interfaces defined now, empty now)     │
│                                                                               │
│   ┌──────────────────┐   ┌──────────────────┐   ┌──────────────────────┐      │
│   │ Kingdom/Economy  │   │ LLM Commander    │   │ LLM Director         │      │
│   │ (deterministic   │   │ (cloud API,      │   │ (cloud API, camera/  │      │
│   │  macro-sim)      │   │  async driver)   │   │  narration)          │      │
│   └────────┬─────────┘   └────────┬─────────┘   └──────────┬───────────┘      │
│            │ ArmyCommand          │ UnitCommand            │ CameraDirective  │
├────────────┴──────────────────────┴────────────────────────┴──────────────────┤
│ DRIVER LAYER   (control sources — produce Commands, never touch sim internals) │
│                                                                               │
│   LocalInputDriver    PythonRLDriver(WS)    KingdomDriver(future)             │
│            │                 │                     │                          │
│            └────────► CommandQueue (drained once per sim tick) ◄──────────────┘ │
├───────────────────────────────────────────────────────────────────────────────┤
│ SIMULATION CORE   (headless · deterministic · no DOM/WebGL/WebSocket/clock)    │
│                                                                               │
│   TickClock ─► BattleSim.step()                                               │
│     ├── PhysicsWorld   (Rapier2D World, EventQueue, fixed dt)                 │
│     ├── EntityStore    (ECS-lite: component structs keyed by stable entityId) │
│     ├── AISystem       (behavior trees, ticked every 6th sim tick = 0.1 s)    │
│     ├── CombatSystem   (damage, armor reduction, XP/level-up)                 │
│     ├── MovementSystem (forces/torque, speed caps)                            │
│     ├── LifecycleSystem(death, spawn, composite-body lifecycle)               │
│     ├── RandomStreams  (seeded mulberry32/sfc32, serializable state)         │
│     └── EventLog       (typed per-tick events: damage, kill, levelup, contact)│
│            │                                                                   │
│            └──► snapshot() ── events() ── stateView()   (read-only outputs)    │
├───────────────────────────────────────────────────────────────────────────────┤
│ PRESENTATION LAYER   (read-only projection of sim state)                      │
│                                                                               │
│   SceneRenderer(PixiJS)   CameraDirector   HUD/Overlay   InterpolationBuffer  │
├───────────────────────────────────────────────────────────────────────────────┤
│ HOST / TRANSPORT LAYER   (pacing, I/O, recording, cross-language bridge)      │
│                                                                               │
│   SimLoop(accumulator)   Bridge(WS + envelope)   FrameSink(recorder)   Config │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Key characteristics:**

- **One-way dependency flow.** `sim/` ← `driver/`, `render/`, `host/`. The core has **no imports from any higher layer**. This is the single most important structural decision and the direct fix for the predecessor's "scene owns physics *and* rendering *and* the training loop" tangle.
- **Two clocks, one truth.** The *simulation clock* is a fixed-step tick counter (deterministic, headless-capable). The *display clock* is `requestAnimationFrame`. They are reconciled only in the host loop via an accumulator + interpolation. The sim never reads `performance.now()`.
- **Commands in, events out.** External control (player, Python RL, future LLM/kingdom) enters as a `Command[]` drained **once per sim tick**. Everything the outside world learns about the sim comes from `EventLog` (typed events) and `snapshot()` / `stateView()` (read-only). No outside code holds a mutable reference to a component struct or a Rapier handle.
- **Determinism is an architectural property, not a feature.** Same seed + same command log + same build ⇒ bit-identical world. The core enforces it structurally: seeded RNG only, deterministic math only, ordered iteration only, no clock/entropy reads.

### Component Responsibilities

| Component | Layer | Responsibility | Typical Implementation |
|-----------|-------|----------------|------------------------|
| `TickClock` | sim/core | Owns the fixed `dt` and monotonic `tick` counter; advances only via `step()`; never reads wall time | A tiny class: `dt`, `tick`, `step()`; `alpha` for render interpolation computed by the host, not the sim |
| `RandomStreams` | sim/core | Named seeded PRNG streams (spawn variance, damage roll, BT tie-breaks); serializable/rewindable state | `mulberry32`/`sfc32` with `save()`/`restore()`; one stream per concern |
| `deterministic math` | sim/core | Replace platform `Math.sin/cos/tan/atan2` where values feed sim state | Small pure-TS libm subset, or `capMath`-style swaps; document banned functions |
| `PhysicsWorld` | sim/world | Wrap a Rapier2D `World` + `EventQueue`; fixed-step only; owns body/collider/joint handles ↔ `entityId` maps | `@dimforge/rapier2d`; deterministic construction & add/remove order |
| `EntityStore` | sim/world | ECS-lite storage of unit components (attrs, transform, equipment, AI blackboard refs) keyed by stable `entityId` | Component structs + parallel arrays; systems iterate in `entityId` order |
| `CompositeFactory` | sim/world | Assemble a unit as **one rigid body with multiple colliders** (body + weapon + armor) and joints | Multi-collider body; revolute joint + motor for swinging weapons |
| `ContactBridge` | sim/world | Translate Rapier collider handles → `(entityId, bodyPart)`; drain collision/contact-force/intersection events into the sim's `EventLog` | `surfaceCollider ↔ {entityId, part}`; `drainContactForceEvents` after `world.step` |
| `AISystem` | sim/systems | Tick behavior trees on the 0.1 s cadence; build blackboards from vision; emit `UnitCommand`s | Behavior tree per unit, seeded RNG, pure tick |
| `VisionSystem` | sim/systems | 64-ray obstacle scan + projectile/unit proximity (≤50 m) per spec; nearest-16 friend/foe lists | Rapier ray casts / scene queries; capped + quantized to 50 m |
| `CombatSystem` | sim/systems | Damage formula, armor reduction, contact-force→Δv, XP award, level-up | Reads contact-force events; writes `EventLog` |
| `MovementSystem` | sim/systems | Apply forces/torque from `UnitCommand`; speed caps; wraparound/edge bounce | Rapier `applyImpulse`/`addForce` |
| `LifecycleSystem` | sim/systems | Death/spawn/level-up side effects; composite body create/destroy in stable order | Ordered `spawn()/despawn()` queues |
| `EventLog` | sim | Typed per-tick event buffer (damage, kill, levelup, contact, battleStart/End) | Ring/array cleared each tick; consumers get copies |
| `BattleSim` | sim | **Facade**: `reset(seed, scenario)`, `submit(commands)`, `step()`, `events()`, `snapshot()`, `stateView()` | The only surface `driver/`, `render/`, `host/` may import |
| `Scenario` / `content` | sim/content | Data-only definitions: classes, weapons, armor, formulas constants (from the spec doc) | Validated JSON/TS objects; no logic |
| `CommandQueue` | driver | Collect `Command`s from all drivers; drained once per sim tick | Bounded queue; stable ordering |
| `LocalInputDriver` | driver | Keyboard/mouse → `UnitCommand`/camera directives (watch mode) | Transient, not part of determinism contract unless recorded |
| `PythonRLDriver` | driver | Convert bridge action vectors → `UnitCommand`s; convert `stateView()` → observations | Uses `ObservationEncoder` |
| `SceneRenderer` | render | Read `stateView(snapshotA, snapshotB, alpha)`, interpolate, update PixiJS display objects | PixiJS `Container/Graphics/Sprite`; **the only place drawing happens** |
| `InterpolationBuffer` | render | Hold previous+current sim snapshots; expose interpolated transform at `alpha` | Read-only; never mutates sim |
| `CameraDirector` | render | Select viewport/focus (ties into future LLM director) | Consumes camera directives + events |
| `SimLoop` | host | Pacing: accumulate wall time → N fixed `step()`s → one interpolated render; headless/unthrottled pump for training | The Gaffer "Fix Your Timestep" loop, generalized to swappable pumps |
| `Bridge` | host | WebSocket transport: envelope encode/decode, correlation, versioning, backpressure, reconnect/cleanup | `envelope.ts` (zod) + `client.ts` |
| `FrameSink` | host | Capture rendered/ticked frames → video frames | `ffmpeg` sink (WS) and/or WebCodecs `VideoEncoder`; chosen by config |
| `Config` | config | Typed, schema-validated runtime config (ports, tick rate, intervals, paths, viewport) | zod schema, single source of truth; no magic constants |
| Python `bridge.py` | python | Correlated WS client mirroring the envelope; request/response futures, timeouts | zod envelope mirrored with pydantic |
| Python `env.py` | python | PettingZoo `ParallelEnv` over the bridge | Observation/action space mapping |
| Python `train.py` | python | RLlib PPO driver | Consumes `env.py` |
| Python `recorder.py` | python | Receive frames → `ffmpeg` | Same encoder as before, but fed from a `FrameSink` protocol |

### Recommended Project Structure

```text
src/
├── sim/                     # Deterministic, headless core. NO imports from render/host/driver.
│   ├── core/
│   │   ├── clock.ts         # TickClock (fixed dt, tick counter)
│   │   ├── rng.ts           # seeded streams, save/restore
│   │   ├── math.ts          # deterministic math subset + banned-API lint rules
│   │   └── events.ts        # EventLog + typed event union
│   ├── world/
│   │   ├── physics.ts       # Rapier World/EventQueue wrapper, fixed step
│   │   ├── entity-store.ts  # ECS-lite component structs keyed by entityId
│   │   ├── composite.ts     # unit = body + multiple colliders + joints
│   │   └── contact.ts       # collider handle ↔ (entityId, part) bridge
│   ├── systems/
│   │   ├── ai.ts            # behavior-tree tick on 0.1 s cadence
│   │   ├── vision.ts        # 64-ray scans, nearest-16 queries
│   │   ├── combat.ts        # damage / armor / XP / level-up
│   │   ├── movement.ts
│   │   └── lifecycle.ts     # spawn/despawn/death in stable order
│   ├── ai/
│   │   ├── trees/           # behavior tree definitions (JSON/MDSL or builder)
│   │   └── blackboard.ts    # per-unit blackboard shape
│   ├── content/             # data-only: classes.ts, weapons.ts, armor.ts, formulas.ts
│   ├── commands.ts          # Command union (the driver→sim contract)
│   ├── snapshot.ts          # serialize/deserialize + fingerprint (state hash)
│   └── battle-sim.ts        # BattleSim facade (the ONLY public sim surface)
├── driver/
│   ├── command-queue.ts
│   ├── local-input.ts
│   └── rl-driver.ts         # + observation-encoder.ts
├── render/
│   ├── app.ts               # PixiJS async init; renderer only (autoStart:false)
│   ├── scene-renderer.ts
│   ├── interpolation.ts
│   ├── camera.ts
│   └── hud.ts
├── host/
│   ├── loop.ts              # fixed-step accumulator; pumps: raf | headless | fixed-fps
│   ├── bridge/
│   │   ├── envelope.ts      # zod discriminated union + PROTOCOL_VERSION
│   │   ├── client.ts        # correlation, timeouts, backpressure, cleanup
│   │   └── handlers.ts      # reset / step / save / load / hello
│   └── recorder/
│       ├── frame-sink.ts    # interface
│       ├── ffmpeg-sink.ts   # WS → Python ffmpeg
│       └── webcodecs-sink.ts
├── config/
│   └── schema.ts            # zod runtime config; loaded once; no constants elsewhere
└── main.ts                  # composition root: builds sim, driver, renderer, loop, bridge

model/                       # Python
├── bridge.py                # correlated WS client (mirrors envelope)
├── schema.py                # pydantic envelope mirror
├── env.py                   # PettingZoo env
├── recorder.py              # ffmpeg frame sink
└── train.py                 # RLlib driver
```

### Structure Rationale

- **`sim/` has zero upward imports.** This is enforceable with an ESLint `no-restricted-imports` rule (`sim/**` may not import `render/**`, `host/**`, `driver/**`, `pixi.js`, or any browser global). It is the structural guarantee of determinism and headless testability.
- **`host/loop.ts` owns pacing, not `sim/`.** The sim exposes exactly one advance primitive (`step()`); whether it is called 60×/s from `rAF`, as fast as possible for training, or one tick per captured frame for video is a host concern. This is what makes the same core serve "watch", "train", and "record" without branching inside the sim.
- **`content/` is data, not code.** All the class/weapon/armor numbers from the authoritative spec live in one validated data module, so "数值需要实测" (numbers need empirical calibration) is a data edit, not a code change — and so the same numbers can be fed to the kingdom layer later.
- **`commands.ts` is the single control contract.** Every present and future driver speaks it. Adding the kingdom layer means adding a `KingdomDriver` that emits the *same* `Command`s, not a new path into the sim.
- **Python `schema.py` mirrors the TS envelope.** The bridge schema is duplicated by necessity across languages; the mitigation is a single normative spec (zod) plus a pydantic mirror, and a `hello` handshake that compares a schema hash so drift fails loudly at connect time instead of silently mid-run.

---

## Architectural Patterns

### Pattern 1: Fixed-step deterministic clock, decoupled from the render frame

**What:** The canonical accumulator loop. Wall time is accumulated; the sim is advanced in whole `dt` steps; rendering happens once per display frame against an interpolation between the two most recent sim snapshots.

**When to use:** Always, in this project. It is the foundation for determinism, for training throughput (run the sim unthrottled, no `rAF`), and for frame-accurate video.

**Trade-offs:** Adds a one-tick render latency and needs a "previous snapshot" buffer. Interpolation (not extrapolation) is correct here: it never invents an unphysical state. The spiral-of-death must be guarded by clamping incoming frame time and capping steps-per-frame.

```typescript
// host/loop.ts — pacing only; contains no game logic
const DT = 1 / 60;              // fixed sim step (seconds) — from Config
const MAX_FRAME = 0.25;         // spiral-of-death clamp
const MAX_STEPS = 5;            // hard cap per frame

export function runLoop(pump: () => number, sim: BattleSim, render: (alpha: number) => void) {
  let acc = 0;
  return () => {
    let frame = Math.min(pump(), MAX_FRAME);   // raf delta | fixed budget | Infinity for headless
    acc += frame;
    let steps = 0;
    while (acc >= DT && steps < MAX_STEPS) {
      sim.step();                               // fixed dt; reads ONLY commands + RNG
      acc -= DT;
      steps++;
    }
    if (steps === MAX_STEPS) acc = 0;           // drop debt; never accumulate a spiral
    render(acc / DT);                           // alpha in [0,1) for interpolation
  };
}
```

**Three pumps, one core:**

| Pump | Used by | Behavior |
|------|---------|----------|
| `rafPump` | watch mode | returns real frame delta from `performance.now()` (host-only; never entered into sim) |
| `headlessPump` | training | returns `Infinity`/large budget → steps as fast as the budget allows; no render |
| `fixedFpsPump` | recording | returns exactly `1/recordFps` per iteration → one deterministic frame cadence |

### Pattern 2: Commands are sampled once per tick, at the boundary

**What:** Input from every driver (player, RL, later LLM/kingdom) is collected into a `CommandQueue` and drained **once at the start of a sim step**, then applied as data. The sim never polls a device, a socket, or a clock; it only reads commands already submitted for that tick.

**When to use:** Always. This is what makes a run reproducible from a recorded command log and what lets the timing of a network/LLM driver vary without breaking determinism.

**Trade-offs:** Requires a tick-alignment rule: a command either belongs to tick N or the next available tick; a driver that is late is skipped for that tick (documented, deterministic). Adds a small latency for async drivers (RL/LLM), which is acceptable.

```typescript
// sim/commands.ts
export type Command =
  | { kind: 'force';   unit: EntityId; fx: number; fy: number; applyAtTick: number }
  | { kind: 'torque';  unit: EntityId; amount: number; applyAtTick: number }
  | { kind: 'ability'; unit: EntityId; ability: AbilityId; applyAtTick: number }
  | { kind: 'spawn';   unit: EntityId; classId: ClassId; pos: Vec2 }        // kingdom layer
  | { kind: 'armyOrder'; army: ArmyId; order: ArmyOrder }                   // kingdom layer (future)
  ;
```

### Pattern 3: Composite units = one rigid body, multiple colliders (+ joint for weapons)

**What:** A unit is **one dynamic rigid body** carrying several colliders: the body (circle/capsule), the weapon(s), and the armor piece(s). Rapier's own guidance is that attaching multiple colliders to a single body behaves like a compound shape but is **more efficient and numerically stable than joining separate bodies with fixed joints**. Weapon swing is modeled with a **revolute joint + motor** (2D) rather than teleporting the weapon; the joint anchors the weapon to the hand and a motor drives the swing.

**When to use:** Every unit. This directly implements the spec's "单位本体 + 武器 + 防具" composite.

**Trade-offs:** You must maintain a `collider → (entityId, part)` map so contact events can name *which part* was hit (crucial: the damage formula only reduces damage when the hit lands on armor). Rapier's `Compound` shape exists in `@dimforge/rapier2d` if a single-collider compound is ever needed, but for part-aware events you want **separate colliders** so each has its own handle.

```typescript
// sim/world/composite.ts
import RAPIER from '@dimforge/rapier2d';

export function spawnUnit(world: RAPIER.World, def: UnitDef, pos: Vec2): UnitHandles {
  const body = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic().setTranslation(pos.x, pos.y));

  const bodyCol = world.createCollider(
    RAPIER.ColliderDesc.ball(def.radius).setMass(def.mass)
      .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS | RAPIER.ActiveEvents.CONTACT_FORCE_EVENTS)
      .setContactForceEventThreshold(def.impactThreshold),
    body,
  );
  // Weapon + armor colliders belong to the same body; each maps to a "part".
  const weaponCol = world.createCollider(RAPIER.ColliderDesc.capsule(def.weapon.len / 2, 0.05), body);
  const armorCol  = world.createCollider(RAPIER.ColliderDesc.capsuleRounded(def.armor.len / 2, 0.08), body);

  // Optional: a real swing — a separate weapon body + revolute joint with a motor.
  const weaponBody = world.createRigidBody(RAPIER.RigidBodyDesc.dynamic());
  const weaponBodyCol = world.createCollider(RAPIER.ColliderDesc.capsule(def.weapon.len / 2, 0.05), weaponBody);
  const jointDesc = RAPIER.JointData.revolute({ x: 0, y: 0 }, { x: 0, y: -def.weapon.len }, { x: 0, y: 1 });
  const joint = world.createImpulseJoint(jointDesc, body, weaponBody, true) as RAPIER.RevoluteImpulseJoint;
  joint.configureMotorVelocity(0, 1.0); // driven by CombatSystem on ability use

  return { body, bodyCol, weaponCol, armorCol, weaponBody, weaponBodyCol, joint };
}
```

### Pattern 4: ECS-lite component store — not OOP inheritance, not a full ECS framework

**What:** Model units as an **`entityId` → component struct** store with systems as pure functions over component slices. Not classic OOP (`Unit extends Body extends …`, a class per class), and not a heavyweight archetype ECS either.

**Why this and not OOP:** The predecessor died on exactly this. `src/body/role.ts` was a `Role` base class whose methods all threw `Method not implemented.`, and `BodyBase`/`MapBase` were built but bypassed by a scene that bound a raw `planck-js` `World` directly. Class hierarchies for composite, equipment-bearing units create brittle inheritance (`Swordsman extends Melee extends Unit`) and stub layers nobody wires up. Component structs let a unit be *data* — which is also what the RL layer wants (read/write mass state cheaply, vectorize observations).

**Why not a full ECS library:** With ~10–30 units/side, archetype storage, query caching, and change detection are pure overhead and obscure determinism (iteration order must be *explicit*, not whatever an archetype table yields). Rapier already holds the heavy per-body data. A "lite" store gives you the determinism and the data-oriented read patterns without the framework.

**Trade-offs:** You must **enforce a stable iteration order** yourself (iterate by `entityId` or a stable array index). Never iterate a `Map`/`Set`/object key order for sim logic. Systems must be written to declare what they read/write so the update order is explicit and testable.

```typescript
// sim/world/entity-store.ts — components are plain structs; iteration is ordered
export interface Components {
  attrs:   Map<EntityId, UnitAttrs>;   // hp, level, xp, attack, defense, mass, class…
  xform:   Map<EntityId, Transform>;   // pos, rot, vel, angVel (mirrored from Rapier each tick)
  equip:   Map<EntityId, Equipment>;   // weaponId, armorId, ratios
  ai:      Map<EntityId, AIState>;     // bt instance id, next-act tick, blackboard
  faction: Map<EntityId, FactionId>;
}

/** Deterministic system ordering; each system is a pure-ish function over the store. */
export const SYSTEM_ORDER = [
  'vision', 'ai', 'movement', 'physics', 'contact', 'combat', 'lifecycle',
] as const;
```

### Pattern 5: Behavior-tree AI ticked on the 0.1 s cadence, with a blackboard built from vision

**What:** Each unit's decision-making is a **behavior tree**, ticked every 6th sim tick (= 0.1 s per the spec: "AI 会每 6 帧进行一次操控"). The blackboard is assembled from the spec's exact inputs — self attributes, own position, the 64-ray obstacle scan and projectile/unit proximity (capped at 50 m), and the nearest-16 enemy / nearest-16 friendly summaries. The tree's *output* is a `UnitCommand` (forces, torque, weapon ability, self ability) — neither the tree nor the systems reach into rendering.

**When to use:** All unit AI in milestone 1. It is explicitly the stand-in for the future RL policy; the `AISystem` interface is written so an RL policy can be substituted per-unit by `control_level` (the spec's "控制等级").

**Trade-offs:** Behavior trees must be **deterministic**: seed any random choice (target tie-breaks, wander) from the sim's `RandomStreams`, not from `Math.random()`. Prefer a library that accepts an injected RNG (mistreevous exposes a seedable RNG) or build a small in-house tree; either way the tick must be pure and the tree instance must live in sim state (serializable) so snapshots/replays round-trip.

```typescript
// sim/systems/ai.ts
const AI_INTERVAL = 6; // sim ticks; 0.1 s at DT=1/60 (spec §AI 控制)

export function runAI(sim: SimState, events: EventLog) {
  if (sim.clock.tick % AI_INTERVAL !== 0) return;
  for (const id of orderedEntityIds(sim)) {           // STABLE order — never Set/Object
    const bb = buildBlackboard(sim, id, sim.rng.stream('ai'));
    const cmd = sim.ai.trees.tick(id, bb);            // seeded, pure; returns UnitCommand | null
    if (cmd) sim.commands.submit(cmd);                // applied on a later tick, deterministically
  }
}
```
### Pattern 6: Rapier contact events → the sim's typed EventLog

**What:** The physics world is stepped with an `EventQueue`; after each step, the `ContactBridge` drains collision, contact-force, and intersection (sensor) events and translates collider handles into `(entityId, part)` pairs, appending typed events to the sim's `EventLog`. Collision events flag start/stop of intersection; **contact-force events** carry the force magnitude/direction after the solver and are gated by a per-collider threshold — this is the natural trigger for melee damage so low-force touches do not damage.

**When to use:** Every physics step. This is the only place Rapier events are read.

**Trade-offs:** `drainCollisionEvents` fires on intersection *transitions*, not per-contact — so for the damage formula (which depends on the **normal velocity difference** Δv), you read the manifold/contact normal via `world.contactPair(c1, c2, (manifold) => …)` rather than relying on the event alone. Set `ActiveEvents.COLLISION_EVENTS | CONTACT_FORCE_EVENTS` on the colliders that matter and a `setContactForceEventThreshold` so the event stream is meaningful, not noisy.

```typescript
// sim/world/contact.ts
const eventQueue = new RAPIER.EventQueue(true);
world.step(eventQueue); // fixed dt set on the world

eventQueue.drainCollisionEvents((h1, h2, started) => {
  const a = lookup(h1), b = lookup(h2);           // → { entityId, part } | null
  if (!a || !b) return;                            // decorative/static colliders ignored
  if (!started) return;
  world.contactPair(a.collider, b.collider, (manifold) => {
    const dv = normalRelativeSpeed(manifold);      // Δv for the damage formula
    eventLog.push({ type: 'contact', attacker: a, victim: b, dv, tick });
  });
});

eventQueue.drainContactForceEvents(ev => {
  const a = lookup(ev.collider1()), b = lookup(ev.collider2());
  if (!a || !b) return;
  eventLog.push({ type: 'impact', a, b, magnitude: ev.totalForceMagnitude(), tick });
});
```

### Pattern 7: State fingerprint + snapshot — the determinism gate and the RL reset primitive

**What:** `fingerprint(state)` produces a hash of the deterministic world (positions, velocities, attrs, tick, RNG states). `snapshot()`/`restore()` serialize the full sim (Rapier world snapshot + ECS stores + RNG states + EventLog cursor). A test runs the same seed + command log twice and asserts identical fingerprints at every tick. RL uses snapshot/restore for cheap episode resets instead of rebuilding the world.

**When to use:** In CI on every commit (determinism regression), and in the RL driver for resets.

**Trade-offs:** Rapier is cross-platform deterministic, but **only if initial conditions match and construction/insertion order is identical**, and only if the values fed in are themselves deterministic. So the fingerprint must cover the RNG state and the *ordered* entity list, and `restore()` must recreate bodies in the exact original order (or use Rapier's own snapshot, which preserves internal order).

```typescript
// sim/snapshot.ts
export function fingerprint(s: SimState): string {
  const h = blake3();                       // any stable hash
  h.update(String(s.clock.tick));
  for (const id of orderedEntityIds(s)) {   // ordered, not Map order
    const t = s.xform.get(id)!, a = s.attrs.get(id)!;
    h.update(id + ':' + [t.x, t.y, t.rot, t.vx, t.vy, a.hp, a.level].join(','));
  }
  for (const name of s.rng.streamNames()) h.update(name + ':' + s.rng.state(name));
  return h.digest();
}

export function snapbar(s: SimState): Snapshot { return { physics: s.world.takeSnapshot(), store: clone(s.store), rng: s.rng.save(), tick: s.clock.tick }; }
export function restore(s: SimState, snap: Snapshot) { /* restore in original order */ }
```

### Pattern 8: Cross-language bridge — typed envelope with correlation, version, and backpressure

**What:** A small, explicit application protocol on top of the WebSocket. Every frame is an envelope with a **protocol version**, a **kind** (`req`/`res`/`push`), a **correlation id**, and a typed payload. Requests come from Python; responses echo the id; the browser may also `push` events/telemetry. Backpressure is handled with bounded queues and a max-in-flight limit; disconnects clean up pending futures.

**When to use:** All sim↔Python traffic. This is the direct fix for the predecessor's untyped `{type, data}` protocol with "the next inbound message is the reply" (`model/ws.py` `send_and_receive`), which desynchronized permanently on any stray/late message.

**Trade-offs:** The envelope must be duplicated in TS and Python; mitigate with one normative zod schema + a pydantic mirror + a `hello` handshake that compares a schema hash. Version negotiation at handshake lets the two sides refuse incompatible builds instead of corrupting training.

```typescript
// host/bridge/envelope.ts
import { z } from 'zod';
export const PROTOCOL_VERSION = 1;
export const MAX_FRAME_BYTES = 64 * 1024;
const Meta = z.object({ tc: z.record(z.string()).optional(), ts: z.number().int().optional() });
const WireError = z.object({ code: z.enum(['invalid','not_found','forbidden','conflict','rate_limited','unavailable','internal']), message: z.string(), retryable: z.boolean() });
export const Envelope = z.discriminatedUnion('kind', [
  z.object({ v: z.literal(PROTOCOL_VERSION), kind: z.literal('req'),  type: z.string(), id: z.string(), meta: Meta.optional(), data: z.unknown() }),
  z.object({ v: z.literal(PROTOCOL_VERSION), kind: z.literal('res'),  re: z.string(), ok: z.boolean(), data: z.unknown().optional(), error: WireError.optional() }),
  z.object({ v: z.literal(PROTOCOL_VERSION), kind: z.literal('push'), type: z.string(), stream: z.string().optional(), seq: z.number().int().nonnegative().optional(), data: z.unknown() }),
]);
```

**Message kinds:**

| Kind | Direction | Purpose | Examples |
|------|-----------|---------|----------|
| `req` | Python → browser | wants exactly one `res` | `hello`, `reset`, `step`, `save`, `snapshot` |
| `res` | browser → Python | answers one `req` (`re` = request id) | observation+reward, snapshot bytes, ack |
| `push` | browser → Python | unprompted, ordered or ephemeral | `impact`, `kill`, `battleEnd`, `frame` (recording), `telemetry` |

**Correlation & ordering rules:**
- Python assigns a monotonic `id` per connection; keeps `Map<id, pendingFuture>`.
- Browser's `res` **must** echo `re: id`. A `res` whose `re` is unknown is dropped + counted (never mis-paired). This eliminates the predecessor's desync class of bug.
- Ordered `push` streams carry a per-stream `seq`; the client detects gaps and requests a resync. Ephemeral pushes (telemetry, cursor) carry no `seq` and may be coalesced.
- The `step` reply includes `tick` and `fingerprint` so Python can assert the browser is where it thinks it is.

**Backpressure & lifecycle:**
- Bounded inbound queue and bounded outbound `sendQueue`; `maxInFlight` (e.g. 256) requests. When full, the browser *stops accepting* new `step` requests and the driver waits — it does **not** buffer unboundedly (the predecessor used unbounded `Queue()`).
- Every request has a timeout; a dropped/timeout request resolves to a typed error (`unavailable`/`retryable`), not a hang.
- On `close`/`error`: reject all pending futures, discard queued frames, and — server-side — remove the connection from the registry (the predecessor's `is_connected()` never went false and its `send_queue` leaked across reconnects).
- Bind to `127.0.0.1` by default (the predecessor bound `0.0.0.0` with no auth).
- A periodic heartbeat (`ping`/`pong` push) detects half-open sockets.

---

## Data Flow

### Flow 1 — Watch mode (browser only)

```
rAF tick
  └─ host/loop: accumulate real dt
       └─ while acc >= DT:  BattleSim.step()            (sim: commands → physics → events)
       └─ render(alpha):    SceneRenderer reads stateView(prev, cur, alpha)
                            InterpolationBuffer lerps transforms → PixiJS stage → GPU
       └─ CameraDirector.update(stateView, events)      (camera easing; future LLM directives)
```

The sim advances by fixed `DT`; rendering is a pure projection with no ability to change sim state.

### Flow 2 — Training step (Python-driven, browser is the environment)

```
Python train.py (RLlib PPO)
  └─ env.step(action)
       └─ bridge.py: send req{type:'step', id:k, data:{actions}}
            │  (bounded queue; max-in-flight; timeout)
            ▼
        Browser Bridge.onMessage
          └─ handlers.step(): decode+validate (zod) → RLDriver.toCommands(actions)
               └─ CommandQueue.submit(...)                (drained next tick)
               └─ run fixed steps (headlessPump) until action cadence boundary
                    └─ BattleSim.step()  →  events, state
               └─ ObservationEncoder.from(stateView, events) → obs, reward, term, trunc
          └─ Bridge.send res{re:k, ok:true, data:{obs, reward, terminated, truncated, tick, fingerprint}}
            ▼
       bridge.py: resolve pending future k  →  numpy float32  →  RLlib
```

Action cadence follows the spec: the RL policy acts on the same 0.1 s boundary (every 6 sim ticks) as the rule-AI. Because the sim core is agnostic to *who* produced the command, RL and rule-AI are interchangeable per unit via `control_level`.

### Flow 3 — New episode / reset

```
Python: req{type:'reset', id, data:{seed}}
  → handlers.reset(): 
       sim.reset(seed, scenario)      # recreate in ORIGINAL order for determinism
       rng reseed; EventLog cleared; frame counters reset
  → res{re:id, data:{obs, info:{tick:0, fingerprint}}}
Python asserts info.fingerprint matches its expectation for that seed (optional determinism check)
```

### Flow 4 — Save / resume

```
Python: req{save}  → browser returns sim.snapshot() (bytes, base64) + fingerprint  → Python persists
Python: req{load, data:snapshot} → browser restore(sim, snapshot) → returns post-restore fingerprint
                (Python verifies the restored fingerprint equals the saved one — round-trip guarantee)
```

### Flow 5 — Video recording (frame-addressable)

```
Recording run uses fixedFpsPump: 1 tick-cadence per output frame
  loop iteration:
    step sim to the next capture boundary (may be N sim ticks per output frame)
    render(alpha = 0)                     # deterministic: no interpolation jitter
    FrameSink.capture(renderer.canvas)    # OffscreenCanvas → encoded frame
      ├─ ffmpegSink: WS push{type:'frame', seq} → Python ffmpeg (proven path)
      └─ webcodecsSink: VideoEncoder (H.264/VP9) → muxed file (Chrome-only, ok)
```

### Flow 6 — Future kingdom/economy layer (attach without core rewrite)

```
KingdomSim (its own deterministic fixed-step subsystem, 1 tick = 1 game-minute)
  └─ observes BattleSim events (battleStart/End, army positions, city ownership) as read-only input
  └─ emits ArmyCommand / SpawnCommand   ─┐
                                         ├─► SAME CommandQueue ─► BattleSim.step()
LLM Commander (async, cloud):            │
  └─ reads text view + snapshots (God's-eye or faction-limited) via the SAME Bridge push/res stream
  └─ emits ArmyCommand (arrives on a later tick; late is skipped deterministically)

LLM Director (async, cloud):
  └─ reads events + snapshots/pushes
  └─ emits CameraDirective → CameraDirector (presentation layer only — never sim state)
```

### Key Data Flows (summary)

1. **Command flow (inward):** driver → `CommandQueue` → drained once/tick → systems. One-way; the sim never calls back into a driver.
2. **Event flow (outward):** systems → `EventLog` (typed, per-tick) → renderer (VFX/HUD), bridge (`push`), kingdom sim, director. Consumers get **copies**, not live handles.
3. **State flow (outward read-only):** `stateView()`/`snapshot()` → `InterpolationBuffer` → renderer, and → `ObservationEncoder` → bridge. Never a mutable reference into the store.
4. **Determinism flow:** `seed` + command log → identical `fingerprint` sequence. Asserted in CI and on save/load round-trips.

### State Management

There is **no reactive store in the sim**. Sim state is plain structs behind the `BattleSim` facade; it changes only inside `step()`. The renderer holds only an interpolation buffer (prev/cur transforms) and display objects. There is **no `shallowReactive` mirror of sim state** (the predecessor piped display state through a Vue reactive object every tick). The HUD instead reads `stateView()` on demand. Cross-process state is synchronized only through `snapshot()`/`restore()` and the envelope.
## Determinism Strategy (the contract the whole design serves)

Rapier's JS/WASM build is **fully cross-platform deterministic** — no build flag is needed (unlike Rust's `enhanced-determinism`). Running the same simulation, with the same initial conditions, the same Rapier version, and identical build/insertion order yields bit-identical results across browsers, OSes, and CPUs; `world.takeSnapshot()` hashes match exactly. **But** the engine only guarantees determinism of what is fed to it. The following rules are therefore architectural invariants, enforced by review + lint + CI, not conventions:

| Rule | Why | Enforcement |
|------|-----|-------------|
| Only fixed-step `world.step(dt)` with a constant `dt` | variable dt makes physics path-dependent across machines | `PhysicsWorld` exposes only `step()`; dt comes from `Config` |
| Deterministic construction & **add/remove order** | Rapier requires identical body/collider/joint construction and insertion order | `LifecycleSystem` spawns/despawns from an ordered queue; `restore()` rebuilds in original order |
| No `Math.random()` in `sim/` | unseeded entropy diverges immediately | lint `no-restricted-properties`; ESLint boundary rule |
| No `Date.now()`/`performance.now()` in `sim/` | wall-clock reads break replay/rollback | lint + code review; time is `TickClock.tick` |
| No platform transcendentals (`Math.sin/cos/tan/atan2`) on values that feed sim state | libm is not cross-platform deterministic | `sim/core/math.ts` is the sanctioned trig source; lint bans direct calls in `sim/` |
| Seeded streams only (`mulberry32`/`sfc32`), state serializable | replay/rollback must reproduce the exact number sequence | `RandomStreams` with `save()`/`restore()`; one stream per concern |
| Ordered iteration only (arrays / insertion-ordered; never `Set` or object-key order) | iteration order is part of the result | `orderedEntityIds()` helper; review rule |
| Commands sampled once per tick | external timing must not enter the step | `CommandQueue` drained at step start |
| `sim/` imports no browser/DOM/WebGL/network API | headless testability + no hidden state | ESLint `no-restricted-imports` on `sim/**` |

**Verification gate (put in CI from phase 1):** run `scenario` with `seed=S` and a recorded command log twice; assert `fingerprint(tick)` is identical for all ticks. Add a **cross-run snapshot hash** test (`takeSnapshot()` MD5) that mirrors Rapier's own documented determinism check. Also assert `fingerprint(restore(snapshot)) === fingerprint(snapshot)` — this catches state that determinism depends on but that `snapshot()` forgot to serialize.

**Banned-in-sim cheat-sheet** (print this above the sim directory):

```
✗ Math.random()   ✗ Date.now()   ✗ performance.now()   ✗ new Date()
✗ Math.sin/cos/tan/atan2/pow     (use sim/core/math.ts)
✗ Set/Object-key iteration for logic     ✗ reading input devices directly
✗ DOM / window / document / pixi.js / WebSocket inside sim/
✓ TickClock.tick   ✓ RandomStreams   ✓ CommandQueue   ✓ ordered arrays
```

---

## Video Capture Architecture

Recording is a **host concern**, not a sim or render concern. The sim exposes fixed ticks; the renderer produces frames; a `FrameSink` turns frames into a video. Because a recording run must be **reproducible and frame-addressable** (the product is "可以出片的模拟录像"), the recommended model is **deterministic frame-by-frame capture**, not realtime screen capture.

| Approach | How | Determinism | Verdict |
|----------|-----|-------------|---------|
| **A. `captureStream(0)` + `requestFrame()` + `MediaRecorder`** | Sample the canvas only when *you* ask; record to WebM `Blob` | Frame-timed by your calls, but `MediaRecorder` is realtime and can drop/mis-time frames under load; `captureStream` is not on `OffscreenCanvas` | Fallback only |
| **B. `canvas.captureStream(fps)` + `MediaRecorder`** | Automatic realtime sampling | **No** — variable frame timing, drops frames, wall-clock bound | Not for the product |
| **C. Frame-addressable → in-browser `VideoEncoder` (WebCodecs)** | Step sim to a boundary, render, `VideoEncoder.encode(VideoFrame)`; mux (e.g. mp4/webm) | **Yes** — one output frame per deterministic boundary | Recommended (Chrome-only) |
| **D. Frame-addressable → WS to Python `ffmpeg`** | Same stepping; `FrameSink` streams raw/encoded frames to the existing `ffmpeg` sink | **Yes** — proven path, exact control over fps/bitrate | Recommended (keeps the working pipeline) |

**Recommendation:** define `FrameSink` as the interface; implement **C and D behind it** and pick by `Config`. Keep D because it reuses the proven `ffmpeg` recorder and gives exact fps/bitrate/preset control; offer C for a self-contained in-browser export. Both are driven by the **same `fixedFpsPump`**: step the sim to capture boundary → `render(alpha = 0)` (no interpolation jitter) → capture. Decouple capture from the display rate entirely so output fps is a config value independent of the monitor.

```typescript
// host/recorder/frame-sink.ts
export interface FrameSink {
  begin(opts: { fps: number; width: number; height: number }): Promise<void>;
  writeFrame(canvas: HTMLCanvasElement | OffscreenCanvas, index: number): Promise<void>;
  end(): Promise<void>;   // flush + finalize; idempotent (guard double-close — predecessor bug)
}
```

**Anti-regression notes (from predecessor concerns):**
- Do not JPEG-encode the full canvas on the main thread every frame; move encoding off-thread (`OffscreenCanvas.convertToBlob`) or let `VideoEncoder`/`ffmpeg` do it. Throttle capture to the true output rate.
- Pre-render the large `battle.webp` background to an offscreen canvas once, not every frame.
- Make fps/bitrate/preset config values (the predecessor hard-coded `-b:v 8000k -preset ultrafast`).
- `end()` must be idempotent — the predecessor crashed on double `end_frame()`.
- A recording run should be a **separate driver/pump**, not a branch inside the training loop (the predecessor fused `TrainWorkflow` + `RecordWorkflow`).

---

## Suggested Build Order

Dependencies flow downward; each step is independently testable and ends with a determinism gate where applicable. **Do not start rendering or the bridge until the headless core is proven.**

| # | Component | Depends on | Deliverable / gate |
|---|-----------|-----------|--------------------|
| 1 | **Config + sim core skeleton**: `Config` schema, `TickClock`, `RandomStreams`, `sim/core/math.ts`, `EntityStore`, `Command` union | — | Headless unit tests; lint boundary rule in place; no renderer yet |
| 2 | **PhysicsWorld + CompositeFactory + ContactBridge** | 1 | Units exist as composite bodies; contact/impact events land in `EventLog`; **determinism fingerprint test passes** across two runs |
| 3 | **Combat + Movement + Lifecycle systems** (spec damage/armor/XP formulas) | 2 | Headless battle between two units terminates; XP/level-up events correct; fingerprint stable |
| 4 | **VisionSystem + AISystem (behavior trees)** on the 0.1 s cadence | 3 | 10+ v 10+ headless melee runs to completion at interactive speed; deterministic (seeded) |
| 5 | **BattleSim facade + snapshot/restore + fingerprint CI gate** | 4 | Sim runs fully headless in Node; save/load round-trip fingerprint equal |
| 6 | **PixiJS render projection + `SimLoop` + interpolation** (watch mode) | 5 | Watch the battle in Chrome; renderer is read-only; sim/render cleanly separated |
| 7 | **Bridge**: envelope (zod), correlation, version handshake, backpressure, disconnect cleanup; Python `bridge.py`/`env.py` | 5 | Python drives reset/step; concurrent in-flight + stray message resilience tested; reconnect works |
| 8 | **Recorder**: `FrameSink` (ffmpeg + WebCodecs), `fixedFpsPump` | 6 | Deterministic `.mp4` produced; output fps independent of display |
| 9 | **ObservationEncoder + RLlib PPO wiring** (rule-AI baseline first) | 7 | End-to-end training smoke run; reward terms verified non-trivial (fix predecessor's always-zero distance reward) |
| 10 | **(Later milestone) Kingdom/Economy subsystem + KingdomDriver** | 5, 9 | Macro-sim ticks alongside battle sim; emits `ArmyCommand`s into the same queue |
| 11 | **(Later milestone) LLM Commander/Director drivers** (async, cloud) | 7, 10 | Async text-in/command-out over the same bridge; late replies skipped deterministically; director emits only camera directives |

**Ordering rationale:** determinism (1–5) is proven *before* any I/O or rendering attaches, because bolts attached earlier hide nondeterminism and make it expensive to find. The bridge (7) comes after the sim facade exists so the protocol carries a stable `stateView`/`snapshot`/`events` contract rather than churning. The recorder (8) and RL (9) are independent consumers of the same read-only surface. Kingdom/LLM (10–11) require nothing new in the core — only new drivers and a new deterministic subsystem — which is the whole point of the layering.

---

## Layer Attachment: how kingdom/LLM attach later without rewrites

The design pays for this in three places, all cheap now:

1. **The `Command` union already contains kingdom-layer variants** (`spawn`, `armyOrder`) even though milestone 1 emits only unit commands. The kingdom layer becomes a **new deterministic subsystem** (`kingdom/`) with its own fixed-step clock (tick = 1 game-minute per spec) that reads battle events and *emits the same `Command`s*. It lives below the driver layer as a *source*, not inside `BattleSim`.
2. **The bridge protocol is driver-agnostic.** `req`/`res`/`push` with correlation and version already supports an *asynchronous* driver whose reply arrives ticks later — exactly what an LLM commander needs. The rule "a late command is skipped for its tick, deterministically" is defined now.
3. **The director is presentation-only.** A `CameraDirective` flows to `CameraDirector` in the `render/` layer and can *never* mutate sim state. This preserves determinism while letting an LLM pick camera angles and text overlays.

Faction-scoped views (spec: commander sees only own influence; director sees God's-eye) are implemented as **filters over `stateView()`/`EventLog`** at the driver boundary — `battle-sim.stateView({ viewer: factionId })` — not by forking the sim. Vision (radius 100 m army / 150 m city per spec) is a kingdom-layer concept that filters the same view; the combat layer only needs unit vision for the behavior tree.

---

## Scaling Considerations

This is a single-machine, single-runtime simulator, not a web service. "Scale" here means tick budget and training throughput.

| Scale | Architecture adjustments |
|-------|--------------------------|
| 1 battle, ~10–30 units/side | The design above is correct as-is. Rapier2D handles hundreds of bodies; the cost is behavior-tree ticks and 64-ray scans, both cadenced at 10 Hz. |
| Many concurrent training envs | One browser per env is the current model. To scale, run the sim **headless in Node** (`BattleSim` has zero DOM deps) inside worker threads, reserving the browser for watch/record. The RL driver then talks to in-process sims, and the WS bridge is only for the browser client. |
| Full kingdom + many armies | The kingdom sim is a cheap discrete/event macro-sim over the 1000×1000 map; keep it separate-step. Battles are only *instantiated* as `BattleSim` when armies meet, so the physics world count stays small. |

### Scaling Priorities

1. **First bottleneck: behavior-tree + vision cost per tick.** Fix by allocating/caching blackboards (no per-tick allocation), pooling vision query buffers, and keeping the 0.1 s cadence. If needed, give soldiers a simpler tree than elites.
2. **Second bottleneck: bridge round-trip latency** (Python polling, per predecessor up to 100 ms). Fix by replacing polling with an `asyncio.Event`/queue-driven wakeup (do this from the start in `bridge.py`), and by batching observations.
3. **Third: recording I/O.** Fix by deterministic frame-addressable capture with off-thread encoding (above), not per-frame full-canvas JPEG.

---

## Anti-Patterns

### Anti-Pattern 1: Two rendering paths (or rendering inside the sim)

**What people do:** Keep a `render()` method on the sim/scene *and* a separate draw routine in the UI component (the predecessor had both, already diverging).
**Why it's wrong:** Any visual change must be made twice; the copies drift; the sim accumulates a dependency on the renderer.
**Do this instead:** The sim **cannot render** (no method, no import). There is exactly one `SceneRenderer` in `render/`; it reads `stateView()` and draws. Delete any `render()` on a sim object.

### Anti-Pattern 2: Stub abstraction layers shipped alongside a bypassing implementation

**What people do:** Build `BodyBase`/`MapBase`/`Role` base classes with `throw new Error('Method not implemented.')`, then have the real scene bind the raw physics engine directly, bypassing them.
**Why it's wrong:** Two parallel models confuse contributors; dead stubs mask missing functionality; nobody knows which to extend.
**Do this instead:** Introduce an abstraction **only when the second concrete case exists**. In this rewrite, "second case" is the kingdom/macro layer; until then the sim uses Rapier directly behind the thin `PhysicsWorld` wrapper. Never commit a class whose methods throw "not implemented".

### Anti-Pattern 3: Frame-driven simulation (rAF as the sim clock)

**What people do:** Step the physics inside `requestAnimationFrame` using the frame delta.
**Why it's wrong:** Sim results depend on the display rate; training throughput is capped at 60 Hz; determinism is impossible; a background tab stalls the sim.
**Do this instead:** Fixed-step accumulator in `host/loop.ts`; swappable pumps (`raf` | `headless` | `fixed-fps`); the sim only knows `step()` with a constant `dt`.

### Anti-Pattern 4: Untyped, uncorrelated bridge JSON

**What people do:** Send `{type, data}` and assume "the next inbound message is the reply."
**Why it's wrong:** Any stray/late message desynchronizes request/reply permanently (the predecessor's core bug); no schema version means drift corrupts silently.
**Do this instead:** The envelope (Pattern 8): version, kind, correlation id echoed in `res`, schema validation both ends, typed errors, timeouts, bounded queues, and disconnect cleanup.

### Anti-Pattern 5: Unbounded queues / no disconnect cleanup

**What people do:** Use an unbounded `Queue()`; never remove connections on close; let the "connected" flag stay true forever.
**Why it's wrong:** Memory grows without bound; the driver proceeds against a dead client; stale frames get delivered on reconnect.
**Do this instead:** Bounded queues + max-in-flight; on close, reject pending futures and discard queued frames; remove the connection from the registry in a `finally`.

### Anti-Pattern 6: Hard-coded scene/constant wiring

**What people do:** Instantiate `Sword1v1Scene`/`Sword1v1Train` directly in `main`, hard-code ports/rates/paths as source constants, bind a trainer to a scene by matching string ids.
**Why it's wrong:** Adding a scene means edits in several files; cannot run against non-local hosts or in CI; experiments aren't reproducible.
**Do this instead:** A composition root that builds from `Config`; scenarios/data selected by id from a registry; every port/rate/path a schema-validated config value.

### Anti-Pattern 7: Display state piped through a reactive UI store every tick

**What people do:** Mirror sim display fields into a `shallowReactive` object each tick for the HUD.
**Why it's wrong:** Couples the HUD to sim internals and adds per-tick allocation; invites the UI to read live (mutable) sim state.
**Do this instead:** HUD reads `stateView()` on demand (or a throttled pull); the renderer owns only its interpolation buffer.

---

## Integration Points

### Internal Boundaries

| Boundary | Communication | Notes |
|----------|---------------|-------|
| `driver/*` → `sim` | `Command[]` via `CommandQueue` (drained once/tick) | The only way control enters the sim |
| `sim` → `render` | `stateView(prev, cur, alpha)` (read-only) | Renderer may not import sim internals; only the facade |
| `sim` → `host/bridge` | `events()` (typed) + `snapshot()` | Copies, never live handles |
| `sim` → `sim/ai` | blackboard reads + `UnitCommand` outputs | In-process, part of the deterministic core |
| `render` ← `host/recorder` | `FrameSink.writeFrame(canvas, index)` | Capture after render; off-thread encode |
| `host/bridge` ↔ Python | WS envelope (`req`/`res`/`push`) | Version + correlation + backpressure |
| `render/CameraDirector` ← future LLM director | `CameraDirective` | Presentation-only; cannot affect sim |
| future `kingdom/` → `sim` | `Command` union (`spawn`, `armyOrder`) | Kingdom is a driver+subsystem, not a sim fork |

### External Services

| Service | Integration Pattern | Notes |
|---------|---------------------|-------|
| Python RLlib driver | WS envelope over `127.0.0.1` | Correlated, versioned, bounded; the browser is the env host |
| `ffmpeg` (recorder) | `FrameSink` → WS `push{type:'frame', seq}` | Keep the proven pipeline; make fps/bitrate config |
| WebCodecs `VideoEncoder` | In-browser deterministic encode | Chrome-only (fine per constraints); optional sink |
| Cloud LLM API (future) | Async driver via same bridge; text + snapshots in, commands/directives out | Provider-agnostic adapter; never blocks a sim tick |

---

## Sources

- Rapier — Determinism (official, JS 0.21): https://rapier.rs/docs/user_guides/javascript/determinism/ — **HIGH** (fetched directly; verified against npm `@dimforge/rapier2d@0.21.0`, published 2026-09-25)
- Rapier — Advanced collision detection / EventQueue / contact-force & sensor events (official): https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection_js — **HIGH**
- Rapier — Joints & joint motors; multi-collider vs fixed-joint guidance (official): https://rapier.rs/docs/user_guides/javascript/joints — **HIGH**
- Rapier — `Compound` shape and multi-collider composite bodies: https://rapier.rs/javascript2d/classes/Compound.html — **HIGH**
- PixiJS 8.22 — Application (async `init`), Ticker Plugin, Render Loop, Architecture (official docs): https://pixijs.com/8.x/guides/components/application , /concepts/render-loop , /concepts/architecture — **HIGH** (verified against npm `pixi.js@8.22.0`)
- Gaffer On Games — "Fix Your Timestep!" (fixed-step accumulator + interpolation): https://gafferongames.com/post/fix_your_timestep/ — **HIGH**
- Godot docs — Physics interpolation introduction (fixed tick vs render frame): https://docs.godotengine.org/en/stable/tutorials/physics/interpolation/physics_interpolation_introduction.html — **HIGH**
- Deterministic replay rules (seeded RNG, no wall clock, ordered iteration): DriftEngine determinism docs; hayao architecture docs; Balaur determinism manual — **MEDIUM** (cross-checked across three independent engines)
- Seedable PRNG (mulberry32 / sfc32 / PCG32, bit-identical across JS engines): https://www.npmjs.com/package/pcg and caputchin-sdk determinism kit — **MEDIUM**
- WebSocket protocol design — envelope, correlation id, versioning, backpressure: RFC 6455 §1.9/§4.2.2; websockets library design docs (backpressure); practical envelope guides — **MEDIUM** (RFC/heuristics cross-checked)
- Behavior trees in JS/TS: mistreevous 4.3.1 (seedable RNG, JSON/MDSL); behavior3js; @bt-studio/core — **MEDIUM** (library feature claims; verify at adoption)
- Canvas capture: W3C Media Capture from DOM Elements (`captureStream`, `requestFrame`); MDN `HTMLCanvasElement.captureStream`; Chrome developers blog — **HIGH**
- Predecessor architecture & anti-patterns: `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/CONCERNS.md`, `.planning/codebase/STACK.md` — **HIGH** (in-repo, authoritative for what to avoid)
- Authoritative design spec: `.planning/reference/ai-marble-kingdom.md` (time system, 0.1 s AI cadence, vision radii, damage/armor/XP formulas, marching, city) — **HIGH** (in-repo, project authority)

---

*Architecture research for: browser-hosted deterministic 2D physics battle simulation*
*Researched: 2026-10-15*