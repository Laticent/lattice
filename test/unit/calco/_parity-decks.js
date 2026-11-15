// The decks the PPTX parity test reads back (test/unit/calco/pptx-parity.test.js), keyed by name. `editable` decks
// go through Calco's `writePptx`; `pictures` decks through the CLI's picture-per-slide writer
// (lib/export/pptx-export.js), as `{ pngs, meta, notes, descriptions }`.
const { ONE_PX_PNG, ONE_PX_JPEG, style, frame, ttf } = require('./_fixtures');
const richDeck = require('./_rich-deck');

async function parityDecks() {
  const outfit400 = await ttf('outfit-400');
  const outfit700 = await ttf('outfit-700');
  return {
    editable: {
      rich: richDeck(),
      plain: {
        width: 1280,
        height: 720,
        slides: [{ image: ONE_PX_PNG, frames: [frame([[{ text: 'Plain', style: style() }], [{ text: 'two lines', style: style({ italic: true }) }]])], notes: 'n' }],
      },
      portrait: {
        width: 1080,
        height: 1920,
        title: 'Portrait',
        slides: [{ image: ONE_PX_JPEG, frames: [frame([[{ text: 'Tall', style: style({ size: 60 }) }]], { x: 80, y: 300, w: 900, h: 80, firstLineHeight: 72, lineHeight: 80 })] }],
      },
      // A card of one shape and its text, and a card that is only a pill: each is still a group.
      cards: {
        width: 1280,
        height: 720,
        slides: [
          {
            image: ONE_PX_PNG,
            frames: [frame([[{ text: 'Alone', style: style({ size: 18 }) }]], { x: 120, y: 120, w: 200, h: 24, firstLineHeight: 22, lineHeight: 24, group: 0 })],
            shapes: [
              { kind: 'box', x: 100, y: 100, w: 300, h: 100, radii: [0, 0, 0, 0], fill: { color: '#eeeeee', alpha: 1 }, group: 0 },
              { kind: 'box', x: 600, y: 100, w: 120, h: 30, radii: [15, 15, 15, 15], fill: { color: '#ffeedd', alpha: 1 }, group: 1, sub: 1 },
              { kind: 'box', x: 605, y: 110, w: 10, h: 10, radii: [5, 5, 5, 5], fill: { color: '#ff0000', alpha: 1 }, group: 1, sub: 1, pseudo: true },
              { kind: 'box', x: 100, y: 400, w: 200, h: 80, radii: [0, 0, 0, 0], fill: { color: '#dddddd', alpha: 1 }, group: 3 },
            ],
          },
        ],
      },
      fonts: {
        width: 1280,
        height: 720,
        fonts: [
          { family: 'Outfit', weight: 400, italic: false, bytes: outfit400 },
          { family: 'Outfit', weight: 700, italic: false, bytes: outfit700 },
          { family: 'Outfit', weight: 600, italic: false, bytes: outfit400 },
        ],
        slides: [{ image: ONE_PX_PNG, frames: [400, 600, 700, 800].map((w, i) => frame([[{ text: `w${w}`, style: style({ weight: w }) }]], { y: 100 + i * 60 })) }],
      },
    },
    pictures: {
      pictures: {
        pngs: [ONE_PX_PNG, ONE_PX_JPEG, ONE_PX_PNG],
        meta: { title: 'Pictures & <notes>', subject: 'CLI', width: 1280, height: 720 },
        notes: ['First note\nsecond line', null, 'Third'],
        descriptions: ['A chart "rising"', null, ''],
      },
      square: { pngs: [ONE_PX_PNG], meta: { title: 'Square', width: 1000, height: 1000 }, notes: [], descriptions: [] },
    },
  };
}

module.exports = { parityDecks };
