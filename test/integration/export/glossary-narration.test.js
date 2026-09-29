/**
 * A `glossary: auto` deck narrates the same sentences on the CLI as in the Studio.
 *
 * The render appends a glossary slide the source does not contain. The Studio (Present, the
 * narration bake, the "Captions (.vtt)" download) drops that section through
 * `withoutAutoGlossary` and never narrates it, because Present never shows it; the CLI's
 * `resolveReadAlong` has to leave the same page silent, or `lattice video deck.md` reads four
 * definitions the Studio export of the same deck never says. And the closing line has to be
 * checked against the last AUTHORED slide, as the Studio checks it: compared against the silent
 * glossary page, a deck whose last slide already thanks the room would thank it twice on the CLI
 * alone. engineering/pipeline.md §6.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { ROOT } = require('../../helpers/render');

const DECK = `---
theme: indaco
glossary: auto
closing: true
acronyms:
  ARR: { expansion: annual recurring revenue, definition: "Revenue the business can expect to recur." }
---

# ARR closed the quarter ahead of plan

Annual revenue grew faster than the plan assumed.

---

## Thank you

We welcome your questions now.
`;

test('the glossary page is silent and the closing is not said twice', { timeout: 900000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-gloss-narr-'));
  try {
    const src = path.join(dir, 'deck.md');
    fs.writeFileSync(src, DECK);
    const out = path.join(dir, 'deck.html');
    const res = spawnSync('node', [path.join(ROOT, 'lattice-emulator.js'), src, out, '--captions', '-q'], {
      cwd: ROOT, encoding: 'utf8', timeout: 900000,
    });
    assert.equal(res.status, 0, `render failed:\n${res.stderr}`);
    const html = fs.readFileSync(out, 'utf8');
    assert.equal((html.match(/<section\b[^>]*data-lattice-slide/g) || []).length, 3, 'the glossary slide was rendered');
    const parts = fs.readdirSync(dir).filter((f) => /^deck\.\d+\.vtt$/.test(f)).sort();
    assert.deepEqual(parts, ['deck.01.vtt', 'deck.02.vtt'], 'the two authored slides are captioned, the glossary is not');
    const vtt = fs.readFileSync(path.join(dir, 'deck.vtt'), 'utf8').replace(/<\d{2}:\d{2}:\d{2}\.\d{3}>/g, ''); // WebVTT word timestamps
    assert.doesNotMatch(vtt, /recur\./, 'no glossary definition is narrated');
    // The last authored slide thanks the room, so `closing: true` ("Thank you.") is dropped.
    assert.equal((vtt.match(/Thank you/g) || []).length, 1, `the thanks is said once:\n${vtt}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
