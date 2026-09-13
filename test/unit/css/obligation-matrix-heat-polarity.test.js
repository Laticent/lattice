/**
 * `.heat` INVERTS THE RISK AXIS ON BOTH SURFACES THIS LAYOUT RENDERS, AND THE SPLIT ADDED THE
 * SECOND ONE.
 *
 * `obligation-matrix` shows one `[x]` / `[-]` / `[ ]` mark per cell, and the universal `.heat`
 * modifier (base.modifiers.css) flips what those marks MEAN: without it a filled mark is
 * coverage and reads green, with it a filled mark is regulatory burden and reads alarm red. The
 * slide says so in its own body copy — "Red = applies (exposure)".
 *
 * Until this component was enrolled for auto-split, it had exactly one surface: a `<table>`, and
 * base scopes the inversion to `section.heat td .state.pass`. Splitting gave it a SECOND: at
 * portrait the `cover-cards` strategy re-authors the table as one card per regime, and the marks
 * land in `<dd>`, which no `td` selector reaches. Measured on the shipped `heat` gallery slide at
 * `size: portrait`: every `[x]` came back `--pass` GREEN on all six pages, under that caption,
 * while the unsplit landscape table still read red. The risk axis inverted away on exactly the
 * surface a portrait reader now sees.
 *
 * WHY THIS IS A COMPUTED-STYLE TEST AND NOT A SPECIFICITY ONE. Both fixes are cascade fixes and
 * one of them was got wrong the first time by reasoning rather than measuring: the card selector
 * was folded in as `:is(td, .ct-card dd)`, and `:is()` takes the HIGHEST specificity of its
 * arguments, so every `td` rule silently re-ranked from (0,3,2) to (0,4,2) and beat base's heat
 * rule, which is (0,3,2) and had been winning a source-order TIE. That inverted `pass` to green
 * on the UNSPLIT table — a shipped landscape slide, nothing to do with splitting. Arithmetic
 * about `:is()` is what produced the bug; a real engine reporting a real computed value is what
 * caught it. So this asks Chromium (HARD RULE #23).
 *
 * FOUR CELLS, because the pair that matters is a pair: `pass` and `fail` must SWAP under heat,
 * on each surface. Asserting only that heat's `pass` is red would pass a stylesheet that painted
 * everything red.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');
// The DEFAULT-theme bundle: `--pass` / `--fail` are theme tokens, and a themeless page reports
// the unresolved `var()` for both, which compares equal and certifies nothing.
const CSS = path.join(ROOT, 'dist/lattice-default.css');

// The TABLE surface is what the component renders unsplit; the CARD surface is what
// `cover-cards` emits at portrait (`.lat-split-cards` + the shared `.ct-card` field list).
const SURFACES = {
  table: (cls) => `<section class="obligation-matrix ${cls} form"><table><tbody><tr>`
    + `<td><span class="state pass state-full" id="P"></span></td>`
    + `<td><span class="state fail state-full" id="F"></span></td>`
    + `</tr></tbody></table></section>`,
  card: (cls) => `<section class="obligation-matrix ${cls} lat-split-cards form"><div class="ct-card">`
    + `<dl class="ct-card-fields">`
    + `<div class="ct-field"><dt>Notice</dt><dd><span class="state pass state-full" id="P"></span></dd></div>`
    + `<div class="ct-field"><dt>Breach</dt><dd><span class="state fail state-full" id="F"></span></dd></div>`
    + `</dl></div></section>`,
};

describe('obligation-matrix: .heat inverts the risk axis on the table AND on the split card', () => {
  const exe = resolveChrome();
  let browser;
  let page;

  before(async () => {
    if (!exe) return;
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    page = await browser.newPage();
    await page.setContent(`<style>${fs.readFileSync(CSS, 'utf8')}</style>`);
  });

  after(async () => { if (browser) await browser.close(); });

  /** `--state-color` as the engine resolves it, for the `pass` and `fail` marks of one shape. */
  const read = async (surface, cls) => {
    await page.evaluate((html) => { document.body.innerHTML = html; }, SURFACES[surface](cls));
    return page.evaluate(() => {
      const of = (id) => {
        const el = document.getElementById(id);
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return { color: cs.getPropertyValue('--state-color').trim(), display: cs.display, box: r.width > 0 && r.height > 0 };
      };
      return { pass: of('P'), fail: of('F') };
    });
  };

  for (const surface of Object.keys(SURFACES)) {
    test(`${surface}: the marks are colored at all, and pass is not fail`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      const plain = await read(surface, '');
      assert.ok(plain.pass.color && plain.fail.color, `${surface}: a mark resolved no --state-color at all`);
      assert.notEqual(plain.pass.color, plain.fail.color, `${surface}: pass and fail resolved the same color`);
    });

    // A COLOR ON A BOX WITH NO AREA IS NOT A MARK. This is the defect the card surface shipped
    // first: the marks reached the DOM and every WORD was conserved, so the conservation gate saw
    // nothing, but the spans computed `display: inline` at 0x0 — a GDPR card that read Notice /
    // Consent / Retention / Breach / DSAR with nothing beside any of them.
    test(`${surface}: the mark is a laid-out disc, not a zero-area inline span`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      const plain = await read(surface, '');
      for (const [k, v] of Object.entries(plain)) {
        assert.equal(v.display, 'inline-block', `${surface}: the ${k} mark computed display:${v.display}`);
        assert.ok(v.box, `${surface}: the ${k} mark laid out with no area`);
      }
    });

    test(`${surface}: .heat SWAPS pass and fail — not merely recolors them`, async (t) => {
      if (!exe) return t.skip('no Chromium — set CHROME_PATH');
      const plain = await read(surface, '');
      const heat = await read(surface, 'heat');
      assert.equal(heat.pass.color, plain.fail.color,
        `${surface}: under .heat a filled mark must take the ALARM color the empty mark has without it`);
      assert.equal(heat.fail.color, plain.pass.color,
        `${surface}: under .heat an empty mark must take the RELIEF color the filled mark has without it`);
    });
  }

  // THE TWO SURFACES AGREE. The card exists to carry the same slide at portrait, so a reader who
  // gets the split must read the same risk the landscape reader does. This is the assertion the
  // enrollment broke and the one a future `:is()` would break again — in either direction.
  test('the split card reports the same colors as the table it was cut from', async (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH');
    for (const cls of ['', 'heat']) {
      const table = await read('table', cls);
      const card = await read('card', cls);
      assert.deepEqual(card, table, `'${cls || 'plain'}': the card surface disagrees with the table`);
    }
  });
});
