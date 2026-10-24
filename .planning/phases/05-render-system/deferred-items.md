# Phase 05 — Deferred Items

Out-of-scope findings recorded during plan execution. Not fixed here.

## 05-15 (direct pull-back + weight-aware follow)

- **Flaky pre-existing statistical test:** `tests/units/spawn-normal.test.ts` — one of
  the sampling-tolerance assertions (`mean is within 2% …` / `standard deviation is
  within 5% …`, `toBeCloseTo` on a randomly seeded `IRng` sample) failed once during a
  full `pnpm test` run on 2026-10-24 and passed on the immediate re-run and on the two
  other full runs in the same session. It lives in `tests/units/**`, is unrelated to
  `src/render/**`, and pre-dates this plan. Suggested fix (separate task): pin the RNG
  seed / raise the sample size so the tolerance assertions are deterministic.
