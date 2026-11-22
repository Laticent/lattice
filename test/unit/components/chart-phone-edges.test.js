/**
 * Every chart label stays on its canvas on a phone page (engineering/decisions/2026-11-22-tall-canvas-retired.md § P2).
 *
 * A sweep of every portrait chart slide found three ways a label painted past its own drawing:
 * - a row name wider than its column: the column grew by a line budget that bills capitals at a flat 0.52 em, so
 *   `AMER` (34 units measured) read as whole in a 27-unit column and lost its first letter (heatmap, bar row,
 *   stacked-bar row);
 * - the ep-curve's last return period, centered on the plot's right edge with a fixed 12-unit gutter;
 * - a radar sector name set on the same angle as an axis name, on top of it (RISK over "Resilience").
 *
 * Widths come from the face table the kernels lay out with (text-measure.js), positions and sizes from the drawing.
 */
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { textWidth } = require('../../../lib/plugins/chart-family/shared/text-measure');
const engine = require('../../../lib/engine');

const SIZES = ['4:5', 'story', 'mobile'];
const deck = (size, body) => `---\ntheme: indaco\nsize: ${size}\n---\n\n${body}\n`;

/** The first chart drawing on the slide: its viewBox width, the role sizes it stamps, and its text runs. */
function drawing(size, body) {
  const html = engine.render(deck(size, body)).html;
  const at = html.indexOf('<svg data-chart-roles');
  assert.ok(at >= 0, 'the chart drew on the phone ladder');
  const svg = html.slice(at, html.indexOf('</svg>', at));
  const width = Number(/viewBox="0 0 ([\d.]+)/.exec(svg)[1]);
  const role = (r) => Number(new RegExp(`--chart-fs-${r}:([\\d.]+)px`).exec(svg)[1]);
  const runs = [];
  for (const m of svg.matchAll(/<text class="([^"]*)"([^>]*)>((?:<tspan[^>]*>[^<]*<\/tspan>)+|[^<]*)<\/text>/g)) {
    const anchor = (/text-anchor="(\w+)"/.exec(m[2]) || [])[1] || 'start';
    const baseline = (/dominant-baseline="(\w+)"/.exec(m[2]) || [])[1] || 'auto';
    const spans = [...m[3].matchAll(/<tspan x="([-\d.]+)" y="([-\d.]+)"[^>]*>([^<]*)<\/tspan>/g)];
    if (spans.length) for (const s of spans) runs.push({ cls: m[1], anchor, baseline, x: +s[1], y: +s[2], text: s[3] });
    else runs.push({ cls: m[1], anchor, baseline, x: Number((/\bx="([-\d.]+)"/.exec(m[2]) || [])[1]), y: Number((/\by="([-\d.]+)"/.exec(m[2]) || [])[1]), text: m[3] });
  }
  return { width, role, runs };
}

/** A run's horizontal extent at `fs`, from its anchor. */
function span(run, fs, w = textWidth(run.text.replace(/&amp;/g, '&'), fs)) {
  const left = run.anchor === 'end' ? run.x - w : run.anchor === 'middle' ? run.x - w / 2 : run.x;
  return { left, right: left + w };
}

describe('a row name is never wider than its column on a phone page', () => {
  const cases = [
    ['heatmap', '<!-- _class: heatmap -->\n\n## Margin by region.\n\n|  | Q1 | Q2 |\n| --- | --: | --: |\n| AMER | 61 | 63 |\n| EMEA | 58 | 55 |\n| APAC | 49 | 54 |', ['AMER', 'EMEA', 'APAC']],
    ['heatmap, a long month', '<!-- _class: heatmap -->\n\n## Retention.\n\n|  | M0 | M1 |\n| --- | --: | --: |\n| January 2026 | 100 | 62 |\n| September 2026 | 100 | 71 |', ['September']],
    ['bar row', '<!-- _class: bar row -->\n\n## Support load.\n\n- Billing `412`\n- Onboarding `388`\n- Data sync `146`\n- Admin `64`', ['Onboarding']],
    ['stacked-bar row', '<!-- _class: stacked-bar row -->\n\n## Online overtook Wholesale.\n\n- Q1 FY24\n  - Retail `12`\n  - Online `5`\n- Q4 FY24\n  - Retail `14`\n  - Online `9`', ['FY24']],
  ];
  for (const [name, body, words] of cases) {
    for (const size of SIZES) {
      test(`${name} at ${size}: ${words.join(', ')} start inside the canvas`, () => {
        const d = drawing(size, body);
        const fs = d.role('category');
        for (const word of words) {
          const runs = d.runs.filter((r) => /cart-cat/.test(r.cls) && r.text.includes(word));
          assert.ok(runs.length, `${word} is drawn`);
          for (const r of runs) assert.ok(span(r, fs).left >= -0.5, `"${r.text}" starts at ${span(r, fs).left.toFixed(1)}`);
        }
      });
    }
  }
});

describe('the ep-curve keeps its end return periods on the canvas', () => {
  const body = '<!-- _class: ep-curve -->\n\n## A 1-in-250 year costs $560M.\n\n- `{10, $120M}`\n- `{25, $190M}`\n- `{50, $300M}`\n- `{100, $410M}`\n- `{250, $560M}`';
  for (const size of SIZES) {
    test(`at ${size}`, () => {
      const d = drawing(size, body);
      const fs = d.role('tick');
      const rps = d.runs.filter((r) => /ep-rp/.test(r.cls));
      assert.ok(rps.some((r) => r.text === '1-in-250'), 'the last return period prints');
      for (const r of rps) {
        const s = span(r, fs);
        assert.ok(s.left >= -0.5 && s.right <= d.width + 0.5, `"${r.text}" spans ${s.left.toFixed(1)}..${s.right.toFixed(1)} of ${d.width}`);
      }
    });
  }
});

describe('a radar sector name clears every axis name', () => {
  const body = '<!-- _class: radar quadrant -->\n\n## Where we stand.\n\n- Ours\n  - People\n    - Hiring `4`\n    - Retention `3`\n    - Bench depth `2`\n'
    + '  - Process\n    - Cadence `5`\n    - Rigor `4`\n  - Technology\n    - Platform `4`\n    - Tooling `3`\n    - Automation `2`\n'
    + '  - Risk\n    - Compliance `3`\n    - Resilience `4`';
  // The vertical extent a single line paints from its anchor, by its dominant baseline.
  const box = (r, fs, w) => {
    const top = r.baseline === 'hanging' ? r.y : r.baseline === 'middle' ? r.y - fs / 2 : r.y - fs * 0.8;
    return { ...span(r, fs, w), top, bottom: top + fs };
  };
  for (const size of SIZES) {
    test(`at ${size}`, () => {
      const d = drawing(size, body);
      const axisFs = d.role('category');
      const sectorFs = d.role('title');
      const axes = d.runs.filter((r) => r.cls === 'radar-axis-label').map((r) => box(r, axisFs));
      // A sector name paints uppercase and tracked 0.04 em (radar.styles.css).
      const sectors = d.runs.filter((r) => r.cls === 'radar-sector-label')
        .map((r) => ({ name: r.text, ...box(r, sectorFs, textWidth(r.text.toUpperCase(), sectorFs) + 0.04 * sectorFs * r.text.length) }));
      assert.equal(sectors.length, 4);
      // Clear by a quarter of the type, not merely untouched: RISK sat 1.7 units under "Resilience" and read as its
      // second line.
      const gap = sectorFs / 4;
      for (const s of sectors) {
        for (const a of axes) {
          const crowds = s.left < a.right + gap && s.right > a.left - gap && s.top < a.bottom + gap && s.bottom > a.top - gap;
          assert.ok(!crowds, `${s.name} (${s.left.toFixed(0)}..${s.right.toFixed(0)}, ${s.top.toFixed(0)}..${s.bottom.toFixed(0)}) clears every axis name`);
        }
      }
    });
  }
});
