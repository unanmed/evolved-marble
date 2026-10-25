---
phase: 05-render-system
plan: 19
subsystem: kingdom
tags: [kingdom, army, heading, march, strategic-view, gap-closure]
gap_closure: true

# Dependency graph
requires:
  - phase: 04-kingdom-system
    provides: "`advanceArmyCenter` + `Army.getHeading()` (KING-01/D-12 march helper)"
  - phase: 05-render-system
    provides: "`buildStrategicFrame` → `IStrategicArmyMarker.heading` → `arrow.rotation` (05-07 panoramic arrows)"
provides:
  - "`advanceArmyCenter` returns the actual (post-reflection) travel direction as the new heading"
  - "Heading JSDoc states the real convention: radians, 0 = +x, positive toward +y (screen-clockwise), tracks travel"
affects: [05-render-system, demo, recording, 04-kingdom-system]

actuals:
  tokens: 2036
  tasks: 1
  commits: 1
plan_head_before: 3ec279be434ee002efb90dfb94acc1fd53d40391

tech-stack:
  added: []
  patterns:
    - "Pure-helper heading is derived from the movement it just decided, not carried in from the caller — one source of truth for 'which way is this army going'"

key-files:
  created: []
  modified:
    - src/kingdom/Army.ts
    - tests/kingdom/time.test.ts
    - tests/kingdom/march.test.ts

key-decisions:
  - "Reflect the per-axis *travel* components (`dir`) instead of the old heading components: on the out-of-bounds-target axes `dir` already equals `cos/sin(heading)`, so bounce behaviour is byte-identical, while on an in-bounds axis that overshoots a wall the new angle follows the real direction instead of a stale one"
  - "Reflect the direction rather than the clamped displacement: when the centre is pinned exactly on a wall the displacement is zero on that axis, but the reflected direction still points where the army will actually go next step (that is what keeps the bounce loop moving inward)"
  - "Degenerate zero-vector direction (target outside on an axis whose heading component is 0, so `dir === (0,0)`) keeps the input heading — no real movement happened, so there is no travel direction to report"
  - "Renderer untouched: the marker polygon's apex is +x and Pixi rotates clockwise for positive angles with y-down, which is exactly the `atan2(dy, dx)` convention — the arrow was wrong only because its source was stale"

patterns-established:
  - "`advanceArmyCenter` is a pure state transition that also reports the direction it chose; consumers (formation slots, strategic arrows, garrison-facing) never need to re-derive it"

requirements-completed: [KING-04]

coverage:
  - id: D1
    description: "`advanceArmyCenter` returns the actual travel direction as `heading` on a normal (non-edge) march"
    requirement: KING-04
    verification:
      - kind: unit
        ref: "tests/kingdom/time.test.ts#reports the actual travel direction as the heading on a normal march"
        status: pass
      - kind: unit
        ref: "tests/kingdom/time.test.ts#re-derives the heading from each new target (no stale direction)"
        status: pass
      - kind: integration
        ref: "tests/kingdom/march.test.ts#reports the travel direction as the heading so the strategic arrow follows the march"
        status: pass
    human_judgment: false
  - id: D2
    description: "Edge clamping still reflects the heading and the army keeps advancing inward"
    requirement: KING-04
    verification:
      - kind: unit
        ref: "tests/kingdom/time.test.ts#clamps at the east edge, reflects x, and then advances back inward"
        status: pass
      - kind: unit
        ref: "tests/kingdom/time.test.ts#clamps and reflects both axes when the target is out of bounds on both"
        status: pass
      - kind: integration
        ref: "tests/kingdom/march.test.ts#bounces off the edge and keeps advancing along the reflected heading"
        status: pass
    human_judgment: false
  - id: D3
    description: "In the Chrome panoramic view the army arrow visually points along the direction the army is travelling"
    requirement: KING-04
    verification:
      - kind: manual_procedural
        ref: "open the demo page, switch to panoramic mode, order a march and watch the arrow"
        status: unknown
    human_judgment: true
    rationale: "Test assertions pin the numeric heading and the renderer math is verified unchanged, but whether the arrow on screen reads as 'pointing where the army goes' is a visual judgement that only a human watching Chrome can sign off"

duration: 5min
completed: 2026-10-25
status: complete
---

# Phase 05 Plan 19: Army heading follows travel direction

**`advanceArmyCenter` now returns `atan2(travelY, travelX)` of the actual post-reflection direction instead of echoing the caller's heading, so the panoramic arrow (and formation orientation) tracks where the army really goes — the stale-arrow bug, not the renderer, was the defect.**

## Performance

- **Duration:** ~5 min
- **Started:** 2026-10-25T13:29:00Z (approx.)
- **Completed:** 2026-10-25T13:34:19Z
- **Tasks:** 1
- **Files modified:** 3
- **Commits:** 1 (measured from the plan ledger: `git rev-list --count 3ec279b..HEAD`)

## Accomplishments

- **Root cause fixed at the source.** `advanceArmyCenter` moved along `(dx, dy) / distance` but returned the *input* `heading` unchanged, and only negated heading components when a wall was hit. Any ordinary march (the common case) therefore left `Army.getHeading()` frozen at whatever it was born with — a default `π/4` arrow on a 7.2° eastbound march, a 180° error on a post-battle regroup toward the army's own city.
- **The returned heading is now the travel direction.** `travelX/travelY` are the per-axis direction components with the clamp reflection applied, and `heading = Math.atan2(travelY, travelX)`. When the target is on the map the direction is `(dx, dy)/distance`; when the target is off the map on an axis it is `cos/sin(heading)` — so reflection on the out-of-bounds axes is numerically identical to the previous behaviour.
- **All preserved fallbacks stay intact:** `null` target (`Hold`) returns the inputs untouched; non-finite inputs and a zero `distance` (already arrived) return the inputs; a degenerate zero direction (target outside on an axis whose heading component is 0) returns the input heading rather than inventing `atan2(0, 0) = 0`.
- **Heading convention documented honestly.** The misleading "counter-clockwise" wording is replaced in `Army.ts` with the real convention — radians, `0` = +x, positive rotates toward +y, which is **screen-clockwise** in a y-down world — on `computeFormationSlots`, on the private `Army.heading` field, and on `Army.getHeading()`, which now also states that a marching army's heading equals its travel direction.
- **Renderer verified, not patched.** `buildStrategicFrame` forwards `army.getHeading()` verbatim into `IStrategicArmyMarker.heading`, and `upsertArmyMarker` sets `arrow.rotation = marker.heading` on a polygon whose apex sits at `+ARMY_ARROW_SIZE_PX / 2` on the +x axis. Pixi's positive rotation is clockwise on a y-down canvas, which is exactly `atan2(dy, dx)` — the conversion was already correct, so no render file changed.

## Task Commits

1. **Task 1: Report actual travel direction from `advanceArmyCenter`** — `915a72b` (fix)

## Files Created/Modified

- `src/kingdom/Army.ts` — `advanceArmyCenter` derives `travelX/travelY` from `dir` with per-axis clamp reflection and returns `Math.atan2(travelY, travelX)`; the degenerate-direction guard keeps the old heading; the four heading JSDoc blocks (`computeFormationSlots`, `advanceArmyCenter` params/returns, private `heading` field, `getHeading`) now state the y-down/screen-clockwise convention and the travel-tracking contract.
- `tests/kingdom/time.test.ts` — two new cases: (a) `(500,500) → (850,300)` from a `π/4` heading returns `atan2(-200, 350)` within `1e-9` and demonstrably ≠ `π/4`; (b) a target switch east → south re-derives the heading each call (`0` then `π/2`), proving nothing is carried over.
- `tests/kingdom/march.test.ts` — one new real-physics case: starting at `π/4` and marching to `(700,700)`, the heading after one step equals the centre displacement angle (`atan2(200, 400)`) and stays put over 30 further steps; the existing east-edge bounce test gained an assertion that the reflected heading equals the next step's actual displacement angle.

## Decisions Made

- **Reflect `dir`, not the old heading, not the displacement.** Using `dir` keeps the out-of-bounds-target path bit-identical (there `dir === (cos h, sin h)`) while fixing the in-bounds-target case that overshoots a wall. Using the clamped displacement instead would collapse to `atan2(0, 0)` exactly when the centre is pinned on a wall — the very moment the arrow must point inward.
- **Keep the zero-direction guard.** `targetOutsideX` with `cos(heading) === 0` plus `dy === 0` yields `dir = (0, 0)`; returning the input heading is the only sane answer and avoids a fabricated north-facing arrow.
- **No renderer change.** The plan's `must_haves` asserted the renderer needed no fix and reading `Renderer.ts:600-628` confirmed it: `arrow.rotation = marker.heading` on a +x-apex polygon.
- **Stay inside the plan's file list.** The same "counter-clockwise" wording survives in `src/kingdom/types.ts:188` (`IArmy.getHeading`). It is a JSDoc-only inaccuracy in a frozen type file that this plan explicitly excluded, so it was left untouched rather than widening the diff; the authoritative convention now lives in `Army.ts`.

## Verification

| Check | Result |
| --- | --- |
| `pnpm vitest run tests/kingdom/time.test.ts tests/kingdom/march.test.ts` | 2 files, 29 tests passed |
| `pnpm test` | 46 files, 527 tests passed |
| `pnpm typecheck` (`tsc --noEmit`) | exit 0 |
| `pnpm lint` (`eslint .`) | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` (out of scope) |
| Diff scope | `git show --stat HEAD` → `src/kingdom/Army.ts`, `tests/kingdom/time.test.ts`, `tests/kingdom/march.test.ts` only |
| Deletions | none (`git diff --diff-filter=D --name-only HEAD~1 HEAD` empty) |

New assertions in detail:

- `time.test.ts` — normal march: `normalizeAngle(next.heading) === atan2(300-500, 850-300) = -0.5191 rad` (tolerance `1e-9`) while the input heading was `π/4`, plus `|heading - π/4| > 1`.
- `time.test.ts` — target switch: eastward leg from a `π/4` heading yields `0`; the following southward leg yields `π/2` and a larger `y`.
- `march.test.ts` — real Rapier rig starting at `π/4`: heading equals the centre-displacement angle after one step and after thirty (`atan2(200, 400)`, tolerance `1e-9`).
- `march.test.ts` — post-bounce step: heading equals `atan2(Δy, Δx)` of the step's own displacement (tolerance `1e-9`) and `x` decreases.
- Unchanged and still green: 100 m per 600 game minutes, `Hold` freeze, east-edge reflection then inward travel, both-axes corner reflection, 5000-minute containment loop, non-finite passthrough, `computeFormationSlots` disc.

## Deviations from Plan

None — plan executed exactly as written. (Formatting of the two new test blocks was normalised with `eslint --fix` scoped to those two files because `prettier/prettier` rejected the first draft; no behaviour changed.)

## Issues Encountered

- A `Set-Content` in-place rewrite of `tests/kingdom/march.test.ts` (PowerShell 5.1 defaults to ANSI) mangled the file's UTF-8 Chinese comments and stripped line breaks. Caught immediately via `git diff`, reverted with `git checkout -- tests/kingdom/march.test.ts`, and the edit was re-applied with the editor tool instead. No trace of the corrupted state reached the commit.
- `eslint --fix` on the two test files was required for `prettier/prettier` (line-wrapping of two `expect(...)` chains); it touched only those files.

## Known Stubs

None.

## Threat Flags

None — no new network, auth, file-access or trust-boundary surface; a pure helper's returned angle changed.

## User Setup Required

None.

## Next Phase Readiness

- Army heading is now trustworthy as a direction of travel, so anything reading `getHeading()` (panoramic arrows, formation slot orientation, garrison facing) reflects reality without extra bookkeeping.
- The only remaining judgement is visual: whether the arrow reads correctly on screen in Chrome. Start the dev server, switch the demo to panoramic mode and order a `MoveTo`; the arrow should swing to the travel direction within one 24-minute peace tick — including on a post-battle regroup, the case that was 180° wrong before.
- `src/kingdom/types.ts:188` still says "逆时针为正" in `IArmy.getHeading`'s JSDoc; a later doc-only pass may align it with the convention now documented in `Army.ts`.

---

*Phase: 05-render-system*
*Completed: 2026-10-25*

## Self-Check: PASSED

- FOUND: .planning/phases/05-render-system/05-19-SUMMARY.md
- FOUND: 915a72b (Task 1)
- FOUND: src/kingdom/Army.ts
- FOUND: tests/kingdom/time.test.ts
- FOUND: tests/kingdom/march.test.ts
- `pnpm test` 527 passed / 46 files · `pnpm typecheck` exit 0 · `pnpm lint` 0 errors (2 pre-existing `no-console` warnings in `src/main.ts`)
