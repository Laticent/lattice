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
 * and computed colours are logical facts of the laid-out DOM — no sub-pixel AA.
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
const { renderHtml, deckFromSample, ROOT } = require('../../helpers/semantic-render');
const { LAYER3, TRANSFORM } = require('./component-invariants.layer3');

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

const SLIDE = 'section[data-lattice-slide="1"]';
// Mermaid samples (chart + diagram buckets) spawn mmdc per diagram — give them room.
const MERMAID = new Set(['chart', 'diagram']);
const renderTimeout = (m) => (MERMAID.has(m.function) || MERMAID.has(m.bucket) ? 240000 : 60000);

/** Browser-side: WCAG contrast of every HEADING vs its nearest opaque background.
 *  Returns the worst (lowest) ratio, or null if the slide has no heading. NOTE:
 *  headings only — body-text contrast (and palette-token resolution) are phase-2
 *  (see decision §0). Headings are the highest contrast-risk surface. */
function worstHeadingContrast() {
  const sec = document.querySelector('section[data-lattice-slide="1"]');
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

describe('component semantic invariants (assert meaning, not pixels)', () => {
  let browser;
  before(async () => {
    browser = await puppeteer.launch({
      executablePath: resolveChrome(),
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
  });
  after(async () => { if (browser) await browser.close(); });

  for (const m of allComponents()) {
    describe(`${m.function}/${m.name}`, () => {
      let page;
      before(async () => {
        const html = renderHtml(deckFromSample(m.sample), { key: m.name, timeout: renderTimeout(m) });
        page = await browser.newPage();
        await page.goto(`file://${html}`, { waitUntil: 'load', timeout: 60000 });
        // Settle fonts before ANY layout read. The emulator's authoritative
        // overflow pass runs after document.fonts.ready, but that corrected state
        // never reaches the .html sidecar — so we mirror the settle here. Without
        // it, overflow/contrast would measure a mid-load serif fallback (timing-
        // and proxy-dependent), reintroducing the very machine-nondeterminism the
        // pixel gate was retired for. Embedded woff2 (data-URI) load without
        // network; document.fonts.ready resolves on success OR failure, so a
        // blocked Google-Fonts <link> can't hang it.
        await page.evaluate(async () => {
          try {
            await Promise.all([...document.fonts].map((f) => f.load().catch(() => {})));
            await document.fonts.ready;
          } catch { /* Font Loading API absent — proceed */ }
        });
      }, { timeout: renderTimeout(m) + 30000 });
      after(async () => { if (page) await page.close(); });

      // ── Layer 1 — every required slot's selector resolves in the rendered DOM ──
      // Skipped for TRANSFORM components, whose authoring slot (e.g. a `ul > li`) is
      // CONSUMED into rendered output (an <svg> chart frame, a <table>, code panels);
      // their rendered contract is asserted by layer 3 instead.
      if (!TRANSFORM.has(m.name)) {
        for (const [slot, spec] of Object.entries(m.slots || {}).filter(([, s]) => s.required)) {
          test(`contract: required slot "${slot}" (${spec.selector}) renders`, async () => {
            const n = await page.evaluate((sel) => {
              const s = document.querySelector('section[data-lattice-slide="1"]');
              if (!s) return -1;
              // Manifest selectors are written against the slide <section> root: a
              // leading `section` IS this element (→ :scope), a bare selector is a
              // descendant. Normalise per comma-group so `section > p, section > ul`
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
            }, spec.selector);
            assert.ok(n >= 1, `expected ≥1 "${spec.selector}" for required slot "${slot}", got ${n}`);
          });
        }
      }

      // ── Layer 2a — content fits the frame ──
      // Measure directly (post-fonts-settle) with the emulator's TOL=12, rather
      // than trust the sidecar's early `.overflow` class (set before fonts loaded).
      test('universal: slide does not overflow its frame', async () => {
        const over = await page.$eval(SLIDE, (s) =>
          s.scrollHeight > s.clientHeight + 12 || s.scrollWidth > s.clientWidth + 12);
        assert.equal(over, false, 'slide content overflows the 1280×720 frame');
      });

      // ── Layer 2b — headings meet WCAG AA contrast ──
      test('universal: heading contrast ≥ 4.5:1', async () => {
        const ratio = await page.evaluate(worstHeadingContrast);
        if (ratio === null) return; // no heading slot
        assert.ok(ratio >= 4.5, `worst heading contrast ${ratio.toFixed(2)}:1 < 4.5:1 (WCAG AA)`);
      });

      // ── Layer 3 — per-component semantic truths (opt-in) ──
      const layer3 = LAYER3[m.name];
      if (layer3) {
        for (const [label, fn] of Object.entries(layer3)) {
          test(`semantic: ${label}`, async () => { await fn(page, assert, SLIDE); });
        }
      }
    });
  }
});
