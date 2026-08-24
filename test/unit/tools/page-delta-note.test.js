/**
 * `pageDeltaNote` — which side of a page-count change a page fell on.
 *
 * This existed as an INVERTED ternary, duplicated in tools/pixel-check.js and
 * tools/preview.js, until #1686's follow-on. Investigating
 * examples/portrait-roadmap — whose fresh render was then 5 pages against an
 * 8-page committed golden — the regression gate's report labeled the three
 * DROPPED pages `"new page added"` — the exact opposite of what happened, and
 * the wrong steer for the one question the gate exists to answer: did this
 * render lose content? (That deck's golden was re-blessed to 5 pages in #1827,
 * so it no longer shows the delta; the bug and this test outlive the example.)
 *
 * A label that lies about direction is worse than no label, because it is
 * believed. These assertions are the direction, pinned.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { pageDeltaNote } = require('../../../tools/preview');

const ROOT = path.join(__dirname, '..', '..', '..');

test('pageDeltaNote', async (t) => {
  await t.test('a page only the BASELINE has was removed by the render', () => {
    assert.equal(pageDeltaNote('/tmp/old-6.png', null), 'page removed');
  });

  await t.test('a page only the FRESH render has was added by it', () => {
    assert.equal(pageDeltaNote(null, '/tmp/new-6.png'), 'new page added');
  });

  // The half of the bug this file did NOT pin at first. `pageDeltaNote` being
  // right is worth nothing if a caller hands it the two PDFs the other way
  // round — the label would lie again with every assertion above still green,
  // which is exactly the original defect one level up. An independent review
  // caught that gap; these are the call sites, asserted from the source.
  //
  // Reviewed with `git log -p` if this ever fails: the fix is almost certainly
  // to the CALLER, not to this test. Baseline/golden always goes FIRST.
  await t.test('every call site passes the baseline first', () => {
    const sites = [
      { file: 'tools/regression-gate.mjs', fn: 'pixelDiff' },
      { file: 'tools/golden-diff.mjs', fn: 'pixelDiff' },
      { file: 'tools/pixel-check.js', fn: 'pixelDiff' },
      { file: 'tools/preview.js', fn: 'diffPages' },
    ];
    const baselineFirst = /^(golden|base|baseline|base0|committed|old)/i;
    let checked = 0;
    for (const { file, fn } of sites) {
      const src = fs.readFileSync(path.join(ROOT, file), 'utf8');
      const calls = [...src.matchAll(new RegExp(`\\b${fn}\\(([^,)]+),`, 'g'))];
      assert.ok(calls.length > 0, `no ${fn}( call found in ${file} — did it move?`);
      for (const m of calls) {
        const firstArg = m[1].trim();
        assert.match(
          firstArg,
          baselineFirst,
          `${file}: ${fn}()'s first argument is "${firstArg}", which does not read ` +
            'as the baseline. The baseline/golden PDF must be the FIRST argument — ' +
            'swapping them inverts every "page removed" / "new page added" label.',
        );
        checked++;
      }
    }
    // A loop that silently checked nothing would pass. It must not.
    assert.ok(checked >= sites.length, `expected >= ${sites.length} calls, checked ${checked}`);
  });

  await t.test('a page BOTH sides have is not a page-count delta at all', () => {
    // The callers only reach this helper when one side is missing, but a null
    // return is what keeps "present on both" from silently reading as a delta
    // if a future caller stops pre-checking.
    assert.equal(pageDeltaNote('/tmp/old-1.png', '/tmp/new-1.png'), null);
  });

  await t.test('neither side present is not a delta either', () => {
    assert.equal(pageDeltaNote(null, null), null);
  });
});
