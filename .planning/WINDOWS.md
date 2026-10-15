---
schema_version: 1
open_count: 1
waived_count: 0
fixed_count: 0
total_count: 1
last_updated: 2026-10-15T10:49:41.313Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 1 | deviation | tsconfig.json |  | TS7 removed baseUrl; @/* alias switched to relative paths entry (./src/*) [Rule 3, resolved in faf12cb] | open |  | 2026-10-15T10:49:41.313Z |  |

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
  }
]
````
