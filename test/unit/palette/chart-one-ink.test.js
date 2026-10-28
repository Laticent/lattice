/**
 * Unit: ONE INK — every chart fill, a category or a status, carries white text, so two charts on one slide never wear
 * two text colors (engineering/chart-styling.md §3).
 *
 * A status shares a lightness with the categories, so its fill alone cannot tell it from a category of the same hue.
 * The chart family adds what does: a drawn MARK on every status (lib/core/status-marks.js), and on the two exceptions,
 * at risk and blocked, a SIGNAL ring in the bright classic hue. So, for every palette, in both modes and both
 * `marks:` intensities:
 *
 *   1. the chart family hands every kind the same ink: the frame declares `--chart-on-mark` once, as `--on-mark`,
 *      and no rule re-points it, so a category and a status cannot drift apart;
 *   2. every category, the neutral and every status fill sits on the far side of that ink: darker than a white ink,
 *      brighter than the near-black one the colorblind palettes wear on the dark face (how far, the 7:1 and 4.6:1
 *      bars, is chart-solids.test.js);
 *   3. each signal ring is the status color at the OPPOSITE lightness to its fill, and clears 3:1 against the neighbor
 *      opposite it in lightness and SIGNAL_DARK_FILL against the other: a deep fill on a light slide takes a bright
 *      ring 3:1 off the fill; a mid-tone fill on a dark slide a bright ring 3:1 off the slide; a bright fill (a
 *      colorblind palette's dark face) a deep ring 3:1 off the fill (lib/theme/chart-solids.js);
 *   4. the rings and marks are wired: only the exceptions ring, the ring outranks every finish's edge, and every
 *      status the marks kernel names has its mask.
 *
 * If this fails on values, re-run `node tools/curate-chart-solids.js`; on wiring, read the chart family's
 * § THE SIGNAL RING and § THE STATUS MARK.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { baseThemeNames } = require('../../helpers/palette');
const { loadThemeChain, resolve, contrast } = require('../../helpers/chart-color');
const { hexToOklch } = require('../../../lib/theme/color.js');
const { SIGNAL_DARK_FILL } = require('../../../lib/theme/chart-solids.js');
const { STATUS_MARK } = require('../../../lib/core/status-marks.js');

const FAMILY = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'plugins', 'chart-family', 'chart-family.styles.css'), 'utf8');
const BASE_TOKENS = fs.readFileSync(path.join(__dirname, '..', '..', '..', 'lib', 'base', 'base.tokens.css'), 'utf8');
const THEMES = [...baseThemeNames(), 'a11y-achromatopsia', 'a11y-deuteranopia', 'a11y-protanopia', 'a11y-tritanopia'];
const RING = 3;
const hex = (o) => (typeof o === 'string' ? o : `#${[o.r, o.g, o.b].map((v) => v.toString(16).padStart(2, '0')).join('')}`);
const L = (c) => hexToOklch(hex(c)).L;
const CATEGORIES = [...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `chart-cat-${n}-hue`), 'chart-neutral-hue'];
const STATUS_FILLS = {
  muted: ['pass-mark', 'warn-mark', 'fail-mark', 'info-mark', 'mute-mark'],
  vivid: ['pass-vivid-mark', 'warn-vivid-mark', 'fail-vivid-mark', 'info-vivid-mark', 'mute-mark'],
};

describe('one ink: the chart family hands every kind the same ink', () => {
  // Read from the source, not a flat parse: a second declaration anywhere in the family would be a second ink.
  test('the frame declares --chart-on-mark once, as --on-mark, and nothing re-points it', () => {
    assert.deepEqual([...FAMILY.matchAll(/--chart-on-mark\s*:\s*([^;]+);/g)].map((m) => m[1].trim()), ['var(--on-mark)']);
  });
});

describe('one ink: rings and marks are wired', () => {
  test('only the two exceptions set a signal, and the ring outranks every finish\'s edge', () => {
    const signals = [...FAMILY.matchAll(/:is\(([^)]*)\) \{ --chart-signal: var\(--state-(\w+)-signal\); \}/g)].map((m) => [m[1], m[2]]);
    assert.deepEqual(signals.map(([, s]) => s), ['warn', 'fail']);
    assert.deepEqual(signals.map(([sel]) => sel), ['[data-s="at-risk"], [data-s="warn"]', '[data-s="blocked"], [data-s="fail"]']);
    // Every finish paints a status member's edge with !important (marks.generated.css), so the ring must too.
    // An SVG shape's ring is its own element, drawn inside the shape by the member's kernel.
    assert.match(FAMILY, /\.chart-signal-ring \{\s*fill: none !important;\s*stroke: var\(--chart-signal\) !important;/);
    // The ring takes no space: an inset shadow on HTML, a clipped outline on SVG, 1.3 hairlines wide.
    assert.match(FAMILY, /box-shadow: inset 0 0 0 var\(--chart-ring\) var\(--chart-signal\) !important;/);
    assert.match(FAMILY, /--chart-ring: var\(--state-signal-w\);/);
    assert.match(BASE_TOKENS, /--state-signal-w: calc\(clamp\(1px, 0\.078cqi, 2px\) \* 1\.3\);/);
  });

  test('every status the marks kernel names has its mask', () => {
    const byMark = {};
    for (const [status, mark] of Object.entries(STATUS_MARK)) (byMark[mark] ??= []).push(status);
    for (const [mark, statuses] of Object.entries(byMark)) {
      const rule = new RegExp(`\\{ --status-mark: var\\(--mark-${mark}-bold\\); \\}`);
      assert.match(FAMILY, rule, `--mark-${mark}-bold has a rule`);
      const line = FAMILY.split('\n').find((l) => rule.test(l));
      for (const s of statuses) assert.ok(line.includes(`[data-s="${s}"]`), `${s} wears --mark-${mark}-bold`);
    }
    // The token is not enough: an HTML pill paints it only through the `::before` mask rule, so that rule must name every status
    // the kernel gives a mark (live, pilot and decision were missing once, and the dot never drew).
    const maskRules = (FAMILY.match(/[^{}]*::before\s*\{[^}]*mask:[^}]*\}/g) || []).join('\n');
    for (const status of Object.keys(STATUS_MARK)) assert.ok(maskRules.includes(`[data-s="${status}"]`), `${status} has a ::before mask rule`);
  });
});

describe('one ink: every fill sits under the one ink', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      for (const [intensity, fills] of Object.entries(STATUS_FILLS)) {
        test(`${theme} ${mode} ${intensity}`, () => {
          const vars = loadThemeChain(theme);
          const c = (t) => resolve(`var(--${t})`, vars, mode);
          const ink = c('on-mark');
          const bad = [];
          const lightInk = L(ink) > 0.5;
          if (!lightInk && !(theme.startsWith('a11y-') && mode === 'dark')) bad.push('only a colorblind palette\'s dark face wears the near-black ink');
          for (const t of [...CATEGORIES, ...fills]) {
            if (lightInk ? L(c(t)) >= L(ink) : L(c(t)) <= L(ink)) bad.push(`--${t} is not on the far side of the ink`);
          }
          assert.deepEqual(bad, []);
        });
      }
    }
  }
});

describe('one ink: each signal ring stands off the neighbor opposite it', () => {
  for (const theme of THEMES) {
    for (const mode of ['light', 'dark']) {
      for (const intensity of ['muted', 'vivid']) {
        test(`${theme} ${mode} ${intensity}`, () => {
          const vars = loadThemeChain(theme);
          const c = (t) => resolve(`var(--${t})`, vars, mode);
          const bad = [];
          for (const s of ['warn', 'fail']) {
            const ring = c(`${s}-signal-mark`);
            const fill = c(intensity === 'vivid' ? `${s}-vivid-mark` : `${s}-mark`);
            const brightFill = L(fill) > L(c('on-mark'));
            const r = contrast(ring, fill);
            const bg = contrast(ring, c('bg'));
            if (brightFill ? L(ring) >= L(fill) : L(ring) <= L(fill)) bad.push(`--${s}-signal-mark is not at the opposite lightness to its fill`);
            // The neighbor opposite the ring in lightness takes 3:1; the other, SIGNAL_DARK_FILL.
            const [main, other] = brightFill || mode === 'light' ? [r, mode === 'light' ? null : bg] : [bg, r];
            if (main < RING) bad.push(`--${s}-signal-mark: ${main.toFixed(2)}:1 off its opposite neighbor (bar ${RING})`);
            if (other != null && other < SIGNAL_DARK_FILL - 0.05) bad.push(`--${s}-signal-mark: ${other.toFixed(2)}:1 off its other neighbor (bar ${SIGNAL_DARK_FILL})`);
          }
          assert.deepEqual(bad, []);
        });
      }
    }
  }
});
