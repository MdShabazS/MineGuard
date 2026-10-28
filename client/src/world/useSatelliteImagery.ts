import { useEffect, useState } from 'react';
import * as THREE from 'three';
import { satelliteTileCoverage } from '../../../shared/geo';

// Esri World Imagery is used ONLY as a live, attributed, noncommercial
// educational basemap. Never batch-download it to disk or redistribute it.
// For offline mode, the user must supply imagery they are licensed to use.
export const SATELLITE_CREDIT = 'Imagery: Esri, Maxar, Earthstar Geographics and the GIS User Community';
const WORLD_IMAGERY = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile';

type ImageryState =
  | { status: 'idle'; texture: null; message: string }
  | { status: 'loading'; texture: null; message: string }
  | { status: 'ready'; texture: THREE.Texture; message: string }
  | { status: 'error'; texture: null; message: string };

const makeTexture = (canvas: HTMLCanvasElement): THREE.CanvasTexture => {
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  texture.needsUpdate = true;
  return texture;
};

function loadTile(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const timeout = window.setTimeout(() => {
      if (settled) return;
      settled = true;
      img.src = '';
      reject(new Error('Satellite imagery request timed out'));
    }, 18000);
    img.onload = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      resolve(img);
    };
    img.onerror = () => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeout);
      reject(new Error('Satellite tile blocked or unavailable'));
    };
    img.src = url;
  });
}

async function composeSatellite(zoom: 13 | 14 | 15): Promise<THREE.Texture> {
  const region = satelliteTileCoverage(zoom);
  // At zoom 15 this is normally ~100 tiles; bounded to avoid accidental
  // massive external requests if the geographic preset ever changes.
  if (region.tiles.length > 144 || region.tiles.length < 1) throw new Error('Satellite extent exceeds the safe tile limit');
  const canvas = document.createElement('canvas');
  canvas.width = 2048;
  canvas.height = 2048;
  const ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) throw new Error('2D image canvas is unavailable');
  ctx.fillStyle = '#263a3e';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Fetch small batches to avoid overwhelming the browser/provider; never
  // persist Esri data. The texture exists in memory only for this view.
  let successCount = 0;
  const errors: Error[] = [];
  for (let i = 0; i < region.tiles.length; i += 8) {
    const group = region.tiles.slice(i, i + 8);
    const loaded = await Promise.allSettled(group.map((t) => loadTile(
      WORLD_IMAGERY + '/'+ t.zoom + '/' + t.y + '/' + t.x,
    )));
    loaded.forEach((result, j) => {
      if (result.status === 'rejected') {
        errors.push(result.reason instanceof Error ? result.reason : Error(String(result.reason)));
        return;
      }
      const tile = group[j];
      const scaleX = canvas.width / region.widthPixel;
      const scaleY = canvas.height / region.heightPixel;
      ctx.drawImage(
        result.value,
        (tile.x * 256 - region.leftPixel) * scaleX,
        (tile.y * 256 - region.topPixel) * scaleY,
        256 * scaleX + 0.2,
        256 * scaleY + 0.2,
      );
      successCount++;
    });
    if (errors.length) break; // fail closed rather than displaying a partial map as correct
  }
  if (errors.length || successCount !== region.tiles.length) {
    throw new Error('Unable to load complete BITM satellite area. Check Internet access and imagery-provider availability.');
  }
  return makeTexture(canvas);
}

async function readLicensedImage(file: File): Promise<THREE.Texture> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 20 * 1024 * 1024) {
    throw new Error('Select a JPG, PNG or WebP map image under 20 MB');
  }
  const blobUrl = URL.createObjectURL(file);
  try {
    const img = await loadTile(blobUrl);
    if (img.naturalWidth < 256 || img.naturalHeight < 256) throw new Error('Map image must be at least 256×256 pixels');
    const aspect = img.naturalWidth / img.naturalHeight;
    if (aspect < 0.95 || aspect > 1.05) throw new Error('Offline image must be square (north-up 10×10 km area centered at BITM)');
    const canvas = document.createElement('canvas');
    canvas.width = 2048;
    canvas.height = 2048;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D image canvas is unavailable');
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return makeTexture(canvas);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }
}

/** Imagery affects only the 3D visual surface; the shared world and server
 * coordinates, hazard placements, mission paths, and sensor rules never change. */
export function useSatelliteImagery(
  mode: 'ORIGINAL' | 'SATELLITE' | 'OFFLINE',
  zoom: 13 | 14 | 15,
  file: File | null,
): ImageryState {
  const [state, setState] = useState<ImageryState>({ status: 'idle', texture: null, message: '' });
  useEffect(() => {
    if (mode === 'ORIGINAL' || (mode === 'OFFLINE' && !file)) {
      setState({ status: 'idle', texture: null, message: mode === 'OFFLINE' ? 'Choose an authorized north-up 10×10 km image.' : '' });
      return;
    }
    let alive = true;
    let activeTexture: THREE.Texture | null = null;
    setState({ status: 'loading', texture: null, message: mode === 'SATELLITE' ? 'Loading live satellite imagery…' : 'Reading offline map…' });
    const task = mode === 'SATELLITE' ? composeSatellite(zoom) : readLicensedImage(file!);
    task.then((texture) => {
      if (!alive) {
        texture.dispose();
        return;
      }
      activeTexture = texture;
      setState({ status: 'ready', texture, message: mode === 'SATELLITE' ? 'Live satellite imagery ready' : 'Licensed offline map ready' });
    }).catch((e: unknown) => {
      if (alive) setState({ status: 'error', texture: null, message: e instanceof Error ? e.message : 'Map unavailable' });
    });
    return () => {
      alive = false;
      activeTexture?.dispose();
    };
  }, [mode, zoom, file]);
  return state;
}
