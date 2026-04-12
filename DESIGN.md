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

Do NOT apply `.scanlined` per-element — use the global body overlay instead.

### Button hover (EXEC style)

Full-intensity version (primary action buttons):

```css
background: rgba(0, 255, 65, 0.15);
border-color: var(--green);
color: #ccffcc;
box-shadow: 0 0 20px rgba(0, 255, 65, 0.3), inset 0 0 10px rgba(0, 255, 65, 0.1);
text-shadow: 0 0 8px var(--green-glow-strong);
```

Subtle version (secondary elements, e.g. social links):

```css
background: rgba(0, 255, 65, 0.08);
border-color: var(--green-dim);
color: var(--green-mid);
box-shadow: 0 0 10px rgba(0, 255, 65, 0.15), inset 0 0 6px rgba(0, 255, 65, 0.05);
text-shadow: 0 0 6px var(--green-glow);
```

### Section labels

Section labels (`// LABEL:`) use bold + brighter color + glow to stand out from content:

```css
font-weight: 700;
color: var(--green-mid);
text-shadow: 0 0 10px rgba(0, 255, 65, 0.35);
```

Content under labels: `12px`, `color: var(--text-muted)`.