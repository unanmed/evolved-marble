<!-- GSD:project-start source:PROJECT.md -->

## Project

**AI 版球球王国（Evolved Marble）**

一个由 AI 驱动的球球战争模拟。在 1000×1000 的地图上，多个势力（每个由 LLM 担任指挥官）调动军队、争夺城池、彼此攻伐；每场战斗中的每个单位都由 AI 实时操控。产物是可以观看/可以出片的模拟录像，同时作为"多智能体 RL + LLM 编排"的研究平台。

本仓库此前是一个聚焦 1v1 近战的战术层原型（Vue + `@motajs/client` + `planck-js` + Python RLlib）。根据决定，`src/` 与 `model/` **全部重写**，现有代码仅作品牌与数值参考。

**权威数值与机制来源**：`.planning/reference/ai-marble-kingdom.md`（从飞书知识库缓存的《AI 版球球王国》设计文档）。文档中明确标注"数值需要经过实测，目前仅作参考"。

**Core Value:** **战斗必须激烈好看。**

当权衡取舍时，优先保证：单位行为多样、战局有悬念、画面值得观看。战略层与导演层再聪明，若战斗本身不好看也没有意义——因为成片标准就是"战斗激烈好看"。

### Constraints

- **Tech Stack**: 渲染用 PixiJS；物理用 Rapier2D（`@dimforge/rapier2d`，WASM）；模拟主体在浏览器运行，Python 侧负责训练驱动
- **Compatibility**: 仅支持 Chrome（不要求 Firefox/Safari）
- **Rewrite**: `src/` 与 `model/` 全部重写；不背负旧架构包袱
- **Spec Authority**: 数值与机制以 `.planning/reference/ai-marble-kingdom.md` 为准，但需实测校准
- **Determinism**: 物理需可复现（Rapier2D 的跨平台确定性），以支撑后续 RL 与"控制等级"模型阶梯
- **LLM Dependency**: 指挥官/导演层将依赖云 API（Claude/GPT），本期不引入但接口需预留

<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->

## Technology Stack

## Overview

- Frontend source: `src/` (TypeScript + TSX, bundled by Vite)
- Python RL stack: `model/` (entry point `python -m model.train`)
- Not part of the build, but present on disk: `checkpoint/` (RLlib checkpoint output, binary),

## Languages

- TypeScript ~5.8.3 - All frontend source under `src/` (`.ts` / `.tsx`)
- Python 3.9.22 - RL training stack under `model/` (`.py`)
- JSX/TSX (Vue JSX) - Vue components rendered via `@vitejs/plugin-vue-jsx`, e.g. `src/scene/sword1v1/component.tsx`
- CSS - `src/styles.css` (global reset only)
- HTML - `index.html` mounts the app to `<canvas id="main">`

## Runtime

- Node.js >= 18 (required by README; Vite 6 requires Node 18+)
- Browser: Chrome >= 71 required; Firefox and Safari are **not supported** (`README.md`)
- Python 3.9.22
- Frontend: pnpm >= 8 (declared in `README.md`); lockfile `pnpm-lock.yaml` present (lockfileVersion 9.0)
- Python: pip with pinned `requirements.txt`; a local Conda env exists at `.conda/` (git-ignored)
- ffmpeg >= 7.0.0 - Required at runtime by the Python frame recorder (`model/frame.py` invokes the `ffmpeg` executable directly)

## Frameworks

- Vue 3.5.14 - UI/reactive component layer (`src/main.tsx`, `src/scene/sword1v1/component.tsx`)
- Vite 6.3.5 - Dev server and build tool (`vite.config.ts`)
- `@vitejs/plugin-vue-jsx` 4.2.0 - Enables TSX/JSX Vue components and custom elements
- `@motajs/client` 0.1.2 - Rendering/game engine toolkit: `MotaRenderer`, `UIController`, `GameUI`, `Sprite`, `Font`, `MotaOffscreenCanvas2D`, `createApp`, `onTick` (used throughout `src/renderer.ts`, `src/scene/**`, `src/body/**`, `src/map/**`)
- `planck-js` 1.3.0 - 2D rigid-body physics engine (Box2D port); drives the battle simulation (`src/scene/sword1v1/scene.ts`, `src/map/base.ts`, `src/body/**`)
- Ray 2.46.0 / Ray RLlib - Distributed RL; PPO algorithm with LSTM model (`model/train.py`)
- PettingZoo 1.25.0 - Multi-agent environment API (`ParallelEnv`); `model/env.py`
- Gymnasium 1.0.0 - Action/observation `Box` spaces; `model/env.py`
- websockets 15.0.1 - Async WebSocket server bridging Python and the browser (`model/ws.py`, `model/frame.py`)
- TypeScript compiler (`tsc && vite build`) - `package.json` `build` script
- ESLint 9.27.0 (flat config, `eslint.config.js`) with `typescript-eslint` 8.33.0
- Prettier 3.6.2 wired through `eslint-plugin-prettier` 5.4.1 (`eslint.config.js`, `.prettierrc`)
- `@types/node` 22.15.30, globals 16.2.0
- Not detected. No test runner, test config, or `*.test.*` / `*.spec.*` files present.

## Key Dependencies

- `@motajs/client` 0.1.2 - The entire rendering/game-UI foundation; nothing renders without it
- `planck-js` 1.3.0 - Physics simulation; battle dynamics, contact detection, joints
- `vue` 3.5.14 - Component model and reactivity (`defineComponent`, `ref`, `shallowReactive`)
- `eventemitter3` 5.0.1 - Event bus used across scenes, bodies, maps, trainer, recorder
- `mutate-animate` 1.4.2 - `Ticker` used for animation-frame excitation (`src/utils/excite.ts`)
- `lodash-es` 4.17.21 - Utility (`isNil`) in `src/map/base.ts`; `@types/lodash-es` present
- `ray` 2.46.0 - RLlib PPO trainer, checkpoint save/load
- `pettingzoo` 1.25.0 + `gymnasium` 1.0.0 - Multi-agent env interface and spaces
- `websockets` 15.0.1 - Transport to browser
- `numpy` 1.26.4 - Observation arrays (dtype `float32`)
- `flask` 3.1.1 - Listed in `requirements.txt` but **not imported anywhere** in `model/` (no Flask app/route found). Its purpose is unclear / likely vestigial.

## Configuration

- No `.env` files or environment-variable-driven configuration detected.
- Frontend dev server config in `vite.config.ts`: port `8074`, `base: './'`, path alias `@` → `src/`.
- Dev proxy in `vite.config.ts` routes `/upload-frame`, `/frame-end`, `/ping` → `http://localhost:8076`.
- TypeScript config in `tsconfig.json`: strict mode, `target`/`module` ESNext, `moduleResolution: bundler`, `jsx: preserve` with `jsxImportSource: vue`, path alias `@/*` → `src/*`.
- Python training CLI args (via `argparse` in `model/train.py`): `--resume` (bool, default `False`), `--from_state` (int, default `0`).
- `package.json` scripts: `dev` (`vite`), `build` (`tsc && vite build`), `preview` (`vite preview`).
- Lint config: `eslint.config.js` (ignores `node_modules`, `dist`, `public`; `no-console: warn`; `eqeqeq: always`).
- Format config: `.prettierrc` (printWidth 80, tabWidth 4, single quotes, semi, no trailing comma, arrow parens avoided).
- `index.html` is the Vite entry; loads `/src/main.tsx`.

## Platform Requirements

- Node.js >= 18, pnpm >= 8, Python 3.9.22, ffmpeg >= 7.0.0, Chrome >= 71.
- Run frontend: `pnpm i` then `pnpm dev`.
- Run training: `python -m model.train` (must be launched from repo root; paths in `model/train.py` are relative to CWD).
- No deployment configuration detected (static Vite build output only). The Python stack runs a local WebSocket bridge and writes checkpoints to `checkpoint/` and video to `video/`.

## Notable Build/Asset Details

- `index.html` references `/vite.svg`; `battle.webp` background is loaded via `${import.meta.env.BASE_URL}battle.webp` in `src/scene/sword1v1/scene.ts`.
- Custom JSX element names (`container`, `sprite`, `text`, `g.*`, etc.) are declared in `vite.config.ts` so Vite does not treat them as Vue components.
- `checkpoint/*` contains per-iteration RLlib checkpoints (numeric dirs `5` … `390`) plus `custom.json` sidecar files; these are binary training artifacts (git-ignored, see `.gitignore`).

## License

- GNU General Public License v3.0 (`LICENSE`).

<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->

## Conventions

## Naming Patterns

- TypeScript source: lowercase, mostly single-word, no separators — `src/common.ts`,
- Multi-word files use lowercase **no separator** (`src/utils/excite.ts`, `src/utils/record.ts`,
- Vue JSX component file is `src/scene/sword1v1/component.tsx` (the folder names the feature;
- Per-feature type files are `types.ts` (e.g. `src/body/types.ts`, `src/scene/sword1v1/types.ts`).
- Scene feature folders are lowercase concatenated: `src/scene/sword1v1/`, `src/train/sword1v1/`.
- Python modules are lowercase single word: `model/env.py`, `model/frame.py`, `model/train.py`,
- camelCase in TypeScript: `createBody`, `getDisplayInfo`, `changeTo`, `resetWorld`,
- snake_case in Python: `env_creator`, `send_and_receive`, `is_connected`, `run_server`,
- Private TypeScript helpers use a leading underscore only for backing fields behind a
- Private methods are marked with the `private` keyword, not a naming prefix:
- camelCase in TypeScript: `lastTick`, `backImage`, `damageRender`, `bodyMap`, `dataQueue`.
- snake_case in Python: `ffmpeg_process`, `reset_payload`, `message_queue`, `send_queue`.
- Module-level configuration constants are SCREAMING_SNAKE_CASE in TypeScript:
- `readonly` is applied liberally to fields that do not change after construction
- **Service/contract interfaces use an `I` prefix + PascalCase**: `IScene`, `ISceneController`,
- **Plain data-shape interfaces do NOT use the `I` prefix**: `SceneUIProps`, `BodyContact`,
- Event-map interfaces are unprefixed PascalCase ending in `Event`: `SceneEvent`,
- Type aliases are PascalCase: `SceneGameUI`, `AnyTrainProcess` (`src/train/manager.ts`).
- Enums are declared as `const enum` with PascalCase members:
- Python classes are PascalCase (`EvolvedMarbleEnv`, `WebSocketServer`); Python type hints are

## Code Style

- Tool: Prettier 3.6.2, config `.prettierrc`.
- `printWidth: 80`
- `tabWidth: 4`, `useTabs: false` (4-space indentation)
- `semi: true` (semicolons required)
- `singleQuote: true` (single quotes)
- `quoteProps: 'as-needed'`
- `bracketSpacing: true`
- `vueIndentScriptAndStyle: false`
- `arrowParens: 'avoid'` — single-parameter arrows omit parentheses, e.g.
- `trailingComma: 'none'` — do **not** add trailing commas.
- `endOfLine: 'auto'`
- No `.editorconfig` is present; Prettier is the source of truth.
- Tool: ESLint 9 flat config at `eslint.config.js`, using `@eslint/js`,
- Active rules to respect:
- TypeScript compiler is `strict: true` (`tsconfig.json`); `target`/`module` `ESNext`,
- No formatter or linter config (no `pyproject.toml`, `setup.cfg`, `ruff.toml`, `.flake8`,
- Observed: 4-space indentation, blank lines between top-level defs, `import` at top.
- Quote style is **mixed** in Python (single and double quotes both appear, e.g.

## Import Organization

- Not mechanically enforced (no `import/order` rule). The observed habit is: external packages
- One import per source module; related names grouped in braces across multiple lines when long
- `@` → `src` is configured in both `vite.config.ts` (`resolve.alias`) and `tsconfig.json`
- Aliased and relative imports are **used interchangeably** in the codebase — e.g.

## Error Handling

- **Guard clauses with early return** are the dominant style — check and bail rather than nest:
- **Absence is signalled with `null` / `false` return values**, not exceptions:
- **Unimplemented abstract contract members throw** `new Error('Method not implemented.')`
- **Optional chaining / nullish coalescing** for safe access: `this._process?.save()`,
- There is **no global error boundary or try/catch** in `src/`; errors propagate to the
- `try/except` with `print(...)` diagnostics and bracketed tags, e.g.
- `WebSocketServer.send_and_receive` catches `(ConnectionError, json.JSONDecodeError)`, prints,
- Fatal protocol errors raise `RuntimeError` (`model/train.py:70,77`).

## Logging

- TypeScript: only connection-status messages are logged, each with an inline
- Python: `print` with a bracketed subsystem tag: `[FFmpeg]`, `[WebSocket]`

## Comments

- Comments are **written in Chinese** throughout both `src/` and `model/`.
- Inline `//` comments explain intent and domain reasoning (e.g. `// 相对线速度`,
- Region markers group file sections: `//#region 场景相关` / `//#region 录制相关`
- Commented-out code is occasionally left in place with an explanatory line
- Heavy use of Chinese JSDoc `/** ... */` on interface members and public methods, with
- Short English JSDoc tags are used for terse helpers in `component.tsx`
- Follow this: document public interfaces and non-obvious methods in Chinese JSDoc; keep

## Function Design

- `BodyBase.create` → `createBody`, `.destroy` → `destroyBody`, `.updateBody` → `onUpdate`,
- `Scene.tick` → `onTick`, `.setMode` → `onModeChange` (`src/scene/scene.ts`).
- `TrainProcess.tick` → `onTick`, `.reset` → `onReset` (`src/train/manager.ts`).

## Module Design

- **Named exports only** in `src/` — `export class`, `export interface`, `export const`.
- Classes, interfaces and constants are exported inline at their declaration.
- Python: plain `def` / `class` definitions; `model/train.py` uses an
- Module-level singletons are created on import: `renderer`, `scene`, `recorder`, `uploader`
- Constructor parameter properties for injected dependencies:
- `EventEmitter` (from `eventemitter3`) is the standard event bus; subclasses declare a typed
- Classes implement a contract interface where one exists, e.g.

<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->

## Architecture

## System Overview

```text

```

## Component Responsibilities

| Component | Responsibility | File |
|-----------|----------------|------|
| Main | Bootstraps renderer, scene, trainer, workflow; wires keyboard input | `src/main.tsx` |
| MotaRenderer singleton | Owns the `<canvas id="main">` draw surface (1920×1080) | `src/renderer.ts` |
| SceneController | Scene registry + current scene; drives scene `tick`/`input`; opens GameUI | `src/scene/controller.ts` |
| Scene (abstract) | Base class for a simulation scene; lifecycle + event emitter | `src/scene/scene.ts` |
| Sword1v1Scene | Concrete 1v1 melee physics scene (marbles/swords/helmets via planck-js) | `src/scene/sword1v1/scene.ts` |
| Sword1v1SceneCom | Vue component tree; canvas renderer + HUD text (HP, win rate, actions) | `src/scene/sword1v1/component.tsx` |
| TrainManager | Owns WebSocket client :8075; dispatches reset/action/save/load; per-frame tick | `src/train/manager.ts` |
| TrainProcess (abstract) | Base trainer: frame interval gating, data queue, save/load, display info | `src/train/manager.ts` |
| Sword1v1Train | Concrete trainer: builds observations, computes rewards, applies actions to scene | `src/train/sword1v1/train.ts` |
| TrainWorkflow | Drives the fixed-step train loop (tick → render → capture) | `src/workflow.ts` |
| SpecifiedFrameExcitation | Fixed-interval tick driver (60 fps logical clock) | `src/utils/excite.ts` |
| Recorder / RecordUploader | Canvas→JPEG capture; streams frames to Python over :8076 | `src/utils/record.ts`, `src/utils/upload.ts` |
| Shared contracts | All interfaces (`IScene`, `ITrainer`, `IWorldBody`, `IMap`, enums) | `src/common.ts` |
| RL config + loop | Registers env, PPO/LSTM config, training loop, checkpoint save/resume | `model/train.py` |
| EvolvedMarbleEnv | PettingZoo `ParallelEnv`; observation (16,) / action (3,) spaces; socket RPC | `model/env.py` |
| WebSocketServer | Threaded asyncio WS server :8075 with request/response queues | `model/ws.py` |
| frame_handler | Threaded WS server :8076; pipes JPEG frames into ffmpeg | `model/frame.py` |
| BodyBase / MapBase | Reusable physics abstractions (body lifecycle, contact dispatch, map) | `src/body/base.ts`, `src/map/base.ts` |

## Pattern Overview

- **Inversion of control via WebSocket**: the Python trainer is the driver. Each RLlib `env.step()` sends an action to the browser and blocks for the browser's observation/reward reply (`model/ws.py` `send_and_receive`).
- **Deterministic fixed-step tick**: `SpecifiedFrameExcitation` (`src/utils/excite.ts`) advances a logical clock by `FRAME_INTERVAL` (1000/60 ms) per iteration; `TrainWorkflow.start()` (`src/workflow.ts`) loop-until-`tickEnd`.
- **Fixed action cadence**: the model acts every `MODEL_INTERVAL` (=6) logical frames, computed in `TrainProcess.tick` (`src/train/manager.ts:95`).
- **EventEmitter contracts**: `SceneController`, `Scene`, `TrainManager`, `TrainProcess`, `MapBase`, `BodyBase` all extend `eventemitter3` for decoupled communication.
- **Abstract base + concrete subclass per scene**: `Scene` → `Sword1v1Scene`, `TrainProcess` → `Sword1v1Train`, matched by shared string id `'sword1v1'`.
- **Dual rendering path**: both `Sword1v1Scene.render()` (`src/scene/sword1v1/scene.ts:72`) and `Sword1v1SceneCom.drawScene()` (`src/scene/sword1v1/component.tsx:89`) implement the same canvas drawing logic.

## Layers

- Purpose: wire everything together and start the loop
- Location: `src/main.tsx`, `src/renderer.ts`, `src/setup.ts`, `src/workflow.ts`
- Contains: `Main` class, singletons `renderer`/`scene`/`recorder`/`uploader`, constants (`SCENE`, `MODEL_INTERVAL`, `FRAME`), `TrainWorkflow`
- Depends on: all lower layers
- Used by: browser (`index.html` → `src/main.tsx`)
- Purpose: registry + active selection for scenes and trainers; owns WS transport
- Location: `src/scene/controller.ts`, `src/train/manager.ts`
- Contains: `SceneController` (scene `Map`, `changeTo`, `tick`, `input`), `TrainManager` (WebSocket client, message dispatch, `tick`), `TrainProcess` (abstract)
- Depends on: `src/common.ts`, `@motajs/client`
- Used by: `Main`, `TrainWorkflow`, concrete scene/train
- Purpose: own the physics `World`, game entities, contact resolution, rendering component
- Location: `src/scene/scene.ts` (abstract), `src/scene/sword1v1/scene.ts`, `src/scene/sword1v1/component.tsx`, `src/scene/sword1v1/types.ts`
- Contains: `Sword1v1Scene` (bodies, joints, wraparound teleport, attack/damage, win detection), `Sword1v1SceneUI` (GameUI), display types
- Depends on: `planck-js`, `@motajs/client`, `src/common.ts`
- Used by: `SceneController`, `Sword1v1Train`
- Purpose: transform scene state into normalized observations and rewards; apply model actions
- Location: `src/train/sword1v1/train.ts`
- Contains: `Sword1v1Train` (obs vector `[hp, x, y, vx, vy, angle, angularVel, timeRatio]` per ball; damage/reward bookkeeping; save/load episode state)
- Depends on: scene layer, `planck-js`
- Used by: `TrainManager`
- Purpose: generic body/map primitives for future scenes
- Location: `src/body/base.ts`, `src/body/role.ts`, `src/body/types.ts`, `src/map/base.ts`
- Contains: `BodyBase`, `MapBase`, `IRole`/`IRoleWeapon`/`IRoleArmor` interfaces, `Role` (stub)
- Depends on: `src/common.ts`, `planck-js`
- Used by: not wired into `Sword1v1Scene` (which uses a raw `planck-js` `World` directly)
- Purpose: time excitation, frame recording, upload
- Location: `src/utils/excite.ts`, `src/utils/record.ts`, `src/utils/upload.ts`
- Purpose: drive training and persist checkpoints
- Location: `model/train.py`, `model/env.py`, `model/ws.py`, `model/frame.py`

## Data Flow

### Primary Request Path — RL training step (Python-driven)

### Episode Reset Flow

### Action Flow

### Save / Resume Flow

### Video Recording Flow

- No global store/framework. Mutable state lives on class instances: `Sword1v1Scene.world` (planck-js `World`), `Sword1v1Train.damageInfo`/`teleport`/`wins`, `Sword1v1Scene.damageRender`.
- Display state flows to the HUD through `Scene.getDisplayInfo()` → `Sword1v1Train.display`, read on `onTick` in `component.tsx:81-86` into a `shallowReactive` object.
- Cross-process state is synchronized explicitly through the save/load protocol.

## Key Abstractions

- Purpose: a trainable, renderable, input-driven simulation unit keyed by `id`
- Examples: `src/scene/scene.ts` (abstract), `src/scene/sword1v1/scene.ts`
- Pattern: abstract class implementing an interface in `src/common.ts`; emits `shown`/`modeChange` and battle events (`over`, `attack`, `contact`, `teleport`)
- Purpose: bind to a scene, gate model actions by cadence, serialize observations/rewards, save/load
- Examples: `src/train/manager.ts` (abstract `TrainProcess`), `src/train/sword1v1/train.ts`
- Pattern: abstract generic class; matched to a scene by identical `id` string in `Main.bind()`
- Purpose: decouple time advancement from the loop; a central clock that "excites" registered tickables
- Examples: `src/utils/excite.ts` (`SpecifiedFrameExcitation`, `AnimationFrameExcitation`)
- Pattern: subject registers targets; `tick()` iterates `targets` and calls `target.tick(now)`
- Purpose: reusable physics object whose data is shared across multiple world instances; dispatches contacts by mapping `Body`→id
- Examples: `src/body/base.ts`, `src/map/base.ts`
- Pattern: template-method (`create`/`destroy`/`updateBody` call abstract `*Body` hooks)
- Purpose: synchronous request/response over a full-duplex socket from a synchronous Python caller
- Examples: `model/ws.py` (`send_and_receive`), `src/train/manager.ts` (typed dispatch)
- Pattern: Python pushes to `send_queue`, polls `message_queue`; browser switches on `data.type`

## Entry Points

- Location: `index.html` → `src/main.tsx`
- Triggers: `pnpm dev` (Vite on :8074)
- Responsibilities: `Main.initialize()` — mount renderer, add `Sword1v1Scene`, add `Sword1v1Train`, bind trainer↔scene, excite targets, start `TrainWorkflow`; register global `keydown`/`keyup` listeners
- Location: `model/train.py` (`if __name__ == "__main__"`)
- Triggers: `python -m model.train`
- Responsibilities: `ray.init()`, start both WS servers (`ws.start()`, `start()`), wait for browser, build PPO algo, run 1000 iterations, checkpoint every 5
- Location: `model/frame.py` `start()`
- Triggers: called from `train.py` `__main__`
- Responsibilities: launch ffmpeg subprocess + WS server :8076 in a daemon thread

## Architectural Constraints

- **Threading:** Browser is single-threaded (main event loop + `requestAnimationFrame` render). Python's `WebSocketServer` runs an asyncio loop in a daemon thread; the main thread communicates only via `queue.Queue` and polls with `sleep(0.01)` (`model/ws.py:39-58`). `frame.py` runs its own separate daemon thread/event loop.
- **Global state:** module-level singletons `renderer`, `scene` (UIController), `recorder`, `uploader` in `src/renderer.ts`; `excitation` in `src/setup.ts`; `ws = WebSocketServer()` in `model/ws.py`; module-level `ffmpeg_process` in `model/frame.py`.
- **Fixed resolution:** renderer and root containers are hard-coded to 1920×1080 (`src/renderer.ts:5`, `src/main.tsx:15`); `resizeRenderer` is intentionally pinned to 1080p (`src/renderer.ts:12`).
- **Deterministic clock:** logical time is synthesized, not wall-clock — `SpecifiedFrameExcitation` increments `nowTime` by a fixed interval (`src/utils/excite.ts:55-59`).
- **Cross-language coupling:** the frontend and backend must agree on the JSON message schema (`reset`/`resetEpisode`/`action`/`step`/`save`/`load`). There is no shared schema file; the contract is duplicated in `model/env.py`, `model/train.py`, `src/train/manager.ts`, and `src/train/sword1v1/train.ts`.
- **Browser requirement:** Chrome ≥ 71 only (README); Firefox/Safari unsupported.
- **No message correlation:** `send_and_receive` assumes strict one-request/one-response ordering; concurrent in-flight messages would desynchronize.

## Anti-Patterns

### Duplicated rendering logic

### Incomplete reusable abstraction shipped alongside a bypassing implementation

### Silent no-op branches in the socket dispatch

### Dead/debug noise left in hot paths

## Error Handling

- Python `send_and_receive` catches `ConnectionError`/`JSONDecodeError`, prints, and re-raises (`model/ws.py:68-75`).
- `train.py` raises `RuntimeError` on non-`success` reset/load statuses (`model/train.py:69-77`).
- `frame.py` wraps per-message ffmpeg writes in `try/except` and logs failures (`model/frame.py:32-38`).
- Frontend WebSocket handlers only log connection state; there is no reconnection logic.
- Stubs throw `new Error('Method not implemented.')` (`src/body/role.ts`, `src/scene/sword1v1/scene.ts:622`).

## Cross-Cutting Concerns

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

<!-- project-locked:start — 手工维护，勿删；与上方自动生成的 Conventions/Code Style 冲突时，以本节为准 -->

## Code Style Requirements (project-locked)

> 这些是**强制约定**。当上方自动生成的「Conventions / Code Style」与此冲突时，**以本节为准**。所有规划、执行 agent 必须遵守。

1. **JSDoc 全覆盖** — 每个类、接口、枚举、成员、方法、函数、类型别名都必须有 JSDoc 注释。函数的**每个参数**用 `@param` 说明，**返回值**用 `@returns` 说明。（用中文 JSDoc，便于阅读。）
2. **先接口后类，接口一律 `I` 前缀** — 每个类都必须先定义 `I<ClassName>` 接口，类再 `implements` 它。**禁止直接用类当类型**（成员、参数、返回值都应使用对应接口类型）。所有接口名一律以 `I` 开头（如 `IBattleSim`、`ICommandQueue`）。
3. **枚举用数字值** — 所有枚举使用数字成员值；**禁止**用字符串字面量联合（`'abc' | 'def'`）冒充枚举。
4. **私有成员不加 `_` 前缀** — 私有字段/方法使用 `private` 关键字修饰，**不带** `_` 前缀。
5. **避免内联类型** — 尽量不写内联对象类型；联合类型优先写成**多个具名 interface 的联合**，而不是一堆内联类型的联合。

<!-- project-locked:end -->

<!-- GSD:profile-start -->

## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
