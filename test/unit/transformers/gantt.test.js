/**
 * Unit tests for the redesigned gantt — the continuous-time renderer
 * (lib/components/chart/gantt/gantt.transform.js buildGanttChart) and the
 * authoring linter (lib/authoring/lint-core.js findGanttIssues, via lintTextWith).
 *
 * Contract: a task is a nested bullet with trailing inline-code tokens — a span
 * `START..END` (a bar) or a single time point (a milestone diamond), an optional
 * status, an optional `after: Task name` dependency, an optional `milestone`
 * keyword. `..` is the only delimiter. Time points are ISO dates, quarters
 * (Q1 / 2026 Q1), or months (Jan); a chart is date-mode or ordinal-mode. The
 * axis auto-derives; the eyebrow may override it and add a `today` line.
 *
 * Several cases below are regression locks for maker-checker findings on the
 * redesign (2026-06-21-gantt-component-redesign.md): a label word matching a
 * 3-letter month prefix (C1), a solitary date milestone rendering off-screen
 * (S1), lint label extraction diverging from the renderer (S3), lint mode
 * detection ignoring the eyebrow window (S5), and rolled-over invalid dates (N1).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const engine = require('../../../lib/components/chart/_chart-family/chart-family');
const ganttKernel = require('../../../lib/components/chart/gantt/gantt.transform');
const core = require('../../../lib/authoring/lint-core');

const { buildGanttChart, GANTT_GEOM, GANTT_GEOM_TALL, ganttGutter, ganttBandFor } = ganttKernel;
const { extractFirstList } = engine;
const inner = (ul) => extractFirstList(ul).inner;

// The gantt is SVG-native (2026-07-26): marks are <rect>/<polygon> in viewBox
// USER UNITS, not <div>s positioned by --gantt-x / --gantt-w percentages. The
// axis math these tests lock down is unchanged, so the assertions are expressed
// in the same percentages as before by mapping the emitted geometry back onto
// the plot band. Reading the band from GANTT_GEOM (rather than hard-coding it)
// keeps the tests honest if the geometry is ever retuned.
const PLOT_X0 = GANTT_GEOM.laneW + GANTT_GEOM.gutter;
const PLOT_W = GANTT_GEOM.vbW - GANTT_GEOM.padRight - PLOT_X0;
// Bars carry a thin inter-bar gutter so adjacent spans don't touch. DERIVED, not
// restated: a literal here went stale the moment the gutter was retuned (1.5 ->
// 2.5, to open a real gap between two tasks that abut on the axis), and a stale
// literal makes these axis assertions silently wrong rather than loudly red.
const BAR_INSET = ganttGutter(GANTT_GEOM);
const pctOfPlot = (x) => ((x - PLOT_X0) / PLOT_W) * 100;

const attrNum = (html, re) => {
  const m = html.match(re);
  return m ? Number(m[1]) : null;
};
// A bar's start, as a percentage of the axis.
const barX = (html) => {
  const x = attrNum(html, /class="gantt-bar"[^>]*\sx="([-\d.]+)"/);
  return x == null ? null : round3(pctOfPlot(x - BAR_INSET));
};
// A bar's span, as a percentage of the axis.
const barW = (html) => {
  const w = attrNum(html, /class="gantt-bar"[^>]*\swidth="([-\d.]+)"/);
  return w == null ? null : round3(((w + BAR_INSET * 2) / PLOT_W) * 100);
};
// A milestone diamond's center, as a percentage of the axis. The polygon's
// points are "cx,top cx+r,mid cx,bottom cx-r,mid" — the first x IS the center.
const milestoneX = (html) => {
  const m = html.match(/class="gantt-milestone"[^>]*points="([-\d.]+),/);
  return m ? round3(pctOfPlot(Number(m[1]))) : null;
};
// The today rule's x, as a percentage of the axis.
const todayX = (html) => {
  const m = html.match(/class="gantt-today"[^>]*>\s*<line x1="([-\d.]+)"/);
  return m ? round3(pctOfPlot(Number(m[1]))) : null;
};
const round3 = (n) => Math.round(n * 1000) / 1000;

const GANTT_VOCAB = { names: new Set(['gantt', 'list']), modifiers: new Set() };
const lintGantt = (deck) =>
  core.lintTextWith(deck, GANTT_VOCAB).filter((f) => f.classToken === 'gantt');
const deck = (body) => `---\nmarp: true\n---\n\n<!-- _class: gantt -->\n\n${body}\n`;

describe('gantt renderer — continuous time scale', () => {
  test('inclusive ordinal span: Q1..Q2 covers two of four quarters', () => {
    const ul = `<ul><li>Lane<ul>
      <li>A <code>Q1..Q2</code> <code>done</code></li>
    </ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code></p>');
    // 4-quarter window → Q1..Q2 starts at 0 and spans 50%.
    assert.equal(barX(out), 0);
    assert.equal(barW(out), 50);
  });

  test('a single time point renders a milestone diamond, not a bar', () => {
    const ul = `<ul><li>Lane<ul>
      <li>GA <code>Q4</code></li>
    </ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code></p>');
    assert.match(out, /gantt-milestone/);
    assert.doesNotMatch(out, /class="gantt-bar"/);
    // Q4 starts at 75% of a four-quarter axis.
    assert.equal(milestoneX(out), 75);
  });

  test('date mode places bars on a day-accurate scale + derives the axis', () => {
    const ul = `<ul><li>Build<ul>
      <li>Alpha <code>2026-01-01..2026-04-01</code></li>
    </ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '');
    // Axis auto-derives to [Jan 1, Apr 1] → the only bar fills the whole width.
    assert.equal(barX(out), 0);
    assert.equal(barW(out), 100);
  });

  test('opt-in today line is emitted only when the eyebrow asks for it', () => {
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q4</code></li></ul></li></ul>`;
    const withToday = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code> <code>today Q3</code></p>');
    assert.match(withToday, /gantt-today/);
    assert.equal(todayX(withToday), 50); // Q3 start of 4
    const without = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code></p>');
    assert.doesNotMatch(without, /gantt-today/);
  });

  test('status tints the bar + emits a legend chip', () => {
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q2</code> <code>at-risk</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code></p>');
    assert.match(out, /class="gantt-bar"[^>]*data-s="at-risk"/);
    // The key chip is an SVG swatch now, keyed by the same status.
    assert.match(out, /gantt-legend-swatch"[^>]*data-s="at-risk"/);
  });

  // S1 regression — a solitary date milestone used to land at left:513175% (axis
  // fell back to 0..4 in ordinal units against an epoch-day value).
  test('regression(S1): a lone date milestone stays on-screen', () => {
    const ul = `<ul><li>L<ul><li>Launch <code>2026-07-15</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '');
    const x = milestoneX(out);
    assert.ok(x >= 0 && x <= 100, `milestone x=${x} should be within [0,100]`);
    assert.equal(x, 50); // padded window centers a solitary point
  });

  // S2 regression — a task reaching beyond an explicit eyebrow window must clip
  // at the frame, not overflow with a negative / >100 offset.
  test('regression(S2): bars clamp to an explicit window', () => {
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q4</code></li></ul></li></ul>`;
    // Window is only Q2..Q3, but the task spans Q1..Q4.
    const out = buildGanttChart(inner(ul), '<p><code>2026 Q2 .. 2026 Q3</code></p>');
    const x = barX(out);
    const w = barW(out);
    assert.ok(x >= -0.001 && x + w <= 100.001, `x=${x} w=${w} should stay within frame`);
  });

  // C1 regression — a label word with a valid 3-letter month prefix must NOT be
  // read as a time point (would silently become a milestone/span endpoint).
  test('regression(C1): a label word is not mistaken for a month', () => {
    const ul = `<ul><li>L<ul><li>Marketing push <code>done</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '');
    // No valid span → unscaled placeholder, never a milestone.
    assert.match(out, /gantt-bar--unscaled/);
    assert.doesNotMatch(out, /gantt-milestone/);
  });
});

describe('gantt linter — typed-token validation', () => {
  test('a clean deck (chained boundary spans + milestone) has no findings', () => {
    const clean = deck(`## Plan

- Framework
  - Signal taxonomy \`Q1..Q2\` \`done\`
  - Scoring model v2 \`Q2..Q3\` \`live\` \`after: Signal taxonomy\`
  - GA \`Q4\` \`milestone\` \`after: Scoring model v2\``);
    assert.deepEqual(lintGantt(clean), []);
  });

  test('retired delimiter is an error with a `..` fix', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `Q1 → Q2` `done`'));
    const hit = f.find((x) => x.rule === 'gantt-retired-delimiter');
    assert.ok(hit, 'expected gantt-retired-delimiter');
    assert.equal(hit.severity, 'error');
    assert.match(hit.fix, /Q1\.\.Q2/);
  });

  test('a malformed span is flagged', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `Q9..Zz`'));
    assert.ok(f.some((x) => x.rule === 'gantt-bad-span' && x.severity === 'error'));
  });

  test('an unrecognized token warns', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `Q1..Q2` `dnoe`'));
    assert.ok(f.some((x) => x.rule === 'gantt-unknown-token' && x.severity === 'warning'));
  });

  test('a dangling after: (names no task) is an error', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `Q1..Q2` `after: Ghost`'));
    assert.ok(f.some((x) => x.rule === 'gantt-dangling-after'));
  });

  test('an inverted dependency warns, but a boundary overlap does not', () => {
    const inverted = deck('## P\n\n- L\n  - A `Q3..Q4`\n  - B `Q1..Q2` `after: A`');
    assert.ok(lintGantt(inverted).some((x) => x.rule === 'gantt-inverted-dependency'));
    // B follows A sharing the Q2 boundary — idiomatic phasing, NOT inverted.
    const ok = deck('## P\n\n- L\n  - A `Q1..Q2`\n  - B `Q2..Q3` `after: A`');
    assert.ok(!lintGantt(ok).some((x) => x.rule === 'gantt-inverted-dependency'));
  });

  // C1 regression — the linter must flag a month-prefix label word as unknown,
  // not silently accept it as a valid time point.
  test('regression(C1): a month-prefix word is flagged, not accepted', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `Marketing`'));
    assert.ok(f.some((x) => x.rule === 'gantt-unknown-token'),
      'a word like "Marketing" must not pass as the month "mar"');
  });

  // S3 regression — inline code inside a label must stay part of the label, so
  // the trailing tokens (and after: resolution) read correctly.
  test('regression(S3): inline code in a label is not mis-tokenized', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - Deploy `v2` service `Q1..Q2`'));
    // `v2` is part of the label, so no unknown-token and no bad after: resolution.
    assert.ok(!f.some((x) => x.rule === 'gantt-unknown-token'), `unexpected: ${JSON.stringify(f)}`);
  });

  // S5 regression — a date-only eyebrow window over ordinal tasks is a genuine
  // mix; lint must fold the eyebrow into mode detection to catch it.
  test('regression(S5): date window over ordinal tasks is flagged mixed', () => {
    const mixed = deck('`2026-01-01 .. 2026-12-31`\n\n## P\n\n- L\n  - A `Q1..Q2`');
    assert.ok(lintGantt(mixed).some((x) => x.rule === 'gantt-mixed-time'));
  });

  // N1 regression — a rolled-over invalid ISO date must be rejected, not parsed.
  test('regression(N1): an invalid ISO date is flagged', () => {
    const f = lintGantt(deck('## P\n\n- L\n  - A `2026-13-01..2026-12-01`'));
    assert.ok(f.some((x) => x.rule === 'gantt-bad-span'));
  });
});

describe('gantt detail reveal — per-task HTML-mark path (#475)', () => {
  // A task lane with two bars; only the first carries a nested prose bullet.
  const ulDetail = `<ul><li>Engineering<ul>` +
    `<li>API design <code>Q1..Q2</code> <code>done</code><ul><li>Owner: Platform team. Blocked on the schema RFC.</li></ul></li>` +
    `<li>Build <code>Q2..Q3</code> <code>at-risk</code></li>` +
    `</ul></li></ul>`;
  const ulNone = `<ul><li>Engineering<ul>` +
    `<li>API design <code>Q1..Q2</code> <code>done</code></li>` +
    `<li>Build <code>Q2..Q3</code> <code>at-risk</code></li>` +
    `</ul></li></ul>`;

  test('every bar is tagged with a chart-wide 0-based data-mark', () => {
    const out = buildGanttChart(inner(ulDetail), '');
    const marks = [...out.matchAll(/class="gantt-bar"[^>]*\sdata-mark="(\d+)"/g)].map((m) => m[1]);
    assert.deepEqual(marks, ['0', '1']);
  });

  test('a nested prose bullet becomes an inert detail template keyed to the bar mark', () => {
    const out = buildGanttChart(inner(ulDetail), '');
    // The detailed bar (mark 0) carries data-mark + an invisible data-label.
    assert.match(out, /class="gantt-bar"[^>]*data-mark="0"[^>]*data-label="API design"/);
    // Exactly one template, keyed to mark 0, in the sibling payload (not the figure).
    const tpls = [...out.matchAll(/<template class="chart-detail" data-mark="(\d+)">/g)].map((m) => m[1]);
    assert.deepEqual(tpls, ['0']);
    assert.match(out, /<div class="chart-details" hidden><template[^>]*>.*Platform team/);
  });

  test('the payload is a SIBLING of .gantt-chart (not miscounted as a mark)', () => {
    const out = buildGanttChart(inner(ulDetail), '');
    // .chart-details opens AFTER .gantt-chart closes.
    assert.ok(out.indexOf('class="chart-details"') > out.indexOf('</div>'));
    assert.ok(/<\/div>(<!--[\s\S]*?-->)?$|chart-details/.test(out));
  });

  test('detail folds into a Marp-faithful speaker-note comment', () => {
    const out = buildGanttChart(inner(ulDetail), '');
    assert.match(out, /<!--[\s\S]*API design \(Q1–Q2\): Owner: Platform team[\s\S]*-->/);
  });

  test('byte-identical (no payload, no note) when no task carries detail', () => {
    const out = buildGanttChart(inner(ulNone), '');
    assert.ok(!out.includes('chart-details'));
    assert.ok(!out.includes('<!--'));
    // Marks are still tagged (invisible attrs) so the chart enumerates if any
    // sibling slide authors detail — the attrs don't paint.
    assert.equal([...out.matchAll(/\sdata-mark="\d+"/g)].length, 2);
  });

  test('a milestone is a mark too (data-mark on the diamond container)', () => {
    const ul = `<ul><li>L<ul><li>Launch <code>Q4</code> <code>milestone</code><ul><li>Go/no-go gate.</li></ul></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '');
    assert.match(out, /class="gantt-milestone"[^>]*data-mark="0"/);
    assert.match(out, /<template class="chart-detail" data-mark="0">/);
  });

  test('linter does not flag a detail bullet that ends in inline code', () => {
    const d = deck('## P\n\n- Engineering\n  - API design `Q1..Q2` `done`\n    - Tracked in `PR #481`.');
    const f = lintGantt(d);
    assert.ok(!f.some((x) => x.rule === 'gantt-unknown-token'), `unexpected: ${JSON.stringify(f)}`);
  });
});

// ── portrait geometry ────────────────────────────────────────────────────────
// A baked viewBox cannot reflow, so the container query that used to rearrange
// the gantt for a tall box is now a portrait GEOMETRY the kernel emits
// (GANTT_GEOM_TALL). It shipped without coverage; these lock the properties the
// reflow existed to provide, so it cannot silently regress to the landscape
// arrangement in a portrait deck.
describe('gantt — portrait geometry', () => {
  const ul = `<ul><li>Platform<ul>
    <li>Migration <code>Q1..Q2</code> <code>done</code></li>
  </ul></li><li>Security<ul>
    <li>Review <code>Q3..Q4</code> <code>at-risk</code></li>
  </ul></li></ul>`;
  const eyebrow = '<p><code>2026 Q1 .. 2026 Q4</code></p>';
  const land = buildGanttChart(inner(ul), eyebrow);
  const port = buildGanttChart(inner(ul), eyebrow, 'portrait');
  const viewBox = (html) => (html.match(/viewBox="0 0 ([\d.]+) ([\d.]+)"/) || []).slice(1).map(Number);

  test('portrait emits a NARROWER viewBox than landscape', () => {
    const [lw] = viewBox(land);
    const [pw] = viewBox(port);
    assert.ok(pw < lw, `portrait width ${pw} should be under landscape ${lw}`);
  });

  test('portrait is proportionally taller — it fills a tall box instead of letterboxing', () => {
    const [lw, lh] = viewBox(land);
    const [pw, ph] = viewBox(port);
    assert.ok(ph / pw > lh / lw,
      `portrait aspect ${(ph / pw).toFixed(3)} must exceed landscape ${(lh / lw).toFixed(3)}`);
  });

  test('portrait puts the lane name ABOVE its bars, on the full width', () => {
    // The reflow's whole point: no left label column stealing room from the bars.
    assert.match(port, /class="gantt-lane-label"[^>]*data-pos="above"/);
    assert.doesNotMatch(land, /data-pos="above"/);
  });

  test('portrait bars span more of the width than landscape (no label column)', () => {
    const barX = (html) => Number((html.match(/class="gantt-bar"[^>]*\sx="([-\d.]+)"/) || [])[1]);
    const [lw] = viewBox(land);
    const [pw] = viewBox(port);
    // As a FRACTION of the chart width, the plot starts further left in portrait.
    assert.ok(barX(port) / pw < barX(land) / lw);
  });

  test('both orientations still carry the same marks and roles', () => {
    for (const html of [land, port]) {
      assert.equal((html.match(/data-anima-role="bar"/g) || []).length, 2);
      assert.equal((html.match(/data-mark="\d+"/g) || []).length, 2);
    }
  });
});

// ── Tick face selection (#1663) ────────────────────────────────────────────
// `.gantt-tick` is --font-label, which `mode: sketch` re-points at the hand sans.
// The tick's wrap budget and collision cull are computed from a STATIC
// per-character advance, so the builder takes a `hand` flag and selects the
// matching constant. These lock the two halves that must never desync: the mono
// path is untouched, and the hand path actually uses the wider advance.
describe('gantt — tick advance follows the painted face', () => {
  // Fifteen months in date mode: monthly ticks land ~23.7u apart, which is the
  // spacing where the two faces genuinely disagree. Mono's 3-char month (19.1u)
  // clears the cull's 2u of air; the hand's (23.0u, and 22.1u as actually painted)
  // does not — so the hand axis thins to alternate months. That is the face being
  // wider, not the constant being generous: a perfect measurer culls them too.
  const ul = `<ul><li>Framework<ul>
    <li>Taxonomy <code>2026-01-01..2026-04-30</code> <code>done</code></li>
    <li>Weighting <code>2026-10-01..2027-02-28</code> <code>at-risk</code></li>
  </ul></li></ul>`;
  const eyebrow = '<p><code>2026-01-01 .. 2027-03-31</code></p>';
  // One entry per tick, tspans joined — a wrapped tick is one label, not two.
  // Reads the <tspan> contents rather than stripping tags out of the <text>: the
  // emitter puts one tspan per line and nothing else inside, so this is the exact
  // extraction, and a single-pass tag strip is the shape CodeQL flags as an
  // incomplete sanitizer (harmless on engine-generated markup, but not worth
  // teaching by example in a test).
  const ticks = (html) => [...html.matchAll(/<text class="gantt-tick"[\s\S]*?<\/text>/g)]
    .map(m => [...m[0].matchAll(/<tspan[^>]*>([^<]*)<\/tspan>/g)].map(t => t[1]).join(''));
  // The gradient <defs> ids carry a module-level counter, so two identical calls
  // differ by id alone. Compare the AXIS, which is what the advance decides.
  const axis = (html) => (html.match(/<g class="gantt-axis"[\s\S]*?<\/g>/) || [])[0];
  const mono = buildGanttChart(inner(ul), eyebrow, undefined, false);
  const hand = buildGanttChart(inner(ul), eyebrow, undefined, true);

  test('the mono path is unchanged when the flag is omitted — a strict no-op default', () => {
    assert.equal(axis(buildGanttChart(inner(ul), eyebrow)), axis(mono));
  });

  test('the hand path thins the axis the mono path keeps dense', () => {
    assert.ok(ticks(hand).length < ticks(mono).length,
      `hand kept ${ticks(hand).length} ticks, mono ${ticks(mono).length} — the wider face must cull more`);
  });

  test('both faces keep the axis bounds — the first and last tick always survive', () => {
    for (const [name, html] of [['mono', mono], ['hand', hand]]) {
      const t = ticks(html);
      assert.ok(t.length >= 2, `${name} axis lost its bounds`);
      assert.match(t[0], /Jan/, `${name} lost the opening tick, got ${JSON.stringify(t)}`);
      assert.match(t[t.length - 1], /Mar/, `${name} lost the closing tick, got ${JSON.stringify(t)}`);
    }
  });

  test('neither face ellipsizes a tick — every label in the vocabulary fits one line', () => {
    // maxLines: 1 means "break early" ELLIPSIZES. The hand constant is calibrated
    // so the longest possible label (`Jan '26`, 7 chars) still clears the budget;
    // a value rounded up for comfort would silently truncate it.
    for (const [name, html] of [['mono', mono], ['hand', hand]]) {
      for (const t of ticks(html)) {
        assert.ok(!t.includes('…'), `${name} ellipsized the tick ${JSON.stringify(t)}`);
      }
    }
  });

  // The longest label the axis actually emits, read off the RENDER rather than
  // restated: this deck's span crosses two Januaries, so it exercises the
  // year-tagged month (`Jan '26`), the widest form in the tick vocabulary. Taking
  // it from the emitter means a vocabulary change — four-letter months, a
  // four-digit year tag — moves the ceiling below instead of quietly invalidating
  // a hard-coded 7.
  const longestLabel = Math.max(...ticks(mono).map(t => t.length));

  test('the deck really does exercise the widest label form', () => {
    // Guards the two tests below: if this span stopped emitting a year-tagged
    // month, `longestLabel` would silently shrink and the ceiling would loosen.
    assert.ok(ticks(mono).some(t => /^[A-Z][a-z]{2} '\d\d$/.test(t)),
      `expected a year-tagged month tick, got ${JSON.stringify(ticks(mono))}`);
    assert.equal(longestLabel, 7);
  });

  test('the hand advance stays inside its derivation window', () => {
    const { ADVANCE_MONO_TRACKED, ADVANCE_HAND_TRACKED } =
      require('../../../lib/components/chart/_chart-family/svg-label');
    assert.ok(ADVANCE_HAND_TRACKED > ADVANCE_MONO_TRACKED,
      'the proportional hand sans sets wider than tracked mono');
    // Both walls of the window svg-label.js derives, locked here because the
    // failure at each end is silent. BELOW the measured worst case ('May' at
    // 0.889) the COLLISION CULL under-counts each tick's half-width and adjacent
    // ticks overprint — it is the cull this wall protects, not the wrapper, since
    // the widest label paints under 44u into a 56u box either way. ABOVE
    // tickBoxW / (longest label × fsTick) the one-line budget loses a character
    // and `maxLines: 1` ellipsizes `Jan '26` — so the usual instinct to round a
    // safety constant up is itself the regression here.
    //
    // The ceiling is DERIVED from the geometry that sets it (both halves live in
    // GANTT_GEOM) and from the emitted vocabulary, so retuning the tick box or its
    // font size fails this test instead of silently moving the wall. Landscape is
    // the binding orientation — portrait's smaller fsTick buys a looser ceiling —
    // so assert against the tighter of the two, whichever that becomes.
    const ceilingFor = (G) => G.tickBoxW / (longestLabel * G.fsTick);
    const ceiling = Math.min(ceilingFor(GANTT_GEOM), ceilingFor(GANTT_GEOM_TALL));
    assert.ok(ADVANCE_HAND_TRACKED >= 0.889,
      `${ADVANCE_HAND_TRACKED} is under the measured worst case (0.889) — labels will overrun`);
    assert.ok(ADVANCE_HAND_TRACKED <= ceiling,
      `${ADVANCE_HAND_TRACKED} exceeds ${ceiling.toFixed(3)} — ${longestLabel}-char ticks would ellipsize`);
  });

  test('the wrap budget admits the longest emitted label, in BOTH orientations', () => {
    const { charBudget, ADVANCE_HAND_TRACKED, ADVANCE_MONO_TRACKED } =
      require('../../../lib/components/chart/_chart-family/svg-label');
    for (const [name, G] of [['landscape', GANTT_GEOM], ['portrait', GANTT_GEOM_TALL]]) {
      for (const [face, adv] of [['mono', ADVANCE_MONO_TRACKED], ['hand', ADVANCE_HAND_TRACKED]]) {
        const budget = charBudget(G.tickBoxW, G.fsTick, adv);
        assert.ok(budget >= longestLabel,
          `${name}/${face} budget ${budget} < ${longestLabel} chars — the axis would ellipsize`);
      }
    }
  });
});

// The section dispatcher is the seam where the slide's class reaches the builder.
// It keys on the `sketch` TOKEN because that is what the CSS keys on, so a
// per-slide `_class: boardroom` opt-out lands on both sides at once.
describe('gantt — the sketch token reaches the builder', () => {
  const { transformChartSection } = engine;
  const section = `<h2>Plan</h2>
<p><code>2026-01-01 .. 2027-03-31</code></p>
<ul><li>Framework<ul>
  <li>Taxonomy <code>2026-01-01..2026-04-30</code> <code>done</code></li>
  <li>Weighting <code>2026-10-01..2027-02-28</code> <code>at-risk</code></li>
</ul></li></ul>`;
  const tickCount = (cls) =>
    (transformChartSection(section, cls, 'landscape').html.match(/class="gantt-tick"/g) || []).length;

  test('a `sketch` slide renders the hand axis; a plain slide renders the mono one', () => {
    assert.ok(tickCount('gantt sketch') < tickCount('gantt'),
      'the sketch token must reach the tick math, not just the CSS');
  });

  test('a per-slide boardroom opt-out returns the mono axis', () => {
    // `_class: boardroom` suppresses the deck-wide `sketch` token, so the CSS
    // paints mono here — and the math has to follow it back.
    assert.equal(tickCount('gantt boardroom'), tickCount('gantt'));
  });

  test('`sketch-clean-body` alone is not the hand signal', () => {
    // MODE_REGISTER never emits it without `sketch` beside it, and base.sketch.css
    // keys every rule on section.sketch — the same trap diagram-look.js documents.
    assert.equal(tickCount('gantt sketch-clean-body'), tickCount('gantt'));
  });
});

// ── Sub-row packing ─────────────────────────────────────────────────────────
// A lane used to draw every one of its tasks at ONE y, so two overlapping spans
// could not both be seen: the later bar painted over the earlier one and the
// pair read as two abutting segments of a relay. That is the failure mode these
// lock — a gantt whose whole job is "make concurrency visible at a glance"
// (gantt.docs.md) was rendering the opposite of its data.
const barYs = (html) => [...html.matchAll(/class="gantt-bar"[^>]*\sy="([-\d.]+)"/g)]
  .map((m) => Number(m[1]));
const barXW = (html) => [...html.matchAll(/class="gantt-bar"[^>]*\sx="([-\d.]+)"[^>]*\swidth="([-\d.]+)"/g)]
  .map((m) => ({ x: Number(m[1]), w: Number(m[2]) }));
const vbOf = (html) => {
  const m = html.match(/viewBox="0 0 (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)"/);
  return { w: Number(m[1]), h: Number(m[2]) };
};
const WIN = '<p><code>2026 Q1 .. 2026 Q4</code></p>';

describe('gantt — sub-row packing (overlapping tasks cannot occlude)', () => {
  test('two OVERLAPPING tasks in one lane land on different rows', () => {
    // Q1..Q2 runs to the END of Q2; Q2..Q3 starts at the START of Q2 — so they
    // genuinely share a quarter. On one row the second hid half the first.
    const ul = `<ul><li>L<ul>
      <li>A <code>Q1..Q2</code></li>
      <li>B <code>Q2..Q3</code></li>
    </ul></li></ul>`;
    const ys = barYs(buildGanttChart(inner(ul), WIN));
    assert.equal(ys.length, 2);
    assert.notEqual(ys[0], ys[1], 'overlapping spans must not share a row');
  });

  test('two NON-overlapping tasks in one lane still share a row', () => {
    // The ordinary sequential lane. Packing must not cost height it does not owe.
    const ul = `<ul><li>L<ul>
      <li>A <code>Q1..Q2</code></li>
      <li>B <code>Q3..Q4</code></li>
    </ul></li></ul>`;
    const ys = barYs(buildGanttChart(inner(ul), WIN));
    assert.equal(ys.length, 2);
    assert.equal(ys[0], ys[1], 'spans that clear each other belong on one row');
  });

  test('a bar is never hidden: no two marks on one row overlap in x', () => {
    const ul = `<ul><li>L<ul>
      <li>A <code>Q1..Q3</code></li>
      <li>B <code>Q2..Q4</code></li>
      <li>C <code>Q3..Q4</code></li>
    </ul></li></ul>`;
    const out = buildGanttChart(inner(ul), WIN);
    const ys = barYs(out), xw = barXW(out);
    const byRow = new Map();
    ys.forEach((y, i) => { if (!byRow.has(y)) byRow.set(y, []); byRow.get(y).push(xw[i]); });
    for (const [y, marks] of byRow) {
      marks.sort((a, b) => a.x - b.x);
      for (let i = 1; i < marks.length; i++) {
        assert.ok(marks[i].x >= marks[i - 1].x + marks[i - 1].w,
          `row y=${y}: mark at ${marks[i].x} overlaps the one ending at ${marks[i - 1].x + marks[i - 1].w}`);
      }
    }
    // All three mutually overlap, so this lane owes three rows.
    assert.equal(byRow.size, 3);
  });

  test('a milestone inside a bar\'s span gets its own row', () => {
    // GA sat ON the Org-wide rollout bar on the committed gallery page — same y,
    // and in dark mode both resolved to the `mute` fill, so the diamond vanished.
    const ul = `<ul><li>L<ul>
      <li>Rollout <code>Q3..Q4</code></li>
      <li>GA <code>Q4</code> <code>milestone</code></li>
    </ul></li></ul>`;
    const out = buildGanttChart(inner(ul), WIN);
    const barY = Number(out.match(/class="gantt-bar"[^>]*\sy="([-\d.]+)"/)[1]);
    const dY = Number(out.match(/class="gantt-milestone"[^>]*points="[-\d.]+,([-\d.]+)/)[1]);
    assert.ok(Math.abs((dY + GANTT_GEOM.barH * 0.42) - (barY + GANTT_GEOM.barH / 2)) > 1,
      'a milestone within a bar\'s span must not be drawn on top of it');
  });

  test('one task per lane keeps the pre-packing band exactly', () => {
    // The invariant that lets every simple chart through unchanged: barH at its
    // ceiling, and a single-row lane measuring the 26 units the flat `laneH` gave.
    const ul = `<ul>
      <li>One<ul><li>A <code>Q1..Q2</code></li></ul></li>
      <li>Two<ul><li>B <code>Q1..Q2</code></li></ul></li>
    </ul>`;
    const ys = barYs(buildGanttChart(inner(ul), WIN));
    assert.equal(ys[1] - ys[0], 26, 'lane pitch must stay 26u for single-row lanes');
    const band = ganttBandFor(GANTT_GEOM, 2, 2);
    assert.equal(band.barH, GANTT_GEOM.barH);
    assert.equal(band.rowGap, 5);
    assert.equal(band.lanePadY, 5.5);
  });
});

describe('gantt — the packed chart still uses its stage', () => {
  // vbW is fixed and vbH grows with the row count, so an unbounded band turns a
  // dense chart into a narrow column: `xMidYMid meet` fits the taller dimension
  // and the drawing narrows. Measured in Chromium on the stress gallery page,
  // vbH 264 used 60% of a 1152px body; the compressed band uses 75%.
  test('a dense chart compresses the band rather than letterboxing', () => {
    const lanes = ['P', 'Q', 'R', 'S'].map((n) =>
      `<li>${n}<ul><li>${n}1 <code>Q1..Q3</code></li><li>${n}2 <code>Q2..Q4</code></li>` +
      `<li>${n}3 <code>Q3..Q4</code></li></ul></li>`).join('');
    const out = buildGanttChart(inner(`<ul>${lanes}</ul>`), WIN);
    const vb = vbOf(out);
    assert.ok(vb.w / vb.h >= 2.0,
      `a 4-lane/12-task chart must stay usable: aspect ${(vb.w / vb.h).toFixed(2)}`);
    const band = ganttBandFor(GANTT_GEOM, 12, 4);
    assert.ok(band.barH < GANTT_GEOM.barH, 'the band should compress under load');
    assert.ok(band.barH >= GANTT_GEOM.barHMin, 'and never past its floor');
  });

  test('the band never falls below barHMin however dense the chart', () => {
    for (const rows of [10, 20, 40, 100]) {
      const band = ganttBandFor(GANTT_GEOM, rows, Math.ceil(rows / 3));
      assert.equal(band.barH, GANTT_GEOM.barHMin, `rows=${rows} should sit on the floor`);
      assert.ok(band.rowGap > 0 && band.lanePadY > 0);
    }
  });
});

describe('gantt — mark chrome', () => {
  test('the leading accent is clipped to its own bar', () => {
    // Unclipped, the accent carried a SMALLER corner radius than the bar (0.83
    // against 3), so across the bar's rounded corner its square-ish corners stood
    // outside the bar's silhouette and the bar's stroke ran between the two as a
    // seam — three vertical bands at the left edge instead of one.
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q2</code> <code>done</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), WIN);
    const accent = out.match(/<rect class="gantt-bar-accent"[^>]*>/)[0];
    const clipId = accent.match(/clip-path="url\(#([^)]+)\)"/);
    assert.ok(clipId, 'the accent must be clipped to its bar');
    assert.doesNotMatch(accent, /\srx=/, 'a clipped accent must not carry a competing radius');
    const clip = out.match(new RegExp(`<clipPath id="${clipId[1]}">(.*?)</clipPath>`))[1];
    assert.match(clip, new RegExp(`rx="${GANTT_GEOM.barRx}"`),
      'the clip must use the BAR\'s radius, not the accent\'s');
  });

  test('the today rule is painted BEHIND the marks', () => {
    // A reference line, not a mark. Drawn last it printed a full-strength stripe
    // across every bar it crossed. SVG has no z-index — document order is paint
    // order — so this is an ordering assertion, not a style one.
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q4</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), '<p><code>2026 Q1 .. 2026 Q4</code> <code>today Q3</code></p>');
    assert.ok(out.indexOf('gantt-today') < out.indexOf('class="gantt-bar"'),
      'the today rule must be emitted before the bars');
  });

  test('a key swatch is centered on the label it keys', () => {
    // The label is emitted `dominant-baseline="central"` at `ly`, so its optical
    // middle IS `ly`. The swatch used to sit at `ly - swatch*0.8` — its center 30%
    // of its own height above the text, which measured 15px out at 200dpi.
    const ul = `<ul><li>L<ul><li>A <code>Q1..Q2</code> <code>at-risk</code></li></ul></li></ul>`;
    const out = buildGanttChart(inner(ul), WIN);
    const sw = out.match(/class="gantt-legend-swatch"[^>]*\sy="([-\d.]+)"[^>]*\swidth="([-\d.]+)"/);
    const swatchMid = Number(sw[1]) + Number(sw[2]) / 2;
    const labelY = Number(out.match(/class="gantt-legend-label"[^>]*>\s*<tspan[^>]*\sy="([-\d.]+)"/)[1]);
    assert.ok(Math.abs(swatchMid - labelY) < 0.01,
      `swatch center ${swatchMid} should match the label's optical middle ${labelY}`);
  });
});

describe('gantt — the band floor is per-orientation', () => {
  // A single GANTT_ASPECT_FLOOR of 2.6 compressed EVERY portrait chart to
  // barHMin, sparse ones included: portrait's natural aspect at the ceiling is
  // 300/164 = 1.83, so the landscape floor was above it by construction and the
  // clamp always bound. The landscape tests could not see it — portrait has its
  // own geometry and nothing exercised the band through it.
  test('a sparse PORTRAIT chart keeps the ceiling band', () => {
    const band = ganttBandFor(GANTT_GEOM_TALL, 2, 2);
    assert.equal(band.barH, GANTT_GEOM_TALL.barH, 'portrait barH must not be clamped when sparse');
    assert.equal(band.rowGap, 6);
    assert.equal(band.lanePadY, 8.5);
  });

  test('one task per lane keeps the 52u portrait lane pitch', () => {
    const ul = `<ul>
      <li>One<ul><li>A <code>Q1..Q2</code></li></ul></li>
      <li>Two<ul><li>B <code>Q1..Q2</code></li></ul></li>
    </ul>`;
    const ys = barYs(buildGanttChart(inner(ul), WIN, 'portrait'));
    assert.equal(ys[1] - ys[0], 52, 'portrait lane pitch must stay 52u for single-row lanes');
  });

  test('a DENSE portrait chart still compresses', () => {
    const band = ganttBandFor(GANTT_GEOM_TALL, 14, 3);
    assert.ok(band.barH < GANTT_GEOM_TALL.barH);
    assert.ok(band.barH >= GANTT_GEOM_TALL.barHMin);
  });
});
