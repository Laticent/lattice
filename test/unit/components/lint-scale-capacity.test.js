/**
 * Unit: the projection-font-scale rules in lib/authoring/lint-core.js —
 * `capacity-scale` for a counted component and for a `code` block
 * (engineering/decisions/2026-09-25-font-scale-fit.md).
 *
 * What is pinned, and why:
 *   · the rules are SILENT at the designed size, so nothing in the 250-deck corpus
 *     changes unless it asks for a scale;
 *   · the deck-wide front-matter `class:` counts, not only a slide's own `_class:`
 *     (the engine appends it to every section — the case the repro deck uses);
 *   · the budget read is the one measured for the slide's element LENGTH, so four
 *     one-line cards are not judged as four paragraphs;
 *   · `info`, never `warning`: the engine steps the slide and nothing is cut, and a
 *     warning would red `lint:deck:all --strict` for a slide that renders whole;
 *   · the code pane's line budget moves with the scale AND with an eyebrow.
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

const vocab = {
  names: new Set(['list-steps', 'code']),
  modifiers: new Set(['scale-l', 'scale-xl', 'scale-2xl', 'compact']),
  capacity: {
    'list-steps': { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5, escalateTo: ['timeline-list', 'split across slides'] },
  },
};
const lint = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'capacity-scale');
const deck = (fmClass, body) => `---\nmarp: true\n${fmClass ? `class: ${fmClass}\n` : ''}---\n\n${body}`;
const long = 'reads the ticket and plans the change before anyone asks it to';
const steps = (n, body = long) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - ${body}\n`).join('');
const slide = (cls, n, body) => `<!-- _class: ${cls} -->\n\n## Heading.\n\n${steps(n, body)}`;

describe('capacity-scale — a counted component', () => {
  const xl = core.SCALE_CAPACITY['list-steps'];
  const longCol = Math.max(...Object.keys(xl).map(Number));
  const ceilXl = xl[longCol][2];

  test('silent at the designed size, however full the slide', () => {
    assert.deepEqual(lint(deck(null, slide('list-steps', 5))), []);
  });

  test('past the scale-xl budget → one info finding naming both budgets', () => {
    const out = lint(deck(null, slide('list-steps scale-xl', ceilXl + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'info');
    assert.equal(out[0].classToken, 'list-steps');
    assert.match(out[0].message, new RegExp(`scale-xl \\(1\\.3x\\) 'list-steps' holds about ${ceilXl} items`));
    assert.match(out[0].message, /at the designed size/);
    assert.match(out[0].message, /SCALE line/);
  });

  test('within the budget → silent', () => {
    assert.deepEqual(lint(deck(null, slide('list-steps scale-xl', ceilXl))), []);
  });

  test('a deck-wide front-matter class scales a slide that names only its component', () => {
    assert.equal(lint(deck('scale-xl', slide('list-steps', ceilXl + 1))).length, 1);
  });

  test('the LARGEST scale token wins, as it does in the stylesheet', () => {
    assert.equal(core.fontScaleKey(['scale-2xl', 'scale-l']), '2xl');
    assert.equal(core.fontScaleKey(['list-steps', 'scale-l']), 'l');
    assert.equal(core.fontScaleKey(['list-steps']), null);
  });

  test('short elements are judged at the label length, not the paragraph length', () => {
    const shortCol = Math.min(...Object.keys(xl).map(Number));
    const n = xl[longCol][2] + 1;
    assert.ok(n <= xl[shortCol][2], 'fixture: the label budget must hold what the paragraph budget does not');
    assert.deepEqual(lint(deck('scale-xl', slide('list-steps', n, 'plans it'))), []);
  });

  test('past the DESIGNED-size budget too, it says a step cannot save the slide', () => {
    // authority-chain: measured 4 at the designed size, declared hard 6 — the gap the
    // designed column exists for.
    const row = core.SCALE_CAPACITY['authority-chain'];
    const len = Math.max(...Object.keys(row).map(Number));
    const designed = row[len][0];
    const v = { ...vocab, names: new Set([...vocab.names, 'authority-chain']),
      capacity: { ...vocab.capacity, 'authority-chain': { axis: 'item', min: 2, sweet: 4, soft: 5, hard: 6, escalateTo: ['statute-stack'] } } };
    const src = deck('scale-xl', slide('authority-chain', designed + 1));
    const out = core.lintTextWith(src, v).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /even at the designed size/);
    assert.match(out[0].message, /cannot save it and it is clipped/);
  });

  test('past `hard` it is the overflow rule\'s slide, not this one', () => {
    assert.deepEqual(lint(deck('scale-xl', slide('list-steps', 6))), []);
  });

  test('a stress-slide specimen is left alone, as the engine leaves it', () => {
    assert.deepEqual(lint(deck('scale-xl', `${slide('list-steps', ceilXl + 1)}\n<!-- stress-slide -->\n`)), []);
  });

  test('portrait decks say nothing — the split owns them there', () => {
    const src = `---\nmarp: true\nsize: portrait\nclass: scale-xl\n---\n\n${slide('list-steps', ceilXl + 1)}`;
    assert.deepEqual(lint(src), []);
  });
});

describe('capacity-scale — a code block', () => {
  const block = (n) => '```js\n' + Array.from({ length: n }, (_, i) => `const v${i} = f(${i});`).join('\n') + '\n```\n';
  const code = (n, eyebrow = false) => `<!-- _class: code -->\n\n${eyebrow ? '`Kit · 1 of 7`\n\n' : ''}## Heading.\n\n${block(n)}`;
  const [, , bareXl] = core.CODE_LINES_AT_SCALE.bare;
  const [, , browXl] = core.CODE_LINES_AT_SCALE.eyebrow;

  test('the designed-size pane is never judged here', () => {
    assert.deepEqual(lint(deck(null, code(15))), []);
  });

  test('past the scale-xl line budget → info, with the budget in the fix', () => {
    const out = lint(deck('scale-xl', code(bareXl + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'info');
    assert.match(out[0].message, new RegExp(`${bareXl + 1} lines \\(the pane holds about ${bareXl}\\)`));
    assert.match(out[0].fix, new RegExp(`${bareXl} lines of 78 columns`));
    assert.deepEqual(lint(deck('scale-xl', code(bareXl))), []);
  });

  test('a block past the DESIGNED pane clips at every scale — a warning, never "nothing is clipped"', () => {
    const out = lint(deck('scale-xl', code(30)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /cannot fit it — the slide is clipped/);
    assert.doesNotMatch(out[0].message, /nothing is clipped/);
  });

  test('an eyebrow costs the pane its measured line', () => {
    assert.ok(browXl < bareXl);
    assert.equal(lint(deck('scale-xl', code(browXl + 1, true))).length, 1);
  });

  test('a line past the scaled column budget, but inside the designed one, is named', () => {
    const wide = '```js\n' + 'x'.repeat(90) + '\n```\n';
    const out = lint(deck('scale-xl', `<!-- _class: code -->\n\n## H.\n\n${wide}`));
    assert.equal(out.length, 1);
    assert.match(out[0].message, /a 90-column line \(the pane holds about 78\)/);
  });

  test('tallestCodeBlock counts the longest fence, unclosed included', () => {
    assert.equal(core.tallestCodeBlock('```\na\nb\n```\n\n~~~\nc\n~~~'), 2);
    assert.equal(core.tallestCodeBlock('```\na\nb\nc'), 3);
    assert.equal(core.tallestCodeBlock('no fence'), 0);
  });
});
