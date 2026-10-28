# BITM Ballari · 5 km Satellite Map Mode

**Scope:** Optional visual geographic overlay for MineGuard's existing virtual Red/Blue simulation. **Not real landmine detection, real terrain elevation, GPS navigation, or ground-clearance assessment.**

## Area and registration

- Campus: Ballari Institute of Technology & Management (BITM), Jnana Gangotri campus, Ballari–Hosapete Road, Karnataka, India.
- Visual map center: **15.168082°N, 76.850186°E**, taken from BITM's own campus geotagged teaching material (2024): [BITM evidence PDF](https://www.bitm.edu.in/assets/frontend/pdf/2023/2.3.2-Addl-Info.pdf). The exact centre is an approximate campus location, not a cadastral survey.
- Radius: **5,000 metres** from centre, shown by a yellow circle.
- Imagery extent: **10 km × 10 km square**, circumscribing that circle; the corners of the square lie outside the 5 km circle. The square is a north-up WGS84 local tangent-plane projection.
- Coordinate convention: simulator world X/Z both **0–200**. BITM centre is X 100 / Z 100. X increases east; Z increases south. Every virtual unit corresponds to **approximately 50 metres on this display-only map**, not a real drone measurement. `shared/geographic.ts` is the single source for conversion.
- Virtual route and detection remain unchanged. The 3D procedural hills under the imagery are **illustrative, not actual measured DEM elevation**, so exact slopes, altitude, structures, trees and visibility cannot be inferred from the map.

## How to use (no change to rooms)

1. Run a current MineGuard checkout via `npm ci`, `npm run build`, `npm start`.
2. Open `http://localhost:3000/red` and `http://localhost:3000/blue` or the public Blue room link on another device.
3. Under the existing 3D world, select **BITM Satellite · 5 km** in **Map view**. A live satellite image is requested directly by that browser from Esri World Imagery and draped over the existing **synthetic** hills. Fake scene roads/trees/buildings are hidden in this mode. The yellow circle is the requested 5 km radius.
4. Select **Original 3D** to instantly return to MineGuard's default world, with fake roads/trees restored. Your room, private Red objects, Blue flight, detections, historical mission records and checksum do not change.
5. Both Red and Blue browsers can independently select the **same fixed, deterministic BITM registration**. This is a browser-local visual preference; the room does not force the other visitor's visual choice.
6. Online source requires internet from the **viewer's browser**, including mobile clients. If it fails, the original colored terrain remains visible and a clear error appears; the app does not expose private objects or fail the flight.

## Offline / imported map image

Use **Import licensed map** in the map selector to choose a PNG, JPEG or WebP file of **15 MB or less** that you are permitted to use. This enables browser-local offline viewing (assuming the app itself is reachable from the local server). The image must be a **north-up image** representing the same approximate 10 km square: its **centre** must be BITM, and the top edge must be geographic north. Any other crop will visually misalign hazards/waypoints. The import is not sent to the server, stored in SQLite or shared with other devices, and is lost on page refresh; reimport on each device as needed.

**Important:** MineGuard does **not** bulk-download, cache, scrape, redistribute or export Esri/Google imagery. Online imagery is a single live display request per browser per selection. An offline local file must be independently licensed for the user's intended use. Simply saving satellite tiles without a valid license is not permitted.

## Satellite provider and legal attribution

The visual `BITM Satellite` option uses the ArcGIS **World Imagery** MapServer **single-image export** interface directly from the user's browser: `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export`, with WGS84 `bbox` and 2048 × 2048 image request. There is no background cache, tile crawler or download tool. The screenshot source is explicitly identified as **Esri World Imagery · Powered by Esri**, with a visible terms-of-use link in the interface.

- [Esri website and service terms](https://www.esri.com/en-us/legal/terms/web-site-service): noncommercial educational usage and attribution need to satisfy provider conditions; services can change or restrict access. Commercial redistribution is not authorized by this project.
- [Esri basemap attribution guidance](https://support.esri.com/en-us/knowledge-base/what-is-the-correct-way-to-cite-an-arcgis-online-basema-000012040): imagery involves third-party data contributors; credits may vary by location and date.
- [BITM location evidence](https://www.bitm.edu.in/assets/frontend/pdf/2023/2.3.2-Addl-Info.pdf).

**Provider availability note:** Automated browser tests intercept the external image request with a tiny local test image to validate UI/texture loading without depending on an external service. They do **not** establish that the live World Imagery service is available, that the same image is accessible on every network, its date/resolution, or legal rights for a particular commercial distribution. If Esri requires authorization or rejects the request in a particular network, use user-owned/licensed imagery instead.

## Architecture and security notes

- `shared/geographic.ts`: BITM centre/bounds, lat/lon ⇄ local simulator X/Z, radius and single-image URL builder. No new server schema or private state.
- `client/src/world/Terrain.tsx`: optional texture on the same procedural mesh. Falls back to the original colored mesh if image loading fails.
- `client/src/world/GeoOverlay.tsx`: school marker and 5 km ring (simulator visual only).
- `client/src/world/WorldView.tsx`: browser-local map selector and optional file import available to both portals.
- `GET /api/world`, world checksum, rooms, scenario object types, attacker capability, route bounds, sensor radius, scores and task statuses are **unchanged**. Live external provider does not receive room code, attacker token, sensor decisions or object locations; only the fixed BITM lat/lon bounding box is in the public image URL.
- 5 km radius indicator denotes a visual **map area**; it never represents a mine clearance, field-verified coverage or physical flight permission.

## Verification

- Run `npm run typecheck`, `npm run build`, `npm test` and `npm run test:e2e` with a supported browser.
- `server/test/geographic.test.ts`: projection and radius, bounds, source URL and invariants.
- `tests/e2e/geographic.e2e.ts`: both portals switch to the same fixed BITM preset, load **mocked imagery**, maintain checksum, revert to original, and local image import.
- This map enhancement is independent of unfinished **MG-011 physical LAN/HTTPS validation**. It must not turn MG-011 into DONE or unblock MG-012 without actual two-device evidence.
