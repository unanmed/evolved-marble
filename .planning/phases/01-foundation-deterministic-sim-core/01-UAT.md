---
status: complete
phase: 01-foundation-deterministic-sim-core
source: 01-01-SUMMARY.md, 01-02-SUMMARY.md, 01-03-SUMMARY.md, 01-04-SUMMARY.md, 01-05-SUMMARY.md, 01-06-SUMMARY.md, 01-07-SUMMARY.md, 01-08-SUMMARY.md, 01-09-SUMMARY.md, 01-10-SUMMARY.md, 01-11-SUMMARY.md, 01-12-SUMMARY.md
started: 2026-10-15T23:05:00Z
updated: 2026-10-15T23:20:00Z
---

## Current Test
<!-- OVERWRITE each test - shows where we are -->

[testing complete]

## Tests

### 1. 工具链包集合的合法性（T-01-SC）
expected: 前沿包集合（TS6/TS7 并存、Vite 8、Vitest 5、ESLint 10）可信；均为官方仓库/发布者，且无安装脚本。
result: pass

### 2. 无头运行（无 DOM、无墙钟）
expected: 运行 `pnpm vitest run tests/sim/headless.test.ts` —— 完整模拟在 Node 中运行，不使用 `window`/`document`/`requestAnimationFrame`，也不读取墙钟时间；测试通过。
result: pass

### 3. `sim/**` 的"构造即无头"lint 边界
expected: 运行 `pnpm run lint` 与 `pnpm exec eslint --print-config src/sim/battle-sim.ts` —— lint 禁止 render/host/driver/pixi/node 导入、DOM/计时器/时钟全局、`Math.random`/`Date.now`/`performance.now`/`new Date()`；`Math.sin/cos` 仍允许（D-02）。
result: pass
notes: "用户确认；并额外确认架构不要求实时——模拟与墙钟解耦（headlessPump/fixedFpsPump），录制为逐帧离线编码。"

### 4. 前沿工具链安装完成（自动）
expected: 按官方 TS6/TS7 并存布局安装（Vite 8 / Vitest 5 / ESLint 10）；`pnpm run typecheck` 与 `pnpm run lint` 均干净通过。
result: pass
source: automated
coverage_id: D1

### 5. 前身代码树已移除（自动）
expected: 被弃用的前身 TS/Vue 树（src/**）及其 index.html 入口已移除——src/ 下无任何文件再导入 vue/@motajs/client。
result: pass
source: automated
coverage_id: D2

### 6. DOM-free 模拟边界 + 配置常量（自动）
expected: DOM-free 模拟工程边界（tsconfig.sim.json）与集中式配置常量（src/config/sim.ts）存在且能独立通过类型检查。
result: pass
source: automated
coverage_id: D3

### 7. 按固定步数推进，而非墙钟（自动）
expected: 推进模拟只按固定步数改变状态，绝不依赖墙钟；时间是单调递增的 tick 计数。
result: pass
source: automated
coverage_id: D1

### 8. 非空转且可复现的无头状态（自动）
expected: 从固定种子运行无头路径时状态逐 tick 变化（非空转），同种子可复现、不同种子会分叉。
result: pass
source: automated
coverage_id: D3

### 9. 命名的种子随机流（自动）
expected: 所有模拟随机性都来自 RandomStreams 背后命名、带种子、相互独立、可 JSON 序列化的 sfc32 流；未知名字抛错，save()/restore() 往返一致。
result: pass
source: automated
coverage_id: D1

### 10. 类型化 Command 契约（自动）
expected: 外部控制仅以类型化 Command 进入，且每步恰好被排空一次；未知 kind/缺字段/未知实体被确定性拒绝或丢弃并记录。
result: pass
source: automated
coverage_id: D2

### 11. 固定步长节拍（自动）
expected: 累加器把一帧预算转成 floor(acc/dt) 个整步、把尖峰限制在 maxFrame、在 maxSteps 处清零欠账、alpha 落在 [0,1)；tick 计数恰好加一且不读墙钟。
result: pass
source: automated
coverage_id: D4

### 12. 穷尽的序列化（自动）
expected: 规范、穷尽的状态序列化 + 无损等价还原，配一个可分离的非加密指纹；序列化不遗漏任何状态。
result: pass
source: automated
coverage_id: D1

### 13. 确定性门禁（自动）
expected: 同机确定性门禁：同种子 → 逐 tick 轨迹完全相同；不同种子 → 不同；轨迹非常量（非空转）。
result: pass
source: automated
coverage_id: D2

### 14. 稳定的实体顺序（自动）
expected: 在 spawn/despawn 变动下实体迭代顺序稳定，entityId 保持单调（不发生 Map 删除再插入的重排序）。
result: pass
source: automated
coverage_id: D3

### 15. 已接入 pre-commit 确定性门禁（自动）
expected: 确定性门禁作为 pre-commit 钩子接入（core.hooksPath == .githooks），失败时拒绝提交；未新增 CI。
result: pass
source: automated
coverage_id: D4

### 16. 产物卫生 gitignore（自动）
expected: .gitignore 仍忽略 coverage/，并记录外部输出规则；未新增 GitHub Actions 工作流。
result: pass
source: automated
coverage_id: D5

### 17. id 游标序列化完整性 — CR-01 修复（自动）
expected: 经 despawn(max) → snapshot → restore → spawn 后，还原的模拟分配与原始相同的、从未用过的 id。
result: pass
source: automated
coverage_id: D1

### 18. id 游标纳入变更普查（自动）
expected: 两个活跃实体相同但 nextId 不同的存储，序列化出不同指纹。
result: pass
source: automated
coverage_id: D2

### 19. id 游标在变动中存活（自动）
expected: despawn→snapshot→restore→despawn→spawn 的变动序列在两次运行中完全一致。
result: pass
source: automated
coverage_id: D3

### 20. quantize int32 范围守卫（自动）
expected: quantize() 对超出 signed-int32 范围的值抛确定性错误，而非让 DataView.setInt32 静默回绕（WR-03）；范围内字节不变。
result: pass
source: automated
coverage_id: D4

### 21. applyCommands 穷尽性守卫（自动）
expected: 新增 Command 变体而未处理时，`pnpm run typecheck` 失败，而非静默 no-op（WR-02）。
result: pass
source: automated
coverage_id: D5

### 22. 数字枚举判别（自动）
expected: Command/事件判别值使用数字枚举，且每个可辨识联合成员都是具名 interface。
result: pass
source: automated
coverage_id: D1

### 23. 先接口后类（自动）
expected: src/** 与 tests/** 中每个类都有其实现的导出 I<ClassName> 接口，且类名不出现在任何类型位置（D-13）。
result: pass
source: automated
coverage_id: D2

### 24. 私有成员无 `_` 前缀（自动）
expected: 私有成员不带前导 `_`（D-15）；公共访问器不变。
result: pass
source: automated
coverage_id: D3

### 25. 内联类型改为具名 interface（自动）
expected: 原内联对象类型改为具名 interface（IUnitAttrs/IUnitXform/IMutatorCase/IPerformanceStub/IPerformanceGlobal）。
result: pass
source: automated
coverage_id: D4

### 26. 风格改造行为不变（自动）
expected: 风格改造前后固定种子的指纹轨迹完全一致。
result: pass
source: automated
coverage_id: D5

### 27. src/sim/core + content 的 JSDoc（自动）
expected: src/sim/core/** 与 src/sim/content/** 下每个声明都有中文 JSDoc；每个函数都注明所有 @param 与 @returns（D-12）。
result: pass
source: automated
coverage_id: D1

### 28. 创建 D-12 约定门禁（自动）
expected: tests/style/conventions.test.ts 要求以 /** 开头的文档块、拒绝普通块注释，并要求导出函数带 @param/@returns。
result: pass
source: automated
coverage_id: D2

### 29. ESLint 边界覆盖 src/config（自动）
expected: src/config/** 被 ESLint 无头边界覆盖（WR-04）——config 模块里的 Date/Math.random 报 lint 错误。
result: pass
source: automated
coverage_id: D1

### 30. vitest.config.ts 内部一致（自动）
expected: vitest.config.ts 不再引用未声明的 coverage provider；无悬空的 --coverage 路径（WR-05）。
result: pass
source: automated
coverage_id: D2

### 31. 其余 src/sim 文件的 JSDoc（自动）
expected: 其余 src/sim 文件下每个声明都有中文 JSDoc 并带 @param/@returns。
result: pass
source: automated
coverage_id: D1

### 32. 门禁扫描 ['src/sim']（自动）
expected: D-12 约定门禁扫描整个 sim 子树并通过。
result: pass
source: automated
coverage_id: D2

### 33. src/host + src/config 的 JSDoc（自动）
expected: src/host 与 src/config 下每个声明都有中文 JSDoc 并带 @param/@returns。
result: pass
source: automated
coverage_id: D1

### 34. 门禁扫描 ['src']（自动）
expected: D-12 约定门禁扫描整个 src 树并通过。
result: pass
source: automated
coverage_id: D2

### 35. tests/sim 的 JSDoc（自动）
expected: tests/sim/** 下每个声明都有中文 JSDoc 并带 @param/@returns。
result: pass
source: automated
coverage_id: D1

### 36. 门禁扫描 ['src', 'tests/sim']（自动）
expected: D-12 约定门禁扫描 src + tests/sim 并通过。
result: pass
source: automated
coverage_id: D2

### 37. 其余测试的 JSDoc（自动）
expected: tests/determinism/**、tests/helpers/**、tests/host/** 下每个声明都有中文 JSDoc 并带 @param/@returns。
result: pass
source: automated
coverage_id: D1

### 38. 门禁扫描 ['src', 'tests']（自动）
expected: D-12 约定门禁扫描整个 Phase-1 树（含门禁文件自身）并通过。
result: pass
source: automated
coverage_id: D2

## Summary

total: 38
passed: 38
issues: 0
pending: 0
skipped: 0
blocked: 0

## Gaps

[none yet]
