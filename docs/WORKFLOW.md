# GitHub-First Sequential Collaboration Protocol

The entire project is maintained in GitHub repository MdShabazS/MineGuard. Neither a chat statement nor a local unsynced Codex workspace counts as task completion.

## Two owners
Rahil: original developer/tester of MG-001–MG-008. For MG-011, he or Shabaz must physically run the two-device checks; no remote CI run can replace physical hardware proof.
Shabaz with ChatGPT assistance: authorized implementation and network test automation for MG-010/MG-011; automated test results may be attributed only to the actual CI runner. MG-011 is IN_PROGRESS until physical LAN and online access is evidenced.
Shabaz: specifications and presentations plus authorized MG-010 ChatGPT-assisted code handoff. Do not mark any test PASS unless it was actually executed and evidenced.

## Serial task gate
Tasks are in tasks/manifest.json. Status lives in tasks/status.json on main. The complete order is MG-000 through MG-013, each task after MG-000 depending on the immediately prior one. States: TODO, IN_PROGRESS, DONE. At most one IN_PROGRESS.

Before start, fetch latest GitHub main, read previous evidence, then check the task gate. If preceding task is not DONE: STOP work and report owner/ID. Even if a later task seems independent, it remains blocked by the agreed global chain.

Example: BLOCKED: MG-004 requires MG-003 (Shabaz). Ask Shabaz to complete and commit MG-003 before beginning MG-004.

## Rahil terminal commands on latest GitHub checkout
node scripts/task-gate.mjs validate
node scripts/task-gate.mjs next
node scripts/task-gate.mjs check MG-004
node scripts/task-gate.mjs start MG-004 Rahil
[commit IN_PROGRESS and push, implement and test; write evidence]
node scripts/task-gate.mjs complete MG-004 Rahil tasks/evidence/MG-004.md
node scripts/task-gate.mjs validate
[commit/push changes and evidence]

## Shabaz (ChatGPT-only)
Ask ChatGPT to read live GitHub status first; check prerequisites and the task contract. If READY, write his assigned docs/specs/*.md directly to GitHub with GitHub connector and update tasks/status.json to IN_PROGRESS then DONE, referencing committed doc evidence. Shabaz need not use local files/terminal. After commit, send the GitHub commit link to Rahil. A Shabaz task cannot be claimed DONE without its specified document in the repo.

## Evidence
BUILD: Require truthful test logs and a named actual tester/execution environment (Rahil, or GitHub Actions CI for MG-010). File tasks/evidence/MG-XXX.md must include Task: ID, Owner: <task owner>, Tester: <actual test runner>, Result: PASS and actual test details. Never state that ChatGPT ran a browser test merely by reading code. DOC: referenced docs/specs/*.md must exist. A task gate validates this, while GitHub Actions checks state/chain on PR/push.

## Enforcement limits
A GitHub Actions check will reject invalid status states and skipped dependencies. **The repository administrator must enable a main branch ruleset requiring the task-gate job** to make CI blocking effective at merge time. Direct pushes/admin override can bypass checks if branch protection is not configured; do not falsely claim hard blocking is already protected. The human/agent must run 'check' BEFORE starting any code. Never force push. Avoid multiple people editing tasks/status.json at once.

## Handoff format
MG-XXX DONE — GitHub commit link, delivered files, evidence path, Rahil test results when BUILD, next task owner. On BLOCKED, report exact unmet task and wait for committed GitHub completion.

## Public repo hygiene
Source, documentation, safe fixtures, sanitized evidence and reproducible configuration must be in GitHub. Do NOT commit private active room tokens, tunnel credentials, runtime SQLite DB, private attacker's hidden world data, node_modules or secrets. Operational server DB is not a Git repository.
