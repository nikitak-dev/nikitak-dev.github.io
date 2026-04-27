# Portfolio — правила поддержания репозитория

Постоянные правила гигиены. Применять при ЛЮБОМ изменении кода. Для глубокого аудита/рефакторинга — отдельный скилл `auditing-codebase`.

## Главные правила (TL;DR)

Перед любым изменением — пробежаться по этому списку. Подробности в соответствующих секциях ниже.

1. **Читать файл целиком + grep по именам + понять *почему* этот код существует** (Chesterton's Fence).
2. **Лимиты:** `.astro` ≤300, функция ≤50 строк, параметры ≤4, вложенность ≤3.
3. **Никаких хардкод-значений:** CSS — только `var(--*)`; JS — именованные константы вместо magic-numbers.
4. **TypeScript:** `any` запрещён (для опаковых данных — `unknown` + narrow), `readonly` по умолчанию, named exports only, `throw` только `Error`.
5. **Запрещённые имена без квалификатора:** `utils`, `helpers`, `data`, `manager`, `common`, `stuff`.
6. **Коммит = одно атомарное изменение.** Refactor и feature/bugfix — в раздельных коммитах. `git mv` — в своём коммите.
7. **Astro:** `<script>` bundled для бизнес-логики; `is:inline` только для pre-hydration (TypeLogo, JSON-LD, FOUC-guards).
8. **A11y:** `alt` на `<img>`, `<label>` / `aria-label` на `<input>`, `prefers-reduced-motion` — отключает всё движение.
9. **Refactor-дисциплина:** не больше 1 часа tidy перед behavioral change; три повторения одного знания — до extract-а.
10. **Pre-commit hook:** `npm run check` + `npm run build` + `npm run knip`. Не отключать — чинить/ставить.

## Перед изменением

1. **Читать файл целиком** (Read без offset/limit, если < 500 строк)
2. **Grep по именам** перед переименованием / удалением символа
3. **Сверка с `DESIGN.md`** при правке визуала — есть ли уже токен / паттерн?
4. **Сверка с `CLAUDE.md`** при добавлении страницы / компонента — следовать установленному процессу
5. **Chesterton's Fence:** перед удалением/рефактором незнакомого кода — понять *почему* он существует. `git log --follow` / `git blame` + контекст использования. Ugly code часто решает реальную проблему, которую не видно с первого взгляда

## Структурные лимиты

Лимиты откалиброваны по индустрии (ESLint defaults, MDN performance budgets). Часть осознанно строже (параметры, вложенность), часть — без жёсткого порога (inline-скрипт).

| Тип | Лимит | Источник | Действие при превышении |
|-----|-------|----------|-------------------------|
| `.astro` файл | 300 строк | ESLint `max-lines` default | Разделить на компоненты |
| CSS-файл (gzipped) | ~15 KB total | MDN performance budget | Разнести по модулям |
| `<script>` блок в `.astro` | нет жёсткого лимита | — | Вынести в `src/scripts/`, если ≥3 concerns или приближается к размеру функции |
| Функция | 50 строк | ESLint `max-lines-per-function` default | Декомпозировать |
| Параметров функции | 4 | строже ESLint default 3 — осознанно | Объединить в объект |
| Вложенность блоков | 3 | строже ESLint default 4 — осознанно | Ранний return / extract |

Превышение допустимо с комментарием `// NOTE: <причина>` в начале файла/функции.

## Именование

- **Компоненты:** `PascalCase.astro` (`DocsModal.astro`, не `docs-modal.astro`)
- **Скрипты / данные:** `kebab-case.ts` (`chat.ts`, `projects.ts`)
- **CSS-классы:** `kebab-case`, иерархия через префикс (`.card`, `.card-id`, `.card-status`)
- **CSS-переменные:** `--kebab-case` с семантическим префиксом (`--green-mid`, `--bg-void`, `--text-muted`)
- **Запрещены без квалификатора:** `utils`, `helpers`, `common`, `data`, `manager`, `stuff`
- **Глаголы для действий, существительные для сущностей:** `renderCard()`, `cardStatus`

## CSS-дисциплина

- **Никаких хардкод-значений** для цвета, шрифта, тайминга — только `var(--*)`. Нет переменной → добавить в `:root` в `src/styles/tokens.css` и обновить `DESIGN.md`
- **Шрифт всегда JetBrains Mono.** Не подключать новые шрифты без согласия
- **Transitions:** `0.2s` для интерактивных свойств. Не использовать `transition: all`
- **Z-index диапазоны:** scanline = 9999, модалки = 1000–1999, overlay = 100–999, контент = 0–99
- **Scoped-стили предпочтительнее глобальных.** Глобальные стили живут в `src/styles/` модулях (tokens/base/utilities/hub/modal/responsive). Стили компонента — в самом компоненте через `<style>`
- **CRT scanline:** глобально через `body::after`. На страницах с медиа — отключить глобальный, применить per-section (см. `CLAUDE.md`)

## Accessibility

Базовые правила, которые соблюдаются без обсуждения — a11y не опциональна.

- **Каждый `<input>` / `<textarea>`** — с `<label>` или `aria-label`. Иначе screen reader озвучивает «edit text» без контекста
- **Каждое `<img>`** — с `alt`. Декоративные — `alt=""` (не отсутствие атрибута)
- **Динамический контент** — в `aria-live` регионе. `polite` для обычных обновлений (`#chat`), `assertive` для ошибок/алертов
- **`:focus-visible`** — кастомный стиль для всех интерактивных элементов, особенно если `outline: none`. Tab-навигация должна быть визуально очевидна
- **`@media (prefers-reduced-motion: reduce)`** — отключает всё движение, не только CSS-анимации: `scroll-behavior`, autoplay видео, JS-таймеры (матрица, глитч, каскад)
- **Модалки** — `<dialog>` с `aria-labelledby`; фокус возвращается на триггер при закрытии (native `<dialog>` это даёт)
- **Внешние ссылки** — `rel="noopener noreferrer"` (security + a11y tabindex correctness)

## TypeScript / JS

- **Никакого `any`.** Для опаковых данных (webhook responses, `JSON.parse`) — `unknown` с явным narrowing через type guards. Если `any` всё же неизбежен — комментарий `// NOTE: any because <причина>`
- **`readonly`** для полей/свойств, которые не переприсваиваются после инициализации (типы в `chat/types.ts`, поля интерфейсов). Документирует инвариант; помогает V8 оптимизировать shape
- **Named exports only** — `export default` запрещён. Default-экспорты молча ломают импортёров при переименовании (у импортёра свободное имя, TS не видит рассинхрон)
- **`throw` только `Error` instances.** Строки / голые объекты / number теряют stack trace и делают debug невозможным
- **Optional `field?: T` > `field: T \| undefined`.** Optional-поле можно опустить при конструировании объекта; union — нельзя (TS требует явного `undefined`)
- **Никаких глобальных переменных** в `<script>` — оборачивать в IIFE или модуль. Cross-module surface через `window._*` — только если задокументирована в `src/global.d.ts` и `BaseLayout.astro` comment block
- **DOM-доступ через `querySelector` / `getElementById`** с проверкой на `null` перед использованием; non-null assertion (`!`) — только после явного `if (!x) throw|return`
- **Слушатели событий** — навешивать после `DOMContentLoaded` или внутри `astro:page-load`
- **Никаких `console.log` в продакшен-коде** — удалять перед коммитом

## Astro-специфика

- **Метаданные `<head>`** — только через `BaseLayout` props. Не дублировать `<title>` / `<meta>` в страницах
- **Слоты вместо props** для контента, который рендерится как HTML
- **`is:inline`** для скриптов, которым нужно выполниться синхронно до гидрации (matrix rain, theme toggle). Иначе — обычный `<script>`
- **`set:html`** только для доверенного контента. Никогда — для пользовательского ввода
- **Картинки в `public/`** — статичные, без обработки. Нужна оптимизация — обсудить добавление `astro:assets`

## Рефакторинг-дисциплина

- **Атомарность** — refactor и bugfix/feature никогда в одном коммите. Теряется возможность откатить «только рефактор»
- **Normalize symmetries** (Kent Beck) — параллельные структуры должны быть структурно идентичны; любое различие обязано нести смысл. Пример: если `.media-body--file` и `.media-error` делают одно и то же кроме палитры — общий блок + variant-specific overrides, а не две копии с переменами в середине
- **Explaining variables** для составных условий: `const discretionaryAllowed = s.cellsMoved >= s.penetration` вместо inline-выражения в `if`. Debug-friendly + объясняет намерение
- **Explaining constants** — magic numbers в JS заменять именованными `const`-ами рядом с местом использования (`const REQUEST_TIMEOUT_MS = 30000;`). Исключение — явно артистичные значения (тайминги глитча в `404.astro`), помечаются комментарием
- **Не больше 1 часа tidy перед behavioral change** (Kent Beck). Если больше — потерян минимальный набор структурных правок и скатываемся в refactor-rabbit-hole. Остановиться, закоммитить что есть, вернуться к задаче
- **YAGNI («Say No»):** не добавлять спекулятивные фичи/абстракции. Три похожих случая > преждевременная абстракция. Wait for 3 confirmed repetitions того же знания перед extract-ом. Дублирование кода < неправильная абстракция
- **Документировать инварианты** в коде, когда они неочевидны: `// Invariant: segments[-1] is always the head`, `// Invariant: occupancy is rebuilt each tick`. Инвариант — компактное описание поведения во всех путях исполнения, снижает cognitive load при правках

## Зависимости

- **Не добавлять зависимости без согласия.** Стек намеренно минимален: Astro + sitemap
- **Перед `npm install`** — обсудить, что добавляется и зачем
- **`package-lock.json` всегда коммитить**
- **Раз в месяц:** `npm outdated` → решить, что обновлять (не автоматически)

## Коммиты

Формат: `type(scope?): description` (English, imperative, без точки в конце). Основа — [Conventional Commits 1.0](https://www.conventionalcommits.org/en/v1.0.0/).

Типы: `feat`, `fix`, `refactor`, `perf`, `docs`, `style`, `test`, `build`, `ci`, `chore`, `revert`.

Breaking change: `type(scope)!: description` или footer `BREAKING CHANGE: <описание>`. На этом проекте редко актуально (static site, нет внешнего API), но если меняется публичный URL / data-схема projects.ts / поведение BaseLayout-пропсов — помечаем.

Правила:
- Один коммит = одно атомарное изменение, описуемое одной строкой ≤ 72 символа
- «Атомарный» = **описуемо одной фразой**, а не «минимум N строк». 1-строчный коммит нормален, если он завершённая единица.
- НЕ объединять рефакторинг + фичу / стиль + логику — это про ревертируемость, а не про размер
- НЕ использовать "misc", "various", "updates" — конкретизировать
- НЕ добавлять Co-Authored-By footer
- **Глубина message = значимости изменения.** Trivial (typo, whitespace, missed import) — одна строка. Substantial (новая фича, нетривиальный рефактор, breaking) — body с rationale/контекстом. Body только если описание не помещается в одну строку
- **File moves (`git mv`) — в отдельном коммите**, правки — в follow-up. Иначе git не опознаёт rename (threshold по содержимому не срабатывает), diff раздувается, история `--follow` ломается

**Bundling hygiene-правок в текущий коммит:** если опечатка / whitespace / комментарий естественно относится к файлу, который уже меняешь этим коммитом — включать сразу, не дробить на два. Правило «атомарный» не требует механически выделять каждую строчку в отдельный commit.

**Follow-up на собственный коммит:**
- **Unpushed** + тривиальная правка (typo, whitespace, забытый импорт, доп. комментарий) → `git commit --amend` (или `git commit --fixup=<sha>` + `git rebase --autosquash` перед push). Не плодить «fix typo» коммиты, если историю ещё можно переписать.
- **Pushed** → отдельный коммит. Прошлое не переписываем.

Примеры:
- `feat(card): add WIP status with red theme`
- `fix(matrix): read colors from CSS variables on theme switch`
- `refactor(css): extract section-label pattern into utility class`
- `perf(hub): lazy-load matrix canvas on boot-complete`
- `style(index): align card grid to 4px baseline`
- `docs(design): document amber palette for warning states`
- `build(deps): bump astro to 6.2.0`
- `ci(deploy): pin setup-node to v5`
- `revert: revert "feat(card): add WIP status"`
- `refactor(data)!: rename Project.url → Project.href`

## Перед коммитом (обязательный чеклист)

Pre-commit hook (`.githooks/pre-commit`, активируется через `git config core.hooksPath .githooks` в свежем clone) автоматически выполняет шаги 1 и 4: `npm run check` + `npm run build` + `npm run knip` (последний — `knip --production`, dead exports). Если hook не активирован — активировать, а не пропускать проверки.

1. `npm run build` — успешно
2. Если задет UI — `npm run dev` + визуальная проверка изменённых страниц в браузере (Playwright MCP; анимации — сам смотрю, без автоматических скринов)
3. `git diff` — посмотреть на свои изменения свежим взглядом
4. `npm run check` + `npm run knip` — 0 ошибок, 0 dead exports
5. Нет `console.log`, отладочных комментариев, закомментированного кода
6. Нет файлов из `.playwright-mcp/` или `dist/` в стейджинге
7. Сообщение коммита соответствует формату

## Перед push

- Все локальные коммиты атомарные
- Если получились «грязные» коммиты — `git rebase -i` локально перед push (только для не-pushed)
- Push в `main` запускает деплой → перед push убедиться, что build проходит локально

## Гигиена репозитория

**Постоянный gate в CI:** `.github/workflows/pr-check.yml` прогоняет `npm run knip` (= `knip --production`) — ловит dead TS-exports до merge. Если PR вводит неиспользуемый export — рефакторить или удалять, а не игнорировать предупреждение. Конфиг — [knip.json](knip.json); `@astrojs/sitemap` whitelisted, потому что подключается через `astro.config.mjs` (knip --production de-emphasizes config-файлы).

**При каждом крупном изменении:**
- Проверить актуальность `CLAUDE.md` и `DESIGN.md`
- Удалить временные файлы (`*.bak`, тестовые HTML, скриншоты)
- Обновить `.gitignore`, если появились новые типы артефактов

**Раз в месяц:**
- `npm outdated` — обзор зависимостей
- `npx knip` + `npx jscpd src --min-tokens 50` — свежий скан dead-exports и duplication
- Просмотр `src/` глазами: всё ли на своём месте, нет ли мёртвых файлов
- Сверка `DESIGN.md` ↔ `src/styles/tokens.css` — токены не разошлись?

**Раз в квартал:** `/auditing-codebase` light-pass — ловит то, что автоматика пропускает (CSS dead rules, doc-drift, architectural смещения).

## Запреты (hard rules)

- Не коммитить `.env`, `.mcp.json`, `node_modules/`, `dist/`, `.astro/`, `.playwright-mcp/`
- Не использовать `git push --force` в `main`
- Не использовать `git commit --amend` для уже запушенных коммитов
- Не использовать `--no-verify` при коммите
- Не править `.github/workflows/` без явного запроса пользователя
- Не вводить новые инструменты сборки / линтеры / фреймворки без согласия
- Не менять версию Astro / Node без причины и согласия
