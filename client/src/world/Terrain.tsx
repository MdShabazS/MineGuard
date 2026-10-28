import { useMemo } from 'react';
import * as THREE from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { sceneToWorld, terrainHeight, type WorldDefinition } from '../../../shared/world';

const SEGMENTS = 128;
const LOW = new THREE.Color('#3f5f3a');
const HIGH = new THREE.Color('#8b8a5c');

interface Props {
  world: WorldDefinition;
  /** Optional BITM imagery draped over the existing simulated elevation. */
  imagery?: THREE.Texture | null;
  onPointerMove?: (e: ThreeEvent<PointerEvent>) => void;
  onPointerLeave?: () => void;
  onClick?: (e: ThreeEvent<MouseEvent>) => void;
}

export default function Terrain({ world, imagery, onPointerMove, onPointerLeave, onClick }: Props) {
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

  return (
    <mesh
      name="terrain"
      geometry={geometry}
      receiveShadow
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onClick={onClick}
    >
      {imagery ? (
        <meshStandardMaterial map={imagery} color="#ffffff" roughness={1} flatShading={false} />
      ) : (
        <meshStandardMaterial vertexColors roughness={0.95} flatShading={false} />
      )}
    </mesh>
  );
}
