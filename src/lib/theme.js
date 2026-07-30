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

export const DEFAULT_THEME_FAMILY = 'blue';

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
  return PALETTE.find((p) => p.name === family && p.l === l) || null;
}

/** Human-readable family name for display ("chartr." → "Chartreuse"). */
export function familyDisplayName(family) {
  if (family === 'chartr.') return 'Chartreuse';
  return family.charAt(0).toUpperCase() + family.slice(1);
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
  const sel = SEL_FAMILY[family] || 'orange';
  const selRing = sel.startsWith('#') ? sel : hslStr(familyStep(sel, 52));
  const selBase = sel.startsWith('#') ? sel : hslStr(familyStep(sel, 60));
  return {
    '--th-68': hslStr(steps[0]),
    '--th-60': hslStr(steps[1]),
    '--th-52': hslStr(steps[2]),
    '--th-44': hslStr(steps[3]),
    '--th-sel': selRing,
    '--th-sel-base': selBase,
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
  for (const k of ['--th-68', '--th-60', '--th-52', '--th-44', '--th-sel', '--th-sel-base']) {
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
