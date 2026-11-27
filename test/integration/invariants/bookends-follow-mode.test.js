/**
 * THE BOOKENDS FOLLOW THE COLOR MODE, measured in real Chromium against the real bundle.
 * engineering/decisions/2026-11-23-cover-layout.md (D4a, D4b, D12).
 *
 * Title and closing paint the deck's canvas in light and the theme's brand panel (`--surface-inverse`)
 * in dark; a divider paints the accent in light and the accent dimmed into the canvas in dark. The
 * engine reaches every ink by remapping tokens (`--text-display`, `--on-dark-*`) on these slides, not
 * element by element (base.modifiers.css, "THE BOOKENDS FOLLOW THE COLOR MODE"). A remap that is
 * deleted or misnamed leaves one ink on its other-mode value (white on white), and the CSS stays
 * valid, so only a computed-value measurement sees it. The finish-canvas matrix measures the canvas;
 * this file measures the inks and the field.
 *
 * Every text ink (heading, eyebrow, subtitle, closing list, inline-code chip, a bookend table cell)
 * and the footer band must clear 4.5:1 against the section's own background, and the numbered
 * divider's hairline 3:1 (the rule floor tools/contrast-audit.js holds). Each slide must take the
 * scheme of its mode, its `::before` (the spectrum bar, a stamp) too, and paint the field the model
 * names. Measured on palettes that span the range: brand navy (indaco), warm (cuoio), achromatic
 * (onyx, a11y-protanopia), mid-gray (concrete) and a pale accent (mustard).
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');
// The theme WITH its import chain (a11y-base is a partial the a11y palettes import), flattened the way
// every analytic contrast gate reads it (tools/contrast-audit.js).
const { paletteChainCss } = require('../../../tools/contrast-audit.js');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = ['indaco', 'cuoio', 'onyx', 'a11y-protanopia', 'concrete', 'mustard'];
const MODES = ['light', 'dark'];

const FOOTER = '<span data-probe="footer" style="color:var(--marp-slide-footer-color)">Footer</span>';
const SLIDES = {
  title: (m) => `<section class="title spectrum ${m}" data-kind="cover">`
    + '<h1>A cover</h1><p><code>Eyebrow</code></p><p>A subtitle with <code>a chip</code>.</p>'
    + `<table><tbody><tr><td>A bookend table cell</td></tr></tbody></table>${FOOTER}</section>`,
  closing: (m) => `<section class="closing index ${m}" data-kind="cover">`
    + `<h2>Thank you</h2><p><code>Eyebrow</code></p><p>A closing line.</p><ul><li><code>key</code> a row</li></ul>${FOOTER}</section>`,
  divider: (m) => `<section class="divider numbered ${m}" data-kind="divider">`
    + `<p><code>Section 01</code></p><h2>A chapter starts</h2><p>A lede with <code>a chip</code>.</p>${FOOTER}</section>`,
  subsection: (m) => `<section class="divider subsection ${m}" data-kind="divider">`
    + `<p><code>Part 2</code></p><h2>A finer turn</h2><p>A lede line.</p>${FOOTER}</section>`,
};
// The fields the model names, probed as real computed colors in each mode.
const REFS = MODES.map((m) => `<section class="content ${m}" data-ref="${m}"><p>ref</p>`
  + '<i data-probe="panel" style="display:block;background:var(--surface-inverse)"></i>'
  + '<i data-probe="accent" style="display:block;background:var(--accent)"></i></section>').join('');

let browser;
let page;

describe('the bookends follow the color mode, and every ink clears its bar on the field', () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
  });
  after(async () => {
    await browser?.close();
  });

  for (const theme of THEMES) {
    test(`${theme}: title, closing, divider and subsection, light and dark`, async () => {
      const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
      const css = paletteChainCss(theme);
      const body = REFS + MODES.map((m) => Object.values(SLIDES).map((f) => f(m)).join('')).join('');
      await page.setContent(`<style>${css}\n${bundle}</style><article class="lattice">${body}</article>`);
      const res = await page.evaluate(() => {
        // Resolve any computed color the way the browser PAINTS it: draw one pixel and read it back.
        // Chromium reports a color-mix() as `oklab(…)` or `color(srgb …)`, so a regex over the numbers
        // reads the dimmed divider field as black (it did, and every dark-divider ratio with it).
        const ctx = Object.assign(document.createElement('canvas'), { width: 1, height: 1 }).getContext('2d', { willReadFrequently: true });
        const parse = (c) => {
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = '#000';
          ctx.fillStyle = c;
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          return [r, g, b, a / 255];
        };
        const lum = ([r, g, b]) => {
          const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const rgb = (c) => parse(c).slice(0, 3).map(Math.round).join(',');
        const refs = {};
        for (const r of document.querySelectorAll('[data-ref]')) {
          refs[r.dataset.ref] = {
            canvas: rgb(getComputedStyle(r).backgroundColor),
            panel: rgb(getComputedStyle(r.querySelector('[data-probe=panel]')).backgroundColor),
            accent: rgb(getComputedStyle(r.querySelector('[data-probe=accent]')).backgroundColor),
          };
        }
        const rows = [];
        for (const s of document.querySelectorAll('section:not([data-ref])')) {
          const mode = s.classList.contains('dark') ? 'dark' : 'light';
          const bgc = getComputedStyle(s).backgroundColor;
          const bg = parse(bgc);
          const row = { cls: s.className, kind: s.dataset.kind, mode, bg: rgb(bgc), scheme: getComputedStyle(s).colorScheme,
            before: getComputedStyle(s, '::before').colorScheme, inks: [] };
          const ink = (el, role, bar) => {
            if (!el) return;
            const c = parse(role === 'hairline' ? getComputedStyle(el, '::after').borderBottomColor : getComputedStyle(el).color);
            row.inks.push({ role, bar, ratio: ratio(over(c, bg), bg) });
          };
          const AAx = 4.5; // 15 px text: the AA floor; the numbered hairline is a rule, held to 3:1 below
          ink(s.querySelector('h1, h2'), 'heading', AAx);
          ink(s.querySelector('p > code'), 'eyebrow', AAx);
          const lede = [...s.querySelectorAll('p')].find((p) => !p.querySelector(':scope > code:only-child'));
          ink(lede, 'subtitle', AAx);
          ink(lede?.querySelector('code') || s.querySelector('li code'), 'chip', AAx);
          ink(s.querySelector('li'), 'list', AAx);
          ink(s.querySelector('td'), 'table cell', AAx);
          ink(s.querySelector('[data-probe=footer]'), 'footer', AAx);
          if (s.classList.contains('numbered')) ink(s.querySelector('h2'), 'hairline', 3.0);
          rows.push(row);
        }
        return { refs, rows };
      });
      const bad = [];
      for (const r of res.rows) {
        for (const i of r.inks) if (i.ratio < i.bar) bad.push(`${r.cls} ${i.role} ${i.ratio.toFixed(2)}:1 < ${i.bar} on rgb(${r.bg})`);
        if (r.scheme !== r.mode) bad.push(`${r.cls}: color-scheme ${r.scheme}, expected ${r.mode}`);
        if (r.before !== r.mode) bad.push(`${r.cls}: ::before color-scheme ${r.before}, expected ${r.mode}`);
        const ref = res.refs[r.mode];
        if (r.kind === 'cover') {
          const want = r.mode === 'light' ? ref.canvas : ref.panel;
          if (r.bg !== want) bad.push(`${r.cls}: paints rgb(${r.bg}), expected the ${r.mode === 'light' ? 'canvas' : 'brand panel'} rgb(${want})`);
        } else if (r.mode === 'light' && r.bg !== ref.accent) {
          bad.push(`${r.cls}: paints rgb(${r.bg}), expected the accent rgb(${ref.accent})`);
        } else if (r.mode === 'dark' && (r.bg === ref.canvas || r.bg === ref.accent)) {
          bad.push(`${r.cls}: paints rgb(${r.bg}), expected the accent dimmed into the canvas, not either one`);
        }
      }
      assert.deepEqual(bad, [], `${theme}: a bookend breaks the follow-the-mode contract`);
      assert.ok(res.rows.length === MODES.length * Object.keys(SLIDES).length, 'every slide was measured');
    });
  }
});
