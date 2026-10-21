---
phase: 04-kingdom-system
verified: 2026-10-21T03:12:00Z
status: passed
score: 30/30 must-haves verified
covered_files:
  - .planning/REQUIREMENTS.md
  - .planning/ROADMAP.md
  - .planning/phases/04-kingdom-system/04-01-PLAN.md
  - .planning/phases/04-kingdom-system/04-01-SUMMARY.md
  - .planning/phases/04-kingdom-system/04-02-PLAN.md
  - .planning/phases/04-kingdom-system/04-02-SUMMARY.md
  - .planning/phases/04-kingdom-system/04-03-PLAN.md
  - .planning/phases/04-kingdom-system/04-03-SUMMARY.md
  - .planning/phases/04-kingdom-system/04-04-PLAN.md
  - .planning/phases/04-kingdom-system/04-04-SUMMARY.md
  - .planning/phases/04-kingdom-system/04-05-PLAN.md
  - .planning/phases/04-kingdom-system/04-05-SUMMARY.md
  - .planning/phases/04-kingdom-system/04-CONTEXT.md
  - .planning/phases/04-kingdom-system/04-RESEARCH.md
  - .planning/phases/04-kingdom-system/04-REVIEW-FIX.md
  - .planning/phases/04-kingdom-system/04-REVIEW.md
  - .planning/phases/04-kingdom-system/04-VALIDATION.md
  - src/control/ControlSystem.ts
  - src/control/types.ts
  - src/kingdom/Army.ts
  - src/kingdom/BattleAI.ts
  - src/kingdom/BattleSystem.ts
  - src/kingdom/BrakeAI.ts
  - src/kingdom/City.ts
  - src/kingdom/Commander.ts
  - src/kingdom/DamageSink.ts
  - src/kingdom/Faction.ts
  - src/kingdom/IdleAI.ts
  - src/kingdom/KingdomWorld.ts
  - src/kingdom/MarchAI.ts
  - src/kingdom/SensingWorld.ts
  - src/kingdom/TimeSystem.ts
  - src/kingdom/constants.ts
  - src/kingdom/scenario.ts
  - src/kingdom/strategies.ts
  - src/kingdom/types.ts
  - src/physics/PhysicsWorld.ts
  - src/physics/types.ts
  - src/units/Unit.ts
  - src/units/spawn.ts
  - src/units/types.ts
  - tests/control/set-unit-ai.test.ts
  - tests/control/types.test.ts
  - tests/kingdom/battle.test.ts
  - tests/kingdom/city.test.ts
  - tests/kingdom/commander.test.ts
  - tests/kingdom/harness.ts
  - tests/kingdom/march.test.ts
  - tests/kingdom/scenario.test.ts
  - tests/kingdom/terrain.test.ts
  - tests/kingdom/time.test.ts
  - tests/kingdom/tracer.test.ts
  - tests/kingdom/types.test.ts
  - tests/kingdom/vision.test.ts
  - tests/physics/static-obstacles.test.ts
  - tests/units/heal.test.ts
covered_digest: "v1:sha256:8cdf6f42efd537bd8e9068d9ff23ee79eee9ebb4577e70cd69816c235e41e3da"
behavior_unverified: 0
overrides_applied: 0
re_verification:
  previous_status: passed
  previous_score: 30/30
  gaps_closed: []
  gaps_remaining: []
  regressions: []
---

# Phase 4: 王国系统 Verification Report

**Phase Goal:** 交付地图与势力层——1000×1000 地图、时间系统、行军、视野、军队、城池、驻扎/训练，以及军队/城池战斗的触发与战后结算。
**Verified:** 2026-10-21T03:12:00Z (HEAD `cfcfa19`)
**Status:** passed
**Re-verification:** Yes — fresh report at current HEAD after the review/fix/report commits; previous `covered_digest` no longer matched current file content.

## Goal Achievement

### Observable Truths

| # | Truth | Status | Evidence |
|---|-------|--------|----------|
| 1 | KING-01: 1000×1000 map with multiple factions, each owning armies and cities | ✓ VERIFIED | `MAP_WIDTH`/`MAP_HEIGHT = 1000` (`constants.ts:13,18`); `DEFAULT_SCENARIO` = 2 factions, 1 city + 1 army each, 8 units/army (`scenario.ts:278-357`); ownership asserted in `scenario.test.ts` "maps every faction, army, city and spawned unit back to the scenario table" |
| 2 | KING-01: army centres advance at a fixed 10 m/h, independent of tick rate | ✓ VERIFIED | `ARMY_SPEED_METERS_PER_HOUR = 10` (`constants.ts:42`); `advanceArmyCenter` step `(10 · minutes)/60` (`Army.ts:113`); `time.test.ts` "covers exactly 100 m in 600 game minutes"; `march.test.ts` real-Rapier run covers 100 m in 600 minutes |
| 3 | KING-01: edge contact clamps, reflects heading and continues inward; centre never leaves the map | ✓ VERIFIED | `Army.ts:108-136` reflects on the clamped axis and re-drives the crossed axis from the reflected heading; `time.test.ts` 5000-minute out-of-bounds-target loop never leaves bounds and ends moving inward; `march.test.ts` asserts inward displacement after the bounce |
| 4 | KING-02: peace = 24 game minutes/tick, battle = 1; substeps mirror the rate; tick index advances exactly once per outer tick | ✓ VERIFIED | `TimeSystem.ts:37-88`; `KingdomWorld.tick()` (`KingdomWorld.ts:264-292`); `time.test.ts` pins 24/24, 1/1, last-decision-wins, and one tick-index increment per call |
| 5 | KING-02: a tick that starts a battle early-exits and reports only the substeps actually run, returning `minutesPerTick: 1` | ✓ VERIFIED | Peace loop breaks the moment `hasActiveBattle()` turns true and re-decides after the loop (`KingdomWorld.ts:273-291`); `battle.test.ts` transition case and `tracer.test.ts` assert `gameMinutes ∈ [1,24]` with `minutesPerTick === 1` |
| 6 | KING-02: Rapier `DT` stays `1/60`; 24× is 24 one-game-minute substeps, never a scaled physics dt | ✓ VERIFIED | `stepSubstep` always advances one minute and calls `control.tick()` once (`KingdomWorld.ts:841-855`); no `DT` import or mutation in `src/kingdom/`; `tracer.test.ts` asserts 24 minutes and 24 control ticks per peace tick |
| 7 | KING-03: deterministic 25 m formation disc, rotated by heading, no random, no collapse to the centre | ✓ VERIFIED | `computeFormationSlots` radius `R·sqrt((i+0.5)/n)` (`Army.ts:27-50`); `time.test.ts` "deterministic disc" cases pin distinct slots strictly inside 25 m and heading rotation |
| 8 | KING-03: units are program-controlled into the 25 m circle on a real Rapier world and none are left behind | ✓ VERIFIED | `MarchAI` velocity-error + 64-ray repulsion installed through `IControlSystem.setUnitAI` (`MarchAI.ts`, `KingdomWorld.ts:1209-1287`); `march.test.ts` real-Rapier cases assert every unit ≤25 m after 60 steps, ≤25 m over 600 minutes, and roster integrity |
| 9 | KING-03: marching units heal 1/h through `IHealableUnit.heal`, and do not heal while fighting | ✓ VERIFIED | `applyHealing` calls `heal(MARCH_HEAL_PER_HOUR/60)` per minute and skips units with a battle (`KingdomWorld.ts:970-989`); `Unit.heal` guards/clamps/no-revive (`Unit.ts:203-215`); `march.test.ts` 3-peace-tick ≈+1.2 HP case and zero-heal-in-battle case |
| 10 | KING-04: vision is the union of own army centres (100 m) and own city points (150 m); enemy army visible by centre OR any unit position | ✓ VERIFIED | `visionCircles` + `armyInsideCircles` (`KingdomWorld.ts:464-542`); `vision.test.ts` 99/101 m, centre-outside-unit-inside, and 149/151 m boundaries |
| 11 | KING-04: vision is query-only current visibility over reduced briefs, with no history | ✓ VERIFIED | Every query rebuilds circles and new arrays (`KingdomWorld.ts:368-456`); enemy army brief has exactly `{id,factionId,center,heading,state}`, city brief exactly `{id,factionId,position,kind}`; `vision.test.ts` asserts exact key sets, no roster/order/training/garrison leaks, fresh arrays, and immediate disappear/reappear |
| 12 | KING-05: `Garrison` establishes a symmetric city↔army link, freezes the centre, refuses a second live garrison, and releases on re-order | ✓ VERIFIED | `resolveGarrisonOrder` and `issueOrder` release logic (`KingdomWorld.ts:558-614, 911-961`); `city.test.ts` symmetric links, frozen centre, second-arrival refusal, MoveTo/Hold release |
| 13 | KING-05: training takes 96 h (normal) / 72 h (capital), pauses at cap and while fighting, preserves the remainder, and produces a registered unit | ✓ VERIFIED | `applyTraining` / `produceGarrisonUnit` (`KingdomWorld.ts:998-1071`), `TRAINING_HOURS_* = 96/72` (`constants.ts:104,109`); `city.test.ts` both thresholds, remainder, cap pause, battle pause, new unit present in physics and control with `teamId = factionId` |
| 14 | KING-05: garrisoned units heal 2/h, never above the modifier-adjusted maximum | ✓ VERIFIED | `applyHealing` uses `GARRISON_HEAL_PER_HOUR = 2` when `Garrisoned` (`KingdomWorld.ts:983-987`); `city.test.ts` ≈+2 HP over 60 minutes and a max-health clamp case |
| 15 | KING-05/D-27: scenario terrain blocks both movement and the 64 sensing rays; four boundary walls keep units inside; walls stay out of `getTerrain()`; `dispose()` removes only own obstacles | ✓ VERIFIED | `addStaticGeometry` (`KingdomWorld.ts:1874-1915`), `SensingWorld` ray slabs, `dispose` (`KingdomWorld.ts:808-835`); `terrain.test.ts` blocks at the face, passable gap, boundary containment, ray stop, terrain copy without walls, physics alive after dispose, no cross-world id leak |
| 16 | KING-06: army battle triggers below 80 m; area is an 80 m square (half-extent 40) centred on the `UnitWeight` weighted centroid with finite/positive clamping and throw isolation | ✓ VERIFIED | `BATTLE_TRIGGER_DISTANCE = 80`, `BATTLE_AREA_HALF_EXTENT = 40` (`constants.ts:63,68`); `triggerArmyBattles` / `recomputeWeightedCenters` (`BattleSystem.ts:663-730, 941-983`); `battle.test.ts` trigger-boundary, member-inside-square, weighted-mean (<0.1 drift) and throwing-weight clamp cases |
| 17 | KING-06: join/leave with 1 m hysteresis/rejoin; pair lock taken at creation, duplicates suppressed, unlock only on separation > 80 m | ✓ VERIFIED | `addUnitsInside`, `removeUnitsOutside`, `releaseSeparatedPairs`, `createBattle` (`BattleSystem.ts:398-554, 741-779`); `battle.test.ts` join/leave/rejoin, one battle per pair, no duplicate `Started`, lock-until-separation |
| 18 | KING-06: overlapping battles merge (lower id survives; a City battle wins; different city ids never merge) and record `mergedIntoBattleId` | ✓ VERIFIED | `mergeOverlapping` / `pickSurvivor` / `absorb` (`BattleSystem.ts:787-897`); `battle.test.ts` lower-id merge + `mergedIntoBattleId`; `city.test.ts` City battle survives an army overlap with `cityId` intact |
| 19 | KING-06: battles end when ≤1 faction remains, on mutual annihilation, on all members leaving, and stale one-sided battles end without settlement after the join grace | ✓ VERIFIED | `endBattles` / `endUnsettled` / `finishBattle` (`BattleSystem.ts:994-1087`); `battle.test.ts` one-faction end, mutual death, all-leave, one-sided non-settlement, stale one-sided timeout |
| 20 | KING-06: `BattleDamageSink` only applies damage inside the same active battle with different teams, guards death, and never double-grants kill XP or removes bodies | ✓ VERIFIED | `DamageSink.ts:48-100`; `battle.test.ts` same-team drop, edge-hit-after-knockback applies, `ControlSystem` owns dead deregistration (`ControlSystem.ts:294-302`) |
| 21 | KING-07: a city battle requires a real garrison, produces exactly one `BattleTriggerKind.City` battle carrying `cityId`, and suppresses the co-triggered army pair | ✓ VERIFIED | `triggerCityBattles` + `isGarrisonOfEnemyCity` (`BattleSystem.ts:563-656`); `city.test.ts` exactly one `Started`, `getCityId() === 1`, no `Started` for an undefended city, City battle survives overlap |
| 22 | KING-07: capture transfers city ownership and both faction city lists while every unit keeps its original `teamId`/faction; survivors are partitioned into a new World-allocated garrison army with roster conservation | ✓ VERIFIED | `handleBattleEnded` / `resolveCityCapture` / `createGarrisonArmy` / `transferCityOwnership` (`KingdomWorld.ts:1406-1751`); no `updateTeam` call anywhere in `src/kingdom/`; `city.test.ts` ownership+city lists, unchanged teams, new army id 3 at the city, roster length == alive units, no duplicates |
| 23 | KING-07: the injected `GarrisonSelector` is sanitised (unknown ids, duplicates, non-finite dropped, cap enforced, throwing → empty), and an empty selection still captures | ✓ VERIFIED | `selectGarrison` (`KingdomWorld.ts:1601-1650`); `city.test.ts` sanitisation, cap, throwing selector cases |
| 24 | KING-07: undefended enemy cities fall on `Garrison` arrival without a battle; a defeated garrison loses its link and regroups toward the nearest own city (or a deterministic direction) | ✓ VERIFIED | `resolveGarrisonOrder` capture path (`KingdomWorld.ts:942-944`), `transferCityOwnership` clears the outgoing link (`1719-1751`), `regroupLosingArmy`/`regroupTarget` (`1759-1828`); `city.test.ts` undefended capture, defeated-garrison link cleared, `Reorganizing`, nearest-city retarget, owned-no-city fallback |
| 25 | KING-08: factions own the scenario armies/cities; `factionId` is the registration `teamId`; no faction/army field exists on `IUnit` | ✓ VERIFIED | `fillFactionRosters` and `spawnArmyUnits` (`KingdomWorld.ts:1920-1981`); `scenario.test.ts` maps every roster back to the army faction and `control.getTeam`; `src/units/types.ts:224-247` declares no `factionId`/`armyId` |
| 26 | Placeholder commander is deterministic, emits only MoveTo/Garrison/Hold without `afterMinutes`, re-issues only after fulfilment, targets only visibility-limited entities, and cannot stop the simulation | ✓ VERIFIED | `Commander.ts`; `runCommanders`/`applyCommanderOrder` with cross-faction rejection, per-order try/catch and `MAX_SCENARIO_ARMIES` cap (`KingdomWorld.ts:673-803`); `commander.test.ts` determinism, kind restriction, second order after arrival, garrison persistence, throwing commander/getter isolation |
| 27 | `validateScenario` rejects every listed invalid class before any physics/control state exists; built-in scenarios pass | ✓ VERIFIED | `scenario.ts:118-269`; `KingdomWorld` calls it as its first statement (`KingdomWorld.ts:171`); `scenario.test.ts` 31 rejection classes, happy path, and no obstacle/registration on rejection |
| 28 | End-to-end composition: scenario → march → battle start → real damage → end → world continues at peace rate | ✓ VERIFIED | `tracer.test.ts` on real Rapier observes `Started`, a real health drop, `Ended`, completed/active queues, and 10 subsequent 24-minute peace ticks |
| 29 | G-1/G-2/G-5 additive seams behave as specified (heal guards/clamp/no revive; silent monotonic static obstacles; AI-instance ownership) | ✓ VERIFIED | `Unit.ts:203-215`, `spawnUnit` returns `IHealableUnit` (`spawn.ts:34`); `PhysicsWorld.addStaticObstacle`/`removeStaticObstacle` (`PhysicsWorld.ts:199,233`); `ControlSystem.setUnitAI` with `providerOwned` (`ControlSystem.ts:195`); `tests/units/heal.test.ts`, `tests/physics/static-obstacles.test.ts`, `tests/control/set-unit-ai.test.ts` all green |
| 30 | Conventions and frozen contract: interfaces implemented, numeric enums, JSDoc, `private` keyword only, additive-only type changes, no control/physics leakage, typecheck/lint/tests green | ✓ VERIFIED | `git diff --numstat 1220d24..HEAD` on all four `types.ts` files = insertions only (14/0, 557/0, 28/0, 14/0); grep finds no accessors/`#`/`_` prefix, no wall-clock, no `getControl()`/`getPhysics()`, no `TBD/FIXME/XXX`; `pnpm typecheck` exit 0, `pnpm lint` exit 0, `pnpm test` 33 files / 332 tests passed |

**Score:** 30/30 truths verified (0 present-but-behavior-unverified)

### Deferred Items

None. No gap maps to a later phase.

### Advisory (New Scope, Unevidenced)

None. The report is a fresh content-grounded re-verification; the seven `INFO` findings carried in `04-REVIEW.md` are listed under "Known Non-Blocking Info Findings" below and are not must-have failures.

### Required Artifacts

| Artifact | Expected | Status | Details |
| -------- | -------- | ------ | ------- |
| `src/kingdom/types.ts` | 7 numeric enums + full read/contract surface, declaration-only | ✓ VERIFIED | 557 lines, additive-only; matches approved contract; no algorithm, no Rapier import |
| `src/kingdom/constants.ts` | single calibration surface (map/time/march/battle/heal/training) | ✓ VERIFIED | 1000/1000, 1/24, 10 m/h, 25/100/150/80/40/1, 1/h/2/h, 96/72 h, caps |
| `src/kingdom/TimeSystem.ts` | `class TimeSystem implements ITimeSystem` | ✓ VERIFIED | Plain numbers, no wall-clock |
| `src/kingdom/Army.ts` | `Army implements IMutableArmy` + pure helpers | ✓ VERIFIED | `computeFormationSlots`, `advanceArmyCenter` |
| `src/kingdom/City.ts` / `Faction.ts` | mutable models implementing approved interfaces | ✓ VERIFIED | No extra public members |
| `src/kingdom/BattleSystem.ts` | unit-level membership, weighted square, merge/end/queues | ✓ VERIFIED | 1124 lines; locks, join grace, lifecycle events, merge ledger |
| `src/kingdom/KingdomWorld.ts` | composition root and tick orchestrator | ✓ VERIFIED | 2000 lines; substeps, orders, battles, AI modes, healing, training, vision, capture, commander |
| `src/kingdom/MarchAI.ts` / `BattleAI.ts` / `BrakeAI.ts` / `IdleAI.ts` | program controllers implementing `IUnitAI` | ✓ VERIFIED | Deterministic; no hidden mode state |
| `src/kingdom/SensingWorld.ts` | 64-ray analytic fan with map + terrain + blockers | ✓ VERIFIED | No physics raycasts, no city geometry |
| `src/kingdom/DamageSink.ts` | same-battle/cross-team damage filter | ✓ VERIFIED | No body removal, no team mutation |
| `src/kingdom/Commander.ts` / `strategies.ts` | placeholder commander + production config | ✓ VERIFIED | Deterministic, 25 % selector, level weight |
| `src/kingdom/scenario.ts` | `validateScenario` + `DEFAULT_SCENARIO` + `SCENARIO_MINIMAL` | ✓ VERIFIED | Validation runs before construction; spawn-disk checks present |
| `src/units/Unit.ts`, `spawn.ts` | `IHealableUnit` implementation and return type | ✓ VERIFIED | No cast; guard/clamp/no-revive |
| `src/physics/PhysicsWorld.ts` | `IStaticObstacleWorld` on the same Rapier world | ✓ VERIFIED | Silent, monotonic ids |
| `src/control/ControlSystem.ts` | `setUnitAI` ownership semantics | ✓ VERIFIED | Exactly-once provider destroy; injected instances never handed back |
| `tests/kingdom/*.test.ts` (10 suites), `tests/{units,physics,control}` seam suites | behavioural coverage | ✓ VERIFIED | 121 kingdom tests; 42 seam/frozen-contract tests (`heal`, `static-obstacles`, `set-unit-ai`, three `types` suites); all green |

### Key Link Verification

| From | To | Via | Status | Details |
| ---- | -- | --- | ------ | ------- |
| `KingdomWorld` | `IControlSystem` | `setUnitAI` on mode change | ✓ WIRED | `updateUnitModes` → `createAi` (`KingdomWorld.ts:1209-1287`) |
| `KingdomWorld` | `BattleSystem` | `battles.tick()` once per substep before `control.tick()` | ✓ WIRED | `stepSubstep` (`KingdomWorld.ts:846`) |
| `KingdomWorld` | `units/spawn` | `spawnUnit` at construction and training | ✓ WIRED | Both paths register with `teamId = factionId` and monotonic ids |
| `KingdomWorld` | `IStaticObstacleWorld` | terrain + four boundary walls | ✓ WIRED | `addStaticGeometry`, removed in `dispose` |
| `BattleDamageSink` | `BattleSystem` | late-bound `() => IBattleSystem \| null` | ✓ WIRED | Harness wires sink before world (`harness.ts`) |
| `BattleDamageSink` | `IPhysicsWorld` | `getUnitState` liveness checks | ✓ WIRED | `DamageSink.ts:77-82` |
| `BattleAI` | `BattleSystem` | injected `getBattleForUnit` filter | ✓ WIRED | `BattleAI.ts`; `createAi` supplies it |
| `MarchAI` | `Army` | injected slot closure from `computeFormationSlots` | ✓ WIRED | AI holds no army reference (`MarchAI.ts:34-55`) |
| `BattleSystem` | `TimeSystem` | injected `gameMinutes` closure | ✓ WIRED | No module cycle (`BattleSystem.ts:206, 283`) |
| `PlaceholderCommander` | `ICommanderContext` | reduced vision briefs only | ✓ WIRED | `buildCommanderContext` (`KingdomWorld.ts:711-767`); context test |
| `KingdomWorld` | `validateScenario` | constructor first statement | ✓ WIRED | Rejection test proves zero physics/control mutation |

### Data-Flow Trace (Level 4)

| Artifact | Data Variable | Source | Produces Real Data | Status |
| -------- | ------------- | ------ | ------------------ | ------ |
| `getVisibleArmies` | army centre / unit positions | `Army` state + `IPhysicsWorld.getUnitState` | Yes — live positions each call | ✓ FLOWING |
| `getVisibleCities` | city point / faction | `City` model + faction city lists | Yes | ✓ FLOWING |
| `getVisibleUnitIds` | unit positions | `unitArmy` map + physics reads | Yes | ✓ FLOWING |
| `BattleSystem` membership/centre | unit positions/weights | `physics.getUnitState` + injected `unitWeight` | Yes | ✓ FLOWING |
| healing | `Health` | `IHealableUnit.heal` on game minutes | Yes | ✓ FLOWING |
| training | roster length/progress | city model + `spawnUnit` + `registerUnit` | Yes | ✓ FLOWING |
| city settlement | ownership/rosters | battle survivors + injected selector | Yes (sanitised) | ✓ FLOWING |

### Behavioral Spot-Checks

| Behavior | Command | Result | Status |
| -------- | ------- | ------ | ------ |
| Kingdom suites (10 files) | `pnpm vitest run tests/kingdom/` | 10 files / 121 tests passed | ✓ PASS |
| Full suite | `pnpm test` | 33 files / 332 tests passed | ✓ PASS |
| Type contract | `pnpm typecheck` | exit 0 | ✓ PASS |
| Lint / conventions | `pnpm lint` | exit 0 | ✓ PASS |
| Frozen declarations additive-only | `git diff --numstat 1220d24..HEAD -- src/kingdom/types.ts src/units/types.ts src/physics/types.ts src/control/types.ts` | 14/0, 557/0, 28/0, 14/0 (zero deletions) | ✓ PASS |
| No wall-clock / debt markers / forbidden syntax | grep over `src/kingdom/*.ts` | no matches (`TBD/FIXME/XXX`, `performance.`, `Date.`, accessors, `#`, `_` prefix) | ✓ PASS |

### Probe Execution

Not applicable — the phase defines no `probe-*.sh` and declares no probe-based verification; validation is the Vitest suite plus typecheck/lint.

### Requirements Coverage

| Requirement | Source Plan | Description | Status | Evidence |
| ----------- | ---------- | ----------- | ------ | -------- |
| KING-01 | 04-01, 04-02 | 1000×1000 map; fixed 10 m/h; edge bounce | ✓ SATISFIED | Truths 1-3; `time.test.ts`, `march.test.ts` |
| KING-02 | 04-01, 04-02 | Battle 1× / peace 24×; tick-rate semantics | ✓ SATISFIED | Truths 4-6; `time.test.ts`, `tracer.test.ts` |
| KING-03 | 04-01, 04-02, 04-03, 04-04 | Army of units; 25 m formation under program control; 1/h march heal | ✓ SATISFIED | Truths 7-9, 29; `march.test.ts`, `heal.test.ts` |
| KING-04 | 04-01, 04-04 | Vision: army 100 m / city 150 m; information-limited | ✓ SATISFIED | Truths 10-11; `vision.test.ts` |
| KING-05 | 04-01, 04-03, 04-04, 04-05 | City garrison cap, training 96 h/72 h, 2/h garrison heal | ✓ SATISFIED | Truths 12-15, 29; `city.test.ts`, `terrain.test.ts`, `static-obstacles.test.ts` |
| KING-06 | 04-01, 04-02, 04-05 | Army battles: <80 m trigger, 80 m weighted square, exit/end | ✓ SATISFIED | Truths 16-20; `battle.test.ts` |
| KING-07 | 04-01, 04-05 | City battles: trigger + settlement (capture, garrison, loser regroup) | ✓ SATISFIED | Truths 21-24; `city.test.ts` |
| KING-08 | 04-01, 04-02, 04-05 | Factions own armies/cities; `teamId` mapping | ✓ SATISFIED | Truths 25-27; `scenario.test.ts`, `commander.test.ts` |

No orphaned requirements: REQUIREMENTS.md maps exactly KING-01..08 to Phase 4, and every ID appears in at least one phase plan's `requirements:` field.

### ROADMAP Success Criteria

| # | Success Criterion | Status | Evidence |
|---|-------------------|--------|----------|
| 1 | 1000×1000 map, multiple factions each owning armies and cities; fixed 10 m/h march with edge bounce | ✓ SATISFIED | Truths 1-3 |
| 2 | Time system: battle 1×, peace 24×, tick interval scales with the rate | ✓ SATISFIED | Truths 4-6 |
| 3 | Marching units gather in a 25 m circle under program control; 1/h march heal | ✓ SATISFIED | Truths 7-9 |
| 4 | Vision: army radius 100 m, city radius 150 m, information-limited per faction | ✓ SATISFIED | Truths 10-11 |
| 5 | Army battles (trigger <80 m, 80 m weighted square, leave/end) and city battles (same flow + winner takeover, optional garrison, loser regroup) triggered and settled | ✓ SATISFIED | Truths 16-24 |

### Anti-Patterns Found

| File | Line | Pattern | Severity | Impact |
| ---- | ---- | ------- | -------- | ------ |
| — | — | No debt markers (`TBD/FIXME/XXX`), no placeholder text, no empty implementations, no stray console logging, no hardcoded empty render data | — | None |

Notes: `EMPTY_PROJECTILES` (`SensingWorld.ts:19`) and `SCENARIO_MINIMAL` are deliberate spec-scope values (no projectiles in v1; minimal test world), not stubs. `PlaceholderCommander` is the Phase-7-replaceable placeholder required by D-29, not an unfinished implementation. `DEFAULT_BOUNDARY_WALL_COUNT` (`constants.ts:191`) is exported but unused (see IN-02 below).

### Prohibition Audit (must-NOT)

| # | Prohibition (grouped) | Status | Evidence |
|---|-----------------------|--------|----------|
| 1 | No Rapier dt change; 24× is not a 24× physics dt | ✓ VERIFIED | `DT` untouched; `stepSubstep` = 1 minute |
| 2 | No wall-clock/frame time in `src/kingdom/` (or phase tests) | ✓ VERIFIED | Case-sensitive grep: zero matches |
| 3 | No battle rules/membership/damage in control or physics | ✓ VERIFIED | `ControlSystem`/`PhysicsWorld` have no battle membership; sink lives in kingdom |
| 4 | No army freeze when a unit enters battle | ✓ VERIFIED | `ArmyState.Engaging`, centres keep advancing; battle/tracer tests |
| 5 | No duplicate battle for a locked pair; unlock only on separation | ✓ VERIFIED | `createBattle` lock gate; battle test |
| 6 | No immediate MarchAI after leaving an active battle | ✓ VERIFIED | `BrakeAI` deterministic window test (WR-01/WR-08 regression) |
| 7 | No `IControlSystem`/`IPhysicsWorld` or accessors on `IWorld` | ✓ VERIFIED | `types.ts:375-406`; grep no `getControl`/`getPhysics` |
| 8 | No new interfaces/enums/aliases added to frozen `types.ts` during implementation | ✓ VERIFIED | All four type modules are additions-only vs `1220d24` |
| 9 | No per-unit mode state in a provider/AI | ✓ VERIFIED | `KingdomWorld.modes` owns it; AIs stateless |
| 10 | No damage after death; no double kill XP | ✓ VERIFIED | `DamageSink` alive guards |
| 11 | No determinism/replay/instruction recording | ✓ VERIFIED | No such code, as project scope requires |
| 12 | No emulated healing / no revive / no over-max | ✓ VERIFIED | Real `Unit.heal`; heal tests |
| 13 | No obstacle contact events, tag-index entry, or double removal | ✓ VERIFIED | Physics obstacle tests |
| 14 | No provider destroy for injected instances / no leaked provider-owned AI | ✓ VERIFIED | `setUnitAI` ownership tests |
| 15 | No reset of held action/team/body/registration in `setUnitAI` | ✓ VERIFIED | `set-unit-ai.test.ts` |
| 16 | No `factionId`/`armyId` on `IUnit` | ✓ VERIFIED | `src/units/types.ts:224-247` |
| 17 | No time-rate enum / `getRate`; no `IUnitModeSource`/`ModeAI` | ✓ VERIFIED | grep: zero matches |
| 18 | No string enums, accessors, `#` fields, `_` prefixes | ✓ VERIFIED | grep: zero matches; lint exit 0 |
| 19 | No training progress at cap/fighting; max one unit per substep; remainder kept | ✓ VERIFIED | `applyTraining`; city tests |
| 20 | No bypass of `registerUnit`; no reused ids | ✓ VERIFIED | `produceGarrisonUnit`; monotonic counters |
| 21 | No garrison overwrite / no asymmetric or dangling link | ✓ VERIFIED | `resolveGarrisonOrder`; city tests |
| 22 | No vision history / no widened vision return types | ✓ VERIFIED | Stateless queries; exact-key-set tests |
| 23 | No city collider/ray geometry | ✓ VERIFIED | `City` is a point; `SensingWorld` only map/terrain/blockers |
| 24 | Boundary walls excluded from scenario terrain, `getTerrain()` and rays; injected systems not disposed | ✓ VERIFIED | `terrain.test.ts` |
| 25 | No `updateTeam` or faction/team rewrite on capture; rosters conserve survivors | ✓ VERIFIED | `transferCityOwnership`; city tests |
| 26 | No trusted selector (unknown/dup/non-finite/throw) | ✓ VERIFIED | `selectGarrison`; city tests |
| 27 | No city battle without a real garrison | ✓ VERIFIED | `triggerCityBattles`; city tests |
| 28 | No army-vs-army ownership of a defended city contact; City battle not absorbed | ✓ VERIFIED | Garrison-pair suppression + City-wins merge; city tests |
| 29 | No defeated garrison left linked to a lost city | ✓ VERIFIED | `transferCityOwnership`; city test |
| 30 | Commander cannot crash, re-issue, use another kind, or read unseen enemies; fulfilled orders clear | ✓ VERIFIED | `runCommanders`/`applyCommanderOrder`; commander tests |
| 31 | No construction before `validateScenario`; no silent coercion | ✓ VERIFIED | Constructor first statement; scenario tests |
| 32 | No projectile/skill-physics/LLM behaviour | ✓ VERIFIED | Scope grep; no such modules |
| 33 | No implementation shipped in the round-1 type plan / no city battle, training, vision or commander shipped in the 04-02 plan | N/A | Plan-sequencing prohibitions; later waves (04-04/04-05) legitimately implement them, satisfied by wave ordering rather than violated |

### Known Non-Blocking Info Findings

Carried from `04-REVIEW.md` (INFO severity, outside the 13 fixed CR/WR items). None affects a phase must-have or the phase goal.

| # | Finding | Status in current code | Impact |
|---|---------|------------------------|--------|
| IN-01 | Internal inline object shapes instead of declared interfaces (`BattleSystem.ts:743`, `KingdomWorld.ts:126,466,504,532`) | Present | Convention/maintainability only; no public-contract impact. `pnpm lint` and `pnpm typecheck` green. |
| IN-02 | `DEFAULT_BOUNDARY_WALL_COUNT` is exported but unused (`constants.ts:191`) | Present | Dead constant; `addStaticGeometry` hard-codes the four walls it describes. |
| IN-03 | Captured city keeps the previous owner's training-progress minutes | Present | Contract does not state whether progress is city- or owner-scoped; no must-have defines a reset. |
| IN-04 | Critical-invariant regression tests were missing | **Resolved** | CR-01/CR-02/CR-03/WR-01/WR-04/WR-08/WR-10 regressions now exist in `battle/city/scenario/commander` suites and pass. |
| IN-05 | `dispose()` does not make `tick()` inert | Present | Documented trade-off; caller contract is no ticking after dispose. Not a phase must-have. |
| IN-06 | City-trigger and arrival use slightly different "live garrison" predicates | Present | Both writers set both links; no public path creates a one-way link. City tests assert symmetry. |
| IN-07 | `getScenario()` returns the author-supplied table | Present | Plan requires identity; documented read-only caller contract. |

### Human Verification Required

None. Every must-have truth is automated (real Rapier or deterministic unit tests), and the type-design gate was approved in Round 1 before implementation (`04-01-SUMMARY.md`: "G-1/G-2/G-5 recorded as APPROVED at the type-design gate"). The phase produces no UI; visual/interaction checks belong to Phase 5.

### Gaps Summary

No gaps. All 8 KING requirements and all five ROADMAP success criteria are observably true at HEAD `cfcfa19`:

1. 1000×1000 map, multiple factions with armies/cities, 10 m/h march and edge bounce — present and tested.
2. 1× battle / 24× peace with tick/substep semantics — present and tested, including the transition tick.
3. 25 m program-controlled formation plus 1/h march heal — present and verified on real Rapier.
4. 100 m army / 150 m city query-only vision — present, with exact boundary and information-leak tests.
5. Army and city battles with 80 m trigger, 80 m weighted square, exit/end, capture, garrison and loser regroup — present and tested.

The 3 CRITICAL and 10 WARNING code-review findings were re-checked against current code: every described fix is present (join grace / had-members end, expected-team settlement + contested flag + re-arm, cross-faction commander rejection, brake-window expiry, post-step damage-filter removal, defence-held regroup, numeric-enum validation, merge ledger folding, spawn-disk clearance, empty-roster state normalisation, deterministic brake test, physics-only teleport helper, bounded/per-order commander isolation). `pnpm typecheck`, `pnpm lint` and the full suite (33 files / 332 tests) are green on the committed tree.

---

_Verified: 2026-10-21T03:12:00Z_
_Verifier: the agent (gsd-verifier)_
