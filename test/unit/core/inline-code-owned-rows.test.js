/**
 * A COMPONENT THAT OWNS ITS LIST ROWS' SPANS GETS THEM — on the engine, on the runtime, and in lint.
 *
 * Decision 3 of the Segno note: where a span sits decides what it means. A flowchart style
 * record (`{diamond, c2}`) is also a valid pill, and the slide-wide pill pass used to reach it
 * first: the chart then read the word `diamond` as part of the shape's name and drew a box named
 * "Triage diamond". The flowchart manifest's `style` slot declares `sits: "list-rows"`, and
 * lib/core/resolve-inline-code.js turns that into the one gate all three readers apply.
 *
 * EVERY ARM CARRIES ITS CONTROL: the same span on a slide whose component does not own its rows
 * still becomes a pill, so each arm measures the gate rather than an empty document.
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const MarkdownIt = require('markdown-it');

const ROOT = path.join(__dirname, '..', '..', '..');
const latticeEngine = require(path.join(ROOT, 'lib/engine'));
const { LIST_ROW_OWNERS, ownsListRows } = require(path.join(ROOT, 'lib/core/resolve-inline-code.js'));
const core = require(path.join(ROOT, 'lib/authoring/lint-core.js'));

const deck = (cls, body) => ['---', 'theme: indaco', '---', '', `<!-- _class: ${cls} -->`, '', body].join('\n');
const render = (md) => new JSDOM(latticeEngine.createEngine().render(md).html).window.document;

test('the owners come from the manifests: the two graph charts, and only components that declare it', () => {
  assert.deepEqual([...LIST_ROW_OWNERS].sort(), ['flowchart', 'state-chart']);
  assert.equal(ownsListRows(['flowchart', 'lr']), true);
  assert.equal(ownsListRows(['state-chart', 'tb']), true);
  assert.equal(ownsListRows(['list', 'quadrant']), false);
});

test('the state chart\'s style slot is the flowchart\'s, plus its lead words', () => {
  // The state chart reads its rows with the flowchart's grammar (#2424), so its slot must take
  // every word the flowchart's takes. Two manifests hold the spec; this keeps them one.
  const catalog = require(path.join(ROOT, 'lib/core/segno-slots.generated.js'));
  const fc = catalog.flowchart.style;
  const sc = catalog['state-chart'].style;
  const { lead, ...rest } = sc.params;
  assert.deepEqual(rest, fc.params);
  assert.deepEqual(lead, { type: 'oneOf', values: ['start', 'end'] });
  assert.equal(sc.sits, 'list-rows');
});

test('engine: a state-chart row keeps its style record', () => {
  const doc = render(deck('state-chart', '## Machine.\n\n- A `start`\n  - -> B\n- B `{done, c2}`'));
  const names = [...doc.querySelectorAll('.state-node')].map((n) => n.getAttribute('data-label'));
  assert.deepEqual(names, ['A', 'B'], 'the record styled B instead of joining its name');
  assert.equal(doc.querySelectorAll('.lat-pill').length, 0);
});

test('engine: a flowchart row keeps its style record; a pill elsewhere on the slide still draws', () => {
  const body = '`{BETA, c2}`\n\n## Flow.\n\n- Alert fires => Triage\n- Triage `{diamond, c2}`';
  const doc = render(deck('flowchart', body));
  const triage = [...doc.querySelectorAll('[data-shape]')].find((n) => /Triage/.test(n.textContent));
  assert.ok(triage, 'the chart drew a Triage shape');
  assert.equal(triage.getAttribute('data-shape'), 'diamond', 'the record styled the shape');
  assert.ok(![...doc.querySelectorAll('[data-shape]')].some((n) => /diamond/i.test(n.textContent)),
    'no shape is named after the style word');
  assert.equal(doc.querySelectorAll('.lat-pill').length, 1, 'the eyebrow pill, not on a row, still draws');
  // Control: the same row on a slide whose component does not own its rows becomes a pill.
  const ctl = render(deck('list', '## List.\n\n- Triage `{diamond, c2}`'));
  assert.equal(ctl.querySelectorAll('li .lat-pill').length, 1);
});

test('runtime: the DOM mirror leaves an owned row\'s span as code', async () => {
  const bundle = path.join(ROOT, 'dist', 'lattice-runtime.js');
  const md = new MarkdownIt();
  const markup = (cls) => `<section class="${cls}">${md.render('- Triage `{diamond, c2}`\n- Intake `\\{LIVE}`\n\nText `{BETA, c2}`.')}</section>`;
  const boot = async (cls) => {
    const dom = new JSDOM(`<!DOCTYPE html><html><head></head><body>${markup(cls)}</body></html>`, {
      url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true,
    });
    dom.window.fetch = () => Promise.reject(new Error('no fetch'));
    const el = dom.window.document.createElement('script');
    el.textContent = fs.readFileSync(bundle, 'utf8');
    dom.window.document.body.appendChild(el);
    await new Promise((r) => setTimeout(r, 1000));
    return dom.window.document;
  };
  const owned = await boot('flowchart');
  assert.equal(owned.querySelectorAll('li .lat-pill').length, 0, 'the row span stays for the chart');
  assert.equal(owned.querySelectorAll('p .lat-pill').length, 1, 'a prose span still draws');
  // An escape is still an escape on an owned row: the backslash comes off and the span is
  // stamped, before the ownership gate (the engine path does the same).
  const esc = [...owned.querySelectorAll('li code')].find((c) => c.textContent.includes('LIVE'));
  assert.equal(esc.textContent, '{LIVE}');
  assert.ok(esc.hasAttribute('data-lat-escaped'), 'stamped, so the chart reads it as name text');
  const ctl = await boot('content');
  assert.equal(ctl.querySelectorAll('li .lat-pill').length, 1, 'control: an unowned row draws the pill');
});

test('lint: no pill warning on a span the flowchart owns', () => {
  const vocab = { names: new Set(['flowchart', 'list']), modifiers: new Set() };
  const crowded = (cls) => core.lintTextWith(deck(cls, '## H.\n\n- API `{#api, diamond, c2}`'), vocab)
    .filter((f) => f.rule === 'pill-shape-crowded');
  assert.equal(crowded('flowchart').length, 0, '`#api` is an id there, not a crowded diamond pill');
  assert.equal(crowded('list').length, 1, 'control: on a list slide it is a pill, and too long');
});

test('an escaped span on a flowchart row is name text on every path — never a style', () => {
  // `\{LIVE}` asks to be read as written. The ownership gate once ran before the escape, so the
  // backslash stayed on the slide; then, once the gate read only slot spans, the stripped
  // `{LIVE}` was read as the status `live` and the word vanished. Base read "Intake {LIVE}".
  const body = '## F.\n\n- Intake `\\{LIVE}` -> Triage';
  const doc = render(deck('flowchart', body));
  const intake = [...doc.querySelectorAll('[data-shape]')].find((n) => /Intake/.test(n.textContent));
  assert.equal(intake.textContent.trim(), 'Intake {LIVE}');
  assert.equal(intake.getAttribute('data-s'), null, 'not a status');
  const g = require(path.join(ROOT, 'lib/core/flowchart-grammar.js'));
  const m = g.parseFlowchart(g.outlineFromMarkdown('- Intake `\\{LIVE}` -> Triage').items, {});
  assert.equal(m.shapes[0].name, 'Intake {LIVE}', 'lint and the narrator read the same name');
  assert.equal(m.diagnostics.length, 0);
});

test('the text of an escaped span is protected: no arrow, fan-out or markup inside it is read', () => {
  // An escape is a LITERAL segment in both readers, so `\{go -> stop}` cannot split the row and
  // the Markdown reader cannot clean emphasis or entities the render keeps.
  const g = require(path.join(ROOT, 'lib/core/flowchart-grammar.js'));
  for (const [span, name] of [['\\{go -> stop}', 'Intake {go -> stop}'], ['\\{a & b}', 'Intake {a & b}'], ['\\{a **b** c}', 'Intake {a **b** c}']]) {
    const m = g.parseFlowchart(g.outlineFromMarkdown(`- Intake \`${span}\` -> Triage`).items, {});
    assert.deepEqual(m.shapes.map((x) => x.name), [name, 'Triage'], span);
    const doc = render(deck('flowchart', `## F.\n\n- Intake \`${span}\` -> Triage`));
    const names = [...doc.querySelectorAll('[data-shape]')].map((n) => n.textContent.trim());
    assert.deepEqual(names.sort(), [name, 'Triage'].sort(), `render: ${span}`);
  }
});
