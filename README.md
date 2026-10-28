# MineGuard V0.1 — Red Team / Blue Team Digital Twin

**Status:** MG-001 scaffold, MG-002 shared 3D world, MG-004 rooms / private Red editing, MG-007 mission planning / flight / cameras and MG-008 virtual sensing / candidates / Live timing / Red tracking built and tested (see tasks/evidence/); MG-010 scoring/reveal/print export IN PROGRESS on feature PR #1; not complete until verified and merged. **Deadline:** 24-hour prototype.
**Authoritative source of truth:** This GitHub repository. No task is done based on a chat message or an unpushed local workspace.

## Goal
A two-person, hardware-free virtual aerial survey simulator. Red Team places hidden synthetic mine hazards and harmless decoys in one 3D fictional world. Blue Team joins the same room, plans a drone survey, flies a virtual drone, sees candidate findings when the simulated sensor scans eligible locations, and gets a mapped mission report with a post-mission ground-truth comparison.

This is an educational simulator, NOT operational landmine detection, actual buried-mine sensing, verified AI accuracy, or minefield clearance. All world coordinates are fictional X/Z units, NOT real GPS.

## Responsibilities
- **A Mohammed Rahil:** Original developer and tester for MG-001 through MG-008. MG-011 physical-device/network validation remains with Rahil unless explicitly reassigned.
- **Mohammed Shabaz S with ChatGPT assistance:** Owns requirements/presentation and the authorized MG-010 coding handoff. GitHub Actions executes actual automated verification; test PASS claims require workflow logs and evidence. No one should invent results.
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
- .github/workflows/task-gate.yml — GitHub Actions dependency validation.
- .github/workflows/mg010-checks.yml — MG-010 PR typecheck, build, backend and browser verification.

## Run locally
Requires Node.js 22.13+ (uses built-in `node:sqlite`; tested on Node 24.13.0, Windows 11). Room data is stored in `data/mineguard.sqlite` (gitignored; set `MINEGUARD_DB` to change it, delete the file to reset all rooms).

```bash
npm install
npm run dev        # Express + Socket.IO on :3000, Vite client on http://localhost:5173 (proxies /api and /socket.io)
npm run build      # build the client into client/dist
npm start          # production: one origin on http://localhost:3000 serving client, /api and Socket.IO (PORT env to change)
npm test           # server smoke tests (run "npm run build" first to include the served-client test)
npm run typecheck  # TypeScript checks for client and server
npm run test:e2e   # browser test: Red + Blue in headless Edge (needs "npm run build"; MINEGUARD_E2E_BROWSER=chrome to use Chrome)
```

Routes: `/` home, `/red` Red Team portal (Create Room, or resume via the private `/red#room=CODE&key=...` link), `/blue` and `/blue/CODE` Blue Team portal, `/api/health`, `/api/world`, `/api/rooms/*` (see docs/API_CONTRACT.md).

## Code layout
- `client/` — Vite + React + TypeScript + Tailwind; `src/pages/` holds Home, AttackerPortal, DefencePortal.
- `server/` — Express + Socket.IO (`src/app.ts` builds the server, `src/index.ts` starts it); `test/` holds smoke tests (node:test via tsx).
- `shared/protocol.ts` — types and event names shared by client and server.
- `shared/world.ts` — the one shared world and X/Z coordinate system (see docs/ARCHITECTURE.md).
- `shared/scenario.ts` — scenario objects, categories, coordinate validation, error codes, edit rules.
- `shared/mission.ts`, `shared/sensor.ts` — mission plans, manual/grid route validation, serpentine generator, flight geometry; sensor modes and footprint radii.
- `server/src/mission/` — server-authoritative mission engine (clock, commands, persistence), virtual sensor (`sensor.ts`) and mission routes.
- `client/src/blue/`, `client/src/world/CameraRig.tsx` — Blue planner/controls/telemetry, 3D route and drone, three camera modes.
- `server/src/rooms/` — SQLite room store, attacker-only HTTP routes, role-separated Socket.IO channels.
- `client/src/red/`, `client/src/world/ObjectMarkers.tsx` — Red portal panels and Red-only 3D markers.
- `tests/fixtures/` — synthetic sample scenarios (no real data, no tokens).
- `client/src/world/` — React Three Fiber scene: terrain, roads, trees, landmarks, bounds, picking.
- `tests/e2e/` — browser end-to-end tests (playwright-core with the installed Edge/Chrome).

## Planned technical stack
Vite + React + TypeScript, Three.js/React Three Fiber, Node + Express + Socket.IO, SQLite for runtime persistence, bundled terrain assets. A single laptop-hosted backend serves same-world online tunnel access and local Wi-Fi backup. Neither hosting nor implementation has been completed yet.

## Public repository hygiene
Do not commit attacker control tokens, private URLs, live hidden minefield rooms, SQLite runtime databases, API keys, tunnel credentials, node_modules, or secrets. Git history preserves old documentation from before this reset even though old files are deleted from the current main tree.
