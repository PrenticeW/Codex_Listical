import { useEffect, useRef, useState } from 'react';
import { hasPendingOfflineSave } from '../utils/planner/storage';

/**
 * OfflineSyncBadge — small fixed pill telling the user their edits are safe
 * while offline (docs/offline-sync-plan.md, the "changes pending" indicator).
 *
 * Driven entirely by events; no polling, no Supabase calls (per CLAUDE.md
 * this component talks only to the storage module's exported surface):
 *   * 'planner-offline-pending' from plannerOffline — a pending save record
 *     exists / was cleared in IndexedDB
 *   * window 'online' / 'offline' — browser connectivity
 *
 * Every save passes through the pending record even online, so the pending
 * flag flickers true → false in well under a second on a normal save. The
 * "Syncing changes…" pill therefore only appears if the pending state
 * LINGERS (~1s — genuinely offline or a struggling connection), and the
 * transient "Synced" confirmation only shows after the pill (or the offline
 * banner) was actually visible. Going offline shows immediately — no debounce.
 *
 * Renders nothing in the common case (online, nothing pending).
 */
export default function OfflineSyncBadge() {
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );
  const [pending, setPending] = useState(() => hasPendingOfflineSave());
  const [showPendingPill, setShowPendingPill] = useState(false);
  const [synced, setSynced] = useState(false);

  const pillShownRef = useRef(false);
  const pillDelayTimerRef = useRef(null);
  const syncedTimerRef = useRef(null);
  const onlineRef = useRef(online);
  onlineRef.current = online;

  useEffect(() => {
    const clearPillDelay = () => {
      if (pillDelayTimerRef.current) {
        clearTimeout(pillDelayTimerRef.current);
        pillDelayTimerRef.current = null;
      }
    };
    const onPending = (event) => {
      const isPending = event.detail?.pending === true;
      setPending(isPending);
      if (isPending) {
        if (syncedTimerRef.current) {
          clearTimeout(syncedTimerRef.current);
          syncedTimerRef.current = null;
        }
        setSynced(false);
        if (!pillShownRef.current && !pillDelayTimerRef.current) {
          pillDelayTimerRef.current = setTimeout(() => {
            pillDelayTimerRef.current = null;
            pillShownRef.current = true;
            setShowPendingPill(true);
          }, 900);
        }
      } else {
        clearPillDelay();
        // Confirm with "Synced" only if the user ever SAW an unsynced state
        // (the lingering pill, or the offline banner while edits were made).
        if (pillShownRef.current || onlineRef.current === false) {
          pillShownRef.current = false;
          setShowPendingPill(false);
          setSynced(true);
          syncedTimerRef.current = setTimeout(() => {
            syncedTimerRef.current = null;
            setSynced(false);
          }, 2200);
        }
      }
    };
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('planner-offline-pending', onPending);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      clearPillDelay();
      if (syncedTimerRef.current) clearTimeout(syncedTimerRef.current);
      window.removeEventListener('planner-offline-pending', onPending);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  const active = !online || showPendingPill || synced;

  // Keep the last label on screen while fading out so the text doesn't
  // change mid-fade.
  const lastLabelRef = useRef('');

  const label = !online
    ? pending
      ? 'Offline. Your changes are saved and will sync when you reconnect.'
      : 'Offline'
    : showPendingPill
      ? 'Syncing changes…'
      : 'Synced';
  if (active) lastLabelRef.current = label;

  // Sits bottom-left beside the 40px snapshot button (bottom:24/left:24 in
  // Layout.jsx), in the same slot the snapshot toast uses. Styled to be
  // quiet — pale, low-contrast, slow fade — so it reads as a status hint
  // rather than an alert. Stays mounted while fading out.
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '26px',
        left: '76px',
        zIndex: 999997,
        pointerEvents: 'none',
        background: 'rgba(248, 250, 252, 0.96)',
        color: '#334155',
        border: '1px solid rgba(100, 116, 139, 0.25)',
        fontSize: '13px',
        lineHeight: 1,
        padding: '8px 14px',
        borderRadius: '999px',
        boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100vw - 32px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
        opacity: active ? 1 : 0,
        transition: active ? 'opacity 0.8s ease' : 'opacity 1.5s ease',
      }}
    >
      {lastLabelRef.current}
    </div>
  );
}
