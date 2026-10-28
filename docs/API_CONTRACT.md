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
