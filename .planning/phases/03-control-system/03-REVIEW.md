---
phase: 03-control-system
reviewed: 2026-10-20T13:00:47Z
depth: standard
files_reviewed: 12
files_reviewed_list:
  - src/control/types.ts
  - src/control/constants.ts
  - src/control/Sensor.ts
  - src/control/ControlSystem.ts
  - src/control/DefaultUnitAI.ts
  - tests/control/types.test.ts
  - tests/control/arena.ts
  - tests/control/damage-sink.ts
  - tests/control/loop.test.ts
  - tests/control/sensing.test.ts
  - tests/control/default-ai.test.ts
  - tests/control/pluggable.test.ts
findings:
  critical: 2
  warning: 9
  info: 5
  total: 16
status: issues_found
---

# Phase 3: Code Review Report

**Reviewed:** 2026-10-20T13:00:47Z
**Depth:** standard
**Files Reviewed:** 12
**Status:** issues_found

## Summary

The implementation is structurally sound. The 6-tick decision cadence (`tickIndex % DECISION_INTERVAL_TICKS`), decision-before-execution ordering, per-tick force/torque re-application, zero-force wake-up avoidance, net-vector/torque clamping, ray-fan sanitization, neighbour filtering/sorting/capping, team classification, provider create/destroy ordering, and damage-to-sink routing all match the approved contract and are covered by meaningful tests. I ran the control suites (`54/54` pass), `tsc --noEmit`, and `eslint` on the reviewed tree; all are clean. Passing tests do not cover the findings below.

The highest-risk defects sit at the two trust boundaries this phase establishes: (1) `sanitizeAction` validates the skill-intent discriminator but **not the intent payload**, and emits the plugin's object by reference; (2) the "pure data snapshot" promise in D-05 is broken because the observation shares mutable `IEquipment` objects — including the **global `CLASS_DEFS` entries** — and the physics-owned motion object with AI plugins. Lifecycle gaps (register-after-dispose, re-entrant destroy) and a latent revive bug in the test damage sink are also present.

`src/control/types.ts`, `src/physics/types.ts`/`PhysicsWorld.ts`, and `src/units/types.ts` were read as approved/frozen references; no changes were requested there. Performance is out of scope for this review.

## Narrative Findings (AI reviewer)

### Critical Issues (BLOCKER)

#### CR-01 (BLOCKER): Skill-intent payload is not validated and is emitted by reference

**File:** `src/control/ControlSystem.ts:358-371`

**Issue:** `sanitizeAction` checks only that `skillIntent` is a non-null object, that `kind` is a numeric `SkillIntentKind` member, and that `unitId` matches the deciding unit. It never checks the shape of the payload for the selected discriminator, then performs `rawIntent as SkillIntent` (line 369). A provider can return:

- `{ kind: SkillIntentKind.Weapon, unitId: 1, weapon: 999 }` (invalid `WeaponKind`)
- `{ kind: SkillIntentKind.Unit, unitId: 1 }` (missing `skill`)

Both pass sanitization and leave `tick()` as a value typed `SkillIntent`, even though it no longer satisfies `IWeaponSkillIntent` / `IUnitSkillIntent`. Any Phase 4 executor that indexes `WEAPON_DEFS[weapon]` or a skill table will read `undefined` and can throw, and the AI is the project's designated untrusted/pluggable layer (T-03-13). The plugin's object is also retained by reference, so it can mutate `unitId`/`weapon`/`skill` after validation but before the consumer reads it. This is a real sanitizer bypass, not just a style issue.

**Fix:** Validate the payload member for the selected branch and rebuild a fresh object (never forward the plugin's reference):

```ts
// In sanitizeAction, replace the rawIntent block with a helper:
private readSkillIntent(rawIntent: unknown, unitId: number): SkillIntent | null {
    if (rawIntent === null || typeof rawIntent !== 'object') {
        return null;
    }
    const intent = rawIntent as Record<string, unknown>;
    if (intent.unitId !== unitId) {
        return null;
    }
    if (intent.kind === SkillIntentKind.Unit) {
        const skill = intent.skill;
        if (typeof skill === 'number' && SkillKind[skill] !== undefined) {
            return { kind: SkillIntentKind.Unit, unitId, skill };
        }
        return null;
    }
    if (intent.kind === SkillIntentKind.Weapon) {
        const weapon = intent.weapon;
        if (typeof weapon === 'number' && WeaponKind[weapon] !== undefined) {
            return { kind: SkillIntentKind.Weapon, unitId, weapon };
        }
    }
    return null;
}
```

Add tests for `weapon: 999`, `weapon: undefined`, `skill: 999`, and a missing payload; assert no intent reaches `IControlTickResult.skillIntents`.

#### CR-02 (BLOCKER): Observation snapshot leaks mutable equipment objects (including global class data) and the physics motion object

**File:** `src/control/Sensor.ts:106,108,205` (and `src/units/Unit.ts:95,321` as the aliasing source)

**Issue:** `equipment: [...unit.getEquipment()]` copies only the **array**, not the `IEquipment` entries, and `Unit.getEquipment()` itself only does `[...this.equipment]` (`src/units/Unit.ts:167-169`). The entries in `Unit.equipment` are the **same object references** as `CLASS_DEFS[...].initialEquipment` / unlock entries (`src/units/Unit.ts:95,321`). Consequently:

- `observation.equipment[0]` (line 106) and every `observation.enemies[i].equipment[j]` / `observation.allies[i].equipment[j]` (line 205) alias the global class definitions.
- A plugin (which is exactly the untrusted layer this snapshot isolates) can cast away `readonly` and mutate `equipment[0].weapon`. That corrupts the class table for all current and future units; a subsequent `buildSpec` can then look up `WEAPON_DEFS[corruptedValue]` and crash physics registration (see IN-03).
- `motion` (line 108) is the object returned by `IPhysicsWorld.getUnitState`; the real `PhysicsWorld` returns a fresh object, but the contract does not guarantee it, and the observation is documented as a pure snapshot. A cached implementation would let an AI mutate physics state.

This directly contradicts D-05 ("pure data snapshot", AI "never touches mutable unit methods") and the T-03-10 mitigation claim. TypeScript `readonly` is erased at runtime, so it is not a defense.

**Fix:** Deep-copy the entries and the motion/projectile records while building the snapshot:

```ts
// self
equipment: unit.getEquipment().map(item => ({ ...item })),
motion: { ...motion },
projectiles: this.world
    .queryProjectiles(motion.x, motion.y, SENSING_MAX_DISTANCE)
    .map(sighting => ({ ...sighting })),

// briefs
equipment: otherUnit.getEquipment().map(item => ({ ...item })),
```

If a stronger guarantee is desired, `Object.freeze` the returned arrays/objects as well (but the copy is the essential fix).

### Warnings

#### WR-01 (WARNING): `registerUnit` after `dispose()` leaks AI instances

**File:** `src/control/ControlSystem.ts:103-127`; dispose at `231-247`

**Issue:** `registerUnit` never checks `disposed`. After `dispose()` (which clears `units`, `teams`, `ais`, and `actions`), a `registerUnit` call passes the duplicate guard, calls `provider.create`, registers a physics body, and inserts the unit into all maps. The controller's `tick()` permanently returns `{ skillIntents: [] }`, and a second `dispose()` returns immediately because `disposed` is true — so the newly created AI is **never destroyed** by the control system. This contradicts `dispose()`'s contract ("release all AI instances and internal state") and leaks resources/provider state.

**Fix:** Fail closed at the top of `registerUnit`:

```ts
if (this.disposed) {
    throw new Error(
        `ControlSystem.registerUnit: control system is disposed`
    );
}
```

Alternatively, document and implement a re-open path that clears `disposed`; silently accepting registrations on a dead controller is the worst option.

#### WR-02 (WARNING): Re-entrant `provider.destroy` can double-destroy and recurse

**File:** `src/control/ControlSystem.ts:466-479`

**Issue:** `removeRegisteredUnit` checks `this.ais.has(unitId)` and calls `provider.destroy(unitId)` **before** deleting the id from `ais`. If a provider's `destroy` implementation re-enters the controller (`unregisterUnit(unitId)` or `dispose()`), the guard still sees the AI, so `destroy` is called again. A provider that always re-enters produces unbounded recursion/stack overflow; a partially re-entrant one violates the "destroy each exactly once" lifecycle that the tests claim to prove. The existing tests only use non-reentrant providers.

**Fix:** Remove the AI from `ais` before invoking the plugin, and guard the whole method against re-entry. Keep `units`/`teams` intact until after `destroy` so the documented "catalog readable during provider callbacks" order is preserved:

```ts
private readonly removing = new Set<number>();

private removeRegisteredUnit(unitId: number): void {
    if (this.removing.has(unitId)) {
        return;
    }
    this.removing.add(unitId);
    const hadAi = this.ais.delete(unitId);
    this.actions.delete(unitId);
    if (hadAi) {
        try { this.provider.destroy(unitId); } catch { /* isolated */ }
    }
    this.units.delete(unitId);
    this.teams.delete(unitId);
    this.physics.removeUnit(unitId);
    this.removing.delete(unitId);
}
```

#### WR-03 (WARNING): Dead or deregistered units still get decisions, actions, and skill intents

**File:** `src/control/ControlSystem.ts:170-207` (store at `192-195`, apply at `199-207`)

**Issue:** Two related holes:

1. The decision loop never checks `unit.isAlive()` (or re-reads the unit) before deciding. A unit killed **outside** `tick()` (e.g., a Phase 4 subsystem calls `takeDamage`, or a dead unit is registered) still gets a decision, has its action applied, and can deal a killing blow before the end-of-tick dead scan removes it.
2. After `ai.decide(observation)` returns, a re-entrant provider callback could have called `unregisterUnit`/`dispose`. The code then unconditionally does `this.actions.set(unitId, action)` and pushes `action.skillIntent`. That resurrects an action entry for an unregistered unit; because `listUnitIds()` will not include it again, the stale action is re-applied every tick forever (physics may ignore the unknown id, but `actions` grows and the intent has already escaped).

**Fix:** Re-check registration and liveness before sensing and again after `decide`, and skip dead/missing units in the apply loop:

```ts
const unit = this.units.get(unitId);
if (unit === undefined || !unit.isAlive()) {
    continue;
}
const observation = this.sensor.sense(unitId);
if (observation === null) {
    continue;
}
// ... ai.decide / sanitize ...
const current = this.units.get(unitId);
if (current === undefined || !current.isAlive()) {
    continue;
}
this.actions.set(unitId, action);
// apply loop
for (const [unitId, action] of this.actions) {
    const owner = this.units.get(unitId);
    if (owner === undefined || !owner.isAlive()) {
        continue;
    }
    ...
}
```

#### WR-04 (WARNING): Sensing failures are not isolated and abort the whole `tick()`

**File:** `src/control/ControlSystem.ts:172`; `src/control/Sensor.ts:264-280`

**Issue:** `this.sensor.sense(unitId)` runs outside the try/catch that isolates `ai.decide` and `sanitizeAction`. Any throw from `ISensingWorld.castRayFan`/`queryProjectiles`, a catalog/physics getter, or a malformed world return aborts the entire control tick, unlike plugin and sink failures which are deliberately isolated (T-03-05/T-03-08). The ray sanitizer only validates **elements**: if a rogue/misimplemented `ISensingWorld` returns `undefined` (or another non-array) at runtime, `raw.length` at line 268 throws a TypeError before any sanitization. `projectiles` are copied without any numeric validation (latent for Phase 4, where the list becomes non-empty).

**Fix:** Isolate the sensing call (`try { observation = this.sensor.sense(unitId); } catch { continue; }`) and treat a non-array ray result as "no hit" (`const source = Array.isArray(raw) ? raw : [];`). Sanitize projectile `x`/`y`/`distance` to finite values or drop malformed entries.

#### WR-05 (WARNING): XP level-ups in the test damage sink can resurrect units killed by the same blow

**File:** `tests/control/damage-sink.ts:34-47`; heal-on-level-up source at `src/units/Unit.ts:297-315`

**Issue:** After the `!isAlive()` guard, `const wasAlive = context.defender.isAlive()` is **always true** (dead line). More seriously, the sink calls `defender.gainDefenseExperience(...)` **after** `takeDamage`. `gainDefenseExperience` invokes `checkLevelUp()`, which adds `currentMaxHealth - previousMaxHealth` to `hp`. A lethal hit that also grants defense XP (gate is only `damageReduced > 50`) can level the defender up and push `hp` back above 0, so:

- the defender is resurrected instead of dying,
- the `wasAlive && !isAlive` kill check never fires and no kill XP is awarded,
- `ControlSystem`'s end-of-tick dead scan never removes it.

The same mechanism applies to `attacker.gainAttackExperience` / `gainKillExperience` on an attacker that died earlier in the same tick (mutual kill): the dead attacker can level up and revive. This makes the "dead-unit deregistration" invariant depend on XP thresholds, which the tests do not exercise.

**Fix:** Never grant XP that can revive a unit already at 0 HP; only grant defense XP when the defender survived the hit, and attack/kill XP when the attacker is alive:

```ts
const wasAlive = context.defender.isAlive();
context.defender.takeDamage(context.event.damage);
const survivedHit = context.defender.isAlive();

if (context.attacker.isAlive()) {
    context.attacker.gainAttackExperience(context.event.damage);
}
if (survivedHit) {
    context.defender.gainDefenseExperience(context.event.damageReduced);
}
if (wasAlive && !context.defender.isAlive() && context.attacker.isAlive()) {
    context.attacker.gainKillExperience(
        context.defender.getAttribute(AttributeKind.Level)
    );
}
```

If the design intentionally wants XP on a lethal blow, the sink must explicitly re-clamp `hp` to 0 after XP so the death state is preserved.

#### WR-06 (WARNING): Same-team immunity exists only in the test fixture; the loop test asserts a behavior the shipped code does not provide

**File:** `tests/control/damage-sink.ts:30-33`; `tests/control/loop.test.ts:676-747`; no `IDamageSink` implementation under `src/`

**Issue:** D-09/D-10 correctly make `IDamageSink` own the combat rules, and `ControlSystem` only routes. However, the **only** implementation of same-team immunity is `TestDamageSink` in `tests/`. The real control loop will route same-team damage to whatever sink Phase 4 injects; nothing in `src/` prevents it. The integration test named "keeps same-team bodies colliding but never routes same-team damage" actually asserts `routed.length > 0` (the control system **does** route the events) and then relies on the fixture to drop them. The name/comment can give false confidence that the shipped system enforces the rule; Phase 4 must re-implement and re-test it.

**Fix:** Either (a) add a production sink (e.g., `src/control/TeamDamageSink.ts` or the Phase 4 battle module) implementing same-team immunity, and add an integration test that uses it, or (b) explicitly document in `IDamageSink` and the phase handoff that every sink **must** implement same-team filtering, and rename the test to reflect that it validates the fixture. Do not let this rule be re-derived only from a test helper.

#### WR-07 (WARNING): Non-finite `teamId` silently disables team classification and same-team immunity

**File:** `src/control/ControlSystem.ts:123-124,145-150`; `src/control/Sensor.ts:221`; `tests/control/damage-sink.ts:31`

**Issue:** `teamId` is a plain `number` and is accepted without validation. `NaN` is a valid `number` at runtime. The sensor classifies with `teamId === selfTeam`, and `NaN === NaN` is false, so every unit carrying a `NaN` team is classified as an enemy of every other unit (including units with the same NaN team). `TestDamageSink`'s `attackerTeamId === defenderTeamId` likewise fails, so same-team immunity is silently bypassed. `updateTeam` can introduce this at runtime.

**Fix:** Reject or normalize non-finite team ids at the boundary:

```ts
if (!Number.isFinite(request.teamId)) {
    throw new Error('ControlSystem.registerUnit: teamId must be finite');
}
// updateTeam: ignore/throw for non-finite teamId
```

If this input is considered trusted, at minimum document that `NaN` is unsupported and add a regression test.

#### WR-08 (WARNING): Held-action **replacement** across decisions is not tested

**File:** `tests/control/loop.test.ts:287-346` (also `475-561`)

**Issue:** Every cadence/composition/skill test returns the **same** action object on every decision tick. The real-AI tracer (`1088-1169`) would also pass if only the **first** decision were stored, because the first action points at the enemy and still closes the gap. No test proves that the action decided at tick 6 replaces the action decided at tick 0. A regression that drops `this.actions.set(unitId, action)` after the first decision (or derives the action once) would go undetected.

**Fix:** Add a test whose AI returns action A (`forceRight = 10`) at tick 0 and action B (`forceUp = 20`) at tick 6. Assert `applyForce(1, 10, 0)` on ticks 0-5 and `applyForce(1, 0, 20)` on ticks 6-12. This directly pins the "hold until the next decision, then replace" semantic (D-13).

#### WR-09 (WARNING): Sanitizer security tests are missing for rays and intent payloads

**File:** `tests/control/sensing.test.ts:186-213`; `tests/control/loop.test.ts:383-425`

**Issue:** `sanitizeRayDistances` is the T-03-07 mitigation, but no test feeds a malformed `ISensingWorld` (NaN, ±Infinity, negative, >50, too few entries, too many entries, or a non-array return). Similarly, no test feeds a malformed skill-intent payload (see CR-01). The existing "maps non-finite and negative magnitudes to zero" test asserts only "no force calls", so an implementation that zeroes the whole action whenever **any** field is invalid would pass; it does not prove per-field behavior.

**Fix:** Add a recording sensing world returning `[NaN, -1, 100, Infinity]` (and `undefined as unknown as readonly number[]`) and assert exactly 64 finite values in `[0, 50]` with no throw. Add a mixed magnitude case (one invalid field plus one valid field) asserting the valid field survives. Add the intent-payload cases from CR-01.

### Info

#### IN-01 (INFO): Type test normalizes a 1-element ray array against a 64-ray contract

**File:** `tests/control/types.test.ts:81,92`

**Issue:** The observation literal sets `rayDistances: [50]` and asserts `toHaveLength(1)`, while `IUnitObservation.rayDistances` is documented as exactly 64 entries. This is a compile-shape test, but it encodes the wrong shape and would not catch a future length regression.

**Fix:** Build the array with `Array.from({ length: RAY_COUNT }, () => SENSING_MAX_DISTANCE)` and assert `RAY_COUNT`.

#### IN-02 (INFO): Cooldown tests assert tick 1, which is never a decision tick

**File:** `tests/control/default-ai.test.ts:264,279,297,315`

**Issue:** The control loop decides only at ticks 0/6/12…, but the "not ready" assertions call `decide` at tick 1. This does not mirror the real cadence and would not catch a cooldown comparison that only works for ticks < 6 but fails at the next decision boundary.

**Fix:** Assert `null` at `DECISION_INTERVAL_TICKS` (6) and re-arm at the cooldown tick, and add a control-loop integration case if practical.

#### IN-03 (INFO): `buildSpec` indexes weapon/armor tables without guarding the lookup

**File:** `src/control/ControlSystem.ts:286-299`

**Issue:** `weapon = WEAPON_DEFS[item.weapon]` and `armors.push(ARMOR_DEFS[item.armor])` assume the runtime value is a valid enum member. `IEquipment` comes from `IUnit`, which may be constructed from serialized/external data in Phase 4; an out-of-range value yields `undefined` assigned to `IWeaponDef | null` (weapon) or pushed into `IArmorDef[]` (armor). `PhysicsWorld.registerUnit` then dereferences `spec.weapon.mass` / `armor.mass` and throws a raw TypeError outside the control system's guarded registration path.

**Fix:** Guard the table lookup and treat an unknown id as absent, or throw a descriptive error before calling physics:

```ts
const def = item.weapon === undefined ? undefined : WEAPON_DEFS[item.weapon];
if (def !== undefined) { weapon = def; }
```

#### IN-04 (INFO): `dispose()` clears the catalog but leaves every physics body registered

**File:** `src/control/ControlSystem.ts:231-247`

**Issue:** The class correctly avoids disposing a world it does not own, but `dispose()` also does not call `physics.removeUnit` for the units it registered. After disposal, the physics world still contains those bodies while the control catalog is empty; reusing the same `PhysicsWorld` (or starting a new controller over it) fails duplicate registration for every old id until the caller manually removes them. The test enshrines this behavior without documenting the caller obligation in the interface.

**Fix:** Add an explicit JSDoc note to `IControlSystem.dispose`/`ControlSystem.dispose` that callers must remove or dispose the registered bodies, or remove the bodies in `dispose()` if control-level ownership is intended. A regression test for "dispose then re-register on the same world" would pin the chosen semantics.

#### IN-05 (INFO): Test fixtures are duplicated between the loop and pluggable suites

**File:** `tests/control/loop.test.ts:83-223`; `tests/control/pluggable.test.ts:44-135`

**Issue:** `RecordingAI`, `RecordingProvider`, `zeroAction`, `makeUnit`, and state helpers are duplicated across suites. A lifecycle fix (e.g., re-entrancy or a new provider callback) must be applied twice, and the two copies can drift.

**Fix:** Extract a shared `tests/control/harness.ts` (or `fixtures.ts`) for the recorder classes and unit/state helpers.

---

_Reviewed: 2026-10-20T13:00:47Z_
_Reviewer: the agent (gsd-code-reviewer)_
_Depth: standard_
