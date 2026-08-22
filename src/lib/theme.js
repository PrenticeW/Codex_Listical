/**
 * Theme — per-family colour scheme logic.
 *
 * A theme is one palette family's four steps (L68/60/52/44 from the
 * 120-swatch PALETTE) plus a hand-picked contrasting selection colour
 * (SEL map below, approved in the theme sampler — Theme Families.html).
 * Every other surface colour is DERIVED from these five inputs with
 * color-mix() in src/index.css (the --th-* block), so applying a theme
 * is just setting five CSS variables on <html>.
 *
 * Persistence lives in themeStorage.js; this module is pure colour logic
 * with no Supabase or storage dependencies.
 */

import { PALETTE } from '../utils/staging/projectColour';
import { JUNE_GROUPS } from '../constants/palettePickerGroups';

export const DEFAULT_THEME_FAMILY = 'blue';

// ── Theme keys ──────────────────────────────────────────────────────────
// A theme key is either a legacy PALETTE family name ('blue') or any
// picked main colour as a normalised `hsl(h, s%, l%)` string. For a colour
// key the four steps are extrapolated from the picked colour (see
// stepsForColour), so every swatch in the picker is its own theme.

const HSL_RE = /^hsl\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)%\s*,\s*(\d+(?:\.\d+)?)%\s*\)$/i;

export function parseThemeColour(key) {
  if (typeof key !== 'string') return null;
  const m = key.trim().match(HSL_RE);
  if (!m) return null;
  const h = ((Math.round(Number(m[1])) % 360) + 360) % 360;
  return { h, s: Math.round(Number(m[2])), l: Math.round(Number(m[3])) };
}

export const isThemeColour = (key) => parseThemeColour(key) !== null;

/** True for any value the theme engine can apply and persist. */
export function isValidThemeKey(key) {
  return THEME_FAMILIES.includes(key) || isThemeColour(key);
}

const clamp = (n, lo, hi) => Math.min(hi, Math.max(lo, n));

// The picked colour is the main (L60-role) step; the other three are
// lightness offsets from it, matching the palette's 8-point spacing.
function stepsForColour({ h, s, l }) {
  const at = (dl) => ({ h, s, l: clamp(l + dl, 6, 94) });
  return { 68: at(8), 60: at(0), 52: at(-8), 44: at(-16) };
}

// The 30 family names, in palette order. PALETTE stores 'chartr.' with a
// trailing dot; that raw name is what we persist and match on.
export const THEME_FAMILIES = [...new Set(PALETTE.map((p) => p.name))];

// Per-family selection colour (approved, §3 of the theme handoff).
// Values are either a palette family name (use its L52 step; L60 for the
// row-wash base) or a raw hex (orange→gold use electric blue — the
// palette cobalt was too muted).
const SEL_FAMILY = {
  red: 'sage', scarlet: 'sage', crimson: 'sage',
  orange: '#2743F2', tangerine: '#2743F2', amber: '#2743F2', gold: '#2743F2',
  yellow: 'grape', 'chartr.': 'grape', lime: 'grape',
  fern: 'rose', sage: 'rose', green: 'rose', teal: 'rose',
  pine: 'magenta', juniper: 'magenta',
  cyan: 'red', aqua: 'red', sky: 'red',
  cerulean: 'orange', denim: 'orange', blue: 'orange', cobalt: 'orange', indigo: 'orange',
  violet: 'sage', grape: 'sage', plum: 'sage',
  magenta: 'juniper', blush: 'juniper', rose: 'juniper',
};

const hslStr = ({ h, s, l }) => `hsl(${h}, ${s}%, ${l}%)`;

function familyStep(family, l) {
  const colour = parseThemeColour(family);
  if (colour) return stepsForColour(colour)[l] || null;
  return PALETTE.find((p) => p.name === family && p.l === l) || null;
}

// Nearest PALETTE family by hue — used to pick an approved selection
// colour and a display name for an arbitrary picked colour.
function nearestFamilyByHue(h, s) {
  if (s < 8) return DEFAULT_THEME_FAMILY;
  let best = DEFAULT_THEME_FAMILY;
  let bestDist = Infinity;
  for (const entry of PALETTE) {
    if (entry.l !== 52) continue;
    const d = Math.min(Math.abs(entry.h - h), 360 - Math.abs(entry.h - h));
    if (d < bestDist) { bestDist = d; best = entry.name; }
  }
  return best;
}

// The June picker family name a colour key came from, or null if it is
// not a picker swatch.
function juneFamilyFor({ h, s, l }) {
  for (const { families } of JUNE_GROUPS) {
    for (const { name, shades } of families) {
      if (shades.some(([sh, ss, sl]) => sh === h && ss === s && sl === l)) return name;
    }
  }
  return null;
}

const capitalise = (w) => w.charAt(0).toUpperCase() + w.slice(1);

/** Human-readable name for display ("chartr." → "Chartreuse"; colour keys use their picker family name). */
export function familyDisplayName(family) {
  const colour = parseThemeColour(family);
  if (colour) {
    const june = juneFamilyFor(colour);
    if (june) return capitalise(june);
    return familyDisplayName(nearestFamilyByHue(colour.h, colour.s));
  }
  if (family === 'chartr.') return 'Chartreuse';
  return capitalise(family);
}

/** CSS colour for a family step, e.g. themeSwatch('blue', 60). */
export function themeSwatch(family, l = 60) {
  const step = familyStep(family, l);
  return step ? hslStr(step) : null;
}

/**
 * Resolve the five theme input variables for a family.
 * Returns { '--th-68': ..., '--th-60': ..., '--th-52': ..., '--th-44': ...,
 *           '--th-sel': ..., '--th-sel-base': ... } or null for an unknown
 * family.
 */
export function themeVarsForFamily(family) {
  const steps = [68, 60, 52, 44].map((l) => familyStep(family, l));
  if (steps.some((s) => !s)) return null;
  const colour = parseThemeColour(family);
  const selKey = colour ? nearestFamilyByHue(colour.h, colour.s) : family;
  const sel = SEL_FAMILY[selKey] || 'orange';
  const selRing = sel.startsWith('#') ? sel : hslStr(familyStep(sel, 52));
  const selBase = sel.startsWith('#') ? sel : hslStr(familyStep(sel, 60));
  const [s68, s60, , s44] = steps.map(hslStr);
  return {
    '--th-68': hslStr(steps[0]),
    '--th-60': hslStr(steps[1]),
    '--th-52': hslStr(steps[2]),
    '--th-44': hslStr(steps[3]),
    '--th-sel': selRing,
    '--th-sel-base': selBase,
    // Archive Week panel wheel ramp + darkened label ramp. The color-mix
    // recipes reproduce the spec's blue-family hexes (the :root defaults in
    // index.css) when applied to the blue steps, and scale to every other
    // family the same way.
    '--th-wheel-1': s44,
    '--th-wheel-2': s60,
    '--th-wheel-3': `color-mix(in srgb, ${s68} 82%, white)`,
    '--th-wheel-4': `color-mix(in srgb, ${s68} 45%, white)`,
    '--th-wheel-label-1': s44,
    '--th-wheel-label-2': `color-mix(in srgb, ${s44} 60%, ${s60})`,
    '--th-wheel-label-3': `color-mix(in srgb, ${s60} 65%, var(--ink-mute))`,
    '--th-wheel-label-4': `color-mix(in srgb, ${s68} 50%, var(--ink-mute))`,
  };
}

/**
 * Apply a theme family by setting the input variables on <html>.
 * Unknown families fall back to the default (blue). Returns the family
 * actually applied.
 */
export function applyThemeFamily(family) {
  const resolved = themeVarsForFamily(family) ? family : DEFAULT_THEME_FAMILY;
  const vars = themeVarsForFamily(resolved);
  const root = document.documentElement;
  for (const [k, v] of Object.entries(vars)) root.style.setProperty(k, v);
  // Let consumers that bake resolved colours into inline styles
  // (see src/utils/themeBackground.js) know to recompute.
  window.dispatchEvent(new CustomEvent('theme-applied', { detail: { family: resolved } }));
  return resolved;
}

/** Remove runtime overrides, restoring the stylesheet default (blue). */
export function resetThemeFamily() {
  const root = document.documentElement;
  for (const k of [
    '--th-68', '--th-60', '--th-52', '--th-44', '--th-sel', '--th-sel-base',
    '--th-wheel-1', '--th-wheel-2', '--th-wheel-3', '--th-wheel-4',
    '--th-wheel-label-1', '--th-wheel-label-2', '--th-wheel-label-3', '--th-wheel-label-4',
  ]) {
    root.style.removeProperty(k);
  }
}

// ── Colour → family resolution (Theme Picker mock, hexToFamily) ─────────

function cssToRgb(colour) {
  const ctx = document.createElement('canvas').getContext('2d');
  ctx.fillStyle = colour;
  const hex = ctx.fillStyle; // normalised #rrggbb
  if (typeof hex !== 'string' || hex[0] !== '#') return null;
  return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
}

/**
 * Normalise any CSS colour (hex, rgb, hsl) to a theme key — an
 * `hsl(h, s%, l%)` string — so it can be applied and persisted as a
 * main colour. Returns the default family if the colour cannot be parsed.
 */
export function colourToThemeKey(colour) {
  const direct = parseThemeColour(colour);
  if (direct) return hslStr(direct);
  const rgb = cssToRgb(colour);
  if (!rgb) return DEFAULT_THEME_FAMILY;
  const [r, g, b] = rgb.map((v) => v / 255);
  const max = Math.max(r, g, b); const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0; let sat = 0;
  if (max !== min) {
    const d = max - min;
    sat = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    if (max === r) h = ((g - b) / d + (g < b ? 6 : 0));
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
  }
  return hslStr({ h: Math.round(h), s: Math.round(sat * 100), l: Math.round(l * 100) });
}

/**
 * Resolve any CSS colour (hex or hsl string) to a palette family:
 * exact match against the 120 swatches first, else nearest by RGB
 * distance to each family's L52 step.
 */
export function colourToFamily(colour) {
  const target = cssToRgb(colour);
  if (!target) return DEFAULT_THEME_FAMILY;

  // Exact swatch match
  for (const entry of PALETTE) {
    const rgb = cssToRgb(hslStr(entry));
    if (rgb && rgb[0] === target[0] && rgb[1] === target[1] && rgb[2] === target[2]) {
      return entry.name;
    }
  }

  // Nearest family by RGB distance to the L52 step
  let best = DEFAULT_THEME_FAMILY;
  let bestDist = Infinity;
  for (const family of THEME_FAMILIES) {
    const rgb = cssToRgb(themeSwatch(family, 52));
    if (!rgb) continue;
    const d = (rgb[0] - target[0]) ** 2 + (rgb[1] - target[1]) ** 2 + (rgb[2] - target[2]) ** 2;
    if (d < bestDist) { bestDist = d; best = family; }
  }
  return best;
}
