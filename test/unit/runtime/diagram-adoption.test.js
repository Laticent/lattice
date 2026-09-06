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
  assert.match(src, /function burstFirstSight\(records\)/, 'the port must hold burstFirstSight');
  // eslint-disable-next-line no-new-func
  const make = new Function(
    'document',
    'globalScope',
    'diagramScopeKey',
    'FENCE_CODE_SELECTOR',
    `${src}\nreturn { adoptOutgoingDiagrams, burstFirstSight };`,
  );
  return make(dom.window.document, { mermaid }, diagramScopeKey, shippedFenceSelector());
}

/**
 * THE WIRING, which lifting the function cannot see.
 *
 * `liftAdoption` proves what `adoptOutgoingDiagrams` DOES; deleting its call site leaves
 * every behavioral test above green, because the observer is not in the lifted region.
 * These are source-text assertions and they are worth exactly that much — they cannot tell
 * a call from a call that runs — but they do fail on the two edits most likely to happen by
 * accident: dropping a call, and reordering them.
 */
function observerCallbackSrc() {
  const at = RUNTIME_SRC.indexOf('replayCachedFences();\n        adoptOutgoingDiagrams(records);');
  return at === -1 ? null : RUNTIME_SRC.slice(at, at + 400);
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
    const { adoptOutgoingDiagrams } = liftAdoption(dom);
    adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));

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
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null, 'a shifted slot must not inherit another diagram’s ink');
  });

  test('refuses when the slide’s scope changed — the held ink would be the wrong band', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram dark">${pending('flowchart LR\n A-->Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null, 'a palette change must fall back to a render');
  });

  test('leaves a target that already holds an SVG alone, even beside an un-settled fence', () => {
    // The `pending` check does NOT cover this, and the two guards masked each other while
    // one test asserted both at once. A host that replaces the <pre> and leaves the
    // `.mermaid` sibling standing (the shape `wrapFences`' reuse path exists for) presents
    // exactly this: a live SVG beside a fence nothing has settled.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming =
      `<section class="diagram">` +
      `<pre data-mermaid-state="pending"><code class="language-mermaid-source">flowchart LR\n A-->Bx</code></pre>` +
      `<div class="mermaid" aria-hidden="true"><svg id="standing"></svg></div></section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    const inSlot = [...dom.window.document.querySelectorAll('.mermaid > svg')].map((n) => n.id);
    assert.deepEqual(inSlot, ['standing'], 'the SVG already in the slot wins, and nothing is stacked behind it');
  });

  test('does not adopt into a fence that is not pending, even when its slot is empty', () => {
    // `rendering` means the fence is already on the queue. The target-holds-an-SVG guard
    // cannot see this one — the slot is empty — so it is the `pending` check or nothing.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming =
      `<section class="diagram">` +
      `<pre data-mermaid-state="rendering"><code class="language-mermaid-source">flowchart LR\n A-->Bx</code></pre>` +
      `<div class="mermaid" aria-hidden="true"></div></section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null);
  });

  test('refuses a shrinking filmstrip — a deleted slide shifts every later one by a slot', () => {
    // Two diagram slides out, one in: `addedNodes[0]` is the slide that was SECOND, so
    // pairing it against `removedNodes[0]` would hand it the first slide's ink.
    const outgoing =
      `<section class="diagram">${rendered('flowchart LR\n A-->A2', 'ink-a')}</section>` +
      `<section class="diagram">${rendered('flowchart LR\n B-->B2', 'ink-b')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const doc = dom.window.document;
    const lattice = doc.querySelector('.lattice');
    const removed = [...lattice.children];
    const holder = doc.createElement('div');
    holder.innerHTML = `<section class="diagram">${pending('flowchart LR\n B-->B3')}</section>`;
    const added = [...holder.children];
    lattice.replaceChildren(...added);
    liftAdoption(dom).adoptOutgoingDiagrams([{ addedNodes: added, removedNodes: removed }]);
    assert.equal(doc.querySelector('.mermaid > svg'), null, 'a reshaped filmstrip must not pair by position');
  });

  test('refuses a record whose added and removed node counts differ', () => {
    // `patchSections` has a second branch — `lattice.innerHTML = next.join()` when a slide
    // is added or removed — whose ONE record spans the whole deck. Pairing flat across it
    // would let a fence inherit ink from a different slide whenever the fence counts
    // happened to agree.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const doc = dom.window.document;
    const lattice = doc.querySelector('.lattice');
    const old = lattice.firstElementChild;
    const holder = doc.createElement('div');
    holder.innerHTML =
      `<section><h2>new</h2></section><section class="diagram">${pending('flowchart LR\n A-->Bx')}</section>`;
    const added = [...holder.children];
    lattice.replaceChildren(...added);
    liftAdoption(dom).adoptOutgoingDiagrams([{ addedNodes: added, removedNodes: [old] }]);
    assert.equal(doc.querySelector('.mermaid > svg'), null, 'a reshaped filmstrip must not pair by position');
  });

  test('never overwrites a fence the cache already settled', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'cache-svg')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg')?.id, 'cache-svg', 'the cached SVG for THIS source wins');
  });

  test('holds only the fences that have ink to hold, keeping the rest aligned', () => {
    const outgoing =
      `<section class="diagram">${rendered('flowchart LR\n A-->B', 'first')}${pending('flowchart LR\n C-->D')}</section>`;
    const incoming =
      `<section class="diagram">${pending('flowchart LR\n A-->Bx')}${pending('flowchart LR\n C-->D')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    const svgs = [...dom.window.document.querySelectorAll('.mermaid')].map((d) => d.querySelector('svg')?.id ?? null);
    assert.deepEqual(svgs, ['first', null], 'the un-rendered second fence must not pull the first one’s ink into its slot');
  });

  test('does nothing in a document with no Mermaid — a held SVG nothing replaces is a stale diagram', () => {
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n A-->Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const { adoptOutgoingDiagrams } = liftAdoption(dom, { mermaid: { render: 'not a function' } });
    adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null);
  });
});

describe('the observer wiring', () => {
  test('replays the cache FIRST, then adopts — the cache has the right SVG for this source', () => {
    assert.ok(
      observerCallbackSrc(),
      'the mutation observer must call replayCachedFences() and then adoptOutgoingDiagrams(records), in that order',
    );
  });

  test('the run delay is chosen by burstFirstSight, not by a document-wide empty-slot probe', () => {
    assert.match(
      RUNTIME_SRC,
      /scheduleRun\(\{ delay: burstFirstSight\(records\) \? COLD_MS : DEBOUNCE_MS \}\)/,
      'keying the delay on emptiness alone drops the debounce for an author mid-edit of a diagram that does not parse',
    );
  });
});

describe('burstFirstSight', () => {
  test('true for a diagram that arrived where the outgoing slide had none', () => {
    const outgoing = '<section><h2>prose</h2></section>';
    const incoming = `<section class="diagram">${pending('flowchart LR\n A-->B')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const { burstFirstSight } = liftAdoption(dom);
    assert.equal(burstFirstSight(swap(dom, '.lattice', incoming)), true);
  });

  test('FALSE when the outgoing slide carried a fence — an author mid-edit sees an empty slot too', () => {
    // `attachError` clears the target, so a diagram whose in-progress source does not parse
    // is `pending` + empty exactly like a cold one. Keying the delay on emptiness alone
    // therefore removed the debounce from the one case it exists for: measured at 8
    // `mermaid.render` calls for 8 keystrokes, on a strictly serial queue.
    const outgoing = `<section class="diagram">${pending('flowchart LR\n A--')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n A--x')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const { burstFirstSight } = liftAdoption(dom);
    assert.equal(burstFirstSight(swap(dom, '.lattice', incoming)), false);
  });

  test('false for a pending fence whose slot is already filled', () => {
    // Defensive: the shipped paths do not produce "pending, filled, and nothing outgoing"
    // today — a filled pending slot is what adoption leaves behind, and adoption needs an
    // outgoing fence. Asserted directly because the guard's whole job is that a slot with
    // something in it keeps the debounce, however it came to be filled.
    const outgoing = '<section><h2>prose</h2></section>';
    const incoming =
      `<section class="diagram">` +
      `<pre data-mermaid-state="pending"><code class="language-mermaid-source">flowchart LR\n A-->B</code></pre>` +
      `<div class="mermaid" aria-hidden="true"><svg id="held"></svg></div></section>`;
    const dom = new JSDOM(deck(outgoing));
    assert.equal(liftAdoption(dom).burstFirstSight(swap(dom, '.lattice', incoming)), false);
  });

  test('false once the slot has been filled — by the cache or by a held diagram', () => {
    const outgoing = '<section><h2>prose</h2></section>';
    const incoming = `<section class="diagram">${rendered('flowchart LR\n A-->B', 'svg-1')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    const { burstFirstSight } = liftAdoption(dom);
    assert.equal(burstFirstSight(swap(dom, '.lattice', incoming)), false);
  });
});
