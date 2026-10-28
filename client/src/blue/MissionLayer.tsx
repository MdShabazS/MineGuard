import { useMemo, useRef, type MutableRefObject } from 'react';
import type { ThreeEvent } from '@react-three/fiber';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BASE_SPEED, cumulative, poseAt, type GridSpec, type MissionPoint, type MissionTelemetry } from '../../../shared/mission';
import type { PublicCandidate } from '../../../shared/sensor';
import type { RevealedObjectRow } from '../../../shared/results';
import { terrainHeight, worldToScene, type WorldDefinition } from '../../../shared/world';
import { CLICK_MAX_DRAG_PX } from '../world/WorldView';
import type { FollowTarget } from '../world/CameraRig';

const ROUTE_LIFT = 0.7;
const SAMPLE_STEP = 1; // virtual units between route line samples

/** Route sampled every unit and draped over the terrain, with the distance of each sample. */
function sampleRoute(world: WorldDefinition, points: MissionPoint[]) {
  const pos: number[] = [];
  const dist: number[] = [];
  const cum = cumulative(points);
  const total = cum[cum.length - 1];
  const push = (d: number) => {
    const p = poseAt(points, cum, d);
    const [sx, sy, sz] = worldToScene(world, p.x, p.z);
    pos.push(sx, sy + ROUTE_LIFT, sz);
    dist.push(d);
  };
  for (let i = 0; i < points.length - 1; i++) {
    const steps = Math.max(1, Math.ceil((cum[i + 1] - cum[i]) / SAMPLE_STEP));
    for (let s = 0; s < steps; s++) push(cum[i] + ((cum[i + 1] - cum[i]) * s) / steps);
  }
  push(total);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return { geo, dist, cum, total };
}

function RouteLine({ world, points, color, dashed, opacity = 1 }: { world: WorldDefinition; points: MissionPoint[]; color: string; dashed?: boolean; opacity?: number }) {
  const line = useMemo(() => {
    const { geo } = sampleRoute(world, points);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color, dashSize: 2.5, gapSize: 1.8, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color, transparent: true, opacity });
    const l = new THREE.Line(geo, mat);
    if (dashed) l.computeLineDistances();
    return l;
  }, [world, points, color, dashed, opacity]);
  return <primitive object={line} />;
}

function Waypoints({ world, points, label }: { world: WorldDefinition; points: MissionPoint[]; label: boolean }) {
  return (
    <group name="waypoints">
      {points.map((p, i) => {
        const [sx, sy, sz] = worldToScene(world, p.x, p.z);
        const isStart = i === 0;
        const isEnd = i === points.length - 1;
        const color = isStart ? '#34d399' : isEnd ? '#a78bfa' : '#7dd3fc';
        return (
          <group key={i} position={[sx, sy + ROUTE_LIFT, sz]}>
            <mesh raycast={() => null}>
              <sphereGeometry args={[isStart || isEnd ? 1.4 : 0.9, 14, 10]} />
              <meshBasicMaterial color={color} />
            </mesh>
            {(label || isStart || isEnd) && (
              <Html position={[0, 3.2, 0]} center className="pointer-events-none select-none">
                <div className="rounded bg-black/70 px-1 text-[10px] font-semibold text-sky-100">{isStart ? `1 START` : isEnd ? `${i + 1} END` : i + 1}</div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

function GridOutline({ world, grid }: { world: WorldDefinition; grid: Pick<GridSpec, 'xMin' | 'xMax' | 'zMin' | 'zMax'> }) {
  const corners: MissionPoint[] = [
    { x: grid.xMin, z: grid.zMin },
    { x: grid.xMax, z: grid.zMin },
    { x: grid.xMax, z: grid.zMax },
    { x: grid.xMin, z: grid.zMax },
    { x: grid.xMin, z: grid.zMin },
  ];
  return <RouteLine world={world} points={corners} color="#fbbf24" dashed opacity={0.9} />;
}

function DroneModel({ spinning }: { spinning: boolean }) {
  const rotors = useRef<THREE.Group>(null);
  useFrame((_, dt) => {
    if (spinning && rotors.current) for (const r of rotors.current.children) r.rotation.y += dt * 40;
  });
  const arms: [number, number][] = [
    [1, 1],
    [1, -1],
    [-1, 1],
    [-1, -1],
  ];
  return (
    <group scale={1.6}>
      <mesh castShadow>
        <boxGeometry args={[1.6, 0.5, 2.2]} />
        <meshStandardMaterial color="#e2e8f0" metalness={0.3} roughness={0.4} />
      </mesh>
      {/* Nose marker shows heading. */}
      <mesh position={[0, 0.1, 1.25]}>
        <boxGeometry args={[0.5, 0.3, 0.4]} />
        <meshBasicMaterial color="#22d3ee" />
      </mesh>
      {arms.map(([ax, az]) => (
        <mesh key={`${ax}${az}`} position={[ax * 1.1, 0, az * 1.1]} rotation-y={Math.atan2(ax, az)}>
          <boxGeometry args={[0.25, 0.18, 1.6]} />
          <meshStandardMaterial color="#64748b" />
        </mesh>
      ))}
      <group ref={rotors}>
        {arms.map(([ax, az]) => (
          <mesh key={`${ax}${az}`} position={[ax * 1.65, 0.3, az * 1.65]}>
            <cylinderGeometry args={[0.85, 0.85, 0.05, 16]} />
            <meshBasicMaterial color="#cbd5e1" transparent opacity={0.45} />
          </mesh>
        ))}
      </group>
    </group>
  );
}

const DISC_SEGMENTS = 40;
const FOOTPRINT_LIFT = 0.35;

/** Disc whose vertices follow the terrain, centred at world (x, z). */
function drapedDisc(world: WorldDefinition, x: number, z: number, r: number, lift: number) {
  const geo = new THREE.CircleGeometry(r, DISC_SEGMENTS);
  geo.rotateX(-Math.PI / 2);
  const pos = geo.attributes.position;
  const [sx, , sz] = worldToScene(world, x, z);
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i);
    const dz = pos.getZ(i);
    pos.setXYZ(i, sx + dx, terrainHeight(world, x + dx, z + dz) + lift, sz + dz);
  }
  return geo;
}

/**
 * Swept-region visual: a 2r-wide ribbon along the route plus a disc at every
 * waypoint (filling the outer wedge at turns), revealed only as far as the
 * drone has actually flown. Matches the server's coverage model in X/Z.
 */
function useSweptGeometry(world: WorldDefinition, points: MissionPoint[], r: number) {
  return useMemo(() => {
    const cum = cumulative(points);
    const verts: number[] = [];
    const idx: number[] = [];
    const dists: number[] = [];
    let i = 0;
    for (let leg = 0; leg < points.length - 1; leg++) {
      const a = points[leg];
      const b = points[leg + 1];
      const len = cum[leg + 1] - cum[leg];
      const ux = (b.x - a.x) / len;
      const uz = (b.z - a.z) / len;
      // Perpendicular to this leg; each leg gets its own strip so turns never fold.
      const px = uz;
      const pz = -ux;
      const steps = Math.max(1, Math.ceil(len / SAMPLE_STEP));
      for (let k = 0; k <= steps; k++) {
        const t = k / steps;
        const x = a.x + (b.x - a.x) * t;
        const z = a.z + (b.z - a.z) * t;
        for (const side of [1, -1]) {
          const wx = x + side * px * r;
          const wz = z + side * pz * r;
          const [sx, , sz] = worldToScene(world, wx, wz);
          verts.push(sx, terrainHeight(world, wx, wz) + 0.25, sz);
        }
        dists.push(cum[leg] + len * t);
        if (k > 0) {
          const v = (i - 1) * 2;
          idx.push(v, v + 1, v + 2, v + 1, v + 3, v + 2);
        }
        i++;
      }
    }
    const ribbon = new THREE.BufferGeometry();
    ribbon.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
    ribbon.setIndex(idx);
    ribbon.setDrawRange(0, 0);
    // Quad index for each sample (quads are only between samples of the same leg).
    const quadsBefore: number[] = [];
    let q = 0;
    let sample = 0;
    for (let leg = 0; leg < points.length - 1; leg++) {
      const steps = Math.max(1, Math.ceil((cum[leg + 1] - cum[leg]) / SAMPLE_STEP));
      for (let k = 0; k <= steps; k++) {
        quadsBefore[sample++] = q;
        if (k < steps) q++;
      }
    }
    const discs = points.map((p) => drapedDisc(world, p.x, p.z, r, 0.25));
    return { ribbon, dists, quadsBefore, discs, cum };
  }, [world, points, r]);
}

const SWEPT_MATERIAL = new THREE.MeshBasicMaterial({ color: '#2dd4bf', transparent: true, opacity: 0.16, depthWrite: false, side: THREE.DoubleSide });

/**
 * The drone and the flown path. The server sends ~10 positions/s; between them
 * the drone eases along the route by distance (so it follows turns exactly,
 * never cutting a corner). Purely visual: the server owns the real position.
 */
function Drone({
  world,
  points,
  telemetry,
  follow,
  radius,
}: {
  world: WorldDefinition;
  points: MissionPoint[];
  telemetry: MissionTelemetry;
  follow?: MutableRefObject<FollowTarget | null>;
  /** Virtual footprint radius from shared/sensor.ts (the same value the server senses with). */
  radius: number;
}) {
  const route = useMemo(() => sampleRoute(world, points), [world, points]);
  const swept = useSweptGeometry(world, points, radius);
  const discRefs = useRef<(THREE.Mesh | null)[]>([]);
  const footprint = useMemo(() => {
    const fill = new THREE.CircleGeometry(radius, DISC_SEGMENTS);
    fill.rotateX(-Math.PI / 2);
    const ringPts = Array.from({ length: DISC_SEGMENTS + 1 }, (_, i) => {
      const a = (i / DISC_SEGMENTS) * Math.PI * 2;
      return new THREE.Vector3(Math.cos(a) * radius, 0, Math.sin(a) * radius);
    });
    const ring = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ringPts), new THREE.LineBasicMaterial({ color: '#5eead4' }));
    return { fill, ring, base: Float32Array.from(fill.attributes.position.array) };
  }, [radius]);
  const footprintGroup = useRef<THREE.Group>(null);
  const flown = useMemo(() => {
    const l = new THREE.Line(route.geo.clone(), new THREE.LineBasicMaterial({ color: '#22d3ee' }));
    l.geometry.setDrawRange(0, 0);
    return l;
  }, [route]);
  const body = useRef<THREE.Group>(null);
  const shadow = useRef<THREE.Mesh>(null);
  const shown = useRef({ missionId: '', distance: 0, heading: 0 });
  const received = useRef({ sequence: -1, at: 0 });

  if (received.current.sequence !== telemetry.sequence) received.current = { sequence: telemetry.sequence, at: performance.now() };

  useFrame((_, dt) => {
    const s = shown.current;
    let target = telemetry.routeDistanceCompleted;
    if (telemetry.status === 'RUNNING') {
      // Extrapolate up to one tick ahead so motion stays smooth between updates.
      const ahead = (Math.min(250, performance.now() - received.current.at) / 1000) * BASE_SPEED * telemetry.playbackSpeed;
      target = Math.min(route.total, target + ahead);
    }
    if (s.missionId !== telemetry.missionId || Math.abs(target - s.distance) > 40) {
      s.missionId = telemetry.missionId;
      s.distance = target;
    } else {
      s.distance += (target - s.distance) * (1 - Math.exp(-Math.min(dt, 0.1) * 12));
    }
    const pose = poseAt(points, route.cum, s.distance);
    let dh = pose.heading - s.heading;
    dh = Math.atan2(Math.sin(dh), Math.cos(dh));
    s.heading += dh * (1 - Math.exp(-Math.min(dt, 0.1) * 8));
    const [sx, , sz] = worldToScene(world, pose.x, pose.z);
    const ground = terrainHeight(world, pose.x, pose.z);
    const y = ground + telemetry.altitudeAboveGround;
    body.current?.position.set(sx, y, sz);
    if (body.current) body.current.rotation.y = s.heading;
    shadow.current?.position.set(sx, ground + 0.3, sz);
    let n = 0;
    while (n < route.dist.length && route.dist[n] <= s.distance) n++;
    flown.geometry.setDrawRange(0, n);
    // Swept region so far: ribbon up to the drone, plus discs at start and every passed waypoint.
    let m = 0;
    while (m < swept.dists.length && swept.dists[m] <= s.distance) m++;
    swept.ribbon.setDrawRange(0, (m > 0 ? swept.quadsBefore[m - 1] : 0) * 6);
    swept.cum.forEach((c, i) => {
      const d = discRefs.current[i];
      if (d) d.visible = c <= s.distance + 1e-6;
    });
    // Live footprint, draped over the terrain under the drone.
    if (footprintGroup.current) {
      footprintGroup.current.position.set(sx, 0, sz);
      const fp = footprint.fill.attributes.position;
      for (let i = 0; i < fp.count; i++) fp.setY(i, terrainHeight(world, pose.x + footprint.base[i * 3], pose.z + footprint.base[i * 3 + 2]) + FOOTPRINT_LIFT);
      fp.needsUpdate = true;
      const rp = footprint.ring.geometry.attributes.position;
      for (let i = 0; i < rp.count; i++) rp.setY(i, terrainHeight(world, pose.x + rp.getX(i), pose.z + rp.getZ(i)) + FOOTPRINT_LIFT + 0.05);
      rp.needsUpdate = true;
    }
    if (follow) {
      follow.current ??= { position: new THREE.Vector3(), heading: 0 };
      follow.current.position.set(sx, y, sz);
      follow.current.heading = s.heading;
    }
  });

  return (
    <group name="drone">
      <mesh geometry={swept.ribbon} material={SWEPT_MATERIAL} raycast={() => null} renderOrder={1} />
      {swept.discs.map((g, i) => (
        <mesh key={i} ref={(el) => void (discRefs.current[i] = el)} geometry={g} material={SWEPT_MATERIAL} visible={false} raycast={() => null} renderOrder={1} />
      ))}
      <group ref={footprintGroup} name="virtual-footprint">
        <mesh geometry={footprint.fill} raycast={() => null} renderOrder={2}>
          <meshBasicMaterial color="#5eead4" transparent opacity={0.22} depthWrite={false} side={THREE.DoubleSide} />
        </mesh>
        <primitive object={footprint.ring} />
      </group>
      <primitive object={flown} />
      <group ref={body}>
        <DroneModel spinning={telemetry.status === 'RUNNING'} />
      </group>
      <mesh ref={shadow} rotation-x={-Math.PI / 2} raycast={() => null}>
        <ringGeometry args={[1.6, 2.4, 24]} />
        <meshBasicMaterial color="#000000" transparent opacity={0.35} />
      </mesh>
    </group>
  );
}

/** Server-emitted simulated candidates. Distinct from waypoints, drone, swept area and (later) revealed truth. */
function CandidatePins({ world, candidates, selectedId, onSelect }: { world: WorldDefinition; candidates: PublicCandidate[]; selectedId: string | null; onSelect?: (id: string) => void }) {
  const rings = useRef<THREE.Group>(null);
  useFrame(({ clock }) => {
    if (rings.current) for (const c of rings.current.children) c.scale.setScalar(1 + 0.25 * Math.sin(clock.elapsedTime * 4));
  });
  return (
    <group name="candidates">
      {candidates.map((c) => {
        const [sx, sy, sz] = worldToScene(world, c.x, c.z);
        const selected = c.candidateId === selectedId;
        const click = (e: ThreeEvent<MouseEvent>) => {
          e.stopPropagation();
          if (e.delta <= CLICK_MAX_DRAG_PX) onSelect?.(c.candidateId);
        };
        return (
          <group key={c.candidateId} position={[sx, sy, sz]}>
            <mesh position={[0, 3, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.15, 0.15, 6, 6]} />
              <meshBasicMaterial color="#fb7185" />
            </mesh>
            <mesh position={[0, 6.8, 0]} raycast={() => null}>
              <octahedronGeometry args={[selected ? 2.1 : 1.5]} />
              <meshStandardMaterial color={selected ? '#fde047' : '#f43f5e'} emissive={selected ? '#facc15' : '#e11d48'} emissiveIntensity={0.6} />
            </mesh>
            <mesh position={[0, 4, 0]} visible={false} onClick={click}>
              <cylinderGeometry args={[2.6, 2.6, 9, 8]} />
              <meshBasicMaterial />
            </mesh>
            <Html position={[0, 10, 0]} center className="pointer-events-none select-none">
              <div className={`rounded px-1 text-[10px] font-bold ${selected ? 'bg-yellow-300 text-black' : 'bg-rose-600 text-white'}`}>C{c.number}</div>
            </Html>
          </group>
        );
      })}
      <group ref={rings}>
        {candidates.map((c) => {
          const [sx, sy, sz] = worldToScene(world, c.x, c.z);
          return (
            <mesh key={c.candidateId} position={[sx, sy + 0.5, sz]} rotation-x={-Math.PI / 2} raycast={() => null}>
              <ringGeometry args={[2.2, 3, 24]} />
              <meshBasicMaterial color={c.candidateId === selectedId ? '#fde047' : '#fb7185'} transparent opacity={0.8} />
            </mesh>
          );
        })}
      </group>
    </group>
  );
}

/** Historical fictional truth is added to Blue ONLY after server-authorized reveal. */
function RevealedPins({ world, objects }: { world: WorldDefinition; objects: RevealedObjectRow[] }) {
  return (
    <group name="post-reveal-fictional-truth">
      {objects.map((o) => {
        const [sx, sy, sz] = worldToScene(world, o.x, o.z);
        const hazard = o.kind === 'HAZARD';
        return (
          <group key={o.reportObjectLabel} position={[sx, sy + 1.4, sz]}>
            <mesh raycast={() => null}>
              {hazard ? <boxGeometry args={[2.6, 2.6, 2.6]} /> : <sphereGeometry args={[1.4, 12, 9]} />}
              <meshBasicMaterial color={hazard ? '#fbbf24' : '#f1f5f9'} wireframe={o.disposition === 'NOT_SCANNED'} />
            </mesh>
            <Html position={[0, 4.8, 0]} center className="pointer-events-none select-none">
              <div className="rounded border border-white/30 bg-black/85 px-1.5 text-[10px] font-bold text-white">
                {o.reportObjectLabel} · {o.disposition === 'NOT_SCANNED' ? 'NOT SCANNED' : o.kind}
              </div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

interface Props {
  world: WorldDefinition;
  /** Local, not-yet-confirmed preview (dashed). */
  draft: MissionPoint[] | null;
  draftGrid: Pick<GridSpec, 'xMin' | 'xMax' | 'zMin' | 'zMax'> | null;
  /** The server's canonical route for the current/last mission or confirmed plan (solid). */
  route: MissionPoint[] | null;
  routeGrid: GridSpec | null;
  telemetry: MissionTelemetry | null;
  follow?: MutableRefObject<FollowTarget | null>;
  /** Footprint radius of the flying mission (from shared/sensor.ts). */
  footprintRadius?: number;
  candidates?: PublicCandidate[];
  revealedTruth?: RevealedObjectRow[];
  selectedCandidate?: string | null;
  onSelectCandidate?: (id: string) => void;
}

export default function MissionLayer({ world, draft, draftGrid, route, routeGrid, telemetry, follow, footprintRadius = 10, candidates = [], revealedTruth = [], selectedCandidate = null, onSelectCandidate }: Props) {
  // With no drone yet, Follow mode looks at the route start.
  if (!telemetry && follow) {
    const start = route?.[0] ?? draft?.[0];
    if (start) {
      const [sx, sy, sz] = worldToScene(world, start.x, start.z);
      follow.current = { position: new THREE.Vector3(sx, sy + 12, sz), heading: 0 };
    } else follow.current = null;
  }
  return (
    <group name="mission">
      {draftGrid && <GridOutline world={world} grid={draftGrid} />}
      {routeGrid && !draftGrid && <GridOutline world={world} grid={routeGrid} />}
      {draft && draft.length >= 2 && <RouteLine world={world} points={draft} color="#fde68a" dashed />}
      {draft && <Waypoints world={world} points={draft} label={draft.length <= 30} />}
      {route && !draft && <RouteLine world={world} points={route} color="#38bdf8" opacity={0.75} />}
      {route && !draft && <Waypoints world={world} points={route} label={route.length <= 30} />}
      {route && telemetry && <Drone world={world} points={route} telemetry={telemetry} follow={follow} radius={footprintRadius} />}
      <CandidatePins world={world} candidates={candidates} selectedId={selectedCandidate} onSelect={onSelectCandidate} />
      {revealedTruth.length > 0 && <RevealedPins world={world} objects={revealedTruth} />}
    </group>
  );
}
