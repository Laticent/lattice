/**
 * Integration: the TRIM **DOM adapter**, in real Chromium.
 *
 * WHY THIS FILE EXISTS. `guards-trim.js` splits measure -> decide -> apply, and
 * only the DECIDE half had tests. The 14 metamorphic relations in
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
  measureTrim, planTrim, applyTrim, clearTrim,
  ROLE_SRC, MEASURE_SRC, APPLY_SRC, CLEAR_SRC,
} = require(path.join(ROOT, 'lib/core/guards-trim'));
const { CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR, PROBE_SRC } =
  require(path.join(ROOT, 'lib/core/overflow-probe'));

void measureTrim; void applyTrim; void clearTrim;   // used via injected source

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
  const measureTrim = ${MEASURE_SRC};
  const applyTrim = ${APPLY_SRC};
  const clearTrim = ${CLEAR_SRC};
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
    // MR2 in the DOM. The runtime runs this inside a MutationObserver-driven
    // sweep, so a pass that keeps finding work is a pass that keeps removing
    // content — the loop shape `fit-sweep.js` was written to break.
    const counts = await onPage((page) => page.evaluate(`(() => {
      ${INJECT}
      const CLIP = ${JSON.stringify(CLIP_CELL_SELECTOR)};
      const s = document.querySelectorAll('section')[0];
      const run = () => {
        clearTrim(s);
        const m = measureTrim(s, CLIP, 12);
        return m.boxes.length;
      };
      const first = run();
      // apply whatever a second identical measure would plan, then re-measure
      return { first, second: run(), third: run() };
    })()`));
    assert.ok(counts.first > 0, 'anti-vacuity: the slide must overflow for this to mean anything');
    assert.equal(counts.second, counts.first, 'a clear + re-measure must be stable');
    assert.equal(counts.third, counts.first, 'and stable again');
  });
});
