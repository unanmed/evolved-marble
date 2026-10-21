# Phase 5: 渲染系统 - Research

**Researched:** 2026-10-21
**Domain:** PixiJS 8 顶视 2D 渲染 / 自动镜头 / 单位 HUD / 逐帧 setTimeout 驱动（TypeScript + Vite + Chrome-only）
**Confidence:** HIGH（上游读取契约、PixiJS 8.22.0 API、Rapier 武器几何、测试基线——本会话读源码 / 读官方文档 / 读已安装 d.ts / 跑基线命令）；MEDIUM（`src/render/types.ts` 契约形状——待用户类型门禁审查）；MEDIUM（镜头 / HUD / 配色默认值——设计提案，经门禁与实测校准）；LOW / `[ASSUMED]`（CONTEXT 未给出的具体数值与两个解释性判断，见 §Assumptions Log）

> **Provenance convention:**
> `[VERIFIED: path:lines]` = 本会话用 `Read` 打开源码并逐字核对（引文集中在 §Verified Contract Facts）；
> `[VERIFIED: pixi d.ts]` = 本会话 `npm install pixi.js@8.22.0` 到临时目录后读取其 `.d.ts`；
> `[CITED: url]` = 官方文档页面；
> `[VERIFIED: baseline]` = 本会话实际运行 `pnpm typecheck` / `pnpm test` / `node --version` 等命令；
> `[ASSUMED]` = 规格 / CONTEXT 未给出的设计默认值，需门禁或实测确认。

---

## Summary

Phase 5 是**只读渲染层**：它把 Phase 1–4 已经冻结的「单位 + 物理 + 控制 + 王国」读取面组装成一个 1920×1080 的 PixiJS 画布，并提供一个 `setTimeout` 驱动的逐帧 demo。它**不拥有**模拟循环、不推进物理、不修改 `IUnit` / `IPhysicsWorld` / `src/control/types.ts` / `IWorld` 的任何既有契约。本阶段仍按项目强制流程分两轮：Round 1 只写 `src/render/types.ts` + `tests/render/types.test.ts`，用户批准后才进入实现。

本会话核实了四条决定设计形状的集成事实：

1. **PixiJS 8.22.0 的初始化是异步的，渲染是同步的。** `new Application()` → `await app.init({...})`；`app.init` 的 `autoStart` 默认 `true`，会驱动 `Ticker` 自动渲染；`app.init({ autoStart: false })` 后手动调用 `app.render()` 是官方明确的“自定义渲染时序”路径（D-18 的 `renderFrame()` 正好落在它上面）。`app.render()` 返回 `void`，不是 Promise。[CITED: https://pixijs.com/8.x/guides/components/application] [VERIFIED: pixi d.ts app/Application.d.ts:240-249]
2. **PixiJS v8 的 `Graphics` 是叶节点，不能再有子节点。** `Sprite` / `Graphics` / `Mesh` 等均不能 `addChild`，必须把可组合的根做成 `Container`。同时 v8 废弃了 `beginFill` / `drawCircle` / `endFill`，改为“先建形状、再 `.fill()` / `.stroke()`”。这两点会直接决定 `IUnitView` 的根类型与所有绘制代码。[CITED: https://pixijs.com/8.x/guides/migrations/v8] [VERIFIED: pixi d.ts scene/graphics/shared/Graphics.d.ts:90,354,406,714,878,945]
3. **伤害事件可以在不改冻结契约的前提下旁路出来，而且死亡位置必须在这一刻抓取。** `ControlSystem.tick()` 的顺序是：`physics.tick()` → 逐条 `routeDamage()`（构造 `IDamageContext` 并调用注入的 `IDamageSink`）→ **之后**才批量注销死亡单位。[VERIFIED: src/control/ControlSystem.ts:289-302] 因此组合根用一个 `IDamageSink` 装饰器包住 `BattleDamageSink`：先调用内层（保留全部战斗规则），再比较 `Health` 前后——只有实际掉血或死亡才记录；此时 `defender.isAlive()` 已能判定死亡，`physics.getUnitState(defenderId)` 仍返回**死亡前的最后位置**（`removeUnit` 尚未发生）。[VERIFIED: src/kingdom/DamageSink.ts:48-100] 这比“上一帧存在、这一帧消失”的探测更准确，也不会丢位置。
4. **武器碰撞体是“身前一根横向 capsule”，不是沿朝向的矛。** Rapier 2D 的 `ColliderDesc.capsule(halfHeight, radius)` 明确“half-height along the `y` axis”，而物理层把它平移到局部 `(0.7, 0)` 且**不旋转**。[VERIFIED: node_modules/@dimforge/rapier2d-compat/dist/geometry/collider.d.ts:685] [VERIFIED: src/physics/PhysicsWorld.ts:130-147] [VERIFIED: src/physics/constants.ts:31-42] 因此武器的视觉轮廓必须画在局部 x≈0.7 的竖直方向上，否则“看起来打中了、物理却没打中”。这一点同时给了 6 种武器一个统一、可辨的造型基准。

**Primary recommendation:** Round 1 只写 `src/render/types.ts`（数字枚举 `CameraMode` + `IRenderer` / `ICamera` / `IHud` / `IUnitView` / `IUnitViewFactory` / `IDamageFeed` / `IRenderServices` / `IRenderConfig` 及其从属数据接口）+ `tests/render/types.test.ts`（枚举钉版 + `expectTypeOf` 编译期断言）。实现采用五条分离：**(1)** 纯数学（`cameraMath.ts`、`hudModel.ts`、`calendar.ts`）不导入 Pixi，可在 Node/Vitest 直接测；**(2)** 薄 Pixi 适配类（`Renderer`、`Camera`、`Hud`、`GeometryUnitView`、`UnitViewFactory`）只在浏览器跑；**(3)** 伤害旁路用 `IDamageSink` 装饰器；**(4)** 单位视图用 `IUnitViewFactory` + 共享 `GraphicsContext`，默认 `GeometryUnitView`，未来可整体换 `SpriteUnitView`；**(5)** 循环归 demo 的 `ManualRunner`，`IRenderer.renderFrame()` 只画一帧。镜头用**中位数中心 + 第 90 百分位切比雪夫半径**的正方形拟合盒，从数学上保证 ≥90% 参战单位在画面内；跟踪用指数平滑、切目标用定时缓动，绝不让当前 transform 瞬间跳到目标。

---

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions

#### 范围与验收口径

- **D-01:** **REND-05 按用户明确要求放宽**：不追求实时/可交互帧率；渲染慢一点无所谓，视频是逐帧输出的。现阶段只做**最简单的实现 + 最基本的性能优化**（如地图分区渲染/视口裁剪），后续再由用户提出优化方案。验收口径改为“Chrome 下能跑、不崩、能逐帧推进并输出 canvas”，而不是 60fps。 — **Reversibility:** costly — 该口径取代了 REQUIREMENTS.md / ROADMAP.md 中“可交互帧率”的原始措辞，验收与测试都以此为准。
- **D-02:** **多场战斗的顺序展示/回到 15s 属于 Phase 6**：模拟并发推进，Phase 5 只负责“跟拍一个明确的战斗目标 + 平滑切换”。Phase 5 不实现时间回跳、不实现“先播第一场再回放第二场”的剪辑时间线。 — **Reversibility:** costly — 涉及 Phase 5/6 的职责边界与镜头驱动接口。

#### 视觉辨识与美术方向

- **D-03:** 默认使用**程序化几何**（PixiJS 直接绘制圆/环/线条/多边形），零美术素材；但必须保留**换成贴图的接缝**。接缝采用 `IUnitView` + `IUnitViewFactory`：默认 `GeometryUnitView`，未来可替换为 `SpriteUnitView`，`IRenderer`/`ICamera`/`IHud` 不需要改动。 — **Reversibility:** costly — 视图工厂是类型门禁契约，后续所有单位/装备视觉都从它创建。
- **D-04:** **阵营用本体填充色区分，颜色可配置**（按 factionId 映射，不写死赤/蓝）。**职业不单独设计视觉**，职业辨识通过装备/武器体现；**6 种武器使用不同几何形状**，**防具使用不同几何形状**（头盔/盾牌可辨）。 — **Reversibility:** costly — 这是 REND-02 的核心视觉契约，影响所有视图与图例。
- **D-05:** 视觉基调为**暗底高饱和**：深灰/墨色战场、低饱和地形、阵营色高饱和，让单位与特效最跳。 — **Reversibility:** reversible — 调色板可整体替换。

#### 战斗反馈与 HUD

- **D-06:** 采用**强反馈**：受击闪白、伤害数字、火花/粒子、死亡碎裂/淡出、轻微镜头震动。所有特效对象池化并设同屏上限；性能只做基本优化，不做复杂 LOD。 — **Reversibility:** reversible — 特效强度与上限均为可调常量。
- **D-07:** 单位头顶只画**血条**：颜色 = 阵营色；**不显示当前/最大生命值文本，不显示单位名**。血条默认隐藏，单位受击后显示 **15 × 输出帧率** 帧；场上总单位数 **< 6** 时常亮（阈值可调）。 — **Reversibility:** costly — HUD 显隐规则与反馈事件流绑定。
- **D-08:** **等级数字常亮**，绘制在单位本体上，**不随单位旋转**（始终直立）。等级**永远跟随视角缩放**（世界尺寸），不做屏幕恒定。 — **Reversibility:** costly — 等级是每单位常驻视觉元素，缩放行为已锁定。
- **D-09:** 血条缩放采用**混合模式**：近景屏幕恒定像素大小；镜头缩远到阈值后**平滑过渡**为世界尺寸，避免大量单位 HUD 重叠。阈值与过渡区间可调。 — **Reversibility:** costly — 需要与镜头缩放状态耦合。
- **D-10:** 伤害数字**仅大伤害显示**（阈值可调，初始 50）：数字向上飘并淡出；轻击只闪白/火花，不刷数字。 — **Reversibility:** reversible — 阈值与样式可调。
- **D-11:** 视频内左上角只显示**时间 + 速度**（如“第 1 年 3 月 12 日 14:00 / 24×”），不显示势力图例、不显示战况统计。日期用**简化历**：1 年 = 12 月 × 30 天，1 天 = 24 小时；0 游戏分钟 = 第 1 年 1 月 1 日 0 时。 — **Reversibility:** reversible — 显示字段与历法换算可调。
- **D-12:** 操作者专用面板（**视频中永不出现**）用 **HTML/CSS 覆盖层**实现，位于 canvas 之外。第一版提供：暂停/继续、单步、重置、镜头模式切换、**每帧延时**（速度）、选中军队后下 `MoveTo`/`Garrison`/`Hold`（复用 `IWorld.issueOrder`）。不提供强制结束战斗、单位传送、碰撞体/射线叠加。 — **Reversibility:** costly — 操作界面与模拟控制循环、`issueOrder` 的接线方式绑定。

#### 自动镜头与画布构图

- **D-13:** 画布默认 **1920×1080**，作为可配置参数；内部按固定 16:9 分辨率渲染，页面内等比缩放居中。 — **Reversibility:** reversible — 分辨率与缩放策略可调。
- **D-14:** 镜头有**两种状态**：
    1. **无战斗全景**：显示整张地图，只画地图 + 军队标志 + 城池标志，**不渲染单位**。军队 = 阵营色箭头（指示朝向）+ 实力标记（人数）；城池 = 阵营色方块/旗 + 规模（主城更大）。地形用低饱和色块表示。
    2. **战斗特写**：平滑推近到战斗区，镜头中心尽量贴合战斗区中心；**至少保证 90% 的参战单位在画面内**，不足则拉远。所有镜头运动必须平滑，禁止瞬移。 — **Reversibility:** costly — 镜头状态机、缩放与构图规则是 Phase 6 录制取景的基础。
- **D-15:** Phase 5 的镜头跟拍目标由调用方显式指定（如 `setBattleTarget(battleId)`）；demo 默认跟当前活跃战斗，Phase 6 可按战斗队列驱动镜头依次展示。Phase 5 自身不做“最激烈战斗评分”或顺序剪辑。 — **Reversibility:** costly — 这是 Phase 5/6 的镜头控制契约。

#### 接入方式与播放节奏

- **D-16:** 新增**最小可运行 demo 页**：Vite `index.html` + `main.ts`，用真实 `DEFAULT_SCENARIO` 接线 `PhysicsWorld` + `KingdomSensingWorld` + `BattleDamageSink` + `ControlSystem` + `KingdomWorld` + Pixi 渲染器；`pnpm dev` 可直接观看。它是验证用 harness，**不是最终 app shell**，不做菜单/场景选择/录制按钮。 — **Reversibility:** reversible — 页面与接线可替换。
- **D-17:** 渲染循环**不按真实时间节流**：每输出一帧推进**恰好 1 个外层 `IWorld.tick()`**（战斗中 1 游戏分钟、无战斗最多 24 分钟），然后渲染。每帧结束用 **`setTimeout` 让出事件循环**，再立刻下一帧；`setTimeout` 的延时就是操作者面板的“速度”控制。不使用固定 fps 累加器、不使用 rAF 作为主节拍。输出帧率只作为视频编码/时长与 HUD 15s 换算参数。 — **Reversibility:** costly — 这是渲染/模拟耦合的核心时序契约。
- **D-18:** 渲染器**不拥有循环**：`IRenderer.renderFrame()` 只画一帧，`getCanvas()` 暴露 canvas；推进、暂停、单步、延时由 demo/上层 runner 负责。Phase 6 直接拿 canvas 逐帧编码。 — **Reversibility:** costly — Phase 6 的帧采集接口依赖它。
- **D-19:** demo/未来应用使用**真实组合根**接线（参照 `tests/kingdom/harness.ts` 的顺序：物理 → 感知 → 伤害接收方 → 控制 → 王国世界），不伪造单位/战斗数据；`RAPIER.init()` 必须在构造世界前完成。 — **Reversibility:** reversible — 接线细节可重构。
- **D-20:** 所有视觉/时序可调项集中到渲染层常量或配置（阵营色表、分辨率、输出帧率、HUD 阈值、伤害数字阈值、镜头平滑参数、每帧延时的默认值），不在各处写魔法数。 — **Reversibility:** reversible — 调参入口可整理。

### the agent's Discretion

- 每种武器/防具的具体几何造型、线宽、尺寸与配色细节；阵营色调的具体色值。
- 镜头平滑/缩放的缓动曲线、过渡时长、90% 拟合的边距与评分细节。
- 血条尺寸、等级字体大小、伤害数字样式、粒子数量与池上限。
- 操作者面板的布局、文案、镜头模式的具体命名与快捷键。
- `src/render/` 内部文件拆分（遵循每文件夹一个 `types.ts`）与 demo 文件位置。
- demo 默认场景（默认 `DEFAULT_SCENARIO`）、初始镜头状态、是否显示调试网格。
- PixiJS 版本与具体 API 用法。

### Deferred Ideas (OUT OF SCOPE)

- **多场战斗顺序播放/时间回跳/剪辑时间线** — Phase 6；Phase 5 只做目标战斗跟拍。
- **强制结束战斗、单位传送、碰撞体/射线/战斗区叠加等完整调试干预** — 需要 Phase 4 调试接缝；第一版操作面板不做。
- **更进一步的性能优化**（超出基本分区/裁剪） — 用户明确留到后续按实际情况提出。
- **真实贴图/图集/动画资源** — 通过 `IUnitViewFactory` 后续替换，本阶段只做程序化几何。
- **战斗“激烈度”评分与自动选战斗** — 顺序展示归 Phase 6；Phase 5 由调用方指定目标。
- **伤害/击杀统计** — Phase 8，不进入 HUD。

</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| REND-01 | 使用 PixiJS 实现 2D 顶视渲染 | PixiJS `8.22.0`（钉版）、WebGL renderer、`await app.init({width:1920,height:1080,autoStart:false,resolution:1,preserveDrawingBuffer:true})`、`app.render()` 同步手动渲染、`app.canvas` 暴露给 Phase 6；`IRenderer` 只画一帧（D-18） |
| REND-02 | 单位、武器、防具、阵营在画面上可辨 | `IUnitViewFactory` + `GeometryUnitView`；本体白底 `tint = factionColor`；6 武器按“局部 x≈0.7 的竖直轮廓 + 不同头部/长度/弧度”区分；2 防具按“中心内环（头盔）/前向厚弧（盾牌）”区分；共享 `GraphicsContext` 控成本。**注意：`DEFAULT_SCENARIO` 不含 Hammer/Knight，需 demo 变体才能目视验证全部 6 武器 / 2 防具**（见 §Open Questions OQ-2） |
| REND-03 | HUD 显示每个单位的 HP / 等级 / 阵营 | `IHud`：头顶血条（颜色=阵营色、无文字）、本体等级数字（不旋转、世界尺寸）、`15 × outputFps` 帧显隐、总单位少于 6 时常亮、近景屏幕恒定/远景世界尺寸的平滑混合（D-07/D-08/D-09）；数据来自 `IUnit.getAttribute(Health/MaxHealth/Level)` + `IUnitCatalog.getTeam` |
| REND-04 | 自动镜头跟拍激烈战斗区域 | `ICamera` 两态（`BattleFocus` / `Strategic`）；`setBattleTarget(id \| undefined)`（D-15）；中位数 + 第 90 百分位切比雪夫半径保证 ≥90% 成员在画面内；指数平滑 + 定时缓动切换（禁止瞬移）；strategic 全景画军队箭头/城池标志、不画单位（D-14） |
| REND-05 | Chrome-only；数十单位混战下维持可交互帧率 | **按 D-01 放宽**：不追求实时帧率；验收改为“Chrome 能跑、不崩、逐帧推进并输出 canvas”。基本优化：共享 `GraphicsContext`、视口裁剪、Text 不逐帧改字、粒子/伤害数字池化上限、`resolution:1`、无 per-unit filter/mask；不做 LOD/分区网格 |

</phase_requirements>

## Project Constraints (from AGENTS.md)

> `AGENTS.md` 的 Code Conventions 与项目约束对本阶段**同样具有锁定决策的权威**。以下是本研究会遵守/要求 planner 遵守的条目。

| # | AGENTS 指令 | 本阶段的落地方式 |
|---|-------------|------------------|
| 1 | 每个类先写接口 `I<Name>`，再 `implements` 它 | `Renderer implements IRenderer`、`Camera implements ICamera`、`Hud implements IHud`、`GeometryUnitView implements IUnitView`、`UnitViewFactory implements IUnitViewFactory`、`RenderDamageTap implements IDamageSink, IDamageFeed`、`ManualRunner implements IManualRunner` |
| 2 | 每个文件夹一个 `types.ts` | `src/render/types.ts`（门禁契约）、`src/demo/types.ts`（runner/panel/setup）；不新建额外类型文件 |
| 3 | 只用数字枚举 | `CameraMode { Strategic = 0, BattleFocus = 1 }`；`WeaponKind`/`ArmorKind`/`ClassKind`/`AttributeKind`/`ColliderPart` 全部复用上游数字枚举，不重复声明 |
| 4 | 接口成员/方法必须 JSDoc；私有成员/方法必须 JSDoc；所有顶层 `const` 必须 JSDoc | 契约提案已逐成员写 JSDoc；Round 2 的 `DEFAULT_RENDER_CONFIG`、调色板、历法常量、私有字段全部写 JSDoc |
| 5 | 不允许出现不在 interface 中的公共成员 | 所有 class 的公共方法都在其 `implements` 的接口里；Pixi `Application` 的创建用**模块级函数** `createRenderer(...)`，不新增 class 静态公共方法 |
| 6 | 禁止 `get`/`set` 访问器；只读成员优先 `readonly`；`getXxx()` 用于计算/查找 | 不写访问器；`getCanvas()`/`getCamera()`/`getMode()`/`getTransform()`/`getBattleTarget()` 都是方法；配置字段用 `readonly` |
| 7 | 缺失对象用 `null`，缺失字面量用 `undefined` | `IUnitCatalog.getUnit`/`IPhysicsWorld.getUnitState` → `null`；`weapon`/`armorKind`/`weaponKind` → `undefined`；`getBattleTarget()` → `number \| undefined` |
| 8 | 通用可复用抽象放 `src/common/` | demo 复用 `MathRng`（`src/common/rng.ts`）；不为渲染新建通用随机/数学抽象。`mulberry32` 继续留在 `tests/helpers/`（不是生产依赖） |
| 9 | 私有成员用 `private`，禁止 `#` 与 `_` 前缀 | 所有实现类字段/方法用 `private`，命名与公共成员一致 |
| 10 | 多参数优先对象参数；禁止内联对象类型 | `ICameraUpdateInput`、`IHudFrame`、`IRenderServices`、`IUnitViewSpec`、`IUnitViewState`、`IRenderDamageEvent` 等显式 `I*`；不写 `{ x: number; y: number }` 内联参数 |
| 11 | 类型先行 + 用户审查门禁；规划分两轮 | 本文件就是 Round 1 的输入；Round 1 只写 `types.ts` + 契约测试，用户批准后才规划实现 |
| 12 | 不改冻结契约 | 不修改 `IUnit`、`IPhysicsWorld`、`src/control/types.ts`、`IWorld`、`IUnitAI`；伤害旁路用装饰器；时间/物理只读 |
| 13 | 反过度设计；一阶段只攻一个系统 | 不引入状态管理框架/粒子库/相机库/日期库；不做 LOD、分区网格、调试叠加、录制 |
| 14 | Chrome-only；无确定性承诺；不做重放 | 只用 Chrome 155 验证；demo 用 `MathRng`，不承诺 reset 后同一世界；Phase 6 用帧采集而非重放 |
| 15 | 工作流：文件改动通过 GSD 命令 | 本文件只写 RESEARCH.md；实现阶段走 `/gsd-execute-phase`，不直接改生产代码 |

---

## Verified Contract Facts

> 本节把本会话**实际读到的源码 / d.ts / 官方文档**逐字列出。所有 `[VERIFIED: path:lines]` 断言都以本节引文为准；未在本节出现的数值一律按 `[ASSUMED]` 处理。

### 1. 渲染层的读取面：`IWorld` 明确不暴露控制 / 物理

`IWorld` 的注释直接写明了组合根的接线方式：

```ts
// src/kingdom/types.ts:364-374（逐字节选）
/**
 * 王国世界：唯一的编排器，也是 Phase 5（渲染）与 Phase 7（指挥官）的读取面。
 * 它**不**暴露 `IControlSystem` 或 `IPhysicsWorld`，也不复制单位读数——组合根把三者
 * 一并交给渲染层（A18/C-6/C-19）；`KingdomWorld` 通过构造函数注入持有
 * `IControlSystem`，只用于内部调用 `setUnitAI` 切换单位 AI 实例。
 */
export interface IWorld {
```

渲染实际需要的方法（逐字）：

```ts
// src/kingdom/types.ts:375-406（节选，保留签名）
export interface IWorld {
    tick(): IWorldTickResult;
    getTime(): ITimeSystem;
    getBounds(): IMapBounds;
    getTerrain(): readonly ITerrainRect[];
    getScenario(): IScenario;
    getFactions(): readonly IFaction[];
    getFaction(factionId: number): IFaction | null;
    getArmy(armyId: number): IArmy | null;
    getCity(cityId: number): ICity | null;
    getVisibleArmies(factionId: number): readonly IVisibleArmyBrief[];
    getVisibleCities(factionId: number): readonly IVisibleCityBrief[];
    getVisibleUnitIds(factionId: number): readonly number[];
    getBattleSystem(): IBattleSystem;
    issueOrder(order: IArmyOrder): void;
    dispose(): void;
}
```

`IWorld` **没有** `listArmies()` / `listCities()`：全景标记必须从 `getFactions()` → `getArmyIds()` / `getCityIds()` 再逐 id 读取（城池/军队数量很小，代价可忽略）。

战斗与时间读取面（逐字）：

```ts
// src/kingdom/types.ts:254-273
export interface IBattle {
    getId(): number;
    getState(): BattleState;
    getTriggerKind(): BattleTriggerKind;
    getCityId(): number | undefined;
    getCenter(): IVec2;
    getHalfExtent(): number;
    getMemberUnitIds(): readonly number[];
    getStartedAtMinutes(): number;
    getEndedAtMinutes(): number | undefined;
}
// src/kingdom/types.ts:291-304
export interface IBattleSystem {
    tick(): void;
    hasActiveBattle(): boolean;
    getBattleForUnit(unitId: number): IBattle | null;
    listActiveBattles(): readonly IBattle[];
    listCompletedBattles(): readonly IBattle[];
    drainEvents(): readonly IBattleLifecycleEvent[];
}
// src/kingdom/types.ts:236-251（节选）
export interface ITimeSystem {
    getGameMinutes(): number;
    getMinutesPerTick(): number;
    getTickIndex(): number;
    getSubstepsPerTick(): number;
    advance(gameMinutes: number): void;
    advanceTick(): void;
    setMinutesPerTick(minutes: number): void;
}
// src/kingdom/types.ts:93-98
export interface IVec2 {
    readonly x: number;
    readonly y: number;
}
```

军队 / 城池 / 势力（逐字节选）：

```ts
// src/kingdom/types.ts:161-203
export interface IFaction {
    getId(): number;
    getName(): string;
    getArmyIds(): readonly number[];
    getCityIds(): readonly number[];
}
export interface IArmy {
    getId(): number;
    getFactionId(): number;
    getCenter(): IVec2;
    getHeading(): number;
    getState(): ArmyState;
    getUnitIds(): readonly number[];
    getGarrisonedCityId(): number | undefined;
    getEngagedBattleId(): number | undefined;
    getOrder(): IArmyOrder | null;
}
// src/kingdom/types.ts:210-227（节选）
export interface ICity {
    getId(): number;
    getFactionId(): number | undefined;
    getPosition(): IVec2;
    getKind(): CityKind;
    getGarrisonArmyId(): number | undefined;
    getGarrisonCap(): number;
    getTrainingClass(): ClassKind;
    getTrainingProgressMinutes(): number;
}
```

### 2. 单位目录、伤害接收方与冻结的控制契约

```ts
// src/control/types.ts:234-241
export interface IUnitCatalog {
    getUnit(unitId: number): IUnit | null;
    getTeam(unitId: number): number | undefined;
    listUnitIds(): readonly number[];
}
// src/control/types.ts:247-268（节选）
export interface IDamageContext {
    readonly event: IDamageEvent;
    readonly attacker: IUnit;
    readonly defender: IUnit;
    readonly attackerTeamId: number;
    readonly defenderTeamId: number;
}
export interface IDamageSink {
    applyDamage(context: IDamageContext): void;
}
// src/control/types.ts:302-331（节选，方法签名逐字）
export interface IControlSystem extends IUnitCatalog {
    registerUnit(request: IControlUnitRegistration): void;
    unregisterUnit(unitId: number): void;
    updateTeam(unitId: number, teamId: number): void;
    setUnitAI(unitId: number, ai: IUnitAI): void;
    tick(): IControlTickResult;
    dispose(): void;
}
```

`IControlSystem.tick()` 的返回值**只有技能意图**，没有伤害事件——这正是需要伤害旁路的原因：

```ts
// src/control/types.ts:292-295
export interface IControlTickResult {
    /** 本次 tick 产生的技能意图（无则为空数组）。 */
    readonly skillIntents: readonly SkillIntent[];
}
```

### 3. 物理读数与伤害事件

```ts
// src/physics/types.ts:77-90
export interface IUnitState {
    readonly x: number;
    readonly y: number;
    readonly angle: number;
    readonly vx: number;
    readonly vy: number;
    readonly angularVelocity: number;
}
// src/physics/types.ts:128-149（节选）
export interface IDamageEvent {
    readonly attackerId: number;
    readonly defenderId: number;
    readonly attackerPart: ColliderPart;
    readonly defenderPart: ColliderPart;
    readonly weaponKind?: WeaponKind;
    readonly armorKind?: ArmorKind;
    readonly deltaV: number;
    readonly damageMean: number;
    readonly damage: number;
    readonly damageReduced: number;
}
// src/physics/types.ts:195-212
export interface IPhysicsWorld {
    registerUnit(spec: IUnitPhysicsSpec): void;
    removeUnit(unitId: number): void;
    hasUnit(unitId: number): boolean;
    applyForce(unitId: number, forceX: number, forceY: number): void;
    applyTorque(unitId: number, torque: number): void;
    getUnitState(unitId: number): IUnitState | null;
    tick(): IPhysicsTickResult;
    dispose(): void;
}
```

`getUnitState` 的 `angle` 来自 `body.rotation()`（弧度），位置来自 `body.translation()`：

```ts
// src/physics/PhysicsWorld.ts:258-273
getUnitState(unitId: number): IUnitState | null {
    const body = this.bodies.get(unitId);
    if (body === undefined) {
        return null;
    }
    const translation = body.translation();
    const velocity = body.linvel();
    return {
        x: translation.x,
        y: translation.y,
        angle: body.rotation(),
        vx: velocity.x,
        vy: velocity.y,
        angularVelocity: body.angvel()
    };
}
```

### 4. 伤害 → 死亡注销的时序（死亡旁路的唯一正确窗口）

```ts
// src/control/ControlSystem.ts:289-302（逐字）
const result = this.physics.tick();
for (const damage of result.damages) {
    this.routeDamage(damage);
}

const deadUnitIds: number[] = [];
for (const [unitId, unit] of this.units) {
    if (!unit.isAlive()) {
        deadUnitIds.push(unitId);
    }
}
for (const unitId of deadUnitIds) {
    this.removeRegisteredUnit(unitId);
}
```

`BattleDamageSink` 在 `applyDamage` 里先做同队 / 存活 / 同场 / 在区 / 物理读数过滤，再 `takeDamage`：

```ts
// src/kingdom/DamageSink.ts:48-58, 84-99（节选）
applyDamage(context: IDamageContext): void {
    if (context.attackerTeamId === context.defenderTeamId) {
        return;
    }
    if (!context.defender.isAlive()) {
        return;
    }
    // ...同场 / 在区 / 物理读数过滤...
    const wasAlive = context.defender.isAlive();
    context.defender.takeDamage(context.event.damage);
    const survivedHit = context.defender.isAlive();
    // ...
}
```

**结论：** 装饰器在 `inner.applyDamage()` 返回后立刻读取 `defender.isAlive()` 与 `physics.getUnitState(defenderId)`：死亡已成立、刚体尚未删除。若改成“下一帧对比 id 集合”，位置已经被 `removeUnit` 清掉。

### 5. 世界推进与单位生命周期

```ts
// src/kingdom/KingdomWorld.ts:264-292（节选）
tick(): IWorldTickResult {
    this.expireFulfilledOrders();
    this.runCommanders();
    const rate = this.battles.hasActiveBattle()
        ? BATTLE_TICK_MINUTES
        : PEACE_TICK_MINUTES;
    this.time.setMinutesPerTick(rate);
    let advanced = 0;
    for (let step = 0; step < rate; step += 1) {
        this.stepSubstep();
        advanced += 1;
        if (rate > 1 && this.battles.hasActiveBattle()) {
            break;
        }
    }
    // ...setMinutesPerTick(finalRate); advanceTick(); return {gameMinutes, minutesPerTick}
}
// src/kingdom/KingdomWorld.ts:841-855
private stepSubstep(): void {
    this.time.advance(1);
    this.resolveOrders();
    this.advanceArmies();
    this.rebuildSlots();
    this.battles.tick();
    this.recordBattleParticipants();
    this.rebuildArmyStates();
    this.updateBrakeWindows();
    this.updateUnitModes();
    this.control.tick();          // ← 物理 + 伤害 + 死亡注销都在这里面
    this.applyHealing();
    this.applyTraining();
    this.pruneDeadUnits();
}
```

**每个输出帧恰好调用一次 `IWorld.tick()`（D-17）；绝不再单独调用 `control.tick()`**，否则物理会被推进两次。

死亡单位由 `ControlSystem` 先注销，再由 `KingdomWorld.pruneDeadUnits()` 从名册剪枝：

```ts
// src/kingdom/KingdomWorld.ts:1834-1866（节选）
private pruneDeadUnits(): void {
    const dead: number[] = [];
    for (const [unitId, unit] of this.units) {
        if (!unit.isAlive()) {
            dead.push(unitId);
        }
    }
    // ...从 units/unitArmy/modes/slots/... 删除，并从 army.setUnitIds 过滤
}
```

`BattleSystem.pruneMembers()` 也会把死亡 / 注销 / 结束战斗的成员从 `memberUnitIds` 移除：

```ts
// src/kingdom/BattleSystem.ts:377-392（节选）
private pruneMembers(): void {
    for (const [unitId, battleId] of [...this.membership]) {
        const unit = this.unitOf(unitId);
        const battle = this.findActive(battleId);
        if (battle === null || unit === null || !unit.isAlive()) {
            this.membership.delete(unitId);
            if (battle !== null) {
                battle.setMemberUnitIds(
                    battle
                        .getMemberUnitIds()
                        .filter(memberId => memberId !== unitId)
                );
            }
        }
    }
}
```

### 6. 组合根接线顺序（demo 必须照抄）

```ts
// tests/kingdom/harness.ts:140-192（逐字节选）
export function createKingdom(
    options: IKingdomHarnessOptions = {}
): IKingdomFixture {
    // ...
    const physics = new PhysicsWorld(
        { dt: DT, geometry: DEFAULT_GEOMETRY },
        mulberry32(seed)
    );
    const sensing = new KingdomSensingWorld(
        scenario.width,
        scenario.height,
        scenario.terrain
    );

    let worldRef: KingdomWorld | null = null;
    const sink = new BattleDamageSink(
        physics,
        () => worldRef?.getBattleSystem() ?? null
    );

    const provider: IUnitAIProvider = { /* IdleAI */ };

    const control = new ControlSystem(physics, sensing, provider, sink);
    const rng = mulberry32(seed + 1);
    const world = new KingdomWorld(
        physics,
        control,
        rng,
        scenario,
        options.config ?? defaultKingdomConfig(options.commanderFactory)
    );
    worldRef = world;

    return { world, control, physics, sensing, rng };
}
```

装饰器只需把 `sink` 换成 `tap(sink)`，其余顺序不变；`worldRef` 的晚绑定仍然是必需的（sink 先于 World 构造）。

### 7. 阵营 = `teamId` = `factionId`（颜色映射的依据）

```ts
// src/kingdom/KingdomWorld.ts:1962-1968（逐字节选：只省略了首尾缩进）
this.control.registerUnit({
    unitId,
    unit,
    teamId: army.getFactionId(),
    x: spec.x + Math.cos(angle) * SPAWN_RING_RADIUS,
    y: spec.y + Math.sin(angle) * SPAWN_RING_RADIUS
});
```

因此 `catalog.getTeam(unitId)` 直接就是 `factionId`，渲染层不需要另外维护势力映射。

### 8. 物理几何与 Rapier 武器轴向

```ts
// src/physics/constants.ts:31-42（逐字节选）
export const DEFAULT_GEOMETRY: IPhysicsGeometry = {
    /** 本体圆半径（米）：单位自身的圆形碰撞体。 */
    bodyRadius: 0.5,
    /** 武器 capsule 半长（米）：细长武器主体长度之半（主轴为局部 y）。 */
    weaponHalfLength: 0.4,
    /** 武器 capsule 半径（米）：武器粗细。 */
    weaponRadius: 0.05,
    /** 武器局部原点相对本体中心的 x 偏移（米）：武器架在身位前方。 */
    weaponOffsetX: 0.7,
    /** 防具圆半径（米）：略大于本体、与本体同心，使武器先触防具再触本体。 */
    armorRadius: 0.55
};
```

```ts
// src/physics/PhysicsWorld.ts:130-147（逐字）
if (spec.weapon !== null) {
    const weaponCollider = this.world.createCollider(
        RAPIER.ColliderDesc.capsule(
            geometry.weaponHalfLength,
            geometry.weaponRadius
        )
            .setTranslation(geometry.weaponOffsetX, 0)
            .setMass(spec.weapon.mass)
            .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
        body
    );
    // ...index.set(..., { part: ColliderPart.Weapon, weaponKind: spec.weapon.id })
}
```

```ts
// node_modules/@dimforge/rapier2d-compat/dist/geometry/collider.d.ts:685（逐字）
* @param halfHeight - The half-height of the capsule, along the `y` axis.
```

**几何结论：** 武器碰撞体是位于局部 `(0.7, 0)`、长轴沿局部 **y** 的 capsule，跨 `y ∈ [-0.4, 0.4]`。视觉必须画在这个足迹上；若画成沿 +x 的“矛尖”，命中会与画面不一致。

### 9. 单位视觉数据

```ts
// src/units/types.ts:224-247（逐字节选）
export interface IUnit {
    getAttribute(kind: AttributeKind): number;
    getName(): string;
    getClass(): ClassKind;
    getEquipment(): readonly IEquipment[];
    getModifiers(): readonly IModifier[];
    getSkills(): readonly SkillKind[];
    takeDamage(amount: number): void;
    isAlive(): boolean;
    // ...
}
// src/units/types.ts:129-136
export interface IEquipment {
    readonly kind: EquipmentKind;
    readonly weapon?: WeaponKind;
    readonly armor?: ArmorKind;
}
```

枚举（数字枚举，逐字）：

```ts
// src/units/types.ts:13-40（节选）
export enum AttributeKind {
    Health = 0,
    MaxHealth = 1,
    Level = 2,
    // ...
}
// src/units/types.ts:43-82（节选）
export enum ClassKind {
    Swordsman = 0,
    Archer = 1,
    Berserker = 2,
    Hammer = 3,
    Knight = 4,
    SwordShield = 5,
    Spearman = 6
}
export enum WeaponKind {
    Longsword = 0,
    Shortsword = 1,
    Axe = 2,
    Hammer = 3,
    Bow = 4,
    Spear = 5
}
export enum ArmorKind {
    Helmet = 0,
    Shield = 1
}
```

### 10. 职业初始装备：全部 6 武器 / 2 防具都有来源

逐字核对 `src/units/data.ts:57-306`（`CLASS_DEFS`）的 `initialEquipment`：

| ClassKind | 初始武器 | 初始防具 |
|-----------|----------|----------|
| `Swordsman` | `Longsword` | — |
| `Archer` | `Bow` | — |
| `Berserker` | `Axe` | — |
| `Hammer` | `Hammer` | — |
| `Knight` | `Longsword` | `Helmet` |
| `SwordShield` | `Shortsword` | `Shield` |
| `Spearman` | `Spear` | — |

→ 7 个职业合起来覆盖 **全部 6 种武器**与 **2 种防具**；因此“全兵种 demo 变体”可以让 REND-02 的 6+2 形状全部出镜。`DEFAULT_SCENARIO` 只用其中 5 个职业，故缺 `Hammer` / `Helmet`（见下一节）。

### 11. 默认场景：16 单位、5/7 职业、5/6 武器、1/2 防具

```ts
// src/kingdom/scenario.ts:278-357（节选）
export const DEFAULT_SCENARIO: IScenario = {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    factions: [
        { id: 1, name: '赤' },
        { id: 2, name: '蓝' }
    ],
    cities: [ /* 2 城：主城 150,150 / 普通城 850,850 */ ],
    armies: [
        {
            id: 1, factionId: 1, x: 220, y: 220, heading: Math.PI / 4,
            units: [
                { classKind: ClassKind.Swordsman, count: 4 },
                { classKind: ClassKind.Archer, count: 2 },
                { classKind: ClassKind.Spearman, count: 2 }
            ]
        },
        {
            id: 2, factionId: 2, x: 780, y: 780, heading: (-3 * Math.PI) / 4,
            units: [
                { classKind: ClassKind.Berserker, count: 4 },
                { classKind: ClassKind.Archer, count: 2 },
                { classKind: ClassKind.SwordShield, count: 2 }
            ]
        }
    ],
    terrain: [ /* 4 块城池附近地形 */ ]
};
```

- 单位总数 **16**（4+2+2 + 4+2+2）。
- 出现的职业：Swordsman / Archer / Spearman / Berserker / SwordShield（**缺 Hammer / Knight**）。
- 出现的武器：Longsword / Bow / Spear / Axe / Shortsword（**缺 Hammer**）。
- 出现的防具：Shield（**缺 Helmet**）。

这是 REND-02 目视验证的一个真实缺口；见 §Open Questions。

### 12. 时间系统初始为 24×

```ts
// src/kingdom/TimeSystem.ts:20-23
private tickIndex = 0;
/** 当前每个外层 tick 覆盖的游戏分钟数（1 = 战斗，24 = 和平）。 */
private minutesPerTick = PEACE_TICK_MINUTES;
```

### 13. PixiJS 8.22.0 API 事实（官方文档 + 已安装 d.ts）

**异步初始化 / 手动渲染 / canvas：**

```ts
// node_modules/pixi.js/lib/app/Application.d.ts:240-249, 268（逐字节选）
 * await app.init({ autoStart: false }); // Disable automatic rendering
 * function animate() {
 *     app.render();
 *     requestAnimationFrame(animate);
 * }
render(): void;
get canvas(): R['canvas'];
```

```ts
// node_modules/pixi.js/lib/app/TickerPlugin.d.ts:55
autoStart?: boolean;
```

```ts
// node_modules/pixi.js/lib/rendering/renderers/types.d.ts:14
export type Renderer<T extends ICanvas = HTMLCanvasElement> = WebGLRenderer<T> | WebGPURenderer<T> | CanvasRenderer<T>;
```

→ 默认 `Application<Renderer>` 的 `app.canvas` 在类型上是 `HTMLCanvasElement`，`IRenderer.getCanvas(): HTMLCanvasElement` 无需强转。[VERIFIED: pixi d.ts app/Application.d.ts:158,268; rendering/renderers/types.d.ts:14]

**`preserveDrawingBuffer` 是 WebGL 上下文选项，可通过 `app.init` 传入：**

```ts
// node_modules/pixi.js/lib/rendering/renderers/gl/context/GlContextSystem.d.ts:44-48（逐字）
 * Whether to enable drawing buffer preservation. If enabled, the drawing buffer will preserve
 * its value until cleared or overwritten. Enable this if you need to call `toDataUrl` on the WebGL context.
 * @default false
 */
preserveDrawingBuffer: boolean;
```

`GlContextSystem` 属于 `DefaultWebGLSystems`，其 options 经 `ExtractRendererOptions` 进入 `WebGLOptions` → `ApplicationOptions`。[VERIFIED: pixi d.ts rendering/renderers/gl/WebGLRenderer.d.ts:33-40; app/Application.d.ts:107] Phase 6 逐帧把 canvas 交给 WebCodecs 时，建议现在就打开它（见 OQ-5）。

**Graphics / Container / Text（v8 形状）：**

```ts
// node_modules/pixi.js/lib/scene/graphics/shared/Graphics.d.ts:90,354,406,714,878,945（逐字节选）
export declare class Graphics extends ViewContainer<GraphicsGpuData> implements Instruction {
fill(style?: FillInput): this;
stroke(...args: Parameters<GraphicsContext['stroke']>): this;
circle(x: number, y: number, radius: number): this;
rect(x: number, y: number, w: number, h: number): this;
poly(points: number[] | PointData[], close?: boolean): this;
```

```ts
// node_modules/pixi.js/lib/scene/container/Container.d.ts:959,1247,1268（逐字节选）
get position(): ObservablePoint;
set tint(value: ColorSource);
get tint(): number;
```

```ts
// node_modules/pixi.js/lib/scene/text/Text.d.ts:163（逐字）
constructor(options?: CanvasTextOptions);
// node_modules/pixi.js/lib/scene/text/AbstractText.d.ts:136
anchor?: PointData | number;
```

**Extract（Phase 6 备选路径，不是 Phase 5 主路径）：**

```ts
// node_modules/pixi.js/lib/rendering/renderers/shared/extract/ExtractSystem.d.ts:545
canvas(options: ExtractOptions | Container | Texture): ICanvas;
```

官方文档明确 `renderer.extract.canvas(target)` 是“把 target 渲染到一个新 canvas 并返回”，且“Extraction operations are relatively expensive”。[CITED: https://pixijs.download/release/docs/rendering.ExtractSystem.html]

**v8 破坏性变更（官方迁移指南）：**

- `Graphics` API 重写：先建形状再 `.fill()` / `.stroke()`；`drawCircle` → `circle`，`drawRect` → `rect`，`drawPolygon` → `poly`；`GraphicsGeometry` → `GraphicsContext`。
- **Leaf nodes no longer allow children**：`Sprite`、`Graphics` 等不能 `addChild`，只有 `Container` 可以。
- `Application.view` → `Application.canvas`；构造函数选项废弃，必须 `await app.init(...)`。
- `Container.name` → `Container.label`。
- `Ticker` 回调参数改为 `Ticker` 实例（不是 dt）。
[CITED: https://pixijs.com/8.x/guides/migrations/v8]

**性能提示（官方）：**

- Graphics 在“不被持续修改（transform/alpha/tint 除外）”时最快；小 Graphics（≤100 点）可与 Sprite 同速并批处理；数百个复杂 Graphics 会慢。
- Text 每帧改字很贵（每次重新栅格化并上传 GPU）；动态大量文字用 BitmapText。
- Culling 默认关闭；官方建议在应用层做，或在性能不是瓶颈时不要开（CPU-bound 时可能更慢）。
[CITED: https://pixijs.com/8.x/guides/concepts/performance-tips]

### 14. `setTimeout` 的 4ms 钳制

> “browsers will enforce a minimum timeout of 4 milliseconds once a nested call to `setTimeout` has been scheduled 5 times.”
> 另外，Chrome 对不可见标签页有节流；页面可见且活跃时为 minimal throttling。
[CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout]

→ `setTimeout(..., 0)` 的实际上限约 250 帧/秒；CONTEXT 已接受该行为（“先这样模拟未来 WebSocket 推理延迟”）。

### 15. 环境与基线（本会话实测）

- `node --version` → `v24.21.0`；`pnpm --version` → `12.5.1`；`npm --version` → `11.19.0`。[VERIFIED: baseline]
- Chrome → `155.0.8059.85`（`C:\Program Files\Google\Chrome\Application\chrome.exe`）。[VERIFIED: baseline]
- `pnpm typecheck` → 无输出 / 退出成功。[VERIFIED: baseline]
- `pnpm test` → **33 files / 332 tests passed，4.38s**。[VERIFIED: baseline]
- `vite.config.ts`：`base: './'`、`server.port: 8074`、`@` → `src`。[VERIFIED: vite.config.ts:4-14]
- `vitest.config.ts`：`environment: 'node'`、`include: ['tests/**/*.test.ts']`。[VERIFIED: vitest.config.ts:4-13]
- `package.json` 当前**没有** `dev` script，**没有** PixiJS 依赖。[VERIFIED: package.json:10-30]

---

## Architectural Responsibility Map

| Capability | Primary Tier | Secondary Tier | Rationale |
|------------|-------------|----------------|-----------|
| 1920×1080 画布 / 场景图 / GPU 批处理 | Browser / Client（PixiJS `Application`） | — | REND-01；Chrome-only；渲染器不拥有循环（D-18） |
| 世界状态读取（单位/军队/城池/时间/战斗） | Domain（`IWorld` / `IUnitCatalog` / `IPhysicsWorld`，只读） | Composition root（把三者交给渲染层） | `IWorld` 注释明确不暴露控制/物理；组合根负责接线（A18/C-6/C-19） |
| 伤害 / 死亡事件旁路 | Composition root（`IDamageSink` 装饰器） | Render layer（`IDamageFeed` 消费） | 不改冻结契约；死亡位置只在 `ControlSystem` 注销前可得 |
| 单位视觉（本体/武器/防具/阵营） | Client（`IUnitViewFactory` + `GeometryUnitView`） | — | D-03/D-04；未来可换 `SpriteUnitView`，`IRenderer`/`ICamera`/`IHud` 不变 |
| 单位 HUD（血条/等级） | Client（`IHud`，世界层 + 混合缩放） | — | D-07/D-08/D-09；等级必须世界尺寸且不旋转 |
| 自动镜头（拟合/平滑/全景） | Client（`ICamera` + 纯 `cameraMath`） | — | D-14/D-15；Phase 6 只驱动 `setBattleTarget` |
| 逐帧推进 / 暂停 / 单步 / 重置 | Demo runner（`setTimeout`） | — | D-17；渲染器只画一帧（D-18） |
| 操作者面板 | Browser DOM（HTML/CSS，canvas 之外） | Demo runner（调用 `issueOrder`） | D-12；永不出现在视频里 |
| 时间/速度信息条 | Client（canvas 内 screen layer） | — | D-11；必须进入视频，所以必须在 canvas 内 |
| 视频编码 / 帧采集 | Phase 6（out of scope） | Phase 5 只暴露 `renderFrame()` + `getCanvas()` | D-18/REC-01..03 |

---

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| `pixi.js` | **`8.22.0`（精确钉版，待安装）** | 唯一的 2D WebGL 渲染器；`Application` / `Container` / `Graphics` / `GraphicsContext` / `Text` | 项目约束指定 PixiJS；v8 是当前主线（npm `latest`），WebGL renderer 官方推荐用于生产，WebGPU 仍标注 experimental |
| TypeScript | `typescript` = `@typescript/typescript6@^6.0.2` + `@typescript/native`（TS7） | 类型门禁 + `expectTypeOf` | 仓库既有双 TS 方案；本阶段不改 |
| Vite | `^8.3.4`（已安装） | `pnpm dev` 开发服务器 / bundling | 仓库既有；`base: './'`、端口 8074 已配置 |
| Vitest | `^5.0.4`（实测 5.0.4） | 纯数学 / 适配逻辑 / 组合根测试 | 仓库既有；node 环境；Rapier 真 WASM 已在用 |
| Node.js | `>=24`（实测 v24.21.0） | 运行测试 / dev server | `package.json:9` |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `@dimforge/rapier2d-compat` | `0.21.0`（已钉死） | 真实物理 / 组合根 / 集成测试 | demo 与 Rapier 集成测试；WASM 以 base64 内联，Vite 无需额外 wasm 配置 |
| `@/kingdom`（`IWorld`/`IBattleSystem`/`DEFAULT_SCENARIO`） | 仓库内 | 世界读取面 + 场景 | 渲染器只读；不改 |
| `@/control`（`IUnitCatalog`/`IDamageSink`/`IDamageContext`） | 仓库内 | 单位目录 + 伤害旁路 | 装饰器实现 `IDamageSink`；不修改类型 |
| `@/physics`（`IPhysicsWorld`/`IUnitState`/`DEFAULT_GEOMETRY`） | 仓库内 | 位置/朝向/速度 + 几何基准 | 每帧读取；武器/防具尺寸取自 `DEFAULT_GEOMETRY` |
| `@/units`（`AttributeKind`/`WeaponKind`/`ArmorKind`/`IEquipment`） | 仓库内 | HUD 数值与视觉选择 | 数字枚举直接作为形状选择键 |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `pixi.js@8.22.0` | `pixi.js@7.4.3` | v7 同步构造函数、旧 Graphics API；但 v8 是当前主线且官方文档/类型更完整。项目没有遗留 Pixi 代码，**没有理由从 v7 开始**。 |
| WebGL renderer | WebGPU renderer | 官方文档标注 WebGPU “still maturing / inconsistencies in browser implementations”；本项目 Chrome-only 但仍建议 `preference: 'webgl'`，避免 WebGPU 驱动的差异。[CITED: https://pixijs.com/8.x/guides/components/renderers] |
| `app.render()` 手动渲染 | `app.ticker.add(...)` 自动循环 | D-17 明确禁止 rAF 主节拍；ticker 会按真实时间驱动，与“每帧恰好一个 `IWorld.tick()`”冲突。必须 `autoStart: false`。 |
| `app.canvas` 直接给 Phase 6 | `renderer.extract.canvas(stage)` | `extract` 会新建 canvas 并做一次额外渲染，官方标注“relatively expensive”；每帧编码应由 Phase 6 直接消费 `app.canvas`（必要时开 `preserveDrawingBuffer`）。 |
| `Container` 作为 `IUnitView` 根 | 不透明句柄 / 自定义 `IViewNode` 抽象 | 不透明句柄需要额外抽象层才能挂到场景图，属于过度设计；`Container` 是 v8 所有显示对象的公共基类（`DisplayObject` 已移除）。代价：`src/render/types.ts` 会 `import type { Container } from 'pixi.js'`。 |
| `Text` 画等级/伤害数字 | `BitmapText` | `Text` 对“偶尔变化”的文字够用且无需字体资源；`BitmapText` 更快但需要预生成字体。等级只在升级时变，伤害数字池化后只在生成时改字——`Text` 足够。 |
| 解析/手写镜头拟合 | 第三方相机库 | 需求非常具体（90% 百分位拟合 + 两态 + 平滑切换）；手写纯函数更小、可测、无额外依赖。 |

**Installation:**

```bash
# Wave 0（类型门禁之前）：精确钉版 + 人类确认（见 Package Legitimacy Audit）
pnpm add -E pixi.js@8.22.0

# Round 2 追加 dev/build 脚本（package.json）
# "dev": "vite",
# "build": "vite build"
pnpm dev        # http://localhost:8074
pnpm typecheck  # 类型门禁的真正判据
pnpm test       # 纯数学 + 集成
pnpm lint
```

**Version verification:**

- `npm view pixi.js version` → `8.22.0`；`dist-tags.latest` → `8.22.0`。[VERIFIED: npm registry]
- `npm view pixi.js time.created` → `2022-01-26T18:15:32.151Z`；`weeklyDownloads` → `845,563`；`repository.url` → `git+https://github.com/pixijs/pixijs.git`；`license` → `MIT`；`scripts.postinstall` → `null`。[VERIFIED: npm registry / legitimacy seam]
- 本会话把 `pixi.js@8.22.0` 安装到临时目录并读取了 `lib/*.d.ts`（见 §Verified Contract Facts 13），确认 `Application.init/render/canvas`、`Graphics` v8 方法、`Container.tint`、`Text` 选项构造、`ExtractSystem.canvas` 均存在。[VERIFIED: pixi d.ts]

---

## Package Legitimacy Audit

> 本阶段**唯一**新增外部包是 `pixi.js`。按 Package Legitimacy Gate 运行了 seam：
> `gsd-tools query package-legitimacy check --ecosystem npm pixi.js`

| Package | Registry | Age | Downloads | Source Repo | Verdict | Disposition |
|---------|----------|-----|-----------|-------------|---------|-------------|
| `pixi.js` | npm | 包创建于 **2022-01-26**（4.7 年）；最新版 `8.22.0` 发布于 **2026-10-01**（约 20 天） | **845,563 / 周** | `git+https://github.com/pixijs/pixijs.git` | **SUS**（信号仅 `too-new`：最新 release 太新） | **保留 + 标记**；planner 必须在安装前加 `checkpoint:human-verify`。安装命令用 `pnpm add -E pixi.js@8.22.0`，安装后核对 `pnpm list pixi.js` 为 `8.22.0`。 |

**解读：** seam 的 `too-new` 是“最新版本发布时间”信号，不是“整包新出现”。该包 845k 周下载、官方 GitHub、MIT、`postinstall: null`、创建于 2022 年；风险等级按协议仍标 `SUS`，但不需要替换。若用户希望避开该信号，可改钉一个更早的 8.x 版本（例如 `8.15.x`）——API 用法不变；但**本研究会话只核验了 8.22.0 的 d.ts**，换版本需重新核对类型。

**Packages removed due to [SLOP] verdict:** none
**Packages flagged as suspicious [SUS]:** `pixi.js`（planner 在 Wave 0 插入 `checkpoint:human-verify`，确认“接受 PixiJS 官方包 + 钉版 8.22.0”后再安装）

*没有引入行为树库、相机库、粒子库、日期库或测试工具；所有渲染逻辑都是仓库内 TypeScript。*

---

## Architecture Patterns

### System Architecture Diagram

```
┌───────────────────────────────────────────────────────────────────────────────┐
│ src/main.ts（demo 入口，async）                                                 │
│                                                                               │
│  await RAPIER.init()                                                          │
│  createDemoSetup()  ────────────────┐                                         │
│    PhysicsWorld                     │                                         │
│      ↓                              │                                         │
│    KingdomSensingWorld              │  组合根顺序照抄 tests/kingdom/harness.ts   │
│      ↓                              │                                         │
│    BattleDamageSink  ◄── worldRef ──┤                                         │
│      ↓                              │                                         │
│    RenderDamageTap（装饰器）─────────┼──► IDamageFeed（当帧伤害/死亡快照）       │
│      ↓                              │                                         │
│    ControlSystem                    │                                         │
│      ↓                              │                                         │
│    KingdomWorld ────────────────────┘                                         │
│                                                                               │
│  await createRenderer(() => services, config)  ──► IRenderer（PixiJS）         │
│  new ManualRunner(services, renderer, loopConfig) ──► setTimeout 逐帧驱动      │
│  new OperatorPanel(services, renderer, runner)  ──► HTML/CSS（canvas 之外）    │
└───────────────────────────────────────────────────────────────────────────────┘

每个输出帧（ManualRunner.runOneFrame）：
┌───────────────────────────────────────────────────────────────────────────────┐
│ 1. world.tick()          // 恰好 1 个外层 tick（战斗 1 分钟 / 和平最多 24 分钟） │
│ 2. renderer.renderFrame()                                                      │
│    2.1 services = getServices()                                                │
│    2.2 targetId = camera.getBattleTarget()                                     │
│        targetPlane = 解析当前战斗的存活成员 → 世界坐标点集                      │
│    2.3 transform = camera.update({viewport, bounds, points})                   │
│        worldLayer.position/scale = transform（含 shake）                        │
│    2.4 events = damageFeed.drain()                                             │
│    2.5 若 BattleFocus：按 catalog.listUnitIds 调和 IUnitView（创建/销毁）       │
│    2.6 每个 view.apply({x,y,angle,flash,visible})                              │
│    2.7 计算 IHudUnitState[]（healthRatio / level / visible / hudScale）         │
│    2.8 hud.update({units, events, camera, gameMinutes, minutesPerTick,...})    │
│    2.9 app.render()       // 同步；Pixi 的 ticker 已 stop                      │
│ 3. setTimeout(next, frameDelayMs)   // 让出事件循环；按钮保持响应               │
└───────────────────────────────────────────────────────────────────────────────┘

图层（app.stage 的直接子节点，按绘制顺序）：
  worldLayer（相机变换）
    ├── mapLayer       静态：地图底/网格/地形（只画一次）
    ├── unitLayer      单位根（仅 BattleFocus；Container 根 + 旋转子节点）
    ├── hudLayer       单位头顶元素（等级/血条） + 伤害数字 + 粒子 + 死亡特效
  strategicLayer       全景标记（屏幕空间，固定像素大小；仅 Strategic）
  screenLayer          视频信息条（时间 + 速度；不受相机影响）
```

### 一帧里的数据流（谁读谁）

| 数据 | 来源 | 消费者 | 频率 |
|------|------|--------|------|
| 单位 id 集合 | `IUnitCatalog.listUnitIds()` | `Renderer` 调和 | 每帧 |
| 单位属性（HP/等级） | `IUnit.getAttribute(Health/MaxHealth/Level)` | `IHud` | 每帧（数值读取便宜） |
| 阵营 | `IUnitCatalog.getTeam(unitId)` | 颜色解析 / 装饰器 | 每帧 / 伤害时 |
| 位置/朝向 | `IPhysicsWorld.getUnitState(unitId)` | 视图 + HUD + 镜头 | 每帧 |
| 装备 | `IUnit.getEquipment()` | 视图工厂（**仅创建时**） | 一次 |
| 战斗成员 | `IBattle.getMemberUnitIds()` | 镜头拟合 | 每帧 |
| 军队/城池标记 | `IWorld.getFactions()` → `getArmy`/`getCity` | `strategicLayer` | 每帧（Strategic） |
| 时间/倍率 | `IWorld.getTime()` | 信息条 | 每帧 |
| 伤害/死亡 | `IDamageFeed.drain()` | flash / 数字 / 粒子 / 计时 | 每帧 |
| 镜头 transform | `ICamera.update()` | worldLayer + HUD + 拾取 | 每帧 |

### Recommended Project Structure

```
src/
├── render/                     # 系统本体（Round 1 只写 types.ts）
│   ├── types.ts                # 门禁契约：所有枚举 / 接口 / 配置形状
│   ├── constants.ts            # D-20 唯一调参入口：DEFAULT_RENDER_CONFIG / 调色板 / validateRenderConfig
│   ├── calendar.ts             # 纯函数：游戏分钟 → 简化历字符串
│   ├── cameraMath.ts           # 纯函数：百分位拟合 / 平滑 / 切换 / world↔screen
│   ├── hudModel.ts             # 纯函数：15s 计时 / <6 常亮 / 混合缩放 / 伤害阈值
│   ├── frameModel.ts           # 纯函数：血量比 / 视口裁剪 / 视觉 spec 选择
│   ├── Camera.ts               # ICamera 的薄状态机（调用 cameraMath）
│   ├── DamageTap.ts            # IDamageSink 装饰器 + IDamageFeed
│   ├── GeometryUnitView.ts     # IUnitView 的程序化几何实现
│   ├── UnitViewFactory.ts      # IUnitViewFactory（共享 GraphicsContext）
│   ├── Hud.ts                  # IHud：血条 / 等级 / 数字 / 粒子 / 死亡 / 信息条
│   └── Renderer.ts             # IRenderer：图层、调和、renderFrame、getCanvas
├── demo/                       # 验证 harness（不是最终 app shell）
│   ├── types.ts                # IRenderServices / IManualRunner / IOperatorPanel
│   ├── composition.ts          # 真实组合根（无 Pixi 依赖，可在 Node 测）
│   ├── runner.ts               # ManualRunner（setTimeout / pause / step / reset）
│   ├── panel.ts                # HTML/CSS 操作者面板
│   └── scenario.ts             # 可选：包含全部 7 职业的 demo 场景变体（见 OQ-2）
├── main.ts                     # await RAPIER.init + await createRenderer + 启动
├── style.css                   # 页面布局：canvas 等比缩放居中 + 右侧面板
└── ...

index.html                      # Vite 入口（根目录）
tests/
└── render/
    ├── types.test.ts           # Round 1：枚举钉版 + expectTypeOf
    ├── calendar.test.ts
    ├── camera-math.test.ts
    ├── hud-model.test.ts
    ├── frame-model.test.ts
    ├── damage-tap.test.ts
    ├── visual-spec.test.ts
    └── fakes.ts                # 窄依赖的 fake（IUnit / IUnitState / IDamageSink）
```

**为什么 `src/demo/` 单独一个 `types.ts`：** AGENTS §2 要求“每个文件夹一个 `types.ts`”。`src/render/types.ts` 是门禁契约；demo 的 runner/panel 类型（`IRenderServices`、`IManualRunner`、`IOperatorPanel`）属于实现细节，放在 demo 文件夹，避免把门禁面撑大。`IRenderServices` 若被 `IRenderer` 的工厂函数参数引用，则按依赖方向放进 `src/render/types.ts`（见 §Recommended Contract Shape 的待决项）。

### Pattern 1: 只读渲染器（Pull-only over frozen contracts）

**What:** `IRenderer` 持有 `IWorld` / `IUnitCatalog` / `IPhysicsWorld`（通过 `IRenderServices` 提供器），每帧**拉取**状态；不订阅事件、不写回任何模拟状态。
**When to use:** 本阶段始终。
**Why:** `IWorld` 明确不暴露控制/物理；组合根把三者交给渲染层是项目既定做法（A18/C-6/C-19）。拉取模型没有事件顺序问题，也便于 Phase 6 在任何时刻调用 `renderFrame()`。

```ts
// 设计提案（待门禁）
export interface IRenderServices {
    readonly world: IWorld;
    readonly catalog: IUnitCatalog;
    readonly physics: IPhysicsWorld;
    readonly damageFeed: IDamageFeed;
}
export type RenderServicesProvider = () => IRenderServices;
```

`renderFrame()` 的伪代码：

```ts
// 设计提案
renderFrame(): void {
    const services = this.getServices();
    this.frameIndex += 1;

    const targetId = this.camera.getBattleTarget();
    const points = this.resolveTargetPoints(services, targetId);
    const transform = this.camera.update({
        viewport: this.viewport,
        bounds: services.world.getBounds(),
        points
    });
    this.worldLayer.position.set(...);
    this.worldLayer.scale.set(transform.scale);

    const events = services.damageFeed.drain();
    const focus = this.camera.getMode() === CameraMode.BattleFocus;
    this.unitLayer.visible = focus;
    this.strategicLayer.visible = !focus;

    if (focus) {
        this.syncUnitViews(services, events);
        this.updateUnitViews(services, transform);
    } else {
        this.releaseUnitViews();
        this.updateStrategic(services, transform);
    }

    // 全景下单位不渲染，伤害数字/粒子/血条计时一律丢弃（事件已 drain，避免积压）。
    this.hud.update(this.buildHudFrame(services, focus ? events : [], transform));
    this.app.render();
}
```

### Pattern 2: `IDamageSink` 装饰器（伤害/死亡旁路）

**What:** 组合根用 `RenderDamageTap implements IDamageSink, IDamageFeed` 包住 `BattleDamageSink`。`applyDamage` 先调用内层（保留全部战斗规则与过滤），成功后记录一条 `IRenderDamageEvent`，并用 `wasAlive && !isAlive()` 判定击杀。
**When to use:** 唯一需要伤害/死亡反馈的地方。
**Why:** `IControlSystem.tick()` 只返回 `skillIntents`；伤害直接路由给注入的 sink。装饰器是**唯一**不改冻结契约的缝。子类化 `BattleDamageSink` 也可行，但耦合具体类；装饰器只依赖 `IDamageSink`。

```ts
// 设计提案
export class RenderDamageTap implements IDamageSink, IDamageFeed {
    private readonly inner: IDamageSink;
    private readonly getUnitState: UnitStateLookup;
    private buffered: IRenderDamageEvent[] = [];

    applyDamage(context: IDamageContext): void {
        const wasAlive = context.defender.isAlive();
        const healthBefore = context.defender.getAttribute(AttributeKind.Health);
        this.inner.applyDamage(context);          // 抛错则直接向上抛，不记录
        const healthAfter = context.defender.getAttribute(AttributeKind.Health);
        const killed = wasAlive && !context.defender.isAlive();
        const appliedDamage = Math.max(0, healthBefore - healthAfter);
        // 关键：sink 会拒绝同队 / 不在同场 / 已死亡 / 物理读数缺失的伤害。
        // 唯一可观测的“已应用”证据是 HP 下降或死亡——不要无条件记录 context。
        if (appliedDamage <= 0 && !killed) {
            return;
        }
        const state = this.getUnitState(context.defenderId);
        if (state === null) {
            return;
        }
        this.buffered.push({
            attackerId: context.event.attackerId,
            defenderId: context.event.defenderId,
            defenderTeamId: context.defenderTeamId,
            attackerTeamId: context.attackerTeamId,
            damage: appliedDamage,
            defenderPart: context.event.defenderPart,
            weaponKind: context.event.weaponKind,
            armorKind: context.event.armorKind,
            x: state.x,
            y: state.y,
            level: context.defender.getAttribute(AttributeKind.Level),
            killed
        });
        if (this.buffered.length > MAX_BUFFERED_DAMAGE_EVENTS) {
            this.buffered.shift();
        }
    }

    drain(): readonly IRenderDamageEvent[] {
        const drained = this.buffered;
        this.buffered = [];
        return drained;
    }

    clear(): void {
        this.buffered = [];
    }
}
```

> **为什么用 HP 差而不是无条件记录：** `BattleDamageSink` 会静默拒绝同队、不同战斗、已死亡、物理读数缺失的伤害（`DamageSink.ts:48-82`）。如果 tap 无条件记录 `context`，友军接触也会闪白/飘数字。`healthBefore - healthAfter > 0 || killed` 是“sink 确实应用了”的唯一可观测证据，且不需要复制 sink 的 5 条过滤规则。`MAX_BUFFERED_DAMAGE_EVENTS` 是 `src/render/constants.ts` 的顶层 `const`（带 JSDoc），用于防止极端情况下的无界增长。
>
> **已知边界（可接受）：** 守方在同一次 `applyDamage` 内因防御经验升级而回血，可能让 `healthAfter ≥ healthBefore`，从而漏掉这一击的视觉反馈（伤害仍然生效）。概率极低，且只影响一次特效，不影响 HUD 血量。见 §Assumptions Log A7。

**关键时序：** `applyDamage` 在 `ControlSystem.routeDamage` 内被调用（`ControlSystem.ts:289-292`），死亡注销在其后（`:294-302`）。所以 tap 里 `getUnitState(defenderId)` 一定还能拿到**死亡前最后位置**。

### Pattern 3: 纯数学 + 薄 Pixi 适配（可测性）

**What:** 所有“算”的逻辑（镜头拟合、平滑、切换、HUD 计时/缩放、日历、血量比、裁剪）放进不导入 Pixi 的纯模块；Pixi 类只做“把结果写成 transform / 属性”。
**When to use:** 任何逻辑超过一行赋值的地方。
**Why:** Vitest 是 `environment: 'node'`，没有 DOM/WebGL；导入 `pixi.js` 会失败。纯模块可以在现有测试环境直接跑，覆盖 REND-03/REND-04 的核心行为。适配类通过 Chrome 手动 UAT 验证。

```ts
// tests/render/camera-math.test.ts —— 不导入 Pixi
import { computeBattleFit, worldToScreen } from '@/render/cameraMath';
```

### Pattern 4: 视图工厂 + 共享 `GraphicsContext`

**What:** `UnitViewFactory` 为每种武器/防具几何各建**一个** `GraphicsContext`（白色/钢色），所有同型号单位共享；本体用白色圆 context + 每个单位 `tint = factionColor`。
**When to use:** 所有单位视图。
**Why:** 官方性能提示：Graphics 在“几何不常改”时最快；小 Graphics 可批处理；`GraphicsContext` 正是为共享几何而设计。这样 100 个单位只有 ~9 份几何，而不是 ~400 份。
**Caveat:** 共享 context **绝不能被单个视图销毁**。`Graphics.destroy({ context: true })` 会销毁所有共享者；视图销毁只用 `{ children: true }`（默认 `context: false`）。

```ts
// 设计提案
const CONTEXTS = {
    body: new GraphicsContext().circle(0, 0, BODY_RADIUS).fill(0xffffff),
    weapons: {
        [WeaponKind.Longsword]: buildLongswordContext(),
        // ...6 种
    },
    armors: {
        [ArmorKind.Helmet]: buildHelmetContext(),
        [ArmorKind.Shield]: buildShieldContext()
    }
};
```

**本体闪白：** Pixi 的 `tint` 是**乘法**，不能把深色变白。所以本体用**白色底** + `tint = factionColor`；受击时把 `tint` 临时设为 `0xffffff`（即“去色变白”），再叠加一个白色圆环。不要试图用 tint 提亮。

### Pattern 5: 手动 `app.render()` + `setTimeout` 循环

**What:** `app.init({ autoStart: false })`；runner 每帧同步调用 `world.tick()` → `renderer.renderFrame()` → `setTimeout(next, delay)`。
**When to use:** 本阶段唯一循环。
**Why:** D-17/D-18。`autoStart: true`（默认）会让 Pixi 的 ticker 自己按 rAF 渲染，导致双渲染/节奏失控。`app.render()` 是同步的，返回后 canvas 已提交绘制。

```ts
// 设计提案
private schedule(): void {
    if (!this.running) {
        return;
    }
    this.timer = setTimeout(() => this.runOneFrame(), this.frameDelayMs);
}
```

**UI 不饿死：** 每帧结束都让出事件循环；按钮回调在帧之间执行。`setTimeout(0)` 会被钳到 ~4ms（MDN），即最高 ~250 帧/秒；默认建议 `frameDelayMs = 33`（约 30fps 可观看），面板可调到 0 追求吞吐。

### Pattern 6: 两态镜头状态机（Fit → Transition → Track）

**What:** `ICamera` 有两态：`BattleFocus`（`getBattleTarget() !== null`）和 `Strategic`（`null`）。每次 `update()` 先算目标 transform，再按状态平滑：
- 首次 / `reset()`：直接落到 strategic fit（这是初始化，不是“运动”）。
- 目标 id 不变：指数平滑跟踪。
- 目标 id 改变：进入固定 `switchFrames` 的缓动过渡（start 快照 → 活动 target），结束后回到跟踪。
**Why:** 禁止瞬移；同时保证目标 framing 在每一帧都满足 ≥90%。过渡期间 target 持续更新（单位在动），所以过渡是“从旧视角滑向新战斗的实时构图”。

### Pattern 7: 全景标记用屏幕空间

**What:** `strategicLayer` 是 `app.stage` 的直接子节点（不继承相机缩放），每个军队/城池标记的位置用 `worldToScreen(transform)` 算，尺寸/文字用固定像素。
**Why:** 全景 scale ≈ 1.08 px/m；世界尺寸的文字会只有几像素。屏幕空间标记恒定可读，且数量很少（默认 2 军 2 城）。地图底/地形仍在 `worldLayer` 世界空间（只画一次）。

### Anti-Patterns to Avoid

- **用 rAF/Ticker 作为主节拍**：D-17 明确禁止；会按真实时间跳帧，`IWorld.tick()` 与输出帧不再一一对应。
- **`autoStart` 保持默认 true**：Pixi 自己渲染 + 我们手动 `render()`，双倍工作且时序不可控。
- **在 Round 1 的 `types.ts` 里写实现/常量/类**：违反类型门禁；Round 1 只允许声明。
- **每帧 `graphics.clear()` 重画**：v8 Graphics 重建几何很贵；用 transform/tint/alpha。
- **每帧改 `Text.text`**：会重新栅格化；等级只在变化时改，伤害数字只在生成时改。
- **每单位 filter / mask**：项目明确 out of scope；血条填充用 `scale.x`，不用 mask。
- **用 `IWorld.getVisible*` 做视频取景**：那是**受限视野**（指挥官视角）；渲染是上帝视角，应读 `getFactions`/`getArmy`/`getCity`。
- **在渲染器里 `drainEvents()`**：`IBattleSystem.drainEvents()` 是破坏性读取，会偷走 Phase 6/7 的生命周期事件；Phase 5 只 `listActiveBattles()` 轮询。
- **按 id 集合差异判断死亡**：位置已被 `removeUnit` 清空；必须用伤害旁路在致命一击时抓。
- **把 Pixi 类型塞进 domain 契约**：只允许 `src/render/**` 引用 Pixi；`IUnit`/`IWorld`/`IControlSystem` 一个字都不改。
- **CSS 缩放后直接用 `event.clientX` 当世界坐标**：必须 `getBoundingClientRect` 换算到 1920×1080，再用 `screenToWorld` 反变换。

---

## Research Flags Resolved（逐条回答 CONTEXT 的 Research Flags）

| Flag | 结论 | 依据 |
|------|------|------|
| **REND-05 文档同步** | 以 **D-01** 为准：不追求实时帧率；验收 = Chrome 能跑、不崩、逐帧推进、`getCanvas()` 可取。REQUIREMENTS/ROADMAP 的“可交互帧率”在 transition 时再修订；本阶段计划与验证按 D-01 写。 | CONTEXT D-01；ROADMAP Phase 5 成功标准 5 与 D-01 冲突，已在计划中注明 |
| **伤害事件来源** | 组合根装饰 `IDamageSink`（`RenderDamageTap implements IDamageSink, IDamageFeed`），先调 `BattleDamageSink`，再比较 `Health` 前后（只有实际掉血/死亡才记录）；不改任何冻结契约。 | `ControlSystem.ts:289-292`；`DamageSink.ts:48-100`；`control/types.ts:265-268` |
| **死亡反馈** | 在 tap 内用 `wasAlive && !isAlive()` 判定击杀，并**当场**读 `getUnitState` 拿最后位置；渲染器另外做“视图存在但目录无此 id”的兜底销毁（无位置时直接销毁，不播放假特效）。 | `ControlSystem.ts:294-302` 的注销顺序 |
| **镜头 90% 拟合** | 成员口径 = `IBattle.getMemberUnitIds()` + `getUnitState` 非空；以**中位数**为中心、按切比雪夫距离取**第 90 百分位**半径构成正方形拟合盒（盒内 ≥`ceil(0.9n)` 点，严格 ≥90%）；盒按 viewport 留边拟合。**目标 transform** 永远满足 ≥90%；切换过渡期间当前 transform 平滑趋近（见 OQ-1 的解释待确认）。 | 本文件 §Camera Algorithms；`BattleSystem.ts:377-392` 保证成员存活 |
| **HUD 缩放过渡** | 血条几何按**世界尺寸**建（宽 1.4m、高 0.16m、偏移 -0.95m）；子节点 scale `s = lerp(1, (screenBarWidthPx / barWorldWidth) / cameraScale, t)`，`t = smoothstep(worldScaleAt, screenScaleAt, cameraScale)`。近景屏幕恒定、远景世界尺寸、中间连续。等级永远 `s=1`。 | D-08/D-09；`Container.scale` 语义 |
| **视图工厂与 Pixi 类型边界** | `IUnitView.getRoot(): Container`（`import type`）。换贴图只换 `IUnitViewFactory` 实现；`IRenderer`/`ICamera`/`IHud` 不感知。Domain 契约零 Pixi。 | D-03；v8 “Container 是所有显示对象的基类” |
| **PixiJS 接入** | `pixi.js@8.22.0` 精确钉版；WebGL renderer；`await app.init({ width:1920, height:1080, autoStart:false, antialias:true, resolution:1, autoDensity:false, preference:'webgl', preserveDrawingBuffer:true })`；Vite 已配置，新增 `dev` script + 根 `index.html`。 | §Verified 13；`ApplicationOptions` 表；`vite.config.ts` |
| **逐帧 setTimeout** | 接受 `setTimeout(..., 0)` 的 4ms 下限（~250fps 上限）；默认用 33ms 便于观看，面板可调到 0。暂停 = `clearTimeout` + `running=false`；单步 = 手动跑一帧。 | MDN setTimeout；D-17；D-12 |
| **时间格式** | 纯函数 `formatGameTime(gameMinutes, minutesPerTick)`：1 年 = 360 天、1 月 = 30 天、1 天 = 24h；分钟 0 → 第 1 年 1 月 1 日 00:00。不引入日期库。 | D-11；`TimeSystem.ts:20-23` |

---

## Recommended Contract Shape（Round 1 类型门禁提案）

> 下面是 **Round 1 的 `src/render/types.ts` 提案**。它是**声明集**：枚举 + 接口 + 类型别名 + 配置形状；**没有** class、函数、顶层 `const`、Pixi 运行时导入。所有接口成员/方法在真实文件里**必须写 JSDoc**（AGENTS §4），缺失值遵循“对象 `null` / 字面量 `undefined`”的约定（AGENTS §8），数字枚举（AGENTS §3），禁止 getter/setter（AGENTS §11）。Round 2 的导出函数/顶层 `const` 也按仓库惯例写 JSDoc（AGENTS §4/§6）。
>
> 唯一允许的 Pixi 引用是 `import type { Container } from 'pixi.js'`（Gate G-1）。

### 枚举

```ts
/**
 * 镜头的两种状态（D-14）。
 * 目标只由 `ICamera.setBattleTarget()` 驱动（`undefined` = 切向全景，有值 = 跟拍）；
 * `getMode()` 返回**当前渲染模式**：切向全景的过渡完成前仍是 `BattleFocus`，
 * 这样单位不会在镜头还在拉远时瞬间消失。不提供独立的 `setMode()`。
 */
export enum CameraMode {
    /** 全景：整张地图 + 军队/城池标记，不渲染单位（D-14.1）。 */
    Strategic = 0,
    /** 战斗特写：拟合目标战斗的参战单位（D-14.2）。 */
    BattleFocus = 1
}
```

> **为什么只有一个枚举：** 渲染层没有别的“状态机”需要数字枚举。`WeaponKind` / `ArmorKind` / `ClassKind` / `AttributeKind` / `ColliderPart` 全部复用上游已冻结的枚举（数字枚举，运行时值稳定），不重复声明。

### 视口 / 镜头

```ts
/** 画布的逻辑视口（像素；固定 16:9）。 */
export interface IViewport {
    /** 视口宽度（像素）。 */
    readonly width: number;
    /** 视口高度（像素）。 */
    readonly height: number;
}

/** 屏幕坐标（像素；左上角原点，y 向下）。 */
export interface IScreenPoint {
    /** 屏幕 x（像素）。 */
    readonly x: number;
    /** 屏幕 y（像素）。 */
    readonly y: number;
}

/** 拟合盒（内部形状；世界米）。由 `cameraMath.fitBox()` 产出。 */
export interface IFitBox {
    /** 最小 x（米）。 */
    readonly minX: number;
    /** 最大 x（米）。 */
    readonly maxX: number;
    /** 最小 y（米）。 */
    readonly minY: number;
    /** 最大 y（米）。 */
    readonly maxY: number;
}

/**
 * 相机写入世界层的最终变换。
 * 世界坐标 → 屏幕坐标：`screen = centerOfViewport + (world - center) * scale + shake`。
 */
export interface ICameraTransform {
    /** 镜头中心的世界 x 坐标（米）。 */
    readonly centerX: number;
    /** 镜头中心的世界 y 坐标（米）。 */
    readonly centerY: number;
    /** 缩放：每米多少像素（像素/米）。 */
    readonly scale: number;
    /** 镜头震动的屏幕 x 偏移（像素；不参与拾取反变换）。 */
    readonly shakeX: number;
    /** 镜头震动的屏幕 y 偏移（像素；不参与拾取反变换）。 */
    readonly shakeY: number;
}

/** 每次 `ICamera.update()` 的输入。点集为空表示全景拟合。 */
export interface ICameraUpdateInput {
    /** 当前视口。 */
    readonly viewport: IViewport;
    /** 地图尺寸（全景拟合与最小缩放用）。 */
    readonly bounds: IMapBounds;
    /** 目标战斗的存活成员世界坐标；空数组表示无战斗目标。 */
    readonly points: readonly IVec2[];
}

/**
 * 自动镜头（D-14/D-15）。纯状态机：不导入 Pixi，所有几何计算在 `cameraMath.ts`。
 * 目标 transform 永远满足 ≥90% 拟合；当前 transform 用平滑/缓动趋近它（禁止瞬移）。
 */
export interface ICamera {
    /** 指定跟拍目标；`null` 切到全景。只改变目标，不改变当前 transform（不瞬移）。 */
    setBattleTarget(battleId: number | undefined): void;
    /** 当前跟拍目标；`undefined` 表示全景（目标，不等于当前渲染模式）。 */
    getBattleTarget(): number | undefined;
    /** 当前**渲染**模式：切向全景的过渡完成前仍为 `BattleFocus`。 */
    getMode(): CameraMode;
    /** 推进一帧的镜头状态并返回本帧 transform；每个输出帧恰好调用一次。 */
    update(input: ICameraUpdateInput): ICameraTransform;
    /** 最近一次 `update()` 的结果（首帧/重置前后也应有确定值）。 */
    getTransform(): ICameraTransform;
    /** 重置为全景初始构图，清空目标、过渡与震动。 */
    reset(bounds: IMapBounds, viewport: IViewport): ICameraTransform;
}
```

### 单位视图（D-03/D-04）

```ts
/**
 * 创建一个单位视图所需的**不可变**视觉信息。
 * 在单位首次出现时采集一次；装备/等级的变化不重建（物理规格同样在注册时冻结，WR-01）。
 */
export interface IUnitViewSpec {
    /** 单位 id。 */
    readonly unitId: number;
    /** 阵营色（0xRRGGBB；由 factionId 解析）。 */
    readonly factionColor: number;
    /** 职业（当前只用于图例/调试，不单独设计视觉，D-04）。 */
    readonly classKind: ClassKind;
    /** 第一件武器；无武器时为 `undefined`（缺失字面量，AGENTS §8）。 */
    readonly weapon: WeaponKind | undefined;
    /** 全部防具（顺序稳定；无防具为空数组）。 */
    readonly armors: readonly ArmorKind[];
}

/** 每个输出帧写入单位视图的少量状态。 */
export interface IUnitViewState {
    /** 世界 x（米）。 */
    readonly x: number;
    /** 世界 y（米）。 */
    readonly y: number;
    /** 朝向（弧度；直接作为旋转子节点的 rotation）。 */
    readonly angle: number;
    /** 本帧是否闪白。 */
    readonly flash: boolean;
    /** 是否在视口内（裁剪；false 时整棵子树不可见）。 */
    readonly visible: boolean;
}

/**
 * 一个单位的视觉（本体/武器/防具）。实现必须把根做成 `Container`（v8 叶节点不能有子节点），
 * 本体旋转放在子节点里，这样等级/血条等不旋转元素可以作为兄弟节点。
 */
export interface IUnitView {
    /** 场景图根；由渲染器加入 `unitLayer`。 */
    getRoot(): Container;
    /** 应用本帧状态（只改变换/tint/可见性，不重建几何）。 */
    apply(state: IUnitViewState): void;
    /** 销毁视图；共享的 `GraphicsContext` 绝不能被销毁。 */
    destroy(): void;
}

/** 可替换的视觉工厂（D-03）：默认 `GeometryUnitView`，未来可换 `SpriteUnitView`。 */
export interface IUnitViewFactory {
    /** 为一个单位创建视图。 */
    create(spec: IUnitViewSpec): IUnitView;
    /** 释放工厂持有的共享资源（共享 GraphicsContext / 贴图）。 */
    dispose(): void;
}
```

### HUD（D-07/D-08/D-09/D-10/D-11）

```ts
/** 一个单位在本帧的 HUD 输入（由纯 `hudModel` 计算显隐与缩放）。 */
export interface IHudUnitState {    /** 单位 id。 */
    readonly unitId: number;
    /** 世界 x（米）。 */
    readonly x: number;
    /** 世界 y（米）。 */
    readonly y: number;
    /** 阵营色。 */
    readonly factionColor: number;
    /** 血量比，已钳制到 [0, 1]。 */
    readonly healthRatio: number;
    /** 等级（常亮数字）。 */
    readonly level: number;
    /** 本帧是否显示血条（受击 15 × outputFps 帧 / 总数 < 6 常亮）。 */
    readonly healthVisible: boolean;
    /** 血条节点的混合缩放（1 = 世界尺寸；见 §HUD Algorithms）。 */
    readonly hudScale: number;
}

/** HUD 的每单位计时状态（内部形状；`hudModel` 读写；切全景/重置时清空）。 */
export interface IHudTimers {
    /** unitId → 血条可见到的输出帧（不含）。 */
    readonly visibleUntil: Map<number, number>;
}

/** `IHud.update()` 的一帧输入。 */
export interface IHudFrame {
    /** 输出帧序号（从 0 开始，只随 `renderFrame()` 递增）。 */
    readonly frameIndex: number;
    /** 当前视口。 */
    readonly viewport: IViewport;
    /** 本帧镜头变换。 */
    readonly camera: ICameraTransform;
    /** 本帧的单位 HUD 数据。 */
    readonly units: readonly IHudUnitState[];
    /** 场上存活单位总数（用于“少于 6 个时血条常亮”，不是本帧可见数）。 */
    readonly totalUnits: number;
    /** 本帧从伤害旁路取走的伤害/死亡事件。 */
    readonly damage: readonly IRenderDamageEvent[];
    /** 当前累计游戏分钟。 */
    readonly gameMinutes: number;
    /** 当前每外层 tick 的游戏分钟数（1 或 24；用于“×”显示）。 */
    readonly minutesPerTick: number;
}

/**
 * 单位级 HUD + 视频信息条 + 伤害数字/粒子/死亡特效（全部池化）。
 * 只画；显隐/阈值的**判定**在纯 `hudModel` 中完成，便于单测。
 */
export interface IHud {
    /** 绘制一帧。 */
    update(frame: IHudFrame): void;
    /** 清空所有池与计时（换世界/重置时调用）。 */
    reset(): void;
    /** 释放池与共享资源。 */
    dispose(): void;
}
```

### 伤害/死亡旁路（D-06/D-07/D-10；Research Flag）

```ts
/**
 * 一条已应用的伤害（渲染用快照）。位置是**守方在致命/受击瞬间**的世界坐标：
 * `ControlSystem` 在伤害路由之后才注销死亡单位，故此处仍可读到刚体。
 */
export interface IRenderDamageEvent {
    /** 攻方单位 id。 */
    readonly attackerId: number;
    /** 守方单位 id。 */
    readonly defenderId: number;
    /** 攻方阵营 id（已由控制层解析）。 */
    readonly attackerTeamId: number;
    /** 守方阵营 id（已由控制层解析）。 */
    readonly defenderTeamId: number;
    /** 实际造成的 HP 损失（overkill 截断；用于伤害数字与阈值）。 */
    readonly damage: number;
    /** 守方被击中的部位。 */
    readonly defenderPart: ColliderPart;
    /** 攻方武器种类；缺失时为 `undefined`。 */
    readonly weaponKind: WeaponKind | undefined;
    /** 守方被击中防具种类；击中本体时为 `undefined`。 */
    readonly armorKind: ArmorKind | undefined;
    /** 守方受击瞬间的世界 x（米）。 */
    readonly x: number;
    /** 守方受击瞬间的世界 y（米）。 */
    readonly y: number;
    /** 守方等级（死亡特效/伤害数字用）。 */
    readonly level: number;
    /** 这一击是否使守方从存活变为死亡。 */
    readonly killed: boolean;
}

/** 渲染层消费的伤害缓冲；每个输出帧 drain 一次。 */
export interface IDamageFeed {
    /** 取走自上次 drain 以来的全部事件（返回新数组并清空内部缓冲）。 */
    drain(): readonly IRenderDamageEvent[];
    /** 丢弃未消费事件（重置/切全景时调用）。 */
    clear(): void;
}

/** 由组合根注入的“读单位当前物理状态”函数；窄依赖便于 fake。 */
export type UnitStateLookup = (unitId: number) => IUnitState | null;
```

> `RenderDamageTap` **同时** `implements IDamageSink, IDamageFeed`：`applyDamage` 来自 `IDamageSink`，`drain`/`clear` 来自 `IDamageFeed`。AGENTS §5 满足（每个公共方法都在某个被实现的接口里）。

### 服务提供器 / 渲染器

```ts
/**
 * 渲染层的全部只读依赖（组合根一次性交给渲染层；`IWorld` 本身不暴露控制/物理）。
 * 用 provider 而不是直接字段，是为了 demo 的 `reset()` 能整体换一套世界而不重建 Pixi。
 */
export interface IRenderServices {
    /** 世界读取面。 */
    readonly world: IWorld;
    /** 单位目录 / 阵营。 */
    readonly catalog: IUnitCatalog;
    /** 运动读数。 */
    readonly physics: IPhysicsWorld;
    /** 伤害/死亡缓冲。 */
    readonly damageFeed: IDamageFeed;
}

/** 返回当前一套服务；每次 `renderFrame()` 调用一次，允许在 reset 后变化。 */
export type RenderServicesProvider = () => IRenderServices;

/**
 * 渲染器（D-18）：**不拥有循环**，只画一帧并暴露 canvas。
 * 构造通过顶层 `createRenderer(provider, config): Promise<IRenderer>`（异步 `app.init`），
 * 因为 class 的公共静态工厂不在接口里，AGENTS §5 更偏好模块级函数。
 */
export interface IRenderer {
    /** 绘制恰好一帧：读服务 → 更新镜头 → 调和视图 → 更新 HUD → `app.render()`。 */
    renderFrame(): void;
    /** 暴露 1920×1080 的 canvas 给 Phase 6（`app.canvas` 类型即 `HTMLCanvasElement`）。 */
    getCanvas(): HTMLCanvasElement;
    /** 镜头（Phase 6/面板用 `setBattleTarget` 驱动）。 */
    getCamera(): ICamera;
    /** 清空视图/HUD/特效/帧计数，重建静态地图层，镜头重置到全景；不销毁 Pixi Application。 */
    reset(): void;
    /** 销毁 Pixi Application、工厂共享资源与所有池（demo 结束/热重载）。 */
    dispose(): void;
}
```

### 配置（D-20 唯一调参入口）

```ts
/** 调色板（暗底高饱和，D-05）。颜色一律 0xRRGGBB。 */
export interface IRenderPalette {
    /** 画布清屏色（地图外）。 */
    readonly background: number;
    /** 地图底。 */
    readonly mapFloor: number;
    /** 100m 网格线。 */
    readonly grid: number;
    /** 地形矩形（低饱和）。 */
    readonly terrain: number;
    /** 通用文字。 */
    readonly text: number;
    /** 血条底。 */
    readonly healthBackground: number;
    /** 血条描边。 */
    readonly healthBorder: number;
    /** 武器钢色。 */
    readonly weapon: number;
    /** 防具钢色。 */
    readonly armor: number;
    /** 闪白。 */
    readonly flash: number;
    /** 无主城池的中性色。 */
    readonly neutral: number;
}

/** 镜头可调参数。 */
export interface ICameraConfig {
    /** 拟合边距（像素；同时给 HUD 头顶元素留空间）。 */
    readonly paddingPx: number;
    /** 拟合覆盖率（0.9 = 至少 90% 的点在盒内；按第 90 百分位距离取半径）。 */
    readonly coverage: number;
    /** 最小拟合跨度（米；单单位战斗不无限放大）。 */
    readonly minSpanMeters: number;
    /** 最小缩放（像素/米；由 `Camera.reset()` 用全景拟合值覆盖，不要手填大于全景拟合的值）。 */
    readonly minScale: number;
    /** 最大缩放（像素/米）。 */
    readonly maxScale: number;
    /** 跟踪平滑的时间常数（输出帧数）。 */
    readonly smoothingFrames: number;
    /** 切换目标的固定过渡帧数。 */
    readonly switchFrames: number;
    /** 震动最大幅度（像素）。 */
    readonly shakeAmplitudePx: number;
    /** 震动每帧衰减系数（0–1）。 */
    readonly shakeDecayPerFrame: number;
}

/** HUD 可调参数。 */
export interface IHudConfig {
    /** 受击后血条显示的秒数（15；实际帧数 = 该值 × outputFps）。 */
    readonly healthBarSeconds: number;
    /** 场上单位数低于该值时血条常亮（6）。 */
    readonly alwaysVisibleBelowUnits: number;
    /** 血条世界宽度（米）。 */
    readonly barWorldWidth: number;
    /** 血条世界高度（米）。 */
    readonly barWorldHeight: number;
    /** 血条相对单位的 y 偏移（米，负值 = 屏幕上方）。 */
    readonly barOffsetY: number;
    /** 近景血条的屏幕宽度（像素）。 */
    readonly screenBarWidthPx: number;
    /** 缩放 ≥ 该值（像素/米）时血条完全屏幕恒定。 */
    readonly screenScaleAt: number;
    /** 缩放 ≤ 该值（像素/米）时血条完全世界尺寸。 */
    readonly worldScaleAt: number;
    /** 等级文字的世界高度（米）。 */
    readonly levelWorldHeight: number;
    /** 信息条边距（像素）。 */
    readonly infoMarginPx: number;
    /** 信息条字号（像素）。 */
    readonly infoFontSizePx: number;
}

/** 特效可调参数。 */
export interface IEffectsConfig {
    /** 伤害数字阈值（初始 50，D-10）。 */
    readonly damageNumberThreshold: number;
    /** 伤害数字世界高度（米）。 */
    readonly damageNumberWorldHeight: number;
    /** 伤害数字寿命（输出帧）。 */
    readonly damageNumberLifetimeFrames: number;
    /** 伤害数字每帧上飘（米）。 */
    readonly damageNumberRiseMetersPerFrame: number;
    /** 同屏伤害数字上限。 */
    readonly maxDamageNumbers: number;
    /** 同屏粒子上限。 */
    readonly maxParticles: number;
    /** 每次命中的火花数。 */
    readonly particlesPerHit: number;
    /** 粒子寿命（输出帧）。 */
    readonly particleLifetimeFrames: number;
    /** 同屏死亡特效上限。 */
    readonly maxDeathEffects: number;
    /** 死亡特效寿命（输出帧）。 */
    readonly deathEffectLifetimeFrames: number;
    /** 受击闪白帧数。 */
    readonly flashFrames: number;
    /** 触发镜头震动的伤害阈值。 */
    readonly shakeDamageThreshold: number;
}

/** 渲染层全部可调项（D-20）。 */
export interface IRenderConfig {
    /** 画布宽（像素；默认 1920）。 */
    readonly width: number;
    /** 画布高（像素；默认 1080）。 */
    readonly height: number;
    /** 输出帧率（只用于 HUD 15s 换算与 Phase 6 编码；不驱动循环）。 */
    readonly outputFps: number;
    /** factionId → 颜色；未配置的 id 走 fallback 调色板。 */
    readonly factionColors: Readonly<Record<number, number>>;
    /** 调色板。 */
    readonly palette: IRenderPalette;
    /** 镜头参数。 */
    readonly camera: ICameraConfig;
    /** HUD 参数。 */
    readonly hud: IHudConfig;
    /** 特效参数。 */
    readonly effects: IEffectsConfig;
}
```

### 门禁需要用户明确批准的 6 个决策

| Gate | 决策 | 备选 | 推荐理由 |
|------|------|------|----------|
| **G-1** | `IUnitView.getRoot(): Container`（`import type { Container } from 'pixi.js'`） | 不透明句柄 + 自建 `IViewNode` 抽象 | v8 只有 `Container` 能挂子节点；不透明句柄要额外一层抽象，属过度设计。Domain 契约仍零 Pixi。 |
| **G-2** | `IRenderServices` + `RenderServicesProvider`（provider 函数） | 构造函数直接注入 4 个字段 | demo 的 `reset()` 需要换一整套 world/control/physics/feed；provider 让 `IRenderer` 重建成本为零，且 Phase 6 可复用。 |
| **G-3** | `RenderDamageTap implements IDamageSink, IDamageFeed`（组合） | 子类化 `BattleDamageSink` / 在 runner 里记录 | 组合只依赖 `IDamageSink`；runner 拿不到伤害事件（只到 sink）。 |
| **G-4** | `CameraMode` 由 `setBattleTarget` 驱动，`getMode()` 返回**当前渲染模式**（回全景过渡完成前仍为 `BattleFocus`）；**无** `setMode()` | 独立 `setMode()` + `setBattleTarget()` | 避免两套真相；面板的“镜头模式切换”只是把 target 设为 `null` 或重新获取活跃战斗；单位在拉远过渡结束前不消失 |
| **G-5** | `IUnitViewFactory.dispose()` 管理共享 `GraphicsContext` | 每个视图自建几何 | 6 武器 + 2 防具 + 本体 = 9 份共享几何；不共享会让 100 单位产生数百份重复几何。 |
| **G-6** | 视图 spec 在单位首次出现时快照，之后**不随升级换装更新** | 每帧比对装备并重建视图 | 物理规格在注册时已冻结（WR-01）；视觉若显示新防具但物理没有对应碰撞体会更误导。HUD 等级仍实时读。 |

### Round 1 测试（`tests/render/types.test.ts`）

- 枚举钉版：`CameraMode.Strategic === 0`、`CameraMode.BattleFocus === 1`。
- 编译期契约（`expectTypeOf`）：
  - `IRenderer['renderFrame']` = `() => void`
  - `IRenderer['getCanvas']` 返回 `HTMLCanvasElement`
  - `IRenderer['getCamera']` 返回 `ICamera`
  - `ICamera['setBattleTarget']` 接受 `number | undefined`
  - `ICamera['update']` 接受 `ICameraUpdateInput`
  - `IUnitView['getRoot']` 返回 `Container`
  - `IDamageFeed['drain']` 返回 `readonly IRenderDamageEvent[]`
  - `IRenderDamageEvent['weaponKind']` 含 `undefined`
  - `IRenderConfig['factionColors']` 可索引为 `number`
- `import type` 检查：测试文件只从 `@/render/types` 取枚举/类型；运行时不会加载 Pixi（`types.ts` 的 `Container` 是 type-only）。

---

## Camera Algorithms（具体公式，`src/render/cameraMath.ts`）

> 全部为纯函数，输入 `readonly IVec2[]` / `IViewport` / `IMapBounds` / `ICameraConfig`，输出 `ICameraTransform` 或中间盒。测试见 §Validation Architecture。

### 1. 拟合盒：中位数 + 第 90 百分位切比雪夫半径（严格 ≥90%）

**不采用“x/y 各取 5%–95% 百分位”的双轴包围盒。** 两端各 trim 5% 意味着一维各排除约 10%，x 与 y 的并集上界是 20%——盒内只能保证 ≥80%，不足以声称 ≥90%。

**采用以中位数为中心、按切比雪夫距离取第 90 百分位半径的正方形盒：**

```ts
// 设计提案
export interface IFitBox {
    readonly minX: number;
    readonly maxX: number;
    readonly minY: number;
    readonly maxY: number;
}

/** 升序数组的中位数（偶数取中间两数的平均）。 */
function median(sorted: readonly number[]): number {
    const n = sorted.length;
    if (n === 0) {
        return 0;
    }
    const mid = Math.floor(n / 2);
    return n % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/**
 * 拟合盒：中位数中心 + 第 `coverage` 百分位切比雪夫半径。
 * 数学保证：至少 `ceil(coverage * n)` 个点落在盒内。
 */
export function fitBox(
    points: readonly IVec2[],
    coverage: number,
    minSpanMeters: number
): IFitBox | null {
    const n = points.length;
    if (n === 0) {
        return null;
    }
    const cx = median(points.map(p => p.x).sort((a, b) => a - b));
    const cy = median(points.map(p => p.y).sort((a, b) => a - b));
    const distances = points
        .map(p => Math.max(Math.abs(p.x - cx), Math.abs(p.y - cy)))
        .sort((a, b) => a - b);
    const rank = Math.max(0, Math.min(n - 1, Math.ceil(coverage * n) - 1));
    const halfSpan = Math.max(distances[rank], minSpanMeters / 2);
    return {
        minX: cx - halfSpan,
        maxX: cx + halfSpan,
        minY: cy - halfSpan,
        maxY: cy + halfSpan
    };
}
```

**证明：** 距离数组升序，索引 `0..rank` 共 `rank + 1 = ceil(coverage·n)` 个点的切比雪夫距离 ≤ `distances[rank] = halfSpan`。对其中任一点，`|x - cx| ≤ d ≤ halfSpan` 且 `|y - cy| ≤ d ≤ halfSpan`，故落在正方形盒内。因此盒内点数 ≥ `ceil(0.9n)`，比例 ≥ `ceil(0.9n)/n ≥ 0.9`。∎

**边界：**
- `n = 1`：`rank = 0`、`distances[0] = 0` → `halfSpan = minSpanMeters/2`；画面至少显示 `minSpanMeters` 见方。
- `n = 2`：`rank = ceil(1.8)-1 = 1` → 半径 = 两点切比雪夫距离的较大者（两点都在盒内）。
- `n = 16`：`rank = ceil(14.4)-1 = 14` → 15/16 点在盒内（93.75%）。
- `n = 100`：`rank = 89` → 90/100 点在盒内。
- 离群点只可能落在最后 10%；这正是“至少 90%”的语义。

**中心选择：**
- 用**中位数**而不是 `IBattle.getCenter()`。后者是等级加权质心（D-18），可能被高等级单位拉偏；若用它作中心再取半径，半径可能变大或盒偏移，仍能保证覆盖（距离是按中心算的），但构图会偏。中位数对离群点稳健。
- 只有 `points` 为空（战斗刚触发、成员尚未加入）时，渲染器用 `[battle.getCenter()]` 代入 → 盒为 `minSpanMeters` 见方，避免除零。
- 正方形盒在 16:9 视口上按高度拟合（`usableH < usableW`），横向留出的空间用于构图与 HUD，不会被裁掉。

### 2. 拟合 transform

```ts
// 设计提案
export function fitTransform(
    box: IFitBox,
    viewport: IViewport,
    config: ICameraConfig
): { centerX: number; centerY: number; scale: number } {
    const usableW = Math.max(1, viewport.width - 2 * config.paddingPx);
    const usableH = Math.max(1, viewport.height - 2 * config.paddingPx);
    const spanX = Math.max(box.maxX - box.minX, config.minSpanMeters);
    const spanY = Math.max(box.maxY - box.minY, config.minSpanMeters);
    const fit = Math.min(usableW / spanX, usableH / spanY);
    const scale = Math.max(config.minScale, Math.min(config.maxScale, fit));
    return {
        centerX: (box.minX + box.maxX) / 2,
        centerY: (box.minY + box.maxY) / 2,
        scale
    };
}
```

- `minScale` 设为全景拟合值（`strategicTransform` 的 scale），因此对地图内任意点集 `fit ≥ minScale`，`max(..., minScale)` 不会缩小画面、破坏 90%。
- `min(fit, maxScale)` 是安全的：把 scale 调小只会让盒在屏幕上更小，仍然完整可见。
- `paddingPx` 同时给 HUD 头顶元素留空间（血条在单位上方约 0.95m）。
- `spanX/spanY` 对正方形盒相等；保留双轴公式以便未来改成非正方形构图。

### 3. 平滑跟踪（指数、帧率无关）

```ts
// 设计提案
const alpha = 1 - Math.exp(-1 / Math.max(1, config.smoothingFrames));
next.centerX = lerp(current.centerX, target.centerX, alpha);
next.centerY = lerp(current.centerY, target.centerY, alpha);
next.scale = Math.exp(lerp(Math.log(current.scale), Math.log(target.scale), alpha));
```

- `smoothingFrames` 是“时间常数（帧）”：8 帧约完成 63%，24 帧约 95%。
- 在对数空间插值 scale：每帧缩放比例相同，视觉上匀速；线性插值会在近距离时显得先快后慢。
- `alpha < 1` 保证永远不瞬移；`alpha = 1` 只在 `reset()`/首帧使用。

### 4. 目标切换（定时缓动，禁止瞬移）

```ts
// 设计提案
function easeInOutCubic(t: number): number {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}
```

状态机：

| 状态 | 触发 | 每帧行为 |
|------|------|----------|
| `Track` | 目标 id 未变 | 指数平滑趋近实时 fit |
| `Transition` | `setBattleTarget` 改变（含 `null` ↔ id） | `start` = 当前 transform；`remaining = switchFrames`；每帧 `t = 1 - remaining/switchFrames`，`e = easeInOutCubic(t)`，从 `start` 到**本帧实时 fit** 插值；`remaining--`，到 0 转 `Track` |
| `Reset` | `reset()` | 直接写 strategic fit（初始化允许） |

- 过渡中目标再次改变：`start = 当前 transform`、`remaining = switchFrames` 重启（仍不瞬移）。
- 单帧最大位移 ≈ `1.5 / switchFrames` × 距离（cubic ease 的最大导数 1.5）；`switchFrames = 90` 时约 1.7%/帧。
- 过渡期间 `scale` 仍在对数空间插值。
- `getMode()` 在 `BattleFocus → Strategic` 的过渡完成前保持 `BattleFocus`，完成后才变 `Strategic`；`Strategic → BattleFocus` 在目标设置时立即变 `BattleFocus`（单位在拉近过程中出现）。

### 5. 全景 transform

```ts
// 设计提案
export function strategicTransform(
    bounds: IMapBounds,
    viewport: IViewport,
    config: ICameraConfig
): { centerX: number; centerY: number; scale: number } {
    const usableW = Math.max(1, viewport.width - 2 * config.paddingPx);
    const usableH = Math.max(1, viewport.height - 2 * config.paddingPx);
    const scale = Math.min(usableW / bounds.width, usableH / bounds.height);
    return { centerX: bounds.width / 2, centerY: bounds.height / 2, scale };
}
```

- 1000×1000 地图、1920×1080、padding 48 → `usableH = 984`、`scale = 0.984`；地图在屏幕上约 984×984，左右留黑边。可接受（地图是正方形，视口 16:9）。
- 若希望填满横向，可把 `scale = usableW / bounds.width`（1.824），但会裁掉上下——违反“显示整张地图”。所以必须取 min。

### 6. 世界 ↔ 屏幕（不翻转 y）

```ts
// 设计提案
export function worldToScreen(
    x: number,
    y: number,
    transform: ICameraTransform,
    viewport: IViewport
): IScreenPoint {
    return {
        x: viewport.width / 2 + (x - transform.centerX) * transform.scale + transform.shakeX,
        y: viewport.height / 2 + (y - transform.centerY) * transform.scale + transform.shakeY
    };
}

export function screenToWorld(
    x: number,
    y: number,
    transform: ICameraTransform,
    viewport: IViewport
): IVec2 {
    return {
        x: transform.centerX + (x - viewport.width / 2 - transform.shakeX) / transform.scale,
        y: transform.centerY + (y - viewport.height / 2 - transform.shakeY) / transform.scale
    };
}
```

**不翻转 y（`screenY` 随 `worldY` 增大而增大）：**
- Rapier 的 `angle` 是数学正方向（y 向上、逆时针）。屏幕 y 向下时，Rapier 的 +θ 在屏幕上表现为顺时针。Pixi 的 `rotation = θ` 也是“屏幕坐标下顺时针”，所以 `container.rotation = state.angle` 正好复现物理朝向；单位速度 `(vx, vy)` 与屏幕位移方向一致。无需取负。
- 如果改成 `screenY = H - worldY`，所有角度（本体、武器、军队箭头）都必须取负，坐标转换也多一处 `H -`。**不要混用**。本项目选择不翻转。
- 拾取时若不想让震动影响点击，传入 `{...transform, shakeX: 0, shakeY: 0}`。

### 7. 视口裁剪

```ts
// 设计提案
const halfW = viewport.width / (2 * transform.scale);
const halfH = viewport.height / (2 * transform.scale);
const margin = 3; // 米：盖住本体 + 头顶血条
const visible =
    Math.abs(x - transform.centerX) <= halfW + margin &&
    Math.abs(y - transform.centerY) <= halfH + margin;
```

- 只在 BattleFocus 下使用；Strategic 不创建单位视图。
- 不做地图分区网格：地图只有 4 块地形 + 1 个底矩形，静态层只画一次；分区没有收益（D-01 的“如地图分区渲染/视口裁剪”由**视口裁剪 + 静态层**满足）。

### 8. 边界情况（必须写进测试）

| 情况 | 行为 | 备注 |
|------|------|------|
| 目标战斗有 0 个成员（刚触发 / 全部死亡 / 已结束） | 渲染器用 `[battle.getCenter()]` 代入 → 盒为 `minSpanMeters` 见方；若目标 id 已不在活跃/完成列表 → 按 `null` 处理（全景） | 避免除零与镜头跳到 (0,0) |
| 目标 id 不在任何列表 | 视为 `null`（Strategic）；只在调试日志里提示一次 | 不抛错，不影响渲染 |
| 参战单位逐个离区 | 成员列表缩小 → 拟合盒变化 → 指数平滑跟随；不瞬移 | D-14 的“离区”语义 |
| 多场战斗并发 | 由调用方 `setBattleTarget` 指定；demo 保持当前目标直到它结束，再取 `listActiveBattles()[0]`（OQ-6） | 不做“最激烈”评分（D-15） |
| 战斗结束 | 目标 id 从活跃列表消失 → demo 调 `setBattleTarget(null)`；镜头缓动回全景 | 不 drain `Ended` 事件 |
| 地图边缘的战斗 | 不 clamp 镜头中心（允许画面出现地图外的黑底），否则 90% 拟合会被破坏 | 黑底由 `backgroundColor` 提供 |
| 单个单位 | `halfSpan = minSpanMeters/2`，`maxScale` 封顶 | 避免无限放大 |
| 所有单位死亡（场上 0 单位） | `points` 为空 → 全景；HUD 清空 | `totalUnits = 0` 时 `<6` 常亮规则无对象 |

> **不 clamp 镜头中心**是一个有意选择：D-14 要求 90% 参战单位在画面内；若为了“不看到地图外”而 clamp，边缘战斗会被迫把单位推出画面。地图外的黑底是暗底视觉的一部分。

---

## HUD Algorithms（`src/render/hudModel.ts`）

### 1. 血量比

```ts
// 设计提案
export function healthRatio(health: number, maxHealth: number): number {
    if (!Number.isFinite(health) || !Number.isFinite(maxHealth) || maxHealth <= 0) {
        return 0;
    }
    return Math.max(0, Math.min(1, health / maxHealth));
}
```

- `Health` / `MaxHealth` 直接来自 `IUnit.getAttribute(AttributeKind.Health/MaxHealth)`；后者随等级/修正器实时计算（Phase 1 决策），所以升级后血量比自动正确。

### 2. 血条显隐（D-07）

```ts
// 设计提案
export interface IHudTimers {
    /** unitId → 血条可见到的输出帧（不含）。 */
    readonly visibleUntil: Map<number, number>;
}

export function registerDamage(
    timers: IHudTimers,
    events: readonly IRenderDamageEvent[],
    frameIndex: number,
    outputFps: number,
    seconds: number
): void {
    const frames = Math.max(1, Math.round(outputFps * seconds));
    for (const event of events) {
        if (event.killed) {
            timers.visibleUntil.delete(event.defenderId);
            continue;
        }
        timers.visibleUntil.set(event.defenderId, frameIndex + frames);
    }
}

export function isHealthVisible(
    unitId: number,
    timers: IHudTimers,
    frameIndex: number,
    totalUnits: number,
    alwaysVisibleBelowUnits: number
): boolean {
    if (totalUnits < alwaysVisibleBelowUnits) {
        return true;
    }
    const until = timers.visibleUntil.get(unitId);
    return until !== undefined && frameIndex < until;
}
```

- `15 × outputFps`：outputFps=30 → 450 帧；outputFps=15 → 225 帧。
- 每次受击**重置**到 `frame + N`（不是累加）。
- 死亡立即移除计时（视图也要销毁）。
- 每帧清理不在 `catalog.listUnitIds()` 中的计时条目，避免 Map 泄漏。
- 切到 Strategic 时清空 `timers.visibleUntil`，并清空伤害数字/粒子/死亡池（`hud.reset()`）；信息条继续更新。

### 3. 混合缩放（D-09）

设 `s = camera.scale`（像素/米），`Wm = barWorldWidth`（米），`Wpx = screenBarWidthPx`（像素）。

```
t = smoothstep(worldScaleAt, screenScaleAt, s)          // 0..1
nodeScale = lerp(1, (Wpx / Wm) / s, t)
```

- **t=0（远景）**：`nodeScale=1` → 屏幕宽度 = `Wm * s`（世界尺寸）。
- **t=1（近景）**：`nodeScale=(Wpx/Wm)/s` → 屏幕宽度 = `Wm * s * (Wpx/Wm)/s = Wpx`（屏幕恒定）。
- 中间连续；`smoothstep` 让过渡两端导数为 0（不突兀）。
- 血条的**位置偏移**放在父节点（`position.y = barOffsetY`，世界米），不放在被缩放的子节点里，因此头顶距离始终是 `0.95m * s`，缩放只影响血条自身大小。
- 等级文字不参与这个 scale（`nodeScale = 1`），永远世界尺寸（D-08）。
- 若 `screenScaleAt <= worldScaleAt`，配置非法；`validateRenderConfig` 拒绝。

### 4. 血条绘制（无 mask）

```
barRoot (position = unit x,y; child box position.y = barOffsetY)
  box (scale = nodeScale)
    bg      rect(-Wm/2, -Hm/2, Wm, Hm) fill healthBackground + stroke healthBorder
    fill    rect(0, -Hm/2, Wm, Hm) fill factionColor; position.x = -Wm/2; scale.x = healthRatio
    level?  不在这里（等级是独立 sibling，世界尺寸）
levelText (position = unit x,y; anchor 0.5; scale = levelWorldHeight / text.height)
```

- `fill.scale.x = ratio` 从左侧收缩，避免每帧重建几何。
- `ratio = 0` 时 `scale.x = 0`；Pixi 对 0 scale 安全（不渲染）。也可 `visible = ratio > 0`。
- 没有 mask：项目明确禁止每单位 filter/mask，且矩形 mask 也要额外 draw call。

### 5. 等级文字（D-08）

- 独立于旋转子节点：`hudLayer` 里的节点只设置 `position = (x, y + levelOffsetY)`，`rotation = 0`。`hudLayer` 本身不旋转，所以文字永远直立。
- 世界尺寸：`text.scale.set(levelWorldHeight / text.height)`；`text.height` 在创建/改字后读取。数字位数变化（9→10）会改变 `height` 吗？`height` 由字体行高决定，不变；宽度变，但 scale 只按高度算，宽度自然变化。
- 首帧前 `text.height` 可能为 0：用 `text.height > 0 ? levelWorldHeight / text.height : 1` 兜底，等有高度后再设一次。
- `text.text` 只在等级变化时更新（缓存 `lastLevel`）。
- 颜色 `palette.text`，加黑色 `stroke` 提高暗底可读性。

### 6. 伤害数字（D-10）

- 仅 `appliedDamage >= damageNumberThreshold`（初始 50）。
- 从池中取一个 `Text`（池空且未达上限则新建；达上限则复用最旧/直接丢弃）。
- 位置 = `(event.x, event.y) + 小随机偏移`；世界尺寸 `damageNumberWorldHeight`。
- 每帧 `y -= riseMetersPerFrame`；`alpha = 1 - age/lifetime`；寿命到 → 归还池、`visible=false`。
- `text.text = String(Math.round(appliedDamage))` 只在生成时设置（不逐帧改字）。

### 7. 火花 / 死亡特效（D-06）

- 火花：共享 `GraphicsContext` 的小圆点；每次命中 `particlesPerHit` 个，随机方向/速度，寿命 `particleLifetimeFrames`，alpha 线性衰减；池上限 `maxParticles`。
- 死亡：一个扩散圆环（stroke，半径随时间增大、alpha 衰减）+ 6–8 个碎片粒子（faction 色）；寿命 `deathEffectLifetimeFrames`；池上限 `maxDeathEffects`。
- 触发：`event.killed` → 在 `event.x/event.y` 生成；若该位置不在视口内可跳过（省池）。
- 镜头震动：`max(appliedDamage)` ≥ `shakeDamageThreshold` 或任意 `killed` → 设置 `shakeAmplitude = clamp(maxDamage / threshold, 1, 3) * shakeAmplitudePx`；每帧 `amplitude *= shakeDecayPerFrame`。

### 8. 视频信息条（D-11）

```ts
// src/render/calendar.ts（纯函数）
const MINUTES_PER_DAY = 1440;
const DAYS_PER_MONTH = 30;
const MONTHS_PER_YEAR = 12;
const DAYS_PER_YEAR = DAYS_PER_MONTH * MONTHS_PER_YEAR; // 360

/** 两位补零。 */
function pad2(value: number): string {
    return String(value).padStart(2, '0');
}

export function formatCalendar(gameMinutes: number): string {
    const total = Math.max(0, Math.floor(Number.isFinite(gameMinutes) ? gameMinutes : 0));
    const dayIndex = Math.floor(total / MINUTES_PER_DAY);
    const year = Math.floor(dayIndex / DAYS_PER_YEAR) + 1;
    const dayOfYear = dayIndex % DAYS_PER_YEAR;
    const month = Math.floor(dayOfYear / DAYS_PER_MONTH) + 1;
    const day = (dayOfYear % DAYS_PER_MONTH) + 1;
    const hour = Math.floor((total % MINUTES_PER_DAY) / 60);
    const minute = total % 60;
    return `第 ${year} 年 ${month} 月 ${day} 日 ${pad2(hour)}:${pad2(minute)}`;
}

export function formatSpeed(minutesPerTick: number): string {
    return Number.isFinite(minutesPerTick) && minutesPerTick > 0
        ? `${Math.round(minutesPerTick)}×`
        : '—';
}

export function formatGameTime(gameMinutes: number, minutesPerTick: number): string {
    return `${formatCalendar(gameMinutes)} / ${formatSpeed(minutesPerTick)}`;
}
```

> 真实文件中每个顶层 `const` 都必须带 JSDoc（AGENTS §6）；上面为可读性省略了部分。`MINUTES_PER_DAY` 等是纯数学常量，适合放在 `calendar.ts` 而不是 `constants.ts`（它们是历法定义，不是可调视觉参数）。

- 例：`0` → `第 1 年 1 月 1 日 00:00 / 24×`（初始 `minutesPerTick = 24`，`TimeSystem.ts:23`）。
- 例：`1439` → `第 1 年 1 月 1 日 23:59`；`1440` → `第 1 年 1 月 2 日 00:00`；`43200` → `第 1 年 2 月 1 日 00:00`；`518400` → `第 2 年 1 月 1 日 00:00`。
- 字符串只在变化时写 `text.text`（每 60 帧才换一次小时；月份更少）。

---

## Damage/Death Event Tap（完整接线）

### 组合根代码（demo，照抄 harness 顺序 + 一层装饰）

```ts
// src/demo/composition.ts（设计提案；无 Pixi 依赖，可在 Node 测）
import RAPIER from '@dimforge/rapier2d-compat';
import { ControlSystem } from '@/control/ControlSystem';
import type { IUnitAI, IUnitAIProvider } from '@/control/types';
import { MathRng } from '@/common/rng';
import { DEFAULT_GEOMETRY, DT } from '@/physics/constants';
import { PhysicsWorld } from '@/physics/PhysicsWorld';
import { BattleDamageSink } from '@/kingdom/DamageSink';
import { IdleAI } from '@/kingdom/IdleAI';
import { KingdomWorld } from '@/kingdom/KingdomWorld';
import { DEFAULT_SCENARIO } from '@/kingdom/scenario';
import { KingdomSensingWorld } from '@/kingdom/SensingWorld';
import { createDefaultKingdomConfig } from '@/kingdom/strategies';
import { RenderDamageTap } from '@/render/DamageTap';
import type { IUnit } from '@/units/types';

export async function createDemoSetup(): Promise<IDemoSetup> {
    await RAPIER.init(); // 必须在构造世界之前；幂等

    const rng = new MathRng();
    const physics = new PhysicsWorld({ dt: DT, geometry: DEFAULT_GEOMETRY }, new MathRng());
    const sensing = new KingdomSensingWorld(
        DEFAULT_SCENARIO.width,
        DEFAULT_SCENARIO.height,
        DEFAULT_SCENARIO.terrain
    );

    let worldRef: KingdomWorld | null = null;
    const sink = new BattleDamageSink(physics, () => worldRef?.getBattleSystem() ?? null);
    const tap = new RenderDamageTap(sink, unitId => physics.getUnitState(unitId));

    const provider: IUnitAIProvider = {
        create(_unitId: number, _unit: IUnit): IUnitAI {
            return new IdleAI();
        },
        destroy(_unitId: number): void {
            // 无状态
        }
    };

    const control = new ControlSystem(physics, sensing, provider, tap);
    const world = new KingdomWorld(
        physics,
        control,
        rng,
        DEFAULT_SCENARIO,
        createDefaultKingdomConfig()
    );
    worldRef = world;

    return { world, control, physics, sensing, tap };
}
```

> **RNG 说明：** `mulberry32` 只存在于 `tests/helpers/rng.ts`，不是生产导出；demo 用 `MathRng`（`src/common/rng.ts:13`）。项目明确不保证确定性（PROJECT §No Determinism），所以 reset 后属性不同是可接受的。若需要“可复现 demo”，把 `mulberry32` 提升到 `src/common/rng.ts` 属独立小改动，不在本阶段默认范围。

**顺序不可变：** `sink` 先于 `World`；`tap` 包住 `sink`；`ControlSystem` 拿到的是 `tap`；`World` 构造时注册单位。`worldRef` 的晚绑定闭包与 `tests/kingdom/harness.ts:156-160` 一致。

### 死亡检测的三层保障

| 层 | 机制 | 覆盖 |
|----|------|------|
| 1（主） | tap 中 `wasAlive && !isAlive()` + 当场 `getUnitState` | 所有经 `BattleDamageSink` 应用的致命伤；位置准确 |
| 2（兜底） | `Renderer.syncUnitViews`：视图存在但 `catalog.getUnit(unitId) === null` | tap 被替换 / 未记录 / 未来其他伤害来源 |
| 3（清理） | 视图 `destroy()` + 计时/池条目删除 | 防止泄漏 |

- 兜底没有位置：用视图上一帧的 `root.position` 播放一个简单淡出（不碎裂），或直接销毁（推荐直接销毁，避免假特效）。
- 不依靠 `IBattle.getMemberUnitIds()` 的差异：成员会因离区而移除，不一定是死亡。

### 与 Phase 6 的边界

- Phase 5 **不** drain `IBattleSystem.drainEvents()`；demo 的自动跟拍用 `listActiveBattles()` 轮询。
- Phase 6 需要的 `Ended` 事件仍归 Phase 6/7 消费。
- `IRenderer.renderFrame()` 是同步的；Phase 6 在它返回后取 `getCanvas()`。

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| WebGL / 画布 / 上下文 / 批处理 | 手写 WebGL 初始化、着色器、顶点缓冲 | `pixi.js` `Application` / `Renderer` | REND-01 指定 PixiJS；上下文丢失、DPR、批处理、纹理 GC 都已处理 |
| 场景图 / 变换 / 逆变换 | 自己维护对象树 + 屏幕坐标 | `Container` / `Graphics` / `Text` + 相机 transform | 变换继承、可见性、批处理由 Pixi 负责；我们只维护相机数学 |
| 形状几何复用 | 每单位重新 `new Graphics().circle()` | `GraphicsContext` 共享（9 份：本体 + 6 武器 + 2 防具） | 官方文档：Graphics 在几何不常改时最快；共享 context 是 v8 的设计目的 |
| 文字栅格化 | 自己画位图字体 | `Text`（系统字体） | 等级/伤害数字量小、变化少；BitmapText 需要预生成字体，超出本阶段 |
| 伤害事件广播 | 自建 EventBus / 修改 `IControlSystem` | `IDamageSink` 装饰器 | 冻结契约不变；装饰器只有 1 个方法 |
| 日历/时间格式 | 日期库（dayjs/luxon） | 纯函数 `calendar.ts` | 简化历是虚构的（360 天/年），真实日期库反而要绕开闰年/时区 |
| 相机拟合 | 第三方相机/取景库 | 纯 `cameraMath.ts` | 需求特定（≥90%、两态、平滑切换）；手写 100 行可测 |
| 粒子系统 | 粒子库 / `ParticleContainer` | 池化 `Graphics` + 数组 | 同屏上限很小（≤128）；`ParticleContainer` 更适合数千粒子，且 v8 需要 `Particle`/`ParticleContainer` 的额外概念 |
| 帧采集/编码 | 在 Phase 5 里做 canvas → video | Phase 6（WebCodecs + Mediabunny） | D-18/Phase 6 边界；Phase 5 只暴露 `renderFrame()` + `getCanvas()` |
| 状态管理框架 | Vue/React/Store | 普通 class + 一个 HTML 面板 | 单页 demo，无路由/无组件树；引入框架违反反过度设计 |

**Key insight:** 本阶段真正“难”的只有三件事——**镜头拟合的数学**、**伤害/死亡时序**、**Pixi v8 的对象生命周期**。其余都是薄适配；把这三件做成纯函数/装饰器/工厂，其他部分就不会失控。

---

## Common Pitfalls

### Pitfall 1: `autoStart` 默认 true，Pixi 自己也在渲染

**What goes wrong:** `await app.init({...})` 后 ticker 自动按 rAF 调 `app.render()`；runner 又手动调一次 → 双渲染、帧序不可控、Phase 6 抓到的帧可能不是 `world.tick()` 之后的那一帧。
**Why:** `TickerPlugin.autoStart` 默认 `true`。[VERIFIED: pixi d.ts app/TickerPlugin.d.ts:55]
**How to avoid:** `app.init({ autoStart: false })`；只调 `app.render()`；不要 `app.start()`。
**Warning signs:** CPU 翻倍；暂停后画面仍在动；`renderFrame()` 调用次数与 `world.tick()` 不一致。

### Pitfall 2: 用 v7 的 Graphics API

**What goes wrong:** `beginFill` / `drawCircle` / `endFill` / `lineStyle` 在 v8 已废弃或不存在。
**Why:** v8 重写了 Graphics（“先建形状，再 fill/stroke”）。[CITED: https://pixijs.com/8.x/guides/migrations/v8]
**How to avoid:** 只用 `.circle().fill()/.stroke()`、`.rect().fill()`、`.poly().fill()`；`stroke({ width, color })`，不是 `lineStyle`。
**Warning signs:** 运行时 `is not a function`；类型检查报错。

### Pitfall 3: 把 `Graphics` 当容器加子节点

**What goes wrong:** `graphics.addChild(...)` 在 v8 不存在（叶节点不能有子节点）。
**Why:** v8 移除了 `DisplayObject`，`Sprite`/`Graphics`/`Text` 是叶子；只有 `Container` 可组合。[CITED: https://pixijs.com/8.x/guides/migrations/v8]
**How to avoid:** `IUnitView.getRoot()` 返回 `Container`；本体旋转放在子 `Container` 里；HUD 元素作为兄弟节点。
**Warning signs:** TS 报 `addChild` 不存在；或者子对象不显示。

### Pitfall 4: 每帧改 `Text.text`

**What goes wrong:** 每次赋值都会重新栅格化文字并上传纹理；100 个单位 × 每帧 = 明显卡顿。
**Why:** 官方性能提示明确“Avoid changing it on every frame”。[CITED: https://pixijs.com/8.x/guides/concepts/performance-tips]
**How to avoid:** 等级只在 `level` 变化时写；伤害数字只在从池中取出时写；信息条只在格式化字符串变化时写。
**Warning signs:** 帧时间随单位数线性上升，且 Text 越多越慢。

### Pitfall 5: 共享 `GraphicsContext` 被单个视图销毁

**What goes wrong:** `view.destroy({ context: true })` 会把所有共享同一 context 的视图一起销毁；其它单位变空白。
**Why:** 官方文档明确 “When you destroy a GraphicsContext, all Graphics instances that share it will also be destroyed”。[CITED: https://pixijs.com/8.x/guides/components/scene-objects/graphics]
**How to avoid:** 视图销毁只用 `root.destroy({ children: true })`（不传 `context: true`）；共享 context 由 `UnitViewFactory.dispose()` 统一销毁一次。
**Warning signs:** 一个单位死亡后，同武器/同防具的所有单位一起消失。

### Pitfall 6: 用 `tint` 提亮

**What goes wrong:** 受击时 `tint = 0xffffff` 对深色本体没有“闪白”效果（tint 是乘法）。
**Why:** Pixi 的 tint 与纹理/颜色相乘，不能超过原色。
**How to avoid:** 本体用**白色底** + `tint = factionColor`；闪白时把 tint 设为 `0xffffff`（即去掉阵营色 → 白色），再叠加白色圆环。
**Warning signs:** 受击看起来只是“颜色变回白”，但深色描边仍然暗；或者完全没变化。

### Pitfall 7: `setTimeout(..., 0)` 被钳到 4ms / 后台节流

**What goes wrong:** 以为能“无限快”；实际嵌套 5 次后最小 4ms（约 250fps）；标签页不可见时 Chrome 会节流到 1s/次。
**Why:** HTML 规范 / MDN。[CITED: https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout]
**How to avoid:** 接受 4ms 下限；速度用 `frameDelayMs` 控制；录制时保持标签页可见；不要用 `setInterval`。
**Warning signs:** 面板显示 0ms 但帧率只有 ~250；切到别的标签再回来，模拟“跳了一大段”。

### Pitfall 8: 重复推进控制层

**What goes wrong:** 在 runner 里 `world.tick()` 之后又调 `control.tick()` → 物理一步变两步，战斗/伤害翻倍。
**Why:** `KingdomWorld.stepSubstep()` 内部已经调用 `control.tick()`。[VERIFIED: src/kingdom/KingdomWorld.ts:841-855]
**How to avoid:** runner 只调 `world.tick()`；渲染层只读。
**Warning signs:** 帧时间异常；战斗结束得比预期快一倍；`physics.tick()` 的调用计数与 `world.tick()` 不符。

### Pitfall 9: 伤害 tap 记录被 sink 拒绝的事件

**What goes wrong:** 友军接触 / 不在同一战斗的武器接触也会闪白、飘伤害数字。
**Why:** `BattleDamageSink` 会静默拒绝同队 / 不同战斗 / 已死亡 / 物理读数缺失的伤害；tap 无条件记录 context 就会误报。[VERIFIED: src/kingdom/DamageSink.ts:48-82]
**How to avoid:** 记录前比较 `Health` 前后：`applied = max(0, before - after)`；`applied <= 0 && !killed` → 不记录。见 §Damage Tap。
**Warning signs:** 友军挤在一起时满屏火花；没有掉血却有伤害数字。

### Pitfall 10: 死亡位置在 `removeUnit` 之后才读

**What goes wrong:** 用“上一帧有、这一帧没有”的 id 差异检测死亡，再 `getUnitState` → `null`，死亡特效只能出现在 (0,0) 或上一帧位置。
**Why:** `ControlSystem.tick()` 在伤害路由之后批量注销死亡单位；`removeUnit` 删除刚体。[VERIFIED: src/control/ControlSystem.ts:294-302]
**How to avoid:** 在 tap 的 `applyDamage` 内、`inner.applyDamage()` 返回后立刻读 `getUnitState(defenderId)`。
**Warning signs:** 死亡特效位置偏移；`getUnitState` 返回 `null` 的比例异常高。

### Pitfall 11: 在渲染器里 `drainEvents()`

**What goes wrong:** `IBattleSystem.drainEvents()` 是破坏性读取；渲染器拿走 `Started/Ended` 后，Phase 6/7 再也拿不到。
**Why:** `drainEvents` 的注释明确“取走自上次调用以来的生命周期事件（新数组，并清空内部缓冲）”。[VERIFIED: src/kingdom/types.ts:302-303]
**How to avoid:** Phase 5 只 `listActiveBattles()` / `listCompletedBattles()` 轮询；事件归 Phase 6/7。
**Warning signs:** Phase 6 的战斗队列为空；Phase 7 收不到结束事件。

### Pitfall 12: 镜头被一个离群单位拉爆

**What goes wrong:** 用全体成员的 AABB 拟合，一个刚离队/刚加入的单位在 80m 边缘 → 镜头猛拉远，主体战斗变成小点。
**Why:** 战斗区 80m，成员可能分布很散；AABB 对离群值零鲁棒。
**How to avoid:** 中位数中心 + 第 90 百分位切比雪夫半径（§Camera Algorithms §1）；离群点允许出画。
**Warning signs:** 镜头在战斗中反复大幅缩放；主体单位在画面里只有几个像素。

### Pitfall 13: 镜头“目标满足 90%”被误解为“过渡中也始终 90%”

**What goes wrong:** 从战斗 A 切到战斗 B 时，当前 transform 在缓动中，必然有一段时间不满足 B 的 90%；如果验收按“每一帧都 90%”，只能瞬移。
**Why:** D-14 同时要求“≥90%”和“禁止瞬移”，两者在切换瞬间冲突。
**How to avoid:** 把 90% 定义为**目标构图**的属性（`cameraMath.fitBox/fitTransform` 的输出永远满足）；当前 transform 用平滑/缓动趋近。若用户要求“始终 90%”，则切换时需要“加速缩小”（先 zoom out 再 pan），见 OQ-1。
**Warning signs:** 验收争论；或为了硬保证而写出瞬移。

### Pitfall 14: 世界坐标 / 屏幕坐标混用 + y 翻转

**What goes wrong:** 一边用 `screenY = H - worldY` 画地图，一边用 `rotation = angle` 画单位 → 朝向反了；或者拾取坐标差一个 `H`。
**Why:** Rapier 是 y 向上数学坐标；Pixi 是 y 向下屏幕坐标。
**How to avoid:** **不翻转 y**（§Camera Algorithms §6）；所有角度直接用 `rotation = angle`；拾取用 `screenToWorld`。如果未来要翻转，统一在所有角度取负。
**Warning signs:** 单位武器指向与移动方向相反；点击地图选点偏到对称位置。

### Pitfall 15: 把武器画成沿朝向的“矛”

**What goes wrong:** 视觉上武器在单位前方（+x），物理碰撞体却是局部 `(0.7,0)` 的**横向** capsule（长轴 y）；看起来刺中了，实际是侧面擦到。
**Why:** Rapier 2D capsule 的长轴是局部 y；物理层只平移不旋转。[VERIFIED: collider.d.ts:685; PhysicsWorld.ts:130-147]
**How to avoid:** 所有武器画在局部 x≈0.7 的竖直轮廓上（长度/头部/弧度区分 6 种）；加一小段“握把”连接本体与武器中心。
**Warning signs:** 慢动作下武器尖端穿过敌人但不掉血；或敌人被“空气”击中。

### Pitfall 16: 固定 1920×1080 backing store 与 CSS 缩放混淆

**What goes wrong:** 用 `resizeTo: window` + `autoDensity` → canvas 实际像素随窗口/DPR 变化，Phase 6 导出的分辨率不稳定；或者用 CSS 宽高改变了 drawing buffer。
**Why:** `autoDensity` 会根据 `resolution` 调整 canvas 的 CSS 尺寸；`resizeTo` 会改渲染尺寸。
**How to avoid:** `width:1920, height:1080, resolution:1, autoDensity:false`，不设 `resizeTo`；页面用 CSS `aspect-ratio` + `max-width/max-height` 等比缩放。
**Warning signs:** 视频分辨率不是 1920×1080；文字在 HiDPI 上糊/过大。

### Pitfall 17: 在 Vitest（node）里 import Pixi

**What goes wrong:** `import { Container } from 'pixi.js'` 在 node 环境尝试访问 DOM/WebGL → 测试文件直接崩。
**Why:** `vitest.config.ts` 是 `environment: 'node'`；没有 jsdom/WebGL。
**How to avoid:** 纯模块（`cameraMath`/`hudModel`/`calendar`/`frameModel`/`DamageTap`）不导入 Pixi；`types.ts` 只用 `import type`；Pixi 类靠 Chrome 手动 UAT。
**Warning signs:** `document is not defined` / `navigator is not defined`；测试 worker 崩溃。

### Pitfall 18: 忘了 `RAPIER.init()` 或 dispose 顺序

**What goes wrong:** 构造 `PhysicsWorld` 时 WASM 未初始化 → 抛错；或者 `reset()` 只 dispose world，没 dispose control/physics → 旧刚体/定时器泄漏。
**Why:** `RAPIER.init()` 返回 Promise；`KingdomWorld.dispose()` 只移除自己添加的地形/边界墙，不释放注入的 control/physics。[VERIFIED: src/kingdom/types.ts:404-405]
**How to avoid:** `main` 里 `await RAPIER.init()` 再构造；`reset()` 顺序 = `renderer.reset()` → `world.dispose()` → `control.dispose()` → `physics.dispose()` → 重建；Rapier init 幂等。
**Warning signs:** 第一次运行正常、第二次 reset 后单位瞬移/不消失；内存上涨。

### Pitfall 19: Phase 6 抓 canvas 得到空白

**What goes wrong:** WebGL drawing buffer 在合成后被清空，Phase 6 在 `setTimeout` 回调里 `new VideoFrame(canvas)` 可能拿到空白/上一帧。
**Why:** 默认 `preserveDrawingBuffer: false`。[VERIFIED: pixi d.ts GlContextSystem.d.ts:44-48]
**How to avoid:** Phase 5 就把 `preserveDrawingBuffer: true` 打开（代价很小）；Phase 6 在 `renderFrame()` 返回后同任务内抓帧；若仍有问题，退回 `renderer.extract.canvas(stage)`。
**Warning signs:** 录出来的视频全黑/闪帧；canvas 直接 `toDataURL` 是黑的。

### Pitfall 20: 默认场景缺 Hammer / Knight，REND-02 无法完整目视验证

**What goes wrong:** `DEFAULT_SCENARIO` 只有 5/7 职业、5/6 武器、1/2 防具（见 §Verified 11）；demo 看不到锤子/头盔，验收时误以为“6 武器都做了”。
**Why:** 场景表就这么多单位。
**How to avoid:** demo 默认仍用 `DEFAULT_SCENARIO`（D-16），但提供一个 `?classes=all` 的 demo 变体（每军加 1 Hammer + 1 Knight），用于 REND-02 目视检查；或接受 5/6 并在验证记录中注明。见 OQ-2。
**Warning signs:** 验收截图里没有锤子；武器形状表有 6 项但只见到 5 项。

### Pitfall 21: 升级换装后视觉与物理不同步

**What goes wrong:** 单位升级获得盾牌，视觉若实时重建会画出盾牌，但物理规格在注册时冻结、没有盾牌碰撞体 → 看起来有盾却不挡。
**Why:** `IControlSystem.registerUnit` 的物理 spec 是注册快照（WR-01）；`IUnit.getEquipment()` 会随升级变化。
**How to avoid:** 视图 spec 在首次出现时快照，不随装备变化重建（Gate G-6）；HUD 等级仍实时。若未来要同步，必须先解决物理重建（不在本阶段）。
**Warning signs:** 高等级单位看起来装备了盾，但伤害数字没有减伤。

### Pitfall 22: 相机 `minScale` 设得比全景还大

**What goes wrong:** 为了“不要太小”把 `minScale` 设为 5 px/m，结果 1000m 地图只显示 200m，全景看不到全图；或把战斗拟合强行放大，破坏 90%。
**How to avoid:** `minScale` 必须等于 `strategicTransform` 的 scale（全景拟合值）；对地图内任意点集，battle fit ≥ 该值。
**Warning signs:** 全景模式看不到地图边缘；90% 测试失败。

### Pitfall 23: Vite + Pixi 顶层 await

**What goes wrong:** 在模块顶层写 `await app.init()`，生产构建（尤其旧 Vite）可能出问题。
**Why:** Pixi 官方 Quick Start 明确建议用 async 函数包裹。[CITED: https://pixijs.com/8.x/guides/getting-started/quick-start]
**How to avoid:** `async function main() { ... }` + `main().catch(...)`；本项目 Vite 8 较新，但仍按官方建议写。
**Warning signs:** dev 正常、`vite build` 后白屏。

---

## Code Examples

### 1. PixiJS 8：异步 init + 手动渲染（官方模式）

```ts
// Source: https://pixijs.com/8.x/guides/components/application + app.Application.d.ts:240-249
import { Application } from 'pixi.js';

const app = new Application();
await app.init({
    width: 1920,
    height: 1080,
    backgroundColor: 0x0b0d10,
    antialias: true,
    resolution: 1,
    autoDensity: false,
    preference: 'webgl',
    autoStart: false,            // 关键：不要让 ticker 自己渲染
    preserveDrawingBuffer: true  // Phase 6 逐帧抓 canvas 的保险
});
document.getElementById('stage-host')!.appendChild(app.canvas);

// 每个输出帧：
app.render();                    // 同步；不是 Promise
```

> Vite 官方 Quick Start 警告顶层 await 的构建问题，建议包在 async 函数里：
> ```ts
> async function main(): Promise<void> { /* await app.init(...) */ }
> main().catch(error => console.error(error));
> ```

### 2. PixiJS 8：共享 `GraphicsContext` 的单位几何

```ts
// Source: https://pixijs.com/8.x/guides/components/scene-objects/graphics（v8 API）
import { Container, Graphics, GraphicsContext } from 'pixi.js';

const bodyContext = new GraphicsContext().circle(0, 0, 0.5).fill(0xffffff);
const swordContext = new GraphicsContext()
    .rect(0.66, -0.55, 0.08, 1.1).fill(0xc9d3dd)   // 刀身：局部 x≈0.7、沿 y
    .rect(0.58, -0.12, 0.24, 0.06).fill(0x8a97a3); // 护手

// 每个单位：白色底 + tint = 阵营色
const root = new Container();
const body = new Graphics(bodyContext);
body.tint = 0xe23b3b;
const weapon = new Graphics(swordContext);
const rotator = new Container();
rotator.addChild(body, weapon);
root.addChild(rotator);          // root 不旋转；rotator.rotation = angle
```

> `Graphics` 是叶节点，不能 `addChild`；`root` 必须是 `Container`。[CITED: https://pixijs.com/8.x/guides/migrations/v8]

### 3. PixiJS 8：选项对象构造 Text + 世界尺寸

```ts
// Source: pixi.d.ts scene/text/Text.d.ts:163 + AbstractText.d.ts:136
import { Text } from 'pixi.js';

const level = new Text({
    text: '3',
    anchor: 0.5,
    style: {
        fontFamily: 'Segoe UI, system-ui, sans-serif',
        fontSize: 32,
        fontWeight: '700',
        fill: 0xe8edf2,
        stroke: { color: 0x000000, width: 4 }
    }
});
// 世界尺寸：screen 高度 = levelWorldHeight * cameraScale
level.scale.set(levelWorldHeight / level.height);
// 等级变化时：level.text = String(nextLevel)（只在变化时）
```

### 4. 相机拟合（设计提案，待门禁）

```ts
// src/render/cameraMath.ts —— 纯函数，无 Pixi
export function fitBox(
    points: readonly IVec2[],
    coverage: number,
    minSpanMeters: number
): IFitBox | null {
    // ...见 §Camera Algorithms §1（中位数 + 第 90 百分位切比雪夫半径）
}

export function strategicTransform(
    bounds: IMapBounds,
    viewport: IViewport,
    config: ICameraConfig
): { centerX: number; centerY: number; scale: number } {
    const usableW = Math.max(1, viewport.width - 2 * config.paddingPx);
    const usableH = Math.max(1, viewport.height - 2 * config.paddingPx);
    const scale = Math.min(usableW / bounds.width, usableH / bounds.height);
    return { centerX: bounds.width / 2, centerY: bounds.height / 2, scale };
}
```

### 5. 伤害装饰器（设计提案）

```ts
// src/render/DamageTap.ts —— 组合 IDamageSink + IDamageFeed
export class RenderDamageTap implements IDamageSink, IDamageFeed {
    private readonly inner: IDamageSink;
    private readonly getUnitState: UnitStateLookup;
    private buffered: IRenderDamageEvent[] = [];

    constructor(inner: IDamageSink, getUnitState: UnitStateLookup) {
        this.inner = inner;
        this.getUnitState = getUnitState;
    }

    applyDamage(context: IDamageContext): void {
        // ...见 §Pattern 2（HP 前后差 + killed + 位置快照）
    }

    drain(): readonly IRenderDamageEvent[] {
        const drained = this.buffered;
        this.buffered = [];
        return drained;
    }

    clear(): void {
        this.buffered = [];
    }
}
```

### 6. Demo 循环（设计提案）

```ts
// src/demo/runner.ts
export class ManualRunner implements IManualRunner {
    private running = false;
    private timer: ReturnType<typeof setTimeout> | null = null;
    private frameDelayMs: number;

    start(): void {
        if (this.running) return;
        this.running = true;
        this.schedule();
    }

    pause(): void {
        this.running = false;
        if (this.timer !== null) {
            clearTimeout(this.timer);
            this.timer = null;
        }
    }

    stepOnce(): void {
        if (this.running) return;
        this.runOneFrame();
    }

    setFrameDelay(ms: number): void {
        this.frameDelayMs = Number.isFinite(ms) ? Math.max(0, Math.min(1000, ms)) : 0;
    }

    private schedule(): void {
        if (!this.running) return;
        this.timer = setTimeout(() => this.runOneFrame(), this.frameDelayMs);
    }

    private runOneFrame(): void {
        this.timer = null;
        try {
            this.services.world.tick();      // 恰好一次；内部已含 control.tick
            this.renderer.renderFrame();     // 同步
        } catch (error) {
            this.pause();
            this.onError(error);
            return;
        }
        this.schedule();
    }
}
```

### 7. 操作者面板 → `issueOrder`（设计提案）

```ts
// src/demo/panel.ts（DOM；永远在 canvas 之外）
function issueMoveTo(armyId: number, x: number, y: number): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    world.issueOrder({ armyId, kind: ArmyOrderKind.MoveTo, targetX: x, targetY: y });
}

// canvas 点击 → 世界坐标（CSS 缩放 + 相机反变换）
const rect = canvas.getBoundingClientRect();
const px = ((event.clientX - rect.left) / rect.width) * viewport.width;
const py = ((event.clientY - rect.top) / rect.height) * viewport.height;
const worldPoint = screenToWorld(px, py, transformWithoutShake, viewport);
```

### 8. 页面布局：固定 1920×1080 backing store + CSS 等比缩放 + 面板在 canvas 外

```html
<!-- index.html（设计提案） -->
<div id="app">
    <div id="stage-wrap"><div id="stage-frame"></div></div>
    <aside id="operator-panel"></aside>
</div>
<script type="module" src="/src/main.ts"></script>
```

```css
/* src/style.css（设计提案；Chrome 155） */
html, body { margin: 0; height: 100%; background: #0b0d10; color: #e8edf2; }
#app { display: flex; height: 100%; }
#stage-wrap {
    flex: 1 1 auto;
    min-width: 0;
    display: grid;
    place-items: center;
    padding: 12px;
    box-sizing: border-box;
}
#stage-frame {
    aspect-ratio: 16 / 9;
    width: min(100%, calc((100vh - 24px) * 16 / 9));
}
#stage-frame canvas {
    width: 100%;
    height: 100%;
    display: block;
}
#operator-panel {
    flex: 0 0 300px;
    overflow: auto;
    border-left: 1px solid #1f2730;
    padding: 12px;
    box-sizing: border-box;
}
```

> `canvas.width/height` 保持 1920×1080（Pixi `width/height` + `resolution:1`），CSS 只改显示尺寸；Phase 6 取到的像素始终 1920×1080。面板是 canvas 的**兄弟**，不可能被拍进视频。

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| Pixi v7：构造函数传 options、同步可用 | v8：`await app.init(options)` | v8.0.0 | demo 入口必须是 async；`main().catch(...)` |
| `@pixi/app` / `@pixi/sprite` 分包 | 单包 `pixi.js` | v8.0.0 | 只加一个依赖 |
| `beginFill` / `drawCircle` / `drawRect` / `GraphicsGeometry` | 先建形状再 `.fill()/.stroke()`；`GraphicsContext` 共享几何 | v8.0.0 | 视觉代码全部按新 API 写；共享 context 是新性能点 |
| `DisplayObject` 基类 | `Container` 是唯一可组合基类；叶节点不能有子节点 | v8.0.0 | `IUnitView` 根必须是 `Container` |
| `Text('str', style)` 位置参数 | `new Text({ text, style, anchor })` | v8.0.0 | 旧签名仍 deprecated 可用，但新代码用对象 |
| WebGPU renderer 作为默认 | WebGL 仍是生产推荐；WebGPU 标注 experimental | v8.x | `preference:'webgl'` |
| `settings` / `utils` 全局对象 | `AbstractRenderer.defaultOptions` / 直接导入 | v8.0.0 | 本项目不依赖这些 |
| rAF 驱动游戏循环 | 本项目：`setTimeout` + 手动 `app.render()` | D-17 | 每帧恰好一个 `IWorld.tick()`；输出帧 = 模拟 tick |

**Deprecated/outdated（不要用）：**
- `app.view`（用 `app.canvas`）；`Application` 构造参数（用 `init`）。
- `beginFill` / `endFill` / `lineStyle` / `draw*` 系列。
- `container.name`（用 `label`）；`cacheAsBitmap`（用 `cacheAsTexture`）。
- `pixi.js/unsafe-eval` 扩展：默认不导入，**不要**为了省事导入（安全 + 无必要）。
- `requestAnimationFrame` 作为主节拍（D-17 明确禁止）。

---

## Implementation Waves（Round 2 建议，供 planner 拆计划）

> Round 1 只到类型门禁；下面是**批准后**的实现顺序。每个 Wave 都以“可验证”为边界。

| Wave | 内容 | 验证 |
|------|------|------|
| **Wave 0**（门禁前） | `pnpm add -E pixi.js@8.22.0`（`checkpoint:human-verify`）；`tests/render/` 脚手架 + `fakes.ts`；`package.json` 加 `dev`/`build`（可在 Wave 3 再加） | `pnpm typecheck` 在装了 Pixi 后仍通过；`pnpm test` 基线不破 |
| **Wave 1**（Round 1 = 类型门禁） | `src/render/types.ts` + `tests/render/types.test.ts` | `pnpm typecheck` + `pnpm vitest run tests/render/types.test.ts` → **用户批准** |
| **Wave 2**（纯逻辑） | `constants.ts`、`calendar.ts`、`cameraMath.ts`、`hudModel.ts`、`frameModel.ts`、`DamageTap.ts` + 对应测试 | `pnpm vitest run tests/render`（不依赖 Pixi / Rapier，除 DamageTap 的 fake） |
| **Wave 3**（Pixi 视图 + HUD + Renderer） | `UnitViewFactory.ts`、`GeometryUnitView.ts`、`Camera.ts`、`Hud.ts`、`Renderer.ts` | `pnpm typecheck` + 手动 Chrome 冒烟（空场景/单场景） |
| **Wave 4**（demo） | `src/demo/{types,composition,runner,panel}.ts`、`src/main.ts`、`index.html`、`style.css` | `tests/demo/runner.test.ts`（fake timers）+ `tests/demo/composition.test.ts`（真实 Rapier）+ Chrome UAT |
| **Wave 5**（校准） | 调色板/阈值/镜头手感/粒子上限；补 `?classes=all`（若 OQ-2 批准） | 手动 UAT 全表 + `pnpm test` + `pnpm lint` |

**并行性：** Wave 2 的纯模块彼此独立，可并行；Wave 3 依赖 Wave 2 的接口；Wave 4 依赖 Wave 3 + Wave 2 的 DamageTap。按 `parallelization: false` 的配置，默认串行即可。

---

## Assumptions Log

> 下列全部是 `[ASSUMED]`：CONTEXT 未锁定、需要门禁/实测确认的设计默认值。

| # | Claim | Section | Risk if Wrong |
|---|-------|---------|---------------|
| A1 | D-14 的“≥90% 在画面内”按**目标 transform** 验收；切换过渡的当前 transform 允许短暂不满足（否则与“禁止瞬移”矛盾） | §Camera Algorithms；OQ-1 | 高：若用户要求每帧硬保证，需要“先缩小再平移”的过渡策略，镜头手感变化 |
| A2 | 默认 `outputFps = 30`；默认 `frameDelayMs = 33`（可看），面板可调到 0 | §Runner；D-17 | 低：纯参数 |
| A3 | HUD：血条世界宽 1.4m / 高 0.16m / 上偏 0.95m；近景屏幕宽 36px；`screenScaleAt=20`、`worldScaleAt=10`（px/m）；等级世界高 0.7m | §Hud Algorithms | 中：直接影响可读性与重叠；需截图校准 |
| A4 | 调色板：背景 `0x0b0d10`、地图 `0x151a20`、网格 `0x1f2730`、地形 `0x232a26`、文字 `0xe8edf2`；阵营 fallback 高饱和 6 色 | §Standard Stack / 配置 | 低：可整体替换（D-05 reversible） |
| A5 | 武器视觉画在**物理 capsule 的横向足迹**上（局部 x≈0.7、沿 y），而不是沿朝向的矛尖 | §Pitfall 15；D-04 | 中：若用户坚持“矛尖向前”，视觉会与碰撞不一致；需要改物理或接受错位 |
| A6 | 等级数字画在**本体中心**（世界尺寸、不旋转），血条在其上方 | D-08；OQ-3 | 中：本体 1m 直径，0.7m 数字会盖住大部分本体；可能改为“本体上方” |
| A7 | 伤害 tap 用 HP 前后差判定“已应用”；极端情况下（同一次 sink 内升级回血）可能漏掉一次视觉反馈 | §Damage Tap | 低：只影响一次特效，不影响 HUD/战斗 |
| A8 | 全景标记用**屏幕空间**固定像素（位置由 `worldToScreen` 算） | §Pattern 7 | 低：视觉选择 |
| A9 | 镜头中心用**中位数**，不用 `IBattle.getCenter()`（后者只用于空成员兜底） | §Camera Algorithms §1 | 低：构图更稳；若用户希望“贴战斗区中心”，可改成两者中点 |
| A10 | `preserveDrawingBuffer: true` 现在打开，作为 Phase 6 的保险；代价很小 | §Pitfall 19；OQ-5 | 低：轻微显存/性能代价 |
| A11 | demo 默认 `DEFAULT_SCENARIO`；`?classes=all` 变体仅用于 REND-02 目视验证 | §Pitfall 20；OQ-2 | 中：不加变体则默认画面缺 Hammer/Knight |
| A12 | `IUnitViewFactory.create` 保持**同步**；未来贴图实现需在创建 renderer 前预加载 | D-03 | 低：本阶段是几何；未来可加 `await factory.preload()` |
| A13 | 伤害数字阈值比较的是**实际 HP 损失**（不是 `event.damage` 的原始值） | §Hud Algorithms §6 | 低：overkill 不显示满额数字，更合理 |
| A14 | 视图 spec 在单位首次出现时冻结，不随升级换装更新 | Gate G-6；§Pitfall 21 | 中：升级获得的盾牌/头盔不会显示；与物理冻结一致 |
| A15 | 世界 y 不翻转；`rotation = angle` 直接使用 | §Camera Algorithms §6 | 中：若未来改成翻转，所有角度要统一取负 |
| A16 | 自动跟拍默认取 `listActiveBattles()[0]`（第一个活跃战斗），不评分 | D-15；OQ-6 | 低：demo harness；Phase 6 会显式驱动 |

---

## Open Questions (RESOLVED)

| OQ | Resolution |
|----|------------|
| OQ-1 | Resolved by CONTEXT D-21: the ≥90% coverage is a property of the target composition; the current transform may lag during a smooth switch. |
| OQ-2 | Resolved by CONTEXT D-22: the demo may add a `?classes=all` variant for REND-02 visual verification. |
| OQ-3 | Resolved by CONTEXT D-23: the level number is drawn at the body center. |
| OQ-4 | Deferred to Round-2 discretion: default `outputFps` / `frameDelayMs` are config values, not type-gate decisions. |
| OQ-5 | Deferred to Round-2 discretion: `preserveDrawingBuffer` is a renderer-initialization detail. |
| OQ-6 | Deferred to Round-2 discretion: the demo runner may keep the current battle or fall back to `listActiveBattles()[0]`. |
| OQ-7 | Resolved by CONTEXT D-24: MoveTo uses canvas click picking (`screenToWorld`). |
| OQ-8 | Resolved by the plan: exact pin `pixi.js@8.22.0`, gated by `checkpoint:human-verify`. |

### OQ-1: “≥90% 在画面内”是否要求过渡期间也成立？
- **What we know:** D-14 同时要求“≥90%”和“禁止瞬移”；从远处战斗切到近处战斗时，二者在过渡瞬间必然冲突。
- **What's unclear:** 用户要的是“构图目标满足 90%”（推荐）还是“任何一帧都满足 90%”。
- **Recommendation:** 按目标 transform 验收；当前 transform 用定时缓动（`switchFrames=90`）。若用户要求硬保证，改为“先以较快速度 zoom out 到能同时容纳旧/新目标，再 pan，再 zoom in”——仍然是平滑的，但切换更长。

### OQ-2: `DEFAULT_SCENARIO` 缺 Hammer / Knight，REND-02 如何完整验证？
- **What we know:** 默认场景 16 单位、5/7 职业、5/6 武器、1/2 防具（§Verified 11）。
- **What's unclear:** 是否允许 demo 用变体场景（不改 `DEFAULT_SCENARIO`）。
- **Recommendation:** demo 默认仍用 `DEFAULT_SCENARIO`（D-16）；另加一个 `?classes=all` 的 demo 变体（每军加 1 Hammer + 1 Knight），仅用于 REND-02 的目视检查。这样不伪造单位/战斗数据，也不改 Phase 4 场景表。若用户拒绝，则在验证记录中注明“Hammer/Helmet 仅由单元测试/代码审查覆盖”。

### OQ-3: 等级数字画在本体中心还是本体上方？
- **What we know:** D-08 说“绘制在单位本体上”；本体半径 0.5m。
- **What's unclear:** “本体上”是指“屏幕上贴在单位上”还是“字压在圆里”。
- **Recommendation:** 画在本体中心（anchor 0.5、世界高 0.7m、白字黑描边）；若截图显示遮挡严重，改为本体上方 0.75m（仍属“跟随单位”）。

### OQ-4: 默认输出帧率与每帧延时？
- **What we know:** D-17 说延时就是速度控制；HUD 15s 按输出帧率算；REND-05 已放宽。
- **Recommendation:** `outputFps=30`、`frameDelayMs=33`（约 30fps 可看）；面板 0–1000ms 滑块。Phase 6 可以忽略 `frameDelayMs`，只按 `outputFps` 编码。

### OQ-5: 现在就开 `preserveDrawingBuffer` 吗？
- **What we know:** 默认 `false`；Phase 6 要逐帧把 canvas 交给 WebCodecs。
- **Recommendation:** 现在设为 `true`。若实测有性能/显存问题，再改为 Phase 6 的 `renderer.extract.canvas(stage)` 路径。

### OQ-6: demo 自动跟拍哪一个战斗？
- **What we know:** 可能同时有多场活跃战斗（D-03）；Phase 5 不做评分。
- **Recommendation:** 保持当前目标直到它结束；结束后取 `listActiveBattles()[0]`；没有活跃战斗 → `null`（全景）。不做“最激烈”选择（Phase 6）。

### OQ-7: 操作者 `MoveTo` 的目标点如何选？
- **What we know:** 面板必须有 `MoveTo` / `Garrison` / `Hold`（D-12）。
- **Recommendation:** 选中军队 → 点“MoveTo”进入拾取模式 → 在 canvas 上点击（`getBoundingClientRect` + `screenToWorld`，排除 shake）；`Garrison` 用城池下拉；`Hold` 一键。比纯数字输入更实用，代码量很小。

### OQ-8: `pixi.js` 钉 8.22.0 还是更早的 8.x？
- **What we know:** seam 因“最新 release 太新”给 `SUS`；包本身 4.7 年、845k 周下载、MIT、官方 repo。
- **Recommendation:** 钉 `8.22.0`（本会话已核验其 d.ts），安装前走 `checkpoint:human-verify`；若用户偏好更保守，改钉 `8.15.x`，但需重新核验 API（本文件不保证）。

---

## Environment Availability

| Dependency | Required By | Available | Version | Fallback |
|------------|-------------|-----------|---------|----------|
| Node.js | Vite / Vitest / scripts | ✓ | `v24.21.0` | — |
| pnpm | 包管理 / scripts | ✓ | `12.5.1` | npm 11.19.0 |
| Vite | `pnpm dev` / bundling | ✓ | `8.3.4`（`package.json`） | `vite preview` / `npx vite` |
| Vitest | 纯逻辑 + 集成测试 | ✓ | `5.0.4`（实测） | — |
| Chrome | 唯一目标浏览器 / 手动 UAT | ✓ | `155.0.8059.85` | 无（Chrome-only 是硬约束） |
| `pixi.js` | 渲染 | ✗（未安装；registry 可安装） | 目标 `8.22.0` | 无——必须安装；走 `checkpoint:human-verify` |
| `@dimforge/rapier2d-compat` | demo / 集成测试 | ✓ | `0.21.0`（钉死） | — |
| WebGL2 | Pixi `preference:'webgl'` | 未探测（需在 Chrome 里手动确认） | — | 若不可用，Pixi 会失败；Chrome 桌面默认可用 |
| GPU / 驱动 | 渲染 | 未探测 | — | 软件渲染（SwiftShader）可能极慢，但不崩；D-01 已放宽帧率 |
| `pnpm-lock.yaml` | 可复现安装 | ✓ | 存在 | — |

**Missing dependencies with no fallback:**
- `pixi.js` —— Wave 0 必须安装；这是本阶段唯一的阻塞依赖。安装前有 `checkpoint:human-verify`（SUS 标记）。

**Missing dependencies with fallback:**
- 无（Chrome 是硬约束；WebGL 不可用属于环境故障，不是可降级项）。

> **本会话无法验证的事项：** 实际 WebGL 上下文创建、GPU 驱动、Chrome 内的帧时间/显存。这些只能在 `pnpm dev` 后由用户手动确认（§Manual UAT）。不要把它们写成已验证。

---

## Validation Architecture

> `.planning/config.json` 的 `workflow.nyquist_validation: true`，本节必须存在。

### Test Framework

| Property | Value |
|----------|-------|
| Framework | **Vitest 5.0.4**（实测；`package.json:26`） |
| Config file | `vitest.config.ts`（`environment: 'node'`、`include: ['tests/**/*.test.ts']`、`@` → `src`） |
| Quick run command | `pnpm vitest run tests/render` |
| Full suite command | `pnpm test` + `pnpm typecheck` + `pnpm lint` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|--------------|
| REND-01 | PixiJS 顶视渲染 / canvas 1920×1080 / 逐帧 render | contract + manual | `pnpm vitest run tests/render/types.test.ts`；Chrome 手动：canvas `width=1920,height=1080`，画面非空 | ❌ Wave 0/1 |
| REND-02 | 单位/武器/防具/阵营可辨 | unit（数据选择）+ manual（形状） | `pnpm vitest run tests/render/visual-spec.test.ts`：7 职业 → 武器/防具映射；全 6 武器 / 2 防具出现在职业表中；阵营色解析 | ❌ Wave 2 |
| REND-03 | HP / 等级 / 阵营 HUD | unit | `pnpm vitest run tests/render/hud-model.test.ts tests/render/calendar.test.ts`：血量比、15×fps 显隐、少于 6 个时常亮、混合缩放、历法边界 | ❌ Wave 2 |
| REND-04 | 自动镜头 ≥90% / 平滑 / 全景 | unit | `pnpm vitest run tests/render/camera-math.test.ts`：n=1/2/16/100 + 离群点；拟合后 ≥90% 投影在视口内；切换无瞬移；全景四角在视口内 | ❌ Wave 2 |
| REND-05（D-01 放宽） | Chrome 能跑、不崩、逐帧推进、canvas 可取 | integration + manual | `pnpm vitest run tests/render/frame-model.test.ts`（裁剪）+ `tests/demo/runner.test.ts`（fake timers：暂停/单步/延时/重置）+ Chrome 手动 16/32 单位 | ❌ Wave 2/4 |
| （旁路） | 伤害/死亡事件正确 | unit + integration | `pnpm vitest run tests/render/damage-tap.test.ts`（fake inner/physics）+ `tests/demo/composition.test.ts`（真实 Rapier） | ❌ Wave 2/4 |

### Round 1 vs Round 2（类型门禁的边界）

**Round 1 允许：**
- `src/render/types.ts`（仅声明：枚举 + 接口 + 类型别名 + 配置形状）。
- `tests/render/types.test.ts`（枚举钉版 + `expectTypeOf`）。
- 安装 `pixi.js`（Wave 0；因为 `types.ts` 的 `import type { Container }` 需要它做 typecheck）。

**Round 1 不允许：**
- 任何 class / 函数 / 顶层 `const` / Pixi 运行时导入。
- `src/render/constants.ts`、`Camera.ts`、`Renderer.ts`、`Hud.ts`、`UnitView.ts`、`DamageTap.ts`。
- `index.html` / `src/main.ts` / `dev` script（Round 2）。
- 修改任何 Phase 1–4 文件。

### Sampling Rate

- **Per task commit:** `pnpm typecheck` + `pnpm vitest run tests/render`（若该任务只改纯模块）；纯文档任务可只跑 typecheck。
- **Per wave merge:** `pnpm test` + `pnpm lint`。
- **Phase gate:** `pnpm typecheck` + `pnpm test` + `pnpm lint` 全绿；Chrome 手动 UAT 全表通过；`/gsd-verify-work`。

### Wave 0 Gaps

- [ ] `tests/render/` 目录 + `tests/render/fakes.ts`（fake `IUnit` / `IUnitState` / `IDamageSink` / `IPhysicsWorld` 窄实现）。
- [ ] `pixi.js@8.22.0` 安装（`checkpoint:human-verify`）。
- [ ] `tests/render/types.test.ts`（Round 1 的唯一测试）。
- [ ] `tests/demo/`（Round 2：runner + composition）。
- [ ] `package.json` 的 `dev` / `build` script（Round 2）。
- [ ] 不修改 `vitest.config.ts` / `tsconfig.json`（现有配置已覆盖 `tests/**` 与 `@` 别名）。

### Manual UAT Checklist（Chrome 155，`pnpm dev` → http://localhost:8074）

> 渲染类需求无法在 Node/Vitest 里自动验证；以下清单是 REND-01/02/03/05 的验收证据。建议截图/录屏存档到阶段验证记录。

1. **REND-01**：页面加载无 console 错误；`document.querySelector('canvas').width === 1920`、`height === 1080`；画面 16:9 居中，窗口缩放时 CSS 等比缩放、不改变 backing store。
2. **REND-02（阵营）**：16 个单位分属赤/蓝两色，本体颜色高饱和、地图暗底低饱和。
3. **REND-02（装备）**：默认可辨 Longsword / Shortsword / Axe / Bow / Spear；`?classes=all` 时可辨 Hammer 与 Helmet/Shield（若 OQ-2 批准）。
4. **REND-03（血条）**：受击后血条出现，并在 `15 × outputFps` 个**输出帧**后消失（按帧计，不按 wall-clock）；场上单位少于 6 个时（如 `SCENARIO_MINIMAL` 或大量死亡后）血条常亮。
5. **REND-03（等级）**：等级数字常亮、始终直立（单位旋转时文字不转）；镜头拉近/拉远时数字随世界缩放。
6. **REND-03（混合缩放）**：近景血条屏幕恒定（不随 zoom 变大）；拉远到阈值以下平滑变为世界尺寸，无跳变。
7. **REND-03（信息条）**：左上角只显示“第 x 年 x 月 x 日 HH:MM / N×”；时间随 tick 前进；战斗时 N=1，和平 N=24。
8. **REND-04（拟合）**：战斗特写中至少 90% 参战单位在画面内（可暂停逐帧数）；镜头中心贴近战斗区；没有瞬移。
9. **REND-04（切换）**：战斗中强制切到全景再切回（面板按钮）；过渡平滑；战斗结束后回到全景；无跳变。
10. **REND-04（全景）**：全景只画地图 + 军队箭头（朝向/人数）+ 城池标志（规模/阵营），**不画单位**。
11. **REND-05（稳定性）**：连续跑 200+ 帧不崩；暂停后画面静止；单步恰好推进一帧；重置后世界从初始状态重新开始；canvas 可取（`getCanvas()` 非空）。
12. **D-06（反馈）**：受击闪白、大伤害（≥50）出现上飘数字、火花/粒子、死亡碎裂/淡出、轻微震动；同屏特效不超过上限。
13. **D-12（面板）**：暂停/继续、单步、重置、镜头模式、每帧延时、MoveTo/Garrison/Hold 均可用；面板**不在 canvas 内**（截图 canvas 不含面板）。
14. **性能观察**：16 单位 / 32 单位时无明显卡死；`setTimeout` 速度滑块有效；不要求 60fps（D-01）。

---

## Security Domain

> `workflow.security_enforcement: true`、`security_asvs_level: 1`（`.planning/config.json`）。本阶段是本地单页 demo，无网络、无认证、无持久化；但仍按 ASVS L1 检查输入验证与输出编码。

### Applicable ASVS Categories

| ASVS Category | Applies | Standard Control |
|---------------|---------|------------------|
| V1 Encoding / Injection | yes（轻） | 面板中的势力/军队名用 `textContent`，**禁止** `innerHTML`；Pixi `Text` 走 canvas，不解析 HTML |
| V2 Authentication | no | 本地单用户 demo，无认证 |
| V3 Session Management | no | 无会话/cookie |
| V4 Access Control | no | 无多用户/权限 |
| V5 Input Validation | **yes** | `validateRenderConfig`（宽高正整数、outputFps 有限正数、阈值有序、颜色 24-bit）；面板数字输入 `Number.isFinite` + 钳制（`frameDelayMs` 0–1000）；canvas 点击坐标有限；`issueOrder` 已由 `KingdomWorld` 校验（`:558-614`） |
| V6 Cryptography | no | 无加密/密钥 |
| V7 Error Handling / Logging | yes（轻） | runner 的 `try/catch` 暂停并显示错误；不把异常对象/内部状态写入视频；`console.error` 只用于开发 |
| V8 Data Protection | no | 无 PII/敏感数据 |
| V9 Communications | no | 无网络请求（零外部素材） |
| V10 Malicious Code | yes（轻） | 不导入 `pixi.js/unsafe-eval`；不使用 `eval`/`new Function`；`setTimeout` 只传函数，不传字符串 |
| V11 Business Logic | no | 无交易/权限逻辑 |
| V12 Files / Resources | no | 无文件上传/下载 |
| V13 API / Web Service | no | 无 API |
| V14 Configuration | yes（轻） | 无 secrets；`DEFAULT_RENDER_CONFIG` 是代码常量，不从 URL/存储读取任意配置（`?classes=all` 只切换场景变体，不解析任意字段） |

### Known Threat Patterns for {PixiJS + local demo}

| Pattern | STRIDE | Standard Mitigation |
|---------|--------|---------------------|
| 面板/场景名 XSS（若用 `innerHTML`） | Tampering / XSS | 一律 `textContent`；名称来自代码内场景表，不接受用户文本 |
| 配置 DoS（巨大 width/height、负数 outputFps、极端 frameDelay） | Denial of Service | `validateRenderConfig` 拒绝非有限/非正/超上限；`frameDelayMs` 钳制 0–1000 |
| 恶意/畸形 `issueOrder`（面板输入的 NaN/越界坐标） | Tampering | 面板先 `Number.isFinite`；`KingdomWorld.issueOrder` 再做完整校验（`:558-614`） |
| WebGL 上下文丢失 / 驱动崩溃 | Denial of Service | Chrome-only；D-01 不要求持续运行；可选监听 `webglcontextlost` 并暂停 + 提示（非必须） |
| 通过 `pixi.js/unsafe-eval` 引入动态代码 | Elevation | 不导入该扩展；默认 bundle 不含 |
| 依赖供应链（新增包） | Tampering | 只加 `pixi.js`，精确钉版 + legitimacy 检查 + `checkpoint:human-verify`；锁文件提交 |

**本阶段明确不做：** 认证、授权、CSP（Vite dev 的内联脚本会冲突）、TLS、持久化、外部资源加载。

---

## Sources

### Primary (HIGH confidence)

- **仓库源码（本会话 `Read` 逐字核对）**
  - `src/kingdom/types.ts`（`IWorld`/`IBattle`/`IBattleSystem`/`ITimeSystem`/`IArmy`/`ICity`/`IFaction`/`IVec2`）
  - `src/control/types.ts`（`IUnitCatalog`/`IDamageContext`/`IDamageSink`/`IControlSystem`/`IControlTickResult`）
  - `src/physics/types.ts`（`IUnitState`/`IDamageEvent`/`IPhysicsWorld`/`ColliderPart`）
  - `src/units/types.ts`（`IUnit`/`AttributeKind`/`ClassKind`/`WeaponKind`/`ArmorKind`/`IEquipment`）
  - `src/units/data.ts:57-306`（`CLASS_DEFS` 的初始装备：6 武器 / 2 防具的来源）
  - `src/physics/constants.ts`（`DT`、`DEFAULT_GEOMETRY`）
  - `src/physics/PhysicsWorld.ts:130-147,258-273`（武器 capsule、`getUnitState`）
  - `src/control/ControlSystem.ts:224-306`（tick 顺序、伤害路由、死亡注销）
  - `src/kingdom/DamageSink.ts:48-100`（战斗规则过滤）
  - `src/kingdom/KingdomWorld.ts:264-292,540-614,841-855,1834-1866,1944-1981`
  - `src/kingdom/BattleSystem.ts:377-392`（成员剪枝）
  - `src/kingdom/scenario.ts:278-357`（`DEFAULT_SCENARIO`）
  - `src/kingdom/TimeSystem.ts:17-23`（初始 24×）
  - `tests/kingdom/harness.ts:140-192`（组合根顺序）
  - `package.json`、`vite.config.ts`、`vitest.config.ts`、`tsconfig.json`、`eslint.config.js`、`.prettierrc`
- **PixiJS 8.22.0 d.ts（本会话安装后读取）**
  - `node_modules/pixi.js/lib/app/Application.d.ts:107,158,240-249,268`
  - `node_modules/pixi.js/lib/app/TickerPlugin.d.ts:55`
  - `node_modules/pixi.js/lib/rendering/renderers/types.d.ts:14`
  - `node_modules/pixi.js/lib/rendering/renderers/gl/context/GlContextSystem.d.ts:14-48`
  - `node_modules/pixi.js/lib/rendering/renderers/gl/WebGLRenderer.d.ts:33-40`
  - `node_modules/pixi.js/lib/rendering/renderers/shared/extract/ExtractSystem.d.ts:545`
  - `node_modules/pixi.js/lib/scene/graphics/shared/Graphics.d.ts:90,354,406,714,878,945`
  - `node_modules/pixi.js/lib/scene/container/Container.d.ts:959,1247,1268`
  - `node_modules/pixi.js/lib/scene/text/Text.d.ts:163`；`scene/text/AbstractText.d.ts:110,136`
- **官方文档（PixiJS）**
  - https://pixijs.com/8.x/guides/components/application
  - https://pixijs.com/8.x/guides/components/renderers
  - https://pixijs.com/8.x/guides/concepts/render-loop
  - https://pixijs.com/8.x/guides/concepts/performance-tips
  - https://pixijs.com/8.x/guides/components/scene-objects/graphics
  - https://pixijs.com/8.x/guides/components/scene-objects/text
  - https://pixijs.com/8.x/guides/migrations/v8
  - https://pixijs.com/8.x/guides/getting-started/quick-start
  - https://pixijs.download/release/docs/rendering.ExtractSystem.html
  - https://pixijs.download/release/docs/app.Application.html
- **Rapier 2D**
  - `node_modules/@dimforge/rapier2d-compat/dist/geometry/collider.d.ts:685`（capsule 长轴 y）
  - `node_modules/@dimforge/rapier2d-compat/package.json`（compat = WASM base64 内联）

### Secondary (MEDIUM confidence)

- **npm registry**：`pixi.js` 8.22.0 / dist-tags / 依赖表 / `time.created` / `weeklyDownloads`（`npm view`，本会话）
- **MDN**：`setTimeout` 的 4ms 嵌套钳制与后台节流（https://developer.mozilla.org/en-US/docs/Web/API/Window/setTimeout）
- **项目规格**：`.planning/reference/ai-marble-kingdom.md`（经 CONTEXT 引用；本会话未逐节重读）
- **CONTEXT.md**：所有 D-01..D-20 决策与 Research Flags（权威用户决策）

### Tertiary (LOW confidence)

- 本文件所有 `[ASSUMED]` 设计默认值（A1–A16）：调色板、HUD 尺寸/阈值、镜头平滑帧数、粒子上限、默认 outputFps/frameDelay、武器/防具具体造型、demo 场景变体。
- 未在 Chrome 内实际验证的 WebGL/GPU/帧时间行为。

---

## Metadata

**Confidence breakdown:**
- **Standard stack（Pixi 8.22.0 + Vite 8 + Vitest 5）：HIGH** —— 版本来自 npm registry；API 来自官方文档 + 已安装 d.ts；Vite/Vitest 配置与基线测试本会话跑过。
- **Upstream contracts / 伤害时序 / 死亡位置：HIGH** —— 逐字读源码；`ControlSystem` 的注销顺序是硬事实。
- **Architecture（只读渲染、装饰器、纯数学 + 薄适配、视图工厂、手动循环）：HIGH/MEDIUM** —— 方向由 D-16..D-19 锁定；具体接口形状待门禁。
- **Contract shape（`src/render/types.ts`）：MEDIUM** —— 设计提案，需要用户批准 6 个 Gate。
- **Camera/HUD algorithms：MEDIUM** —— 数学保证（≥90%）可证明；具体阈值/手感是 `[ASSUMED]`，需截图校准。
- **Pitfalls：HIGH** —— 来自官方迁移/性能文档 + 源码时序 + 本会话的 API 核验。
- **Performance：LOW（有意）** —— D-01 已放宽；本会话无法在 Chrome 里测帧时间，不做任何帧率承诺。

**Research date:** 2026-10-21
**Valid until:** 30 天（PixiJS 8.x 若在期间发新版，安装前重新核对 d.ts；其余契约冻结）
