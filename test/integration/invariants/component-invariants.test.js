/**
 * Component SEMANTIC INVARIANTS — render every component's example through the
 * real emulator and assert on the MEANING of the laid-out DOM rather than its
 * pixels. The deterministic, machine-independent successor to the pixel-golden
 * gate (P4 pivot; see
 * engineering/decisions/2026-06-12-p4-regression-gate-retire-marp.md §0).
 *
 * Invariant layers:
 *   1 · Contract  — every REQUIRED slot's manifest selector resolves on the slide
 *                   (auto-derived from each <name>.manifest.json `slots`; a new
 *                   component is covered the moment its manifest lands).
 *   2 · Universal — the slide does not overflow its 1280×720 frame, and every
 *                   heading meets WCAG AA contrast against its background.
 *   3 · Semantic  — per-component truths (see component-invariants.layer3.js):
 *                   funnel widths ∝ values, radar N series → N polygons, etc.
 *
 * WHY this isn't flaky like the pixel gate: selector matches, the overflow flag,
 * and computed colors are logical facts of the laid-out DOM — no sub-pixel AA.
 *
 * ONE RENDER, NOT ONE PER COMPONENT. Each sample is a self-contained
 * `<!-- _class: X -->` slide, so the 61 of them are 61 sections of ONE deck. This used
 * to render a one-slide deck per component, paying a Chromium launch, a navigation and
 * a PDF encode each: measured at ~150s of render against 8.7s for the batch, and 214s
 * against 17s for the whole file (engineering/decisions/
 * 2026-08-18-inspection-oracle-catalog.md §5, lever A). Every assertion therefore names
 * its OWN slide (`slideSel(slide)`) instead of a hard-coded slide 1, and `slideIndexByClass`
 * does the locating — an ordered walk, so auto-split (which turns one authored slide into
 * several sections carrying the same class) cannot shift a later component onto an
 * earlier one's section. A component the walk cannot place falls back to its own render
 * rather than being skipped.
 *
 * WHAT THE BATCH CHANGES, stated so a failure here is read correctly: a sample is no
 * longer slide 1 of a 1-slide deck. Deck-position-dependent chrome differs — a two-digit
 * page number in the footer where there used to be "1" — and one component that hangs
 * takes the batch's render down with it instead of only its own. The layout contract is
 * otherwise identical: same front matter, same theme, same `form: on`.
 *
 * Local iteration: `INV_ONLY=funnel,kpi node --test <thisfile>` renders just those.
 * Needs Chromium (CHROME_PATH / puppeteer cache) + the emulator.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const puppeteer = require('puppeteer');
const { renderHtml, deckFromSample, deckFromSamples, ROOT } = require('../../helpers/semantic-render');
const { LAYER3, TRANSFORM } = require('./component-invariants.layer3');
// The overflow oracle comes from the shared kernel, never a local comparison
// (HARD RULE #1). PROBE_SRC is the function's own source, exported for verbatim
// injection into a page.evaluate context — the same string the emulator's inline
// watcher uses, so this gate and the export warning cannot disagree.
const {
  PROBE_SRC, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR,
} = require('../../../lib/core/overflow-probe');

/** Best-effort Chromium path — mirrors color-parity.test.js / tools/screenshot.js. */
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

/** Every component manifest, sorted, optionally filtered by INV_ONLY=name,name. */
function allComponents() {
  const out = [];
  (function walk(dir) {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (ent.name.endsWith('.manifest.json')) out.push(p);
    }
  })(path.join(ROOT, 'lib', 'components'));
  let mans = out.sort().map((f) => JSON.parse(fs.readFileSync(f, 'utf8')));
  const only = (process.env.INV_ONLY || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (only.length) mans = mans.filter((m) => only.includes(m.name));
  return mans;
}

/** The slide selector for a given 1-based slide number in the rendered deck. */
const slideSel = (n) => `section[data-lattice-slide="${n}"]`;
// Mermaid samples (chart + diagram buckets) spawn mmdc per diagram — give them room.
const MERMAID = new Set(['chart', 'diagram']);
const renderTimeout = (m) => (MERMAID.has(m.function) || MERMAID.has(m.bucket) ? 240000 : 60000);

/**
 * Locate each sample's own section in the BATCHED deck.
 *
 * Every sample opens with `<!-- _class: … -->` carrying its component's name as a class
 * token (verified for all 61 shipped manifests), and the engine stamps that class onto
 * the section. So the mapping is a single ORDERED walk: for sample i, take the first
 * section at or after the cursor whose class list carries `names[i]`, then advance the
 * cursor past it.
 *
 * ORDERED, and not a global `querySelector('.name')`, for two reasons. Auto-split turns
 * one authored slide into several sections that ALL carry the same class, so a global
 * lookup would still find the first — but a component whose class token also appears on
 * an EARLIER sample's slide (a modifier two components share) would resolve to that
 * earlier slide instead. Walking forward makes each match consume its section, so the
 * i-th sample can only ever match at or after the (i-1)-th.
 *
 * Returns `number | null` per sample — null means "not found", which the caller renders
 * on its own rather than skipping.
 */
function slideIndexByClass(names) {
  const sections = [...document.querySelectorAll('section[data-lattice-slide]')];
  const out = [];
  let cursor = 0;
  for (const name of names) {
    let found = null;
    for (let i = cursor; i < sections.length; i++) {
      if (sections[i].classList.contains(name)) { found = i; break; }
    }
    if (found === null) { out.push(null); continue; }
    out.push(Number(sections[found].getAttribute('data-lattice-slide')));
    cursor = found + 1;
  }
  return out;
}

/** Force-load every embedded face, then wait for the font set to settle. */
async function settleFonts(page) {
  await page.evaluate(async () => {
    try {
      await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
      await document.fonts.ready;
    } catch { /* Font Loading API absent — proceed */ }
  });
}

/** Browser-side: WCAG contrast of every HEADING vs its nearest opaque background.
 *  Returns the worst (lowest) ratio, or null if the slide has no heading. NOTE:
 *  headings only — body-text contrast (and palette-token resolution) are phase-2
 *  (see decision §0). Headings are the highest contrast-risk surface. */
function worstHeadingContrast(slideSelector) {
  const sec = document.querySelector(slideSelector);
  if (!sec) return null;
  // Headings + blockquote (the `quote` component's focal text is a <blockquote>,
  // not an h-tag). KNOWN phase-2 gap: components whose focal text is neither —
  // notably big-number's giant figure (a styled <li>) — are not contrast-checked.
  const heads = [...sec.querySelectorAll('h1, h2, h3, blockquote')];
  if (!heads.length) return null;
  const toRgb = (c) => {
    const cv = document.createElement('canvas'); cv.width = cv.height = 1;
    const ctx = cv.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillStyle = c; ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data; return [d[0], d[1], d[2]];
  };
  const lum = ([r, g, b]) => {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  let worst = Infinity;
  for (const h of heads) {
    if (!h.textContent.trim()) continue;
    let el = h, bg = null;
    while (el) {
      const b = getComputedStyle(el).backgroundColor;
      if (b && b !== 'transparent' && !/^rgba\(0, 0, 0, 0\)/.test(b)) { bg = b; break; }
      el = el.parentElement;
    }
    const l1 = lum(toRgb(getComputedStyle(h).color));
    const l2 = lum(toRgb(bg || 'rgb(255,255,255)'));
    worst = Math.min(worst, (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
  }
  return Number.isFinite(worst) ? worst : null;
}

const COMPONENTS = allComponents();
// One deck, one slide per component. Rendering them one deck apiece cost a Chromium
// launch + navigation + PDF encode PER COMPONENT — ~150s against 8.7s batched
// (engineering/decisions/2026-08-18-inspection-oracle-catalog.md §5, lever A).
const BATCH_TIMEOUT = Math.max(...COMPONENTS.map(renderTimeout), 60000);

describe('component semantic invariants (assert meaning, not pixels)', () => {
  let browser;
  let batchPage;
  /** name → { page, slide } for every component, batched or fallback. */
  const view = new Map();
  /** Pages opened for components the batch could not place; closed with the browser. */
  const soloPages = [];

  before(async () => {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    const html = renderHtml(deckFromSamples(COMPONENTS.map((m) => m.sample)), {
      key: '_all-components',
      timeout: BATCH_TIMEOUT,
    });
    batchPage = await browser.newPage();
    await batchPage.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
    // Settle fonts before ANY layout read. The emulator's authoritative overflow pass
    // runs after document.fonts.ready, but that corrected state never reaches the .html
    // sidecar — so we mirror the settle here. Without it, overflow/contrast would measure
    // a mid-load serif fallback (timing- and proxy-dependent), reintroducing the very
    // machine-nondeterminism the pixel gate was retired for. Embedded woff2 (data-URI)
    // load without network; document.fonts.ready resolves on success OR failure, so a
    // blocked Google-Fonts <link> can't hang it.
    await settleFonts(batchPage);

    const slides = await batchPage.evaluate(slideIndexByClass, COMPONENTS.map((m) => m.name));
    for (const [i, m] of COMPONENTS.entries()) {
      if (slides[i] != null) { view.set(m.name, { page: batchPage, slide: slides[i] }); continue; }
      // FALL BACK, never skip. A component the ordered walk cannot place still owes its
      // invariants, so it gets the old one-deck-per-component treatment. This costs a
      // render, which is the point: it is visible in the suite's wall clock rather than
      // silently uncovered.
      const solo = renderHtml(deckFromSample(m.sample), { key: m.name, timeout: renderTimeout(m) });
      const page = await browser.newPage();
      soloPages.push(page);
      await page.goto(`file://${solo}`, { waitUntil: 'load', timeout: 60000 });
      await settleFonts(page);
      view.set(m.name, { page, slide: 1 });
    }
  }, { timeout: BATCH_TIMEOUT + 120000 });

  after(async () => {
    for (const p of soloPages) await p.close().catch(() => {});
    if (batchPage) await batchPage.close().catch(() => {});
    if (browser) await browser.close();
  });

  // The batch's own invariant. Every per-component assertion below is scoped by the
  // slide number this mapping produced, so a cursor bug that pointed two components at
  // one section would make BOTH of them assert against the same DOM — and the layer-1
  // slot checks would mostly still pass, because a shared frame satisfies a lot of
  // selectors. Distinctness is the property that cannot be satisfied by accident.
  test('batch mapping: every component resolved to its own slide', () => {
    const placed = [...view.entries()].filter(([, v]) => v.page === batchPage);
    const slides = placed.map(([, v]) => v.slide);
    assert.equal(new Set(slides).size, slides.length,
      `two components resolved to the same slide: ${JSON.stringify(placed.map(([n, v]) => [n, v.slide]))}`);
    // A fallback is correct, not a failure — but it costs a full render, so say so.
    if (soloPages.length) {
      const fell = [...view.entries()].filter(([, v]) => v.page !== batchPage).map(([n]) => n);
      console.error(`  ℹ ${fell.length} component(s) rendered solo (not located in the batch): ${fell.join(', ')}`);
    }
  });

  for (const m of COMPONENTS) {
    describe(`${m.function}/${m.name}`, () => {
      /** Resolved in the suite-level `before`; read fresh inside each test. */
      const at = () => {
        const v = view.get(m.name);
        if (!v) throw new Error(`no rendered view for ${m.name} — the suite-level render failed`);
        return v;
      };

      // ── Layer 1 — every required slot's selector resolves in the rendered DOM ──
      // Skipped for TRANSFORM components, whose authoring slot (e.g. a `ul > li`) is
      // CONSUMED into rendered output (an <svg> chart frame, a <table>, code panels);
      // their rendered contract is asserted by layer 3 instead.
      if (!TRANSFORM.has(m.name)) {
        for (const [slot, spec] of Object.entries(m.slots || {}).filter(([, s]) => s.required)) {
          test(`contract: required slot "${slot}" (${spec.selector}) renders`, async () => {
            const { page, slide } = at();
            const n = await page.evaluate((sel, slideSelector) => {
              const s = document.querySelector(slideSelector);
              if (!s) return -1;
              // Manifest selectors are written against the slide <section> root: a
              // leading `section` IS this element (→ :scope), a bare selector is a
              // descendant. Normalize per comma-group so `section > p, section > ul`
              // scopes to the slide instead of leaking an unscoped second clause.
              const norm = sel.split(',').map((x) => {
                x = x.trim();
                return /^section\b/.test(x) ? x.replace(/^section\b/, ':scope') : `:scope ${x}`;
              }).join(', ');
              // The Form frame's cells are TRANSPARENT to a slot contract. `mastheadLift`
              // moves the eyebrow/title into `.cell-masthead` and the body into
              // `.cell-stage`, so a contract written `section > p` is still satisfied —
              // the paragraph is a direct child of the cell the engine put it in, not of
              // the section. Count against each cell root as well as the section itself.
              const roots = [s, ...s.querySelectorAll(':scope > .cell-stage, :scope > .cell-masthead')];
              try {
                return roots.reduce((n, r) => n + r.querySelectorAll(norm).length, 0);
              } catch { return -2; }
            }, spec.selector, slideSel(slide));
            assert.ok(n >= 1, `expected ≥1 "${spec.selector}" for required slot "${slot}", got ${n}`);
          });
        }
      }

      // ── Layer 2a — content fits the frame ──
      // Measure directly (post-fonts-settle) with the emulator's TOL=12, rather
      // than trust the sidecar's early `.overflow` class (set before fonts loaded).
      //
      // THIS USED TO READ `s.scrollHeight > s.clientHeight` ON THE SECTION, AND
      // THAT ASSERTION COULD NOT FAIL — for any of the 61 components, ever. The
      // section is `overflow-y: hidden`, and a clipped box has no scroll extent,
      // so the two numbers are equal by construction. Measured on a deliberately
      // overflowing `agenda` (24 stops) that the emulator itself reports as
      // `⚠ OVERFLOW … CLIPPED`: the section read 716 === 716 while `.cell-stage`
      // held a 1760px list in a 435px box. The suite scored 6/6 on that mutant.
      //
      // The real overflow is one level in, which is exactly what the flex
      // cell-tree made true (2026-06-26-frames-as-flex-cell-trees.md): a bounded
      // content Cell CONTAINS its overflow, so the section never sees it. So the
      // oracle has to be cell-aware, and it already exists —
      // `lib/core/overflow-probe.js` is the one source of truth behind the
      // runtime ring, the export warning and autosplit. Injecting its own source
      // is what keeps this gate from becoming a fourth opinion (HARD RULE #1).
      //
      // Deliberately NOT fixed by reading the `.overflow` class: the sidecar sets
      // it before fonts load, and measuring post-settle is the whole point of
      // doing it here. See #1750.
      test('universal: slide does not overflow its frame', async () => {
        const { page, slide } = at();
        const res = await page.$eval(
          slideSel(slide),
          (s, src, clipSel, ignoreSel) => {
            // eslint-disable-next-line no-new-func
            const probe = new Function(`return (${src})`)();
            return probe(s, clipSel, 12, ignoreSel);
          },
          PROBE_SRC, CLIP_CELL_SELECTOR, IGNORED_CLIP_SELECTOR,
        );
        assert.equal(
          res.over, false,
          `slide content overflows the 1280×720 frame `
          + `(effective ${res.scrollH}px in ${res.clientH}px`
          + `${res.overCells?.length ? `; ${res.overCells.length} clip cell(s) spilling` : ''})`,
        );
      });

      // ── Layer 2b — headings meet WCAG AA contrast ──
      test('universal: heading contrast ≥ 4.5:1', async () => {
        const { page, slide } = at();
        const ratio = await page.evaluate(worstHeadingContrast, slideSel(slide));
        if (ratio === null) return; // no heading slot
        assert.ok(ratio >= 4.5, `worst heading contrast ${ratio.toFixed(2)}:1 < 4.5:1 (WCAG AA)`);
      });

      // ── Layer 3 — per-component semantic truths (opt-in) ──
      const layer3 = LAYER3[m.name];
      if (layer3) {
        for (const [label, fn] of Object.entries(layer3)) {
          test(`semantic: ${label}`, async () => {
            const { page, slide } = at();
            await fn(page, assert, slideSel(slide));
          });
        }
      }
    });
  }
});
