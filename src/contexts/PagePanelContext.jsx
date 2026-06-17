import { createContext, useContext, useState, useRef, useCallback } from 'react';

/**
 * Shared open/closed state for the three page panels (Goal, Plan, System).
 *
 * Each page renders its own panel component (route-gated inside the panel),
 * but they share this single open state so the panel "follows" the user
 * across page navigation instead of closing. The per-page hooks
 * (useGoalPanel / usePlanPanel / useSystemPanel) all delegate here.
 */
const PagePanelContext = createContext(null);

export function PagePanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => {
    closedAt.current = Date.now();
    setIsOpen(false);
  }, []);
  const toggle = useCallback(() => {
    // Ignore toggles fired immediately after a close (click-outside +
    // toggle-button race) — same debounce the per-page contexts used.
    const msSinceClose = Date.now() - closedAt.current;
    if (msSinceClose < 500) return;
    setIsOpen(v => !v);
  }, []);

  return (
    <PagePanelContext.Provider value={{ isOpen, open, close, toggle }}>
      {children}
    </PagePanelContext.Provider>
  );
}

export function usePagePanel() {
  const ctx = useContext(PagePanelContext);
  if (!ctx) throw new Error('usePagePanel must be used inside PagePanelProvider');
  return ctx;
}
