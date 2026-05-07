# voice-agent — database (Supabase)

Postgres 17 на Supabase. Заменяет старую схему Airtable (`customers` / `appointment_logs` / `call_logs`). Цель — фиксировать все ценные сигналы из Vapi `end-of-call-report` payload + закладывать hooks для будущего production (RLS, retention, audit).

- **Project:** `voice_agent` (id `<supabase-project-id>`, region `eu-west-1`)
- **Stack:** Postgres + Storage bucket `recordings` + RLS
- **Plan source-of-truth:** `~/.claude/plans/voice-agent-joyful-oasis.md`

## ER-диаграмма

```
customers (1) ──< calls (N)
   │                │
   │                └──< appointments (N) ──> Google Calendar event_id
   │                          │
   └────────────────────< appointments (N)
   │                          │
   │                          └─→ rescheduled_from_id ─→ appointments (self-FK, аудит истории)
   │
   ├──< consent_log (N)         (TCPA / wiretap-law audit trail; ON DELETE SET NULL)
   │
calls (1) ──< consent_log (N)   (one row per (vapi_call_id, consent_type))

storage://recordings/{vapi_call_id}.mp3 ←─ calls.recording_storage_path
```

Четыре таблицы в `public` schema + private bucket `recordings` в Supabase Storage.

## Таблицы

### `customers` — мастер-данные клиентов

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | uuid | PK, gen_random_uuid() |
| `vapi_customer_number` | text UNIQUE | E.164 от Vapi `customer.number` — основной lookup-ключ |
| `email` | text | UNIQUE через functional index `LOWER(email)` (case-insensitive) |
| `full_name` | text | GIN+pg_trgm index — fuzzy search ("Jhon" найдёт "John") |
| `phone_number` | text | Может отличаться от `vapi_customer_number` (клиент дал другой) |
| `language` | text DEFAULT 'en' | future multi-language hook |
| `consent_recording` | boolean DEFAULT false | TCPA hook (production) |
| `consent_marketing` | boolean DEFAULT false | marketing opt-in hook |
| `notes` | text | свободные заметки |
| `anonymized_at` | timestamptz | non-NULL → строка прошла GDPR Art. 17 erasure через `anonymize_customer()`; PII в этой и связанных таблицах редактирована, MP3 удалены, `consent_log` сохранён по TCPA-retention (00011) |
| `anonymized_reason` | text | свободный код причины (`gdpr_erasure_request` по умолчанию) — для audit trail |
| `created_at`, `updated_at` | timestamptz | `updated_at` обновляется триггером |

### `calls` — звонки + аналитика + transcript

35 колонок, разбиты по группам:

- **Identity:** `id`, `vapi_call_id` (UNIQUE NOT NULL — dedup ключ для idempotency `end_of_call`), `customer_id` FK, `assistant_id`, `direction`, `phone_number`
- **Timing:** `started_at`, `ended_at`, `duration_sec`, `end_reason`, `status` (`in-progress`/`completed`/`failed`/`voicemail`)
- **analysisPlan outputs (Vapi):** `outcome`, `summary`, `appointment_booked`, `call_category`, `customer_sentiment`
- **Transcript:** `transcript_messages` (jsonb, native Vapi `artifact.messages`), `transcript_text` (plain), `transcript_text_tsv` (GENERATED tsvector + GIN — full-text search), `transcript_lang_detected`
- **Tool calls (агрегаты):** `tool_calls_count`, `tool_calls_summary` (jsonb `{tool_name: count}`)
- **Recording:** `recording_url` (Vapi-side, может expire), `recording_storage_path`, `recording_duration_sec`, `recording_size_bytes`, `recording_archived_at`
- **Cost & latency:** `cost_total_usd` numeric(10,4), `cost_breakdown` jsonb, `latency_avg_ms`, `latency_p95_ms`
- **Tags:** `tags text[]` — свободная классификация ("VIP", "follow-up", "complex"), GIN index
- **Raw backup:** `vapi_metadata` (jsonb с full raw payload — для debugging, удалить в production)
- **Timestamps:** `created_at`, `updated_at`

### `consent_log` — TCPA / wiretap-law audit trail для согласия caller'а

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | uuid | PK |
| `customer_id` | uuid FK | ON DELETE SET NULL — consent-запись переживает удаление клиента (TCPA retention 4 года независимо) |
| `call_id` | uuid FK | ON DELETE SET NULL |
| `vapi_call_id` | text | дублируется здесь (вне FK), чтобы UNIQUE-idempotency на `(vapi_call_id, consent_type)` работала даже если запись `calls` ещё не зафиксирована к моменту upsert'а consent_log (write race) |
| `phone_number` | text NOT NULL | E.164, копия `customer.number` на момент звонка |
| `consent_type` | text | CHECK IN `'recording' / 'marketing' / 'data_processing'` |
| `disclosure_text` | text NOT NULL | **точный текст что был сказан caller'у** — для voice channel pull'ится в реальном времени из Vapi `assistant.firstMessage` API, чтобы аудиторская запись отражала именно то, что caller услышал, независимо от поздних правок prompt'а |
| `disclosure_channel` | text | CHECK IN `'voice_greeting' / 'email_optin' / 'web_form'` |
| `consent_action` | text | CHECK IN `'implicit_continued_call' / 'explicit_yes' / 'explicit_no'`. Для voice — caller услышал disclosure и продолжил звонок → implied consent под CIPA |
| `recorded_at` | timestamptz NOT NULL | DEFAULT `now()` |
| `expires_at` | timestamptz | nullable — recording не expires (один раз дал — до отзыва), marketing-opt-in возможно с sunset |
| `metadata` | jsonb DEFAULT `{}` | расширяемость без миграций |

Idempotency: full UNIQUE на `(vapi_call_id, consent_type)` — Vapi-retry того же end-of-call payload не создаёт дубль. Для строк с `vapi_call_id IS NULL` (будущие email-opt-in / web-form каналы) дубли разрешены, потому что Postgres `NULLS DISTINCT` (default) трактует NULL как уникальное значение в unique-checks. История миграций: изначально был partial WHERE clause (00008), но n8n upsert не передаёт WHERE в `ON CONFLICT` → Postgres ругается → миграция 00009 заменила на full UNIQUE.

Записывается из `end_of_call` workflow после `verify_persisted` (когда уже знаем что `calls.id` создан) и до `respond_ok`. Если запись падает (Vapi API down при fetch'е disclosure_text, или Postgres unreachable) — workflow возвращает 500 → Vapi retries → idempotent на retry.

### `appointments` — встречи (заменяет `appointment_logs` в Airtable)

| Колонка | Тип | Назначение |
|---|---|---|
| `id` | uuid | PK |
| `customer_id` | uuid FK NOT NULL | ON DELETE RESTRICT — нельзя удалить клиента с активной встречей |
| `call_id` | uuid FK | ON DELETE SET NULL — какой звонок забронировал |
| `gcal_event_id` | text UNIQUE NOT NULL | Google Calendar event ID |
| `service_type` | text NOT NULL | "lawn", "tree", и т.д. |
| `address` | text NOT NULL | адрес встречи (не клиента) |
| `start_time`, `end_time` | timestamptz | + CHECK end_time > start_time |
| `status` | text | `scheduled`/`rescheduled`/`canceled`/`completed`/`no-show` |
| `rescheduled_from_id` | uuid self-FK | для аудита истории reschedule |
| `notes` | text | свободные заметки |
| `created_at`, `updated_at` | timestamptz | |

## Naming conventions

- **`vapi_*`** — поля, заполняемые из Vapi payload (`vapi_call_id`, `vapi_customer_number`, `vapi_metadata`)
- **`*_id`** — FK или внешние идентификаторы (`gcal_event_id`)
- **`*_at`** — timestamptz (`created_at`, `updated_at`, `started_at`, `recording_archived_at`)
- **Индексы:** `<table>_<column>_idx`. Уникальные: `<table>_<column>_unique_idx`. GIN: `<table>_<column>_<purpose>_idx` (`transcript_fts_idx`, `full_name_trgm_idx`)

## RLS — текущий режим

Слойная схема: demo policies (00003, 00008) дают полный доступ `service_role`; production policies (00010) добавляют read-only доступ для `authenticated` с custom claim `user_role='owner'`.

- `ENABLE ROW LEVEL SECURITY` на `customers`, `calls`, `appointments`, `consent_log` + `storage.objects` bucket `recordings`
- **`service_role full access`** — n8n работает через `service_role_key` и имеет полный доступ ко всем таблицам и bucket'у
- **`owner_authenticated_read`** (00010) — `SELECT` на 4 таблицы + storage.objects scoped к bucket `recordings`. Политики аддитивные: для `service_role` ничего не меняется
- **anon** не имеет политик → автоматический отказ
- **Owner read inert до двух интеграций:**
  1. Supabase Auth Custom Access Token Hook, инжектирующий `user_role` в JWT ([docs](https://supabase.com/docs/guides/auth/auth-hooks/custom-access-token-hook))
  2. Read-only owner-dashboard (sub-project, scope outside the voice-agent runtime)
- **Recording playback strategy:** owner видит metadata-rows из `storage.objects` (через RLS), но непосредственный download MP3 идёт через Edge Function, которая через `service_role` минтит signed URL — bucket key не передаётся клиенту. Edge Function — open follow-up, не часть 00010.
- **Custom claim назван `user_role`** (не `role`), потому что `auth.jwt()->>'role'` зарезервировано Supabase под Postgres-роль (`anon`/`authenticated`/`service_role`). Закомментированный hook в 00003 использовал `role` и был бы no-op — 00010 это исправляет

## Storage bucket `recordings`

| Параметр | Значение |
|---|---|
| `id` / `name` | `recordings` |
| `public` | false (private — доступ только через signed URLs) |
| `file_size_limit` | 50 MB на файл |
| `allowed_mime_types` | `audio/mpeg`, `audio/mp4`, `audio/wav`, `audio/x-m4a` |
| Naming | `{vapi_call_id}.mp3` (= ключ для join с `calls.recording_storage_path`) |

**Бесплатный tier Supabase:** 1 GB total storage. Один звонок ~3-6 MB → ~200 звонков до лимита. После — manual cleanup oldest recordings (см. [план: Open follow-ups](../../../../C:/Users/Nikita/.claude/plans/voice-agent-joyful-oasis.md)).

## Миграции

**Применяются через MCP Supabase**, не через `supabase` CLI.

Файлы в [`migrations/`](migrations/) — repository-as-source-of-truth для git review. Параметр `name` в `apply_migration` независим от filename — это identifier в Supabase migration tracker.

| Файл | Migration name | Что делает |
|---|---|---|
| [`00001_init_voice_agent_schema.sql`](migrations/00001_init_voice_agent_schema.sql) | `init_voice_agent_schema` | Extensions, 3 таблицы, indexes, `set_updated_at` trigger |
| [`00002_storage_recordings.sql`](migrations/00002_storage_recordings.sql) | `storage_recordings` | Bucket `recordings` (private, 50 MB) |
| [`00003_rls_demo_service_role_only.sql`](migrations/00003_rls_demo_service_role_only.sql) | `rls_demo_service_role_only` | RLS enabled + service_role policies |
| [`00004_security_hardening.sql`](migrations/00004_security_hardening.sql) | `security_hardening` | Fix advisor warnings: `set_updated_at` search_path + `pg_trgm` в schema `extensions` |
| [`00005_index_rescheduled_from.sql`](migrations/00005_index_rescheduled_from.sql) | `index_rescheduled_from` | Partial index на `appointments.rescheduled_from_id` (FK без index) |
| [`00006_rename_success_evaluation_to_appointment_booked.sql`](migrations/00006_rename_success_evaluation_to_appointment_booked.sql) | `rename_success_evaluation_to_appointment_booked` | Rename `calls.success_evaluation` → `appointment_booked` (и индекс) — выравнивание имени с реальной Vapi Structured Output |
| [`00007_unique_active_appointment_per_customer_time.sql`](migrations/00007_unique_active_appointment_per_customer_time.sql) | `unique_active_appointment_per_customer_time` | Partial UNIQUE index на `(customer_id, start_time) WHERE status IN ('scheduled','rescheduled')` — DB-уровень защита от двойного booking, дополняет `book_event` GCal idempotency check |
| [`00008_consent_log.sql`](migrations/00008_consent_log.sql) | `consent_log` | Новая таблица `consent_log` для TCPA / wiretap audit trail. Indexes по customer/phone/recorded_at + partial UNIQUE на `(vapi_call_id, consent_type)`. RLS — `service_role` only. |
| [`00009_consent_log_full_unique.sql`](migrations/00009_consent_log_full_unique.sql) | `consent_log_full_unique` | Drop partial UNIQUE и пересоздание как full UNIQUE на `(vapi_call_id, consent_type)`. Партиальный индекс не работал с `ON CONFLICT (cols) DO UPDATE` который генерирует n8n upsert (Postgres требует `WHERE` clause явно). Эффективное поведение то же — `NULLS DISTINCT` (default) позволяет multiple NULL `vapi_call_id` rows для будущих email-opt-in / web-form каналов. |
| [`00010_rls_production_owner_read.sql`](migrations/00010_rls_production_owner_read.sql) | `rls_production_owner_read` | Production read-only policies для `authenticated` с custom claim `user_role='owner'` на 4 таблицах + storage `recordings` bucket. Аддитивно к demo `service_role` policies — n8n не затронут. Inert до настройки Supabase Custom Access Token Hook + owner-dashboard. Заменяет (правит) закомментированный production-hook из 00003 — там был неработоспособный `auth.jwt()->>'role'` (зарезервированное имя клейма). |
| [`00011_anonymize_customer.sql`](migrations/00011_anonymize_customer.sql) | `anonymize_customer` | GDPR Art. 17 / CCPA right-to-be-forgotten. `customers.anonymized_at`/`anonymized_reason` audit-колонки + функция `anonymize_customer(uuid, text)` (`SECURITY DEFINER`, `service_role` only): редактирует PII в `customers`/`calls`/`appointments`, удаляет MP3 из storage, оставляет `consent_log` нетронутым по TCPA-retention обязательству. Идемпотентна (повторный вызов → `already_anonymized`). |
| [`00012_anonymize_customer_revoke_grants.sql`](migrations/00012_anonymize_customer_revoke_grants.sql) | `anonymize_customer_revoke_public_grants` | Follow-up на 00011: `REVOKE EXECUTE ... FROM anon, authenticated`. Supabase по умолчанию выдаёт EXECUTE этим ролям через PostgREST RPC pipeline; `REVOKE FROM PUBLIC` в 00011 оставлял эту дырку. Закрывает два WARN-level security advisor'а. |

### Как применить миграцию

```ts
mcp__claude_ai_Supabase__apply_migration({
  project_id: '<supabase-project-id>',
  name: 'descriptive_name_in_snake_case',
  query: '<SQL content>'
})
```

Каждый apply записывается в Supabase migration history. Повторный apply того же `name` — no-op (idempotent).

### Как создать новую миграцию

1. Создать файл `migrations/NNNNN_<name>.sql` (counter — для git review ordering)
2. Header-комментарий с purpose + apply-команда
3. Apply через `mcp__claude_ai_Supabase__apply_migration` с тем же содержимым (header SQL-comments тоже норм передавать)
4. Verify через `execute_sql` или `get_advisors`
5. Регенерировать `types/database.ts` если поменялась структура таблиц

## TypeScript-типы

Файл [`types/database.ts`](types/database.ts) — auto-generated через MCP. Для использования:

```ts
import type { Database } from './db/types/database'
import { createClient } from '@supabase/supabase-js'

const supabase = createClient<Database>(URL, KEY)
// supabase.from('calls').select('*') — type-safe
```

### Регенерация после schema-миграций

```ts
// 1. Получить новые типы
mcp__claude_ai_Supabase__generate_typescript_types({ project_id: '<supabase-project-id>' })

// 2. Перезаписать файл (header-комментарий восстановить вручную или скриптом)
Write('projects/voice-agent/db/types/database.ts', <generated content>)
```

## Verification после изменений

```ts
// Security
mcp__claude_ai_Supabase__get_advisors({ project_id: '...', type: 'security' })

// Performance (INFO-level unused_index'ы — нормально для пустых таблиц)
mcp__claude_ai_Supabase__get_advisors({ project_id: '...', type: 'performance' })
```

## Open follow-ups

См. соответствующий раздел в [плане](../../../../C:/Users/Nikita/.claude/plans/voice-agent-joyful-oasis.md). Кратко:

- **ADR в [`adrs/`](../adrs/)** про переход с Airtable на Supabase
- **Owner-dashboard wiring** — Supabase Custom Access Token Hook (инжектирует `user_role` в JWT) + read-only frontend для активации applied policies из 00010
- **Recording playback Edge Function** — `service_role`-минтинг signed URL по `(vapi_call_id, owner_user_id)`, чтобы owner мог слушать записи без передачи bucket key
- **`vapi_metadata` cleanup** — drop колонки после стабилизации схемы и review реального Vapi payload
- **`anonymize_customer` invocation pipeline** — n8n workflow на verified erasure-request (callback / signed letter for identity confirmation) → `SELECT anonymize_customer(customer_id, reason)`. Сама функция готова (00011/00012); workflow и identity-verification UX — отдельный кусок
- **Future таблицы:** `assistants`, `audit_log`
- **Storage cleanup script** — manual или через `pg_cron` когда Storage подходит к 1 GB
