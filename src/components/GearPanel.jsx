/**
 * GearPanel
 *
 * Shared settings panel opened by the gear icon in NavigationBar.
 * Fixed right-side overlay, 320 px wide. Two horizontally-sliding views:
 *   - Main view  (settings sections)
 *   - History view (version snapshot list)
 *
 * Sections wired to storage are marked // WIRED.
 * Sections pending storage connections are marked // TODO.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useGearPanel } from '../contexts/GearPanelContext';
import { useAuth } from '../contexts/AuthContext';
import { useYear } from '../contexts/YearContext';
import { loadSiteSnapshots, restoreSiteSnapshot } from '../lib/snapshotStorage';
import { createDraftYearFromActive } from '../utils/planner/createDraftYear';
import { undoDraftYear } from '../utils/planner/undoDraftYear';
import { ArchiveYearModal } from './ArchiveYearModal';
import { DeleteAccountModal } from './DeleteAccountModal';
import {
  peekPlannerCache,
  readShowRecurring,
  readShowSubprojects,
  readShowMaxMinRows,
  saveStartDate,
} from '../utils/planner/storage';
import {
  peekTacticsCache,
  loadTacticsYearSettings,
  saveTacticsYearSettings,
} from '../lib/tacticsStorage';

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
  green:        '#1a7a5c',
  greenDark:    '#1a5c3a',
  danger:       '#c0392b',
  dangerBg:     '#fdf0ef',
  dangerBorder: '#f0c0c0',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SECTION = {
  borderBottom: `1px solid ${C.borderLight}`,
  padding: '20px 28px 20px 22px',
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textLight, marginBottom: 16,
    }}>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }) {
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
        background: checked ? C.green : '#ddd',
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
    padding: '6px 11px', fontSize: 13, fontWeight: 500,
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
                padding: '8px 14px', fontSize: 13,
                color: opt === value ? C.green : C.textMed,
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
              height: 26, padding: '0 10px', background: C.greenDark, border: 'none',
              borderRadius: 6, fontSize: 12, fontWeight: 500, color: '#fff', cursor: 'pointer',
            }}
            onMouseEnter={e => e.currentTarget.style.background = C.green}
            onMouseLeave={e => e.currentTarget.style.background = C.greenDark}
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

function YourYearSection() {
  const { activeYear, draftYear, refreshMetadata, currentYear, currentYearInfo, allYears, switchToYear } = useYear();
  const navigate = useNavigate();

  const [isCreating, setIsCreating]     = useState(false);
  const [isUndoing, setIsUndoing]       = useState(false);
  const [actionError, setActionError]   = useState(null);
  const [showArchiveModal, setShowArchiveModal] = useState(false);
  const { isOpen, close: closePanel } = useGearPanel();

  // Reset all button state when the panel closes so stale in-flight
  // state never bleeds into the next open cycle.
  useEffect(() => {
    if (!isOpen) {
      setIsCreating(false);
      setIsUndoing(false);
      setActionError(null);
      setShowArchiveModal(false);
      setPendingDate(dateVal);
      setIsSavingDate(false);
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

  const DAYS   = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const formatDate = val => {
    if (!val) return '';
    const [y, mo, d] = val.split('-');
    const dt = new Date(Date.UTC(+y, +mo - 1, +d));
    return `${DAYS[dt.getUTCDay()]} ${dt.getUTCDate()} ${MONTHS[dt.getUTCMonth()]} ${dt.getUTCFullYear()}`;
  };

  const dateInputRef = useRef(null);
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
  const metaStyle  = { fontSize: 10, fontWeight: 600, letterSpacing: '0.07em', textTransform: 'uppercase', color: C.textLight, marginBottom: 4 };
  const valueStyle = { fontSize: 14, fontWeight: 500, color: C.text };

  return (
    <div style={SECTION}>
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

      {/* Cycle start date — WIRED */}
      <label
        style={{ ...blockStyle, cursor: 'pointer', display: 'block' }}
        onClick={() => dateInputRef.current?.showPicker?.()}
      >
        <div style={metaStyle}>Cycle start</div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ ...valueStyle, color: isDateDirty ? C.green : C.text }}>
            {formatDate(pendingDate)}
          </span>
          <input
            ref={dateInputRef}
            type="date"
            value={pendingDate}
            onChange={e => setPendingDate(e.target.value)}
            style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }}
          />
          {isDateDirty && (
            <button
              onClick={e => { e.preventDefault(); e.stopPropagation(); handleConfirmDate(); }}
              disabled={isSavingDate}
              style={{
                height: 24, padding: '0 10px',
                background: isSavingDate ? C.textLight : C.greenDark,
                border: 'none', borderRadius: 6,
                fontSize: 11, fontWeight: 500, color: '#fff',
                cursor: isSavingDate ? 'default' : 'pointer', flexShrink: 0,
              }}
              onMouseEnter={e => { if (!isSavingDate) e.currentTarget.style.background = C.green; }}
              onMouseLeave={e => { if (!isSavingDate) e.currentTarget.style.background = C.greenDark; }}
            >
              {isSavingDate ? 'Saving…' : 'Set'}
            </button>
          )}
        </div>
      </label>

      {/* Plan next year */}
      {canPlanNextYear && (
        <button
          key="plan-next-year"
          onClick={handlePlanNextYear}
          disabled={isCreating}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
            padding: '11px 14px', fontSize: 13, fontWeight: 400,
            color: isCreating ? C.textLight : C.textDim,
            cursor: isCreating ? 'default' : 'pointer',
            width: '100%', textAlign: 'left', opacity: isCreating ? 0.6 : 1,
          }}
          onMouseEnter={e => { if (!isCreating) { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; } }}
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
            padding: '11px 14px', fontSize: 13, fontWeight: 400,
            color: isUndoing ? C.textLight : C.textDim,
            cursor: isUndoing ? 'default' : 'pointer',
            width: '100%', textAlign: 'left', opacity: isUndoing ? 0.6 : 1,
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
            padding: '11px 14px', fontSize: 13, fontWeight: 400,
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

function TimelineSection({ onShowHistory }) {
  const btnStyle = {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
    background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
    padding: '11px 14px', fontSize: 13, fontWeight: 400,
    color: C.textDim, cursor: 'pointer', width: '100%', textAlign: 'left',
  };

  return (
    <div style={SECTION}>
      <SectionLabel>Timeline</SectionLabel>
      <button
        style={btnStyle}
        onClick={onShowHistory}
        onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
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
    </div>
  );
}

function SystemSettingsSection() {
  const { currentYear } = useYear();

  // Initialise from in-memory cache for instant rendering on panel open
  const cached = () => peekPlannerCache(currentYear).plannerSettings;
  const [showRecurring,    setShowRecurring]    = useState(() => { const r = cached(); return r ? r.show_recurring    !== false : true; });
  const [showSubprojects,  setShowSubprojects]  = useState(() => { const r = cached(); return r ? r.show_subprojects  !== false : true; });
  const [showMinMax,       setShowMinMax]       = useState(() => { const r = cached(); return r ? r.show_max_min_rows !== false : true; });

  // Async refresh in case the cache was empty or stale
  useEffect(() => {
    readShowRecurring(currentYear).then(v   => setShowRecurring(v));
    readShowSubprojects(currentYear).then(v => setShowSubprojects(v));
    readShowMaxMinRows(currentYear).then(v  => setShowMinMax(v));
  }, [currentYear]);

  const dispatchUpdate = (patch) => {
    window.dispatchEvent(new CustomEvent(PLANNER_SETTINGS_UPDATE_EVENT, {
      detail: { ...patch, __eventYear: currentYear },
    }));
  };

  const rowStyle  = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 };
  const labelStyle = { fontSize: 13, color: C.textMed };

  return (
    <div style={SECTION}>
      <SectionLabel>System page settings</SectionLabel>
      <div style={rowStyle}>
        <span style={labelStyle}>Show recurring</span>
        <Toggle checked={showRecurring} onChange={val => { setShowRecurring(val); dispatchUpdate({ showRecurring: val }); }} />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Show subprojects</span>
        <Toggle checked={showSubprojects} onChange={val => { setShowSubprojects(val); dispatchUpdate({ showSubprojects: val }); }} />
      </div>
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <span style={labelStyle}>Show max/min hours</span>
        <Toggle checked={showMinMax} onChange={val => { setShowMinMax(val); dispatchUpdate({ showMaxMinRows: val }); }} />
      </div>
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
    <div style={SECTION}>
      <SectionLabel>Plan page settings</SectionLabel>
      <div style={rowStyle}>
        <span style={labelStyle}>Clock format</span>
        <PanelDropdown
          value={clockFormat}
          options={['AM / PM', '24 hour']}
          onChange={v => save({ use24Hour: v === '24 hour', showAmPm: v !== '24 hour' })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Increment</span>
        <PanelDropdown
          value={increment}
          options={['1 hour', '30 min', '15 min']}
          onChange={v => save({ incrementMinutes: v === '15 min' ? 15 : v === '30 min' ? 30 : 60 })}
        />
      </div>
      <div style={rowStyle}>
        <span style={labelStyle}>Wake time</span>
        <TimeCarousel value={wakeTime} onChange={v => save({ startMinute: v })} incrementMinutes={settings?.incrementMinutes ?? 60} />
      </div>
      <div style={{ ...rowStyle, marginBottom: 0 }}>
        <span style={labelStyle}>Bed time</span>
        <TimeCarousel value={bedTime} onChange={v => save({ startHour: v })} incrementMinutes={settings?.incrementMinutes ?? 60} />
      </div>
    </div>
  );
}

function AccountSection({ onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  const handleLogout = async () => {
    onClose();
    await logout();
    navigate('/login');
  };

  const handleDeleteAccount = () => {
    setIsDeleteModalOpen(true);
  };

  const baseBtn = {
    background: 'none', borderRadius: 8, padding: '7px 14px',
    fontSize: 12, fontWeight: 500, cursor: 'pointer',
    display: 'flex', alignItems: 'center', gap: 6,
  };

  return (
    <div style={{ ...SECTION, borderBottom: 'none' }}>
      <SectionLabel>Account</SectionLabel>
      <div style={{ fontSize: 12, color: C.textFaint, marginBottom: 4 }}>Signed in as</div>
      <div style={{ fontSize: 14, color: C.text, fontWeight: 500, marginBottom: 14 }}>{user?.email ?? ''}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button
          onClick={handleLogout}
          style={{ ...baseBtn, border: `1px solid ${C.border}`, color: C.textMed }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#999'; e.currentTarget.style.color = C.text; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textMed; }}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M5 2H2.5A.5.5 0 002 2.5v7a.5.5 0 00.5.5H5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
            <path d="M8 4l2 2-2 2M10 6H5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Log out
        </button>
        <button
          onClick={handleDeleteAccount}
          style={{ ...baseBtn, border: `1px solid ${C.dangerBorder}`, color: C.danger }}
          onMouseEnter={e => e.currentTarget.style.background = C.dangerBg}
          onMouseLeave={e => e.currentTarget.style.background = 'none'}
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
            <path d="M1.5 3h9M4.5 3V2a.5.5 0 01.5-.5h2a.5.5 0 01.5.5v1M10.5 3l-.5 7a1 1 0 01-1 .5H3a1 1 0 01-1-.5L1.5 3" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Delete account
        </button>
      </div>

      <DeleteAccountModal
        isOpen={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
      />
    </div>
  );
}

// ─── Version history view ─────────────────────────────────────────────────────

function fmtTimestamp(iso) {
  if (!iso) return 'Unknown time';
  const d     = new Date(iso);
  const now   = new Date();
  const mins  = Math.round((now - d) / 60000);
  const hours = Math.round((now - d) / 3600000);
  const days  = Math.round((now - d) / 86400000);
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${mins} minute${mins !== 1 ? 's' : ''} ago`;
  if (hours < 24) return `${hours} hour${hours !== 1 ? 's' : ''} ago`;
  if (days  < 7)  return `${days} day${days !== 1 ? 's' : ''} ago`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

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

function ConfirmRestoreModal({ snapshot, onConfirm, onCancel, isRestoring }) {
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
              <span style={{ fontWeight: 500, color: '#334155' }}>{fmtTimestamp(snapshot.created_at)}</span>.
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

function HistoryView({ onBack, isActive }) {
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
        padding: '20px 28px 16px 22px', borderBottom: `1px solid ${C.borderLight}`,
        position: 'sticky', top: 0, background: C.bg, zIndex: 2,
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
                {fmtTimestamp(snap.created_at)}
                {idx === 0 && (
                  <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: C.green, background: '#e8f5f0', padding: '2px 7px', borderRadius: 4, marginLeft: 7, verticalAlign: 'middle' }}>
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
        />
      )}
    </>
  );
}

// ─── GearPanel ────────────────────────────────────────────────────────────────

export default function GearPanel() {
  const { isOpen, close } = useGearPanel();
  const [showHistory, setShowHistory] = useState(false);
  const [navBottom, setNavBottom] = useState(0);

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

  // Reset history view when panel closes
  useEffect(() => {
    if (!isOpen) setShowHistory(false);
  }, [isOpen]);

  // Escape key closes panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, close]);

  return createPortal(
    <div
        style={{
          position: 'fixed', right: 0, top: navBottom, bottom: 0,
          width: 640,
          background: C.bg,
          borderLeft: `1px solid ${C.border}`,
          zIndex: 99996, // above page panels (99994) and ScheduleItemPanel (99995)
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        }}
      >
        {/* Two-view slider */}
        <div
          style={{
            display: 'flex',
            width: 1280,
            flex: 1,
            minHeight: 0,
            transform: showHistory ? 'translateX(-640px)' : 'translateX(0)',
            transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          }}
        >
          {/* Main view */}
          <div style={{ width: 640, flexShrink: 0, overflowY: 'auto' }}>
            <YourYearSection />
            <TimelineSection onShowHistory={() => setShowHistory(true)} />
            <SystemSettingsSection />
            <PlanSettingsSection />
            <AccountSection onClose={close} />
          </div>

          {/* History view */}
          <div style={{ width: 640, flexShrink: 0, overflowY: 'auto' }}>
            <HistoryView onBack={() => setShowHistory(false)} isActive={showHistory && isOpen} />
          </div>
        </div>
      </div>,
    document.body
  );
}
