import { createContext, useContext, useState, useRef } from 'react';

const SystemPanelContext = createContext(null);

export function SystemPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);

  return (
    <SystemPanelContext.Provider value={{
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
    </SystemPanelContext.Provider>
  );
}

export function useSystemPanel() {
  const ctx = useContext(SystemPanelContext);
  if (!ctx) throw new Error('useSystemPanel must be used inside SystemPanelProvider');
  return ctx;
}
