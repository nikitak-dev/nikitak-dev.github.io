/* Matrix rain orchestrator. Detects mode (amber/green/error) from body,
   initializes the correct renderer, runs the RAF loop at ~12.5 fps, and
   handles resize/content-driven reinit.
   TODO: pause on document.hidden — see audit 2026-04-22 */

import { measureSafeArea } from './measure';
import { initColumns, renderColumns, advanceGhosts } from './columns';
import { initSnakes, advanceSnakes, renderSnakes } from './snakes';
import { initLens, resizeLens, blitLens } from './lens';

if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const canvas = document.getElementById('matrix-bg') as HTMLCanvasElement | null;
  const lens = document.getElementById('matrix-lens') as HTMLCanvasElement | null;
  const ctx = canvas?.getContext('2d') ?? null;

  if (canvas && ctx) {
    const fontSize = 14;
    const errorMode = document.body.dataset.error === 'true';
    const amberMode = !errorMode && document.body.dataset.theme === 'amber';

    /* Read from body: error-mode / amber remap cascade through custom properties */
    const bodyStyles = getComputedStyle(document.body);
    const mainColor  = bodyStyles.getPropertyValue('--green').trim();
    const trailColor = bodyStyles.getPropertyValue('--matrix-trail').trim();
    const fontFamily = bodyStyles.getPropertyValue('--font').trim() || 'monospace';
    const palette = { main: mainColor, trail: trailColor };

    let yOffset = 0;
    let initialized = false;

    function initMatrix(): void {
      canvas!.width = window.innerWidth;
      canvas!.height = window.innerHeight;
      if (lens) resizeLens(window.innerWidth, window.innerHeight);

      const { top, bottom } = measureSafeArea();
      const safeH = Math.max(fontSize, bottom - top);
      const rowCount = Math.max(1, Math.floor(safeH / fontSize));
      /* Center any sub-fontSize slack so the leftover pixel is split between
         edges rather than piling up at the bottom. */
      yOffset = top + Math.floor((safeH - rowCount * fontSize) / 2);

      if (amberMode) {
        initSnakes({ canvasWidth: canvas!.width, rowCount, fontSize });
      } else {
        initColumns({ canvasWidth: canvas!.width, rowCount, fontSize, errorMode });
      }
      initialized = true;
    }

    function clearCanvas(): void {
      ctx!.fillStyle = 'rgba(0, 0, 0, 0.06)';
      ctx!.fillRect(0, 0, canvas!.width, canvas!.height);
      ctx!.font = `${fontSize}px ${fontFamily}`;
    }

    let lastTime = 0;
    const INTERVAL_MS = 80; // ~12.5 fps
    let rafId: number | null = null;

    function drawMatrix(timestamp: number): void {
      rafId = requestAnimationFrame(drawMatrix);
      if (!initialized) return;
      if (timestamp - lastTime < INTERVAL_MS) return;
      lastTime = timestamp;

      clearCanvas();
      if (amberMode) {
        advanceSnakes();
        renderSnakes(ctx!, palette, yOffset);
      } else {
        renderColumns(ctx!, palette, yOffset);
        advanceGhosts(ctx!, palette.main, yOffset);
      }
      blitLens();
    }

    /* Debounced reinit — both viewport resize and header/footer size changes
       funnel through here so the grid stays snapped to the current safe area. */
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    const scheduleInit = () => {
      if (resizeTimer) clearTimeout(resizeTimer);
      resizeTimer = setTimeout(initMatrix, 100);
    };

    /* Defer the first init until DOM is parsed (header/footer are siblings
       rendered after this component, so their metrics aren't available on
       inline-script evaluation). The draw loop runs but no-ops until ready. */
    function bootstrap(): void {
      initMatrix();
      /* ResizeObserver catches content-driven size changes (fonts loading,
         dynamic header bits, footer toggles) that don't fire window resize. */
      if (typeof ResizeObserver === 'function') {
        const targets = [
          document.querySelector('header'),
          document.querySelector('footer.hub-footer'),
          document.getElementById('input-bar'),
        ].filter(Boolean) as HTMLElement[];
        if (targets.length) {
          const ro = new ResizeObserver(scheduleInit);
          for (const t of targets) ro.observe(t);
        }
      }
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', bootstrap, { once: true });
    } else {
      bootstrap();
    }
    window.addEventListener('resize', scheduleInit);
    rafId = requestAnimationFrame(drawMatrix);

    if (lens) initLens(lens, canvas);

    window.addEventListener('beforeunload', () => {
      if (rafId) cancelAnimationFrame(rafId);
    });
  }
}

export {};
