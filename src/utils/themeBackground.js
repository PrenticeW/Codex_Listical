/**
 * Theme background helpers.
 *
 * The page/nav/panel backgrounds tint their grid lines and corner orbs
 * from the active theme family (--th-60, see src/index.css). Gradient
 * layers can use color-mix() directly via themeTint(); the grid-line SVG
 * data-URL tile cannot reference CSS variables, so gridSvgLayer() resolves
 * the current --th-60 to a concrete rgba() at render time, and
 * useThemeVersion() re-renders consumers when the theme changes
 * (applyThemeFamily dispatches THEME_APPLIED_EVENT).
 */

import { useEffect, useState } from 'react';

export const THEME_APPLIED_EVENT = 'theme-applied';

/** CSS colour: the theme's main step at the given opacity (0–1). */
export const themeTint = (alpha) =>
  `color-mix(in srgb, var(--th-60) ${Math.round(alpha * 100)}%, transparent)`;

// Resolve the current --th-60 custom property to "R,G,B" (via canvas
// normalisation so hsl()/hex both work). Falls back to the blue default.
function resolveTheme60Rgb() {
  try {
    const raw = getComputedStyle(document.documentElement)
      .getPropertyValue('--th-60')
      .trim();
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = raw;
    const hex = ctx.fillStyle;
    if (typeof hex === 'string' && hex[0] === '#' && hex.length === 7) {
      return [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(',');
    }
  } catch {
    /* fall through to default */
  }
  return '90,132,216'; // blue-60 default
}

/**
 * The grid-lines background layer as an SVG tile (survives browser zoom
 * below 100%, unlike 1px gradient hard-stops), tinted with the active
 * theme colour at the given opacity.
 */
export function gridSvgLayer(alpha = 0.15) {
  const stroke = `rgba(${resolveTheme60Rgb()},${alpha})`;
  return `url("data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 width=%2732%27 height=%2732%27%3E%3Cpath d=%27M0 0.5 H32 M0.5 0 V32%27 stroke=%27${encodeURIComponent(stroke)}%27 stroke-width=%271%27/%3E%3C/svg%3E")`;
}

/**
 * Re-render hook: bumps whenever a theme family is applied so inline
 * styles that bake in resolved colours (gridSvgLayer) recompute.
 */
export function useThemeVersion() {
  const [version, setVersion] = useState(0);
  useEffect(() => {
    const bump = () => setVersion((v) => v + 1);
    window.addEventListener(THEME_APPLIED_EVENT, bump);
    return () => window.removeEventListener(THEME_APPLIED_EVENT, bump);
  }, []);
  return version;
}
