/**
 * A LIGHT COVER'S INKS READ ON THE LIGHT CANVAS — measured in real Chromium against the real bundle.
 *
 * `cover: light` (lib/core/resolve-cover.js) repaints title and closing on `var(--bg)` and reaches
 * their inks by remapping tokens (`--text-display`, `--on-dark-*`), not element by element
 * (base.modifiers.css, the light-cover block). A remap that is deleted or misnamed leaves one ink
 * on its dark-panel value, white on white, and the CSS stays valid, so only a computed-value
 * measurement sees it. The finish-canvas matrix measures the canvas; this file measures the ink.
 *
 * Every text ink a cover carries (heading, eyebrow, subtitle, closing list, inline-code chip, a
 * bookend table cell) must
 * clear 4.5:1 against the section's own background, and the footer band 4.5:1 too (15 px text,
 * the floor test/unit/palette/contrast.test.js holds the bookend chrome to). Measured on several
 * palettes, light and dark (a `dark` deck stamps `dark` on the cover too), and the spectrum bar's
 * `::before` must take the light scheme.
 */

const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const THEMES = ['indaco', 'cuoio', 'onyx', 'concrete', 'mustard'];
const MODES = ['', 'dark'];
const AA = 4.5;

const TITLE = (extra) => `<section class="title cover-light spectrum ${extra}">`
  + '<h1>A light cover</h1><p><code>Eyebrow</code></p><p>A subtitle with <code>a chip</code>.</p>'
  + '<table><tbody><tr><td>A bookend table cell</td></tr></tbody></table>'
  + '<span data-probe="footer" style="color:var(--marp-slide-footer-color)">Footer</span></section>';
const CLOSING = (extra) => `<section class="closing cover-light index ${extra}">`
  + '<h2>Thank you</h2><p><code>Eyebrow</code></p><p>A closing line.</p><ul><li><code>key</code> a row</li></ul>'
  + '<span data-probe="footer" style="color:var(--marp-slide-footer-color)">Footer</span></section>';

let browser;
let page;

describe('a light cover\'s inks clear AA on the light canvas', () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
  });
  after(async () => {
    await browser?.close();
  });

  for (const theme of THEMES) {
    test(`${theme}: heading, eyebrow, subtitle, list, chip and footer`, async () => {
      const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
      const css = fs.readFileSync(path.join(ROOT, 'themes', theme, `${theme}.css`), 'utf8');
      // A plain content slide is the reference light canvas (concrete's is a mid gray, so no
      // fixed threshold names "light").
      const body = '<section class="content" data-ref="1"><p>ref</p></section>' + MODES.map((m) => TITLE(m) + CLOSING(m)).join('');
      await page.setContent(`<style>${css}\n${bundle}</style><article class="lattice">${body}</article>`);
      const rows = await page.evaluate(() => {
        // Composite an rgba ink over the section's opaque background, then the WCAG ratio.
        // `rgb(r g b / a)` carries 0-255 channels; `color(srgb r g b / a)` (what Chromium reports for a
        // color-mix() ink) carries 0-1 ones, so scale those.
        const parse = (c) => {
          const n = (c.match(/[\d.]+/g) || []).map(Number);
          return c.startsWith('color(srgb') ? [n[0] * 255, n[1] * 255, n[2] * 255, n[3]] : n;
        };
        const lum = ([r, g, b]) => {
          const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const over = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)); };
        const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
        const out = [];
        const ref = getComputedStyle(document.querySelector('[data-ref]')).backgroundColor;
        out.push({ role: 'ref', bg: ref });
        for (const s of document.querySelectorAll('section:not([data-ref])')) {
          const bg = parse(getComputedStyle(s).backgroundColor);
          const ink = (el, role) => {
            const c = parse(getComputedStyle(el).color);
            out.push({ cls: s.className, role, ratio: ratio(over(c, bg), bg), bg: bg.join(','), scheme: getComputedStyle(s).colorScheme });
          };
          ink(s.querySelector('h1, h2'), 'heading');
          ink(s.querySelector('p > code'), 'eyebrow');
          ink(s.querySelectorAll('p')[1], 'subtitle');
          ink(s.querySelectorAll('p')[1].querySelector('code') || s.querySelector('li code'), 'chip');
          if (s.querySelector('li')) ink(s.querySelector('li'), 'list');
          // `section:is(.title, …) > table td` reads `--on-dark-primary`, the remap a chip does not exercise.
          if (s.querySelector('td')) ink(s.querySelector('td'), 'table cell');
          ink(s.querySelector('[data-probe=footer]'), 'footer');
          const before = getComputedStyle(s, '::before');
          out.push({ cls: s.className, role: '::before scheme', scheme: before.colorScheme });
        }
        return out;
      });
      const bad = rows.filter((r) => r.ratio !== undefined && r.ratio < AA);
      assert.deepEqual(bad.map((r) => `${r.cls} ${r.role} ${r.ratio.toFixed(2)}:1 on rgb(${r.bg})`), [],
        `${theme}: an ink on a light cover is under ${AA}:1`);
      const refBg = rows.find((x) => x.role === 'ref').bg;
      for (const r of rows.filter((x) => x.ratio !== undefined)) {
        assert.equal(r.scheme, 'light', `${theme}: ${r.cls} must be color-scheme: light`);
        assert.equal(`rgb(${r.bg.split(',').slice(0, 3).join(', ')})`, refBg, `${theme}: ${r.cls} must paint the deck's light canvas`);
      }
      for (const r of rows.filter((x) => x.role === '::before scheme')) {
        assert.equal(r.scheme, 'light', `${theme}: ${r.cls} ::before (the spectrum bar, a stamp) must take the light scheme`);
      }
    });
  }
});
