---
phase: 05-render-system
plan: 04
subsystem: render-frame-model
tags: [typescript, render, frame-projection, visual-spec, culling, test-fakes, pure-functions, vitest]

# Dependency graph
requires:
  - phase: 05-render-system (plan 05-01)
    provides: the frozen IUnitVisualSpec/IUnitViewSpec/ICullQuery/ICameraTransform/IViewport/UnitStateLookup contract
  - phase: 05-render-system (plan 05-02)
    provides: FALLBACK_FACTION_COLORS and DEFAULT_RENDER_CONFIG (faction table, culling margin source)
  - phase: 05-render-system (plan 05-03)
    provides: the camera fit/transform pipeline that consumes resolveTargetPoints output as ICameraUpdateInput.points
  - phase: 01-unit-system
    provides: IUnit.getEquipment/getClass, EquipmentKind/WeaponKind/ArmorKind/ClassKind, CLASS_DEFS/WEAPON_DEFS/ARMOR_DEFS and the real spawnUnit
  - phase: 02-physics-simulation
    provides: IUnitState (x/y/angle/vx/vy/angularVelocity) as the per-frame motion reading
  - phase: 03-control-system
    provides: IDamageSink/IDamageContext and the IUnitCatalog read surface
  - phase: 04-kingdom-system
    provides: IBattle/IVec2/BattleState/BattleTriggerKind for participant-point extraction
provides:
  - src/render/frameModel.ts — resolveFactionColor, resolveUnitVisualSpec, resolveUnitViewSpec, resolveTargetPoints, isUnitVisible (Pixi-free, Rapier-free, stateless)
  - tests/render/fakes.ts — makeUnitState, FakeBattle/makeBattle, makeLookup, makeApplyingSink, makeLethalSink, makeRejectingSink (shared with 05-05)
  - tests/render/frame-model.test.ts — 17 tests covering participant extraction, colour totality and culling boundaries/guards
  - tests/render/visual-spec.test.ts — 7 tests proving all 7 classes and all 6 weapons / 2 armours map from real Phase 1 data
affects: [05-05 DamageTap tests (reuses fakes), 05-06 GeometryUnitView (consumes IUnitVisualSpec), 05-07 Renderer (per-frame cull/spec/points), 05-10 Chrome UAT and calibration]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 7066
  tasks: 2
  commits: 2
  plan_head_before: 3607e1558138b9aa82a1cd291e6c5f0f19f0e003

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Total colour resolution: configured → validated configured value; finite unconfigured id → deterministic Math.abs(Math.trunc(id)) % fallback list; absent/non-finite/malformed/empty-fallback → neutral; never undefined and never outside 0xRRGGBB"
    - "One-pass equipment projection: the first defined weapon wins, every defined armour is appended in encounter order, and classKind is carried as data only (D-04)"
    - "Snapshot-at-first-appearance: resolveUnitViewSpec exists so the caller can freeze visual identity once, matching the frozen physics body (G-6)"
    - "Order-preserving participant extraction: iterate IBattle.getMemberUnitIds(), skip null states and non-finite coordinates, allow an empty result (panoramic fallback instead of divide-by-zero)"
    - "Inclusive culling with fail-closed guards: viewport edge and exact margin boundary are visible; non-finite coordinates/margin/centre/scale/viewport and non-positive scale/dimensions return false; negative margin is zero"
    - "Interface-compliant test doubles: every fake class member exists on IBattle/IDamageSink, all factories are pure, and no module-level mutable global exists"
    - "Real-data visual test: units come from spawnUnit and expectations from CLASS_DEFS/WEAPON_DEFS/ARMOR_DEFS, so the mapping cannot silently drift from Phase 1 tables"

key-files:
  created:
    - src/render/frameModel.ts
    - tests/render/fakes.ts
    - tests/render/frame-model.test.ts
    - tests/render/visual-spec.test.ts
  modified: []

key-decisions:
  - "resolveFactionColor treats a configured-but-malformed value as neutral rather than falling through to the fallback palette: falling through would silently swap a typo in the faction table for an unrelated colour, while neutral makes the misconfiguration visible (T-05-17)"
  - "A negative faction id uses Math.abs(Math.trunc(id)) for the fallback index, so -5 and 5 resolve to the same deterministic colour and no id can produce an out-of-range index"
  - "isUnitVisible also guards non-finite transform centreX/centreY explicitly; the NaN comparison would already return false, but the explicit guard documents the fail-closed contract for the renderer layer (T-05-18)"
  - "resolveTargetPoints always returns a fresh array; callers may pass it straight into ICameraUpdateInput without worrying about aliasing a cached battle snapshot"
  - "The local test double is a generalized StubUnit(classKind, equipment) instead of the plan's UnarmedUnit: it covers the unarmed case and additionally proves two-armour encounter order, which a real Unit cannot construct (no equipment-injection constructor) — the plan's stated fallback (single-armour + repeat stability) is also asserted"
  - "Visual-spec expectations are derived independently from CLASS_DEFS (filter/find) rather than copied from the implementation, while the four named class pairings use only the frozen enums (REND-02)"

patterns-established:
  - "Pure projection module shape: header naming D-01/D-04/D-14, one private isColor guard, then the five exported functions in dependency order, each with JSDoc stating the contract it implements"
  - "Fake module shape: header promising no Pixi/Rapier/mutable globals, one interface-implementing class + factory functions for object literals, JSDoc on every exported factory and private field"
  - "Data-validation test shape: iterate the domain table itself (Object.values(CLASS_DEFS)), derive expected values from the same table through an independent expression, and assert the union covers every enum member"

requirements-completed: [REND-02, REND-04, REND-05]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "resolveFactionColor is total: a configured faction returns its validated table colour, an unconfigured numeric id maps deterministically onto FALLBACK_FACTION_COLORS (including negative ids), and an absent/non-finite id, an empty fallback table or a malformed table value returns the neutral colour — never undefined, never a value outside 0xRRGGBB (D-04/D-05, T-05-17)"
    requirement: "REND-02"
    verification:
      - kind: unit
        ref: "tests/render/frame-model.test.ts#returns the configured colour for a known faction id"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#maps an unconfigured id deterministically onto the fallback table"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#ignores malformed configured values instead of returning them"
        status: pass
      - kind: other
        ref: "node presence check over src/render/frameModel.ts + tests/render/fakes.ts → FRAME_MODEL_OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "resolveUnitVisualSpec projects a real IUnit onto the frozen IUnitVisualSpec: the first equipped weapon becomes `weapon` (undefined when unarmed), every equipped armour appears in encounter order, and classKind is carried as data only; across all seven CLASS_DEFS classes the union covers all six WeaponKind and both ArmorKind values (D-04/D-22, REND-02)"
    requirement: "REND-02"
    verification:
      - kind: unit
        ref: "tests/render/visual-spec.test.ts#maps every CLASS_DEFS entry onto its own initial equipment projection"
        status: pass
      - kind: unit
        ref: "tests/render/visual-spec.test.ts#routes the first equipped weapon and keeps the named class pairings"
        status: pass
      - kind: unit
        ref: "tests/render/visual-spec.test.ts#covers all six WeaponKind and both ArmorKind values across the classes"
        status: pass
      - kind: unit
        ref: "tests/render/visual-spec.test.ts#treats classKind as data: identical equipment yields identical visual fields"
        status: pass
      - kind: unit
        ref: "tests/render/visual-spec.test.ts#resolves an unarmed, unarmoured unit as weapon undefined with no armours"
        status: pass
    human_judgment: false
  - id: D3
    description: "resolveTargetPoints returns the living member positions in member order, skipping members with a null physics state or non-finite coordinates, and returns an empty array for a battle with no resolvable members — a shape the camera can fit directly (D-14, T-05-19)"
    requirement: "REND-04"
    verification:
      - kind: unit
        ref: "tests/render/frame-model.test.ts#returns living member positions in member order with values unchanged"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#skips members whose physics state is missing"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#skips members with non-finite coordinates"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#returns an empty array for a battle with no resolvable members"
        status: pass
    human_judgment: false
  - id: D4
    description: "isUnitVisible classifies the viewport centre, the inside-margin point and the exact boundary as visible, hides a point just outside the margin, treats a negative margin as zero, and fails closed for NaN/Infinite coordinates or margin, non-finite camera centre, non-positive scale and zero-size viewports — the basic culling needed by D-01"
    requirement: "REND-05"
    verification:
      - kind: unit
        ref: "tests/render/frame-model.test.ts#keeps the viewport centre and the inclusive boundary visible"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#keeps a point just inside the margin visible and hides one just outside"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#hides non-finite coordinates and non-finite margins"
        status: pass
      - kind: unit
        ref: "tests/render/frame-model.test.ts#treats a negative margin as zero"
        status: pass
    human_judgment: false
  - id: D5
    description: "The shared fakes compile against the real interfaces and stay Node-testable: FakeBattle implements all nine IBattle methods, each IDamageSink factory has the documented apply/reject/lethal behaviour, no fake imports Pixi or Rapier, and frameModel.ts imports no Pixi/Math.random; the whole suite, typecheck and lint are green"
    requirement: "REND-02, REND-04, REND-05"
    verification:
      - kind: integration
        ref: "pnpm test — 40 files / 431 tests passed (baseline 38 / 407 + 2 files / 24 tests)"
        status: pass
      - kind: other
        ref: "pnpm typecheck exit 0 and pnpm lint exit 0"
        status: pass
      - kind: other
        ref: "node presence check → FRAME_MODEL_OK (all five exports, both equipment discriminators and all seven fake factories present; no pixi.js/Math.random)"
        status: pass
    human_judgment: false

# Metrics
duration: ~9min
completed: 2026-10-23
status: complete
---

# Phase 5 Plan 04: 逐帧投影与视觉规格 Summary

**The renderer's per-frame decisions are now pure functions: faction colour is total, a unit's visual identity is snapshotted from real Phase 1 equipment (all 6 weapons and both armours proven reachable), battle members become camera-ready points, and culling hides non-finite or zero-scale frames instead of emitting NaN transforms.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-23T15:23:56Z
- **Completed:** 2026-10-23T15:33:00Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `src/render/frameModel.ts` lands the whole "what does it look like / is it on screen" layer as five pure, guarded functions. It imports only `@/render/constants`, `@/render/types`, `@/kingdom/types` and `@/units/types` — no Pixi, no Rapier, no class, no module state, so it runs directly under the Node Vitest environment.
- `resolveFactionColor` is total: a configured id returns its validated colour, any other finite id maps deterministically through `Math.abs(Math.trunc(id)) % fallbackColors.length`, and an absent/non-finite id, an empty fallback list or a malformed configured value returns the neutral colour. A negative, NaN or missing id can therefore never leave the body untinted (D-04/D-05, T-05-17).
- `resolveUnitVisualSpec` makes REND-02 data: one pass over `unit.getEquipment()` picks the first defined weapon and appends every defined armour in encounter order, while `classKind` is carried untouched. `resolveUnitViewSpec` wraps it for the once-per-unit snapshot required by G-6.
- `resolveTargetPoints` turns a battle into the camera's input: member order is preserved, `null` physics states and non-finite coordinates are skipped, and a battle with no resolvable members yields `[]` — the panoramic fallback instead of a divide-by-zero (D-14, T-05-19).
- `isUnitVisible` is the phase's culling primitive: viewport centre, inside-margin and exact-boundary points are visible, just-outside points are hidden, a negative margin counts as zero, and every non-finite/non-positive input fails closed so a degenerate frame hides a subtree rather than pushing NaN into Pixi (D-01, T-05-18).
- `tests/render/fakes.ts` provides `makeUnitState`, `FakeBattle`/`makeBattle`, `makeLookup`, `makeApplyingSink`, `makeLethalSink` and `makeRejectingSink`. Every class member exists on its implemented interface, the factories are pure, and the module imports neither Rapier nor Pixi — 05-05's damage-tap tests can reuse them unchanged.
- `tests/render/visual-spec.test.ts` proves the data half of REND-02 against real Phase 1 tables: every `CLASS_DEFS` class maps to its own initial equipment; the seven classes together cover all six `WeaponKind` values and both `ArmorKind` values; `classKind` is data only; faction colour is independent of equipment; armour order is stable and preserved; and an unarmed/unarmoured unit resolves `weapon === undefined` with an empty armour list.
- `pnpm test` reports 40 files / 431 tests (the 38-file / 407-test baseline plus two new files: 17 + 7 tests), with `pnpm typecheck` and `pnpm lint` at exit 0 and the presence check printing `FRAME_MODEL_OK`.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
| ---- | ---- | ------ | ---- |
| 1 | Build the shared fakes and the pure frame projection | `965ba87` | feat |
| 2 | Prove all 7 classes and all 6 weapons / 2 armours | `fb6a885` | test |

_Measured via the plan ledger: `git rev-list --count 3607e15..HEAD` = 2 task commits at SUMMARY write time (`plan_head_before: 3607e15`)._

## Files Created/Modified

- `src/render/frameModel.ts` (created, 175 lines) — module header naming D-01/D-04/D-14; private `isColor` guard; `resolveFactionColor`, `resolveUnitVisualSpec`, `resolveUnitViewSpec`, `resolveTargetPoints`, `isUnitVisible`.
- `tests/render/fakes.ts` (created, 152 lines) — `makeUnitState`, `class FakeBattle implements IBattle` (nine interface methods, private fields with JSDoc) + `makeBattle`, `makeLookup`, `makeApplyingSink`, `makeLethalSink`, `makeRejectingSink`.
- `tests/render/frame-model.test.ts` (created, 242 lines) — 17 tests: participant ordering/skips/empty/freshness, configured/unconfigured/absent/empty-fallback/malformed colours, culling centre/boundary/inside/outside/NaN/zero-scale/zero-viewport/negative-margin/non-finite-centre.
- `tests/render/visual-spec.test.ts` (created, 259 lines) — 7 tests: the seven-class mapping table, the four named pairings, 6-weapon/2-armour coverage, classKind-as-data, faction independence, armour order/stability and the unarmed case; includes a local `StubUnit implements IUnit`.

## Decisions Made

- **Malformed configured colour → neutral, not fallback.** Falling through to the fallback palette would hide a typo in `factionColors` behind an unrelated colour; returning neutral makes the misconfiguration visible while still satisfying totality (T-05-17).
- **Negative ids share the positive fallback index.** `Math.abs(Math.trunc(id))` keeps `-5` and `5` on the same colour and keeps the array index in range for any finite id.
- **Culling fails closed on the camera centre too.** The NaN comparison would already be false, but the explicit guard documents that the renderer may hide the subtree on any degenerate frame.
- **A fresh point array per call.** `resolveTargetPoints` never caches; callers can pass the result straight into `ICameraUpdateInput.points`.
- **Generalized test double.** The plan's `UnarmedUnit` sketch became `StubUnit(classKind, equipment)` so the same fake covers the unarmed case and proves two-armour encounter order; the plan's stated fallback (real single-armour unit + repeated-call stability) is also asserted.
- **Independent expectations.** Visual-spec expectations come from `CLASS_DEFS` via `filter`/`find`, not from a copy of the implementation loop, while the four named pairings use only the frozen enums.

## Deviations from Plan

### Intentional refinement

**1. `StubUnit` replaces the sketched `UnarmedUnit`, and two-armour order is proven with it.**

The plan asked for a local `class UnarmedUnit implements IUnit` and allowed the two-armour order assertion to fall back to a single-armour case because `Unit` has no equipment-injection constructor. The local fake is instead generalized as `StubUnit(classKind, equipment)` (all eleven `IUnit` methods implemented, private fields JSDoc'd, no public member outside the interface), which serves the unarmed case and directly proves `[Shield, Helmet]` encounter order. The real-`Unit` single-armour case and repeated-call deep equality are asserted as the plan's fallback. No production behaviour, interface or file outside `files_modified` changed.

No other deviation: `src/render/types.ts` is byte-identical to the approved contract, no Phase 1–4 file changed, and the diff from the plan ledger base contains exactly the four plan files (all additions).

## Issues Encountered

- None. Both focused test runs passed on the first attempt, and the full suite, typecheck and lint were green immediately after each task.
- `git` reported the usual LF→CRLF conversion warning on the new files (repo default on Windows); no content change and no hook failure.
- Pre-existing untracked paths (`.gsd/`, `.planning/milestone.lock`, `.planning/state.json`, `.planning/v1-MILESTONE-AUDIT.md`) were left untouched and uncommitted.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/render/frame-model.test.ts` | 1 file / 17 tests passed |
| `pnpm vitest run tests/render/visual-spec.test.ts` | 1 file / 7 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 40 files / 431 tests passed |
| `node` presence check | `FRAME_MODEL_OK` |
| `git diff --name-status 3607e15..HEAD` | only the 4 plan files (all added) |
| `src/render/types.ts` | untouched (absent from the diff) |
| Phase 1–4 source dirs | untouched (absent from the diff) |

## Known Stubs

None. Both modules are complete implementations; every value later plans consume (`resolveUnitViewSpec` for 05-06/05-07, `resolveTargetPoints` and `isUnitVisible` for 05-07, and the six fakes for 05-05) is exported, tested and wired to the frozen contract.

## Threat Flags

None beyond the plan's `<threat_model>`. T-05-17 is implemented and tested (validated configured colour, deterministic finite fallback, neutral for absent/malformed/empty, always a 24-bit finite value); T-05-18 is implemented and tested (non-finite coordinates/margin/centre, non-positive scale and zero-size viewports all return false); T-05-19 is implemented and tested (null and non-finite member states skipped, empty result valid). T-05-20 remains the accepted decision (the renderer keeps its snapshot; repeated resolution is test-only). No dependency was added (T-05-SC), and neither module performs I/O, network or DOM access.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** 05-05 can import `makeApplyingSink`/`makeLethalSink`/`makeRejectingSink` and `makeUnitState`/`makeLookup` directly for its damage-tap tests; 05-06 consumes `IUnitVisualSpec`; 05-07 calls `resolveUnitViewSpec` once per unit, `resolveTargetPoints` per frame for the camera and `isUnitVisible` before drawing each subtree.
- **Contract discipline held:** `src/render/types.ts` was not modified, so Round-2 plans continue against the frozen, user-approved contract.
- **Phase 5 remains IN PROGRESS:** HUD model, unit views, Renderer/Hud, damage tap, demo runner/panel and Chrome UAT are still pending (05-05..05-10). Do not advance to Phase 6.
- **D-22 gap closed at data level:** the visual model now provably represents all six weapons and both armours, so the `?classes=all` demo variant (05-08) only has to supply Hammer/Knight units.

## Self-Check: PASSED

- FOUND: `src/render/frameModel.ts`
- FOUND: `tests/render/fakes.ts`
- FOUND: `tests/render/frame-model.test.ts`
- FOUND: `tests/render/visual-spec.test.ts`
- FOUND: commit `965ba87` (feat: pure frame projection + shared fakes)
- FOUND: commit `fb6a885` (test: seven classes, six weapons, two armours)
