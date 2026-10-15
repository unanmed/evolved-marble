# Phase 2: Physics & Composite Units - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-16
**Phase:** 2-Physics & Composite Units
**Areas discussed:** 确定性档位与 Rapier 构建, 复合刚体装配与武器挥击, 接触/冲击事件契约, 物理世界约定, 设计克制原则（用户追加）

---

## 确定性档位与 Rapier 构建

| Option | Description | Selected |
|--------|-------------|----------|
| 保持同机（沿用 D-02） | 同一种子同机重跑一致；不接跨机门禁/CI；路标成功标准 #4 放宽 | ✓ |
| 现在升级为跨机 | 钉 -deterministic + 跨机 golden-hash 验证 | |
| 同机为主 + 跨机预留 | 同机门禁 + 钉版 + -deterministic 预设对齐 | |

**User's choice:** 保持同机（沿用 D-02）
**Notes:** 主动不买跨机成本；接受 -deterministic 构建作零代码成本的预设对齐。

| Option | Description | Selected |
|--------|-------------|----------|
| 仍用 -deterministic | 满足 PHYS-03 字面 + 预设跨机对齐（略慢） | ✓ |
| 用默认 rapier2d | 同机足够且最快 | |
| -compat 变体 | base64 内联 WASM，异步 init | |

**User's choice:** 仍用 `@dimforge/rapier2d-deterministic`

| Option | Description | Selected |
|--------|-------------|----------|
| 精确钉版 + 变更硬失败 | 无 ^ + 版本变更冒烟硬失败 | ✓ |
| 允许 ^ 范围 | 自动升级次版本 | |
| 交由研究者决定 | 计划阶段再定 | |

**User's choice:** 精确钉版 + 变更硬失败

| Option | Description | Selected |
|--------|-------------|----------|
| 双指纹（sim + Rapier 快照） | sim 指纹 + world.takeSnapshot() 哈希同机双跑一致 | ✓ |
| 只用 sim 指纹 | 仅扩展 Phase 1 指纹 | |
| 本阶段先不接 | 下阶段再接门禁 | |

**User's choice:** 双指纹（sim + Rapier 快照）

| Option | Description | Selected |
|--------|-------------|----------|
| 一次全局 init，world 同步构造 | await initPhysics() 幂等；step() 纯同步 | ✓ |
| 异步工厂 | createPhysicsWorld() async | |
| 模块顶层 await | physics 模块顶层 await | |

**User's choice:** 一次全局 init，world 同步构造

| Option | Description | Selected |
|--------|-------------|----------|
| 交给研究者定 | 列为研究/计划任务 | ✓ |
| 现在就钉显式方案 | 立即固定 wasm 资产方案 | |
| 改用 -compat 绕开 | 与 D-18 冲突 | |

**User's choice:** 交给研究者定

| Option | Description | Selected |
|--------|-------------|----------|
| Node-only | 门禁与物理单测全在 vitest 无头跑 | ✓ |
| 允许浏览器跑 | 用 Playwright/Chrome | |
| Node 为主 + 浏览器冒烟 | 附加可选浏览器冒烟 | |

**User's choice:** Node-only

---

## 复合刚体装配与武器挥击

| Option | Description | Selected |
|--------|-------------|----------|
| 混合：本体+防具同刚体，武器独立关节 | 武器独立刚体 + 旋转关节 + 电机 | ✓ |
| 全单刚体 | 所有部位同刚体碰撞体 | |
| 全独立刚体 | 各部件各自刚体 + 关节链 | |

**User's choice:** 混合拓扑

| Option | Description | Selected |
|--------|-------------|----------|
| 持续往复摆动 | 数值常量驱动，无需 AI | ✓ |
| 事件驱动单次挥砍 | 仅 WeaponAbility 触发 | |
| 待机摆动 + 指令强砍 | 两套参数 | |

**User's choice:** 持续往复摆动

| Option | Description | Selected |
|--------|-------------|----------|
| 数据驱动任意数量 | 支持 N 武器 / M 防具 | ✓ |
| 固定 1 武器 + 1 防具 | 最小可用 | |
| 固定 4 命名槽 | 主手/副手/头盔/盾 | |

**User's choice:** 数据驱动任意数量

| Option | Description | Selected |
|--------|-------------|----------|
| 单位级过滤 + 敌我仍碰撞 | 同单位无损、敌我物理碰撞 | ✓ |
| 同单位 + 友军均不碰 | 避免友军卡死 | |
| 交由 planner | 分组方案后定 | |

**User's choice:** 单位级过滤 + 敌我仍碰撞

---

## 接触/冲击事件契约

| Option | Description | Selected |
|--------|-------------|----------|
| 部位枚举 + 防具子类型 | Body\|Weapon\|Armor + Helmet\|Shield | ✓ |
| 只到三分类 | 头盔/盾牌留 Phase 3 查表 | |
| collider handle + 枚举 | 泄露 Rapier handle 到事件层 | |

**User's choice:** 部位枚举 + 防具子类型

| Option | Description | Selected |
|--------|-------------|----------|
| enter 事件 + Δv | collision-enter 触发 + manifold 读 Δv；可选 contact-force | ✓ |
| 仅 contact-force | 用 .started 去重 | |
| 仅 enter（无 Δv） | Δv 由 Phase 3 读 manifold | |

**User's choice:** enter 事件 + Δv

| Option | Description | Selected |
|--------|-------------|----------|
| 法向相对速度大小 | 非负标量，方向无关 | ✓ |
| 有符号法向速度 | 正=接近 | |
| 由冲量推导 | 力/质量/时间等效速度 | |

**User's choice:** 法向相对速度大小

| Option | Description | Selected |
|--------|-------------|----------|
| 去重留给 Phase 3 | Phase 2 只发原始 enter 事件 | ✓ |
| Phase 2 内置去重 | 直接输出"意伤害"事件 | |
| 交由 planner | 边界上决定 | |

**User's choice:** 去重留给 Phase 3

---

## 物理世界约定

| Option | Description | Selected |
|--------|-------------|----------|
| 米为世界单位 | 1 单位 = 1 米，SI，渲染边界换算 | ✓ |
| 厘米/分米为世界单位 | 更小数字 | |
| 像素为世界单位 | 反模式 | |

**User's choice:** 米为世界单位

| Option | Description | Selected |
|--------|-------------|----------|
| 无限空间，无边界 | 本阶段不引入边界 | |
| 现在就加反弹墙 | 1000×1000 反弹墙 | |
| 软钳制边界 | 非物理位置/速度拉回 | ✓（初选） |

**User's choice:** 软钳制边界

| Option | Description | Selected |
|--------|-------------|----------|
| 安全带（仅越界时拉回） | 防飞出场/NaN，平时不干预 | ✓ |
| 常驻弹性势垒 | 越近边缘阻力越大 | |
| 仅钳位置 | 速度不变 | |

**User's choice:** 安全带（仅越界时拉回）

| Option | Description | Selected |
|--------|-------------|----------|
| Rapier 为真源 + 镜像入 store | 每步镜像位姿；快照 = Rapier 快照 + 组件 + RNG；加 rotation/angularVel，版本 2→3 | ✓ |
| store 为真源 | Phase 1 xform 继续权威 | |
| 不镜像，直读 Rapier | 视图/系统持 handle | |

**User's choice:** Rapier 为真源 + 镜像入 store

| Option | Description | Selected |
|--------|-------------|----------|
| 无重力 + 低弹性 + 尺寸待 Phase 3 | gravity=0，restitution≈0，尺寸用测试值 | ✓ |
| 高弹性球球 | restitution 0.3~0.5 | |
| 全部物理常量集中钉死 | 所有常量入 config | |

**User's choice:** 无重力 + 低弹性 + 尺寸待 Phase 3

---

## 设计克制原则（用户追加）

**User's input（自由文本）：** "我提一个关于设计上的问题，我怀疑现在的设计开始有点设计过度了，这个项目不是那种需要长期拓展的大项目，可以避免一些没有必要的抽象，仅做必要的拓展。"

随后在"简化候选"菜单中回复："目前还没有看到明显的问题，但是似乎有这个倾向，后续做规划与实现的时候注意一下即可。"

**Outcome:** 未做具体删减，记录为**设计原则**（CONTEXT.md D-36）：最小必要抽象、只做必要拓展、抽象等第二具体用例出现再引入；双指纹/关节电机/模块拆分等列为本可复核的简化候选（默认保持现状）。

---

## the agent's Discretion

- Node / Vite / 浏览器三环境的 WASM 解析与打包方案（D-23）。
- `sim/world` 模块文件的具体拆分/命名（不强制四文件）。
- 摆动/阻尼/restitution/尺寸的具体数值常量（集中 `src/config/sim.ts` 或 `content/`）。
- Phase 2 测试用单位的几何/装备（Phase 3 真实内容表前的临时值）。

## Deferred Ideas

- 跨机位级确定性（沿用 D-02/D-03，架构保留升级）。
- 进阶武器招式（前摇/后摇/强砍/技能旋转）——Phase 3/4。
- 地图边缘反弹（规格）——王国/地图层。
- 硬边界/反弹墙——本轮选软钳制安全带。
- 待复核简化候选（D-36）：双指纹下简、不用关节电机、不强制模块拆分。
