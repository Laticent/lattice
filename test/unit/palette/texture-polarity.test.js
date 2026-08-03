/**
 * Unit: on a textured palette, a slide's label ink is legible on the chip that
 * ACTUALLY paints under that slide's color-scheme.
 *
 * WHY THIS GATE EXISTS (#1323). Categorical node fill is
 * `var(--cat-N-texture, var(--cat-N-fill))`, so on a textured palette the chip a
 * reader sees is an SVG `<pattern>` — NOT the `--cat-N-fill` token. A `<pattern>`
 * is page-level and paints identically wherever it is referenced, so it cannot
 * track a PER-SLIDE `color-scheme`. Meanwhile the label ink (`--cat-on-fill`) is
 * an ordinary inherited property and flips per section just fine.
 *
 * That asymmetry is the bug: a `_class: dark` slide flipped its ink to the dark
 * arm while its chip stayed light-mode, and every diagram node label went
 * light-on-light. It shipped on 6 palettes (concrete, onyx, and the four a11y-*
 * that `@import` onyx) and nothing caught it, because the two halves are checked
 * — when they are checked at all — in different places:
 *
 *   - `token-parity` asserts the tokens EXIST.
 *   - `accessibility-textures` byte-locks the pattern SUPPLY.
 *   - nothing joined the two and asked "is the ink readable on the chip?"
 *
 * So this test resolves the join the renderer actually performs: for each themed
 * palette and each scheme-PINNING section class, follow `--cat-N-texture` to the
 * pattern it selects, read the fill BAKED INTO that pattern, and check the ink
 * the same slide would paint. Reading the baked fill (rather than the token) is
 * the whole point — the token was never what was wrong.
 *
 *   ink on baked chip >= 4.5:1   — WCAG 1.4.3, it is node label text
 *
 * `color-system` / `inherited` are deliberately NOT covered: their polarity is
 * only known at view time, so they keep the scheme-aware set and no static
 * assertion is possible. `print` has its own B&W-safe override and its own gate.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { resolveTokenExpr } = require('../../../lib/core/resolve-token-expr');
const { texturePatternDefs } = require('../../../lib/core/accessibility-textures');

const ROOT = path.join(__dirname, '..', '..', '..');
const AA_TEXT = 4.5;

/**
 * The textured palettes, and the import chain each one's tokens resolve through.
 * a11y-base @imports onyx, and each a11y-<type> @imports a11y-base — later files
 * win, which is exactly how the a11y set re-asserts itself over onyx's pins.
 */
const TEXTURED = [
  { theme: 'onyx', chain: ['onyx'] },
  { theme: 'concrete', chain: ['concrete'] },
  { theme: 'a11y-achromatopsia', chain: ['onyx', 'a11y-base', 'a11y-achromatopsia'] },
  { theme: 'a11y-deuteranopia', chain: ['onyx', 'a11y-base', 'a11y-deuteranopia'] },
  { theme: 'a11y-protanopia', chain: ['onyx', 'a11y-base', 'a11y-protanopia'] },
  { theme: 'a11y-tritanopia', chain: ['onyx', 'a11y-base', 'a11y-tritanopia'] },
];

// The section classes that PIN a scheme, and the scheme each pins to.
const PINS = [
  { cls: 'dark', isDark: true },
  { cls: 'light', isDark: false },
  { cls: 'color-light', isDark: false },
];

function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Declarations from every rule whose selector list matches `pred`. */
function declsForSelector(css, pred) {
  const out = {};
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(stripComments(css)))) {
    const selectors = m[1].split(',').map((s) => s.trim());
    if (!selectors.some(pred)) continue;
    for (const decl of m[2].match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []) {
      const d = decl.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
      if (d) out[d[1]] = d[2].trim();
    }
  }
  return out;
}

const isRoot = (s) => /^:root(:root)?$/.test(s);
/**
 * `section.dark:not(.print)` and friends — the pin, however it is qualified.
 * The optional `html:not([data-lattice-print])` prefix is the PRINT GUARD: under
 * `--print` the emulator bakes each diagram's label ink for the B&W band, and CSS
 * repaints the chip but never that baked ink, so the pins must stand down.
 */
const PRINT_GUARD = 'html:not\\(\\[data-lattice-print\\]\\)';
const pinMatcher = (cls) => (s) =>
  new RegExp(`^(${PRINT_GUARD}\\s+)?section\\.${cls}(:not\\([.\\w]+\\))?$`).test(s);

const BASE_VARS = declsForSelector(fs.readFileSync(path.join(ROOT, 'dist', 'lattice.css'), 'utf8'), isRoot);

/** Every `<pattern>` in the shipped defs → the fill baked into its `<rect>`. */
function bakedPatternFills() {
  const defs = texturePatternDefs();
  const fills = {};
  const re = /<pattern id="([^"]+)"[^>]*>\s*<rect[^>]*?fill="([^"]+)"/g;
  let m;
  while ((m = re.exec(defs))) fills[m[1]] = m[2];
  return fills;
}

const BAKED = bakedPatternFills();

function toRgb(value) {
  let h = String(value).trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  if (!/^[0-9a-f]{6}$/i.test(h)) return null;
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}

function rgbOrFail(value, what) {
  const rgb = toRgb(value);
  assert.ok(rgb, `${what} did not resolve to a hex color (got ${JSON.stringify(value)})`);
  return rgb;
}

function relativeLuminance(rgb) {
  const a = rgb.map((v) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * a[0] + 0.7152 * a[1] + 0.0722 * a[2];
}

function contrast(fg, bg, whatFg, whatBg) {
  const [hi, lo] = [
    relativeLuminance(rgbOrFail(fg, whatFg)),
    relativeLuminance(rgbOrFail(bg, whatBg)),
  ].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Selector specificity as (ids, classes, elements) packed into one number.
 * `:not()` contributes its ARGUMENT's specificity, not its own — which is the
 * whole reason this function has to exist rather than being eyeballed.
 */
function specificity(sel) {
  const flat = sel.replace(/:not\(|\)/g, ' ');
  const ids = (flat.match(/#[\w-]+/g) || []).length;
  const classes = (flat.match(/\.[\w-]+/g) || []).length
    + (flat.match(/\[[^\]]+\]/g) || []).length
    + (flat.match(/:[\w-]+/g) || []).length;
  const elements = (flat.match(/(^|\s)[a-z][\w-]*/gi) || []).length;
  return ids * 10000 + classes * 100 + elements;
}

/** Every rule matching `pred`, as {token, value, specificity, order} entries. */
function pinRules(css, pred, order) {
  const out = [];
  const re = /([^{}]+)\{([^}]*)\}/g;
  let m;
  while ((m = re.exec(stripComments(css)))) {
    for (const sel of m[1].split(',').map((s) => s.trim())) {
      if (!pred(sel)) continue;
      for (const decl of m[2].match(/--[a-z0-9-]+\s*:\s*[^;]+/gi) || []) {
        const d = decl.match(/--([a-z0-9-]+)\s*:\s*(.+)$/i);
        if (d) out.push({ token: d[1], value: d[2].trim(), spec: specificity(sel), order });
      }
    }
  }
  return out;
}

/**
 * Tokens as they resolve for `theme` on a slide carrying `pin`.
 *
 * The cascade is resolved PROPERLY — highest specificity wins, source order breaks
 * ties — not by "a later file overwrites an earlier one". That shortcut made this
 * gate vacuous exactly once: when onyx's pins gained the `html:not([…])` print guard
 * they jumped to (0,3,2), a11y's unguarded re-assertion stayed (0,2,1), and onyx's
 * DARK chips won on a11y decks under a11y's black ink. The old merge still reported
 * a11y as the winner, so the gate stayed green while the render was broken.
 */
function resolveUnderPin({ chain }, pin) {
  let root = { ...BASE_VARS };
  const pinned = [];
  chain.forEach((file, i) => {
    const css = fs.readFileSync(path.join(ROOT, 'themes', `${file}.css`), 'utf8');
    root = { ...root, ...declsForSelector(css, isRoot) };
    pinned.push(...pinRules(css, pinMatcher(pin.cls), i));
  });

  const winners = {};
  for (const r of pinned) {
    const cur = winners[r.token];
    if (!cur || r.spec > cur.spec || (r.spec === cur.spec && r.order >= cur.order)) winners[r.token] = r;
  }

  const vars = { ...root };
  for (const [token, r] of Object.entries(winners)) vars[token] = r.value;
  return { get: (t) => (vars[t] === undefined ? undefined : resolveTokenExpr(vars[t], vars, pin.isDark)) };
}

describe('texture-polarity', () => {
  for (const entry of TEXTURED) {
    for (const pin of PINS) {
      test(`${entry.theme} / .${pin.cls}: label ink clears AA on every chip that actually paints`, () => {
        const { get } = resolveUnderPin(entry, pin);
        const ink = get('cat-on-fill');
        assert.ok(ink, `themes/${entry.theme}.css resolves no --cat-on-fill under .${pin.cls}`);

        for (let n = 1; n <= 12; n++) {
          const texture = get(`cat-${n}-texture`);
          assert.ok(texture, `--cat-${n}-texture is unset for ${entry.theme} under .${pin.cls}`);

          const id = String(texture).match(/url\(#([^)]+)\)/)?.[1];
          assert.ok(id, `--cat-${n}-texture is not a paint-server ref (got ${texture})`);

          const chip = BAKED[id];
          assert.ok(chip,
            `--cat-${n}-texture points at #${id}, which texturePatternDefs() does not emit `
            + '— a dangling paint-server ref renders as SVG default black');

          const ratio = contrast(ink, chip, `${entry.theme} --cat-on-fill`, `pattern #${id} fill`);
          assert.ok(ratio >= AA_TEXT,
            `${entry.theme} on a .${pin.cls} slide: ink ${ink} on slot ${n}'s baked chip ${chip} `
            + `(#${id}) is ${ratio.toFixed(2)}:1, needs ${AA_TEXT}`);
        }
      });
    }
  }

  test('a polarity pin stands down under --print, and the emulator marks the document', () => {
    // The emulator BAKES a diagram's label ink for the band it renders — the B&W
    // print band under `--print`. CSS repaints the chip but never that baked ink,
    // so a pin is correct only where it agrees with the bake. On a print render a
    // per-slide `_class` REPLACES the deck's `class: print`, so such a slide keeps
    // `dark` and loses `print`: an ungated pin put baked print ink (dark) on a dark
    // chip at ~2.7:1. The guard is the reason print output stays byte-identical.
    for (const theme of ['onyx', 'concrete']) {
      const css = stripComments(fs.readFileSync(path.join(ROOT, 'themes', `${theme}.css`), 'utf8'));
      const re = /([^{}]+)\{([^}]*)\}/g;
      let m;
      let guarded = 0;
      while ((m = re.exec(css))) {
        // Only rules that actually select a POLARITY-PINNED set need the guard;
        // :root's scheme-aware wiring is untouched by print.
        if (!/url\(#latt-[a-z]+-tex-(light|dark)-\d+\)/.test(m[2])) continue;
        for (const sel of m[1].split(',').map((s) => s.trim())) {
          assert.match(sel, new RegExp(`^${PRINT_GUARD}\\s+section\\.`),
            `themes/${theme}.css selects a pinned texture set from "${sel}", which is not gated on `
            + 'the print marker — under --print this repaints the chip while the label ink stays '
            + 'baked for the B&W band');
          guarded++;
        }
      }
      assert.ok(guarded > 0, `themes/${theme}.css declares no pinned texture rules at all`);
    }

    const emulator = fs.readFileSync(path.join(ROOT, 'lattice-emulator.js'), 'utf8');
    assert.match(emulator, /WANT_PRINT \? ' data-lattice-print' : ''/,
      'lattice-emulator.js no longer marks the document under --print, so every guard above '
      + 'silently stops firing and the pins come back in print output');
  });

  test('a pinned slide never selects a scheme-aware pattern', () => {
    // The scheme-aware sets read :root's color-scheme, so selecting one from a
    // PINNED slide silently reintroduces #1323 — the pin would be cosmetic. The
    // scheme-aware ids are exactly those carrying a light-dark() class rule.
    const defs = texturePatternDefs();
    const schemeAware = new Set(
      [...defs.matchAll(/\.([\w-]+)\{fill:light-dark\(/g)].map((m) => m[1].replace(/-r(\d+)$/, '-$1')),
    );
    assert.ok(schemeAware.size > 0, 'found no scheme-aware patterns — the detector is broken');

    for (const entry of TEXTURED) {
      for (const pin of PINS) {
        const { get } = resolveUnderPin(entry, pin);
        for (let n = 1; n <= 12; n++) {
          const id = String(get(`cat-${n}-texture`)).match(/url\(#([^)]+)\)/)?.[1];
          assert.ok(!schemeAware.has(id),
            `${entry.theme} on a .${pin.cls} slide selects #${id}, which flips with the DECK scheme `
            + '— a per-slide pin cannot reach it, so the pin would be cosmetic');
        }
      }
    }
  });
});
