---
phase: 05-render-system
plan: 01
subsystem: render-system-contract
tags: [typescript, type-contract, type-first-gate, numeric-enums, pixi-js, camera, hud, render-seam, damage-feed]

# Dependency graph
requires:
  - phase: 04-kingdom-system
    provides: IWorld / IMapBounds / IVec2 / CityKind contract that the render layer reads the god-view map through
  - phase: 03-control-system
    provides: IUnitCatalog contract the renderer reads units and teams through (never IControlSystem)
  - phase: 02-physics-simulation
    provides: IPhysicsWorld / IUnitState / ColliderPart / IPhysicsGeometry contract the damage seam and the drawn footprint reuse
  - phase: 01-unit-system
    provides: WeaponKind / ArmorKind / ClassKind numeric enums that key every weapon and armour drawing
provides:
  - src/render/types.ts — the complete render type contract (1 numeric enum, 2 function type aliases, 28 interfaces, all JSDoc'd, declarations only)
  - CameraMode numeric enum (Strategic = 0 / BattleFocus = 1) derived from the follow target, with no independent mode setter
  - the replaceable unit-visual seam IUnitVisualSpec / IUnitViewSpec / IUnitViewState / IUnitView / IUnitViewFactory with exactly one type-only Pixi import (Container)
  - the HUD contract (IHud / IHudFrame / IHudUnitState / IHudTimers / IHudConfig) expressible without any wall-clock
  - the damage/death read seam IRenderDamageEvent / IDamageFeed / UnitStateLookup plus IRenderServices + RenderServicesProvider, leaving IDamageSink/IDamageContext untouched
  - loop-free IRenderer (renderFrame / getCanvas / getCamera / reset / dispose) and the single tuning entry IRenderConfig
  - tests/render/types.test.ts — 20 tests: enum ordinal pin + compile-time proof of every method, absent-literal field and decision-critical key set
  - exact-pinned pixi.js@8.22.0 in package.json + pnpm-lock.yaml
affects: [06-recording, round-2-render-implementation, round-2-demo-runner]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 11643
  tasks: 4
  commits: 3
  plan_head_before: 132f8e864e052cfce2082236cb504a4990c39255

# Tech tracking
tech-stack:
  added:
    - "pixi.js@8.22.0 (exact pin, no caret/range; type-only `Container` usage in Round 1)"
  patterns:
    - "Type-first round: declarations-only module (no class, no const, no function body, no runtime import)"
    - "Exactly one external symbol crosses into the contract, in type position only (`import type { Container } from 'pixi.js'`)"
    - "Mode derived from state: CameraMode is computed from the battle target, so no independent setter can disagree with it"
    - "Every output field has a declared writer (shakeImpulsePx → shakeX/shakeY) rather than an unreachable knob"
    - "Structural scope enforcement: the strategic frame type carries no unit list, so 'no units in strategic view' is a property of the shape"
    - "expectTypeOf compile-time contract proof; typecheck is the real gate, runtime assertions cover enum ordinals only"

key-files:
  created:
    - src/render/types.ts
    - tests/render/types.test.ts
  modified:
    - package.json
    - pnpm-lock.yaml

key-decisions:
  - "Requirements stay open: REND-01..05 behaviour is Round 2, so `requirements-completed` is deliberately empty (same precedent as Phase 2/3/4 round 1)"
  - "pixi.js pinned to the exact literal 8.22.0 (pnpm add -E); the only research-verified version, approved at a blocking-human supply-chain checkpoint before any install"
  - "G-1 APPROVED: IUnitView.getRoot(): Container — the single type-only Pixi import; Container only composes children in v8, so no other Pixi type is needed or admitted"
  - "G-2 APPROVED: IRenderServices + RenderServicesProvider (() => IRenderServices) instead of four constructor fields; re-read once per output frame so a reset can swap the whole world without rebuilding the Pixi application"
  - "G-3 APPROVED: the damage path is a new read-only IDamageFeed type plus a Round-2 decorator; IDamageSink/IDamageContext/frozen contracts stay untouched"
  - "G-4 APPROVED: CameraMode is derived from the target with no independent mode setter; getMode() reports the RENDER mode, so the pull-back stays BattleFocus until the zoom-out completes"
  - "G-5 APPROVED: the factory owns shared geometry and disposes it exactly once; IUnitView.destroy() releases the instance only"
  - "G-6 APPROVED: the visual spec is snapshotted at first appearance and never rebuilt on upgrade, so a drawing cannot claim armour the frozen physics body does not have"
  - "ICameraUpdateInput.shakeImpulsePx is the declared writer for shakeX/shakeY, so the shakeDamageThreshold / shakeAmplitudePx / shakeDecayPerFrame chain is reachable without a hidden camera mutation (D-06/D-24)"
  - "ICamera.reset(bounds, viewport) clears the battle target, so getMode() is CameraMode.Strategic and the returned transform is the strategic composition (not a stranded BattleFocus with a strategic transform)"
  - "AGENTS §8 applied to every seam: missing LITERALS are `undefined` (getBattleTarget/setBattleTarget, weapon, armorKind, IStrategicCityMarker.factionId); the only `null` is UnitStateLookup's missing OBJECT, mirroring IPhysicsWorld.getUnitState"
  - "IRenderConfig.geometry reuses the frozen IPhysicsGeometry rather than a render-local copy, so the weapon/armour drawing cannot drift from the Rapier capsule (body 0.5 m, weapon offset 0.7 m, armour 0.55 m)"
  - "Naming refinements over the research proposal approved at the gate: IUnitVisualSpec split from IUnitViewSpec; IViewport instead of ICameraViewport; new ICullQuery + IStrategicArmyMarker/IStrategicCityMarker/IStrategicFrame; frameDelayMs added to IRenderConfig"

patterns-established:
  - "Render contract layering: enums and function aliases first, then camera group, unit-visual seam, HUD group, effects/palette/config tree, damage feed, services/renderer, strategic markers last"
  - "Internal helper shapes (IFitBox, ICullQuery, IHudTimers, IStrategicFrame) each name their Round-2 consumer in JSDoc so no declaration reads as dead"
  - "Decision-critical key sets pinned with expectTypeOf<keyof T>() — IRenderDamageEvent, IRenderConfig, IUnitVisualSpec, IUnitViewSpec, IUnitViewState, ICameraUpdateInput, IStrategicArmyMarker, IStrategicCityMarker"
  - "Heavy/Pixi-touching interfaces (IRenderer, ICamera, IUnitView, IUnitViewFactory, IHud, IRenderServices) are proven by signature assertions only — never instantiated, so the DOM-less Vitest environment stays clean"

requirements-completed: []

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "Complete render type contract declared in src/render/types.ts (29 exported declarations: 1 numeric enum, 2 function type aliases, 28 interfaces) with no class, no top-level const, no function body and exactly one type-only Pixi import"
    requirement: "REND-01, REND-02, REND-03, REND-04, REND-05"
    verification:
      - kind: other
        ref: "pnpm typecheck (tsc --noEmit) exit 0"
        status: pass
      - kind: other
        ref: "node presence check over src/render/types.ts → RENDER_TYPES_OK"
        status: pass
      - kind: other
        ref: "pnpm lint exit 0"
        status: pass
    human_judgment: false
  - id: D2
    description: "Compile-time proof test: CameraMode ordinals pinned and every contract method/parameter/return type, absent-literal field and decision-critical key set compile-asserted through the @/render/types alias"
    verification:
      - kind: unit
        ref: "tests/render/types.test.ts (20 tests)"
        status: pass
      - kind: other
        ref: "node presence check over tests/render/types.test.ts → RENDER_TYPES_TEST_OK"
        status: pass
    human_judgment: false
  - id: D3
    description: "pixi.js exact-pinned to the literal 8.22.0 with the lockfile recording the resolution, and package.json scripts unchanged (no dev/build)"
    requirement: "REND-01"
    verification:
      - kind: other
        ref: "node pin check over package.json + pnpm-lock.yaml → PIXI_PIN_OK scripts=typecheck,test,lint"
        status: pass
      - kind: other
        ref: "pnpm test — 34 files / 352 tests (33-file / 332-test pre-install baseline intact + the new contract file)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Blocking-human type-design checkpoint resolved: the user approved the contract as written, including all six research gates G-1..G-6 and D-01..D-24"
    verification: []
    human_judgment: true
    rationale: "Design approval is the project's mandatory type-first gate; whether the interface shape is the right contract for Phase 6 frame capture and the Round-2 implementation is a human design judgement no test can establish."

# Metrics
duration: ~40min
completed: 2026-10-21
status: complete
---

# Phase 5 Plan 01: 渲染系统类型契约（Round 1）Summary

**Render type contract frozen and user-approved: `CameraMode` derived from the target, a factory-swappable unit-view seam with exactly one type-only Pixi import, a wall-clock-free HUD model, a `shakeImpulsePx`-driven camera, and a damage feed that bypasses the frozen Phase 1–4 contracts** — declarations only, with `pixi.js@8.22.0` exact-pinned.

> **This is ROUND 1 (type contract only).** The type-design gate was **APPROVED** by the user with **G-1..G-6** accepted as written. Round-2 implementation (`constants.ts`, `calendar.ts`, `cameraMath.ts`, `hudModel.ts`, `frameModel.ts`, `DamageTap.ts`, `GeometryUnitView.ts`, `UnitViewFactory.ts`, `Camera.ts`, `Hud.ts`, `Renderer.ts`, `src/demo/*`, `src/main.ts`, `index.html`, `style.css`, the `dev` script) is **not planned and not written**. Phase 5 is therefore **NOT complete**: `requirements-completed` is intentionally empty because no REND-01..05 behaviour exists yet.

## Performance

- **Duration:** ~40 min (19:39 → 20:21 +0800), including the blocking type-design review
- **Started:** 2026-10-21T11:39:52Z
- **Completed:** 2026-10-21T12:21:30Z
- **Tasks:** 4 (3 executed + 1 blocking-human gate resolved)
- **Files modified:** 4 (2 created, 2 modified)

## Accomplishments

- `src/render/types.ts` declares the entire render contract as declarations only — 1 numeric enum (`CameraMode`), 2 function type aliases (`RenderServicesProvider`, `UnitStateLookup`) and 28 `I*` interfaces across six groups (camera, unit-visual seam, HUD, effects/palette/config, damage feed, services/renderer, strategic markers) — with 0 value imports, 0 classes, 0 top-level constants and 185 JSDoc blocks.
- The only external code symbol that crosses into the contract is Pixi's `Container`, in type position only (`import type { Container } from 'pixi.js'`), so the pure modules and the DOM-less Vitest environment never load Pixi and the geometry→sprite swap stays a factory-only change (**G-1**).
- `CameraMode` has exactly two `readonly` states and **no independent mode setter**: `getMode()` is derived from `setBattleTarget(number | undefined)`, so the mode cannot contradict the target; `reset(bounds, viewport)` clears the target so the mode is `Strategic` afterwards and the returned transform is the strategic composition (**G-4**/**D-14**/**D-15**).
- `ICameraUpdateInput.shakeImpulsePx` gives `ICameraTransform.shakeX`/`shakeY` a **declared writer**, making the `shakeDamageThreshold → shakeAmplitudePx → shakeDecayPerFrame` chain reachable through interfaces instead of a hidden camera mutation (**D-06**/**D-24**).
- The unit-visual seam separates reusable visual identity (`IUnitVisualSpec`) from the per-unit creation input (`IUnitViewSpec`) and snapshots it at first appearance, so a drawing can never claim armour the frozen physics body lacks (**G-6**); shared geometry is factory-owned and disposed once (**G-5**).
- The damage/death read seam (`IRenderDamageEvent` with the pre-removal `x`/`y`, `level` and `killed`; `IDamageFeed`; `UnitStateLookup`) plus `IRenderServices` + `RenderServicesProvider` (**G-2**) lets the Round-2 decorator bypass `IDamageSink`/`IDamageContext` **without modifying any Phase 1–4 file** (**G-3**/T-05-06).
- The HUD contract (`IHudFrame.frameIndex`, `totalUnits`, `damage`, `gameMinutes`, `minutesPerTick`; `IHudConfig.healthBarSeconds = 15` doc, `alwaysVisibleBelowUnits = 6`, hybrid `screenScaleAt`/`worldScaleAt`) expresses D-07..D-11 and D-23 **without any wall-clock**, and the strategic frame carries no unit ids, so "no units in the strategic view" is structural (**D-14**).
- `tests/render/types.test.ts` (20 tests) pins both `CameraMode` ordinals with integral/distinct assertions and compile-asserts every method signature, absent-literal field and decision-critical key set; `pnpm typecheck` — not Vitest — is the real gate because `expectTypeOf` is a runtime no-op.
- `pixi.js` is pinned to the exact literal `8.22.0` (no caret/range), the lockfile records the resolution, and the pre-existing suite is provably unchanged: 34 files / 352 tests = the 33-file / 332-test baseline plus the new 20-test contract file.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
| ---- | ---- | ------ | ---- |
| 1 | Install `pixi.js@8.22.0` at an exact pin, baseline untouched | `4dc1b85` | chore |
| 2 | Declare the complete render contract in `src/render/types.ts` | `381c4e2` | feat |
| 3 | Write `tests/render/types.test.ts` (enum pin + compile-time proof) | `dd2251c` | test |
| 4 | **checkpoint:human-verify (blocking-human)** — type-design approval | no commit (resolved by user: "approve") | — |

**Plan metadata:** the `docs(05-01): complete render type contract plan` commit that carries this SUMMARY (and the STATE/ROADMAP plan-progress updates) follows.

_Measured commits via the plan ledger: `git rev-list --count 132f8e8..HEAD` = 3 task commits at SUMMARY write time (`plan_head_before: 132f8e8`)._

## Files Created/Modified

- `src/render/types.ts` (created, 437 lines / 23.3 KB) — the render type contract: `CameraMode`, `RenderServicesProvider`, `UnitStateLookup`, the camera group (`IViewport`, `IScreenPoint`, `IFitBox`, `ICameraTransform`, `ICameraUpdateInput`, `ICameraConfig`, `ICamera`, `ICullQuery`), the unit-visual seam (`IUnitVisualSpec`, `IUnitViewSpec`, `IUnitViewState`, `IUnitView`, `IUnitViewFactory`), the HUD group (`IHudUnitState`, `IHudTimers`, `IHudConfig`, `IHudFrame`, `IHud`), effects/palette/config (`IEffectsConfig`, `IRenderPalette`, `IRenderConfig`), the damage seam (`IRenderDamageEvent`, `IDamageFeed`), services/renderer (`IRenderServices`, `IRenderer`) and the strategic markers (`IStrategicArmyMarker`, `IStrategicCityMarker`, `IStrategicFrame`)
- `tests/render/types.test.ts` (created, 579 logical lines) — 20 tests in 12 describe blocks: enum ordinal pin, `expectTypeOf` signature proofs for `IRenderer`/`ICamera`/`IUnitView`/`IUnitViewFactory`/`IHud`/`IDamageFeed`, the four service field types, and complete literals + exact key sets for every pure data shape
- `package.json` (modified) — `"pixi.js": "8.22.0"` under `dependencies`; scripts still `typecheck,test,lint` (no `dev`/`build`)
- `pnpm-lock.yaml` (modified) — locked `pixi.js` 8.22.0 resolution so the reviewed artefact is reproducible

## Decisions Made

- **Requirements stay open.** `requirements-completed: []` — Round 1 declares types only, so marking REND-01..05 complete would be false (identical to the Phase 2/3/4 round-1 precedent). REND-01..05 behaviour is Round 2.
- **Exact pin over range.** The supply-chain checkpoint approved `8.22.0` specifically — the only version whose `.d.ts` was verified — so `pnpm add -E` was mandatory and any other resolution would have invalidated the approval.
- **G-1..G-6 approved as written**, each recorded above; withdrawing one would have to be logged as an explicit downgrade, never a silent drop.
- **No Round-2 artifact created**, including the `dev`/`build` scripts, `index.html`, `src/main.ts`, `src/style.css` and the `src/demo/*` folder — verified absent by direct existence checks.
- **REND-04's automatic-target half is an explicit Round-2 obligation**, not a silent gap: `src/demo/runner.ts` must keep an active target and otherwise fall back to `listActiveBattles()[0]`, then `setBattleTarget(undefined)` when no battle is active (research OQ-6). No type was added for it.
- **Open questions closed.** `05-RESEARCH.md` §Open Questions is marked `(RESOLVED)` with a per-question table (OQ-1/2/3/7/8 by D-21/D-22/D-23/D-24 and the exact pin; OQ-4/5/6 deferred to Round-2 discretion), so no unresolved question remained before execution.

## Deviations from Plan

### Checkpoint-driven (approvals, not deviations from intent)

**1. Supply-chain checkpoint (`blocking-human`) — resolved by the user before Task 1 ran**
- **Found during:** Task 1 (precondition for the install)
- **Issue:** the legitimacy audit returned **SUS** for `pixi.js` on a single `too-new` signal (latest release recent; the package itself is 4.7 years old).
- **Resolution:** the user explicitly approved installing `8.22.0` exactly ("批准安装 8.22.0"). No code change; the pin and the lockfile are the artefact the approval covers.
- **Verification:** `PIXI_PIN_OK scripts=typecheck,test,lint`

**2. Type-design checkpoint (`blocking-human`) — resolved by the user with "approve"**
- **Found during:** Task 4 (the plan's designed stop)
- **Issue:** the project's mandatory type-first gate; Round 2 may not be planned until the contract is approved.
- **Resolution:** approved as written — all six gates G-1..G-6 and D-01..D-24 judged expressible. No revision was requested, so the contract file was not touched at the gate.
- **Verification:** re-ran the full check set after approval (see below); `RENDER_TYPES_OK` / `RENDER_TYPES_TEST_OK`.

---

**Total deviations:** 0 auto-fixed (no Rule 1/2/3/4 fix was needed — no bug, no missing critical functionality and no blocker appeared). The two blocking-human checkpoints were resolved by the user as designed, which is the normal flow, not a deviation.
**Impact on plan:** none — scope stayed exactly inside Round 1 (4 files touched: 2 created, 2 modified), and no Phase 1–4 production file was modified (`git diff --name-status 132f8e8..HEAD` lists only `package.json`, `pnpm-lock.yaml`, `src/render/types.ts`, `tests/render/types.test.ts`).

## Issues Encountered

- None. `pnpm typecheck`, `pnpm test`, `pnpm vitest run tests/render/types.test.ts` and `pnpm lint` were all green on the first post-approval re-run; no fix attempt was required and no file was modified during this continuation.
- The pre-existing 33-file / 332-test baseline held exactly (34 files / 352 tests after adding the 20-test contract file), confirming the dependency install perturbed nothing.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `node` pin check (`package.json` + `pnpm-lock.yaml`) | `PIXI_PIN_OK scripts=typecheck,test,lint` |
| `node` presence check over `src/render/types.ts` | `RENDER_TYPES_OK` |
| `node` presence check over `tests/render/types.test.ts` | `RENDER_TYPES_TEST_OK` |
| `pnpm typecheck` | exit 0 |
| `pnpm test` | 34 files / 352 tests passed (33-file / 332-test baseline + 20 new) |
| `pnpm vitest run tests/render/types.test.ts` | 1 file / 20 tests passed |
| `pnpm lint` | exit 0 |
| Round-2 artefact scan | all absent: `constants.ts`, `Renderer.ts`, `Camera.ts`, `Hud.ts`, `GeometryUnitView.ts`, `UnitViewFactory.ts`, `DamageTap.ts`, `calendar.ts`, `cameraMath.ts`, `hudModel.ts`, `frameModel.ts`, `src/main.ts`, `index.html`, `style.css`, `src/demo/` |
| `src/render/` contents | exactly `types.ts` |
| Phase 1–4 file diff | none — `git diff --name-status 132f8e8..HEAD` shows only the 4 plan files |
| Contract shape audit | 28 interfaces, 1 enum, 2 aliases, 0 value imports, 0 classes, 0 top-level consts, 185 JSDoc blocks |
| `05-RESEARCH.md` §Open Questions | `(RESOLVED)` with the per-question resolution table |

## Known Stubs

None. This round declares types only; every "missing" Round-2 symbol is an intentional, documented deferral in the plan's artifact list, not a stub wired to fake data.

## Threat Flags

None beyond the plan's `<threat_model>`. No network, no persistence, no secrets, no DOM and no runtime Pixi code were added. The only new external artefact is the exact-pinned `pixi.js@8.22.0` covered by T-05-SC; the contract references exactly one Pixi symbol in type position (T-05-05) and leaves `IUnit`, `IPhysicsWorld`, `IControlSystem` and `IWorld` byte-identical (T-05-06).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** the render contract is frozen and user-approved; a Round-2 implementation plan (05-02) can be authored directly against it.
- **Round-2 obligations recorded at the gate:** `validateRenderConfig` before constructing the Pixi application (T-05-01/T-05-02: finite/positive size, finite `outputFps`, `screenScaleAt > worldScaleAt`, in-range palette); no `unsafe-eval` Pixi extension (T-05-05); canvas picking via `getBoundingClientRect` + `screenToWorld` with the shake offsets excluded and non-finite coordinates rejected before `IWorld.issueOrder` (T-05-04); the damage tap as a decorator over the existing sink feeding `IDamageFeed` (G-3); factory-owned shared geometry disposed exactly once (G-5); the visual spec snapshotted at first appearance (G-6); the demo runner owning REND-04's automatic target policy (`listActiveBattles()[0]` fallback, `undefined` when none is active).
- **Phase 5 remains IN PROGRESS** — it is not complete until Round 2 lands and Chrome UAT passes. Do not advance to Phase 6 until then.

## Self-Check: PASSED

- FOUND: `src/render/types.ts`
- FOUND: `tests/render/types.test.ts`
- FOUND: `package.json` (`"pixi.js": "8.22.0"`, exact)
- FOUND: `pnpm-lock.yaml` (pixi.js resolution)
- FOUND: commit `4dc1b85` (chore: pin pixi.js 8.22.0)
- FOUND: commit `381c4e2` (feat: declare render type contract)
- FOUND: commit `dd2251c` (test: pin render contract)
- ABSENT (by design, Round 2): every implementation artefact listed above

---
*Phase: 05-render-system*
*Round: 1 (type contract only) — gate APPROVED*
*Completed: 2026-10-21*
