/**
 * Unit: the kernel↔CSS FONT-SIZE MIRROR for wrapping chart labels.
 *
 * A wrapping label is broken to a character budget derived from its font size,
 * but for the charts that predate this work CSS still owns the size that is
 * actually painted (the kernels pass `emitFontSize: false`). So each kernel
 * hard-codes a number that MIRRORS its stylesheet — and a mirror with no gate
 * is a silent drift trap: change the CSS, and the kernel keeps breaking lines to
 * a width the glyphs no longer occupy. Wrapping would then be wrong in whichever
 * direction the drift went, with nothing failing.
 *
 * This is the gate. It reads the real stylesheet and asserts the declared size
 * matches the constant the kernel wraps with. It exists because the decision
 * record claims it does (2026-07-26-svg-chart-labels-motion.md §3) — a
 * documented invariant with no gate is worse than an undocumented one.
 *
 * If you are here because this failed: update BOTH sides, or move ownership of
 * the size to the kernel (emit the font-size attribute, and delete the CSS
 * declaration) the way the SVG-native legend and the gantt already do.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '../../..');
const read = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8');

/**
 * The `font-size` a stylesheet declares for `selector`, in px (== viewBox user
 * units inside an SVG). Follows one level of `var(--token)` indirection, since
 * the radar and quadrant route their sizes through a themeable token.
 */
function declaredFontSize(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const rule = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`);
  const m = css.match(rule);
  if (!m) return null;
  const fs2 = m[1].match(/font-size:\s*([^;]+);/);
  if (!fs2) return null;
  const raw = fs2[1].trim();
  const px = raw.match(/^([\d.]+)px$/);
  if (px) return Number(px[1]);
  const varRef = raw.match(/^var\((--[\w-]+)\)$/);
  if (varRef) {
    const def = css.match(new RegExp(`${varRef[1]}:\\s*([\\d.]+)px`));
    return def ? Number(def[1]) : null;
  }
  return null;
}

describe('funnel: kernel font sizes mirror funnel.styles.css', () => {
  const css = read('lib/components/chart/funnel/funnel.styles.css');
  const js = read('lib/components/chart/funnel/funnel.transform.js');
  // Read the constant from inside the `FS = { … }` block, not from anywhere in
  // the file. `quadrant.transform.js` declares BOTH `LW.axis: 392` and
  // `FS.axis: 12`; a whole-file match happens to find FS only because FS is
  // declared first, so reordering the two objects would silently mirror the
  // wrong number against the stylesheet.
  const fsBlock = (js.match(/const FS = \{[\s\S]*?\n\};/) || [''])[0] || js;
  const kernel = (key) => {
    const m = fsBlock.match(new RegExp(`\\b${key}:\\s*([\\d.]+)`));
    return m ? Number(m[1]) : null;
  };

  for (const [key, selector] of [
    ['label', ':is(section.funnel, figure.chart-frame) .funnel-label'],
    ['value', ':is(section.funnel, figure.chart-frame) .funnel-value'],
    ['conv', ':is(section.funnel, figure.chart-frame) .funnel-conv'],
  ]) {
    test(`${key} matches ${selector}`, () => {
      const fromCss = declaredFontSize(css, selector);
      assert.ok(fromCss != null, `no font-size found for ${selector}`);
      assert.equal(kernel(key), fromCss,
        `funnel FS.${key} must equal the CSS font-size for ${selector}`);
    });
  }
});

describe('quadrant: kernel font sizes mirror quadrant.styles.css', () => {
  const css = read('lib/components/chart/quadrant/quadrant.styles.css');
  const js = read('lib/components/chart/quadrant/quadrant.transform.js');
  // Read the constant from inside the `FS = { … }` block, not from anywhere in
  // the file. `quadrant.transform.js` declares BOTH `LW.axis: 392` and
  // `FS.axis: 12`; a whole-file match happens to find FS only because FS is
  // declared first, so reordering the two objects would silently mirror the
  // wrong number against the stylesheet.
  const fsBlock = (js.match(/const FS = \{[\s\S]*?\n\};/) || [''])[0] || js;
  const kernel = (key) => {
    const m = fsBlock.match(new RegExp(`\\b${key}:\\s*([\\d.]+)`));
    return m ? Number(m[1]) : null;
  };

  for (const [key, selector] of [
    ['label', ':is(section.quadrant, figure.chart-frame) .quadrant-label'],
    ['dotLabel', ':is(section.quadrant, figure.chart-frame) .quadrant-dot-label'],
    ['cohort', ':is(section.quadrant, figure.chart-frame) .quadrant-cohort-label'],
    ['badge', ':is(section.quadrant, figure.chart-frame) .quadrant-target-badge'],
    ['axis', ':is(section.quadrant, figure.chart-frame) .quadrant-axis-name'],
    ['tick', ':is(section.quadrant, figure.chart-frame) .quadrant-tick'],
  ]) {
    test(`${key} matches ${selector}`, () => {
      const fromCss = declaredFontSize(css, selector);
      assert.ok(fromCss != null, `no font-size found for ${selector}`);
      assert.equal(kernel(key), fromCss,
        `quadrant FS.${key} must equal the CSS font-size for ${selector}`);
    });
  }
});

describe('radar: kernel font sizes mirror radar.styles.css', () => {
  const css = read('lib/components/chart/radar/radar.styles.css');
  const js = read('lib/components/chart/radar/radar.transform.js');
  const kernel = (name) => {
    const m = js.match(new RegExp(`const ${name} = ([\\d.]+)`));
    return m ? Number(m[1]) : null;
  };

  test('FS_AXIS matches .radar-axis-label', () => {
    const fromCss = declaredFontSize(css, ':is(section.radar, figure.chart-frame) .radar-axis-label');
    assert.ok(fromCss != null);
    assert.equal(kernel('FS_AXIS'), fromCss);
  });

  test('FS_TICK matches .radar-tick', () => {
    const fromCss = declaredFontSize(css, ':is(section.radar, figure.chart-frame) .radar-tick');
    assert.ok(fromCss != null);
    assert.equal(kernel('FS_TICK'), fromCss);
  });
});

// ── the mini's viewBox ↔ CSS BOX mirror ─────────────────────────────────────
// A second mirror, same trap, different quantity. The small-multiple caption
// moved inside the mini's viewBox (2026-07-27), which made the viewBox TALLER —
// 300 diagram + a fixed caption band. The CSS has to divide by that same total
// or the diagram silently changes rendered size: divide by too little and the
// mini letterboxes, by too much and it grows past the four-up row that
// MINI_LABEL_PAD was tuned for. Nothing else would fail — it would just look
// slightly wrong, which is the worst kind of drift.
//
// This is exactly the failure the SVG-native legend conversion hit and recorded
// ("audit the component's existing aspect-ratio / max-height FIRST — the kernel
// is the easy part"), so it gets a gate rather than a comment.
describe('radar mini viewBox ↔ CSS box mirror', () => {
  const css = read('lib/components/chart/radar/radar.styles.css');

  // The kernel is the source of truth: load it and read the real viewBox it
  // emits, rather than re-deriving the arithmetic here (a re-derivation that
  // duplicates the formula would agree with a broken formula).
  const rendered = require('../../../lib/engine').render(
    read('lib/components/chart/radar/radar.gallery.md'), 'indaco', { preview: true },
  ).html;
  const vb = /class="radar-svg radar-svg--mini" viewBox="(-?[\d.]+) (-?[\d.]+) ([\d.]+) ([\d.]+)"/.exec(rendered);

  test('the mini renders with a caption band below the 300-unit diagram', () => {
    assert.ok(vb, 'no .radar-svg--mini in the rendered gallery — the mirror has nothing to check');
    assert.ok(+vb[4] > 300, `mini viewBox height ${vb[4]} must exceed the 300-unit diagram (the caption band)`);
  });

  test('the CSS height divides by the kernel viewBox height, not by 300', () => {
    // `height: calc(var(--radar-mini-size) * <vbH> / 300)` — the numerator MUST
    // be the emitted viewBox height so the DIAGRAM keeps rendering at exactly
    // --radar-mini-size and the band adds below it.
    const m = /\.radar-svg--mini\s*\{[^}]*?height:\s*calc\(var\(--radar-mini-size\)\s*\*\s*([\d.]+)\s*\/\s*300\)/s.exec(css);
    assert.ok(m, 'could not find the .radar-svg--mini height calc() in radar.styles.css');
    assert.equal(+m[1], +vb[4], `CSS divides the mini box by ${m[1]} but the kernel emits a viewBox height of ${vb[4]}`);
  });

  test('the CSS width divides by 300 — the caption must not change the diagram width', () => {
    const m = /\.radar-svg--mini\s*\{[^}]*?width:\s*calc\(var\(--radar-mini-size\)\s*\*\s*([\d.]+)\s*\/\s*300\)/s.exec(css);
    assert.ok(m, 'could not find the .radar-svg--mini width calc() in radar.styles.css');
    assert.equal(+m[1], +vb[3], `CSS width numerator ${m[1]} must equal the viewBox width ${vb[3]}`);
  });

  test('the caption is SVG — no <figcaption> survives in the small-multiples output', () => {
    // Gated on RENDERED output, not on kernel source: the source still MENTIONS
    // `<figcaption>` in the comment explaining why it no longer emits one, and a
    // text scan cannot tell an emitter from its own epitaph.
    assert.ok(!/<figcaption/.test(rendered),
      'the rendered radar gallery still contains a <figcaption>; the mini caption must live in the viewBox');
    assert.match(rendered, /<text class="radar-mini-label"/, 'no SVG mini caption in the rendered gallery');
  });
});

describe('the mirror gate itself', () => {
  test('declaredFontSize resolves a literal px size', () => {
    assert.equal(declaredFontSize('.a { font-size: 8.5px; }', '.a'), 8.5);
  });

  test('declaredFontSize follows one level of var() indirection', () => {
    const css = ':root { --x-size: 11px; }\n.a { font-size: var(--x-size); }';
    assert.equal(declaredFontSize(css, '.a'), 11);
  });

  test('declaredFontSize returns null when it cannot resolve, so a test fails loudly', () => {
    // A silent null must never be mistaken for "matches" — every caller asserts
    // non-null before comparing.
    assert.equal(declaredFontSize('.a { color: red; }', '.a'), null);
    assert.equal(declaredFontSize('.b { font-size: 1em; }', '.b'), null);
  });
});
