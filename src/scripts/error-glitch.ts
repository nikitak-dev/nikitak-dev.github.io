/* 404 page glitch effects: RGB-split on [ 404 ], text-scramble on the page
   caption and on the header subtitle. First glitch fires after INIT_DELAY_MS
   and repeats every CYCLE_MS. typeLogo retriggers on every other cycle.
   Skipped entirely under prefers-reduced-motion. */

const CAPTION_GLYPHS = '#@!?/\\[]<>~|=%+^&*$0123456789';
const SUBTITLE_GLYPHS = CAPTION_GLYPHS + ':;.,_-';
const SUBTITLE_LEN = 44;
const SCRAMBLE_FRAMES = 10;
const SCRAMBLE_FRAME_MS = 50;
const GLITCH_MS = 230;
const CYCLE_MS = 7000;
const INIT_DELAY_MS = 7000;

function pickGlyph(glyphs: string): string {
  return glyphs[Math.floor(Math.random() * glyphs.length)]!;
}

function makeRandomSubtitle(): string {
  let s = 'ERR!: ';
  for (let i = 0; i < SUBTITLE_LEN; i++) s += pickGlyph(SUBTITLE_GLYPHS);
  return s;
}

/* Reveals `target` character-by-character from the left; unresolved positions
   show random glyphs until their turn. `running` is a shared flag ref so
   multiple pending triggers on the same element coalesce. */
function runTextScramble(
  el: HTMLElement,
  target: string,
  glyphs: string,
  running: { v: boolean },
): void {
  if (running.v) return;
  running.v = true;
  let frame = 0;
  const iv = setInterval(() => {
    frame++;
    const resolved = Math.floor((frame / SCRAMBLE_FRAMES) * target.length);
    let out = '';
    for (let i = 0; i < target.length; i++) {
      if (i < resolved || target[i] === ' ') out += target[i];
      else out += pickGlyph(glyphs);
    }
    el.textContent = out;
    if (frame >= SCRAMBLE_FRAMES) {
      clearInterval(iv);
      el.textContent = target;
      running.v = false;
    }
  }, SCRAMBLE_FRAME_MS);
}

document.addEventListener('DOMContentLoaded', () => {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  const glitchEl = document.querySelector<HTMLElement>('.glitch-text');
  const captionEl = document.getElementById('page-scramble');
  const subtitleEl = document.querySelector<HTMLElement>('.header-left p');
  const captionOriginal = captionEl?.textContent ?? '';

  const captionRunning = { v: false };
  const subtitleRunning = { v: false };

  if (subtitleEl) subtitleEl.textContent = makeRandomSubtitle();

  function triggerGlitch(): void {
    if (!glitchEl) return;
    glitchEl.classList.remove('is-glitching');
    void glitchEl.offsetWidth;
    glitchEl.classList.add('is-glitching');
    setTimeout(() => glitchEl.classList.remove('is-glitching'), GLITCH_MS);
  }

  function scrambleCaption(): void {
    if (captionEl) runTextScramble(captionEl, captionOriginal, CAPTION_GLYPHS, captionRunning);
  }

  function scrambleSubtitle(): void {
    if (subtitleEl) runTextScramble(subtitleEl, makeRandomSubtitle(), SUBTITLE_GLYPHS, subtitleRunning);
  }

  setTimeout(() => {
    let tick = 0;
    triggerGlitch();
    scrambleCaption();
    setInterval(() => {
      tick++;
      triggerGlitch();
      scrambleCaption();
      scrambleSubtitle();
      if (tick % 2 === 1) window.typeLogo?.();
    }, CYCLE_MS);
  }, INIT_DELAY_MS);
});
