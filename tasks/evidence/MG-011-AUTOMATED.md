# MG-011 — Verified Automated Network Evidence (NOT Final Physical QA)

Task: MG-011
Owner: Shabaz
Tester: GitHub Actions CI — **automated / emulated clients only**
Result: AUTOMATED PASS — PHYSICAL LAN + HTTPS INTERNET NOT RUN

**Current canonical task status:** IN_PROGRESS. This file is **not** the final `tasks/evidence/MG-011.md` sign-off and must not be used to mark MG-011 DONE. The test contract also requires real phone/laptop proof for both LAN and remote internet.

## Traceability

- Application merge: https://github.com/MdShabazS/MineGuard/commit/b67e2145797ca8d62918b76361f8e5d66e4f9415
- Implementation PR: https://github.com/MdShabazS/MineGuard/pull/2
- Tested feature SHA before squash: 4b7bd967a0fd99f3e56e88cde6252223ea8c3518
- Dedicated network CI: https://github.com/MdShabazS/MineGuard/actions/runs/40762734867
- Full regression CI: https://github.com/MdShabazS/MineGuard/actions/runs/40762734719
- Runbook: docs/MG011_NETWORK_RUNBOOK.md
- Physical test record template (blank): docs/MG011_PHYSICAL_RECORD_TEMPLATE.md

## Observed real CI output, 2026-10-28 UTC

| Actual runner test | Result |
|---|---|
| npm ci | PASS |
| node scripts/task-gate.mjs validate | PASS; MG-011 remains IN_PROGRESS |
| npm run typecheck | PASS |
| npm run build | PASS |
| npm test (full backend/regression suite) | **81/81 PASS, 0 FAIL, 0 SKIP** |
| MINEGUARD_E2E_BROWSER=chromium npm run test:e2e (full suite) | **7/7 PASS, 0 FAIL, 0 SKIP** |
| Standalone `npx tsx --test server/test/lan.test.ts` | **1/1 PASS, 0 FAIL, 0 SKIP** |
| Standalone `npx tsx --test tests/e2e/lan.e2e.ts` | **1/1 PASS, 0 FAIL, 0 SKIP** |

The network unit test binds the real server to 0.0.0.0 at a random port, connects two **independent TCP Socket.IO clients** using the hosted runner's genuine **non-loopback network-interface IPv4** (not 127.0.0.1), checks `/api/health` and role-specific joins, verifies private Red objects cannot appear in Blue snapshot or public update, denies unauthenticated Red access, and verifies Blue can rejoin without hidden data.

The browser test opens the built app on the runner's non-loopback IPv4 using an isolated desktop browser context for Red and a **mobile-emulated Chromium** context for Blue (393×852, touch emulation). It confirms the same fictional room and terrain checksum, privacy in Blue responses/DOM, real-time scenario revisions, a simulated mobile offline state and an explicitly closed WebSocket transport, then automatic room reconnection. Test both passed after fixing an initial network outage emulation that did not close Chromium's already open WebSocket. That initial failure is **not** reported as a PASS.

All pre-existing MG-001 through MG-010 backend and headless browser journeys also passed in the same full run. The tests are educational simulation checks only.

## Delivered implementation

- `server/src/index.ts`: explicit all-interface binding, printed local and possible private-LAN URLs, firewall warning and production build check.
- `scripts/lan-preflight.mjs`: host-side HTTP health/production HTML/shared world validation and Socket.IO WebSocket ping/ack using actual specified IPv4. Run with `npm run lan:check -- <HOST_LAN_IPV4> 3000`. This is a host-only preflight, **not a physical network pass**.
- `server/test/lan.test.ts`: real non-loopback network-interface backend test with independent WebSocket peers and role isolation.
- `tests/e2e/lan.e2e.ts`: two independent browser contexts, one mobile-emulated, network interruptions and reconnect.
- `docs/MG011_NETWORK_RUNBOOK.md`: host setup, real two-device LAN check, optional Cloudflare Quick Tunnel HTTPS procedure, privacy safeguards and completion criteria.
- `docs/MG011_PHYSICAL_RECORD_TEMPLATE.md`: an explicitly blank evidence form for actual tests.
- `.github/workflows/mg011-network.yml`: fast targeted network smoke checks in PR.
- README, task board and collaboration instructions updated for authorized Shabaz/ChatGPT development handoff.

## Not yet performed and cannot be marked PASS from CI

1. **No physical Android phone + Windows/macOS/Linux computer** actually tested on the same Wi-Fi by this assistant. CI's simulated mobile viewport is not a physical phone.
2. **No live external HTTPS Cloudflare tunnel was created**, and no physical phone mobile-data browser connected through one. Tunnel compatibility, accessibility and actual internet latency are unverified.
3. No genuine host OS firewall permission, actual Wi-Fi client isolation, second physical device WebGL memory/gesture performance, printed physical PDF, or school/campus VPN/hotspot path was tested.
4. CI automated reconnect tests validate one transport interruption on the hosted runner, not mobile carrier handoff, sleep/background restrictions or long-duration stability.
5. Keep `MG-011` **IN_PROGRESS** and `MG-012` BLOCKED until actual physical LAN and internet checks are documented by the real tester in `tasks/evidence/MG-011.md`.

**No physical-device PASS or completion claim is made.**
