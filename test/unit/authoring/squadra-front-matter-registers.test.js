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

  // The edge table: every row against lint-core over value shapes × layouts (2,070 inputs). The parity cases go through
  // lint-core, so the reference diff's recording picks them up and re-runs them on every diff. Two classes differ on
  // purpose and are held on the Squadra side only, so they never enter the corpus as differences to explain:
  //   - a key line inside a block scalar's body: lint-core read it; the engine never does, nor does the port;
  //   - a trailing comment: the port reads the value past it, as the engine does (§12's deliberate change).
  test('the edge table: the port agrees with lint-core on every shape but the two it fixes', () => {
    const values = (t, k) => ({ typo: t, known: k, upper: k.toUpperCase(), dq: `"${t}"`, sq: `'${t}'`, mixq: `"${t}'`, comment: `${t}  # c`, words: 'two words', empty: '', hash: '# c' });
    const layouts = {
      top: (kv) => `---\ntitle: Q\n${kv}\n---\n\n# A\n`,
      crlf: (kv) => `---\r\ntitle: Q\r\n${kv}\r\n---\r\n\r\n# A\r\n`,
      spaced: (kv) => `---\n${kv.replace(':', ' :')}\n---\n\n# A\n`,
      nested: (kv) => `---\npptx:\n  ${kv}\n---\n\n# A\n`,
      repeat: (kv, k) => `---\n${kv}\n${kv.split(':')[0]}: ${k}\n---\n\n# A\n`,
      repeatLast: (kv, k) => `---\n${kv.split(':')[0]}: ${k}\n${kv}\n---\n\n# A\n`,
      blockBody: (kv) => `---\nstyle: |\n  ${kv}\n---\n\n# A\n`,
      settings: (kv) => `---\nmarp: true\n---\n<script type="application/lattice-settings">\n${kv}\n</script>\n\n# A\n`,
      tabs: (kv) => `---\n${kv.replace(': ', ':\t')}\t\n---\n\n# A\n`,
    };
    const key = (f) => `${f.rule.replace(/^deck\//, '')}|${f.message}`;
    let compared = 0;
    for (const row of ROWS) {
      const k = [...vocab[row.vocab]].find((n) => n !== 'none');
      const t = k + k.at(-1);
      for (const [vn, v] of Object.entries(values(t, k))) {
        for (const [ln, layout] of Object.entries(layouts)) {
          const src = layout(`${row.key}: ${v}`.trimEnd(), k);
          const mine = lintDeck(src, { vocab }).filter((f) => f.rule === `deck/${row.name}`).map(key);
          if (ln === 'blockBody') {
            assert.deepEqual(mine, [], `${row.name} ${vn}/${ln}: a block scalar's body is never read`);
            continue;
          }
          if (vn === 'comment' && row.value === 'bare') {
            // `repeat` puts a known value on the last line, which wins.
            assert.equal(mine.length, ln === 'repeat' ? 0 : 1, `${row.name} ${vn}/${ln}: the value is read past its comment`);
            continue;
          }
          const theirs = lintText(src, vocab).filter((f) => f.rule === row.name).map(key);
          assert.deepEqual(mine.sort(), theirs.sort(), `${row.name} ${vn}/${ln}`);
          compared++;
        }
      }
    }
    // One row fewer since `cards:` retired for `align:` (whose words the axis-register family checks): 1632 now.
    assert.ok(compared > 1600, `compared ${compared}`);
  });
});
