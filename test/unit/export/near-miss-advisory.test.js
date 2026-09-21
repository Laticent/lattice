/**
 * Gate: the "INSIDE THE FIT TOLERANCE" advisory cannot hijack the overflow ratchet's
 * page list.
 *
 * THREE tools harvest pages out of the export's buffer and they disagree on strictness
 * — one is line-bounded and case-sensitive, two cross newlines, one ignores case:
 *
 *     check-overflow-corpus.js  /OVERFLOW[^\n]*?pages? ([\d,\s]+)/  + a CONTENT CLIPPED twin
 *     check-family-tiers.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/
 *     lib/calibrate-core.js     /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i
 *
 * The advisory prints page numbers, so a reword to a lowercase "overflow" or to
 * "page 3" instead of "p3" would be harvested as real clipping.
 *
 * THIS FILE READS THE FORMATTER'S RETURN VALUE, which is why the text lives in
 * `lib/core/overflow-probe.js`: a guard on a format string cannot see what the string
 * renders to, and two earlier cuts of this test were walked through on exactly that.
 *
 * ITS SCOPE ENDS AT THE FORMATTER. Arm 5 counts `console.warn(` inside the advisory
 * block by text, so it does not see an alternate call spelling or a call one line past
 * the block's brace. `test/integration/export/near-miss-advisory-buffer.test.js` is the
 * guard that covers those: it renders a real export and runs all four harvest regexes
 * over the actual stream. Do not delete it as a duplicate of this one.
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

  test('and prints NOTHING ELSE from that block', () => {
    // THE COVERAGE THIS TEST LOST WHEN IT MOVED TO THE KERNEL, restored. The previous
    // cut scoped itself to the whole `if (nearMiss.length)` block and joined every
    // `console.warn` in it; reading the formatter's return value instead is strictly
    // better on the rendering axis and strictly worse on this one — a SECOND warn added
    // beside the loop prints into the same buffer and no assertion above can see it.
    //
    // A checker mutation-proved that: adding
    //   console.warn(`    OVERFLOW-adjacent detail for pages ${…}.`)
    // one line below the loop shipped 6/6 green, and `check-overflow-corpus.js`'s own
    // line-bounded regex harvests it (it captures "3, 5"). The old test reddened on it.
    //
    // So the block is pinned as a whole: exactly one call, and it is the loop.
    const start = SRC.indexOf('if (nearMiss.length)');
    assert.notEqual(start, -1, 'the #2252 advisory block must still be in lattice-emulator.js');
    const block = SRC.slice(start, SRC.indexOf('\n  }\n', start));
    const warns = [...block.matchAll(/console\.warn\(/g)];
    assert.equal(warns.length, 1,
      `the advisory block must print through the kernel formatter and nothing else — found ${warns.length} console.warn calls`);
  });

  test('the decision note quotes the advisory the export actually prints', () => {
    // ROUND 9 FOUND THIS FILE'S BLIND SPOT: nothing tied the note's fenced sample to the
    // formatter, so when the advisory's text was fixed the note kept quoting the OLD
    // lines — including the two defects that commit existed to remove (the off-by-one
    // "by less than", and the categorical "the pixels are gone from the export either
    // way", which is false for 16 of the 34 slides in the band). It shipped that way for
    // a whole commit. Quoting printed output into a document is a claim like any other,
    // and this is the one class of prose drift a test can actually hold.
    const NOTE = fs.readFileSync(path.join(ROOT, 'engineering', 'decisions',
      '2026-09-21-frame-tolerance-silent-window.md'), 'utf8');
    const sample = [{ slide: 3, px: 4 }, { slide: 4, px: 6 }, { slide: 8, px: 12 }];
    const block = formatNearMissAdvisory(sample).join('\n');
    assert.ok(NOTE.includes(block),
      'the decision note\'s fenced advisory block is stale — regenerate it from '
      + `formatNearMissAdvisory(${JSON.stringify(sample)}):\n\n${block}`);
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
