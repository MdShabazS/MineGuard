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
