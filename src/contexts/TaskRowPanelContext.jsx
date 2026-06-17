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
