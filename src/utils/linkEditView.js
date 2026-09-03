import React from 'react';
import { findLinks, formatMarkdownLink, URL_SEGMENT_STYLE } from './linkify';

/**
 * Edit view for linked text.
 *
 * Stored text may contain [label](url) links. Users never see that form:
 * while editing, the text box shows only the label ("view" text) and a
 * mirror layer paints the label as a link. These helpers convert between the
 * stored form and the view form, keeping every link whose label still exists
 * in the text after an edit.
 */

/** Stored → { text, links[] } where links carry view-coordinate start/end. */
export function toEditView(stored) {
  const src = typeof stored === 'string' ? stored : '';
  const links = [];
  let out = '';
  let last = 0;
  for (const l of findLinks(src)) {
    out += src.slice(last, l.start);
    const start = out.length;
    out += l.label;
    links.push({ label: l.label, url: l.href, start, end: out.length, isMarkdown: l.isMarkdown });
    last = l.end;
  }
  out += src.slice(last);
  return { text: out, links };
}

/** Index of the occurrence of `needle` in `hay` at/after `from` closest to `hint`. */
function nearestOccurrence(hay, needle, from, hint) {
  let best = -1;
  let idx = hay.indexOf(needle, from);
  while (idx !== -1) {
    if (best === -1 || Math.abs(idx - hint) < Math.abs(best - hint)) best = idx;
    if (idx >= hint) break;
    idx = hay.indexOf(needle, idx + 1);
  }
  return best;
}

/**
 * View text + links → stored text. Links are re-attached to their label in
 * order; a link whose label was edited away is dropped (the words stay).
 * Bare URLs (label === url) are left as they are — linkify picks them up.
 */
export function fromEditView(viewText, links) {
  const text = typeof viewText === 'string' ? viewText : '';
  if (!links?.length) return text;
  let out = '';
  let cursor = 0;
  const ordered = [...links].sort((a, b) => a.start - b.start);
  for (const l of ordered) {
    if (!l.label) continue;
    const idx = nearestOccurrence(text, l.label, cursor, l.start);
    if (idx === -1) continue;
    out += text.slice(cursor, idx);
    out += l.label === l.url && !l.isMarkdown ? l.label : formatMarkdownLink(l.label, l.url);
    cursor = idx + l.label.length;
  }
  return out + text.slice(cursor);
}

/**
 * Replace view range [start,end] with `label` linked to `url`, dropping any
 * existing link that overlaps the range. An empty `url` leaves the words
 * unlinked (used to remove a link). Returns the new stored text.
 */
export function applyLinkToView(stored, start, end, label, url) {
  const { text, links } = toEditView(stored);
  const cleanUrl = (url || '').trim();
  const cleanLabel = (label || '').trim() || cleanUrl;
  const kept = links.filter((l) => l.end <= start || l.start >= end);
  const delta = cleanLabel.length - (end - start);
  const shifted = kept.map((l) => (l.start >= end ? { ...l, start: l.start + delta, end: l.end + delta } : l));
  const nextText = text.slice(0, start) + cleanLabel + text.slice(end);
  if (cleanUrl) shifted.push({ label: cleanLabel, url: cleanUrl, start, end: start + cleanLabel.length, isMarkdown: true });
  return fromEditView(nextText, shifted);
}

/** Segments of the view text: [{ text, isUrl }], concatenating to view text. */
export function editViewSegments(stored) {
  const { text, links } = toEditView(stored);
  if (!links.length) return [{ text, isUrl: false }];
  const segs = [];
  let last = 0;
  for (const l of links) {
    if (l.start > last) segs.push({ text: text.slice(last, l.start), isUrl: false });
    segs.push({ text: text.slice(l.start, l.end), isUrl: true });
    last = l.end;
  }
  if (last < text.length) segs.push({ text: text.slice(last), isUrl: false });
  return segs;
}

/** Mirror-layer render of the view text with link labels styled as links. */
export function renderEditView(stored) {
  return editViewSegments(stored).map((seg, i) =>
    seg.isUrl
      ? React.createElement('span', { key: i, style: URL_SEGMENT_STYLE }, seg.text)
      : React.createElement('span', { key: i }, seg.text)
  );
}
