/**
 * Integration: on a phone, a table split into cards caps each card's label column at 40%, so a long label wraps and
 * the value keeps the rest of the card (lib/components/comparison/table/table.styles.css; owner, 2026-11-16, "fix
 * all"; fit-everywhere-model.md §25). The label column was `max-content`, and a label as long as "PREFER THIS NATIVE
 * COMPONENT" left the value a sliver whose words ran past the slide (diagram.gallery.md 21). Case, on the real CLI
 * export at square:
 *   CARDS  the table splits into a cover and one card per row, and nothing clips
 *
 * FALSIFIABLE: without the rule the export prints OVERFLOW. Needs Chromium (CHROME_PATH).
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
size: square
---

<!-- _class: table -->

\`The chart handoff\`

## When the shape is quantitative, use a native chart.

These shapes exist as both a Mermaid diagram and a native SVG-kernel component. Prefer the native one — it is themeable through tokens, lighter (no external renderer), and export-clean.

| When you have… | Mermaid would draw | Prefer this native component |
| --- | --- | --- |
| A dated plan or sequence of moments | gantt, timeline, journey | \`gantt\` · \`timeline-list\` · \`roadmap\` · \`journey\` |
| A proportion or a position on axes | pie, quadrant, radar | \`piechart\` · \`quadrant\` · \`radar\` |
| A board or a state machine | kanban, stateDiagram | \`kanban\` · \`state-chart\` |
`;

let dir;
let log;
let html;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'table-card-label-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('CARDS: each row becomes a card whose value fits beside its label, and nothing clips', () => {
  assert.match(html, /class="ct-card-fields"/, 'the table split into cards, or this proves nothing');
  assert.doesNotMatch(log, /OVERFLOW/, log);
});
