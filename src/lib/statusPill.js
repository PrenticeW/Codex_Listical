/**
 * statusPill — the single bottom-left status pill (next to the snapshot
 * button in Layout.jsx).
 *
 * All save/sync messaging funnels through here so messages queue politely
 * instead of racing each other in the same screen slot (previously the
 * OfflineSyncBadge and the snapshot toast each rendered their own pill at
 * bottom:26/left:76 and cut each other off).
 *
 * This is deliberately messaging-only: it reports what just happened in a
 * user-friendly order, it is not a live view of sync state.
 *
 * Two kinds of message:
 *   - showStatusPill(label)        transient; queued, shown ~2s each, then
 *                                  faded out (or replaced by the next one).
 *   - setStickyStatusPill(label)   stays up until cleared (offline banner,
 *                                  lingering "Syncing changes…"). Transient
 *                                  messages temporarily replace it, then it
 *                                  comes back.
 *   - clearStickyStatusPill()
 *
 * No React: a single DOM node managed imperatively, so storage modules
 * (snapshotStorage) and components can share it without coupling.
 */

const FADE_IN_MS = 250;
const HOLD_MS = 2000;
const FADE_OUT_MS = 900;

let el = null;
let queue = [];
let sticky = null;       // label string | null
let pumping = false;
let currentLabel = null; // label currently on screen while pumping

const inBrowser = () =>
  typeof document !== 'undefined' && typeof window !== 'undefined';

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function ensureEl() {
  if (el && document.body.contains(el)) return el;
  el = document.createElement('div');
  el.setAttribute('role', 'status');
  el.setAttribute('aria-live', 'polite');
  // Quiet by design: pale, low-contrast, slow fades — a status hint, not an
  // alert. Sits beside the 40px snapshot button (bottom:24/left:24).
  Object.assign(el.style, {
    position: 'fixed',
    bottom: '26px',
    left: '76px',
    zIndex: '999999',
    pointerEvents: 'none',
    background: 'rgba(248, 250, 252, 0.96)',
    color: '#334155',
    border: '1px solid rgba(100, 116, 139, 0.25)',
    fontSize: '13px',
    fontWeight: '500',
    lineHeight: '1',
    padding: '8px 14px',
    borderRadius: '999px',
    boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
    whiteSpace: 'nowrap',
    maxWidth: 'calc(100vw - 92px)',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    fontFamily: 'system-ui, sans-serif',
    opacity: '0',
    transition: `opacity ${FADE_IN_MS}ms ease`,
  });
  document.body.appendChild(el);
  return el;
}

function setVisible(label, visible, fadeMs) {
  const node = ensureEl();
  if (label != null) node.textContent = label;
  node.style.transition = `opacity ${fadeMs}ms ease`;
  // Double rAF so a freshly created node still animates its first fade.
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      node.style.opacity = visible ? '1' : '0';
    })
  );
}

async function pump() {
  if (pumping) return;
  pumping = true;
  try {
    while (queue.length > 0) {
      const msg = queue.shift();
      currentLabel = msg.label;
      setVisible(msg.label, true, FADE_IN_MS);
      await wait(FADE_IN_MS + msg.holdMs);
    }
    currentLabel = null;
    if (sticky != null) {
      // Hand the slot back to the sticky message.
      setVisible(sticky, true, FADE_IN_MS);
    } else {
      setVisible(null, false, FADE_OUT_MS);
    }
  } finally {
    pumping = false;
    if (queue.length > 0) pump(); // queued while we were finishing up
  }
}

/** Show a transient message (~2s), queued behind any message already up. */
export function showStatusPill(label, { holdMs = HOLD_MS } = {}) {
  if (!inBrowser() || !label) return;
  // Skip exact duplicates of what is showing / about to show.
  const last = queue.length > 0 ? queue[queue.length - 1].label : currentLabel;
  if (label === last) return;
  queue.push({ label, holdMs });
  pump();
}

/** Show a message that stays until cleared (e.g. the offline banner). */
export function setStickyStatusPill(label) {
  if (!inBrowser() || !label) return;
  sticky = label;
  if (!pumping) setVisible(label, true, FADE_IN_MS);
}

export function clearStickyStatusPill() {
  if (!inBrowser() || sticky == null) return;
  sticky = null;
  if (!pumping) setVisible(null, false, FADE_OUT_MS);
}
