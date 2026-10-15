# Feature Research

**Domain:** Browser-hosted 2D physics battle simulation game ("AI 版球球王国" / Evolved Marble) — tactical combat layer
**Researched:** 2026-10-15
**Confidence:** MEDIUM

> Scope of this document: **Milestone 1 only — the tactical combat layer**. 10+ units per side in a 2D physics arena with classes / weapons / armor / leveling, behavior-tree AI, and watchable, exportable battles. Strategic (kingdom/economy/city) and LLM (commander/director) layers are explicitly out for v1; only their interfaces are reserved. Categorization is against *this* milestone's success criterion: **"战斗必须激烈好看" (battles must be intense and visually appealing)**.

---

## Feature Landscape

### Table Stakes (Missing = the combat milestone feels broken/incomplete)

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Fixed-timestep deterministic simulation loop | Without a fixed tick, physics + AI are non-reproducible; replay, balance, and later RL all collapse. `tick = 1 game-minute → real 1s at 1×` per spec | HIGH | Decouple sim from render (accumulator). Rapier `world.timestep` fixed. This is the spine of everything else. |
| 2D physics arena + compound rigid-body units | Spec requires unit **body + weapon + armor** as separate physical parts; damage depends on *what got hit* | HIGH | Rapier2D: one dynamic body with multiple colliders, or body↔weapon↔armor linked by joints (revolute/fixed/prismatic w/ limits). Use `userData` to tag colliders by part. |
| Unit stat model (full spec block) | Every mechanic reads from it: HP, maxHP, level, XP, control level, base attack, base defense, weapon ratio, armor ratio, mass, gear, class, bonuses | MEDIUM | Pure data + serializable. Must be JSON/TS-data-driven, not hardcoded per class. |
| 7 classes with distinct stats + per-level gains | Spec defines 剑士/弓箭手/狂战士/锤兵/骑士/剑盾/长矛兵 with different HP/atk/def/mass and per-level scaling | MEDIUM | Data-only. Balance is "reference only" — needs a batch-run calibration harness (see differentiators). |
| 6 weapons + 2 armor types | Spec defines 长剑/短剑/斧头/锤子/弓箭/长矛 and 头盔/盾牌, each with mass, attack ratio, and a **break-armor matrix** | MEDIUM | Data-only + a lookup. Break-armor ratios (hammer vs helmet = 5, bow vs shield = 0.2) are the core of counter-play. |
| Collision-velocity damage formula | The spec's damage *is* `A_A·P_A·W_A·(√Δv − 1)` clamped at 0, plus N(mean, mean/20) jitter | HIGH | Depends on physics collision normal-velocity at the moment of hit. Getting Δv reliably (and per-part) is the single trickiest mechanic. |
| Armor reduction + hit-region detection | Damage must be reduced only when the **armor** collider is hit; body hits bypass reduction | HIGH | Depends on compound-collider tagging + break-armor ratio `B_A`. Directly gates the "weapons matter" feel. |
| XP + leveling system | Damage >50 grants XP via `R_A·√(D−50)`; blocked-damage XP via `R_D·√(ΔD−50)`; kill XP; level-up restores gained HP and raises stats | MEDIUM | Depends on the damage formula + death detection. Level-up unlocks gear/skills at specified levels. |
| Per-unit behavior-tree (BT) AI | Every unit acts autonomously; spec cadence is **every 0.1s** | HIGH | BT (Selector/Sequence/Decorator/Service + blackboard) is the industry-standard fit. Keep the tree per-class, blackboard per-unit. |
| AI observation model (raycasts, nearest-N) | Spec's AI input: 64-ray obstacle scan (capped 50m), projectile proximity scan, nearest 16 enemies + 16 allies (HP/level/pos/gear) | HIGH | Vectorized/scaled to spec; at 10–30 units this is cheap. This is what makes behavior feel aware, not blind. |
| AI action model (forces, rotation, weapon ability) | Spec's AI output: directional force, rotational torque, fire weapon special ability, use unit ability | MEDIUM | Maps directly onto Rapier impulses + a weapon-ability cooldown system. |
| Targeting, approach, and attack behavior | Units must actually seek, close, and hit enemies so the battle *runs itself* | MEDIUM | Melee = approach + collide; ranged = maintain distance + fire. Emergent from BT leaves. |
| Autonomous battle resolution | Battle auto-starts on proximity, runs until one side remains, declares a winner; no human input required | MEDIUM | Win condition = no living units of a faction in the battle region. Feeds strategic layer later. |
| 10+ v 10+ performance envelope | Combat milestone explicitly requires "十几单位混战" at interactive frame rate | HIGH | Physics stepping + BT eval + render must be budgeted together. Rapier islands help; keep AI off the render thread path. |
| Top-down spectator render (PixiJS) | Chrome-only 2D top-view; units, weapons, armor, projectiles visible and legible | MEDIUM | Sprites + spritesheet; camera = container pan/zoom. `battle.webp` asset reused as backdrop. |
| Basic spectator HUD / readability | Viewer must read HP, level, team, and what is happening | MEDIUM | HP bars, level badges, team tint. `BitmapText` for changing numbers. "Combat you must watch but can't read" is a cited genre failure. |
| Seeded deterministic RNG | Damage jitter + spawn variance must be reproducible for replay, balance, and footage re-takes | MEDIUM | **Do not use `Math.random`.** Determinism also requires avoiding `Math.sin/cos` for physics init (Rapier docs). |
| Headless / unattended run mode | Footage + research need battles to run without a human driving the camera | MEDIUM | Same sim core, render disabled. Keeps sim decoupled from Pixi. |
| Frame capture → video export | "战斗过程可录制出片" is an Active requirement; it is the *point* of the project | HIGH | Capture Pixi canvas frames at fixed sim steps → encode (e.g. WebCodecs/ffmpeg). Ties directly to determinism. |

### Differentiators (This is where "intense and watchable" lives)

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Physics-emergent combat (no canned animations) | Unpredictable, unique outcomes are *the* watchability engine — TABS's core appeal is chaotic ragdoll physics | HIGH | Already implied by the physics-first design. Lean into it: weapons collide, units get knocked back, bodies tumble. |
| Class-distinct *behavior* (not just stats) | "单位行为多样" is a stated success factor. A berserker that charges ≠ an archer that kites ≠ a shield that holds | HIGH | Author distinct BT branches per class. Value comes from behavior spread, not stat spread. |
| In-battle progression & power spikes | XP → mid-fight level-up → new gear/skill creates comebacks, "hero" units, and suspense | HIGH | Depends on leveling + skill/gear unlocks. This is a rare, high-value differentiator vs. static auto-battlers. |
| Action-following auto camera | Watchability research (CineCast, esports "observers", StarCraft ROCI) converges on: **follow the most exciting area** | MEDIUM | Simple v1: follow weighted center of mass of fighting units; bias zoom toward duels/kills. Full director/commentary is out of scope but this is achievable now. |
| Kill / level-up highlight moments | Slow-mo or flash on a kill, zoom on a last-stand — turns raw sim into narrative beats | MEDIUM | Event stream from sim (kill, levelup, big hit). Cheap once damage/XP events exist. |
| Soft-counter composition suspense | Break-armor matrix creates rock-paper-scissors *without* hard counters, so outcomes stay uncertain | MEDIUM | Prefer the spec's numeric ratios over hard "X beats Y" tables. Research favors 60/40–70/30 soft counters. |
| Projectiles as real physics bodies | Arrows flying, missing, and sticking produce far better footage than hitscan | MEDIUM | Archers fire actual bodies; also exercises the AI projectile-sensing input. |
| Class skills / special abilities | Spec lists 万箭齐发 (volley), 冲锋 (charge), 旋转 (spin) — visually spectacular beats | MEDIUM | Depends on leveling unlock table + a cooldown/ability subsystem. High footage value. |
| Damage numbers / hit sparks / impact FX | Confirms hits and dramatizes exchanges; legibility multiplier | MEDIUM | Use Pixi `ParticleContainer` for sparks; `BitmapText` for damage numbers. Budget filters (expensive). |
| Deterministic replay + shareable seed | Same seed → identical battle; enables re-takes, balance A/B, and research citation | MEDIUM | Requires the deterministic core; a natural extension, not a bolt-on. |
| Batch simulation + balance tooling | "数值需实测校准" — run N battles headless to tune classes/weapons/XP curves | MEDIUM | The bridge to Python already exists conceptually; start with an in-browser batch runner. High research value. |
| Battle summary / kill feed / stats | Post-battle "who carried, who died" recap supports both content and research | LOW-MEDIUM | Derived from the same event stream as highlights. |
| Limited-perception (vision) behavior | Raycast-limited awareness makes behavior believable and creates ambushes/suspense | MEDIUM | Already in the AI observation spec; not the *strategic* 100/150m vision radius (that is out of scope). |

### Anti-Features (Tempting, but deliberately NOT in v1)

| Anti-Feature | Why Requested | Why Problematic | Alternative |
|--------------|---------------|-----------------|-------------|
| LLM commander / director systems | Headline feature of the full spec | Adds cloud API latency/cost, non-determinism, and a whole orchestration layer before combat even looks good | **Reserve interfaces only**; ship rule/BT AI. Add director in a later milestone. |
| Kingdom / economy / city production | Core to the full "marble kingdom" vision | Depends on a stable combat layer; doubling sim scope now risks neither half working | Build after combat is watchable. Keep combat resolution as a clean API the strategic layer can call. |
| Marches, map edges, 100/150m strategic vision | In the spec | Strategic scale, not tactical arena; irrelevant to a single battle's watchability | Defer to the strategic milestone. Unit-level raycast vision ≠ strategic vision. |
| Auto-battler economy (gold, shop, reroll, synergies, placement grid) | "auto-battler" is a nearby genre | That genre is prep-then-watch with a grid and a shop; ours is continuous physics combat. Economies/synergies are a different game | Take only the *legibility and counter-design* lessons, not the economy. |
| RL training of unit control | Stated research goal; spec has "控制等级" | Training loop, reward shaping, and determinism-hardening would swamp milestone 1 | Keep `control-level` field + deterministic core so RL can drop in later. Rule BT now. |
| Hand-authored animation / rigs | "Looks nicer" | Physics ragdolls are the aesthetic and the source of emergent fun; rigs fight the concept | Let physics drive motion; add FX, not animation rigs. |
| Unit possession / player-controlled units | TABS has it | This is a spectator sim, not a playable game; possession adds input/camera systems for no milestone value | Spectate only. |
| Online multiplayer / netcode | TABS has it | Rollback/lockstep determinism over network is a huge, orthogonal effort | Single-process spectator sim. |
| Campaign / mission / scenario editor | Sandbox staple | Content authoring with no validated core battle wastes the milestone | One battle type (army vs army); scenario framework later. |
| Unit / faction creator & modding | TABS selling point | Tooling and validation surface way beyond scope | Data-driven stats make modding trivial *later* for free. |
| Navmesh pathfinding on 1000×1000 | "units should path" | Arena is ~80m; global pathfinding is overkill and adds non-determinism/deps | Steering + forces + local avoidance. |
| Hard counters ("spears always beat cavalry") | Simplest to balance | Kills suspense; research favors soft counters so execution/positioning matter | Use the spec's numeric break-armor ratios (soft, probabilistic outcomes). |
| Many Pixi filters/masks per unit | "Juicy" glow/blur/outline | Filters and masks are expensive; hundreds tank FPS (Pixi docs) | Pre-render tinted sprites; use particles, not per-unit filters. |
| `Math.random` / `Math.sin` for sim-affecting values | Convenient | Breaks cross-platform determinism (Rapier determinism docs) | Seeded RNG + deterministic math for physics init. |
| GOAP / HTN / MCTS planners for unit AI | "Smarter AI" | Overkill and heavy for 0.1s × dozens of units; harder to debug/author | Behavior trees with blackboards; add HTN only at army level, much later. |
| Manual-camera-only spectating | Simplest render path | Footage requires the camera to work unattended | Ship at least a basic action-follow auto-cam in v1. |
| Fog-of-war rendering over the battlefield | Confused with unit vision | Strategic-layer UI concept; obscures the action we want to film | No fog. Unit perception stays internal to AI. |

---

## Feature Dependencies

```
[Fixed-timestep deterministic core]
    ├──requires──> [Seeded RNG]                (damage jitter, spawn variance)
    ├──requires──> [Deterministic physics init] (no Math.sin/cos)
    └──enhances──> [Replay + video export]      (same seed → same footage)

[Compound rigid-body unit (body + weapon + armor)]
    └──requires──> [Hit-region detection]
                        └──requires──> [Armor reduction + break-armor matrix]
    └──requires──> [Collision-velocity damage formula]
                        └──requires──> [XP + leveling]
                                            └──requires──> [Skill/gear unlock table]
                                            └──requires──> [Kill/level-up event stream]
                                                                └──enhances──> [Highlights, kill feed, battle summary]
                                                                └──enhances──> [Auto camera / zoom-on-kill]

[Unit stat model + class/weapon/armor data]
    └──requires──> [Behavior-tree AI]           (AI reads stats + gear)
    └──requires──> [Rendering + HUD]            (display stats)

[AI observation model (raycast + nearest-N)]
    └──requires──> [AI action model (forces/torque/abilities)]
                        └──requires──> [Autonomous battle resolution]
                                            └──requires──> [Headless run + batch balance tooling]

[Top-down render (PixiJS)]
    └──enhances──> [Frame capture → video]
    └──enhances──> [Auto camera]

[Combat resolution API] ──reserved-for──> [Strategic layer / cities / marches]
[control-level field + deterministic core] ──reserved-for──> [RL unit control]
[Event stream + camera hooks] ──reserved-for──> [LLM director (camera/commentary)]
```

### Dependency Notes

- **Damage formula requires compound colliders + hit-region detection:** the formula's `Δv` is a *collision* property, so you cannot compute damage until the weapon/armor/body parts are physically distinct and tagged (`userData`).
- **Armor reduction requires hit-region detection:** reduction only applies when the *armor* collider is struck; hitting the body bypasses it. Same tagging dependency.
- **Leveling requires the damage formula + death detection:** XP thresholds key off *post-reduction damage > 50* and kills, so it cannot precede damage.
- **Skills/gear unlocks require leveling:** the unlock table (e.g. volley at lvl 5, shield at lvl 6) has no meaning without a leveling system.
- **Behavior-tree AI requires the observation + action models:** BT leaves read from the raycast/nearest-N blackboard and write to force/torque/ability outputs.
- **Battle resolution requires autonomous AI:** a battle that needs babysitting never reaches a clean winner.
- **Video export requires the deterministic fixed-timestep core + headless mode:** reproducible, evenly-stepped frames are what make exportable footage stable rather than jittery.
- **Auto camera / highlights require the kill/level-up event stream:** they consume events, not raw frame diffs — build the event stream first.
- **RL control conflicts with nothing now, but requires hardened determinism:** keep the sim core render-free and seed-driven so the RL milestone is additive.
- **Batch balance tooling requires headless + deterministic core:** same cells as RL prep; build it once.

---

## MVP Definition

### Launch With (v1) — the combat milestone

Minimum set that makes a battle *run, look good, and be recordable*:

- [ ] Fixed-timestep deterministic sim core + seeded RNG — everything else sits on this
- [ ] Rapier2D compound unit (body + weapon + armor colliders, tagged) — required for damage/armor mechanics
- [ ] Data-driven stat layer: 7 classes, 6 weapons, 2 armor, per-level gains + unlock table
- [ ] Collision-velocity damage formula + jitter + armor reduction + break-armor matrix
- [ ] XP + leveling (attack/defense/kill XP, level-up stat restore & unlocks)
- [ ] Behavior-tree AI per class with the spec observation model (64 rays, nearest 16+16) at 0.1s cadence
- [ ] Autonomous battle: 10+ vs 10+ to a winner, no input
- [ ] PixiJS top-down render + sprite units + basic HUD (HP/level/team)
- [ ] Basic action-follow auto camera
- [ ] Frame capture → video export path
- [ ] Performance budget met (target frame rate at ~20–30 units)

### Add After Validation (v1.x)

- [ ] Class skills/abilities (volley, charge, spin) — once combat + leveling are stable
- [ ] Projectiles as physics bodies — once hit detection is trustworthy
- [ ] Damage numbers, hit sparks, kill slow-mo — once events exist and footage needs polish
- [ ] Kill feed / battle summary / stats — cheap once the event stream exists
- [ ] Deterministic replay + shareable seed strings — once determinism is proven
- [ ] Headless batch runner + balance calibration harness — to honor "数值需实测校准"
- [ ] Hot-reload stat data — accelerates the calibration loop

### Future Consideration (v2+)

- [ ] LLM director (camera direction + commentary) — reserve hooks now, build later
- [ ] Strategic layer: cities, production, marches, strategic vision, army organization
- [ ] LLM commander (decision input/output schema per spec)
- [ ] RL unit control + "control-level" ladder (deterministic core already ready)
- [ ] Scenario/map framework, save ladder

---

## Feature Prioritization Matrix

| Feature | User Value | Implementation Cost | Priority |
|---------|------------|---------------------|----------|
| Fixed-timestep deterministic core + seeded RNG | HIGH | HIGH | P1 |
| Compound unit physics (body/weapon/armor) | HIGH | HIGH | P1 |
| Stat/class/weapon/armor data layer | HIGH | MEDIUM | P1 |
| Collision-velocity damage + armor reduction | HIGH | HIGH | P1 |
| XP + leveling | HIGH | MEDIUM | P1 |
| Behavior-tree AI + observation/action model | HIGH | HIGH | P1 |
| Autonomous battle resolution | HIGH | MEDIUM | P1 |
| Top-down render + HUD + 10v10 performance | HIGH | MEDIUM | P1 |
| Action-follow auto camera | HIGH | MEDIUM | P1 |
| Frame capture → video export | HIGH | HIGH | P1 |
| Class skills/abilities | HIGH | MEDIUM | P2 |
| Projectiles as physics bodies | MEDIUM | MEDIUM | P2 |
| Damage numbers / sparks / kill slow-mo | MEDIUM | MEDIUM | P2 |
| Kill feed / battle summary | MEDIUM | LOW | P2 |
| Deterministic replay + seed sharing | MEDIUM | MEDIUM | P2 |
| Headless batch + balance harness | MEDIUM | MEDIUM | P2 |
| Hot-reload stat data | MEDIUM | LOW | P2 |
| Highlight extraction for shorts | MEDIUM | MEDIUM | P3 |
| LLM director / commander | HIGH (later) | HIGH | P3 (reserved) |
| Strategic layer (cities/marches/vision) | HIGH (later) | HIGH | P3 (reserved) |
| RL unit control | HIGH (later) | HIGH | P3 (reserved) |

**Priority key:** P1 = must have for the combat milestone to be "done"; P2 = add once core is validated; P3 = future milestone / reserved interface only.

---

## Competitor Feature Analysis

| Feature | TABS (Landfall) | Lost Marbles (YouTube) | Auto-battlers (TFT / Underlords) | Our Approach |
|---------|-----------------|------------------------|----------------------------------|--------------|
| Core loop | Place two armies, watch ragdoll physics fight | Watch simulated marble battles/races | Prep (buy/place/synergy) → auto-resolve | Autonomous 2D physics battle, watch → record |
| Unit variety | 140+ wobblers, factions, unit creator | Teams of colored marbles, weapon-battle variants | Units × traits × items × star levels | 7 classes × 6 weapons × 2 armor, physics-driven |
| Direction | Player places; simple follow cam | Tight editing + escalating chaos | None (grid replay) | Action-follow auto cam; director reserved |
| Watchability driver | Chaos, comedy, unpredictability | Legible color teams, suspense, series format | Build payoff, synergy math | Physics emergence + class behavior + in-battle progression |
| Progression | Roster unlocks across game | Persistent numbered series | Star-upgrades per round | **In-battle** XP→level→gear/skill (unique) |
| Counters | Loose unit matchups | Random/chaotic | Trait/comp counters | Soft counters via break-armor ratios |
| Recording | N/A (game) | Native to the medium (video) | N/A | First-class: frame capture → video |
| Not adopted from them | Campaign, multiplayer, creator, possession | Marble-run/obstacle formats | Shop/economy/grid/bench | — |

---

## Sources

- Official / authoritative docs (confidence MEDIUM):
  - Rapier determinism & joints & rigid-bodies — `rapier.rs/docs/user_guides/javascript/*`, `@dimforge/rapier2d` README
  - PixiJS performance tips & ParticleContainer — `pixijs.com` guides (v7/v8)
- Competitor / market (web search, confidence LOW–MEDIUM, cross-checked):
  - TABS — Landfall/Epic/PlayStation/Polygon/IGN store descriptions (features: ragdoll physics, 140+ units, campaign, creator, multiplayer, possession)
  - Lost Marbles — YouTube channel `@lostmarbles2d` (Marble Kingdoms, Great Marble Weapon Battle, etc.)
  - Auto-battler genre — Wikipedia "Auto battler"; design codex (hayao.dev), dev frameworks (itch.io/Unity)
- Watchability / spectating research (confidence MEDIUM):
  - Unity CineCast cinematography-AI (2018)
  - "AI Powered Commentary and Camera Direction in E-Sports" (IJIMAI, LoL + GPT-4o + Conv-LSTM/3D-CNN)
  - GIST "intelligent observer" (Mask R-CNN ROCI, StarCraft; ESWA Vol 213)
- AI architecture (confidence MEDIUM):
  - Behavior Trees survey / Unreal BT docs; BT+RL hybrid (AMD Schola, arXiv)
- Counter design (confidence MEDIUM):
  - gamedeveloper.com "Rock, Paper, Scissors Design in Strategy Games"; AoE2 counter references; balancing-RPS writeups
- Project-internal (authoritative): `.planning/PROJECT.md`, `.planning/reference/ai-marble-kingdom.md`

---

*Feature research for: browser-hosted 2D physics battle simulation (tactical combat milestone)*
*Researched: 2026-10-15*
