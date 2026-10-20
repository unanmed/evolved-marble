---
phase: 04-kingdom-system
plan: 02
subsystem: kingdom-runtime-core
tags: [typescript, kingdom, tracer, game-time, march, battle-system, damage-sink, world-orchestrator, real-rapier]

# Dependency graph
requires:
  - phase: 04-kingdom-system
    plan: 01
    provides: frozen src/kingdom/types.ts contract (7 numeric enums, IWorld/IBattleSystem/IArmy/ICity/ITimeSystem/scenario tables) + additive G-1/G-2/G-5 seams
  - phase: 03-control-system
    provides: IControlSystem (registerUnit/setUnitAI/tick), IUnitAI, ISensingWorld, IDamageSink, Sensor, DefaultUnitAI
  - phase: 02-physics-simulation
    provides: IPhysicsWorld (persistent bodies, one fixed DT), IUnitState, IDamageEvent
  - phase: 01-unit-system
    provides: IUnit/AttributeKind/ClassKind, spawnUnit, CLASS_DEFS/WEAPON_DEFS/ARMOR_DEFS
provides:
  - src/kingdom/constants.ts — the kingdom layer's single calibration surface (34 constants + ZERO_ACTION)
  - TimeSystem (plain-number game clock, 1/24 rate, 1:1 substeps)
  - DEFAULT_SCENARIO / SCENARIO_MINIMAL scenario tables
  - Faction / City / Army models + computeFormationSlots / advanceArmyCenter
  - KingdomSensingWorld (map + terrain + enemy-circle 64-ray fan)
  - MarchAI / IdleAI / BrakeAI / BattleAI
  - BattleSystem (unit-level membership, weighted square, pair locks, merge, queues)
  - BattleDamageSink (same-battle/in-area/cross-team damage)
  - KingdomWorld (composition root + 1/24 substep orchestrator + AI mode switching)
  - tests/kingdom/harness.ts + time/march/battle/tracer suites
affects: [04-03, 04-04, 04-05, 05-rendering, 06-recording, 07-ai-commander]

# Actuals (#2632) — pairs with the plan's estimate to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 42240
  tasks: 3
  commits: 3

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Composition root owns physics/control; IWorld never exposes them (late-bound battles accessor for the sink)"
    - "Plain-number game time: 1 or 24 one-game-minute substeps, DT untouched, one control.tick per substep"
    - "Unit-level battle membership Map<unitId, battleId>; army centres only trigger, they never own battles"
    - "Pair lock taken at battle creation and released only past the trigger distance (no relock on end/merge)"
    - "AI mode switching only through IControlSystem.setUnitAI, only on mode change, never inside decide"
    - "Analytic 64-ray sensing (map slab + terrain AABBs + blocker circles), no physics raycasts"
    - "Real-Rapier test harness with seeded mulberry32 + late-bound battle system"

key-files:
  created:
    - src/kingdom/constants.ts
    - src/kingdom/TimeSystem.ts
    - src/kingdom/scenario.ts
    - src/kingdom/Faction.ts
    - src/kingdom/City.ts
    - src/kingdom/Army.ts
    - src/kingdom/SensingWorld.ts
    - src/kingdom/MarchAI.ts
    - src/kingdom/IdleAI.ts
    - src/kingdom/BrakeAI.ts
    - src/kingdom/BattleAI.ts
    - src/kingdom/BattleSystem.ts
    - src/kingdom/DamageSink.ts
    - src/kingdom/KingdomWorld.ts
    - tests/kingdom/harness.ts
    - tests/kingdom/time.test.ts
    - tests/kingdom/march.test.ts
    - tests/kingdom/battle.test.ts
    - tests/kingdom/tracer.test.ts
  modified: []

key-decisions:
  - "BattleSystem triggers it own battles from army centres; membership is joined on the following substep, so a zero-member battle must survive its creation tick (end pass guards members.length === 0)"
  - "Pair identity is kept in a separate pairLocks map (armyId/otherArmyId/cityId) so separation can re-measure distance without scanning battles; city locks await 04-05's citiesOf/armyOf"
  - "Merge never calls onEnded: absorbed members already belong to the survivor; City battles always survive and two different cityIds never merge"
  - "Brake mode is driven by lastBattleOfUnit + brakeUntilMinutes (>= BRAKE_MIN_MINUTES = 6), not by ArmyState; a battle that ends clears both maps immediately (no brake after the fight)"
  - "ArmyState.InBattle is treated as a reserved value: only Engaging is assigned and no branch reads InBattle"
  - "Orders are resolved from army.getOrder() each substep against an acceptance-minute ledger (afterMinutes is relative), so issueOrder never mutates movement state"
  - "The damage sink resolves membership through a late-bound () => IBattleSystem | null closure because ControlSystem is constructed before KingdomWorld"

patterns-established:
  - "Tracer-first kingdom slice: scenario data + clock → real-Rapier marching → battle/damage → world continues, each leg committed and verified"
  - "Stub-physics BattleSystem suite for geometry/lock cases that real physics cannot teleport into"
  - "Domain constants file with no DT redeclaration; every constant JSDoc'd with spec source and calibratability"

requirements-completed: [KING-01, KING-02, KING-03, KING-06, KING-08]

coverage:
  - id: T1
    description: "Game clock and army macro motion: 1/24 rates, 1:1 substeps, 10 m/h centre, edge bounce then reflected-heading advance, deterministic 25 m formation disc"
    requirement: "KING-01, KING-02"
    verification:
      - kind: unit
        ref: "tests/kingdom/time.test.ts (15 tests)"
        status: pass
    human_judgment: false
  - id: T2
    description: "Program-controlled marching on real Rapier: 64-ray kingdom sensing, MarchAI convergence inside 25 m, IdleAI zero action, BrakeAI damping"
    requirement: "KING-03"
    verification:
      - kind: integration
        ref: "tests/kingdom/march.test.ts (9 tests)"
        status: pass
    human_judgment: false
  - id: T3
    description: "Unit-level battle + world orchestrator: trigger <80 m, weighted 80 m square, join/exit/rejoin, merge metadata, one-faction end, pair lock, same-battle damage filter, 1×/24× transition, brake window, end-to-end tracer"
    requirement: "KING-06, KING-08"
    verification:
      - kind: integration
        ref: "tests/kingdom/battle.test.ts (12 tests) + tests/kingdom/tracer.test.ts (1 test)"
        status: pass
      - kind: other
        ref: "pnpm typecheck / pnpm test (248 tests) / pnpm lint"
        status: pass
    human_judgment: false

# Metrics
duration: ~33min
completed: 2026-10-20
status: complete
plan_head_before: a0ca2803a71a5d73a5d5bdaba08fbab44387c2b2
commits: 3
---

# Phase 4 Plan 02: 王国运行时核心（Tracer）Summary

**The kingdom layer is alive end-to-end: a scenario becomes factions/armies/cities, game time runs 1 or 24 plain-number minutes per tick, armies march at 10 m/h with 25 m formations on real Rapier, two armies inside 80 m open a unit-level battle with a level/strategy-weighted square, the damage sink filters to same-battle/in-area/cross-team hits, and the world keeps ticking after the battle ends.**

## Performance

- **Duration:** ~33 min
- **Started:** 2026-10-20T13:32:00Z (approx.)
- **Completed:** 2026-10-20T14:05:00Z (approx.)
- **Tasks:** 3 (all autonomous; no checkpoints)
- **Files created:** 19 (14 source, 5 test)
- **Diff:** 5,433 insertions, 0 deletions

## Accomplishments

- `constants.ts` centralises every kingdom number (map 1000×1000, 1/24 tick minutes, 10 m/h march, 25 m formation, 100/150 m vision, 80 m trigger/square, heal/training/garrison values, march/brake gains, `ZERO_ACTION`) and never redeclares `DT`.
- `TimeSystem` is the only clock: plain numbers, `advance(1)` per substep, `advanceTick()` once per outer tick, no `performance.now`/`Date.now` anywhere in `src/kingdom/`.
- `advanceArmyCenter` covers exactly 100 m in 600 game minutes (pinned to 1e-9), clamps at both bounds, reflects the heading on the crossed axis, and then keeps advancing inward along the reflected heading; `computeFormationSlots` is a deterministic disc strictly inside 25 m.
- `KingdomSensingWorld` returns exactly 64 analytic ray distances combining the map slab, terrain AABBs and enemy blocker circles (no physics raycasts, no city geometry).
- `MarchAI`/`IdleAI`/`BrakeAI`/`BattleAI` implement `IUnitAI` exactly; `BattleAI` filters enemies to its battle square and delegates to `DefaultUnitAI`; none stores mode state.
- `BattleSystem` implements the full unit-level lifecycle: prune → exit → join → release separated locks → trigger → merge → recentre → end; weighted centre with try/catch-clamped weights; merge keeps City battles and refuses differing cityIds; `Ended` carries `mergedIntoBattleId`; the pair lock is taken at creation and released only past 80 m.
- `BattleDamageSink` applies damage only for same-battle, both-in-area, cross-team pairs, mirrors Phase 3's experience/kill rules and never removes a body.
- `KingdomWorld` composes the slice: scenario build, monotonic unit ids, `control.registerUnit(teamId = factionId)`, 1 or 24 one-minute substeps, relative `afterMinutes` order resolution, Engaging/Reorganizing/Garrisoned/Marching recomputation, `setUnitAI` on mode change, brake windows, roster pruning and own-only vision stubs for 04-04.
- The tracer suite proves scenario → tick → march → trigger → join → damage → end → continue on real Rapier; battle suite adds weighted-centre, same-team suppression, exit/rejoin, brake window, duplicate suppression, merge and lock-release cases.

## Task Commits

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | Constants, game clock, scenario, Faction/City/Army models + 10 m/h bounce (tracer) | `012589e` (feat) |
| 2 | Kingdom sensing world + MarchAI/IdleAI/BrakeAI + real-Rapier march suite | `7401560` (feat) |
| 3 | BattleSystem + BattleDamageSink + BattleAI + KingdomWorld + harness + battle/tracer suites | `c981434` (feat) |

**Plan metadata:** the final `docs(04-02)` commit (SUMMARY/STATE/ROADMAP/REQUIREMENTS).

## Files Created/Modified

- `src/kingdom/constants.ts` — 34 calibratable constants + shared zero action
- `src/kingdom/TimeSystem.ts` — game-minute clock, 1:1 substeps, tick counter
- `src/kingdom/scenario.ts` — `DEFAULT_SCENARIO` (1000×1000, two factions, 1 city + 1 army each, 8 units each, city-side terrain) and `SCENARIO_MINIMAL`
- `src/kingdom/Faction.ts` / `City.ts` / `Army.ts` — models on the frozen mutable views; `Army.ts` also exports `computeFormationSlots` and `advanceArmyCenter`
- `src/kingdom/SensingWorld.ts` — analytic 64-ray fan (map slab, terrain AABB, enemy circles)
- `src/kingdom/MarchAI.ts` / `IdleAI.ts` / `BrakeAI.ts` / `BattleAI.ts` — the four unit AIs
- `src/kingdom/BattleSystem.ts` — internal `Battle` + unit-level container (locks, merge, events, queues)
- `src/kingdom/DamageSink.ts` — battle-scoped damage rules
- `src/kingdom/KingdomWorld.ts` — composition root and tick orchestrator
- `tests/kingdom/harness.ts` — real-Rapier fixture (`createKingdom`, `initRapier`, `defaultKingdomConfig`)
- `tests/kingdom/{time,march,battle,tracer}.test.ts` — 37 new behavioural tests

## Decisions Made

- **Zero-member battles survive their creation tick.** Join runs before trigger, so a newly created battle has no members on that tick; the end pass skips `members.length === 0` so the next join pass can fill it.
- **Pair locks are independent of battles.** `pairLocks` stores the pair identity so separation can re-measure distance; `battleTriggerKeys` blocks a duplicate active battle. Neither end nor merge writes a lock, satisfying D-05 (only separation > 80 m unlocks).
- **Merge never settles.** Absorbed members already belong to the survivor, so `onEnded` is skipped for merges; City battles always survive and differing cityIds never merge.
- **Brake mode is World-owned bookkeeping.** `lastBattleOfUnit` + `brakeUntilMinutes` (≥ 6 game minutes) keep `BrakeAI` installed for at least one decision interval; a battle that ends clears both immediately.
- **`ArmyState.InBattle` stays reserved.** Only `Engaging` is assigned; no branch reads `InBattle` (documented for 04-04).
- **Orders are data.** `issueOrder` validates and stores; each substep resolves the target from the stored order against an acceptance-minute ledger, so movement never mutates order state.
- **Late-bound battle accessor for the sink.** `ControlSystem` is built before `KingdomWorld`, so `BattleDamageSink` reads `() => world?.getBattleSystem() ?? null`.

## Deviations from Plan

### Auto-fixed / adjusted

**1. [Rule 3 - Blocking] No physics teleport API → tests rebuild the body**

- **Found during:** Task 3 (exit/rejoin and brake cases)
- **Issue:** `IPhysicsWorld` has no set-position, so the plan's "teleport a member outside the square" is not expressible.
- **Fix:** the battle suite removes and re-registers the body with a spec rebuilt from the unit's attributes (`WEAPON_DEFS`/`ARMOR_DEFS`), which keeps the same unit id and gives the test full positional control.
- **Consequence:** re-registration resets velocity, so the "speed drops measurably" sub-assertion was replaced by (a) a deterministic `BrakeAI` arithmetic unit test (force/torque oppose velocity; rest returns the zero action) and (b) the brake-window install assertion. Brake timing (≥ `BRAKE_MIN_MINUTES`, no MarchAI before expiry) is still pinned on real Rapier.

**2. [Tracer calibration] Inline battle/tracer scenarios use 1000×1000 and 600 m separation**

- **Found during:** Task 3 (battle start collapsed with no damage at the plan's 400×400 / 200 m layout)
- **Issue:** at 200 m the formation is still trailing its marching centre when the 80 m trigger fires; the trailing side's units sit just outside the square, and the first end pass (one faction represented) ends the battle before contact. The pair lock then prevents a second attempt.
- **Fix:** the inline scenarios place armies 600 m apart on a 1000×1000 map so formations converge before the trigger; trigger/join/centre/damage then work as designed.
- **Files:** `tests/kingdom/battle.test.ts`, `tests/kingdom/tracer.test.ts` (no production constant changed).

**3. [Test expectation] A peace tick can start a battle on its last substep**

- **Found during:** Task 3 (tracer)
- **Issue:** the plan's "transition tick reports `gameMinutes: 1`" is not universally true: if the trigger fires on the 24th substep, the tick legitimately runs 24 minutes and then reports `minutesPerTick: 1` (the post-loop re-decision).
- **Fix:** tests pin `minutesPerTick === 1` on the transition tick and assert `gameMinutes` is within `[1, 24]`; the battle-rate invariant is additionally asserted through `world.getTime().getMinutesPerTick() === 1` while a battle is active.

**4. [Contract gap — deferred] `GarrisonSelector` cannot name units**

- **Found during:** Task 3 (harness)
- **Issue:** the frozen `GarrisonSelector` must return unit ids, but `IUnit` exposes no id and the selector's `candidates: readonly IUnit[]` carries no id mapping.
- **Fix:** the harness's default selector returns an empty selection (equivalent to the sanitised-throw path) and documents the gap; this plan never invokes it. **04-05 owns the real wiring of this seam.**

**5. [Forward-compat note] City pair locks**

- **Found during:** Task 3
- **Issue:** the separation pass has no city accessor in this plan's constructor, so `army:<id>:city:<id>` locks cannot be measured yet.
- **Fix:** no city lock is created in 04-02; the release pass keeps such entries and 04-05 adds `citiesOf`/`armyOf` plus the city measurement it already plans. Documented in `BattleSystem.releaseSeparatedPairs`.

**Total deviations:** 5 documented adjustments (1 blocking API gap, 2 test-calibration/expectation fixes, 1 contract gap deferred, 1 forward-compat note).
**Impact on plan:** no frozen type was modified, no dependency added, no 04-03/04-04/04-05 work was implemented, and all plan-level invariants (pair lock, merge rules, damage filter, 1×/24×, no wall clock) are enforced and tested.

## Issues Encountered

- **Emergent battle stall/collapse:** the weighted-centre square can drift with charging units, dropping one faction from the area (the battle then ends). This is the specified behaviour (D-14/D-20) rather than a bug, but it makes "fight to annihilation" unpredictable; tests therefore finish a fight deterministically by killing the losing side after real collision damage is observed, and pin the end rule itself in the stub-physics suite.
- **PowerShell `Set-Content` mangled a test file's UTF-8 Chinese comments** during iteration; the file was rewritten with the `Write` tool. No production file was affected.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/kingdom/` | 5 files / 61 tests passed (24 pre-existing contract + 37 new) |
| `pnpm test` | 25 files / 248 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `git diff HEAD -- src/units/Unit.ts src/units/spawn.ts src/physics/PhysicsWorld.ts src/kingdom/types.ts` | empty (frozen/04-03 files untouched) |

## Known Stubs

- `KingdomWorld.getVisibleArmies` / `getVisibleCities` / `getVisibleUnitIds` return only the faction's own entities; plan 04-04 replaces them with the 100 m/150 m union (explicitly scheduled, not a data stub).
- `tests/kingdom/harness.ts` `defaultGarrisonSelector` returns `[]` because the frozen selector cannot name `IUnit` ids; plan 04-05 wires the real selector/config.
- City training, healing, terrain obstacles and boundary walls are intentionally absent (04-04); city battles/settlement and the commander are intentionally absent (04-05).

## Threat Flags

None beyond the plan's `<threat_model>`. No network, persistence, secrets or new packages; the weighted-centre `UnitWeight` is try/catch-clamped, `issueOrder` validates every field, unit ids never reuse, and membership/damage scope is pinned by tests.

## Self-Check: PASSED

- FOUND: `src/kingdom/constants.ts`, `TimeSystem.ts`, `scenario.ts`, `Faction.ts`, `City.ts`, `Army.ts`, `SensingWorld.ts`, `MarchAI.ts`, `IdleAI.ts`, `BrakeAI.ts`, `BattleAI.ts`, `BattleSystem.ts`, `DamageSink.ts`, `KingdomWorld.ts`
- FOUND: `tests/kingdom/harness.ts`, `time.test.ts`, `march.test.ts`, `battle.test.ts`, `tracer.test.ts`
- FOUND: commits `012589e`, `7401560`, `c981434`
- VERIFIED: frozen type files and 04-03-owned files unchanged

---
*Phase: 04-kingdom-system*
*Completed: 2026-10-20*
