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
| `12px` | ×4 | Labels (`// STACK`), body text, buttons, footer, subtitle |
| `10px` | ×2 | Secondary content (card IDs, meta info) |
| `8px`  | ×4 | Micro-prefixes (`SYS >`, `YOU >`, `ERR >`) |

### Hierarchy Rules

- **Logo / h1**: `20px`, `font-weight: 700`
- **Subtitle** (header tagline): `12px`, `font-weight: 400`, `color: var(--text-muted)`, `letter-spacing: 0.02em`
- **Card title**: `16px`, `font-weight: 700`, `color: var(--green)`, `text-shadow: 0 0 8px var(--green-ghost)`
- **Stack label** (`// n8n | ...`): `12px`, `font-weight: 700`, `color: var(--green)`, `letter-spacing: 0.06em`, `text-shadow: 0 0 8px var(--green-ghost)` — scaled-down card-title
- **Section labels** (`// KNOWLEDGE BASE`): `12px`, `font-weight: 700`, `letter-spacing: 0.10em`, `color: var(--green-mid)`, `text-shadow: 0 0 10px rgba(0, 255, 65, 0.35)`, `text-transform: uppercase`
- **Body text / descriptions**: `12px`, `font-weight: 400`, `color: var(--text-muted)`
- **Buttons**: `12px`, `font-weight: 400`, `letter-spacing: 0.06em`, `text-transform: uppercase`
- **Secondary content** (card IDs, meta): `10px`, `color: var(--text-muted)`
- **Footer / ribbons**: `12px`, `color: var(--text-muted)`

---

## Color Palette

```css
--bg-void: #000000;
--bg-surface: #040804;
--bg-elevated: #0a120a;
--bg-input: #060e06;
--border: #0d3a0d;
--border-hover: #137a13;
--green: #00ff41;
--green-mid: #00cc33;
--green-dim: #009922;
--green-muted: #00992a;
--green-ghost: rgba(0, 255, 65, 0.08);
--green-glow: rgba(0, 255, 65, 0.12);
--green-glow-strong: rgba(0, 255, 65, 0.25);
--text-primary: #00ff41;
--text-secondary: #00cc33;
--text-muted: #00aa30;
--error: #ff3333;
--error-mid: #cc2200;
--error-dim: #991a00;
--error-muted: #661000;
--error-deep: #3a0d0d;
--error-ghost: rgba(255, 51, 51, 0.08);
--error-glow: rgba(255, 51, 51, 0.15);
--error-glow-strong: rgba(255, 51, 51, 0.3);
```

---

## Conventions

- `// LABEL:` pattern for section headers — uppercase, `letter-spacing: 0.10em`, `color: var(--green-mid)`, bold, with glow
- `// stack | comment` pattern for tech stack — same weight/color as card title, smaller scale, no uppercase
- `[ KEY: VALUE ]` pattern for status blocks in ribbons/footers
- `[ 001 ]` pattern for card IDs — `10px`, `color: var(--text-muted)`
- Status symbols: `●` for live (solid), `○` for non-live (outline) — avoid `◌` (dotted, breaks under scanline)
- Border style: `border-left: 2px solid var(--green-dim)` for message blocks
- All interactive elements: `transition` on `background`, `border-color`, `color`, `box-shadow`, `text-shadow` — use `0.2s`

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

**`.scanlines-section` utility** (defined in `global.css`): sets `position: relative` and adds `::after` overlay identical to `body::after` but scoped to the container. Use on any element that needs scanlines when global overlay is disabled.

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

### Section labels

Section labels (`// LABEL:`) use bold + brighter color + glow to stand out from content:

```css
font-weight: 700;
color: var(--green-mid);
text-shadow: 0 0 10px rgba(0, 255, 65, 0.35);
```

Content under labels: `12px`, `color: var(--text-muted)`.