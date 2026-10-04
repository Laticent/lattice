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

test('the owners come from the manifests: flowchart, and only components that declare it', () => {
  assert.deepEqual([...LIST_ROW_OWNERS], ['flowchart']);
  assert.equal(ownsListRows(['flowchart', 'lr']), true);
  assert.equal(ownsListRows(['list', 'quadrant']), false);
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
  const markup = (cls) => `<section class="${cls}">${md.render('- Triage `{diamond, c2}`\n\nText `{BETA, c2}`.')}</section>`;
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
