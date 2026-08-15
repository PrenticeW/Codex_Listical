-- Add per-user Goal page table width preference.
-- One width per account, applied to all years (not year-scoped) — same
-- pattern as theme_family. NULL means "full width" (default behaviour:
-- table spans the page minus any open side panel).
-- Value is px, clamped app-side in src/lib/stagingLayoutStorage.js.

alter table public.profiles
  add column if not exists staging_table_width integer;

comment on column public.profiles.staging_table_width is
  'Goal page table width preference in px. NULL = full width. See src/lib/stagingLayoutStorage.js.';
