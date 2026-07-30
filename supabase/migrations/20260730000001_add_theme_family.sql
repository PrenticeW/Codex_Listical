-- Add per-user colour theme preference.
-- One theme per account, applied to all years (not year-scoped).
-- Value is a palette family name from the 120-swatch PALETTE
-- (src/utils/staging/projectColour.js); validated app-side in
-- src/lib/themeStorage.js. NULL means "default" (blue).

alter table public.profiles
  add column if not exists theme_family text;

comment on column public.profiles.theme_family is
  'Colour theme family name (e.g. blue, sage, rose). NULL = default (blue). See src/lib/theme.js.';
