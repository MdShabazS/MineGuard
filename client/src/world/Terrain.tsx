import { useEffect, useMemo, useState } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { sceneToWorld, terrainHeight, type WorldDefinition } from '../../../shared/world';
import { loadBitmSatelliteTexture } from './SatelliteTexture';

const SEGMENTS = 128;
const LOW = new THREE.Color('#3f5f3a');
const HIGH = new THREE.Color('#8b8a5c');
export type ImageryState = 'loading' | 'ready' | 'partial' | 'error';

interface Props {
  world: WorldDefinition;
  /** Dedicated BITM satellite preset loads actual ArcGIS cached tiles. */
  bitmSatellite?: boolean;
  /** Optional imported image, provided by user with usage rights. */
  imageryUrl?: string | null;
  onImageryState?: (state: ImageryState, details?: string) => void;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: () => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export default function Terrain({
  world, bitmSatellite = false, imageryUrl, onImageryState,
  onPointerMove, onPointerLeave, onClick,
}: Props) {
  const [texture, setTexture] = useState<THREE.Texture | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let allocated: THREE.Texture | null = null;
    setTexture(null);
    if (bitmSatellite) {
      onImageryState?.('loading');
      loadBitmSatelliteTexture(controller.signal).then((result) => {
        if (controller.signal.aborted) {
          result.texture.dispose();
          return;
        }
        allocated = result.texture;
        setTexture(result.texture);
        if (result.loaded === result.total) {
          onImageryState?.('ready', result.loaded + '/' + result.total + ' satellite tiles displayed');
        } else {
          onImageryState?.('partial', result.loaded + '/' + result.total + ' satellite tiles loaded. Missing tiles are shown as dark gaps.');
        }
      }).catch((err: unknown) => {
        if (controller.signal.aborted) return;
        onImageryState?.('error', err instanceof Error ? err.message : 'Could not retrieve satellite tiles');
      });
    } else if (imageryUrl) {
      onImageryState?.('loading');
      const loader = new THREE.TextureLoader();
      loader.load(
        imageryUrl,
        (next) => {
          if (controller.signal.aborted) { next.dispose(); return; }
          allocated = next;
          next.colorSpace = THREE.SRGBColorSpace;
          next.anisotropy = 4;
          setTexture(next);
          onImageryState?.('ready', 'Local imagery decoded and applied to the ground');
        },
        undefined,
        () => {
          if (!controller.signal.aborted) onImageryState?.('error', 'The imported map could not be decoded');
        },
      );
    }
    return () => {
      controller.abort();
      allocated?.dispose();
    };
  }, [bitmSatellite, imageryUrl, onImageryState]);

  const geometry = useMemo(() => {
    const width = world.xMax - world.xMin;
    const depth = world.zMax - world.zMin;
    const geo = new THREE.PlaneGeometry(width, depth, SEGMENTS, SEGMENTS);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const maxHill = Math.max(1, ...world.hills.map((h) => h.height));
    const color = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const [x, z] = sceneToWorld(world, pos.getX(i), pos.getZ(i));
      const y = terrainHeight(world, x, z);
      pos.setY(i, y);
      color.copy(LOW).lerp(HIGH, Math.min(1, Math.max(0, y / maxHill)));
      colors.set([color.r, color.g, color.b], i * 3);
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();
    return geo;
  }, [world]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh name="terrain" geometry={geometry} receiveShadow
      onPointerMove={onPointerMove} onPointerLeave={onPointerLeave} onClick={onClick}>
      {texture && (bitmSatellite || imageryUrl) ? (
        // Unlit material makes true satellite colors visible regardless of
        // the existing fictional hills and directional lighting.
        <meshBasicMaterial map={texture} color="#ffffff" toneMapped={false} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.95} flatShading={false} />
      )}
    </mesh>
  );
}
