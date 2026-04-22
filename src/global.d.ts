/* Ambient cross-module surface exposed on `window`. Kept as an interop layer
   between inline `is:inline` scripts (TypeLogo) and bundled modules
   (cascade.ts, logo-timer.ts, logo-back.ts, error-glitch.ts, hub/boot.ts).
   Declared here so any consumer can read these without redeclaring locally.
   See BaseLayout.astro for the authoritative mapping of owner → consumer. */

export {};

declare global {
  interface Window {
    /** Set by TypeLogo.astro; invoked on the 404 glitch cadence and on logo-timer loop. */
    typeLogo?: () => void;
    /** Set by cascade.ts; invoked by hub/boot.ts endBoot() after the boot sequence. */
    _runCascade?: () => void;
    /** Set by logo-timer.ts; called by logo-back.ts to pause the retype loop during hover. */
    _logoTimerStop?: () => void;
    /** Set by logo-timer.ts; called by logo-back.ts to restart the retype loop after hover ends. */
    _logoTimerReset?: () => void;
    /** Owned by logo-back.ts; read by logo-timer.ts and TypeLogo to abort mid-type animations. */
    _logoHoverActive?: boolean;
  }
}
