---
phase: 05-render-system
plan: 07
subsystem: render-frame-adapters
tags:
    [
        typescript,
        render,
        pixi,
        hud,
        pooling,
        camera,
        strategic-frame,
        import-boundary,
        vitest
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: the frozen IRenderer/IHud/ICamera/IUnitView contract, IHudFrame/IHudUnitState, IStrategicFrame and RenderServicesProvider
    - phase: 05-render-system (plan 05-02)
      provides: DEFAULT_RENDER_CONFIG + validateRenderConfig (pre-Pixi gate), CULL_MARGIN_METERS, FALLBACK_FACTION_COLORS
    - phase: 05-render-system (plan 05-03)
      provides: Camera (two modes derived from the target, fixed-length transition, shake accumulation) and cameraMath.worldToScreen
    - phase: 05-render-system (plan 05-04)
      provides: frameModel — resolveFactionColor/resolveUnitViewSpec/resolveTargetPoints/isUnitVisible
    - phase: 05-render-system (plan 05-05)
      provides: hudModel (healthRatio/registerDamage/isHealthVisible/computeHudScale/computeShakeImpulsePx) and RenderDamageTap
    - phase: 05-render-system (plan 05-06)
      provides: UnitViewFactory + GeometryUnitView (ten shared GraphicsContexts, transform-only apply)
    - phase: 05-render-system (plan 05-02)
      provides: calendar.formatGameTime for the screen-space info bar
provides:
    - src/render/Hud.ts — Hud implements IHud: pooled faction-coloured bars, upright world-scaled levels, damage numbers/sparks/death rings, screen-space time+speed bar
    - src/render/Renderer.ts — Renderer implements IRenderer, createRenderer(provider, config) and the pure buildStrategicFrame(world, transform, viewport) IStrategicFrame producer
    - tests/render/import-boundary.test.ts — two extra assertions pinning manual rendering, the preserved drawing buffer, config validation and the absence of a renderer-owned loop
affects:
    [
        05-08 demo runner (drives renderFrame after exactly one world tick),
        05-09 operator panel (panel + canvas click-to-MoveTo use getCamera/getCanvas),
        05-10 Chrome UAT (the first place a frame is actually looked at),
        Phase 6 recording (getCanvas per frame, preserved buffer)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 14173
    tasks: 2
    commits: 2
    plan_head_before: 81a446bba080442ef6b0efd9541deacb905f7b32

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Frame adapter with a fixed order: read services → collect fit points → drain the damage feed once → camera.update once → write the world-layer transform → reconcile views/markers → assemble IHudFrame → app.render() once'
        - 'Shared-context pools: Hud builds one GraphicsContext per bar background / bar fill / spark / death ring and every pooled instance only news Graphics against it; dispose destroys each context exactly once behind a disposed flag'
        - 'Recycled-by-age pools with parallel arrays (node, age, active, origin/velocity or base-y): spawning never allocates once the configured cap is reached, it recycles the oldest entry'
        - 'Mode switch by visibility, not destruction: unitLayer/hudLayer.visible = focus and strategicLayer.visible = !focus, so unit views keep the IUnitVisualSpec snapshotted at first appearance (G-6)'
        - 'Structural “no units in panoramic”: IStrategicFrame has no unit list, so buildStrategicFrame cannot leak one'

key-files:
    created:
        - src/render/Hud.ts
        - src/render/Renderer.ts
    modified:
        - tests/render/import-boundary.test.ts

key-decisions:
    - 'The layer graph, Camera, UnitViewFactory and Hud are built inside the Renderer constructor from (app, provider, config) instead of being wired in createRenderer and passed in: an internal options interface cannot live in the frozen types.ts, and a nine-argument constructor would violate AGENTS §12'
    - 'Hud keeps three maps for a bar (root / scaled box / fill) rather than two: barOffsetY must stay in metres, so only the box carries hudScale while the fill carries the faction tint'
    - 'Presentation-only numbers that IRenderConfig does not carry (grid step and line width, army arrow / city marker sizes, strategic label font, particle and death-ring factors, HUD raster font size) live as documented module-level consts — the same precedent as CULL_MARGIN_METERS, because types.ts must not gain fields'
    - 'Text world sizing normalises scale to 1 before measuring localBounds, so repeated calls cannot compound and a level rewrite keeps the configured world height'
    - 'reset() destroys bar/level nodes while clearing the maps (not merely hides them) so a reset leaves no orphan scene-graph nodes; pooled effect nodes are only returned to their pool'
    - 'Strategic markers are per-city/per-army Graphics rather than shared contexts: there are only a handful and the geometry depends on CityKind, so sharing would add ownership for no gain'

patterns-established:
    - 'Adapter class shape: JSDoc’d private fields, private helpers in call order (collect → apply → register → sync → update → draw), public surface exactly the frozen interface'
    - 'Deterministic effect fans: spark directions derive from (shot index / particlesPerHit) * 2π + frameIndex * golden angle — no random source anywhere in src/render'

requirements-completed: [REND-01, REND-03, REND-04, REND-05]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
    - id: D1
      description: 'Hud implements IHud and draws only pre-resolved IHudFrame decisions: faction-coloured bar with length = healthRatio, visibility = healthVisible, size = hudScale, source colour only rewritten on change; no threshold or visibility rule is recomputed here (D-07/D-09)'
      requirement: 'REND-03'
      verification:
          - kind: other
            ref: 'node presence check over src/render/Hud.ts (prints RENDER_HUD_OK: implements IHud, all IHud methods, healthRatio/hudScale/healthVisible/barOffsetY consumption, every pool cap, formatGameTime)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck + pnpm lint'
            status: pass
      human_judgment: true
      rationale: 'Pixi cannot be constructed in the node Vitest environment, so “the bars actually read as faction-coloured and 15 s long on screen” is only observable in Chrome at 05-10 UAT.'
    - id: D2
      description: 'Level numbers are always-on, upright and world-scaled (levelWorldHeight), and text is rewritten only when the level changes (Pitfall 4)'
      requirement: 'REND-03'
      verification:
          - kind: other
            ref: 'node presence check (levelWorldHeight, lastLevels guard) + pnpm lint'
            status: pass
      human_judgment: true
      rationale: 'Legibility at battle zoom (world-height font rasterised at 48 px, then scaled) needs eyes on the running canvas.'
    - id: D3
      description: 'Damage numbers only at/above damageNumberThreshold, sparks particlesPerHit per hit and death rings on killed; all three use hard caps (maxDamageNumbers/maxParticles/maxDeathEffects) with oldest-entry recycling and configured lifetimes'
      requirement: 'REND-03'
      verification:
          - kind: other
            ref: 'node presence check (damageNumberThreshold, maxDamageNumbers, maxParticles, particlesPerHit, maxDeathEffects present; Math.random/Date.now/performance.now forbidden)'
            status: pass
      human_judgment: true
      rationale: '“强反馈” (D-06) is a look-and-feel judgement; the counts are machine-checked, the feel is not.'
    - id: D4
      description: 'Screen-space info bar shows only time + speed and rewrites only when formatGameTime changes; the camera cannot move it because it lives on screenLayer'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/calendar.test.ts (formatGameTime contract) + node presence check on Hud.ts'
            status: pass
      human_judgment: false
    - id: D5
      description: 'createRenderer validates the config before any Pixi allocation, inits with autoStart:false, resolution:1, autoDensity:false, preference webgl and preserveDrawingBuffer:true, and hands app.canvas out through getCanvas() with a 1920×1080 backing store'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — renderer initialisation initialises Pixi manually, preserves the drawing buffer and validates first'
            status: pass
          - kind: other
            ref: 'node presence check over src/render/Renderer.ts (prints RENDER_RENDERER_OK)'
            status: pass
      human_judgment: true
      rationale: 'The option strings are pinned by test, but “the captured canvas really holds the last frame” can only be confirmed by capturing in Chrome (05-10 / Phase 6).'
    - id: D6
      description: 'renderFrame reads services once, drains the damage feed exactly once (also in strategic mode), advances the camera exactly once with the frame’s points and shake impulse, writes position = viewportCentre − centre × scale + shake and scale = transform.scale to worldLayer, syncs/releases views against the catalog, updates the HUD and calls app.render() exactly once — no loop, no timer, no simulation tick'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — renderer initialisation owns no loop: the renderer schedules nothing'
            status: pass
          - kind: other
            ref: 'node presence check (single app.render() call site; requestAnimationFrame/setInterval/setTimeout/physics.tick/control.tick/drainEvents/getVisibleArmies/getVisibleCities forbidden)'
            status: pass
      human_judgment: false
    - id: D7
      description: 'Strategic mode is built by the pure buildStrategicFrame from getFactions→getArmyIds/getCityIds→getArmy/getCity and consumed as IStrategicArmyMarker/IStrategicCityMarker (faction arrow rotated by heading + strength label; faction square sized by CityKind + label); unit views are hidden, not destroyed, so a focus/strategic round trip re-reads no equipment (G-6)'
      requirement: 'REND-04'
      verification:
          - kind: other
            ref: 'node presence check (buildStrategicFrame, IStrategicFrame, worldToScreen, CameraMode.BattleFocus; vision-limited queries forbidden)'
            status: pass
      human_judgment: true
      rationale: 'Whether the panoramic view reads as “map + army arrows + city markers, no units” is a visual acceptance criterion reserved for 05-10.'
    - id: D8
      description: 'reset() destroys unit views, clears flash/timers/markers, resets the HUD and frame counter, clears the damage feed, redraws the static map layer and returns the camera to the panoramic composition without destroying the Pixi application; dispose() is idempotent and releases views, factory, HUD and application'
      requirement: 'REND-05'
      verification:
          - kind: other
            ref: 'node presence check (reset(): void, dispose(): void, disposed flag, drawMapLayer call sites)'
            status: pass
      human_judgment: true
      rationale: 'Idempotency is structurally verifiable, but a real double-dispose against a live WebGL context is only observable in Chrome.'
    - id: D9
      description: 'The static map layer (floor, 100 m grid, terrain rectangles) is drawn once per world and per reset, together with per-unit viewport culling — no spatial index, no LOD, no quality tiers (D-01)'
      requirement: 'REND-05'
      verification:
          - kind: other
            ref: 'node presence check (GRID_STEP_METERS drawMapLayer; CULL_MARGIN_METERS required, no marginMeters: 4 literal)'
            status: pass
      human_judgment: false

# Metrics
duration: 16min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 7: Pooled HUD and Per-Frame Renderer Summary

**One `renderFrame()` call now turns the real world into exactly one painted frame: a pooled HUD (faction bars, upright levels, capped damage numbers/sparks/death rings, screen-space time+speed), a camera-transformed world layer, catalog-reconciled unit views that survive a strategic round trip hidden, `buildStrategicFrame` army/city markers for the panoramic view, and a manual, drawing-buffer-preserved 1920×1080 Pixi canvas ready for Phase 6.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-10-23T16:03:00Z
- **Completed:** 2026-10-23T16:19:00Z
- **Tasks:** 2
- **Files modified:** 2 created, 1 modified

## Accomplishments

- `Hud implements IHud` draws the whole D-06/D-07..D-11 set from **pre-resolved** data only: bar length is `healthRatio`, bar size is `hudScale` applied to a wrapper box (so `barOffsetY` stays in metres), bar visibility is `healthVisible`, and the fill tint is rewritten only when the faction colour changes.
- Level numbers are **always-on, upright and world-scaled** (`levelWorldHeight`), and `Text.text` is assigned only when the level actually changes — the Pitfall 4 trap that would otherwise re-rasterise a texture for every unit every frame.
- All three effects are **capped pools with parallel arrays**: damage numbers only at/above `damageNumberThreshold`, `particlesPerHit` sparks per hit fanned deterministically from `(shot / count) · 2π + frameIndex · golden angle`, and a death ring on `killed`. At the cap the **oldest** entry is recycled, lifetimes come from `IEffectsConfig`, and nothing allocates per frame after warm-up.
- The info bar is a `screenLayer` child showing `formatGameTime(...)` — time + speed only — rewritten only when the string changes, so the camera can never move it.
- `createRenderer(provider, config)` validates the config **before** touching Pixi, inits the application with `autoStart: false`, `resolution: 1`, `autoDensity: false`, `preference: 'webgl'` and `preserveDrawingBuffer: true`, then returns an `IRenderer` whose `getCanvas()` exposes a stable 1920×1080 backing store.
- `renderFrame()` follows one exact order: read services → collect fit points (battle members, or the battle centre when the members are unreadable) → **drain the damage feed once** → `camera.update()` once with `computeShakeImpulsePx` → write `position = viewportCentre − centre × scale + shake` and `scale` to `worldLayer` → reconcile views against the catalog → update the HUD → `app.render()` **once**. No loop, no timer, no simulation tick, no vision-limited query, no battle-lifecycle drain.
- Strategic mode is a **visibility switch, not a teardown**: `unitLayer`/`hudLayer` are hidden and `strategicLayer` shows `buildStrategicFrame`'s army arrows (rotated by `getHeading()`, strength label) and city markers (sized by `CityKind`, neutral for unowned cities). Because no view is destroyed and no `apply()` runs, a focus → strategic → focus round trip re-reads **no** `getEquipment()`, so an in-place `applyUnlocks()` upgrade cannot re-snapshot a body whose collider was frozen at registration (G-6).
- `reset()` destroys views, clears flash/timers/markers, resets the HUD and frame counter, clears the damage feed, redraws the static map and returns the camera to the panoramic composition; `dispose()` is idempotent and releases views → factory → HUD → application.
- `tests/render/import-boundary.test.ts` grew two assertions that make the initialisation rules permanent: manual rendering + preserved buffer + config validation present, and **no** `requestAnimationFrame`/`setInterval`/`setTimeout` anywhere in `Renderer.ts`.

## Task Commits

Each task was committed atomically:

1. **Task 1: Implement the pooled HUD adapter (bars, levels, effects, info bar)** — `e4e2e82` (feat)
2. **Task 2: Implement Renderer.createRenderer and the complete per-frame path** — `5833a39` (feat)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/render/Hud.ts` — `Hud implements IHud`: four shared `GraphicsContext`s (bar background, bar fill, spark, death ring), three bar maps (root/box/fill), level text with a rewrite guard, three capped pools with age-array recycling, the screen-space info bar, idempotent `dispose()`
- `src/render/Renderer.ts` — `buildStrategicFrame`, `createRenderer` and `Renderer implements IRenderer`: layer graph (map/unit/hud world layer, strategic layer, screen layer), camera application, view reconciliation + culling + flash, strategic marker upsert/prune, HUD frame assembly, static map drawing, idempotent `dispose()`
- `tests/render/import-boundary.test.ts` — two new assertions: the renderer's manual-init/preserved-buffer/validate-first invariants, and the absence of any scheduling call

## Decisions Made

- **Collaborators built inside the constructor.** `Renderer` takes `(app, provider, config)` and assembles the layer graph, `Camera`, `UnitViewFactory` and `Hud` itself. `createRenderer` only validates, awaits `app.init(...)` and constructs. This keeps the constructor to three parameters (AGENTS §12) and avoids declaring an internal options interface that would have to live in the frozen `types.ts`.
- **Three maps per bar, not two.** `bars` holds the root at the unit position, `barBoxes` holds the `hudScale`-scaled wrapper, `barFills` holds the `healthRatio`-scaled fill. Only the box is scaled, so the head offset stays exactly `barOffsetY` metres at every zoom (D-09).
- **Normalise before measuring text.** `applyWorldHeight` sets `scale = 1`, reads `getLocalBounds().height`, then applies `worldHeight / height` — repeated calls cannot compound and a level rewrite keeps the configured world height.
- **Deterministic sparks.** Spark directions are a function of the shot index and the frame index; there is no random source in `src/render` at all, which is what lets the presence checks forbid `Math.random`.
- **Presentation constants stay module-level.** Grid step/width, arrow and city-marker pixel sizes, strategic label font, spark/death-ring factors and the HUD raster font size are documented consts, because `IRenderConfig` carries no fields for them and `types.ts` must not grow — the same precedent as `CULL_MARGIN_METERS` in 05-02.
- **`reset()` destroys bar/level nodes.** Clearing the maps while leaving orphaned containers in the layer would leak scene-graph nodes across resets; pooled effect nodes are only returned to their pool.

## Deviations from Plan

### Adapted Instructions

**1. Layer graph and collaborators are constructed in the `Renderer` constructor**
- The plan described `createRenderer` building the layers, `Camera`, `UnitViewFactory` and `Hud`, then passing them to `Renderer(app, ...)`.
- An internal options interface has no legal home (`src/render/types.ts` is frozen and must stay declaration-only, and AGENTS §2 allows one `types.ts` per folder), while a nine-parameter constructor would violate AGENTS §12. The constructor therefore builds them from `(app, provider, config)`.
- Behaviour is unchanged: `createRenderer` still validates first, awaits `app.init`, and returns an `IRenderer`; `camera.reset(bounds, viewport)` still runs before the first frame.

**2. `Hud` keeps a third map (`barBoxes`)**
- The plan listed `bars` and `barFills` but also required the `hudScale` scale to live on a wrapper container so the offset stays in metres. That wrapper needs to be addressable per unit, hence `barBoxes`.

**3. Effect/strategic presentation numbers are documented module-level constants**
- `IRenderConfig` has no field for grid step, marker pixel sizes, strategic label font, spark radius/velocity factors, death-ring radii or the HUD raster font size. Adding fields would require editing the frozen `types.ts`, so they are named, JSDoc’d consts (the 05-02 `CULL_MARGIN_METERS` precedent). Every *contract-level* tunable (thresholds, caps, lifetimes, offsets, fonts, palette) is still read from config.

**4. `reset()` destroys bar/level nodes instead of only hiding them**
- The plan says “clear all three maps”; the maps are cleared *and* their nodes destroyed so a reset cannot leave orphaned containers behind. Pooled effect nodes remain allocated and are simply deactivated.

---

**Total deviations:** 0 auto-fixed, 4 adapted instructions (all to satisfy AGENTS conventions or to avoid node leaks; none changed shipped behaviour)
**Impact on plan:** No scope creep. The plan's verification commands, presence checks and acceptance criteria all pass as written.

## Issues Encountered

- `prettier` rejected the first drafts of both files (mostly line-wrapping). Both were normalised with `pnpm exec prettier --write`; no logic changed.
- `src/render/types.ts` and every Phase 1–4 file remain untouched — `git status` shows only the two new render files and the one modified test.
- `pnpm lint`, `pnpm typecheck` and `pnpm test` (43 files / 476 tests) are all green; `tests/render` alone is 10 files / 144 tests.
- `gsd_run` is not on PATH in this environment, so STATE.md/ROADMAP.md were updated through `node C:\Users\book\.config\opencode\gsd-core\bin\gsd-tools.cjs` instead of a shell verb.

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-08` can now drive the loop: call `world.tick()` exactly once, then `renderer.renderFrame()`, then yield with `setTimeout(renderer` config’s `frameDelayMs)` — all scheduling lives in the runner, never in the renderer.
- `05-09` can mount `getCanvas()` into the page, show the operator panel outside the canvas, and use `getCamera().setBattleTarget(...)` plus `screenToWorld` for click-to-MoveTo.
- Deliberately **not** verified here (it needs a running Chrome canvas): whether bars/levels/effects read correctly at battle zoom, whether the panoramic markers are legible, and whether the composited frame matches the last `renderFrame()` when captured. `05-10` Chrome UAT is the scheduled check — no visual tuning has been done yet.

---

*Phase: 05-render-system*
*Completed: 2026-10-24*

## Self-Check: PASSED

- `src/render/Hud.ts` — FOUND
- `src/render/Renderer.ts` — FOUND
- `tests/render/import-boundary.test.ts` — FOUND (modified)
- commit `e4e2e82` (Task 1) — FOUND
- commit `5833a39` (Task 2) — FOUND
- `pnpm typecheck` / `pnpm lint` / `pnpm test` (476 tests) — exit 0
- `pnpm vitest run tests/render/import-boundary.test.ts` — 16/16 pass
