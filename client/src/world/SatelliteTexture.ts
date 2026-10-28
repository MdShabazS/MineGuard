import * as THREE from 'three';
import {
  BITM_TEXTURE_SIZE, bitmSatelliteTiles, esriWorldImageryTileUrl,
  type SatelliteTile,
} from '../../../shared/geographic';

/** Request only the ~5×5 currently visible Esri satellite tiles for BITM.
 * This canvas exists solely in browser memory for the displayed texture.
 * It is never persisted, downloaded, exposed as a public image, or sent
 * back to the app's own server.
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

export async function loadBitmSatelliteTexture(signal: AbortSignal): Promise<SatelliteTextureResult> {
  const tiles = bitmSatelliteTiles();
  const canvas = document.createElement('canvas');
  canvas.width = BITM_TEXTURE_SIZE;
  canvas.height = BITM_TEXTURE_SIZE;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw Error('This browser does not support satellite image compositing.');
  ctx.fillStyle = '#182634';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  let loaded = 0;
  let firstFailure: string | null = null;
  let next = 0;
  const results: ({ tile: SatelliteTile; image: HTMLImageElement } | null)[] = Array(tiles.length).fill(null);

  // Limit concurrent network requests; a single 10km area is about 25 tiles.
  const run = async () => {
    while (!signal.aborted && next < tiles.length) {
      const index = next++;
      const tile = tiles[index];
      try {
        const image = await imageAt(esriWorldImageryTileUrl(tile), signal);
        if (signal.aborted) return;
        results[index] = { tile, image };
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

  // Preserve north-up order: Mercator tile rows increase southward, matching
  // the Three PlaneGeometry's north (-Z) to top-of-texture orientation.
  for (const result of results) {
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
