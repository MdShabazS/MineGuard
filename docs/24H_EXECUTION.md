# 24-Hour Development Schedule and Cutlines

All tasks are **serial**; dependencies win over time slot estimates. No parallel implementation when prerequisite is incomplete.

| Time from start | Task | Owner | Milestone |
|---|---|---|---|
| 0h | MG-000 | Shabaz | Repo reset, complete baseline specification/gates |
| 0–2h | MG-001 | Rahil | App/client/server scaffold and smoke |
| 2–4h | MG-002 | Rahil | One interactive 3D world |
| 4–4.5h | MG-003 | Shabaz | Actual scenario schema/acceptance |
| 4.5–7h | MG-004 | Rahil | Room system, private placements, object editing |
| 7–7.5h | MG-005 | Shabaz | Mission UX acceptance |
| 7.5–8h | MG-006 | Shabaz | Detection/evaluation acceptance |
| 8–12h | MG-007 | Rahil | Routes, virtual drone and controls |
| 12–17h | MG-008 | Rahil | Basic/Advanced, candidate mapping, Live Mode |
| 17–17.5h | MG-009 | Shabaz | Report/presentation template |
| 17.5–19.5h | MG-010 | Rahil | Results and report export |
| 19.5–21h | MG-011 | Rahil | Online + offline LAN integration |
| 21–21.5h | MG-012 | Shabaz | Faculty demo notes |
| 21.5–24h | MG-013 | Rahil | Release tests, bug fixes and rehearsals |

## P0 required working path
Rooms, separate clients, hidden server truth, one 3D world, attacker placement, virtual flight path, Basic sensor scanning, mapped candidate observations and comparison. If this fails, stop adding features immediately.

## P1 if P0 stable
Advanced detection, live attacker edits, all cameras, mission speeds, profiles, report, reliable online/LAN fallback.

## P2 optional
Real computer-vision integration, high fidelity physics, elaborate vegetation/weather, actual hardware. Do not sacrifice a complete simulation to embellish the 3D scene.

## Enforcement and final window
MG-XXX cannot begin until preceding MG-YYY DONE in committed status. At hour 17 freeze additions if P0 broken. At hour 21 freeze features, test two-device demonstration, rehearse and preserve fallback scenario. No test may be marked PASS without actual Rahil execution.
