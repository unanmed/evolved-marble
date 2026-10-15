---
schema_version: 1
open_count: 3
waived_count: 0
fixed_count: 0
total_count: 3
last_updated: 2026-10-15T11:15:15.871Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 1 | deviation | tsconfig.json |  | TS7 removed baseUrl; @/* alias switched to relative paths entry (./src/*) [Rule 3, resolved in faf12cb] | open |  | 2026-10-15T10:49:41.313Z |  |
| 2 | 1 | deviation | src/sim/commands.ts |  | submit() widened from readonly Command[] to readonly unknown[] so the trust boundary can validate and deterministically reject unknown kind/missing fields at runtime (T-01-05). | open |  | 2026-10-15T11:15:15.249Z |  |
| 3 | 1 | deviation | src/sim/systems/movement.ts |  | MOVEMENT_NUDGE_SCALE relocated to content/formulas.ts (D-06 single source) and consumed by movementSystem; file was not in Task 1's planned list. | open |  | 2026-10-15T11:15:15.871Z |  |

````json
[
  {
    "id": 1,
    "kind": "deviation",
    "phase": "1",
    "file": "tsconfig.json",
    "line": null,
    "description": "TS7 removed baseUrl; @/* alias switched to relative paths entry (./src/*) [Rule 3, resolved in faf12cb]",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T10:49:41.313Z",
    "resolved_at": null
  },
  {
    "id": 2,
    "kind": "deviation",
    "phase": "1",
    "file": "src/sim/commands.ts",
    "line": null,
    "description": "submit() widened from readonly Command[] to readonly unknown[] so the trust boundary can validate and deterministically reject unknown kind/missing fields at runtime (T-01-05).",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T11:15:15.249Z",
    "resolved_at": null
  },
  {
    "id": 3,
    "kind": "deviation",
    "phase": "1",
    "file": "src/sim/systems/movement.ts",
    "line": null,
    "description": "MOVEMENT_NUDGE_SCALE relocated to content/formulas.ts (D-06 single source) and consumed by movementSystem; file was not in Task 1's planned list.",
    "status": "open",
    "reason": "",
    "recorded_at": "2026-10-15T11:15:15.871Z",
    "resolved_at": null
  }
]
````
