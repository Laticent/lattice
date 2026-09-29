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
// (Amendment (7), pinned at the end of this file), so they no longer exercise the count rows.
const vocab = {
  names: new Set(['cycle', 'code']),
  modifiers: new Set(['scale-l', 'scale-xl', 'scale-2xl', 'compact']),
  capacity: {
    cycle: { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5, escalateTo: ['list-steps', 'split across slides'] },
  },
};
const lint = (src) => core.lintTextWith(src, vocab).filter((f) => f.rule === 'capacity-scale');
const deck = (fmClass, body) => `---\nmarp: true\n${fmClass ? `class: ${fmClass}\n` : ''}---\n\n${body}`;
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
    assert.match(out[0].message, new RegExp(`at 1\\.3x 'cycle' holds about ${ceilXl} items`));
    assert.match(out[0].message, /at the designed size/);
    assert.match(out[0].message, /never shrinks one to fit, so if it does not fit, it is clipped/);
    assert.match(out[0].fix, /(use `scale-l`|drop the `scale-\*` class) for the whole deck/);
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

  test('past the DESIGNED-size budget too, it says a smaller size cannot save the slide', () => {
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
    assert.match(out[0].message, /clipped at 1\.3x and would be at any smaller size/);
    assert.match(out[0].fix, /^Split the slide/);
    assert.doesNotMatch(out[0].fix, /scale-l/);
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
    assert.match(out[0].message, /the block is clipped/);
    assert.match(out[0].message, new RegExp(`${bareXl + 1} lines \\(the pane holds about ${bareXl}\\)`));
    assert.match(out[0].fix, new RegExp(`${bareXl} lines of 78 columns`));
    assert.deepEqual(lint(deck('scale-xl', code(bareXl))), []);
  });

  test('a block past the DESIGNED pane clips at every scale — a warning, never "nothing is clipped"', () => {
    const out = lint(deck('scale-xl', code(30)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /so it is clipped at any size/);
    assert.doesNotMatch(out[0].message, /nothing is clipped/);
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
    assert.match(out[0].message, /a 90-column line \(the pane holds about 78\)/);
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
    assert.match(out[0].message, /at 1\.3x/);
    assert.match(out[0].message, /renders every slide at 1\.3x/);
    assert.match(out[0].fix, /set `venue: (huddle|laptop)` for the whole deck/);
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
    assert.match(out[0].message, /at 1\.5x/);
    assert.match(out[0].fix, /venue: hall/);
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
    assert.ok(out.every((f) => !/at 1\.5x/.test(f.message)), 'never judged at the hall scale');
    assert.ok(out.every((f) => !/venue: hall/.test(f.fix)));
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
  const venueDeck = (venue, body) => `---\nmarp: true\nvenue: ${venue}\n---\n\n${body}`;
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
    assert.match(withCallout[0].message, /'cycle with its callout' holds about 2 items/);
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
    const src = `---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: compare-prose vertical -->\n\n## H.\n\n${side('A')}\n${side('B')}\n\n> The line to remember.\n`;
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
    assert.match(out[0].message, /'compare-prose vertical with its callout' holds about 1/);
  });

  test('a variant finding names the variant row it quotes', () => {
    const vv = { names: new Set(['compare-prose']), modifiers: new Set(['vertical']), capacity: {} };
    const side = (t) => `- ${t}\n  - ${Array.from({ length: 11 }, (_, i) => `w${i}`).join(' ')}.`;
    const out = core.lintTextWith(venueDeck('conference', `<!-- _class: compare-prose vertical -->\n\n## H.\n\n${side('A')}\n${side('B')}\n${side('C')}\n`), vv).filter((f) => f.rule === 'capacity-scale');
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'compare-prose vertical' holds about 2/);
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
    assert.match(out[0].fix, /Add `compact`.*holds 5/);
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
  const run = (cls) => core.lintTextWith(`---\nmarp: true\nvenue: huddle\n---\n\n<!-- _class: ${cls} -->\n\n## H.\n\n${pairs(5)}\n`, v).filter((f) => /^capacity-/.test(f.rule));

  test('the compact hint is not offered where compact would still be over the venue budget', () => {
    for (const f of run('q-and-a')) assert.doesNotMatch(f.fix, /Add `compact`/);
  });

  test('a compact slide its compact budget holds never claims a clip at the designed size', () => {
    for (const f of run('q-and-a compact')) assert.doesNotMatch(f.message, /designed size/);
  });

  test('a compact slide is judged by the measured compact row, not the bare one', () => {
    // q-and-a bare holds 3 at huddle, compact 4 (calibrate-capacity --variant compact).
    const out = run('q-and-a compact');
    assert.equal(out.length, 1, 'five pairs are still one past the compact huddle row');
    assert.match(out[0].message, /'q-and-a compact' holds about 4/);
    const four = core.lintTextWith(`---\nmarp: true\nvenue: huddle\n---\n\n<!-- _class: q-and-a compact -->\n\n## H.\n\n${pairs(4)}\n`, v).filter((f) => f.rule === 'capacity-scale');
    assert.deepEqual(four, [], 'four compact pairs fit at huddle, where the bare row said 3');
  });
});

describe('venue-only rows count on their own axis', () => {
  test('obligation-matrix counts table rows: 7 fit at laptop, 5 at hall', () => {
    const v = { names: new Set(['obligation-matrix']), modifiers: new Set(), capacity: {} };
    const rows = (n) => Array.from({ length: n }, (_, i) => `| Regime ${i + 1} | [x] | [-] | [x] | [x] | [/] |`).join('\n');
    const deck = (venue, n) => `---\nmarp: true\n${venue ? `venue: ${venue}\n` : ''}---\n\n<!-- _class: obligation-matrix -->\n\n## H.\n\n| Regulation | Notice | Consent | Retention | Breach | DSAR |\n| --- | :-: | :-: | :-: | :-: | :-: |\n${rows(n)}\n`;
    const run = (venue, n) => core.lintTextWith(deck(venue, n), v).filter((f) => f.rule === 'capacity-scale');
    assert.deepEqual(run('hall', 5), []);
    assert.equal(run('hall', 6).length, 1);
    assert.match(run('hall', 6)[0].message, /holds about 5 rows/);
  });
});

test('endsWithCallout tracks comments by state, including a second comment left open on a line', () => {
  assert.equal(core.endsWithCallout('<!-- a --> <!-- b\n> inside a comment\n-->'), false);
  assert.equal(core.endsWithCallout('## H.\n\n<!-- note -->\n> The line.'), true);
});

describe('a claim panel is judged by the LINES its text wraps to (split-panel, Amendments (5)-(6))', () => {
  const v = { names: new Set(['split-panel']), modifiers: new Set(['proof', 'capstone', 'metric']), capacity: {} };
  // Four-letter words, so a line's word count is exact: at hall a `proof` heading line holds 4
  // (23.4 characters), a question or lede line 5 (22.5 / 28.6), and at conference a lede line 6 (33).
  const w = (n, word = 'abcd') => Array.from({ length: n }, () => word).join(' ');
  const points = '- You know you are here when\n  - The team ships.\n- Proof one\n  - It holds.\n- Proof two\n  - It lasts.\n';
  // `size: 4k`: the geometry is measured on a 2160-high slide, whose frame tolerance these tests assume.
  const deck = (venue, cls, l, q = '*Why?* ') => `---\nmarp: true\nsize: 4k\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n\`Step 1\`\n\n## ${w(8)}\n\n${q}${w(l)}\n\n${points}`;
  const run = (...a) => core.lintTextWith(deck(...a), v).filter((f) => f.rule === 'capacity-scale');
  const raw = (venue, cls, body) => core.lintTextWith(`---\nmarp: true\nsize: 4k\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');

  test('a proof panel past its column at hall warns, and names the lines it counted', () => {
    // hall, proof: eyebrow 140.2 + heading 2 × 134.4 + question 189 + lede lines × 144.3 against 1740.
    assert.deepEqual(run('hall', 'split-panel proof', 35), []); // 7 lede lines: 1608
    const over = run('hall', 'split-panel proof', 40); // 8 lede lines: 1752.4
    assert.equal(over.length, 1);
    assert.match(over[0].message, /'split-panel proof' claim panel's text runs about 1% past its column \(eyebrow 1 line, heading 2 lines, question 1 line, lede 8 lines\)/);
    assert.match(over[0].fix, /Shorten the heading or the lede/);
  });

  test('the same slide fits a smaller room, where a lede line holds more', () => {
    assert.deepEqual(run('conference', 'split-panel proof', 40), []);
  });

  test('the opening question is its own block: the same words fit without it', () => {
    assert.deepEqual(run('hall', 'split-panel proof', 38, ''), []);
    assert.equal(run('hall', 'split-panel proof', 37).length, 1);
  });

  test('characters decide, not words: the same word count in longer words overflows', () => {
    const body = (word) => `\`Step 1\`\n\n## ${w(8)}\n\n*Why?* ${w(35, word)}\n\n${points}`;
    assert.deepEqual(raw('hall', 'split-panel proof', body('abcd')), []);
    assert.equal(raw('hall', 'split-panel proof', body('abcdefgh')).length, 1);
  });

  test('capstone reads its own row (a smaller question), also beside `proof`, and the bare row is stricter', () => {
    assert.equal(run('hall', 'split-panel proof', 37).length, 1);
    assert.deepEqual(run('hall', 'split-panel proof capstone', 37), []);
    assert.deepEqual(run('hall', 'split-panel capstone', 35), []);
    assert.equal(run('hall', 'split-panel', 35).length, 1);
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
    assert.match(g.fix, /for the whole deck/);
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

test('a row of 0 says the venue holds not one element, and never "keep 0"', () => {
  const v = { names: new Set(['timeline-list']), modifiers: new Set(), capacity: {} };
  const items = Array.from({ length: 2 }, (_, i) => `1. \`2025 Q${i + 1}\` Phase ${i}\n   - ${Array.from({ length: 16 }, (_, j) => `word${j}`).join(' ')}.`).join('\n');
  const [f] = core.lintTextWith(`---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: timeline-list -->\n\n## H.\n\n${items}\n`, v).filter((x) => x.rule === 'capacity-scale');
  assert.match(f.message, /holds not one item/);
  assert.doesNotMatch(f.fix, /Keep 0/);
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
    assert.match(out[0].message, /at 1\.5x the 'list takeaway' slide's text runs about \d+% past what the slide holds, counted in wrapped lines/);
    // The room it offers is the largest whose lines hold the slide, read off the same geometry.
    const at = core.rowsAt('list', ['list', 'takeaway'], `## Five signs a problem is hard.\n\n${nested(5)}\n`);
    const fits = [2, 1, 0].find((r) => !at(r).over);
    assert.match(out[0].fix, new RegExp(`set \`venue: ${['laptop', 'huddle', 'conference'][fits]}\` for the whole deck`));
  });

  test('a 720-high deck forgives what the export forgives: 12 layout px, 36 of a 2160 slide', () => {
    // retire-automatic-scale-fit.md slide 4 read 1% over its budget and renders whole: the overflow
    // probe's tolerance is 12 LAYOUT px at every size, three times the 4k budget's share at 720 high.
    const slide = '## H.\n\n' + Array.from({ length: 5 }, (_, i) => `- ${cap(w(3, i))}\n  - ${cap(w(10, i + 3))}.`).join('\n') + '\n';
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
    const items = (mark) => Array.from({ length: 6 }, (_, i) => `${mark(i)} ${cap(w(13, i))}.`).join('\n');
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
    // The render sets this heading on ONE line. Outfit's widths, or Playfair's without the kerning
    // share, read it as two and warn on a slide that fits.
    assert.equal(core.rowsAt('list', ['list', 'takeaway', 'numbered'], SD95)(1).over, false);
    const h = 'Four sentences hold, or the data design is not one you can defend.';
    const c = require('../../../lib/authoring/venue-capacity.generated.js').rowFrame.heading[1][0];
    assert.equal(core.wrapLines(h, c, core.GLYPH_DISPLAY), 1);
    assert.equal(core.wrapLines(h, c, true), 2, 'in Outfit it would be two');
  });

  test('a claim panel heading in Playfair: slide 224 at hall has three heading lines, as rendered', () => {
    const p = core.panelOver('split-panel', ['split-panel', 'capstone'], SD224, 3);
    assert.equal(p.n.heading, 3);
    assert.equal(p.over, false);
  });

  test('a proof panel with no opening question has the question gap back (slide 192 fits, 1 px over the proof budget)', () => {
    const p = core.panelOver('split-panel', ['split-panel', 'proof'], SD192, 2);
    assert.deepEqual(p.n, { eyebrow: 2, heading: 4, lede: 8 }, 'the rendered line counts');
    assert.equal(p.over, false);
    assert.ok(p.pct <= 0, 'the percentage reads against the same budget as the verdict');
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
    assert.match(find('')[0].message, /counted in wrapped lines/);
    for (const fm of ['class: sketch\n', 'meta: "Q3 review"\n', 'logo: logo.svg\n', 'preset: brand\n']) {
      assert.ok(find(fm).every((f) => !/counted in wrapped lines/.test(f.message)), `${fm.trim()} keeps the count row`);
    }
    assert.match(find('theme: indaco\npaginate: true\nheader: "H"\n')[0].message, /counted in wrapped lines/, 'inert keys ride along');
  });

  test('the generated table: rows per component, one shared frame, `ordered` carrying only what differs', () => {
    const V = require('../../../lib/authoring/venue-capacity.generated.js');
    assert.deepEqual(Object.keys(V.rows).sort(), ['cards-grid', 'list', 'list-steps']);
    assert.ok(V.rowFrame.heading && V.rowFrame.eyebrow && V.rowFrame.callout);
    assert.deepEqual(Object.keys(V.rows['cards-grid'].regs[''].ordered.nested), ['row'], 'a numbered card differs only in its row cost');
    assert.equal(V.rows['cards-grid'].regs[''].cols, 2);
    assert.ok(V.rows['cards-grid'].regs[''].span > 1, 'a lone last card spans the row');
    assert.equal(V.rows['list-steps'].regs[''].cols, 0);
  });
});
