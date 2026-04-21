/* Matrix-columns renderer (green / error modes). Falling characters in
   discrete columns. Error mode occasionally "jumps" a column to another lane,
   leaving a trailing ghost. */

type Palette = { main: string; trail: string };

const GLITCH_CHARS = '?@#$%^&*<>/\\~|:;';

let columns = 0;
let gridRows = 0;
let fontSize = 14;
let drops: number[] = [];
let speedFactors: number[] = [];
let cells: Array<Array<{ x: number; y: number }>> = [];
let jumpsRemaining: number[] = [];
let ghosts: Array<{
  startX: number; targetX: number; y: number; char: string;
  frame: number; totalFrames: number;
}> = [];

let errorMode = false;
let chars = '01';
const pickGlitchChar = () => GLITCH_CHARS[Math.floor(Math.random() * GLITCH_CHARS.length)]!;

function pickChar(y: number): string {
  if (errorMode) {
    const row = Math.floor(y / fontSize);
    return chars[((row % chars.length) + chars.length) % chars.length]!;
  }
  return chars[Math.floor(Math.random() * chars.length)]!;
}

export function initColumns(opts: {
  canvasWidth: number;
  rowCount: number;
  fontSize: number;
  errorMode: boolean;
}): void {
  fontSize = opts.fontSize;
  errorMode = opts.errorMode;
  chars = errorMode ? 'ERR!' : '01';
  columns = Math.floor(opts.canvasWidth / fontSize);
  gridRows = opts.rowCount;
  drops = Array.from({ length: columns }, () => -Math.floor(Math.random() * gridRows));
  speedFactors = Array.from({ length: columns }, () => 0.5 + Math.random());
  cells = Array.from({ length: columns }, () => []);
  jumpsRemaining = Array.from({ length: columns }, () => errorMode ? 2 : 0);
  ghosts = [];
}

export function renderColumns(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  yOffset: number,
): void {
  const safeBottom = gridRows * fontSize;
  for (let i = 0; i < drops.length; i++) {
    if (drops[i]! < 0) { drops[i]! += speedFactors[i]!; continue; }

    const x = i * fontSize;
    const y = Math.floor(drops[i]!) * fontSize;
    const char = pickChar(y);

    ctx.fillStyle = palette.main;
    ctx.fillText(char, x, y + yOffset);
    if (y - fontSize > 0) {
      ctx.fillStyle = palette.trail;
      ctx.fillText(pickChar(y - fontSize), x, y - fontSize + yOffset);
    }

    cells[i]!.push({ x, y });
    if (cells[i]!.length > 20) cells[i]!.shift();

    // Error-mode: rare head-jump to another lane, leaves a trail
    if (jumpsRemaining[i]! > 0 && y > 0 && y < safeBottom && Math.random() < 0.004) {
      const targetCol = Math.floor(Math.random() * columns);
      if (targetCol !== i) {
        ghosts.push({
          startX: x,
          targetX: targetCol * fontSize,
          y,
          char: pickChar(y),
          frame: 0,
          totalFrames: 4 + Math.floor(Math.random() * 3),
        });
        jumpsRemaining[i]!--;
      }
    }

    if (y > safeBottom && Math.random() > 0.975) {
      drops[i] = -Math.floor(Math.random() * 30);
      cells[i]!.length = 0;
      if (errorMode) jumpsRemaining[i] = 2;
    }
    drops[i]! += speedFactors[i]!;
  }
}

export function advanceGhosts(ctx: CanvasRenderingContext2D, mainColor: string, yOffset: number): void {
  if (ghosts.length === 0) return;
  for (let g = ghosts.length - 1; g >= 0; g--) {
    const ghost = ghosts[g]!;
    const t0 = ghost.frame / ghost.totalFrames;
    ghost.frame++;
    const t1 = ghost.frame / ghost.totalFrames;
    const x0 = ghost.startX + (ghost.targetX - ghost.startX) * t0;
    const x1 = ghost.startX + (ghost.targetX - ghost.startX) * t1;
    const dx = x1 - x0;
    const stepSize = fontSize * 0.6;
    const numSteps = Math.max(1, Math.ceil(Math.abs(dx) / stepSize));
    ctx.fillStyle = mainColor;
    for (let s = 1; s <= numSteps; s++) {
      const xp = x0 + dx * (s / numSteps);
      ctx.fillText(errorMode ? pickGlitchChar() : pickChar(ghost.y), xp, ghost.y + yOffset);
    }
    if (ghost.frame >= ghost.totalFrames) ghosts.splice(g, 1);
  }
}
