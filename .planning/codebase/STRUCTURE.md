# Codebase Structure

**Analysis Date:** 2026-10-15

## Directory Layout

```
evolved-marble/
├── index.html              # Vite HTML entry; <canvas id="main"> + module script
├── package.json            # pnpm manifest; dev/build/preview scripts
├── pnpm-lock.yaml          # pnpm lockfile
├── vite.config.ts          # Vite config: vue-jsx custom elements, port 8074, proxies to :8076
├── tsconfig.json           # TS config; `@/*` → `src/*`; jsx: preserve (vue)
├── eslint.config.js        # Flat ESLint + typescript-eslint + prettier
├── .prettierrc             # 4-space, single quotes, 80 cols, no trailing comma
├── requirements.txt        # Python deps (ray, pettingzoo, gymnasium, websockets, numpy)
├── README.md               # Setup + run/train instructions (Chinese)
├── LICENSE
├── public/                 # Static assets served by Vite
│   ├── battle.webp         # Battle-field background image
│   └── vite.svg
├── src/                    # Browser frontend (TypeScript + Vue 3 JSX)
│   ├── main.tsx            # Entry: Main orchestrator + input bindings
│   ├── renderer.ts         # MotaRenderer + UIController singletons + recorder wiring
│   ├── setup.ts            # Constants (SCENE, MODEL_INTERVAL, FRAME) + excitation singleton
│   ├── workflow.ts         # TrainWorkflow: tick → render → capture loop
│   ├── common.ts           # All shared interfaces/enums (IScene, ITrainer, IWorldBody, IMap…)
│   ├── styles.css          # Global CSS (black bg, centered canvas)
│   ├── vite-env.d.ts       # Vite client types
│   ├── scene/              # Scene layer
│   │   ├── scene.ts        # Abstract Scene base class
│   │   ├── controller.ts   # SceneController (registry + active scene + input/tick)
│   │   └── sword1v1/       # Concrete 1v1 scene
│   │       ├── scene.ts    # Sword1v1Scene: planck-js world, bodies, combat
│   │       ├── component.tsx # Sword1v1SceneCom: Vue GameUI + canvas render + HUD
│   │       └── types.ts    # Display/state/fixture/damage types + BodyType enum
│   ├── train/              # Train layer
│   │   ├── manager.ts      # TrainManager (WS client) + abstract TrainProcess
│   │   └── sword1v1/
│   │       └── train.ts    # Sword1v1Train: obs/reward, action application, save/load
│   ├── body/               # Reusable physics-body abstractions
│   │   ├── base.ts         # BodyBase abstract class
│   │   ├── role.ts         # Role (stub — all methods throw)
│   │   └── types.ts        # IRole / IRoleWeapon / IRoleArmor interfaces
│   ├── map/                # Reusable map/world abstraction
│   │   └── base.ts         # MapBase: body registry + contact dispatch + step
│   └── utils/              # Utilities
│       ├── excite.ts       # Tick excitation (SpecifiedFrameExcitation, AnimationFrameExcitation)
│       ├── record.ts       # Recorder: canvas → JPEG Blob
│       └── upload.ts       # RecordUploader: Blob → ws://localhost:8076
├── model/                  # Python RL backend
│   ├── train.py            # Entry point: RLlib PPO config + training loop
│   ├── env.py              # EvolvedMarbleEnv (PettingZoo ParallelEnv)
│   ├── ws.py               # WebSocketServer :8075 + `ws` singleton
│   └── frame.py            # ffmpeg video recorder WS server :8076
├── public/                 # (see above)
├── video/                  # Generated: output.mp4 (created by frame.py at runtime)
└── checkpoint/             # Generated: RLlib checkpoints at iterations 5,10,…,390
    ├── {n}/                # e.g. checkpoint/5/
    │   ├── rllib_checkpoint.json
    │   ├── algorithm_state.pkl
    │   ├── custom.json     # Browser-side save {episode, colors, wins}
    │   ├── env_runner/
    │   └── learner_group/…/rl_module/shared_policy/
```

## Directory Purposes

**`src/`:**
- Purpose: The entire browser application — simulation, rendering, HUD, recording, and the WebSocket client half of the RL bridge.
- Contains: TypeScript modules + Vue 3 JSX components.
- Key files: `src/main.tsx`, `src/common.ts`, `src/renderer.ts`, `src/workflow.ts`.

**`src/scene/`:**
- Purpose: Simulation scenes and their controller.
- Contains: abstract `Scene`, `SceneController`, and one concrete scene per subdirectory (`sword1v1/`).
- Key files: `src/scene/scene.ts`, `src/scene/controller.ts`, `src/scene/sword1v1/scene.ts`, `src/scene/sword1v1/component.tsx`.

**`src/train/`:**
- Purpose: Training glue — WebSocket transport, action cadence, reward shaping.
- Contains: abstract `TrainProcess` + `TrainManager`, one concrete trainer per scene subdirectory.
- Key files: `src/train/manager.ts`, `src/train/sword1v1/train.ts`.

**`src/body/` & `src/map/`:**
- Purpose: General-purpose, reusable physics abstractions intended for future scenes. Not used by the current `sword1v1` scene.
- Contains: `BodyBase`, `MapBase`, role/equipment interfaces, and a `Role` stub.
- Key files: `src/body/base.ts`, `src/body/role.ts`, `src/map/base.ts`.

**`src/utils/`:**
- Purpose: Cross-cutting helpers (time excitation, recording, uploading).
- Contains: `SpecifiedFrameExcitation`, `Recorder`, `RecordUploader`.
- Key files: `src/utils/excite.ts`, `src/utils/record.ts`, `src/utils/upload.ts`.

**`model/`:**
- Purpose: The Python RL training backend that drives the browser and persists checkpoints.
- Contains: RLlib config/loop (`train.py`), PettingZoo environment (`env.py`), socket transport (`ws.py`), video recorder (`frame.py`).
- Key files: `model/train.py`, `model/env.py`, `model/ws.py`, `model/frame.py`.

**`public/`:**
- Purpose: Vite static assets copied verbatim into the build.
- Contains: background image (`battle.webp`) and favicon.

**`video/`:**
- Purpose: Runtime output directory for recorded training video.
- Generated: Yes (`model/frame.py:58` creates it via `os.makedirs`).
- Committed: No (ignored).

**`checkpoint/`:**
- Purpose: RLlib checkpoint storage; each subdir is a training iteration snapshot.
- Generated: Yes (created by `algo.save_checkpoint` in `model/train.py:91`).
- Committed: No (ignored) — but present in this working copy.

## Key File Locations

**Entry Points:**
- `index.html`: HTML shell; loads `src/main.tsx`, hosts `<canvas id="main">`.
- `src/main.tsx`: Browser bootstrap (`Main` class). Add new scene/trainer wiring here.
- `model/train.py`: `python -m model.train` entry; RLlib config and training loop.

**Configuration:**
- `vite.config.ts`: port 8074, `@` alias, vue-jsx custom-element list (`container`, `image`, `sprite`, `shader`, `text`, `comment`, `custom`, `g-*`), proxies.
- `tsconfig.json`: strict mode, `@/*` → `src/*`, `jsxImportSource: "vue"`.
- `eslint.config.js` / `.prettierrc`: linting/format rules.
- `src/setup.ts`: gameplay/training constants (`SCENE='sword1v1'`, `MODEL_INTERVAL=6`, `FRAME=60`).

**Core Logic:**
- `src/common.ts`: The single source of truth for cross-layer interfaces/enums.
- `src/scene/sword1v1/scene.ts`: Physics simulation, combat, win conditions, input handling.
- `src/train/sword1v1/train.ts`: Observation vector, reward function, action application, save/load.
- `src/train/manager.ts`: WebSocket protocol dispatch and frame cadence.
- `model/env.py`: Observation/action space definitions and the socket RPC environment.
- `model/ws.py`: Threaded asyncio WebSocket server + `send_and_receive`.

**Testing:**
- Not detected. No test files, no test runner, no test config in `package.json` or `requirements.txt`.

## Naming Conventions

**Files:**
- `lowercase.ts` for modules (`scene.ts`, `controller.ts`, `manager.ts`, `role.ts`, `base.ts`).
- `main.tsx`, `component.tsx` for JSX-bearing entry/component files.
- Python modules are lowercase single words (`train.py`, `env.py`, `ws.py`, `frame.py`).
- Scene/trainer subdirectories are named after the scene id (`sword1v1/`).

**Directories:**
- Lowercase, singular by concept (`scene/`, `train/`, `body/`, `map/`, `utils/`).

**Classes:**
- PascalCase: `Main`, `MotaRenderer`, `SceneController`, `Sword1v1Scene`, `Sword1v1Train`, `TrainManager`, `TrainProcess`, `BodyBase`, `MapBase`, `Role`, `Recorder`, `RecordUploader`, `SpecifiedFrameExcitation`. Python: `EvolvedMarbleEnv`, `WebSocketServer`.

**Interfaces/Types:**
- Prefixed with `I` (interfaces) or `T` (generic type params): `IScene`, `ITrainer`, `IWorldBody`, `IMap`, `IDisplayInfoBase`, `ITickExcitable`, `ITrainParallelResets`, `ITrainDataBase`. Enums use PascalCase with `const enum` (`SceneMode`, `InputType`, `BodyType`).
- Interfaces live next to implementations or in local `types.ts`; cross-cutting contracts live in `src/common.ts`.

**Functions/Methods:**
- camelCase, verb-first: `initializeRenderer`, `changeTo`, `bindTrainer`, `onTick`, `actionMove`, `resetWorld`, `getDisplayInfo`, `sendAndReceive`-style snake_case on the Python side (`send_and_receive`, `env_creator`, `frame_handler`).
- Lifecycle hooks prefixed `on*` (`onShown`, `onTick`, `onInput`, `onModeChange`, `onReset`, `onData`).

**Variables/Constants:**
- Module constants SCREAMING_SNAKE_CASE: `MODEL_INTERVAL`, `MAX_SPEED`, `MAX_ANGULAR_SPEED`, `ACCELERATION`, `LINEAR_DAMPING`, `IVALID_FRAME` (sic).
- Instance fields camelCase with leading `_` for private backing fields (`_process`, `_nowScene`, `_instance`).

**Comments:**
- Predominantly Chinese, JSDoc-style `/** … */` on interfaces and public methods.

## Where to Add New Code

**New Scene (e.g. a new battle mode):**
- Create `src/scene/<id>/scene.ts` extending `Scene` (from `src/scene/scene.ts`) and `src/scene/<id>/component.tsx` exporting a `GameUI`; add `src/scene/<id>/types.ts` for local types.
- Register it in `Main.initializeScene()` (`src/main.tsx:42-46`) via `this.scene.add(new YourScene())`.
- Set the id string in `src/setup.ts` (`SCENE`) or switch via `SceneController.changeTo`.
- Prefer building entities on `MapBase` (`src/map/base.ts`) + `BodyBase` (`src/body/base.ts`) instead of raw `planck-js`.

**New Trainer:**
- Create `src/train/<id>/train.ts` extending `TrainProcess` (from `src/train/manager.ts`), implementing `initialize`, `onReset`, `onTick`, `actionTick`, `save`, `load`, `getDisplayInfo`, `onBind`.
- Register it in `Main.initializetrain()` (`src/main.tsx:48-51`); `Main.bind()` auto-pairs scene↔trainer by matching `id`.

**New RL Environment / message type:**
- Add the server-side config/env under `model/` (mirror `model/env.py`).
- Add a matching `switch` branch in `TrainManager.onData` (`src/train/manager.ts:177-213`) and a reply via `this.send`.
- Keep the JSON contract in sync between `model/` and `src/train/`.

**New Component/UI Element:**
- Use `@motajs/client` JSX custom elements (`container`, `image`, `sprite`, `shader`, `text`, `comment`, `custom`) inside a `defineComponent`; register the tag in `vite.config.ts` `custom[]` if introducing a new one.
- Place scene-specific UI in the scene's `component.tsx`.

**Utilities:**
- Shared helpers → `src/utils/`. Reusable physics primitives → `src/body/` and `src/map/`.

**Configuration/Constants:**
- Global gameplay/training constants → `src/setup.ts`. Cross-layer interfaces → `src/common.ts`.

## Special Directories

**`checkpoint/`:**
- Purpose: Per-iteration RLlib policy snapshots plus browser-side `custom.json`.
- Generated: Yes.
- Committed: No.

**`video/`:**
- Purpose: Recorded training output (`output.mp4`).
- Generated: Yes.
- Committed: No.

**`node_modules/`, `.conda/`:**
- Purpose: JS deps (pnpm) and local Python env.
- Generated: Yes. Committed: No.

---

*Structure analysis: 2026-10-15*
