/**
 * Unit: WHAT GIVING UP ON MERMAID DOES TO A FENCE (#2092).
 *
 * WHY THIS FILE EXISTS, AND IT IS A COVERAGE ARGUMENT RATHER THAN A LOGIC ONE. The real
 * surfaces are driven elsewhere — `test/integration/mermaid/mermaid-unavailable.test.js`
 * (shipped runtime + shipped stylesheet in real Chromium) and
 * `docs/e2e/mermaid-unavailable-export.spec.ts` (the Studio's two downloaded artifacts).
 * Both of those tiers are NIGHTLY: `test:integration:mermaid` is in the nightly slice and
 * the Studio e2e suite is off the PR gate entirely. So a regression to this logic would
 * merge green and be found the next morning, on a change whose whole subject is a defect
 * that survived because nothing looked.
 *
 * This is the per-PR half. It cannot see CSS, a browser, or an export — what it pins is the
 * STATE MACHINE those three depend on: which fences a give-up hands back, which it must not
 * touch, and that a late Mermaid gets them back.
 *
 * THE SHIPPED BLOCK IS LIFTED AND EVALUATED, not re-implemented — the same idiom
 * `diagram-queue.test.js` uses on the render queue, and for the same reason: a re-implementation
 * asserts the test's copy of the logic, which is exactly the mistake that makes a green gate
 * worthless. It runs against a real jsdom document, so the selectors are matched by a real
 * CSS engine rather than by a stub that encodes my own reading of them.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { JSDOM } = require('jsdom');

const REPO = path.join(__dirname, '..', '..', '..');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');

/**
 * Lift the fence-state block out of the shipped runtime.
 *
 * It spans the three fence SELECTORS through `reclaimReleasedFences`, and closes over
 * nothing but `document` — which is what makes it liftable at all.
 */
function liftFenceState(document) {
  const BEGIN = '  // A fence the runtime has not touched yet.';
  const END = '  /**\n   * The (scope, source) pair a pending fence resolves to';
  const start = RUNTIME_SRC.indexOf(BEGIN);
  const end = RUNTIME_SRC.indexOf(END);
  assert.notEqual(start, -1, 'lib/runtime/index.js must still open its fence selectors with that comment');
  assert.notEqual(end, -1, 'could not find the end of the fence-state block');
  const block = RUNTIME_SRC.slice(start, end);
  assert.match(block, /function releaseUnrenderableFences/, 'the lifted block must carry the release');
  assert.match(block, /function reclaimReleasedFences/, 'the lifted block must carry the reclaim');
  // `new Function`, not `eval`: the lifted block gets its own scope with `document` as its
  // only free variable, so it cannot reach this file's locals. Lifting IS the point — see the
  // docblock; a re-implementation would assert the test's own copy of the logic.
  return new Function('document', `${block}\nreturn { releaseUnrenderableFences, reclaimReleasedFences, PENDING_FENCE_SELECTOR, RELEASED_FENCE_SELECTOR };`)(document);
}

/** A slide carrying one `<pre>` per state, each with the sibling `.mermaid` box wrapFences adds. */
function deck(states) {
  const body = states.map((s, i) =>
    `<pre${s ? ` data-mermaid-state="${s}"` : ''} id="p${i}"><code class="language-mermaid-source">flowchart LR</code></pre>`
    + '<div class="mermaid" aria-hidden="true"></div>').join('');
  const { window } = new JSDOM(`<!doctype html><html><body><section>${body}</section></body></html>`);
  return window.document;
}

const stateOf = (doc) => [...doc.querySelectorAll('pre')].map((p) => p.getAttribute('data-mermaid-state'));

describe('giving up on Mermaid hands the fence back to its author', () => {
  test('releases every pending fence, and reports how many', () => {
    const doc = deck(['pending', 'pending']);
    const { releaseUnrenderableFences } = liftFenceState(doc);
    assert.equal(releaseUnrenderableFences(), 2, 'the count is what the give-up log reports');
    assert.deepEqual(stateOf(doc), ['unavailable', 'unavailable']);
  });

  test('touches NOTHING else — not a drawn diagram, not an in-flight render, not an untagged fence', () => {
    // The states that must survive are the whole safety argument. `rendered` is a diagram
    // already on the slide; `error` is a diagram Mermaid rejected and is ALREADY showing its
    // source; `rendering` means a render is in flight, so Mermaid is real and this code path
    // cannot even be reached; an untagged fence is one the runtime has not claimed.
    const doc = deck(['rendered', 'error', 'rendering', null, 'pending']);
    const { releaseUnrenderableFences } = liftFenceState(doc);
    assert.equal(releaseUnrenderableFences(), 1);
    assert.deepEqual(stateOf(doc), ['rendered', 'error', 'rendering', null, 'unavailable']);
  });

  test('is idempotent — a second give-up releases nothing', () => {
    const doc = deck(['pending']);
    const { releaseUnrenderableFences } = liftFenceState(doc);
    assert.equal(releaseUnrenderableFences(), 1);
    assert.equal(releaseUnrenderableFences(), 0, 'a released fence is not pending, so it cannot be released twice');
  });

  test('the release and the reclaim are not each other\'s inverse by accident', () => {
    // Release is unconditional; reclaim is gated. Pinning the asymmetry means a later
    // simplification that makes reclaim unconditional again has to argue with this cell.
    const doc = deck(['pending']);
    const { releaseUnrenderableFences, reclaimReleasedFences } = liftFenceState(doc);
    releaseUnrenderableFences();
    reclaimReleasedFences(() => false);
    assert.deepEqual(stateOf(doc), ['unavailable'], 'a refused reclaim changes nothing');
  });

  test('leaves the sibling .mermaid box in place, because the reclaim needs it', () => {
    // `fenceJob` requires `preEl.nextElementSibling` to be the `.mermaid` target. Removing
    // the empty box on give-up would look tidier and would make a late Mermaid unrenderable;
    // CSS collapses it instead.
    const doc = deck(['pending']);
    liftFenceState(doc).releaseUnrenderableFences();
    const sibling = doc.querySelector('pre').nextElementSibling;
    assert.ok(sibling?.classList.contains('mermaid'), 'the SVG target must survive the give-up');
  });

  test('a Mermaid that turns up late gets the released fences back', () => {
    const doc = deck(['unavailable', 'rendered', 'unavailable']);
    const { reclaimReleasedFences } = liftFenceState(doc);
    reclaimReleasedFences(() => true);
    assert.deepEqual(stateOf(doc), ['pending', 'rendered', 'pending'],
      'released fences requeue; a drawn one is not re-rendered');
  });

  test('reclaims ONLY what the caller says it can render', () => {
    // RECLAIMING IS HIDING: `pending` is the state the stylesheet hides on, so taking a
    // fence back on a pass that then declines to render it leaves the author a blank where
    // their source was — the pre-#2092 outcome, produced by the fix. An independent checker
    // drove exactly that: the reclaim used to run BEFORE `initAndRun`'s `themeSettled`
    // guard, and on a host whose theme vars never resolve (marp-vscode's webview, by that
    // guard's own docblock) every pass hid the fence and then returned. The `force` that
    // would break the deadlock only ever comes from `tick`, which has already given up.
    //
    // The second instance is this one: `fenceJob` returns null when the `.mermaid` target
    // is not where it expects, and the walk `continue`s past it — stranding a fence it just
    // hid. So the caller's own renderability test gates the reclaim.
    const doc = deck(['unavailable', 'unavailable']);
    const { reclaimReleasedFences } = liftFenceState(doc);
    const pres = [...doc.querySelectorAll('pre')];
    reclaimReleasedFences((el) => el === pres[0]);
    assert.deepEqual(stateOf(doc), ['pending', 'unavailable'],
      'the fence the caller cannot render keeps showing its source');
  });

  test('the released state is not one the pending selector re-selects', () => {
    // If it were, `initAndRun` would walk a released fence on a document that still has no
    // Mermaid, and the reclaim would be unreachable dead code rather than the recovery path.
    const doc = deck(['unavailable']);
    const { PENDING_FENCE_SELECTOR, RELEASED_FENCE_SELECTOR } = liftFenceState(doc);
    assert.equal(doc.querySelectorAll(PENDING_FENCE_SELECTOR).length, 0);
    assert.equal(doc.querySelectorAll(RELEASED_FENCE_SELECTOR).length, 1);
  });

  test('both selectors cover marp-pre, which is what the VS Code preview emits', () => {
    const { window } = new JSDOM('<!doctype html><html><body>'
      + '<marp-pre data-mermaid-state="pending"><code class="language-mermaid-source">x</code></marp-pre><div class="mermaid"></div>'
      + '</body></html>');
    const doc = window.document;
    const { releaseUnrenderableFences } = liftFenceState(doc);
    assert.equal(releaseUnrenderableFences(), 1, 'a marp-pre fence is a fence');
    assert.equal(doc.querySelector('marp-pre').getAttribute('data-mermaid-state'), 'unavailable');
  });
});
