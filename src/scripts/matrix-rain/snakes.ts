/* Amber snakes renderer. Up to MAX_SNAKES wandering HEX streams. Each one
   spawns from a random border cell, heading inward. It can turn 90° up to
   MAX_TURNS times per life; a turn only becomes legal after MIN_STRAIGHT
   cells of straight motion. Obstacles are: the snake's own visible tail,
   other snakes' visible tails, and — while the turn budget is not exhausted
   — the viewport edges. When the turn budget IS exhausted, the snake is
   allowed to walk off the edge and respawns. If the snake is cornered with
   no legal move, it "explodes" — head flashes for a few ticks, a handful of
   hex fragments scatter around and fade. */

type Palette = { main: string; trail: string };

const HEX = '0123456789ABCDEF';
const MAX_SNAKES = 100;
const MIN_STRAIGHT = 5;
const MAX_TURNS = 4;
const TURN_PROB = 0.15;
const LOOKAHEAD = 3;          // cells ahead to scan for proactive turn
const TURN_SCORE_DEPTH = 10;  // cells scanned when weighting turn choice

/* Species define the "traffic mix" — short-fast vs long-slow streams. The
   weight field drives spawn distribution (summed = 1.0). */
const SPECIES = [
  { tailMin: 5,  tailMax: 7,  speedMin: 1.0, speedMax: 1.5, weight: 0.4 },
  { tailMin: 8,  tailMax: 12, speedMin: 0.6, speedMax: 1.0, weight: 0.4 },
  { tailMin: 15, tailMax: 20, speedMin: 0.3, speedMax: 0.6, weight: 0.2 },
];

const EXPLODE_FRAMES = 12;
const FLASH_FRAMES = 4;
/* Flash envelope — dim spark → build → peak → decay → hand off to ring. */
const FLASH_ALPHA = [0.35, 0.65, 0.90, 0.55];
const FLASH_PASSES = [1, 2, 3, 1];

/* Directions: 0=up, 1=right, 2=down, 3=left. dx/dy per direction. */
const DIRS: ReadonlyArray<readonly [number, number]> = [[0, -1], [1, 0], [0, 1], [-1, 0]];

type Snake = {
  id: number;
  alive: boolean;
  delay: number;
  segments: Array<{ x: number; y: number; char: string }>;
  dir: number;
  speed: number;
  tailLen: number;
  speedAccum: number;
  turnsUsed: number;
  sinceTurn: number;
  pausing: number;
  penetration: number;
  cellsMoved: number;
  explode: { frame: number; cx: number; cy: number; burstCells: Array<[number, number]> } | null;
};

let fontSize = 14;
let gridCols = 0;
let gridRows = 0;
let snakes: Snake[] = [];
let snakeOccupancy = new Map<string, number>();
let nextSnakeId = 1;

const pickHex = () => HEX[Math.floor(Math.random() * HEX.length)]!;

function pickSpecies() {
  const r = Math.random();
  let acc = 0;
  for (const sp of SPECIES) {
    acc += sp.weight;
    if (r < acc) return sp;
  }
  return SPECIES[SPECIES.length - 1]!;
}

function spawnSnake(initialDelay: number): Snake {
  const side = Math.floor(Math.random() * 4);
  let x: number, y: number, dir: number;
  if (side === 0)      { x = Math.floor(Math.random() * gridCols); y = 0;             dir = 2; }
  else if (side === 1) { x = gridCols - 1;                         y = Math.floor(Math.random() * gridRows); dir = 3; }
  else if (side === 2) { x = Math.floor(Math.random() * gridCols); y = gridRows - 1;  dir = 0; }
  else                 { x = 0;                                    y = Math.floor(Math.random() * gridRows); dir = 1; }
  const sp = pickSpecies();
  return {
    id: nextSnakeId++,
    alive: true,
    delay: initialDelay,
    segments: [{ x, y, char: pickHex() }],   // newest (head) at end
    dir,
    speed: sp.speedMin + Math.random() * (sp.speedMax - sp.speedMin),
    tailLen: sp.tailMin + Math.floor(Math.random() * (sp.tailMax - sp.tailMin + 1)),
    speedAccum: 0,
    turnsUsed: 0,
    sinceTurn: 0,
    pausing: 0,
    /* Minimum inward travel before discretionary turns kick in. Keeps new
       snakes from turning along the perimeter and leaving the center bare.
       Forced turns (blocked ahead) still trigger regardless. */
    penetration: 25 + Math.floor(Math.random() * 36),    // 25..60 cells
    cellsMoved: 0,
    explode: null,
  };
}

export function initSnakes(opts: { canvasWidth: number; rowCount: number; fontSize: number }): void {
  fontSize = opts.fontSize;
  gridCols = Math.floor(opts.canvasWidth / fontSize);
  gridRows = opts.rowCount;
  snakeOccupancy = new Map();
  nextSnakeId = 1;
  /* Staggered init delays (0..120 ticks ≈ 0..10s at 12.5fps) so the
     background fills gradually instead of filling with 15 streams at once. */
  snakes = Array.from({ length: MAX_SNAKES }, () =>
    spawnSnake(Math.floor(Math.random() * 120))
  );
}

/* Returns 'border' | 'self' | 'other' | null (clear). */
function cellBlocker(x: number, y: number, selfId: number): 'border' | 'self' | 'other' | null {
  if (x < 0 || x >= gridCols || y < 0 || y >= gridRows) return 'border';
  const owner = snakeOccupancy.get(x + ',' + y);
  if (owner === undefined) return null;
  return owner === selfId ? 'self' : 'other';
}

/* How many consecutive free cells starting one step from (x,y) in dir. */
function freeCellsAhead(x: number, y: number, dir: number, selfId: number, maxDepth: number): number {
  const [dx, dy] = DIRS[dir]!;
  let count = 0;
  for (let k = 1; k <= maxDepth; k++) {
    if (cellBlocker(x + dx * k, y + dy * k, selfId) !== null) break;
    count++;
  }
  return count;
}

function startExplosion(s: Snake): void {
  const head = s.segments[s.segments.length - 1]!;
  /* Randomize burst footprint per explosion so the flash never reads as the
     same stamp. 10..15 cells drawn uniformly in a disc of radius ~2.5,
     plus the center cell guaranteed. */
  const count = 10 + Math.floor(Math.random() * 6);
  const burstCells: Array<[number, number]> = [[0, 0]];
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const r = 0.5 + Math.random() * 2.0;
    burstCells.push([
      Math.round(Math.cos(angle) * r),
      Math.round(Math.sin(angle) * r),
    ]);
  }
  s.explode = { frame: 0, cx: head.x, cy: head.y, burstCells };
}

type TurnMode = 'none' | 'must' | 'proactive' | 'voluntary';

/* Classifies the turn decision for this tick. Preserves original RNG call
   order: proactive Math.random() fires first (only when discretionary+runway
   conditions hold); voluntary Math.random() fires only if proactive didn't. */
function determineTurnMode(
  s: Snake,
  canTurn: boolean,
  firstBlock: 'border' | 'self' | 'other' | null,
): TurnMode {
  const mustFromObstacle = firstBlock === 'self' || firstBlock === 'other';
  const mustFromBorder = firstBlock === 'border' && s.turnsUsed < MAX_TURNS;
  if (mustFromObstacle || mustFromBorder) return 'must';
  if (!canTurn) return 'none';
  const discretionaryAllowed = s.cellsMoved >= s.penetration;
  if (!discretionaryAllowed) return 'none';
  const head = s.segments[s.segments.length - 1]!;
  const freeAhead = freeCellsAhead(head.x, head.y, s.dir, s.id, LOOKAHEAD);
  if (freeAhead < LOOKAHEAD) {
    const urgency = (LOOKAHEAD - freeAhead) / LOOKAHEAD;
    if (Math.random() < urgency * 0.5 + 0.05) return 'proactive';
  }
  if (Math.random() < TURN_PROB) return 'voluntary';
  return 'none';
}

/* Returns new direction or 'explode' if both perpendiculars are blocked.
   Scores each valid perpendicular by (open runway) + centripetal bonus so
   turns drift inward rather than hugging the perimeter. */
function chooseTurnDirection(s: Snake): number | 'explode' {
  const head = s.segments[s.segments.length - 1]!;
  const left = (s.dir + 3) % 4;
  const right = (s.dir + 1) % 4;
  const centerX = gridCols / 2, centerY = gridRows / 2;
  const toCenterX = Math.sign(centerX - head.x);
  const toCenterY = Math.sign(centerY - head.y);
  const options: Array<{ dir: number; score: number }> = [];
  for (const d of [left, right]) {
    const [ldx, ldy] = DIRS[d]!;
    if (cellBlocker(head.x + ldx, head.y + ldy, s.id) !== null) continue;
    let score = freeCellsAhead(head.x + ldx, head.y + ldy, d, s.id, TURN_SCORE_DEPTH);
    if (ldx !== 0 && ldx === toCenterX) score += 6;
    if (ldy !== 0 && ldy === toCenterY) score += 6;
    options.push({ dir: d, score });
  }
  if (options.length === 0) return 'explode';
  /* Prefer the option with more runway; tie breaks randomly. */
  if (options.length === 1 || options[0]!.score === options[1]!.score) {
    return options[Math.floor(Math.random() * options.length)]!.dir;
  }
  return (options[0]!.score > options[1]!.score ? options[0]! : options[1]!).dir;
}

/* Straight step: validate the next cell, either progress the snake or mark it
   for explosion. Dies quietly (no explosion) when turn budget is exhausted and
   the border is reached — that's the intended exit path. */
function stepStraight(s: Snake): void {
  const head = s.segments[s.segments.length - 1]!;
  const [ndx, ndy] = DIRS[s.dir]!;
  const nextX = head.x + ndx, nextY = head.y + ndy;
  const finalBlock = cellBlocker(nextX, nextY, s.id);

  if (finalBlock === 'border') {
    if (s.turnsUsed >= MAX_TURNS) { s.alive = false; return; }
    startExplosion(s); return;
  }
  if (finalBlock === 'self' || finalBlock === 'other') {
    startExplosion(s); return;
  }

  s.segments.push({ x: nextX, y: nextY, char: pickHex() });
  snakeOccupancy.set(nextX + ',' + nextY, s.id);
  if (s.segments.length > s.tailLen) {
    const dropped = s.segments.shift()!;
    const key = dropped.x + ',' + dropped.y;
    if (snakeOccupancy.get(key) === s.id) snakeOccupancy.delete(key);
  }
  s.sinceTurn++;
  s.cellsMoved++;
}

function advanceSnake(s: Snake): void {
  if (!s.alive) return;
  if (s.delay > 0) { s.delay--; return; }
  if (s.explode) {
    s.explode.frame++;
    if (s.explode.frame >= EXPLODE_FRAMES) s.alive = false;
    return;
  }
  /* Pause = deliberation before a committed turn. Head char flickers so
     the pause reads as "thinking", not as a stuck snake. */
  if (s.pausing > 0) {
    s.pausing--;
    const head = s.segments[s.segments.length - 1]!;
    head.char = pickHex();
    return;
  }

  s.speedAccum += s.speed;
  if (s.speedAccum < 1) return;
  s.speedAccum -= 1;

  const head = s.segments[s.segments.length - 1]!;
  const canTurn = s.sinceTurn >= MIN_STRAIGHT && s.turnsUsed < MAX_TURNS;
  const [fdx, fdy] = DIRS[s.dir]!;
  const firstBlock = cellBlocker(head.x + fdx, head.y + fdy, s.id);

  const mode = determineTurnMode(s, canTurn, firstBlock);
  if (mode === 'none') { stepStraight(s); return; }

  /* Turn requested. If we can't actually turn (budget/min-straight), explode.
     Must-turn still counts as a turn request here — exploding on 'must' with
     !canTurn matches the original cornering behavior. */
  if (!canTurn) { startExplosion(s); return; }
  const chosen = chooseTurnDirection(s);
  if (chosen === 'explode') { startExplosion(s); return; }
  s.dir = chosen;
  s.turnsUsed++;
  s.sinceTurn = 0;
  s.pausing = 1 + Math.floor(Math.random() * 2);   // 1..2 tick pause
}

export function advanceSnakes(): void {
  /* Rebuild occupancy each tick from the current state — cheap (≤150 ops)
     and avoids stale entries from dead/exploded snakes. */
  snakeOccupancy.clear();
  for (const s of snakes) {
    if (!s.alive || s.delay > 0 || s.explode) continue;
    for (const seg of s.segments) snakeOccupancy.set(seg.x + ',' + seg.y, s.id);
  }
  for (const s of snakes) advanceSnake(s);
  for (let i = snakes.length - 1; i >= 0; i--) {
    if (!snakes[i]!.alive) snakes.splice(i, 1);
  }
  /* Respawn to cap. Runtime respawns have no delay — new snake appears at a
     border and crawls inward immediately. */
  while (snakes.length < MAX_SNAKES) snakes.push(spawnSnake(0));
}

export function renderSnakes(
  ctx: CanvasRenderingContext2D,
  palette: Palette,
  yOffset: number,
): void {
  for (const s of snakes) {
    if (s.delay > 0) continue;
    if (s.explode) {
      const { frame, cx, cy, burstCells } = s.explode;
      /* Flash phase (frames 0..FLASH_FRAMES-1) — additive "lighter" blend
         stacks amber toward near-white. The alpha/pass envelope ramps up
         over 3 frames and decays on the 4th so the flash doesn't hard-cut
         in. Burst footprint is per-explosion randomized (see startExplosion).
         Ring phase (frames ≥ FLASH_FRAMES) — expanding annulus of hex
         fragments, alpha fading; prior frames decay via canvas clear. */
      if (frame < FLASH_FRAMES) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = FLASH_ALPHA[frame]!;
        ctx.fillStyle = palette.main;
        const passes = FLASH_PASSES[frame]!;
        for (let p = 0; p < passes; p++) {
          for (const [dxb, dyb] of burstCells) {
            const bx = cx + dxb, by = cy + dyb;
            if (bx < 0 || bx >= gridCols || by < 0 || by >= gridRows) continue;
            ctx.fillText(pickHex(), bx * fontSize, by * fontSize + fontSize + yOffset);
          }
        }
        ctx.restore();
      } else {
        const ringFrame = frame - FLASH_FRAMES + 1;
        const radius = ringFrame;
        const ringTotal = EXPLODE_FRAMES - FLASH_FRAMES;
        const count = Math.max(6, 16 - ringFrame);
        const ringAlpha = Math.max(0.12, 1 - ringFrame / ringTotal);
        ctx.fillStyle = ringFrame <= 2 ? palette.main : palette.trail;
        for (let i = 0; i < count; i++) {
          const angle = (i / count) * Math.PI * 2 + Math.random() * 0.5;
          const fx = Math.round(cx + Math.cos(angle) * radius);
          const fy = Math.round(cy + Math.sin(angle) * radius);
          if (fx < 0 || fx >= gridCols || fy < 0 || fy >= gridRows) continue;
          ctx.globalAlpha = ringAlpha;
          ctx.fillText(pickHex(), fx * fontSize, fy * fontSize + fontSize + yOffset);
        }
        ctx.globalAlpha = 1;
      }
      continue;
    }
    const n = s.segments.length;
    for (let i = 0; i < n; i++) {
      const seg = s.segments[i]!;
      const isHead = i === n - 1;
      /* t: 0 at tail tip, 1 at head. Alpha ramps linearly from 0.1 → 1.0. */
      const t = n === 1 ? 1 : i / (n - 1);
      ctx.globalAlpha = isHead ? 1 : Math.max(0.1, t);
      ctx.fillStyle = isHead ? palette.main : palette.trail;
      ctx.fillText(seg.char, seg.x * fontSize, seg.y * fontSize + fontSize + yOffset);
    }
  }
  ctx.globalAlpha = 1;
}
