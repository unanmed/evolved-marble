# Stack Research

**Domain:** Browser-hosted 2D top-down physics combat simulation (deterministic, RL-trainable)
**Project:** AI 版球球王国 / Evolved Marble — Milestone 1 (tactical combat layer)
**Researched:** 2026-10-15
**Confidence:** HIGH on technology choice; MEDIUM on exact version pins (registry-verified this session)

> Scope note: this document answers "what stack, and how to wire it." Renderer (PixiJS) and
> physics (Rapier2D) are **locked decisions** — they are not re-litigated here; instead this
> documents *how to do them well* in TypeScript under Vite, plus the surrounding stack
> (ECS/state, behavior trees, determinism, Python bridge, video capture).

---

## Recommended Stack

### Core Technologies

| Technology | Version | Purpose | Why Recommended |
|------------|---------|---------|-----------------|
| **PixiJS** | `8.22.0` | 2D top-down renderer | Locked. v8 is the current major; single `pixi.js` package, async `app.init()`, WebGL default + optional WebGPU. Best-in-class 2D sprite batch perf for the "many units + effects" scene. Compiles against TS 5/6/7. |
| **@dimforge/rapier2d-deterministic** | `0.21.0` | Rigid-body physics (WASM) | Locked engine, **deterministic build**. The plain `@dimforge/rapier2d` build is only *locally* deterministic per Rapier's own README; the `-deterministic` build guarantees **cross-platform** determinism — required for reproducible RL runs and the "控制等级 = trained-rounds" model ladder. |
| **TypeScript** | `7.0.2` | Language | Latest stable line (native compiler). PixiJS ships explicit TS 5/6/7 support. Fall back to the `5.9.x` line only if a toolchain dep lags on TS7 types. |
| **Vite** | `8.3.4` | Dev server + bundler | Standard for TS/Chrome-only browser apps; fast HMR. Vite 8 (rolldown-based) handles the `.wasm` asset pipeline via the wasm plugin. Requires Node `^20.19.0 \|\| >=22.12.0`. |
| **bitECS** | `0.4.0` | Entity/component storage for the sim core | Data-oriented (SoA TypedArrays), zero-dep, ~5 kb, serialization + multithreading. Keeps the simulation state contiguous and JSON/binary-serializable for RL snapshots and rollback. |

### Supporting Libraries

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| **mistreevous** | `4.3.1` | Behavior-tree runtime for unit AI | Unit-level AI (rules/BT first). TypeScript-native, MDSL/JSON trees, **seedable RNG** (deterministic tree traversal — important for replay/RL), in-browser tree visualizer for authoring. |
| **vite-plugin-wasm** | `3.6.0` | ESM integration for `.wasm` | Needed if you ship the raw `@dimforge/rapier2d-deterministic` (non-compat) build. Peer range Vite 2–8. |
| **vite-plugin-top-level-await** | `1.6.0` | Enables top-level `await` for WASM instantiation | Pair with `vite-plugin-wasm` unless you gate everything behind an async `init()` function yourself. Required in `worker.plugins` too if sim runs in a Worker. |
| **mediabunny** | `1.61.4` | MP4/WebM muxing on top of WebCodecs | For the "帧采集 → 视频" pipeline. Successor to `mp4-muxer` (now **deprecated**). Pure-TS, browser-oriented, handles MP4/MOV/WebM/MKV. |
| **ws** | `8.22.0` | WebSocket server/client for the Node bridge side | If the host side runs under Node (headless/CI testing of the bridge). Python side uses its own `websockets` lib. |
| **eventemitter3** | `5.0.1` | Lightweight typed event bus | Decouple sim events (spawn/death/hit) from renderer + bridge. Already proven in the predecessor prototype. |

### Development Tools

| Tool | Version | Purpose | Notes |
|------|---------|---------|-------|
| **Vitest** | `5.0.4` | Unit/integration tests | Pairs with Vite (peer `^6.4 \|\| ^7 \|\| ^8`). Node `^22.12 \|\| ^24 \|\| >=26`. |
| **@vitest/browser** | `5.0.4` | Real-browser test runner | Use for any test touching WebGL/Pixi, WASM, or WebCodecs (jsdom can't). |
| **Playwright** | `1.64.1` | Headless Chrome driving/e2e + frame capture | Best when you want scripted capture of deterministic runs and CI. Node ≥20. |
| **puppeteer-core** | `25.14.0` | Alternative headless-Chrome driver | Use if you already have a Chrome binary and want direct CDP access. Node ≥22.12. |
| **@types/node** | `26.6.5` | Node typings | Match to your Node runtime. |
| **tsx** | `4.23.15` | Run TS scripts (bridge tooling, capture scripts) | Zero-config TS execution for dev scripts. |
| **ESLint + Prettier** | (flat config) | Lint/format | Carry over the flat-config setup from the old repo. |

---

## Installation

```bash
# Core runtime
npm install pixi.js @dimforge/rapier2d-deterministic bitecs mistreevous eventemitter3

# Video capture (offline render)
npm install mediabunny

# Node-side bridge (only if the host runs under Node too)
npm install ws

# Build plugins (raw WASM route; skip if using the -compat build)
npm install -D vite-plugin-wasm vite-plugin-top-level-await

# Dev / test / QA
npm install -D typescript vite vitest @vitest/browser playwright @types/node tsx
```

Python side (trainer):
```bash
pip install websockets gymnasium pettingzoo numpy
# numpy is used for observation packing on both sides of the bridge
```

---

## Alternatives Considered

| Recommended | Alternative | When to Use Alternative |
|-------------|-------------|-------------------------|
| `@dimforge/rapier2d-deterministic` | `@dimforge/rapier2d` (default build) | Only if you drop the cross-platform-determinism requirement and want max perf. Not recommended given the RL ladder. |
| `@dimforge/rapier2d-deterministic` (+ wasm plugin) | `@dimforge/rapier2d-deterministic-compat` | **Simplest Vite setup**: WASM is base64-inlined, `await RAPIER.init()`, no plugins. Trade ~12 MB unpacked + first-load parse for zero bundler friction. Great for early velocity; switch to the plugin route if bundle size/caching matters. |
| **bitECS** | hand-rolled SoA module | At ~20–40 units (Milestone 1) a plain typed-array "world" module is entirely sufficient. Adopt bitECS when the army/kingdom scale arrives — but design component stores as SoA now so the migration is cheap. |
| **bitECS** | **miniplex** (`2.0.0`) | If you prefer ergonomic object entities and mostly-render-layer state. It's DX-focused, no built-in systems, last published 2023 — fine for menus/UI, weaker for a hot deterministic sim loop. |
| **mistreevous** | hand-rolled FSM/BT | If unit AI stays a handful of hardcoded states. BTs pay off once classes/weapons/skills multiply (7 classes × 6 weapons × skills). |
| **Vite** | esbuild/rolldown direct, or webpack | Vite is the standard and its WASM story is now mature; no reason to leave. |
| **mediabunny (WebCodecs)** | `MediaRecorder` | MediaRecorder is realtime-only and **drops frames** — acceptable for casual capture, not for a deterministic "成片". |
| **mediabunny (WebCodecs)** | ffmpeg CLI from captured PNG frames | Robust offline muxing fallback (and what "帧采集 → 视频" literally implies). Slower; needs disk round-trip. Keep as the fallback path. |
| **WebSocket bridge** | gRPC / gRPC-web | Only if you later add many concurrent remote clients with a proto contract. Browser gRPC needs grpc-web + a proxy — extra moving parts for a local trainer. |
| **Vue for menus (optional UI)** | — | The predecessor used Vue for the whole shell; **do not couple the sim to Vue**. Keep the sim core pure TS. A tiny UI layer (Vue/React/vanilla) for HUD/devtools is fine and orthogonal. |

---

## What NOT to Use

| Avoid | Why | Use Instead |
|-------|-----|-------------|
| **planck-js** (`1.3.0`, used by the predecessor) | Effectively unmaintained; no cross-platform determinism guarantee; carries no benefit over Rapier. | `@dimforge/rapier2d-deterministic` |
| **Matter.js** | Not built for deterministic simulation (float/iteration order, no cross-platform guarantee), weaker for RL reproducibility and compound bodies. | Rapier2D |
| **p2.js** | Unmaintained for years; no determinism guarantees. | Rapier2D |
| **`@motajs/client`** (predecessor renderer) | Proprietary, replaced by the locked PixiJS decision. | `pixi.js` v8 |
| **behavior3js / behavior3ts** | Original Behavior3 JS port; last meaningful activity ~2015–2016; abandoned, no ES modules/types on the TS fork. | `mistreevous` 4.3.1 |
| **`mp4-muxer`** | Explicitly **deprecated** on npm ("superseded by Mediabunny"). | `mediabunny` 1.61.4 |
| **`MediaRecorder` for canonical exports** | Realtime capture; frame drops make the output non-reproducible and uneven. | WebCodecs `VideoEncoder` + mediabunny |
| **Coupling physics `world.step()` to `requestAnimationFrame`** | Variable dt ⇒ non-deterministic physics; breaks replay, RL, and cross-machine reproducibility. | Fixed-timestep accumulator (below) |
| **Running the AI (BT) from the render tick** | AI must tick at the game's fixed 0.1 s cadence (6 × 1/60 s), not per rendered frame. | Decimate AI to every 6th fixed step |
| **Global `Math.random()` in sim/AI** | Non-seeded randomness destroys reproducibility. | One seeded PRNG in the sim core; pass seeds into mistreevous |
| **Using `Math.sin/cos` to *initialize* bodies** | Transcendental functions are not cross-platform-deterministic and poison otherwise-deterministic physics. | Precompute constants, or derive init values from determinism-safe ops only |
| **Node-only APIs inside the sim core** | The sim must run in the browser; Node deps leak into the bundle and break Chrome target. | Keep the bridge/Node concerns in a separate host package |

## Stack Patterns by Variant

**If you want fastest path to a running scene (recommended for Phase 1):**
- Use the **compat** physics build (`@dimforge/rapier2d-deterministic-compat`) → `await RAPIER.init()`, no Vite WASM plugins.
- Because it removes the single most common Vite+WASM setup failure mode, letting you prove the loop/render/physics closed loop first.

**If bundle size and caching matter (production):**
- Use `@dimforge/rapier2d-deterministic` + `vite-plugin-wasm` + `vite-plugin-top-level-await`, `build.target: 'esnext'`.
- Because the WASM is emitted as a normal cacheable `.wasm` asset instead of a ~12 MB base64 JS blob.

**If the sim outgrows one thread (armies scale up):**
- Move the deterministic sim into a **Web Worker** and keep Pixi on the main thread; share state via `SharedArrayBuffer` (bitECS supports TypedArray/thread-friendly stores).
- Because it isolates the fixed-step sim from render jank, and matches Rapier's WASM-in-worker support.
- **Determinism caveat:** worker scheduling must not change the *order* of steps — only *when* they run. Step count and ordering stay fixed.

**If headless CI/training needs to run without a visible browser:**
- Run Chrome headless via Playwright/puppeteer-core, drive the same browser bundle, capture frames with WebCodecs or CDP screenshots.
- Because the sim is Chrome-only anyway; headless Chrome is the same engine.

---

## Deep Dive: Rapier2D + Vite WASM setup

Rapier ships as WebAssembly, so it **must be initialized asynchronously**. There are three
delivery shapes, all at `0.21.0`:

| Package | WASM delivery | Init | Bundler needs |
|---------|---------------|------|---------------|
| `@dimforge/rapier2d` | separate `.wasm` | dynamic `import()` | proper WASM handling |
| `@dimforge/rapier2d-deterministic` | separate `.wasm` | dynamic `import()` | `vite-plugin-wasm` (+ top-level-await) |
| `@dimforge/rapier2d-deterministic-compat` | **base64 inlined in JS** | `await RAPIER.init()` | none |

**Route A — raw WASM + Vite plugins (production default):**

```ts
// vite.config.ts
import { defineConfig } from 'vite';
import wasm from 'vite-plugin-wasm';
import topLevelAwait from 'vite-plugin-top-level-await';

export default defineConfig({
  plugins: [wasm(), topLevelAwait()],
  build: { target: 'esnext' },          // top-level await requires a modern target
  worker: { plugins: () => [wasm(), topLevelAwait()] }, // if sim runs in a Worker
});
```

```ts
// physics init (async, once)
import RAPIER from '@dimforge/rapier2d-deterministic';

const world = new RAPIER.World({ x: 0, y: 0 });   // top-down: gravity often 0
// ... build ground/walls, bodies, colliders ...
```

**Route B — compat (zero-friction default for Phase 1):**

```ts
import RAPIER from '@dimforge/rapier2d-deterministic-compat';

await RAPIER.init();                 // decodes + instantiates inlined WASM
const world = new RAPIER.World({ x: 0, y: 0 });
```

**Determinism rules (enforced by the stack, not optional):**
- Use the **`-deterministic`** build — the default `@dimforge/rapier2d` build does **not** guarantee cross-platform determinism.
- **Identical insertion/removal order** for rigid-bodies, colliders, and joints. Control ordering explicitly (e.g. spawn from a serialized roster with stable IDs); never rely on iteration order of a Map/Set that can vary.
- **Identical sequence of fixed timesteps** on every machine — never a frame-rate-derived `dt`.
- Non-deterministic transcendentals (`Math.sin/cos/tan`) must not feed init values. Rapier's own math helpers are safe; compute geometry constants ahead of time.
- Use `world.takeSnapshot()` → hash bytes as a **determinism regression test** (same step count ⇒ same hash).

**Composite bodies** (unit body + weapon + armor, per the design doc) map to Rapier as one
parent rigid-body with multiple colliders (or joints), so damage-by-collision can be resolved
from contact events between the weapon collider and the target's armor collider.

---

## Deep Dive: PixiJS v8 specifics

The v8 API differs substantially from v7 — write to v8 directly, do **not** port v7 patterns.

**Async init is mandatory (WebGPU support):**
```ts
import { Application, Assets, Container, Sprite } from 'pixi.js';

const app = new Application();
await app.init({
  width, height,
  backgroundColor: 0x0b0b10,
  preference: 'webgl',          // 'webgpu' opt-in; Chrome-only target lets you test both
  antialias: true,
});
document.body.appendChild(app.canvas);   // v8: app.canvas, NOT app.view
```

Key v8 points that bite:
- **One package**: everything imports from `'pixi.js'`; the old `@pixi/*` sub-packages are deprecated.
- `app.canvas` replaces `app.view`; the `Application` type parameter is now `Renderer<…>`, not the canvas element.
- **`ApplicationOptions` goes to `init()`**, not the constructor.
- `Texture.from(url)` no longer loads from a URL — use `Assets.load()` (the predecessor already used `Assets`-style loading via its toolkit; keep that pattern).
- **Graphics API overhaul**: shape-then-fill (`g.rect(...).fill(color)` / `.stroke(...)`); old `beginFill/endFill` are gone. Debug collider drawing must use the new API.
- Extension sub-imports (`pixi.js/unsafe-eval`, `pixi.js/math-extras`, `pixi.js/text-bitmap`, …) are opt-in; disable auto-import with `manageImports: false` if you want a lean bundle.
- `Ticker` drives rendering; **never** put physics in the Ticker callback directly — see the loop pattern below.

**Camera / viewport:** use **`pixi-viewport` `6.0.3`** (peer `pixi.js >= 8`) for pan/zoom/follow.
For a scripted "成片" you mostly need `viewport.follow(target)` and `viewport.moveTo/zoom`;
its input plugins (drag/wheel) are for interactive/dev modes and can be disabled for recording.

**Rendering many units:** keep sprites in flat `Container`s; for large counts switch to
`ParticleContainer` + `Particle`; batch by texture. Update `sprite.x/y/rotation` from the sim's
**interpolated** state each render frame (never mutate sim state from the renderer).

## Deep Dive: Deterministic fixed-timestep loop

The canonical pattern (Gaffer On Games, *Fix Your Timestep*) is the only correct loop here:
**fixed-step simulation, variable-rate rendering, accumulator for the remainder.**

Map of the design doc's time system onto the loop:
- Game **tick = 1 game minute**. At battle speed (1×), 1 real second = 1 game hour ⇒
  tick = 1/60 real second ⇒ **fixed step = 1/60 s (60 Hz)**.
- **AI decision cadence = every 0.1 s = every 6 fixed steps** (matches "AI 每 6 帧操控一次").
- At 24× (no battle) the tick stays fixed; you simply run **more ticks per real second**
  (a time-scale multiplier on *how many* fixed steps you execute), never a larger `dt`.

```ts
const STEP = 1 / 60;              // seconds of sim time per tick (deterministic, never varies)
const AI_EVERY = 6;               // AI acts every 6 steps (0.1 s)
const MAX_STEPS_PER_FRAME = 8;    // spiral-of-death guard
let acc = 0, last = performance.now(), tick = 0;

function frame(now: number) {
  let dt = (now - last) / 1000; last = now;
  dt = Math.min(dt, 0.25);        // clamp wall-clock spike   (Gaffer)
  acc += dt * timeScale;          // timeScale = 1 (battle) or 24 (peace)
  let steps = 0;
  while (acc >= STEP && steps < MAX_STEPS_PER_FRAME) {
    if (tick % AI_EVERY === 0) ai.tick(world);   // behavior trees, seeded RNG
    world.step();                                // Rapier; always the same STEP
    sampleHistory();                             // keep prev state for interpolation
    acc -= STEP; tick++; steps++;
  }
  if (steps === MAX_STEPS_PER_FRAME && acc > STEP) acc = 0; // accept graceful slowdown
  const alpha = acc / STEP;      // [0,1) interpolation factor for the renderer
  render(alpha);                 // Pixi: draw lerp(prev, curr, alpha)
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
```

Rules that keep this deterministic:
- `world.step()` is fed the **same** `STEP` every tick (or Rapier's own fixed `timestep`);
  the sim never sees `dt` derived from the frame.
- The **renderer is a pure consumer**: it reads sim state (+ interpolation `alpha`) and writes
  only to Pixi objects. It never advances physics or AI.
- All randomness comes from **one seeded PRNG** in the sim core; pass its seed into mistreevous.
- Keep a `sampleHistory()` ring buffer (prev/curr transforms + rotation) so render interpolation
  is smooth at 144 Hz while physics stays pinned at 60 Hz.

---

## Deep Dive: Browser ↔ Python bridge (training)

**Recommendation: WebSocket.** The predecessor already proved the
"browser = env host, Python = driver" pattern over WebSocket; keep it, and fix the known
protocol defects (no correlation IDs, no disconnect cleanup). Constraints that decide this:
browsers cannot open raw TCP/UDP sockets; **shared memory is not available** between a browser
process and a Python process (only *within* a process tree, e.g. workers); gRPC requires
grpc-web + a proxy for browsers — extra machinery for a local trainer.

**Transport choice summary:**

| Option | Fit | Verdict |
|--------|-----|---------|
| **WebSocket (JSON or binary)** | Native in browser + Python (`websockets`), simple, local | ✅ Recommended |
| gRPC / gRPC-web | Needs Envoy/proxy between browser and Python; binary schemas | ✗ Overkill for local training |
| SharedArrayBuffer | Not cross-process (browser⇄Python) | ✗ Not applicable |
| HTTP long-poll / SSE | Higher latency, one-directional | ✗ |

**Protocol requirements (retire the predecessor's bugs):**
1. **Message correlation**: every request carries an `id`; responses echo it. No fire-and-forget.
2. **Lifecycle**: explicit `reset(seed, scenario)` / `step(actions)` / `observe()` / `close()`;
   idempotent `reset` with a **seed** (so runs are reproducible — this is where Rapier
   determinism + seeded RNG pay off).
3. **Disconnect cleanup**: heartbeat/ping, server-side session teardown, no leaked sim loops.
4. **Binary observations**: send `Float32Array` observation vectors as **binary** WS frames
   (not JSON) to avoid serialization cost; keep JSON only for control/metadata messages.
5. **Multi-agent shape**: observations/actions are per-unit (PettingZoo `ParallelEnv`), matching
   "every unit is AI-controlled."

**Python side:** `websockets` (async) for the transport; wrap the bridge in a
**Gymnasium `Env` / PettingZoo `ParallelEnv`** so any RLlib/other trainer can drive it without
knowing about the browser. Keep the RL algorithm out of this milestone (rules/BT first), but make
the env interface real now so the later RL milestone is a drop-in.

**Where the trainer lives:** keep Python in a sibling package (`model/` rewritten); the browser
bundle must never import Node-only or Python-facing code. The bridge module is the *only* seam.

---

## Deep Dive: Recording to video ("帧采集 → 视频")

Two viable pipelines; ship the first, keep the second as fallback.

**A. In-browser WebCodecs + muxer (recommended):**
- Render the scene to an **`OffscreenCanvas`/`app.canvas` at exact frame timestamps** by stepping
  the sim a fixed number of ticks per output frame (e.g. 60 output frames/sec of timeline,
  decoupled from real time). This makes the export **deterministic and smooth** regardless of
  machine speed.
- `new VideoFrame(canvas, { timestamp })` → `VideoEncoder.encode(frame, { keyFrame })` →
  `mediabunny` muxer → download/share the `.mp4`.
- Prefer H.264/AVC in MP4 for the widest "成片" compatibility; VP9/AV1 in WebM as an option.
- **Why not `MediaRecorder`:** it records in *realtime* and silently drops frames under load —
  the output would not match a deterministic run.

**B. ffmpeg CLI from captured frames (fallback / high-fidelity):**
- Capture PNG/JPG frame sequences (from the same fixed-step loop), mux offline:
  `ffmpeg -framerate 60 -i "%05d.png" -pix_fmt yuv420p -movflags +faststart out.mp4`.
- More robust for very high resolutions; slower and needs a disk round-trip. Keep the frame
  exporter in the capture tooling, not in the sim core.

**C. Headless capture (for CI/repeatable batches):** drive the page with Playwright/puppeteer-core
headless Chrome and pull frames via CDP or the same WebCodecs path. Same engine as the target
(Chrome), so output is representative.

**Compositing note (future LLM director):** overlay text/captions (director commentary, unit
stats) as Pixi objects *before* encoding — do not post-process video for overlays; keep a single
render pipeline so the recorded frame and the on-screen frame are identical.

## Version Compatibility

| Package A | Compatible With | Notes |
|-----------|-----------------|-------|
| `vite@8.3.4` | Node `^20.19.0 \|\| >=22.12.0` | Vite 8 is rolldown-based. Local Node is v24.21.0 → OK. |
| `vitest@5.0.4` | `vite@^6.4 \|\| ^7 \|\| ^8`; Node `^22.12 \|\| ^24 \|\| >=26` | Matches Vite 8 + Node 24. |
| `@vitest/browser@5.0.4` | `vitest@5.0.4` (exact peer) | Keep the two versions locked together. |
| `pixi.js@8.22.0` | TypeScript 5, 6, **and 7** | PixiJS explicitly added TS 6/7 support in recent releases; `@webgpu/types` is bundled. |
| `pixi-viewport@6.0.3` | `pixi.js >= 8` | v6 targets Pixi v8. Do **not** use v5.x (v7-era). |
| `@dimforge/rapier2d-deterministic@0.21.0` | `vite-plugin-wasm@3.6.0` | wasm plugin supports Vite 2–8. Pair with `vite-plugin-top-level-await@1.6.0`. |
| `@dimforge/rapier2d-deterministic-compat@0.21.0` | any bundler | WASM base64-inlined; only `await RAPIER.init()`. |
| `mediabunny@1.61.4` | Chrome WebCodecs | Chrome-only target is fine; H.264/AV1/VP9 encode support varies by codec config — feature-detect with `VideoEncoder.isConfigSupported()`. |
| `puppeteer-core@25.14.0` | Node `>=22.12.0` | Node 24 OK. `ws` is a transitive dep (8.22.0). |
| `playwright@1.64.1` | Node `>=20` | Bundles its own browser download. |
| `@types/node@26.6.5` | TS `>=5.6` (ships `typesVersions` shims) | Match the major to your actual Node runtime where possible. |
| `typescript@7.0.2` | — | Latest stable **native** compiler line. If a specific plugin's `.d.ts` hasn't adapted, pin the `5.9.x` line as an escape hatch. |

**Do-not-mix warnings:**
- Don't install both a `pixi.js` v8 and a `pixi-viewport` v5 — peer mismatch and event-system breakage.
- Don't mix the plain and `-deterministic` Rapier builds in one bundle (two WASM instances, two determinism domains).
- Don't run `vite-plugin-wasm` without `build.target: 'esnext'` (or `es2022`) — top-level await won't transform.
- Don't let `@dimforge/rapier2d*` get pre-bundled by esbuild without the wasm plugin — that's the classic "No loader is configured for '.wasm'" error.

---

## Roadmap Implications (for phase planning)

1. **Phase 1 — closed loop, compat build:** Vite + Pixi v8 async init + Rapier compat + fixed-step loop. No ECS lib, no bridge yet. Prove determinism with a `takeSnapshot()` hash test.
2. **Phase 2 — combat content:** bitECS (or SoA world), composite bodies, damage formulas from the reference doc, mistreevous unit AI at the 6-step cadence.
3. **Phase 3 — bridge:** WebSocket protocol (correlation IDs, seed-driven reset, cleanup) + Gymnasium/PettingZoo wrapper in Python. No RL algorithm yet.
4. **Phase 4 — capture:** WebCodecs + mediabunny "成片" export, driven by the deterministic loop.
5. **Later:** swap compat→plugin WASM route if bundle size matters; scale entities (workers/SharedArrayBuffer); introduce RL behind the existing env interface; add the reserved LLM commander/director interfaces.

**Stack-level research flags:** only the **Rapier determinism guarantee** and the **WebCodecs codec availability** warrant a quick spike in Phase 1 (a hash-stability test across two machines, and a `isConfigSupported()` probe). Everything else is standard and low-risk.

---

## Sources

- **npm registry** (`registry.npmjs.org/.../latest` for each package) — exact current versions verified this session: `pixi.js@8.22.0`, `@dimforge/rapier2d@0.21.0`, `@dimforge/rapier2d-deterministic@0.21.0`, `@dimforge/rapier2d-deterministic-compat@0.21.0`, `vite@8.3.4`, `typescript@7.0.2`, `mistreevous@4.3.1`, `bitecs@0.4.0`, `miniplex@2.0.0`, `pixi-viewport@6.0.3`, `vite-plugin-wasm@3.6.0`, `vite-plugin-top-level-await@1.6.0`, `vitest@5.0.4`, `@vitest/browser@5.0.4`, `playwright@1.64.1`, `puppeteer-core@25.14.0`, `mediabunny@1.61.4`, `mp4-muxer@5.2.2` (deprecation notice), `ws@8.22.0`, `@types/node@26.6.5`, `tsx@4.23.15`. **Confidence: HIGH** (primary source of truth for versions).
- **Rapier docs — Getting started (JavaScript 0.21)** (`rapier.rs/docs/user_guides/javascript/getting_started_js`) — async WASM load, compat vs standard, `debugRender()`. **Confidence: HIGH** (official docs).
- **Rapier docs — Determinism (JavaScript/templates)** + `dimforge/rapier` `typescript/README.md` — WASM cross-platform determinism, `-deterministic` build semantics, insertion-order and transcendental-function caveats. **Confidence: HIGH** (official docs), with a noted internal inconsistency re: the default build (docs page vs README) — resolved in favor of the `-deterministic` build.
- **PixiJS docs — v8 Migration Guide & Application** (`pixijs.com/8.x/guides/...`) — async `init`, `app.canvas`, single-package imports, Graphics overhaul, TS 5/6/7 support. **Confidence: HIGH** (official docs).
- **vite-plugin-wasm README (npm/GitHub Menci)** — usage with top-level-await, Vite 2–8, worker config. **Confidence: MEDIUM** (project docs, cross-checked).
- **Gaffer On Games — "Fix Your Timestep!"** + multiple community guides — accumulator pattern, clamping, interpolation, spiral-of-death. **Confidence: HIGH** (canonical reference, widely corroborated).
- **MDN / Chrome Developers — WebCodecs** + `mediabunny` / `mp4-muxer` READMEs — `VideoEncoder`/`VideoFrame`, muxing, MediaRecorder limitations. **Confidence: HIGH** (MDN/Chrome official) + **MEDIUM** (library docs).
- **mistreevous / bitECS / miniplex READMEs & npm** — feature sets, maintenance status, determinism-relevant features (seeded RNG, SoA/serialization). **Confidence: MEDIUM**.
- **Gymnasium / PettingZoo docs** — env interface shape for the Python trainer wrapper. **Confidence: HIGH** (official docs).
- **Predecessor codebase** (`.planning/codebase/STACK.md`) — prior art: Vue + `@motajs/client` + `planck-js` + Python RLlib over WebSockets; source of the "known defects" list to fix. **Confidence: HIGH** (local artifact).

---

*Stack research for: browser-hosted 2D physics combat simulation (PixiJS + Rapier2D, TypeScript)*
*Researched: 2026-10-15*
*Version pins verified against the npm registry on 2026-10-15; re-verify before locking `package.json`.*
