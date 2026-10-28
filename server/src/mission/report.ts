import { cumulative, flownSubsegments } from '../../../shared/mission.js';
import { FOOTPRINT_RADIUS } from '../../../shared/sensor.js';
import type { FrozenMissionResult } from '../../../shared/results.js';

// Standalone print-ready HTML. No network/remote assets, WebGL, or private tokens.
// Use the browser's Print / Save as PDF control; this is NOT a fake PDF file.
const esc = (v: unknown): string => String(v ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
);
const fixed = (n: number) => Number.isFinite(n) ? n.toFixed(1) : 'N/A';
const ratio = (n: number | null) => n === null ? 'N/A' : fixed(n * 100) + '%';
const metric = (name: string, value: number | string) =>
  '<div class="metric"><strong>' + esc(value) + '</strong><span>' + esc(name) + '</span></div>';

function reportMap(r: FrozenMissionResult): string {
  const xy = (x: number, z: number) => (40 + x * 1.95).toFixed(1) + ',' + (40 + z * 1.95).toFixed(1);
  const planned = r.plan.waypoints.map((p) => xy(p.x, p.z)).join(' ');
  const segments = flownSubsegments(r.plan.waypoints, cumulative(r.plan.waypoints), 0, r.actualFlownDistance, 0, r.simTimeSeconds);
  const flown = segments.length ? [segments[0].from, ...segments.map((s) => s.to)].map((p) => xy(p.x, p.z)).join(' ') : '';
  const objects = r.truth.map((o) => {
    const p = xy(o.x, o.z).split(',').map(Number);
    const marker = o.kind === 'HAZARD'
      ? '<rect x="' + (p[0] - 4) + '" y="' + (p[1] - 4) + '" width="8" height="8" fill="white" stroke="black"/>'
      : '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="4" fill="white" stroke="black"/>';
    return '<g>' + marker + '<text x="' + (p[0] + 6) + '" y="' + (p[1] - 6) + '" font-size="10">' + esc(o.reportObjectLabel) + '</text></g>';
  }).join('');
  const candidates = r.candidates.map((c) => {
    const p = xy(c.x, c.z).split(',').map(Number);
    return '<circle cx="' + p[0] + '" cy="' + p[1] + '" r="7" fill="none" stroke="black" stroke-dasharray="2 2"/>' +
      '<text x="' + (p[0] + 8) + '" y="' + (p[1] + 10) + '" font-size="10">C' + c.number + '</text>';
  }).join('');
  const g = r.plan.grid;
  const grid = g ? '<rect x="' + (40 + g.xMin * 1.95) + '" y="' + (40 + g.zMin * 1.95) +
    '" width="' + (1.95 * (g.xMax - g.xMin)) + '" height="' + (1.95 * (g.zMax - g.zMin)) +
    '" fill="none" stroke="#888" stroke-dasharray="6 3"/>' : '';
  return '<svg viewBox="0 0 470 470" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Virtual survey map">' +
    '<rect x="40" y="40" width="390" height="390" fill="#fafafa" stroke="black"/>' +
    grid + '<polyline points="' + planned + '" fill="none" stroke="#888" stroke-width="2" stroke-dasharray="5 4"/>' +
    (flown ? '<polyline points="' + flown + '" fill="none" stroke="black" stroke-width="2.5"/>' : '') +
    objects + candidates +
    '<text x="40" y="26" font-size="12">X: 0–200 →</text>' +
    '<text x="40" y="450" font-size="12">Z: 0–200 ↓ · fictional virtual units (not GPS)</text></svg>';
}

const STYLE = [
  '@page { size: A4 portrait; margin: 14mm }',
  '* { box-sizing: border-box }',
  'body { font: 10pt/1.4 Arial,sans-serif; color: #111; background: white; margin: auto; max-width: 205mm }',
  'main { padding: 3mm }',
  'h1 { font-size: 21pt; margin: 0 0 3mm } h2 { font-size: 14pt; margin: 7mm 0 3mm }',
  '.tag { display: inline-block; border: 1px solid #333; font-size: 8pt; font-weight: bold; padding: 1mm 2mm }',
  '.muted,.small { color: #444; font-size: 9pt }',
  '.grid { display: grid; grid-template-columns: repeat(3,1fr); gap: 3mm; margin: 5mm 0 }',
  '.metric { border: 1px solid #999; padding: 3mm; break-inside: avoid }',
  '.metric strong { display: block; font-size: 19pt } .metric span { font-size: 8pt }',
  'dl { display: grid; grid-template-columns: 42% 58%; margin: 0 }',
  'dt,dd { margin: 0; padding: 1.2mm 0; border-bottom: 1px solid #ddd; overflow-wrap: anywhere } dt { color: #444 }',
  '.two { display: grid; grid-template-columns: 1fr 1fr; gap: 6mm }',
  '.map { width: 100%; max-width: 130mm; margin: auto } .map svg { width: 100%; height: auto }',
  'table { width: 100%; border-collapse: collapse; font-size: 8pt }',
  'th,td { border: 1px solid #aaa; padding: 2mm; text-align: left; vertical-align: top; overflow-wrap: anywhere }',
  'th { background: #eee } thead { display: table-header-group } tr { break-inside: avoid }',
  '.page { break-before: page } .notice { border: 1px solid #333; padding: 3mm; background: #f7f7f7 }',
  '.toolbar { background: #eee; padding: 12px; display: flex; align-items: center; justify-content: space-between }',
  '.toolbar button { padding: 8px 12px; border: 1px solid #444; background: white; cursor: pointer }',
  '@media print { .toolbar { display: none } main { padding: 0 } }',
].join('\n');

export function renderPrintableReport(r: FrozenMissionResult): string {
  const m = r.metrics;
  const candidateRows = r.candidates.map((c) => {
    const t = r.truth.find((x) => x.candidateId === c.candidateId);
    const classification = t?.disposition === 'DETECTED' ? 'TP: synthetic hazard' : 'FP: decoy false alarm';
    return '<tr><td>C' + c.number + '</td><td>' + esc(fixed(c.x) + ' / ' + fixed(c.z)) + '</td><td>' + fixed(c.simTimeSeconds) +
      '</td><td>' + esc(c.sensorMode + ' / ' + c.footprintProfile) + '</td><td>' + esc(c.review) +
      '</td><td>' + esc(classification) + '</td></tr>';
  }).join('');
  const truthRows = r.truth.map((o) =>
    '<tr><td>' + esc(o.reportObjectLabel) + '</td><td>' + esc(o.kind + '/' + o.subtype) +
    '</td><td>' + esc(fixed(o.x) + ' / ' + fixed(o.z)) + '</td><td>' + esc(o.disposition) +
    '</td><td>' + esc(o.candidateId ? ('C' + (r.candidates.find((c) => c.candidateId === o.candidateId)?.number ?? '?')) : '—') +
    '</td><td>' + esc(o.eventNotes.join('; ')) + '</td></tr>',
  ).join('');
  const info = (name: string, value: unknown) => '<dt>' + esc(name) + '</dt><dd>' + esc(value) + '</dd>';
  return '<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<title>MineGuard report ' + esc(r.missionId.slice(0, 8)) + '</title><style>' + STYLE + '</style></head><body>' +
    '<div class="toolbar"><strong>Standalone simulated mission report</strong><button onclick="window.print()">Print / Save as PDF</button></div><main>' +
    '<div class="tag">SIMULATED · NON-OPERATIONAL</div><h1>MineGuard V0.1</h1>' +
    '<p class="muted">Virtual Aerial Survey Simulation — Mission Report. Not a real mine detector, real clearance certificate or GPS survey.</p>' +
    '<div class="two"><dl>' +
    info('Room code', r.roomCode) + info('Mission ID', r.missionId) + info('Report ID', r.reportId) +
    info('Revealed at (UTC)', r.revealedAt) + info('World', r.terrainId + ' / ' + r.worldChecksum) +
    '</dl><dl>' + info('Scenario / route', r.scenarioMode + ' / ' + r.plan.routeKind) +
    info('Sensor', r.plan.sensorMode + ' / ' + r.plan.footprintProfile) +
    info('Virtual radius', FOOTPRINT_RADIUS[r.plan.footprintProfile] + ' units') +
    info('Completion', r.endReason) + info('Algorithm', r.sensorAlgorithmVersion) + '</dl></div>' +
    (r.endReason === 'STOPPED_EARLY' ? '<p class="notice"><b>Stopped early: partial virtual survey.</b> Unflown regions were not scanned.</p>' : '') +
    '<div class="grid">' + metric('True observations (TP)', m.tp) + metric('False alarms (FP)', m.fp) +
    metric('Eligible misses (FN)', m.fn) + metric('Never scanned', m.unscanned) +
    metric('Simulated precision', ratio(m.precision)) + metric('Simulated recall (eligible only)', ratio(m.recall)) + '</div>' +
    '<h2>Virtual flight summary</h2><dl>' +
    info('Planned length', fixed(r.plan.routeLength) + ' virtual units') +
    info('Actually flown', fixed(r.actualFlownDistance) + ' virtual units') +
    info('Simulated time', fixed(r.simTimeSeconds) + ' seconds') +
    info('Estimated swept area', fixed(r.coverage.sweptArea) + ' virtual units² (1-unit cell grid)') +
    info('Grid coverage', r.coverage.gridCoveragePercent === null ? 'N/A (manual route)' : fixed(r.coverage.gridCoveragePercent) + '%') +
    '</dl><div class="map">' + reportMap(r) + '</div>' +
    '<p class="small">Legend: dashed line = planned path; solid = actually flown; square H = revealed synthetic hazard; circle D = revealed decoy; dashed ring C = observed candidate. All truth appears only after explicit reveal.</p>' +
    '<section class="page"><h2>Candidate observations (' + r.candidates.length + ')</h2>' +
    '<table><thead><tr><th>ID</th><th>Virtual X/Z</th><th>Sim time</th><th>Sensor</th><th>Review</th><th>Truth after reveal</th></tr></thead><tbody>' +
    (candidateRows || '<tr><td colspan="6">No candidates on this mission.</td></tr>') +
    '</tbody></table><h2>Historical fictional truth (' + r.truth.length + ')</h2>' +
    '<table><thead><tr><th>ID</th><th>Category</th><th>X/Z</th><th>Disposition</th><th>Candidate</th><th>Recorded history</th></tr></thead><tbody>' +
    (truthRows || '<tr><td colspan="6">No active fictional objects during this mission.</td></tr>') +
    '</tbody></table></section>' +
    '<section class="page"><h2>How to interpret this report</h2>' +
    '<p>The server simulated a drone over a fictional 200×200 world and evaluated synthetic objects along only the actually flown path. The Red layout stayed private until a participant explicitly revealed this finished mission.</p>' +
    '<p>Basic emits a virtual candidate for every eligible scanned fictional hazard and ignores decoys. Advanced uses deterministic simulated thresholds: SURFACE 0.90, OBSCURED 0.70, BURIED 0.50 and decoys 0.20. They are programmed game rules, not measured sensor accuracy or subsurface capability.</p>' +
    '<p>Precision = TP/(TP+FP); recall = TP/(TP+FN) for eligible scanned hazards. Undefined denominators are N/A. Unscanned hazards are shown separately, not treated as misses. Covered virtual ground is NOT safe or cleared land.</p><ul>' +
    r.warnings.map((w) => '<li>' + esc(w) + '</li>').join('') +
    '</ul><p class="small">After-reveal seed: ' + esc(r.seed) + ' · Report schema v' + r.resultVersion + '. No real mine detection, trained ML accuracy or certified ground clearance.</p>' +
    '</section></main></body></html>';
}
