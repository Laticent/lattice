/**
 * Integration: a split run's coda and footer (owner, 2026-11-22: "we automatically move coda to their own split page";
 * "footer can be on a coda page"; fit-everywhere-model.md §25). A `compare-code` slide lays its columns out with no
 * `.cell-stage`, and the harvester that finds a run's trailing beats walked back from the section's end, stopped at the
 * slide's own `<footer>` and the berths after it, and never reached the coda cell (lib/core/split-envelope.js
 * `trailingMaterialOf`): a split compare-code dropped its key insight from every page. And a long `_footer:` on the
 * run's cover, beside the page number, ended mid-word. Cases, on the real CLI export at portrait:
 *   INSIGHT  the key insight appears once, on the page that closes the run
 *   FOOTER   the footer line rides that page, whole (it wraps there rather than end in an ellipsis), and the cover
 *            does not show it (lib/core/auto-split.js `applyRails`, base.modifiers.css `lat-split-footer-*`)
 *
 * FALSIFIABLE: without the sibling scan for a stage-less slide the insight is on no page; without the footer move the
 * cover shows the line and the export prints CONTENT CLIPPED. Needs Chromium (CHROME_PATH).
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

<!-- _class: compare-code -->
<!-- _footer: "compare-code · was swallowed into the right-hand column" -->

\`Attachment · selector shape vs. a host\`

## Two code columns, and a band that belongs to neither.

\`Before · the panel had no host\`

\`\`\`css
section:not(.quote):not(.math)
  > blockquote { … }
section:not(.quote):not(.math)
  > .cell-stage > blockquote { … }
\`\`\`

\`After · the panel has a cell\`

\`\`\`css
section .cell-coda
  > blockquote { … }
\`\`\`

> Key insight: this blockquote used to print as unstyled body text inside the right-hand column.
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coda-footer-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => ({ tag: p.openTag, inner: p.inner, text: removeTags(p.inner).replace(/\s+/g, ' ') }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

const INSIGHT = 'this blockquote used to print as unstyled body text';
const FOOTER = 'was swallowed into the right-hand column';

test('the slide splits, and nothing clips', () => {
  assert.ok(pages.length > 1, `${pages.length} pages`);
  assert.doesNotMatch(log, /OVERFLOW|CONTENT CLIPPED/, log);
});

test('INSIGHT: the key insight appears once, on the last page', () => {
  assert.equal(pages.filter((p) => p.text.includes(INSIGHT)).length, 1);
  assert.ok(pages.at(-1).text.includes(INSIGHT), 'the coda closes the run');
});

test('FOOTER: the footer line rides the coda page, and the cover hides it', () => {
  const last = pages.at(-1);
  assert.ok(last.text.includes(FOOTER), 'the coda page carries the footer line');
  assert.match(last.tag, /\blat-split-footer-(here|moved)\b|data-split-role="closing"/);
  const cover = pages.find((p) => /data-split-role="cover"/.test(p.tag));
  assert.match(cover.tag, /\blat-split-footer-moved\b/, 'the cover is marked so its footer line is hidden');
});
