---
phase: "04"
slug: "kingdom-system"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 04 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| scenario table → simulation | User-editable faction/city/army/unit/terrain data crosses into physics + kingdom state | ids, coordinates, dimensions, counts |
| commander / injected strategies → tick | Injected `ICommander`, `UnitWeight`, `GarrisonSelector` run inside the tick loop | orders, weights, unit-id selections |
| vision query → commander | Reduced briefs expose only what 100 m / 150 m vision grants | positions, faction, state, kind |
| battle membership → damage sink | Only same-battle, in-area, cross-team hits mutate units | damage contexts, unit references |
| frozen contracts → implementation | Phase 1/2/3 type files are additive-only seams | interface declarations |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-04-01 | Tampering | `validateScenario` / `KingdomWorld` constructor / `addStaticObstacle` | high | mitigate | Finite/positive bounds, unique integer ids, faction refs, in-bounds positions, positive geometry, spawn-disk clearance, unit/army ceilings; obstacle spec re-validated before Rapier mutation (`scenario.ts`, `KingdomWorld.ts`, `PhysicsWorld.ts`). | closed |
| T-04-02 | Tampering / DoS | injected `UnitWeight` / `GarrisonSelector` / `ICommander.decide` | high | mitigate | Each injected call is isolated; weights clamp to finite positive 1; selector results filtered/deduped/capped; commander factory, decide and each order are try/catch isolated. | closed |
| T-04-03 | Tampering / DoS | `IArmyOrder` targets + `afterMinutes`; city training loop | high | mitigate | `issueOrder` validates army, enum kind, finite/non-negative `afterMinutes`, in-bounds target, `cityId`; training pauses at garrison cap + `MAX_SCENARIO_UNITS`, one unit per substep. | closed |
| T-04-04 | Tampering / DoS | `ICity` training progress / `ICommander.decide` output | high | mitigate | `applyCommanderOrder` re-validates faction ownership, army, roster, kind, existing order; per-order try/catch + `MAX_SCENARIO_ARMIES`; training capped. | closed |
| T-04-05 | Tampering / DoS | unit id ownership; battle/completed event buffers | medium | mitigate + accept | Monotonic non-reused unit/battle ids; duplicate registration rejected; event-buffer and completed-list growth accepted (see Accepted Risks). | closed |
| T-04-06 | Tampering / design integrity | frozen `types.ts` files | high | mitigate | Phase 4 implementation made no contract edits; only the approved additive seams (`IHealableUnit`, `IStaticObstacleWorld`, `setUnitAI`) exist; compile-time pins enforce the frozen member sets. | closed |
| T-04-07 | Repudiation | battle playback ordering | low | accept | Events carry game-minute timestamps and `mergedIntoBattleId`; ordering is recorded, but no determinism/replay guarantee is claimed (project decision). | closed |
| T-04-08 | Information Disclosure | `getVisibleArmies` / `getVisibleCities` / `ICommanderContext` enemy slots | high | mitigate | Queries return only reduced `IVisibleArmyBrief` / `IVisibleCityBrief`; roster, order, training, garrison internals unreachable; exact key sets pinned at compile time and asserted at runtime. | closed |
| T-04-09 | DoS / lifetime | `IControlSystem.setUnitAI` + provider ownership | high | mitigate | Unknown id throws before mutation; previous instance destroyed once; injected instance owned then released exactly once; `dispose` releases all provider-owned instances. | closed |
| T-04-10 | Tampering | battle membership vs damage scope | high | mitigate | One-to-one membership map; live-position area checks on prune/leave/join; merge reassigns membership; sink enforces same battle + same-team filter + live bodies. | closed |
| T-04-11 | Tampering | static obstacle geometry | medium | mitigate | Invalid specs throw before Rapier mutation; obstacle colliders have no active collision events and no tag-index entry, so they never appear as combatants. | closed |
| T-04-12 | Tampering | `Unit.heal` input | medium | mitigate | Rejects non-finite/non-positive amounts; refuses revive; clamps to modifier-adjusted maximum. | closed |
| T-04-13 | Tampering | boundary walls / dispose | medium | mitigate | Terrain and wall ids tracked separately; walls never returned by `getTerrain()`; `dispose` removes only world-owned obstacles. | closed |
| T-04-14 | DoS | healing loop | low | mitigate | One bounded heal per substep (`rate/60`), battle-participation check first, clamp inside `Unit.heal`. | closed |
| T-04-15 | Tampering | settlement ownership + roster partition | medium | mitigate | Single `transferCityOwnership` helper updates city + both faction lists, clears loser garrison link/state, never calls `updateTeam`; garrison selection creates a new army and removes selected ids from every other roster; roster totals asserted. | closed |
| T-04-SC | Supply chain | package installs | high | mitigate | No new packages; `@dimforge/rapier2d-compat` pinned 0.21.0, lockfile resolves 0.21.0. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` count toward threats_open*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-04-01 | T-04-07 | No determinism/replay; playback ordering records timestamps/merge ids only. | User (project decision) | 2026-10-21 |
| AR-04-02 | T-04-05 | `BattleSystem` lifecycle event buffer grows until `drainEvents()`; finite session scale, Phase 6 drains per frame. | User (project decision) | 2026-10-21 |
| AR-04-03 | T-04-05 | Completed-battle list grows with session length; consumed by Phase 6. | User (project decision) | 2026-10-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 16 | 16 | 0 | gsd-security-auditor |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
