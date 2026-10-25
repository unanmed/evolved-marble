---
phase: 05-render-system
plan: 10
subsystem: render
tags:
    [
        typescript,
        chrome-uat,
        manual-verification,
        calibration,
        d-01-acceptance,
        requirements-doc-sync,
        gap-closure-record
    ]
gap_closure: false

# Dependency graph
requires:
    - phase: 05-render-system (05-01..05-09)
      provides: 'the frozen render contract, constants/calendar, camera math + Camera, frame model, HUD model + damage tap, unit views, Hud/Renderer, demo composition + runner + operator panel'
    - phase: 05-render-system (05-11..05-21)
      provides: 'the ten UAT gap-closure rounds: melee stall fix, shake off + tighter framing + two-phase entry, operator scale ruler, faction-balanced battle centre + end debounce, single-phase pull-back + weight-aware follow, entry freeze, panorama hold, tempo tuning, army heading, empty-army filtering, post-battle aftermath hold'
    - phase: 01..04
      provides: 'the read-only surfaces the demo composes: IWorld, IControlSystem, IPhysicsWorld, IUnit'
provides:
    - '.planning/phases/05-render-system/05-UAT.md — the executed Chromium UAT record (environment, 53 per-item observations, calibration table, accepted/deferred deviations)'
    - 'D-01-aligned REND-05 and Phase 5 Goal / success criterion 5 / milestone overview bullet (no fps target anywhere)'
affects:
    [
        05-verify-work (this record is the manual evidence it audits),
        Phase 6 recording (canvas contract + camera behaviour are now evidence-backed),
        any later render tuning (the calibration table names the knob for each symptom)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 5389
    tasks: 2
    # Instrument-measured: git rev-list --count <plan_head_before>..HEAD, which covers
    # Task 2 + this plan's docs commit. Task 1's commit (c870fe5) predates the ledger
    # base because the 05-11..05-21 gap-closure rounds landed between the two tasks,
    # so the span alone understates the plan by one commit. Recorded explicitly below
    # rather than folded into a number the instrument cannot reproduce.
    commits: 2
    plan_head_before: b909cb67319ede57a32aa11c9716e7837ae28835
    task1_commit: c870fe5

tech-stack:
    added: []
    patterns:
        - 'UAT evidence is a table, not prose: every row carries scenario + expected + observed + evidence source, so a verdict can never stand without an observation (T-05-48)'
        - 'Where a numeric rule is unobservable by eye (450 output frames, 90% coverage) the row says so and cites the test that pins the number instead of inventing a measurement'
        - 'Symptom → knob mapping: the calibration table records old → new → the round that asked for it, so later tuning starts from the observation rather than the constant'

key-files:
    created:
        - .planning/phases/05-render-system/05-UAT.md
    modified:
        - .planning/REQUIREMENTS.md
        - .planning/ROADMAP.md
        - .planning/STATE.md

key-decisions:
    - 'REND-05 acceptance is D-01 wording only: Chrome 下能运行、不崩溃、能逐帧推进并输出 canvas，不设 fps 目标 — the old "可交互帧率" phrasing is gone from REQUIREMENTS and ROADMAP so no shipped acceptance text contradicts the locked decision'
    - 'The record states the environment honestly as Microsoft Edge 155.0.4283.62 (Chromium) on Windows 11 while naming Chrome as the target: the project only promises the Chromium target, and no Chrome-only API is used'
    - 'The UAT was run as ten observation→fix→re-review rounds; the record keeps the round table so each constant change is traceable to the complaint that produced it'
    - 'Remaining animation polish is recorded as an accepted deferral mapped to the CONTEXT Deferred Ideas, never to a locked decision, because the user said "这些优化后续再进行" after accepting the phase'
    - 'No fps number was measured, promised or asserted anywhere in the record, the requirements or the code — the one place a frame-rate bound exists (MAX_OUTPUT_FPS = 240) is documented as an input-validation limit, not a target'
    - 'Task 2 required no code change: every gap the UAT found had already been closed by 05-11..05-21, so the calibration table is a ledger of those changes rather than new edits'

patterns-established:
    - 'Presence-check-driven doc records: the plan pins the required evidence strings (REND-01..05, 1920, 15, 90%, classes=all, panel, Chrome, 全景, 自动) and a minimum table width, so a thin or gutted record fails the gate mechanically'
    - 'Honest evidence grading: an operator-only row and an operator+test row are labelled differently, so the verifier can see exactly which claims rest on the human and which on automation'

requirements-completed: [REND-01, REND-02, REND-03, REND-04, REND-05]

# Metrics
duration: 25min
completed: 2026-10-25
status: complete
---

# Phase 5 Plan 10: Chrome UAT + D-01 Documentation Sync Summary

**The phase now has auditable manual evidence instead of a conversation: `05-UAT.md` records 53 per-item Chromium observations for REND-01..REND-05 across the default scenario and `?classes=all`, a symptom→constant calibration table, and accepted/deferred deviations split against the CONTEXT — with zero fps numbers anywhere, because D-01 replaced the frame-rate target with "runs in Chrome, does not crash, advances frame by frame, yields a canvas"**

## Performance

- **Duration:** 25 min (this continuation session; Task 1 was executed in the earlier session)
- **Completed:** 2026-10-25
- **Tasks:** 2/2
- **Files modified:** 3 (1 created, 2 doc files amended by Task 1)

## Accomplishments

- **Task 1 (already committed as `c870fe5`):** `REQUIREMENTS.md` REND-05 and the `ROADMAP.md` Phase 5 `Goal` line, success criterion 5 and milestone overview bullet were re-worded to the locked D-01 reading — Chrome runs, does not crash, advances one output frame at a time, returns a canvas, **no fps target**. The same edit listed the ten plans on disk. The plan's own presence checks still print `DOC_SYNC_OK` (re-verified this session).
- **Task 2:** wrote `.planning/phases/05-render-system/05-UAT.md` — environment block, ten-round observation table, 53 per-item result rows, calibration table, deviations, gates and a conclusion that explicitly says the record is evidence and not a completion signal.
- Every REND requirement is covered by rows with observations: REND-01 (canvas `1920×1080`, 16:9 letterbox, clean console, canvas alive past 200 frames), REND-02 (2 faction colours, 5 default weapon silhouettes, 6/6 with `?classes=all`, both armours, dark-high-saturation palette, procedural geometry), REND-03 (bar for `15 × outputFps` frames, always-on below 6, upright world-scaled level, hybrid near/far bar scale, info bar = time + speed only, 1× in battle / 24× in peace), REND-04 (self-starting battle, ≥90% framing, teleport-free switching, 全景 persists while auto-follow is off, 自动/战斗 resumes, battle-end return, no units in panorama), REND-05/D-01 (200+ frames, pause/step/reset, canvas accessible, no fps target).
- The record also carries the D-06 feedback set, D-12 panel separation (canvas-only screenshot shows no panel pixels), D-14 marker semantics, D-22 variant, D-23 level placement and D-24 click-pick, plus the nine watchability fixes the operator asked for during the rounds.
- Gates re-run after the UAT: **534 tests / 46 files passed**, `typecheck` exit 0, `lint` 0 errors (2 pre-existing `no-console` warnings in `src/main.ts`), `vite build` succeeded.
- No production code changed in this plan. Every value the calibration table lists was already shipped by 05-12..05-21; Task 2 certified them rather than re-tuning them.

## Acceptance criteria → evidence

| Plan criterion | Where it is satisfied |
| --- | --- |
| Task 1: REND-05 states the D-01 acceptance; no shipped text claims an interactive frame rate | `REQUIREMENTS.md` REND-05 line; `DOC_SYNC_OK` re-verified |
| Task 1: Phase 5 Goal / success criterion 5 / overview bullet re-worded | `ROADMAP.md` Phase 5 section + milestone bullet |
| Task 1: plan list names 05-01..05-10 | `ROADMAP.md` Phase 5 Waves 1–8 |
| Task 2: `05-UAT.md` has an environment block and a per-item table covering REND-01..05 and D-06/D-12/D-21/D-22/D-23 | §1, §3.1–§3.9 |
| Task 2: automatic battle start + 全景 persists / 自动·战斗 resumes | V-17, V-20, V-21, V-22 |
| Task 2: every row has an observed value, failures classified | §3 (`Observed` + `Evidence` columns) + §5.1/§5.2/§5.3 |
| Task 2: REND-05 judged by D-01 only, no fps target recorded or implied | V-29, §1 帧率口径, §7 |
| Task 2: calibration confined to `DEFAULT_RENDER_CONFIG`/constants, locked rules asserted and green | §4 table + "未改动且被测试钉死的规则" list; 534 tests green |
| Task 2: full suite / typecheck / lint / build green after UAT | §6 |
| Task 2: canvas-only screenshot has no panel pixels | V-39 |
| Task 2: presence check prints `UAT_RECORD_OK` | ran in-session: `UAT_RECORD_OK` (13 required strings present, 240+ table pipes) |

## The ten UAT rounds this record captures

| Round | Operator observation | Closed by |
| --- | --- | --- |
| R2 | Hit shake hurt watchability; melee stalemate froze damage; transition too long; units too small | 05-11 (stall → disengage → charge), 05-12 (`shakeAmplitudePx = 0`, `minSpanMeters` 24 → 12, `panFrames`/`zoomFrames`) |
| R3 | No operator scale readout | 05-13 (`比例尺 100 m ≈ N px · 网格 100 m`) |
| R4 | Battle "ended" right after contact; low-HP retreat made fights unending | 05-14 (faction-balanced centre, `BATTLE_END_DEBOUNCE_TICKS = 10`, retreat deleted) |
| R5 | Camera jumpy in a growing battle; pull-back detoured via the map centre | 05-15 (single-phase exit, `weightScale = 20`) |
| R6 | Entry choreography should show the battlefield first | 05-16 `BATTLE_ENTRY_FREEZE_FRAMES = 24`, 05-17 (the freeze renders the panorama) |
| R7 | Combat pace too slow | 05-18 (gain 4→8, attack 12→16, approach 6→8, disengage 8→10) |
| R8 | Panoramic arrow did not match travel | 05-19 (`advanceArmyCenter` returns the actual reflected direction) |
| R9 | Ghost arrows / "0" for wiped-out armies | 05-20 (filter markers, vision, briefs, operator list; keep D-05 identity) |
| R10 | Battle-end cut straight to 24× | 05-21 (90 aftermath + 24 pull-back ticks at 1×, 90 runner frames of retained target) |
| R11 | **Accepted:** "比之前好多了……本阶段的基本目标已经完成，这些优化后续再进行" | — |

## Task Commits

1. **Task 1: Align REND-05 and the Phase 5 plan list with the locked D-01 decision** — `c870fe5` (docs)
2. **Task 2: Run the Chrome UAT, calibrate through the single tuning entry, and record the evidence** — `1368882` (docs)

**Plan metadata:** the docs commit that follows this SUMMARY (SUMMARY + STATE.md + ROADMAP.md).

_Note: no TDD tasks in this plan; `tdd_mode` is off for the project._

## Files Created/Modified

- `.planning/phases/05-render-system/05-UAT.md` (**created**, 262 lines) — the phase's manual evidence: frontmatter (phase/plan/status/environment/scenarios/gates), environment section, ten-round table, 53 result rows across six requirement groups plus markers/feedback/panel/battle-quality, calibration table (15 constants, old → new → reason), deviations split accepted (6) / deferred (6, each mapped to a CONTEXT Deferred Idea) / escalations (none), gate results and conclusion.
- `.planning/REQUIREMENTS.md` (Task 1) — REND-05 re-worded to the D-01 acceptance; checkbox and traceability row untouched.
- `.planning/ROADMAP.md` (Task 1, plus this plan's progress update) — Phase 5 `Goal`, success criterion 5, overview bullet, ten-plan list and progress row.

## Calibration (all confined to the single tuning entry)

15 values moved during the rounds, all in `src/render/constants.ts`, `src/control/constants.ts`,
`src/kingdom/constants.ts` or `src/demo/runner.ts`; the full table with reasons is §4 of `05-UAT.md`.
Locked rules were **never** touched: `healthBarSeconds = 15`, `alwaysVisibleBelowUnits = 6`,
`damageNumberThreshold = 50`, `camera.coverage = 0.9`, `hud.screenScaleAt (20) > hud.worldScaleAt (10)`,
`outputFps = 30` / `frameDelayMs = 33`. No test was weakened, skipped or deleted to accommodate a
new number — the constants test still pins 15 s / 6 units / 50 damage / 0.9 coverage / threshold
ordering, and `05-18` proved the AI contracts by re-running assertions that multiply the imported
`DEFAULT_AI_*` constants rather than hardcoding old values.

The one contract edit during the whole UAT period was `ICameraConfig.switchFrames → panFrames + zoomFrames`,
pre-approved by the user on 2026-10-24 (05-12). `src/render/types.ts` has no other change.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] The plan's own ledger base could not cover Task 1**
- **Found during:** Task 2 (SUMMARY measurement)
- **Issue:** The plan's two tasks are separated in time by the ten gap-closure rounds (05-11..05-21), because Task 1's documentation sync was committed before the UAT discovered gaps. A single `plan_head_before` therefore cannot span both tasks: a base before `c870fe5` would sweep in ~40 unrelated commits, and a base at HEAD measures only Task 2.
- **Fix:** Recorded the ledger at the current HEAD (`b909cb6`) so `commits: 2` is reproducible by `git rev-list --count`, and recorded Task 1's commit explicitly as `actuals.task1_commit: c870fe5` with the reason, instead of narrating a number the instrument cannot reproduce.
- **Files modified:** none (measurement-only)
- **Verification:** `git rev-list --count b909cb6..HEAD` = the number reported after the metadata commit; `c870fe5` is confirmed an ancestor of HEAD and its diff is `REQUIREMENTS.md` + `ROADMAP.md` only.
- **Committed in:** recorded in this SUMMARY

### Plan-text adjustments (recorded, not silently absorbed)

**1. `?classes=all` does not add the armours**
- **Found during:** Task 2 (writing V-08)
- **Issue:** The plan's human-check step 8 asks the operator to confirm "the Hammer weapon plus both Helmet and Shield" with `?classes=all`, implying the armours are variant-only. They are not: the default scenario already fields a Shield (Swordsman) and a Helmet (Archer). The variant's real contribution is the 6th weapon.
- **Resolution:** V-07 records the variant as the thing that makes it **6/6 weapons**; V-08 records both armours as already visible in the default scenario and still distinguishable under the variant. Neither row claims more than was observed.
- **Files modified:** `05-UAT.md` only
- **Committed in:** `1368882`

**2. Observable-vs-pinned distinction**
- **Found during:** Task 2 (evidence grading)
- **Issue:** Two REND-03/REND-04 rules are not humanly measurable — "exactly `15 × outputFps` = 450 output frames" and "≥90% of combatants inside the frame". Asserting an eyeballed count would have manufactured evidence.
- **Resolution:** Those rows state what the operator actually saw (the bar persists ~15 s of output time and then vanishes; no combatant falls outside the frame) and cite `tests/render/hud-model.test.ts` / `tests/render/camera-math.test.ts` for the exact number, via the `Evidence` column (`operator` vs `operator + <test>`).
- **Files modified:** `05-UAT.md`
- **Committed in:** `1368882`

### Architecturally significant deviations

None. No new module, table, dependency or contract change.

## Issues Encountered

- `pnpm lint` reports 2 pre-existing `no-console` warnings in `src/main.ts` (debug logging added in 05-09). They are warnings, not errors, and out of this plan's scope — recorded here, not fixed.
- PowerShell 5.1 mangles UTF-8 when printing file contents to the console (`比例尺` renders as mojibake), which made grep-style reading of the Chinese sources unreliable. Worked around by using the file-read tool for content and node scripts for the presence checks; no file was written through the mangling path.
- Untracked at commit time and intentionally left alone: `.gsd/`, `.planning/milestone.lock`, `.planning/state.json`, `.planning/v1-MILESTONE-AUDIT.md`.

## User Setup Required

None. The demo is served by the operator's own `pnpm dev` on port 8074; the executor did not start or
stop any long-lived server, per the project's environment convention.

## Known Stubs

None. `05-UAT.md` is a documentation artifact with no runtime surface, and no code was changed by this plan.

## Threat surface scan

No new network endpoint, auth path, file-access pattern or trust boundary. The only new artifact is a
Markdown record under `.planning/`. The plan's two relevant threat mitigations are satisfied:
T-05-48 (no verdict without an observation — enforced by the table shape and re-checked by the
presence check) and T-05-49 (calibration cannot silently break a locked rule — locked values are listed
as unchanged and the full suite is green).

## Next Phase Readiness

- Phase 5 is ready for `/gsd-verify-work`: `05-UAT.md` is the manual evidence for REND-01..REND-05, the
  suite is green (534 tests), and `typecheck` / `lint` / `build` all pass.
- Phase 6 can take `IRenderer.renderFrame()` + `getCanvas()` (D-18) and `ICamera.setBattleTarget` (D-15)
  as given; the entry freeze, the post-battle 1× aftermath and the single-phase pull-back are all
  frame-counted, so a segment boundary should read `camera.getMode()` rather than guess a frame number.
- Deliberately left for later (user-deferred, mapped to the CONTEXT Deferred Ideas): further animation
  polish, performance work beyond the basic culling/pooling, intensity scoring, sequential battle
  playback, full debug intervention, kill statistics.
- The phase is **not** marked complete by this plan — completion is the verifier's call (T-05-51).

## Self-Check

- `.planning/phases/05-render-system/05-UAT.md` — FOUND
- `.planning/phases/05-render-system/05-10-SUMMARY.md` — FOUND
- `.planning/REQUIREMENTS.md` REND-05 aligned with D-01 — FOUND (`DOC_SYNC_OK`)
- `.planning/ROADMAP.md` Phase 5 Goal / criterion 5 / overview bullet — FOUND (`DOC_SYNC_OK`)
- `UAT_RECORD_OK` presence check — PASSED
- commit `c870fe5` (Task 1) — FOUND
- commit `1368882` (Task 2) — FOUND
- `src/render/types.ts` changed only by the pre-approved `switchFrames → panFrames + zoomFrames` (05-12) — confirmed

**Self-Check: PASSED**

---

*Phase: 05-render-system*
*Completed: 2026-10-25*
