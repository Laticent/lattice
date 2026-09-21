/**
 * track-spec — the `_track` grammar.
 *
 * One string in, labels and a current index out. Everything here is a shape an
 * author can type, and the failures are all SILENT on a slide: a label that
 * keeps its brackets, a column that lights when none should, a scale one column
 * short. The parse is shared by both render arms and the deck linter, so a
 * divergence here is a divergence everywhere.
 */
const test = require('node:test');
const assert = require('node:assert');
const { parseTrackSpec, MIN_TRACK_LABELS } = require('../../../lib/core/track-spec');

test('pipe-separated labels, in order, with the bracketed one current', () => {
  assert.deepEqual(parseTrackSpec('Cost to win | Lifetime value | [Payback] | The assumptions'), {
    labels: ['Cost to win', 'Lifetime value', 'Payback', 'The assumptions'],
    current: 2,
  });
});

test('marking none is a scale with no current item — never a guess', () => {
  assert.deepEqual(parseTrackSpec('A | B | C'), { labels: ['A', 'B', 'C'], current: -1 });
});

test('marking twice lights the FIRST, and every label loses its brackets', () => {
  // The brackets are the author's syntax; rendering them would put the marker
  // itself on the slide, which is the one place it must never appear.
  assert.deepEqual(parseTrackSpec('[A] | [B]'), { labels: ['A', 'B'], current: 0 });
});

test('brackets INSIDE a label are text — only a wholly bracketed item marks', () => {
  assert.deepEqual(parseTrackSpec('Cost [net] | [Payback]'), {
    labels: ['Cost [net]', 'Payback'], current: 1,
  });
});

test('whitespace is collapsed the way the rendered label reads it', () => {
  assert.deepEqual(parseTrackSpec('  Cost   to  win |\n[ Payback ]\t'), {
    labels: ['Cost to win', 'Payback'], current: 1,
  });
});

test('a degenerate item costs its column rather than printing the syntax', () => {
  // `[]` and `[ ]` are empty markers, `||` an empty label. A slip in the
  // directive shortens the scale; it never renders a bracket on the slide.
  assert.deepEqual(parseTrackSpec('A | [] | B'), { labels: ['A', 'B'], current: -1 });
  assert.deepEqual(parseTrackSpec('A || B'), { labels: ['A', 'B'], current: -1 });
  assert.deepEqual(parseTrackSpec('[ ] | B'), { labels: ['B'], current: -1 });
});

test('an unpaired bracket is a plain label, not half a marker', () => {
  assert.deepEqual(parseTrackSpec('[A | B]'), { labels: ['[A', 'B]'], current: -1 });
});

test('nothing at all parses to nothing, on every empty shape', () => {
  for (const spec of ['', '   ', '|', '| |', null, undefined]) {
    assert.deepEqual(parseTrackSpec(spec), { labels: [], current: -1 }, String(spec));
  }
});

test('the minimum is two — a scale of one is not a scale', () => {
  assert.equal(MIN_TRACK_LABELS, 2);
});
