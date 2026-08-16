/**
 * A DARK BOOKEND'S EYEBROW STAYS LEGIBLE AT EITHER HEADING LEVEL — measured in real
 * Chromium against the real bundle.
 *
 * `title`, `closing`, and a non-`light` `divider` paint `--surface-inverse` while
 * deliberately keeping `color-scheme: light`, so every ink on them has to be named
 * explicitly (base.modifiers.css § the on-dark bindings). The inline-code eyebrow was
 * named per-component AND per-heading-level — `title h1`, `divider h2`, `closing h2` —
 * which is each component's grammar-correct level and nothing else. Write the OTHER
 * level and the selector stopped matching, so the eyebrow fell through to
 * `--text-secondary`: a light-canvas ink on a dark panel, 1.65:1 where the correct
 * pairing gives 7.19:1.
 *
 * The ink must follow the SURFACE, not the heading the author happened to type. An
 * off-grammar heading is an authoring slip the deck lint already flags; it should not
 * also silently erase the label. Found while auditing what this branch left behind.
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
