# Rahil — Original Implementer and Optional MG-011 Physical Test Partner

Read latest GitHub repo, README, TASK_BOARD.md, docs/DECISIONS.md, docs/PROJECT_SPEC.md, docs/ARCHITECTURE.md and docs/WORKFLOW.md before starting. No local-only work: commit/push every meaningful code change, test record, run command and setup detail.

## Start MG-001
1. Run node scripts/task-gate.mjs validate, next, check MG-001.
2. If READY, start MG-001 Rahil and push task IN_PROGRESS state.
3. Scaffold React/Vite/TypeScript and Express/Socket.IO, one-origin app with health endpoint and simple separate Red/Blue screens.
4. Actually run smoke tests; record commands/results in tasks/evidence/MG-001.md with exact Tester: Rahil and Result: PASS only if true.
5. Complete via gate, push code+evidence+status and share commit link.
6. MG-002 follows after MG-001 DONE. **STOP before MG-004** until Shabaz finishes and commits MG-003 (even if you think you can implement it).

## Architectural priorities
- Fast lightweight Three.js terrain, no time wasted on photorealistic assets.
- Shared virtual coordinate scale and server-authoritative simulated drone/sensor.
- Attacker-only placement truth must never be sent to Blue browser.
- Scanned path proximity only; Basic reliable and Advanced seeded uncertainty.
- Actual two-device test on laptop and phone; internet tunnel with LAN backup.
- No real landmine sensing or ML detection claims.

## Task blocker response
BLOCKED MG-004: MG-003 is owned by Shabaz and not yet DONE in GitHub. Do not start MG-004. Ask Shabaz to commit his task, then re-fetch status.

## QA responsibility
Historical MG-001–MG-008 tests were performed by Rahil. MG-010 used actual GitHub Actions QA. MG-011 is now under Shabaz's ChatGPT-assisted branch; Rahil or Shabaz may perform the **real two-physical-device** tests using docs/MG011_NETWORK_RUNBOOK.md. Every PASS must cite observed results, device/browser, test date and sanitized evidence; no CI-only claim is a physical test.
