---
phase: 05-render-system
plan: 18
subsystem: control
tags: [control, default-ai, tuning, uat, combat-pace]
gap_closure: true

# Dependency graph
requires:
  - phase: 05-render-system
    provides: "DefaultUnitAI velocity-error controller + stall/disengage cycle (05-10..05-12 tuning lineage)"
provides:
  - "Faster default-AI tuning: gain 8, attack 16 m/s, approach 8 m/s, disengage 10 m/s"
affects: [04-combat, demo, recording]

actuals:
  tokens: 1100
  tasks: 1
  commits: 3
plan_head_before: 45beacb28e0210b0fdc19a0e789cf78da82b825a

tech-stack:
  added: []
  patterns:
    - "Single tuning entry point: all four pacing knobs live in src/control/constants.ts, so the whole combat tempo shifts by editing constants only — no AI logic, physics or damage code moves"

key-files:
  created: []
  modified:
    - src/control/constants.ts

key-decisions:
  - "Doubling the linear gain (4 -> 8) rather than raising MAX_FORCE_MAGNITUDE: the force cap is untouched and still never reached at default mass, so the defensive bound keeps its meaning"
  - "Attack speed 16 m/s > approach 8 m/s keeps the 'accelerate into the hit' contrast that makes the charge read as an impact, now with roughly 2x the closing Δv (damage scales with sqrt(Δv))"
  - "Disengage speed raised only to 10 m/s (< attack 16) so the back-off stays a short reset of the stall cycle, not a flight away from the fight"
  - "No test file changed: every value-sensitive assertion in tests/control/default-ai.test.ts already multiplies the imported DEFAULT_AI_* constants, so the behavioural contracts are re-verified against the new numbers instead of being re-derived by hand"

patterns-established:
  - "Tuning-only plans assert through symbolic constants so the behavioural test intent survives recalibration unchanged"

requirements-completed: [CTRL-02]

duration: 6min
completed: 2026-10-25
status: complete
---

# Phase 05 Plan 18: Faster default-AI combat rhythm

**The default AI now reaches its target speed twice as fast and charges twice as hard — linear gain 4→8, attack 12→16 m/s, approach 6→8 m/s, disengage 8→10 m/s — with no physics, damage, collider or battle-membership change.**

## Performance

- **Duration:** 6 min
- **Tasks:** 1
- **Files modified:** 1
- **Commits:** 3 (measured from the plan ledger: `git rev-list --count 45beacb..HEAD`, which includes the plan metadata commit and this summary refresh)

## Accomplishments

- `DEFAULT_AI_LINEAR_GAIN` 4 → 8: the same velocity error now produces twice the force (`force = Δv · Mass · gain`), so units accelerate to their desired speed in half the time and hit the target speed cap less often.
- `DEFAULT_AI_ATTACK_SPEED` 12 → 16 m/s: the in-range charge closes ~33% faster, and since collision damage scales with `sqrt(Δv)`, opening impacts land measurably harder.
- `DEFAULT_AI_APPROACH_SPEED` 6 → 8 m/s: the pre-contact phase shortens, so armies commit to the melee sooner.
- `DEFAULT_AI_DISENGAGE_SPEED` 8 → 10 m/s: the stall → back-off → re-charge cycle (the mechanism that keeps producing new contacts and therefore new damage) closes faster.
- All four knobs keep their single-source-of-truth position in `src/control/constants.ts`, each with JSDoc stating the new intent plus the "calibratable" caveat required by the project conventions.
- Force magnitude stays below `MAX_FORCE_MAGNITUDE` (5000 N) at the default mass of 10 — `10 · 8 · 16 = 1280 N` — so the defensive clamp is untouched and still has headroom.

## Task Commits

1. **Task 1: Raise AI force and speed constants** — `c19227c` (perf)
2. **Plan metadata: complete summary** — `e381dc0` (docs)
3. **Summary refresh: measured commit count** — this commit (docs)

## Files Created/Modified

- `src/control/constants.ts` — four `DEFAULT_AI_*` values raised; the approach/attack/gain/disengage JSDoc now records the UAT rationale ("faster close / harder charge / faster cycle") and keeps "可校准".

## Decisions Made

- **Gain first, cap never.** The pacing complaint is about acceleration, not about a missing force ceiling, so `DEFAULT_AI_LINEAR_GAIN` carries the change and `MAX_FORCE_MAGNITUDE` is left alone. Raising the cap would have weakened a deliberate safety bound (ASVS V5) to buy the same effect.
- **Preserve the speed ordering.** `APPROACH (8) < DISENGAGE (10) < ATTACK (16)`. The attack value must stay the largest for the in-range charge to still read as a committed impact; the disengage value must stay below it so the back-off is a reset, not a retreat.
- **No test edits.** `tests/control/default-ai.test.ts` asserts force magnitudes as `mass · DEFAULT_AI_LINEAR_GAIN · DEFAULT_AI_*_SPEED` and `tests/control/stalemate.test.ts` asserts only timing/health facts. Both express behavioural intent, not old numbers, so re-basing them by hand would have replaced a live contract with a hardcoded one. They pass unchanged against the new values — which is precisely the guarantee the plan asked for.
- **Physics-adjacent behaviour untouched.** Damage formula, collider geometry, battle membership and the removed low-health retreat are all unchanged; the plan's prohibition is satisfied by construction because only four numeric literals moved.

## Verification

| Check | Result |
| --- | --- |
| `pnpm vitest run tests/control/default-ai.test.ts tests/control/stalemate.test.ts` | 2 files, 21 tests passed |
| `pnpm test` | 46 files, 524 tests passed |
| `pnpm typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm lint` (`eslint .`) | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` (out of scope) |
| Diff scope | `git diff --name-only 45beacb..HEAD` → `src/control/constants.ts` only |

The real-physics repeated-damage regression (`tests/control/stalemate.test.ts`) still reports ≥2 damaging hits, with the second duel hit ≥60 ticks after the first and damage continuing past tick 193 for the surrounded defender — the higher speeds accelerate the cycle without breaking the new-contact damage mechanism.

## Deviations from Plan

None — plan executed exactly as written. The plan listed the two control test files under `files_modified`; they needed no change (see the "No test edits" decision above), so the final diff is the one file whose values were actually in scope.

## Issues Encountered

- `state advance-plan` declined (`reason: plans_outstanding`): phase 05 still reports `05-10-PLAN.md` without a SUMMARY.md, which is a pre-existing phase-05 gap unrelated to this plan. STATE.md's plan counter was therefore left as-is; `state update-progress` still recorded 37/38 plans complete and `roadmap update-plan-progress` recorded 18 plans / 17 summaries for the phase. Resolving 05-10 is the orchestrator's call, not something this gap-closure plan should paper over with a fabricated summary.

## Known Stubs

None.

## Threat Flags

None — no new network, auth, file-access or trust-boundary surface; four numeric constants changed.

## User Setup Required

None.

## Next Phase Readiness

- Combat tempo is now governed entirely by four values in `src/control/constants.ts`; further pacing feedback can be applied the same way without touching AI logic.
- Whether the faster rhythm actually reads as "intense and good-looking" on screen is a human visual judgement and still needs a pass in Chrome via the existing demo page. If it overshoots (units skating or clumping), the two knobs to revisit are `DEFAULT_AI_LINEAR_GAIN` and `DEFAULT_AI_ATTACK_SPEED`.

---

*Phase: 05-render-system*
*Completed: 2026-10-25*

## Self-Check: PASSED

- FOUND: .planning/phases/05-render-system/05-18-SUMMARY.md
- FOUND: c19227c (Task 1)
- FOUND: e381dc0 (plan metadata)
- FOUND: src/control/constants.ts
- `pnpm test` 524 passed / 46 files · `pnpm typecheck` exit 0 · `pnpm lint` exit 0 (2 pre-existing `no-console` warnings in `src/main.ts`)
