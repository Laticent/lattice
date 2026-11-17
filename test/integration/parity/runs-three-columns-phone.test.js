/**
 * Integration: a three-column `runs` table (a label and two values, a before/after table) whose grid runs past a phone's
 * edge takes the narrowest runs layout, one value column per block under the repeated row labels, and the measured
 * split pages its rows (lib/base/base.table-reflow.css "runs, three columns, forced", lib/core/table-reflow-fit.js
 * `forceOverflowingReflow`, lib/core/fit-measure.js `members` / `natural`; owner, 2026-11-17: "we already defined what
 * happens to tables"; 2026-11-03-responsive-tables.md, fit-everywhere-model.md §25). The rule names one column per block
 * at the narrowest for every runs table, but the measured switch refused three columns and the narrowest step read only
 * the width query, so the grid's third column ran off the slide (per-slide-diagram-band.md 6). A reflowed row has no box
 * (`display: contents`), so the measure also read no members and the split fell back to one row a page. Case, on the
 * real CLI export at square:
 *   RUNS  nothing clips; the table carries the force mark; every row appears once across the body pages, more than one
 *         row on a page, and each body page shows both value columns as blocks (Before, then After)
 *
 *   RANGES a paragraph split at its sentence breaks (its members are text ranges, not elements) exports: the boxless-row
 *          check first read a style from every member and crashed the whole export (state-chart.md 9 at square)
 *
 * FALSIFIABLE: without the forced three-column step (or with the `cols < 4` refusal back) the export prints OVERFLOW;
 * without the measure reading a boxless row the split puts one row on each page; reading a style from a text-range member crashes the export (RANGES). Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const ROWS = ['preview scope', 'preview config', 'PDF-path band', 'reconciliation marker'];
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: content -->

## What the fix actually was: pass the section in.

| | Before | After |
|---|---|---|
| preview scope | \`document.querySelector('section')\` | the section being rendered |
| preview config | once per document | once per band |
| PDF-path band | last \`_class:\` before the fence | the fence's own slide |
| reconciliation marker | \`data-lattice-slide-bake\` | deleted |

\`getComputedStyle(section)\` already returns what that slide's cascade produced. CSS inheritance answers the question offline resolution has to compute, which is why this is a parameter and not a rewrite.

---

<!-- _class: content -->

## Why a native state chart.

Mermaid's \`stateDiagram-v2\` works, but theming it cleanly requires a CSS override cascade with \`!important\` (see \`docs/theming.md\`). The native chart uses palette tokens directly — \`var(--cat-1-fill)\`, \`var(--diagram-stroke)\`, \`var(--diagram-line)\`, \`var(--cat-on-fill)\` — and inherits dark / light, every theme, automatically. No mmdc subprocess, no opaque SVG class names, no version coupling. Composite states are a sub-list; parallel regions, history states and guards are not in the grammar. When you need those, \`<!-- _class: diagram -->\` is the Mermaid escape hatch.
`;

let dir;
let log;
let html;
let body;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'runs-three-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  body = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section' && /data-split-role="body"/.test(p.openTag) && /data-lattice-slide="1\./.test(p.openTag))
    // The table only: the page also names the next page's first row on purpose (the run's relationship signal).
    .map((p) => removeTags(p.inner.slice(p.inner.indexOf('<table'), p.inner.indexOf('</table>') + 8)));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('RUNS: the table takes one column per block and pages its rows, nothing clipped', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  assert.match(html, /--lat-reflow-force:\s*1/, 'the measured switch marked the table');
  for (const r of ROWS) assert.equal(body.filter((t) => t.includes(r)).length, 1, `${r} on exactly one page`);
  assert.ok(body.length < ROWS.length, `${body.length} body pages for ${ROWS.length} rows: one row a page`);
  for (const t of body) assert.ok(t.indexOf('Before') >= 0 && t.indexOf('After') > t.indexOf('Before'), 'Before, then After, on every page');
});
