import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import type { OrbitControls as OrbitControlsImpl } from 'three-stdlib';
import {
  planBitmDetail, type DetailSatellitePlan,
} from '../../../shared/geographic';
import {
  sceneToWorld, terrainHeight, type WorldDefinition,
} from '../../../shared/world';
import { loadVisibleSatelliteDetail } from './SatelliteTexture';

export type DetailStatus = 'overview' | 'loading' | 'ready' | 'partial' | 'error';
export interface DetailInfo {
  status: DetailStatus;
  zoom: number | null;
  loaded: number;
  total: number;
  message: string;
}
const NO_DETAIL: DetailInfo = { status: 'overview', zoom: null, loaded: 0, total: 0, message: '' };

interface Patch {
  plan: DetailSatellitePlan;
  texture: THREE.Texture;
}

/** High-resolution satellite map patch is aligned to the exact same world
 * coordinates as the z14 base, and does not intercept virtual terrain picks.
 * It is loaded only for the viewport the user deliberately zoomed into.
 */
export default function SatelliteDetail({
  world, onDetail,
}: {
  world: WorldDefinition;
  onDetail: (info: DetailInfo) => void;
}) {
  const [request, setRequest] = useState<DetailSatellitePlan | null>(null);
  const [patch, setPatch] = useState<Patch | null>(null);
  const requestKey = useRef('');
  const lastCheck = useRef(-10);

  useFrame(({ camera, controls, size, clock }) => {
    if (clock.elapsedTime - lastCheck.current < 0.35) return;
    lastCheck.current = clock.elapsedTime;
    const orbit = controls as OrbitControlsImpl | null;
    if (!orbit) return;
    const distance = camera.position.distanceTo(orbit.target);
    const [x, z] = sceneToWorld(world, orbit.target.x, orbit.target.z);
    const plan = planBitmDetail(x, z, distance, size.width / Math.max(1, size.height));
    const key = plan?.key ?? 'overview';
    if (key !== requestKey.current) {
      requestKey.current = key;
      setRequest(plan);
    }
  });

  useEffect(() => {
    const controller = new AbortController();
    if (!request) {
      setPatch(null);
      onDetail(NO_DETAIL);
      return () => controller.abort();
    }
    onDetail({
      status: 'loading', zoom: request.zoom, loaded: 0, total: request.tiles,
      message: 'Loading clearer imagery near the map centre…',
    });
    loadVisibleSatelliteDetail(controller.signal, request.bounds, request.zoom)
      .then((result) => {
        if (controller.signal.aborted) { result.texture.dispose(); return; }
        setPatch({ plan: request, texture: result.texture });
        onDetail({
          status: result.loaded === result.total ? 'ready' : 'partial',
          zoom: request.zoom,
          loaded: result.loaded,
          total: result.total,
          message: result.firstFailure ?? '',
        });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        onDetail({
          status: 'error', zoom: request.zoom, loaded: 0,
          total: request.tiles,
          message: error instanceof Error ? error.message : 'No detail imagery available',
        });
      });
    return () => controller.abort();
  }, [request, onDetail]);

  // Release the previous CanvasTexture after its replacement is committed.
  useEffect(() => () => { patch?.texture.dispose(); }, [patch]);

  const geometry = useMemo(() => {
    if (!patch) return null;
    const { xMin, xMax, zMin, zMax } = patch.plan;
    const w = xMax - xMin, h = zMax - zMin;
    const geo = new THREE.PlaneGeometry(
      w, h, Math.max(4, Math.ceil(w / 1.5)), Math.max(4, Math.ceil(h / 1.5)),
    );
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const cx = (xMin + xMax) / 2, cz = (zMin + zMax) / 2;
    for (let i = 0; i < pos.count; i++) {
      const x = cx + pos.getX(i);
      const z = cz + pos.getZ(i);
      pos.setY(i, terrainHeight(world, x, z) + 0.45);
    }
    geo.computeVertexNormals();
    return geo;
  }, [world, patch]);

  useEffect(() => () => { geometry?.dispose(); }, [geometry]);

  if (!patch || !geometry) return null;
  return (
    <mesh
      name="bitm-hd-satellite-overlay"
      position={[
        (patch.plan.xMin + patch.plan.xMax) / 2 - 100,
        0,
        (patch.plan.zMin + patch.plan.zMax) / 2 - 100,
      ]}
      geometry={geometry}
      raycast={() => null}
      renderOrder={3}
    >
      <meshBasicMaterial
        map={patch.texture}
        color="#ffffff"
        toneMapped={false}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-1}
      />
    </mesh>
  );
}
