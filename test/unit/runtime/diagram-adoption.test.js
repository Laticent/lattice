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
    `${src}\nreturn { adoptOutgoingDiagrams };`,
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

// The host stamps `.lattice` before every patch; `in-place` is what licenses a hold.
// `swap` overrides it for the arms that check the gate itself.
const deck = (sectionHtml, swap = 'in-place') => `<div class="lattice" data-lattice-swap="${swap}">${sectionHtml}</div>`;

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

  test('refuses a swap the host did not call in-place — the navigation case', () => {
    // THE DEFECT THIS PINS. Both preview hosts replace slide DOM in ONE mutation, so
    // clicking from one diagram slide to another arrives in exactly the shape an edit does:
    // same node count, same fence count, same scope key. Every structural guard passes, and
    // without the host's word the author saw the PREVIOUS slide's diagram in the new slide's
    // box until the render landed.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n  A[Input] --> B[Process]', 'slide-2-ink')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n  P[Plan] --> Q[Build]')}</section>`;
    const dom = new JSDOM(deck(outgoing, 'reflow'));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(
      dom.window.document.querySelector('.mermaid > svg'),
      null,
      'a slide the host did not call in-place must not inherit the previous slide’s ink',
    );
  });

  test('refuses when the host said nothing at all', () => {
    // marp-vscode, or any embedder that has not been taught the contract. No stamp, no hold:
    // the pre-2026-09-06 behavior, an empty slot for the length of a render.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n  A --> B', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n  A --> Bx')}</section>`;
    const dom = new JSDOM(`<div class="lattice">${outgoing}</div>`);
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null);
  });

  test('HOLDS a wholesale replacement on the SAME slide — the author is watching that slide', () => {
    // A text-similarity guard refused this, and refusing it was wrong: the author is on the
    // slide, the old drawing was there a moment ago, and the render replaces it. What made
    // that guard untenable is the other direction — two DIFFERENT diagrams sharing a header
    // score above any workable threshold (all twelve ordered pairs of
    // examples/mermaid-init-merge.md score 0.68–0.82).
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n  A[Input] --> B[Process]', 'old-svg')}</section>`;
    const incoming = `<section class="diagram">${pending('pie title Share\n  "a" : 40\n  "b" : 60')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg')?.id, 'old-svg');
  });

  test('CHAINS a held placeholder forward, so the hold survives a typing burst', () => {
    // The inverse of what this arm used to assert, and the reason is the whole of #2113's
    // fourth pass. A `pending` fence whose slot holds an SVG is one a previous adoption
    // filled — during a burst that is EVERY keystroke after the first, so refusing it made
    // the hold cover one character and blank the other 87% of the burst. Refusing it was
    // needed when the gate could not tell an edit from a navigation; the `in-place` stamp
    // now can, so what chains here is this fence's own last ink, on this slide.
    const outgoing =
      `<section class="diagram">` +
      `<pre data-mermaid-state="pending"><code class="language-mermaid-source">flowchart LR\n  A --> B</code></pre>` +
      `<div class="mermaid" aria-hidden="true"><svg id="held-earlier"></svg></div></section>`;
    const incoming = `<section class="diagram">${pending('flowchart LR\n  A --> Bx')}</section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('.mermaid > svg')?.id, 'held-earlier');
  });

  test('holds through five consecutive keystrokes, not just the first', () => {
    // The burst, end to end. Before the donor rule was re-derived this went
    // held → blank → blank → blank → blank, which is what an author actually saw.
    const dom = new JSDOM(deck(`<section class="diagram">${rendered('flowchart LR\n  A --> B', 'ink-0')}</section>`));
    const { adoptOutgoingDiagrams } = liftAdoption(dom);
    const seen = [];
    for (let k = 1; k <= 5; k++) {
      const incoming = `<section class="diagram">${pending(`flowchart LR\n  A --> B${'x'.repeat(k)}`)}</section>`;
      // Every keystroke re-stamps: the host sets the attribute before each write, and the
      // observer now clears it after reading, so the chain is five separate declarations.
      dom.window.document.querySelector('.lattice').setAttribute('data-lattice-swap', 'in-place');
      adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
      seen.push(dom.window.document.querySelector('.mermaid > svg')?.id ?? null);
    }
    assert.deepEqual(seen, ['ink-0', 'ink-0', 'ink-0', 'ink-0', 'ink-0']);
  });

  test('reads the stamp once and clears it, so a later unstamped burst cannot hold', () => {
    const dom = new JSDOM(deck(`<section class="diagram">${rendered('flowchart LR\n  A --> B', 'ink-0')}</section>`));
    const { adoptOutgoingDiagrams } = liftAdoption(dom);
    const doc = dom.window.document;
    adoptOutgoingDiagrams(swap(dom, '.lattice', `<section class="diagram">${pending('flowchart LR\n  A --> Bx')}</section>`));
    assert.equal(doc.querySelector('.lattice').hasAttribute('data-lattice-swap'), false, 'the stamp must not outlive the burst it described');
    // A second burst nobody stamped: the ink from the first must not travel again.
    adoptOutgoingDiagrams(swap(dom, '.lattice', `<section class="diagram">${pending('flowchart LR\n  A --> By')}</section>`));
    assert.equal(doc.querySelector('.mermaid > svg'), null);
  });

  test('refuses when the next element sibling is not the SVG target', () => {
    // The `.mermaid` half of that guard, which the "already holds an SVG" half used to mask:
    // here the sibling is a different element entirely, and its emptiness is not the point.
    const outgoing = `<section class="diagram">${rendered('flowchart LR\n  A --> B', 'old-svg')}</section>`;
    const incoming =
      `<section class="diagram">` +
      `<pre data-mermaid-state="pending"><code class="language-mermaid-source">flowchart LR\n  A --> Bx</code></pre>` +
      `<div class="mermaid-error" role="status"></div></section>`;
    const dom = new JSDOM(deck(outgoing));
    liftAdoption(dom).adoptOutgoingDiagrams(swap(dom, '.lattice', incoming));
    assert.equal(dom.window.document.querySelector('svg'), null, 'nothing may be written beside a non-target sibling');
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

  test('the burst schedules one plain-debounce run — no second, shorter delay', () => {
    // The cut mechanism (COLD_MS / burstFirstSight) had no test at all, so deleting it or
    // pinning it at 150 left 9134 tests green. These two arms are the pin: the call takes
    // no delay argument, and nothing reintroduces a second timer constant.
    assert.match(observerCallbackSrc() || '', /scheduleRun\(\);/, 'the observer must schedule a plain debounced run');
    assert.doesNotMatch(RUNTIME_SRC, /COLD_MS|burstFirstSight|scheduledRunDelay/, 'the second-delay policy is cut; re-adding one needs its own tests and a measurement');
  });

  test('scheduleRun coalesces on COMPLETION, not on a clock', () => {
    // The fixed 150ms timer is gone: it was larger than a full render for every diagram up
    // to ~64 nodes, and a timer larger than the work it defers is waiting, not coalescing.
    const src = RUNTIME_SRC.slice(RUNTIME_SRC.indexOf('function scheduleRun('), RUNTIME_SRC.indexOf('function wrapFences('));
    assert.match(src, /clearTimeout\(scheduledRunHandle\)/, 'a re-arm must cancel the pending run');
    // THE FLOOR IS SIZED, not fixed — `contentFloorMs()` answers COALESCE_MS for a diagram
    // that is cheap to draw and the old DEBOUNCE_MS for one that is not. It is the ONLY timer
    // in the dispatch path: a second one, carried by the back-off, could not be made to sum
    // with this one in either direction (see the policy port's own note).
    assert.match(src, /\}, contentFloorMs\(anyPendingFenceIsLiveWorthy\(\)\)\);/, 'the floor is sized to the diagram AND asks whether anything can be kept live');
  });

  test('the CONTENT pass is never gated on a diagram — only the dispatch is', () => {
    // The first version of the coalescing early-returned from `scheduleRun` while a render
    // was in flight. That callback also runs every content transform and every
    // contentSettledListener, so a `mermaid.render` that STALLED rather than rejected froze
    // the Form composition, the masthead, the charts and the fit berth for the whole 20s
    // settle cap — and an uncapped parse froze them indefinitely. Coalescing belongs at the
    // dispatch point, after the transforms have run.
    const sched = RUNTIME_SRC.slice(RUNTIME_SRC.indexOf('function scheduleRun('), RUNTIME_SRC.indexOf('function wrapFences('));
    assert.doesNotMatch(sched, /diagramRuns/, 'the content pass must not wait on a diagram render');
    const init = RUNTIME_SRC.slice(RUNTIME_SRC.indexOf('function initAndRun('), RUNTIME_SRC.indexOf('function initAndRun(') + 2000);
    const transformsAt = init.indexOf('runAllContentTransforms()');
    const gateAt = init.indexOf('if (diagramRuns > 0)');
    assert.ok(transformsAt !== -1 && gateAt !== -1, 'initAndRun must run the transforms and then gate the dispatch');
    assert.ok(transformsAt < gateAt, 'the transforms must run BEFORE the dispatch gate, not behind it');
    // UNCONDITIONALLY, which is worth pinning because it briefly was not. A second entry point
    // (the deleted back-off timer's re-entry) made this call conditional to skip a duplicate
    // pass; with one entry point there is nothing to skip, and any condition reappearing here
    // is the frozen-transforms defect above coming back.
    assert.match(init, /\n {4}runAllContentTransforms\(\);/, 'the content pass is not conditional');
    assert.match(init.slice(gateAt), /rerunRequested = true/, 'and record that the source moved while a run was in flight');
  });
});

/**
 * A CACHE HIT MUST CONSUME THE QUIET TIMER'S RELEASE, and nothing gated that until now.
 *
 * `armErrorSurface` marks a released fence for a forced, un-gated render so the author finally
 * gets their error box. `settleFenceFromCache` serves that same fence from the SVG cache
 * instead and never reaches `renderDiagramJob`, so the marker outlives its errand on that
 * node — and a cache hit also proves the force is moot, because this source has rendered
 * before. Leave the marker behind and the next unparseable text on that fence bypasses the
 * gate once: a doomed render plus an error box flashing mid-word, which is the exact strobe
 * the gate exists to stop.
 *
 * An independent pass deleted that one line and the whole 274-cell suite stayed green.
 */
describe('a cache hit consumes the force marker', () => {
  const liftSettle = (forceRender, cachedSvg) => {
    const m = RUNTIME_SRC.match(/ {2}function settleFenceFromCache\(job\) \{[\s\S]*?\n {2}\}/);
    assert.ok(m, 'lib/runtime/index.js must declare settleFenceFromCache');
    // eslint-disable-next-line no-new-func
    return new Function(
      'mermaidSvgCache', 'diagramCacheKey', 'diagramScopeKey', 'markFenceDrawn', 'forceRender', 'fenceSourceOf',
      `${m[0]}\nreturn settleFenceFromCache;`,
    )(
      { get: () => cachedSvg },
      (a, b) => `${a}|${b}`,
      () => 'scope',
      () => {},
      forceRender,
      (preEl) => preEl.__src,
    );
  };
  const job = (src) => ({
    preEl: { dataset: {}, __src: src },
    target: { innerHTML: '' },
    sectionEl: {},
    source: src,
  });

  test('the release is cleared when the SVG comes from cache', () => {
    const forceRender = new Set(['flowchart LR']);
    const settle = liftSettle(forceRender, '<svg/>');
    const j = job('flowchart LR');
    assert.equal(settle(j), true, 'a cache hit settles the fence');
    assert.equal(j.preEl.dataset.mermaidState, 'rendered');
    assert.equal(forceRender.has('flowchart LR'), false, 'and consumes the release it made moot');
  });

  test('a cache MISS leaves the release alone — it still has an errand', () => {
    const forceRender = new Set(['flowchart LR']);
    const settle = liftSettle(forceRender, undefined);
    assert.equal(settle(job('flowchart LR')), false, 'a miss is a re-render, not a near-enough SVG');
    assert.equal(forceRender.has('flowchart LR'), true);
  });
});

function liftReset(reclaimedHas = false) {
  const m = RUNTIME_SRC.match(/ {2}function resetFenceAfterFailure\(preEl\) \{[\s\S]*?\n {2}\}/);
  assert.ok(m, 'lib/runtime/index.js must declare resetFenceAfterFailure');
  assert.match(m[0], /innerHTML = ''/, 'the reset must clear the slot on its way back');
  // eslint-disable-next-line no-new-func
  return new Function('reclaimed', `${m[0]}\nreturn resetFenceAfterFailure;`)({ has: () => reclaimedHas });
}

describe('resetFenceAfterFailure', () => {
  const inFlight = (svgId) =>
    `<section class="diagram">` +
    `<pre data-mermaid-state="rendering"><code class="language-mermaid-source">flowchart LR\n  A --> B</code></pre>` +
    `<div class="mermaid" aria-hidden="true">${svgId ? `<svg id="${svgId}"></svg>` : ''}</div></section>`;

  test('drops HELD ink on the way back to pending', () => {
    // The two throw paths that land here — a mid-walk throw, and a `mermaid.initialize` that
    // throws inside a run — never pass through `attachError`, which is the only other thing
    // that clears. Left in place, an intermittently-throwing Mermaid retries forever while the
    // slide keeps displaying a diagram built from source the author already changed, because
    // `mermaid.css` shows `.mermaid` for `pending` on a `section.diagram`.
    const dom = new JSDOM(`<div class="lattice">${inFlight('held')}</div>`);
    const preEl = dom.window.document.querySelector('pre');
    liftReset()(preEl);
    assert.equal(preEl.dataset.mermaidState, 'pending');
    assert.equal(dom.window.document.querySelector('.mermaid > svg'), null, 'the held SVG must not survive the reset');
  });

  test('is a no-op for a fence that never held anything', () => {
    const dom = new JSDOM(`<div class="lattice">${inFlight(null)}</div>`);
    const preEl = dom.window.document.querySelector('pre');
    liftReset()(preEl);
    assert.equal(preEl.dataset.mermaidState, 'pending');
    assert.equal(dom.window.document.querySelector('.mermaid').innerHTML, '');
  });

  test('returns a RECLAIMED fence to unavailable, not pending — #2108 semantics intact', () => {
    // A reclaim took this fence from the author; a failed pass must give it back, or they get
    // a blank where they had their source.
    const dom = new JSDOM(`<div class="lattice">${inFlight('held')}</div>`);
    const preEl = dom.window.document.querySelector('pre');
    liftReset(true)(preEl);
    assert.equal(preEl.dataset.mermaidState, 'unavailable');
  });

  test('leaves a fence that is not `rendering` alone', () => {
    const dom = new JSDOM(`<div class="lattice">${rendered('flowchart LR\n  A --> B', 'done')}</div>`);
    const preEl = dom.window.document.querySelector('pre');
    liftReset()(preEl);
    assert.equal(preEl.dataset.mermaidState, 'rendered');
    assert.equal(dom.window.document.querySelector('.mermaid > svg')?.id, 'done', 'a rendered diagram is never cleared');
  });
});
