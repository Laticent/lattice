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
 * The HARD RULE #25 checker constructed exactly that reword against the first version of
 * this test, which asserted only the two case-SENSITIVE literals and so passed it. The
 * forbidden set below is the union of what all three tools can match.
 *
 * Pinned by the FORMAT STRING rather than by a render, so it costs no Chromium and
 * fails the moment someone rewords the line rather than the next time a sweep runs. The
 * page-shape assertions read the string with its `${…}` holes filled, because in the
 * source the page number starts with `$` — so `page ${o.slide}` would slip past a check
 * for `page` followed by a digit while rendering as `page 3`.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
const CORPUS = fs.readFileSync(path.join(ROOT, 'tools', 'check-overflow-corpus.js'), 'utf8');

/**
 * The TEXT the advisory prints, and only that.
 *
 * Scoped to the `console.warn` arguments rather than the whole block, because the
 * block also names the local `overflowing` — an identifier, never printed, which a
 * case-insensitive check for the word "overflow" would otherwise flag. What the
 * harvesters see is the buffer, so the buffer is what this reads.
 */
function advisoryLines() {
  const start = SRC.indexOf('ⓘ INSIDE THE FIT TOLERANCE');
  assert.notEqual(start, -1, 'the #2252 advisory must still be in lattice-emulator.js');
  const blockStart = SRC.lastIndexOf('if (nearMiss.length)', start);
  assert.notEqual(blockStart, -1);
  const block = SRC.slice(blockStart, SRC.indexOf('\n  }\n', start));
  const printed = [...block.matchAll(/console\.warn\(([\s\S]*?)\);/g)].map((m) => m[1]);
  assert.ok(printed.length >= 2, 'the advisory should still print its lines through console.warn');
  return printed.join('\n');
}

/**
 * The advisory as a READER sees it: every `${…}` collapsed to a digit, quoting and
 * whitespace normalized.
 *
 * The page-shape assertion has to run against THIS, not against the source. In the
 * source the page number is `${o.slide}`, which begins with `$` — so a reword to
 * `page ${o.slide}` leaves `/pages?\s+\d/` unmatched and walks through a test whose
 * whole job is to stop it, while `calibrate-core` harvests the rendered line. A
 * checker found exactly that hole in the first cut.
 */
function renderedAdvisory() {
  return advisoryLines().replace(/\$\{[^}]*\}/g, '3').replace(/[`'"]/g, '').replace(/\s+/g, ' ');
}

describe('the near-miss advisory (#2252)', () => {
  test('carries no token any of the three harvesters can key on', () => {
    const block = advisoryLines();
    const rendered = renderedAdvisory();
    // CASE-INSENSITIVE, because `tools/lib/calibrate-core.js` is. The first version of
    // this test used /OVERFLOW/ and a lowercase reword walked straight through it.
    assert.equal(/overflow/i.test(block), false,
      'the advisory must not print the word "overflow" in ANY case — calibrate-core.js greps /i');
    assert.equal(/content clipped/i.test(block), false,
      'the advisory must not print "content clipped", for the same reason');
    // …and not the page-list SHAPE either. All three harvesters want `page`/`pages`
    // followed by digits; the advisory writes `p3 (4px)` precisely so it cannot match.
    assert.equal(/pages?\s+\d/i.test(rendered), false,
      'the advisory must not write "page N" — it writes pN, so no harvester can read it');
    // …and the same for the word itself, read off the rendered line, so neither
    // assertion depends on the number being a literal in the source.
    assert.equal(/overflow/i.test(rendered), false, 'nor the word "overflow" once rendered');
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

  test('a rendered advisory line is inert against every harvest regex', () => {
    // Built from the SOURCE's own format string rather than hard-coded, so the
    // assertion cannot go vacuous the moment someone rewords the line it polices.
    const line = renderedAdvisory();
    for (const re of [
      /OVERFLOW[^\n]*?pages? ([\d,\s]+)/,
      /CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/,
      /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/,
      /OVERFLOW[\s\S]*?pages?\s+([\d,\s]+)/i,
    ]) assert.equal(re.test(line), false, `advisory source matched ${re}`);
  });

  test('the floor and the tolerance come from the kernel, not from a literal here', () => {
    const { FRAME_TOLERANCE, NEAR_MISS_FLOOR } = require('../../../lib/core/overflow-probe');
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
