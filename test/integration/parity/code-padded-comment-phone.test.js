/**
 * Integration: on a phone, a `code` slide whose lines pad out to an end-of-line comment, with a key insight under it
 * (one-reading-size-per-venue.md 7 at portrait; fit-everywhere-model.md §25). Its code fits a page once the insight
 * moves, but the slide came back whole and ran past the frame, because the measured split's readable rule
 * (lib/core/fit-measure.js `fitVerdict` `readable`) read the spaces after `FS_BODY;` as text cut off at the code box's
 * right edge: every page the split built for it failed, and the loop gave up. The rule now measures a text run's ink,
 * not its padding. Its cover also read "1 parts": the code layout's `{n} parts` intro (split-envelope.js `introOf`)
 * applies only from two parts up. Cases, on the real CLI export at portrait:
 *   FITS   nothing clips, and every code line and the insight appear once
 *   COVER  the cover carries the title alone, with no "1 parts"
 *   NOTE   a heading-less code slide with a note under it (finish-override.md 5): its lines fit one page once the note
 *          moves, but `code-cards` refused a one-page plan with no cover, and the dispatcher closed only runs of two or
 *          more, so the slide stayed whole with its code box cut. The block now keeps a page and the note closes the run
 *
 * FALSIFIABLE: measuring the whole text node (padding included) prints OVERFLOW; the count template without its
 * two-part floor prints "1 parts"; refusing the one-page
 * plan (or not closing a one-page run) leaves NOTE whole and clipped. Needs Chromium (CHROME_PATH).
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
paginate: true
size: portrait
---

<!-- _class: code -->

\`code · stays at 13.5pt\`

## Code keeps one step down, because it cannot wrap.

\`\`\`js
// A code line that wraps changes what it says, so code keeps
// its column budget: about 102 columns at laptop.
const reading = venueScale * FS_BODY;         // 16pt at laptop
const code = venueScale * FS_BODY_COMPACT;    // 13.5pt at laptop
\`\`\`

> Code is the one reading exception, by the owner's ruling.

---

<!-- _class: code -->

\`One map overrides any baked layer\`

\`\`\`yaml
finish: finish-recede
finish-override:
  backdrop:
    strength: 0.4       # dim the whole finish
    clearance: off      # or turn the baked clearance off…
    spotlight: 74 34 40 # …and reveal one window instead (x y radius)
  texture:
    intensity: 4        # any layer is overridable
\`\`\`

The Fabricate designer bakes the backdrop into the finish; \`finish-override:\` deep-merges over it and regenerates the finish CSS — in the Studio preview and every export.
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'code-padded-'));
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

test('FITS: nothing clips, and every code line and the insight appear once', () => {
  assert.doesNotMatch(log, /OVERFLOW|CONTENT CLIPPED/, log);
  const all = pages.map((p) => p.text).join(' ');
  for (const t of ['its column budget', 'FS_BODY;', 'FS_BODY_COMPACT;', 'Code is the one reading exception']) {
    assert.equal(all.split(t).length - 1, 1, `"${t}" appears once`);
  }
});

test('COVER: a one-part run\'s cover carries the title alone', () => {
  const cover = pages.find((p) => p.slide === '1' && p.role === 'cover');
  assert.ok(cover, 'the slide splits behind a cover');
  // Tags drop with no space, so the page number runs on: "wrap.1 parts1".
  assert.doesNotMatch(cover.text, /(^|\D)1 parts/);
});

test('NOTE: a heading-less code slide keeps its block on one page and its note on the closing page', () => {
  const run = pages.filter((p) => p.slide === '2');
  assert.deepEqual(run.map((p) => p.role), ['body', 'closing']);
  assert.match(run[0].text, /any layer is overridable/);
  assert.doesNotMatch(run[0].text, /Fabricate designer/);
  assert.match(run[1].text, /Fabricate designer/);
});
