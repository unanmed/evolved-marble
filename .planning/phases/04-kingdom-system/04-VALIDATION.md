---
phase: "4"
slug: "kingdom-system"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-20"
---

# Phase 4 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 |
| **Config file** | `vitest.config.ts` (`environment: 'node'`; `include: ['tests/**/*.test.ts']`; alias `@` → `src/`) |
| **Quick run command** | `pnpm vitest run tests/kingdom/types.test.ts` (Round 1); `pnpm vitest run tests/kingdom/` (Round 2) |
| **Full suite command** | `pnpm test` + `pnpm typecheck` + `pnpm lint` |
| **Estimated runtime** | ~60 seconds |

Round 1's real gate is `pnpm typecheck` (`expectTypeOf` is a no-op under `vitest run`); Round 2 adds the behavioral suites under `tests/kingdom/`.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + `pnpm vitest run tests/kingdom/`
- **After every plan wave:** Run `pnpm test` + `pnpm lint`
- **Before `/gsd-verify-work`:** Full suite (including `pnpm typecheck`) must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 04-01-01 | 04-01 | 1 | KING-01..08 | T-04-01 / T-04-05 | 类型契约声明；场景/订单输入校验边界在类型层定义 | typecheck | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 04-01-02 | 04-01 | 1 | KING-01..08 | T-04-01 | 枚举值/契约形状被编译期与运行期钉住 | unit | `pnpm vitest run tests/kingdom/types.test.ts` | ❌ W0 | ⬜ pending |
| R2-KING-01 | Round 2 | 2 | KING-01 | T-04-01 | 1000×1000、10m/h、边缘反弹 | unit + integration | `pnpm vitest run tests/kingdom/time.test.ts tests/kingdom/march.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-02 | Round 2 | 2 | KING-02 | — | 战斗 1× / 无战斗 24×；子步 1/24；游戏分钟 | unit + integration | `pnpm vitest run tests/kingdom/time.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-03 | Round 2 | 2 | KING-03 | — | 25m 圆内、程序控制、行军回血 1/h（G-1） | integration | `pnpm vitest run tests/kingdom/march.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-04 | Round 2 | 2 | KING-04 | — | 军队 100m / 城池 150m 并集、无记忆 | unit + integration | `pnpm vitest run tests/kingdom/vision.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-05 | Round 2 | 2 | KING-05 | T-04-04 | 驻军上限、训练 96/72h、驻扎回血 2/h（G-1） | integration | `pnpm vitest run tests/kingdom/city.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-06 | Round 2 | 2 | KING-06 | T-04-01 | <80m 触发、80m 正方形加权中心、离区/结束 | integration | `pnpm vitest run tests/kingdom/battle.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-07 | Round 2 | 2 | KING-07 | T-04-01 | 城池战触发/结算/接管/入驻/败方重组 | integration | `pnpm vitest run tests/kingdom/city.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-KING-08 | Round 2 | 2 | KING-08 | — | 多势力、各拥有军队/城池、teamId 映射 | unit + integration | `pnpm vitest run tests/kingdom/scenario.test.ts tests/kingdom/types.test.ts` | ❌ Round 1/2 | ⬜ pending |
| R2-TERRAIN | Round 2 | 2 | D-27 | T-04-02 | 静态地形挡移动 + 挡射线（真实 Rapier；G-2） | integration | `pnpm vitest run tests/kingdom/terrain.test.ts` | ❌ Round 2 | ⬜ pending |
| R2-HEAL | Round 2 | 2 | G-1 | — | `IUnit.heal` 行为 | unit | `pnpm vitest run tests/units/heal.test.ts` | ❌ Round 2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/kingdom/` 目录 + `tests/kingdom/types.test.ts` — Round 1 唯一脚手架（编译期契约 + 枚举钉住）
- [ ] Round 2：`tests/kingdom/harness.ts`（真实 `RAPIER.init()` + `PhysicsWorld`/`ControlSystem`/`KingdomWorld` 小场景；`afterEach` dispose；种子化 `mulberry32`）
- [ ] Round 2：`time/march/battle/city/vision/terrain/scenario` 行为测试
- [ ] Round 2（若 G-1 批准）：`tests/units/heal.test.ts`
- [ ] 无新依赖、无需改 `vitest.config.ts` / `tsconfig.json`

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 用户审查并批准 `src/kingdom/types.ts` 的类型/接口设计 | KING-01..08 | Type-first 门禁要求用户确认接口设计合理后才能进入实现 | 阅读 `04-CONTEXT.md` 与 Round 1 产出的 `src/kingdom/types.ts`，确认 D-01..D-29 的契约形状、G-1/G-2 加性扩展与命名后批准 |
| 确认 G-1（`IHealableUnit`/`Unit.heal`）与 G-2（`IStaticObstacleWorld`/`PhysicsWorld` 静态障碍）加性扩展被接受 | KING-03/05、D-27 | 需要改动冻结契约（加性）；用户必须在门禁明确批准或拒绝 | 在类型审查门禁中回答 approve / revise；拒绝则回血或地形范围需要调整 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
