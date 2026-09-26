const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const panes = require('../../../lib/core/panes.js');
const { widenForPanes } = require('../../../lib/core/pane-css.js');
const { createEngine } = require('../../../lib/engine');

const ROOT = path.join(__dirname, '../../..');

function engine() {
  const e = createEngine();
  const dir = path.join(ROOT, 'themes');
  e.addThemes([
    { name: 'lattice', css: fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8') },
    ...fs.readdirSync(dir).filter((f) => f.endsWith('.css'))
      .map((f) => ({ name: f.replace(/\.css$/, ''), css: fs.readFileSync(path.join(dir, f), 'utf8') })),
  ]);
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
  assert.deepEqual(panes.parseLayout('stack 35/65'), { direction: 'stack', a: 35, b: 65, rule: true });
  assert.deepEqual(panes.parseLayout('75/25'), { direction: 'side', a: 75, b: 25, rule: true });
  assert.deepEqual(panes.parseLayout('60/40 no-rule'), { direction: 'side', a: 60, b: 40, rule: false });
  assert.deepEqual(panes.parseLayout('60 / 40'), { direction: 'side', a: 60, b: 40, rule: true });
  for (const bad of ['80/20', '33/67', '60/50', 'wide']) {
    const l = panes.parseLayout(bad);
    assert.equal(l.a, 50, bad);
    assert.ok(l.error, bad);
  }
});

test('widenForPanes twins each arm that reaches a pane, and nothing else', () => {
  const css = '/* c */ section.list > .cell-stage > ul { a: b }\n'
    + ':is(section.bar, figure.chart-frame) .x { c: d }\n'
    + 'section.dark { e: f }\n'
    + 'section:where(:not(.glossary)) > table, section:where(:not(.glossary)) > :where(.cell-stage) > table td { g: h }\n'
    + '@media print { section.table > .cell-stage > table { i: j } }\n'
    + '@keyframes k { from { x: 1 } to { x: 2 } }\n'
    + '.z section, section p { e: f }\n';
  assert.equal(
    widenForPanes(css),
    '/* c */ section.list > .cell-stage > ul, section lat-pane.list > .cell-stage > ul{ a: b }\n'
    // A leading `:is()` is split only to find its arms: the authored selector stays as written.
    + ':is(section.bar, figure.chart-frame) .x, section lat-pane.bar .x{ c: d }\n'
    // Slide-level, and a class inside `:not()` is an exclusion, not a component.
    + 'section.dark { e: f }\n'
    + 'section:where(:not(.glossary)) > table, section:where(:not(.glossary)) > :where(.cell-stage) > table td, section lat-pane:where(:not(.glossary)) > :where(.cell-stage) > table td{ g: h }\n'
    + '@media print { section.table > .cell-stage > table, section lat-pane.table > .cell-stage > table{ i: j } }\n'
    + '@keyframes k { from { x: 1 } to { x: 2 } }\n'
    + '.z section, section p { e: f }\n',
  );
});

test('a comment between two arms hides neither from the widening (base.sketch.css has one)', () => {
  assert.equal(
    widenForPanes('section.sketch.cards-stack > ul > li,\n/* mid */\nsection.sketch.quote blockquote { a: b }'),
    '/* mid */section.sketch.cards-stack > ul > li, section lat-pane.sketch.cards-stack > ul > li,\n\nsection.sketch.quote blockquote, section lat-pane.sketch.quote blockquote{ a: b }',
  );
});

test('a quoted string is text to the widening: no brace, comment or semicolon inside it counts', () => {
  assert.equal(
    widenForPanes('section.quote::after { content: "/*;{" } section.list[data-x="a{b"] > p { i: j }'),
    'section.quote::after, section lat-pane.quote::after{ content: "/*;{" } section.list[data-x="a{b"] > p, section lat-pane.list[data-x="a{b"] > p{ i: j }',
  );
});

test('a `;` in a quoted value, a bad string and an unquoted url() leave the rules after them widened', () => {
  // A `;` inside an attribute value is not the end of a hoisted statement.
  assert.equal(widenForPanes('section.list[data-x="a;b"] > p { i: j }'),
    'section.list[data-x="a;b"] > p, section lat-pane.list[data-x="a;b"] > p{ i: j }');
  // An unterminated string ends at the newline, as a browser ends it — not at the end of the sheet.
  assert.match(widenForPanes('section.quote::after { content: "oops\n} section.list > p { a: b }'), /section lat-pane\.list > p\{/);
  // An apostrophe inside an unquoted url() is not a quote.
  assert.match(widenForPanes("section.bar { background: url(data:x;utf8,<svg fill='red'/>) } section.list > p { a: b }"), /section lat-pane\.list > p\{/);
  // A hoisted `@import` whose URL holds a `;` passes through whole.
  assert.equal(widenForPanes('@import "a;b"; section.list > p { a: b }'), '@import "a;b"; section.list > p, section lat-pane.list > p{ a: b }');
});

test('a component class written on a panes slide does not run that component on the slide', () => {
  // The component body rules (glossary tables, checklist states, badges …) key on the slide's
  // class. Run before the carve, `_class: glossary` put a letter-range pill on the TITLE and
  // turned a list pane into a glossary table.
  const html = render('<!-- _class: glossary -->\n\n## Terms\n\n<!-- pane: list -->\n\n- Alpha\n  - one\n- Beta\n  - two\n\n<!-- pane: content -->\n\nx\n');
  const host = html.slice(html.indexOf('<section'), html.indexOf('<div class="lat-panes"'));
  assert.doesNotMatch(host, /range-pill/);
  assert.doesNotMatch(host, /data-class="glossary"|--class:"glossary"/);
  assert.match(html, /<lat-pane class="list form"[^>]*>[\s\S]*?<ul>/);
});

test('a pane rule beats a slide rule reaching into the pane through the host (a math pane)', () => {
  // `section:not(.math) :is(.katex…)` matches a pane's equations through the HOST section.
  // The twin carries one more type selector, so the math pane's own rule wins the tie.
  const out = widenForPanes('section.math .katex { a: b }');
  assert.equal(out, 'section.math .katex, section lat-pane.math .katex{ a: b }');
});

test('widening a deck\'s sheet never changes what a NORMAL slide matches (every shipped sheet)', () => {
  // The invariant the whole design rests on: strip the `section lat-pane` twins back out and every
  // rule is the rule it was — same arms, same order, same block. Run over the real bundle and
  // every theme, because a kernel bug hides in their comments (a `;` inside a comment once
  // split a prelude and broke the rule defining --sketch-ink on every slide of a panes deck).
  const csstree = require('css-tree');
  const { splitSelectorList, leadingIsArms } = require('../../../lib/core/leading-is');
  const flat = (list) => splitSelectorList(list).flatMap((x) => {
    const li = leadingIsArms(x.trim());
    return li ? li.arms.map((a) => a.trim() + li.rest) : [x.trim()];
  }).map((x) => x.replace(/\s+/g, ' '));
  const rules = (css, dropTwins) => {
    const out = [];
    csstree.walk(csstree.parse(css, { parseValue: false, parseCustomProperty: false, parseAtrulePrelude: false }), {
      visit: 'Rule',
      enter(r) {
        if (r.prelude.type !== 'SelectorList') return;
        let sels = flat(r.prelude.children.toArray().map((x) => csstree.generate(x)).join(','));
        if (dropTwins) sels = sels.filter((x) => !(/^section lat-pane(?![\w-])/.test(x) && sels.includes(`section${x.slice(16)}`)));
        out.push(`${sels.join('|')}{${csstree.generate(r.block)}}`);
      },
    });
    return out;
  };
  const sheets = ['dist/lattice.css', ...fs.readdirSync(path.join(ROOT, 'themes')).filter((f) => f.endsWith('.css')).map((f) => `themes/${f}`)];
  for (const f of sheets) {
    const raw = fs.readFileSync(path.join(ROOT, f), 'utf8');
    assert.deepEqual(rules(widenForPanes(raw), true), rules(raw, false), f);
  }
});

test('the shipped stylesheet carries no pane arms, so Export-to-Marp reads it as before', () => {
  const css = fs.readFileSync(path.join(ROOT, 'dist/lattice.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(css, /lat-pane\.[a-z]/);
  assert.doesNotMatch(css, /:is\(section,\s*lat-pane\)/);
});

test('a deck WITHOUT panes composes the plain sheet; a deck with panes gets the twins', () => {
  const e = engine();
  const plain = e.render('## T\n\n- a\n').css;
  assert.doesNotMatch(plain, /lat-pane\.[a-z]/);
  const withPanes = e.render(DECK).css;
  assert.match(withPanes, /lat-pane\.list\b/);
  // The base stage defaults reach a pane's body — every table's rules …
  assert.match(withPanes, /section lat-pane:where\([^{}]*\)\s*>\s*:where\(\.cell-stage\)\s*>\s*table td/);
  // … and the plain deck's sheet is unchanged by a panes deck rendered through the same engine.
  assert.equal(e.render('## T\n\n- a\n').css, plain);
});

test('the pane twins are scoped to the components the deck puts in a pane', () => {
  const css = engine().render(DECK).css;
  assert.match(css, /section lat-pane\.list\b/);
  // A component no pane of this deck holds gets no twin at all.
  assert.doesNotMatch(css, /section lat-pane\.kpi\b/);
  assert.doesNotMatch(css, /section lat-pane\.piechart\b/);
});

test('a scoped widening twins only arms whose root classes a pane of this deck carries', () => {
  const css = 'section.kpi > .cell-stage > ul { a: b } section.list > ul { c: d } '
    + 'section.lat-pane-host > .cell-stage > p { e: f } section.print > .cell-stage > p { g: h } '
    + 'section:where(.list, .kpi) > .cell-stage > ol { i: j } section > .cell-stage > table { k: l }';
  assert.equal(widenForPanes(css, ['form', 'list']),
    'section.kpi > .cell-stage > ul { a: b } section.list > ul, section lat-pane.list > ul{ c: d } '
    + 'section.lat-pane-host > .cell-stage > p { e: f } section.print > .cell-stage > p { g: h } '
    // An alternative inside :where() is not required of the element; one match is enough.
    + 'section:where(.list, .kpi) > .cell-stage > ol, section lat-pane:where(.list, .kpi) > .cell-stage > ol{ i: j } '
    + 'section > .cell-stage > table, section lat-pane > .cell-stage > table{ k: l }');
});

test('an engine keeps a bounded number of pane-scoped sheets', () => {
  const e = engine();
  const kinds = ['list', 'table', 'bar', 'line', 'stats', 'kpi', 'quote', 'agenda', 'checklist', 'glossary'];
  for (const k of kinds) e.render(`## T\n\n<!-- pane: ${k} -->\n\n- a \`1\`\n\n<!-- pane: content -->\n\nx\n`);
  const paneSheets = [...e.themes._cssCache.keys()].filter((k) => !k.endsWith('\u0000'));
  assert.ok(paneSheets.length <= 8, `${paneSheets.length} pane sheets cached`);
});

test('theme rules keyed to a component reach a pane (the a11y texture channel)', () => {
  const css = engine().render(`---\ntheme: a11y-deuteranopia\n---\n\n## T\n\n<!-- pane: piechart -->\n\n- A \`60%\`\n- B \`40%\`\n\n<!-- pane: list -->\n\n- x\n`).css;
  assert.match(css, /lat-pane\.piechart[^{]*wedge/);
});

test('a table in a pane renders with the same table classes as a table slide', () => {
  const html = render('## T\n\n<!-- pane: list -->\n\n- a\n\n<!-- pane: table -->\n\n| A | B |\n|---|---|\n| 1 | 2 |\n');
  const pane = html.slice(html.indexOf('data-pane="table"'));
  assert.match(pane, /<div class="cell-stage">\s*<table class="lat-row-label(-off)?">/);
});

test('the spine between panes is on by default and `no-rule` turns it off', () => {
  assert.match(render(DECK), /<div class="lat-panes" data-panes="side" style=/);
  const off = render(`## T\n\n<!-- panes: 40/60 no-rule -->\n${PANES}\n`);
  assert.match(off, /<div class="lat-panes" data-panes="side" data-rule="none" style=/);
  assert.equal(count(off, /<lat-pane /g), 2);
});

test('the gutter is proportional and never lets the spine hug a pane', () => {
  // Measured on the demo at 1280: 64px side by side (32 either side of the spine, where the
  // first cut left 16), 48px stacked. Both are --sp-* steps, so they scale with the slide.
  const css = fs.readFileSync(path.join(ROOT, 'lib/forms/cell/pane/pane.css'), 'utf8');
  assert.match(css, /section\.lat-pane-host \{\s*--pane-gap: var\(--sp-2xl\);/);
  assert.match(css, /\[data-panes="stack"\] \{\s*--pane-gap: var\(--sp-xl\);/);
  assert.match(css, /gap: var\(--pane-gap\);/);
});

test('a chart in a pane draws on a canvas shaped like its pane; a slide chart keeps the slide canvas', () => {
  const e = engine();
  const vb = (html) => (html.match(/class="cart-svg[^"]*"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"|viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*class="cart-svg/) || []).filter(Boolean).slice(1).map(Number);
  const bars = '- A `4`\n- B `7`\n- C `3`';
  // A full slide: the fixed 320x180 canvas, exactly as before panes existed.
  assert.deepEqual(vb(e.render(`<!-- _class: bar -->\n\n## T\n\n${bars}\n`).html), [320, 180]);
  // A 60% stacked band is short and wide, and so is its canvas.
  const [w, h] = vb(e.render(`## T\n\n<!-- panes: stack 60/40 -->\n<!-- pane: bar -->\n\n${bars}\n\n<!-- pane: list -->\n\n- x\n`).html);
  assert.ok(w / h > 3.5, `stacked band canvas ${w}x${h} is not band-shaped`);
  // The host's chrome takes stage height the panes do not get: a Key Insight shortens the canvas.
  const tall = vb(e.render(`## T\n\n<!-- pane: bar -->\n\n${bars}\n\n<!-- pane: list -->\n\n- x\n`).html);
  const short = vb(e.render(`## T\n\n<!-- pane: bar -->\n\n${bars}\n\n<!-- pane: list -->\n\n- x\n\n> Insight.\n`).html);
  assert.ok(short[1] < tall[1], `a Key Insight did not shorten the pane canvas (${tall} vs ${short})`);
  // The stamp that carries the canvas never reaches the output.
  assert.doesNotMatch(e.render(`## T\n\n<!-- pane: bar -->\n\n${bars}\n\n<!-- pane: list -->\n\n- x\n`).html, /data-pane-view/);
});

test('a keyed chart grows its key only when the printed text really grows', () => {
  const { fitKeyToPane, FS_OF_HEIGHT } = require('../../../lib/components/chart/_chart-family/svg-legend');
  // A synthetic unit: a 200-unit diagram with a key beside it whose width grows with its type.
  const build = (_o, m) => ({ viewW: 200 + 120 * m, viewH: 200 });
  const printed = (r, pv) => {
    const s = Math.min(pv.w / r.key.viewW, pv.h / r.key.viewH);
    return { text: FS_OF_HEIGHT * 200 * r.fontScale * s, diagram: 200 * s };
  };
  const opts = (pv) => ({ orientation: undefined, paneView: pv, diagramHeight: 200, orientations: [undefined] });
  // A NARROW pane where the whole unit widens with the key's type: width binds, so a bigger key
  // prints the same text and only shrinks the diagram. The unscaled key wins (the checker's 25%
  // pie: 213px disc -> 71px, text unchanged).
  const narrow = { w: 90, h: 180 };
  const allKey = (_o, m) => ({ viewW: 320 * m, viewH: 200 });
  assert.equal(fitKeyToPane(allKey, opts(narrow)).fontScale, 1);
  // Where a bigger key DOES print larger text in a narrow pane, it may take it, never past the
  // diagram's floor and never printing smaller than the unscaled key.
  const n = fitKeyToPane(build, opts(narrow));
  const nBase = printed({ key: build(undefined, 1), fontScale: 1 }, narrow);
  const nGot = printed(n, narrow);
  assert.ok(nGot.diagram >= nBase.diagram * 0.75 && nGot.text >= nBase.text, `narrow ${JSON.stringify(nGot)}`);
  // A WIDE, short pane: height binds, so the key's type can grow at no cost to the diagram.
  const wide = { w: 400, h: 60 };
  const w = fitKeyToPane(build, opts(wide));
  const base = printed({ key: build(undefined, 1), fontScale: 1 }, wide);
  const got = printed(w, wide);
  assert.ok(w.fontScale > 1 && got.text > base.text * 1.2, `text ${base.text} -> ${got.text}`);
  assert.ok(got.diagram >= base.diagram * 0.75);
  // Without a pane: the unscaled call, as on every ordinary slide.
  assert.equal(fitKeyToPane(build, opts(null)).fontScale, 1);
});

test('a radar in a pane draws as a radar slide does: its axis labels belong to the diagram', () => {
  const e = engine();
  const series = (name, v) => `- ${name}\n${['Coverage', 'Integration', 'Cost', 'Support', 'Speed'].map((ax, i) => `  - ${ax} \`${v[i]}\``).join('\n')}`;
  const radar = `${series('Build', [6, 7, 9, 4, 5])}\n${series('Buy', [8, 5, 3, 7, 6])}`;
  const vb = (html) => (html.match(/class="radar-svg[^"]*"[^>]*viewBox="([^"]+)"/) || [])[1];
  const slide = vb(e.render(`<!-- _class: radar -->\n\n## T\n\n${radar}\n`).html);
  const pane = vb(e.render(`## T\n\n<!-- pane: radar -->\n\n${radar}\n\n<!-- pane: list -->\n\n- x\n`).html);
  assert.ok(slide, 'no radar svg on the slide');
  assert.equal(pane, slide);
});

test('`cards:` reaches a pane — deck-wide and per slide — as it reaches a slide', () => {
  const e = engine();
  const cards = '- Alpha\n  - One line.\n- Beta\n  - One line.';
  const paneOf = (md) => (md.match(/<lat-pane class="cards-grid[^"]*"[^>]*>/) || [''])[0];
  const slideOf = (md) => (md.match(/<section[^>]*class="cards-grid[^"]*"[^>]*>/) || [''])[0];
  for (const v of ['top', 'center', 'stretch', 'spread']) {
    const deck = e.render(`---\ncards: ${v}\n---\n\n## T\n\n<!-- pane: cards-grid -->\n\n${cards}\n\n<!-- pane: content -->\n\nx\n`).html;
    assert.match(paneOf(deck), new RegExp(`data-cards="${v}"`), `deck cards: ${v}`);
    const spot = e.render(`## T\n\n<!-- _class: cards-${v} -->\n\n<!-- pane: cards-grid -->\n\n${cards}\n\n<!-- pane: content -->\n\nx\n`).html;
    assert.match(paneOf(spot), new RegExp(`data-cards="${v}"`), `_class: cards-${v}`);
  }
  // Nothing set: the pane takes the component's own default, the value a slide of it gets.
  const slide = e.render(`<!-- _class: cards-grid -->\n\n## T\n\n${cards}\n`).html;
  const pane = e.render(`## T\n\n<!-- pane: cards-grid -->\n\n${cards}\n\n<!-- pane: content -->\n\nx\n`).html;
  assert.equal(paneOf(pane).match(/data-cards="(\w+)"/)[1], slideOf(slide).match(/data-cards="(\w+)"/)[1]);
  // The tokens a pane needs are in the sheet, keyed on the pane.
  assert.match(e.render(`## T\n\n<!-- pane: cards-grid -->\n\n${cards}\n\n<!-- pane: content -->\n\nx\n`).css, /lat-pane\[data-cards="top"\]\s*\{\s*--cards-align:\s*flex-start/);
});

test('a pane\'s chart canvas has the shape Chromium lays the pane out at', () => {
  const e = engine();
  const bars = '- A `4`\n- B `7`\n- C `3`';
  const vb = (html) => (html.match(/class="cart-svg[^"]*"[^>]*viewBox="0 0 ([\d.]+) ([\d.]+)"|viewBox="0 0 ([\d.]+) ([\d.]+)"[^>]*class="cart-svg/) || []).filter(Boolean).slice(1).map(Number);
  // Measured in Chromium on the engine sheet: the second pane's box with a one-line title
  // (lib/engine/index.js STAGE_BANDS), width / height. The bar canvas must match within 3%.
  // (A 16:9 stack is left out: its band is flatter than the 140x72 minimum canvas.)
  // Only the `wide` family lays panes out: square, portrait, story and mobile split them into
  // slides (installPaneSplit). hd and 4K measured the same box; the 30/70 pane is the measured
  // box less the measured 64px gutter, at its share.
  const measured = {
    'hd 50/50': 544 / 439, '4K 50/50': 1632 / 1318, 'hd 30/70': (1152 - 64) * 0.7 / 439,
  };
  for (const [name, ratio] of Object.entries(measured)) {
    const [size, layout] = name.split(' ');
    const [w, h] = vb(e.render(`---\nsize: ${size}\n---\n\n## A title that is here\n\n<!-- panes: ${layout} -->\n<!-- pane: list -->\n\n- x\n\n<!-- pane: bar -->\n\n${bars}\n`).html);
    assert.ok(w && h, `${name}: no bar canvas`);
    assert.ok(Math.abs(Math.log(w / h / ratio)) < 0.03, `${name}: canvas ${w}x${h} (${(w / h).toFixed(2)}) vs measured ${ratio.toFixed(2)}`);
  }
});

test('a narrow pie pane under full chrome still grows its key (the ladder finds the sizes between)', () => {
  const e = engine();
  const pie = '- Enterprise `46%`\n- Mid-market `31%`\n- SMB `23%`';
  const md = '`Customer mix`\n\n## Enterprise is now nearly half the book.\n\n`piechart 35 · table 65`\n\n'
    + `<!-- panes: 35/65 -->\n<!-- pane: piechart -->\n\n${pie}\n\n<!-- pane: table -->\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n— ARR as of 30 September.\n`;
  const [w, h] = e.render(md).html.match(/piechart-svg" viewBox="0 0 ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  // The unscaled key beside the disc is 377x200 and prints its labels at ~3.7 units; the
  // fixed-point steps alone jumped past every size that keeps the disc above its floor and
  // fell back to it. The pick now sets the key below the disc, at a larger size.
  assert.ok(h > 200 && !(w === 377 && h === 200), `pie unit ${w}x${h}`);
});

test('on a square, portrait, story or mobile deck a panes slide splits into one slide per pane', () => {
  const e = engine();
  const deck = (size, extra = '') => `---\nsize: ${size}\n---\n\n${extra}\`Eyebrow\`\n\n## The title.\n\n<!-- speaker note -->\n\n<!-- panes: 40/60 -->\n<!-- pane: bar -->\n\n- A \`4\`\n- B \`7\`\n\n<!-- pane: list -->\n\n- One\n- Two\n\n> The insight.\n`;
  const sections = (html) => [...html.matchAll(/<section\b[^>]*class="([^"]*)"/g)].map((m) => m[1].split(/\s+/));
  for (const size of ['square', 'portrait', 'story', 'mobile']) {
    const { html } = e.render(deck(size));
    const s = sections(html);
    assert.equal(s.length, 2, `${size}: ${s.length} slides`);
    assert.ok(s[0].includes('bar') && s[1].includes('list'), `${size}: ${JSON.stringify(s)}`);
    assert.doesNotMatch(html, /lat-pane/, `${size}: a pane survived the split`);
    // Both pages carry the masthead; the coda closes the last page only; the speaker note
    // stays with the first page; the markers and the layout comment are gone.
    assert.equal((html.match(/The title\./g) || []).length, 2);
    assert.equal((html.match(/The insight\./g) || []).length, 1);
    assert.ok(html.lastIndexOf('The insight.') > html.lastIndexOf('<section'));
    assert.equal((html.match(/speaker note/g) || []).length, 1);
    assert.doesNotMatch(html, /pane: bar|panes: 40\/60/);
  }
  // A spot `_class` the author wrote rides on every page, beside the pane's component.
  const s = sections(e.render(deck('portrait', '<!-- _class: cards-top -->\n\n')).html);
  assert.ok(s.every((c) => c.includes('cards-top')) && s[0].includes('bar') && s[1].includes('list'), JSON.stringify(s));
  // A 16:9 deck (and 4:3 and 4K, all `wide`) keeps the panes.
  for (const size of ['hd', 'standard', '4K']) {
    const { html } = e.render(deck(size));
    assert.equal(sections(html).length, 1, size);
    assert.match(html, /<lat-pane class="bar/, size);
  }
});

test('lint does not budget panes on a deck that splits them', () => {
  const { lintText } = require('../../../lib/authoring/lint');
  const md = (size) => `---\nsize: ${size}\n---\n\n## T\n\n<!-- panes: stack -->\n<!-- pane: kpi -->\n\n1. 42%\n   - Margin\n\n<!-- pane: list -->\n\n${Array.from({ length: 20 }, (_, i) => `- Point ${i}`).join('\n')}\n`;
  const panesRules = (size) => lintText(md(size)).filter((f) => f.rule.startsWith('pane-')).map((f) => f.rule);
  assert.deepEqual(panesRules('portrait'), []);
  assert.deepEqual(panesRules('hd').sort(), ['pane-fit', 'pane-overflow']);
});
