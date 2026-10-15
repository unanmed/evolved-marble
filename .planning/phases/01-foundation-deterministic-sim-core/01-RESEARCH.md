# Phase 1: Foundation & Deterministic Sim Core - Research

**Researched:** 2026-10-15
**Domain:** Headless deterministic simulation core (fixed timestep, seeded PRNG streams, state fingerprint gate) under a bleeding-edge TypeScript 7 / Vite 8 (Rolldown) / Vitest 5 toolchain
**Confidence:** MEDIUM-HIGH (toolchain facts HIGH from official sources + registry; determinism mechanics HIGH from canonical + official docs; exact version pins MEDIUM — re-verify at lock time)

<user_constraints>
## User Constraints (from CONTEXT.md)

> Copied verbatim from `.planning/phases/01-foundation-deterministic-sim-core/01-CONTEXT.md`. These are LOCKED; CONTEXT.md overrides any stale ROADMAP "Plans" text (e.g. the ROADMAP line "ECS-lite EntityStore" and "runs in CI" are SUPERSEDED).

### Locked Decisions

#### 确定性策略（Determinism）
- **D-01:** 建**确定性核心**：固定步长 TimeClock + 种子 PRNG（禁用 `Math.random` 影响模拟状态）+ 无头运行模式。步长 = 游戏 1 分钟（1× 下 60 步/秒）。 — **Reversibility:** one-way — 时间步与随机流的接口贯穿所有下游系统（物理、AI、战斗）；后期改动等于重做全部系统契约。
- **D-02:** 确定性目标定为**同机可复现**：同一种子在同一机器/浏览器内重跑结果一致。**不要求跨机位级一致**，因此**不**背负"禁用 `Math.sin/cos`""跨机器 golden hash"这套重纪律。 — **Reversibility:** costly — 日后若需跨机一致，需审计全部数学调用、固定构建/插入顺序并重建 golden 基线。
- **D-03:** 架构保留"日后收紧到跨机一致"的空间（模拟核心与外部 I/O 严格分层、可插入指纹门禁），但不为它现在买单。 — **Reversibility:** reversible。

#### 实体模型（Entity Model）
- **D-04:** 采用**组合优先的轻量对象模型**，**不引入 ECS 框架**：实体是对象（稳定 `entityId` + 组件字段），系统写成显式函数（如 `movementSystem(world)`）。理由：并发高保真 AI 单位仅十几/方（≈20–40），ECS/SoA 的收益在此量级体现不出来；旧原型的真正病根是继承式 `Role`/`BodyBase` 桩基类，组合即可避开。 — **Reversibility:** one-way — 实体表示是物理/AI/战斗/渲染共同依赖的数据形状；改为 SoA/ECS 会触及全部系统。
- **D-05:** `entityId` 保持稳定、单调，为未来可能的 SoA/bitECS 迁移预留（仅当并发 AI 单位达数百时再评估）。 — **Reversibility:** reversible。

#### 配置与数值来源（Config & Data）
- **D-06:** 数值（职业/武器/防具/公式常量）放在 **TS 数据模块**（`content/` 下类型安全常量，如 `classes.ts`），依赖 Vite HMR 实现改完即时生效。不引入外部 JSON + schema 校验层（本期）。 — **Reversibility:** costly — 若日后改为外部 JSON/模组加载，需为全部数值补 schema 校验与加载路径；但数值契约本身稳定，迁移面有限。

#### 工具链与验证（Toolchain & Verification）
- **D-07:** 构建工具链用**最新版**：TS 7 + Vite 8（rolldown），要求 **Node ≥ 22.12**（本地为 v24.21，满足）。 — **Reversibility:** costly — 工具链切换会波及构建、测试与 WASM 资产管线配置。
- **D-08:** 测试框架用 **Vitest**（Vite 原生，零配置，与项目同构）。 — **Reversibility:** reversible。
- **D-09:** 确定性验证用**同机双跑指纹比对**：同种子跑两遍断言状态指纹相等，脚本化并作为提交前门禁。**暂不接 CI**（GitHub Actions）。 — **Reversibility:** reversible。
- **D-10:** 大产物（录像、检查点）一律**输出到仓库外目录并做轮转**，并在 `.gitignore` 中忽略；避免重演旧仓库 140MB checkpoint 入库的问题。 — **Reversibility:** reversible。

#### 规模与录制约束（Scale & Recording — 对话中新引入）
- **D-11:** 一集完整模拟预期 **1 小时以上**；全图累计单位可能**上万**（但同屏高保真 AI 单位仍为十几/方）。录制产物按 1080p60 H.264 估为 **GB 级**（8–16 Mbps → 约 3.6–11 GB/集），故 D-10 必不可少；编码优先考虑 H.265/AV1 + CRF 以降体积。 — **Reversibility:** reversible（属录制层约束，Phase 6 落地）。

### the agent's Discretion
- 无头泵的具体实现（`raf` | `headless` | `fixed-fps`）细节、指纹的具体哈希算法与快照格式、`content/` 目录的内部组织——由规划/执行决定。
- 工具链具体小版本号（TS 7.x / Vite 8.x）以锁定时的 npm registry 实测为准。

### Deferred Ideas (OUT OF SCOPE)
- **行为数组回放（记录 AI 指令流 + 种子，重放重现同一局）** — 用户认为蝴蝶效应会让长局回放变脆，决定推迟。待确定性核心稳定后再评估；届时若需跨设备分享，可能要求把 D-02 收紧到跨机位级一致。
- **跨机位级确定性（禁用 `Math.sin/cos`、跨机器 golden hash、CI 门禁）** — 不在本阶段；架构保留升级空间（D-03）。
- **GitHub Actions CI** — 用户选择暂不接 CI，仅同机双跑门禁（D-09）。
- **外部 JSON 数值 + schema 校验 / 模组加载** — 本期用 TS 数据模块（D-06）；v1.x 的"数值热重载"与未来模组化再议。

</user_constraints>

## Summary

Phase 1 builds the spine every later phase hangs off: a **headless, fixed-timestep, fully-seeded simulation core** with no renderer, DOM, network, or wall-clock dependency, plus an **automated same-machine determinism gate**. The phase's real risk is *not* the loop or the PRNG — those are canonical, ~20-line constructs — it is (a) **toolchain bleeding-edge**, because TypeScript 7 ships *without a programmatic compiler API until 7.1* and therefore **typescript-eslint cannot consume it** (forcing the official TS6/TS7 side-by-side install), and (b) **determinism discipline**, because "deterministic" is a property of the whole `sim/` tree, not of any one library.

Three findings dominate the plan. First, the toolchain must adopt the **official side-by-side layout**: `typescript` aliases to `@typescript/typescript6@^6.0.2` (which supplies the `tsc6` bin *and* the TS 6 compiler API that typescript-eslint's peer range `>=4.8.4 <6.1.0` requires), while `@typescript/native` aliases to `typescript@^7.0.2` (which supplies the `tsc` bin). This is a verified hard requirement, not a preference — `npm view typescript-eslint peerDependencies` returns `"typescript": ">=4.8.4 <6.1.0"`, which excludes 7.0.2. pnpm (the project's manager, v12.5.1) is the safe choice here because it does not hoist the compat package's transitive `tsc` bin into the root `.bin` the way npm does.

Second, because D-02 targets **same-machine reproducibility only**, the determinism rulebook is *much* lighter than the project-level research assumed: `+ - * /` and `Math.sqrt` on float64 are bit-reproducible within one JS engine, so **`Math.sin/cos` are explicitly allowed** (D-02). The real traps are `Math.random`, `Date.now`/`performance.now`, and — subtly — **`Map`/`Set` delete-and-re-add reordering**: a kill/respawn path silently moves an entity to the end of iteration order. The core must iterate a **stable ordered id array**, never collection order.

Third, the **fingerprint must hash a canonical, ordered, quantized serialization**, and the hash itself should avoid the classic mistake of a hand-rolled byte-at-a-time JS loop (measured at 127% of a sim step's cost in one study). At Phase 1's tiny state this is cheap either way, but the design should expose `serializeState(): Uint8Array` (canonical/ordered) separately from the hash so a faster native hash can be swapped in later without touching sim logic.

**Primary recommendation:** Single package (not a workspace), directories `src/sim/**` (DOM-free core) + `src/host/**` (pumps) + `src/config/**` (typed TS constants), `sim/` frozen by *both* an ESLint boundary rule set *and* a DOM-free `tsconfig.sim.json` (`"lib": ["ESNext"]`), seeded `sfc32` streams behind a `RandomStreams` facade, a `Command` discriminated union drained once per tick, and a Vitest determinism test (double-run fingerprint compare) wired as a pre-commit gate via `core.hooksPath` — no CI (D-09).

## Architectural Responsibility Map

Tiers are the standard vocabulary adapted to a single-process simulator: **Sim Core (headless)** plays the API/Backend role; **Host/Transport** is the client runtime; **Build Tooling** is the CI/dev-tooling tier.

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| Fixed-step time advancement (`TickClock`) | Sim Core (headless) | — | Time is a tick counter; must be step-count-derived, never wall-clock. Consumed by every downstream system. |
| Seeded randomness (`RandomStreams`) | Sim Core (headless) | — | All sim randomness originates here; deriving streams from one master seed is what makes reset reproducible. |
| Entity storage (composition-first object model) | Sim Core (headless) | — | The shared data shape for physics/AI/combat/render; must be plain, ordered, serializable. |
| Command intake (`CommandQueue`) | Sim Core (headless) | Driver (future) | The single inward control contract; drained once per tick so external timing never enters the step. |
| Simulation advance (`BattleSim.step()`) | Sim Core (headless) | — | The one advance primitive; who calls it and how often is a host concern. |
| Loop pacing / pump selection | Host/Transport | — | `raf`/`headless`/`fixed-fps` differ only in *when/how many* steps run; sim cannot tell them apart. |
| State serialization (canonical, ordered) | Sim Core (headless) | — | Producing canonical bytes must live with the data it describes. |
| Fingerprint hashing + determinism gate | Build Tooling | Sim Core (serializer) | Hash + double-run compare is a test/host concern; the Node harness may use a native fast hash. |
| Import-boundary enforcement (`sim/` DOM-free) | Build Tooling | — | ESLint + a DOM-free tsconfig; not runtime code. |
| Game/stat data constants | Config/Data (`src/sim/content`) | — | Data-only TS modules (D-06); no logic, no JSON+schema this phase. |

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| SIM-01 | 模拟按固定步长推进，与渲染解耦（tick = 游戏 1 分钟；1× 下 60 步/秒） | Fixed-timestep accumulator pattern (Pattern 1 + Code Example 1); `TickClock` with constant `DT=1/60`; host-only pumps; spec §时间系统 quoted below. |
| SIM-02 | 所有模拟随机性来自带种子的 PRNG（禁用 `Math.random`），可由种子复现 | `RandomStreams` facade over `sfc32`/`mulberry32` with `getState/setState` (Pattern 2); lint ban on `Math.random`; per-concern streams derived from one master seed (seam: this section's PRNG digest). |
| SIM-03 | 存在无渲染的无头运行模式 | `headlessPump` + DOM-free `src/sim/**` + DOM-free `tsconfig.sim.json`; Vitest runs in `environment: 'node'` by default (Pattern 1 table; Validation Architecture). |
| SIM-04 | 有确定性门禁（状态指纹/快照），证明同种子结果一致 | Canonical `serializeState()` + `fingerprint()` + double-run compare test (Pattern 6); pre-commit gate script (D-09, no CI). Hash-cost caveat captured in Pitfall 3. |
</phase_requirements>

## Standard Stack

> **Version provenance:** every version below was read from the npm registry (`npm view <pkg> version`) **this session** (2026-10-15). Official-source facts carry `[CITED: url]`; registry-only version pins carry `[VERIFIED: npm registry]`. Where a claim also rests on an official doc, the doc is cited. **Re-verify all pins immediately before writing `package.json`** — several are bleeding-edge.

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `typescript` (aliased to `@typescript/typescript6`) | `6.0.2` | Supplies the **TS 6 compiler API** for typescript-eslint | typescript-eslint peer is `"typescript": ">=4.8.4 <6.1.0"` (verified) — TS 7.0.2 is **out of range**. TS 7.0 ships no programmatic API until 7.1. `[VERIFIED: npm registry]` `[CITED: devblogs.microsoft.com/typescript/announcing-typescript-7-0/]` |
| `@typescript/native` (alias) → `typescript` | `7.0.2` | Supplies the native `tsc` **executable** (type-check + build) | Official side-by-side layout; 8–12× faster builds; TS7 type-checks like TS6 with `stableTypeOrdering`. `[VERIFIED: npm registry]` `[CITED: devblogs.microsoft.com/typescript/announcing-typescript-7-0/]` |
| `vite` | `8.3.4` | Dev server + build (Rolldown/Oxc) | Standard for TS browser apps; only needed later (Phase 5) but installed and configured now. Requires Node `^20.19 \|\| >=22.12`. `[VERIFIED: npm registry]` `[CITED: vite.dev/blog/announcing-vite8]` |
| `vitest` | `5.0.4` | Test runner + determinism gate host | Vite-native; requires Vite `>=6.4.0` and Node `>=22.12.0`; default `environment: 'node'` is exactly what the DOM-free core needs. `[VERIFIED: npm registry]` `[CITED: vitest.dev/blog/vitest-5.html]` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `eslint` | `10.12.0` | Lint + import/global boundary enforcement | Flat config; `no-restricted-imports`/`no-restricted-globals`/`no-restricted-properties`. typescript-eslint 8.71.2 peer accepts `eslint ^10`. `[VERIFIED: npm registry]` |
| `typescript-eslint` | `8.71.2` | Typed lint rules + TS parser | Flat config; peer `eslint ^8.57 \|\| ^9 \|\| ^10`, `typescript >=4.8.4 <6.1.0`. `[VERIFIED: npm registry]` |
| `@eslint/js` | `10.0.1` | Shared ESLint recommended config | Pair with `eslint@10`. `[VERIFIED: npm registry]` |
| `globals` | `17.13.0` | Global variable sets for lint scopes | Provides browser/node global sets for boundary rules. `[VERIFIED: npm registry]` |
| `prettier` | `3.9.10` | Formatting (source of truth) | Project convention; keep `.prettierrc`. `[VERIFIED: npm registry]` |
| `eslint-plugin-prettier` | `5.5.7` | Run Prettier as an ESLint rule | Matches old repo wiring. `[VERIFIED: npm registry]` |
| `@types/node` | `26.6.5` | Node typings for host/test scripts | Only in the Node-side tsconfig, **never** in `src/sim/**`. `[VERIFIED: npm registry]` |

> **Not required in Phase 1 (deliberately omitted):** no PRNG library (hand-rolled `sfc32`/`mulberry32` is canonical and dependency-free — see Don't Hand-Roll), no hash library (Phase-1 state is tiny; a small pure hash suffices — see Don't Hand-Roll), no `zod` runtime-config layer (D-06 says TS data modules this phase; runtime config is a Phase 6 concern), no `vite-plugin-wasm`/Rapier (Phase 2), no browser-test runner (headless only this phase).

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Single package + directory boundaries | pnpm workspace packages (`packages/sim`, `packages/host`) | Workspace gives *physical* import boundaries and stronger `sim` isolation, but adds workspace config, cross-package TS references, and build orchestration for a one-consumer core. Overkill at Phase 1; adopt only if the boundary is repeatedly violated. |
| `@typescript/typescript6` alias | `tsc6` side-by-side with plain `typescript@7` | The docs' recommended layout aliases `typescript`→TS6 so API consumers "just work"; the inverse (as in langfuse's PR) requires care with pnpm peer resolution. Use the documented layout. |
| Hand-rolled `sfc32` PRNG | `seeded-random-utilities`, `ts-seedrandom`, `rand-seed` | Third-party libs are fine but hand-rolling ~20 lines gives full control of the **serializable state shape** (the actual requirement) and zero supply-chain surface. `[ASSUMED]` for the specific library APIs; not needed. |
| Pure-TS fingerprint hash | `xxhash-wasm` / `hash-wasm` | WASM hash adds a Vite-8 WASM asset-pipeline dependency to Phase 1 for a state that is tiny. Defer; keep `serializeState()`/`hash` separable so it can be swapped in. |

### Installation

```bash
# Toolchain — official TS7/TS6 side-by-side layout (see Pitfall 1 & 2)
pnpm add -D vite@^8.3.4 vitest@^5.0.4 eslint@^10.12.0 typescript-eslint@^8.71.2 \
            @eslint/js@^10.0.1 globals@^17.13.0 prettier@^3.9.10 eslint-plugin-prettier@^5.5.7
pnpm add -D "typescript@npm:@typescript/typescript6@^6.0.2" \
            "@typescript/native@npm:typescript@^7.0.2"
```

```jsonc
// package.json (relevant fields)
{
  "type": "module",
  "packageManager": "pnpm@12.5.1",
  "engines": { "node": ">=22.12.0" },
  "scripts": {
    "typecheck": "tsc --noEmit -p tsconfig.json && tsc --noEmit -p tsconfig.sim.json",
    "test": "vitest run",
    "test:watch": "vitest",
    "gate": "vitest run tests/determinism",
    "lint": "eslint ."
  }
}
```

**Version verification (run before locking `package.json`):**

```bash
npm view typescript version                 # expect 7.x
npm view @typescript/typescript6 version     # expect 6.0.x
npm view vite version                        # expect 8.x
npm view vitest version                      # expect 5.x
npm view eslint version                      # expect 10.x
npm view typescript-eslint peerDependencies  # confirm eslint ^10 AND typescript <6.1.0
```

## Package Legitimacy Audit

> Ran `gsd-tools query package-legitimacy check --ecosystem npm <pkgs>` on 2026-10-15. Verdicts below are the seam's, with registry signals (exact publish date, weekly downloads, source repo, postinstall) recorded.

| Package | Registry | Age (latest publish) | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|---------------------|-----------|-------------|---------|-------------|
| `typescript` | npm | 7.0.2 GA 2026-07-08 | 307M/wk | github.com/microsoft/TypeScript | OK | Approved |
| `@typescript/typescript6` | npm | 6.0.2, 2026-07-06 | 8.0M/wk | github.com/microsoft/TypeScript | OK | Approved |
| `vite` | npm | 8.3.4, 2026-10-08 | 195M/wk | github.com/vitejs/vite | SUS (too-new) | Approved — see note |
| `vitest` | npm | 5.0.4, 2026-10-12 | 125M/wk | github.com/vitest-dev/vitest | SUS (too-new) | Approved — see note |
| `eslint` | npm | 10.12.0, 2026-10-02 | 159M/wk | github.com/eslint/eslint | SUS (too-new) | Approved — see note |
| `typescript-eslint` | npm | 8.71.2, 2026-10-12 | 90M/wk | github.com/typescript-eslint/typescript-eslint | SUS (too-new) | Approved — see note |
| `prettier` | npm | 3.9.10, 2026-10-10 | 139M/wk | github.com/prettier/prettier | SUS (too-new) | Approved — see note |
| `eslint-plugin-prettier` | npm | 5.5.7, 2026-10-13 | 35M/wk | github.com/prettier/eslint-plugin-prettier | SUS (too-new) | Approved — see note |
| `@eslint/js` | npm | 10.0.1, 2026-02-06 | 139M/wk | github.com/eslint/eslint | OK | Approved |
| `globals` | npm | 17.13.0, 2026-10-01 | 258M/wk | github.com/sindresorhus/globals | SUS (too-new) | Approved — see note |
| `@types/node` | npm | 26.6.5, 2026-10-09 | 461M/wk | github.com/DefinitelyTyped/DefinitelyTyped | SUS (too-new) | Approved — see note |

**Packages removed due to [SLOP] verdict:** none.

**Packages flagged as suspicious [SUS]:** `vite`, `vitest`, `eslint`, `typescript-eslint`, `prettier`, `eslint-plugin-prettier`, `globals`, `@types/node`.

> **SUS verdicts here are the recency heuristic firing on routine patch publishes of long-established packages — not slopsquatting.** Every flagged package has an official source repo, `deprecated: false`, `postinstall: null`, and 35M–461M weekly downloads. The seam's rule keys on "published within N days", and the entire modern toolchain shipped patch releases in the ~2 weeks before this research. **Disposition: approved, no human-verify checkpoint required per package** — but the planner should still treat version pins as MEDIUM confidence and re-run `npm view` at lock time (already covered by the Standard Stack "Version verification" block). If the planner prefers belt-and-braces, a single `checkpoint:human-verify` on the *combined* `package.json` install is a cheap, low-noise option.

*No packages were discovered via WebSearch-only or training-data-only in this phase — every package name here is an established, official-source-backed package. No `[ASSUMED]` package names appear in this research.*

## Architecture Patterns

### System Architecture Diagram

Phase 1 has no renderer, but the *shape* of the finished system is fixed now so later layers attach without rewrites. Data flows inward as `Command`s and outward as events/serialized state.

```text
              HOST / TRANSPORT TIER  (src/host/**)
   ┌──────────────────────────────────────────────────────────────┐
   │  Pump (swappable)                                             │
   │    rafPump ────────► performance.now() delta   (browser only) │
   │    headlessPump ───► fixed budget, no render   (Node/train)   │
   │    fixedFpsPump ───► exactly 1/recordFps       (recording)    │
   └───────────────┬──────────────────────────────────────────────┘
                   │  wall/frame budget (seconds)
                   ▼
   ┌──────────────────────────────────────────────────────────────┐
   │  runLoop(pump, sim, onRendered)   ← DOM-FREE (importable by    │
   │    acc += clamp(pump(), MAX_FRAME) │  Vitest/Node, no browser) │
   │    while acc >= DT && steps<MAX:   │                          │
   │        sim.step()                  │                          │
   │        acc -= DT                   │                          │
   │    onRendered(acc / DT)  // alpha  │                          │
   └───────────────┬──────────────────────────────────────────────┘
                   │  step()
                   ▼
═══════════ SIM CORE (src/sim/**) — DOM/clock/network FREE ═══════════
   CommandQueue.drain() ──► SYSTEM_ORDER pipeline (explicit order)
        │
        ▼
   ┌────────────┐   ┌──────────────┐   ┌───────────────┐
   │ TickClock  │   │RandomStreams │   │  EntityStore  │
   │ tick, DT   │   │ sfc32 streams│   │ id→components │
   └────────────┘   └──────────────┘   │ + ordered ids │
                                       └───────────────┘
        │
        ▼
   EventLog (typed per-tick events)  ──►  serializeState()  ──► fingerprint()
   (cleared each tick, copies out)        (canonical, ordered,   (pure hash)
                                           quantized bytes)
        │                                        │
        ▼                                        ▼
   (future: render projection,          DETERMINISM GATE (Build Tooling)
    bridge push, kingdom sim)             run twice same seed → compare
                                          per-tick fingerprints; different
                                          seed → must differ
```

**Trace the primary use case:** seed → `RandomStreams` derives named streams → `headlessPump` drives `runLoop` → each iteration calls `sim.step()` → `CommandQueue` drains → systems mutate `EntityStore` in `SYSTEM_ORDER` (using only seeded streams) → `EventLog` records → after N ticks `serializeState()` produces canonical bytes → `fingerprint()` hashes them → the gate compares two runs.

### Recommended Project Structure

```text
src/
├── sim/                        # Deterministic, headless core. NO DOM/clock/network imports.
│   ├── core/
│   │   ├── clock.ts            # TickClock (fixed DT, tick counter)
│   │   ├── rng.ts              # RandomStreams: sfc32/mulberry32 + getState/setState
│   │   ├── math.ts             # sanctioned deterministic math helpers + doc of allowed ops
│   │   └── events.ts           # EventLog + typed event union
│   ├── world/
│   │   ├── entity-store.ts     # composition-first object model + orderedEntityIds()
│   │   └── world.ts            # SimState shape (store + clock + rng + commands + events)
│   ├── systems/
│   │   └── movement.ts         # minimal deterministic system (Phase-1 stand-in)
│   ├── content/                # data-only TS constants (D-06): formulas.ts, (later classes/weapons/armor)
│   ├── commands.ts             # Command discriminated union (driver→sim contract)
│   ├── snapshot.ts             # serializeState() (canonical bytes) + fingerprint()
│   └── battle-sim.ts           # BattleSim facade: reset / submit / step / events / serialize
├── host/
│   ├── loop.ts                 # runLoop(accumulator) — DOM-free
│   ├── pump.ts                 # headlessPump / fixedFpsPump — DOM-free
│   └── pump-browser.ts         # rafPump — the ONLY browser-touching module
├── config/
│   └── sim.ts                  # FIXED_DT, AI_INTERVAL, DEFAULT_SEED, MAX_FRAME, MAX_STEPS
tests/
├── sim/
│   ├── clock.test.ts           # SIM-01
│   ├── rng.test.ts             # SIM-02
│   ├── entity-store.test.ts    # D-04/D-05 (ordered iteration)
│   └── headless.test.ts        # SIM-03
├── determinism/
│   └── gate.test.ts            # SIM-04 (double-run fingerprint compare)
└── helpers/
    └── run-sim.ts              # shared: run N ticks headless, return fingerprint trace
tsconfig.json                   # base + browser/DOM libs (host/** later render/**)
tsconfig.sim.json               # src/sim/** ONLY, "lib": ["ESNext"], "types": [] → DOM is a type error
eslint.config.js                # flat config with per-directory boundary rules
vitest.config.ts                # environment: 'node'
```

### Pattern 1: Fixed-step accumulator loop with swappable pumps

**What:** Wall/frame time is accumulated; the sim advances only in whole fixed `DT` steps; the remainder is the render interpolation factor. The *pump* — a `() => number` returning "seconds of budget this iteration" — decides pacing, and is the only place the three run modes differ.

**When to use:** Always. It is the foundation for determinism, for headless throughput, and for frame-accurate recording.

**Why the sim cannot tell the modes apart:** the loop converts time→steps; the sim only ever sees `step()`. `rafPump` reads `performance.now()` in the **host** tier (allowed); `headlessPump` returns a large/fixed budget; `fixedFpsPump` returns exactly `1/recordFps` so output frame rate is independent of the monitor.

```typescript
// src/host/loop.ts — pacing only, DOM-free, no game logic
export function runLoop(
    pump: () => number,
    sim: BattleSim,
    onRendered: (alpha: number) => void,
    cfg: { dt: number; maxFrame: number; maxSteps: number },
): () => void {
    let acc = 0;
    return () => {
        acc += Math.min(pump(), cfg.maxFrame); // clamp frame spike (spiral-of-death guard)
        let steps = 0;
        while (acc >= cfg.dt && steps < cfg.maxSteps) {
            sim.step(); // fixed dt; reads ONLY commands + seeded RNG
            acc -= cfg.dt;
            steps++;
        }
        if (steps === cfg.maxSteps) acc = 0; // drop debt — never accumulate a spiral
        onRendered(acc / cfg.dt); // alpha in [0,1) for later interpolation
    };
}
```

| Pump | Used by | Behavior |
|------|---------|----------|
| `rafPump` | watch mode (Phase 5) | returns real frame delta from `performance.now()` — **host-only, browser-only module** |
| `headlessPump` | tests + training | returns a fixed large budget → step as fast as possible; **never touches a clock** |
| `fixedFpsPump` | recording (Phase 6) | returns exactly `1/recordFps` per iteration → deterministic frame cadence |

- `[CITED: gafferongames.com/post/fix_your_timestep]` — canonical accumulator, clamp, drain-excess (the "Fix Your Timestep" pattern, GM); corroborated by DriftEngine and hayao determinism docs.
- **Design consequence:** `runLoop` and `headlessPump`/`fixedFpsPump` live in **DOM-free** modules so Vitest (`environment: 'node'`) can import them. `rafPump` is isolated into `host/pump-browser.ts` so the browser reference never leaks into the test graph.

### Pattern 2: `RandomStreams` — one master seed, multiple independent, serializable streams

**What:** A single facade owns a map of **named** PRNG streams (`spawn`, `damage`, `ai`, `bt-tiebreak`, …). Each stream is seeded by expanding the master seed through a splitmix/xmur3-style mixer so streams are independent (drawing extra numbers from one does not shift another). Each stream exposes `getState()`/`setState()` returning **plain JSON-serializable data** (numbers only) so the whole RNG state round-trips through `serializeState()`/snapshot.

**When to use:** Every sim randomness source. Ban `Math.random` in `sim/**` by lint.

**Trade-offs:** `sfc32` (128-bit state) is the recommended default; `mulberry32` (32-bit) is simpler but its counter is never wrapped, so quality degrades after ~4.9M draws (use a "savable" variant that exposes position as one integer if you pick it). Never expose the raw generator — only the facade — so the stream set is enumerable for serialization.

```typescript
// src/sim/core/rng.ts (shape)
export interface RngStream {
    next(): number; // [0,1)
    getState(): readonly number[]; // JSON-serializable
    setState(s: readonly number[]): void;
}
export class RandomStreams {
    private streams = new Map<string, RngStream>();
    constructor(seed: number, names: readonly string[]) {
        for (const n of names) this.streams.set(n, makeSfc32(mixSeed(seed, n)));
    }
    stream(name: string): RngStream { /* throws if unknown — typo is a bug, not silent */ }
    save(): Record<string, readonly number[]> { /* JSON-serializable */ }
    restore(s: Record<string, readonly number[]>): void { /* inverse */ }
}
```
- `[CITED: npmjs.com/package/seeded-random-utilities]` — documents sfc32/mulberry32/xoshiro128** state save/resume and per-stream seeding (feature reference); `[CITED: driftengine.dev/docs/concepts/determinism]` — `savableMulberry32` save/restore as the rollback primitive.

### Pattern 3: Composition-first entity store with a stable ordered id array

**What:** An entity is a plain object keyed by a monotonic `entityId`; components are fields (`attrs`, `xform`, `ai`, …). Systems are explicit functions (`movementSystem(world)`) run in a fixed `SYSTEM_ORDER`. Iteration is **always** over a stable ordered id array, never over `Map`/`Set`/object-key order.

**When to use:** Always (D-04). No ECS framework (D-04), no inheritance hierarchy.

**Why:** ~20–40 concurrent units make archetype storage pure overhead (D-04). Critically, **JS `Map`/`Set` are insertion-ordered *but* `delete`+re-`add` moves the element to the end** — a kill/respawn path silently reorders iteration and breaks determinism. Keep a separate `orderedIds: EntityId[]` (append on spawn, swap-free removal preserving order, or sort on demand) and iterate that.

```typescript
// src/sim/world/entity-store.ts (shape)
export type EntityId = number;
export interface UnitComponents {
    attrs: { hp: number; level: number };
    xform: { x: number; y: number; vx: number; vy: number };
    // ... ai, equip, faction added in later phases
}
export class EntityStore {
    private nextId = 1;
    private orderedIds: EntityId[] = []; // ← the iteration contract
    private byId = new Map<EntityId, UnitComponents>();
    spawn(): EntityId { /* monotonic id (D-05), append to orderedIds */ }
    despawn(id: EntityId): void { /* remove from BOTH, preserving orderedIds order */ }
    ids(): readonly EntityId[] { return this.orderedIds; } // iterate THIS
}
```
- `[CITED: cstsolution.com/blog/deterministic-simulation/]` — "In JavaScript, `Map` and `Set` are insertion-ordered by spec, but … re-adding an element moves it to the end — exactly what a kill-and-respawn path does."

### Pattern 4: `Command` union — the single inward control contract

**What:** All external control (local input now; RL/Python and future kingdom/LLM later) enters as a discriminated union, submitted to a `CommandQueue`, and **drained once at the start of `step()`**. The sim never polls a device, socket, or clock.

**When to use:** Always. This is what makes a run reproducible from a recorded command log and lets async drivers be late without breaking determinism (a late command is skipped for its tick — documented, deterministic).

**Grounded in the spec** — the AI/command surface is: four-direction forces, a directional torque, a weapon skill, and a unit skill:

> `.planning/reference/ai-marble-kingdom.md:153-158` — AI 输出包括：给单位在上下左右方向施加指定大小的力。/ 向单位施加指定大小的顺时针或逆时针旋转的力。/ 使用单位某个武器的特殊能力（比如弓箭射箭）。/ 使用单位本身的某个特殊能力。`[VERIFIED: .planning/reference/ai-marble-kingdom.md:153-158]`

```typescript
// src/sim/commands.ts
export type Command =
    | { kind: 'force'; unit: EntityId; fx: number; fy: number; atTick: number }
    | { kind: 'torque'; unit: EntityId; amount: number; atTick: number }   // signed: cw-/ccw+
    | { kind: 'weaponAbility'; unit: EntityId; weaponId: number; atTick: number }
    | { kind: 'unitAbility'; unit: EntityId; abilityId: number; atTick: number }
    | { kind: 'spawn'; unit: EntityId; classId: number; x: number; y: number } // reserved (kingdom)
    ;
```
- `[CITED: .planning/research/ARCHITECTURE.md §Pattern 2]` — commands sampled once per tick at the boundary.

### Pattern 5: Minimal deterministic system so the gate is non-vacuous

**What:** Phase 1 has no physics/combat, but a fingerprint gate over *static* state proves nothing. Ship a minimal but genuinely state-mutating deterministic system — e.g. `movementSystem` integrating positions from queued `force` commands plus a seeded `ai`-stream nudge — so the fingerprint changes per tick and diverges if any nondeterminism leaks.

**When to use:** This phase. It is the fixture the determinism gate runs against.

**Trade-offs:** Keep it deliberately tiny and clearly labelled as a Phase-1 stand-in; it will be superseded by real systems but must remain CPU-trivial so the gate is fast.

```typescript
// src/sim/systems/movement.ts (Phase-1 stand-in)
export function movementSystem(w: SimState, dt: number): void {
    for (const id of w.store.ids()) {           // ordered iteration
        const c = w.store.get(id);
        const nudge = w.rng.stream('ai').next() - 0.5; // seeded, deterministic
        c.xform.vx += nudge * 0.001;
        c.xform.x += c.xform.vx * dt;
        c.xform.y += c.xform.vy * dt;
    }
}
```

### Pattern 6: Canonical serialization + fingerprint (the gate primitive)

**What:** Split the concern in two: `serializeState(state): Uint8Array` produces a **canonical, ordered, quantized** byte encoding (fields in fixed order, entities in `orderedIds` order, floats quantized to a fixed grid), and `fingerprint(bytes): string` hashes those bytes. The determinism gate hashes per tick and compares two runs.

**When to use:** In tests on every commit (via the pre-commit gate), and later in RL reset (snapshot/restore).

**Trade-offs (important for Phase 1):**
- **Quantize before hashing.** Raw float bits flag divergence at step 1 (too brittle if any benign allocation order changes); coarse quantization still catches real divergence within ~367 steps because chaos amplifies fast. Pick one quantization (e.g. round to 1/256) and keep it stable.
- **Do not hand-roll a byte-at-a-time JS hash for large state.** One study measured a JS FNV-1a loop at **127% the cost of the sim step it guards**; Node's native SHA-256 was ~8.8× faster. At Phase-1's tiny state a small pure hash is fine, but keep the hash *separable* from serialization so it can be swapped for a native/vectorized hash when state grows (Phase 4+). The Node test harness may legitimately use `node:crypto` because it is **Build Tooling, not the sim** — but the *sim* must not import `node:*` (browser target).
- Assert `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))` — this catches state the serializer forgot.

```typescript
// src/sim/snapshot.ts (shape)
export function serializeState(s: SimState): Uint8Array { /* canonical, ordered, quantized */ }
export function fingerprint(bytes: Uint8Array): string { /* small pure hash over bytes */ }
```
- `[CITED: cstsolution.com/blog/deterministic-simulation/]` — hash-cost table, quantization latency, V8-tier reproducibility of float64 `+ - * / sqrt`.

### Anti-Patterns to Avoid

- **Driving the sim from `requestAnimationFrame` delta.** Variable `dt` makes physics path-dependent and (later) changes damage; also rAF pauses in background tabs (Pitfall 3 in project research). Use the accumulator + pumps.
- **Module-level mutable singletons inside `sim/`.** The predecessor's `renderer`/`scene`/`recorder` globals made reset leaky. The sim is constructed explicitly and passed in.
- **`throw new Error('Method not implemented.')` stubs.** The predecessor's `Role`/`BodyBase` stubs were never wired. Phase 1 must ship working minimal systems, not placeholder base classes.
- **Storing the fingerprint as the *definition* of equality without serialization.** If the fingerprint omits state that affects the sim, two divergent worlds report agreement. Serialize exhaustively; a mutator census test ("every mutator must move the fingerprint") guards this.
- **Iterating `Map`/`Set`/object keys for sim logic.** Silent reorder on delete+re-add.
- **Letting `sim/**` import `node:*` or DOM.** Breaks the browser target and headless purity; enforce via tsconfig + ESLint.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Deterministic fixed-step loop | A custom time/step scheme | The Gaffer accumulator (`runLoop` above) | Extensively validated pattern; the spiral-of-death clamp is a subtle correctness detail, not a style choice. |
| PRNG algorithm | A bespoke LCG you invented | `sfc32` (or `mulberry32` savable variant) | Published, tested, minimal; a bespoke generator risks hidden state/quality bugs. **But you *do* hand-roll the ~20-line implementation** — see note below. |
| Seeded stream derivation | Re-seeding one generator per concern with `seed + index` | A splitmix/xmur3 mixer over `(seed, name)` | Naive `seed+i` seeds produce correlated streams; a mixer decorrelates them. |
| Boundary enforcement | Discipline + code review | ESLint boundary rules **and** a DOM-free `tsconfig.sim.json` | Review misses things; the compiler catches `window`/`document` as a *type error*, lint catches imports/properties. |
| Determinism gate | A bespoke "run the sim and eyeball it" script | A Vitest test comparing per-tick fingerprints of two seeded runs | Must be automated and fail loudly; ad-hoc checks rot. |
| Hash of large state (later) | A per-byte JS hash loop | Node native `crypto` (harness) or a vectorized/WASM hash | A JS byte loop can exceed the cost of the step it guards. |

**Key insight — the PRNG is the deliberate exception.** Normally "don't hand-roll crypto/PRNG" applies, but this is not crypto: `sfc32`/`mulberry32` are ~10–20 lines of exact integer arithmetic, and hand-rolling them is *the* way to guarantee the **serializable state shape** the determinism requirement demands (you cannot rely on a library's internal state being JSON-round-trippable). Pull in a dependency only if you need many algorithms; you don't.

**Second insight — enforce boundaries twice.** ESLint stops the *imports you thought of*; a DOM-free tsconfig stops *every use of a DOM global* because the `lib` simply doesn't declare it. Use both. This is the structural guarantee of SIM-03 (headless) and D-03 (future cross-machine tightening).

## Common Pitfalls

### Pitfall 1: typescript-eslint cannot run on TypeScript 7 (no programmatic API until 7.1)
**What goes wrong:** Installing `typescript@^7` and `typescript-eslint` together makes ESLint crash inside `@typescript-eslint/typescript-estree` (or `pnpm`/`npm` refuses install) because TS 7.0 ships no compiler API.
**Why it happens:** TS 7.0 is a Go-native compiler; the JS programmatic API is deferred to 7.1. typescript-eslint's peer range is `>=4.8.4 <6.1.0` (verified).
**How to avoid:** Official side-by-side layout — `"typescript": "npm:@typescript/typescript6@^6.0.2"` (API + `tsc6`) and `"@typescript/native": "npm:typescript@^7.0.2"` (native `tsc`). Keep the TS7 package at the **workspace root** so pnpm does not peer-match typescript-eslint against the API-less v7.
**Warning signs:** ESLint crash on `require('typescript')`; `npm ci` peer error; `npx tsc --version` reporting 6.x unexpectedly.
**Provenance:** `[VERIFIED: npm registry]` (peer range), `[CITED: devblogs.microsoft.com/typescript/announcing-typescript-7-0/]`, `[CITED: github.com/typescript-eslint/typescript-eslint/issues/12518]`.

### Pitfall 2: the TS6 compat package's transitive `tsc` bin shadowing TS7 (npm-only)
**What goes wrong:** Under **npm**, the compat package's transitive `@typescript/old` declares a `tsc` bin that wins at the root, so `tsc --build` silently compiles with TS 6 while the project believes it is on TS 7.
**Why it happens:** npm hoists transitive deps into the root `.bin`. pnpm does **not** hoist transitive deps, so it links `tsc` to TS 7.
**How to avoid:** Use **pnpm** (the project already does, v12.5.1). If a script must be unambiguous, name the compiler by path (`node_modules/typescript/bin/tsc`) or pin the alias layout to the documented direction.
**Warning signs:** `npx tsc --version` reports 6.x; a build that should fail on `unstable/*` imports passes.
**Provenance:** `[CITED: github.com/microsoft/TypeScript/issues/64071]`.

### Pitfall 3: the fingerprint hash costs more than the sim step it guards
**What goes wrong:** A hand-rolled byte-at-a-time JS hash (e.g. naive FNV-1a) over a full state dump can exceed the cost of the step — one measurement: 26.92 µs hash vs 21.21 µs step (127%).
**Why it happens:** JS byte loops are slow; native hashing is not.
**How to avoid:** Keep `serializeState()` (canonical bytes) separate from `fingerprint()`. At Phase-1 scale a small pure hash is fine; when state grows, hash the same bytes with Node `crypto` in the harness or a vectorized/WASM hash. Never hash raw float bits unquantized if you want stability across benign allocation changes.
**Warning signs:** the determinism test becomes the slowest test; per-tick fingerprinting dominates profiler output.
**Provenance:** `[CITED: cstsolution.com/blog/deterministic-simulation/]`.

### Pitfall 4: `Map`/`Set` delete-and-re-add silently reorders iteration
**What goes wrong:** You respawn a unit (delete then add), and its iteration position moves to the end of the collection, changing the order systems process entities → different results for the same seed.
**Why it happens:** JS `Map`/`Set` are insertion-ordered, and re-insertion is a new insertion.
**How to avoid:** Maintain an explicit `orderedIds: EntityId[]` and iterate that; treat the `Map` as a lookup index only.
**Warning signs:** determinism breaks only after a kill/respawn; divergence appears after entity churn.
**Provenance:** `[CITED: cstsolution.com/blog/deterministic-simulation/]`.

### Pitfall 5: `Math.random` / wall-clock leaking into sim state
**What goes wrong:** A single `Math.random()` (spawn jitter, tie-break) or `Date.now()` (a "time" comparison) makes two runs of the same seed diverge immediately.
**Why it happens:** Convenience; the sim code is written in a browser habit.
**How to avoid:** Lint bans (`no-restricted-properties` for `Math.random`/`Date.now`/`performance.now`, `no-restricted-syntax` for `new Date()`); route all randomness through `RandomStreams`; time is `TickClock.tick`.
**Warning signs:** same-seed divergence from tick 1; `grep Math.random src/sim` hits.
**Provenance:** `[CITED: .planning/research/PITFALLS.md §Pitfall 1-2]`, `[CITED: cstsolution.com/blog/deterministic-simulation/]`.

### Pitfall 6: Vite 8 renamed config keys (Rollup→Rolldown, esbuild→Oxc)
**What goes wrong:** Copy-pasting Vite 7 config (`build.rollupOptions`, `esbuild: {...}`) yields deprecation warnings or silent no-ops under Vite 8.
**Why it happens:** Vite 8 replaced esbuild+Rollup with Rolldown+Oxc.
**How to avoid:** Use `build.rolldownOptions`/`worker.rolldownOptions` and `oxc`; expect `build.commonjsOptions` to be a no-op; `esbuild` is now an optional dependency. Set `build.target` to `esnext`/`es2022` if any top-level await / WASM asset work appears (Phase 2).
**Warning signs:** "esbuild option is deprecated" warnings; a plugin importing `transformWithEsbuild` fails to resolve `esbuild`.
**Provenance:** `[CITED: vite.dev/guide/migration]`, `[CITED: vite.dev/blog/announcing-vite8]`.

### Pitfall 7: TS 7 stricter/moved compiler options
**What goes wrong:** `rootDir` is no longer inferred (must be explicit), and `downlevelIteration` is removed (no-op at ES2024) — old tsconfigs error or behave differently.
**Why it happens:** TS 6/7 changed defaults and removed deprecated options.
**How to avoid:** Set `rootDir` explicitly; drop `downlevelIteration`; ensure no `ignoreDeprecations`; consider `stableTypeOrdering` for TS6/TS7 parity of type-check output.
**Warning signs:** new diagnostics on a previously clean project; extra emitted path levels.
**Provenance:** `[CITED: github.com/langfuse/langfuse/pull/14921]`, `[CITED: nx.dev/docs/kb/typescript-7]`.

### Pitfall 8: making the determinism gate vacuous
**What goes wrong:** The "sim" mutates nothing deterministic-per-tick, so the double-run test compares two identical *static* states and passes trivially — proving nothing.
**Why it happens:** Phase 1 has no physics yet; it is tempting to fingerprint an empty world.
**How to avoid:** Ship a minimal mutating system (Pattern 5) and assert that (a) two same-seed runs match **per tick**, (b) two different seeds differ, and (c) mutating any state field changes the fingerprint.
**Warning signs:** the gate passes even if you comment out a system; the fingerprint is constant across ticks.
**Provenance:** `[ASSUMED]` (design inference from the phase goal).

## Code Examples

### Example 1: Two-layer boundary — DOM-free tsconfig for `src/sim/**`

The type-level half of the boundary. `"lib": ["ESNext"]` (no `DOM`) makes every DOM global a compile error inside `sim/`; `"types": []` refuses `@types/node`.

```jsonc
// tsconfig.sim.json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "lib": ["ESNext"],        // ← NO "DOM", NO "DOM.Iterable"
    "types": [],              // ← no node typings inside sim/
    "rootDir": "src/sim"      // ← TS 7 no longer infers rootDir
  },
  "include": ["src/sim/**/*.ts"]
}
```

### Example 2: ESLint flat-config boundary rules for `sim/**`

The import-level half. Bans upward imports, DOM globals, `Math.random`, wall-clock reads, and `new Date()`.

```js
// eslint.config.js (excerpt)
export default [
    { ignores: ['node_modules', 'dist', 'public', 'coverage'] },
    // ...base JS/TS configs...
    {
        files: ['src/sim/**/*.ts'],
        rules: {
            // No upward / foreign imports from the deterministic core
            'no-restricted-imports': ['error', {
                patterns: [
                    { group: ['**/render/**', '**/host/**', '**/driver/**', 'pixi.js', 'pixi.js/*', 'node:*'],
                      message: 'sim/ must stay headless: no render/host/driver/pixi/node imports.' },
                    { group: ['**/sim/**'],
                      message: 'Import sim modules by their public entrypoint, not deep paths.' }
                ]
            }],
            // No DOM/worker/browser globals
            'no-restricted-globals': ['error',
                { name: 'window', message: 'sim/ is headless.' },
                { name: 'document', message: 'sim/ is headless.' },
                { name: 'requestAnimationFrame', message: 'Pacing lives in host/.' },
                { name: 'performance', message: 'Time is TickClock — never the wall clock.' },
                { name: 'Date', message: 'No wall-clock in sim/.' },
                { name: 'setTimeout', message: 'No timers in sim/.' },
                { name: 'Math', message: 'Use sim/core/math.ts sanctioned helpers where required.' }
            ],
            // No unseeded randomness / wall-clock reads on allowed objects
            'no-restricted-properties': ['error',
                { object: 'Math', property: 'random', message: 'Use RandomStreams (seeded).' },
                { object: 'Date', property: 'now', message: 'Use TickClock.tick.' },
                { object: 'performance', property: 'now', message: 'Use TickClock.tick.' }
            ],
            // No `new Date()` anywhere in the core
            'no-restricted-syntax': ['error',
                { selector: "NewExpression[callee.name='Date']", message: 'No wall-clock in sim/.' }
            ]
        }
    }
];
```
- `[CITED: eslint.org/docs/latest/rules/no-restricted-imports]` (paths/patterns/regex), `[CITED: typescript-eslint.io/rules/no-restricted-imports/]` (core rule now handles TS import syntax since ESLint 9.37).
- **Caveats the planner must resolve during implementation:**
  - Banning the global `Math` wholesale is aggressive; prefer listing only the offending properties via `no-restricted-properties` and keeping trig *allowed* per D-02 (avoid over-blocking). The `Math` global restriction above is shown for completeness — **decide explicitly**.
  - `no-restricted-globals` matches *undeclared* globals; if `tsconfig.sim.json` already has no DOM lib, many of these are already compile errors — the two layers are complementary, not redundant.

### Example 3: Vitest config + determinism gate test

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config';
export default defineConfig({
    test: {
        environment: 'node',       // default, but be explicit: the core is headless
        include: ['tests/**/*.test.ts'],
        coverage: { provider: 'v8', include: ['src/sim/**'] }
    }
});
```

```typescript
// tests/determinism/gate.test.ts
import { describe, expect, it } from 'vitest';
import { runTrace } from '../helpers/run-sim'; // headless: returns per-tick fingerprints

describe('determinism gate (SIM-04)', () => {
    it('same seed → identical per-tick fingerprint trace', () => {
        const a = runTrace({ seed: 12345, ticks: 600 });
        const b = runTrace({ seed: 12345, ticks: 600 });
        expect(a).toEqual(b);            // per-tick, not just final
    });

    it('different seed → different fingerprint', () => {
        const a = runTrace({ seed: 12345, ticks: 600 });
        const c = runTrace({ seed: 99999, ticks: 600 });
        expect(c).not.toEqual(a);
    });

    it('fingerprint tracks state (not a constant)', () => {
        const t = runTrace({ seed: 1, ticks: 10 });
        expect(new Set(t).size).toBeGreaterThan(1); // state actually evolves
    });
});
```

### Example 4: Pre-commit gate without CI (D-09)

Zero-dependency hook wiring (matches "scripted and used as a pre-commit gate"; no GitHub Actions).

```bash
# one-time, per clone:
git config core.hooksPath .githooks
```

```sh
# .githooks/pre-commit  (chmod +x on POSIX; Windows users run via Git Bash)
#!/bin/sh
pnpm run lint && pnpm vitest run tests/determinism --reporter=dot || {
  echo "Determinism gate failed — refusing to commit."; exit 1;
}
```
> On Windows (this repo's environment), `core.hooksPath` hooks are executed by the Git-for-Windows `sh`, so a POSIX `#!/bin/sh` script is correct. Document the `chmod +x` / `git update-index --chmod=+x` step. Alternative: `husky`/`simple-git-hooks` if the team prefers JS hooks — but that adds a dependency for a one-line gate.

### Example 5: `TickClock` (SIM-01)

```typescript
// src/sim/core/clock.ts
export class TickClock {
    private _tick = 0;
    constructor(readonly dt: number) {}   // e.g. 1/60 — from src/config/sim.ts
    get tick(): number { return this._tick; }
    step(): void { this._tick++; }        // the ONLY way time advances
}
```
> **Spec anchor for `dt`:** `.planning/reference/ai-marble-kingdom.md:16` — "游戏推理间隔（也就是 tick 间隔）为游戏的一分钟。… 即推理间隔为现实一秒钟对应的时长的 1/60。" At 1×, one game minute per real second ÷ 60 = **1/60 s per tick**. `[VERIFIED: .planning/reference/ai-marble-kingdom.md:16]`
> **Spec anchor for AI cadence:** `.planning/reference/ai-marble-kingdom.md:142` — "AI 会每 6 帧进行一次操控，即每 0.1 秒操控一次。" → `AI_INTERVAL = 6` fixed steps (Phase 4; reserve the constant now). `[VERIFIED: .planning/reference/ai-marble-kingdom.md:142]`

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `tsc` = JS compiler, run everywhere | TS 7 = native Go `tsc`; TS 6 kept for API | TS 7.0 GA 2026-07-08 | 8–12× faster type-checks; but lint/framework tooling must stay on TS 6 API (side-by-side). |
| Vite = esbuild + Rollup | Vite 8 = Rolldown + Oxc | Vite 8, 2026-03-12 | Unified Rust bundler; renamed `rollupOptions`→`rolldownOptions`, `esbuild`→`oxc`. |
| Vitest `workspace` | Vitest `projects` | Vitest 3.2 (deprecated) → 5.0 | Use `test.projects`; inline projects inherit root config by default in v5. |
| Hand-rolled PRNG copy-paste per file | Named, seeded, serializable stream facade | — | Enumerable state for snapshot/restore; decorrelated streams. |

**Deprecated/outdated (do not use):**
- `planck-js`, `@motajs/client`, Vue, RLlib, the entire old `src/`/`model/` — all discarded by the rewrite decision.
- Vite `rollupOptions`/`esbuild` config keys; `build.commonjsOptions` (no-op).
- Vitest `workspace` key.
- `tsc` from the plain `typescript` package as the *only* TS install (breaks typescript-eslint).

## Assumptions Log

> Claims tagged `[ASSUMED]` in this research. The planner and discuss-phase should treat these as needing confirmation before they become locked decisions.

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | A minimal `movementSystem` (commands + seeded nudge integrating positions) is an acceptable Phase-1 fixture to make the gate non-vacuous, and won't conflict with Phase 2's real physics. | Pattern 5, Pitfall 8 | If Phase 2 replaces it wholesale, the gate fixture is throwaway — low cost, but the phase-1 "sim" would be judged trivial. |
| A2 | A pure-TS non-cryptographic hash (e.g. FNV-1a / cyrb53) is acceptable at Phase-1 state scale; native/WASM hashing is deferred. | Pattern 6, Pitfall 3 | If state is larger than expected, the gate test becomes slow; mitigation is swapping in `node:crypto` in the harness (no sim change). |
| A3 | Quantization grid of ~1/256 before hashing is appropriate (vs raw bits or coarser). | Pattern 6 | Too fine → brittle false positives; too coarse → delayed detection (still ~seconds). Low risk; easy to tune. |
| A4 | A single package with directory boundaries is sufficient; a pnpm workspace is not needed this phase. | Standard Stack / Structure | If boundaries are repeatedly violated, migrate to workspace packages (more work, but the seam is already lint-enforced). |
| A5 | `core.hooksPath` + a POSIX `sh` pre-commit script works on the maintainer's Windows setup via Git-for-Windows. | Example 4 | Hook silently not run on Windows if `sh` isn't on PATH; fallback is `husky`/`simple-git-hooks` or a manual `pnpm gate`. |
| A6 | Banning the global `Math` in `sim/**` is *not* desired (D-02 allows trig); only `Math.random` is banned. | Example 2 caveat | Over-blocking would force needless `sim/core/math.ts` indirection for allowed operations. |
| A7 | Runtime `Config` in Phase 1 can be plain typed TS constants; a `zod` schema is deferred to when I/O/config actually appears (Phase 6). | Standard Stack (not-required note) | If a runtime-config need appears early, add zod then; D-06 favors TS modules this phase. |

**If this table is empty:** n/a — it is not empty; see above.

## Open Questions

1. **(RESOLVED — TS 7.0.2 / Node 24.21 type-check the DOM-free `tsconfig.sim.json` and the base project cleanly; `pnpm run typecheck` is a green required verify in Plans 01-01…01-08.)** **Does `tsc` (TS 7 native) fully type-check the DOM-free `tsconfig.sim.json` + the DOM `tsconfig.json` with zero surprises on this toolchain (TS 7.0.2 / Node 24.21)?**
   - What we know: TS 7 is designed to match TS 6 type-checking/CLI behavior; `rootDir` must be explicit; `downlevelIteration` removed.
   - What's unclear: whether any option in the existing `tsconfig.json` is deprecated/removed and errors under TS 7.
   - Recommendation: **Spike task at the start of Plan 01-01** — install the side-by-side layout, run `tsc --version` (expect 7.x), `tsc6 --version` (expect 6.x), and `pnpm typecheck` on a trivial `sim/` file; confirm ESLint starts.

2. **(RESOLVED — ESLint 10 + typescript-eslint (aliased TS 6 API) ran; Plan 01-03 wired the `sim/**` boundary block and `pnpm run lint` is a required gate. Plan 01-08 extends the block to `src/config/**`.)** **Does `typescript-eslint@8.71.2` typed linting (`projectService: true`) run cleanly against the aliased TS 6 API on ESLint 10?**
   - What we know: peer ranges accept `eslint ^10` and `typescript <6.1.0`; TS 7 has no API until 7.1.
   - What's unclear: whether the project-service resolves the aliased TS6 correctly under pnpm.
   - Recommendation: **Spike in Plan 01-01** alongside Q1; if typed linting is problematic, fall back to non-type-aware rules for Phase 1 (boundary rules are non-type-aware anyway).

3. **(RESOLVED — `QUANT_GRID = 1/256` is a documented constant in `src/sim/snapshot.ts`; `tests/sim/snapshot.test.ts` (Plan 01-04) perturbs one field by more than `1/256` and asserts the fingerprint changes.)** **What is the exact quantization + hash choice for the fingerprint?**
   - What we know: quantization is cheap insurance; hash cost matters only at scale.
   - What's unclear: the "right" grid for this sim's magnitude.
   - Recommendation: pick 1/256, document it as a constant in `snapshot.ts`, and add a test that perturbing one field by >1/256 changes the fingerprint.

4. **(RESOLVED — the pre-commit hook (`.githooks/`, Plan 01-04) runs `pnpm gate`; the gate is fast at Phase-1 scale. No CI this phase, per D-09.)** **Does the pre-commit gate belong on `git commit` (slow) or as a manual `pnpm gate` plus a documented rule?**
   - What we know: D-09 says "scripted and used as a pre-commit gate".
   - What's unclear: acceptable commit latency.
   - Recommendation: keep the gate test fast (<~2 s at Phase-1 scale); if it grows, split into a fast subset on commit and full `pnpm test` manually.

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|------------|-----------|---------|----------|
| Node.js | Everything (needs ≥22.12) | ✓ | v24.21.0 | — |
| pnpm | Package manager (D-07 layout safe under pnpm) | ✓ | 12.5.1 | npm (with the Pitfall 2 caveat) |
| npm | Registry queries / version verification | ✓ | 11.19.0 | — |
| git | Pre-commit gate (D-09), history | ✓ | present | — |
| `typescript` (TS 7 native) | type-check/build | ✗ (to install) | — (target 7.0.2) | TS 6 line if a plugin lags |
| `@typescript/typescript6` | typescript-eslint API | ✗ (to install) | — (target 6.0.2) | none — required for lint |
| `vite` | build/dev (Phase 5 usage; configured now) | ✗ (to install) | — (target 8.3.4) | — |
| `vitest` | tests + gate | ✗ (to install) | — (target 5.0.4) | — |
| Chrome | Phase 5 render only | not needed Phase 1 | — | — |
| ffmpeg | Phase 6 recording only | not needed Phase 1 | — | — |
| Python | Phase 6 training only | not needed Phase 1 | — | — |

**Missing dependencies with no fallback:**
- None that block planning — all are npm dev-dependencies installed as the first task.

**Missing dependencies with fallback:**
- If `typescript@7` proves incompatible with any required tool, fall back to the TS 6.0.x line (`typescript@^6.0.2`) for the whole project (D-07 permits "最新版" but a fallback is cheap; the determinism core does not depend on TS 7 features).

## Validation Architecture

> `workflow.nyquist_validation` is `true` in `.planning/config.json` → this section is included.

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Vitest `5.0.4` (Node ≥22.12, Vite ≥6.4) |
| Config file | `vitest.config.ts` — **does not exist yet; created in Wave 0** |
| Quick run command | `pnpm vitest run tests/sim` |
| Full suite command | `pnpm test` (i.e. `vitest run`) |
| Gate command | `pnpm gate` (i.e. `vitest run tests/determinism`) |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIM-01 | Fixed step decoupled from rendering; state depends on step count, not wall clock | unit | `pnpm vitest run tests/sim/clock.test.ts` | ❌ Wave 0 |
| SIM-01 | Accumulator turns a wall/frame budget into whole `DT` steps; clamps spikes; caps steps/frame | unit | `pnpm vitest run tests/host/loop.test.ts` | ❌ Wave 0 |
| SIM-02 | Same seed → same stream sequence; different seed → different; `getState`/`setState` round-trips | unit | `pnpm vitest run tests/sim/rng.test.ts` | ❌ Wave 0 |
| SIM-02 | No unseeded randomness / wall-clock in `sim/**` | static lint | `pnpm lint` | ❌ Wave 0 (config) |
| SIM-03 | Full sim runs headless (Node env, no DOM, no clock) and produces state | integration | `pnpm vitest run tests/sim/headless.test.ts` | ❌ Wave 0 |
| SIM-03 | `sim/**` imports no DOM/node/pixi (module graph guard) | static lint + typecheck | `pnpm lint && pnpm typecheck` | ❌ Wave 0 (config) |
| SIM-04 | Same seed twice → identical per-tick fingerprint trace; different seed → different; state evolves | integration | `pnpm vitest run tests/determinism` | ❌ Wave 0 |
| SIM-04 | `fingerprint(restore(serialize(s))) === fingerprint(serialize(s))` (serializer completeness) | unit | `pnpm vitest run tests/sim/snapshot.test.ts` | ❌ Wave 0 |
| D-04/D-05 | `entityId` monotonic; iteration order stable across spawn/despawn (no Map reorder) | unit | `pnpm vitest run tests/sim/entity-store.test.ts` | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `pnpm vitest run tests/sim` (fast unit subset).
- **Per wave merge:** `pnpm test` (full suite).
- **Phase gate:** `pnpm gate && pnpm test` green before `/gsd-verify-work`; the gate is also wired as the pre-commit hook (D-09).

### Wave 0 Gaps
- [ ] `package.json` toolchain install — side-by-side TS6/TS7 layout, Vite, Vitest, ESLint, Prettier, `typecheck`/`test`/`gate`/`lint` scripts (D-07/D-08).
- [ ] `tsconfig.json` (base) + `tsconfig.sim.json` (DOM-free, `lib:["ESNext"]`, `types:[]`, explicit `rootDir`).
- [ ] `eslint.config.js` — flat config with `sim/**` boundary rules (Example 2).
- [ ] `vitest.config.ts` — `environment: 'node'`, include `tests/**`.
- [ ] `tests/helpers/run-sim.ts` — headless trace runner (shared by SIM-03/SIM-04).
- [ ] `tests/sim/*.test.ts` and `tests/determinism/gate.test.ts` scaffolds.
- [ ] `.githooks/pre-commit` + `git config core.hooksPath .githooks` (D-09).
- [ ] `.prettierrc` carried over from the old repo (4-space, single quotes, no trailing comma, arrow-parens avoid).
- [ ] `.gitignore` check — confirm `checkpoint/`, `video/`, `dist/`, `coverage/` ignored; add any external output dir (D-10).

*(No existing test infrastructure exists — the old repo had none; everything is Wave 0.)*

## Security Domain

> `security_enforcement` is `true` (ASVS level 1, block on high) in `.planning/config.json` → included.

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|-----------------|
| V2 Authentication | no | Phase 1 is a single-process in-memory sim; no users/sessions. (Bridge auth is Phase 6.) |
| V3 Session Management | no | No sessions this phase. |
| V4 Access Control | no | No external callers this phase. |
| V5 Input Validation | yes (minimal) | Validate `Command` shapes at the sim boundary (structural — every command must carry required fields and a well-formed `entityId`/`atTick`); reject/ignore unknown `kind` deterministically. No untrusted network input yet. |
| V6 Cryptography | yes (correctly scoped) | **The fingerprint hash is non-cryptographic and must never be used for security.** Document this in `snapshot.ts`. Do not hand-roll crypto; when the bridge appears (Phase 6), use standard TLS/localhost binding. |
| V7 Error/Logging | no (minimal) | Deterministic errors only; no secrets to log. |

### Known Threat Patterns for a headless deterministic core

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| Nondeterministic input leaking into sim state (the "correctness" analogue of tampering) | Tampering | Seeded `RandomStreams` only; lint ban on `Math.random`/wall-clock; ordered iteration; gate test. |
| Serializer omitting state → "two different worlds, same fingerprint" (a trust failure) | Tampering / Repudiation | Exhaustive canonical serialization + `restore` round-trip test + mutator-census test ("every mutator moves the fingerprint"). |
| Misusing a non-cryptographic fingerprint as a security token | Spoofing | Document explicitly that the fingerprint is a *diagnostic*, not an authenticator. |
| Loading untrusted snapshots (future) | Tampering | Out of scope Phase 1 (no snapshots leave the process); note for Phase 6 (`only load version-matched trusted snapshots`). |

**Phase-1 security posture:** there is no network surface, no persistence, and no user input, so the security work is limited to (a) keeping the fingerprint correctly scoped as non-cryptographic and (b) the `Command` boundary being total (no silent no-op branches, no undefined dereference — the predecessor's observed `TypeError` class). Full bridge hardening is a Phase 6 concern.

## Sources

### Primary (HIGH confidence)
- npm registry `latest` + `peerDependencies`, verified 2026-10-15: `typescript@7.0.2`, `@typescript/typescript6@6.0.2`, `vite@8.3.4`, `vitest@5.0.4`, `eslint@10.12.0`, `typescript-eslint@8.71.2` (peer `eslint ^8.57||^9||^10`, `typescript >=4.8.4 <6.1.0`), `@eslint/js@10.0.1`, `globals@17.13.0`, `prettier@3.9.10`, `eslint-plugin-prettier@5.5.7`, `@types/node@26.6.5`.
- TypeScript 7.0 announcement — `https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/` (native compiler; no API until 7.1; `@typescript/typescript6` side-by-side; `tsc`/`tsc6`).
- Vite 8 announcement + Migration guide — `https://vite.dev/blog/announcing-vite8`, `https://vite.dev/guide/migration` (Rolldown/Oxc; Node 20.19+/22.12+; renamed config keys).
- Vitest 5 announcement + config/environment/projects docs — `https://vitest.dev/blog/vitest-5.html`, `https://vitest.dev/config/`, `https://vitest.dev/guide/projects`, `https://vitest.dev/guide/migration` (Vite ≥6.4, Node ≥22.12; `environment: 'node'` default; projects).
- ESLint rule docs — `https://eslint.org/docs/latest/rules/no-restricted-imports`; typescript-eslint `https://typescript-eslint.io/rules/no-restricted-imports/` (core rule handles TS syntax since ESLint 9.37).
- Node.js Corepack docs — `https://nodejs.org/api/corepack.html` (`packageManager` field).
- typescript-eslint TS7 support issue — `https://github.com/typescript-eslint/typescript-eslint/issues/12518` (TS7 unsupported until API lands).
- TypeScript bin-shadowing issue — `https://github.com/microsoft/TypeScript/issues/64071` (npm hoisting vs pnpm).

### Secondary (MEDIUM confidence)
- Gaffer On Games, "Fix Your Timestep" — `https://gafferongames.com/post/fix_your_timestep` (accumulator/clamp/interpolation).
- cstsolution.com, "Deterministic Game Simulation: Where Floats Diverge" — `https://cstsolution.com/blog/deterministic-simulation/` (hash costs, quantization, Map/Set reordering, V8-tier float64 reproducibility).
- DriftEngine determinism concept docs — `https://driftengine.dev/docs/concepts/determinism` (`savableMulberry32`, fingerprints).
- Hayao verification docs — `https://hayao.dev/docs/verification` (assert-deterministic / snapshot-stable gate shapes).
- `seeded-random-utilities` (`https://www.npmjs.com/package/seeded-random-utilities`) and `ts-seedrandom` README (`https://github.com/jurerotar/ts-seedrandom/`) — PRNG feature/comparison reference.
- langfuse PR #14921 and Nx KB — `https://github.com/langfuse/langfuse/pull/14921`, `https://nx.dev/docs/kb/typescript-7` (TS7+TS6 toolchain practice).
- In-repo authority: `.planning/reference/ai-marble-kingdom.md` (spec §时间系统 / §AI 控制), `.planning/research/{SUMMARY,ARCHITECTURE,STACK,PITFALLS}.md`, `.planning/codebase/CONCERNS.md`.

### Tertiary (LOW confidence)
- None relied upon for a decision; the SUS package verdicts (recency heuristic) are noted and dispositioned above rather than treated as findings.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH on *facts* (official announcements + registry), MEDIUM on *exact pins* (cutting-edge; must re-verify at lock). The TS7/typescript-eslint incompatibility is HIGH-confidence (peer range read from the registry).
- Architecture: HIGH — the layer boundaries, fixed-step loop, command contract, and composition-first model are corroborated by canonical sources and the project's own prior research; only the Phase-1 fixture (A1) is inferred.
- Pitfalls: HIGH on toolchain pitfalls (official issues/docs); MEDIUM-HIGH on determinism mechanics (canonical + measured study); the "vacuous gate" pitfall is an inference (A1).

**Research date:** 2026-10-15
**Valid until:** ~2026-11-14 (30 days) for the architecture/determinism findings; **re-verify all version pins immediately before locking `package.json`** (TS 7.1 / Vite 8.x / Vitest 5.x move fast). The TS7↔typescript-eslint blocker should be re-checked — TS 7.1 is expected to add the API that lifts the restriction.


---

*Phase 1 research for: Foundation & Deterministic Sim Core (SIM-01..SIM-04)*
*Ready for planning: yes.*
