import { createContext, useContext, useState, useRef } from 'react';

const PlanPanelContext = createContext(null);

export function PlanPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);

  return (
    <PlanPanelContext.Provider value={{
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
    </PlanPanelContext.Provider>
  );
}

export function usePlanPanel() {
  const ctx = useContext(PlanPanelContext);
  if (!ctx) throw new Error('usePlanPanel must be used inside PlanPanelProvider');
  return ctx;
}
