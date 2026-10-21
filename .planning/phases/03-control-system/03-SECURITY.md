---
phase: "03"
slug: "control-system"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 03 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| AI plugin → `ControlSystem` | `IUnitAction` values are untrusted data returned by a replaceable plugin; `ControlSystem` is the sole execution boundary that validates and clamps them (ASVS V5) | forces, torques, skill intents |
| AI plugin → physics (actuator exit) | Force/torque application is the only actuator exit; an unclamped extreme value could eject a unit from the world | net force vector, torque |
| `ISensingWorld` → `Sensor` | The world supplies ray distances, blockers and projectile sightings; malformed lengths, `NaN`, or out-of-range values cross into the observation | 64 ray distances, projectile coordinates |
| Physics events → `IDamageSink` | `IDamageEvent`s and resolved `IUnit` references cross into upper-layer battle rules; a throwing sink could otherwise abort the tick loop | damage events, unit references |
| provider lifecycle → `ControlSystem` | `create`/`destroy` are plugin code; a throw here can leave registration or deregistration half-done | unit ids, AI instances |
| AI → observation | The default AI must not mutate physics or units; it consumes a pure snapshot only | `IUnitObservation` |
| type contract → consumer phases / AI plugins | A wrong contract shape ripples to every unit AI and Phase 4 (design risk) | interfaces, numeric enums |

*In-process only: no network, secrets, auth surface, persistence, or package installs.*

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-03-01 | Tampering | `IUnitAction` (AI output values) | low | mitigate | Contract constrains forces/torques to non-negative magnitudes and declares the composition rule; round 2 implements the clamp point in `ControlSystem.sanitizeAction` / `composeAction`. | closed |
| T-03-02 | DoS | buggy/malicious `IUnitAI.decide` | low | mitigate | `decide` stays a pure synchronous snapshot→action function; `ControlSystem` wraps it in try/catch with an all-zero action fallback, so a throwing plugin cannot crash the tick loop. | closed |
| T-03-03 | Tampering / design integrity | type module drifting into runtime / frozen-contract edits | low | mitigate | `src/control/types.ts` is declaration-only (one numeric enum + interfaces + union); verified unchanged since its type-gate commit; `pnpm typecheck` green and the blocking human review gate approved it. | closed |
| T-03-SC | Supply chain | package installs | high | mitigate | Zero new dependencies in Phase 3; the pinned Rapier package was gated in Phase 2; no install task exists. | closed |
| T-03-04 | Tampering | `IUnitAction` from a plugin | high | mitigate | `sanitizeAction` shape-validates before property access (`null`/non-object/partial → zero action), maps non-finite/negative values to 0 and caps every magnitude; `composeAction` caps the net vector and torque before `applyForce`/`applyTorque`. Pinned in `loop.test.ts`. | closed |
| T-03-05 | DoS | throwing or malformed `IUnitAI.decide` | high | mitigate | `decide` and its sanitize step share one try/catch with a zero-action fallback; throw/`null`/`undefined`/partial cannot abort the tick, and later decision ticks still run. Unbounded synchronous decide remains a documented limitation (AR-03-01). | closed |
| T-03-06 | Tampering | spoofed `skillIntent.unitId` / invalid `kind` | medium | mitigate | `readSkillIntent` drops an intent whose `unitId` differs from the deciding unit or whose discriminant/payload is invalid; spoof tests in `loop.test.ts` assert zero intents. | closed |
| T-03-07 | Tampering | malformed `ISensingWorld` output | medium | mitigate | `sanitizeRayDistances` emits exactly 64 finite entries in `[0, maxDistance]` (padding/truncating); projectiles are rebuilt as read-only finite sightings, non-objects dropped. Asserted in `sensing.test.ts`. | closed |
| T-03-08 | DoS | throwing `IDamageSink` | medium | mitigate | Each `applyDamage` call is wrapped in try/catch; a failing sink cannot abort routing or the post-routing dead-unit cleanup (`ControlSystem.routeDamage`). | closed |
| T-03-09 | Tampering | duplicate registration / stale ids | low | mitigate | Duplicate registration throws before any state change; unknown ids return `null`/no-op; `removeRegisteredUnit` is the single deregistration path with a re-entrancy guard. | closed |
| T-03-10 | Tampering | AI holding mutable physics/unit references | medium | mitigate | `Sensor` builds a fresh pure `IUnitObservation` (attributes, copies of equipment/skills, motion); `Sensor`/`DefaultUnitAI` never receive Rapier objects or call physics; the seam-level `IUnit` at `provider.create` is the approved contract boundary. | closed |
| T-03-11 | Tampering | `DefaultUnitAI` action values | high | mitigate | `DefaultUnitAI.buildAction` clamps the net force vector and torque to `MAX_FORCE_MAGNITUDE` / `MAX_TORQUE_MAGNITUDE`; `ControlSystem` independently re-clamps, so the AI cannot eject a unit even if its clamp were bypassed. | closed |
| T-03-12 | DoS | throwing provider / AI | high | mitigate | `ControlSystem` isolates `decide` with a zero-action fallback and guards `provider.destroy` in cleanup; `pluggable.test.ts` asserts 30 ticks survive a throwing AI with unchanged positions. | closed |
| T-03-13 | Tampering | skill-intent spoofing | medium | mitigate | The default AI always stamps `observation.unitId`; `ControlSystem.sanitizeAction` drops mismatched ids and invalid `kind` values. | closed |
| T-03-14 | Tampering | AI holding mutable physics/unit references | medium | mitigate | `DefaultUnitAI` consumes only `IUnitObservation`; the provider receives `IUnit` once at construction (approved boundary) and the AI stores no reference; no Rapier access. | closed |
| T-03-15 | DoS | unbounded synchronous `decide` | low | accept | JS cannot preempt a synchronous plugin function in-process; v1 records this as a known limitation (AR-03-01). The default AI is bounded and RNG-free. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (`high`) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-03-01 | T-03-15 | A synchronous plugin `decide` cannot be preempted in-process; a malicious infinite loop can stall the tick. The default AI is bounded and RNG-free; v1 accepts this as a known pluggable-AI limitation. | User (project decision) | 2026-10-21 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 16 | 16 | 0 | gsd-secure-phase (L1 verification + full suite; ASVS level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
