---
phase: "3"
slug: "control-system"
# status lifecycle: draft (seeded by plan-phase) → validated (set by validate-phase §6)
# audit-milestone §5.5 distinguishes NOT-VALIDATED (draft) from PARTIAL (validated + nyquist_compliant: false) (#2117)
status: draft
nyquist_compliant: false
wave_0_complete: false
created: "2026-10-19"
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Vitest 5.0.4 |
| **Config file** | `vitest.config.ts` (`environment: 'node'`; `include: ['tests/**/*.test.ts']`; alias `@` → `src/`) |
| **Quick run command** | `pnpm vitest run tests/control/types.test.ts` |
| **Full suite command** | `pnpm test` + `pnpm typecheck` + `pnpm lint` |
| **Estimated runtime** | ~60 seconds |

Round 1's real gate is `pnpm typecheck` (`expectTypeOf` is a no-op under `vitest run`); Round 2's gate adds the behavioral suites under `tests/control/`.

---

## Sampling Rate

- **After every task commit:** Run `pnpm typecheck` + `pnpm vitest run tests/control/`
- **After every plan wave:** Run `pnpm test` + `pnpm lint`
- **Before `/gsd-verify-work`:** Full suite (including `pnpm typecheck`) must be green
- **Max feedback latency:** 60 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Threat Ref | Secure Behavior | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|------------|-----------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 03-01 | 1 | CTRL-01..04 | T-03-01 / T-03-02 | 类型契约声明，无运行时行为；无外部输入 | typecheck | `pnpm typecheck` | ❌ W0 | ⬜ pending |
| 03-01-02 | 03-01 | 1 | CTRL-01..04 | — | 枚举值/契约形状被编译期与运行期钉住 | unit | `pnpm vitest run tests/control/types.test.ts` | ❌ W0 | ⬜ pending |
| 03-R2-01 | Round 2 | 2 | CTRL-01 | T-03-01 | 64 条 [0,50] 距离、≤16 敌/≤16 友、射弹恒空 | integration | `pnpm vitest run tests/control/sensing.test.ts` | ❌ Round 2 | ⬜ pending |
| 03-R2-02 | Round 2 | 2 | CTRL-02 | T-03-02 | 净力/力矩合成正确；非有限值按 0 钳制；技能意图只在决策 tick 出现一次 | unit + integration | `pnpm vitest run tests/control/loop.test.ts` | ❌ Round 2 | ⬜ pending |
| 03-R2-03 | Round 2 | 2 | CTRL-03 | — | 决策恰好发生在 tick 0/6/12…，其余 tick 不决策 | integration | `pnpm vitest run tests/control/loop.test.ts` | ❌ Round 2 | ⬜ pending |
| 03-R2-04 | Round 2 | 2 | CTRL-04 | T-03-02 | 换 provider 后物理/单位代码不变、模拟跑 N tick 不崩 | integration | `pnpm vitest run tests/control/pluggable.test.ts` | ❌ Round 2 | ⬜ pending |
| 03-R2-05 | Round 2 | 2 | CTRL-04 | — | 默认 AI 自主：接近→攻击→脱离；无人工输入 | integration + unit | `pnpm vitest run tests/control/default-ai.test.ts` | ❌ Round 2 | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

- [ ] `tests/control/` 目录 + `tests/control/types.test.ts` — Round 1 的唯一脚手架（编译期契约证明 + 枚举值钉住）
- [ ] Round 2：`tests/control/arena.ts`（`ArenaSensingWorld` 测试夹具：边界矩形 + 单位圆 + 空射弹）+ 行为测试文件
- [ ] 无需新增依赖、无需修改 `vitest.config.ts`（现有 Vitest/别名/TS 配置完全覆盖）

*Existing infrastructure covers all phase requirements; no framework install needed.*

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| 用户审查并批准 `src/control/types.ts` 的类型/接口设计 | CTRL-01..04 | Type-first 门禁要求用户确认接口设计合理后才能进入实现（PROJECT.md / ROADMAP.md） | 阅读 `03-CONTEXT.md` 与 Round 1 产出的 `src/control/types.ts`，确认 D-01..D-19 的契约形状与命名后批准 |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 60s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
