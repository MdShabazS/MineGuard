# MineGuard V0.1 — Strict Sequential Tasks

**Only one active task at a time. All tasks depend on the immediately previous task, regardless of owner.** Follow machine state tasks/status.json in GitHub and docs/WORKFLOW.md.

| Task | Owner | Type | Depends on | Work |
|---|---|---|---|---|
| MG-000 | Shabaz | DOC | — | Reset repository and publish all baseline docs |
| MG-001 | Rahil | BUILD | MG-000 | App scaffold: React, Express, Socket.IO, health route and smoke tests |
| MG-002 | Rahil | BUILD | MG-001 | One shared interactive 3D terrain and consistent X/Z system |
| MG-003 | Shabaz | DOC | MG-002 | Scenario object and Red Portal acceptance contract |
| MG-004 | Rahil | BUILD | MG-003 | Rooms, private attacker controls and Red editing |
| MG-005 | Shabaz | DOC | MG-004 | Defender mission-planner and camera acceptance contract |
| MG-006 | Shabaz | DOC | MG-005 | Detection and evaluation acceptance contract |
| MG-007 | Rahil | BUILD | MG-006 | Grid/manual flight, drone animation and controls |
| MG-008 | Rahil | BUILD | MG-007 | Sensor simulation, candidate map, live edits and tracking |
| MG-009 | Shabaz | DOC | MG-008 | Report and faculty demonstration template |
| MG-010 | Shabaz (ChatGPT-assisted, CI-tested) | BUILD | MG-009 | Comparison, scoring and report export |
| MG-011 | Shabaz (ChatGPT-assisted) | BUILD | MG-010 | LAN/online access automation and documented real two-device verification |
| MG-012 | Shabaz | DOC | MG-011 | Final explanation and presentation Q&A |
| MG-013 | Rahil | BUILD | MG-012 | Full release QA, runbook and stabilization |

## Exact deliverables and evidence
- **MG-000 (Shabaz)**: Reset repository and publish all baseline docs. Evidence: README.md. Shabaz writes and commits specification; no software test claim.
- **MG-001 (Rahil)**: App scaffold: React, Express, Socket.IO, health route and smoke tests. Evidence: tasks/evidence/MG-001.md. Rahil tests and records actual PASS only if executed.
- **MG-002 (Rahil)**: One shared interactive 3D terrain and consistent X/Z system. Evidence: tasks/evidence/MG-002.md. Rahil tests and records actual PASS only if executed.
- **MG-003 (Shabaz)**: Scenario object and Red Portal acceptance contract. Evidence: docs/specs/SCENARIO_CONTRACT.md. Shabaz writes and commits specification; no software test claim.
- **MG-004 (Rahil)**: Rooms, private attacker controls and Red editing. Evidence: tasks/evidence/MG-004.md. Rahil tests and records actual PASS only if executed.
- **MG-005 (Shabaz)**: Defender mission-planner and camera acceptance contract. Evidence: docs/specs/MISSION_ACCEPTANCE.md. Shabaz writes and commits specification; no software test claim.
- **MG-006 (Shabaz)**: Detection and evaluation acceptance contract. Evidence: docs/specs/DETECTION_ACCEPTANCE.md. Shabaz writes and commits specification; no software test claim.
- **MG-007 (Rahil)**: Grid/manual flight, drone animation and controls. Evidence: tasks/evidence/MG-007.md. Rahil tests and records actual PASS only if executed.
- **MG-008 (Rahil)**: Sensor simulation, candidate map, live edits and tracking. Evidence: tasks/evidence/MG-008.md. Rahil tests and records actual PASS only if executed.
- **MG-009 (Shabaz)**: Report and faculty demonstration template. Evidence: docs/specs/REPORT_PRESENTATION.md. Shabaz writes and commits specification; no software test claim.
- **MG-010 (Shabaz / ChatGPT-assisted)**: Scoring, explicit post-finish reveal and printable HTML/Save as PDF. Evidence: tasks/evidence/MG-010.md; Tester: GitHub Actions CI, actual 80 backend and 6 browser PASS. The previous Rahil assignment was explicitly handed over. Physical device QA stays MG-011/Rahil.
- **MG-011 (Shabaz / ChatGPT-assisted)**: LAN network bind/health/Socket.IO automation, manual physical-device runbook, and verification of both LAN and internet with two real devices. Evidence when genuinely completed: tasks/evidence/MG-011.md. Actual tester may be Rahil or Shabaz, supported by observed physical evidence. **CI emulation alone is insufficient for DONE.**
- **MG-012 (Shabaz)**: Final explanation and presentation Q&A. Evidence: docs/specs/FACULTY_DEMO_NOTES.md. Shabaz writes and commits specification; no software test claim.
- **MG-013 (Rahil)**: Full release QA, runbook and stabilization. Evidence: tasks/evidence/MG-013.md. Rahil tests and records actual PASS only if executed.

## Task gate
On an up-to-date repo checkout: node scripts/task-gate.mjs validate ; node scripts/task-gate.mjs next ; node scripts/task-gate.mjs check MG-004 . Rahil may start/complete tasks using task-gate CLI. Shabaz uses ChatGPT connected to GitHub for status/doc updates.

If MG-003 is not DONE: BLOCKED: MG-004 requires MG-003 (Shabaz). Ask Shabaz to complete and commit MG-003 before beginning MG-004.

The current task status is in tasks/status.json. After MG-010 is verified and merged, MG-011 is the next READY task for Rahil. Do not work ahead. All status and evidence must be pushed to GitHub.
