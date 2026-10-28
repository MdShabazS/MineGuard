# Shabaz — Documentation Owner and MG-010 ChatGPT-Assisted Handoff

Work entirely through ChatGPT + connected GitHub. No terminal/testing required. Every authoritative document and status change must land in GitHub.

## Step-by-step
1. Ask ChatGPT to read current GitHub tasks/status.json, tasks/manifest.json and prior task's evidence.
2. Only begin your own task if the preceding task is actually DONE in GitHub.
3. Ask ChatGPT to author the required docs/specs/*.md file directly in the repository and update your task status/evidence in GitHub. Verify the commit link.
4. Send Rahil the commit URL and next READY task. If blocked, wait—don't work ahead.
5. For documentation work, never claim runtime PASS. **Exception: MG-010** was authorized as ChatGPT-assisted implementation; its PASS evidence comes from executed GitHub Actions CI, not from Rahil or ChatGPT claiming a local test. MG-011 physical QA stays Rahil.

## Your assignments
MG-000 — all foundation documentation and reset: DONE.
MG-003 (only after MG-002 Rahil DONE) — docs/specs/SCENARIO_CONTRACT.md: virtual object types, actual world bounds, placement/edit/lock rules, safe scenarios and acceptance criteria.
MG-005 (after MG-004 Rahil DONE) — docs/specs/MISSION_ACCEPTANCE.md: both mission planners, route validation, three camera views, flight controls and UI acceptance.
MG-006 (after MG-005 Shabaz DONE) — docs/specs/DETECTION_ACCEPTANCE.md: sensor profiles, Basic/Advanced behavior, mapping events, synthetic metrics and evaluation cases.
MG-009 (after MG-008 Rahil DONE) — docs/specs/REPORT_PRESENTATION.md: PDF/print report field layout, result caveats and demonstration narrative.
MG-012 (after MG-011 Rahil DONE) — docs/specs/FACULTY_DEMO_NOTES.md: faculty presentation, Q&A, limitations, honest implemented-vs-proposed claims.

Do not ask Rahil to begin MG-004 until your MG-003 DONE commit is visible. Every other task follows that rule.
