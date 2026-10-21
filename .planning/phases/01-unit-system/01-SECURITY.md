---
phase: "01"
slug: "unit-system"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-21"
---

# Phase 01 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| build config → toolchain | `vitest.config.ts` / `tsconfig.json` are developer-authored; the only risk is weakening the gates | compiler/test flags, path aliases |
| spec doc → `data.ts` | Numbers transcribed from the semi-trusted reference doc; a transcription error propagates to all balance | class / weapon / armor tables |
| caller → `Unit` numeric inputs | `takeDamage` / `gain*Experience` accept raw numbers supplied by Phases 2/3 | damage, reduction, enemy level |
| injected `IRng` → attribute values | An erroneous RNG (0 or out-of-range draws) must not corrupt attributes into NaN/Infinity/negative | uniform samples → 7 spawn attributes |
| type contract → consumer phases | A wrong contract shape would ripple to Phases 2/3/5 (design risk, not a runtime security risk) | interfaces, numeric enums |

*No network, no secrets, no deserialization, and no untrusted external input in Phase 1.*

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-01 | Tampering | `vitest.config.ts` / `tsconfig.json` | low | mitigate | `@` alias (`join(process.cwd(), 'src')`) and `tests/**/*.test.ts` inclusion added; `strict: true` retained; `pnpm typecheck` / `pnpm lint` gates still enforced. | closed |
| T-01-02 | DoS (dev) | Vitest config load | low | mitigate | Dangling `setupFiles` entry removed; no setup entry remains in `vitest.config.ts`, so the runner starts cleanly. | closed |
| T-01-03 | Tampering | `package.json` / `pnpm-lock.yaml` | medium | mitigate | `typescript` aliased to `@typescript/typescript6@^6.0.2`; `@typescript/native` is a key pointing at the already-installed `typescript@7.0.2`; no `pnpm add` and no rule disabled for green. | closed |
| T-01-SC | Supply chain | package installs | high | mitigate | Only newly-fetched package is the vetted `@typescript/typescript6@6.0.2` (RESEARCH §Package Legitimacy Audit). No runtime dependency added by Phase 1; `data.ts`/`Unit.ts`/`spawn.ts` import only local modules and native `Math`. | closed |
| T-01-04 | Tampering | `src/units/types.ts` | low | mitigate | Type-only module with no runtime logic; the blocking human review gate was exercised and cleared before implementations landed (01-02-SUMMARY). | closed |
| T-01-05 | Spoofing (integrity) | enum definitions | low | mitigate | Numeric ordinals pinned by `tests/units/types.test.ts` (`Health = 0` … `Mass = 12`, exact class/weapon/armor ordinals); a string enum cannot satisfy these. | closed |
| T-01-06 | Tampering (data integrity) | `CLASS_DEFS` / `WEAPON_DEFS` / `ARMOR_DEFS` | medium | mitigate | `Record<ClassKind, IClassDef>`-style typing makes a missing kind a compile error; spec-exact values asserted in `data-classes.test.ts` / `data-weapons-armors.test.ts`. | closed |
| T-01-07 | Tampering (data integrity) | weapon penetration matrix | medium | mitigate | `penetration: Readonly<Record<ArmorKind, number>>` forces every armor kind; all six weapons declare Helmet + Shield entries and the total lookup is test-asserted. | closed |
| T-01-08 | Tampering (data integrity) | `getAttribute` switch | medium | mitigate | Exhaustive switch with a `never` guard and a throwing `default`; no silent `undefined` path for an unhandled `AttributeKind` (`Unit.ts`). | closed |
| T-01-09 | Tampering (state integrity) | health after level-up | low | mitigate | Health restore uses the modifier-adjusted max-health delta and `Math.min` clamp; cap asserted in `tests/units/leveling.test.ts`. | closed |
| T-01-10 | Tampering (state integrity) | `checkLevelUp` loop | low | mitigate | Threshold subtraction (`xp -= levelThreshold()`) strictly decreases `xp`; multi-level grants covered by the leveling tests. | closed |
| T-01-11 | Tampering (data integrity) | `sampleNormal` | medium | mitigate | `u1 <= 0` / `u1 > 1` re-draw guard, non-negative clamp, and finite fallback; `tests/units/rng.test.ts` asserts finiteness/non-negativity for out-of-range and non-finite draws. | closed |
| T-01-12 | Tampering (data integrity) | `spawnUnit` | low | mitigate | Only the 7 documented attributes are rolled; `spawn-normal.test.ts` pins mean/σ behavior and asserts every spawned attribute stays finite and non-negative. | closed |

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
| 2026-10-21 | 13 | 13 | 0 | gsd-secure-phase (L1 verification; ASVS level 1) |

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-21
