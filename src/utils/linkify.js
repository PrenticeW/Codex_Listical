import React from 'react';

// Matches http(s) URLs and bare www. URLs. Deliberately conservative:
// stops at whitespace and common trailing punctuation.
const URL_REGEX = /((?:https?:\/\/|www\.)[^\s<>"']+)/gi;

// Trailing punctuation that is almost always sentence punctuation, not part
// of the URL (e.g. "see https://foo.com." or "(https://foo.com)").
const TRAILING_PUNCTUATION = /[.,;:!?)\]}'"]+$/;

/**
 * Turn a plain-text string into an array of React nodes where any URL is
 * wrapped in a safe anchor tag. Everything else is emitted as plain text
 * nodes — no HTML in the input is ever interpreted.
 *
 * @param {string} text
 * @returns {React.ReactNode[]} nodes to render in place of the raw string
 */
export function linkifyText(text) {
  if (typeof text !== 'string' || text === '') return [text];

  const nodes = [];
  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    let url = match[0];

    // Strip trailing sentence punctuation off the matched URL.
    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) url = url.slice(0, -trailing[0].length);
    if (!url) continue;

    const start = match.index;
    const end = start + url.length;

    if (start > lastIndex) nodes.push(text.slice(lastIndex, start));

    const href = url.toLowerCase().startsWith('www.') ? `https://${url}` : url;
    nodes.push(
      React.createElement(
        'a',
        {
          key: `link-${start}`,
          href,
          target: '_blank',
          rel: 'noopener noreferrer',
          className: 'underline text-blue-700 hover:text-blue-900',
          // Links live inside clickable cells/rows — don't let a link click
          // trigger cell selection, drag-select, or the detail panel.
          onClick: (e) => e.stopPropagation(),
          onMouseDown: (e) => e.stopPropagation(),
        },
        url
      )
    );

    lastIndex = end;
  }

  if (nodes.length === 0) return [text];
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

/**
 * Split text into segments: [{ text, isUrl }]. Used by editors that paint a
 * styled mirror behind a transparent-text input/textarea so URLs read as
 * links while editing. Segments concatenate back to the exact input string
 * (trailing punctuation after a URL becomes part of the next text segment).
 */
export function linkifySegments(text) {
  if (typeof text !== 'string' || text === '') return [{ text: text ?? '', isUrl: false }];

  const segments = [];
  let lastIndex = 0;
  let match;
  URL_REGEX.lastIndex = 0;

  while ((match = URL_REGEX.exec(text)) !== null) {
    let url = match[0];
    const trailing = url.match(TRAILING_PUNCTUATION);
    if (trailing) url = url.slice(0, -trailing[0].length);
    if (!url) continue;

    const start = match.index;
    if (start > lastIndex) segments.push({ text: text.slice(lastIndex, start), isUrl: false });
    segments.push({ text: url, isUrl: true });
    lastIndex = start + url.length;
  }

  if (lastIndex < text.length) segments.push({ text: text.slice(lastIndex), isUrl: false });
  return segments;
}

/** Style applied to URL segments in edit-mode mirrors. Matches the anchors
 *  rendered by linkifyText (Tailwind text-blue-700 + underline). */
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

/** True if the string contains at least one linkifiable URL. */
export function containsUrl(text) {
  if (typeof text !== 'string') return false;
  URL_REGEX.lastIndex = 0;
  return URL_REGEX.test(text);
}
