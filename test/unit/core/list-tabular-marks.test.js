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

  test('the disc carries a visually-hidden word — the shape alone names nothing', () => {
    const doc = render(deck('list-tabular', '## L\n\n1. Row\n   - C.\n   - [/] `parked`'));
    assert.equal(doc.querySelector('li.marks .state-sr-label').textContent, 'skipped');
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
    // The `:has()` guard means a def list WITHOUT marks keeps its three tracks
    // exactly (verified byte-identical), so no existing def deck re-flows.
    assert.match(
      CSS,
      /\.def ol:has\(> li > ul > li\.marks\) \{[^}]*grid-template-columns:var\(--lt-counter\) var\(--lt-name\) var\(--lt-body\) var\(--lt-meta\)/,
    );
    assert.match(CSS, /\.def ol > li > ul > li\.marks \{[^}]*grid-column:4/);
  });

  test('a row carrying BOTH an inline meta and a marks cell stacks them, never overlaps', () => {
    // Both want column 4 row 1. Author content is never hidden to make it fit.
    assert.match(CSS, /ol > li:has\(> code\) > ul > li\.marks \{ grid-row:2; \}/);
  });

  test('the trailing column stays right-aligned', () => {
    assert.match(CSS, /li > ul > li\.marks \{[^}]*justify-self:end/);
    assert.match(CSS, /section\.list-tabular ol > li > code \{[^}]*text-align:right/);
  });
});
