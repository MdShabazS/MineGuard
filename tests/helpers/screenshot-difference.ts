import type { Page } from 'playwright-core';

/** Compare actual visible WebGL screenshots. Use an untransformed script
 * string because tsx injects __name into callback functions passed to
 * page.evaluate, where the helper is not defined in browser isolation.
 * No screenshots or Esri image bytes are persisted or uploaded.
 */
export async function visiblePixelDifference(
  page: Page, before: Buffer, after: Buffer, margin = 0.18, stride = 9,
): Promise<number> {
  if (!Number.isFinite(margin) || margin < 0 || margin > 0.45 ||
      !Number.isInteger(stride) || stride < 1) throw Error('Invalid pixel comparison');
  const aSrc = 'data:image/png;base64,' + before.toString('base64');
  const bSrc = 'data:image/png;base64,' + after.toString('base64');
  const script = `(async () => {
    const imageA = new Image();
    const imageB = new Image();
    imageA.src = ${JSON.stringify(aSrc)};
    imageB.src = ${JSON.stringify(bSrc)};
    await Promise.all([imageA.decode(), imageB.decode()]);
    if (imageA.naturalWidth !== imageB.naturalWidth ||
        imageA.naturalHeight !== imageB.naturalHeight) throw Error('Screenshot dimension mismatch');
    const c1 = document.createElement('canvas');
    const c2 = document.createElement('canvas');
    c1.width = c2.width = imageA.naturalWidth;
    c1.height = c2.height = imageA.naturalHeight;
    const x = c1.getContext('2d');
    const y = c2.getContext('2d');
    x.drawImage(imageA, 0, 0);
    y.drawImage(imageB, 0, 0);
    const a = x.getImageData(0, 0, c1.width, c1.height);
    const b = y.getImageData(0, 0, c2.width, c2.height);
    let changed = 0, total = 0;
    for (let row = Math.floor(a.height * ${margin}); row < a.height * (1 - ${margin}); row += ${stride}) {
      for (let col = Math.floor(a.width * ${margin}); col < a.width * (1 - ${margin}); col += ${stride}) {
        const index = (row * a.width + col) * 4;
        const delta = Math.abs(a.data[index] - b.data[index]) +
          Math.abs(a.data[index + 1] - b.data[index + 1]) +
          Math.abs(a.data[index + 2] - b.data[index + 2]);
        if (delta > 75) changed++;
        total++;
      }
    }
    return changed / Math.max(1, total);
  })()`;
  return await page.evaluate(script) as number;
}
