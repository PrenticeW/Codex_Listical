/**
 * Parses a hex or hsl() color string into [r, g, b] in 0–1 range.
 * Returns null if the format is unrecognised.
 */
function parseToRGB(color) {
  if (!color || typeof color !== 'string') return null;

  // hex: #rrggbb or rrggbb
  const hexMatch = color.match(/^#?([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const c = hexMatch[1];
    return [
      parseInt(c.slice(0, 2), 16) / 255,
      parseInt(c.slice(2, 4), 16) / 255,
      parseInt(c.slice(4, 6), 16) / 255,
    ];
  }

  // hsl(h, s%, l%) or hsl(h s% l%)
  const hslMatch = color.match(/hsl\(\s*([\d.]+)\s*[,\s]\s*([\d.]+)%\s*[,\s]\s*([\d.]+)%\s*\)/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;

    if (s === 0) return [l, l, l];

    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [hue2rgb(h + 1 / 3), hue2rgb(h), hue2rgb(h - 1 / 3)];
  }

  return null;
}

/**
 * Returns '#000000' or '#ffffff' — whichever has the higher contrast ratio
 * against the given background color (WCAG relative luminance formula).
 * Accepts hex (#rrggbb) or hsl(h, s%, l%) strings.
 * @param {string} color
 * @returns {'#000000'|'#ffffff'}
 */
export function getContrastTextColor(color) {
  const rgb = parseToRGB(color);
  if (!rgb) return '#ffffff';

  const toLinear = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const L = 0.2126 * toLinear(rgb[0]) + 0.7152 * toLinear(rgb[1]) + 0.0722 * toLinear(rgb[2]);

  const contrastWithWhite = 1.05 / (L + 0.05);
  const contrastWithBlack = (L + 0.05) / 0.05;

  return contrastWithWhite >= contrastWithBlack ? '#ffffff' : '#000000';
}
