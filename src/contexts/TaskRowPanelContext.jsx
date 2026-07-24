/**
 * TaskRowPanelContext
 *
 * Manages the open/closed state and selected task data for the task row
 * detail panel on the System page. Components open the panel by dispatching
 * a TASK_ROW_DETAIL_EVENT custom event (or calling openPanel directly).
 */

import { createContext, useContext, useState, useEffect, useCallback } from 'react';

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
  'archiveRow',
]);

export function TaskRowPanelProvider({ children }) {
  const [selectedTask, setSelectedTask] = useState(null);

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
      // Structural rows (project headers, section rows, archive rows) have no
      // detail view — return to the top panel instead of showing a blank one.
      if (STRUCTURAL_ROW_TYPES.has(e.detail.task._rowType)) {
        closePanel();
        return;
      }
      openPanel(e.detail.task);
    };
    window.addEventListener(TASK_ROW_DETAIL_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_DETAIL_EVENT, handler);
  }, [openPanel, closePanel]);

  // Listen for close events dispatched from anywhere (e.g. row number cell click)
  useEffect(() => {
    window.addEventListener(TASK_ROW_PANEL_CLOSE_EVENT, closePanel);
    return () => window.removeEventListener(TASK_ROW_PANEL_CLOSE_EVENT, closePanel);
  }, [closePanel]);

  // Listen for live updates to the currently-open task (e.g. status change from the table)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.task) {
        setSelectedTask(prev => prev?.id === e.detail.task.id ? e.detail.task : prev);
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
