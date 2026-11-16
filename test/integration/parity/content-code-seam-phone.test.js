/**
 * Integration: a `content` slide whose body is one code block, too tall for a phone page, splits its code between
 * lines as a `code` slide does, and a diff block's +/- marks stay inside its panel (lib/core/auto-split.js,
 * lib/core/split-envelope.js `soleCodeBlock`, lib/core/fit-measure.js `codeOf`, lib/plugins/code/code.styles.css;
 * owner, 2026-11-16, "fix all"; fit-everywhere-model.md §25). As one block the code measured taller than a page that
 * also carries the heading, and on a phone the wrap's `text-indent: -2ch` pushed each mark half out of the panel, so
 * every page the split tried read as clipped (code-plugin.md 4). Case, on the real CLI export at square:
 *   CODE  the export clips nothing; the run is a cover and one or more code pages; every line of the block appears on
 *         exactly one page, and the note under the block is kept
 *
 * FALSIFIABLE: without the content seam the slide stays one page and the export prints OVERFLOW; without the mark's
 * `text-indent: 0` every code page reads as clipped and the slide falls back whole, OVERFLOW again. Needs Chromium.
 */

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { splitSections, removeTags } = require('@laticent/markup');

const ROOT = path.join(__dirname, '..', '..', '..');
const LINES = ['def fetch(url):', 'return requests.get(url)', 'for attempt in range(3):', 'try:', 'timeout=5', 'except Timeout:', 'sleep(2 ** attempt)'];
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
    .map((p) => ({ role: (p.openTag.match(/data-split-role="([a-z]+)"/) || [])[1], text: removeTags(p.inner) }));
});
after(() => {
  if (dir) fs.rmSync(dir, { recursive: true, force: true });
});

test('CODE: the block splits between lines under a cover, every line once, and nothing clips', () => {
  assert.doesNotMatch(log, /OVERFLOW/, log);
  assert.equal(pages[0].role, 'cover', pages.map((p) => p.role).join(' '));
  const body = pages.filter((p) => p.role === 'body');
  assert.ok(body.length >= 1, 'one or more code pages');
  for (const l of LINES) assert.equal(body.filter((p) => p.text.includes(l)).length, 1, `${l} on exactly one page`);
  assert.ok(pages.some((p) => p.text.includes('sets its band')), 'the note is kept');
});
