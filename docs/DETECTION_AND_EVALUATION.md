# Virtual Sensor & Result Evaluation Contract

- Hazard = synthetic Red scenario object; Decoy = harmless synthetic object; Candidate = simulator-generated detection observation.
- Virtual X/Z = fictional map units, NOT GPS.
- Survey coverage = area intersected by simulated footprint, NOT guaranteed mine-free/safe ground.

## Profiles
Narrow/Standard/Wide are 3 virtual radii configured centrally. The server and 3D visual footprint must use identical values, recorded in mission reports. No claim that values reflect RGB/thermal/LiDAR real-world capability.

## Basic
Every ACTIVE virtual hazard that intersects swept scan footprint is mapped ONCE per mission. No out-of-range reveal. Prefer decoys ignored in Basic for a deterministic live demo. A 'buried' virtual hazard detected in Basic is a fictional rule, not evidence of subsurface sensing.

## Advanced
Use deterministic PRNG seed and documented synthetic probability by virtual hazard category; optionally decoy false alarms and misses. Only consider actually scanned objects active at scan time. This is an experimental simulated detector, not trained AI or verified hardware accuracy. No real CV confidence claims.

## Server algorithm
1. Advance drone from previous X/Z to new X/Z along planned route.
2. Compute swept sensor footprint (including segment path at 4x speed).
3. Query private, currently active objects intersecting footprint.
4. Evaluate Basic/Advanced mode, deduplicate and append observation + audit event.
5. Publish only candidate ID/virtual coordinates/time/profile/review state to Blue.
6. On finish, authorize ground-truth reveal and compute evaluation.

## Metrics
TP = correctly observed unique synthetic hazards within the defined eligible truth set.
FP = candidate observation on decoy/unmatched object.
FN = eligible scanned hazard not observed.
Unscanned hazards are reported SEPARATELY (do not silently treat them as sensor false negatives).
Precision = TP/(TP+FP), N/A for denominator 0.
Recall = TP/(TP+FN), N/A if eligible truth set empty.
Include total placed hazards, scanned eligible hazards, unscanned hazards, percent swept area over designated survey area, route length, sim time, and mode/seed. For Live mode, evaluate each object's active time intervals and explicitly label time-sensitive results. No hardcoded metrics.

## No misleading real-world claims
Do not say virtual detections prove buried landmines can be identified by RGB. Do not label surveyed territory as cleared. No live ordnance. Any future physical CV experiments use safe harmless surrogate test images and separate validation.
