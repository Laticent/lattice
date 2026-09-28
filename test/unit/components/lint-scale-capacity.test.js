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

  test('past the scale-xl budget → one info finding naming both budgets and the clip', () => {
    const out = lint(deck(null, slide('list-steps scale-xl', ceilXl + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'info');
    assert.equal(out[0].classToken, 'list-steps');
    assert.match(out[0].message, new RegExp(`at 1\\.3x 'list-steps' holds about ${ceilXl} items`));
    assert.match(out[0].message, /at the designed size/);
    assert.match(out[0].message, /never shrinks one to fit, so if it does not fit, it is clipped/);
    assert.match(out[0].fix, /(use `scale-l`|drop the `scale-\*` class) for the whole deck/);
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
  const v = { names: new Set(['list-steps']), modifiers: new Set(), fitNames: ['report', 'heal', 'trim'],
    capacity: { 'list-steps': { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5 } } };
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
    const row = core.SCALE_CAPACITY['list-steps'];
    const len = Math.max(...Object.keys(row).map(Number));
    const n = row[len][2] + 1;
    if (n > 5) return; // needs a count inside `hard`
    const src = deck('scale-xl', slide('list-steps', n)).replace('marp: true', 'marp: true\nfit: report');
    const f = rules(src).find((x) => x.rule === 'capacity-scale');
    assert.equal(f?.severity, 'info');
    assert.doesNotMatch(f.message, /fit: report/);
  });

  test('a slide\'s own fit-heal changes nothing: no fit level shrinks a slide', () => {
    const row = core.SCALE_CAPACITY['list-steps'];
    const len = Math.max(...Object.keys(row).map(Number));
    const n = row[len][2] + 1;
    if (n > 5) return;
    const src = deck('scale-xl', slide('list-steps fit-heal', n)).replace('marp: true', 'marp: true\nfit: report');
    assert.equal(rules(src).find((x) => x.rule === 'capacity-scale')?.severity, 'info');
  });
});

describe('capacity-scale — under a venue', () => {
  const venueDeck = (venue, body) => `---\nmarp: true\nvenue: ${venue}\n---\n\n${body}`;
  const xl = core.SCALE_CAPACITY['list-steps'];
  const longCol = Math.max(...Object.keys(xl).map(Number));

  test('venue: conference reads the scale-xl budget and warns', () => {
    const out = lint(venueDeck('conference', slide('list-steps', xl[longCol][2] + 1)));
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
      const out = lint(venueDeck('hall', slide('list-steps', n)));
      const want = names[[2, 1, 0].find((i) => n <= row[i])];
      assert.match(out[0].fix, new RegExp(`set \`venue: ${want}\``), `${n} items at hall → ${want}`);
    }
  });

  test('venue: hall reads the scale-2xl budget and asks for fewer words', () => {
    const out = lint(venueDeck('hall', slide('list-steps', xl[longCol][3] + 1)));
    assert.equal(out.length, 1);
    assert.equal(out[0].severity, 'warning');
    assert.match(out[0].message, /at 1\.5x/);
    assert.match(out[0].fix, /venue: hall/);
  });

  test('venue: laptop, and an unknown venue, are the designed size — silent', () => {
    assert.deepEqual(lint(venueDeck('laptop', slide('list-steps', 5))), []);
    assert.deepEqual(lint(venueDeck('stadium', slide('list-steps', 5))), []);
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
    const src = `---\nmarp: true\nvenue: hall\n---\n\n${slide('list-steps venue-huddle', 5)}`;
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
  const v = { names: new Set(['list', 'list-steps']), modifiers: new Set(['takeaway', 'insight-so-what']),
    capacity: { list: { axis: 'item', min: 2, sweet: 4, soft: 5, hard: 6 }, 'list-steps': { axis: 'item', min: 3, sweet: 4, soft: 5, hard: 5 } } };
  const run = (src) => core.lintTextWith(src, v).filter((f) => f.rule === 'capacity-scale');
  const bullets = (n, words) => Array.from({ length: n }, () => `- ${Array.from({ length: words }, (_, i) => `w${i}`).join(' ')}`).join('\n');

  test('word lengths between two measured columns are interpolated, not rounded up', () => {
    const map = { 6: [6, 5, 5, 4], 14: [3, 3, 3, 2] };
    assert.equal(core.wordMapAt(map, 10, 0), 4); // 6 + (3 - 6) * 4 / 8 = 4.5 → 4
    assert.equal(core.wordMapAt(map, 6, 0), 6);
    assert.equal(core.wordMapAt(map, 20, 3), 2);
    assert.equal(core.wordMapAt(map, 3, 1), 5);
  });

  test('a variant with its own measured row is judged by it: list takeaway holds more than list', () => {
    const bare = run(venueDeck('conference', `<!-- _class: list -->\n\n## H.\n\n${bullets(5, 10)}\n`));
    const takeaway = run(venueDeck('conference', `<!-- _class: list takeaway -->\n\n## H.\n\n${bullets(5, 10)}\n`));
    assert.equal(bare.length, 1, 'bare list at 10 words holds 3 at conference');
    assert.deepEqual(takeaway, [], 'list takeaway at 10 words holds 8 at conference');
  });

  test('an insight callout costs the slide its measured elements', () => {
    const steps = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - reads the ticket and plans the change before anyone asks it to\n`).join('');
    const plain = run(venueDeck('conference', `<!-- _class: list-steps -->\n\n## H.\n\n${steps(3)}`));
    const withCallout = run(venueDeck('conference', `<!-- _class: list-steps insight-so-what -->\n\n## H.\n\n${steps(3)}\n> The line to remember.\n`));
    assert.deepEqual(plain, [], 'three steps fit at conference');
    assert.equal(withCallout.length, 1, 'with a callout, conference holds two');
    assert.match(withCallout[0].message, /'list-steps with its callout' holds about 2 items/);
  });

  test('the callout is the trailing blockquote, not the insight-* class that relabels it', () => {
    const steps = (n) => Array.from({ length: n }, (_, i) => `${i + 1}. Step ${i + 1}\n   - reads the ticket and plans the change before anyone asks it to\n`).join('');
    assert.deepEqual(run(venueDeck('conference', `<!-- _class: list-steps insight-so-what -->\n\n## H.\n\n${steps(3)}`)), [], 'a class with no blockquote costs nothing');
    assert.equal(run(venueDeck('conference', `<!-- _class: list-steps -->\n\n## H.\n\n${steps(3)}\n> Key insight.\n`)).length, 1, 'a bare blockquote is a callout');
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

  test('a variant measured with its callout is judged by that row: list takeaway with a callout', () => {
    // list takeaway at 10 words holds 3 at hall, and 2 with a trailing callout (measured).
    assert.deepEqual(run(venueDeck('hall', `<!-- _class: list takeaway -->\n\n## H.\n\n${bullets(3, 10)}\n`)), []);
    const out = run(venueDeck('hall', `<!-- _class: list takeaway -->\n\n## H.\n\n${bullets(3, 10)}\n\n> The line to remember.\n`));
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'list takeaway with its callout' holds about 2/);
  });

  test('a variant finding names the variant row it quotes', () => {
    const out = run(venueDeck('hall', `<!-- _class: list takeaway -->\n\n## H.\n\n${bullets(4, 10)}\n`));
    assert.equal(out.length, 1);
    assert.match(out[0].message, /'list takeaway' holds about 3/);
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

describe('a claim panel is judged by its heading and lede (split-panel, Amendment (5))', () => {
  const v = { names: new Set(['split-panel']), modifiers: new Set(['proof', 'capstone', 'metric']), capacity: {} };
  const w = (n) => Array.from({ length: n }, (_, i) => `word${i}`).join(' ');
  const points = '- You know you are here when\n  - The team ships.\n- Proof one\n  - It holds.\n- Proof two\n  - It lasts.\n';
  const deck = (venue, cls, h, l) => `---\nmarp: true\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n\`Step 1\`\n\n## ${w(h)}.\n\n*Why?* ${w(l - 1)}.\n\n${points}`;
  const run = (...a) => core.lintTextWith(deck(...a), v).filter((f) => f.rule === 'capacity-scale');
  const raw = (venue, cls, body) => core.lintTextWith(`---\nmarp: true\nvenue: ${venue}\n---\n\n<!-- _class: ${cls} -->\n\n${body}`, v).filter((f) => f.rule === 'capacity-scale');

  test('a proof lede past the hall row warns and names the panel', () => {
    // The proof row at hall holds 32 lede words under a 9-word heading.
    assert.deepEqual(run('hall', 'split-panel proof', 9, 32), []);
    const over = run('hall', 'split-panel proof', 9, 40);
    assert.equal(over.length, 1);
    assert.match(over[0].message, /'split-panel proof' panel holds about 32 lede words under a 9-word heading; this slide has 40/);
    assert.match(over[0].fix, /Shorten the heading or the lede/);
  });

  test('the same slide fits a smaller room', () => {
    assert.deepEqual(run('conference', 'split-panel proof', 9, 40), []);
  });

  test('capstone reads its own row, and the bare row is stricter', () => {
    assert.deepEqual(run('hall', 'split-panel capstone', 9, 32), []);
    assert.equal(run('hall', 'split-panel', 9, 32).length, 1);
  });

  test('a variant the bare row does not describe is not judged by it', () => {
    assert.deepEqual(run('hall', 'split-panel metric', 9, 32), []);
  });

  test('a `#` inside a code fence is not the heading, and an image line is not the lede', () => {
    const body = `\`\`\`sh\n# a comment\n\`\`\`\n\n## ${w(9)}.\n\n![A diagram](a.png)\n\n${w(40)}.\n\n${points}`;
    assert.equal(raw('hall', 'split-panel proof', body).length, 1);
  });

  test('past the longest measured heading the row keeps falling, not flat', () => {
    // 12 words hold 28 at hall and 9 hold 32, so a 15-word heading holds 24.
    const [f] = run('hall', 'split-panel proof', 15, 26);
    assert.match(f.message, /holds about 24 lede words under a 15-word heading/);
  });

  test('a row at the most the rig tried reads as a floor', () => {
    const [f] = run('huddle', 'split-panel proof', 3, 90);
    assert.match(f.message, /holds about 80\+ lede words/);
  });

  test('past the laptop row too, the fix offers no smaller room', () => {
    const [f] = run('hall', 'split-panel', 12, 40);
    assert.doesNotMatch(f.fix, /venue: laptop|for the whole deck/);
    const [g] = run('hall', 'split-panel proof', 9, 40);
    assert.match(g.fix, /for the whole deck/);
  });

  test('a panel over its row is reported beside an over-full list, not hidden by it', () => {
    const long = Array.from({ length: 4 }, (_, i) => `- Point ${i}\n  - ${w(14)}.`).join('\n');
    const found = raw('hall', 'split-panel', `## ${w(12)}.\n\n${w(40)}.\n\n${long}\n`);
    assert.equal(found.length, 2);
    assert.ok(found.some((f) => /panel holds/.test(f.message)) && found.some((f) => /items/.test(f.message)));
  });
});

test('a row of 0 says the venue holds not one element, and never "keep 0"', () => {
  const v = { names: new Set(['timeline-list']), modifiers: new Set(), capacity: {} };
  const items = Array.from({ length: 2 }, (_, i) => `1. \`2025 Q${i + 1}\` Phase ${i}\n   - ${Array.from({ length: 16 }, (_, j) => `word${j}`).join(' ')}.`).join('\n');
  const [f] = core.lintTextWith(`---\nmarp: true\nvenue: hall\n---\n\n<!-- _class: timeline-list -->\n\n## H.\n\n${items}\n`, v).filter((x) => x.rule === 'capacity-scale');
  assert.match(f.message, /holds not one item/);
  assert.doesNotMatch(f.fix, /Keep 0/);
});
