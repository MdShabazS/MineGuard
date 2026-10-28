import { useRef, useState, type MutableRefObject, type ReactNode } from 'react';
import type * as THREE from 'three';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CameraMode } from '../../../shared/mission';
import { BITM_GEO, worldToGeo } from '../../../shared/geo';
import { isInBounds, roundCoord, sceneToWorld, worldToScene, type Vec2, type WorldDefinition } from '../../../shared/world';
import CameraRig, { type FollowTarget } from './CameraRig';
import Terrain from './Terrain';
import GeoReferenceLayer from './GeoReferenceLayer';
import { SATELLITE_CREDIT, useSatelliteImagery } from './useSatelliteImagery';
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

function Scene({ world, onHover, onPick, picked, children, camera, imagery }: {
  world: WorldDefinition;
  onHover: (p: Vec2 | null) => void;
  onPick: (p: Vec2) => void;
  picked: Vec2 | null;
  children?: ReactNode;
  camera: ReactNode;
  imagery: THREE.Texture | null;
}) {
  return (
    <>
      <color attach="background" args={['#0b1b24']} />
      <fog attach="fog" args={['#0b1b24', 260, 480]} />
      <hemisphereLight args={['#cfe8ff', '#2c3a26', 0.7]} />
      <directionalLight position={[80, 120, 40]} intensity={1.6} castShadow />
      <Terrain
        imagery={imagery}
        world={world}
        onPointerMove={(e) => onHover(toWorldPoint(world, e))}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > CLICK_MAX_DRAG_PX) return;
          const p = toWorldPoint(world, e);
          if (p) onPick(p);
        }}
      />
      {!imagery && <Roads world={world} />}
      {!imagery && <Trees world={world} />}
      {!imagery && <Landmarks world={world} />}
      {imagery && <GeoReferenceLayer world={world} />}
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
  const [mapMode, setMapMode] = useState<'ORIGINAL' | 'SATELLITE' | 'OFFLINE'>(() => {
    try {
      return localStorage.getItem('mineguard-geo-mode') === 'SATELLITE' ? 'SATELLITE' : 'ORIGINAL';
    } catch {
      return 'ORIGINAL';
    }
  });
  const [mapZoom, setMapZoom] = useState<13 | 14 | 15>(14);
  const [offlineMap, setOfflineMap] = useState<File | null>(null);
  const offlineInput = useRef<HTMLInputElement>(null);
  const imagery = useSatelliteImagery(mapMode, mapZoom, offlineMap);
  const activeTexture = imagery.status === 'ready' ? imagery.texture : null;
  const setMode = (next: 'ORIGINAL' | 'SATELLITE' | 'OFFLINE') => {
    setMapMode(next);
    try {
      // Do not remember an offline file across reloads: it stays local.
      localStorage.setItem('mineguard-geo-mode', next === 'SATELLITE' ? 'SATELLITE' : 'ORIGINAL');
    } catch { /* private browser mode: the current view still works */ }
  };

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
      data-map-mode={mapMode}
      data-imagery-status={imagery.status}
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
            imagery={activeTexture}
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
          {activeTexture ? 'BITM · 5 KM SATELLITE REFERENCE' : `VIRTUAL WORLD · ${world.terrainId}`}
        </div>
        <div className="absolute left-3 top-11 z-10 max-w-[min(92%,300px)] rounded-lg border border-white/20 bg-slate-950/90 p-2 text-[11px] shadow-lg" data-testid="map-switcher">
          <div className="mb-1 font-semibold text-slate-100">World background</div>
          <div className="flex flex-wrap gap-1">
            <button type="button" data-testid="map-original" aria-pressed={mapMode === 'ORIGINAL'} onClick={() => setMode('ORIGINAL')}
              className={`rounded px-2 py-1 ${mapMode === 'ORIGINAL' ? 'bg-teal-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
              Original 3D
            </button>
            <button type="button" data-testid="map-satellite" aria-pressed={mapMode === 'SATELLITE'} onClick={() => setMode('SATELLITE')}
              className={`rounded px-2 py-1 ${mapMode === 'SATELLITE' ? 'bg-teal-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
              BITM satellite
            </button>
            <button type="button" data-testid="map-offline" aria-pressed={mapMode === 'OFFLINE'} onClick={() => { setMode('OFFLINE'); offlineInput.current?.click(); }}
              className={`rounded px-2 py-1 ${mapMode === 'OFFLINE' ? 'bg-teal-600 text-white' : 'bg-white/10 text-slate-300 hover:bg-white/20'}`}>
              Offline image
            </button>
          </div>
          <input data-testid="map-file" ref={offlineInput} type="file" className="sr-only" accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setOfflineMap(e.target.files?.[0] ?? null)} />
          {mapMode === 'SATELLITE' && (
            <label className="mt-2 flex items-center justify-between gap-2 text-slate-300">
              Detail
              <select data-testid="map-detail" className="rounded border border-white/20 bg-slate-900 p-1 text-slate-100" value={mapZoom}
                onChange={(e) => setMapZoom(Number(e.target.value) as 13 | 14 | 15)}>
                <option value={13}>Fast (overview)</option>
                <option value={14}>Balanced</option>
                <option value={15}>Detailed</option>
              </select>
            </label>
          )}
          {mapMode === 'OFFLINE' && offlineMap && <p className="mt-1 max-w-full truncate text-slate-300">{offlineMap.name}</p>}
          {mapMode !== 'ORIGINAL' && (
            <p className={`mt-1 ${imagery.status === 'error' ? 'text-rose-200' : 'text-amber-100'}`} data-testid="map-load-status">
              {imagery.message || 'Choose a map image'}
            </p>
          )}
          {mapMode !== 'ORIGINAL' && <p className="mt-1 text-[10px] text-slate-400">5 km radius around BITM. Real imagery is a visual reference; simulated hazards/flight use fictional X/Z, not GPS.</p>}
        </div>
        {activeTexture && (
          <div className="pointer-events-none absolute bottom-2 right-2 max-w-[75%] rounded bg-black/75 px-2 py-1 text-right text-[9px] text-white"
            data-testid="map-attribution">
            {mapMode === 'SATELLITE' ? SATELLITE_CREDIT : 'User-supplied imagery · licence/attribution is the importer’s responsibility'}
          </div>
        )}
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
        Drag to orbit, scroll to zoom, right-drag to pan. {activeTexture
          ? `BITM reference centre ${BITM_GEO.latitude.toFixed(5)}°N, ${BITM_GEO.longitude.toFixed(5)}°E · visual map extent 10×10 km, circle radius 5 km. ${hover ? `Pointer approx. ${worldToGeo(hover[0], hover[1]).latitude.toFixed(5)}°N, ${worldToGeo(hover[0], hover[1]).longitude.toFixed(5)}°E. ` : ''}All missions use fictional X/Z coordinates, not real GPS.`
          : 'Coordinates are fictional X/Z units, not GPS.'}
      </p>
    </section>
  );
}
