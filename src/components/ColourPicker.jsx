import React, { useState, useCallback, useRef } from 'react';
import { Pipette, PaintBucket, ChevronLeft, ChevronRight, Check } from 'lucide-react';
import { PALETTE } from '../utils/staging/projectColour';

// ── Palette structure ──────────────────────────────────────────────────────
// 30 hue families sorted by h ascending, split into 3 groups of 10.
// Each family has exactly 4 entries at l:68, 60, 52, 44.
//
// GROUPS[g] = array of 10 families
// GROUPS[g][col] = array of 4 entries sorted l:68→44 (light→dark)
// Rendering: iterate rows 0-3, within each row iterate cols 0-9.

function buildGroups() {
  // Sort the full palette by hue so families are in ascending hue order.
  const sorted = [...PALETTE].sort((a, b) => a.h - b.h);

  // Group into families of 4 (consecutive entries share the same name/hue).
  const families = [];
  for (let i = 0; i < sorted.length; i += 4) {
    const family = sorted.slice(i, i + 4);
    // Guarantee row order: l:68 (top) → l:44 (bottom)
    family.sort((a, b) => b.l - a.l);
    families.push(family);
  }

  // Split 30 families into 3 groups of 10
  return [
    families.slice(0, 10),
    families.slice(10, 20),
    families.slice(20, 30),
  ];
}

const GROUPS = buildGroups();
const ROWS = 4; // lightness steps per family

// ── Neutrals (slide 3) ─────────────────────────────────────────────────────
// Local only — not part of the shared PALETTE constant.
const NEUTRALS = [
  { name: 'white',      h: 0,   s: 0,  l: 100 },
  { name: 'white warm', h: 35,  s: 20, l: 97  },
  { name: 'silver',     h: 0,   s: 0,  l: 88  },
  { name: 'lt grey',    h: 0,   s: 0,  l: 78  },
  { name: 'grey',       h: 0,   s: 0,  l: 62  },
  { name: 'mid grey',   h: 0,   s: 0,  l: 50  },
  { name: 'dk grey',    h: 0,   s: 0,  l: 38  },
  { name: 'charcoal',   h: 0,   s: 0,  l: 22  },
  { name: 'near black', h: 0,   s: 0,  l: 12  },
  { name: 'black',      h: 0,   s: 0,  l: 4   },
  { name: 'cream',      h: 40,  s: 60, l: 95  },
  { name: 'beige',      h: 35,  s: 30, l: 88  },
  { name: 'sand',       h: 38,  s: 35, l: 78  },
  { name: 'tan',        h: 35,  s: 30, l: 65  },
  { name: 'camel',      h: 33,  s: 35, l: 52  },
  { name: 'brown',      h: 25,  s: 40, l: 35  },
  { name: 'dk brown',   h: 22,  s: 45, l: 22  },
  { name: 'warm grey',  h: 35,  s: 8,  l: 72  },
  { name: 'warm mid',   h: 35,  s: 8,  l: 50  },
  { name: 'warm dark',  h: 35,  s: 8,  l: 30  },
  { name: 'ice',        h: 210, s: 30, l: 97  },
  { name: 'lt slate',   h: 215, s: 18, l: 82  },
  { name: 'slate',      h: 215, s: 16, l: 68  },
  { name: 'mid slate',  h: 215, s: 14, l: 55  },
  { name: 'steel',      h: 215, s: 14, l: 42  },
  { name: 'dk slate',   h: 218, s: 18, l: 30  },
  { name: 'navy grey',  h: 220, s: 20, l: 20  },
  { name: 'blue black', h: 222, s: 25, l: 12  },
  { name: 'ink',        h: 225, s: 30, l: 6   },
  { name: 'blush mist', h: 340, s: 18, l: 88  },
  { name: 'dusty rose', h: 340, s: 18, l: 72  },
  { name: 'mauve',      h: 300, s: 12, l: 62  },
  { name: 'lavender',   h: 265, s: 18, l: 78  },
  { name: 'periwinkle', h: 240, s: 18, l: 72  },
  { name: 'sage mist',  h: 140, s: 14, l: 72  },
  { name: 'mint mist',  h: 160, s: 16, l: 78  },
  { name: 'duck egg',   h: 185, s: 18, l: 78  },
  { name: 'straw',      h: 48,  s: 30, l: 82  },
  { name: 'peach',      h: 20,  s: 35, l: 82  },
  { name: 'warm stone', h: 30,  s: 12, l: 58  },
];

// Flat 40-cell array for the neutrals grid (10 cols × 4 rows).
// A null at position 29 acts as the empty placeholder in row 2 col 9,
// shifting the tinted near-neutrals (originally indices 29–39) to row 3.
// Total: 9 cool-grey entries + 1 null + 10 tinted entries = 41 — one too many.
// Solution: drop warm stone (last entry) so row 3 has exactly 10 entries,
// giving 40 cells total across 4 rows of 10.
//
// Layout:
//   row 0 (cols 0–9):  white … black
//   row 1 (cols 0–9):  cream … warm dark
//   row 2 (cols 0–8):  ice … ink  |  col 9: empty
//   row 3 (cols 0–9):  blush mist … warm stone
const NEUTRALS_FLAT = [
  ...NEUTRALS.slice(0, 20),         // rows 0–1: 20 entries
  ...NEUTRALS.slice(20, 29),        // row 2 cols 0–8: 9 entries
  null,                              // row 2 col 9: empty placeholder
  ...NEUTRALS.slice(29, 39),        // row 3: 10 entries (blush mist … warm stone)
];

function hslStr(entry) {
  return `hsl(${entry.h}, ${entry.s}%, ${entry.l}%)`;
}

function parseHsl(value) {
  if (!value) return null;
  const m = value.match(/hsl\(\s*([\d.]+)[,\s]+([\d.]+)%?[,\s]+([\d.]+)%?\s*\)/i);
  if (!m) return null;
  return { h: parseFloat(m[1]), s: parseFloat(m[2]), l: parseFloat(m[3]) };
}

function isActiveEntry(entry, value) {
  const parsed = parseHsl(value);
  if (!parsed) return false;
  return (
    Math.abs(entry.h - parsed.h) < 1 &&
    Math.abs(entry.s - parsed.s) < 2 &&
    Math.abs(entry.l - parsed.l) < 2
  );
}

const EYEDROPPER_SUPPORTED =
  typeof window !== 'undefined' && 'EyeDropper' in window;

// ── Component ──────────────────────────────────────────────────────────────

/**
 * ColourPicker
 *
 * Props:
 *   value       {string}    Current colour (HSL string or hex).
 *   onChange    {Function}  Called with new colour string on selection.
 *   defaultOpen {boolean}   If true, palette starts expanded (default false).
 */
export default function ColourPicker({ value, onChange, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const [slide, setSlide] = useState(0); // 0 | 1 | 2 | 3
  const [customValue, setCustomValue] = useState(value || '#c9daf8');
  const customInputRef = useRef(null);

  // ── Swatch ────────────────────────────────────────────────────────────
  const handleSwatch = useCallback(
    (entry) => {
      onChange(hslStr(entry));
    },
    [onChange]
  );

  // ── Eyedropper ────────────────────────────────────────────────────────
  const handleEyedropper = useCallback(async () => {
    if (!EYEDROPPER_SUPPORTED) return;
    try {
      // eslint-disable-next-line no-undef
      const eyeDropper = new EyeDropper();
      const result = await eyeDropper.open();
      onChange(result.sRGBHex);
    } catch {
      // User cancelled — silently ignore
    }
  }, [onChange]);

  // ── Custom colour ─────────────────────────────────────────────────────
  const handleCustomChange = useCallback((e) => {
    setCustomValue(e.target.value);
  }, []);

  const handleCustomCommit = useCallback(
    (e) => {
      onChange(e.target.value);
    },
    [onChange]
  );

  // ── Preview rectangle colour ──────────────────────────────────────────
  const previewBg = value || '#c9daf8';

  const currentGroup = slide < 3 ? GROUPS[slide] : null;

  return (
    <div className="space-y-1">
      {/* ── Collapsed preview ─────────────────────────────────────── */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full rounded border border-[#ced3d0] focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
        style={{ backgroundColor: previewBg, height: '2.25rem' }}
        aria-expanded={open}
      />

      {/* ── Expanded picker ───────────────────────────────────────── */}
      {open && (
        <div className="space-y-2 pt-1">
          {/* Carousel row: arrow | grid | arrow */}
          <div className="flex items-center gap-1">
            {/* Left arrow */}
            <button
              type="button"
              onClick={() => setSlide((s) => Math.max(0, s - 1))}
              disabled={slide === 0}
              className="shrink-0 rounded border border-[#ced3d0] bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-25 focus:outline-none"
              aria-label="Previous colours"
            >
              <ChevronLeft size={16} />
            </button>

            {/* Swatch grid — 10 columns × 4 rows */}
            {/* Iterate ROW-first so CSS grid auto-placement is correct:
                row 0 = l:68 across all 10 hue families,
                row 1 = l:60, etc. */}
            <div
              className="flex-1 grid"
              style={{ gridTemplateColumns: 'repeat(10, 1fr)', gap: '2px' }}
            >
              {slide < 3
                ? Array.from({ length: ROWS }, (_, rowIdx) =>
                    currentGroup.map((family, colIdx) => {
                      const entry = family[rowIdx];
                      const active = isActiveEntry(entry, value);
                      const bg = hslStr(entry);
                      return (
                        <button
                          key={`${slide}-${colIdx}-${rowIdx}`}
                          type="button"
                          title={`${entry.name} l:${entry.l}`}
                          onClick={() => handleSwatch(entry)}
                          className="relative rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                          style={{
                            backgroundColor: bg,
                            width: '100%',
                            aspectRatio: '1',
                          }}
                        >
                          {active && (
                            <span className="absolute inset-0 flex items-center justify-center" aria-label="selected">
                              <span
                                className="block rounded-sm"
                                style={{
                                  width: '55%',
                                  height: '55%',
                                  border: '2px solid rgba(255,255,255,0.9)',
                                  boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                                }}
                              />
                            </span>
                          )}
                        </button>
                      );
                    })
                  )
                : NEUTRALS_FLAT.map((entry, idx) => {
                    if (entry === null) {
                      return (
                        <div
                          key="neutral-empty"
                          style={{ width: '100%', aspectRatio: '1' }}
                        />
                      );
                    }
                    const active = isActiveEntry(entry, value);
                    const bg = hslStr(entry);
                    const paleBorder = idx < 2
                      ? { border: '0.5px solid #ccc' }
                      : {};
                    return (
                      <button
                        key={`neutral-${idx}`}
                        type="button"
                        title={`${entry.name} l:${entry.l}`}
                        onClick={() => handleSwatch(entry)}
                        className="relative rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-white"
                        style={{
                          backgroundColor: bg,
                          width: '100%',
                          aspectRatio: '1',
                          ...paleBorder,
                        }}
                      >
                        {active && (
                          <span className="absolute inset-0 flex items-center justify-center" aria-label="selected">
                            <span
                              className="block rounded-sm"
                              style={{
                                width: '55%',
                                height: '55%',
                                border: '2px solid rgba(255,255,255,0.9)',
                                boxShadow: '0 0 0 1px rgba(0,0,0,0.25)',
                              }}
                            />
                          </span>
                        )}
                      </button>
                    );
                  })
              }
            </div>

            {/* Right arrow */}
            <button
              type="button"
              onClick={() => setSlide((s) => Math.min(3, s + 1))}
              disabled={slide === 3}
              className="shrink-0 rounded border border-[#ced3d0] bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-25 focus:outline-none"
              aria-label="Next colours"
            >
              <ChevronRight size={16} />
            </button>
          </div>

          {/* ── Toolbar: Pipette + PaintBucket + Confirm ───────────── */}
          <div className="flex items-center justify-center gap-3">
            {EYEDROPPER_SUPPORTED && (
              <button
                type="button"
                onClick={handleEyedropper}
                className="rounded p-1 text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
                aria-label="Pick from screen"
              >
                <Pipette size={20} />
              </button>
            )}
            <button
              type="button"
              onClick={() => customInputRef.current?.click()}
              className="rounded p-1 text-slate-500 hover:text-slate-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Custom colour"
            >
              <PaintBucket size={20} />
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded border border-[#ced3d0] bg-white p-1 text-slate-600 shadow-sm hover:bg-slate-50 hover:text-slate-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400"
              aria-label="Confirm colour"
            >
              <Check size={20} />
            </button>
          </div>

          {/* ── Hidden custom colour input (opened directly by PaintBucket) ── */}
          <input
            ref={customInputRef}
            type="color"
            className="sr-only"
            value={customValue}
            onChange={handleCustomChange}
            onBlur={handleCustomCommit}
          />
        </div>
      )}
    </div>
  );
}
