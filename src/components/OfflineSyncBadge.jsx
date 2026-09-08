import { useEffect, useRef, useState } from 'react';
import { hasPendingOfflineSave } from '../utils/planner/storage';
import {
  showStatusPill,
  setStickyStatusPill,
  clearStickyStatusPill,
} from '../lib/statusPill';

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

  // Rendering is delegated to the shared statusPill (src/lib/statusPill.js)
  // so this badge and the snapshot "Saving\u2026" message queue politely in the
  // same slot instead of racing each other. Ongoing states are sticky;
  // "Synced" is a one-off transient confirmation.
  useEffect(() => {
    if (!online) {
      setStickyStatusPill(
        pending
          ? 'Offline. Your changes are saved and will sync when you reconnect.'
          : 'Offline'
      );
    } else if (showPendingPill) {
      setStickyStatusPill('Syncing changes\u2026');
    } else {
      clearStickyStatusPill();
    }
  }, [online, pending, showPendingPill]);

  useEffect(() => {
    if (synced) showStatusPill('Synced');
  }, [synced]);

  useEffect(() => () => clearStickyStatusPill(), []);

  return null;
}
