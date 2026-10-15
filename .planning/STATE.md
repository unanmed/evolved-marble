---
gsd_state_version: "1.0"
current_phase: 1
current_phase_name: Foundation & Deterministic Sim Core
status: executing
stopped_at: Completed 01-08-PLAN.md (WR-04 ESLint boundary covers src/config + WR-05 dangling coverage removed)
last_updated: "2026-10-15T13:59:58.146Z"
last_activity: 2026-10-15
last_activity_desc: Phase 1 execution started
state_head: 19dbb537187e4fbaf50827f131e7874d03a5dc29
progress:
  total_phases: 6
  completed_phases: 0
  total_plans: 12
  completed_plans: 7
  percent: 0
---

# Project State

## Project Reference

See: .planning/PROJECT.md (updated 2026-10-15)

**Core value:** 战斗必须激烈好看 (battles must be intense and visually appealing)
**Current focus:** Phase 1 — Foundation & Deterministic Sim Core

## Current Position

Phase: 1 (Foundation & Deterministic Sim Core) — EXECUTING
Plan: 4 of 12
Status: Ready to execute
Last activity: 2026-10-15 — Phase 1 execution started

Progress: [░░░░░░░░░░] 0%

## Performance Metrics

**Velocity:**

- Total plans completed: 0
- Average duration: 0 min
- Total execution time: 0.0 hours

**By Phase:**

| Phase | Plans | Total | Avg/Plan |
|-------|-------|-------|----------|
| - | - | - | - |

**Recent Trend:**

- Last 5 plans: —
- Trend: —

*Updated after each plan completion*
**Per-Plan Metrics:**

| Plan | Duration | Tasks | Files |
|------|----------|-------|-------|
| Phase 1 P01 | 11 | 2 tasks | 30 files |
| Phase 1 P02 | 6 | 1 tasks | 11 files |
| Phase 1 P03 | 11 | 3 tasks | 12 files |
| Phase 1 P4 | 7 | 3 tasks | 11 files |
| Phase 1 P5 | 12 | 3 tasks | 4 files |
| Phase 1 P6 | 18 | 2 tasks | 17 files |
| Phase 1 P08 | 3 | 2 tasks | 2 files |

## Accumulated Context

### Decisions

Decisions are logged in PROJECT.md Key Decisions table.
Recent decisions affecting current work:

- Milestone 1: Scope is the tactical combat layer only; kingdom/economy, LLM commander/director, and RL control are out of scope (interfaces reserved).
- Roadmap structure: determinism (Phases 1–2) is proven before any I/O or rendering attaches.
- Phase 2: pin the Rapier2D **deterministic** build (resolve `-deterministic` vs `-compat` + `enhanced-determinism` via a cross-machine golden-hash spike; settle pixel↔meter scale).
- [Phase 1]: TS7 removed baseUrl: the @/* -> src/* alias is expressed as a relative paths entry (./src/*); baseUrl dropped.
- [Phase 1]: Phase 1 removed only the TS predecessor tree (src/** + index.html); model/ + requirements.txt deferred to the Python-rebuild phase (tsc never checks them).
- [Phase 1]: [Phase 1]: A minimal but genuinely state-mutating movementSystem is a labelled Phase-1 stand-in (A1) so the SIM-04 fingerprint gate is non-vacuous.
- [Phase 1]: [Phase 1]: movementSystem nudge scale set to 0.05 (not 0.001) — 0.001 is below the 1/256 fingerprint quantization grid and would make the gate vacuous.
- [Phase 1]: [Phase 1]: Fingerprint is a non-cryptographic diagnostic (cyrb53 over canonical quantized bytes), never a security token.
- [Phase 1]: [Phase 1]: Base tsconfig rootDir widened from src to . so tests/ is under rootDir under TS7; tsconfig.sim.json still narrows to src.
- [Phase 1]: [Phase 1]: Command intake is a total function — submit() accepts readonly unknown[] and validates at runtime, dropping+counting unknown kind/missing fields (T-01-05); commands drain exactly once at the TOP of step().
- [Phase 1]: [Phase 1]: MOVEMENT_NUDGE_SCALE moved to content/formulas.ts (D-06 single source); torque/weaponAbility/unitAbility/spawn and damage/kill/levelup/contact are reserved, wired-but-inert contract surfaces (emit events, never silent no-ops).
- [Phase 1]: [Phase 1]: sim/** headless boundary is enforced twice — ESLint sim/** block (no-restricted-imports/globals/properties/syntax) plus the DOM-free tsconfig.sim.json; Math global NOT banned (D-02 allows sin/cos), only Math.random.
- [Phase 1]: Serialization scope = clock + seeded RNG + entities; the command queue and event log are per-tick transient input/output and are excluded as non-future-affecting state at a quiescent point.
- [Phase 1]: Named RNG streams serialize in dictionary-sorted order so canonical bytes are independent of RandomStreams construction order; deserializeState rebuilds the facade from decoded names and restores exact (non-quantized) integer states.
- [Phase 1]: A quantized snapshot is an approximate restart: the round-trip invariant is fingerprint/byte identity, 'restore + re-step matches original' is asserted within one QUANT_GRID, and two restores of the same snapshot re-step exactly.
- [Phase 1]: Determinism gate is same-machine only (D-09), no CI; .gitattributes pins LF under .githooks/ so core.autocrlf=true cannot CRLF the shebang and silently disable the gate.
- [Phase 1]: The snapshot VERSION is bumped 1 -> 2 because the canonical byte layout gains the entity-id cursor; the version guard throws 'unsupported version' and no v1 migration path was added (no snapshot is persisted this phase).
- [Phase 1]: EntityStore.restore(entries, nextId?) adopts the serialized id cursor when supplied and falls back to max(id)+1 only when omitted; ids are never reused across a despawn->snapshot->restore->spawn round-trip (D-05, CR-01).
- [Phase 1]: quantize() throws a deterministic int32-range error rather than silently wrapping setInt32 (WR-03); applyCommands() has a never-typed exhaustiveness guard so an unhandled Command variant is a compile error, not a silent no-op (WR-02).
- [Phase 1]: Command/event kinds became numeric enums with a fixed ordinal (CommandKind: Force=0, Torque=1, WeaponAbility=2, UnitAbility=3, Spawn=4; SimEventKind: Command=0, Rejected=1, Damage=2, Kill=3, Levelup=4, Contact=5), preserving the existing switch grouping and reserved branches.
- [Phase 1]: isKnownKind now accepts only numeric enum values (typeof number + membership); strings, NaN and unknown numbers stay deterministically rejected and counted - the reject+count contract (T-01-05) is unchanged.
- [Phase 1]: Renamed interfaces gain the mandatory I prefix (IRngStream, IUnitComponents, IEntitySnapshot, IStepTarget, IRunLoopConfig, IBattleSimConfig, ISimState, IRunTraceOptions); non-interface/enum aliases (EntityId, RngState, Command, SimEvent, ValidateResult) keep their names per the plan.
- [Phase 1]: IUnitComponents was split into named IUnitAttrs/IUnitXform (D-16); the mocked performance global and the snapshot mutator case became named interfaces (IPerformanceStub/IPerformanceGlobal, IMutatorCase).
- [Phase 1]: D-13 landed as one globally-atomic task (interface-first classes, no class-as-type) because TypeScript cannot compile a half-renamed type graph; the pre-commit hook (lint + determinism gate) stays green after each task.
- [Phase 1]: The retrofit is byte-for-byte behavior-preserving: the fixed-seed fingerprint trace (12 ticks, seed 12345, final ed670b76a9019) is identical before and after.
- [Phase 1]: [Phase 1]: The ESLint headless boundary block files selector now covers ['src/sim/**/*.ts','src/config/**/*.ts'], matching tsconfig.sim.json's DOM-free include, so Date/Math.random in a config module are lint errors too (WR-04, D-03/SIM-03).
- [Phase 1]: [Phase 1]: The dangling vitest coverage block was deleted (not installed): it referenced undeclared @vitest/coverage-v8 and backed no test:coverage script; coverage can be re-introduced deliberately with provider dependency + script together (WR-05, D-08).

### Pending Todos

None yet.

### Blockers/Concerns

- **Determinism must be verified, not assumed** — Rapier guarantees determinism only of what is fed to it. Golden-hash gate must run in CI and across machines from Phase 1–2.
- **Watchability is a Core Value risk** — behavior-tree AI can produce degenerate/stalemate battles (0 damage); anti-stall invariants + automated watchability audit are gating criteria in Phase 4.
- **Spec numbers are reference-only** — damage/XP/stat values need empirical calibration (velocity threshold so `√Δv − 1 > 0` at typical closing speeds).

## Deferred Items

Items acknowledged and deferred at milestone close, most recent first:

| Category | Item | Status | Deferred At | Milestone |
|----------|------|--------|-------------|-----------|
| *(none)* | | | | |

## Session Continuity

Last session: 2026-10-15T13:59:30.262Z
Stopped at: Completed 01-08-PLAN.md (WR-04 ESLint boundary covers src/config + WR-05 dangling coverage removed)
Resume file: None
