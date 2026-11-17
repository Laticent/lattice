// The front-matter register family (lib/authoring/rules/front-matter/): the rows against lint-core and the vocab
// bridge, and the readings the fixtures cannot hold alone. The reference diff (`npm run squadra:reference-diff`) holds
// every finding to lint-core over the recorded corpus; these pin the seams it does not see.

const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { ROWS, rules } = require('../../../lib/authoring/rules/front-matter');
const { nearest } = require('../../../lib/authoring/rules/front-matter/register-value');
const { ORDERED, squadraVocab } = require('../../../lib/authoring/squadra/vocab');
const { lintDeck, fixDeck } = require('../../../lib/authoring/squadra');
const { buildVocab, lintText } = require('../../../lib/authoring/lint');

const vocab = buildVocab();
const deck = (fm) => `---\n${fm}\n---\n\n# A slide\n`;

describe('the front-matter register family', () => {
  test('every row reads a vocabulary list the bridge carries in its authored order', () => {
    const bridged = squadraVocab(vocab);
    for (const row of ROWS) {
      assert.ok(ORDERED.has(row.vocab), `${row.vocab} keeps its order`);
      assert.deepEqual(bridged[row.vocab], [...vocab[row.vocab]], row.vocab);
    }
    assert.deepEqual([...ORDERED].sort(), ROWS.map((r) => r.vocab).sort(), 'ORDERED lists exactly the rows\' lists');
  });

  test('every rule id is `deck/` + its lint-core rule, and lint-core reports that rule on the same typo', () => {
    for (const row of ROWS) {
      const names = [...vocab[row.vocab]];
      const src = deck(`${row.key}: zzqqxx`);
      assert.ok(lintText(src, vocab).some((f) => f.rule === row.name), `lint-core reports ${row.name}`);
      const found = lintDeck(src, { vocab }).filter((f) => f.rule === `deck/${row.name}`);
      assert.equal(found.length, 1, row.name);
      assert.equal(found[0].location.slide, 0);
      assert.equal(src.slice(found[0].span.from, found[0].span.to), 'zzqqxx');
      assert.match(found[0].hint, new RegExp(names[0]));
    }
    assert.equal(rules.length, ROWS.length);
  });

  test('the did-you-mean takes the first name at the best distance, so the order decides a tie', () => {
    assert.equal(nearest('of', ['on', 'solid', 'duo', 'mono', 'off']), 'on');
    assert.equal(nearest('of', ['off', 'on']), 'off');
    assert.equal(fixDeck(deck('spectrum: of'), { vocab }).text, deck('spectrum: on'));
  });

  test('the value span survives a BOM and CRLF line ends, and the fix lands on it', () => {
    const src = '﻿---\r\npace: briskk\r\n---\r\n\r\n# A slide\r\n';
    const [f] = lintDeck(src, { vocab }).filter((x) => x.rule === 'deck/unknown-pace');
    assert.equal(src.slice(f.span.from, f.span.to), 'briskk');
    assert.equal(fixDeck(src, { vocab }).text, src.replace('briskk', 'brisk'));
  });

  test('a bare register reads its value past a trailing comment, as the engine does (lint-core did not)', () => {
    const src = deck('finish: hallo  # note');
    assert.deepEqual(lintText(src, vocab).filter((f) => f.rule === 'unknown-finish'), []);
    const found = lintDeck(src, { vocab });
    assert.deepEqual(found.map((f) => f.rule), ['deck/unknown-finish']);
    assert.equal(fixDeck(src, { vocab }).text, deck('finish: halo  # note'));
    // Mismatched quotes: the engine reads no name and keeps the default; lint-core named the word, and so does the port.
    assert.deepEqual(lintDeck(deck(`mode: "sketchy'`), { vocab }).map((f) => f.rule), ['deck/unknown-mode']);
    // A value that is not a bare name still reads as none.
    assert.deepEqual(lintDeck(deck('finish: two words'), { vocab }), []);
  });

  test('`key :` is the key, and an indented line stands in only for a loose register', () => {
    assert.deepEqual(lintDeck(deck('mode : sketchy'), { vocab }).map((f) => f.rule), ['deck/unknown-mode']);
    assert.deepEqual(lintDeck(deck('pptx:\n  color-mode: darrk'), { vocab }).map((f) => f.rule), []);
    assert.deepEqual(lintDeck(deck('pptx:\n  mode: sketchy'), { vocab }).map((f) => f.rule), ['deck/unknown-mode']);
  });

  test('a bundle deck\'s settings block is front matter, as the engine and lint-core read it', () => {
    const block = (top, inBlock) => `---\nmarp: true\n${top}\n---\n<script type="application/lattice-settings">\n${inBlock}\n</script>\n\n# A\n`;
    for (const src of [block('theme: indaco', 'finish: atriumm'), block('theme: indaco', 'finish: atriumm').replace(/\n/g, '\r\n')]) {
      const found = lintDeck(src, { vocab }).filter((f) => f.rule === 'deck/unknown-finish');
      assert.equal(found.length, 1);
      assert.equal(found[0].location.slide, 0);
      assert.equal(src.slice(found[0].span.from, found[0].span.to), 'atriumm');
      assert.equal(lintText(src, vocab).filter((f) => f.rule === 'unknown-finish').length, 1);
      assert.equal(fixDeck(src, { vocab }).text, src.replace('atriumm', 'atrium'));
    }
    // The block's key wins: the front matter's own line is commented out by the fold, so its typo is not read.
    assert.deepEqual(lintDeck(block('finish: atriumm', 'finish: halo'), { vocab }), []);
  });
});
