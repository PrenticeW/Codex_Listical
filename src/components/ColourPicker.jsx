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
  const [slide, setSlide] = useState(0); // 0 | 1 | 2
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

  const currentGroup = GROUPS[slide];

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
              {Array.from({ length: ROWS }, (_, rowIdx) =>
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
              )}
            </div>

            {/* Right arrow */}
            <button
              type="button"
              onClick={() => setSlide((s) => Math.min(2, s + 1))}
              disabled={slide === 2}
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
