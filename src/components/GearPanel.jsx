/**
 * GearPanel
 *
 * Shared settings panel opened by the gear icon in NavigationBar.
 * Fixed right-side overlay, 320 px wide. Horizontally-sliding views:
 *   - Main view    (settings sections)
 *   - History view (version snapshot list)
 *   - Theme view   (theme colour picker)
 *   - Scale view   (per-page + nav bar scale objects)
 *
 * Sections wired to storage are marked // WIRED.
 * Sections pending storage connections are marked // TODO.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PanelShell from './PanelShell';
import { useNavigate } from 'react-router-dom';
import { useGearPanel } from '../contexts/GearPanelContext';
import usePanelWidth from '../hooks/usePanelWidth';
import usePageSize from '../hooks/usePageSize';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { loadSiteSnapshots, restoreSiteSnapshot } from '../lib/snapshotStorage';
import { fmtTimestamp } from '../utils/fmtTimestamp';
import { createDraftYearFromActive } from '../utils/planner/createDraftYear';
import { undoDraftYear } from '../utils/planner/undoDraftYear';
import { ArchiveYearModal } from './ArchiveYearModal';
import CalendarPopup from './CalendarPopup';
import { DeleteAccountModal } from './DeleteAccountModal';
import { saveStartDate } from '../utils/planner/storage';
import {
  peekTacticsCache,
  loadTacticsYearSettings,
  saveTacticsYearSettings,
} from '../lib/tacticsStorage';
import { JUNE_GROUPS } from '../constants/palettePickerGroups';
import { ColourPicker as ColourMixer } from './GoalPanel';
import { applyThemeFamily, colourToThemeKey, familyDisplayName, themeSwatch, DEFAULT_THEME_FAMILY } from '../lib/theme';
import { loadThemeFamily, saveThemeFamily } from '../lib/themeStorage';
import { downloadDataExport } from '../lib/api/dataExport';

// Dispatched by GearPanel so TacticsPage can sync state without a double-save
export const GEAR_TACTICS_SETTINGS_EVENT = 'gear-tactics-settings-update';

export const PLANNER_SETTINGS_UPDATE_EVENT = 'planner-settings-update';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:           '#fff',
  bgBlock:      '#f7f7f5',
  border:       '#e8e8e4',
  borderLight:  '#f0f0ed',
  text:         '#1a1a1a',
  textMed:      '#444',
  textDim:      '#555',
  textFaint:    '#999',
  textLight:    '#bbb',
  green:        'var(--brand-deep)',
  greenDark:    'var(--brand-ink)',
  greenBg:      'var(--brand-tint)',
  greenBorder:  'var(--brand-bd)',
  danger:       '#c0392b',
  dangerBg:     '#fef2f2',
  dangerBorder: '#fca5a5',
};

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

// BentoCard — white elevated card wrapping each section
const BENTO_CARD = {
  background: '#FFFFFF',
  borderRadius: 12,
  padding: '15px 16px',
  margin: '0 11px 7px',
  border: '1px solid #e8e8e4',
  boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--brand-ink)',
      paddingBottom: 9, borderBottom: '1px solid var(--brand-bd)',
      marginBottom: 11,
      fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
    }}>
      {children}
    </div>
  );
}

export function Toggle({ checked, onChange }) {
  return (
    <label style={{ position: 'relative', width: 36, height: 20, flexShrink: 0, cursor: 'pointer', display: 'block' }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ opacity: 0, width: 0, height: 0, position: 'absolute' }}
      />
      <div style={{
        position: 'absolute', inset: 0,
        background: checked ? 'var(--brand-deep)' : '#D9D5E2',
        borderRadius: 20, transition: 'background 0.2s',
      }} />
      <div style={{
        position: 'absolute', top: 3,
        left: checked ? 19 : 3,
        width: 14, height: 14,
        background: '#fff', borderRadius: '50%',
        transition: 'left 0.2s', pointerEvents: 'none',
      }} />
    </label>
  );
}

// Portal-based dropdown — escapes the panel's overflow:hidden
function PanelDropdown({ value, options, onChange }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const handleOpen = e => {
    e.stopPropagation();
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    document.addEventListener('click', close);
    return () => document.removeEventListener('click', close);
  }, [open]);

  const triggerStyle = {
    position: 'relative', display: 'flex', alignItems: 'center', gap: 6,
    background: C.bgBlock, border: `1px solid ${C.border}`, borderRadius: 8,
    padding: '7px 13px', fontSize: 14, fontWeight: 500,
    color: C.text, cursor: 'pointer', minWidth: 110, userSelect: 'none',
  };

  return (
    <>
      <div ref={triggerRef} onClick={handleOpen} style={triggerStyle}>
        <span style={{ flex: 1 }}>{value}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M1 1l3 3 3-3" stroke="#999" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>

      {open && createPortal(
        <div
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed', top: pos.top, left: pos.left,
            background: C.bg, border: `1px solid ${C.border}`, borderRadius: 10,
            boxShadow: '0 4px 16px rgba(0,0,0,0.08)', zIndex: 999999,
            minWidth: 130, overflow: 'hidden',
          }}
        >
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => { onChange(opt); setOpen(false); }}
              style={{
                padding: '10px 16px', fontSize: 14,
                color: opt === value ? 'var(--brand-deep)' : C.textMed,
                fontWeight: opt === value ? 500 : 400,
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = C.bgBlock}
              onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
            >
              {opt}
            </div>
          ))}
        </div>,
        document.body
      )}
    </>
  );
}

// Scroll-wheel time carousel, portal-rendered
const HOUR_VALS = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
const THRESHOLD = 30;

function parseTime(val) {
  const m = val.match(/^(\d+):(\d+)\s+(AM|PM)$/);
  return m ? { h: parseInt(m[1]), min: parseInt(m[2]), ap: m[3] } : { h: 7, min: 0, ap: 'AM' };
}

function TimeCarousel({ value, onChange, incrementMinutes = 60 }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const boxRef = useRef(null);

  // Only the valid minute values for this increment (e.g. [0] / [0,30] / [0,15,30,45])
  const minuteSteps = Array.from(
    { length: Math.max(1, Math.round(60 / incrementMinutes)) },
    (_, i) => i * incrementMinutes,
  );

  // Prevent page scroll while wheeling over the carousel.
  // React's onWheel is passive by default so preventDefault() is a no-op there;
  // a native { passive: false } listener is the only way to block page scroll.
  useEffect(() => {
    if (!open) return;
    const el = boxRef.current;
    if (!el) return;
    const block = (e) => e.preventDefault();
    el.addEventListener('wheel', block, { passive: false });
    return () => el.removeEventListener('wheel', block);
  }, [open]);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const [tH, setTH] = useState(() => parseTime(value).h);
  const [tM, setTM] = useState(() => parseTime(value).min);
  const [tAP, setTAP] = useState(() => parseTime(value).ap);
  const acc = useRef({ h: 0, m: 0, ap: 0 });

  const openPicker = e => {
    e.stopPropagation();
    if (triggerRef.current) {
      const r = triggerRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: Math.min(r.left, window.innerWidth - 210) });
    }
    const p = parseTime(value);
    const snappedMin = minuteSteps.includes(p.min)
      ? p.min
      : minuteSteps.reduce((best, s) => Math.abs(s - p.min) < Math.abs(best - p.min) ? s : best, minuteSteps[0]);
    setTH(p.h); setTM(snappedMin); setTAP(p.ap);
    acc.current = { h: 0, m: 0, ap: 0 };
    setOpen(true);
  };

  const spin = (e, col) => {
    e.preventDefault();
    acc.current[col] += e.deltaY;
    const steps = Math.trunc(acc.current[col] / THRESHOLD);
    if (steps === 0) return;
    acc.current[col] -= steps * THRESHOLD;
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
  };

  const confirm = () => {
    onChange(`${tH}:${String(tM).padStart(2, '0')} ${tAP}`);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const close = e => {
      if (!e.target.closest('[data-time-picker]')) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const hIdx = HOUR_VALS.indexOf(tH);

  // Minute ghost values — only adjacent valid steps, blank when only one step exists
  const mIdx  = minuteSteps.indexOf(tM);
  const mSafe = mIdx === -1 ? 0 : mIdx;
  const mPrev = mSafe > 0 ? String(minuteSteps[mSafe - 1]).padStart(2, '0') : '';
  const mNext = mSafe < minuteSteps.length - 1 ? String(minuteSteps[mSafe + 1]).padStart(2, '0') : '';

  const slotWrap = (onWheel) => ({
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    cursor: 'default', userSelect: 'none', onWheel,
  });
  const ghost = { fontSize: 11, color: '#ccc', padding: '2px 0', textAlign: 'center', width: 32, height: 17 };
  const main  = { fontSize: 14, fontWeight: 500, color: C.text, padding: '3px 0', width: 32, textAlign: 'center' };

  return (
    <>
      <div
        ref={triggerRef}
        onClick={openPicker}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          background: C.bgBlock, border: `1px solid ${C.border}`, borderRadius: 8,
          padding: '6px 11px', fontSize: 13, fontWeight: 500,
          color: C.text, cursor: 'pointer', minWidth: 100, userSelect: 'none',
        }}
      >
        <span style={{ flex: 1 }}>{value}</span>
        <svg width="8" height="5" viewBox="0 0 8 5" fill="none">
          <path d="M1 1l3 3 3-3" stroke="#999" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
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
            {/* Hour */}
            <div {...slotWrap(e => spin(e, 'h'))}>
              <div style={ghost}>{HOUR_VALS[(hIdx - 1 + 12) % 12]}</div>
              <div style={main}>{tH}</div>
              <div style={ghost}>{HOUR_VALS[(hIdx + 1) % 12]}</div>
            </div>
            <span style={{ fontSize: 12, color: '#ccc', padding: '0 1px' }}>:</span>
            {/* Minute */}
            <div {...slotWrap(e => spin(e, 'm'))}>
              <div style={ghost}>{mPrev}</div>
              <div style={main}>{String(tM).padStart(2, '0')}</div>
              <div style={ghost}>{mNext}</div>
            </div>
            <div style={{ width: 1, background: C.border, alignSelf: 'stretch' }} />
            {/* AM/PM */}
            <div {...slotWrap(e => spin(e, 'ap'))}>
              <div style={ghost}>{tAP === 'PM' ? 'AM' : ''}</div>
              <div style={main}>{tAP}</div>
              <div style={ghost}>{tAP === 'AM' ? 'PM' : ''}</div>
            </div>
          </div>
          <button
            onClick={confirm}
            style={{
              height: 26, padding: '0 10px', background: 'var(--brand-deep)', border: 'none',
              borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#fff', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = 'var(--brand)'}
            onMouseLeave={e => e.currentTarget.style.background = 'var(--brand-deep)'}
          >
            Set
          </button>
        </div>,
        document.body
      )}
    </>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

function YourYearSection({ children }) {
  const { refreshMetadata, currentYear, currentYearInfo, allYears, switchToYear } = useYear();

  const { isOpen } = useGearPanel();

  // Reset in-flight state when the panel closes so it never bleeds
  // into the next open cycle.
  useEffect(() => {
    if (!isOpen) {
      setPendingDate(dateVal);
      setIsSavingDate(false);
    }
  }, [isOpen]);

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formatDate = val => {
    if (!val) return '';
    const [y, mo, d] = val.split('-');
    const dt = new Date(Date.UTC(+y, +mo - 1, +d));
    return `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  };

  const dateBlockRef = useRef(null);
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  // Derive saved date from YearContext; fall back to today if metadata hasn't loaded yet
  const dateVal = currentYearInfo?.startDate ?? new Date().toISOString().split('T')[0];

  // Pending state — tracks what the user has picked but not yet confirmed
  const [pendingDate, setPendingDate] = useState(dateVal);
  const [isSavingDate, setIsSavingDate] = useState(false);
  const isDateDirty = pendingDate !== dateVal;

  // Keep pending in sync when the saved date changes (e.g. year switch)
  useEffect(() => {
    setPendingDate(dateVal);
  }, [dateVal]);

  const handleConfirmDate = async () => {
    if (!isDateDirty || isSavingDate) return;
    setIsSavingDate(true);

    // Derive the day of week from the new date (UTC to avoid timezone offset issues)
    const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
    const [y, mo, d] = pendingDate.split('-');
    const startDay = DAYS[new Date(Date.UTC(+y, +mo - 1, +d)).getUTCDay()];

    // Persist start date to years table + notify System page live
    await saveStartDate(pendingDate, undefined, currentYear);

    // Persist startDay into tactics settings + notify Plan page live
    const existingSettings = peekTacticsCache(currentYear).yearSettings ?? {};
    saveTacticsYearSettings({ ...existingSettings, startDay }, currentYear);
    window.dispatchEvent(new CustomEvent(GEAR_TACTICS_SETTINGS_EVENT, {
      detail: { startDay, __eventYear: currentYear },
    }));

    await refreshMetadata();
    setIsSavingDate(false);
  };

  const blockStyle = {
    background: C.bgBlock, border: `1px solid ${C.border}`,
    borderRadius: 10, padding: '11px 14px', marginBottom: 8,
  };
  const metaStyle  = { fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace", fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textLight, marginBottom: 4 };
  const valueStyle = { fontSize: 14, fontWeight: 500, color: C.text };

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Your Year</SectionLabel>

      {/* Viewing year selector — WIRED to YearContext */}
      <div style={blockStyle}>
        <div style={metaStyle}>Viewing</div>
        <select
          value={currentYear}
          onChange={e => switchToYear(Number(e.target.value))}
          style={{
            appearance: 'none', WebkitAppearance: 'none', background: 'transparent',
            border: 'none', fontSize: 14, fontWeight: 500, color: C.text,
            cursor: 'pointer', outline: 'none', paddingRight: 18,
            backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%23999' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E")`,
            backgroundRepeat: 'no-repeat', backgroundPosition: 'right 2px center',
          }}
        >
          {allYears.map(y => {
            const label = y.status === 'active' ? 'Active' : y.status === 'draft' ? 'Draft' : 'Archived';
            return (
              <option key={y.yearNumber} value={y.yearNumber}>
                Year {y.yearNumber} ({label})
              </option>
            );
          })}
        </select>
      </div>

      {/* Cycle start date — WIRED. Custom CalendarPopup replaces the old
          hidden native date input + showPicker(). */}
      <label
        ref={dateBlockRef}
        style={{ ...blockStyle, cursor: 'pointer', display: 'block' }}
        onClick={() => setIsCalendarOpen(open => !open)}
      >
        <div style={metaStyle}>Cycle start</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...valueStyle, color: isDateDirty ? 'var(--brand-deep)' : C.text }}>
            {formatDate(pendingDate)}
          </span>
          <CalendarPopup
            isOpen={isCalendarOpen}
            anchorRef={dateBlockRef}
            value={pendingDate}
            onSelect={setPendingDate}
            onClose={() => setIsCalendarOpen(false)}
          />
          {isDateDirty && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); handleConfirmDate(); }}
              disabled={isSavingDate}
              style={{
                height: 24, padding: '0 10px',
                background: isSavingDate ? C.textLight : 'var(--brand-deep)',
                border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 500, color: '#fff',
                cursor: isSavingDate ? 'default' : 'pointer', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!isSavingDate) e.currentTarget.style.background = 'var(--brand)'; }}
              onMouseLeave={e => { if (!isSavingDate) e.currentTarget.style.background = 'var(--brand-deep)'; }}
            >
              {isSavingDate ? 'Saving…' : 'Set'}
            </button>
          )}
        </div>
      </label>

      {children}
    </div>
  );
}

function TimelineSection({ onShowHistory }) {
  const { activeYear, draftYear, refreshMetadata } = useYear();
  const navigate = useNavigate();
  const { isOpen, close: closePanel } = useGearPanel();

  const [isCreating, setIsCreating]   = useState(false);
  const [isUndoing, setIsUndoing]     = useState(false);
  const [actionError, setActionError] = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);

  // Reset all button state when the panel closes so stale in-flight
  // state never bleeds into the next open cycle.
  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false);
      setIsUndoing(false);
      setActionError(null);
      setShowArchiveModal(false);
    }
  }, [isOpen]);

  const handlePlanNextYear = async () => {
    if (!activeYear || isCreating) return;
    setIsCreating(true);
    setActionError(null);
    const result = await createDraftYearFromActive(activeYear.yearNumber);
    if (result.success) {
      await refreshMetadata();
      closePanel();
      navigate('/staging');
    } else {
      setActionError(result.error || 'Something went wrong.');
      setIsCreating(false);
    }
  };

  const handleUndoDraft = async () => {
    if (isUndoing) return;
    setIsUndoing(true);
    setActionError(null);
    const result = await undoDraftYear();
    if (result.success) {
      setIsUndoing(false);
      refreshMetadata();
    } else {
      setActionError(result.error || 'Something went wrong.');
      setIsUndoing(false);
    }
  };

  // Block "Plan next year" from appearing while an undo is in flight so the
  // two buttons can't swap DOM positions mid-click and cause a misfired event.
  const canPlanNextYear = !!activeYear && !draftYear && !isUndoing;

  const btnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '13px 16px', fontSize: 14, fontWeight: 400,
    color: C.textDim, cursor: 'pointer', width: '100%', textAlign: 'left',
    transition: 'border-color 0.15s, color 0.15s, background 0.15s',
  };

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Timeline</SectionLabel>
      <button
        style={btnStyle}
        onClick={onShowHistory}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-deep)'; e.currentTarget.style.background = 'var(--brand-hover-bg)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; e.currentTarget.style.background = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5.5" stroke="currentColor" strokeWidth="1.2" />
            <path d="M6.5 4v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          View version history
        </div>
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M1 1l5 4.5L1 10" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {/* Plan next year — moved from the Your Year card */}
      {canPlanNextYear && (
        <button
          key="plan-next-year"
          onClick={handlePlanNextYear}
          disabled={isCreating}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '13px 16px', fontSize: 14, fontWeight: 400,
            color: isCreating ? C.textLight : C.textDim,
            cursor: isCreating ? 'default' : 'pointer',
            width: '100%', textAlign: 'left', opacity: isCreating ? 0.6 : 1,
            marginTop: 8,
          }}
          onMouseEnter={e => { if (!isCreating) { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-deep)'; } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = isCreating ? C.textLight : C.textDim; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="2.5" width="11" height="9.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
              <path d="M4 1v3M9 1v3M1 6h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M6.5 8.5v2M5.5 9.5h2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            {isCreating ? 'Setting up next year…' : 'Plan next year'}
          </div>
          {!isCreating && (
            <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
              <path d="M1 1l5 4.5L1 10" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </button>
      )}

      {/* Undo Draft Year — shown instead of Plan Next Year while a draft exists.
          Also shown (disabled) while isUndoing is true so the button stays at
          the same DOM position — prevents "Plan next year" from appearing mid-click
          and triggering a misfired handlePlanNextYear call. */}
      {(draftYear || isUndoing) && (
        <button
          key="undo-draft"
          onClick={handleUndoDraft}
          disabled={isUndoing}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '13px 16px', fontSize: 14, fontWeight: 400,
            color: isUndoing ? C.textLight : C.textDim,
            cursor: isUndoing ? 'default' : 'pointer',
            width: '100%', textAlign: 'left', opacity: isUndoing ? 0.6 : 1,
            marginTop: 8,
          }}
          onMouseEnter={e => { if (!isUndoing) { e.currentTarget.style.borderColor = C.danger; e.currentTarget.style.color = C.danger; } }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = isUndoing ? C.textLight : C.textDim; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M2 7a5 5 0 1 0 1-3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 3.5V7h3.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            {isUndoing ? 'Undoing draft…' : 'Undo Draft Year'}
          </div>
        </button>
      )}

      {/* Archive Year — only shown when a draft year is active */}
      {draftYear && !isUndoing && (
        <button
          key="archive-year"
          onClick={(e) => { e.stopPropagation(); setShowArchiveModal(true); }}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '13px 16px', fontSize: 14, fontWeight: 400,
            color: C.textDim, cursor: 'pointer', width: '100%', textAlign: 'left',
            marginTop: 8,
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#d97706'; e.currentTarget.style.color = '#d97706'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="1" width="11" height="3" rx="1" stroke="currentColor" strokeWidth="1.2" />
              <path d="M2 4v7a1 1 0 001 1h7a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
              <path d="M5 6.5h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
            </svg>
            Archive Year {activeYear?.yearNumber}
          </div>
          <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
            <path d="M1 1l5 4.5L1 10" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {actionError && (
        <div style={{ marginTop: 8, fontSize: 12, color: C.danger, lineHeight: 1.4 }}>
          {actionError}
        </div>
      )}

      {showArchiveModal && (
        <ArchiveYearModal
          isOpen={showArchiveModal}
          onClose={() => setShowArchiveModal(false)}
          yearNumber={activeYear?.yearNumber}
        />
      )}
    </div>
  );
}

function PlanSettingsSection() {
  const { currentYear } = useYear();

  // Hold the full settings object so saves never clobber other fields
  const [settings, setSettings] = useState(() =>
    peekTacticsCache(currentYear).yearSettings ?? null
  );

  // Async refresh in case cache was empty or stale
  useEffect(() => {
    loadTacticsYearSettings(currentYear).then(s => setSettings(s));
  }, [currentYear]);

  // Merge a partial patch, save to Supabase, and notify TacticsPage
  const save = useCallback((patch) => {
    setSettings(prev => {
      const next = { ...(prev ?? {}), ...patch };
      saveTacticsYearSettings(next, currentYear);
      window.dispatchEvent(new CustomEvent(GEAR_TACTICS_SETTINGS_EVENT, {
        detail: { ...next, __eventYear: currentYear },
      }));
      return next;
    });
  }, [currentYear]);

  // Derive UI display values from stored settings
  const clockFormat = settings?.use24Hour ? '24 hour' : 'AM / PM';
  const increment   =
    settings?.incrementMinutes === 15 ? '15 min' :
    settings?.incrementMinutes === 30 ? '30 min' : '1 hour';
  const wakeTime = settings?.startMinute || '7:00 AM';   // startMinute = rise/wake time
  const bedTime  = settings?.startHour   || '11:00 PM';  // startHour  = bed/sleep time

  const rowStyle   = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 };
  const labelStyle = { fontSize: 13, color: C.textMed };

  return (
    <div style={{ marginTop: 18 }}>
      <SectionLabel>Your Schedule</SectionLabel>
      <div style={rowStyle}>
        <span style={labelStyle}>Wake time</span>
        <TimeCarousel value={wakeTime} onChange={v => save({ startMinute: v })} incrementMinutes={settings?.incrementMinutes ?? 60} />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Bed time</span>
        <TimeCarousel value={bedTime} onChange={v => save({ startHour: v })} incrementMinutes={settings?.incrementMinutes ?? 60} />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Time format</span>
        <PanelDropdown
          value={clockFormat}
          options={['AM / PM', '24 hour']}
          onChange={v => save({ use24Hour: v === '24 hour', showAmPm: v !== '24 hour' })}
        />
      </div>
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <span style={labelStyle}>Time increment</span>
        <PanelDropdown
          value={increment}
          options={['1 hour', '30 min', '15 min']}
          onChange={v => save({ incrementMinutes: v === '15 min' ? 15 : v === '30 min' ? 30 : 60 })}
        />
      </div>
    </div>
  );
}

// ─── Stepper (shared by the Scale view) ───────────────────────────────────────

function StepBtn({ onClick, disabled, children }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        width: 28, height: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
        cursor: disabled ? 'not-allowed' : 'pointer',
        fontSize: 18, fontWeight: 300, color: disabled ? C.textFaint : C.textDim,
        background: '#fafaf8', border: 'none',
        transition: 'background 0.1s, color 0.1s',
        padding: 0, lineHeight: 1, fontFamily: FONT,
      }}
      onMouseEnter={e => { if (!disabled) { e.currentTarget.style.background = C.borderLight; e.currentTarget.style.color = C.text; } }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fafaf8'; e.currentTarget.style.color = disabled ? C.textFaint : C.textDim; }}
    >
      {children}
    </button>
  );
}

function StepperRow({ icon, label, value, onDecrease, onIncrease, decreaseDisabled, increaseDisabled }) {
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
      border: `1px solid ${C.border}`, borderRadius: 10, padding: '10px 16px',
    }}>
      <span style={{ fontFamily: FONT, fontSize: 14, color: C.textDim, display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        {icon}
        {label}
      </span>
      <div style={{
        display: 'flex', alignItems: 'center', flex: 1, maxWidth: 200,
        border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
      }}>
        <StepBtn onClick={onDecrease} disabled={decreaseDisabled}>−</StepBtn>
        <span style={{
          flex: 1, minWidth: 38, textAlign: 'center', fontSize: 14, fontWeight: 500, color: C.text,
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

// ─── Scale section + sub-view ─────────────────────────────────────────────────
// All four scales persist via usePageSize ('goal' | 'plan' | 'system' | 'nav');
// each page (and NavigationBar) reads the same key and applies the scale live,
// so the state a stepper is left in IS the final scale — no confirm step.
// Expanding a page's object navigates to that page so the user adjusts by
// sight (the nav bar is always visible, so its object doesn't navigate). // WIRED

const SCALE_ICON = (
  // Lucide zoom-in
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="11" cy="11" r="8"/>
    <line x1="21" x2="16.65" y1="21" y2="16.65"/>
    <line x1="11" x2="11" y1="8" y2="14"/>
    <line x1="8" x2="14" y1="11" y2="11"/>
  </svg>
);

const SCALE_TARGETS = [
  { id: 'goal',   label: 'Goal page',   route: '/staging' },
  { id: 'plan',   label: 'Plan page',   route: '/tactics' },
  { id: 'system', label: 'System page', route: '/' },
  { id: 'nav',    label: 'Nav bar',     route: null },
];

// Expandable object header — same treatment as SystemPanel's ExpandRowHeader
// ("Move from Inbox to Planner").
function ScaleRowHeader({ label, expanded, onToggle }) {
  const [hov, setHov] = useState(false);
  const active = hov || expanded;
  return (
    <div
      onClick={onToggle}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'flex', alignItems: 'center', padding: '13px 16px',
        cursor: 'pointer',
        background: active ? 'var(--brand-hover-bg)' : 'transparent',
        transition: 'background 0.15s',
      }}
    >
      <div style={{
        display: 'flex', alignItems: 'center', gap: 8, flex: 1,
        color: active ? 'var(--brand-deep)' : C.textDim, transition: 'color 0.15s',
      }}>
        <span style={{ display: 'flex' }}>{SCALE_ICON}</span>
        <span style={{ fontFamily: FONT, fontSize: 14 }}>{label}</span>
      </div>
      <svg
        width="7" height="11" viewBox="0 0 7 11" fill="none"
        style={{ transition: 'transform 0.2s, stroke 0.15s', transform: expanded ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
      >
        <path d="M1 1l5 4.5L1 10" stroke={active ? 'var(--brand-deep)' : C.textLight} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  );
}

// One page's (or the nav bar's) collapsible scale object. The stepper writes
// through usePageSize; the target page/nav reads the same key and applies the
// scale live, so there is no confirm step.
function ScaleRow({ target, expanded, onToggle }) {
  const { sizeScale, increaseSize, decreaseSize, minScale, maxScale } = usePageSize(target.id);
  const displayScale = Math.round(sizeScale * 100);

  return (
    <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
      <ScaleRowHeader label={target.label} expanded={expanded} onToggle={onToggle} />
      {expanded && (
        <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px 14px' }}>
          <StepperRow
            icon={SCALE_ICON}
            label="Scale"
            value={`${displayScale}%`}
            onDecrease={decreaseSize}
            onIncrease={increaseSize}
            decreaseDisabled={sizeScale <= minScale + 1e-9}
            increaseDisabled={sizeScale >= maxScale - 1e-9}
          />
        </div>
      )}
    </div>
  );
}

// Scale sub-view — back button + one expandable object per page + the nav bar.
// One object open at a time; expanding a page's object routes to that page.
function ScaleView({ isActive, onBack }) {
  const navigate = useNavigate();
  const [openId, setOpenId] = useState(null);

  // Collapse everything whenever the view slides out of focus
  useEffect(() => { if (!isActive) setOpenId(null); }, [isActive]);

  const handleToggle = (target) => {
    const opening = openId !== target.id;
    setOpenId(opening ? target.id : null);
    if (opening && target.route) navigate(target.route);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
        <ThemeBackButton onClick={onBack} />
      </div>
      <div style={{ ...BENTO_CARD, margin: '8px 12px 0' }}>
        <SectionLabel>Zoom</SectionLabel>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {SCALE_TARGETS.map(t => (
            <ScaleRow key={t.id} target={t} expanded={openId === t.id} onToggle={() => handleToggle(t)} />
          ))}
        </div>
      </div>
    </div>
  );
}

function AccountSection({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Local loading/error state for the export — deliberately NOT wired
  // through useAsyncHandler: flipping global isLoading unmounts routes
  // mid-flow (see the signup flow warning in docs/compliance.md).
  const [isExporting, setIsExporting] = useState(false);
  const [exportError, setExportError] = useState(null);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  const handleDeleteAccount = () => {
    setIsDeleteModalOpen(true);
  };

  const handleDownloadData = async () => {
    if (isExporting) return;
    setIsExporting(true);
    setExportError(null);
    const result = await downloadDataExport();
    setIsExporting(false);
    if (!result.success) {
      setExportError(result.error ?? 'Export failed. Please try again.');
    }
  };

  // Bento-style button — same treatment and hover state as the panel's
  // other buttons (see ThemeBackButton): white card, brand-tint hover.
  const bentoBtnStyle = (hov, disabled = false) => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '6px 11px',
    background: hov && !disabled ? C.greenBg : C.bg,
    border: `1px solid ${hov && !disabled ? C.greenBorder : C.border}`,
    borderRadius: 8,
    boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
    cursor: disabled ? 'default' : 'pointer',
    color: disabled ? C.textFaint : (hov ? C.greenDark : C.textDim),
    fontFamily: FONT, fontSize: 13, fontWeight: 500,
    transition: 'all 0.15s',
  });

  const [logoutHov, setLogoutHov] = useState(false);
  const [editHov, setEditHov] = useState(false);
  const [downloadHov, setDownloadHov] = useState(false);
  const [deleteHov, setDeleteHov] = useState(false);

  return (
    <div style={{ ...BENTO_CARD, marginBottom: 11 }}>
      <SectionLabel>Account</SectionLabel>
      <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>Signed in as</div>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 500, marginBottom: 14 }}>{user?.email ?? ''}</div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleLogout}
          onMouseEnter={() => setLogoutHov(true)}
          onMouseLeave={() => setLogoutHov(false)}
          style={bentoBtnStyle(logoutHov)}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M5 2H2.5A.5.5 0 002 2.5v7a.5.5 0 00.5.5H5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M8 4l2 2-2 2M10 6H5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Log out
        </button>

        <button
          onClick={() => setIsExpanded(prev => !prev)}
          aria-expanded={isExpanded}
          onMouseEnter={() => setEditHov(true)}
          onMouseLeave={() => setEditHov(false)}
          style={{ ...bentoBtnStyle(editHov), justifyContent: 'space-between' }}
        >
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <circle cx="6" cy="4" r="2.2" stroke="currentColor" strokeWidth="1.1" />
              <path d="M1.8 10.4c.6-2 2.2-3 4.2-3s3.6 1 4.2 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            </svg>
            Edit account
          </span>
          <svg
            width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
            style={{
              color: C.textFaint,
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.2s',
            }}
          >
            <path d="m9 18 6-6-6-6" />
          </svg>
        </button>

        {isExpanded && (
          <div style={{
            // Same inset block treatment as the panel's other grouped
            // content (e.g. the Your Year card's blockStyle)
            background: C.bgBlock, border: `1px solid ${C.border}`,
            borderRadius: 10, padding: '11px 14px',
            display: 'flex', flexDirection: 'column', gap: 8,
          }}>
            <button
              onClick={handleDownloadData}
              disabled={isExporting}
              onMouseEnter={() => setDownloadHov(true)}
              onMouseLeave={() => setDownloadHov(false)}
              style={bentoBtnStyle(downloadHov, isExporting)}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1.5v6M3.5 5.5L6 8l2.5-2.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M2 8.5v1a1 1 0 001 1h6a1 1 0 001-1v-1" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
              {isExporting ? 'Preparing export…' : 'Download my data'}
            </button>
            {exportError && (
              <div style={{ fontSize: 11.5, color: C.danger, padding: '0 2px' }}>
                {exportError}
              </div>
            )}
            <button
              onClick={handleDeleteAccount}
              onMouseEnter={() => setDeleteHov(true)}
              onMouseLeave={() => setDeleteHov(false)}
              style={{
                ...bentoBtnStyle(deleteHov),
                background: deleteHov ? C.dangerBg : C.bg,
                border: `1px solid ${C.dangerBorder}`,
                color: C.danger,
              }}
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M1.5 3h9M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3l-.5 7a1 1 0 01-1 .5H3a1 1 0 01-1-.5L1.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Delete account
            </button>
          </div>
        )}
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}

// ─── Appearance (colour theme) ────────────────────────────────────────────────

const PALETTE_ICON = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="13.5" cy="6.5" r=".5" fill="currentColor"/><circle cx="17.5" cy="10.5" r=".5" fill="currentColor"/>
    <circle cx="8.5" cy="7.5" r=".5" fill="currentColor"/><circle cx="6.5" cy="12.5" r=".5" fill="currentColor"/>
    <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10c.926 0 1.648-.746 1.648-1.688 0-.437-.18-.835-.437-1.125-.29-.289-.438-.652-.438-1.125a1.64 1.64 0 0 1 1.668-1.668h1.996c3.051 0 5.555-2.503 5.555-5.554C21.965 6.012 17.461 2 12 2z"/>
  </svg>
);

// The Appearance card in the main settings view. Shows the current theme
// family (14px dot + name + chevron) and opens the theme picker sub-view.
function AppearanceSection({ themeFamily, onShowTheme, onShowScale }) {
  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Appearance</SectionLabel>
      <button
        onClick={onShowTheme}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '13px 16px', fontSize: 14, fontWeight: 400,
          color: C.textDim, cursor: 'pointer', width: '100%', textAlign: 'left',
          fontFamily: FONT, gap: 8,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-deep)'; e.currentTarget.style.background = 'var(--brand-hover-bg)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; e.currentTarget.style.background = 'none'; }}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
          {PALETTE_ICON}
          Theme colour
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 500, color: C.text }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
            background: themeSwatch(themeFamily, 60) ?? 'var(--th-60)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.10)',
          }} />
          {familyDisplayName(themeFamily)}
          <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
            <path d="M1 1l5 4.5L1 10" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </span>
      </button>

      <button
        onClick={onShowScale}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
          padding: '13px 16px', fontSize: 14, fontWeight: 400,
          color: C.textDim, cursor: 'pointer', width: '100%', textAlign: 'left',
          fontFamily: FONT, marginTop: 8,
          transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-deep)'; e.currentTarget.style.background = 'var(--brand-hover-bg)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; e.currentTarget.style.background = 'none'; }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {SCALE_ICON}
          Zoom
        </div>
        <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
          <path d="M1 1l5 4.5L1 10" stroke="#ccc" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>
    </div>
  );
}

// Theme picker sub-view — the Goal page colour picker panel (ColourView
// in GoalPanel.jsx), reusing its exact palette (JUNE_GROUPS) and bento
// treatment. Any picked shade becomes the theme's main colour and the
// remaining steps are extrapolated from it (see theme.js). Saved family
// names from before this change still apply as before. Clicking a shade
// previews the theme live across the app; Confirm persists it, and leaving
// the view (Back or panel close) without confirming reverts to the saved
// theme. No Neutrals card (a theme must be a hue).

const hslStr = ([h, s, l]) => `hsl(${h}, ${s}%, ${l}%)`;

// Bento-style back button — same as the Goal page colour picker's
function ThemeBackButton({ onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 11px',
        background: hov ? C.greenBg : C.bg,
        border: `1px solid ${hov ? C.greenBorder : C.border}`,
        borderRadius: 8,
        boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
        cursor: 'pointer',
        color: hov ? C.greenDark : C.textDim,
        fontFamily: FONT, fontSize: 13, fontWeight: 500,
        transition: 'all 0.15s',
      }}
    >
      <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
        <path d="M4.5 1L1 4.5l3.5 3.5" stroke={C.green} strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Back
    </button>
  );
}

// Solid confirm button — filled with the brand colour so the commit
// action is unmissable next to the quiet back button
function ThemeConfirmButton({ onClick, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 8,
        padding: '6px 14px',
        background: disabled ? '#D9D5E2' : (hov ? 'var(--brand-ink)' : 'var(--brand-deep)'),
        border: '1px solid transparent',
        borderRadius: 8,
        boxShadow: disabled ? 'none' : '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.12)',
        cursor: disabled ? 'default' : 'pointer',
        color: '#fff',
        fontFamily: FONT, fontSize: 13, fontWeight: 600,
        transition: 'all 0.15s',
      }}
    >
      <svg width="11" height="9" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
      Confirm
    </button>
  );
}

function ThemeView({ themeFamily, isActive, onBack, onCommit }) {
  const [pending, setPending] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [mixerOpen, setMixerOpen] = useState(false);

  // Reset staged colour whenever the committed family changes
  useEffect(() => { setPending(null); }, [themeFamily]);

  // Stage a colour as the main theme colour and preview it live. The
  // picked colour IS the theme key; the other steps are extrapolated.
  const stage = (colour) => {
    const key = colourToThemeKey(colour);
    setPending(key);
    applyThemeFamily(key);
  };

  // Leaving the view (Back or panel close) without confirming reverts
  // the live preview to the saved family. The pane stays mounted in the
  // slider, so this keys off isActive rather than unmount.
  useEffect(() => {
    if (!isActive && pending) {
      applyThemeFamily(themeFamily);
      setPending(null);
    }
    if (!isActive) setMixerOpen(false);
  }, [isActive, pending, themeFamily]);

  const currentSwatch = themeSwatch(themeFamily, 60);
  const selectedColour = pending ?? currentSwatch;
  const pendingFamily = pending ?? themeFamily;

  const handleEyedropper = async () => {
    if (!('EyeDropper' in window)) return;
    try {
      const result = await new window.EyeDropper().open();
      stage(result.sRGBHex);
    } catch { /* cancelled */ }
  };

  const handleConfirm = async () => {
    if (isSaving || !pending) return;
    setIsSaving(true);
    try {
      await onCommit(pendingFamily);
      setPending(null);
    } finally {
      setIsSaving(false);
    }
  };

  const cardLabel = {
    fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
    fontSize: 10, fontWeight: 700,
    letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-ink)',
    marginBottom: 2,
  };

  // A family's 6 shades as a horizontal strip — same as the Goal page
  // picker's renderFamilyRow
  const renderFamilyRow = (shades, keyPrefix) => (
    <div key={keyPrefix} style={{ display: 'flex', gap: 2, marginTop: 4 }}>
      {shades.map((hsl, idx) => {
        const bg = hslStr(hsl);
        const active = selectedColour === bg;
        const paleBorder = hsl[2] >= 95 ? { outline: '0.5px solid #ddd', outlineOffset: -1 } : {};
        return (
          <button
            key={`${keyPrefix}-${idx}`}
            onClick={() => stage(bg)}
            style={{
              flex: 1, height: 14, borderRadius: 2, background: bg,
              border: 'none', cursor: 'pointer', padding: 0, position: 'relative',
              transition: 'transform 0.1s',
              outline: active ? '2px solid rgba(0,0,0,0.35)' : 'none',
              outlineOffset: -1,
              ...paleBorder,
            }}
            onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.12)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}
          />
        );
      })}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {/* Back + Confirm */}
      <div style={{ padding: '16px 12px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <ThemeBackButton onClick={onBack} />
        <ThemeConfirmButton onClick={handleConfirm} disabled={isSaving || !pending} />
      </div>

      {/* Staged selection — dot + family name */}
      <div style={{ ...BENTO_CARD, margin: '8px 12px 0', padding: '10px 12px' }}>
        <div style={cardLabel}>Theme colour</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
          <span style={{
            width: 14, height: 14, borderRadius: 4, flexShrink: 0,
            background: themeSwatch(pendingFamily, 60) ?? 'var(--th-60)',
            boxShadow: 'inset 0 0 0 1px rgba(0,0,0,.10)',
          }} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text, fontFamily: FONT }}>
            {familyDisplayName(pendingFamily)}
          </span>
          {pending && pendingFamily !== themeFamily && (
            <span style={{ fontSize: 11, color: C.textFaint, fontFamily: FONT }}>
              (was {familyDisplayName(themeFamily)})
            </span>
          )}
        </div>
      </div>

      {/* Palette sections — one card per JUNE_GROUPS entry, minus Neutrals
          (a theme must resolve to a hue family) */}
      {JUNE_GROUPS.filter(({ label }) => label !== 'Neutrals').map(({ label, families }) => (
        <div key={label} style={{ ...BENTO_CARD, margin: '8px 12px 0', padding: '10px 12px' }}>
          <div style={cardLabel}>{label}</div>
          {families.map(({ name, shades }) => renderFamilyRow(shades, `${label}-${name}`))}
        </div>
      ))}

      {/* Custom */}
      <div style={{ ...BENTO_CARD, margin: '8px 12px 12px', padding: '10px 12px' }}>
        <div style={{ ...cardLabel, marginBottom: 6 }}>Custom</div>
        <div style={{ display: 'flex', gap: 3, flexWrap: 'wrap' }}>
          {'EyeDropper' in window && (
            <button
              onClick={handleEyedropper}
              title="Pick from screen"
              style={{
                width: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: C.bgBlock, border: `1px solid ${C.border}`,
                cursor: 'pointer', color: C.textFaint,
                transition: 'color 0.15s, border-color 0.15s, background 0.15s',
              }}
              onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
              onMouseLeave={e => { e.currentTarget.style.color = C.textFaint; e.currentTarget.style.borderColor = C.border; e.currentTarget.style.background = C.bgBlock; }}
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M12 19l7-7 3 3-7 7-3-3z"/><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z"/>
                <path d="M2 2l7.586 7.586"/><circle cx="11" cy="11" r="2"/>
              </svg>
            </button>
          )}
          <button
            title="Custom colour mixer"
            onClick={() => setMixerOpen(v => !v)}
            style={{
              width: 26, height: 26, borderRadius: 4, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: mixerOpen ? C.borderLight : C.bgBlock,
              border: `1px solid ${mixerOpen ? '#aaa' : C.border}`,
              cursor: 'pointer', color: mixerOpen ? C.text : C.textFaint,
              transition: 'color 0.15s, border-color 0.15s, background 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.color = C.text; e.currentTarget.style.borderColor = '#aaa'; e.currentTarget.style.background = C.borderLight; }}
            onMouseLeave={e => {
              if (!mixerOpen) {
                e.currentTarget.style.color = C.textFaint;
                e.currentTarget.style.borderColor = C.border;
                e.currentTarget.style.background = C.bgBlock;
              }
            }}
          >
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 11l-8-8-8.5 8.5a5.5 5.5 0 007.78 7.78L19 11z"/><path d="M20 23a2 2 0 001.4-3.4L16 14"/>
              <line x1="3.5" y1="11.5" x2="13" y2="2"/>
            </svg>
          </button>
        </div>
        {mixerOpen && (
          <ColourMixer
            currentColor={selectedColour}
            onSelect={stage}
            onConfirm={c => { stage(c); setMixerOpen(false); }}
          />
        )}
      </div>
    </div>
  );
}

// ─── Version history view ─────────────────────────────────────────────────────


function snapSummary(snap) {
  const parts = [];
  const projects = snap.goal?.shortlist?.length ?? 0;
  if (projects > 0) parts.push(`${projects} project${projects !== 1 ? 's' : ''}`);
  const chips = snap.plan?.chips?.projectChips?.length ?? 0;
  if (chips > 0) parts.push(`${chips} chip${chips !== 1 ? 's' : ''}`);
  const tasks = (snap.system?.taskRows ?? []).filter(
    r => r && r.__rowType !== 'header' && !r.isArchiveRow && !r.isCalendarHeader
  ).length;
  if (tasks > 0) parts.push(`${tasks} task${tasks !== 1 ? 's' : ''}`);
  return parts.length > 0 ? parts.join(' · ') : 'Empty snapshot';
}

function ConfirmRestoreModal({ snapshot, onConfirm, onCancel, isRestoring, use24Hour }) {
  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 1000010, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(0,0,0,0.4)' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onCancel(); }}
    >
      <div style={{
        background: '#fff', borderRadius: 14, border: '1px solid #e2e8f0',
        boxShadow: '0 8px 32px rgba(0,0,0,0.2)', padding: 24,
        maxWidth: 360, width: '100%', margin: '0 16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
          <svg width="18" height="18" viewBox="0 0 18 18" fill="none" style={{ flexShrink: 0, marginTop: 2 }}>
            <path d="M9 2L2 15h14L9 2z" stroke="#f59e0b" strokeWidth="1.5" strokeLinejoin="round" />
            <path d="M9 8v3M9 13v.5" stroke="#f59e0b" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <div>
            <p style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 6 }}>Restore this version?</p>
            <p style={{ fontSize: 13, color: '#64748b', lineHeight: 1.5 }}>
              This will replace your Goal, Plan, and System pages with the version from{' '}
              <span style={{ fontWeight: 500, color: '#334155' }}>{fmtTimestamp(snapshot.created_at, { use24Hour })}</span>.
              This cannot be undone.
            </p>
          </div>
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
          <button
            onClick={onCancel}
            disabled={isRestoring}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 500, color: '#64748b', background: 'transparent', border: 'none', borderRadius: 8, cursor: 'pointer' }}
            onMouseEnter={e => e.currentTarget.style.background = '#f1f5f9'}
            onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            disabled={isRestoring}
            style={{ padding: '8px 16px', fontSize: 13, fontWeight: 600, color: '#fff', background: '#e11d48', border: 'none', borderRadius: 8, cursor: 'pointer', opacity: isRestoring ? 0.7 : 1 }}
          >
            {isRestoring ? 'Restoring...' : 'Restore'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

function HistoryView({ onBack, isActive, use24Hour }) {
  // WIRED: loads + restores snapshots via snapshotStorage
  const { currentYear } = useYear();
  const navigate = useNavigate();

  const [snapshots, setSnapshots]       = useState([]);
  const [isLoading, setIsLoading]       = useState(false);
  const [error, setError]               = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);
  const [isRestoring, setIsRestoring]   = useState(false);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const rows = await loadSiteSnapshots(currentYear);
      setSnapshots(rows);
    } catch {
      setError('Could not load version history.');
    } finally {
      setIsLoading(false);
    }
  }, [currentYear]);

  // Load whenever this view slides into focus
  useEffect(() => {
    if (isActive) load();
  }, [isActive, load]);

  const handleRestore = async () => {
    if (!confirmTarget) return;
    setIsRestoring(true);
    try {
      await restoreSiteSnapshot(confirmTarget, currentYear);
      setConfirmTarget(null);
      onBack();
      navigate('/');
      window.location.reload();
    } catch {
      setIsRestoring(false);
      setConfirmTarget(null);
      setError('Restore failed. Please try again.');
    }
  };

  return (
    <>
      {/* Sticky header */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: 10,
        padding: '16px 18px 12px', borderBottom: '1px solid var(--brand-bd)',
        position: 'sticky', top: 0, background: 'rgba(255,255,255,0.92)', zIndex: 2,
      }}>
        <button
          onClick={onBack}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.textLight, display: 'flex', alignItems: 'center', padding: 0, width: 'fit-content' }}
          onMouseEnter={e => e.currentTarget.style.color = C.text}
          onMouseLeave={e => e.currentTarget.style.color = C.textLight}
        >
          <svg width="9" height="14" viewBox="0 0 7 11" fill="none">
            <path d="M6 1L1 5.5 6 10" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
        <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Version History</span>
      </div>

      {/* List */}
      <div style={{ padding: '0 28px 40px 22px' }}>
        {isLoading && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: C.textFaint, fontSize: 13 }}>
            Loading...
          </div>
        )}

        {!isLoading && error && (
          <div style={{ padding: '24px 0', textAlign: 'center' }}>
            <p style={{ fontSize: 13, color: '#e11d48' }}>{error}</p>
            <button onClick={load} style={{ marginTop: 8, fontSize: 12, color: C.textFaint, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}>
              Try again
            </button>
          </div>
        )}

        {!isLoading && !error && snapshots.length === 0 && (
          <div style={{ padding: '32px 0', textAlign: 'center', color: C.textFaint, fontSize: 13 }}>
            No snapshots yet.
          </div>
        )}

        {!isLoading && !error && snapshots.map((snap, idx) => (
          <div
            key={snap.id}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 0', borderBottom: `1px solid ${C.borderLight}` }}
          >
            <div>
              <div style={{ fontSize: 13, color: '#333' }}>
                {fmtTimestamp(snap.created_at, { use24Hour })}
                {idx === 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--brand-deep)', background: 'var(--brand-tint)', padding: '2px 7px', borderRadius: 4, marginLeft: 7, verticalAlign: 'middle' }}>
                    Latest
                  </span>
                )}
              </div>
              <div style={{ fontSize: 11, color: '#aaa', marginTop: 2 }}>{snapSummary(snap)}</div>
            </div>
            <button
              onClick={() => setConfirmTarget(snap)}
              style={{ background: 'none', border: `1px solid ${C.border}`, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 500, color: C.textDim, cursor: 'pointer', flexShrink: 0 }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = C.text; e.currentTarget.style.color = C.text; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
            >
              Restore
            </button>
          </div>
        ))}

        {!isLoading && !error && snapshots.length > 0 && (
          <p style={{ fontSize: 11, color: C.textLight, marginTop: 14, lineHeight: 1.5 }}>
            Up to 50 snapshots are kept. Older ones are removed automatically.
          </p>
        )}
      </div>

      {confirmTarget && (
        <ConfirmRestoreModal
          snapshot={confirmTarget}
          onConfirm={handleRestore}
          onCancel={() => setConfirmTarget(null)}
          isRestoring={isRestoring}
          use24Hour={use24Hour}
        />
      )}
    </>
  );
}

// ─── GearPanel ────────────────────────────────────────────────────────────────

export default function GearPanel() {
  const { isOpen, close } = useGearPanel();
  const { currentYear } = useYear();
  const [showHistory, setShowHistory] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [showScale, setShowScale] = useState(false);

  // Colour theme family — loaded once, updated on commit from ThemeView
  const [themeFamily, setThemeFamily] = useState(DEFAULT_THEME_FAMILY);
  useEffect(() => {
    loadThemeFamily().then(setThemeFamily);
  }, []);

  const handleThemeCommit = async (family) => {
    applyThemeFamily(family);
    setThemeFamily(family);
    try {
      await saveThemeFamily(family); // fires theme-state-update
    } catch {
      // Save failed — keep the applied theme for this session; it will
      // fall back to the stored value on next load.
    }
    setShowTheme(false);
  };
  const [navBottom, setNavBottom] = useState(0);
  const { width: panelWidth, setWidth: setPanelWidth, minWidth, maxWidth } = usePanelWidth();

  // Track clock format at the GearPanel level so HistoryView always has the
  // latest value without managing its own copy.
  const [use24Hour, setUse24Hour] = useState(
    () => peekTacticsCache(currentYear).yearSettings?.use24Hour ?? false
  );
  useEffect(() => {
    loadTacticsYearSettings(currentYear).then(s => setUse24Hour(s?.use24Hour ?? false));
  }, [currentYear]);
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.__eventYear !== currentYear) return;
      if ('use24Hour' in (e.detail ?? {})) setUse24Hour(e.detail.use24Hour);
    };
    window.addEventListener(GEAR_TACTICS_SETTINGS_EVENT, handler);
    return () => window.removeEventListener(GEAR_TACTICS_SETTINGS_EVENT, handler);
  }, [currentYear]);

  // Measure the NavigationBar's bottom edge so the panel starts below it
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

  // Reset sub-views when panel closes
  useEffect(() => {
    if (!isOpen) { setShowHistory(false); setShowTheme(false); setShowScale(false); }
  }, [isOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  // Which sub-view the slider shows. visibleSub keeps the outgoing sub-view
  // on screen while the pane slides back to Main after Back is pressed.
  const activeSub = showHistory ? 'history' : showTheme ? 'theme' : showScale ? 'scale' : null;
  const [lastSub, setLastSub] = useState(null);
  useEffect(() => { if (activeSub) setLastSub(activeSub); }, [activeSub]);
  const visibleSub = activeSub ?? lastSub;

  return (
    <PanelShell
      isOpen={isOpen}
      navBottom={navBottom}
      width={panelWidth}
      zIndex={99996}
      onWidthChange={setPanelWidth}
      minWidth={minWidth}
      maxWidth={maxWidth}
    >
      {/* Two-pane slider — 200% wide (two ½ panes), not fixed px.
          PanelShell's frosted tray is inset 7px from the panel's own width,
          so it's narrower than that width prop; percentage-based sizing
          always matches the tray's real width instead of overflowing past
          its right edge. The second pane STACKS the three sub-views
          (History / Theme / Scale) in the same slot, with only the current
          one visible — so opening any of them slides one step right without
          the others streaking past. All stay mounted (their isActive props
          drive load/revert logic), and the outgoing sub-view stays visible
          while the pane slides back to Main. */}
      <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div
          style={{
            display: 'flex',
            width: '200%',
            flex: 1,
            minHeight: 0,
            transform: activeSub ? 'translateX(-50%)' : 'translateX(0)',
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Main view */}
          <div className="no-scrollbar" style={{ width: '50%', flexShrink: 0, overflowY: 'auto', paddingTop: 20, paddingBottom: 24 }}>
            <YourYearSection>
              <PlanSettingsSection />
            </YourYearSection>
            <TimelineSection onShowHistory={() => setShowHistory(true)} />
            <AppearanceSection themeFamily={themeFamily} onShowTheme={() => setShowTheme(true)} onShowScale={() => setShowScale(true)} />
            <AccountSection onClose={close} />
          </div>

          {/* Sub-view slot — stacked layers, one visible at a time */}
          <div style={{ width: '50%', flexShrink: 0, position: 'relative' }}>
            <div className="no-scrollbar" style={{ position: 'absolute', inset: 0, overflowY: 'auto', visibility: visibleSub === 'history' ? 'visible' : 'hidden' }}>
              <HistoryView onBack={() => setShowHistory(false)} isActive={showHistory && isOpen} use24Hour={use24Hour} />
            </div>
            <div className="no-scrollbar" style={{ position: 'absolute', inset: 0, overflowY: 'auto', visibility: visibleSub === 'theme' ? 'visible' : 'hidden' }}>
              <ThemeView themeFamily={themeFamily} isActive={showTheme && isOpen} onBack={() => setShowTheme(false)} onCommit={handleThemeCommit} />
            </div>
            <div className="no-scrollbar" style={{ position: 'absolute', inset: 0, overflowY: 'auto', visibility: visibleSub === 'scale' ? 'visible' : 'hidden' }}>
              <ScaleView isActive={showScale && isOpen} onBack={() => setShowScale(false)} />
            </div>
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
