/**
 * TaskRowPanelContext
 *
 * Manages the open/closed state and selected task data for the task row
 * detail panel on the System page. Components open the panel by dispatching
 * a TASK_ROW_DETAIL_EVENT custom event (or calling openPanel directly).
 */

import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { usePanelLock } from './PagePanelContext';

const TaskRowPanelContext = createContext(null);

/** Custom event fired to open the panel with a task's data. */
export const TASK_ROW_DETAIL_EVENT = 'task-row-detail-open';

/** Custom event fired when the task row's data changes while the panel is open. */
export const TASK_ROW_DETAIL_UPDATE_EVENT = 'task-row-detail-update';

/** Custom event fired after a task event is written to the DB, to trigger a history reload. */
export const TASK_ROW_DETAIL_RELOAD_HISTORY_EVENT = 'task-row-detail-reload-history';

/** Custom event fired to close the panel (e.g. clicking a row number cell). */
export const TASK_ROW_PANEL_CLOSE_EVENT = 'task-row-panel-close';

/**
 * Structural row types that have no meaningful detail view. Clicking one of
 * these while the panel is open used to show a near-empty card with a Back
 * button; instead we clear the selection so the panel slides back to the top
 * System view.
 * (Mirrors getStructuralRowMessage in components/planner/TaskRowPanel.jsx.)
 *
 * 'archiveRow' (the Archive week header row) is deliberately NOT structural:
 * selecting it opens the Archive Week detail panel (ArchiveWeekPanel.jsx).
 */
const STRUCTURAL_ROW_TYPES = new Set([
  'projectHeader',
  'subprojectHeader',
  'archivedProjectHeader',
  'projectGeneral',
  'archivedProjectGeneral',
  'projectUnscheduled',
  'archivedProjectUnscheduled',
  'subprojectGeneral',
  'subprojectUnscheduled',
  'archiveHeader',
]);

/**
 * True when a task row is still at its empty defaults — no name, no notes,
 * no project/subproject, status unset, no estimate/time, every day cell
 * empty, checkbox off, recurring unset (mirrors createEmptyTaskRow).
 */
function isCompletelyBlankTaskRow(t) {
  if (!t) return true;
  const blank = (v) => {
    const sv = (v ?? '').toString().trim();
    return sv === '' || sv === '-' || sv === '0.00';
  };
  if (!blank(t.task) || !blank(t.notes) || !blank(t.project) || !blank(t.subproject)) return false;
  if (!blank(t.status) || !blank(t.estimate) || !blank(t.timeValue)) return false;
  if (t.checkbox === true || t.checkbox === 'true') return false;
  if ((t.recurring ?? '') !== '' && t.recurring !== 'Not Recurring') return false;
  for (const key of Object.keys(t)) {
    if (key.startsWith('day-') && !blank(t[key])) return false;
  }
  return true;
}

export function TaskRowPanelProvider({ children }) {
  const [selectedTask, setSelectedTask] = useState(null);
  // The blank row most recently clicked while the panel showed the top
  // view — its first real edit promotes it to the detail panel.
  const pendingBlankRowIdRef = useRef(null);
  const { lockedRef, releaseLock } = usePanelLock();

  const openPanel = useCallback((taskData) => {
    setSelectedTask(taskData);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedTask(null);
  }, []);

  // Listen for open events dispatched from anywhere (e.g. TaskRow task-cell click)
  useEffect(() => {
    const handler = (e) => {
      if (!e.detail?.task) return;
      // Panel locked — keep showing the current task regardless of table
      // selection. Explicit in-panel navigation passes `force: true`.
      if (lockedRef.current && !e.detail.force) return;
      // Structural rows (project headers, section rows, archive rows) have no
      // detail view — return to the top panel instead of showing a blank one.
      if (STRUCTURAL_ROW_TYPES.has(e.detail.task._rowType)) {
        closePanel();
        return;
      }
      // Completely blank task rows the same way (2026-10-14): a row still at
      // its empty defaults has nothing to show, so clicking it keeps the top
      // System view instead of the "empty row" card. The row's id is
      // remembered so the panel switches to its detail view the moment a
      // first edit gives it content (see the update handler below).
      const t = e.detail.task;
      if (isCompletelyBlankTaskRow(t)) {
        pendingBlankRowIdRef.current = t.id;
        closePanel();
        return;
      }
      pendingBlankRowIdRef.current = null;
      openPanel(e.detail.task);
    };
    window.addEventListener(TASK_ROW_DETAIL_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_DETAIL_EVENT, handler);
  }, [openPanel, closePanel, lockedRef]);

  // Listen for close events dispatched from anywhere (e.g. row number cell click)
  // Ignored while the panel is locked (it's a table-selection side effect).
  useEffect(() => {
    const handler = (e) => {
      // force: the shown task no longer exists (row deleted) — the lock has
      // nothing left to pin, so void it and return to the top view
      // (2026-10-14).
      if (e?.detail?.force) {
        releaseLock();
        closePanel();
        return;
      }
      if (!lockedRef.current) closePanel();
    };
    window.addEventListener(TASK_ROW_PANEL_CLOSE_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_PANEL_CLOSE_EVENT, handler);
  }, [closePanel, lockedRef, releaseLock]);

  // Listen for live updates to the currently-open task (e.g. status change from the table)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.task) {
        const t = e.detail.task;
        // The blank row the user last selected just got its first content
        // (name committed, status/project set, …): show its detail panel
        // now, as if it had been clicked with content. Respects the lock.
        if (pendingBlankRowIdRef.current === t.id && !isCompletelyBlankTaskRow(t)) {
          pendingBlankRowIdRef.current = null;
          if (!lockedRef.current) openPanel(t);
          return;
        }
        // An open panel whose row is edited back to COMPLETELY blank (all
        // fields at their empty defaults) returns to the top view; clearing
        // just the name keeps the panel up (the user may be retyping it).
        if (!lockedRef.current && isCompletelyBlankTaskRow(t)) {
          setSelectedTask(prev => {
            if (prev?.id !== t.id) return prev;
            pendingBlankRowIdRef.current = t.id;
            return null;
          });
          return;
        }
        setSelectedTask(prev => prev?.id === t.id ? t : prev);
      }
    };
    window.addEventListener(TASK_ROW_DETAIL_UPDATE_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_DETAIL_UPDATE_EVENT, handler);
  }, []);

  return (
    <TaskRowPanelContext.Provider value={{
      selectedTask,
      isOpen: selectedTask !== null,
      openPanel,
      closePanel,
    }}>
      {children}
    </TaskRowPanelContext.Provider>
  );
}

export function useTaskRowPanel() {
  const ctx = useContext(TaskRowPanelContext);
  if (!ctx) throw new Error('useTaskRowPanel must be used inside TaskRowPanelProvider');
  return ctx;
}
