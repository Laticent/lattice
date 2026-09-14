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
const MarkdownIt = require('markdown-it');

const {
  parseHeatmap, buildHeatmap, mixFor,
  MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP,
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

describe('heatmap — the ramp', () => {
  test('the minimum sits at the FLOOR, not at zero', () => {
    // At 0% the lowest real value paints the bare anchor — the same fill as a
    // crossing nobody measured, which is the distinction the parse step keeps.
    assert.equal(mixFor(10, 10, 90), MIX_FLOOR);
  });

  test('the maximum sits at the top', () => {
    assert.equal(mixFor(90, 10, 90), MIX_TOP);
  });

  test('it is monotonic across the domain', () => {
    let prev = -Infinity;
    for (let v = 0; v <= 100; v += 5) {
      const m = mixFor(v, 0, 100);
      assert.ok(m >= prev, `mix went backwards at ${v}`);
      prev = m;
    }
  });

  test('a FLAT matrix takes the mid stop rather than dividing by zero', () => {
    const m = mixFor(50, 50, 50);
    assert.ok(Number.isFinite(m), 'a matrix with one distinct value must still paint');
    assert.ok(m > MIX_FLOOR && m < MIX_TOP, 'a flat matrix has no gradient, so it sits mid-ramp');
  });
});

describe('heatmap — nothing is printed ON a cell', () => {
  // The family rule is that labels and values sit on the CANVAS, never on the
  // colored mark (design/skills/chart-component.md). This component shipped an
  // exception to it — the number in the cell, its ink flipping partway along the
  // ramp — and the exception did not survive measurement: no single crossover
  // clears AA across the 33 palettes, and a per-palette one cannot be expressed
  // because `section.dark` flips the canvas per slide. The withdrawal and its
  // numbers are recorded in the transform's own docblock; these two arms are
  // what stops it coming back by accident.

  test('every text in the SVG is a gutter label, never a cell', () => {
    const svg = buildHeatmap(parseHeatmap(ul(GRID)), {});
    // The gutter classes are `heatmap-col-label` for a column name and the
    // substrate's bare `cart-cat` for a row name (svg-label-css-mirror.test.js
    // pins that census). Anything else is text the kernel put in the plot.
    const strays = [...svg.matchAll(/<text class="([^"]*)"[^>]*>/g)]
      .filter((m) => !/^(?:heatmap-col-label cart-cat|cart-cat)$/.test(m[1]))
      .map((m) => m[0]);
    assert.deepEqual(strays, [],
      'a text that is not a gutter label is text on a colored mark — the withdrawn exception');
  });

  test('withdrawing the printed value does not withdraw the value', () => {
    const svg = buildHeatmap(parseHeatmap(ul(GRID)), {});
    assert.match(svg, /data-value="100"/,
      'the number still reaches the mark data, which is what the <desc> and hover read');
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
