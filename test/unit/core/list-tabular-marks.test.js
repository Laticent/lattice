/**
 * Unit: the list-tabular marks kernel (lib/core/list-tabular-marks.js), the
 * markdown-it plugin that uses it, and the responsive column contract.
 *
 * A row's status used to have nowhere to go. An author who wrote `- [x]` under a
 * row got the literal text `[x]` in the description column — a typed shape on a
 * rendered surface, which is what the drawn `--mark-*` masks exist to replace.
 * These tests pin THREE things the feature stands on: which bullets qualify as a
 * marks cell, that the typed marker is stripped and replaced by a disc, and that
 * the column tracks are content-sized rather than the fixed `cqi` widths they
 * replaced.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const kernel = require('../../../lib/core/list-tabular-marks');
const latticeEngine = require('../../../lib/engine');

const CSS = fs.readFileSync(
  path.join(__dirname, '../../../lib/components/inventory/list-tabular/list-tabular.styles.css'),
  'utf8',
);

const render = (deck) => new JSDOM(latticeEngine.createEngine().render(deck).html).window.document;
const deck = (cls, body) => `---\nmarp: true\n---\n\n<!-- _class: ${cls} -->\n\n${body}\n`;

describe('list-tabular marks — the kernel', () => {
  test('maps each marker to its semantic, shape and spoken word', () => {
    assert.deepEqual(kernel.readMarker('[x] shipped'), {
      sem: 'pass', shape: 'state-full', label: 'done', consumed: 4,
    });
    assert.equal(kernel.readMarker('[-]').sem, 'warn');
    assert.equal(kernel.readMarker('[/]').sem, 'skip');
  });

  test('`[ ]` is NEUTRAL here — a ledger row not yet done, not a failure', () => {
    // checklist's reading, not verdict-grid's. An unchecked ledger row must not
    // paint the red ✕ that means "criterion not met".
    assert.equal(kernel.readMarker('[ ]').sem, 'todo');
    assert.equal(kernel.readMarker('[ ]').shape, 'state-todo');
  });

  test('a non-marker leading text is not a marks cell', () => {
    assert.equal(kernel.readMarker('The description clause.'), null);
    assert.equal(kernel.readMarker('[q] not a marker'), null);
    assert.equal(kernel.readMarker(''), null);
  });

  test('the marker gap is bounded — no unbounded whitespace run on live text', () => {
    // The runtime runs this regex over document text; `\s*` butted against the
    // rest is the superlinear pair CodeQL flags on an untrusted source.
    assert.equal(kernel.ROW_MARKER.source.includes('\\s*'), false);
    assert.equal(kernel.readMarker(`[x]${' '.repeat(8)}label`).consumed, 11);
    // A ninth space is past the bound: the extra space stays in the text rather
    // than being consumed, which is the point — the gap can never run away.
    assert.equal(kernel.readMarker(`[x]${' '.repeat(9)}label`).consumed, 11);
  });

  test('a pills-only bullet qualifies; an empty one does not', () => {
    assert.equal(kernel.isPillsOnly([{ code: true }, { text: ' ' }]), true);
    assert.equal(kernel.isPillsOnly([{ code: true }, { code: true }]), true);
    assert.equal(kernel.isPillsOnly([{ text: 'prose' }, { code: true }]), false);
    // Promoting an empty bullet would move a blank line into the trailing column.
    assert.equal(kernel.isPillsOnly([{ text: '  ' }]), false);
    assert.equal(kernel.isPillsOnly([]), false);
  });
});

describe('list-tabular marks — the render path', () => {
  test('a marker bullet becomes a marks cell with a drawn disc, marker stripped', () => {
    const doc = render(deck('list-tabular', '## Ledger\n\n1. Row\n   - Clause.\n   - [x] `stable`'));
    const marks = doc.querySelector('section.list-tabular li.marks');
    assert.ok(marks, 'the trailing bullet is promoted to the marks cell');
    const disc = marks.querySelector(':scope > .state');
    assert.equal(disc.className, 'state pass state-full');
    // The typed marker must NOT survive onto the slide.
    assert.equal(marks.textContent.includes('[x]'), false);
    assert.equal(marks.querySelector('code').textContent, 'stable');
  });

  test('the disc names its state for a screen reader', () => {
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   - C.\n   - [/] `parked`'));
    const disc = doc.querySelector('li.marks .state');
    assert.equal(disc.getAttribute('aria-label'), 'skipped');
    assert.equal(disc.getAttribute('role'), 'img');
  });

  test('a pills-only bullet is promoted without a disc', () => {
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   - C.\n   - `internal`'));
    const marks = doc.querySelector('li.marks');
    assert.ok(marks);
    assert.equal(marks.querySelector('.state'), null);
  });

  test('the marks bullet can follow ANY sublist element, not just the second', () => {
    const doc = render(
      deck('list-tabular', '## L\n\n1. Row\n   - One.\n   - Two.\n   - Three.\n   - [x] `late`'),
    );
    const marks = doc.querySelectorAll('li.marks');
    assert.equal(marks.length, 1);
    // It is the FOURTH nested bullet — the CSS keys on the class, not :nth-child.
    assert.equal(marks[0].previousElementSibling.textContent.trim(), 'Three.');
  });

  test('a prose bullet is left alone — it is the description, not a marks cell', () => {
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   - A clause with `code` in it.'));
    assert.equal(doc.querySelector('li.marks'), null);
  });

  test('a row-level bullet is never promoted — only a NESTED one', () => {
    // Depth 1 is the row itself; promoting it would eat the row's own name.
    const doc = render(deck('list-tabular', '## L\n\n1. [x] Row\n   - Clause.'));
    assert.equal(doc.querySelector('li.marks'), null);
  });

  test('the transform does not reach a section that merely contains the words', () => {
    const doc = render(deck('checklist', '## L\n\n- Row\n  - [x] `stable`'));
    assert.equal(doc.querySelector('li.marks'), null);
  });
});

/**
 * These are RENDERS, not regexes over the stylesheet. The arms in the block below
 * read the CSS as a string and can only assert that it contains the text it
 * contains; that is the right shape for "which selector is used", and the wrong
 * one for "what happens on a slide". Each case here is a defect a maker-checker
 * pass found live in the tree while the string arms were green.
 */
describe('list-tabular marks — the shapes that used to collide or vanish', () => {
  const marksOf = (doc) =>
    [...doc.querySelectorAll('li.marks')].map((li) => ({
      col: li.style.gridColumn || null,
      disc: !!li.querySelector('.state'),
      text: li.textContent.trim(),
    }));

  test('a LOOSE list still decodes, and its disc is not buried in the <p> wrapper', () => {
    // markdown-it wraps a loose item's content one element deeper. The disc used to
    // land inside that `<p>`, where every `> .state` rule missed it and it computed
    // 0x19px — `[x]` and `[ ]` rendered identically, i.e. the status was deleted.
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n\n   - Clause.\n\n   - [x] `stable`'));
    const li = doc.querySelector('li.marks');
    assert.ok(li, 'a loose list produces a marks cell');
    // The wrapper is flattened by CSS, so the disc is a descendant, not a child.
    assert.ok(li.querySelector('.state'), 'the disc survives the loose wrapper');
    assert.equal(li.textContent.includes('[x]'), false);
  });

  test('two marks bullets on one row are two cells, not one painted over the other', () => {
    const doc = render(
      deck('list-tabular', '## L\n\n1. Row\n   - Clause.\n   - [x] `a`\n   - [ ] `b`'),
    );
    const marks = marksOf(doc);
    assert.equal(marks.length, 2);
    assert.deepEqual(marks.map((m) => m.text), ['a', 'b']);
  });

  test('the legacy 3-line meta and a marks bullet both survive', () => {
    // The second nested `li` is a documented meta column. It and the marks cell both
    // want the trailing column; "Q3 2019" used to be painted over entirely.
    const doc = render(
      deck('list-tabular', '## L\n\n1. Row\n   - Clause.\n   - _Q3 2019_\n   - [x] `stable`'),
    );
    const items = [...doc.querySelectorAll('section.list-tabular ol > li > ul > li')];
    assert.equal(items.length, 3);
    assert.ok(items.some((li) => li.textContent.includes('Q3 2019')));
    assert.ok(items.some((li) => li.classList.contains('marks')));
  });

  test('a nested ORDERED sublist is left alone — its items are rows, not a sublist', () => {
    // `ol > li` is the component's row selector, and an inner `ol`'s items match it,
    // so they render as extra rows with their own counter and hairline. Promoting a
    // marks cell into one tagged markup nothing renders.
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   1. Clause.\n   2. [x] `no`'));
    assert.equal(doc.querySelector('li.marks'), null);
  });

  test('a top-level BULLET list is left alone — it produces no ledger at all', () => {
    const doc = render(deck('list-tabular', '## L\n\n- Row\n  - Clause.\n  - [x] `no`'));
    assert.equal(doc.querySelector('li.marks'), null);
  });

  test('a marker inside an emphasis run is not a leading marker', () => {
    // `.find()` over the whole inline array used to reach inside author markup and
    // strip a marker that was part of a bold run or a link label.
    for (const body of ['**[x] bold**', '*[x] em*', '[[x] link](https://e)']) {
      const doc = render(deck('list-tabular', `## L\n\n1. Row\n   - Clause.\n   - ${body} \`p\``));
      assert.equal(doc.querySelector('li.marks'), null, `${body} should not decode`);
    }
  });

  test("the disc names itself for a screen reader without putting a word in the text", () => {
    // A visually-hidden inner span was tried and removed: it joins textContent, so
    // the narration jammed ("donestable") and a split page — whose section does not
    // carry `.list-tabular` — printed the word on the slide.
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   - Clause.\n   - [x] `stable`'));
    const disc = doc.querySelector('li.marks .state');
    assert.equal(disc.getAttribute('role'), 'img');
    assert.equal(disc.getAttribute('aria-label'), 'done');
    assert.equal(disc.textContent, '');
    assert.equal(doc.querySelector('li.marks').textContent.trim(), 'stable');
  });
});

describe('list-tabular — responsive column tracks', () => {
  test('the OL owns the grid and each row is a subgrid', () => {
    // The pre-responsive shape gave every row its OWN grid, which is why the
    // tracks had to be hard `cqi` widths to line up at all.
    assert.match(CSS, /section\.list-tabular ol \{[^}]*display:grid/);
    assert.match(CSS, /section\.list-tabular ol > li \{[^}]*grid-template-columns:subgrid/);
  });

  test('no fixed-cqi track survives outside the `fixed` opt-out', () => {
    // Everything EXCEPT the `fixed` opt-out, which exists to carry those widths.
    const responsive = CSS.split(/section\.list-tabular[^{]*\.fixed ol \{[^}]*\}/).join('\n');
    const trackLines = responsive.split('\n').filter(
      (l) => /--lt-(counter|name|body|meta):/.test(l) && /cqi/.test(l),
    );
    for (const line of trackLines) {
      // The only bare-cqi track values left are the `fixed` restoration and the
      // two caps `fit-content()` clamps against.
      assert.ok(
        /fit-content\(/.test(line) || /--lt-(name|meta)-max/.test(line),
        `a bare cqi track escaped the responsive pass: ${line.trim()}`,
      );
    }
  });

  test('`fixed` restores every track the responsive pass replaced', () => {
    for (const cqi of ['3.4375cqi', '15.625cqi', '5cqi', '17.1875cqi', '20.3125cqi']) {
      assert.ok(CSS.includes(cqi), `the fixed opt-out dropped ${cqi}`);
    }
  });

  test('each `flex-*` restates all three tracks so the leftover is not split', () => {
    // A class that set only its own track would leave --lt-body at 1fr and SPLIT
    // the slack, stranding the row's tail mid-slide. Measured and fixed in review.
    for (const role of ['flex-name', 'flex-meta']) {
      const block = CSS.match(new RegExp(`\\.${role} ol \\{([^}]*)\\}`))[1];
      assert.match(block, /--lt-name:/);
      assert.match(block, /--lt-body:/);
      assert.match(block, /--lt-meta:/);
    }
  });

  test('`fit-body` hands the slack to the trailing column so it holds the right edge', () => {
    const block = CSS.match(/\.fit-body ol \{([^}]*)\}/)[1];
    assert.match(block, /--lt-meta:minmax\(max-content, 1fr\)/);
  });

  test('def grows a fourth track for a marks cell rather than sharing the body', () => {
    // def is three tracks with no meta column. Parked in the body's area a marks
    // cell overlaps a long clause — measured, a pill painted over the sentence.
    // The `:has()` guard keeps a def list WITHOUT marks on its three tracks, so no
    // existing def deck re-flows on account of this rule.
    assert.match(
      CSS,
      /\.def ol:has\(> li > ul > li\.marks\) \{[^}]*grid-template-columns:var\(--lt-counter\) var\(--lt-name\) var\(--lt-body\) var\(--lt-meta\)/,
    );
    assert.match(CSS, /\.def ol > li > ul > li\.marks \{[^}]*grid-column:4/);
  });

  test('the marks cell resets its grid row, which is not the same as leaving it unset', () => {
    // A NARROW claim, deliberately. An earlier arm here tried to assert "nothing
    // overlaps" by scanning rules whose selector text contains `li.marks` — and that
    // is structurally incapable of it: the `grid-row:1` that caused the overlap
    // arrives from `> ul > li:first-child` and `> ul > li:nth-child(2)`, selectors
    // with no `li.marks` in them, at the same specificity and earlier in source. The
    // scan was green while the component's own documented shape painted its meta over.
    //
    // Whether anything overlaps is a fact about laid-out boxes, so it is asserted
    // where boxes exist: test/integration/parity/list-tabular-marks-geometry.test.js
    // renders in Chromium and compares rectangles. What is left here is the one thing
    // a stylesheet CAN answer — that the reset is written down at all.
    assert.match(CSS, /li\.marks \{[^}]*grid-row:auto/, 'the base marks cell must reset its row');
    assert.match(CSS, /\.spec\.stacked ol > li > ul > li\.marks \{[^}]*grid-row:auto/);
  });

  test('the trailing column stays right-aligned', () => {
    assert.match(CSS, /li > ul > li\.marks \{[^}]*justify-self:end/);
    assert.match(CSS, /section\.list-tabular ol > li > code \{[^}]*text-align:right/);
  });
});
