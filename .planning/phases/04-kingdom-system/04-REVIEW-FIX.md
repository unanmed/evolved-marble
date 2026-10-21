---
phase: 04-kingdom-system
fixed_at: 2026-10-21T10:50:00Z
review_path: .planning/phases/04-kingdom-system/04-REVIEW.md
iteration: 1
findings_in_scope: 13
fixed: 13
skipped: 0
status: all_fixed
---

# Phase 04: Code Review Fix Report

**Fixed at:** 2026-10-21T10:50:00Z
**Source review:** `.planning/phases/04-kingdom-system/04-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 13 (3 critical + 10 warnings)
- Fixed: 13
- Skipped: 0

All fixes were applied in the main checkout because
`.planning/config.json` sets `workflow.use_worktrees: false`.

## Fixed Issues

### CR-01: A battle that loses all members never ends

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/BattleSystem.ts`, `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** Added per-battle `everJoinedTeams` / `battleCreatedTick` ledgers. A battle that
previously had members and now has none (mutual annihilation or every survivor leaving) is ended:
`Ended` event, completed queue, trigger-key cleanup, `onEnded`. A freshly triggered zero-member
battle keeps a one-tick grace (`BATTLE_JOIN_GRACE_TICKS = 15`, one substep = one battle minute).
Ending without survivors skips city capture and regroup. Added stub regressions for mutual death
and all-members-leave.

### CR-02: One-sided settlement and the permanent pair lock

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/BattleSystem.ts`, `src/kingdom/KingdomWorld.ts`, `src/kingdom/constants.ts`
**Commit:** 85aea4a (constants in 220d2fc)
**Applied fix:** Each battle records the expected participant teams at trigger time (army-vs-army:
both army factions; city: attacker + city owner). Settlement only happens once **every expected team
has had a member**; one-sided membership waits for the join grace, then ends without settlement and
re-arms the pair lock with a short retrigger cooldown. This stops a battle ending before contact and
stops the attacker's approach from permanently immunising a defended city. `handleBattleEnded` receives
a `contested` flag and refuses city transfers when no real contact occurred. Added stub regressions for
one-sided non-settlement and stale one-sided timeout.

### CR-03: A faction's commander can issue orders to another faction's army

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** `applyCommanderOrder` now takes the deciding `factionId` and rejects any order whose
target army `getFactionId()` differs. Added a cross-faction commander regression in
`tests/kingdom/commander.test.ts`.

### WR-01: The Brake window never expires while the battle stays active

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** `desiredMode` now consults `brakeUntilMinutes` while the recorded battle is still
active; once the window elapses it deletes both entries and falls through to the normal March/Idle
decision. Pinned by the new deterministic brake-window test.

### WR-02: Edge damage filtered against a pre-step centre and post-step positions

**Status:** fixed
**Files modified:** `src/kingdom/DamageSink.ts`
**Commit:** baca5a4
**Applied fix:** Removed the redundant post-step square test. Membership is decided by
`BattleSystem` before the physics step, so re-testing post-step positions against the pre-step centre
dropped legitimate edge hits. The sink still verifies both bodies exist. Added a regression that
applies a hit after the defender is moved outside the square without a battle tick.

### WR-03: Defender-held city battles do not retarget the losing attacker

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** Extracted `resolveCityCapture` and moved loser regroup outside the capture-only
branch. On a defence-held city battle the losing attacker is now regrouped (stale `Garrison` order
cleared, `MoveTo` toward its rear), so it leaves the trigger radius and the pair lock can release.

### WR-04: Scenario enum validation bypassed by reverse-map keys

**Status:** fixed
**Files modified:** `src/kingdom/scenario.ts`, `src/kingdom/KingdomWorld.ts`
**Commits:** 7ec5f86, 85aea4a
**Applied fix:** `isKnownCityKind` / `isKnownClassKind` now require a number, an integer and enum
membership, rejecting `'Swordsman'`, `'Capital'` and `'0'`. `issueOrder`, `expireFulfilledOrders` and
`applyCommanderOrder` apply the same numeric-integer check to order kinds. Added rejection cases and a
string-order-kind regression.

### WR-05: Merged battles leak the participant ledger

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/BattleSystem.ts`, `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** Added an `onMerged` callback. `absorb` folds the absorbed battle's team sets into the
survivor, and `KingdomWorld.handleBattlesMerged` unions the absorbed participant set into the
survivor's ledger and deletes the absorbed entry. Added a merge-notification regression asserting the
hook fires with the expected absorbed/survivor ids.

### WR-06: Spawn rings can place units inside terrain or boundary walls

**Status:** fixed
**Files modified:** `src/kingdom/constants.ts`, `src/kingdom/scenario.ts`
**Commits:** 220d2fc, 7ec5f86
**Applied fix:** Moved `SPAWN_RING_RADIUS` into `constants.ts` and added spawn-disk validation.
Army spawn points and city points must keep a `SPAWN_RING_RADIUS` disk fully inside
`[0, width] × [0, height]` and clear of every terrain rectangle. The same check covers trained units
produced around a city point.

### WR-07: Emptied armies stay `Reorganizing` and leak `reorganizingArmies`

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** `rebuildArmyStates` now handles empty rosters before skipping: deletes the
`reorganizingArmies` entry, clears any stale order, and normalises to `Garrisoned` when a link survives
or `Marching` otherwise.

### WR-08: The brake-window test is vacuous

**Status:** fixed
**Files modified:** `tests/kingdom/battle.test.ts`
**Commit:** c455766
**Applied fix:** Replaced the vacuous real-Rapier assertion with a deterministic stub-physics kingdom
(static positions, no damage). The test keeps the battle active, ticks through
`BRAKE_MIN_MINUTES`, asserts no `MarchAI` install occurs inside the window and that exactly the
post-window expiry installs `MarchAI`, then verifies the unit can rejoin.

### WR-09: Test teleport helpers bypass the World's AI-mode bookkeeping

**Status:** fixed
**Files modified:** `tests/kingdom/harness.ts`, `tests/kingdom/city.test.ts`, `tests/kingdom/vision.test.ts`
**Commit:** c455766
**Applied fix:** Added `teleportUnitPhysics` to the harness (physics `removeUnit` + `registerUnit`
using the unit's own attributes/equipment) and switched the city/vision teleport helpers to it, so
control registration and `KingdomWorld.modes` stay in sync.

### WR-10: Commander order application is outside the exception guard and unbounded

**Status:** fixed: requires human verification
**Files modified:** `src/kingdom/KingdomWorld.ts`
**Commit:** 85aea4a
**Applied fix:** Order application is capped at `MAX_SCENARIO_ARMIES` per faction per tick and each
order (including indexing and property reads) is applied inside a per-order `try/catch`. Added a
regression with a 5000-entry array whose index 0 getter throws; `world.tick()` remains successful.

## Verification

Ran in the **main checkout** (`workflow.use_worktrees: false`), on the committed tree:

| Command | Result |
| --- | --- |
| `pnpm typecheck` (`tsc --noEmit -p tsconfig.json`) | PASS |
| `pnpm lint` (`eslint .`) | PASS |
| `pnpm test` (`vitest run`) | PASS — 33 files, 332 tests |

Constraints respected:
- `src/kingdom/types.ts`, `src/control/types.ts`, `src/units/types.ts`, `src/physics/types.ts` untouched.
- `package.json` / `pnpm-lock.yaml` untouched; no new dependencies.
- No `REVIEW-FIX.md` commit was made (left for the orchestrator).

Commit grouping note: several findings share the same files and code regions, so per-finding commits
were grouped into five atomic-by-area commits (`220d2fc`, `85aea4a`, `baca5a4`, `7ec5f86`, `c455766`)
instead of splitting hunks within a file.

## Skipped Issues

None.

---

_Fixed: 2026-10-21T10:50:00Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
