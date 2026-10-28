/**
 * Unit: what Calco asks a host for, and what it does with the answer (docs/src/lib/calco/fonts.ts). Calco lists the faces a deck draws with and the
 * characters in each; the host decides what goes in the file (Lattice's tiers live in lib/core/font-policy.js). These tests use a fake host.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { prepareFonts, emojiSpans, splitEmojiRuns, facesUsed } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, synthFont } = require('./_fixtures');

const deckOf = (text, over = {}) => ({ width: 1, height: 1, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text, style: style(over) }]])] }] });

describe('calco prepareFonts', () => {
  test('hands the host each face with the characters the deck draws in it, and embeds what comes back', async () => {
    const asked = [];
    const fonts = await prepareFonts(deckOf('Hi!Hi'), { font: (face) => (asked.push(face), synthFont({})) });
    assert.equal(asked.length, 1);
    assert.equal(asked[0].chars, 'Hi!');
    assert.deepEqual(fonts.map((f) => [f.family, f.weight, f.italic]), [['Outfit', 400, false]]);
  });

  test("'system' embeds nothing, and says nothing: the author chose it", async () => {
    const skipped = [];
    const fonts = await prepareFonts(deckOf('Hi'), { font: () => 'system' }, (_face, why) => skipped.push(why));
    assert.deepEqual(fonts, []);
    assert.deepEqual(skipped, []);
  });

  test('null means the host has no file for the face: reported as unavailable', async () => {
    const skipped = [];
    await prepareFonts(deckOf('Hi'), { font: () => null }, (_face, why) => skipped.push(why));
    assert.deepEqual(skipped, ['unavailable']);
  });

  test('a host written for the old load/pin shape is refused loudly, not reported once per face', async () => {
    await assert.rejects(() => prepareFonts(deckOf('Hi'), { load: () => new Uint8Array([1]), pin: (b) => b }), /needs font\(face\)/);
  });

  test('a face the host throws on is reported with its error and left out; the other faces still embed', async () => {
    const deck = deckOf('Go');
    deck.slides[0].frames[0].lines[0].push({ text: 'x', style: style({ family: 'Second' }) });
    const skipped = [];
    const fonts = await prepareFonts(deck, {
      font: (face) => {
        if (face.family === 'Outfit') throw new Error('the cut failed');
        return synthFont({});
      },
    }, (face, why, error) => skipped.push([face.family, why, error?.message]));
    assert.deepEqual(fonts.map((f) => f.family), ['Second']);
    assert.deepEqual(skipped, [['Outfit', 'failed', 'the cut failed']]);
  });
});

describe('calco characters drawn per face', () => {
  const chars = (deck) => facesUsed(deck)[0].chars;
  test('a run keeps only what it shows', () => {
    assert.equal(chars(deckOf('abc')), 'abc');
  });
  test('text-transform draws capitals the source text does not have', () => {
    const got = chars(deckOf('eyebrow', { transform: 'uppercase' }));
    for (const ch of 'eyebrowEYEBROW') assert.ok(got.includes(ch), `keeps ${ch}`);
  });
  test('small caps need the capitals too', () => {
    const got = chars(deckOf('Note', { smallCaps: true }));
    for (const ch of 'NOTEnote') assert.ok(got.includes(ch), `keeps ${ch}`);
  });
});

describe('calco emoji runs', () => {
  test('emojiSpans finds flags, keycaps, joined sequences and presentation-selector hearts, and leaves a bare text heart alone', () => {
    const seq = (t) => emojiSpans(t).map((s) => s.sequence);
    assert.deepEqual(seq('Go \u{1F680} now'), ['\u{1F680}']);
    assert.deepEqual(seq('\u{1F1EB}\u{1F1F7}'), ['\u{1F1EB}\u{1F1F7}']);
    assert.deepEqual(seq('1️⃣ #️⃣'), ['1️⃣', '#️⃣']);
    assert.deepEqual(seq('\u{1F468}‍\u{1F469}‍\u{1F467}'), ['\u{1F468}‍\u{1F469}‍\u{1F467}']);
    assert.deepEqual(seq('\u{1F44D}\u{1F3FD}'), ['\u{1F44D}\u{1F3FD}']);
    assert.deepEqual(seq('❤️'), ['❤️']);
    assert.deepEqual(seq('plain ❤ and 123'), []);
  });

  test('splitEmojiRuns splits a run at its emoji, in place, and is idempotent', () => {
    const deck = deckOf('Go \u{1F680} now ✅!', { weight: 700 });
    const fam = (s) => (s === '\u{1F680}' ? 'Emoji A' : s === '✅' ? 'Emoji B' : null);
    const families = splitEmojiRuns(deck, fam);
    const line = deck.slides[0].frames[0].lines[0];
    assert.deepEqual(line.map((r) => r.text), ['Go ', '\u{1F680}', ' now ', '✅', '!']);
    assert.deepEqual(line.map((r) => r.style.family), ['Outfit', 'Emoji A', 'Outfit', 'Emoji B', 'Outfit']);
    assert.equal(line[1].style.weight, 400, 'an emoji run is a regular upright face');
    assert.equal(line[0].style.weight, 700, 'the text keeps its weight');
    assert.deepEqual([...families].sort(), ['Emoji A', 'Emoji B']);
    splitEmojiRuns(deck, fam);
    assert.equal(deck.slides[0].frames[0].lines[0].length, 5, 'a second pass splits nothing more');
  });

  test('a sequence the host has no face for stays in its text run', () => {
    const deck = deckOf('a \u{1F680} b');
    splitEmojiRuns(deck, () => null);
    assert.deepEqual(deck.slides[0].frames[0].lines[0].map((r) => r.text), ['a \u{1F680} b']);
  });
});

describe('calco emoji sequences, as the review found them wrong', () => {
  const seq = (t) => emojiSpans(t).map((s) => s.sequence);
  test('a skin tone binds to a text-default base, so the pair is one emoji', () => {
    assert.deepEqual(seq('☝\u{1F3FB}'), ['☝\u{1F3FB}']);
    assert.deepEqual(seq('✌\u{1F3FD}'), ['✌\u{1F3FD}']);
    assert.deepEqual(seq('⛹\u{1F3FD}‍♀️'), ['⛹\u{1F3FD}‍♀️']);
  });
  test('a tag flag keeps its tag characters', () => {
    const england = '\u{1F3F4}\u{E0067}\u{E0062}\u{E0065}\u{E006E}\u{E0067}\u{E007F}';
    assert.deepEqual(seq(`x ${england} y`), [england]);
  });
  test('a presentation selector after an emoji-default pictograph stays with it', () => {
    assert.deepEqual(seq('⭐️'), ['⭐️']);
    assert.deepEqual(seq('\u{1F600}️'), ['\u{1F600}️']);
  });
  test('a request for text style, and a lone regional indicator, are not emoji', () => {
    assert.deepEqual(seq('⌚︎'), []);
    assert.deepEqual(seq('\u{1F1FA} alone'), []);
  });
  test('the run an emoji is split into is marked, and a line is as tall as its text, not its emoji', () => {
    const { dominantStyle } = require('@laticent/calco');
    const deck = deckOf('\u{1F680} A long paragraph');
    splitEmojiRuns(deck, () => 'Emoji A');
    const line = deck.slides[0].frames[0].lines[0];
    assert.equal(line[0].style.emoji, true);
    assert.equal(dominantStyle(line).family, 'Outfit', 'the lead style is the text face, so line spacing does not read the emoji font');
  });
});

describe('calco chrome frames that carry an emoji', () => {
  test('a one-line footer with an emoji is still one frame to the layouts', () => {
    const { planMasters } = require('@laticent/calco');
    const mk = (n) => {
      const deck = deckOf(`Confidential \u{1F512} ${n}`);
      deck.slides[0].frames[0].role = 'footer';
      deck.slides[0].background = 0;
      return deck.slides[0];
    };
    const deck = { width: 1, height: 1, backgrounds: [{ color: '#fff' }], slides: [mk(''), mk('')] };
    splitEmojiRuns(deck, (s) => (s === '\u{1F512}' ? 'Emoji A' : null));
    const plan = planMasters(deck);
    assert.deepEqual([...plan.hoisted[0]], [0], 'the footer is hoisted into the layout, as it was before the split');
  });
});
