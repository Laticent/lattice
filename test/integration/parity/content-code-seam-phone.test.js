/**
 * Integration: on a phone, a `content` slide whose body is one code block (lib/core/auto-split.js, lib/core/split-envelope.js
 * `soleCodeBlock`, lib/core/fit-measure.js `codeOf`, lib/plugins/code/code.styles.css; owner, 2026-11-16, "fix all";
 * fit-everywhere-model.md §25). Cases, on the real CLI export at square:
 *   DIFF   a diff block with a note under it (code-plugin.md 4): nothing clips. On a phone the wrap hangs a line with
 *          `text-indent: -2ch`, and each +/- mark, an inline-block, inherited it and sat half outside the panel, so every
 *          page the split tried read as clipped and the slide fell back whole
 *   TALL   a block taller than the room under its heading (deck-class-register.md 7): the heading takes a cover and the
 *          block is cut between lines, every line once; as one block it could not split at all
 *   SHORT  a block that fits under its heading with its note moved off (code-plugin.md 8) stays one block on one page
 *          (a first cut read every overflowing slide's lines and split a four-line block that fit; checker, 2026-11-16)
 *
 * FALSIFIABLE: without the mark's `text-indent: 0` DIFF prints OVERFLOW; without the content seam TALL does; reading the
 * lines of every overflowing slide splits SHORT's block across two pages. Needs Chromium (CHROME_PATH).
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const TALL = ['deck · deck-wide-component [kpi]', 'names a COMPONENT deck-wide', 'It is ignored.', 'fix: Name the layout per slide', 'run with'];
const DECK = `---
marp: true
theme: indaco
size: square
---

## A diff block bands each added and removed line.

\`@code{diff, title=retry.py}\`
\`\`\`python
 def fetch(url):
-    return requests.get(url)
+    for attempt in range(3):
+        try:
+            return requests.get(url, timeout=5)
+        except Timeout:
+            sleep(2 ** attempt)
\`\`\`

Each line's \`+\` or \`-\` sets its band; the rest of the line is colored as Python.

---

\`The refusal is not silent\`

## A refused token is a warning, not a shrug.

\`\`\`text
⚠ deck · deck-wide-component [kpi]
    \`class: kpi\` names a COMPONENT deck-wide — every slide would be a kpi
    slide. It is ignored.
    fix: Name the layout per slide with \`<!-- _class: kpi -->\`, or once for a
         run with \`<!-- class: kpi -->\`.
\`\`\`

---

## Mark a line without dimming the rest.

\`@code{mark=4, wrap, format=off}\`
\`\`\`yaml
service: billing
replicas: 3
image: registry.laticent.dev/billing:2.14.0
command: ["billing", "--listen=0.0.0.0:8080", "--db=postgres://billing@db.internal:5432/billing", "--cache=redis://cache.internal:6379/0"]
\`\`\`

\`mark=\` tints a line and keeps every other line at full strength. \`wrap\` breaks a long line instead of clipping it.
`;

let dir;
let log;
let pages;
before(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'content-code-seam-'));
  const md = path.join(dir, 'deck.md');
  fs.writeFileSync(md, DECK);
  const pdf = path.join(dir, 'deck.pdf');
  const r = spawnSync(process.execPath, [path.join(ROOT, 'lattice.js'), md, pdf, '--keep-html'], { cwd: ROOT, encoding: 'utf8', timeout: 240000 });
  if (r.status !== 0) throw new Error(`export failed: ${r.stderr}`);
  log = `${r.stdout}${r.stderr}`;
  const html = fs.readFileSync(pdf.replace(/\.pdf$/, '.html'), 'utf8');
  pages = splitSections(html.slice(html.indexOf('<section'))).filter((p) => p.type === 'section')
    .map((p) => ({ slide: (p.openTag.match(/data-lattice-slide="(\d+)/) || [])[1], role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1], text: removeTags(p.inner) }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('DIFF: a diff block and its note export with nothing clipped', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  assert.ok(pages.some((p) => p.slide === '1' && p.text.includes('sets its band')), 'the note is kept');
});

test('TALL: a block taller than the room under its heading is cut between lines under a cover, every line once', () => {
  const run = pages.filter((p) => p.slide === '2');
  assert.equal(run[0]?.role, 'cover', run.map((p) => p.role).join(' '));
  const body = run.filter((p) => p.role === 'body');
  for (const l of TALL) assert.equal(body.filter((p) => p.text.includes(l)).length, 1, `${l} on exactly one page`);
});

test('SHORT: a block that fits under its heading stays one block on one page', () => {
  const withCode = pages.filter((p) => p.slide === '3' && p.text.includes('service: billing'));
  assert.equal(withCode.length, 1);
  assert.match(withCode[0].text, /command:/, 'the marked line sits with the rest of its block');
});
