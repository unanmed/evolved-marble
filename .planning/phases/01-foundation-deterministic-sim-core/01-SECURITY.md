---
phase: "1"
slug: "foundation-deterministic-sim-core"
status: verified
# threats_open = count of OPEN threats at or above workflow.security_block_on severity (the blocking gate)
threats_open: 0
asvs_level: 1
created: "2026-10-15"
---

# Phase 1 — Security

> Per-phase security contract: threat register, accepted risks, and audit trail.
> 本阶段为**无头、确定性模拟核心**：无网络、无持久化、无用户输入。安全面集中在**供应链完整性**、**无头边界完整性**与**确定性完整性**。

---

## Trust Boundaries

| Boundary | Description | Data Crossing |
|----------|-------------|---------------|
| package registry → repo | 通过 `pnpm install` 进入的第三方代码（前沿版本） | 可执行依赖 |
| driver → sim (`CommandQueue`) | 唯一的向内控制契约；非良构形状必须被确定性拒绝 | 类型化 `Command` |
| sim → dependency graph | `sim/**` 不得触达 DOM/node/host/render | 无（编译/静态边界） |
| in-process state → serialized bytes → fingerprint | 序列化若遗漏状态，会让两个分叉的世界报告"相等" | 规范字节 / 非加密指纹 |
| fingerprint consumer | 指纹是诊断量，绝不可当作认证符 | 非加密摘要 |
| developer → git commit | pre-commit 门禁必须在分叉时**大声失败** | 提交门禁 |

---

## Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation | Status |
|-----------|----------|-----------|----------|-------------|------------|--------|
| T-01-SC | Tampering | `pnpm install` 工具链 | high | mitigate | Package Legitimacy Audit（全部 Approved）+ 阻断式人工检查点（01-01 Task 2）+ `npm view` 版本核验 | closed |
| T-01-01 | Tampering | `src/sim/**` 随机/时间源 | high | mitigate | 仅经 `RandomStreams` 种子流；ESLint `no-restricted-properties` 禁 `Math.random`/`Date.now`/`performance.now`；按 `orderedIds` 迭代（01-03） | closed |
| T-01-04 | Tampering / Repudiation | `serializeState` / `EntityStore.restore` | high | mitigate | 穷尽规范序列化 + `restore` 往返测试 + 变更普查（id 游标纳入）；CR-01 已修复（01-05） | closed |
| T-01-05 | Tampering | `CommandQueue` 入口 / `applyCommands` | medium | mitigate | 结构性校验 + 未知 `kind`/缺字段的确定性拒绝；`never` 型穷尽守卫防静默 no-op（01-05；WR-02） | closed |
| T-01-03 | Spoofing | `fingerprint()` | low | accept | 非加密诊断量，已在 `snapshot.ts` 文档化，任何安全决策都不消费它（V6） | closed |
| T-01-06 | Denial of Service | `vitest.config.ts` 覆盖路径 | low | mitigate | 删除悬空的 coverage 块，消除未声明依赖路径（01-08；WR-05） | closed |

*Status: open · closed · open — below high threshold (non-blocking)*
*Severity: critical > high > medium > low — 仅 ≥ block_on（high）的 open 威胁计入 `threats_open`*
*Disposition: mitigate（需实现）· accept（记录在案）· transfer（第三方）*

---

## Accepted Risks Log

| Risk ID | Threat Ref | Rationale | Accepted By | Date |
|---------|------------|-----------|-------------|------|
| AR-01-01 | T-01-03 | 指纹是**非加密**摘要，仅用于诊断/去重；不作为认证或防篡改令牌，且快照本阶段不离开进程。已在 `snapshot.ts` 文档化。 | 项目所有者（plan-time disposition） | 2026-10-15 |

*Accepted risks do not resurface in future audit runs.*

---

## Security Audit Trail

| Audit Date | Threats Total | Closed | Open | Run By |
|------------|---------------|--------|------|--------|
| 2026-10-15 | 6 | 6 | 0 | gsd-secure-phase (orchestrator) |

---

## Notes

- **无网络面**：`sim/**` 与 `src/config/**` 由 `tsconfig.sim.json`（DOM-free）+ ESLint 边界双重保证无 DOM/node/时钟/`Math.random`。
- **确定性即完整性**：确定性门禁（pre-commit，D-09）与本阶段威胁 T-01-01/T-01-04 同源——门禁失败即拒绝提交。
- **ASVS L1**：本阶段以 grep/单测深度验证（ASVS L1）足够；L2/L3 深检（边界放置、端到端追踪）留待引入真实网络面（Phase 6 桥接）时再评估。
- **非阻塞残留**（不影响 `threats_open`）：`quantize` NaN 强制归零、restore 游标未做不变式校验、D-12 门禁正则盲区、`atTick` 暂缓——均为健壮性/覆盖度问题，非本阶段威胁。

---

## Sign-Off

- [x] All threats have a disposition (mitigate / accept / transfer)
- [x] Accepted risks documented in Accepted Risks Log
- [x] `threats_open: 0` confirmed
- [x] `status: verified` set in frontmatter

**Approval:** verified 2026-10-15
