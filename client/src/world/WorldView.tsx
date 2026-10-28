import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CameraMode } from '../../../shared/mission';
import { isInBounds, roundCoord, sceneToWorld, worldToScene, type Vec2, type WorldDefinition } from '../../../shared/world';
import CameraRig, { type FollowTarget } from './CameraRig';
import Terrain from './Terrain';
import { Bounds, Landmarks, Roads, Trees } from './Features';
import { useWorld } from './useWorld';

// A pointer that travels more than this many pixels between down and up is a
// camera drag, not a terrain click (so orbiting never places anything later).
export const CLICK_MAX_DRAG_PX = 4;

function toWorldPoint(world: WorldDefinition, e: ThreeEvent<PointerEvent | MouseEvent>): Vec2 | null {
  const [x, z] = sceneToWorld(world, e.point.x, e.point.z);
  return isInBounds(world, x, z) ? [roundCoord(x), roundCoord(z)] : null;
}

function ClickMarker({ world, at }: { world: WorldDefinition; at: Vec2 }) {
  const [sx, sy, sz] = worldToScene(world, at[0], at[1]);
  return (
    <mesh position={[sx, sy + 0.25, sz]} rotation-x={-Math.PI / 2} raycast={() => null}>
      <ringGeometry args={[1.2, 1.8, 32]} />
      <meshBasicMaterial color="#fde68a" />
    </mesh>
  );
}

function Scene({ world, onHover, onPick, picked, children, camera }: {
  world: WorldDefinition;
  onHover: (p: Vec2 | null) => void;
  onPick: (p: Vec2) => void;
  picked: Vec2 | null;
  children?: ReactNode;
  camera: ReactNode;
}) {
  return (
    <>
      <color attach="background" args={['#0b1b24']} />
      <fog attach="fog" args={['#0b1b24', 260, 480]} />
      <hemisphereLight args={['#cfe8ff', '#2c3a26', 0.7]} />
      <directionalLight position={[80, 120, 40]} intensity={1.6} castShadow />
      <Terrain
        world={world}
        onPointerMove={(e) => onHover(toWorldPoint(world, e))}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > CLICK_MAX_DRAG_PX) return;
          const p = toWorldPoint(world, e);
          if (p) onPick(p);
        }}
      />
      <Roads world={world} />
      <Trees world={world} />
      <Landmarks world={world} />
      <Bounds world={world} />
      {picked && <ClickMarker world={world} at={picked} />}
      {children}
      <OrbitControls makeDefault enableDamping target={[0, 0, 0]} minDistance={25} maxDistance={340} maxPolarAngle={1.35} />
      {camera}
    </>
  );
}

const fmt = (p: Vec2 | null) => (p ? `X ${p[0].toFixed(1)} · Z ${p[1].toFixed(1)}` : '—');

interface WorldViewProps {
  /** Called with the rounded world X/Z after a genuine terrain click (never after an orbit drag). */
  onPick?: (p: Vec2) => void;
  /** Extra 3D content (e.g. Red-only object markers), rendered inside the canvas. */
  renderScene?: (world: WorldDefinition) => ReactNode;
  /** DOM overlay on top of the canvas (e.g. a placement-mode banner). */
  overlay?: ReactNode;
  crosshair?: boolean;
  /** Overview (default), Follow (needs followTarget) or Top-Down. Visual only; never affects the simulation. */
  cameraMode?: CameraMode;
  followTarget?: MutableRefObject<FollowTarget | null>;
  cameraResetKey?: number;
}

export default function WorldView({ onPick, renderScene, overlay, crosshair, cameraMode = 'OVERVIEW', followTarget, cameraResetKey }: WorldViewProps = {}) {
  const host = useRef<HTMLElement>(null);
  const state = useWorld();
  const [hover, setHover] = useState<Vec2 | null>(null);
  const [picked, setPicked] = useState<Vec2 | null>(null);
  const [rendered, setRendered] = useState(false);

  if (state.status !== 'ready') {
    return (
      <section className="flex h-[60vh] min-h-[360px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-slate-400">
        {state.status === 'loading' ? 'Loading shared world…' : `Could not load world: ${state.message}`}
      </section>
    );
  }

  const { world } = state;
  return (
    <section
      ref={host}
      data-camera-mode={cameraMode}
      data-testid="world-view"
      data-terrain-id={world.terrainId}
      data-checksum={world.checksum}
      data-rendered={rendered ? 'true' : 'false'}
      data-picked={picked ? `${picked[0]},${picked[1]}` : ''}
      className="overflow-hidden rounded-xl border border-white/10"
    >
      <div className={`relative h-[60vh] min-h-[360px] ${crosshair ? 'cursor-crosshair' : ''}`}>
        <Canvas
          shadows
          dpr={[1, 2]}
          camera={{ position: [0, 175, 215], fov: 45, near: 1, far: 1000 }}
          onCreated={() => setRendered(true)}
          fallback={<div className="p-6 text-sm text-rose-300">WebGL is not available in this browser.</div>}
        >
          <Scene
            world={world}
            onHover={setHover}
            onPick={(p) => {
              setPicked(p);
              onPick?.(p);
            }}
            picked={picked}
            camera={<CameraRig mode={cameraMode} follow={followTarget} resetKey={cameraResetKey} host={host} />}
          >
            {renderScene?.(world)}
          </Scene>
        </Canvas>
        <div className="pointer-events-none absolute left-3 top-3 rounded bg-black/60 px-2 py-1 text-[11px] font-semibold tracking-widest text-teal-200">
          VIRTUAL WORLD · {world.terrainId}
        </div>
        {overlay}
      </div>
      <div className="grid gap-2 bg-white/5 px-4 py-3 text-sm sm:grid-cols-3">
        <div>
          <div className="text-xs text-slate-400">Pointer</div>
          <div className="font-mono" data-testid="hover-coord">{fmt(hover)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">Last clicked</div>
          <div className="font-mono" data-testid="picked-coord">{fmt(picked)}</div>
        </div>
        <div>
          <div className="text-xs text-slate-400">World</div>
          <div className="font-mono text-slate-300">
            {world.xMax - world.xMin}×{world.zMax - world.zMin} {world.units} · #{world.checksum}
          </div>
        </div>
      </div>
      <p className="bg-white/5 px-4 pb-3 text-xs text-slate-500">
        Drag to orbit, scroll to zoom, right-drag to pan. Coordinates are fictional X/Z units, not GPS.
      </p>
    </section>
  );
}
