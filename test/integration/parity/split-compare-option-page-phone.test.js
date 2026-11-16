/**
 * Integration: on a phone, a split-compare option's own page gives its question banner a compact padding, so a long
 * option fits under it (lib/components/comparison/split-compare/split-compare.styles.css; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25). The banner repeats the cover's question on every option page; at x1.4 its full
 * `--sp-xl` padding pushed a 45-word option 43px past the page (system-design-foundations.md 180). Case, on the real CLI
 * export at square:
 *   OPTIONS  the run is a cover, one page per option and a closing page, and nothing clips; the cover keeps its own
 *            padding (the rule names body pages only)
 *
 * FALSIFIABLE: without the rule the export prints OVERFLOW. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: split-compare -->

\`Decision\`

## Push below the threshold, pull above it, and merge at read.

The two strategies fail at opposite ends of the same graph, so the design uses each one where the other breaks.

- One strategy for everyone
  - Simple to explain, guaranteed to fail at one end. Push drowns on celebrities; pull costs hundreds of reads per page for everyone else.
- Split at the threshold
  - Ordinary posts land in a page that is already built; the celebrities she follows are fetched on demand and merged in, so no writer ever fans out to millions. The read costs one lookup plus the celebrity pulls.

> No tuning survives one writer fanning out to five hundred million. That is what sets the line.
`;

let dir;
let log;
let roles;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'split-compare-phone-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  roles = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1]);
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('OPTIONS: each option takes its own page under the question, and nothing clips', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  assert.deepEqual(roles, ['cover', 'body', 'body', 'closing'], roles.join(' '));
});
