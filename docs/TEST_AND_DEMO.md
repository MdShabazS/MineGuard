# Testing, Evidence and Faculty Demonstration

**Rahil tested MG-001–MG-008. MG-010 was explicitly reassigned to Shabaz for ChatGPT-assisted development, with actual automated tests executed by GitHub Actions CI (not by Rahil). MG-011 two-device physical testing remains Rahil's responsibility.** Every BUILD task requires an honest tasks/evidence/MG-XXX.md file, with entries such as:
Task: MG-001
Owner: Rahil
Tester: Rahil
Result: PASS
The file must also record actual commands, observed output, device/browser versions, evidence links and known limitations. No fabricated PASS. MG-010 evidence names its actual CI tester. Shabaz's DOC tasks need committed specification files; no software test outcome may be fabricated.

## Test matrix (Rahil)
T01 same-device two tabs; T02 two physical devices; T03 join with code/link; T04 private attacker capability cannot be guessed from room code; T05 click placement; T06 coordinate edit/delete; T07 Blue network payload contains no undiscovered positions; T08 scenario lock; T09 Live changes and revision log; T10 manual waypoints; T11 grid survey; T12 3 cameras; T13 start/pause/resume/stop; T14 speeds 1x/2x/4x; T15 profile radius consistency; T16 Basic range and out-of-range miss; T17 dedup; T18 Advanced seeded synthetic false alarm/miss; T19 candidate detail panel; T20 scoring including zero denominators; T21 report export without private token; T22 internet and LAN two-device; T23 refresh/rejoin; T24 projector/mobile.

## Live faculty script (5–7 min)
1. Red creates room, shows fictional 3D world, places several virtual hazards/decoys including one outside chosen survey area.
2. Red shares public defender link/code without revealing private control token.
3. Blue joins on separate device, sees same world but no hidden mines.
4. Blue chooses mission, previews route and scan footprint, launches virtual drone.
5. A candidate marker appears only when scanner approaches a placed hazard; show detection detail, pause, resume at 2x.
6. End mission, reveal ground truth and explain detected versus unscanned versus simulated sensor misses.
7. Open the verified report page and use browser Print / Save as PDF; explain real sensor hardware and trained detection are future work.

## Fallback
If internet breaks, use LAN host IP. If phone fails, use two tabs. If Advanced unstable, use Basic. If Live editing unstable, use locked Challenge. If PDF library fails, browser print-to-PDF. Explain only actually verified features.
