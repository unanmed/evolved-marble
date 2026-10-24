---
phase: 05-render-system
plan: 08
subsystem: demo-composition-runner
tags:
    [
        typescript,
        demo,
        composition-root,
        rapier,
        damage-tap,
        runner,
        settimeout,
        fake-timers,
        camera-target,
        vitest
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: the frozen IRenderer/ICamera/IDamageFeed/IRenderServices/RenderServicesProvider contract
    - phase: 05-render-system (plan 05-02)
      provides: DEFAULT_RENDER_CONFIG (frameDelayMs 33) and MIN/MAX_FRAME_DELAY_MS (0/1000)
    - phase: 05-render-system (plan 05-03)
      provides: Camera (target-derived modes, smooth transition, reset to the panoramic composition)
    - phase: 05-render-system (plan 05-04)
      provides: resolveTargetPoints for real battle member positions
    - phase: 05-render-system (plan 05-05)
      provides: RenderDamageTap — the IDamageSink/IDamageFeed decorator that keeps BattleDamageSink intact
    - phase: 05-render-system (plan 05-07)
      provides: Renderer.renderFrame (one painted frame, no loop, preserved canvas)
    - phase: 04-kingdom-system
      provides: KingdomWorld/KingdomSensingWorld/BattleDamageSink/issueOrder/ArmyOrderKind, DEFAULT_SCENARIO and SCENARIO_MINIMAL
    - phase: 04-kingdom-system
      provides: tests/kingdom/harness.ts — the mandatory physics → sensing → late-bound sink → control → world order
provides:
    - src/demo/types.ts — declaration-only demo contracts (runner world/renderer targets, IRunnerDeps, RunnerErrorHandler, IManualRunner, IDemoSetup, IOperatorPanelOptions, IOperatorPanel)
    - src/demo/scenario.ts — DEMO_DEFAULT_SCENARIO (same object as DEFAULT_SCENARIO), DEMO_ALL_CLASSES_SCENARIO and selectDemoScenario
    - src/demo/composition.ts — initDemoRuntime/createDemoSetup/disposeDemoSetup with the real Rapier wiring, the damage tap and real opening MoveTo orders
    - src/demo/runner.ts — ManualRunner implements IManualRunner: one world tick + one render per output frame, single setTimeout, pause/step/reset/delay and the automatic battle target
    - tests/demo/composition.test.ts — real-Rapier wiring, accepted orders, a populated battle with target points, real applied damage, independent setups
    - tests/demo/runner.test.ts — fake-timer proof of the frame contract, clamping, target policy, error pause and reset
affects:
    [
        05-09 operator panel (consumes IDemoSetup + IManualRunner + IOperatorPanel contracts),
        05-10 Chrome UAT (the first real run of this composition; ?classes=all lives here),
        Phase 6 recording (the runner is the reference for “advance one tick, render one frame”)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 9397
    tasks: 2
    commits: 2
    plan_head_before: 4b91f4525fb1dea84fe2ea674299c9391aeb0c7e

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Composition root mirrors tests/kingdom/harness.ts exactly, with one decorator inserted: physics → sensing → late-bound BattleDamageSink → RenderDamageTap → ControlSystem(tap) → KingdomWorld → worldRef = world'
        - 'Only async step separated: initDemoRuntime() (RAPIER.init) is called once, createDemoSetup is synchronous so reset can rebuild a world inside one frame boundary'
        - 'Idempotent disposal by identity: a module-level WeakSet<IDemoSetup> is marked before world → control → physics, so double dispose (and re-entrant dispose) is a no-op without adding a field to the frozen-shape contract'
        - 'Runner owns the only loop: runOneFrame(false|true) is the single frame path, so stepOnce and a scheduled frame differ only in whether the next setTimeout is armed'
        - 'Automatic camera policy is a two-line predicate over listActiveBattles(), gated by an explicit autoFollow flag, so an operator panorama survives any number of frames'
        - 'Narrow test doubles without extra public members (AGENTS §5): the test owns mutable probe objects/arrays and passes them into the fake constructor, which stores them in private readonly fields'

key-files:
    created:
        - src/demo/types.ts
        - src/demo/scenario.ts
        - src/demo/composition.ts
        - src/demo/runner.ts
        - tests/demo/composition.test.ts
        - tests/demo/runner.test.ts
    modified: []

key-decisions:
    - 'Disposal idempotency lives in a module-level WeakSet rather than on IDemoSetup: the contract has no field for it, and AGENTS §5 forbids a public member outside the interface. The set is filled before the first dispose so a re-entrant call cannot double-release Rapier'
    - 'The opening MoveTo orders use only world.getFactions/getArmy/issueOrder, i.e. real simulation input — no unit, battle or damage is fabricated (D-19). The default PlaceholderCommander never overwrites them because it only orders armies whose getOrder() is null'
    - 'setAutoFollow(false) deliberately does not touch camera.setBattleTarget: the panel clears or selects the target in the same operator action, so the runner cannot fight the operator (D-12/D-15)'
    - 'stepOnce() reuses runOneFrame(false) instead of a second implementation, so “one step” is provably the same tick+render+target work as a scheduled frame, minus the scheduling'
    - 'The composition test ticks past the zero-member starting frame inside the same 220-tick budget: KingdomWorld breaks the peace substep loop right after the battle-starting substep while a new Battle starts with an empty member list, so the member points only appear on the next addUnitsInside() (mechanics-driven, not a relaxed assertion)'
    - 'Frame delay is clamped through one helper (non-finite → 0, else [0, 1000]) used by both the constructor and setFrameDelay, so NaN can never reach setTimeout'

patterns-established:
    - 'Demo types are declaration-only with JSDoc on every member; IRenderServices is imported, never re-declared (AGENTS §2)'
    - 'Real-data composition: every demo dependency is a production class wired in the harness order; the only synthetic input is the demo-local classes=all scenario table built by spreading DEFAULT_SCENARIO'
    - 'Fake-timer runner tests assert vi.getTimerCount() after every lifecycle action (start/pause/step/dispose) to make timer leaks impossible to introduce'

requirements-completed: [REND-01, REND-04, REND-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
    - id: D1
      description: 'createDemoSetup builds physics → sensing → late-bound BattleDamageSink → RenderDamageTap(physics.getUnitState) → ControlSystem(tap) → KingdomWorld, returns services { world, catalog: control, physics, damageFeed: tap }, and disposes world → control → physics; no unit/battle/damage is fabricated (D-19/T-05-37/T-05-40)'
      requirement: 'REND-01'
      verification:
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — real world wiring feeds the render services from one real world, catalog, physics and tap'
            status: pass
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — lifecycle disposes idempotently'
            status: pass
          - kind: other
            ref: 'node presence check over src/demo/types.ts + composition.ts + scenario.ts (prints DEMO_COMPOSITION_OK)'
            status: pass
      human_judgment: false
    - id: D2
      description: 'createDemoSetup issues real IWorld.issueOrder MoveTo orders toward the nearest opposing army, so both armies hold an accepted MoveTo order immediately after construction and march into the 80 m trigger without vision luck or operator input (D-19/REND-04)'
      requirement: 'REND-04'
      verification:
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — real world wiring registers the real scenario roster and issues accepted opening MoveTo orders'
            status: pass
      human_judgment: false
    - id: D3
      description: 'Ticking the real world produces a real battle whose getMemberUnitIds() is non-empty and whose resolveTargetPoints over the real physics states is non-empty (ticked past the zero-member starting frame inside the 220-tick budget)'
      requirement: 'REND-04'
      verification:
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — real battle and damage produces a real battle with members and non-empty camera target points'
            status: pass
      human_judgment: false
    - id: D4
      description: 'At least one real damage event (damage > 0, finite x/y, boolean killed) reaches the tap drain within the 2000-tick budget; no damage is injected'
      requirement: 'REND-01'
      verification:
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — real battle and damage delivers real applied damage through the tap drain'
            status: pass
      human_judgment: false
    - id: D5
      description: 'Two independently created setups are consistent and independent (2 units each, distinct identities, disposing one leaves the other tickable), proving reset can build a fresh world instead of resurrecting disposed state (Pitfall 18)'
      requirement: 'REND-01'
      verification:
          - kind: integration
            ref: 'tests/demo/composition.test.ts#demo/composition — lifecycle keeps two independently created setups consistent and independent'
            status: pass
      human_judgment: false
    - id: D6
      description: 'ManualRunner performs exactly one world.tick() and one renderer.renderFrame() per output frame, schedules with a single setTimeout per frame, never advances control or physics, and increments getFrameCount() once per frame (D-17/Pitfall 8/T-05-38)'
      requirement: 'REND-05'
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts#demo/runner — one tick and one render per output frame schedules on start and advances exactly one frame per delay'
            status: pass
          - kind: other
            ref: 'node presence check over src/demo/runner.ts (prints DEMO_RUNNER_OK; setInterval/requestAnimationFrame/control.tick/physics.tick forbidden)'
            status: pass
      human_judgment: false
    - id: D7
      description: 'Pause clears the pending timer (vi.getTimerCount() === 0), stepOnce runs exactly one unscheduled frame only while paused, setFrameDelay clamps to [0, 1000] and rejects non-finite input, reset pauses + calls the injected session reset once + zeroes the frame count + restores auto-follow, and dispose is idempotent and blocks later scheduling (D-12/T-05-39)'
      requirement: 'REND-05'
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts — cancels the pending timer on pause without leaking one; steps exactly one unscheduled frame while paused; clamps the frame delay to [0, 1000] and rejects non-finite input; pauses, resets the session once and restores defaults on reset; disposes idempotently and blocks a later start'
            status: pass
      human_judgment: false
    - id: D8
      description: 'Automatic targeting keeps a still-active current battle, otherwise selects the first active battle, otherwise clears the target; with auto-follow off the runner never writes setBattleTarget so an operator panorama survives any number of frames, and re-enabling resumes following (D-12/D-15/OQ-6/REND-04)'
      requirement: 'REND-04'
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts#demo/runner — automatic battle targeting selects the first active battle and clears the target when it ends; keeps an operator panorama while auto-follow is off and resumes when re-enabled; keeps an explicit battle selection while that battle is active'
            status: pass
      human_judgment: false
    - id: D9
      description: 'An error thrown by world.tick() pauses the loop, reports through onError exactly once and leaves no timer, so no further frames run (V7)'
      requirement: 'REND-05'
      verification:
          - kind: unit
            ref: 'tests/demo/runner.test.ts#demo/runner — failures and lifecycle pauses and reports once when a tick throws'
            status: pass
      human_judgment: false
    - id: D10
      description: 'Demo scenario selection: DEMO_DEFAULT_SCENARIO is the unchanged DEFAULT_SCENARIO object, DEMO_ALL_CLASSES_SCENARIO appends 1 Hammer + 1 Knight per army without mutating the source, and selectDemoScenario only honours the literal classes=all (D-16/D-22/T-05-41)'
      requirement: 'REND-04'
      verification:
          - kind: other
            ref: 'node presence check over src/demo/scenario.ts (DEMO_DEFAULT_SCENARIO, DEMO_ALL_CLASSES_SCENARIO, selectDemoScenario, ClassKind.Hammer, ClassKind.Knight)'
            status: pass
      human_judgment: true
      rationale: 'The variant exists so a human can visually confirm all 6 weapons and 2 armours (REND-02) on the running canvas; that check is scheduled for 05-10 Chrome UAT, and no Node test can observe the drawn geometry.'

# Metrics
duration: 11min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 8: Demo Composition and Frame Runner Summary

**A real kingdom world now feeds the renderer — physics → sensing → late-bound sink → damage tap → control → world, with genuine opening `MoveTo` orders and no fabricated entities — and `ManualRunner` is the phase's only loop: exactly one `world.tick()` and one `renderFrame()` per output frame behind a single `setTimeout`, with pause/step/reset/delay and an automatic battle target that yields to an operator panorama.**

## Performance

- **Duration:** ~11 min
- **Started:** 2026-10-24T13:52:00Z
- **Completed:** 2026-10-24T14:03:00Z
- **Tasks:** 2
- **Files modified:** 6 created, 0 modified

## Accomplishments

- `src/demo/types.ts` declares the whole demo surface without behaviour: `IRunnerWorld`, `IRunnerRenderer`, `RunnerErrorHandler`, `IRunnerDeps`, the eleven-method `IManualRunner`, `IDemoSetup`, `IOperatorPanelOptions` and `IOperatorPanel`. `IRenderServices` is imported from `src/render/types.ts`, never duplicated.
- `createDemoSetup(scenario)` is **synchronous** and reproduces the harness order exactly: `PhysicsWorld` → `KingdomSensingWorld` → `BattleDamageSink` with the late-bound `() => worldRef?.getBattleSystem() ?? null` accessor → `RenderDamageTap(sink, unitId => physics.getUnitState(unitId))` → `ControlSystem(physics, sensing, provider, tap)` → `KingdomWorld(...)` → `worldRef = world`. The tap is what control receives, so the renderer sees **every** applied hit while `BattleDamageSink` keeps all combat rules untouched (G-3/D-19/T-05-37).
- `services` is `{ world, catalog: control, physics, damageFeed: tap }` — the catalog is the control system itself (`IControlSystem extends IUnitCatalog`), so the render layer never needs a second unit source.
- `issueInitialEngagementOrders(world)` gives every non-empty army a real `world.issueOrder({ kind: ArmyOrderKind.MoveTo, targetX/Y: nearest enemy centre })` (squared distance, lower army id wins ties). This is simulation input, not synthetic state, and it is what makes the two armies close the 200 m / 790 m gap despite `ARMY_VISION_RADIUS = 100`; the default `PlaceholderCommander` leaves the order alone because it only orders armies with `getOrder() === null`.
- `disposeDemoSetup` runs **world → control → physics** and is idempotent through a module-level `WeakSet<IDemoSetup>` marked before the first release, so a second `dispose()` (or the object's own `dispose()`) cannot double-release Rapier.
- `initDemoRuntime()` is the only `async` step (`RAPIER.init()`); after it, a reset can rebuild the entire world inside one frame boundary (Pitfall 18).
- `ManualRunner` owns the only loop. `runOneFrame` does `getWorld()` → `world.tick()` → `updateTarget(world)` → `renderer.renderFrame()` → `frameCount += 1`, then arms **one** `setTimeout(frameDelayMs)`. It never touches control or physics (the world already ticks control in each substep — Pitfall 8/T-05-38), and there is no rAF, no interval and no fps accumulator.
- The camera policy is exactly one predicate: while `autoFollow` is on, keep the current target if it is still in `listActiveBattles()`, else take `active[0]`, else `undefined`; while off, `setBattleTarget` is never called, so an operator panorama survives any number of frames and re-enabling auto-follow resumes following without a special case (D-12/D-15/OQ-6).
- `pause()` clears and nulls the single handle, `stepOnce()` reuses `runOneFrame(false)` so a step is provably the same work minus scheduling, `reset()` pauses → `resetSession()` once → `frameCount = 0` → `autoFollow = true`, and `dispose()` is idempotent and blocks later `start()`/`stepOnce()`. An exception in tick or render pauses the loop and reports once through `onError`.
- `tests/demo/composition.test.ts` runs on **real Rapier** with `SCENARIO_MINIMAL`: wiring identity, 2 registered units, both armies holding an accepted `MoveTo`, a real battle whose member list becomes non-empty (one extra tick past the zero-member starting frame), non-empty `resolveTargetPoints` from real physics states, a real `damage > 0` event through `tap.drain()` with finite coordinates, two independent setups, and double dispose.
- `tests/demo/runner.test.ts` proves the frame contract with fake timers and asserts `vi.getTimerCount()` after start/pause/step/dispose so a timer leak cannot be introduced silently.

## Task Commits

Each task was committed atomically:

1. **Task 1: Declare the demo contracts, add the scenario variants, and build the real composition root** — `b8e533d` (feat)
2. **Task 2: Implement the setTimeout frame runner with automatic battle targeting** — `bfe3f7a` (feat)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/demo/types.ts` — declaration-only demo contracts (runner world/renderer, `IRunnerDeps`, `RunnerErrorHandler`, `IManualRunner`, `IDemoSetup`, `IOperatorPanelOptions`, `IOperatorPanel`); imports `IRenderServices` instead of re-declaring it
- `src/demo/scenario.ts` — `DEMO_DEFAULT_SCENARIO` (the unchanged `DEFAULT_SCENARIO`), `DEMO_ALL_CLASSES_SCENARIO` (per-army `+1 Hammer +1 Knight`, built by spreading), `selectDemoScenario(search)` (only `classes=all`)
- `src/demo/composition.ts` — `initDemoRuntime`, `createDemoSetup` (physics → sensing → late-bound sink → tap → control → world, `services`, idempotent `dispose`), `disposeDemoSetup`, and the module-local `issueInitialEngagementOrders`/`nearestEnemyArmy`
- `src/demo/runner.ts` — `ManualRunner implements IManualRunner`: single `setTimeout` scheduler, `runOneFrame`, delay clamping, auto-follow target policy, error pause
- `tests/demo/composition.test.ts` — real-Rapier integration: services identity, roster, accepted opening orders, populated battle + camera points, real damage through the tap, two independent setups, idempotent dispose
- `tests/demo/runner.test.ts` — fake-timer suite for the frame contract, pause/step/delay, the three camera policies, error pause, reset and dispose

## Decisions Made

- **Idempotency in a `WeakSet`, not on the contract.** `IDemoSetup` (like every frozen interface) cannot grow a `disposed` field without violating AGENTS §5, so `disposeDemoSetup` keys off a module-level `WeakSet<IDemoSetup>` and marks the setup *before* releasing world → control → physics. Re-entrant and repeated calls are therefore no-ops.
- **Opening orders are real input.** `issueInitialEngagementOrders` only reads `getFactions/getArmy` and calls `issueOrder`; it never creates a unit, battle or damage event. That keeps the demo a verification harness rather than a scripted movie (D-19/prohibition 2).
- **The runner never overrides the operator.** `setAutoFollow(false)` only flips the flag; the panel is free to set a panorama or a battle in the same action. This is the seam that lets REND-04's "no manual control" default coexist with D-12/D-24's manual camera mode.
- **One frame path.** `stepOnce()` calls the same `runOneFrame(false)` used by the timer, so "single step equals a frame without scheduling" is structural rather than tested-by-coincidence.
- **Member-frame tick inside the same budget.** The test ticks up to 220 times *in total*, continuing while the starting battle still reports zero members: `KingdomWorld.tick()` leaves the peace substep loop immediately after the battle-starting substep, and `BattleSystem.tick()` joins members only on the next `addUnitsInside()`. The contract (a populated battle) is unchanged; only the mechanics-required extra tick was added.
- **No public members on test doubles.** The fakes receive mutable probe objects/arrays from the test and keep them in `private readonly` fields, so `CountingWorld`/`ListingBattleSystem`/`CountingRenderer` expose exactly their interface (AGENTS §5).

## Deviations from Plan

### Adapted Instructions

**1. `setInterval` removed from a JSDoc sentence in `src/demo/runner.ts`**
- The plan's presence check forbids the literal token `setInterval` anywhere in the runner source. The first draft described the prohibition in prose ("no rAF / `setInterval` / fps accumulator"), which tripped the check.
- The sentence now reads "no rAF, repeating timers or a fixed-fps accumulator" — the same claim, without the forbidden literal. No code changed.

**2. `tests/demo/composition.test.ts` collects drained events per tick**
- The plan phrased assertion 5 as "`tap.drain()` returns at least one event whose damage > 0". Because the feed is per-frame, the test drains inside the 2000-tick loop and keeps the first positive sample (plus every sample, so an empty feed fails with a useful count) instead of draining once after the loop, which would have missed events the feed is designed to hand out every frame.
- Every asserted property (damage > 0, finite x/y, boolean `killed`) is unchanged.

**3. Test fakes expose no extra public surface**
- The plan sketched `CountingWorld` returning `{ gameMinutes: ticks, minutesPerTick: 24 }` and a `FakeBattleSystem` with a mutable list. Instead of public mutable fields (AGENTS §5 forbids public members outside the interface), the test owns the probe object and the active-battle array and injects them; the fakes only implement `IRunnerWorld`/`IBattleSystem`/`IRunnerRenderer`.

---

**Total deviations:** 0 auto-fixed, 3 adapted instructions (one presence-check token, two test-shape adjustments; none changed shipped behaviour)
**Impact on plan:** No scope creep. Both presence checks print `DEMO_COMPOSITION_OK` / `DEMO_RUNNER_OK`, and every verification command in the plan exits 0 as written.

## Issues Encountered

- `prettier` rejected the first drafts of all six files (line wrapping only). They were normalised with `pnpm exec eslint --fix src/demo tests/demo`; no logic changed.
- The real-Rapier damage assertion passed on the first run: with `SCENARIO_MINIMAL` the armies close the 200 m gap in ~15 peace ticks and the first applied hit reaches the tap well inside the 2000-tick budget.
- `src/render/types.ts`, `src/kingdom/scenario.ts`, `src/kingdom/types.ts`, `src/control/types.ts`, `src/physics/types.ts` and `src/units/types.ts` are byte-identical (`git diff --name-only` is empty for them).
- `pnpm typecheck` and `pnpm lint` are green; `pnpm test` is 45 files / 492 tests (baseline after 05-07 was 43 files / 476 tests — the two new files add 16 tests).
- `gsd_run` is not on PATH in this environment, so STATE.md/ROADMAP.md were updated through `node C:\Users\book\.config\opencode\gsd-core\bin\gsd-tools.cjs`.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-09` can now assemble the page: `await initDemoRuntime()`, `createDemoSetup(selectDemoScenario(location.search))`, `createRenderer(() => setup.services, DEFAULT_RENDER_CONFIG)`, then `new ManualRunner({ getWorld: () => current.world, camera: renderer.getCamera(), renderer, resetSession, onError }, DEFAULT_RENDER_CONFIG.frameDelayMs)`. `IDemoSetup`/`IManualRunner`/`IOperatorPanelOptions`/`IOperatorPanel` are already declared for it.
- `resetSession` for the panel is `disposeDemoSetup(current)` + `createDemoSetup(scenario)` + `renderer.reset()` + swap the `current` reference — the composition test proves a fresh world is independent of a disposed one, and `initDemoRuntime()` must **not** be re-run.
- `05-10` Chrome UAT is the first place this composition is actually watched: the automatic battle target, the panorama surviving auto-follow off, the `?classes=all` variant and the "one tick per frame" pacing are all unverified visually until then.
- Deliberately not done here: no Pixi import, no DOM, no panel, no `index.html`, no `dev` script (all 05-09), and no visual tuning.

---

*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- `src/demo/types.ts` — FOUND
- `src/demo/scenario.ts` — FOUND
- `src/demo/composition.ts` — FOUND
- `src/demo/runner.ts` — FOUND
- `tests/demo/composition.test.ts` — FOUND
- `tests/demo/runner.test.ts` — FOUND
- commit `b8e533d` (Task 1) — FOUND
- commit `bfe3f7a` (Task 2) — FOUND
- `pnpm typecheck` / `pnpm lint` — exit 0
- `pnpm test` (45 files / 492 tests) — exit 0
- `pnpm vitest run tests/demo/composition.test.ts` — 6/6 pass
- `pnpm vitest run tests/demo/runner.test.ts` — 10/10 pass
- presence checks — `DEMO_COMPOSITION_OK`, `DEMO_RUNNER_OK`
