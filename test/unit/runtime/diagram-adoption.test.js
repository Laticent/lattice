/**
 * Unit: an edit to a diagram's SOURCE holds the diagram already on screen.
 *
 * THE BUG THIS PINS. The Studio's typing hot path replaces a whole `<section>`
 * (`patchSections` → `lattice.replaceChild`), which destroys the rendered `<svg>`.
 * When the keystroke landed inside the ```mermaid fence the source is new, so the
 * SVG cache has nothing to hand back and the slot is EMPTY until the debounced
 * `mermaid.render` lands — measured on the built Studio at 10–11 painted frames,
 * ~200ms, per character on an idle machine. Before 2026-09-05 the same window
 * painted the raw fence source instead; the fix that removed the source did not
 * give the window anything to hold.
 *
 * `adoptOutgoingDiagrams` transplants the outgoing SVG into the fence that replaced
 * it and leaves the `<pre>` `pending`, so the render still happens and still wins.
 *
 * WHAT IS AND IS NOT TESTED HERE. This file drives the shipped function over a real
 * DOM (jsdom) and pins the pairing RULES — hold when the shape matches, refuse when
 * the fence count or the slide's scope changes, never overwrite a fence the cache
 * just settled. It does NOT prove what a browser PAINTS; jsdom has no compositor
 * (HARD RULE #23). The real-surface proof is `npm run bench:flash -- --scenario edit`
 * against the built Studio, recorded in the PR.
 *
 * The runtime is one big IIFE around a `document` guard, so requiring it in Node
 * yields nothing callable. The function is lifted between its two sentinel comments
 * and driven directly — the same technique, and for the same reason, as
 * test/unit/runtime/mermaid-per-slide-band.test.js: paraphrasing it here would test
 * the paraphrase.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { diagramScopeKey } = require('../../../lib/core/diagram-scope');

const REPO = path.join(__dirname, '..', '..', '..');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');

const BEGIN = '  // ── BEGIN ADOPTION PORT';
const END = '  // ── END ADOPTION PORT';

/** The SHIPPED selector, read out of the source so the test cannot drift from it. */
function shippedFenceSelector() {
  const m = RUNTIME_SRC.match(/const FENCE_CODE_SELECTOR\s*=\s*\n?\s*('[^']+'|"[^"]+");/);
  assert.ok(m, 'lib/runtime/index.js must declare FENCE_CODE_SELECTOR as a single string literal');
  return m[1].slice(1, -1);
}

/** Lift the real `adoptOutgoingDiagrams` and bind it to one jsdom document. */
function liftAdoption(dom, { mermaid = { render() {}, initialize() {} } } = {}) {
  const start = RUNTIME_SRC.indexOf(BEGIN);
  const end = RUNTIME_SRC.indexOf(END);
  assert.notEqual(start, -1, 'lib/runtime/index.js must bracket the adoption port with BEGIN ADOPTION PORT');
  assert.notEqual(end, -1, 'lib/runtime/index.js must bracket the adoption port with END ADOPTION PORT');
  const src = RUNTIME_SRC.slice(start, end);
  assert.match(src, /function adoptOutgoingDiagrams\(records\)/, 'the port must hold adoptOutgoingDiagrams');
  // eslint-disable-next-line no-new-func
  const make = new Function(
    'document',
    'globalScope',
    'diagramScopeKey',
    'FENCE_CODE_SELECTOR',
    `${src}\nreturn adoptOutgoingDiagrams;`,
  );
  return make(dom.window.document, { mermaid }, diagramScopeKey, shippedFenceSelector());
}

/**
 * One slide's markup in the two states the runtime produces: a fence the runtime has
 * already rendered (a tagged <pre> beside a `.mermaid` holding an SVG), and a fence
 * that has just arrived and been tagged `pending` beside an empty target.
 */
const rendered = (source, svgId) =>
  `<pre data-mermaid-state="rendered"><code class="language-mermaid-source">${source}</code></pre>` +
  `<div class="mermaid" aria-hidden="true"><svg id="${svgId}"></svg></div>`;
const pending = (source) =>
  `<pre data-mermaid-state="pending"><code class="language-mermaid-source">${source}</code></pre>` +
  `<div class="mermaid" aria-hidden="true"></div>`;

/** A `replaceChild` MutationRecord, shaped the way the observer receives one. */
function swap(dom, latticeSel, incomingHtml) {
  const doc = dom.window.document;
  const lattice = doc.querySelector(latticeSel);
  const old = lattice.firstElementChild;
  const holder = doc.createElement('div');
  holder.innerHTML = incomingHtml;
  const fresh = holder.firstElementChild;
  lattice.replaceChild(fresh, old);
  return [{ addedNodes: [fresh], removedNodes: [old] }];
}

const deck = (sectionHtml) => `<div class="lattice">${sectionHtml}</div>`;

describe('adoptOutgoingDiagrams', () => {
  test('holds the outgoing SVG in the fence that replaced it, and keeps it pending', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n A-->Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const adopt = liftAdoption(dom);
    adopt(swap(dom, '.lattice', incoming));

    const doc = dom.window.document;
    assert.equal(doc.querySelector('.mermaid > svg')?.id, 'old-svg', 'the previous diagram must still be on screen');
    assert.equal(
      doc.querySelector('pre').dataset.mermaidState,
      'pending',
      'the fence must stay pending — the held SVG is a placeholder, not an answer',
    );
  });

  test('refuses when the slide gained a diagram — position is the only identity it has', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n C-->D')}${pending('flowchart LR\n A-->B')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom)(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null, 'a shifted slot must not inherit another diagram’s ink');
  });

  test('refuses when the slide’s scope changed — the held ink would be the wrong band', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram dark">${pending('flowchart LR\n A-->Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom)(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null, 'a palette change must fall back to a render');
  });

  test('never overwrites a fence the cache already settled', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'cache-svg')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom)(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg')?.id, 'cache-svg', 'the cached SVG for THIS source wins');
  });

  test('holds only the fences that have ink to hold, keeping the rest aligned', () => {
    const outgoing =
      `<section class="diagram">${rendered('flowchart LR\n A-->B', 'first')}${pending('flowchart LR\n C-->D')}</section>`;
    const incoming =
      `<section class="diagram">${pending('flowchart LR\n A-->Bx')}${pending('flowchart LR\n C-->D')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom)(swap(dom, '.lattice', incoming));
    const svgs = [...dom.window.document.querySelectorAll('.mermaid')].map((d) => d.querySelector('svg')?.id ?? null);
    assert.deepEqual(svgs, ['first', null], 'the un-rendered second fence must not pull the first one’s ink into its slot');
  });

  test('does nothing in a document with no Mermaid — a held SVG nothing replaces is a stale diagram', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n A-->Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const adopt = liftAdoption(dom, { mermaid: { render: 'not a function' } });
    adopt(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null);
  });
});
