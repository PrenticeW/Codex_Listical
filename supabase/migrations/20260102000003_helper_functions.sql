-- Function to create a new profile when a user signs up
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Function to get or create current active year for a user
CREATE OR REPLACE FUNCTION public.get_or_create_current_year(p_user_id UUID)
RETURNS UUID AS $$
DECLARE
  v_year_id UUID;
  v_max_year_number INTEGER;
BEGIN
  -- Try to get active year
  SELECT id INTO v_year_id
  FROM years
  WHERE user_id = p_user_id AND status = 'active'
  LIMIT 1;

  -- If no active year exists, create one
  IF v_year_id IS NULL THEN
    -- Get max year number or start at 1
    SELECT COALESCE(MAX(year_number), 0) INTO v_max_year_number
    FROM years
    WHERE user_id = p_user_id;

    -- Create new year
    INSERT INTO years (user_id, year_number, status, start_date)
    VALUES (p_user_id, v_max_year_number + 1, 'active', CURRENT_DATE)
    RETURNING id INTO v_year_id;
  END IF;

  RETURN v_year_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to archive a year
CREATE OR REPLACE FUNCTION public.archive_year(p_year_id UUID, p_user_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_year_exists BOOLEAN;
BEGIN
  -- Check if year exists and belongs to user
  SELECT EXISTS(
    SELECT 1 FROM years
    WHERE id = p_year_id AND user_id = p_user_id AND status = 'active'
  ) INTO v_year_exists;

  IF NOT v_year_exists THEN
    RETURN FALSE;
  END IF;

  -- Archive the year
  UPDATE years
  SET status = 'archived',
      end_date = CURRENT_DATE,
      archived_at = NOW()
  WHERE id = p_year_id;

  -- Archive all projects in this year
  UPDATE projects
  SET is_archived = TRUE
  WHERE year_id = p_year_id;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to get year statistics
CREATE OR REPLACE FUNCTION public.get_year_stats(p_year_id UUID, p_user_id UUID)
RETURNS TABLE(
  total_projects INTEGER,
  active_projects INTEGER,
  archived_projects INTEGER,
  total_tasks INTEGER,
  completed_tasks INTEGER,
  total_hours DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT p.id)::INTEGER as total_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_archived = FALSE)::INTEGER as active_projects,
    COUNT(DISTINCT p.id) FILTER (WHERE p.is_archived = TRUE)::INTEGER as archived_projects,
    COUNT(DISTINCT pr.id)::INTEGER as total_tasks,
    COUNT(DISTINCT pr.id) FILTER (WHERE pr.status = 'Done')::INTEGER as completed_tasks,
    COALESCE(SUM(pr.archive_total_hours), 0) as total_hours
  FROM years y
  LEFT JOIN projects p ON p.year_id = y.id
  LEFT JOIN planner_rows pr ON pr.year_id = y.id
  WHERE y.id = p_year_id AND y.user_id = p_user_id
  GROUP BY y.id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to duplicate planner row with all day entries
CREATE OR REPLACE FUNCTION public.duplicate_planner_row(
  p_row_id UUID,
  p_user_id UUID,
  p_new_row_id TEXT
)
RETURNS UUID AS $$
DECLARE
  v_new_id UUID;
BEGIN
  -- Duplicate the planner row
  INSERT INTO planner_rows (
    user_id, year_id, row_id, row_type, group_id, parent_group_id,
    project_name, project_nickname, subproject_label, row_num, checkbox,
    project, subproject, status, task, recurring, estimate, time_value,
    display_order
  )
  SELECT
    user_id, year_id, p_new_row_id, row_type, group_id, parent_group_id,
    project_name, project_nickname, subproject_label, row_num, checkbox,
    project, subproject, status, task, recurring, estimate, time_value,
    display_order
  FROM planner_rows
  WHERE id = p_row_id AND user_id = p_user_id
  RETURNING id INTO v_new_id;

  -- Duplicate all day entries
  INSERT INTO day_entries (planner_row_id, day_index, value)
  SELECT v_new_id, day_index, value
  FROM day_entries
  WHERE planner_row_id = p_row_id;

  RETURN v_new_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function to bulk update day entries for a row
CREATE OR REPLACE FUNCTION public.update_day_entries(
  p_row_id UUID,
  p_user_id UUID,
  p_entries JSONB
)
RETURNS BOOLEAN AS $$
DECLARE
  v_entry JSONB;
  v_day_index INTEGER;
  v_value TEXT;
BEGIN
  -- Verify row ownership
  IF NOT EXISTS (
    SELECT 1 FROM planner_rows
    WHERE id = p_row_id AND user_id = p_user_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Delete existing entries
  DELETE FROM day_entries WHERE planner_row_id = p_row_id;

  -- Insert new entries from JSONB array
  FOR v_entry IN SELECT * FROM jsonb_array_elements(p_entries)
  LOOP
    v_day_index := (v_entry->>'day_index')::INTEGER;
    v_value := v_entry->>'value';

    IF v_value IS NOT NULL AND v_value != '' THEN
      INSERT INTO day_entries (planner_row_id, day_index, value)
      VALUES (p_row_id, v_day_index, v_value);
    END IF;
  END LOOP;

  RETURN TRUE;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
