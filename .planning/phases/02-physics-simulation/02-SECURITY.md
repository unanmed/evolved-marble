---
phase: "02"
slug: "physics-simulation"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 02 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| npm registry → local `node_modules` | The phase's first runtime dependency crosses this boundary; supply-chain risk is the material one | package tarball, lockfile pin |
| WASM heap → Node process | Rapier allocates WASM memory for `World`, bodies, colliders and `EventQueue`; it must be freed explicitly | engine objects |
| caller numbers → engine | `IUnitPhysicsSpec` numeric input crosses into body/collider construction | mass, coordinates, attack/defense, geometry |
| engine handles → part index | Rapier collider handles are reused after removal; a stale entry would mis-attribute a later collider | integer handles, `{unitId, part}` tags |
| engine events → typed events | Raw handle pairs from `EventQueue` cross into `IContactEvent` / `IDamageEvent` | contact pairs, contact normals/points |
| post/pre-step state → damage math | Δv is derived from pre-step velocities, world COM, and a world-space normal | velocities, angular velocity, normal |
| typed events → caller (Unit mutation) | Physics emits final numbers only; the caller applies them — the boundary stays one-way (no `Unit` in physics) | final damage numbers |
| test process → Rapier prototype | `rotation.test.ts` temporarily patches `RAPIER.World.prototype.createRigidBody`; a leak would corrupt sibling files | prototype method |
| type contract → consumer phases | A wrong contract shape ripples to Phases 3/5 (design risk) | interfaces, numeric enums |

*No network, secrets, auth, or external untrusted input at runtime; all input is in-process numeric data.*

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-02-01 | Tampering (supply chain) | `@dimforge/rapier2d-compat` install | high | mitigate | Exact pin `0.21.0` in `package.json` and `pnpm-lock.yaml`; install gated by a blocking human-verify checkpoint before approval; provenance vetted in RESEARCH §Package Legitimacy Audit; runtime `RAPIER.version() === '0.21.0'` asserted in `tests/physics/rapier-harness.test.ts`. | closed |
| T-02-02 | DoS (test process) | unfreed `World` / `EventQueue` | low | mitigate | Harness frees both WASM objects in `afterAll`; 332-test suite runs without heap exhaustion. | closed |
| T-02-03 | DoS (CI) | WASM under Vitest worker pool | low | mitigate | Default worker pool proven sufficient (full suite green); `vitest.config.ts` left unchanged, no `pool: 'forks'` fallback needed. | closed |
| T-02-SC | Supply chain | npm installs | high | mitigate | Single pinned package plus its zero dependencies; no other dependency added by Phase 2; `pnpm-lock.yaml` resolves exactly `0.21.0`. | closed |
| T-02-04 | Tampering | `src/physics/types.ts` | low | mitigate | Declaration-only module (numeric enum + interfaces, no runtime logic); blocking human review gate approved the contract before implementation. | closed |
| T-02-05 | Spoofing (integrity) | `ColliderPart` ordinals | low | mitigate | `tests/physics/types.test.ts` pins `Body = 0`, `Weapon = 1`, `Armor = 2`, all integer, with unique ordinals. | closed |
| T-02-06 | Information Disclosure (design) | contract leaking Rapier handles | low | mitigate | `IPhysicsWorld` / `IPhysicsTickResult` expose ids, parts, and numbers only — no `RigidBody` / `Collider` / handle types cross the boundary. | closed |
| T-02-07 | Tampering (data integrity) | `computeDamageMean` / `computeDamageReduction` | high | mitigate | Δv clamped to finite non-negative before `Math.sqrt`; mean clamped by `max(…, 0)`; reduction denominator guarded (returns 0 on non-finite/zero); finiteness and non-negativity pinned in `damage.test.ts`. | closed |
| T-02-08 | Tampering (integrity, design) | armor reduction sign | medium | mitigate | D-11 sign-consistent `B_A = 破甲比率` (not reciprocal); test asserts higher penetration ⇒ larger final damage and smaller reduction. | closed |
| T-02-09 | Tampering (data integrity) | collider-handle index lifetime | high | mitigate | `removeUnit` deletes every index entry for the unit **before** `removeRigidBody` frees the colliders (`PhysicsWorld.ts`); re-registration test in `compound.test.ts` covers the reused-handle path. | closed |
| T-02-10 | DoS (test process) | unfreed `World` / `EventQueue` | medium | mitigate | `dispose()` frees both and is idempotent; every physics test calls it in `afterEach` (asserted in `compound.test.ts`). | closed |
| T-02-11 | Tampering (data integrity) | degenerate numeric spec input | medium | mitigate | Unknown ids return `null`; state reads are finite in test-asserted operation; per-collider mass asserted behaviourally; no speculative coercion added (minimal-per-anti-over-engineering). | closed |
| T-02-12 | DoS (test process) | `World` created before `RAPIER.init()` | medium | mitigate | Documented precondition; every Rapier test awaits `RAPIER.init()` in `beforeAll`. | closed |
| T-02-13 | Tampering (integrity) | event → part attribution | high | mitigate | Parts come exclusively from the collider-handle index; a pair with an unknown/missing handle is skipped, so a stale handle cannot mis-tag a contact (`PhysicsWorld.tick`). | closed |
| T-02-14 | Tampering (integrity) | same-unit self contact | low | mitigate | Defensive `tagA.unitId === tagB.unitId` guard plus Rapier's broad-phase guarantee; asserted in `events.test.ts` (`unitAId !== unitBId`). | closed |
| T-02-15 | DoS (test process) | undrained event queue growth | low | mitigate | `new RAPIER.EventQueue(true)` auto-drains before each step. | closed |
| T-02-16 | Tampering (data integrity) | Δv / normal computation | high | mitigate | Pre-step velocity snapshot; normal and solver contact point copied inside the `contactPair` closure; pairs whose colliders no longer resolve are skipped; non-finite Δv coerced to 0 (`PhysicsWorld.ts`). Finiteness pinned in `tick.test.ts`. | closed |
| T-02-17 | Tampering (integrity) | armor-kind / penetration selection | high | mitigate | `armorKind` taken from the struck armor collider's tag, never inferred; `penetration` looked up per `weapon.penetration[armorKind]`; armor vs body paths asserted separately in `tick.test.ts`. | closed |
| T-02-18 | Elevation of Privilege (design boundary) | damage application | medium | mitigate | Physics emits `IDamageEvent` only; no `Unit` import or mutation exists in `src/physics/` (imports are type-only). | closed |
| T-02-19 | DoS (test process) | missing `dispose()` / world leak | low | mitigate | Every physics test disposes its world in `afterEach`; `EventQueue(true)` bounds memory. | closed |
| T-02-20 | Tampering (integrity) | damage double-count on a single strike | high | mitigate | Per-tick `damageCandidates` map keyed by `(attackerId, defenderId)`; armor candidates replace body candidates for the same pair; `tick.test.ts` asserts `pairEvents.length === 1` with armor-part precedence and requires co-occurrence to be observed. | closed |
| T-02-21 | Tampering (data integrity) | `tick()` ω×r reference point | high | mitigate | Both bodies use `worldCom()` for the moment arm, matching `linvel()`'s COM reference; `rotation.test.ts` pins the COM value to 3 dp and rejects the origin value by > 0.5 m/s. | closed |
| T-02-22 | Tampering (integrity) | Δv sampling instant | high | mitigate | Only the rotation centre changed; `#preVelocities` remains the sole Δv source and is still filled before `world.step`; `tick.test.ts` pre-step test retained. | closed |
| T-02-23 | Tampering (integrity) | frozen type contract | medium | mitigate | `src/physics/types.ts` unmodified by plan 02-07; `PhysicsWorld` gained no public member (`implements IPhysicsWorld, IStaticObstacleWorld` only). | closed |
| T-02-24 | DoS (test process) | patched `RAPIER.World.prototype` leaking | medium | mitigate | Original `createRigidBody` restored in a `finally` block in `rotation.test.ts`; world disposed in `afterEach`. | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — only open threats at or above `workflow.security_block_on` (`high`) count toward `threats_open`*
*Disposition: mitigate (implementation required) · accept (documented risk) · transfer (third-party)*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|

*Accepted risks do not resurface in future audit runs.*

*No accepted risks.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-21 | 25 | 25 | 0 | gsd-secure-phase (L1 verification + full suite; ASVS level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
