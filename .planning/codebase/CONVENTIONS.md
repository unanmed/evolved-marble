<!-- refreshed: 2026-10-15 -->
# Coding Conventions

**Analysis Date:** 2026-10-15

This project has **two distinct convention sets**: a TypeScript/Vue frontend under `src/`
(enforced by Prettier + ESLint) and a Python RL stack under `model/` (PEP 8-style, **not
machine-enforced** — no Python linter/formatter config exists). When editing a file, follow
the conventions of its language and neighboring files.

## Naming Patterns

**Files:**
- TypeScript source: lowercase, mostly single-word, no separators — `src/common.ts`,
  `src/renderer.ts`, `src/workflow.ts`, `src/scene/scene.ts`, `src/scene/controller.ts`,
  `src/body/base.ts`, `src/map/base.ts`, `src/train/manager.ts`.
- Multi-word files use lowercase **no separator** (`src/utils/excite.ts`, `src/utils/record.ts`,
  `src/utils/upload.ts`), not camelCase or kebab-case.
- Vue JSX component file is `src/scene/sword1v1/component.tsx` (the folder names the feature;
  the file is always `component.tsx`).
- Per-feature type files are `types.ts` (e.g. `src/body/types.ts`, `src/scene/sword1v1/types.ts`).
- Scene feature folders are lowercase concatenated: `src/scene/sword1v1/`, `src/train/sword1v1/`.
- Python modules are lowercase single word: `model/env.py`, `model/frame.py`, `model/train.py`,
  `model/ws.py`.

**Functions / Methods:**
- camelCase in TypeScript: `createBody`, `getDisplayInfo`, `changeTo`, `resetWorld`,
  `actionMove`, `drawScene`, `bindTrainer`, `waitRender`.
- snake_case in Python: `env_creator`, `send_and_receive`, `is_connected`, `run_server`,
  `start_ws_server`, `frame_handler`.
- Private TypeScript helpers use a leading underscore only for backing fields behind a
  getter/setter: `_instance` / `get instance()`, `_nowScene` / `get nowScene()`
  (`src/scene/controller.ts`). Methods themselves are not underscore-prefixed.
- Private methods are marked with the `private` keyword, not a naming prefix:
  `private contactBody(...)`, `private createMarble(...)`, `private _createBoundaries(...)`
  (`src/map/base.ts`, `src/scene/sword1v1/scene.ts`).

**Variables:**
- camelCase in TypeScript: `lastTick`, `backImage`, `damageRender`, `bodyMap`, `dataQueue`.
- snake_case in Python: `ffmpeg_process`, `reset_payload`, `message_queue`, `send_queue`.
- Module-level configuration constants are SCREAMING_SNAKE_CASE in TypeScript:
  `MAX_SPEED`, `MAX_ANGULAR_SPEED`, `ACCELERATION`, `ANGULAR_ACCEL`, `LINEAR_DAMPING`,
  `ANGULAR_DAMPING`, `IVALID_FRAME` (`src/scene/sword1v1/scene.ts`); `SCENE`, `MODEL_INTERVAL`,
  `FRAME`, `FRAME_INTERVAL` (`src/setup.ts`). Note the existing misspelling `IVALID_FRAME` —
  do not propagate it into new identifiers.
- `readonly` is applied liberally to fields that do not change after construction
  (`readonly id`, `readonly list`, `readonly backImage`).

**Types:**
- **Service/contract interfaces use an `I` prefix + PascalCase**: `IScene`, `ISceneController`,
  `ITrainer`, `IMap`, `IWorldBody`, `IWorldBodyInstance`, `IRole`, `IRoleWeapon`, `IRoleArmor`,
  `IDisplayInfoBase`, `ITickExcitable`, `ITickExcitation`, `ITrainWorkflow`, `ITrainDataBase`,
  `IRecorderDestination`. These describe objects with behavior (methods).
- **Plain data-shape interfaces do NOT use the `I` prefix**: `SceneUIProps`, `BodyContact`,
  `WorldBodyData`, `RoleData`, `DamageRender`, `BattleMove`, `WinInfo`, `AddedBodyData`,
  `Sword1v1DisplayBallInfo`, `ISword1v1TrainData` (exception — carries `I`).
- Event-map interfaces are unprefixed PascalCase ending in `Event`: `SceneEvent`,
  `MapBaseEvent`, `BodyBaseEvent`, `SceneControllerEvent`, `TrainManagerEvent`, `RecorderEvent`,
  `TickExcitationEvent` (`src/common.ts`, `src/scene/scene.ts`, `src/map/base.ts`,
  `src/body/base.ts`, `src/train/manager.ts`, `src/utils/record.ts`).
- Type aliases are PascalCase: `SceneGameUI`, `AnyTrainProcess` (`src/train/manager.ts`).
- Enums are declared as `const enum` with PascalCase members:
  `SceneMode.None | Info | Scene` (`src/common.ts`), `InputType.KeyDown | KeyUp`,
  `BodyType.Marble | Helmet | Sword` (`src/scene/sword1v1/types.ts`).
- Python classes are PascalCase (`EvolvedMarbleEnv`, `WebSocketServer`); Python type hints are
  used on signatures (`def send_and_receive(self, payload) -> dict`,
  `from typing import Dict, Any` in `model/train.py`).

## Code Style

**Formatting (TypeScript/Vue):**
- Tool: Prettier 3.6.2, config `.prettierrc`.
- `printWidth: 80`
- `tabWidth: 4`, `useTabs: false` (4-space indentation)
- `semi: true` (semicolons required)
- `singleQuote: true` (single quotes)
- `quoteProps: 'as-needed'`
- `bracketSpacing: true`
- `vueIndentScriptAndStyle: false`
- `arrowParens: 'avoid'` — single-parameter arrows omit parentheses, e.g.
  `this.list.values().map(v => v.load())` (`src/scene/controller.ts`).
- `trailingComma: 'none'` — do **not** add trailing commas.
- `endOfLine: 'auto'`
- No `.editorconfig` is present; Prettier is the source of truth.

**Linting (TypeScript/Vue):**
- Tool: ESLint 9 flat config at `eslint.config.js`, using `@eslint/js`,
  `typescript-eslint`, and `eslint-plugin-prettier/recommended` (Prettier violations surface
  as lint errors). Ignores `node_modules`, `dist`, `public`.
- Active rules to respect:
  - `no-console: 'warn'` — avoid `console`; when a log is intentional, silence it inline:
    `// eslint-disable-next-line no-console` followed by `console.log(...)`
    (`src/train/manager.ts:161`, `src/utils/upload.ts:12`).
  - `eqeqeq: ['error', 'always']` — always use `===` / `!==`, never `==` / `!=`.
  - `@typescript-eslint/no-unused-vars: 'error'` with `^_` ignore patterns for args, caught
    errors, destructured arrays and vars. Prefix intentionally-unused bindings with `_`
    (e.g. `onTick(_timestamp, dt, _lastTick)` in `src/scene/sword1v1/scene.ts:459`).
  - `@typescript-eslint/no-explicit-any: 'off'` — `any` is allowed and used pervasively
    (`IScene<any, any>`, `Record<string, any>`); prefer real generics where the code already
    does, but `any` will not fail lint.
  - `@typescript-eslint/no-empty-object-type: 'off'`, `no-namespace: 'off'`,
    `no-this-alias: 'off'`.
- TypeScript compiler is `strict: true` (`tsconfig.json`); `target`/`module` `ESNext`,
  `moduleResolution: 'bundler'`, `jsx: 'preserve'`, `jsxImportSource: 'vue'`, `noEmit: true`.

**Formatting (Python):**
- No formatter or linter config (no `pyproject.toml`, `setup.cfg`, `ruff.toml`, `.flake8`,
  `mypy.ini`). Follow PEP 8 by hand.
- Observed: 4-space indentation, blank lines between top-level defs, `import` at top.
- Quote style is **mixed** in Python (single and double quotes both appear, e.g.
  `model/frame.py` and `model/train.py`) — match the surrounding file.

## Import Organization

**Order:**
- Not mechanically enforced (no `import/order` rule). The observed habit is: external packages
  first, then internal modules, e.g. `src/map/base.ts` imports `eventemitter3`, `lodash-es`,
  `planck-js`, then `@/common`; `src/train/manager.ts` imports `eventemitter3`, then relative
  modules, then `@/common` / `@/setup`. Imports are **not** alphabetized.
- One import per source module; related names grouped in braces across multiple lines when long
  (`src/map/base.ts`, `src/scene/sword1v1/scene.ts`).

**Path Aliases:**
- `@` → `src` is configured in both `vite.config.ts` (`resolve.alias`) and `tsconfig.json`
  (`paths: { "@/*": ["src/*"] }`). Use `@/common`, `@/setup`, `@/scene/sword1v1/scene`, etc.
- Aliased and relative imports are **used interchangeably** in the codebase — e.g.
  `src/scene/controller.ts` imports `../common`, while `src/train/manager.ts` imports
  `@/common`. Both compile. For new code, prefer the `@/` alias for cross-directory imports;
  relative paths are common for sibling modules (`./base`, `./component`, `./types`).

## Error Handling

**Patterns (TypeScript):**
- **Guard clauses with early return** are the dominant style — check and bail rather than nest:
  `if (!data) return;`, `if (!this._nowScene) return;`, `if (id === -1) return;`
  (`src/map/base.ts`, `src/scene/controller.ts`, `src/scene/sword1v1/scene.ts`).
- **Absence is signalled with `null` / `false` return values**, not exceptions:
  `get(id)` returns `this.list.get(id) ?? null` (`src/scene/controller.ts`);
  `removeBody(id): boolean` returns `false` when not found (`src/map/base.ts`).
- **Unimplemented abstract contract members throw** `new Error('Method not implemented.')`
  (`src/body/role.ts`, `getState()` in `src/scene/sword1v1/scene.ts:622`). These are
  scaffolding stubs, not recoverable errors.
- **Optional chaining / nullish coalescing** for safe access: `this._process?.save()`,
  `this.trainer?.getDisplayInfo() ?? null` (`src/train/manager.ts`, `src/scene/scene.ts`).
- There is **no global error boundary or try/catch** in `src/`; errors propagate to the
  browser. Do not introduce silent `catch {}` blocks.

**Patterns (Python):**
- `try/except` with `print(...)` diagnostics and bracketed tags, e.g.
  `print(f"[FFmpeg] 写入失败: {e}")` (`model/frame.py:38`),
  `print("[WebSocket] 客户端断开连接")` (`model/frame.py:40`).
- `WebSocketServer.send_and_receive` catches `(ConnectionError, json.JSONDecodeError)`, prints,
  and **re-raises** (`model/ws.py:69-75`). Follow this: log then re-raise.
- Fatal protocol errors raise `RuntimeError` (`model/train.py:70,77`).

## Logging

**Framework:** None — `console` in TypeScript, `print()` in Python.

**Patterns:**
- TypeScript: only connection-status messages are logged, each with an inline
  `// eslint-disable-next-line no-console` (`src/train/manager.ts`, `src/utils/upload.ts`).
  New logging must follow the same pattern or it will trip `no-console: warn`.
- Python: `print` with a bracketed subsystem tag: `[FFmpeg]`, `[WebSocket]`
  (`model/frame.py`, `model/ws.py`); `model/train.py` prints progress lines and a
  `--------------------` separator.

## Comments

**When to Comment:**
- Comments are **written in Chinese** throughout both `src/` and `model/`.
- Inline `//` comments explain intent and domain reasoning (e.g. `// 相对线速度`,
  `// wraparound 修正偏移`, `// 生命值最大为 100` in `src/scene/sword1v1/scene.ts` and
  `src/train/sword1v1/train.ts`).
- Region markers group file sections: `//#region 场景相关` / `//#region 录制相关`
  (`src/setup.ts`).
- Commented-out code is occasionally left in place with an explanatory line
  (`src/renderer.ts:15-19`, `src/scene/sword1v1/scene.ts:436`); avoid adding more.

**JSDoc/TSDoc:**
- Heavy use of Chinese JSDoc `/** ... */` on interface members and public methods, with
  `@param` tags and occasional `@returns` and `{@link ...}` references — see `src/common.ts`,
  `src/body/types.ts`, `src/map/base.ts`.
- Short English JSDoc tags are used for terse helpers in `component.tsx`
  (`/** Win Ratio */`, `/** Normalize */`, `/** Right */`, `/** Left */`).
- Follow this: document public interfaces and non-obvious methods in Chinese JSDoc; keep
  trivial helpers terse.

## Function Design

**Size:** Files favor a small number of focused methods; large files exist
(`src/scene/sword1v1/scene.ts` ~624 lines, `src/train/sword1v1/train.ts` ~381 lines) and mix
physics setup, input handling, rendering and reward shaping. New logic should be extracted
into `private` helpers or sibling modules rather than growing these further.

**Parameters:** Typed positional parameters; optional params via `?` with defaults, e.g.
`step(time, velocityIterations?, positionIterations?)` (`src/common.ts`),
`_createBoundaries(left, right, top, bottom, thickness = 0.5)`.

**Return Values:** Explicit return types on interface methods; helper methods often rely on
inference. Async functions (returning `Promise`) are used for `load`, `capture`, `start`,
`send_and_receive`.

**Template Method Pattern:** Public methods delegate to abstract hooks to keep base classes
generic:
- `BodyBase.create` → `createBody`, `.destroy` → `destroyBody`, `.updateBody` → `onUpdate`,
  `.contact` → `onContact` (`src/body/base.ts`).
- `Scene.tick` → `onTick`, `.setMode` → `onModeChange` (`src/scene/scene.ts`).
- `TrainProcess.tick` → `onTick`, `.reset` → `onReset` (`src/train/manager.ts`).
When extending these bases, override the abstract hook — never the public wrapper.

## Module Design

**Exports:**
- **Named exports only** in `src/` — `export class`, `export interface`, `export const`.
  There are **no default exports** in application code (only `vite.config.ts` uses
  `export default defineConfig`).
- Classes, interfaces and constants are exported inline at their declaration.
- Python: plain `def` / `class` definitions; `model/train.py` uses an
  `if __name__ == "__main__":` guard.

**Barrel Files:** None detected. Import from the concrete file path
(`@/scene/sword1v1/scene`), not from an `index.ts`.

**Singletons & Side Effects:**
- Module-level singletons are created on import: `renderer`, `scene`, `recorder`, `uploader`
  (`src/renderer.ts`), `excitation` (`src/setup.ts`), `ws = WebSocketServer()`
  (`model/ws.py`), `ffmpeg_process` (`model/frame.py`). Be aware that importing these modules
  has side effects (renderer sizing, socket creation, subprocess launch).

**Class Shape:**
- Constructor parameter properties for injected dependencies:
  `constructor(public readonly ui: UIController)` (`src/scene/controller.ts`),
  `constructor(public readonly target: HTMLCanvasElement)` (`src/utils/record.ts`),
  `constructor(private readonly interval: number)` (`src/utils/excite.ts`).
- `EventEmitter` (from `eventemitter3`) is the standard event bus; subclasses declare a typed
  event-map interface and call `super()` (`src/body/base.ts`, `src/map/base.ts`,
  `src/scene/controller.ts`, `src/train/manager.ts`, `src/utils/record.ts`).
- Classes implement a contract interface where one exists, e.g.
  `class SceneController extends EventEmitter<...> implements ISceneController, ITickExcitable`.

---

*Convention analysis: 2026-10-15*
