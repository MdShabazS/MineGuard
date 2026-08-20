# MineGuard — Component Explanation & Guide Preparation

> **PERSONAL STUDY DOCUMENT · COMPONENTS NOT FINALIZED · ARCHITECTURE / PIPELINE NOT FINALIZED**
>
> Purpose: read this before meeting the project guide to confidently explain why each component is being
> considered, what it contributes, what alternatives exist, and what remains undecided. Nothing here is final.
> Evidence labels: `[VERIFIED]` datasheet/listing, `[RESEARCH FINDING]` published study, `[INFERRED]`
> engineering reasoning, `[ESTIMATED]` approximate, `[PENDING]`/`[UNKNOWN]` unresolved, `[SHORTLISTED]`
> candidate, `[TEAM-PROVIDED]`, `[REQUIRES BENCH TEST]`. Prices 2026-08-21 (INR).
>
> *(This Markdown faithfully represents `MineGuard_Component_Explanation_Guide.pdf`.)*

---

## 1. Components & Categories

### Raspberry Pi 4B 2GB
| Field | Detail |
|---|---|
| What it does | Quad-core Cortex-A72 single-board computer; onboard capture, recording, telemetry read. |
| Why MineGuard may need it | Records sensor + FC telemetry data locally (offline-first); integrates the add-on system. |
| Where it fits | Core onboard computer between sensors and local storage; reads FC telemetry (read-only). |
| Interface | 1× CSI camera port; USB2/USB3 (shared PCIe Gen2 lane, 4 Gbps total); GPIO UART. [VERIFIED] |
| Cost / Weight / Power | INR 6,999 [VERIFIED]; ~46 g; needs 5V/3A. |
| Advantages | Cheap, well-supported (picamera2 BSD-2), adequate for record + light tasks. |
| Drawbacks | 2 GB RAM is the binding limit; single CSI port; shared USB bus; thermal throttling; no onboard AI training. [INFERRED] |
| Alternatives | Pi 5 (more RAM/CPU, costlier — not selected on budget); Jetson (out of scope). |
| Better/worse | Pi 5 would ease multi-sensor load but exceeds budget; Pi 4B 2GB chosen as a budget decision. |
| Evidence | Raspberry Pi 4 datasheet [VERIFIED]. |
| Still unknown | Whether it can sustain simultaneous RGB+thermal+SSD load. |
| Verify later | Combined-workload benchmark; confirm unit is already owned. [REQUIRES BENCH TEST] |
| Status | [CONFIRMED platform]; capacity [PENDING benchmark]. |

### RGB camera candidates (overview)
RGB is the best-evidenced aerial surface modality (RGB reached **94.8%** detection on surface PFM-1 mines in a published benchmark) and is cheap, light and mature. Three candidates differ mainly by shutter type and resolution. `[RESEARCH FINDING]`

**RGB — Raspberry Pi Global Shutter (IMX296)**
| Field | Detail |
|---|---|
| What it does | 1.6 MP global-shutter camera; captures motion-free frames. |
| Why | Global shutter avoids motion blur/skew on a moving drone. |
| Where it fits | Downward RGB sensor on CSI-2. |
| Interface / Cost / Weight / Power | CSI-2; INR 6,723 [VERIFIED] (currently sold out); ~34 g +lens; ~1 W. |
| Advantages | No motion blur; interchangeable C/CS lens. |
| Drawbacks | Low resolution (1.6 MP); needs a separate lens; stock availability. [INFERRED] |
| Alternatives / why | Arducam IMX296 (in stock, ships with lens); Camera Module 3 (higher res but rolling shutter). |
| Evidence / Unknown | Price [VERIFIED]; lens focal length [PENDING] (needs altitude/speed/GSD). |
| Verify later / Status | GSD & motion blur at chosen altitude/speed [REQUIRES BENCH TEST]; [SHORTLISTED]. |

**RGB — Arducam IMX296**
| Field | Detail |
|---|---|
| What it does | 1.58 MP global-shutter module, ships with M12 lens. |
| Why / Fits | Motion-free RGB alternative that is in stock; downward CSI sensor. |
| Interface / Cost / Weight / Power | CSI-2; ~INR 6,000 [INFERRED]; ~ w/lens; ~1 W. |
| Advantages / Drawbacks | Motion-free + available + lens included; exact India price not yet verified. |
| Alternatives / Evidence | Official GS / Module 3; listing exists, price [INFERRED]. |
| Status | [SHORTLISTED alternative]. |

**RGB — Raspberry Pi Camera Module 3 (IMX708)**
| Field | Detail |
|---|---|
| What it does | 11.9 MP autofocus camera (rolling shutter). |
| Why / Fits | High-resolution, low-cost RGB; downward CSI sensor. |
| Interface / Cost / Weight / Power | CSI-2; INR 3,888 [VERIFIED]; ~4 g; ~1 W. |
| Advantages | High resolution, autofocus, cheapest, in stock. |
| Drawbacks | Rolling shutter → motion blur/geometric skew on a moving drone. [INFERRED] |
| Alternatives / Status | Global-shutter options for motion-free capture; [SHORTLISTED budget option]. |

### Thermal camera candidates (overview)
Thermal is being investigated, **not** assumed. It senses surface temperature contrast (not buried objects), is time-of-day / weather / soil-moisture dependent, and a UAV thermography study reached **~88%** (best in the evening). It does **not** automatically beat RGB. `[RESEARCH FINDING]`

**Thermal — FLIR Lepton 3.5 (sensor core)**
| Field | Detail |
|---|---|
| What it does | 160×120 radiometric long-wave infrared (LWIR) thermal core. |
| Why | Detects surface thermal anomalies (warm/cool vs soil) for corroboration, esp. low light. |
| Where it fits | Thermal sensor; via a carrier board on USB or SPI. |
| Interface / Cost / Weight / Power | SPI+I2C, or USB via carrier; module ~$199 [VERIFIED global]; ~small; ~0.5–1 W. |
| Advantages / Drawbacks | Research-grade, radiometric; coarse at altitude; weak on small anti-personnel mines. [RESEARCH FINDING] |
| Alternatives / why | MLX90640 (32×24 — rejected, too low-res for ID); Boson (higher-res, far costlier). |
| Unknown / Verify later / Status | Thermal PoD by time-of-day/soil [REQUIRES BENCH TEST]; [SHORTLISTED]. |

**Thermal — PureThermal Mini Pro (carrier)**
| Field | Detail |
|---|---|
| What it does | USB (UVC) carrier that makes the Lepton appear as a plug-and-play USB webcam. |
| Why / Fits | Simplest integration route (no SPI wiring); pairs with Lepton 3.5. |
| Cost / Weight / Power | Assembled + Lepton 3.5 = INR 61,030 [VERIFIED India, Tanotis]; ~30 g; ~1 W. |
| Import alternative | FLIR Lepton 3.5 + carrier via GroupGets ~INR 26,000–30,000 landed [ESTIMATED] — NOT a verified Indian price. |
| Advantages / Drawbacks | Plug-and-play UVC; India assembled is the cost driver of thermal budgets. |
| Status | [SHORTLISTED]; sourcing route (India vs import) is a guide decision. |

**Thermal — Higher-resolution / Boson-class option**
| Field | Detail |
|---|---|
| What it does | 320×512 or 640×512 thermal; more pixels-on-target. |
| Why / evidence | Johnson's criteria: ~1.5 px detection, ~6 px recognition, ~12 px identification. More pixels help classification. [RESEARCH FINDING] |
| Caveat | At ~5 m altitude Lepton already gives detection-level pixels; higher-res mainly buys recognition or higher-altitude coverage. Not automatically better. [INFERRED] |
| Cost / Status | ~INR 1.3 lakh+ [ESTIMATED]; [PENDING] — only if recognition/altitude justify it. |

### Benewake TFmini-S (single-point LiDAR)
| Field | Detail |
|---|---|
| What it does | Single-point time-of-flight rangefinder (12 m). |
| Why | Gives direct Above-Ground-Level (AGL) altitude for terrain-following and constant GSD. |
| Where it fits | Flight/mapping aid; **NOT** a detection sensor. |
| Interface / Cost / Weight / Power | UART/I2C; INR 2,500–4,000 [VERIFIED range]; ~5 g; ~0.7 W. |
| Advantages | Bypasses barometer error (rotor downwash) and coarse GPS altitude; light, cheap, ArduPilot-proven. [RESEARCH FINDING] |
| Drawbacks | Single-point only (not a terrain map); does not detect mines. [INFERRED] |
| Alternatives / Status | TF-Luna (shorter range); [SHORTLISTED as mapping aid]. |

### RTK GNSS (candidate B1 upgrade)
| Field | Detail |
|---|---|
| What it does | Carrier-phase GNSS giving cm-level position (e.g., ZED-F9P 1 cm+1 ppm; Here3+ 2.5 cm RTK). |
| Why | Candidate to improve mapping/geolocation position term. [RESEARCH FINDING] |
| **CRITICAL caveat** | cm GNSS position does **NOT** equal cm mine-location. Target localization also depends on attitude (read-only FC IMU), camera/antenna offset, calibration, altitude → realistically decimetre-to-metre. [INFERRED] |
| Interface / Cost / Weight / Power | UART/USB; ~INR 15,000–35,000 [ESTIMATED], India price [PENDING]; ~40 g; ~1 W; needs base station / NTRIP [PENDING]. |
| Drawbacks | Cost + correction dependency + FC read-only/EXISTING scope tension. |
| Alternatives / Status | GCP validation method; [SHORTLISTED candidate] — B1 not finalized. |

### GCP (Ground Control Points) — validation method, not a purchased component
| Field | Detail |
|---|---|
| What it is | Printed/marked targets at surveyed known positions to measure map/geolocation RMSE vs ground truth. [RESEARCH FINDING] |
| Why not purchased | It is a testing/reference method, not operational onboard hardware. |
| Constraint | Requires placing/measuring markers in the field — acceptable only in a SAFE test field with inert surrogate targets, never a real minefield (would defeat 'no human exposure'). [INFERRED] |
| Cost / Status | ~INR 500 markers + reference GNSS/CORS; offboard processing; [validation method]. |

### Storage — microSD (OS/logs)
| Field | Detail |
|---|---|
| What / Why | High-endurance microSD for OS and logs (endurance line resists write-wear). |
| Candidate / Cost / Status | SanDisk High Endurance 64GB ~INR 900 [ESTIMATED]; [SHORTLISTED]. |

### Storage — USB SSD / flash (mission data)
| Field | Detail |
|---|---|
| What / Why | Portable SSD (sustained write for RGB video) or USB3 flash (light data). |
| Candidates / Cost | Samsung T7 / SanDisk Extreme SSD ~INR 4,500–7,000 [INFERRED]; USB3 flash 256GB ~INR 2,000 [INFERRED]. |
| Drawback / Verify / Status | Cheap flash may sag on sustained write; measure real write rate [REQUIRES BENCH TEST]; [SHORTLISTED]. |

### Cooling
| Field | Detail |
|---|---|
| What / Why | Pi4 metal case + dual fan to prevent thermal throttling under sustained load. |
| Cost / Status | INR 599 [VERIFIED]; [SHORTLISTED]. |

### FC-to-Pi interface (read-only telemetry)
| Field | Detail |
|---|---|
| What / Why | Read MAVLink telemetry (GPS/altitude/attitude/mode/armed) from the flight controller, READ-ONLY. |
| Hardware | JST-GH telemetry cable + CP2102 USB-UART; ideally an RX-only tap. |
| Critical unknown | The exact CUAV board/port is UNVERIFIED — official docs found are for V6X, not a literal 'V6+'. Do not assume. [PENDING] |
| Verify later / Status | Confirm board silkscreen, TELEM port, pinout, 3.3 V logic, read-only reception [REQUIRES BENCH TEST]; [PENDING]. |

### UART / USB interface (CP2102)
| Field | Detail |
|---|---|
| What / Why / Cost / Status | USB-to-UART adapter for the telemetry read path; ~INR 250 [INFERRED]; [SHORTLISTED]. |

### Mounting / vibration isolation
| Field | Detail |
|---|---|
| What / Why | Downward damped bracket to hold Pi + sensors and reduce vibration. |
| Cost / Status | ~INR 800–1,500 [ESTIMATED/PENDING]; exact part [PENDING]. |

### Power source
| Field | Detail |
|---|---|
| Current treatment | Team-provided / existing — INR 0 for the preliminary budget. [TEAM-PROVIDED] |
| Engineering note | Pi needs sustained 5V/3A; brownout/undervoltage is a real risk; the final power solution is NOT selected. |
| Verify later / Status | Sustained 5V/3A + brownout under full payload [REQUIRES BENCH TEST]; [PENDING final]. |

### Communications (optional)
| Field | Detail |
|---|---|
| What / Why | 4G USB dongle for the optional online dashboard; offline-first remains primary. |
| Cost / Status | ~INR 1,800 [ESTIMATED]; [optional / PENDING]. |

---

## 2. Current Candidate Budget Ladder (no tier is final)

| Tier | What it adds |
|---|---|
| **B4 — RGB only** | Baseline: RGB surface detection + basic mapping. Cheapest, lowest Pi load, best-evidenced modality. |
| **B3 — RGB + Thermal fusion** | Adds thermal-contrast corroboration (low-light/diurnal). Fusion done OFFBOARD; Pi records both streams. |
| **B2 — RGB + Thermal + LiDAR** | Adds single-point LiDAR = constant-AGL terrain-following & coverage (a flight/mapping upgrade, NOT detection). |
| **B1 — B2 + RTK (candidate)** | Adds candidate cm-level GNSS position for mapping/geolocation. RTK is a candidate only; B1 not finalized. |

**Why each choice (honest reasoning):**
- RGB is the baseline because it is the best-evidenced aerial surface modality (94.8% on surface PFM-1), cheap, light and mature. `[RESEARCH FINDING]`
- Thermal is being investigated rather than blindly assumed: it only senses surface thermal contrast, is time-of-day dependent, and is weak on small anti-personnel mines. `[RESEARCH FINDING]`
- RGB+thermal fusion is a candidate because the two have different error modes (a UAS study reached ~86.8% mAP), but fusion gains are modest/conditional and not automatic. `[RESEARCH FINDING]`
- LiDAR is primarily an AGL / survey / mapping improvement (constant GSD, terrain-following) — it is **NOT** a mine detector. `[INFERRED]`
- RTK improves GNSS positioning, but centimetre GNSS accuracy does **NOT** automatically mean centimetre target-location accuracy (attitude, camera/antenna geometry and calibration dominate). `[INFERRED]`
- GCP is a validation/reference method for safe testing, not an operational purchased component. `[INFERRED]`

---

## 3. Questions the Guide May Ask (honest answers from current evidence)

- **Q: Why Raspberry Pi 4B?** A: It is our budget-confirmed onboard computer; sufficient for offline recording and light tasks. Its combined-sensor capacity is still to be benchmarked. [CONFIRMED platform; PENDING benchmark]
- **Q: Why RGB?** A: Best-evidenced aerial surface modality (94.8% on surface PFM-1), cheap, light, mature, dataset-rich.
- **Q: Why thermal?** A: It adds surface thermal-contrast corroboration and low-light capability (~88% in a UAV thermography study), but only for surface anomalies — we are investigating it, not assuming it.
- **Q: Why combine RGB and thermal?** A: Different error modes can complement each other (a UAS fusion study reached ~86.8% mAP); but the gain is conditional, so we will test whether fusion beats RGB alone before committing.
- **Q: Why LiDAR?** A: For constant Above-Ground-Level altitude and terrain-following (steady GSD and coverage) — a flight/mapping aid, not a detector.
- **Q: Why RTK?** A: To improve the GNSS position term for mapping. Important: cm GNSS position is not cm mine location — attitude and mounting geometry limit real target accuracy to decimetre-metre.
- **Q: Why not GPR?** A: Ground-penetrating radar is ground-coupled (works near the surface, not at metres of altitude) and expensive — incompatible with the aerial ~5 m concept.
- **Q: Why not a metal detector?** A: A metal-detector coil needs centimetre proximity; it detects nothing at 5 m. The aerial variant (magnetometer) needs ~1–2 m, only finds metal-cased mines, and suffers drone self-EMI.
- **Q: Why are we not detecting buried mines from 5 m?** A: Physics: buried detection needs ground-proximity sensors (GPR/metal detector). Aerial sensors (RGB/thermal) are surface sensors. So our scope is surface/near-surface — pending guide confirmation.
- **Q: Why is the architecture not finalized?** A: We follow documentation-first engineering: architecture depends on the scope decision, the chosen sensors, and the Pi benchmark — none of which are settled yet.
- **Q: Why are components not finalized?** A: Research-first, evidence-based selection; several items still need bench tests and your feedback. We avoid blind selection.
- **Q: Why are there four budgets?** A: They form a capability ladder so you can choose the cost/capability point; each tier adds exactly one capability.
- **Q: Why is the power source INR 0?** A: For the preliminary budget the power source is team-provided/existing; the final engineering power solution is not yet selected or verified.
- **Q: Why are some prices estimates?** A: Where a reputable Indian price for the exact model is not yet confirmed, we mark it ESTIMATED or PENDING rather than inventing a number.
- **Q: How will we prove the system works?** A: Mandatory progressive testing with inert surrogate targets, measuring PoD, false-alarm rate and localization RMSE, with peer and owner validation.
- **Q: What will be tested later?** A: FC read-only interface, Pi combined-workload benchmark, power/brownout, storage write rate, camera GSD/motion blur, thermal PoD by time-of-day, USB/OTG retrieval, on-airframe weight/flight-time.
- **Q: What are the major risks?** A: Pi 4B simultaneous-sensor load; unverified CUAV port; thermal environmental dependence and small-AP-mine weakness; RTK target-localization limit; power brownout.

---

## 4. Two-Minute Guide Explanation (natural, to speak)

"MineGuard uses our existing autonomous drone and adds a Raspberry Pi 4B that reads flight-controller telemetry read-only and records sensor data offline, so the mission never depends on internet. For sensing, we started from the evidence rather than assumptions. Research shows that from an aerial platform we can realistically detect surface and near-surface mine threats, not buried ones — buried detection needs ground-contact sensors like GPR or metal detectors, which don't work at five metres. So RGB is our baseline because it's the best-evidenced, cheapest, lightest option. Thermal is being investigated as an add-on because it can catch surface thermal signatures in low light, but it's weather- and time-of-day dependent and weak on small mines, so we won't assume it's better — we'll test whether RGB-plus-thermal fusion actually beats RGB alone. LiDAR, if included, is only for steady altitude and mapping, not detection. RTK is a possible upgrade to improve map positioning, but I want to be clear that centimetre GPS does not mean centimetre mine location. That's why we built four candidate budgets as a capability ladder and haven't finalized anything: we want your decision on scope and cost first, then we bench-test the key assumptions before selecting components."

---

*Prepared for project-guide discussion. All technical selections remain provisional until research, guide feedback and verification are complete.*
