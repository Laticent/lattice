/**
 * Integration: on a phone, a lede longer than its own page continues on the next one at a sentence or paragraph break
 * (lib/core/split-envelope.js `ledeGroups`, lib/core/carousel.js `splitTitleLede`, lib/core/fit-measure.js `n:lede` and
 * `ledeCont`; owner, 2026-11-17, D1 A "continue at a sentence break"; fit-everywhere-model.md §25). The lede-page ruling
 * gave a lede one page, so one longer than a whole phone page clipped on it (cat-ink-tier.md 1, dark-canvas-ownership.md
 * 6). Cases, on the real CLI export at square:
 *   TITLE  a title with two long lede paragraphs: a cover, then the paragraphs over two pages, nothing clipped
 *   TOPIC  a topic fact whose claim and source run past one page: a cover, then the claim and its source over two pages
 *   PANEL  a split panel whose lede (a bare text run, system-design-foundations.md 38) runs past its lede page: the lede
 *          continues at a sentence break, then the points follow
 *   INLINE the PANEL lede opening with inline markup (\`**quantity**\`, \`*distribution*\`): its run starts with a tag, and
 *          the cut read that as a block and dropped the whole lede (final checker, 2026-11-17)
 * Every lede word appears once across the lede pages, in order.
 *
 * FALSIFIABLE: without `ledeCont` (one lede page) the export prints OVERFLOW on both lede pages. Needs Chromium.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
color-mode: dark
size: square
---

<!-- _class: title silent -->

\`Categorical tokens · the third ink tier\`

# The category's hue, as text

The categorical cycle shipped two inks and both of them sit on a chip. Nothing covered the hue used as *text on the slide* — so eight sites across five files painted the raw stroke token instead, and 372 of 1536 theme × mode × slot × surface pairs missed AA, worst 1.28:1. The twelve \`--cat-N-ink\` slots are the one answer, and they are curated per palette rather than mixed at render time.

Rendered in atelier rather than indaco, deliberately: indaco is one of the palettes this change barely moves, and atelier is where \`math.theorem\` measured 3.49:1.

---

<!-- _class: topic fact -->

\`Section 02 · Topic\`

## Topic joins the list

A topic slide paints an inverse panel in every mode, and had never been named in the finish file at all.

\`the print face is in examples/finish-canvas-print-face.md\`

---

<!-- _class: split-panel capstone cat-3 -->

\`Instagram · the antagonist\`

## The antagonist is not scale. It is the shape of the follow graph.

Scale is a quantity, and quantities have a price you can pay. The thing you cannot buy your way out of is a distribution. Follower counts are heavy-tailed: almost everyone has a few hundred, and a handful have hundreds of millions. No single account looks like the average, and the far end sits six orders of magnitude from the middle.

- The number that matters
  - The median account has about 150 followers. The largest has five hundred million.
- One algorithm cannot serve both
  - That gap is why the design ends up with two paths instead of one.
- Hold on to this
  - Every hard decision in Part five is this one fact again.

---

<!-- _class: split-panel capstone cat-3 -->

\`Instagram · the antagonist, marked up\`

## The antagonist is not scale. It is the shape of the follow graph.

Scale is a **quantity**, and quantities have a price you can pay. The thing you cannot buy your way out of is a *distribution*. Follower counts are heavy-tailed: almost everyone has a few hundred, and a handful have hundreds of millions. No single account looks like the average, and the far end sits six orders of magnitude from the middle.

- The number that matters
  - The median account has about 150 followers. The largest has five hundred million.
- One algorithm cannot serve both
  - That gap is why the design ends up with two paths instead of one.
- Hold on to this
  - Every hard decision in Part five is this one fact again.
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lede-continues-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => ({ slide: (p.openTag.match(/data-lattice-slide="(\d+)/) || [])[1], role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1], text: removeTags(p.inner).replace(/\s+/g, ' ') }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const ledePages = (n) => pages.filter((p) => p.slide === n && p.role === 'body');

test('nothing clips', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
});

test('TITLE: the two lede paragraphs continue across two pages after the cover, in order', () => {
  const body = ledePages('1');
  assert.equal(body.length, 2, `${body.length} lede pages`);
  assert.match(body[0].text, /The categorical cycle shipped/);
  assert.match(body[1].text, /Rendered in atelier/);
  assert.doesNotMatch(body[0].text, /Rendered in atelier/);
});

test('TOPIC: the claim and its source continue after the cover, every word once', () => {
  const body = ledePages('2');
  assert.ok(body.length >= 2, `${body.length} lede pages`);
  const all = body.map((p) => p.text).join(' ');
  assert.equal(all.split('had never been named').length - 1, 1);
  assert.equal(all.split('finish-canvas-print-face').length - 1, 1);
  assert.ok(all.indexOf('had never been named') < all.indexOf('finish-canvas-print-face'), 'the claim, then its source');
});

test('PANEL: a split panel lede continues at a sentence break, then the points follow', () => {
  const run = pages.filter((p) => p.slide === '3');
  const ledes = run.filter((p) => p.text.includes('Scale is a quantity') || p.text.includes('Follower counts'));
  assert.ok(ledes.length >= 2, `${ledes.length} lede pages`);
  // The point's body, not its title: the last lede page names the next page's first point on purpose (the run's signal).
  assert.ok(!ledes.some((p) => p.text.includes('median account has about 150')), 'the points follow the lede, not on its pages');
  const all = run.map((p) => p.text).join(' ');
  assert.ok(all.indexOf('distribution.') < all.indexOf('Follower counts'), 'in order');
});

test('INLINE: a split panel lede that carries inline markup keeps every sentence, once, in order', () => {
  const all = pages.filter((p) => p.slide === '4').map((p) => p.text).join(' ');
  const sentences = ['Scale is a quantity', 'The thing you cannot buy', 'Follower counts are heavy-tailed', 'No single account looks like the average'];
  for (const t of sentences) assert.equal(all.split(t).length - 1, 1, `"${t}" appears once`);
  const at = sentences.map((t) => all.indexOf(t));
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'in order');
});
