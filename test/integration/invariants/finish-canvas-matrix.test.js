/**
 * `--fin-canvas` MUST EQUAL THE SURFACE THE SLIDE ACTUALLY PAINTS — measured in real
 * Chromium against the real bundle, across bookends × canvas modifiers.
 *
 * #1656 fixed a finish washing out the three inverse bookends by naming the surface the
 * backdrop composites against. The first cut of that fix declared:
 *
 *     section:is(.title, .closing, .divider:not(.light)) { --fin-canvas: var(--surface-inverse) }
 *
 * which asserts those bookends ALWAYS paint `--surface-inverse`. They do not. `dark` and
 * `print` set `background` themselves at equal (0,1,1) specificity from
 * `base.modifiers.css`, and the bundle loads that AFTER the component sheets — so on
 * `title dark` the MODIFIER wins and the surface is the dark `--bg`, not the inverse
 * panel. The fix inverted its own bug on four combinations: an opaque `--surface-inverse`
 * wash over a darker `dark` slide, and a full-page `--print-surface-inverse` gray flood
 * across a white `print` page.
 *
 * `light` is not symmetric with them: `section.light` sets `color-scheme` only and paints
 * nothing, so a `title light` KEEPS its inverse panel — while `section.divider.light`
 * genuinely replaces the canvas. Excluding `light` from all three broke `title light`.
 *
 * Every one of those was invisible to the source-shape assertions in
 * `test/unit/palette/finish-canvas-contract.test.js` (no bare `var(--bg)`, the `:is()`
 * names the bookends): the CSS is valid either way, it just resolves to the wrong color.
 * Only a COMPUTED-VALUE comparison catches it, which is what this file is.
 *
 * Born from the red-team pass on the #1656 branch.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');

// The canvas modifiers a slide can carry alongside a component class. `''` = none.
const MODIFIERS = ['', 'dark', 'light', 'print', 'color-light', 'color-system'];
// The three inverse bookends plus an ordinary prose control that must never move.
const COMPONENTS = ['title', 'closing', 'divider', 'content'];

let browser;
let page;

describe('--fin-canvas resolves to the painted surface, on every bookend × canvas modifier', () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const cases = [];
    for (const c of COMPONENTS) for (const m of MODIFIERS) cases.push(m ? `${c} ${m}` : c);
    // Each section gets a PROBE painted `var(--fin-canvas)`. Comparing the probe's
    // computed color to the section's own background is the whole assertion — it needs
    // no knowledge of which token either side resolved through.
    const html =
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
      cases
        .map(
          (cls, i) =>
            `<section id="s${i}" class="${cls} finish finish-atrium"><div class="backdrop"></div>` +
            `<span id="p${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
        )
        .join('') +
      '</article>';
    await page.setContent(html);
    page.__cases = cases;
  });

  after(async () => {
    await browser?.close();
  });

  test('every combination composites against its own surface', async () => {
    const rows = await page.evaluate(
      (cases) =>
        cases.map((cls, i) => ({
          cls,
          surface: getComputedStyle(document.getElementById(`s${i}`)).backgroundColor,
          canvas: getComputedStyle(document.getElementById(`p${i}`)).backgroundColor,
        })),
      page.__cases,
    );
    assert.equal(rows.length, COMPONENTS.length * MODIFIERS.length, 'every case rendered');
    const mismatches = rows.filter((r) => r.surface !== r.canvas);
    assert.deepEqual(
      mismatches,
      [],
      'a finish would composite against a color the slide does not paint:\n' +
        mismatches.map((r) => `  ${r.cls}: surface ${r.surface} vs --fin-canvas ${r.canvas}`).join('\n'),
    );
  });

  test('the bookends really are inverse without a canvas modifier — the case #1656 fixed', async () => {
    const rows = await page.evaluate(
      (cases) =>
        cases.map((cls, i) => ({ cls, canvas: getComputedStyle(document.getElementById(`p${i}`)).backgroundColor })),
      page.__cases,
    );
    const byCls = Object.fromEntries(rows.map((r) => [r.cls, r.canvas]));
    // Guards against the matrix passing trivially by everything resolving to `--bg`.
    assert.notEqual(byCls.title, byCls.content, 'a plain title must NOT composite against the deck canvas');
    assert.notEqual(byCls.closing, byCls.content, 'a plain closing must NOT composite against the deck canvas');
    assert.notEqual(byCls.divider, byCls.content, 'a plain divider must NOT composite against the deck canvas');
    assert.equal(byCls['divider light'], byCls.content, 'a light divider DOES take the deck canvas');
  });
});

/**
 * THE DARK HALF, on every frame `section.dark:not(:where(...))` exempts.
 *
 * The matrix above covers {title, closing, divider, content} because #1656 was about
 * three inverse bookends. `base.modifiers.css` now exempts NINE frames from the dark
 * canvas -- those three plus `topic` and the five accent covers -- and each of them
 * paints a surface that is not `var(--bg)` under dark. Every one is a `--fin-canvas`
 * obligation, and five of them are classes the matrix above has never named.
 *
 * SEPARATE FROM THE MATRIX, on purpose. The same frames are ALSO wrong outside dark:
 * a cover paints `var(--accent)` in every mode and `topic` paints `--surface-inverse`
 * in every mode, while `--fin-canvas` stays `var(--bg)` -- 32 combinations, measured,
 * present identically on `main` and tracked as #2294. Widening the matrix's COMPONENTS
 * list would fail on those 32 immediately, so this arm asserts the half that is
 * actually true today and #2294 carries the rest. When it lands, this whole file
 * collapses into one matrix over ten frames and this block goes away.
 *
 * `lat-split-cover` is deliberately absent: it paints `var(--accent)` but is declared
 * AFTER the dark rule, so it needs no exemption there -- and its `--fin-canvas` is
 * wrong in every mode including dark, which puts it wholly in #2294.
 */
describe('--fin-canvas follows the dark canvas exemption, on every frame it names', () => {
  // The nine classes in `section.dark:not(:where(...))`, with the surface each paints.
  const EXEMPTED = [
    ['title', '--surface-inverse'],
    ['closing', '--surface-inverse'],
    ['divider', '--surface-inverse'],
    ['decision-cover', '--accent'],
    ['compare-code-cover', '--accent'],
    ['compare-split-cover', '--accent'],
    ['list-tabular-cover', '--accent'],
    ['split-panel-cover', '--accent'],
  ];

  let darkBrowser;
  let darkPage;

  before(async () => {
    darkBrowser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    darkPage = await darkBrowser.newPage();
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const html =
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
      EXEMPTED.map(
        ([cls], i) =>
          `<section id="d${i}" class="${cls} dark finish finish-atrium"><div class="backdrop"></div>` +
          `<span id="q${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
      ).join('') +
      // A plain dark content slide, to prove the assertion is not passing because
      // everything resolved to the deck canvas.
      '<section id="ctl" class="content dark finish finish-atrium"><div class="backdrop"></div>' +
      '<span id="qctl" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>' +
      '</article>';
    await darkPage.setContent(html);
  });

  after(async () => {
    await darkBrowser?.close();
  });

  test('a dark frame that keeps its own canvas composites against that canvas', async () => {
    const rows = await darkPage.evaluate(
      (n) =>
        Array.from({ length: n }, (_, i) => ({
          surface: getComputedStyle(document.getElementById(`d${i}`)).backgroundColor,
          canvas: getComputedStyle(document.getElementById(`q${i}`)).backgroundColor,
        })),
      EXEMPTED.length,
    );
    const mismatches = rows
      .map((r, i) => ({ cls: `${EXEMPTED[i][0]} dark`, expected: EXEMPTED[i][1], ...r }))
      .filter((r) => r.surface !== r.canvas);
    assert.deepEqual(
      mismatches,
      [],
      'a finish would composite against a color the dark slide does not paint:\n' +
        mismatches
          .map((r) => `  ${r.cls}: surface ${r.surface} vs --fin-canvas ${r.canvas} (should be ${r.expected})`)
          .join('\n'),
    );
  });

  test('the control proves it is not passing by everything resolving to the deck canvas', async () => {
    const out = await darkPage.evaluate(() => ({
      deck: getComputedStyle(document.getElementById('qctl')).backgroundColor,
      first: getComputedStyle(document.getElementById('q0')).backgroundColor,
      cover: getComputedStyle(document.getElementById('q3')).backgroundColor,
    }));
    assert.notEqual(out.first, out.deck, 'a dark title must NOT composite against the deck canvas');
    assert.notEqual(out.cover, out.deck, 'a dark accent cover must NOT composite against the deck canvas');
    assert.notEqual(out.first, out.cover, 'the inverse panel and the accent panel are different surfaces');
  });
});
