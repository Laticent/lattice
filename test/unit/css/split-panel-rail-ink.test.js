/**
 * split-panel-rail-ink — the k-of-N rail's contrast against the corner it actually sits on,
 * measured across PALETTES rather than argued from one.
 *
 * WHY THIS FILE EXISTS. The four rail-ink rules in `split-panel.styles.css` each claim that a
 * particular field holds the bottom-right corner of a coverless split page, and pick a token to
 * match: `--on-dark-secondary` for a panel, `--on-accent` under `watermark`, `--cat-on-fill`
 * under a categorical tint, and `inherit` where the corner is the frame's own canvas. Those
 * claims were derived from a 33-palette sweep and then written down in a decision record as
 * PROSE. Nothing in the tree re-derived them, so both fixtures in
 * `split-panel-coverless-band.test.js` hardcode `theme: indaco` and a palette or token
 * regression in any of the four inks would pass every one of its arms.
 *
 * This file is the other axis: a small variant x palette matrix, measured on real renders
 * through `dist/lattice-emulator.js`, asserting the rail clears WCAG 1.4.11's 3:1 against the
 * field behind it. It is also where `split-panel-coverless-band.test.js`'s
 * SANCTIONED_UNCOVERED entries point — `steps`, `watermark` and the categorical tints are
 * measured HERE, because the question they raise is contrast across palettes, not band geometry
 * across sizes, and rendering them in that file would quadruple its runtime to re-measure one
 * declaration.
 *
 * THE MEASURE. Contrast is computed from the COMPOSITED colors: the rail's segments carry
 * `opacity` (0.7 for an off pill), so the ink that reaches the eye is the token blended onto the
 * field. Reading the raw token and skipping the blend is how an earlier probe reported
 * white-on-navy as 1.71:1 when it measures 7.19 — it scraped digits out of
 * `color(srgb 1 1 1 / 0.76)` and read the components as 0-255 rather than 0-1. Both the blend
 * and that parse are handled below, and the parser is exercised on the `color(srgb ...)` form by
 * its own arm so the bug cannot come back silently.
 */

const { describe, test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { resolveChrome } = require('../../../tools/lib/resolve-chrome');

const ROOT = path.resolve(__dirname, '../../..');
const EMU = path.join(ROOT, 'dist/lattice-emulator.js');

// The variants whose rail-ink rules make a DIFFERENT claim about the corner field. `''` is the
// plain mirrored panel (`--on-dark-secondary`), `metric` and `steps` invert or repaint it
// (`inherit`), `watermark` fills it with the accent (`--on-accent`), `cat-3` with a categorical
// tint (`--cat-on-fill`). All are mirrored, because that is the shape in which the panel — not
// the canvas — holds the corner.
const VARIANTS = ['', 'metric', 'steps', 'watermark', 'cat-3'];

// Light and dark of the palettes whose measured floors drove the rules, plus the achromatopsia
// base, whose neutral fields are the hardest case for an alpha-blended ink.
const PALETTES = ['indaco', 'indaco-dark', 'cuoio', 'cuoio-dark', 'laguna', 'a11y-achromatopsia'];

// Measured cells that sit under 3:1 for a reason that is NOT this layout's, each with its number.
// The rail's segment alpha is shared engine-wide (`.lat-split-rail .seg`, 0.7) and it meets
// `--bg-alt` at 2.97:1 on cuoio INDEPENDENT of component — the same ink measures 3.11 on `--bg`,
// and `base.modifiers.css` tuned that 0.7 against `--bg` with 0.11 of headroom. A one-token fix
// (`--text-heading` at 0.7) measures 5.94 and was declined: it would darken one layout's rail
// against every other split page to patch a shared alpha whose home is the base rule.
// Keyed `palette|variant`. The arm fails on a STALE entry, so a fixed cell cannot keep its pass.
const SANCTIONED_BELOW = {
  'cuoio|steps': 2.97,
};
const FLOOR = 3.0;

const deck = (palette, variant) => `---
marp: true
theme: ${palette}
size: portrait
---

<!-- _class: split-panel pullquote mirror${variant ? ` ${variant}` : ''} -->

> pullquote gives half the slide to one voice, and the other half to what it means.

\`split-panel · the layout, quoted\`

- The quote claims
  - Display italic on the dark panel; keep it under twenty-five words.
- The column interprets
  - Two items that say why the words matter, not who said them again.
- A third reading
  - And a third clause to match.
`;

describe('split-panel: the k-of-N rail clears 3:1 on the field it sits on, across palettes', () => {
  const exe = resolveChrome();
  let browser;
  let p;
  let dir;
  const rendered = new Map();

  before(async () => {
    if (!exe) return;
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lat-railink-'));
    for (const palette of PALETTES) {
      for (const variant of VARIANTS) {
        const key = `${palette}|${variant}`;
        const md = path.join(dir, `${palette}${variant || 'plain'}.md`);
        const html = path.join(dir, `${palette}${variant || 'plain'}.html`);
        fs.writeFileSync(md, deck(palette, variant));
        execFileSync(process.execPath, [EMU, md, html, '-q'], { stdio: 'ignore' });
        rendered.set(key, html);
      }
    }
    const puppeteer = require('puppeteer-core');
    browser = await puppeteer.launch({ executablePath: exe, args: ['--no-sandbox', '--disable-dev-shm-usage'] });
    p = await browser.newPage();
  });

  after(async () => {
    if (browser) await browser.close();
    if (dir) fs.rmSync(dir, { recursive: true, force: true });
  });

  /** Every rail segment on every coverless page, with its composited contrast. */
  const measure = async (key) => {
    await p.goto(`file://${rendered.get(key)}`, { waitUntil: 'networkidle0' });
    return p.evaluate(() => {
      // `color(srgb r g b / a)` carries 0-1 COMPONENTS; `rgb(r g b / a)` carries 0-255. Reading
      // the first as the second turns white into near-black and reports a passing pair as
      // failing. Returns [r,g,b,a] with rgb in 0-255.
      const parse = (v) => {
        const srgb = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/i.exec(v);
        if (srgb) return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]];
        const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i.exec(v);
        if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]];
        return null;
      };
      const over = (fg, bg) => fg.slice(0, 3).map((c, i) => c * fg[3] + bg[i] * (1 - fg[3]));
      const lum = (c) => {
        const [r, g, b] = c.map((v) => {
          const s = v / 255;
          return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
        });
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
      };
      const ratio = (a, b) => {
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
      };
      // THE FIELD IS GEOMETRIC, NOT ANCESTRAL, and that distinction is the whole rule. The rail
      // is `position: absolute` at SECTION level, so its DOM parent chain runs rail -> section and
      // skips the panels entirely — walking it reports the section's canvas as the field on every
      // page, which is white on a light palette and turns a passing white-on-navy pill into a
      // failure. The four rail-ink rules each claim a different box HOLDS THE BOTTOM-RIGHT
      // CORNER; that claim is about overlap, so answer it by containment of the rail's center.
      const bgOf = (start) => {
        let n = start;
        while (n && n !== document.documentElement) {
          const bg = parse(getComputedStyle(n).backgroundColor);
          if (bg && bg[3] > 0.99) return bg;
          n = n.parentElement;
        }
        return [255, 255, 255, 1];
      };
      const fieldOf = (el, section) => {
        const r = el.getBoundingClientRect();
        const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
        for (const sel of ['.panel-left', '.panel-right']) {
          const panel = section.querySelector(sel);
          if (!panel) continue;
          const b = panel.getBoundingClientRect();
          if (cx >= b.left && cx <= b.right && cy >= b.top && cy <= b.bottom) return bgOf(panel);
        }
        // Not over a panel — an insetting Form frame lifts both off the corner and the field is
        // the section's own canvas. That is exactly what the `form` arm's `inherit` relies on.
        return bgOf(section);
      };
      const out = [];
      document.querySelectorAll('section.split-panel.lat-split-native').forEach((s, i) => {
        const rail = s.querySelector('.lat-split-rail');
        if (!rail) return;
        const field = fieldOf(rail, s);
        // EVERY segment, not `querySelector('.seg')` — `auto-split.js` marks segments 0..k as
        // `on`, so the first is ALWAYS the opaque one and a single-element read has never
        // measured the 0.7-alpha OFF pills that `base.modifiers.css` spends forty lines tuning.
        rail.querySelectorAll('.seg').forEach((seg, j) => {
          const cs = getComputedStyle(seg);
          const ink = parse(cs.color);
          if (!ink) return;
          const alpha = ink[3] * (parseFloat(cs.opacity) || 1);
          const composited = over([ink[0], ink[1], ink[2], alpha], field);
          out.push({
            page: i + 1, seg: j, on: seg.classList.contains('on'),
            ratio: +ratio(composited, field).toFixed(2),
          });
        });
      });
      return out;
    });
  };

  test('the color parser reads both notations, so a passing pair cannot read as failing', async (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH');
    await p.goto(`file://${rendered.get(`${PALETTES[0]}|`)}`, { waitUntil: 'networkidle0' });
    const got = await p.evaluate(() => {
      const parse = (v) => {
        const srgb = /color\(\s*srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)(?:\s*\/\s*([\d.]+))?/i.exec(v);
        if (srgb) return [+srgb[1] * 255, +srgb[2] * 255, +srgb[3] * 255, srgb[4] === undefined ? 1 : +srgb[4]];
        const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,\s/]+([\d.]+))?/i.exec(v);
        if (rgb) return [+rgb[1], +rgb[2], +rgb[3], rgb[4] === undefined ? 1 : +rgb[4]];
        return null;
      };
      return { srgb: parse('color(srgb 1 1 1 / 0.76)'), rgb: parse('rgba(255, 255, 255, 0.76)') };
    });
    assert.deepEqual(got.srgb, [255, 255, 255, 0.76],
      'the `color(srgb …)` form must scale 0-1 components to 0-255 — reading them raw is what '
      + 'reported white-on-navy as 1.71:1 when it measures 7.19');
    assert.deepEqual(got.rgb, [255, 255, 255, 0.76]);
  });

  for (const palette of PALETTES) {
    for (const variant of VARIANTS) {
      test(`${palette} | ${variant || 'plain'} mirror: every rail segment clears ${FLOOR}:1`, async (t) => {
        if (!exe) return t.skip('no Chromium — set CHROME_PATH');
        const cells = await measure(`${palette}|${variant}`);
        assert.ok(cells.length > 0, 'no rail segments were measured — the deck did not split');
        const sanction = SANCTIONED_BELOW[`${palette}|${variant}`];
        const worst = Math.min(...cells.map((c) => c.ratio));
        if (sanction !== undefined) {
          // A sanctioned cell still has to be no WORSE than what was measured and accepted.
          assert.ok(worst >= sanction - 0.05,
            `${palette} | ${variant}: the rail got worse than its recorded floor — `
            + `${worst}:1 against a sanctioned ${sanction}:1`);
          return;
        }
        const bad = cells.filter((c) => c.ratio < FLOOR);
        assert.deepEqual(bad, [],
          `${palette} | ${variant || 'plain'} mirror: ${bad.length} of ${cells.length} rail `
          + `segments under ${FLOOR}:1 (worst ${worst}:1) — the rail is taking the wrong ink for `
          + `the field that holds the corner. Cells: ${JSON.stringify(bad)}`);
      });
    }
  }

  test('no sanctioned cell is stale — a fixed one must lose its exemption', async (t) => {
    if (!exe) return t.skip('no Chromium — set CHROME_PATH');
    const stale = [];
    for (const [key, floor] of Object.entries(SANCTIONED_BELOW)) {
      const cells = await measure(key);
      const worst = Math.min(...cells.map((c) => c.ratio));
      if (worst >= FLOOR) stale.push({ key, worst, floor });
    }
    assert.deepEqual(stale, [],
      `these cells now clear ${FLOOR}:1 and no longer need an exemption — delete them from `
      + `SANCTIONED_BELOW: ${JSON.stringify(stale)}`);
  });
});
