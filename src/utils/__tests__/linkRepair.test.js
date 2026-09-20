import { findLinks } from '../linkify.js';
import { toEditView, applyLinkToView } from '../linkEditView.js';
import { test, expect } from 'vitest';
test('rescues malformed [label](name+url) links', () => {
  const bad = 'Emma Dinner @ [Ce La Vi](Ce la vihttps://google.com/maps/place/ce+la+vi)';
  const links = findLinks(bad);
  expect(links.length).toBe(1);
  expect(links[0].label).toBe('Ce La Vi');
  expect(links[0].href).toBe('https://google.com/maps/place/ce+la+vi');
  // view shows only the label
  expect(toEditView(bad).text).toBe('Emma Dinner @ Ce La Vi');
  // editing the text via the link menu rewrites the whole thing cleanly
  const l = toEditView(bad).links[0];
  const fixed = applyLinkToView(bad, l.start, l.end, 'Ce La Vi dinner', l.url);
  expect(fixed).toBe('Emma Dinner @ [Ce La Vi dinner](https://google.com/maps/place/ce+la+vi)');
  // strict links and non-links unaffected
  expect(findLinks('[a](https://x.io) and [note](see below)').filter(x=>x.isMarkdown).length).toBe(1);
});
