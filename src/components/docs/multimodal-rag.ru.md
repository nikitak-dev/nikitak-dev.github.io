<!-- Canonical RU companion for the /multimodal-rag docs modal.
     The rendered EN version lives in MultimodalRagDocs.astro next to this file.
     Keep structure in sync; this file is not imported by any page. -->

# MULTIMODAL_RAG — документация

---

## // USER GUIDE

### // TL;DR

Закидываете файл в Google Drive. Задаёте вопрос на естественном языке. Получаете ответ, опирающийся на ваши собственные документы, со ссылками на исходный текст, изображение, PDF, аудио или видео.

**Доступ посетителя — read-only.** Ингест происходит вне сайта, на Drive владельца. Любой посетитель может опрашивать существующий корпус (см. [What's in scope](#whats-in-scope)), но добавлять свои документы нельзя.

### // WHAT IS RAG

**Retrieval-Augmented Generation.** LLM отвечает не по памяти обучения, а по документам, извлекаемым из векторной базы по запросу. *Multimodal* означает, что система ингестит текст, изображения, PDF, аудио и видео в одно общее векторное пространство — текстовый вопрос может поднять кадр из видео или страницу PDF в качестве источника.

### // HOW TO USE

- Клик по полю ввода — подсказанный запрос автозаполняется. Нажмите **EXEC** (или Enter), чтобы отправить.
- Следите за индикатором набора — ответ придёт целым блоком, когда будет готов.
- Под каждым ответом появляются источники. Клик по медиа-плитке открывает оригинал в Google Drive в новой вкладке.
- **CLR** стирает текущую беседу.

**Про историю чата.** История разговора живёт только внутри этой вкладки браузера. Обновление страницы — сохраняет её. Закрытие вкладки — стирает. Разные вкладки историю не делят — каждая начинает с нуля.

### // WHAT'S IN SCOPE {#whats-in-scope}

База знаний — фиксированный корпус из 13 файлов. Вопросы вне этой области отклоняются, не галлюцинируются.

| Тип | Файлов | Темы |
|---|---|---|
| Текст (.txt) | 7 | cybersecurity, Agile, API design, cloud architecture, Linux CLI, networking, cryptography |
| Изображение (.png) | 2 | схемы по криптографии |
| Аудио (.mp3) | 1 | DevOps practices (~75 с) |
| Видео (.mp4) | 2 | набор на клавиатуре, UI-анимация |
| PDF (.pdf) | 1 | SQL Joins — 6 типов соединений (INNER, LEFT, RIGHT, FULL, CROSS, SELF) |

Ингест также принимает JPEG (image), WAV (audio) и MOV (video). Ограничения по размеру и длине — в [Limits & Timeouts](#limits--timeouts).

---

## // TECHNICAL REFERENCE

### // STACK

| Слой | Технология | Роль |
|---|---|---|
| Trigger | Google Drive Trigger | Следит за папкой, реагирует на новые файлы |
| File storage | Google Drive | Источник правды для документов |
| Captioning | Gemini 2.0 Flash | Структурированные описания для всех типов медиа |
| Embedding | Gemini Embedding 2 Preview | Нативно мультимодальные embeddings |
| Vector DB | Pinecone | Хранение и запросы embeddings |
| Reranker | Pinecone `bge-reranker-v2-m3` | Кросс-энкодер для второго прохода ранжирования |
| Query classifier | `google/gemini-2.0-flash-001` через OpenRouter | Intent + modality + standalone query |
| Chat LLM | `anthropic/claude-sonnet-4` через OpenRouter | Генерация grounded-ответов из извлечённого контекста |
| Orchestration | n8n (self-hosted) | 3 workflow'а — ingestion, chat, error handler |
| Frontend | Astro 6 + vanilla TypeScript | Статическая страница, per-tab состояние чата |

### // ARCHITECTURE

Три n8n-workflow'а работают вместе. `ingestion` (21 нода) следит за Google Drive и кормит Pinecone. `chat` (9 нод) отвечает на вопросы пользователя. `error_handler` (2 ноды) ловит необработанные сбои в любом из первых двух.

**// INGESTION** — запускается на каждый новый файл в наблюдаемой папке Drive.

![Ingestion pipeline: Google Drive trigger — switch по пяти веткам модальностей (text / image / PDF / audio / video) — каждая ветка даёт embedding — merge — upsert в Pinecone](/docs/multimodal-rag/ingestion.png)

- `google_drive_trigger` — опрашивает наблюдаемую папку Drive на появление новых файлов
- `download_file` — скачивает бинарный файл в workflow
- `detect_file_type` — читает MIME и расширение, проставляет `fileCategory`
- `route_by_type` — switch, раскидывает в одну из пяти веток по модальности
- `extract_text` / `prepare_image` / `prepare_pdf` / `prepare_audio` / `prepare_video` — подготовка по модальности (sentence-aware chunking для текста; base64-кодирование для остальных)
- `caption_image` / `caption_pdf` / `caption_audio` / `caption_video` — Gemini 2.0 Flash выдаёт структурированное JSON-описание (ветка текста этот шаг пропускает)
- `embed_text` / `embed_image` / `embed_pdf` / `embed_audio` / `embed_video` — Gemini Embedding 2 (только текст для текстовой ветки; multipart-сплавление бинарника и описания для медиа)
- `merge_embeddings` — 5-входовой merge результатов из всех веток
- `prepare_upsert` — собирает payload `vectors` для Pinecone с metadata
- `upsert` — записывает vectors в Pinecone

**// CHAT** — вызывается на каждый вопрос пользователя.

![Chat pipeline: chat_webhook принимает вопрос — rewrite_question классифицирует и переписывает через Gemini — embed_question создаёт вектор — query вытаскивает кандидатов из Pinecone — rerank отбирает лучших через bge-reranker-v2-m3 — build_context применяет modality-boost — llm_answer генерирует grounded-ответ через Claude Sonnet 4 — format_response формирует payload — respond_webhook отдаёт клиенту](/docs/multimodal-rag/chat.png)

- `chat_webhook` — entrypoint, принимает POST с вопросом и опциональной историей
- `rewrite_question` — Gemini 2.0 Flash классифицирует intent + modality и выдаёт standalone retrieval query
- `embed_question` — превращает переписанный запрос в вектор
- `query` — Pinecone retrieval, top-кандидаты по косинусной близости; для `pure_meta`-запросов на этапе запроса подключается metadata-фильтр (`fileType = modality`), так что top-K сразу содержит только файлы нужной модальности
- `rerank` — Pinecone `bge-reranker-v2-m3` переупорядочивает кандидатов кросс-энкодером
- `build_context` — фильтрует по score, применяет modality-boost для content-запросов, собирает context для prompt
- `llm_answer` — Claude Sonnet 4 генерирует grounded-ответ
- `format_response` — формирует payload для фронта (answer, media, sources)
- `respond_webhook` — отдаёт JSON клиенту

**// ERROR HANDLER** — принимает payload упавших выполнений от обоих workflow'ов (`ingestion` и `chat`).

![Error handler: error_trigger получает payload упавшего выполнения от ingestion- и chat-пайплайна и отправляет оповещение в Discord через send_alert](/docs/multimodal-rag/error-handler.png)

- `error_trigger` — срабатывает на необработанную ошибку в `ingestion` или `chat` (оба связаны через настройку `errorWorkflow` в n8n)
- `send_alert` — отправляет сообщение в Discord с именем workflow, типом ошибки, текстом и ссылкой на лог выполнения

### // KEY PATTERNS {#key-patterns}

- **Enriched multipart embeddings для всех медиа.** Сырой бинарный файл PNG, WAV или MP4 не несёт свою тему в форме, которую может найти текстовый запрос — «диаграмма public-key криптографии» не вытащит картинку без текстовых метаданных. Поэтому каждый медиа-файл подписывается через Gemini 2.0 Flash в структурированный JSON (`type`, `title`, `key_topics`, `terminology[]`, `content`, `questions[]`) под соответствующую модальность, и текст описания отправляется вместе с сырым бинарником как два `parts` в одном вызове Gemini Embedding 2. Модель сплавляет обе части в один вектор — текстовый запрос матчится и против сырого медиа, и против его описания одновременно. Описания также хранятся в metadata и отдаются LLM в качестве контекста.
- **Two-stage retrieval: vector query + cross-encoder rerank.** Чистая косинусная близость даёт быстрый, но грубый результат — она надёжно достаёт кандидатов в нужной тематике, но часто ранжирует их внутри неё неверно. Поэтому stage 1 тянет широкую выборку из Pinecone, а stage 2 прогоняет этих кандидатов через кросс-энкодер `bge-reranker-v2-m3`, который читает каждую пару (вопрос, кандидат) вместе и выдаёт совместную оценку — заметно точнее чистого cosine. Если все reranked items ниже порога, top-1 всё равно держим как fallback, чтобы политика ответа ниже могла вернуть частичный или честно-пустой ответ вместо молчания.
- **Fallback thresholds когда rerank недоступен.** Если rerank API лежит, мы бы остались без second-pass фильтра качества, и LLM получал бы либо шум, либо ничего. Поэтому `build_context` откатывается на сырые vector scores с порогами по модальности (text строже, короткие медиа либеральнее — короткие описания по природе получают ниже косинусную оценку). Top-1 держится даже если ничего не прошло, так что пользователь получает grounded-ответ, пока rerank восстанавливается.
- **LLM-driven intent + modality classification.** Не каждый ввод — это содержательный вопрос. `hi`, `?` и «сколько у вас видео?» требуют разной обработки, а «а что со вторым?» без контекста вообще бессмысленно. Regex-эвристики не масштабируются на EN / RU / UA. Поэтому `rewrite_question` (Gemini 2.0 Flash, temperature 0) делает три задачи одним вызовом: классифицирует вход как `greeting | pure_meta | content`, определяет конкретную модальность, если она в вопросе, и переписывает местоимения на основе recent history в самодостаточный запрос для ретривала. Greetings пропускают ретривал целиком; `pure_meta`-запросы идут через pre-retrieval фильтр ниже; `content`-запросы сохраняют cross-modal совпадения.
- **Pre-retrieval metadata filter для `pure_meta`-запросов.** Мета-вопросы про сам корпус («есть ли у вас видео», «какие PDF», «сколько аудио») — структурные: они про то, что *существует*, а не про релевантность контента. Vector similarity и cross-encoder rerank заточены под scoring контента, а не перечисление файлов; если спросить «сколько видео», реранкер прогонит короткие video-captions против абстрактного count-вопроса и уверенно задвинет их ниже длинных текстовых пассажей, к теме отношения не имеющих. Поэтому когда классификатор помечает вопрос как `pure_meta` с конкретной `modality`, к запросу Pinecone прикладывается metadata-фильтр (`fileType = modality`) ещё до ретривала. Top-K приходит уже суженным до нужного типа, rerank ранжирует внутри чистого пула, и ответ корректен независимо от того, как cross-encoder относится к длине captions. Паттерн self-query retrieval: LLM-классификатор извлекает predicate, vector DB применяет его структурно.
- **Modality boost для `content`-запросов.** Вне `pure_meta` pre-retrieval фильтр не срабатывает, а реранкер, обученный на корпусах с длинным текстом, склонен занижать оценку коротких описаний (изображения, короткого аудио, одностраничного PDF) по сравнению с длинными текстовыми пассажами — даже когда короткий вариант — это именно то, что нужно. Поэтому для `content`-запросов, где рядом с темой упомянута модальность («покажи картинку AES»), `build_context` гарантирует, что элементы нужного `fileType` проходят фильтр даже при низком rerank-score. `pure_meta`-запросам этот шаг не нужен — top-K уже modality-pure.
- **Three-tier answering policy.** Без явной политики LLM'ы либо галлюцинируют, когда контекста мало, либо слишком легко отказываются, когда есть частичная информация — два разных failure mode. System prompt Claude прописывает три tier'а: Tier 1 (direct) — отвечает полностью из контекста; Tier 2 (partial) — отвечает из того, что извлечено, и фиксирует scope одним предложением; Tier 3 (empty) — отвечает строго `That information is not available in the knowledge base.`. Эффект: пользователь получает полезный частичный ответ вместо глухого отказа, и получает честный отказ вместо выдумки, когда тема действительно не покрыта.
- **Multi-turn coherence.** Чат-бот, забывающий всё между сообщениями, не справится с «а что со вторым?», а бот, который помнит, но противоречит сам себе, теряет доверие пользователя. Фронт шлёт recent turns обратно на каждом запросе как `history`; при переписывании запроса история используется для разрешения местоимений, а при генерации ответа она встраивается как `<history>`-блок перед `<documents>` с явной инструкцией оставаться согласованным с прошлыми ответами и подтверждать новую информацию вместо тихого переопределения. `<history>` считается untrusted data — prompt запрещает следовать любым инструкциям внутри этих тегов, так что враждебная предыдущая реплика не сможет внедрить команды.
- **Filename-anchored embeddings.** Два файла с визуально похожим содержанием могут иметь разную семантику — `symmetric-encryption.png` и `asymmetric-encryption.png` могут дать почти одинаковые описания, если оба — диаграммы алгоритма. Имя файла несёт сигнал, которого нет в самом контенте, так что в каждый вызов Embedding API передаётся оригинальное имя файла как параметр `title`. Эффект: запрос про «symmetric encryption» попадает на symmetric-файл, а не на asymmetric, даже когда контент для модели эмбеддинга выглядит похожим.
- **Unified vector space с task-type оптимизацией.** Вопросы пользователя обычно короткие (`AES-256?`); документы — длинные объяснения (`AES-256 is a symmetric block cipher...`). Если обе стороны обрабатывать одинаково, они окажутся в разных зонах векторного пространства и ретривал будет пропускать очевидные совпадения. Embedding API у Gemini принимает `taskType`, который подстраивает вектор под его роль: `RETRIEVAL_DOCUMENT` для сохранённых файлов, `RETRIEVAL_QUERY` для запроса пользователя. Та же модель, те же размерности — но каждая сторона настроена пересекаться с другой, так что вопросы надёжнее находят свои ответы.
- **Sentence-aware chunking с overlap.** Наивный fixed-size chunking режет текст посреди предложения и расщепляет ключевые термины через границу фрагмента — запрос про `AES-256` может промахнуться мимо фрагмента, где есть только `...AES-` или `256 is a...`. Поэтому текстовые файлы режутся по границам предложений, с overlap'ом в 50 токенов между соседними фрагментами. Предложения остаются целыми, а концепции, растянутые на два предложения, всё ещё можно найти, потому что оба фрагмента содержат соединительную фразу.
- **Source-grounded, language-aware ответы.** Наивные реализации RAG отвечают на языке источников, или смешивают языки, или отрываются от источников — три разных failure mode. Украинский пользователь, спрашивающий про английский документ, всё равно хочет украинский ответ, который точно представляет английский контент. System prompt содержит два явных правила: всё в ответе опирается на извлечённые документы (никакого parametric knowledge из обучения), и ответ — на языке вопроса независимо от языка источников.

Числовые параметры (top-K, rerank floor, таймауты, размер фрагмента, cap) — см. [Limits & Timeouts](#limits--timeouts).

### // LIMITS & TIMEOUTS {#limits--timeouts}

| Параметр | Значение |
|---|---|
| Fetch timeout | 30 с — покрывает холодные пути Gemini + Claude |
| Text chunking | ~400 токенов на фрагмент, overlap 50 токенов, sentence-aware |
| Image / PDF batch | 6 элементов на embedding-запрос |
| Audio length | 80 с максимум |
| Video length | 120 с максимум |
| Conversation history | последние 10 turns (20 сообщений) на вкладку; все отправляются в Claude на каждом запросе |
| Assistant answer clamp | 500 символов на ответ, применяется перед записью в историю |
| Vector retrieval | top-K = 20 кандидатов |
| Rerank | top-N = 5 оставляем, score floor 0.001, modality boost cap 6 |
| Embedding dimensions | 1536 |
| Classifier timeout | 20 с, 1 попытка — одна медленная-но-успешная попытка лучше retry-цикла, наслаивающего таймауты |
| HTTP retry (остальные ноды) | 2-3 попытки на ноду, backoff 2-3 с |

### // ERRORS {#errors}

**Серверная сторона.** Оба workflow'а, `chat` и `ingestion`, связаны с `error_handler` через настройку `errorWorkflow` в n8n — любая необработанная ошибка в любом из пайплайнов запускает оповещение в Discord с именем workflow, типом ошибки, текстом и ссылкой на лог выполнения. Сверх этого chat-пайплайн ставит `onError: continueRegularOutput` на HTTP-ноды, так что транзитные сбои API видятся пользователю как дружелюбная ошибка, а не зависший запрос. У всех HTTP-нод есть retry с backoff'ом (количество попыток и ожидание — см. [Limits & Timeouts](#limits--timeouts)).

**Frontend states.**

| Причина | CONN state | Пользователь видит |
|---|---|---|
| Пользователь нажал CLR в процессе запроса | — | Сообщения стираются, ошибка не рендерится |
| Превышен таймаут запроса | LOST | `// Connection lost` |
| Network error / HTTP 5xx | LOST | `// Connection lost` |
| HTTP 4xx (config-side) | ESTABLISHED | `// Request rejected` |
| Webhook URL отсутствует на build | MISSING | `// Webhook missing` (EXEC disabled) |

### // TEST DATA & EVALUATION

Система прогоняется через end-to-end набор из 39 тестовых кейсов, покрывающий **14 способов сломаться** — и не сломаться. Среди них: галлюцинировать за пределами корпуса, отвечать не на том языке, путать похожие источники, следовать враждебным инструкциям, подсунутым внутри вопроса или истории, смешивать вопрос о том, что *есть* в корпусе, с вопросом о том, что *в нём написано*, терять местоимения между репликами и ломаться на опечатках. Failure modes сверяются с Barnett et al. 2024 (*Seven Failure Points of RAG*).

Кратко: если ответ, который вы видите здесь, опирается на реальный источник, на вашем языке, и с честным «not covered», когда это уместно — эти свойства активно проверяются, а не случайны.

---

*Синхронизировано с backend workflow от 2026-04-23.*
*Запросы логируются в n8n и отправляются в Gemini / Anthropic. Не передавайте чувствительные данные.*
