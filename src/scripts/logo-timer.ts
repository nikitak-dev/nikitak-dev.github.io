/* Logo loop — periodically retypes the header logo. Re-entry-guards via
   window._logoHoverActive (owned by logo-back.ts). Exposes _logoTimerStop/Reset
   so the back-logo hover animation can pause the retype cycle while it runs. */

declare global {
  interface Window {
    typeLogo?: () => void;
    _logoTimerStop?: () => void;
    _logoTimerReset?: () => void;
    _logoHoverActive?: boolean;
  }
}

const LOOP_MS = 14000;
let logoLoopTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleLogoLoop(): void {
  if (logoLoopTimer) clearTimeout(logoLoopTimer);
  logoLoopTimer = setTimeout(() => {
    logoLoopTimer = null;
    window.typeLogo?.();
    scheduleLogoLoop();
  }, LOOP_MS);
}

window._logoTimerStop = () => {
  if (logoLoopTimer) clearTimeout(logoLoopTimer);
  logoLoopTimer = null;
};
window._logoTimerReset = scheduleLogoLoop;

scheduleLogoLoop();

window.addEventListener('beforeunload', () => {
  if (logoLoopTimer) clearTimeout(logoLoopTimer);
});

export {};
