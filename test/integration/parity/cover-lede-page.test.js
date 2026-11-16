/**
 * Integration: a split cover too full for its lede gives the lede a page of its own, on the real CLI export
 * (lib/core/split-envelope.js `ledeOwnPage`, lib/core/fit-measure.js `measuredSplit`; owner, 2026-11-16:
 * "lede page, all"; fit-everywhere-model.md §25).
 *
 * examples/universal-table.md slide 9 at the square phone default: a table whose cover holds a display title and
 * a three-line lede. The cover ran 120px past the frame. The measured loop saw it and marked the slide `ledePage`,
 * but the table's cover builder ignored the mark, and the fold pass that runs after the loop rebuilt the plan entry
 * without it anyway. Case:
 *   LEDE   the export clips nothing; the run has a `lat-split-lede` page right after its cover, holding the lede;
 *          the cover keeps its title and no lede
 *
 * FALSIFIABLE: without `ledeOwnPage` in carouselize, or with the fold rebuilding the entry bare, the export prints
 * OVERFLOW and no lede page exists. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
paginate: true
size: square
---

<!-- _class: table -->

\`Riding it\`

## The \`table\` component IS this treatment

\`table\` styles no \`<table>\` element of its own — it rides the rules above and adds
what only a manifest can declare: a row capacity, autosplit, the portrait card
reshape, and the focus axes. That is why the switches reach it.

| Dimension | Owned engine | Marp |
| --- | --- | --- |
| Layout source | lattice.css | marp-core |
| Overflow | Fit Spine | none |
| Themes | 32 | 3 |

*Same rules as the un-classed slide above — plus a contract.*
`;

let dir;
let log;
let sections;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-lede-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  sections = [...html.matchAll(/<section\b[^>]*\bdata-split-role="([a-z]+)"[^>]*\bclass="([^"]*)"[^>]*>([\s\S]*?)<\/section>/g)]
    .map((m) => ({ role: m[1], cls: m[2], body: m[3] }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('LEDE: the cover keeps its title, the lede takes the next page, and the export clips nothing', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  const at = sections.findIndex((s) => s.role === 'cover');
  assert.ok(at >= 0, 'the slide splits');
  const [cover, next] = [sections[at], sections[at + 1]];
  assert.match(cover.body, /split-feat-h/);
  assert.doesNotMatch(cover.body, /split-feat-lede/, 'the cover keeps no lede');
  assert.ok(next && /\blat-split-lede\b/.test(next.cls), `the page after the cover is the lede page: ${next?.cls}`);
  assert.match(next.body, /rides the rules above/);
});
