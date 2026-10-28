# BITM Ballari Satellite View — 5 km Geographic Reference

## What this enhancement adds

MineGuard can switch the **same existing Red/Blue Three.js world** between three visually distinct backgrounds:

1. **Original 3D:** The unchanged fictional MineGuard 200×200 X/Z virtual terrain with its original hills, roads, trees, and landmarks.
2. **BITM satellite:** A live, properly credited geographic imagery layer covering a **10×10 km square centered on BITM Ballari**, with a clear yellow **5 km radius circle** and BITM marker. The original 3D camera, picking, waypoints, Red/Blue object rules, and mission simulation remain operational.
3. **Offline image:** A locally selected JPG/PNG/WebP map (under 20 MB, square ≥256px) representing the **same 10×10 km north-up extent**, from a source for which the user has explicit reuse/storage rights. This lives only in the current browser tab; no image or licence is uploaded to the server, shared to other browsers, or saved by MineGuard.

**This is a visual geographic reference, NOT a real GPS flight planner, real 3D elevation model, real geographic detection, geofenced survey, or actual hazard location.** The original simulation still operates strictly in fictional X/Z units; the yellow circle only indicates approximate geography. The three existing camera modes, candidate privacy and result reporting remain unchanged. Its fictional 200-unit square is *visually* mapped to 10 km across for imagery only; do not interpret the 6/10/16 virtual-unit sensor radii as calibrated real-world metres.

## Location and map data

- **Campus:** Ballari Institute of Technology & Management (BITM), Jnana Gangotri campus, Ballari-Hosapete Road, near Allipura, Ballari, Karnataka.
- **Approximate geographic centre (not a survey-grade boundary):** **15.167900° N, 76.850231° E**, derived from BITM institutional geotagged campus photographs (N 15° 10′ 4.44″, E 76° 51′ 0.8316″). The marker may not be the exact gate or center of the owned campus.
- **Reference circle:** 5,000 metres from that approximate centre. Reference square: 10×10 km. North is toward increasing geographic latitude, and world Z increases south on the image.
- **Coordinate math:** Shared `shared/geo.ts` maps X/Z to Web Mercator, applying a constant latitude scale near campus, and calculates standard XYZ tile intersections for zoom 13/14/15. Round-trip and coverage tests ensure orientation and geometry. It is an approximation over a local 10km patch, not a GIS-grade cadastral projection.
- **Live provider:** Esri World Imagery (`server.arcgisonline.com/.../World_Imagery/...`). Attribution is displayed on-screen as **“Imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community”**. Esri publishes noncommercial viewing terms; verify that any future commercial deployment has the necessary provider license.
- **Provider usage:** Tiles are requested in bounded small batches to create a temporary browser-only texture. No mass download, permanent caching, tile redistribution, offline seeding, backend proxying or silent scraping of Google Maps/OSM public tile servers is included.

Sources: https://www.bitm.edu.in/contact-us ; https://www.bitm.edu.in/assets/frontend/pdf/2023/2.3.2-Addl-Info.pdf ; https://www.esri.com/en-us/legal/terms/web-site-service ; https://doc.arcgis.com/en/data-appliance/2023/maps/world-imagery.htm .

## How to use

1. Update from GitHub `main` only after the new feature PR is merged. Run `npm ci`, `npm run build`, and `npm start`.
2. Open Red `/red` or Blue `/blue` — both use the same `WorldView` component, so both have the **World background** picker.
3. Click **BITM satellite** to load the live imagery. Its download requires Internet access. Choose **Balanced** by default; **Fast** requests fewer tiles, **Detailed** requests more. An error leaves the original fictional terrain visible rather than silently misrepresenting an incomplete satellite layer.
4. A yellow circle and marker indicate the approximate 5 km reference around BITM. The underlying 3D ground retains the **original procedural simulated elevation**: the satellite image is draped onto fictional hills, **not** an elevation dataset. Roads and trees drawn by the fictional simulator are temporarily hidden when imagery loads, to avoid confusing them with observed geographic features.
5. For an offline map, click **Offline image**, select a correctly north-up, pre-cropped square 10×10 km BITM image for which you have rights. This image is fitted to the fictional world without verifying your file's georeferencing, and is NOT uploaded or synced. Each device needs to import its own copy for offline mode.
6. Click **Original 3D** to restore the original terrain, trees, roads and landmarks, including identical server checksum. The saved preference remembers only the live satellite toggle in the same browser, not private data or imported image files.

## Why the existing game still works

- The server's public `GET /api/world` checksum, dimensions, procedural heights, saved rooms and Red scenario data **are unchanged**.
- Picking uses the existing `Terrain` geometry and camera; the new map is a texture applied to that exact surface. There is **no lat/lon API** in mission, sensor, room or report logic.
- Both portals render the same optional satellite layer on their own browsers and continue to display their role-specific overlays; no attacker truth leaks to Blue.
- 5km circle and campus marker are decorative scene geometry with raycast disabled, so they never intercept hazard placement or waypoint clicks.
- Changing background cannot change route length, eligibility or scanning rules. Simulated map zoom means tile/detail zoom only, not X/Z world scale.

## Validation / known limitations

- `server/test/geo.test.ts` validates centre, radius, compass orientation, coordinate round trips, tile bounds and original-world integrity.
- `tests/e2e/geo.e2e.ts` uses an **entirely synthetic mocked image** in Chromium to verify live mode, satellite attribution, offline import, toggle back to original and preserved checksum. No commercial satellite content is downloaded by CI.
- Full existing tests must pass before merge; GitHub Actions outputs are authoritative. These unit tests cannot assert true imagery sharpness or provider uptime in Ballari, which depend on live Esri availability and licensing.
- **Offline mode only works if the user supplies a suitable licensed cropped image.** MineGuard does not manufacture, download, or package a 5km-radius offline satellite raster automatically.
- **No actual terrain elevation/DEM is included.** A future version may load a licensed DEM with explicit vertical datum, resolution, and physical scaling, plus separate mission-coordinate support after acceptance testing.
- **MG-011 remains IN_PROGRESS** until real physical phone and HTTPS tunnel tests are performed; this enhancement does not skip the task gate or certify physical network tests.
