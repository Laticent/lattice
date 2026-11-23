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
  // A radar draws in a scaled group that stamps its own role sizes, in the group's units (radar.transform.js
  // `radarForm`). Its text runs are in those units, so a role reads from that group first, then from the svg.
  const group = (/<g transform="translate\([^)]*\) scale\([\d.]+\)" style="([^"]*)"/.exec(svg) || [])[1] || '';
  const role = (r) => Number((new RegExp(`--chart-fs-${r}:([\\d.]+)px`).exec(group) || new RegExp(`--chart-fs-${r}:([\\d.]+)px`).exec(svg))[1]);
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
      const sectorFs = d.role('region');
      const axes = d.runs.filter((r) => r.cls === 'radar-axis-label').map((r) => box(r, axisFs));
      // On a phone page a sector name paints uppercase, at the region role, tracked 0.06 em (chart-family.styles.css).
      const sectors = d.runs.filter((r) => r.cls === 'radar-sector-label')
        .map((r) => ({ name: r.text, ...box(r, sectorFs, textWidth(r.text.toUpperCase(), sectorFs) + 0.06 * sectorFs * r.text.length) }));
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

// The cases an independent review (2026-11-23) broke the first version of these fixes with.
const MarkdownIt = require('markdown-it');
const { transformChartSection } = require('../../../lib/transformers/chart-frame');
const { resetRenderIds } = require('../../../lib/core/render-ids');
const md = new MarkdownIt({ html: true });

describe('a row name too long for any column keeps the old column, not a narrower one', () => {
  for (const kind of ['bar row', 'stacked-bar row']) {
    for (const size of ['story', 'mobile']) {
      test(`${kind} at ${size}: a 29-letter compound is not newly cut`, () => {
        const body = kind === 'bar row'
          ? `<!-- _class: ${kind} -->\n\n## Load.\n\n- Telekommunikationsunternehmen \`412\`\n- Beta \`300\`\n- Gamma \`120\``
          : `<!-- _class: ${kind} -->\n\n## Load.\n\n- Telekommunikationsunternehmen\n  - A \`4\`\n  - B \`3\`\n- Beta\n  - A \`2\`\n  - B \`5\``;
        const html = engine.render(deck(size, body)).html;
        assert.doesNotMatch(html, /data-label-drops="[^"]*truncate:Telekommunikationsunternehmen/, 'the name is not reported cut');
      });
    }
  }
});

describe('the ep-curve keeps every return period it can, on the canvas', () => {
  const draw = (points, orientation, paneView, aspect) => {
    resetRenderIds('');
    const out = transformChartSection(md.render(`## Loss.\n\n${points.map((p) => `- \`${p}\``).join('\n')}`), 'ep-curve', orientation, paneView, null, aspect, {});
    const width = Number(/viewBox="0 0 ([\d.]+)/.exec(out.html)[1]);
    const fsm = /--chart-fs-tick:([\d.]+)px/.exec(out.html);
    const fs = fsm ? Number(fsm[1]) : 7;
    const labels = [...out.html.matchAll(/<text class="cart-tick ep-rp" x="([-\d.]+)"[^>]*>([^<]*)</g)]
      .map((m) => ({ text: m[2], ...span({ anchor: 'middle', x: Number(m[1]), text: m[2] }, fs) }));
    return { width, labels };
  };
  test('three decades on a story slide print all three, the last on the canvas', () => {
    const { width, labels } = draw(['{10, $1M}', '{1000, $5M}', '{10000, $9M}'], 'portrait', undefined, 9 / 16);
    assert.deepEqual(labels.map((l) => l.text), ['1-in-10', '1-in-1,000', '1-in-10,000']);
    for (const l of labels) assert.ok(l.left >= -0.5 && l.right <= width + 0.5, `${l.text} spans ${l.left.toFixed(1)}..${l.right.toFixed(1)} of ${width}`);
  });
  // An independent review's cases: rescuing an end label once cost a label main printed whole and on the canvas.
  const pts = (rps) => rps.map((rp, i) => `{${rp}, ${'$'}${(i + 1) * 100}M}`);
  for (const [where, rps, pane, label] of [
    ['a landscape slide', [1.5, 2, 250, 500, 2000, 10000], undefined, '1-in-2,000'],
    ['a half-width pane', [1.5, 10, 20, 50, 500, 5000], { w: 223, h: 180 }, '1-in-50'],
    ['a half-width pane', [5, 100, 500, 5000, 25000, 100000], { w: 223, h: 180 }, '1-in-5,000'],
  ]) {
    test(`${where} still prints ${label} (${rps.join(', ')})`, () => {
      const { labels } = draw(pts(rps), undefined, pane, undefined);
      assert.ok(labels.some((l) => l.text === label), labels.map((l) => l.text).join(', '));
    });
  }
  test('a half-width pane keeps all five return periods, on the canvas', () => {
    const { width, labels } = draw(['{10, $120M}', '{25, $190M}', '{50, $300M}', '{100, $410M}', '{250, $560M}'], undefined, { w: 223, h: 180 }, undefined);
    assert.equal(labels.length, 5, labels.map((l) => l.text).join(', '));
    for (const l of labels) assert.ok(l.left >= -0.5 && l.right <= width + 0.5, `${l.text} spans ${l.left.toFixed(1)}..${l.right.toFixed(1)} of ${width}`);
  });
});

describe('a radar sector name never moves off the drawing', () => {
  // A seeded random case (seed 7, case 82), whose names all print on the canvas on main. GO TO MARKET sits on TECHNOLOGY
  // there; moved off it, it ran 2.6 units past the left edge when the move was bounded by the axis names' wrap boxes,
  // or tested at the width `upperAdvance` bills instead of the width it paints. (Many dense radars clip a name that
  // never moved, on main too: followups.d/3431-p2-radar-sector-names-overrun.md.)
  const case82 = '<!-- _class: radar quadrant -->\n\n## Capability\n\n- Ours\n  - People\n    - Data quality `3`\n    - Partner network `3`\n'
    + '    - Rigor `2`\n    - Bench depth `3`\n  - Process\n    - Time to market `3`\n    - Compliance `4`\n    - Unit economics `2`\n'
    + '    - Onboarding `5`\n  - Technology\n    - Automation `3`\n    - Platform `3`\n    - Cadence `2`\n    - Security posture `1`\n'
    + '  - Risk\n    - Retention `3`\n    - Resilience `5`\n  - Go to market\n    - Brand `1`\n    - Customer satisfaction `5`';
  // Case 13: the first version of the fix moved PROCESS to x 267.8-328.1 on a 320-wide story canvas.
  const case13 = '<!-- _class: radar quadrant -->\n\n## Capability\n\n- Ours\n  - People\n    - Retention `2`\n    - Tooling `4`\n'
    + '    - Onboarding `1`\n    - Cadence `1`\n  - Process\n    - Platform `3`\n    - Brand `2`\n    - Unit economics `5`\n  - Technology\n'
    + '    - Time to market `4`\n    - Customer satisfaction `5`\n    - Resilience `4`\n    - Bench depth `4`\n  - Risk\n'
    + '    - Security posture `1`\n    - Hiring `2`\n  - Go to market\n    - Data quality `1`\n    - Compliance `2`\n    - Partner network `1`';
  // Each case checks the name its bug moved. Other names may sit past an edge where they first land, on main too
  // (followups.d/3431-p2-radar-sector-names-overrun.md); a move never takes them further.
  const cases = [...SIZES, 'square'].flatMap((size) => [['case 82', case82, size, 'Go to market'], ['case 13', case13, size, 'Process']]);
  for (const [name, body, size, moved] of cases) {
    test(`${name} at ${size}: ${moved}`, () => {
      const html = engine.render(deck(size, body)).html;
      const svg = html.slice(html.indexOf('<svg data-chart-roles'), html.indexOf('</svg>', html.indexOf('<svg data-chart-roles')));
      const [vw, vh] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg).slice(1).map(Number);
      const tm = /<g transform="translate\(([-\d.]+) ([-\d.]+)\)(?: scale\(([\d.]+)\))?"/.exec(svg);
      const [dx, dy, k] = tm ? [Number(tm[1]), Number(tm[2]), tm[3] ? Number(tm[3]) : 1] : [0, 0, 1];
      const d = drawing(size, body);
      const fs = d.role('region'); // the phone stylesheet paints a sector name at the region role
      const runs = d.runs.filter((x) => x.cls === 'radar-sector-label' && x.text === moved);
      assert.equal(runs.length, 1, `${moved} prints on one line`);
      for (const r of runs) {
        const w = textWidth(r.text.toUpperCase(), fs) + 0.06 * fs * r.text.length;
        const s = span(r, fs, w);
        const top = r.baseline === 'hanging' ? r.y : r.baseline === 'middle' ? r.y - fs / 2 : r.y - fs * 0.8;
        const box = { l: dx + k * s.left, r: dx + k * s.right, t: dy + k * top, b: dy + k * (top + fs) };
        assert.ok(box.l >= -0.5 && box.r <= vw + 0.5 && box.t >= -0.5 && box.b <= vh + 0.5, `${r.text} at ${JSON.stringify(box)} on ${vw} x ${vh}`);
      }
    });
  }
});
