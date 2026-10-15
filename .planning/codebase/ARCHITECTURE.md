<!-- refreshed: 2026-10-15 -->
# Architecture

**Analysis Date:** 2026-10-15

## System Overview

Evolved Marble is a **two-process, cross-language system**. A browser frontend (Vite + Vue 3 JSX + `@motajs/client` canvas UI) runs the *entire game simulation* using `planck-js` (a Box2D physics port), renders it, and records video. A Python backend trains a multi-agent PPO model with Ray RLlib. The browser acts as the simulation environment; Python acts as the learning client. They are coupled over WebSockets.

```text
┌──────────────────────────────────────────────────────────────────────┐
│                    Browser (Vite dev server :8074)                    │
│  index.html → src/main.tsx (Main orchestrator)                       │
├───────────────┬────────────────┬──────────────────┬──────────────────┤
│ Scene Layer   │ Train Layer    │ Render Layer      │ Record Layer     │
│ scene/        │ train/         │ renderer.ts       │ utils/record.ts  │
│ controller.ts │ manager.ts     │ (MotaRenderer)    │ utils/upload.ts  │
│ scene.ts      │ sword1v1/      │ scene/            │                  │
│ sword1v1/     │   train.ts     │  sword1v1/        │                  │
│  scene.ts     │                │   component.tsx   │                  │
│  (planck-js)  │                │  (Vue GameUI)     │                  │
└───────┬───────┴───────┬────────┴──────────┬────────┴────────┬─────────┘
        │               │                   │                 │
        │ tick          │ WebSocket :8075   │ draw canvas     │ WebSocket :8076
        ▼               ▼                   ▼                 ▼
┌───────────────────────────────────┐  ┌──────────────────────────────────┐
│  Python RL Backend                │  │  Python Recorder                 │
│  `python -m model.train`          │  │  model/frame.py                  │
│  train.py → RLlib PPO             │  │  websockets :8076 → ffmpeg       │
│  env.py → EvolvedMarbleEnv        │  │  → video/output.mp4              │
│  ws.py → WebSocketServer :8075    │  └──────────────────────────────────┘
│  checkpoint/{n}/ → saved policy   │
└───────────────────────────────────┘
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

**Overall:** Layered component architecture with an event-driven tick loop, plus a cross-process RPC bridge. Frontend is a *simulation host*; Python is the *learning driver*.

**Key Characteristics:**
- **Inversion of control via WebSocket**: the Python trainer is the driver. Each RLlib `env.step()` sends an action to the browser and blocks for the browser's observation/reward reply (`model/ws.py` `send_and_receive`).
- **Deterministic fixed-step tick**: `SpecifiedFrameExcitation` (`src/utils/excite.ts`) advances a logical clock by `FRAME_INTERVAL` (1000/60 ms) per iteration; `TrainWorkflow.start()` (`src/workflow.ts`) loop-until-`tickEnd`.
- **Fixed action cadence**: the model acts every `MODEL_INTERVAL` (=6) logical frames, computed in `TrainProcess.tick` (`src/train/manager.ts:95`).
- **EventEmitter contracts**: `SceneController`, `Scene`, `TrainManager`, `TrainProcess`, `MapBase`, `BodyBase` all extend `eventemitter3` for decoupled communication.
- **Abstract base + concrete subclass per scene**: `Scene` → `Sword1v1Scene`, `TrainProcess` → `Sword1v1Train`, matched by shared string id `'sword1v1'`.
- **Dual rendering path**: both `Sword1v1Scene.render()` (`src/scene/sword1v1/scene.ts:72`) and `Sword1v1SceneCom.drawScene()` (`src/scene/sword1v1/component.tsx:89`) implement the same canvas drawing logic.

## Layers

**Bootstrap (entry/orchestration):**
- Purpose: wire everything together and start the loop
- Location: `src/main.tsx`, `src/renderer.ts`, `src/setup.ts`, `src/workflow.ts`
- Contains: `Main` class, singletons `renderer`/`scene`/`recorder`/`uploader`, constants (`SCENE`, `MODEL_INTERVAL`, `FRAME`), `TrainWorkflow`
- Depends on: all lower layers
- Used by: browser (`index.html` → `src/main.tsx`)

**Controller layer:**
- Purpose: registry + active selection for scenes and trainers; owns WS transport
- Location: `src/scene/controller.ts`, `src/train/manager.ts`
- Contains: `SceneController` (scene `Map`, `changeTo`, `tick`, `input`), `TrainManager` (WebSocket client, message dispatch, `tick`), `TrainProcess` (abstract)
- Depends on: `src/common.ts`, `@motajs/client`
- Used by: `Main`, `TrainWorkflow`, concrete scene/train

**Scene layer (concrete simulation):**
- Purpose: own the physics `World`, game entities, contact resolution, rendering component
- Location: `src/scene/scene.ts` (abstract), `src/scene/sword1v1/scene.ts`, `src/scene/sword1v1/component.tsx`, `src/scene/sword1v1/types.ts`
- Contains: `Sword1v1Scene` (bodies, joints, wraparound teleport, attack/damage, win detection), `Sword1v1SceneUI` (GameUI), display types
- Depends on: `planck-js`, `@motajs/client`, `src/common.ts`
- Used by: `SceneController`, `Sword1v1Train`

**Train layer (concrete RL glue):**
- Purpose: transform scene state into normalized observations and rewards; apply model actions
- Location: `src/train/sword1v1/train.ts`
- Contains: `Sword1v1Train` (obs vector `[hp, x, y, vx, vy, angle, angularVel, timeRatio]` per ball; damage/reward bookkeeping; save/load episode state)
- Depends on: scene layer, `planck-js`
- Used by: `TrainManager`

**Reusable physics abstractions (general-purpose, currently unused by sword1v1):**
- Purpose: generic body/map primitives for future scenes
- Location: `src/body/base.ts`, `src/body/role.ts`, `src/body/types.ts`, `src/map/base.ts`
- Contains: `BodyBase`, `MapBase`, `IRole`/`IRoleWeapon`/`IRoleArmor` interfaces, `Role` (stub)
- Depends on: `src/common.ts`, `planck-js`
- Used by: not wired into `Sword1v1Scene` (which uses a raw `planck-js` `World` directly)

**Utilities:**
- Purpose: time excitation, frame recording, upload
- Location: `src/utils/excite.ts`, `src/utils/record.ts`, `src/utils/upload.ts`

**Python RL backend:**
- Purpose: drive training and persist checkpoints
- Location: `model/train.py`, `model/env.py`, `model/ws.py`, `model/frame.py`

## Data Flow

### Primary Request Path — RL training step (Python-driven)

1. Python `train.py` starts the WS server (thread) and blocks until the browser connects (`model/train.py:55-62`).
2. Browser `TrainManager` opens `ws://localhost:8075` on construction (`src/train/manager.ts:158`).
3. `TrainWorkflow.start()` enters its loop (`src/workflow.ts:16`).
4. `process()` calls `excitation.tick()`, firing `SceneController.tick` and `TrainManager.tick` (`src/workflow.ts:34`).
5. `SceneController.tick` → `Sword1v1Scene.tick` → `onTick` applies forces/torque, enforces speed caps, wraps positions, then `world.step(dt/1000)` (`src/scene/sword1v1/scene.ts:459-508`).
6. `TrainManager.tick` → `TrainProcess.tick` increments `tickCount` and sets `action = tickCount % MODEL_INTERVAL === 0` (`src/train/manager.ts:95-103`).
7. On an action frame, `Sword1v1Train.onTick` awaits `getData()` (the next action message) and calls `actionTick` (`src/train/sword1v1/train.ts:325-329`).
8. `actionTick` applies `actionMove`/`actionRotate`, computes reward (distance-shaping, damage/recv, teleport penalty, timeout/win bonuses), builds observation/reward/termination/truncation/info, and sends `{"type":"step", data}` (`src/train/sword1v1/train.ts:211-323`).
9. `tickEnd()` → manager emits `'tickEnd'` → the awaited `process()` promise resolves (`src/workflow.ts:31-35`).
10. `waitRender()` awaits `renderer.requestAfterFrame` (`src/workflow.ts:25-29`).
11. `recorder.capture()` snaps the canvas to JPEG and forwards it to `RecordUploader.receive` → `ws://localhost:8076` (`src/utils/record.ts:31`, `src/utils/upload.ts:19`).
12. Python `EvolvedMarbleEnv.step` unblocks on its reply, parses observations into `np.float32` arrays, and RLlib consumes them (`model/env.py:32-56`).

### Episode Reset Flow

1. Python sends `{"type": "reset"}` (`model/env.py:25`).
2. Browser `TrainManager.onData` case `'reset'` calls `TrainProcess.reset()` (`src/train/manager.ts:180-189`).
3. `Sword1v1Train.onReset` rebuilds the world (`scene.resetWorld()`), reseeds damage/teleport trackers, and returns initial observations (`src/train/sword1v1/train.ts:152-209`).
4. Browser replies `{"type":"reset","data":{observation, info}}`; Python returns them from `reset()`.

### Action Flow

1. Python sends `{"type":"action","actions":{agent:{linear:[x,y],angular}}}` (`model/env.py:33-39`).
2. Browser queues it via `TrainProcess.onData` → `dataQueue` (`src/train/manager.ts:62-64`).
3. When the next action frame arrives, `getData()` shifts it and it is applied (`src/train/sword1v1/train.ts:327-328`).

### Save / Resume Flow

1. Every 5 training iterations, Python sends `{"type":"save"}` (`model/train.py:90-94`).
2. Browser replies with `Sword1v1Train.save()` (`{episode, colors, wins}`); Python writes it to `checkpoint/{n}/custom.json` (`src/train/sword1v1/train.ts:357-365`).
3. On resume (`--resume`), Python sends `{"type":"load","data":custom.json}`; browser calls `Sword1v1Train.load` (`src/train/manager.ts:203-207`).

### Video Recording Flow

1. Each workflow iteration captures a JPEG (`Recorder.capture`, `src/utils/record.ts:31`).
2. `RecordUploader` sends the blob over `ws://localhost:8076` (`src/utils/upload.ts:19-22`).
3. `model/frame.py` `frame_handler` writes raw bytes to an `ffmpeg` subprocess stdin that encodes `video/output.mp4` (`model/frame.py:8-40`).
4. `"finish"` message closes ffmpeg stdin and waits for it to exit (`model/frame.py:22-27`).

**State Management:**
- No global store/framework. Mutable state lives on class instances: `Sword1v1Scene.world` (planck-js `World`), `Sword1v1Train.damageInfo`/`teleport`/`wins`, `Sword1v1Scene.damageRender`.
- Display state flows to the HUD through `Scene.getDisplayInfo()` → `Sword1v1Train.display`, read on `onTick` in `component.tsx:81-86` into a `shallowReactive` object.
- Cross-process state is synchronized explicitly through the save/load protocol.

## Key Abstractions

**Scene (`IScene<S, T>`):**
- Purpose: a trainable, renderable, input-driven simulation unit keyed by `id`
- Examples: `src/scene/scene.ts` (abstract), `src/scene/sword1v1/scene.ts`
- Pattern: abstract class implementing an interface in `src/common.ts`; emits `shown`/`modeChange` and battle events (`over`, `attack`, `contact`, `teleport`)

**Trainer / TrainProcess (`ITrainer<S, SL, T>`):**
- Purpose: bind to a scene, gate model actions by cadence, serialize observations/rewards, save/load
- Examples: `src/train/manager.ts` (abstract `TrainProcess`), `src/train/sword1v1/train.ts`
- Pattern: abstract generic class; matched to a scene by identical `id` string in `Main.bind()`

**Excitation (`ITickExcitation` / `ITickExcitable`):**
- Purpose: decouple time advancement from the loop; a central clock that "excites" registered tickables
- Examples: `src/utils/excite.ts` (`SpecifiedFrameExcitation`, `AnimationFrameExcitation`)
- Pattern: subject registers targets; `tick()` iterates `targets` and calls `target.tick(now)`

**WorldBody (`IWorldBody<T>` / `BodyBase<T>`):**
- Purpose: reusable physics object whose data is shared across multiple world instances; dispatches contacts by mapping `Body`→id
- Examples: `src/body/base.ts`, `src/map/base.ts`
- Pattern: template-method (`create`/`destroy`/`updateBody` call abstract `*Body` hooks)

**WebSocket RPC:**
- Purpose: synchronous request/response over a full-duplex socket from a synchronous Python caller
- Examples: `model/ws.py` (`send_and_receive`), `src/train/manager.ts` (typed dispatch)
- Pattern: Python pushes to `send_queue`, polls `message_queue`; browser switches on `data.type`

## Entry Points

**Browser:**
- Location: `index.html` → `src/main.tsx`
- Triggers: `pnpm dev` (Vite on :8074)
- Responsibilities: `Main.initialize()` — mount renderer, add `Sword1v1Scene`, add `Sword1v1Train`, bind trainer↔scene, excite targets, start `TrainWorkflow`; register global `keydown`/`keyup` listeners

**Python trainer:**
- Location: `model/train.py` (`if __name__ == "__main__"`)
- Triggers: `python -m model.train`
- Responsibilities: `ray.init()`, start both WS servers (`ws.start()`, `start()`), wait for browser, build PPO algo, run 1000 iterations, checkpoint every 5

**Python recorder:**
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

**What happens:** The full canvas-drawing routine (background, HP bars, marble/helmet/sword shapes, damage popups) is implemented twice — `Sword1v1Scene.render()` (`src/scene/sword1v1/scene.ts:72-208`) and `Sword1v1SceneCom.drawScene()` (`src/scene/sword1v1/component.tsx:89-229`). Only the component's version is live (`GameUI` `render` prop); the scene method is dead.
**Why it's wrong:** Any visual change must be made in two places; the two copies already diverge (e.g. HP-bar `lineWidth` is 4 vs 6).
**Do this instead:** Keep rendering in `component.tsx` only; delete or delegate `Sword1v1Scene.render`.

### Incomplete reusable abstraction shipped alongside a bypassing implementation

**What happens:** `src/body/role.ts` (`Role`) throws `Method not implemented` for every method; `Sword1v1Scene.getState()` throws the same (`src/scene/sword1v1/scene.ts:621-623`). `BodyBase`/`MapBase` are fully built but unused — `Sword1v1Scene` binds `planck-js` `World` directly.
**Why it's wrong:** Two parallel physics models confuse contributors about which to extend; dead stubs mask missing functionality.
**Do this instead:** Either port `Sword1v1Scene` onto `MapBase`/`BodyBase`, or remove the stubs until a second scene needs them. When adding a new scene, extend `Scene` + `TrainProcess` and reuse `MapBase`/`BodyBase` rather than raw `planck-js`.

### Silent no-op branches in the socket dispatch

**What happens:** `TrainManager.onData` guards every case with `if (this._process)` and silently ignores messages when no process is active (`src/train/manager.ts:177-213`). `TrainProcess.getData` polls `requestAnimationFrame` forever if no data arrives (`src/train/manager.ts:69-81`).
**Why it's wrong:** If the active process/scene is not wired, the browser stops replying and Python's blocking `recv()` spins indefinitely.
**Do this instead:** Reply with an error payload (`{"type": ..., "status": "error"}`) when no process is bound, and add a timeout to `getData()`.

### Dead/debug noise left in hot paths

**What happens:** `actionTick` computes `lastLength` and `nowLength` from identical expressions (`src/train/sword1v1/train.ts:218-222`), making the distance-shaping reward term always 0.
**Why it's wrong:** A reward signal silently does nothing, misleading anyone tuning training.
**Do this instead:** Capture `lastLength` before applying movement (or track it on the process) so the delta is meaningful.

## Error Handling

**Strategy:** Minimal and optimistic. No central error boundary or retry layer.

**Patterns:**
- Python `send_and_receive` catches `ConnectionError`/`JSONDecodeError`, prints, and re-raises (`model/ws.py:68-75`).
- `train.py` raises `RuntimeError` on non-`success` reset/load statuses (`model/train.py:69-77`).
- `frame.py` wraps per-message ffmpeg writes in `try/except` and logs failures (`model/frame.py:32-38`).
- Frontend WebSocket handlers only log connection state; there is no reconnection logic.
- Stubs throw `new Error('Method not implemented.')` (`src/body/role.ts`, `src/scene/sword1v1/scene.ts:622`).

## Cross-Cutting Concerns

**Logging:** Browser uses `console.log` (only on socket open, with `eslint-disable no-console`); Python uses `print`. No structured logging.
**Validation:** No runtime schema validation on either side; messages are trusted and JSON-parsed directly.
**Authentication:** None. Both WebSockets bind to localhost (`:8075`, `:8076`); the Python WS server host is `0.0.0.0` in `WebSocketServer.__init__` (`model/ws.py:9`) but is not exposed by config.
**Time:** `SpecifiedFrameExcitation` provides synthetic logical time for determinism; scene physics uses the per-frame `dt` derived from it (`src/scene/sword1v1/scene.ts:507`).

---

*Architecture analysis: 2026-10-15*
