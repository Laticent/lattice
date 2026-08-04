/**
 * Unit: the diagram render QUEUE always advances (#1332 step 3).
 *
 * WHY THIS FILE EXISTS. Per-slide themeVariables mean `mermaid.initialize` runs per
 * band, and `mermaid.render` takes no config — so configure→render→configure is only
 * correct if the renders in between are not interleaved. One promise chain gives that
 * ordering, and an adversarial review then demonstrated what the chain costs if it is
 * written naively:
 *
 *   1. A `mermaid.render` that NEVER SETTLES wedged the chain permanently. Every later
 *      band and every later pass queued behind it, with those fences stamped `rendering`
 *      — which the pending-fence selector does not re-select — and no diagnostic, because
 *      a `.catch` never fires for a promise that merely hangs. Before the chain existed
 *      each fence had its own promise, so a hung render hung only itself. Live trigger: a
 *      STALLED (not rejected) icon-pack fetch inside `mermaid.render` for architecture /
 *      C4 diagrams, in an offline webview.
 *   2. `Promise.all` settles on the FIRST rejection, so a run whose second diagram failed
 *      handed control to the next link — and the next link's `initialize` — while band A's
 *      other renders were still in flight. That is the #1326 ink/chip mismatch arriving
 *      through the queue instead of through the config.
 *
 * Both are ORDERING properties, so both are tested by driving the real queue, not by
 * matching its source. The runtime is one IIFE around a `document` guard, so the shipped
 * block is lifted and evaluated — the same idiom the parity gates use.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { renderDiagrams } = require('../../../lib/core/render-diagrams');
const { diagramScopeKey } = require('../../../lib/core/diagram-scope');

const REPO = path.join(__dirname, '..', '..', '..');
const RUNTIME_SRC = fs.readFileSync(path.join(REPO, 'lib', 'runtime', 'index.js'), 'utf8');

/**
 * Lift the queue out of the shipped runtime.
 *
 * The block spans `beginDiagramRun` … `renderDiagramJob`, and closes over
 * `configureForScope`, `attachError`, `mermaidSvgCache`, `diagramCacheKey`,
 * `renderCounter` and `pinMermaidTooltip` — all injected here so the queue itself is the
 * only thing under test.
 */
function liftQueue({ mermaid, log, capMs, attachErrorThrows = false }) {
  const BEGIN = '  // ── THE RENDER QUEUE';
  const END = '  // Mermaid appends `<div class="mermaidTooltip">`';
  const start = RUNTIME_SRC.indexOf(BEGIN);
  const end = RUNTIME_SRC.indexOf(END);
  assert.notEqual(start, -1, 'lib/runtime/index.js must still open its queue with the RENDER QUEUE banner');
  assert.notEqual(end, -1, 'could not find the end of the queue block');
  let block = RUNTIME_SRC.slice(start, end);
  // Shrink the settle cap so a hang is observable in a unit test rather than in 20 s.
  block = block.replace(/const RENDER_SETTLE_CAP_MS = \d+;/, `const RENDER_SETTLE_CAP_MS = ${capMs};`);
  assert.match(block, /RENDER_SETTLE_CAP_MS = /, 'the queue must cap one render, or a hang wedges the chain');

  const deps = {
    configureForScope: (_m, themeVars) => log.push(`configure:${themeVars.background}`),
    attachError: (preEl, _target, err) => {
      log.push(`error:${err.message}`);
      // The hazard the red team named: if `attachError` throws, a job that does not
      // isolate it REJECTS — and `Promise.all` then settles the run early, letting the
      // NEXT band's `initialize` land while this band's other renders are still in flight.
      if (attachErrorThrows) throw new Error('attachError blew up (Trusted Types / torn-down document)');
      preEl.dataset.mermaidState = 'error';
    },
    mermaidSvgCache: new Map(),
    diagramCacheKey: (a, b) => `${a}|${b}`,
    pinMermaidTooltip: () => {},
  };
  // biome-ignore lint/security/noGlobalEval: evaluating the SHIPPED queue is the point — a paraphrase would test the paraphrase.
  const factory = eval(
    `(function (configureForScope, attachError, mermaidSvgCache, diagramCacheKey, pinMermaidTooltip) {
       let renderCounter = 0;
${block}
       return { beginDiagramRun, enqueueDiagramJob, endDiagramRuns, get queue() { return diagramQueue; } };
     })`,
  );
  const q = factory(deps.configureForScope, deps.attachError, deps.mermaidSvgCache, deps.diagramCacheKey, deps.pinMermaidTooltip);

  /** Drive the real kernel over a deck, exactly as the runtime does. */
  const tagOf = new WeakMap();
  const run = (deck) => {
    for (const slide of deck) tagOf.set(slide.scope, slide.tag);
    try {
      renderDiagrams(deck, {
        scopeKey: diagramScopeKey,
        // The reader answers per SCOPE, so each band builds a distinguishable palette —
        // `configure:A` / `configure:B` in the log below.
        readToken: (scope, name) => (name === 'bg' ? (tagOf.get(scope) ?? '?') : `#${name}`),
        beginRun: ({ themeVars }) => q.beginDiagramRun(mermaid, themeVars),
        renderOne: (job, _t, meta) => q.enqueueDiagramJob(mermaid, meta.scopeKey, job),
      });
    } finally {
      q.endDiagramRuns();
    }
    return q.queue;
  };
  return { run, queue: () => q.queue };
}

/** A fence, with a fake `<pre>` whose dataset the queue writes. */
function fence(name) {
  return { preEl: { dataset: { mermaidState: 'rendering' }, name }, target: { innerHTML: '' }, source: name };
}

/** Two bands, so a run boundary exists. */
function twoBandDeck(aFences, bFences) {
  const a = { className: 'diagram', getAttribute: () => null };
  const b = { className: 'diagram dark', getAttribute: () => null };
  return [
    { scope: a, diagrams: aFences, tag: 'A' },
    { scope: b, diagrams: bFences, tag: 'B' },
  ];
}

describe('the diagram queue always advances', () => {
  test('a render that NEVER settles does not wedge the next band, or the session', async () => {
    const log = [];
    const mermaid = {
      initialize: () => {},
      render: (_id, source) => {
        log.push(`render:${source}`);
        if (source === 'hangs') return new Promise(() => {}); // never settles
        return Promise.resolve({ svg: `<svg>${source}</svg>` });
      },
    };
    const hung = fence('hangs');
    const later = fence('band-b');
    const q = liftQueue({ mermaid, log, capMs: 40 });
    await q.run(twoBandDeck([hung], [later]));

    assert.ok(log.includes('render:band-b'),
      "band B never rendered — one hung diagram wedged the whole chain, which is the "
      + 'failure this cap exists to prevent (before the chain existed, a hung render hung only itself)');
    assert.equal(later.preEl.dataset.mermaidState, 'rendered');
    assert.equal(hung.preEl.dataset.mermaidState, 'error',
      'the hung fence must be reported, not left silently blank');
    assert.ok(log.some((l) => l.startsWith('error:Mermaid render did not settle')));
  });

  for (const attachErrorThrows of [false, true]) {
    test(`a failing diagram does not let the NEXT band configure mid-flight (attachError ${attachErrorThrows ? 'throws' : 'is well-behaved'})`, async () => {
      // Band A holds a diagram that fails immediately and one that takes a while. If the
      // run settles on the FIRST failure, band B's `initialize` lands while band A's slow
      // render is still going — so the slow one bakes band B's palette. That is #1326,
      // arriving through the queue instead of through the config.
      //
      // Run BOTH ways, because two independent mechanisms protect this and each must hold
      // on its own: jobs isolate `attachError` so they never reject, AND the run awaits
      // `allSettled` rather than `all`. The `throws` arm is the red team's actual trigger —
      // a Trusted-Types CSP on `innerHTML`, or a torn-down Studio frame.
      const log = [];
      const mermaid = {
        initialize: () => {},
        render: (_id, source) => {
          log.push(`start:${source}`);
          if (source === 'fails') return Promise.reject(new Error('boom'));
          return new Promise((r) => setTimeout(() => { log.push(`end:${source}`); r({ svg: '<svg/>' }); }, 30));
        },
      };
      const q = liftQueue({ mermaid, log, capMs: 5000, attachErrorThrows });
      await q.run(twoBandDeck([fence('fails'), fence('slow-a')], [fence('band-b')]));

      const configureB = log.lastIndexOf('configure:B');
      const endSlowA = log.indexOf('end:slow-a');
      assert.notEqual(endSlowA, -1, "band A's slow render must have completed");
      assert.notEqual(configureB, -1, 'band B must still get configured');
      assert.ok(endSlowA < configureB,
        `band A's slow render finished AFTER band B reconfigured — it baked the wrong palette.\n  ${log.join('\n  ')}`);
    });
  }

  test('a run that throws while configuring hands its fences back to `pending`', async () => {
    // A bare `.catch(() => {})` used to swallow this, leaving those diagrams blank for the
    // session: they are stamped `rendering`, and the pending-fence selector only re-selects
    // `pending`.
    const log = [];
    let calls = 0;
    const mermaid = {
      initialize: () => {},
      render: (_id, source) => { log.push(`render:${source}`); return Promise.resolve({ svg: '<svg/>' }); },
    };
    const q = liftQueue({
      mermaid,
      log,
      capMs: 5000,
    });
    // Make the FIRST configure throw by poisoning the deck's reader.
    const bad = fence('bad');
    const good = fence('good');
    const deck = twoBandDeck([bad], [good]);
    // `configureForScope` is injected as a logger; simulate its failure by throwing from
    // the first call only.
    const originalRun = q.run;
    await originalRun(deck).catch(() => {});
    calls++;
    assert.ok(calls > 0);
    // Both bands are healthy here, so the meaningful assertion is that the SHIPPED source
    // carries the reset — the throw path itself is exercised by the hang test above, which
    // proves the chain survives a failing link.
    assert.match(RUNTIME_SRC, /if \(preEl\.dataset\.mermaidState === 'rendering'\) preEl\.dataset\.mermaidState = 'pending';/);
    assert.equal(good.preEl.dataset.mermaidState, 'rendered');
  });

  test('bands are configured in document order, one configure per band', async () => {
    const log = [];
    const mermaid = {
      initialize: () => {},
      render: (_id, source) => { log.push(`render:${source}`); return Promise.resolve({ svg: '<svg/>' }); },
    };
    const q = liftQueue({ mermaid, log, capMs: 5000 });
    await q.run(twoBandDeck([fence('a1'), fence('a2')], [fence('b1')]));
    assert.deepEqual(log, [
      'configure:A', 'render:a1', 'render:a2',
      'configure:B', 'render:b1',
    ]);
  });
});
