/**
 * finish-ink-matrix.test.js — a finish's INK reads against the surface it is drawn on (#2305).
 *
 * `--fin-canvas` names the surface a finish composites against; `--field-accent` names the color it
 * draws its grid, contours, glow and mark in (lib/base/base.finish.css). Every preset drew in
 * `var(--accent)`, which is invisible on the six split covers that paint `var(--accent)` as
 * their field — and those covers only started carrying a finish when the splitter learned to
 * keep the deck's surface registers (lib/core/surface-registers.js). Measured before the token
 * existed: atrium on an indaco `lat-split-cover` changed 0.06% of the page's pixels, all of them
 * in the spectrum bar. The backdrop was in the DOM and painted nothing a reader could see.
 *
 * The assertion is a contrast floor between the two resolved tokens, on every theme, for every
 * accent-field cover (stamped and unstamped, every `cat-N` tint split-panel knows) under every
 * canvas modifier, plus the ordinary frames as a control. A PROBE paints each token, so the
 * test needs no knowledge of which token either side resolves through. 3:1 is WCAG's
 * non-text floor (1.4.11): a finish is decoration, but a finish drawn below it is a finish
 * the author asked for and cannot see.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const puppeteer = require('puppeteer');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.join(__dirname, '..', '..', '..');
const FLOOR = 3;
const MODIFIERS = ['', 'dark', 'light', 'print', 'color-light', 'color-system'];
const COVERS = [
  'content lat-split-cover form',
  'content decision-split decision-cover form',
  'content compare-code-cover form',
  'content compare-split-cover form',
  'content list-tabular-cover form',
  'content split-panel-split split-panel-cover form',
];
const CONTROLS = ['content', 'title', 'closing', 'divider'];
const CATS = [1, 2, 3, 4, 5, 6, 7, 8].map((n) => `cat-${n}`);
const THEMES = fs.readdirSync(path.join(ROOT, 'themes'))
  .filter((f) => f.endsWith('.css') && f !== 'a11y-base.css')
  .map((f) => f.replace(/\.css$/, ''));

function cases() {
  const out = [];
  for (const m of MODIFIERS) {
    for (const c of CONTROLS) out.push({ cls: `${c} ${m}`.trim(), attrs: '' });
    for (const c of COVERS) {
      out.push({ cls: `${c} ${m}`.trim(), attrs: '' });
      out.push({ cls: `${c} ${m}`.trim(), attrs: ' data-split-role="cover"' });
    }
    for (const cat of CATS) {
      out.push({ cls: `content split-panel-split split-panel-cover form ${m}`.trim(), attrs: ` data-split-role="cover" data-split-mods="${cat}"` });
    }
  }
  return out;
}

// A theme chains to its parent with `@import '<parent>'` (every `-dark` palette, every a11y
// sheet), and a `<style>` cannot resolve that — inline the chain, parent first, and drop
// `@import 'lattice'`, which is the bundle this test already inlines once.
function themeSheet(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  const css = fs.readFileSync(path.join(ROOT, 'themes', `${name}.css`), 'utf8');
  return css.replace(/@import\s+['"]([\w-]+)['"]\s*;/g, (_, dep) => (dep === 'lattice' ? '' : themeSheet(dep, seen)));
}

let browser;
let page;

describe('--field-accent reads against --fin-canvas on every accent-field cover, on every theme', () => {
  before(async () => {
    browser = await puppeteer.launch({ executablePath: resolveChrome(), args: ['--no-sandbox'] });
    page = await browser.newPage();
  });
  after(async () => {
    await browser?.close();
  });

  test(`every cover's finish ink clears ${FLOOR}:1 against its canvas`, async () => {
    const bundle = fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8');
    const all = cases();
    const failures = [];
    let measured = 0;
    let coversAtAccent = 0;
    let barsMeasured = 0;
    for (const theme of THEMES) {
      const css = themeSheet(theme);
      const html =
        `<style>${css}\n${bundle}</style><article class="lattice">` +
        all.map(({ cls, attrs }, i) =>
          `<section id="s${i}" class="${cls} finish finish-atrium"${attrs}><div class="backdrop"></div>` +
          `<span id="c${i}" style="background-color:var(--fin-canvas);display:block;width:4px;height:4px"></span>` +
          `<span id="k${i}" style="background-color:var(--field-accent);display:block;width:4px;height:4px"></span>` +
          `<span id="b${i}" style="background-image:var(--sp-fill-solid-h);display:block;width:4px;height:4px"></span></section>`,
        ).join('') + '</article>';
      await page.setContent(html);
      const rows = await page.evaluate((n) => {
        // Resolve any color the engine emits (color-mix, color(), rgb) through a 1x1 canvas.
        const cv = document.createElement('canvas');
        cv.width = cv.height = 1;
        const ctx = cv.getContext('2d', { willReadFrequently: true });
        // An unparseable color would leave the PREVIOUS fill in place and score the last row's
        // color instead, so one that the engine cannot parse reads as black, explicitly.
        const rgb = (c) => { ctx.clearRect(0, 0, 1, 1); ctx.fillStyle = CSS.supports('color', c) ? c : '#000'; ctx.fillRect(0, 0, 1, 1); return [...ctx.getImageData(0, 0, 1, 1).data].slice(0, 3); };
        const lum = ([r, g, b]) => {
          const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
          return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
        };
        const out = [];
        for (let i = 0; i < n; i++) {
          const s = document.getElementById(`s${i}`);
          const canvas = getComputedStyle(document.getElementById(`c${i}`)).backgroundColor;
          const ink = getComputedStyle(document.getElementById(`k${i}`)).backgroundColor;
          const accent = getComputedStyle(s).getPropertyValue('--accent').trim();
          // The `spectrum: solid` bar's fill, read off the resolved gradient's first stop.
          const bar = (getComputedStyle(document.getElementById(`b${i}`)).backgroundImage.match(/rgba?\([^)]*\)|color\([^)]*\)/) || ['transparent'])[0];
          const cr = (x, y) => { const [p, q] = [lum(rgb(x)), lum(rgb(y))]; return (Math.max(p, q) + 0.05) / (Math.min(p, q) + 0.05); };
          out.push({ canvas, ink, bar, ratio: cr(canvas, ink), barRatio: cr(canvas, bar), canvasIsAccent: rgb(canvas).join() === rgb(accent).join() });
        }
        return out;
      }, all.length);
      rows.forEach((r, i) => {
        measured += 1;
        if (/cover/.test(all[i].cls) && r.canvasIsAccent) coversAtAccent += 1;
        if (r.ratio < FLOOR) failures.push(`  ${theme}: ${all[i].cls}${all[i].attrs} — ink ${r.ink} on ${r.canvas} = ${r.ratio.toFixed(2)}:1`);
        // The spectrum bar rides the same swap and draws in the same token. A theme that pins
        // its own `--spectrum-solid` owns that choice, so the bar is held to the floor only
        // where it resolves through `--field-accent`.
        if (r.bar === r.ink && r.barRatio < FLOOR) failures.push(`  ${theme}: ${all[i].cls}${all[i].attrs} — solid bar ${r.bar} on ${r.canvas} = ${r.barRatio.toFixed(2)}:1`);
        if (r.bar === r.ink) barsMeasured += 1;
      });
    }
    // Guards against a pass by vacuity: the matrix must actually contain accent-field covers.
    assert.ok(coversAtAccent > THEMES.length, `only ${coversAtAccent} cover rows composited on the accent — the matrix is not measuring its subject`);
    assert.ok(barsMeasured > all.length, `only ${barsMeasured} rows resolved the solid bar through --field-accent — the bar column is not measuring anything`);
    assert.deepEqual(failures, [], `${failures.length} of ${measured} rows draw a finish the reader cannot see:\n${failures.join('\n')}`);
  });
});
