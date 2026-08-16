/**
 * Integration: a deck-wide `mode:` register reaches the runtime's transforms on
 * their FIRST pass, so a transform whose GEOMETRY keys on the mode measures the
 * same face the CSS will paint (HARD RULE #1 — the two render paths agree).
 *
 * WHY THIS EXISTS. `applyDeckClassFromFrontMatter` used to resolve the deck's
 * registers inside a promise continuation, so the first `runAllContentTransforms()`
 * pass read every section BEFORE its deck-wide tokens landed. The bootstrap comment
 * named that hazard and leaned on a later re-run to converge — but the re-run is
 * gated on `applyDefaultComponent()` reporting a change, so a deck whose slides all
 * name their own component never gets one, and chart-family's `chart-frame` guard
 * makes it a no-op for charts even when it fires.
 *
 * Harmless while no transform keyed on a deck token. It stopped being harmless when
 * the gantt tick's wrap budget and collision cull started selecting their
 * per-character advance from the `sketch` class (#1663): a `mode: sketch` export
 * built its axis with MONO advances and then painted it in the HAND face — the CSS
 * and the measurement naming different faces, which is the exact desync that
 * feature exists to prevent. `mode:` is the register that breaks, because Marp
 * stamps a native `class:` itself but has never heard of `mode:`.
 *
 * The assertion is a TICK COUNT, because that is where the two advances diverge
 * observably: on a 15-month axis the hand's wider setting culls to alternate months
 * (8 ticks) where mono keeps every one (13). Counting ticks therefore reads the
 * advance the builder actually used, without reaching into private state.
 *
 * Exercises the ACTUAL bundled dist/lattice-runtime.js in jsdom with
 * runScripts:'dangerously' — the real browser-runtime path, which lib/unit tests
 * cannot reach because the bootstrap IIFE isn't requireable. Mirrors the harness in
 * runtime-frontmatter-refire.test.js. Record:
 * engineering/decisions/2026-08-12-sketch-label-voice.md § "The bug this uncovered".
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { frontMatterBlock } = require('../../../lib/core/deck-front-matter');
const engine = require('../../../lib/components/chart/_chart-family/chart-family');

const RUNTIME_SRC = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'dist', 'lattice-runtime.js'),
  'utf8',
);

// A 15-month date axis — the span where the two faces disagree about culling.
const GANTT_SECTION = `<section class="gantt"><h2>Plan</h2>
<p><code>2026-01-01 .. 2027-03-31</code></p>
<ul><li>Framework<ul>
<li>Taxonomy <code>2026-01-01..2026-04-30</code> <code>done</code></li>
<li>Weighting <code>2026-10-01..2027-02-28</code> <code>at-risk</code></li>
</ul></li></ul></section>`;

const deckFrontMatter = (lines) =>
  ['---', 'theme: carta', ...lines, '---', '', '## Title', '', 'Body.', ''].join('\n');

/** Tick count the ENGINE path produces for the same list — the parity reference. */
const engineTicks = (hand) => {
  const ul = GANTT_SECTION.match(/<ul>[\s\S]*<\/ul>/)[0];
  const out = engine.buildGanttChart(
    engine.extractFirstList(ul).inner,
    '<p><code>2026-01-01 .. 2027-03-31</code></p>',
    undefined,
    hand,
  );
  return (out.match(/class="gantt-tick"/g) || []).length;
};

/** Boot the real runtime over a baked-front-matter document; report what landed. */
const runRuntime = async (fmLines) => {
  const baked = frontMatterBlock(deckFrontMatter(fmLines));
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${baked}${GANTT_SECTION}</body></html>`,
    { url: 'file:///tmp/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  const { window } = dom;
  const { document } = window;
  // file:// is a null origin — what a recipient double-clicking the export gets.
  // Nothing may reach the network; the baked block is the whole source of truth.
  let fetchCalls = 0;
  window.fetch = () => { fetchCalls++; return Promise.reject(new TypeError('Failed to fetch')); };

  const scriptEl = document.createElement('script');
  scriptEl.textContent = RUNTIME_SRC;
  document.body.appendChild(scriptEl);
  await new Promise((r) => setTimeout(r, 300));

  const section = document.querySelector('section.gantt');
  const result = {
    fetchCalls,
    sketch: section.classList.contains('sketch'),
    ticks: document.querySelectorAll('text.gantt-tick').length,
  };
  window.close();
  return result;
};

/**
 * Boot the real runtime over a document with NO baked block, served from an
 * http(s) URL — the marp-kit surface, where a hand-rolled Marp setup references
 * our runtime and the deck's front matter can only come from FETCHING the source
 * `.md`. That fetch cannot land before first paint, so the deck's registers
 * arrive after the first transform pass has already built every chart.
 *
 * This is the path #1664's synchronous priming could not reach, and the one this
 * change exists for: it needs the re-run to actually FIRE (the old gate asked
 * `applyDefaultComponent()`, which is false for a deck whose slides name their
 * own component) and the chart to be REBUILDABLE once it does (the `chart-frame`
 * guard plus an `innerHTML` replacement had destroyed the authored list).
 */
const runRuntimeFetched = async (fmLines) => {
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${GANTT_SECTION}</body></html>`,
    { url: 'https://example.test/deck.html', runScripts: 'dangerously', pretendToBeVisual: true },
  );
  const { window } = dom;
  const { document } = window;
  const source = deckFrontMatter(fmLines);
  let fetchCalls = 0;
  window.fetch = (url) => {
    fetchCalls++;
    // Resolve on a later turn than the bootstrap's synchronous first pass, which
    // is the whole point — a fetch that settled early would hide the bug.
    return Promise.resolve({
      ok: String(url).endsWith('.md'),
      status: String(url).endsWith('.md') ? 200 : 404,
      text: () => Promise.resolve(source),
    });
  };

  const scriptEl = document.createElement('script');
  scriptEl.textContent = RUNTIME_SRC;
  document.body.appendChild(scriptEl);

  // SAMPLE THROUGHOUT, don't just read the end state. The backdrop defect this
  // guards (#1673 F1) is a WINDOW, not a final condition: the MutationObserver's
  // 150ms debounce brings another pass round and repairs it, so a single read at
  // 300ms sees a correct document and the test passes with the fix reverted.
  // (Confirmed: it did.) Poll instead, and report the worst moment seen.
  const section = document.querySelector('section.gantt');
  const hasBackdrop = () => section.querySelectorAll(':scope > .backdrop').length;
  const wantsBackdrop = () => section.className.split(/\s+/).includes('finish');
  let backdropGap = false;
  for (let t = 0; t < 30; t++) {
    await new Promise((r) => setTimeout(r, 10));
    // Only meaningful once the chart exists and the finish register has landed —
    // before that there is nothing to have lost.
    if (section.querySelector('svg') && wantsBackdrop() && !hasBackdrop()) backdropGap = true;
  }

  const result = {
    fetchCalls,
    sketch: section.classList.contains('sketch'),
    ticks: document.querySelectorAll('text.gantt-tick').length,
    bodies: section.querySelectorAll('.chart-body').length,
    svgs: section.querySelectorAll('svg').length,
    backdrop: hasBackdrop(),
    backdropGap,
  };
  window.close();
  return result;
};

/**
 * How many TRANSFORM PASSES does startup run?
 *
 * Counting chart BUILDS cannot answer this and it matters: an extra pass over a
 * settled deck rebuilds nothing (the class list has not moved), so a build
 * counter reads 1 either way while the deck quietly pays for a second full pass
 * over every transform. That is exactly how the clear-point went unguarded.
 *
 * So instrument the real bundle: one counter at the top of the real
 * `runAllContentTransforms`, injected into the SHIPPED source string. The anchor
 * is asserted below, so a rename fails loudly instead of silently counting zero.
 */
const PASS_ANCHOR = 'function runAllContentTransforms() {';
const INSTRUMENTED = RUNTIME_SRC.replace(
  PASS_ANCHOR,
  `${PASS_ANCHOR} window.__passes = (window.__passes || 0) + 1;`,
);

const countTransformPasses = async (fmLines, baked) => {
  const src = deckFrontMatter(fmLines);
  const head = baked ? frontMatterBlock(src) : '';
  const dom = new JSDOM(
    `<!DOCTYPE html><html><head></head><body>${head}${GANTT_SECTION}</body></html>`,
    {
      url: baked ? 'file:///tmp/deck.html' : 'https://example.test/deck.html',
      runScripts: 'dangerously',
      pretendToBeVisual: true,
    },
  );
  const { window } = dom;
  const { document } = window;
  window.fetch = (url) => (baked
    ? Promise.reject(new TypeError('Failed to fetch'))
    : Promise.resolve({
      ok: String(url).endsWith('.md'),
      status: String(url).endsWith('.md') ? 200 : 404,
      text: () => Promise.resolve(src),
    }));

  const scriptEl = document.createElement('script');
  scriptEl.textContent = INSTRUMENTED;
  document.body.appendChild(scriptEl);
  await new Promise((r) => setTimeout(r, 400));
  const passes = window.__passes || 0;
  const ticks = document.querySelectorAll('text.gantt-tick').length;
  window.close();
  return { passes, ticks };
};

describe('runtime mode-geometry parity — `mode:` reaches the transforms on pass 1', () => {
  test('sanity: the two advances DO produce different tick counts on this axis', () => {
    assert.notEqual(engineTicks(true), engineTicks(false),
      'the fixture must be a span where the hand and mono advances cull differently, '
      + 'or the assertions below cannot detect which advance was used');
  });

  test('`mode: sketch`: the runtime builds the axis with the HAND advance the CSS will paint', async () => {
    const r = await runRuntime(['mode: sketch']);
    assert.equal(r.fetchCalls, 0, 'the baked block is read from the DOM — no network');
    assert.ok(r.sketch, 'the deck-wide mode token reached the section (so CSS paints the hand)');
    assert.equal(r.ticks, engineTicks(true),
      `runtime built ${r.ticks} ticks, engine builds ${engineTicks(true)} — the axis was measured `
      + 'in a different face than the one being painted (HARD RULE #1)');
  });

  test('`mode: sketch-clean` carries the hand too — it is `sketch` plus a body opt-out', async () => {
    const r = await runRuntime(['mode: sketch-clean']);
    assert.ok(r.sketch, 'sketch-clean still stamps `sketch`');
    assert.equal(r.ticks, engineTicks(true));
  });

  test('the legacy deck-wide `class: sketch` spelling behaves identically', async () => {
    const r = await runRuntime(['class: sketch']);
    assert.ok(r.sketch);
    assert.equal(r.ticks, engineTicks(true));
  });

  test('no mode: the mono advance, unchanged — the register only ever adds', async () => {
    const r = await runRuntime([]);
    assert.equal(r.sketch, false);
    assert.equal(r.ticks, engineTicks(false));
  });
});

describe('runtime mode-geometry parity — the FETCH FALLBACK converges too (#1673)', () => {
  test('the fixture really does take the fetch path', async () => {
    // Guards every assertion below: if the runtime found a baked block after all,
    // it would pass for the reason #1664 already covers and prove nothing here.
    const r = await runRuntimeFetched(['mode: sketch']);
    assert.ok(r.fetchCalls > 0, 'no baked block, http(s) origin — the source .md must be fetched');
  });

  test('`mode: sketch` over fetch: the axis ends up measured in the face it is painted in', async () => {
    const r = await runRuntimeFetched(['mode: sketch']);
    assert.ok(r.sketch, 'the deck-wide mode token reached the section, so CSS paints the hand');
    assert.equal(r.ticks, engineTicks(true),
      `runtime built ${r.ticks} ticks, engine builds ${engineTicks(true)} — the axis was measured `
      + 'in a different face than the one painted. Two things have to hold for this to pass: the '
      + 're-run must FIRE (the old gate asked applyDefaultComponent(), false for this deck), and '
      + 'the chart must be REBUILDABLE once it does (chart-frame + innerHTML replacement had '
      + 'destroyed the authored list).');
  });

  test('the rebuild replaces the figure rather than stacking a second one', async () => {
    const r = await runRuntimeFetched(['mode: sketch']);
    // Counted INSIDE the section, on the structures a second build would
    // duplicate. An earlier cut of this test counted `.chart-frame`, which is a
    // class on the `<section>` itself — so it was always exactly 1 and could not
    // fail for the thing it was written to catch.
    assert.equal(r.bodies, 1, 'a second build appending beside the first would double the body');
    assert.equal(r.svgs, 1, 'a second build appending beside the first would double the figure');
  });

  test('no mode over fetch: the mono advance, and nothing rebuilt', async () => {
    const r = await runRuntimeFetched([]);
    assert.equal(r.sketch, false);
    assert.equal(r.ticks, engineTicks(false));
  });

  test('a rebuilt chart still has its finish backdrop by the end of the pass', async () => {
    // The rebuild writes `innerHTML`, and the `.backdrop` wrapper is the
    // section's first child rather than part of the transform's own output — so
    // it goes with the write. `injectBackdrops` runs at the TOP of a pass, which
    // meant nothing restored it until the MutationObserver's 150ms debounce
    // brought the next pass round, and the finish popped in late on chart slides
    // only. Found by the checker on this diff; the fix re-injects after the
    // registry rather than teaching chart-family what a finish is.
    const r = await runRuntimeFetched(['mode: sketch', 'finish: atrium']);
    assert.equal(r.backdrop, 1, 'the chart section ended without its finish backdrop');
    assert.equal(r.backdropGap, false,
      'the chart painted with no finish backdrop for part of startup — the rebuild '
      + 'took the wrapper with it and nothing restored it until the observer fired');
  });
  // THE COST STORY, PINNED. The re-run gate is deliberately still a GATE: the
  // whole justification for not simply running the transforms twice is that a
  // deck carrying a baked block — every Export-to-Marp bundle — pays nothing.
  // That rests entirely on `runAllContentTransforms` clearing
  // `deckClassStampedSincePass` right after it applies the classes for its own
  // pass, so a stamp made INSIDE pass 1 does not bill for a pass 2.
  //
  // An independent verifier deleted that clear-point and found the baked path
  // silently go from one transform pass to two with the whole suite still
  // green. The property the record calls "the whole design" was unguarded; this
  // is the guard. Counts DISTINCT `.chart-body` element identities rather than
  // insertions — `injectBackdrops` re-parents nodes, so a naive insertion count
  // reads high.
  test('the instrumentation anchor still exists — otherwise the two tests below count nothing', () => {
    assert.ok(RUNTIME_SRC.includes(PASS_ANCHOR), `${PASS_ANCHOR} not found in the shipped bundle`);
    assert.notEqual(INSTRUMENTED, RUNTIME_SRC);
  });

  test('the baked path runs exactly ONE transform pass — the gate still gates', async () => {
    const r = await countTransformPasses(['mode: sketch'], true);
    assert.equal(r.ticks, engineTicks(true), 'sanity: the baked path still converges');
    assert.equal(r.passes, 1,
      `baked + mode: sketch ran ${r.passes} transform passes — the re-run gate has stopped `
      + 'gating and every Export-to-Marp bundle now pays for a second full pass. This is the '
      + 'property the clear-point in runAllContentTransforms exists for.');
  });

  test('the fetch fallback buys the correction pass it needs, and does not loop', async () => {
    const r = await countTransformPasses(['mode: sketch'], false);
    assert.ok(r.passes >= 2, `fetch fallback ran ${r.passes} passes — it needs a correction pass`);
    assert.ok(r.passes <= 3, `fetch fallback ran ${r.passes} passes — that is a re-run loop`);
    assert.equal(r.ticks, engineTicks(true));
  });
});
