import type { ThreeEvent } from '@react-three/fiber';
import type { ObjectSubtype, ScenarioObject } from '../../../shared/scenario';
import { worldToScene, type Vec2, type WorldDefinition } from '../../../shared/world';
import { CLICK_MAX_DRAG_PX } from './WorldView';

// Red-portal-only markers. They are rendered from the attacker snapshot, which
// the server never sends to Blue, so Blue has nothing to hide in the first place.

export const SUBTYPE_STYLE: Record<ObjectSubtype, { color: string; short: string }> = {
  SURFACE: { color: '#f97316', short: 'Surface' },
  OBSCURED: { color: '#fbbf24', short: 'Obscured' },
  BURIED: { color: '#e879f9', short: 'Buried' },
  ROCK: { color: '#94a3b8', short: 'Rock' },
  SCRAP: { color: '#a8a29e', short: 'Scrap' },
  CONTAINER: { color: '#7dd3fc', short: 'Container' },
};

const LIFT = 0.3;
const STEM = 4;
// Markers must read clearly on a projector at the default overview zoom.
const MARKER_SCALE = 2;

function ghostPosition(world: WorldDefinition, [x, z]: Vec2): [number, number, number] {
  const [sx, sy, sz] = worldToScene(world, x, z);
  return [sx, sy + LIFT, sz];
}

function Head({ subtype, color }: { subtype: ObjectSubtype; color: string }) {
  switch (subtype) {
    case 'SURFACE':
      return (
        <mesh>
          <cylinderGeometry args={[1.3, 1.3, 0.6, 20]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
        </mesh>
      );
    case 'OBSCURED':
      return (
        <mesh rotation-x={Math.PI / 2}>
          <torusGeometry args={[1.2, 0.3, 10, 24]} />
          <meshStandardMaterial color={color} emissive={color} emissiveIntensity={0.35} />
        </mesh>
      );
    case 'BURIED':
      return (
        <mesh rotation-x={Math.PI}>
          <coneGeometry args={[1.2, 1.8, 4]} />
          <meshStandardMaterial color={color} wireframe />
        </mesh>
      );
    case 'ROCK':
      return (
        <mesh>
          <dodecahedronGeometry args={[1]} />
          <meshStandardMaterial color={color} flatShading />
        </mesh>
      );
    case 'SCRAP':
      return (
        <mesh rotation-y={0.6}>
          <boxGeometry args={[2, 0.5, 1]} />
          <meshStandardMaterial color={color} metalness={0.4} />
        </mesh>
      );
    case 'CONTAINER':
      return (
        <mesh>
          <cylinderGeometry args={[0.8, 0.8, 1.4, 12]} />
          <meshStandardMaterial color={color} />
        </mesh>
      );
  }
}

interface Props {
  world: WorldDefinition;
  objects: ScenarioObject[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  /** Point waiting for server confirmation; drawn as a ghost, never as a saved object. */
  pending: Vec2 | null;
}

export default function ObjectMarkers({ world, objects, selectedId, onSelect, pending }: Props) {
  return (
    <group name="scenario-objects">
      {objects.map((o) => {
        const [sx, sy, sz] = worldToScene(world, o.x, o.z);
        const { color } = SUBTYPE_STYLE[o.subtype];
        const selected = o.id === selectedId;
        const click = (e: ThreeEvent<MouseEvent>) => {
          // Selecting a marker must never also place an object on the terrain behind it.
          e.stopPropagation();
          if (e.delta <= CLICK_MAX_DRAG_PX) onSelect(o.id);
        };
        return (
          <group key={o.id} position={[sx, sy + LIFT, sz]} scale={selected ? MARKER_SCALE * 1.3 : MARKER_SCALE}>
            <mesh position={[0, STEM / 2, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.12, 0.12, STEM, 6]} />
              <meshBasicMaterial color={color} />
            </mesh>
            <group position={[0, STEM, 0]}>
              <Head subtype={o.subtype} color={color} />
            </group>
            {/* Invisible, generous hit area from ground to head so markers are easy to pick. */}
            <mesh position={[0, STEM / 2, 0]} onClick={click} visible={false}>
              <cylinderGeometry args={[2.2, 2.2, STEM + 2, 8]} />
              <meshBasicMaterial />
            </mesh>
            {selected && (
              <mesh rotation-x={-Math.PI / 2} position={[0, 0.05, 0]} raycast={() => null}>
                <ringGeometry args={[2.4, 3.1, 32]} />
                <meshBasicMaterial color="#fde047" />
              </mesh>
            )}
          </group>
        );
      })}
      {pending && (
        <group position={ghostPosition(world, pending)} scale={MARKER_SCALE}>
          <mesh position={[0, STEM / 2, 0]} raycast={() => null}>
            <cylinderGeometry args={[0.6, 0.6, STEM, 12]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.35} />
          </mesh>
        </group>
      )}
    </group>
  );
}
