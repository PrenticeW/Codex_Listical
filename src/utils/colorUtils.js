function parseColourToRGB(color) {
  if (!color || typeof color !== 'string') return { r: 0, g: 0, b: 0 };

  const str = color.trim().toLowerCase();

  const hslMatch = str.match(/hsl\(\s*(\d+\.?\d*)\s*,\s*(\d+\.?\d*)%?\s*,\s*(\d+\.?\d*)%?\s*\)/);
  if (hslMatch) {
    const h = parseFloat(hslMatch[1]) / 360;
    const s = parseFloat(hslMatch[2]) / 100;
    const l = parseFloat(hslMatch[3]) / 100;
    if (s === 0) {
      const val = Math.round(l * 255);
      return { r: val, g: val, b: val };
    }
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
    return {
      r: Math.round(hue2rgb(h + 1 / 3) * 255),
      g: Math.round(hue2rgb(h) * 255),
      b: Math.round(hue2rgb(h - 1 / 3) * 255),
    };
  }

  const hexMatch = str.match(/^#?([0-9a-f]{6})$/);
  if (hexMatch) {
    const c = hexMatch[1];
    return {
      r: parseInt(c.slice(0, 2), 16),
      g: parseInt(c.slice(2, 4), 16),
      b: parseInt(c.slice(4, 6), 16),
    };
  }

  return { r: 0, g: 0, b: 0 };
}

/**
 * Returns '#ffffff' or '#000000' based on perceived brightness.
 * Only genuinely pale colours (whites, creams, light greys) get black text.
 * Accepts hex (#rrggbb) or hsl() strings.
 * @param {string} backgroundColour
 * @returns {'#ffffff'|'#000000'}
 */
export function getContrastTextColor(backgroundColour) {
  if (!backgroundColour) return '#ffffff';
  const rgb = parseColourToRGB(backgroundColour);
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const perceived = 0.299 * r + 0.587 * g + 0.114 * b;
  return perceived > 0.78 ? '#000000' : '#ffffff';
}
