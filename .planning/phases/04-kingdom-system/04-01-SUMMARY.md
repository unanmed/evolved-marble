---
phase: 04-kingdom-system
plan: 01
subsystem: kingdom-system-contract
tags: [typescript, type-contract, type-first-gate, numeric-enums, data-oriented, control-seam, physics-seam, units-seam]

# Dependency graph
requires:
  - phase: 03-control-system
    provides: IControlSystem / IUnitAI / IUnitCatalog / IUnitBrief contract that the kingdom layer installs AI instances into
  - phase: 02-physics-simulation
    provides: IPhysicsWorld contract (units live in one Rapier world) that blocking terrain plugs into
  - phase: 01-unit-system
    provides: IUnit / ClassKind contract that army rosters, training and battle membership reference
provides:
  - src/kingdom/types.ts — the complete kingdom type contract (7 numeric enums, 24 interfaces, 2 function type aliases, 4 internal IMutable* views)
  - G-1 additive units seam IHealableUnit (heal) approved and declared
  - G-2 additive physics seams IStaticObstacleSpec / IStaticObstacleWorld approved and declared
  - G-5 additive control seam IControlSystem.setUnitAI approved and declared
  - compile-time proof of the A21 reduced-vision boundary (IVisibleArmyBrief / IVisibleCityBrief exact key sets)
affects: [05-rendering, 06-recording, 07-ai-commander, round-2-kingdom-implementation]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 11028
  tasks: 4
  commits: 8

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Type-first round: declarations-only module (no class, no const, no function body, no Rapier import)"
    - "Numeric enums pinned member-by-member at explicit ordinals (never Object.values)"
    - "expectTypeOf compile-time contract proof (typecheck is the real gate; runtime is a no-op)"
    - "Additive seam: new interface / new method appended, frozen members asserted verbatim"
    - "Reduced visibility briefs as the information ceiling for enemy state (A21)"

key-files:
  created:
    - src/kingdom/types.ts
    - tests/kingdom/types.test.ts
  modified:
    - src/units/types.ts
    - src/physics/types.ts
    - src/control/types.ts
    - src/control/ControlSystem.ts
    - tests/control/types.test.ts

key-decisions:
  - "Time is plain numbers, not an enum: getMinutesPerTick()/setMinutesPerTick(minutes) and IWorldTickResult.minutesPerTick; the 1/24 values are Round-2 constants.ts data (G-6)"
  - "Army reinforcement replaces freezing: ArmyState.Engaging = 4 + IArmy.getEngagedBattleId(), formation keeps moving at 10 m/h and units join the battle individually (revised G-3)"
  - "AI switching is control-layer ownership: IControlSystem.setUnitAI(unitId, ai) declared; no IUnitModeSource and no kingdom-side ModeAI (G-5)"
  - "Army orders reduced to three: MoveTo / Garrison / Hold; entering battle range triggers combat automatically (user-requested simplification)"
  - "Order timing is relative: IArmyOrder.afterMinutes (game minutes, omitted = now) instead of an absolute game-minute timestamp (user-requested)"
  - "Vision returns reduced briefs (IVisibleArmyBrief 5 keys, IVisibleCityBrief 4 keys) so enemy roster/order/training/garrison internals are unreachable (A21)"
  - "G-1 and G-2 recorded as APPROVED at the type-design gate; declared as additive, implementation-free seams"
  - "requirements-completed left empty: Round 1 is declarations only, so no KING-0N behaviour is satisfied yet (same precedent as Phase 2/3 round 1)"

patterns-established:
  - "Kingdom contract module: enums first, read/vision surfaces, injectable strategies, scenario tables, internal IMutable* views last under a non-gate banner"
  - "Absent object -> null, absent literal -> undefined/optional (AGENTS §8), pinned by expectTypeOf on six method returns"
  - "Additive seam discipline: presence check re-asserts every frozen member verbatim so a silent alteration fails the build"

requirements-completed: []

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "Complete kingdom type contract declared in src/kingdom/types.ts (7 numeric enums, world/time/faction/army/city/battle/view surfaces, scenario tables, internal mutable views) with no logic and no rate enum"
    requirement: "KING-01, KING-02, KING-03, KING-04, KING-05, KING-06, KING-07, KING-08"
    verification:
      - kind: other
        ref: "pnpm typecheck (tsc --noEmit) exit 0"
        status: pass
      - kind: unit
        ref: "tests/kingdom/types.test.ts (24 tests)"
        status: pass
    human_judgment: false
  - id: D2
    description: "Three additive seams declared in frozen folders: IHealableUnit (units), IStaticObstacleSpec/IStaticObstacleWorld (physics), IControlSystem.setUnitAI (control) — with all pre-existing members byte-identical"
    requirement: "KING-03, KING-05, KING-06"
    verification:
      - kind: unit
        ref: "tests/kingdom/types.test.ts (G-1 / G-2 blocks) + tests/control/types.test.ts (G-5 block)"
        status: pass
      - kind: other
        ref: "pnpm typecheck exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "Compile-time proof of the A21 information boundary: exact key sets of IVisibleArmyBrief/IVisibleCityBrief and the IWorld/ICommanderContext visibility return types"
    requirement: "KING-04"
    verification:
      - kind: unit
        ref: "tests/kingdom/types.test.ts — 'pins the exact key sets of both briefs'"
        status: pass
    human_judgment: false
  - id: D4
    description: "Blocking-human type-design checkpoint resolved: user approved the revised contract (G-1, G-2, G-5, revised G-3, G-6, order simplification)"
    verification: []
    human_judgment: true
    rationale: "Design approval is the project's mandatory type-first gate; correctness of the interface shape for Phases 5/6/7 is a human design judgement that no test can establish."

# Metrics
duration: ~2h 39min
completed: 2026-10-20
status: complete
plan_head_before: 1220d2434a05da5ba8efe2008799294049ec5bbf
commits: 8
---

# Phase 4 Plan 01: 王国系统类型契约（Round 1）Summary

**Kingdom-system type contract frozen: 7 numeric enums (incl. `ArmyState.Engaging`), numeric game-time rate, reduced vision briefs, and three approved additive seams (`IHealableUnit`, `IStaticObstacleWorld`, `IControlSystem.setUnitAI`)** — Round 1 declarations only, no implementation.

> **This is ROUND 1 (type contract only).** The type-design gate was **APPROVED** by the user with **G-1 / G-2 / G-5**. Round-2 implementation (World, TimeSystem, Army, City, Faction, BattleSystem, DamageSink, SensingWorld, MarchAI/BattleAI/BrakeAI/IdleAI, Commander, scenario.ts, constants.ts, `Unit.heal`, full `ControlSystem.setUnitAI`, `PhysicsWorld.addStaticObstacle`) is **next** and was deliberately not written here.

## Performance

- **Duration:** ~2h 39min (16:33 → 19:12 +0800), across two revision passes at the blocking gate
- **Started:** 2026-10-20T08:33:06Z
- **Completed:** 2026-10-20T11:12:00Z
- **Tasks:** 4 (3 executed + 1 blocking-human gate resolved)
- **Files modified:** 7 source/test files (2 created, 5 modified)

## Accomplishments

- `src/kingdom/types.ts` declared the whole kingdom contract as declarations only: 7 numeric enums (`ArmyState` 0..4 incl. `Engaging`, `UnitControlMode`, `ArmyOrderKind` 3 members, `BattleState`, `BattleTriggerKind`, `BattleLifecycleKind`, `CityKind`), 24 interfaces, 2 function type aliases and 4 internal `IMutable*` views — no class, no top-level `const`, no function body, no Rapier import.
- Time is expressed as plain numbers (`getMinutesPerTick` / `setMinutesPerTick` / `IWorldTickResult.minutesPerTick`); the `TimeRate` enum was deleted, so 1×/24× needs no enum and the 1/24 values stay Round-2 calibratable constants in `constants.ts`.
- Army reinforcement replaced freezing: `ArmyState.Engaging = 4` + `IArmy.getEngagedBattleId()`, with JSDoc pinning that the formation keeps moving at 10 m/h toward the battle center and units join individually on entering the 80 m area.
- AI switching moved into the control layer via `IControlSystem.setUnitAI(unitId, ai)` (G-5); `IUnitModeSource` and a kingdom-side `ModeAI` do not exist.
- Vision is information-limited (A21): `IVisibleArmyBrief` (exactly id/factionId/center/heading/state) and `IVisibleCityBrief` (exactly id/factionId/position/kind) are the only shapes the visibility queries and the commander's enemy slots accept — pinned by `expectTypeOf<keyof …>`.
- `tests/kingdom/types.test.ts` (24 tests) pins every enum ordinal member-by-member, compiles a complete literal for every read interface, and compile-pins the world/battle/strategy/absent-literal/vision surfaces through `@/kingdom/types`; `tests/control/types.test.ts` (8 tests) gains the G-5 signature proof.

## Task Commits

Each task was committed atomically (Round 1 spans two revision passes at the gate):

| Task | Name | Commits |
| ---- | ---- | ------- |
| 1 | Revise `src/kingdom/types.ts` — 7 numeric enums (no TimeRate) + complete contract (tracer) | `252814b` (feat), `07ed1bb` (feat: numeric time, Engaging, no mode source), `50fd189` (fix: 3 order kinds + relative timing) |
| 2 | Apply the three approved additive seams (`IHealableUnit`, `IStaticObstacle*`, `setUnitAI`) + control test assertion | `e7156f7` (feat: G-1 + G-2), `1b2fd30` (feat: G-5 + compile shim) |
| 3 | Revise `tests/kingdom/types.test.ts` — enum pinning + numeric time + engagement + compile-time contract/seam/alias proof | `5890a3f` (test), `76ba081` (test: revised contract), `50fd189` (test: order/timing) |
| 4 | **checkpoint:decision (blocking-human)** — type-design approval | no commit (resolved by user approval) |
| — | Plan revision per gate feedback | `c8d7fd4` (docs) |

**Plan metadata:** see the final `docs(04-01): complete …` commit below.

## Files Created/Modified

- `src/kingdom/types.ts` (created, then revised twice) — the kingdom type contract: enums, read/vision surfaces, injectable strategies, scenario tables, internal mutable views
- `tests/kingdom/types.test.ts` (created, then revised) — 24 tests: enum ordinals + compile-time contract proof via `@/kingdom/types`
- `src/units/types.ts` (modified, additive) — `IHealableUnit extends IUnit { heal(amount: number): void }`; `IUnit` byte-identical
- `src/physics/types.ts` (modified, additive) — `IStaticObstacleSpec` + `IStaticObstacleWorld`; `IPhysicsWorld` byte-identical
- `src/control/types.ts` (modified, additive) — `IControlSystem.setUnitAI(unitId, ai)`; the 5 existing members byte-identical
- `src/control/ControlSystem.ts` (modified) — minimal `setUnitAI` compile shim (replace instance, release previous via provider, throw on unknown/removing id, no physics/team/action touch)
- `tests/control/types.test.ts` (modified, additive) — `setUnitAI` parameter/return type proof; all existing assertions untouched

## Decisions Made

- **Time = plain numbers, no enum (G-6).** `getMinutesPerTick()` / `setMinutesPerTick(minutes)` / `IWorldTickResult.minutesPerTick`; `BATTLE_TICK_MINUTES = 1` / `PEACE_TICK_MINUTES = 24` stay Round-2 data.
- **Army reinforcement, never freezing (revised G-3).** `Engaging = 4` appended (existing ordinals stable) + `getEngagedBattleId()`; battle membership stays unit-level.
- **Control-layer AI ownership (G-5).** `setUnitAI` replaces the instance, releases the previous one through the provider, throws on an unknown id, is O(1) and touches no physics body.
- **`Engaging` appended, not inserted**, so the four already-generated `ArmyState` ordinals stay stable for the contract tests.
- **Internal `IMutable*` views declared now** at file end under a non-gate banner so Round-2 classes never expose public members outside an interface (AGENTS §5).
- **`requirements-completed: []`** — Round 1 satisfies no KING behaviour; recording them complete would be false (mirrors Phase 2/3 round-1 precedent).

## Deviations from Plan

### Auto-fixed / user-directed changes

**1. [Rule 2 - Missing Critical] G-1 additive `IHealableUnit` seam (`src/units/types.ts`)**
- **Found during:** Task 2 (gate review)
- **Issue:** KING-03 (march heal 1/h) and KING-05 (garrison heal 2/h) had no expressible contract — `takeDamage` rejects non-positive values and level-up healing is not an hourly timer.
- **Fix:** Appended `IHealableUnit extends IUnit { heal(amount: number): void }` with clamped-to-max-health JSDoc; `IUnit` untouched; `Unit.heal` left to Round 2.
- **Files modified:** `src/units/types.ts`
- **Verification:** `pnpm typecheck` 0; `tests/kingdom/types.test.ts` G-1 block (widening helper + signature pin)
- **Committed in:** `e7156f7`

**2. [Rule 2 - Missing Critical] G-2 additive `IStaticObstacleSpec` / `IStaticObstacleWorld` (`src/physics/types.ts`)**
- **Found during:** Task 2 (gate review)
- **Issue:** D-27 blocking terrain had no seam to enter the same Rapier world as the units (ray-only terrain would have degraded the design).
- **Fix:** Appended both interfaces with JSDoc pinning the duplicated `ITerrainRect` shape (dependency direction stays kingdom → physics); Rapier implementation deferred to Round 2.
- **Files modified:** `src/physics/types.ts`
- **Verification:** `pnpm typecheck` 0; G-2 block in `tests/kingdom/types.test.ts`
- **Committed in:** `e7156f7`

**3. [Rule 3 - Blocking] G-5 `IControlSystem.setUnitAI` + minimal `ControlSystem.setUnitAI` compile shim**
- **Found during:** Task 2 (gate review) — declaring the seam alone breaks the build
- **Issue:** `ControlSystem implements IControlSystem`, so adding a non-optional interface method fails `pnpm typecheck` without an implementation.
- **Fix:** Declared the seam on `IControlSystem` (replace / release-previous-via-provider / own / unknown-id-throws / O(1) / no-physics-touch) and added the smallest behavioural shim to `ControlSystem` (swap the private `ais` entry, swallow provider-destroy failure, throw for unknown or removing id). The plan explicitly authorised this as the only implementation change in Round 1; all real behaviour and tests stay Round 2.
- **Files modified:** `src/control/types.ts`, `src/control/ControlSystem.ts`, `tests/control/types.test.ts`
- **Verification:** `pnpm typecheck` 0; `tests/control/types.test.ts` 8/8; `pnpm lint` 0
- **Committed in:** `1b2fd30`

**4. [User-requested simplification] Three army orders + relative order timing**
- **Found during:** Task 4 checkpoint review
- **Issue:** `ArmyOrderKind` carried a fourth member and orders carried an absolute `atGameMinutes` timestamp.
- **Fix:** `ArmyOrderKind` reduced to `MoveTo = 0` / `Garrison = 1` / `Hold = 2` (combat triggers automatically on entering range), and `IArmyOrder.afterMinutes` replaced the absolute timestamp (omitted = act immediately). Plan text and tests updated to match.
- **Files modified:** `src/kingdom/types.ts`, `tests/kingdom/types.test.ts`, `04-01-PLAN.md`
- **Verification:** `pnpm typecheck` 0; kingdom tests 24/24
- **Committed in:** `50fd189`

---

**Total deviations:** 4 (2 missing-critical seams, 1 blocking compile shim, 1 user-requested simplification)
**Impact on plan:** All four were approved at the blocking gate; scope stayed inside Round 1 — no Round-2 file (`KingdomWorld`, `TimeSystem`, `Army`, `City`, `BattleSystem`, `DamageSink`, `SensingWorld`, `MarchAI`/`BattleAI`/`BrakeAI`/`IdleAI`, `Commander`, `scenario.ts`, `constants.ts`, `Unit.heal`, `PhysicsWorld.addStaticObstacle`) was created.

## Issues Encountered

- The type-design gate was exercised twice: the first contract draft was revised after user feedback (control ownership → `setUnitAI`, army freezing → reinforcement, `TimeRate` enum → plain numbers), then simplified a second time on order shape/timing. Each pass was re-pinned by tests and re-verified before the approval.
- No other problems; the frozen `IUnit` / `IPhysicsWorld` / `IControlSystem` member sets held byte-identical except the single new `setUnitAI` method.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm typecheck` | exit 0 |
| `pnpm vitest run tests/kingdom/types.test.ts` | 24/24 passed |
| `pnpm vitest run tests/control/types.test.ts` | 8/8 passed |
| `pnpm test` | 21 files / 211 tests passed |
| `pnpm lint` | exit 0 |

## Known Stubs

None. This round declares types only; every "missing" Round-2 symbol is an intentional deferral documented in the plan's artifact list, not a stub wired to fake data.

## Threat Flags

None beyond the plan's `<threat_model>`. No network, no persistence, no secrets, no package installs; the three seams are additive declarations and the visibility surface was narrowed (T-04-08) rather than widened.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** the kingdom contract is frozen and approved; Round 2 (implementation plan for 04-02) can be authored directly against it.
- **Round-2 obligations recorded at the gate:** C-2 (`spawnUnit` return type → `IHealableUnit`, decided in Round 2, no silent cast), C-12 (`IBattleSystem` reads time through an injected `() => number` closure), C-15 (trained units register via `ControlSystem.registerUnit`), G-4 calibratable defaults, city-loser destination = nearest own city, city capture does NOT call `updateTeam`, projectiles/skill physics stay deferred.
- **Phase 4 remains IN PROGRESS** — it is not complete until Round 2 lands; `requirements-completed` stays empty until then.

## Self-Check: PASSED

- FOUND: `src/kingdom/types.ts`
- FOUND: `tests/kingdom/types.test.ts`
- FOUND: `src/units/types.ts` (`IHealableUnit`)
- FOUND: `src/physics/types.ts` (`IStaticObstacleWorld`)
- FOUND: `src/control/types.ts` (`setUnitAI`)
- FOUND: `src/control/ControlSystem.ts` (`setUnitAI`)
- FOUND: `tests/control/types.test.ts` (`setUnitAI`)
- FOUND: commits `252814b`, `e7156f7`, `5890a3f`, `c8d7fd4`, `07ed1bb`, `1b2fd30`, `76ba081`, `50fd189`

---
*Phase: 04-kingdom-system*
*Round: 1 (type contract only) — gate APPROVED*
*Completed: 2026-10-20*
