# MineGuard — Detection-Scope Decision Support

**Purpose:** resolve *surface vs subsurface* scope before component selection · **For discussion with the project guide**
**Status:** analysis only — no budgets, no component selection, no objective changed.

---

## 1. Original Project Objective (Phase-1 deck, historical)

The Phase-1 review deck stated MineGuard would *"detect **subsurface** landmines accurately"* using a **metal-detector coil + thermal camera + sensor fusion**, geo-tag each threat via GPS, and map it — an autonomous drone replacing manual ground sweeping. In other words, the original intent was **aerial detection of *buried* mines.**

## 2. Current Proposed Concept

An **existing autonomous drone (CUAV V6+, QGC survey/grid missions)** carries a **Raspberry Pi 4B 2 GB** that **reads FC telemetry (read-only)** and records **downward-facing sensor data** (candidate RGB / thermal / LiDAR) locally, offline-first, at an **initial ~5 m test altitude**, for **post-landing analysis and mapping** (with an optional online dashboard). The concept is a **research prototype for detecting and mapping mine threats from the air.**

## 3. The Technical Conflict (precisely)

The evidence divides sensing into two non-overlapping regimes:

| | **Buried / subsurface** | **Surface / near-surface** |
|---|---|---|
| Proven sensors | **GPR + metal detector** (mature, field-trialled) | RGB, thermal, hyperspectral |
| Required geometry | **Ground-coupled / cm-scale proximity** | Metres of altitude OK |
| Aerial-compatible? | **No** | **Yes** |

Why ~5 m aerial **cannot** reliably do subsurface detection:
- **Metal-detector coils** sense metal only at **centimetre-scale** distance (low-frequency EM induction "at or below the surface"). At 5 m they detect **nothing** — a physics limit, not a tuning problem. `[IJERT review]`
- **GPR**, the actual buried-mine workhorse, is **ground-coupled**; it is not a metres-altitude aerial sensor. `[IEEE / IJERT]`
- The one *aerial* electromagnetic option, a **magnetometer**, needs **1–2 m altitude** for good probability of detection (**75% at 6 m, 3 m/s**), only finds **metal-cased** mines (misses minimum-metal/plastic), and suffers **drone self-EMI** and low-altitude flight risk. `[MDPI Sensors 21/9/3175]`
- **RGB and thermal**, which *are* comfortable at altitude, are **surface sensors**: RGB = reflected light (surface only, **94.8%** on surface PFM-1); thermal = **surface temperature contrast**, diurnal-dependent (**~88%**, best in the evening). Neither sees a buried object directly. `[arXiv 2602.10434 / 2410.23998]`

**Conclusion of the conflict:** the drone platform is excellent for the sensors it can carry, but **those sensors are surface sensors.** The original "aerial + subsurface" pairing is internally inconsistent with the physics.

---

## 4. Three Possible Directions

### OPTION A — Redefine objective as surface/near-surface anomaly detection + mapping (aerial)
- **Expected output:** geo-referenced map of **surface-laid / scatterable mines and surface anomalies** (disturbed soil, thermal/optical signatures) with confidence flags.
- **Advantages:** matches the physics and the existing drone; strong published precedent; usable **public datasets exist** (SULAND_v2, Binghamton scatterable, VNIR benchmark); Pi-4B-feasible offline-first.
- **Drawbacks:** does **not** address deeply buried mines — the hardest, most dangerous class.
- **Hardware:** RGB (global-shutter preferred) + optional thermal + single-point LiDAR for altitude; no coil/GPR.
- **Cost:** lowest–moderate; no exotic sensors.
- **AI:** surface object/anomaly detection or spectral methods (ACE/matched-filter/light NN) — decided *after* modality; trainable on laptop from public data.
- **Testing:** surface surrogate targets, altitude/GSD trials, day-vs-evening thermal, quantitative PoD/false-alarm.
- **Feasibility:** **High.**
- **Major risks:** scope perceived as "narrower" than Phase-1 promise; thermal weather/time dependence.

### OPTION B — Keep subsurface objective, change platform/sensing to ground-proximity
- **Expected output:** true **buried-mine** detection via GPR and/or metal detector at ground contact.
- **Advantages:** addresses the original, higher-value problem; proven detection science.
- **Drawbacks:** **abandons the aerial concept** — GPR/MD imply a UGV/handheld/very-low rig, not a 5 m drone; largest redesign.
- **Hardware:** GPR unit + metal detector + ground platform — heavy, expensive, integration-intensive; existing drone becomes largely irrelevant.
- **Cost:** **Highest** (GPR alone is costly; new platform).
- **AI:** GPR signal processing / MD+GPR fusion — different, harder pipeline; fewer aerial datasets apply.
- **Testing:** buried surrogate targets at controlled depths; soil-mineralization studies; far more demanding.
- **Feasibility:** **Low** within current resources/timeline and the "existing drone" premise.
- **Major risks:** cost, schedule, throws away the drone investment, high complexity.

### OPTION C — Aerial prototype **defined as** surface/near-surface, subsurface = explicit future work
- **Expected output:** same deliverable as A, but **framed as a validated first stage** of a roadmap whose future phase targets subsurface (via B-type methods).
- **Advantages:** keeps the ambitious vision **honestly on record** without over-claiming now; preserves academic narrative ("prototype → future subsurface"); every A benefit applies.
- **Drawbacks:** requires disciplined language so reviewers don't read it as full subsurface capability today.
- **Hardware / Cost / AI / Testing:** **same as Option A** for the build phase; future-work section documents B without funding it now.
- **Feasibility:** **High.**
- **Major risks:** mainly communication — must be explicit that subsurface is *future*, not *delivered*.

---

## 5. Recommendation *(recommendation — NOT a confirmed decision)*

`[REC]` **Option C.** It is the only choice that is simultaneously **physically honest**, **buildable on the existing drone + Pi 4B**, **supported by real datasets and literature**, and **respectful of the Phase-1 ambition** by carrying subsurface forward as documented future work rather than silently dropping or over-promising it. Option A is essentially C without the roadmap framing; Option B is scientifically valid but effectively a different, much costlier project. Within C, the low-risk build is **RGB-led surface detection + LiDAR-based altitude/mapping, thermal as an evaluated add-on** — but **no component is selected here.**

**This is a recommendation for the guide's decision, not a project decision.** The objective is unchanged until the guide rules.

---

## 6. Questions to Ask the Project Guide (before component selection)

1. **Scope:** Should MineGuard's *deliverable* target **surface-laid mines** (aerially feasible) or **buried mines** (requires ground-proximity, non-aerial)?
2. **Original claim:** Is the Phase-1 "subsurface detection" objective a **hard requirement**, or acceptable to **restate as future work** (Option C)?
3. **Platform:** Must we keep the **existing aerial drone** as the platform, even though that constrains us to surface sensors?
4. **Acceptable evidence:** For evaluation/review, is **detecting and mapping surface anomalies** an acceptable demonstration of success?
5. **Metal/GPR:** Do you want any **magnetometer/metal/GPR** work included at all — even as a **separate low-altitude/ground experiment** — or excluded from this prototype?
6. **Altitude:** Is **~5 m** flexible? Some sensors (magnetometer) would need **1–2 m**, which changes flight risk and mission design.
7. **Roadmap:** If we adopt Option C, do you approve **documenting subsurface as a future phase** with its own platform/budget later?

---

**No budgets created. No components selected. No files written when this analysis was produced. Project objective unchanged pending the guide's decision.** Once the guide answers Q1–Q2 (scope), the four budget groups can be aligned to the confirmed scope.
