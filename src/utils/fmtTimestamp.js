/**
 * Format a snapshot ISO timestamp for display in the version history UI.
 *
 * < 1 min  → "Just now"
 * < 1 hr   → "14:52 · 5m ago"
 * < 1 day  → "14:52 · 2h ago"
 * < 1 week → "Mon 14:52"
 * older    → "Jun 15, 2:52 PM"
 */
export function fmtTimestamp(iso) {
  if (!iso) return 'Unknown time';
  const d       = new Date(iso);
  const now     = new Date();
  const mins    = Math.round((now - d) / 60000);
  const hours   = Math.round((now - d) / 3600000);
  const days    = Math.round((now - d) / 86400000);
  const timeStr = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
  if (mins  < 1)  return 'Just now';
  if (mins  < 60) return `${timeStr} · ${mins}m ago`;
  if (hours < 24) return `${timeStr} · ${hours}h ago`;
  if (days  < 7)  return `${d.toLocaleDateString(undefined, { weekday: 'short' })} ${timeStr}`;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}
