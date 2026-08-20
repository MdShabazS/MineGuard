# MASTER_PROJECT_CONTEXT.md

> **MineGuard — Master Project Context & Continuity Document**
> The single source of truth. If the working conversation is lost, read this first.

---

## 1. Document Control

| Field | Value |
|---|---|
| Document | MASTER_PROJECT_CONTEXT.md |
| Version | 0.1 |
| Status | **PRE-COMPONENT-SELECTION / GUIDE-DECISION PENDING** |
| Date created | 2026-08-20 |
| Maintained by | Shabaz (research/reconnaissance coordination) |
| Supersedes | — |
| Project phase | Reconnaissance / Requirements / Deep Component Research (pre-development) |
| Repository state | Not yet scaffolded (planning only) |

**Status legend (used throughout):**
`[CONFIRMED]` current decision · `[PROPOSED]` suggested, not decided · `[SHORTLISTED]` candidate under active consideration · `[PENDING]` unresolved / awaiting decision or verification · `[UNKNOWN]` unverified · `[REJECTED]` ruled out · `[EXISTING]` part of the existing drone platform (excluded from budgets) · `[HISTORICAL]` from Phase-1, kept as record · `[SUPERSEDED]` Phase-1 item replaced by a current position.

---

## 2. Purpose

This document preserves the **complete state** of the MineGuard project — decisions, rejected ideas, pending questions, contradictions, evidence, and reasoning — so that a **new assistant or team member can reconstruct the project without the original conversation.** It deliberately does **not** aggressively summarize; continuity is prioritized over brevity.

---

## 3. How to Use This Document

1. Read this file **in full** before acting.
2. Then read `README.md` and the research/decision documents (once created).
3. Respect the status tags: `[CONFIRMED]` = act on it; `[PENDING]`/`[UNKNOWN]` = do not assume; `[HISTORICAL]`/`[SUPERSEDED]` = record only.
4. **Never** convert `[PENDING]` → `[CONFIRMED]` without a decision or evidence.
5. **Never** silently change scope, objective, or a confirmed constraint.
6. Update the Change Log (§76) whenever a major decision changes.

---

## 4. Project Identity

| Field | Value |
|---|---|
| Project name | **MineGuard** |
| Subtitle (historical) | *Autonomous Aerial Landmine Detection System* `[HISTORICAL]` |
| Nature | Drone-assisted landmine/UXO **detection and mapping research prototype** |
| Institution | Dept. of Electronics & Communication Engineering, Ballari Institute of Technology & Management (Autonomous, under VTU) `[HISTORICAL — from Phase-1 deck]` |
| Guide | Dr. Sadyojatha K.M (Professor & HOD, ECE) `[HISTORICAL — verify still current]` |
| Coordinator | Dr. Naseeruddin (Asst. HOD, ECE) `[HISTORICAL — verify still current]` |

---

## 5. Project Vision

MineGuard aims to **reduce human risk in landmine/UXO survey** by using an autonomous drone carrying an onboard computer and sensors to **detect and map mine threats**, recording data reliably offline and optionally presenting it on a dashboard. **The precise detection scope (surface vs subsurface) is currently under guide review — see §17–§18.** The vision is not to be over-claimed until scope is fixed.

---

## 6. Team `[CONFIRMED roster — from Phase-1 deck]`

| # | Member | USN (historical) | Current known responsibility |
|---|---|---|---|
| 1 | A Mohammed Rahil | 3BR23EC001 | **Raspberry Pi physical deployment/operation, commands, code dumping, hardware implementation & testing** `[CONFIRMED]` |
| 2 | B I Mohammed Iqlas | 3BR23EC015 | TBD by poll |
| 3 | Danish | 3BR23EC038 | TBD by poll |
| 4 | G Sree Vidya | 3BR23EC045 | TBD by poll |
| 5 | Mohammed Shabaz S | 3BR23EC102 | **Research/reconnaissance coordination; decides model-training assignments** `[CONFIRMED]` |
| 6 | Shaistha Tabasum | 3BR23EC149 | TBD by poll |

- Team size: **6** `[CONFIRMED]`.
- Development domains (backend / AI-ML / CV / dashboard / data) chosen later by **team poll** `[CONFIRMED as process]`.
- Multiple members may share a domain; everyone is new to parts of the system `[CONFIRMED]`.

---

## 7. Current Project Phase

**Pre-development.** Workflow: **Research → Problem Definition → Requirements → Verification → Architecture → Documentation → Development → Testing → Validation → Presentation.** Development must **not** begin prematurely `[CONFIRMED]`. Current position: between *Deep Component Research* and *Scope Verification (guide decision)*.

---

## 8. Historical Phase-1 Baseline `[HISTORICAL]`

From the Phase-1 review deck (`Review1Phase1.pptx`) — **preserved, not authoritative:**

- **Objective (historical):** *"detect **subsurface** landmines accurately."* `[HISTORICAL / conflict — see §17]`
- **Sensing (historical):** **metal-detector coil + thermal camera + sensor fusion.** `[SUPERSEDED — sensors not finalized]`
- **Compute (historical):** *"Components selected (**ESP32**, sensors, GPS, RF)."* `[SUPERSEDED — compute is Raspberry Pi 4B; FC is CUAV V6+]`
- **AI (historical):** **CNN** classification. `[SUPERSEDED — no model assumed]`
- **GPS (historical):** separate GPS module. `[SUPERSEDED/PENDING — geotag source to be FC telemetry vs Pi GPS]`
- **Comms (historical):** emphasis on **real-time transmission / ground control station dashboard.** `[SUPERSEDED — offline-first is primary; dashboard secondary]`
- **Feasibility claim (historical):** *"low-cost, feasible within one year."* `[HISTORICAL — no timeline currently confirmed]`
- Literature survey (6 papers): thermal UAV; pulse-induction MD; UAV-GPR; multi-sensor fusion; CNN classification; waypoint grid navigation. `[HISTORICAL — retained as references]`
- Methodology & System Design slides were **empty placeholders** — no inherited design exists. `[HISTORICAL]`

**Why the conflict exists:** Phase-1 was an early academic review that asserted selections before physics/feasibility research. The post-Phase-1 baseline (this document) supersedes those selections but preserves them as history.

---

## 9. Current Project Baseline

The **post-Phase-1 requirements are the current baseline** and take priority over the Phase-1 deck. All items in §10 are current unless tagged otherwise.

---

## 10. Confirmed Decisions `[CONFIRMED]`

**Platform & compute**
1. Existing autonomous drone platform is available. `[EXISTING]`
2. Flight controller: **CUAV V6+.** `[EXISTING]`
3. **QGroundControl** used for mission planning.
4. **Raspberry Pi 4 Model B 2 GB** is the current onboard computer.
5. Raspberry Pi 5 is **not** the current selection.
6. Budget constraints drove the Pi 4B 2GB decision.
7. **Pi combined-workload benchmarking is mandatory** before technical acceptance.

**FC interface**
8. Pi intends to **READ** telemetry from the FC.
9. FC interaction is **READ-ONLY.**
10. **No** Pi→FC flight-command/config writing is intended.
11. Actual FC interface must be **bench tested.**
12. **Bench testing precedes flight testing.**

**Mission**
13. Initial mission concept: **grid / zig-zag survey.** `[PROPOSED pattern; process CONFIRMED]`
14. **~5 m is only an initial test altitude.**
15. Final altitude **not decided.**
16. Final speed **not decided.**
17. Final line spacing **not decided.**
18. Sensor coverage must influence line spacing.
19. Sensor overlap must be researched.
20. Sensors/camera intended to face **downward/perpendicular.**

**Detection / AI (open)**
21. Detection sensor selection **not finalized.**
22. AI/ML model **not finalized.**

**Data & operations**
23. **Offline-first operation is primary.**
24. Local Pi recording must continue **without internet.**
25. Internet is **secondary.**
26. Online dashboard should operate when internet exists.
27. Dashboard should update **near real-time** when online.
28. Shared dashboard link accessible from a laptop/browser.
29. Dashboard indicates **offline/no-internet** state on connectivity loss.
30. **Last successful communication** time must be available.
31. Pi should attempt reconnection where technically feasible.
32. After landing, laptop can connect to Pi via **USB/OTG.**
33. Laptop-side script retrieves flight data.
34. Previous flight data **must not be deleted immediately after landing.**
35. Previous flight data deleted/replaced **only when the next flight actually begins.**
36. Exact **safe-deletion trigger is PENDING.**
37. Crash/restart/recovery requirements are important.

**Power / storage / existing video**
38. **Power bank** being considered for Pi power. `[PROPOSED]`
39. **No separate UPS** currently planned.
40. Storage design **not finalized.**
41. **H12 work is PENDING.**
42. Existing camera/video interfaces must be **physically verified.**

**Team / workflow**
43. Team has **six** members.
44. Rahil handles Pi physical deployment/operation & hardware implementation/testing.
45. Shabaz coordinates research/reconnaissance.
46. Model-training assignments decided later.
47. Development domains via **team poll.**
48. Everyone is new to parts of the system.
49. Future implementation guidance must be **step-by-step.**
50. Separate learning notes will be created later (impl prompts stay operational).

**Testing**
51. **Testing is mandatory.**
52. Testing will be **progressive.**
53. **Controlled testing preferred.**
54. **Safe inert/simulated targets** must be used.
55. Exact testing metrics decided **after** component/architecture selection.

**Downstream sequencing**
56. Exact dashboard widgets decided **after** data architecture is known.
57. Exact architecture decided **after** component selection and budget analysis.

**Budgets**
58. **Four budget configurations required.**
59. **Existing drone platform components excluded** from all four budgets.
60. Each budget = **complete operational BOM** of new MineGuard components/accessories (not sensors only).
61. Each line: component name, exact model, quantity, price, total, purpose, specs, source, required accessories, integration info.
62. Each component later documented with expected output, advantages, drawbacks, limitations, evidence.
63. **Prices researched, not guessed.**
64. Specs supported by reliable sources.

---

## 11. Proposed Decisions `[PROPOSED]`
- Grid/zig-zag survey pattern (concept, not parameterized).
- ~5 m as a starting test altitude.
- Power bank as Pi power source.
- USB/OTG post-landing retrieval via a single laptop-side script.
- RGB-led surface detection direction (contingent on scope — §17).

---

## 12. Pending Decisions `[PENDING]`
- **Scope decision A/B/C (guide).** — §18
- Final altitude, speed, line spacing, overlap, coverage.
- Detection sensor set; sensor fusion architecture.
- AI/ML approach and dataset strategy.
- FC↔Pi exact interface/port; read-only wiring method.
- Safe data-lifecycle deletion trigger; partial-file handling.
- Power architecture (bank vs UPS; runtime).
- Storage medium & filesystem.
- Real-time communication protocol; offline data format/transfer.
- H12 / existing video-feed availability and role.
- Timeline, budgets, license, role assignments.

---

## 13. Unknowns `[UNKNOWN]`
- Exact models of any thermal camera, RGB camera, LiDAR, metal detector, magnetometer, power system, 4G module.
- H12 / R12 Pro specifications.
- Indian prices for several shortlisted items.
- Whether the current downward camera is `[EXISTING]` (excluded) or a new in-scope sensor.
- Real soil/environment conditions at the test site.

---

## 14. Superseded Decisions `[SUPERSEDED]`
- ESP32 as compute → replaced by Raspberry Pi 4B + CUAV V6+.
- "Metal detector + thermal + fusion finalized" → sensors not finalized.
- CNN assumed → no model assumed.
- Real-time transmission as primary → offline-first primary.
- Separate GPS module (assumed) → geotag source PENDING (likely FC telemetry).

---

## 15. Problem Statement `[HISTORICAL wording, still broadly valid]`
Landmines/UXO in post-conflict areas threaten life and restrict land use. Manual detection is slow, costly, and dangerous, still requiring human presence in hazardous zones. There is a need for a safer, faster, more accurate survey method. An autonomous drone-based solution can survey, geo-tag, and map threats while reducing human risk. *(Note: "detect subsurface" claim is under scope review — §17.)*

---

## 16. Original Objective `[HISTORICAL]`
To design an autonomous drone that scans suspected fields on a pre-programmed path; **detect subsurface landmines** via metal detector + thermal + fusion; geo-tag and map threats via GPS; display real-time data on a ground station; eliminate human exposure. **Preserved as history; partially superseded.**

---

## 17. Current Scope Conflict

The deep research surfaced a physics-level conflict between the **aerial platform** and the **subsurface objective:**

- **GPR + metal detector** are established for **subsurface** detection but require **ground proximity.**
- **Conventional metal-detector coils cannot operate from ~5 m altitude** (cm-scale induction).
- **Magnetometer-based aerial detection** has **low-altitude constraints** (~1–2 m; ~75% at 6 m), only sees metal-cased mines, and suffers drone self-EMI.
- **RGB and thermal are surface-sensing modalities** (RGB ~94.8% on surface mines; thermal ~88%, diurnal-dependent).
- **Therefore the "aerial + subsurface" pairing requires scope/platform clarification.**

The objective has **not** been changed. This is documented, not decided.

---

## 18. Guide Decision Required

**`[SCOPE DECISION — GUIDE REQUIRED]`** — not confirmed; guide must choose:

- **Option A** — Keep aerial platform; **redefine objective as surface/near-surface anomaly detection & mapping.**
- **Option B** — Keep subsurface objective; **change platform/sensing to ground-proximity** (GPR/MD) — effectively a different, costlier project.
- **Option C** — Keep aerial platform as a prototype **explicitly defined as surface/near-surface detection & mapping now, with subsurface as documented future work.**

Assistant recommendation on record: **Option C** `[REC — NOT a decision]` (physically honest, buildable, dataset-supported, preserves ambition as future work). **None of A/B/C is `[CONFIRMED]`.**

---

## 19. Existing Drone Platform `[EXISTING — excluded from budgets]`
An autonomous drone capable of waypoint/survey missions with available telemetry. Its flight-platform components (airframe, motors, ESCs, FC, radios, GPS on the FC, battery, etc.) are **excluded from all four budgets.**

## 20. CUAV V6+ `[EXISTING]`
Pixhawk-standard flight controller. Intended as a **read-only telemetry source** for the Pi. Exact TELEM/UART port, pinout, and logic levels for the specific V6+ board are **`[PENDING]` bench verification** (documentation found is for the related V6X; standard Pixhawk TELEM layout is expected but must be confirmed).

## 21. QGroundControl `[CONFIRMED]`
Used for mission planning/control on the existing platform. MineGuard does not modify FC configuration.

## 22. Mission Planning `[CONFIRMED concept]`
QGC-generated survey missions define the flight path; MineGuard records sensor/telemetry data along it.

## 23. Survey Pattern `[PROPOSED]`
Grid / zig-zag survey. Parameters (below) undecided.

## 24. Altitude `[PENDING]`
~5 m is an **initial test** value only. Final altitude depends on sensor GSD/PoD and (if any) EMI-sensor constraints.

## 25. Speed `[PENDING]`
Undecided; affects motion blur (favouring global-shutter RGB) and thermal dwell time.

## 26. Coverage `[PENDING]`
Line spacing/overlap must be derived from the chosen sensor's ground footprint; not yet computable.

---

## 27. Detection Technologies (summary matrix)

| Tech | Regime | Aerial-suitable | Status |
|---|---|---|---|
| RGB | Surface | Yes | `[SHORTLISTED]` |
| Thermal | Surface (thermal contrast) | Yes | `[SHORTLISTED]` |
| LiDAR | Mapping/altitude (not detection) | Yes | `[SHORTLISTED as mapping aid]` |
| Metal-detector coil | Subsurface, cm-proximity | No | `[REJECTED for 5 m aerial]` |
| Magnetometer | Metal-cased, low-alt | Marginal | `[PROPOSED — scope-dependent]` |
| GPR | Subsurface, ground-coupled | No | `[REJECTED for current aerial concept]` |
| Hyperspectral | Surface spectral | Yes | `[PROPOSED — not preferred v1]` |
| Multispectral | Surface spectral | Yes | `[PROPOSED — not preferred v1]` |

## 28. RGB Camera `[SHORTLISTED]`
- Strong candidate for surface detection/mapping (RGB ~94.8% on surface PFM-1).
- **Global-shutter (Sony IMX296, ~$50)** advantageous for moving-drone imagery (no rolling distortion/motion blur).
- **Pi Camera Module 3 (IMX708, ~$25, autofocus)** remains an alternative (higher res; rolling shutter).
- Final camera **not selected.** GSD to be computed once altitude/lens fixed.

## 29. Thermal `[SHORTLISTED]`
- Detects **surface thermal contrast**; performance depends on time-of-day/weather/soil moisture (best in evening/diurnal window).
- **Does not directly prove buried-mine detection.**
- **Lepton-class (160×120, radiometric, ~$175–199)** is a research candidate.
- **MLX90640 (32×24, ₹5,000–6,220)** too low-res for serious aerial mine identification.
- Final thermal **not selected.**

## 30. LiDAR `[SHORTLISTED as mapping aid]`
- Primarily **altitude/mapping/terrain**, **not** a direct mine detector.
- **Single-point (Benewake TFmini-S/Plus, ₹2,500–4,000)** may aid AGL/coverage consistency.
- **3D (Livox, ₹3–20 lakh, 500 g–2 kg)** likely too heavy/expensive.
- **RPLIDAR A1** is horizontal-plane — wrong geometry for downward mapping.
- Final LiDAR **not selected.**

## 31. Metal Detection `[REJECTED for current aerial concept]`
- Conventional coil at ~5 m is **not physically credible.**
- **Do not include as a confirmed component.**
- Reconsider only if scope changes to ground-proximity.

## 32. Magnetometer `[PROPOSED — scope-dependent]`
- Aerial magnetometry needs **~1–2 m altitude**; detects metal-cased mines only; drone self-EMI risk.
- Currently **background/research** possibility, not a v1 component.

## 33. GPR `[REJECTED for current aerial concept]`
- Strong **subsurface** technology but **ground-proximity**; incompatible with 5 m aerial.
- Excluded from current aerial budgets unless scope changes.

## 34. Hyperspectral `[PROPOSED — not preferred v1]`
- Surface spectral discrimination; **high data/processing burden**; marginal gain over RGB for surface v1; Pi-4B cannot process in real time.

## 35. Multispectral `[PROPOSED — not preferred v1]`
- Lighter than hyperspectral; still surface-only; optional future experiment.

## 36. Sensor Fusion `[PENDING]`
- **RGB + thermal** = meaningful detection candidate (evaluate individually first; time-sync required).
- **RGB + single-point LiDAR** = low-risk mapping/altitude aid.
- More sensors ⇒ more weight/power/bandwidth/Pi load; **fusion is not automatically better.**
- Final fusion architecture pending.

## 37. AI/ML `[PENDING]`
- **No model assumed** (not YOLO/CNN/Transformer by default).
- Approach chosen **after** modality is fixed (e.g., ACE/matched-filter/light spectral NN for surface).
- Public datasets preferred; **training on laptop/backend, not the Pi.**
- Testing compulsory before any model is accepted.

## 38. Dataset Strategy `[PENDING — surface-focused options found]`
- SULAND_v2 (RGB surface PFM-1/PMA-2), Binghamton Scatterable Landmine (RGB+thermal), UAV VNIR hyperspectral benchmark, PFM-1 HSI benchmark, MineInsight (multi-sensor, non-UAV).
- All are **surface-mine** datasets — consistent with Options A/C, unsuitable for a "buried" objective.

---

## 39. Raspberry Pi 4B 2GB `[CONFIRMED platform, capacity PENDING benchmark]`
- Telemetry + local logging: **manageable.**
- Single-sensor capture: manageable; **RGB+thermal+comms+AI simultaneously: significant constraint.**
- **2 GB RAM** is the binding limit; **single CSI port** is an integration constraint; USB bandwidth shared.
- **No AI training on the Pi**; heavy processing on the **laptop after flight.**
- **Final workload acceptance requires physical benchmarking.**

## 40. FC Telemetry `[CONFIRMED intent / PENDING interface]`
Readable via MAVLink (pymavlink/MAVSDK) over a TELEM UART → Pi (`/dev/ttyAMA0`): GPS, altitude, attitude, flight mode, armed state, mission/waypoint status. Exact port/pinout **PENDING** bench verification.

## 41. Read-Only Constraint `[CONFIRMED]`
Pi only **reads**; never writes commands/params to the FC. Consider an **RX-only wiring tap** to guarantee this physically.

## 42. Bench Verification `[CONFIRMED process]`
All FC/interface/power/workload assumptions must be **bench-verified before flight.**

---

## 43. Offline-First Architecture Concept `[CONFIRMED principle]`
Flight → sensors → Pi → **local recording** (no internet needed) → land → laptop via USB/OTG → retrieval script → complete flight package → local analysis/dashboard.

## 44. Online Dashboard (Operational) `[CONFIRMED as secondary]`
When internet exists: Pi → backend → web dashboard (shared link, near-real-time). Shows **offline/no-internet** state and **last successful communication**; Pi attempts reconnection where feasible. **Local recording continues regardless.**

## 45. Team Lead Dashboard (Project Progress) `[CONFIRMED requirement, widgets PENDING]`
Shows overall completion %, six-member progress, completed/pending/blocked tasks, remarks, recent activity, current milestone/phase, testing/review status. Team Lead = detailed view; Guide = read-only summary. **Task progress ≠ task acceptance; unique Task IDs; data from structured repo/task data, not commits alone.**

## 46. Internet Loss Handling `[CONFIRMED]`
Internet loss must **never** stop detection/recording. Dashboard reflects offline status + last-comms time.

## 47. Post-Flight Data Retrieval `[CONFIRMED concept]`
Laptop connects via USB/OTG; a single laptop-side script retrieves the full package. Retrieval **copies**, does not delete.

## 48. Data Lifecycle `[CONFIRMED intent / trigger PENDING]`
- Flight N data **persists** after landing; laptop retrieval does not delete it.
- Flight N+1: old data deleted/replaced **only when the next flight actually begins**, per the final safe rule.
- Deletion must **not** occur merely because a script ran.
- Protect against deleting Flight N if Flight N+1 aborts before valid data exists.
- **Exact trigger must be verified** (e.g., FC armed + takeoff detected; retain until first valid new write).

## 49. Crash / Recovery `[PENDING investigation]`
Investigate auto-restart of crashed detection services, reboot recovery, recovery of already-written data, safe partial-file handling, auto-start on boot, and health logging (CPU/RAM/temp/storage/connectivity/app status).

## 50. Storage `[PENDING]`
Likely high-endurance SD (OS) + USB-3 SSD (mission data); journaled FS; atomic file finalization; per-flight manifest. Capacity/write-speed computed once sensors fixed.

## 51. Power `[PENDING]`
Pi 4B needs **5V/3A**; undervoltage/brownout is a real risk. Estimated system draw **~8 W typical → ~15–20 W peak** (to be bench-measured). Power bank must sustain ≥3 A with seamless switchover; **no UPS planned** (brownout risk must be tested). Weight/heat count against payload.

## 52. H12 / Existing Video System `[PENDING]`
H12/R12 Pro specs **unverified — do not assume or architect around them.** Verify: any tappable video/data output & format; whether the current camera is `[EXISTING]` or in-scope; RF coexistence; read-only compatibility.

---

## 53. Testing Philosophy `[CONFIRMED]`
Testing is mandatory; demonstration alone is insufficient for finalization. Independent/peer verification + Team Lead review where applicable.

## 54. Controlled Testing `[CONFIRMED]`
Preferred; use **safe inert/simulated targets** only — never live ordnance.

## 55. Progressive Testing `[CONFIRMED]`
Controlled → ground → progressive flight → sensor-specific → altitude/speed → failure/recovery → integration → final validation.

## 56. Ground Truth `[CONFIRMED]`
Use known surrogate target positions to compute quantitative detection metrics.

## 57. Testing Metrics — PENDING `[PENDING]`
Exact metrics (PoD, false-alarm rate, localization error, etc.) decided after component/architecture selection.

---

## 58. Four Budget Strategy `[CONFIRMED requirement — NOT YET CREATED]`
- **Budget 1 — TOP QUALITY**
- **Budget 2 — FULL FEATURED**
- **Budget 3 — THERMAL ONLY**
- **Budget 4 — CAMERA ONLY**

Each = complete BOM of everything required **beyond the existing drone.** Existing drone platform **excluded** from all four.

## 59. Complete BOM Requirements `[CONFIRMED]`
Not sensors only. Candidate categories (include only if technically justified): Raspberry Pi, storage, cooling, power, power cables, sensors, sensor interface boards, USB hub, FC interface cable, UART/USB adapters, regulators/converters, communication modules, mounts, camera mounting, connectors, cables, data storage, required accessories, other integration hardware.

## 60. Component Evaluation Method `[CONFIRMED template]`
For every selected/shortlisted component document: Component · Exact model · Purpose · Expected input · Expected output · How it works in MineGuard · What it can detect · What it cannot detect · Advantages · Drawbacks · Limitations · Weight · Power · Interface · Pi compatibility · Processing burden · Data rate · Required accessories · Cost · Availability · Alternative · Evidence · **Status tag.**

## 61. Expected Output / Advantages / Drawbacks Framework `[CONFIRMED]`
Every component carries expected output, advantages, drawbacks, limitations, and evidence before acceptance.

## 62. Research Evidence Requirements `[CONFIRMED]`
Specs from official datasheets/manufacturer docs; distinguish official spec from retailer price; every important technical claim sourced.

## 63. Physical Verification Requirements `[CONFIRMED]`
Must be bench-verified before acceptance: CUAV V6+ read-only interface/port; USB/OTG retrieval; Pi combined-workload benchmark; power-bank sustained current + brownout behaviour; camera GSD at chosen altitude; SSD sustained write; H12/existing-camera feed; sensor weights/power on the real airframe.

---

## 64. Team Workflow `[CONFIRMED]`
Rahil = Pi hardware/deployment/testing. Shabaz = research/reconnaissance coordination + model-training assignment decisions. Other domains chosen by poll at development start. Multiple members per domain allowed.

## 65. Documentation Workflow `[CONFIRMED]`
Documentation-first. Every significant contribution eventually documented; professional record of who did what. Implementation prompts stay **operational/step-by-step**; teaching content goes to separate learning notes.

## 66. Development Workflow `[CONFIRMED]`
No development until reconnaissance/documentation is sufficiently complete and (for scope-critical work) the guide decision is made.

## 67. GitHub Rules `[PROPOSED]`
- Dashboard progress derives from **structured task data**, not commits alone.
- Unique **Task IDs**; progress ≠ acceptance.
- Branch for changes; commit/push only when instructed; document significant decisions.
- License **PENDING.**

---

## 68. Decision Register `[LIVING]`
| ID | Decision | Status | Note |
|---|---|---|---|
| D-001 | Compute = Pi 4B 2GB | `[CONFIRMED]` | budget-driven; benchmark required |
| D-002 | FC read-only telemetry | `[CONFIRMED]` | interface PENDING bench |
| D-003 | Offline-first primary | `[CONFIRMED]` | dashboard secondary |
| D-004 | Detection scope A/B/C | `[PENDING — guide]` | §18 |
| D-005 | Metal coil aerial | `[REJECTED]` | physics |
| D-006 | GPR aerial | `[REJECTED]` | ground-coupled |
| D-007 | Sensor set / fusion | `[PENDING]` | after scope |
| D-008 | AI approach | `[PENDING]` | after modality |
| D-009 | Power architecture | `[PENDING]` | bank vs UPS |
| D-010 | ESP32 compute (Phase-1) | `[SUPERSEDED]` | → Pi/CUAV |

## 69. Contradictions `[TRACKED]`
1. Aerial platform vs subsurface objective (**primary** — §17). 2. Phase-1 "sensors finalized" vs "not finalized." 3. ESP32 vs Pi/CUAV. 4. CNN assumed vs no-model. 5. Separate GPS vs FC-telemetry GPS. 6. Real-time-primary vs offline-first. 7. "One-year/low-cost" claim vs no confirmed timeline/budget.

## 70. Major Technical Risks
Subsurface/surface mismatch (#1); motion blur/rolling shutter; thermal time-of-day dependence; RGB+thermal on one CSI port + 2 GB RAM; drone self-EMI if any EMI sensor attempted; power brownout without UPS; FC interface unverified.

## 71. Major Budget Risks
Thermal (Lepton) and any 3D LiDAR dominate cost; hyperspectral would blow budget; several India prices unverified; risk of specifying incompatible accessories before bench verification.

## 72. Guide Questions `[ASK BEFORE COMPONENT SELECTION]`
1. Surface-laid (feasible) or buried (not aerially feasible) as the deliverable? 2. Is "subsurface" a hard requirement or restatable as future work (Option C)? 3. Must the existing aerial drone remain the platform? 4. Is detecting/mapping **surface anomalies** acceptable success for review? 5. Any magnetometer/metal/GPR work at all, even as a separate low-altitude experiment? 6. Is ~5 m flexible (magnetometer needs 1–2 m)? 7. If Option C, approve documenting subsurface as a future phase?

## 73. Open Questions `[PENDING]`
Altitude/speed/spacing/overlap; sensor set; AI approach; dataset; FC port; deletion trigger; power; storage; comms protocol; H12; timeline; budgets; license; roles.

## 74. Future Work `[PLANNED]`
Subsurface detection (GPR/MD, ground-proximity) as a future phase if Option C; hyperspectral/multispectral surface experiments; magnetometer low-altitude trial; onboard real-time AI on a stronger compute module.

## 75. Current Project Snapshot
**MineGuard is in pre-development.** Platform, compute (Pi 4B 2GB), read-only FC telemetry intent, and offline-first operation are `[CONFIRMED]`. **The detection scope (A/B/C) is the critical blocker awaiting the guide.** Sensors, AI, fusion, power, storage, mission parameters, and all four budgets are unresolved. Research shows aerial sensing is realistically **surface/near-surface**; metal coil and GPR are `[REJECTED]` for the 5 m aerial concept. No repository files, code, budgets, or component selections exist yet.

## 76. Change Log
| Version | Date | Change |
|---|---|---|
| 0.1 | 2026-08-20 | Initial Master Context created from post-Phase-1 baseline, planning prompts 1–2, deep component research (prompt 3), and scope decision-support (prompt 4). Scope A/B/C pending guide. |

---

## 77. Rules for Future ChatGPT / Claude / Codex Sessions

Any future assistant working on MineGuard **must:**

1. Read **MASTER_PROJECT_CONTEXT.md** first.
2. Read **README.md** next.
3. Read the relevant **research/decision documents.**
4. Treat **[CONFIRMED]** as current decisions.
5. Treat **[PENDING]** as unresolved.
6. Treat **[UNKNOWN]** as unverified.
7. Treat **[HISTORICAL]** as historical.
8. **Never** convert PENDING → CONFIRMED without evidence/decision.
9. **Never** silently change the project scope.
10. **Never** invent component specifications or prices.
11. Research current technical/pricing claims.
12. Verify hardware before assuming compatibility.
13. Preserve the **offline-first** requirement.
14. Preserve the **FC READ-ONLY** requirement.
15. Remember **existing drone components are excluded** from budgets.
16. Use **step-by-step** guidance for team members during implementation.
17. Document significant decisions.
18. Update the Master Context when major project decisions change.

*End of MASTER_PROJECT_CONTEXT.md (v0.1).*
