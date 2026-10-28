# Architecture — Source of Truth, Security and Simulation

## Proposed implementation (not built yet)
- Frontend: Vite/React/TypeScript, React Three Fiber + Three.js, responsive mission-control UI.
- Backend: Node.js + Express + Socket.IO, typed shared messages, server-authoritative room, route, flight and sensing logic.
- Persistence: SQLite on the running server (not in Git); source, safe seed fixtures, documentation and test evidence versioned on GitHub.
- Network: one stateful server accessible by local IP or optional HTTPS tunnel. Both portals access same server; online and local don't become independent divergent worlds.

## Data flow
Red UI -> attacker-authenticated placement commands -> server private scenario
Blue UI -> mission planning/controls -> server-authoritative route & virtual drone
Server -> authorized telemetry and candidate events -> Blue/Red UI
Server -> attacker-only hidden object list -> Red UI
Server -> post-finish comparison and report -> permitted clients

## Suggested models
World {terrainId, xMin, xMax, zMin, zMax, landmarks}
Room {roomId, code, attackerTokenHash, mode, state, revision}
Object {id, roomId, kind:HAZARD|DECOY, hazardClass, x,z, activeFrom, inactiveAt}
Mission {roomId, routeType, waypoints, progress, status, speedMultiplier, sensorMode, sensorProfile, seed}
Observation {id, missionId, virtualX,virtualZ, simTime, source:SIMULATED, reviewState, matchedObjectIdPrivate}
Audit {roomId, sequence, actor, event, timestamp, revision}

## Critical security boundary
Defender join code grants participation only, NEVER placement access. Use a strong unguessable attacker capability/token for edits. The backend must never send hidden coordinates or unobserved object details to a Blue client in HTTP, Socket, initial JSON, mesh props or browser storage. Show only authorized observations. Check roles, room IDs and world bounds for all edits. Don't log or commit tokens.

## Server-driven flight
Advance virtual drone along waypoint segments with authoritative simulated time, pause/resume/stop and speeds 1x/2x/4x. Client renders smoothly via interpolation and switches among 3 camera modes. For range checks, calculate swept path segment distance to object, not just one frame's distance, so high speed cannot skip detections. Each event recorded once (unless an explicit retry model says otherwise).

## Modes
Challenge: freeze scenario placements before flight; reject further mutation until end/new scenario.
Live: allow logged mid-flight additions, movements/deletions. Changes effective from server event time; no retroactive detections. Score according to time of exposure; log revisions.

## Reconnect / recovery
Role-filtered state snapshot on reconnect; show network status and errors. Reproducible scenario seed and report state. Use sanitized fixture for faculty demo. Runtime DB is necessary operational state, but never use GitHub as a realtime transactional database.
