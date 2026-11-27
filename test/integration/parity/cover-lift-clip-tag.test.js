/**
 * Integration: a split cover whose lede moves to the next page loses its "Content clipped" tag in the PDF
 * (lattice.js `equalizeCardTagsInPage`; lib/core/cover-lift.js; fit-everywhere-model.md §25).
 *
 * The in-page overflow watcher stamps the tag, and re-checks only on `resize`. The cover lift runs after it, so a
 * cover that ran into its footer, moved its lede to page one of the run and then fit, still printed "Content
 * clipped" (examples/team-profile.md slide 2 at square). Now the export asks the watcher to look again whenever
 * a pass moved something. Case, on the real PDF's text:
 *   LIFTED  the cover page carries the heading, not the lede and not the tag; the lede opens the next page
 *
 * FALSIFIABLE: without the re-check, the cover page's text ends "Content clipped". Needs Chromium (CHROME_PATH)
 * and pdftotext.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync, execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: content -->

## Five shapes, because the people slide is never the same slide twice.

A roster of six with a line each is a different picture from a roster of eighteen, and both are different from one leader with four reports. \`team-profile\` writes them all from the same three lines of Markdown.

- The default tiles portrait cards three up — a face, a name, a role, one line on what they own.
- \`lead\` hands the first person a hero row and ranks the rest beneath a rule; \`bio\` turns the grid on its side, giving each leader's line a row of its own.
- \`bench\` packs the long roster six up, and \`sides\` faces two labeled teams across the table.
`;

let dir;
const pages = [];
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cover-lift-tag-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '-q'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  pages.push(...text.split('\f').map((t) => t.replace(/\s+/g, ' ').trim()));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('LIFTED: the cover keeps its heading, gives up its lede, and carries no clip tag', () => {
  const cover = pages[0];
  assert.match(cover, /Five shapes, because the people slide/, 'the cover page must be the split cover, or this proves nothing');
  assert.doesNotMatch(cover, /A roster of six/, 'the lede must have moved off the cover, or nothing was lifted');
  assert.doesNotMatch(cover, /Content clipped/, `the lifted cover still prints the clip tag: ${cover}`);
  assert.match(pages[1], /^A roster of six/, 'the lede opens the next page');
});
