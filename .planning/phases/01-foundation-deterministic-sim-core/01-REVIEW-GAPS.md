---
phase: 01-foundation-deterministic-sim-core
reviewed: 2026-10-15T23:20:00Z
depth: deep
files_reviewed: 24
files_reviewed_list:
  - src/sim/snapshot.ts
  - src/sim/world/entity-store.ts
  - src/sim/battle-sim.ts
  - src/sim/commands.ts
  - src/sim/core/events.ts
  - src/sim/core/rng.ts
  - src/sim/core/clock.ts
  - src/sim/core/math.ts
  - src/sim/world/world.ts
  - src/sim/systems/movement.ts
  - src/host/loop.ts
  - src/host/pump.ts
  - src/config/sim.ts
  - tests/sim/snapshot.test.ts
  - tests/sim/commands.test.ts
  - tests/sim/headless.test.ts
  - tests/sim/rng.test.ts
  - tests/sim/clock.test.ts
  - tests/helpers/run-sim.ts
  - tests/host/loop.test.ts
  - tests/determinism/gate.test.ts
  - tests/style/conventions.test.ts
  - eslint.config.js
  - vitest.config.ts
findings:
  critical: 0
  warning: 4
  info: 3
  total: 7
status: issues_found
---

# Phase 1 (Gap Closure 01-05…01-12): Code Review Report

**Reviewed:** 2026-10-15T23:20:00Z
**Depth:** deep (range `988e710..HEAD`)
**Files Reviewed:** 24
**Status:** issues_found

## Summary

This pass reviews only the gap-closure range (`988e710..HEAD`, commits `(01-05)`…`(01-12)`): the CR-01 id-cursor serialization, the WR-02/WR-03 guards, the WR-04/WR-05 tooling fixes, the D-13/D-14/D-15/D-16 style retrofit, and the D-12 JSDoc retrofit + convention gate.

**What is correct.**

- **CR-01 is genuinely fixed.** `serializeState()` writes the cursor (`src/sim/snapshot.ts:129`, `u32(s.store.nextId)` with matching `+4` size accounting at :94), `deserializeState()` reads it back (:202) and threads it into `store.restore(entries, nextId)` (:227). `EntityStore` exposes `get nextId()` (`src/sim/world/entity-store.ts:87-89`) backed by the renamed `private nextEntityId` (:74), avoiding accessor self-recursion, and `restore()` adopts the caller cursor (`:161`, `nextId ?? maxId + 1`). The regression (`tests/sim/snapshot.test.ts:172-206`) and the id-cursor census case (`:159-169`) both pass — I ran the suite (`tests/style` + `tests/sim/snapshot.test.ts`: 24/24 green). The off-by-one is not present: `spawn 1, spawn 2, despawn 2 → cursor 3` round-trips to 3 on both sims.
- **D-13/D-14/D-15/D-16 held.** Every class in `src/**`/`tests/**` now has an exported `I<ClassName>` and `implements` it, no class name is used in a type position (grep-verified), no `private _` remains, and both enums are explicitly numeric.
- **WR-04/WR-05 resolved as described**; the ESLint boundary now names `src/sim/**` + `src/config/**`, matching `tsconfig.sim.json`.

**What is not fully closed.** The WR-03 guard does not reject `NaN` (still silent-coerces to `0`), the deserializer now trusts the serialized cursor with no invariant/bounds check, the new D-12 gate has export-form blind spots, and the prior review's WR-01 (`atTick` validated but never enforced) remains open — it was listed for the "01-06..01-12" bundle but no plan actually addressed it.

Locked decisions **D-01..D-16** were treated as intentional and are not flagged (including D-02 allowing `Math.sin/cos`, the non-cryptographic fingerprint, same-machine-only determinism, and D-14's numeric-enum mandate).

Carried forward from `01-REVIEW.md` and still unaddressed by this range (not re-filed as new findings to avoid noise): IN-02 (`mixSeed` `#`-join collision), IN-04/IN-05 (duplicate `runTrace` implementations / per-frame naming), IN-06 (`clock.test.ts` global monkeypatch), IN-07 (browser globals scoped over `tests/**`), IN-08 (pre-commit hook skips typecheck).

## Warnings

### WR-G1: `quantize()` still silently coerces `NaN` → 0 — the WR-03 guard is not exhaustive

**File:** `src/sim/snapshot.ts:57-63`

**Severity:** WARNING (escalate to BLOCKER the moment any non-finite float can reach a component — i.e. Phase 2 physics)

**Issue:** The new guard `if (q > INT32_MAX || q < -INT32_MAX - 1) throw …` catches `±Infinity` but **not `NaN`**, because both comparisons against `NaN` are false. `quantize(NaN)` therefore returns `NaN`, and `view.setInt32(o, NaN, true)` applies `ToInt32(NaN) = 0` — the exact "silent wrap with no signal" the fix exists to eliminate. `NaN` does not satisfy the function's own contract (`@returns … 保证落在有符号 int32 范围内`). Result: a state containing `NaN` in any of `hp/level/x/y/vx/vy` fingerprints identically to one containing `0`, so `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))` even though the world diverged. Not reachable via the validated command path in Phase 1 (`validate()` requires finite numbers), but reachable via the public `state` view used by tests and by every later phase that writes components directly.

**Fix:**
```ts
function quantize(v: number): number {
    const q = Math.round(v * QUANT_GRID);
    if (!Number.isFinite(q) || q > INT32_MAX || q < -INT32_MAX - 1) {
        throw new Error(`snapshot: value out of quantized int32 range: ${v}`);
    }
    return q;
}
```
(`Number.isFinite(q)` rejects `NaN` and `±Infinity` in one check.) Add a third guard test asserting `quantize`-backed `snapshot()` throws for a `NaN` component, alongside the existing overflow test at `tests/sim/snapshot.test.ts:210-219`.

### WR-G2: `deserializeState`/`restore` trusts the serialized cursor and byte layout with no validation

**File:** `src/sim/snapshot.ts:201-227`, `src/sim/world/entity-store.ts:147-162`

**Severity:** WARNING

**Issue:** The CR-01 fix reads `nextId` straight from the byte stream (`:202`) and passes it verbatim to `restore` (`:227`), which assigns `this.nextEntityId = nextId ?? maxId + 1` (`entity-store.ts:161`). No invariant is enforced (e.g. `nextId >= maxId + 1`), so a snapshot whose cursor is stale/low (crafted bytes, a snapshot produced by a different build, or a Phase 6 bridge message) makes the restored store hand out an **already-live id** on the next `spawn()` — the precise D-05 violation CR-01 was fixed to prevent. A `nextId` of `0` (also accepted, since `0 ?? … === 0`) re-issues id `1`. `deserializeState` additionally performs no length/bounds check on `entityCount`, `streamCount` or the stream-name lengths, so truncated/garbage input fails with an untagged `RangeError` rather than a deterministic snapshot error. Only `bad magic` and `unsupported version` are guarded (`:179-183`). Latent while snapshots stay in-process, but `BattleSim.restore(bytes)` and `deserializeState(bytes)` are public entry points and the bridge (Phase 6) is a planned consumer.

**Fix:** Validate the cursor on read and keep the store self-protecting:
```ts
// entity-store.ts
this.nextEntityId = Math.max(nextId ?? 0, maxId + 1);
```
```ts
// snapshot.ts, before the entity loop
if (entityCount * ENTITY_BYTES + o > bytes.byteLength) {
    throw new Error('snapshot: truncated entity payload');
}
```
Consider also documenting `deserializeState` as accepting only bytes produced by this exact build (schema version already gates this).

### WR-G3: D-12 convention gate has export-form blind spots — undocumented exports can land green

**File:** `tests/style/conventions.test.ts:34-35`, `:42`

**Severity:** WARNING

**Issue:** `EXPORT_DECL = /^export\s+(abstract\s+)?(class|interface|enum|function|type|const)\b/` only matches a fixed keyword set. `export async function`, `export default` (class/function/const), `export let`/`export var`, and `export declare` are **not** scanned, so a new undocumented `export async function` (or `export default class`) added in a later phase passes the gate silently. `EXPORT_FUNCTION` (`:42`) has the same gap. The gate is the enforcement mechanism for the project-locked D-12 rule ("每个…函数都必须有 JSDoc"), so its blind spots undercut exactly the guarantee the retrofit chain (01-07→01-12) claims to have established. No such declaration exists today, so this is latent, not a present violation.

**Fix:** Broaden both patterns and add a self-test per form:
```ts
const EXPORT_DECL =
    /^export\s+(default\s+|declare\s+|async\s+)*((abstract\s+)?(class|interface|enum|function|type|const|let|var))\b/;
```
then add `it` cases asserting an `export async function` with no preceding JSDoc is reported as a violation.

### WR-G4: WR-01 still open — `atTick` is validated/required but never enforced

**File:** `src/sim/commands.ts:44-45,57,69,81,119-122`; `src/sim/battle-sim.ts:160-201`

**Severity:** WARNING (historical WR-01, re-confirmed)

**Issue:** Every time-based variant carries `atTick`, and it is even a *required* finite field in `REQUIRED_FIELDS` (`commands.ts:119-122`), yet `applyCommands()` never reads it — a command is applied whenever it is drained. The module header still promises "一局可由'记录的命令日志 + 种子'复现" and that a late async driver "命令在对应 tick 被跳过". That replay guarantee does not hold: two runs with the same `(command, atTick)` log but different submit/drain cadence diverge. The prior review filed this as WR-01; `01-05-SUMMARY.md:194` lists it as "planned separately (01-06..01-12)", but none of 01-06…01-12 addressed it. It remains a live contract gap.

**Fix:** Either enforce it at apply time inside `step()` (reject/mark commands whose `atTick !== tick`), or delete `atTick` from the union and `REQUIRED_FIELDS` and document apply-at-drain semantics. Do not ship a validated-but-ignored field.

## Info

### IN-G1: WR-03 range guard covers only quantized components; direct `int32`/`uint32` fields remain silently wrapping

**File:** `src/sim/snapshot.ts:108-111,116,129,132`

**Severity:** INFO (consistency / latent)

**Issue:** `quantize()` is now guarded, but the other canonically written numbers are not: `i32(s.clock.tick)` (:116), `i32(id)` (:132) and `u32(s.store.nextId)` (:129) all go through bare `DataView` setters that wrap on overflow with no signal. This is the same silent-coercion class WR-03 set out to remove, just for a different write path. Values are far below the bounds at Phase-1 scale (tick ≈ 2.16e5 for a 1-hour episode; ids in the thousands), so this is latent, but the guard's intent ("deterministic failure over silent coercion") is only half applied.

**Fix:** Route the tick/id/cursor writes through small checked helpers (or assert `Number.isInteger` + range) so every `DataView` numeric write in the canonical path is range-guarded uniformly.

### IN-G2: The D-14 retrofit re-tagged the driver wire contract from strings to enum ordinals

**File:** `src/sim/commands.ts:21-32,271-286`; `src/sim/core/events.ts:18-31`

**Severity:** INFO (design/migration)

**Issue:** `CommandKind`/`SimEventKind` changed from string-literal unions to numeric enums (mandated by D-14, so not flagged as a violation). The side effect: the JSON discriminant that a future driver (local input → RL/Python → kingdom/LLM, per the module header) must send is now the **ordinal** `0..4`, and `isKnownKind` now rejects the previously-accepted `'force'` form outright. Any recorded command log or external producer written against the old string schema will be silently counted as rejected. `validate()` also still retains unknown/extra fields via `raw as unknown as Command` (`:286`), so command objects remain non-canonical (prior IN-01, still open).

**Fix:** Document that the ordinal is the frozen wire contract (values are explicit `= 0..4`, which helps), and consider whitelisting fields per kind in `validate()` for a tighter boundary before Phase 4/6 wires an external producer.

### IN-G3: Single-byte stream-name codec is still lossy for non-ASCII names

**File:** `src/sim/snapshot.ts:119-122,192-196`

**Severity:** INFO (latent)

**Issue:** Stream names are written as `charCodeAt(i) & 0xff` and read with `String.fromCharCode`, so any code unit > 255 is silently truncated (prior IN-03, unchanged by this range). Current names are ASCII (`['ai']`, plus tests' `['ai','spawn','damage']`), so the round-trip is correct today, but the codec documents itself as self-describing.

**Fix:** Encode names as UTF-8 (e.g. `TextEncoder`) or reject non-ASCII names at `RandomStreams` construction so the self-describing claim holds.

---

_Reviewed: 2026-10-15T23:20:00Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: deep_
_Range: 988e710..HEAD (commits (01-05)…(01-12))_
