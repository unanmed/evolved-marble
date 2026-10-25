---
phase: 05-render-system
plan: 10
status: accepted
verdict: 本阶段的基本目标已经完成
created: 2026-10-25
environment:
    browser: 'Microsoft Edge 155.0.4283.62 (Chromium)'
    target_browser: 'Chrome-only (PROJECT.md)；Edge 为 Chromium 内核，按 Chromium 结果记录'
    os: 'Windows 11'
    server: 'pnpm dev (Vite)'
    url: 'http://localhost:8074'
    canvas: '1920×1080 backing store, CSS 等比缩放居中（D-13）'
    renderer: 'PixiJS 8.22.0 (WebGL)'
scenarios:
    - id: default
      label: '默认场景 DEFAULT_SCENARIO（2 势力 × 8 单位 = 16 单位、2 城、4 块地形）'
    - id: classes=all
      label: 'D-22 变体 `?classes=all`（每军 +1 Hammer +1 Knight = 20 单位）'
gates:
    pnpm_test: '46 files / 534 tests passed'
    pnpm_typecheck: 'clean (exit 0)'
    pnpm_lint: '0 errors, 2 pre-existing no-console warnings in src/main.ts'
    pnpm_build: 'vite build ok'
---

# Phase 5 — Chrome 手动 UAT 记录

本文件是 REND-01..REND-05 的**人工观察证据**，对应 `05-VALIDATION.md` § Manual-Only Verifications
（Pixi/WebGL 行为在 Vitest `node` 环境下无法自动验证）。每一行都给出**观察到的现象**，
而不只是结论；凡是被自动化测试钉死的数值规则，在 `Evidence` 列注明「operator + <测试>」，
表示规则由测试保证、目视只验证它「看起来对」。

> 环境说明：项目只支持 Chrome（PROJECT.md）。实际验收环境是 **Microsoft Edge 155（Chromium）**，
> 与 Chrome 同内核，本节所有结果按其 Chromium 行为记录；未在 Google Chrome 品牌版本上重复执行。

---

## 1. 验收环境

| 项 | 值 |
| --- | --- |
| 浏览器 | Microsoft Edge 155.0.4283.62（Chromium），目标平台为 Chrome |
| 操作系统 | Windows 11 |
| 服务 | `pnpm dev`（Vite），`http://localhost:8074` |
| 画布 | `1920×1080` 背部缓冲，页面内 CSS 等比缩放居中（D-13） |
| 渲染后端 | PixiJS 8.22.0 / WebGL |
| 场景 | 默认 `DEFAULT_SCENARIO`；`?classes=all` 变体（D-22） |
| 帧率口径 | **不设 fps 目标、未测量、未记录任何 fps 数字**（D-01） |

**D-01 验收口径（锁定）**：Chrome 下能运行、不崩溃、能逐帧推进并输出 canvas；
性能只做基本优化（共享几何、视口裁剪、特效池上限）。任何 fps 数值都不是、也不会成为本阶段的验收条件。

---

## 2. 验收轮次（观察 → 修复 → 复审）

人工验收经过多轮：第一轮结论「大体还可以」并列出问题；每轮修复后重新观看；
最终结论「比之前好多了……本阶段的基本目标已经完成，这些优化后续再进行」。

| 轮次 | 操作者反馈 | 对应缺口计划 |
| --- | --- | --- |
| R1 | 大体还可以；列出手感与可看性问题 | — |
| R2 | 受击震动影响观看；近战僵持（被围单位不再掉血，攻击者一直贴着）；入场过渡太长；单位太小 | 05-11、05-12 |
| R3 | 缺失操作者比例尺读数 | 05-13 |
| R4 | 接敌后战斗立刻「结束」；低血撤退导致打不完 | 05-14 |
| R5 | 战斗中镜头过跳；战斗结束回全景绕地图中心 | 05-15 |
| R6 | 入场编排（先看战场再推近） | 05-16、05-17 |
| R7 | 战斗节奏太慢 | 05-18 |
| R8 | 全景军队箭头方向与行军不一致 | 05-19 |
| R9 | 空军队残留「0」与幽灵箭头 | 05-20 |
| R10 | 战斗刚结束立刻跳 24× | 05-21 |
| R11 | 接受：「比之前好多了……本阶段的基本目标已经完成，这些优化后续再进行」 | — |

---

## 3. 逐项结果

### 3.1 REND-01 画布与页面

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-01 | REND-01 / D-13 | default | 背部缓冲 `width=1920`、`height=1080` | `renderer.getCanvas()` 非空；`canvas.width` 为 1920、`canvas.height` 为 1080，页面中按 `1920:1080` 等比居中显示 | operator + `tests/render/*` | pass |
| V-02 | REND-01 / D-13 | default | 16:9 letterbox、不变形 | 改变窗口大小时画面保持 16:9，上下（或左右）出现留白，地图仍是正方形、单位不被拉伸 | operator | pass |
| V-03 | REND-01 | default | 加载时控制台无 error | 加载与运行全过程 DevTools 无 error；仅 `src/main.ts` 两条既有 `console` 调试输出（lint 已记为 warning） | operator | pass |
| V-04 | REND-01 / D-18 | default | canvas 持续存在 200+ 帧 | 连续推进远超 200 帧，canvas 元素始终挂载、无 WebGL context lost、无白屏 | operator | pass |

### 3.2 REND-02 单位/武器/防具/阵营可辨

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-05 | REND-02 / D-04 | default | 2 个势力颜色可辨 | 赤方 `0xd0342c` 与蓝方 `0x2f6fe0` 本体填充色在暗底低饱和地图上对比强烈，混战中仍能一眼分辨阵营 | operator | pass |
| V-06 | REND-02 / D-04 | default | 5 种默认武器轮廓可辨 | 默认场景实际出现的 5 种武器（Longsword / Shortsword / Axe / Bow / Spear）形状各不相同：剑为长条、短剑更短、斧有刃口、弓为弧、矛细长 | operator | pass |
| V-07 | REND-02 / D-04 / D-22 | `?classes=all` | 6 种武器全部可辨 | 加 `?classes=all` 后第 6 种武器 Hammer（厚锤头）出现，与其余 5 种并列时可区分；这补齐了 6/6 | operator | pass |
| V-08 | REND-02 / D-04 | default + `?classes=all` | Helmet / Shield 两种防具可辨 | 两种防具在默认场景中已经出现（Swordsman 持盾、Archer 戴盔），`?classes=all` 下依然可辨：盾为前置弧块、盔为头部环 | operator | pass |
| V-09 | REND-02 / D-05 | default | 暗底高饱和，单位最跳 | 背景/地面/网格/地形保持低饱和墨色，单位本体与特效是画面中最亮的元素 | operator | pass |
| V-10 | REND-02 / D-03 | default | 程序化几何、无美术素材 | 全部单位、武器、防具、城池、地形均为代码绘制的几何图形，无贴图资源加载 | operator | pass |

### 3.3 REND-03 HUD

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-11 | REND-03 / D-07 | default | 受击后血条出现，`15 × outputFps` 输出帧后消失 | 受击后血条立刻出现并以阵营色填充；30 输出帧率下约 15 秒输出时间后消失（450 输出帧的精确计数由 HUD 模型测试钉死，目视确认的是「持续足够久、然后消失」） | operator + `tests/render/hud-model.test.ts` | pass |
| V-12 | REND-03 / D-07 | default（战至 <6 单位） | 存活单位 <6 时血条常亮 | 战斗减员到 6 个以下时，剩余单位血条不再消失、一直可见；超过阈值后又回到「受击才显示」 | operator + `tests/render/hud-model.test.ts` | pass |
| V-13 | REND-03 / D-08 / D-23 | default | 等级数字立于本体中心、不随单位旋转、永远世界缩放 | 等级数字画在本体中心，单位转身时数字不旋转；镜头推近/拉远时数字随视角一起缩放（非屏幕恒定） | operator | pass |
| V-14 | REND-03 / D-09 | default | 血条混合缩放：近景屏幕恒定、远景世界尺寸、平滑过渡 | 推近时血条保持稳定的屏幕像素宽度（密集处不糊成一片）；拉远后血条变成世界尺寸随单位一起缩小；切换过程连续、无跳变 | operator + `tests/render/hud-model.test.ts` | pass |
| V-15 | REND-03 / D-11 | default | 左上信息条只显示时间 + 速度 | 信息条只有 `第 Y 年 M 月 D 日 HH:MM / N×`，没有势力图例、没有战况统计、没有击杀数 | operator | pass |
| V-16 | REND-03 / D-11 / D-17 | default | 战斗中 1×、和平 24× | 战斗进行时显示 `1×` 且日期推进缓慢；无战斗时显示 `24×`，日期明显加速 | operator | pass |

### 3.4 REND-04 自动镜头

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-17 | REND-04 / D-15 | default | 无人为指令时也能自己打起来 | 开场不做任何操作，两军按组合根的初始 `MoveTo` 相对行军并自行接敌，镜头随之进入战斗 | operator | pass |
| V-18 | REND-04 / D-14 / D-21 | default | 战斗中 ≥90% 参战单位在画面内 | 战斗中暂停并逐一核对：所有参战单位都在画面内且四周留有余量（≥90% 由 `cameraMath` 的 90 百分位拟合盒保证，目视无出框） | operator + `tests/render/camera-math.test.ts` | pass |
| V-19 | REND-04 / D-21 | default | 战斗/全景切换平滑、禁止瞬移 | 切战斗 → 全景 → 再切回，全程连续推拉平移，没有任何一帧跳跃 | operator + `tests/render/camera.test.ts` | pass |
| V-20 | REND-04 / D-12 / D-14 | default（战斗进行中） | 按 `全景` 后即使战斗仍在也保持全景（自动跟拍关闭） | 战斗中按 `全景`：镜头停留在全景，战斗继续进行但镜头不再被拉回；面板状态显示「手动镜头」 | operator | pass |
| V-21 | REND-04 / D-12 / REND-04 | default（同上状态） | 按 `自动` 或 `战斗` 恢复跟拍且不瞬移 | 按 `自动` / `战斗` 后镜头以过渡方式回到战斗特写，不是瞬移；面板状态回到「自动跟拍」 | operator | pass |
| V-22 | REND-04 / D-14 | default | 战斗结束后自动回到全景 | 战斗结束后镜头回到全景构图（回程为单段同时缩放+平移，不绕地图中心） | operator | pass |
| V-23 | REND-04 / D-14 | default | 全景不画单位 | 全景下画面中没有任何单位本体/武器/血条；只有地图、地形、军队箭头与城池标志 | operator | pass |

### 3.5 全景标记与操作者读数

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-24 | D-14 | default | 军队 = 阵营色箭头（朝向）+ 实力（人数） | 每支军队是一个阵营色箭头，箭头尖端指向**实际行进方向**（含边界反弹后的方向）；旁边标出人数 | operator | pass |
| V-25 | D-14 | default | 城池 = 阵营色标志 + 规模 | 主城比普通城明显更大，两者都带阵营色，可区分 `Capital` / `Normal` | operator | pass |
| V-26 | 05-20 | default（长期运行） | 0 单位的军队不显示为幽灵箭头 / `0` | 军队打光后，全景箭头、人数、视野圈以及操作台军队下拉列表里都不再出现该军队，不再有飘着的「0」；`KingdomWorld` 内部仍保留该军队对象（D-05 身份保留） | operator + `tests/kingdom/*` | pass |
| V-27 | 05-13 / D-12 | default | 操作台有比例尺读数（视频中永不出现） | 操作台上显示 `比例尺 100 m ≈ N px · 网格 100 m · 1 m = N.NN px`，随镜头缩放实时变化，每 250 ms 刷新一次 | operator | pass |

### 3.6 REND-05 / D-01 运行与稳定性（不设 fps 目标）

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-28 | REND-05 / D-01 | default + `?classes=all` | 200+ 帧不崩溃 | 默认场景与 20 单位变体都连续推进远超 200 帧，无崩溃、无卡死、无异常弹窗 | operator | pass |
| V-29 | REND-05 / D-01 | default | 不设、不测、不记录 fps 目标 | 全程未使用任何 fps 计数工具，记录中也不存在 fps 数字；验收只看「能不能跑、能不能逐帧推进、canvas 是否可拿」 | operator | pass |
| V-30 | REND-05 / D-01 | default | `renderer.getCanvas()` 可访问 | `getCanvas()` 返回非空 canvas 元素，可直接 `toDataURL` 取图 | operator | pass |
| V-31 | REND-05 / D-18 | default | 暂停保持当前帧 | 按 `暂停` 后画面完全静止（日期不再走、单位不再动），反复观察无推进 | operator + `tests/demo/runner.test.ts` | pass |
| V-32 | REND-05 / D-17 / D-18 | default | 单步恰好推进 1 帧 | 暂停状态下按 `单步`，日期只前进一个 tick 对应的分钟数，画面只动一小步，不会连续跑 | operator + `tests/demo/runner.test.ts` | pass |
| V-33 | D-12 / D-16 | default | 重置得到全新世界并重新行军 | 按 `重置` 后回到开场全景、单位满血、两军重新行军；循环保持暂停语义，不会自动开跑 | operator | pass |

### 3.7 D-06 战斗反馈

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-34 | D-06 | default | 受击闪白 | 命中瞬间被击中方本体闪白数帧后恢复本色 | operator | pass |
| V-35 | D-10 | default | 伤害数字仅 ≥50 显示 | 只有重击（≥50）才飘出数字并上浮淡出；轻击只有闪白与火花，不刷数字 | operator + `tests/render/hud-model.test.ts` | pass |
| V-36 | D-06 | default | 火花/粒子 | 每次命中在接触点喷出少量火花粒子并很快消散，不堆积成糊 | operator | pass |
| V-37 | D-06 | default | 死亡碎裂/淡出 | 单位死亡时在最后位置播放碎裂/淡出效果后消失，不是瞬间凭空不见了 | operator | pass |
| V-38 | D-06 / 05-12 | default | 受击震动「轻微」 | **R2 反馈：震动让人看不清** → 已按 `shakeAmplitudePx = 0` 关闭；R11 复审确认画面稳定、可读性提升（代码路径保留，改回一个常量即可恢复） | operator | accepted deviation（见 §5.1 A-1） |

### 3.8 D-12 / D-24 操作台

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-39 | D-12 | default | 操作台在 canvas 之外，视频中永不出现 | 操作台是 canvas 之外的 HTML 覆盖层；只截 canvas 元素时截图里没有任何 panel 像素，按钮/文字/滑杆均未进入画面 | operator | pass |
| V-40 | D-12 | default | 暂停/继续、单步、重置可用 | 三个按钮行为与 V-31/V-32/V-33 一致，按钮文案在「暂停 ↔ 继续」间正确切换 | operator | pass |
| V-41 | D-12 | default | 镜头模式（战斗/全景/自动）+ 自动跟拍联动 | 三个模式按钮都能切到对应构图；`全景` 会同时关闭自动跟拍，`自动`/`战斗` 会重新开启 | operator | pass |
| V-42 | D-12 / D-17 | default | 每帧延时滑杆生效 | 拖动滑杆后推进速度立刻变化（数值小 = 更快），暂停状态下修改不会自行开跑 | operator | pass |
| V-43 | D-24 | default | 选中军队 → `MoveTo` → 点画布选点 | 选中军队后按 `MoveTo`，按钮提示「点击画布选点」，点击画布任意处后该军队转向新目标行军；拾取使用 `screenToWorld` 且排除镜头震动 | operator + `tests/demo/*` | pass |
| V-44 | D-12 | default | `Garrison` / `Hold` 可用 | 从城池列表 `Garrison` 后目标军队开向该城；`Hold` 后军队原地停下，不再行军 | operator | pass |

### 3.9 战斗质量（R2–R10 反馈的复审）

| ID | 需求/决策 | 场景 | 期望 | 观察到的现象 | Evidence | 结论 |
| --- | --- | --- | --- | --- | --- | --- |
| V-45 | 05-11 | default | 近战僵持能自己打破 | R2 现象「被围单位不再掉血、攻击者一直贴着」消失：单位在推进受阻后会后撤再冲，接触持续产生新的高 Δv 命中，血条持续下降 | operator + `tests/control/stalemate.test.ts` | pass |
| V-46 | 05-14 | default | 接敌后战斗不立刻「结束」 | R4 现象「刚接触就结束、双方都还活着」消失：两军接敌后长时间持续交战，双方阵营都留在战斗内 | operator + `tests/kingdom/battle.test.ts` | pass |
| V-47 | 05-14 | default | 没有低血撤退导致的打不完 | 单位不会因低血逃跑把胜负拖成无解；战斗以歼灭结束 | operator + `tests/control/default-ai.test.ts` | pass |
| V-48 | 05-18 | default | 战斗节奏够快 | R7 反馈「节奏太慢」消失：加速与冲锋速度提升后，接敌更快、撞击更实、僵持-脱离-再冲的循环更紧 | operator + `tests/control/default-ai.test.ts` | pass |
| V-49 | 05-15 | default | 战斗扩大时镜头不跳 | R5 反馈「镜头太跳」消失：镜头平滑按参战等级总量加权跟随大战斗，但仍是平滑收敛、不瞬移 | operator + `tests/render/camera.test.ts` | pass |
| V-50 | 05-16 / 05-17 | default | 入场编排：先看战场，再推近 | 接敌瞬间画面**冻结 24 输出帧（0.8 s）**并停在**全景**（整张地图 + 军队/城池标记、不画单位、无 HUD），让观者先看清战斗发生在哪；随后用 **6 帧（0.2 s）** 推近到战斗特写 | operator + `tests/demo/runner.test.ts` | pass |
| V-51 | 05-21 | default | 战斗结束后不立刻跳到 24× | R10 反馈消失：战斗结束后仍以 **1×** 停留可读的战果（90 帧余韵），再用 24 帧单段拉回全景，合计 114 帧之后才恢复 24× 和平速度 | operator + `tests/demo/runner.test.ts` | pass |
| V-52 | 05-12 | default | 单位在密集混战中足够大 | R2 反馈「单位太小」消失：`minSpanMeters` 收紧后紧凑战斗中单位本体约 83 px，动作细节看得清 | operator | pass |
| V-53 | 05-12 | default | 镜头过渡不过长 | R2 反馈「过渡太长」消失：入场 0.2 s 推近、退场 0.8 s 单段拉回，观感干净 | operator | pass |

---

## 4. 校准（全部改动都在唯一的调参入口内）

规则：只改 `DEFAULT_RENDER_CONFIG`（`src/render/constants.ts`）或已声明的常量；
被锁定的规则（`healthBarSeconds` 15、`alwaysVisibleBelowUnits` 6、`damageNumberThreshold` 50、
`coverage` 0.9、`screenScaleAt > worldScaleAt`）**从未改动**，也没有任何测试为迁就新数值被削弱。

| 常量 | 旧值 → 新值 | 原因（来自哪一轮观察） | 位置 |
| --- | --- | --- | --- |
| `camera.shakeAmplitudePx` | 8 → **0** | R2：受击震动让人看不清战斗 → 直接关闭，代码路径保留 | `src/render/constants.ts` |
| `camera.minSpanMeters` | 24 → **12** | R2：单位看起来太小 → 紧凑战斗的拟合跨度减半 | `src/render/constants.ts` |
| `camera.panFrames` | `switchFrames`（无分段）→ **24** | R2/R5：过渡太长、回程绕中心 → 拆成「退场 24 帧」 | `src/render/constants.ts` |
| `camera.zoomFrames` | 新增 → **6** | R6：入场推近要短促（0.2 s） | `src/render/constants.ts` |
| `camera.weightScale` | 新增 → **20** | R5：战斗变大时镜头太跳 → 按参战等级总量加权收敛 | `src/render/constants.ts` |
| `DEFAULT_AI_LINEAR_GAIN` | 4 → **8** | R7：战斗节奏太慢 → 加速到目标速度的时间减半 | `src/control/constants.ts` |
| `DEFAULT_AI_ATTACK_SPEED` | 12 → **16** | R7：撞击不够实（伤害 ∝ √Δv） | `src/control/constants.ts` |
| `DEFAULT_AI_APPROACH_SPEED` | 6 → **8** | R7：接敌太慢 | `src/control/constants.ts` |
| `DEFAULT_AI_DISENGAGE_SPEED` | 8 → **10** | R7：僵持-脱离-再冲循环太慢 | `src/control/constants.ts` |
| `DEFAULT_AI_STALL_*`（阈值 0.5 m/s、4 次决策、脱离 30 ticks、侧移权重 0.6） | 新增 | R2：近战僵持 → 停滞检测 + 后撤 + 再冲 | `src/control/constants.ts` |
| `DEFAULT_AI_LOW_HEALTH_RATIO` / `DEFAULT_AI_RETREAT_SPEED` | 删除 | R4：低血撤退让战斗打不完 | `src/control/constants.ts` |
| `BATTLE_END_DEBOUNCE_TICKS` | 新增 → **10** | R4：接敌即结束 → 单边结束需连续 10 个战斗 tick | `src/kingdom/constants.ts` |
| `BATTLE_ENTRY_FREEZE_FRAMES` | 新增 → **24** | R6：入场先冻结看全景（0.8 s @ 30 fps） | `src/demo/runner.ts` |
| `POST_BATTLE_HOLD_TICKS` | 新增 → **90** | R10：战后 1× 余韵（3 s @ 30 fps） | `src/kingdom/constants.ts` |
| `POST_BATTLE_PULLBACK_TICKS` | 新增 → **24** | R10：余韵后单段拉回（与 `panFrames` 对齐） | `src/kingdom/constants.ts` |

未改动、且被测试钉死的规则：`healthBarSeconds = 15`、`alwaysVisibleBelowUnits = 6`、
`damageNumberThreshold = 50`、`camera.coverage = 0.9`、`hud.screenScaleAt (20) > hud.worldScaleAt (10)`、
`outputFps = 30` / `frameDelayMs = 33`。`src/render/types.ts`（Round 1 冻结契约）在 UAT 期间
**只有 `ICameraConfig.switchFrames → panFrames + zoomFrames` 一处经用户事先批准的改动**，
其余字段未变；`src/kingdom/**`、`src/control/types.ts` 的既有契约未被破坏。

---

## 5. 偏差分类

### 5.1 已接受（Accepted）

| ID | 偏差 | 为什么接受 | 依据 |
| --- | --- | --- | --- |
| A-1 | 受击镜头震动被关闭（`shakeAmplitudePx = 0`） | D-06 要求「轻微」震动，实测「轻微」在这个画面上仍然损害可读性；关闭后战斗更清楚，且这是可调常量而非删除功能 | D-06 是 `reversible`，不违反锁定决策 |
| A-2 | 战斗以 1× 余韵 + 24 帧拉回 + 24× 收尾，而不是「结束后立即回全景」 | 观者需要时间读战果；这是观感决定，没有改变 D-14 的「战斗结束回全景」 | D-14 |
| A-3 | 入场先冻结 24 帧全景再推近，而不是直接切战斗特写 | 让观者先知道战斗在地图哪里；冻结的是**输出帧**而非墙钟，`stepOnce`/任意帧延时下行为一致 | D-14/D-17/D-21 |
| A-4 | 低血撤退移除，改为「打到底」 | 撤退让局部战斗变成追逐、可看性更差；这是 AI 内部行为，不触及控制层契约 | 05-14 |
| A-5 | 验收环境是 Microsoft Edge 155（Chromium），而非 Chrome 品牌版本 | 项目只承诺 Chrome 内核（PROJECT.md）；Edge 为同一 Chromium 内核，未使用任何 Chrome 独有 API | PROJECT.md 约束 |
| A-6 | `?classes=all` 变体保留在 demo 中 | D-22 明确允许，仅用于目视验证 6 武器 + 2 防具，不改 Phase 4 场景表 | D-22 |

### 5.2 已推迟（Deferred，映射到 CONTEXT Deferred Ideas）

用户最终结论：「这些优化后续再进行」。以下全部属于 CONTEXT § Deferred Ideas 的对应条目，
**不是**被否决的需求，也**不**改变任何锁定决策：

| ID | 推迟项 | 映射到的 Deferred Idea |
| --- | --- | --- |
| D-1 | 进一步的镜头/特效动画打磨（过渡的「电影感」、额外的命中反馈层次） | 「真实贴图/图集/动画资源 — 通过 `IUnitViewFactory` 后续替换」+「更进一步的性能优化」同类：留待后续按实际观感提出 |
| D-2 | 超出基本分区/裁剪的性能优化 | 「更进一步的性能优化（超出基本分区/裁剪）」 |
| D-3 | 战斗「激烈度」评分与自动选战斗 | 「战斗"激烈度"评分与自动选战斗」 |
| D-4 | 多场战斗顺序播放 / 时间回跳 | 「多场战斗顺序播放/时间回跳/剪辑时间线」（Phase 6） |
| D-5 | 完整调试干预（强制结束战斗、单位传送、碰撞体/射线叠加） | 「强制结束战斗、单位传送、碰撞体/射线/战斗区叠加等完整调试干预」 |
| D-6 | 伤害/击杀统计进入 HUD | 「伤害/击杀统计」（Phase 8） |

### 5.3 升级（Escalations）

**无。** 没有任何观察项与锁定决策（D-01..D-24）冲突，因此没有需要上报给用户裁决的项。

---

## 6. 质量门禁（UAT 结束后重跑）

| 门禁 | 结果 |
| --- | --- |
| `pnpm test` | 46 files / **534 tests passed** |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | 0 errors，2 条既有 `no-console` warning（`src/main.ts`，非本阶段引入） |
| `pnpm build` | `vite build` 成功 |

---

## 7. 结论

REND-01..REND-05 在 Chromium（Edge 155）上按 D-01 口径**全部满足**：
能运行、不崩溃、能逐帧推进（暂停/单步/重置）并输出 `1920×1080` canvas。
战斗观感经过 10 轮反馈修复后达到用户接受标准（「战斗必须激烈好看」）。
剩余打磨项已由用户明确推迟，记录于 §5.2，不阻塞 Phase 6。

**本记录是验收证据，不是完成信号** —— 阶段完成由外部 verify 步骤判定（T-05-51）。
