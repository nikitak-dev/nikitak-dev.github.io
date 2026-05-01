-- Migration: 00005_index_rescheduled_from
-- Apply via: mcp__claude_ai_Supabase__apply_migration(project_id, name='index_rescheduled_from', query=<this file>)
-- Purpose: устранить performance warning unindexed_foreign_keys.
-- FK appointments.rescheduled_from_id ссылается на appointments.id, но без покрывающего индекса
-- такие запросы сканируют всю таблицу: "найти все встречи, которые были перенесены из этой".
-- Index ускоряет JOIN'ы по этому FK + cascade ON UPDATE поведение, если оно появится.

CREATE INDEX appointments_rescheduled_from_idx
  ON appointments (rescheduled_from_id)
  WHERE rescheduled_from_id IS NOT NULL;  -- partial: большинство встреч не перенесены
