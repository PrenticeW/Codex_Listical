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

export function TaskRowPanelProvider({ children }) {
  const [selectedTask, setSelectedTask] = useState(null);

  const openPanel = useCallback((taskData) => {
    setSelectedTask(taskData);
  }, []);

  const closePanel = useCallback(() => {
    setSelectedTask(null);
  }, []);

  // Listen for open events dispatched from anywhere (e.g. TaskRow row-number click)
  useEffect(() => {
    const handler = (e) => {
      if (e.detail?.task) openPanel(e.detail.task);
    };
    window.addEventListener(TASK_ROW_DETAIL_EVENT, handler);
    return () => window.removeEventListener(TASK_ROW_DETAIL_EVENT, handler);
  }, [openPanel]);

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
