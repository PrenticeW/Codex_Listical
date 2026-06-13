-- Adds per-year overrides for the built-in default chips (Sleep / Rest /
-- Buffer) so a user can rename or recolour them from the Plan-page cell
-- dropdown. Shape: { [defaultId]: { label?: string, color?: string } } where
-- defaultId is one of 'sleep' | 'rest' | 'buffer'. An empty object (the
-- default) means every default chip uses its built-in label and colour.

ALTER TABLE tactics_year_settings
  ADD COLUMN default_chip_overrides JSONB NOT NULL DEFAULT '{}'::jsonb;
