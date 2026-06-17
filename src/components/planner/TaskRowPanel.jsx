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

// ─── Shared primitives ────────────────────────────────────────────────────────

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
        fontSize: 13, paddingBottom: 5, borderBottom: `1px solid ${C.borderLight}`,
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
        fontSize: 13, paddingTop: 5,
      }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: 7, color: C.textFaint }}>
          <svg width="12" height="12" viewBox="0 0 13 13" fill="none">
            <circle cx="6.5" cy="6.5" r="5" stroke={C.textLight} strokeWidth="1.2"/>
            <path d="M6.5 4v3l2 1.5" stroke={C.textLight} strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Last completed
        </span>
        <span style={{ color: C.text, fontWeight: 500, fontSize: 13 }}>{lastCompletedAt ?? '—'}</span>
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
export function TaskDetailContent({ selectedTask, onBack }) {
  const [showHistory, setShowHistory] = useState(false);
  const [recurringActive, setRecurringActive] = useState(false);
  const [notes, setNotes] = useState('');
  const [events, setEvents] = useState([]);

  // Reset inner state and load fresh data whenever the selected task changes
  useEffect(() => {
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

  const handleNotesBlur = useCallback((e) => {
    e.target.style.borderColor = '#e0e0dc';
    e.target.style.background = C.bgSubtle;
    if (selectedTask?.id) {
      saveTaskNote(selectedTask.id, e.target.value);
    }
  }, [selectedTask?.id]);

  function toggleRecurring() {
    const next = !recurringActive;
    setRecurringActive(next);
    if (selectedTask?.id) {
      window.dispatchEvent(new CustomEvent('system-panel-action', {
        detail: { action: 'updateTaskField', rowId: selectedTask.id, field: 'recurring', value: String(next) },
      }));
    }
  }

  const taskName   = selectedTask?.task || '—';
  const status     = selectedTask?.status || '';
  const project    = selectedTask?.project;
  const subproject = selectedTask?.subproject;
  const hasProject    = project && project !== '-' && project !== '';
  const hasSubproject = subproject && subproject !== '-' && subproject !== '';

  // Map DB event rows to HistoryEntry props (status events only)
  const statusEvents = events
    .filter(ev => ev.field === 'status')
    .map(ev => ({
      status: ev.new_value,
      fromStatus: ev.old_value || null,
      time: new Date(ev.changed_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }),
      note: ev.note || null,
    }));

  return (
    // Inner slide: 640px wide, clips at 320px via parent overflow:hidden
    <div style={{
      display: 'flex', width: 640, height: '100%',
      transition: 'transform 0.25s cubic-bezier(0.4,0,0.2,1)',
      transform: showHistory ? 'translateX(-320px)' : 'translateX(0)',
    }}>

      {/* ── Task detail main view ── */}
      <div style={{
        width: 320, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        {/* Sticky header */}
        <div style={{
          padding: '18px 22px 14px',
          borderBottom: `1px solid ${C.borderLight}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <div style={{ marginBottom: 18 }}>
            <BackBtn onClick={onBack} />
          </div>

          <div style={{
            fontSize: 13, fontWeight: 600, color: C.text,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            marginBottom: 6,
          }}>
            {taskName}
          </div>

          {hasProject && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
              <span style={{ fontSize: 11, fontWeight: 600, color: C.textDim }}>{project}</span>
              {hasSubproject && (
                <>
                  <span style={{ fontSize: 11, color: C.textLight }}>/</span>
                  <span style={{ fontSize: 11, color: C.textMid }}>{subproject}</span>
                </>
              )}
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {status && <HeaderStatusChip status={status} />}
            <RecurringChip active={recurringActive} onToggle={toggleRecurring} />
          </div>
        </div>

        {/* Notes */}
        <div style={{ borderBottom: `1px solid ${C.borderLight}`, padding: '18px 22px 12px' }}>
          <SectionLabel>Notes</SectionLabel>
          <textarea
            placeholder="Add a note…"
            value={notes}
            onChange={e => setNotes(e.target.value)}
            style={{
              width: '100%', minHeight: 360, resize: 'none',
              border: '1px solid #e0e0dc', borderRadius: 10,
              fontFamily: FONT, fontSize: 13, color: C.text,
              background: C.bgSubtle, padding: '10px 12px',
              outline: 'none', lineHeight: 1.55,
              transition: 'border-color 0.15s',
            }}
            onFocus={e => { e.target.style.borderColor = C.green; e.target.style.background = '#fff'; }}
            onBlur={handleNotesBlur}
          />
        </div>

        {/* Status history preview */}
        <div style={{ padding: '18px 22px 28px' }}>
          <SectionLabel>Status history</SectionLabel>

          {statusEvents.length === 0 ? (
            <div style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic' }}>
              No history yet.
            </div>
          ) : (
            statusEvents.slice(0, 3).map((ev, i) => (
              <HistoryEntry key={i} {...ev} isLast={i === Math.min(2, statusEvents.length - 1)} />
            ))
          )}

          <button
            onClick={() => setShowHistory(true)}
            style={{
              display: 'flex', alignItems: 'center', gap: 5,
              background: 'none', border: 'none', padding: 0, cursor: 'pointer',
              fontFamily: FONT, fontSize: 12, color: C.green, marginTop: 12,
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
        width: 320, flexShrink: 0, overflowY: 'auto', overflowX: 'hidden',
        height: '100%', display: 'flex', flexDirection: 'column',
      }}>
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10,
          padding: '18px 22px 14px', borderBottom: `1px solid ${C.borderLight}`,
          position: 'sticky', top: 0, background: C.bg, zIndex: 2,
        }}>
          <BackBtn onClick={() => setShowHistory(false)} />
          <span style={{ fontSize: 13, fontWeight: 600, color: C.text }}>Status history</span>
        </div>

        <div style={{ padding: '4px 22px 20px' }}>
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
          <div style={{ borderTop: `1px solid ${C.borderLight}`, padding: '18px 22px' }}>
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
