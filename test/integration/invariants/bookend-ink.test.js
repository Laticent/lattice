/**
 * A DARK BOOKEND'S EYEBROW STAYS LEGIBLE AT EITHER HEADING LEVEL — measured in real
 * Chromium against the real bundle.
 *
 * `title`, `closing`, and a non-`light` `divider` paint `--surface-inverse`. The inline-code
 * eyebrow was named per-component AND per-heading-level — `title h1`, `divider h2`,
 * `closing h2` — which is each component's grammar-correct level and nothing else. Write
 * the OTHER level and the selector stopped matching, so the eyebrow fell through to
 * `--text-secondary`: a light-canvas ink on a dark panel, 1.65:1 where the correct
 * pairing gives 7.19:1.
 *
 * The ink must follow the SURFACE, not the heading the author happened to type. An
 * off-grammar heading is an authoring slip the deck lint already flags; it should not
 * also silently erase the label.
 *
 * WHY THOSE BOOKENDS USED TO NEED NAMING AT ALL, and why this file now checks a whole
 * class instead of one label: they painted the dark surface while leaving
 * `color-scheme: light`, so every `light-dark()` token resolved to its LIGHT side and any
 * ink not named explicitly landed light-on-dark. The eyebrow above was one of FOUR
 * hand-written rebinds papering over that, and the list was opt-in — bold body text was
 * never on it and shipped at 1.61:1 (2026-08-17-dark-surface-ink.md). Those components now
 * declare `color-scheme: dark` in the same rule that paints the surface, so the whole class
 * resolves by default.
 *
 * That fix is exactly the kind that rots quietly: delete the one-line declaration and every
 * ink goes back to being wrong, with the four explicit rebinds still passing their own
 * tests. So the second suite below sweeps the ORDINARY inline treatments an author writes —
 * plain body, bold, italic, a link, inline code — on every dark bookend, and fails if any of
 * them cannot be read. It is the closed check the enumerated list could never be.
 *
 * WCAG 1.4.3 wants 4.5:1 for body text; the eyebrow is a small-caps label, so the bar
 * here is the same 4.5 rather than the 3.0 large-text allowance.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const AA = 4.5;

/** `rgb(r g b)` is 0-255; `color(srgb r g b / a)` is 0-1. */
function parseColor(c) {
  const n = c.match(/[\d.]+/g).map(Number);
  const isSrgb = c.startsWith('color(');
  const [r, g, b] = n.slice(0, 3).map((v) => (isSrgb ? v : v / 255));
  const a = n.length > 3 ? n[3] : 1;
  return [r, g, b, a];
}
/** Composite an alpha ink over its surface — an alpha ink is not its own color. */
const over = (fg, bg) => fg.slice(0, 3).map((v, i) => v * fg[3] + bg[i] * (1 - fg[3]));
const lin = (v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const lumOf = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
function contrast(fg, bg) {
  const B = parseColor(bg);
  const [hi, lo] = [lumOf(over(parseColor(fg), B)), lumOf(B.slice(0, 3))].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

const BOOKENDS = ['title', 'closing', 'divider'];
const LEVELS = ['h1', 'h2'];

let browser;
let page;
let cases;

describe("a dark bookend's inline-code eyebrow is legible at either heading level", () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    cases = [];
    for (const c of BOOKENDS) for (const h of LEVELS) cases.push([c, h]);
    const html =
      `<style>${theme}\n${bundle}</style><article class="lattice">` +
      cases
        .map(([c, h], i) => `<section id="s${i}" class="${c}"><${h}>Heading</${h}><p id="c${i}"><code>Label text</code></p></section>`)
        .join('') +
      // The bright variant must NOT take the on-dark ink.
      '<section id="light" class="divider light"><h2>Heading</h2><p id="lightc"><code>Label text</code></p></section>' +
      '</article>';
    await page.setContent(html);
  });

  after(async () => {
    await browser?.close();
  });

  test('every bookend × heading level clears AA', async () => {
    const rows = await page.evaluate(
      (cs) =>
        cs.map(([c, h], i) => ({
          cls: `${c} ${h}`,
          ink: getComputedStyle(document.getElementById(`c${i}`)).color,
          surface: getComputedStyle(document.getElementById(`s${i}`)).backgroundColor,
        })),
      cases,
    );
    assert.equal(rows.length, BOOKENDS.length * LEVELS.length);
    const failures = rows
      .map((r) => ({ ...r, ratio: contrast(r.ink, r.surface) }))
      .filter((r) => r.ratio < AA)
      .map((r) => `  ${r.cls}: ${r.ratio.toFixed(2)}:1 — ${r.ink} on ${r.surface}`);
    assert.deepEqual(failures, [], `an eyebrow disappears into its bookend:\n${failures.join('\n')}`);
  });

  /* The ordinary inline vocabulary, on every dark bookend.
   *
   * Not a list of the things that broke — a list of what an author actually types. `strong`
   * is here because it is what was REPORTED (1.61:1, three bold words all but gone on a
   * title slide); the rest are here because nothing distinguished them from `strong` except
   * that nobody had looked yet. If a future treatment is added to the base layer and lands
   * light-on-dark, the right response is to add it to this array. */
  const INLINE = [
    ['plain body text', (t) => t],
    ['bold', (t) => `<strong>${t}</strong>`],
    ['italic', (t) => `<em>${t}</em>`],
    ['a link', (t) => `<a href="#">${t}</a>`],
    ['inline code', (t) => `<code>${t}</code>`],
  ];

  /* THE THREE SECTIONS, and deliberately NOT the split rails — the distinction is the
   * substance of this fix, not a scoping convenience.
   *
   * `--surface-inverse` is painted in five places: these three sections, plus
   * `split-panel .panel-left`, `split-panel.metric .panel-right` and
   * `split-compare .compare-left`. Only a SECTION can be fixed by declaring the scheme,
   * because `light-dark()` in a custom property resolves at computed-value time WHERE THE
   * PROPERTY IS DECLARED — and the ink tokens are declared on `section`. A rail is a
   * descendant, so by the time it could flip its own scheme the tokens it inherits are
   * already resolved sRGB values from the section's scheme. Measured: giving the rails
   * `color-scheme: dark` changes `getComputedStyle(rail).colorScheme` to `dark` and leaves
   * the body ink at 1.02:1, unchanged. That is why the rails carry explicit `--on-dark-*`
   * inks instead, and why base.modifiers.css rebinds their chip ink by hand.
   *
   * So the rails are out of scope HERE, not out of mind: their un-named inks are a real,
   * pre-existing 1.61:1 (found-not-caused, HARD RULE #18) and are logged separately. */
  const DARK_SURFACES = [
    ['title', (inner) => `<section class="title"><h2>Heading</h2>${inner}</section>`],
    ['closing', (inner) => `<section class="closing"><h2>Heading</h2>${inner}</section>`],
    ['divider', (inner) => `<section class="divider"><h2>Heading</h2>${inner}</section>`],
  ];

  /* THE CANVAS REGISTERS ARE THE AXIS THAT ACTUALLY BREAKS THIS, and leaving them out is
   * what let the first fix ship believing it had closed the class.
   *
   * `section.title` and `section.color-light` are both (0,1,1) and the bundle emits the
   * registers LAST, so each register silently outranked the component's own scheme. A deck
   * with `color-mode: light|system|inherited`, or a slide written `_class: title light`,
   * rendered the reported 1.61:1 while every test here passed — because every test here used
   * a bare class name.
   *
   * Borrowed verbatim from finish-canvas-matrix.test.js, which already sweeps this axis for
   * the same trap on the same components (#1656). Reusing its list rather than writing a
   * third one means a register added there is covered here too. `print` is included and is
   * EXPECTED to flip the surface to the ink-on-white band — the assertion below reads the
   * surface it finds rather than assuming dark, so print passes on its own terms. */
  const REGISTERS = ['', 'dark', 'light', 'print', 'color-light', 'color-system', 'color-inherited'];

  test('every inline treatment stays readable on every dark surface, under every canvas register', async () => {
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const theme = fs.readFileSync(path.join(ROOT, 'themes', 'indaco.css'), 'utf8');
    const probe = await browser.newPage();

    const combos = [];
    for (const [surf] of DARK_SURFACES) for (const reg of REGISTERS) for (const [label] of INLINE) combos.push([surf, reg, label]);

    let n = 0;
    const blocks = [];
    for (const [, wrapSurface] of DARK_SURFACES) {
      for (const reg of REGISTERS) {
        const paras = INLINE.map(([, wrap]) => `<p id="p${n++}">${wrap('Readable body copy')}</p>`).join('');
        // The register rides on the SECTION, which is where a deck actually writes it.
        blocks.push(wrapSurface(paras).replace(/^<section class="/, `<section class="${reg} `));
      }
    }
    // DOCTYPE is required: without it the probe runs in quirks mode, where the UA applies
    // `-internal-quirk-inherit` to table ink and a measurement here stops describing the
    // shipped document. Every real render writes a doctype (lattice-emulator.js).
    await probe.setContent(`<!DOCTYPE html><style>${theme}\n${bundle}</style><article class="lattice">${blocks.join('')}</article>`);

    const mode = await probe.evaluate(() => document.compatMode);
    assert.equal(mode, 'CSS1Compat', 'the probe must render in standards mode, as the engine does');

    const rows = await probe.evaluate((count) => {
      const out = [];
      for (let i = 0; i < count; i++) {
        const p = document.getElementById(`p${i}`);
        const el = p.firstElementChild || p;
        // Climb to the nearest ancestor that actually paints, so a rail's own fill is used
        // rather than the section behind it.
        let surface = 'rgba(0, 0, 0, 0)';
        for (let node = p; node; node = node.parentElement) {
          const bg = getComputedStyle(node).backgroundColor;
          if (bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg)) { surface = bg; break; }
        }
        out.push({ i, ink: getComputedStyle(el).color, surface });
      }
      return out;
    }, combos.length);
    await probe.close();

    assert.equal(rows.length, combos.length, 'every surface × register × treatment must be measured');
    const failures = rows
      .map((r) => ({ ...r, ratio: contrast(r.ink, r.surface) }))
      .filter((r) => r.ratio < AA)
      .map((r) => {
        const [surf, reg, label] = combos[r.i];
        return `  ${surf} · ${reg || 'no register'} · ${label}: ${r.ratio.toFixed(2)}:1 — ${r.ink} on ${r.surface}`;
      });
    assert.deepEqual(
      failures,
      [],
      'ink on a dark surface resolved to its light-canvas value. Either the surface lost its ' +
        '`color-scheme: dark`, or a canvas register outranked it by source order:\n' +
        `${failures.join('\n')}`,
    );
  });

  test('divider.light keeps the muted light-canvas ink, not the on-dark one', async () => {
    const r = await page.evaluate(() => ({
      ink: getComputedStyle(document.getElementById('lightc')).color,
      surface: getComputedStyle(document.getElementById('light')).backgroundColor,
      align: getComputedStyle(document.getElementById('lightc')).textAlign,
    }));
    assert.ok(contrast(r.ink, r.surface) >= AA, `divider.light eyebrow is ${contrast(r.ink, r.surface).toFixed(2)}:1`);
    assert.equal(r.align, 'center', 'the bright variant centers its eyebrow');
  });
});
