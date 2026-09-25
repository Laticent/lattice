const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const panes = require('../../../lib/core/panes.js');
const { widenSectionRoots } = require('../../../tools/lib/pane-selectors.js');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '../../..');

function engine() {
  const e = createEngine();
  const dir = path.join(ROOT, 'themes');
  e.addThemes(fs.readdirSync(dir).filter((f) => f.endsWith('.css'))
    .map((f) => ({ name: f.replace(/\.css$/, ''), css: fs.readFileSync(path.join(dir, f), 'utf8') })));
  return e;
}
const render = (md, opts) => engine().render(md, undefined, opts).html;
const count = (html, re) => (html.match(re) || []).length;
const sections = (html) => count(html, /<section\b/g);
const cells = (html) => [...html.matchAll(/<lat-pane class="([^"]*)" data-pane="([^"]*)"/g)].map((m) => [m[1], m[2]]);
const hostClass = (html) => (html.match(/<section[^>]*\sclass="([^"]*)"/) || [])[1];

const PANES = [
  '<!-- pane: list -->', '', '- one', '- two', '',
  '<!-- pane: table -->', '', '| A | B |', '|---|---|', '| 1 | 2 |',
].join('\n');
const DECK = ['`Eyebrow`', '', '## Title', '', '<!-- panes: 40/60 -->', PANES, '',
  '> The key insight.', '', '— A below-note.', ''].join('\n');

test('a slide with two panes is ONE section with one title and two lat-pane cells', () => {
  const html = render(DECK);
  assert.equal(sections(html), 1, 'a pane is never a slide');
  assert.equal(count(html, /<h2>/g), 1, 'the host owns the only title');
  assert.deepEqual(cells(html), [['list form', 'list'], ['table form', 'table']]);
  assert.match(html, /style="--pane-a: 40; --pane-b: 60"/);
});

test('the trailing Key Insight and below-note belong to the slide, not to pane 2', () => {
  const html = render(DECK);
  const coda = html.slice(html.indexOf('class="cell-coda"'));
  assert.match(coda, /The key insight/);
  assert.match(coda, /A below-note/);
  assert.doesNotMatch(html.slice(html.indexOf('<lat-pane'), html.lastIndexOf('</lat-pane>')), /key insight|below-note/);
});

test('the host never gains `content` or keeps a component class, and keeps its own classes', () => {
  assert.equal(hostClass(render(DECK)), 'lat-pane-host form');
  // A spot directive placed AFTER the panes still applies to the slide.
  const late = hostClass(render(`## T\n\n${PANES}\n\n<!-- _class: invert -->\n`));
  assert.match(late, /\binvert\b/);
  assert.match(late, /\blat-pane-host\b/);
  assert.doesNotMatch(late, /\bcontent\b/);
  // An inherited class survives too.
  assert.match(hostClass(render(`<!-- class: invert -->\n\n## T\n\n${PANES}\n`)), /\binvert\b.*\blat-pane-host\b|\blat-pane-host\b.*\binvert\b/);
});

test('slides after a panes slide survive whatever sits directly above the `---`', () => {
  for (const [label, last] of [['table', '| 1 | 2 |'], ['comment', '<!-- note -->'], ['list', '- two']]) {
    const body = label === 'list'
      ? `## One\n\n<!-- pane: table -->\n\n| A |\n|---|\n| 1 |\n\n<!-- pane: list -->\n\n- one\n${last}\n---\n\n## Two\n\nUNIQUE2\n`
      : `## One\n\n${PANES}\n${label === 'comment' ? `\n${last}` : ''}\n---\n\n## Two\n\nUNIQUE2\n`;
    const html = render(body);
    assert.equal(sections(html), 2, label);
    assert.match(html, /UNIQUE2/, label);
  }
});

test('`split: headings` still splits the slides that follow a panes slide', () => {
  const html = render(`---\nsplit: headings\n---\n\n## One\n\n${PANES}\n\n## Two\n\n- UNIQUE2\n\n## Three\n\n- x\n`);
  assert.equal(sections(html), 3);
  assert.match(html, /UNIQUE2/);
});

test('a heading written after the first marker is still the slide title', () => {
  const html = render('<!-- pane: list -->\n\n## TITLEX\n\n- a\n\n<!-- pane: table -->\n\n| A |\n|---|\n| 1 |\n');
  assert.match(html, /<h2>TITLEX<\/h2>/);
  assert.equal(count(html, /<h2>/g), 1);
});

test('markers quoted inside a longer code fence are not panes', () => {
  const html = render('## T\n\n````md\n```\n<!-- pane: list -->\n<!-- pane: list -->\n````\n');
  assert.equal(count(html, /<lat-pane/g), 0);
  assert.match(html, /&lt;!-- pane: list --&gt;/);
});

test('a comment holding `<div>` does not swallow the pane', () => {
  const html = render('## T\n\n<!-- pane: content -->\n\nBEFORE\n\n<!-- a <div> in a note -->\n\nAFTER_C\n\n<!-- pane: list -->\n\n- x\n');
  assert.match(html, /BEFORE/);
  assert.match(html, /AFTER_C/);
});

test('a quote pane keeps its attribution, because quote claims the trailing paragraph', () => {
  const html = render('## T\n\n<!-- pane: list -->\n\n- a\n\n<!-- pane: quote -->\n\n> Ship less, think more.\n\n— Jane Doe, CTO\n');
  const pane = html.slice(html.indexOf('data-pane="quote"'));
  assert.match(pane.slice(0, pane.indexOf('</lat-pane>')), /Jane Doe/);
});

test('a spot directive right under the last pane still applies to the slide', () => {
  const html = render(`## T\n\n${PANES}\n<!-- _footer: FOOTX -->\n`);
  assert.match(html, /<footer>FOOTX<\/footer>/);
});

test('author HTML shaped like a placeholder is never filled', () => {
  const forged = '<div class="lat-panes" data-panes="side" data-pane-slot="0" style="--x:1"></div>';
  const html = render(`## A\n\n${PANES}\n\n---\n\n## B\n\n${forged}\n`);
  assert.equal(count(html, /<lat-pane /g), 2);
});

test('a whole-slide component cannot go in a pane: it renders as content', () => {
  const html = render('## T\n\n<!-- pane: title -->\n\n- a\n\n<!-- pane: list -->\n\n- b\n');
  assert.deepEqual(cells(html)[0], ['content form', 'title']);
});

test('a chart pane is built by its kernel and keeps its component classes', () => {
  const html = render('## T\n\n<!-- pane: bar -->\n\n- A `4`\n- B `6`\n\n<!-- pane: list -->\n\n- x\n');
  assert.equal(cells(html)[0][0], 'bar form chart-frame');
  assert.match(html, /<svg class="cart-svg bar-svg"/);
});

test('a slide without panes keeps its ids when a LATER slide has panes', () => {
  const pie = '## P\n\n<!-- _class: piechart -->\n\n- A `60%`\n- B `40%`\n';
  const panesSlide = '## Q\n\n<!-- pane: piechart -->\n\n- C `70%`\n- D `30%`\n\n<!-- pane: list -->\n\n- x\n';
  const alone = render(pie);
  const both = render(`${pie}\n---\n\n${panesSlide}`);
  const ids = (h) => [...h.matchAll(/id="(pie-wedge-[^"]+)"/g)].map((m) => m[1]);
  const firstSlide = both.slice(0, both.indexOf('</section>'));
  assert.deepEqual(ids(firstSlide), ids(alone));
  // The panes slide numbers its ids as slide 2, in the deck and rendered alone at offset 1.
  const second = both.slice(both.indexOf('</section>'));
  const sliced = render(panesSlide, { page: { offset: 1, total: 2 } });
  assert.deepEqual(ids(second), ids(sliced));
  assert.ok(ids(sliced).every((id) => id.startsWith('pie-wedge-2-')), ids(sliced).join(','));
});

test('parseLayout accepts 25–75 in 5% steps and stack, and reports the rest', () => {
  assert.deepEqual(panes.parseLayout('stack 35/65'), { direction: 'stack', a: 35, b: 65 });
  assert.deepEqual(panes.parseLayout('75/25'), { direction: 'side', a: 75, b: 25 });
  assert.deepEqual(panes.parseLayout('60 / 40'), { direction: 'side', a: 60, b: 40 });
  for (const bad of ['80/20', '33/67', '60/50', 'wide']) {
    const l = panes.parseLayout(bad);
    assert.equal(l.a, 50, bad);
    assert.ok(l.error, bad);
  }
});

test('widenSectionRoots widens only the root `section` of each selector', () => {
  const css = '/* c */ section.list > .cell-stage > ul { a: b }\n'
    + ':is(section.bar, figure.bar) .x { c: d }\n'
    + '.z section, section p :has(section) { e: f }\n';
  assert.equal(
    widenSectionRoots(css),
    '/* c */ :is(section,lat-pane).list > .cell-stage > ul { a: b }\n'
    + ':is(:is(section,lat-pane).bar, figure.bar) .x { c: d }\n'
    + '.z section, :is(section,lat-pane) p :has(section) { e: f }\n',
  );
});

test('in the bundle, every lat-pane arm sits in the same rule as its section twin', () => {
  // The cascade invariant: a `lat-pane.x …` selector is `section.x …` with one TYPE swapped
  // for another, in the SAME rule — so it has the same specificity and the same source order,
  // and a normal slide matches exactly the rules it matched before.
  const css = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  let checked = 0;
  for (const m of css.matchAll(/(^|})\s*([^{}@]*lat-pane[^{}]*)\{/g)) {
    const arms = [];
    let depth = 0;
    let cur = '';
    for (const ch of m[2]) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        arms.push(cur.trim());
        cur = '';
      } else cur += ch;
    }
    arms.push(cur.trim());
    // Only WIDENED rules: lib/forms/cell/pane/pane.css styles `lat-pane` directly, on purpose.
    if (!arms.some((a) => /^section\b/.test(a))) continue;
    for (const arm of arms.filter((a) => /^lat-pane\b/.test(a))) {
      assert.ok(arms.includes(arm.replace(/^lat-pane/, 'section')), `no section twin for: ${arm}`);
      checked++;
    }
  }
  assert.ok(checked > 1000, `expected the widened bundle; checked ${checked}`);
});

test('the base stage defaults reach a pane: table rules, but never slide-level rules', () => {
  const css = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8');
  // base.elements.css draws every table's rules through `section … > :where(.cell-stage) > table`.
  // Either form: `:is(section,lat-pane)` as written, or split into its `lat-pane` arm.
  assert.match(css, /(^|[,}]\s*)(lat-pane|:is\(section,lat-pane\)):where\([^{}]*\)\s*>\s*:where\(\.cell-stage\)\s*>\s*table td\s*[,{]/m);
  // A rule that does not reach through the stage stays slide-only: nothing roots the slide's
  // own padding or backdrop at a pane.
  assert.doesNotMatch(css, /(^|[,}]\s*)lat-pane\s*\{/m);
});

test('a table in a pane renders with the same table classes as a table slide', () => {
  const html = render('## T\n\n<!-- pane: list -->\n\n- a\n\n<!-- pane: table -->\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  const pane = html.slice(html.indexOf('data-pane="table"'));
  assert.match(pane, /<div class="cell-stage">\s*<table class="lat-row-label(-off)?">/);
});
