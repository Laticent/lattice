// Generic pane layouts — the authoring syntax
// (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md): a `columns` / `rows`
// layout in `_class`, optional `_pane` markers, an optional `###` pane title and `no-title`.
// The engine rewrites it into the internal form the carve reads (lib/core/panes.js
// `normalizePaneSyntax`); the linter reads it from text (lib/core/pane-spec.js). Each arm here
// pins one rule of the note, on the real engine.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const spec = require('../../../lib/core/pane-spec.js');
const { stripPaneMarkers } = require('../../../lib/core/bake-splits.js');
const { slideClassSpans } = require('../../../lib/core/slide-class-spans.js');
const { lintText } = require('../../../lib/authoring/lint.js');
const lintCore = require('../../../lib/authoring/lint-core.js');
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
const render = (md) => engine().render(md).html;
const count = (html, re) => (html.match(re) || []).length;
const sectionTags = (html) => [...html.matchAll(/<section\b[^>]*>/g)].map((m) => m[0]);
const cells = (html) => [...html.matchAll(/<lat-pane class="([^"]*)" data-pane="([^"]*)"/g)].map((m) => m[2]);
const paneRules = (md) => lintText(md).filter((f) => f.rule.startsWith('pane-')).map((f) => f.rule);

const NEW = [
  '<!-- _class: columns ratio-60-40 -->', '', '`Q3 review`', '## Services outgrew licenses.', '',
  '<!-- _pane: bar -->', '### Revenue by line', '`$M, trailing four quarters`', '', '- Licenses `42`', '- Services `47`', '',
  '<!-- _pane: list -->', '### What changed', '', '- Services crossed licenses', '- Training folded in', '',
  '> The mix shift is structural.', '',
].join('\n');

test('_class: columns lays out two panes at its ratio, and names no class of its own', () => {
  const html = render(NEW);
  assert.match(html, /<div class="lat-panes" data-panes="side" data-heads style="--pane-a: 60; --pane-b: 40; --pane-cols: minmax\(0, 60fr\) minmax\(0, 40fr\)">/);
  assert.deepEqual(cells(html), ['bar', 'list']);
  const host = sectionTags(html)[0];
  assert.match(host, /class="lat-pane-host form"/);
  assert.doesNotMatch(host, /columns|60\/40/);
});

test('_class: rows stacks the panes; other classes in the _class stay the slide\'s', () => {
  const html = render('<!-- _class: rows dark -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n');
  assert.match(html, /data-panes="stack"/);
  assert.match(sectionTags(html)[0], /\bdark\b/);
  assert.doesNotMatch(sectionTags(html)[0], /\brows\b/);
});

test('each pane\'s head sits in a cell beside its <lat-pane>, never inside it', () => {
  const html = render(NEW);
  const heads = [...html.matchAll(/<div class="lat-pane-cell" data-head><div class="lat-pane-head">([\s\S]*?)<\/div><lat-pane/g)].map((m) => m[1]);
  assert.equal(heads.length, 2);
  assert.match(heads[0], /<h3>Revenue by line<\/h3><p><code>\$M, trailing four quarters<\/code><\/p>/);
  assert.match(heads[1], /<h3>What changed<\/h3>/);
  for (const pane of html.match(/<lat-pane[\s\S]*?<\/lat-pane>/g)) assert.doesNotMatch(pane, /<h3>/, 'no pane title inside a pane');
});

test('with no marker, each top-level ### starts a content pane', () => {
  const html = render('<!-- _class: columns -->\n\n## Tickets halved.\n\n### Before\n\n- 1,240 a month\n\n### After\n\n- 610 a month\n');
  assert.deepEqual(cells(html), ['content', 'content']);
  assert.match(html, /<h3>Before<\/h3>[\s\S]*1,240[\s\S]*<h3>After<\/h3>[\s\S]*610/);
});

test('every ### is a pane title: adding a marker above one ### of an outline keeps the other a pane', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n### Context\n\n- one\n\n<!-- _pane: bar -->\n### Revenue\n\n- A `4`\n- B `7`\n');
  assert.deepEqual(cells(html), ['content', 'bar']);
  assert.match(html, /<h3>Context<\/h3>[\s\S]*<h3>Revenue<\/h3>/);
  // And the reverse: a marker first, then an unmarked ### after its body.
  const rev = render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n### Revenue\n\n- A `4`\n\n### Context\n\n- one\n');
  assert.deepEqual(cells(rev), ['bar', 'content']);
});

test('a component that owns its ### keeps them all, and a marker carries its modifiers', () => {
  const md = '<!-- _class: columns ratio-65-35 -->\n\n## T\n\n<!-- _pane: team-profile sides -->\n\n### Your team\n\n- Ada\n  - `Lead`\n\n### Our team\n\n- Bo\n  - `Rep`\n\n<!-- _pane: list -->\n### Notes\n\n- x\n';
  const html = render(md);
  const team = html.match(/<lat-pane class="([^"]*)" data-pane="team-profile"[\s\S]*?<\/lat-pane>/);
  assert.match(team[1], /\bsides\b/, 'the modifier reaches the pane');
  assert.match(team[0], /Your team[\s\S]*Our team/);
  assert.equal(count(html, /<lat-pane\b/g), 2);
  assert.deepEqual(lintText(md).filter((f) => f.rule.startsWith('pane-') || f.rule === 'unknown-class'), []);
});

test('no-title hides a pane title from the eye and keeps it in the document', () => {
  const html = render(NEW.replace('<!-- _pane: list -->', '<!-- _pane: list no-title -->'));
  assert.match(html, /<div class="lat-pane-cell"><div class="lat-pane-head" data-hidden><h3>What changed<\/h3><\/div>/);
  // `_pane: no-title` names the default component.
  const plain = render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: no-title -->\n### Hidden\n\nx\n\n<!-- _pane: list -->\n\n- y\n');
  assert.deepEqual(cells(plain), ['content', 'list']);
  assert.match(plain, /data-hidden><h3>Hidden<\/h3>/);
});

test('a pane\'s trailing Key Insight or note is the slide\'s; a > mid-pane is a quotation and stays', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n### A\n\nSection 12 reads:\n\n> No person shall.\n\nThe court read it narrowly.\n\n> Pane A insight.\n\n### B\n\n- three\n\n— A note.\n');
  const host = html.slice(html.indexOf('<section'), html.indexOf('</section>'));
  const panesPart = host.slice(host.indexOf('<div class="lat-panes"'), host.lastIndexOf('</lat-pane>'));
  const slideCoda = host.slice(host.lastIndexOf('</lat-pane>'));
  assert.match(panesPart, /No person shall/);
  assert.match(panesPart, /The court read it narrowly/);
  assert.doesNotMatch(panesPart, /Pane A insight|A note/);
  assert.match(slideCoda, /Pane A insight[\s\S]*A note/);
});

test('a component\'s claimed coda stays in its pane (a quote\'s attribution)', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n\n- a\n- b\n\n<!-- _pane: quote -->\n\n> Ship less, think more.\n\n— Jane Doe, CTO\n');
  const quote = html.match(/<lat-pane class="[^"]*quote[\s\S]*?<\/lat-pane>/)[0];
  assert.match(quote, /Ship less/);
  assert.match(quote, /Jane Doe/);
});

test('a pane that IS one blockquote keeps it as content', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n### A\n\n> Only this.\n\n### B\n\n- x\n');
  assert.match(html.match(/<lat-pane[\s\S]*?<\/lat-pane>/)[0], /Only this/);
});

test('a titled pane gets a shorter chart canvas than an untitled one', () => {
  const bars = '- A `4`\n- B `7`\n- C `5`';
  // The chart's drawn canvas height (its viewBox), which `data-pane-view` sets for the pane.
  const view = (md) => Number(render(md).match(/class="cart-svg[^"]*"[^>]*viewBox="0 0 [\d.]+ ([\d.]+)"|viewBox="0 0 [\d.]+ ([\d.]+)"[^>]*class="cart-svg/).filter(Boolean)[1]);
  const titled = view(`<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n### Revenue\n\n${bars}\n\n<!-- _pane: list -->\n### Notes\n\n- x\n`);
  const bare = view(`<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n\n${bars}\n\n<!-- _pane: list -->\n\n- x\n`);
  assert.ok(titled < bare, `${titled} < ${bare}`);
  // The shared title row: an untitled chart beside a titled pane gives up nothing.
  const beside = view(`<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n\n${bars}\n\n<!-- _pane: list -->\n### Notes\n\n- x\n`);
  assert.equal(beside, bare);
});

test('the alias still renders the same panes as the syntax', () => {
  const alias = render('## T\n\n<!-- panes: 60/40 -->\n<!-- pane: bar -->\n\n- A `4`\n\n<!-- pane: list -->\n\n- x\n');
  const now = render('<!-- _class: columns ratio-60-40 -->\n\n## T\n\n<!-- _pane: bar -->\n\n- A `4`\n\n<!-- _pane: list -->\n\n- x\n');
  const row = (h) => h.match(/<div class="lat-panes"[\s\S]*?<\/section>/)[0];
  assert.equal(row(now), row(alias));
});

test('a deck that names no layout and no _pane marker renders as it did', () => {
  const md = '## Plain\n\n### Not a pane\n\n- a\n\n<!-- _class: dark -->\n';
  assert.doesNotMatch(render(md), /lat-pane/);
  assert.equal(spec.mayHavePanes(md), false);
});

test('a narrow deck splits each pane onto its own page, its head held together', () => {
  const html = render(`---\nsize: portrait\n---\n\n${NEW.replace('<!-- _pane: list -->', '<!-- _pane: list no-title -->')}`);
  const tags = sectionTags(html);
  assert.equal(tags.length, 2);
  assert.match(tags[0], /class="bar form chart-frame"/);
  const flat = html.replace(/>\s+</g, '><');
  assert.match(flat, /<div class="lat-pane-head"><h3>Revenue by line<\/h3><p><code>\$M, trailing four quarters<\/code><\/p><\/div>/);
  assert.match(flat, /<div class="lat-pane-head" data-hidden><h3>What changed<\/h3><\/div>/);
  // The chart's wrap no longer lifts the pane's subtitle into the page masthead.
  const mast = html.match(/<div class="cell-masthead">[\s\S]*?<hr class="masthead-rule">/)[0];
  assert.doesNotMatch(mast, /trailing four quarters/);
});

test('a pane split onto its own page keeps its one paragraph under its title, not as a footnote', () => {
  // A kpi at 50% reads neither side by side nor stacked, so the slide splits; the content
  // page's only paragraph follows the head <div>, which is a heading, not a structural block.
  const md = ['<!-- _class: columns -->', '', '## Q3 beat plan.', '', '<!-- _pane: kpi -->', '### Q3 results', '',
    '1. $2.4B', '   - Total revenue', '2. 42%', '   - Gross margin', '',
    '<!-- _pane: content -->', '### Context', '', 'Both beat the plan set in January.', ''].join('\n');
  const html = render(md);
  assert.equal(sectionTags(html).length, 2);
  const flat = html.replace(/>\s+</g, '><');
  assert.match(flat, /<div class="lat-pane-head"><h3>Context<\/h3><\/div><p>Both beat the plan set in January\.<\/p>/);
  assert.doesNotMatch(flat, /below-note"><p>Both beat/);
  // The live-DOM arm answers the same.
  const { applyToDom } = require('../../../lib/core/coda.js');
  const dom = new JSDOM('<section class="content"><div class="lat-pane-head"><h3>Context</h3></div><p>Both beat.</p></section>'
    + '<section class="content"><ul><li>a</li></ul><p>Both beat.</p></section>');
  applyToDom(dom.window.document);
  const [head, list] = dom.window.document.querySelectorAll('section');
  assert.equal(head.querySelector('.below-note'), null);
  assert.ok(list.querySelector('.below-note'), 'control: a list, then a sentence, is still a footnote');
});

test('an eyebrow pill above a pane title joins it as one label, above a pane and on a split page', () => {
  const md = '<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n`Shortlist`\n### Cleared\n\n- a\n\n<!-- _pane: content -->\n### B\n\ny\n';
  const flat = (h) => h.replace(/>\s+</g, '><');
  assert.match(flat(render(md)), /<div class="lat-pane-head"><h3>Shortlist · Cleared<\/h3><\/div>/);
  assert.doesNotMatch(flat(render(md)), /<p><code>Shortlist<\/code><\/p>/);
  const narrow = flat(render(`---\nsize: portrait\n---\n\n${md}`));
  assert.match(narrow, /<div class="lat-pane-head"><h3>Shortlist · Cleared<\/h3><\/div>/);
  assert.doesNotMatch(narrow, /<code>Shortlist<\/code>/);
});

test('lint: a pill above a pane title, and a pane title past five words, are suggestions', () => {
  const f = lintText('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n`Shortlist`\n### Cleared\n\n- a\n\n<!-- _pane: content -->\n### What we learned from the pilot\n\ny\n')
    .filter((x) => x.rule === 'pane-title');
  assert.equal(f.length, 2);
  assert.ok(f.every((x) => x.severity === 'suggestion'));
  assert.match(f[0].fix, /### Shortlist · Cleared/);
  assert.match(f[1].message, /6 words/);
  // A hidden title is not read as a label, and five words is fine.
  assert.equal(lintText('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: content no-title -->\n### The Lisbon office in its opening week\n\nx\n\n<!-- _pane: content -->\n### Eleven weeks, lease to open\n\ny\n').filter((x) => x.rule === 'pane-title').length, 0);
});

test('lint reads the syntax: a correct slide is clean, and the words are not unknown classes', () => {
  assert.deepEqual(lintText(NEW).filter((f) => f.rule === 'unknown-class' || f.rule.startsWith('pane-')), []);
});

test('the ratio is a class word, ratio-60-40; a slash is not a class and sets no ratio', () => {
  const slide = (words) => `<!-- _class: ${words} -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n`;
  const cols = (html) => html.match(/--pane-cols:\s*([^;"]+)/)?.[1];
  assert.match(cols(render(slide('columns ratio-60-40'))), /60fr\s+40fr|60.*40/);
  assert.deepEqual(spec.classLayout('columns ratio-60-40 dark'), { spec: '60/40', rest: 'dark', layout: 'columns' });
  // The slash form is not read as a ratio: the panes render 50/50, and lint gives the rewrite once.
  assert.equal(spec.classLayout('columns 60/40').spec, '');
  for (const words of ['columns 60/40', 'columns 60 / 40']) {
    const f = lintText(slide(words));
    const slash = f.filter((x) => x.rule === 'pane-layout' && /not a class name/.test(x.message));
    assert.equal(slash.length, 1, words);
    assert.match(slash[0].fix, /ratio-60-40/);
    assert.deepEqual(f.filter((x) => x.rule === 'unknown-class'), [], words);
  }
  // An off-grid ratio is reported in the class spelling.
  const off = lintText(slide('columns ratio-62-38')).find((x) => x.rule === 'pane-layout');
  assert.match(off.message, /ratio-62-38/);
  assert.match(off.fix, /ratio-25-75/);
});

test('a host with fewer than two panes still renders as content; a host inside a pane renders as content', () => {
  const classOfFirst = (html) => html.match(/<section[^>]*class="([^"]*)"/)[1].split(/\s+/);
  for (const md of ['<!-- _class: columns -->\n\n## H\n\n- one\n- two\n', '<!-- _class: rows -->\n\n## H\n\n### Only\n\n- a\n']) {
    assert.ok(classOfFirst(render(md)).includes('content'), md);
  }
  const inPane = render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: columns -->\n### A\n\nx\n\n### B\n\ny\n');
  assert.deepEqual([...inPane.matchAll(/<lat-pane class="([^"]*)"/g)].map((m) => m[1].split(' ')[0]), ['content', 'content']);
  assert.equal(sectionTags(inPane).length, 1);
  const f = lintText('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: columns -->\n### A\n\nx\n\n### B\n\ny\n').filter((x) => x.rule.startsWith('pane-'));
  assert.deepEqual(f.map((x) => x.rule), ['pane-layout']);
  assert.match(f[0].message, /cannot be a pane's component/);
});

test('lint: a host in a class: run, or deck-wide, is one warning that says it lays out nothing', () => {
  const run = lintText('## A\n\n- x\n\n---\n\n<!-- class: rows -->\n\n## B\n\n- y\n').filter((x) => x.rule === 'pane-layout');
  assert.equal(run.length, 1);
  assert.match(run[0].message, /lays out none of them/);
  const deck = lintText('---\nclass: columns\n---\n\n## A\n\n- x\n').filter((x) => x.slide === 0 && /columns/.test(x.line || ''));
  assert.deepEqual(deck.map((x) => x.rule), ['pane-layout']);
});

test('a bare ### under a pill leaves no head on a split page, as on the wide slide', () => {
  const flat = render('---\nsize: portrait\n---\n\n<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n`Q3`\n###\n\n- a\n- b\n\n<!-- _pane: content -->\n### B\n\ny\n').replace(/>\s+</g, '><');
  assert.doesNotMatch(flat, /<h3><\/h3>/);
  assert.doesNotMatch(flat, /Q3/);
});

test('lint reads the whole _class: a slash in a multi-line _class, two ratio words, a class: run in code', () => {
  const two = (cls) => `<!-- _class: ${cls} -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n`;
  const multi = lintText(two('columns\n60/40')).filter((x) => x.rule === 'pane-layout');
  assert.equal(multi.length, 1);
  assert.match(multi[0].fix, /ratio-60-40/);
  // A ratio word that sets the ratio: the slash warning does not claim 50/50.
  const both = lintText(two('columns ratio-60-40 60/40')).find((x) => /not a class name/.test(x.message));
  assert.doesNotMatch(both.message, /50\/50/);
  const pair = lintText(two('columns ratio-60-40 ratio-70-30')).find((x) => /names 2 ratios/.test(x.message));
  assert.match(pair.fix, /`ratio-70-30`/);
  // An off-grid ratio is not applied, so it is not "the last one used" either.
  const off = lintText(two('columns ratio-60-40 ratio-80-20')).filter((x) => x.rule === 'pane-layout');
  assert.equal(off.length, 1);
  assert.match(off[0].message, /ratio-80-20/);
  assert.ok(lintText(two('columns\nrows')).some((x) => /both `columns` and `rows`/.test(x.message)));
  // A `<!-- class: rows -->` quoted in code is not a run.
  const quoted = lintText('## Docs\n\n```md\n<!-- class: rows -->\n```\n\nWrite `<!-- class: columns -->` never.\n').filter((x) => x.rule === 'pane-layout');
  assert.deepEqual(quoted, []);
});

test('on a split page a bare ### takes its pills with it, and no subtitle reaches the masthead', () => {
  const flat = render('---\nsize: portrait\n---\n\n<!-- _class: columns -->\n\n## T\n\n<!-- _pane: bar -->\n`Q3`\n###\n`$M sub`\n\n- A `1`\n- B `2`\n\n<!-- _pane: content -->\n### B\n\ny\n').replace(/>\s+</g, '><');
  assert.doesNotMatch(flat, /\$M sub/);
  assert.doesNotMatch(flat, /<h3><\/h3>/);
});

test('lint: the alias gets pane-syntax with the rewrite', () => {
  const f = lintText('## T\n\n<!-- panes: stack 40/60 -->\n<!-- pane: list -->\n\n- a\n\n<!-- pane: content -->\n\nx\n').find((x) => x.rule === 'pane-syntax');
  assert.ok(f);
  assert.match(f.fix, /<!-- _class: rows ratio-40-60 -->/);
});

test('lint: a layout with fewer than two panes, a no-title with no title, two insights, a component in the layout class', () => {
  assert.deepEqual(paneRules('<!-- _class: columns -->\n\n## T\n\n### Only one\n\nx\n'), ['pane-layout']);
  assert.ok(lintText('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: content no-title -->\n\nx\n\n<!-- _pane: list -->\n\n- y\n').some((f) => /no-title/.test(f.message)));
  assert.ok(paneRules('<!-- _class: columns -->\n\n## T\n\n### A\n\n- a\n\n> One.\n\n### B\n\n- b\n\n> Two.\n').includes('pane-insight'));
  assert.ok(lintText('<!-- _class: columns table -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n').some((f) => f.rule === 'pane-layout' && f.classToken === 'table'));
});

test('lint: a titled pane holds fewer items than an untitled one', () => {
  const items = (n) => Array.from({ length: n }, (_, i) => `- Point ${i + 1}`).join('\n');
  const md = (title, n) => `<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n${title}\n\n${items(n)}\n\n<!-- _pane: content -->\n\nx\n`;
  // Find the untitled hard count, then show the titled pane crosses it one item sooner.
  let hard = 1;
  while (!paneRules(md('', hard + 1)).includes('pane-overflow')) hard++;
  assert.ok(paneRules(md('### Title', hard)).includes('pane-overflow'));
});

test('the text scanner and the engine agree on where each pane starts', () => {
  const slide = '<!-- _class: columns -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n';
  assert.deepEqual(lintCore.paneStarts(slide), [4, 8]);
  const marked = '## T\n\n<!-- _pane: list -->\n### A\n\n- x\n\n<!-- _pane: content -->\n\ny\n';
  assert.deepEqual(lintCore.paneStarts(marked), [2, 7]);
});

test('a double-backtick pill above a ### is one pill: linter and engine both count two panes', () => {
  // `` ``a`b`` `` is one code span holding a backtick (CommonMark §6.1). A one-backtick pill regex
  // read it as text, so the scanner started a third pane at the `###` under it.
  const slide = '<!-- _class: columns -->\n\n## T\n\n<!-- _pane: list -->\n``a`b``\n### One\n\n- x\n\n### Two\n\n- y\n';
  assert.equal(spec.scanPanes(slide).split.markers, 2);
  assert.deepEqual(lintCore.paneStarts(slide), [4, 10]);
  const html = render(slide);
  assert.equal(count(html, /<lat-pane /g), 2);
  assert.deepEqual(spec.paneHeadText('``a`b``\n### One\n'), { eyebrow: 'a`b', title: 'One', subtitle: null, body: '' });
  assert.equal(paneRules(slide).includes('pane-layout'), false);
  for (const [line, want] of [['`a`', true], ['``a`b``', true], ['`` `x` ``', true], ['``a``b``', false], ['`a` b', false], ['`a`b`', false], ['```', false]]) {
    assert.equal(spec.isPillLine(line), want, line);
  }
});

test('export-to-Marp drops the layout words and the markers, and keeps the other classes', () => {
  const out = stripPaneMarkers('<!-- _class: columns ratio-60-40 dark -->\n\n## T\n\n<!-- _pane: bar -->\n\n- A `4`\n\n<!-- _pane: list -->\n\n- x\n');
  assert.match(out, /<!-- _class: dark -->/);
  assert.doesNotMatch(out, /columns|_pane|60\/40/);
});

test('the slide map reads a split ### slide as two pages, and a wide one as one without the layout words', () => {
  const md = (size) => `---\nsize: ${size}\n---\n\n<!-- _class: columns dark -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n`;
  const wide = slideClassSpans(md('hd')).spans;
  assert.equal(wide.length, 1);
  assert.equal(wide[0].slideClass, 'dark');
  const tall = slideClassSpans(md('portrait')).spans;
  assert.deepEqual(tall.map((s) => s.slideClass), ['content dark', 'content dark']);
});

test('Read view: each pane\'s head reads before its body, hidden or not', async () => {
  const { projectDeckToProse } = await import('../../../lib/transformers/prose-projection.mjs');
  const html = render(NEW.replace('<!-- _pane: list -->', '<!-- _pane: list no-title -->'));
  const dom = new JSDOM(`<body>${html.replace(/<section/g, '<section data-lattice-slide')}</body>`);
  const { articleHtml } = projectDeckToProse([...dom.window.document.querySelectorAll('section')]);
  const at = (t) => articleHtml.indexOf(t);
  assert.ok(at('Revenue by line') >= 0 && at('Revenue by line') < at('What changed'));
  assert.ok(at('What changed') < at('Services crossed licenses'));
  assert.equal(articleHtml.split('What changed').length - 1, 1, 'printed once');
});

// ── Found by the independent checker (maker-checker) ──────────────────────────────────────────

test('export-to-Marp rewrites a marker-less columns slide too', () => {
  const out = stripPaneMarkers('<!-- _class: columns ratio-60-40 dark -->\n\n## T\n\n### A\n\n- a\n\n### B\n\n- b\n');
  assert.match(out, /<!-- _class: dark -->/);
  assert.doesNotMatch(out, /columns|60\/40/);
});

test('a pane that is only a quote and its attribution stays a pane', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n### Voice of customer\n\n> We cut onboarding from 3 weeks to 4 days.\n\n— Jane Doe, CFO\n\n### Numbers\n\n- a\n- b\n');
  const first = html.match(/<lat-pane[\s\S]*?<\/lat-pane>/)[0];
  assert.match(first, /We cut onboarding/);
  assert.match(first, /Jane Doe/);
  // Nothing reached the slide's own coda (the pane's component may set its quote as its own).
  const host = html.slice(html.indexOf('<section'), html.indexOf('</section>'));
  assert.doesNotMatch(host.slice(host.lastIndexOf('</lat-pane>')), /cell-coda/);
});

test('lint does not throw on a multi-line _class that also names a component', () => {
  const md = '<!--\n_class: columns bar\n-->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n';
  assert.ok(lintText(md).some((f) => f.rule === 'pane-layout' && f.classToken === 'bar'));
});

test('the alias keeps the rules it rendered with: a pane ### is its component\'s, pane A keeps its insight', () => {
  const html = render('## T\n\n<!-- pane: content -->\n\n- x\n\n> Pane A insight.\n\n<!-- pane: team-profile -->\n\n### Your team\n\n- Ada\n  - Lead\n\n### Our team\n\n- Bo\n  - Rep\n');
  assert.doesNotMatch(html, /lat-pane-cell|lat-pane-head/);
  assert.match(html.match(/<lat-pane[\s\S]*?<\/lat-pane>/g)[1], /Your team[\s\S]*Our team/);
  assert.match(html.match(/<lat-pane[\s\S]*?<\/lat-pane>/)[0], /Pane A insight/);
});

test('a lowercase comment that starts with "pane:" is a speaker note, not a marker', () => {
  const html = render('## T\n\n<!-- pane: check the numbers -->\n\nx\n\n<!-- pane: and the dates -->\n\ny\n');
  assert.equal(count(html, /<lat-pane\b/g), 0);
  assert.equal(spec.parseMarker('<!-- pane: check the numbers -->'), null);
  assert.deepEqual(spec.parseMarker('<!-- pane: bar no-title -->'), { cls: 'bar', mods: ['no-title'], modifiers: [], legacy: true });
});

test('the last _class names the layout, as the last _class is the one applied', () => {
  const lastDark = '<!-- _class: columns -->\n<!-- _class: dark -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n';
  assert.equal(count(render(lastDark), /<lat-pane\b/g), 0);
  assert.deepEqual(paneRules(lastDark), []);
  const lastColumns = render('<!-- _class: dark -->\n<!-- _class: columns -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n');
  assert.equal(count(lastColumns, /<lat-pane\b/g), 2);
  assert.doesNotMatch(sectionTags(lastColumns)[0], /\bdark\b/);
  const rowsLast = render('<!-- _class: columns -->\n<!-- _class: rows ratio-40-60 -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n');
  assert.match(rowsLast, /data-panes="stack"/);
  assert.doesNotMatch(sectionTags(rowsLast)[0], /\bcolumns\b/);
});

test('lint ignores a _class quoted in a fence, reads a spaced ratio, and counts a quote beside a fence', () => {
  assert.deepEqual(paneRules('## T\n\n```md\n<!-- _class: columns -->\n```\n'), []);
  assert.deepEqual(lintText('<!-- _class: columns 60 / 40 -->\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n').filter((f) => f.rule === 'unknown-class'), []);
  const md = '<!-- _class: columns -->\n\n## T\n\n### A\n\n> One.\n\n```js\nx\n```\n\n### B\n\n- b\n\n> Two.\n';
  assert.ok(paneRules(md).includes('pane-insight'));
});

// ── Found by the red team ─────────────────────────────────────────────────────────────────────

test('an author cannot write the internal marker: it is inert, and a pane attribute is escaped', () => {
  const html = render('<!-- lat-panes: 50/50 heads -->\n<!-- lat-pane: {"cls":"bar\\" onmouseover=\\"alert(1)\\" x=\\"","mods":[],"modifiers":[]} -->\n\n- a\n\n<!-- lat-pane: {"cls":"content","mods":[],"modifiers":[]} -->\n\n- b\n');
  assert.doesNotMatch(html, /onmouseover="alert/);
  assert.equal(count(html, /<lat-pane\b/g), 0);
});

test('a columns slide with fewer than two panes keeps columns as the class it was (a Marp deck\'s own)', () => {
  const html = render('<!-- _class: columns -->\n\n## T\n\n- a list\n\nA paragraph.\n');
  assert.match(sectionTags(html)[0], /\bcolumns\b/);
  assert.doesNotMatch(html, /lat-pane/);
  const out = stripPaneMarkers('<!-- _class: columns -->\n\n## T\n\n- a\n');
  assert.match(out, /<!-- _class: columns -->/);
});

test('export-to-Marp keeps an empty last _class, as the engine does, so an earlier one does not return', () => {
  const out = stripPaneMarkers('<!-- _class: dark -->\n<!-- _class: columns -->\n\n## T\n\n### A\n\n- a\n\n### B\n\n- b\n');
  assert.match(out, /<!-- _class: dark -->\n<!-- _class:\s*-->/);
  assert.doesNotMatch(sectionTags(render('<!-- _class: dark -->\n<!-- _class: columns -->\n\n## T\n\n### A\n\n- a\n\n### B\n\n- b\n'))[0], /\bdark\b/);
});

test('a pane pill renders through the host\'s inline rules, as a slide pill does', () => {
  const pane = render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: content -->\n`\\{Q3}`\n### A\n\nx\n\n### B\n\ny\n');
  const slide = render('`\\{Q3}`\n\n## T\n\nx\n');
  const pillOf = (h, re) => (h.match(re) || [])[1];
  // The pill joins the title as one label, rendered by the same inline rules and unwrapped from
  // its <code>: the text inside is the slide pill's text, whatever escaping it took.
  const inner = (h) => h.replace(/^<p[^>]*>\s*<code[^>]*>([\s\S]*?)<\/code>\s*<\/p>$/, '$1');
  const slidePill = inner(pillOf(slide, /(<p[^>]*>(?:(?!<p).)*?Q3[\s\S]*?<\/p>)/));
  assert.equal(pillOf(pane, /<div class="lat-pane-head"><h3>([\s\S]*?) · A<\/h3>/), slidePill);
});

test('lint: a folded marker, columns with rows, a ### above the title, a bare ###', () => {
  const folded = lintText('<!-- _class: columns -->\n\n## X\n\n<!-- _pane: content -->\n### Plan\n\n- a\n\n### Risks\n\n- r\n\n<!-- _pane: bar -->\n### Revenue\n\n- Q1 `10`\n').find((f) => f.rule === 'pane-layout');
  assert.match(folded.message, /renders as its text, not as 'bar'/);
  assert.match(folded.message, /####/);
  assert.ok(lintText('<!-- _class: columns rows -->\n\n## X\n\n### A\n\nx\n\n### B\n\ny\n').some((f) => /both `columns` and `rows`/.test(f.message)));
  assert.ok(lintText('<!-- _class: columns -->\n\n### Kicker\n\n## X\n\n### A\n\nx\n\n### B\n\ny\n').some((f) => /above the slide's `##`/.test(f.message)));
  assert.doesNotMatch(render('<!-- _class: columns -->\n\n## T\n\n<!-- _pane: content -->\n###\n\nx\n\n### B\n\ny\n'), /<h3><\/h3>/);
});

test('lint: a deck-wide class: columns lays out nothing, and says so', () => {
  assert.ok(lintText('---\nclass: columns\n---\n\n## T\n\n### A\n\nx\n\n### B\n\ny\n').some((f) => f.rule === 'pane-layout' && /deck-wide/.test(f.message)));
});
