/**
 * The RESTORE tokens through the owned engine (`lib/engine`), the canonical render path.
 *
 * A deck value writes no token when it is the default, so one slide inside a deck that set
 * another value needs the default's own token to ask for it back: `spectrum-on`,
 * `spectrum-edge-top`, `spectrum-card-edge-left`, `rule-auto`, `eyebrow-plain`, `head-auto`.
 * Each sits in its register's override set, so the engine drops the deck's token on that axis
 * for that slide, and the slide renders as the default. markdown-it-plugins.test.js pins the
 * same contract on the plugin; this pins it where decks are actually rendered.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));

const RESTORES = [
  ['spectrum-on', 'spectrum-solid'],
  ['spectrum-edge-top', 'spectrum-edge-left'],
  ['spectrum-card-edge-left', 'spectrum-card-edge-top'],
  ['rule-auto', 'rule-accent'],
  ['eyebrow-plain', 'eyebrow-dot'],
  ['head-auto', 'head-center'],
];
const DECK = [
  '---', 'theme: indaco',
  'spectrum: solid', 'spectrum-edge: left', 'spectrum-card: auto', 'spectrum-card-edge: top',
  'rule: accent', 'eyebrow: dot', 'headline: center',
  '---', '', '## Follows the deck',
  ...RESTORES.flatMap(([own]) => ['', '---', '', `<!-- _class: content ${own} -->`, '', `## ${own}`]),
].join('\n');

test('the engine drops the deck token on a restore token\'s axis, and keeps every other axis', () => {
  const doc = new JSDOM(latticeEngine.createEngine().render(DECK).html).window.document;
  const slides = [...doc.querySelectorAll('section')].filter((s) => s.querySelector('h2')).map((s) => [...s.classList]);
  assert.equal(slides.length, RESTORES.length + 1);
  const deckTokens = RESTORES.map(([, deck]) => deck);
  // THE CONTROL: the first slide carries every deck token, so each eviction below is real.
  for (const t of deckTokens) assert.ok(slides[0].includes(t), `slide 1 missing deck '${t}'; got [${slides[0].join(', ')}]`);
  RESTORES.forEach(([own, deck], i) => {
    const cls = slides[i + 1];
    assert.ok(cls.includes(own), `${own}: lost its own token; got [${cls.join(', ')}]`);
    assert.ok(!cls.includes(deck), `${own}: still carries the deck's '${deck}'; got [${cls.join(', ')}]`);
    for (const other of deckTokens.filter((t) => t !== deck)) {
      assert.ok(cls.includes(other), `${own}: dropped '${other}' from another axis; got [${cls.join(', ')}]`);
    }
  });
});
