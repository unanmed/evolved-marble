---
phase: 05-render-system
plan: 02
subsystem: render-system-foundation
tags: [typescript, render-config, validation, palette, calendar, pure-functions, hud-info-bar]

# Dependency graph
requires:
  - phase: 05-render-system (plan 05-01)
    provides: the frozen render contract — IRenderConfig/IRenderPalette/ICameraConfig/IHudConfig/IEffectsConfig and the pure data shapes the formatter feeds
  - phase: 02-physics-simulation
    provides: DEFAULT_GEOMETRY (body 0.5 m / weapon half-length 0.4 m / weapon radius 0.05 m / offset 0.7 m / armour 0.55 m) reused verbatim as the render footprint
provides:
  - src/render/constants.ts — DEFAULT_RENDER_CONFIG (canvas/format/faction table/palette/camera/HUD/effects), FALLBACK_FACTION_COLORS, MAX_BUFFERED_DAMAGE_EVENTS, MIN/MAX_FRAME_DELAY_MS, MIN/MAX_CANVAS_DIMENSION, CULL_MARGIN_METERS, FLASH_RING_OFFSET_METERS, validateRenderConfig
  - src/render/calendar.ts — MINUTES_PER_DAY/DAYS_PER_MONTH/MONTHS_PER_YEAR/DAYS_PER_YEAR + formatCalendar/formatSpeed/formatGameTime (the D-11 info bar)
  - tests/render/constants.test.ts — 10 tests pinning the shipped default and the full rejection table
  - tests/render/calendar.test.ts — 10 tests pinning every calendar boundary and the guarded-input behaviour
affects: [05-03 camera, 05-04 frame model, 05-05 HUD model, 05-06 unit views, 05-07 Renderer/Hud, 05-08 demo runner, 05-09 panel/main, 05-10 Chrome UAT + calibration]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
  tokens: 6070
  tasks: 2
  commits: 2
  plan_head_before: cfa431deef6431a133f281c4ef251e6e5fcec254

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "Single tuning surface: every render number is a typed top-level const in constants.ts; later modules import it, never re-default"
    - "Identity reuse over copied numbers: `geometry: DEFAULT_GEOMETRY` shares the physics object, so a drawn footprint cannot drift from the Rapier capsule"
    - "Fail-fast config gate: validateRenderConfig throws `validateRenderConfig: <field> <reason>` before any Pixi application or canvas allocation exists"
    - "Validation-only bounds (240 fps ceiling, 0..1000 ms delay, 16..3840 px canvas) are input safety limits, not frame-rate contracts (D-01/D-17)"
    - "Pure integer calendar arithmetic: no Date, Intl, locale, timezone or accumulated floats, so the same game minute always renders the same string"
    - "Guarded display formatting: non-finite/negative minutes clamp to the year-1 start and non-positive rates render an em dash instead of NaN"
    - "Table-driven rejection test: one invalid config per malformed class, each asserting the error names the offending field"

key-files:
  created:
    - src/render/constants.ts
    - src/render/calendar.ts
    - tests/render/constants.test.ts
    - tests/render/calendar.test.ts
  modified: []

key-decisions:
  - "DEFAULT_RENDER_CONFIG is typed as the frozen IRenderConfig and `geometry` is the imported DEFAULT_GEOMETRY object (identity, not a copy), so the drawn weapon/armour footprint is structurally tied to the Rapier capsule (Pitfall 15)"
  - "Canvas defaults are 1920x1080, outputFps 30 and frameDelayMs 33; outputFps is documented as HUD/encoding metadata and frameDelayMs as runner metadata, never a loop throttle (D-01/D-13/D-17)"
  - "factionColors is a configurable table ({1: 0xd0342c, 2: 0x2f6fe0}) with a six-colour FALLBACK_FACTION_COLORS table, so no red/blue is baked into drawing code (D-04)"
  - "CULL_MARGIN_METERS (4 m) and FLASH_RING_OFFSET_METERS (0.08 m) are exported named constants instead of new IRenderConfig fields, keeping the frozen contract untouched while removing the last module-local magic numbers (D-20)"
  - "validateRenderConfig is read-only, silent, and throws on the first violation with a `validateRenderConfig: <field>` prefix; the shipped default passes unchanged (T-05-01/T-05-09)"
  - "The HUD scale ordering is a hard rule (`screenScaleAt > worldScaleAt > 0`), so the hybrid bar scale in 05-05 cannot silently become decreasing (D-09/T-05-11)"
  - "Calendar constants live in calendar.ts because they are calendar definitions, not tunable visual knobs; only the info-bar typography (infoMarginPx/infoFontSizePx) lives in DEFAULT_RENDER_CONFIG (D-11)"
  - "formatCalendar clamps non-finite/negative minutes to 0 and floors to whole minutes, so a NaN frame can never reach the info bar string (D-11/D-17)"
  - "requirements-completed lists REND-03 and REND-05 as assigned by the plan frontmatter; their remaining behaviour (live HUD drawing, Chrome UAT) lands in 05-05/05-07/05-09/05-10 and is re-checked there — Phase 5 is still not complete"

patterns-established:
  - "Config module shape: header JSDoc naming D-20, grouped typed consts (PALETTE/CAMERA/HUD/EFFECTS), one exported DEFAULT_RENDER_CONFIG, then local fail/assert helpers and one exported validator"
  - "Error-message contract: every validator failure begins `validateRenderConfig:` and includes the dotted field path (`camera.coverage`, `hud.screenScaleAt`, `palette.grid`)"
  - "Pure formatter module shape: four JSDoc'd calendar constants, a private pad2 helper, three exported pure functions with no module-level caching"
  - "Boundary-pinned tests: the calendar table asserts the exact rendered Chinese string at 0/1/59/60/1439/1440/43200/44640/518400 and the two-digit padding at 09:05"

requirements-completed: [REND-03, REND-05]

# Coverage metadata (#1602).
coverage:
  - id: D1
    description: "src/render/constants.ts is the phase's single tuning entry: DEFAULT_RENDER_CONFIG typed as the frozen IRenderConfig with the 1920x1080 canvas, outputFps 30, frameDelayMs 33, configurable faction colour table, dark/high-saturation palette, and the pinned camera/HUD/effects values (coverage 0.9, healthBarSeconds 15, alwaysVisibleBelowUnits 6, damageNumberThreshold 50)"
    requirement: "REND-05"
    verification:
      - kind: unit
        ref: "tests/render/constants.test.ts#pins the documented canvas, output fps and runner delay"
        status: pass
      - kind: unit
        ref: "tests/render/constants.test.ts#pins the decision-critical camera, HUD and effects values"
        status: pass
      - kind: unit
        ref: "tests/render/constants.test.ts#reuses the frozen physics geometry instead of copying numbers"
        status: pass
      - kind: other
        ref: "node presence check over src/render/constants.ts → RENDER_CONSTANTS_OK"
        status: pass
    human_judgment: false
  - id: D2
    description: "validateRenderConfig rejects every malformed class before Pixi/canvas allocation with a field-named error: non-integer/out-of-range canvas dimensions, non-finite outputFps, out-of-range frameDelayMs, invalid colour values, non-positive geometry, invalid camera/HUD numbers, mis-ordered HUD scale thresholds and non-positive effect caps — while the shipped default passes and the input is not mutated"
    requirement: "REND-05"
    verification:
      - kind: unit
        ref: "tests/render/constants.test.ts#throws a field-named error for every malformed class (16 cases)"
        status: pass
      - kind: unit
        ref: "tests/render/constants.test.ts#does not mutate the validated object"
        status: pass
      - kind: other
        ref: "pnpm typecheck (tsc --noEmit) exit 0"
        status: pass
    human_judgment: false
  - id: D3
    description: "src/render/calendar.ts converts accumulated game minutes into the D-11 360-day calendar and formats `第 Y 年 M 月 D 日 HH:MM / N×` with exact two-digit padding, guarded non-finite/negative input and no wall-clock, Date, locale or timezone dependence"
    requirement: "REND-03"
    verification:
      - kind: unit
        ref: "tests/render/calendar.test.ts#renders the exact string at each calendar boundary"
        status: pass
      - kind: unit
        ref: "tests/render/calendar.test.ts#guards negative and non-finite minutes to the year-1 start"
        status: pass
      - kind: unit
        ref: "tests/render/calendar.test.ts#renders a dash for non-positive or non-finite rates"
        status: pass
      - kind: other
        ref: "node presence check over src/render/calendar.ts → RENDER_CALENDAR_OK"
        status: pass
    human_judgment: false
  - id: D4
    description: "The two new modules stay pure (no Pixi, no Rapier, no class, no DOM, no I/O) and the whole suite, typecheck and lint stay green: 36 test files / 372 tests, with the prior 34-file / 352-test baseline intact"
    requirement: "REND-03, REND-05"
    verification:
      - kind: integration
        ref: "pnpm test — 36 files / 372 tests passed"
        status: pass
      - kind: other
        ref: "pnpm typecheck exit 0 and pnpm lint exit 0"
        status: pass
    human_judgment: false

# Metrics
duration: ~16min
completed: 2026-10-23
status: complete
---

# Phase 5 Plan 02: 渲染系统基础（配置与简化历）Summary

**The renderer's single tuning entry with a fail-fast validator, plus the pure 360-day calendar that renders the D-11 video info bar — both typed against the frozen contract, physics-geometry-identity reuse, and fully pinned by 20 new tests.**

## Performance

- **Duration:** ~16 min
- **Started:** 2026-10-23T14:45:00Z
- **Completed:** 2026-10-23T15:01:00Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `src/render/constants.ts` lands the phase's only tuning surface (D-20): `DEFAULT_RENDER_CONFIG` is typed as the frozen `IRenderConfig` with the documented 1920×1080 canvas, `outputFps` 30 and `frameDelayMs` 33 (D-01/D-13/D-17), a configurable faction colour table (D-04), the dark/high-saturation palette (D-05), and the contract-pinned camera/HUD/effects values (`coverage` 0.9, `healthBarSeconds` 15, `alwaysVisibleBelowUnits` 6, `damageNumberThreshold` 50, `screenScaleAt` > `worldScaleAt`).
- `geometry: DEFAULT_GEOMETRY` reuses the **physics object itself**, not a copy (asserted with `toBe`), so the drawn weapon/armour footprint can never drift from the Rapier capsule (Pitfall 15/Pitfall 22).
- `validateRenderConfig(config)` is the pre-allocation gate: it validates canvas integers and caps, `outputFps`, `frameDelayMs`, every faction/palette colour, the five geometry lengths, all camera numbers (including `maxScale >= minScale` and `shakeDecayPerFrame ∈ [0,1]`), all HUD numbers (including the strict `screenScaleAt > worldScaleAt` ordering), and every effect cap/lifetime; each failure throws `validateRenderConfig: <field> …` and the shipped default passes unchanged (T-05-01/T-05-09/T-05-11).
- Exported named constants remove the last local literals from later plans: `CULL_MARGIN_METERS = 4` for 05-07's visibility cull and `FLASH_RING_OFFSET_METERS = 0.08` for 05-06's flash ring, plus `MAX_BUFFERED_DAMAGE_EVENTS = 512` (05-05) and the frame-delay/canvas bounds (05-09's panel) — all without touching the frozen contract (D-20).
- `src/render/calendar.ts` implements the D-11 simplified calendar with integer-only arithmetic: minute 1439 is day 1 23:59, 1440 is day 2 00:00, 43200 is month 2 day 1, and 518400 is year 2 month 1 day 1; `formatCalendar` clamps negative/non-finite input to the year-1 start, `formatSpeed` returns `—` for non-positive/non-finite rates, and `formatGameTime` composes the exact `第 Y 年 M 月 D 日 HH:MM / N×` info bar with two-digit padding.
- Both modules are Pixi-free, Rapier-free, class-free, DOM-free and I/O-free, so the existing `environment: 'node'` Vitest setup exercises them directly; `pnpm test` reports 36 files / 372 tests (the 34-file / 352-test baseline plus two new 10-test files), with `pnpm typecheck` and `pnpm lint` at exit 0.

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
| ---- | ---- | ------ | ---- |
| 1 | Land the render tuning entry and its validation gate | `88df5d0` | feat |
| 2 | Implement the simplified 360-day calendar and info-bar formatter | `e2aded0` | feat |

_Measured covers via the plan ledger: `git rev-list --count cfa431d..HEAD` = 2 task commits at SUMMARY write time (`plan_head_before: cfa431d`)._

## Files Created/Modified

- `src/render/constants.ts` (created, 374 lines) — module header naming D-20; `FALLBACK_FACTION_COLORS`, `MAX_BUFFERED_DAMAGE_EVENTS`, `MIN_FRAME_DELAY_MS`, `MAX_FRAME_DELAY_MS`, `MIN_CANVAS_DIMENSION`, `MAX_CANVAS_DIMENSION`, `CULL_MARGIN_METERS`, `FLASH_RING_OFFSET_METERS`; the grouped `PALETTE`/`CAMERA`/`HUD`/`EFFECTS` typed objects; `DEFAULT_RENDER_CONFIG`; local `fail`/`assert*` helpers; `validateRenderConfig`
- `src/render/calendar.ts` (created, 73 lines) — pure calendar definitions (`MINUTES_PER_DAY`, `DAYS_PER_MONTH`, `MONTHS_PER_YEAR`, `DAYS_PER_YEAR`), private `pad2`, and `formatCalendar`/`formatSpeed`/`formatGameTime`
- `tests/render/constants.test.ts` (created, 212 lines) — 10 tests: shipped-default acceptance, pinned documented values, faction/fallback tables, `DEFAULT_GEOMETRY` identity, exported culling/flash/bounds constants, the 16-case rejection table, the error-prefix assertion, and the no-mutation check
- `tests/render/calendar.test.ts` (created, 102 lines) — 10 tests: calendar constants, the nine-row boundary table, the day-1/day-2 split, two-digit padding (09:05/09:50), guarded negative/non-finite minutes, rounded speed values, dash cases, and the composed info-bar string

## Decisions Made

- **Identity over equality for geometry.** `geometry: DEFAULT_GEOMETRY` is asserted with `toBe`, making "no copied numbers" a test-visible property rather than a comment.
- **Validation bounds are not tuning knobs.** The 240 fps ceiling, 0–1000 ms delay range and 16–3840 px canvas caps are input-safety limits (ASVS V5), documented as such so nobody mistakes them for a frame-rate contract under D-01.
- **Two visual/culling numbers stay out of the frozen config.** `CULL_MARGIN_METERS` and `FLASH_RING_OFFSET_METERS` are exported named constants rather than new `IRenderConfig` fields, satisfying D-20 without widening the approved contract.
- **Calendar constants live in `calendar.ts`.** They are calendar definitions, not tunable visual parameters; only the info-bar typography remains in `DEFAULT_RENDER_CONFIG`.
- **Requirements marked at plan scope.** `REND-03`/`REND-05` are recorded complete as the plan frontmatter assigns them (matching the 04-02 precedent where a requirement spans several plans); the remaining HUD-drawing and Chrome-UAT behaviour is owned by 05-05/05-07/05-09/05-10.

## Deviations from Plan

None — plan executed exactly as written. Two small authoring refinements stayed inside the plan's stated intent:

1. A module-local `MAX_OUTPUT_FPS = 240` constant was introduced (with JSDoc) for the `(0, 240]` `outputFps` rule the plan specifies, instead of a bare `240` literal in the validator.
2. `effects.particlesPerHit` is also validated as a positive integer (the plan names only the three pool caps), because it is a per-hit count that must never be zero or fractional; the shipped value 6 passes.

No behavioural deviation, no file outside the plan's `files_modified` was touched, and `src/render/types.ts` is byte-identical to the approved contract.

## Issues Encountered

- None. The first focused runs of both new test files passed, and `pnpm typecheck` / `pnpm lint` / `pnpm test` were green on the first full run after each task.
- Note: `git` reported the usual LF→CRLF conversion warning on the new files (repo default on Windows); no content change and no hook failure.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/render/constants.test.ts` | 1 file / 10 tests passed |
| `pnpm vitest run tests/render/calendar.test.ts` | 1 file / 10 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 36 files / 372 tests passed |
| `node` presence check over `src/render/constants.ts` | `RENDER_CONSTANTS_OK` |
| `node` presence check over `src/render/calendar.ts` | `RENDER_CALENDAR_OK` |
| `git diff --name-status cfa431d..HEAD` | only the 4 plan files (all added) |
| `src/render/types.ts` | untouched (absent from the diff) |
| Phase 1–4 source dirs | untouched (absent from the diff) |

## Known Stubs

None. Both modules are complete implementations; every value later plans consume (`CULL_MARGIN_METERS`, `FLASH_RING_OFFSET_METERS`, `MAX_BUFFERED_DAMAGE_EVENTS`, the frame-delay/canvas bounds) is exported and asserted here rather than deferred as a placeholder.

## Threat Flags

None beyond the plan's `<threat_model>`. The only new surface is the pre-allocation config validator, which implements T-05-09/T-05-10/T-05-11 (finite/integer/range checks, 0xRRGGBB colour bounds, strict HUD scale ordering). No dependency was added (T-05-SC), no network/persistence/DOM access exists, and the info-bar text is built solely from integers plus a literal separator (T-05-12 accepted).

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** wave 3 (`05-03` camera math/`Camera`, `05-04` frame model) can now import `DEFAULT_RENDER_CONFIG` (camera block), `CULL_MARGIN_METERS` and the cost-free `formatGameTime`; no module needs to invent a default.
- **Contract discipline held:** `src/render/types.ts` was not modified, so Round-2 plans continue against the frozen, user-approved contract.
- **Phase 5 remains IN PROGRESS:** Chrome UAT, the live HUD, camera tracking and the demo runner are still pending (05-03..05-10). Do not advance to Phase 6.

## Self-Check: PASSED

- FOUND: `src/render/constants.ts`
- FOUND: `src/render/calendar.ts`
- FOUND: `tests/render/constants.test.ts`
- FOUND: `tests/render/calendar.test.ts`
- FOUND: commit `88df5d0` (feat: render tuning entry + validation gate)
- FOUND: commit `e2aded0` (feat: simplified calendar + info-bar formatter)
