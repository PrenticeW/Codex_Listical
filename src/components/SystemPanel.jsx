/**
 * SystemPanel
 *
 * Page-level action panel for the System page, opened by the list icon in
 * NavigationBar. Fixed right-side overlay, 320 px wide.
 *
 * Sections:
 *   - Insert  (task rows, label rows, add weeks, duplicate)
 *   - Sort    (move from Inbox to Planner)
 *   - Archive (archive week, hide week, show previous week)
 *   - Page    (undo/redo, zoom)
 *
 * All sections are shells — no storage wiring yet.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import PanelShell from './PanelShell';
import { useLocation } from 'react-router-dom';
import { useSystemPanel } from '../contexts/SystemPanelContext';
import usePanelWidth from '../hooks/usePanelWidth';
import { useTaskRowPanel } from '../contexts/TaskRowPanelContext';
import { TaskDetailContent } from './planner/TaskRowPanel';
import { useYear } from '../contexts/YearContext';
import { peekTacticsCache, loadTacticsYearSettings } from '../lib/tacticsStorage';
import { GEAR_TACTICS_SETTINGS_EVENT } from './GearPanel';

// Cross-component action event — consumed by ProjectTimePlannerV2
export const SYSTEM_PANEL_ACTION_EVENT = 'system-panel-action';
// Fired by ProjectTimePlannerV2 when row selection changes
export const SYSTEM_PANEL_SELECTION_EVENT = 'system-panel-selection';
// Fired by ProjectTimePlannerV2 when page scale changes
export const SYSTEM_PANEL_SCALE_EVENT = 'system-panel-scale';
// Fired by ProjectTimePlannerV2 when the day filter changes
export const SYSTEM_PANEL_DAY_FILTER_EVENT = 'system-panel-day-filter';
// Fired by ProjectTimePlannerV2 with the current list of project names (for the project filter UI)
export const SYSTEM_PANEL_PROJECT_NAMES_EVENT = 'system-panel-project-names';
// Fired by ProjectTimePlannerV2 when the project filter changes
export const SYSTEM_PANEL_PROJECT_FILTER_EVENT = 'system-panel-project-filter';

function dispatchSystemAction(action, payload = {}) {
  window.dispatchEvent(new CustomEvent(SYSTEM_PANEL_ACTION_EVENT, { detail: { action, ...payload } }));
}

// ─── Design tokens (match GearPanel) ─────────────────────────────────────────

const C = {
  bg:          '#fff',
  bgBlock:     '#f7f7f5',
  border:      '#e8e8e4',
  borderLight: '#f0f0ed',
  text:        '#1a1a1a',
  textDim:     '#555',
  textFaint:   '#999',
  textLight:   '#bbb',
  green:       'var(--brand-deep)',
  greenDark:   'var(--brand-ink)',
  greenBg:     'var(--brand-tint)',
  greenBorder: 'var(--brand-bd)',
};

const FONT = "'DM Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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

// Standard action button row
function ActionBtn({ icon, label, disabled, active, onClick, rightSlot, style }) {
  // Resting styles depend on state: `active` (e.g. a row is selected and this
  // action applies to it) renders in brand colours to signal availability.
  const restBorder = active ? 'var(--brand-bd)' : C.border;
  const restColor = disabled ? C.textFaint : active ? 'var(--brand-deep)' : C.textDim;
  const restBg = active ? 'var(--brand-tint)' : 'none';
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: restBg, border: `1px solid ${restBorder}`, borderRadius: 10,
        padding: '13px 16px', fontFamily: FONT, fontSize: 14, fontWeight: 400,
        color: restColor,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        width: '100%', textAlign: 'left', marginBottom: 8,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.borderColor = 'var(--brand)';
          e.currentTarget.style.color = 'var(--brand-deep)';
          e.currentTarget.style.background = 'var(--brand-hover-bg)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = restBorder;
        e.currentTarget.style.color = restColor;
        e.currentTarget.style.background = restBg;
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        {icon}
        {label}
      </div>
      {rightSlot}
    </button>
  );
}

// ExpandRowHeader — clickable header of a collapsible Sort/Filter row (Move
// from Inbox to Planner, Filter by day, Filter by goal). Gets a hover state
// like every other interactive row in this panel (icon/label/chevron tint to
// brand + a soft brand background) instead of just a cursor change.
function ExpandRowHeader({ icon, label, expanded, onToggle }) {
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
        <span style={{ display: 'flex' }}>{icon}</span>
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

// FilterActionBtn — centered, bordered ghost button for one-shot actions inside
// an expanded filter/sort section (Sort, Clear filter). Shares one style so
// every such action reads the same instead of each section inventing its own
// treatment (solid fill vs. underlined text link).
function FilterActionBtn({ label, onClick, disabled }) {
  return (
    <button
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        width: '100%', border: `1px solid ${C.border}`, borderRadius: 8,
        padding: '7px 11px', background: 'none',
        fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: disabled ? C.textFaint : C.textDim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.borderColor = 'var(--brand-hover-bd)';
          e.currentTarget.style.color = 'var(--brand-deep)';
          e.currentTarget.style.background = 'var(--brand-hover-bg)';
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.color = disabled ? C.textFaint : C.textDim;
        e.currentTarget.style.background = 'none';
      }}
    >
      {label}
    </button>
  );
}

// Flash checkmark — shown briefly after an action fires (1200ms)
function useConfirmFlash() {
  const [visible, setVisible] = useState(false);
  const timerRef = useRef(null);
  const flash = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    setVisible(true);
    timerRef.current = setTimeout(() => setVisible(false), 1200);
  }, []);
  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);
  return [visible, flash];
}

function CheckBadge({ visible }) {
  return (
    <span style={{
      opacity: visible ? 1 : 0,
      transform: visible ? 'scale(1)' : 'scale(0.7)',
      transition: 'opacity 0.2s, transform 0.2s',
      width: 40, height: 24,
      background: 'var(--brand-deep)',
      borderRadius: 6,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0, pointerEvents: 'none',
    }}>
      <svg width="10" height="8" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

// Input + Add button pair (used in Insert section).
// Plain text input in numeric mode — no native number-input spinners. The
// field is always editable; `requiresSelection` only gates the Add button.
function InsertControl({ inputId, value, onChange, onAdd, requiresSelection }) {
  const armed = !requiresSelection; // a row is selected — signal via the Add button
  const active = armed && value !== '' && parseInt(value, 10) > 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      width: 110, flexShrink: 0,
      background: C.bgBlock, padding: '8px 10px',
      borderLeft: `1px solid ${C.border}`,
    }}>
      <input
        id={inputId}
        type="text"
        inputMode="numeric"
        pattern="[0-9]*"
        maxLength={3}
        value={value}
        onChange={e => onChange(e.target.value.replace(/\D/g, ''))}
        onKeyDown={e => { if (e.key === 'Enter' && active) onAdd(); }}
        style={{
          width: 44, height: 26,
          border: `1px solid ${C.border}`, borderRadius: 7,
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          color: C.text, textAlign: 'center',
          background: '#fff', outline: 'none', padding: 0,
        }}
        onFocus={e => e.target.style.borderColor = 'var(--brand)'}
        onBlur={e => e.target.style.borderColor = C.border}
      />
      <button
        onClick={onAdd}
        disabled={!active}
        style={{
          flex: 1, height: 26,
          background: armed ? 'var(--brand-deep)' : C.border,
          border: 'none', borderRadius: 7,
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          color: '#fff', cursor: active ? 'pointer' : 'default',
          opacity: armed && !active ? 0.75 : 1,
          transition: 'background 0.15s, opacity 0.15s',
        }}
      >
        Add
      </button>
    </div>
  );
}

// Status chip (for Sort section)
function StatusChip({ label, checked, onChange }) {
  return (
    <label style={{
      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
      fontSize: 13,
      color: checked ? 'var(--brand-ink)' : C.textDim,
      cursor: 'pointer',
      background: checked ? 'var(--brand-tint)' : C.bgBlock,
      border: `1px solid ${checked ? 'var(--brand-bd)' : C.border}`,
      borderRadius: 20, padding: '5px 10px',
      transition: 'background 0.15s, border-color 0.15s, color 0.15s',
      userSelect: 'none',
    }}>
      <input
        type="checkbox"
        checked={checked}
        onChange={e => onChange(e.target.checked)}
        style={{ display: 'none' }}
      />
      {label}
    </label>
  );
}

// ─── Sections ─────────────────────────────────────────────────────────────────

// Must match keys in SORT_INBOX_TARGET_MAP in sortInbox.ts exactly
const SORT_STATUSES = ['Done', 'Scheduled', 'Not Scheduled', 'Blocked', 'On Hold', 'Abandoned', 'Skipped', 'Accounted', 'Special'];

function InsertSection() {
  const [taskCount, setTaskCount] = useState('');
  const [labelCount, setLabelCount] = useState('');
  const [weekCount, setWeekCount] = useState('');
  const [dupFlash, flashDup] = useConfirmFlash();
  const [hasSelection, setHasSelection] = useState(false);

  useEffect(() => {
    const handler = (e) => setHasSelection(e.detail?.hasSelection ?? false);
    window.addEventListener(SYSTEM_PANEL_SELECTION_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_SELECTION_EVENT, handler);
  }, []);



  const handleAddTasks = () => {
    const count = parseInt(taskCount, 10);
    if (count > 0) {
      dispatchSystemAction('insertTasks', { count });
      setTaskCount('');
    }
  };

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Insert</SectionLabel>

      {/* Insert task rows — row-dependent */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '13px 16px', color: C.textDim }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 3.5h11M1 6.5h11M1 9.5h7" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M10 8v4M8 10h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 14 }}>Insert task rows</span>
        </div>
        <InsertControl
          value={taskCount}
          onChange={setTaskCount}
          onAdd={handleAddTasks}
          requiresSelection={!hasSelection}
        />
      </div>

      {/* Insert label rows — row-dependent */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '13px 16px', color: C.textDim }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2h4v4H2zM7 2h4v4H7zM2 7h4v4H2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M9 7v4M7 9h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 14 }}>Insert label rows</span>
        </div>
        <InsertControl
          value={labelCount}
          onChange={setLabelCount}
          requiresSelection={!hasSelection}
          onAdd={() => {
            const count = parseInt(labelCount, 10);
            if (count > 0) {
              dispatchSystemAction('insertLabels', { count });
              setLabelCount('');
            }
          }}
        />
      </div>

      {/* Add weeks */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 8,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, padding: '13px 16px' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="11" height="9" rx="1.5" stroke={C.textDim} strokeWidth="1.2"/>
            <path d="M6.5 4.5v4M4.5 6.5h4" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 14, color: C.textDim }}>Add weeks</span>
        </div>
        <InsertControl
          value={weekCount}
          onChange={setWeekCount}
          onAdd={() => {
            const count = parseInt(weekCount, 10);
            if (count > 0) {
              dispatchSystemAction('addWeeks', { count });
              setWeekCount('');
            }
          }}
        />
      </div>

      {/* Remove week */}
      <ActionBtn
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4.5 6.5h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        }
        label="Remove week"
        onClick={() => dispatchSystemAction('removeWeek')}
        style={{ marginBottom: 8 }}
      />

      {/* Duplicate rows — row-dependent */}
      <ActionBtn
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <rect x="7" y="7" width="5" height="5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M4 4h2v2" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" strokeLinejoin="round" opacity="0.4"/>
          </svg>
        }
        label="Duplicate rows"
        disabled={!hasSelection}
        onClick={() => { dispatchSystemAction('duplicateRow'); flashDup(); }}
        rightSlot={<CheckBadge visible={dupFlash} />}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}

function SortSection() {
  const [inboxOpen, setInboxOpen] = useState(false);
  const [checked, setChecked] = useState({});

  const anyChecked = Object.values(checked).some(Boolean);

  const toggleStatus = (label, val) => {
    setChecked(prev => ({ ...prev, [label]: val }));
  };

  const handleSort = () => {
    const statuses = Object.entries(checked).filter(([, v]) => v).map(([k]) => k);
    if (statuses.length === 0) return;
    dispatchSystemAction('sortInbox', { statuses });
    setChecked({});
    setInboxOpen(false);
  };

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Sort</SectionLabel>

      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden',
      }}>
        {/* Header row */}
        <ExpandRowHeader
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 3h11M3 6.5h7M5 10h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
          }
          label="Move from Inbox to Planner"
          expanded={inboxOpen}
          onToggle={() => setInboxOpen(v => !v)}
        />

        {/* Expanded panel */}
        {inboxOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '12px 16px 14px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {SORT_STATUSES.map(s => (
                <StatusChip
                  key={s}
                  label={s}
                  checked={!!checked[s]}
                  onChange={val => toggleStatus(s, val)}
                />
              ))}
            </div>
            <div style={{ marginTop: 10 }}>
              <FilterActionBtn label="Sort" onClick={handleSort} disabled={!anyChecked} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ArchiveSection() {
  const [archiveFlash, flashArchive] = useConfirmFlash();
  const [hideFlash, flashHide] = useConfirmFlash();
  const [showPrevFlash, flashShowPrev] = useConfirmFlash();

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Archive</SectionLabel>

      <ActionBtn
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="1.5" width="11" height="2.5" rx="1" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M2 4v6.5a1 1 0 001 1h7a1 1 0 001-1V4" stroke="currentColor" strokeWidth="1.2"/>
            <path d="M5 7h3" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
        }
        label="Archive week"
        onClick={() => { dispatchSystemAction('archiveWeek'); flashArchive(); }}
        rightSlot={<CheckBadge visible={archiveFlash} />}
      />

      <ActionBtn
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 4h11M1 6.5h11M1 9h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M10 1.5l2 2-2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
        label="Hide current week"
        onClick={() => { dispatchSystemAction('hideWeek'); flashHide(); }}
        rightSlot={<CheckBadge visible={hideFlash} />}
      />

      <ActionBtn
        icon={
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 4h11M1 6.5h11M1 9h11" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M3 1.5L1 3.5l2 2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        }
        label="Show previous week"
        onClick={() => { dispatchSystemAction('showWeek'); flashShowPrev(); }}
        rightSlot={<CheckBadge visible={showPrevFlash} />}
        style={{ marginBottom: 0 }}
      />
    </div>
  );
}

const DAY_FILTER_TAGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function PlanSection() {
  const [activeDays, setActiveDays] = useState(new Set());
  const [projects, setProjects] = useState([]); // [{nickname, displayName}]
  const [activeProject, setActiveProject] = useState(null);

  // Sync day filter from ProjectTimePlannerV2
  useEffect(() => {
    const handler = (e) => {
      if (Array.isArray(e.detail?.dayFilter)) setActiveDays(new Set(e.detail.dayFilter));
    };
    window.addEventListener(SYSTEM_PANEL_DAY_FILTER_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_DAY_FILTER_EVENT, handler);
  }, []);

  // Receive available projects from ProjectTimePlannerV2
  useEffect(() => {
    const handler = (e) => {
      if (Array.isArray(e.detail?.projects)) setProjects(e.detail.projects);
    };
    window.addEventListener(SYSTEM_PANEL_PROJECT_NAMES_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_PROJECT_NAMES_EVENT, handler);
  }, []);

  // Sync project filter from ProjectTimePlannerV2
  useEffect(() => {
    const handler = (e) => {
      if ('projectFilter' in (e.detail ?? {})) setActiveProject(e.detail.projectFilter);
    };
    window.addEventListener(SYSTEM_PANEL_PROJECT_FILTER_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_PROJECT_FILTER_EVENT, handler);
  }, []);

  function handleDayPick(day) {
    const next = new Set(activeDays);
    if (next.has(day)) { next.delete(day); } else { next.add(day); }
    setActiveDays(next);
    dispatchSystemAction('setDayFilter', { days: Array.from(next) });
  }

  function handleClearDays() {
    setActiveDays(new Set());
    dispatchSystemAction('setDayFilter', { days: [] });
  }

  function handleProjectPick(name) {
    const next = activeProject === name ? null : name;
    setActiveProject(next);
    dispatchSystemAction('setProjectFilter', { project: next });
  }

  const [dayOpen, setDayOpen] = useState(false);
  const [goalOpen, setGoalOpen] = useState(false);

  return (
    <div style={BENTO_CARD}>
      <SectionLabel>Plan</SectionLabel>

      {/* Filter by day */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden', marginBottom: 8 }}>
        <ExpandRowHeader
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <rect x="1" y="2" width="11" height="9" rx="1.5" stroke="currentColor" strokeWidth="1.2"/>
              <path d="M4 1v2M9 1v2" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              <path d="M1 5h11" stroke="currentColor" strokeWidth="1.2"/>
            </svg>
          }
          label="Filter by day"
          expanded={dayOpen}
          onToggle={() => setDayOpen(v => !v)}
        />
        {dayOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 16px 16px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {DAY_FILTER_TAGS.map(day => {
                const isActive = activeDays.has(day);
                return (
                  <button
                    key={day}
                    onClick={() => handleDayPick(day)}
                    style={{
                      padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                      fontFamily: FONT, fontSize: 13, fontWeight: isActive ? 600 : 400,
                      background: isActive ? 'var(--brand-deep)' : C.bgBlock,
                      color: isActive ? '#fff' : C.textDim,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#e8efe9'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.bgBlock; }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>
            {activeDays.size > 0 && (
              <div style={{ marginTop: 8 }}>
                <FilterActionBtn label="Clear filter" onClick={handleClearDays} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Filter by goal */}
      <div style={{ border: `1px solid ${C.border}`, borderRadius: 10, overflow: 'hidden' }}>
        <ExpandRowHeader
          icon={
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="6.5" cy="6.5" r="2.5" stroke="currentColor" strokeWidth="1.2"/>
              <circle cx="6.5" cy="6.5" r="0.8" fill="currentColor"/>
            </svg>
          }
          label="Filter by goal"
          expanded={goalOpen}
          onToggle={() => setGoalOpen(v => !v)}
        />
        {goalOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '14px 16px 16px' }}>
            {projects.length === 0 ? (
              <div style={{ fontFamily: FONT, fontSize: 13, color: C.textFaint }}>No goals found</div>
            ) : (
              <>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {projects.map(({ nickname, displayName }) => {
                    const isActive = activeProject === nickname;
                    return (
                      <button
                        key={nickname}
                        onClick={() => handleProjectPick(nickname)}
                        style={{
                          padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                          fontFamily: FONT, fontSize: 13, fontWeight: isActive ? 600 : 400,
                          background: isActive ? 'var(--brand-deep)' : C.bgBlock,
                          color: isActive ? '#fff' : C.textDim,
                          transition: 'background 0.12s, color 0.12s',
                        }}
                        onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#e8efe9'; }}
                        onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.bgBlock; }}
                      >
                        {displayName}
                      </button>
                    );
                  })}
                </div>
                {activeProject && (
                  <div style={{ marginTop: 8 }}>
                    <FilterActionBtn label="Clear filter" onClick={() => handleProjectPick(activeProject)} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function PageSection() {
  const [scale, setScale] = useState(1.0);

  useEffect(() => {
    const handler = (e) => setScale(e.detail?.scale ?? 1.0);
    window.addEventListener(SYSTEM_PANEL_SCALE_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_SCALE_EVENT, handler);
  }, []);

  return (
    <div style={{ ...BENTO_CARD, margin: '11px 11px 11px' }}>
      <SectionLabel>Page</SectionLabel>

      {/* Undo / Redo */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
        {[
          {
            label: 'Undo',
            icon: (
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M2 6.5a4.5 4.5 0 114.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M2 4v2.5h2.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
          },
          {
            label: 'Redo',
            icon: (
              <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
                <path d="M11 6.5a4.5 4.5 0 10-4.5 4.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
                <path d="M11 4v2.5H8.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            ),
          },
        ].map(({ label, icon }) => (
          <button
            key={label}
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
              padding: '12px 16px', fontFamily: FONT, fontSize: 14, fontWeight: 400,
              color: C.textDim, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--brand)'; e.currentTarget.style.color = 'var(--brand-deep)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = C.border; e.currentTarget.style.color = C.textDim; }}
            onClick={() => dispatchSystemAction(label.toLowerCase())}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Zoom stepper */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '10px 16px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 14, color: C.textDim }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <circle cx="5.5" cy="5.5" r="4" stroke={C.textFaint} strokeWidth="1.2"/>
            <path d="M8.5 8.5L12 12" stroke={C.textFaint} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          Page zoom
        </span>
        <div style={{
          display: 'flex', alignItems: 'center',
          border: `1px solid ${C.border}`, borderRadius: 7, overflow: 'hidden',
        }}>
          <button
            onClick={() => dispatchSystemAction('zoomOut')}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18, fontWeight: 300, color: C.textDim,
              background: C.bgBlock, border: 'none', borderRight: `1px solid ${C.border}`,
              transition: 'background 0.1s', fontFamily: FONT, lineHeight: 1, padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.borderLight; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.bgBlock; }}
          >−</button>
          <span style={{
            minWidth: 44, textAlign: 'center',
            fontSize: 14, fontWeight: 500, color: C.text,
            lineHeight: '28px', fontFamily: FONT,
          }}>{Math.round(scale * 100)}%</span>
          <button
            onClick={() => dispatchSystemAction('zoomIn')}
            style={{
              width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 18, fontWeight: 300, color: C.textDim,
              background: C.bgBlock, border: 'none', borderLeft: `1px solid ${C.border}`,
              transition: 'background 0.1s', fontFamily: FONT, lineHeight: 1, padding: 0,
            }}
            onMouseEnter={e => { e.currentTarget.style.background = C.borderLight; }}
            onMouseLeave={e => { e.currentTarget.style.background = C.bgBlock; }}
          >+</button>
        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

export default function SystemPanel() {
  const { isOpen, close } = useSystemPanel();
  const { selectedTask, closePanel } = useTaskRowPanel();
  const [navBottom, setNavBottom] = useState(0);
  const { pathname } = useLocation();
  const { currentYear } = useYear();
  const { width: panelWidth, setWidth: setPanelWidth, minWidth, maxWidth } = usePanelWidth();

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

  // Measure NavigationBar bottom edge (same as GearPanel)
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

  // Escape: if showing task detail, go back to system content; otherwise close panel
  useEffect(() => {
    if (!isOpen) return;
    const handler = e => {
      if (e.key !== 'Escape') return;
      if (selectedTask) closePanel();
      else close();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [isOpen, selectedTask, close, closePanel]);

  // Page panels are mounted globally in Layout; render only on the System
  // page so panels never stack across page switches. Open state is kept,
  // so the panel is still there when the user returns.
  if (pathname !== '/') return null;

  const showTaskDetail = Boolean(selectedTask);

  return (
    <PanelShell
      isOpen={isOpen}
      navBottom={navBottom}
      width={panelWidth}
      zIndex={99994}
      onWidthChange={setPanelWidth}
      minWidth={minWidth}
      maxWidth={maxWidth}
    >
      {/* ── Outer slide: system content ↔ task detail ──
          200% wide (two 50% panes), not fixed 640/320px — the frosted tray
          in PanelShell is inset 7px from the panel's own width, so it's
          narrower than that width prop. Percentage-based sizing always
          matches the tray's real width instead of overflowing past its
          right edge. */}
      <div style={{
        position: 'absolute', inset: 0, overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', width: '200%', height: '100%',
          transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
          transform: showTaskDetail ? 'translateX(-50%)' : 'translateX(0)',
        }}>
          {/* System main content */}
          <div style={{ width: '50%', flexShrink: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
            <div
              className="no-scrollbar"
              style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingTop: 20, paddingBottom: 24 }}
            >
              <InsertSection />
              <SortSection />
              <ArchiveSection />
              <PlanSection />
            </div>
            <div style={{ flexShrink: 0, borderTop: '1px solid var(--brand-bd)' }}>
              <PageSection />
            </div>
          </div>

          {/* Task detail view */}
          <div style={{ width: '50%', flexShrink: 0, overflow: 'hidden', height: '100%' }}>
            <TaskDetailContent selectedTask={selectedTask} onBack={closePanel} use24Hour={use24Hour} />
          </div>
        </div>
      </div>
    </PanelShell>
  );
}
