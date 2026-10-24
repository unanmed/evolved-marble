---
phase: 05-render-system
plan: 09
subsystem: demo-panel-entry
tags:
    [
        typescript,
        demo,
        operator-panel,
        dom,
        abortcontroller,
        vite,
        index-html,
        css-letterbox,
        screen-to-world,
        issue-order
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: the frozen IRenderer/ICamera/IViewport/ICameraTransform/IRenderServices contract
    - phase: 05-render-system (plan 05-02)
      provides: DEFAULT_RENDER_CONFIG (1920x1080, frameDelayMs 33) and MIN/MAX_FRAME_DELAY_MS (0/1000)
    - phase: 05-render-system (plan 05-03)
      provides: screenToWorld — the exact inverse of the world→screen mapping, minus shake
    - phase: 05-render-system (plan 05-07)
      provides: Renderer.createRenderer/getCanvas/getCamera/reset/renderFrame (no loop of its own)
    - phase: 05-render-system (plan 05-08)
      provides: IOperatorPanel/IOperatorPanelOptions/IManualRunner contracts, initDemoRuntime, createDemoSetup, selectDemoScenario, ManualRunner
    - phase: 04-kingdom-system
      provides: IWorld.issueOrder with ArmyOrderKind MoveTo/Garrison/Hold, IMapBounds, IFaction/IArmy/ICity read surfaces
provides:
    - src/demo/panel.ts — OperatorPanel implements IOperatorPanel — the whole operator control surface, structurally outside the canvas
    - src/main.ts — async demo bootstrap wiring Rapier init, real setup, renderer, runner, panel, reset session and unload teardown
    - index.html — Vite entry with #stage-host and a sibling #operator-panel
    - src/style.css — dark page layout, 16:9 letterboxed stage, fixed-pixel backing store scaled only by CSS
    - src/vite-env.d.ts — vite/client types so the CSS import typechecks
    - package.json — dev (vite) and build (vite build) scripts beside the unchanged gates
affects:
    [
        05-10 Chrome UAT (the first place this page is actually watched),
        Phase 6 recording (the canvas is the only video surface; the panel is provably outside it)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 7014
    tasks: 2
    commits: 2
    plan_head_before: 723563fd711bb7c81aaec287ee89d8d5195bfe47

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Panel is a pure DOM adapter: every node from createElement, every string through textContent, every listener through one AbortController signal so dispose() is a single abort'
        - 'Label-bearing buttons are stored in private fields (pauseButton, moveToButton) so the plan''s required label swapping has an owner without touching the frozen IOperatorPanel interface'
        - 'Panel run state is a panel-owned mirror updated only on operator actions, because main mounts the panel before runner.start() and the panel must not poll the runner'
        - 'MoveTo picking inverts the exact camera transform: CSS pixels -> getBoundingClientRect -> 1920x1080 viewport -> screenToWorld with shakeX/shakeY zeroed, then bounds rejection before issueOrder'
        - 'Page shell keeps the canvas backing store untouched: Pixi owns width/height (resolution 1, autoDensity false), CSS only sizes the display box via aspect-ratio 16/9'
        - 'Async bootstrap with no top-level await: main().catch(console.error) so a failed boot is logged instead of leaving a blank page'

key-files:
    created:
        - src/demo/panel.ts
        - src/main.ts
        - index.html
        - src/style.css
        - src/vite-env.d.ts
    modified:
        - package.json

key-decisions:
    - 'The operator panel calls only declared seams (runner pause/step/reset/delay/auto-follow, camera setBattleTarget, world issueOrder) and never ticks, renders or reads unit internals; 全景 disables auto-follow *before* clearing the target so a live battle cannot steal the operator panorama back (D-12/D-18/REND-04)'
    - 'No HTML is assembled from strings anywhere: the panel builds nodes with createElement and writes every scenario/faction/army/city name through textContent, so no name can become markup (T-05-42/ASVS V1/V5)'
    - 'Picking zeroes shakeX/shakeY in a copy of the camera transform instead of reading a "clean" transform from the renderer: shake is a per-frame screen offset, and only the shake-free inverse is a correct pick (D-24/T-05-43)'
    - 'Reset follows IManualRunner semantics rather than inventing a restart: runner.reset() pauses, rebuilds the session and restores auto-follow, so the panel shows 已暂停 and labels the button 继续 (no hidden work inside a "reset" click)'
    - 'The canvas is appended directly into #stage-host and #stage-frame is its 16:9 box: no wrapper element ever holds both panel and canvas, so panel pixels cannot reach getCanvas() (D-12/Pitfall 16/T-05-44)'
    - 'dev/build are fixed literal scripts and the pixi.js/rapier2d-compat pins are untouched, so the build cannot be steered by configuration (T-05-47)'

patterns-established:
    - 'Demo harness surface: index.html (stage + sibling panel) + main.ts (async bootstrap) + style.css (letterbox only) — the page is a verification harness, never an app shell (D-16)'
    - 'Disposable DOM: one AbortController per mount, aborted in dispose(), re-created only if the panel is mounted again'
    - 'Every panel input is re-validated at the seam: Number.isFinite on the slider, integer parsing on selects, bounds check on picks — the kingdom layer still validates the order itself'

requirements-completed: [REND-01, REND-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
    - id: D1
      description: 'OperatorPanel implements IOperatorPanel with exactly mount(HostElement)/dispose and provides pause/resume, single step, reset, camera mode (战斗/全景/自动), per-frame delay (0-1000 ms slider), army selection and MoveTo/Garrison/Hold — all mounted in a host outside the canvas (D-12)'
      requirement: 'REND-01'
      verification:
          - kind: other
            ref: 'node presence check over src/demo/panel.ts (prints DEMO_PANEL_OK; requires implements IOperatorPanel, mount(host: HTMLElement): void, dispose(): void, setFrameDelay, setBattleTarget, setAutoFollow)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck (OperatorPanel implements IOperatorPanel with no public member outside the interface)'
            status: pass
      human_judgment: true
      rationale: 'The panel is a DOM surface: buttons, slider, selects and the 战斗/全景/自动 behaviour can only be judged in Chrome (05-10 UAT). No jsdom environment exists in this phase, and the plan deliberately ships no DOM tests.'
    - id: D2
      description: 'Panel text is never markup: nodes come from createElement, every string goes through textContent, and one AbortController removes every listener in dispose() (ASVS V1/V5/T-05-42)'
      requirement: 'REND-05'
      verification:
          - kind: other
            ref: 'node presence check over src/demo/panel.ts (DEMO_PANEL_OK; forbids innerHTML/outerHTML/document.write/eval(/new Function)'
            status: pass
          - kind: other
            ref: 'pnpm lint (no violation in src/demo/panel.ts; prettier clean)'
            status: pass
      human_judgment: false
    - id: D3
      description: 'MoveTo uses canvas picking: CSS pixels -> getBoundingClientRect -> 1920x1080 viewport -> screenToWorld with shakeX/shakeY zeroed, and the point is rejected unless finite and inside the map bounds before issueOrder is called; orders go only through IWorld.issueOrder with ArmyOrderKind MoveTo/Garrison/Hold (D-24/T-05-43/T-05-04)'
      requirement: 'REND-01'
      verification:
          - kind: other
            ref: 'node presence check over src/demo/panel.ts (DEMO_PANEL_OK; requires getBoundingClientRect, screenToWorld, shakeX: 0, shakeY: 0, issueOrder, ArmyOrderKind.MoveTo/Garrison/Hold, Number.isFinite)'
            status: pass
      human_judgment: true
      rationale: 'Whether a click during camera shake lands where the operator clicked is a behavioural claim that needs a real WebGL frame and a real mouse event; it is checked in the 05-10 Chrome UAT.'
    - id: D4
      description: 'index.html hosts #stage-host inside a 16:9 #stage-frame plus a sibling #operator-panel and loads /src/main.ts as a module; main() is async (no top-level await), awaits initDemoRuntime() before building the world, awaits createRenderer(() => setup.services, DEFAULT_RENDER_CONFIG), appends getCanvas(), constructs ManualRunner and OperatorPanel, starts the runner and tears everything down on beforeunload; package.json gains dev/build with typecheck/test/lint and the exact dependency pins unchanged; pnpm build succeeds (D-13/D-16/D-18/Pitfall 16/23/T-05-47)'
      requirement: 'REND-05'
      verification:
          - kind: other
            ref: 'node presence check over src/main.ts + index.html + src/style.css + package.json (prints DEMO_ENTRY_OK; requires async function main, await initDemoRuntime(), await createRenderer, getCanvas(), new ManualRunner, new OperatorPanel, resetSession, runner.start(), main().catch, stage-host, operator-panel, aspect-ratio, dev===vite, build===vite build)'
            status: pass
          - kind: other
            ref: 'pnpm build (vite build: 766 modules transformed, dist/index.html + css + js emitted, exit 0)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck / pnpm lint / pnpm test (45 files, 492 tests)'
            status: pass
      human_judgment: false
    - id: D5
      description: 'The page actually boots in Chrome: the canvas reports width=1920/height=1080, is letterboxed at 16:9 and centred, the operator panel renders beside it (never inside the captured frame), and pause/step/reset/speed/camera/MoveTo-pick/Garrison/Hold all behave'
      requirement: 'REND-05'
      verification: []
      human_judgment: true
      rationale: 'WebGL, canvas sizing and DOM layout cannot be observed in the Vitest node environment; this is exactly the manual UAT item scheduled in 05-10.'

# Metrics
duration: 20min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 9: Operator Panel and Demo Bootstrap Summary

**The phase is now watchable: `index.html` + `main.ts` + `style.css` boot the real composed simulation into a fixed 1920×1080 Pixi canvas, and `OperatorPanel` gives the operator pause/step/reset, three camera modes, per-frame delay and `MoveTo`/`Garrison`/`Hold` from a DOM panel that is structurally a sibling of the canvas — so no panel pixel can ever enter the video.**

## Performance

- **Duration:** ~20 min
- **Started:** 2026-10-24T06:11:43Z
- **Completed:** 2026-10-24T06:31:47Z
- **Tasks:** 2
- **Files modified:** 5 created, 1 modified

## Accomplishments

- `src/demo/panel.ts` — `OperatorPanel implements IOperatorPanel` with exactly `mount(host)`/`dispose()` public. It renders a header (标题/场景名/状态行), a run row (暂停·继续 / 单步 / 重置), a camera row (战斗 / 全景 / 自动), a speed row (range input over `MIN_FRAME_DELAY_MS..MAX_FRAME_DELAY_MS`, live `N ms` label), an army row (`<select>` from `getFactions() → getArmyIds() → getArmy()`, option text = army id + faction name, refreshed on `focus`), an order row (`MoveTo` pick toggle, `Hold`, city `<select>`, `Garrison`) and an empty `role="status"` error line that `main` owns.
- Camera semantics match D-12/REND-04 exactly: 战斗 re-enables auto-follow then targets `firstActiveBattleId(world)` (`undefined` when no battle → panorama); 全景 calls `runner.setAutoFollow(false)` **before** `camera.setBattleTarget(undefined)` so an operator panorama survives any number of live-battle frames; 自动 re-enables auto-follow and only overrides the target when a battle is active.
- MoveTo picking is shake-proof (D-24/T-05-43): `getBoundingClientRect()` converts CSS pixels into the 1920×1080 viewport, a `{ ...transform, shakeX: 0, shakeY: 0 }` copy is fed to `screenToWorld`, and the resulting point is dropped unless both coordinates are finite and inside `[0, bounds.width] × [0, bounds.height]`. Every rejection path still exits pick mode, so a bad click cannot wedge the UI.
- Orders only ever go through `IWorld.issueOrder` with `ArmyOrderKind.MoveTo` (`targetX`/`targetY`), `ArmyOrderKind.Hold`, or `ArmyOrderKind.Garrison` (`cityId`); the kingdom layer's own validation stays the final authority (T-05-04). The panel never ticks the world, never renders, and never reads unit internals (D-18).
- Security shape is structural, not remembered: nodes are built with `createElement`, all text (including faction/army/city names) is written through `textContent`, and every listener — including the canvas `click` — is attached with one `AbortController.signal`, so `dispose()` is a single `abort()` plus `host.replaceChildren()` (T-05-42/T-05-44).
- `index.html` is a minimal Vite entry: `#stage-host` inside `#stage-frame` inside `#stage-wrap`, a sibling `<aside id="operator-panel">`, a viewport meta and `/src/main.ts` as a module — no inline script, no external assets.
- `src/style.css` makes D-13/D-12 layout facts: `#stage-frame { aspect-ratio: 16 / 9; width: min(100%, calc((100vh - 24px) * 16 / 9)) }` and `#stage-host canvas { width: 100%; height: 100% }` scale only the display box; `#operator-panel` is a 300 px flex sibling with a left border — it can never overlap the canvas.
- `src/main.ts` is an async `main()` (no top-level await, Pitfall 23): `await initDemoRuntime()` → `selectDemoScenario(location.search)` → `createDemoSetup(scenario)` → `await createRenderer(() => setup.services, DEFAULT_RENDER_CONFIG)` → append `getCanvas()` to `#stage-host` → `resetSession` (new setup → dispose previous → `renderer.reset()`, so the provider sees the new services while Pixi is not rebuilt) → `new ManualRunner(...)` → `new OperatorPanel(...)`, `panel.mount(...)` → `runner.start()` → a `beforeunload` teardown in runner → panel → renderer → setup order, and `main().catch(error => console.error(error))`.
- `package.json` gains exactly `"dev": "vite"` and `"build": "vite build"`; `typecheck`/`test`/`lint` and the exact `pixi.js@8.22.0` / `@dimforge/rapier2d-compat@0.21.0` pins are untouched.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the HTML operator panel outside the canvas** — `725f109` (feat)
2. **Task 2: Boot the demo in Chrome with a fixed-size stage and add dev/build scripts** — `338376f` (feat)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/demo/panel.ts` — `OperatorPanel implements IOperatorPanel`: DOM construction, camera/speed/army/city rows, canvas pick, `issueMoveTo`/`issueHold`/`issueGarrison`/`firstActiveBattleId`, single-`AbortController` teardown
- `src/main.ts` — async bootstrap and the injected `resetSession`; log-and-return error handling via `main().catch(...)`
- `index.html` — stage host + sibling operator panel + module entry, dark inline background to avoid a white flash before CSS loads
- `src/style.css` — dark palette, flex page, 16:9 letterboxed stage, canvas display sizing only, panel/control styling
- `src/vite-env.d.ts` — `/// <reference types="vite/client" />` so `import './style.css'` typechecks
- `package.json` — `dev` and `build` scripts added; everything else byte-identical

## Decisions Made

- **Two extra private fields are what make the required label swaps possible.** The plan asks for a pause button whose label toggles and a MoveTo button that becomes `点击画布选点`, but its private-field list has no reference to either button. `pauseButton` and `moveToButton` are therefore stored (private, JSDoc'd) — the frozen `IOperatorPanel` surface stays `mount`/`dispose`.
- **The panel mirrors the loop state; it does not poll the runner.** `main` mounts the panel *then* starts the runner (plan step order), so probing `runner.isRunning()` at mount would display 已暂停 at boot. `paused` starts `false` (running) and is only re-derived after an operator action.
- **Reset is pause-and-rebuild, not restart.** `IManualRunner.reset()` pauses, rebuilds the session and restores auto-follow, so the panel shows 已暂停 and relabels the button 继续. Restarting inside "重置" would hide a state change the operator did not ask for.
- **City selection is read from the `<select>` at order time** instead of being mirrored into a field: the plan's field list has no `selectedCityId`, and the select is the single source of truth for a value that is only used when Garrison is pressed.
- **`screenToWorld` gets a copy with shake zeroed, not a live transform read after clearing shake.** `ICameraTransform` is readonly and the renderer owns it; spreading into a `shakeX: 0, shakeY: 0` literal keeps the pick a pure inverse of the last frame's mapping.
- **`src/vite-env.d.ts` exists solely for the CSS import.** Without a `vite/client` reference, `tsc` rejects `import './style.css'`; the alternative (linking the stylesheet from `index.html`) would have moved the CSS out of the module graph that Vite bundles.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] Added `src/vite-env.d.ts`**
- **Found during:** Task 2 (bootstrap)
- **Issue:** The plan requires `src/main.ts` to `import './style.css'`, but `tsc` has no declaration for `*.css` and `pnpm typecheck` failed with TS2307 ("cannot find module './style.css'").
- **Fix:** Added a one-line `/// <reference types="vite/client" />` declaration file under `src/` (already inside the tsconfig `include`). Vite declares `*.css` in `client.d.ts`, so the import is typed and the CSS still lands in the module graph.
- **Files modified:** `src/vite-env.d.ts` (created)
- **Verification:** `pnpm typecheck` exit 0, `pnpm build` emits `dist/assets/index-*.css`
- **Committed in:** `338376f` (part of Task 2)

### Adapted Instructions

**1. Panel fields `pauseButton` and `moveToButton` added**
- The plan's private-field list omits any handle to the pause or MoveTo button, but its action requires both to swap labels (`暂停`↔`继续`, `MoveTo`↔`点击画布选点`). Two private JSDoc'd fields own those labels; the public surface is still exactly `mount`/`dispose`.

**2. Panel run state is panel-owned at mount**
- The plan says the status line reflects "运行中 / 已暂停" without saying which side owns the flag. Since `main` mounts the panel before `runner.start()`, the panel initialises to 运行中 and re-derives state only from operator actions (pause/continue/reset), avoiding a false 已暂停 at boot.

**3. Reset also exits pick mode**
- The plan lists select refresh + selection clearing for reset. `resetSession` additionally clears `picking` (a click queued for the old world would otherwise target the new one) — same seam, no new behaviour.

**4. Reset leaves the loop paused**
- The plan does not say whether reset resumes. `IManualRunner.reset()` pauses, so the panel follows the contract and reports 已暂停 with a 继续 button; no hidden restart was invented.

**5. `scenarioName` and host ids are named constants**
- The plan inlines the `location.search.includes('classes=all') ? 'all classes' : 'default'` expression and the `'stage-host'`/`'operator-panel'` literals. They live in JSDoc'd top-level consts (`ALL_CLASSES_QUERY`, `STAGE_HOST_ID`, `PANEL_HOST_ID`, …) so the same strings are not repeated between `main.ts` and the panel (AGENTS §6 spirit, D-20's no-magic-numbers discipline).

**6. City option label falls back to 无主**
- The plan says option text is the city id plus name; unowned cities have `getFactionId() === undefined`, so the label reads `"<id> 无主"` instead of an empty tail.

---

**Total deviations:** 1 auto-fixed (Rule 3), 6 adapted instructions (two extra private fields, panel-owned boot state, reset clears pick mode, reset stays paused, named constants, unowned-city label). None changed shipped behaviour or the frozen contracts.

## Issues Encountered

- `prettier` (via `eslint --fix`) reformatted `src/demo/panel.ts` on the first pass (line wrapping only); no logic changed.
- `pnpm lint` reports two `no-console` **warnings** in `src/main.ts` (lines 73 and 107 — the runner `onError` and `main().catch`). They are warnings, not errors (`exit 0`), and both console calls are the plan's mandated boot/error reporting (Pitfall 23/T-05-46).
- `pnpm build` emits the standard >500 kB chunk warning (Pixi + Rapier bundle, 3.8 MB / 1.4 MB gzip) and exits 0; chunk splitting is explicitly out of scope for this harness (D-01).
- `dist/` is gitignored by the existing `.gitignore`; the build leaves no untracked artefacts.
- `src/render/types.ts`, `src/render/cameraMath.ts`, `src/render/constants.ts` and every Phase 1–4 source file are byte-identical (`git diff --name-only 723563f..HEAD` lists only the six files above).
- `gsd_run` is not on PATH in this environment, so STATE.md/ROADMAP.md were updated through `node C:\Users\book\.config\opencode\gsd-core\bin\gsd-tools.cjs`.

## User Setup Required

None - `pnpm dev` serves the page at http://localhost:8074 (Vite config port) with no external services or secrets.

## Next Phase Readiness

- `05-10` Chrome UAT can now open `http://localhost:8074` (and `?classes=all`): everything it needs exists — a real composed world, a running one-tick-per-frame loop, a fixed 1920×1080 canvas, and a control panel outside the frame.
- Verified by hand-off only (not yet visually confirmed): the canvas is 1920×1080 and letterboxed, the panel sits beside it, 战斗/全景/自动 do not teleport the camera, and a MoveTo click lands where the operator clicked even while a shaking frame is displayed.
- Phase 6 can capture `renderer.getCanvas()` with confidence that no DOM pixel (panel, status text, buttons) shares the surface; the `reset()` path keeps the same canvas alive across world rebuilds.
- Deliberately not done here: recording controls, scene menus, unit teleport, debug overlays or collision overlays (D-12 prohibitions), and any visual tuning (05-10 is limited to `DEFAULT_RENDER_CONFIG` calibration).

---

*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- `src/demo/panel.ts` — FOUND
- `src/main.ts` — FOUND
- `index.html` — FOUND
- `src/style.css` — FOUND
- `src/vite-env.d.ts` — FOUND
- `package.json` scripts `dev`/`build` — FOUND (`vite` / `vite build`)
- commit `725f109` (Task 1) — FOUND
- commit `338376f` (Task 2) — FOUND
- `pnpm typecheck` — exit 0
- `pnpm lint` — exit 0 (2 `no-console` warnings in main.ts, 0 errors)
- `pnpm test` — 45 files / 492 tests, exit 0 (baseline unchanged)
- `pnpm build` — exit 0 (dist emitted)
- presence checks — `DEMO_PANEL_OK`, `DEMO_ENTRY_OK`
- frozen contracts — `git diff --name-only 723563f..HEAD` shows only the six plan files
