import { useCallback, useEffect, useRef, useState, type ChangeEvent, type MutableRefObject, type ReactNode } from 'react';
import { Canvas, type ThreeEvent } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import type { CameraMode } from '../../../shared/mission';
import { BITM_AREA, virtualToGeographic } from '../../../shared/geographic';
import { isInBounds, roundCoord, sceneToWorld, worldToScene, type Vec2, type WorldDefinition } from '../../../shared/world';
import CameraRig, { type FollowTarget } from './CameraRig';
import Terrain, { type ImageryState } from './Terrain';
import GeoOverlay from './GeoOverlay';
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

function Scene({ world, onHover, onPick, picked, children, camera, imageryUrl, onImageryState, realMap, bitmSatellite, showBoundary }: {
  world: WorldDefinition;
  onHover: (p: Vec2 | null) => void;
  onPick: (p: Vec2) => void;
  picked: Vec2 | null;
  children?: ReactNode;
  camera: ReactNode;
  imageryUrl: string | null;
  onImageryState: (value: ImageryState, details?: string) => void;
  realMap: boolean;
  bitmSatellite: boolean;
  showBoundary: boolean;
}) {
  return (
    <>
      <color attach="background" args={['#0b1b24']} />
      <fog attach="fog" args={['#0b1b24', 260, 480]} />
      <hemisphereLight args={['#cfe8ff', '#2c3a26', 0.7]} />
      <directionalLight position={[80, 120, 40]} intensity={1.6} castShadow />
      <Terrain
        world={world}
        imageryUrl={imageryUrl}
        bitmSatellite={bitmSatellite}
        onImageryState={onImageryState}
        onPointerMove={(e) => onHover(toWorldPoint(world, e))}
        onPointerLeave={() => onHover(null)}
        onClick={(e) => {
          if (e.delta > CLICK_MAX_DRAG_PX) return;
          const p = toWorldPoint(world, e);
          if (p) onPick(p);
        }}
      />
      {!realMap && <Roads world={world} />}
      {!realMap && <Trees world={world} />}
      {!realMap && <Landmarks world={world} />}
      {realMap && showBoundary && <GeoOverlay world={world} />}
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
  // This map choice affects only a visible texture and labels, NEVER room
  // truth, scenario coordinates or flight mechanics. The fixed BITM preset
  // gives both portals the exact same geographic registration when selected.
  const [mapMode, setMapMode] = useState<'ORIGINAL' | 'BITM' | 'IMPORT'>('ORIGINAL');
  const [importedUrl, setImportedUrl] = useState<string | null>(null);
  const importObjectUrl = useRef<string | null>(null);
  const [importFilename, setImportFilename] = useState('');
  const [mapError, setMapError] = useState('');
  const [imageryState, setImageryState] = useState<ImageryState | null>(null);
  const [imageryDetails, setImageryDetails] = useState('');
  const [showBoundary, setShowBoundary] = useState(false);

  useEffect(() => () => {
    if (importObjectUrl.current) URL.revokeObjectURL(importObjectUrl.current);
  }, []);

  const onImageryState = useCallback((value: ImageryState, details?: string) => {
    setImageryState(value);
    setImageryDetails(details ?? '');
  }, []);

  const importImage = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 15 * 1024 * 1024) {
      setMapError('Choose a licensed JPEG, PNG or WebP image no larger than 15 MB.');
      event.target.value = '';
      return;
    }
    if (importObjectUrl.current) URL.revokeObjectURL(importObjectUrl.current);
    const url = URL.createObjectURL(file);
    importObjectUrl.current = url;
    setImportedUrl(url);
    setImportFilename(file.name);
    setMapError('');
    setImageryState(null);
    setMapMode('IMPORT');
  };

  if (state.status !== 'ready') {
    return (
      <section className="flex h-[60vh] min-h-[360px] items-center justify-center rounded-xl border border-white/10 bg-white/5 text-sm text-slate-400">
        {state.status === 'loading' ? 'Loading shared world…' : `Could not load world: ${state.message}`}
      </section>
    );
  }

  const { world } = state;
  const imageryUrl = mapMode === 'IMPORT' ? importedUrl : null;
  const realMap = mapMode !== 'ORIGINAL';
  const chooseMode = (mode: 'ORIGINAL' | 'BITM' | 'IMPORT') => {
    if (mode === 'IMPORT' && !importedUrl) return;
    setMapError('');
    setImageryState(null);
    setImageryDetails('');
    setMapMode(mode);
  };
  const campus = virtualToGeographic(100, 100);
  return (
    <section
      ref={host}
      data-camera-mode={cameraMode}
      data-map-mode={mapMode}
      data-map-available={imageryState === 'ready' || imageryState === 'partial' ? 'true' : 'false'}
      data-map-tile-status={imageryDetails}
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
            imageryUrl={imageryUrl}
            onImageryState={onImageryState}
            realMap={realMap}
            bitmSatellite={mapMode === 'BITM'}
            showBoundary={showBoundary}
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
      <div data-testid="map-selector" className="space-y-2 border-t border-white/10 bg-slate-950/95 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <strong className="mr-2 text-xs uppercase tracking-wider text-slate-300">Map view</strong>
          <button type="button" data-testid="map-mode-original" aria-pressed={mapMode === 'ORIGINAL'}
            onClick={() => chooseMode('ORIGINAL')}
            className={mapMode === 'ORIGINAL' ? 'rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950' : 'rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200'}>
            Original 3D
          </button>
          <button type="button" data-testid="map-mode-bitm" aria-pressed={mapMode === 'BITM'}
            onClick={() => chooseMode('BITM')}
            className={mapMode === 'BITM' ? 'rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950' : 'rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200'}>
            BITM Satellite · 5 km
          </button>
          {realMap && (
            <button type="button" data-testid="toggle-map-boundary" aria-pressed={showBoundary}
              onClick={() => setShowBoundary((previous) => !previous)}
              className="rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200">
              {showBoundary ? 'Hide 5 km outline' : 'Show 5 km outline'}
            </button>
          )}
          {importedUrl && (
            <button type="button" data-testid="map-mode-import" aria-pressed={mapMode === 'IMPORT'}
              onClick={() => chooseMode('IMPORT')}
              className={mapMode === 'IMPORT' ? 'rounded bg-teal-500 px-3 py-1.5 text-xs font-semibold text-slate-950' : 'rounded border border-slate-600 px-3 py-1.5 text-xs text-slate-200'}>
              Imported image
            </button>
          )}
          <label className="ml-auto cursor-pointer rounded border border-dashed border-slate-500 px-3 py-1.5 text-xs text-slate-200">
            Import licensed map
            <input type="file" data-testid="import-map-image" accept=".png,.jpg,.jpeg,.webp,image/png,image/jpeg,image/webp"
              onChange={importImage} className="sr-only" />
          </label>
        </div>
        {realMap && (
          <div data-testid="bitm-map-metadata" className="space-y-1 text-[11px] text-slate-300">
            <p><strong>BITM Ballari</strong> · {campus.latitude.toFixed(6)}°N, {campus.longitude.toFixed(6)}°E · satellite photos across the 10 km × 10 km area (5 km radius from campus). Boundary outline optional.</p>
            <p>Visual geographic overlay only. Virtual X/Z coordinates and simulated drone/sensing are unchanged. Terrain elevation remains <strong>illustrative, not real DEM elevation</strong>.</p>
            {mapMode === 'BITM' ? (
              <p className="flex flex-wrap gap-2">Online imagery: <a className="underline" href="https://www.esri.com/en-us/legal/terms/web-site-service" target="_blank" rel="noreferrer">Esri World Imagery / terms</a>. {BITM_AREA.attribution}. Not cached or downloadable by MineGuard.
                {imageryState === 'loading' && <span data-testid="imagery-loading">Loading live satellite imagery…</span>}
                {imageryState === 'ready' && <span data-testid="imagery-ready" className="text-emerald-300">Satellite tiles displayed: {imageryDetails}</span>}
                {imageryState === 'partial' && <span data-testid="imagery-partial" className="text-amber-300">Satellite partially available: {imageryDetails}</span>}
              </p>
            ) : (
              <p data-testid="imported-map-name">Local image: {importFilename} (browser-only; not uploaded). Source and image rights are the importer's responsibility. Image must be north-up and cover the shown 10 × 10 km square.</p>
            )}
            {imageryState === 'error' && <p role="alert" data-testid="imagery-error" className="text-amber-300">Satellite photo unavailable ({imageryDetails}). A plain simulated terrain fallback is displayed. Check network/CORS or import a licensed map image.</p>}
          </div>
        )}
        {mapError && <p role="alert" data-testid="map-import-error" className="text-xs text-rose-300">{mapError}</p>}
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
