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
                              │
                              └─→ rescheduled_from_id ─→ appointments (self-FK, аудит истории)

storage://recordings/{vapi_call_id}.mp3 ←─ calls.recording_storage_path
```

Три таблицы в `public` schema + private bucket `recordings` в Supabase Storage.

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

## RLS — текущий режим (demo)

- `ENABLE ROW LEVEL SECURITY` на всех трёх таблицах + `storage.objects` bucket `recordings`
- Единственная политика: **`service_role full access`** — n8n работает через service_role_key и имеет полный доступ
- **anon и authenticated роли** не имеют политик → автоматический отказ на все операции
- **Production hooks** (закомментированы в [`migrations/00003_rls_demo_service_role_only.sql`](migrations/00003_rls_demo_service_role_only.sql)) — owner-policy через `auth.jwt()->>'role' = 'owner'` для будущего dashboard'а

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
- **Production-ready RLS** — раскомментировать `authenticated owner` policies в `00003_rls_demo_service_role_only.sql`, удалить `vapi_metadata`
- **GDPR `anonymize_customer(customer_id uuid)`** SQL-функция
- **Future таблицы:** `assistants`, `audit_log`, `consent_log`
- **Storage cleanup script** — manual или через `pg_cron` когда Storage подходит к 1 GB
