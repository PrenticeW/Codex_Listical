/**
 * Chip editor colour helpers — shared by the Plan page (chip quick-pick menu)
 * and PlanPanel's chip editor view.
 *
 * Palette from the design handover reference/ChipEditorUI.jsx: grouped hue
 * families x 6 shades each, matching the "June palette" spec.
 */

export const CHIP_EDITOR_GROUPS = [
  { label: 'Purples & Pinks', families: [
    { name: 'purple', shades: [[272, 72, 76], [272, 72, 68], [272, 72, 60], [272, 72, 52], [272, 72, 44], [272, 72, 36]] },
    { name: 'plum', shades: [[290, 56, 76], [290, 58, 68], [290, 60, 60], [290, 62, 52], [290, 64, 44], [290, 66, 36]] },
    { name: 'pink', shades: [[326, 72, 76], [326, 72, 68], [326, 72, 60], [326, 72, 52], [326, 72, 44], [326, 72, 36]] },
  ] },
  { label: 'Reds', families: [
    { name: 'rose', shades: [[348, 77, 76], [348, 74, 68], [348, 70, 60], [348, 64, 52], [348, 59, 44], [348, 54, 36]] },
    { name: 'red', shades: [[2, 72, 76], [2, 72, 68], [2, 72, 60], [2, 72, 52], [2, 72, 44], [2, 72, 36]] },
    { name: 'scarlet', shades: [[12, 77, 76], [12, 72, 68], [12, 68, 60], [12, 62, 52], [12, 57, 44], [12, 52, 36]] },
  ] },
  { label: 'Oranges', families: [
    { name: 'tangerine', shades: [[22, 100, 76], [22, 100, 68], [22, 100, 60], [22, 100, 52], [22, 100, 44], [22, 100, 36]] },
    { name: 'orange', shades: [[28, 90, 76], [28, 90, 68], [28, 90, 60], [28, 90, 52], [28, 90, 44], [28, 90, 36]] },
    { name: 'amber', shades: [[36, 80, 76], [36, 80, 68], [36, 80, 60], [36, 80, 52], [36, 80, 44], [36, 80, 36]] },
  ] },
  { label: 'Yellows', families: [
    { name: 'gold', shades: [[54, 85, 76], [54, 85, 68], [54, 85, 60], [54, 85, 52], [54, 85, 44], [54, 85, 36]] },
    { name: 'yellow', shades: [[58, 90, 76], [58, 90, 68], [58, 90, 60], [58, 90, 52], [58, 90, 44], [58, 90, 36]] },
    { name: 'chartreuse', shades: [[62, 85, 76], [62, 85, 68], [62, 85, 60], [62, 85, 52], [62, 85, 44], [62, 85, 36]] },
  ] },
  { label: 'Greens', families: [
    { name: 'lime', shades: [[82, 72, 76], [82, 72, 68], [82, 72, 60], [82, 72, 52], [82, 72, 44], [82, 72, 36]] },
    { name: 'green', shades: [[110, 72, 76], [110, 72, 68], [110, 72, 60], [110, 72, 52], [110, 72, 44], [110, 72, 36]] },
    { name: 'sage', shades: [[155, 34, 76], [155, 42, 68], [155, 50, 60], [155, 58, 52], [155, 66, 44], [155, 74, 36]] },
  ] },
  { label: 'Teals & Aquas', families: [
    { name: 'teal', shades: [[173, 57, 76], [173, 60, 68], [173, 62, 60], [173, 65, 52], [173, 68, 44], [173, 71, 36]] },
    { name: 'aqua', shades: [[188, 34, 76], [188, 42, 68], [188, 50, 60], [188, 58, 52], [188, 66, 44], [188, 74, 36]] },
    { name: 'sky', shades: [[200, 72, 76], [200, 72, 68], [200, 72, 60], [200, 72, 52], [200, 72, 44], [200, 72, 36]] },
  ] },
  { label: 'Blues & Indigos', families: [
    { name: 'blue', shades: [[217, 56, 76], [217, 58, 68], [217, 60, 60], [217, 62, 52], [217, 64, 44], [217, 66, 36]] },
    { name: 'cobalt', shades: [[232, 34, 76], [232, 42, 68], [232, 50, 60], [232, 58, 52], [232, 66, 44], [232, 74, 36]] },
    { name: 'indigo', shades: [[252, 72, 76], [252, 72, 68], [252, 72, 60], [252, 72, 52], [252, 72, 44], [252, 72, 36]] },
  ] },
  { label: 'Neutrals', families: [
    { name: 'neutral', shades: [[0, 0, 100], [0, 0, 96], [0, 0, 72], [0, 0, 44], [0, 0, 25], [0, 0, 6]] },
  ] },
];

export const chipEditorIsActiveShade = (h, s, l, colour) => {
  if (typeof colour !== 'string') return false;
  const match = colour.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/i);
  if (!match) return false;
  return Math.abs(h - Number(match[1])) < 1 && Math.abs(s - Number(match[2])) < 2 && Math.abs(l - Number(match[3])) < 2;
};

// ── "Custom" colour mixer helpers (HSB canvas + hue slider) ──
const chipEditorHexToRgb = (hex) => {
  const match = hex.replace('#', '').match(/^([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  return match ? match.slice(1).map((v) => parseInt(v, 16)) : [0, 0, 0];
};
const chipEditorRgbToHsb = (r, g, b) => {
  const rr = r / 255, gg = g / 255, bb = b / 255;
  const mx = Math.max(rr, gg, bb), mn = Math.min(rr, gg, bb), d = mx - mn;
  let h = 0;
  if (d) {
    if (mx === rr) h = 60 * (((gg - bb) / d) % 6);
    else if (mx === gg) h = 60 * ((bb - rr) / d + 2);
    else h = 60 * ((rr - gg) / d + 4);
  }
  return { h: ((h % 360) + 360) % 360, s: mx ? d / mx : 0, b: mx };
};
const chipEditorHslToHsb = (h, s, l) => {
  const s01 = s / 100;
  const l01 = l / 100;
  const bv = l01 + s01 * Math.min(l01, 1 - l01);
  return { h, s: bv === 0 ? 0 : 2 * (1 - l01 / bv), b: bv };
};
export const chipEditorParseToHsb = (colour) => {
  if (typeof colour !== 'string') return { h: 0, s: 1, b: 1 };
  const hslMatch = colour.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/i);
  if (hslMatch) return chipEditorHslToHsb(Number(hslMatch[1]), Number(hslMatch[2]), Number(hslMatch[3]));
  if (colour.startsWith('#') && colour.length >= 7) {
    const [r, g, b] = chipEditorHexToRgb(colour);
    return chipEditorRgbToHsb(r, g, b);
  }
  return { h: 0, s: 1, b: 1 };
};
export const chipEditorHsbToHex = (h, s, b) => {
  const i = Math.floor(h / 60) % 6;
  const f = h / 60 - Math.floor(h / 60);
  const p = b * (1 - s);
  const q = b * (1 - f * s);
  const t = b * (1 - (1 - f) * s);
  const [r, g, bb] = [[b, t, p], [q, b, p], [p, b, t], [p, q, b], [t, p, b], [b, p, q]][i].map((v) =>
    Math.round(v * 255)
  );
  return '#' + [r, g, bb].map((v) => v.toString(16).padStart(2, '0')).join('');
};

// Pick black/white text for a chip background by relative luminance.
export function chipContrastColour(colour) {
  if (typeof document === 'undefined' || !colour) return '#fff';
  const probe = document.createElement('div');
  probe.style.color = colour;
  document.body.appendChild(probe);
  const match = getComputedStyle(probe).color.match(/\d+/g);
  document.body.removeChild(probe);
  if (!match) return '#fff';
  const [r, g, b] = match.map(Number);
  return (0.299 * r + 0.587 * g + 0.114 * b) > 170 ? '#000' : '#fff';
}
