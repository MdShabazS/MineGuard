import { useLayoutEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { terrainHeight, worldToScene, type Road, type WorldDefinition } from '../../../shared/world';

const ROAD_LIFT = 0.15;

function roadGeometry(world: WorldDefinition, road: Road): THREE.BufferGeometry {
  // Sample the polyline every ~2 units and build a flat ribbon that follows the terrain.
  const samples: [number, number][] = [];
  for (let i = 1; i < road.points.length; i++) {
    const [ax, az] = road.points[i - 1];
    const [bx, bz] = road.points[i];
    const steps = Math.max(1, Math.ceil(Math.hypot(bx - ax, bz - az) / 2));
    for (let s = i === 1 ? 0 : 1; s <= steps; s++) samples.push([ax + ((bx - ax) * s) / steps, az + ((bz - az) * s) / steps]);
  }
  const half = road.width / 2;
  const vertices: number[] = [];
  const indices: number[] = [];
  samples.forEach(([x, z], i) => {
    const [px, pz] = samples[Math.max(0, i - 1)];
    const [nx, nz] = samples[Math.min(samples.length - 1, i + 1)];
    const len = Math.hypot(nx - px, nz - pz) || 1;
    const ox = (-(nz - pz) / len) * half;
    const oz = ((nx - px) / len) * half;
    for (const sign of [1, -1]) {
      const [sx, sy, sz] = worldToScene(world, x + sign * ox, z + sign * oz);
      vertices.push(sx, sy + ROAD_LIFT, sz);
    }
    if (i > 0) {
      const a = (i - 1) * 2;
      indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
  });
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  return geo;
}

export function Roads({ world }: { world: WorldDefinition }) {
  const geometries = useMemo(() => world.roads.map((r) => roadGeometry(world, r)), [world]);
  return (
    <group name="roads">
      {geometries.map((geo, i) => (
        <mesh key={world.roads[i].id} geometry={geo} receiveShadow>
          <meshStandardMaterial color="#8c7d63" roughness={1} side={THREE.DoubleSide} />
        </mesh>
      ))}
    </group>
  );
}

export function Trees({ world }: { world: WorldDefinition }) {
  const crowns = useRef<THREE.InstancedMesh>(null);
  const trunks = useRef<THREE.InstancedMesh>(null);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    world.trees.forEach((t, i) => {
      const [sx, sy, sz] = worldToScene(world, t.x, t.z);
      const s = new THREE.Vector3(t.scale, t.scale, t.scale);
      m.compose(new THREE.Vector3(sx, sy + 1 * t.scale, sz), q, s);
      trunks.current?.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(sx, sy + 3.6 * t.scale, sz), q, s);
      crowns.current?.setMatrixAt(i, m);
    });
    if (trunks.current) trunks.current.instanceMatrix.needsUpdate = true;
    if (crowns.current) crowns.current.instanceMatrix.needsUpdate = true;
  }, [world]);

  return (
    <group name="trees">
      <instancedMesh ref={trunks} args={[undefined, undefined, world.trees.length]} castShadow raycast={() => null}>
        <cylinderGeometry args={[0.25, 0.35, 2, 6]} />
        <meshStandardMaterial color="#5b4630" />
      </instancedMesh>
      <instancedMesh ref={crowns} args={[undefined, undefined, world.trees.length]} castShadow raycast={() => null}>
        <coneGeometry args={[1.6, 4, 7]} />
        <meshStandardMaterial color="#2f6b3c" roughness={0.9} />
      </instancedMesh>
    </group>
  );
}

/** A disc that follows the terrain surface, so water on a slope is never half-buried. */
function Water({ world, x, z, radius }: { world: WorldDefinition; x: number; z: number; radius: number }) {
  const geometry = useMemo(() => {
    const geo = new THREE.CircleGeometry(radius, 48, 0, Math.PI * 2);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const base = terrainHeight(world, x, z);
    for (let i = 0; i < pos.count; i++) pos.setY(i, terrainHeight(world, x + pos.getX(i), z + pos.getZ(i)) - base + 0.25);
    geo.computeVertexNormals();
    return geo;
  }, [world, x, z, radius]);
  return (
    <mesh geometry={geometry} raycast={() => null}>
      <meshStandardMaterial color="#2d6f8f" roughness={0.2} metalness={0.1} />
    </mesh>
  );
}

export function Landmarks({ world }: { world: WorldDefinition }) {
  return (
    <group name="landmarks">
      {world.landmarks.map((l) => {
        const [sx, sy, sz] = worldToScene(world, l.x, l.z);
        return (
          <group key={l.id} position={[sx, sy, sz]}>
            {l.kind === 'building' && (
              <mesh position={[0, l.size / 4, 0]} castShadow raycast={() => null}>
                <boxGeometry args={[l.size, l.size / 2, l.size * 0.7]} />
                <meshStandardMaterial color="#9aa3a8" />
              </mesh>
            )}
            {l.kind === 'mast' && (
              <mesh position={[0, 9, 0]} castShadow raycast={() => null}>
                <cylinderGeometry args={[0.3, l.size * 0.5, 18, 6]} />
                <meshStandardMaterial color="#c9ced1" />
              </mesh>
            )}
            {l.kind === 'water' && <Water world={world} x={l.x} z={l.z} radius={l.size} />}
            <Html position={[0, l.kind === 'mast' ? 20 : 8, 0]} center className="pointer-events-none select-none">
              <div className="whitespace-nowrap rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-slate-200">{l.label}</div>
            </Html>
          </group>
        );
      })}
    </group>
  );
}

/** Survey boundary outline plus corner coordinate labels, so X/Z orientation is obvious. */
export function Bounds({ world }: { world: WorldDefinition }) {
  const line = useMemo(() => {
    const pts: THREE.Vector3[] = [];
    const edge = (x0: number, z0: number, x1: number, z1: number) => {
      for (let s = 0; s <= 40; s++) {
        const x = x0 + ((x1 - x0) * s) / 40;
        const z = z0 + ((z1 - z0) * s) / 40;
        const [sx, sy, sz] = worldToScene(world, x, z);
        pts.push(new THREE.Vector3(sx, sy + 0.3, sz));
      }
    };
    edge(world.xMin, world.zMin, world.xMax, world.zMin);
    edge(world.xMax, world.zMin, world.xMax, world.zMax);
    edge(world.xMax, world.zMax, world.xMin, world.zMax);
    edge(world.xMin, world.zMax, world.xMin, world.zMin);
    const geo = new THREE.BufferGeometry().setFromPoints(pts);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#40d5bd' }));
  }, [world]);

  const corners: [number, number][] = [
    [world.xMin, world.zMin],
    [world.xMax, world.zMin],
    [world.xMin, world.zMax],
    [world.xMax, world.zMax],
  ];

  return (
    <group name="bounds">
      <primitive object={line} />
      {corners.map(([x, z]) => {
        const [sx, , sz] = worldToScene(world, x, z);
        return (
          <Html key={`${x},${z}`} position={[sx, terrainHeight(world, x, z) + 2, sz]} center className="pointer-events-none select-none">
            <div className="whitespace-nowrap rounded bg-teal-950/80 px-1.5 py-0.5 font-mono text-[10px] text-teal-200">
              X {x} · Z {z}
            </div>
          </Html>
        );
      })}
    </group>
  );
}
