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
| `16px` | ×4 | Section headings, state labels (e.g. AWAITING INPUT) |
| `12px` | ×4 | Labels (`// SECTION:`), body text, buttons, ribbon |
| `10px` | ×2 | Secondary content (source tags, meta info) |
| `8px`  | ×4 | Micro-prefixes (`SYS >`, `YOU >`, `ERR >`) |

### Hierarchy Rules

- **Labels** (`// SECTION NAME:`): `12px`, `letter-spacing: 0.10em`
- **Content under labels**: `10px`
- **Body text / messages**: `12px`
- **Input field**: `12px`
- **Status ribbons / hints**: `12px`
- **Prefixes** (`SYS >`, `YOU >`): `8px`, `font-weight: 700`

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

- `// LABEL:` pattern for section headers — uppercase, `letter-spacing: 0.10em`
- `[ KEY: VALUE ]` pattern for status blocks in ribbons/footers
- `YOU >` / `SYS >` prefixes for chat messages
- Border style: `border-left: 2px solid var(--green-dim)` for message blocks
- All interactive elements: `transition` on color + box-shadow
- Animations: `fadeSlideUp`, `fadeSlideDown` for page load elements

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

### Section labels

Section labels (`// LABEL:`) use bold + brighter color + glow to stand out from content:

```css
font-weight: 700;
color: var(--green-mid);
text-shadow: 0 0 10px rgba(0, 255, 65, 0.35);
```

Content under labels: `10px`, `color: var(--text-muted)` or `var(--green-muted)`.