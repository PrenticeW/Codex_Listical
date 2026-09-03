import { describe, it, expect } from 'vitest';
import { linkifySegments, containsUrl, findLinks, formatMarkdownLink, linkAtRange } from '../linkify';

describe('markdown links', () => {
  it('finds a [text](url) link with label and href', () => {
    const t = 'see [Weekly planning doc](https://docs.example.com/plan) today';
    const links = findLinks(t);
    expect(links).toHaveLength(1);
    expect(links[0]).toMatchObject({ label: 'Weekly planning doc', href: 'https://docs.example.com/plan', isMarkdown: true });
    expect(t.slice(links[0].start, links[0].end)).toBe('[Weekly planning doc](https://docs.example.com/plan)');
  });

  it('prefixes https for www. links', () => {
    expect(findLinks('[x](www.foo.com)')[0].href).toBe('https://www.foo.com');
  });

  it('keeps bare URLs working alongside markdown links', () => {
    const links = findLinks('[a](https://a.com) and https://b.com.');
    expect(links.map((l) => l.href)).toEqual(['https://a.com', 'https://b.com']);
  });

  it('ignores brackets that are not links', () => {
    expect(containsUrl('[note](see below)')).toBe(false);
    expect(containsUrl('[note](https://x.com)')).toBe(true);
  });

  it('segments concatenate back to the raw text', () => {
    const t = 'pre [a](https://a.com) mid https://b.com end';
    expect(linkifySegments(t).map((s) => s.text).join('')).toBe(t);
    expect(linkifySegments(t).filter((s) => s.isUrl).map((s) => s.text)).toEqual(['[a](https://a.com)', 'https://b.com']);
  });

  it('accepts bare domains and adds https://', () => {
    expect(findLinks('Nurture [F&F](google.com)')[0]).toMatchObject({ label: 'F&F', href: 'https://google.com' });
    expect(findLinks('[x](docs.example.com/plan?a=1)')[0].href).toBe('https://docs.example.com/plan?a=1');
    expect(formatMarkdownLink('F&F', 'google.com')).toBe('[F&F](https://google.com)');
    expect(containsUrl('[v](2.0)')).toBe(false);
  });

  it('formats and falls back to the url as label', () => {
    expect(formatMarkdownLink(' Doc ', ' https://x.com ')).toBe('[Doc](https://x.com)');
    expect(formatMarkdownLink('', 'https://x.com')).toBe('[https://x.com](https://x.com)');
  });

  it('linkAtRange finds the link under the caret', () => {
    const t = 'go [a](https://a.com) now';
    expect(linkAtRange(t, 5, 5)?.label).toBe('a');
    expect(linkAtRange(t, 0, 1)).toBeNull();
  });
});

import { toEditView, fromEditView, applyLinkToView, editViewSegments } from '../linkEditView';

describe('edit view (labels only while editing)', () => {
  const stored = 'Nurture [F&F](https://google.com) weekly';

  it('shows only the label', () => {
    expect(toEditView(stored).text).toBe('Nurture F&F weekly');
    expect(toEditView(stored).links[0]).toMatchObject({ label: 'F&F', url: 'https://google.com', start: 8, end: 11 });
  });

  it('round-trips unchanged text', () => {
    const v = toEditView(stored);
    expect(fromEditView(v.text, v.links)).toBe(stored);
  });

  it('keeps the link when text around it is edited', () => {
    const v = toEditView(stored);
    expect(fromEditView('Nurture F&F every week', v.links)).toBe('Nurture [F&F](https://google.com) every week');
    expect(fromEditView('Call F&F', v.links)).toBe('Call [F&F](https://google.com)');
  });

  it('drops the link when its label is edited away', () => {
    const v = toEditView(stored);
    expect(fromEditView('Nurture FF weekly', v.links)).toBe('Nurture FF weekly');
  });

  it('leaves bare URLs untouched', () => {
    const s = 'see https://a.com now';
    const v = toEditView(s);
    expect(v.text).toBe(s);
    expect(fromEditView(v.text, v.links)).toBe(s);
  });

  it('applies a new link to a selection', () => {
    expect(applyLinkToView('Nurture F&F weekly', 8, 11, 'F&F', 'google.com')).toBe(stored);
  });

  it('re-links an existing link with new text', () => {
    expect(applyLinkToView(stored, 8, 11, 'Friends', 'https://x.com')).toBe('Nurture [Friends](https://x.com) weekly');
  });

  it('removes a link when confirmed with an empty url', () => {
    expect(applyLinkToView(stored, 8, 11, 'F&F', '')).toBe('Nurture F&F weekly');
    expect(applyLinkToView(stored, 8, 11, 'Friends', '')).toBe('Nurture Friends weekly');
  });

  it('segments the view text', () => {
    expect(editViewSegments(stored)).toEqual([
      { text: 'Nurture ', isUrl: false }, { text: 'F&F', isUrl: true }, { text: ' weekly', isUrl: false },
    ]);
  });
});
