---
phase: 05-render-system
plan: 05
subsystem: render-hud-and-damage-seam
tags:
    [
        typescript,
        render,
        hud,
        health-bar,
        damage-events,
        decorator,
        pure-functions,
        vitest
    ]

# Dependency graph
requires:
    - phase: 05-render-system (plan 05-01)
      provides: the frozen IHudTimers/IHudConfig/IHudFrame/IDamageFeed/IRenderDamageEvent/UnitStateLookup contract
    - phase: 05-render-system (plan 05-02)
      provides: DEFAULT_RENDER_CONFIG (hud/effects/camera values) and MAX_BUFFERED_DAMAGE_EVENTS
    - phase: 05-render-system (plan 05-03)
      provides: smoothstep/lerp in cameraMath.ts, reused for the hybrid bar transition
    - phase: 05-render-system (plan 05-04)
      provides: makeApplyingSink/makeLethalSink/makeRejectingSink/makeLookup/makeUnitState shared fakes
    - phase: 03-control-system
      provides: IDamageSink/IDamageContext and the damage routing order (sink call before dead-unit unregistration)
    - phase: 04-kingdom-system
      provides: BattleDamageSink, the production inner sink this decorator wraps
provides:
    - src/render/hudModel.ts — healthRatio, registerDamage, isHealthVisible, computeHudScale, pruneTimers, computeShakeImpulsePx (pure, Pixi-free, frame-counted)
    - src/render/DamageTap.ts — RenderDamageTap implements IDamageSink, IDamageFeed (applied-only recording, pre-removal death position, bounded buffer)
    - tests/render/hud-model.test.ts — 19 tests over clamp/timers/always-on/prune/hybrid scale/shake
    - tests/render/damage-tap.test.ts — 10 tests over applied-only/death snapshot/cap/drain/clear/throw
affects:
    [
        05-07 Hud (consumes all six HUD functions and IDamageFeed),
        05-08 composition root (wraps BattleDamageSink in RenderDamageTap),
        05-10 Chrome UAT and visual calibration
    ]

# Actuals (#2632) — pairs with the plan's `estimate` to calibrate future estimates.
# Same estimateTokens scale (chars/4 over the realized diff), never a harness token count.
actuals:
    tokens: 7576
    tasks: 2
    commits: 2
    plan_head_before: cf31dd9e43e5890040b810b8d15f5b0de4efabf7

# Tech tracking
tech-stack:
    added: []
    patterns:
        - 'Frame-counted HUD state: visibility deadlines live in the caller-owned IHudTimers Map keyed by output frame index; no wall-clock, no Date, no timer'
        - 'Reset-not-accumulate timer: each hit overwrites visibleUntil[defenderId] = frameIndex + frames; a kill deletes the entry immediately'
        - 'Hybrid scale with an honest non-monotonic factor: the factor lerps from 1 to the screen-constant formula via smoothstep, while the asserted property is screen-pixel width (barWorldWidth × scale × factor)'
        - 'Sink decorator as the only legal read seam: call the inner sink first, then treat observed HP loss or an alive→dead transition as the sole evidence of an applied hit'
        - 'Snapshot-at-call death position: getUnitState(defenderId) is read inside applyDamage, the only window before ControlSystem unregisters the body'
        - 'Bounded event buffer: MAX_BUFFERED_DAMAGE_EVENTS caps the array and drops oldest first; drain swaps the array so callers never alias live storage'

key-files:
    created:
        - src/render/hudModel.ts
        - src/render/DamageTap.ts
        - tests/render/hud-model.test.ts
        - tests/render/damage-tap.test.ts
    modified: []

key-decisions:
    - 'registerDamage hardens the plan formula: non-finite fps/seconds count as 0 and frames is clamped to at least 1, so a malformed config can never write NaN deadlines that silently hide every bar (T-05-25)'
    - 'computeHudScale documents that the raw factor is deliberately non-monotonic (it peaks before settling); D-09 is asserted on barWorldWidth × cameraScale × factor, which is 14 px at worldScaleAt, 36 px at screenScaleAt and non-decreasing in between'
    - 'computeShakeImpulsePx triggers on maxDamage >= threshold (and on any kill), uses a 3× multiplier when the threshold is 0, and returns a finite value without re-clamping to shakeAmplitudePx — the accumulated amplitude cap belongs to Camera (05-03)'
    - 'RenderDamageTap records appliedDamage = max(0, healthBefore - healthAfter) instead of event.damage, so overkill is excluded and numbers reflect what the battle rules actually removed'
    - 'Buffer overflow trims with a while/shift loop so the invariant holds even if a future edit pushes more than one event per call'
    - 'The tap skips the event when getUnitState returns null rather than inventing a position (AGENTS §8: missing object → null)'
    - 'The cap test uses 0.1 damage per hit so 522 hits stay far below a Swordsman max HP, keeping the defender alive for the whole bound check'

patterns-established:
    - 'Pure HUD module shape: header naming D-06/D-07/D-08/D-09/D-17, one private nonNegativeFinite guard, then the six exported functions in dependency order, each with JSDoc stating the contract and the division of responsibility'
    - 'Decorator class shape: two readonly injected dependencies plus one mutable buffer, a JSDoc constructor, and exactly the interface methods as public members (no getters)'
    - 'Adversarial fake-driven test shape: rejecting/applying/lethal sinks model the battle filters, a mutable Map models removal after death, and an inline throw-only sink proves exception semantics'

requirements-completed: [REND-03, REND-05]

# Coverage metadata (#1602).
coverage:
    - id: D1
      description: 'healthRatio clamps Health/MaxHealth to [0,1] and returns 0 for non-finite inputs, negative health or a non-positive/NaN maximum, so a bar can never leave its track or take a NaN width (D-07)'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#returns the clamped fraction for ordinary values'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#clamps negative health and health above the maximum'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#returns 0 for a non-positive or non-finite maximum and NaN health'
            status: pass
      human_judgment: false
    - id: D2
      description: 'Health bars stay visible for exactly round(outputFps × healthBarSeconds) output frames (450 at 30 fps, 225 at 15 fps), reset rather than accumulate on a second hit, disappear immediately on a kill, and are always on below 6 living units (D-07/D-17)'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#keeps the bar visible for exactly 450 frames at 30 fps'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#keeps the bar visible for exactly 225 frames at 15 fps'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#resets the deadline on a second hit instead of accumulating'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#removes the entry immediately on a killing blow'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#shows every bar unconditionally below the threshold and requires a timer at it'
            status: pass
      human_judgment: false
    - id: D3
      description: 'pruneTimers deletes timer entries for units no longer alive while keeping live ones, so the HUD Map cannot grow with the dead (T-05-07/T-05-23)'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#keeps entries for live units and removes the rest'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#keeps both entries when both units are live'
            status: pass
      human_judgment: false
    - id: D4
      description: 'computeHudScale returns 1 at/below worldScaleAt, the screen-constant factor at/above screenScaleAt, falls back to 1 for non-positive/NaN scale, and keeps the screen-pixel width endpoint-exact (14 px → 36 px) and non-decreasing across the transition (D-09)'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#is exactly 1 at the world-sized endpoint and below it'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#is the screen-constant factor at and above the screen endpoint'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#keeps the screen-pixel width non-decreasing and endpoint-exact'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#falls back to the world-sized factor for a non-positive or NaN scale'
            status: pass
      human_judgment: false
    - id: D5
      description: 'computeShakeImpulsePx returns 0 without events or below the damage threshold, returns the configured amplitude at the threshold and 3× at triple it, triggers on a kill, uses the frame maximum, stays finite for NaN damage or a zero threshold, and never exceeds 3 × shakeAmplitudePx (D-06/D-10)'
      requirement: 'REND-03'
      verification:
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#returns 0 without events or below the damage threshold'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#returns the configured amplitude at the threshold and 3x at triple the threshold'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#triggers on a kill even when the applied damage is low'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#uses the largest damage of the frame and never exceeds the 3x cap'
            status: pass
          - kind: unit
            ref: 'tests/render/hud-model.test.ts#is finite for NaN damage and for a zero threshold'
            status: pass
      human_judgment: false
    - id: D6
      description: 'RenderDamageTap implements IDamageSink and IDamageFeed with no other public member: rejected hits record nothing, applied hits record exactly the HP lost, a killing blow records killed + level + the pre-removal position, a missing lookup skips the event, the buffer is capped at MAX_BUFFERED_DAMAGE_EVENTS, drain returns a fresh array, clear drops pending events, and an inner throw propagates without recording (T-05-19/T-05-21/T-05-22, Pitfall 9/10)'
      requirement: 'REND-03, REND-05'
      verification:
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#records nothing when the inner sink rejects the hit'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#records exactly the HP lost for an applied hit'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#records a killing blow with the position read before removal'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#records nothing for an already dead defender whose HP cannot drop'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#skips the event entirely when the physics state is missing'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#caps the buffer and drops the oldest events first'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#drains into a fresh array and empties the buffer'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#discards pending events on clear'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#propagates an inner exception without recording anything'
            status: pass
          - kind: unit
            ref: 'tests/render/damage-tap.test.ts#copies teams, part, weapon and armour verbatim'
            status: pass
      human_judgment: false
    - id: D7
      description: 'Both modules stay pure and contract-compliant: hudModel imports no Pixi and reads no wall-clock, DamageTap imports no Pixi and uses no randomness or clock, and src/render/types.ts plus every Phase 1–4 file is byte-identical'
      requirement: 'REND-05'
      verification:
          - kind: other
            ref: 'node presence check over src/render/hudModel.ts → HUD_MODEL_OK'
            status: pass
          - kind: other
            ref: 'node presence check over src/render/DamageTap.ts → DAMAGE_TAP_OK'
            status: pass
          - kind: integration
            ref: 'pnpm test — 42 files / 460 tests passed (baseline 40 / 431 + 2 files / 29 tests)'
            status: pass
          - kind: other
            ref: 'pnpm typecheck exit 0 and pnpm lint exit 0'
            status: pass
      human_judgment: false

# Metrics
duration: ~7min
completed: 2026-10-23
status: complete
---

# Phase 5 Plan 05: HUD 模型与伤害旁路 Summary

**血条的显隐与缩放现在是纯函数（15 s = 450/225 输出帧、少于 6 单位常亮、屏幕像素宽度 14 px → 36 px 非递减），伤害与死亡经一个只记录“内层真正结算”的装饰器到达渲染层，死亡位置在刚体被注销前捕获。**

## Performance

- **Duration:** ~7 min
- **Started:** 2026-10-23T15:39:38Z
- **Completed:** 2026-10-23T15:46:08Z
- **Tasks:** 2
- **Files modified:** 4 (all created)

## Accomplishments

- `src/render/hudModel.ts` 把 HUD 的全部“何时显示、显示多大、晃多厉害”变成六个纯函数。它只导入 `@/render/types` 与 `@/render/cameraMath`（复用 `smoothstep`/`lerp`），不导入 Pixi、不含类、不持有模块状态、不读 wall-clock，因此整套规则在 Node/Vitest 下直接可测（D-07/D-17）。
- `healthRatio` 对非有限值、负生命与非正上限一律返回 0，其余钳制到 `[0, 1]`，血条永不越出轨道、永不拿到 NaN 宽度（D-07）。
- `registerDamage` 在循环外只算一次 `round(outputFps × seconds)`：30 fps → 450 帧、15 fps → 225 帧；再次受击**重置**期限而非累加，致命一击立即删除条目；`isHealthVisible` 在 `totalUnits < 6` 时无条件返回 true，否则要求 `frameIndex < visibleUntil`（期限不含端点）。`pruneTimers` 以一次性 Set 清理已消失单位，Map 不随死亡增长（T-05-23）。
- `computeHudScale` 实现 D-09 混合模式：`t = smoothstep(worldScaleAt, screenScaleAt, scale)`，系数从 1 连续过渡到 `(screenBarWidthPx / barWorldWidth) / scale`。JSDoc 明确写出**系数本身非单调**（它在到达 `screenScaleAt` 前先达峰值再回落），D-09 断言的是屏幕像素宽度 `barWorldWidth × scale × 系数`：在 `worldScaleAt` 恰为 14 px，在 `screenScaleAt` 恰为 36 px，中间非递减，之后保持 36 px。
- `computeShakeImpulsePx` 让震动由真实伤害数据驱动（D-06/D-10）：低于阈值且无击杀返回 0，否则 `clamp(maxDamage / threshold, 1, 3) × shakeAmplitudePx`；阈值 0 时任何真实命中都触发，NaN 伤害被忽略，结果始终有限且不超过 3× 振幅——累计振幅的封顶明确留给 05-03 的 `Camera`。
- `src/render/DamageTap.ts` 是阶段唯一的合法读取缝（G-3）：`RenderDamageTap implements IDamageSink, IDamageFeed`，先调用内层 `BattleDamageSink`（保留全部过滤），再以 `healthBefore - healthAfter` 或 `wasAlive && !isAlive()` 作为“确实结算”的唯一证据。被静默拒绝的同队/异场/已死/缺物理读数命中不会闪白、不会飘数字（Pitfall 9/T-05-21）。
- 击杀当刻立即 `getUnitState(defenderId)` 并把坐标、`killed`、等级、武器/防具、双方阵营一并快照；`ControlSystem` 随后的注销再也不影响已记录的事件（Pitfall 10）。
- 缓冲以 `MAX_BUFFERED_DAMAGE_EVENTS` 封顶、最旧先丢；`drain()` 换出新数组、`clear()` 丢弃未读；内层抛异常时缓冲保持原样，绝不半记录（T-05-22）。
- `pnpm test` 为 42 文件 / 460 测试（基线 40 / 431 加 19 + 10），`pnpm typecheck` 与 `pnpm lint` 退出 0，存在性检查打印 `HUD_MODEL_OK` 与 `DAMAGE_TAP_OK`。

## Task Commits

Each task was committed atomically:

| Task | Name | Commit | Type |
| ---- | ---- | ------ | ---- |
| 1 | Pure HUD model (health clamp, frame timers, hybrid scale, shake impulse) | `166cf72` | feat |
| 2 | Damage/death decorator recording only applied hits | `5740f3a` | feat |

_Measured via the plan ledger: `git rev-list --count cf31dd9..HEAD` = 2 task commits at SUMMARY write time (`plan_head_before: cf31dd9`)._

## Files Created/Modified

- `src/render/hudModel.ts` (created, 194 lines) — module header naming D-06/D-07/D-08/D-09/D-17; private `nonNegativeFinite` guard; `healthRatio`, `registerDamage`, `isHealthVisible`, `computeHudScale`, `pruneTimers`, `computeShakeImpulsePx`.
- `src/render/DamageTap.ts` (created, 108 lines) — `class RenderDamageTap implements IDamageSink, IDamageFeed`; private `inner`, `getUnitState`, `buffered`; applied-damage/kill detection, pre-removal snapshot, bounded push, `drain`/`clear`.
- `tests/render/hud-model.test.ts` (created, 283 lines) — 19 tests: clamp boundaries, 450/225-frame windows, reset-on-hit, kill removal, below-6 rule, prune, hybrid scale endpoints/monotonic screen width/guards, shake threshold/kill/cap/finite.
- `tests/render/damage-tap.test.ts` (created, 300 lines) — 10 tests: rejected hit, exact HP loss, pre-removal death position, dead defender, missing state, buffer cap/oldest dropped, fresh drain array, clear, throwing inner sink, verbatim field copies.

## Decisions Made

- **`registerDamage` 加固非有限输入。** 计划公式 `max(0, outputFps) × max(0, seconds)` 对 NaN 会得到 NaN（`Math.max(0, NaN) === NaN`），随后写入 NaN 期限会让血条**永远不显示**而不报错。改为非有限/非正一律按 0、帧数至少 1，符合 T-05-25 的威胁模型。
- **震动冲量不在本模块封顶。** 返回 `1–3 × shakeAmplitudePx`，累计振幅由 `Camera` 按 `ICameraConfig.shakeAmplitudePx` 封顶；分工写在 JSDoc 与 `ICameraUpdateInput.shakeImpulsePx` 契约里，避免两处重复钳制。
- **记录实际 HP 损失而非 `event.damage`。** 溢出伤害不会出现在伤害数字里，数字与血条变化一致（D-10）。
- **缺失物理读数跳过事件。** 不发明坐标（AGENTS §8：缺失对象 → `null`）。
- **缓冲裁剪用 `while`。** 即使未来一次调用压入多个事件，`length <= MAX_BUFFERED_DAMAGE_EVENTS` 仍成立。
- **容量测试用 0.1 伤害。** 522 次命中累计 52.2，远低于剑士生命上限，守方全程存活，边界检查不被意外击杀打断。

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Non-finite fps/seconds would write NaN timer deadlines**
- **Found during:** Task 1 (HUD model implementation)
- **Issue:** The plan's literal formula `Math.max(0, outputFps) * Math.max(0, seconds)` passes NaN through (`Math.max(0, NaN)` is NaN), so `Math.round` yields NaN and every visibility comparison becomes false. A malformed config would silently disable health bars instead of failing loudly.
- **Fix:** Added a private `nonNegativeFinite` guard (non-finite or non-positive → 0) and clamp `frames` to at least 1; `frameIndex` is likewise coerced to 0 when non-finite.
- **Files modified:** `src/render/hudModel.ts`
- **Verification:** All 19 HUD tests pass, including the exact 450/225-frame windows; typecheck and lint green.
- **Committed in:** `166cf72` (Task 1 commit)

---

**Total deviations:** 1 auto-fixed (1 bug)
**Impact on plan:** The fix implements the plan's own threat T-05-25 ("non-finite damage/lifetime values") rather than adding scope; no interface, file or behaviour outside the planned contract changed.

## Issues Encountered

- `pnpm lint` first flagged the test's unused `OUTPUT_FPS` constant; removed it and kept the literal `30` so the test asserts the documented default explicitly (`tests/render/hud-model.test.ts`). No production change.
- `git` reported the usual LF→CRLF conversion warning on the new files (repo default on Windows); no content change and no hook failure.
- Pre-existing untracked paths (`.gsd/`, `.planning/milestone.lock`, `.planning/state.json`, `.planning/v1-MILESTONE-AUDIT.md`) were left untouched and uncommitted.

## Verification Evidence

| Check | Result |
| ----- | ------ |
| `pnpm vitest run tests/render/hud-model.test.ts` | 1 file / 19 tests passed |
| `pnpm vitest run tests/render/damage-tap.test.ts` | 1 file / 10 tests passed |
| `pnpm typecheck` | exit 0 |
| `pnpm lint` | exit 0 |
| `pnpm test` | 42 files / 460 tests passed |
| `node` presence check (hudModel) | `HUD_MODEL_OK` |
| `node` presence check (DamageTap) | `DAMAGE_TAP_OK` |
| `git diff --name-status cf31dd9..HEAD` | only the 4 plan files (all added) |
| `src/render/types.ts` | untouched (absent from the diff) |
| Phase 1–4 source dirs | untouched (absent from the diff) |

## Known Stubs

None. Both modules are complete implementations. `hudModel` exports exactly the six functions 05-07's `Hud` needs, `RenderDamageTap` satisfies both frozen interfaces, and the tests exercise the boundary cases (NaN, kills, dead defenders, missing state, buffer cap, throwing sink) rather than the happy path alone.

## Threat Flags

None beyond the plan's `<threat_model>`. T-05-21 is implemented and tested (rejected hits produce no event; applied damage equals the observed HP loss); T-05-22 is implemented and tested (buffer capped, oldest dropped); T-05-23 is implemented and tested (`pruneTimers` plus kill-time deletion); T-05-24 held (`IDamageSink`/`IDamageContext`/`IControlSystem` and `src/render/types.ts` byte-identical, decorator implements existing interfaces only); T-05-25 is implemented and tested (non-finite guards in `healthRatio`, `registerDamage` and the shake impulse). No dependency was added (T-05-SC); neither module performs I/O, network, DOM or randomness.

## User Setup Required

None — no external service configuration required.

## Next Phase Readiness

- **Ready:** 05-07's `Hud` can call `healthRatio` per unit, `registerDamage` with the frame's drained events, `isHealthVisible` with `totalUnits`, `computeHudScale` with the camera scale, `pruneTimers` after unit sync, and `computeShakeImpulsePx` to fill `ICameraUpdateInput.shakeImpulsePx`. 05-08's composition root only needs `new RenderDamageTap(sink, unitId => physics.getUnitState(unitId))` and must pass the tap (not the sink) to `ControlSystem`.
- **Contract discipline held:** `src/render/types.ts` was not modified, so the remaining Round-2 plans continue against the frozen, user-approved contract.
- **Phase 5 remains IN PROGRESS:** unit views, Renderer/Hud, demo runner/panel and Chrome UAT are still pending (05-06..05-10). Do not advance to Phase 6.

## Self-Check: PASSED

- FOUND: `src/render/hudModel.ts`
- FOUND: `src/render/DamageTap.ts`
- FOUND: `tests/render/hud-model.test.ts`
- FOUND: `tests/render/damage-tap.test.ts`
- FOUND: commit `166cf72` (feat: pure HUD model)
- FOUND: commit `5740f3a` (feat: damage/death tap)
