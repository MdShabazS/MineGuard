import { useMemo, useRef, type MutableRefObject } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import { BASE_SPEED, cumulative, poseAt, type GridSpec, type MissionPoint, type MissionTelemetry } from '../../../shared/mission';
import { terrainHeight, worldToScene, type WorldDefinition } from '../../../shared/world';
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
        const color = isStart ? '#34d399' : isEnd ? '#f472b6' : '#7dd3fc';
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

/**
 * The drone and the flown path. The server sends ~10 positions/s; between them
 * the drone eases along the route by distance (so it follows turns exactly,
 * never cutting a corner). Purely visual: the server owns the real position.
 */
function Drone({ world, points, telemetry, follow }: { world: WorldDefinition; points: MissionPoint[]; telemetry: MissionTelemetry; follow?: MutableRefObject<FollowTarget | null> }) {
  const route = useMemo(() => sampleRoute(world, points), [world, points]);
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
    if (follow) {
      follow.current ??= { position: new THREE.Vector3(), heading: 0 };
      follow.current.position.set(sx, y, sz);
      follow.current.heading = s.heading;
    }
  });

  return (
    <group name="drone">
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
}

export default function MissionLayer({ world, draft, draftGrid, route, routeGrid, telemetry, follow }: Props) {
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
      {route && telemetry && <Drone world={world} points={route} telemetry={telemetry} follow={follow} />}
    </group>
  );
}
