-- System page project block order, shared by the web System page and the
-- Tacular mobile app. Independent of display_order (Goal page priority).
-- NULL = not yet placed on the System page; such projects sort after all
-- placed ones (append semantics), tie-broken by display_order.
-- Written only by stagingStorage.saveSystemOrder (web); read by both apps.

alter table public.projects
  add column if not exists system_order integer;

comment on column public.projects.system_order is
  'System page block order. NULL = unplaced (sorts last). See src/lib/stagingStorage.js saveSystemOrder.';

-- Tacular listens for projects UPDATEs (realtime) to pick up order changes
-- made on the web. planner_rows was added to the publication via the
-- dashboard; do the same for projects here, idempotently.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'projects'
  ) then
    alter publication supabase_realtime add table public.projects;
  end if;
end $$;
