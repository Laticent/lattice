/**
 * Unit: lib/components/chart/heatmap/heatmap.transform.js — the numeric-matrix
 * kernel.
 *
 * The arms here are the DECISIONS the component makes, not its geometry. Its
 * pixel behavior is covered where pixels can be measured — `check:chart-fit` for
 * the stage, `chart-aria-subtree` for the accessibility tree, the palette gate
 * for contrast. What a unit test can hold is the reading the kernel takes of an
 * author's list: what it refuses to draw, what it treats as absent rather than
 * zero, and where the ramp starts.
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const {
  parseHeatmap, buildHeatmap,
  MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, RAMP_STEPS, stepFor,
} = require('../../../lib/components/chart/heatmap/heatmap.transform');

const md = new MarkdownIt({ html: true });
/** The `<li>` HTML of the first list in an authored body — what the kernel takes. */
const ul = (body) => (md.render(body).match(/<ul>([\s\S]*)<\/ul>/) || ['', ''])[1];

const GRID = `
- Jan
  - M0 \`100\`
  - M1 \`62\`
  - M2 \`48\`
- Feb
  - M0 \`100\`
  - M1 \`58\`
  - M2 \`44\`
`;

describe('heatmap — what it refuses to draw', () => {
  test('a FLAT list is declined, not painted as one row', () => {
    // A single series is a comparison, and a reader judges length far more
    // precisely than intensity. Painting it as a row of cells would invite the
    // wrong reading rather than merely looking odd.
    assert.equal(parseHeatmap(ul('- Jan `62`\n- Feb `58`\n')), null);
  });

  test('an empty list is declined', () => {
    assert.equal(parseHeatmap(ul('- Jan\n- Feb\n')), null);
  });

  test('rows with labels but no numbers anywhere are declined', () => {
    assert.equal(parseHeatmap(ul('- Jan\n  - M0 `n/a`\n- Feb\n  - M0 `tbd`\n')), null);
  });
});

describe('heatmap — a missing cell is not a zero', () => {
  const model = parseHeatmap(ul(`
- Jan
  - M0 \`100\`
  - M1 \`62\`
- Feb
  - M0 \`100\`
`));

  test('an unwritten crossing parses as null, not 0', () => {
    assert.equal(model.rows[1].cells[1], null,
      'a crossing the author did not write must be absent, not a measured zero');
  });

  test('an absent cell is left OUT of the domain', () => {
    // If a missing cell counted as 0 the minimum would be 0, and every real
    // value would be compressed into the top of the ramp by a number nobody
    // wrote.
    assert.equal(model.min, 62);
    assert.equal(model.max, 100);
  });

  test('the two paint differently', () => {
    const svg = buildHeatmap(model, {});
    assert.match(svg, /heatmap-cell--empty/, 'the absent crossing needs its own class');
    // And the empty cell carries NO --mix, so it cannot land on the ramp.
    const empty = svg.match(/<rect class="heatmap-cell heatmap-cell--empty"[^>]*>/)[0];
    assert.doesNotMatch(empty, /--mix/, 'an empty cell must not sit at the bottom of the ramp');
  });

  test('an authored ZERO is a value, and does land on the ramp', () => {
    const m = parseHeatmap(ul('- Jan\n  - M0 `0`\n  - M1 `50`\n- Feb\n  - M0 `25`\n  - M1 `75`\n'));
    assert.equal(m.rows[0].cells[0].num, 0);
    assert.equal(m.min, 0);
    const svg = buildHeatmap(m, {});
    assert.doesNotMatch(svg, /heatmap-cell--empty/, 'a measured zero is not a missing cell');
  });
});

describe('heatmap — the quantized ramp', () => {
  // The value IS printed on the fill here, which the chart family otherwise
  // refuses. What buys the exception is quantizing: five chosen stops, each
  // carrying an ink solved against the fill that stop actually paints. The
  // measurement and the dead zone that forces it are in the transform's docblock
  // and in lib/theme/cat-ink.js § solveHeatmapRamp. These arms hold the CONTRACT
  // the three places share — kernel, stylesheet, generator — because the ink is
  // only correct for the fill it was solved against, so a step index that means
  // one thing in the kernel and another in CSS is a silent contrast failure.

  test('a value maps to a step in range, and the extremes land on the ends', () => {
    assert.equal(stepFor(0, 0, 100), 1, 'the matrix minimum takes the first stop');
    assert.equal(stepFor(100, 0, 100), RAMP_STEPS, 'the maximum takes the last, not one past it');
    for (let v = 0; v <= 100; v += 1) {
      const s = stepFor(v, 0, 100);
      assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS, `stepFor(${v}) = ${s} is off the ramp`);
    }
  });

  test('steps never go backwards as the value climbs', () => {
    let prev = 0;
    for (let v = 0; v <= 100; v += 1) {
      const s = stepFor(v, 0, 100);
      assert.ok(s >= prev, `stepFor(${v}) = ${s} dropped below ${prev} — the ramp must be monotonic`);
      prev = s;
    }
  });

  test('a FLAT matrix takes the middle step rather than dividing by zero', () => {
    const s = stepFor(50, 50, 50);
    assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS, 'a flat matrix must still paint');
    assert.equal(s, Math.ceil(RAMP_STEPS / 2), 'a matrix with no gradient sits mid-ramp');
  });

  test('every cell and every value carries a step, and they agree', () => {
    const svg = buildHeatmap(parseHeatmap(ul(GRID)), {});
    const cells = [...svg.matchAll(/<rect class="heatmap-cell"[^>]*data-step="(\d+)"[^>]*data-value="([^"]*)"/g)];
    assert.ok(cells.length > 0, 'no cells carried a step');
    const values = [...svg.matchAll(/<text class="heatmap-value"[^>]*data-step="(\d+)"/g)];
    assert.ok(values.length > 0, 'no printed value carried a step');
    for (const [, step] of [...cells, ...values]) {
      const n = Number(step);
      assert.ok(n >= 1 && n <= RAMP_STEPS, `data-step="${step}" is outside the ramp`);
    }
  });

  test('the kernel emits NO color — the ramp lives in the theme', () => {
    // HARD RULE #3, and the reason a rendered deck stays theme-swappable: the
    // same HTML has to paint correctly under all 33 palettes, so a mix percentage
    // or an ink baked in here would be wrong the moment the stylesheet changed.
    const svg = buildHeatmap(parseHeatmap(ul(GRID)), {});
    assert.doesNotMatch(svg, /--mix\s*:/, 'the kernel must not set a mix percentage');
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b/, 'the kernel must not emit a color');
  });

  test('the step count agrees with the stylesheet and the generator', () => {
    // Three places encode it and none can see the others at runtime. A drift here
    // pairs an ink with a fill it was not solved against, which no test that
    // looks at only one side can catch.
    const css = fs.readFileSync(
      path.join(__dirname, '../../../lib/components/chart/heatmap/heatmap.styles.css'), 'utf8');
    for (let n = 1; n <= RAMP_STEPS; n += 1) {
      assert.ok(css.includes(`.heatmap-cell[data-step="${n}"]`), `no cell rule for step ${n}`);
      assert.ok(css.includes(`.heatmap-value[data-step="${n}"]`), `no value rule for step ${n}`);
      assert.ok(css.includes(`--heatmap-step${n}`), `the stylesheet never reads --heatmap-step${n}`);
      assert.ok(css.includes(`--heatmap-step${n}-ink`), `the stylesheet never reads --heatmap-step${n}-ink`);
    }
    assert.ok(!css.includes(`data-step="${RAMP_STEPS + 1}"`),
      `the stylesheet has a rule for step ${RAMP_STEPS + 1}, which the kernel never emits`);
    const gen = require('../../../tools/derive-chart-cat-ink.js');
    assert.equal(gen.RAMP_STEPS, RAMP_STEPS, 'the generator writes a different number of stops than the kernel emits');
    assert.equal(gen.RAMP_LO, MIX_FLOOR, "the generator's ramp floor differs from the kernel's");
    assert.equal(gen.RAMP_HI, MIX_TOP, "the generator's ramp top differs from the kernel's");
  });
});

describe('heatmap — every shipped palette carries an AA-clean ramp', () => {
  // THE GATE THAT MATTERS, and it is cheap: pure color math over the committed
  // theme files, no browser. `derive-chart-cat-ink.js --check` asserts the same
  // thing inside build:check; this runs it in the unit tier so a palette edit
  // fails in seconds rather than at the end of a build.
  //
  // It re-derives the fill from the COMMITTED --heatmap-stepN rather than from
  // the solver, so a theme hand-edited to a prettier number fails here even
  // though the ink it is paired with is untouched.
  const gen = require('../../../tools/derive-chart-cat-ink.js');

  test('every committed ramp climbs, and stays inside the kernel\'s ends', () => {
    // A nudge may pull a stop off even spacing but must never invert the ramp or
    // escape [MIX_FLOOR, MIX_TOP] — outside those the low stop stops being
    // distinguishable from an unmeasured cell, which is the floor's whole job.
    for (const theme of gen.rampPalettes()) {
      const { mixes } = gen.rampFor(theme);
      assert.equal(mixes.length, RAMP_STEPS, `${theme}: wrong number of stops`);
      let prev = -Infinity;
      for (const m of mixes) {
        assert.ok(m > prev, `${theme}: stops went backwards at ${m}`);
        assert.ok(m >= MIX_FLOOR && m <= MIX_TOP, `${theme}: stop ${m}% is outside the ramp`);
        prev = m;
      }
    }
  });

  test('every base palette has a block, and every pair clears AA on its own cell', () => {
    const palettes = gen.rampPalettes();
    assert.ok(palettes.length >= 19, `only ${palettes.length} palettes carry a ramp`);
    const failures = palettes.flatMap((t) => gen.rampContrastFailures(t));
    assert.deepEqual(failures, [], 'a committed ramp pair does not clear AA on the fill it sits on');
  });
});

describe('heatmap — capacity is reported, never silently dropped', () => {
  test('columns past the cap are reported', () => {
    const cols = Array.from({ length: MAX_COLS + 3 }, (_, i) => `  - C${i} \`${i + 1}\``).join('\n');
    const model = parseHeatmap(ul(`- Row A\n${cols}\n- Row B\n${cols}\n`));
    assert.equal(model.cols.length, MAX_COLS);
    assert.equal(model.overflowCols.length, 3,
      'the columns that did not fit must be named, not dropped in silence');
  });

  test('rows past the cap are reported', () => {
    const rows = Array.from({ length: MAX_ROWS + 2 },
      (_, i) => `- R${i}\n  - M0 \`${i + 1}\`\n  - M1 \`${i + 2}\``).join('\n');
    const model = parseHeatmap(ul(rows));
    assert.equal(model.rows.length, MAX_ROWS);
    assert.equal(model.overflowRows.length, 2);
  });

  test('the domain is taken from the rows that SURVIVE the cap', () => {
    // A value on a row that did not make it must not stretch the ramp every
    // painted cell is read against.
    const rows = Array.from({ length: MAX_ROWS + 1 },
      (_, i) => `- R${i}\n  - M0 \`${i === MAX_ROWS ? 9999 : i + 1}\``
        + `\n  - M1 \`${i + 2}\``).join('\n');
    const model = parseHeatmap(ul(rows));
    assert.ok(model.max < 9999, 'a dropped row must not set the maximum');
  });
});

describe('heatmap — the accessible description', () => {
  const svg = buildHeatmap(parseHeatmap(ul(GRID)), {});
  const desc = (svg.match(/<desc>([^<]*)<\/desc>/) || ['', ''])[1];

  test('it states the shape and the range', () => {
    assert.match(desc, /2 rows by 3 columns/);
    assert.match(desc, /44 to 100/);
  });

  test('it summarizes each row rather than reciting every crossing', () => {
    // A 10x12 matrix is 120 numbers; a reader made to hear all of them has been
    // handed the raw data instead of the finding.
    assert.match(desc, /Jan peaks at M0/);
    assert.match(desc, /Feb peaks at M0/);
  });

  test('it counts the crossings that carry no value, in agreeing grammar', () => {
    const one = buildHeatmap(parseHeatmap(ul('- Jan\n  - M0 `1`\n  - M1 `2`\n- Feb\n  - M0 `3`\n')), {});
    assert.match(one, /1 crossing carries no value/);
    const two = buildHeatmap(parseHeatmap(ul('- Jan\n  - M0 `1`\n  - M1 `2`\n- Feb\n')), {});
    assert.match(two, /2 crossings carry no value/);
  });
});
