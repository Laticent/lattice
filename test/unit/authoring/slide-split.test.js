/**
 * Unit: lib/authoring/slide-split.js — the fence-aware top-level slide splitter the
 * authoring cores share.
 *
 * The contract has two halves:
 *  1. BYTE-FAITHFUL to `source.split(/^---$/m)` for any deck with no fenced `---`
 *     (so the front-matter chunk model + every consumer's index math is untouched).
 *  2. A `---` INSIDE a ```/~~~ fence is NOT a boundary — the chunk is re-merged with
 *     the exact `---` the naive split removed. This is what stopped a code sample's
 *     `---` from desyncing every downstream slide number (and the Coach's AI-fix target).
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitTopLevel, fenceOpen } = require('../../../lib/authoring/slide-split.js');

test('byte-faithful to split(/^---$/m) when there is no fenced ---', () => {
  const decks = [
    '',
    '# only one slide',
    '---\nmarp: true\n---\n\n# S1\n\n---\n\n# S2\n',
    '# A\n\n---\n\n# B\n\n---\n\n# C\n',
    'trailing\n---\n', // edge: empty last chunk
    '---\n---\n', // separators only
  ];
  for (const d of decks) {
    assert.deepEqual(splitTopLevel(d), d.split(/^---$/m), `mismatch for: ${JSON.stringify(d)}`);
  }
});

test('a --- inside a ``` fence does NOT split (re-merged, byte-exact)', () => {
  const deck = '<!-- _class: code -->\n```yaml\nname: app\n---\nenv: prod\n```\n';
  const chunks = splitTopLevel(deck);
  assert.equal(chunks.length, 1, 'the fenced --- must not create a second slide');
  assert.equal(chunks.join('---'), deck.split(/^---$/m).join('---'), 're-merge must be byte-exact');
});

test('real separators still split around a slide that contains a fenced ---', () => {
  const deck = '# Intro\n\n---\n\n<!-- _class: code -->\n```\na\n---\nb\n```\n\n---\n\n# Outro\n';
  const chunks = splitTopLevel(deck);
  assert.equal(chunks.length, 3, 'three real slides; the fenced --- is not a boundary');
  assert.ok(chunks[1].includes('a\n---\nb'), 'the fenced --- stays inside its slide');
});

test('~~~ fences and length-matched closers are honored', () => {
  // A ``` inside a ~~~ block must not close it; only a >=len ~~~ does.
  const deck = '~~~md\nfront\n---\n```\nnested\n```\n---\nback\n~~~\n';
  assert.equal(splitTopLevel(deck).length, 1);
});

test('fenceOpen tracks unclosed fences', () => {
  assert.equal(fenceOpen('```\nx'), true);
  assert.equal(fenceOpen('```\nx\n```'), false);
  assert.equal(fenceOpen('plain text'), false);
  assert.equal(fenceOpen('~~~~\na\n~~~'), true); // shorter closer can't close a longer opener
});
