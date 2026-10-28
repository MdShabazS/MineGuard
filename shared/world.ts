// The one fictional MineGuard world, shared by server and both portals.
//
// Coordinate system (used by every later task):
// - World positions are virtual X/Z units (NOT GPS), X in [xMin, xMax], Z in [zMin, zMax].
// - Y is height above the base plane, computed by terrainHeight().
// - Three.js scene position = (x - centerX, y, z - centerZ), so the world is
//   centred on the scene origin. World (0,0) is the corner at scene (-100, -100).

export type Vec2 = [number, number];

export interface Hill {
  x: number;
  z: number;
  radius: number;
  height: number;
}

export interface Road {
  id: string;
  width: number;
  points: Vec2[];
}

export interface Tree {
  x: number;
  z: number;
  scale: number;
}

export interface Landmark {
  id: string;
  kind: 'building' | 'mast' | 'water';
  label: string;
  x: number;
  z: number;
  size: number;
}

export interface WorldDefinition {
  terrainId: string;
  version: number;
  units: 'virtual units';
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  hills: Hill[];
  roads: Road[];
  trees: Tree[];
  landmarks: Landmark[];
  checksum: string;
}

const BOUNDS = { xMin: 0, xMax: 200, zMin: 0, zMax: 200 };
const TREE_SEED = 20261028;
const TREE_COUNT = 140;

const HILLS: Hill[] = [
  { x: 40, z: 155, radius: 32, height: 9 },
  { x: 165, z: 35, radius: 38, height: 12 },
  { x: 150, z: 175, radius: 26, height: 7 },
  { x: 25, z: 60, radius: 22, height: 5 },
];

const ROADS: Road[] = [
  { id: 'road-east-west', width: 6, points: [[0, 100], [55, 94], [115, 110], [200, 104]] },
  { id: 'road-north-south', width: 5, points: [[100, 0], [94, 55], [108, 104], [118, 200]] },
];

const LANDMARKS: Landmark[] = [
  { id: 'base-camp', kind: 'building', label: 'Base camp', x: 26, z: 30, size: 8 },
  { id: 'radio-mast', kind: 'mast', label: 'Radio mast', x: 182, z: 185, size: 2 },
  { id: 'pond', kind: 'water', label: 'Pond', x: 70, z: 160, size: 11 },
];

export function centerOf(w: Pick<WorldDefinition, 'xMin' | 'xMax' | 'zMin' | 'zMax'>): Vec2 {
  return [(w.xMin + w.xMax) / 2, (w.zMin + w.zMax) / 2];
}

export function isInBounds(w: Pick<WorldDefinition, 'xMin' | 'xMax' | 'zMin' | 'zMax'>, x: number, z: number): boolean {
  return Number.isFinite(x) && Number.isFinite(z) && x >= w.xMin && x <= w.xMax && z >= w.zMin && z <= w.zMax;
}

export function worldToScene(w: WorldDefinition, x: number, z: number): [number, number, number] {
  const [cx, cz] = centerOf(w);
  return [x - cx, terrainHeight(w, x, z), z - cz];
}

export function sceneToWorld(w: WorldDefinition, sx: number, sz: number): Vec2 {
  const [cx, cz] = centerOf(w);
  return [sx + cx, sz + cz];
}

/** Round to 0.1 unit, the precision shown in the UI and used for placements. */
export function roundCoord(v: number): number {
  return Math.round(v * 10) / 10;
}

/** Smooth deterministic height: gaussian hills plus a gentle undulation. */
export function terrainHeight(w: Pick<WorldDefinition, 'hills'>, x: number, z: number): number {
  let h = 0.6 * Math.sin(x / 23) * Math.cos(z / 31);
  for (const hill of w.hills) {
    const d2 = (x - hill.x) ** 2 + (z - hill.z) ** 2;
    h += hill.height * Math.exp(-d2 / (2 * (hill.radius / 2) ** 2));
  }
  return h;
}

function distanceToSegment(px: number, pz: number, a: Vec2, b: Vec2): number {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const len2 = dx * dx + dz * dz;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - a[0]) * dx + (pz - a[1]) * dz) / len2));
  return Math.hypot(px - (a[0] + t * dx), pz - (a[1] + t * dz));
}

export function distanceToRoad(road: Road, x: number, z: number): number {
  let best = Infinity;
  for (let i = 1; i < road.points.length; i++) best = Math.min(best, distanceToSegment(x, z, road.points[i - 1], road.points[i]));
  return best;
}

// mulberry32: tiny seeded PRNG so every machine generates identical trees.
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function generateTrees(): Tree[] {
  const rand = mulberry32(TREE_SEED);
  const trees: Tree[] = [];
  let attempts = 0;
  while (trees.length < TREE_COUNT && attempts < 5000) {
    attempts++;
    const x = roundCoord(BOUNDS.xMin + 4 + rand() * (BOUNDS.xMax - BOUNDS.xMin - 8));
    const z = roundCoord(BOUNDS.zMin + 4 + rand() * (BOUNDS.zMax - BOUNDS.zMin - 8));
    const scale = roundCoord(0.8 + rand() * 0.7);
    if (ROADS.some((r) => distanceToRoad(r, x, z) < r.width + 3)) continue;
    if (LANDMARKS.some((l) => Math.hypot(l.x - x, l.z - z) < l.size + 4)) continue;
    trees.push({ x, z, scale });
  }
  return trees;
}

// FNV-1a over the canonical JSON: a quick way to prove two clients render the same world.
function fnv1a(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export function worldChecksum(w: Omit<WorldDefinition, 'checksum'>): string {
  const { terrainId, version, xMin, xMax, zMin, zMax, hills, roads, trees, landmarks } = w;
  return fnv1a(JSON.stringify({ terrainId, version, xMin, xMax, zMin, zMax, hills, roads, trees, landmarks }));
}

export function createWorldDefinition(): WorldDefinition {
  const base = {
    terrainId: 'mg-field-01',
    version: 1,
    units: 'virtual units' as const,
    ...BOUNDS,
    hills: HILLS,
    roads: ROADS,
    trees: generateTrees(),
    landmarks: LANDMARKS,
  };
  return { ...base, checksum: worldChecksum(base) };
}
