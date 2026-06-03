import { createContext, useContext, useState, useRef } from 'react';

const GearPanelContext = createContext(null);

export function GearPanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);

  return (
    <GearPanelContext.Provider value={{
      isOpen,
      open: () => {
        console.trace('[GearPanel] open()');
        setIsOpen(true);
      },
      close: () => {
        console.trace('[GearPanel] close()');
        closedAt.current = Date.now();
        setIsOpen(false);
      },
      toggle: () => {
        const msSinceClose = Date.now() - closedAt.current;
        console.log('[GearPanel] toggle() — ms since last close:', msSinceClose);
        if (msSinceClose < 500) {
          console.log('[GearPanel] toggle() suppressed — ghost click within 500ms of close()');
          return;
        }
        console.trace('[GearPanel] toggle()');
        setIsOpen(v => !v);
      },
    }}>
      {children}
    </GearPanelContext.Provider>
  );
}

export function useGearPanel() {
  const ctx = useContext(GearPanelContext);
  if (!ctx) throw new Error('useGearPanel must be used inside GearPanelProvider');
  return ctx;
}
