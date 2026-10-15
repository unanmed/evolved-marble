# External Integrations

**Analysis Date:** 2026-10-15

## Overview

All integration in this project is **local machine-to-machine over WebSockets**, connecting
the browser frontend (`src/`) to a Python process on the same host. There are **no third-party
cloud APIs, no remote SaaS SDKs, no auth providers, and no external databases**. The Python
side additionally shells out to the **ffmpeg** binary for video encoding.

## APIs & External Services

**None (cloud/SaaS):**
- No Stripe, Supabase, AWS, or other third-party API SDKs detected anywhere in `src/` or `model/`.

**Local custom protocols:**
- **RL training channel** — bidirectional JSON WebSocket at `ws://localhost:8075`
  - Browser client: `src/train/manager.ts` (`TrainManager.socket = new WebSocket('ws://localhost:8075')`)
  - Python server: `model/ws.py` (`WebSocketServer(host='0.0.0.0', port=8075)`) started by `model/train.py`
  - Purpose: RLlib sends `reset` / `resetEpisode` / `save` / `load`; browser sends observations, rewards, termination flags, and action results.
  - Protocol messages are JSON objects with a `type` discriminator: `reset`, `resetEpisode`, `save`, `load`, `step`, `action` (see `src/train/manager.ts` `onData` and `model/env.py`).
- **Frame recording channel** — one-way binary WebSocket at `ws://localhost:8076`
  - Browser client: `src/utils/upload.ts` (`RecordUploader`, sends JPEG frame `Blob`s and a `"finish"` string)
  - Python server: `model/frame.py` (`websockets.serve(frame_handler, "localhost", 8076)`) started by `model/train.py`
  - Purpose: stream rendered canvas frames to Python, which pipes them into ffmpeg.
  - Vite dev proxy also forwards `/upload-frame`, `/frame-end`, `/ping` → `http://localhost:8076` (`vite.config.ts`).

## Data Storage

**Databases:**
- None. No SQL/NoSQL client or connection string detected.

**File storage:**
- **Local filesystem only.**
  - `checkpoint/` - Ray RLlib checkpoint output written by `model/train.py` (`algo.save_checkpoint(...)`), one numeric directory per saved iteration (`5`, `10`, … `390`), each also containing a `custom.json` sidecar with browser-side save data (`episode`, `colors`, `wins`).
  - `video/output.mp4` - Encoded training video produced by ffmpeg (`model/frame.py`, path built from `os.getcwd()`).
  - Checkpoints and video are git-ignored (`.gitignore`: `checkpoint`, `video`, `test.json`).

**Caching:**
- None.

**In-memory state (frontend):**
- `TrainManager.list` / `_process` and `TrainProcess.dataQueue` hold queued training messages in the browser (`src/train/manager.ts`, `src/train/sword1v1/train.ts`).
- `MapBase` maintains world/body-id maps in memory (`src/map/base.ts`).

## Authentication & Identity

**Auth Provider:**
- None. WebSocket endpoints are unauthenticated and bound to the local host. The Python RL socket binds to `0.0.0.0:8075` (all interfaces), while the frame socket binds to `localhost:8076` only.

## Monitoring & Observability

**Error Tracking:**
- None. No Sentry/Rollbar/Datadog or equivalent.

**Logs:**
- Frontend: `console.log` on socket open/connect (`src/train/manager.ts:161`, `src/utils/upload.ts:12`); ESLint enforces `no-console: warn`.
- Python: `print` statements to stdout for training metrics (`model/train.py` prints per-iteration Red/Blue reward), connection status, and ffmpeg/WebSocket errors (`model/frame.py`, `model/ws.py`).

## CI/CD & Deployment

**Hosting:**
- None detected. No Dockerfile, no deploy scripts, no cloud config.

**CI Pipeline:**
- None detected (no `.github/workflows`, no CI config files).

## Environment Configuration

**Required env vars:**
- None. No `.env` files present; no `process.env` / `os.environ` usage driving configuration.
- All configuration is hardcoded (ports in `model/ws.py`, `model/frame.py`, `src/train/manager.ts`, `src/utils/upload.ts`; training hyperparameters in `model/train.py`).

**Secrets location:**
- Not applicable — no secrets or credentials are used or stored in the repository.

## Webhooks & Callbacks

**Incoming:**
- None (no HTTP webhook endpoints).

**Outgoing:**
- None (no outbound webhook registration).

## Machine-Learning Integration Contract

The Python env and browser trainer exchange a fixed JSON schema (the de-facto integration contract):

- **Observation** — per agent (`red`, `blue`), a normalized `float32` vector. Final shape `(16,)` = 8 self features + 8 opponent features (`model/env.py` `Box(shape=(16,))`; assembled in `src/train/sword1v1/train.ts` `onReset`/`actionTick`).
- **Action** — per agent, `Box(shape=(3,))` = `[linear.x, linear.y, angular]` (`model/env.py`).
- **Step payload** — browser sends `{ observation, reward, termination, truncation, info }` (`src/train/sword1v1/train.ts` `BattleSendData`), consumed by `model/env.py` `step`.
- **RLlib config** — PPO with shared policy, LSTM (`lstm_cell_size=64`, `max_seq_len=32`), `gamma=0.99`, `lr=1e-4`, `train_batch_size=600`, `num_env_runners=0` (`model/train.py`).

## ffmpeg Integration

- **Tool:** `ffmpeg` executable invoked via `subprocess.Popen` in `model/frame.py`.
- **Pipeline:** raw MJPEG frames from the browser are written to ffmpeg's stdin (`-f image2pipe -vcodec mjpeg -framerate 60`) and encoded to H.264 (`-c:v libx264 -preset ultrafast -b:v 8000k -pix_fmt yuv420p`) into `video/output.mp4`.
- **Lifecycle:** ffmpeg starts on process import, receives frames over the WS 8076 handler, and closes on a `"finish"` message or atexit (`model/frame.py` `end_frame` / `on_exit`).

---

*Integration audit: 2026-10-15*
