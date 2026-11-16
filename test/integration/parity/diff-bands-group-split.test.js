/**
 * Integration: a regulatory-update `diff-bands` too tall for a phone page splits between its `###` groups, each heading
 * with its list and each band keeping its color (lib/core/split-envelope.js `headedListGroups` / `withGroupOrdinals`,
 * lib/core/carousel.js `coverPaginateSections`, lib/core/fit-measure.js `members`; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25).
 *
 * `diff-bands` writes a heading per kind of change, each over its own numbered list. The split paged the largest list
 * and repeated every other group on each page, so legal.gallery.md 25 printed Amended and Enforced twice and clipped;
 * with every list one entry long nothing paged at all (regulatory-update.gallery.md 6). Case, on the real CLI export:
 *   GROUPS  the export clips nothing; the run is a cover and two or more pages; every band heading and every entry
 *           appears exactly once, each heading on the page with its first entry; each heading carries its authored
 *           ordinal, so a page that opens on the third band still colors it as the third
 *
 * FALSIFIABLE: without the carousel branch the run repeats Amended and Enforced and the export prints OVERFLOW; without
 * the measure's headed members the plan sizes the Added list and the split falls back to it; without the ordinal stamp
 * the page opening on Amended reads `data-split-nth` nowhere. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const BANDS = [['Added', 'EU AI Act'], ['Amended', 'Texas DPSA'], ['Enforced', 'FTC v. Avast']];
const ENTRIES = ['EU AI Act', 'Colorado AI Act', 'Texas DPSA', 'FTC v. Avast'];
const DECK = `---
marp: true
theme: indaco
size: square
---

<!-- _class: regulatory-update diff-bands -->

## Privacy & AI motion — Q1 2026 by kind of change.

### Added

1. EU AI Act
   - \`Title III · high-risk systems\`
   - First conformity assessment took effect.
2. Colorado AI Act
   - \`SB 24-205\`
   - New developer + deployer duties for consequential-decision systems.

### Amended

1. Texas DPSA
   - \`§541.151\`
   - Opt-out portal mandatory; small-business safe-harbor threshold narrowed.

### Enforced

1. FTC v. Avast
   - \`§5 unfairness\`
   - $16.5M consent order finalized; 20-year compliance program.
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'diff-bands-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    // Less the run's relationship signal (`.lat-split-rel`), which names the next page's first entry on purpose.
    .map((p) => ({ role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1], inner: p.inner }))
    .map((p) => ({ ...p, text: p.inner.replace(/<div class="lat-split-rel"[\s\S]*?<\/div>/g, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ') }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('GROUPS: the bands split between groups, each heading once with its list, each keeping its ordinal', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  const body = pages.filter((p) => p.role === 'body');
  assert.ok(pages.some((p) => p.role === 'cover') && body.length >= 2, `a cover and two or more pages: ${pages.map((p) => p.role).join(' ')}`);
  for (const e of ENTRIES) assert.equal(body.filter((p) => p.text.includes(e)).length, 1, `${e} appears once`);
  BANDS.forEach(([band, first], k) => {
    const heads = body.flatMap((p) => [...p.inner.matchAll(/<h3\b([^>]*)>([^<]*)<\/h3>/g)].filter((m) => m[2].trim() === band).map((m) => ({ p, attrs: m[1] })));
    assert.equal(heads.length, 1, `${band} heads one page`);
    assert.ok(heads[0].p.text.includes(first), `${band} sits on the page with ${first}`);
    assert.match(heads[0].attrs, new RegExp(`data-split-nth="${k + 1}"`), `${band} keeps ordinal ${k + 1}`);
  });
});
