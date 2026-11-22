/**
 * Integration: what moves with a split run's coda, and what stays (red team, 2026-11-22, on the owner rulings of the
 * same day: "we automatically move coda to their own split page"; "footer can be on a coda page"). On the real CLI
 * export at portrait:
 *   NOPAG    with `paginate: false` a split run's pages carry no footer cell, so the footer line cannot arrive on the
 *            coda page; the cover keeps it (it used to be hidden on the cover and shown nowhere)
 *   CHART    a chart whose key insight takes its own closing page (no composed cover: the slide itself is page 1)
 *            moves its footer line there too, where a chart keeps its footer on a phone (`with-footer`), and the
 *            export no longer clips page 1 on the long line
 *   CAPTION  the chart's own caption (`.chart-caption`) stays on the chart's page; only the key insight moves
 *
 * FALSIFIABLE: lib/core/auto-split.js `applyRails` marked a cover only when its first page was a composed cover and
 * hid the footer whether or not the line arrived; lib/core/split-envelope.js `trailingSpansIn` took the chart's
 * caption for a note beat. Needs Chromium (CHROME_PATH).
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');

const NOPAG = `---
theme: indaco
paginate: false
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

const CHART = `---
theme: indaco
paginate: true
size: portrait
---

<!-- _class: bar -->
<!-- _footer: "Source: internal ticket system, FY26 Q3, all regions combined and deduplicated" -->

## Support load sits with two teams.

- Platform \`412\`
- Billing \`388\`
- Mobile \`96\`
- Web \`71\`

Caption: tickets opened between July and September, all regions.

> Two teams take four tickets in five.
`;

let dir;
const out = {};
function exportDeck(name, md) {
  const file = path.join(dir, `${name}.md`);
  fs.writeFileSync(file, md);
  const pdf = path.join(dir, `${name}.pdf`);
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), file, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  return {
    log: `${r.stdout}${r.stderr}`,
    pages: splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
      .map((p) => ({ tag: p.openTag, inner: p.inner, text: removeTags(p.inner).replace(/\s+/g, ' ') })),
  };
}
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'coda-move-'));
  out.nopag = exportDeck('nopag', NOPAG);
  out.chart = exportDeck('chart', CHART);
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('NOPAG: with no footer cell to arrive in, the cover keeps its footer line', () => {
  const { pages } = out.nopag;
  assert.ok(pages.length > 1, `${pages.length} pages`);
  const cover = pages.find((p) => /data-split-role="cover"/.test(p.tag));
  assert.ok(cover, 'the slide has a composed cover');
  assert.doesNotMatch(cover.tag, /\blat-split-footer-moved\b/, 'the cover is not marked: its footer line stays shown');
  assert.ok(cover.inner.includes('was swallowed into the right-hand column'), 'the cover still holds the line');
});

test('CHART: the footer line rides the closing page, shown there as on the chart, and page 1 no longer clips', () => {
  const { pages, log } = out.chart;
  assert.equal(pages.length, 2, `${pages.length} pages`);
  const [first, closing] = pages;
  assert.match(first.tag, /\blat-split-footer-moved\b/, 'the chart page is marked so its footer line is hidden');
  assert.match(closing.tag, /data-split-role="closing"/);
  assert.match(closing.tag, /\blat-split-footer-here\b/);
  assert.match(closing.tag, /\bwith-footer\b/, 'a chart keeps its footer on a phone, so its closing page does');
  assert.ok(closing.text.includes('all regions combined and deduplicated'), 'the closing page carries the footer line');
  assert.doesNotMatch(log, /CONTENT CLIPPED|OVERFLOW/, log);
});

test('CAPTION: the chart\'s own caption stays on the chart\'s page; only the key insight moves', () => {
  const [first, closing] = out.chart.pages;
  assert.ok(first.text.includes('tickets opened between July and September'), 'the caption is on the chart page');
  assert.ok(!closing.text.includes('tickets opened between July and September'), 'the caption is not on the closing page');
  assert.ok(closing.text.includes('Two teams take four tickets in five'), 'the key insight is on the closing page');
  assert.ok(!first.text.includes('Two teams take four tickets in five'), 'and only there');
});
