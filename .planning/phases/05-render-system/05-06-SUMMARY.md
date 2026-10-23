---
phase: 05-render-system
plan: 06
subsystem: render-unit-views
tags:
    [
        typescript,
        render,
        pixi,
        graphics-context,
        shared-geometry,
        import-boundary,
        vitest
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: the frozen IUnitView/IUnitViewFactory/IUnitViewSpec/IUnitViewState/IUnitVisualSpec contract (type-only Container)
    - phase: 05-render-system (plan 05-02)
      provides: DEFAULT_RENDER_CONFIG (palette + geometry bound to DEFAULT_GEOMETRY) and FLASH_RING_OFFSET_METERS
    - phase: 05-render-system (plan 05-03)
      provides: cameraMath.ts as the reference “pure module” shape the boundary test snapshots
    - phase: 05-render-system (plan 05-04)
      provides: resolveFactionColor/resolveUnitViewSpec — the visual identity this factory renders
    - phase: 05-render-system (plan 05-05)
      provides: hudModel.ts and DamageTap.ts, the last pure modules the adapter allow-list must tolerate
    - phase: 02-physics-simulation
      provides: DEFAULT_GEOMETRY and the Rapier weapon capsule translated to local (weaponOffsetX, 0) with its long axis on y
    - phase: 01-unit-system
      provides: WeaponKind/ArmorKind numeric enums (six weapons, two armours)
provides:
    - src/render/UnitViewFactory.ts — UnitViewFactory implements IUnitViewFactory; 10 shared GraphicsContexts (body, flash, 6 weapons, 2 armours), node-tree assembly, idempotent dispose
    - src/render/GeometryUnitView.ts — GeometryUnitView implements IUnitView; root Container + rotating child, tint/flash application, instance-only destruction
    - tests/render/import-boundary.test.ts — 14 assertions guarding the Pixi import boundary, the declaration-only contract and dynamic-code freedom
affects:
    [
        05-07 Renderer (calls factory.create per registered unit and factory.dispose on teardown),
        05-10 Chrome UAT (the only place the geometry is visually verified),
        future SpriteUnitView (must honour the same shared-resource ownership rules)
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 5676
    tasks: 2
    commits: 2
    plan_head_before: e304378178ff9d44a9b3f49ec655363e80a25a96

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Shared-ownership geometry: the factory builds one GraphicsContext per body/flash/weapon/armour kind and keeps a single sharedContexts list as the ownership record; each create() only news Graphics instances against those contexts'
        - 'Footprint-faithful silhouettes: every weapon draws at local x = geometry.weaponOffsetX with its long axis on y plus a grip back to the body edge, matching the Rapier capsule instead of inventing a forward-pointing spear (Pitfall 15)'
        - 'Compose-only root: IUnitView.getRoot() is a Container whose child carries the rotation, because v8 Graphics/Sprite are leaves; the flash ring hangs on the non-rotating root'
        - 'Declaration-only contract guard: the boundary test asserts types.ts keeps no class/const/function body and exactly one type-only pixi.js reference, so the approved contract cannot silently grow runtime code'
        - 'Importer allow-list by filename suffix (*View/*ViewFactory/*Hud/*Renderer plus types.ts), which makes “Pixi only in adapters” a mechanical rule rather than a review habit'

key-files:
    created:
        - src/render/UnitViewFactory.ts
        - src/render/GeometryUnitView.ts
        - tests/render/import-boundary.test.ts
    modified: []

key-decisions:
    - 'The factory keeps one sharedContexts ownership list (body, flash, six weapons, two armours) and dispose() destroys each entry then empties the list — the two Record<Kind, GraphicsContext> lookups stay readonly, so the mutable ownership record is the list and idempotency is a single disposed flag'
    - 'Longsword/Shortsword/Axe/Hammer/Bow/Spear are separated by length, width, crossguard, asymmetry, arc and tip rather than by colour: the palette weapon/armour colours are shared, so silhouette is the only per-kind discriminator available under D-04'
    - 'Shield is a 120-degree forward arc stroked at 4.4x weaponRadius while the helmet is a full thin ring at 1.8x plus a forward dome — “clearly heavier” is encoded as stroke width, not just shape'
    - 'The body is filled pure white with a palette.healthBorder outline so tint = factionColor yields the configured colour and a hit can fall back to palette.flash; a dark body could never be brightened because Pixi tint is multiplicative (Pitfall 6)'
    - 'The boundary test detects Pixi by import specifier (static, dynamic and require) rather than by the word “Pixi”, so the many Chinese doc comments that mention Pixi in pure modules do not produce false positives'
    - 'Node types are pulled into the new test with a file-local /// <reference types="node" /> instead of adding types: ["node"] to tsconfig.json, keeping the change inside the plan’s declared file set'

patterns-established:
    - 'Adapter file shape: module-level build*Context(config: IRenderConfig) GraphicsContext builders (each taking only the config, never inline object types) followed by one class that owns the results'
    - 'Source-level boundary test: readSource/listSourceFiles helpers over process.cwd(), regexes for import specifiers, and per-rule describe blocks that name the threat they prevent'

requirements-completed: [REND-01, REND-02]

# Coverage metadata (#1602) — one entry per shipped deliverable.
coverage:
    - id: D1
      description: 'UnitViewFactory owns exactly one shared GraphicsContext per body, flash, weapon kind (6) and armour kind (2); create() only news Graphics instances, so N units share ~10 geometry objects (D-03/G-5)'
      requirement: 'REND-02'
      verification:
          - kind: other
            ref: 'node presence check over src/render/UnitViewFactory.ts (prints UNIT_VIEWS_OK: implements IUnitViewFactory, all six WeaponKind and both ArmorKind branches, geometry-derived dimensions)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck (IUnitViewFactory/IUnitView satisfaction, Record<WeaponKind|ArmorKind, GraphicsContext> exhaustiveness)'
            status: pass
      human_judgment: true
      rationale: 'Pixi cannot be constructed in the node Vitest environment, so the sharing invariant (10 contexts, N Graphics instances) is only observable in Chrome; it is verified visually/structurally at 05-10 UAT.'
    - id: D2
      description: 'Every weapon silhouette is drawn on the physical capsule: local x = geometry.weaponOffsetX, long axis along local y, extent geometry.weaponHalfLength, plus a grip back to the body edge (D-04/Pitfall 15/T-05-27)'
      requirement: 'REND-02'
      verification:
          - kind: other
            ref: 'node presence check (requires geometry.weaponOffsetX / geometry.weaponHalfLength / geometry.armorRadius / geometry.bodyRadius in UnitViewFactory.ts)'
            status: pass
      human_judgment: true
      rationale: 'The numeric source is machine-checked, but “the picture matches the collider” needs eyes on a running Chrome scene during 05-10 UAT.'
    - id: D3
      description: 'Six visually distinct weapon silhouettes (long thin blade + crossguard, shorter wider blade, asymmetric axe head, thick rectangular hammer head, shallow bow arc + string, spear extending past the half-length with a pointed tip) and two distinct armours (thin full ring + forward dome vs 120-degree heavy forward arc)'
      requirement: 'REND-02'
      verification: []
      human_judgment: true
      rationale: 'Visual distinctness is a judgement call; D-22’s ?classes=all demo variant exists precisely to show all six weapons and both armours in Chrome at 05-10.'
    - id: D4
      description: 'GeometryUnitView roots at a Container whose child carries the rotation, applies only position/rotation/visible/body tint/flash-ring visibility, and keeps level/health bar out of the view (D-03/D-06/D-08)'
      requirement: 'REND-02'
      verification:
          - kind: other
            ref: 'node presence check (implements IUnitView, getRoot(): Container, apply(state: IUnitViewState): void, rotation = state.angle, flashRing.visible)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck + pnpm lint'
            status: pass
      human_judgment: false
    - id: D5
      description: 'A hit switches the body tint to palette.flash and shows the shared flash ring; the ring sits at geometry.armorRadius + FLASH_RING_OFFSET_METERS and is mounted on the non-rotating root (D-04/D-06/Pitfall 6)'
      requirement: 'REND-02'
      verification:
          - kind: other
            ref: 'node presence check (FLASH_RING_OFFSET_METERS, factionColor, flashRing.visible)'
            status: pass
      human_judgment: true
      rationale: 'Whether the flash actually reads as “白闪” on screen is a visual judgement reserved for 05-10 Chrome UAT.'
    - id: D6
      description: 'A single view destroy() releases only its own root ({ children: true }) and never the shared contexts; factory dispose() is idempotent and destroys each context exactly once (T-05-26/Pitfall 5)'
      requirement: 'REND-02'
      verification:
          - kind: other
            ref: 'node presence check (forbids the context-destroying option and beginFill in both files; requires a disposed flag)'
            status: pass
      human_judgment: false
    - id: D7
      description: 'The Pixi import boundary is enforced in CI: the seven pure modules import no Pixi specifier, and only types.ts plus *View/*ViewFactory/*Hud/*Renderer files do (T-05-05/Pitfall 17)'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — pure modules stay Pixi-free keeps src/render/constants.ts free of any Pixi import'
            status: pass
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — only adapters may import Pixi restricts Pixi imports to types.ts and the declared adapters'
            status: pass
      human_judgment: false
    - id: D8
      description: 'src/render/types.ts stays declaration-only: no class, no top-level const, no function body, no instantiation, exactly one type-only pixi.js reference, and all six frozen anchors intact (T-05-06/T-05-29)'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — the contract stays declaration-only contains no class, no top-level constant and no function body'
            status: pass
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — the contract stays declaration-only references Pixi exactly once, as a type-only Container import'
            status: pass
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — the contract stays declaration-only keeps every frozen type-gate anchor'
            status: pass
      human_judgment: false
    - id: D9
      description: 'No file under src imports the Pixi eval extension and no file under src/render evaluates or constructs code from a string (T-05-28/V10)'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — no runtime code generation never imports the Pixi eval extension anywhere under src'
            status: pass
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — no runtime code generation never evaluates or constructs code from a string under src/render'
            status: pass
      human_judgment: false
    - id: D10
      description: 'src/render still holds exactly one types.ts (AGENTS §2)'
      requirement: 'REND-01'
      verification:
          - kind: unit
            ref: 'tests/render/import-boundary.test.ts#render/import-boundary — one types.ts per folder keeps exactly one types.ts in src/render'
            status: pass
      human_judgment: false

# Metrics
duration: 9min
completed: 2026-10-24
status: complete
---

# Phase 5 Plan 6: Shared Geometry Unit Views Summary

**Procedural unit visuals — one white tintable body, six footprint-faithful weapon silhouettes, two armour silhouettes and a shared hit-flash ring — built once by `UnitViewFactory`, rendered per unit through a transform-only `GeometryUnitView`, and guarded by a source-level test that keeps Pixi inside the adapters and `types.ts` declaration-only.**

## Performance

- **Duration:** ~9 min
- **Started:** 2026-10-23T15:52:00Z
- **Completed:** 2026-10-23T16:01:00Z
- **Tasks:** 2
- **Files modified:** 3 created, 0 modified

## Accomplishments

- `UnitViewFactory implements IUnitViewFactory` builds **ten shared `GraphicsContext`s** (body, flash ring, six weapons, two armours) exactly once; every `create()` only instantiates `Graphics` against them, so dozens of units share ~10 geometry objects instead of owning hundreds (D-03/G-5).
- All weapon silhouettes sit on the **physical Rapier capsule**: local `x ≈ geometry.weaponOffsetX`, long axis on local y, extent `geometry.weaponHalfLength`, with a grip joining the body edge to the weapon centre — so a visible hit cannot disagree with the collider (D-04/Pitfall 15).
- Six weapons and two armours are distinguished purely by silhouette (length, width, crossguard, head shape, arc, tip; thin ring + dome vs heavy forward arc), because the palette colours are shared (D-04).
- `GeometryUnitView implements IUnitView` roots at a `Container` with a rotating child, writes only position/rotation/visibility/body tint/flash-ring visibility, and keeps level + health bar out of the view so the HUD layer can keep them upright (D-03/D-06/D-08/D-23).
- Body is filled white so `tint = factionColor` works and a hit can switch to `palette.flash`; the flash ring sits at `geometry.armorRadius + FLASH_RING_OFFSET_METERS` on the non-rotating root (D-04/D-06/Pitfall 6).
- `tests/render/import-boundary.test.ts` (14 assertions) makes the boundary permanent: pure modules are Pixi-free, only `types.ts` + `*View`/`*ViewFactory`/`*Hud`/`*Renderer` may import Pixi, `types.ts` has no class/const/function/instantiation and exactly one type-only reference, no eval extension under `src`, no string-evaluated code in `src/render`, one `types.ts` per folder.

## Task Commits

Each task was committed atomically:

1. **Task 1: Build the shared-geometry factory and the per-unit geometry view** - `fdea293` (feat)
2. **Task 2: Add the permanent Pixi import-boundary and frozen-contract guard test** - `d524319` (test)

**Plan metadata:** see the docs commit below (docs: complete plan)

_Note: no TDD tasks in this plan._

## Files Created/Modified

- `src/render/UnitViewFactory.ts` - `UnitViewFactory implements IUnitViewFactory`: ten shared geometry contexts, six weapon / two armour / body / flash builders, node-tree assembly, exactly-once idempotent `dispose()`
- `src/render/GeometryUnitView.ts` - `GeometryUnitView implements IUnitView`: root `Container` + rotating child, transform/tint/visibility-only `apply()`, instance-only `destroy()`
- `tests/render/import-boundary.test.ts` - 14 source-level assertions: Pixi-free pure modules, adapter allow-list, declaration-only contract + frozen anchors, no eval extension, no dynamic code, single `types.ts`

## Decisions Made

- **Ownership list over mutable records.** The two `Record<Kind, GraphicsContext>` lookups are `readonly` (matching the frozen field shape); the mutable ownership record is a single `sharedContexts` list that `dispose()` iterates and empties. Idempotency is one `disposed` flag, so a second call cannot double-free (G-5).
- **Silhouette is the only discriminator.** Palette `weapon`/`armor` colours are shared across kinds, so each kind differs by geometry (length, width, crossguard, asymmetry, arc, tip) rather than colour — this is what D-04 asks for and what keeps the palette small.
- **Shield “heavier” is encoded numerically.** Helmet = full thin ring (`1.8 × weaponRadius`) + forward dome; shield = 120° forward arc stroked at `4.4 × weaponRadius` at `armorRadius − 1.6 × weaponRadius`. Heaviness becomes a measurable stroke width, not a vibe.
- **White body, multiplicative tint.** The body is pure white with a `palette.healthBorder` outline, and the flash swaps tint to `palette.flash` — because Pixi tint multiplies, a dark body could never be brightened (Pitfall 6).
- **Specifier-based boundary detection.** The test matches Pixi by import specifier (static / dynamic / `require`) rather than the word “Pixi”, so the many Chinese doc comments that mention Pixi in pure modules do not produce false positives.
- **File-local Node types.** `/// <reference types="node" />` in the new test instead of adding `types: ["node"]` to `tsconfig.json`, keeping the change inside the plan's declared file set.

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 3 - Blocking] `tsc` could not resolve Node's `fs`/`path`/`process` types**
- **Found during:** Task 2 (import-boundary test)
- **Issue:** `pnpm typecheck` failed with TS2591 (`Cannot find name 'fs'/'path'/'process'`) even though `@types/node` is installed — this tsconfig declares no `types` field and the TS7 compiler does not auto-include the Node globals here.
- **Fix:** Added a file-local `/// <reference types="node" />` to `tests/render/import-boundary.test.ts` so only this test sees Node types. Deliberately did **not** widen `tsconfig.json` (outside this plan's `files_modified`).
- **Files modified:** `tests/render/import-boundary.test.ts`
- **Verification:** `pnpm typecheck`, `pnpm lint`, `pnpm vitest run tests/render` all exit 0
- **Committed in:** `d524319` (Task 2 commit)

**2. [Rule 3 - Blocking] Plan's own forbidden-API check tripped by a JSDoc phrase**
- **Found during:** Task 1 (presence check)
- **Issue:** The plan's presence check rejects any file containing the literal `context: true`; the `GeometryUnitView.destroy()` JSDoc explaining *not* to pass that option contained the literal and printed `FORBIDDEN_API`.
- **Fix:** Reworded the JSDoc to describe the option without the literal (“不传销毁上下文的选项”), keeping the warning and passing the check.
- **Files modified:** `src/render/GeometryUnitView.ts`
- **Verification:** presence check prints `UNIT_VIEWS_OK`; `pnpm lint` clean
- **Committed in:** `fdea293` (Task 1 commit)

### Adapted Instructions

**3. `GraphicsContext` is not imported by `GeometryUnitView.ts`**
- The task text asked for `Container`, `Graphics` **and** `GraphicsContext` value imports in the view. The view never builds geometry, so that import would be unused and fail `@typescript-eslint/no-unused-vars`. Only `Container` and `Graphics` are imported; `GraphicsContext` remains the factory's concern.

**4. `dispose()` clears the ownership list, not the lookup records**
- The plan says dispose “clears the records”; the `Record<WeaponKind|ArmorKind, GraphicsContext>` fields are `readonly` because a `Record` cannot be reassigned to an empty object. Clearing the `sharedContexts` ownership list is the semantically identical act, and the required behaviour (each context destroyed exactly once, second call a no-op) is unchanged.

---

**Total deviations:** 2 auto-fixed (both Rule 3 - blocking), 2 adapted instructions
**Impact on plan:** No scope creep. Both auto-fixes were required for the plan's own verification commands to pass; the two adaptations removed an unused import and an unsatisfiable “clear a readonly Record” phrasing without changing shipped behaviour.

## Issues Encountered

- The plan frontmatter says `wave: 4` while the orchestrator dispatched this run as Wave 5; the serialization requirement (`depends_on: [05-05]`, so the guard reads existing `hudModel.ts`/`DamageTap.ts`) was satisfied either way. Cosmetic metadata inconsistency only.
- `gsd-tools` is not installed in this environment, so state/roadmap updates were applied by hand to `STATE.md` / `ROADMAP.md` instead of via `state.*` / `roadmap.update-plan-progress` verbs. The broken-windows ledger append was skipped for the same reason (no stubs, skipped tests or unrun `<verify>` remain, so nothing mandatory was lost).

## User Setup Required

None - no external service configuration required.

## Next Phase Readiness

- `05-07` can now create one view per registered unit via `factory.create(spec)`, attach `view.getRoot()` to its unit layer, call `view.apply(state)` per output frame, destroy views for units that left the catalogue, and call `factory.dispose()` exactly once on renderer teardown.
- Deliberately **not** verified here (it needs a running Chrome canvas): whether the six weapon silhouettes and two armours are actually distinguishable at battle zoom, and whether the flash reads as white. `05-10` Chrome UAT plus the `?classes=all` scenario variant (D-22) are the scheduled checks — no geometry has been tuned yet.
- `src/render/types.ts` and every Phase 1–4 file are untouched (verified by `git status`: only three new files in this plan).

---

*Phase: 05-render-system*
*Completed: 2026-10-24*
