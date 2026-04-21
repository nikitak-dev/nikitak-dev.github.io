/* Cursor lens — mirrors the matrix canvas inside a radial mask that follows
   the pointer with an inertial lerp. Init takes the source canvas (matrix) and
   the lens canvas; `blit()` copies the current source frame into the lens. */

let lensEl: HTMLCanvasElement | null = null;
let lensCtx: CanvasRenderingContext2D | null = null;
let sourceEl: HTMLCanvasElement | null = null;

export function initLens(lens: HTMLCanvasElement, source: HTMLCanvasElement): void {
  lensEl = lens;
  lensCtx = lens.getContext('2d');
  sourceEl = source;

  let targetX = -200, targetY = -200;
  let currentX = -200, currentY = -200;
  let cursorActive = false;
  const LERP = 0.22;

  window.addEventListener('mousemove', e => {
    targetX = e.clientX;
    targetY = e.clientY;
    if (!cursorActive) { cursorActive = true; requestAnimationFrame(lerpLoop); }
  });
  window.addEventListener('mouseleave', () => {
    targetX = -200; targetY = -200;
  });

  function lerpLoop(): void {
    currentX += (targetX - currentX) * LERP;
    currentY += (targetY - currentY) * LERP;
    lensEl!.style.setProperty('--cx', currentX.toFixed(1) + 'px');
    lensEl!.style.setProperty('--cy', currentY.toFixed(1) + 'px');
    if (Math.abs(targetX - currentX) > 0.5 || Math.abs(targetY - currentY) > 0.5) {
      requestAnimationFrame(lerpLoop);
    } else {
      cursorActive = false;
    }
  }
}

export function resizeLens(width: number, height: number): void {
  if (!lensEl) return;
  lensEl.width = width;
  lensEl.height = height;
}

export function blitLens(): void {
  if (!lensCtx || !lensEl || !sourceEl) return;
  lensCtx.clearRect(0, 0, lensEl.width, lensEl.height);
  lensCtx.drawImage(sourceEl, 0, 0);
}
