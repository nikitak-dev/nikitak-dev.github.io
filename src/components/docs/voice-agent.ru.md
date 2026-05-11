<!-- Canonical RU companion for the /voice-agent docs modal.
     The rendered EN version lives in VoiceAgentDocs.astro next to this file.
     Keep structure in sync; this file is not imported by any page. -->

# VOICE_AGENT — документация

*EN version: [VoiceAgentDocs.astro](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/src/components/docs/VoiceAgentDocs.astro)*

---

## // USER GUIDE

### // TL;DR

Голосовой AI-ресепшнист (Sophie) на платформе Vapi для бизнеса в сфере домашних услуг: идентификация звонящего, запросы в knowledge base (KB, база знаний), бронирование встреч, перенос и отмена, эскалация ошибок. Тестовый кейс — GreenScape Landscaping (Saint Petersburg, FL), вымышленная компания по ландшафтному дизайну.

**Доступ посетителя — только чтение.** К Vapi-ассистенту привязан US-номер, но он не публикуется — проект подаётся как portfolio-артефакт, а не живая демонстрация. Послушать агента можно через плеер записанного звонка на этой странице.

### // HOW IT WORKS

Входящий звонок попадает на Vapi-ассистента. Sophie приветствует звонящего — приветствие лежит в поле `firstMessage` ассистента Vapi и идёт напрямую в TTS (синтез речи) при подключении, без обращения к LLM. Приветствие сразу предупреждает, что собеседник — AI, и что звонок записывается. Параллельно с проигрыванием приветствия запускается поиск номера в CRM, чтобы результат был готов, когда звонящий ответит.

Sophie использует два инструмента. `n8n_orchestrator` — единственный MCP (Model Context Protocol) tool, который через MCP-протокол раздаёт семь конкретных операций: поиск клиента, создание клиента, проверка свободных слотов, бронирование, поиск встреч, перенос, отмена. LLM выбирает нужную операцию по форме аргументов; n8n-сторона выполняет её в связке с Supabase Postgres и Google Calendar. `search_knowledge_base` — отдельный Vapi-native tool, опирающийся на Vapi Files (услуги, цены, часы работы, FAQ, политика эскалации).

После завершения звонка Vapi отправляет end-of-call-отчёт на отдельный n8n webhook. Этот webhook сохраняет звонок (transcript, costs, структурированный итог) в Postgres, пишет TCPA / wiretap audit-строку в `consent_log` и запускает архивацию записи в Supabase Storage в режиме fire-and-forget (объяснение паттерна — в [Key Patterns](#key-patterns)).

Сценарии отказов — в секции [Errors](#errors); конкретные архитектурные решения — в [Key Patterns](#key-patterns), оттуда есть ссылки на полные ADR (Architecture Decision Record — запись об архитектурном решении).

### // WHAT'S IN SCOPE {#whats-in-scope}

Знания Sophie о бизнесе ограничены фиксированным KB-файлом (`greenscape-company-info.txt`), загруженным в Vapi Files. Всё, что вне KB, либо отклоняется, либо уходит в предложение перезвонить (callback offer).

| Возможность | Покрытие |
|---|---|
| Запросы в KB | Услуги, диапазоны цен, часы работы, города зоны обслуживания, FAQ, политика эскалации. Вне KB → Sophie предлагает перезвонить, а не угадывает. |
| Booking | Новые встречи, перенос, отмена. Двухчасовые блоки в рабочих часах, Eastern Time. Проверка попадания адреса в зону обслуживания собирается, но не делается в моменте — подтверждение выполняет operations-команда после бронирования (см. [Possible Improvements](#improvements)). |
| Идентификация звонящего | Автоматический поиск по телефону на старте звонка (параллельно с приветствием). Для action-запросов (booking / reschedule / cancel) Sophie собирает email, ищет в CRM, применяет вторичную проверку (последние четыре цифры телефона в карточке клиента), если поиск по номеру не сработал. |
| Out of scope | Прямой перевод звонка живому оператору (live transfer) — заменён на предложение перезвонить. Чрезвычайная ситуация с деревом / штормом (перенаправление на отдельный номер с явными инструкциями, без CRM-действий). Чисто информационные запросы вне KB → предложение перезвонить. |

**Compliance.** Первая фраза раскрывает AI-природу и факт записи звонка для quality и training (FCC AI-voice ruling, февраль 2024 + покрытие state-законов CIPA / two-party-consent). Каждый завершённый звонок пишет строку в `consent_log`, фиксирующую текст раскрытия, который был фактически произнесён — текст забирается в реальном времени из Vapi `assistant.firstMessage` в момент end-of-call, чтобы audit-запись отражала именно то, что услышал звонящий, независимо от поздних правок prompt'а.

---

## // TECHNICAL REFERENCE

### // STACK

| Слой | Технология | Роль |
|---|---|---|
| Voice platform | Vapi | Хостит ассистента, system prompt, маршрутизацию инструментов, end-of-call analysis pipeline, knowledge-base файлы |
| LLM | `anthropic/claude-haiku-4-5-20251001` | Reasoning, tool calling, генерация ответов. Haiku обменивает запас reasoning на TTFT (time-to-first-token, время до первого токена ответа) меньше секунды — для receptionist-flow глубокий reasoning не критичен, важнее низкая voice latency |
| TTS | ElevenLabs `eleven_flash_v2_5` | Синтез речи. Прямая интеграция с ElevenLabs (не через Vapi voice provider), Flash выбран ради низкой latency |
| STT | Deepgram `flux-general-en` | Распознавание речи; параметры и обоснование — в [Limits & Timeouts](#limits-timeouts) |
| Backend | n8n (self-hosted) | 12 workflows: MCP orchestrator + 7 Vapi-facing tool sub-workflows + 2 internal helpers (`shared_phone_normalize`, `archive_recording`) + end-of-call webhook + 1 error handler |
| CRM | Supabase (Postgres + Storage) | Четыре таблицы (`customers`, `calls`, `appointments`, `consent_log`) + приватный bucket `recordings` для архивации аудио |
| Schedule | Google Calendar | Проверка свободных слотов, создание / обновление / удаление событий |
| Alerts | Discord | Ошибки инструментов и внешних триггеров сходятся в единый `error_handler` workflow, который постит в Discord webhook |

### // ARCHITECTURE {#architecture}

Двенадцать n8n workflows работают вместе. `orchestrator` — единственная точка входа со стороны Vapi: MCP-сервер, который анонсирует семь конкретных tool-операций. `end_of_call` — отдельный webhook, срабатывающий когда Vapi заканчивает звонок: сохраняет call record, пишет consent audit, запускает архивацию записи. `archive_recording` идёт в режиме fire-and-forget из `end_of_call` для загрузки `.mp3` в Supabase Storage. `error_handler` ловит необработанные сбои во всех workflows и отправляет Discord-alert. Два internal helpers (`shared_phone_normalize`, `archive_recording`) не выставлены в Vapi — вызываются через `executeWorkflow` из других workflow проекта. Ниже показаны пять наиболее репрезентативных workflows; остальные tool sub-workflows (`create_client`, `check_availability`, `event_lookup`, `update_event`, `delete_event`) следуют тем же паттернам, что `client_lookup` и `book_event`.

**// ORCHESTRATOR** — единственный tool со стороны Vapi. MCP-сервер раздаёт семь конкретных операций.

![Orchestrator workflow: MCP server trigger анонсирует семь tool sub-workflows, сгруппированных в Scanning tools (client_lookup, check_availability, event_lookup) и Action tools (create_client, book_event, update_event, delete_event)](/docs/voice-agent/orchestrator.png)

- `MCP_server_trigger` — точка входа для Vapi-tool'а `n8n_orchestrator`. Анонсирует семь sub-workflows через MCP-протокол; LLM Sophie выбирает один по форме аргументов
- **Scanning tools** (только чтение): `client_lookup`, `check_availability`, `event_lookup`
- **Action tools** (мутирующие): `create_client`, `book_event`, `update_event`, `delete_event`

**// CLIENT_LOOKUP** — репрезентативный scanning tool. Поиск клиента по email или телефону, возврат CRM-записи + `customer_id` (UUID).

![Client_lookup workflow: switch routes по тому, какой input не пустой (email или phone_number); каждая ветка запускает Postgres executeQuery против customers, затем IF-нода решает, существует ли запись. Email-ветка возвращает client_found или new_client_message; phone-ветка нормализует номер сначала и возвращает client_found или no_number_message](/docs/voice-agent/client_lookup.png)

- `triggered_by` — вызывается из orchestrator через MCP `toolWorkflow` ноду
- `switch` — режим Rules, маршрутизирует по тому, какой input не пустой: `email`, `phone_number` или запасная ветка ошибки (если ни одно из двух)
- Email-ветка: `search_by_email` (Postgres `executeQuery`) → `email_exists?` (IF) → `client_found` или `new_client_message`
- Phone-ветка: `normalize_phone` (`executeWorkflow` → `shared_phone_normalize` для приведения к E.164) → `search_by_phone` → `phone_exists?` → `client_found` или `no_number_message`
- `validation_error` — fallback, когда ни email, ни phone не предоставлены; инструктирует Sophie запросить любое из двух

**// BOOK_EVENT** — репрезентативный action tool. Идемпотентный: повторный запрос на booking возвращает существующий `appointment_id`, новое событие не создаётся.

![Book_event workflow: validate_input проверяет обязательные поля, затем check_existing опрашивает Google Calendar на наличие подходящего слота в окне start_time…start_time+5min. check_duplicate анализирует результат, is_duplicate? ветвит по факту дубликата — true возвращает существующую встречу через return_existing, false идёт через create_event (создание события в GCal), find_customer (Postgres lookup customer_id по email) и upsert_record (Postgres upsert appointments ON CONFLICT gcal_event_id, status scheduled)](/docs/voice-agent/book_event.png)

- `validate_input` — IF-gate на обязательные поля (`start_time`, `end_time`, `email`, `client_name`, `service_type`, `address`)
- `check_existing` — GCal `getAll` в окне от `start_time` до `start_time + 5 min`, где email звонящего фигурирует в списке участников события (`attendees`)
- `check_duplicate` + `is_duplicate?` — анализ совпадения + IF-ветка
- Дубликат найден: `return_existing` возвращает существующий `appointment_id`, новое событие не создаётся (idempotency)
- Дубликата нет: `create_event` (GCal create) → `find_customer` (Postgres lookup `customer_id` по email) → `upsert_record` (Postgres `upsert` в `appointments` с ключом конфликта `gcal_event_id` и статусом `scheduled`; `ON CONFLICT DO UPDATE` означает: если строка с таким `gcal_event_id` уже есть, она обновляется, а не вставляется заново — это базовый механизм идемпотентности)
- `error_message` / `validation_error` — общие error-sinks; возвращают error-instruction для Sophie

**// END_OF_CALL** — запускается после завершения каждого Vapi-звонка. Сохраняет звонок, пишет consent audit, инициирует архивацию записи.

![End_of_call workflow: webhook принимает Vapi end-of-call POST, find_customer ищет звонящего в Postgres, extract_call_data парсит payload, create_record делает upsert в calls (ON CONFLICT vapi_call_id), verify_persisted проверяет что строка имеет id и vapi_call_id, fetch_assistant_first_message HTTP-GET'ит live-disclosure из Vapi, record_consent делает upsert в consent_log audit-строку, respond_ok возвращает 200 в Vapi, trigger_archive_recording fire-and-forget запускает archive_recording sub-workflow](/docs/voice-agent/end_of_call.png)

- `end_of_call` — Vapi webhook (`POST`), аутентификация через Header Auth Bearer; отклоняется на HTTP-уровне при отсутствии или несовпадении заголовка
- `find_customer` — Postgres `executeQuery` против `customers` по `customer.number` (E.164)
- `extract_call_data` — Code-нода парсит transcript, агрегаты tool-вызовов, costs и структурированный output `analysisPlan` (сопоставление выполняется по именам полей, сконфигурированным в Vapi-dashboard)
- `create_record` — Postgres `upsert` в `calls`, ON CONFLICT `(vapi_call_id)` — идемпотентно на retries
- `verify_persisted` — Code-нода проверяет, что вставленная строка имеет и `id`, и `vapi_call_id`; иначе throw, чтобы Vapi сделал retry
- `fetch_assistant_first_message` — HTTP GET `/assistant/{id}` на Vapi (Bearer-аутентификация), чтобы `consent_log.disclosure_text` отражал именно то, что было произнесено
- `record_consent` — Postgres `upsert` в `consent_log`, ON CONFLICT `(vapi_call_id, consent_type)` — TCPA / wiretap audit-строка
- `respond_ok` — 200 в Vapi
- `trigger_archive_recording` — fire-and-forget `executeWorkflow` в `archive_recording`

**// ARCHIVE_RECORDING** — internal helper, идёт в режиме fire-and-forget из `end_of_call`.

![Archive_recording workflow: triggered_by — это executeWorkflow entry от end_of_call, has_recording_url? IF проверяет, дал ли Vapi URL, check_already_archived опрашивает Postgres на recording_archived_at, already_archived? IF ветвит по результату. Путь архивации запускает http_get_audio (скачать mp3 из Vapi), http_put_storage (загрузить в Supabase Storage с x-upsert true) и update_calls (Postgres executeQuery, обновить recording metadata)](/docs/voice-agent/archive_recording.png)

- `has_recording_url?` — guard: пропустить, если Vapi не вернул `recording_url`
- `check_already_archived` — Postgres `executeQuery` на существующий `recording_archived_at`
- `already_archived?` — guard: пропустить, если уже сделано (идемпотентно на retries)
- `http_get_audio` — HTTP GET `.mp3` из Vapi `recording_url`
- `http_put_storage` — HTTP PUT в Supabase Storage bucket `recordings` с заголовком `x-upsert: true` (идемпотентно)
- `update_calls` — Postgres `executeQuery`, записывает `recording_storage_path` / `recording_size_bytes` / `recording_archived_at`

### // KEY PATTERNS {#key-patterns}

Архитектура выше описывает «что делает каждый workflow». Этот раздел — про «почему именно так»: архитектурные решения, не очевидные из списка нод. Решения, обоснованные в ADR, ведут на полный документ; operational и compliance паттерны без отдельного ADR описаны прямо здесь.

- **Один MCP-orchestrator вместо нескольких отдельных Vapi-tools.** Регистрировать каждую backend-операцию как отдельный Vapi-tool означало бы держать семь записей с собственными credentials, server URL, заголовками и JSON-схемами. Каждая такая запись расширяет поверхность утечки токенов (Vapi management API возвращает `server.headers` дословно) и добавляет к контексту LLM на каждой реплике. Вместо этого один Vapi-tool типа `mcp` указывает на n8n workflow `orchestrator`, а описания семи sub-tools раздаются динамически через MCP discovery при подключении. Добавить восьмую операцию — это одна `toolWorkflow`-нода в n8n: без правок на стороне Vapi, без ротации credentials, без дублирования схем. [ADR-002](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/002-mcp-orchestrator-single-tool.md).

- **Идемпотентность по идентификаторам внешних систем + защитный partial UNIQUE.** Суть простыми словами: Vapi и Google Calendar — внешние системы, и каждое реальное событие у них имеет свой устойчивый идентификатор. Vapi назначает один `vapi_call_id` на каждый звонок; Google Calendar даёт один `gcal_event_id` на каждое созданное событие. Эти идентификаторы используются как ключ конфликта при `upsert`'е в Postgres: если та же запись приходит повторно (Vapi ретраит `end-of-call-report` на non-2xx ответы, LLM Sophie иногда дважды вызывает `book_event` на подтверждении), она схлопывается в существующую строку через ON CONFLICT DO UPDATE — дубль не возникает. Использовать собственный UUID-primary-key как ключ было бы бесполезно: каждый ретрай сгенерирует новый UUID, конфликта не будет. Второй слой защиты — partial UNIQUE-индекс на `(customer_id, start_time) WHERE status IN ('scheduled', 'rescheduled')`. «Partial» здесь значит, что индекс действует только на строки с активным статусом — две одновременных брони одного клиента на одно время схлопнутся через UNIQUE-violation, а после отмены или завершения встречи слот снова освобождается. [ADR-003](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/003-idempotency-via-upsert-on-vendor-ids.md).

- **Comma-safe записи в Postgres через `upsert`, не `executeQuery`.** Postgres-нода n8n в режиме `executeQuery` делает буквальное разделение по запятой на итоговой строке `queryReplacement` после template-резолва — значение, содержащее запятую (адрес типа `123 Main St, Apt 5`, имя типа `Smith, John`, целый transcript), превращается в два параметра, а остальная часть значения молча выбрасывается. Все multi-column записи идут через операцию `upsert` с явными выражениями на каждую колонку — каждое значение уходит как отдельный bound-параметр. `executeQuery` зарезервирован под SELECT / UPDATE с гарантированно comma-free значениями (один email, UUID, timestamp). [ADR-005](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/005-comma-safe-postgres-upsert.md).

- **Error-instruction contract + единый централизованный handler.** Sub-workflows падают двумя семантически разными способами: validation failure (recoverable, попросить заново) и runtime failure (не восстановить в этом звонке). Бросать исключения в Vapi означало бы, что Sophie рассуждает над stack trace и может выдать наружу внутренние детали; возвращать сырой error JSON — тот же риск; silent retry создаёт долгое молчание в realtime-звонке. Вместо этого каждый sub-workflow возвращает одну и ту же форму при сбое: `{ "error": true, "instruction": "<точная фраза для Sophie>" }`. Validation-инструкции конструктивны («попросите email»); runtime-инструкции — мягкий fallback («извинись и предложи перезвонить»). Реальное исключение (имя workflow, нода-источник, NY-timestamp, первые 500 символов error message, ссылка на execution) уходит в Discord через единый `error_handler` workflow, прописанный как `errorWorkflow` на всех остальных — одно место для тишины, одно для расширения. [ADR-004](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/004-error-instruction-contract.md).

- **Bearer Auth Header на webhook `end_of_call`, не URL-as-secret.** Первоначальная защита — неугадываемый UUID-path, но URL утекает через n8n executions, Vapi assistant config, browser DevTools и любой error alert, в который попадает ссылка на execution. После утечки ротация — это retag пути везде. Фикс — отказ на HTTP-уровне: webhook-нода привязана к Header Auth credential с `Authorization: Bearer <secret>`, и `server.headers` Vapi-ассистента несёт совпадающее значение. Отсутствует или неверен header → 403, никакого execution, никакого Discord-шума. Ротация — два клика (n8n credential + Vapi header), без retag-а пути. [ADR-007](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/007-webhook-auth-bearer-header.md).

- **`customer_id` через контекст Sophie + server-side ownership check на мутациях.** Первоначальный `event_lookup` читал события напрямую из Google Calendar и оставлял LLM фильтровать по email каждого звонящего в `attendees` — prompt-injection-атака могла попросить «все встречи на сегодня» и увидеть чужие бронирования до того, как сработает фильтр. Теперь `client_lookup` / `create_client` возвращают `customer_id` (UUID), system prompt инструктирует Sophie запомнить его, и `event_lookup` требует его как параметр — фильтрация идёт на стороне Postgres по `customer_id = $1 AND status IN ('scheduled', 'rescheduled')`. Та же дисциплина применяется к `update_event` / `delete_event`: Postgres SELECT в `verify_ownership` подтверждает, что `gcal_event_id` принадлежит `customer_id` звонящего, до любых GCal / Postgres-мутаций; при несовпадении возвращается «I couldn't find that appointment under your account. Could you confirm the date and time again?» вместо выполнения мутации. Закрывает impersonation-gap, где звонящий, знающий чужой `gcal_event_id`, мог попросить Sophie его отменить. [ADR-006](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/006-customer-id-chain-via-prompt.md).

- **Предложение перезвонить (callback offer) вместо прямого перевода звонка (live call transfer) на out-of-scope запросах.** Vapi предоставляет `transferCall` с несколькими destinations, но дефолтный инстинкт «передать живому человеку» имеет три проблемы для этого MVP: на принимающей стороне нет живого оператора (GreenScape — вымышленный тестовый кейс), SIP / cold-transfer добавляет 2-5 секунд latency и может молча упасть, warm-transfer требует dual-leg orchestration. Sophie вместо этого предлагает перезвонить на commercial (свыше $25k), operations (billing / complaints / scheduling) или field (on-site) запросах. Звонящий уходит с определённым ожиданием, звонок завершается в `calls.outcome = 'callback_promised'`, согласованный номер живёт в transcript. [ADR-001](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/adrs/001-callback-instead-of-live-transfer.md).

- **AI / recording disclosure в `firstMessage` Vapi с получением в реальном времени для audit-строки.** Первая фраза («This is Sophie, your AI assistant — calls may be recorded for quality and training») покрывает FCC AI-voice ruling и state-законы CIPA / two-party-consent. Положить её в LLM-generated приветствие означало бы (а) лишнюю задержку на одно обращение к LLM при подключении, (б) риск дрейфа на каждой правке prompt'а, (в) отсутствие единого audit-источника «что фактически услышал звонящий». Поле `firstMessage` Vapi идёт прямо в TTS на подключении, без обращения к LLM; system prompt явно говорит Sophie не приветствовать саму себя. На end-of-call нода `fetch_assistant_first_message` делает HTTP GET `/assistant/{id}` к Vapi API, и возвращённый `firstMessage` пишется в `consent_log.disclosure_text` — audit-строка отражает именно то, что было произнесено в этом звонке, даже если поле `firstMessage` позже отредактируют.

- **Вторичная проверка идентичности (последние четыре цифры телефона в карточке клиента).** Изначальный identification-поток доверял только email после первого phone-lookup'а — кто угодно, знающий чужой email, мог получить чужую идентичность. Фикс работает только на ветке, где автоматический phone lookup на старте звонка НЕ нашёл совпадения (phone отсутствует, шаблонизирован или неизвестен), но более поздний email lookup нашёл: Sophie просит подтвердить последние четыре цифры телефона в карточке до того, как принять caller'а как этого CRM-клиента. При несовпадении или отказе она переходит на путь создания новой учётной записи. Backend не меняется — `client_lookup` уже возвращает phone в response-message, сравнение идёт в контексте Sophie по правилу секции Identification for Action в system prompt'е.

- **TTS-friendly prompt-дисциплина: технические форматы только в tool-аргументах.** Sophie произносит числа словами («nine a m to eleven a m», не «9-11 AM»), не использует markdown / списки / символы («всё произносится вслух») и останавливается на середине фразы при перебивании. Даты требуют полного подтверждения день-недели + месяц + день + год до любого booking / reschedule / cancel tool-call'а («So that is Tuesday, May fifth, two thousand twenty-six, correct?») — LLM не может надёжно вывести день недели из строки даты при voice latency. Tool-аргументы при этом используют строгие технические форматы, ожидаемые backend'ом: ISO 8601 timestamps со смещением `America/New_York`, lowercase `@`-emails, E.164 номера телефонов. Двойной контракт — естественная речь звонящему, structured data в tools — обеспечивается секциями Voice & Style Rules и Data Verification Standards system prompt'а.

- **Phone normalization через shared `executeWorkflow` sub-workflow.** И `client_lookup`, и `create_client` нуждаются в E.164 normalization. Дублирование Code-node логики между двумя workflows гарантирует будущий drift: одну починят, другую — нет. 2-node helper `shared_phone_normalize` — `executeWorkflowTrigger` с inputs `(phone_number, default_country)` и одна Code-нода, которая снимает не-digit / не-плюс символы, добавляет `+1` префикс если отсутствует или детектирует уже-`1`-префиксованный 11-значный US-номер, возвращает пустую строку если итоговая длина меньше десяти — вызывается через `executeWorkflow` из обоих peers. DRY без n8n-side библиотеки.

- **CRM hygiene на write-границе.** Все customer-facing данные нормализуются в момент записи, не на чтении: emails приводятся к lowercase до `upsert` (таблица `customers` имеет UNIQUE functional index `LOWER(email) WHERE email IS NOT NULL`, так что `John@X.com` и `john@x.com` схлопываются в одну запись); имена идут в Title Case (через секцию Data Verification Standards system prompt'а, плюс inline Title-Case expression в `book_event.create_event.summary` как вторая линия защиты); телефоны — в E.164 через shared-helper выше; IF-нода `valid_phone?` в `create_client` ловит unresolved Liquid templates — phone, содержащий `{{` (когда `customer.number` Vapi не привязан к реальному значению), очищается в NULL вместо записи как искажённая строка. Email проходит regex-валидацию (`^[^\s@]+@[^\s@]+\.[^\s@]+$`) до upsert'а; промах роутится в error-instruction path.

- **Fire-and-forget архивация записи + идемпотентные guard-проверки.** Суть паттерна: workflow `end_of_call` запускает `archive_recording` и сразу идёт дальше, не дожидаясь его завершения — отсюда и название «fire-and-forget» («запустил и забыл»). Vapi видит успешный 200-ответ ещё до того, как загрузка `.mp3` стартует, потому что аудиофайл может весить несколько мегабайт, и блокировать ответ Vapi на время заливки в Supabase Storage избыточно. Реализуется через `executeWorkflow` с флагом `waitForSubWorkflow: false`. Если `archive_recording` упадёт или Vapi ретраит `end_of_call`, две IF-проверки внутри `archive_recording` (ноды `has_recording_url?` и `already_archived?`, см. workflow [archive_recording](#architecture)) делают повторные запуски идемпотентными: первая пропускает, если Vapi не приложил запись (звонок завершился до старта записи или recording отключён); вторая пропускает, если `recording_archived_at` уже выставлен в строке `calls`. Сам PUT в Supabase Storage использует заголовок `x-upsert: true`, поэтому даже без этих проверок повторный upload перепишет тот же объект, а не упадёт.

- **Drift-проверка structured outputs `analysisPlan` + retry-контракт через `verify_persisted`.** «Drift» здесь — расхождение между схемой, которую workflow ждёт, и схемой, которую Vapi прислал. В workflow `end_of_call` Code-нода `extract_call_data` сопоставляет structured outputs Vapi (`analysisPlan`) с типизированными колонками `outcome`, `appointment_booked`, `call_category`, `customer_sentiment` по сконфигурированным именам. Если в Vapi-dashboard кто-то переименовал Structured Output и совпадений нет вообще, нода выбрасывает явную ошибку «expected vs received» — шумный сбой попадает в Discord, вместо тихих NULL-колонок. Если часть имён совпала, часть нет, пишется warning, работа продолжается с тем, что замаппилось. `try / catch` гарантирует, что даже частичный payload Vapi всё равно создаст строку в `calls`. После upsert'а нода `verify_persisted` проверяет, что в возвращённой строке есть и `id`, и `vapi_call_id`; если чего-то нет, выбрасывается исключение, n8n-webhook возвращает non-2xx, Vapi автоматически ретраит запрос. UNIQUE-constraint на `vapi_call_id` сохраняет ретрай идемпотентным.

- **Слоёные RLS-политики: два независимых слоя на одних таблицах.** RLS (Row Level Security, безопасность на уровне строк) — это политики Postgres, которые ограничивают, какие строки конкретный пользователь может видеть и менять. В проекте на одних и тех же таблицах работают два слоя одновременно. **Слой 1 (demo, миграции 00003 / 00008):** `service_role` имеет полный доступ — этим живёт n8n через Supabase service-role JWT. **Слой 2 (production, миграция 00010):** `SELECT` для `authenticated`-пользователей с custom-JWT-claim `user_role='owner'` — целится в будущий read-only owner-dashboard. Слои аддитивны: добавление production-политик не ограничивает `service_role`, а у `anon` нет политики ни на одной operational-таблице, так что неаутентифицированный доступ отказывается по умолчанию. Claim назван `user_role`, а не `role` намеренно: `auth.jwt()->>'role'` зарезервирован Supabase под Postgres-role (`anon` / `authenticated` / `service_role`), и custom-claim `role` молча не сработал бы. Production-слой сейчас неактивен (нет JWT-hook'а, нет dashboard'а); включение — это hook-config + frontend изменение, миграция не нужна.

- **Удаление персональных данных по GDPR Art.17 с исключением для consent-логов по TCPA.** Термины простыми словами: «GDPR Art.17» — статья 17 General Data Protection Regulation (закон ЕС о защите персональных данных), известная как «право на удаление»: клиент может потребовать стереть все его данные. «Исключение по TCPA» — Telephone Consumer Protection Act (закон США о телефонной защите потребителей) требует хранить согласие на запись звонка минимум четыре года, даже если клиент попросил всё стереть. Технически: plpgsql-функция `anonymize_customer` в схеме `public` (`SECURITY DEFINER`) редактирует PII (Personally Identifiable Information, персональные данные) в таблицах `customers` / `calls` / `appointments`, удаляет соответствующие `.mp3` файлы записей из Supabase Storage и проставляет `customers.anonymized_at` для audit. Право `EXECUTE` отозвано у `PUBLIC` / `anon` / `authenticated` и выдано только `service_role`, так что даже неправильно сконфигурированная будущая dashboard-политика не сможет её вызвать. Функция идемпотентна — повторный вызов возвращает `{status: "already_anonymized"}` без изменений. Таблица `consent_log` намеренно НЕ редактируется: TCPA + FCC implementing rules (47 USC §227) требуют хранить записи о полученном согласии не менее четырёх лет, а GDPR Art.17(3)(b) явно выводит из права на удаление данные, удержание которых требует закон Союза или государства-члена — TCPA это US-аналог такого исключения. Функция возвращает jsonb-summary (`calls_redacted`, `recordings_deleted`, `appointments_redacted`, `consent_log_retained: true`), чтобы вызывающая сторона получила audit-shaped результат без скрейпинга диагностик.

Числовые параметры (версии моделей, retries, recording cap, retention windows) — см. [Limits & Timeouts](#limits-timeouts).

### // LIMITS & TIMEOUTS {#limits-timeouts}

| Параметр | Значение |
|---|---|
| LLM | Claude Haiku 4.5 (`claude-haiku-4-5-20251001`) — TTFT меньше секунды; `maxTokens: 250` на ответ, чтобы держать voice-turns короткими |
| TTS | ElevenLabs Flash v2.5, voice id `g6xIsTj2HwM6VR4iXFCw` — выбран ради низкой latency перед более богатыми voice-моделями |
| STT | Deepgram Flux General English — встроенная end-of-turn detection (определение, что собеседник закончил говорить) заменяет `transcriptionEndpointingPlan` Vapi; `smartEndpointingPlan` выставлен в `Off`, чтобы избежать двойной обработки |
| Booking-блоки | Двухчасовые окна в рабочих часах, Eastern Time (`America/New_York`); забронировать встречу можно минимум за час до её начала; время в прошлом — нельзя |
| Зона обслуживания | Радиус 35 миль вокруг Saint Petersburg, FL — собирается на booking'е, подтверждается operations-командой после (см. [Possible Improvements](#improvements)) |
| Минимум проекта | $500 residential; commercial (свыше $25k) — только callback |
| n8n HTTP retries | `retryOnFail: true` с `waitBetweenTries: 3000 ms` на каждой external-API ноде (Postgres, Google Calendar, Vapi API). Postgres-записи используют `onError: continueErrorOutput`, чтобы failures шли в error-instruction path; чтения — `alwaysOutputData: true`, чтобы пустой результат всё равно прошёл в следующий IF, не уронив ветку |
| Обрезка ошибок в Discord | 500 символов максимум на error message; длиннее — обрезается с суффиксом `... [truncated]`, чтобы держать Discord-webhook payloads компактными |
| Recording cap | 50 MB на файл в Supabase Storage bucket `recordings`; ~3-6 MB на типовой звонок → около 200 звонков до того, как 1 GB общего free-tier лимита потребует cleanup |
| Архивация записи | Fire-and-forget из `end_of_call`; заголовок `x-upsert: true` на Supabase-PUT, так что повторный upload переписывает, а не падает; идемпотентный guard через колонку `recording_archived_at` |
| Retention `consent_log` | Минимум четыре года от `recorded_at` по TCPA + FCC implementing rules (47 USC §227); намеренно сохраняется через GDPR Art.17 erasure (исключение по Art.17(3)(b)) |
| Стоимость eval-прогона | ~$0.10-0.20 на полный прогон (5 chat-mode кейсов × ~10-15 turns на кейс, где один turn = реплика звонящего + ответ Sophie; платим за Haiku 4.5 + Vapi tester AI + LLM judge); manual cadence (один прогон на крупный prompt-edit), не per-commit CI |

### // ERRORS {#errors}

**Server-side.** Каждый workflow проекта прописан в централизованный `error_handler` через настройку `errorWorkflow`. На любой необработанной ошибке handler выбрасывает Discord-сообщение: имя workflow, нода-источник, NY-timestamp, первые 500 символов error message и ссылку на конкретный execution. Postgres-write ноды дополнительно выставляют `onError: continueErrorOutput`, так что временный API-сбой роутится в `error_message` ноду и возвращает Sophie стандартную error-instruction форму, а не пробрасывает исключение и резко не завершает звонок.

**Per-tool error-инструкции.** Sophie произносит эти фразы дословно, когда sub-workflow возвращает `{error: true, instruction: "..."}`.

| Failure | Инструкция, которую произносит Sophie |
|---|---|
| `client_lookup` — ни email, ни phone | "Ask the customer to provide either their email address or phone number so you can look them up." |
| `create_client` — validation | "Ask the customer to spell their full name and provide a valid email address." |
| `create_client` — runtime | "Apologize for the difficulty creating the account. Offer to have someone call the customer back." |
| `book_event` — validation | "Ask the customer to provide their name, email address, and preferred appointment time." |
| `book_event` — runtime | "Apologize for the difficulty booking the appointment. Offer to have someone call the customer back." |
| `check_availability` — runtime | "Apologize for the difficulty checking the schedule. Offer to have someone call the customer back." |
| `event_lookup` — runtime | "Apologize for the difficulty looking up appointments. Offer to have someone call the customer back." |
| `update_event` — ownership mismatch | "I couldn't find that appointment under your account. Could you confirm the date and time again?" |
| `update_event` — runtime | "Apologize for the difficulty updating the appointment. Offer to have someone call the customer back." |
| `delete_event` — ownership mismatch | "I couldn't find that appointment under your account. Could you confirm the date and time again?" |
| `delete_event` — runtime | "Apologize for the difficulty canceling the appointment. Offer to have someone call the customer back." |

**Caller-side fallback'и.** Невнятный input → Sophie просит уточнить до двух раз, затем предлагает callback. Звонящий молчит (не считая молчания во время tool-execution) → «Are you still there?», затем вежливо завершает звонок. Звонящий оспаривает информацию системы → Sophie извиняется и предлагает callback от менеджера, не спорит. Звонящий ошибся номером → вежливое прощание, конец звонка.

### // POSSIBLE IMPROVEMENTS {#improvements}

Возможности в пределах досягаемости, но пока не реализованные — задокументированы здесь, чтобы разрыв между «что платформа в принципе поддерживает» и «что MVP делает сегодня» был явным.

- **Service-area address verification через geocoding.** Сейчас Sophie собирает адрес как есть (как сказал звонящий), operations подтверждает после booking'а. Прежний prompt-driven подход (Sophie читала список городов из KB и судила расстояние по нему) выдавал нестабильные результаты: ложные негативы на адресах внутри радиуса, не перечисленных в KB буквально (Apollo Beach FL — внутри 35-мильного круга, но отсутствовал в KB-перечислении), и ложные срабатывания на двусмысленных city-name'ах («Sun City» — Sun City Center под Tampa или Sun City California в 2 500 миль). Production-fix: dedicated n8n sub-workflow `verify_address_in_service_area`, который вызывает Google Maps Distance Matrix API с адресом property и HQ бизнеса, возвращает boolean `in_radius` по 35-мильному порогу.
- **HMAC-подпись на webhook `end_of_call`.** Текущий Bearer Auth header статичен и может быть отправлен повторно — перехваченный запрос играет в replay-атаке. Industry-standard фикс — заголовок `X-Vapi-Signature` с HMAC payload + timestamp, валидируется server-side. Vapi пока не публикует точный формат `X-Vapi-Signature` — имя заголовка, payload-для-подписи, separator, hex vs base64; community-threads подтверждают эпизодические missing-header баги. Внедрение ждёт spec'а от Vapi или эмпирического reverse-engineering.
- **Редакция executions-data в n8n.** Bearer-header захватывается в `body.headers.authorization` каждого сохранённого execution'а `end_of_call`. Виден любому, у кого есть доступ к n8n (single user — owner — в текущей настройке). Enterprise-tier тоггл «Redact production execution data» в n8n решил бы это; community edition — нет. Вернуться на production-deploy через `EXECUTIONS_DATA_SAVE_ON_SUCCESS=none` или per-workflow тоггл «do not save».
- **Автоматизация outbound callback.** Callback-предложение Sophie — пока словесное обещание; никто фактически не перезванивает автоматически. Приемлемо для MVP без реальной клиентской базы; production требует workflow, который потребляет `calls.outcome = 'callback_promised'` + согласованный phone из transcript, ставит задачу в систему соответствующей команды и применяет SLA per category (commercial / operations / field).
- **Owner-dashboard + signed-URL playback для записей.** Production-RLS слой (миграция 00010) на месте, но неактивен до того, как поедут два куска: (а) Supabase Auth Custom Access Token Hook, инжектирующий `user_role='owner'` в JWT, и (б) read-only owner-dashboard frontend, который аутентифицируется и зовёт PostgREST. Recording playback должен идти через Supabase Edge Function, выпускающую short-lived signed URL через service_role key — owner'ы никогда не получают bucket key напрямую.
- **Очистка колонки `vapi_metadata`.** Колонка `calls.vapi_metadata` jsonb хранит полный raw payload Vapi как backup на ранней фазе проекта — полезно для отладки schema-drift в `analysisPlan` outputs. Когда схема стабилизируется, колонку нужно дропнуть — её никто не запрашивает, а строка раздувается.
- **Миграция `archive_recording.update_calls` на `upsert`.** Текущая нода использует `executeQuery` с тремя comma-joined параметрами (`vapi_call_id`, file-size integer, `vapi_call_id` снова). Все значения сейчас comma-free, но паттерн нарушает дисциплину ADR-005; follow-up должен перенести на операцию `upsert` или на параметризацию `$1` / `$2` / `$3`.
- **Per-assistant аутентификация при multi-assistant.** Текущий Bearer-секрет общий для всех ассистентов, которые могут попасть на n8n endpoint `end_of_call`. Если второй voice-assistant привяжется к тому же n8n-instance, оба будут делить один Bearer. Per-assistant split означает credential на ассистента плюс маленький router выше по потоку, перед `end_of_call`.
- **Voice-mode тесты в `eval/`.** Текущая suite идёт в chat-mode — text-only, без затрат на реальный звонок. TTS-произношение чисел, STT-устойчивость под акцентами, latency / interruption handling не покрываются. Voice-mode стоит $0.20-0.50 на кейс и тестирует platform-specific rendering, не prompt-logic. Сейчас Vapi-ассистент, n8n-проект и Supabase-проект используются для разработки напрямую — отдельного staging-окружения нет, поэтому voice-тесты писали бы в ту же таблицу `calls`, что и продовые звонки, и съели бы минуты на боевом ассистенте. Добавится, когда появится изолированный staging-стек.
- **Mutating happy-path тесты.** Тест успешного booking'а создал бы реальное событие в Google Calendar и строки в Postgres, причём автоматическая очистка GCal пока не прописана. Поэтому такие тесты не запускаются — продовый календарь засорится. Будет безопасно, когда появится staging-стек (отдельный Vapi-ассистент + отдельный n8n-проект + отдельный Supabase-проект), не пересекающийся с продом.
- **CI gating для evals.** Нет интеграции с GitHub Actions — каждый прогон бьёт production Vapi + n8n + Supabase, а отсутствие staging-окружения делает per-PR auto-прогоны затратными и шумными. Manual cadence (один прогон на крупный prompt-edit) достаточен на этой стадии.

### // TEST DATA & EVALUATION

Vapi-ассистент проходит regression-проверку через chat-mode test-suite, хостящийся на Vapi ([projects/voice-agent/eval/](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/eval/)). Пять smoke-сценариев целят в load-bearing prompt-правила; каждый запускает тестового AI-собеседника, который ведёт диалог с Sophie в chat-mode, а LLM-as-judge оценивает transcript по binary PASS / FAIL рубрике.

| ID | Asserts |
|---|---|
| **CS-1** | *Always collect email first* — Sophie не вызывает booking-tools до того, как email получен и подтверждён |
| **CS-2** | *ALWAYS call `search_knowledge_base` before answering pricing* — Sophie обращается в KB до того, как назвать цифры; цитируемые цифры совпадают с KB-диапазонами |
| **CS-3** | *For ambiguous service-area queries, offer callback* — Sophie проверяет KB для Naples FL, отвечает честно (вне зоны обслуживания), не начинает booking |
| **CS-4** | *Emergency routing* — на tree/storm emergency Sophie выдаёт emergency-phone (727-555-0173, press 2) и завершает звонок без входа в booking-flow |
| **CS-5** | *Out-of-scope commercial handoff* — Sophie идентифицирует $50k office-park запрос как commercial, упоминает commercial-команду, предлагает callback с contact-confirmation gate |

**Последний прогон:** 2026-05-07, **5 / 5 PASS** после доработки трёх поведений, выявленных в первом прогоне (сохранение точки в email-адресе; gate, требующий собрать contact info до предложения callback; повторение emergency-phone в финальной реплике). Источник suite'а: [suite-definition.json](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/eval/suite-definition.json), runner: [run-suite.ps1](https://github.com/nikitak-dev/nikitak-dev.github.io/blob/main/projects/voice-agent/eval/run-suite.ps1). Vapi анонсировал deprecation Test Suites в пользу Simulations — определения сценариев переезжают, скрипты будут портироваться когда Vapi опубликует migration guide.

Будущее расширение: voice-mode тесты на устойчивость TTS / STT, mutating happy-path тесты против staging-окружения, CI gating per pull request — всё заблокировано на staging Vapi + изолированный n8n + изолированный Supabase setup. См. [Possible Improvements](#improvements).
