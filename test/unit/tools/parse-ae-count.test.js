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
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

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

  // The half that keeps the fix from being undone one file over. `parseAeCount` being
  // right buys nothing if a call site goes back to reading stderr itself — which is
  // exactly how this bug came to exist in two places at once.
  //
  // This arm is a CENSUS, and both halves of that are deliberate. Its first draft took a
  // hardcoded two-file list and asked only whether `parseAeCount(` appeared ANYWHERE in
  // the file — which the DEFINITION satisfies, so the same bug reintroduced verbatim in
  // `tools/preview.js`'s `diffPages` left the arm green. It guarded the importer and not
  // the definer, and a third call site added anywhere would have been invisible to it.
  // So: walk the tree for the call, and look at the WINDOW after each one.
  await t.test('every `compare -metric AE` call site parses its output through the helper', () => {
    const files = [];
    const walk = (dir) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (/\.(js|mjs|cjs)$/.test(e.name)) files.push(full);
      }
    };
    walk(path.join(ROOT, 'tools'));

    const CALL = /spawnSync\(\s*'compare'[\s\S]{0,200}?'-metric',\s*'AE'/g;
    const sites = [];
    for (const full of files) {
      const src = fs.readFileSync(full, 'utf8');
      for (const m of src.matchAll(CALL)) {
        // The window is what the call site does with the result — long enough to hold a
        // comment plus the parse, short enough not to reach an unrelated one.
        sites.push({ file: path.relative(ROOT, full), window: src.slice(m.index, m.index + 700) });
      }
    }

    assert.ok(
      sites.length >= 2,
      `expected at least the two known \`compare -metric AE\` call sites under tools/, found ${sites.length} — `
        + 'if they moved, this census needs pointing at their new home rather than deleting.',
    );

    for (const { file, window } of sites) {
      assert.match(
        window,
        /parseAeCount\(/,
        `${file}: a \`compare -metric AE\` call does not hand its output to parseAeCount(). `
          + 'A hand-rolled parse here is how a million-pixel page came to read as identical. '
          + '(This checks the code AFTER the call, not the file — the helper\'s own definition '
          + 'must not be what satisfies it.)',
      );
      assert.doesNotMatch(
        window,
        /\.test\([A-Za-z_$][\w$]*\)\s*\?\s*parseInt\(/,
        `${file}: a \`compare -metric AE\` call site parses stderr with a regex-and-parseInt again. `
          + 'That is the exact shape that dropped a scientific-notation count.',
      );
    }
  });

  // The guard that came back with this fix, and the reason it is here: `compare` on
  // differently-sized images diffs only the overlapping top-left region and prints a
  // SMALL count with exit 0, so a page whose geometry changed reads as a trivial diff.
  // `pixelDiff` has guarded that since #1686's follow-on; `diffPages` did not until an
  // independent checker noticed it sitting three lines from the parse this file is about.
  await t.test('a page whose geometry changed is a sentinel, not a small diff', () => {
    const { diffPages } = require('../../../tools/preview');
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ae-resize-'));
    const im = (args) => spawnSync('convert', args, { encoding: 'utf8' });
    if (im(['-size', '400x300', 'xc:white', '-fill', 'black', '-draw', 'rectangle 10,10 100,100',
      path.join(tmp, 'a.png')]).status !== 0) return; // no ImageMagick here — nothing to assert

    im([path.join(tmp, 'a.png'), path.join(tmp, 'a.pdf')]);
    im([path.join(tmp, 'a.png'), '-resize', '800x600', path.join(tmp, 'b.png')]);
    im([path.join(tmp, 'b.png'), path.join(tmp, 'b.pdf')]);

    const r = diffPages(path.join(tmp, 'a.pdf'), path.join(tmp, 'b.pdf'), 'ae-resize-probe');
    assert.equal(r.ok, true);
    assert.equal(r.diffs.length, 1, 'the resized page should be reported');
    assert.equal(
      r.diffs[0].pixels,
      -1,
      'a page whose geometry changed must read as the -1 sentinel. Without the size guard '
        + '`compare` diffs the overlapping corner and reports a small positive count — measured '
        + 'at 924px for this fixture — which reads as a trivial diff instead of a geometry change.',
    );
    assert.match(r.diffs[0].note, /page resized 400x300/);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
