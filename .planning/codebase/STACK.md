# Technology Stack

**Analysis Date:** 2026-10-15

## Overview

Evolved Marble is a **hybrid dual-runtime project**: a browser-based physics battle
simulation/visualization (Vue 3 + TypeScript + Vite) that is driven as a training
environment by a separate **Python reinforcement learning stack** (Ray RLlib + PettingZoo).
The two runtimes are coupled over **local WebSockets** (see `INTEGRATIONS.md`).

- Frontend source: `src/` (TypeScript + TSX, bundled by Vite)
- Python RL stack: `model/` (entry point `python -m model.train`)
- Not part of the build, but present on disk: `checkpoint/` (RLlib checkpoint output, binary),
  `node_modules/`, `.conda/` (local Conda environment), `video/` (ffmpeg recording output)

## Languages

**Primary:**
- TypeScript ~5.8.3 - All frontend source under `src/` (`.ts` / `.tsx`)
- Python 3.9.22 - RL training stack under `model/` (`.py`)

**Secondary:**
- JSX/TSX (Vue JSX) - Vue components rendered via `@vitejs/plugin-vue-jsx`, e.g. `src/scene/sword1v1/component.tsx`
- CSS - `src/styles.css` (global reset only)
- HTML - `index.html` mounts the app to `<canvas id="main">`

## Runtime

**Environment:**
- Node.js >= 18 (required by README; Vite 6 requires Node 18+)
- Browser: Chrome >= 71 required; Firefox and Safari are **not supported** (`README.md`)
- Python 3.9.22

**Package Manager:**
- Frontend: pnpm >= 8 (declared in `README.md`); lockfile `pnpm-lock.yaml` present (lockfileVersion 9.0)
- Python: pip with pinned `requirements.txt`; a local Conda env exists at `.conda/` (git-ignored)

**External binaries:**
- ffmpeg >= 7.0.0 - Required at runtime by the Python frame recorder (`model/frame.py` invokes the `ffmpeg` executable directly)

## Frameworks

**Core (frontend):**
- Vue 3.5.14 - UI/reactive component layer (`src/main.tsx`, `src/scene/sword1v1/component.tsx`)
- Vite 6.3.5 - Dev server and build tool (`vite.config.ts`)
- `@vitejs/plugin-vue-jsx` 4.2.0 - Enables TSX/JSX Vue components and custom elements
- `@motajs/client` 0.1.2 - Rendering/game engine toolkit: `MotaRenderer`, `UIController`, `GameUI`, `Sprite`, `Font`, `MotaOffscreenCanvas2D`, `createApp`, `onTick` (used throughout `src/renderer.ts`, `src/scene/**`, `src/body/**`, `src/map/**`)
- `planck-js` 1.3.0 - 2D rigid-body physics engine (Box2D port); drives the battle simulation (`src/scene/sword1v1/scene.ts`, `src/map/base.ts`, `src/body/**`)

**Core (Python RL):**
- Ray 2.46.0 / Ray RLlib - Distributed RL; PPO algorithm with LSTM model (`model/train.py`)
- PettingZoo 1.25.0 - Multi-agent environment API (`ParallelEnv`); `model/env.py`
- Gymnasium 1.0.0 - Action/observation `Box` spaces; `model/env.py`
- websockets 15.0.1 - Async WebSocket server bridging Python and the browser (`model/ws.py`, `model/frame.py`)

**Build/Dev:**
- TypeScript compiler (`tsc && vite build`) - `package.json` `build` script
- ESLint 9.27.0 (flat config, `eslint.config.js`) with `typescript-eslint` 8.33.0
- Prettier 3.6.2 wired through `eslint-plugin-prettier` 5.4.1 (`eslint.config.js`, `.prettierrc`)
- `@types/node` 22.15.30, globals 16.2.0

**Testing:**
- Not detected. No test runner, test config, or `*.test.*` / `*.spec.*` files present.

## Key Dependencies

**Critical (frontend):**
- `@motajs/client` 0.1.2 - The entire rendering/game-UI foundation; nothing renders without it
- `planck-js` 1.3.0 - Physics simulation; battle dynamics, contact detection, joints
- `vue` 3.5.14 - Component model and reactivity (`defineComponent`, `ref`, `shallowReactive`)
- `eventemitter3` 5.0.1 - Event bus used across scenes, bodies, maps, trainer, recorder
- `mutate-animate` 1.4.2 - `Ticker` used for animation-frame excitation (`src/utils/excite.ts`)

**Infrastructure (frontend):**
- `lodash-es` 4.17.21 - Utility (`isNil`) in `src/map/base.ts`; `@types/lodash-es` present

**Critical (Python):**
- `ray` 2.46.0 - RLlib PPO trainer, checkpoint save/load
- `pettingzoo` 1.25.0 + `gymnasium` 1.0.0 - Multi-agent env interface and spaces
- `websockets` 15.0.1 - Transport to browser
- `numpy` 1.26.4 - Observation arrays (dtype `float32`)

**Declared but unused:**
- `flask` 3.1.1 - Listed in `requirements.txt` but **not imported anywhere** in `model/` (no Flask app/route found). Its purpose is unclear / likely vestigial.

## Configuration

**Environment:**
- No `.env` files or environment-variable-driven configuration detected.
- Frontend dev server config in `vite.config.ts`: port `8074`, `base: './'`, path alias `@` → `src/`.
- Dev proxy in `vite.config.ts` routes `/upload-frame`, `/frame-end`, `/ping` → `http://localhost:8076`.
- TypeScript config in `tsconfig.json`: strict mode, `target`/`module` ESNext, `moduleResolution: bundler`, `jsx: preserve` with `jsxImportSource: vue`, path alias `@/*` → `src/*`.
- Python training CLI args (via `argparse` in `model/train.py`): `--resume` (bool, default `False`), `--from_state` (int, default `0`).

**Build:**
- `package.json` scripts: `dev` (`vite`), `build` (`tsc && vite build`), `preview` (`vite preview`).
- Lint config: `eslint.config.js` (ignores `node_modules`, `dist`, `public`; `no-console: warn`; `eqeqeq: always`).
- Format config: `.prettierrc` (printWidth 80, tabWidth 4, single quotes, semi, no trailing comma, arrow parens avoided).
- `index.html` is the Vite entry; loads `/src/main.tsx`.

## Platform Requirements

**Development:**
- Node.js >= 18, pnpm >= 8, Python 3.9.22, ffmpeg >= 7.0.0, Chrome >= 71.
- Run frontend: `pnpm i` then `pnpm dev`.
- Run training: `python -m model.train` (must be launched from repo root; paths in `model/train.py` are relative to CWD).

**Production:**
- No deployment configuration detected (static Vite build output only). The Python stack runs a local WebSocket bridge and writes checkpoints to `checkpoint/` and video to `video/`.

## Notable Build/Asset Details

- `index.html` references `/vite.svg`; `battle.webp` background is loaded via `${import.meta.env.BASE_URL}battle.webp` in `src/scene/sword1v1/scene.ts`.
- Custom JSX element names (`container`, `sprite`, `text`, `g.*`, etc.) are declared in `vite.config.ts` so Vite does not treat them as Vue components.
- `checkpoint/*` contains per-iteration RLlib checkpoints (numeric dirs `5` … `390`) plus `custom.json` sidecar files; these are binary training artifacts (git-ignored, see `.gitignore`).

## License

- GNU General Public License v3.0 (`LICENSE`).

---

*Stack analysis: 2026-10-15*
