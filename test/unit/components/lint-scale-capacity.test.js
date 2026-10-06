/**
 * Unit: the projection-font-scale rules in lib/authoring/lint-core.js —
 * `capacity-scale` for a counted component and for a `code` block
 * (engineering/decisions/2026-09-25-font-scale-fit.md).
 *
 * What is pinned, and why:
 *   · the rules are SILENT at the designed size for a component with a `capacity` block
 *     (its crowd / overflow rules own that size); a component with none (list-tabular,
 *     glossary) is judged at its measured laptop row, or nothing would count its rows;
 *   · the deck-wide front-matter `class:` counts, not only a slide's own `_class:`
 *     (the engine appends it to every section — the case the repro deck uses);
 *   · the budget read is the one measured for the slide's element LENGTH, so four
 *     one-line cards are not judged as four paragraphs;
 *   · both are a FIXED size the engine never shrinks to fit (owner ruling 2026-09-27), so the
 *     message says the slide clips; `warning` under a `venue:` (the owner's "warn"), `info` for a
 *     bare `scale-*`, whose budget still misjudges committed decks that render whole;
 *   · the fix offers the next size down, for the whole deck, when a smaller size would help,
 *     and only a split when the slide is over budget even at the designed size;
 *   · the code pane's line budget moves with the scale AND with an eyebrow;
 *   · a list or card register with measured LINE geometry (list, cards-grid, list-steps) is judged
 *     by the lines its text wraps to, not by a count row (Amendment (7)).
 */
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const core = require('../../../lib/authoring/lint-core');

// The COUNT-ROW fixture is `cycle`: its rows are word rows, and its items are a title over a body,
// the shape these tests were written in. `list-steps`, `list` and `cards-grid` are judged by lines
// (Amendment (7), pinned at the end of this file), and so are `cycle` and `compare-prose` since
// Amendment (9). So the fixture decks carry `logo:`, a front-matter key outside the line model's
// allowlist, which keeps every slide on its count row (Amendment (7), "the front matter is part of
// the choice too"); the line verdicts for both are pinned in their own block below.
const vocab = {
  names: new Set(['cycle', 'code']),
  modifiers: new Set(['scale-l', 'scale-xl', 'scale-2xl', 'compact']),
  capacity: {
    cycle: { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5, escalateTo: ['list-steps', 'split across slides'] },
  },
};
const lint = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'capacity-scale');
const deck = (fmClass, body) => `---\nmarp: true\nlogo: logo.svg\n${fmClass ? `class: ${fmClass}\n` : ''}---\n\n${body}`;
const long = 'reads the ticket and plans the change before anyone asks it to';
const steps = (n, body = long) => Array.from({ length: n }, (_, i) => `- Step ${i + 1}\n  - ${body}\n`).join('');
const slide = (cls, n, body) => `<!-- _class: ${cls} -->\n\n## Heading.\n\n${steps(n, body)}`;

describe('capacity-scale — a counted component', () => {
  const xl = core.SCALE_CAPACITY.cycle;
  const longCol = Math.max(...Object.keys(xl).map(Number));
  const ceilXl = xl[longCol][2];

  test('silent at the designed size, however full the slide', () => {
    assert.deepEqual(lint(deck(null, slide('cycle', 5))), []);
  });

  test('past the scale-xl budget → one info finding naming both budgets and the clip', () => {
    const out = lint(deck(null, slide('cycle scale-xl', ceilXl + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'info');
    assert.equal(out[0].classToken, 'cycle');
    assert.match(out[0].message, new RegExp(`At \`scale-xl\` 'cycle' fits about ${ceilXl} items`));
    assert.match(out[0].message, /so some may be cut off/);
    assert.match(out[0].fix, /(use `scale-l`|drop the `scale-\*` class)\./);
  });

  test('within the budget → silent', () => {
    assert.deepEqual(lint(deck(null, slide('cycle scale-xl', ceilXl))), []);
  });

  test('a deck-wide front-matter class scales a slide that names only its component', () => {
    assert.equal(lint(deck('scale-xl', slide('cycle', ceilXl + 1))).length, 1);
  });

  test('the LARGEST scale token wins, as it does in the stylesheet', () => {
    assert.equal(core.fontScaleKey(['scale-2xl', 'scale-l']), '2xl');
    assert.equal(core.fontScaleKey(['cycle', 'scale-l']), 'l');
    assert.equal(core.fontScaleKey(['cycle']), null);
  });

  test('short elements are judged at the label length, not the paragraph length', () => {
    const shortCol = Math.min(...Object.keys(xl).map(Number));
    const n = xl[longCol][2] + 1;
    assert.ok(n <= xl[shortCol][2], 'fixture: the label budget must hold what the paragraph budget does not');
    assert.deepEqual(lint(deck('scale-xl', slide('cycle', n, 'plans it'))), []);
  });

  test('past the DESIGNED-size row of a render-checked component, it says a smaller size cannot save the slide', () => {
    // premise is LAPTOP_JUDGED: its laptop row was checked against a render (6 rows of 14 words
    // fit, 7 clip), and its `hard` (8) sits above that row.
    const designed = core.SCALE_CAPACITY.premise['14'][0];
    const v = { ...vocab, names: new Set([...vocab.names, 'premise']),
      capacity: { ...vocab.capacity, premise: { axis: 'item', min: 3, sweet: 4, soft: 6, hard: 8 } } };
    const rows = Array.from({ length: designed + 1 }, (_, i) => `1. Term ${i}\n   - A clause of about nine words that frames row ${i}.\n   - Why it matters?`).join('\n');
    const out = core.lintTextWith(deck('scale-xl', `<!-- _class: premise -->\n\n## H.\n\n${rows}\n`), v).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /even at laptop size/);
    assert.match(out[0].message, /so some are cut off/);
    assert.match(out[0].fix, /^Split the slide/);
    assert.doesNotMatch(out[0].fix, /scale-l/);
  });

  test('a row the rig measured but no render checked at 1x never claims a designed-size clip', () => {
    // authority-chain: measured 4 at the designed size, declared hard 6, and a shape that reaches 6
    // is recorded (2026-07-28-capacity-basis.md). gallery.md's four-tile `kpi` slide is the real
    // case: its 3-tile row called it "clipped at any size" and the laptop export renders it whole.
    const row = core.SCALE_CAPACITY['authority-chain'];
    const len = Math.max(...Object.keys(row).map(Number));
    const designed = row[len][0];
    const v = { ...vocab, names: new Set([...vocab.names, 'authority-chain']),
      capacity: { ...vocab.capacity, 'authority-chain': { axis: 'item', min: 2, sweet: 4, soft: 5, hard: 6, escalateTo: ['statute-stack'] } } };
    const src = deck('scale-xl', slide('authority-chain', designed + 1));
    const out = core.lintTextWith(src, v).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.doesNotMatch(out[0].message, /even at laptop size/);
    assert.match(out[0].message, /so some may be cut off/);
  });

  test('past `hard` it is the overflow rule\'s slide, not this one', () => {
    assert.deepEqual(lint(deck('scale-xl', slide('cycle', 6))), []);
  });

  test('a stress-slide specimen is left alone, as the engine leaves it', () => {
    assert.deepEqual(lint(deck('scale-xl', `${slide('cycle', ceilXl + 1)}\n<!-- stress-slide -->\n`)), []);
  });

  test('portrait decks say nothing — the split owns them there', () => {
    const src = `---\nmarp: true\nsize: portrait\nclass: scale-xl\n---\n\n${slide('cycle', ceilXl + 1)}`;
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
    assert.match(out[0].message, /, so it is cut off\./);
    assert.match(out[0].message, new RegExp(`${bareXl + 1} lines \\(the pane holds about ${bareXl}\\)`));
    // A spot `scale-xl` carries no code lift (only a venue sets one): 102 ÷ 1.3 = 78.
    assert.match(out[0].fix, new RegExp(`${bareXl} lines of 78 characters`));
    assert.deepEqual(lint(deck('scale-xl', code(bareXl))), []);
  });

  test('a block past the DESIGNED pane clips at every scale — a warning, never "nothing is clipped"', () => {
    const out = lint(deck('scale-xl', code(30)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /so it is cut off at any size/);
    assert.doesNotMatch(out[0].message, /nothing is clipped/);
  });

  test('a heading that wraps costs the pane its measured lines, per room (the talk\'s starter kit at huddle)', () => {
    // The talk's slide 79: an eyebrow, a 70-character heading lint wraps to two lines at huddle, and
    // a ten-line block. It fits the one-line eyebrow row (11) and clips in the export (rendered, 4k).
    const head = 'The settings file turns the reach test into allow, ask and deny lists.';
    const slide79 = `<!-- _class: code -->\n\n\`Starter kit · 2 of 7\`\n\n## ${head}\n\n${block(10)}`;
    const two = core.CODE_LINES_AT_SCALE.headed['2'].eyebrow[1];
    assert.ok(two < 10 && core.CODE_LINES_AT_SCALE.eyebrow[1] >= 10, 'fixture: inside the one-line row, past the two-line one');
    const [f] = lint(deck('venue-huddle', slide79));
    assert.match(f.message, new RegExp(`10 lines \\(the pane holds about ${two}\\)`));
    // The same block under a one-line heading is silent.
    assert.deepEqual(lint(deck('venue-huddle', `<!-- _class: code -->\n\n\`Starter kit · 2 of 7\`\n\n## Short.\n\n${block(10)}`)), []);
  });

  test('compare-code is judged by its own rows: the taller block, with its callout (the talk\'s slide 9)', () => {
    const cc = { ...vocab, names: new Set([...vocab.names, 'compare-code']) };
    const pair = (n, m, end = '') => `<!-- _class: compare-code -->\n\n\`Your role · Declare the outcome\`\n\n## Declare the outcome.\n\n\`Tells it how\`\n\n${block(n)}\n\`Declares what\`\n\n${block(m)}${end}`;
    const rows = core.VENUE_CAPACITY.compareCode;
    const hall = rows.eyebrowInsight[3];
    const run = (src) => core.lintTextWith(src, cc).filter((f) => f.rule === 'capacity-scale');
    // The taller block counts, and a callout costs the pane its measured lines.
    assert.equal(run(deck('venue-hall', pair(3, hall + 1, '\n> The schema outlives the code.\n'))).length, 1);
    assert.deepEqual(run(deck('venue-hall', pair(3, hall, '\n> The schema outlives the code.\n'))), []);
    // No column budget: compare-code's does not scale by division at a venue (talk slide 36).
    const wide = '```js\n' + 'x'.repeat(45) + '\n```\n';
    assert.deepEqual(run(deck('venue-huddle', `<!-- _class: compare-code -->\n\n## H.\n\n\`A\`\n\n${wide}\n\`B\`\n\n${wide}`)), []);
  });

  test('an eyebrow costs the pane its measured line', () => {
    assert.ok(browXl < bareXl);
    assert.equal(lint(deck('scale-xl', code(browXl + 1, true))).length, 1);
  });

  test('a trailing callout costs the pane its measured lines, and never claims a 1x clip', () => {
    const [, , calloutXl] = core.CODE_LINES_AT_SCALE.insight;
    const [, , browCalloutXl] = core.CODE_LINES_AT_SCALE.eyebrowInsight;
    assert.ok(calloutXl < bareXl && browCalloutXl < browXl);
    const withCallout = (n, eyebrow) => `${code(n, eyebrow)}\n> The line to remember.\n`;
    assert.deepEqual(lint(deck('scale-xl', code(calloutXl + 1))), [], 'without the callout it fits');
    const out = lint(deck('scale-xl', withCallout(calloutXl + 1)));
    assert.equal(out.length, 1);
    assert.match(out[0].message, new RegExp(`the pane holds about ${calloutXl} with the callout`));
    assert.doesNotMatch(out[0].message, /designed size/);
    assert.deepEqual(lint(deck('scale-xl', withCallout(calloutXl))), []);
    assert.equal(lint(deck('scale-xl', withCallout(browCalloutXl + 1, true))).length, 1);
  });

  test('a block the callout pushes past the designed-size pane is never sent to a smaller venue', () => {
    const [calloutOne] = core.CODE_LINES_AT_SCALE.insight;
    const [bareOne] = core.CODE_LINES_AT_SCALE.bare;
    assert.ok(calloutOne < bareOne);
    const out = lint(`---\nmarp: true\nvenue: conference\n---\n\n${code(calloutOne + 1)}\n> The line to remember.\n`);
    assert.equal(out.length, 1);
    assert.doesNotMatch(out[0].fix, /venue: laptop/);
    assert.match(out[0].fix, /speaker notes/);
    assert.doesNotMatch(out[0].message, /designed size/, 'the 1x clip claim stays on the row without the callout');
  });

  test('a line past the scaled column budget, but inside the designed one, is named', () => {
    const wide = '```js\n' + 'x'.repeat(90) + '\n```\n';
    const out = lint(deck('scale-xl', `<!-- _class: code -->\n\n## H.\n\n${wide}`));
    assert.equal(out.length, 1);
    assert.match(out[0].message, /a 90-character line \(the pane holds about 78\)/);
  });

  test('in a venue the code lift narrows the pane: 68 columns at conference, 59 at hall', () => {
    // 102 ÷ (1.3 × 1.15) = 68 and 102 ÷ (1.5 × 1.14) = 59 (`--venue-compact-lift`, 2026-09-29).
    const cols73 = '```js\n' + 'x'.repeat(73) + '\n```\n';
    const at = (venue) => core.lintTextWith(`---\nmarp: true\nvenue: ${venue}\n---\n\n<!-- _class: code -->\n\n## H.\n\n${cols73}`, vocab).filter((f) => f.rule === 'capacity-scale');
    const conf = at('conference');
    assert.equal(conf.length, 1);
    assert.match(conf[0].message, /a 73-character line \(the pane holds about 68\)/);
    const hall = at('hall');
    assert.equal(hall.length, 1);
    assert.match(hall[0].message, /a 73-character line \(the pane holds about 59\)/);
    // A 73-column line clips at conference too, so the hall fix must not offer it.
    assert.doesNotMatch(hall[0].fix, /venue: conference/);
  });

  test('a spot `scale-xl` on a laptop deck gets no code lift, so a 73-column line fits', () => {
    const cols73 = '```js\n' + 'x'.repeat(73) + '\n```\n';
    const out = lint(deck('scale-xl', `<!-- _class: code -->\n\n## H.\n\n${cols73}`));
    assert.deepEqual(out, []);
  });

  test('tallestCodeBlock counts the longest fence, unclosed included', () => {
    assert.equal(core.tallestCodeBlock('```\na\nb\n```\n\n~~~\nc\n~~~'), 2);
    assert.equal(core.tallestCodeBlock('```\na\nb\nc'), 3);
    assert.equal(core.tallestCodeBlock('no fence'), 0);
  });
});

describe('the fit: register in lint', () => {
  const v = { names: new Set(['cycle']), modifiers: new Set(), fitNames: ['report', 'heal', 'trim'],
    capacity: { cycle: { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5 } } };
  const rules = (src) => core.lintTextWith(src, v);

  test('an unknown fit: value is a warning — `reprot` would silently leave the engine on', () => {
    const f = rules(deck(null, '## x\n').replace('marp: true', 'marp: true\nfit: reprot')).find((x) => x.rule === 'unknown-fit');
    assert.equal(f?.severity, 'warning');
  });

  test('the old guards: spelling is named, pointing at the new value', () => {
    const f = rules(deck(null, '## x\n').replace('marp: true', 'marp: true\nguards: strict')).find((x) => x.rule === 'guards-renamed');
    assert.equal(f?.severity, 'info');
    assert.match(f.fix, /fit: trim/);
  });

  test('an unknown old guards: value is one guards-renamed warning (unknown-guards was folded in)', () => {
    const out = rules(deck(null, '## x\n').replace('marp: true', 'marp: true\nguards: strct'));
    assert.deepEqual(out.filter((x) => /guards/.test(x.rule)).map((x) => [x.rule, x.severity]), [['guards-renamed', 'warning']]);
    // With `fit:` present, `fit:` decides, so the old line is only a note.
    const both = rules(deck(null, '## x\n').replace('marp: true', 'marp: true\nfit: trim\nguards: strct'));
    assert.equal(both.find((x) => x.rule === 'guards-renamed')?.severity, 'info');
  });

  test('fit: report changes nothing about the scale finding: no fit level changes the size', () => {
    const row = core.SCALE_CAPACITY.cycle;
    const len = Math.max(...Object.keys(row).map(Number));
    const n = row[len][2] + 1;
    if (n > 5) return; // needs a count inside `hard`
    const src = deck('scale-xl', slide('cycle', n)).replace('marp: true', 'marp: true\nfit: report');
    const f = rules(src).find((x) => x.rule === 'capacity-scale');
    assert.equal(f?.severity, 'info');
    assert.doesNotMatch(f.message, /fit: report/);
  });

  test('a slide\'s own fit-heal changes nothing: no fit level shrinks a slide', () => {
    const row = core.SCALE_CAPACITY.cycle;
    const len = Math.max(...Object.keys(row).map(Number));
    const n = row[len][2] + 1;
    if (n > 5) return;
    const src = deck('scale-xl', slide('cycle fit-heal', n)).replace('marp: true', 'marp: true\nfit: report');
    assert.equal(rules(src).find((x) => x.rule === 'capacity-scale')?.severity, 'info');
  });
});

describe('capacity-scale — under a venue', () => {
  const venueDeck = (venue, body) => `---\nmarp: true\nvenue: ${venue}\n---\n\n${body}`;
  const xl = core.SCALE_CAPACITY.cycle;
  const longCol = Math.max(...Object.keys(xl).map(Number));

  test('venue: conference reads the scale-xl budget and warns', () => {
    const out = lint(venueDeck('conference', slide('cycle', xl[longCol][2] + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /At conference size/);
    assert.match(out[0].fix, /set `venue: (huddle|laptop)`/);
  });

  test('the smaller size it names is the LARGEST whose budget holds the slide, never one that still clips', () => {
    const row = xl[longCol]; // [designed, l, xl, 2xl]
    const names = ['laptop', 'huddle', 'conference', 'hall'];
    for (let n = row[3] + 1; n <= Math.min(row[0], 5); n++) {
      const out = lint(venueDeck('hall', slide('cycle', n)));
      const want = names[[2, 1, 0].find((i) => n <= row[i])];
      assert.match(out[0].fix, new RegExp(`set \`venue: ${want}\``), `${n} items at hall → ${want}`);
    }
  });

  test('venue: hall reads the scale-2xl budget and asks for fewer words', () => {
    const out = lint(venueDeck('hall', slide('cycle', xl[longCol][3] + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /At hall size/);
    assert.match(out[0].fix, /At hall size, carry fewer words/);
  });

  test('venue: laptop, and an unknown venue, are the designed size — silent', () => {
    assert.deepEqual(lint(venueDeck('laptop', slide('cycle', 5))), []);
    assert.deepEqual(lint(venueDeck('stadium', slide('cycle', 5))), []);
  });

  test('a code block over the pane at a venue warns', () => {
    const code = '```js\n' + Array.from({ length: 12 }, (_, i) => `x${i}();`).join('\n') + '\n```\n';
    const out = lint(venueDeck('conference', `<!-- _class: code -->\n\n## Heading.\n\n${code}`));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
  });
});

describe('capacity-scale — a slide that names its own venue', () => {
  test('is judged at its own venue, not the deck\'s, as the renderer evicts the deck token', () => {
    const src = `---\nmarp: true\nvenue: hall\n---\n\n${slide('cycle venue-huddle', 5)}`;
    const out = lint(src);
    assert.ok(out.every((f) => !/At hall size/.test(f.message)), 'never judged at the hall scale');
    assert.ok(out.every((f) => !/At hall size/.test(f.fix)));
  });
});

describe('unknown-venue', () => {
  const run = (src) => core.lintTextWith(src, { ...vocab, venueNames: ['laptop', 'huddle', 'conference', 'hall'] })
    .filter((f) => f.rule === 'unknown-venue');
  test('a typo is a warning naming the four venues', () => {
    const out = run('---\nmarp: true\nvenue: auditorium\n---\n\n# x\n');
    assert.equal(out.length, 1);
    assert.match(out[0].fix, /laptop, huddle, conference, hall/);
  });
  test('a value with a space is unknown too', () => {
    assert.equal(run('---\nmarp: true\nvenue: big hall\n---\n\n# x\n').length, 1);
  });
  test('a known venue, any case, is silent', () => {
    assert.deepEqual(run('---\nmarp: true\nvenue: Conference\n---\n\n# x\n'), []);
  });
});

describe('capacity-scale — the row a real slide is judged by (#2361 P2)', () => {
  // `logo:` keeps the count rows (see `deck` above).
  const venueDeck = (venue, body) => `---\nmarp: true\nlogo: logo.svg\nvenue: ${venue}\n---\n\n${body}`;
  const v = { names: new Set(['cards-stack', 'cycle']), modifiers: new Set(['compact', 'insight-so-what']),
    capacity: { 'cards-stack': { axis: 'item', min: 2, sweet: 3, soft: 4, hard: 5 }, cycle: { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5 } } };
  const run = (src) => core.lintTextWith(src, v).filter((f) => f.rule === 'capacity-scale');

  test('word lengths between two measured columns are interpolated, not rounded up', () => {
    const map = { 6: [6, 5, 5, 4], 14: [3, 3, 3, 2] };
    assert.equal(core.wordMapAt(map, 10, 0), 4); // 6 + (3 - 6) * 4 / 8 = 4.5 → 4
    assert.equal(core.wordMapAt(map, 6, 0), 6);
    assert.equal(core.wordMapAt(map, 20, 3), 2);
    assert.equal(core.wordMapAt(map, 3, 1), 5);
  });

  test('a variant with its own measured row is judged by it: cards-stack compact holds more than cards-stack', () => {
    const cards = (n) => Array.from({ length: n }, (_, i) => `- Card ${i + 1}\n  - plans the change first.`).join('\n');
    const bare = run(venueDeck('conference', `<!-- _class: cards-stack -->\n\n## H.\n\n${cards(4)}\n`));
    const compact = run(venueDeck('conference', `<!-- _class: cards-stack compact -->\n\n## H.\n\n${cards(4)}\n`));
    assert.equal(bare.length, 1, 'bare cards-stack at 6 words holds 3 at conference');
    assert.deepEqual(compact, [], 'cards-stack compact at 6 words holds 4 at conference');
  });

  test('an insight callout costs the slide its measured elements', () => {
    const steps = (n) => Array.from({ length: n }, (_, i) => `- Stage ${i + 1}\n  - reads the ticket and plans the change before anyone asks it\n`).join('');
    const plain = run(venueDeck('conference', `<!-- _class: cycle -->\n\n## H.\n\n${steps(3)}`));
    const withCallout = run(venueDeck('conference', `<!-- _class: cycle insight-so-what -->\n\n## H.\n\n${steps(3)}\n> The line to remember.\n`));
    assert.deepEqual(plain, [], 'three stages fit at conference');
    assert.equal(withCallout.length, 1, 'with a callout, conference holds two');
    assert.match(withCallout[0].message, /'cycle with its callout' fits about 2 items/);
  });

  test('the callout is the trailing blockquote, not the insight-* class that relabels it', () => {
    const steps = (n) => Array.from({ length: n }, (_, i) => `- Stage ${i + 1}\n  - reads the ticket and plans the change before anyone asks it\n`).join('');
    assert.deepEqual(run(venueDeck('conference', `<!-- _class: cycle insight-so-what -->\n\n## H.\n\n${steps(3)}`)), [], 'a class with no blockquote costs nothing');
    assert.equal(run(venueDeck('conference', `<!-- _class: cycle -->\n\n## H.\n\n${steps(3)}\n> Key insight.\n`)).length, 1, 'a bare blockquote is a callout');
    assert.equal(core.endsWithCallout('## H.\n\n```\n> not a quote\n```\n'), false);
    assert.equal(core.endsWithCallout('## H.\n\n<!--\n> a note\n-->'), false);
  });

  test('a component with a venue row but no capacity block is judged, and never claims a 1x clip', () => {
    const vv = { names: new Set(['compare-prose']), modifiers: new Set(['vertical']), capacity: {} };
    const side = (t) => `- ${t}\n  - ${Array.from({ length: 18 }, (_, i) => `w${i}`).join(' ')}.`;
    const src = `---\nmarp: true\nlogo: logo.svg\nvenue: hall\n---\n\n<!-- _class: compare-prose vertical -->\n\n## H.\n\n${side('A')}\n${side('B')}\n\n> The line to remember.\n`;
    const out = core.lintTextWith(src, vv).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'compare-prose vertical with its callout'/);
    assert.doesNotMatch(out[0].message, /designed size/);
    assert.deepEqual(core.lintTextWith(src.replace('venue: hall\n', ''), vv).filter((f) => f.rule === 'capacity-scale'), []);
  });

  test('a variant measured with its callout is judged by that row: compare-prose vertical with a callout', () => {
    // compare-prose vertical at 12 words holds 2 at conference, and 1 with a trailing callout (measured).
    const vv = { names: new Set(['compare-prose']), modifiers: new Set(['vertical']), capacity: {} };
    const side = (t) => `- ${t}\n  - ${Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ')}.`;
    const at = (body) => core.lintTextWith(venueDeck('conference', `<!-- _class: compare-prose vertical -->\n\n## H.\n\n${body}`), vv).filter((f) => f.rule === 'capacity-scale');
    assert.deepEqual(at(`${side('A')}\n${side('B')}\n`), []);
    const out = at(`${side('A')}\n${side('B')}\n\n> The line to remember.\n`);
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'compare-prose vertical with its callout' fits about 1/);
  });

  test('a variant finding names the variant row it quotes', () => {
    const vv = { names: new Set(['compare-prose']), modifiers: new Set(['vertical']), capacity: {} };
    const side = (t) => `- ${t}\n  - ${Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ')}.`;
    const out = core.lintTextWith(venueDeck('conference', `<!-- _class: compare-prose vertical -->\n\n## H.\n\n${side('A')}\n${side('B')}\n${side('C')}\n`), vv).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'compare-prose vertical' fits about 2/);
  });
});

describe('spot-scale — a scale or venue on some slides, not the deck', () => {
  const rules = (src) => core.lintTextWith(src, { names: new Set(['list']), modifiers: new Set() }).filter((f) => f.rule === 'spot-scale');
  const one = (cls, fm = '') => `---\nmarp: true\n${fm}---\n\n<!-- _class: list ${cls} -->\n\n## H.\n\n- a\n\n---\n\n<!-- _class: list -->\n\n## H2.\n\n- b\n`;

  test('a spot venue-* is a warning naming the front-matter fix', () => {
    const out = rules(one('venue-conference'));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.equal(out[0].slide, 1);
    assert.match(out[0].fix, /venue: conference/);
  });

  test('a spot scale-* is info', () => {
    assert.equal(rules(one('scale-xl'))[0].severity, 'info');
  });

  test('a token the deck already carries is not spot', () => {
    assert.deepEqual(rules(one('venue-hall', 'venue: hall\n')), []);
    assert.deepEqual(rules(one('scale-xl', 'class: scale-xl\n')), []);
    assert.deepEqual(rules(one('')), []);
  });
});

describe('withCompact — a budget that knows `compact` (#2361 P3)', () => {
  const qa = require('../../../lib/components/inventory/q-and-a/q-and-a.manifest.json').capacity;
  const v = { names: new Set(['q-and-a']), modifiers: new Set(['compact']), capacity: { 'q-and-a': qa } };
  const pairs = (n) => Array.from({ length: n }, (_, i) => `- Question ${i + 1}?\n  - A short answer.`).join('\n');
  const run = (cls, n) => core.lintTextWith(`---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## H.\n\n${pairs(n)}\n`, v).filter((f) => /^capacity-/.test(f.rule));

  test('a bare five-pair q-and-a is named, and the fix points at compact', () => {
    const out = run('q-and-a', 5);
    assert.equal(out.length, 1);
    assert.equal(out[0].rule, 'capacity-overflow');
    assert.match(out[0].fix, /add `compact`, which fits 5/);
  });

  test('the same five pairs with compact are silent', () => {
    assert.deepEqual(run('q-and-a compact', 5), []);
  });

  test('past what compact holds, the fix does not offer it', () => {
    const out = run('q-and-a', 6);
    assert.equal(out.length, 1);
    assert.doesNotMatch(out[0].fix, /Add `compact`/);
  });
});

describe('withCompact at a venue', () => {
  const qa = require('../../../lib/components/inventory/q-and-a/q-and-a.manifest.json').capacity;
  const v = { names: new Set(['q-and-a']), modifiers: new Set(['compact']), capacity: { 'q-and-a': qa } };
  const pairs = (n) => Array.from({ length: n }, (_, i) => `- Question ${i + 1}?\n  - A short answer.`).join('\n');
  // Six pairs: one past even the compact row at huddle (bare 4, compact 5; re-measured 2026-09-29).
  const run = (cls) => core.lintTextWith(`---\nmarp: true\nvenue: huddle\n---\n\n<!-- _class: ${cls} -->\n\n## H.\n\n${pairs(6)}\n`, v).filter((f) => /^capacity-/.test(f.rule));

  test('the compact hint is not offered where compact would still be over the venue budget', () => {
    for (const f of run('q-and-a')) assert.doesNotMatch(f.fix, /Add `compact`/);
  });

  test('a compact slide its compact budget holds never claims a clip at the designed size', () => {
    for (const f of run('q-and-a compact')) assert.doesNotMatch(f.message, /designed size/);
  });

  test('a compact slide is judged by the measured compact row, not the bare one', () => {
    // At conference q-and-a bare holds 3 and compact 4 (calibrate-capacity --variant compact,
    // re-measured 2026-09-29 with questions at --fs-body and titles scaling; huddle's rows meet
    // the component's `hard` of 4, which caps both, so conference is where they differ).
    const conf = (n) => core.lintTextWith(`---\nmarp: true\nvenue: conference\n---\n\n<!-- _class: q-and-a compact -->\n\n## H.\n\n${pairs(n)}\n`, v).filter((f) => f.rule === 'capacity-scale');
    const out = conf(5);
    assert.equal(out.length, 1, 'five pairs are one past the compact conference row');
    assert.match(out[0].message, /'q-and-a compact' fits about 4/);
    assert.deepEqual(conf(4), [], 'four compact pairs fit at conference, where the bare row said 3');
  });
});

describe('venue-only rows count on their own axis', () => {
  test('obligation-matrix counts table rows: 7 fit at laptop, 4 at hall', () => {
    const v = { names: new Set(['obligation-matrix']), modifiers: new Set(), capacity: {} };
    const rows = (n) => Array.from({ length: n }, (_, i) => `| Regime ${i + 1} | [x] | [-] | [x] | [x] | [/] |`).join('\n');
    const deck = (venue, n) => `---\nmarp: true\n${venue ? `venue: ${venue}\n` : ''}---\n\n<!-- _class: obligation-matrix -->\n\n## H.\n\n| Regulation | Notice | Consent | Retention | Breach | DSAR |\n| --- | :-: | :-: | :-: | :-: | :-: |\n${rows(n)}\n`;
    const run = (venue, n) => core.lintTextWith(deck(venue, n), v).filter((f) => f.rule === 'capacity-scale');
    assert.deepEqual(run('hall', 4), []);
    assert.equal(run('hall', 5).length, 1);
    assert.match(run('hall', 5)[0].message, /fits about 4 rows/);
  });
});

test('endsWithCallout tracks comments by state, including a second comment left open on a line', () => {
  assert.equal(core.endsWithCallout('<!-- a --> <!-- b\n> inside a comment\n-->'), false);
  assert.equal(core.endsWithCallout('## H.\n\n<!-- note -->\n> The line.'), true);
});

describe('a claim panel is judged by the LINES its text wraps to (split-panel, Amendments (5)-(6))', () => {
  const v = { names: new Set(['split-panel']), modifiers: new Set(['proof', 'capstone', 'metric']), capacity: {} };
  // Four-letter words, so a line's word count is exact. Since titles scale with the venue
  // (2026-09-29), a `proof` heading line at hall holds 3 words (15.6 characters) at 201.6px, a
  // question line 4 (22.5), a lede line 5 (28.6), and a capstone question line 3 (16.9).
  const w = (n, word = 'abcd') => Array.from({ length: n }, () => word).join(' ');
  const points = '- You know you are here when\n  - The team ships.\n- Proof one\n  - It holds.\n- Proof two\n  - It lasts.\n';
  // `size: 4k`: the geometry is measured on a 2160-high slide, whose frame tolerance these tests assume.
  const deck = (venue, cls, l, q = '*Why?* ') => `---\nmarp: true\nsize: 4k\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n\`Step 1\`\n\n## ${w(6)}\n\n${q}${w(l)}\n\n${points}`;
  const run = (...a) => core.lintTextWith(deck(...a), v).filter((f) => f.rule === 'capacity-scale');
  const raw = (venue, cls, body) => core.lintTextWith(`---\nmarp: true\nsize: 4k\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');

  test('a proof panel past its column at hall warns, and names the lines it counted', () => {
    // hall, proof: eyebrow 140.2 + heading 2 × 201.6 + question 189 + lede lines × 144.3 against 1741.
    assert.deepEqual(run('hall', 'split-panel proof', 30), []); // 6 lede lines: 1598.2
    const over = run('hall', 'split-panel proof', 31); // 7 lede lines: 1742.5
    assert.equal(over.length, 1);
    assert.match(over[0].message, /'split-panel proof' claim panel's text runs about 1% too long for its column/);
    assert.match(over[0].fix, /Shorten the heading or the lede/);
  });

  test('the same slide fits a smaller room, where a lede line holds more', () => {
    assert.deepEqual(run('conference', 'split-panel proof', 40), []);
  });

  test('the opening question is its own block: the same words fit without it', () => {
    assert.deepEqual(run('hall', 'split-panel proof', 31, ''), []);
    assert.equal(run('hall', 'split-panel proof', 31).length, 1);
  });

  test('characters decide, not words: the same word count in longer words overflows', () => {
    const body = (word) => `\`Step 1\`\n\n## ${w(6)}\n\n*Why?* ${w(30, word)}\n\n${points}`;
    assert.deepEqual(raw('hall', 'split-panel proof', body('abcd')), []);
    assert.equal(raw('hall', 'split-panel proof', body('abcdefgh')).length, 1);
  });

  test('capstone reads its own row (a larger question), also beside `proof`, and the bare row is stricter', () => {
    // A question that wraps to 2 lines in capstone's row (16.9 characters) but 1 in proof's (22.5).
    const q = '*Why does this hold?* ';
    assert.deepEqual(run('hall', 'split-panel proof', 28, q), []);
    assert.equal(run('hall', 'split-panel capstone', 28, q).length, 1);
    assert.equal(run('hall', 'split-panel proof capstone', 28, q).length, 1);
    assert.deepEqual(run('hall', 'split-panel proof', 20), []);
    assert.equal(run('hall', 'split-panel', 20).length, 1);
  });

  test('a variant the geometry does not describe is not judged by it', () => {
    assert.deepEqual(run('hall', 'split-panel metric', 80), []);
  });

  test('a `#` inside a code fence is not the heading, and an image line is not the lede', () => {
    const body = `\`\`\`sh\n# a comment\n\`\`\`\n\n## ${w(8)}\n\n![A diagram](a.png)\n\n${w(60)}\n\n${points}`;
    assert.equal(raw('hall', 'split-panel proof', body).length, 1);
  });

  test('past the laptop column too, the fix offers no smaller room', () => {
    const [f] = raw('hall', 'split-panel', `## ${w(8)}\n\n${w(80)}\n\n${points}`);
    assert.doesNotMatch(f.fix, /venue: laptop|for the whole deck/);
    const [g] = run('hall', 'split-panel proof', 40);
    assert.match(g.fix, /venue:/);
  });

  test('a panel over its column is reported beside an over-full list, not hidden by it', () => {
    const long = Array.from({ length: 4 }, (_, i) => `- Point ${i}\n  - ${w(14)}.`).join('\n');
    const found = raw('hall', 'split-panel', `## ${w(12)}.\n\n${w(40)}.\n\n${long}\n`);
    assert.equal(found.length, 2);
    assert.ok(found.some((f) => /claim panel/.test(f.message)) && found.some((f) => /items/.test(f.message)));
  });

  test('wrapLines is a greedy word wrap on characters', () => {
    assert.equal(core.wrapLines('abcd abcd abcd', 9), 2);
    assert.equal(core.wrapLines('abcd abcd abcd', 14), 1);
    assert.equal(core.wrapLines('  ', 10), 0);
  });
});

test('a row of 0 says the venue holds not one element, and never "keep 0"', (t) => {
  // No shipped row is 0 today (timeline-list's 16-word hall row was, until its fixed-width
  // measure became an em measure and a lone milestone fit), so the row is set for this test.
  const row = core.SCALE_CAPACITY['timeline-list'];
  const was = row['16'];
  row['16'] = [7, 6, 3, 0];
  t.after(() => { row['16'] = was; });
  const v = { names: new Set(['timeline-list']), modifiers: new Set(), capacity: {} };
  const items = Array.from({ length: 2 }, (_, i) => `1. \`2025 Q${i + 1}\` Phase ${i}\n   - ${Array.from({ length: 16 }, (_, j) => `word${j}`).join(' ')}.`).join('\n');
  const [f] = core.lintTextWith(`---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: timeline-list -->\n\n## H.\n\n${items}\n`, v).filter((x) => x.rule === 'capacity-scale');
  assert.match(f.message, /fits not even one item/);
  assert.doesNotMatch(f.fix, /Keep 0/);
});

describe('capacity-scale — the designed size, for a component with no `capacity` block', () => {
  const v = { names: new Set(['list-tabular', 'glossary']), modifiers: new Set(), capacity: {} };
  const run = (body, fm = '') => core.lintTextWith(`---\nmarp: true\n${fm}---\n\n${body}`, v).filter((x) => x.rule === 'capacity-scale');
  const rows = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. Row ${i} name\n   - A short detail line for row number ${i} here.`).join('\n');
  const terms = (n) => Array.from({ length: n }, (_, i) => `- Term ${i}\n  - A definition of about twelve words that explains the term ${i} plainly.`).join('\n');
  const lt = core.SCALE_CAPACITY['list-tabular'];
  const ceil = lt[Math.min(...Object.keys(lt).map(Number).filter((k) => k >= 10))][0];

  test('one row past the laptop budget warns, with no venue set (rendered: 7 rows clip)', () => {
    const [f] = run(`<!-- _class: list-tabular -->\n\n## H.\n\n${rows(ceil + 1)}\n`);
    assert.equal(f.severity, 'warning');
    assert.match(f.message, new RegExp(`fits about ${ceil} items.*this slide has ${ceil + 1}, so some are cut off`));
    assert.doesNotMatch(f.fix, /venue|huddle|laptop/);
  });

  test('at the budget it is silent', () => {
    assert.equal(run(`<!-- _class: list-tabular -->\n\n## H.\n\n${rows(ceil)}\n`).length, 0);
  });

  test('a glossary past its laptop budget warns too (rendered: 10 terms clip)', () => {
    assert.equal(run(`<!-- _class: glossary -->\n\n## H.\n\n${terms(10)}\n`).length, 1);
  });

  test('a `venue:` deck gets the venue finding, not this one as well', () => {
    const found = run(`<!-- _class: list-tabular -->\n\n## H.\n\n${rows(ceil + 1)}\n`, 'venue: huddle\n');
    assert.ok(found.every((f) => !/at laptop size; this slide/.test(f.message)));
  });

  test('a specimen slide says nothing', () => {
    assert.equal(run(`<!-- _class: list-tabular -->\n<!-- stress-slide -->\n\n## H.\n\n${rows(ceil + 3)}\n`).length, 0);
  });

  test('only on the 16:9 stage the rows were measured on: a 4:3 (`standard`) deck is silent', () => {
    assert.equal(run(`<!-- _class: list-tabular -->\n\n## H.\n\n${rows(ceil + 1)}\n`, 'size: standard\n').length, 0);
    assert.equal(run(`<!-- _class: list-tabular -->\n\n## H.\n\n${rows(ceil + 1)}\n`, 'size: 16:9\n').length, 1);
  });
});

describe('capacity-scale — the designed size, for a component whose `hard` sits above its row', () => {
  const v = { names: new Set(['premise', 'timeline-list']), modifiers: new Set(), capacity: { premise: { axis: 'item', min: 3, sweet: 4, soft: 6, hard: 8 } } };
  const run = (body) => core.lintTextWith(`---\nmarp: true\n---\n\n${body}`, v).filter((x) => x.rule === 'capacity-scale');
  const premiseRows = (n) => Array.from({ length: n }, (_, i) => `1. Term ${i}\n   - A clause of about nine words that frames row ${i}.\n   - Why it matters?`).join('\n');

  test('premise: 14-word rows past the laptop row warn below `hard` (rendered: 7 clip, 6 fit)', () => {
    const cap = core.SCALE_CAPACITY.premise['14'][0];
    assert.equal(run(`<!-- _class: premise -->\n\n## H.\n\n${premiseRows(cap)}\n`).length, 0);
    const [f] = run(`<!-- _class: premise -->\n\n## H.\n\n${premiseRows(cap + 1)}\n`);
    assert.match(f.message, new RegExp(`'premise' fits about ${cap} items`));
  });

  test('past `hard` the capacity-overflow rule speaks, not this one', () => {
    assert.equal(run(`<!-- _class: premise -->\n\n## H.\n\n${premiseRows(9)}\n`).length, 0);
  });

  test('timeline-list: one milestone past the laptop row warns (rendered: 10 clip, 9 fit)', () => {
    const cap = core.SCALE_CAPACITY['timeline-list']['6'][0];
    const ms = (n) => Array.from({ length: n }, (_, i) => `1. \`2025 Q${i + 1}\` Phase ${i}\n   - Ship it.`).join('\n');
    assert.equal(run(`<!-- _class: timeline-list -->\n\n## H.\n\n${ms(cap)}\n`).length, 0);
    assert.equal(run(`<!-- _class: timeline-list -->\n\n## H.\n\n${ms(cap + 1)}\n`).length, 1);
  });
});

describe('a list or card slide is judged by the LINES its text wraps to (Amendment (7))', () => {
  const v = { names: new Set(['list', 'cards-grid', 'list-steps']), modifiers: new Set(['takeaway', 'numbered', 'three', 'four', 'principles', 'compact']), capacity: {} };
  const run = (venue, cls, body, size = '4k') => core.lintTextWith(`---\nmarp: true\nsize: ${size}\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');
  const w = (n, from = 0) => Array.from({ length: n }, (_, i) => ['plan', 'the', 'change', 'before', 'anyone', 'asks', 'review', 'ship', 'measure', 'learn'][(i + from) % 10]).join(' ');
  const cap = (s) => s[0].toUpperCase() + s.slice(1);
  const nested = (n) => Array.from({ length: n }, (_, i) => `- ${cap(w(3, i))}\n  - ${cap(w(10, i + 3))}.`).join('\n');

  test('past what the slide holds it warns, names the register, and offers the largest room that fits', () => {
    const out = run('hall', 'list takeaway', `## Five signs a problem is hard.\n\n${nested(5)}\n`);
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /At hall size this 'list takeaway' slide's text runs about \d+% too long/);
    // The room it offers is the largest whose lines hold the slide, read off the same geometry.
    const at = core.rowsAt('list', ['list', 'takeaway'], `## Five signs a problem is hard.\n\n${nested(5)}\n`);
    const fits = [2, 1, 0].find((r) => !at(r).over);
    assert.match(out[0].fix, new RegExp(`set \`venue: ${['laptop', 'huddle', 'conference'][fits]}\``));
  });

  test('a 720-high deck forgives what the export forgives: 12 layout px, 36 of a 2160 slide', () => {
    // retire-automatic-scale-fit.md slide 4 read 1% over its budget and renders whole: the overflow
    // probe's tolerance is 12 LAYOUT px at every size, three times the 4k budget's share at 720 high.
    // Resized 2026-09-29 for list rows at --fs-body and a title that scales: the same "1% over at
    // huddle" fixture, reached with a longer heading and shorter items.
    const slide = '## Five signs a problem is hard, and how to tell them apart early.\n\n' + Array.from({ length: 5 }, (_, i) => `- ${cap(w(1, i))}\n  - ${cap(w(8, i + 3))}.`).join('\n') + '\n';
    const pct = core.rowsAt('list', ['list', 'takeaway'], slide)(1).pct;
    assert.ok(pct > 0 && pct < 1.6, `fixture: over by less than 24 px of ~1,470 at huddle (${pct}%)`);
    assert.equal(run('huddle', 'list takeaway', slide).length, 1, 'over at 4k');
    assert.deepEqual(run('huddle', 'list takeaway', slide, '16:9'), [], 'within the tolerance at 720 high');
    assert.equal(core.lineSlack('---\nsize: 4k\n---\n'), 0);
    assert.equal(core.lineSlack('---\nmarp: true\n---\n'), 24);
  });

  test('silent when the wrapped lines fit', () => {
    assert.deepEqual(run('hall', 'list takeaway', `## Five signs a problem is hard.\n\n${nested(3)}\n`), []);
  });

  test('a slide the count row called full, that renders whole, is silent (the talk at huddle, slide 24)', () => {
    // Five 10-to-12-word items: `list takeaway` at 14 words holds 4 at huddle by its count row, and the
    // talk's export at `venue: huddle` clipped nothing (followups.d/2361-p2-…, the brief's false warnings).
    const slide = '`Autonomy · The stop list`\n\n## Five kinds of change always come back to a person.\n\n' +
      '- Shared state: labels, boards and settings other people read.\n' +
      '- The build pipeline: every future change pays for a new step.\n' +
      '- A number a person set: if they asked for about twelve, stop at twelve.\n' +
      "- A core document's meaning: rewriting rules differs from following them.\n" +
      "- Anything irreversible or public: merges, releases, comments on others' work.\n";
    assert.deepEqual(run('huddle', 'list takeaway', slide), []);
  });

  test('characters decide by their width: a narrow card column breaks before a wide word', () => {
    // At 23.1 average characters, the browser sets this body on four lines (rendered at hall in
    // `cards-grid three`); a flat count of 62 characters says three.
    const body = 'When the agent knows the ground better, let it propose a plan.';
    assert.equal(core.wrapLines(body, 23.1), 3);
    assert.equal(core.wrapLines(body, 23.1, true), 4);
    assert.equal(core.wrapLines('ill ill', 5), 2);
    assert.equal(core.wrapLines('ill ill', 5, true), 1, 'narrow glyphs count less than one');
    assert.equal(core.wrapLines('MMMM', 5, true), 2, 'a word longer than a line breaks across the lines it fills');
    assert.equal(core.wrapLines('MM MM', 5, true), 2);
    assert.equal(core.wrapLines('a b', 3), 1);
  });

  test('an ordered list reads the geometry its ordinal leaves (bare list, laptop)', () => {
    // 18 words an item, not 13: list rows read at --fs-body now, so a line holds more.
    const items = (mark) => Array.from({ length: 6 }, (_, i) => `${mark(i)} ${cap(w(18, i))}.`).join('\n');
    const at = (mark) => core.rowsAt('list', ['list'], `## Six things.\n\n${items(mark)}`)(0);
    assert.equal(at((i) => `${i + 1}.`).over, true);
    assert.equal(at(() => '-').over, false);
  });

  test('list-steps is one row, its width shared by the step count; six steps and a `-` list keep the count row', () => {
    const steps = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - ${w(8, i)}.`).join('\n');
    assert.equal(typeof core.rowsAt('list-steps', ['list-steps'], `## H.\n\n${steps(4)}`), 'function');
    assert.equal(core.rowsAt('list-steps', ['list-steps'], `## H.\n\n${steps(6)}`), null);
    assert.equal(core.rowsAt('list-steps', ['list-steps'], `## H.\n\n${steps(4).replace(/^\d+\. /gm, '- ')}`), null);
  });

  test('a slide the geometry does not describe keeps its count row', () => {
    assert.equal(core.rowsAt('list', ['list', 'principles'], '## H.\n\n- a'), null, 'an unmeasured register');
    assert.equal(core.rowsAt('cards-grid', ['cards-grid', 'compact'], '## H.\n\n- a\n  - b'), null, 'compact resizes the stage');
    assert.equal(core.rowsAt('list', ['list'], '## H.\n\nA lede under the heading.\n\n- a'), null, 'a paragraph');
    assert.equal(core.rowsAt('list', ['list'], '## H.\n\n- a\n\n```js\nx();\n```'), null, 'a fence');
    assert.equal(core.rowsAt('list', ['list'], '- a'), null, 'no heading');
    assert.equal(core.rowsAt('list', ['list'], '## H.\n\n- a\n  - b\n    - c'), null, 'a third level');
    assert.equal(core.rowsAt('cycle', ['cycle'], '## H.\n\n- a'), null, 'a component with no rows');
  });

  test('a comment, the eyebrow and the callout are read, not taken for content', () => {
    const f = core.rowsAt('list', ['list', 'takeaway'], '<!-- a note\nover two lines -->\n`Eyebrow · one`\n\n## H.\n\n- a\n- b\n\n> The line to remember.\n');
    assert.equal(typeof f, 'function');
    assert.equal(typeof core.rowsAt('list', ['list', 'takeaway'], '<!-- a note\nends here --!>\n## H.\n\n- a\n'), 'function', 'a `--!>` ends a comment too');
    const bare = core.rowsAt('list', ['list', 'takeaway'], '## H.\n\n- a\n- b\n')(3).pct;
    assert.ok(f(3).pct > bare, 'the eyebrow and callout cost the slide height');
  });

  test('a lone last card spans its row, so it wraps wider than a card beside another', () => {
    const cards = (n) => Array.from({ length: n }, (_, i) => `- Card ${i + 1}\n  - ${cap(w(30, i))}.`).join('\n');
    const three = core.rowsAt('cards-grid', ['cards-grid'], `## H.\n\n${cards(3)}`)(3).pct;
    const four = core.rowsAt('cards-grid', ['cards-grid'], `## H.\n\n${cards(4)}`)(3).pct;
    assert.ok(four - three >= 10, `a spanning third card costs less than a fourth beside it (${three}% vs ${four}%)`);
  });

  test('a numbered card grid reads its ordinal row cost, and keeps its own lines', () => {
    const cards = (mark) => Array.from({ length: 4 }, (_, i) => `${mark(i)} Card ${i + 1}\n   - ${cap(w(8, i))}.`).join('\n');
    const ul = core.rowsAt('cards-grid', ['cards-grid'], `## H.\n\n${cards(() => '-')}`)(2).pct;
    const ol = core.rowsAt('cards-grid', ['cards-grid'], `## H.\n\n${cards((i) => `${i + 1}.`)}`)(2).pct;
    assert.ok(ol > ul, `ordered ${ol}% > unordered ${ul}%`);
  });

  test('past `hard` the lines path stays silent, as the count path does: the overflow rule owns it', () => {
    const vv = { ...v, capacity: { list: { axis: 'item', min: 2, sweet: 3, soft: 4, hard: 4 } } };
    const src = `---\nmarp: true\nsize: 4k\nvenue: hall\n---\n\n<!-- _class: list takeaway -->\n\n## H.\n\n${nested(5)}\n`;
    assert.deepEqual(core.lintTextWith(src, vv).filter((f) => f.rule === 'capacity-scale'), []);
  });

  test('CRLF line endings and `*` or `1)` markers read the same slide', () => {
    const lf = `## Five signs.\n\n${nested(4)}\n`;
    const pct = (s, t = ['list', 'takeaway']) => core.rowsAt('list', t, s)(3).pct;
    assert.equal(pct(lf.replace(/\n/g, '\r\n')), pct(lf));
    assert.equal(pct(lf.replace(/^- /gm, '* ')), pct(lf));
    assert.equal(core.rowsAt('list', ['list'], '# H.\n\n- a'), null, 'an `#` heading is another size');
    assert.equal(pct(`## Five signs. <!-- note -->\n\n${nested(4)}\n`), pct(lf), 'a comment on the heading line is not heading text');
  });

  // Real slides the second checker round named, each pinned against the render: every test below
  // fails when the behavior it names is taken out (system-design-foundations.md, size 4K).
  const SD95 = '`Data kit · the invariants`\n\n## Four sentences hold, or the data design is not one you can defend.\n\n1. One source of truth per fact\n   - Every other copy is derived and says so.\n2. Every derived copy rebuilds — and deletes\n   - Unattended from the source, and gone from all of them on request.\n3. Every queue consumer is idempotent\n   - At-least-once is the only delivery you get.\n4. Every write path states its consistency\n   - "Whatever the database does" is not a level.\n';
  const SD192 = "`Instagram · the likely bug`\n\n## Your own post must appear instantly, or people think the upload failed.\n\nThe feed is eventually consistent, which is correct for everyone else's posts and completely wrong for your own. A person who posts and does not see it reads that as data loss, not as staleness, and posts again.\n\n- Where it comes from\n  - Read-your-writes, the consistency level from Part four, applied to one reader's own posts.\n- Write your own feed synchronously\n  - Inside the POST request, before it returns. One extra write, on one key.\n- And let the client help\n  - It inserts the post it just created optimistically, and reconciles on the next fetch.\n";
  const SD224 = '`The removal test, run`\n\n## Take one box out on paper, and follow what happens to the rest.\n\nPart three set the test. Saying where each piece landed proves nothing about whether it is needed. Deleting pieces on paper is what tells you the design is finished.\n\n- The celebrity list cache\n  - Remove it and every reader of every celebrity post reads the store directly. It stays.\n';

  test('a heading is weighed in its own face, with the kerning share taken out (slide 95 renders whole at huddle)', () => {
    // At laptop the render sets this heading on ONE line (at huddle, where titles now scale, on
    // two, and the slide still renders whole). Outfit's widths read the laptop heading as two.
    assert.equal(core.rowsAt('list', ['list', 'takeaway', 'numbered'], SD95)(1).over, false);
    const h = 'Four sentences hold, or the data design is not one you can defend.';
    const c = require('../../../lib/authoring/venue-capacity.generated.js').rowFrame.heading[0][0];
    assert.equal(core.wrapLines(h, c, core.GLYPH_DISPLAY), 1);
    assert.equal(core.wrapLines(h, c, true), 2, 'in Outfit it would be two');
  });

  test('a claim panel heading in Playfair: slide 224 at laptop has three heading lines, where Outfit would have four', () => {
    const p = core.panelOver('split-panel', ['split-panel', 'capstone'], SD224, 0);
    assert.equal(p.n.heading, 3);
    assert.equal(p.over, false);
    const c = require('../../../lib/authoring/venue-capacity.generated.js').panel['split-panel capstone'].heading[0][0];
    const h = 'Take one box out on paper, and follow what happens to the rest.';
    assert.equal(core.wrapLines(h, c, core.GLYPH_DISPLAY), 3);
    assert.equal(core.wrapLines(h, c, true), 4, 'in Outfit it would be four');
  });

  test('slide 224 at hall has five heading lines, as rendered', () => {
    // Rendered 2026-09-29 with titles scaling by the venue (42pt at hall): five heading lines and
    // seven lede lines, and the export clips the slide, so lint says so. On the unscaled title it
    // had three lines and fit.
    const p = core.panelOver('split-panel', ['split-panel', 'capstone'], SD224, 3);
    assert.equal(p.n.heading, 5);
    assert.equal(p.n.lede, 7);
    assert.equal(p.over, true);
  });

  test('a proof panel with no opening question has the question gap back: it is judged by the bare budget', () => {
    // 1,747 px at huddle: past the proof budget (1,739), inside the bare one (1,765). Judged by the
    // proof budget, as a slide WITH an opening question is, it would read as over.
    const V = require('../../../lib/authoring/venue-capacity.generated.js');
    const word = (n) => Array.from({ length: n }, () => 'abcd').join(' ');
    const points = '- You know you are here when\n  - The team ships.\n- Proof one\n  - It holds.\n- Proof two\n  - It lasts.\n';
    const body = `## ${word(4)}\n\n${word(75)}\n\n${points}`;
    const p = core.panelOver('split-panel', ['split-panel', 'proof'], body, 1);
    assert.ok(p.used > V.panel['split-panel proof'].budget[1], 'fixture: past the proof budget');
    assert.ok(p.used <= V.panel['split-panel'].budget[1], 'fixture: inside the bare budget');
    assert.equal(p.over, false);
  });

  test('slide 192, counted as rendered', () => {
    // At conference, with the scaled title, the render has a five-line heading and eight lede lines
    // and the export clips it; lint counts the same lines and agrees. The same text with an opening
    // question costs the question's block on top.
    const p = core.panelOver('split-panel', ['split-panel', 'proof'], SD192, 2);
    assert.deepEqual(p.n, { eyebrow: 2, heading: 5, lede: 8 }, 'the rendered line counts');
    assert.equal(p.over, true);
    assert.ok(p.pct > 0, 'the percentage reads against the same budget as the verdict');
    const q = core.panelOver('split-panel', ['split-panel', 'proof'], SD192.replace('The feed is', '*Why?* The feed is'), 2);
    assert.ok(q.used > p.used, 'an opening question costs its own block');
  });

  test('the kerning share widens a line by 188.5/187 in Outfit', () => {
    const word = 'e'.repeat(40); // 40 × 1.25 = 50 units
    assert.equal(core.wrapLines(word, 49.8, true), 1, 'fits once the line is widened by the share');
    assert.equal(core.wrapLines(word, 49.5, true), 2);
  });

  test('a code span is a mono pill: one unbreakable word, a `u` a glyph and a `t` of padding', () => {
    assert.equal(core.lineText('Put `class: scale-xl` here', true), 'Put uuuuuuuuuuuuuuut here');
    assert.equal(core.lineText('Put `class: scale-xl` here'), 'Put class: scale-xl here', 'a flat wrap keeps the text');
    // examples/font-scale.md slide 10's card body: three lines in a 42.9-character card, as rendered.
    assert.equal(core.wrapLines(core.lineText('`<!-- _class: cards-grid scale-xl -->` — the spot directive scales just this section.', true), 42.9, true), 3);
  });

  test('an em dash and an ellipsis are as wide as an `m`, curly quotes as straight ones', () => {
    assert.equal(core.lineText('a — b … “c” ‘d’ e–f', true), 'a m b m "c" \'d\' enf');
  });

  test('the deck-wide class and front matter reach the choice: a `class: sketch` or `meta:` deck keeps its count row', () => {
    const slide = `<!-- _class: list takeaway -->\n\n## H.\n\n${nested(6)}\n`;
    const find = (fm) => core.lintTextWith(`---\nmarp: true\nsize: 4k\nvenue: hall\n${fm}---\n\n${slide}`, v).filter((f) => f.rule === 'capacity-scale');
    assert.match(find('')[0].message, /text runs about \d+% too long/);
    for (const fm of ['class: sketch\n', 'meta: "Q3 review"\n', 'logo: logo.svg\n', 'preset: brand\n']) {
      assert.ok(find(fm).every((f) => !/text runs about \d+% too long/.test(f.message)), `${fm.trim()} keeps the count row`);
    }
    assert.match(find('theme: indaco\npaginate: true\nheader: "H"\n')[0].message, /text runs about \d+% too long/, 'inert keys ride along');
  });

  test('the generated table: rows per component, one shared frame, `ordered` carrying only what differs', () => {
    const V = require('../../../lib/authoring/venue-capacity.generated.js');
    assert.deepEqual(Object.keys(V.rows).sort(), ['cards-grid', 'compare-prose', 'cycle', 'list', 'list-steps']);
    assert.ok(V.rowFrame.heading && V.rowFrame.eyebrow && V.rowFrame.callout);
    assert.deepEqual(Object.keys(V.rows['cards-grid'].regs[''].ordered.nested), ['row'], 'a numbered card differs only in its row cost');
    assert.equal(V.rows['cards-grid'].regs[''].cols, 2);
    assert.ok(V.rows['cards-grid'].regs[''].span > 1, 'a lone last card spans the row');
    assert.equal(V.rows['list-steps'].regs[''].cols, 0);
  });
});

describe('a count row reads the slide a real deck writes (#2361 P2, 2026-10-05)', () => {
  const v = { names: new Set(['glossary', 'list-tabular']), modifiers: new Set(), capacity: {} };
  const run = (venue, body) => core.lintTextWith(`---\nmarp: true\nsize: 4k\nvenue: ${venue}\n---\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');
  // The talk's (PR #2399) glossary slide 74: seven terms whose definitions run 9 to 13 words. Its
  // export at huddle renders it whole.
  const glossary74 = `<!-- _class: glossary -->\n\n\`Starter kit · Glossary, 1 of 3\`\n\n## Terms from this talk, in plain words.\n\n${[
    ['Baseline', 'The last approved result that a new one is compared against.'],
    ['CI, the build', 'Automated checks that run on every proposed change.'],
    ['Commit', "One saved change in the project's history."],
    ['Conformance test', 'A test that proves a component keeps its written promises.'],
    ['Context window', 'Everything the model can see at one moment.'],
    ['Deprecate', 'Mark something as on its way out, while it still works.'],
    ['Dot folder', 'A folder whose name starts with a dot, like .claude, hidden by default.'],
  ].map(([t, d]) => `- ${t}\n  - ${d}`).join('\n')}\n`;

  test('glossary reads an item by its characters: 15 short words are not the rig\'s 15 long ones', () => {
    assert.equal(core.elementLength(glossary74, 'item', 'glossary'), 12);
    assert.deepEqual(run('huddle', glossary74), []);
    // Read as 15 words it warned (the brief's false warnings): the row at 15 words holds 4.
    assert.ok(core.scaleCapacityFor('glossary', 'l', 15).ceiling < 7, 'fixture: the word count reads it as over');
  });

  // The talk's list-tabular slide 10: an eyebrow over five rows; it clips at huddle in the export.
  const tabular10 = `<!-- _class: list-tabular -->\n\n\`Your role · Declare the outcome\`\n\n## Declarative works when the spec leaves nothing to guess.\n\n${[
    ['Define the shape', 'A schema or types: what the data is, and what it can never be.'],
    ['Name the constraints', 'What must never happen, and which tradeoffs you accept.'],
    ['Say how you\'ll know', 'Checks that pass only when the outcome is right.'],
    ['Stay imperative where order matters', 'Migrations, rollouts and cut-overs: spell out the steps.'],
    ['Read the how anyway', "The agent's code is still yours, including its speed and safety."],
  ].map(([t, d], i) => `${i + 1}. ${t}\n   - ${d}`).join('\n')}\n`;

  test('list-tabular reads rows measured past 12 words, where its rows step at a wrap (slide 10 at conference)', () => {
    // Read in characters the slide is 13 rig words; the rows measured at 13 and 14 hold 3 at
    // conference. With rows to 12 words only, every length past 12 read as 12, which holds 5.
    assert.equal(core.elementLength(tabular10, 'item', 'list-tabular'), 13);
    assert.equal(core.SCALE_CAPACITY['list-tabular']['13'][2], 3);
    const [f] = run('conference', tabular10);
    assert.match(f.message, /'list-tabular with its eyebrow' fits about 3 items of up to 13 words/);
  });

  test('a callout under an eyebrow reads the row measured with both, not the sum of two costs', () => {
    // The talk's slide 7: an eyebrow, four rows and a callout. It fits at huddle and clips at conference.
    const slide7 = `<!-- _class: list-tabular insight-our-view -->\n\n\`Your role · How to word it\`\n\n## Clear and specific beats polite, rude or loud.\n\n${[
      ['Say what to do', '"Use early returns" works better than a list of things to avoid.'],
      ['Say why it matters', '"This runs in checkout, so a wrong total costs money."'],
      ['Skip the shouting', '"CRITICAL" and "MUST" can make newer models overreact.'],
      ['Keep the tone neutral', "Studies on politeness disagree, so don't spend effort on it."],
    ].map(([t, d], i) => `${i + 1}. ${t}\n   - ${d}`).join('\n')}\n\n> Tone moves results a little. Missing information moves them a lot.\n`;
    // Huddle: the measured pair holds 4. The two costs added would say 3, and warn on a slide that fits.
    assert.deepEqual(run('huddle', slide7), []);
    assert.match(run('conference', slide7)[0].message, /with its callout and eyebrow/);
    // The eyebrow is what tips it at conference: the same slide without one is silent.
    assert.deepEqual(run('conference', slide7.replace('`Your role · How to word it`\n\n', '')), []);
  });

  test('a code span is priced as the mono pill it renders, a universal pill by its label (examples/inline-pills.md)', () => {
    const code = '1. An escape\n   - `\\{LIVE}` and `\\[x]` show the literal; `\\[a-z]` keeps its backslash\n';
    const pills = '1. Round and pointed\n   - `{3}:circle:c5` `{NEXT}:chevron-right:c6` `{BACK}:chevron-left:c8`\n';
    assert.equal(core.elementLength(code, 'item', 'list-tabular'), 11);
    // Priced as code, the pill row would be 9 rig words; as the labels it shows, 4.
    assert.equal(core.elementLength(pills, 'item', 'list-tabular'), 4);
  });
});

test('a character length counts what the slide shows: a link by its text, a tag not at all', () => {
  // The checker's probe: a glossary definition carrying a long URL read 14 rig words and warned on a
  // slide that renders whole at huddle.
  const link = '- RFC\n  - Defined in [RFC 9110](https://www.rfc-editor.org/rfc/rfc9110.html#name-semantics), section two.\n';
  const plain = '- RFC\n  - Defined in RFC 9110, section two.\n';
  assert.equal(core.elementLength(link, 'item', 'glossary'), core.elementLength(plain, 'item', 'glossary'));
  assert.equal(core.elementLength('- A\n  - Some <span class="x">text</span> here.\n', 'item', 'glossary'), core.elementLength('- A\n  - Some text here.\n', 'item', 'glossary'));
});

test('list-tabular `fixed` reads its own measured row: its track holds fewer rows than the default', () => {
  // examples/list-tabular-responsive.md slide 3: the pre-responsive `fixed` track wraps its long
  // names, and the slide clips at hall; the same rows on the default track fit (slide 4 there).
  const v = { names: new Set(['list-tabular']), modifiers: new Set(['fixed']), capacity: {} };
  const rows = [['ID', 'Two letters, a track sized for twenty.'], ['Extraordinarily long row label that will not fit', 'Wraps three lines.'], ['Mid', 'The same waste again.'], ['Governance and control framework alignment', 'And again.']]
    .map(([t, d], i) => `${i + 1}. ${t}\n   - ${d}`).join('\n');
  const run = (cls) => core.lintTextWith(`---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: ${cls} -->\n\n## Before: every label paid for the longest one.\n\n${rows}\n`, v).filter((f) => f.rule === 'capacity-scale');
  assert.match(run('list-tabular fixed')[0].message, /'list-tabular fixed' fits about 3 items/);
  assert.deepEqual(run('list-tabular'), []);
});

test('two measured variants on one slide read the one that holds fewer, in either order', () => {
  const v = { names: new Set(['list-tabular']), modifiers: new Set(['fixed', 'compact']), capacity: {} };
  const rows = Array.from({ length: 6 }, (_, i) => `${i + 1}. Name ${i}\n   - A description of about eight words for row ${i}.`).join('\n');
  const run = (cls) => core.lintTextWith(`---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: ${cls} -->\n\n## H.\n\n${rows}\n`, v).filter((f) => f.rule === 'capacity-scale').map((f) => f.message);
  assert.deepEqual(run('list-tabular fixed compact'), run('list-tabular compact fixed'));
  assert.match(run('list-tabular compact fixed')[0], /'list-tabular fixed'/);
});

test('a comparison and an autolink count as the text they show', () => {
  const cmp = '- A\n  - Only when x<5 and y>3 does the check pass here.\n';
  // Read as a tag, `<5 and y>` vanished and the item lost three words of characters.
  assert.equal(core.elementLength(cmp, 'item', 'glossary'), core.elementLength(cmp.replace(/[<>]/g, ' '), 'item', 'glossary'));
  const auto = '- A\n  - See <https://example.com/a/rather/long/path/to/the/page>.\n';
  assert.ok(core.elementLength(auto, 'item', 'glossary') >= 8);
});

describe('compare-prose and cycle are judged by lines, and glossary on the strict basis (Amendment (9))', () => {
  const v = {
    names: new Set(['compare-prose', 'cycle', 'glossary']),
    modifiers: new Set(['chosen', 'vertical', 'insight-so-what']),
    capacity: { cycle: { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 6 } },
  };
  const run = (venue, body, size = '4k') => core.lintTextWith(`---\nmarp: true\nsize: ${size}\nvenue: ${venue}\n---\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');
  const V = require('../../../lib/authoring/venue-capacity.generated.js');
  const kaizenRing = '<!-- _class: cycle -->\n\n## A ring.\n\n- Plan\n  - State what you expect.\n- Do\n  - Try it small.\n- Study\n  - Name the gap.\n';
  // The talk's (PR #2399) slide 5: two cards under an eyebrow, with a callout. It clips at
  // conference and fits at huddle; the count row (2 items, holds 3 at conference) was silent.
  const floor = `<!-- _class: compare-prose insight-so-what -->\n\n\`Your role · Floor and ceiling\`\n\n## AI raises your floor, but only you can raise your ceiling.\n\n- The floor\n  - Anyone can now produce working-looking code in minutes. That part got cheap, for everyone.\n- The ceiling\n  - Knowing what to build, spotting what is wrong, deciding when it is good enough. That part is still yours.\n\n> Everyone has a camera and a crew now. Not everyone makes a film.\n`;

  test('a compare-prose slide is judged by its wrapped lines (talk slide 5)', () => {
    assert.deepEqual(run('huddle', floor), []);
    const [f] = run('conference', floor);
    assert.match(f.message, /'compare-prose' slide's text runs about \d+% too long/);
    assert.match(f.fix, /set `venue: huddle`/);
  });

  test('a corner-tag title costs no height: the tag sits in the line the card reserves for it', () => {
    const at = (title) => core.rowsAt('compare-prose', ['compare-prose'], floor.replace('- The floor', `- ${title}`))(2).pct;
    assert.equal(at('The floor'), at('A floor title long enough to wrap the corner tag to three lines at conference'));
    assert.equal(V.rows['compare-prose'].regs[''].tag, 1);
    assert.equal(V.rows['compare-prose'].regs[''].nested.title, undefined);
  });

  test('a register measured the same as another is baked as its key, and reads that geometry', () => {
    assert.equal(V.rows['compare-prose'].regs.chosen, '');
    assert.equal(V.rows['compare-prose'].regs['chosen vertical'], 'vertical');
    const pct = (cls) => core.rowsAt('compare-prose', cls, floor)(2).pct;
    assert.equal(pct(['compare-prose', 'chosen']), pct(['compare-prose']));
    assert.notEqual(pct(['compare-prose', 'chosen', 'vertical']), pct(['compare-prose']));
  });

  // gallery.md slide 12: two cards and a closing note. It clips at hall; the note was a paragraph
  // the line model did not describe, so the slide went unjudged.
  const note = `<!-- _class: compare-prose -->\n\n## Scoring model: before and after the calibration loop.\n\n- Before Calibration\n  - Equal weights, 33% each. Simple, consistent, and blind to what the market rewards — which nobody minded until the market did.\n- After Calibration\n  - Weights track your historical accuracy; weak predictors get downweighted. The model becomes a record of what you have learned.\n\nThe shift from equal weights to calibrated weights takes two retrospective cycles — roughly 60 days from adoption, both of which must occur.\n`;

  test('a closing note is a measured role: its lines and its block cost (gallery slide 12 at hall)', () => {
    const at = core.rowsAt('compare-prose', ['compare-prose'], note);
    assert.equal(typeof at, 'function');
    assert.ok(at(3).over);
    assert.ok(at(3).pct > core.rowsAt('compare-prose', ['compare-prose'], note.replace(/\n\nThe shift[^\n]*\n$/, '\n'))(3).pct, 'the note adds its lines');
    assert.equal(run('hall', note).length, 1);
    // A second paragraph, or a list after the note, is a slide the model does not describe.
    assert.equal(core.rowsAt('compare-prose', ['compare-prose'], `${note}\nA second paragraph.\n`), null);
    assert.equal(core.rowsAt('compare-prose', ['compare-prose'], `${note}\n- One more card\n`), null);
    assert.equal(core.rowsAt('compare-prose', ['compare-prose'], `${note}- One more card\n`), null, 'items straight after the note');
  });

  test('a note pays its measured block cost, past its lines', () => {
    const g = V.rows['compare-prose'].regs[''].nested;
    // The px a slide uses, exactly: the slack at which `over` flips (over ⇔ used > budget + slack).
    const used = (src) => {
      let lo = -5000;
      let hi = 5000;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (core.rowsAt('compare-prose', ['compare-prose'], src, mid)(3).over) lo = mid; else hi = mid;
      }
      return g.budget[3] + hi;
    };
    const lines = core.wrapLines(core.lineText(note.match(/\n\n(The shift[^\n]*)\n$/)[1], true), g.note[3][0], true) * g.note[3][1];
    const without = note.replace(/\n\nThe shift[^\n]*\n$/, '\n');
    assert.ok(Math.abs(used(note) - used(without) - (lines + g.noteAt)) <= 1, 'the note adds its lines and noteAt');
    assert.ok(g.noteAt > 0);
  });

  test('a note on a register with no measured note keeps the count row, and never crashes', () => {
    // Stacked, the note costs more than the one-row model charges (the checker's probe), so
    // `vertical` stores none and a stacked slide with a note keeps its count row, as on main.
    assert.equal(V.rows['compare-prose'].regs.vertical.nested.note, undefined);
    assert.equal(core.rowsAt('compare-prose', ['compare-prose', 'vertical'], note), null);
    assert.equal(core.rowsAt('cycle', ['cycle'], `${kaizenRing}\nA paragraph after the ring.\n`), null);
  });

  // The talk's slide 3: four short stages and a callout. It clips at huddle by 12 px, because the
  // ring is centered and its mark hangs below it; kaizen-craftsmanship slide 8 fits at huddle.
  const loop = `<!-- _class: cycle insight-takeaway -->\n\n\`How an agent works\`\n\n## A coding agent loops until it thinks it is done.\n\n- Read\n  - It takes in what's in front of it.\n- Plan\n  - It decides the next step.\n- Act\n  - It changes code or runs a tool.\n- Check\n  - Done? It reports back. If not, it loops.\n\n> Every practice today makes "thinks it is done" match "is done."\n`;
  const kaizen = `<!-- _class: cycle -->\n\n\`Kaizen · The loop\`\n\n## Improvement is a loop you never stop running.\n\n- Plan\n  - State what you expect to happen, and why you expect it.\n- Do\n  - Try it small. One bench, one batch, one week.\n- Study\n  - Hold what happened against what you predicted, and name the gap.\n- Act\n  - Make it the new standard, or drop it and plan again.\n`;

  test('a cycle is judged by lines against the budget its centered ring and mark leave (talk slide 3)', () => {
    assert.equal(run('huddle', loop).length, 1);
    assert.deepEqual(run('huddle', kaizen), []);
    assert.equal(run('conference', kaizen).length, 1);
  });

  test('a cycle written `1.`, or with six stages, keeps its count row', () => {
    assert.equal(core.rowsAt('cycle', ['cycle'], kaizen.replace(/^- /gm, '1. ')), null);
    const six = kaizen.replace('- Act', '- Five\n  - A fifth stage.\n- Six\n  - A sixth stage.\n- Act');
    assert.equal(core.rowsAt('cycle', ['cycle'], six), null);
    assert.equal(V.rows.cycle.regs[''].ul, 1);
  });

  // The talk's slide 75: six one-line terms under an eyebrow. On a 4k deck it clips at conference by
  // 16 px against a 12 px tolerance; the row measured on the 720-high basis (36 px) held 6.
  const terms = `<!-- _class: glossary -->\n\n\`Starter kit · Glossary, 2 of 3\`\n\n## More terms, in plain words.\n\n${[
    ['Flaky test', 'A test that passes or fails without the code changing.'],
    ['Hook', 'A script the agent tool runs at a fixed moment.'],
    ['Jank', 'Sloppy work that still passes, and spreads when copied.'],
    ['Linter', 'A tool that flags style slips and simple mistakes without running the code.'],
    ['Merge', 'Fold an approved change into the main line of the code.'],
    ['Pull request', 'A proposed change, waiting for review before it merges.'],
  ].map(([t, d]) => `- ${t}\n  - ${d}`).join('\n')}\n`;

  test('glossary under an eyebrow reads its strict row on a 4k deck only (talk slide 75)', () => {
    assert.match(run('conference', terms)[0].message, /'glossary with its eyebrow' fits about 5 items/);
    assert.deepEqual(run('huddle', terms), []);
    // On a 720-high deck the export forgives 36 px of 2160, and the same slide fits (the checker's
    // render: 21 px over). The 720-basis row holds 6 there.
    assert.deepEqual(run('conference', terms, '16:9'), []);
  });
});
