<!-- Canonical RU companion for the /multimodal-rag docs modal.
     The rendered EN version lives in MultimodalRagDocs.astro next to this file.
     Keep structure in sync; this file is not imported by any page. -->

# MULTIMODAL_RAG — документация

---

## // USER GUIDE

### // TL;DR

Закидываете файл в Google Drive. Задаёте вопрос на естественном языке. Получаете ответ, опирающийся на ваши собственные документы, со ссылками на исходный текст, изображение, PDF, аудио или видео.

**Доступ посетителя — read-only.** Ingest происходит вне сайта, на Drive владельца. Любой посетитель может опрашивать существующий корпус (см. [What's in scope](#whats-in-scope)), но добавлять свои документы нельзя.

### // WHAT IS RAG

**Retrieval-Augmented Generation.** LLM отвечает не по памяти обучения, а по документам, извлекаемым из векторной базы по запросу. *Multimodal* означает, что система принимает текст, изображения, PDF, аудио и видео в одно общее векторное пространство — текстовый вопрос может поднять кадр из видео или страницу PDF в качестве источника.

### // HOW TO USE

- Клик по пустому полю ввода — подсказанный запрос автозаполняется. Нажмите **EXEC** (или Enter), чтобы отправить подсказку, либо сотрите её и наберите свой вопрос.
- Следите за индикатором набора — ответ придёт целым блоком, когда будет готов.
- Под каждым ответом появляются источники. Клик по медиа-плитке открывает оригинал в Google Drive в новой вкладке.
- **CLR** стирает текущую беседу — сообщения с экрана, sessionStorage и текущий in-flight запрос (если есть).

**Про историю чата.** История разговора живёт только внутри этой вкладки браузера. Refresh — сохраняет её. Стирают: CLR и закрытие вкладки. Разные вкладки историю не делят — каждая новая начинает с нуля.

### // WHAT'S IN SCOPE {#whats-in-scope}

База знаний — фиксированный корпус из 13 файлов. Вопросы вне этой области отклоняются, не галлюцинируются.

| Тип | Файлов | Темы |
|---|---|---|
| Текст (.txt) | 7 | cybersecurity, Agile, API design, cloud architecture, Linux CLI, networking, cryptography |
| Изображение (.png) | 2 | схемы по криптографии |
| Аудио (.mp3) | 1 | DevOps practices (~75 с) |
| Видео (.mp4) | 2 | набор на клавиатуре, UI-анимация |
| PDF (.pdf) | 1 | SQL Joins — 6 типов соединений (INNER, LEFT, RIGHT, FULL, CROSS, SELF) |

Ingest принимает все форматы Gemini Embedding 2: **image** — PNG, JPEG; **audio** — MP3, WAV; **video** — MP4, MOV (кодеки H264, H265, AV1, VP9). Лимиты по размеру и длине — в [Limits & Timeouts](#limits--timeouts).

---

## // TECHNICAL REFERENCE

### // STACK

| Слой | Технология | Роль |
|---|---|---|
| Trigger | Google Drive Trigger | Следит за папкой, реагирует на новые файлы |
| File storage | Google Drive | Источник правды для документов |
| Captioning | Gemini 2.0 Flash | Структурированные описания для всех типов медиа |
| Embedding | Gemini Embedding 2 | Нативно мультимодальные embeddings |
| Vector DB | Pinecone | Хранение и запросы embeddings |
| Reranker | Pinecone `bge-reranker-v2-m3` | cross-encoder (читает пару вопрос+кандидат вместе и выдаёт совместный score — заметно точнее cosine) для второго прохода ранжирования |
| Query classifier | `google/gemini-2.0-flash-001` через OpenRouter | Intent + modality + standalone query |
| Chat LLM | `anthropic/claude-sonnet-4` через OpenRouter | Генерация grounded-ответов из извлечённого контекста |
| Orchestration | n8n (self-hosted) | 3 workflow'а — ingestion, chat, error handler |
| Frontend | Astro 6 + vanilla TypeScript | Статическая страница, per-tab состояние чата |

### // ARCHITECTURE

Три n8n-workflow'а работают вместе. `ingestion` (24 ноды) следит за Google Drive и кормит Pinecone. `chat` (9 нод) отвечает на вопросы пользователя. `error_handler` (2 ноды) ловит необработанные сбои в любом из первых двух.

**// INGESTION** — запускается на каждый новый файл в наблюдаемой папке Drive.

![Ingestion pipeline: Google Drive trigger — switch по пяти веткам модальностей (text / image / PDF / audio / video) — каждая ветка даёт embedding — merge — upsert в Pinecone](/docs/multimodal-rag/ingestion.png)

- `google_drive_trigger` — опрашивает наблюдаемую папку Drive на появление новых файлов
- `download_file` — скачивает бинарный файл в workflow
- `detect_file_type` — читает MIME и расширение, проставляет `fileCategory`
- `route_by_type` — switch, раскидывает в одну из пяти веток по модальности
- `extract_text` / `prepare_image` / `prepare_pdf` / `prepare_audio` / `prepare_video` — подготовка по модальности (text — sentence-aware chunking; image/pdf — base64-кодирование; audio/video — base64 + duration probe с проверкой cap'а)
- `filter_audio_size` / `filter_video_size` — IF-ноды, разводящие каждую ветку: oversized items идут в `notify_skipped`, valid — дальше в caption
- `notify_skipped` — Discord-алерт когда файл отклонён по cap'у (audio > 180с, video > 120с); независим от `error_handler` — это graceful skip, а не unhandled error
- `caption_image` / `caption_pdf` / `caption_audio` / `caption_video` — Gemini 2.0 Flash выдаёт структурированное JSON-описание (ветка текста этот шаг пропускает)
- `embed_text` / `embed_image` / `embed_pdf` / `embed_audio` / `embed_video` — Gemini Embedding 2 (только текст для текстовой ветки; multipart-сплавление бинарника и описания для медиа)
- `merge_embeddings` — 5-входовой merge результатов из всех веток
- `prepare_upsert` — собирает payload `vectors` для Pinecone с metadata; отфильтровывает items с флагом `_oversized` от size-роутеров, чтобы skipped-файлы не попадали в vector-store
- `upsert` — записывает vectors в Pinecone

**// CHAT** — вызывается на каждый вопрос пользователя.

![Chat pipeline: chat_webhook принимает вопрос — rewrite_question классифицирует и переписывает через Gemini — embed_question создаёт вектор — query вытаскивает кандидатов из Pinecone — rerank отбирает лучших через bge-reranker-v2-m3 — build_context применяет modality-boost — llm_answer генерирует grounded-ответ через Claude Sonnet 4 — format_response формирует payload — respond_webhook отдаёт клиенту](/docs/multimodal-rag/chat.png)

- `chat_webhook` — entrypoint, принимает POST с вопросом и опциональной историей
- `rewrite_question` — Gemini 2.0 Flash классифицирует intent + modality и выдаёт standalone retrieval query
- `embed_question` — превращает переписанный запрос в вектор
- `query` — Pinecone retrieval, top-кандидаты по косинусной близости; для `pure_meta`-запросов на этапе запроса подключается metadata-фильтр (`fileType = modality`), так что top-K сразу содержит только файлы нужной модальности
- `rerank` — Pinecone `bge-reranker-v2-m3` переупорядочивает кандидатов через cross-encoder
- `build_context` — фильтрует по score, применяет modality-boost для content-запросов, собирает context для prompt
- `llm_answer` — Claude Sonnet 4 генерирует grounded-ответ
- `format_response` — формирует payload для фронта (answer, media, sources)
- `respond_webhook` — отдаёт JSON клиенту

**// ERROR HANDLER** — принимает payload упавших выполнений от обоих workflow'ов (`ingestion` и `chat`).

![Error handler: error_trigger получает payload упавшего выполнения от ingestion- и chat-пайплайна и отправляет оповещение в Discord через send_alert](/docs/multimodal-rag/error-handler.png)

- `error_trigger` — срабатывает на необработанную ошибку в `ingestion` или `chat` (оба связаны через настройку `errorWorkflow` в n8n)
- `send_alert` — отправляет сообщение в Discord: имя workflow, тип ошибки (`NodeApiError`, `NodeOperationError` и т.п.), текст ошибки, UTC-timestamp и ссылка на конкретный execution

### // KEY PATTERNS {#key-patterns}

Architecture выше описывает «что делает каждая нода». Этот раздел — про «почему именно так»: design-решения, которые не очевидны из node-list'а.

- **Enriched multipart embeddings для всех медиа.** Сырой бинарный файл PNG, WAV или MP4 не несёт свою тему в форме, которую может найти текстовый запрос — «диаграмма public-key криптографии» не вытащит картинку без текстовых метаданных. Поэтому каждый медиа-файл подписывается через Gemini 2.0 Flash в структурированный JSON (`type`, `title`, `key_topics`, `terminology[]`, `content`, `questions[]`) под соответствующую модальность, и текст описания отправляется вместе с сырым бинарником как два `parts` в одном вызове Gemini Embedding 2. Модель сплавляет обе части в один вектор — текстовый запрос матчится и против сырого медиа, и против его описания одновременно. Описания также хранятся в metadata и отдаются LLM в качестве контекста.
- **Two-stage retrieval: vector query + cross-encoder rerank.** Чистая косинусная близость даёт быстрый, но грубый результат — она надёжно достаёт кандидатов в нужной тематике, но часто ранжирует их внутри неё неверно. Поэтому stage 1 тянет широкую выборку из Pinecone, а stage 2 прогоняет этих кандидатов через cross-encoder `bge-reranker-v2-m3`, который читает каждую пару (вопрос, кандидат) вместе и выдаёт совместную оценку — заметно точнее чистого cosine. Если все reranked items ниже порога, top-1 всё равно передаётся в LLM — пустой контекст вынудил бы LLM либо слепо отказаться, либо додумать из parametric knowledge. Сохранение top-1 оставляет следующему паттерну (Three-tier policy ниже) хоть какую-то опору для частичного ответа или честного отказа.
- **Three-tier answering policy.** Без явной политики LLM'ы либо галлюцинируют, когда контекста мало, либо слишком легко отказываются, когда есть частичная информация — два разных failure mode. System prompt Claude прописывает три tier'а: Tier 1 (direct) — отвечает полностью из контекста; Tier 2 (partial) — отвечает из того, что извлечено, и фиксирует scope одним предложением; Tier 3 (empty) — отвечает строго `That information is not available in the knowledge base.`. Эффект: пользователь получает полезный частичный ответ вместо глухого отказа, и получает честный отказ вместо выдумки, когда тема действительно не покрыта.
- **Fallback thresholds когда rerank недоступен.** Если rerank API лежит, мы бы остались без second-pass фильтра качества, и LLM получал бы либо шум, либо ничего. Поэтому `build_context` откатывается на сырые vector scores с порогами по модальности (text строже, короткие медиа либеральнее — короткие описания по природе получают ниже косинусную оценку). Top-1 держится даже если ничего не прошло, так что пользователь получает grounded-ответ, пока rerank восстанавливается.
- **LLM-driven intent + modality classification.** Не каждый ввод — это содержательный вопрос. `hi`, `?` и «сколько у вас видео?» требуют разной обработки, а «а что со вторым?» без контекста вообще бессмысленно. Regex-эвристики не масштабируются на EN / RU / UA. Поэтому `rewrite_question` (Gemini 2.0 Flash, temperature 0) делает три задачи одним вызовом: классифицирует вход как `greeting | pure_meta | content`, определяет конкретную модальность, если она в вопросе, и переписывает местоимения на основе recent history в самодостаточный запрос для retrievalа. Greetings всё равно проходят через embed / query / rerank, но `build_context` отбрасывает результаты и возвращает пустые `sources` — UI не показывает source-плитки для «hi»; `pure_meta`-запросы идут через pre-retrieval фильтр ниже; `content`-запросы сохраняют cross-modal совпадения.
- **Pre-retrieval metadata filter для `pure_meta`-запросов.** Мета-вопросы про сам корпус («есть ли у вас видео», «какие PDF», «сколько аудио») — структурные: они про то, что *существует*, а не про релевантность контента. Vector similarity и cross-encoder rerank заточены под scoring контента, а не перечисление файлов; если спросить «сколько видео», reranker прогонит короткие video-captions против абстрактного count-вопроса и уверенно задвинет их ниже длинных текстовых пассажей, к теме отношения не имеющих. Поэтому когда классификатор помечает вопрос как `pure_meta` с конкретной `modality`, к запросу Pinecone прикладывается metadata-фильтр (`fileType = modality`) ещё до retrievalа. Top-K приходит уже суженным до нужного типа, rerank ранжирует внутри чистого пула, и ответ корректен независимо от того, как cross-encoder относится к длине captions. Паттерн self-query retrieval: LLM-классификатор сам выводит filter predicate (условие фильтра вида `fileType = video`), а vector DB применяет его структурно — до векторного поиска.
- **Modality boost — механизм спасения коротких captions.** Reranker, обученный на корпусах с длинным текстом, склонен занижать оценку коротких описаний (изображения, короткого аудио, одностраничного PDF) по сравнению с длинными текстовыми пассажами — даже когда короткий вариант — это именно то, что нужно. Boost-loop в `build_context` возвращает items нужной модальности обратно в выдачу, независимо от того, как cross-encoder их ранжировал. Шаг работает для обоих intent'ов, но по разным причинам. Для `content`-запросов, где рядом с темой упомянута модальность («покажи картинку AES»), boost страхует cross-modal совпадения от низких rerank-score. Для `pure_meta`-запросов boost ещё критичнее: pre-retrieval сужает top-K до одной модальности, но reranker регулярно роняет ВСЕ items под floor, когда вопрос абстрактный («есть ли у вас видео?») — без boost запрос-перечисление видео вернул бы ноль items. Strict-modality filter в конце (только для `pure_meta`) гарантирует, что финальный список остаётся type-pure даже после boost.
- **Multi-turn coherence.** Чат-бот, забывающий всё между сообщениями, не справится с «а что со вторым?», а бот, который помнит, но противоречит сам себе, теряет доверие пользователя. Фронт шлёт recent turns обратно на каждом запросе как `history`; при переписывании запроса история используется для разрешения местоимений, а при генерации ответа она встраивается как `<history>`-блок перед `<documents>` с явной инструкцией оставаться согласованным с прошлыми ответами и подтверждать новую информацию вместо тихого переопределения. `<history>` считается untrusted data — prompt запрещает следовать любым инструкциям внутри этих тегов, так что враждебная предыдущая реплика не сможет внедрить команды.
- **Filename-anchored embeddings.** Два файла с визуально похожим содержанием могут иметь разную семантику — `symmetric-encryption.png` и `asymmetric-encryption.png` могут дать почти одинаковые описания, если оба — диаграммы алгоритма. Имя файла несёт сигнал, которого нет в самом контенте, поэтому при формировании embedding-запроса к Gemini Embedding 2 filename зашивается прямо в текстовый part: `title: <fileName> | text: <content или caption>`. Это рекомендованный для v2 паттерн — top-level `title` параметр в Gemini Embedding 2 не поддерживается, инструкции для асимметричного retrievalа живут внутри самого prompt. Эффект: запрос про «symmetric encryption» попадает на symmetric-файл, а не на asymmetric, даже когда контент для модели эмбеддинга выглядит похожим.
- **Unified vector space с asymmetric task-prefix.** Вопросы пользователя обычно короткие (`AES-256?`); документы — длинные объяснения (`AES-256 is a symmetric block cipher...`). Если обе стороны обрабатывать одинаково, они окажутся в разных зонах векторного пространства и retrieval будет пропускать очевидные совпадения. В Gemini Embedding 2 параметра `task_type` нет — роль зашивается прямо в текст: документы embedded как `title: <fileName> | text: <content>`, запросы — как `task: search result | query: <question>`. Та же модель, те же размерности — но каждая сторона несёт свою task-инструкцию внутри самого текста, и query- и doc-эмбеддинги ложатся в одну зону пространства.
- **Sentence-aware chunking с overlap.** Наивный fixed-size chunking режет текст посреди предложения и расщепляет ключевые термины через границу фрагмента — запрос про `AES-256` может промахнуться мимо фрагмента, где есть только `...AES-` или `256 is a...`. Поэтому текстовые файлы режутся по границам предложений, с overlap'ом в 50 токенов между соседними фрагментами. Предложения остаются целыми, а концепции, растянутые на два предложения, всё ещё можно найти, потому что оба фрагмента содержат соединительную фразу.
- **Pre-send duration probe + skip-routing.** Без валидации oversized-файлы падают downstream, когда Gemini Embedding 2 отклоняет их за превышение своих 180с audio / 120с video cap'ов — обобщённый `NodeApiError` в `error_handler`, без сигнала, что причина именно в длительности. Поэтому duration пробится перед отправкой: `prepare_audio` читает WAV через RIFF chunks, MP3 через ID3v2-skip + frame-header bitrate (CBR-приближение, ±5% на VBR); `prepare_video` использует Drive `videoMediaMetadata.durationMillis` как primary, MP4/MOV `mvhd` → `trak.mdia.mdhd` binary parse как fallback для не-Drive источников. Oversized items получают флаг `_oversized: true` и пропускают base64-кодирование. `filter_audio_size` / `filter_video_size` IF-ноды разводят каждую ветку: oversized идёт в `notify_skipped` (Discord-алерт: workflow name, file, scenario, probed duration vs cap, UTC-timestamp, Drive link); valid идёт в caption. Valid файлы из того же batch'а не страдают — skip per-item, не валит workflow целиком. `prepare_upsert` отфильтровывает `_oversized` items до zip'а с vectors — в Pinecone попадают только валидные embeddings.
- **Source-grounded, language-aware ответы.** Наивные реализации RAG отвечают на языке источников, или смешивают языки, или отрываются от источников — три разных failure mode. Украинский пользователь, спрашивающий про английский документ, всё равно хочет украинский ответ, который точно представляет английский контент. System prompt содержит два явных правила: всё в ответе опирается на извлечённые документы (никакого parametric knowledge из обучения), и ответ — на языке вопроса независимо от языка источников.

Числовые параметры (top-K, rerank floor, таймауты, размер фрагмента, cap) — см. [Limits & Timeouts](#limits--timeouts).

### // LIMITS & TIMEOUTS {#limits--timeouts}

| Параметр | Значение |
|---|---|
| Fetch timeout | 30 с — покрывает холодные пути Gemini + Claude |
| Text chunking | ~400 токенов на фрагмент, overlap 50 токенов, sentence-aware |
| Embedding multipart parts | per-call cap'ы Gemini Embedding 2: ≤6 изображений, ≤1 PDF-файл (сам до 6 страниц), ≤1 audio, ≤1 video на вызов `embedContent`; общий ≤8192 input tokens. Workflow шлёт 2 элемента в `content.parts`: 1 binary + 1 caption-text. См. [Possible Improvements](#improvements) |
| Audio length | 180 с — enforced в `prepare_audio` (WAV через RIFF, MP3 через frame-header bitrate); oversized уходят в `notify_skipped` |
| Video length | 120 с — enforced в `prepare_video` (Drive `videoMediaMetadata` primary, MP4/MOV `mvhd` / `mdhd` binary parse fallback); oversized уходят в `notify_skipped` |
| Conversation history | последние 10 turns (20 сообщений) на вкладку; все отправляются в Claude на каждом запросе |
| Assistant answer clamp | 500 символов на сообщение ассистента перед записью в историю — держит payload запроса и токены LLM history-блока компактными (10 turns × 500 символов ≈ 1250 токенов вместо unbounded). Trade-off: follow-up со ссылкой на деталь прошлого длинного ответа после 500-го символа эту деталь не увидит (редкий случай) |
| Vector retrieval | top-K = 20 cosine-ближайших из Pinecone — выборка достаточно широкая, чтобы rerank на втором шаге нашёл нужный ответ, но не настолько большая, чтобы cross-encoder тормозил (latency растёт линейно с K) |
| Rerank | После cross-encoder rerank'а: **top-N = 5** идёт в prompt LLM (достаточно для main topic + смежных деталей, без раздувания context); **score floor 0.001** отсекает true noise (items ниже этого порога редко дают полезный сигнал); **modality boost cap 6** — modality boost может довести result set до 6 items нужного типа, чтобы запросы вроде «перечисли все видео» получили покрытие без переполнения prompt'а |
| Embedding dimensions | 1536 |
| Classifier timeout | 20 с, 2 попытки с backoff 3 с |
| HTTP retry (остальные ноды) | 2-3 попытки на ноду, backoff 2-3 с |

### // ERRORS {#errors}

**Серверная сторона.** Оба workflow'а, `chat` и `ingestion`, связаны с `error_handler` через настройку `errorWorkflow` в n8n — любая необработанная ошибка в любом из пайплайнов запускает оповещение в Discord: имя workflow, тип ошибки, текст, UTC-timestamp и ссылка на конкретный execution. Сверх этого chat-пайплайн ставит `onError: continueRegularOutput` на HTTP-ноды, так что транзитные сбои API видятся пользователю как дружелюбная ошибка, а не зависший запрос. У всех HTTP-нод есть retry с backoff'ом (количество попыток и ожидание — см. [Limits & Timeouts](#limits--timeouts)).

**Frontend states.**

Индикатор `[ CONN: <state> ]` внизу chat-input bar показывает, доступен ли был backend на последнем запросе — **ESTABLISHED** значит backend ответил (даже если вернул 4xx — соединение есть, просто request rejected), **LOST** — запрос не дошёл (timeout / network failure / 5xx), **MISSING** — на build'е нет webhook URL. Таблица ниже сопоставляет сценарий с состоянием индикатора и сообщением на экране.

| Причина | CONN state | Пользователь видит |
|---|---|---|
| Пользователь нажал CLR в процессе запроса | — | Сообщения стираются, ошибка не рендерится |
| Превышен таймаут запроса (>30 с) | LOST | `Request timed out. The service is slow or unreachable.` |
| Network error / fetch failure | LOST | `Connection error. Check your network.` |
| HTTP 5xx | LOST | `Service unavailable. Try again later.` |
| HTTP 4xx (config-side) | ESTABLISHED | `Request rejected by server. The service may be misconfigured.` |
| Webhook URL отсутствует на build | MISSING | Error-bubble не рендерится — только `[ CONN: MISSING ]` в индикаторе; EXEC заблокирован |

### // POSSIBLE IMPROVEMENTS {#improvements}

Возможности в зоне досягаемости, но в текущей версии не реализованы — задокументированы здесь, чтобы разрыв между «что поддерживает API» и «что workflow делает сегодня» был явным.

- **Per-chunk embedding для PDF.** Сейчас workflow шлёт весь PDF одним `inlineData` blob'ом и хранит один вектор на файл. Разбиение длинных PDF на чанки по 6 страниц (per-call PDF cap Gemini Embedding 2) и embedding'ом каждого чанка отдельно дало бы более гранулярный retrieval — страничные диапазоны становились бы адресуемыми по отдельности, и запрос про конкретный раздел попадал бы на нужный чанк, а не на документ целиком.
- **Image-батчи через folder-convention.** Gemini Embedding 2 умеет сплавлять до 6 изображений в один aggregated-вектор — полезно, когда несколько картинок логически принадлежат одной единице (многошаговая диаграмма, последовательность скриншотов). Текущий Drive trigger срабатывает per-file. Конвенция «файлы в под-папке делят один вектор» открыла бы multi-image fusion без смены модели триггера.

### // TEST DATA & EVALUATION

Система прогоняется через end-to-end набор из 39 тестовых кейсов, покрывающий **14 способов сломаться** — и не сломаться. Среди них: галлюцинировать за пределами корпуса, отвечать не на том языке, путать похожие источники, следовать враждебным инструкциям, подсунутым внутри вопроса или истории, смешивать вопрос о том, что *есть* в корпусе, с вопросом о том, что *в нём написано*, терять местоимения между репликами и ломаться на опечатках. Failure modes сверяются с Barnett et al. 2024 (*Seven Failure Points of RAG*).

Источник тестов: [projects/multimodal-rag/eval/](https://github.com/nikitak-dev/nikitak-dev.github.io/tree/main/projects/multimodal-rag/eval) — [evaluation.json](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/multimodal-rag/eval/evaluation.json) (39 кейсов) + [run_eval.py](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/multimodal-rag/eval/run_eval.py) (Python-runner) + [manual-tests.md](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/multimodal-rag/eval/manual-tests.md) (UI smoke-список).

Кратко: если ответ, который вы видите здесь, опирается на реальный источник, на вашем языке, и с честным «not covered», когда это уместно — эти свойства активно проверяются, а не случайны.

---

*Синхронизировано с backend workflow от 2026-04-26.*
*EN version: [MultimodalRagDocs.astro](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/src/components/docs/MultimodalRagDocs.astro)*
*Запросы логируются в n8n и отправляются в Gemini / Anthropic. Не передавайте чувствительные данные.*
