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
import { useLocation } from 'react-router-dom';
import { useSystemPanel } from '../contexts/SystemPanelContext';
import { useTaskRowPanel } from '../contexts/TaskRowPanelContext';
import { TaskDetailContent } from './planner/TaskRowPanel';

// Cross-component action event — consumed by ProjectTimePlannerV2
export const SYSTEM_PANEL_ACTION_EVENT = 'system-panel-action';
// Fired by ProjectTimePlannerV2 when row selection changes
export const SYSTEM_PANEL_SELECTION_EVENT = 'system-panel-selection';
// Fired by ProjectTimePlannerV2 when page scale changes
export const SYSTEM_PANEL_SCALE_EVENT = 'system-panel-scale';

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
  green:       '#1a7a5c',
  greenDark:   '#1a5c3a',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

const SECTION = {
  borderBottom: `1px solid ${C.borderLight}`,
  padding: '20px 22px',
};

// ─── Shared sub-components ────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontSize: 10, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textLight, marginBottom: 14,
    }}>
      {children}
    </div>
  );
}

// Standard action button row
function ActionBtn({ icon, label, disabled, onClick, rightSlot, style }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '11px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 400,
        color: disabled ? C.textFaint : C.textDim,
        cursor: disabled ? 'not-allowed' : 'pointer',
        transition: 'border-color 0.15s, color 0.15s',
        width: '100%', textAlign: 'left', marginBottom: 8,
        opacity: disabled ? 0.5 : 1,
        ...style,
      }}
      onMouseEnter={e => {
        if (!disabled) {
          e.currentTarget.style.borderColor = C.green;
          e.currentTarget.style.color = C.green;
        }
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.color = disabled ? C.textFaint : C.textDim;
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

// Green flash checkmark — shown briefly after an action fires
function useConfirmFlash() {
  const [visible, setVisible] = useState(false);
  const flash = useCallback(() => {
    setVisible(true);
    setTimeout(() => setVisible(false), 900);
  }, []);
  return [visible, flash];
}

function CheckBadge({ visible }) {
  return (
    <span style={{
      opacity: visible ? 1 : 0,
      transition: 'opacity 0.2s',
      width: 44, height: 26,
      background: visible ? C.green : C.border,
      borderRadius: 7,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <svg width="12" height="10" viewBox="0 0 12 10" fill="none">
        <path d="M1 5l3.5 3.5L11 1" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </span>
  );
}

// Input + Add button pair (used in Insert section)
function InsertControl({ inputId, value, onChange, onAdd }) {
  const active = value !== '' && parseInt(value) > 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 6,
      width: 110, flexShrink: 0,
      background: C.bgBlock, padding: '8px 10px',
      borderLeft: `1px solid ${C.border}`,
    }}>
      <input
        type="number"
        min="1"
        max="999"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{
          width: 44, height: 26,
          border: `1px solid ${C.border}`, borderRadius: 7,
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          color: C.text, textAlign: 'center',
          background: '#fff', outline: 'none', padding: 0,
        }}
        onFocus={e => e.target.style.borderColor = C.green}
        onBlur={e => e.target.style.borderColor = C.border}
      />
      <button
        onClick={onAdd}
        disabled={!active}
        style={{
          flex: 1, height: 26,
          background: active ? C.greenDark : C.border,
          border: 'none', borderRadius: 7,
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          color: '#fff', cursor: active ? 'pointer' : 'default',
          transition: 'background 0.15s',
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
      fontSize: 12,
      color: checked ? '#1a5c3a' : C.textDim,
      cursor: 'pointer',
      background: checked ? '#edf5f0' : C.bgBlock,
      border: `1px solid ${checked ? '#a8d4be' : C.border}`,
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

  const rowDependentStyle = !hasSelection ? { opacity: 0.38, pointerEvents: 'none' } : {};

  const handleAddTasks = () => {
    const count = parseInt(taskCount, 10);
    if (count > 0) {
      dispatchSystemAction('insertTasks', { count });
      setTaskCount('');
    }
  };

  return (
    <div style={SECTION}>
      <SectionLabel>Insert</SectionLabel>

      {/* Insert task rows — row-dependent */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 8,
        ...rowDependentStyle,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '11px 14px' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M1 3.5h11M1 6.5h11M1 9.5h7" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M10 8v4M8 10h4" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim }}>Insert task rows</span>
        </div>
        <InsertControl
          value={taskCount}
          onChange={setTaskCount}
          onAdd={handleAddTasks}
        />
      </div>

      {/* Insert label rows — row-dependent */}
      <div style={{
        display: 'flex', alignItems: 'center',
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden', marginBottom: 8,
        ...rowDependentStyle,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '11px 14px' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <path d="M2 2h4v4H2zM7 2h4v4H7zM2 7h4v4H2z" stroke={C.textDim} strokeWidth="1.2" strokeLinejoin="round"/>
            <path d="M9 7v4M7 9h4" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim }}>Insert label rows</span>
        </div>
        <InsertControl
          value={labelCount}
          onChange={setLabelCount}
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, padding: '11px 14px' }}>
          <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
            <rect x="1" y="2" width="11" height="9" rx="1.5" stroke={C.textDim} strokeWidth="1.2"/>
            <path d="M6.5 4.5v4M4.5 6.5h4" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
          </svg>
          <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim }}>Add weeks</span>
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
        onClick={() => { dispatchSystemAction('duplicateRow'); flashDup(); }}
        rightSlot={<CheckBadge visible={dupFlash} />}
        style={{ marginBottom: 0, ...rowDependentStyle }}
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
    <div style={SECTION}>
      <SectionLabel>Sort</SectionLabel>

      <div style={{
        border: `1px solid ${C.border}`, borderRadius: 10,
        overflow: 'hidden',
      }}>
        {/* Header row */}
        <div
          style={{
            display: 'flex', alignItems: 'center', padding: '11px 14px',
            cursor: 'pointer',
          }}
          onClick={() => setInboxOpen(v => !v)}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
            <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
              <path d="M1 3h11M3 6.5h7M5 10h3" stroke={C.textDim} strokeWidth="1.2" strokeLinecap="round"/>
            </svg>
            <span style={{ fontFamily: FONT, fontSize: 13, color: C.textDim }}>Move from Inbox to Planner</span>
          </div>
          <svg
            width="7" height="11" viewBox="0 0 7 11" fill="none"
            style={{ transition: 'transform 0.2s', transform: inboxOpen ? 'rotate(90deg)' : 'rotate(0deg)', flexShrink: 0 }}
          >
            <path d="M1 1l5 4.5L1 10" stroke={C.textLight} strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>

        {/* Expanded panel */}
        {inboxOpen && (
          <div style={{ borderTop: `1px solid ${C.border}`, padding: '10px 14px 12px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {SORT_STATUSES.map(s => (
                <StatusChip
                  key={s}
                  label={s}
                  checked={!!checked[s]}
                  onChange={val => toggleStatus(s, val)}
                />
              ))}
            </div>
            <button
              onClick={handleSort}
              disabled={!anyChecked}
              style={{
                marginTop: 10, width: '100%', height: 30,
                background: anyChecked ? C.greenDark : C.border,
                border: 'none', borderRadius: 7,
                fontFamily: FONT, fontSize: 13, fontWeight: 500,
                color: '#fff', cursor: anyChecked ? 'pointer' : 'default',
                transition: 'background 0.15s',
              }}
            >
              Sort
            </button>
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
    <div style={SECTION}>
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

function PageSection() {
  const [scale, setScale] = useState(1.0);

  useEffect(() => {
    const handler = (e) => setScale(e.detail?.scale ?? 1.0);
    window.addEventListener(SYSTEM_PANEL_SCALE_EVENT, handler);
    return () => window.removeEventListener(SYSTEM_PANEL_SCALE_EVENT, handler);
  }, []);

  return (
    <div style={{ ...SECTION, borderBottom: 'none' }}>
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
              padding: '10px 14px', fontFamily: FONT, fontSize: 13, fontWeight: 400,
              color: C.textDim, cursor: 'pointer', transition: 'border-color 0.15s, color 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = C.green; e.currentTarget.style.color = C.green; }}
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
        padding: '8px 14px',
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, fontFamily: FONT, fontSize: 13, color: C.textDim }}>
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
            minWidth: 40, textAlign: 'center',
            fontSize: 13, fontWeight: 500, color: C.text,
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
  const { isOpen, open, close } = useSystemPanel();
  const { selectedTask, closePanel } = useTaskRowPanel();
  const [navBottom, setNavBottom] = useState(0);
  const { pathname } = useLocation();

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

  // Auto-open the panel when a task row is selected
  useEffect(() => {
    if (selectedTask) open();
  }, [selectedTask, open]);

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

  return createPortal(
    <div
      style={{
        position: 'fixed', right: 0, top: navBottom, bottom: 0,
        width: 480,
        background: C.bg,
        borderLeft: `1px solid ${C.border}`,
        zIndex: 99994, // one below GearPanel so gear always wins if somehow both open
        overflow: 'hidden',
        transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      }}
    >
      {/* ── Outer slide: system content ↔ task detail ── */}
      <div style={{
        display: 'flex', width: 960, height: '100%',
        transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
        transform: showTaskDetail ? 'translateX(-480px)' : 'translateX(0)',
      }}>

        {/* System main content (320px, flex column so PageSection pins to bottom) */}
        <div style={{ width: 480, flexShrink: 0, overflow: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
          <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden' }}>
            <InsertSection />
            <SortSection />
            <ArchiveSection />
          </div>
          <div style={{ flexShrink: 0, borderTop: `1px solid ${C.borderLight}` }}>
            <PageSection />
          </div>
        </div>

        {/* Task detail view (320px, overflow hidden — inner slide handles its own scroll) */}
        <div style={{ width: 480, flexShrink: 0, overflow: 'hidden', height: '100%' }}>
          <TaskDetailContent selectedTask={selectedTask} onBack={closePanel} />
        </div>

      </div>
    </div>,
    document.body
  );
}
