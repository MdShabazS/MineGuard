# MineGuard — Complete A-to-Z Project Discussion Record

> **PERSONAL REFERENCE · COMPONENTS / ARCHITECTURE / PIPELINE / DESIGN NOT FINAL · DEVELOPMENT NOT STARTED**
>
> Comprehensive record of everything discussed so far, organised A to Z. Nothing here is a final specification.
> Labels: `[VERIFIED]` `[RESEARCH FINDING]` `[INFERRED]` `[ESTIMATED]` `[PENDING]` `[UNKNOWN]`.
>
> *(This Markdown faithfully represents `MineGuard_A_to_Z_Project_Briefing.pdf`.)*

---

**A — Original project objective.** From the Phase-1 review deck [HISTORICAL]: an autonomous drone to scan suspected fields on a pre-programmed path and "detect subsurface landmines accurately" via metal detector + thermal + sensor fusion, geo-tag and map threats, and eliminate human exposure. This is preserved as history; several parts are now superseded.

**B — Current concept.** Existing autonomous drone (CUAV flight controller, QGroundControl survey/grid missions) carries a Raspberry Pi 4B 2GB that reads FC telemetry read-only and records downward sensor data locally (offline-first), at an initial ~5 m test altitude, for post-landing analysis/mapping, with an optional online dashboard. [CONFIRMED baseline]

**C — Scope conflict.** The Phase-1 "aerial + subsurface" pairing conflicts with sensing physics: buried detection needs ground-proximity sensors; aerial sensors are surface sensors. The objective has not been changed — it is documented and awaiting a guide decision. [SCOPE DECISION — GUIDE REQUIRED]

**D — Surface vs subsurface discussion.**
- GPR + metal detector are the mature buried-mine technologies but require ground proximity. [RESEARCH FINDING]
- Metal-detector coils need cm proximity — nothing at 5 m. Magnetometer needs ~1–2 m, metal-cased only, drone self-EMI. [RESEARCH FINDING]
- RGB (94.8% surface PFM-1) and thermal (~88%, diurnal) are surface modalities. [RESEARCH FINDING]
- Three options: A redefine as surface; B change platform to ground-proximity (different, costlier project); C aerial surface prototype now, subsurface as documented future work. Recommendation on record: Option C [INFERRED] — not decided.

**E — Evidence / research methodology.** Research-first, evidence-based; every important claim is labelled and sourced where possible; facts are separated from inference; published research performance is never claimed as MineGuard performance.

**F — Flight controller and read-only telemetry.** FC is a CUAV Pixhawk-class board. The Pi reads MAVLink telemetry (GPS/altitude/attitude/mode/armed) READ-ONLY; no writes/config to the FC. Note: a literal "CUAV V6+" is UNVERIFIED in official docs — only V6X is documented; the physical board must be confirmed. Exact TELEM port/pinout/logic level is [PENDING] [REQUIRES BENCH TEST]; bench verification precedes flight.

**G — RGB research.** RGB is the best-evidenced aerial surface modality. Candidates: Global Shutter IMX296 (motion-free, INR 6,723 [VERIFIED], sold out), Arducam IMX296 (in stock, ~INR 6,000 [INFERRED]), Camera Module 3 (11.9 MP AF, INR 3,888 [VERIFIED], rolling shutter → motion blur). Lens depends on final altitude/speed/GSD [PENDING].

**H — Thermal research.** Thermal senses surface temperature contrast, not buried objects; time-of-day/weather/soil dependent; ~88% UAV thermography (best evening). Lepton 3.5 (160×120 radiometric) via PureThermal Mini Pro = INR 61,030 [VERIFIED India] or ~INR 26–30k import [ESTIMATED]. MLX90640 rejected (too low-res). Higher-res Boson only if recognition/altitude justify (~INR 1.3 lakh+ [ESTIMATED]).

**I — RGB + thermal fusion research.** Fusion levels: image/early, feature-level (dual backbone, strongest, heaviest), decision/late (lowest registration burden), thermal-assisted RGB (lightest). A UAS landmine study: ~86.8% mAP with RGB+LWIR fusion, 10–30% thermal at 5–10 m optimal; but Anti-Tank 61.9% vs Anti-Personnel 19.2% — fusion is conditional, not automatically better. Fusion runs OFFBOARD; the Pi records both streams; registration + time-sync are the key new costs. [RESEARCH FINDING]

**J — LiDAR research.** Single-point LiDAR (Benewake TFmini-S, INR 2,500–4,000 [VERIFIED], ~5 g) gives direct AGL for terrain-following/constant GSD, bypassing barometer downwash error and coarse GPS altitude. It is a flight/mapping aid, NOT a mine detector. 3D LiDAR (Livox) and 2D RPLIDAR are excluded (weight/cost/geometry). [RESEARCH FINDING / INFERRED]

**K — RTK research.** RTK GNSS (H-RTK F9P / Here3+) gives cm-level GNSS position (1 cm+1 ppm / 2.5 cm). BUT actual target localization depends on attitude (read-only FC IMU), camera/antenna offset and calibration → realistically decimetre-metre. Needs base station/NTRIP. India price [PENDING] (~INR 15–35k [ESTIMATED]). Candidate B1 upgrade only. [RESEARCH FINDING / INFERRED]

**L — GCP discussion.** Ground Control Points give cm map georeferencing (measure RMSE vs known targets) but require entering the survey area to place markers — safe only in a test field with inert surrogate targets, never a real minefield. Treated as a validation/reference method, NOT a purchased operational component. [RESEARCH FINDING / INFERRED]

**M — Budget research.** Four preliminary budgets built as a capability ladder (B4 RGB / B3 RGB+Thermal / B2 +LiDAR / B1 +RTK). Thermal is the dominant cost driver (India INR 61k vs import ~INR 28k [ESTIMATED]). Totals: B4 ~INR 16,900; B3 ~INR 84,600/51,600; B2 ~INR 87,800/54,800; B1 ~INR 1,07,800/74,800 (+lens/RTK-correction [PENDING]). No tier final. Existing drone hardware excluded.

**N — Power-source decision.** Power bank removed from the budget. Power source treated as team-provided/existing = INR 0 for the preliminary budget. The engineering power solution is NOT final; Pi needs sustained 5V/3A; brownout risk [REQUIRES BENCH TEST]. No separate UPS currently planned.

**O — Open-source software policy.** Evaluate each tool for relevance, license, compatibility and testing before inclusion. Verified licenses: pymavlink LGPLv3, picamera2 BSD-2, MAVSDK BSD-3, gpsd BSD-2, ExifTool GPL/Artistic, OpenDroneMap AGPLv3 (network-copyleft only if hosted). Recommended to TEST (offboard for heavy tools). [VERIFIED licenses]

**P — Raspberry Pi role.** Pi 4B 2GB records sensors + read-only telemetry offline; retrieval via USB/OTG after landing. Comfortable: telemetry + single-sensor + logging. Risk: simultaneous RGB+thermal+SSD (2 GB RAM, single CSI, shared USB). No onboard AI training; heavy processing offboard. Combined-workload benchmark mandatory. [INFERRED / REQUIRES BENCH TEST]

**Q — Questions for guide.**
- Which budget tier is acceptable on cost? Is thermal required or is RGB-only acceptable?
- Is the surface/near-surface scope acceptable? Is the B1 mapping/geolocation upgrade required?
- Thermal sourcing route (India verified vs import estimated)? Payload acceptable? Team-provided items as INR 0 acceptable? Components to avoid/add?

**R — Remaining research.**
- Final altitude/speed/line-spacing/overlap; lens focal length/GSD.
- Exact CUAV board/port; India prices for RTK/SSD/lens; final power solution.
- AI approach (after modality fixed); dataset suitability; thermal sourcing landed cost.

**S — Safety considerations.**
- Inert/simulated surrogate targets only — never live ordnance.
- GCP/field work only in a safe test field, never a real minefield.
- Legal/RF/flight permissions for trials; FC remains read-only (no flight-control writes).

**T — Testing sequence.** Progressive: controlled → ground → low-altitude → survey-altitude → failure/recovery → integration → validation. Metrics: PoD, false-alarm rate (per area/image), localization RMSE, coverage, repeatability. No pass thresholds invented — TBD after measurement. Peer + owner validation. [project rule]

**U — Intended data / working flow.** Flight → sensors → Pi → local recording (no internet needed) → land → laptop via USB/OTG → retrieval script → complete flight package → offline analysis/dashboard. Online path (if internet): Pi → backend → web dashboard (near real-time, offline indicator, last-comms time). Local recording continues regardless. Flight-N data persists until the next flight actually begins (safe deletion trigger [PENDING]).

**V — Verification rules.**
- Bench-verify before flight-verify; verify hardware before assuming compatibility.
- Do not convert INFERRED/ESTIMATED into VERIFIED; do not claim published performance as MineGuard performance.
- Do not confuse GNSS accuracy with detected-target localization accuracy.

**W — Team / work-allocation philosophy.** Six members. Rahil handles Pi physical deployment/operation/hardware testing. Shabaz coordinates research/reconnaissance and decides model-training assignments. Development domains chosen later by team poll. Team responsibilities assigned only after the owner finalizes architecture, pipeline and component set. Everyone documents their contributions. [CONFIRMED process]

**X — Experimental comparison matrix.** Planned comparisons: RGB-only vs Thermal-only vs RGB+Thermal (decision-level and feature-level) vs thermal-assisted RGB; plus registration quality (reprojection error) and PoD by mine size/time-of-day. The decisive test is RGB+Thermal (decision-level) vs RGB-only — fusion must beat RGB alone by a measured margin. Numbers TBD after measurement. [planned]

**Y — Why we are deliberately not finalizing early.** Documentation-first engineering: freezing architecture/components before the scope decision, bench tests and guide feedback would risk building the wrong system. Candidates stay provisional until evidence and approval justify them.

**Z — Zero-blind-decision rule.** No component, tier, architecture, pipeline or model is selected blindly. Every choice must rest on evidence, be tested where it matters, and be approved before being called final. Failed components are re-researched and re-tested.

---

## Complete Current Status

| Category | Detail |
|---|---|
| COMPLETED | Master context; component/scope/fusion/tier research; four preliminary budgets; guide-review PDFs; open-source license review. |
| IN PROGRESS | Guide-preparation documents; consolidation of research for guide review. |
| PENDING GUIDE | Surface/subsurface scope; budget-tier choice; whether B1/RTK is required; thermal sourcing route; payload/INR-0 acceptance. |
| PENDING COMPONENT FINALIZATION | Camera, thermal, LiDAR, RTK, storage, mounting, power — all candidates only. |
| PENDING TESTING | FC read-only interface; Pi combined-workload benchmark; power/brownout; storage write; camera GSD/blur; thermal PoD; USB/OTG retrieval; weight/flight-time. |
| PENDING ARCHITECTURE | Overall system architecture (blocked on scope + components + benchmark). |
| PENDING DEVELOPMENT | No implementation started; begins after component set is defined. |

### Status by area
| Area | Status |
|---|---|
| Documentation | Master context + research/budget documents created; repository has context + research baseline committed. |
| Research | Extensive (sensors, fusion, tiers, licenses) — ongoing where component-independent. |
| Budget | Four preliminary candidates prepared for guide review — NOT final. |
| Component | All [SHORTLISTED]/[PENDING] — none final. |
| Scope | Surface vs subsurface [PENDING GUIDE]. |
| Architecture | [NOT FINAL] |
| Pipeline | [NOT FINAL] |
| Dashboard | [NOT FINAL] — concept only (offline-first primary, online secondary). |
| Backend | [NOT FINAL] |
| AI / model | [NOT FINAL] — no model assumed; chosen after modality. |
| Testing | [NOT STARTED] — methodology defined. |
| Team assignment | [PENDING FINAL SYSTEM DEFINITION] |
| GitHub / documentation | Context + research baseline committed earlier; no code; no premature architecture. |

---

## Critical Project Rules (preserved exactly)

1. No blind component selection.
2. Research first.
3. Use evidence wherever possible.
4. Separate facts from inference.
5. Never call a candidate FINAL without explicit approval.
6. Test selected components before final integration.
7. If a component fails, research an alternative and retest.
8. Open-source software must be evaluated for relevance, license, compatibility and testing before inclusion.
9. Every completed task must be documented and reflected in the repository once development begins.
10. Team responsibilities will be assigned only after the owner finalizes the system architecture, pipeline and component set.
11. Final integration testing will be performed/validated by the project owner.
12. Do not prematurely freeze architecture, design or pipeline.
13. Keep the process documentation-first.
14. Do not claim published research performance as MineGuard performance.
15. Do not confuse GNSS accuracy with actual detected-target localization accuracy.
16. Do not describe LiDAR as a mine-detection sensor.
17. Do not describe thermal as automatically superior to RGB.
18. Power source is currently treated as team-provided/INR 0 in the preliminary budget, but the engineering power solution is NOT final.

---

## Important Current Status

| Item | Status |
|---|---|
| COMPONENTS | NOT FINAL |
| ARCHITECTURE | NOT FINAL |
| PIPELINE | NOT FINAL |
| DESIGN | NOT FINAL |
| BACKEND | NOT FINAL |
| DASHBOARD | NOT FINAL |
| AI MODEL | NOT FINAL |
| TESTING | NOT STARTED |
| DEVELOPMENT | NOT STARTED |
| TEAM ASSIGNMENT | PENDING FINAL SYSTEM DEFINITION |

---

*Prepared for project-guide discussion. All technical selections remain provisional until research, guide feedback and verification are complete.*
