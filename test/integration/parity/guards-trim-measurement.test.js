/**
 * Integration: the TRIM MEASURER's geometry, in real Chromium.
 *
 * WHY THIS FILE EXISTS, and it is one sentence: **every gate this feature has can
 * see an UNDER-cut and none of them can see an OVER-cut.** `planTrim`'s exit test,
 * the per-box revert, the frame check, the corpus ratchet — all of them ask "does it
 * still overflow". A clamp that removes twice the lines it needed to satisfies every
 * one of them and ships. A fourth independent review found three separate defects
 * living in exactly that blind spot, each one destroying the author's copy to buy
 * room nothing needed:
 *
 *   · `transform: scale(k)` — `getBoundingClientRect` is VISUAL px and `clientHeight`,
 *     `getComputedStyle` and `scrollHeight` are LAYOUT px. Mixed, they disagree by k.
 *     `docs/src/playground/deck-preview.js` scales every `<section>` by the pane width
 *     and runs the runtime in the same document, so the planner kept 22 lines at
 *     scale 1, six at 0.5 and ONE at 0.35 — the author's copy shortening as a reader
 *     dragged the pane.
 *   · `line-height: normal` — `parseFloat('normal')` is `NaN`, and the fallback guessed
 *     `fontSize * 1.4`. On a 16px face whose real line box is 18px the budget came out
 *     seven lines short and left 132px of the box empty.
 *   · `round(height / lineHeight)` for the line COUNT, which credited up to half a
 *     line of lift per action that the DOM never delivers.
 *
 * The model tier cannot reach any of them: a generated block's height IS the planner's
 * own formula, so its computed line height and its real one can never disagree, and no
 * model carries a transform. That is why these arms are here and not in
 * `test/unit/core/guards-trim.metamorphic.test.js`.
 *
 * WHAT THE HARNESS IS, stated plainly (HARD RULE #23). These are claims about the
 * MEASURER's geometry, so the fixture is a synthetic page built to hold one shape at a
 * time, opened in real Chromium with real layout — NOT a rendered deck. Deck-level
 * behavior is `guards-trim-adapter.test.js`'s job, and artifact-level behavior is
 * `guards-trim-deliverables.test.js`'s. The scaled shape in particular is not
 * reachable from any deck: it is what the Playground's preview does to a section.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const {
  measureTrim, planTrim, applyTrim, trimBlockEl, clearTrim, clearTrimBoxes, verifyTrim,
  ROLE_SRC, MEASURE_SRC, APPLY_SRC, CLEAR_SRC, FIND_SRC, CLEAR_BOXES_SRC, VERIFY_SRC,
} = require(path.join(ROOT, 'lib/core/guards-trim'));
const { PROBE_SRC } = require(path.join(ROOT, 'lib/core/overflow-probe'));

void measureTrim; void applyTrim; void trimBlockEl; void clearTrim;   // used via injected source
void clearTrimBoxes; void verifyTrim;

let puppeteer, browser;

const INJECT = `
  globalThis.trimRoleOf = ${ROLE_SRC};
  globalThis.trimBlockEl = ${FIND_SRC};
  globalThis.clearTrim = ${CLEAR_SRC};
  globalThis.measureTrim = ${MEASURE_SRC};
  globalThis.clearTrimBoxes = ${CLEAR_BOXES_SRC};
  const measureTrim = globalThis.measureTrim;
  const applyTrim = ${APPLY_SRC};
  const verifyTrim = ${VERIFY_SRC};
  const probeSectionOverflow = ${PROBE_SRC};
`;

/**
 * One shape, one page. `cellCss` styles the clip cell, `bodyCss` the text blocks,
 * `outerCss` an optional wrapper (this is where a transform goes).
 */
function shapePage({ outerCss = '', cellCss = '', inner, font = '16px/normal Arial, sans-serif' }) {
  return `<!doctype html><meta charset=utf-8><style>
    *{box-sizing:border-box}
    body{margin:0;font:${font}}
    /* NO MARGINS, which is the engine's own contract (HARD RULE #20) and not a
       convenience here: a margin sits OUTSIDE the border box, so it is invisible to
       getBoundingClientRect. The over-cut arm below measures empty room as the gap
       between the cell's content edge and the deepest RECT inside it, and a default
       paragraph margin of 1em reads there as 16px of room the planner "wasted" when it is
       in fact space the layout reserves. Left in, the arm reported a 26px over-cut on
       correct code. Engine layout CSS carries no margins, so the fixture carries none
       either — and the arm's claim is scoped to DOM of that shape. */
    p,h1,h2,h3,h4,ul,ol{margin:0}
    .outer{${outerCss}}
    .cell-stage{width:800px;height:600px;overflow:hidden;${cellCss}}
  </style>
  <div class="outer"><section data-lattice-slide class="guards-strict">
    <div class="cell-stage">${inner}</div>
  </section></div>`;
}

const PARA = 'The quick brown fox jumps over the lazy dog and keeps running well past it. '.repeat(60);

/**
 * Open a synthetic page and hand a RUNNER to `fn`, so several evaluations share one
 * page. That is not a convenience: `measureTrim` MINTS `data-trim-id` on the page it
 * runs on, and a plan's `blockId` only resolves there. Measuring on one page, planning
 * in Node and applying on a fresh one silently applies NOTHING — `trimBlockEl` finds no
 * element, `applyTrim` clamps nothing, and the verdict then honestly reports a box that
 * is still over. The first cut of the `verifyTrim` arm below did exactly that and read
 * as a failure of the code under test.
 */
async function onPage(html, fn) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1400, height: 900 });
  await page.setContent(html, { waitUntil: 'load' });
  await page.evaluate(() => document.fonts.ready);
  // DATA GOES IN AS AN ARGUMENT; ONLY THE KERNEL GOES IN AS SOURCE.
  //
  // The kernel functions are `.toString()`-injected by contract (see the header of
  // `lib/core/guards-trim.js`), so they have to arrive as text. A PLAN does not, and the
  // first cut of this harness baked one in with `${JSON.stringify(plan)}` — building
  // JavaScript out of a value, which CodeQL flagged at five sites and which is the same
  // class of mistake that once aborted a whole export in this very feature
  // (`'[data-trim-id="' + id + '"]'` concatenated into a selector, killing `querySelector`
  // on an author id containing `"]`). Nothing here is attacker-controlled, but a harness
  // that argues about string-built code in its own subject should not be built out of it.
  // Bodies read `args`; they interpolate nothing.
  const run = (body, args) => page.evaluate(
    (src, a) => new Function('args', src)(a),
    `${INJECT}\n${body}`, args ?? null,
  );
  try { return await fn(run); } finally { await page.close(); }
}

/** One evaluation on its own page — the common case. */
function onShape(html, body, args) {
  return onPage(html, (run) => run(body, args));
}

/** Measure one section into a model, in the page. */
const MEASURE_EXPR = `
  const sec = document.querySelector('section');
  return measureTrim(sec, '.cell-stage', 12, 'tb');
`;

before(async () => {
  puppeteer = require('puppeteer');
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});
after(async () => { if (browser) await browser.close(); });

describe('the TRIM measurer geometry, in real Chromium', () => {
  test('a SCALED slide plans the same cut as an unscaled one', async () => {
    // METAMORPHIC, at the DOM. A transform changes what a slide LOOKS like and nothing
    // about what it says, so the number of lines the guard removes must not move. This
    // is the only arm that can fail on the coordinate-space bug: a single render tells
    // you nothing, because whatever it cut looks self-consistent.
    const inner = `<p class="body">${PARA}</p>`;
    const plans = [];
    // 0.94375 is not a round number and not a guess: it is what the STUDIO EXPORT
    // capture frame actually runs at. `deck-export.js` sizes its iframe to the geom box
    // (1280) and `buildSrcdoc` puts `padding: 18px` on BOTH `html` and `body`, so
    // `.lattice` measures 1208 and the fit agent scales every section by 1208/1280.
    // Measured in real Chromium. It matters because that frame's DOM is what the export
    // bakes — so with the coordinate-space bug the trim ran at the wrong scale in
    // EXPORTED BYTES, not only in a preview. Pinned here so a change to that frame's
    // padding cannot quietly move it back.
    for (const k of [1, 0.94375, 0.5, 0.35]) {
      const html = shapePage({ inner, outerCss: k === 1 ? '' : `transform:scale(${k});transform-origin:top left` });
      const model = await onShape(html, MEASURE_EXPR);
      assert.ok(model.boxes.length, `scale ${k}: nothing measured — the shape must overflow for this arm to mean anything`);
      plans.push({ k, lines: planTrim(model).actions.map((a) => a.lines) });
    }
    assert.ok(plans[0].lines.length, 'anti-vacuity: the unscaled shape planned no cut at all');
    for (const p of plans.slice(1)) {
      assert.deepEqual(p.lines, plans[0].lines,
        `scale ${p.k} planned ${JSON.stringify(p.lines)} where scale 1 planned ` +
        `${JSON.stringify(plans[0].lines)} — the cut is a property of the renderer, not the deck`);
    }
  });

  test('`line-height: normal` is MEASURED, not guessed at 1.4x the font size', async () => {
    // The guess is not the engine's, the theme's, or the font's. Pinned as the real
    // line box, read from a Range, against the computed fallback — which for 16px Arial
    // is 22.4 where the renderer lays out 18.4.
    const html = shapePage({ inner: `<p class="body">${PARA}</p>` });
    const got = await onShape(html, `
      ${MEASURE_EXPR.replace('return ', 'const model = ')}
      const el = document.querySelector('p.body');
      const cs = getComputedStyle(el);
      const r = document.createRange(); r.selectNodeContents(el);
      const rects = r.getClientRects();
      return { modelLh: model.boxes[0].blocks[0].lineHeight,
               modelLines: model.boxes[0].blocks[0].lines,
               realLines: rects.length,
               guess: parseFloat(cs.fontSize) * 1.4,
               computed: cs.lineHeight };
    `);
    assert.equal(got.computed, 'normal',
      'anti-vacuity: this arm only means something while the block really is `line-height: normal`');
    assert.equal(got.modelLines, got.realLines,
      `the model says ${got.modelLines} lines where the renderer laid out ${got.realLines}`);
    assert.ok(Math.abs(got.modelLh - got.guess) > 1,
      `the model's line height (${got.modelLh}) is still the 1.4x guess (${got.guess}) — ` +
      'nothing was measured');
  });

  test('a clamp never leaves a whole LINE of its box empty — the over-cut arm', async () => {
    // THE GENERAL INSTRUMENT, and the one the whole feature was missing. Every other
    // gate asks whether the box still OVERFLOWS; this one asks whether the cut was
    // BIGGER than it had to be — the question no other arm in the tree can answer.
    //
    // Mutation-measured rather than asserted. Each of these turns this arm red:
    //   · `scaleOf` pinned to 1 (the coordinate-space bug)
    //   · `lineBoxesOf` never measuring (the 1.4x line-height guess)
    //   · the line budget cut by two lines (a deliberate over-cut, the control)
    // The control matters: the FIRST version of this arm measured empty room as
    // `clientHeight - scrollHeight`, which can never be positive, so it passed all
    // three. An arm that cannot fail is worse than an honest gap.
    const shapes = [
      { name: 'plain prose', html: shapePage({ inner: `<p class="body">${PARA}</p>` }) },
      { name: 'line-height 1.6', html: shapePage({ inner: `<p class="body">${PARA}</p>`, font: '16px/1.6 Arial, sans-serif' }) },
      { name: 'scaled 0.5', html: shapePage({ inner: `<p class="body">${PARA}</p>`, outerCss: 'transform:scale(0.5);transform-origin:top left' }) },
      { name: 'padded card', html: shapePage({ inner: `<div style="padding:24px;border-bottom:6px solid #000"><p class="body">${PARA}</p></div>` }) },
    ];
    let acted = 0;
    for (const s of shapes) {
      const model = await onShape(s.html, MEASURE_EXPR);
      if (!model.boxes.length) continue;
      const plan = planTrim(model);
      if (!plan.actions.length) continue;
      acted++;
      const after = await onShape(s.html, `
        const sec = document.querySelector('section');
        const model = measureTrim(sec, '.cell-stage', 12, 'tb');
        const plan = args.plan;
        applyTrim(sec, plan);
        const cell = document.querySelector('.cell-stage');
        const el = trimBlockEl(sec, plan.actions[0].blockId);
        const r = document.createRange(); r.selectNodeContents(el);
        const rects = r.getClientRects();
        // THE EMPTY ROOM LEFT BELOW THE CONTENT — measured as the gap between the
        // cell's content edge and the deepest thing painted inside it.
        //
        // NOT clientHeight minus scrollHeight, which is what the first cut of this
        // arm used and which made it UNABLE TO FAIL: a box's scrollHeight never falls
        // below its clientHeight, so that expression is always <= 0 and the assertion
        // was vacuously true. Caught by mutating the planner to cut two lines more
        // than it needs and watching the arm stay green -- a relation that cannot
        // fail is worse than an honest gap, which is this feature's own lesson about
        // its own tests.
        //
        // Both terms are VISUAL px, like lineH, so the comparison holds under a
        // transform too: the cell's own rect scales with its content.
        const cellRect = cell.getBoundingClientRect();
        const k = cellRect.height / (cell.offsetHeight || 1);
        const limit = cellRect.top + k *
          (cell.clientTop + cell.clientHeight - (parseFloat(getComputedStyle(cell).paddingBottom) || 0));
        let deepest = -Infinity;
        for (const d of cell.querySelectorAll('*')) {
          const dr = d.getBoundingClientRect();
          if (dr.height > 0 || dr.width > 0) deepest = Math.max(deepest, dr.bottom);
        }
        return { over: cell.scrollHeight - cell.clientHeight,
                 unused: limit - deepest,
                 lineH: rects.length > 1 ? rects[1].top - rects[0].top : 0 };
      `, { plan });
      assert.ok(after.over <= 1, `${s.name}: the clamp left ${after.over}px still overflowing`);
      // The residual room must be under ONE line: if a whole further line would have
      // fitted, the guard removed text it did not need to.
      assert.ok(after.lineH > 0, `${s.name}: could not read the clamped block's real line box`);
      assert.ok(after.unused < after.lineH,
        `${s.name}: the clamp left ${after.unused}px empty where a line is ${after.lineH}px — ` +
        'at least one more line of the author\'s copy would have fitted');
    }
    assert.ok(acted >= 3, `anti-vacuity: only ${acted} shape(s) produced a cut to judge`);
  });

  test('the model reads LAYOUT px — the same unit the overflow probe normalizes to', async () => {
    // HARD RULE #1, on a question both kernels answer: "how far over is this box?"
    // The first cut of the scale fix converted the QUANTITY to visual px and left
    // `TRIM_TOLERANCE` (12) and `FIT_EPSILON` (0.5) as layout-px constants, so the
    // effective entry threshold became `12 / k` — a box 20 layout px over entered the
    // planner at scale 1 and was ignored at 0.5, and `guards: strict` went INERT on the
    // scaled preview while the ring it exists to clear still fired. The measurer and the
    // probe now read the scale the same way and normalize to the same unit.
    const inner = `<p class="body">${PARA}</p>`;
    for (const k of [1, 0.5, 0.7]) {
      const html = shapePage({ inner, outerCss: k === 1 ? '' : `transform:scale(${k});transform-origin:top left` });
      const got = await onShape(html, `
        const sec = document.querySelector('section');
        const cell = document.querySelector('.cell-stage');
        const model = measureTrim(sec, '.cell-stage', 12, 'tb');
        const box = model.boxes[0];
        // The probe's own scale expression, read off the same element.
        const kr = cell.getBoundingClientRect().height / cell.offsetHeight;
        return { layoutOver: cell.scrollHeight - cell.clientHeight,
                 modelOver: box ? box.contentBottom - box.limit : null,
                 probeK: kr };
      `);
      assert.ok(got.layoutOver > 12, `scale ${k}: fixture must overflow past the tolerance`);
      assert.equal(got.modelOver, got.layoutOver,
        `scale ${k}: the model says the box is ${got.modelOver}px over where the layout says ` +
        `${got.layoutOver} — the two are not in the same unit`);
      assert.ok(Math.abs(got.probeK - k) < 0.01,
        `scale ${k}: the probe's own scale expression read ${got.probeK}`);
    }
  });

  test('a ROUND line height plans the same cut at every scale — the float-noise arm', async () => {
    // The scale arm above uses `line-height: normal`, whose non-integral line box means
    // `(limit - top) / lh` never lands on an integer boundary — so it could not see a
    // one-line over-cut caused by float residue in `remainder`. The maker-checker found
    // exactly that: at k values that are not exact binary fractions, `contentBottom` and
    // `deepestOuter` round independently and left ~1e-5 on the effective limit, which
    // `Math.floor` turned into a whole line of the author's copy. A round `line-height`
    // and a scale list that includes 0.7, 0.62 and 0.83 is what makes it visible.
    const inner = `<p class="body">${PARA}</p>`;
    const plans = [];
    for (const k of [1, 0.94375, 0.5, 0.35, 0.7, 0.62, 0.83, 0.9]) {
      const html = shapePage({
        inner, font: '16px/24px Arial, sans-serif',
        outerCss: k === 1 ? '' : `transform:scale(${k});transform-origin:top left`,
      });
      const model = await onShape(html, MEASURE_EXPR);
      assert.ok(model.boxes.length, `scale ${k}: nothing measured`);
      plans.push({ k, lines: planTrim(model).actions.map((a) => a.lines) });
    }
    assert.ok(plans[0].lines.length, 'anti-vacuity: the unscaled shape planned no cut');
    for (const p of plans.slice(1)) {
      assert.deepEqual(p.lines, plans[0].lines,
        `scale ${p.k} planned ${JSON.stringify(p.lines)} where scale 1 planned ${JSON.stringify(plans[0].lines)}`);
    }
  });

  test('verifyTrim keeps a cut that fits, and reverts the WHOLE plan when it does not', async () => {
    // THE VERDICT FUNCTION, directly. It decides whether the author's content survives,
    // on both render paths, and until this arm nothing tested it — only the
    // deliverables test's parity arm, which asserts the two paths AGREE rather than that
    // either verdict is right. Three claims, one shape each.
    const fits = shapePage({ inner: `<p class="body">${PARA}</p>` });
    const OPTS = "{ clipSel: '.cell-stage', ignoreSel: '', ns: 'tb', eps: 0.5, tol: 12, ";

    // 1. A cut that achieves fit is KEPT. Measure, plan and verify on ONE page — see
    //    `onPage`: a plan's ids only resolve where they were minted.
    const good = await onPage(fits, async (run) => {
      const model = await run(MEASURE_EXPR);
      const plan = planTrim(model);
      assert.ok(plan.actions.length, 'anti-vacuity: no cut to verify');
      return { plan, ...await run(`
        const sec = document.querySelector('section');
        const p = args.plan;
        applyTrim(sec, p);
        const v = verifyTrim(sec, p, ${OPTS} probe: probeSectionOverflow });
        return { v, left: sec.querySelectorAll('[data-lattice-trimmed]').length };
      `, { plan }) };
    });
    assert.equal(good.v.clean, true, 'a cut that fits was reported as not clean');
    assert.equal(good.v.reverted, 0, 'a cut that fits was reverted');
    assert.ok(good.left > 0, 'a cut that fits left no clamp in the DOM');

    // 2. ARM 1 ALONE MUST CATCH A RESIDUAL THE FRAME PROBE CANNOT SEE, and the whole
    //    plan comes off. This is the sheared-card case: 8px outside a clip cell is
    //    enough to cut a card's bottom border and both corners, and it is INSIDE
    //    `probeSectionOverflow`'s own 12px slack — so a verdict that asked only the
    //    frame would certify it. The fixture uses an 8px line so that keeping ONE extra
    //    line lands under 12px; at a normal line height the frame arm would catch it too
    //    and this would not test arm 1 at all.
    //
    //    The forged plan also carries a BOGUS action naming an element that does not
    //    exist, so `reverted` has to be what `clearTrimBoxes` actually undid rather than
    //    what the plan asked for — reporting the planned count would say a revert
    //    succeeded on a block it could not find.
    const tight = shapePage({
      inner: `<p class="body">${PARA}${PARA}</p>`,
      font: '7px/8px Arial, sans-serif',
      cellCss: 'width:300px',
    });
    const bad = await onPage(tight, async (run) => {
      const model = await run(MEASURE_EXPR);
      const plan = planTrim(model);
      assert.ok(plan.actions.length, 'anti-vacuity: the tight fixture planned no cut');
      const over = {
        ...plan,
        actions: [
          ...plan.actions.map((a) => ({ ...a, lines: a.lines + 1 })),
          { ...plan.actions[0], blockId: '__no-such-block__' },
        ],
      };
      return run(`
        const sec = document.querySelector('section');
        const p = args.plan;
        applyTrim(sec, p);
        const before = sec.querySelectorAll('[data-lattice-trimmed]').length;
        const cell = document.querySelector('.cell-stage');
        const residual = cell.scrollHeight - cell.clientHeight;
        const frameSays = probeSectionOverflow(sec, '.cell-stage', 12, '').over;
        const v = verifyTrim(sec, p, ${OPTS} probe: probeSectionOverflow });
        return { before, residual, frameSays, planned: p.actions.length, v,
                 left: sec.querySelectorAll('[data-lattice-trimmed]').length };
      `, { plan: over });
    });
    assert.ok(bad.before > 0, 'anti-vacuity: the forged plan applied no clamp at all');
    assert.ok(bad.residual > 0.5 && bad.residual < 12,
      `anti-vacuity: the forged residual is ${bad.residual}px — it must sit between ` +
      'FIT_EPSILON and the probe\'s tolerance, or this is not arm 1\'s case');
    assert.equal(bad.frameSays, false,
      'anti-vacuity: the frame probe already sees this, so arm 1 is not what is being tested');
    assert.equal(bad.v.clean, false, 'a cut that did not achieve fit was reported clean');
    assert.equal(bad.left, 0, `${bad.left} clamp(s) survived a failed verdict — rule 5 is all-or-nothing`);
    assert.ok(bad.planned > bad.before, 'anti-vacuity: the bogus action resolved after all');
    assert.equal(bad.v.reverted, bad.before,
      `reverted says ${bad.v.reverted} where ${bad.before} clamp(s) were actually undone ` +
      `(the plan asked for ${bad.planned})`);

    // 3. A THROWING probe counts as OVER. The predecessor caught the throw and returned
    //    `false` — not over — under a comment saying a throwing probe must not keep a bad
    //    cut, which is the literal opposite of what it did. Same plan as claim 1, which
    //    verifies CLEAN against the real probe, so the only thing that changed is the throw.
    const thrown = await onPage(fits, async (run) => {
      const model = await run(MEASURE_EXPR);
      const plan = planTrim(model);
      return run(`
        const sec = document.querySelector('section');
        const p = args.plan;
        applyTrim(sec, p);
        const v = verifyTrim(sec, p, ${OPTS} probe: () => { throw new Error('probe exploded'); } });
        return { v, left: sec.querySelectorAll('[data-lattice-trimmed]').length };
      `, { plan });
    });
    assert.equal(thrown.v.clean, false, 'a throwing probe was treated as "not over" and the cut was kept');
    assert.equal(thrown.left, 0, 'a throwing probe left clamps standing');

    // 4. A MISSING probe counts as over too. `if (!over && o.probe)` deleted arm 2
    //    outright when the option was omitted, leaving the per-box half alone — the
    //    exact policy the runtime used to run and that this function exists to end. A
    //    guarantee you can switch off by forgetting an argument is not a guarantee.
    const absent = await onPage(fits, async (run) => {
      const model = await run(MEASURE_EXPR);
      const plan = planTrim(model);
      return run(`
        const sec = document.querySelector('section');
        const p = args.plan;
        applyTrim(sec, p);
        const v = verifyTrim(sec, p, { clipSel: '.cell-stage', ignoreSel: '', ns: 'tb', eps: 0.5, tol: 12 });
        return { v, left: sec.querySelectorAll('[data-lattice-trimmed]').length };
      `, { plan });
    });
    assert.equal(absent.v.clean, false,
      'omitting the probe silently dropped the frame arm and kept the cut under half the policy');
    assert.equal(absent.left, 0, 'omitting the probe left clamps standing');
  });

  test('clamping one COLUMN never credits its recovered height to another', async () => {
    // The model tier pins the PLANNER's flow test (MR3, via a corpus whose columns the
    // generator stacks and whose truth it carries in `col`). It cannot pin the MEASURER's
    // half: `stacksVertically` reads a real container's `display`, and a model simply
    // carries whatever `vstack` it was given. So a flex ROW mis-classified as stacking is
    // invisible to every relation — and that is the same over-credit, one function
    // earlier. This is that arm, on real layout.
    //
    // The shape is the one a fourth review had to hand-build: the left card's bottom sits
    // exactly at the right column's SECOND block's top, so a vertical-order test credits
    // the left card's recovery to a block beside it.
    const col = (body) => `<div style="padding:0 0 30px 0;border-bottom:6px solid #000">${body}</div>`;
    const html = shapePage({
      font: '16px/24px Arial, sans-serif',
      inner: `<div style="display:flex;gap:20px;align-items:flex-start">
        <div style="flex:1">${col(`<p class="body">${PARA}</p>`)}</div>
        <div style="flex:1">
          <p class="body" style="height:504px;overflow:hidden">${PARA}</p>
          <p class="body">${PARA}</p>
        </div>
      </div>`,
    });
    const got = await onPage(html, async (run) => {
      const model = await run(MEASURE_EXPR);
      const plan = planTrim(model);
      // Read `vstack` off the PRE-trim model: a successful clamp stops the box
      // overflowing, so a post-trim measure reports no boxes at all and the assertion
      // below would be vacuous exactly when the code is working.
      const vstack = (model.boxes[0]?.blocks || []).map((b) => b.vstack);
      return { plan, vstack, ...await run(`
        const sec = document.querySelector('section');
        const p = args.plan;
        const cell = document.querySelector('.cell-stage');
        const before = cell.scrollHeight - cell.clientHeight;
        applyTrim(sec, p);
        return { before, after: cell.scrollHeight - cell.clientHeight };
      `, { plan }) };
    });
    assert.ok(got.before > 12, `anti-vacuity: the two-up shape overflows by only ${got.before}px`);
    // The flex ROW must read as NOT stacking at the level where the columns diverge.
    assert.ok(got.vstack.some((v) => Array.isArray(v) && v.includes(false)),
      `no measured block reports a non-stacking level: ${JSON.stringify(got.vstack)} — a flex ` +
      'row was classified as a vertical stack, so one column can lift another');
    // And the DOM consequence: a plan the planner declared fitting really fits. A
    // cross-column credit makes it claim a fit it did not buy.
    if (got.plan.fits.length) {
      assert.ok(got.after <= 1,
        `the planner declared the box fitting but it is still ${got.after}px over — ` +
        'recovery was credited across columns');
    }
  });

  test('an author id in the synthetic namespace never shadows a minted one', async () => {
    // `blocks[].id` falls back to the author's own `id`, and `trimBlockEl` resolves
    // `data-trim-id` FIRST — so a deck writing `<p id="tb0">` collided with the
    // measurer's own namespace and the plan named one element while the apply clamped
    // another. Reproduced three ways by a fourth review, including an `<h3>` clamped:
    // rule 3 violated in the DOM without `planTrim` ever proposing it.
    const html = shapePage({
      inner: `<h3 id="tb0">A subheading that is long enough to wrap across more than one line in this box</h3>
              <p class="body">${PARA}</p>`,
    });
    const got = await onShape(html, `
      ${MEASURE_EXPR.replace('return ', 'const model = ')}
      const ids = model.boxes.flatMap((b) => b.blocks.map((x) => ({ id: x.id, role: x.role })));
      const minted = [...document.querySelectorAll('[data-trim-id]')]
        .map((e) => ({ tag: e.tagName, id: e.getAttribute('data-trim-id') }));
      return { ids, minted, authorStillTb0: !!document.getElementById('tb0') };
    `);
    assert.ok(got.authorStillTb0, 'anti-vacuity: the author id vanished, so nothing could collide');
    const seen = got.ids.map((x) => x.id);
    assert.equal(new Set(seen).size, seen.length,
      `two blocks share an id: ${JSON.stringify(got.ids)} — the apply would clamp whichever comes first`);
    for (const m of got.minted) {
      assert.notEqual(m.id, 'tb0',
        `a minted id took the author's own \`tb0\` (on <${m.tag}>) — the plan and the DOM now disagree`);
    }
  });
});
