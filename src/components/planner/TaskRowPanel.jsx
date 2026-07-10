/**
 * TaskRowPanel — Task detail view content.
 *
 * Exports TaskDetailContent: a self-contained inner-slide pair
 * (task detail main view + history sub-view). No portal or fixed
 * positioning — SystemPanel owns the panel shell and the outer slide.
 *
 * Rebuilt on the same bento-card primitives as the other panels
 * (GearPanel/SystemPanel/GoalPanel/PlanPanel) per the design handoff
 * (reference/TaskRowPanelUI.jsx) so it reads as part of the same system
 * instead of the pre-redesign sticky-header/border-divider layout it had
 * before. Visual-only change — all data flow, events, and handlers below
 * are unchanged from before this pass.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PILLBOX_COLORS } from './DropdownCell';
import { saveTaskNote, readTaskEvents } from '../../utils/planner/storage';
import { TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';
import { fmtTimestamp } from '../../utils/fmtTimestamp';
import { linkifyText, containsUrl, renderUrlSegments } from '../../utils/linkify';

// ─── Design tokens (match GearPanel/SystemPanel) ─────────────────────────────

const C = {
  bg:          '#fff',
  bgBlock:     '#f7f7f5',
  border:      '#e8e8e4',
  borderLight: '#f0f0ed',
  text:        '#1a1a1a',
  textDim:     '#555',
  textMid:     '#777',
  textFaint:   '#999',
  textLight:   '#bbb',
  green:       'var(--brand-deep)',
  greenDark:   'var(--brand-ink)',
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

// ─── Status chip colours — derived from PILLBOX_COLORS so panel and table stay in sync

const DEFAULT_CHIP = { dot: '#bbb', bg: '#f7f7f5', color: '#888', border: '#e0e0dc' };

function getStatusChip(status) {
  const p = PILLBOX_COLORS[status];
  if (!p) return DEFAULT_CHIP;
  return { bg: p.bg, color: p.text, dot: p.text, border: p.bg };
}

// ─── Structural row messages ──────────────────────────────────────────────────

function getStructuralRowMessage(task) {
  const rowType = task?._rowType;
  const projectLabel = task?.projectNickname || task?.projectName || task?.project || '';
  const subprojectLabel = task?.subprojectName || task?.subproject || '';

  switch (rowType) {
    case 'projectHeader':
    case 'archivedProjectHeader':
      return projectLabel ? `Project group — ${projectLabel}` : 'Project group';
    case 'projectGeneral':
    case 'archivedProjectGeneral':
      return 'General section';
    case 'projectUnscheduled':
    case 'archivedProjectUnscheduled':
      return 'Unscheduled section';
    case 'subprojectHeader':
      return subprojectLabel ? `Subproject group — ${subprojectLabel}` : 'Subproject group';
    case 'subprojectGeneral':
      return 'General section';
    case 'subprojectUnscheduled':
      return 'Unscheduled section';
    case 'archiveHeader':
      return 'Archive section';
    case 'archiveRow':
      return 'Archive week';
    default:
      return null;
  }
}

// ─── Shared primitives ────────────────────────────────────────────────────────

function SectionLabel({ children }) {
  return (
    <div style={{
      fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace",
      fontSize: 9, fontWeight: 700, letterSpacing: '0.14em',
      textTransform: 'uppercase', color: 'var(--brand-ink)',
      paddingBottom: 9, borderBottom: '1px solid var(--brand-bd)',
      marginBottom: 11,
    }}>
      {children}
    </div>
  );
}

function StatusChipSm({ status }) {
  const s = getStatusChip(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 500, borderRadius: 20,
      padding: '2px 8px', whiteSpace: 'nowrap',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
    }}>
      {status}
    </span>
  );
}

const ChevronRight = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
    <path d="M1 1l5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const HistoryIcon = () => (
  <svg width="13" height="13" viewBox="0 0 13 13" fill="none">
    <circle cx="6.5" cy="6.5" r="5" stroke="currentColor" strokeWidth="1.2"/>
    <path d="M6.5 3.5v3l2 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

// Bento-card "Back" pill (reference/PanelPrimitives.jsx → BackBtn). Includes
// its own top-level padding wrapper — callers render it directly, no extra
// padding div needed around it.
function BackBtn({ onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <div style={{ padding: '16px 18px 8px', flexShrink: 0 }}>
      <button
        onClick={onClick}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 8, padding: '6px 11px',
          background: hovered ? 'var(--brand-tint)' : '#ffffff',
          border: `1px solid ${hovered ? 'var(--brand)' : C.border}`,
          borderRadius: 8,
          boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
          cursor: 'pointer',
          color: hovered ? 'var(--brand-deep)' : '#616161',
          fontFamily: FONT, fontSize: 13, fontWeight: 500,
          transition: 'all 0.15s',
        }}
      >
        <svg width="5" height="9" viewBox="0 0 5 9" fill="none">
          <path d="M4.5 1L1 4.5l3.5 3.5" stroke="var(--brand-deep)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
        Back
      </button>
    </div>
  );
}

// Standard bento action-row button (matches SystemPanel's ActionBtn)
function ActionBtn({ icon, label, rightSlot, onClick, style }) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        background: 'none', border: `1px solid ${C.border}`, borderRadius: 10,
        padding: '13px 16px', fontFamily: FONT, fontSize: 14, fontWeight: 400,
        color: C.textDim, cursor: 'pointer',
        transition: 'border-color 0.15s, color 0.15s, background 0.15s',
        width: '100%', textAlign: 'left',
        ...style,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = 'var(--brand)';
        e.currentTarget.style.color = 'var(--brand-deep)';
        e.currentTarget.style.background = 'var(--brand-hover-bg)';
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = C.border;
        e.currentTarget.style.color = C.textDim;
        e.currentTarget.style.background = 'none';
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

// Toggle switch (matches GearPanel's Toggle)
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

// Label/value row used inside bento cards (matches GearPanel's rowStyle/labelStyle)
const ROW_STYLE = { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 };
const ROW_LABEL_STYLE = { fontSize: 13, color: C.textDim };

function HistoryEntry({ status, fromStatus, time, note, isLast }) {
  const s = getStatusChip(status);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '9px 0',
      borderBottom: isLast ? 'none' : `1px solid ${C.borderLight}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
        {!isLast && <div style={{ width: 1, background: C.border, flex: 1, minHeight: 16, marginTop: 3 }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: note ? 3 : 0, flexWrap: 'wrap' }}>
          {fromStatus && (
            <>
              <StatusChipSm status={fromStatus} />
              <span style={{ color: C.textFaint, fontSize: 10 }}>→</span>
            </>
          )}
          <StatusChipSm status={status} />
          <span style={{ fontSize: 10.5, color: '#8090A8', fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace" }}>{time}</span>
        </div>
        {note && (
          <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2, lineHeight: 1.45 }}>{linkifyText(note)}</div>
        )}
      </div>
    </div>
  );
}

function CreatedEntry({ date, agePill }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '9px 0' }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#ccc' }} />
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center',
            fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '2px 8px',
            background: '#f7f7f5', color: '#888', border: '1px solid #e0e0dc',
          }}>
            Created
          </span>
          <span style={{ fontSize: 10.5, color: '#8090A8', fontFamily: "'IBM Plex Mono','SFMono-Regular',ui-monospace,monospace" }}>
            {date}
            {agePill && (
              <span style={{
                fontSize: 10.5, color: C.textFaint,
                background: C.bgBlock, border: `1px solid ${C.border}`,
                borderRadius: 20, padding: '2px 8px', marginLeft: 6,
              }}>
                {agePill}
              </span>
            )}
          </span>
        </div>
      </div>
    </div>
  );
}

function getAgePill(isoDate) {
  if (!isoDate) return null;
  const days = Math.floor((Date.now() - new Date(isoDate).getTime()) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return '1 day old';
  if (days < 7)  return `${days} days old`;
  const weeks = Math.floor(days / 7);
  if (weeks < 8) return `${weeks}w old`;
  return `${Math.floor(days / 30)}mo old`;
}

// ─── Day tag editor (subproject header rows) ─────────────────────────────────

const DAY_TAGS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Panel view shown when the selected row is a subprojectHeader. Allows the user
 *  to view and override the auto-detected day tag. */
function SubprojectHeaderPanel({ selectedTask, onBack }) {
  const [dayTag, setDayTagLocal] = useState(selectedTask?.dayTag ?? null);
  const [dayTagLocked, setDayTagLockedLocal] = useState(selectedTask?.dayTagLocked === true);

  // Sync if the task prop changes (e.g. auto-detection fired from a text edit).
  // We depend on the full selectedTask object so any field change (including dayTag) re-syncs.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    setDayTagLocal(selectedTask?.dayTag ?? null);
    setDayTagLockedLocal(selectedTask?.dayTagLocked === true);
  }, [selectedTask?.dayTag, selectedTask?.dayTagLocked, selectedTask?.id]);

  const dispatchDayTag = useCallback((newDay, locked) => {
    if (!selectedTask?.id) return;
    window.dispatchEvent(new CustomEvent('system-panel-action', {
      detail: { action: 'setDayTag', rowId: selectedTask.id, dayTag: newDay, dayTagLocked: locked },
    }));
    // Keep the panel context in sync without waiting for a table rerender
    window.dispatchEvent(new CustomEvent('task-row-detail-update', {
      detail: { task: { ...selectedTask, dayTag: newDay, dayTagLocked: locked } },
    }));
  }, [selectedTask]);

  function handleDayPick(day) {
    const next = dayTag === day ? null : day;  // toggle off if already selected
    setDayTagLocal(next);
    setDayTagLockedLocal(true);
    dispatchDayTag(next, true);
  }

  function handleClearLock() {
    // Remove the manual lock and let auto-detection take over on next edit
    setDayTagLockedLocal(false);
    dispatchDayTag(dayTag, false);
  }

  const rowLabel = selectedTask?.subprojectName || selectedTask?.subproject || '—';

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <BackBtn onClick={onBack} />
      <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
        <div style={{ paddingTop: 8, paddingBottom: 24 }}>

          <div style={BENTO_CARD}>
            <SectionLabel>Subproject</SectionLabel>
            <div style={{ fontSize: 15, fontWeight: 600, color: C.text }}>{rowLabel}</div>
          </div>

          <div style={{ ...BENTO_CARD, marginBottom: 0 }}>
            <SectionLabel>Day</SectionLabel>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 12 }}>
              {DAY_TAGS.map(day => {
                const isActive = dayTag === day;
                return (
                  <button
                    key={day}
                    onClick={() => handleDayPick(day)}
                    style={{
                      padding: '7px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
                      fontFamily: FONT, fontSize: 13, fontWeight: isActive ? 600 : 400,
                      background: isActive ? C.green : C.bgBlock,
                      color: isActive ? '#fff' : C.textDim,
                      transition: 'background 0.12s, color 0.12s',
                    }}
                    onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--brand-hover-bg)'; }}
                    onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.bgBlock; }}
                  >
                    {day}
                  </button>
                );
              })}
            </div>

            {/* Lock status */}
            {dayTagLocked ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <span style={{ fontSize: 12, color: C.textDim }}>Manually set</span>
                <button
                  onClick={handleClearLock}
                  style={{
                    fontSize: 12, color: C.green, background: 'none', border: 'none',
                    cursor: 'pointer', padding: 0, fontFamily: FONT,
                    textDecoration: 'underline',
                  }}
                >
                  Reset to auto-detect
                </button>
              </div>
            ) : (
              <span style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic' }}>
                {dayTag ? 'Auto-detected from row name' : 'No day detected — pick one above to set manually'}
              </span>
            )}
          </div>

        </div>
      </div>
    </div>
  );
}

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * TaskDetailContent
 *
 * Renders inside SystemPanel's slide container as the second (right-hand)
 * view. Contains its own inner slide for the history sub-view.
 *
 * Props:
 *   selectedTask — raw task row object from row.original, or null
 *   onBack       — called when the user presses "System" back button;
 *                  should clear selectedTask so the outer slide returns left
 */
export function TaskDetailContent({ selectedTask, onBack, use24Hour = false }) {
  const [showHistory, setShowHistory] = useState(false);
  const [recurringActive, setRecurringActive] = useState(false);
  const [notes, setNotes] = useState('');
  const [events, setEvents] = useState([]);
  // Notes display/edit toggle — a textarea can't render anchors, so when the
  // note contains a URL and isn't being edited we show a linkified read view
  // and swap back to the textarea on click.
  const [isEditingNotes, setIsEditingNotes] = useState(false);
  const notesTextareaRef = React.useRef(null);
  const notesMirrorRef = React.useRef(null);
  const noteSaveDebounceRef = React.useRef(null);

  useEffect(() => {
    if (isEditingNotes && notesTextareaRef.current) notesTextareaRef.current.focus();
  }, [isEditingNotes]);

  // Reset inner state and load fresh data whenever the selected task changes
  useEffect(() => {
    // Cancel any pending note save from the previous task
    if (noteSaveDebounceRef.current) {
      clearTimeout(noteSaveDebounceRef.current);
      noteSaveDebounceRef.current = null;
    }
    setShowHistory(false);
    setIsEditingNotes(false);
    if (selectedTask) {
      setRecurringActive(selectedTask.recurring === 'true' || selectedTask.recurring === true);
      setNotes(selectedTask.notes ?? '');
      readTaskEvents(selectedTask.id).then(setEvents);
    } else {
      setNotes('');
      setEvents([]);
    }
  }, [selectedTask?.id]);

  // Reload events (and sync recurring state) when status or recurring changes on the same task
  useEffect(() => {
    if (!selectedTask?.id) return;
    setRecurringActive(selectedTask.recurring === 'true' || selectedTask.recurring === true);
    readTaskEvents(selectedTask.id).then(setEvents);
  }, [selectedTask?.status, selectedTask?.recurring, selectedTask?.completionCount, selectedTask?.lastCompletedAt]);

  // Reload history after the DB write completes (fires after writeTaskEvent resolves,
  // avoiding the race where readTaskEvents runs before the new event is persisted).
  useEffect(() => {
    if (!selectedTask?.id) return;
    const handler = (e) => {
      if (e.detail?.taskId === selectedTask.id) {
        readTaskEvents(selectedTask.id).then(setEvents);
      }
    };
    window.addEventListener(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT, handler);
  }, [selectedTask?.id]);

  const persistNote = useCallback((taskId, noteText) => {
    saveTaskNote(taskId, noteText);
    window.dispatchEvent(new CustomEvent('system-panel-action', {
      detail: { action: 'updateTaskField', rowId: taskId, field: 'notes', value: noteText },
    }));
  }, []);

  const handleNotesChange = useCallback((e) => {
    const noteText = e.target.value;
    setNotes(noteText);
    if (!selectedTask?.id) return;
    if (noteSaveDebounceRef.current) clearTimeout(noteSaveDebounceRef.current);
    noteSaveDebounceRef.current = setTimeout(() => {
      persistNote(selectedTask.id, noteText);
    }, 800);
  }, [selectedTask?.id, persistNote]);

  const handleNotesBlur = useCallback((e) => {
    // Flush immediately on blur — cancels the debounce timer
    if (noteSaveDebounceRef.current) {
      clearTimeout(noteSaveDebounceRef.current);
      noteSaveDebounceRef.current = null;
    }
    if (selectedTask?.id) {
      persistNote(selectedTask.id, e.target.value);
    }
  }, [selectedTask?.id, persistNote]);

  function toggleRecurring() {
    const next = !recurringActive;
    setRecurringActive(next);
    if (selectedTask?.id) {
      window.dispatchEvent(new CustomEvent('system-panel-action', {
        detail: { action: 'updateTaskField', rowId: selectedTask.id, field: 'recurring', value: String(next) },
      }));
    }
  }

  // Subproject header rows get their own dedicated view with the day tag editor
  if (selectedTask?._rowType === 'subprojectHeader') {
    return <SubprojectHeaderPanel selectedTask={selectedTask} onBack={onBack} />;
  }

  const taskName = selectedTask?.task || '—';

  // Structural/blank row empty state
  const structuralMessage = getStructuralRowMessage(selectedTask);
  const isBlankRow = !structuralMessage && !(selectedTask?.task ?? '').trim();

  if (structuralMessage || isBlankRow) {
    const message = structuralMessage ?? 'Empty row — add a task name to get started';
    return (
      <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <BackBtn onClick={onBack} />
        <div style={{ paddingTop: 8 }}>
          <div style={{ ...BENTO_CARD, marginBottom: 0 }}>
            <p style={{ fontFamily: FONT, fontSize: 13, color: C.textFaint, fontStyle: 'italic', margin: 0 }}>
              {message}
            </p>
          </div>
        </div>
      </div>
    );
  }

  // Map DB event rows to HistoryEntry props (status events only)
  const statusEvents = events
    .filter(ev => ev.field === 'status')
    .map(ev => ({
      status: ev.new_value,
      fromStatus: ev.old_value || null,
      time: fmtTimestamp(ev.changed_at, { use24Hour }),
      note: ev.note || null,
    }));

  return (
    // Inner slide: 200% wide (two 50% panes), clips via parent overflow:hidden.
    // Percentage-based rather than fixed 640/320px so this always matches
    // whatever the real available width is (e.g. PanelShell's frosted tray is
    // inset 7px from the outer panel edge, so it's narrower than the panel's
    // own width prop — fixed pixel widths here previously overflowed that tray).
    <div style={{
      display: 'flex', width: '200%', height: '100%',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      transform: showHistory ? 'translateX(-50%)' : 'translateX(0)',
    }}>

      {/* ── Task detail main view ── */}
      <div style={{
        width: '50%', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <BackBtn onClick={onBack} />

        <div className="no-scrollbar" style={{ flex: 1, minHeight: 0, overflowY: 'auto', overflowX: 'hidden' }}>
          <div style={{ paddingTop: 8, paddingBottom: 24 }}>

            {/* Task name */}
            <div style={BENTO_CARD}>
              <div style={{ fontSize: 13, fontWeight: 600, color: C.text, lineHeight: 1.4 }}>
                {linkifyText(taskName)}
              </div>
            </div>

            {/* Schedule — Recurring toggle */}
            <div style={BENTO_CARD}>
              <SectionLabel>Schedule</SectionLabel>
              <div style={{ ...ROW_STYLE, marginBottom: 0 }}>
                <span style={ROW_LABEL_STYLE}>Recurring</span>
                <Toggle checked={recurringActive} onChange={() => toggleRecurring()} />
              </div>
            </div>

            {/* Notes */}
            <div style={BENTO_CARD}>
              <SectionLabel>Notes</SectionLabel>
              {!isEditingNotes && containsUrl(notes) ? (
                <div
                  title="Click to edit"
                  onClick={() => setIsEditingNotes(true)}
                  style={{
                    width: '100%', boxSizing: 'border-box', minHeight: 360,
                    border: '1px solid var(--brand-hover-bd)', borderRadius: 8,
                    fontFamily: FONT, fontSize: 13, color: C.text,
                    background: C.bgBlock, padding: '9px 11px',
                    lineHeight: 1.55, whiteSpace: 'pre-wrap',
                    overflowWrap: 'anywhere', cursor: 'text',
                  }}
                >
                  {linkifyText(notes)}
                </div>
              ) : (
                // While editing a note that contains a URL, a mirror layer
                // behind the (transparent-text) textarea paints URLs as links.
                <div style={{ position: 'relative' }}>
                  {containsUrl(notes) && (
                    <div
                      ref={notesMirrorRef}
                      aria-hidden
                      style={{
                        position: 'absolute', inset: 0, boxSizing: 'border-box',
                        border: '1px solid transparent', borderRadius: 8,
                        fontFamily: FONT, fontSize: 13, color: C.text,
                        background: C.bgBlock, padding: '9px 11px',
                        lineHeight: 1.55, whiteSpace: 'pre-wrap',
                        overflowWrap: 'break-word', overflow: 'hidden',
                        pointerEvents: 'none',
                      }}
                    >
                      {renderUrlSegments(notes)}
                    </div>
                  )}
                  <textarea
                    ref={notesTextareaRef}
                    placeholder="Add a note…"
                    value={notes}
                    onChange={handleNotesChange}
                    onScroll={(e) => {
                      if (notesMirrorRef.current) notesMirrorRef.current.scrollTop = e.target.scrollTop;
                    }}
                    onBlur={(e) => { setIsEditingNotes(false); handleNotesBlur(e); }}
                    style={{
                      position: 'relative',
                      width: '100%', boxSizing: 'border-box', minHeight: 360, resize: 'none',
                      border: '1px solid var(--brand-hover-bd)', borderRadius: 8,
                      fontFamily: FONT, fontSize: 13,
                      color: containsUrl(notes) ? 'transparent' : C.text,
                      caretColor: C.text,
                      background: containsUrl(notes) ? 'transparent' : C.bgBlock,
                      padding: '9px 11px',
                      outline: 'none', lineHeight: 1.55,
                      whiteSpace: 'pre-wrap', overflowWrap: 'break-word',
                      transition: 'border-color 0.15s',
                    }}
                    onFocus={e => { e.target.style.borderColor = 'var(--brand)'; }}
                  />
                </div>
              )}
            </div>

            {/* Status history preview */}
            <div style={{ ...BENTO_CARD, marginBottom: 0 }}>
              <SectionLabel>Status History</SectionLabel>
              <ActionBtn
                icon={<HistoryIcon />}
                label={`See ${statusEvents.length > 0 ? `${statusEvents.length} ` : ''}change${statusEvents.length === 1 ? '' : 's'}`}
                rightSlot={<ChevronRight />}
                onClick={() => setShowHistory(true)}
                style={{ marginBottom: 0 }}
              />
            </div>

          </div>
        </div>
      </div>

      {/* ── History sub-view ── */}
      <div style={{
        width: '50%', flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden',
      }}>
        <BackBtn onClick={() => setShowHistory(false)} />

        <div style={{ flex: 1, minHeight: 0, padding: '8px 11px 16px', display: 'flex', flexDirection: 'column', gap: 7 }}>
          <div
            className="no-scrollbar"
            style={{
              flex: 1, minHeight: 0, background: '#FFFFFF', borderRadius: 12,
              border: '1px solid #e8e8e4', boxShadow: '0 1px 0 rgba(72,50,75,0.04), 0 2px 6px rgba(72,50,75,0.07)',
              overflowY: 'auto', overflowX: 'hidden', padding: '15px 16px',
            }}
          >
            <SectionLabel>Status History</SectionLabel>
            {statusEvents.length === 0 ? (
              <div style={{ fontSize: 12, color: C.textFaint, fontStyle: 'italic', paddingTop: 4 }}>
                No history yet.
              </div>
            ) : (
              statusEvents.map((ev, i) => (
                <HistoryEntry key={i} {...ev} isLast={i === statusEvents.length - 1 && !selectedTask?.taskCreatedAt} />
              ))
            )}
            {selectedTask?.taskCreatedAt && (
              <CreatedEntry
                date={new Date(selectedTask.taskCreatedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
                agePill={getAgePill(selectedTask.taskCreatedAt)}
              />
            )}
          </div>

          {recurringActive && (
            <div style={{ ...BENTO_CARD, margin: 0, flexShrink: 0 }}>
              <SectionLabel>Recurring</SectionLabel>
              <div style={ROW_STYLE}>
                <span style={ROW_LABEL_STYLE}>Completions</span>
                <span style={{ background: C.green, color: '#fff', borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 600 }}>
                  {selectedTask?.completionCount ?? 0}
                </span>
              </div>
              <div style={{ ...ROW_STYLE, marginBottom: 0 }}>
                <span style={ROW_LABEL_STYLE}>Last completed</span>
                <span style={{ color: C.text, fontWeight: 500, fontSize: 13 }}>
                  {selectedTask?.lastCompletedAt
                    ? new Date(selectedTask.lastCompletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                    : '—'}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>

    </div>
  );
}
