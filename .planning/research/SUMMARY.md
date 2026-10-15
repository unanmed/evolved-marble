# Project Research Summary

**Project:** AI 版球球王国（Evolved Marble） — Milestone 1, tactical combat layer
**Domain:** Browser-hosted deterministic 2D physics battle simulation, used as watchable footage *and* as an RL training environment
**Researched:** 2026-10-15
**Confidence:** HIGH overall (HIGH on stack/architecture/determinism, MEDIUM on feature calibration and AI-library choice)

## Executive Summary

Evolved Marble is a full rewrite of a prior 1v1 tactical prototype into a browser-hosted, top-down 2D physics battle simulator. The product's single success criterion — **"战斗必须激烈好看" (battles must be intense and visually appealing)** — is a *watchability* requirement, and every research stream independently converges on the same structural conclusion: **build a headless, deterministic simulation core first; attach rendering, recording, and Python training as read-only projections on top of it.** The locked stack (PixiJS 8 for rendering, Rapier2D WASM for physics, TypeScript/Vite) is sound and, crucially, Rapier's cross-platform determinism is what makes replay, footage re-takes, balance A/B, and the future "training rounds = control level" ladder possible at all.

The recommended approach is a five-layer architecture with strictly one-way dependencies: an attachment layer (future kingdom/LLM, interfaces reserved now), a driver layer that emits `Command`s, a pure deterministic `sim/` core with no DOM/WebGL/network/clock imports, a read-only presentation layer, and a host/transport layer that owns pacing, the WebSocket bridge, and frame capture. Combat mechanics (7 classes × 6 weapons × 2 armor, collision-velocity damage, armor reduction by hit-region, XP/leveling, behavior-tree AI at a 0.1 s cadence) all sit inside `sim/`. The same `step()` primitive serves watch mode (rAF accumulator), training (unthrottled headless pump), and recording (fixed-fps pump), which is what lets one core serve three products without branching.

The dominant risk is **not** graphics or gameplay — it is *determinism discipline*. Rapier guarantees determinism only for what is fed to it; the project must enforce seeded RNG, ordered construction/iteration, fixed timestep, and deterministic math as architectural invariants with a CI regression gate. The second risk is that the AI, not the renderer, produces *degenerate/boring* battles (stalemates, clumps, zero damage) — a direct violation of Core Value — so anti-stall design and automated watchability audits are first-class requirements. The third risk cluster is inherited from the predecessor and already observed in-repo: an untyped, uncorrelated WebSocket protocol that desyncs/hangs, unbounded listener leaks, contact-event double counting, and repo bloat from checkpoints/videos. Each has a known, cheap structural fix that must be designed in from Phase 1 rather than bolted on.

## Key Findings

### Recommended Stack

Full detail in `STACK.md`. The stack is intentionally narrow and deterministic-first: one renderer, one physics engine (deterministic build), one seeded RNG, one command contract. Every non-core dependency is optional and swappable.

**Core technologies:**
- **PixiJS `8.22.0`** — 2D top-down renderer; single package, async `app.init()`, WebGL default with WebGPU opt-in. Best 2D sprite batching for the many-units + effects scene.
- **`@dimforge/rapier2d-deterministic` `0.21.0`** — physics; the `-deterministic` build guarantees *cross-platform* determinism (the plain build is only locally deterministic), which the RL ladder depends on. Use the `-compat` build in Phase 1 for zero-friction WASM setup, then switch to the plugin route when bundle size matters.
- **TypeScript `7.0.2`** + **Vite `8.3.4`** — language + dev server/bundler; Vite 8 (rolldown) handles the `.wasm` asset pipeline. Fall back to TS `5.9.x` only if a toolchain dep lags on TS7 types.
- **bitECS `0.4.0`** *(optional)* — SoA entity storage; at 20–40 units a hand-rolled typed-array world is sufficient, so design component stores as SoA **now** and adopt bitECS only at army scale.
- **mistreevous `4.3.1`** — behavior-tree runtime for unit AI; TS-native, **seedable RNG** (deterministic traversal) — the key determinism-relevant feature.
- **mediabunny `1.61.4`** — MP4/WebM muxing over WebCodecs for the "帧采集 → 视频" pipeline; replaces the deprecated `mp4-muxer`.

**Explicitly rejected:** planck-js (predecessor, unmaintained, no determinism), Matter.js / p2.js (no determinism guarantee), `@motajs/client` (proprietary, replaced by PixiJS), behavior3js (abandoned), `mp4-muxer` (deprecated), `MediaRecorder` for canonical exports (realtime, drops frames), coupling `world.step()` to `requestAnimationFrame`, and any `Math.random()`/`Math.sin/cos` feeding sim state.

**Decision point to resolve:** `PROJECT.md` names `@dimforge/rapier2d` generically; research recommends pinning the **`-deterministic`** build. Confirm this in the roadmap/Phase 1.

### Expected Features

Full detail in `FEATURES.md`. This milestone is the **tactical combat layer only**; kingdom/economy, LLM commander/director, and RL control are out of scope (interfaces reserved). Prioritization is against "battles must be intense and watchable."

**Must have (table stakes — combat milestone is broken without these):**
- Fixed-timestep deterministic sim loop + seeded RNG — the spine everything else sits on
- Rapier2D compound unit (body + weapon + armor colliders, tagged via `userData`)
- Data-driven stat layer: 7 classes, 6 weapons, 2 armor, per-level gains + unlock table
- Collision-velocity damage formula + jitter + armor reduction + break-armor matrix
- XP + leveling (attack/defense/kill XP; level-up restores HP and unlocks gear/skills)
- Per-unit behavior-tree AI with the spec observation model (64-ray scan, nearest 16+16) at 0.1 s cadence
- Autonomous battle resolution: 10+ vs 10+ to a winner, no human input
- PixiJS top-down render + HUD (HP/level/team) + performance budget met at ~20–30 units
- Basic **action-follow auto camera** (footage requires unattended camera)
- Frame capture → video export (an Active requirement; it is the point of the project)

**Should have (competitive — where "watchable" lives):**
- Class-distinct *behavior*, not just stats (berserker charges ≠ archer kites ≠ shield holds)
- In-battle progression and power spikes (mid-fight level-ups create comebacks/"hero" units — a rare differentiator vs static auto-battlers)
- Physics-emergent combat (no canned animation; TABS-style chaotic ragdolls)
- Class skills/abilities (万箭齐发/冲锋/旋转), projectiles as real physics bodies, hit sparks/damage numbers, kill/level-up highlight beats
- Soft-counter composition suspense via break-armor ratios (no hard counters)
- Deterministic replay + shareable seed; headless batch runner + balance calibration harness

**Defer (v2+ / reserved interfaces):**
- LLM director (camera + commentary) and LLM commander — reserve hooks only
- Strategic layer (cities, production, marches, 100/150 m vision)
- RL unit control + "control-level" ladder (keep the field and deterministic core ready)
- Scenario/map framework, save ladder, multiplayer, unit creator, fog-of-war

### Architecture Approach

Full detail in `ARCHITECTURE.md`. Five layers, strictly downward dependencies, with the **Simulation Core headless and deterministic** (no DOM/WebGL/WebSocket/clock imports). External control enters only as `Command[]` through a `CommandQueue` drained once per tick; everything the outside world learns comes from a typed `EventLog` and read-only `stateView()`/`snapshot()`.

**Major components:**
1. `sim/` core — `TickClock` (fixed dt), `RandomStreams` (serializable seeded PRNG), deterministic math subset, `PhysicsWorld` (Rapier wrapper), `EntityStore` (ECS-lite component structs), `CompositeFactory` (one body + multiple colliders + revolute joint for weapons), `ContactBridge` (collider handle → `(entityId, part)`), systems (`VisionSystem`, `AISystem`, `CombatSystem`, `MovementSystem`, `LifecycleSystem`), `EventLog`, and the `BattleSim` facade (`reset`/`submit`/`step`/`events`/`snapshot`/`stateView`).
2. `driver/` — `CommandQueue`, `LocalInputDriver`, (future) `PythonRLDriver` + `ObservationEncoder`.
3. `render/` — PixiJS `SceneRenderer` (the only place drawing happens), `InterpolationBuffer`, `CameraDirector`, `HUD`.
4. `host/` — `SimLoop` (accumulator with `raf` | `headless` | `fixed-fps` pumps), `Bridge` (typed WS envelope), `FrameSink` (ffmpeg + WebCodecs), `Config`.
5. `model/` (Python) — `bridge.py` (correlated WS client), `schema.py` (pydantic mirror), `env.py` (PettingZoo `ParallelEnv`), `recorder.py`, `train.py`.

**Key patterns:** fixed-step accumulator with interpolation; commands sampled once per tick; composite units = one rigid body with multiple colliders; ECS-lite (not OOP inheritance, not a full ECS framework); behavior trees ticked every 6th step; Rapier contact events → typed `EventLog`; state `fingerprint` + `snapshot`/`restore` as the determinism gate and RL reset primitive; cross-language typed envelope with correlation/version/backpressure. The predecessor's anti-patterns (stub base classes, two render paths, rAF as sim clock, untyped `{type,data}` bridge, reactive UI mirror of sim state, hard-coded scenes) are each explicitly designed out.

### Critical Pitfalls

Full detail in `PITFALLS.md`. Top items by leverage:

1. **"Rapier is deterministic" ≠ "your sim is deterministic"** — Rapier only guarantees determinism of what is fed to it. Enforce: pinned Rapier version, identical construction/insertion order, seeded PRNG only (no `Math.random`), no `Math.sin/cos` on values feeding state, same number of fixed steps. Verification: golden `takeSnapshot()` hash test across runs **and machines**, run in CI from Phase 1.
2. **Physics on the render clock (variable dt)** — the spec's damage formula depends on collision normal velocity, so variable dt changes *damage*, not just position, and breaks replay/RL. Fix: fixed-step accumulator, clamped, excess drained as slow-motion. Must exist before any determinism test is trustworthy.
3. **WebSocket bridge desync / silent hang (predecessor's headline bug)** — the predecessor assumed "the next inbound message is the reply" with no ids, no timeouts, no cleanup, unbounded queues. Fix: monotonic request ids echoed in replies (drop unknown), protocol version handshake, per-recv timeouts + heartbeat, bounded queues + max-in-flight, `finally` disconnect cleanup, bind `127.0.0.1`.
4. **Behavior-tree AI produces degenerate, unwatchable battles** — the direct Core Value violation: stalemates, corner-clumping, shoving matches, zero damage because `√Δv − 1 ≤ 0`. Fix: anti-stall invariants (engagement timers, escalating aggression, forced re-engagement), distance-weighted/influence-map targeting, a time-bounded fallback leaf (never idle in combat), empirical damage-threshold calibration, and automated watchability audits (≥K distinct behaviors, damage within T seconds; "0 damage in 10 s" = failing test).
5. **Contact-event flood / loss / double-counted damage** — contact-force events fire *every step* while touching, compound units emit many events per swing, and multi-substep CCD can lose events. Fix: model hits as a per-weapon state machine keyed off `ContactForceEvent.started` + cooldown/`already-hit-this-swing` set, deliberate `ActiveEvents` flags, collision groups to suppress self/friendly contacts, and guard every handler against missing-unit index errors (the predecessor's observed `TypeError`).

**Also high-leverage:** CCD tunneling for fast weapons (Pitfall 4), background-tab rAF suspension breaking training runs (Pitfall 3), listener/object leaks in long runs (Pitfall 8), Pixi draw-call explosion / per-frame Graphics redraw + un-cached background (Pitfall 9), pixels-as-meters physics unit mismatch (Pitfall 10), repo bloat from checkpoints/videos (Pitfall 11), and reward bugs/hacking (Pitfall 12, relevant at the RL milestone but seeded-reset + harness must exist in the bridge phase).

## Implications for Roadmap

Based on combined research, the phase structure below is **opinionated and dependency-ordered**: determinism is proven *before* any I/O or rendering attaches, because bolts attached earlier hide nondeterminism and make it expensive to find.

### Phase 1: Foundation & Deterministic Sim Core
**Rationale:** Everything (replay, RL, footage re-takes, balance) depends on a reproducible core; the predecessor died on the absence of this separation. No renderer, no bridge yet.
**Delivers:** `Config` schema (typed, no magic constants), `TickClock`, `RandomStreams`, `sim/core/math.ts`, ECS-lite `EntityStore`, `Command` union, headless accumulator `SimLoop` (`raf`/`headless`/`fixed-fps` pumps), lint boundary rules (`sim/**` may not import render/host/driver/pixi/DOM), and the **determinism harness** (golden snapshot hash + fingerprint CI gate).
**Addresses:** Fixed-timestep deterministic core + seeded RNG (P1).
**Avoids:** Pitfalls 1, 2, 3, 8 (leak-free lifecycle contract), 10 (decide pixel↔meter scale once), 11 (external output dirs from day one).

### Phase 2: Physics World & Composite Units
**Rationale:** Damage/armor mechanics are impossible until unit parts are physically distinct and tagged. Uses the **compat** Rapier build to prove the loop with zero WASM-setup friction.
**Delivers:** `PhysicsWorld` (fixed-step Rapier wrapper + `EventQueue`), `CompositeFactory` (one body + body/weapon/armor colliders + revolute joint), `ContactBridge` (handle → `(entityId, part)`; contact/impact events → `EventLog`), `LifecycleSystem` with ordered spawn/despawn, and CCD configuration for fast bodies. **Gate:** determinism fingerprint stable across two runs (and, as a spike, across two machines).
**Uses:** `@dimforge/rapier2d-deterministic-compat@0.21.0`.
**Implements:** `sim/world/*`.
**Avoids:** Pitfalls 1, 4 (CCD decision made once, early — it changes golden hashes), 5 (event semantics), 10.

### Phase 3: Combat Mechanics & Progression
**Rationale:** Damage, armor reduction, and XP are the mechanics that make "weapons matter" legible; they depend on Phase 2's tagging.
**Delivers:** Data-only `sim/content/` (7 classes, 6 weapons, 2 armor, per-level gains, unlock table, formula constants), collision-velocity damage formula + jitter, hit-region detection + armor reduction + break-armor matrix, XP/leveling/kill events, `MovementSystem`. **Gate:** headless two-unit battle terminates; XP/level-up events correct; fingerprint stable.
**Addresses:** Stat layer, damage/armor, XP+leveling (P1).
**Avoids:** Pitfalls 4, 5, 12 (mechanics defined so they can be calibrated/tested).

### Phase 4: Unit AI, Autonomous Battle & Watchability Tuning
**Rationale:** The Core Value gate. A technically-correct-but-boring sim is a *failure*, so tune watchability as a first-class phase, not an afterthought.
**Delivers:** `VisionSystem` (64-ray scan, nearest 16+16), `AISystem` behavior trees at the 6-tick (0.1 s) cadence with seeded RNG and per-unit blackboards, autonomous battle resolution (10+ v 10+ → winner), anti-stall invariants, distance-weighted targeting, and an **automated watchability audit** (behavior-diversity, time-to-first-damage, no-draw/no-timeout) as a phase success criterion.
**Addresses:** Behavior-tree AI + observation/action model, autonomous resolution (P1); soft-counter and class-behavior differentiators.
**Avoids:** Pitfall 7 (degenerate AI), plus the "0 damage in 10 s" failure class.

### Phase 5: Watchable Rendering (PixiJS + HUD + Action-follow Camera)
**Rationale:** Only after the sim is provably deterministic and watchable headless do you render it — the renderer is a pure read-only projection.
**Delivers:** PixiJS 8 async init + `pixi-viewport` (peer `pixi.js >= 8`), `SceneRenderer` reading `stateView(prev, cur, alpha)`, `InterpolationBuffer` (smooth at 144 Hz while physics stays 60 Hz), HUD (HP bars, level badges, team tint, `BitmapText`), action-follow `CameraDirector` (weighted center-of-mass of fighting units), cached static background, batched sprites/atlases, and a measured 10v10 performance budget (draw calls, CPU vs GPU).
**Addresses:** Top-down render + HUD, action-follow auto camera, performance envelope (P1).
**Avoids:** Pitfall 9 (draw-call explosion, per-frame Graphics, uncached 2.4 MB background).

### Phase 6: Training Bridge (Protocol + Python Env)
**Rationale:** Must be a standalone, versioned, correlated protocol with tests *before* RL plugs in — this is the highest-leverage fix for trustworthy experiments. Depends on a stable `stateView`/`snapshot`/`events` contract (Phase 5 facade).
**Delivers:** TS envelope (`zod` discriminated union: `req`/`res`/`push`, `PROTOCOL_VERSION`, correlation `id`/`re`, typed `WireError`), bounded queues + `maxInFlight` + timeouts + heartbeat + `finally` disconnect cleanup, `127.0.0.1` binding, `hello` schema-hash handshake; Python `bridge.py` (correlated client, `asyncio.Event`-driven, no polling) + `schema.py` (pydantic mirror) + `env.py` (PettingZoo `ParallelEnv`); `ObservationEncoder` behind the `control-level` field. Rule-AI baseline first; **no RL algorithm** this milestone.
**Addresses:** Browser↔Python bridge rewrite (Active requirement); reserved RL interface.
**Avoids:** Pitfalls 3 (worker/visible-tab rules + timeout detection), 6 (desync/hang), 12 (seeded reset + reward harness scaffolding).
**Note:** Deliberately **no gRPC, no SharedArrayBuffer** (not cross-process browser⇄Python); WebSocket is the correct transport.

### Phase 7: Recording & Video Export
**Rationale:** The deliverable is "可以出片的模拟录像"; capture is a host concern driven by the same deterministic fixed-fps pump.
**Delivers:** `FrameSink` interface with two implementations selected by `Config` — in-browser WebCodecs `VideoEncoder` + `mediabunny` muxer (H.264/MP4 default), and the proven WS→Python `ffmpeg` sink. `fixedFpsPump` steps the sim to each capture boundary and renders at `alpha = 0` (no interpolation jitter); output fps/bitrate/preset are config values; `end()` idempotent; encoding off the main thread.
**Addresses:** Frame capture → video export (P1, Active requirement).
**Avoids:** Pitfalls 9 (off-thread encode, throttled capture), 11 (artifacts outside the repo tree with retention/rotation).

### Phase Ordering Rationale

- **Determinism (1–2) before everything.** Bolts attached earlier (rendering, bridge) hide nondeterminism; the predecessor's rewrite precedent and the RL ladder both demand a proven headless core first.
- **Physics tagging (2) before damage (3) before XP (4).** `Δv` is a collision property of distinct, tagged parts; XP keys off post-reduction damage — the dependency chain is strict.
- **Watchability (4) before rendering (5).** The Core Value is about the *simulation*, not pixels; tuning the sim headless is cheaper and must not be masked by "it looks busy."
- **Bridge (6) after the facade (5).** The protocol should carry a stable `stateView`/`snapshot`/`events` contract, not one still churning. This also avoids replaying the predecessor's protocol mistakes against unstable internals.
- **Recording (7) is an independent consumer** of the same read-only surface as the bridge; it can proceed in parallel once Phase 5 lands.
- **Reserved layers (kingdom, LLM commander/director, RL) require no core rewrite** — only new drivers/subsystems — which is the payoff of the layering.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 2 (Physics & Determinism):** the Rapier determinism guarantee is the one "verify, don't assume" item — spike a **cross-machine golden-hash test** and settle the `-deterministic` vs `-compat` build + `enhanced-determinism` nuance (STACK/ARCHITECTURE/PITFALLS contain an internal inconsistency about the default build). Also settle the pixel↔meter scale factor here.
- **Phase 7 (Recording):** WebCodecs codec availability varies by machine/config — probe with `VideoEncoder.isConfigSupported()`; confirm H.264 vs VP9/AV1 and muxer choice.

Phases with standard patterns (skip research-phase):
- **Phase 1 (Foundation):** fixed-timestep accumulator and seeded PRNG are canonically documented (Gaffer On Games, Rapier determinism docs).
- **Phase 3 (Combat):** mechanics are fully specified in `.planning/reference/ai-marble-kingdom.md`; the work is implementation + calibration, not research.
- **Phase 5 (Rendering):** PixiJS v8 patterns and performance guidance are well-documented.
- **Phase 6 (Bridge):** RFC 6455-based correlation/versioning/backpressure patterns are established; execute carefully rather than research.

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | Versions verified directly against the npm registry this session; PixiJS/Rapier/Vite/WebCodecs facts from official docs. Caveat: several pins are bleeding-edge (TS 7.0.2, Vite 8.3.4, Rapier 0.21.0) — re-verify before locking `package.json`. |
| Features | MEDIUM | Spec-driven (`.planning/reference/ai-marble-kingdom.md`) with competitor/watchability analysis cross-checked but sourced from community/market material; the *numbers* are explicitly reference-only and need empirical calibration. |
| Architecture | HIGH (core/determinism) / MEDIUM (AI/BT library) | Layering, determinism rules, and bridge design corroborated by official docs + observed predecessor bugs. Behavior-tree library (mistreevous) feature claims are MEDIUM — verify seedable-RNG/serialization at adoption. |
| Pitfalls | MEDIUM-HIGH | Engine facts (Rapier CCD/events/determinism, MDN rAF, Pixi perf) are HIGH; domain-behavior claims (watchability, kiting, reward hacking) are MEDIUM; predecessor bugs are HIGH (observed in-repo). |

**Overall confidence:** HIGH, with the single most important caveat being that **determinism must be verified empirically, not assumed.**

### Gaps to Address

- **Rapier determinism guarantee (build nuance):** STACK says use `-deterministic`; ARCHITECTURE says the JS/WASM build is "fully cross-platform deterministic, no flag needed"; PITFALLS notes the default JS build is only *locally* deterministic. Resolve in Phase 2 with a two-machine golden-hash spike and a hard failure on version bump.
- **Numeric calibration:** all spec stats/damage/XP values are "reference only." Requires the headless batch runner + balance harness; confirm the velocity threshold so `√Δv − 1` is non-zero at typical closing speeds (otherwise damage is always 0).
- **Pixel↔meter scale factor:** decide once in Phase 1/2; changing later invalidates all tuning and golden hashes.
- **Deterministic math strategy:** whether to ship a small pure-TS libm subset or precompute constants — decide before Phase 2; document the banned-API list.
- **Behavior-tree library:** verify `mistreevous` seedable RNG + serializable tree state round-trips through snapshot/restore, or plan an in-house tree.
- **Watchability metrics:** define concrete thresholds (K distinct behaviors, T seconds to first damage, max draw rate) so the Phase 4 audit is objective.
- **WebCodecs codec support:** feature-detect per machine; have the ffmpeg sink as the guaranteed fallback.
- **Version pins:** re-verify all packages (esp. TS 7, Vite 8, Rapier 0.21, Pixi 8.22) against the registry immediately before writing `package.json`.

## Sources

### Primary (HIGH confidence)
- npm registry `latest` for each package — exact versions verified 2026-10-15 (`pixi.js@8.22.0`, `@dimforge/rapier2d*-deterministic@0.21.0`, `vite@8.3.4`, `typescript@7.0.2`, `mistreevous@4.3.1`, `bitecs@0.4.0`, `pixi-viewport@6.0.3`, `mediabunny@1.61.4`, `vitest@5.0.4`, …)
- Rapier user guides (JS 0.21) — Determinism, Rigid-body CCD, Advanced collision detection / EventQueue, Joints, Common mistakes, Serialization (`rapier.rs/docs/user_guides/javascript/*`)
- PixiJS v8 docs — Application async init, Render Loop, Architecture, Performance Tips, ParticleContainer
- MDN / Chrome Developers — WebCodecs (`VideoEncoder`/`VideoFrame`), Page Visibility & `requestAnimationFrame` behavior
- Gaffer On Games — "Fix Your Timestep!" (fixed-step accumulator, spiral-of-death, interpolation)
- In-repo authority — `.planning/reference/ai-marble-kingdom.md` (spec), `.planning/PROJECT.md`, `.planning/codebase/*` (predecessor bugs/anti-patterns)
- Gymnasium / PettingZoo docs — `ParallelEnv` interface for the Python wrapper

### Secondary (MEDIUM confidence)
- `vite-plugin-wasm` / `vite-plugin-top-level-await` READMEs; `mistreevous` / `bitECS` / `miniplex` READMEs (feature claims, determinism-relevant features)
- WebSocket best-practices / reconnection guides; RFC 6455 correlation & backpressure patterns
- Watchability/spectating research (Unity CineCast; eSports camera/commentary papers; StarCraft "observer" ROCI) and RTS kiting / influence-map work
- Reward hacking / specification gaming literature (Pan et al. arXiv:2201.03544; Shihab et al. arXiv:2507.05619)

### Tertiary (LOW confidence)
- Competitor/market feature analysis (TABS, Lost Marbles, auto-battlers) — web-search sourced, cross-checked; informs counter/watchability design, not core architecture

---
*Research completed: 2026-10-15*
*Ready for roadmap: yes*
