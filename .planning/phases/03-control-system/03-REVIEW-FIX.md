---
phase: 03-control-system
fixed_at: 2026-10-20T05:24:47.308Z
review_path: .planning/phases/03-control-system/03-REVIEW.md
iteration: 1
findings_in_scope: 11
fixed: 11
skipped: 0
status: all_fixed
---

# Phase 3: Code Review Fix Report

**Fixed at:** 2026-10-20T05:24:47.308Z
**Source review:** `.planning/phases/03-control-system/03-REVIEW.md`
**Iteration:** 1

**Summary:**
- Findings in scope: 11 (2 BLOCKER + 9 WARNING)
- Fixed: 11
- Skipped: 0

**Constraints honored:**
- `src/control/types.ts` (approved frozen contract), `src/units/*`, and `src/physics/*` were not modified.
- No new dependencies.
- `workflow.use_worktrees` is `false`, so all edits and commits were made in the main checkout (no isolated worktree).

## Fixed Issues

### CR-01: Skill-intent payload is not validated and is emitted by reference

**Files modified:** `src/control/ControlSystem.ts`, `tests/control/loop.test.ts`
**Commit:** `ed373c1`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** Extracted `readSkillIntent(rawIntent, unitId)`. It now validates the discriminator, the deciding `unitId`, and the payload member for the selected branch (`weapon` must be a `WeaponKind` member; `skill` must be a `SkillKind` member), then **rebuilds a fresh object**. Invalid payloads (`weapon: 999`, missing `weapon`, `skill: 999`, missing `skill`) are dropped. Added tests for all malformed payloads and for a plugin mutating its original intent after the decision.

### CR-02: Observation snapshot leaks mutable equipment objects and the physics motion object

**Files modified:** `src/control/Sensor.ts`, `tests/control/sensing.test.ts`
**Commit:** `33e345e`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** Self and neighbour equipment entries are copied (`map(item => ({ ...item }))`), motion is copied (`{ ...motion }`), and projectile sightings are copied. Tests assert the snapshot entries/objects are not the same references as `IUnit`/physics-owned objects and that mutating the snapshot does not corrupt `CLASS_DEFS`-backed unit equipment.

### WR-01: `registerUnit` after `dispose()` leaks AI instances

**Files modified:** `src/control/ControlSystem.ts`, `tests/control/loop.test.ts`
**Commit:** `3ffc97e`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** `registerUnit` now fails closed with a descriptive error when the controller is disposed. Test proves no AI is created and no physics body is registered after disposal.

### WR-02: Re-entrant `provider.destroy` can double-destroy and recurse

**Files modified:** `src/control/ControlSystem.ts`, `tests/control/loop.test.ts`
**Commit:** `7d47bb7`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** Added a `removing` re-entry set. `removeRegisteredUnit` removes the AI from `ais` **before** calling `provider.destroy`, keeps `units`/`teams` readable during the callback, deletes the catalog/team and physics body afterward, and guards the whole method. `dispose()` uses the same guard so a re-entrant `unregisterUnit` cannot double-destroy. Test uses a provider whose `destroy` calls back into `unregisterUnit`.

### WR-03: Dead or deregistered units still get decisions, actions, and skill intents

**Files modified:** `src/control/ControlSystem.ts`, `tests/control/loop.test.ts`
**Commit:** `5d5d7f6`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** The decision loop skips units that are missing or already dead before sensing; after `decide` it re-checks that the unit is still registered and alive before storing the action or emitting an intent. The apply loop skips missing/dead owners. Tests cover a unit dead before the tick and a re-entrant `decide` that unregisters the unit.

### WR-04: Sensing failures are not isolated and abort the whole `tick()`

**Files modified:** `src/control/ControlSystem.ts`, `src/control/Sensor.ts`, `tests/control/loop.test.ts`, `tests/control/sensing.test.ts`
**Commit:** `1cab224`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** Wrapped `sensor.sense(unitId)` in a per-unit `try/catch` so a sensing failure skips only that unit. `sanitizeRayDistances` now accepts `unknown` and treats a non-array as "no hits". Added `sanitizeProjectiles`, which drops non-object/non-finite entries and clamps distance to `[0, SENSING_MAX_DISTANCE]`, treating non-arrays as empty. Tests cover a throwing sensing world, a non-array ray result, malformed projectile entries, and a non-array projectile result.

### WR-05: XP level-ups in the test damage sink can resurrect units killed by the same blow

**Files modified:** `tests/control/damage-sink.ts`, `tests/control/loop.test.ts`
**Commit:** `ef9b2d2`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** The sink now records `survivedHit` after `takeDamage`; defense XP is granted only when the defender survived, and attack/kill XP only when the attacker is alive. Tests assert a lethal blow leaves the defender at 0 HP (no resurrection) and that an attacker already dead cannot level-up/revive from attack or kill XP.

### WR-06: Same-team immunity exists only in the test fixture

**Files modified:** `tests/control/damage-sink.ts`, `tests/control/loop.test.ts`
**Commit:** `787d080`
**Status:** fixed
**Applied fix:** Documented on `TestDamageSink` that same-team immunity is a sink-owned rule which every production sink must re-implement, and renamed the integration test to say it validates the fixture (production sinks must re-apply the filter). Added a direct sink-level test asserting a same-team context deals no damage. The frozen `IDamageSink` contract could not be edited, so the handoff is documented in the fixture/comment and this report.

### WR-07: Non-finite `teamId` silently disables team classification and same-team immunity

**Files modified:** `src/control/ControlSystem.ts`, `tests/control/loop.test.ts`
**Commit:** `dc57029`
**Status:** fixed: requires human verification (logic-class change)
**Applied fix:** `registerUnit` and `updateTeam` reject non-finite `teamId` values with descriptive errors before any state change. Tests cover `NaN` registration (no AI/physics side effects) and `Infinity` in `updateTeam` (existing team preserved).

### WR-08: Held-action replacement across decisions is not tested

**Files modified:** `tests/control/loop.test.ts`
**Commit:** `6e9a169`
**Status:** fixed
**Applied fix:** Added a test where the AI returns action A (`forceRight = 10`) at tick 0 and action B (`forceUp = 20`) at tick 6; asserted A is applied on ticks 0–5 and B replaces it on ticks 6–12, pinning D-13.

### WR-09: Sanitizer security tests are missing for rays and intent payloads

**Files modified:** `tests/control/sensing.test.ts`, `tests/control/loop.test.ts`
**Commit:** `bfbddc3`
**Status:** fixed
**Applied fix:** Added ray tests for mixed malformed values (`NaN`, negative, over-limit, `Infinity`) proving per-element sanitization and valid-value preservation, an over-long (70-entry) ray array truncated to exactly 64, and a mixed-magnitude action test proving one invalid field does not zero valid fields. Intent-payload cases are covered by the CR-01 tests committed in `ed373c1`.

## Skipped Issues

None — all in-scope findings were fixed.

## Verification

All gates were run in the **main checkout** (worktrees disabled by project config), after all fixes:

| Command | Result |
|---------|--------|
| `pnpm typecheck` | clean (no errors) |
| `pnpm test` | 20 files / **186 tests passed** (baseline was 167; +19 tests) |
| `pnpm lint` | clean (no errors) |

---

_Fixed: 2026-10-20T05:24:47.308Z_
_Fixer: the agent (gsd-code-fixer)_
_Iteration: 1_
