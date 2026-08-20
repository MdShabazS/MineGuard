# MineGuard — Deep Component Feasibility Study (v1)

**Stage:** Deep Component Research (pre-budget, pre-selection)
**Date checked:** 2026-08-20 · **Currency:** INR (₹) where available, else USD list price
**Prepared for:** Shabaz (research/reconnaissance coordination)

> **Constraints:** no files created, nothing scaffolded, no code, no architecture finalized, no purchases, no budgets produced. This is a research report only — phrased as "candidate X appears suitable / should be excluded because…", not "MineGuard will use X."
>
> **Evidence labels used throughout:** `[VERIFIED]` = manufacturer datasheet/official spec · `[RESEARCH]` = published study finding · `[INFERENCE]` = engineering reasoning from the above · `[REC]` = recommendation · `[PENDING]` = unknown / needs verification.

---

## The single most important finding (read first)

The Phase-1 deck's objective — *"detect subsurface landmines accurately"* from an autonomous drone — **is not supported by the current evidence for aerial standoff sensing.** The literature splits cleanly:

- **Buried / subsurface mines** are detected by **GPR + metal-detector** dual-sensor systems, which are the *"most researched, technologically mature and successful in field trials"* — but they operate **handheld / ground-proximity**, essentially touching the soil ([IEEE](https://ieeexplore.ieee.org/document/8627601/), [IJERT review](https://www.ijert.org/research/sensors-for-landmine-detection-and-techniques-a-review-IJERTV2IS1410.pdf)). They do not work at metres of altitude.
- **Aerial platforms** realistically detect **surface-laid / scatterable mines and surface signatures** (disturbed soil, thermal contrast, spectral anomalies). On surface PFM-1 mines, **RGB reached 94.8% detection** ([hyperspectral benchmark](https://arxiv.org/html/2602.10434v3)); UAV thermography reached *"nearly 88%"* accuracy, best in evening hours via diurnal heating ([arXiv 2410.23998](https://arxiv.org/abs/2410.23998)).

`[INFERENCE]` **MineGuard as an aerial prototype is realistically a *surface / near-surface anomaly* detection-and-mapping system, not a subsurface mine detector.** This reframing must be resolved before any sensor budget is built, because it determines whether metal detection/GPR belong in the project at all.

---

## PART 1 — Sensor Technology Feasibility (comparison matrix)

| Technology | Measures | Detects buried? | Realistic standoff | Aerial-suitable? | Pi 4B load | Verdict for MineGuard |
|---|---|---|---|---|---|---|
| **RGB / optical** | Reflected visible light | **No** (surface only) | Altitude-flexible (GSD-limited) | **Yes** | Moderate | **Strong candidate** — surface mines + mapping |
| **Thermal (LWIR)** | Surface temp contrast | Shallow *thermal* anomaly only, diurnal-dependent | Low–moderate alt | **Yes** | Low–moderate | **Candidate** — surface/near-surface, time-of-day sensitive |
| **LiDAR** | Range → 3D geometry | **No** | 8–100 m depending on unit | Yes (mapping) | Moderate–high | **Mapping/terrain aid, not detection** |
| **Metal detection (EMI coil)** | Eddy currents in metal | At/just-below surface | **cm-scale proximity** | **No (needs ~contact)** | Low | **Exclude for aerial** (physics) |
| **Magnetometer** | Ferrous magnetic anomaly | Metal-cased, shallow | **1–2 m altitude** for good PoD; 75% at 6 m | Marginal (very low alt) | Low | Background/research only; low-alt risk |
| **Hyperspectral** | 100s of spectral bands | **No** (surface) | Altitude-flexible | Yes | **Very high** | Conditional — heavy data/compute |
| **Multispectral** | Few discrete bands | **No** (surface) | Altitude-flexible | Yes | High | Conditional — lighter than hyperspectral |
| **GPR** | Subsurface EM reflectivity | **Yes** (the buried-mine standard) | **Ground proximity** | **No** (not at MineGuard altitudes) | Very high | Exclude for aerial prototype |

**Fundamentally unsuitable for the stated aerial mission:** `[INFERENCE]` classic **metal-detector coils** (need cm proximity) and **GPR** (ground-coupled). Both are excellent *ground* tools but contradict an aerial 5 m concept. `[RESEARCH]` Sources: [IJERT sensor review](https://www.ijert.org/research/sensors-for-landmine-detection-and-techniques-a-review-IJERTV2IS1410.pdf), [dual-sensor GPR+MD](https://ieeexplore.ieee.org/document/8627601/), [drone magnetometer study](https://www.mdpi.com/1424-8220/21/9/3175).

---

## PART 2 — RGB Camera

| Candidate | Sensor / res | Shutter | Interface | List price | Notes |
|---|---|---|---|---|---|
| **Pi Camera Module 3** | IMX708, 11.9 MP, 4608×2592 | **Rolling** | CSI-2 | ~$25 | Autofocus (PDAF+CDAF), 66°/102° wide; 1080p50 |
| **Pi Global Shutter Camera** | IMX296, 1.6 MP | **Global** | CSI-2 | ~$50 | Exposure to 30 µs, **no motion blur/rolling distortion**, C/CS-mount lens |
| **Arducam 16 MP AF / 64 MP** | IMX519 / higher | Rolling | CSI-2 | varies | Higher res, autofocus |

`[VERIFIED]` specs: [ThinkRobotics camera guide](https://thinkrobotics.com/blogs/learn/raspberry-pi-camera-module-comparison-complete-2025-guide), [Arducam](https://blog.arducam.com/official-camera-module-3-a-closer-look/), [global-shutter roundup](https://top-cameras.com/best-global-shutter-camera-module/).

**Key engineering point** `[INFERENCE]`: a **moving** drone + **rolling shutter** = geometric skew and motion blur that degrade both detection and photogrammetric mapping. The **Global Shutter Camera (IMX296)** appears the more defensible mapping/detection choice *despite* lower resolution; the Module 3's autofocus + higher MP favours detail when hovering/slow. **GSD** depends on final altitude (undecided) — e.g., IMX708 at low altitude gives sub-cm/pixel; must be computed once altitude/lens are fixed. `[PENDING]` Indian pricing (Robu/Robocraze) to be pulled per selected model. **No camera chosen.**

**Pi 4B has only ONE CSI camera port** `[VERIFIED]` — so a simultaneous **CSI RGB + CSI thermal** combo is not natively possible on one Pi 4B without one sensor moving to USB or a CSI multiplexer. This is a real integration constraint (see Part 8).

---

## PART 3 — Thermal

| Candidate | Resolution | Band | Interface | Radiometric | Price | Verdict |
|---|---|---|---|---|---|---|
| **FLIR Lepton 3.5** | 160×120 | LWIR 8–14 µm | SPI (data) + I2C (ctrl); USB via PureThermal | Yes | ~$175–199 global | Credible research thermal |
| **MLX90640** | **32×24** | LWIR | I2C | Per-pixel temp | ₹5,000–6,220 (India) | **Too low-res for mine ID** |
| **Seek/Topdon/other** | varies | LWIR | USB | varies | `[PENDING]` | Investigate |

`[VERIFIED/RESEARCH]`: [Lepton 3.5 (GroupGets)](https://groupgets.com/products/flir-lepton-3-5), [Lepton–Pi guide (FLIR)](https://oem.flir.com/developer/lepton-family/lepton-integration-with-raspberry-pi/), [MLX90640 India (Robu)](https://robu.in/product/waveshare-mlx90640-ir-array-thermal-imaging-camera-32x24-pixels-110-fov/).

**What thermal can and cannot do** `[RESEARCH]`: it detects **surface temperature contrast**, not mines directly. UAV thermography hit *"nearly 88%"* accuracy **best in the evening** (diurnal soil-vs-object cooling) ([arXiv 2410.23998](https://arxiv.org/abs/2410.23998)); the Binghamton group used **UAV thermal specifically for surface PFM-1 "butterfly" mines** ([ResearchGate](https://www.researchgate.net/publication/328461653)). `[INFERENCE]` Thermal is **time-of-day, weather, and soil-moisture dependent**, and the 32×24 MLX90640 cannot resolve a small mine at altitude — the **Lepton 3.5 (160×120, radiometric)** is the only listed module with research-grade credibility. `[PENDING]` Lepton India price/availability + whether a PureThermal USB carrier is used (uses USB rather than the CSI port). **No thermal camera chosen; thermal does NOT directly identify buried mines.**

---

## PART 4 — LiDAR (mapping vs detection are different questions)

| Candidate | Type | Range | Weight | Price (India) | Role |
|---|---|---|---|---|---|
| **Benewake TFmini-S / Plus** | Single-point ToF | 12 m | 5–11 g | ₹2,500–4,000 | **Altitude-hold / AGL rangefinder only** |
| **Benewake TF-Luna** | Single-point ToF | 8 m | ~5 g | ~₹1,500 | Rangefinder |
| **Slamtec RPLIDAR A1** | 2D 360° horizontal | ~12 m | ~190 g | ₹8,000–25,000 | Horizontal plane — **wrong geometry** for downward ground mapping |
| **Livox Mid-40 / similar** | 3D point cloud | 100+ m | 500 g–2 kg | ₹3–20 lakh | True 3D DEM — **too heavy/expensive** for this prototype |

`[VERIFIED/RESEARCH]`: [TFmini (ArduPilot)](https://ardupilot.org/copter/docs/common-benewake-tfmini-lidar.html), [Robokits TFmini Plus](https://robokits.co.in/multirotor-spare-parts/drone-sensors/tfmini-plus-lidar-module-short-range-distance-sensor), [Zbotic LiDAR guide](https://zbotic.in/drone-obstacle-avoidance-sensors-systems-best-builds-in-india/).

**Mapping usefulness:** `[INFERENCE]` HIGH — a single-point LiDAR gives reliable **above-ground-level altitude** (useful for constant-standoff surveys and GSD) and terrain profiling; a 3D unit gives micro-topography (disturbed soil) but at prohibitive weight/cost here.
**Mine-detection usefulness:** `[INFERENCE]` LOW-to-INDIRECT — LiDAR does not detect mines; at most it flags surface disturbance geometry. **Recommendation:** treat LiDAR as an **optional mapping/altitude aid (TFmini-class)**, explicitly **not** a detection sensor. **No LiDAR chosen.**

---

## PART 5 — Metal Detection (critical section)

`[RESEARCH]` Metal detectors use **low-frequency electromagnetic induction** and detect metal **"at or below the surface"** at **centimetre-scale** distance ([IJERT review](https://www.ijert.org/research/sensors-for-landmine-detection-and-techniques-a-review-IJERTV2IS1410.pdf)). The relevant *aerial* variant is a **magnetometer**, not a metal-detector coil:

- `[RESEARCH]` Drone magnetometer mine detection requires **constant altitude 1–2 m from the surface**; **75% detection at 6 m altitude, 3 m/s**; at **1 m** the M16 criterion is 5 nT ([MDPI Sensors 21/9/3175](https://www.mdpi.com/1424-8220/21/9/3175)).
- `[RESEARCH]` Known challenges: **payload weight cutting flight time, danger of very-low flight, and EMI from the drone itself**; *"no reliable method has yet been described for consistently maintaining the required low altitude"* ([drone-magnetometer feasibility](https://theconversation.com/researchers-are-combining-drones-and-ai-to-make-removing-land-mines-faster-and-safer-272248)).

`[INFERENCE]` **A hobby metal-detector coil at ~5 m altitude will detect nothing** — the physics forbids it. Even a magnetometer needs ~1–2 m and only sees **metal-cased** mines, missing minimum-metal/plastic mines (the hard case). Drone self-EMI directly conflicts with the CUAV/motors. **Recommendation:** classify metal detection / magnetometry as **literature/background only for this prototype**, or a *separate future low-altitude experiment* — not part of the 5 m aerial survey. **Excluded from the primary aerial concept on physics grounds.**

---

## PART 6 — Hyperspectral / Multispectral

`[RESEARCH]` Hyperspectral (100s of narrow bands) enables material discrimination invisible to RGB; on surface PFM-1, classical **ACE** and lightweight **spectral NNs** perform best, but **RGB still gave the highest raw detection (94.8%)** in the same study ([benchmark](https://arxiv.org/html/2602.10434v3)). A dedicated **UAV VNIR hyperspectral benchmark** exists over a field seeded with 143 surrogate targets ([arXiv 2510.02700](https://arxiv.org/abs/2510.02700)).

`[INFERENCE]` Both are **surface-only**, generate **very high data volumes**, and imply **heavy offline processing** that a **Pi 4B 2GB cannot do in real time**. The marginal gain over RGB for *surface* mines is not clearly worth the cost/weight/compute for a first prototype. **Recommendation:** **exclude hyperspectral from Budgets 1–4 for now** (revisit only if surface-spectral discrimination becomes a research goal); **multispectral optional** as a lighter future experiment. `[PENDING]` India pricing for UAV multispectral (e.g., MAPIR/AgroCam-class) not yet gathered.

---

## PART 7 — Sensor Fusion

| Combination | Benefit | Added cost/weight/power/compute | Sync difficulty | Verdict |
|---|---|---|---|---|
| **RGB + LiDAR(alt)** | Geo-referenced imagery, constant GSD | Low | Low | **Strong, low-risk** |
| **RGB + Thermal** | Visual + thermal-anomaly corroboration | Moderate (2nd imager, CSI/USB conflict) | **Moderate** (frame + geo alignment) | **Promising**, benchmark first |
| **RGB + Thermal + LiDAR** | Full-featured surface mapping | High (power, Pi load) | High | Budget-2 candidate, **Pi 4B risk** |
| **Camera + metal/magnetometer** | — | Very high, altitude conflict | High | **Not recommended** (physics) |
| **Thermal + metal** | — | Very high | High | **Not recommended** |

`[INFERENCE]` Fusion **does not automatically improve results** — [ground MD+GPR fusion works because both sense the subsurface](http://article.sapub.org/10.5923.j.fs.20170704.01.html); fusing two *surface* sensors (RGB+thermal) only helps if their error modes differ (e.g., thermal finds warm objects RGB misses in shadow). **Recommendation:** the lowest-risk fusion is **RGB + single-point LiDAR** (mapping); **RGB + thermal** is the meaningful *detection* fusion to evaluate, but only after each is individually benchmarked and time-synchronised. **No fusion architecture finalized.**

---

## PART 8 — Raspberry Pi 4B 2GB Realistic Capacity

`[VERIFIED]` Pi 4B: quad-core Cortex-A72, LPDDR4 (2 GB here), **2×USB2 + 2×USB3 sharing one PCIe Gen2 lane = 4 Gbps total**, **single CSI camera port**, needs **5V/3A USB-C** ([RPi 4 datasheet](https://datasheets.raspberrypi.com/rpi4/raspberry-pi-4-datasheet.pdf), [specs](https://www.raspberrypi.com/products/raspberry-pi-4-model-b/specifications/)).

| Workload | Classification |
|---|---|
| FC MAVLink telemetry (UART), GPS parse, health logging, local logging | **A. Comfortable** |
| Single RGB **or** single thermal capture + timestamped recording to disk | **A. Comfortable** |
| RGB **+** thermal simultaneously (CSI+USB), time-sync, 4G uplink | **B. Needs optimization** (USB bus, single CSI port, 2 GB RAM) |
| Lightweight AI **inference** on captured frames (post-processed, small model) | **B. Needs optimization** |
| Sensor fusion of 3+ streams + real-time AI + streaming | **C. Probably offboard** (laptop after landing) |
| **AI model training**; hyperspectral cube processing; real-time deep detection | **D. Unrealistic on Pi 4B 2GB** |

`[INFERENCE]` **2 GB RAM is the binding constraint**, not CPU. The offline-first design is *well-matched* to the Pi's real strengths: **record on the Pi, analyse on the laptop.** Heavy detection/AI should be a **laptop/backend post-flight** job, not onboard. **Mandatory:** a combined-workload benchmark on the actual Pi 4B 2GB before any technical acceptance. **Do not assume individual-component success implies full-system success.**

---

## PART 9 — Storage

`[REC/INFERENCE]`:
- **Medium:** a **high-endurance A2 microSD** for OS, plus a **USB-3 SSD** (or industrial SD) for mission data — SSD gives sustained write speed and far better write endurance/corruption resistance than consumer SD.
- **Sustained write:** must exceed the *combined* sensor data rate (RGB video + thermal + logs) — compute once sensors are fixed `[PENDING]`.
- **Corruption/power-loss safety:** journaled filesystem, periodic `fsync`/flush, **atomic file finalization** (write to temp, rename on completeness), and a **manifest/index** per flight so partial files are detectable.
- **Lifecycle rule (your requirement):** Flight N data persists after landing; deletion of N only when **Flight N+1 *actually* begins**. `[REC]` Define "flight actually begins" by a **verified trigger** (e.g., FC `armed` + throttle/takeoff detected via read-only MAVLink), never a timer — and **retain until a new flight's first write succeeds** so an aborted start never destroys prior data. **Not implemented now.**

---

## PART 10 — Power (estimated ranges, not a single number)

`[VERIFIED]` Pi 4B needs **5V/3A (15 W) USB-C**; **undervoltage/brownout is a documented, common failure** on marginal supplies/cables ([RPi forums](https://community.element14.com/products/raspberry-pi/f/forum/11052/raspberry-pi-4-model-b---under-voltage-detection)).

`[INFERENCE]` Rough subsystem budget (to be bench-measured):

| Load | Est. draw @5V |
|---|---|
| Pi 4B (idle→full quad-core) | ~2.7 W → ~6–7 W |
| RGB CSI camera | ~1 W |
| Thermal (Lepton) | ~0.5 W |
| LiDAR (TFmini-class) | ~0.5–1 W |
| 4G/USB dongle (peak TX) | ~2–3 W bursts |
| SSD | ~2–4 W |
| Active cooling (fan) | ~0.5 W |
| **System total (typical→peak)** | **~8 W → ~15–20 W** |

**Power-bank feasibility** `[INFERENCE]`: needs to **sustain ≥3 A at a stable 5 V** (ideally USB-C **PD**), with **fast/seamless pass-through switchover** if used as a UPS — many banks drop out momentarily and **reboot the Pi**. `[RESEARCH]` proper protection comes from **UPS HATs** (SunFounder PiPower etc.) — but the baseline says **no UPS planned**, so brownout risk is real and must be **bench-tested**. Weight/heat of the bank add to payload and flight-time cost. **Power source not finalized; power bank not confirmed.**

---

## PART 11 — FC ↔ Pi Interface (CUAV V6+)

| Item | Status |
|---|---|
| MAVLink over **TELEM UART** (TX/RX/GND) → Pi GPIO `/dev/ttyAMA0`, read via **pymavlink/MAVSDK** | `[VERIFIED]` general pattern ([PX4 RPi companion](https://docs.px4.io/main/en/companion_computer/pixhawk_rpi), [ArduPilot MAVLink+RPi](https://ardupilot.org/dev/docs/raspberry-pi-via-mavlink.html)) |
| Readable telemetry: **GPS, altitude, attitude, flight mode, armed state, mission/waypoint status** | `[VERIFIED]` standard MAVLink messages |
| **Read-only** achieved by only *reading* streams (never sending commands/params) | `[INFERENCE]` — safe by software discipline; consider a **TX-disconnected / RX-only wiring** to guarantee it physically |
| **Exact CUAV V6+ port** (which TELEM), connector pinout, voltage levels (3.3 V logic) | **`[PENDING]` — REQUIRES BENCH VERIFICATION** (docs found are for V6X; V6+ shares Pixhawk-standard layout but must be confirmed on the actual board) |
| USB (instead of UART) as the read path | `[PENDING]` — verify which is exposed/free on the airframe |

`[REC]` **Bench-verify before flight-verify.** Do not architect around a specific port until the physical board is checked. A **hardware RX-only tap** is the strongest guarantee of the READ-ONLY constraint.

---

## PART 12 — Camera Feed / Existing Hardware (H12 etc.)

`[PENDING]` **H12 (and any R12 Pro / existing video link) specs are unverified — do NOT assume or architect around them.** What must eventually be physically verified:
- Does the existing remote/telemetry system expose a **video feed or data output** the Pi can tap? Format? (analog/HDMI/IP/SDK?)
- Is the current downward camera **part of the existing platform** (excluded from budgets) or a **new MineGuard sensor** (in scope)?
- Frequency/RF coexistence between existing links, 4G, and Wi-Fi.
- Whether any of it is READ-ONLY-compatible.

**Action:** list these as physical-verification items; build nothing around H12.

---

## PART 13 — Candidate Classification Into the Four Future Budget Groups
*(classification only — no prices summed, no components purchased; **existing drone flight-platform components excluded from all four**)*

| Component | **B1 Top-Quality** | **B2 Full-Featured** | **B3 Thermal-Only** | **B4 Camera-Only** |
|---|---|---|---|---|
| Raspberry Pi 4B 2GB | Existing/confirmed | Existing | Existing | Existing |
| RGB camera (Global-Shutter or Module 3) | **Required** (high-end) | **Required** | Optional | **Required** |
| Thermal (Lepton 3.5-class) | **Required** | **Required** | **Required** | Not included |
| LiDAR (TFmini altitude / 3D optional) | Optional (3D) | Optional (single-pt) | Not required | Not required |
| Storage (SSD + high-endurance SD) | **Required** | **Required** | **Required** | **Required** |
| Power (bank/UPS solution) | **Required** | **Required** | **Required** | **Required** |
| 4G/connectivity module | Optional | Optional | Optional | Optional |
| Cooling (heatsink/fan) | **Required** | **Required** | **Required** | **Required** |
| FC read-only interface cable/adapter | **Required** | **Required** | **Required** | **Required** |
| Metal detector / magnetometer | **Not recommended** (physics) | Not recommended | — | — |
| Hyperspectral / multispectral | Alternative (research-gated) | Not recommended (v1) | — | — |
| GPR | Not recommended (aerial) | Not recommended | — | — |

*(Budget figures deliberately NOT produced — pending component confirmation, compatibility checks, accessory identification, and price research.)*

---

## PART 14 — Indian Pricing Collected So Far
*(approximate; verify before budgeting; date checked 2026-08-20; tax/shipping not confirmed)*

| Item | Approx. India price | Source |
|---|---|---|
| MLX90640 (32×24) thermal | **₹5,000–6,220** | [Robu](https://robu.in/product/waveshare-mlx90640-ir-array-thermal-imaging-camera-32x24-pixels-110-fov/), [IndiaMart](https://www.indiamart.com/proddetail/mlx90640-thermal-camera-2855291852012.html) |
| FLIR Lepton 3.5 | ~$175–199 (global); **India `[PENDING]`** | [GroupGets](https://groupgets.com/products/flir-lepton-3-5) |
| Pi Camera Module 3 | ~$25 (global); India `[PENDING]` | [ThinkRobotics](https://thinkrobotics.com/blogs/learn/raspberry-pi-camera-module-comparison-complete-2025-guide) |
| Pi Global Shutter Camera | ~$50 (global); India `[PENDING]` | same |
| Benewake TFmini-S / Plus | **₹2,500–4,000** | [Robokits](https://robokits.co.in/multirotor-spare-parts/drone-sensors/tfmini-plus-lidar-module-short-range-distance-sensor) |
| Benewake TF-Luna | **~₹1,500** | [Zbotic/GadgetsDeal](https://gadgetsdeal.in/shop/lidar/benewake-tfmini-s-micro-lidar-for-drones-uav-in-india/) |
| Slamtec RPLIDAR A1 | **₹8,000–25,000** | [Zbotic](https://zbotic.in/drone-obstacle-avoidance-sensors-systems-best-builds-in-india/) |
| Livox Mid-40-class 3D | **₹3–20 lakh** | same |

`[PENDING]` still to price in India: Lepton carrier (PureThermal), chosen RGB module, SSD, power bank/UPS, 4G module, cooling, FC interface cable. **No prices fabricated.**

**Public datasets found** (surface-mine focused): [SULAND_v2 RGB (PFM-1/PMA-2)](https://arxiv.org/html/2607.28996), [Binghamton Scatterable Landmine RGB+thermal](https://orb.binghamton.edu/geology_fac/27/), [UAV VNIR hyperspectral benchmark](https://arxiv.org/abs/2510.02700), [PFM-1 HSI benchmark (GitHub)](https://arxiv.org/html/2602.10434v3), [MineInsight multi-sensor (non-UAV)](https://arxiv.org/abs/2510.02700). `[INFERENCE]` These are **surface-mine** datasets — consistent with the aerial reframing, and unsuitable if the goal remains "buried."

---

## PART 15 — Final Research Conclusions

1. **Best technically feasible sensing direction** `[REC]`: **RGB (global-shutter) + single-point LiDAR for altitude/mapping**, treated as a **surface / near-surface anomaly** detector — the only direction well-supported by evidence *and* Pi-4B-feasible.
2. **Best budget-conscious direction** `[REC]`: **RGB-only** with strong offline AI on the laptop (Budget 4) — cheapest, highest published surface detection (94.8%), lightest Pi load.
3. **Most promising top-quality (B1)** `[REC]`: Global-shutter RGB **+ Lepton 3.5 thermal + LiDAR + SSD + robust power**, with **all heavy AI offboard**.
4. **Most promising full-featured (B2)** `[REC]`: **RGB + Lepton thermal (+ optional single-point LiDAR)** — the RGB+thermal fusion is the meaningful detection combo; **flag Pi-4B simultaneous-load risk**.
5. **Most promising thermal-only (B3)** `[REC]`: **Lepton 3.5** (not MLX90640 — too low-res), operated on the **diurnal/evening** window; accept weather/time-of-day limits.
6. **Most promising camera-only (B4)** `[REC]`: **Global Shutter (IMX296)** for motion-free capture, or **Module 3** for resolution when slow/hovering.
7. **Should probably be excluded** `[REC]`: **classic metal-detector coils** and **GPR** (ground-proximity physics), **hyperspectral** (compute/weight/marginal gain for v1); **magnetometer** demoted to background/low-alt future experiment; **MLX90640** as a *detection* sensor; **Livox 3D / RPLIDAR A1** (weight/cost/geometry).
8. **Major technical risks:** (a) **subsurface vs surface objective mismatch** — the #1 blocker; (b) drone motion blur / rolling shutter; (c) thermal's time-of-day dependence; (d) RGB+thermal on **one CSI port** + 2 GB RAM; (e) drone EMI if any EMI sensor is attempted.
9. **Major budget risks:** thermal (Lepton) and any 3D LiDAR dominate cost; hyperspectral would blow the budget; India pricing for several items still unverified.
10. **Pi 4B 2GB risks:** 2 GB RAM ceiling; single CSI port; shared USB bus; thermal throttling under sustained load; **no onboard real-time deep AI / no training** — offline-first is the mitigation.
11. **Requires physical bench verification:** exact CUAV V6+ TELEM port/pinout/voltage & read-only tap; USB/OTG laptop↔Pi retrieval; Pi combined-workload benchmark; power-bank sustained 3 A + brownout behaviour; camera GSD at chosen altitude; SSD sustained write; H12/existing-camera feed availability.
12. **Requires further research:** final altitude/spacing/overlap/speed (mission parameters); AI approach *after* modality is fixed (ACE/matched-filter vs light NN for surface); multispectral value; India pricing gaps.
13. **Questions that MUST be answered before final component selection:**
    - **Is MineGuard's target surface-laid mines (feasible) or buried mines (not feasible aerially)?** Everything hinges on this.
    - What operating altitude does the chosen sensor's GSD/PoD actually require?
    - Can the Pi 4B 2GB sustain the intended simultaneous sensor set (benchmark result)?
    - Is the existing downward camera in-scope or existing-platform (budget exclusion)?
    - What is the confirmed CUAV V6+ read-only interface?
    - Power: bank vs UPS, and measured runtime under real payload?

---

### Status
**No repository files created. No scaffold. No code. No architecture finalized. No purchases. No budgets produced.** Every selection above is a *candidate*, not a decision. The biggest open question — **surface vs subsurface mission scope** — should be resolved with the team/guide before we translate this study into the four budgets.
