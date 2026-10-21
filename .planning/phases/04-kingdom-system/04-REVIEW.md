---
phase: 04-kingdom-system
reviewed: 2026-10-21T02:14:40Z
depth: standard
files_reviewed: 39
files_reviewed_list:
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
findings:
  critical: 3
  warning: 10
  info: 7
  total: 20
status: issues_found
---

# Phase 04: Code Review Report

**Reviewed:** 2026-10-21T02:14:40Z
**Depth:** standard
**Files Reviewed:** 39
**Status:** issues_found

## Summary

Phase 4's kingdom implementation is substantially complete and the stated plumbing is real: scenario validation runs before construction, the 1/24 substep loop and `setUnitAI` mode switching are wired, damage rules live only in `BattleDamageSink`, and the city/army/garrison models follow the frozen `types.ts` contract. `pnpm typecheck`, `pnpm lint`, and the full kingdom suite (113 tests) pass.

The review found three hard failures in the battle/settlement invariants and one untrusted-commander authorization gap, plus a set of robustness and test-quality problems:

- A battle that loses every member (mutual annihilation, or all survivors pushed/leaving the square) never ends. `endBattles` skips zero-member battles forever, so the world stays at 1× with a ghost battle and the pair lock suppresses a replacement.
- A battle can end before the other side ever joins, because trigger distance (80 m) and membership (40 m square) differ. The pair lock then survives while the attacker closes on a city, making that city permanently unattackable by that army. This is the same emergent collapse the 04-02 summary observed at 200 m/1-v-1 and worked around by moving fixtures to 600 m.
- `applyCommanderOrder` applies orders without checking that the army belongs to the deciding faction. A Phase-7/untrusted commander can move another faction's idle army; this contradicts threat T-04-04 and the summary's "cannot hijack" claim.
- The `Brake` window never expires while a battle remains active (contrary to the 04-02 plan), and the only test claiming to pin that window is vacuous.

Four suspected defects were confirmed with temporary probes (since removed): all-members-dead battle persistence, cross-faction commander orders, reverse-map enum strings passing `validateScenario`, and `desiredMode` returning `Brake` after the brake window expired.

## Narrative Findings (AI reviewer)

### Critical Issues

#### CR-01: A battle that loses all members never ends (ghost battle pins the world at 1×)

**Severity:** BLOCKER
**File:** `src/kingdom/BattleSystem.ts:907-913`

**Issue:** `endBattles` unconditionally skips a battle with `members.length === 0`. That guard is intended for a battle created on the current tick (join runs before trigger, so a fresh battle has no members yet). It also matches a battle that has lost every member — after mutual annihilation in one physics tick, or after every survivor leaves the `halfExtent + hysteresis` square. `pruneMembers`/`removeUnitsOutside` empty the member list, `endBattles` returns, and no code path ever ends that battle: `onEnded` never fires, `listCompletedBattles()` never gains it, `hasActiveBattle()` stays true, and `KingdomWorld.tick()` is pinned to `BATTLE_TICK_MINUTES = 1` forever. The pair lock is only released at >80 m separation, so the ghost can also suppress a replacement battle if the units/armies remain nearby.

Confirmed with a temporary probe: after driving a 6-v-6 battle to a two-sided membership and killing every unit, 20 further outer ticks left `listActiveBattles()` at length 1 and `tick().minutesPerTick === 1`.

**Fix:** Distinguish "freshly triggered, no members yet" from "previously occupied, now empty". Track a per-battle `hadMembers` flag (or creation tick) and end a battle that previously had members and now has none. Emit the `Ended` event, move it to `completed`, delete its trigger key, and invoke `onEnded`; the settlement path must tolerate zero survivors (do not attempt a city capture / regroup without survivors). Add stub tests for mutual death and for all-members-leave; keep the one-tick grace for a fresh trigger.

#### CR-02: One-sided settlement + permanent pair lock makes a defended city immune

**Severity:** BLOCKER
**File:** `src/kingdom/BattleSystem.ts:414-458, 465-525, 907-932`; `src/kingdom/KingdomWorld.ts:881-919`

**Issue:** Triggers use centre distance (< 80 m) but membership uses the 40 m battle square. On the first join pass after a trigger, one side can have no unit inside (one- or two-unit armies, trailing formations, heading away from the opponent, or the weighted-centre drift noted in the 04-02 summary). `addUnitsInside` then fills the battle with only the other side's units, and `endBattles` ends it as soon as `teams.size <= 1` — before the non-participating side ever fought. The pair lock is taken at creation and released only when centres are strictly more than 80 m apart. The attacker is moving toward the city, so it never separates; when it arrives, `resolveGarrisonOrder` sees the defender's non-empty roster as a live holder, clears the attacker's order, and the placeholder commander immediately reissues `Garrison`. The same army can never trigger another city battle: the city is permanently immune to it. With two field armies the analogous case lets them pass through each other without a fight. The 04-02 summary explicitly documents the 200 m / 1-v-1 collapse and moved the tests to 600 m / 6-unit formations; that calibrated the tests around the bug instead of fixing it.

**Fix:** Track participation per trigger side (e.g., `everJoinedTeams` or a `contested` flag) and only settle when every side has had a member (or a short grace window expires). Keep the fresh-battle grace from CR-01. Alternatively, re-arm the pair lock when a battle ends with one-sided participation. Add a regression at the trigger boundary with 1- and 2-unit armies and a trailing formation, and assert that closing armies eventually exchange damage rather than pass through.

#### CR-03: A faction's commander can issue orders to another faction's army

**Severity:** BLOCKER
**File:** `src/kingdom/KingdomWorld.ts:667-690, 761-773`

**Issue:** `applyCommanderOrder` validates that the army exists, has a non-empty roster and has no current order, then calls `issueOrder`. It never checks `army.getFactionId()` against the faction whose commander returned the order. `ICommander` is the untrusted Phase-7 seam (threat T-04-04) and the summary claims a commander can "never ... hijack an in-flight order"; a commander can still hijack any *idle* army of another faction. Confirmed with a temporary probe: a commander created for faction 1 returned `{ armyId: 2, kind: MoveTo, ... }` and `world.getArmy(2).getOrder()` became that MoveTo on the first tick.

**Fix:** Pass the deciding `factionId` into `applyCommanderOrder` and reject any order whose army's `getFactionId()` differs. Keep the existing validation. Add a test with a deliberately cross-faction commander and assert the target army's order stays `null`.

### Warnings

#### WR-01: The Brake window never expires while the battle stays active

**Severity:** WARNING
**File:** `src/kingdom/KingdomWorld.ts:1138-1165, 1187-1223`

**Issue:** In `desiredMode`, a recorded `lastBattleOfUnit` whose battle is still active returns `Brake` immediately, before `brakeUntilMinutes` is consulted. `updateBrakeWindows` also never removes an expired window while the recorded battle remains active. A unit that leaves a long-running battle therefore stays in `Brake` for the entire remaining battle instead of the documented `BRAKE_MIN_MINUTES` window, and it is left stationary while its army centre moves toward the battlefield. This contradicts the 04-02 plan: "keep Brake while that window has not elapsed, then delete both entries and fall through to the normal March/Idle decision." Confirmed with a probe that set an expired `brakeUntil` and called `desiredMode` while the battle was active; it returned `Brake` (2).

**Fix:** In the `recorded` branch, when `now >= brakeUntilMinutes.get(unitId)`, delete both `lastBattleOfUnit` and `brakeUntilMinutes` and fall through to the normal March/Idle decision; or remove expired entries in `updateBrakeWindows` and make `desiredMode` consult the window. Add a real test that keeps the battle active, ticks past `BRAKE_MIN_MINUTES`, and asserts the unit becomes March (unless it re-enters the area).

#### WR-02: Edge damage is filtered against a pre-step centre and post-step positions

**Severity:** WARNING
**File:** `src/kingdom/DamageSink.ts:74-91`; `src/control/ControlSystem.ts:289-292`; `src/kingdom/KingdomWorld.ts:811-825`

**Issue:** `BattleSystem.tick()` computes the battle centre and membership before `control.tick()`, but `applyDamage` is invoked after `physics.tick()`. The sink compares the *post-step* unit positions with the *pre-step* centre. A collision that knocks the defender just past 40 m is then treated as outside the battle and its damage is silently dropped; conversely, a unit that moved into the square during the step was not a member when the event was routed. This silently discards legitimate edge hits, which are common for high-Δv weapon collisions near the boundary.

**Fix:** Evaluate membership/area against pre-step positions (snapshot positions before `physics.tick()` and pass them with the damage context), or add a documented physical margin to the sink's area test. Add a boundary-collision regression that asserts a hit is applied when the defender crosses the 40 m line as a result of that same hit.

#### WR-03: Defender-held city battles do not retarget the losing attacker, and the lock prevents a retry

**Severity:** WARNING
**File:** `src/kingdom/KingdomWorld.ts:1425-1427` (early return) vs `1432-1471` (regroup/lock clearing); `src/kingdom/BattleSystem.ts:465-525`

**Issue:** When the defending faction wins a city battle, `handleBattleEnded` returns immediately after generic cleanup and never reaches the loser-regroup block. The losing attacker keeps its `Garrison` order and the `army:<id>:city:<id>` pair lock. It marches back to the city, `resolveGarrisonOrder` refuses because the defender roster is non-empty, the commander reissues `Garrison`, and the lock stays because the army never gets more than 80 m away. The same army can never fight that city again. The 04-05 summary explicitly notes the losing attackers are not retargeted on this path; combined with the lock rule this is an observable gameplay stall rather than a benign deviation.

**Fix:** Apply the loser-regroup/retarget path (or at least clear the attacker's `Garrison` order and move it away) on the defense-held branch as well, or release/re-arm the pair lock when a battle ends with the loser still inside the trigger distance (with a debounce). Add a test that a repelled attacker can re-engage after regrouping.

#### WR-04: Scenario enum validation is bypassed by numeric-enum reverse-map keys

**Severity:** WARNING
**File:** `src/kingdom/scenario.ts:42-53, 171-179, 210-229`; `src/kingdom/KingdomWorld.ts:560-593, 622-660`; `src/units/spawn.ts:34-36`

**Issue:** `isKnownCityKind`/`isKnownClassKind` use `Enum[value] !== undefined`. Numeric enums also expose name keys, so `'Swordsman'`, `'Capital'` and `'0'` all pass. A scenario with `trainingClass: 'Swordsman'` passes `validateScenario`, then `spawnUnit` reads `CLASS_DEFS['Swordsman']` (undefined) and throws on `def.maxHp` — after `addStaticGeometry` has already added obstacles and after earlier armies' units may have been registered, violating the "invalid table never touches physics/control" invariant. A `kind: 'Capital'` string is silently stored and makes the city train at the normal rate. `issueOrder`/`expireFulfilledOrders` have the same reverse-map acceptance for order-kind strings (`'Hold'`, `'MoveTo'`). Confirmed with a probe: `validateScenario` accepted `trainingClass: 'Swordsman'`.

**Fix:** Require numeric integral values as well as enum membership:
```ts
function isKnownCityKind(value: unknown): value is CityKind {
    return (
        typeof value === 'number' &&
        Number.isInteger(value) &&
        CityKind[value] !== undefined
    );
}
```
Apply the same to `ClassKind`, and to the order-kind checks (`typeof kind === 'number' && Number.isInteger(kind)`). Add rejection cases for `'Swordsman'`, `'Capital'`, `'0'`, and an order kind `'Hold'`.

#### WR-05: Merged battles leak the participant ledger and do not fold participants

**Severity:** WARNING
**File:** `src/kingdom/BattleSystem.ts:829-852`; `src/kingdom/KingdomWorld.ts:1308-1324, 1369-1374`

**Issue:** `absorb` ends the absorbed battle without calling `onEnded`, by design. `KingdomWorld` only deletes `battleParticipants` in `handleBattleEnded`, so the absorbed battle's set is never removed; every merge in a long session leaks one set. `absorb` also does not union the absorbed participants into the survivor's set, so a unit that participated only in the absorbed battle and leaves the survivor's area on the merge tick can be missed by the loser-regroup sweep.

**Fix:** Add a merge notification (or prune ledgers for battle ids no longer active every tick) and union the absorbed participant set into the survivor's ledger. Add a merge-with-exit test that asserts the losing army is still regrouped.

#### WR-06: Spawn rings can place units inside terrain or boundary walls

**Severity:** WARNING
**File:** `src/kingdom/scenario.ts:177-179, 227-229`; `src/kingdom/KingdomWorld.ts:83, 1018-1036, 1844-1881`

**Issue:** Validation only rejects an army centre or city point that is *strictly inside* a terrain rectangle. Units spawn on a 4 m ring around that point (`SPAWN_RING_RADIUS`), so an army centre 1–4 m from a terrain face can spawn one or more bodies inside the obstacle. An army at `x = 0` (allowed by validation) spawns a unit at `x = -4`, inside the left boundary wall. Trained units around a city near a terrain edge have the same problem. The result is a stuck/ejected unit at spawn, unreachable by normal movement.

**Fix:** Validate the spawn disk (centre ± `SPAWN_RING_RADIUS`) against terrain and `[0, width] × [0, height]`, or clamp/reject individual spawn offsets. Use the same clearance check for `produceGarrisonUnit`.

#### WR-07: Empty armies emptied by garrison selection stay `Reorganizing` and leak `reorganizingArmies`

**Severity:** WARNING
**File:** `src/kingdom/KingdomWorld.ts:1099-1132` (`rebuildArmyStates`), `1562-1609` (`createGarrisonArmy`)

**Issue:** `rebuildArmyStates` does `if (army.getUnitIds().length === 0) continue;` before the `reorganizingArmies.delete(...)` branch. If a custom `GarrisonSelector` takes every surviving unit of a winning field army, `createGarrisonArmy` empties that army after the generic cleanup marked it `Reorganizing` and added it to `reorganizingArmies`. Every later `rebuildArmyStates` skips it, so its state stays `Reorganizing` forever and its id is never removed from the set. The plan explicitly requires empty-roster armies to be retained but inert, not stuck in a transient fighting state.

**Fix:** Handle empty rosters before the skip: delete the id from `reorganizingArmies`, set `Marching` (or `Garrisoned` if a link survives), and clear any stale order. Alternatively normalize state in `pruneDeadUnits` and after `createGarrisonArmy` removes units.

#### WR-08: The brake-window test is vacuous

**Severity:** WARNING
**File:** `tests/kingdom/battle.test.ts:452-467`

**Issue:** `leftAt` and `now` are read back-to-back from `world.getTime().getGameMinutes()` with no tick in between. The guarded assertion checks the interval `[leftAt, leftAt + BRAKE_MIN_MINUTES)`, which is empty at that instant, so it can never observe a `MarchAI` installed during the window. The suite therefore does not pin the brake duration at all; the summary's claim that brake timing is "pinned on real Rapier" is false, which is why WR-01 is invisible.

**Fix:** Tick at least `BRAKE_MIN_MINUTES` game-minutes while the battle remains active, record the installs, and assert `BrakeAI` is present for the full window and is replaced afterward. Pair it with a stub/physics case that keeps the battle active so the window can be exercised deterministically.

#### WR-09: Test teleport helpers bypass the World's AI-mode bookkeeping

**Severity:** WARNING
**File:** `tests/kingdom/city.test.ts:628-641`; `tests/kingdom/vision.test.ts:133-146`; `src/kingdom/KingdomWorld.ts:1170-1179`

**Issue:** These helpers implement teleport as `control.unregisterUnit` + `control.registerUnit`. Registration creates a fresh provider-owned `IdleAI`, but `KingdomWorld.modes` still stores the old `March`/`Battle` value, so `updateUnitModes` sees no mode change and never reinstalls the intended kingdom AI. Any assertion after a teleport runs with `IdleAI`, not the AI the scenario is supposed to exercise. The same desynchronization would occur if a production path ever re-registered a unit without notifying the World.

**Fix:** Prefer physics-only teleports (`physics.removeUnit` + `physics.registerUnit`), as `battle.test.ts` does, so control state is untouched. If a control re-registration is required, add a World-level invalidation/reinstall seam or explicitly reset `modes` in the test fixture. Do not rely on post-teleport AI behavior otherwise.

#### WR-10: Commander order application is outside the exception guard and unbounded

**Severity:** WARNING
**File:** `src/kingdom/KingdomWorld.ts:686-688, 761-773`

**Issue:** Only `commander.decide(...)` is wrapped in `try/catch`; iterating the returned array and reading `order.armyId`/`order.kind` happens outside it. An untrusted commander can return a very large array (unbounded per-tick work/DoS) or objects whose getters throw, which propagates out of `world.tick()` and contradicts "a throwing commander cannot stop the simulation" and threat T-04-04. The cross-faction issue (CR-03) is separate.

**Fix:** Cap the number of orders processed (for example, the faction's army count or `MAX_SCENARIO_ARMIES`), copy and validate each order inside a per-order `try/catch`, and avoid reading untrusted properties outside the guard. Add a test that a commander returning a throwing getter or a huge array leaves `tick()` successful.

### Info

#### IN-01: Inline object types violate the project's `types.ts` convention

**Severity:** INFO
**File:** `src/kingdom/BattleSystem.ts:122, 710-717`; `src/kingdom/Army.ts:83`; `src/kingdom/MarchAI.ts:111-114`; `src/kingdom/KingdomWorld.ts:466-469, 504-507, 531-535`

**Issue:** These signatures declare inline object shapes (`{ x: number; y: number }`, `{ x; y; radius }`, a three-field pair identity) instead of reusing `IVec2` or explicit `I*` interfaces. AGENTS §2/§12 require folder-local type declarations and prohibit inline object types. `types.ts` is frozen for this phase, so a new interface cannot be added there; `IVec2` can still be reused for the point returns.

**Fix:** Reuse `IVec2` for point/centre returns and introduce a folder-local declared interface only where the frozen contract permits (or document the exception explicitly). This is a convention/maintainability issue, not a behavioral bug.

#### IN-02: `DEFAULT_BOUNDARY_WALL_COUNT` is dead

**Severity:** INFO
**File:** `src/kingdom/constants.ts:177`

**Issue:** The constant is exported and JSDoc'd but never referenced; `addStaticGeometry` hard-codes four `addStaticObstacle` calls. The constant's presence suggests the wall count is configurable when it is not.

**Fix:** Either use it to build the wall loop or remove the export.

#### IN-03: Captured cities retain the previous owner's training progress

**Severity:** INFO
**File:** `src/kingdom/KingdomWorld.ts:1619-1651`

**Issue:** `transferCityOwnership` changes the owner and links but does not reset `trainingProgressMinutes`. A city captured at 5759/5760 minutes can produce a unit for its new owner on the next substep, using progress accumulated by its previous owner. The contract does not state whether training progress belongs to the city or the owner.

**Fix:** Confirm the intended rule; if progress is owner-specific, reset it in `transferCityOwnership` and document it. Add a capture-at-threshold test either way.

#### IN-04: The critical invariants are untested

**Severity:** INFO
**File:** `tests/kingdom/battle.test.ts`, `tests/kingdom/city.test.ts`, `tests/kingdom/scenario.test.ts`, `tests/kingdom/commander.test.ts`

**Issue:** There is no test for CR-01 (all members dead/left), CR-02 (one-sided settlement at the trigger boundary), CR-03 (cross-faction order), WR-04 (enum-string validation), or WR-01/WR-08 (brake expiry). The battle/tracer fixtures were moved to 600 m and 6-unit formations specifically because the 200 m / 1-v-1 layout collapsed before contact (04-02 summary), so the most important failure mode is deliberately outside the test surface.

**Fix:** Add the regression cases described in the findings; they are small and deterministic with the existing stub-physics and real-Rapier harnesses.

#### IN-05: `dispose()` does not make `tick()` inert

**Severity:** INFO
**File:** `src/kingdom/KingdomWorld.ts:266-294, 778-805`

**Issue:** `dispose()` clears the World's maps but does not set a guard in `tick()`. A tick after disposal still advances the `TimeSystem` and calls the external `control.tick()`, so the world is not actually stopped even though its models are gone.

**Fix:** Return a zero/unchanged tick result (or throw) when `disposed` is true, or document that the caller must not tick after disposal.

#### IN-06: City-trigger and arrival disagree on what counts as a live garrison

**Severity:** INFO
**File:** `src/kingdom/BattleSystem.ts:535-598`; `src/kingdom/KingdomWorld.ts:881-919`

**Issue:** `triggerCityBattles` treats `city.getGarrisonArmyId()` with a non-empty roster as a real garrison, without checking that the army's `getGarrisonedCityId()` points back at that city. `resolveGarrisonOrder`'s `liveHolder` additionally requires the reverse link. Current writers always set both sides, but a one-way link (possible via the exported `IMutableCity`/`IMutableArmy` write surfaces) can trigger a battle while the arrival path treats the city as undefended.

**Fix:** Centralize the "live garrison" predicate (city link, army reverse link, roster non-empty, faction consistency) and use it in both places, or validate/repair symmetry whenever the link is read.

#### IN-07: `getScenario()` returns the mutable source table

**Severity:** INFO
**File:** `src/kingdom/KingdomWorld.ts:324-326`

**Issue:** The method returns the exact `IScenario` object supplied to the constructor (the scenario suite asserts identity). Callers can therefore mutate the post-construction table, and the returned table can diverge from the World's copied terrain/bounds and from simulated ownership changes. The plan explicitly requires identity, so this is a documented trade-off rather than a violation.

**Fix:** Document that the returned table is author-supplied and must not be mutated, or return a defensive copy in a later phase if Phase 5/6 only need read access.

---

_Reviewed: 2026-10-21T02:14:40Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
