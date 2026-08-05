import { useEffect, useState } from 'react';
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
 * Renders nothing in the common case (online, nothing pending).
 */
export default function OfflineSyncBadge() {
  const [pending, setPending] = useState(() => hasPendingOfflineSave());
  const [online, setOnline] = useState(() =>
    typeof navigator === 'undefined' ? true : navigator.onLine !== false,
  );

  useEffect(() => {
    const onPending = (event) => setPending(event.detail?.pending === true);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener('planner-offline-pending', onPending);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('planner-offline-pending', onPending);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  if (online && !pending) return null;

  const label = !online
    ? pending
      ? 'Offline. Your changes are saved and will sync when you reconnect.'
      : 'Offline'
    : 'Syncing changes…';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        bottom: '24px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 999997,
        pointerEvents: 'none',
        background: '#24252B',
        color: '#ECEAF2',
        fontSize: '12px',
        lineHeight: 1,
        padding: '9px 14px',
        borderRadius: '999px',
        boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
        whiteSpace: 'nowrap',
        maxWidth: 'calc(100vw - 32px)',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {label}
    </div>
  );
}
