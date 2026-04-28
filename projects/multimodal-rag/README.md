# multimodal-rag — project artifacts

5-modal RAG pipeline (text / image / audio / video / PDF → vector → grounded answer).

- **Live demo:** [/multimodal-rag/](https://nikitak-dev.github.io/multimodal-rag/)
- **Canonical docs:** click `DOCS & VIDEO` on the live page (modal). Source: [src/components/docs/MultimodalRagDocs.astro](../../src/components/docs/MultimodalRagDocs.astro) (EN) and [src/components/docs/multimodal-rag.ru.md](../../src/components/docs/multimodal-rag.ru.md) (RU companion).

## What's in this directory

| Path | Tracked? | Contents |
|---|---|---|
| `adrs/` | ✓ | Architecture Decision Records, [Nygard format](https://cognitect.com/blog/2011/11/15/documenting-architecture-decisions). Files named `NNN-slug.md` for ordered discoverability; new ADRs start from [`_template.md`](adrs/_template.md). |
| `test_data/` | local-only | Source corpus uploaded to the watched Drive folder for ingestion: 7 .txt, 2 .png, 1 .mp3, 2 .mp4, 1 .pdf. ~33MB total — Drive is the canonical copy, this is a backup/reference. |
| `eval/` | ✓ | `run_eval.py` (Python runner) + `evaluation.json` (39-case automated suite) + `manual-tests.md` (UI smoke list). Run `OPENROUTER_API_KEY=... python eval/run_eval.py` against the chat webhook for end-to-end scoring; LLM-as-judge uses OpenRouter. |

Astro builds only `src/` + `public/`, so nothing here reaches `dist/`. `README.md`, `adrs/` and `eval/` are tracked (small text + Python, ~40KB); bulky `test_data/` is gitignored at the repo root — see [.gitignore](../../.gitignore).