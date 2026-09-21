/**
 * Gate: the emulator's "INSIDE THE FIT TOLERANCE" advisory cannot hijack the
 * overflow ratchet's page list.
 *
 * `tools/check-overflow-corpus.js` harvests the pages a deck clips by running two
 * regexes over the emulator's WHOLE stdout+stderr buffer and taking the FIRST hit:
 *
 *     /OVERFLOW[^\n]*?pages? ([\d,\s]+)/
 *     /CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/
 *
 * The advisory added for #2252 prints page numbers too. If its wording ever carried
 * either literal, and it printed BEFORE the real warning, the ratchet would read the
 * advisory's pages as the deck's clipped pages — a corpus-wide gate quietly measuring
 * the wrong thing. Nothing about the advisory's text says that; this does.
 *
 * Pinned by the SOURCE STRING rather than by a render, so it costs no Chromium and
 * fails the moment someone rewords the line rather than the next time a sweep runs.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SRC = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
const CORPUS = fs.readFileSync(path.join(ROOT, 'tools', 'check-overflow-corpus.js'), 'utf8');

/** The advisory's own console.warn calls, extracted from the emulator source. */
function advisoryLines() {
  const start = SRC.indexOf('ⓘ INSIDE THE FIT TOLERANCE');
  assert.notEqual(start, -1, 'the #2252 advisory must still be in lattice-emulator.js');
  // The whole emitting block: from the enclosing `if (nearMiss.length)` to its close.
  const blockStart = SRC.lastIndexOf('if (nearMiss.length)', start);
  assert.notEqual(blockStart, -1);
  const block = SRC.slice(blockStart, SRC.indexOf('\n  }\n', start));
  return block;
}

describe('the near-miss advisory (#2252)', () => {
  test('carries neither literal the corpus ratchet greps for', () => {
    const block = advisoryLines();
    assert.equal(/OVERFLOW/.test(block), false,
      'the advisory must not print the word OVERFLOW — check-overflow-corpus.js would read its pages as clipped pages');
    assert.equal(/CONTENT CLIPPED/.test(block), false,
      'the advisory must not print CONTENT CLIPPED, for the same reason');
  });

  test('the ratchet still greps for exactly those two literals', () => {
    // If the harvest ever keys on something else, the assertion above is guarding a
    // literal nobody reads any more — a test that passes for the wrong reason.
    assert.match(CORPUS, /grabPages\(\/OVERFLOW\[\^\\n\]\*\?pages\? \(\[\\d,\\s\]\+\)\/\)/);
    assert.match(CORPUS, /grabPages\(\/CONTENT CLIPPED\[\^\\n\]\*\?pages\? \(\[\\d,\\s\]\+\)\/\)/);
  });

  test('a rendered advisory line is inert against both harvest regexes', () => {
    // The real shape, as the emulator prints it — three slides, px in parentheses.
    const line = '  ⓘ INSIDE THE FIT TOLERANCE — 3 slides paint past a box that crops by less than '
      + 'the 12px budget every check above is read against, so nothing reports them: p3 (4px), p4 (6px), p5 (8px).';
    assert.equal(/OVERFLOW[^\n]*?pages? ([\d,\s]+)/.test(line), false);
    assert.equal(/CONTENT CLIPPED[^\n]*?pages? ([\d,\s]+)/.test(line), false);
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
