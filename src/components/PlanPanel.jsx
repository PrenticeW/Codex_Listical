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
import PanelShell from './PanelShell';
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
  green:       'var(--brand-deep)',
  greenDark:   'var(--brand-ink)',
  greenBg:     'var(--brand-tint)',
  greenBorder: 'var(--brand-bd)',
  danger:      '#c0392b',
  dangerBg:    '#fef2f2',
  dangerBorder:'#fca5a5',
  blue:        '#33558a',
  blueBg:      '#e8eef7',
  blueBgHover: '#dce6f4',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const BENTO_CARD = {
  background: '#FFFFFF',
  borderRadius: 12,
  padding: '15px 16px',
  margin: '0 11px 7px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
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
      fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--brand-ink)',
      marginBottom: 14,
      borderBottom: '1px solid var(--brand-bd)',
      paddingBottom: 6,
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
        background: hovered ? 'var(--brand-hover-bg)' : 'transparent',
        border: `1px solid ${hovered ? 'var(--brand-hover-bd)' : C.border}`,
        borderRadius: 10, padding: '13px 16px',
        fontFamily: FONT, fontSize: 14, fontWeight: 400,
        color: hovered ? C.green : C.textDim,
        cursor: 'pointer', width: '100%', textAlign: 'left',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
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
        borderRadius: 10, padding: '12px 16px',
        fontFamily: FONT, fontSize: 14, fontWeight: on ? 500 : 400,
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

// ─── Time carousel (matches GearPanel behaviour exactly) ─────────────────────

const HOUR_VALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const TP_THRESHOLD = 30;

function minsTo12(totalMins) {
  const m = ((totalMins % 1440) + 1440) % 1440;
  const h24 = Math.floor(m / 60);
  return { h: h24 % 12 === 0 ? 12 : h24 % 12, min: m % 60, ap: h24 < 12 ? 'AM' : 'PM' };
}
function twelveToMins(h, min, ap) {
  let h24 = h % 12;
  if (ap === 'PM') h24 += 12;
  return h24 * 60 + min;
}

function TimeCarousel({ valueMinutes, onChange, incrementMinutes = 30 }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const boxRef = useRef(null);

  const minuteSteps = Array.from(
    { length: Math.max(1, Math.round(60 / (incrementMinutes || 30))) },
    (_, i) => i * (incrementMinutes || 30),
  );

  const [pos, setPos] = useState({ top: 0, left: 0 });
  const parsed = minsTo12(valueMinutes ?? 0);
  const [tH, setTH]   = useState(parsed.h);
  const [tM, setTM]   = useState(parsed.min);
  const [tAP, setTAP] = useState(parsed.ap);
  const acc = useRef({ h: 0, m: 0, ap: 0 });

  // Prevent page scroll while wheeling the carousel
  useEffect(() => {
    if (!open) return;
    const el = boxRef.current;
    if (!el) return;
    const block = (e) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, [open]);

  const openPicker = useCallback((e) => {
    e.stopPropagation();
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 210) });
    }
    const p = minsTo12(valueMinutes ?? 0);
    const snapped = minuteSteps.includes(p.min)
      ? p.min
      : minuteSteps.reduce((best, s) => Math.abs(s - p.min) < Math.abs(best - p.min) ? s : best, minuteSteps[0]);
    setTH(p.h); setTM(snapped); setTAP(p.ap);
    acc.current = { h: 0, m: 0, ap: 0 };
    setOpen(true);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueMinutes]);

  const spin = useCallback((e, col) => {
    e.preventDefault();
    acc.current[col] += e.deltaY;
    const steps = Math.trunc(acc.current[col] / TP_THRESHOLD);
    if (steps === 0) return;
    acc.current[col] -= steps * TP_THRESHOLD;
    const dir = steps > 0 ? 1 : -1;
    if (col === 'h') {
      setTH(prev => HOUR_VALS[(HOUR_VALS.indexOf(prev) + dir + 12) % 12]);
    } else if (col === 'm') {
      setTM(prev => {
        const idx = minuteSteps.indexOf(prev);
        const safe = idx === -1 ? 0 : idx;
        const next = safe + dir;
        if (next < 0 || next >= minuteSteps.length) return prev;
        return minuteSteps[next];
      });
    } else {
      setTAP(prev => prev === 'AM' ? 'PM' : 'AM');
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [minuteSteps.length]);

  const confirm = useCallback(() => {
    onChange(twelveToMins(tH, tM, tAP));
    setOpen(false);
  }, [tH, tM, tAP, onChange]);

  useEffect(() => {
    if (!open) return;
    const handler = (e) => {
      if (!e.target.closest('[data-time-picker]')) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const hIdx = HOUR_VALS.indexOf(tH);
  const mIdx  = minuteSteps.indexOf(tM);
  const mSafe = mIdx === -1 ? 0 : mIdx;
  const mPrev = mSafe > 0 ? String(minuteSteps[mSafe - 1]).padStart(2, '0') : '';
  const mNext = mSafe < minuteSteps.length - 1 ? String(minuteSteps[mSafe + 1]).padStart(2, '0') : '';

  const fmt12 = (m) => {
    const p = minsTo12(m ?? 0);
    return `${p.h}:${String(p.min).padStart(2, '0')} ${p.ap}`;
  };

  const ghost = { fontSize: 11, color: '#ccc', padding: '2px 0', textAlign: 'center', width: 32, height: 17, boxSizing: 'border-box' };
  const main  = { fontSize: 14, fontWeight: 500, color: C.text, padding: '3px 0', width: 32, textAlign: 'center' };
  const slotProps = (col) => ({ style: { display: 'flex', flexDirection: 'column', alignItems: 'center', cursor: 'default', userSelect: 'none' }, onWheel: (e) => spin(e, col) });

  return (
    <>
      <div
        ref={triggerRef}
        onClick={openPicker}
        style={{
          width: 160, height: 28, boxSizing: 'border-box', flexShrink: 0,
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6,
          background: C.bgBlock, border: `1px solid ${C.border}`,
          borderRadius: 8, padding: '0 11px',
          fontFamily: FONT, fontSize: 13, fontWeight: 500, color: C.text,
          cursor: 'pointer', userSelect: 'none',
        }}
        onMouseEnter={e => { e.currentTarget.style.background = C.border; }}
        onMouseLeave={e => { e.currentTarget.style.background = C.bgBlock; }}
      >
        <span>{fmt12(valueMinutes)}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M1 1l3 3 3-3" stroke="#999" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>

      {open && createPortal(
        <div
          ref={boxRef}
          data-time-picker=""
          style={{
            position: 'fixed', top: pos.top, left: pos.left, zIndex: 999999,
            background: C.bg, borderRadius: 10, border: `1px solid ${C.border}`,
            padding: '6px 10px', boxShadow: '0 4px 16px rgba(0,0,0,0.1)',
            display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', background: C.bgBlock, border: `1px solid ${C.border}`, borderRadius: 6, overflow: 'hidden' }}>
            <div {...slotProps('h')}>
              <div style={ghost}>{HOUR_VALS[(hIdx - 1 + 12) % 12]}</div>
              <div style={main}>{tH}</div>
              <div style={ghost}>{HOUR_VALS[(hIdx + 1) % 12]}</div>
            </div>
            <span style={{ fontSize: 12, color: '#ccc', padding: '0 1px' }}>:</span>
            <div {...slotProps('m')}>
              <div style={ghost}>{mPrev}</div>
              <div style={main}>{String(tM).padStart(2, '0')}</div>
              <div style={ghost}>{mNext}</div>
            </div>
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            <div {...slotProps('ap')}>
              <div style={ghost}>{tAP === 'PM' ? 'AM' : ''}</div>
              <div style={main}>{tAP}</div>
              <div style={ghost}>{tAP === 'AM' ? 'PM' : ''}</div>
            </div>
          </div>
          <button
            onClick={confirm}
            style={{
              height: 26, padding: '0 10px', background: C.greenDark, border: 'none',
              borderRadius: 6, fontFamily: FONT, fontSize: 12, fontWeight: 500,
              color: '#fff', cursor: 'pointer', transition: 'background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.greenDark; }}
          >
            Set
          </button>
        </div>,
        document.body
      )}
    </>
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
        borderRadius: 10, padding: '12px 16px',
        fontFamily: FONT, fontSize: 14, fontWeight: 400,
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
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px',
    }}>
      <span style={{ fontFamily: FONT, fontSize: 14, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <StepBtn onClick={onDecrease} disabled={decreaseDisabled}>−</StepBtn>
        <span style={{
          minWidth: 38, textAlign: 'center', fontSize: 14, fontWeight: 500, color: C.text,
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
  plus: (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ flexShrink: 0 }}>
      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
    </svg>
  ),
  chevronDown: (
    <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
      <path d="M1 1l3 3 3-3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
    </svg>
  ),
  sync: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  ),
  checkCircle: (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
      <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
      <polyline points="22 4 12 14.01 9 11.01"/>
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

// ─── Goal picker dropdown (floating popup, matches HTML prototype) ────────────

function chipTextColour(hex) {
  // Simple luminance check — returns '#000' for light colours, '#fff' for dark
  const el = document.createElement('div');
  el.style.color = hex;
  document.body.appendChild(el);
  const rgb = getComputedStyle(el).color.match(/\d+/g)?.map(Number) ?? [0, 0, 0];
  document.body.removeChild(el);
  return (0.299 * rgb[0] + 0.587 * rgb[1] + 0.114 * rgb[2]) > 170 ? '#000' : '#fff';
}

function GoalDropdown({ allChips, currentProjectId, anchorRect, onSelect, onClose }) {
  useEffect(() => {
    const handler = (e) => {
      if (!e.target.closest('[data-goal-picker]')) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!anchorRect) return null;

  const { defaults = [], projects = [], customs = [] } = allChips ?? {};
  const left = Math.min(anchorRect.left, window.innerWidth - 200);
  const top = anchorRect.bottom + 4;

  const ChipRow = ({ chip }) => {
    const isActive = chip.id === currentProjectId;
    const fg = chipTextColour(chip.colour);
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px' }}>
        <button
          onClick={() => { onSelect(chip.id); onClose(); }}
          style={{
            flex: 1, minWidth: 0, border: 'none', borderRadius: 3,
            padding: '6px 9px', textAlign: 'left',
            fontFamily: FONT, fontSize: 11, fontWeight: 700,
            textTransform: 'uppercase',
            background: chip.colour, color: fg,
            cursor: 'pointer', whiteSpace: 'nowrap',
            overflow: 'hidden', textOverflow: 'ellipsis',
            outline: isActive ? `2px solid ${C.greenDark}` : 'none',
            outlineOffset: 1,
            opacity: 1, transition: 'opacity 0.12s',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.82'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          {chip.name}
        </button>
      </div>
    );
  };

  const Section = ({ label, chips }) => {
    if (!chips.length) return null;
    return (
      <>
        <div style={{
          padding: '6px 12px 2px', fontSize: 10, fontWeight: 600,
          letterSpacing: '0.08em', textTransform: 'uppercase', color: '#94a3b8',
        }}>
          {label}
        </div>
        {chips.map(chip => <ChipRow key={chip.id} chip={chip} />)}
      </>
    );
  };

  return createPortal(
    <div
      data-goal-picker=""
      style={{
        position: 'fixed', zIndex: 999999,
        top, left,
        background: '#f8fafc', border: '1px solid #94a3b8', borderRadius: 6,
        boxShadow: '0 16px 40px rgba(15,23,42,0.22)',
        minWidth: 180, overflow: 'hidden',
        fontFamily: FONT, fontSize: 11,
        paddingBottom: 6,
      }}
    >
      <Section label="Default chips" chips={defaults} />
      {projects.length > 0 && defaults.length > 0 && (
        <div style={{ margin: '4px 12px', borderTop: '1px solid #e5e7eb' }} />
      )}
      <Section label="Project chips" chips={projects} />
      {customs.length > 0 && (
        <div style={{ margin: '4px 12px', borderTop: '1px solid #e5e7eb' }} />
      )}
      <Section label="Custom chips" chips={customs} />
    </div>,
    document.body
  );
}

// ─── Time picker sub-view ─────────────────────────────────────────────────────

function TimePickerView({ label, initialMinutes, incrementMinutes, onBack, onConfirm }) {
  const inc = incrementMinutes > 0 ? incrementMinutes : 30;

  const snap = (mins) => {
    const m = ((mins ?? 0) + 1440) % 1440;
    return Math.round(m / inc) * inc % 1440;
  };

  const [selectedMins, setSelectedMins] = useState(() => snap(initialMinutes ?? 0));

  useEffect(() => {
    setSelectedMins(snap(initialMinutes ?? 0));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialMinutes, inc]);

  const fmt12 = (mins) => {
    const m = ((mins % 1440) + 1440) % 1440;
    const h24 = Math.floor(m / 60);
    const min = m % 60;
    const ap = h24 < 12 ? 'AM' : 'PM';
    const h = h24 % 12 === 0 ? 12 : h24 % 12;
    return `${h}:${String(min).padStart(2, '0')} ${ap}`;
  };

  const step = useCallback((dir) => {
    setSelectedMins((prev) => ((prev + dir * inc) + 1440) % 1440);
  }, [inc]);

  const handleWheel = useCallback((e) => {
    e.preventDefault();
    step(e.deltaY > 0 ? 1 : -1);
  }, [step]);

  const handleConfirm = useCallback(() => onConfirm(selectedMins), [selectedMins, onConfirm]);

  const stepBtnStyle = {
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 8,
    width: 44, height: 44, cursor: 'pointer', display: 'flex', alignItems: 'center',
    justifyContent: 'center', color: C.textDim, fontSize: 18, fontFamily: FONT,
    transition: 'border-color 0.15s, color 0.15s',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 320, flexShrink: 0 }}>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10,
        padding: '12px 22px 10px', borderBottom: `1px solid ${C.borderLight}`,
        flexShrink: 0, background: C.bg,
      }}>
        <BackBtn onClick={onBack} />
        <span style={{ fontFamily: FONT, fontSize: 13, fontWeight: 600, color: C.text }}>{label}</span>
        <button
          onClick={handleConfirm}
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
      <div style={{
        flex: 1, display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center', padding: '24px 22px',
      }}>
        <div
          onWheel={handleWheel}
          style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, userSelect: 'none' }}
        >
          <button
            onClick={() => step(-1)}
            style={stepBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
          >▲</button>
          <div style={{
            fontFamily: FONT, fontSize: 28, fontWeight: 700, color: C.text,
            background: C.bgBlock, border: `1px solid ${C.border}`,
            borderRadius: 12, padding: '14px 28px', minWidth: 140, textAlign: 'center',
          }}>
            {fmt12(selectedMins)}
          </div>
          <button
            onClick={() => step(1)}
            style={stepBtnStyle}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
          >▼</button>
        </div>
        <p style={{ fontFamily: FONT, fontSize: 11, color: C.textFaint, marginTop: 20, textAlign: 'center' }}>
          Scroll or use arrows · {inc} min steps
        </p>
      </div>
    </div>
  );
}

// ─── Schedule items sub-view ──────────────────────────────────────────────────

function ScheduleView({ scheduleData, onDragStartRef, onAddChipRef, onBack }) {
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
                            onClick={() => onAddChipRef?.current?.(project.id, itemIdx)}
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

// ─── Update section (always visible in main view) ─────────────────────────────

function UpdateSection({ isUpToDate, onSendToSystem }) {
  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Update</SectionLabel>
      {isUpToDate ? (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          border: `1px solid ${C.greenBorder}`,
          borderRadius: 10, padding: '11px 14px',
          background: C.greenBg,
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          color: C.greenDark,
        }}>
          {ICON.checkCircle}
          System up to date
        </div>
      ) : (
        <ActionBtn
          icon={ICON.sync}
          label="Send to system"
          onClick={onSendToSystem}
        />
      )}
    </div>
  );
}

// ─── Schedule link section (no chip selected) ─────────────────────────────────

function ScheduleLinkSection({ onViewSchedule, onAddChip }) {
  const btnRef = useRef(null);
  const handleAddChip = useCallback(() => {
    onAddChip?.(btnRef.current?.getBoundingClientRect());
  }, [onAddChip]);

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Add</SectionLabel>
      <ActionBtn
        icon={ICON.calendar}
        label="Add schedule item"
        onClick={onViewSchedule}
      />
      <div ref={btnRef} style={{ marginTop: 8 }}>
        <ActionBtn
          icon={ICON.plus}
          label="Add new chip"
          onClick={handleAddChip}
        />
      </div>
    </div>
  );
}

// ─── Chip detail sections (chip selected) ─────────────────────────────────────

function ChipSection({ chip, onOpenColour, onNameChange, onGoalChange }) {
  const isCustom = chip.type === 'custom';

  // Resolve the template name/colour from allChips so the Goal button
  // always shows the chip TYPE, independent of the editable display name.
  const allOptions = [
    ...(chip.allChips?.defaults ?? []),
    ...(chip.allChips?.projects ?? []),
    ...(chip.allChips?.customs  ?? []),
  ];
  const template = allOptions.find(c => c.id === chip.projectId);
  const templateName   = template?.name   ?? chip.name;
  const templateColour = template?.colour ?? chip.colour;

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Chip</SectionLabel>

      {/* Goal row — always shown; lets user switch the chip type */}
      <FieldRow
        label="Goal"
        control={
          <GoalChip
            colour={templateColour}
            name={templateName}
            onClick={onGoalChange}
          />
        }
        style={{ marginBottom: 8 }}
      />

      {/* Name */}
      <FieldRow
        label="Name"
        control={
          <FieldInput
            value={chip.name ?? ''}
            onChange={e => onNameChange(e.target.value)}
          />
        }
        style={{ marginBottom: 0 }}
      />

    </div>
  );
}

function GoalChip({ colour, name, onClick }) {
  const [hovered, setHovered] = useState(false);
  const btnRef = useRef(null);
  const handleClick = useCallback(() => {
    onClick?.(btnRef.current?.getBoundingClientRect());
  }, [onClick]);
  return (
    <button
      ref={btnRef}
      onClick={handleClick}
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

function TimeReadout({ minutes }) {
  if (minutes == null || !Number.isFinite(minutes)) {
    return <span style={{ width: 160, flexShrink: 0, fontFamily: FONT, fontSize: 13, color: C.textFaint, padding: '0 10px', textAlign: 'center' }}>—</span>;
  }
  const p = minsTo12(minutes);
  const label = `${p.h}:${String(p.min).padStart(2, '0')} ${p.ap}`;
  return (
    <span style={{
      width: 160, height: 28, boxSizing: 'border-box', flexShrink: 0,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      background: C.bgBlock, border: `1px solid ${C.border}`,
      borderRadius: 8, padding: '0 11px',
      fontFamily: FONT, fontSize: 13, fontWeight: 500, color: C.textDim,
      userSelect: 'none',
    }}>
      {label}
    </span>
  );
}

function TimeSection({ chip, onStartMinutes, onEndMinutes, onDurationChange, onToggleDuration }) {
  const fmtDur = (mins) => {
    if (mins == null || !Number.isFinite(mins) || mins <= 0) return '0:00';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}:${String(m).padStart(2, '0')}`;
  };

  // Local draft so the user can type freely; dispatches only on commit (blur/Enter)
  const [draftDuration, setDraftDuration] = useState(() => fmtDur(chip.durationMinutes));
  const editingDurationRef = useRef(false);

  // Sync from chip whenever we're not actively editing
  useEffect(() => {
    if (!editingDurationRef.current) {
      setDraftDuration(fmtDur(chip.durationMinutes));
    }
  }, [chip.durationMinutes]);

  const commitDuration = useCallback(() => {
    editingDurationRef.current = false;
    onDurationChange?.(draftDuration);
    // Don't reset here — the useEffect will sync once TacticsPage pushes
    // updated chip data back via PLAN_PANEL_CHIP_EVENT.
  }, [draftDuration, onDurationChange]);

  const handleDurationKeyDown = useCallback((e) => {
    if (e.key === 'Enter') { e.currentTarget.blur(); }
    if (e.key === 'Escape') {
      editingDurationRef.current = false;
      setDraftDuration(fmtDur(chip.durationMinutes));
      e.currentTarget.blur();
    }
  }, [chip.durationMinutes]);

  const startMins = chip.startMinutes;
  const endMins = chip.endMinutes ?? (chip.startMinutes != null && chip.durationMinutes != null ? chip.startMinutes + chip.durationMinutes : null);

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Time</SectionLabel>

      <FieldRow
        label="Start time"
        control={<TimeReadout minutes={startMins} />}
      />
      <FieldRow
        label="End time"
        control={<TimeReadout minutes={endMins} />}
      />

      <Divider />

      <FieldRow
        label="Duration"
        control={
          <FieldInput
            value={draftDuration}
            onChange={e => { editingDurationRef.current = true; setDraftDuration(e.target.value); }}
            onBlur={commitDuration}
            onKeyDown={handleDurationKeyDown}
            placeholder="H:MM"
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
    <div style={{ ...BENTO_CARD, marginBottom: 11 }}>
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
      borderTop: '1px solid var(--brand-bd)',
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
  isUpToDate,
  onSendToSystem,
  onViewSchedule,
  onAddChip,
  onOpenColour,
  onNameChange,
  onGoalChange,
  onStartMinutes,
  onEndMinutes,
  onDurationChange,
  onToggleChipDuration,
  onRemoveChip,
}) {
  const hasChip = selectedChip != null;

  return (
    <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {/* Scrollable body */}
      <div style={{ flex: 1, overflowY: 'auto', paddingTop: 20, paddingBottom: 8 }}>
        <UpdateSection isUpToDate={isUpToDate} onSendToSystem={onSendToSystem} />
        {!hasChip ? (
          <>
            <ScheduleLinkSection onViewSchedule={onViewSchedule} onAddChip={onAddChip} />
          </>
        ) : (
          <>
            <ChipSection
              chip={selectedChip}
              onOpenColour={onOpenColour}
              onNameChange={onNameChange}
              onGoalChange={onGoalChange}
            />
            <TimeSection
              chip={selectedChip}
              onStartMinutes={onStartMinutes}
              onEndMinutes={onEndMinutes}
              onDurationChange={onDurationChange}
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
  // Goal dropdown anchor rect (null = closed)
  const [goalAnchorRect, setGoalAnchorRect] = useState(null);
  const slideBackTimerRef = useRef(null);

  // Selected chip data — populated via PLAN_PANEL_CHIP_EVENT
  const [selectedChip, setSelectedChip] = useState(null);

  // All chip options (defaults + projects + customs) — always present even when
  // no chip is selected, so the "Add new chip" goal picker has data to show.
  const [allChips, setAllChips] = useState(null);

  // Goal picker anchor for the "Add new chip" flow (separate from chip-edit flow)
  const [addChipAnchorRect, setAddChipAnchorRect] = useState(null);

  // Ref so the chip-selection effect can call goToMain before it's defined below
  const goToMainRef = useRef(null);

  // Colour pending during colour-picker editing
  const [pendingColour, setPendingColour] = useState(null);

  // Sync state — pushed in via PLAN_PANEL_STATE_EVENT from TacticsPage
  const [isUpToDate, setIsUpToDate] = useState(false);

  // Schedule view data — pushed in via PLAN_PANEL_SCHEDULE_DATA_EVENT
  const [scheduleData, setScheduleData] = useState({
    projects: [], scheduleLayout: null, projectChips: [],
    chipTimeOverrides: {}, incrementMinutes: 30, rowMetrics: {},
  });
  const onDragStartRef = useRef(null);
  const onAddChipRef = useRef(null);

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
      const chips = e.detail?.allChips ?? null;
      setSelectedChip(chip);
      if (chips) setAllChips(chips);
      setAddChipAnchorRect(null);
      if (chip) {
        open();
        goToMainRef.current?.();
      } else if (panelView !== 'main' && panelView !== 'schedule') {
        goToMainRef.current?.();
      }
    };
    window.addEventListener(PLAN_PANEL_CHIP_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_CHIP_EVENT, handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, panelView]);

  // View transitions
  const openView = useCallback((view, setup) => {
    if (slideBackTimerRef.current) {
      clearTimeout(slideBackTimerRef.current);
      slideBackTimerRef.current = null;
    }
    setup?.();
    setSecondSlotView(view);
    setPanelView(view);
  }, []);

  const openColourView = useCallback(() => {
    openView('colour', () => setPendingColour(selectedChip?.colour ?? '#c9daf8'));
  }, [openView, selectedChip?.colour]);

  const openGoalDropdown = useCallback((rect) => {
    setGoalAnchorRect(rect ?? null);
  }, []);


  const openScheduleViewRef = useRef(null);

  const openScheduleView = useCallback(() => {
    openView('schedule');
  }, [openView]);

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
  goToMainRef.current = goToMain;

  // Colour confirm
  const handleColourConfirm = useCallback((colour) => {
    if (!selectedChip) { goToMain(); return; }
    dispatchPlanAction('setChipColour', { chipId: selectedChip.id, colour });
    goToMain();
  }, [selectedChip, goToMain]);

  // Goal confirm
  const handleGoalSelect = useCallback((projectId) => {
    dispatchPlanAction('setChipGoal', { chipId: selectedChip?.id, projectId });
    setGoalAnchorRect(null);
  }, [selectedChip]);

  // Chip field actions — dispatch events for TacticsPage to handle
  const handleNameChange     = useCallback((value) => dispatchPlanAction('setChipName', { chipId: selectedChip?.id, value }), [selectedChip]);
  const handleGoalChange     = useCallback((rect) => openGoalDropdown(rect), [openGoalDropdown]);
  const handleStartMinutes   = useCallback((minutes) => dispatchPlanAction('setChipStartMinutes', { chipId: selectedChip?.id, minutes }), [selectedChip]);
  const handleEndMinutes     = useCallback((minutes) => dispatchPlanAction('setChipEndMinutes', { chipId: selectedChip?.id, minutes }), [selectedChip]);
  const handleDurationChange = useCallback((value) => dispatchPlanAction('setChipDuration', { chipId: selectedChip?.id, value }), [selectedChip]);
  const handleToggleChipClock    = useCallback(() => dispatchPlanAction('toggleChipClock', { chipId: selectedChip?.id }), [selectedChip]);
  const handleToggleChipDuration = useCallback(() => dispatchPlanAction('toggleChipDuration', { chipId: selectedChip?.id }), [selectedChip]);
  const handleRemoveChip    = useCallback(() => dispatchPlanAction('removeChip', { chipId: selectedChip?.id }), [selectedChip]);
  const handleSendToSystem   = useCallback(() => dispatchPlanAction('sendToSystem'), []);

  // "Add new chip" — opens goal picker anchored to the button rect
  const handleAddChip = useCallback((rect) => {
    setAddChipAnchorRect(rect ?? null);
  }, []);
  const handleAddChipGoalSelect = useCallback((projectId) => {
    dispatchPlanAction('addChipToCell', { projectId });
    setAddChipAnchorRect(null);
  }, []);

  // Keep local sync state in sync when TacticsPage pushes state
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.isUpToDate != null) setIsUpToDate(e.detail.isUpToDate);
    };
    window.addEventListener(PLAN_PANEL_STATE_EVENT, handler);
    return () => window.removeEventListener(PLAN_PANEL_STATE_EVENT, handler);
  }, []);

  // Receive schedule data from TacticsPage
  useEffect(() => {
    const handler = (e) => {
      const d = e.detail ?? {};
      onDragStartRef.current = d.onDragStart ?? null;
      onAddChipRef.current = d.onAddChip ?? null;
      setScheduleData({
        projects:        d.projects        ?? [],
        scheduleLayout:  d.scheduleLayout  ?? null,
        projectChips:    d.projectChips    ?? [],
        chipTimeOverrides: d.chipTimeOverrides ?? {},
        incrementMinutes:  d.incrementMinutes  ?? 30,
        rowMetrics:        d.rowMetrics        ?? {},
      });
      // Also capture allChips so the "Add new chip" goal picker always has data.
      // This event fires reliably on mount, avoiding the race where PLAN_PANEL_CHIP_EVENT
      // fires before PlanPanel has registered its listener.
      if (d.allChips) setAllChips(d.allChips);
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

  return (
    <>
      <PanelShell isOpen={isOpen} navBottom={navBottom} width={320} zIndex={99994}>
        {/* Horizontal slider track: 640 px wide, two 320 px views */}
        <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
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
              isUpToDate={isUpToDate}
              onSendToSystem={handleSendToSystem}
              onViewSchedule={openScheduleView}
              onAddChip={handleAddChip}
              onOpenColour={openColourView}
              onNameChange={handleNameChange}
              onGoalChange={handleGoalChange}
              onStartMinutes={handleStartMinutes}
              onEndMinutes={handleEndMinutes}
              onDurationChange={handleDurationChange}
              onToggleChipDuration={handleToggleChipDuration}
              onRemoveChip={handleRemoveChip}
            />

            {/* View 2 — Colour or Schedule */}
            {secondSlotView === 'schedule' ? (
              <ScheduleView
                scheduleData={scheduleData}
                onDragStartRef={onDragStartRef}
                onAddChipRef={onAddChipRef}
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
        </div>
      </PanelShell>

      {/* Goal picker floating dropdowns — portaled by GoalDropdown itself */}
      {goalAnchorRect && (
        <GoalDropdown
          allChips={selectedChip?.allChips}
          currentProjectId={selectedChip?.projectId}
          anchorRect={goalAnchorRect}
          onSelect={handleGoalSelect}
          onClose={() => setGoalAnchorRect(null)}
        />
      )}
      {addChipAnchorRect && (
        <GoalDropdown
          allChips={allChips}
          currentProjectId={null}
          anchorRect={addChipAnchorRect}
          onSelect={handleAddChipGoalSelect}
          onClose={() => setAddChipAnchorRect(null)}
        />
      )}
    </>
  );
}
