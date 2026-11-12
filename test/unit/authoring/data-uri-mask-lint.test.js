/**
 * The linter reads a pasted photo's address, never its bytes (lib/authoring/data-uri-mask.mjs), and the slide-metadata memo
 * never holds a key it cannot keep (lib/core/meta-memo.mjs). Both were the Studio freezing for seconds after a deck of
 * phone photos was pasted (docs/e2e/export-photo-size.spec.ts, red under load).
 *
 * The oracle for the mask is the linter WITHOUT it (`_lintTextUnmasked`): every deck here must lint to the same findings
 * either way, including findings whose line holds a photo and whose column sits after one.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core.js');
const { buildVocab } = require('../../../lib/authoring/lint.js');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const { maskDataUris, MIN_PAYLOAD, KEEP_ENDS } = require('../../../lib/authoring/data-uri-mask.mjs');
const { mulberry32 } = require('../../helpers/regex-differential');
const { memoGet, memoSet } = require('../../../lib/core/meta-memo.mjs');
const { readMetaField } = require('../../../lib/core/meta-edit.mjs');
const { readRecord } = require('../../../lib/core/meta-door.mjs');

const vocab = buildVocab();
// A payload long enough to mask: base64 text, no newline. Each photo differs, so a restore that swapped two shows.
const photo = (n, fill = 'Q') => `data:image/png;base64,${'iVBORw0KGgo'.padEnd(n, fill)}`;
const P = photo(MIN_PAYLOAD + 1904);
const R = photo(MIN_PAYLOAD + 2904, 'R');

const DECKS = {
  'a background photo': `<!-- _class: image -->\n\n## Head\n\nText.\n\n![bg](${P})`,
  'HTML attributes, both quotes': `# T\n\n<img src="${P}" alt="x"> <img src='${R}'>`,
  'front matter url()': `---\nbackgroundImage: url(${P})\nstyle: "section { background: url('${R}') }"\n---\n\n# T`,
  'a link definition': `# T\n\n![a][p]\n\n[p]: ${P}`,
  'an SVG data image': `# T\n\n![a](data:image/svg+xml;base64,${'Q'.repeat(MIN_PAYLOAD + 10)})`,
  'pills after two photos (col moves)': `# T\n\n![a](${P}) ![b](${R}) \`@pill{ABC, circle}\` and \`@pill{XYZ, circle}\`\n`,
  'a pill before a photo (col stays)': `# T\n\n\`@pill{ABC, circle}\` ![a](${P})\n`,
  'a fix on a photo line': `# T\n\n- ![a](${P}) \`@icon{database}\` \`^{database}\` ![b](${R}) \`@icon{db}\`\n`,
  // A rule that quotes a CUT of a line: the cut must read the same, and never end inside the stand-in.
  'an unclosed comment quoting a photo line': `# T\n\n<!-- <img src="${P}">\n\ntext`,
  'a cut that lands where the stand-in would': `# T\n\n<!-- ${'x'.repeat(43)}![a](${P})\n\ntext`,
  'a retired caption key on a photo': `<!-- _class: image -->\n\n<!-- caption: ![a](${P}) -->\n\n## H`,
  // The two fence readers disagree: a fence inside a comment, a fence a slide break ends, lone \r line ends.
  'a fence inside speaker notes, then a real one': `# T\n\n<!--\n\`\`\`\n-->\n\n\`\`\`\n![x](${P})\n\`\`\`\n`,
  'a notes fence on one slide, code on the next': `# A\n\n<!-- a sample:\n\`\`\`\n-->\n\n---\n\n# B\n\n\`\`\`\n<img src="${P}">\n\`\`\`\n`,
  'lone carriage returns': `# T\r\r\`\`\`\r![x](${P})\r\`\`\`\r`,
  'CRLF and a BOM': `\uFEFF# T\r\n\r\n![a](${P}) \`@pill{ABC, circle}\`\r\n`,
  // Not masked: a code block's line length is what its column check judges, and prose is words a budget counts.
  'a photo in a code fence': `# T\n\n\`\`\`md\n![x](${P})\n\`\`\`\n`,
  'an unquoted equals in prose': `# T\n\nThe value x=data:image/png;base64,${'Q'.repeat(MIN_PAYLOAD + 10)} is long.`,
  'a data address in prose': `# T\n\nA data address data:image/png;base64,${'Q'.repeat(MIN_PAYLOAD + 10)} in prose.`,
};

describe('lintTextWith: the mask changes no finding', () => {
  for (const [name, deck] of Object.entries(DECKS)) {
    test(name, () => {
      assert.deepEqual(core.lintTextWith(deck, vocab), core._lintTextUnmasked(deck, vocab));
    });
  }

  test('a fix on a line holding an inline photo lands exactly as unmasked', () => {
    const deck = DECKS['a fix on a photo line'];
    const f = core.lintTextWith(deck, vocab).find((x) => x.rule === 'mixed-spelling');
    assert.ok(f, 'mixed-spelling fires on the photo line');
    const fixed = core.applyFix(deck, f);
    assert.ok(fixed && fixed.includes(P) && fixed.includes(R) && fixed.endsWith('`@icon{database}`\n'), 'the fix lands and keeps both photos');
  });

  test('the masked flags: a fence and prose are left whole, a destination is masked', () => {
    assert.equal(maskDataUris(DECKS['a photo in a code fence']), null);
    assert.equal(maskDataUris(DECKS['a data address in prose']), null);
    assert.equal(maskDataUris(DECKS['an unquoted equals in prose']), null);
    // A photo inside other text is characters a rule counts, so only a photo paragraph is masked.
    for (const name of ['HTML attributes, both quotes', 'front matter url()', 'pills after two photos (col moves)', 'a fix on a photo line', 'a fence inside speaker notes, then a real one']) {
      assert.equal(maskDataUris(DECKS[name]), null, name);
    }
    // A real photo's base64 ends in `=` padding.
    for (const pad of ['=', '==']) assert.ok(maskDataUris(`# T\n\n![bg](${P}${pad})\n`), `padding ${pad}`);
    for (const name of ['a background photo', 'a link definition', 'an SVG data image']) {
      assert.ok(maskDataUris(DECKS[name]), name);
    }
    for (const line of [`<img src="${P}" alt="x">`, `<!-- _backgroundImage: url('${P}') -->`, `![a](${P} "title")`]) {
      assert.ok(maskDataUris(`# T\n\n${line}\n\nText.`), line.slice(0, 30));
    }
    // Not its own paragraph: a list item's lazy continuation, an indented line.
    assert.equal(maskDataUris(`- item\n![a](${P})\n`), null);
    assert.equal(maskDataUris(`# T\n\n  ![a](${P})\n`), null);
  });
});

describe('lintTextWith: the mask changes no finding on the baseline gallery with photos spliced in', () => {
  // Seeded (HARD RULE #32): the seed is in every test name, so a failure reproduces. Each draw puts photos on random
  // lines of the gallery, inside fences, comments, front matter and tables included, as an image, an attribute or a url().
  const gallery = readFileSync(path.join(__dirname, '../../integration/baseline-decks/gallery.md'), 'utf8');
  const forms = [(p) => ` ![p](${p})`, (p) => ` <img src="${p}">`, (p) => ` url(${p})`, (p) => `![bg](${p})`];
  // Arm 1: photos appended INSIDE existing lines (a card's tag, a chart label, a table cell). Mostly left unmasked;
  // either way the findings must not move.
  for (const seed of [1, 2, 3, 4]) {
    test(`inline, seed ${seed}`, () => {
      const rnd = mulberry32(seed);
      const lines = gallery.split('\n');
      for (let k = 0; k < 12; k++) {
        const i = Math.floor(rnd() * lines.length);
        lines[i] += forms[Math.floor(rnd() * forms.length)](photo(MIN_PAYLOAD + Math.floor(rnd() * 3000), 'QRST'[k % 4]));
      }
      const deck = lines.join('\n');
      assert.deepEqual(core.lintTextWith(deck, vocab), core._lintTextUnmasked(deck, vocab), `seed ${seed}`);
    });
  }
  // Arm 2: a photo PARAGRAPH (the shape a paste makes) dropped between random lines: inside fences, comments, lists,
  // tables and front matter as well as between blocks. Each eligible one is masked; the findings must not move.
  const blocks = [(p) => `![bg](${p}=)`, (p) => `![bg](${p}==)`, (p) => `<img src="${p}=" alt="x">`, (p) => `<!-- _backgroundImage: url(${p}) -->`, (p) => `![photo](${p} "A title")`, (p) => `[ref]: ${p}`];
  for (const seed of [11, 12, 13, 14, 15, 16]) {
    test(`paragraph, seed ${seed}`, () => {
      const rnd = mulberry32(seed);
      const lines = gallery.split('\n');
      for (let k = 0; k < 10; k++) {
        const i = Math.floor(rnd() * lines.length);
        lines.splice(i, 0, '', blocks[Math.floor(rnd() * blocks.length)](photo(MIN_PAYLOAD + Math.floor(rnd() * 3000), 'QRST'[k % 4])), '');
      }
      const deck = lines.join('\n');
      assert.ok(maskDataUris(deck, { keepLines: () => [] }), `seed ${seed}: the draw holds a photo line`);
      assert.deepEqual(core.lintTextWith(deck, vocab), core._lintTextUnmasked(deck, vocab), `seed ${seed}`);
    });
  }
});

describe('maskDataUris', () => {
  test('the linter never sees the bytes: three phone-size photos lint as a deck of under 1 KB', () => {
    const PHOTOS = 3;
    const big = photo(4_500_000);
    const deck = ['# Photos', big, big, big].map((p, i) => (i ? `<!-- _class: image -->\n\n## Photo ${i}\n\n![bg](${p})` : p)).join('\n\n---\n\n');
    const m = maskDataUris(deck);
    assert.ok(deck.length > 13_000_000);
    assert.ok(m.text.length < 1024 + PHOTOS * 2 * KEEP_ENDS, `the masked deck is ${m.text.length} characters`);
    assert.equal(m.text.split('\n').length, deck.split('\n').length, 'every line keeps its number');
  });

  test('a short payload, and a deck with none, cost one look', () => {
    assert.equal(maskDataUris(`![a](${photo(MIN_PAYLOAD - 100)})`), null);
    assert.equal(maskDataUris(`# T\n\n${'word '.repeat(MIN_PAYLOAD)}`), null);
  });

  test('restore: every string a finding carries reads unmasked, and a column past a stand-in moves', () => {
    const deck = `# T\n\n![a](${P})\n\nText.`;
    const m = maskDataUris(deck);
    const masked = m.text.split('\n')[2];
    assert.ok(masked.length < P.length, 'the photo line is shorter masked');
    const [f] = m.restore([{ line: `${masked} \`x\``, col: masked.length + 1, span: '`x`', nested: { quote: [masked.slice(0, 80)] }, fix: `drop ${masked}` }]);
    const line = deck.split('\n')[2];
    assert.equal(f.line, `${line} \`x\``);
    assert.equal(f.col, line.length + 1, 'the column moves by what the stand-in hid');
    assert.equal(f.nested.quote[0], line.slice(0, 80), 'a cut near the start reads as unmasked (KEEP_ENDS)');
    assert.equal(f.fix, `drop ${line}`);
  });

  test('a stand-in never collides with the author\'s own text', () => {
    const deck = `# Ltcmask0n0e and Ltcmask1n\n\n![a](${P})`;
    const m = maskDataUris(deck);
    assert.ok(m.text.includes('Ltcmask2n0e'), m.text.slice(0, 80));
    const f = { line: '# Ltcmask0n0e and Ltcmask1n', message: 'x' };
    assert.equal(m.restore([f])[0], f, 'a finding with no stand-in is passed through as is');
  });
});

describe('the metadata memo never holds a key it cannot keep', () => {
  test('memoSet skips a key past a quarter of the bound, and evicts nothing for it', () => {
    const map = new Map();
    memoSet(map, 'small', 1, 1000);
    memoSet(map, 'x'.repeat(251), 2, 1000);
    assert.deepEqual([...map.keys()], ['small']);
    assert.equal(memoGet(map, 'small'), 1);
  });

  test('readMetaField: a photo slide reads alike and leaves the other slides\' answers held', () => {
    const small = '<!-- _class: lead -->\n\n# Hello';
    const held = readMetaField(small, 'class');
    const photoSlide = `<!-- _class: image -->\n\n## Photo\n\n![bg](${photo(2_000_000)})`;
    const a = readMetaField(photoSlide, 'class');
    assert.equal(a.value, 'image');
    assert.ok(Object.isFrozen(a) && Object.isFrozen(a.valueSpan), 'frozen like a held answer');
    assert.deepEqual(readMetaField(photoSlide, 'class'), a);
    assert.equal(readMetaField(small, 'class'), held, 'the small slide is still a hit, the same object');
  });

  test('readRecord: a record too large to hold reads alike, frozen', () => {
    const body = ` {layout=image, footer="${photo(400_000)}"} `;
    const r = readRecord(body);
    assert.ok(r && Object.isFrozen(r) && Object.isFrozen(r.d));
    assert.deepEqual(readRecord(body), r);
  });
});
