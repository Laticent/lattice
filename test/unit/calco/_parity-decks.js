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
