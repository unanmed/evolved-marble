<!-- refreshed: 2026-10-15 -->
# Codebase Concerns

**Analysis Date:** 2026-10-15

## Tech Debt

**WebSocket bridge relies on an untyped, uncorrelated JSON protocol:**
- Issue: The Python model (`model/ws.py`) and the frontend (`src/train/manager.ts`) exchange raw JSON with only a `type` string and no request id, sequence number, or protocol version. `ws.send_and_receive()` assumes the *next* inbound message is the reply to the *current* request. The frontend pushes replies asynchronously from `TrainManager.onData`, so any stray or late message (e.g., a buffered `step` response after a `reset`) permanently desyncs request/reply pairing.
- Files: `model/ws.py:68-75`, `model/env.py:26`, `model/env.py:39`, `src/train/manager.ts:177-213`
- Impact: Silent training corruption or hard hangs; very hard to diagnose.
- Fix approach: Add a monotonic request id to each `send_and_receive` payload and have the frontend echo it in the reply (e.g., in `TrainManager.onData`), then drain/ignore mismatched ids in `recv()`.

**Stub / unimplemented code committed as part of an in-progress refactor:**
- Issue: `src/body/role.ts` is an untracked new file whose entire `Role` class throws `Method not implemented.` for every method. `src/map/base.ts` and `src/body/types.ts` have uncommitted modifications (see `git status`), and `src/scene/sword1v1/scene.ts:622` `getState()` also throws `Method not implemented.`
- Files: `src/body/role.ts:12-47`, `src/scene/sword1v1/scene.ts:621-623`, `src/map/base.ts`, `src/body/types.ts`
- Impact: The body/map abstraction layer is half-migrated; the working tree is dirty and not shippable as-is.
- Fix approach: Finish or shelve the wrapper refactor before merging; do not leave `throw new Error('Method not implemented.')` in tracked code.

**Dead / unused dependency and stale server config:**
- Issue: `flask==3.1.1` is in `requirements.txt` but has no import anywhere in `model/`. `vite.config.ts` still proxies `/upload-frame`, `/frame-end`, `/ping` to `http://localhost:8076`, which are the endpoints of the removed Flask HTTP server (replaced by WebSockets in commit `a081b8e refactor: 换用 ws`). The frontend never issues those requests.
- Files: `requirements.txt:6`, `vite.config.ts:28-31`
- Impact: Misleading config; developers waste time chasing non-existent HTTP routes.
- Fix approach: Remove `flask` from `requirements.txt` and delete the dead `server.proxy` block.

**Stale bytecode caches for deleted modules:**
- Issue: `model/__pycache__/` contains compiled bytecode for `train_rllib.cpython-39.pyc`, `train_rllib.cpython-312.pyc`, `ws_client.cpython-39.pyc`, and `ws_client.cpython-312.pyc`, but no `train_rllib.py` or `ws_client.py` source exists (renamed in commits `a30ac7f chore: 修改文件名称` and `a081b8e`).
- Files: `model/__pycache__/train_rllib.cpython-*.pyc`, `model/__pycache__/ws_client.cpython-*.pyc`
- Impact: Signals an abandoned implementation path; the mixed 3.9/3.12 caches (see Scaling/Environment notes) indicate interpreter drift.
- Fix approach: Delete `__pycache__` (already gitignored) and ensure only one interpreter is used.

**Duplicated ~120-line physics renderer in two places:**
- Issue: The entire marble/sword/helmet/damage-popup canvas drawing routine is copy-pasted between the scene and its UI component, with small divergences already present (stroke `lineWidth` 4 vs 6; hp bar width).
- Files: `src/scene/sword1v1/scene.ts:72-208` and `src/scene/sword1v1/component.tsx:89-229`
- Impact: Any visual fix must be applied twice; the two copies will drift (they already have).
- Fix approach: Extract a single `drawBattleWorld(ctx, scene, scale)` helper and call it from both `render()` and `drawScene()`.

**Naming / typo debt:**
- Issue: `const IVALID_FRAME` (missing `N`) in `src/scene/sword1v1/scene.ts:31`; `GameUI` id string `'sowrd1v1-scene'` (misspelled "sword") in `src/scene/sword1v1/component.tsx:325`; method `initializetrain()` (lowercase `t`) in `src/main.tsx:48`; duplicated `this.bodyIdMap.clear();` statement in `src/map/base.ts:53-54`; mismatched/never-closed `//#region` in `src/setup.ts:3-11`.
- Files: `src/scene/sword1v1/scene.ts:31`, `src/scene/sword1v1/component.tsx:325`, `src/main.tsx:48`, `src/map/base.ts:54`, `src/setup.ts`
- Impact: Low runtime risk, high grep/confusion cost; the duplicate `.clear()` strongly suggests a copy-paste bug.
- Fix approach: Rename via IDE refactor; delete the duplicate `.clear()`.

## Known Bugs

**Distance-shrinking reward term is always zero:**
- Symptoms: The "approach penalty" intended to teach the marbles to close distance never influences training.
- Files: `src/train/sword1v1/train.ts:218-237`
- Trigger: Always — `const [ballA, ballB] = this.scene.balls;` then `const lastLength = posA...sub(posB).length(); const nowLength = posA...sub(posB).length();` computes `lastLength` and `nowLength` from the *same* positions in the same tick, so `(nowLength - lastLength)` is identically `0`.
- Workaround: None; reward term is inert.
- Fix approach: Cache the previous-tick distance (e.g., `this.lastLength`) and compute `nowLength - this.lastLength` before updating it.

**Unbounded listener leak in the training loop:**
- Symptoms: Every logical frame adds a new `tickEnd` listener that is never removed. `eventemitter3` warns after 10 listeners; memory grows without bound over a multi-hour training run.
- Files: `src/workflow.ts:31-36`
- Trigger: Each iteration of `TrainWorkflow.start()` → `process()` registers `this.train.on('tickEnd', () => res())` on the long-lived `TrainManager` emitter (`src/train/manager.ts:242-244`), and `tickEnd` is emitted every frame (`src/train/sword1v1/train.ts:354`).
- Workaround: None.
- Fix approach: Use `once('tickEnd', ...)` or a single persistent listener that resolves a stored pending promise, and remove the listener after it fires.

**`WebSocketServer.is_connected()` never goes false after a client disconnects:**
- Symptoms: `train.py`'s startup wait (`model/train.py:57-62`) can report "Client connected" and proceed even though the browser tab closed; `handler` only adds to `self.connections` and never removes on close.
- Files: `model/ws.py:18-32`, `model/train.py:56-62`
- Trigger: Client connects then disconnects; the `ConnectionClosed` exception escapes the `while True` (only `asyncio.TimeoutError` is caught) and the websocket object is never discarded from `self.connections`.
- Workaround: Restart the Python process.
- Fix approach: Wrap the handler body in `try/finally`, `self.connections.discard(websocket)` on exit, and catch `websockets.exceptions.ConnectionClosed`.

**`main` blocks forever in `recv()` if no reply arrives:**
- Symptoms: Training hangs with no timeout or error if the frontend stops replying (crash, tab closed, JSON error on the JS side).
- Files: `model/ws.py:52-58`, `model/ws.py:68-75`
- Trigger: Any missing/corrupt reply; `recv()` is an untimed busy-wait `sleep(0.01)` loop.
- Workaround: Kill the process.
- Fix approach: Add a timeout to `recv()` (and `send_and_receive`) that raises a clear error.

**`frame.py` crashes on double `end_frame()`:**
- Symptoms: `AttributeError: 'NoneType' object has no attribute 'stdin'` when both the `"finish"` message and the `atexit` handler fire.
- Files: `model/frame.py:22-27`, `model/frame.py:42-43`, `model/frame.py:57`
- Trigger: Frontend sends `"finish"` (sets `ffmpeg_process = None`) and then the process exits, invoking `atexit.register(on_exit)` → `end_frame()`.
- Workaround: None.
- Fix approach: Guard `end_frame()` with `if ffmpeg_process is None: return`.

**Contact handler can dereference an undefined `damageInfo` entry:**
- Symptoms: `TypeError: Cannot read properties of undefined (reading 'lastContact')` if a contact event fires for a color not present in `this.colors` (e.g., before `onReset` populates arrays).
- Files: `src/train/sword1v1/train.ts:136-142`
- Trigger: `contact` handler does `this.damageInfo[aIdx].lastContact` with no `aIdx === -1` guard, unlike the `attack` handler at `src/train/sword1v1/train.ts:115-117`.
- Workaround: None.
- Fix approach: Apply the same `indexOf === -1` guard in the `contact` handler.

## Security Considerations

**Training control socket binds to all interfaces with no authentication:**
- Risk: `WebSocketServer` defaults to `host='0.0.0.0'` and port `8075`. Anyone on the same network can connect, inject actions/`load`/`save` payloads, or read the training state. There is no origin check, token, or TLS.
- Files: `model/ws.py:9`, `src/train/manager.ts:158`
- Current mitigation: Frontend hardcodes `ws://localhost:8075`, but the server still listens on `0.0.0.0`.
- Recommendations: Bind to `127.0.0.1` by default, and add an origin/token check if remote control is ever needed.

**Broad `try/except` swallows ffmpeg write failures:**
- Risk: Corrupt/partial video silently produced; errors only printed to stdout.
- Files: `model/frame.py:35-38`
- Current mitigation: Exception is caught and logged (`[FFmpeg] 写入失败`).
- Recommendations: Detect a dead ffmpeg process and abort/raise rather than continuing to accept frames.

**No secrets or credential files present (good):**
- `.env*`, `*.pem`, `*.key`, `credentials*`, `secrets*` — none exist. `.conda/`, `checkpoint/`, `video/`, `__pycache__/` are gitignored and confirmed untracked. No action needed.

## Performance Bottlenecks

**Per-frame JPEG encoding + WebSocket upload at 60 FPS:**
- Problem: `RecordWorkflow` awaits `recorder.capture()` every loop iteration, which performs a synchronous-quality `canvas.toBlob(..., 'image/jpeg')` per frame and streams raw JPEG bytes over `ws://localhost:8076` to ffmpeg.
- Files: `src/workflow.ts:16-23`, `src/utils/record.ts:31-42`, `src/utils/upload.ts:19-22`
- Cause: Full-canvas encode + network transfer on the main thread's animation cadence.
- Improvement path: Throttle capture to the true recording rate, use `OffscreenCanvas.convertToBlob` off the main thread, or batch frames; consider `requestVideoFrameCallback`.

**Python reply loop is a 0.1 s polling busy-wait per connection:**
- Problem: `handler()` wakes every 100 ms to poll `send_queue` and `recv()`, adding up to 100 ms latency to every request/reply and burning CPU even when idle. `recv()` additionally spins at 10 ms in the main thread.
- Files: `model/ws.py:21-32`, `model/ws.py:52-58`
- Cause: Polling instead of `asyncio.Queue`-driven wakeups.
- Improvement path: Use an `asyncio.Queue` with an event/`asyncio.Event` to await sends instead of polling.

**Unbounded message/send queues:**
- Problem: `Queue()` with no `maxsize`; if the consumer stalls, memory grows without limit.
- Files: `model/ws.py:12-13`
- Cause: No backpressure.
- Improvement path: Bound the queues and handle `queue.Full`.

**2.4 MB background image loaded for every scene reset/load:**
- Problem: `public/battle.webp` (2,477,260 bytes) is drawn each frame (`ctx.drawImage`) at full canvas size; combined with per-frame JPEG capture this dominates frame cost.
- Files: `public/battle.webp`, `src/scene/sword1v1/scene.ts:74`, `src/scene/sword1v1/component.tsx:91`
- Cause: Large committed asset redrawn per frame.
- Improvement path: Pre-render to an offscreen canvas once; downscale the asset if detail is not needed.

## Fragile Areas

**WebSocket handshake/ordering between Python and browser:**
- Files: `model/ws.py`, `model/env.py`, `src/train/manager.ts`
- Why fragile: No protocol version, no message correlation, no disconnect cleanup, single shared `ws` singleton (`model/ws.py:77`), and a `send_queue` that retains messages across disconnects so stale frames are delivered on reconnect.
- Safe modification: Change both sides together; add a version/handshake field and correlation ids before extending the protocol.
- Test coverage: None.

**Multiple event loops / daemon threads with shared mutable state:**
- Files: `model/ws.py:39-46` (server thread + loop), `model/frame.py:51-61` (separate thread + loop), `model/train.py:104`
- Why fragile: Two independent `asyncio` loops in two daemon threads; `self.connections` is mutated from the async thread and read from the main thread (`is_connected`) with no lock; `ffmpeg_process` is a module global mutated from an atexit path.
- Safe modification: Introduce explicit locks or route all cross-thread work through queues.
- Test coverage: None.

**Scene/trainer wiring is order-dependent and hard-coded:**
- Files: `src/main.tsx:42-59`, `src/train/manager.ts:215-225`, `src/train/sword1v1/train.ts:110-150`
- Why fragile: `Main` hard-codes `Sword1v1Scene`/`Sword1v1Train`; `TrainProcess.initialize()` looks its scene up by string id AND `onBind` sets it again (redundant); `TrainManager.changeTo` silently no-ops if the process isn't registered. Adding a scene requires edits in `main.tsx`, `setup.ts`, and the manager.
- Safe modification: Register scenes/trainers through a table rather than direct `new` calls in `Main`.
- Test coverage: None.

**`frame.py` runs ffmpeg as a side effect of import:**
- Files: `model/frame.py:8-20`, `model/train.py:12`
- Why fragile: `import` of `model.frame` (via `model.train`) immediately starts an ffmpeg subprocess writing to `os.getcwd()/video/output.mp4`; importing the module for any reason (tests, tooling) spawns a process and a file.
- Safe modification: Move `Popen` into `start()`.

**`map/base.ts` `reset()` iterates while mutating and depends on `addedBody` replay order:**
- Files: `src/map/base.ts:48-62`
- Why fragile: `removeBody` deletes from `addedBody`, then `reset()` re-creates bodies from the surviving `addedBody` map; the duplicate `bodyIdMap.clear()` hints a missed `idMap.clear()`. Getting this wrong silently drops or duplicates bodies.
- Safe modification: Add explicit `idMap.clear()` and unit-test reset with multiple bodies.
- Test coverage: None.

## Scaling Limits

**Hard-coded 1000-iteration training loop and single-process Ray:**
- Current capacity: `for i in range(1000)` in `model/train.py:82`, `num_env_runners=0` (single env, no parallel rollout), `train_batch_size=600`.
- Limit: Cannot scale beyond a single browser client enforcing one game world; `reset()`/`step()` are fully synchronous over one WebSocket.
- Scaling path: Parameterize iterations via CLI; enable multiple env runners would require multiple browser clients (unsupported today).

**Checkpoint accumulation (~140 MB in the working tree, 78 iteration directories):**
- Current capacity: `checkpoint/` holds 78 dirs totalling ~139.6 MB; each holds a ~569 KB `module_state.pkl` plus per-runner state. Saved every 5 iterations (`model/train.py:90`).
- Limit: Disk growth is linear in iterations with no pruning; a long run will fill disk.
- Scaling path: Add retention/rotation (keep last N + best), or write checkpoints outside the repo tree.

**Video output growth:**
- Current capacity: `video/output.mp4` is 126.6 MB from a single prior run; ffmpeg is invoked with fixed `-b:v 8000k` and `-preset ultrafast` (`model/frame.py:15-16`).
- Limit: Large output at ~8 Mbps regardless of content; no size cap.
- Scaling path: Make bitrate/preset configurable; segment or auto-delete.

## Dependencies at Risk

**`planck-js ^1.3.0`:**
- Risk: Pinned to a major range; the physics behavior (restitution, joints) directly drives training dynamics, so an accidental minor bump can change reward landscapes. `Body.getUserData()` typing is used loosely (`as BallBodyData` casts everywhere).
- Impact: Silently altered physics → invalidated pretrained checkpoints.
- Migration plan: Pin an exact version and add a physics smoke test.

**`@motajs/client ^0.1.2` (pre-1.0):**
- Risk: A `0.x` dependency; breaking changes can land in minor releases. The renderer, UI controller, `GameUI`, `Font`, and custom `tsx` elements all depend on its API.
- Impact: Build/runtime breakage on update.
- Migration plan: Pin exact version; isolate usage behind the wrappers in `src/renderer.ts` and `src/common.ts`.

**`python == 3.9.22` (README) vs bytecode compiled under 3.12:**
- Risk: `model/__pycache__/` contains both `cpython-39` and `cpython-312` artifacts, indicating the environment has drifted from the documented interpreter. `ray==2.46.0` + `numpy==1.26.4` are resolved for one interpreter only.
- Impact: "Works on my machine" failures; checkpoints are pickled and version-sensitive.
- Migration plan: Pin the interpreter (conda env in `.conda/`) and clear cross-version caches.

## Missing Critical Features

**Automated tests — none exist:**
- Problem: No test runner, no test config, no test files. `package.json` has only `dev`/`build`/`preview` scripts; there is no `pytest.ini`/`conftest.py`; `requirements.txt` includes no test dependency.
- Blocks: Any safe refactor of the reward logic, WebSocket protocol, physics wrappers, or map reset.

**No configuration layer:**
- Problem: Every address/port/timeout/rate is a source constant: `ws://localhost:8075` (`src/train/manager.ts:158`), `ws://localhost:8076` (`src/utils/upload.ts:9`), ports `8074/8075/8076` (`vite.config.ts:26-31`, `model/ws.py:9`, `model/frame.py:48`), `MODEL_INTERVAL=6`/`FRAME=60` (`src/setup.ts:9-15`), `timeout=120000` and reward weights (`src/train/sword1v1/train.ts:75,234-270`), output paths via `os.getcwd()` (`model/frame.py:19,58`, `model/train.py:72-94`).
- Blocks: Running against non-local hosts, CI, or reproducible experiments.

**Multi-scene support is planned but the architecture resists it:**
- Problem: README explicitly states training entry will change ("之后会添加新的训练场景，启动训练的方法会有变化"). Today `SCENE` is a single constant (`src/setup.ts:6`) and `Main` directly instantiates `Sword1v1Scene`/`Sword1v1Train` (`src/main.tsx:43,49`). The abandoned `src/body/role.ts`/`src/map/base.ts` wrapper is evidently meant to enable this but is unfinished.
- Blocks: Adding new battle scenarios without invasive edits.

**`record()`/`render()`/`close()` are silent no-ops in the env:**
- Problem: `EvolvedMarbleEnv.render` and `.close` are empty (`model/env.py:58-62`); there is no seed handling (`reset` ignores `seed`) and no `close` that shuts down `ws`/ffmpeg.
- Blocks: Reproducible experiments and clean teardown.

## Test Coverage Gaps

**Reward / episode lifecycle (highest risk):**
- What's not tested: `onReset`, `actionTick`, reward accumulation, timeout/win handling, and the distance-term bug above.
- Files: `src/train/sword1v1/train.ts:152-355`
- Risk: Training silently optimizes the wrong objective.
- Priority: High

**WebSocket protocol contract:**
- What's not tested: Message shapes for `reset`, `resetEpisode`, `save`, `load`, `step`, `action`; disconnect/reconnect behavior; queue draining on reconnect.
- Files: `model/ws.py`, `model/env.py`, `src/train/manager.ts:177-213`
- Risk: Desync/hang bugs (see Known Bugs) ship undetected.
- Priority: High

**Physics / map wrapper (`MapBase`, `BodyBase`, `Role`):**
- What's not tested: `reset()` body replay, `addBody`/`removeBody` id bookkeeping (`idMap` vs `bodyIdMap`), contact dispatch, and the unimplemented `Role`.
- Files: `src/map/base.ts:48-156`, `src/body/base.ts:28-82`, `src/body/role.ts`
- Risk: Silent body leaks/duplication during the in-progress refactor.
- Priority: High

**WebSocket server threading/cleanup:**
- What's not tested: `is_connected()` after disconnect, `recv()` timeout, double `end_frame()`, multiple concurrent clients racing on the shared `send_queue`.
- Files: `model/ws.py:39-66`, `model/frame.py:22-27`
- Risk: Hangs and crashes only appear under real browser interaction.
- Priority: Medium

**Frontend workflow loop:**
- What's not tested: `TrainWorkflow.start/process/waitRender` listener lifecycle (the leak) and ordering against `recorder.capture()`.
- Files: `src/workflow.ts:16-40`
- Risk: Memory growth degrades long runs.
- Priority: Medium

---

*Concerns audit: 2026-10-15*
