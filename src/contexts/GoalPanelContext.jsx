import { createContext, useContext, useState, useRef } from 'react';

const GoalPanelContext = createContext(null);

export function GoalPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);

  return (
    <GoalPanelContext.Provider value={{
      isOpen,
      open: () => setIsOpen(true),
      close: () => {
        closedAt.current = Date.now();
        setIsOpen(false);
      },
      toggle: () => {
        const msSinceClose = Date.now() - closedAt.current;
        if (msSinceClose < 500) return;
        setIsOpen(v => !v);
      },
    }}>
      {children}
    </GoalPanelContext.Provider>
  );
}

export function useGoalPanel() {
  const ctx = useContext(GoalPanelContext);
  if (!ctx) throw new Error('useGoalPanel must be used inside GoalPanelProvider');
  return ctx;
}
