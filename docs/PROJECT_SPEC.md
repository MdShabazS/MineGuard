# Product Requirements — Red / Blue MineGuard Digital Twin

## One fictional shared 3D world
Create a lightweight attractive 3D field with open ground, roads, a few hills/trees and clear survey bounds. Both portals share exactly one terrain and coordinate system (virtual X/Z). Render quickly in standard laptop browsers. No real geographical mine positions.

## Red Team portal
Create a room and obtain a short code, shareable defender URL, private attacker capability URL. Place surface-visible, partially obscured or buried **virtual** hazard objects and harmless decoys by clicking terrain or entering X/Z. Select, move, change, and delete. See all placements, object count, and revision history. Lock Challenge mode before flight, or permit recorded live edits in Live mode. Optionally show where the defence drone is flying.

## Blue Team portal
Join with room code or defender link; see identical terrain but never hidden hazard coordinates. Generate manual waypoint flight or an automatic rectangular zigzag survey, with route preview and bounds validation. Select Basic or Advanced sensing and Narrow/Standard/Wide footprint. Start/pause/resume/stop the virtual drone, adjust 1x/2x/4x playback, and switch among Overview/Follow/Top-Down views. Display scanning footprint, virtual telemetry, elapsed simulation time, progress and covered region.

## Candidate detection and mapping
Server checks virtual objects only when they enter a swept scan footprint along the drone's actual flight. Emit a candidate event once per eligible hit, not instant omniscient reveal. Auto-place a detection pin on the Blue map, detail card (ID, virtual coordinates, simulated time, sensor/profile, review status) and maintain flight progress. Out-of-range virtual hazards remain hidden. In Advanced mode, synthetic misses/decoy false alarms may occur and are flagged as simulated.

## Finish and report
At mission finish, reveal the hidden scenario and compare with reported virtual observations. Distinguish detected, missed-in-covered-area, and not-scanned targets; show route/coverage, precision/recall where denominators are defined, virtual coordinates, configured modes and synthetic limitations. Download/print mission report without leaking attacker tokens. Never describe covered zones as cleared/safe.

## Reliability and deployment
Works in two tabs and on two different devices. Online route through a tested HTTPS tunnel or equivalent to host laptop. Offline fallback through the same server reachable at its LAN IP over local Wi-Fi/hotspot; bundled frontend assets must not need internet. Server persists room progress in SQLite or suitable local runtime DB. GitHub stores source/reproducible setup and sanitized evidence, not active private room data.

## Definition of demo success
Attacker plants several objects (including one outside selected route), defence joins unable to view their coordinates, launches simulated flight, only in-range candidates appear and map, mission finishes and report accurately compares findings. Rahil must test actual behavior.

## Non-goals
Not a real mine detector, no weapon-related field operations, no validated subsurface detection, no real flight controller or sensor input, no fabricated ML confidence, no photorealistic/game-engine physics dependency.
