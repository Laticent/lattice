const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { fillAutoAgenda, autoAgendaPlan } = require('../../../lib/core/agenda-autofill');
const { agendaLintPlan } = require('../../../lib/authoring/lint-core');
const { createEngine } = require('../../../lib/engine');

// An empty agenda fills itself from the deck's dividers (engineering/decisions/2026-11-08-agenda-styles-and-autofill.md).

const ROOT = path.join(__dirname, '..', '..', '..');
const slide = (cls, body) => `<!-- _class: ${cls} -->\n\n${body}`;
const deck = (...slides) => `---\ntheme: indaco\n---\n\n${slides.join('\n\n---\n\n')}\n`;

const DIVIDERS = [
  slide('divider', '`Section 01`\n\n## The quarter in four numbers.'),
  slide('list', '## Body.\n\n- One\n- Two'),
  slide('divider', '## Where growth leaked'),
];

test('an empty agenda gets one numbered item per divider, the closing period dropped', () => {
  const src = deck('# Title', slide('agenda', '## What we will cover.'), ...DIVIDERS);
  const out = fillAutoAgenda(src);
  assert.match(out, /## What we will cover\.\n\n1\. The quarter in four numbers\n2\. Where growth leaked\n/);
});

test('a hand-written list always wins: the source comes back as the same string', () => {
  const src = deck(slide('agenda', '## Agenda.\n\n1. Something else\n2. Entirely'), ...DIVIDERS);
  assert.equal(fillAutoAgenda(src), src);
});

test('a bullet list counts as the author\'s list too', () => {
  const src = deck(slide('agenda', '## Agenda.\n\n- Mine'), ...DIVIDERS);
  assert.equal(fillAutoAgenda(src), src);
});

test('no agenda, or fewer than two dividers: nothing changes', () => {
  const none = deck('# Title', ...DIVIDERS);
  assert.equal(fillAutoAgenda(none), none);
  const one = deck(slide('agenda', '## Agenda.'), DIVIDERS[0]);
  assert.equal(fillAutoAgenda(one), one);
});

test('a reprise inside section k gains progress-k; one before the first divider gains none', () => {
  const src = deck(slide('agenda', '## Up next.'), DIVIDERS[0], slide('agenda', '## Where we are.'), DIVIDERS[2]);
  const out = fillAutoAgenda(src);
  assert.match(out, /<!-- _class: agenda agenda-pages -->\n\n## Up next\./);
  assert.match(out, /<!-- _class: agenda progress-1 agenda-pages -->\n\n## Where we are\./);
});

test('an author\'s own progress-N is kept', () => {
  const src = deck(DIVIDERS[0], slide('agenda progress-2', '## Where we are.'), DIVIDERS[2]);
  assert.match(fillAutoAgenda(src), /<!-- _class: agenda progress-2 agenda-pages -->/);
});

test('a hidden divider opens no section, and a divider in a code fence is code', () => {
  const src = deck(
    slide('agenda', '## Agenda.'),
    DIVIDERS[0],
    '<!-- _class: divider -->\n<!-- hide -->\n\n## Cut for time',
    slide('list', '## Example.\n\n```md\n<!-- _class: divider -->\n## Not a section\n```'),
    DIVIDERS[2],
  );
  const out = fillAutoAgenda(src);
  assert.match(out, /1\. The quarter in four numbers\n2\. Where growth leaked\n/);
  assert.doesNotMatch(out, /\d\. (Cut for time|Not a section)/);
});

test('a running global `class: agenda` is filled but never given progress (it would carry to later slides)', () => {
  const src = `---\ntheme: indaco\n---\n\n<!-- class: agenda -->\n\n## Agenda.\n\n---\n\n${DIVIDERS.join('\n\n---\n\n')}\n`;
  const out = fillAutoAgenda(src);
  assert.doesNotMatch(out, /progress-/);
});

test('a quoted directive keeps its class: the progress token goes inside the quotes', () => {
  const src = deck(DIVIDERS[0], slide('"agenda"', '## Where we are.'), DIVIDERS[2]);
  assert.match(fillAutoAgenda(src), /<!-- _class: "agenda progress-1 agenda-pages" -->/);
});

test('a directive spread over several lines still gains its progress', () => {
  const src = deck(DIVIDERS[0], '<!--\n_class: agenda\n-->\n\n## Where we are.', DIVIDERS[2]);
  assert.match(fillAutoAgenda(src), /<!--\n_class: agenda progress-1 agenda-pages\n-->/);
});

test('a divider heading that starts with a block marker stays one item of text', () => {
  const src = deck(slide('agenda', '## A.'), slide('divider', '## 1. Introduction'), slide('divider', '## - Draft notes'), slide('divider', '## # Hash'));
  const out = fillAutoAgenda(src);
  assert.match(out, /1\. 1\\\. Introduction\n2\. \\- Draft notes\n3\. \\# Hash\n/);
  const { html } = createEngine().render(out, 'indaco');
  const agenda = html.split('<section').find((s) => /class="[^"]*\bagenda\b/.test(s));
  assert.equal((agenda.match(/<li\b/g) || []).length, 3, 'three items, none nested');
  assert.doesNotMatch(agenda, /<ol[^>]*>[\s\S]*<ol|<ul|<h1/);
});

test('only a directive the ENGINE reads fills: two comments on one line, or a front-matter class, do not', () => {
  for (const src of [
    deck('<!-- _paginate: false --> <!-- _class: agenda -->\n\n## A.', ...DIVIDERS),
    deck('<!-- _class: agenda --> x\n\n## A.', ...DIVIDERS),
    `---\nclass: agenda\n---\n\n# T\n\n---\n\n${DIVIDERS.join('\n\n---\n\n')}\n`,
  ]) assert.equal(fillAutoAgenda(src), src);
});

test('the fill is idempotent: a filled deck fills to itself', () => {
  const src = deck(slide('agenda', '## Agenda.'), ...DIVIDERS);
  const once = fillAutoAgenda(src);
  assert.equal(fillAutoAgenda(once), once);
});

test('the Q3 board fixture: emptying its agenda and filling it reproduces the hand-written list', () => {
  const src = fs.readFileSync(path.join(ROOT, 'test', 'fixtures', 'q3-board-review.md'), 'utf8');
  const emptied = src.replace(/(<!-- _class: agenda -->[\s\S]*?\n)((?:\d+\. .*\n)+)/, '$1');
  assert.notEqual(emptied, src);
  const squash = (s) => s.replace(/\n{2,}/g, '\n\n').trim();
  // The filled agenda also carries the page-number marker; the hand-written one did not.
  assert.equal(squash(fillAutoAgenda(emptied)).replace(' agenda-pages -->', ' -->'), squash(src));
});

test('the engine renders the filled list, so every surface the engine draws shows it', () => {
  const src = deck(slide('agenda', '## Agenda.'), ...DIVIDERS);
  const { html } = createEngine().render(src, 'indaco');
  const agenda = html.split('<section').find((s) => /class="[^"]*\bagenda\b/.test(s));
  assert.ok(agenda, 'an agenda section renders');
  assert.match(agenda, /<ol[\s\S]*The quarter in four numbers[\s\S]*Where growth leaked[\s\S]*<\/ol>/);
});

// The linter reads the same facts through its own boundary parser (the build forbids it the engine's),
// so the two readings are pinned here over every committed deck that names an agenda, plus the cases above.
test('the lint plan and the kernel agree on every empty agenda and the section count', () => {
  const decks = [
    deck(slide('agenda', '## A.'), ...DIVIDERS),
    deck(slide('agenda', '## A.'), DIVIDERS[0]),
    deck(slide('agenda', '## A.'), DIVIDERS[0], '<!-- _class: divider -->\n<!-- hide -->\n\n## Cut', DIVIDERS[2]),
    deck(slide('agenda', '## A.'), slide('list', '```md\n<!-- _class: divider -->\n## No\n```'), DIVIDERS[0]),
    deck(slide('agenda', '## A.\n\n<!-- a note -->'), ...DIVIDERS),
    // The checker's divergence cases (2026-11-08): a nested hide, a list inside an HTML block, two comments on one
    // line, a comment with text after it, a front-matter `class: agenda`, a multi-line directive.
    deck(slide('agenda', '## A.'), DIVIDERS[0], '<!-- _class: divider -->\n\n> <!-- hide -->\n\n## Shown', DIVIDERS[2]),
    deck(slide('agenda', '## A.\n\n<div>\n- a\n- b\n</div>'), ...DIVIDERS),
    deck('<!-- _paginate: false --> <!-- _class: agenda -->\n\n## A.', ...DIVIDERS),
    deck('<!-- _class: agenda --> x\n\n## A.', ...DIVIDERS),
    `---\nclass: agenda\n---\n\n# T\n\n---\n\n${DIVIDERS.join('\n\n---\n\n')}\n`,
    deck('<!--\n_class: agenda\n-->\n\n## A.', ...DIVIDERS),
  ];
  for (const dir of ['examples', 'exemplars', 'test/fixtures']) {
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.md') ? [path.join(d, e.name)] : []));
    for (const f of walk(path.join(ROOT, dir))) {
      const s = fs.readFileSync(f, 'utf8');
      if (/_?class\s*:[^\n]*\bagenda\b/.test(s)) decks.push(s);
    }
  }
  assert.ok(decks.length > 15, `read ${decks.length} decks`);
  for (const src of decks) {
    const kernel = autoAgendaPlan(src).map((p) => ({ slide: p.slide, fills: p.items.length > 0 }));
    const lint = agendaLintPlan(src).map((p) => ({ slide: p.slide, fills: p.sections >= 2 }));
    assert.deepEqual(lint, kernel, src.slice(0, 200));
  }
});

// ── The deck `agenda:` register (lib/core/resolve-agenda.js) ─────────────────────────────────────
const withAgenda = (line, ...slides) => deck(...slides).replace('theme: indaco', `theme: indaco\n${line}`);

test('agenda: circles styles every agenda that names no style, an authored one included, and leaves its list alone', () => {
  const src = withAgenda('agenda: circles', slide('agenda', '## Written.\n\n1. Mine\n2. Ours'), slide('agenda', '## Filled.'), ...DIVIDERS);
  const out = fillAutoAgenda(src);
  assert.match(out, /<!-- _class: agenda circles -->\n\n## Written\.\n\n1\. Mine\n2\. Ours/);
  assert.match(out, /<!-- _class: agenda circles agenda-pages -->\n\n## Filled\./);
});

test('a slide\'s own style wins over the deck\'s; agenda-ledger keeps the ledger; agenda-checks reads as checks', () => {
  const src = withAgenda('agenda: circles', slide('agenda checks', '## A.\n\n1. x'), slide('agenda agenda-ledger', '## B.\n\n1. x'), slide('agenda agenda-checks', '## C.\n\n1. x'), ...DIVIDERS);
  const out = fillAutoAgenda(src);
  assert.match(out, /<!-- _class: agenda checks -->\n\n## A\./);
  assert.match(out, /<!-- _class: agenda agenda-ledger -->\n\n## B\./);
  assert.match(out, /<!-- _class: agenda agenda-checks checks -->\n\n## C\./);
});

test('agenda: no-pages fills the list without the page-number marker; a slide can say either way', () => {
  const off = fillAutoAgenda(withAgenda('agenda: no-pages', slide('agenda', '## A.'), ...DIVIDERS));
  assert.match(off, /<!-- _class: agenda -->\n\n## A\.\n\n1\./);
  const slideOff = fillAutoAgenda(deck(slide('agenda agenda-no-pages', '## A.'), ...DIVIDERS));
  assert.doesNotMatch(slideOff, /agenda-pages/);
  const slideOn = fillAutoAgenda(withAgenda('agenda: no-pages', slide('agenda agenda-pages', '## A.'), ...DIVIDERS));
  assert.match(slideOn, /<!-- _class: agenda agenda-pages -->/);
});

test('an authored agenda never gets the page-number marker, whatever the deck says', () => {
  const src = withAgenda('agenda: ledger pages', slide('agenda', '## A.\n\n1. Mine'), ...DIVIDERS);
  assert.equal(fillAutoAgenda(src), src);
});

test('the engine prints each filled item\'s page: the slide its divider is, counting only shown slides', () => {
  const src = deck('# Title', slide('agenda', '## A.'), DIVIDERS[0], '<!-- hide -->\n\nCut', DIVIDERS[1], DIVIDERS[2]);
  const { html } = createEngine().render(src, 'indaco');
  const agenda = html.split('<section').find((x) => /class="[^"]*\bagenda\b/.test(x));
  // Title 1, agenda 2, divider 3, the hidden slide not counted, list 4, divider 5.
  assert.deepEqual([...agenda.matchAll(/<code class="agenda-page">([^<]*)<\/code>/g)].map((m) => m[1]), ['p.3', 'p.5']);
});

test('no page numbers where the deck has none (`paginate: false`), and none on an authored agenda', () => {
  const off = deck(slide('agenda', '## A.'), ...DIVIDERS).replace('theme: indaco', 'theme: indaco\npaginate: false');
  assert.doesNotMatch(createEngine().render(off, 'indaco').html, /class="agenda-page"/);
  const written = deck(slide('agenda', '## A.\n\n1. The quarter in four numbers\n2. Where growth leaked'), ...DIVIDERS);
  assert.doesNotMatch(createEngine().render(written, 'indaco').html, /class="agenda-page"/);
});

// ── The page-number pass's two arms, and the checker's findings (2026-11-08, second pass) ──────────
const { JSDOM } = require('jsdom');
const progress = require('../../../lib/forms/tile/progress/progress.transform.js');
const pagesOf = (root) => [...root.querySelectorAll('section.agenda')].map((s) => [...s.querySelectorAll('code.agenda-page')].map((c) => c.textContent));

test('an item that ends in its own page reference gets no second one, even on an agenda that asks for pages', () => {
  const src = deck(slide('agenda agenda-pages', '## A.\n\n1. The quarter in four numbers `p.12`\n2. Where growth leaked'), ...DIVIDERS);
  const { html } = createEngine().render(src, 'indaco');
  const agenda = html.split('<section').find((x) => /class="[^"]*\bagenda\b/.test(x));
  assert.equal((agenda.match(/<code\b/g) || []).length, 2, 'p.12 and one generated number, not three');
  assert.match(agenda, /The quarter in four numbers <code>p\.12<\/code>/);
});

test('the live-DOM arm (the Export-to-Marp runtime) prints the same numbers, once, on Lattice and Marpit numbering', () => {
  const src = deck('# Title', slide('agenda', '## A.'), DIVIDERS[0], DIVIDERS[1], DIVIDERS[2]);
  const { html } = createEngine().render(src, 'indaco');
  const want = pagesOf(new JSDOM(`<body>${html}</body>`).window.document);
  assert.deepEqual(want, [['p.3', 'p.5']]);
  for (const attr of ['data-lattice-pagination', 'data-marpit-pagination']) {
    // The engine's numbers taken back out, so the DOM arm has to find them itself.
    const bare = html.replace(/<code class="agenda-page">[^<]*<\/code>/g, '').replace(/data-lattice-pagination=/g, `${attr}=`);
    const d = new JSDOM(`<body>${bare}</body>`).window.document;
    for (const s of d.querySelectorAll('section')) s.setAttribute('data-lattice-slide', '');
    progress.applyToDom(d);
    progress.applyToDom(d); // idempotent
    assert.deepEqual(pagesOf(d), want, attr);
  }
});

test('a split run counts once, whether or not its pages carry a number', () => {
  const sec = (cls, extra = '', body = '') => `<section class="${cls}" ${extra}>${body}</section>`;
  const html = [
    sec('agenda agenda-pages form', 'data-lattice-pagination="1"', '<ol><li>A</li><li>B</li></ol>'),
    sec('list form silent', 'data-split-run="r1"'),
    sec('list form silent', 'data-split-run="r1"'),
    sec('divider', '', '<h2>A</h2>'),
    sec('list form', 'data-lattice-pagination="4"'),
    sec('divider', '', '<h2>B</h2>'),
  ].join('');
  const out = new JSDOM(`<body>${progress.applyToHtml(html)}</body>`).window.document;
  assert.deepEqual(pagesOf(out), [['p.3', 'p.5']]);
});

test('page numbers attach by NAME: a list reordered or renamed after the fill gets none (the red team, 2026-11-08)', () => {
  // The Marp bundle carries the filled list AND `agenda-pages` in its source, so a recipient can reorder it.
  const reordered = deck(slide('agenda agenda-pages', '## A.\n\n1. Where growth leaked\n2. The quarter in four numbers'), ...DIVIDERS);
  const renamed = deck(slide('agenda agenda-pages', '## A.\n\n1. Revenue\n2. Where growth leaked'), ...DIVIDERS);
  for (const src of [reordered, renamed]) {
    const { html } = createEngine().render(src, 'indaco');
    assert.doesNotMatch(html, /class="agenda-page"/);
    const d = new JSDOM(`<body>${html}</body>`).window.document;
    for (const sec of d.querySelectorAll('section')) sec.setAttribute('data-lattice-slide', '');
    progress.applyToDom(d);
    assert.equal(d.querySelectorAll('code.agenda-page').length, 0, 'the DOM arm agrees');
  }
  // The same names in the same order, written by hand with the marker, still get their pages.
  const inOrder = deck(slide('agenda agenda-pages', '## A.\n\n1. The quarter in four numbers\n2. Where growth leaked'), ...DIVIDERS);
  assert.match(createEngine().render(inOrder, 'indaco').html, /class="agenda-page">p\.2</);
});
