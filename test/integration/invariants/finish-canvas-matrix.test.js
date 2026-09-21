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
 * THE DARK HALF — AND THE SECOND MODIFIER, which is the half that bit.
 *
 * The matrix above covers {title, closing, divider, content} x one modifier at a time,
 * because #1656 was about three inverse bookends. Two things are outside it, and the
 * second one shipped a regression on this very branch before this arm existed.
 *
 * FIRST: `base.modifiers.css` now exempts NINE frames from the dark canvas -- those
 * three plus `topic` and the five accent covers -- so each paints a non-`--bg` surface
 * under dark and owes `--fin-canvas`. Five of them are classes the matrix never names.
 *
 * SECOND, AND THE REASON THIS ARM IS A CROSS: a slide carries more than one class. A
 * matrix that puts ONE modifier on a section cannot see a rule that out-specifies the
 * dark exemption and repaints the surface anyway --  `section.dark.spectrum-off`
 * (0,2,1), `section.dark:is(.spectrum-edge-…):not(.divider)` (0,3,1),
 * `section.accent.dark` (0,2,1), and the whole `print` remap. An unconditional `.dark`
 * re-point of `--fin-canvas` therefore pointed those rows at a color the slide does not
 * paint: measured over 11 frames x dark x 11 second modifiers, indaco, main has 14
 * mismatches and the unconditional form had 60. A `finish:` deck with `spectrum: off`
 * exported a dark title as an inverse-panel flood, and the screen and the PDF disagreed
 * -- which `main` does not do. Caught by a checker, not by either gate.
 *
 * SO THE ASSERTION IS A PINNED SET, not "no mismatches". Twelve rows are wrong today
 * and were wrong on `main`: `topic` in every mode and `lat-split-cover` in most, both
 * because they paint a non-`--bg` surface in EVERY mode while `--fin-canvas` stays
 * `var(--bg)`. Closing them changes light rendering, which is a different defect, and
 * it is tracked as #2294. Pinning the set rather than the count means a NEW mismatch
 * fails, and so does a pinned row that quietly starts passing -- when #2294 lands, this
 * list shrinks and the test tells you which rows moved.
 *
 * SECTIONS ARE BUILT THE WAY THE ENGINE EMITS THEM, carrying `data-theme` and the
 * `form` class. A bare `<section class="…">` is not the shape the renderer produces,
 * and a rule keyed on an attribute the probe omits would pass here and fail on every
 * real deck.
 */
describe('--fin-canvas follows the painted surface across dark x a second modifier', () => {
  // Every frame that paints a non-`--bg` section canvas, plus a plain content control.
  const FRAMES = [
    'title', 'closing', 'divider', 'topic',
    'decision-cover', 'compare-code-cover', 'compare-split-cover',
    'list-tabular-cover', 'split-panel-cover',
    'lat-split-cover', 'content',
  ];
  // `''` is dark alone; the rest are the canvas/register modifiers a deck can stamp
  // alongside it. The four `spectrum-edge-*` values and `accent` are the ones that
  // out-specify a frame's own canvas — they are why this is a cross and not a list.
  const SECOND = [
    '', 'print', 'spectrum-off',
    'spectrum-edge-left', 'spectrum-edge-right', 'spectrum-edge-bottom', 'spectrum-edge-off',
    'accent', 'light', 'color-light', 'color-system',
  ];

  // The rows that mismatch TODAY and mismatched identically on `main` — #2294.
  // Sorted; the assertion is a set equality, so an addition and a removal both fail.
  const KNOWN_PRE_EXISTING = [
    'lat-split-cover dark',
    'lat-split-cover dark color-light',
    'lat-split-cover dark color-system',
    'lat-split-cover dark light',
    'lat-split-cover dark print',
    'topic dark',
    'topic dark accent',
    'topic dark color-light',
    'topic dark color-system',
    'topic dark light',
    'topic dark print',
    'topic dark spectrum-off',
  ];

  let darkBrowser;
  let darkPage;
  const cases = [];
  for (const f of FRAMES) for (const m of SECOND) cases.push(m ? `${f} dark ${m}` : `${f} dark`);

  before(async () => {
    darkBrowser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    darkPage = await darkBrowser.newPage();
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const html =
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
      cases
        .map(
          (cls, i) =>
            `<section id="d${i}" data-theme="indaco" data-lattice-slide="${i + 1}" style="--theme:indaco"` +
            ` class="${cls} form finish finish-atrium"><div class="backdrop"></div>` +
            `<span id="q${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span></section>`,
        )
        .join('') +
      '</article>';
    await darkPage.setContent(html);
  });

  after(async () => {
    await darkBrowser?.close();
  });

  test('the set of surface/--fin-canvas mismatches is exactly the pre-existing one', async () => {
    const rows = await darkPage.evaluate(
      (cs) =>
        cs.map((cls, i) => ({
          cls,
          surface: getComputedStyle(document.getElementById(`d${i}`)).backgroundColor,
          canvas: getComputedStyle(document.getElementById(`q${i}`)).backgroundColor,
        })),
      cases,
    );
    assert.equal(rows.length, FRAMES.length * SECOND.length, 'every case rendered');
    const mismatched = rows.filter((r) => r.surface !== r.canvas);
    const names = mismatched.map((r) => r.cls).sort();
    const added = names.filter((n) => !KNOWN_PRE_EXISTING.includes(n));
    const fixed = KNOWN_PRE_EXISTING.filter((n) => !names.includes(n));
    const detail = (list) =>
      list
        .map((n) => {
          const r = mismatched.find((x) => x.cls === n);
          return r ? `  ${n}: surface ${r.surface} vs --fin-canvas ${r.canvas}` : `  ${n}`;
        })
        .join('\n');
    assert.deepEqual(
      added,
      [],
      'these compose a finish against a color the slide does not paint, and did NOT on '
        + `main — a regression, not a pre-existing gap:\n${detail(added)}`,
    );
    assert.deepEqual(
      fixed,
      [],
      'these are pinned as pre-existing (#2294) but now resolve correctly — good news, '
        + `remove them from KNOWN_PRE_EXISTING:\n${fixed.join('\n  ')}`,
    );
  });

  test('every exempted frame composites against its OWN surface, not the deck canvas', async () => {
    // The set assertion above passes vacuously if every row resolves to `var(--bg)`.
    // This names the surface each frame must actually reach, per frame, so a mutant
    // that makes surface and canvas equally wrong still fails.
    const EXPECT = {
      title: '--surface-inverse',
      closing: '--surface-inverse',
      divider: '--surface-inverse',
      'decision-cover': '--accent',
      'compare-code-cover': '--accent',
      'compare-split-cover': '--accent',
      'list-tabular-cover': '--accent',
      'split-panel-cover': '--accent',
    };
    // RESOLVE THE TOKEN BY PAINTING IT, not by reading it. `getPropertyValue('--accent')`
    // returns the unresolved token stream — `light-dark(#006FA8, #82C8E5)` — because a
    // custom property's value is substituted at use site, not computed at declaration.
    // Painting a span `background-color: var(--accent)` inside a dark section is what
    // turns it into the `rgb()` the section's own background can be compared against.
    const out = await darkPage.evaluate(
      (names) => {
        const probe = document.createElement('section');
        probe.className = 'content dark';
        document.querySelector('article').appendChild(probe);
        const resolved = {};
        for (const n of names) {
          const swatch = document.createElement('span');
          swatch.style.backgroundColor = `var(${n})`;
          probe.appendChild(swatch);
          resolved[n] = getComputedStyle(swatch).backgroundColor;
        }
        probe.remove();
        return { resolved };
      },
      ['--surface-inverse', '--accent', '--bg'],
    );
    const rows = await darkPage.evaluate(
      (cs) => cs.map((cls, i) => ({ cls, canvas: getComputedStyle(document.getElementById(`q${i}`)).backgroundColor })),
      cases,
    );
    const wrong = [];
    for (const [frame, token] of Object.entries(EXPECT)) {
      const row = rows.find((r) => r.cls === `${frame} dark`);
      assert.ok(row, `${frame} dark must be in the cross`);
      // The token's own computed value, read off a dark section, is what the frame's
      // `--fin-canvas` has to equal — and it must differ from the deck canvas, or the
      // assertion proves nothing.
      assert.notEqual(out.resolved[token], out.resolved['--bg'], `${token} must differ from --bg under dark`);
      if (row.canvas !== out.resolved[token]) {
        wrong.push(`  ${frame} dark: --fin-canvas ${row.canvas}, expected ${token} (${out.resolved[token]})`);
      }
    }
    assert.deepEqual(wrong, [], `a frame composites against the wrong token:\n${wrong.join('\n')}`);
  });
});
