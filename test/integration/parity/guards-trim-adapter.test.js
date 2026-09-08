/**
 * Integration: the TRIM **DOM adapter**, in real Chromium.
 *
 * WHY THIS FILE EXISTS. `guards-trim.js` splits measure -> decide -> apply, and
 * only the DECIDE half had tests. The 15 metamorphic relations in
 * `test/unit/core/guards-trim.metamorphic.test.js` pin `planTrim` over generated
 * models and say so in their own header: they do not touch `measureTrim`,
 * `applyTrim` or `clearTrim`.
 *
 * That gap is not theoretical, and it is not where the risk was assumed to be —
 * it is where the only real defect was FOUND. `planTrim` guarantees
 * fit-or-nothing over its MODEL, which is a prediction about the page rather
 * than a reading of it; applied to a real slide, `examples/overflow-guards.md`
 * page 4 came back trimmed AND still overflowing, the exact outcome that rule
 * exists to prevent. The call sites answer it by applying, re-measuring, and
 * REVERTING a cut that did not buy the fit — and that revert had no automated
 * coverage at all until this file.
 *
 * jsdom cannot host any of it: every claim below is about `getBoundingClientRect`
 * and `scrollHeight`, and jsdom has no layout engine. So this is real Chromium,
 * on real rendered decks, and it belongs in the integration tier rather than the
 * unit one.
 *
 * WHAT IT DOES NOT CLAIM. It does not assert how a slide LOOKS (HARD RULE #23) —
 * pixels are verified by rendering `examples/overflow-guards.md` and looking at
 * it. A green run here says the adapter's DOM decisions are right, nothing more.
 */

const { test, before, after, describe } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..', '..', '..');
const {
  measureTrim, planTrim, applyTrim, clearTrim, clearTrimBoxes, trimBlockEl, finalizeTrim,
  trimClassOf,
  ROLE_SRC, MEASURE_SRC, APPLY_SRC, CLEAR_SRC, FIND_SRC, CLEAR_BOXES_SRC, FINALIZE_SRC,
} = require(path.join(ROOT, 'lib/core/guards-trim'));
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, PROBE_SRC } =
  require(path.join(ROOT, 'lib/core/overflow-probe'));

void measureTrim; void applyTrim; void clearTrim;   // used via injected source
void clearTrimBoxes; void trimBlockEl; void finalizeTrim;

const TMP = path.join(ROOT, '.scratch', 'guards-trim-adapter');
const DECK = path.join(TMP, 'deck.md');
const PAGE = path.join(TMP, 'deck.html');
// A REAL shipped deck, with the register switched on. The synthetic deck above
// overflows only inside `.cell-stage`, and the footer band is a SIBLING cell — so
// the footer is not even reachable from that box's walk, and the chrome exclusion
// is unexercised there. It only bites when the SECTION itself is the overflowing
// box, which is the shape the corpus produces and the shape the original defect
// had (six of twelve boxes reported `blocked-by-footer`). Found by mutation: the
// first version of the chrome test passed with the exclusion deleted.
const CORPUS = path.join(TMP, 'corpus.md');
const CORPUS_PAGE = path.join(TMP, 'corpus.html');

/** A deck with one slide that overflows on prose (trimmable) and one that fits. */
const DECK_SRC = `---
marp: true
theme: indaco
paginate: true
guards: strict
header: "Adapter probe"
footer: "A footer band, so the chrome exclusion is actually exercised"
---

<!-- _class: content -->

## A slide whose body runs long.

${'This paragraph is deliberately long so the slide overflows its frame and the guard has something to cut. '.repeat(14)}

---

<!-- _class: content -->

## A slide that fits.

One short line.
`;

let browser;
let puppeteer;

before(async () => {
  fs.mkdirSync(TMP, { recursive: true });
  fs.writeFileSync(DECK, DECK_SRC);
  // Render through the REAL emulator so the DOM under test is the one an export
  // produces — form composition, cell tree, marker berth and all.
  execFileSync('node', [path.join(ROOT, 'lattice-emulator.js'), DECK, PAGE, 'indaco', '-q'],
    { cwd: ROOT, stdio: 'ignore' });
  const shipped = fs.readFileSync(path.join(ROOT, 'examples', 'overflow-fix-me.md'), 'utf8');
  fs.writeFileSync(CORPUS, shipped.replace(/^theme:.*$/m, (m) => `${m}\nguards: strict`));
  execFileSync('node', [path.join(ROOT, 'lattice-emulator.js'), CORPUS, CORPUS_PAGE, 'indaco', '-q'],
    { cwd: ROOT, stdio: 'ignore' });
  puppeteer = require('puppeteer');
  browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox', '--disable-dev-shm-usage'] });
});

after(async () => { if (browser) await browser.close(); });

/** Open the rendered deck and hand the page to `fn` with the kernel injected. */
async function onPage(fn, url = PAGE) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1280, height: 720 });
  await page.goto('file://' + url, { waitUntil: 'networkidle0' });
  await page.evaluate(() => document.fonts.ready);
  try { return await fn(page); } finally { await page.close(); }
}

const INJECT = `
  globalThis.trimRoleOf = ${ROLE_SRC};
  globalThis.trimBlockEl = ${FIND_SRC};
  globalThis.clearTrim = ${CLEAR_SRC};
  const measureTrim = ${MEASURE_SRC};
  const applyTrim = ${APPLY_SRC};
  const clearTrim = globalThis.clearTrim;
  const clearTrimBoxes = ${CLEAR_BOXES_SRC};
  const finalizeTrim = ${FINALIZE_SRC};
`;

describe('the TRIM DOM adapter, in real Chromium', () => {
  test('measureTrim agrees with the shipped overflow probe about WHICH boxes overflow', async () => {
    // One oracle for "does this box overflow?" (HARD RULE #1). A measurer that
    // invents a second answer is how the Playground and the Studio came to
    // disagree — and the first cut of this one DID disagree, reporting twelve
    // overflowing boxes where the probe reports six, because it counted the
    // footer band and the marker berth as content.
    const rows = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const probeSectionOverflow = ${PROBE_SRC};
      return [...document.querySelectorAll('section')].map((s, i) => ({
        page: i + 1,
        probeSaysOver: !!probeSectionOverflow(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12, ${JSON.stringify(IGNORED_CLIP_SELECTOR)}).over,
        measurerSaysOver: measureTrim(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12).boxes.length > 0,
      }));
    })()`));

    assert.ok(rows.length >= 2, 'anti-vacuity: expected a multi-slide deck');
    assert.ok(rows.some((r) => r.probeSaysOver),
      'anti-vacuity: no slide overflows, so this test would assert nothing');
    assert.ok(rows.some((r) => !r.probeSaysOver),
      'anti-vacuity: every slide overflows, so agreement is trivially satisfiable by ' +
      'a measurer that always says yes — which is exactly what counting the footer ' +
      'band and the marker berth as content produces');
    for (const r of rows) {
      assert.equal(r.measurerSaysOver, r.probeSaysOver,
        `page ${r.page}: the measurer and the shipped probe disagree about overflow`);
    }
  });


  test('chrome is never a trim candidate — not the footer band, not the marker berth', async () => {
    // THE AGREEMENT TEST ABOVE CANNOT SEE THIS, and finding that out took a
    // mutation. `measureTrim` decides "does this box overflow?" from the box's own
    // scroll dims, so removing the chrome exclusion does not change that verdict at
    // all — it changes which BLOCKS are eligible to be cut. The real invariant is
    // that the footer band and the marker berth are never candidates: they sit at
    // the bottom of every section, so a measurer that counts them makes the footer
    // "the block crossing the edge" on slide after slide, and the guard spends its
    // one cut on chrome instead of prose.
    const out = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      let candidates = 0; const chromeHits = []; let sectionBoxes = 0;
      let footerPresent = false, berthPresent = false;
      // BUILD the reachable case. On every real deck only a bounded cell overflows,
      // and the footer band is a SIBLING of .cell-stage — so nothing reaches chrome
      // and deleting the exclusion changes nothing (verified by mutation). The case
      // the guard exists for is a SECTION whose own box overflows, where the walk
      // starts at the section and the footer is a descendant. Force it.
      for (const s of document.querySelectorAll('section')) {
        const filler = document.createElement('p');
        filler.textContent = 'Forced section overflow. '.repeat(200);
        filler.style.margin = '0';
        s.appendChild(filler);
      }
      for (const s of document.querySelectorAll('section')) {
        if (s.querySelector('footer, .cell-footer')) footerPresent = true;
        if (s.querySelector('[data-lattice-berth]')) berthPresent = true;
        const model = measureTrim(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
        for (const box of model.boxes) {
          // A box whose id is the SECTION's own is the case the exclusion is for.
          if (box.id === 'box0') sectionBoxes++;
          for (const b of box.blocks) {
            candidates++;
            const el = s.querySelector('[data-trim-id="' + b.id + '"]') || s.querySelector('#' + b.id);
            if (el && el.closest('footer, .cell-footer, [data-lattice-berth]')) {
              chromeHits.push(b.role + ':' + b.id);
            }
          }
        }
      }
      return { candidates, chromeHits, sectionBoxes, footerPresent, berthPresent };
    })()`), CORPUS_PAGE);

    assert.ok(out.footerPresent || out.berthPresent,
      'anti-vacuity: this deck carries no footer band or berth, so the exclusion is untested');
    assert.ok(out.candidates > 0,
      'anti-vacuity: no trim candidates at all, so "none of them is chrome" is trivially true');
    assert.ok(out.sectionBoxes > 0,
      'anti-vacuity: no SECTION-level box overflowed, and the footer band is a sibling of ' +
      '.cell-stage — so nothing here could reach chrome even with the exclusion deleted');
    assert.deepEqual(out.chromeHits, [],
      'the guard offered a footer band or marker berth element as something to cut');
  });

  test('applyTrim clamps exactly what the plan said, and nothing else', async () => {
    const out = await onPage(async (page) => {
      const models = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        return measureTrim(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
      })()`);
      const plan = planTrim(models);
      const applied = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        applyTrim(s, ${JSON.stringify(plan)});
        return [...s.querySelectorAll('[data-lattice-trimmed]')].map((el) => ({
          id: el.id || el.getAttribute('data-trim-id'),
          clamp: getComputedStyle(el).webkitLineClamp,
          overflow: getComputedStyle(el).overflow,
          // The ROLE of the element that actually got clamped. Without this the
          // assertion cannot tell a correct clamp from one applied to the wrong
          // element: a duplicated trim id resolves to whichever element comes first
          // in document order, so a plan naming a paragraph can clamp a HEADING and
          // every id and line-count check still passes. That defect was real.
          role: trimRoleOf(el),
          tag: el.tagName,
        }));
      })()`);
      return { plan, applied };
    });

    assert.ok(out.plan.actions.length > 0,
      'anti-vacuity: the plan cut nothing, so there is no application to check');
    assert.equal(out.applied.length, out.plan.actions.length,
      'every action must produce exactly one marked element');
    for (const a of out.plan.actions) {
      const el = out.applied.find((x) => x.id === a.blockId);
      assert.ok(el, `action for ${a.blockId} did not reach the DOM`);
      assert.equal(el.clamp, String(a.lines),
        `${a.blockId}: planned ${a.lines} lines, DOM has ${el.clamp}`);
      assert.equal(el.overflow, 'hidden');
      assert.equal(el.role, a.role,
        `${a.blockId}: the plan cut a ${a.role} but the DOM clamped a ${el.role} ` +
        `(<${el.tag}>) — applyTrim resolved the id to the wrong element`);
    }
  });

  test('a plan that claims FIT actually fits once applied — model vs DOM', async () => {
    // THE ONE ASSERTION NO METAMORPHIC RELATION CAN MAKE. `planTrim` guarantees
    // fit-or-nothing over its MODEL; whether that prediction survives contact with
    // the DOM is a different claim, and it is the claim that failed on
    // `examples/overflow-guards.md` page 4 (trimmed, and still overflowing).
    //
    // It is also the only thing that catches an arithmetic slip in how the planner
    // accounts for a block's own top padding and border: omitting that term makes
    // the planner UNDER-trim and decline rather than mis-fit, so every model-level
    // relation stays green while the real box is left over by the padding it forgot.
    const out = await onPage(async (page) => {
      // GIVE THE BLOCK REAL PADDING FIRST. A card body in this engine carries
      // ~30px of top padding against a ~20px line, and that is exactly the term a
      // planner can forget. Neither the generated models nor this deck's plain
      // prose reproduce it, so the condition is built rather than hoped for —
      // four mutation rounds went by before that was the obvious move.
      await page.evaluate(`(() => {
        for (const p of document.querySelectorAll('.cell-stage p')) {
          p.style.paddingTop = '34px';
          p.style.borderTop = '6px solid transparent';
        }
      })()`);
      const model = await page.evaluate(`(() => {
        ${INJECT}
        return measureTrim(document.querySelectorAll('section')[0], ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
      })()`);
      const plan = planTrim(model);
      const after = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        applyTrim(s, ${JSON.stringify(plan)});
        return measureTrim(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12).boxes.map((b) => ({
          id: b.id, over: Math.round(b.contentBottom - b.limit),
        }));
      })()`);
      return { plan, after };
    });

    assert.ok(out.plan.fits.length > 0,
      'anti-vacuity: the planner claimed no box would fit, so there is no prediction to check');
    for (const boxId of out.plan.fits) {
      const still = out.after.find((b) => b.id === boxId);
      assert.equal(still, undefined,
        `box ${boxId} was planned as fitting but the real DOM still overflows it by ` +
        `${still?.over}px — the model and the page disagree`);
    }
  });

  test('clearTrim restores the pre-trim geometry exactly — the revert depends on it', async () => {
    // This is the mechanism behind "apply, verify, revert". If clearTrim leaves
    // the box even slightly different, a reverted slide is not the slide the
    // author wrote, and the fit-or-nothing guarantee is a fiction in the DOM.
    const out = await onPage(async (page) => {
      const geom = () => page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        return { scrollH: s.scrollHeight, clientH: s.clientHeight,
                 rects: [...s.querySelectorAll('p, li, h2')].map((e) => Math.round(e.getBoundingClientRect().height)) };
      })()`);
      const before = await geom();
      const model = await page.evaluate(`(() => {
        ${INJECT}
        return measureTrim(document.querySelectorAll('section')[0], ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
      })()`);
      const plan = planTrim(model);
      const during = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        applyTrim(s, ${JSON.stringify(plan)});
        return { scrollH: s.scrollHeight,
                 marked: s.querySelectorAll('[data-lattice-trimmed]').length,
                 stamp: s.getAttribute('data-lattice-trim') };
      })()`);
      const cleared = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        const n = clearTrim(s);
        // RESIDUE, not just geometry. A clear that resets the box display but
        // leaves the line-clamp behind restores the LAYOUT (the clamp is inert
        // without the box display) and still leaves a dirty style attribute that
        // the next apply inherits. A geometry-only assertion misses it: that exact
        // mutation survived the first version of this test.
        const residue = [...s.querySelectorAll('[style]')].map((e) => e.getAttribute('style'))
          .filter((v) => /line-clamp|box-orient|-webkit-box/.test(v));
        return { undone: n, marked: s.querySelectorAll('[data-lattice-trimmed]').length,
                 stamp: s.getAttribute('data-lattice-trim'), residue };
      })()`);
      const after = await geom();
      return { before, during, cleared, after, plan };
    });

    assert.ok(out.plan.actions.length > 0, 'anti-vacuity: nothing was trimmed, so nothing was reverted');
    assert.ok(out.during.marked > 0, 'anti-vacuity: the trim left no marks to clear');
    assert.equal(out.during.stamp, String(out.plan.actions.length), 'the record must be stamped');

    assert.equal(out.cleared.undone, out.during.marked, 'clearTrim must undo every mark it finds');
    assert.equal(out.cleared.marked, 0, 'no trim marks may survive a clear');
    assert.equal(out.cleared.stamp, null, 'the record must be removed with the trim it records');

    assert.deepEqual(out.cleared.residue, [],
      'clearTrim left trim CSS behind; the layout looks restored but the next apply inherits it');
    assert.deepEqual(out.after, out.before,
      'clearTrim did not restore the pre-trim geometry — a reverted slide would differ from the authored one');
  });

  test('a slide that fits is never touched', async () => {
    // MR4 as a DOM claim rather than a model one: `guards: strict` must not be a
    // rendering change for content that already fits.
    const out = await onPage(async (page) => {
      const model = await page.evaluate(`(() => {
        ${INJECT}
        return measureTrim(document.querySelectorAll('section')[1], ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
      })()`);
      const plan = planTrim(model);
      const touched = await page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[1];
        applyTrim(s, ${JSON.stringify(plan)});
        return { marked: s.querySelectorAll('[data-lattice-trimmed]').length,
                 stamp: s.getAttribute('data-lattice-trim'),
                 inline: [...s.querySelectorAll('*')].filter((e) => e.getAttribute('style')).length };
      })()`);
      return { model, plan, touched };
    });

    assert.equal(out.model.boxes.length, 0, 'the second slide is the control and must fit');
    assert.equal(out.plan.actions.length, 0);
    assert.equal(out.touched.marked, 0);
    assert.equal(out.touched.stamp, null);
    assert.equal(out.touched.inline, 0, 'a fitting slide must carry no inline style from the guard');
  });

  test('the whole pass is idempotent on a real slide', async () => {
    // MR2 in the DOM, through the REAL architecture: measure in the page, decide in
    // Node, apply in the page. The previous version of this test never called
    // applyTrim at all — its own comment said "apply whatever a second identical
    // measure would plan", and then did not — so deleting `applyTrim` entirely would
    // not have failed it.
    const out = await onPage(async (page) => {
      const measure = () => page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        clearTrim(s);
        return measureTrim(s, ${JSON.stringify(CLIP_CELL_SELECTOR)}, 12);
      })()`);
      const apply = (plan) => page.evaluate(`(() => {
        ${INJECT}
        const s = document.querySelectorAll('section')[0];
        applyTrim(s, ${JSON.stringify(plan)});
        return [...s.querySelectorAll('[data-lattice-trimmed]')]
          .map((e) => e.getAttribute('data-trim-id') + ':' + e.style.webkitLineClamp).sort().join(',');
      })()`);
      const m1 = await measure();
      const p1 = planTrim(m1);
      const c1 = await apply(p1);
      const m2 = await measure();
      const p2 = planTrim(m2);
      const c2 = await apply(p2);
      return { boxes1: m1.boxes.length, boxes2: m2.boxes.length,
               actions1: p1.actions.length, actions2: p2.actions.length, c1, c2 };
    });
    assert.ok(out.boxes1 > 0, 'anti-vacuity: the slide must overflow for this to mean anything');
    assert.ok(out.actions1 > 0, 'anti-vacuity: the plan must actually cut something');
    assert.equal(out.boxes2, out.boxes1, 'a clear + re-measure must be stable');
    assert.equal(out.actions2, out.actions1, 'and the second plan must match the first');
    assert.ok(out.c1.length > 0, 'anti-vacuity: something must actually be clamped');
    assert.equal(out.c2, out.c1, 'a second measure+apply must reach the identical clamp');
  });

  test('every `never` role is classified as such on a REAL element — the role table is load-bearing', async () => {
    // THE GAP A SECOND INDEPENDENT REVIEW FOUND. `trimRoleOf` decides which text may
    // be cut, which is the entire safety property of this feature, and NOTHING tested
    // it: replacing the whole function body with `return 'prose'` — making headings,
    // KPI values, code, math, citations and legal text all trimmable — left all 28
    // tests green. The one existing reference computed `trimRoleOf(el)` and compared
    // it to the role `measureTrim` produced from `trimRoleOf`, which is tautological:
    // it can catch a wrong ELEMENT, never a wrong TABLE.
    //
    // So this asserts the classification of real, laid-out elements against the
    // fixed expectations in §6. It is deliberately a table of literals, not a
    // re-derivation.
    const CASES = [
      ['<h2>Quarterly revenue</h2>', 'heading'],
      ['<pre><code>npm run build</code></pre>', 'code'],
      ['<p>Run <code>npm run build --with-a-long-flag</code> before shipping this.</p>', 'mixed'],
      ['<p>See <cite>Smith 2021</cite> for the derivation and the caveats.</p>', 'mixed'],
      ['<p>$1,234,567</p>', 'value'],
      ['<p>\u00a7 14.2 The party of the first part shall indemnify the second.</p>', 'legal'],
      ['<figcaption>A caption</figcaption>', 'caption'],
      ['<dl><dt>Term</dt></dl>', 'label'],
      ['<footer>Confidential</footer>', 'footer'],
      ['<blockquote><p>\u2014 Ada Lovelace, 1843</p></blockquote>', 'attribution'],
      ['<aside>A side note about the numbers above.</aside>', 'note'],
      ['<p>Ordinary body prose that runs on for a while without anything special.</p>', 'prose'],
      ['<ul><li>An ordinary list item, long enough to wrap on a slide.</li></ul>', 'list-item'],
    ];
    const got = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const cases = ${JSON.stringify(CASES)};
      const host = document.createElement('div');
      document.body.appendChild(host);
      return cases.map(([html]) => {
        host.innerHTML = html;
        // The element under test is the deepest one the markup names, matching what
        // the measurer's innermost-text-block walk would reach.
        const el = host.querySelector('h2, pre, figcaption, dt, footer, aside, li, blockquote > p, p');
        return el ? trimRoleOf(el) : 'MISSING';
      });
    })()`));
    for (let i = 0; i < CASES.length; i++) {
      assert.equal(got[i], CASES[i][1], `role for ${CASES[i][0]}`);
    }
    // And the table's verdict, which is the half that decides whether text is cut.
    const NEVER = ['heading', 'code', 'mixed', 'value', 'legal', 'label', 'footer',
      'attribution', 'math', 'citation', 'unclassified'];
    for (const r of NEVER) assert.equal(trimClassOf(r), 'never', `${r} must never be trimmed`);
    for (const r of ['prose', 'list-item', 'caption', 'note']) {
      assert.equal(trimClassOf(r), 'trim', `${r} must be trimmable`);
    }
    // ANTI-VACUITY: the classifier must actually discriminate. `return 'prose'` for
    // everything would satisfy nothing above, but a future refactor that collapsed
    // the table would — so pin that the cases produce more than one answer.
    assert.ok(new Set(got).size >= 8, 'the classifier must return distinct roles');
  });

  test('a failed trim is REVERTED per box, and a block with an author id is found', async () => {
    // TWO SHIPPING BUGS, both found by a second independent review, both here.
    //
    // 1. `applyTrim` resolves a block id two ways (synthetic `data-trim-id`, or the
    //    author's own `id`); the export's revert loop open-coded only the first. A
    //    block carrying an author `id` was therefore clamped and could never be
    //    undone — and the export then counted the leftover mark as success and
    //    printed the page under "Those slides FIT".
    // 2. Building the selector by concatenation (`'[data-trim-id="' + id + '"]'`)
    //    threw `SyntaxError: not a valid selector` on an author id containing `"]`,
    //    aborting the whole export with no PDF produced.
    //
    // Nothing exercised the revert at all before this test, despite this file's own
    // header claiming it did.
    const out = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const host = document.createElement('div');
      host.style.cssText = 'position:absolute;top:0;left:0;width:400px;height:80px;overflow:hidden';
      host.innerHTML = '<p id="a&quot;]" style="line-height:20px;margin:0">'
        + 'word word word word word word word word word word word word word word word '
        + 'word word word word word word word word word word word word word word word</p>';
      document.body.appendChild(host);
      const p = host.querySelector('p');
      // The plan the kernel would produce for this block, addressed by the AUTHOR's id.
      const plan = { actions: [{ boxId: 'box0', blockId: 'a"]', lines: 2, linesBefore: 8,
                                 recovered: 120, role: 'prose', chars: 100 }] };
      const found = !!trimBlockEl(host, 'a"]');
      applyTrim(host, plan);
      const clampedAfterApply = p.style.webkitLineClamp;
      clearTrimBoxes(host, plan, ['box0']);
      return {
        found,
        clampedAfterApply,
        clampedAfterRevert: p.style.webkitLineClamp,
        marksAfterRevert: host.querySelectorAll('[data-lattice-trimmed]').length,
        recordAfterRevert: host.getAttribute('data-lattice-trim'),
      };
    })()`));
    assert.equal(out.found, true, 'a block with an author id must be resolvable — and not throw');
    assert.equal(out.clampedAfterApply, '2', 'anti-vacuity: it must actually have been clamped');
    assert.equal(out.clampedAfterRevert, '', 'the revert must undo the clamp');
    assert.equal(out.marksAfterRevert, 0, 'and remove the mark');
    assert.equal(out.recordAfterRevert, null, 'and drop the record when nothing is left trimmed');
  });

  test('a per-box revert leaves a DIFFERENT box\'s trim standing', async () => {
    // The policy that now lives in the kernel, and the reason it does. The export
    // reverted per box; the runtime reverted the whole section — the export's own
    // comment calling that "the mechanism by which `guards: strict` quietly becomes
    // inert on exactly the split layouts it was meant to help". Same deck, two
    // answers, single-sourced kernel and forked policy (HARD RULE #1).
    const out = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const host = document.createElement('div');
      host.innerHTML = '<p id="L" style="line-height:20px">left</p><p id="R" style="line-height:20px">right</p>';
      document.body.appendChild(host);
      const plan = { actions: [
        { boxId: 'boxL', blockId: 'L', lines: 2, linesBefore: 8, recovered: 120, role: 'prose', chars: 10 },
        { boxId: 'boxR', blockId: 'R', lines: 3, linesBefore: 9, recovered: 120, role: 'prose', chars: 10 },
      ] };
      applyTrim(host, plan);
      const both = host.querySelectorAll('[data-lattice-trimmed]').length;
      clearTrimBoxes(host, plan, ['boxR']);          // only the RIGHT box failed
      return {
        both,
        left: host.querySelector('#L').style.webkitLineClamp,
        right: host.querySelector('#R').style.webkitLineClamp,
        marks: host.querySelectorAll('[data-lattice-trimmed]').length,
        record: host.getAttribute('data-lattice-trim'),
      };
    })()`));
    assert.equal(out.both, 2, 'anti-vacuity: both boxes must have been clamped first');
    assert.equal(out.left, '2', "the box that FITTED keeps its cut");
    assert.equal(out.right, '', 'the box that did not fit is reverted');
    assert.equal(out.marks, 1, 'exactly one clamp survives');
    assert.equal(out.record, '1', 'and the record counts what is still trimmed, not zero');
  });

  test('a fitting slide is not stamped, and finalizeTrim removes the scaffolding', async () => {
    // `measureTrim` used to stamp `data-trim-id` on every text block it walked,
    // BEFORE deciding whether the box overflowed — so a slide that fits, and that
    // this pass never touches, still carried an attribute on every paragraph, and it
    // shipped in the exported artifact. MR4's premise is that such a slide is
    // byte-identical to one rendered before this feature existed; the relation
    // models numbers and could not see it.
    const out = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const CLIP = ${JSON.stringify(CLIP_CELL_SELECTOR)};
      const secs = document.querySelectorAll('section');
      const fitting = secs[1];
      clearTrim(fitting);
      const m = measureTrim(fitting, CLIP, 12);
      return {
        boxes: m.boxes.length,
        stampedOnFitting: fitting.querySelectorAll('[data-trim-id], [data-trim-box]').length,
      };
    })()`));
    assert.equal(out.boxes, 0, 'anti-vacuity: slide 2 must be the one that fits');
    assert.equal(out.stampedOnFitting, 0,
      'a fitting slide must carry no attribute from the guard, not just no inline style');

    // And the scaffolding does not survive into a delivered artifact.
    const fin = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const CLIP = ${JSON.stringify(CLIP_CELL_SELECTOR)};
      const s = document.querySelectorAll('section')[0];
      clearTrim(s);
      measureTrim(s, CLIP, 12);
      const before = s.querySelectorAll('[data-trim-id], [data-trim-box], [data-trim-prior]').length;
      finalizeTrim(s);
      return { before, after: s.querySelectorAll('[data-trim-id], [data-trim-box], [data-trim-prior]').length };
    })()`));
    assert.ok(fin.before > 0, 'anti-vacuity: the overflowing slide must have been stamped');
    assert.equal(fin.after, 0, 'finalizeTrim must remove every scaffolding attribute');
  });
});
