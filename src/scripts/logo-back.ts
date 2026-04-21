/* Back-logo hover typewriter — on pages rendered with a backHref, the logo is
   an <a class="logo-back">. Hovering/focusing animates the text from the
   original logo to the hover alias (and back). Reads text variants from the
   anchor's data-* attributes set by BaseLayout. Idempotent: no anchor = no-op. */

const anchor = document.querySelector<HTMLAnchorElement>('h1 a.logo-back');
const logoEl = document.getElementById('logo-text');

if (anchor && logoEl) {
  const originalLogoText = anchor.dataset.originalText ?? '';
  const hoverText = anchor.dataset.hoverText ?? '';
  const speed = Number(anchor.dataset.speed) || 70;
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (!reducedMotion && originalLogoText && hoverText) {
    let animIv: ReturnType<typeof setInterval> | null = null;
    let currentTarget: string | null = null;

    function animateTo(target: string): void {
      if (animIv) { clearInterval(animIv); animIv = null; }
      if (currentTarget === target) return;
      currentTarget = target;
      window._logoHoverActive = true;
      if (target !== originalLogoText) window._logoTimerStop?.();
      // phase 1: erase
      animIv = setInterval(() => {
        const cur = logoEl!.textContent ?? '';
        if (cur.length > 0) {
          logoEl!.textContent = cur.slice(0, -1);
          return;
        }
        if (animIv) { clearInterval(animIv); animIv = null; }
        // phase 2: type target
        let i = 0;
        animIv = setInterval(() => {
          logoEl!.textContent = (logoEl!.textContent ?? '') + target[i];
          i++;
          if (i >= target.length) {
            if (animIv) { clearInterval(animIv); animIv = null; }
            if (target === originalLogoText) {
              window._logoHoverActive = false;
              window._logoTimerReset?.();
            }
          }
        }, speed);
      }, speed);
    }

    anchor.addEventListener('mouseenter', () => animateTo(hoverText));
    anchor.addEventListener('mouseleave', () => animateTo(originalLogoText));
    anchor.addEventListener('focus', () => animateTo(hoverText));
    anchor.addEventListener('blur', () => animateTo(originalLogoText));

    window.addEventListener('beforeunload', () => {
      if (animIv) clearInterval(animIv);
    });
  }
}

export {};
