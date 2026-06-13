/**
 * PlanPanel
 *
 * Page-level action panel for the Plan page, opened by the list icon in
 * NavigationBar. Fixed right-side overlay, 320 px wide.
 *
 * Three views on a horizontal sliding track (640 px wide):
 *   - Main view   — display toggles + schedule link (no chip selected)
 *                   OR chip detail sections (chip selected)
 *   - Colour view — palette picker for custom-chip colour editing
 *   - Schedule view — unscheduled items grouped by project
 *
 * Views that accept data:
 *   PLAN_PANEL_CHIP_EVENT  — fired by TacticsPage when chip selection changes
 *   PLAN_PANEL_STATE_EVENT — fired by TacticsPage when undo/redo state changes
 *
 * Actions dispatched back to TacticsPage via PLAN_PANEL_ACTION_EVENT.
 */

import React, { useState, useEffect, useCallback, useRef, useMemo, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { usePlanPanel } from '../contexts/PlanPanelContext';
import usePageSize from '../hooks/usePageSize';
import { parseEstimateLabelToMinutes } from '../utils/staging/planTableHelpers';

// ─── Public event constants ────────────────────────────────────────────────────

// Action event — consumed by TacticsPage
export const PLAN_PANEL_ACTION_EVENT = 'plan-panel-action';
// State event — fired by TacticsPage when undo/redo availability changes
export const PLAN_PANEL_STATE_EVENT = 'plan-panel-state';
// Chip selection event — fired by TacticsPage when selected chip changes
// detail: { chip: ChipData | null }
// ChipData shape: { id, type ('project'|'custom'|'default'), name, colour,
//                   projectId?, goalName?, goalColour?,
//                   startMinutes, endMinutes, durationMinutes,
//                   showClock, showDuration }
export const PLAN_PANEL_CHIP_EVENT = 'plan-panel-chip';
// Schedule data event — fired by TacticsPage to push schedule data into ScheduleView
// detail: { projects, scheduleLayout, projectChips, chipTimeOverrides, incrementMinutes, rowMetrics, onDragStart, onAddChip }
export const PLAN_PANEL_SCHEDULE_DATA_EVENT = 'plan-panel-schedule-data';
// Navigation event — fired by TacticsPage to trigger view transitions inside the panel
// detail: { view: 'schedule' | 'main' }
export const PLAN_PANEL_NAV_EVENT = 'plan-panel-nav';

function dispatchPlanAction(action, payload = {}) {
  window.dispatchEvent(new CustomEvent(PLAN_PANEL_ACTION_EVENT, { detail: { action, ...payload } }));
}

// ─── Design tokens ─────────────────────────────────────────────────────────────

const C = {
  bg:          '#fff',
  bgBlock:     '#f7f7f5',
  border:      '#e8e8e4',
  borderLight: '#f0f0ed',
  text:        '#1a1a1a',
  textMed:     '#444',
  textDim:     '#555',
  textFaint:   '#999',
  textLight:   '#bbb',
  green:       '#1a7a5c',
  greenDark:   '#1a5c3a',
  greenBg:     '#edf5f0',
  greenBorder: '#a8d4be',
  danger:      '#c0392b',
  dangerBg:    '#fef2f2',
  dangerBorder:'#fca5a5',
  blue:        '#33558a',
  blueBg:      '#e8eef7',
  blueBgHover: '#dce6f4',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SECTION = {
  borderBottom: `1px solid ${C.borderLight}`,
  padding: '20px 22px',
  flexShrink: 0,
  background: C.bg,
};

// ─── Schedule view constants ──────────────────────────────────────────────────

const DEFAULT_ROW_HEIGHT_PX = 16;

// ─── Shared micro-components ──────────────────────────────────────────────────

/** Auto-shrinks text to fit a single line within its container */
function FitText({ text, maxFontSize = 14, minFontSize = 7 }) {
  const spanRef = useRef(null);
  const [fontSize, setFontSize] = useState(maxFontSize);

  useLayoutEffect(() => {
    const el = spanRef.current;
    if (!el) return;
    let size = maxFontSize;
    el.style.fontSize = `${size}px`;
    while (el.scrollWidth > el.offsetWidth && size > minFontSize) {
      size = Math.max(minFontSize, size - 0.5);
      el.style.fontSize = `${size}px`;
    }
    setFontSize(size);
  });

  return (
    <span
      ref={spanRef}
      style={{
        display: 'block', width: '100%', overflow: 'hidden',
        whiteSpace: 'nowrap', fontSize: `${fontSize}px`,
      }}
    >
      {text}
    </span>
  );
}

function SectionLabel({ children, style }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textLight, marginBottom: 14,
      ...style,
    }}>
      {children}
    </div>
  );
}

/** Full-width action button with left-aligned content and optional right chevron */
function ActionBtn({ icon, label, onClick, style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: `1px solid ${hovered ? C.green : C.border}`,
        borderRadius: 10, padding: '11px 14px',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: hovered ? C.green : C.textDim,
        cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'border-color 0.15s, color 0.15s',
        ...style,
      }}
    >
      <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
        <path d="M1 1l5 4.5L1 10" stroke={hovered ? C.green : '#ccc'} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </button>
  );
}

/** Toggle button — full width, left-aligned, optional on state */
function ToggleBtn({ icon, label, on, onClick, style }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', gap: 6,
        background: on ? C.greenBg : 'none',
        border: `1px solid ${on ? C.greenBorder : (hovered ? C.green : C.border)}`,
        borderRadius: 10, padding: '10px 14px',
        fontFamily: FONT, fontSize: 13, fontWeight: on ? 500 : 400,
        color: on ? C.greenDark : (hovered ? C.green : C.textDim),
        cursor: 'pointer', width: '100%',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        ...style,
      }}
    >
      {icon}
      {label}
    </button>
  );
}

/** Row: label on left, control on right */
function FieldRow({ label, control, style }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      marginBottom: 8, ...style,
    }}>
      <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim, whiteSpace: 'nowrap' }}>
        {label}
      </span>
      {control}
    </div>
  );
}

/** Text input used for name / duration fields */
function FieldInput({ value, onChange, style, ...rest }) {
  return (
    <input
      value={value}
      onChange={onChange}
      style={{
        width: 160, height: 28, boxSizing: 'border-box', flexShrink: 0,
        border: `1px solid ${C.border}`, borderRadius: 8, padding: '0 10px',
        fontFamily: FONT, fontSize: 12, fontWeight: 600,
        textTransform: 'uppercase', color: C.text, outline: 'none', textAlign: 'center',
        transition: 'border-color 0.15s',
        ...style,
      }}
      onFocus={e => { e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.boxShadow = '0 0 0 2px rgba(0,0,0,0.06)'; }}
      onBlur={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.boxShadow = 'none'; }}
      {...rest}
    />
  );
}

/** Time trigger button — styled like a chip, opens time picker */
function TimeTrigger({ value, onClick }) {
  const [hovered, setHovered] = useState(false);
  const chevron = (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
      <path d="M1 1l3 3 3-3" stroke="#999" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  );
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 160, height: 28, boxSizing: 'border-box', flexShrink: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
        background: hovered ? C.border : C.bgBlock,
        border: `1px solid ${hovered ? '#d4d4ce' : C.border}`,
        borderRadius: 8, padding: '0 11px',
        fontFamily: FONT, fontSize: 13, fontWeight: 500, color: C.text,
        cursor: 'pointer', userSelect: 'none', transition: 'border-color 0.15s, background 0.15s',
      }}
    >
      <span>{value}</span>
      {chevron}
    </button>
  );
}

/** Horizontal divider */
function Divider({ style }) {
  return <hr style={{ border: 'none', borderTop: `1px solid ${C.borderLight}`, margin: '14px 0', ...style }} />;
}

// ─── Pair of equal-width buttons side by side ─────────────────────────────────

function ButtonPair({ left, right }) {
  return (
    <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
      {[left, right].map((btn, i) => (
        <Btn key={i} {...btn} />
      ))}
    </div>
  );
}

function Btn({ icon, label, disabled, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
        background: 'none', border: `1px solid ${hovered && !disabled ? C.green : C.border}`,
        borderRadius: 10, padding: '10px 14px',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: disabled ? C.textFaint : (hovered ? C.green : C.textDim),
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        transition: 'border-color 0.15s, color 0.15s',
      }}
    >
      {icon}
      {label}
    </button>
  );
}

// ─── Stepper row ──────────────────────────────────────────────────────────────

function StepperRow({ icon, label, value, onDecrease, onIncrease, decreaseDisabled, increaseDisabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '8px 14px',
    }}>
      <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <StepBtn onClick={onDecrease} disabled={decreaseDisabled}>−</StepBtn>
        <span style={{
          minWidth: 34, textAlign: 'center', fontSize: 13, fontWeight: 500, color: C.text,
          borderLeft: `1px solid ${C.border}`, borderRight: `1px solid ${C.border}`,
          lineHeight: '28px',
        }}>
          {value}
        </span>
        <StepBtn onClick={onIncrease} disabled={increaseDisabled}>+</StepBtn>
      </div>
    </div>
  );
}

function StepBtn({ onClick, disabled, children }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18, fontWeight: 300, color: disabled ? C.textFaint : (hovered ? C.text : C.textDim),
        background: hovered && !disabled ? C.borderLight : '#fafaf8',
        border: 'none', transition: 'background 0.1s, color 0.1s',
        padding: 0, lineHeight: 1, fontFamily: FONT,
      }}
    >
      {children}
    </button>
  );
}

// ─── SVG icons ────────────────────────────────────────────────────────────────

const ICON = {
  clock: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
    </svg>
  ),
  timer: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <line x1="10" y1="2" x2="14" y2="2"/><line x1="12" y1="14" x2="15" y2="11"/><circle cx="12" cy="14" r="8"/>
    </svg>
  ),
  calendar: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
    </svg>
  ),
  trash: (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/>
    </svg>
  ),
  undo: (
    <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
      <path d="M2 6.5a4.5 4.5 0 114.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M2 4v2.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  redo: (
    <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
      <path d="M11 6.5a4.5 4.5 0 10-4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
      <path d="M11 4v2.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  zoom: (
    <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
      <circle cx="5.5" cy="5.5" r="4" stroke="#999" strokeWidth="1.2"/>
      <path d="M8.5 8.5L12 12" stroke="#999" strokeWidth="1.2" strokeLinecap="round"/>
    </svg>
  ),
  back: (
    <svg width="9" height="14" viewBox="0 0 7 11" fill="none">
      <path d="M6 1L1 5.5 6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  check: (
    <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
      <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  eyedropper: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/><path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
    </svg>
  ),
  paint: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/><path d="M20 23a2 2 0 001.4-3.4L16 14"/><line x1="3.5" y1="11.5" x2="13" y2="2"/>
    </svg>
  ),
  chevronDown: (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
      <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
    </svg>
  ),
};

// ─── Palette data ─────────────────────────────────────────────────────────────

const PANEL_LIGHTNESS = [68, 60, 52, 44];
const PANEL_PALETTE_GROUPS = (() => {
  const groups = [];
  for (let g = 0; g < 3; g++) {
    const group = [];
    for (const l of PANEL_LIGHTNESS) {
      for (let c = 0; c < 10; c++) {
        const h = (g * 10 + c) * 12;
        group.push(`hsl(${h}, 65%, ${l}%)`);
      }
    }
    groups.push(group);
  }
  groups.push([
    'hsl(0,0%,100%)', 'hsl(35,20%,97%)', 'hsl(0,0%,88%)', 'hsl(0,0%,78%)', 'hsl(0,0%,62%)', 'hsl(0,0%,50%)', 'hsl(0,0%,38%)', 'hsl(0,0%,22%)', 'hsl(0,0%,12%)', 'hsl(0,0%,4%)',
    'hsl(40,60%,95%)', 'hsl(35,30%,88%)', 'hsl(38,35%,78%)', 'hsl(35,30%,65%)', 'hsl(33,35%,52%)', 'hsl(25,40%,35%)', 'hsl(22,45%,22%)', 'hsl(35,8%,72%)', 'hsl(35,8%,50%)', 'hsl(35,8%,30%)',
    'hsl(210,30%,97%)', 'hsl(215,18%,82%)', 'hsl(215,16%,68%)', 'hsl(215,14%,55%)', 'hsl(215,14%,42%)', 'hsl(218,18%,30%)', 'hsl(220,20%,20%)', 'hsl(222,25%,12%)', 'hsl(225,30%,6%)', null,
    'hsl(340,18%,88%)', 'hsl(340,18%,72%)', 'hsl(300,12%,62%)', 'hsl(265,18%,78%)', 'hsl(240,18%,72%)', 'hsl(140,14%,72%)', 'hsl(160,16%,78%)', 'hsl(185,18%,78%)', 'hsl(48,30%,82%)', 'hsl(20,35%,82%)',
  ]);
  return groups;
})();

const PANEL_PALETTE_LABELS = ['Warm tones', 'Cool tones', 'Blues & purples', 'Neutrals'];

// Pale swatches that need a border so they don't vanish against a white background
const PALE_SWATCHES = new Set(['hsl(0,0%,100%)', 'hsl(35,20%,97%)', 'hsl(40,60%,95%)', 'hsl(210,30%,97%)']);

// ─── Colour picker sub-view ───────────────────────────────────────────────────

function ColourView({ chipName, chipColour, onBack, onConfirm }) {
  const [pendingColour, setPendingColour] = useState(chipColour ?? '#c9daf8');
  const colourInputRef = useRef(null);

  // Sync when the chip colour changes (e.g. a different chip is selected)
  useEffect(() => {
    setPendingColour(chipColour ?? '#c9daf8');
  }, [chipColour]);

  const handleSwatchClick = useCallback((colour) => {
    setPendingColour(colour);
  }, []);

  const handleEyedropper = useCallback(async () => {
    if (!('EyeDropper' in window)) return;
    try {
      const result = await new window.EyeDropper().open();
      setPendingColour(result.sRGBHex);
    } catch { /* cancelled */ }
  }, []);

  const handleConfirm = useCallback(() => {
    onConfirm(pendingColour);
  }, [pendingColour, onConfirm]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 320, flexShrink: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 22px 10px', borderBottom: `1px solid ${C.borderLight}`,
        flexShrink: 0, background: C.bg,
      }}>
        <BackBtn onClick={onBack} />
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.text }}>
          Colour
        </span>
        <button
          onClick={handleConfirm}
          title="Confirm"
          style={{
            marginLeft: 'auto', width: 44, height: 26,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: C.bgBlock, border: `1px solid ${C.border}`, borderRadius: 7,
            cursor: 'pointer', color: C.green, padding: 0,
            transition: 'border-color 0.15s, background 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.background = C.greenBg; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bgBlock; }}
        >
          {ICON.check}
        </button>
      </div>

      {/* Preview chip */}
      <div style={{
        margin: '10px 22px 0', height: 30, borderRadius: 6,
        border: '1px solid rgba(0,0,0,0.1)',
        background: pendingColour,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 11, fontWeight: 700, textTransform: 'uppercase',
        color: '#fff', flexShrink: 0, fontFamily: FONT,
      }}>
        {chipName || ' '}
      </div>

      {/* Scrollable palette */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {PANEL_PALETTE_GROUPS.map((group, gi) => (
          <div key={gi}>
            <div style={{
              padding: '8px 22px 2px',
              fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
              textTransform: 'uppercase', color: C.textLight,
            }}>
              {PANEL_PALETTE_LABELS[gi]}
            </div>
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(10, 1fr)',
              gap: 2, padding: '4px 22px 6px',
            }}>
              {group.map((colour, ci) =>
                colour ? (
                  <button
                    key={ci}
                    onClick={() => handleSwatchClick(colour)}
                    title={colour}
                    style={{
                      aspectRatio: '1', borderRadius: 2, border: 'none',
                      background: colour, cursor: 'pointer', padding: 0,
                      boxShadow: PALE_SWATCHES.has(colour) ? 'inset 0 0 0 0.5px #ccc' : 'none',
                      outline: pendingColour === colour ? '2px solid rgba(0,0,0,0.35)' : 'none',
                      outlineOffset: -2,
                      transition: 'transform 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.2)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; }}
                  />
                ) : (
                  <div key={ci} />
                )
              )}
            </div>
          </div>
        ))}

        {/* Custom colour row */}
        <div style={{
          borderTop: `1px solid ${C.borderLight}`,
          margin: '6px 22px 0', padding: '2px 0 14px',
        }}>
          <div style={{
            fontSize: 9, fontWeight: 700, letterSpacing: '0.08em',
            textTransform: 'uppercase', color: C.textLight, marginBottom: 6,
          }}>
            Custom
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <ColourToolBtn title="Pick from screen" onClick={handleEyedropper}>
              {ICON.eyedropper}
            </ColourToolBtn>
            <label style={{ position: 'relative' }}>
              <ColourToolBtn title="Custom colour" as="div">
                {ICON.paint}
              </ColourToolBtn>
              <input
                ref={colourInputRef}
                type="color"
                defaultValue={pendingColour}
                onChange={e => setPendingColour(e.target.value)}
                style={{ position: 'absolute', opacity: 0, width: 0, height: 0, pointerEvents: 'none' }}
              />
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}

function ColourToolBtn({ children, onClick, title, as: Tag = 'button' }) {
  const [hovered, setHovered] = useState(false);
  return (
    <Tag
      onClick={onClick}
      title={title}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 26, height: 26, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: hovered ? C.borderLight : C.bgBlock,
        border: `1px solid ${hovered ? '#aaa' : C.border}`, borderRadius: 2,
        cursor: 'pointer', color: hovered ? C.text : C.textFaint,
        transition: 'color 0.15s, border-color 0.15s, background 0.15s',
        padding: 0,
      }}
    >
      {children}
    </Tag>
  );
}

function BackBtn({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'none', border: 'none', cursor: 'pointer',
        color: hovered ? C.text : C.textLight,
        display: 'flex', alignItems: 'center', padding: 0,
        transition: 'color 0.15s',
      }}
    >
      {ICON.back}
    </button>
  );
}

// ─── Schedule items sub-view ──────────────────────────────────────────────────

function ScheduleView({ scheduleData, onDragStartRef, onBack }) {
  const {
    projects = [],
    scheduleLayout = null,
    projectChips = [],
    chipTimeOverrides = {},
    incrementMinutes = 30,
    rowMetrics = {},
  } = scheduleData ?? {};

  const incrementRowHeightPx = useMemo(() => {
    if (!rowMetrics) return DEFAULT_ROW_HEIGHT_PX;
    for (let h = 0; h < 24; h++) {
      const m = rowMetrics[`hour-${h}`];
      if (m?.height) return m.height;
    }
    const first = Object.values(rowMetrics).find((m) => m?.height);
    return first?.height ?? DEFAULT_ROW_HEIGHT_PX;
  }, [rowMetrics]);

  const durationToPx = useCallback((minutes) => {
    if (!incrementMinutes || incrementMinutes <= 0) return DEFAULT_ROW_HEIGHT_PX;
    return Math.max(24, (minutes / incrementMinutes) * incrementRowHeightPx);
  }, [incrementMinutes, incrementRowHeightPx]);

  // placedChips[projectId][itemIdx] = [{ id, minutes }, ...]
  const placedChips = useMemo(() => {
    const result = {};
    if (!projectChips) return result;
    projectChips.forEach((chip) => {
      if (!chip.id.startsWith('schedule-chip-')) return;
      if (chip.columnIndex >= 8) return;
      const extraIdx = chip.id.indexOf('-extra-chip-');
      if (extraIdx === -1) return;
      const inner = chip.id.slice('schedule-chip-'.length, extraIdx);
      const lastDash = inner.lastIndexOf('-');
      if (lastDash === -1) return;
      const projectId = inner.slice(0, lastDash);
      const itemIdx = parseInt(inner.slice(lastDash + 1), 10);
      if (!projectId || !Number.isFinite(itemIdx)) return;
      const canonicalId = `schedule-chip-${inner}`;
      const mins = chipTimeOverrides?.[chip.id] ?? chipTimeOverrides?.[canonicalId] ?? chip.durationMinutes ?? 0;
      if (!result[projectId]) result[projectId] = {};
      if (!result[projectId][itemIdx]) result[projectId][itemIdx] = [];
      result[projectId][itemIdx].push({ id: chip.id, minutes: mins });
    });
    return result;
  }, [projectChips, chipTimeOverrides]);

  const hasAnyItems = projects.some(
    (p) => (scheduleLayout?.scheduleItemsByProject?.get(p.id) ?? []).length > 0
  );

  const formatTime = (mins) => {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return h === 0 ? `${m}` : m === 0 ? `${h}` : `${h}.${String(m).padStart(2, '0')}`;
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 320, flexShrink: 0 }}>
      {/* Header */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 22px 10px', borderBottom: `1px solid ${C.borderLight}`,
        flexShrink: 0, background: C.bg,
      }}>
        <BackBtn onClick={onBack} />
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.text }}>
          Schedule items
        </span>
      </div>

      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 14px' }}>
        {!hasAnyItems ? (
          <p style={{ fontFamily: FONT, fontSize: 13, color: C.textFaint, fontStyle: 'italic', paddingTop: 8, paddingLeft: 8 }}>
            No schedule items defined. Add them on the Goal page.
          </p>
        ) : (
          projects.map((project) => {
            const items = scheduleLayout?.scheduleItemsByProject?.get(project.id) ?? [];
            if (!items.length) return null;

            const projectPlacedChips = placedChips[project.id] ?? {};
            const unscheduledCount = items.filter((_, idx) => {
              const instances = projectPlacedChips[idx] ?? [];
              return instances.length === 0;
            }).length;
            const bg = project.color || '#d5a6bd';
            const fg = project.textColor || '#000000';

            return (
              <div key={project.id} style={{ marginBottom: 16 }}>
                {/* Project header */}
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8, paddingBottom: 4,
                  borderBottom: `2px solid ${bg}`,
                }}>
                  <span style={{
                    fontFamily: FONT, fontSize: 11, fontWeight: 600,
                    textTransform: 'uppercase', color: C.textDim,
                  }}>
                    {project.label}
                  </span>
                  {unscheduledCount > 0 && (
                    <span style={{ fontFamily: FONT, fontSize: 10, fontWeight: 600, color: C.textLight }}>
                      {unscheduledCount} unscheduled
                    </span>
                  )}
                </div>

                {/* Items */}
                {items.map((item, itemIdx) => {
                  const targetMinutes = parseEstimateLabelToMinutes(item.timeValue) ?? incrementMinutes;
                  const heightPx = durationToPx(targetMinutes);
                  const instances = projectPlacedChips[itemIdx] ?? [];
                  const totalPlaced = instances.reduce((s, c) => s + c.minutes, 0);
                  const remainingMinutes = Math.max(0, targetMinutes - totalPlaced);
                  const baseName = (item.name ?? '').trim() || project.label;

                  return (
                    <div key={itemIdx} style={{ marginBottom: 4 }}>
                      {/* One greyed chip per already-placed instance */}
                      {instances.map((instance) => (
                        <div key={instance.id} style={{ height: `${heightPx}px`, marginBottom: 2 }}>
                          <div
                            style={{
                              height: '100%', borderRadius: 3,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 8px', overflow: 'hidden',
                              fontFamily: FONT, fontWeight: 700,
                              textTransform: 'uppercase', textAlign: 'center',
                              userSelect: 'none',
                              backgroundColor: bg, color: fg,
                              opacity: 0.35, border: '1px solid white',
                            }}
                            title={`Placed: ${formatTime(instance.minutes)} min`}
                          >
                            <FitText text={`${baseName}: ${formatTime(instance.minutes)}`.toUpperCase()} />
                          </div>
                        </div>
                      ))}
                      {/* One active chip for remaining unplaced time */}
                      {remainingMinutes > 0 && (
                        <div style={{ height: `${heightPx}px`, marginBottom: 2 }}>
                          <div
                            draggable
                            style={{
                              height: '100%', borderRadius: 3,
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              padding: '0 8px', overflow: 'hidden',
                              fontFamily: FONT, fontWeight: 700,
                              textTransform: 'uppercase', textAlign: 'center',
                              userSelect: 'none', cursor: 'grab',
                              backgroundColor: bg, color: fg,
                              border: '1px solid white',
                              boxShadow: '0 1px 2px rgba(0,0,0,0.08)',
                            }}
                            onDragStart={(e) => onDragStartRef.current?.(project.id, itemIdx, e)}
                          >
                            <FitText text={`${baseName}: ${formatTime(remainingMinutes)}`.toUpperCase()} />
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ─── Display section (no chip selected) ──────────────────────────────────────

function DisplaySection({ showClock, showDuration, onToggleClock, onToggleDuration }) {
  return (
    <div style={SECTION}>
      <SectionLabel>Display on chips</SectionLabel>
      <ToggleBtn
        icon={ICON.clock}
        label={showClock ? 'Hide clock time' : 'Show clock time'}
        on={showClock}
        onClick={onToggleClock}
        style={{ marginBottom: 8 }}
      />
      <ToggleBtn
        icon={ICON.timer}
        label={showDuration ? 'Hide duration' : 'Show duration'}
        on={showDuration}
        onClick={onToggleDuration}
      />
    </div>
  );
}

// ─── Schedule link section (no chip selected) ─────────────────────────────────

function ScheduleLinkSection({ onViewSchedule }) {
  return (
    <div style={SECTION}>
      <SectionLabel>Schedule</SectionLabel>
      <ActionBtn
        icon={ICON.calendar}
        label="View schedule items"
        onClick={onViewSchedule}
      />
    </div>
  );
}

// ─── Chip detail sections (chip selected) ─────────────────────────────────────

function ChipSection({ chip, onOpenColour, onNameChange, onGoalChange, goals }) {
  const isProject = chip.type === 'project';
  const isCustom = chip.type === 'custom';

  return (
    <div style={SECTION}>
      <SectionLabel>Chip</SectionLabel>

      {/* Goal row — project chips only */}
      {isProject && (
        <FieldRow
          label="Goal"
          control={
            <GoalChip
              colour={chip.goalColour ?? chip.colour}
              name={chip.goalName ?? chip.name}
              onClick={onGoalChange}
            />
          }
          style={{ marginBottom: 8 }}
        />
      )}

      {/* Name */}
      <FieldRow
        label="Name"
        control={
          <FieldInput
            value={chip.name ?? ''}
            onChange={e => onNameChange(e.target.value)}
          />
        }
        style={isProject || isCustom ? { marginBottom: isCustom ? 8 : 0 } : { marginBottom: 0 }}
      />

      {/* Colour — custom chips only */}
      {isCustom && (
        <FieldRow
          label="Colour"
          control={
            <button
              onClick={onOpenColour}
              style={{
                width: 160, height: 28, borderRadius: 6, flexShrink: 0,
                border: '1px solid rgba(0,0,0,0.1)', cursor: 'pointer',
                background: chip.colour ?? C.border,
                transition: 'opacity 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.85'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
            />
          }
          style={{ marginBottom: 0 }}
        />
      )}
    </div>
  );
}

function GoalChip({ colour, name, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 160, height: 28, boxSizing: 'border-box', flexShrink: 0,
        position: 'relative',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        border: 'none', borderRadius: 8, padding: '0 22px',
        fontFamily: FONT, fontSize: 11, fontWeight: 700,
        textTransform: 'uppercase', cursor: 'pointer', userSelect: 'none',
        background: colour ?? C.border, color: '#fff',
        opacity: hovered ? 0.85 : 1,
        transition: 'opacity 0.15s',
      }}
    >
      <span style={{ maxWidth: '100%', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {name}
      </span>
      <span style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)' }}>
        {ICON.chevronDown}
      </span>
    </button>
  );
}

function TimeSection({ chip, onStartChange, onEndChange, onDurationChange, onToggleClock, onToggleDuration }) {
  const fmt12 = (mins) => {
    if (mins == null || !Number.isFinite(mins)) return '—';
    const m = ((mins % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const ap = h24 < 12 ? 'AM' : 'PM';
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${String(min).padStart(2, '0')} ${ap}`;
  };

  const fmtDur = (mins) => {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '0:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  const startMins = chip.startMinutes;
  const endMins = chip.endMinutes ?? (chip.startMinutes != null && chip.durationMinutes != null ? chip.startMinutes + chip.durationMinutes : null);

  return (
    <div style={SECTION}>
      <SectionLabel>Time</SectionLabel>

      <FieldRow
        label="Start time"
        control={<TimeTrigger value={fmt12(startMins)} onClick={() => onStartChange?.()} />}
      />
      <FieldRow
        label="End time"
        control={<TimeTrigger value={fmt12(endMins)} onClick={() => onEndChange?.()} />}
      />

      <ToggleBtn
        icon={ICON.clock}
        label={chip.showClock ? 'Hide clock time' : 'Show clock time'}
        on={chip.showClock}
        onClick={onToggleClock}
        style={{ marginTop: 12, marginBottom: 0 }}
      />

      <Divider />

      <FieldRow
        label="Duration"
        control={
          <FieldInput
            value={fmtDur(chip.durationMinutes)}
            onChange={e => onDurationChange?.(e.target.value)}
            style={{ textTransform: 'none', fontWeight: 400, fontSize: 13 }}
          />
        }
      />

      <ToggleBtn
        icon={ICON.timer}
        label={chip.showDuration ? 'Hide duration' : 'Show duration'}
        on={chip.showDuration}
        onClick={onToggleDuration}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}

function RemoveSection({ onRemove, disabled }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={SECTION}>
      <button
        onClick={onRemove}
        disabled={disabled}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          background: hovered && !disabled ? C.dangerBg : 'none',
          border: `1px solid ${hovered && !disabled ? C.dangerBorder : C.border}`,
          borderRadius: 10, padding: '10px 14px',
          fontFamily: FONT, fontSize: 13, fontWeight: 400,
          color: hovered && !disabled ? C.danger : C.textDim,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.45 : 1,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
      >
        {ICON.trash}
        Remove chip
      </button>
    </div>
  );
}

// ─── Page footer (always visible) ─────────────────────────────────────────────

function PageFooter() {
  const [undoAvailable, setUndoAvailable] = useState(false);
  const [redoAvailable, setRedoAvailable] = useState(false);
  const { sizeScale, increaseSize, decreaseSize, minScale, maxScale } = usePageSize('plan');

  useEffect(() => {
    const handler = (e) => {
      setUndoAvailable(e.detail?.undoAvailable ?? false);
      setRedoAvailable(e.detail?.redoAvailable ?? false);
    };
    window.addEventListener(PLAN_PANEL_STATE_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_STATE_EVENT, handler);
  }, []);

  const displayScale = Math.round(sizeScale * 10);

  return (
    <div style={{
      borderTop: `1px solid ${C.borderLight}`,
      padding: '20px 22px',
      flexShrink: 0, background: C.bg,
    }}>
      <SectionLabel>Page</SectionLabel>

      <ButtonPair
        left={{
          icon: ICON.undo,
          label: 'Undo',
          disabled: !undoAvailable,
          onClick: () => dispatchPlanAction('undo'),
        }}
        right={{
          icon: ICON.redo,
          label: 'Redo',
          disabled: !redoAvailable,
          onClick: () => dispatchPlanAction('redo'),
        }}
      />

      <StepperRow
        icon={ICON.zoom}
        label="Zoom"
        value={displayScale}
        onDecrease={decreaseSize}
        onIncrease={increaseSize}
        decreaseDisabled={sizeScale <= minScale}
        increaseDisabled={sizeScale >= maxScale}
      />
    </div>
  );
}

// ─── Main view ────────────────────────────────────────────────────────────────

function MainView({
  selectedChip,
  showClock,
  showDuration,
  onToggleClock,
  onToggleDuration,
  onViewSchedule,
  onOpenColour,
  onNameChange,
  onGoalChange,
  onStartChange,
  onEndChange,
  onDurationChange,
  onToggleChipClock,
  onToggleChipDuration,
  onRemoveChip,
  goals,
}) {
  const hasChip = selectedChip != null;

  return (
    <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto' }}>
        {!hasChip ? (
          <>
            <DisplaySection
              showClock={showClock}
              showDuration={showDuration}
              onToggleClock={onToggleClock}
              onToggleDuration={onToggleDuration}
            />
            <ScheduleLinkSection onViewSchedule={onViewSchedule} />
          </>
        ) : (
          <>
            <ChipSection
              chip={selectedChip}
              onOpenColour={onOpenColour}
              onNameChange={onNameChange}
              onGoalChange={onGoalChange}
              goals={goals}
            />
            <TimeSection
              chip={selectedChip}
              onStartChange={onStartChange}
              onEndChange={onEndChange}
              onDurationChange={onDurationChange}
              onToggleClock={onToggleChipClock}
              onToggleDuration={onToggleChipDuration}
            />
            <RemoveSection onRemove={onRemoveChip} />
          </>
        )}
      </div>

      {/* Sticky footer */}
      <PageFooter />
    </div>
  );
}

// ─── Panel root ───────────────────────────────────────────────────────────────

export default function PlanPanel() {
  const { isOpen, open, close } = usePlanPanel();
  const [navBottom, setNavBottom] = useState(0);
  const { pathname } = useLocation();

  // Panel view: 'main' | 'colour' | 'schedule'
  const [panelView, setPanelView] = useState('main');
  // Delay hiding the second-slot view until the slide-out animation finishes
  const [secondSlotView, setSecondSlotView] = useState('colour'); // 'colour' | 'schedule'
  const slideBackTimerRef = useRef(null);

  // Page-level display toggles (no chip selected)
  const [showClock, setShowClock] = useState(false);
  const [showDuration, setShowDuration] = useState(true);

  // Selected chip data — populated via PLAN_PANEL_CHIP_EVENT
  const [selectedChip, setSelectedChip] = useState(null);

  // Colour pending during colour-picker editing
  const [pendingColour, setPendingColour] = useState(null);

  // Schedule view data — pushed in via PLAN_PANEL_SCHEDULE_DATA_EVENT
  const [scheduleData, setScheduleData] = useState({
    projects: [], scheduleLayout: null, projectChips: [],
    chipTimeOverrides: {}, incrementMinutes: 30, rowMetrics: {},
  });
  const onDragStartRef = useRef(null);

  // Measure nav bar bottom so panel starts right below it
  useEffect(() => {
    const measure = () => {
      const el = document.querySelector('[data-nav]');
      if (el) setNavBottom(el.getBoundingClientRect().bottom);
    };
    measure();
    window.addEventListener('resize', measure);
    const ro = new ResizeObserver(measure);
    const el = document.querySelector('[data-nav]');
    if (el) ro.observe(el);
    return () => {
      window.removeEventListener('resize', measure);
      ro.disconnect();
    };
  }, [isOpen]);

  // Escape closes
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Listen for chip selection events from TacticsPage.
  // Auto-opens the panel when a chip is selected; slides back to main on deselect.
  useEffect(() => {
    const handler = (e) => {
      const chip = e.detail?.chip ?? null;
      setSelectedChip(chip);
      if (chip) {
        open();
      } else if (panelView === 'colour') {
        goToMain();
      }
    };
    window.addEventListener(PLAN_PANEL_CHIP_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_CHIP_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelView]);

  // View transitions
  const openColourView = useCallback(() => {
    if (slideBackTimerRef.current) {
      clearTimeout(slideBackTimerRef.current);
      slideBackTimerRef.current = null;
    }
    setSecondSlotView('colour');
    setPendingColour(selectedChip?.colour ?? '#c9daf8');
    setPanelView('colour');
  }, [selectedChip?.colour]);

  const openScheduleViewRef = useRef(null);

  const openScheduleView = useCallback(() => {
    if (slideBackTimerRef.current) {
      clearTimeout(slideBackTimerRef.current);
      slideBackTimerRef.current = null;
    }
    setSecondSlotView('schedule');
    setPanelView('schedule');
  }, []);

  // Keep ref in sync so event handlers always call the latest version
  openScheduleViewRef.current = openScheduleView;

  const goToMain = useCallback(() => {
    setPanelView('main');
    // After transition, reset second slot to colour (default)
    slideBackTimerRef.current = setTimeout(() => {
      setSecondSlotView('colour');
      slideBackTimerRef.current = null;
    }, 280);
  }, []);

  // Colour confirm
  const handleColourConfirm = useCallback((colour) => {
    if (!selectedChip) { goToMain(); return; }
    dispatchPlanAction('setChipColour', { chipId: selectedChip.id, colour });
    goToMain();
  }, [selectedChip, goToMain]);

  // Chip field actions — dispatch events for TacticsPage to handle
  const handleNameChange    = useCallback((value) => dispatchPlanAction('setChipName', { chipId: selectedChip?.id, value }), [selectedChip]);
  const handleGoalChange    = useCallback((e) => dispatchPlanAction('openGoalPicker', { chipId: selectedChip?.id, event: e }), [selectedChip]);
  const handleStartChange   = useCallback((e) => dispatchPlanAction('openStartTimePicker', { chipId: selectedChip?.id, event: e }), [selectedChip]);
  const handleEndChange     = useCallback((e) => dispatchPlanAction('openEndTimePicker', { chipId: selectedChip?.id, event: e }), [selectedChip]);
  const handleDurationChange= useCallback((value) => dispatchPlanAction('setChipDuration', { chipId: selectedChip?.id, value }), [selectedChip]);
  const handleToggleChipClock    = useCallback(() => dispatchPlanAction('toggleChipClock', { chipId: selectedChip?.id }), [selectedChip]);
  const handleToggleChipDuration = useCallback(() => dispatchPlanAction('toggleChipDuration', { chipId: selectedChip?.id }), [selectedChip]);
  const handleRemoveChip    = useCallback(() => dispatchPlanAction('removeChip', { chipId: selectedChip?.id }), [selectedChip]);
  const handleToggleClock    = useCallback(() => dispatchPlanAction('toggleGlobalClock'), []);
  const handleToggleDuration = useCallback(() => dispatchPlanAction('toggleGlobalDuration'), []);

  // Keep local showClock/showDuration in sync when TacticsPage pushes state
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.showClock   != null) setShowClock(e.detail.showClock);
      if (e.detail?.showDuration != null) setShowDuration(e.detail.showDuration);
    };
    window.addEventListener(PLAN_PANEL_STATE_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_STATE_EVENT, handler);
  }, []);

  // Receive schedule data from TacticsPage
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail ?? {};
      onDragStartRef.current = d.onDragStart ?? null;
      setScheduleData({
        projects:        d.projects        ?? [],
        scheduleLayout:  d.scheduleLayout  ?? null,
        projectChips:    d.projectChips    ?? [],
        chipTimeOverrides: d.chipTimeOverrides ?? {},
        incrementMinutes:  d.incrementMinutes  ?? 30,
        rowMetrics:        d.rowMetrics        ?? {},
      });
    };
    window.addEventListener(PLAN_PANEL_SCHEDULE_DATA_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_SCHEDULE_DATA_EVENT, handler);
  }, []);

  // Handle navigation commands from TacticsPage (e.g. "open schedule view")
  useEffect(() => {
    const handler = (e) => {
      const view = e.detail?.view;
      if (view === 'schedule') {
        open();
        openScheduleViewRef.current?.();
      }
    };
    window.addEventListener(PLAN_PANEL_NAV_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_NAV_EVENT, handler);
  }, [open]);

  // Only render on Plan page
  if (pathname !== '/tactics') return null;

  const isSlid = panelView !== 'main';

  return createPortal(
    <div
      style={{
        position: 'fixed', right: 0, top: navBottom, bottom: 0,
        width: 320,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        zIndex: 99994,
        overflow: 'hidden',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Horizontal slider track: 640 px wide, two 320 px views */}
      <div
        style={{
          display: 'flex',
          width: 640,
          flex: 1,
          minHeight: 0,
          transform: isSlid ? 'translateX(-320px)' : 'translateX(0)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* View 1 — Main */}
        <MainView
          selectedChip={selectedChip}
          showClock={showClock}
          showDuration={showDuration}
          onToggleClock={handleToggleClock}
          onToggleDuration={handleToggleDuration}
          onViewSchedule={openScheduleView}
          onOpenColour={openColourView}
          onNameChange={handleNameChange}
          onGoalChange={handleGoalChange}
          onStartChange={handleStartChange}
          onEndChange={handleEndChange}
          onDurationChange={handleDurationChange}
          onToggleChipClock={handleToggleChipClock}
          onToggleChipDuration={handleToggleChipDuration}
          onRemoveChip={handleRemoveChip}
        />

        {/* View 2 — Colour or Schedule */}
        {secondSlotView === 'schedule' ? (
          <ScheduleView
            scheduleData={scheduleData}
            onDragStartRef={onDragStartRef}
            onBack={goToMain}
          />
        ) : (
          <ColourView
            chipName={selectedChip?.name}
            chipColour={selectedChip?.colour ?? '#c9daf8'}
            onBack={goToMain}
            onConfirm={handleColourConfirm}
          />
        )}
      </div>
    </div>,
    document.body
  );
}
