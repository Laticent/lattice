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
const { JSDOM } = require('jsdom');

// Query the RENDERED SVG through a real parser rather than by regex. The first
// cut scraped it with patterns like /<text class="chart-key-label"[^>]*>(…)/,
// which CodeQL flagged as polynomial backtracking on library input (6 alerts),
// and /<[^>]*>/ as incomplete sanitization — both fair: hand-rolled HTML
// scraping is exactly the shape that bites. A parser also reads better, since
// an assertion about a swatch should query a swatch.
const parse = (svg) => new JSDOM(`<!doctype html><body>${svg}</body>`).window.document;
const textsOf = (svg, sel) => [...parse(svg).querySelectorAll(sel)].map((n) => n.textContent);

const {
  parseHeatmapTable, readCell, buildHeatmap, deriveBands, liftLabelSet, cellMarks, transformSection,
  MAX_COLS, MAX_ROWS, MIX_FLOOR, MIX_TOP, RAMP_STEPS, stepFor, rampBreaks,
} = require('../../../lib/components/chart/heatmap/heatmap.transform');

const md = new MarkdownIt({ html: true });
/** The `<table>` HTML of an authored body — what the kernel takes. */
const tbl = (body) => (md.render(body).match(/<table>[\s\S]*<\/table>/) || [''])[0];

/** A matrix as an author writes it: header names the columns, each row leads with
 *  its label, a BLANK cell is a crossing nobody measured. */
const grid = (...rows) => tbl(['|  | M0 | M1 | M2 |', '| --- | --: | --: | --: |', ...rows].join('\n'));

const GRID = grid('| Jan | 100 | 62 | 48 |', '| Feb | 100 | 58 | 44 |');

/** A TWO-column matrix, for the arms that count empty crossings exactly — a
 *  three-column helper would add a phantom blank to every row. */
const grid2 = (...rows) => tbl(['|  | M0 | M1 |', '| --- | --: | --: |', ...rows].join('\n'));

describe('heatmap — what it refuses to draw', () => {
  test('a header with no column names is declined', () => {
    // Only the corner cell, so there is no second dimension to cross. The
    // FLAT-list case this replaced cannot be written as a table at all: a value
    // in a table always sits under a column name, so the shape that used to be
    // ambiguous simply has no spelling here.
    assert.equal(parseHeatmapTable(tbl('|  |\n| --- |\n| Jan |\n')), null);
  });

  test('a header-only table is declined', () => {
    assert.equal(parseHeatmapTable(tbl('|  | M0 | M1 |\n| --- | --: | --: |\n')), null);
  });

  test('rows with labels but no numbers anywhere are declined', () => {
    assert.equal(parseHeatmapTable(grid('| Jan | n/a | tbd |  |')), null);
  });
});

describe('a cell can carry its own annotation', () => {
  // The table has no sublist channel, so a cell's "why" rides a `# prose` sigil
  // in the cell itself. The arms below hold the two things that makes or breaks:
  // the annotation must not disturb the VALUE, and the sigil must not eat the
  // `#`-leading strings an author legitimately writes.
  test('the prose is captured and the value is left exactly as authored', () => {
    assert.deepEqual(readCell('62 <code># dipped after the onboarding change</code>'),
      { raw: '62', detail: 'dipped after the onboarding change' });
  });

  test('an annotated cell measures as the same number as a bare one', () => {
    assert.equal(readCell('62 <code># why</code>').raw, readCell('62').raw);
  });

  test('a hex color or an issue ref is NOT an annotation', () => {
    // Measured over the shipped decks: 12 inline-code spans start with `#` and
    // they are hex colors, issue refs and quoted heading syntax. Requiring the
    // SPACE is what separates prose from a literal an author pasted in.
    assert.equal(readCell('62 <code>#7DE38A</code>').detail, '');
    assert.equal(readCell('62 <code>#1311</code>').detail, '');
  });

  test('a cell with no annotation reports none', () => {
    assert.equal(readCell('100').detail, '');
  });

  test('the annotated crossing SURVIVES — the failure a trailing pill caused', () => {
    // A second value pill made the cell vanish (readLeadValue takes the LAST
    // <code>), and a heatmap paints a vanished crossing as unmeasured — so the
    // slide asserted something false about the data. This is that regression.
    const m = parseHeatmapTable(grid2('| Jan | 100 | 62 `# dipped` |', '| Feb | 100 | 58 |'));
    assert.equal(m.rows[0].cells.filter(Boolean).length, 2, 'the annotated cell must still be a cell');
    assert.equal(m.rows[0].cells[1].num, 62);
    assert.equal(m.rows[0].cells[1].detail, 'dipped');
  });
});

describe('heatmap — a missing cell is not a zero', () => {
  const model = parseHeatmapTable(grid2('| Jan | 100 | 62 |', '| Feb | 100 |  |'));

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
    const m = parseHeatmapTable(grid2('| Jan | 0 | 50 |', '| Feb | 25 | 75 |'));
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

  const evenBreaks = rampBreaks(Array.from({ length: 101 }, (_, i) => i));

  test('a value maps to a step in range, and the extremes land on the ends', () => {
    assert.equal(stepFor(0, evenBreaks), 1, 'the matrix minimum takes the first stop');
    assert.equal(stepFor(100, evenBreaks), RAMP_STEPS, 'the maximum takes the last, not one past it');
    for (let v = 0; v <= 100; v += 1) {
      const s = stepFor(v, evenBreaks);
      assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS, `stepFor(${v}) = ${s} is off the ramp`);
    }
  });

  test('steps never go backwards as the value climbs', () => {
    let prev = 0;
    for (let v = 0; v <= 100; v += 1) {
      const s = stepFor(v, evenBreaks);
      assert.ok(s >= prev, `stepFor(${v}) = ${s} dropped below ${prev} — the ramp must be monotonic`);
      prev = s;
    }
  });

  test('a FLAT matrix takes the middle step rather than reading as all-maximum', () => {
    // Every value identical means there are no boundaries to cut, so `rampBreaks`
    // returns none. Counting boundaries a value clears would otherwise put every
    // cell at the TOP step, which reads as a matrix that is maximal everywhere.
    assert.deepEqual(rampBreaks([50, 50, 50]), []);
    const s = stepFor(50, rampBreaks([50, 50, 50]));
    assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS, 'a flat matrix must still paint');
    assert.equal(s, Math.ceil(RAMP_STEPS / 2), 'a matrix with no gradient sits mid-ramp');
  });

  // The classing is QUANTILE, not equal-interval, and this is the arm that says so.
  // Equal-interval spends the ramp on empty range whenever the data is skewed —
  // and a heatmap's data usually is. Measured across every heatmap slide we ship,
  // equal-interval used all five tones on 1 of 8 (mean 4.13 of 5); quantile uses
  // all five on 8 of 8. The flagship slide below is the worst case: its M0 column
  // is 100% by construction, which pins the top of the range while everything the
  // headline is about clusters low.
  test('the classing cuts at quantiles, so a skewed matrix still uses the whole ramp', () => {
    const retention = [100, 62, 48, 44, 100, 58, 44, 41, 100, 71, 59, 55, 100, 69, 57];
    const breaks = rampBreaks(retention);
    const steps = retention.map((v) => stepFor(v, breaks));
    assert.equal(new Set(steps).size, RAMP_STEPS,
      `the shipped flagship matrix uses ${new Set(steps).size} of ${RAMP_STEPS} tones — the ramp is being wasted`);

    // Equal interval on the same numbers, for the contrast this arm exists to pin.
    const min = Math.min(...retention), max = Math.max(...retention);
    const evenSteps = retention.map((v) =>
      Math.max(1, Math.min(RAMP_STEPS, Math.floor((v - min) / (max - min) * RAMP_STEPS) + 1)));
    assert.ok(new Set(evenSteps).size < RAMP_STEPS,
      'equal interval is supposed to waste a tone here — if it no longer does, this arm has stopped measuring anything');

    // And the boundaries are the data's own, so the extremes still anchor the ends.
    assert.equal(stepFor(41, breaks), 1, 'the minimum takes the first stop');
    assert.equal(stepFor(100, breaks), RAMP_STEPS, 'the maximum takes the last');
  });

  test('every cell and every value carries a step, and they agree', () => {
    const svg = buildHeatmap(parseHeatmapTable(GRID), {});
    const cells = [...svg.matchAll(/<rect class="heatmap-cell"[^>]*data-step="(\d+)"[^>]*data-value="([^"]*)"/g)];
    assert.ok(cells.length > 0, 'no cells carried a step');
    const values = [...svg.matchAll(/<text class="heatmap-value"[^>]*data-step="(\d+)"/g)];
    assert.ok(values.length > 0, 'no printed value carried a step');
    for (const [, step] of [...cells, ...values]) {
      const n = Number(step);
      // The message does NOT spell the attribute back out. `step` is read out of
      // rendered HTML, so `attr="${step}"` is attribute-shaped text built from a
      // tainted value — which CodeQL flags as incomplete attribute sanitization
      // (code-scanning/271) and is right to, even though this string is only ever
      // an assertion message. Naming the value plainly costs nothing and says the
      // same thing.
      assert.ok(n >= 1 && n <= RAMP_STEPS, `step ${JSON.stringify(step)} is outside the ramp`);
    }
  });

  test('the kernel emits NO color — the ramp lives in the theme', () => {
    // HARD RULE #3, and the reason a rendered deck stays theme-swappable: the
    // same HTML has to paint correctly under all 33 palettes, so a mix percentage
    // or an ink baked in here would be wrong the moment the stylesheet changed.
    const svg = buildHeatmap(parseHeatmapTable(GRID), {});
    assert.doesNotMatch(svg, /--mix\s*:/, 'the kernel must not set a mix percentage');
    assert.doesNotMatch(svg, /#[0-9a-fA-F]{3,8}\b/, 'the kernel must not emit a color');
  });

  test('the step count agrees with the stylesheet and the generator', () => {
    // Three places encode it and none can see the others at runtime. A drift here
    // pairs an ink with a fill it was not solved against, which no test that
    // looks at only one side can catch.
    const css = fs.readFileSync(
      path.join(__dirname, '../../../lib/components/chart/heatmap/heatmap.styles.css'), 'utf8');
    // MATCH THE WHOLE RULE, not the token name. `css.includes('--heatmap-step1')`
    // is satisfied by the substring inside `--heatmap-step1-ink`, so the first cut
    // of this arm passed while step 1's cell read step 3's position — an ink paired
    // with a fill it was never solved against, which is the exact failure the arm
    // exists to catch. Assert the PAIRING: rule N reads token N.
    for (let n = 1; n <= RAMP_STEPS; n += 1) {
      const cellRule = new RegExp(
        `\\.heatmap-cell\\[data-step="${n}"\\][^{]*\\{[^}]*--mix:\\s*var\\(--heatmap-step${n}(?![\\w-])`);
      const valueRule = new RegExp(
        `\\.heatmap-value\\[data-step="${n}"\\][^{]*\\{[^}]*fill:\\s*var\\(--heatmap-step${n}-ink(?![\\w-])`);
      assert.match(css, cellRule, `step ${n}'s cell rule does not read --heatmap-step${n}`);
      assert.match(css, valueRule, `step ${n}'s value rule does not read --heatmap-step${n}-ink`);
    }

    // THE CSS FALLBACK NUMBERS describe the ramp for a theme with no generated
    // block, so they have to be the ramp the kernel and generator agree on. Nothing
    // else ties them to MIX_FLOOR / MIX_TOP / RAMP_STEPS: move MIX_TOP and they
    // would silently keep describing the old ends.
    for (let n = 1; n <= RAMP_STEPS; n += 1) {
      const even = MIX_FLOOR + ((MIX_TOP - MIX_FLOOR) * (n - 1)) / (RAMP_STEPS - 1);
      const want = `var(--heatmap-step${n}, ${Number(even.toFixed(2))}%)`;
      assert.ok(css.includes(want), `step ${n}'s fallback should be ${want} — the evenly spaced position`);
    }
    assert.ok(!css.includes(`data-step="${RAMP_STEPS + 1}"`),
      `the stylesheet has a rule for step ${RAMP_STEPS + 1}, which the kernel never emits`);
    const gen = require('../../../tools/derive-chart-cat-ink.js');
    assert.equal(gen.RAMP_STEPS, RAMP_STEPS, 'the generator writes a different number of stops than the kernel emits');
    assert.equal(gen.RAMP_LO, MIX_FLOOR, "the generator's ramp floor differs from the kernel's");
    assert.equal(gen.RAMP_HI, MIX_TOP, "the generator's ramp top differs from the kernel's");

    // FIVE ENCODINGS OF THE COUNT, not three. `lib/theme/derive.js` writes the
    // Studio's ramp from a bare literal, and it passes neither `steps` nor
    // `lo`/`hi` to solveHeatmapRamp — so it rides that module's defaults. Raise
    // RAMP_STEPS in the kernel and the generator and every Studio theme would
    // quietly keep five stops, with the two pins above still green.
    const derive = fs.readFileSync(path.join(__dirname, '../../../lib/theme/derive.js'), 'utf8');
    const literal = derive.match(/heatmap: \[\s*\.\.\.Array\.from\(\{ length: (\d+) \}/);
    assert.ok(literal, "could not find derive.js's heatmap REQUIRED_TOKENS literal");
    assert.equal(Number(literal[1]), RAMP_STEPS, "derive.js declares a different number of heatmap tokens than the kernel emits steps");
    const recipe = fs.readFileSync(path.join(__dirname, '../../../lib/theme/cat-ink.js'), 'utf8');
    const defaults = recipe.match(/lo = (\d+(?:\.\d+)?), hi = (\d+(?:\.\d+)?), steps = (\d+)/);
    assert.ok(defaults, 'could not find solveHeatmapRamp\'s defaults');
    assert.deepEqual(
      [Number(defaults[1]), Number(defaults[2]), Number(defaults[3])],
      [MIX_FLOOR, MIX_TOP, RAMP_STEPS],
      "solveHeatmapRamp's defaults differ from the kernel's ramp — derive.js rides them without passing its own");

    // AND THE ANCHOR, which is one input further up than everything above and was
    // pinned by nothing. The cell's fill is the hue mixed over `--heatmap-base`, and
    // `--heatmap-base` is `16%` of the muted mark over the canvas — a number that
    // lives in the stylesheet and is HAND-COPIED into four more places: the theme
    // solve, the print solve, the print GATE, and the Studio.
    //
    // Re-tune it in the stylesheet alone and every generated ink is solved against a
    // fill that no longer paints, while `derive-chart-cat-ink.js --check` stays green
    // — because the check recomputes the fill from its own copy. That is precisely
    // the shape of the three bugs this component already shipped and fixed (the
    // print band at 1.40:1, the Studio hue at 3.68:1, the standalone export at
    // 1.98:1): a gate re-asking the producer the question the producer answered.
    // The knob is real — the stylesheet's own docblock records the anchor having
    // been changed once already — so the mirror gets a pin like the rest.
    const anchorPct = css.match(/--heatmap-base:\s*color-mix\(in oklab, var\(--muted-mark\) ([\d.]+)%/);
    assert.ok(anchorPct, 'could not find --heatmap-base in the stylesheet');
    const ANCHOR = Number(anchorPct[1]);
    for (const decl of css.match(/--heatmap-base:[^;]+;/g) || []) {
      assert.ok(decl.includes(`var(--muted-mark) ${ANCHOR}%`),
        `a second --heatmap-base declaration uses a different anchor than ${ANCHOR}% — the two canvases would diverge`);
    }
    const genSrc = fs.readFileSync(path.join(__dirname, '../../../tools/derive-chart-cat-ink.js'), 'utf8');
    const genAnchors = genSrc.match(/color-mix\(in oklab, \$\{muted\} ([\d.]+)%, \$\{bg\}\)/g) || [];
    assert.ok(genAnchors.length >= 3,
      `expected the generator to build the anchor in the theme solve, the print solve and the print check — found ${genAnchors.length}`);
    for (const a of genAnchors) {
      assert.ok(a.includes(`\${muted} ${ANCHOR}%`),
        `the generator mixes the anchor at a different percentage than the stylesheet's ${ANCHOR}%: ${a}`);
    }
    const deriveAnchors = derive.match(/mix\((?:e\.bg|darkBgDeeper), mutedMark(?:Light|Dark), ([\d.]+)\)/g) || [];
    assert.equal(deriveAnchors.length, 2, "expected derive.js to build the anchor for both canvases");
    for (const a of deriveAnchors) {
      const pct = Number(a.match(/, ([\d.]+)\)$/)[1]) * 100;
      assert.ok(Math.abs(pct - ANCHOR) < 1e-9,
        `derive.js mixes the Studio anchor at ${pct}% against the stylesheet's ${ANCHOR}%`);
    }
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
  test('the PRINT band carries its own ramp, and every pair clears AA there', () => {
    // THE THIRD CANVAS. `section.print` is not a color-scheme flip — it remaps
    // --bg, --muted-mark and --chart-cat1 to the universal --print-* band, so
    // every input to the fill moves while light-dark() stays on its light arm.
    // Before the band had its own ramp, the theme's ink painted on the print
    // fill: 47 of 95 pairs below AA, worst 1.40:1 on `carbone` — worse than the
    // failure that got the printed value withdrawn in the first place. Neither
    // the generator's own --check nor any browser sweep of the two theme canvases
    // could see it, because both re-ask the question the generator answered.
    assert.deepEqual(gen.printContrastFailures(), [],
      'a committed print-band pair does not clear AA on the fill it sits on');
  });

  test('the print band REMAPS both the stops and the inks', () => {
    // Remapping the inks alone would pair a print ink with a palette-nudged stop,
    // which is the same ink-meets-an-unfamiliar-fill defect one level down.
    const band = fs.readFileSync(
      path.join(__dirname, '../../../lib/base/base.modifiers.css'), 'utf8');
    const print = band.slice(band.indexOf('section.print {'));
    for (let n = 1; n <= RAMP_STEPS; n += 1) {
      assert.ok(print.includes(`--heatmap-step${n}: var(--print-heatmap-step${n})`),
        `the print band does not remap --heatmap-step${n}`);
      assert.ok(print.includes(`--heatmap-step${n}-ink: var(--print-heatmap-step${n}-ink)`),
        `the print band does not remap --heatmap-step${n}-ink`);
    }
  });

});

describe('heatmap — capacity is reported, never silently dropped', () => {
  test('columns past the cap are reported', () => {
    const names = Array.from({ length: MAX_COLS + 3 }, (_, i) => `C${i}`);
    const vals = names.map((_, i) => i + 1);
    const model = parseHeatmapTable(tbl([
      `|  | ${names.join(' | ')} |`,
      `| --- |${' --: |'.repeat(names.length)}`,
      `| Row A | ${vals.join(' | ')} |`,
      `| Row B | ${vals.join(' | ')} |`,
    ].join('\n')));
    assert.equal(model.cols.length, MAX_COLS);
    assert.equal(model.overflowCols.length, 3,
      'the columns that did not fit must be named, not dropped in silence');
  });

  test('rows past the cap are reported', () => {
    const model = parseHeatmapTable(tbl(['|  | M0 | M1 |', '| --- | --: | --: |',
      ...Array.from({ length: MAX_ROWS + 2 }, (_, i) => `| R${i} | ${i + 1} | ${i + 2} |`)].join('\n')));
    assert.equal(model.rows.length, MAX_ROWS);
    assert.equal(model.overflowRows.length, 2);
  });

  // The block above pins the model FIELD. For one commit that was all it pinned,
  // and nothing read the field — so a 14-column deck lost two columns of authored
  // data with no signal on the slide, in the `<desc>`, or anywhere else, while a
  // test called "never silently dropped" stayed green. A capacity report nobody
  // reads is not a report.
  test('what the cap cut reaches the reader, not just the model', () => {
    const names = Array.from({ length: MAX_COLS + 2 }, (_, i) => `C${i}`);
    const vals = names.map((_, i) => i + 1);
    const model = parseHeatmapTable(tbl([
      `|  | ${names.join(' | ')} |`,
      `| --- |${' --: |'.repeat(names.length)}`,
      ...Array.from({ length: MAX_ROWS + 2 }, (_, i) => `| R${i} | ${vals.join(' | ')} |`),
    ].join('\n')));
    const desc = (buildHeatmap(model, {}).match(/<desc>([^<]*)<\/desc>/) || ['', ''])[1];
    for (const name of [...model.overflowCols, ...model.overflowRows]) {
      assert.ok(desc.includes(name), `${name} was cut by the cap and the description never says so`);
    }
  });

  test('a grid inside the cap says nothing about overflow', () => {
    const desc = (buildHeatmap(parseHeatmapTable(GRID), {}).match(/<desc>([^<]*)<\/desc>/) || ['', ''])[1];
    assert.doesNotMatch(desc, /Not shown/, 'a grid that fits must not carry an overflow sentence');
  });

  test('the domain is taken from the rows that SURVIVE the cap', () => {
    // A value on a row that did not make it must not stretch the ramp every
    // painted cell is read against.
    const model = parseHeatmapTable(tbl(['|  | M0 | M1 |', '| --- | --: | --: |',
      ...Array.from({ length: MAX_ROWS + 1 },
        (_, i) => `| R${i} | ${i === MAX_ROWS ? 9999 : i + 1} | ${i + 2} |`)].join('\n')));
    assert.ok(model.max < 9999, 'a dropped row must not set the maximum');
  });
});

// The guard measures an ADVANCE; the slide paints a FACE. When those disagree the
// whole grid goes at once, because every cell is the same width — so this is the
// all-or-nothing arm, not a rounding one.
// Four places assume `data-step` is an integer in 1..RAMP_STEPS: the stylesheet's
// five rule pairs, the generator's five token pairs, the print band's remap, and
// the tests. A step outside that range matches no rule, so `--mix` is never set,
// `color-mix()` is invalid at computed-value time, and the cell paints the
// inherited BLACK — the signature the repo keeps a whole gate for.
describe('heatmap — every step lands inside the ramp', () => {
  test('a span that overflows a double does not produce NaN', () => {
    // `max > min` holds and the ratio is still not finite: both terms go Infinity
    // and Infinity/Infinity is NaN. Authorable as plain literals, no API misuse.
    // Quantile classing compares against the data's own values, so it never forms
    // the ratio that overflowed. Pinned anyway: this is the contract four other
    // places rely on, and it must not depend on which classing is in force.
    const wide = rampBreaks([-1e308, 0, 1e308]);
    for (const n of [1e308, -1e308, 0, Number.NaN, Number.POSITIVE_INFINITY]) {
      const s = stepFor(n, wide);
      assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS, `stepFor(${n}) = ${s}, off the ramp`);
    }
  });

  test('no input drives the step out of 1..RAMP_STEPS', () => {
    const sets = [
      [0, 25, 50, 75, 100], [41, 44, 48, 100], [5, 5, 5], [-1e308, 0, 1e308],
      [0, 1e-16], [-10, -5, -1], [0, Number.MAX_VALUE], [7], [],
    ];
    for (const vals of sets) {
      const breaks = rampBreaks(vals);
      const probes = [...vals, 0, -1, 1e9, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY];
      for (const n of probes) {
        const s = stepFor(n, breaks);
        assert.ok(Number.isInteger(s) && s >= 1 && s <= RAMP_STEPS,
          `stepFor(${n}, breaks of ${JSON.stringify(vals)}) = ${s}, outside 1..${RAMP_STEPS}`);
      }
    }
  });
});

describe('heatmap — the fit guard reads the face the slide will paint', () => {
  const { readsHandBody } = require('../../../lib/components/chart/_chart-family/transform-utils');

  test('sketch-clean is measured on the CLEAN face, not the hand one', () => {
    // `mode: sketch-clean` resolves to `sketch sketch-clean-body`, and that token
    // puts `--font-body` — which `.heatmap-value` names — back on the clean face.
    // A `includes('sketch')` test measures the hand advance against clean glyphs,
    // 50% too wide, and refuses every value in the grid. Measured on a 12-column
    // matrix of four-digit values: all 72 printed numbers lost, silently.
    assert.equal(readsHandBody(['sketch', 'sketch-clean-body']), false,
      'sketch-clean paints the clean body face, so it must not take the hand advance');
    assert.equal(readsHandBody(['sketch']), true, 'plain sketch does paint the hand face');
    const src = fs.readFileSync(
      path.join(__dirname, '../../../lib/components/chart/heatmap/heatmap.transform.js'), 'utf8');
    assert.match(src, /readsHandBody\(ctx\.classTokens/,
      'the fit guard must ask the family predicate, never test for a `sketch` substring');
    assert.doesNotMatch(src, /classTokens \|\| \[\]\)\.includes\('sketch'\)/,
      'a bare sketch substring test is the defect this arm exists to catch');
  });
});

describe('heatmap — the accessible description', () => {
  const svg = buildHeatmap(parseHeatmapTable(GRID), {});
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
    const one = buildHeatmap(parseHeatmapTable(grid2('| Jan | 1 | 2 |', '| Feb | 3 |  |')), {});
    assert.match(one, /1 crossing carries no value/);
    const two = buildHeatmap(parseHeatmapTable(grid2('| Jan | 1 | 2 |', '| Feb |  |  |')), {});
    assert.match(two, /2 crossings carry no value/);
  });
});

describe('the band key', () => {
  // The key is the answer to the one question the printed cell values cannot
  // answer: why are these two cells the same color?
  const model = () => parseHeatmapTable(grid(
    '| Jan | 100 | 62 | 48 |', '| Feb | 100 | 58 | 44 |', '| Mar | 100 | 71 | 59 |'));
  const withBands = (bands) => { const m = model(); m.bands = bands; return m; };
  const labels = (svg) => textsOf(svg, 'text.chart-key-label');

  test('is OPT-IN — a heatmap that did not ask for one is unchanged', () => {
    // Every shipped heatmap was composed without a rail, so turning the key on
    // by default would re-lay-out slides nobody touched.
    const svg = buildHeatmap(model(), {});
    assert.equal(parse(svg).querySelectorAll('.chart-key-swatch').length, 0);
    assert.equal(parse(svg).querySelector('svg').getAttribute('viewBox'), '0 0 320 180',
      'the grid must keep the whole box');
  });

  test('the derived bands name value RANGES, not words', () => {
    // Polarity is unknowable — high retention is good, high churn is bad — and
    // the bands are quantile-cut per matrix, so a word would name different
    // numbers on every slide.
    for (const l of labels(buildHeatmap(withBands([]), {}))) {
      assert.match(l, /^[\d.,]+(–[\d.,]+)?$/, `${l} is not a range`);
    }
  });

  test("an author's words merge over the derived set, band by band", () => {
    const svg = buildHeatmap(withBands([{ key: '1', label: 'Cold' }]), {});
    const got = labels(svg);
    assert.ok(got.includes('Cold'), 'the named band takes the word');
    assert.ok(got.some((l) => /^[\d.,]+(–[\d.,]+)?$/.test(l)),
      'the bands the author did not name stay derived — that is the whole point');
  });

  test('only the bands the matrix USES are keyed', () => {
    // A quantile cut over few distinct values leaves steps empty, and an empty
    // band is a key row pointing at a color nowhere on the slide.
    const small = parseHeatmapTable(grid2('| Jan | 100 | 62 |', '| Feb | 100 | 58 |'));
    small.bands = [];
    const keys = deriveBands(small, (n) => String(n)).map((b) => b.key);
    assert.ok(keys.length < RAMP_STEPS, 'a small matrix must not key all five steps');
  });

  test('the swatch carries the cell CLASS, never a resolved fill (HARD RULE #3)', () => {
    // A heatmap cell is painted by CSS color-mix on [data-step]. A fill baked in
    // here would be a color in the kernel, and the key would stop matching the
    // grid the moment the palette changed.
    const swatch = parse(buildHeatmap(withBands([]), {})).querySelector('.chart-key-swatch');
    assert.ok(swatch.classList.contains('heatmap-cell'));
    assert.match(swatch.getAttribute('data-step'), /^\d$/);
    assert.equal(swatch.getAttribute('fill'), null, 'the kernel must not resolve the ramp color');
  });

  test('the bands reach a reader who cannot see them', () => {
    const desc = parse(buildHeatmap(withBands([{ key: '1', label: 'Cold' }]), {}))
      .querySelector('desc').textContent;
    assert.match(desc, /Bands:/, 'a key nobody can see is decoration');
    assert.match(desc, /Cold/);
  });
});

describe('lifting the authored set off the slide', () => {
  const P = (t) => `<p><code>${t}</code></p>`;

  test('finds the set and removes it, so it keys the bands instead of printing', () => {
    const { html, set } = liftLabelSet(`<h2>T</h2>${P('[{1, Cold}, {5, Hot}]')}<table></table>`);
    assert.deepEqual(set, [{ key: '1', label: 'Cold' }, { key: '5', label: 'Hot' }]);
    assert.doesNotMatch(html, /Cold/, 'the set must not also render as a subtitle');
  });

  test('an EYEBROW is not mistaken for a set — and does not stop the search', () => {
    // The regression this arm exists for: a heatmap slide routinely opens with a
    // one-code eyebrow, which sits above the set and matches the same shape.
    // Testing only the FIRST one-code paragraph found the eyebrow, failed to
    // parse it, and gave up — so the set rendered as a subtitle and no key
    // appeared.
    const { html, set } = liftLabelSet(
      `${P('Retention · 2026 cohorts')}<h2>T</h2>${P('[{1, Cold}]')}<table></table>`);
    assert.deepEqual(set, [{ key: '1', label: 'Cold' }]);
    assert.match(html, /Retention · 2026 cohorts/, 'the eyebrow must survive');
  });

  test('a slide with no set is left exactly as it was', () => {
    const src = `${P('Retention · 2026 cohorts')}<h2>T</h2><table></table>`;
    const { html, set } = liftLabelSet(src);
    assert.equal(set, null);
    assert.equal(html, src);
  });
});

describe('a cell annotation reaches both surfaces', () => {
  const slide = (body) => {
    const html = md.render(body);
    return transformSection(html, { cls: 'heatmap', classTokens: ['heatmap'] });
  };
  const RAGGED = ['## T.', '', '|  | M0 | M1 | M2 |', '| --- | --: | --: | --: |',
    '| Jan | 100 | 62 |  |', '| Feb | 90 | 58 `# the one that matters` | 40 |'].join('\n');

  test('the template index matches the rect it describes, across a ragged matrix', () => {
    // The reveal layer looks a template up BY data-mark. A crossing nobody
    // measured still consumes an index on the grid, so the marks have to be
    // counted the same way or the popover opens on the wrong cell.
    const d = parse(slide(RAGGED));
    const tpl = d.querySelector('template.chart-detail');
    assert.ok(tpl, 'an annotated cell must emit a template');
    const rect = d.querySelector(`rect.heatmap-cell[data-mark="${tpl.getAttribute('data-mark')}"]`);
    assert.equal(rect.getAttribute('data-label'), 'Feb · M1',
      'the template points at the cell that was annotated');
  });

  test('the same words fold into the speaker note, so print keeps them', () => {
    assert.match(slide(RAGGED), /Feb · M1 \(58\): the one that matters/);
  });

  test('a heatmap with no annotation emits neither, and is byte-identical', () => {
    const plain = ['## T.', '', '|  | M0 |', '| --- | --: |', '| Jan | 1 |', '| Feb | 2 |'].join('\n');
    const out = slide(plain);
    assert.equal(parse(out).querySelectorAll('template.chart-detail').length, 0);
    assert.ok(!out.includes('<!--'), 'no annotation means no speaker note');
  });

  test('cellMarks counts every crossing, measured or not', () => {
    const m = parseHeatmapTable(grid('| Jan | 1 | 2 |  |', '| Feb | 3 |  | 5 |'));
    assert.equal(cellMarks(m).length, m.rows.length * m.cols.length);
  });
});

describe('the mark index holds its alignment across every matrix shape', () => {
  // The single highest-risk claim in the band-key change, and the reason it gets
  // a property arm rather than an example: `cellMarks` counts crossings
  // row-major over the WHOLE grid while `buildHeatmap` assigns `data-mark` as it
  // paints. Those are two walks of the same matrix, and if they ever disagree by
  // one the reveal layer opens a popover describing the wrong cell — a silent
  // wrong answer on a slide, not a crash. The caps are where they would most
  // plausibly drift, so the shapes deliberately straddle MAX_COLS and MAX_ROWS.
  const grid = (nr, nc, holes, notes) => {
    const cols = Array.from({ length: nc }, (_, i) => `C${i}`);
    const rows = Array.from({ length: nr }, (_, r) => `| R${r} | ${cols.map((_, c) => {
      if (holes.has(`${r},${c}`)) return '';
      const v = r * 7 + c * 3 + 1;
      return notes.has(`${r},${c}`) ? `${v} \`# note-${r}-${c}\`` : String(v);
    }).join(' | ')} |`);
    return tbl([`|  | ${cols.join(' | ')} |`, `| --- |${' --: |'.repeat(nc)}`, ...rows].join('\n'));
  };

  test('every emitted template resolves to the cell that was annotated', () => {
    let checked = 0;
    for (const nr of [1, 3, MAX_ROWS, MAX_ROWS + 2]) {
      for (const nc of [1, 4, MAX_COLS, MAX_COLS + 2]) {
        for (const seed of [0, 1, 2]) {
          const holes = new Set(); const notes = new Set();
          for (let r = 0; r < nr; r += 1) {
            for (let c = 0; c < nc; c += 1) {
              if ((r * 31 + c * 17 + seed * 7) % 5 === 0) holes.add(`${r},${c}`);
              else if ((r * 13 + c * 29 + seed * 3) % 4 === 0) notes.add(`${r},${c}`);
            }
          }
          const out = transformSection(grid(nr, nc, holes, notes), { cls: 'heatmap', classTokens: ['heatmap'] });
          if (!out.includes('heatmap-cell')) continue;
          const d = parse(out);
          for (const t of d.querySelectorAll('template.chart-detail')) {
            const [, r, c] = t.innerHTML.trim().match(/note-(\d+)-(\d+)/);
            const rect = d.querySelector(`rect.heatmap-cell[data-mark="${t.getAttribute('data-mark')}"]`);
            assert.equal(rect?.getAttribute('data-label'), `R${r} · C${c}`,
              `${nr}x${nc} seed ${seed}: template ${t.getAttribute('data-mark')} points at the wrong cell`);
            checked += 1;
          }
        }
      }
    }
    assert.ok(checked > 300, `the sweep must actually exercise the claim — only ${checked} templates`);
  });
});
