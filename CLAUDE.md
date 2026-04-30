# Portfolio — nikitak-dev.github.io

Astro static site, deployed to GitHub Pages. Terminal/matrix aesthetic.
Live: `https://nikitak-dev.github.io`
Repo: `nikitak-dev/nikitak-dev.github.io`

## Stack

- **Astro 6** — static site generator, `.astro` components (frontmatter + HTML + scoped CSS + JS)
- **TypeScript** — tsconfig included, types via Astro's built-in
- `@astrojs/sitemap` — auto-generates sitemap on build
- No CSS framework — raw CSS with CSS variables
- No JS framework — feature logic lives in `src/scripts/` and is bundled via plain `<script>import '../scripts/<feature>';</script>`. `is:inline` is reserved for pre-hydration work (TypeLogo, JSON-LD, FOUC guards).

## File Layout

```
src/
  pages/          # Each file = a route (index, 404, project pages)
  layouts/        # BaseLayout.astro — wraps all pages (head, fonts, CSS barrel)
  components/     # DocsModal.astro, MatrixRain.astro, TypeLogo.astro
  scripts/        # Feature folders (chat/, hub/, matrix-rain/) and standalone scripts (cascade.ts, kbd-press.ts, ...)
  styles/         # Modular CSS — see "Styles" below
  data/           # Typed static data (projects.ts)
  env.d.ts        # ImportMetaEnv typings for PUBLIC_* env vars
public/           # Static assets served as-is (incl. per-project diagrams under public/docs/<slug>/)
projects/         # Per-project repo-only artifacts (adrs/, test_data, eval, etc.). Not built or served — only src/ + public/ feed the site. Each <slug>/ has a README.md indexing its contents; ADRs use Nygard format with NNN-prefix filenames.
DESIGN.md         # Design system reference — read before touching CSS
```

### Styles

`src/styles/index.css` is the barrel imported by `BaseLayout.astro`. It `@import`s modules in cascade order:

| Module | Purpose |
|---|---|
| `tokens.css` | `:root` design tokens + `body[data-error]` remaps |
| `base.css` | Reset, body, scanline overlay, vignette, shared keyframes (`#matrix-bg` positioning lives in `components/MatrixRain.astro` as scoped global) |
| `utilities.css` | `.btn-terminal`, `.beam-line`, `.section-label`, scanline variants, shared scrollbar |
| `hub.css` | Header, boot, sys-status, `#hub`, project cards (+amber theme), legend, footer |
| `modal.css` | `dialog.docs-modal` transitions and internals |
| `responsive.css` | Mobile `@media (max-width: 640px)` + reduced-motion |

Feature-scoped CSS (e.g. `chat.css`) is imported directly by the owning page, not via the barrel.

## Design System

See `DESIGN.md` for the full reference. Key rules:
- Font: **JetBrains Mono** everywhere
- Colors: CSS variables (`--green`, `--bg-void`, etc.) — never hardcode hex
- CRT scanline effect: global `body::after` overlay (`z-index: 9999`). Exception: pages with images/video — disable global, apply per-section
- Section labels: `// LABEL:` pattern, `letter-spacing: 0.10em`, uppercase, bold, `var(--green-mid)`
- Card IDs: `[ 001 ]` pattern, `10px`, `var(--text-muted)`
- Status labels: `.card-status.live / .private / .wip` — `10px`, color-coded (green / green-dim / green-muted), `.live` pulses via `connPulse`
- Transitions: `0.2s` on hover for `background`, `border-color`, `color`, `box-shadow`, `text-shadow`
- Grid: 4px grid for structure, 2px grid for content

## Project Cards (index page)

Each project card has: `data-index`, optional `data-url`, `.card-id`, `.card-status`, `.card-title`, `.card-desc`, `.card-stack`, `.card-meta`, `.card-launch` button.

Status classes drive only the `.card-status` label colour (`green / green-dim / green-muted` for `live / private / wip` — see `src/styles/hub.css`). They do **not** change the card palette: the card's overall colour is determined exclusively by `category` (`ai` → green, `automation` → amber via `.theme-amber`). Red palette (`--error-*` tokens) is the project's error/failure idiom — page-level remap via `body[data-error="true"]` in `tokens.css` (used by 404), plus component-level uses in chat (`.bubble--error`, `.media-error`, connection-status indicators in `chat.css`) and matrix rain glitch mode. It marks something broken; do not borrow it for neutral states like "in progress".

Current project list lives in [src/data/projects.ts](src/data/projects.ts) — that file is the source of truth for IDs, statuses, URLs, and button labels. Don't duplicate it here.

## Dev Workflow

```bash
npm run dev      # localhost:4321, hot reload
npm run build    # outputs to dist/
npm run preview  # serve dist/ locally
```

## Deploy

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages automatically. No manual deploy step.

## Commit Style

Full rules (types, scopes, breaking-change marker, bundling hygiene, follow-up strategy) live in [.claude/rules/portfolio-style.md](.claude/rules/portfolio-style.md). Base format: `type(scope?): description` (English, Conventional Commits 1.0). No Co-Authored-By footer.

## Adding a new project

Update `src/data/projects.ts` — append an entry to the `PROJECTS` array with all fields:

- `id` — 3-digit string, e.g. `'005'`
- `title` — `UPPER_SNAKE`, appears as card title
- `status` — `'live' | 'private' | 'wip'`
- `category` — `'ai' | 'automation'` (drives green vs amber theme)
- `url` — optional, route for the project page (omit until page exists)
- `desc` — 1–2 sentences, problem-framed
- `stack` — `'A | B | C'` pipeline, appears under `//` comment
- `meta` — short phrase, shown bottom-left of card
- `button` — `{ label, disabled, ariaLabel? }`

`liveCount()` and `totalCount()` derive from `PROJECTS`; footer counters update automatically.

## Adding a new project page

1. Create `src/pages/<project-name>.astro`
2. Import `BaseLayout` and set props: `title`, `logoText`, `subtitle`, `description`, `ogTitle`, `ogDescription`
3. Choose `scanlineMode`:
   - `"global"` (default) — pages without media, uses `body::after` overlay
   - `"per-section"` — pages with images/video; global overlay disabled, apply `.scanlines-section` to containers that need scanlines
4. Feature-scoped CSS → create `src/styles/<feature>.css` and `import` it from the page (not from the barrel)
5. Feature-scoped TS → create `src/scripts/<feature>.ts` (see structure below) and include via `<script>import '../scripts/<feature>';</script>`
6. Set `url` on the corresponding `projects.ts` entry so the hub card routes to this page
7. Cross-check against `DESIGN.md` for tokens and patterns

## `src/scripts/` structure

- One feature = `src/scripts/<feature>.ts` while the file stays under ~300 lines
- If the feature grows — ≥3 concerns or >300 lines — promote to a folder: `src/scripts/<feature>/index.ts` + siblings (`messages.ts`, `conn.ts`, …)
- Import from the page via `<script>import '../scripts/<feature>';</script>` (plain `<script>`, **not** `is:inline`). Vite bundles it.
- Pattern reference: `src/pages/multimodal-rag.astro` importing `src/scripts/chat/` (folder-with-index.ts form, since chat has ≥3 concerns)

## Maintenance & Refactoring

- **Ongoing hygiene rules** (file limits, naming, CSS, commits, pre-commit/push checklist) → `.claude/rules/portfolio-style.md`
- **Deep audit / refactor** (structural review, plan, phased execution) → skill `auditing-codebase` (triggers: "audit", "refactor", "clean up")