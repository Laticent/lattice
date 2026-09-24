/**
 * structural-split.js — the preprocessor the CLI export and the browser preview share.
 *
 * The contract that matters is PARITY: the Playground runs this on the browser engine's render and
 * must cut a deck into the same pages the CLI export does. The engine is the same module in both
 * places, so rendering here and splitting is the browser path, run in Node.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ss = require('../../../lib/core/structural-split');
const { loadAll } = require('../../../lib/components');
const { createEngine } = require('../../../lib/engine');

const CAPACITY = ss.splitCapacityFrom(loadAll(path.join(__dirname, '..', '..', '..', 'lib', 'components')));
const engine = createEngine();

const DECK = (size) => `---
theme: indaco
${size ? `size: ${size}\n` : ''}---

<!-- _class: title -->

# A deck

---

<!-- _class: inventory -->

\`Eyebrow\`

## Four parts.

- **One.** First body.
- **Two.** Second body.
- **Three.** Third body.
- **Four.** Fourth body.

> The insight.
`;

const slideNumbers = (html) => ss.splitTopLevelSections(html).map((s) => (s.match(/data-lattice-slide="([^"]+)"/) || [])[1]);

test('stampSlideNumbers numbers each top-level section once and is idempotent', () => {
  const html = '<article class="lattice"><section a><section nested></section></section><section b></section></article>';
  const once = ss.stampSlideNumbers(html);
  assert.deepEqual(slideNumbers(once), ['1', '2']);
  assert.match(once, /<section nested>/, 'a nested section is not a slide and is not stamped');
  assert.equal(ss.stampSlideNumbers(once), once, 'a second pass changes nothing');
});

test('stampSlideNumbers takes a starting number for one slide of a deck', () => {
  const one = '<article class="lattice"><section a></section></article>';
  assert.deepEqual(slideNumbers(ss.stampSlideNumbers(one, 4)), ['4']);
});

test('splitApplies splits every family but wide, and a degenerate box never splits', () => {
  assert.equal(ss.splitApplies(1280, 720), false, 'hd is wide');
  assert.equal(ss.splitApplies(1080, 1350), true, 'portrait is tall');
  assert.equal(ss.splitApplies(1080, 1080), true, 'square');
  // familyFor(NaN) returns 'strip', which WOULD split: the finite guard is what keeps a box with
  // no dimensions on the 16:9 fallback.
  assert.equal(ss.splitApplies(undefined, undefined), false);
  assert.equal(ss.splitApplies(1080, 0), false);
});

test('splitCapacityFrom keeps every field the kernel reads, and only components that can split', () => {
  const map = ss.splitCapacityFrom([
    { name: 'a', capacity: { axis: 'item', hard: 6, sweet: 4, soft: 5, perPage: 1, relationship: 'sequence' } },
    { name: 'b', adapt: { capacity: { axis: 'row' } } },
    { name: 'c', split: { strategy: 'cover-cards' } },
    { name: 'd' },
  ]);
  assert.deepEqual(Object.keys(map).sort(), ['a', 'b', 'c']);
  assert.deepEqual(map.a, { axis: 'item', hard: 6, sweet: 4, soft: 5, perPage: 1, relationship: 'sequence', split: null });
  assert.equal(map.b.axis, 'row');
  assert.deepEqual(map.c.split, { strategy: 'cover-cards' });
});

test('a landscape deck passes through unsplit (only the slide stamp is added)', () => {
  const out = engine.render(DECK(''), 'indaco', { preview: true });
  const r = ss.structuralSplit(out.html, { deckSource: DECK(''), width: out.width, height: out.height, capacity: CAPACITY });
  assert.equal(r.changed, 0);
  assert.equal(r.applies, false, 'a wide box can never split, which a live host needs to know');
  assert.equal(r.html, ss.stampSlideNumbers(out.html));
});

test('a portrait deck splits on structure: cover, one row per page, the run numbered 2 · 2.2 …', () => {
  const md = DECK('portrait');
  const out = engine.render(md, 'indaco', { preview: true });
  const r = ss.structuralSplit(out.html, { deckSource: md, width: out.width, height: out.height, capacity: CAPACITY });
  assert.equal(r.changed, 1, 'the inventory slide splits; the title slide does not');
  assert.equal(r.applies, true);
  const nums = slideNumbers(r.html);
  assert.equal(nums[0], '1');
  assert.equal(nums[1], '2', 'the run opens on its cover, which keeps the authored number');
  assert.ok(nums.length >= 6, `cover + four rows at least, got ${nums.join(',')}`);
  assert.ok(nums.slice(2).every((n) => /^2\.\d+$/.test(n)), `continuation pages are numbered 2.k, got ${nums.join(',')}`);
  // The run-level adornments (railRun): every page but the last points at the next one. A
  // preprocessor that split but skipped them would pass every assertion above; this is the arm
  // that catches it (mutation-checked: returning the bare split fails here).
  const run = ss.splitTopLevelSections(r.html).slice(1);
  const body = run.filter((p) => /data-split-role="body"/.test(p));
  assert.equal(body.length, 4, 'one body page per row');
  assert.ok(body.slice(0, -1).every((p) => p.includes('lat-split-rel')), 'every body page but the last points at the next row');
  assert.ok(!body[body.length - 1].includes('lat-split-rel'), 'the last body page has nothing to point at');
  assert.ok(run.every((p) => /lat-rail|split-rail/.test(p)), 'every page of the run carries the k-of-N rail');
});

test('without a capacity map the split is a no-op, not a crash (an unbundled import)', () => {
  const md = DECK('portrait');
  const out = engine.render(md, 'indaco', { preview: true });
  assert.equal(ss.structuralSplit(out.html, { deckSource: md, width: out.width, height: out.height, capacity: null }).changed, 0);
});

test('a `<section` quoted in a comment, a <style> or an attribute is text, not a slide (#2329)', () => {
  const html = '<article class="lattice"><!-- <section> --><section a><style>/* <section> */</style><p title="<section>">x</p></section><section b></section></article>';
  assert.deepEqual(slideNumbers(ss.stampSlideNumbers(html)), ['1', '2']);
  assert.equal(ss.splitTopLevelSections(html).length, 2);
});
