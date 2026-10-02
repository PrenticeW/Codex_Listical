-- Phase 3, projects flip (docs/encryption-plan.md): sibling text column for
-- projects.plan_table_entries (jsonb). Encrypted writes store an enc1:
-- string here and an [] placeholder in the jsonb column; reads prefer the
-- _enc column. Additive and nullable — no behaviour change until the
-- projects write flag is on.
alter table projects add column if not exists plan_table_entries_enc text;
