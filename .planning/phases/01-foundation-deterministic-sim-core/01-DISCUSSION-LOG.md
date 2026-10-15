# Phase 1: Foundation & Deterministic Sim Core - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-15
**Phase:** 1-Foundation & Deterministic Sim Core
**Areas discussed:** 确定性严格度, 实体模型, 配置与数值来源, 工具链与验证

---

## 确定性严格度

| Option | Description | Selected |
|--------|-------------|----------|
| 跨机位级一致 | 同种子跨机器/浏览器逐位相同；需禁 Math.sin/cos + Rapier 确定性构建 + CI 指纹 | |
| 同机可复现 | 同一机器重跑一致；开发更快、约束更少 | ✓ |
| 先做同机，后续再收紧 | 先同机，架构保留升级空间 | ✓（并入最终选择） |

**User's choice:** 先建确定性核心，目标**同机可复现**；跨机位级一致暂不要求；**行为数组回放推迟**。
**Notes:** 用户先问"录像会有多大"→ 澄清所指的是**行为数组**（AI 每 6 tick 一次的指令流），而非视频。据此估算：行为日志约 8–20 B/动作 × 10 动作/秒/单位 → 平均 30 单位×1h ≈ 8–22 MB（gzip 后更小），比视频小 2–3 个数量级。但用户指出"蝴蝶效应会很明显"，担心长局回放不稳，故**回放推迟**，但确定性核心照做——因为调试、数值校准、未来 RL reset 都需要它。

---

## 实体模型

| Option | Description | Selected |
|--------|-------------|----------|
| ECS-lite（SoA 类型化数组） | 为未来大规模/RL 预铺；前期结构成本高 | |
| 普通对象结构 | Unit 类 + 字段；直观、起步快 | ✓ |
| 数据驱动优先 | 先保证数据外部化，底层存储后议 | |

**User's choice:** 组合优先的**轻量对象模型**，不引入 ECS。
**Notes:** 用户质疑"这个规模真的需要 ECS 吗？"。确认：并发高保真 AI 单位仅十几/方，ECS 收益体现不出；旧原型病根是继承式桩基类，组合即可避开。保持 `entityId` 稳定以保留未来迁移空间。

---

## 配置与数值来源

| Option | Description | Selected |
|--------|-------------|----------|
| TS 数据模块 | `content/` 类型安全常量，Vite HMR 即时生效 | ✓ |
| 外部 JSON | 语言无关、便于模组；需 schema 校验 | |
| 混合 | TS schema + 运行时 JSON 覆盖 | |

**User's choice:** TS 数据模块。
**Notes:** 文档强调"数值需实测"，故调参循环要快；TS 模块借助 HMR 即可即时生效且类型安全，暂无必要引入 JSON+schema。

---

## 工具链与验证

| Option | Description | Selected |
|--------|-------------|----------|
| 稳定优先（TS5.9/Vite6） | 生态成熟、踩坑少 | |
| 最新（TS7/Vite8） | 更快，需 Node ≥22.12 | ✓ |

| Option | Description | Selected |
|--------|-------------|----------|
| Vitest | Vite 原生、零配置 | ✓ |
| Node 内置 test | 依赖最少 | |
| 暂不引入 | 仅门禁脚本 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 同机双跑比对 | 脚本化、提交前门禁 | ✓ |
| 加 GitHub Actions CI | 自动跑门禁 | |

| Option | Description | Selected |
|--------|-------------|----------|
| 仓外目录 + gitignore | 避免大产物入库 | ✓ |
| 仓内 + Git LFS | LFS 管理 | |

**User's choice:** TS7 + Vite8（Node ≥22.12）；Vitest；同机双跑指纹门禁（暂不接 CI）；大产物输出仓外 + gitignore。
**Notes:** 用户愿意承担最新工具链的风险换取新特性。

---

## the agent's Discretion

- 无头泵实现细节（`raf` / `headless` / `fixed-fps`）、指纹哈希算法与快照格式、`content/` 内部组织。
- 工具链锁定时的具体小版本号以 npm registry 实测为准。

## Deferred Ideas

- 行为数组回放（指令流 + 种子重放）—— 蝴蝶效应顾虑，推迟。
- 跨机位级确定性 + CI 门禁 —— 架构保留空间，暂不买单。
- 外部 JSON 数值 + schema / 模组加载 —— v1.x 再议。
