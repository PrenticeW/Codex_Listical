/**
 * Current page zoom factor (the `--pz` CSS custom property published by
 * usePageScaleVar). CSS sizes with `calc(Npx * var(--pz))`; JS layout math
 * (portal positioning, fit/flip estimates) multiplies by this instead.
 */
export function getPageZoom() {
  if (typeof document === 'undefined') return 1;
  const raw = getComputedStyle(document.documentElement).getPropertyValue('--pz');
  const parsed = parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 1;
}
