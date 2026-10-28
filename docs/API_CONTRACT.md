# HTTP/Socket Contract

Rahil must revise this document to match actual implementation before a BUILD task is accepted.

## Implemented (MG-001)
Types live in `shared/protocol.ts`.

`GET /api/health` → `200` JSON:
```json
{ "status": "ok", "service": "mineguard-server", "version": "0.1.0", "uptimeSeconds": 12, "serverTime": "2026-10-28T17:07:20.141Z", "socketClients": 2 }
```
Any other `/api/*` path → `404 {"error":"Not found"}`.

Socket.IO (same origin, default path `/socket.io`):
- Server → client `server:hello` on connect: `{ socketId, serverTime, version }`.
- Client → server `system:ping(echo: string, ack)` → ack `{ pong: true, serverTime, echo }` (echo truncated to 64 chars). Connectivity check only.

## Implemented (MG-002)
`GET /api/world` → `200` JSON `WorldDefinition` (see `shared/world.ts`): `{ terrainId: "mg-field-01", version: 1, units: "virtual units", xMin: 0, xMax: 200, zMin: 0, zMax: 200, hills[], roads[], trees[], landmarks[], checksum }`. Identical for every client; public; never contains scenario/hazard data. Clients recompute `worldChecksum` and reject a mismatch.

## Implemented (MG-004) — rooms, attacker capability, scenario objects
Types: `shared/scenario.ts` (models, validation, error codes) and `shared/protocol.ts` (socket events). Server: `server/src/rooms/` (`store.ts` SQLite store, `routes.ts` HTTP, `realtime.ts` Socket.IO).

**Auth.** `POST /api/rooms` returns `attackerToken` once (32 random bytes, base64url). The server stores only its SHA-256 hash. Every `/attacker/*` route needs `Authorization: Bearer <attackerToken>`. The room code alone never authorises edits. The Red UI keeps the token in the URL fragment `/red#room=CODE&key=TOKEN`; browsers never send fragments to servers, so it stays out of request logs.

| Method + path | Auth | Success | Body / notes |
|---|---|---|---|
| `POST /api/rooms` | none (guest) | 201 `{ roomCode, attackerToken, defenderPath, attackerPath, snapshot }` | Code: 6 chars from `ABCDEFGHJKMNPQRSTUVWXYZ23456789`. Starts `CHALLENGE` / `DRAFT` / revision 0 |
| `GET /api/rooms/:code/public` | none | 200 `PublicRoomSnapshot` | `{ roomCode, terrainId, worldChecksum, mode, state, scenarioRevision }`. **Never objects.** Code is case-insensitive |
| `GET /api/rooms/:code/attacker/snapshot` | Bearer | 200 `AttackerRoomSnapshot` | public fields + `objects[]` (active only) + `history[]` (latest 50 audit events) + `maxActiveObjects` |
| `POST /api/rooms/:code/attacker/objects` | Bearer | 201 `{ result: ScenarioObject, snapshot }` | `{ kind, subtype, x, z }`. x/z may be numbers or numeric strings |
| `PATCH /api/rooms/:code/attacker/objects/:id` | Bearer | 200 `{ result, snapshot }` | `{ baseRevision, kind?, subtype?, x?, z? }`. `baseRevision` = the object's `revision` being edited (required). Coordinates only → `MOVE` audit; type change → `UPDATE` |
| `DELETE /api/rooms/:code/attacker/objects/:id?baseRevision=N` | Bearer | 200 `{ result: { id }, snapshot }` | Soft delete: removed from `objects`, kept privately with a `DELETE` audit. `baseRevision` optional |
| `POST /api/rooms/:code/attacker/mode` | Bearer | 200 `{ snapshot }` | `{ mode: "CHALLENGE" or "LIVE" }`, DRAFT only |
| `POST /api/rooms/:code/attacker/lock` | Bearer | 200 `{ snapshot }` | Challenge + DRAFT → `LOCKED` |

**Errors** (JSON `{ error, message }`; `REVISION_CONFLICT` also returns `current`):

| HTTP | `error` | When |
|---|---|---|
| 400 | `INVALID_COORDINATE` | missing, blank, non-numeric, NaN/Infinity, or outside 0..200 (checked **before** rounding, so 200.01 is rejected). Message: "X and Z must be finite numbers between 0 and 200 virtual units." |
| 400 | `INVALID_OBJECT_TYPE` | unknown kind/subtype or invalid pair (e.g. DECOY+BURIED) |
| 400 | `INVALID_REQUEST` | malformed JSON, missing `baseRevision`, bad mode, lock in LIVE mode, empty patch |
| 401 | `ATTACKER_AUTH_REQUIRED` | missing, wrong, or other room's token (HTTP and socket) |
| 404 | `ROOM_NOT_FOUND` / `OBJECT_NOT_FOUND` | unknown code; unknown, deleted or other-room object ID |
| 409 | `STATE_LOCKED` | edit not allowed in the current mode/state (see matrix), or mode change outside DRAFT |
| 409 | `REVISION_CONFLICT` | `baseRevision` is stale; returns the current server object |
| 409 | `OBJECT_LIMIT` | already 100 active objects in the room |

A failed command never changes objects, history or `scenarioRevision`.

**Edit matrix** (`canEditObjects`): DRAFT → editable in both modes. CHALLENGE: LOCKED/RUNNING/PAUSED/FINISHED → rejected. LIVE: RUNNING/PAUSED → editable with audit; FINISHED → rejected. RUNNING/PAUSED/FINISHED are entered only by the mission engine (MG-007, `RoomStore.setState`); there is no HTTP route for them yet.

**Socket.IO.**
- Client → server `room:join({ roomCode, attackerToken? }, ack)`. The ack is `{ ok: true, role: "attacker", snapshot: AttackerRoomSnapshot }`, `{ ok: true, role: "defender", snapshot: PublicRoomSnapshot }`, or `{ ok: false, error, message }`. A wrong token is refused, not downgraded.
- Client → server `room:leave`.
- Server → attacker sockets only: `room:attacker-snapshot` after every successful mutation.
- Server → defender sockets only: `room:public-snapshot` (metadata only) after every successful mutation.
- Red and Blue sockets join separate channels (`red:<roomId>`, `pub:<roomId>`), so no broadcast crosses roles or rooms. Clients re-join automatically on reconnect.

## Implemented (MG-007) — mission planning, server-driven flight, controls
Types: `shared/mission.ts` (plan/telemetry/snapshot/command types, validation, grid generator, route geometry) and `shared/sensor.ts` (sensor modes, footprint radii NARROW=6 / STANDARD=10 / WIDE=16 — the single source for MG-008). Server: `server/src/mission/engine.ts`, `server/src/mission/routes.ts`.

**Auth.** Mission routes need only the room code (Blue's guest credential). They never accept or return scenario objects, object IDs, or attacker data.

| Method + path | Success | Body / notes |
|---|---|---|
| `GET /api/rooms/:code/mission` | 200 `MissionSnapshot` | `{ roomCode, plan, mission, startBlockedReason }`. `mission` is the live or most recent mission (telemetry + its frozen plan) |
| `POST /api/rooms/:code/mission/plan` | 201 `{ plan, snapshot }` | MANUAL: `{ routeKind:"MANUAL", waypoints:[{x,z}...], sensorMode, footprintProfile }`. GRID: `{ routeKind:"GRID", grid:{ x1,z1,x2,z2, laneSpacing, orientation:"AUTO"\|"ALONG_X"\|"ALONG_Z" }, sensorMode, footprintProfile }`. The server returns canonical waypoints, `routeLength`, `planId`, `planRevision`, `grid` (min/max corners, lane count, actual spacing) and `potentialGaps` |
| `POST /api/rooms/:code/mission/command` | 200 `{ snapshot }` | `{ action:"START", planId, planRevision, playbackSpeed? }`, `{ action:"PAUSE"\|"RESUME"\|"STOP"\|"NEW_MISSION", missionId }`, `{ action:"SET_SPEED", missionId, playbackSpeed:1\|2\|4 }` |

**Validation.**
- Manual routes: 2–50 waypoints. Each point is validated like Red coordinates (finite, 0..200, checked before rounding, then rounded to 0.1). Adjacent identical points (zero-length legs) are rejected.
- Grid routes: corners are normalised to min/max and must give positive width and height. Lane spacing must be at least 2 and no more than the cross-lane size, with at most 60 lanes.
- Grid lanes run serpentine along the chosen axis. The first and last lanes lie exactly on the rectangle edges, and spacing is reduced (never increased) so lanes divide the rectangle evenly.
- `potentialGaps` is true when the actual spacing is more than 2r for the chosen footprint.

**Start rules.**
- CHALLENGE + DRAFT: rejected (Red must lock).
- CHALLENGE + LOCKED, or LIVE + DRAFT: allowed.
- Only one mission per room may be RUNNING or PAUSED.
- FINISHED needs `NEW_MISSION`, which returns the room to LOCKED (Challenge) or DRAFT (Live) and keeps the old mission record.
- The room state follows the mission (RUNNING / PAUSED / FINISHED). Each change bumps `scenarioRevision` once; per-tick telemetry does not.

**Errors** `{ error, message }`:

| HTTP | `error` | When |
|---|---|---|
| 400 | `INVALID_ROUTE` | invalid manual or grid route (message says why) |
| 400 | `INVALID_REQUEST` | bad sensor mode, profile, action or speed |
| 404 | `ROOM_NOT_FOUND` / `MISSION_NOT_FOUND` | unknown room; `missionId` is not the room's latest mission |
| 409 | `DUPLICATE_START` | a mission is already running or paused |
| 409 | `REVISION_CONFLICT` | START with a `planId`/`planRevision` that is not the current plan |
| 409 | `INVALID_MISSION_STATE` | illegal transition (pause when not running, plan while flying, start while blocked…) |

**Clock.**
- The server ticks every 100 ms.
- `simTime += realΔ × speed`; `distance += baseSpeed (8) × realΔ × speed`; `realΔ` is capped at 2 s per tick.
- Arrival lands exactly on the final waypoint at sim time `routeLength / 8`.
- Every tick is split at each crossed waypoint into ordered `FlownSubsegment`s `{ legIndex, from, to, distanceStart/End, simTimeStart/End }`, which are passed to `MissionEngine.sweepHook`. That hook is the MG-008 sensor interface.
- A mission that was RUNNING when the server stopped comes back **PAUSED** with `pausedByRestart: true`. No unobserved flight is simulated.

**Socket.IO** (defender sockets only, room-scoped):
- `mission:snapshot` is sent on join, on every plan or command, and on every Red room change (lock or mode affects `startBlockedReason`).
- `mission:telemetry` is sent about 10 times per second while RUNNING: `{ missionId, planId, status, endReason, simTimeSeconds, routeDistanceCompleted, routeLength, completedLegs, currentLegIndex, x, z, altitudeAboveGround, headingRadians, playbackSpeed, sequence, serverTime, pausedByRestart }`. Clients drop anything with a lower `sequence` for the same mission.
- Red sockets receive the room state change only (drone tracking for Red is MG-008).

## Implemented (MG-008) — virtual sensing, candidates, coverage, Live timing, Red tracking
Code: `shared/sensor.ts` (constants, `firstEntry`, `drawFromDigest`, `decide`, public types) and `server/src/mission/sensor.ts` (`SensorEngine`, pure `sweep`, `CoverageGrid`).

**Rules** (DETECTION_ACCEPTANCE sections 3–8):
- Radii are NARROW 6 / STANDARD 10 / WIDE 16, with tolerance `1e-6`.
- For each flown sub-segment, in order, the server solves the exact first entry `|A + sD − P| ≤ r` for every active placement not yet decided in this mission.
- **BASIC:** every hazard gives one candidate (`DETECTED`); decoys give `DECOY_IGNORED`.
- **ADVANCED:** one draw per object, `u` = first 53 bits of SHA-256(`seed|missionId|objectId|sim-v1`) divided by 2^53. Thresholds are SURFACE .90, OBSCURED .70, BURIED .50, and decoys .20 (`DETECTED` / `MISSED` / `FALSE_ALARM` / `DECOY_IGNORED`).
- One decision per (mission, object). The decision (plus the candidate, if any) is committed in one transaction before broadcast, and survives restart without a re-roll.
- **Live edits** carry the mission sim time. A created or moved placement only exists from that time, and a moved or deleted one stops at that time, both within the tick. There are no retroactive candidates. An edit while PAUSED is evaluated on the first RUNNING advance.

**Public data only.**
- `PublicCandidate` is `{ candidateId, missionId, number, x, z, simTimeSeconds, source:"SIMULATED", sensorMode, footprintProfile, review }`. It never includes the object ID, kind, subtype or outcome.
- Private decisions live in the `sensor_decisions` table, read by `SensorEngine.decisions()`, for MG-010.

| Method + path / event | Notes |
|---|---|
| `GET /api/rooms/:code/mission/observations` | `{ missionId, candidates[] }` for the latest mission |
| `PATCH /api/rooms/:code/mission/observations/:candidateId/review` | `{ review: "NEW" \| "REVIEWED" }`. Review flag only; never changes decisions. Errors: 400 `INVALID_REQUEST`, 404 `CANDIDATE_NOT_FOUND` |
| `MissionSnapshot.candidates` | All candidates of the latest mission (on join, refresh, every change) |
| `MissionTelemetry.coverage` | `{ sweptArea, gridCoveragePercent, resolution: 1 }`: estimated union of the swept footprint along the flown path, on a fixed 1-unit cell grid (cell centres), clipped to the world. The percentage is for grid routes only; manual routes give `null` (N/A) |
| socket `observation:created` | New `PublicCandidate`, to the room's Blue **and** Red sockets |
| Red tracking | `mission:snapshot`, `mission:telemetry` and `observation:created` also go to the room's Red channel (public-safe data). The Red UI toggle "Show defence drone…" draws them |

## Implemented and verified (MG-010 — post-finish comparison and print export)

Routes below are implemented in MG-010 and checked by GitHub CI (see tasks/evidence/MG-010.md). All routes sit under the existing room-scoped mission router:

| Request | Expected result |
|---|---|
| GET /api/rooms/:code/mission/:missionId/reveal-state | Returns only {missionId,revealed,reportId}; cross-room/unknown mission 404 |
| POST /api/rooms/:code/mission/:missionId/reveal | Only FINISHED; explicitly computes/stores frozen historical truth and score; idempotent after reveal |
| GET /api/rooms/:code/mission/:missionId/results | 409 REPORT_NOT_READY until reveal, then immutable result JSON scoped to exact mission/room |
| GET /api/rooms/:code/mission/:missionId/report | Post-reveal standalone printable HTML report, honest Print / Save as PDF (not a direct PDF binary) |
| PATCH /api/rooms/:code/mission/observations/:candidateId/review | Prior behavior unchanged until reveal; afterwards review updates are blocked to preserve frozen report |

Security: no GET, reload, STOP or mission FINISHED alone reveals private objects. The explicit POST reveal is allowed to guests with the correct room code **after FINISHED** (documented classroom policy). Raw attacker bearer tokens are never exported. Results use the mission-start private baseline plus the complete mission-scoped audit and private sensor decisions; previously completed missions without reliable baseline snapshots fail closed rather than fabricating scores.

Frozen summary: TP/FP/FN/UNSCANNED; precision and recall are null/N/A when denominators are zero. Estimated area is actual swept virtual area on the 1-unit grid, not proof of safe or cleared land. Correctly retain Live move/delete history, don't compare only current objects.

Everything below this line is a proposed target, not yet implemented.

## Suggested HTTP
POST /api/rooms -> create room, public join code/URL, private attacker link ONCE.
GET /api/rooms/:code/public -> role-safe terrain/mission metadata only, NO hidden hazards.
POST /api/rooms/:code/attacker/objects -> authenticated placement.
PATCH /api/rooms/:code/attacker/objects/:id -> update object.
DELETE /api/rooms/:code/attacker/objects/:id -> remove.
POST /api/rooms/:code/attacker/lock -> Challenge lock.
POST /api/rooms/:code/mission/plan -> manual/grid route & sensor config.
POST /api/rooms/:code/mission/command -> start/pause/resume/stop/reset/speed.
GET /api/rooms/:code/observations -> observed candidates only.
GET /api/rooms/:code/results -> after final reveal.
GET /api/rooms/:code/report -> downloadable printable mission summary.
GET /api/health -> server and version status.

## Suggested realtime events
From clients: room:join, object:create/update/delete, scenario:lock, mission:plan, mission:command, attacker:tracking.
Server: room:public-snapshot, room:attacker-snapshot (attacker only), mission:state, observation:created, scenario:revision (sanitized to Blue), mission:finished, error.

## Required validations
- Defender with only room code cannot mutate hidden objects.
- Defender HTTP/Socket/network payload has ZERO undiscovered object coordinates.
- Locked Challenge edit attempt fails with explicit blocked reason.
- X/Z bounds and numeric values checked on backend.
- Cross-room events and stale revision commands cannot leak/mutate data.
- Speed 4x does not skip swept proximity.
- Duplicate candidate events are not sent.
- Private attacker token never appears in GitHub, report, shared link, Blue browser or logs.
