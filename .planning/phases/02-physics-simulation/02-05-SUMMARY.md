---
phase: 02-physics-simulation
plan: 05
subsystem: physics
tags: [rapier, event-queue, collision-events, contact-event, part-tag, phys-02, d04, d08]

# Dependency graph
requires:
  - phase: 01-unit-system
    provides: "frozen WeaponKind/ArmorKind/IWeaponDef/IArmorDef and the @/ path alias"
  - phase: 02-physics-simulation (wave 1, 02-02)
    provides: "frozen src/physics/types.ts (ColliderPart, IContactEvent, IPhysicsTickResult, IPhysicsWorld)"
  - phase: 02-physics-simulation (wave 2, 02-04)
    provides: "PhysicsWorld compound body + collider-handle→part index + fixed-step tick() with an owned EventQueue"
provides:
  - "src/physics/PhysicsWorld.ts — tick() now drains Rapier's EventQueue and emits part-tagged IContactEvent[] for started contacts (unordered A/B, same-unit-guarded)"
  - "tests/physics/events.test.ts — scripted Weapon↔Body overlap, valid ColliderPart tags, no self contacts, lone-unit silence"
affects: [02-physics-simulation 02-06 (damage pipeline consumes contacts), 04-kingdom, 05-rendering]

# Actuals (#2632) — pairs with the plan's `estimate` (tokens: 35000, tasks: 2).
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 1904
  tasks: 2
  commits: 2
  plan_head_before: 3ecff6818be6617b25fa3748ed7d4e7350480720

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "contact bridge: one world.step(EventQueue) then drainCollisionEvents; only started transitions become events (D-08)"
    - "part attribution strictly from the collider-handle index — unknown handles are skipped, so a stale/reused handle cannot mis-tag a contact (T-02-13, D-04)"
    - "defensive same-unit guard despite Rapier's broad phase never pairing same-body colliders (research Pitfall 4, T-02-14)"
    - "contact events stay unordered (unitAId/partA, unitBId/partB) — attacker/defender attribution is deferred to the 02-06 damage layer"
    - "no contact normal is read in the drain callback (research Pitfall 2); normals belong to the damage layer via world.contactPair"

key-files:
  created:
    - tests/physics/events.test.ts
  modified:
    - src/physics/PhysicsWorld.ts

key-decisions:
  - "tick() drains the queue immediately after world.step and before the per-tick force/torque reset; the reset order is behaviorally irrelevant but keeps contact collection next to the step."
  - "contacts carries every started cross-unit pair (including body↔body); 02-06 filters damage-bearing pairs and dedups damages, not contacts."
  - "damages stays [] in this plan — the Δv + damage math pipeline is 02-06."

patterns-established:
  - "The collider-handle index is the single source of part identity for both registration and event emission (D-04); no per-unit collision-group bits are used for filtering."
  - "Contact events are assertion-friendly and unordered: tests compare sets of parts/unit ids rather than assuming A/B order."

requirements-completed: [PHYS-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
  - id: D1
    description: "tick() drains the EventQueue after the fixed step and converts each started, cross-unit collision into a part-tagged IContactEvent resolved from the collider-handle index; stopped transitions and unknown handles are ignored and damages remains empty"
    requirement: PHYS-02
    verification:
      - kind: other
        ref: "node presence check over PhysicsWorld.ts (drainCollisionEvents/started/IContactEvent/unitAId/partA/unitBId/partB) -> EVENTS_OK"
        status: pass
      - kind: other
        ref: "pnpm typecheck -> exit 0"
        status: pass
      - kind: integration
        ref: "pnpm test -- tests/physics/events.test.ts (1 file, 4 tests) green"
        status: pass
    human_judgment: false
  - id: D2
    description: "tests/physics/events.test.ts proves a scripted Weapon↔Body overlap emits an unordered part-tagged contact, every side carries a valid ColliderPart, repeated ticks never emit a same-unit self contact, and a lone compound unit emits no contacts"
    requirement: PHYS-02
    verification:
      - kind: unit
        ref: "tests/physics/events.test.ts#emits a part-tagged Weapon↔Body contact for a scripted overlap"
        status: pass
      - kind: unit
        ref: "tests/physics/events.test.ts#never emits a same-unit self contact across several ticks"
        status: pass
      - kind: unit
        ref: "tests/physics/events.test.ts#emits no contact for a lone unit (intra-unit colliders never pair)"
        status: pass
      - kind: unit
        ref: "tests/physics/events.test.ts#tags both sides of every contact with a valid ColliderPart"
        status: pass
      - kind: integration
        ref: "pnpm test (13 files, 105 tests) green; pnpm lint exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: 7min
completed: 2026-10-19
status: complete
---

# Phase 2 Plan 05: Contact → Typed-Event Bridge Summary

**`tick()` now drains Rapier's `EventQueue` and turns each `started` collision into an unordered, part-tagged `IContactEvent` resolved through the collider-handle index — with same-unit self-contacts made impossible and no contact normal read at this layer.**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-19T13:58:00Z
- **Completed:** 2026-10-19T14:05:32Z
- **Tasks:** 2
- **Files modified:** 2 (1 modified, 1 created: 188 insertions, 1 deletion)

## Accomplishments

- **`src/physics/PhysicsWorld.ts`** — `tick()` keeps the 02-04 fixed-step semantics (one `world.step(#eventQueue)`, no wall-clock) and now calls `#eventQueue.drainCollisionEvents((handle1, handle2, started) => …)` right after the step. It returns early on `!started` (D-08), skips a pair when either handle is missing from `#index` (stale/reused handle safety, T-02-13), skips a defensively-guarded same-unit pair (T-02-14 / research Pitfall 4), and otherwise pushes `{unitAId, partA, unitBId, partB}` preserving the drain's unordered A/B order. The callback never reads a normal (research Pitfall 2) — that belongs to the 02-06 damage layer via `world.contactPair`.
- **`tests/physics/events.test.ts`** — 4 integration tests after `await RAPIER.init()` in `beforeAll`, each `PhysicsWorld` disposed in `afterEach`: (1) a unit at x=0 with a longsword (weapon capsule spans x≈0.65–0.75) and a bare unit at x=1.0 (body circle spans x≈0.5–1.5) overlap at spawn, so the first `tick()` yields a `Weapon↔Body` contact whose two unit ids are the registered pair — asserted as sets, never assuming A/B order; (2) repeated ticks never produce `unitAId === unitBId`; (3) a lone compound unit (weapon + helmet + body) emits zero contacts; (4) every emitted `partA`/`partB` is an integer in `{Body, Weapon, Armor}`.
- The frozen `src/physics/types.ts` was not modified; `src/physics/damage.ts` was not touched. Damage stays `[]` for plan 02-06.

## Task Commits

Each task was committed atomically:

1. **Task 1: Drain started collisions into part-tagged contact events** - `8f5d7c2` (feat)
2. **Task 2: Add `tests/physics/events.test.ts` — scripted contacts, valid tags, no self events** - `7738cd0` (test)

**Plan metadata:** this docs commit (SUMMARY.md + STATE.md + ROADMAP.md + REQUIREMENTS.md)

## Files Created/Modified

- `src/physics/PhysicsWorld.ts` (modified, +24/−1) — `IContactEvent` type import, `drainCollisionEvents` bridge, started-only + index-resolution + same-unit guard; force/torque reset unchanged
- `tests/physics/events.test.ts` (new, 164 lines) — 4 tests; imports `RAPIER`, `PhysicsWorld`, `ColliderPart`, `DT`/`DEFAULT_GEOMETRY`, `WEAPON_DEFS`/`ARMOR_DEFS`, `mulberry32`; no `Unit` import (D-07)

## Decisions Made

- The drain runs immediately after `world.step` and before the per-tick force/torque reset; both are post-step and the order is behaviorally irrelevant, but this keeps contact collection adjacent to the step that produced it.
- `contacts` is deliberately complete: every started cross-unit pair is emitted, including body↔body bumps. The 02-06 layer filters damage-bearing pairs and dedups `damages` — not `contacts` (per plan 02-06's exclusivity guard).
- `damages` remains `[]`; no Δv snapshot, normal fetch, or damage math was pulled forward from 02-06.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Prettier formatting of the Set-equality assertion**
- **Found during:** Task 2 (`events.test.ts`) lint gate
- **Issue:** The first draft wrapped `expect(new Set([weaponBody.partA, weaponBody.partB])).toEqual(...)` in a line break layout that `eslint-plugin-prettier` rejected (1 prettier/prettier error).
- **Fix:** Re-flowed the assertion so the `expect(...)` call stays on one line and only the `toEqual(...)` argument wraps.
- **Files modified:** `tests/physics/events.test.ts`
- **Verification:** `pnpm lint` exits 0; `pnpm test -- tests/physics/events.test.ts` (4 tests) green.
- **Committed in:** `7738cd0` (Task 2 commit)

---

**Total deviations:** 1 auto-fixed (1 blocking — formatting only, no behavior change)
**Impact on plan:** None on design or scope; the plan executed as written.

## Issues Encountered

None functional. Gates green: `pnpm test -- tests/physics/events.test.ts` (1 file / 4 tests), `pnpm test` (13 files / 105 tests), `pnpm typecheck` (exit 0), `pnpm lint` (exit 0), Task-1 presence check prints `EVENTS_OK`.
Environment note: `master` remains the configured main-tree commit target (`branching_strategy: none`, `use_worktrees: false`); commits used normal hooks (no `--no-verify`).

## Known Stubs

None introduced. `damages: []` in the returned `IPhysicsTickResult` is the documented plan boundary (damage pipeline is 02-06), and `#preVelocities` remains the 02-06 placeholder noted in the 02-04 summary.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- **02-06 (damage pipeline)** can: snapshot pre-step velocities into `#preVelocities`, fetch normals with `world.contactPair(...)` for each emitted contact, reuse `src/physics/damage.ts`, emit `IDamageEvent`s, and add the per-`(attackerId, defenderId)` per-tick exclusivity guard. It must store the injected RNG (`_rng` → `#rng`) at that point.
- The D-07 boundary is unchanged: physics still holds ids/numbers only, and the contact layer exposes no attacker/defender attribution.
- No blockers.

## Threat Flags

None - no network/auth/file surface added. The plan's threat mitigations are implemented: T-02-13 (unknown handles skipped; parts only from the index), T-02-14 (defensive same-unit guard, asserted by test), T-02-15 (`EventQueue(true)` auto-drains before each step), T-02-SC (no dependency added).

---

*Phase: 02-physics-simulation*
*Completed: 2026-10-19*

## Self-Check: PASSED

All declared files exist (`src/physics/PhysicsWorld.ts`, `tests/physics/events.test.ts`, `02-05-SUMMARY.md`); both task commits (`8f5d7c2`, `7738cd0`) are present in git history. `pnpm test -- tests/physics/events.test.ts` (4 tests), `pnpm test` (13 files / 105 tests), `pnpm typecheck` (exit 0) and `pnpm lint` (exit 0) all pass; the Task-1 presence check prints `EVENTS_OK`.
