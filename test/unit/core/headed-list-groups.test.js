/**
 * Unit: `###` groups each over a list split between groups (lib/core/split-envelope.js `headedListGroups` /
 * `withGroupOrdinals`, lib/core/carousel.js `coverPaginateSections`; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25). A regulatory-update `diff-bands` slide, rendered by the real engine:
 *   SHAPE     two or more top-level `h3`s, each followed by a list, is the shape; an `h3` over a paragraph is not
 *   ORDINALS  each top-level `h3` gains `data-split-nth`, 1-based, in order; nothing else changes
 *   SPLIT     on a measured plan the run pages whole groups: no group repeats, the later page opens on its own band
 *   NO-PLAN   without a measured plan the slide is left to today's split (one-entry lists: none)
 *   SCOPE     only the listed cover-paginate layouts take the branch (team-profile sides kept its item cut)
 *   FOLD      a measured fold prints the key insight once (the dispatcher folded it again; checker, 2026-11-16)
 *
 * FALSIFIABLE: without the carousel branch SPLIT pages the first list and repeats the other groups (or declines);
 * without the stamp ORDINALS and SPLIT find no `data-split-nth`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createEngine } = require('../../../lib/engine');
const { splitSections } = require('@laticent/markup');
const { headedListGroups, withGroupOrdinals } = require('../../../lib/core/split-envelope');
const { carouselize } = require('../../../lib/core/carousel');
const { loadAll } = require('../../../lib/components');

const slideOf = (cls, body) => {
  const { html } = createEngine().render(`---\ntheme: indaco\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`, 'indaco');
  return splitSections(html).filter((p) => p.type === 'section')[0];
};
const BANDS = '## What changed.\n\n### Added\n\n1. One\n   - `A 1`\n   - First.\n2. Two\n   - `A 2`\n   - Second.\n\n'
  + '### Amended\n\n1. Three\n   - `B 1`\n   - Third.\n\n### Repealed\n\n1. Four\n   - `C 1`\n   - Fourth.';
const recipe = () => loadAll().find((m) => m.name === 'regulatory-update').split;
const h3s = (html) => [...html.matchAll(/<h3\b([^>]*)>([^<]*)<\/h3>/g)].map((m) => ({ attrs: m[1], text: m[2].trim() }));

test('SHAPE: headings each over a list are groups; a heading over a paragraph is not', () => {
  assert.equal(headedListGroups(slideOf('regulatory-update diff-bands', BANDS).inner), true);
  assert.equal(headedListGroups(slideOf('content', '## T.\n\n### One\n\nA paragraph.\n\n### Two\n\n- a\n- b').inner), false);
  assert.equal(headedListGroups(slideOf('content', '## T.\n\n### One\n\n- a\n- b').inner), false, 'one group is not a run');
});

test('ORDINALS: each top-level heading gains its 1-based ordinal and nothing else changes', () => {
  const { inner } = slideOf('regulatory-update diff-bands', BANDS);
  const out = withGroupOrdinals(inner);
  assert.deepEqual(h3s(out).map((h) => [h.text, (h.attrs.match(/data-split-nth="(\d+)"/) || [])[1]]), [['Added', '1'], ['Amended', '2'], ['Repealed', '3']]);
  assert.equal(out.replace(/ data-split-nth="\d+"/g, ''), inner);
});

test('SPLIT: a measured plan pages whole groups, the later page opening on its own band', () => {
  const s = slideOf('regulatory-update diff-bands', BANDS);
  // Six blocks: h3, ol, h3, ol, h3, ol. Two pages of one group, then two groups.
  const parts = carouselize(s.openTag, s.inner, { ...recipe(), plan: [2, 4] }, 1, 'regulatory-update');
  assert.ok(parts && parts.length === 3, JSON.stringify(parts?.length));
  const [, first, second] = parts;
  assert.deepEqual(h3s(first).map((h) => h.text), ['Added']);
  assert.match(first, /One[\s\S]*Two/);
  assert.doesNotMatch(first, /Three|Four/);
  assert.deepEqual(h3s(second).map((h) => [h.text, (h.attrs.match(/data-split-nth="(\d+)"/) || [])[1]]), [['Amended', '2'], ['Repealed', '3']]);
  assert.doesNotMatch(second.replace(/<div class="lat-split-rel"[\s\S]*?<\/div>/g, ''), />One<|>Two</);
});

test('NO-PLAN: with no measured plan and one-entry lists, nothing splits', () => {
  const s = slideOf('regulatory-update diff-bands', '## T.\n\n### Added\n\n1. One\n   - First.\n\n### Amended\n\n1. Two\n   - Second.');
  assert.equal(carouselize(s.openTag, s.inner, recipe(), 1, 'regulatory-update'), null);
});

test('SCOPE: every layout the measure reads as groups splits with cover-paginate, and no other layout takes the branch', () => {
  const { HEADED_GROUP_LAYOUTS } = require('../../../lib/core/headed-groups');
  const all = loadAll();
  for (const name of HEADED_GROUP_LAYOUTS) assert.equal(all.find((m) => m.name === name)?.split?.strategy, 'cover-paginate', name);
  // The same shape on a layout outside the list keeps today's item cut, which a block plan does not place.
  const s = slideOf('content', '## T.\n\n### One\n\n- a\n- b\n\n### Two\n\n- c\n- d');
  const parts = carouselize(s.openTag, s.inner, { strategy: 'cover-paginate', plan: [2, 2] }, 1, 'content');
  assert.ok(!parts || !parts.some((p) => /data-split-nth/.test(p)), 'no group split outside the list');
});

test('FOLD: a measured fold puts the key insight on the last page once', () => {
  const s = slideOf('regulatory-update diff-bands', `${BANDS}\n\n> The one insight.`);
  const parts = carouselize(s.openTag, s.inner, { ...recipe(), plan: [2, 4], foldCoda: true }, 1, 'regulatory-update');
  assert.ok(parts, 'splits');
  const n = parts.join('').match(/The one insight\./g)?.length || 0;
  assert.equal(n, 1, `the insight prints ${n} times`);
  assert.match(parts[parts.length - 1], /The one insight\./, 'on the last page');
});
