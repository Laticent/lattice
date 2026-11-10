/**
 * Unit: `_focusSteps` is a behavior on ONE slide, walked live
 * (engineering/decisions/2026-11-09-steps-as-a-behavior.md). The engine no longer copies the
 * slide once per step: it stamps `data-focus-steps`, and the focus resolver
 * (lib/transformers/focus.js) tags each unit with the step it is lit at (`data-step`) and the
 * steps it recedes at (`data-step-recede`). At rest nothing is lit (S1); the live surface paints a
 * step with lib/core/step-state.mjs `applyStepAt`. Asserted through lib/engine, the canonical
 * render path.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const latticeEngine = require('../../../lib/engine');

const engine = latticeEngine.createEngine();
const html = (md) => engine.render(md).html;
const sections = (h) => h.split(/(?=<section[\s>])/).filter((s) => /^<section[\s>]/.test(s));

const DECK = `---\ntheme: indaco\npaginate: true\n---\n\n<!-- _class: cards-grid -->\n<!-- _focusSteps: item 1 | item 2 | item 3 -->\n<!-- _footer: "Walk" -->\n\n## Four components.\n\n- A\n  - a\n- B\n  - b\n- C\n  - c\n`;

describe('_focusSteps is one slide', () => {
  test('one authored slide renders as one slide, whatever its step count', () => {
    assert.equal(sections(html(DECK)).length, 1);
  });

  test('the slide carries its walk: count, kind, and each step\'s axis and style', () => {
    const [s] = sections(html(DECK));
    assert.match(s, /data-steps="3"/);
    assert.match(s, /data-step-kind="focus"/);
    assert.match(s, /data-step-axes="item item item"/);
    assert.match(s, /data-step-styles="spotlight spotlight spotlight"/);
  });

  test('each unit carries the step it is lit at and the steps it recedes at', () => {
    const [s] = sections(html(DECK));
    const items = [...s.matchAll(/<li\b[^>]*data-step="(\d)"[^>]*>/g)].map((m) => m[1]);
    assert.deepEqual(items, ['1', '2', '3']);
    assert.match(s, /<li\b[^>]*data-step-recede="2 3"/);
  });

  test('AT REST nothing is lit: no `.lat-focus`, no `.lat-recede`, no axis (S1)', () => {
    const [s] = sections(html(DECK));
    assert.doesNotMatch(s, /lat-focus|lat-recede/);
    assert.doesNotMatch(s, /data-focus-axis=/);
  });

  test('the slide keeps its other directives (class + footer)', () => {
    const [s] = sections(html(DECK));
    assert.match(s, /class="[^"]*cards-grid/);
    assert.match(s, /<footer>Walk<\/footer>/);
  });

  test('page numbers do not jump: a stepping slide is one page', () => {
    const deck = `---\ntheme: indaco\npaginate: true\n---\n\n# One\n\n---\n\n<!-- _class: table -->\n<!-- _focusSteps: row 1 | row 2 | row 3 -->\n\n| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n\n---\n\n# Three\n`;
    const pages = sections(html(deck)).map((s) => (s.match(/data-lattice-pagination="(\d+)"/) || [])[1]);
    assert.deepEqual(pages, ['1', '2', '3']);
  });

  test('a deck without _focusSteps is untouched', () => {
    const plain = '---\ntheme: indaco\n---\n\n## One\n\n- a\n\n---\n\n## Two\n\n- b\n';
    const out = html(plain);
    assert.equal(sections(out).length, 2);
    assert.doesNotMatch(out, /data-step/);
  });
});

// The parse-time copy read `_focusSteps` from ANY comment in an html_block, including the second
// of two on one line (`<!-- _class: table --> <!-- _focusSteps: … -->`). It now reads through the
// engine's directive grammar like every other directive, so it follows that grammar's
// one-comment-per-line rule, the rule `_class` already had on that same line. No committed deck
// writes two directive comments on one line (checked 2026-11-09 with `git grep`).

describe('_focusSteps keeps quoted steps as written (checker round 2)', () => {
  test("`'row 1' | 'row 2'` splits on the pipe and drops the quotes", () => {
    const table = '| A | B |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n';
    const out = latticeEngine.createEngine().render(`<!-- _focusSteps: 'row 1' | 'row 2' -->\n\n${table}`).html;
    assert.match(out, /data-steps="2"/);
    assert.match(out, /data-step-axes="row row"/);
  });
});

describe('a step lights exactly what the same `_focus` would', () => {
  // The painted step, read off the DOM, must equal the hand-written `_focus` for that step.
  const { applyStepAt } = require('../../../lib/core/step-state.mjs');
  const dom = (h) => new JSDOM(`<!doctype html><body>${h}</body>`).window.document;
  const marks = (doc) => [...doc.querySelectorAll('li, tr, td, th')].map((el) => (el.classList.contains('lat-focus') ? 'F' : el.classList.contains('lat-recede') ? 'r' : '.')).join('');
  const body = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n| 5 | 6 |\n';
  const WALK = ['row 2', 'col 1', 'cell 3,2', 'row 1, row 3'];

  for (const [k, spec] of WALK.entries()) {
    test(`step ${k + 1} (${spec})`, () => {
      const stepped = dom(html(`<!-- _class: table -->\n<!-- _focusSteps: ${WALK.join(' | ')} -->\n\n${body}`));
      const sec = stepped.querySelector('section');
      applyStepAt(sec, k + 1);
      const single = dom(html(`<!-- _class: table -->\n<!-- _focus: ${spec} -->\n\n${body}`));
      assert.equal(marks(stepped), marks(single));
      assert.equal(sec.getAttribute('data-step-at'), String(k + 1));
      assert.equal(sec.getAttribute('data-focus-axis'), single.querySelector('section').getAttribute('data-focus-axis'));
      assert.equal(sec.getAttribute('data-focus-style'), single.querySelector('section').getAttribute('data-focus-style'));
    });
  }

  test('back to rest takes every mark off', () => {
    const doc = dom(html(`<!-- _class: table -->\n<!-- _focusSteps: ${WALK.join(' | ')} -->\n\n${body}`));
    const sec = doc.querySelector('section');
    applyStepAt(sec, 2);
    applyStepAt(sec, null);
    assert.equal(doc.querySelectorAll('.lat-focus, .lat-recede').length, 0);
    assert.equal(sec.hasAttribute('data-step-at'), false);
    assert.equal(sec.hasAttribute('data-focus-axis'), false);
  });

  test('code lines step too, wrapped once', () => {
    const md = '<!-- _focusSteps: line 1 | line 2-3 -->\n\n```js\nconst a = 1;\nconst b = 2;\nconst c = 3;\n```\n';
    const doc = dom(html(md));
    const sec = doc.querySelector('section');
    applyStepAt(sec, 2);
    const lit = [...doc.querySelectorAll('pre code .ln')].map((el) => (el.classList.contains('lat-focus') ? 'F' : 'r')).join('');
    assert.equal(lit, 'rFF');
  });
});

describe('a build slide paints by the same kernel', () => {
  const { applyStepAt } = require('../../../lib/core/step-state.mjs');
  test('step 0 reveals nothing, step N everything, rest everything', () => {
    const doc = new JSDOM(`<!doctype html><body>${html('<!-- _build -->\n\n- a\n- b\n- c\n')}</body>`).window.document;
    const sec = doc.querySelector('section');
    assert.equal(sec.getAttribute('data-step-kind'), 'build');
    assert.equal(sec.getAttribute('data-steps'), '3');
    const built = () => doc.querySelectorAll('li.lat-built').length;
    applyStepAt(sec, 0);
    assert.equal(built(), 0);
    assert.equal(sec.getAttribute('data-build-at'), '0');
    applyStepAt(sec, 2);
    assert.equal(built(), 2);
    applyStepAt(sec, null);
    assert.equal(sec.hasAttribute('data-step-at'), false);
    assert.equal(sec.hasAttribute('data-build-at'), false);
  });
});

describe('a chart kernel that writes its own data attributes keeps them under a focus walk', () => {
  // The heatmap's ramp bucket used to be `data-step`, the step contract's own name, so a `_focusSteps` walk over
  // heatmap marks appended to it (`data-step="4 1"`) and the cell lost its fill. The ramp is `data-ramp` now.
  test('heatmap cells keep their ramp and gain only the step tags', () => {
    const md = '<!-- _class: heatmap -->\n<!-- _focusSteps: mark 2 | mark 4 -->\n\n## Heat\n\n| | A | B |\n|---|---|---|\n| X | 1 | 9 |\n| Y | 5 | 3 |\n';
    const out = html(md);
    const cells = [...out.matchAll(/<rect class="heatmap-cell"[^>]*>/g)].map((m) => m[0]);
    assert.ok(cells.length >= 4);
    for (const c of cells) assert.match(c, /data-ramp="\d"/);
    assert.ok(cells.some((c) => /data-step="1"/.test(c)), 'mark 2 is lit at step 1');
    assert.ok(cells.every((c) => !/data-step="[^"]*\s/.test(c) || /data-step="\d( \d)*"/.test(c)));
  });
});

describe('the red team\'s breaks stay fixed (2026-11-09)', () => {
  const ss = require('../../../lib/engine/structural-split');
  const { resolveSize } = require('../../../lib/engine/css');
  const cap = ss.splitCapacityFrom(require('../../../lib/components').loadAll(require('node:path').join(__dirname, '../../../lib/components')));
  const split = (md) => {
    const g = resolveSize('portrait');
    return ss.structuralSplit(html(md), { deckSource: md, width: parseFloat(g.width), height: parseFloat(g.height), capacity: cap }).html;
  };
  const walks = (h) => sections(h.slice(h.search(/<section\b[^>]*data-lattice-slide=/))).map((s) => ({
    steps: (s.match(/data-steps="(\d+)"/) || [])[1] ?? null,
    lit: [...s.matchAll(/<li\b[^>]*\sdata-step="([^"]*)"/g)].map((m) => m[1]),
  }));
  const items = Array.from({ length: 12 }, (_, i) => `- Item ${i + 1} carries a sentence long enough to fill a line`).join('\n');

  test('#1 a split build: every page walks ONLY its own units', () => {
    const pages = walks(split(`---\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: list -->\n<!-- _build: item -->\n\n## A long list\n\n${items}\n`));
    assert.ok(pages.length > 2, 'the slide splits');
    for (const p of pages) {
      // A page's walk has exactly as many steps as it holds units, numbered from 1.
      assert.equal(p.steps === null ? 0 : Number(p.steps), p.lit.length);
      p.lit.forEach((k, i) => {
        assert.equal(k, String(i + 1));
      });
    }
  });

  test('#1 a split focus walk: a page keeps only the steps that light something on it', () => {
    const pages = walks(split(`---\ntheme: indaco\nsize: portrait\n---\n\n<!-- _class: list -->\n<!-- _focusSteps: item 1 | item 10 | item 12 -->\n\n## A long list\n\n${items}\n`));
    const walking = pages.filter((p) => p.steps !== null);
    assert.equal(walking.length, 3, 'three pages hold a lit item; every other page rests');
    for (const p of walking) assert.equal(p.steps, '1');
  });

  test('#2 a deck-wide focusSteps walks nothing: not from front matter, and a bare comment sets its own slide only', () => {
    const t = '| a | b |\n|---|---|\n| 1 | 2 |\n| 3 | 4 |\n';
    const fm = html(`---\nfocusSteps: item 1 | item 2\n---\n\n- x\n- y\n`);
    assert.doesNotMatch(fm, /data-focus-steps/);
    const bare = sections(html(`<!-- focusSteps: col 1 | col 2 -->\n\n${t}\n---\n\n${t}`));
    assert.match(bare[0], /data-focus-steps=/);
    assert.doesNotMatch(bare[1], /data-focus-steps=/);
  });

  test('#3 double-quoted steps light their target on the string path, as on the DOM path', () => {
    const [s] = sections(html('<!-- _focusSteps: "item 1" | "item 2" -->\n\n- a\n- b\n'));
    assert.match(s, /data-step-axes="item item"/);
    assert.deepEqual([...s.matchAll(/<li\b[^>]*\sdata-step="([^"]*)"/g)].map((m) => m[1]), ['1', '2']);
  });

  test('#4 a step that lights nothing is no step: no dead presses', () => {
    const [prose] = sections(html('<!-- _focusSteps: row 1 | item 9 | mark 2 -->\n\n## Just prose\n\nA paragraph.\n'));
    assert.doesNotMatch(prose, /data-steps=/, 'nothing to walk: the slide rests');
    const [list] = sections(html('<!-- _focusSteps: item 1 | item 9 | item 2 -->\n\n- a\n- b\n'));
    assert.match(list, /data-steps="2"/);
    assert.match(list, /data-step-axes="item item"/);
  });
});

test('#4 on the DOM path too: the live resolver drops a step that lights nothing (HARD RULE #1)', () => {
  const doc = new JSDOM('<!doctype html><body><section data-focus-steps="item 1 | item 9 | item 2"><ul><li>a</li><li>b</li></ul></section></body>').window.document;
  require('../../../lib/transformers/focus.js').applyToDom(doc);
  const sec = doc.querySelector('section');
  assert.equal(sec.getAttribute('data-steps'), '2');
  assert.equal(sec.getAttribute('data-step-axes'), 'item item');
  assert.deepEqual([...doc.querySelectorAll('li')].map((li) => li.getAttribute('data-step')), ['1', '2']);
});
