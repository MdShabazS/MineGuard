# MG-011 — LAN and Online Two-Device Test Runbook

> **Scope:** MineGuard V0.1 Red/Blue educational virtual world, NOT real landmine detection or site clearance. The two roles must connect to **the same running Express+Socket.IO+SQLite process**. A screenshot, CI test, or two tabs on one laptop is **not** evidence of two physical devices.

## Prerequisites and safety

- Computer (Windows 11, macOS or Linux) with Node.js 24 recommended (22.13+ supported), Git, Chrome/Edge, current official MineGuard main checkout; a second **physical** phone or laptop with a modern browser.
- For LAN: both devices on the same trusted private Wi-Fi or routable private Ethernet network. Disable guest isolation or use a trusted hotspot. Phone and host should not have an intercepting VPN.
- Use a fresh demo room. Do **not** use real hazardous-object coordinates. Never paste private attacker-token URLs or tunnel credentials into an issue, evidence log, screenshot, recording or public chat.
- Default server binds to all interfaces (0.0.0.0); only start it on a network you trust. Do not set up direct router port-forwarding or switch off the host firewall.
- The person doing manual testing must record **what they actually observed**, not anticipated results. A successful CI simulation is helpful but does not replace physical testing.

## Step 1 — Prepare one authoritative server

On the host computer, in the repository checkout:

```bash
git switch main
git pull --ff-only origin main
node --version
npm ci
npm run typecheck
npm run build
npm start
```

Keep the terminal window running. The final command starts a single server on port 3000, **not the Vite development server**. The host terminal prints `Local: http://localhost:3000` and one or more possible LAN URLs. Those URLs are candidates only. Run all Blue/Red routes, HTTP APIs and Socket.IO through **port 3000**. No Metro or Vite process is needed after building.

Optional: set `PORT` to a different port, and optionally set `MINEGUARD_HOST=127.0.0.1` for loopback-only use; 127.0.0.1 does *not* permit phone access.

## Step 2 — Identify and check host LAN address

- Windows PowerShell: `ipconfig`; look for IPv4 Address on the active Wi-Fi/Ethernet adapter (commonly `192.168.*.*` or `10.*.*.*`).
- macOS terminal: `ipconfig getifaddr en0` (Wi-Fi on many Macs) or inspect active network details in System Settings > Network. `ifconfig` is a fallback.
- Linux: `hostname -I` or `ip -4 addr`.
- Avoid `127.0.0.1`, `169.254.*.*`, tunnel/VPN interfaces and the phone's own IP. Host firewall may require allowing incoming connections to Node on **private/trusted network only** or inbound TCP port 3000. Do not disable the firewall entirely.

From a **second terminal** on the host, run:

```bash
npm run lan:check -- 192.168.1.25 3000
```

Replace the example with the host's actual LAN IPv4 and port. Successful host-side preflight checks `/api/health`, the production HTML, `/api/world` privacy, and Socket.IO WebSocket ping/ack through that address. **This is not proof that a different device can connect.**

## Step 3 — Physical LAN test (required to close MG-011)

1. Connect the physical phone to the same private network. On the phone's browser enter `http://HOST_LAN_IP:3000/api/health`. Expect JSON with `status: ok` and `service: mineguard-server`. If unreachable, do not claim PASS.
2. On the phone open `http://HOST_LAN_IP:3000/blue` and on the computer open `http://localhost:3000/red` (or reverse). Make a fresh synthetic Red room on the computer and only share the **public defender link** or 6-character code.
3. Place two invented hazards and one decoy in Red. Verify the phone Blue screen shows the same terrain/checksum but **no private object positions or Red bearer token**. Verify the private control link stays on the intended Red machine.
4. Lock Challenge scenario. On Blue, set two Manual waypoints or a small Grid route, confirm and start the simulated mission. Observe live position and candidate pins from the phone while the Red computer tracks the same mission.
5. On the computer pause, resume, then stop or finish the virtual flight. Check phone updates and refresh. Verify historical truth remains unavailable until explicitly clicking **Reveal & Compare** after FINISHED.
6. Reveal and compare; check that both devices see the same frozen counts. On a compatible physical browser, open **Print / Save as PDF** and verify readable pages. It is printable HTML, not a server-generated binary `.pdf` download.
7. Turn the phone Wi-Fi off for a short period, then turn it back on. Verify the UI indicates reconnecting, automatically rejoins the same room and restores the correct server snapshot without duplicating candidates. Do not confuse a different room with a reconnect.
8. Lock the phone / switch apps and return; check the room still reconnects correctly. Test on the real phone viewport for controls, readable text, touch/tap and the 3D canvas. Report any WebGL or memory failure rather than skipping.

## Step 4 — Online/HTTPS access (required to close MG-011)

An internet tunnel must forward into **the same single port-3000 host process and the same SQLite file**; it must not start a second backend or create divergent rooms. No cloud deployment is claimed or included by default.

Cloudflare documents temporary Quick Tunnels for development, including optional one-time email access control. Install the **official** `cloudflared` on the host and check `cloudflared --version` (for installation: https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/). In a new terminal:

```bash
cloudflared tunnel --url http://localhost:3000
```

For a less publicly exposed demonstration, use its current documented allow-list option where supported:

```bash
cloudflared tunnel --url http://localhost:3000 --allowed-mail allowed-tester@example.com
```

Replace that illustrative address with an actual approved tester's email; never add it to Git. Confirm the flag with your installed cloudflared version. The command displays a newly generated HTTPS `trycloudflare.com` URL. **Do not fabricate this address.** Cloudflare Quick Tunnel is temporary and not recommended for production. Anyone with the public URL can reach the app unless access control is enabled. Room codes gate Blue participation and post-reveal results, while Red modification requires the separate long random private capability.

9. Take the phone off the shared Wi-Fi and use mobile data so the test genuinely traverses the public internet. Open the **actual** HTTPS tunnel URL. Create/join the *same* room on the still-running host server. Ensure WebSocket joins and live Red/Blue updates work over the tunnel, not merely the HTML shell.
10. Create/observe one new synthetic candidate or a fresh room revision and confirm it propagates between the internet-connected phone and the local computer. Verify same terrain checksum and room revision on both.
11. Toggle phone connectivity and reload during the session. Document any latency, dropped socket, platform timeout, tunnel restrictions or mobile WebGL limitation; don't assume it works.
12. End the demonstration and stop the tunnel with Ctrl+C. Confirm its temporary public URL is no longer accessible. Keep Node running only for intended private LAN sessions, then shut it down when not needed.

Cloudflare primary references: https://developers.cloudflare.com/tunnel/concepts/ and https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/ . Always follow the currently installed cloudflared version's help output for exact options.

## MG-011 acceptance checklist — real evidence required

| ID | What must be directly observed | LAN | Internet |
|---|---|---|---|
| N01 | Phone opens host server health and Blue page on a different physical device | □ | □ |
| N02 | Red and Blue connected simultaneously to same room and checksum | □ | □ |
| N03 | Live server revisions and candidate events propagate via Socket.IO | □ | □ |
| N04 | Red private object IDs/coordinates/token never appear in Blue before reveal | □ | □ |
| N05 | Lock, mission controls, status and refresh work through same server | □ | □ |
| N06 | Reconnect after Wi-Fi loss or mobile-data interruption restores state | □ | □ |
| N07 | Phone viewport/touch and 3D rendering usable (note device model/browser) | □ | □ |
| N08 | Post-finish explicit Reveal & Compare and printable report verified | □ | □ |
| N09 | No private Red link or credentials placed in evidence or shared with Blue | □ | □ |
| N10 | Tunnel closure confirmed; no unsanctioned port forwarding | N/A | □ |

## Evidence required before marking DONE

The physical tester must state: date/time (timezone), host OS, Node version, host browser, phone make/browser/version, LAN type (Wi-Fi/hotspot), tunnel service and version, the real test steps, exact observed PASS/FAIL of N01–N10 for LAN and internet, sanitized screenshots or console logs, and known limitations. Do not publish real private room tokens, generated Red URLs, unique credentials or active operational database. Write `tasks/evidence/MG-011.md` only with actual evidence; use `Tester: Rahil` or `Tester: Shabaz` for the person who performed physical tests and note separate CI runner results.

**Decision rule:** If either physical LAN or online trial has not been executed, keep MG-011 **IN_PROGRESS**. MG-012 must stay blocked. Two same-machine Chromium contexts or a CI network interface alone do not satisfy the physical requirement.

## Troubleshooting

- Phone loads nothing: use host LAN IP, not `localhost`; both devices must share a reachable private network; check Wi-Fi client isolation, phone VPN, firewall, correct port and that host is awake.
- App loads but spinner says reconnecting: verify `/socket.io/` and WebSocket access (proxy supports upgrades), check Console/Network > WS on desktop; restart client after server recovers.
- Works locally but not via HTTPS: confirm tunnel command and actual URL; set HTTPS link as the phone's page origin, never mix local HTTP URLs inside it. Quick Tunnel URLs expire when stopped.
- Blank canvas on mobile: update mobile browser, check WebGL support/GPU memory, minimize other apps and record limitation. Do not interpret display failure as backend failure.
- Port in use: stop old MineGuard process or set a different `PORT` and use the exact same port in tunnel and preflight.
- Unexpected old room after restart: only one SQLite file per server. Use the correct original host and do not start a second copy; `data/mineguard.sqlite` is not committed.
