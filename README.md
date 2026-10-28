# MineGuard V0.1 — Red Team / Blue Team Digital Twin

**Status:** Requirements approved; engineering implementation NOT STARTED. **Deadline:** 24-hour prototype.
**Authoritative source of truth:** This GitHub repository. No task is done based on a chat message or an unpushed local workspace.

## Goal
A two-person, hardware-free virtual aerial survey simulator. Red Team places hidden synthetic mine hazards and harmless decoys in one 3D fictional world. Blue Team joins the same room, plans a drone survey, flies a virtual drone, sees candidate findings when the simulated sensor scans eligible locations, and gets a mapped mission report with a post-mission ground-truth comparison.

This is an educational simulator, NOT operational landmine detection, actual buried-mine sensing, verified AI accuracy, or minefield clearance. All world coordinates are fictional X/Z units, NOT real GPS.

## Responsibilities
- **A Mohammed Rahil (main developer):** Uses Codex + ChatGPT; implements all code, integration, deployment, testing, QA and fixes. Rahil is the **ONLY software tester**.
- **Mohammed Shabaz S:** Uses ChatGPT only; owns requirements, scenario/mission/detection/report specs and faculty presentation documents. Does not run software tests or invent PASS evidence.
- GitHub is authoritative for all code, reproducible configuration, decisions, task status, safe sample scenarios, and actual QA evidence. Temporary working checkouts and runtime server databases are not the authoritative source.

## Start immediately
1. Read docs/DECISIONS.md, docs/PROJECT_SPEC.md, docs/ARCHITECTURE.md and docs/WORKFLOW.md.
2. Review TASK_BOARD.md, tasks/manifest.json and tasks/status.json.
3. Rahil runs: node scripts/task-gate.mjs validate ; node scripts/task-gate.mjs next ; node scripts/task-gate.mjs check MG-001 .
4. Start only the first READY task, commit/push its IN_PROGRESS status, do the work, attach evidence, then mark DONE via task gate and push.
5. Stop at any unmet prerequisite. E.g. MG-004 is BLOCKED until Shabaz has completed MG-003 in GitHub.
6. Share commit links between teammates after each task, not unsupported 'completed' messages.

## Important links in this repository
- docs/DECISIONS.md — all 18 confirmed decisions.
- docs/PROJECT_SPEC.md — two portals, shared world, mission and reports.
- docs/ARCHITECTURE.md — engine, runtime, security and data flow.
- docs/API_CONTRACT.md — planned API and Socket.IO event contract.
- docs/DETECTION_AND_EVALUATION.md — sensor and metrics contracts.
- docs/UX_AND_SCENARIOS.md — UI panels and synthetic demo fixtures.
- docs/24H_EXECUTION.md — timing, priorities and cutlines.
- docs/WORKFLOW.md — strict gate/handoff rules and GitHub workflow.
- docs/TEST_AND_DEMO.md — Rahil-only tests and live faculty script.
- docs/HANDOFF_RAHIL.md and docs/HANDOFF_SHABAZ.md — separate participant instructions.
- TASK_BOARD.md — serial responsibilities, deliverables, dependencies.
- scripts/task-gate.mjs, tasks/manifest.json, tasks/status.json — machine task gate.
- .github/workflows/task-gate.yml — GitHub Actions validation.

## Planned technical stack
Vite + React + TypeScript, Three.js/React Three Fiber, Node + Express + Socket.IO, SQLite for runtime persistence, bundled terrain assets. A single laptop-hosted backend serves same-world online tunnel access and local Wi-Fi backup. Neither hosting nor implementation has been completed yet.

## Public repository hygiene
Do not commit attacker control tokens, private URLs, live hidden minefield rooms, SQLite runtime databases, API keys, tunnel credentials, node_modules, or secrets. Git history preserves old documentation from before this reset even though old files are deleted from the current main tree.
