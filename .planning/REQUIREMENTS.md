# Requirements: AI 版球球王国（Evolved Marble）

**Defined:** 2026-10-15
**Core Value:** 战斗必须激烈好看
**Milestone:** 1 — 战术战斗层（tactical combat layer）

## v1 Requirements

Requirements for the first milestone (watchable autonomous 10+ v 10+ physics battle, recordable). Each maps to roadmap phases.

### SIM — 确定性模拟核心

- [x] **SIM-01**: 模拟按固定步长推进，与渲染解耦（tick = 游戏 1 分钟；1× 下 60 步/秒）
- [x] **SIM-02**: 所有模拟随机性来自带种子的 PRNG（禁用 `Math.random`），可由种子复现
- [x] **SIM-03**: 存在无渲染的无头运行模式
- [ ] **SIM-04**: 有确定性门禁（状态指纹/快照），证明同种子结果一致

### PHYS — 物理与复合单位

- [ ] **PHYS-01**: 单位为复合刚体：本体/武器/防具是独立碰撞体并按部位打标
- [ ] **PHYS-02**: 物理接触事件被转成带类型的模拟事件（记录命中部位）
- [ ] **PHYS-03**: 使用 Rapier2D 确定性构建（`@dimforge/rapier2d-deterministic`）

### DATA — 单位数据模型

- [ ] **DATA-01**: 单位属性数据化（HP/maxHP/等级/经验/控制等级/攻/防/武器比率/防具比率/质量/装备/职业/加成）
- [ ] **DATA-02**: 定义 7 个职业的每级成长与装备/技能解锁表
- [ ] **DATA-03**: 定义 6 种武器、2 种防具的质量/比率/破甲矩阵

### DMG — 伤害管线

- [ ] **DMG-01**: 近战伤害由碰撞法向速度 Δv 按文档公式推导
- [ ] **DMG-02**: 伤害抖动来自种子 RNG（N(均值, 均值/20)）
- [ ] **DMG-03**: 仅命中防具时触发减伤，命中本体不减；破甲比率调节减伤

### PROG — 成长

- [ ] **PROG-01**: 单位按文档公式从造成伤害（>50）、抵挡伤害（>50）、击杀获得经验
- [ ] **PROG-02**: 经验达阈值升级，升级恢复"生命上限增加值"并按职业加属性
- [ ] **PROG-03**: 升级按职业表解锁装备/技能；单位生成属性按文档正态分布随机

### AI — 单位 AI

- [ ] **AI-01**: AI 观测按文档（64 射线扫描，上限 50m；射弹探测；最近 16 敌 + 16 友）
- [ ] **AI-02**: AI 输出按文档（施加力/旋转力/武器技能/单位技能）
- [ ] **AI-03**: 行为树 AI 每 6 固定步（0.1s）决策一次
- [ ] **AI-04**: 职业行为有区分（狂战士冲锋、弓箭手风筝、剑盾抗线），而非只有数值差异

### BTL — 自主战斗

- [ ] **BTL-01**: 战斗在敌对军队靠近时自动触发，无需人工干预打到分出胜负
- [ ] **BTL-02**: 每方 10+ 单位同时混战，维持可交互帧率

### RND — 渲染与 HUD

- [ ] **RND-01**: PixiJS 顶视渲染，单位/武器/防具/射弹清晰可辨
- [ ] **RND-02**: HUD 显示每个单位的 HP/等级/阵营

### CAM — 镜头

- [ ] **CAM-01**: 自动跟拍镜头无需人工控制即可框住激烈战斗区域

### REC — 录制与出片

- [ ] **REC-01**: 固定步长帧采集可导出战斗视频文件

### BRG — Python 桥接（研究）

- [ ] **BRG-01**: 带版本/关联 ID/超时保护的模拟↔Python 桥接 + PettingZoo 环境包装

## v2 Requirements

Deferred to future release. Tracked but not in current roadmap.

### ABIL — 技能与表现

- **ABIL-01**: 职业技能（万箭齐发/冲锋/旋转）
- **ABIL-02**: 射弹作为真实物理体
- **ABIL-03**: 伤害数字、命中火花、击杀特写

### TOOL — 工具与复现

- **TOOL-01**: 击杀播报 / 战后战报
- **TOOL-02**: 确定性回放 + 种子分享
- **TOOL-03**: 无头批量跑分与平衡校准
- **TOOL-04**: 数值数据热重载

## Out of Scope

Explicitly excluded. Documented to prevent scope creep. Reserved interfaces noted where applicable.

| Feature | Reason |
|---------|--------|
| LLM 指挥官 / 导演系统 | 引入云 API 延迟/成本与非确定性；仅预留接口，后续里程碑 |
| 王国 / 经济层（城池生产、驻扎、行军、战略视野） | 依赖稳定的战斗层；战斗解析作为可调用 API 为其预留 |
| RL 单位控制（"控制等级"梯子） | 训练循环会淹没首期；保留字段与确定性核心，后续接入 |
| 场景 / 地图框架、存档梯子 | 先验证单一"军队 vs 军队"战斗 |
| 多人 / 网络同步 | 与单进程观战模拟正交，工程量巨大 |
| 单位 / 阵营编辑器、模组 | 数据化属性已为将来免费铺路 |
| 硬克制（"长矛必胜骑兵"） | 杀死悬念；改用文档的破甲比率软克制 |
| 手绘动画 / 骨骼绑定 | 物理驱动的混乱感才是本作美学与卖点 |
| 玩家操控单位 / 附身 | 这是观战模拟，非可玩游戏 |
| 每单位 Pixi filter/mask | 昂贵，数百单位会拖垮帧率；用预渲染着色与粒子 |
| `Math.random` / `Math.sin` 用于影响模拟的值 | 破坏跨平台确定性（Rapier 确定性文档） |
| GOAP / HTN / MCTS 规划器 | 对 0.1s × 几十单位过重；先行为树 |

## Traceability

Which phases cover which requirements. Updated during roadmap creation.

| Requirement | Phase | Status |
|-------------|-------|--------|
| SIM-01 | Phase 1 | Complete |
| SIM-02 | Phase 1 | Complete |
| SIM-03 | Phase 1 | Complete |
| SIM-04 | Phase 1 | Pending |
| PHYS-01 | Phase 2 | Pending |
| PHYS-02 | Phase 2 | Pending |
| PHYS-03 | Phase 2 | Pending |
| DATA-01 | Phase 3 | Pending |
| DATA-02 | Phase 3 | Pending |
| DATA-03 | Phase 3 | Pending |
| DMG-01 | Phase 3 | Pending |
| DMG-02 | Phase 3 | Pending |
| DMG-03 | Phase 3 | Pending |
| PROG-01 | Phase 3 | Pending |
| PROG-02 | Phase 3 | Pending |
| PROG-03 | Phase 3 | Pending |
| AI-01 | Phase 4 | Pending |
| AI-02 | Phase 4 | Pending |
| AI-03 | Phase 4 | Pending |
| AI-04 | Phase 4 | Pending |
| BTL-01 | Phase 4 | Pending |
| BTL-02 | Phase 4 | Pending |
| RND-01 | Phase 5 | Pending |
| RND-02 | Phase 5 | Pending |
| CAM-01 | Phase 5 | Pending |
| REC-01 | Phase 6 | Pending |
| BRG-01 | Phase 6 | Pending |

**Coverage:**

- v1 requirements: 27 total
- Mapped to phases: 27 ✓
- Unmapped: 0

---
*Requirements defined: 2026-10-15*
*Last updated: 2026-10-15 after roadmap creation*
