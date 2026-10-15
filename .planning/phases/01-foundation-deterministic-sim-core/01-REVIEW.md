---
phase: 01-foundation-deterministic-sim-core
reviewed: 2026-10-15T19:40:00Z
depth: deep
files_reviewed: 31
files_reviewed_list:
  - src/sim/battle-sim.ts
  - src/sim/commands.ts
  - src/sim/content/formulas.ts
  - src/sim/core/clock.ts
  - src/sim/core/events.ts
  - src/sim/core/math.ts
  - src/sim/core/rng.ts
  - src/sim/snapshot.ts
  - src/sim/systems/movement.ts
  - src/sim/world/entity-store.ts
  - src/sim/world/world.ts
  - src/host/loop.ts
  - src/host/pump.ts
  - src/config/sim.ts
  - tests/determinism/gate.test.ts
  - tests/helpers/run-sim.ts
  - tests/host/loop.test.ts
  - tests/sim/clock.test.ts
  - tests/sim/commands.test.ts
  - tests/sim/entity-store.test.ts
  - tests/sim/headless.test.ts
  - tests/sim/rng.test.ts
  - tests/sim/snapshot.test.ts
  - package.json
  - tsconfig.json
  - tsconfig.sim.json
  - vite.config.ts
  - vitest.config.ts
  - eslint.config.js
  - .githooks/pre-commit
  - .gitattributes
findings:
  critical: 1
  warning: 5
  info: 8
  total: 14
status: issues_found
---

# Phase 1: Code Review Report

**Reviewed:** 2026-10-15T19:40:00Z
**Depth:** deep
**Files Reviewed:** 31
**Status:** issues_found

## Summary

Phase 1 delivers a genuinely headless, fixed-step, seeded sim core with a
two-layer `sim/` boundary (DOM-free `tsconfig.sim.json` + ESLint `no-restricted-*`),
a canonical quantized serializer with a separable non-crypto fingerprint, a
per-tick command/event pipeline, a composition-first entity store with an explicit
iteration contract, and a double-run determinism gate wired as a pre-commit hook.

The determinism *mechanics* are sound within the phase's stated same-machine goal
(D-02): no `Math.random`/wall-clock in `src/`, no `Map`/`Set` iteration in system
or serialization paths (the one `Map` is lookup-only), named streams are
decorrelated via an `xmur3` mixer, and the sfc32 implementation matches the
canonical algorithm. The `Command` intake is a total function (rejects
NaN/Infinity/unknown kinds, never dereferences `undefined`).

The material defect is in the **serializer's completeness** — the explicit focus of
this phase (threat T-01-04). `EntityStore.nextId` is *future-affecting state* that is
not serialized, so a snapshot taken after the highest-id entity has been despawned
restores into a store whose next id diverges from the original (and reuses a dead
id). This is reproduced below. Several secondary robustness/contract gaps follow.

Locked decisions D-01..D-11 were treated as intentional and are **not** flagged
(including D-02 permitting `Math.sin/cos`, no cross-machine determinism, and D-09's
pre-commit gate rather than CI).

## Critical Issues

### CR-01: Snapshot omits `EntityStore.nextId` — restored state diverges and reuses dead ids

**File:** `src/sim/snapshot.ts:51-107` (serialize), `src/sim/snapshot.ts:119-201` (deserialize), `src/sim/world/entity-store.ts:69-84` (`restore`)

**Issue:** `serializeState()` serializes the clock tick, named RNG stream states, and
live entities — but **not `EntityStore.nextId`**. `EntityStore.restore()` reconstructs
`nextId` as `max(live id) + 1`. Whenever the highest-id entity has been despawned
before the snapshot, the original store's `nextId` is strictly greater than
`max(live)+1`, so the restored store assigns a **different (and previously used) id**
on the next spawn. This violates D-05 (ids stable and monotonic, never reused) and
breaks the "snapshot is a deterministic restart point" contract for any run that
despawns its highest-id entity — exactly the entity-churn path the phase's own
Pitfall-4 discipline exists to protect. It also falsifies the SUMMARY's claim that the
serializer is exhaustive ("serializer omits nothing").

Reproduced with a throwaway probe (run then removed):

```
original next id = 3 | restored next id = 2
AssertionError: expected 2 to be 3
```

Scenario: `spawn()` ×2 → `despawn(2)` → `snapshot()` → `restore()` → next spawn is
`3` on the original, `2` on the restored sim.

Note: `BattleSim` exposes no public `despawn()` yet, so this is latent *through the
facade* but immediately reachable via the public `EntityStore` and any Phase 2
kill/respawn path. The existing round-trip and "two restores re-step identically"
tests do not exercise despawn, so the gap is invisible to the gate.

**Fix:** Serialize the id cursor and restore it. Minimal change — append `nextId` to
the store's snapshot data (and thread it through `EntityStore.restore`):

```ts
// entity-store.ts
restore(entries: readonly EntitySnapshot[], nextId?: number): void {
    this.orderedIds = [];
    this.byId.clear();
    let maxId = 0;
    for (const entry of entries) { /* ...existing... */ }
    this.nextId = nextId ?? maxId + 1; // caller supplies the serialized cursor
}
```

```ts
// snapshot.ts — write nextId after entityCount (bump VERSION to 2)
u32(ids.length);
u32(s.store.nextId);          // expose a getter on EntityStore
// ...
// deserializeState: read it and pass to store.restore(entries, nextId)
```

Alternatively, encode the despawn history by making ids never contiguous; but
serializing the cursor is the direct, canonical fix. Add a regression test:
`spawn ×2 → despawn(max) → snapshot → restore → spawn` must yield the same id on both.

## Warnings

### WR-01: `atTick` is validated but never enforced — command timing is lost

**File:** `src/sim/commands.ts:16-24,40-44` (declared/validated), `src/sim/battle-sim.ts:101-133` (`applyCommands`)

**Issue:** Every time-based `Command` variant carries `atTick`, and the module
contract (`commands.ts:8-9`) states a run is reproducible from "recorded command log
+ seed" and that a late command "is skipped for its tick". `applyCommands()` **never
reads `atTick`** — a command is applied on whatever tick it happens to be drained.
Consequently, two runs submitted with the same `(command, atTick)` log but different
submit/drain cadence produce different results, so the promised replay property does
not hold, and `atTick` is dead on the read path.

**Fix:** Either enforce it deterministically at drain time:

```ts
// before applying, in step():
for (const cmd of cmds) {
    const cmdTick = 'atTick' in cmd ? cmd.atTick : tick; // spawn has none
    if (cmdTick !== tick) { this.rejectTick(cmd, cmdTick, tick); continue; }
    apply(cmd);
}
```

or remove `atTick` from the union and document that commands apply at drain time. Do
not leave a validated-but-ignored field that implies an unrealized guarantee.

### WR-02: `applyCommands` switch has no exhaustiveness guard (silent-no-op risk)

**File:** `src/sim/battle-sim.ts:103-131`

**Issue:** The `switch (cmd.kind)` covers the current five kinds with no `default`
and no `never` check. Adding a new variant to the `Command` union (and to
`KNOWN_KINDS`) without updating `applyCommands` compiles cleanly and silently drops
the command — the predecessor prototype's "silent no-op branches" anti-pattern (called
out in CONTEXT.md as a lesson to avoid). This is a maintainability hazard that will
bite as the command surface grows in Phase 2/4.

**Fix:**

```ts
default: {
    const _exhaustive: never = cmd;
    throw new Error(`unhandled command kind: ${JSON.stringify(_exhaustive)}`);
}
```

### WR-03: `quantize` → `setInt32` silently wraps out-of-range values

**File:** `src/sim/snapshot.ts:38-40,75-78,99-104`

**Issue:** `quantize(v) = Math.round(v * 256)` is written via `DataView.setInt32`,
which applies ToInt32 (modulo 2³²) with **no error**. Any component with
`|value| > ~8.38e6` wraps, and `readI32`/`dequantize` then yields a wildly different
number — so `fingerprint(restore(serialize(s))) !== fingerprint(serialize(s))` for
such a state, with no signal. Phase 1 magnitudes (positions/velocities from a 0.05
nudge) are far below the bound, but Phase 2 physics velocities/positions can plausibly
exceed it, and the mutator census cannot catch this.

**Fix:** Either range-check before writing and throw a deterministic error, or encode
floats as `setFloat64` (still canonical and byte-stable for finite values) instead of
quantized `int32`. If quantization is retained, clamp explicitly:

```ts
const INT32_MAX = 2147483647;
function quantize(v: number): number {
    const q = Math.round(v * QUANT_GRID);
    if (q > INT32_MAX || q < -INT32_MAX - 1) {
        throw new Error(`snapshot: value out of quantized int32 range: ${v}`);
    }
    return q;
}
```

### WR-04: `src/config/**` is inside the DOM-free type boundary but outside the ESLint boundary

**File:** `eslint.config.js:51-117` (boundary block is `files: ['src/sim/**/*.ts']` only; see also the comment at `eslint.config.js:19`), `tsconfig.sim.json:10`

**Issue:** `tsconfig.sim.json` includes `src/config/**/*.ts` in the DOM-free project,
and the ESLint comment at line 19 states "src/sim 与 src/config 属无头边界". But the
`no-restricted-imports` / `no-restricted-globals` / `no-restricted-properties` /
`no-restricted-syntax` block only targets `src/sim/**/*.ts`. `src/config/**` therefore
has only one enforcement layer, and it is the weaker one: `Date`/`Math` exist in the
`ESNext` lib, so `Date.now()` / `new Date()` / `Math.random()` in a config/content
module are neither a type error nor a lint error. The two layers are supposed to be
complementary for the whole headless boundary (D-03/SIM-03).

**Fix:** Extend the boundary block to cover config:

```js
files: ['src/sim/**/*.ts', 'src/config/**/*.ts'],
```

### WR-05: Coverage config references a missing dependency and omits host/config

**File:** `vitest.config.ts:8-11`, `package.json:17-29`

**Issue:** `coverage.provider: 'v8'` requires `@vitest/coverage-v8`, which is **not**
declared in `package.json`. Running coverage fails:

```
MISSING DEPENDENCY  Cannot find dependency '@vitest/coverage-v8'
```

Additionally, `coverage.include: ['src/sim/**']` omits `src/config/**` and
`src/host/**`, so two of the three headless source trees are untracked, and there is
no `test:coverage` script despite configuring coverage.

**Fix:** Add `@vitest/coverage-v8` (matching `vitest@^5`) to `devDependencies`, widen
`include` to `['src/sim/**', 'src/config/**', 'src/host/**']`, and add a
`"test:coverage": "vitest run --coverage"` script. Or delete the dangling coverage
block if coverage is out of scope this phase.

## Info

### IN-01: Trust-boundary validation accepts arbitrary extra fields

**File:** `src/sim/commands.ts:120-135`
`validate()` checks only that required fields are finite numbers, then returns
`raw as unknown as Command`; unknown/extra properties are retained. Not exploitable in
Phase 1 (commands are neither serialized nor hashed), but command objects are not
canonical. Consider whitelisting fields per kind for a tighter boundary.

### IN-02: `mixSeed` derives from a concatenated string (`${name}#${seed}`)

**File:** `src/sim/core/rng.ts:41-44`
A `#` inside a stream name can make distinct `(seed, name)` pairs collide. Fold the
numeric seed into the mixer directly (e.g. mix `seed` into `h` before consuming
`h()`) instead of a delimiter-joined string.

### IN-03: Single-byte stream-name encoding is lossy for non-ASCII names

**File:** `src/sim/snapshot.ts:86-89,156-158`
Names are written as `charCodeAt(i) & 0xff` and read back with `String.fromCharCode`.
Any code unit > 255 is silently truncated, so a non-ASCII stream name would not
round-trip. Current names are ASCII, so this is latent — but the codec documents itself
as self-describing, so it should either use UTF-8 or reject non-ASCII names.

### IN-04: `headless.test.ts` records fingerprints per *frame*, not per *tick*

**File:** `tests/sim/headless.test.ts:28-46`
`headlessPump(MAX_FRAME)` yields `floor(0.25/dt) = 15` steps per `tick()` call, while
the tracer pushes one fingerprint per call and the comment/test title say "per-tick".
Assertions remain valid, but the naming misleads. `tests/helpers/run-sim.ts` uses
`headlessPump(FIXED_DT)` and *is* truly per-tick.

### IN-05: Two diverging `runTrace` implementations (duplication)

**File:** `tests/helpers/run-sim.ts:28-46` vs `tests/sim/headless.test.ts:29-46`
The SUMMARY states `runTrace` is a "shared" helper, but `headless.test.ts` re-implements
its own with different pump semantics (per-frame vs per-tick). Consolidate on the
shared helper to prevent semantic drift.

### IN-06: `clock.test.ts` monkeypatches process-global `Date.now` / `performance.now`

**File:** `tests/sim/clock.test.ts:24-55`
Restored in `finally`, so currently safe, but mutating globals is a test-isolation
hazard if tests are ever parallelized within a file or if the runner reads the clock
inside the patch window. Prefer injecting a clock abstraction, or confine the
assertion window further.

### IN-07: ESLint assigns browser globals to `tests/**` (Node files)

**File:** `eslint.config.js:18-27`
The browser-globals block applies to all JS/TS/TSX except `src/sim/**` and
`src/config/**`, which includes `tests/**` (a Node-only tree). Harmless today because
`no-undef` is off for TS, but the scope is misleading; add a Node-globals entry for
`tests/**` (and `*.config.ts`).

### IN-08 (note, not a defect): Pre-commit hook skips typecheck and the full suite

**File:** `.githooks/pre-commit:9`
The gate runs `pnpm run lint` + determinism tests only. This matches D-09's intent
(determinism gate, no CI) and is intentional; noted only so downstream phases know the
hook will not catch a broken non-determinism unit test or a type error. Consider adding
`pnpm run typecheck` to the hook if commit latency allows.

---

_Reviewed: 2026-10-15T19:40:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
