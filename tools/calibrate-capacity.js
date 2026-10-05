#!/usr/bin/env node
/**
 * calibrate-capacity — find the ELEMENT COUNT a layout overflows at, per box
 * FAMILY, so a `capacity` block is set from rendered evidence instead of prose.
 *
 * This is step 8 of the content-capacity contract
 * (2026-06-17-content-capacity-contract.md §5), deferred at the time with the
 * note that "the v1 numbers are seeded from prose, not yet oracle-validated".
 * They still were, and #1218 is what that cost: the `square` family's reflow
 * rules never ran (a container query measured the wrong box), so nobody could
 * see that square's declared capacities were wrong. `cards-grid` claimed
 * soft 4 / hard 6 at square and overflows at 4.
 *
 * The experiment is calibrate-density's, with the variable swapped: hold the
 * words per element at the component's declared `density.soft` (its editorial
 * target — the shape an author is told to write), and grow the element COUNT
 * one slide at a time. The first count that trips the overflow probe is the
 * geometric break point; the capacity ceiling is the count below it.
 *
 * WHAT THIS DOES AND DOES NOT DECIDE. It measures the GEOMETRIC ceiling — where
 * the layout physically stops fitting. `hard` may sit at that ceiling; `sweet`
 * and `soft` are editorial and belong BELOW it (a slide packed to the break is
 * already crowded, §2). So this tool bounds the numbers; it does not author
 * them. It prints the bound and flags any declared value that exceeds it.
 *
 * Usage:
 *   node tools/calibrate-capacity.js <component> [--family wide,square,tall,strip]
 *                                    [--words N|soft|hard] [--max N] [--scale l|xl|2xl] [--eyebrow] [--json]
 *                                    [--variant "takeaway"] [--insight] [--heading-lines N] [--size 4k]
 *
 *   --variant  appends class tokens to every probe slide (`list takeaway`), so a register that
 *              holds more or less than the bare component gets its own row.
 *   --heading-lines N  writes each probe's heading as a sentence lint wraps to N lines at the
 *              measured venue (lint-core `wrapLines`), instead of the rig's one-line heading. For
 *              `code`, whose pane loses one to two lines to each extra heading line: the manifest's
 *              `venueCapacity.lines.headed`.
 *   --size 4k  measures on a 4k deck instead of the family's 720-high one (the strict basis: the
 *              export's 12 px tolerance is a third as forgiving there).
 *   --insight  ends every probe slide with an `insight-so-what` callout (a one-line blockquote),
 *              the shape most real slides carry; the callout's height is what a bare row misses.
 *   --panel    measures the CLAIM PANEL instead of the element count, for `split-panel`, whose
 *              binding box is its fixed-width panel: the panel's LINE GEOMETRY for the bare,
 *              `proof` and `capstone` registers at all four venues in one run (tools/lib/
 *              calibrate-panel.js). It is the manifest's `venueCapacity.panel.lines`; only `--json`
 *              applies (`--variant`, `--scale` and `--max` are refused).
 *   --rows     measures the LINE GEOMETRY of a list or card component (list, cards-grid,
 *              list-steps) instead of its element count: each register's item roles (title, body)
 *              in characters a line and px a line, the cost of a row, and the slide's budget, at
 *              all four venues in one run (tools/lib/calibrate-rows.js). It is the manifest's
 *              `venueCapacity.rows`; only `--json` applies.
 *   node tools/calibrate-capacity.js --all [--family square]
 *
 *   node tools/calibrate-capacity.js <component>|--all --pane side|stack [--share N]
 *
 * PANE MODE (`--pane`) measures the same ceiling inside a PANE (lib/core/panes.js) instead
 * of a whole slide: each step is a 16:9 panes slide with the component in the first pane at
 * its basis share (`--share`, default its `pane.budget.at`, else 50; a stack splits
 * 50/50) and one short line of `content` in the second. The overflow probe already treats a
 * pane's inner `.cell-stage` as a clipping cell, so a clipped pane flags its page. Each element
 * is held at HALF the component's `density.soft` (a pane's content is written tighter). The
 * number it bounds is the manifest's `pane.budget.<side|stack>.hard`.
 *
 * THE SIGNAL. A step fails when it clips (the OVERFLOW line, or CONTENT CLIPPED for a box that
 * loses content inside the frame, as a kanban lane does) OR stops being legible: a figure's
 * text under the type floor (TYPE FLOOR) or a chart label the kernel declined to paint (CHART
 * LABELS DROPPED). A viewBox chart never clips as it fills — it shrinks — so the legibility lines
 * are the only way its ceiling shows; the report names which signal tripped.
 *
 * Exit 0 when every declared capacity is within its measured ceiling; exit 1
 * when one exceeds it (so it can gate), unless --advisory.
 */

const {
  SIZE_ALIAS, FAMILIES, BUILDERS, BODY_WRAP, NOT_COUNT_CALIBRATABLE, findManifest, gradedDeck, renderProbe,
} = require('./lib/calibrate-core.js');

const argv = process.argv.slice(2);
const has = (f) => argv.includes(`--${f}`);
const flag = (name, def) => {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const JSON_OUT = has('json');
const ADVISORY = has('advisory');
const MAX = parseInt(flag('max', '9'), 10);
const WORDS_OVERRIDE = flag('words', null);
// The deck-wide projection multiplier to measure at (typography.md §7). Omitted = the
// designed size. The declared numbers are scale-1 budgets, so a run at a scale reports
// the measured ceiling and the scale-adjusted budget lint enforces there
// (`scaledCapacity`, lib/authoring/lint-core.js) instead of comparing raw `hard`.
const SCALE = flag('scale', null);
const VARIANT = flag('variant', null);
const INSIGHT = has('insight');
// The heading's height in LINES, as lint wraps it at this run's venue. The rig's own heading is one
// line, and a `code` pane under a two-line heading holds one to two lines fewer, which a one-line
// row cannot see (the talk's starter-kit code slides clipped at huddle unnamed, #2361 P2).
const HEADING_LINES = flag('heading-lines', null) == null ? null : parseInt(flag('heading-lines'), 10);
if (HEADING_LINES != null && !(HEADING_LINES >= 1 && HEADING_LINES <= 4)) die('--heading-lines takes 1 to 4.');
if (HEADING_LINES != null && argv.includes('--pane')) die('--heading-lines measures a whole slide; it does not take --pane.');
// The deck @size to measure on, in place of the family's (`16:9`, 720 high). The export forgives
// 12 layout px at every size, which on a 720-high deck is 36 px of a 2160-high one, so a row
// measured there can hold a line a 4k deck clips: `--size 4k` measures on the strict basis the line
// models use (Amendment (7)).
const SIZE_OVERRIDE = flag('size', null);
if (SIZE_OVERRIDE && SIZE_OVERRIDE !== '4k') die("--size takes '4k'.");
if (SCALE && !['l', 'xl', '2xl'].includes(SCALE)) die(`Unknown --scale '${SCALE}'. Known: l, xl, 2xl.`);
const TARGET_FAMILIES = flag('family', FAMILIES.join(',')).split(',').map((s) => s.trim()).filter(Boolean);
const PANE = flag('pane', null);
if (PANE && PANE !== 'side' && PANE !== 'stack') {
  console.error("--pane takes 'side' or 'stack'.");
  process.exit(1);
}
const SHARE_OVERRIDE = flag('share', null);
// A share off the 25–75 grid falls back to 50/50 in the carve, so the run would measure one
// share and report another. And the slide-mode knobs have no pane meaning yet: say so.
if (SHARE_OVERRIDE && !(Number(SHARE_OVERRIDE) >= 25 && Number(SHARE_OVERRIDE) <= 75 && Number(SHARE_OVERRIDE) % 5 === 0)) {
  console.error('--share takes 25–75 in steps of 5.');
  process.exit(1);
}
if (PANE && (flag('scale', null) || argv.includes('--eyebrow'))) {
  console.error('--pane measures at the designed size with the rig\'s own heading; it does not take --scale or --eyebrow.');
  process.exit(1);
}

function die(msg) { console.error(msg); process.exit(1); }

for (const f of TARGET_FAMILIES) {
  if (!SIZE_ALIAS[f]) die(`Unknown family '${f}'. Known: ${FAMILIES.join(', ')}.`);
}

/**
 * Every component this rig can author elements for. Deliberately NOT limited to
 * those already declaring a capacity — a component with no `capacity` block is
 * exactly the one whose ceiling nobody has measured, so it is the most useful to
 * report, and the backfill (contract §5 step 10) needs the number.
 */
function calibratable() {
  return Object.keys(BUILDERS).filter((name) => findManifest(name)).sort();
}

// A value that belongs to a flag (`--scale xl`, `--words 12`) is not a component name.
const VALUE_FLAGS = new Set(['--family', '--words', '--max', '--scale', '--variant', '--heading-lines', '--size']);
const named = argv.find((a, i) => !a.startsWith('--') && !FAMILIES.includes(a) && !VALUE_FLAGS.has(argv[i - 1]));
if (!has('all') && !named) {
  die('Usage: node tools/calibrate-capacity.js <component> [--family square] [--all]');
}
const components = has('all') ? calibratable() : [named];

// ── PANEL MODE ───────────────────────────────────────────────────────────────────
// On `split-panel proof` the slide clips in its 31% claim panel, not its list, and word counts
// could not tell its slides apart; line counts can (2026-09-25-font-scale-fit.md, Amendments (5)
// and (6)). `--panel` measures the panel's line geometry — tools/lib/calibrate-panel.js, run as its
// own process because it drives a browser and this script's count sweep runs at load.
if (has('panel')) {
  if (named !== 'split-panel') die('--panel measures split-panel only (its claim panel is the fixed box).');
  if (VARIANT || SCALE || has('max')) die('--panel measures every register at every venue in one run; drop --variant / --scale / --max.');
  const r = require('node:child_process').spawnSync(process.execPath, [require('node:path').join(__dirname, 'lib', 'calibrate-panel.js'), ...(JSON_OUT ? ['--json'] : [])], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// ── ROWS MODE ────────────────────────────────────────────────────────────────────
// A word row cannot see where a line breaks: a title over a body takes two lines whatever its
// length (Amendment (7)). `--rows` measures a list or card component's line geometry —
// tools/lib/calibrate-rows.js, its own process for the same reason as `--panel`.
if (has('rows')) {
  if (VARIANT || SCALE || has('max')) die('--rows measures every register at every venue in one run; drop --variant / --scale / --max.');
  const r = require('node:child_process').spawnSync(process.execPath, [require('node:path').join(__dirname, 'lib', 'calibrate-rows.js'), named, ...(JSON_OUT ? ['--json'] : [])], { stdio: 'inherit' });
  process.exit(r.status ?? 1);
}

// No silent caps: an `--all` run that quietly omits four components reads as
// "everything is covered". Say what was dropped and why, before the numbers.
if (has('all') && !JSON_OUT) {
  const skipped = Object.entries(NOT_COUNT_CALIBRATABLE).filter(([n]) => findManifest(n));
  if (skipped.length) {
    console.log(`\n  NOT calibrated (${skipped.length}) — a count ceiling would be a fiction here:`);
    for (const [n, why] of skipped) console.log(`    ${n.padEnd(15)} ${why}`);
  }
}

/**
 * The declared per-family capacity, falling back to the component-level block.
 * `adapt.capacity.<family>` is the finer form (the box shape decides how much
 * fits); the flat `capacity` is the legacy single number.
 */
function declaredFor(manifest, family) {
  const perFamily = manifest.adapt?.capacity?.[family];
  if (perFamily && typeof perFamily === 'object') return { ...perFamily, source: `adapt.capacity.${family}` };
  const flat = manifest.capacity;
  if (flat && typeof flat === 'object') return { sweet: flat.sweet, soft: flat.soft, hard: flat.hard, source: 'capacity' };
  return null;
}

/** The manifest's `venueCapacity` number for `comp` at this run's scale and element length,
 * shaped like `declaredFor` so the report below reads the same. `--scale l|xl|2xl` is the
 * huddle / conference / hall rung. */
function scaleDeclared(manifest, wordsPer) {
  const venue = { l: 'huddle', xl: 'conference', '2xl': 'hall' }[SCALE];
  const v = manifest.venueCapacity?.byWords?.[wordsPer]?.[venue];
  return v == null ? null : { hard: v, source: `venueCapacity.byWords[${wordsPer}].${venue}` };
}

/** The pane share a component is budgeted at: its `pane.budget.at` (default 50), or `--share`. */
function paneShare(manifest) {
  if (PANE === 'stack') return 50;
  if (SHARE_OVERRIDE) return parseInt(SHARE_OVERRIDE, 10);
  return manifest.pane?.budget?.at || 50;
}

/** The declared pane budget for this direction, in the shape `declaredFor` returns. */
function declaredPane(manifest) {
  const b = manifest.pane?.budget?.[PANE];
  return b ? { sweet: b.sweet, hard: b.hard, source: `pane.budget.${PANE}` } : null;
}

/**
 * A heading that lint wraps to exactly `n` lines at this run's venue, not far past `n - 1`: the
 * shortest prefix of a fixed sentence that takes `n` lines with a margin either side (lint-core `wrapLines`, the
 * heading's characters a line from the shared row frame, weighed in the display face). Measured
 * against lint's own wrap, so the row it produces is the one lint looks up for a slide whose
 * heading it wraps to `n` lines.
 */
function headingOfLines(n) {
  const core = require('../lib/authoring/lint-core.js');
  const frame = require('../lib/authoring/venue-capacity.generated.js').rowFrame;
  const rung = { l: 1, xl: 2, '2xl': 3 }[SCALE] || 0;
  const words = 'The instruction file states the rules once and links to the detail so every agent reads the same thing before it starts work and nobody has to guess which rule applies or where the reasoning behind it lives today'.split(' ');
  const lines = (t, w) => core.wrapLines(core.lineText(t, core.GLYPH_DISPLAY), frame.heading[rung][0] * w, core.GLYPH_DISPLAY);
  // `n` lines even if the real line is 8% wider or narrower than lint's: a heading on the edge of a
  // wrap measured one line on compare-code, whose row then read a two-line heading as free.
  for (let k = 1; k <= words.length; k++) {
    const t = `${words.slice(0, k).join(' ')}.`;
    if (lines(t, 0.92) === n && lines(t, 1.08) === n) return t;
  }
  return die(`No heading of ${n} line${n === 1 ? '' : 's'} at this venue.`);
}

/** Measure the first element count that overflows, or null if none up to MAX. */
function measure(comp, family, wordsPer, share) {
  const build = BUILDERS[comp];
  const counts = Array.from({ length: MAX }, (_, i) => i + 1);
  const body = (n) => (BODY_WRAP[comp] || ((b) => b))(Array.from({ length: n }, (_, i) => build(wordsPer, i)).join('\n'));
  const cls = [comp, VARIANT, INSIGHT ? 'insight-so-what' : null].filter(Boolean).join(' ');
  const callout = INSIGHT ? '\n\n> The one line the room should remember.\n' : '';
  const deck = gradedDeck({
    comp: cls,
    size: SIZE_OVERRIDE || SIZE_ALIAS[family],
    scale: SCALE,
    eyebrow: has('eyebrow'),
    steps: counts,
    slideFor: (n) => (HEADING_LINES != null
      ? { slide: `${has('eyebrow') ? '`Calibration · eyebrow`\n\n' : ''}## ${headingOfLines(HEADING_LINES)}\n\n${body(n)}${callout}` }
      : PANE
      ? { slide: `## Calibration step — ${n} element${n === 1 ? '' : 's'}.\n\n`
          + `<!-- panes: ${PANE === 'stack' ? 'stack ' : ''}${share}/${100 - share} -->\n\n`
          + `<!-- pane: ${comp} -->\n\n${body(n)}\n\n<!-- pane: content -->\n\nOne short line.\n` }
      : { label: `${n} element${n === 1 ? '' : 's'}`, body: body(n) + callout }),
  });
  const { overflowed, underFloor, labelsDropped, overprint } = renderProbe(deck, `${comp}-${family}${SCALE ? `-${SCALE}` : ''}${PANE ? `-pane-${PANE}` : ''}${VARIANT ? `-${VARIANT.replace(/\s+/g, '-')}` : ''}${INSIGHT ? '-insight' : ''}${HEADING_LINES ? `-h${HEADING_LINES}` : ''}`, { countBox: true });
  let lastFit = null;
  let firstOver = null;
  let signal = null;
  // A step fails when it CLIPS, or when it stops being LEGIBLE: text under the type floor, a
  // label the chart declined to paint, or a label printed across a mark (CHART LABELS OVERPRINT). A viewBox chart only ever fails the second way.
  const why = (page) => [overflowed.has(page) && 'overflow', underFloor.has(page) && 'type floor',
    labelsDropped.has(page) && 'labels dropped', overprint.has(page) && 'labels overprint'].filter(Boolean).join(' + ');
  for (let i = 0; i < counts.length; i++) {
    const over = why(i + 1);   // page N = step i (front matter emits no slide)
    if (over && firstOver == null) { firstOver = counts[i]; signal = over; }
    if (!over && firstOver == null) lastFit = counts[i];
  }
  return { firstOver, ceiling: lastFit, counts, signal };
}

const results = [];
let violations = 0;

for (const comp of components) {
  const manifest = findManifest(comp);
  if (!manifest) die(`No manifest for '${comp}'.`);
  if (!BUILDERS[comp]) {
    die(`No element builder for '${comp}'. Add one to tools/lib/calibrate-core.js BUILDERS (covers: ${Object.keys(BUILDERS).sort().join(', ')}).`);
  }
  // Hold the body at the component's editorial target — the shape authors are
  // told to write. Calibrating at a longer body would measure a stricter
  // ceiling than the contract actually promises.
  // `--words soft|hard` reads the component's own density block, so one `--all` run can
  // measure every component at the same point of ITS budget rather than one global count.
  // A PANE is half a slide, and its content is written tighter than a whole slide's: pane mode
  // holds each element at HALF the component's density (rounded up), the shape a pane's author
  // is told to write (lib/base/base.docs.md § Panes).
  const slideWords = parseInt(manifest.density?.soft || 12, 10);
  const wordsPer = parseInt((WORDS_OVERRIDE === 'soft' || WORDS_OVERRIDE === 'hard'
    ? manifest.density?.[WORDS_OVERRIDE]
    : WORDS_OVERRIDE) || (PANE ? Math.ceil(slideWords / 2) : slideWords), 10);

  // A pane is measured on the authored 16:9 box only: panes are a landscape composition.
  const share = PANE ? paneShare(manifest) : null;
  if (PANE && manifest.pane?.side === false && manifest.pane?.stack === false) {
    if (!JSON_OUT) console.log(`\n  ${comp} · fits no pane (side and stack false) — a panes slide naming it splits; not measured`);
    continue;
  }
  for (const family of PANE ? ['wide'] : TARGET_FAMILIES) {
    const { firstOver, ceiling, signal } = measure(comp, family, wordsPer, share);
    // At a projection scale the manifest's `hard` is the wrong yardstick — it is a
    // designed-size budget. The number lint enforces there is the manifest's measured
    // `venueCapacity` row, so that is what this run checks, at the exact length it was
    // measured at. A table value above the ceiling measured now means the engine
    // moved and lint would forecast a fit it no longer has.
    const declared = PANE ? declaredPane(manifest) : SCALE ? scaleDeclared(manifest, wordsPer) : declaredFor(manifest, family);
    const over = declared && ceiling != null && declared.hard != null && declared.hard > ceiling;
    if (over) violations++;
    results.push({ component: comp, family, pane: PANE, share, wordsPer, ceiling, firstOver, signal, declared, exceedsCeiling: !!over });

    if (!JSON_OUT) {
      const where = PANE ? `pane ${PANE} ${share}%` : `${family} (@size ${SIZE_ALIAS[family]})`;
      const head = `${comp} · ${where} · ${wordsPer} words/element`;
      const measured = firstOver == null
        ? `fits to ${MAX}+ (raise --max)`
        : `ceiling ${ceiling} · fails at ${firstOver} (${signal})`;
      const decl = declared
        ? `declared sweet ${declared.sweet ?? '–'} / soft ${declared.soft ?? '–'} / hard ${declared.hard ?? '–'}  [${declared.source}]`
        : 'no capacity declared';
      console.log(`\n  ${head}\n    measured: ${measured}\n    ${decl}${over ? `\n    ✗ hard ${declared.hard} EXCEEDS the measured ceiling ${ceiling}` : ''}`);
    }
  }
}

if (JSON_OUT) {
  console.log(JSON.stringify(results, null, 2));
} else {
  console.log('');
  if (violations) {
    console.log(`  ${violations} declared capacity value(s) exceed the measured ceiling.`);
    console.log('  `hard` may sit AT the ceiling; `sweet`/`soft` belong below it (editorial, not geometric).');
  } else {
    console.log('  Every declared capacity is within its measured ceiling.');
  }
}

process.exitCode = violations && !ADVISORY ? 1 : 0;
