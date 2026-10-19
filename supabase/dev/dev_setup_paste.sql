-- ============================================================
-- Listical Dev (xhirbsfbquxvdstdgadc) one-time setup
-- Paste this WHOLE file into the SQL editor of the *Listical Dev*
-- project (NOT production) and run it once.
-- Before running: replace YOUR_PROD_DB_PASSWORD below (one place).
-- If you don't know it: production project -> Settings -> Database
-- -> Reset database password.
-- ============================================================

-- ---- Part 1: functions the MCP guard refused (they contain DELETEs) ----

CREATE OR REPLACE FUNCTION public.planning_history_prune() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  HISTORY_RETENTION_DAYS CONSTANT integer := 30;
BEGIN
  DELETE FROM public.planning_history h
  USING (SELECT DISTINCT user_id FROM new_rows) n
  WHERE h.user_id = n.user_id
    AND h.changed_at < now() - make_interval(days => HISTORY_RETENTION_DAYS);
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.prune_planning_history() RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  delete from public.planning_history
  where changed_at < now() - interval '90 days';
  delete from public.planning_history ph
  using (
    select id,
           row_number() over (
             partition by row_id, changed_at::date
             order by changed_at desc
           ) as rn
    from public.planning_history
    where changed_at < now() - interval '30 days'
  ) dup
  where ph.id = dup.id and dup.rn > 1;
$$;

CREATE OR REPLACE FUNCTION public.record_deletion_attempt(target_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  INSERT INTO public.deletion_rate_limits (user_id, attempted_at)
  VALUES (target_user_id, NOW());
  DELETE FROM public.deletion_rate_limits
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.record_export_attempt(target_user_id uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO '' AS $$
BEGIN
  INSERT INTO public.export_rate_limits (user_id, attempted_at)
  VALUES (target_user_id, NOW());
  DELETE FROM public.export_rate_limits
  WHERE attempted_at < NOW() - INTERVAL '24 hours';
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_user_data(target_user_id uuid) RETURNS TABLE(table_name text, rows_deleted bigint) LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  n BIGINT;
BEGIN
  DELETE FROM task_events WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'task_events'; rows_deleted := n; RETURN NEXT;
  DELETE FROM chip_task_notes WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'chip_task_notes'; rows_deleted := n; RETURN NEXT;
  DELETE FROM site_snapshots WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'site_snapshots'; rows_deleted := n; RETURN NEXT;
  DELETE FROM archived_weeks WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'archived_weeks'; rows_deleted := n; RETURN NEXT;
  DELETE FROM tactics_chips WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'tactics_chips'; rows_deleted := n; RETURN NEXT;
  DELETE FROM tactics_custom_projects WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'tactics_custom_projects'; rows_deleted := n; RETURN NEXT;
  DELETE FROM tactics_metrics WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'tactics_metrics'; rows_deleted := n; RETURN NEXT;
  DELETE FROM tactics_year_settings WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'tactics_year_settings'; rows_deleted := n; RETURN NEXT;
  DELETE FROM planner_settings WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'planner_settings'; rows_deleted := n; RETURN NEXT;
  DELETE FROM planning_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'planning_history'; rows_deleted := n; RETURN NEXT;
  DELETE FROM planner_rows WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'planner_rows'; rows_deleted := n; RETURN NEXT;
  DELETE FROM planning_history WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'planning_history'; rows_deleted := n; RETURN NEXT;
  DELETE FROM projects WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'projects'; rows_deleted := n; RETURN NEXT;
  DELETE FROM statuses WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'statuses'; rows_deleted := n; RETURN NEXT;
  DELETE FROM years WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'years'; rows_deleted := n; RETURN NEXT;
  DELETE FROM deletion_rate_limits WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'deletion_rate_limits'; rows_deleted := n; RETURN NEXT;
  DELETE FROM user_keys WHERE user_id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'user_keys'; rows_deleted := n; RETURN NEXT;
  DELETE FROM profiles WHERE id = target_user_id;
  GET DIAGNOSTICS n = ROW_COUNT; table_name := 'profiles'; rows_deleted := n; RETURN NEXT;
  RETURN;
END;
$$;

-- ---- Part 2: copy all data from production, server to server ----

set statement_timeout = '30min';

create extension if not exists postgres_fdw;
create server prod_src foreign data wrapper postgres_fdw
  options (host 'db.hoxwpjxfcrborwufydxl.supabase.co', port '5432', dbname 'postgres');
create user mapping for current_user server prod_src
  options (user 'postgres', password 'YOUR_PROD_DB_PASSWORD');

create schema if not exists prod;
import foreign schema public limit to (profiles, years, projects, planner_rows, archived_weeks, tactics_year_settings, tactics_metrics, tactics_custom_projects, tactics_chips, planner_settings, site_snapshots, task_events, chip_task_notes, planning_history, statuses, user_keys)
  from server prod_src into prod;
create schema if not exists prod_auth;
import foreign schema auth limit to (users, identities) from server prod_src into prod_auth;

-- Drop the two triggers that would fight the copy; recreated below.
drop trigger if exists on_auth_user_created on auth.users;
drop trigger if exists validate_age_on_profile on public.profiles;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, confirmation_token, confirmation_sent_at, recovery_token, recovery_sent_at, email_change_token_new, email_change, email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, phone_change, phone_change_token, phone_change_sent_at, email_change_token_current, email_change_confirm_status, banned_until, reauthentication_token, reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous)
select instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, invited_at, coalesce(confirmation_token,''), confirmation_sent_at, coalesce(recovery_token,''), recovery_sent_at, coalesce(email_change_token_new,''), coalesce(email_change,''), email_change_sent_at, last_sign_in_at, raw_app_meta_data, raw_user_meta_data, is_super_admin, created_at, updated_at, phone, phone_confirmed_at, coalesce(phone_change,''), coalesce(phone_change_token,''), phone_change_sent_at, coalesce(email_change_token_current,''), email_change_confirm_status, banned_until, coalesce(reauthentication_token,''), reauthentication_sent_at, is_sso_user, deleted_at, is_anonymous
from prod_auth.users;

insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id)
select provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at, id
from prod_auth.identities;

-- profiles first without current_year_id (circular FK with years)
insert into public.profiles (id, email, full_name, avatar_url, created_at, updated_at, date_of_birth, deletion_requested_at, deleted_at, current_year_id, theme_family, staging_table_width)
select id, email, full_name, avatar_url, created_at, updated_at, date_of_birth, deletion_requested_at, deleted_at, NULL, theme_family, staging_table_width
from prod.profiles;

insert into public.years (id, user_id, year_number, status, start_date, end_date, total_days, total_weeks_completed, total_hours_completed_minutes, archived_at, created_at, updated_at)
select id, user_id, year_number, status, start_date, end_date, total_days, total_weeks_completed, total_hours_completed_minutes, archived_at, created_at, updated_at
from prod.years;

update public.profiles p set current_year_id = s.current_year_id
from prod.profiles s where s.id = p.id and s.current_year_id is not null;

insert into public.projects (id, user_id, year_id, text, project_name, project_nickname, color, plan_table_visible, plan_table_collapsed, has_plan, added_to_plan, show_outcome_totals, is_simple_table, plan_reason_row_count, plan_outcome_row_count, plan_outcome_question_row_count, plan_needs_question_row_count, plan_needs_plan_row_count, plan_schedule_row_count, plan_subproject_row_count, plan_table_entries, is_archived, display_order, created_at, updated_at, show_action_times, area, system_order, project_tagline, plan_table_entries_enc)
select id, user_id, year_id, text, project_name, project_nickname, color, plan_table_visible, plan_table_collapsed, has_plan, added_to_plan, show_outcome_totals, is_simple_table, plan_reason_row_count, plan_outcome_row_count, plan_outcome_question_row_count, plan_needs_question_row_count, plan_needs_plan_row_count, plan_schedule_row_count, plan_subproject_row_count, plan_table_entries, is_archived, display_order, created_at, updated_at, show_action_times, area, system_order, project_tagline, plan_table_entries_enc
from prod.projects;

-- planner_rows first without parent_row_id (self-FK), then link up
insert into public.planner_rows (id, user_id, year_id, project_id, parent_row_id, row_kind, checkbox, subproject_label, status, task, recurring, estimate, time_value_minutes, day_entries, display_order, created_at, updated_at, notes, task_created_at, completion_count, last_completed_at, day_tag, day_tag_locked, order_key)
select id, user_id, year_id, project_id, NULL, row_kind, checkbox, subproject_label, status, task, recurring, estimate, time_value_minutes, day_entries, display_order, created_at, updated_at, notes, task_created_at, completion_count, last_completed_at, day_tag, day_tag_locked, order_key
from prod.planner_rows;

update public.planner_rows r set parent_row_id = s.parent_row_id
from prod.planner_rows s where s.id = r.id and s.parent_row_id is not null;

insert into public.archived_weeks (id, user_id, year_id, week_number, week_range_label, archived_at, total_minutes, daily_min_minutes, daily_max_minutes, snapshot, created_at, updated_at, snapshot_enc)
select id, user_id, year_id, week_number, week_range_label, archived_at, total_minutes, daily_min_minutes, daily_max_minutes, snapshot, created_at, updated_at, snapshot_enc
from prod.archived_weeks;

insert into public.tactics_year_settings (id, user_id, year_id, start_hour, start_minute, increment_minutes, show_am_pm, use_24_hour, start_day, chip_display_modes, summary_row_order, column_widths, created_at, updated_at, default_chip_overrides, chips_live_version)
select id, user_id, year_id, start_hour, start_minute, increment_minutes, show_am_pm, use_24_hour, start_day, chip_display_modes, summary_row_order, column_widths, created_at, updated_at, default_chip_overrides, chips_live_version
from prod.tactics_year_settings;

insert into public.tactics_metrics (id, user_id, year_id, is_sent, daily_bounds, project_weekly_quotas, weekly_total_available_minutes, weekly_total_working_minutes, sent_at, created_at, updated_at, live_version)
select id, user_id, year_id, is_sent, daily_bounds, project_weekly_quotas, weekly_total_available_minutes, weekly_total_working_minutes, sent_at, created_at, updated_at, live_version
from prod.tactics_metrics;

insert into public.tactics_custom_projects (id, user_id, year_id, external_id, label, color, is_sent, created_at, updated_at)
select id, user_id, year_id, external_id, label, color, is_sent, created_at, updated_at
from prod.tactics_custom_projects;

insert into public.tactics_chips (id, user_id, year_id, is_sent, chip_id, column_index, day_name, start_row_id, end_row_id, start_minutes, project_id_external, display_label, override_minutes, user_modified, created_at, updated_at)
select id, user_id, year_id, is_sent, chip_id, column_index, day_name, start_row_id, end_row_id, start_minutes, project_id_external, display_label, override_minutes, user_modified, created_at, updated_at
from prod.tactics_chips;

insert into public.planner_settings (id, user_id, year_id, size_scale, show_recurring, show_subprojects, show_max_min_rows, sort_statuses, sort_planner_statuses, column_sizing, visible_day_columns, collapsed_groups, send_to_system_at, created_at, updated_at, week_names)
select id, user_id, year_id, size_scale, show_recurring, show_subprojects, show_max_min_rows, sort_statuses, sort_planner_statuses, column_sizing, visible_day_columns, collapsed_groups, send_to_system_at, created_at, updated_at, week_names
from prod.planner_settings;

insert into public.site_snapshots (id, user_id, year_number, goal, plan, system, created_at, goal_enc, plan_enc, system_enc)
select id, user_id, year_number, goal, plan, system, created_at, goal_enc, plan_enc, system_enc
from prod.site_snapshots;

insert into public.task_events (id, task_id, user_id, field, old_value, new_value, note, changed_at)
select id, task_id, user_id, field, old_value, new_value, note, changed_at
from prod.task_events;

insert into public.chip_task_notes (id, user_id, chip_id, note, updated_at)
select id, user_id, chip_id, note, updated_at
from prod.chip_task_notes;

insert into public.planning_history (id, user_id, table_name, row_id, previous_data, operation, changed_at)
select id, user_id, table_name, row_id, previous_data, operation, changed_at
from prod.planning_history;

insert into public.statuses (user_id, id, label, bg, sort_order, archive_sweep, built_in, locked, active, created_at, updated_at)
select user_id, id, label, bg, sort_order, archive_sweep, built_in, locked, active, created_at, updated_at
from prod.statuses;

insert into public.user_keys (user_id, wrapped_dek, key_version, created_at, updated_at)
select user_id, wrapped_dek, key_version, created_at, updated_at
from prod.user_keys;

-- ---- Part 3: restore triggers, add the prune trigger, tidy up ----

create trigger on_auth_user_created after insert on auth.users for each row execute function handle_new_user();
create trigger validate_age_on_profile before insert or update on public.profiles for each row execute function validate_age_requirement();
create trigger trg_planning_history_prune after insert on public.planning_history referencing new table as new_rows for each statement execute function planning_history_prune();

drop schema prod cascade;
drop schema prod_auth cascade;
drop user mapping for current_user server prod_src;
drop server prod_src;

-- ---- Sanity check ----
select 'auth.users' t, count(*) from auth.users
union all select 'profiles', count(*) from public.profiles
union all select 'years', count(*) from public.years
union all select 'projects', count(*) from public.projects
union all select 'planner_rows', count(*) from public.planner_rows
union all select 'archived_weeks', count(*) from public.archived_weeks
union all select 'tactics_chips', count(*) from public.tactics_chips
union all select 'site_snapshots', count(*) from public.site_snapshots
union all select 'task_events', count(*) from public.task_events
union all select 'planning_history', count(*) from public.planning_history
union all select 'user_keys', count(*) from public.user_keys
order by 1;
