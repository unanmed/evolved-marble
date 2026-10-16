---
phase: 02-physics-composite-units
plan: 05
subsystem: physics
tags: [rapier2d, contact-events, pre-step-dv, part-tagging, null-guard, enter-only, snapshot-v3, mutator-census, determinism, vitest, tdd]

# Dependency graph
requires:
  - phase: 02-physics-composite-units
    provides: "verified tracer: PhysicsWorld (pre-step velocity capture) + CompositeFactory + ContactBridge (part map, null-safe lookup, pre-step Δv) (02-02)"
  - phase: 02-physics-composite-units
    provides: "Rapier wired into BattleSim.step() (applyCommands → physics.step → bridge.drain → mirror → safety belt) + canonical snapshot v3 + IPhysicsWorld-owned part map (02-03)"
  - phase: 02-physics-composite-units
    provides: "full composite factory: data-driven arrays, unit-level InteractionGroups, ordered despawn, CCD-enabled weapons, sustained swing (02-04)"
  - phase: 01-foundation-deterministic-sim-core
    provides: "headless fixed-step sim core, canonical snapshot/fingerprint primitives, Node-only Vitest determinism gate"
provides:
  - "tests/sim/contact.test.ts: the D-28..D-31 contact contract proven — pre-step Δv (head-on 8 m/s → ≈8, not the post-step 0), part/subtype accuracy (weapon-vs-armor, weapon-vs-body), the untagged-handle null guard (no event, no throw), enter-only semantics with no implicit dedup, and a REAL BattleSim → EventLog end-to-end weapon-vs-armor contact in the same tick's drain"
  - "tests/sim/snapshot.test.ts: the mutator census now covers xform.rotation and xform.angularVelocity; a ≥2-composite-unit round-trip proves fingerprint identity + exact part-map restoration (handles are f64); a physics-path 'two restores re-step identically' case"
  - "Δv tolerance for the head-on-8 assertion recorded: DV_TOLERANCE = 0.2 m/s (Test 1 asserts |dv − 8| < 0.2)"
  - "part-map serialization layout confirmed: partMapCount:u32 then 14 B/entry (colliderHandle:f64 + entityId:i32 + part:u8 + armorSubtype:u8, 255 = null)"
affects: [phase-3-content-tables, phase-4-unit-ai, phase-5-render]

# Actuals (#2632) — pairs with the plan's `estimate` (48000 tokens / 2 tasks / confidence low).
actuals:
  tokens: 3865
  tasks: 2
  commits: 2
plan_head_before: 26e3196a1760f2a5810a4b4e4804a999b01c901c

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Pre-step Δv proof: assert the MAGNITUDE (|dv − 2·sideSpeed| < tolerance), never dv > 0 — the post-step manifold would pass a > 0 check while reporting ≈0"
    - "Part-name assertion via a controlled two-collider rig (create the low-handle collider first so Rapier's (h1, h2) event order yields partA/partB deterministically)"
    - "Null-guard test uses a collider WITH COLLISION_EVENTS but WITHOUT a part registration, so the event actually fires and the bridge's lookup→null early-return is exercised (not masked by a missing ActiveEvents)"
    - "Real-BattleSim contact test: spawn via the public API, then place bodies/weapon directly (precedent: commands.test.ts safety-belt test) and drain events each tick — a drain-after-clear/wrong-tick regression drops the event"
    - "Snapshot census extension: one it.each case per future-affecting field, each perturbed by > 1/QUANT_GRID and asserted to move the fingerprint"

key-files:
  created:
    - tests/sim/contact.test.ts
  modified:
    - tests/sim/snapshot.test.ts

key-decisions:
  - "Task 1 required NO production change: the tracer (02-02) already implemented pre-step Δv + part tagging + null guard + enter-only, and 02-03 wired bridge.drain into BattleSim.step(); the verification tests passed on first run (D-36 restraint — no gratuitous edit to contact.ts/battle-sim.ts just to produce a GREEN commit)."
  - "Test 6 arranges the two spawned units directly (translate body+weapon, orient A's weapon horizontally): BattleSim does not wire a weapon-swing drive in Phase 2, so a weapon-vs-armor enter through the real sim needs the weapon to protrude; the direct placement is scenario setup (same technique as commands.test.ts's safety-belt test), while the assertion itself exercises only the public step()→events.drain() path."
  - "Δv tolerance for the head-on-8 test = 0.2 m/s; measured dv ≈ 8.0 (Test 1) and dv ≈ 0.593 for a 0.6 m/s real-BattleSim approach (Test 6, within tolerance)."

patterns-established:
  - "Untagged-handle guard coverage: a ghost collider with ActiveEvents but no part registration is required to exercise the lookup→null branch"

requirements-completed: [PHYS-02, PHYS-03]

# Coverage metadata (#1602)
coverage:
  - id: D1
    description: "A head-on 8 m/s approach yields dv ≈ 8 in the emitted IContactEvent, computed from PRE-STEP velocities (post-step manifold would read 0)."
    requirement: "PHYS-02"
    verification:
      - kind: unit
        ref: "tests/sim/contact.test.ts#Test 1: a head-on 8 m/s approach yields dv ≈ 8 from PRE-STEP velocities (not the post-step 0)"
        status: pass
    human_judgment: false
  - id: D2
    description: "A weapon-vs-armor contact names partA=Weapon / partB=Armor with the correct armorB subtype; a weapon-vs-body contact names partB=Body with armorB === null."
    requirement: "PHYS-02"
    verification:
      - kind: unit
        ref: "tests/sim/contact.test.ts#Test 2: weapon-vs-armor names partA=Weapon, partB=Armor with the correct armorB subtype"
        status: pass
      - kind: unit
        ref: "tests/sim/contact.test.ts#Test 3: weapon-vs-body names partB=Body and armorB === null"
        status: pass
    human_judgment: false
  - id: D3
    description: "An unregistered/untagged collider handle produces no contact event and never throws (the lookup → null guard, T-02-01)."
    requirement: "PHYS-02"
    verification:
      - kind: unit
        ref: "tests/sim/contact.test.ts#Test 4: an unregistered (untagged) collider emits no event and never throws (T-02-01)"
        status: pass
    human_judgment: false
  - id: D4
    description: "Only collision-enter transitions emit contact events; exit transitions emit nothing and duplicate suppression is absent (two enters of the same pair both emit — D-29/D-31)."
    requirement: "PHYS-02"
    verification:
      - kind: unit
        ref: "tests/sim/contact.test.ts#Test 5: exit transitions emit nothing; two enters of the same pair both emit (D-31, no dedup)"
        status: pass
    human_judgment: false
  - id: D5
    description: "A real BattleSim (two composite units) driven into a weapon-vs-armor enter surfaces a SimEventKind.Contact in state.events.drain() in the same tick — the BattleSim.step() → EventLog link end-to-end (not the standalone bridge)."
    requirement: "PHYS-02"
    verification:
      - kind: integration
        ref: "tests/sim/contact.test.ts#Test 6: a real BattleSim surfaces a Weapon/Armor contact in events.drain() in the enter tick"
        status: pass
      - kind: integration
        ref: "tests/sim/commands.test.ts#snapshot v3 round-trips with physics present (D-34)"
        status: pass
    human_judgment: false
  - id: D6
    description: "The snapshot mutator census covers xform.rotation and xform.angularVelocity: perturbing either by more than one 1/256 grid changes the fingerprint."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#perturbing xform.rotation moves the fingerprint"
        status: pass
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#perturbing xform.angularVelocity moves the fingerprint"
        status: pass
    human_judgment: false
  - id: D7
    description: "colliderHandle → (entityId, part, armorSubtype) survives a snapshot round-trip with ≥2 composite units: the round-trip is fingerprint-identical and every original handle resolves to the same ref (handles serialized as f64)."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#a ≥2-composite-unit round-trip is fingerprint-identical and restores the part map exactly"
        status: pass
    human_judgment: false
  - id: D8
    description: "Two restores of the same composite physics snapshot re-step identically (deterministic restart point)."
    requirement: "PHYS-03"
    verification:
      - kind: unit
        ref: "tests/sim/snapshot.test.ts#two restores of the same composite snapshot re-step identically (physics path)"
        status: pass
    human_judgment: false

# Metrics
duration: 14 min
completed: 2026-10-16
status: complete
---

# Phase 2 Plan 05: Part-Tagged Contact Contract Hardening + Snapshot v3 Verification Surface Summary

**The D-28..D-31 contact contract is now provably green — pre-step Δv (a head-on 8 m/s approach yields ≈8, not the post-step 0), correct weapon/armor/body part tagging with armor subtypes, a null-guarded untagged handle, enter-only semantics with no dedup, and a *real* `BattleSim` → `EventLog` weapon-vs-armor contact surfaced in the same tick's `drain()` — while the snapshot census now proves `xform.rotation`/`xform.angularVelocity` and the whole collider→part map survive a composite round-trip.**

## Performance

- **Duration:** ~14 min
- **Started:** 2026-10-16T16:24:00Z (approx)
- **Completed:** 2026-10-16T16:31:00Z (approx)
- **Tasks:** 2 (two `type="auto" tdd="true"` tasks)
- **Files modified:** 2 (1 created, 1 modified)

## Accomplishments

- **Part-tagged contact semantics locked down** (`tests/sim/contact.test.ts`, 6 tests):
  - **Test 1** — a head-on 8 m/s approach (two balls at ±4 m/s) yields `dv ≈ 8` (asserted `|dv − 8| < 0.2`), proving Δv comes from the **pre-step** velocity map (the post-step manifold would report ≈0 — a `dv > 0` assertion alone would not catch that regression).
  - **Test 2/3** — a weapon-vs-armor contact names `partA = Weapon`, `partB = Armor` with the correct `armorB` subtype (`Shield`); a weapon-vs-body contact names `partB = Body` with `armorB === null`.
  - **Test 4** — an **untagged** collider (with `COLLISION_EVENTS` but no part registration) emits no event and never throws, exercising the `lookup → null` early-return directly (T-02-01).
  - **Test 5** — exit transitions (`started === false`) emit nothing; re-approaching the same pair emits a second enter (no implicit dedup — D-31).
  - **Test 6 (phase-goal key link)** — a **real `BattleSim`** with two composite units arranged into a weapon-vs-armor enter surfaces a `SimEventKind.Contact` in `sim.state.events.drain()` **in the enter tick**, with `partA = Weapon`, `partB = Armor`, `armorB = Helmet`, and `dv ≈ 0.593` for a 0.6 m/s approach — proving `BattleSim.step()` drains the Rapier queue into the `EventLog` end-to-end (a drain-after-clear / wrong-tick wiring would drop it).
- **Snapshot v3 verification surface completed** (`tests/sim/snapshot.test.ts`):
  - The mutator census gains `xform.rotation` and `xform.angularVelocity` cases (each perturbation beyond one `1/QUANT_GRID` moves the fingerprint).
  - A ≥2-composite-unit round-trip proves `fingerprint(restore(snapshot)) === fingerprint(snapshot)` **and** that every original collider handle still resolves to the same `(entityId, part, armorSubtype)` after restore (handles are packed f64, never int32).
  - A physics-path "two restores of the same composite snapshot re-step identically" case.

## Recorded constants (plan `<output>`)

- **Δv tolerance for the head-on-8 test:** `DV_TOLERANCE = 0.2` m/s (Test 1 asserts `|dv − 2·HEAD_ON_SIDE_SPEED| < 0.2`; measured `dv ≈ 8.0`). Test 6 uses the same tolerance against a 0.6 m/s real-`BattleSim` approach (measured `dv ≈ 0.593`).
- **Final part-map serialization layout** (unchanged, confirmed): after the entity section —
  `partMapCount: u32` then **14 bytes/entry**: `colliderHandle: f64` + `entityId: i32` + `part: u8` + `armorSubtype: u8` (`255` = `null`). Handles survive `World.restoreSnapshot()`, so the map is rebuilt from the serialized f64 handles (never `userData`).

## Task Commits

Each task was committed atomically on `master` (pre-commit hook = `lint` + `vitest run tests/determinism` ran and passed on both):

1. **Task 1: Part-tagged contact semantics (pre-step Δv, part/subtype, null guard, enter-only, real BattleSim)** — `34ddedf` (test)
2. **Task 2: Snapshot v3 completeness (rotation/angularVelocity census + composite part-map round-trip)** — `52a350f` (test)

**Plan metadata:** `(this commit)` (docs: complete plan)

## Files Created/Modified

- `tests/sim/contact.test.ts` (created) — 6 tests: head-on-8 pre-step Δv, weapon-vs-armor parts + subtype, weapon-vs-body parts, untagged-handle null guard, exit-only/no-dedup, and the real-`BattleSim` → `EventLog` end-to-end contact (plus a minimal two-collider rig helper).
- `tests/sim/snapshot.test.ts` (modified) — +`xform.rotation`/`xform.angularVelocity` census cases; +a `composite-unit snapshot v3 completeness` describe with the ≥2-unit fingerprint+part-map round-trip and the physics-path two-restores case.

**No source file changed.** `src/sim/world/contact.ts` and `src/sim/battle-sim.ts` were read and verified (pre-step Δv via `physics.preStepVelocity`, the `!started` return, the `!refA || !refB` early return, the part/subtype fields, and `bridge.drain(tick)` in `BattleSim.step()` all present) but **were not modified** — see TDD Gate Compliance below.

## Decisions Made

- **No production change was warranted (D-36).** The tracer (02-02) already shipped the pre-step Δv computation, part/subtype tagging, the null guard, and enter-only semantics; 02-03 already wired `bridge.drain(tick)` into `BattleSim.step()` emitting into `state.events`. The verification tests therefore passed on their first run. Editing `contact.ts`/`battle-sim.ts` merely to manufacture a GREEN commit would have been gratuitous and risked regressing the frozen tracer seams.
- **Test 6 scenario arrangement.** `BattleSim` does **not** wire a weapon-swing drive in Phase 2, and the sim's `spawnSpec` always places the armor on the body's `+x` side, so the test arranges the two spawned units directly (translate body + weapon, orient A's weapon horizontally from the right so its protruding weapon strikes B's armor before B's body). This is scenario setup only — the assertion still exercises purely the public `sim.spawn()` / `sim.step()` / `state.events.drain()` path (the same direct-placement technique is used by the existing `commands.test.ts` D-33 safety-belt test).

## Deviations from Plan

### Auto-fixed Issues

None. No bugs, missing critical functionality, or blockers were encountered on the contact/snapshot paths — the plan's two tasks were verification surfaces over already-committed behavior, and both were satisfied by writing the tests.

### TDD Gate Compliance

Both tasks are `tdd="true"`, but each produced a **single `test(...)` commit with no preceding failing RED**:

- **Task 1** — `34ddedf` (`test(02-05):`). The named target tests **passed on first run**. Per `references/tdd.md` "Unexpected GREEN in RED phase → investigate": investigation shows the target behavior was already implemented and committed by the tracer (02-02: `contact.ts` pre-step Δv + part map + null guard) and the sim wiring (02-03: `bridge.drain` in `step()` emitting into `state.events`). This is **not** an INVALID_RED (no failing test exists because the feature pre-existed, not because the test failed to load). No GREEN source change was required.
- **Task 2** — `52a350f` (`test(02-05):`). Same situation: snapshot v3 (rotation/angularVelocity + Rapier bytes + part map) was implemented in 02-03, so the extended census and the composite round-trip passed on first run.

`workflow.tdd_mode` is `false` in `.planning/config.json` (from `init.execute-phase`), so the formal `check tdd-red-evidence` gate was not enforced; this is recorded as advisory. The plan is explicitly a *hardening/verification* plan over a shipped subsystem, so a green-first test surface is the expected and correct outcome.

---

**Total deviations:** 0 auto-fixed (0 bugs / 0 missing-critical / 0 blockers).
**Impact on plan:** None on correctness. The plan's declared `files_modified` listed `src/sim/world/contact.ts` and `src/sim/battle-sim.ts`; both were verified present/complete and left unchanged (the tracer over-delivered). Only the two test files were touched.

## Issues Encountered

None. `pnpm run typecheck` (both tsconfigs), `pnpm run lint`, `pnpm gate` (14 passed), and `pnpm test` (14 files / **91 tests**) are all green. The pre-commit hook (`lint` + determinism gate) passed on both commits.

**Observation (out of scope, not a blocker):** `BattleSim.step()` does not call `CompositeFactory.driveSwing`, so in the real sim weapons do not yet swing (only `tests/helpers/run-physics.ts` drives the swing). This was not in this plan's scope and did not block Test 6 (which orients the weapon directly). Flagged for a later plan / Phase 4 AI wiring.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- PHYS-02's contact contract and PHYS-03's snapshot completeness are now provably green; Phase 3's damage pipeline can consume the `IContactEvent` (`partA`/`partB`/`armorA`/`armorB`/`dv`) and the restored part map with confidence.
- **Deferred (D-31):** per-swing dedup/cooldown is Phase 3's battle system (Phase 2 emits raw, stateless enter events — asserted by Test 5).
- **Deferred (observation):** wiring a weapon-swing drive into `BattleSim.step()` (D-25's "no AI needed" live swing) is not yet integrated into the real sim; candidates are Phase 4 unit-AI wiring or a dedicated follow-up.

## Self-Check: PASSED

- Created file verified on disk: `tests/sim/contact.test.ts` — FOUND.
- Modified file verified on disk: `tests/sim/snapshot.test.ts` — FOUND.
- `git diff --name-only plan_head_before..HEAD` shows exactly the two test files (no source regression).
- Commits verified: `34ddedf` (Task 1), `52a350f` (Task 2). `commits=2` measured from `plan_head_before=26e3196…`.
- `pnpm run typecheck` (both tsconfigs) exit 0; `pnpm run lint` exit 0; `pnpm gate` 14 passed; `pnpm test` 14 files / 91 tests passed.
- Acceptance greps: `contact.ts` computes Δv via `physics.preStepVelocity` (no post-step `contactPair` read used for Δv); `battle-sim.ts` calls `this.bridge.drain(tick)` in `step()`; `snapshot.ts` part-map entry = `f64(handle)+i32(entityId)+u8(part)+u8(armorSubtype)`.

---
*Phase: 02-physics-composite-units*
*Completed: 2026-10-16*
