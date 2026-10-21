---
phase: "5"
slug: "render-system"
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-21"
---

# Phase 5 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 (`package.json:26`) |
| **Config file** | `vitest.config.ts` — `environment: 'node'`, `include: ['tests/**/*.test.ts']`, `@` → `src` |
| **Quick run command** | `pnpm vitest run tests/render` |
| **Full suite command** | `pnpm test` + `pnpm typecheck` + `pnpm lint` |
| **Estimated runtime** | ~30–90 seconds (full suite; Pixi is browser-only, not loaded in Vitest) |

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` plus the narrowest relevant command (`pnpm vitest run tests/render/<file>` for pure modules).
- **After every plan wave:** Run `pnpm test` + `pnpm typecheck` + `pnpm lint`.
- **Before `/gsd-verify-work`:** Full suite must be green; Chrome manual UAT checklist complete.
- **Max feedback latency:** ~90 seconds (Node/Vitest); Chrome UAT is manual and outside this budget.

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| TBD | Round 1 | 1 | REND-01..05 (contract) | T-5-01 | Render config validation rejects non-finite/negative sizes and frame delays | contract | `pnpm vitest run tests/render/types.test.ts` + `pnpm typecheck` | ❌ W0 | ⬜ pending |
| TBD | Round 2 | 2 | REND-02 | T-5-02 | Visual specs map every class to valid weapon/armor enum values; no string/unknown enum injection | unit | `pnpm vitest run tests/render/visual-spec.test.ts` | ❌ W2 | ⬜ pending |
| TBD | Round 2 | 2 | REND-03 | T-5-03 | Health ratio clamps to [0,1]; HUD timers use frame counts; calendar handles boundaries | unit | `pnpm vitest run tests/render/hud-model.test.ts tests/render/calendar.test.ts` | ❌ W2 | ⬜ pending |
| TBD | Round 2 | 2 | REND-04 | T-5-04 | Camera fit keeps ≥90% of finite participant points in the target viewport; no NaN/infinite transform | unit | `pnpm vitest run tests/render/camera-math.test.ts` | ❌ W2 | ⬜ pending |
| TBD | Round 2 | 2 | REND-05 | T-5-05 | Culling/clipping never emits non-finite coordinates; frame model handles empty scenes | unit | `pnpm vitest run tests/render/frame-model.test.ts` | ❌ W2 | ⬜ pending |
| TBD | Round 2 | 2 | REND-01/03/05 | T-5-06 | Damage tap validates ids and never mutates the inner sink result; death position captured before removal | unit + integration | `pnpm vitest run tests/render/damage-tap.test.ts` + `tests/demo/composition.test.ts` | ❌ W2/W4 | ⬜ pending |
| TBD | Round 2 | 4 | REND-01..05 | T-5-07 | Runner pause/step/reset/delay is deterministic; no unbounded timer leak | integration | `pnpm vitest run tests/demo/runner.test.ts` | ❌ W4 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `pixi.js@8.22.0` installed with exact pin (`pnpm add -E`), preceded by `checkpoint:human-verify` (supply-chain SUS signal).
- [ ] `tests/render/` directory (Round 2: `tests/render/fakes.ts` — fake `IUnit`, `IUnitState`, `IDamageSink`, narrow `IPhysicsWorld`).
- [ ] `tests/render/types.test.ts` — Round 1 enum pins + `expectTypeOf` contract assertions.
- [ ] `tests/demo/` — Round 2 runner + composition tests.
- [ ] `package.json` gains `dev` (and optionally `build`) scripts — Round 2.
- [ ] Do **not** change `vitest.config.ts` or `tsconfig.json`; existing config already covers `tests/**` and `@`.

*Existing infrastructure covers all non-render tests; PixiJS is the only new install.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| PixiJS canvas renders at 1920×1080 and CSS-scales centered | REND-01 | WebGL cannot run in Vitest `node` env | `pnpm dev` → Chrome; assert canvas `width=1920`, `height=1080`, no console errors, 16:9 letterboxing on resize |
| Units/weapons/armors/factions visually distinguishable | REND-02 | Shape/color perception is visual | Default scenario: 2 faction colors, 5 visible weapons; `?classes=all`: all 6 weapons + helmet/shield visible |
| HUD bars/levels behave per frame rules | REND-03 | Requires real render loop | Damage a unit → bar appears for exactly `15 × outputFps` frames; <6 living units → bars always on; level upright and world-scaled |
| Camera fit and smooth transitions | REND-04 | Needs real viewport/zoom | In battle, pause and count ≥90% combatants in frame; switch battle/strategic and confirm no teleport; battle end returns to strategic |
| Chrome runs without crashing / canvas accessible | REND-05 (D-01) | Performance/stability is environment-specific | Run 200+ frames at 16/32 units; pause/step/reset; `getCanvas()` non-null; no crash (FPS not gated) |
| Operator panel is outside canvas | D-12 | DOM vs canvas separation | Screenshot canvas only; confirm no panel pixels; buttons and MoveTo click-pick work |

*If none: "All phase behaviors have automated verification."*

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 90s
- [ ] `nyquist_compliant: true` set in frontmatter after execution validation

**Approval:** pending
