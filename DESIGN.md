# Design System — nikitak-dev

Typography, color, and spacing reference for all portfolio pages.

---

## Typography Scale

Font: **JetBrains Mono** (monospace)

### Size Grid

Key structural elements follow a **4px grid**. Content elements follow a **2px grid**.

| Size | Grid | Usage |
|------|------|-------|
| `36px` | ×4 | Display icons (e.g. `[?]`, `[R]`) |
| `20px` | ×4 | Logo / primary heading |
| `16px` | ×4 | Section headings, card titles |
| `14px` | ×2 | Modal title |
| `12px` | ×4 | Labels (`// STACK`), body text, buttons, footer, subtitle |
| `10px` | ×2 | Secondary content (card IDs, status, meta info), micro-prefixes (`YOU >`, `< SYS`, `< ERR`) |

### Hierarchy Rules

- **Logo / h1**: `20px`, `font-weight: 700`
- **Subtitle** (header tagline): `12px`, `font-weight: 400`, `color: var(--text-muted)`, `letter-spacing: 0.02em`
- **Card title**: `16px`, `font-weight: 700`, `color: var(--green)`, `text-shadow: 0 0 8px var(--green-ghost)`
- **Stack label** (`// n8n | ...`): `12px`, `font-weight: 400`, `color: var(--green)`, `letter-spacing: 0.06em`, no glow — calm technical caption, readable but recessive vs `.card-title`
- **Section labels** (`// KNOWLEDGE BASE`): `12px`, `font-weight: 700`, `letter-spacing: 0.10em`, `color: var(--green-mid)`, `text-shadow: 0 0 10px var(--green-glow-label)`, `text-transform: uppercase`
- **Body text / descriptions**: `12px`, `font-weight: 400`, `color: var(--text-muted)`
- **Buttons**: `12px`, `font-weight: 400`, `letter-spacing: 0.06em`, `text-transform: uppercase`
- **Secondary content** (card IDs, meta): `10px`, `color: var(--text-muted)`
- **Footer / ribbons**: `12px`, `color: var(--text-muted)`

---

## Color Palette

### Surfaces & borders

```css
--bg-void: #000000;
--bg-surface: #040804;
--bg-elevated: #0a120a;
--bg-elevated-amber: #0d0904;     /* amber-card background */
--bg-input: #060e06;
--border: #0d3a0d;
--border-hover: #137a13;
```

### Green scale (primary)

```css
--green: #00ff41;
--green-bright: #55ff77;           /* keyboard-pulse ring accent */
--green-mid: #00cc33;
--green-dim: #009922;
--green-muted: #00751d;
--green-ghost: rgba(0, 255, 65, 0.08);
--green-glow-weak: rgba(0, 255, 65, 0.05);    /* input focus-within, soft hover */
--green-glow: rgba(0, 255, 65, 0.1);
--green-glow-strong: rgba(0, 255, 65, 0.25);
--green-glow-label: rgba(0, 255, 65, 0.35);  /* section-label text-shadow */
--green-mid-glow: rgba(0, 204, 51, 0.4);      /* chat message text-shadow */
--text-primary: #00ff41;
--text-secondary: #00cc33;
--text-muted: #00aa30;
--text-bright: #ccffcc;            /* hover/active foreground */
```

### Amber scale (automation cards, `.theme-amber`)

```css
--amber: #ffaa00;
--amber-bright: #ffcc44;           /* keyboard-pulse ring accent (amber theme) */
--amber-mid: #e59400;
--amber-dim: #b87400;
--amber-muted: #8a5700;
--amber-deep: #3d2605;
--amber-ghost: rgba(255, 170, 0, 0.08);
--amber-glow: rgba(255, 170, 0, 0.15);
--amber-glow-strong: rgba(255, 170, 0, 0.3);
```

### Error scale (404, error mode)

```css
--error: #ff3333;
--error-bright: #ff7777;                      /* keyboard-pulse ring (error mode) */
--error-mid: #cc2200;
--error-dim: #991a00;
--error-muted: #661000;
--error-deep: #3a0d0d;
--error-ghost: rgba(255, 51, 51, 0.08);
--error-glow-weak: rgba(255, 51, 51, 0.05);
--error-glow: rgba(255, 51, 51, 0.15);
--error-glow-strong: rgba(255, 51, 51, 0.3);
--error-glow-label: rgba(255, 51, 51, 0.35);
--error-mid-glow: rgba(204, 34, 0, 0.4);
--matrix-trail-error: rgba(255, 51, 51, 0.4); /* matrix rain trail in error mode */
--bg-input-error: #0e0606;
--bg-elevated-error: #120606;
--user-bg-error: rgba(255, 51, 51, 0.05);
--user-border-error: rgba(255, 51, 51, 0.15);
--text-bright-error: #ffcccc;
```

### Chat message variants

```css
--user-bg: rgba(0, 255, 65, 0.05);
--user-border: rgba(0, 255, 65, 0.15);
```

In error mode (`body[data-error="true"]`) the green-scale variables are remapped to their error-scale equivalents; `--user-bg`, `--user-border`, `--text-bright` also gain error variants.

---

## Layout Tokens

```css
--font: 'JetBrains Mono', monospace;
--content-max: 1000px;             /* hub grid + legend width cap */
--transition: 0.2s;                /* standard interaction transition */
--beam-height: 1px;                /* beam separator height */
--beam-duration: 3s;               /* beam sweep loop */
--beam-blur: 3px;                  /* beam drop-shadow blur */
--shadow-inset-deep: inset 0 0 28px rgba(0, 0, 0, 0.75);  /* panel depth */
--scanline-line: rgba(0, 0, 0, 0.12);           /* single scanline stripe color */
--backdrop-bg: rgba(0, 0, 0, 0.85);             /* dialog backdrop */
--backdrop-blur: 4px;                            /* dialog backdrop-filter blur */
--modal-duration: 320ms;                         /* dialog open/close transition */
--scale-press: 0.97;                             /* active-state tactile squish */
```

Used by beam separators, panels (`.project-card`, `.grid-legend`), scanline overlays, modal animations, button active-state.

---

## Conventions

- `// LABEL:` pattern for section headers — uppercase, `letter-spacing: 0.10em`, `color: var(--green-mid)`, bold, with glow
- `// stack | comment` pattern for tech stack — same color as card title (`--green`), lighter weight (`400`), smaller scale, no uppercase, no glow
- `[ KEY: VALUE ]` pattern for status blocks in ribbons/footers
- `[ 001 ]` pattern for card IDs — `10px`, `color: var(--text-muted)`
- Status labels: `.card-status.live / .private / .wip` — `10px`, `letter-spacing: 0.06em`, color-coded (`--green` / `--green-dim` / `--green-muted`); `.live` pulses via `connPulse` animation. Dot primitive intentionally omitted — availability is already conveyed by the card's launch button.
- Border style: `border-left: 2px solid var(--green-dim)` for message blocks
- All interactive elements: `transition` on `background`, `border-color`, `color`, `box-shadow`, `text-shadow` — use `var(--transition)` (`0.2s`)

---

## Effects

### Scanline (global CRT effect)

Apply via `body::after` — covers entire viewport with a single fixed overlay:

```css
body::after {
  content: '';
  position: fixed;
  inset: 0;
  background: repeating-linear-gradient(
    0deg,
    transparent,
    transparent 1px,
    rgba(0, 0, 0, 0.12) 1px,
    rgba(0, 0, 0, 0.12) 2px
  );
  pointer-events: none;
  z-index: 9999;
}
```

Default: use global `body::after` overlay (single fixed layer, z-index 9999).
Exception: pages with media content (images, video) — global `body::after` corrupts media rendering. Add class `no-global-scanlines` to `<body>` (via `scanlineMode="per-section"` prop in BaseLayout) and apply `.scanlines-section` utility class to individual containers (header, chat panel, input bar).

**`.scanlines-section` utility** (defined in `src/styles/utilities.css`): sets `position: relative` and adds `::after` overlay identical to `body::after` but scoped to the container. Use on any element that needs scanlines when global overlay is disabled.

### Button: `.btn-terminal`

Base class for all interactive buttons and links in the terminal aesthetic. Apply to any `<button>` or `<a>` element.

```html
<button class="btn-terminal">[ ACTION ]</button>
<a href="..." class="btn-terminal">LINK</a>
```

Base: `border: 1px solid var(--border)`, `color: var(--green)`, `background: transparent`, `12px`, `font-weight: 400`, `letter-spacing: 0.06em`, `uppercase`.

Hover (built-in):
```css
background: rgba(0, 255, 65, 0.15);
border-color: var(--green);
color: #ccffcc;
box-shadow: 0 0 20px rgba(0, 255, 65, 0.1), inset 0 0 10px rgba(0, 255, 65, 0.1);
text-shadow: 0 0 8px var(--green-glow-strong);
```

Override `padding` as needed (default: none set by base). Disabled state (opacity 0.3, not-allowed cursor) is built-in.

Used by: `.card-launch`, `.social-links a`, `#send`, `#clear`.

### Animated beam separator: `.beam-line`

Drop a `<div class="beam-line">` anywhere to render an animated beam separator line.

```html
<div class="beam-line"></div>
```

Renders a 1px horizontal line with base color `var(--border)` and an animated bright beam moving right-to-left (RTL, 3s loop). Header and footer use their own `::before` pseudo-elements with the same animation.

### Chat bubble: `.bubble`

Shared visual shell for chat messages in the multimodal-rag page. Apply `.bubble` plus a side modifier (`--left` / `--right`) and optionally a theme modifier (`--error`).

```html
<div class="bubble bubble--right">user message</div>
<div class="bubble bubble--left">assistant answer</div>
<div class="bubble bubble--left bubble--error">error message</div>
```

Renders: `--bg-void` background with a top-fading ghost tint, a 1px border on all four sides, and a vertical beam via `.bubble::before` on the active side — a `transparent 35% → bright 50% → transparent 65%` gradient with `drop-shadow` glow, matching the header/footer beam aesthetic. The transparent beam ends reveal the underlying border as the base color. Padding 10/16px, 12px body text at weight 300 with soft text-shadow. CRT scanlines + RGB chromatic aberration via `.bubble::after` (same pattern as `body::after`).

Prefix label lives in a real `<span class="bubble-prefix">` child (not `::before`), since the pseudo is reserved for the beam.

Palette is driven by custom properties:

| Variable | Default | Role |
|---|---|---|
| `--bubble-beam` | `var(--green)` | Bright midpoint of the beam strip |
| `--bubble-glow` | `var(--green-dim)` | `drop-shadow` halo around the beam |
| `--bubble-border` | `var(--user-border)` | Static border + beam endpoints |
| `--bubble-ghost` | `var(--green-ghost)` | Top fade of the background tint |
| `--bubble-text` | `var(--green-mid)` | Body text color |
| `--bubble-shadow` | `var(--green-mid-glow)` | Text glow |

Beam side is picked by `.bubble--left` / `.bubble--right` modifiers (positioning the `::before` at the corresponding edge).

`.bubble--error` remaps all six palette properties to the error scale (`--error`, `--error-dim`, `--error-glow`, `--error-ghost`, `--error`, `--error-mid-glow`).

### Section labels

Section labels (`// LABEL:`) use bold + brighter color + glow to stand out from content:

```css
font-weight: 700;
color: var(--green-mid);
text-shadow: 0 0 10px var(--green-glow-label);
```

Content under labels: `12px`, `color: var(--text-muted)`.