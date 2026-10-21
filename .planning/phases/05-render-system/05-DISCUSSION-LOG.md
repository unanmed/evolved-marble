# Phase 5: 渲染系统 - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-10-21
**Phase:** 5-渲染系统
**Areas discussed:** 视觉辨识与美术方向, 战斗反馈与 HUD, 自动镜头与画布构图, 接入方式与播放节奏

---

## 视觉辨识与美术方向

| Option | Description | Selected |
|--------|-------------|----------|
| 程序化几何 | PixiJS 直接画圆/环/线条/多边形，零素材 | ✓（但保留贴图替换接缝） |
| 矢量小贴图 | 为职业/武器/防具做 SVG/PNG | |
| 极简纯色 + 文字 | 只画阵营色圆 + 文字 | |

**User's choice:** 先使用程序化几何，但需要保留换成贴图的接口。
**Notes:** 后续讨论确定为 `IUnitView` + `IUnitViewFactory` 的视图工厂接缝。

| Option | Description | Selected |
|--------|-------------|----------|
| 色 + 形 + 几何 | 阵营色、职业形状/徽记、武器几何、防具环 | |
| 阵营色 + 职业文字 | 本体只用阵营色，职业用文字 | |
| 等级/状态也用颜色 | 用颜色同时编码等级/状态 | |

**User's choice:** 阵营用本体颜色区分，可配置；职业通过武器区分，不单独设计；武器/防具用不同几何形状区分。

| Option | Description | Selected |
|--------|-------------|----------|
| 暗底高饱和 | 深色战场 + 高饱和阵营色 | ✓ |
| 明亮卡通 | 浅色地图、明快配色 | |
| 写实低饱和 | 土色地形 + 金属灰 | |

**User's choice:** 暗底高饱和。

---

## 战斗反馈与 HUD

| Option | Description | Selected |
|--------|-------------|----------|
| 强反馈 + 预算上限 | 闪白、伤害数字、粒子、死亡效果、轻震屏 | ✓ |
| 中等反馈 | 闪白 + 伤害数字 + 死亡淡出 | |
| 克制反馈 | 只血条变化 + 受击闪烁 | |

**User's choice:** 强反馈；不需要实时性/可交互帧率，渲染慢一点无所谓。只做最简单实现和基本性能优化（如地图分区渲染），后续再优化。
**Notes:** 由此把 REND-05 的“可交互帧率”放宽为“能跑、不崩”。

| Option | Description | Selected |
|--------|-------------|----------|
| 世界内浮动条 | 头顶血条 + 等级 + 阵营色 | ✓（变体） |
| 浮动条 + 侧栏名单 | 世界内血条 + 屏幕侧栏完整列表 | |
| 仅侧栏名单 | 世界内不画标签 | |

**User's choice:** 头顶血条，颜色=阵营色；不显示当前/最大生命值文本，不显示单位名；等级显示在本体上且不随单位旋转；默认不显示 HUD，受击后显示 15s；总单位 <6 时常亮（阈值可调）。
**Notes:** 后续明确等级常亮、永远跟随视角缩放。

| Option | Description | Selected |
|--------|-------------|----------|
| 游戏时间 15s | 按游戏秒累计 | |
| 现实时间 15s | 按 performance.now() | |
| 渲染帧数 15s | 按固定 60fps 折算 900 帧 | ✓（变体） |

**User's choice:** 视频时长 15s，即 15 × 视频帧率 帧；帧率是可调参数。

| Option | Description | Selected |
|--------|-------------|----------|
| 极简信息条 | 游戏时间 + 速度 + 阵营图例 | |
| 完全不做屏幕 HUD | 只有单位头顶信息 | |
| 加战况概览 | 再加军队/城池/战斗数 | |

**User's choice:** 分两层：视频内极简信息条；操作者专用（视频中不出现）的丰富信息 + 可操作战局按钮。

| Option | Description | Selected |
|--------|-------------|----------|
| 简化历 360 天 | 1 年 = 12 月 × 30 天 | ✓ |
| 公历 365 天 | 真实月份/闰年 | |
| 只显示天数+小时 | 不做年月换算 | |

**User's choice:** 简化历 360 天。

| Option | Description | Selected |
|--------|-------------|----------|
| 运行控制 + 军队指令 | 暂停/单步/速度/重置/镜头模式 + MoveTo/Garrison/Hold | ✓ |
| 只做运行控制 | 不新增模拟侧接缝 | |
| 完整干预 | 强制结束战斗、传送、碰撞体/射线叠加 | |

**User's choice:** 运行控制 + 军队指令（复用 `IWorld.issueOrder`）。

| Option | Description | Selected |
|--------|-------------|----------|
| 屏幕恒定大小 | HUD 固定像素尺寸 | |
| 跟随世界尺寸 | HUD 随地图缩放 | |
| 按缩放档位切换 | 特写大 HUD、远景简化 | ✓（变体） |

**User's choice:** 缩远到一定阈值后平滑切换为世界尺寸，避免大量单位 HUD 重叠；等级永远跟随视角缩放。

| Option | Description | Selected |
|--------|-------------|----------|
| 每次命中都显示 | 所有伤害数字 | |
| 仅大伤害显示 | 超过阈值才显示 | ✓ |
| 不显示数字 | 只用闪白/粒子 | |

**User's choice:** 仅大伤害显示（阈值可调，初始 50）。

| Option | Description | Selected |
|--------|-------------|----------|
| 时间 + 速度 + 图例 | 信息较全 | |
| 只时间 + 速度 | 最简 | ✓ |
| 再加交战提示 | 增加交战中标记 | |

**User's choice:** 只时间 + 速度。

---

## 自动镜头与画布构图

| Option | Description | Selected |
|--------|-------------|----------|
| 默认 1920×1080，可配置 | 固定 16:9 内部分辨率，页面缩放 | ✓ |
| 响应式全窗口 | 跟随窗口宽高比 | |
| 固定 1920×1080 | 写死 1080p | |

**User's choice:** 默认 1920×1080，可配置。

| Option | Description | Selected |
|--------|-------------|----------|
| 导演式两态 | 战斗推近，无战斗广角 | ✓（变体） |
| 多机位轮换 | 每场战斗切换机位 | |
| 固定广角全图 | 始终全图 | |

**User's choice:** 两种视角：无战斗全景显示（地图 + 军队标志 + 城池标志，不渲染单位）；战斗时平滑拉近，中心贴战斗区，至少 90% 参战单位在画面内，否则拉远；平滑、禁止瞬移。

| Option | Description | Selected |
|--------|-------------|----------|
| 最激烈的一场 | 按参战人数 + 近期伤害评分 | |
| 按开始顺序 | 跟最早开始的战斗 | |
| 参战人数最多 | 按人数选 | |

**User's choice:** 多场战斗同时录制、按顺序展示（第一场结束后回到 15s 展示第二场）。
**Notes:** 经边界澄清，顺序展示/时间回跳归 Phase 6；Phase 5 只提供可指定目标的镜头。

| Option | Description | Selected |
|--------|-------------|----------|
| 箭头 + 实力标记 | 军队箭头 + 人数；城池方块/旗 + 规模 | ✓ |
| 极简色点 | 只用阵营色点 | |
| 带名称文字 | 加军队/城池名称 | |

**User's choice:** 箭头 + 实力标记。

---

## 接入方式与播放节奏

| Option | Description | Selected |
|--------|-------------|----------|
| 最小 demo 页 | Vite index.html + main.ts，真实场景驱动 | ✓ |
| 只做模块 + 测试 | 不建页面 | |
| 完整 app shell | 提前做最终应用框架 | |

**User's choice:** 最小 demo 页。

| Option | Description | Selected |
|--------|-------------|----------|
| 每帧 1 个外层 tick | 战斗 1 游戏分钟 / 和平最多 24 分钟 | ✓ |
| 按真实时间映射 | 1×=60 tick/s、24×=1440 tick/s | |
| 每帧固定 N 游戏分钟 | 绕开 1×/24× | |

**User's choice:** 每帧 1 个外层 tick。

| Option | Description | Selected |
|--------|-------------|----------|
| 固定输出帧率累加器 | 默认 60fps 节流 | |
| rAF 每帧 1 tick | 受显示器刷新率影响 | |
| 完全手动逐帧 | 只能点下一帧 | |
| 渲染完立刻下一帧 | 不节流 | ✓（变体） |

**User's choice:** 渲染完前一帧立刻渲染后一帧，可暂停。

**Notes:** 纯 `while(true)` / `queueMicrotask` 会饿死 UI，按钮失效。最终选择每帧 `setTimeout` 让出，模拟未来 WebSocket 推理等待；延时作为“速度”控制。

| Option | Description | Selected |
|--------|-------------|----------|
| 视图工厂接口 | `IUnitView` + `IUnitViewFactory` | ✓ |
| 仅配置表 | 配置里写贴图路径 | |
| 完整资源系统 | 图集/加载器/动画 | |

**User's choice:** 视图工厂接口。

| Option | Description | Selected |
|--------|-------------|----------|
| renderFrame() + canvas | 渲染器只画帧，Phase 6 抓 canvas | ✓ |
| 只暴露 Pixi Application | Phase 6 自己取 canvas | |
| 现在就加 captureFrame() | Phase 5 返回 ImageBitmap | |

**User's choice:** `renderFrame()` + `canvas`。

| Option | Description | Selected |
|--------|-------------|----------|
| HTML/CSS 覆盖层 | 面板在 canvas 外 | ✓ |
| Pixi 画在 canvas 内 | 需要导出前隐藏 | |
| 独立调试窗口 | 单独窗口控制 | |

**User's choice:** HTML/CSS 覆盖层。

---

## the agent's Discretion

- 每种武器/防具的具体几何造型、线宽、尺寸与色值。
- 镜头缓动曲线、过渡时长、90% 拟合的边距与细节。
- 血条尺寸、等级字体、伤害数字样式、粒子数量与池上限。
- 操作者面板布局、文案、镜头模式命名与快捷键。
- `src/render/` 内部文件拆分与 demo 文件位置。
- demo 默认场景与初始镜头状态。
- PixiJS 版本与 API 用法。

## Deferred Ideas

- 多场战斗顺序播放/时间回跳/剪辑时间线 → Phase 6。
- 强制结束战斗、单位传送、碰撞体/射线叠加 → 后续，需要 Phase 4 调试接缝。
- 更进一步的性能优化 → 后续按实际情况提出。
- 真实贴图/图集/动画 → 通过 `IUnitViewFactory` 后续替换。
- 战斗“激烈度”评分与自动选战斗 → Phase 6。
- 伤害/击杀统计 → Phase 8。
