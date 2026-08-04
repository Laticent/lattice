/**
 * FRAME-CHROME OUT-OF-FLOW invariant — the running header, the running footer and
 * the deck logo are pinned to the slide FRAME, and no slide-level treatment may
 * pull them into the content flow.
 *
 * WHY THIS EXISTS. `finish:` did exactly that, and it shipped. To put its content
 * above the backdrop layer, `base.finish.css` declared
 *
 *     section.finish > *:not(.backdrop) { position: relative; z-index: 2; }
 *
 * — where only the `z-index` was ever the intent. `position: relative` is merely how
 * a STATIC child earns a z-index, but it is not inert on a child that positions
 * ITSELF: at (0,2,1) that rule outweighed `img.deck-logo`'s own `position: absolute`
 * (0,1,1) and tied-and-beat `section.illegible > .illegible-tab` on source order.
 * The three affected elements each broke twice — `top`/`left` stopped meaning "inset
 * from the frame" and started meaning "offset from wherever I landed in flow", and
 * each began consuming flow height it was designed never to consume.
 *
 * WHAT IT COST, measured on the shipped corpus:
 *   · The running header rendered at 116px/94px where its berth is 28px/30px, on 11
 *     of the 15 slides of examples/finish-backdrops.md.
 *   · `logo-x` / `logo-y` stopped meaning anything. The contract is "the logo CENTER
 *     as a % of the slide"; every logo slide in the corpus declares `logo-x: 50` and
 *     rendered at 92.2%, with the y drifting by content height — 84 / 87.1 / 88 / 100%
 *     across all four, every one of them declaring `logo-y: 82`.
 *   · On examples/marp-export-fidelity.md p1 the logo left the frame entirely, and
 *     WAS that deck's whole 23px of overflow — which is how this surfaced: as a red
 *     `tools/check-overflow-corpus.js` on main, blamed on a bookend measure token that
 *     turned out not to be involved.
 *
 * WHY NO EXISTING GATE CAUGHT IT. The corpus ratchet is a clip oracle, and for four
 * of the five wrong slides the chrome was merely in the WRONG PLACE, not off the
 * slide — a displacement no oracle in the repo measures. `chrome-suppression.test.js`
 * beside this file asserts the chrome is HIDDEN when a token says so; nothing asserted
 * where it sits when it is shown.
 *
 * THE ASSERTION is deliberately a COMPARISON, not a coordinate: frame chrome must land
 * in the same place with and without the treatment. That states the invariant itself,
 * so it holds against any future treatment that reaches for the same `position` shortcut
 * and does not have to be re-blessed when a theme changes its frame insets.
 *
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator (HARD RULE #23 — this
 * is a cascade + layout fact, so it is asserted on a real render and nowhere else).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml } = require('../../helpers/semantic-render');

/** Best-effort Chromium path — mirrors chrome-suppression.test.js. */
function resolveChrome() {
  if (process.env.CHROME_PATH && fs.existsSync(process.env.CHROME_PATH)) return process.env.CHROME_PATH;
  for (const root of [path.join(os.homedir(), '.cache', 'puppeteer', 'chrome'), '/root/.cache/puppeteer/chrome']) {
    if (!fs.existsSync(root)) continue;
    for (const build of fs.readdirSync(root).filter((d) => d.startsWith('linux-')).sort().reverse()) {
      const bin = path.join(root, build, 'chrome-linux64', 'chrome');
      if (fs.existsSync(bin)) return bin;
    }
  }
  return undefined;
}

// CONTROL / SUBJECT pairs — identical slides but for the finish, so any difference
// between a pair is the treatment's doing and nothing else. Two frame shapes, because
// they nest the chrome differently and only one of them was ever exposed: on a Form
// `content` slide the running footer lives inside `.cell-footer` and is therefore NOT a
// direct child, so `section.finish > *` could never reach it; on a SOVEREIGN frame
// (`divider`) it is a direct child and was displaced. A one-shape test would have
// asserted the footer on the only shape where it was already safe.
// `logo:` resolves relative to the deck source, which renderHtml writes into
// .scratch/invariant-decks/, hence the climb to the repo's own asset.
const DECK = `---
marp: true
theme: indaco
header: "Running Header"
footer: "Footer Text"
logo: ../../lib/base/_logo/acme-logo.svg
logo-on: all
logo-x: 50
logo-y: 82
---

<!-- _class: content -->

## Control slide, no finish

Body copy that gives the stage real height to distribute.

---

<!-- _class: content finish finish-atrium -->

## Subject slide, carrying a finish

Body copy that gives the stage real height to distribute.

---

<!-- _class: divider -->

## Control bookend, no finish

Subtitle copy under the divider heading.

---

<!-- _class: divider finish finish-atrium -->

## Subject bookend, carrying a finish

Subtitle copy under the divider heading.
`;

// (label, control slide, subject slide) — 1-based, matching `data-lattice-slide`.
const PAIRS = [
  ['content', 1, 2],
  ['divider', 3, 4],
];

// The k-of-N split rail is the fourth piece of section-level chrome, and it needs a deck
// of its own because it only exists on a SPLIT RUN — and only docks at section level when
// the frame builds no footer Cell. `buildFooterCell` returns nothing when a deck declares
// neither `footer:` nor `paginate:` (lib/forms/cell/masthead/masthead.transform.js), so
// this front matter is the ordinary way to reach that path, not a contrived one.
//
// It is here because the first cut of the exclusion list MISSED it: that list was built
// from an empirical sweep over a probe deck with no split run, so the sweep could not see
// it. `checkFinishChromeExclusions` now guards the list statically; this guards the
// behavior on a real render.
// `size: portrait` matches examples/auto-split.md, the shipped deck that demonstrates the
// split move — the taller, narrower frame is what makes a checklist of this length actually
// exceed one page. The first test below asserts the split really fired, so this suite fails
// loudly rather than passing vacuously if that ever stops being true.
const RAIL_DECK = `---
marp: true
theme: indaco
size: portrait
autosplit: on
finish: atrium
---

<!-- _class: checklist -->

## A run long enough to split, so the k-of-N rail is emitted

${Array.from({ length: 26 }, (_, i) =>
  `- [ ] Item ${i + 1} carrying enough supporting text that the slide outgrows one page`,
).join('\n')}
`;

/** Box of `selector` inside slide `n`, in slide-relative px, plus its computed position. */
function chromeBox(page, n, selector) {
  return page.evaluate(({ n, selector }) => {
    const sec = document.querySelector(`section[data-lattice-slide="${n}"]`) || document.querySelectorAll('section')[n - 1];
    if (!sec) return null;
    const el = sec.querySelector(selector);
    if (!el) return null;
    const sr = sec.getBoundingClientRect();
    const b = el.getBoundingClientRect();
    const r = (v) => Math.round(v * 10) / 10;
    return {
      // Only a DIRECT child is reachable by `section.finish > *`; a nested one (the Form
      // footer inside `.cell-footer`) is out of that rule's range by construction.
      direct: el.parentElement === sec,
      position: getComputedStyle(el).position,
      top: r(b.top - sr.top),
      left: r(b.left - sr.left),
      // The logo contract is expressed as the mark's CENTER, as a % of the slide.
      centerXPct: r(((b.left + b.right) / 2 - sr.left) / sr.width * 100),
      centerYPct: r(((b.top + b.bottom) / 2 - sr.top) / sr.height * 100),
      withinFrame: b.bottom <= sr.bottom + 0.5 && b.right <= sr.right + 0.5,
    };
  }, { n, selector });
}

// The Form frame migrates the running footer into `.cell-footer`; sovereign frames keep
// it as a direct child. Match either, then let the assertion read `direct`.
const CHROME = [
  ['running header', 'header'],
  ['running footer', 'footer'],
  ['deck logo', 'img.deck-logo'],
];

describe('frame chrome stays out of flow under a slide finish (real render)', () => {
  let browser;
  let page;
  const chrome = resolveChrome();

  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }

  before(async () => {
    const html = renderHtml(DECK, { key: 'frame-chrome-out-of-flow' });
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    await page.evaluate(async () => {
      try {
        await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
        await document.fonts.ready;
      } catch { /* Font Loading API absent — proceed */ }
    });
  }, { timeout: 630000 });

  after(async () => { if (browser) await browser.close(); });

  for (const [shape, controlSlide, subjectSlide] of PAIRS) {
    for (const [label, selector] of CHROME) {
      test(`${shape}: ${label} stays out of flow under a finish`, async () => {
        const subject = await chromeBox(page, subjectSlide, selector);
        assert.ok(subject, `${label} should be present on the ${shape} finish slide`);
        if (!subject.direct) return; // nested chrome is out of `section.finish > *` range
        assert.equal(
          subject.position,
          'absolute',
          `${label} must stay out of flow — a treatment that forces position:relative on it ` +
          'both displaces it and makes it consume stage height (base.finish.css § stacking)',
        );
      });

      test(`${shape}: ${label} lands in the same berth with and without the finish`, async () => {
        const control = await chromeBox(page, controlSlide, selector);
        const subject = await chromeBox(page, subjectSlide, selector);
        assert.ok(control && subject, `${label} should be present on both ${shape} slides`);
        assert.equal(subject.top, control.top, `${label} top must not move when a finish is applied`);
        assert.equal(subject.left, control.left, `${label} left must not move when a finish is applied`);
      });
    }

    test(`${shape}: deck logo honors logo-x / logo-y under a finish`, async () => {
      // The directive's whole contract: the mark's CENTER, as a % of the slide. It read
      // 92.2% x — and a y that drifted with content height — while decks declared 50 / 82.
      const subject = await chromeBox(page, subjectSlide, 'img.deck-logo');
      assert.ok(subject, 'logo should be present');
      assert.ok(Math.abs(subject.centerXPct - 50) < 1, `logo-x: 50 must center the mark at ~50%, got ${subject.centerXPct}%`);
      assert.ok(Math.abs(subject.centerYPct - 82) < 1, `logo-y: 82 must place the mark at ~82%, got ${subject.centerYPct}%`);
      assert.equal(subject.withinFrame, true, 'the logo must not be pushed outside the slide frame');
    });
  }
});

// A broad deck for the DERIVED sweep below. It is not about any one component — it exists to
// put as many differently-shaped direct children under a section as one render affords, so
// the toggle has something to find. Every composition of `image` is here on purpose: the
// `clean` default re-declares `position: relative` on its own photo panel and is immune,
// which is exactly what hid `.lattice-bg` — `spotlight` and `statement` lean on the base
// rule, tie the finish rule at (0,2,1), and lost on source order. Their photo collapsed to
// height 0 and vanished, and a probe deck that only used the default composition said the
// component was fine.
const SWEEP_DECK = `---
marp: true
theme: indaco
header: "Sweep"
footer: "Sweep"
paginate: true
logo: ../../lib/base/_logo/acme-logo.svg
logo-on: all
---

${['image clean', 'image spotlight', 'image statement', 'image gallery', 'image split']
  .map((cls) => `<!-- _class: ${cls} -->\n\n![bg](../../lib/base/_logo/acme-logo.svg)\n\n## ${cls}\n\nProse over the photo.\n`)
  .join('\n---\n\n')}
---

<!-- _class: content -->

## A content slide

- One
  - Supporting detail.

A trailing sentence.

---

<!-- _class: title -->

# A title bookend

\`Eyebrow\`

A lede under the title.

---

<!-- _class: divider -->

## A divider bookend

Subtitle under the divider.

---

<!-- _class: closing -->

## A closing bookend

A sign-off line.

---

<!-- _class: quote -->

> A pulled quote that stands on its own.

— Attribution

---

<!-- _class: kpi -->

## Metrics

- 42%
  - Something measured.
- 17x
  - Something else measured.
`;

describe('DERIVED: a finish changes NO direct child\'s position, on any layout (real render)', () => {
  // THE POINT OF THIS SUITE. Everything else in this file asserts named elements, so it can
  // only catch what someone already enumerated — and enumeration is what failed twice here:
  // a six-layout probe missed `.lat-split-rail` (no split run) and `.lattice-bg` (default
  // composition immune). This asks the real cascade instead: toggle `.finish` off and on and
  // diff the computed `position` of EVERY direct child of EVERY section. It needs no list, so
  // chrome nobody has written yet is covered the day it lands — the only limit is which
  // layouts the deck above renders.
  let browser;
  let page;
  const chrome = resolveChrome();

  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }

  before(async () => {
    const html = renderHtml(SWEEP_DECK, { key: 'frame-chrome-derived-sweep' });
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
  }, { timeout: 630000 });

  after(async () => { if (browser) await browser.close(); });

  test('the sweep actually inspects a meaningful number of children', async () => {
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('section')].reduce((acc, s) => acc + s.children.length, 0));
    assert.ok(n >= 30, `expected the sweep deck to render plenty of section children, got ${n}`);
  });

  test('no direct child is re-positioned by adding a finish', async () => {
    const changed = await page.evaluate(() => {
      const out = [];
      for (const s of document.querySelectorAll('section')) {
        const kids = [...s.children];
        const had = s.classList.contains('finish');
        // `.backdrop` is the finish's own layer: it is injected only on finish sections and
        // IS meant to be positioned by that rule, so it is the one legitimate difference.
        if (!had) s.classList.add('finish');
        const withFinish = kids.map((k) => getComputedStyle(k).position);
        s.classList.remove('finish');
        const without = kids.map((k) => getComputedStyle(k).position);
        if (had) s.classList.add('finish');
        kids.forEach((k, i) => {
          if (withFinish[i] === without[i]) return;
          if (k.classList.contains('backdrop')) return;
          // `static → relative` is the rule DOING ITS JOB: a static child has to become
          // positioned before a z-index applies to it, and `relative` costs a static box
          // nothing — it neither moves nor changes what space it takes. The violation is
          // narrower and it is the whole subject of this file: an element that had ALREADY
          // positioned itself out of flow being overridden back into flow.
          if (without[i] === 'static') return;
          out.push({
            layout: s.className.replace(/\s+/g, ' ').slice(0, 40),
            el: k.tagName.toLowerCase() + (k.className ? `.${String(k.className).trim().split(/\s+/).join('.')}` : ''),
            wants: without[i],
            forcedTo: withFinish[i],
          });
        });
      }
      return out;
    });
    assert.deepEqual(changed, [],
      'a finish must not change any child\'s position. An element that positions ITSELF and is ' +
      'forced to `relative` is displaced (top/left re-base onto the flow position) AND starts ' +
      'consuming stage height. Exclude it in base.finish.css\'s `:where(…)` list.');
  });
});

describe('the k-of-N split rail stays out of flow under a finish (real render)', () => {
  let browser;
  let page;
  const chrome = resolveChrome();

  if (!chrome) {
    test('SKIPPED — no Chromium (CHROME_PATH / puppeteer cache) available', { skip: true }, () => {});
    return;
  }

  before(async () => {
    const html = renderHtml(RAIL_DECK, { key: 'frame-chrome-split-rail' });
    browser = await puppeteer.launch({
      executablePath: chrome,
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    page = await browser.newPage();
    await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
  }, { timeout: 630000 });

  after(async () => { if (browser) await browser.close(); });

  test('the deck actually produces section-level rails (else this suite asserts nothing)', async () => {
    const n = await page.evaluate(() =>
      [...document.querySelectorAll('.lat-split-rail')].filter((r) => r.parentElement === r.closest('section')).length);
    assert.ok(n > 0, 'expected at least one rail docked at section level — check the split still fires');
  });

  test('every section-level rail is absolutely positioned, finish or not', async () => {
    const bad = await page.evaluate(() =>
      [...document.querySelectorAll('.lat-split-rail')]
        .filter((r) => r.parentElement === r.closest('section'))
        .filter((r) => getComputedStyle(r).position !== 'absolute')
        .map((r) => r.closest('section').className));
    assert.deepEqual(bad, [],
      'a rail forced into flow by the finish stacking rule loses its reserved berth AND takes ' +
      'stage height from the run it is measuring (lib/core/footer-dock.js)');
  });
});
