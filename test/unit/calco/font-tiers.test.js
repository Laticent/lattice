/**
 * Unit: how much of a face Calco embeds (docs/src/lib/calco/fonts.ts). The tier words are the deck's `fonts:` words; a
 * host supplies the faces, so these tests use a fake host and read what it was asked for.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { prepareFonts, emojiSpans, splitEmojiRuns, facesUsed } = require('@laticent/calco');
const { ONE_PX_PNG, style, frame, synthFont } = require('./_fixtures');

const deckOf = (text, over = {}) => ({ width: 1, height: 1, slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text, style: style(over) }]])] }] });
const FONT = new Uint8Array([0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);

/** A host that records each load and pin, and hands back a face that passes the license check. */
function recorder() {
  const loads = [];
  const pins = [];
  return {
    loads,
    pins,
    host: {
      load: (face) => (loads.push(face), FONT),
      pin: (bytes, options) => (pins.push(options), bytes),
    },
  };
}

describe('calco font tiers', () => {
  test('exact keeps only the characters the deck draws in that face; used and full keep every character', async () => {
    for (const [tier, keep] of [['exact', 'Hi!'], ['used', null], ['full', null]]) {
      const r = recorder();
      await prepareFonts(deckOf('Hi!Hi'), { load: r.host.load, pin: (b, o) => (r.pins.push(o), synthFont({})) }, undefined, { text: tier });
      assert.deepEqual(r.pins.map((p) => p.keep), [keep], tier);
      assert.equal(r.loads[0].tier, tier);
    }
  });

  test('system embeds nothing and never asks the host for the face', async () => {
    const r = recorder();
    const fonts = await prepareFonts(deckOf('Hi'), r.host, undefined, { text: 'system' });
    assert.deepEqual(fonts, []);
    assert.equal(r.loads.length, 0);
  });

  test('the default is the whole face for text', async () => {
    const r = recorder();
    await prepareFonts(deckOf('Hi'), { load: r.host.load, pin: (b, o) => (r.pins.push(o), synthFont({})) });
    assert.equal(r.pins[0].keep, null);
    assert.equal(r.loads[0].tier, 'used');
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

  test('prepareFonts embeds each emoji face by the emoji tier, and the text by the text tier', async () => {
    for (const [emoji, keep] of [['exact', '\u{1F680}'], ['used', null], ['full', null]]) {
      const loads = [];
      const pins = [];
      const host = { load: (f) => (loads.push(f), FONT), pin: (b, o) => (pins.push(o), synthFont({})) };
      const fonts = await prepareFonts(deckOf('Go \u{1F680}'), host, undefined, { text: 'used', emoji, emojiFamily: () => 'Emoji A' });
      assert.deepEqual(fonts.map((f) => f.family).sort(), ['Emoji A', 'Outfit']);
      const e = loads.find((l) => l.emoji);
      assert.equal(e.family, 'Emoji A');
      assert.equal(e.tier, emoji);
      assert.equal(pins[loads.indexOf(e)].keep, keep, `emoji ${emoji}`);
      assert.equal(loads.find((l) => !l.emoji).tier, 'used');
    }
  });

  test('system-emoji leaves the emoji in the text run for the reader to draw', async () => {
    const deck = deckOf('Go \u{1F680}');
    const r = recorder();
    await prepareFonts(deck, { load: r.host.load, pin: () => synthFont({}) }, undefined, { emoji: 'system', emojiFamily: () => 'Emoji A' });
    assert.deepEqual(deck.slides[0].frames[0].lines[0].map((x) => x.text), ['Go \u{1F680}']);
    assert.deepEqual(facesUsed(deck).map((f) => f.family), ['Outfit']);
  });
});

describe('calco font failures', () => {
  test('a face the host throws on is reported and left out; the other faces still embed', async () => {
    const deck = deckOf('Go \u{1F680}');
    const skipped = [];
    const host = {
      load: (f) => {
        if (f.emoji) throw new Error('the slice would not load');
        return FONT;
      },
      pin: () => synthFont({}),
    };
    const fonts = await prepareFonts(deck, host, (face, why) => skipped.push([face.family, why]), { text: 'used', emoji: 'exact', emojiFamily: () => 'Emoji A' });
    assert.deepEqual(fonts.map((f) => f.family), ['Outfit']);
    assert.deepEqual(skipped, [['Emoji A', 'failed']]);
  });

  test('a pin that throws is the same', async () => {
    const skipped = [];
    const host = { load: () => FONT, pin: () => { throw new Error('cut failed'); } };
    const fonts = await prepareFonts(deckOf('Hi'), host, (face, why) => skipped.push(why));
    assert.deepEqual(fonts, []);
    assert.deepEqual(skipped, ['failed']);
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

describe('calco exact text and text-transform', () => {
  test('exact keeps the capitals a transformed run draws', async () => {
    const r = recorder();
    await prepareFonts(deckOf('eyebrow', { transform: 'uppercase' }), { load: r.host.load, pin: (b, o) => (r.pins.push(o), synthFont({})) }, undefined, { text: 'exact' });
    const keep = r.pins[0].keep;
    for (const ch of 'eyebrowEYEBROW') assert.ok(keep.includes(ch), `keeps ${ch}`);
  });
  test('small caps need the capitals too', async () => {
    const r = recorder();
    await prepareFonts(deckOf('Note', { smallCaps: true }), { load: r.host.load, pin: (b, o) => (r.pins.push(o), synthFont({})) }, undefined, { text: 'exact' });
    for (const ch of 'NOTEnote') assert.ok(r.pins[0].keep.includes(ch), `keeps ${ch}`);
  });
  test('an untransformed run keeps only what it shows', async () => {
    const r = recorder();
    await prepareFonts(deckOf('abc'), { load: r.host.load, pin: (b, o) => (r.pins.push(o), synthFont({})) }, undefined, { text: 'exact' });
    assert.equal(r.pins[0].keep, 'abc');
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
