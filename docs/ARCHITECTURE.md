# Architecture — Source of Truth, Security and Simulation

## Implementation stack (scaffold built in MG-001)
- Frontend: Vite/React/TypeScript, React Three Fiber + Three.js, responsive mission-control UI.
- Backend: Node.js + Express + Socket.IO, typed shared messages, server-authoritative room, route, flight and sensing logic.
- Persistence: SQLite on the running server (not in Git); source, safe seed fixtures, documentation and test evidence versioned on GitHub.
- Network: one stateful server accessible by local IP or optional HTTPS tunnel. Both portals access same server; online and local don't become independent divergent worlds.

## Shared world and coordinate system (implemented, MG-002)
Defined once in `shared/world.ts`; the server builds it and serves it at `GET /api/world`, and both portals render that same definition.
- World `mg-field-01`, 200 x 200 **virtual units** (fictional, not GPS): X in [0, 200], Z in [0, 200]. Corners are labelled in the 3D view.
- Height Y = `terrainHeight(world, x, z)`, deterministic (gaussian hills + gentle undulation). Roads are polylines; 140 trees come from a fixed-seed PRNG and stay clear of roads/landmarks; landmarks: base camp, radio mast, pond.
- Three.js scene position = (x - 100, y, z - 100): world (0,0) is scene (-100, -100), world centre (100,100) is the scene origin. Use `worldToScene` / `sceneToWorld`; never hand-convert.
- `isInBounds` rejects out-of-range and non-finite values (server must use it for every placement and waypoint). UI/placement precision is 0.1 unit (`roundCoord`).
- `checksum` (FNV-1a of the canonical definition) is verified by each client, so Red and Blue provably render the same world.
- Terrain click picks a world X/Z; a pointer drag over 4 px is a camera orbit, not a click.
- `/api/world` is public and contains no scenario/hazard data. Hazards will never be added to it.

## Rooms, roles and persistence (implemented, MG-004)
- Runtime state: SQLite via the built-in `node:sqlite` module (Node >= 22.13; it prints an "experimental" warning). Default file is `data/mineguard.sqlite` (gitignored); override with the `MINEGUARD_DB` env var. Tables: `rooms` (code, SHA-256 of attacker token, mode, state, revision), `objects` (soft-deleted via `deleted_at`), `audit` (monotonic revision, server time, mission sim time, private before/after JSON).
- Every successful mutation runs in one transaction: change the object, bump `rooms.revision`, append audit. Object `revision` = room revision at its last change, used for optimistic concurrency (`baseRevision`).
- Role isolation is server-side. Blue HTTP/socket responses are built only from `publicSnapshot()`, which has no object fields; Blue never holds hidden data to hide. Red markers render only from the attacker snapshot.
- Limit: 100 active objects per room (`MAX_ACTIVE_OBJECTS`), rejected with `OBJECT_LIMIT`.

## Mission engine (implemented, MG-007)
- `MissionEngine` (server) owns all flight state: one active mission per room, tables `mission_plans` (one current plan per room) and `missions` (every mission with plan snapshot, status, end reason, sim time, distance, speed, sequence, seed), in the same SQLite file as rooms.
- Browsers never advance the flight. They render the server's telemetry and ease the drone along the route by distance between updates, so turns are followed exactly. Camera mode (Overview / Follow / Top-Down) is local to each browser and never sent to the server.
- Every tick's travel is split at waypoints into chronological `FlownSubsegment`s and passed to `sweepHook`, so MG-008 can run swept-footprint sensing at any speed without cutting corners.
- Restart policy is fail-closed: RUNNING missions are restored as PAUSED at their last persisted position, with `pausedByRestart`.
- Live-mode Red edits during a mission are stamped with the mission's current sim time in the audit (`missionSimTime`).

## Virtual sensor (implemented, MG-008)
- `SensorEngine` subscribes to `MissionEngine.sweepHook`. For each tick it adds the flown sub-segments to the coverage grid, loads the room's active placements plus any placements retired mid-tick by Live edits, and runs the pure `sweep()` (chronological, clipped to each placement's active span). It then decides and stores each new encounter in a transaction and publishes the public candidate.
- `RoomStore.onObjectChange` tells the sensor about every Live create, move, update or delete together with its mission sim time (`missionClock`), so sub-tick timing is exact and nothing is retroactive.
- Tables: `sensor_decisions` (private, PK mission+object) and `candidates` (public fields + review). Coverage is rebuilt deterministically from the flown distance after a restart.
- The Blue 3D view draws the live footprint and swept region from the same `FOOTPRINT_RADIUS` constant the server uses. Swept region = a 2r ribbon per leg plus a disc at each passed waypoint; candidate pins are rose octahedra labelled C1, C2…

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
