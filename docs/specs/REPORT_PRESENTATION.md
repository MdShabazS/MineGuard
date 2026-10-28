# MG-009 — Final Report, Truth-Reveal and Faculty Demonstration Acceptance Contract

**Task:** MG-009 — Report and faculty demonstration template  
**Owner:** Mohammed Shabaz S (Shabaz), requirements and documentation **only**  
**Prerequisite:** MG-008 (Rahil) committed DONE; see [MG-008 test evidence](../../tasks/evidence/MG-008.md)  
**Implementation owner:** A Mohammed Rahil (MG-010: result comparison, scoring and export; sole software tester)  
**Next document owner:** Shabaz (MG-012: final faculty Q&A after MG-011 networking validation)  
**GitHub source of truth:** `MdShabazS/MineGuard`, branch `main`  
**Status of this file:** **Specification, layout and test criteria — not an implemented report or proof of runtime QA.**

## 1. Goal, approved scope and what exists today

The MineGuard V0.1 demonstration must end with a **truthful, readable and downloadable mission report** comparing the server's historical fictional scenario with the actual virtual flight and the candidate observations produced by the simulated sensor. Faculty should be able to follow a 5–7 minute live demonstration and understand both the engineering architecture and its limitations.

**What MG-008 already implemented (source checked for MG-009):**
- Private Red objects and role-safe room synchronization, backed by SQLite (`server/src/rooms/store.ts`).
- Manual and grid missions, real server-authoritative simulation clock, 1x/2x/4x playback, three cameras and mission terminal reasons (`shared/mission.ts`, `server/src/mission/engine.ts`).
- Virtual sensing with `shared/sensor.ts`: Basic and seeded Advanced; radii Narrow **6**, Standard **10**, Wide **16** **virtual units**.
- Private `sensor_decisions` in SQLite including mission/object ID, outcome, first simulated exposure time, kind/subtype/coordinates and revisions; separate `candidates` table with safe public observations (`server/src/mission/sensor.ts`).
- Live edits with mission-time audit and **one decision per object per mission**, even after a move.
- Public `MissionSnapshot.candidates`, `MissionTelemetry.coverage`, `GET /api/rooms/:code/mission/observations`, candidate review, and actual Blue pins/details; optional Red drone tracking.
- Coverage estimated using a **1 virtual-unit cell grid**, clipped to the fictional world. For a **Grid** mission, coverage percent is relative to the chosen survey rectangle; for a **Manual** mission, percent is **N/A** unless a separately defined evaluation region exists.
- **Rahil's committed MG-008 evidence** records 75/75 automated tests and 5/5 browser tests on his environment. This document does **not** rerun those tests or extend their PASS scope.

**Not yet implemented when MG-009 began:** final result calculation, explicit ground-truth reveal UI/authorization, report view, downloadable/printable report, and post-finish result tests. These are the **MG-010 requirements below**, not existing features.

**Non-negotiable description:** This is a fictional 3D digital-twin software demonstration, **not** actual mine detection, real-world clearance, trained ML accuracy, real buried-hazard sensing, or a certified inspection. All X/Z positions are fictitious virtual units, **never GPS coordinates**. A virtual covered region must **never** be labelled "safe" or "cleared."

### Authoritative references

1. [Approved decisions](../DECISIONS.md) — especially 04/05 (virtual detection), 07 (Challenge/Live), 10 (mapped observations), 15 (profiles), 16 (report).
2. [Product requirements](../PROJECT_SPEC.md), [UX/scenarios](../UX_AND_SCENARIOS.md) and [test/demo plan](../TEST_AND_DEMO.md).
3. [Mission acceptance](MISSION_ACCEPTANCE.md) — route type, controls, clock, stop vs finish.
4. [Detection/evaluation acceptance](DETECTION_ACCEPTANCE.md) — §§3–12, especially historical `H/E/D/M/U/F` sets, zero denominators and Live timelines.
5. [Implemented API contract](../API_CONTRACT.md), [mission models](../../shared/mission.ts), [sensor models](../../shared/sensor.ts), [scenario models](../../shared/scenario.ts).
6. [Mission engine](../../server/src/mission/engine.ts), [sensor engine](../../server/src/mission/sensor.ts), [room store](../../server/src/rooms/store.ts).

If a future code change conflicts with the approved behavioral requirements, **update the API and document the deviation; do not silently change the scoring policy.**

## 2. MG-010 user journey and post-finish permission policy

**Intended journey:** Red creates a private fictional scenario -> Blue joins by room code/public URL -> Blue previews and flies a virtual route -> the server emits candidate observations only for actual simulated sweeps -> flight ends -> Blue explicitly requests **Reveal & Compare** -> server computes and freezes truth/evaluation -> Blue views and downloads a report.

### 2.1 State and command matrix

| Room/mission state | Existing public candidate list | Private truth/results | Report export |
|---|---|---|---|
| No mission / DRAFT | None | **Forbidden** | **Forbidden** |
| CHALLENGE/LOCKED, before START | None | **Forbidden** | **Forbidden** |
| RUNNING | Already observed candidates only | **Forbidden** | **Forbidden** |
| PAUSED | Already observed candidates only | **Forbidden** | **Forbidden** |
| FINISHED with `ROUTE_COMPLETED`, not revealed | Public candidates | **Forbidden** until explicit reveal | **Forbidden** until reveal |
| FINISHED with `STOPPED_EARLY`, not revealed | Public candidates | **Forbidden** until explicit reveal | **Forbidden** until reveal |
| FINISHED + successfully **REVEALED** | All mission candidates and frozen truth comparison | **Allowed for the same joined room**, clearly post-finish | **Allowed**; same frozen values as on-screen |
| NEW_MISSION after previous reveal | New mission starts with no truth available | Prior report can remain archived by its mission ID; new mission still gated | Old frozen report only by its own ID; new report forbidden |

- **Reveal must be an explicit action** with a visible **Reveal & Compare** button and a short warning that the private fictional scenario will become visible **to participants in this room** after the mission. Do not auto-reveal on STOP, refresh, a candidate-review action or a plain GET request.
- The existing guest model authenticates Blue by **room code**, not accounts. **Proposed demo policy:** any participant who possesses the correct public room code can request reveal **after** the mission is FINISHED, and once revealed the completed result is visible to people joining that room. This is an intentional **post-finish sharing policy**, not secrecy against people who know the join code. Backend must enforce room/mission match and finish state; Red bearer credentials must never be required by Blue or copied into the report.
- STOPPED_EARLY is eligible for an **explicit** reveal, but the result must visibly say **"Stopped early — partial virtual survey"**, preserving actual flown distance and distinguishing unscanned targets.
- A valid reveal transitions an immutable mission results record into `REVEALED` (or equivalent persistent per-mission flag). Repeated reveal requests are **idempotent**: same result identity and metrics; no new sensor trials, no double-count or re-randomization.
- `FINISHED` and `REVEALED` must be **distinct** concepts. Do **not** change the existing `ScenarioState` enum or reopen Red editing merely to support reveal. Persist the reveal state separately and bind it to `missionId`.
- No reveal on a stale mission ID or for another room. No prior mission data may be exposed through the "latest mission" shortcut.
- When a new mission is explicitly started, its private truth remains private until its own explicit reveal. Historical revealed reports remain immutable and must not change when a later mission or Live scenario is created.

### 2.2 UI controls and failure behavior

- While flying: show **"Findings are simulated candidates; truth comparison available only after this mission ends."**
- After FINISHED: show **"Reveal & Compare"**, the recorded `ROUTE_COMPLETED` / `STOPPED_EARLY` reason, and concise disclosure of results sharing.
- Before reveal: **hide** truth-only UI and refuse results/export endpoints on the **server**. A disabled client button is not sufficient.
- After reveal: show **View Results**, **Download Report (PDF)** where a verified PDF exporter exists, and **Print / Save as PDF** as an accessible offline fallback. Report/download buttons must never silently return a blank artifact or a renamed HTML file called `.pdf`.
- If an export engine/library is unavailable, a fully printable report page with functioning browser print-to-PDF is an acceptable emergency fallback; label it honestly as **Print / Save as PDF** and note the limitation in MG-010 evidence.
- After refresh/reconnect, show the persisted reveal state and same report; do not require re-running the flight.
- Loading/errors include clear `REPORT_NOT_READY`, `MISSION_NOT_FINISHED`, `MISSION_NOT_FOUND` / `ROOM_NOT_FOUND` or consistent equivalents; failed requests must not leak hidden data, partial truth, raw SQL or credentials.
- Make buttons and final tables readable at projector scale and usable on a narrow screen. No hover-only essential controls.

## 3. Reporting source of truth and historical reconstruction

**Do not calculate evaluation scores from the latest Red marker list, a Blue browser cache, or a guessed screenshot.** The server computes results from immutable, per-mission data; report UI merely formats the authorized result.

### 3.1 Existing MG-008 persistence that MG-010 should reuse

| Source in current code | Useful values |
|---|---|
| `missions` (`server/src/mission/engine.ts`) | `id`, `room_id`, frozen plan JSON, `status`, `end_reason`, `sim_time`, `distance`, `seed`, `sequence` |
| `mission_plans` | Current room plan; **do not** substitute it for the mission's own stored frozen plan when reconstructing a finished mission |
| `sensor_decisions` (`server/src/mission/sensor.ts`) | `mission_id,object_id,outcome,candidate_id,first_sim_time,kind,subtype,x,z,object_revision,scenario_revision` |
| `candidates` | Stable public `candidateId` / number, virtual location, simulated time, mode/profile and `NEW|REVIEWED` state |
| `objects` (`server/src/rooms/store.ts`) | Current and soft-deleted private Red objects, including type, revision and coordinates |
| `audit` | Private ordered Red `CREATE/MOVE/UPDATE/DELETE` and state transitions, `mission_sim_time`, before/after values, revisions |
| `shared/mission.ts` | `MissionPlan`, `MissionTelemetry`, `EndReason`; ordered route X/Z, baseline speed **8 virtual units per simulated second**, altitude **12 virtual units** |
| `shared/sensor.ts` | `FOOTPRINT_RADIUS` 6/10/16, `SENSOR_ALGORITHM_VERSION='sim-v1'`, Advanced thresholds, `COVERAGE_RESOLUTION=1` |

**Implementation gap:** MG-008 stores first eligible decisions and current/soft-deleted objects but did **not** implement the frozen result record or final historical denominator/score. For full Live evaluation, MG-010 must correctly recover *objects that existed and changed during the mission*, including those deleted before any scan. It may need to add a **mission-start scenario snapshot / per-mission object-history index** (or prove a durable equivalent reconstruction from complete private audit), rather than assuming the last 50 Red UI history items or latest active objects are complete. Do not fabricate "not scanned" counts when history is incomplete.

**Historical source invariant:** Use the active object state at the *simulated encounter time*, not merely the final state. A Live object created after the drone passed is unscanned; one detected then deleted remains detected; a hazard moved after a miss is not rerolled. Ensure pre-existing objects are included in the mission-start baseline. A kind change during Live must be evaluated against actual historical hazard/decoy intervals and the **one decision per stable object ID per mission** rule; disclose ambiguous reclassification instead of silently scoring against final type.

### 3.2 Freeze results atomically on first reveal

On first authorized post-finish reveal, the server must:
1. Find the exact finished `missionId` in the specified room, with its **frozen mission plan** and terminal reason.
2. Reconstruct private synthetic truth active at any point of that mission from baseline + complete ordered edits, or an equivalent source. Preserve effective `missionSimTime` and revision and mark objects added/moved/deleted.
3. Load all private `sensor_decisions` and public `candidates` for **that mission ID**. Associate each candidate with the correct private object via `sensor_decisions.candidate_id`. Reject/flag any orphan candidate, duplicates or contradictory result instead of silently excluding it.
4. Calculate classifications, metrics and actual swept X/Z area from **actual travel**, not planned path. For a stopped mission, use partial distance/time. Apply 1-unit cell-coverage method or the persisted server estimate; verify consistency.
5. Store the result, schema/algorithm version, reveal timestamp and unique report ID/version in SQLite in one consistency-preserving process. A stable source hash/checksum and durable transaction are recommended. Repeated GET/print/download must use **that frozen result**, not re-read mutable latest-state data.
6. Only then expose the authorized full result and report. Never stream partial private truth to Blue during the computation.
7. Record an audit event for reveal without putting raw attacker tokens or private link fragments in logs.

**Do not edit earlier MG-008 test evidence to claim report behavior; MG-010 owns implementation and fresh QA.**

## 4. Exact evaluation definitions — no misleading "accuracy"

Use the definitions and formulas fixed by [MG-006](DETECTION_ACCEPTANCE.md) §10. This section is the report's display contract.

### 4.1 Sets from historical private truth

For the completed `missionId`:

- **H** = unique hazard object IDs that were active in a hazard-category interval at any time during the mission (not only still present at finish).
- **E** = hazard IDs with at least one **actual in-footprint encounter while active as a hazard** during the mission. Includes Advanced misses, and must be reconstructed from event/time evidence; no planned-but-unflown route exposure.
- **D** = unique eligible hazard IDs that generated a candidate while their first evaluated encounter was hazard-classified; **TP** = size of D.
- **M = E minus D** = eligible scanned hazard IDs without a true-hazard candidate; **FN** = size of M.
- **U = H minus E** = hazards never within the actual virtual footprint while they were active; **UNSCANNED** = size of U; **not** an FN.
- **F** = candidate IDs from private decisions made while the object was a decoy; **FP** = size of F.
- For a Live stable object whose `kind` changed between exposures, **retain the recorded first decision**; do not reroll it. If a later hazard-classified interval is actually swept but cannot receive a second decision, explain that the no-retry model made it a missed eligible hazard under this V0.1 scoring rule. Provide a time-aware per-object note, not a fictitious new event.

```text
TP = |D|
FN = |E \ D|
FP = |F|
UNSCANNED = |H \ E|

eligibleScannedHazards = TP + FN
hazardsActiveDuringMission = TP + FN + UNSCANNED

precision = TP / (TP + FP),   if TP+FP > 0 else N/A
recall    = TP / (TP + FN),   if TP+FN > 0 else N/A
```

**Count invariants (must pass tests):**
- Unique candidate count = TP + FP for this defined V0.1 system (every emitted candidate has one private matching object; no background ghost pins).
- A `NEW` versus `REVIEWED` flag never changes TP/FP/FN.
- A false alarm from a decoy cannot be called "confirmed hazard" even after reveal.
- One detected-then-deleted hazard remains TP.
- One removed-before-scan hazard can remain **UNSCANNED** if it was active during the mission, and must **not** become FN by comparing only final coordinates.
- Hidden objects outside the **actual flown** area are UNSCANNED even if inside the planned grid rectangle.
- Rescanning the same object does not double-count candidate or truth.
- If an object was created **after** mission ended, it does not belong in H for the prior mission.
- Counts in summary cards, detailed tables, CSV (if added), HTML, PDF and server response must all match exactly.

### 4.2 Zero-denominator and edge-case display

| Scenario | TP | FP | FN | UNSCANNED | Precision | Recall |
|---|---:|---:|---:|---:|---|---|
| No hazards, no candidates | 0 | 0 | 0 | 0 | **N/A** | **N/A** |
| One scanned Advanced hazard, but missed | 0 | 0 | 1 | 0 | **N/A** | 0% |
| One observed hazard and one decoy false alarm | 1 | 1 | 0 | 0 | 50% | 100% |
| One Basic-observed hazard, another never scanned | 1 | 0 | 0 | 1 | 100% | 100% **of eligible scanned hazards only** |
| One Advanced decoy false alarm, no eligible hazard | 0 | 1 | 0 | 0 | 0% | **N/A** |
| Early STOP before any hazard, one placed hazard | 0 | 0 | 0 | 1 | **N/A** | **N/A** |

**Use N/A for an undefined denominator**; do not substitute 0%, 100%, blank or NaN. Never present precision/recall as real-world device accuracy, whole-field safety, probability guarantees or ML validation. If displaying percentages, use one decimal place (e.g. `50.0%`) and include the integer counts.

### 4.3 Coverage and distance, with units

- `sweptArea`: union of ground-plane circular footprints over **actual path flown**, clipped to world. Display **estimated virtual area (units²)** with `COVERAGE_RESOLUTION=1 virtual unit`; avoid spurious decimal precision.
- `gridCoveragePercent`: percent of the designated grid rectangle covered by swept X/Z union, **not** hazard recall and not real clearance.
- For **manual** routes, show swept virtual area and `Coverage %: N/A (no declared evaluation rectangle)`; do not divide by all 200 × 200 units unless that evaluation region was explicitly designated.
- `plannedRouteLength` is the full confirmed route; `actualFlownDistance` is the real server distance when mission ended. Label both in virtual units. On STOPPED_EARLY, show `actual < planned` and terminal reason prominently.
- Display `elapsedSimulationTime` (sim seconds) and optionally a clearly distinct actual wall-clock duration if recorded; never call a 4x virtual run "4x physical drone speed."
- Grid/report should show lane count, orientation and spacing where applicable. The `potentialGaps` flag and actual fraction of area must not be mistaken for a guarantee of coverage.
- The evaluation's visual X/Z footprints must use the **same** NARROW 6 / STANDARD 10 / WIDE 16 radii as the current engine; no fabricated post-hoc scan mask.

## 5. Final report — required structured layout

**Target:** a concise, professionally formatted **2–4 A4-page equivalent** report for classroom printing and PDF export. Avoid a giant generic academic essay. Readable black-and-white printing must work even though the live dashboard is dark/colored. Optional accent color is acceptable on screen; no meaning may rely on color alone.

### Page 1 — Executive mission summary and mission path

1. **Header:** `MineGuard V0.1 | Virtual Aerial Survey Simulation — Mission Report`, generated UTC/local timestamp with timezone, `SIMULATED / NON-OPERATIONAL` qualifier.
2. **Identifiers:** short public room code, report ID/version, mission ID (shortened for display with full ID available in technical appendix), world `mg-field-01` and world checksum; **never private attacker token or link**.
3. **Status and mode:** CHALLENGE/LIVE, MANUAL/GRID, BASIC/ADVANCED, NARROW/STANDARD/WIDE, footprint radius in fictional units, `ROUTE_COMPLETED` or `STOPPED_EARLY`, simulation start/end timestamps if stored.
4. **Primary metrics (large but simple):** `TP`, `FP`, `FN`, `UNSCANNED`, `Precision`, `Recall`. Explicit captions **"Synthetic simulation outcomes"** and **"Recall is among scanned eligible hazards only"**.
5. **Flight summary:** planned length, **actual** distance, simulation time, selected playback speeds if logged (or final speed only explicitly labeled), altitude above ground (virtual), planned survey area, estimated coverage area and grid percent / Manual N/A.
6. **Mission map:** server-authorized post-reveal 2D top-down plot with world bounds, actual route and start/end, actually swept region, public candidate pins and revealed historical truth positions. Use explicit symbols/legend (e.g. `○` flown waypoint, `C#` candidate, `H#` truth), line styles/patterns distinguish even in monochrome. Do **not** draw all hidden objects on a pre-reveal public page.

### Page 2 — Candidate observations and revealed truth

**Candidate table** (every public emitted candidate; stable server order):

| Column | Value / rule |
|---|---|
| Candidate ID | Existing `number` / `candidateId` as `C1`, `C2`… |
| X / Z | Fictional observed coordinates from `PublicCandidate` |
| First observation time | `simTimeSeconds`, not time of report generation |
| Sensor | `BASIC|ADVANCED` and profile |
| Review | `NEW|REVIEWED`; **not** evidence of correct detection |
| Post-reveal classification | `HAZARD_MATCH (TP)` or `DECOY_FALSE_ALARM (FP)`; never shown before reveal |

**Revealed truth table** (derived from **historical** scenario; post-reveal only):

| Column | Value / rule |
|---|---|
| Truth display ID | Stable, report-scoped `H1/H2` or `D1/D2`; optional server object ID only if deliberate and gated post-reveal |
| Type/subtype | Synthetic Surface/Obscured/Buried/Decoy, clearly fictional |
| Coordinate/time | At first eligible encounter; if never scanned, historically active position/interval; do **not** simply use final position for Live |
| Evaluation | DETECTED / MISSED_WHILE_SCANNED / NOT_SCANNED / DECOY_FALSE_ALARM / DECOY_IGNORED |
| Linked candidate | `C#` only when one was actually emitted |
| Historical event note | Created/moved/deleted, relevant simulation time and revision when applicable |

For numerous objects, paginate truth/candidates into additional pages rather than clipping the table. Keep table headings repeated across pages. No backend secrets in exported JSON/HTML/metadata.

### Page 3 — Methodology, limitations and reproducibility (may combine with page 2 for short missions)

- **How it works:** The Red Team creates a hidden fictional target layout; the Blue Team plans a virtual path; the server advances the drone and computes circular swept proximity; a public candidate appears only when a qualifying synthetic event occurs; final results compare with private historical truth **after explicit reveal**.
- **Detection rules:** Basic = all in-range hazard categories detected once, decoys ignored. Advanced = one seeded synthetic decision per object; thresholds SURFACE 0.90, OBSCURED 0.70, BURIED 0.50, decoys 0.20. These are **programmed simulation parameters, not measured performance**.
- **Sensor geometry:** X/Z radius 6, 10 or 16 virtual units, no altitude/camera/terrain-based physical sensing claim, actual swept segments including 4x turns.
- **Coverage method:** approximate union of cells on a 1 virtual-unit grid; report actual travelled coverage and planned geometry separately.
- **Limitations:** not real landmine detection; not real subsurface sensing; no trained AI/ML accuracy; candidate position has **no localization noise** in V0.1; Advanced misses do not retry a changed object within a mission; report does not prove any land is clear/safe; Live scenarios have a time-dependent truth.
- **Traceability:** mission/report ID, world checksum, sensor algorithm `sim-v1`, seed (may be shown after reveal for reproducibility), generated/report version, scenario/mission final revision where meaningful, software/app version or Git commit hash **only when actually available**, and completion reason. Never fabricate a commit ID.
- **Technical note if restart occurs:** actual persisted pause/resume behavior, any documented partial-tick Live limitation. Include only if applicable rather than inventing a test result.
- **Attribution:** `MineGuard — college virtual digital-twin engineering demonstration`. Do not imply an official hardware manufacturer validation or government clearance certificate.

### Print/PDF acceptance details

- A4 portrait (landscape only for wide map/table appendix); consistent 10–11 pt body, 13–16 pt section headings, 18–22 pt title where practical, adequate whitespace, page numbers `Page X of Y` when PDF library allows.
- Margins ≥ 12 mm; keep headings with following paragraph; do not orphan table headers. Avoid clipped cells, oversized canvases and unreadable screenshots.
- Black/white legibility, accessible contrast, labels rather than color-only distinctions. Include an explicit legend.
- Use robust static report HTML for print, or direct PDF generation from the server's frozen result. **No live WebGL dependency** in a downloaded file. A snapshot image is optional; server-derived simple SVG/2D map is preferred when possible for clear printing. Never screenshot Red's browser address bar with private fragment.
- The PDF/print version must show exactly the **same figures and truth records** as the on-screen result view. Do not maintain a second independent JavaScript scoring implementation in the export template.
- A legitimate download has a correct file type/Content-Type/extension (e.g. `mineguard-MISSIONID-report.pdf`) and is usable **offline** after it has been produced. Never rename HTML to `.pdf`.
- Provide honest fallback `Print / Save as PDF` for browser printing if direct PDF export fails; this must be tested and labelled as such, not reported as implemented direct PDF download.

## 6. On-screen results panel and chart/legend behavior

Extend the existing Blue `DefencePortal.tsx` and `Findings` UI; do not rebuild mission planning or the private Red portal.

**Summary panel (only after reveal):** terminal mission reason, 4 counts (TP/FP/FN/UNSCANNED), precision/recall with N/A, coverage/route summary, downloadable report actions. Make **UNSCANNED** equally visible to TP; burying it in footnotes risks misleading faculty.

**Truth comparison view:** side-by-side or stacked "Public candidates" and "Revealed fictional truth", a linked C# to H#/D# table, and selectable markers. A candidate is a *possible observation* before reveal; after reveal it may be labelled TP or FP, but may not be relabelled as a real mine.

**Map layer legend (post-reveal):**
- Planned route (thin dashed line)
- Actually flown route (solid line)
- Actually covered virtual area (transparent stipple/hatch)
- Observed candidates (C1/C2…)
- Revealed hazard truth (H1/H2…)
- Revealed decoys (D1/D2…)
- Unscanned target truth (distinct outline and `NOT SCANNED` label)
- No meaning from hue alone; user can toggle layers to reduce overlap.

**During flight** the revealed truth layer must be completely absent from Blue **network payloads**, not simply hidden behind CSS. After reveal, truth is a deliberate, server-authorized product. Static public `GET /api/world` must **never** gain scenario objects.

## 7. API/result schema proposal — implement in MG-010

MG-008 already has these endpoints:
- `GET /api/rooms/:code/mission`: public mission snapshot (plan, telemetry and safe candidates).
- `GET /api/rooms/:code/mission/observations`: safe candidate list.
- `PATCH /api/rooms/:code/mission/observations/:candidateId/review`: public review state only.
- The Socket.IO public mission/candidate events are already implemented.

**The following are proposed new MG-010 interfaces (not yet implemented):**

| Operation | Proposed route | Gate / response |
|---|---|---|
| Reveal frozen results | `POST /api/rooms/:code/mission/:missionId/reveal` | Same-room mission FINISHED only; explicit action, idempotent. Creates persistent `REVEALED` state and frozen comparison |
| Read results | `GET /api/rooms/:code/mission/:missionId/results` | 409/403 before reveal; after reveal, only that room/mission's frozen result |
| Download report | `GET /api/rooms/:code/mission/:missionId/report.pdf` | Post-reveal only; correct PDF MIME/file; no hidden value from other room or tokens |
| Printable report | `GET /api/rooms/:code/mission/:missionId/report` | Post-reveal HTML with print CSS and same frozen result; useful fallback |
| Results-state notification | `mission:results-ready` Socket.IO | Room-scoped, safe event after persisted reveal; never broadcast raw private audit |

Suggested serializable frozen result shape (Rahil may change exact property names and document actual implementation):

```ts
type RevealStatus = 'HIDDEN' | 'REVEALED';
type TruthDisposition =
  | 'DETECTED' | 'MISSED_WHILE_SCANNED' | 'NOT_SCANNED'
  | 'DECOY_FALSE_ALARM' | 'DECOY_IGNORED';

interface ResultMetrics {
  tp: number;
  fp: number;
  fn: number;
  unscanned: number;
  eligibleScannedHazards: number;
  hazardsActiveDuringMission: number;
  precision: number | null;  // null renders N/A
  recall: number | null;     // null renders N/A
}

interface RevealedObjectRow {
  reportObjectLabel: string;        // H1 or D1, post-reveal only
  kind: 'HAZARD' | 'DECOY';
  subtype: string;
  disposition: TruthDisposition;
  x: number; z: number;             // position with clear historical time context
  firstEligibleSimTime: number | null;
  candidateId: string | null;
  eventNotes: string[];             // historical Live changes, private until reveal
}
interface FrozenMissionResult {
  resultVersion: number;
  reportId: string;
  roomCode: string;
  missionId: string;
  revealedAt: string;               // actual server time
  terrainId: string;
  worldChecksum: string;
  scenarioMode: 'CHALLENGE' | 'LIVE';
  endReason: 'ROUTE_COMPLETED' | 'STOPPED_EARLY';
  plan: MissionPlan;                // frozen plan of this mission
  actualFlownDistance: number;
  simTimeSeconds: number;
  coverage: CoverageEstimate;
  sensorAlgorithmVersion: string;
  seed: string;                     // display only after reveal
  candidates: PublicCandidate[];
  truth: RevealedObjectRow[];       // NEVER pre-reveal
  metrics: ResultMetrics;
  warnings: string[];
}
```

Privacy/identity requirements:
- Public pre-reveal GET/Socket/DOM/cache responses may not include `truth`, full Red object IDs, hidden `kind/subtype`, private audit `before/after`, `isFalseAlarm` or raw attacker token.
- After reveal, the selected room's **frozen historical synthetic truth** is intentionally accessible to joined room guests. This does **not** authorize Red editing or disclose private capability links.
- Use independent `reportId`/result version and exact `missionId`; never let clients request another room's report by guessing a mission ID.
- Add explicit `GET`/download protection; do not permit fetching raw truth by merely appending `?reveal=1`.
- Use predictable error structures, not stack traces. A finished-but-hidden report returns a safe error. An invalid mission/room pairing returns NOT_FOUND without data disclosure.
- Server-authoritative metrics are computed **once per frozen result**, not recalculated in every client render, CSV or PDF export.
- Update [API_CONTRACT](../API_CONTRACT.md), shared types, README and test evidence with the **actual** implemented routes after MG-010.

## 8. Presentation outline and 5–7 minute faculty demo script

This section is a **presentation template**, not an assertion that slides or a polished final live demo have already been produced. MG-012 will refine the actual talk and faculty Q&A after network testing; Rahil verifies the software in MG-010/011/013.

### Suggested 7-slide presentation outline

| Slide | Heading | One diagram/visual and key point |
|---|---|---|
| 1 | **MineGuard — Red/Blue Virtual Aerial Survey Digital Twin** | One fictional shared world; **software simulator** label; problem/goal |
| 2 | **System Architecture** | Two browsers -> Node/Express/Socket.IO -> SQLite room/mission/sensor; private Red truth vs public Blue observations |
| 3 | **Red Team Scenario Builder** | Actual Red portal screenshot with sensitive URL fragment cropped; hazard/decoy palette, room code and Challenge/Live |
| 4 | **Blue Team Mission Planner and Virtual Drone** | Actual grid/manual route preview; Overview/Follow/Top-Down, controls and speed; no real drone claim |
| 5 | **Simulated Detection and Candidate Mapping** | Actual swept area and C1/C2 pins; radii and Basic/Advanced rules; candidates are not confirmed hazards |
| 6 | **Post-Mission Reveal, Evaluation and Report** | Actual frozen results view **once MG-010 exists**; TP/FP/FN/UNSCANNED, precision/recall, report preview |
| 7 | **Engineering Decisions, Limitations and Future Scope** | Server authority, hidden truth, deterministic seed, Live timing; real CV/hardware with harmless surrogates only as future work |

**Do not draw a "demo result" screenshot or place a claim of PDF export on slide 6 until MG-010 actually implements and Rahil validates it.** Use clearly marked wireframe/mockup if preparing slides before then.

### Live 5–7 minute talk track (planned timings)

**0:00–0:40 — Opening and problem.** Explain that the aim is to teach a virtual aerial survey workflow and compare simulated observations against hidden fictional ground truth. State plainly: **no real landmine sensor or safety certification**.

**0:40–1:20 — Architecture.** Red and Blue use separate browser views, same server-owned 200 × 200 virtual-unit world. SQLite stores private objects; Blue only receives public mission data and sensor-generated candidate events. One server drives the drone and makes the synthetic decisions.

**1:20–2:10 — Red creates a scenario.** Create a room, add different virtual hazards and a harmless decoy, intentionally leave one target outside the intended route, choose CHALLENGE and lock. Share **only public defender join code/link**. Do not project/copy the private attacker token fragment.

**2:10–3:10 — Blue plans and starts.** Join on separate device or fallback second tab, confirm identical terrain without Red objects. Preview a manual or grid route (choose the option actually rehearsed), choose BASIC / STANDARD for the guaranteed demo, start. Explain fictional sensor radius **10 virtual units**.

**3:10–4:20 — Flight and sensing.** Show virtual drone, Pause/Resume, 2x, one alternate camera view, then candidate C1 appearing only after the radius sweeps it. Open the candidate detail and explain it is a simulation-generated observation, not a confirmed mine. Do not imply the unflown region was scanned.

**4:20–5:45 — Results (after MG-010).** Let the flight complete or stop intentionally. Click **Reveal & Compare**. Point to the distinction between **detected**, **missed within actually scanned area** (Advanced only), and **never scanned**. Show N/A-safe precision/recall, estimated virtual coverage, and actual downloadable or print-to-PDF report. Do not quote hardcoded metric values; read the actual computed result.

**5:45–6:30 — What we engineered and limits.** Highlight room isolation, role-filtered data, deterministic virtual sensor, time-aware Live edits and reproducibility. Mention no real sensor validation, no measured field accuracy, no real minefield clearance, and optional future experiments with harmless surrogates. Invite questions.

### Honest verbal responses to common faculty questions

- **"Does it actually detect a buried landmine?"** — No. The BURIED label is fictional; Basic detection is a simulator rule, not RGB/thermal/LiDAR subsurface capability.
- **"Where is the AI model?"** — V0.1 core uses deterministic virtual proximity and seeded probabilistic rules, **not a trained ML model**. A separately validated harmless-surrogate CV model is future work.
- **"Why does the Blue Team not see all targets?"** — Ground truth stays in server-side private room state; only a sensor-generated candidate is sent when the simulated swept footprint intersects an eligible object.
- **"Is Advanced 90% accurate?"** — No. 0.90 is a configured fictional event probability for the SURFACE category, not an empirical performance measurement. The mission results report realized synthetic counts.
- **"What is the difference between missed and unscanned?"** — Missed = active virtual hazard actually entered the swept footprint but yielded no candidate. Unscanned = never eligible on the actually flown path while active.
- **"What does 100% coverage mean?"** — At most an estimated fraction of the **chosen virtual grid rectangle** reached by the simulated footprint, not that any real ground is safe.
- **"What if the attacker moves an object while flying?"** — Live edits take effect from the actual simulation event time; no retroactive detection. Each stable object gets at most one sensor decision per mission.
- **"Can you run on two devices?"** — The app is designed for separate browsers, LAN and online tunnel; **physical two-device/phone/network verification belongs to MG-011**. Claim live physical testing only after Rahil completes it.
- **"Can you export a PDF?"** — Only say **yes** after MG-010 implements and genuinely tests PDF download. Otherwise show the verified print-to-PDF fallback and disclose it precisely.
- **"What happens if the flight is stopped midway?"** — The report records `STOPPED_EARLY`, actual partial distance and coverage, and keeps unvisited hazards in UNSCANNED rather than pretending they were missed or cleared.

## 9. Safe demonstration fixtures and fallback plan

The following are **illustrative fictional scenarios**, not screenshots or predetermined PASS outcomes:

- **ALPHA / Basic / Challenge:** Surface/obscured/buried virtual hazards and one ROCK decoy, deliberately one hazard outside the *actually flown* path. Use a route for which actual MG-008 code emits candidates only when swept; the final report should show at least one UNSCANNED hazard if that is what the route truly produces. Exact values must come from the engine.
- **BRAVO / Advanced / Challenge:** Seeded probabilistic scan with synthetic misses and possible decoy false alarms. The faculty demo must not promise a miss/FP unless the chosen persisted seed/ID fixture genuinely produces it. Do not fake "90% accuracy."
- **CHARLIE / Live:** One hazard at start, create/move another after the flight begins. Report effective simulation times and exclude retroactive detections. Highlight the one-decision-per-object limitation.

**Fail-safe presentation order:** ALPHA Basic/Challenge on one laptop -> separate devices when MG-011 really verifies them -> switch camera once -> let a real virtual candidate appear -> finish or intentionally STOP and reveal -> print/download the actual result.

If internet fails, use Rahil-tested LAN fallback once MG-011 confirms it; if a phone fails, use two tabs; if Advanced is unstable, use Basic; if Live is unstable, use locked Challenge; if direct PDF fails, use honest Print / Save PDF. Do not claim untested fallbacks as guaranteed working.

**Privacy preparation for projector:** use public defender code/URL; keep attacker private link masked, hide browser address bar during Red demo, avoid capturing token fragments in screenshots, sanitize all sample exports and GitHub evidence. Put no real active room/private links in slides.

## 10. MG-010 acceptance matrix — Rahil must implement, run and record

**These are proposed acceptance criteria, not executed tests.** Rahil owns `tasks/evidence/MG-010.md` and must include actual commands, observed output, device/browser versions, screenshots of reports and known limitations. This document creates **no** software PASS evidence.

| ID | Given / test action | Expected result | Priority |
|---|---|---|---|
| P01 | No mission, request results/export | Safe 403/409/404 with **no** private truth | P0 |
| P02 | RUNNING mission, GET results / download URL directly | Server denies truth/export; candidates remain public | P0 |
| P03 | PAUSED mission, GET results and POST reveal | Denied server-side; not a frontend-only restriction | P0 |
| P04 | FINISHED mission before reveal, GET results/export | Denied; clicking STOP or refresh does not auto-reveal | P0 |
| P05 | FINISHED + explicit Reveal & Compare | Server persists REVEALED result; matching room/mission only | P0 |
| P06 | Repeated POST reveal or reload | Idempotent same report ID, scores, truth and timestamps; no new sensing | P0 |
| P07 | Mission ID from room A requested through room B | Not found/denied; no cross-room report or token leak | P0 |
| P08 | After NEW_MISSION, view prior report by its own ID | Historical frozen result unchanged; new mission not revealed | P1 |
| P09 | Basic one scanned SURFACE | TP=1, FP=0, FN=0; 1 candidate; correct truth match | P0 |
| P10 | Basic scanned BURIED and scanned ROCK decoy | BURIED yields TP solely as a simulation rule; decoy ignored, FP=0 | P0 |
| P11 | Basic one scanned hazard, one outside actual sweep | TP=1, FN=0, UNSCANNED=1, recall 100% **of eligible only** | P0 |
| P12 | Advanced seeded miss of eligible hazard | FN=1; no candidate; precision N/A if no other candidates | P0 |
| P13 | Advanced seeded decoy false alarm | FP=1, no bogus TP, public candidate pre-reveal had no false-alarm label | P0 |
| P14 | TP=1, FP=1, FN=0 | Precision 50%, Recall 100% | P0 |
| P15 | No hazards, no candidates | TP=FP=FN=UNSCANNED=0, Precision/Recall **N/A** | P0 |
| P16 | FP=1 with zero eligible hazard | Precision 0%, Recall **N/A** | P0 |
| P17 | FN=1, no TP or FP | Recall 0%, Precision **N/A** | P0 |
| P18 | STOPPED_EARLY before a hazard | Actual partial distance and coverage; target UNSCANNED, not FN | P0 |
| P19 | Same route re-scans hazard and decoy | One private decision/candidate per object; no double-counted area | P0 |
| P20 | Live create behind drone, never revisited | No retroactive candidate; target UNSCANNED | P0 |
| P21 | Live move into future swept path | Eligible only after movement time; correct candidate and chronology | P0 |
| P22 | Live delete after detection | Historical TP persists in final result even though object absent from final Red list | P0 |
| P23 | Live delete before scan | Does not become an eligible FN; historical activity represented truthfully | P0 |
| P24 | Live object kind change / revisit | First-decision policy honored; historical classifications and notes explain any no-retry effect | P1 |
| P25 | Candidate review NEW vs REVIEWED | No change to any metric or private truth disposition | P0 |
| P26 | Grid full virtual survey | Estimated grid coverage percent within 0–100 and reconciles with MG-008 `CoverageGrid` | P0 |
| P27 | Manual route without declared region | Estimated swept area in units², coverage percentage = N/A | P0 |
| P28 | STOPPED_EARLY and planned grid rectangle | Actual distance/area not replaced with planned full route/rectangle | P0 |
| P29 | Open rendered report on laptop/projector | A4 legible text, tables do not overflow, legend works in grayscale | P0 |
| P30 | Download generated PDF OR verified Print / Save PDF fallback | Correct usable file/print pages, not HTML renamed `.pdf` | P0 |
| P31 | Reopen a report offline | Generated file contains required data and no internet-only WebGL assets | P0 |
| P32 | Compare report, API and UI values | Same mission ID, score counts, percentages, candidates, completion reason | P0 |
| P33 | Search PDF/HTML/meta/URLs for attacker capability | No raw token, private link fragment, credentials or other room data | P0 |
| P34 | Blue before reveal inspect all HTTP/Socket/DOM/localStorage | No undiscovered object identity/type/coordinates/decisions; MG-008 privacy preserved | P0 |
| P35 | Candidate source vs report match | Each emitted candidate maps to exactly one private object and TP or FP | P0 |
| P36 | Two tabs/reconnect after reveal | Same frozen results, no duplication and correct visible gate | P0 |
| P37 | Malformed mission ID, repeated export/large scenario | Safe errors, bounded report generation, no unhandled crash or partial disclosure | P0 |
| P38 | All existing MG-004–MG-008 tests | No regression in Red editing, route/cameras, virtual sensing or role isolation | P0 |
| P39 | UI/report text audit | No claim of real mine detection, real buried sensing, "area cleared", or trained ML accuracy | P0 |
| P40 | Explicitly do real physical 2-device/network test | **MG-011 scope**, may be deferred honestly during MG-010 | Later |

**MG-010 completion gate:** P01–P23, P25–P39 (excluding any explicitly documented P1 and Later cases) must be genuinely exercised with recorded outcomes and committed evidence. A PDF-specific failure is acceptable only if the correctly labelled Print / Save PDF fallback is verified; do not claim "direct PDF download" when not built. Missing core metrics, truth gate or usable export means **MG-010 remains IN_PROGRESS**, not DONE.

### Test evidence format for Rahil

Record:
- `Task: MG-010`, `Owner: Rahil`, `Tester: Rahil`, `Result: PASS` only if truly earned.
- Actual OS, Node/browser versions and commands (`npm run typecheck`, `npm run build`, `npm test`, `npm run test:e2e` and report/PDF tests as applicable), exact test counts and actual outputs.
- Backend/HTTP authorization tests **including direct pre-reveal requests**, not only hidden buttons.
- Real report samples/screenshots with fictional sanitized data, visually inspected pages, print/PDF validity, grayscale check.
- Explicitly deferred features and limits; no invented screenshot, pass count or example metrics substituted for real engine output.
- GitHub code/docs/evidence/status commit URLs; no local-only finished delivery.

## 11. Explicit handoff and sequential task gate

**MG-009 deliverable:** This file, `docs/specs/REPORT_PRESENTATION.md`, committed on GitHub `main` and referenced in `tasks/status.json` as **MG-009 DONE**. It is a **DOC task**, not a software implementation or testing assignment.

After GitHub confirms MG-009 DONE:
1. **MG-010 — Rahil, BUILD** becomes READY. Read this document, the latest MG-008 source, and `docs/specs/DETECTION_ACCEPTANCE.md`.
2. Rahil runs `node scripts/task-gate.mjs validate`, `node scripts/task-gate.mjs next`, `node scripts/task-gate.mjs check MG-010`, then `start MG-010 Rahil`; commit/push IN_PROGRESS before implementation.
3. Rahil implements scoring/reveal/print or PDF, tests, adds truthful `tasks/evidence/MG-010.md`, updates `docs/API_CONTRACT.md`, and commits DONE only if the acceptance gate passes.
4. After MG-010, **MG-011** is also Rahil's next sequential task: online and LAN two-device validation. No skipped task.
5. **MG-012 — Shabaz, DOC** remains blocked until MG-011 is DONE. That future document expands this presentation outline into final faculty speaking notes and Q&A grounded in actually tested features.
6. **MG-013 — Rahil, BUILD** then handles final release QA and stabilization.

**Security and ethical boundary remains unchanged:** private Red control token never belongs in reports, slides, screenshots or Git history; all coordinates/detections are fictional; no report proves safety or actual hardware/ML detection.

**Only Rahil runs application tests.** MG-009 provides the contract and demonstration outline; it does not manufacture test results, completed slides, a generated PDF, or any new verified software behavior.
