/**
 * Gate: the emulator's "INSIDE THE FIT TOLERANCE" advisory cannot hijack the
 * overflow ratchet's page list.
 *
 * THREE tools harvest pages out of the emulator's output, not one, and they do not
 * agree on strictness. `tools/check-overflow-corpus.js` is line-bounded and
 * case-SENSITIVE; the other two cross newlines and one ignores case entirely:
 *
 *     check-overflow-corpus.js  /OVERFLOW[^\n]*?pages? ([\d,\s]+)/        + CONTENT CLIPPED twin
 *     check-family-tiers.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/
 *     lib/calibrate-core.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i   <- case-insensitive
 *
 * The advisory added for #2252 prints page numbers too, and it creates a buffer shape
 * that did not exist before: an export with an advisory and NO other warning line, where
 * "first match wins" protects nobody. So a reword using the lowercase word "overflow"
 * and "page 3" instead of "p3" — both entirely natural, every other line in that file
 * says "page" — would be harvested by `calibrate-core` as if it were real clipping.
 *
 * THIS TEST READS THE RENDERED LINES, NOT THE SOURCE, and the difference is the whole
 * reason the advisory's text moved into `lib/core/overflow-probe.js`. Two earlier cuts
 * failed here. The first asserted only the two case-SENSITIVE literals, and a HARD RULE
 * #25 checker walked a lowercase reword through it. The second tried to render the
 * emulator's inline template literal by substituting every `${…}` for a digit — but the
 * page marker lives inside a NESTED literal (`${quiet.map((o) => `p${o.slide}…`)}`), so
 * the substitution swallowed the word beside it: `page ${o.slide}` left the guarded
 * string with no "page" followed by a digit while the export printed "page 3". A second
 * checker mutation-proved that, and the fix is to call the real formatter with real
 * data rather than to read a format string at all.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
const CORPUS = fs.readFileSync(path.join(ROOT, 'tools', 'check-overflow-corpus.js'), 'utf8');
const { FRAME_TOLERANCE, NEAR_MISS_FLOOR, formatNearMissAdvisory } = require('../../../lib/core/overflow-probe');

/** The advisory exactly as it reaches the buffer, for both plural shapes. */
const RENDERED = [
  formatNearMissAdvisory([{ slide: 9, px: 5 }]).join('\n'),
  formatNearMissAdvisory([{ slide: 3, px: 4.2 }, { slide: 7, px: 11 }, { slide: 12, px: 8 }]).join('\n'),
];

describe('the near-miss advisory (#2252)', () => {
  test('carries no token any of the three harvesters can key on', () => {
    for (const out of RENDERED) {
      // CASE-INSENSITIVE, because `tools/lib/calibrate-core.js` is. An earlier cut used
      // /OVERFLOW/ and a lowercase reword walked straight through it.
      assert.equal(/overflow/i.test(out), false,
        'the advisory must not print the word "overflow" in ANY case — calibrate-core.js greps /i');
      assert.equal(/content clipped/i.test(out), false,
        'the advisory must not print "content clipped", for the same reason');
      // …and not the page-list SHAPE either. All three harvesters want `page`/`pages`
      // followed by digits; the advisory writes `p3 (4px)` precisely so it cannot match.
      assert.equal(/pages?\s+\d/i.test(out), false,
        'the advisory must not write "page N" — it writes pN, so no harvester can read it');
    }
  });

  test('the rendered advisory is inert against every harvest regex', () => {
    for (const out of RENDERED) {
      for (const re of [
        /OVERFLOW[^\n]*?pages? ([\d,\s]+)/,
        /CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/,
        /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/,
        /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i,
      ]) assert.equal(re.test(out), false, `the advisory matched ${re}:\n${out}`);
    }
  });

  test('it still says the thing it exists to say', () => {
    // The assertions above are all NEGATIVE, so an advisory reworded into silence would
    // pass every one of them. This is the positive half: the slides, their overshoot,
    // the budget they came in under, and the gate that can adjudicate them.
    const out = formatNearMissAdvisory([{ slide: 3, px: 4.2 }, { slide: 7, px: 11 }]).join('\n');
    assert.match(out, /p3 \(4\.2px\), p7 \(11px\)/, 'it must name the slides and their overshoot');
    assert.match(out, new RegExp(`${FRAME_TOLERANCE}px budget`), 'and the budget they came in under');
    assert.match(out, /check:chart-fit/, 'and the gate that measures this band properly');
    // Singular is not a plural with an "s" bolted on — both shapes are written out.
    const one = formatNearMissAdvisory([{ slide: 9, px: 5 }])[0];
    assert.match(one, /1 slide paints past/, `singular reads wrong: ${one}`);
    assert.match(out, /2 slides paint past/, 'plural reads wrong');
  });

  test('the emulator prints the kernel text rather than its own copy', () => {
    // The guards above read `formatNearMissAdvisory`. If the export ever re-inlines the
    // wording, they would police a string nobody prints — the vacuous shape this test
    // has now been caught in twice.
    assert.match(SRC, /for \(const line of formatNearMissAdvisory\(quiet\)\) console\.warn\(line\);/,
      'lattice-emulator.js must print the kernel formatter output');
    assert.equal(/INSIDE THE FIT TOLERANCE/.test(SRC), false,
      'the advisory text must not be re-inlined in lattice-emulator.js');
  });

  test('all three harvesters still key on the literals this guards', () => {
    // If a harvest ever keys on something else, the assertions above guard a literal
    // nobody reads any more — a test that passes for the wrong reason.
    assert.match(CORPUS, /grabPages\(\/OVERFLOW\[\^\\n\]\*\?pages\? \(\[\\d,\\s\]\+\)\/\)/);
    assert.match(CORPUS, /grabPages\(\/CONTENT CLIPPED\[\^\\n\]\*\?pages\? \(\[\\d,\\s\]\+\)\/\)/);
    for (const rel of ['tools/check-family-tiers.js', 'tools/lib/calibrate-core.js']) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      assert.match(src, /OVERFLOW\[\\s\\S\]\*\?pages\?\\s\+\(\[\\d,\\s\]\+\)/,
        `${rel} should still harvest pages the way this test assumes`);
    }
  });

  test('the floor and the tolerance come from the kernel, not from a literal here', () => {
    assert.equal(typeof FRAME_TOLERANCE, 'number');
    assert.equal(typeof NEAR_MISS_FLOOR, 'number');
    assert.ok(NEAR_MISS_FLOOR > 0 && NEAR_MISS_FLOOR < FRAME_TOLERANCE,
      'the advisory band must be a real band — a floor at or above the tolerance reports nothing');
    // HARD RULE #1: one source. A bare `12` back in any of the four places it used to
    // live would re-open the drift this consolidated.
    assert.equal(/const TOL = 12;/.test(SRC), false, 'lattice-emulator.js must read FRAME_TOLERANCE');
    const RUNTIME = fs.readFileSync(path.join(ROOT, 'lib', 'runtime', 'index.js'), 'utf8');
    assert.equal(/const TOL = 12;/.test(RUNTIME), false, 'lib/runtime/index.js must read FRAME_TOLERANCE');
  });
});
