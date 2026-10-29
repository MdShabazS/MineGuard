import * as THREE from 'three';
import {
  BITM_TEXTURE_SIZE, bitmSatelliteTiles, esriWorldImageryTileUrl,
  geoTilesForBounds, type GeoBounds, type SatelliteTile,
} from '../../../shared/geographic';

/** Live display imagery only. No cache, downloads, exports or server proxy.
 * A base image covers the BITM 10 km square; a separate, camera-driven
 * high-resolution patch is only requested for the portion being inspected.
 */
export interface SatelliteTextureResult {
  texture: THREE.CanvasTexture;
  loaded: number;
  total: number;
  firstFailure: string | null;
}

function imageAt(url: string, signal: AbortSignal): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(Error('Map request cancelled')); return; }
    const image = new Image();
    image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => fail(Error('Map tile timed out')), 18000);
    const cleanup = () => {
      window.clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      image.onload = null;
      image.onerror = null;
    };
    const fail = (error: Error) => { cleanup(); image.src = ''; reject(error); };
    const onAbort = () => fail(Error('Map request cancelled'));
    signal.addEventListener('abort', onAbort, { once: true });
    image.onerror = () => fail(Error('Could not load satellite tile'));
    image.onload = () => {
      if (image.naturalWidth < 64 || image.naturalHeight < 64) {
        fail(Error('Satellite provider returned a non-map image'));
        return;
      }
      cleanup();
      resolve(image);
    };
    image.src = url;
  });
}

async function composeTiles(
  signal: AbortSignal, tiles: SatelliteTile[], size: number,
): Promise<SatelliteTextureResult> {
  if (!tiles.length || tiles.length > 96) throw Error('Satellite request exceeds display tile limit');
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw Error('This browser does not support satellite image compositing.');
  ctx.fillStyle = '#182634';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let loaded = 0;
  let firstFailure: string | null = null;
  let next = 0;
  const images: ({ tile: SatelliteTile; image: HTMLImageElement } | null)[] =
    Array(tiles.length).fill(null);

  const run = async () => {
    while (!signal.aborted && next < tiles.length) {
      const index = next++;
      const tile = tiles[index];
      try {
        const image = await imageAt(esriWorldImageryTileUrl(tile), signal);
        if (signal.aborted) return;
        images[index] = { tile, image };
        loaded++;
      } catch (err) {
        if (!signal.aborted && firstFailure === null) {
          firstFailure = err instanceof Error ? err.message : 'Satellite tile failed';
        }
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, tiles.length) }, () => run()));
  if (signal.aborted) throw Error('Map request cancelled');
  if (!loaded) throw Error(firstFailure ?? 'No satellite tiles could be loaded');

  // Canvas top is north and PlaneGeometry texture top is north after Three
  // handles CanvasTexture.flipY. Tile columns increase east and rows south.
  for (const result of images) {
    if (!result) continue;
    const { tile, image } = result;
    ctx.drawImage(image, tile.drawX, tile.drawY, tile.drawWidth, tile.drawHeight);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 4;
  texture.minFilter = THREE.LinearMipmapLinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;
  return { texture, loaded, total: tiles.length, firstFailure };
}

/** Existing z14 full-extent image remains the reliable base layer. */
export function loadBitmSatelliteTexture(signal: AbortSignal): Promise<SatelliteTextureResult> {
  return composeTiles(signal, bitmSatelliteTiles(), BITM_TEXTURE_SIZE);
}

/** Only the zoomed, visible geographic rectangle is requested at z15–19.
 * No background/offscreen harvesting. Abort on pan/zoom and dispose textures.
 */
export function loadVisibleSatelliteDetail(
  signal: AbortSignal, bounds: GeoBounds, zoom: number,
): Promise<SatelliteTextureResult> {
  const tiles = geoTilesForBounds(bounds, BITM_TEXTURE_SIZE, zoom);
  return composeTiles(signal, tiles, BITM_TEXTURE_SIZE);
}
