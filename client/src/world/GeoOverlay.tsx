import { useEffect, useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { BITM_AREA, REAL_WORLD_RADIUS_UNITS } from '../../../shared/geographic';
import { worldToScene, type WorldDefinition } from '../../../shared/world';

/** 5 km georeferenced radius displayed over the same X/Z simulator.
 * Does not alter collision, route geometry, sensing, or any real GPS hardware.
 */
export default function GeoOverlay({ world }: { world: WorldDefinition }) {
  const ring = useMemo(() => {
    const positions: THREE.Vector3[] = [];
    for (let i = 0; i <= 192; i++) {
      const theta = i / 192 * Math.PI * 2;
      const x = 100 + REAL_WORLD_RADIUS_UNITS * Math.cos(theta);
      const z = 100 + REAL_WORLD_RADIUS_UNITS * Math.sin(theta);
      const [sx, sy, sz] = worldToScene(world, x, z);
      positions.push(new THREE.Vector3(sx, sy + 1.5, sz));
    }
    const geo = new THREE.BufferGeometry().setFromPoints(positions);
    return new THREE.Line(geo, new THREE.LineBasicMaterial({ color: '#fde047', linewidth: 2 }));
  }, [world]);

  useEffect(() => () => {
    ring.geometry.dispose();
    (ring.material as THREE.Material).dispose();
  }, [ring]);

  const [cx, cy, cz] = worldToScene(world, 100, 100);
  return (
    <group name="bitm-map-overlay">
      <primitive object={ring} />
      <mesh position={[cx, cy + 2.7, cz]} raycast={() => null}>
        <cylinderGeometry args={[1.6, 1.6, 5, 16]} />
        <meshStandardMaterial color="#facc15" emissive="#a16207" emissiveIntensity={0.3} />
      </mesh>
      <Html position={[cx, cy + 13, cz]} center className="pointer-events-none select-none">
        <div data-testid="bitm-map-label" className="min-w-max rounded-md border border-amber-400/70 bg-slate-950/95 px-3 py-2 text-center text-xs text-white shadow-lg">
          <strong>BITM · Ballari</strong>
          <div className="font-mono text-[10px] text-amber-200">{BITM_AREA.latitude.toFixed(6)}°N · {BITM_AREA.longitude.toFixed(6)}°E</div>
          <div className="text-[10px] text-slate-300">Yellow boundary: 5 km radius</div>
        </div>
      </Html>
    </group>
  );
}
