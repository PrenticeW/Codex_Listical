import React from 'react';

// Matches http(s) URLs and bare www. URLs. Deliberately conservative:
// stops at whitespace and common trailing punctuation.
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

// Markdown-style link: [visible text](https://url). Written by the Add link
// dialog (Cmd/Ctrl+K). The URL part is kept strict — http(s) or www. — so a
// stray "[note](see below)" is never mistaken for a link.
// The URL part accepts http(s), www., or a bare domain (google.com/x) —
// anything with spaces, e.g. "[note](see below)", is never treated as a link.
const MD_LINK_REGEX = /\[([^[\]\n]+)\]\(((?:https?:\/\/|www\.|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z][a-z0-9-]*(?=[/?#)]))[^\s()<>"']*)\)/gi;

// Trailing punctuation that is almost always sentence punctuation, not part
// of the URL (e.g. "see https://foo.com." or "(https://foo.com)").
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/** Make a typed URL openable: adds https:// when no scheme is present. */
export function normaliseUrl(url) {
  const u = (url || '').trim();
  if (!u) return '';
  return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) || /^mailto:/i.test(u) ? u : `https://${u}`;
}

const toHref = (url) => normaliseUrl(url);

/**
 * Tokenise text into an ordered list of link matches. Each match is
 * { start, end, raw, label, href } where raw is the exact substring
 * (so callers can preserve caret alignment) and label is what to show.
 * Markdown links win over bare URLs that fall inside them.
 */
export function findLinks(text) {
  if (typeof text !== 'string' || text === '') return [];
  const links = [];

  MD_LINK_REGEX.lastIndex = 0;
  let m;
  while ((m = MD_LINK_REGEX.exec(text)) !== null) {
    links.push({
      start: m.index,
      end: m.index + m[0].length,
      raw: m[0],
      label: m[1],
      href: toHref(m[2]),
      isMarkdown: true,
    });
  }

  URL_REGEX.lastIndex = 0;
  while ((m = URL_REGEX.exec(text)) !== null) {
    let url = m[0];
    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) url = url.slice(0, -trailing[0].length);
    if (!url) continue;
    const start = m.index;
    const end = start + url.length;
    // Skip bare URLs that live inside a markdown link.
    if (links.some((l) => start >= l.start && end <= l.end)) continue;
    links.push({ start, end, raw: url, label: url, href: toHref(url), isMarkdown: false });
  }

  links.sort((a, b) => a.start - b.start);
  return links;
}

/**
 * Turn a plain-text string into an array of React nodes where any URL or
 * markdown link is wrapped in a safe anchor tag. Everything else is emitted
 * as plain text nodes — no HTML in the input is ever interpreted.
 *
 * @param {string} text
 * @returns {React.ReactNode[]} nodes to render in place of the raw string
 */
/** Display style for rendered links: classic hyperlink blue, underlined. */
export const LINK_ANCHOR_STYLE = { color: '#1d4ed8', textDecoration: 'underline' };

export function linkifyText(text, { anchorProps } = {}) {
  if (typeof text !== 'string' || text === '') return [text];

  const links = findLinks(text);
  if (links.length === 0) return [text];

  const nodes = [];
  let lastIndex = 0;
  for (const link of links) {
    if (link.start > lastIndex) nodes.push(text.slice(lastIndex, link.start));
    nodes.push(
      React.createElement(
        'a',
        {
          key: `link-${link.start}`,
          href: link.href,
          target: '_blank',
          rel: 'noopener noreferrer',
          title: link.isMarkdown ? link.href : undefined,
          style: LINK_ANCHOR_STYLE,
          // Links live inside clickable cells/rows — don't let a link click
          // trigger cell selection, drag-select, or the detail panel.
          onClick: (e) => e.stopPropagation(),
          onMouseDown: (e) => e.stopPropagation(),
          ...(anchorProps ? anchorProps(link) : null),
        },
        link.label
      )
    );
    lastIndex = link.end;
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Split text into segments: [{ text, isUrl }]. Used by editors that paint a
 * styled mirror behind a transparent-text input/textarea so URLs read as
 * links while editing. Segments concatenate back to the exact input string
 * (a markdown link's raw "[text](url)" is kept whole so the caret lines up).
 */
export function linkifySegments(text) {
  if (typeof text !== 'string' || text === '') return [{ text: text ?? '', isUrl: false }];

  const segments = [];
  let lastIndex = 0;
  for (const link of findLinks(text)) {
    if (link.start > lastIndex) segments.push({ text: text.slice(lastIndex, link.start), isUrl: false });
    segments.push({ text: link.raw, isUrl: true });
    lastIndex = link.end;
  }
  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isUrl: false });
  return segments;
}

/** Style applied to URL segments in edit-mode mirrors. Same colour and
 *  underline as rendered links, without padding so the caret stays aligned. */
export const URL_SEGMENT_STYLE = { color: '#1d4ed8', textDecoration: 'underline' };

/** Render linkifySegments as inert spans (no anchors, no handlers) for use
 *  inside edit-mode mirror layers. */
export function renderUrlSegments(text) {
  return linkifySegments(text).map((seg, i) =>
    seg.isUrl
      ? React.createElement('span', { key: i, style: URL_SEGMENT_STYLE }, seg.text)
      : React.createElement('span', { key: i }, seg.text)
  );
}

/** True if the string contains at least one linkifiable URL or markdown link. */
export function containsUrl(text) {
  if (typeof text !== 'string') return false;
  return findLinks(text).length > 0;
}

/** Build the markdown form written by the Add link dialog. */
export function formatMarkdownLink(label, url) {
  const cleanUrl = normaliseUrl(url);
  const cleanLabel = (label || '').trim() || cleanUrl;
  return `[${cleanLabel}](${cleanUrl})`;
}

/**
 * If the range [selStart, selEnd] touches an existing link, return it so the
 * dialog can open in edit mode (fields prefilled, whole link replaced on
 * confirm). Otherwise null.
 */
export function linkAtRange(text, selStart, selEnd = selStart) {
  return (
    findLinks(text).find((l) => selStart <= l.end && selEnd >= l.start) || null
  );
}
