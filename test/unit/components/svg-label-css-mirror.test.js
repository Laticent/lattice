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

  test('CSS states no viewBox height at all — the browser derives it', () => {
    // The mini fills its grid cell (`width:100%; height:100%`) and
    // `preserveAspectRatio: meet` fits the viewBox inside, so the caption band's
    // share of the drawing comes from the viewBox itself. This replaced a
    // `height: calc(var(--radar-mini-size) * <vbH> / 300)` mirror, which required
    // CSS to know a number the kernel computes from CONTENT (one line of series
    // names or two) — correct only for the band it was written against, and
    // letterboxing or cropping the moment a name wrapped. The best mirror is no
    // mirror; this test guards that it stays gone.
    const rule = /\.radar-svg--mini\s*\{([^}]*)\}/s.exec(css);
    assert.ok(rule, 'no .radar-svg--mini rule in radar.styles.css');
    assert.match(rule[1], /height:\s*100%/,
      'the mini must fill its grid cell on BOTH axes; preserveAspectRatio fits the viewBox inside');
    assert.ok(!/height:\s*calc\([^)]*\/\s*300\s*\)/.test(rule[1]),
      'the mini height must not divide by a hard-coded viewBox height again');
  });

  test('the mini fills the width its flex track was given', () => {
    const rule = /\.radar-svg--mini\s*\{([^}]*)\}/s.exec(css);
    assert.match(rule[1], /width:\s*100%/,
      'the mini must fill its track — a fixed width is what left four minis at 5% of a portrait body');
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

// ── in-viewBox labels must be CHART-relative, never slide-relative ──────────
// The property that makes an SVG label responsive: its size is a user unit in the
// chart's own viewBox, so it scales with the chart. The moment a CSS rule gives
// one of these classes a `font-size` from the `--fs-*` scale, it becomes
// SLIDE-relative again and the two drift apart the instant the chart's box stops
// being a fixed fraction of the slide.
//
// That is not hypothetical — it is what these labels did before 2026-07-27, and
// it was measurably wrong in portrait: word-cloud's key rendered at 26.5px
// against a cloud whose biggest word was 62.5px (42% — it overflowed its own
// rail and wrapped), and a radar mini caption rendered at 23.9px against a 175px
// diagram. In viewBox units both hold their landscape proportion exactly
// (17.8% and 5.74%) at any orientation or container size.
//
// So: the kernel owns the size for these classes, and CSS may not take it back.
describe('SVG label sizes stay chart-relative, not slide-relative', () => {
  const OWNED_BY_KERNEL = [
    { css: 'lib/components/chart/radar/radar.styles.css', sel: '.radar-mini-label' },
    { css: 'lib/components/chart/word-cloud/word-cloud.styles.css', sel: '.wc-key-label' },
    { css: 'lib/components/chart/word-cloud/word-cloud.styles.css', sel: '.wc-key-edge' },
    { css: 'lib/components/chart/word-cloud/word-cloud.styles.css', sel: '.wc-key-a' },
  ];
  for (const { css, sel } of OWNED_BY_KERNEL) {
    test(`${sel} declares no font-size in CSS`, () => {
      const text = read(css);
      // Scan from each MENTION of the class to the end of the block it opens,
      // rather than matching `prelude { body }` pairs. The pair form cannot see
      // inside an at-rule: for `@media (…) { .wc-key-a { font-size: … } }` the
      // prelude is the `@media` and the class sits in the BODY, so the block is
      // filtered out and the very declaration this guards slips through green.
      let found = 0;
      for (const m of text.matchAll(new RegExp(sel.replace('.', '\\.'), 'g'))) {
        const open = text.indexOf('{', m.index);
        if (open < 0) continue;
        // Walk to the matching close brace so a nested block is included.
        let depth = 0; let end = open;
        for (; end < text.length; end += 1) {
          if (text[end] === '{') depth += 1;
          else if (text[end] === '}') { depth -= 1; if (depth === 0) break; }
        }
        const body = text.slice(open + 1, end);
        found += 1;
        assert.ok(!/(^|[\s;])font-size\s*:/.test(body),
          `${sel}: CSS sets font-size near offset ${m.index} — that makes the label ` +
          'slide-relative again. Size these from the kernel, in viewBox user units.');
      }
      assert.ok(found > 0, `no rule found for ${sel} in ${css}`);
    });
  }

  test('the emitted labels carry their own font-size attribute', () => {
    // The other half: if the kernel stopped emitting it, the labels would fall
    // back to an inherited size and the CSS check above would pass vacuously.
    const radar = require('../../../lib/engine').render(
      read('lib/components/chart/radar/radar.gallery.md'), 'indaco', { preview: true },
    ).html;
    const wc = require('../../../lib/engine').render(
      read('lib/components/chart/word-cloud/word-cloud.gallery.md'), 'indaco', { preview: true },
    ).html;
    assert.match(radar, /<text class="radar-mini-label" font-size="[\d.]+"/);
    assert.match(wc, /<text class="wc-key-label" font-size="[\d.]+"/);
    assert.match(wc, /<text class="wc-key-a" [^>]*font-size="[\d.]+"/);
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
