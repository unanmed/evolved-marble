---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-10-24T13:26:12.025Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 2 | stub | src/physics/PhysicsWorld.ts |  | preVelocities map is a 02-06 placeholder (only cleared on removeUnit; populated by the damage pipeline) | open |  | 2026-10-19T05:59:06.535Z |  |
| 2 | 2 | deviation | src/physics/PhysicsWorld.ts |  | stored #rng deferred to 02-06 (no-unused-private-class-members); constructor param _rng kept | open |  | 2026-10-19T05:59:07.210Z |  |
| 3 | 05 | unmet-truth | src/kingdom/BattleSystem.ts |  | A battle triggered while the whole of one army sits outside the initial 80 m square (armies already overlapping at spawn) is one-sided from birth, joins only one faction, and loops: endUnsettled at the join grace, pair re-arms, retriggers - pinned at 1x forever. Out of scope for 05-14 (a centre/join rule change, not a debounce). | open |  | 2026-10-24T13:26:12.025Z |  |

````json
[
  {
    "id": 1,
    "kind": "stub",
    "phase": "2",
    "file": "src/physics/PhysicsWorld.ts",
    "line": null,
    "description": "preVelocities map is a 02-06 placeholder (only cleared on removeUnit; populated by the damage pipeline)",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-19T05:59:06.535Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "2",
    "file": "src/physics/PhysicsWorld.ts",
    "line": null,
    "description": "stored #rng deferred to 02-06 (no-unused-private-class-members); constructor param _rng kept",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-19T05:59:07.210Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "unmet-truth",
    "phase": "05",
    "file": "src/kingdom/BattleSystem.ts",
    "line": null,
    "description": "A battle triggered while the whole of one army sits outside the initial 80 m square (armies already overlapping at spawn) is one-sided from birth, joins only one faction, and loops: endUnsettled at the join grace, pair re-arms, retriggers - pinned at 1x forever. Out of scope for 05-14 (a centre/join rule change, not a debounce).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-24T13:26:12.025Z",
    "resolved_at": null
  }
]
````
