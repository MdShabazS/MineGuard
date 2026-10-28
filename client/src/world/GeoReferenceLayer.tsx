import { useMemo } from 'react';
import * as THREE from 'three';
import { Html } from '@react-three/drei';
import { BITM_GEO, distanceFromBitmMeters } from '../../../shared/geo';
import { worldToScene, type WorldDefinition } from '../../../shared/world';

/** The circle is exactly 100 virtual units in this reference overlay,
 * corresponding to approximately 5 km around the selected BITM centre.
 * It is only a visual geographic reference, NOT a mission restriction
 * or an assertion of field clearance. */
export default function GeoReferenceLayer({ world }: { world: WorldDefinition }) {
  const circle = useMemo(() => {
    const points: THREE.Vector3[] = [];
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2;
      const x = 100 + 100 * Math.cos(angle);
      const z = 100 + 100 * Math.sin(angle);
      const [sx, sy, sz] = worldToScene(world, x, z);
      points.push(new THREE.Vector3(sx, sy + 0.65, sz));
    }
    const geometry = new THREE.BufferGeometry().setFromPoints(points);
    return new THREE.LineLoop(geometry, new THREE.LineBasicMaterial({ color: '#fef08a', linewidth: 1 }));
  }, [world]);
  const [cx, cy, cz] = worldToScene(world, 100, 100);
  const [ex, ey, ez] = worldToScene(world, 200, 100);
  return (
    <group name="BITM-5km-reference">
      <primitive object={circle} raycast={() => null} />
      <group position={[cx, cy + 2, cz]}>
        <mesh raycast={() => null}>
          <cylinderGeometry args={[1.6, 1.6, 1.2, 24]} />
          <meshBasicMaterial color="#fde68a" />
        </mesh>
        <Html position={[0, 7, 0]} center className="pointer-events-none select-none">
          <div className="whitespace-nowrap rounded-lg border border-yellow-300/60 bg-slate-950/90 px-2 py-1 text-center text-[11px] font-semibold text-yellow-100">
            BITM · Ballari
            <div className="font-normal text-[9px] text-white/75">{BITM_GEO.latitude.toFixed(5)}°N, {BITM_GEO.longitude.toFixed(5)}°E (approx.)</div>
          </div>
        </Html>
      </group>
      <Html position={[ex, ey + 3, ez]} center className="pointer-events-none select-none">
        <div className="whitespace-nowrap rounded bg-amber-950/95 px-2 py-1 text-[10px] font-semibold text-amber-100">
          ~{(distanceFromBitmMeters(200, 100) / 1000).toFixed(0)} km radius
        </div>
      </Html>
    </group>
  );
}
