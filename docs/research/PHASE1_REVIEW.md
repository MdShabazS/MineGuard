# MineGuard — Phase-1 Review (Historical Record)

> **STATUS: `[HISTORICAL]` — PRESERVED FOR CONTINUITY, NOT CURRENT TECHNICAL TRUTH.**
>
> This document preserves the content of the original Phase-1 review material
> (`Review1Phase1.pptx`, "Review-1 of Project Phase-1 Presentation"). It is kept as the
> project's historical baseline. Several of its selections have since been **superseded**
> by post-Phase-1 research and requirements — see `MASTER_PROJECT_CONTEXT.md` (§8, §14, §17)
> and `docs/research/COMPONENT_RESEARCH.md`. **Do not treat the ESP32, metal-detector +
> thermal finalization, CNN, or other earlier selections as current confirmed architecture
> unless independently re-confirmed later.** The original presentation file is not modified.

---

## Source

- **Artifact:** `Review1Phase1.pptx` — Review-1 of Project Phase-1 Presentation.
- **Department:** Electronics & Communication Engineering.
- **Institution:** Ballari Institute of Technology & Management (Autonomous Institute under VTU), Ballari-Hosapete Road, Allipur, Ballari-583104, Karnataka, India.
- **Title:** *MineGuard — Autonomous Aerial Landmine Detection System.*
- **Guide:** Dr. Sadyojatha K.M (Professor & HOD, Dept. of ECE).
- **Project Coordinator:** Dr. Naseeruddin (Asst. HOD, Dept. of ECE).

### Team (as listed in the Phase-1 deck)

| Member | USN |
|---|---|
| A Mohammed Rahil | 3BR23EC001 |
| B I Mohammed Iqlas | 3BR23EC015 |
| Danish | 3BR23EC038 |
| G Sree Vidya | 3BR23EC045 |
| Mohammed Shabaz S | 3BR23EC102 |
| Shaistha Tabasum | 3BR23EC149 |

---

## Contents (as presented)

1. Title & Objective
2. Problem Statement
3. Literature Survey
4. Methodology
5. System Design
6. Progress Made So Far
7. Conclusion

---

## 1. Title & Objective (Phase-1 wording)

**Title:** MineGuard — Autonomous Aerial Landmine Detection System.

**Objective (as written):**
- To design and develop an autonomous drone system that scans suspected landmine fields by following a pre-programmed flight path without manual intervention.
- To detect **subsurface** landmines accurately by integrating a metal detector coil and thermal camera with a sensor fusion algorithm that minimizes false detections.
- To geo-tag and map every detected threat using a GPS module and display real-time detection data on a ground control station dashboard accessible from a safe distance.
- To eliminate human exposure during landmine survey operations by replacing dangerous manual ground sweeping with a fully autonomous aerial detection system.

> `[SUPERSEDED / CONFLICT]` The "detect subsurface landmines" objective is under scope review; current evidence indicates aerial sensing is realistically surface/near-surface. See `DETECTION_SCOPE_DECISION_SUPPORT.md`.

## 2. Problem Statement (Phase-1 wording)

- Landmines in post-conflict areas pose a serious threat to human life and restrict land usage.
- Manual detection methods are slow, costly, and highly dangerous for personnel.
- Existing systems still require human presence in hazardous zones.
- There is a need for a safe, fast, and accurate detection system.
- An autonomous drone-based solution can detect, geo-tag, and map landmines without human risk.

## 3. Literature Survey (Phase-1 table)

| SL.NO | Title | Author | Date | Methodology | Limitations |
|---|---|---|---|---|---|
| 1 | UAV-based Landmine Detection using Thermal Imaging | J. Smith et al. | March 2021 | Thermal cameras on drones to detect temperature anomalies of buried mines | Low accuracy in deep-buried mines and varying weather conditions |
| 2 | Metal Detection System for Buried Object Detection | R. Kumar et al. | July 2020 | Pulse induction metal detector for detecting metallic landmines | Cannot detect non-metallic (plastic) mines |
| 3 | Drone-based Ground Penetrating Radar for Mine Detection | A. Lee et al. | January 2022 | Integrated GPR with UAV for subsurface scanning | High cost and complex data processing |
| 4 | Multi-Sensor Fusion for Landmine Detection | S. Patel et al. | September 2019 | Combined metal detector, thermal sensor, and image processing | Increased system complexity and power consumption |
| 5 | AI-based Object Classification in UAV Detection Systems | K. Reddy et al. | November 2023 | CNN model to classify detected objects (mine vs debris) | Requires large dataset and high processing power |
| 6 | Autonomous Drone Navigation for Area Scanning | M. Singh et al. | August 2021 | Waypoint-based grid navigation using GPS | Accuracy depends on GPS precision and environmental factors |

## 4. Methodology (Phase-1)

> Slide present as a **title only** — no methodology content was provided in the Phase-1 deck. `[HISTORICAL — empty placeholder]`

## 5. System Design (Phase-1)

> Slide present as a **title only** — no system-design content was provided in the Phase-1 deck. `[HISTORICAL — empty placeholder]`

## 6. Progress Made So Far (Phase-1 wording)

- Problem statement and project objectives finalized.
- Literature survey and research gap identified.
- System design and methodology (flowchart) completed.
- Components and modules selected (ESP32, sensors, GPS, RF).
- Basic implementation planning completed.
- Initial hardware setup and testing yet to be fully started.

> `[SUPERSEDED]` "Components selected (ESP32, sensors, GPS, RF)": current compute is the **Raspberry Pi 4 Model B 2GB** with the **CUAV V6+** flight controller. ESP32 is not part of the current baseline.

## 7. Conclusion (Phase-1 wording)

- The project develops an autonomous drone-based system for safe landmine detection.
- It uses metal and thermal sensors with GPS to detect and map potential threats.
- The system reduces human risk by eliminating manual ground inspection.
- Real-time data transmission enables efficient monitoring and decision-making.
- The design is low-cost, practical, and feasible for implementation within one year.

> `[SUPERSEDED / HISTORICAL]` Sensor set (metal + thermal), real-time-first emphasis, and the one-year/low-cost framing are Phase-1 positions. Current baseline: sensors not finalized; **offline-first** primary with online dashboard secondary; no confirmed timeline. See `MASTER_PROJECT_CONTEXT.md`.

---

## Historical items explicitly carried forward for the record

| Phase-1 item | Current status |
|---|---|
| Subsurface landmine detection objective | `[HISTORICAL / under scope review]` |
| Metal-detector + thermal + sensor-fusion concept | `[SUPERSEDED — sensors not finalized]` |
| ESP32 compute reference | `[SUPERSEDED — Raspberry Pi 4B + CUAV V6+]` |
| CNN classification reference | `[SUPERSEDED — no AI model assumed]` |
| Separate GPS module assumption | `[SUPERSEDED / PENDING — geotag source likely FC telemetry]` |
| Real-time transmission emphasis | `[SUPERSEDED — offline-first primary, dashboard secondary]` |
| "Low-cost, feasible within one year" | `[HISTORICAL — no confirmed timeline currently]` |

*End of Phase-1 historical record. Original presentation preserved unmodified as project history.*
