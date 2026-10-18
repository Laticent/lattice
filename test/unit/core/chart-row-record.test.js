// A chart row written as ONE `{…}` record draws what the old spans drew (the chart authoring model,
// engineering/decisions/2026-10-14-chart-authoring-uniform-model.md §9, §10 phase 2).
//
// The matrix is every chart the model covers, each as an old form and a record form of the SAME rows,
// compared on the engine, on the runtime bundle over marp-core-shaped markup, and in the narration.
// Every arm carries its control: the record is not vacuously equal because both sides drew nothing.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const rows = require('../../../lib/core/chart-rows.js');
const { bridgeRecordsSource } = require('../../../lib/core/chart-source-bridge.js');
const engine = require('../../../lib/engine');
const { narrateChart } = require('../../../lib/core/chart-narration.js');

const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## A\n\n${body}\n`;
const render = (src) => engine.render(src, {}).html;

/** [chart, old body, record body]: the same rows, written both ways. */
const MATRIX = [
  ['bar', '- EMEA `4.2`\n- APAC `1.8`', '- EMEA `{4.2}`\n- APAC `{1.8}`'],
  ['line', '- Q1 `3`\n- Q2 `5`\n- Q3 `4`', '- Q1 `{3}`\n- Q2 `{5}`\n- Q3 `{4}`'],
  ['piechart', '- Direct `60%`\n- Partner `40%`', '- Direct `{60%}`\n- Partner `{40%}`'],
  // A grouped number (`1,200`) is not a record value: Segno reads numbers ISO in (model note §5).
  ['funnel', '- Visits `1200`\n- Signups `300`', '- Visits `{1200}`\n- Signups `{300}`'],
  ['waterfall', '- Start `10`\n- Gain `+2`\n- End `12` `total`', '- Start `{10}`\n- Gain `{+2}`\n- End `{12, total}`'],
  ['word-cloud', '- lattice `9`\n- chart `5`', '- lattice `{9}`\n- chart `{5}`'],
  ['map', '- India `12`\n- Kenya `8`', '- India `{12}`\n- Kenya `{8}`'],
  ['bullet', '- Uptime `4.2M` `5.0M`\n- Cost `3` `5`', '- Uptime `{4.2M, target=5.0M}`\n- Cost `{3, target=5}`'],
  ['progress', '- Build `68%` `at-risk`\n- Docs `90%` `on-track`', '- Build `{68%, at-risk}`\n- Docs `{90%, on-track}`'],
  ['stacked-bar', '- FY23\n  - Licenses `18.4`\n  - Services `6.2`\n- FY24\n  - Licenses `19.1`\n  - Services `7.0`',
    '- FY23\n  - Licenses `{18.4}`\n  - Services `{6.2}`\n- FY24\n  - Licenses `{19.1}`\n  - Services `{7.0}`'],
  ['slope', '- Northwind\n  - 2023 `31%`\n  - 2026 `24%`\n- Kestrel\n  - 2023 `22%`\n  - 2026 `29%`',
    '- Northwind\n  - 2023 `{31%}`\n  - 2026 `{24%}`\n- Kestrel\n  - 2023 `{22%}`\n  - 2026 `{29%}`'],
  ['radar', '- Meridian\n  - Speed `9`\n  - Price `7`\n  - Fit `8`\n- Orbit\n  - Speed `6`\n  - Price `8`\n  - Fit `7`',
    '- Meridian\n  - Speed `{9}`\n  - Price `{7}`\n  - Fit `{8}`\n- Orbit\n  - Speed `{6}`\n  - Price `{8}`\n  - Fit `{7}`'],
  ['heatmap', '| | Mon | Tue |\n|---|---|---|\n| AM | 3 | 5 |\n| PM | 7 | 2 |',
    '| | Mon | Tue |\n|---|---|---|\n| AM | `{3}` | `{5}` |\n| PM | `{7}` | `{2}` |'],
  ['matrix-grid', '| | Alpha | Beta |\n|---|---|---|\n| Speed | [x] | [-] |\n| Cost | [ ] | [x] |',
    '| | Alpha | Beta |\n|---|---|---|\n| Speed | `{done}` | `{partial}` |\n| Cost | `{todo}` | `{done}` |'],
  // Scatter and quadrant read a record already; the matrix pins that the claim leaves them whole.
  ['scatter', '- A `{1, 2}`\n- B `{3, 4}`\n- C `{5, 3}`', '- A `{1, 2}`\n- B `{3, 4}`\n- C `{5, 3}`'],
  ['quadrant', '- Quick\n  - Digest `{2, 82}`\n- Bets\n  - Model `{8, 88}`', '- Quick\n  - Digest `{2, 82}`\n- Bets\n  - Model `{8, 88}`'],
];

describe('the matrix covers every chart the model does', () => {
  test('one case per chart with a row schema', () => {
    assert.deepEqual(MATRIX.map((m) => m[0]).sort(), [...rows.ROW_CHARTS].sort());
  });
});

describe('engine: a record row draws what its old spans drew', () => {
  for (const [chart, old, rec] of MATRIX) {
    test(chart, () => {
      const was = render(deck(chart, old));
      assert.match(was, /chart-frame/, `${chart}: the control is drawn`);
      assert.equal(render(deck(chart, rec)), was, `${chart}: the record form renders the same HTML`);
    });
  }
});

describe('narration: a record row reads as its old spans', () => {
  for (const [chart, old, rec] of MATRIX) {
    test(chart, () => {
      const was = narrateChart(deck(chart, old));
      assert.ok(was, `${chart}: the control narrates`);
      assert.equal(narrateChart(deck(chart, rec)), was);
    });
  }
});

describe('runtime: the DOM mirror leaves the record to the chart', () => {
  const md = new MarkdownIt();
  async function boot(cls, body) {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><section class="${cls}">${md.render(`## A\n\n${body}`)}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return dom.window.document.querySelector('section').innerHTML;
  }
  for (const [chart, old, rec] of MATRIX) {
    test(chart, async () => {
      const was = await boot(chart, old);
      assert.match(was, /chart-body|-figure/, `${chart}: the control is drawn`);
      assert.equal(await boot(chart, rec), was);
    });
  }
});

describe('runtime: a pill drawn earlier in the row does not change who owns the record', () => {
  const md = new MarkdownIt();
  const boot = async (cls, body) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body><section class="${cls}">${md.render(`## A\n\n${body}`)}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    return dom.window.document.querySelector('section').innerHTML;
  };
  test('a bold-wrapped value in the lead is a value to the runtime too, so a delta beside it stays a pill', async () => {
    const html = await boot('bar', '- North **`40`** up `{+3%}`\n- South `30`\n- East `20`');
    assert.match(html, /North 40 up \+3%/, 'the label keeps its delta pill');
    const nested = await boot('bar', '- Q1 **`16`**\n  - vs plan `{-12%}`\n- Q2 `20`\n- Q3 `18`');
    assert.doesNotMatch(nested, /<code>\{-12%\}<\/code>/, 'the detail keeps a pill, not raw braces');
  });

  test('a comment between a non-value span and the record, and an escaped span earlier in the row, leave the record claimed in the runtime too', async () => {
    for (const body of ['- EMEA `on-track` <!-- c --> `{3}`\n- APAC `4`', '- EMEA `\\{4}` more `{3}`\n- APAC `40`']) {
      const html = await boot('bar', body);
      assert.doesNotMatch(html, /\{3\}/, `${body}: no raw braces and no pill: the row draws its value`);
      assert.match(html, /<desc>EMEA [\s\S]*?3; APAC /, body);
    }
  });

  test('a record followed by a no-break space draws in the runtime as the old form does, with no raw braces', async () => {
    const was = await boot('bar', '- EMEA `4` &nbsp;\n- APAC `3`');
    const html = await boot('bar', '- EMEA `{4}` &nbsp;\n- APAC `3`');
    assert.equal(html, was, 'identical to the old form on this surface (the kernel drops a value followed by a no-break space either way)');
    assert.doesNotMatch(html, /\{4\}/);
  });
  test('a badge `{1, circle, c5}` before the record is a pill and not a value, as in the engine', async () => {
    const body = '- North `{1, circle, c5}` grew `{4}`\n- South `{2}`';
    const engineHtml = engine.render(deck('bar', body), {}).html;
    assert.match(engineHtml, /data-value="4"/, 'control: the engine draws North');
    assert.match(await boot('bar', body), /data-value="4"/);
  });
});

describe('ownership: the claim is narrow', () => {
  const place = { lastInRow: true, depth: 1 };
  test('only the row\'s last span, only a record the chart reads, only where it is data', () => {
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', place), true);
    assert.equal(rows.ownsRecordSpan(['bar'], '{NEW, tag}', place), false, 'a pill is not this chart\'s record');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, lastInRow: false }), false, 'a span earlier in the label');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, quoted: true }), false, 'inside a description');
    assert.equal(rows.ownsRecordSpan(['bar'], '{4.2}', { ...place, afterCode: true }), false, 'after another code span');
    assert.equal(rows.ownsRecordSpan(['radar'], '{4.2}', place), false, 'a radar series row draws no mark');
    assert.equal(rows.ownsRecordSpan(['piechart'], '{4.2}', { ...place, depth: 2, ancestors: [['60%']] }), false, 'detail on a fields chart');
    assert.equal(rows.ownsRecordSpan(['stacked-bar'], '{4.2}', { ...place, depth: 2, ancestors: [[]] }), true, 'a segment under a category with no total');
    assert.equal(rows.ownsRecordSpan(['stacked-bar'], '{4.2}', { ...place, depth: 2, ancestors: [['24']] }), false, 'under a total it is read from the old spans until phase 4');
    assert.equal(rows.ownsRecordSpan(['list'], '{4.2}', place), false, 'a slide outside the model');
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{4}', { cell: true, lastInRow: true }), true);
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{4}', place), false, 'a list row on a grid chart');
  });
  test('the pill pass still draws a pill beside a record, and a record outside a chart is a pill', () => {
    const html = (cls, body) => engine.render(deck(cls, body), {}).html;
    assert.match(html('list', '- Row `{4}`'), /lat-pill/);
    // A pill in a description is a pill: the chart family lifts the description, so look at the
    // pill pass alone on a slide whose class the model does not cover.
    assert.match(html('list', '- Row `{4}`\n  > a note `{LIVE}`'), /lat-pill/);
  });
  test('a record in a detail bullet under a valued row is not converted', () => {
    const detail = '<ul><li>Direct <code>60%</code><ul><li>Online <code>{40%}</code></li></ul></li></ul>';
    assert.equal(rows.bridgeRecordsHtml(detail, ['piechart']), detail);
  });
});

describe('runtime mirror: isOwnedRecordElement measures the span\'s place in the DOM', () => {
  // On the runtime the chart family usually bridges the record before the pill pass looks at it, so the
  // fidelity probe cannot tell this mirror from its absence. This pins the mirror itself: it asks
  // `ownsRecordSpan` the same question the engine does, with the place read off the DOM.
  const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
  const code = (cls, inner) => {
    const doc = new JSDOM(`<section class="${cls}">${inner}</section>`).window.document;
    return doc.querySelector('code[data-t]');
  };
  const own = (cls, inner) => isOwnedRecordElement(code(cls, inner));
  test('the row\'s last span, the whole cell', () => {
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code></li></ul>'), true);
    assert.equal(own('bar', '<ul><li><p>EMEA <code data-t>{4.2}</code></p></li></ul>'), true, 'a loose list');
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code><ul><li>d</li></ul></li></ul>'), true, 'the lead ends at a nested list');
    assert.equal(own('heatmap', '<table><tr><td><code data-t>{4}</code></td></tr></table>'), true);
  });
  test('each control fails one condition', () => {
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{4.2}</code> and more</li></ul>'), false, 'not last');
    assert.equal(own('bar', '<ul><li>EMEA <code>1</code> <code data-t>{4.2}</code></li></ul>'), false, 'after another code span');
    assert.equal(own('bar', '<ul><li>EMEA<blockquote><p>see <code data-t>{4.2}</code></p></blockquote></li></ul>'), false, 'in a description');
    assert.equal(own('bar', '<p>Text <code data-t>{4.2}</code></p>'), false, 'not a row');
    assert.equal(own('bar', '<ul><li>EMEA <strong><code data-t>{4.2}</code></strong></li></ul>'), false, 'wrapped, as the engine\'s children are');
    assert.equal(own('bar', '<ul><li>EMEA <code data-t>{NEW, tag}</code></li></ul>'), false, 'a pill');
    assert.equal(own('list', '<ul><li>EMEA <code data-t>{4.2}</code></li></ul>'), false, 'a slide outside the model');
    assert.equal(own('radar', '<ul><li>Meridian <code data-t>{4.2}</code></li></ul>'), false, 'a markless row');
    assert.equal(own('heatmap', '<table><tr><td>3 <code data-t>{4}</code></td></tr></table>'), false, 'more than the record in the cell');
  });
});

// What the adversarial trio found on the first cut (2026-10-16): the paths disagreed about which
// span is the row's data record. Each case below failed before the one decision in
// `ownsRecordSpan`/`isDetailRow` was shared, and carries its control.
describe('the paths agree on the data row', () => {
  const lintCore = require('../../../lib/authoring/lint-core.js');
  const { buildVocab } = require('../../../lib/authoring/lint');
  const { loadAll } = require('../../../lib/components');
  const vocab = buildVocab(loadAll(path.join(ROOT, 'lib/components')));
  const findings = (src) => lintCore.lintTextWith(src, vocab).filter((f) => f.rule === 'chart-row-record-unread');
  const same = (cls, old, rec, why) => assert.equal(render(deck(cls, rec)), render(deck(cls, old)), why);

  test('the chart pick is the dispatcher\'s: the layout order is pinned to the registry', () => {
    const { LAYOUTS } = require('../../../lib/plugins/chart-family/shared/chart-registry.generated');
    assert.deepEqual([...rows.CHART_LAYOUT_ORDER], LAYOUTS,
      'a chart layout was added or reordered in the dispatcher: add it to CHART_LAYOUT_ORDER in lib/core/chart-rows.js at the same position (the record chart pick follows the dispatcher\'s order)');
  });

  test('two chart classes: the chart that draws the slide owns the rows', () => {
    assert.equal(rows.recordChart(['quadrant', 'radar']), 'radar', 'radar draws before quadrant');
    assert.equal(rows.recordChart(['journey', 'heatmap']), null, 'journey draws before heatmap and has no row schema');
    const group = (v) => `- Our capability\n  - People\n    - Hiring ${v(4)}\n    - Retention ${v(3)}\n    - Bench ${v(2)}\n  - Process\n    - Cadence ${v(5)}\n    - Rigor ${v(4)}\n    - Review ${v(3)}`;
    const old = group((n) => `\`${n}\``);
    assert.match(render(deck('quadrant radar', old)), /chart-frame/, 'control: the old form draws a radar');
    same('quadrant radar', old, group((n) => `\`{${n}}\``), 'quadrant radar');
  });

  test('a loose item with a block after its record reads as the old form does', () => {
    same('bar', '- EMEA `4.2`\n\n  more text\n- APAC `1.8`', '- EMEA `{4.2}`\n\n  more text\n- APAC `{1.8}`', 'a second paragraph');
  });

  test('a record in a detail bullet stays a pill on a fields chart, and is data on a series chart', () => {
    // piechart: a bullet under a valued slice is its detail, where a pill is a pill (main's behavior).
    const html = render(deck('piechart', '- Direct `60%`\n  - Online `{40%}`\n- Partner `40%`'));
    assert.match(html, /lat-pill/);
    assert.doesNotMatch(html, /<code>\{40%\}<\/code>/);
    // stacked-bar: the authored total over plain segments is read from the old spans until phase 4, so the same
    // segments written as records are a total's notes, and lint says so; a signed delta is a note anyway.
    assert.match(findings(deck('stacked-bar', '- FY23 `24`\n  - Licenses `{18}`\n  - Services `{6}`'))[0].message, /sits under a row that has a value, so it is read as that row's note/);
    assert.deepEqual(findings(deck('stacked-bar', '- FY23 `24`\n  - vs plan `{+3}`')), [], 'a signed delta is a note');
    // Control: under a category with no total the records are the segments, exactly as the old spans are.
    same('stacked-bar', '- FY23\n  - Licenses `18`\n  - Services `6`\n- FY24\n  - Licenses `20`\n  - Services `10`', '- FY23\n  - Licenses `{18}`\n  - Services `{6}`\n- FY24\n  - Licenses `{20}`\n  - Services `{10}`', 'segments');
  });

  test('a second list on a chart slide keeps its pills; only the first list is the chart\'s', () => {
    const html = render(deck('bar', '- EMEA `{4.2}`\n- APAC `{1.8}`\n\nStatus:\n\n1. Shipped `{12}`'));
    assert.match(html, /data-value="4\.2"/);
    assert.match(html, /lat-pill/);
  });

  test('the bridge rewrites a stamped record, reads an HTML-escaped no-break space inside it, and leaves an unstamped span alone', () => {
    const st = '<code data-lat-record="">';
    assert.equal(rows.bridgeRecordsHtml(`<ul><li>U ${st}{4.2M,&nbsp;target=5.0M}</code></li></ul>`, ['bullet']),
      '<ul><li>U <code>4.2M</code> <code>5.0M</code></li></ul>');
    const tricky = `<ul><li><a href="x" title="a <pre> b">EMEA</a> ${st}{4.2}</code></li><li>APAC ${st}{1.8}</code></li></ul>`;
    assert.equal(rows.bridgeRecordsHtml(tricky, ['bar']).match(/<code>\d/g).length, 2);
    const unstamped = '<ul><li>EMEA <code>{4.2}</code></li></ul>';
    assert.equal(rows.bridgeRecordsHtml(unstamped, ['bar']), unstamped, 'the bridge decides nothing: no stamp, no rewrite');
    const unreadable = `<ul><li>EMEA ${st}{4.2, nosuchfield=1}</code></li></ul>`;
    assert.equal(rows.bridgeRecordsHtml(unreadable, ['bar']), '<ul><li>EMEA <code>{4.2, nosuchfield=1}</code></li></ul>', 'a span with no old form is shown as it was, minus the stamp');
  });

  test('a pipe-less table narrates its records as the old form', () => {
    const rec = 'Skill | A | B\n---|---|---\nS | `{done}` | `{todo}`';
    const old = 'Skill | A | B\n---|---|---\nS | [x] | [ ]';
    assert.equal(bridgeRecordsSource(rec, ['matrix-grid']), old);
  });

  test('lint: a span the chart would draw is silent; one it would lose is named', () => {
    assert.deepEqual(findings(deck('bar', '- EMEA `{NEW, tag}` region `{4.2}`')), [], 'a pill in the label, text between');
    assert.deepEqual(findings(deck('bar', '- EMEA **`{NEW, tag}`** `{4.2}`')), []);
    assert.deepEqual(findings(deck('radar', '- Meridian `{9}`\n  - Speed `7`\n  - Cost `6`\n  - Fit `8`')), [], 'a markless series row is not data');
    const [f] = findings(deck('bullet', '- Spend `{3, targt=5}`\n- Cost `{3, target=5}`'));
    assert.match(f.message, /not a record the bullet chart reads/, 'a record Segno refuses used to vanish from the chart silently');
    assert.equal(findings(deck('bullet', '- Cost `{3, target=5}`')).length, 0, 'control: a good record');
  });

  // The second review round (2026-10-17), each with its control.
  test('an HTML comment that mentions a tag does not switch the bridge off', () => {
    for (const note of ['<!-- avoid a <blockquote> here -->', '<!-- see <pre> -->', '<!-- wrap values in <code> -->']) {
      const old = `${note}\n\n- A \`3\`\n- B \`4\``;
      assert.match(render(deck('bar', old)), /chart-frame/, `control: the old form draws (${note})`);
      same('bar', old, `${note}\n\n- A \`{3}\`\n- B \`{4}\``, note);
    }
  });

  test('a comment, a heading or a setext rule after the record does not end the lead early', () => {
    same('bar', '- A `3`\n  <!-- check -->\n- B `4`', '- A `{3}`\n  <!-- check -->\n- B `{4}`', 'an indented comment');
    same('bar', '- ## A `3`\n- B `4`', '- ## A `{3}`\n- B `{4}`', 'a heading in the item');
    same('bar', '- A `3`\n  ---\n- B `4`', '- A `{3}`\n  ---\n- B `{4}`', 'a setext rule');
  });

  test('a total in a later paragraph of an item is not the item\'s lead', () => {
    const body = (v) => `- FY23\n\n  total ${v('24.6')}\n\n  - Licenses ${v('18.4')}\n  - Services ${v('6.2')}\n- FY24\n  - Licenses ${v('19.1')}\n  - Services ${v('7.0')}`;
    // Only a row's lead paragraph can hold its value, so a later paragraph's `{24.6}` stays a pill, as on main.
    const html = render(deck('stacked-bar', body((n) => `\`{${n}}\``)));
    assert.doesNotMatch(html, /<code>\{24\.6\}<\/code>/);
    assert.equal(bridgeRecordsSource(body((n) => `\`{${n}}\``).split('\n').slice(0, 3).join('\n'), ['stacked-bar']), body((n) => `\`{${n}}\``).split('\n').slice(0, 3).join('\n'), 'the narrator leaves it too');
  });

  test('a comment cannot make the bridge quadratic', () => {
    const src = deck('bar', `- A \`{3}\`\n- B \`{4}\`\n\n<!-- ${'<a ""'.repeat(20000)}' -->`);
    const t = Date.now();
    render(src);
    assert.ok(Date.now() - t < 1500, `rendered in ${Date.now() - t} ms`);
  });

  test('a grid chart owns the first table only, and not a quoted one', () => {
    const st = '<code data-lat-record="">';
    const two = `<table><tr><td>${st}{3}</code></td></tr></table><table><tr><td><code>{7}</code></td></tr></table>`;
    assert.equal(rows.bridgeRecordsHtml(two, ['heatmap']), '<table><tr><td>3</td></tr></table><table><tr><td><code>{7}</code></td></tr></table>');
    // A trailing no-break space after the record stays, as it does in the old form.
    assert.equal(rows.bridgeRecordsHtml(`<table><tr><td>${st}{3}</code>&nbsp;</td></tr></table>`, ['heatmap']), '<table><tr><td>3&nbsp;</td></tr></table>');
    // Ownership is the pill pass's call: a quoted table, a second table, a raw table ahead are never stamped.
    const stamped = (cls, body) => engine.render(deck(cls, body), {}).html.includes('data-lat-record');
    assert.equal(stamped('heatmap', '> | | A |\n> |---|---|\n> | R | `{3}` |'), false);
    const html = engine.render(deck('matrix-grid', '> | | A |\n> |---|---|\n> | S | `{done}` |'), {}).html;
    assert.match(html, /lat-pill|<code>/, 'a quoted matrix-grid table keeps its span');
  });

  // Third review round (2026-10-17): the checker and the inversion compared against MAIN, not against the old
  // form, and found decks that write no record changing. Each case below is what main did.
  test('what main did: a pill in a detail bullet stays a pill, and the parent\'s value is kept', () => {
    const values = (h) => [...h.matchAll(/data-value="([^"]*)"/g)].map((m) => m[1]);
    for (const chart of ['bar', 'line']) {
      const html = render(deck(chart, '- Q1 `3`\n  - vs plan `{+2}`\n- Q2 `5`\n  - vs plan `{-1}`\n- Q3 `4`'));
      assert.match(html, /lat-pill/, `${chart}: the delta stays a pill`);
      assert.doesNotMatch(html, /<code>\{[+-]\d\}<\/code>/, `${chart}: no raw braces`);
      assert.deepEqual(values(html).filter((v) => /^[+-]/.test(v)), [], `${chart}: a delta is not a data value`);
      assert.match(html, /chart-frame/, `${chart}: the chart still draws`);
    }
    // fields charts: every nested row is detail, whether or not its parent holds a value.
    for (const [chart, rowsSrc] of [['piechart', '- North\n  - delta `{+3}`\n- South `40%`\n- East `60%`'], ['funnel', '- Visits\n  - delta `{+3}`\n- Signups `300`\n- Paid `100`']]) {
      const html = render(deck(chart, rowsSrc));
      assert.match(html, /lat-pill/, `${chart}: a detail bullet under a row with no value keeps its pill`);
    }
  });

  test('what main did: bullet keyword rows stay the old form until phase 4, and a record there stays a pill, with a lint warning', () => {
    const html = render(deck('bullet', '- Uptime\n  - Actual `{99.4}`\n  - Target `{99.9}`\n- Cost `3` `5`'));
    assert.match(html, /lat-pill/, 'a nested record is a detail pill on bullet, as on main');
    assert.doesNotMatch(html, /<code>\{99\.4\}<\/code>/);
    assert.ok(findings(deck('bullet', '- Uptime\n  - Actual `{99.4}`\n  - Target `{99.9}`')).length > 0, 'lint says to write the old form');
  });

  test('a slide the chart declines shows the old-form list, not the braces', () => {
    const bare = (body) => `---\nmarp: true\n---\n\n<!-- _class: bar -->\n\n${body}\n`; // no h2: the bar chart declines
    const old = render(bare('- EMEA `4.2`'));
    assert.doesNotMatch(old, /chart-frame/, 'control: the bar declines a slide without a heading');
    assert.equal(render(bare('- EMEA `{4.2}`')), old);
    assert.doesNotMatch(render(bare('- EMEA `{4.2}`')), /\{4\.2\}/);
  });

  test('a total in a later paragraph is left alone by the narration', () => {
    const body = (v) => `- FY23\n\n  total ${v('24.6')}\n\n  - Licenses ${v('18.4')}\n  - Services ${v('6.2')}\n- FY24\n  - Licenses ${v('19.1')}\n  - Services ${v('7.0')}`;
    // The total sits in a later paragraph, so it is not the row's record: the narrator reads it as the pass does.
    assert.match(narrateChart(deck('stacked-bar', body((n) => `\`{${n}}\``))), /Licenses, eighteen point four; Services, six point two/);
  });

  // Fourth round (2026-10-17): the red team ran the working tree against main and found the rest.
  test('bullet: a delta pill under a measure stays a pill; keyword rows under a bare row are data', () => {
    const html = render(deck('bullet', '- EMEA `4` `5`\n  - vs plan `{+3%}`\n- APAC `3` `5`'));
    assert.match(html, /chart-frame/);
    assert.match(html, /lat-pill/);
    assert.ok(findings(deck('bullet', '- Uptime\n  - Actual `{99.4}`\n  - Target `{99.9}`')).length > 0, 'keyword rows as records warn: bullet reads them from the old spans');
    // The documented keyword row under a measure that HAS a value is read from the old spans until phase 4; lint says so.
    const [f, ...rest] = findings(deck('bullet', '- Uptime `99.4` `99.9`\n  - Target `{99.9}`'));
    assert.equal(rest.length, 0);
    assert.match(f.message, /note|keyword|old/);
    assert.deepEqual(findings(deck('bullet', '- Uptime `99.4` `99.9`\n  - vs plan `{+3%}`')), [], 'a delta note is not a keyword row');
  });

  test('narration follows a record onto a lazy-continuation line and a second paragraph', () => {
    const group = (v) => `- G\n  - Us\n    - Speed ${v('8')}\n    - Cost\n      ${v('6')}\n    - Fit ${v('7')}`;
    const old = narrateChart(deck('radar quadrant', group((n) => `\`${n}\``)));
    assert.ok(old, 'control: the old form narrates');
    assert.equal(narrateChart(deck('radar quadrant', group((n) => `\`{${n}}\``))), old);
    // A second paragraph is not the row's lead: its `{6}` is a pill, and the narrator leaves it, as the pass does.
    const loose = (v) => `- Q1\n\n  about ${v('6')}\n- Q2 ${v('5')}\n- Q3 ${v('4')}`;
    const asRecord = loose((n) => `\`{${n}}\``);
    assert.equal(bridgeRecordsSource(asRecord, ['bar']).split('\n')[2], '  about `{6}`');
  });

  // Fifth round (2026-10-17): decks that write no record must render as on main; each case is a repro.
  test('a pill stays a pill when the row already holds a value or the record is not the lead alone', () => {
    const pilled = (cls, body) => {
      const html = render(deck(cls, body));
      assert.doesNotMatch(html, /<code>\{[^}]*\}<\/code>/, body);
    };
    pilled('bar', '- Q1 `5`\n- Q2 `16` `{risk}`\n  - vs plan `{-12%}`');
    pilled('bar', '- North `40` up `{+3%}`\n- South `30`');
    pilled('bar', '- Q1\n\n  about `{+3%}`\n- Q2 `5`');
    pilled('bullet', '- Uptime\n  - vs plan `{+3%}`\n- Cost `3` `5`');
    pilled('radar', '- Us\n  - Speed `{+3%}`\n  - Cost `6`');
  });

  test('a decline or a plugin-off slide shows the old-form list, not braces', () => {
    const { applyToRenderedHtml } = require('../../../lib/plugins/chart-family/chart-family.dispatch');
    const html = render(deck('bar', '- EMEA `{4.2}`\n- APAC `{3}`'));
    const off = applyToRenderedHtml(html, { off: true });
    assert.doesNotMatch(off, /\{4\.2\}/);
    assert.match(off, /data-lattice-off/);
  });

  test('the source bridge ends a paragraph at a setext underline, a rule, an HTML block and a table', () => {
    for (const end of ['---', '***', '<div>x</div>', '| a | b |']) {
      const src = `- A\n  ${end}\n  later \`{6}\`\n`;
      assert.ok(typeof bridgeRecordsSource(src, ['bar']) === 'string', end);
    }
    assert.equal(bridgeRecordsSource('- Q1\n\n  about `{6}`\n', ['bar']), '- Q1\n\n  about `{6}`\n');
  });

  test('a raw list or table ahead of the chart\'s own makes it the second one on every path', () => {
    const raw = (cls, rows) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n## R\n\n<ul><li>raw</li></ul>\n\n${rows}\n`;
    const html = engine.render(raw('bar', '- EMEA `{4.2}`\n- APAC `{1.8}`'), {}).html;
    assert.doesNotMatch(html, /<code>\{4\.2\}<\/code>/, 'no raw braces');
    assert.match(html, /lat-pill/, 'a pill, as on main');
    const grid = engine.render(`---\nmarp: true\n---\n\n<!-- _class: heatmap -->\n\n## R\n\n<table><tr><td>x</td></tr></table>\n\n| | Mon |\n|---|---|\n| AM | \`{3}\` |\n`, {}).html;
    assert.doesNotMatch(grid, /<code>\{3\}<\/code>/);
    assert.ok(findings(raw('bar', '- EMEA `{4.2}`')).length === 0, 'lint agrees it is a pill');
  });

  test('a record after a heading item is a second block: the narrator leaves it, as the pass does', () => {
    const src = '- EMEA `{3}`\n- ## North\n  `{7}`\n';
    assert.equal(bridgeRecordsSource(src, ['bar']), '- EMEA `3`\n- ## North\n  `{7}`\n');
    assert.equal(bridgeRecordsSource('- ## North `{7}`\n', ['bar']), '- ## North `7`\n', 'on the heading line it is the lead');
  });

  test('lint says a record in a later paragraph of a row is not read', () => {
    const [f, ...rest] = findings(deck('bar', '- EMEA\n\n  `{4.2}`\n- APAC `3`'));
    assert.equal(rest.length, 0);
    assert.match(f.message, /later paragraph/);
    assert.deepEqual(findings(deck('bar', '- EMEA `5`\n\n  note `{LIVE}`')), [], 'a pill in a later paragraph is fine');
    assert.deepEqual(findings(deck('bar', '- EMEA `5`\n\n  `{+3%}`\n- APAC `3`')), [], 'the row already has its value');
  });

  // Seventh round (2026-10-17): the second independent checker's confirmed defects.
  test('a different bullet or ordered delimiter starts a new list, so its `{N}` is a pill and the narrator leaves it', () => {
    for (const second of ['* Note `{7}`', '+ Note `{7}`']) {
      const src = `- EMEA \`4\`\n- APAC \`3\`\n${second}`;
      assert.equal(bridgeRecordsSource(src, ['bar']), src, second);
    }
    const ordered = '- EMEA `4`\n2) X `{4}`';
    assert.equal(bridgeRecordsSource(ordered, ['bar']), ordered);
    assert.equal(bridgeRecordsSource('- EMEA `4`\n- APAC `{3}`', ['bar']), '- EMEA `4`\n- APAC `3`', 'control: the same list');
  });

  test('a record before a no-break space is claimed and drawn on every path, with no raw braces', () => {
    for (const [cls, body] of [['bar', '- EMEA `{4}` &nbsp;\n- APAC `3`'], ['heatmap', '| | A |\n|---|---|\n| R | `{3}`&nbsp; |'], ['matrix-grid', '| | A | B |\n|---|---|---|\n| R0 | `{done}`&nbsp; | `{todo}` |']]) {
      const html = engine.render(deck(cls, body), {}).html;
      assert.doesNotMatch(html, /\{(?:4|3|done)\}/, `${cls}: no raw braces`);
      assert.doesNotMatch(html, /data-lat-record/, `${cls}: the stamp never reaches the page`);
    }
    const html = engine.render(deck('matrix-grid', '| | A | B |\n|---|---|---|\n| R0 | `{done}`&nbsp; | `{todo}` |'), {}).html;
    assert.doesNotMatch(html, />\[x\]</, 'the cell is a state, not the literal marker text');
  });

  test('a `<ul>` in a comment or an attribute is not a list', () => {
    assert.deepEqual(rows.rawBlockCounts('<!-- <ul> --><div title="<ul>">x</div>'), { lists: 0, tables: 0 });
    assert.deepEqual(rows.rawBlockCounts('<ul><li><ul></ul></li></ul><table></table>'), { lists: 1, tables: 1 });
  });

  test('a heatmap cell with a named field is no claim: the bridge cannot spell it, so it stays what it was', () => {
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{value=3}', { cell: true, lastInRow: true }), false);
    assert.equal(rows.ownsRecordSpan(['heatmap'], '{3}', { cell: true, lastInRow: true }), true);
  });

  test('a row of many spans stays linear in lint and in the pill pass', () => {
    const src = deck('bar', `- R ${'`{1}` '.repeat(12000)}`);
    const t = Date.now();
    findings(src);
    render(src);
    assert.ok(Date.now() - t < 3000, `lint and render in ${Date.now() - t} ms`);
  });

  // Eighth round (2026-10-17): the third independent checker's confirmed defects.
  test('the runtime ownership check is linear in the spans of one row', () => {
    const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
    const n = 3000;
    const dom = new JSDOM(`<section class="bar"><ul><li>A ${'<code>{1}</code> '.repeat(n)}</li></ul></section>`);
    const codes = [...dom.window.document.querySelectorAll('code')];
    const t = Date.now();
    for (const c of codes) isOwnedRecordElement(c);
    assert.ok(Date.now() - t < 1500, `${n} spans in ${Date.now() - t} ms`);
  });

  test('a lead ends at a raw block in the DOM mirror, and a comment after the record is content, as in the pill pass', () => {
    const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
    const owned = (inner) => isOwnedRecordElement(new JSDOM(`<section class="bar"><ul>${inner}</ul></section>`).window.document.querySelector('code'));
    assert.equal(owned('<li>EMEA <code>{4}</code><div>x</div></li><li>APAC <code>3</code></li>'), true);
    assert.equal(owned('<li>EMEA <code>{4}</code><!-- x --></li><li>APAC <code>3</code></li>'), false, 'the engine counts the comment as a kid after the record');
  });

  test('raw HTML in a paragraph ahead of the list counts as a list ahead, as the bridge counts it', () => {
    const html = engine.render(deck('bar', 'Intro <ul><li>x</li></ul> text\n\n- EMEA `{4.2}`\n- APAC `{1.8}`'), {}).html;
    assert.doesNotMatch(html, /<code>\{4\.2\}<\/code>/);
  });

  test('a raw table ahead makes a matrix-grid\'s table the second one in the cell decoder too', () => {
    const html = engine.render(deck('matrix-grid', '<table><tr><td>raw</td></tr></table>\n\n| Row | C0 | C1 |\n|---|---|---|\n| AMER | +3 | `{done}` |'), {}).html;
    assert.match(html, /lat-pill/, 'the label pill stays a pill, as on main');
  });

  test('a record followed by a no-break space entity narrates as the old form does', () => {
    assert.equal(bridgeRecordsSource('- EMEA `{4.2}`&nbsp;\n- APAC `3`\n', ['bar']), '- EMEA `4.2`&nbsp;\n- APAC `3`\n');
    assert.equal(bridgeRecordsSource('<ul><li>x</li></ul>\n\n- EMEA `{4.2}`\n', ['bar']), '<ul><li>x</li></ul>\n\n- EMEA `{4.2}`\n', 'a raw list ahead: left alone');
  });

  test('rawBlockCounts stays bounded on a huge hostile raw block', () => {
    const t = Date.now();
    rows.rawBlockCounts(`<div>${'<a'.repeat(300000)}"${'x'.repeat(2000)}`);
    rows.rawBlockCounts(`<a`.repeat(120000));
    assert.ok(Date.now() - t < 1500, `${Date.now() - t} ms`);
  });

  test('a record after an earlier pill is not claimed, so it is shown as on main and never as raw braces it did not stamp', () => {
    const html = engine.render(deck('progress', '- North `{LIVE}` `{40%, at-risk}`\n- South `60%` `on-track`\n- East `30%` `done`'), {}).html;
    assert.doesNotMatch(html, /data-lat-record/);
    assert.doesNotMatch(html, /data-s="at-risk"/, 'the pill pass declined it, so the chart does not read it');
    assert.match(findings(deck('progress', '- North `{LIVE}` `{40%, at-risk}`'))[0].message, /after another code span/, 'and lint says the same');
  });

  test('a record never shows as raw braces when a raw block, a stray tag or a quote wrapper sits ahead', () => {
    const cases = [
      ['bar', '<blockquote>\n\n- EMEA `{3}`\n- APAC `{4}`\n\n</blockquote>'],
      ['bar', '</ul>\n\n- EMEA `{3}`\n- APAC `{4}`'],
      ['bar', 'Some text </ul> here.\n\n- EMEA `{3}`\n- APAC `{4}`'],
      ['heatmap', '<blockquote>\n\n| | A | B |\n|---|---|---|\n| R0 | `{3}` | `{5}` |\n| R1 | `{2}` | `{4}` |\n\n</blockquote>'],
    ];
    for (const [cls, body] of cases) {
      const html = engine.render(deck(cls, body), {}).html;
      assert.doesNotMatch(html, /<code[^>]*>\{[0-9]\}<\/code>/, `${cls}: ${body.slice(0, 30)}`);
      assert.doesNotMatch(html, /data-lat-record/, 'the stamp never reaches the page');
      assert.doesNotMatch(html, /\{[0-9]\}/, `${cls}: no braces anywhere in the output`);
    }
  });

  // Eleventh round (2026-10-18): the sixth independent checker's confirmed defects.
  test('many large hostile raw blocks on a chart slide stay linear in the whole slide', () => {
    const block = `<div>${'<a'.repeat(9990)}</div>`;
    const t = Date.now();
    engine.render(deck('bar', `${Array(30).fill(block).join('\n\n')}\n\n- A \`1\``), {});
    findings(deck('bar', `${Array(30).fill(block).join('\n\n')}\n\n- A \`1\``));
    assert.ok(Date.now() - t < 2500, `render and lint in ${Date.now() - t} ms`);
  });

  test('an author-written chart-frame class cannot leave a stamp or raw braces', () => {
    const html = engine.render(deck('bar chart-frame', '- EMEA `{4.2}`'), {}).html;
    assert.doesNotMatch(html, /data-lat-record|\{4\.2\}/);
  });

  test('a matrix-grid behind an inline raw table reads the same on the engine and the pill pass', () => {
    const html = engine.render(deck('matrix-grid', 'Intro <table><tr><td>t</td></tr></table> x\n\n| L | A |\n|---|---|\n| r | `{done}` |'), {}).html;
    assert.match(html, /lat-pill/, 'the table is the second one: the span stays a pill, as on main');
  });

  test('the source bridge leaves a record behind an inline raw list alone, as the render does', () => {
    const src = 'Intro <ul><li>x</li></ul> text\n\n- `code` lead `{1.5}`\n';
    assert.equal(bridgeRecordsSource(src, ['bar']), src);
  });

  test('a literal-mode slide narrates its spans as written', () => {
    const slide = (cls) => `<!-- _class: ${cls} -->\n\n## A\n\n- EMEA \`{3.5}\`\n- APAC \`2\`\n`;
    assert.notEqual(narrateChart(slide('line inline-code-literal')), narrateChart(slide('line')));
  });

  test('no stamp survives the runtime: a built chart that kept a source list, and an export with the chart family off', async () => {
    const run = async (doc) => {
      const dom = new JSDOM(doc, { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true });
      dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
      const el = dom.window.document.createElement('script');
      el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
      dom.window.document.body.appendChild(el);
      await new Promise((r) => setTimeout(r, 300));
      // Not the runtime's own source text: take the script elements out of the DOM, then read the markup.
      for (const script of dom.window.document.querySelectorAll('script')) script.remove();
      return dom.window.document.body.innerHTML;
    };
    const built = await run('<!DOCTYPE html><html><body><section class="progress chart-frame"><div><ul><li>x <code data-lat-record="">{24%, done}</code></li></ul></div></section></body></html>');
    assert.doesNotMatch(built, /data-lat-record/);
    const off = await run('<!DOCTYPE html><html><body><script type="application/lattice-export-settings">{"pluginsOff":["chart-family"]}</script><section class="bar"><h2>A</h2><ul><li>EMEA <code>{4.2}</code></li></ul></section></body></html>');
    assert.doesNotMatch(off, /data-lat-record|\{4\.2\}/, 'the old-form list shows, not braces or a stamp');
  });

  // Twelfth round (2026-10-18): the seventh independent checker's confirmed defects.
  test('raw HTML on a slide that is not a chart costs nothing: no scan, and a matrix-grid scan has a per-slide budget', () => {
    const block = `<div>${'<a '.repeat(2600)}</div>`;
    const plain = `---\nmarp: true\n---\n\n## Plain slide\n\n${Array(240).fill(block).join('\n\n')}\n`;
    let t = Date.now();
    engine.render(plain, {});
    assert.ok(Date.now() - t < 1500, `a plain slide in ${Date.now() - t} ms`);
    t = Date.now();
    engine.render(deck('matrix-grid', `${Array(240).fill(block).join('\n\n')}\n\n| | A |\n|---|---|\n| r | \`{done}\` |`), {});
    assert.ok(Date.now() - t < 2500, `a matrix-grid slide in ${Date.now() - t} ms`);
  });

  test('a hand-written chart-frame class in the browser shows the old-form list, never raw braces', async () => {
    const md = new MarkdownIt({ html: true });
    const dom = new JSDOM(`<!DOCTYPE html><html><body><section class="bar chart-frame">${md.render('## A\n\n- EMEA `{4}`\n- APAC `{3}`')}</section></body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    for (const script of dom.window.document.querySelectorAll('script')) script.remove();
    const html = dom.window.document.body.innerHTML;
    assert.doesNotMatch(html, /data-lat-record|\{4\}|\{3\}/);
  });

  test('inline code that mentions a list tag is no list ahead, for the narrator', () => {
    const slide = (v) => `<!-- _class: bullet -->\n\n## A\n\nUse \`<ul>\` for lists.\n\n- EMEA ${v('4', 'target=5')}\n- APAC ${v('3', 'target=6')}\n`;
    const rec = narrateChart(slide((n, t) => `\`{${n}, ${t}}\``));
    assert.ok(rec);
    assert.equal(rec, narrateChart(slide((n, t) => `\`${n}\` \`${t.replace('target=', '')}\``)));
  });

  test('a deck-wide inline-code: literal register narrates the spans as written', () => {
    const deckSrc = (reg) => `---\nmarp: true\n${reg}---\n\n<!-- _class: bullet -->\n\n## A\n\n- EMEA \`{4, target=5}\`\n- APAC \`{3, target=6}\`\n`;
    // The chart is not drawn in literal mode, so the narration must not describe one (the plain deck's does: "against a five target").
    assert.match(narrateChart(deckSrc('')), /against a five target/, 'control: the plain deck narrates the chart');
    assert.doesNotMatch(narrateChart(deckSrc('inline-code: literal\n')), /against a five target/);
  });

  test('a raw list ahead is no list to a row owner: a hub-spoke slide renders as on main', () => {
    const html = engine.render(deck('hub-spoke bar', '<ul><li>raw</li></ul>\n\n- Hub\n  - Spoke `{risk}`'), {}).html;
    assert.match(html, /<code>\{risk\}<\/code>/, 'as on main: the raw list does not make the hub-spoke owner skip its spans');
  });

  test('the source bridge reads CRLF', () => {
    // The line endings stay: a CRLF slide narrates as the old spans do (nothing either way), and no `\r` is dropped.
    assert.equal(bridgeRecordsSource('- EMEA\r\n  - P `{6.9}`\r\n', ['line']), '- EMEA\r\n  - P `6.9`\r\n');
  });

  test('the DOM mirror reads a record in a heading item, as the engine does', () => {
    const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
    const el = new JSDOM('<section class="slope"><ul><li>EMEA<ul><li><h3>2024 <code data-t>{55%}</code></h3></li></ul></li></ul></section>').window.document.querySelector('code[data-t]');
    assert.equal(isOwnedRecordElement(el), true);
  });

  // Thirteenth round (2026-10-18): the adversarial trio on caf836b (red team + inversion).
  test('ownership costs a row its own span, not its ancestors again: a parent of many pills over many children stays fast', () => {
    const { lintText } = require('../../../lib/authoring/lint.js');
    const pills = Array.from({ length: 400 }, (_, i) => `\`{NEW ${i}, tag, c3}\``).join(' ');
    const kids = (v) => Array.from({ length: 400 }, (_, i) => `  - c${i} \`${v(i)}\``).join('\n');
    for (const [label, v] of [['no record', (i) => `${i}`], ['records', (i) => `{${i}}`]]) {
      const src = `<!-- _class: bar -->\n\n## A\n\n- P ${pills}\n${kids(v)}\n`;
      for (const [path, run, budget] of [['lint', () => lintText(src), 3000], ['engine', () => render(src), 800], ['narration', () => narrateChart(src), 600]]) {
        const t = Date.now();
        run();
        assert.ok(Date.now() - t < budget, `${label}, ${path}: ${Date.now() - t} ms`);
      }
    }
  });

  test('the pipe lint reads each table row once, however many delimiter-like rows the body has', () => {
    const { lintText } = require('../../../lib/authoring/lint.js');
    const row = `|${'-|'.repeat(20)}`;
    const src = `<!-- _class: heatmap -->\n\n## A\n\n| a | b \`{> x}\` |\n${Array(4000).fill(row).join('\n')}\n`;
    const t = Date.now();
    lintText(src);
    assert.ok(Date.now() - t < 2500, `${Date.now() - t} ms`);
  });

  test('a badge record before the label and a value record: the chart reads neither, and lint says so', () => {
    const { lintText } = require('../../../lib/authoring/lint.js');
    const warns = (cls, body) => lintText(deck(cls, body)).filter((f) => f.rule === 'chart-row-record-unread').map((f) => f.message);
    assert.equal(warns('bar', '- `{1}` North `{40}`\n- `{2}` South `{30}`').length, 2);
    assert.equal(warns('piechart', '- `{1}` Direct `{60%}`').length, 1);
    // A plain-number badge before a record value loses the row too (the old form `1` North `40` draws 40).
    assert.equal(warns('bar', '- `1` North `{40}`\n- South `30`').length, 1);
    // Silent where the old form's reading is kept: a note record beside a plain value (the engine draws no bar for that row,
    // as it draws none for the old form's note; the row's record is a pill either way), a shaped badge, a badge before a plain value.
    assert.deepEqual(warns('bar', '- North `40` grew `{+4}`'), []);
    assert.deepEqual(warns('bar', '- `{1, circle}` North `{40}`'), []);
    assert.deepEqual(warns('bar', '- `{1}` North `40`'), []);
    assert.match(render(deck('bar', '- `{1, circle}` North `{40}`\n- `{2, circle}` South `{30}`')), /data-value="40"/, 'a shaped badge leaves the record its value');
  });

  test('the keyword-row fix names the plain span, not the record', () => {
    const { lintText } = require('../../../lib/authoring/lint.js');
    const fixes = lintText(deck('bullet', '- Up `{4.2, target=5}`\n  - Floor `{2}`')).filter((f) => f.rule === 'chart-row-record-unread').map((f) => f.fix);
    assert.equal(fixes.length, 1);
    assert.match(fixes[0], /a plain `2` span/);
  });

  test('a chart list inside a quote does not read records, and lint says so; the old form there is silent', () => {
    const { lintText } = require('../../../lib/authoring/lint.js');
    const warns = (body) => lintText(deck('bar', body)).filter((f) => f.rule === 'chart-row-record-unread');
    assert.equal(warns('> - EMEA `{4.2}`\n> - APAC `{3.1}`').length, 2);
    assert.deepEqual(warns('> - EMEA `4.2`\n> - APAC `3.1`'), []);
    // A quote that is a row's description holds no chart rows: neither form draws Q1 there, so lint is silent.
    assert.deepEqual(warns('- EMEA\n  > - Q1 `{5}`\n- APAC `3`'), []);
  });

  test('the browser does not claim a record in a list a raw <ol> wraps: the engine counts the wrapper as a list ahead', () => {
    const { isOwnedRecordElement } = require('../../../lib/core/resolve-inline-code.js');
    const doc = new JSDOM('<section class="bar"><h2>A</h2><ol class="steps"><ul><li>A <code data-t>{1}</code></li><li>B <code>{2}</code></li></ul></ol></section>').window.document;
    assert.equal(isOwnedRecordElement(doc.querySelector('code[data-t]')), false);
    const plain = new JSDOM('<section class="bar"><h2>A</h2><ul><li>A <code data-t>{1}</code></li><li>B <code>{2}</code></li></ul></section>').window.document;
    assert.equal(isOwnedRecordElement(plain.querySelector('code[data-t]')), true, 'control: the same list unwrapped is claimed');
    // A raw list INSIDE a row is no list ahead to the engine (it counts raw lists at the slide's top level only).
    const inRow = new JSDOM('<section class="bar"><h2>A</h2><ul><li><p>A</p><ul><ul><li>x <code data-t>{1}</code></li></ul></ul></li><li>B <code>{3}</code></li></ul></section>').window.document;
    assert.equal(isOwnedRecordElement(inRow.querySelector('code[data-t]')), true, 'as the engine claims it');
    // And the engine agrees: the record form of that slide ends as the old form does.
    const raw = (v) => deck('bar', `- A\n\n  <ul>\n\n  - x ${v(1)}\n  - y ${v(2)}\n\n  </ul>\n- B ${v(3)}`);
    assert.equal(render(raw((n) => `\`{${n}}\``)), render(raw((n) => `\`${n}\``)));
  });

  test('a matrix-grid cell with a comment beside its record stays a pill in the browser, as in the engine', async () => {
    const dom = new JSDOM('<!DOCTYPE html><html><body><section class="matrix-grid"><h2>A</h2><table><thead><tr><th></th><th>A</th><th>B</th></tr></thead><tbody>'
      + '<tr><td>r</td><td><code>{done}</code> <!-- c --></td><td><code>{done}</code></td></tr></tbody></table></section></body></html>', {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no network in this test'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(path.join(ROOT, 'dist', 'lattice-runtime.js'), 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 300));
    const cells = dom.window.document.querySelectorAll('tbody td');
    assert.equal(cells[1].querySelector('.cell'), null, 'the commented cell is not a state');
    assert.ok(cells[2].querySelector('.cell-filled'), 'control: the plain cell is');
  });

  test('the stamp strip touches only the stamp the pill pass wrote, never an author\'s attribute text', () => {
    const soup = '<div title="a data-lat-record="" b=" onmouseover=alert(2) c="">x</div>';
    const html = render(`---\nmarp: true\n---\n\n## Plain\n\n${soup}\n`);
    assert.ok(html.includes('data-lat-record="" b="'), 'the author bytes reach the page as written');
  });

  test('the narrator bridge leaves a lone-CR source and a BOM as written, and a row wider than its header alone', () => {
    // A lone CR is one line to the narrators; folding it to LF would add lines they read as rows.
    const lone = '- EMEA `{4.5}`\r- APAC `{3.5}`';
    assert.equal(bridgeRecordsSource(lone, ['bar']), lone);
    // A BOM survives a rewrite.
    assert.equal(bridgeRecordsSource('\uFEFF- EMEA `{4.5}`\n- APAC `{3.5}`', ['bar']), '\uFEFF- EMEA `4.5`\n- APAC `3.5`');
    // markdown-it drops a cell past the header's width, so a record there is nobody's and stays as written.
    const wide = '| | A | B |\n|---|---|---|\n| EMEA | `{1.5}` | `{2.5}` | `{3.5}` |';
    assert.equal(bridgeRecordsSource(wide, ['heatmap']), '| | A | B |\n|---|---|---|\n| EMEA | 1.5 | 2.5 | `{3.5}` |');
  });

  test('a raw table inside a cell of the chart\'s own table is nested in it, not ahead of it', () => {
    const body = '| | A | B |\n|---|---|---|\n| x <table><tr><td>y</td></tr></table> | `{done}` | `{partial}` |';
    const html = render(deck('matrix-grid', body));
    assert.match(html, /cell-filled|cell-outlined/, 'the records are state cells');
    assert.doesNotMatch(html, /lat-pill/, 'and not pills');
  });
});
