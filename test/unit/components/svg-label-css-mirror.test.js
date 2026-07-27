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

  test('the CSS height divides by the EMITTED viewBox height, not a hard-coded one', () => {
    // `height: calc(var(--radar-mini-size) * var(--radar-mini-vb, N) / 300)`.
    // The numerator must be the property the kernel emits, so the DIAGRAM keeps
    // rendering at exactly --radar-mini-size whichever band size was chosen. A
    // literal here would be correct only for the band it was written against and
    // would letterboxen or crop as soon as a name wrapped.
    const m = /\.radar-svg--mini\s*\{[^}]*?height:\s*calc\(var\(--radar-mini-size\)\s*\*\s*var\(--radar-mini-vb,\s*([\d.]+)\)\s*\/\s*300\)/s.exec(css);
    assert.ok(m, 'the .radar-svg--mini height must divide by var(--radar-mini-vb, <one-line fallback>)');

    // The rendered figure must actually carry the property, and it must equal
    // the viewBox height it is standing in for.
    const emitted = /<figure class="radar-mini"[^>]*--radar-mini-vb:(\d+)/.exec(rendered);
    assert.ok(emitted, 'the mini figure emits no --radar-mini-vb, so the CSS falls back silently');
    assert.equal(+emitted[1], +vb[4],
      `figure declares --radar-mini-vb:${emitted[1]} but its svg viewBox height is ${vb[4]}`);

    // The CSS fallback is the ONE-LINE band — the value used if the property ever
    // goes missing. It must be a real band height, not a guess.
    assert.ok(+m[1] > 300 && +m[1] <= +vb[4],
      `the fallback ${m[1]} must be a caption band height (>300, <= the emitted ${vb[4]})`);
  });

  test('the band grows for a wrapped name and every mini in the chart shares it', () => {
    // The row is a flex row: one taller mini would misalign it. All minis in a
    // chart must therefore carry the SAME --radar-mini-vb, sized by the longest
    // name — and a chart with no wrap must not pay for a second line.
    const engine = require('../../../lib/engine');
    const deck = (names) => `---\nmarp: true\ntheme: indaco\n---\n\n<!-- _class: radar small-multiples -->\n\n## T\n\n${
      names.map((n) => `- ${n}\n  - Speed \`8\`\n  - Cost \`6\`\n  - Risk \`7\``).join('\n')}\n`;
    const vbsOf = (html) => [...new Set([...html.matchAll(/--radar-mini-vb:(\d+)/g)].map((m) => +m[1]))];

    const short = vbsOf(engine.render(deck(['Atlas', 'Beacon']), 'indaco', { preview: true }).html);
    const long = vbsOf(engine.render(
      deck(['Northwind Logistics and Distribution Group International', 'Atlas', 'Beacon']),
      'indaco', { preview: true },
    ).html);

    assert.equal(short.length, 1, `all minis must share one band height, got ${short}`);
    assert.equal(long.length, 1, `all minis must share one band height, got ${long}`);
    assert.ok(long[0] > short[0],
      `a wrapped name must grow the band (one-line ${short[0]}, wrapped ${long[0]})`);
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
      // Every rule block whose selector mentions this class.
      const blocks = [...text.matchAll(/([^{}]*)\{([^}]*)\}/g)]
        .filter(([, selector]) => selector.includes(sel));
      assert.ok(blocks.length > 0, `no rule found for ${sel} in ${css}`);
      for (const [, selector, body] of blocks) {
        assert.ok(!/(^|[\s;])font-size\s*:/.test(body),
          `${sel}: CSS sets font-size (${selector.trim()}) — that makes the label slide-relative ` +
          'again. Size these from the kernel, in viewBox user units.');
      }
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
