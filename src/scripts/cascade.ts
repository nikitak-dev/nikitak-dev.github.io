/* Cascade runtime — walks [data-cascade-item] elements in document order,
   assigns a staggered --cascade-delay, then activates the footer with a
   computed --footer-delay so it always appears after the last item. Fires on
   DOMContentLoaded, except on pages with a boot-screen (hub): there, the
   page's own endBoot() invokes window._runCascade() after the boot sequence. */

declare global {
  interface Window {
    _runCascade?: () => void;
  }
}

const rootStyle = getComputedStyle(document.documentElement);
const STEP = parseFloat(rootStyle.getPropertyValue('--cascade-step')) || 0.4;

/* Once the entry animation ends, release the fill-mode hold so interactive
   state styles (e.g. :active { transform: scale(...) }) can take over. Filter
   by animationName: if the entry animation is interrupted (e.g. a quickly-
   following fadeOut), we must ignore the interrupter's animationend —
   otherwise release would undo the new hidden state. */
function release(el: HTMLElement): void {
  function onEnd(e: AnimationEvent): void {
    if (!/^(fadeIn|fadeSlideUp|fadeSlideDown)$/.test(e.animationName)) return;
    el.style.animation = 'none';
    el.style.opacity = '1';
    el.removeEventListener('animationend', onEnd);
  }
  el.addEventListener('animationend', onEnd);
}

function runCascade(): void {
  const header = document.querySelector<HTMLElement>('header');
  if (header) { header.classList.add('cascade-ready'); release(header); }
  const items = document.querySelectorAll<HTMLElement>('[data-cascade-item]');
  items.forEach((el, i) => {
    el.style.setProperty('--cascade-delay', ((i + 1) * STEP) + 's');
    el.classList.add('cascade-ready');
    release(el);
  });
  const footer = document.querySelector<HTMLElement>('.hub-footer');
  if (footer) {
    footer.style.setProperty('--footer-delay', ((items.length + 1) * STEP) + 's');
    footer.classList.add('ready');
    release(footer);
  }
}

if (document.getElementById('boot-screen')) {
  window._runCascade = runCascade;
} else if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', runCascade, { once: true });
} else {
  runCascade();
}

export {};
