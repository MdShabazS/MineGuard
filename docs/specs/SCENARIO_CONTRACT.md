# MG-003 — Scenario and Red Team Portal Contract

**Task:** MG-003 — Scenario object and Red Portal acceptance contract  
**Author/owner:** Mohammed Shabaz S (Shabaz)  
**Prerequisite:** MG-002 (Rahil), committed DONE  
**Next consumer:** MG-004, owned and tested exclusively by A Mohammed Rahil  
**Nature:** Design/acceptance specification only — **not implemented or tested by Shabaz**  
**Deadline:** MineGuard V0.1 24-hour virtual prototype.

## 1. Purpose and scope

MG-004 must add shared rooms, private attacker control and a typed fictional object-placement system to the **one existing 3D world**. The attacker creates a room, selects virtual hazards and harmless decoys, and places/edits/deletes them by clicking the terrain or entering exact virtual coordinates. The defender joins the same world via room code or public link, but receives **no undiscovered hazard locations or types**. The server—not CSS, hidden meshes or browser variables—stores and authorizes ground truth.

This is an educational digital twin for *synthetic aerial survey software*. All targets and sensing are fictional. The system must not claim to locate real landmines, see buried objects using RGB, clear minefields, or provide real field coordinates. MG-004 delivers rooms/placement/security. Virtual drone flight is MG-007; sensing and detected map pins are MG-008; scoring/export is MG-010.

Reference files:
- [18 user-approved decisions](../DECISIONS.md)
- [Product specification](../PROJECT_SPEC.md)
- [Architecture and data-flow](../ARCHITECTURE.md)
- [API contract](../API_CONTRACT.md)
- [User experience and scenarios](../UX_AND_SCENARIOS.md)
- [MG-002 verified implementation evidence](../../tasks/evidence/MG-002.md)
- [Actual shared world source](../../shared/world.ts)
- [Existing canvas picker](../../client/src/world/WorldView.tsx)

The following behavior is a **binding acceptance target** for MG-004, not a claim that it exists yet.

## 2. MG-002 world facts — no guessing

Read and reuse \`shared/world.ts\` and its helpers. The implementation already provides:

| Item | Actual implementation |
|---|---|
| Terrain | \`mg-field-01\`; version 1; identical on Red and Blue |
| Virtual world | X = **0.0 through 200.0**, Z = **0.0 through 200.0**, inclusive |
| Units | Arbitrary **virtual units** — not metres or GPS |
| Precision | 0.1 unit via \`roundCoord\` |
| Scene coordinates | \`worldToScene(world,x,z)\` yields \`[x-100, terrainHeight(world,x,z), z-100]\` |
| Inverse mapping | \`sceneToWorld(world,sceneX,sceneZ)\` |
| Bounds | \`isInBounds(world,x,z)\` rejects out-of-range/nonfinite values |
| Public terrain | \`GET /api/world\` returns same data and checksum for both roles, no scenario data |
| Existing world | Four hills, two roads, 140 seeded trees, base camp, radio mast, pond |
| Existing pick | \`WorldView\` converts terrain clicked X/Z to one decimal, displays picked point |
| Orbit drag protection | Pointer travel over **4 px** is ignored as a click |

### Coordinate rules

- Persist **world X/Z** only; derive height from \`terrainHeight\` when displaying a marker. Never use raw Three.js scene X/Z as persisted world coordinates.
- Server must parse a numeric request, reject empty/nonfinite/out-of-bounds values **before rounding**, round valid coordinates to 0.1, then revalidate. Thus 200.01 is rejected rather than clamped to 200.0.
- Boundaries \`(0,0)\` and \`(200,200)\` are legal. \`(30.44,40.05)\` is legal and becomes a one-decimal coordinate. Use server-confirmed normalized positions in the UI.
- Do not silently clamp, wrap, or change world bounds. User-facing error: **“X and Z must be finite numbers between 0 and 200 virtual units.”**
- Road, hill, tree and landmark overlap is not a new hard-blocking rule. Visual overlap may receive a warning, but all in-bounds sample points must remain placeable. Render marker at terrain height with a slight visible lift.
- Extract a reusable \`onPick([x,z])\` callback or equivalent from MG-002's \`WorldView\`, and preserve hover, orbit/zoom and drag-vs-click behavior. Click in placement mode places; orbit drag never places. A click on an existing marker selects instead of placing.

## 3. Object categories and expected Red palette

All categories are **fictional**. Use one server-authoritative data model with stable opaque IDs.

| UI label | \`kind\` | \`subtype\` | Red-only visual |
|---|---|---|---|
| Surface-visible virtual hazard | \`HAZARD\` | \`SURFACE\` | Red/orange marker |
| Partially obscured virtual hazard | \`HAZARD\` | \`OBSCURED\` | Amber outline |
| Buried virtual hazard | \`HAZARD\` | \`BURIED\` | Distinct outlined marker, *synthetic only* |
| Rock decoy | \`DECOY\` | \`ROCK\` | Neutral marker |
| Scrap decoy | \`DECOY\` | \`SCRAP\` | Neutral marker |
| Container decoy | \`DECOY\` | \`CONTAINER\` | Neutral marker |

All three hazard types and at least one decoy type are **P0**; include three decoy variants where possible without delaying end-to-end functionality.

Suggested compatible interfaces (Rahil may adjust names and document actual API):

\`\`\`ts
type ScenarioMode = 'CHALLENGE' | 'LIVE';
type ScenarioState = 'DRAFT' | 'LOCKED' | 'RUNNING' | 'PAUSED' | 'FINISHED';
type HazardSubtype = 'SURFACE' | 'OBSCURED' | 'BURIED';
type DecoySubtype = 'ROCK' | 'SCRAP' | 'CONTAINER';

interface ScenarioObject {
  id: string;                  // server-generated stable ID; do not reuse
  roomId: string;
  kind: 'HAZARD' | 'DECOY';
  subtype: HazardSubtype | DecoySubtype;
  x: number;                   // 0..200, normalized to 0.1
  z: number;                   // 0..200, normalized to 0.1
  revision: number;            // server-owned
  createdAt: string;           // server ISO timestamp
  updatedAt: string;
  deletedAt?: string | null;   // retained privately for audit
}

interface PublicRoomSnapshot {
  roomCode: string;
  terrainId: 'mg-field-01';
  worldChecksum: string;
  mode: ScenarioMode;
  state: ScenarioState;
  scenarioRevision: number;    // metadata only; never placements
}
interface AttackerRoomSnapshot extends PublicRoomSnapshot {
  objects: ScenarioObject[];    // authenticated attacker ONLY
  history: ScenarioAuditEvent[];
}
interface ScenarioAuditEvent {
  id: string;
  roomId: string;
  objectId: string | null;
  action: 'CREATE' | 'MOVE' | 'UPDATE' | 'DELETE' | 'LOCK' | 'MODE_CHANGE';
  revision: number;            // monotonic within room
  serverTime: string;
  missionSimTime?: number | null;
  before?: Record<string, unknown> | null;  // private
  after?: Record<string, unknown> | null;   // private
}
\`\`\`

### Data integrity requirements

- Generate IDs and timestamps on server; do not trust a caller-supplied object ID, role, revision, or creation time.
- Validate \`kind\`/\`subtype\` pairs; e.g. \`DECOY+BURIED\` is invalid.
- Each successful mutation increments a room \`scenarioRevision\`, updates authorized clients, and appends an audit record.
- Invalid operations must not alter object state or revision.
- Duplicate placements at the same coordinate are distinct objects with distinct IDs. They may overlap visually; show each in the list and avoid silently combining them. Sensor deduplication is a later task.
- Removed objects should not be part of the active placement list, but deletion history remains available to server/authorized Red.
- Choose sensible finite limits (e.g. 100 active objects per room) for demo performance, document them in code and handle errors; do not silently discard an over-limit placement.
- Do not store scenario secrets or live room records in GitHub. The Git repository stores the schema, source, tests and **sanitized synthetic fixtures**; the running app database stores private room transactions.

## 4. Room model, links and role security

The user explicitly selected **guest access**, both room codes and shareable links, same-device and two-device operation.

**Create room**
1. Red opens \`/red\`, selects **Create Room**.
2. Server creates an unguessable internal room ID, human-shareable join code and a cryptographically random **attacker control capability**.
3. Red sees **three distinct items:** room code, public defender join link, private attacker control link. Each has a clear label/copy action. Default to \`CHALLENGE\` before mission, but permit choosing \`LIVE\` while in DRAFT.
4. Attacker private link must not appear on the defender screen or inside public Socket payloads, exported reports, example JSON or ordinary server logs. A URL fragment to hand off a client-side token can avoid query logging, but the backend must still verify authorization on any Red operation.

**Join room**
1. Defender enters room code or follows public join link; sees the exact same public terrain (\`mg-field-01\` / checksum).
2. Defender receives only role-safe room state and later *authorized observations* (from MG-008). Before detection/reveal there is **no hidden object list, hidden x/z, subtype, private object ID or private audit history** in Blue HTTP, Socket, embedded HTML, browser storage, or React props.
3. Defender join code **never** authorizes Red mutations. The backend checks attacker capability on every relevant REST action and Socket session/command.
4. Two Red sessions with the legitimate private capability see updated authorized object list and revisions. A Blue refresh/rejoin still does not receive hidden truth.
5. Room A's events/objects must never leak into room B.
6. Persist authoritative room/scenario state server-side (SQLite planned) for refresh/rejoin, not only in React memory. Github isn't a live transactional DB.
7. A trusted LAN without TLS is only a classroom fallback; do not claim it is secure across untrusted networks. Online demo should use HTTPS.

**Security requirement:** Hiding meshes in Blue UI is *not* permission isolation. The server must never transmit ground truth to unauthorized clients. \`GET /api/world\` remains public terrain only.

## 5. Required Attacker Portal user journey

The current \`WorldView\` click readout is already implemented in MG-002, but there is no placed-object persistence yet.

### A. Place an object by clicking the map
- User selects category (e.g. SURFACE) and chooses **Place** mode.
- Hover displays real virtual X/Z; terrain click emits those values, rounded to 0.1.
- Frontend requests server creation and awaits acknowledgment. Pending ghost preview is okay, but do **not** show “saved” before server confirms. On rejection, roll back optimistic marker and display error.
- A single click produces **one** server object. Camera drag >4 px produces **zero** objects. Click on an existing marker selects, not duplicates.
- Red displays a distinct 3D marker at derived terrain height and a matching list row; Blue displays none.

### B. Create/place with exact coordinates
- Provide X and Z inputs, category picker and a clear **Add Object** action.
- Valid examples: \`0\`, \`200\`, \`30.4\`, \`40.05\`; round legal values to 0.1 on the server.
- Invalid examples: \`-0.1\`, \`200.01\`, \`NaN\`, \`Infinity\`, blank and nonnumeric. Show explicit validation error; do not create anything.
- Return the server's normalized values to the list/editor and marker.

### C. Select, edit, move, delete
- Selecting a 3D marker or list row opens one selected object editor with stable ID, category and X/Z.
- Changing X/Z then saving updates the existing object; it does **not** create another.
- Allow supported type edit (validated kind/subtype). All changes propagate to other authorized Red clients.
- Deletion requires a confirmation or clear undo safeguard, removes active marker/list item and logs revision; a deleted ID cannot be edited as active.
- Display error/connection state if server/Socket fails; failed edits are not displayed as persisted.
- Object list shows type, normalized X/Z, stable ID and latest update/revision.

### D. Scenario controls
- Mode switch \`CHALLENGE\`/\`LIVE\` while DRAFT.
- Challenge **Lock Scenario** button and clear visible \`LOCKED\` state.
- Share room code/public defence URL separately from private attacker URL, with copy feedback.
- Optional Red view of defence drone position is an MG-007/008 integration point, not a claim of MG-004 completion.

## 6. Scenario state machine and audit semantics

| Current state | Challenge Mode | Live Mode |
|---|---|---|
| DRAFT | All valid Red object edits allowed; mode can change | All valid Red object edits allowed; mode can change |
| LOCKED | Server rejects every create/edit/delete/move | Not required as a mode stage |
| RUNNING | Editing remains forbidden | Editing allowed with ordered private audit events |
| PAUSED | Editing remains forbidden | Editing allowed with ordered private audit events |
| FINISHED | Editing forbidden until explicit reset/new scenario | Editing forbidden until explicit reset/new scenario |

- Challenge locking freezes the scenario snapshot before defence survey. Reject every attacker mutation after lock **on server**, even if UI is bypassed. Return an explicit blocked code such as \`STATE_LOCKED\`.
- Changing mode after lock or during mission must **not** bypass Challenge.
- Live changes are legitimate only while room is in an allowed state. Timestamp and revision each create/move/delete. Audit includes event time and mission-simulation time if mission is running.
- **No retroactive findings.** If a Live hazard is placed after a drone has passed, do not backdate detection or silently count it as scanned. Full detection/event-time scoring belongs to MG-008/MG-010.
- Blue may receive sanitized \`scenarioRevision\` and public state, but **not private coordinate/type/count changes**, until an authorized end-of-mission reveal.
- End/reveal permissions must be controlled by backend and audited; do not accidentally reveal truth on page refresh or “stop” without a proper finish/reveal state.

## 7. Proposed API / real-time interactions

The following are expected semantics; route and event names may change during MG-004. The actual implementation must update [API_CONTRACT](../API_CONTRACT.md).

| Operation | Suggested route/event | Authorization |
|---|---|---|
| Create | \`POST /api/rooms\` | guest becomes Red owner; private capability generated |
| Public state | \`GET /api/rooms/:code/public\` | guest/Blue; **no objects** |
| Red snapshot | authenticated attacker snapshot endpoint or \`room:attacker-snapshot\` | valid private capability |
| Place | \`POST /api/rooms/:code/attacker/objects\` | Red only |
| Edit/move | \`PATCH /api/rooms/:code/attacker/objects/:id\` | Red only |
| Delete | \`DELETE /api/rooms/:code/attacker/objects/:id\` | Red only |
| Mode/lock | attacker-only mode and lock endpoint/event | Red only |
| Subscribe | authenticated Socket join and room-scoped broadcasts | role-filtered public/private |

Minimum useful error responses (choose consistent HTTP codes, documented exactly):

- \`INVALID_COORDINATE\` (bad input/NaN/out-of-bounds)
- \`INVALID_OBJECT_TYPE\` (unsupported or kind/subtype mismatch)
- \`ROOM_NOT_FOUND\`
- \`OBJECT_NOT_FOUND\` (including removed ID in authorized room)
- \`ATTACKER_AUTH_REQUIRED\`
- \`STATE_LOCKED\` (Challenge lock/FINISHED mutation)
- \`REVISION_CONFLICT\` (stale optimistic update) or explicit safe conflict semantics

Any failed command leaves \`scenarioRevision\` and persisted object list unchanged. Do not echo secrets in errors.

## 8. Safe fictional sample scenarios (future test fixtures)

These coordinates are only **synthetic data** in the actual MG-002 200×200 virtual world. No real minefield or GPS reference.

### ALPHA — fixed Basic demonstration

| Fixture label | Kind | Subtype | Virtual X | Virtual Z | Rationale |
|---|---|---|---:|---:|---|
| H-01 | HAZARD | SURFACE | 30.0 | 40.0 | surface marker |
| H-02 | HAZARD | OBSCURED | 75.0 | 80.0 | obscured marker |
| H-03 | HAZARD | BURIED | 120.0 | 105.0 | fictional buried marker |
| H-04 | HAZARD | SURFACE | 170.0 | 160.0 | deliberately outside survey route |
| D-01 | DECOY | ROCK | 60.0 | 130.0 | harmless decoy |

The sample IDs are readable fixture labels **not server UUIDs**. Use an actual planned route that scans some points and excludes H-04; the expected result depends on the real simulated route and sensor footprint. Never hardcode discoveries or percentages.

### BRAVO — Advanced Mode (later MG-008)

Mixed hazard/decoy categories; fixed random seed for synthetic misses and false alarms. Only report observed events that the engine actually emits, not a scripted “AI accuracy”.

### CHARLIE — Live Mode (later MG-008)

One starting hazard, then add/move another during flight; preserve event time, object active intervals and nonretroactive exposure. The scenario change is private to Red except safe metadata until legal reveal.

Safe synthetic fixtures may be committed under \`tests/fixtures\`; active room tokens and actual private data must never be checked in.

## 9. Acceptance checklist for Rahil's MG-004 software testing

**Shabaz does not run these tests.** Rahil implements MG-004, executes appropriate actual commands/browser tests, records PASS/FAIL and publishes \`tasks/evidence/MG-004.md\` before setting that task DONE.

| ID | Test / review target | Required observed behavior |
|---|---|---|
| R01 | Create Red room | Unique code, public defender link and separate private attacker control |
| R02 | Join via room code and URL | Same terrain/world checksum, authorized room state |
| R03 | Red place SURFACE via terrain click | Exactly one server-persisted Red marker with normalized X/Z |
| R04 | Red orbit drag >4 pixels | No object created |
| R05 | Place OBSCURED, BURIED and DECOY | Supported categories visible to Red, not Blue |
| R06 | Coordinate create at (0,0), (200,200) and valid decimals | Server accepts and normalizes values to 0.1 |
| R07 | Send -0.1, 200.01, NaN, Infinity, empty, text | Server rejects; no persisted change |
| R08 | Select and move existing object | Stable ID, marker/list update, revision/audit change |
| R09 | Edit valid category, reject invalid pair | Valid persists, invalid has no side effects |
| R10 | Delete | Active object gone; audit preserved |
| R11 | Inspect Blue HTTP/Socket/devtools payloads | **No undiscovered objects, x/z or subtype leakage** |
| R12 | Try attacker edits using room code alone | Server denies; zero changes |
| R13 | Two authorized Red sessions | See identical authorized list and updates |
| R14 | Two distinct rooms | No cross-room event or object leakage |
| R15 | Lock Challenge and call mutation endpoints | All rejected server-side |
| R16 | Live edit in future RUNNING/PAUSED state | Authorized event, revision and private audit; **full runtime check can be MG-008** |
| R17 | Refresh/rejoin Red and Blue | Correct role-filtered state restored from server persistence |
| R18 | Stale edit/revision | Conflict handled deterministically; no silent lost update |
| R19 | Logs, export, source and Blue traffic audit | No attacker capability exposed |
| R20 | Build/typecheck/test/browser E2E | Actual commands, results, failures and evidence recorded by Rahil |

**MG-004 core acceptance:** R01–R15, R17 and R20; the runtime portion of R16 belongs to MG-008, but event/audit groundwork belongs to MG-004. R18–R19 should be recorded, with any limitation explicitly documented and resolved as part of security/reliability work.

## 10. Immediate handoff to Rahil

When GitHub marks MG-003 DONE, Rahil shall:

1. Re-fetch \`main\`; read this document, MG-002 implementation, \`TASK_BOARD.md\` and \`docs/WORKFLOW.md\`.
2. Verify \`MG-003 = DONE\` and \`MG-004 = TODO\` in committed \`tasks/status.json\`; check task gate.
3. Start MG-004 as Rahil; commit/push \`IN_PROGRESS\`.
4. Implement secure rooms, public/private role snapshots, Red type palette, clickable and precise-coordinate object CRUD, Challenge locking and Live audit groundwork while preserving MG-002's world/drag behavior.
5. Update API/source/run docs, execute actual QA, commit evidence and advance status only if tested.
6. **Stop at MG-005** after finishing MG-004, since MG-005 belongs to Shabaz.

This contract is completed by committing **this exact file** at \`docs/specs/SCENARIO_CONTRACT.md\` and updating \`tasks/status.json\` to \`MG-003: DONE\` with this evidence path. It does **not** certify any software behavior as implemented or tested.
