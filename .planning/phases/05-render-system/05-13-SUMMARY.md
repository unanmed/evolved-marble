---
phase: 05-render-system
plan: 13
subsystem: demo-operator-panel
tags:
    [
        typescript,
        operator-panel,
        scale-readout,
        px-per-metre,
        dom-adapter,
        uat-gap-closure
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-03)
      provides: ICamera.getTransform() with a live `scale` (backing-store px per metre) that already reflects the two-phase move
    - phase: 05-render-system (plan 05-12)
      provides: the pan-then-zoom camera whose scale ramp is what the readout now makes legible to the operator
    - phase: 05-render-system (plan 05-08)
      provides: OperatorPanel + IOperatorPanelOptions (camera, canvas) and the panel-outside-canvas layout in style.css
provides:
    - src/demo/panel.ts - `panel-scale` readout node, private refreshScale() (CSS/backing ratio x camera scale), bounded 250 ms refresh cleared in dispose()
    - src/style.css - `.panel-scale` styling (12 px, muted, tabular monospace numerals)
    - src/demo/types.ts - IOperatorPanelOptions JSDoc now states the camera/canvas purposes for the scale readout (no contract change)
affects:
    [
        Phase 6 recording (the readout is deliberately outside #stage-frame, so it cannot appear in a captured frame),
        any future operator-console work (the refresh pattern is now the panel's only timer)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 1861
    tasks: 1
    commits: 1
    plan_head_before: 8fcd6f13764b9a2f5acb8f0d131c89198e2762fe

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Operator-only instrumentation lives in the HTML panel, never on the Pixi canvas: the scale readout is a sibling of #stage-frame, so it is structurally impossible to film'
        - 'Backing-store to CSS conversion is one ratio (getBoundingClientRect().width / canvas.width) applied to the camera scale, so a letterboxed/resized canvas reports true on-screen px per metre'
        - 'A panel-owned interval is a single private field created on mount and cleared on dispose, next to the AbortController that owns every listener'
        - 'Non-measurable state (detached canvas, zero backing width, non-finite scale) degrades to a fixed placeholder string instead of writing NaN into the DOM'

key-files:
    created: []
    modified:
        - src/demo/panel.ts
        - src/demo/types.ts
        - src/style.css

key-decisions:
    - 'The readout multiplies the camera scale by the CSS/backing width ratio instead of assuming 1:1 pixels: the canvas keeps a 1920x1080 backing store but CSS scales the display box, so the raw scale overstates on-screen size on any non-1920 px viewport.'
    - 'The refresh is a bounded 250 ms interval rather than a listener on camera changes: ICamera has no change event and the plan forbids adding public surface, so polling at a human-imperceptible rate keeps the panel a pure adapter.'
    - 'All new state is private (scaleText, scaleTimer) and IOperatorPanel still exposes only mount/dispose — AGENTS §5 and the plan both forbid growing the public contract.'
    - 'Dirty input is rejected once, up front (finite backing width, finite positive CSS width, finite positive scale) so both the px-per-metre value and the rounded 100 m figure are derived from validated numbers only.'
    - 'src/demo/types.ts needed no contract change; only the two JSDoc lines for camera/canvas were sharpened to name the readout, because the seams it uses (getTransform().scale, canvas.width, getBoundingClientRect) were already declared.'

patterns-established:
    - 'A DOM readout that depends on layout is refreshed on a timer and cleared in dispose(); the AbortController covers listeners, the interval field covers timers — both must be released together'
    - 'Structural non-capture is enforced by the DOM tree (panel outside the canvas), not by a renderer flag'

requirements-completed: [REND-01, REND-04]

# Coverage metadata (#1602)
coverage:
    - id: D1
      description: 'The operator panel shows a live map-scale readout (100 m grid equivalent in CSS px plus px-per-metre) computed from ICamera.getTransform().scale and the canvas CSS/backing ratio'
      requirement: 'REND-01'
      verification:
          - kind: automated
            ref: 'pnpm typecheck'
            status: pass
          - kind: automated
            ref: 'pnpm build'
            status: pass
      human_judgment: true
      rationale: 'The arithmetic is type-checked and the string shape is fixed, but whether the printed number matches what the operator perceives (and reads well at 300 px panel width) is a Chrome UAT judgement; the repo has no DOM test environment, so no unit test asserts the DOM output.'
    - id: D2
      description: 'The readout lives outside the canvas, so no recorded frame can contain it'
      requirement: 'REND-01'
      verification:
          - kind: structural
            ref: 'src/demo/panel.ts — buildScaleRow appends .panel-scale to the panel section mounted in #operator-panel, a sibling of #stage-frame'
            status: pass
          - kind: automated
            ref: 'git diff --name-only (src/render/** untouched)'
            status: pass
      human_judgment: false
    - id: D3
      description: 'The readout refreshes on a bounded timer that is cleared in dispose(), with no listener or timer leak'
      requirement: 'REND-01'
      verification:
          - kind: structural
            ref: 'src/demo/panel.ts — dispose() clearInterval(scaleTimer) + nulls scaleText; mount() creates exactly one interval and returns early on re-mount'
            status: pass
      human_judgment: false
    - id: D4
      description: 'The readout uses textContent only (no innerHTML, no user-supplied markup)'
      requirement: 'REND-01'
      verification:
          - kind: automated
            ref: 'pnpm lint (no-inner-html style violations absent) + code review of the single textContent assignment'
            status: pass
      human_judgment: false
    - id: D5
      description: 'The number tracks the two-phase camera move: it eases during the zoom segment and stays constant during the pan segment'
      requirement: 'REND-04'
      verification:
          - kind: structural
            ref: 'src/demo/panel.ts — reads camera.getTransform().scale on every refresh, so it inherits 05-12 pan/zoom behaviour with no cache'
            status: pass
      human_judgment: true
      rationale: 'Confirmation requires watching the panel while the camera enters and leaves battle focus in Chrome; the timing itself is already pinned by tests/render/camera.test.ts.'

# Metrics
duration: 6min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 13: Operator-Only Scale Readout Summary

**The operator panel now shows a live `比例尺 100 m ≈ N px · 网格 100 m · 1 m = N.NN px` readout derived from the camera transform and the canvas CSS/backing ratio, refreshed every 250 ms and cleared on dispose — entirely outside the Pixi canvas, so it can never enter a recorded frame**

## Performance

- **Duration:** 6 min
- **Started:** 2026-10-24T19:35:00Z (approx.)
- **Completed:** 2026-10-24T19:39:00Z (approx.)
- **Tasks:** 1
- **Files modified:** 3 (0 created, 3 modified)

## Accomplishments

- Added a `.panel-scale` `div` to `OperatorPanel.mount`, appended directly after the header (which carries the status line) and before the run row, so it sits in the visual flow right under the status text. The node is built with `createElement` and written only through `textContent` — the panel's no-markup rule (T-05-42) is preserved.
- `refreshScale()` derives the on-screen scale in three steps exactly as planned: `backingWidth = canvas.width`, `cssWidth = canvas.getBoundingClientRect().width`, `cssRatio = cssWidth / backingWidth`, then `pxPerMeter = camera.getTransform().scale * cssRatio`. That second factor matters: the canvas keeps a 1920×1080 backing store while `#stage-host canvas { width: 100% }` scales the display box, so the raw camera scale would overstate on-screen size on any narrower viewport.
- The text is `比例尺 100 m ≈ ${Math.round(pxPerMeter * 100)} px · 网格 100 m · 1 m = ${pxPerMeter.toFixed(2)} px`, matching the plan's example shape. The 100 m grid is a named constant (`MAP_GRID_METERS`) so the grid reminder and the 100 m multiplier cannot drift apart.
- Failure degrades instead of printing garbage: zero/negative/non-finite backing width, zero/non-finite CSS width, or non-finite/non-positive camera scale all yield the fixed placeholder `比例尺 --`. Detaching the canvas therefore shows a placeholder rather than `NaN`.
- Refresh is scheduled twice: once synchronously at the end of `mount()` (so the panel never shows an empty line), then on a single `setInterval` at `SCALE_REFRESH_INTERVAL_MS = 250` stored in the private `scaleTimer`. `dispose()` calls `clearInterval`, nulls the timer and nulls `scaleText` alongside the existing `controller.abort()` and node teardown, so the panel keeps its "no listener or timer leak" property.
- No public surface was added: `IOperatorPanel` still declares only `mount`/`dispose`, and the two new members are `private`. `src/demo/types.ts` changed only in JSDoc (the camera and canvas fields now name their readout purpose); no interface member, type or contract anchor moved.
- `src/style.css` gained a minimal `.panel-scale` rule — 12 px, muted `#8f9aa8`, tabular-nums, monospace stack — reusing the panel's existing muted colour so the readout reads as secondary information next to the status line.

## Verification

| Command | Result |
| --- | --- |
| `pnpm typecheck` | clean |
| `pnpm lint` | 0 errors, 2 pre-existing `no-console` warnings in `src/main.ts` |
| `pnpm build` | built in 592 ms (only the pre-existing >500 kB chunk advisory) |
| `pnpm test` | 46 files / 507 tests passed |
| `git diff --name-only` (task commit) | `src/demo/panel.ts`, `src/demo/types.ts`, `src/style.css` only — `src/render/**` untouched |

Manual UAT still open (Chrome): confirm the printed number matches the perceived scale, that it moves during the zoom segment and holds during the pan segment, and that it reads well at the fixed 300 px panel width.

## Task Commits

Each task was committed atomically:

1. **Task 1: Add the operator-only scale readout** - `261f3fa` (feat)

**Plan metadata:** the docs commit that follows this SUMMARY.

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/demo/panel.ts` — four new top-level constants (`MAP_GRID_METERS`, `SCALE_REFRESH_INTERVAL_MS`, `SCALE_UNAVAILABLE`, each with JSDoc), two private fields (`scaleText`, `scaleTimer`), `buildScaleRow()`, `refreshScale()`, the mount/append wiring and the dispose teardown. Class and `mount` JSDoc updated to mention the readout and its timer.
- `src/demo/types.ts` — JSDoc only: `camera` now reads "模式切换与比例尺读数（比例尺只显示在 canvas 之外的面板里）"; `canvas` names both click picking and the CSS/backing conversion.
- `src/style.css` — new `#operator-panel .panel-scale` block (block layout, muted colour, 12 px, monospace with tabular numerals).

## Decisions Made

- **CSS/backing ratio is applied to the camera scale, not assumed to be 1.** `ICameraTransform.scale` is documented as "每米对应的像素数" in backing-store space (the renderer applies it to a 1920×1080 stage). The panel shows CSS pixels, so `scale × (cssWidth / canvas.width)` is the only honest conversion, and it also keeps the readout correct if the stage is letterboxed by `aspect-ratio`/`min()`.
- **A 250 ms interval instead of a change hook.** `ICamera` exposes no change event, and the plan forbids adding public members, so polling is the only option that keeps the panel a pure adapter. 250 ms is far below the rate at which an operator can notice a stale number and cheap enough to be invisible next to the frame loop.
- **One validation gate before any arithmetic.** All three inputs are checked together; both the rounded 100 m figure and the `toFixed(2)` per-metre figure are then derived from already-validated numbers, so a single guard keeps `NaN` out of the DOM.
- **`types.ts` stayed a documentation-only edit.** The readout consumes `ICamera.getTransform().scale`, `HTMLCanvasElement.width` and `getBoundingClientRect()` — all already declared — so growing the interface would have violated both AGENTS §5 and the plan's "no public members beyond `mount`/`dispose`" rule.

## Deviations from Plan

None - plan executed exactly as written. `src/demo/types.ts` appears in `files_modified` but required no contract change; only its JSDoc was updated (recorded above), which is within the planned file scope.

## Issues Encountered

- `dist/` is regenerated by `pnpm build`; it is already gitignored, so no build artefact entered the commit.
- The repo has no DOM/jsdom test environment, so the readout's rendered output is not covered by an automated test. The arithmetic path was instead constrained by type checking and by the single validated-input gate; the visual/behavioural confirmation is the Chrome UAT item listed under Verification.

## User Setup Required

None — no external service configuration required. Start the dev server yourself (`pnpm dev`) when you want to view the panel.

## Known Stubs

None. Every value is wired: the scale comes from the live camera transform, the ratio from the live canvas element, and the constant comes from `MAP_GRID_METERS`. The `比例尺 --` string is an intentional degradation state, not a placeholder awaiting data.

## Next Phase Readiness

- 05-13 closes the operator-only scale gap; `src/render/**` is untouched, so 05-10 (if still open) and Phase 6 recording remain unaffected by this change.
- Phase 6 note: the readout is a sibling of `#stage-frame` inside `#operator-panel`, so a capture that targets `#stage-host` (as the current page layout implies) structurally excludes it.
- Outstanding human follow-up: the Chrome UAT pass on the readout's accuracy and legibility (D1/D5, `human_judgment: true`).

## Self-Check: PASSED

- `src/demo/panel.ts` — FOUND
- `src/demo/types.ts` — FOUND
- `src/style.css` — FOUND
- commit `261f3fa` — FOUND

---

*Phase: 05-render-system*
*Completed: 2026-10-24*
