/**
 * Unit: lib/authoring/slide-split.js — the authoring cores' view of where a slide begins.
 *
 * THE CONTRACT CHANGED, and the half that went is the half worth explaining. It used to be
 * "BYTE-FAITHFUL to `source.split(/^---$/m)` for any deck with no fenced `---`", with
 * fence-aware re-merging bolted on top. Faithfulness to that regex was the defect: the
 * ENGINE breaks a slide on every top-level markdown-it `hr`, and `/^---$/m` matches only a
 * bare run of exactly three hyphens with nothing after it. So `***`, `___`, `- - -`,
 * `----`, `--- ` with a trailing space and a `---` indented one to three spaces were all
 * slide breaks the renderer made and this splitter did not see — and, in the other
 * direction, a setext underline was a break this splitter made and the renderer did not.
 *
 * What survives is the CHUNK MODEL, which is what every consumer's index math is written
 * against: front matter occupies the first two chunks, real slides follow. What replaces
 * byte-faithfulness is agreement with `lib/core/slide-boundaries.mjs`, which is itself
 * pinned against the real parser by `test/unit/core/slide-boundaries.test.js`.
 */
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { splitTopLevel, fenceOpen, separatorLines } = require('../../../lib/authoring/slide-split.js');

test('the chunk model is preserved: front matter is the first two chunks', () => {
  // The shape `fmChunks()` counts past, and the reason this adapter exists at all.
  assert.deepEqual(splitTopLevel(''), ['']);
  assert.deepEqual(splitTopLevel('# only one slide'), ['# only one slide']);
  const fm = splitTopLevel('---\nmarp: true\n---\n\n# S1\n\n---\n\n# S2\n');
  assert.equal(fm.length, 4, 'empty + yaml + two slides');
  assert.equal(fm[0], '');
  assert.match(fm[1], /marp: true/);
  assert.match(fm[2], /# S1/);
  assert.match(fm[3], /# S2/);
  assert.equal(splitTopLevel('# A\n\n---\n\n# B\n\n---\n\n# C\n').length, 3);
  // A leading separator's empty chunk is dropped, matching `splitOnHr`; an empty MIDDLE or
  // LAST chunk is a real, rendered, empty slide and is kept.
  assert.deepEqual(splitTopLevel('trailing\n\n---\n'), ['trailing\n', '']);
  assert.equal(splitTopLevel('# A\n\n---\n\n---\n\n# B\n').length, 3);
  // `---` / blank / `---` is a complete (empty) FRONT-MATTER block, not two separators —
  // the one place a `---` pair is not read as slide structure at all.
  assert.deepEqual(splitTopLevel('---\n\n---\n'), ['', '', '']);
});

test('every thematic-break form the old regex missed is now a boundary', () => {
  // The six forms that reproduced silent slide destruction through the chat edit path.
  for (const sep of ['---', '***', '___', '- - -', '--- ', '----', '  ---']) {
    assert.equal(splitTopLevel(`# One\n\n${sep}\n\n# Two\n`).length, 2, `${JSON.stringify(sep)} should split`);
  }
  // And the disagreement of opposite sign: a run of `-` hard under a paragraph is that
  // paragraph's setext underline — a HEADING — so the deck is one slide, not two.
  assert.equal(splitTopLevel('body one\n---\n## Two\n').length, 1);
});

test('a --- inside a ``` fence does NOT split', () => {
  const deck = '<!-- _class: code -->\n```yaml\nname: app\n---\nenv: prod\n```\n';
  const chunks = splitTopLevel(deck);
  assert.equal(chunks.length, 1, 'the fenced --- must not create a second slide');
  assert.match(chunks[0], /name: app\n---\nenv: prod/, 'the sample survives verbatim');
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

test('separatorLines marks the right line indices (plain, fenced-excluded, indented fence, CRLF)', () => {
  // Plain: the `---` at line 1 is a boundary (no paragraph above it to underline).
  assert.deepEqual([...separatorLines(['# A', '---', '# B'])], [1]);
  // Fenced `---` (line 2) is NOT a boundary; the real `---` (line 5) is.
  assert.deepEqual([...separatorLines(['```', 'a', '---', 'b', '```', '---', '# C'])], [5]);
  // An indented (≤3 space) fence still opens; its inner `---` is excluded.
  assert.deepEqual([...separatorLines(['  ```', '  ---', '  ```', '---'])], [3]);
  // CRLF: `\r` is folded at the door, exactly as the engine folds it.
  assert.deepEqual([...separatorLines('a\r\n\r\n---\r\n\r\nb'.split('\n'))], [2]);
  // separatorLines.size + 1 === splitTopLevel().length, on a fenced CRLF deck.
  const crlfFenced = '# A\r\n\r\n---\r\n\r\n```\r\n---\r\n```\r\n\r\n---\r\n\r\n# C';
  assert.equal(separatorLines(crlfFenced.split('\n')).size + 1, splitTopLevel(crlfFenced).length);
});
