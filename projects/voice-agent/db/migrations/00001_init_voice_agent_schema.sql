-- Migration: 00001_init_voice_agent_schema
-- Apply via: mcp__claude_ai_Supabase__apply_migration(project_id, name='init_voice_agent_schema', query=<this file>)
-- Purpose: initial schema — extensions, customers, calls, appointments, indexes, updated_at trigger.
-- Source of truth: c:\Users\Nikita\.claude\plans\voice-agent-joyful-oasis.md (sub-project A).

-- ============================================================================
-- Extensions
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;  -- gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS pg_trgm;   -- fuzzy search по customers.full_name

-- ============================================================================
-- Table: customers
-- ============================================================================

CREATE TABLE customers (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_customer_number  text UNIQUE,           -- E.164, основной lookup-ключ от Vapi customer.number
  email                 text,                  -- UNIQUE через functional index ниже (case-insensitive)
  full_name             text,
  phone_number          text,                  -- может отличаться от vapi_customer_number если клиент дал другой
  language              text DEFAULT 'en',
  consent_recording     boolean DEFAULT false, -- TCPA hook (production)
  consent_marketing     boolean DEFAULT false, -- marketing opt-in hook
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- UNIQUE INDEX по LOWER(email) — case-insensitive: 'john@x.com' и 'John@X.com' считаются одним.
-- WHERE email IS NOT NULL — partial index, позволяет нескольким customer'ам быть без email.
CREATE UNIQUE INDEX customers_email_lower_unique_idx ON customers (LOWER(email)) WHERE email IS NOT NULL;

CREATE INDEX customers_phone_idx           ON customers (phone_number);
CREATE INDEX customers_vapi_number_idx     ON customers (vapi_customer_number);
-- GIN + pg_trgm: fuzzy search по имени ("Jhon Smith" найдёт "John Smith")
CREATE INDEX customers_full_name_trgm_idx  ON customers USING GIN (full_name gin_trgm_ops);
CREATE INDEX customers_created_at_idx      ON customers (created_at DESC);

-- ============================================================================
-- Table: calls — звонки + аналитика + транскрипт
-- ============================================================================

CREATE TABLE calls (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vapi_call_id             text UNIQUE NOT NULL,  -- основной dedup ключ для end_of_call webhook
  customer_id              uuid REFERENCES customers(id) ON DELETE SET NULL,
  assistant_id             text,                  -- Vapi assistant ID (multi-assistant ready)
  direction                text DEFAULT 'inbound' CHECK (direction IN ('inbound','outbound')),
  phone_number             text,                  -- caller E.164 (денормализовано для быстрых фильтров)

  -- timing
  started_at               timestamptz NOT NULL,
  ended_at                 timestamptz,
  duration_sec             integer,               -- Vapi-side значение
  end_reason               text,                  -- "customer-ended-call", "assistant-error", и т.д.
  status                   text CHECK (status IN ('in-progress','completed','failed','voicemail')),

  -- analysisPlan structured outputs
  outcome                  text,
  summary                  text,
  success_evaluation       boolean,
  call_category            text CHECK (call_category IN ('booking','reschedule','inquiry','cancel','complaint')),
  customer_sentiment       text CHECK (customer_sentiment IN ('positive','neutral','negative')),

  -- transcript
  transcript_messages      jsonb,                 -- native Vapi artifact.messages array
  transcript_text          text,                  -- plain-text concat user+assistant turns
  -- GENERATED column: tsvector автоматически пересчитывается при UPDATE transcript_text
  -- STORED: значение хранится на диске (для GIN-индекса), не вычисляется при каждом SELECT
  transcript_text_tsv      tsvector GENERATED ALWAYS AS (to_tsvector('english', coalesce(transcript_text,''))) STORED,
  transcript_lang_detected text,                  -- "en", "uk", "ru" — Vapi отдаёт detected language

  -- tool calls (агрегаты)
  tool_calls_count         integer NOT NULL DEFAULT 0,
  tool_calls_summary       jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {tool_name: count}

  -- recording
  recording_url            text,                  -- Vapi URL (может expire)
  recording_storage_path   text,                  -- "recordings/{vapi_call_id}.mp3"
  recording_duration_sec   integer,
  recording_size_bytes     integer,               -- мониторинг 1 GB Storage лимита для cleanup-скриптов
  recording_archived_at    timestamptz,

  -- cost & latency
  cost_total_usd           numeric(10,4),         -- до $999999.9999 с точностью до 1/100 цента
  cost_breakdown           jsonb,                 -- {model, transcriber, tts, vapi}
  latency_avg_ms           integer,
  latency_p95_ms           integer,

  -- свободные теги для аналитики ("VIP", "follow-up", "complex")
  tags                     text[] NOT NULL DEFAULT '{}',

  -- raw backup для debugging / reverse-engineering Vapi payload.
  -- PRODUCTION HOOK: удалить эту колонку когда схема стабилизируется.
  vapi_metadata            jsonb,

  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX calls_customer_id_idx        ON calls (customer_id);
CREATE INDEX calls_started_at_idx         ON calls (started_at DESC);
CREATE INDEX calls_call_category_idx      ON calls (call_category);
CREATE INDEX calls_success_eval_idx       ON calls (success_evaluation);
CREATE INDEX calls_phone_idx              ON calls (phone_number);
-- GIN индекс для tsvector — даёт быстрый full-text search через @@ оператор
CREATE INDEX calls_transcript_fts_idx     ON calls USING GIN (transcript_text_tsv);
-- GIN с jsonb_path_ops — оптимизирован под containment-запросы (@>)
CREATE INDEX calls_vapi_metadata_idx      ON calls USING GIN (vapi_metadata jsonb_path_ops);
-- GIN на массив tags — позволяет: SELECT * FROM calls WHERE tags @> ARRAY['VIP']
CREATE INDEX calls_tags_idx               ON calls USING GIN (tags);

-- ============================================================================
-- Table: appointments (заменяет Airtable appointment_logs)
-- ============================================================================

CREATE TABLE appointments (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id           uuid NOT NULL REFERENCES customers(id) ON DELETE RESTRICT,
  call_id               uuid REFERENCES calls(id) ON DELETE SET NULL,  -- какой звонок забронировал
  gcal_event_id         text UNIQUE NOT NULL,
  service_type          text NOT NULL,
  address               text NOT NULL,
  start_time            timestamptz NOT NULL,
  end_time              timestamptz NOT NULL,
  status                text NOT NULL DEFAULT 'scheduled'
                        CHECK (status IN ('scheduled','rescheduled','canceled','completed','no-show')),
  rescheduled_from_id   uuid REFERENCES appointments(id),  -- self-FK, аудит истории reschedule
  notes                 text,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  -- защита от backwards-bookings: end_time всегда после start_time
  CONSTRAINT appointments_time_order_check CHECK (end_time > start_time)
);

CREATE INDEX appointments_customer_idx     ON appointments (customer_id);
CREATE INDEX appointments_call_idx         ON appointments (call_id);
CREATE INDEX appointments_start_time_idx   ON appointments (start_time);
CREATE INDEX appointments_status_idx       ON appointments (status);

-- ============================================================================
-- Trigger: set_updated_at — автоматически обновляет updated_at при UPDATE
-- Альтернатива (DEFAULT now() в колонке) не работает для UPDATE — только для INSERT
-- ============================================================================

CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_set_updated_at    BEFORE UPDATE ON customers
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER calls_set_updated_at        BEFORE UPDATE ON calls
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
CREATE TRIGGER appointments_set_updated_at BEFORE UPDATE ON appointments
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
