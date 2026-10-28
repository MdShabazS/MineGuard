# MG-005 — Defender Mission Planning, Drone Controls and Camera Acceptance Contract

**Task:** MG-005 — Defender mission-planner and camera acceptance contract  
**Owner:** Mohammed Shabaz S (Shabaz) — documentation/specification only  
**Prerequisite:** MG-004 (A Mohammed Rahil) committed DONE; test evidence at [MG-004](../../tasks/evidence/MG-004.md)  
**Following task:** MG-006 (Shabaz) — virtual sensing/detection acceptance contract  
**Implementation consumer:** MG-007 (Rahil) — routes, 3D drone, server flight, cameras and controls; MG-008 integrates sensing  
**Status of this document:** Contract and acceptance criteria, **not** a runtime implementation or test certificate  
**V0.1 constraint:** Complete the working P0 Red/Blue mission journey first; avoid unnecessary rearchitecture.

## 1. Scope and product outcome

A Defender (Blue) guest who has joined a room through the existing `/blue` or `/blue/:code` interface must be able to plan and preview a simulated aerial survey of the **same** fictional 3D world already shown to the Attacker (Red). The mission-planner must offer **both** (1) manual X/Z waypoints and (2) automatic rectangular **zigzag / lawnmower grid** coverage. Blue selects a simulated sensor mode/profile, previews the route, starts, pauses, resumes and stops a server-driven virtual drone, switches 1x / 2x / 4x playback, and views three distinct camera modes: **Overview**, **Follow Drone** and **Top-Down**.

The mission is a virtual software simulation only. The drone is not linked to a real flight controller. Coordinates are **fictional virtual units, not GPS**. A completed virtual survey **does not prove a field is safe, clear or mine-free**. No undiscovered hazards may be delivered to Blue as part of route planning, telemetry or camera updates.

**Implementation boundary:**
- **MG-001–MG-004 already built:** front/backend scaffold, Socket.IO, public 3D world, Red objects and room persistence, capability-scoped attacker editing, public Blue room join, scenario mode and Challenge lock.
- **MG-007 will build:** Blue mission planner, manual and grid route generation, route preview, simulated drone position and flight state, three cameras, telemetry, 1x/2x/4x, pause/resume/stop, server-authoritative state, mission events/persistence.
- **MG-008 will build:** virtual scan footprint, Basic/Advanced detection, actual candidate markers, covered-region visualization, Live Mode scan behavior and optional Red tracking.
- **MG-010 will build:** post-finish comparison, detailed scoring and report export.
- **MG-011 will validate:** actual physical two-device online/LAN access and mobile interaction. MG-007 should remain compatible but must not claim that final validation has already happened.

Read together with [approved 18 decisions](../DECISIONS.md), [product requirements](../PROJECT_SPEC.md), [architecture](../ARCHITECTURE.md), [UX and fictional scenarios](../UX_AND_SCENARIOS.md), [virtual detection principles](../DETECTION_AND_EVALUATION.md), [existing API](../API_CONTRACT.md), [Red contract](SCENARIO_CONTRACT.md), [task workflow](../WORKFLOW.md), and [MG-004 evidence](../../tasks/evidence/MG-004.md).

## 2. Ground the design in actual MG-004 code

Do **not** rebuild the existing Red/Blue room stack or change established privacy rules.

| Current implementation | Implications for MG-007 |
|---|---|
| `client/src/pages/DefencePortal.tsx` | Blue currently joins by code or `/blue/CODE` and shows room code, mode, state, revision, public world; **no planner exists** yet |
| `client/src/pages/AttackerPortal.tsx` | Red places/edits simulated objects privately; retain all behavior |
| `client/src/world/WorldView.tsx` | Reusable `onPick`, `renderScene`, `overlay`, `crosshair`; terrain hover/pick and drag/orbit protected at 4 px |
| `shared/world.ts` | World `mg-field-01`, bounds X/Z **0–200 inclusive**, 0.1-unit presentation, `isInBounds`, `roundCoord`, `worldToScene`, `sceneToWorld`, `terrainHeight`, checksum |
| `shared/scenario.ts` | `ScenarioMode = CHALLENGE|LIVE`; `ScenarioState = DRAFT|LOCKED|RUNNING|PAUSED|FINISHED`; public room fields have **no hidden object list** |
| `server/src/rooms/store.ts` | SQLite room/object/audit persistence; `setState` hook for mission integration; server stores authoritative hidden Red truth |
| `server/src/rooms/routes.ts` | Room API; attacker mutations require Bearer capability; public room endpoint exposes metadata only |
| `server/src/rooms/realtime.ts` | `room:join` separates `pub:<roomId>` and `red:<roomId>` audiences; role-safe snapshots and room isolation |
| `client/src/lib/useRoomSocket.ts` | Public Blue room reconnect, revision-filtered snapshots; ensure mission updates have their **own** version/time semantics |
| `tasks/evidence/MG-004.md` | Rahil documented 32/32 backend tests and 3/3 browser tests at MG-004, with no mission engine yet; those results must be preserved, not assumed to cover MG-007 |

**Coordinate mapping:** a world point `(x,z)` becomes a scene location `[x - 100, terrainHeight(world,x,z), z - 100]`. The drone flies at a **positive virtual altitude above the terrain**, derived from this common world frame (e.g. `terrainHeight(world,x,z) + altitudeAboveGround`), with the exact simulation altitude clearly configured/labelled. Do not persist or transmit negative/centered scene-space coordinates as if they were world coordinates.

**Room compatibility:** Challenge and Live have different object-edit permissions. A flight is not permitted to silently undo an existing Challenge lock. Mission progress must coexist with `scenarioRevision` and the existing Red optimistic-concurrency model; use a separate `missionRevision`/monotonic sequence for flight progress if needed. Do not bump the *scenario object edit revision* for every render frame.

## 3. Defender mission-control layout and discoverable actions

Extend the existing `DefencePortal` rather than replacing its working room join.

On a joined room, a compact projector-readable dashboard must include:
1. **Room and connection strip:** room code, CHALLENGE/LIVE, state, connected/reconnecting, terrain identity; no hidden target count.
2. **Mission Planner:** Manual / Grid tabs, clear coordinate inputs, "Add Waypoint" or "Generate Grid", edit/remove/reorder controls, route summary and preview/reset buttons.
3. **Mission Configuration:** Basic or Advanced virtual sensor mode; Narrow / Standard / Wide sensor footprint; one explicit virtual altitude and a documented simulated speed baseline. The sensing semantics and actual virtual footprint radii belong to MG-006/MG-008, not invented here.
4. **Flight controls:** Start, Pause, Resume, Stop and playback 1x / 2x / 4x. Show only currently valid actions; backend independently enforces the state machine.
5. **3D World:** visible route polyline, distinct waypoint numbering, start/end, moving drone model, scan/coverage overlay placeholders until MG-008, and camera selectors Overview / Follow / Top-Down.
6. **Telemetry/status:** X, Z, virtual altitude, heading/direction, active leg/waypoint, route progress percentage, elapsed **simulation** time, speed multiplier, mission status, route length and observed connection health.
7. **Findings area:** clearly marked "Awaiting virtual sensing — MG-008" until candidates exist. Never synthesize fake mine pins, scan history, or score simply to fill the page.
8. **Error/loading and recovery:** readable reason for invalid routes, locked/missing room, server rejection, disconnect or unsupported WebGL; show authoritative state after reconnect.

The existing blue room card/public metadata remains intact; do not expose attacker-only history, objects, subtype, or capability. On an unjoined page, disable all actual mission commands and show Join Room; showing the terrain without a room is okay.

**Interaction modes:** In Manual edit mode, terrain clicking selects/adds a waypoint, not a hazard. In Grid rectangle selection mode, two deliberate corners or an explicit rectangle-edit UI specify bounds. A drag to orbit must **not** create a waypoint/rectangle. Provide a visible "Exit planning mode" to restore normal orbit behavior. Support precise coordinate entry as an alternative for touch or unreliable picking.

## 4. Route planning model and validation (server authoritative)

### Suggested shared types (names may change; behavior may not)

```ts
type RouteKind = 'MANUAL' | 'GRID';
type SensorMode = 'BASIC' | 'ADVANCED';
type FootprintProfile = 'NARROW' | 'STANDARD' | 'WIDE';
type CameraMode = 'OVERVIEW' | 'FOLLOW' | 'TOP_DOWN';
type PlaybackSpeed = 1 | 2 | 4;

interface MissionPoint { x: number; z: number }
interface GridRegion {
  xMin: number; xMax: number; zMin: number; zMax: number;
  /** Lane spacing in virtual units, independent of measured real metres. */
  laneSpacing: number;
  /** Direction of long traversals; default can be chosen automatically. */
  orientation: 'ALONG_X' | 'ALONG_Z';
}
interface MissionPlan {
  id: string; roomCode: string; routeKind: RouteKind;
  waypoints: MissionPoint[]; // ordered, server-validated and normalized
  grid?: GridRegion;
  sensorMode: SensorMode;
  footprintProfile: FootprintProfile;
  altitudeAboveGround: number;  // virtual units
  baseSpeed: number;            // virtual units per simulation second
  routeLength: number;          // derived by server, never trusted from browser
  createdAt: string;
  planRevision: number;
}
interface MissionTelemetry {
  missionId: string; roomCode: string; status: 'READY'|'RUNNING'|'PAUSED'|'FINISHED';
  simTimeSeconds: number;
  routeDistanceCompleted: number;
  routeLength: number;
  completedLegs: number;
  currentLegIndex: number;
  x: number; z: number; altitudeAboveGround: number;
  headingRadians: number;
  playbackSpeed: PlaybackSpeed;
  sequence: number;
  serverTime: string;
}
```

**Implementation notes:**
- Do not mix UI camera preference into server simulation; camera choice is client visual state and must never change drone trajectory.
- Preserve stored/normalized world coordinates at **0.1-unit precision**, but use sufficient internal floating-point precision for interpolation between waypoints; avoid artificial position jumps caused by repeatedly rounding physics state.
- Mission ID, route order, status and simulation time are server-owned. Keep any selected profile/mode/route immutable once a mission starts, unless an explicitly documented new-mission reset is performed.
- The route and telemetry may be public to joined Blue (and optionally to a Red observer, subject to decision 14). They must not include hidden object IDs/coordinates or private attacker audit data.

### 4.1 Manual waypoint mode

- **Both** terrain clicking and exact input of X and Z are required.
- Provide Add, select, move/edit, remove, reorder (up/down is sufficient), Clear and Preview; every edit recomputes route preview and length before start.
- A minimum of **two distinct in-bounds waypoints** with positive total path length is required.
- A waypoint must have finite X,Z between 0 and 200 inclusive; reject invalid values **before** normalization, not clamp them. Accept exact edges, 0.1 precision and numbers such as `120.04` that normalize to 120.0.
- Adjacent identical normalized points/zero-length legs should be rejected with a precise error (or automatically removed with clear notice *before* committing plan). A route where all points coincide is invalid.
- Do **not** infer waypoints from Red's objects or hidden ground truth. Blue's manual route is entirely user supplied.
- Direct straight-line travel between waypoints is acceptable for V0.1; 3D hill/road/trees are visual scenery, not unannounced no-fly constraints.
- Reasonable maximum waypoint/route-size limits must be documented and enforced server-side for responsiveness; reject oversized payloads with understandable feedback, not a crashed tab.
- Label each waypoint numerically (1,2,3...), show start/end clearly, and display calculated route length in **virtual units**.

### 4.2 Automatic zigzag/grid mode (lawnmower survey)

- Blue chooses rectangle corners `(xMin,zMin)` and `(xMax,zMax)` by precise input and/or deliberate 3D picks. Normalize any two picked corners to min/max for display.
- Require **positive rectangle width and height** and every coordinate within 0…200, finite, before rounding. Reject zero-area/out-of-range/NaN values.
- Blue selects or is shown the traversal orientation (`ALONG_X` or `ALONG_Z`) and lane spacing. Automatic orientation may prefer longer transects; the preview must show the chosen result. The interface must not claim coverage guarantees without actual MG-008 sensing.
- Generate parallel passes inside the selected rectangle, alternating travel direction for a true **serpentine zigzag**. Connect adjacent pass endpoints; do not teleport the drone from one row start to another.
- **The first and final boundaries must be included** so the chosen rectangle is not accidentally truncated. Avoid pathological rows or duplicate points for narrow rectangles.
- Maintain a deterministic output for the same rectangle/orientation/spacing; route is previewable before Start.
- Lane spacing must be positive, finite, no more than the rectangle's traversed dimension, and capped to avoid excessive waypoints. Do not silently accept zero/negative/very tiny spacing. If UX presets are chosen, display the resulting spacing.
- Align recommended lane spacing with the simulated sensor footprint defined later in MG-006; **do not hardcode a physically meaningful scan width** in MG-005. If a chosen spacing leaves survey gaps, visually flag "Potential gaps in virtual survey" rather than pretending to clear the rectangle.
- Use a clear 3D route line with numbered turns; Blue sees exactly the route the server later executes.

### 4.3 Route length, preflight and updates

- Compute `routeLength = sum(hypot(dx,dz))` along the complete ordered route in fictional units. No impossible "100% progress" while the drone has not traversed the route.
- Submission to backend returns **server-normalized waypoints**, derived length, plan ID/revision, config and a canonical route for the frontend to render.
- Changing a planned route before Start invalidates an older pending preview and requires updated confirmation. Once RUNNING/PAUSED, reject route edits unless the user explicitly stops and begins a new mission workflow.
- Red's hidden objects never influence route generation, validation, ordering, lane choice or route preview.
- If the room has switched state, a previously drafted plan must be checked against the **current** room/mode on Start.
- Always distinguish **planned survey area**, **path traversed**, and **actually sensor-scanned region** (MG-008). They are not interchangeable.

## 5. Mission readiness and server-owned state transitions

Integrate the current `ScenarioState` with mission status rather than inventing conflicting room states.

### Starting conditions

| Room mode/state | Can Blue submit/preview route? | Can Blue START? | Rationale |
|---|---|---|---|
| CHALLENGE + DRAFT | Yes | **No** | Red must explicitly lock first |
| CHALLENGE + LOCKED | Yes | **Yes**, if valid plan | Hidden scenario immutable |
| LIVE + DRAFT | Yes | **Yes**, if valid plan | Live edits permitted once running |
| Either + RUNNING | View only | No second simultaneous mission | Existing mission owns room |
| Either + PAUSED | View only | Resume only | Do not create duplicate mission |
| Either + FINISHED | View final route; optional replay-only | No without explicit new mission/reset | Results/history not overwritten |

- In LIVE mode, `DRAFT -> RUNNING` must be supported and not require a Challenge lock.
- In CHALLENGE mode, `LOCKED -> RUNNING`. The server must not allow `DRAFT -> RUNNING`.
- Starting an invalid route never changes room state, scenario revision, or mission state.
- Only **one active mission per room**; concurrent Start commands must result in a single mission, with an idempotent reply or a clear conflict for duplicates.
- Need not require a real drone, GPS, sensors or user login; this is a server-hosted classroom simulation.

### Commands and behavior

| Command | Valid prior status | Required authoritative result |
|---|---|---|
| START | READY with valid plan; room permitted as above | Start one mission; room becomes RUNNING; initial drone positioned at route start; simulation clock starts at 0 |
| PAUSE | RUNNING | Transition to PAUSED; freeze simulated clock, distance, virtual position and sensing exposure |
| RESUME | PAUSED | Transition to RUNNING from same position and time; no teleport/replay |
| SPEED 1x/2x/4x | RUNNING or PAUSED (optionally READY) | Change simulation-clock rate, **not** route geometry; no clock reset; UI and server agree |
| STOP | RUNNING or PAUSED | End mission and freeze final state; do not clear existing evidence; mark terminal reason `STOPPED_EARLY` |
| AUTO-COMPLETE | Last waypoint reached | End mission naturally; terminal reason `ROUTE_COMPLETED` |
| RESET/NEW MISSION (optional) | FINISHED only, explicit user intent | New mission ID/revision, never silently mutates past reports or unlocks Challenge scenario |

**Stop versus finish:** The user-approved **Stop** control terminates the active mission. For the shared room state machine, both Stop and reaching final waypoint transition into `FINISHED`, but record **separate completion reasons**. Score/reveal behavior is introduced at MG-010; MG-007 must not leak truth on Stop by returning a private scenario snapshot.

**Speed model:** Maintain a single monotonic `simTimeSeconds` advanced by `realElapsedSeconds * playbackSpeed` during RUNNING only. Mission distance advances by `baseSpeed * simulatedDelta`. At PAUSED, sim time and position remain constant even if speed control changes. Detect overshoot and clamp to final waypoint. In 4x, do not skip waypoints or teleport through a long segment; the engine must process crossed segments in order. MG-008 will need **swept path endpoints** to check the whole segment for candidates, not only a last rendered point.

**No relying on background animation:** The backend owns mission advancement; client `requestAnimationFrame` or tab focus cannot be the sole truth. Smooth frontend interpolation is visual only. A new Blue tab or reconnect must recover the same authoritative state and sim time.

**Clock and persistence:** Store the active plan, status, current route segment/distance, playback rate, authoritative simulation time and a monotonic mission sequence server-side. Use safe, bounded update/catch-up rules after a process restart; a restarted server must not invent minutes of unobserved real-time flight or duplicate events. Design choice is Rahil's to document and test. Existing SQLite room store persists Red scenario and must remain the source of truth for room state.

## 6. Three independent camera modes — observable acceptance

All three are **required user-selected views**, not synonyms for one camera angle. Use actual Three.js scene coordinates from `worldToScene` and virtual altitude; never put GPS labels on the scene.

| Camera | User-visible behavior | Controls/constraints |
|---|---|---|
| **Overview** | Oblique high-angle perspective where the route, terrain and moving drone are visible together; suitable for faculty/projector | Orbit/zoom/pan supported; option to reset to a useful framing of route/world |
| **Follow Drone** | Camera tracks the moving drone with a useful elevated trailing/offset position and smoothly follows turns | Keeps drone centered/in frame; does not jump at segment boundaries; clear orientation reference; user may return to Overview |
| **Top-Down** | Near-vertical map-like view with X/Z route geometry, waypoints and moving drone clearly readable | Stable orientation and legible boundary/route labels; zoom/pan if practical; do not invert axes between views |

Requirements:
1. Switching camera modes must **not** alter server flight route, drone position, mission time, speed, scan exposure or hidden scenario.
2. Each selection should yield a visibly different camera pose in the actual browser, even when the drone is not yet moving (Follow can target route start).
3. Camera transitions should be smooth enough for a projector demo, without disorienting jumps or clipping below the terrain.
4. Preserve the world bounds and checksum. Camera choice is **per-client visual state**, not private world data.
5. If Follow has no plan/drone yet, show a friendly "Plan mission to follow drone" state or target route start, never crash.
6. Terrain and route picking must remain correct in Overview/Top-Down when planning; while flying, accidental canvas clicks should not create new waypoints.
7. If WebGL is unavailable, show a clear fallback/error rather than an empty black panel.

MG-007 may extend the existing `WorldView` with an explicit camera-mode prop and `renderScene` overlay, or refactor cleanly, but the **Red placement click and camera functionality must not regress**. Maintain `CLICK_MAX_DRAG_PX = 4` or an equivalent drag guard.

## 7. Virtual drone visualization, telemetry and coverage integrity

MG-007 minimum functional representation is a clearly identifiable drone model/marker in the 3D world (simple lightweight mesh is acceptable), with an orientation tied to actual route heading, positive altitude above terrain and a visible trail/route.

Show:
- Current virtual X and Z (rounded for display; internal simulation remains continuous).
- Configured virtual altitude above terrain; optional instantaneous scene Y, labelled if shown.
- Route status and active waypoint/leg, remaining/complete distance, progress `0..100%` computed from actual travel.
- `simTimeSeconds` and current playback rate.
- Current status (READY/RUNNING/PAUSED/FINISHED) and a distinctive **Stopped early** versus **Route completed** ending.
- Planned survey rectangle/route for Grid, not "scanned/cleared" area yet.

**Telemetry integrity:**
- On PAUSE, progress, coordinates and time freeze. On RESUME, they continue exactly from paused position.
- 1x/2x/4x changes arrival time as expected but the path, endpoints and virtual route length remain the same.
- Same room in two Blue tabs must show consistent server-authoritative telemetry; small UI render/interpolation differences are acceptable but cannot disagree on mission state.
- Reconnect/snapshot must recover current position and active controls rather than restart at waypoint 1.
- At 100%, drone must be at the route end; do not report mission complete early due to rounding.
- At STOPPED_EARLY, preserve partial distance and partial planned-area indication, never imply the whole route was scanned.
- **No simulated detections at MG-007:** until MG-008, show "Virtual sensing not yet available" instead of dummy candidates or universal hidden pins.
- A future scan-footprint overlay must be tied to exactly the profile values MG-006 will define, not guessed from drone visual scale.

## 8. Privacy, authorization, multi-tab safety and audit

MG-004's security boundary is mandatory throughout mission integration:

- Public Blue room snapshots may include the planned route, drone pose, time, virtual sensor mode/profile and mission status. **Never include any undiscovered Red object ID, location, subtype, attacker token, object audit before/after values, or matched true object ID.**
- Public `GET /api/world` stays public static terrain only. Do not append scenarios to it.
- Never let Blue's mission plan endpoint accept a hidden object ID or server-side "aim at hazard" suggestion.
- A room code authorizes guest participation, not attacker edits. A malicious Blue client cannot use mission commands to unlock Challenge, change Red object state, or request private history.
- Keep all mission and event streams room-scoped, with no cross-room telemetry or state changes.
- The existing Red capability token must never be placed in mission responses, logs, reports, shared route links or Blue browser local storage.
- Where Blue controls are available to multiple guests holding the code, the server must serialize commands and handle duplicate Start/Pause/Resume safely. Optional single-controller ownership must be clearly documented if implemented; do not silently require account signup or break public join.
- A disconnected Blue tab must not halt an already-running mission on the server. Rejoining should receive one authoritative snapshot and subsequent telemetry events.
- The server remains responsible for route validation, mission command legality and time; disabled buttons are user experience, not security.

## 9. Suggested mission APIs and event envelope for Rahil to implement

These are **design proposals** for MG-007, not implemented routes. Match actual names and types to `shared/protocol.ts` and revise [API contract](../API_CONTRACT.md) after implementation.

| Action | Suggested path / event | Allowed consumer |
|---|---|---|
| Create/update plan | `POST /api/rooms/:code/mission/plan` | joined Blue guest; room-bound |
| Get public current mission | `GET /api/rooms/:code/mission` | joined participant |
| Command start/pause/resume/stop/speed | `POST /api/rooms/:code/mission/command` | joined Blue guest; backend validated |
| Public room status | existing `GET /api/rooms/:code/public` | unchanged object privacy |
| Mission snapshot | `mission:snapshot` (Socket) | room-scoped authorized public audience |
| Mission telemetry | `mission:telemetry` (Socket) | room-scoped participants |
| Mission lifecycle | `mission:state` or `mission:finished` | sanitized, room-scoped |
| Private Red future drone view | optional `attacker:tracking` | authenticated Red only; source is safe mission telemetry |

Suggested command envelope:
```ts
type MissionCommand =
  | { action: 'START'; planId: string }
  | { action: 'PAUSE'; missionId: string }
  | { action: 'RESUME'; missionId: string }
  | { action: 'STOP'; missionId: string }
  | { action: 'SET_SPEED'; missionId: string; playbackSpeed: 1 | 2 | 4 };
```

**API obligations:**
1. Plan responses contain canonical route, ID/revision and derived values, not Red truth.
2. Commands include mission/room identity (and optionally expected revision) to reject stale/misrouted inputs. Clear error messages for `INVALID_ROUTE`, `INVALID_MISSION_STATE`, `ROOM_NOT_FOUND`, `MISSION_NOT_FOUND`, `REVISION_CONFLICT`, `DUPLICATE_START` as applicable.
3. Every public telemetry snapshot has `missionId`, `sequence`, `serverTime`, `simTimeSeconds`, `status`, `x,z`, `routeDistanceCompleted`, `playbackSpeed` and a stable plan reference. Client discards stale/out-of-order sequence numbers.
4. The mission-state stream must not reuse `scenarioRevision` as a per-frame counter, otherwise Red's editing concurrency can break.
5. Stop/terminal message includes `ROUTE_COMPLETED` or `STOPPED_EARLY`. No private object reveal at MG-007.
6. Flight tick and all state mutations are backend-owned; transport lag and UI frame rate do not change route geometry.
7. Log mission state/command errors without leaking private tokens. Handle malformed/overlarge payloads.

## 10. Worked fictional demos — route planning, not detection claims

All points are **X/Z virtual units** in `mg-field-01` and can be safely committed as sanitized test fixtures. They are deliberately chosen independently of Red hidden data.

### DEMO A — Manual Challenge route

- Red prepares ALPHA as a private scenario and locks Challenge (Red decides; Blue cannot see objects).
- Blue joins public room, chooses **MANUAL**, Basic simulated mode, Standard profile.
- Example route: `(20,20) -> (80,20) -> (80,95) -> (135,95) -> (135,135)`.
- Preview shows 5 numbered waypoints and accurate virtual length from the actual segments. Blue starts only after Challenge is LOCKED.
- Pause mid-segment, switch to Follow, resume at 2x, switch Top-Down, stop early. Show proper partial progress and `STOPPED_EARLY`. No hidden truth is revealed.
- A separate completed run may traverse the full route and end `ROUTE_COMPLETED`.
- Any candidate observations are future MG-008 work; do not hard-code them in the mission planner.

### DEMO B — Grid Challenge route

- Blue selects rectangle `x=20..160, z=25..145` and a valid displayed positive lane spacing (e.g. `20` virtual units **as an illustrative route setting, not a real scanner width**).
- Server generates alternating passes, includes both outer edges, connects turns, returns canonical ordered path and length.
- Overview camera makes the zigzag shape obvious. Top-Down shows coverage planning geometry; Follow visibly tracks the moving drone.
- No need for any Red coordinates when selecting or generating the grid.

### DEMO C — Live mission state integration

- Red selects LIVE while DRAFT; Blue previews route and starts without Challenge lock.
- Flight proceeds on one server clock. During RUNNING, Red may update scenario privately using existing MG-004 edit permissions; safe mission telemetry continues for Blue.
- Audit should record actual mission simulation time once integrated. Full time-dependent virtual detection/no-retroactive observation is deferred to MG-008.
- Blue receives **no hidden Red edits** beyond permitted public metadata; the plotted flight path remains independent of hidden targets.

## 11. Acceptance matrix — Rahil executes and documents MG-007 tests

**These are specification criteria, not software PASS claims.** Rahil must implement and actually test MG-007, record commands/observed outputs and any deferred cases in `tasks/evidence/MG-007.md`. Shabaz performs **no** runtime tests.

| ID | Given / operation | Expected observable result | Priority |
|---|---|---|---|
| M01 | Blue joins valid room via code/link | Same `mg-field-01` world and room state, no Red objects | P0 |
| M02 | Manual route using terrain clicks | Ordered visible waypoints and canonical X/Z positions | P0 |
| M03 | Manual route via exact X/Z entry | Server-normalized 0.1-unit points and correct order | P0 |
| M04 | Edit/reorder/remove/clear manual points | Immediate route/length preview recalculation, no ghost points | P0 |
| M05 | Manual with one waypoint or zero-length legs | Server rejects invalid route, state unaffected | P0 |
| M06 | Manual with boundaries (0,0), (200,200) | Accepted when route otherwise valid | P0 |
| M07 | NaN, Infinity, blank, -0.1, 200.01, malformed input | Server rejects without clamping or changing mission state | P0 |
| M08 | Drag 400px while planner active | Orbit changes camera only; no new waypoint | P0 |
| M09 | Select a rectangular grid | Correct bounds, visible preview and lane orientation | P0 |
| M10 | Generate grid with valid positive lane spacing | Reproducible connected zigzag with alternating directions, both outer edges | P0 |
| M11 | Grid zero-area, invalid bounds, zero/negative/excessive spacing | Server rejects with useful message; no state mutation | P0 |
| M12 | Preview and execute same plan | Drone follows **the server's exact ordered preview path**, not a different route | P0 |
| M13 | Challenge DRAFT, attempt START | Server rejects; Red must lock | P0 |
| M14 | Challenge LOCKED, valid plan, START | Transitions to RUNNING; initial position at first waypoint, one mission only | P0 |
| M15 | LIVE DRAFT, valid plan, START | Transitions to RUNNING without Challenge lock | P0 |
| M16 | PAUSE during a leg | X/Z, progress, sim time remain frozen while paused | P0 |
| M17 | RESUME | Continues from same place/time; no teleport or reset | P0 |
| M18 | STOP before completion | FINISHED with `STOPPED_EARLY`; partial progress preserved, no truth leak | P0 |
| M19 | Complete all legs | FINISHED with `ROUTE_COMPLETED`, final point and 100% route progress | P0 |
| M20 | Switch playback 1x to 2x to 4x | Time/distance rate scales, same path; no skipped waypoints or duplicate mission | P0 |
| M21 | Duplicate START; illegal PAUSE/RESUME/STOP | Safe conflict/idempotence; no duplicate timers or corrupt state | P0 |
| M22 | Overview camera | Oblique route/world/drone visible; orbit/zoom/reset usable | P0 |
| M23 | Follow Drone camera | Drone stays in frame through turns with consistent heading | P0 |
| M24 | Top-Down camera | True overhead route/waypoint view with unchanged X/Z orientation | P0 |
| M25 | Switch all cameras during flight | Identical server route/time/position before/after; visibly distinct camera poses | P0 |
| M26 | Refresh/reconnect Blue while RUNNING or PAUSED | Recovers correct authoritative plan, time, status, speed, position | P0 |
| M27 | Two Blue tabs same room | Consistent mission ID/status/telemetry; commands serialize safely | P0 |
| M28 | Two different rooms run | Mission streams are isolated; no room crossover | P0 |
| M29 | Inspect Blue HTTP/Socket payload and DOM | No hidden Red coordinates/subtypes/object IDs/tokens | P0 |
| M30 | After mission commands, inspect Red list/Challenge lock | MG-004 object editing and role rules remain intact | P0 |
| M31 | Invalid route or failed command | Clear error; no false “saved”, “running”, or “complete” UI | P0 |
| M32 | Display sensor mode and Narrow/Standard/Wide | Config stored and labelled as **simulated**; numerical footprints deferred to MG-006/008 | P0 |
| M33 | Restart app with persisted mission | Safe documented restore/fail-closed behavior; no duplicate catch-up scan | P1 |
| M34 | Join from physical phone over LAN/HTTPS tunnel | Required ultimately at MG-011; may be deferred honestly at MG-007 | Later |
| M35 | Actual sweeping scan, candidate markers, Red drone tracking | MG-008 owns runtime acceptance; placeholders must not imply passed | Later |
| M36 | Real sensor accuracy / real buried detection | **Out of scope**; no misleading claim anywhere | P0 |

**Required MG-007 quality gate:** all applicable P0 criteria above, including the actual server-authoritative motion, manual/grid routes and **three camera modes**, must be evidenced before claiming DONE. The grid/3-camera requirements are confirmed user decisions, not optional. If time forces a partial implementation, record task IN_PROGRESS/limitations truthfully rather than claiming all P0 cases PASS.

Rahil's evidence should record the OS/browser, exact test commands (e.g. `npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` as applicable), test counts, observed results, screenshots or browser logs, defects fixed and known limitations. **No fabricated QA outputs.**

## 12. Implementation cutline and follow-on interface

**Implement first (P0):**
1. Extend the existing Blue joined-room page with route planner/config.
2. Add shared mission/route model and backend validation; deterministic manual/grid canonical plans.
3. Persist one mission per active room, commands, position/clock, and return clean public snapshots.
4. Render 3D drone/route and three independent camera modes without Red regression.
5. Implement pause/resume/stop and 1x/2x/4x; test reconnect and privacy.
6. Preserve a clean mission-to-sensor integration boundary: on every backend movement step retain previous and next route positions and simulation interval, so MG-008 can perform **swept virtual sensing** at 4x, including on turns.

**Do not waste time (outside MG-007):** trained CV or real drone input, realistic aerodynamics, physics engine, buried mine detection, terrain obstacle avoidance, detailed scoring/reveal, PDF export or real two-device deployment validation. No permanent hard-coded fabricated candidate markers.

**Potential MG-006 dependency:** MG-005 defines the *UI/flight contract* for sensor mode/profile, but **does not choose numeric virtual radii, Basic/Advanced probability rules or accuracy metrics**. Those will be explicitly defined in `docs/specs/DETECTION_ACCEPTANCE.md` by Shabaz before MG-007 begins, enabling Rahil to write one consistent sensor configuration model.

## 13. Serial handoff and completion criteria

MG-005 is complete when **this Markdown file** exists at `docs/specs/MISSION_ACCEPTANCE.md` in the authoritative `MdShabazS/MineGuard` GitHub `main` tree and `tasks/status.json` marks **MG-005 DONE**, evidence path `docs/specs/MISSION_ACCEPTANCE.md`.

Immediately after this document is confirmed DONE:
- **MG-006 — Shabaz, DOC** becomes READY: write sensing/detection/evaluation acceptance.
- **MG-007 — Rahil, BUILD** remains BLOCKED until MG-006 is committed DONE. Rahil may read the contract for awareness but cannot begin blocked MG-007 development.
- **Only Rahil** implements and runs real application tests. Shabaz does not create test evidence or represent documented acceptance criteria as executed PASS results.

**Source of truth:** GitHub commit link, current task status and referenced document—not chat assertions or local unsynced work.
