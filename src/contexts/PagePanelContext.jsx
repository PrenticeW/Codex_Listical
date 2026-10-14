import { createContext, useContext, useState, useRef, useCallback, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { useGearPanel } from './GearPanelContext';

/**
 * Shared open/closed state for the three page panels (Goal, Plan, System).
 *
 * Each page renders its own panel component (route-gated inside the panel),
 * but they share this single open state so the panel "follows" the user
 * across page navigation instead of closing. The per-page hooks
 * (useGoalPanel / usePlanPanel / useSystemPanel) all delegate here.
 *
 * Also holds the shared panel *lock*: while locked, the panels ignore
 * incoming table/chip selection events and keep showing whatever they were
 * showing when the lock was engaged. `lockedRef` mirrors `locked` so event
 * listeners can read the current value without re-subscribing.
 *
 * The lock also records WHICH page it was engaged on (`lockedPath`): while
 * locked, the three page panels route-gate against lockedPath instead of the
 * live pathname, so the locked panel stays mounted (pinned) across page
 * navigation and the other pages' panels stand down until unlock.
 *
 * Mutual exclusion with the gear panel: only one of the two can be open.
 * Opening a page panel closes the gear panel, and vice versa. Both sides
 * live here because GearPanelProvider wraps this provider (Layout.jsx),
 * so only this one can see both states.
 */
const PagePanelContext = createContext(null);

export function PagePanelProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false);
  const closedAt = useRef(0);
  const gear = useGearPanel();

  const [locked, setLocked] = useState(false);
  // Pathname the lock was engaged on — pins that page's panel across
  // navigation (null while unlocked).
  const [lockedPath, setLockedPath] = useState(null);
  const lockedRef = useRef(false);
  const { pathname } = useLocation();
  useEffect(() => { lockedRef.current = locked; }, [locked]);
  const toggleLock = useCallback(() => {
    const next = !lockedRef.current;
    setLocked(next);
    setLockedPath(next ? pathname : null);
  }, [pathname]);

  // Drop the lock programmatically — used when the thing the lock was
  // pinning no longer exists (e.g. the locked task row was deleted,
  // 2026-10-14). No-op while unlocked.
  const releaseLock = useCallback(() => {
    setLocked(false);
    setLockedPath(null);
  }, []);

  const open = useCallback(() => {
    gear.close();
    setIsOpen(true);
  }, [gear]);
  const close = useCallback(() => {
    closedAt.current = Date.now();
    setIsOpen(false);
  }, []);
  const toggle = useCallback(() => {
    // Ignore toggles fired immediately after a close (click-outside +
    // toggle-button race) — same debounce the per-page contexts used.
    const msSinceClose = Date.now() - closedAt.current;
    if (msSinceClose < 500) return;
    setIsOpen(v => {
      const next = !v;
      if (next) gear.close();
      return next;
    });
  }, [gear]);

  // Gear panel opened → close the page panel so it can't sit hidden behind it
  useEffect(() => {
    if (gear.isOpen) {
      setIsOpen(wasOpen => {
        if (wasOpen) closedAt.current = Date.now();
        return false;
      });
    }
  }, [gear.isOpen]);

  return (
    <PagePanelContext.Provider value={{ isOpen, open, close, toggle, locked, lockedPath, lockedRef, setLocked, toggleLock, releaseLock }}>
      {children}
    </PagePanelContext.Provider>
  );
}

export function usePagePanel() {
  const ctx = useContext(PagePanelContext);
  if (!ctx) throw new Error('usePagePanel must be used inside PagePanelProvider');
  return ctx;
}

/** Lock state only — for panel content that needs to read/toggle the lock. */
export function usePanelLock() {
  const { locked, lockedPath, lockedRef, setLocked, toggleLock, releaseLock } = usePagePanel();
  return { locked, lockedPath, lockedRef, setLocked, toggleLock, releaseLock };
}
