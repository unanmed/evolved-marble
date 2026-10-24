# Requirements: AI 版球球王国（Evolved Marble）

**Defined:** 2026-10-17
**Core Value:** 战斗必须激烈好看。
**Milestone:** 单里程碑（不拆分）—— 8 个相对独立的系统全部交付后，产出一个可直接运行的最终模拟。

## v1 Requirements

Requirements for initial release. Each maps to roadmap phases.

### UNIT — 单位系统

- [x] **UNIT-01**: 单位拥有文档定义的属性集合（生命值、生命上限、等级、经验值、经验比率、攻击经验比率、防御经验比率、控制等级、基础攻击力、基础防御力、加成、装备、职业、武器比率、防具比率、质量）
- [x] **UNIT-02**: 定义 7 个职业（剑士、弓箭手、狂战士、锤兵、骑士、剑盾、长矛兵）的初始属性、每级成长与装备/技能解锁表
- [x] **UNIT-03**: 定义 6 种武器（长剑、短剑、斧头、锤子、弓箭、长矛）的攻击比率、质量与对各防具的破甲比率
- [x] **UNIT-04**: 定义 2 种防具（头盔、盾牌）的防御比率与质量
- [x] **UNIT-05**: 单位生成属性按正态分布随机（均值按职业，标准差 = 均值/8），作用于生命上限/控制等级/攻击/防御/武器比率/防具比率/质量
- [x] **UNIT-06**: 升级机制——按攻击/防御经验公式与击杀经验累积，达阈值升级并按职业增长属性、恢复生命上限增加值、解锁装备/技能

### PHYS — 物理模拟系统

- [x] **PHYS-01**: 单位由 Rapier2D 复合刚体表示，本体/武器/防具为独立碰撞体并按部位打标
- [x] **PHYS-02**: 物理接触转换为带部位标记的类型化模拟事件
- [x] **PHYS-03**: 伤害按文档公式计算，含碰撞法向速度差 Δv 与正态抖动（σ = 均值/20）
- [x] **PHYS-04**: 防具减伤与破甲按文档公式计算（击中本体不触发减伤）
- [x] **PHYS-05**: 模拟以固定步长 tick 推进（tick = 游戏 1 分钟），与渲染解耦

### CTRL — 操控系统

- [x] **CTRL-01**: 定义单位级 AI 的输入接口（自身属性、位置、64 条射线距离、射弹距离、16 个最近敌方简讯、16 个最近友方简讯）
- [x] **CTRL-02**: 定义单位级 AI 的输出接口（四向力、旋转力、武器技能、单位技能）
- [x] **CTRL-03**: AI 每 0.1s（6 帧）决策一次
- [x] **CTRL-04**: AI 控制实现为**可插拔**模块（可替换不同 AI 实现）；提供一个默认基线实现，使模拟可独立自主运行

### KING — 王国系统

- [x] **KING-01**: 1000×1000 地图；军队行军速度固定 10m/h，碰到地图边缘反弹
- [x] **KING-02**: 时间系统——战斗时 1× 速、无战斗时 24× 速；散文义见参考文档
- [x] **KING-03**: 军队由单位组成；行军时单位聚集于军队中心 25m 圆内并由程序控制（非 AI），行军回血 1/h
- [x] **KING-04**: 视野——军队半径 100m、城池半径 150m，决定势力可获取的信息
- [x] **KING-05**: 城池——驻扎上限、训练单位（普通 96h/1、主城 72h）、驻扎回血 2/h
- [x] **KING-06**: 军队战斗——距离 <80m 触发，战斗区为 80m 正方形加权中心，离区/结束判定
- [x] **KING-07**: 城池战斗——触发条件与战后结算（获胜方接管、可能入驻；败方重组行军）
- [x] **KING-08**: 势力/阵营概念——多个势力，各拥有军队与城池

### REND — 渲染系统

- [x] **REND-01**: 使用 PixiJS 实现 2D 顶视渲染
- [x] **REND-02**: 单位、武器、防具、阵营在画面上可辨
- [x] **REND-03**: HUD 显示每个单位的 HP / 等级 / 阵营
- [x] **REND-04**: 自动镜头跟拍激烈战斗区域（无需人工控制）
- [x] **REND-05**: Chrome-only；Chrome 下能运行模拟、不崩溃、能逐帧推进并输出 canvas；**不设 fps 目标**，只做基本优化（共享几何、视口裁剪、特效池上限）

### REC — 录制系统

- [ ] **REC-01**: 模拟全程持续采集帧（固定步长）
- [ ] **REC-02**: 使用浏览器 WebCodecs（配合 Mediabunny 库）将采集的帧编码并导出为视频文件
- [ ] **REC-03**: 录像附带时间戳/索引，供精彩回放定位片段

### AI — AI 接入系统（可插拔）

- [ ] **AI-01**: 定义可插拔的 LLM 指挥官接入接口（决策输入：影响范围/城池/军队/事件簿；输出：军队指令，每 84h + 重要事件）
- [ ] **AI-02**: 定义可插拔的 LLM 导演接入接口（视角分配、文字展示）
- [ ] **AI-03**: 定义信息申请机制（模拟现状 / 截图 / 历史事件；指挥官受限视野、导演上帝视角）
- [ ] **AI-04**: 首期仅实现接口与占位模块，不实际接入 LLM

### STAT — 统计与精彩回放系统

- [ ] **STAT-01**: 采集战斗与全局统计（伤害、击杀、升级、战局结果等）
- [ ] **STAT-02**: 精彩回放——从已有录像中原样截取片段（不依赖模拟重放）

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### RLCTRL — 强化学习控制

- **RLCTRL-01**: 通过 CTRL 可插拔接口接入 RL 训练的单位控制 AI
- **RLCTRL-02**: Python 训练链路（浏览器模拟 ↔ Python 训练驱动桥接）
- **RLCTRL-03**: "控制等级 = 训练轮数"的模型阶梯

### LLM — 大模型实际接入

- **LLM-01**: 实际接入 LLM 指挥官（Claude/GPT 等）
- **LLM-02**: 实际接入 LLM 导演

## Out of Scope

Explicitly excluded. Documented to prevent scope creep.

| Feature | Reason |
|---------|--------|
| 确定性模拟 / 物理跨平台可复现 | 用户明确移除；不做重放、不做指令录像 |
| 模拟重放 / 指令录像系统 | 不保证确定性，无此需求 |
| 硬克制（长矛克骑兵等） | 杀死悬念；改用软克制（装甲/破甲比率） |
| 手绘动画 / 骨骼绑定 | 物理驱动的混乱感才是本作美学与卖点 |
| 玩家操控单位 | 这是观赏模拟，非可玩游戏 |
| 每单位 Pixi filter/mask | 性能昂贵；用着色与粒子替代 |
| GOAP / HTN / MCTS 行为决策器 | 对 0.1s × 数十单位过重；用行为树 |
| 发包/多人 / 网络同步 | 与单进程观赏模拟正交，工程量大 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| UNIT-01 | Phase 1 — 单位系统 | Complete |
| UNIT-02 | Phase 1 — 单位系统 | Complete |
| UNIT-03 | Phase 1 — 单位系统 | Complete |
| UNIT-04 | Phase 1 — 单位系统 | Complete |
| UNIT-05 | Phase 1 — 单位系统 | Complete |
| UNIT-06 | Phase 1 — 单位系统 | Complete |
| PHYS-01 | Phase 2 — 物理模拟系统 | Complete |
| PHYS-02 | Phase 2 — 物理模拟系统 | Complete |
| PHYS-03 | Phase 2 — 物理模拟系统 | Complete |
| PHYS-04 | Phase 2 — 物理模拟系统 | Complete |
| PHYS-05 | Phase 2 — 物理模拟系统 | Complete |
| CTRL-01 | Phase 3 — 操控系统 | Complete |
| CTRL-02 | Phase 3 — 操控系统 | Complete |
| CTRL-03 | Phase 3 — 操控系统 | Complete |
| CTRL-04 | Phase 3 — 操控系统 | Complete |
| KING-01 | Phase 4 — 王国系统 | Complete |
| KING-02 | Phase 4 — 王国系统 | Complete |
| KING-03 | Phase 4 — 王国系统 | Complete |
| KING-04 | Phase 4 — 王国系统 | Complete |
| KING-05 | Phase 4 — 王国系统 | Complete |
| KING-06 | Phase 4 — 王国系统 | Complete |
| KING-07 | Phase 4 — 王国系统 | Complete |
| KING-08 | Phase 4 — 王国系统 | Complete |
| REND-01 | Phase 5 — 渲染系统 | Complete |
| REND-02 | Phase 5 — 渲染系统 | Complete |
| REND-03 | Phase 5 — 渲染系统 | Complete |
| REND-04 | Phase 5 — 渲染系统 | Complete |
| REND-05 | Phase 5 — 渲染系统 | Complete |
| REC-01 | Phase 6 — 录制系统 | Pending |
| REC-02 | Phase 6 — 录制系统 | Pending |
| REC-03 | Phase 6 — 录制系统 | Pending |
| AI-01 | Phase 7 — AI 接入系统 | Pending |
| AI-02 | Phase 7 — AI 接入系统 | Pending |
| AI-03 | Phase 7 — AI 接入系统 | Pending |
| AI-04 | Phase 7 — AI 接入系统 | Pending |
| STAT-01 | Phase 8 — 统计与精彩回放系统 | Pending |
| STAT-02 | Phase 8 — 统计与精彩回放系统 | Pending |

**Coverage:**

- v1 requirements: 37 total
- Mapped to phases: 37
- Unmapped: 0 ✓

**Phase → Requirements:**

- Phase 1 — 单位系统: UNIT-01..06 (6)
- Phase 2 — 物理模拟系统: PHYS-01..05 (5)
- Phase 3 — 操控系统: CTRL-01..04 (4)
- Phase 4 — 王国系统: KING-01..08 (8)
- Phase 5 — 渲染系统: REND-01..05 (5)
- Phase 6 — 录制系统: REC-01..03 (3)
- Phase 7 — AI 接入系统: AI-01..04 (4)
- Phase 8 — 统计与精彩回放系统: STAT-01..02 (2)

---
*Requirements defined: 2026-10-17*
*Last updated: 2026-10-17 after roadmap creation (8 phases, 37/37 mapped)*
