# Phase 1: Foundation & Deterministic Sim Core - Pattern Map

**Mapped:** 2026-10-15
**Files analyzed:** 34 (12 sim core · 3 host · 8 tests · 1 test helper · 10 config/tooling)
**Analogs found:** 7 exact/partial (all config/tooling carry-forward) / 34 — **27 files have NO code analog**

---

## ⚠️ Framing: this is a greenfield rewrite — read this first

`src/` and `model/` are **fully discarded** (CONTEXT.md `<code_context>`, PROJECT.md Rewrite constraint).
The stacked predecessor (Vue + `@motajs/client` + `planck-js` + Python RLlib) shares **almost no stack**
with the new one (TS7 + Vite8 + PixiJS + Rapier2D, Phase 5/2). Therefore:

- **Predecessor source files are ANTI-PATTERN references, not pattern analogs.** Do not copy
  `src/scene/**`, `src/train/**`, `src/body/**`, `src/map/**`, `src/utils/**`, `model/**`.
- **The source of truth for all NEW sim/host/test files is the research**, not existing code:
  `01-RESEARCH.md` (Patterns 1–6, Examples 1–5), `.planning/research/ARCHITECTURE.md` (Patterns 1–8,
  structure, determinism table), and `.planning/reference/ai-marble-kingdom.md` (§时间系统, §AI 控制).
- **Only the config/tooling files are genuine carry-forward analogs** — they exist, are git-tracked,
  and are modified (not replaced): `.prettierrc`, `package.json`, `tsconfig.json`, `eslint.config.js`,
  `.gitignore`, `vite.config.ts`. These are the 7 matches reported above.

Every "analog" path below was verified git-tracked via `git ls-files` (no `.gsd/capabilities` mirror paths).

---

## File Classification

| New/Modified File | Role | Data Flow | Closest Analog | Match Quality |
|-------------------|------|-----------|----------------|---------------|
| **Config / tooling (carry-forward)** | | | | |
| `.prettierrc` | config | — | `.prettierrc` (existing) | exact (keep as-is) |
| `package.json` | config | — | `package.json` (existing) | exact (modify) |
| `tsconfig.json` | config | — | `tsconfig.json` (existing) | exact (modify) |
| `tsconfig.sim.json` | config | — | `tsconfig.json` (existing) | partial (new, extends base) |
| `eslint.config.js` | config | — | `eslint.config.js` (existing) | exact (modify/extend) |
| `.gitignore` | config | — | `.gitignore` (existing) | exact (extend) |
| `vite.config.ts` | config | — | `vite.config.ts` (existing) | exact (strip Vue/proxy) |
| `vitest.config.ts` | config | — | **none** | none → RESEARCH Ex.3 |
| `.githooks/pre-commit` | config/script | event-driven (commit) | **none** | none → RESEARCH Ex.4 |
| **Sim core (`src/sim/**`, DOM-free)** | | | | |
| `src/config/sim.ts` | config | — | **none** (pred hardcodes constants) | none |
| `src/sim/core/clock.ts` | service | fixed-step | **none** (anti: `src/utils/excite.ts`) | none |
| `src/sim/core/rng.ts` | service/utility | transform | **none** | none |
| `src/sim/core/math.ts` | utility | transform | **none** | none |
| `src/sim/core/events.ts` | utility/model | event-driven | **none** | none |
| `src/sim/world/entity-store.ts` | store/model | CRUD | **none** (anti: `src/body/base.ts`) | none |
| `src/sim/world/world.ts` | model | — | **none** | none |
| `src/sim/systems/movement.ts` | system | transform | **none** | none |
| `src/sim/content/formulas.ts` | config/data | — | **none** (anti: hardcoded consts) | none |
| `src/sim/commands.ts` | model/contract | request-response | **none** | none |
| `src/sim/snapshot.ts` | utility | serialize/transform | **none** | none |
| `src/sim/battle-sim.ts` | service/facade | request-response | **none** | none |
| **Host (`src/host/**`, DOM-free except `pump-browser`)** | | | | |
| `src/host/loop.ts` | utility | request-response (budget→steps) | **none** (anti: `src/utils/excite.ts`) | none |
| `src/host/pump.ts` | utility | request-response | **none** | none |
| `src/host/pump-browser.ts` | utility | request-response | **none** | none |
| **Tests (no test infra exists)** | | | | |
| `tests/helpers/run-sim.ts` | test helper | batch (run N ticks) | **none** | none |
| `tests/sim/clock.test.ts` | test | — | **none** | none |
| `tests/sim/rng.test.ts` | test | — | **none** | none |
| `tests/sim/entity-store.test.ts` | test | — | **none** | none |
| `tests/sim/snapshot.test.ts` | test | — | **none** | none |
| `tests/sim/headless.test.ts` | test | — | **none** | none |
| `tests/host/loop.test.ts` | test | — | **none** | none |
| `tests/determinism/gate.test.ts` | test | — | **none** → RESEARCH Ex.3 | none |

> **Naming note (planner decision):** the predecessor used lowercase-no-separator file names
> (`sword1v1`, `excite.ts`); the recommended Phase-1 structure in RESEARCH/ARCHITECTURE uses
> **kebab-case** (`entity-store.ts`, `battle-sim.ts`, `pump-browser.ts`). Follow the RESEARCH
> structure names; do not carry the old separator-less habit.

---

## Pattern Assignments — Config / Tooling (carry-forward analogs)

### `.prettierrc` (config) — KEEP VERBATIM

**Analog:** `.prettierrc` (tracked, existing) — lines 1-13.

This is the one predecessor artifact the research explicitly says to carry over
(RESEARCH "Wave 0 Gaps": "`.prettierrc` carried over from the old repo"). Copy as-is; it is the
source of truth for all formatting decisions on the new files.

```json
{
    "printWidth": 80,
    "tabWidth": 4,
    "useTabs": false,
    "semi": true,
    "singleQuote": true,
    "quoteProps": "as-needed",
    "bracketSpacing": true,
    "vueIndentScriptAndStyle": false,
    "arrowParens": "avoid",
    "trailingComma": "none",
    "endOfLine": "auto"
}
```
> `vueIndentScriptAndStyle` is now inert (no Vue in the new stack) but harmless; leave it to keep
> the diff minimal, or drop it — planner's call.

### `package.json` (config) — MODIFY

**Analog:** `package.json` (tracked, existing) — lines 1-33.

**Reuse:** the `"type": "module"` + `"private": true` + scripts shape (lines 2-10).

**Replace** the entire `dependencies` (lines 25-32) and `devDependencies` (lines 11-24) — the whole
predecessor stack (`@motajs/client`, `vue`, `planck-js`, `eventemitter3`, `lodash-es`,
`mutate-animate`, `@vitejs/plugin-vue-jsx`) is discarded.

```jsonc
// target shape — RESEARCH "Standard Stack > Installation"
{
  "type": "module",
  "packageManager": "pnpm@12.5.1",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.sim.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "gate": "vitest run tests/determinism",
    "lint": "eslint ."
  }
}
```
**Pitfall 1 & 2 (RESEARCH):** use the official side-by-side layout under **pnpm**:
`"typescript": "npm:@typescript/typescript6@^6.0.2"` (TS6 API for typescript-eslint) +
`"@typescript/native": "npm:typescript@^7.0.2"` (native `tsc`). Re-run `npm view` for every pin
before locking (all pins are MEDIUM confidence / bleeding-edge).

### `tsconfig.json` (config) — MODIFY

**Analog:** `tsconfig.json` (tracked, existing) — lines 1-27.

**Keep** (lines 3-19): `target/module: ESNext`, `moduleResolution: "bundler"`, `strict: true`,
`noEmit: true`, `skipLibCheck`, `moduleDetection: "force"`, `allowImportingTsExtensions`,
`baseUrl` + `paths: { "@/*": ["src/*"] }` (lines 21-24) — the `@/` alias stays a project convention.

**Remove** the Vue-specific settings (lines 9-10): `"jsx": "preserve"`, `"jsxImportSource": "vue"`.

**Add (TS7/Pitfall 7):** explicit `"rootDir"` (TS7 no longer infers it); drop `downlevelIteration`
(removed); keep base `lib: ["ESNext", "DOM", "DOM.Iterable"]` for `host/pump-browser.ts` (later `render/`).
**Widen `include`** beyond `["src"]` (line 26) to also cover `tests/**` (the base project is the
Node/DOM side).

### `tsconfig.sim.json` (config) — NEW, extends base

**Analog:** `tsconfig.json` (existing) as the `extends` target — partial match only; the DOM-free
overrides are new code.

```jsonc
// RESEARCH Example 1
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"],        // ← NO "DOM", NO "DOM.Iterable"
    "types": [],              // ← no @types/node inside sim/
    "rootDir": "src/sim"      // ← TS 7 no longer infers rootDir
  },
  "include": ["src/sim/**/*.ts"]
}
```
This is the **type-level half** of the headless boundary (SIM-03); every DOM global becomes a compile error inside `sim/`.

### `eslint.config.js` (config) — MODIFY / EXTEND

**Analog:** `eslint.config.js` (tracked, existing) — lines 1-49 (flat config, 4-space, single quotes).

**Keep** the base shape: flat config, `ignores` (line 8), `eslint.configs.recommended`,
`...tseslint.configs.recommended` (lines 10-11), the TS rules block (lines 25-47: `no-console: warn`,
`eqeqeq: always`, `no-unused-vars` with `^_` patterns, `no-explicit-any: off`), and
`eslintPluginPrettierRecommended` (line 48).

**Add** a per-directory `sim/**` boundary block — the **import-level half** of the headless boundary:

```js
// RESEARCH Example 2 (excerpt) — add as a new config object in the flat array
{
    files: ['src/sim/**/*.ts'],
    rules: {
        'no-restricted-imports': ['error', {
            patterns: [
                { group: ['**/render/**', '**/host/**', '**/driver/**', 'pixi.js', 'pixi.js/*', 'node:*'],
                  message: 'sim/ must stay headless: no render/host/driver/pixi/node imports.' }
            ]
        }],
        'no-restricted-globals': ['error',
            { name: 'window', message: 'sim/ is headless.' },
            { name: 'document', message: 'sim/ is headless.' },
            { name: 'requestAnimationFrame', message: 'Pacing lives in host/.' },
            { name: 'performance', message: 'Time is TickClock — never the wall clock.' },
            { name: 'Date', message: 'No wall-clock in sim/.' },
            { name: 'setTimeout', message: 'No timers in sim/.' }
        ],
        'no-restricted-properties': ['error',
            { object: 'Math', property: 'random', message: 'Use RandomStreams (seeded).' },
            { object: 'Date', property: 'now', message: 'Use TickClock.tick.' },
            { object: 'performance', property: 'now', message: 'Use TickClock.tick.' }
        ],
        'no-restricted-syntax': ['error',
            { selector: "NewExpression[callee.name='Date']", message: 'No wall-clock in sim/.' }
        ]
    }
}
```
**Do NOT ban the `Math` global wholesale** (RESEARCH A6 / Example 2 caveat): D-02 allows `Math.sin/cos`;
only `Math.random` is banned (via `no-restricted-properties`).

### `.gitignore` (config) — EXTEND

**Analog:** `.gitignore` (tracked, existing) — lines 1-30.

**Keep** the existing artifact ignores: `__pycache__`, `checkpoint`, `.conda`, `video` (lines 26-30),
`dist` (line 11), and add `coverage` (Wave 0 requirement, D-10). Add any **external** output dir
chosen for recordings/checkpoints (D-10/D-11: large artifacts live outside the repo and rotate).

### `vite.config.ts` (config) — MODIFY (large strip)

**Analog:** `vite.config.ts` (tracked, existing) — lines 1-38.

**Remove:** the Vue JSX plugin + custom-element list (lines 2, 5-23) — Vue is discarded.
**Remove:** the dead proxy block (lines 27-31) — CONCERNS.md "Dead / unused… stale server config"
flags `/upload-frame`, `/frame-end`, `/ping` as endpoints of a removed server.
**Vite 8 (RESEARCH Pitfall 6):** use `build.rolldownOptions`/`worker.rolldownOptions`/`oxc` — do NOT
copy any `rollupOptions`/`esbuild` keys. Keep `base`/`server.port`/alias as needed:
```ts
// keep the alias idiom from the existing config (lines 33-37)
resolve: { alias: { '@': join(process.cwd(), 'src') } }
```

### `vitest.config.ts` (config) — NEW (no analog; test infra never existed)

**Source:** RESEARCH Example 3. There is **no existing test config** (CONCERNS.md "Automated tests — none exist").

```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'node',       // the core is headless — Node env is exactly right
        include: ['tests/**/*.test.ts'],
        coverage: { provider: 'v8', include: ['src/sim/**'] }
    }
});
```

### `.githooks/pre-commit` (config/script) — NEW (no analog)

**Source:** RESEARCH Example 4. No hook infrastructure exists today.
```sh
#!/bin/sh
pnpm run lint && pnpm vitest run tests/determinism --reporter=dot || {
  echo "Determinism gate failed — refusing to commit."; exit 1;
}
```
Wiring: `git config core.hooksPath .githooks`; on Windows, Git-for-Windows `sh` runs POSIX scripts
(RESEARCH A5). Document the `git update-index --chmod=+x` step.

---

## Pattern Assignments — Sim Core & Host (NO analog → RESEARCH is source of truth)

> For each of these files the plan **must** copy the pattern from the cited RESEARCH/ARCHITECTURE
> section, not from existing code. Excerpts below are the normative shapes.

### `src/config/sim.ts` (config, data-only)

**Analog:** none. The predecessor **hard-coded** every tunable as a source constant scattered across
files — `MODEL_INTERVAL = 6`, `FRAME = 60` in `src/setup.ts:9,14`; `MAX_SPEED`, `ACCELERATION`,
`LINEAR_DAMPING` in `src/scene/sword1v1/scene.ts:...`; ports/paths in `vite.config.ts`. CONCERNS.md
"No configuration layer" calls this out as a blocker. **Do not copy that.**

**Source:** RESEARCH Recommended Structure — one central config module:
```ts
// src/config/sim.ts — FIXED_DT, AI_INTERVAL, DEFAULT_SEED, MAX_FRAME, MAX_STEPS
export const FIXED_DT = 1 / 60;   // spec §时间系统: 1 game-minute/tick; 60 ticks/s at 1×
export const AI_INTERVAL = 6;     // spec: "AI 每 6 帧操作一次" (0.1 s) — reserve now, used Phase 4
export const DEFAULT_SEED = 12345;
export const MAX_FRAME = 0.25;    // spiral-of-death clamp
export const MAX_STEPS = 5;       // hard cap per frame
```
`SCREAMING_SNAKE_CASE` for module constants matches the retained conventional style
(CONVENTIONS.md).

### `src/sim/core/clock.ts` (service, fixed-step)

**Analog:** none. The closest existing concept is `SpecifiedFrameExcitation`
(`src/utils/excite.ts:45-59`) — but it is the **anti-pattern**: time is a float (`nowTime += interval`)
driven externally, with a `Set<ITickExcitable>` of mutable listeners, not a tick counter. Do not copy.

**Source:** RESEARCH Example 5:
```ts
// src/sim/core/clock.ts
export class TickClock {
    private _tick = 0;
    constructor(readonly dt: number) {}   // e.g. 1/60 — from src/config/sim.ts
    get tick(): number { return this._tick; }
    step(): void { this._tick++; }        // the ONLY way time advances
}
```

### `src/sim/core/rng.ts` (service/utility, transform)

**Analog:** none (predecessor had no seeded RNG; `model/env.py` `reset` ignored `seed` per CONCERNS.md).
**Source:** RESEARCH Pattern 2 (facade over `sfc32`; `save()`/`restore()` JSON-serializable; splitmix
mixer derives named streams). Copy the shape from RESEARCH Pattern 2 (lines 325-341). Hand-roll the
~20-line `sfc32` (Don't Hand-Roll: the PRNG implementation is the deliberate exception; the
*serializable state shape* is the actual requirement).

### `src/sim/core/math.ts` (utility, transform)

**Analog:** none. **Source:** RESEARCH structure + D-02. This module documents the sanctioned
deterministic math subset. Per D-02 (same-machine only) `+ - * /`, `Math.sqrt`, and `Math.sin/cos`
are allowed — the file is mostly documentation/helpers, not a libm reimplementation. Keep it tiny.

### `src/sim/core/events.ts` (utility/model, event-driven)

**Analog:** none. **Source:** `.planning/research/ARCHITECTURE.md` Pattern 5/6 — a typed per-tick
`EventLog` (damage/kill/levelup/contact union) **cleared each tick**, with consumers receiving
**copies**, never live handles (ARCHITECTURE "Key Data Flows" §2). Do not model this on the
predecessor's untyped `{ type }` message switching.

### `src/sim/world/entity-store.ts` (store/model, CRUD)

**Analog:** none — and this is the file with the **strongest anti-pattern warning**. The predecessor
used inheritance stubs `BodyBase`/`MapBase`/`Role` (`src/body/base.ts`, `src/map/base.ts`,
`src/body/role.ts`) where `Role` threw `Method not implemented.` for every method (CONCERNS.md;
CONTEXT `<code_context>`). D-04 rejects this outright.

**Source:** RESEARCH Pattern 3 (composition-first object model + **stable ordered id array**):
```ts
// src/sim/world/entity-store.ts (shape)
export type EntityId = number;
export class EntityStore {
    private nextId = 1;
    private orderedIds: EntityId[] = []; // ← the iteration contract
    private byId = new Map<EntityId, UnitComponents>();
    spawn(): EntityId { /* monotonic id (D-05), append to orderedIds */ }
    despawn(id: EntityId): void { /* remove from BOTH, preserving orderedIds order */ }
    ids(): readonly EntityId[] { return this.orderedIds; } // iterate THIS
}
```
**Critical (Pitfall 4):** never iterate `Map`/`Set`/object keys for sim logic — `delete`+re-`add`
reorders. This is exactly the "kill/respawn" case. `entityId` must stay monotonic (D-05).

### `src/sim/world/world.ts` (model)

**Analog:** none. **Source:** RESEARCH structure — the `SimState` aggregate:
`{ store, clock, rng, commands, events }` composed explicitly and passed into systems. **Not** a
module-level mutable singleton (the predecessor's `renderer`/`scene`/`recorder`/`uploader` globals in
`src/renderer.ts` were the reset-leak root cause — CONTEXT anti-pattern list).

### `src/sim/systems/movement.ts` (system, transform)

**Analog:** none. **Source:** RESEARCH Pattern 5 — deliberately tiny, genuinely state-mutating
deterministic system so the gate is **non-vacuous** (Pitfall 8):
```ts
// src/sim/systems/movement.ts (Phase-1 stand-in)
export function movementSystem(w: SimState, dt: number): void {
    for (const id of w.store.ids()) {                  // ordered iteration
        const c = w.store.get(id);
        const nudge = w.rng.stream('ai').next() - 0.5; // seeded, deterministic
        c.xform.vx += nudge * 0.001;
        c.xform.x += c.xform.vx * dt;
        c.xform.y += c.xform.vy * dt;
    }
}
```

### `src/sim/content/formulas.ts` (config/data, data-only)

**Analog:** none (D-06: **no** external JSON+schema this phase; TS data modules). **Anti-pattern:**
the predecessor's scattered formula constants (e.g. reward weights in `src/train/sword1v1/train.ts`).
**Source:** ARCHITECTURE structure (`sim/content/` is *data, not code*) + D-06.

### `src/sim/commands.ts` (model/contract, request-response)

**Analog:** none. **Source:** RESEARCH Pattern 4 (discriminated union; grounded in spec
`.planning/reference/ai-marble-kingdom.md:153-158` — four-direction force, signed torque, weapon
ability, unit ability). Copy the union from RESEARCH lines 382-390. Drained **once per tick** (V5:
validate shapes structurally; reject unknown `kind` deterministically — no silent no-op branches,
which was a predecessor `TypeError` class per CONCERNS.md).

### `src/sim/snapshot.ts` (utility, serialize/transform)

**Analog:** none. **Source:** RESEARCH Pattern 6 — split `serializeState(): Uint8Array`
(canonical/ordered/quantized) from `fingerprint(bytes): string`. Keep them separable so a native
hash can swap in later (Pitfall 3). Quantize to a stable grid (~1/256, RESEARCH A3). Document that
the fingerprint is **non-cryptographic** and a diagnostic, never a security token (RESEARCH Security
Domain V6).

### `src/sim/battle-sim.ts` (service/facade, request-response)

**Analog:** none. **Source:** ARCHITECTURE "Component Responsibilities" — `BattleSim` is the **only**
public sim surface: `reset(seed, scenario)`, `submit(commands)`, `step()`, `events()`, `snapshot()`,
`stateView()`. Constructed explicitly and injected (never a global singleton). This is the seam
Phase 2/4/6 attach to.

### `src/host/loop.ts` (utility, budget→steps)

**Analog:** none. **Anti-pattern reference:** `src/utils/excite.ts` — the predecessor drove ticks
from an animation-frame `Ticker` / fixed interval with a mutable `Set` of targets, i.e. wall-clock-
adjacent pacing living next to the sim. The new split is: **pacing in host, sim only ever sees
`step()`**. **Source:** RESEARCH Pattern 1 / ARCHITECTURE Pattern 1:
```ts
// src/host/loop.ts — pacing only, DOM-free, no game logic
export function runLoop(pump, sim, onRendered, cfg): () => void {
    let acc = 0;
    return () => {
        acc += Math.min(pump(), cfg.maxFrame);          // spiral-of-death clamp
        let steps = 0;
        while (acc >= cfg.dt && steps < cfg.maxSteps) {
            sim.step();                                  // fixed dt; reads ONLY commands + seeded RNG
            acc -= cfg.dt; steps++;
        }
        if (steps === cfg.maxSteps) acc = 0;             // drop debt
        onRendered(acc / cfg.dt);                        // alpha in [0,1)
    };
}
```
**Must be DOM-free** so Vitest (`environment: 'node'`) can import it. `Math.min` here is fine — callee/
arguments are data, not sim state; only `sim/**` bans unseeded randomness/clock.

### `src/host/pump.ts` (utility)

**Analog:** none. **Source:** RESEARCH Pattern 1 table — `headlessPump` (fixed large budget, **never
touches a clock**) and `fixedFpsPump` (exactly `1/recordFps`). DOM-free. Contrast the predecessor's
`FRAME_INTERVAL = 1000/60` constant + `Ticker` coupling in `src/setup.ts:14-18` — that is the shape
being replaced.

### `src/host/pump-browser.ts` (utility, browser)

**Analog:** none. **Source:** RESEARCH Pattern 1 — `rafPump` reading `performance.now()` is the
**ONLY browser-touching module** in Phase 1; isolate it so the browser reference never leaks into the
test graph. (This is the one place `performance.now()` is legal.)

### Tests — `tests/helpers/run-sim.ts`, `tests/sim/*.test.ts`, `tests/host/loop.test.ts`, `tests/determinism/gate.test.ts`

**Analog:** none — CONCERNS.md "Automated tests — none exist"; the predecessor had **zero** test
infrastructure. **Source:** RESEARCH Example 3 + Validation Architecture. Key requirements:
- `run-sim.ts`: headless trace runner returning per-tick fingerprints (shared by SIM-03/SIM-04).
- `gate.test.ts`: copy the three assertions from RESEARCH Example 3 — (a) same seed → identical
  **per-tick** trace, (b) different seed → different, (c) state **evolves** (`new Set(t).size > 1`,
  the anti-vacuous-gate guard, Pitfall 8).
- `snapshot.test.ts`: assert `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))`
  and a mutator-census test ("every mutator moves the fingerprint", RESEARCH Anti-Patterns).
- Test naming/quotes/indentation follow `.prettierrc` + ESLint (no predecessor test style exists).

---

## Shared Patterns (cross-cutting — apply to all new `sim/**` files)

### Determinism invariants (the contract every `sim/**` file must obey)
**Source:** `.planning/research/ARCHITECTURE.md` "Determinism Strategy" table + Banned-in-sim cheat-sheet.
Enforced **twice** (RESEARCH "Key insight"): ESLint boundary rules **and** DOM-free `tsconfig.sim.json`.

```
✗ Math.random()      ✗ Date.now()      ✗ performance.now()   ✗ new Date()
✗ Set / object-key iteration for logic   ✗ reading devices directly
✗ DOM / window / document / pixi.js / WebSocket inside sim/
✓ TickClock.tick   ✓ RandomStreams   ✓ CommandQueue   ✓ ordered arrays
```
`Math.sin/cos` **allowed** (D-02, same-machine target). Do **not** ban the `Math` global (A6).

### Layer boundary (SIM-03 / D-03)
**Source:** RESEARCH Architectural Responsibility Map + Example 1/2.
- `sim/**` imports nothing from `host/**`, `render/**`, `driver/**`, `pixi.js`, `node:*` (ESLint).
- `sim/**` cannot name any DOM global (type error via `tsconfig.sim.json` `lib:["ESNext"]`, `types:[]`).
- One-way dependency flow: `sim/` ← `host/`. The sim exposes exactly one advance primitive (`step()`).

### Config constants
All tunables live centrally in `src/config/sim.ts` (SCREAMING_SNAKE_CASE). **Anti-pattern:** the
predecessor scattered `MODEL_INTERVAL`/`FRAME`/ports/paths across `src/setup.ts`,
`src/scene/sword1v1/scene.ts`, `vite.config.ts`, `model/**` (CONCERNS.md "No configuration layer").

### Module design conventions to carry forward (from `.planning/codebase/CONVENTIONS.md`)
- **Named exports only**, no default exports (only config files use `export default`).
- **No barrel files** — import concrete paths; `@/` alias → `src/` is retained in tsconfig + vite.
- **`readonly`** liberally on fields that don't change after construction.
- **Guard clauses with early return**; absence signalled with `null`/`false`, not exceptions.
- **Chinese comments/JSDoc** for intent and domain reasoning (project-wide convention).
- **4-space indent, single quotes, semicolons, no trailing comma, arrow-parens avoid** — from `.prettierrc`.

---

## No Analog Found (planner must use RESEARCH/ARCHITECTURE patterns)

| File | Role | Data Flow | Reason |
|------|------|-----------|--------|
| `src/config/sim.ts` | config | — | No config layer existed; predecessor hard-coded constants |
| `src/sim/core/clock.ts` | service | fixed-step | Predecessor used float `nowTime`/Ticker (`excite.ts`) — anti-pattern |
| `src/sim/core/rng.ts` | service | transform | No seeded RNG existed (`reset` ignored `seed`) |
| `src/sim/core/math.ts` | utility | transform | No determinism math layer existed |
| `src/sim/core/events.ts` | utility | event-driven | Predecessor events were untyped/handles, not a per-tick copy log |
| `src/sim/world/entity-store.ts` | store | CRUD | Predecessor used inheritance stubs (`Role`/`BodyBase`) — anti-pattern (D-04) |
| `src/sim/world/world.ts` | model | — | No explicit constructed state aggregate existed |
| `src/sim/systems/movement.ts` | system | transform | No deterministic system fixtures existed |
| `src/sim/content/formulas.ts` | config | — | Data scattered in code, not a data module (D-06) |
| `src/sim/commands.ts` | model | request-response | Predecessor had an untyped `{type}` protocol, not a typed command union |
| `src/sim/snapshot.ts` | utility | serialize | No serialization/fingerprint existed |
| `src/sim/battle-sim.ts` | service | request-response | No clean facade; scene owned physics+render+loop |
| `src/host/loop.ts` | utility | budget→steps | No accumulator loop; rAF/Ticker drove ticks directly |
| `src/host/pump.ts` | utility | request-response | No swappable pumps existed |
| `src/host/pump-browser.ts` | utility | request-response | No browser/host isolation existed |
| `tests/helpers/run-sim.ts` | test helper | batch | No test infrastructure at all |
| `tests/**/*.test.ts` | test | — | No tests, no runner, no config existed |
| `vitest.config.ts` | config | — | No test config existed |
| `.githooks/pre-commit` | config/script | event-driven | No git-hook gate existed (no CI either) |

---

## Predecessor Anti-Patterns to AVOID (explicit; from CONTEXT / CONCERNS / RESEARCH)

| Anti-pattern | Predecessor evidence | New-code rule |
|--------------|----------------------|---------------|
| Module-level mutable singletons | `renderer`/`scene`/`recorder`/`uploader` in `src/renderer.ts`; `ws` in `model/ws.py` | Construct `BattleSim`/stores explicitly; inject them |
| Stub base classes that throw | `Role` (`src/body/role.ts`), `getState()` (`src/scene/sword1v1/scene.ts:622`) | Ship working minimal systems, no placeholder base classes |
| rAF / Ticker as the sim clock | `AnimationFrameExcitation`/`SpecifiedFrameExcitation` (`src/utils/excite.ts`) | Accumulator + swappable pumps; sim sees only `step()` |
| Iterating `Map`/`Set`/obj-key order | (`train/manager.ts` registry patterns) | Always iterate the ordered id array (Pitfall 4) |
| Scattered hard-coded constants | `src/setup.ts:9,15`; ports/paths across configs | Central `src/config/sim.ts` |
| Untyped / uncorrelated message protocol | `model/ws.py:68-75` `send_and_receive` | N/A this phase; Command union is the inward contract (Phase 6 revisits bridge) |
| Duplicated logic in two places | rendering copy-paste (`scene.ts:72-208` vs `component.tsx:89-229`) | Single source per concern |
| Large artifacts committed | 140 MB `checkpoint/`, 126 MB `video/` | D-10/D-11: external output dir + rotation + `.gitignore` |
| No tests / no config layer | CONCERNS.md "Missing Critical Features" | Wave 0 test infra + `src/config/sim.ts` |

---

## Metadata

**Analog search scope:** repo root config/tooling files (`.prettierrc`, `package.json`,
`tsconfig.json`, `eslint.config.js`, `.gitignore`, `vite.config.ts`) and `src/utils/excite.ts`,
`src/setup.ts` read as anti-pattern references. `src/scene/**`, `src/train/**`, `src/body/**`,
`src/map/**`, `model/**` reviewed only via `.planning/codebase/CONCERNS.md` /
`.planning/codebase/CONVENTIONS.md` (discarded — not copied).
**Files scanned:** 6 config analogs (all git-tracked, verified via `git ls-files`) + 2 anti-pattern refs.
**Tracked-source gate:** all cited analog paths confirmed tracked; no `.gsd/capabilities` mirror paths emitted.
**Pattern extraction date:** 2026-10-15
