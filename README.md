# portfolio

Personal portfolio site — AI automation & integration projects. Terminal/matrix aesthetic, CRT scanlines, boot sequence.

Live: <https://nikitak-dev.github.io>

## Stack

- **Astro 6** — static site generator
- **TypeScript** (strictest config)
- `@astrojs/sitemap` — auto-generated sitemap
- No CSS framework — raw CSS with variables
- No JS framework — vanilla modules imported via Astro

## Develop

```bash
npm install
npm run dev       # localhost:4321, hot reload
npm run check     # astro check (type-check)
npm run build     # static output to dist/
npm run preview   # serve dist/ locally
```

Node ≥ 22 required.

## Deploy

Push to `main` → GitHub Actions ([`deploy.yml`](.github/workflows/deploy.yml)) builds and deploys to GitHub Pages. PRs run [`pr-check.yml`](.github/workflows/pr-check.yml).

`PUBLIC_RAG_WEBHOOK` is injected from repo secret at build time (used by `/multimodal-rag` chat).

## Project guides

- [CLAUDE.md](CLAUDE.md) — layout, conventions, workflow for adding pages/projects
- [DESIGN.md](DESIGN.md) — typography, color palette, effects, animation system
- [.claude/rules/portfolio-style.md](.claude/rules/portfolio-style.md) — hygiene rules (file limits, naming, commits)
