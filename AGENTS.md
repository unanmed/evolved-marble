<!-- GSD:project-start source:PROJECT.md -->

## Project

**AI 版球球王国（Evolved Marble）**

一个 AI 驱动的战争模拟：在 1000×1000 的地图上，多个势力调动军队、争夺城池、彼此攻伐；每场战斗中的每个单位由 AI 实时操控。产物是可观看、可出片的模拟录像，同时作为"多智能体 AI / 可插拔 AI 控制"的研究平台。

上一版因**设计过度**被推翻——公式化的工程架构、层级化推进、无意义的中间态、过度的接口预留，导致体量膨胀、理解困难、无法继续推进。本版由用户主导方向与设计，聚焦"最终形态 + 代码设计的合理性"，规模约 10k–20k 行，**单里程碑、不拆分**。参考规格缓存于 `.planning/reference/ai-marble-kingdom.md`。

**Core Value:** **战斗必须激烈好看。**

当权衡取舍时，优先保证：单位行为多样、战局有悬念、画面值得观看。战略层与导演层再聪明，若战斗本身不好看也没有意义——因为成片标准就是"战斗激烈好看"。

### Constraints

- **Tech Stack**: 物理用 Rapier2D（`@dimforge/rapier2d`，WASM）；渲染用 PixiJS；录制用浏览器 WebCodecs + Mediabunny（不用 ffmpeg）；模拟主体在浏览器运行；Python 侧训练链路保留设计位。
- **Compatibility**: 仅支持 Chrome（不要求 Firefox / Safari）。
- **Scale / Milestones**: **单里程碑，不拆分**，约 10k–20k 行。
- **No Determinism**: 不保证物理/模拟跨平台或跨运行可复现；无重放、无指令录像。
- **Pluggable AI**: AI 控制与 LLM 接入必须做成可插拔模块，可替换不同系统；但不预留多余定制接口，**只留必要的**。
- **Anti-Over-Engineering**: 不做公式化工程架构；每个系统相对独立，一阶段只攻一个系统；不做无意义的中间态。
- **Type-First + Review Gate**: 每个阶段**先写类型声明（`types.ts` + `I*` 接口），经用户审查确认设计合理后才能进入实现**；实现中容许并预期多次重构。
- **角色分工**: 用户主导方向与设计决策；AI 负责设计讨论与实现。实现细节 AI 自主，除非出现领域级大问题（如性能崩坏）。
- **Spec Authority**: 数值与机制以参考文档为准，但需实测校准。

### Code Conventions（强制）

1. 每个类**先写接口 `I<Name>`，再 `implements` 它**。接口一律**大写 `I` 开头**。
2. 所有类型声明集中到**每个文件夹一个 `types.ts`**。
3. **枚举使用数字枚举**，禁止字符串枚举。
4. 接口的成员与方法**必须写 JSDoc**；类实现接口的成员/方法可省略 JSDoc，但**私有方法 / 私有成员必须有 JSDoc**。
5. **不允许出现不在 interface 中的公共成员**。
6. **所有顶层 `const` 声明必须写 JSDoc**。
7. 其余注释从简，不写过多无用注释。

<!-- GSD:project-end -->

<!-- GSD:stack-start source:STACK.md -->

## Technology Stack

Technology stack not yet documented. Will populate after codebase mapping or first phase.
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

Conventions not yet established. Will populate as patterns emerge during development.
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

Architecture not yet mapped. Follow existing patterns found in the codebase.
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->

## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->

## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:

- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
