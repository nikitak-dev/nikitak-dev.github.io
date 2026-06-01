-- 00014_transcript_messages_jsonb_to_text.sql
-- Convert calls.transcript_messages from jsonb to text.
--
-- Why this change:
-- n8n Postgres node v2.6 has strict in-node type validation on jsonb
-- columns: it expects a JS object/array literal, then internally serializes
-- arrays as Postgres text[] — which Postgres then rejects against the jsonb
-- column ("column ... is of type jsonb but expression is of type text[]").
-- Wrapping the value in JSON.stringify upstream resolves the Postgres side
-- but trips the in-node validator ("'transcript_messages' expects an object
-- but we got '...'"). There is no exposed UI option to disable the
-- attemptToConvertTypes / strict validator in this n8n build.
--
-- transcript_messages is backup-only — no JSON queries are performed on it
-- (transcript_text and the full-text search index transcript_text_tsv cover
-- the searchable surface). Converting the column to text lets the workflow
-- pass JSON.stringify(messages) cleanly through the same upsert without any
-- node-side validator gymnastics.
--
-- Future revisit: when (and if) n8n exposes the legacy attemptToConvertTypes
-- option in the UI again, we can switch back to jsonb and pass native
-- objects directly — at which point this column becomes jsonb-queryable
-- again.

ALTER TABLE calls
  ALTER COLUMN transcript_messages TYPE text
  USING transcript_messages::text;
