# MineGuard V0.1 — All 18 Confirmed Decisions

| No. | Requirement | Approved selection |
|---|---|---|
| 01 | Device access | Both same-device tabs and two separate devices |
| 02 | Networking | Both online access and LAN/Wi-Fi fallback |
| 03 | Environment | Interactive 3D terrain |
| 04 | Detection architecture | Hybrid: simulated virtual detection + separate real-CV extension |
| 05 | Sensing behavior | Basic guaranteed in-range + Advanced probabilistic simulation |
| 06 | Route planning | Manual waypoints AND automatic zigzag/grid survey |
| 07 | Attacker mode | Locked Challenge + editable Live Scenario |
| 08 | Object types | Multiple synthetic hazard categories and harmless decoys |
| 09 | Joining | Room code and shareable defence link |
| 10 | Findings | Automatic mapping and a detailed candidate detection panel |
| 11 | Terrain asset | One shared detailed fictional 3D world |
| 12 | Red placement | Click terrain and enter/edit coordinates |
| 13 | Drone cameras | 3D Overview, Follow Drone, Top-Down |
| 14 | Attacker drone view | Optional live drone tracking |
| 15 | Scan profiles | Narrow, Standard, Wide |
| 16 | End result | Analysis + truth comparison + downloadable report |
| 17 | Authentication | Guest participation and private attacker control link |
| 18 | Mission controls | Start, pause, resume, stop; 1x/2x/4x speed |

## Scope clarifications
- This is a synthetic game-like engineering simulation, not real landmine sensing. Basic Mode detects eligible virtual objects ONLY when swept scan footprint comes into range, even for 'buried' simulated category; do not imply an actual RGB camera senses buried mines.
- Advanced Mode introduces seeded synthetic misses/false alarms, not a real accuracy measurement.
- Real CV is a documented optional extension for harmless surrogate images, NOT a prerequisite to the core 24-hour demo and NOT something we may claim is built.
- Challenge freezes attacker edits; Live mode permits edits with a time/revision log.
- The backend alone owns private scenario coordinates and sensor checks. Defence clients must not receive undiscovered placements.
- All software artifacts/docs/evidence are version-controlled in GitHub. Private live runtime state does not belong in a public Git repository.
