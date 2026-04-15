# Portfolio — nikitak-dev.github.io

Astro static site, deployed to GitHub Pages. Terminal/matrix aesthetic.
Live: `https://nikitak-dev.github.io`
Repo: `nikitak-dev/nikitak-dev.github.io`

## Stack

- **Astro 6** — static site generator, `.astro` components (frontmatter + HTML + scoped CSS + JS)
- **TypeScript** — tsconfig included, types via Astro's built-in
- `@astrojs/sitemap` — auto-generates sitemap on build
- No CSS framework — raw CSS with CSS variables
- No JS framework — vanilla `<script is:inline>` blocks

## File Layout

```
src/
  pages/          # Each file = a route (index, 404, project pages)
  layouts/        # BaseLayout.astro — wraps all pages (head, fonts, global CSS)
  components/     # MatrixRain.astro, TypeLogo.astro
  styles/         # global.css — CSS variables, reset, shared rules
public/           # Static assets served as-is
DESIGN.md         # Design system reference — read before touching CSS
```

## Design System

See `DESIGN.md` for the full reference. Key rules:
- Font: **JetBrains Mono** everywhere
- Colors: CSS variables (`--green`, `--bg-void`, etc.) — never hardcode hex
- CRT scanline effect: global `body::after` overlay (`z-index: 9999`). Exception: pages with images/video — disable global, apply per-section
- Section labels: `// LABEL:` pattern, `letter-spacing: 0.10em`, uppercase, bold, `var(--green-mid)`
- Card IDs: `[ 001 ]` pattern, `10px`, `var(--text-muted)`
- Status symbols: `●` live, `○` non-live (not `◌`)
- Transitions: `0.2s` on hover for `background`, `border-color`, `color`, `box-shadow`, `text-shadow`
- Grid: 4px grid for structure, 2px grid for content

## Project Cards (index page)

Each project card has: `data-index`, optional `data-url`, `.card-id`, `.card-status`, `.card-title`, `.card-desc`, `.card-stack`, `.card-meta`, `.card-launch` button.

Status classes: `live` (green), `private` (muted), `wip` (red theme via `theme-red` on card).

Current projects:
- `[001]` VOICE_AGENT — private, disabled button
- `[002]` MULTIMODAL_RAG — live, links to `/multimodal-rag/`
- `[003][004]` — placeholder slots

## Dev Workflow

```bash
npm run dev      # localhost:4321, hot reload
npm run build    # outputs to dist/
npm run preview  # serve dist/ locally
```

## Deploy

Push to `main` → GitHub Actions (`.github/workflows/deploy.yml`) builds and deploys to GitHub Pages automatically. No manual deploy step.

## Commit Style

Format: `type: description` (English). Types: `feat`, `fix`, `style`, `chore`, `docs`.
No Co-Authored-By footer.

## Adding a New Project Page

1. Create `src/pages/<project-name>.astro`
2. Import and use `BaseLayout`
3. Update the card in `index.astro`: set `data-url`, change status to `live`, enable button
4. Follow `DESIGN.md` for all visual decisions