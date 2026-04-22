/* Hub boot sequence — types a short terminal-boot script into #boot-lines,
   then fades out #boot-screen and kicks the cascade runtime. Click or any
   keydown skips to the end. Reads live/total/buildDate from #boot-screen
   dataset (set by index.astro). */

/* NOTE: artistic timing — tuned for the terminal-boot rhythm, not functional. */
const CHAR_TYPE_MS = 25;
const LINE_PAUSE_MS = 200;
const BOOT_END_DELAY_MS = 1500;

const bootScreen = document.getElementById('boot-screen');
const bootLinesEl = document.getElementById('boot-lines');

if (!bootScreen || !bootLinesEl) {
  /* No boot UI on this page — nothing to do. */
} else {
  const live = Number(bootScreen.dataset.live) || 0;
  const total = Number(bootScreen.dataset.total) || 0;
  const buildDate = bootScreen.dataset.buildDate ?? '';

  const bootVariants = [
    'MEM :: 512B HEAP ALLOC',
    'MEM :: 1024B HEAP ALLOC',
    'MEM :: 2048B HEAP ALLOC',
    'MEM :: 4096B HEAP ALLOC',
    'RNG :: SEED 0xA4D3F9B1',
    'RNG :: SEED 0x7FFE4B2A',
    'CACHE :: WARMED',
    'THREADS :: 4/8 ACTIVE',
    'TICK :: 24HZ LOCKED',
  ];
  const variantLine = bootVariants[Math.floor(Math.random() * bootVariants.length)]!;

  const bootSequence: Array<{ text: string; bright: boolean }> = [
    { text: `PROC SCAN :: ${live}/${total} PROJECTS LIVE`,         bright: false },
    { text: `BUILD :: ${buildDate}`,                               bright: false },
    { text: variantLine,                                           bright: false },
    { text: 'GLOW :: ON  |  SCANLINES :: ON  |  MATRIX :: STABLE', bright: false },
    { text: '> BOOT COMPLETE',                                     bright: true  },
  ];

  let bootDone = false;

  function endBoot(): void {
    if (bootDone) return;
    bootDone = true;
    bootScreen!.classList.add('done');
    window._runCascade?.();
  }

  function runBoot(): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      bootSequence.forEach(line => {
        const el = document.createElement('div');
        el.className = 'boot-line' + (line.bright ? ' bright' : '');
        el.textContent = line.text;
        bootLinesEl!.appendChild(el);
      });
      endBoot();
      return;
    }
    let i = 0;
    function addLine(): void {
      if (bootDone) return;
      if (i >= bootSequence.length) { setTimeout(endBoot, BOOT_END_DELAY_MS); return; }
      const el = document.createElement('div');
      el.className = 'boot-line' + (bootSequence[i]!.bright ? ' bright' : '');
      bootLinesEl!.appendChild(el);
      const text = bootSequence[i]!.text;
      i++;
      const textNode = document.createTextNode('');
      const cursorSpan = document.createElement('span');
      cursorSpan.className = 'boot-cursor';
      cursorSpan.textContent = '|';
      el.appendChild(textNode);
      el.appendChild(cursorSpan);
      let c = 0;
      const type = setInterval(() => {
        if (bootDone) { clearInterval(type); cursorSpan.remove(); return; }
        textNode.textContent = text.slice(0, ++c);
        if (c >= text.length) {
          clearInterval(type);
          if (i >= bootSequence.length) {
            cursorSpan.classList.add('blinking');
            setTimeout(addLine, LINE_PAUSE_MS);
          } else {
            cursorSpan.remove();
            setTimeout(addLine, LINE_PAUSE_MS);
          }
        }
      }, CHAR_TYPE_MS);
    }
    addLine();
  }

  runBoot();
  bootScreen.addEventListener('click', endBoot);
  document.addEventListener('keydown', endBoot, { once: true });
}

export const isBootActive = (): boolean =>
  !!bootScreen && !bootScreen.classList.contains('done');
