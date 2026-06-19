/**
 * TaskRowPanel — Task detail view content.
 *
 * Exports TaskDetailContent: a self-contained inner-slide pair
 * (task detail main view + history sub-view). No portal or fixed
 * positioning — SystemPanel owns the panel shell and the outer slide.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { PILLBOX_COLORS } from './DropdownCell';
import { saveTaskNote, readTaskEvents } from '../../utils/planner/storage';
import { TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT } from '../../contexts/TaskRowPanelContext';
import { fmtTimestamp } from '../../utils/fmtTimestamp';

// ─── Design tokens ────────────────────────────────────────────────────────────

const C = {
  bg:          '#fff',
  bgSubtle:    '#fafaf8',
  border:      '#e8e8e4',
  borderLight: '#f0f0ed',
  borderMid:   '#f5f5f3',
  text:        '#1a1a1a',
  textDim:     '#555',
  textMid:     '#777',
  textFaint:   '#999',
  textLight:   '#bbb',
  green:       '#1a7a5c',
  greenDark:   '#1a5c3a',
};

const FONT = "'Google Sans', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif";

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
      fontSize: 11, fontWeight: 600, letterSpacing: '0.1em',
      textTransform: 'uppercase', color: C.textLight, marginBottom: 16,
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

function HeaderStatusChip({ status }) {
  const s = getStatusChip(status);
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      fontSize: 11, fontWeight: 500, borderRadius: 20, padding: '3px 9px',
      background: s.bg, color: s.color, border: `1px solid ${s.border}`,
      flexShrink: 0,
    }}>
      <svg width="7" height="7" viewBox="0 0 7 7" fill="none">
        <circle cx="3.5" cy="3.5" r="3" fill={s.dot} />
      </svg>
      {status || '—'}
    </span>
  );
}

const ChevronRight = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
    <path d="M1 1l5 4.5L1 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const ChevronLeft = () => (
  <svg width="7" height="11" viewBox="0 0 7 11" fill="none">
    <path d="M6 1L1 5.5L6 10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

function BackBtn({ onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: 'none', border: 'none', cursor: 'pointer', color: C.textLight,
        display: 'flex', alignItems: 'center', padding: 0, gap: 4,
        fontFamily: FONT, fontSize: 12,
        transition: 'color 0.15s',
      }}
      onMouseEnter={e => e.currentTarget.style.color = C.text}
      onMouseLeave={e => e.currentTarget.style.color = C.textLight}
    >
      <ChevronLeft />
      Back
    </button>
  );
}

function RecurringChip({ active, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        fontSize: 11, fontFamily: FONT,
        borderRadius: 20, padding: '3px 9px',
        background: active ? C.green : '#f7f7f5',
        color: active ? '#fff' : '#888',
        border: `1px solid ${active ? C.green : '#e0e0dc'}`,
        cursor: 'pointer',
        transition: 'background 0.15s, color 0.15s, border-color 0.15s',
      }}
    >
      {active ? (
        <svg width="10" height="10" viewBox="0 0 12 10" fill="none">
          <path d="M1 5l3.5 3.5L11 1" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      ) : (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none">
          <path d="M6 1v10M1 6h10" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
        </svg>
      )}
      Recurring
    </button>
  );
}

function HistoryEntry({ status, fromStatus, time, note, isLast }) {
  const s = getStatusChip(status);
  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: 10,
      padding: '10px 0',
      borderBottom: isLast ? 'none' : `1px solid ${C.borderMid}`,
    }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', paddingTop: 2, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: s.dot, flexShrink: 0 }} />
        {!isLast && <div style={{ width: 1, background: C.border, flex: 1, minHeight: 18, marginTop: 3 }} />}
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: note ? 3 : 0, flexWrap: 'wrap' }}>
          {fromStatus && (
            <>
              <StatusChipSm status={fromStatus} />
              <span style={{ color: C.textLight, fontSize: 10 }}>→</span>
            </>
          )}
          <StatusChipSm status={status} />
          <span style={{ fontSize: 11, color: C.textLight }}>{time}</span>
        </div>
        {note && (
          <div style={{ fontSize: 12, color: C.textFaint, marginTop: 2, lineHeight: 1.45 }}>{note}</div>
        )}
      </div>
    </div>
  );
}

function CreatedEntry({ date, agePill }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 0' }}>
      <div style={{ paddingTop: 2, flexShrink: 0 }}>
        <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#ccc' }} />
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
          <span style={{ fontSize: 11, color: C.textLight }}>
            {date}
            {agePill && (
              <span style={{
                fontSize: 11, color: C.textFaint,
                background: '#f5f5f3', border: `1px solid ${C.border}`,
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

function RecurringBlock({ completionCount, lastCompletedAt }) {
  return (
    <div style={{
      background: C.bgSubtle, border: `1px solid ${C.border}`,
      borderRadius: 10, padding: '12px 14px',
    }}>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 14, paddingBottom: 6, borderBottom: `1px solid ${C.borderLight}`,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.textFaint }}>
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <path d="M11 6.5a4.5 4.5 0 10-4.5 4.5" stroke={C.textLight} strokeWidth="1.2" strokeLinecap="round"/>
            <path d="M11 4v2.5H8.5" stroke={C.textLight} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Completions
        </span>
        <span style={{
          background: C.green, color: '#fff',
          borderRadius: 20, padding: '1px 8px', fontSize: 12, fontWeight: 600,
        }}>
          {completionCount ?? 0}
        </span>
      </div>
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        fontSize: 14, paddingTop: 6,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.textFaint }}>
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke={C.textLight} strokeWidth="1.2"/>
            <path d="M6.5 4v3l2 1.5" stroke={C.textLight} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Last completed
        </span>
        <span style={{ color: C.text, fontWeight: 500, fontSize: 14 }}>{lastCompletedAt ?? '—'}</span>
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
    <div style={{ display: 'flex', width: 960, height: '100%' }}>
      <div style={{ width: 480, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden', height: '100%', display: 'flex', flexDirection: 'column' }}>
        {/* Sticky header */}
        <div style={{ padding: '20px 26px 16px', borderBottom: `1px solid ${C.borderLight}`, position: 'sticky', top: 0, background: C.bg, zIndex: 2 }}>
          <div style={{ marginBottom: 18 }}>
            <BackBtn onClick={onBack} />
          </div>
          <div style={{ fontSize: 13, fontWeight: 500, color: C.textDim, marginBottom: 4 }}>Subproject</div>
          <div style={{ fontSize: 15, fontWeight: 600, color: C.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {rowLabel}
          </div>
        </div>

        {/* Day tag section */}
        <div style={{ padding: '20px 26px', borderBottom: `1px solid ${C.borderLight}` }}>
          <SectionLabel>Day</SectionLabel>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {DAY_TAGS.map(day => {
              const isActive = dayTag === day;
              return (
                <button
                  key={day}
                  onClick={() => handleDayPick(day)}
                  style={{
                    padding: '5px 12px', borderRadius: 20, border: 'none', cursor: 'pointer',
                    fontFamily: FONT, fontSize: 13, fontWeight: isActive ? 600 : 400,
                    background: isActive ? C.green : C.bgSubtle,
                    color: isActive ? '#fff' : C.textMid,
                    transition: 'background 0.12s, color 0.12s',
                  }}
                  onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#e8efe9'; }}
                  onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = C.bgSubtle; }}
                >
                  {day}
                </button>
              );
            })}
          </div>

          {/* Lock status */}
          <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
            {dayTagLocked ? (
              <>
                <span style={{ fontSize: 12, color: C.textMid }}>Manually set</span>
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
              </>
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
  const noteSaveDebounceRef = React.useRef(null);

  // Reset inner state and load fresh data whenever the selected task changes
  useEffect(() => {
    // Cancel any pending note save from the previous task
    if (noteSaveDebounceRef.current) {
      clearTimeout(noteSaveDebounceRef.current);
      noteSaveDebounceRef.current = null;
    }
    setShowHistory(false);
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
    e.target.style.borderColor = '#e0e0dc';
    e.target.style.background = C.bgSubtle;
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

  const taskName   = selectedTask?.task || '—';
  const status     = selectedTask?.status || '';
  const project    = selectedTask?.project;
  const subproject = selectedTask?.subproject;
  const hasProject    = project && project !== '-' && project !== '';
  const hasSubproject = subproject && subproject !== '-' && subproject !== '';

  // Structural/blank row empty state
  const structuralMessage = getStructuralRowMessage(selectedTask);
  const isBlankRow = !structuralMessage && !(selectedTask?.task ?? '').trim();

  if (structuralMessage || isBlankRow) {
    const message = structuralMessage ?? 'Empty row — add a task name to get started';
    return (
      <div style={{ display: 'flex', width: 960, height: '100%' }}>
        <div style={{
          width: 480, flexShrink: 0, height: '100%', display: 'flex', flexDirection: 'column',
        }}>
          <div style={{
            padding: '20px 26px 16px',
            borderBottom: `1px solid ${C.borderLight}`,
            position: 'sticky', top: 0, background: C.bg, zIndex: 2,
          }}>
            <div style={{ marginBottom: 18 }}>
              <BackBtn onClick={onBack} />
            </div>
          </div>
          <div style={{ padding: '24px 26px' }}>
            <p style={{ fontFamily: 'Inter, system-ui, sans-serif', fontSize: 13, color: C.textFaint, fontStyle: 'italic', margin: 0 }}>
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
    // Inner slide: 640px wide, clips at 320px via parent overflow:hidden
    <div style={{
      display: 'flex', width: 960, height: '100%',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      transform: showHistory ? 'translateX(-480px)' : 'translateX(0)',
    }}>

      {/* ── Task detail main view ── */}
      <div style={{
        width: 480, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Sticky header */}
        <div style={{
          padding: '20px 26px 16px',
          borderBottom: `1px solid ${C.borderLight}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <div style={{ marginBottom: 18 }}>
            <BackBtn onClick={onBack} />
          </div>

          <div style={{
            fontSize: 15, fontWeight: 600, color: C.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 8,
          }}>
            {taskName}
          </div>

          {hasProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 12, fontWeight: 600, color: C.textDim }}>{project}</span>
              {hasSubproject && (
                <>
                  <span style={{ fontSize: 11, color: C.textLight }}>/</span>
                  <span style={{ fontSize: 12, color: C.textMid }}>{subproject}</span>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {/* {status && <HeaderStatusChip status={status} />} */}
            <RecurringChip active={recurringActive} onToggle={toggleRecurring} />
          </div>
        </div>

        {/* Notes */}
        <div style={{ borderBottom: `1px solid ${C.borderLight}`, padding: '20px 26px 14px' }}>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            placeholder="Add a note…"
            value={notes}
            onChange={handleNotesChange}
            style={{
              width: '100%', minHeight: 360, resize: 'none',
              border: '1px solid #e0e0dc', borderRadius: 10,
              fontFamily: FONT, fontSize: 14, color: C.text,
              background: C.bgSubtle, padding: '12px 14px',
              outline: 'none', lineHeight: 1.55,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = C.green; e.target.style.background = '#fff'; }}
            onBlur={handleNotesBlur}
          />
        </div>

        {/* Status history preview */}
        <div style={{ padding: '20px 26px 32px' }}>
          <SectionLabel>Status history</SectionLabel>

          <button
            onClick={() => setShowHistory(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: FONT, fontSize: 13, color: C.green, marginTop: 14,
              transition: 'opacity 0.15s',
            }}
            onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
            onMouseLeave={e => e.currentTarget.style.opacity = '1'}
          >
            <svg width="11" height="11" viewBox="0 0 13 13" fill="none">
              <path d="M6.5 1v12M1 6.5h11" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" opacity="0.5"/>
            </svg>
            See all {statusEvents.length > 0 ? `${statusEvents.length} ` : ''}changes
            <ChevronRight />
          </button>
        </div>
      </div>

      {/* ── History sub-view ── */}
      <div style={{
        width: 480, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
          padding: '20px 26px 16px', borderBottom: `1px solid ${C.borderLight}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <BackBtn onClick={() => setShowHistory(false)} />
          <span style={{ fontSize: 14, fontWeight: 600, color: C.text }}>Status history</span>
        </div>

        <div style={{ padding: '6px 26px 24px' }}>
          {statusEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic', paddingTop: 14 }}>
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
          <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: '20px 26px' }}>
            <SectionLabel>Recurring</SectionLabel>
            <RecurringBlock
              completionCount={selectedTask?.completionCount ?? 0}
              lastCompletedAt={
                selectedTask?.lastCompletedAt
                  ? new Date(selectedTask.lastCompletedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
                  : null
              }
            />
          </div>
        )}
      </div>

    </div>
  );
}
