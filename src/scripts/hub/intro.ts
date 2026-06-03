/* Intro overlay — replaces the old decorative boot. First visit: ignite a card-
   surface panel, type a short human intro, then light the header/footer beams;
   on dismiss, fade out and kick the hub cascade + set a localStorage flag.
   Return visit: a pre-paint is:inline guard hides the overlay; this module just
   runs the cascade. The hub INTRO button (#intro-trigger) replays it on demand.
   Click / any key fast-forwards the animation; Enter / Esc / the button dismiss.
   The rest of the page is set `inert` while the overlay is on screen.
   NOTE: char/line timings are artistic, tuned by eye. */

const CHAR_TYPE_MS = 22;
const LINE_PAUSE_MS = 180;
const POST_TYPE_MS = 150;
const SEEN_KEY = 'intro-seen';

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const screen = document.getElementById('intro-screen');
let introActive = false;

function hasSeen(): boolean {
  try { return !!localStorage.getItem(SEEN_KEY); } catch { return false; }
}
function markSeen(): void {
  try { localStorage.setItem(SEEN_KEY, '1'); } catch { /* private mode — ignore */ }
}

if (screen) {
  const hub = document.getElementById('hub');
  const header = document.querySelector<HTMLElement>('header');
  const panel = screen.querySelector<HTMLElement>('.intro-panel')!;
  const beamTop = screen.querySelector<HTMLElement>('.intro-divider--head')!;
  const beamBot = screen.querySelector<HTMLElement>('.intro-divider--foot')!;
  const foot = screen.querySelector<HTMLElement>('.intro-foot')!;
  const enterBtn = screen.querySelector<HTMLButtonElement>('.intro-enter')!;
  const lines = Array.from(screen.querySelectorAll<HTMLElement>('.intro-line'));
  /* full text captured from the server-rendered DOM (kept for a11y / no-JS) */
  const fullText = lines.map(l => l.querySelector<HTMLElement>('.intro-text')!.textContent ?? '');

  let state: 'idle' | 'animating' | 'built' = 'idle';
  let fromRelaunch = false;
  const timers: number[] = [];
  const clearTimers = (): void => { timers.forEach(clearTimeout); timers.length = 0; };
  const at = (ms: number, fn: () => void): void => { timers.push(window.setTimeout(fn, ms)); };

  function getTriggerBtn(): HTMLElement | null { return document.getElementById('intro-trigger'); }

  function setGating(active: boolean): void {
    introActive = active;
    if (active) { hub?.setAttribute('inert', ''); header?.setAttribute('inert', ''); }
    else { hub?.removeAttribute('inert'); header?.removeAttribute('inert'); }
  }

  function addCursor(line: HTMLElement): void {
    const cur = document.createElement('span');
    cur.className = 'intro-cursor';
    cur.textContent = '|';
    cur.setAttribute('aria-hidden', 'true');
    line.appendChild(cur);
  }

  function lightBeams(): void {
    beamBot.classList.add('show');
    foot.classList.add('show');
    beamTop.classList.add('lit');
    beamBot.classList.add('lit');
    state = 'built';
    enterBtn.focus();
  }

  function showBuilt(): void {
    /* render every line in full, drop stray cursors, then light up */
    lines.forEach((l, i) => {
      l.classList.add('active');
      const txt = l.querySelector<HTMLElement>('.intro-text')!;
      const html = l.dataset.html;
      if (html) txt.innerHTML = html; else txt.textContent = fullText[i] ?? '';
      l.querySelector('.intro-cursor')?.remove();
    });
    addCursor(lines[lines.length - 1]!);
    lightBeams();
  }

  function typeLine(line: HTMLElement, idx: number, done: () => void): void {
    line.classList.add('active');
    const txt = line.querySelector<HTMLElement>('.intro-text')!;
    txt.textContent = '';
    const html = line.dataset.html;
    const source = fullText[idx] ?? '';
    addCursor(line);
    let i = 0;
    const step = (): void => {
      txt.textContent = source.slice(0, ++i);
      if (i < source.length) { at(CHAR_TYPE_MS, step); return; }
      if (html) txt.innerHTML = html;
      line.querySelector('.intro-cursor')?.remove();
      at(LINE_PAUSE_MS, done);
    };
    step();
  }

  function typeAll(): void {
    let idx = 0;
    const next = (): void => {
      if (state !== 'animating') return;          // skipped mid-way
      if (idx >= lines.length) {
        addCursor(lines[lines.length - 1]!);
        at(POST_TYPE_MS, lightBeams);
        return;
      }
      typeLine(lines[idx]!, idx, () => { idx++; next(); });
    };
    next();
  }

  function onIgniteEnd(e: AnimationEvent): void {
    if (e.animationName !== 'lampIgnite') return;
    panel.removeEventListener('animationend', onIgniteEnd);
    panel.classList.remove('igniting');
    panel.classList.add('lit');
    at(POST_TYPE_MS, typeAll);
  }

  function resetVisuals(): void {
    lines.forEach(l => {
      l.classList.remove('active');
      l.querySelector<HTMLElement>('.intro-text')!.textContent = '';
      l.querySelector('.intro-cursor')?.remove();
    });
    beamTop.classList.remove('lit');
    beamBot.classList.remove('show', 'lit');
    foot.classList.remove('show');
  }

  function play(): void {
    if (introActive) return;   // already on screen — ignore re-entry (e.g. double-click)
    state = 'animating';
    setGating(true);
    screen!.classList.remove('done');
    screen!.style.display = 'flex';               // override the return-visit hide
    resetVisuals();

    if (reduceMotion) { panel.classList.add('lit'); showBuilt(); return; }

    panel.classList.remove('lit', 'igniting');
    void panel.offsetWidth;                        // restart the ignite animation
    panel.addEventListener('animationend', onIgniteEnd);
    panel.classList.add('igniting');
  }

  function skip(): void {
    if (state !== 'animating') return;
    clearTimers();
    panel.removeEventListener('animationend', onIgniteEnd);
    panel.classList.remove('igniting');
    panel.classList.add('lit');
    showBuilt();
  }

  function endIntro(): void {
    if (!introActive) return;
    clearTimers();
    setGating(false);
    /* Capture before the fromRelaunch reset below — the onFade callback fires
       ~0.5s later, long after fromRelaunch has been cleared. */
    const isRelaunch = fromRelaunch;
    const cascade = !isRelaunch;
    if (cascade) markSeen();

    if (reduceMotion) {
      screen!.style.display = 'none';
    } else {
      screen!.classList.add('done');
      const onFade = (ev: AnimationEvent): void => {
        if (ev.animationName !== 'fadeSlideOut') return;
        screen!.removeEventListener('animationend', onFade);
        if (isRelaunch) screen!.style.display = 'none';   // remove relaunch overlay
        /* first visit: leave it faded (opacity 0, pointer-events none) */
      };
      screen!.addEventListener('animationend', onFade);
    }

    state = 'idle';
    if (cascade) window._runCascade?.();
    else getTriggerBtn()?.focus();
    fromRelaunch = false;
  }

  /* events */
  screen.addEventListener('click', () => { if (state === 'animating') skip(); });
  enterBtn.addEventListener('click', e => { e.stopPropagation(); endIntro(); });
  /* This listener is registered before cards.ts's (intro module runs before
     initCardNav), so stopImmediatePropagation keeps the hub nav from acting on
     the same key once we've flipped introActive. */
  document.addEventListener('keydown', e => {
    if (state === 'animating') { e.preventDefault(); e.stopImmediatePropagation(); skip(); return; }
    if (state === 'built' && (e.key === 'Enter' || e.key === 'Escape')) { e.preventDefault(); e.stopImmediatePropagation(); endIntro(); }
  });
  getTriggerBtn()?.addEventListener('click', () => { fromRelaunch = true; play(); });

  /* first visit → play; return visit → straight to hub + cascade */
  if (hasSeen()) {
    /* Return visit: the overlay stays hidden; just run the hub cascade. But
       cascade.ts sets window._runCascade and loads AFTER this module (it's a
       later <script> in the body), so it isn't defined yet at module-eval time
       (readyState is 'interactive' for deferred modules, never 'loading'). Gate
       on _runCascade itself, not readyState: call it now if set, else wait for
       DOMContentLoaded — which fires after all deferred modules, so it's set. */
    if (window._runCascade) {
      window._runCascade();
    } else {
      document.addEventListener('DOMContentLoaded', () => window._runCascade?.(), { once: true });
    }
  } else {
    play();
  }
}

export const isIntroActive = (): boolean => introActive;
