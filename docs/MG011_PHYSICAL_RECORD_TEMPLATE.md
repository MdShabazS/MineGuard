# MG-011 Actual Physical Test Record — Copy and Complete

**This is a BLANK template, not test evidence and not a PASS claim.** Do not rename this file or mark MG-011 DONE until both LAN and external internet checks have truly run. See docs/MG011_NETWORK_RUNBOOK.md for instructions.

Task: MG-011
Owner: Shabaz
Tester: [person who used real devices: Rahil or Shabaz]
Result: [PENDING / PASS / FAIL — never pre-fill PASS]

## Test environment and session

- Date, start/end time, timezone: [observed]
- Tested Git commit SHA: [exact SHA]
- Host computer OS/version: [observed]
- Node.js version and host browser/version: [observed]
- Phone make/model, operating system, browser/version: [observed]
- Phone and laptop on private Wi-Fi/hotspot: [yes/no and general network, no secret SSID/password]
- Host bind and port: [e.g. 0.0.0.0:3000]
- Internet tunnel product/version/HTTPS: [observed; no live hostname needed]
- Photos/screenshots: [only sanitized files, no private Red URL or bearer token]
- Console/browser failures: [raw errors, sanitized]

## Actual physical LAN results

| Check | Actual action and observed evidence | PASS / FAIL / NOT RUN |
|---|---|---|
| N01 phone health and Blue page | [ ] | NOT RUN |
| N02 same room/world checksum on 2 physical devices | [ ] | NOT RUN |
| N03 live revisions and findings propagate | [ ] | NOT RUN |
| N04 no Red hidden truth leaks to Blue before reveal | [ ] | NOT RUN |
| N05 lock and mission controls across devices | [ ] | NOT RUN |
| N06 Wi-Fi loss + reconnect recovery | [ ] | NOT RUN |
| N07 phone touch, canvas and viewport usable | [ ] | NOT RUN |
| N08 post-finish report and browser Save as PDF | [ ] | NOT RUN |
| N09 no private tokens or links shared publicly | [ ] | NOT RUN |

## Actual internet / HTTPS results (phone MOBILE DATA, Wi-Fi off)

| Check | Actual action and observed evidence | PASS / FAIL / NOT RUN |
|---|---|---|
| N01 HTTPS phone opens same server | [ ] | NOT RUN |
| N02 same room/world checksum across tunnel/LAN | [ ] | NOT RUN |
| N03 real-time Socket.IO events traverse tunnel | [ ] | NOT RUN |
| N04 Blue secrecy preserved before reveal | [ ] | NOT RUN |
| N05 mission controls and refresh | [ ] | NOT RUN |
| N06 mobile network drop/reconnect | [ ] | NOT RUN |
| N07 mobile UI/3D usability | [ ] | NOT RUN |
| N08 reveal and printable report | [ ] | NOT RUN |
| N09 private controls not shared publicly | [ ] | NOT RUN |
| N10 tunnel disabled after test | [ ] | NOT RUN |

## Automated CI results (separate, not physical)

- GitHub Actions exact run URL: [add after the test actually finishes]
- Actual suite, test counts, skips, failures: [copy from log]
- Network test host interface: [CI runner only, no physical device inference]
- Headless Chromium mobile-context test: [emulated, not a real phone]

## Defects, decisions and limitations

- [List each failure, root cause and observed retest. Do not declare an untested fix complete.]

## Sign-off

- Physical tester: [name of person who actually performed testing]
- Evidence links: [sanitized file paths or log links]
- LAN actual PASS: [yes/no]
- Internet actual PASS: [yes/no]
- MG-011 DONE allowed? [ONLY if both actual test categories passed, clear known limits and GitHub task gate succeeds]
