/**
 * Integration: on a phone a checklist row's long status pill wraps at 45% of the row instead of squeezing the row's
 * text to one word a line (lib/components/inventory/checklist/checklist.styles.css; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25). The pill never wrapped and the text before it is an anonymous flex item with no floor,
 * so `{"order the cap, rotate it, or say it out loud"}` held its full width and the row ran 1252px tall at x1.4
 * (system-design-foundations.md 199). Cases, on the real CLI export at square:
 *   LONG   the slide exports with nothing clipped
 *   SHORT  a checklist of short pills that fit on one page still fits on one page (a first cut that dropped every pill
 *          under its text split it into three, inline-run-labels.md 3)
 *
 * FALSIFIABLE: without the rule LONG prints OVERFLOW; letting every pill wrap onto its own line splits SHORT.
 * Needs Chromium (CHROME_PATH).
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

<!-- _class: checklist -->

\`Instagram · the invariants\`

## Six sentences have to hold, or the design is not finished.

- [-] A post is visible to every eligible follower who reaches it — except past the pull cap, where ten of your celebrities are dropped on every page. \`{"order the cap, rotate it, or say it out loud"}\`
- [x] Media is never lost once an upload is acknowledged. \`{durable}\`
- [x] A like counts exactly once per reader and post. \`{idempotent}\`
- [x] A feed page never repeats or skips an item. \`{stable cursor + dedupe at merge}\`
- [-] A blocked account is filtered at read — but a signed media URL outlives the check. \`{keep the TTL short}\`
- [x] Every derived store rebuilds from posts and edges. \`{rebuildable}\`

---

<!-- _class: checklist -->

## A status tag stays in the row.

- [x] Signal taxonomy agreed in workshop four of three \`{RATIFIED}\`
- [x] Scoring weights agreed by the steering committee \`{SIGNED}\`
- [-] Pilot teams trained, two still circling back \`{AT RISK}\`
- [ ] Exec sponsor confirmed for the launch comms \`{OPEN}\`
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'checklist-pill-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => (p.openTag.match(/data-lattice-slide="(\d+)/) || [])[1]);
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('LONG: a row with a long pill keeps its text readable, and nothing clips', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
});

test('SHORT: a checklist of short pills that fit stays one page', () => {
  assert.equal(pages.filter((s) => s === '2').length, 1, `slide 2 ran to ${pages.filter((s) => s === '2').length} pages`);
});
