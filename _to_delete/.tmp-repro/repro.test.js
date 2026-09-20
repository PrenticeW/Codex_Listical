import { findLinks, formatMarkdownLink } from '../src/utils/linkify.js';
import { toEditView, applyLinkToView } from '../src/utils/linkEditView.js';
import { test } from 'vitest';
test('repro', () => {
const url='https://google.com/maps/place/ce+la+vi+london';
const glued='Emma Dinner @ Ce La Vi'+url;
const spaced='Emma Dinner @ Ce la vi '+url;
for (const [name, stored] of [['glued',glued],['spaced',spaced]]) {
  const l=findLinks(stored)[0];
  const outA=stored.slice(0,l.start)+formatMarkdownLink('Ce La Vi', l.href)+stored.slice(l.end);
  console.log(name,'A:',outA.slice(0,95));
  const {links}=toEditView(stored); const ex=links[0];
  const outB=applyLinkToView(stored, ex.start, ex.end, 'Ce La Vi', ex.url);
  console.log(name,'B:',outB.slice(0,95));
  for (const [k,o] of [['A',outA],['B',outB]]) console.log(name,k,'reparse:',JSON.stringify(findLinks(o).map(x=>[x.isMarkdown,x.label.slice(0,15)])));
}
});
