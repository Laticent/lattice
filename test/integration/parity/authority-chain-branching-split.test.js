/**
 * Integration: a branching authority-chain whose branches run past a phone page splits between its branches, the tier
 * label on every page (lib/core/collections.js `firstList`, lib/core/fit-measure.js `members`; owner, 2026-11-16;
 * fit-everywhere-model.md §25).
 *
 * A branching chain writes one tier ("Statute") whose branches are a nested list. The measure found one member and
 * the split found nothing to page, so five branches clipped at the square phone step (authority-chain.gallery.md 3,
 * legal.gallery.md 36, one-reading-size-per-venue.md 9). Case, on the real CLI export:
 *   BRANCHES  the export clips nothing; the run is a cover and two or more pages; every page carries the tier label,
 *             and every branch appears exactly once across the pages, packed by the measure (fewer pages than branches)
 *
 * FALSIFIABLE: without the split's descent (firstList) the slide stays whole and the export prints OVERFLOW; without
 * the measure's (members) it still splits, but one branch a page, the manifest's pacing, instead of the measured pages. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const BRANCHES = ['15 U.S.C. §6501', '16 C.F.R. Part 312', 'FTC Six-Step Compliance Plan', 'In re Epic Games · 2022', 'In re YouTube/Google · 2019'];
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: authority-chain branching -->

## branching forks the chain where authority splits.

1. Statute
   - \`15 U.S.C. §6501\` COPPA, 1998
   - \`16 C.F.R. Part 312\` FTC implementing rule
   - \`FTC Six-Step Compliance Plan\` staff guidance
   - \`In re Epic Games · 2022\` $245M consent order
   - \`In re YouTube/Google · 2019\` $170M consent order
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ac-branching-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => ({ role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1], text: p.inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('BRANCHES: the chain splits between its branches, the tier label on each page, every branch once', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  const body = pages.filter((p) => p.role === 'body');
  assert.ok(pages.some((p) => p.role === 'cover') && body.length >= 2, `a cover and two or more pages: ${pages.map((p) => p.role).join(' ')}`);
  for (const p of body) assert.match(p.text, /Statute/, 'the tier label on every page');
  for (const b of BRANCHES) assert.equal(body.filter((p) => p.text.includes(b)).length, 1, `${b} appears once`);
  // Packed by the measure, not one branch a page (the manifest's perPage, which the split falls back to when the
  // measure sees no members).
  assert.ok(body.length < BRANCHES.length, `${body.length} pages for ${BRANCHES.length} branches: the measure did not pack them`);
});
