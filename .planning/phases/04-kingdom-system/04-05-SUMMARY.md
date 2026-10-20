---
phase: 04-kingdom-system
plan: 05
subsystem: kingdom-city-battles-commander-scenario
tags: [typescript, kingdom, city-battle, settlement, garrison, commander, scenario-validation, rapier2d, tdd]

# Dependency graph
requires:
  - phase: 04-kingdom-system
    plan: 02
    provides: BattleSystem shared pair gate, merge rules, KingdomWorld orchestrator, game clock, Army/City models
  - phase: 04-kingdom-system
    plan: 03
    provides: IControlSystem.setUnitAI ownership and the additive Unit/Physics seams
  - phase: 04-kingdom-system
    plan: 04
    provides: Garrison order linkage, training/vision/terrain, city models and the reduced vision surface
  - phase: 03-control-system
    provides: ControlSystem registration/team mapping and the AI instance seam
  - phase: 02-physics-simulation
    provides: persistent Rapier unit bodies and per-substep state readings
provides:
  - City battles that require a real garrison, carry cityId, suppress the army-pair trigger and survive merges
  - Settlement that transfers ownership through one helper, partitions survivors into a World-allocated garrison army and regroups the loser
  - PlaceholderCommander through the replaceable ICommander seam with explicit order fulfilment
  - Production IKingdomConfig defaults (level weight, 25 %-capped garrison selector, commander factory)
  - validateScenario gating construction before any physics/control state exists
affects: [05-rendering, 06-recording, 07-ai-commander, 08-statistics]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 30118
  tasks: 3
  commits: 3
plan_head_before: 777a3963a4a81012d4476c01ebf2fe05f73ff0e5

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Two battle kinds, one gate: city triggering runs before army triggering and reuses createBattle's lock/active guard"
    - "Garrison suppression: an army whose garrisoned city belongs to the other side yields the pair contact to the city trigger"
    - "Settlement as a partition: selected survivors move into a new World-allocated army; every other survivor stays put, so rosters conserve units exactly once"
    - "Single ownership-transfer helper: clears the outgoing garrison link, updates both faction city lists, never calls updateTeam"
    - "Explicit order fulfilment: MoveTo clears on arrival, Hold clears at the next outer tick, a satisfied Garrison keeps its order and link"
    - "Frozen-selector identity bridge: a WeakMap records IUnit -> unitId at registration so the default GarrisonSelector can name candidates"
    - "Battle participant ledger: units that joined and later exited are still remembered for loser regroup"
    - "Validate-before-construct: validateScenario is the constructor's first statement"

key-files:
  created:
    - src/kingdom/Commander.ts
    - src/kingdom/strategies.ts
    - tests/kingdom/commander.test.ts
    - tests/kingdom/scenario.test.ts
  modified:
    - src/kingdom/BattleSystem.ts
    - src/kingdom/KingdomWorld.ts
    - src/kingdom/scenario.ts
    - tests/kingdom/harness.ts
    - tests/kingdom/city.test.ts
    - tests/kingdom/vision.test.ts

key-decisions:
  - "City triggering runs before army triggering and skips empty-roster armies; a pair involving a garrison of an enemy city is suppressed so a defended city yields exactly one City battle carrying its cityId"
  - "Settlement centralises ownership transfer in one helper that clears the defeated garrison's link, updates both faction city lists and never calls updateTeam or changes a unit's team/faction"
  - "The garrison is a brand-new World-allocated army (monotonic id above every scenario id), placed at the city point with a retained Garrison order; the winning field army's Garrison order for that city is cleared"
  - "The loser is identified from every unit that ever joined the battle (not only current members), so units that exited before the end still regroup; its centre averages only living roster units"
  - "The frozen GarrisonSelector gives IUnit candidates but expects ids, so strategies.ts owns a WeakMap identity registry populated by the World at registration; the selector only emits registered candidate ids and the World still sanitises"
  - "Commanders run once per outer tick after expiry, read only the reduced vision context, have every order revalidated by issueOrder plus a null-order/roster check, and are isolated by try/catch at both factory and decide time"
  - "When the defence holds, settlement performs the shared cleanup only: no transfer, no new garrison, existing links preserved"

patterns-established:
  - "A defended city never co-triggers an army battle: cityId survives any overlap merge"
  - "Roster conservation assertion: sum of every army roster equals the number of alive registered units, with no duplicates"
  - "Scripted commanders in the real-Rapier harness pin cadence, second-order-after-arrival and Hold expiry"
  - "Table-driven scenario rejection cases clone one valid table and apply a single mutation per case"

requirements-completed: [KING-05, KING-06, KING-07, KING-08]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "City battles trigger only against a non-empty garrison, produce exactly one City battle carrying cityId, suppress the garrison army pair, survive an army-battle overlap and stay locked until 80 m separation"
    requirement: "KING-07"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts#triggers exactly one City battle against a real garrison and settles the capture"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#keeps the City battle when it overlaps an army battle"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#does not retrigger the army-city pair until the centres separate beyond 80 m"
        status: pass
    human_judgment: false
  - id: D2
    description: "Capture transfers ownership and both faction city lists, preserves every unit's team/faction, partitions survivors into a new garrison army plus their original armies, clears the winning field order and keeps the link one-to-one and symmetric"
    requirement: "KING-07"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts#triggers exactly one City battle against a real garrison and settles the capture (roster totals, team ids, re-arrival refusal)"
        status: pass
    human_judgment: false
  - id: D3
    description: "Garrison selection is sanitised (unknown ids, duplicates, non-finite values dropped; cap enforced) and a throwing or empty selection still captures without creating a garrison army"
    requirement: "KING-07"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts#sanitises unknown ids, duplicates and non-finite values from the selector"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#caps the garrison at the city limit"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#treats a throwing selector as an empty selection and clears the field order"
        status: pass
    human_judgment: false
  - id: D4
    description: "A defeated garrison loses its city link, regroups with a living-roster centre, becomes Reorganizing and retargets the nearest owned city or a deterministic golden-angle direction; undefended enemy cities fall on arrival without any battle"
    requirement: "KING-07"
    verification:
      - kind: integration
        ref: "tests/kingdom/city.test.ts#regroups a defeated garrison toward its nearest remaining city"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#regroups toward a deterministic direction when the loser owns no city"
        status: pass
      - kind: integration
        ref: "tests/kingdom/city.test.ts#starts no battle for an undefended city and captures it on Garrison arrival"
        status: pass
    human_judgment: false
  - id: D5
    description: "PlaceholderCommander is deterministic, context-only, emits only MoveTo/Garrison/Hold without afterMinutes, skips busy/empty armies; the World runs it once per outer tick, applies a second order after fulfilment, keeps garrisons satisfied and isolates failures"
    requirement: "KING-06"
    verification:
      - kind: unit
        ref: "tests/kingdom/commander.test.ts#PlaceholderCommander — deterministic, context-only orders (4 cases)"
        status: pass
      - kind: integration
        ref: "tests/kingdom/commander.test.ts#commander wiring — cadence, fulfilment and isolation (6 cases)"
        status: pass
      - kind: unit
        ref: "tests/kingdom/commander.test.ts#createDefaultKingdomConfig — production strategies (2 cases)"
        status: pass
    human_judgment: false
  - id: D6
    description: "validateScenario accepts both built-in tables, rejects every listed invalid class, runs before any physics/control state exists, and faction/army/city ownership plus registered team ids match the scenario"
    requirement: "KING-08"
    verification:
      - kind: unit
        ref: "tests/kingdom/scenario.test.ts#accepts the built-in scenarios and a complete custom table"
        status: pass
      - kind: unit
        ref: "tests/kingdom/scenario.test.ts#rejects every invalid input class (31 cases)"
        status: pass
      - kind: integration
        ref: "tests/kingdom/scenario.test.ts#rejects before any state exists in physics or control"
        status: pass
      - kind: integration
        ref: "tests/kingdom/scenario.test.ts#maps every faction, army, city and spawned unit back to the scenario table"
        status: pass
    human_judgment: false

# Metrics
duration: ~52min
completed: 2026-10-20
status: complete
---

# Phase 04 Plan 05: City battles, placeholder commander and scenario validation Summary

**Defended cities now open exactly one city battle that survives merges, settle into an ownership transfer with a World-allocated garrison army and a regrouping loser while every unit keeps its team identity, both factions act through a deterministic per-tick `PlaceholderCommander`, and `validateScenario` stops invalid tables before they can touch physics or control.**

## Performance

- **Duration:** ~52 min
- **Started:** 2026-10-20T14:54:27Z
- **Completed:** 2026-10-20T15:46:44Z
- **Tasks:** 3
- **Files modified:** 10 (4 created, 6 modified)

## Accomplishments

- `BattleSystem` added a city trigger pass before army triggering, reusing the shared pair gate and key `army:<id>:city:<id>`; it requires a city-owned-by-another-faction within 80 m **and** a garrison army with a non-empty roster, emits `BattleTriggerKind.City` with `cityId`, suppresses any army pair involving a garrison of an enemy city, and releases city locks only past 80 m separation. Empty-roster armies no longer trigger anything.
- `KingdomWorld` settlement now sweeps every stale engagement, recomputes survivor centres, then for city battles transfers ownership through one helper (clearing the defeated garrison link, updating both faction city lists, never calling `updateTeam`), clears the winning field army's `Garrison` order, partitions the sanitised selection into a brand-new World-allocated garrison army with a retained `Garrison` order, and regroups the loser toward its nearest owned city or a deterministic golden-angle direction. The defence-held case performs the shared cleanup only.
- Undefended enemy cities are captured on `Garrison` arrival with no battle, no selector and no roster split; a later arrival at an already-garrisoned captured city is refused, leaving the new garrison's link untouched.
- `PlaceholderCommander` emits only `MoveTo`/`Garrison`/`Hold` from the reduced `ICommanderContext`, skips busy or empty-roster armies, breaks ties by id and never sets `afterMinutes`. The World calls it once per outer tick after clearing fulfilled orders, rebuilds the context from the vision briefs, revalidates every order, and isolates both a throwing factory and a throwing `decide`.
- `strategies.ts` supplies the production `IKingdomConfig`: level weight, a 25 % selector (at least one, capped by the city limit) and the placeholder commander factory. `tests/kingdom/harness.ts` now defaults to it with an override hook.
- `validateScenario` checks dimensions, faction/army/city tables, terrain geometry, enum members, unit/army ceilings and spawn-point containment, throwing `validateScenario: …` on the first violation. `KingdomWorld` calls it before creating any model, obstacle or unit.
- Tests: `city.test.ts` grew from 9 to 19 cases with real-Rapier city battles, settlement, sanitisation, regroup, merge and lock behaviour; `commander.test.ts` adds 12 cases; `scenario.test.ts` adds 4 cases (31 rejection mutations).

## Task Commits

Each task was committed atomically:

| Task | Name | Commit |
| ---- | ---- | ------ |
| 1 | City battles, settlement, garrison allocation and loser regroup | `1d0c92b` (feat) |
| 2 | PlaceholderCommander, production strategies and per-tick wiring | `fc974c3` (feat) |
| 3 | Pre-construction scenario validation and ownership proof | `13e8541` (feat) |

**Plan metadata:** the docs commit created after this SUMMARY (recorded in the orchestrator's log).

## Files Created/Modified

- `src/kingdom/BattleSystem.ts` — city trigger pass, garrison-aware army-pair suppression, city pair locks in the separation pass, inert empty-roster armies
- `src/kingdom/KingdomWorld.ts` — settlement/transfer helper, World-allocated garrison army, selector sanitisation, participant ledger, loser regroup, empty-city capture, fulfilled-order expiry, per-tick commander context/application, `validateScenario` first statement, unit identity registration
- `src/kingdom/Commander.ts` — `PlaceholderCommander implements ICommander`
- `src/kingdom/strategies.ts` — `defaultUnitWeight`, `defaultGarrisonSelector`, `createDefaultKingdomConfig`, `rememberUnitIdentity`
- `src/kingdom/scenario.ts` — `validateScenario` plus JSDoc'd helpers, built-in tables unchanged
- `tests/kingdom/harness.ts` — production config by default, commander factory override
- `tests/kingdom/city.test.ts` — 10 new city-battle/settlement cases and their helpers
- `tests/kingdom/commander.test.ts` — hand-built context cases plus real-Rapier cadence/fulfilment/isolation
- `tests/kingdom/scenario.test.ts` — table-driven rejection cases, pre-state validation and ownership/team mapping
- `tests/kingdom/vision.test.ts` — centre-only enemy army fixture now has a positive roster

## Decisions Made

- **One trigger owner per contact.** City triggering precedes army triggering; a pair where either side garrisons a city owned by the other side is suppressed. That makes "defended city = exactly one City battle carrying `cityId`" structural rather than probabilistic, and the existing merge rule keeps the City battle on overlap.
- **Settlement is a partition, never a roster rewrite.** Selected survivors join a new World-allocated army (id above every scenario id); all others stay in their original army. The test asserts roster totals equal alive units and that no id appears twice, which catches both orphaning and double-counting.
- **The link is one-to-one by construction.** The transfer helper clears the outgoing garrison link, the new garrison army owns both sides of the link and keeps a satisfied `Garrison` order, and the winning field army's order for that city is cleared so it cannot re-garrison or steal the link later.
- **Unit identity survives capture.** No `updateTeam`, no faction field on `IUnit`, no roster reassignment beyond the explicit garrison partition. Team ids are asserted unchanged on both the capture and defence-held paths.
- **Loser regroup uses a participant ledger.** `BattleSystem` removes a unit from membership as soon as it leaves the area, so the World records every unit that ever joined each active battle. Loser identification therefore includes exited survivors; the centre averages living roster units only (dead members remain in the roster until the later prune).
- **Frozen selector bridged without widening the contract.** `GarrisonSelector(city, candidates: readonly IUnit[])` returns ids but `IUnit` exposes no id. `strategies.rememberUnitIdentity(unit, unitId)` records the mapping at spawn; the default selector emits only those ids, and the World still drops unknown, duplicate, non-finite or over-cap values. A custom selector remains free to close over ids it knows.
- **Commanders are fallible guests.** Construction and `decide` are both isolated; every order is revalidated (including the no-unfulfilled-order and non-empty-roster rules) before `issueOrder`. A commander can therefore never halt a tick or hijack an in-flight order.
- **Validation order favours safety.** Terrain is validated before spawn containment so the strict-inside test can never use NaN half extents; dimensions and factions come first. Nothing is coerced or clamped.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Empty-roster armies could open battles**
- **Found during:** Task 1 (settlement re-arrival case)
- **Issue:** after a city capture, the defeated garrison army retained its centre and zero units. Because triggering did not check rosters, it started a ghost City battle against its former city (and an army battle with the winner), pinning the world at 1× and preventing the winning field army from marching back.
- **Fix:** both trigger passes now skip armies with an empty roster, matching the plan's "empty-roster armies are inert" requirement.
- **Files modified:** `src/kingdom/BattleSystem.ts`
- **Verification:** the re-arrival case now advances at peace rate and asserts the field army reaches the city without stealing the link.
- **Committed in:** `1d0c92b`

**2. [Rule 1 - Test calibration] Loser centre must average living units only**
- **Found during:** Task 1 (regroup cases)
- **Issue:** `takeDamage` kills units synchronously, but the World prunes rosters after `control.tick`; at settlement the dead members were still in the roster, so the regroup centre was pulled toward corpses (632 instead of 900).
- **Fix:** regroup filters the roster to living units before averaging and treats a living-empty roster as inert.
- **Files modified:** `src/kingdom/KingdomWorld.ts`
- **Verification:** both regroup cases assert the exact centre and target.
- **Committed in:** `1d0c92b`

**3. [Rule 3 - Test adjustment] Vision's zero-unit enemy army is now invalid**
- **Found during:** Task 3 (full kingdom suite)
- **Issue:** `validateScenario` must reject non-positive unit counts, but `vision.test.ts` used a zero-unit enemy army as a centre-only visibility fixture.
- **Fix:** the fixture's enemy army now carries one unit (default and explicit cases), which preserves centre-based visibility semantics; the unit is placed just outside the 100 m radius in the affected cases.
- **Files modified:** `tests/kingdom/vision.test.ts`
- **Verification:** all 8 vision cases pass unchanged in intent.
- **Committed in:** `13e8541`

### Contract-gap resolution (planned as `[ASSUMED]`)

**4. [KING-07 seam] GarrisonSelector cannot name IUnit candidates**
- **Found during:** Task 2 (`defaultGarrisonSelector`)
- **Issue:** the frozen selector receives `IUnit[]` and returns ids, but `IUnit` exposes no id and cannot be extended. 04-02 deferred this gap to this plan.
- **Resolution:** `strategies.ts` keeps a module-level `WeakMap<IUnit, number>`, populated by the World at spawn/registration through `rememberUnitIdentity`. The default selector returns only registered candidate ids in candidate order; the World's sanitisation remains the authority and drops anything not in the current candidate set. No frozen type changed and no cast/`any` was introduced.
- **Files modified:** `src/kingdom/strategies.ts`, `src/kingdom/KingdomWorld.ts`
- **Verification:** the default-selector unit cases and every World-level sanitisation case pass.
- **Committed in:** `fc974c3`

### Interpretations

- **Loser regroup covers exited survivors.** The plan's predicate says "surviving member positions", but a losing unit cannot remain a battle member when the battle ends (the end rule is one faction among living members). The World therefore regroups all living units of participating losing armies, using their current positions. This is what makes the defeat-and-retreat outcome observable.
- **Defence-held settlement performs only the shared cleanup**, per the plan's explicit "no transfer and no garrison allocation" branch; the losing attackers are not retargeted on that path.

**Total deviations:** 3 auto-fixed/adjusted (2 correctness, 1 test fixture) + 1 contract-gap resolution.
**Impact on plan:** no scope creep, no frozen type or dependency change; all settlement invariants are asserted by tests.

## Issues Encountered

- The ghost-battle bug (deviation 1) surfaced as a 40-tick 1× run in the re-arrival assertion; logging the active battle list identified an empty defeated army as the trigger source. Fixed by the roster guard.
- Dead units remaining in rosters until the later prune (deviation 2) was visible only through the regroup centre assertion; fixed by living-only averaging.

## User Setup Required

None — no external service, secret or dependency is involved.

## Known Stubs

None. The placeholder commander is an intentional Phase-4 minimal implementation with a full contract test suite, not a data stub; Phase 7 replaces it wholesale through `createDefaultKingdomConfig`'s `commanderFactory`.

## Threat Flags

None beyond the plan's `<threat_model>`. The selector is still try/catch-isolated, deduped, filtered to real candidates and capped; commander output is revalidated and exception-isolated; scenario validation runs before any state. The identity registry is a process-local `WeakMap` keyed by unit instances and adds no external surface.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/kingdom/{city,commander,scenario}.test.ts` | 3 suites / 35 tests passed |
| `pnpm vitest run tests/kingdom` | 10 files / 113 tests passed |
| `pnpm test` | 33 files / 324 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `git diff 777a396..HEAD -- src/kingdom/types.ts src/control/types.ts src/units/types.ts src/physics/types.ts package.json pnpm-lock.yaml` | 0 lines (frozen + deps untouched) |
| `updateTeam` in `src/kingdom/` | only two JSDoc mentions, no call |
| `pairLocks.delete` | only inside `releaseSeparatedPairs` |
| Roster conservation | test asserts sum of rosters == alive units and no duplicate id |

## Next Phase Readiness

- Phase 5 can render city ownership changes (`ICity.getFactionId()`, `getGarrisonArmyId()`), the new garrison army's state/roster and the loser's `Reorganizing`/`MoveTo` transition; every surviving army leaves a finished battle with `EngagedBattleId` cleared.
- Phase 6 can label recordings from `IBattle.getCityId()` and the City trigger kind; battle queues and lifecycle events are unchanged.
- Phase 7 replaces the commander wholesale through `IKingdomConfig.commanderFactory`; the context exposes only reduced vision briefs and the World enforces order validity regardless of the implementation.
- Scenario authors get immediate, explicit construction-time errors instead of corrupted physics state.

---

*Phase: 04-kingdom-system*
*Completed: 2026-10-20*

## Self-Check: PASSED

- FOUND: `src/kingdom/Commander.ts`, `src/kingdom/strategies.ts`, `tests/kingdom/commander.test.ts`, `tests/kingdom/scenario.test.ts`
- FOUND: commits `1d0c92b`, `fc974c3`, `13e8541`
- VERIFIED: frozen type files and dependency manifests unchanged (0 diff lines)
- VERIFIED: `pnpm typecheck`, `pnpm lint` and `pnpm test` (324 tests) pass
