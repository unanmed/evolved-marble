<!-- refreshed: 2026-10-15 -->
# Testing Patterns

**Analysis Date:** 2026-10-15

## Status: No Test Suite Configured

**This repository has no automated test suite of any kind.** This is a finding, not an
omission in this document. Every section of the standard template below is accounted for, but
most are "Not applicable" because the underlying machinery does not exist.

Evidence gathered across the full repository:

- **No test runner dependency.** `package.json` (`F:\github-ai\evolved-marble\package.json`)
  lists only `dev`, `build`, and `preview` scripts and declares no `vitest`, `jest`, `mocha`,
  `ava`, `node:test`, `cypress`, `playwright`, or `@testing-library/*` dependency.
  `requirements.txt` lists only `ray`, `numpy`, `pettingzoo`, `gymnasium`, `websockets`, `flask`
  — no `pytest`, `unittest` add-ons, or `hypothesis`.
- **No test config file.** No `vitest.config.*`, `jest.config.*`, `cypress.config.*`,
  `playwright.config.*`, `pytest.ini`, `tox.ini`, `conftest.py`, or `pyproject.toml` exists.
- **No test files.** A repository-wide search for `*.test.*` / `*.spec.*` (`.ts`, `.tsx`, `.js`,
  `.jsx`, `.py`) and for `tests/` / `test/` directories returned nothing.
- **No test script.** `package.json` has no `test` field (only `dev`, `build`, `preview`).
- **No coverage tooling or thresholds** anywhere (no `.nycrc`, no `coverage` config, no
  `--coverage` scripts).
- **No CI pipeline.** `.github/` does not exist; there is no `.gitlab-ci.yml`, `azure-pipelines.yml`,
  or other CI config, so no tests are run automatically.
- **No documented testing procedure.** `README.md` documents only two manual workflows
  (`pnpm dev` to run the client, `python -m model.train` to train) and says nothing about tests.

## Test Framework

**Runner:**
- Not applicable — none installed.

**Assertion Library:**
- Not applicable — none installed.

**Run Commands:**
```bash
# No test command exists. The only available package.json scripts are:
pnpm dev      # start the Vite dev server
pnpm build    # tsc && vite build
pnpm preview  # preview the production build
```

## Test File Organization

**Location:**
- Not applicable — no test files exist.

**Naming:**
- Not applicable.

**Structure:**
- Not applicable. A logical target layout, if tests are introduced, would follow the existing
  source structure:
  - Frontend: co-located `*.test.ts` next to `src/**` modules, or a top-level `src/**/__tests__/`.
  - Python: a `model/tests/` or `tests/` directory with `test_*.py` modules and a `conftest.py`.

## Test Structure

**Suite Organization:**
- Not applicable — no suites exist.

**Patterns:**
- Not applicable.

## Mocking

**Framework:**
- Not applicable — no mocking library is installed.

**What to Mock:**
- Not applicable in the current state. Note for future work: the code is tightly coupled to
  external side effects that would need mocking/isolation —
  - Browser globals used at module load: `WebSocket` (`src/train/manager.ts:158`,
    `src/utils/upload.ts:9`), `requestAnimationFrame` (`src/train/manager.ts:77`),
    `Image` / `<canvas>.toBlob` (`src/scene/sword1v1/scene.ts:48`, `src/utils/record.ts:32`),
    `devicePixelRatio` (`src/renderer.ts:14`).
  - The `@motajs/client` rendering runtime (`MotaRenderer`, `UIController`, `GameUI`,
    `MotaOffscreenCanvas2D`) and `planck-js` `World`.
  - Python: the WebSocket transport (`model/ws.py`) and the `ffmpeg` subprocess
    (`model/frame.py`) run as side effects of import/start.

**What NOT to Mock:**
- Not applicable.

## Fixtures and Factories

**Test Data:**
- Not applicable — no fixtures or factories exist.

**Location:**
- Not applicable.

## Coverage

**Requirements:** None enforced. No coverage tool, config, or CI gate exists.

**View Coverage:**
```bash
# No coverage command exists.
```

## Test Types

**Unit Tests:**
- None. Pure-ish logic that would be natural unit-test targets (for future reference):
  - Reward shaping and observation normalization in
    `src/train/sword1v1/train.ts` (`onReset`, `actionTick`, `onTick`).
  - Helmet polygon generation `createHelmetShape` (`src/scene/sword1v1/scene.ts:210`).
  - Damage calculation `attack` (`src/scene/sword1v1/scene.ts:371`).
  - Event-emitter wiring in `src/utils/excite.ts`, `src/utils/record.ts`.

**Integration Tests:**
- None. The client ↔ Python WebSocket protocol (`src/train/manager.ts` ↔ `model/ws.py`,
  `model/env.py`) and the frame-recording path (`src/utils/upload.ts` ↔ `model/frame.py`) are
  the highest-value integration seams and are entirely untested.

**E2E Tests:**
- None. No Playwright/Cypress present. The app is only exercised manually via `pnpm dev` +
  `python -m model.train` (see `README.md`).

## Common Patterns

**Async Testing:**
- Not applicable.

**Error Testing:**
- Not applicable.

## Recommended Path to Add Tests

If a testing phase is planned, the least-friction setup given this stack:

1. **Frontend (TypeScript/Vite/Vue):** add `vitest` as a devDependency; it reuses
   `vite.config.ts` (including the `@` → `src` alias) and needs no separate config for the
   default case. For DOM/canvas-dependent code add `jsdom` or `happy-dom` and `@vue/test-utils`.
   Keep tests out of the existing `tsconfig.json` `include` (`["src"]`) or add a
   `tsconfig.test.json` so `noEmit`/`strict` type-checking still applies.
2. **Python (`model/`):** add `pytest` to a dev requirements file; write `model/tests/test_*.py`.
   The `EvolvedMarbleEnv` (`model/env.py`) depends on the `ws` singleton
   (`model/ws.py`), so tests must inject a fake transport (e.g. monkeypatch
   `model.ws.ws.send_and_receive`) rather than opening a real socket.
3. **Wire a script:** add `"test": "vitest run"` to `package.json` scripts, and document
   `pytest` in `README.md`, so a CI job (also currently absent) has something to invoke.
4. **CI:** add a minimal GitHub Actions workflow to run `pnpm build`, `pnpm test`, and `pytest`,
   since no CI exists today.

---

*Testing analysis: 2026-10-15*
