# Project documentation template

> **UPDATE 2026-06-02 — docs model changed.** Аудитория портфолио в основном нетехническая, поэтому модалка документации на сайте теперь — короткий **ABOUT-блерб** (что делает / как попробовать / scope), а НЕ канонический технический нарратив, и она **не даёт ссылки на реализацию**. Глубокий технический нарратив хранится **local-only** в gitignored `projects/<slug>/docs/reference.md` (+ `.ru.md`) для личного реверс-инжиниринга — в публичный remote не пушится. Места ниже, где модалка названа единственным источником правды для surface-able контента, а narrative `*.md` в `projects/` — анти-паттерном, перекрыты этой правкой. ADR / миграции / prompt / eval остаются публичным техническим record'ом.

Шаблон для проектов в `projects/<slug>/`. Применяется при добавлении нового проекта в портфолио и при аудите существующего. Цель — единый источник правды, минимум дублирования, структурная согласованность между проектами.

Эталон: `multimodal-rag` (см. [`src/components/docs/MultimodalRagDocs.astro`](../../src/components/docs/MultimodalRagDocs.astro), [`projects/multimodal-rag/`](../../projects/multimodal-rag/)).

## Главное решение перед файлом

Перед тем как создавать новый `.md` в `projects/<slug>/`, спросить: «Это source-of-truth артефакт (DDL, snapshot системного prompt'а, eval-определения) или narrative о проекте?» Narrative-файлы в repo как `.md` — анти-паттерн. Narrative живёт в канонической модалке (`src/components/docs/<Slug>Docs.astro`); repo держит только source-of-truth артефакты + ADR.

## Раскладка файлов

### В repo: `projects/<slug>/`

```
projects/<slug>/
  README.md                          ≤25 строк, чистый индекс директории
  adrs/                              Nygard ADR (NNN-slug.md)
    _template.md                     шаблон новых ADR
    001-...md
  eval/                              Eval-suite — один формат на проект
    suite-definition.json | *.py     автоматический suite, источник правды
    run-suite.* | create-suite.*     runner-скрипты
    manual-tests.md                  ручной smoke-чеклист
    results/                         per-run снимки (часто gitignored)
  db/                                Если БД проекта релевантна
    migrations/                      DDL
    types/database.ts                Сгенерированные типы
  prompts/                           Если LLM-prompt релевантен
    *-system-prompt.md               Снимок production-системы (источник — UI вендора)
  knowledge-base/                    Если KB релевантна
    *.txt | *.md                     Source content
```

**Чего не должно быть в `projects/<slug>/`:**

- `architecture.md`, `workflows.md`, `flow.md`, любой narrative `*.md` — переезжает в модалку
- `CHANGELOG.md` — история в git log + ADR (по правилу `~/Projects/CLAUDE.md`: «документация = текущее состояние»)
- `db/README.md` (narrative-часть) — переезжает в модалку; в `db/` остаётся только `migrations/` + `types/`
- `tests/scenarios.md` — заменяется `eval/manual-tests.md`

### Каноническая модалка: `src/components/docs/<Slug>Docs.astro`

Единственный источник правды для surface-able контента (то, что видит посетитель страницы). Astro-компонент, рендерится в `<DocsModal>` через слот `overview` со страницы проекта. CSS привязан к фиче — `src/styles/<slug>-docs.css` (или переиспользовать существующий `rag-docs.css`, если паттерны общие).

### RU-компаньон: `src/components/docs/<slug>.ru.md`

Опциональный RU-зеркало EN-модалки. Не импортируется страницами; ссылка на GitHub blob-URL ставится наверху EN-модалки. Структура секций — 1:1 с EN.

### Карточка хаба: `src/data/projects.ts`

Сжатая сводка канонической модалки:

- `stack` — pipeline 3-4 элементов (`'A | B | C | D'`)
- `desc` — 1-2 предложения, problem-framed
- `meta` — короткая фраза в нижнем-левом углу карточки

Это **производная**, не источник. При расхождении канон — модалка.

## Структура секций модалки

Структура секций в `<Slug>Docs.astro`. Секции опциональны — пропускать те, что не применимы. Сохранять разделители `// USER GUIDE` и `// TECHNICAL REFERENCE` для визуальной согласованности между проектами.

### USER GUIDE

| Секция | Содержание |
|---|---|
| `// TL;DR` | 1-2 предложения. Что проект делает + режим доступа для посетителя (read-only / интерактивный / без интерактива) |
| `// HOW TO USE` | Для интерактивного демо: как взаимодействовать со страницей |
| `// HOW IT WORKS` | Для записанного демо без интерактива: как работает система end-to-end на conceptual-уровне |
| `// WHAT'S IN SCOPE` | Границы: корпус, языки, лимиты на high-level. Что посетитель может ожидать |

`HOW TO USE` и `HOW IT WORKS` взаимоисключающие — выбирать по типу проекта. Демо с интерактивом → `HOW TO USE`. Демо записанное, без интерактива → `HOW IT WORKS`.

### TECHNICAL REFERENCE

| Секция | Содержание |
|---|---|
| `// STACK` | Таблица: слой × технология × роль. Все компоненты с моделями / провайдерами / версиями где релевантно |
| `// ARCHITECTURE` | Диаграммы (PNG) + описание узлов. Единая каноническая картина flow системы. Если несколько workflow — каждый со своим скриншотом и списком узлов |
| `// KEY PATTERNS` | Distilled-сводка решений с cross-link на ADR. Один булет = одно нетривиальное решение + ссылка на полный ADR. Не дублирует ADR, служит указателем |
| `// LIMITS & TIMEOUTS` | Все числовые ограничения в одной таблице: timeouts, retries, caps, file sizes, retention windows |
| `// ERRORS` | Поверхность отказов: серверная обработка + карта frontend-состояний (для интерактивного демо) |
| `// POSSIBLE IMPROVEMENTS` | Явные пробелы: возможности в досягаемости, но не реализованные. Делает разрыв между «что в принципе возможно» и «что MVP делает сегодня» прозрачным |
| `// TEST DATA & EVALUATION` | Сводка покрытия: автоматический suite (cases / classes / runner) + manual-чеклист + planned expansion. Cross-link на `eval/` |

## Иерархия источников правды

| Что искать | Где смотреть первым |
|---|---|
| Почему так решено | ADR в `projects/<slug>/adrs/` |
| Что проект делает сейчас | `<Slug>Docs.astro` (модалка) |
| Source-of-truth артефакты (migrations / prompt / eval cases / KB content) | `projects/<slug>/` подпапки |
| Что лежит в директории repo | `README.md` (index only) |
| Что менялось когда | `git log --follow projects/<slug>/` |

Карточка хаба в `src/data/projects.ts` — производная, не источник.

## Соглашения

### Имена файлов

- `<Slug>Docs.astro` — PascalCase, EN
- `<slug>.ru.md` — kebab-case + суффикс `.ru.md`
- `NNN-slug.md` — ADR с трёхзначным префиксом для упорядочивания
- `manual-tests.md` — внутри `eval/`
- Скриншоты диаграмм — `public/docs/<slug>/<workflow-name>.png`

### Язык

- EN — все источники правды (модалка, ADR, README, eval-определения, prompt-снимки)
- RU — компаньон-файлы `<slug>.ru.md`
- Украинский — *примеры* внутри любого артефакта (site copy, mock-данные, demo-транскрипт), когда нужен пример на другом языке (см. `~/.claude/rules/communication.md`)

### Cross-links

- Между файлами `projects/<slug>/` — относительные пути
- Из `projects/<slug>/` в модалку — GitHub blob-URL (модалка живёт вне `projects/`)
- Из модалки на ADR / eval — GitHub blob-URL с `target="_blank"`
- Никаких абсолютных путей (`~/.claude/...`, `/c/Users/...`) — приватны к одной машине, утекают в публичный repo

### Дисциплина документации

- Документация = текущее состояние; история — в git
- Никаких глаголов-калек от EN-терминов («задеплоить» → «выполнить deploy»)
- Параллельный приём при первом упоминании малознакомого термина: `RU-перевод (EN)` или `EN (RU-пояснение)`
- Полные расшифровки аббревиатур при первом упоминании (`ADR (Architecture Decision Record)`)
- См. `~/.claude/rules/language-style.md` — детальные правила

## Чеклист: добавить новый проект

1. Создать `projects/<slug>/README.md` по шаблону (≤25 строк, индекс)
2. Создать `projects/<slug>/adrs/_template.md` (скопировать из эталонного проекта)
3. По мере накопления решений — добавлять `NNN-slug.md` ADRs
4. Накапливать source-of-truth артефакты (`db/migrations/`, `prompts/`, `eval/`, `knowledge-base/`)
5. Перед запуском демо — создать `src/components/docs/<Slug>Docs.astro` со всеми применимыми секциями
6. (Опционально) RU-компаньон `<slug>.ru.md`
7. Заполнить запись в `src/data/projects.ts` — производную сводку
8. Создать `src/pages/<slug>.astro` — интерактивную страницу
9. Подключить `<DocsModal>` слот `overview` → `<Slug>Docs.astro`

## Чеклист: аудит существующего проекта

1. Inventory всех `.md` в `projects/<slug>/` — каждый ли файл соответствует шаблону?
2. Narrative-файлы (`architecture.md`, `workflows.md`, narrative-часть `db/README.md`, `CHANGELOG.md`) → переезжают в модалку, удаляются из repo
3. README сжать до индекс-only, ≤25 строк
4. ADR-чистка — согласованность Nygard-формата
5. `eval/` переименовать, если был привязан к вендору (`vapi-evals/` → `eval/`)
6. Cross-links — относительные внутри проекта, GitHub blob-URL снаружи; никаких абсолютных путей
7. Согласованность языка — полное EN-дерево кроме `<slug>.ru.md`
8. RU-компаньон — обновить или создать, если есть EN-модалка
