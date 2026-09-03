import { describe, it, expect, beforeAll } from 'vitest';

// Minimal DOMParser stand-in (no jsdom in this repo): finds <a href> tags.
beforeAll(() => {
  globalThis.DOMParser = class {
    parseFromString(html) {
      const re = /<a\b[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi;
      const list = [];
      let m;
      while ((m = re.exec(html)) !== null) {
        const href = m[1]; const text = m[2].replace(/<[^>]+>/g, '');
        list.push({ getAttribute: () => href, textContent: text });
      }
      return { querySelectorAll: () => list };
    }
  };
});
import { extractAnchors, mergeLinksIntoText, getClipboardTextWithLinks } from '../clipboardText';

const cd = (plain, html) => ({ getData: (t) => (t === 'text/html' ? html : plain) });

describe('paste keeps hyperlinks', () => {
  it('extracts http anchors in order', () => {
    const html = '<ul><li><a href="https://a.com/1">One</a></li><li><a href="mailto:x@y">Mail</a></li><li><a href="https://b.com">Two</a></li></ul>';
    expect(extractAnchors(html)).toEqual([
      { text: 'One', href: 'https://a.com/1' },
      { text: 'Two', href: 'https://b.com' },
    ]);
  });

  it('adds each link after its text without touching line structure', () => {
    const plain = 'One\nTwo\nThree';
    const html = '<p><a href="https://a.com/1">One</a></p><p><a href="https://b.com">Two</a></p><p>Three</p>';
    expect(getClipboardTextWithLinks(cd(plain, html))).toBe('One https://a.com/1\nTwo https://b.com\nThree');
  });

  it('leaves a pasted bare URL alone', () => {
    const plain = 'https://a.com/1';
    const html = '<a href="https://a.com/1">https://a.com/1</a>';
    expect(getClipboardTextWithLinks(cd(plain, html))).toBe('https://a.com/1');
  });

  it('handles repeated link text in order', () => {
    const out = mergeLinksIntoText('Doc\nDoc', [
      { text: 'Doc', href: 'https://x.com/a' },
      { text: 'Doc', href: 'https://x.com/b' },
    ]);
    expect(out).toBe('Doc https://x.com/a\nDoc https://x.com/b');
  });

  it('falls back to plain text when there is no html', () => {
    expect(getClipboardTextWithLinks(cd('hi', ''))).toBe('hi');
  });
});
