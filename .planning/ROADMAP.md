# Roadmap: AI 版球球王国（Evolved Marble）

## Overview

Milestone 1 delivers the **tactical combat layer**: a browser-hosted, deterministic 2D physics battle simulator that autonomously resolves 10+ vs 10+ fights and can be recorded to video. The journey is strictly dependency-ordered around one principle — **build and prove a headless, deterministic simulation core first; attach rendering, recording, and the Python bridge as read-only projections on top of it.** Determinism is proven *before* any I/O or rendering attaches, because bolts attached earlier hide nondeterminism. From there the chain is physics tagging → damage/armor → XP/leveling → behavior-tree AI and autonomous battle → watchable rendering → external consumers (bridge + recording). Every phase exists to serve the Core Value: 战斗必须激烈好看.

## Phases

**Phase Numbering:**

- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Foundation & Deterministic Sim Core** - Headless, fixed-timestep, seeded PRNG core with a determinism gate — no renderer, no bridge
- [ ] **Phase 2: Physics & Composite Units** - Rapier2D compound units (body + weapon + armor colliders) with typed, part-tagged contact events
- [ ] **Phase 3: Combat Mechanics, Data & Progression** - Data-driven classes/weapons/armor, collision-velocity damage, armor reduction, XP & leveling
- [ ] **Phase 4: Unit AI & Autonomous Battle** - Spec observation/action model, behavior-tree AI at 0.1s, autonomous 10v10 to a decisive winner, watchability audit
- [ ] **Phase 5: Watchable Rendering, HUD & Action-Follow Camera** - PixiJS top-down render, HP/level/team HUD, auto-follow camera, interactivity budget
- [ ] **Phase 6: Bridge & Video Recording** - Versioned/correlated Python bridge + PettingZoo env, fixed-step frame capture → video export

## Phase Details

### Phase 1: Foundation & Deterministic Sim Core

**Goal**: A headless, fixed-timestep, fully seeded simulation core exists that can be stepped and whose reproducibility is provable by an automated gate — with no renderer, DOM, network, or clock dependencies.
**Depends on**: Nothing (first phase)
**Requirements**: SIM-01, SIM-02, SIM-03, SIM-04
**Success Criteria** (what must be TRUE):

  1. The sim advances on a fixed step decoupled from rendering (tick = 1 game minute; 60 steps/sec at 1×), so state depends on step count, not wall-clock time.
  2. Running the same seed twice yields an identical state fingerprint, and a different seed yields a different one — no `Math.random` reaches sim state.
  3. A headless mode runs a full simulation with no rendering/display and produces the same result as any rendered run.
  4. An automated determinism gate (state fingerprint / snapshot hash) runs in CI and fails the build on any divergence.

**Plans**: 2/4 plans executed

Plans:
**Wave 1**

- [x] 01-01-PLAN.md — Toolchain bootstrap (TS7/Vite8/Vitest, DOM-free tsconfig) + predecessor-tree removal + sim config

**Wave 2** *(blocked on Wave 1 completion)*

- [x] 01-02-PLAN.md — End-to-end seeded fixed-step → fingerprint tracer (headless sim core slice)

**Wave 3** *(blocked on Wave 2 completion)*

- [ ] 01-03-PLAN.md — Seeded RNG stream facade + typed Command contract + sanctioned math/content + sim/** boundary enforcement

**Wave 4** *(blocked on Wave 3 completion)*

- [ ] 01-04-PLAN.md — Canonical snapshot/fingerprint + double-run determinism gate + pre-commit wiring

### Phase 2: Physics & Composite Units

**Goal**: Units are compound Rapier2D rigid bodies whose body/weapon/armor parts are physically distinct and tagged, and whose physical contacts are surfaced as typed, part-tagged simulation events — deterministically.
**Depends on**: Phase 1
**Requirements**: PHYS-01, PHYS-02, PHYS-03
**Success Criteria** (what must be TRUE):

  1. A unit spawns as one rigid body carrying independent body, weapon, and armor colliders that can be individually identified.
  2. A weapon striking another unit emits a typed sim event recording which part (body vs armor) was hit.
  3. Physics is built on the Rapier2D deterministic build with a fixed step, and the determinism fingerprint stays green after physics is introduced.
  4. The physics fingerprint is stable across two machines (cross-machine golden-hash spike), and fast weapons do not tunnel through targets (CCD configured).

**Plans**: TBD

Plans:

- [ ] 02-01: `PhysicsWorld` fixed-step Rapier wrapper + `EventQueue` + pixel↔meter scale decision
- [ ] 02-02: `CompositeFactory` (one body + body/weapon/armor colliders + revolute joint) + `LifecycleSystem` ordered spawn/despawn
- [ ] 02-03: `ContactBridge` (collider handle → `(entityId, part)`), typed contact/impact events → `EventLog`, CCD + collision groups

### Phase 3: Combat Mechanics, Data & Progression

**Goal**: Data-defined units fight with the spec's combat mechanics — collision-velocity damage, seeded jitter, armor reduction by hit region, and XP-driven leveling — all validated headless.
**Depends on**: Phase 2
**Requirements**: DATA-01, DATA-02, DATA-03, DMG-01, DMG-02, DMG-03, PROG-01, PROG-02, PROG-03
**Success Criteria** (what must be TRUE):

  1. Units are defined entirely by data — 7 classes (per-level growth + gear/skill unlock tables), 6 weapons, 2 armor (mass/ratio/break-armor matrix) — with no mechanics constants hard-coded in systems.
  2. Melee damage derives from collision normal velocity Δv per the spec formula, and is non-zero at typical closing speeds; damage jitter is seeded N(mean, mean/20) and reproducible.
  3. Hitting armor (only) applies damage reduction scaled by the break-armor ratio, hitting the body does not reduce, and the break-armor matrix produces soft counters (no hard counter).
  4. Units earn XP from dealing damage (>50), tanking damage (>50), and kills; reaching a threshold levels up the unit, restores the "max-HP increase," and unlocks gear/skills per the class table.
  5. A headless two-unit battle runs to resolution and emits correct damage/XP/level-up events with a stable fingerprint.

**Plans**: TBD

Plans:

- [ ] 03-01: Data-only `sim/content/` (classes, weapons, armor, per-level gains, unlock tables, formula constants)
- [ ] 03-02: Damage pipeline (Δv formula + seeded jitter) + hit-region detection + armor reduction + break-armor matrix
- [ ] 03-03: XP/leveling/kill events + `MovementSystem`; headless two-unit battle gate

### Phase 4: Unit AI & Autonomous Battle

**Goal**: Rule/behavior-tree-driven units observe and act per spec, autonomously fight 10+ vs 10+ to a decisive winner with no human input, and the resulting battle is measurably watchable rather than degenerate.
**Depends on**: Phase 3
**Requirements**: AI-01, AI-02, AI-03, AI-04, BTL-01, BTL-02
**Success Criteria** (what must be TRUE):

  1. Each unit observes per spec (64-ray scan capped at 50m, projectile detection, nearest 16 enemies + 16 allies) and outputs spec actions (forces, rotation force, weapon/unit skills), deciding every 6 fixed steps (0.1s).
  2. Classes behave differently, not just numerically — berserker charges, archer kites, sword-and-shield holds the line.
  3. Two opposing armies of 10+ units each engage automatically when they draw near and reach a decisive winner with no human intervention.
  4. An automated watchability audit passes — behavior diversity ≥ K, first damage within T seconds, "0 damage in 10s" fails, and no draw/timeout stalemate (anti-stall invariants hold).
  5. A 10+ vs 10+ headless battle sustains the target tick rate (no spiral-of-death) while remaining reproducible from its seed.

**Plans**: TBD

Plans:

- [ ] 04-01: `VisionSystem` (64-ray scan, nearest 16+16, projectile detection) + `AISystem` behavior trees on the 6-tick cadence with seeded RNG + blackboards
- [ ] 04-02: Per-class behavior trees (charge/kite/hold) + anti-stall invariants + distance-weighted targeting
- [ ] 04-03: Autonomous battle resolution (10v10 → winner) + automated watchability audit as phase gate

### Phase 5: Watchable Rendering, HUD & Action-Follow Camera

**Goal**: The deterministic sim is projected top-down via PixiJS with clearly distinguishable units/weapons/armor/projectiles, an HP/level/team HUD, and an unattended action-follow camera — at interactive framerate for a 10v10 battle.
**Depends on**: Phase 4
**Requirements**: RND-01, RND-02, CAM-01
**Success Criteria** (what must be TRUE):

  1. A live 10v10 battle renders top-down in Chrome with units, weapons, armor, and projectiles clearly distinguishable.
  2. HUD shows every unit's HP, level, and team.
  3. The camera automatically frames the action (weighted center-of-mass of fighting units) with no manual control.
  4. The 10v10 battle holds interactive framerate under a measured draw-call / CPU-vs-GPU budget, and rendering remains a read-only projection (the sim determinism fingerprint is unaffected).

**Plans**: TBD
**UI hint**: yes

Plans:

- [ ] 05-01: PixiJS 8 async init + `SceneRenderer` reading `stateView(prev, cur, alpha)` + `InterpolationBuffer` + cached static background/atlases
- [ ] 05-02: HUD (HP bars, level badges, team tint) + `CameraDirector` (action-follow) + measured 10v10 performance budget

### Phase 6: Bridge & Video Recording

**Goal**: External read-only consumers attach to the proven core — a versioned, correlated WebSocket bridge backed by a PettingZoo environment for Python, and a fixed-step frame-capture pipeline that exports watchable battle footage.
**Depends on**: Phase 5
**Requirements**: BRG-01, REC-01
**Success Criteria** (what must be TRUE):

  1. The browser↔Python bridge carries versioned, correlated messages (request/response ids echoed, schema-hash handshake) with per-receive timeouts and a heartbeat — no desync or silent hang; unknown ids are dropped.
  2. Disconnects clean up in a `finally` path, queues are bounded (max-in-flight), and the listener binds `127.0.0.1`.
  3. Python wraps the sim as a PettingZoo `ParallelEnv` driven by the rule-AI baseline (no RL algorithm), resetting deterministically from a seed.
  4. Fixed-step frame capture exports a viewable battle video file (H.264/MP4 via WebCodecs+mediabunny, or the ffmpeg fallback), decoupled from realtime, with encoding off the main thread.
  5. Recording artifacts are written to an external/rotated output directory (outside the repo tree) and capture shutdown (`end()`) is idempotent.

**Plans**: TBD

Plans:

- [ ] 06-01: TS typed WS envelope (version, correlation ids, bounded queues, timeouts, heartbeat, disconnect cleanup) + `127.0.0.1` binding
- [ ] 06-02: Python `bridge.py` (correlated client) + `schema.py` (pydantic mirror) + `env.py` (PettingZoo `ParallelEnv`, rule-AI baseline, seeded reset)
- [ ] 06-03: `FrameSink` (WebCodecs + mediabunny H.264/MP4 default; ffmpeg fallback) + `fixedFpsPump` capture + external output/rotation

## Progress

**Execution Order:**
Phases execute in numeric order: 1 → 2 → 3 → 4 → 5 → 6

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Foundation & Deterministic Sim Core | 2/4 | In Progress|  |
| 2. Physics & Composite Units | 0/3 | Not started | - |
| 3. Combat Mechanics, Data & Progression | 0/3 | Not started | - |
| 4. Unit AI & Autonomous Battle | 0/3 | Not started | - |
| 5. Watchable Rendering, HUD & Action-Follow Camera | 0/2 | Not started | - |
| 6. Bridge & Video Recording | 0/3 | Not started | - |
