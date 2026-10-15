# Pitfalls Research

**Domain:** Browser-hosted 2D physics battle simulation used for watchable output *and* as an RL training substrate (PixiJS + Rapier2D WASM + TypeScript/Vite, Python driver over WebSocket bridge)
**Researched:** 2026-10-15
**Confidence:** MEDIUM-HIGH (core engine facts from official Rapier/PixiJS/MDN docs = HIGH; domain-specific behavior claims from community/paper sources = MEDIUM; predecessor bugs are HIGH because they are already observed in this repo)

> Scope note: These pitfalls are deliberately specific to (a) using a browser physics engine as an RL environment host and (b) producing a *watchable* autonomous battle. Generic "write tests / don't leak memory" advice is excluded unless it has a project-specific failure mode.

---

## Critical Pitfalls

### Pitfall 1: Rapier2D is "deterministic" — but your *simulation* is not

**What goes wrong:**
The team reads "the WASM/TypeScript version of Rapier is fully cross-platform deterministic" and treats determinism as solved. Reproducibility then silently breaks, and every RL experiment becomes non-repeatable. Two reruns of the same seed diverge after a few hundred ticks; a policy trained in the browser can't be replayed; "training round = control level" model checkpoints become meaningless.

**Why it happens:**
Rapier's cross-platform guarantee only holds when **all** of these are true, and the project controls only the first one:

1. Same Rapier **version + build features** (snapshot format is *not* stable across builds; `takeSnapshot` bytes are rejected by a different build).
2. Identical **initial conditions** — rigid-bodies/colliders/joints constructed with identical values *and added/removed in identical order*.
3. All app-side values fed into Rapier computed with **cross-platform-deterministic ops**. `Math.sin`, `Math.cos`, `Math.random`, and (critically) any transcendental used to compute spawn positions, rotations, or forces are **not** cross-platform deterministic.
4. The **same number of fixed steps** executed in the same order — which breaks the moment physics is stepped on a variable rAF clock.
5. `enhanced-determinism` build feature enabled (default JS build is only **locally** deterministic by default).

The predecessor prototype already shows the pattern: unit spawn attributes are drawn from a *normal distribution* (`randomness`, ±1/8 of mean per the spec). If that randomness comes from `Math.random()` without a seeded, deterministic PRNG, the initial conditions differ on every reset and Rapier determinism is moot.

**How to avoid:**
- Treat determinism as an **architectural requirement with a test**, not a property to assume: build a "determinism harness" that runs N ticks, hashes `world.takeSnapshot()`, and asserts the hash matches a golden value (this is exactly what the Rapier docs suggest).
- Pin the exact Rapier version; add a physics smoke test that fails loudly on version bump (the predecessor already flagged `planck-js ^1.3.0` as a training-dynamics risk — repeat that lesson for Rapier).
- Route **all** spawn/randomness through one seeded PRNG (e.g. a deterministic `mulberry32`/`xorshift`); forbid bare `Math.random()` via lint rule. Seed must be part of the environment reset and echoed in the bridge protocol.
- Use `na`-style deterministic math (or precompute lookup tables) for any trig used to build initial transforms; never feed `Math.sin/cos` output directly into collider/body construction.
- Iterate bodies/units through **ordered** collections (arrays with stable sort keys), never over `Map`/`Set` insertion order you can't reproduce, when constructing or destroying Rapier objects.

**Warning signs:**
- Snapshot hash differs between two runs with "the same seed".
- Divergence only appears after entities are spawned/destroyed (ordering bug) or after a unit fires/rotates (trig bug).
- Results differ between Chrome on the dev machine and Chrome on CI/another machine.
- Any `Math.random()` in simulation code paths (grep for it).

**Phase to address:** Physics Core & Determinism harness (must exist *before* any RL work). Add a regression gate: loading an old checkpoint against a new Rapier version must be a hard error, not a silent drift.

---

### Pitfall 2: Physics stepped on the render clock (variable dt)

**What goes wrong:**
Physics is advanced with whatever delta `requestAnimationFrame` provides. On a 144 Hz monitor simulation runs at a different rate/outcome than 60 Hz; a slow frame produces a huge `dt` that explodes the solver and makes fast weapons tunnel; the "spiral of death" freezes the tab when the sim can't keep up.

**Why it happens:**
The default, easiest loop is `ticker.add((ticker) => world.step(ticker.deltaTime))`. It demonstrably works in demos and only fails under load or on other hardware. The spec's damage formula depends on **collision normal velocity difference (m/s)** — which is a function of the timestep — so variable dt also changes *damage*, not just positions.

**How to avoid:**
- Fixed timestep with an **accumulator**: accumulate real elapsed time, consume in fixed chunks (`FIXED_DT = 1/60` or a value you tune), clamp the accumulator (e.g. ≤ 0.25 s / max N steps per frame) to kill the spiral of death, and **drain the excess** (slow-motion) rather than catching up.
- Decouple **logic tick** (game-time `tick = 1 game minute`) from **physics step** and from **render frame**. Model the project's three time domains explicitly: real time, sim tick, and render alpha.
- Optionally interpolate render transforms (`prev + (curr-prev)*alpha`) so 144 Hz displays look smooth without changing sim.
- The spec's AI cadence ("every 6 frames / 0.1 s") must be expressed in **sim ticks**, not render frames.

**Warning signs:**
- Two machines with different refresh rates produce different outcomes.
- `dt` passed into the step varies frame to frame.
- Frame time spikes correlate with physics "explosions" or units flying off-map.
- CPU pinned at 100% and FPS collapsing when the tab regains focus.

**Phase to address:** Sim Host & Loop (foundation phase). The accumulator + clamp is a few lines but must exist before any determinism test can be trusted.

---

### Pitfall 3: Background-tab throttling pauses the simulation mid-training-run

**What goes wrong:**
Long training runs are left unattended. The browser throttles or **fully pauses `requestAnimationFrame`** in background/hidden tabs, and clamps `setTimeout`/`setInterval` to ~1 s. The simulation advances erratically or freezes; the Python driver's request/reply loop hangs or desyncs; hours of training are wasted or silently corrupted.

**Why it happens:**
`rAF` is paused in background tabs in essentially every browser (this is the documented behavior, not a bug). Developers test while watching the tab and never see it. The predecessor's `recv()` was already an untimed busy-wait, so a paused tab = **permanent hang** rather than an error.

**How to avoid:**
- Do **not** drive the simulation from `rAF` when running headless/training. Drive it from a **Web Worker** timer loop or `setTimeout(0)`/`MessageChannel` loop, and treat the physics as independent of rendering. (A hidden tab with an active WebSocket is *exempt* from the timer budget — but `rAF` is not — so keep the WS connection alive and avoid relying on rAF.)
- Render only for recording/interactive sessions; in training mode run the sim "as fast as possible" via the worker loop.
- Detect visibility/`document.hidden` and either (a) continue headless via the worker, or (b) pause explicitly and tell the Python driver (so it doesn't hang).
- Give the bridge **timeouts on every recv** and a heartbeat, so a stalled tab surfaces as a clear error (see Pitfall 6).
- Document the operational rule: "the training tab must exist but need not be visible; do not run in a context that suspends the worker."

**Warning signs:**
- Training throughput collapses when the window is minimized/occluded.
- Python blocks forever in `recv()`; no error.
- Sim tick count lags wall-clock after a period of inactivity.
- Intermittent "works when I watch it, hangs overnight."

**Phase to address:** Training Bridge (mitigation + detection) and Sim Host & Loop (worker-driven stepping). Consider a Web Worker or headless-Chrome (`--disable-background-timer-throttling`) harness as the canonical training mode.

---

### Pitfall 4: Fast weapons/traps tunnel through bodies (CCD gap)

**What goes wrong:**
Arrows, the berserker's "charge", and hammer swings move fast; at a fixed timestep a fast body passes fully through a thin collider in one step, so hits do not register, damage is 0, or a weapon phases through armor. Battles look broken and RL rewards are corrupted.

**Why it happens:**
Rapier auto-sweeps *fast dynamic* bodies against *fixed* colliders, but **not** against other dynamic bodies unless CCD is explicitly enabled. Worse: even with CCD on both, **two CCD-enabled bodies can still tunnel past each other** because Rapier's CCD resolution does not consider both continuous motions simultaneously. Weapons + armor are both dynamic compound parts → classic tunnel case.

**How to avoid:**
- Enable CCD per-body (`setCcdEnabled(true)`) on **projectiles and weapons only** (not on every unit).
- Raise `IntegrationParameters.maxCcdSubsteps` (default 1) if a single pass isn't enough; each substep costs sweeps.
- Reduce `FIXED_DT` or size colliders so that `max_speed * dt < collider_thickness` for the fastest weapon. Prefer thicker weapon colliders (capsules) over thin ones.
- Do **not** use mesh-like colliders for weapons (CCD is disabled for triangle-mesh/polyline/heightfield dynamic bodies).
- Validate with a "sweep test": fire the fastest projectile at a stationary target across the timestep and assert exactly one hit.

**Warning signs:**
- Arrows/charged attacks visually pass through enemies.
- Damage distribution shows zero for fast weapons.
- Hits only register at low frame rates or against large targets.

**Phase to address:** Combat & Damage mechanics phase. Also a determinism interaction: CCD decisions are part of the sim, so enabling CCD changes golden hashes — decide once, early.

---

### Pitfall 5: Contact-event flood, event loss, and double-counted damage

**What goes wrong:**
Every weapon hit needs a damage event derived from contact normal velocity. Naive wiring generates an event **every step while two colliders touch** (not an enter/exit event), so a resting weapon "hits" 60×/second; the machined-armor/weapon compound produces many colliders so one swing emits a dozen events; and under multi-substep CCD an event can start in one substep and vanish before you read it. Result: wildly wrong DPS, unkillable/one-shot units, and contact-handler crashes.

**Why it happens:**
- **Contact-force events fire every step while force exceeds threshold**; they are not enter/exit semantics. Developers expect one-shot hit events.
- **Collision events require `ActiveEvents` flags** on at least one collider — easy to forget → "no events at all".
- Contact geometry may be gone by the time you read the contact graph when multi-substep CCD runs.
- The predecessor's `contact` handler dereferenced `damageInfo[aIdx]` without an `-1` guard → `TypeError` (a real, observed bug).

**How to avoid:**
- Model hits as a **state machine on the attacker/weapon**, not as "an event fired". Compute damage from collision *enter* semantics + a per-weapon cooldown/`already-hit-this-swing` set. Use `ContactForceEvent.started` (true only on the first step force crosses threshold) as the trigger, not every event.
- Set `ActiveEvents.COLLISION_EVENTS` (and `CONTACT_FORCE_EVENTS`) deliberately per collider role; add a test asserting events fire for an attacker/defender pair.
- Guard every handler against `indexOf === -1` / missing units; never index by a color/id that may not exist yet (predecessor crash).
- Aggregate damage per (attacker, defender, swing) and clamp to the weapon's intended single-hit semantics; the spec's damage formula is a *per-hit* quantity.
- Use collision/solver groups so friendly fire, armor-vs-own-weapon, and adjacent body parts of the same compound unit do not generate hit events.

**Warning signs:**
- DPS scales with framerate/step count; units die instantly or never.
- `TypeError: ... undefined` in contact handling (predecessor déjà vu).
- A swing registers 0 hits even though sprites overlap.
- Damage depends on how long the weapon rests against a target.

**Phase to address:** Combat & Damage phase (with the event-semantics unit test as the acceptance criterion).

---

### Pitfall 6: WebSocket bridge desync / silent hang (the predecessor's headline bug, unfixed by accident)

**What goes wrong:**
The Python driver and browser host exchange JSON with only a `type` field and no request id. `send_and_receive()` assumes the *next* inbound message is the reply. A late/buffered message (e.g. a `step` reply arriving after `reset`) permanently mismatches request↔reply. The predecessor hit exactly this, plus: `recv()` had no timeout (hangs forever), `is_connected()` never went false after disconnect, unbounded queues grew without backpressure, and the server bound `0.0.0.0` with no auth. All of these are *guaranteed* to recur unless explicitly designed out.

**Why it happens:**
WebSocket is a raw transport. It gives ordered bytes but **no built-in request/response correlation, no reconnect semantics, no state sync**. Developers carry HTTP's "send, wait for reply" mental model onto it. Under a training loop that fires thousands of messages, any single stray message desyncs the pair.

**How to avoid:**
- **Every message carries a monotonic request id**; replies echo it; the receiver matches against a `Map<id, pending>` and *discards* mismatched/stale ids. (This is the standard production pattern.)
- Add a **protocol version** handshake on connect; reject mismatched versions.
- Add **timeouts to every recv** and a **heartbeat/ping**; a missing reply must raise a clear error, never busy-wait forever.
- On disconnect: `try/finally` discard the socket, drain/refuse stale queued frames, reset pending map, and require a re-`reset` (never resume a half-state).
- **Bound every queue** (`maxsize`) and handle `Full` (backpressure) — unbounded send/recv queues grow without limit when the consumer stalls.
- Bind to `127.0.0.1` by default; add origin/token if ever remote.
- Make the protocol **schema-checked** (generate types from one source for TS + Python) and add contract tests for `reset`/`step`/`action`/`save`/`load`.

**Warning signs:**
- Training "hangs" with no error; only a process kill recovers (predecessor).
- Rewards/observations look plausible but the run diverges from a known-good seed.
- `is_connected()` true after the tab is closed.
- Memory grows on the Python side when the browser is slow.
- Any request handled without an id.

**Phase to address:** Training Bridge phase — build it first as a standalone versioned/correlated protocol with tests, *before* plugging RL in. It is the highest-leverage fix because it blocks trustworthy experiments.

---

### Pitfall 7: Behavior-tree AI produces degenerate, unwatchable battles

**What goes wrong:**
The **Core Value ("战斗必须激烈好看") is violated** by AI, not by graphics. Common degenerate outcomes: units get stuck in map corners/against each other and never engage; ranged units adopt an infinite "kite→nobody closes" stalemate; two sides "turtle" at the battle-area edge and time out; units clump in a shoving match with no damage because nobody can build relative velocity; the melee never resolves. Because the product's whole purpose is footage, a technically-correct-but-boring sim is a **failure**.

**Why it happens:**
- Behavior trees with strict conditions "fail" (return failure) and fall through to an idle/do-nothing leaf.
- Target selection by pure "nearest enemy" ignores distance weighting and funnels a whole side into one scrum.
- The spec's battle-area rule (units leaving the 80×80 weighted-center square leave combat and "slowly stop moving") plus a speed clamp can create a **no-man's-land**: nobody has enough speed to satisfy the damage formula's `(√Δv − 1)` term.
- Without an anti-stall mechanism, RL/rule AI naturally finds the cheapest stable behavior (this is the same failure family as the spec-gaming/reward-hacking literature: agents loop in a small reward orbit instead of finishing).

**How to avoid:**
- Add **anti-stall invariants as first-class design**, not polish: hard timers on engagements, escalating "aggression" when no damage has been dealt for N ticks, forced re-engagement when a unit drifts out of the battle area for too long.
- Use influence-map or **distance-weighted** target selection (the RTS-kiting literature shows distance must be weighted high or units expose themselves / never close). Add wall/corner influence fields so pathing doesn't lock up (a documented kiting pitfall is "getting stuck on a corner or in a closed area").
- Give **every path a time bound and a fallback leaf**; behavior trees must never terminate in "Idle" during combat. Log/visualize which leaf each unit is in — a stuck unit is usually a leaf that returns Running forever.
- Tune the **damage formula's velocity threshold** empirically — if typical closing speeds give `√Δv − 1 ≤ 0`, damage is always 0 and battles cannot resolve. This is a spec-calibration requirement the reference doc explicitly flags ("数值需要实测").
- Run **automated watchability audits** on recorded battles: require ≥ K distinct unit behaviors, require damage events within the first T seconds, flag draws/timeouts/clumps. Treat "0 damage in first 10 s" as a failing test.

**Warning signs:**
- Battles frequently end in timeouts/draws or with all units alive.
- A histogram of unit behavior leaves is dominated by one state (e.g. 90% "approach" or "idle").
- Units alive but stationary (stuck); camera shows them clustered in a corner.
- All engagements resolve in <2 s or never.
- Matches where total damage dealt is 0.

**Phase to address:** Unit AI (Behavior Trees) phase, with a **Watchability tuning/verification phase** immediately after. Watchability metrics should be part of the phase's success criteria, not an afterthought.

---

### Pitfall 8: Listener / object leaks turn multi-hour runs into crashes

**What goes wrong:**
A short run is fine; a 6-hour training run leaks listeners, Rapier objects, Pixi display objects, and effect instances until the tab OOMs or GC pauses destroy the frame budget. The predecessor already had an **unbounded `tickEnd` listener leak**: every frame registered a new listener on a long-lived emitter, never removed (`eventemitter3` warns after 10 listeners).

**Why it happens:**
- Adding a listener per frame/`for` iteration instead of one persistent listener or `once()`.
- Creating a Promise per tick that never resolves on abort.
- Not `destroy()`-ing removed Pixi objects / not freeing Rapier bodies & their handles.
- `activeEvents`/contact handlers accumulating closures per contact.
- Effect/particle objects retained by a pooling structure that never evicts.

**How to avoid:**
- One persistent listener that resolves a stored pending promise; use `once()`; remove on teardown. Never `addEventListener`/`on()` inside the per-frame loop.
- Enforce a **destroy contract**: removing a unit frees its Rapier body/collider(s), removes its Pixi display object, clears timers, and drops references from all maps.
- Pool and recycle effects; cap live projectile/effect counts.
- Add a **long-run soak test** (e.g. 500k ticks headless) asserting stable `performance.memory` / listener count / Rapier body count.
- Instrument with Chrome DevTools Performance monitor (JS heap, DOM nodes, **listener count**) — a linearly rising listener count is the smoking gun.

**Warning signs:**
- Listener count rises monotonically in the Performance monitor / `eventemitter3` "possible EventEmitter memory leak" warnings.
- Heap grows across `reset()` calls (state should return to baseline).
- FPS degrades steadily over a session; GC pauses lengthen.
- `world.bodies.len()` grows across resets.

**Phase to address:** Sim Host & Loop (lifecycle/destroy contract) and Training Bridge (soak test). Make the reset path leak-free and test it explicitly — the predecessor's `map/base.ts` reset had an id-map bookkeeping bug that silently leaked/duplicated bodies.

---

### Pitfall 9: Pixi v8 draw-call explosion and per-frame Graphics redraw

**What goes wrong:**
With "only" 10+ units per side plus weapons, armor, projectiles, health bars, damage popups, and effects, rendering tanks — not because of object *count* but because of batching breakage. The predecessor redrew a **2.4 MB background image at full canvas size every frame** and did per-frame JPEG encode/upload (a documented bottleneck).

**Why it happens:**
- Interleaving object types breaks batches (`sprite/graphic/sprite/graphic` = 4 draw calls vs 2 when grouped).
- Redrawing `Graphics` every frame forces canvas render + GPU re-upload.
- Mixing blend modes / using many masks/filters breaks batches or is expensive.
- Redrawing the same static background instead of caching it.

**How to avoid:**
- Group same-typed objects in the scene graph; keep unit bodies/colliders as **Sprites from one texture atlas** so they batch (up to ~16 textures/hardware).
- Render health bars/static HUD as batched sprites or BitmapText, not per-frame `Graphics`.
- **Cache the static background** (pre-render to an offscreen texture/cached container) — never re-decode/draw the source image every frame.
- Reserve `Graphics` for things that don't change per frame; use `ParticleContainer`+`Particle` for mass effects and declare static vs dynamic properties (static changes need `container.update()`).
- Set `interactiveChildren = false` on non-interactive containers; avoid masks/filters unless needed, and give filters a `filterArea`.

**Warning signs:**
- Draw calls scale with number of projectiles/effects rather than staying flat.
- Frame time dominated by the "Animation Frame Fired" / render task even though physics is cheap.
- GPU-bound when many effects are on screen.

**Phase to address:** Rendering (PixiJS) phase. Measure draw calls and CPU vs GPU-bound early; don't optimize blind.

---

### Pitfall 10: Physics unit mismatch (using pixels as meters)

**What goes wrong:**
Colliders are sized in pixels (e.g. a 100 px unit → `cuboid(50, 50)`). Mass/inertia become enormous, the damage formula (`Δv` in m/s) produces nonsense, solver behavior is erratic, and the golden determinism hash becomes hypersensitive to tiny changes.

**Why it happens:**
The map is 1000×1000 and the natural instinct is to work in pixels. Rapier's docs explicitly call out "a common mistake, especially in 2D, is to use pixels as the length unit."

**How to avoid:**
- Adopt a **scale factor** (e.g. 1 physics meter = N pixels) and keep the physics world in SI (meters/second/kg). The spec already describes speeds in m/s and masses in kg — honor it.
- Convert only at the render boundary.
- Size colliders from real dimensions (unit radius, weapon length) in meters.

**Warning signs:**
- Rigid bodies have huge mass/inertia; forces need absurd magnitudes.
- Damage formula needs arbitrary scaling fudges to work.
- Solver jitter/reset-to-last-valid (Rapier "quarantine" of non-finite values).

**Phase to address:** Physics Core phase (decide the scale once; changing it later invalidates all tuning and golden hashes).

---

### Pitfall 11: Checkpoint/video binaries bloat the git repo

**What goes wrong:**
Training checkpoints (~570 KB each, saved every few iterations) and multi-hundred-MB videos accumulate in the working tree. The predecessor had **~140 MB / 78 checkpoint dirs** and a **126 MB video**, saved inside the repo. Clones/fetches slow down; `.git` grows irreversibly; a long RL campaign fills the disk and the remote.

**Why it happens:**
Output paths default to `os.getcwd()` (predecessor behavior) and checkpoints are written every few iterations with no rotation. Videos are fixed at `-b:v 8000k`.

**How to avoid:**
- Keep checkpoints, videos, and logs **outside the repo tree** (configurable output dir, default to a temp/data dir). Gitignore is necessary but insufficient — history already bloat is hard to remove (needs `git filter-repo`).
- If any large artifact must live in-repo, use **Git LFS** (`.gitattributes`, `git lfs track`) — but prefer not versioning them at all.
- Add **retention/rotation** (keep last N + best) and configurable video bitrate/segmentation.
- CI/automation must never commit generated artifacts.

**Warning signs:**
- `du -sh .git` growing release over release.
- `git status` shows untracked `checkpoint/`/`video/` dirs.
- Clone times increasing; push rejected for size.

**Phase to address:** Training Bridge / Recording phase (config layer + output dir), with a repo-hygiene task in the foundation/scaffold phase.

---

### Pitfall 12: Training the wrong objective — reward bugs and reward hacking

**What goes wrong:**
RL optimizes a broken or gameable proxy. The predecessor's distance-shrinking reward was **identically zero** because `lastLength` and `nowLength` were computed from the same tick's positions — training silently optimized a wrong objective for an entire run. Later, a naive reward will be gamed: units may learn to run in circles for small rewards, turtle, or exploit the spec's experience/damage rules (e.g. farming `√(D−50)` on a helpless target).

**Why it happens:**
Reward terms are easy to get subtly wrong and are rarely tested; the predecessor had **no tests** on the reward/episode lifecycle (highest-risk gap). Reward hacking is a well-documented, near-universal failure mode when the reward is a proxy for "watchable, decisive combat".

**How to avoid:**
- Unit-test every reward term against a hand-computed scenario; assert non-zero sensitivity (e.g. changing relative distance by Δ must change reward by the expected sign/amount).
- Seed all episodes for reproducibility and store the seed with the run.
- Include anti-hacking shaping: penalize stalling/timeouts/no-damage, reward decisiveness; audit trained policies by watching replays, not just by reading scalar reward.
- Track proxy reward **and** a held-out "true objective" (e.g. battle resolves, diverse behaviors, watchability score) and alarm on divergence.
- Make `render()`/`close()`/`seed` in the env real (predecessor left them as silent no-ops), so experiments are reproducible and teardown is clean.

**Warning signs:**
- A reward term is constant zero/one across all states.
- Reward goes up while battles get less watchable / less decisive.
- Policies that exploit one mechanic (e.g. endlessly circling) score highly.
- Env `reset(seed=...)` ignores the seed.

**Phase to address:** RL Unit Control milestone. But the **seeded reset + test harness** must exist in the Training Bridge phase so the reward work starts from a trustworthy base.

---

## Technical Debt Patterns

| Shortcut | Immediate Benefit | Long-term Cost | When Acceptable |
|----------|-------------------|----------------|-----------------|
| Step physics on `rAF` delta | Least code; smooth demos | Non-deterministic sim; breaks RL & cross-platform reproduction | Only for pure visual prototypes, **never** once determinism/RL matters |
| Unversioned JSON bridge messages (no id/version) | Fast to write | Silent desync/hangs; untrustworthy experiments (predecessor's proven bug) | Never |
| `Math.random()` in simulation | Simple spawn variety | Breaks reproducibility entirely | Never in sim paths; use a seeded PRNG |
| Pixels as physics units | No conversion layer | Broken mass/damage tuning; brittle hashes | Never |
| Hard-coded ports/paths/output-to-cwd | No config work | Can't run CI/non-local; artifacts bloat repo (predecessor) | Only in a throwaway spike |
| Committing checkpoints/videos | Easy to inspect | Irreversible repo bloat | Never; use external output dir or LFS |
| `addEventListener` per frame | Easy await wiring | Unbounded leak; OOM over long runs (predecessor) | Never |
| One scene hard-coded in `Main` | Fast first scene | Adding scenes touches many files (predecessor) | Only in the very first scaffold commit |

## Integration Gotchas

| Integration | Common Mistake | Correct Approach |
|-------------|----------------|------------------|
| Rapier2D WASM init | Assuming `RAPIER.init()` finished; using world before ready | Await init before constructing the world; guard the ready state |
| Rapier snapshots | Treating a snapshot as a durable/portable format | Snapshots are build-specific; hash them for tests, never ship them across versions |
| Rapier events | Expecting enter/exit collision semantics | Contact-force events repeat every step; use `.started`/own state machine |
| Rapier CCD | Enabling CCD on everything (or nothing) | CCD only on fast bodies; accept two-CCD-body tunneling; tune substeps |
| Pixi `Graphics` | Mutating geometry every frame | Rebuild only on change; use sprites/atlas for dynamic entities |
| Pixi `ParticleContainer` | Using `addChild`/sprites | Use `addParticle`/`Particle`; call `update()` after static changes |
| WebSocket | Assuming HTTP request/response | Add ids, version handshake, timeouts, heartbeat, bounded queues, disconnect cleanup |
| Browser timers | Relying on `rAF`/`setTimeout` in background | Worker-driven loop; keep WS alive; pause explicitly on hidden |
| Python ↔ TS types | Hand-maintained duplicate schemas | Single source of truth / generated types + contract tests |
| ffmpeg capture | Synchronous `toBlob` per frame on main thread | Throttle to true record rate; OffscreenCanvas off main thread; detect dead ffmpeg |

## Performance Traps

| Trap | Symptoms | Prevention | When It Breaks |
|------|----------|------------|----------------|
| Per-frame full-canvas JPEG encode + WS upload | Frame time dominated by encode/upload; recording drops the sim | Throttle to record rate; OffscreenCanvas; batch frames | As soon as recording is on at 60 FPS |
| Redrawing the 2.4 MB background every frame | High fill rate/CPU even with few units | Pre-render/cache background once | Immediately at full-canvas scale |
| Unbatched mixed object types | Draw calls scale with unit/effect count | Group by type; use atlases | Dozens of mixed sprites |
| Per-frame `Graphics` mutation | GPU uploads every frame | Use sprites/BitmapText; rebuild Graphics only on change | As soon as health bars/effects animate |
| Contact events every step | Event storm; CPU spikes mid-melee | Thresholds + enter-state machine + collision groups | 10+ units clustered |
| Spiral of death on catch-up | FPS collapse→more steps→further collapse | Clamp accumulator; cap steps/frame; drain excess | When sim can't keep up with fixed rate |
| Unbounded queues / no backpressure | Python or browser memory grows when peer stalls | Bounded queues + `Full` handling | Whenever a consumer stalls |
| 0.1 s polling busy-wait in the driver | Up to 100 ms latency/message; CPU burn when idle | Event/queue-driven wakeups | Every request (predecessor) |

## Security Mistakes

| Mistake | Risk | Prevention |
|---------|------|------------|
| Training control socket on `0.0.0.0`, no auth | Anyone on the network can inject actions/`load`/`save` or read state | Bind `127.0.0.1`; add origin/token if remote; no TLS needed locally |
| Loading arbitrary Rapier snapshots / checkpoints | Malformed bytes crash or corrupt the sim | Only load trusted, version-matched snapshots; validate before restore |
| Broad `try/except` around ffmpeg writes | Silent corrupt/partial video | Detect dead ffmpeg; abort/raise rather than keep accepting frames |
| Untrusted bridge input | Malformed JSON can corrupt sim state | Validate/parse defensively; schema-check messages; never trust client ids for auth |

## UX Pitfalls (Watchability)

| Pitfall | User Impact | Better Approach |
|---------|-------------|-----------------|
| Long "nothing happening" stretches (approach phase) | Viewer boredom; footage unusable | Speed-up empty travel; cut to engagement; engagement timers |
| Whole side clumps into one indistinguishable scrum | Can't tell units/classes apart | Distinguish classes visually; influence-map spacing; camera framing |
| Battles end instantly or never | No suspense, violates Core Value | Calibrate damage/speed so fights last a satisfying duration |
| No feedback on hits | Reads as "not working" | Hit flashes, damage numbers, knockback, audio cues |
| Same matchup every time | Repetitive footage | Seeded variety + class counters per the spec's rock-paper-scissors design |
| Stuck/idle units on screen | Looks broken | Anti-stall logic + stuck-unit telemetry + debug overlay |

## "Looks Done But Isn't" Checklist

- [ ] **Determinism:** A golden `takeSnapshot()` hash test exists and passes across runs **and** machines — verify, don't assume.
- [ ] **Seeded reset:** `reset(seed)` actually changes spawn randomness reproducibly — verify two resets with the same seed match.
- [ ] **Fixed timestep:** Physics dt is constant regardless of refresh rate; accumulator clamps — verify on a 144 Hz and 60 Hz machine.
- [ ] **Background training:** Run for 30+ min minimized — verify tick rate and bridge latency don't collapse.
- [ ] **CCD:** Fastest projectile always registers exactly one hit — verify with a sweep test.
- [ ] **Contact semantics:** One swing = one hit regardless of contact duration/framerate — verify.
- [ ] **Bridge protocol:** Every message has id+version; recv has a timeout; disconnect resets state — verify with a forced mid-run kill.
- [ ] **No leaks:** Listener count, JS heap, and Rapier body count are flat across 1000 `reset()` cycles — verify in DevTools.
- [ ] **Watchability:** Recorded battle has ≥K distinct behaviors and damage within T seconds; no timeouts/stalls — verify via automated audit.
- [ ] **Reward sanity:** Each reward term is non-zero and directionally correct under a scripted scenario — verify with unit tests.
- [ ] **Repo hygiene:** No checkpoints/videos tracked; output dir configurable — verify with `git status`/`du -sh .git`.
- [ ] **Physics units:** World is in meters/kg; px↔m conversion only at render — verify collider sizes.

## Recovery Strategies

| Pitfall | Recovery Cost | Recovery Steps |
|---------|---------------|----------------|
| Sim non-determinism discovered late (Pitfall 1) | HIGH | Introduce seeded PRNG + golden-hash harness; audit `Math.random`/trig; likely re-tune damage & invalidate old checkpoints |
| Variable-timestep damage drift (Pitfall 2) | MEDIUM | Bolt on accumulator loop; re-baseline hashes; re-verify damage calibration |
| Bridge desync corrupts a training run (Pitfall 6) | MEDIUM | Stop run; add ids/timeouts/heartbeat; restart from a known seed; discard suspect checkpoints |
| Tunneling found in footage (Pitfall 4) | LOW-MED | Enable per-body CCD + substeps; re-verify sweep test; re-baseline |
| Degenerate AI battles (Pitfall 7) | MEDIUM-HIGH | Add anti-stall rules + distance-weighted targeting + behavior telemetry; retune; re-run watchability audit |
| Leak OOMs long run (Pitfall 8) | MEDIUM | Replace per-frame listeners with `once`/persistent; fix destroy path; add soak test; rerun |
| Repo bloat from binaries (Pitfall 11) | HIGH | Move outputs out of tree; `git filter-repo`/LFS to scrub history; add rotation |
| Reward hacking (Pitfall 12) | MEDIUM-HIGH | Add held-out objective + anti-stall penalties; audit replays; retrain |

## Pitfall-to-Phase Mapping

> Phase names are recommendations for the roadmap. `M2+` denotes later milestones (RL control, kingdom/economy, LLM layers).

| Pitfall | Prevention Phase | Verification |
|---------|------------------|--------------|
| 1. Determinism assumptions | Physics Core & Determinism Harness | Golden snapshot hash stable across runs and machines |
| 2. Variable timestep | Sim Host & Loop (foundation) | Same outcome at 60/144 Hz; accumulator clamp test |
| 3. Background throttling | Sim Host & Loop + Training Bridge | 30-min minimized run keeps tick rate/latency; recv timeout fires |
| 4. Tunneling / CCD | Combat & Damage | Fastest projectile sweep test = exactly one hit |
| 5. Contact-event flood/loss | Combat & Damage | One swing = one hit regardless of contact duration |
| 6. Bridge desync/hang | Training Bridge | Contract tests + forced disconnect recovery; id echo verified |
| 7. Degenerate AI | Unit AI + Watchability Tuning | Automated watchability audit passes (diverse behaviors, damage within T) |
| 8. Listener/object leaks | Sim Host & Loop + Training Bridge soak | Flat listener/heap/body count over 1000 resets |
| 9. Pixi draw-call explosion | Rendering (PixiJS) | Draw calls flat with projectiles/effects; frame budget CPU vs GPU |
| 10. Physics unit mismatch | Physics Core | Colliders in meters/kg; damage calibration sane |
| 11. Repo bloat | Foundation/Scaffold + Recording | `git status` clean of binaries; output dir configurable |
| 12. Reward bugs/hacking | Training Bridge (seed+harness) → RL Control (M2+) | Reward-term unit tests; held-out objective tracked |

## Sources

- Rapier user guide — Determinism (cross-platform conditions, `takeSnapshot` hashing, `enhanced-determinism`, non-deterministic `Math.sin/cos`): https://rapier.rs/docs/user_guides/javascript/determinism/ (HIGH)
- Rapier user guide — Rigid-body CCD (motion clamping, auto-sweep vs fixed, two-CCD-body tunneling, `maxCcdSubsteps`): https://rapier.rs/docs/user_guides/javascript/rigid_body_ccd/ (HIGH)
- Rapier user guide — Advanced collision detection (collision vs contact-force events, `ActiveEvents`, per-step contact events, substep event loss): https://rapier.rs/docs/user_guides/javascript/advanced_collision_detection (HIGH)
- Rapier user guide — Common mistakes (pixels-as-meters, forces, zero mass/quarantine): https://rapier.rs/docs/user_guides/javascript/common_mistakes (HIGH)
- Rapier user guide — Serialization (snapshot not a stable format; build-specific): https://rapier.rs/docs/user_guides/javascript/serialization (HIGH)
- MDN — Page Visibility API / `requestAnimationFrame` (rAF paused in background; timers throttled; WebSocket tabs exempt): https://developer.mozilla.org/en-US/docs/Web/API/Window/requestAnimationFrame , https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API (HIGH)
- Gaffer On Games — "Fix Your Timestep" (fixed dt, accumulator, spiral of death): https://gafferongames.com/post/fix_your_timestep (HIGH)
- PixiJS v8 — Performance Tips (batching, Graphics, masks/filters): https://pixijs.com/8.x/guides/concepts/performance-tips.md (HIGH)
- PixiJS v8 — ParticleContainer/Particle (static vs dynamic, `update()`, API differences): https://pixijs.com/8.x/guides/components/scene-objects/particle-container.md (HIGH)
- WebSocket.org — Best practices / reconnection & state sync (ids, sequence numbers, pipelining vs request-response): https://websocket.org/guides/best-practices , https://websocket.org/guides/reconnection (MEDIUM)
- Chrome DevTools — Fix memory problems / Performance monitor (heap, DOM nodes, listener count, GC pauses): https://developer.chrome.com/docs/devtools/memory-problems (HIGH)
- Reward hacking / specification gaming (loop farming small rewards, stalling, need for held-out objective): Pan et al. "The Effects of Reward Misspecification" arXiv:2201.03544; Shihab et al. arXiv:2507.05619 (MEDIUM)
- RTS kiting via influence maps (wall fields to avoid getting stuck; distance weighting in target selection): AAAI AIIDE 2012 paper (MEDIUM)
- git-lfs / GitHub Docs (binary asset management, migration, per-file limits): https://git-lfs.github.com/ , https://docs.github.com/en/repositories/working-with-files/managing-large-files (HIGH)
- **This repo** — `.planning/codebase/CONCERNS.md` (observed predecessor bugs: WS desync, unbounded listener leak, no recv timeout, `is_connected` never false, contact-handler undefined deref, repo/checkpoint bloat, no tests, per-frame JPEG + 2.4 MB background) (HIGH — observed)

---
*Pitfalls research for: browser-hosted 2D physics battle simulation used as watchable output and RL training substrate*
*Researched: 2026-10-15*
