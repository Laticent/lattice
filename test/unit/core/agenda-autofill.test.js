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
  assert.match(out, /<!-- _class: agenda -->\n\n## Up next\./);
  assert.match(out, /<!-- _class: agenda progress-1 -->\n\n## Where we are\./);
});

test('an author\'s own progress-N is kept', () => {
  const src = deck(DIVIDERS[0], slide('agenda progress-2', '## Where we are.'), DIVIDERS[2]);
  assert.match(fillAutoAgenda(src), /<!-- _class: agenda progress-2 -->/);
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
  assert.match(fillAutoAgenda(src), /<!-- _class: "agenda progress-1" -->/);
});

test('a directive spread over several lines still gains its progress', () => {
  const src = deck(DIVIDERS[0], '<!--\n_class: agenda\n-->\n\n## Where we are.', DIVIDERS[2]);
  assert.match(fillAutoAgenda(src), /<!--\n_class: agenda progress-1\n-->/);
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
  assert.equal(squash(fillAutoAgenda(emptied)), squash(src));
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
