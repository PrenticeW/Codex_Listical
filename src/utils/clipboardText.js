/**
 * Read paste text from a clipboard event, keeping hyperlinks.
 *
 * When text is copied from a rich source (Notion, Google Docs, a web page,
 * Slack…) the plain-text flavour only carries the visible words — the URLs
 * behind linked words live in the text/html flavour and are lost. A single
 * pasted URL survives because the URL *is* the visible text; a group paste
 * of linked titles does not.
 *
 * This reads both flavours and, for every <a href> in the HTML whose URL is
 * not already present in the plain text, inserts the URL right after the
 * link's visible text. The plain text's line structure is untouched, so the
 * multi-line "one task per line" flow keeps working and linkify picks up the
 * URLs for display.
 */

const HTTP_RE = /^https?:\/\//i;

const normaliseWs = (s) => s.replace(/\s+/g, ' ').trim();

/**
 * Extract [{ text, href }] pairs from an HTML string, in document order.
 * Only http(s) links with non-empty visible text are returned.
 */
export function extractAnchors(html) {
  if (typeof html !== 'string' || html === '' || typeof DOMParser === 'undefined') return [];
  let doc;
  try {
    doc = new DOMParser().parseFromString(html, 'text/html');
  } catch {
    return [];
  }
  const anchors = [];
  doc.querySelectorAll('a[href]').forEach((a) => {
    const href = (a.getAttribute('href') || '').trim();
    const text = normaliseWs(a.textContent || '');
    if (!HTTP_RE.test(href) || !text) return;
    anchors.push({ text, href });
  });
  return anchors;
}

/**
 * Insert each anchor's href after its visible text inside plainText.
 * Anchors are matched left to right so repeated link text lands in order.
 * Skips anchors whose href is already in the text (e.g. the visible text is
 * the URL itself) and anchors whose text can't be found.
 */
export function mergeLinksIntoText(plainText, anchors) {
  if (typeof plainText !== 'string' || !anchors?.length) return plainText;
  let out = plainText;
  let cursor = 0;
  for (const { text, href } of anchors) {
    if (out.includes(href)) continue;
    let idx = out.indexOf(text, cursor);
    if (idx === -1) idx = out.indexOf(text); // fall back to first occurrence
    if (idx === -1) continue;
    const end = idx + text.length;
    out = `${out.slice(0, end)} ${href}${out.slice(end)}`;
    cursor = end + href.length + 1;
  }
  return out;
}

/**
 * Get the text to paste from a ClipboardEvent's clipboardData, with any
 * hyperlinks from the rich flavour folded into the plain text.
 */
export function getClipboardTextWithLinks(clipboardData) {
  if (!clipboardData) return '';
  const plain = clipboardData.getData('text/plain') ?? '';
  let html = '';
  try {
    html = clipboardData.getData('text/html') ?? '';
  } catch {
    html = '';
  }
  if (!html) return plain;
  return mergeLinksIntoText(plain, extractAnchors(html));
}

/**
 * onPaste handler for a controlled <input>/<textarea>. Only steps in when the
 * rich clipboard carried links the plain text lacks; otherwise the native
 * paste runs untouched. Splices the link-preserving text over the current
 * selection and reports the new value through onValue.
 */
export function pasteKeepingLinks(event, onValue) {
  const cd = event?.clipboardData;
  if (!cd || typeof onValue !== 'function') return;
  const plain = cd.getData('text/plain') ?? '';
  const merged = getClipboardTextWithLinks(cd);
  if (merged === plain) return;
  const el = event.currentTarget;
  const start = el.selectionStart ?? el.value.length;
  const end = el.selectionEnd ?? start;
  event.preventDefault();
  const next = `${el.value.slice(0, start)}${merged}${el.value.slice(end)}`;
  onValue(next);
  const caret = start + merged.length;
  requestAnimationFrame(() => { try { el.setSelectionRange(caret, caret); } catch { /* ignore */ } });
}
