/**
 * `parseAeCount` — reading ImageMagick's changed-pixel count without losing the
 * worst pages.
 *
 * `compare -metric AE` prints the count to stderr, and past 1,000,000 it prints it
 * in SCIENTIFIC NOTATION: `1.15966e+06`. Both copies of this parse tested
 * `/^\d+$/` and fell back to **0** — so a page differing by more than a million
 * pixels was recorded as IDENTICAL by the three tools whose whole job is to answer
 * "what changed": `tools/golden-diff.mjs` (the reviewer's before/after),
 * `tools/regression-gate.mjs` (described in its own header as the authoritative
 * freshness gate) and `tools/preview.js`.
 *
 * The direction of the bug is what makes it worth a test file: the WORSE the drift,
 * the more likely it vanished. Measured on `examples/gallery-jargon.pdf` against its
 * stale committed golden, at the 72dpi these tools rasterize at — page 12 (976,578
 * px) was reported and page 17 (1,159,660 px, a quarter of the page) was not.
 *
 * An unreadable count is now `-1`, the same "cannot tell" sentinel the page-add and
 * page-resize guards use, which every caller already treats as CHANGED. Silence from
 * `compare` is not evidence of sameness.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { parseAeCount } = require('../../../tools/preview');

const ROOT = path.join(__dirname, '..', '..', '..');

test('parseAeCount', async (t) => {
  await t.test('identical images report zero', () => {
    assert.equal(parseAeCount('0'), 0);
    assert.equal(parseAeCount('0\n'), 0);
  });

  await t.test('a plain integer count reads back exactly', () => {
    assert.equal(parseAeCount('976578'), 976578);
    assert.equal(parseAeCount('  976578  '), 976578);
  });

  // THE BUG. Everything else here is scaffolding around this one assertion.
  await t.test('a count past a million arrives in scientific notation and still counts', () => {
    assert.equal(parseAeCount('1.15966e+06'), 1159660);
    assert.equal(parseAeCount('2e+06'), 2000000);
    assert.ok(parseAeCount('1.15966e+06') > 0, 'a 1.16M-pixel page must not read as identical');
  });

  await t.test('a trailing normalized figure does not defeat the parse', () => {
    // Some builds print `<count> (<normalized>)`; the count is the first token.
    assert.equal(parseAeCount('1.15966e+06 (0.248555)'), 1159660);
  });

  await t.test('an unreadable count is -1, never 0', () => {
    // -1 is the sentinel every caller treats as CHANGED. Returning 0 here is what
    // turned a broken `compare` into a silent pass.
    for (const bad of ['', '   ', 'abc', 'compare: unable to open image', '-3', undefined, null]) {
      assert.equal(parseAeCount(bad), -1, `${JSON.stringify(bad)} should not read as a pixel count`);
    }
  });

  // The half that keeps the fix from being undone one file over. `parseAeCount`
  // being right buys nothing if a call site goes back to reading stderr itself —
  // which is exactly how this bug came to exist in two places at once.
  await t.test('every `compare -metric AE` call site parses through the helper', () => {
    const sites = ['tools/pixel-check.js', 'tools/preview.js'];
    let checked = 0;
    for (const file of sites) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      assert.match(
        src,
        /'-metric', 'AE'/,
        `${file}: no \`compare -metric AE\` call found — did it move? Point this test at it.`,
      );
      assert.match(
        src,
        /parseAeCount\(/,
        `${file} runs \`compare -metric AE\` but does not parse its output with parseAeCount(). `
          + 'A hand-rolled parse here is how a million-pixel page came to read as identical.',
      );
      assert.doesNotMatch(
        src,
        /\/\^\\d\+\$\/\.test\(raw\)/,
        `${file} still carries the \`/^\\d+$/\` guard that drops a scientific-notation count.`,
      );
      checked += 1;
    }
    assert.equal(checked, sites.length);
  });
});
