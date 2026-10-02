-- Phase 3 (docs/encryption-plan.md): sibling text columns for the jsonb
-- content fields. Encrypted writes store an enc1: string here and a {}
-- placeholder in the NOT NULL jsonb column; reads prefer the _enc column.
-- Additive and nullable — no behaviour change until the write flag is on.
alter table archived_weeks add column if not exists snapshot_enc text;
alter table site_snapshots add column if not exists goal_enc text;
alter table site_snapshots add column if not exists plan_enc text;
alter table site_snapshots add column if not exists system_enc text;
