#!/usr/bin/env node
/**
 * Generates lib/components/chart/_chart-family/chart-finish.generated.css — the chart finishes' rules.
 *
 * A finish moves color; it never adds or removes it, and it never touches structure
 * (engineering/chart-styling.md §3). The deck picks one with `chart-finish:`
 * (lib/core/resolve-chart-finish.js), which stamps `chart-finish-<name>` on every section;
 * this writes the rules those classes switch on into
 * lib/components/chart/_chart-family/chart-finish.generated.css, which tools/build-css.js
 * bundles after every chart member's own CSS.
 *
 * WHAT A RULE REACHES. Only a mark that carries the mark contract (slot-contract.md):
 * `data-hue` names the category, `data-encodes` the encoding, `data-paint` the property.
 * A mark with no `data-paint` is not a finish's to touch — the line's stroke-painted series
 * path is the case that proves it. Which marks carry TEXT (and so take the quieter backdrop
 * level) is read from each manifest's `kernel.marks[].bears`, never inferred: every inference
 * of it was wrong on the render (mark-declaration.md). Status marks carry no `data-hue`, so
 * the few that take paint are listed in STATUS_MARKS with the member's own hue/ink channel.
 *
 * THE LEVELS are the ones `finish-coherence.md` settled by measurement, and were first
 * written by the prototype generator tools/gen-chart-finish-css.py. Two floors hold under
 * every finish: every mark carries an ink edge, and every element that NAMES a mark wears
 * that mark's ink — under `tone` there is one hue, so a name wears its ink. (The prototype's
 * "names go neutral under tone" block broke the second floor, and is not carried over.)
 *
 * SPECIFICITY IS KEPT LOW ON PURPOSE. Each rule is `section.chart-finish-X :where(<mark>)`
 * — (0,1,1) — with `!important`, because member paint arrives as inline `url(#)` gradient
 * fills. `!important` alone beats every member rule (no chart member marks paint
 * `!important`). What must beat a FINISH is a texture: the a11y themes paint their
 * categorical pattern fills with `!important` rules of (0,3,1) and up, and themes load after
 * lattice.css. Were this rule any more specific, picking a finish would strip the texture
 * channel from a colorblind reader. So a theme's texture wins, and that is the design.
 *
 * TWO ARMS, NOT A LEADING `:is()`. `section.…` is the slide; `figure.…` is Read·Article's
 * re-hosted chart, which carries the token over (prose-projection.mjs `withChartFinish`).
 *
 * WIDTHS. An SVG `stroke-width` is in viewBox units (chart-styling.md §2), so an edge is
 * `calc(var(--chart-edge) * k)` under `vector-effect: non-scaling-stroke`. An HTML mark
 * takes its edge as an inset box-shadow, never a border: a border changes the box, and a
 * finish never touches structure.
 *
 *   node tools/build-chart-finish-css.js           write the file
 *   node tools/build-chart-finish-css.js --check   freshness gate (build:check)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'chart-finish.generated.css');
const check = process.argv.includes('--check');
const silent = process.argv.includes('--silent');

const { CHART_FINISHES } = require('../lib/core/resolve-chart-finish');

const SLOTS = [1, 2, 3, 4, 5, 6, 7, 8];
// tone: one hue, eight value steps (the ramp the tone key publishes).
const TONE = [92, 76, 61, 47, 34, 22, 14, 9];
// tone for a mark that CARRIES TEXT — same order, quiet enough to keep its text above
// 4.5:1. Measured by tools/measure-finish-contrast.mjs; the two modes differ.
const TONE_TEXT = [30, 27, 24, 21, 18, 15, 12, 9];
const TONE_TEXT_D = [35, 31, 28, 24, 21, 17, 14, 10];

/** The levels, per finish (finish-coherence.md §Levels). `[light, dark]` pairs. */
const F = {
  pigment: { body: [82, 82], backdrop: [40, 46], ramp: [16, 0.54], rampText: [[16, 0.54], [16, 0.37]], layered: 0.55, edge: 1, edgeBackdrop: 1 },
  etching: { body: [30, 40], backdrop: [14, 19], ramp: [6, 0.24], rampText: [[6, 0.24], [6, 0.24]], layered: 0.18, edge: 2, edgeBackdrop: 3 },
  // `ramp` is the band a text-free ramp takes (a map region). `rampText` is the band a ramp
  // that PRINTS ITS VALUE takes (a heatmap cell), as [light, dark]: shorter, because its top
  // step must still carry text at 4.5:1. Tone's text band tops out at 70% on light, not the
  // prototype's 85% (at 85% neither the strong ink nor the canvas clears every curated theme:
  // measured 2.98–4.71). Every dark text band tops out near 50%: a dark ramp's top step is a
  // LIGHT tone, and on a bright hue (carbone's lime) light text stopped clearing it at 3.39:1.
  // A ramp already encodes VALUE, which is tone's whole idea, so on a ramp member tone and
  // pigment differ only by band — that is the honest result, not a gap.
  tone: { ramp: [10, 0.82], rampText: [[10, 0.65], [10, 0.43]], edge: 1, edgeBackdrop: 2.5 },
};

/**
 * Status marks: the member paints each from its OWN status channel, because members do not
 * share a status vocabulary (`live` is info on a gantt bar and pass on a status pill), so a
 * finish reads the channel rather than re-deciding the word.
 */
const STATUS_MARKS = [
  { sel: '.gantt-bar[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  { sel: ':is(.gantt-milestone, .gantt-legend-swatch)[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false },
  { sel: '.progress-fill[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: true },
  { sel: '.chart-status[data-s]', hue: 'var(--pill-hue)', ink: 'var(--pill-ink)', paint: 'bg', bears: true },
  { sel: '.waterfall-bar[data-s="up"]', hue: 'var(--state-pass-hue)', ink: 'var(--state-pass-ink)', paint: 'fill', bears: false },
  { sel: '.waterfall-bar[data-s="down"]', hue: 'var(--state-fail-hue)', ink: 'var(--state-fail-ink)', paint: 'fill', bears: false },
];

// What a body mixes toward. Pigment reproduces the family's shipped body tier
// (`--chart-cat-N-body`: the hue over `--chart-cat-base`, which is BLACK in dark mode).
// Etching and tone mix toward the CANVAS instead: a whisper or a value step taken toward
// black lands darker than the slide itself and reads as a hole, not a quiet mark. In light
// mode the two bases are the same color, so only the dark face differs.
let BASE = 'var(--chart-cat-base)';
const BODY_BASE = { pigment: 'var(--chart-cat-base)', etching: 'var(--bg)', tone: 'var(--bg)' };
const ONE = 'var(--chart-cat-1-hue)';
const ONE_INK = 'var(--chart-cat-1-ink)';
const hueOf = (n) => `var(--chart-cat-${n}-hue)`;
const inkOf = (n) => `var(--chart-cat-${n}-ink)`;
const mix = (hue, pct) => `color-mix(in oklab, ${hue} ${pct}, ${BASE})`;
const ld = (a, b) => (a === b ? a : `light-dark(${a}, ${b})`);
const pair = (hue, [l, d]) => ld(mix(hue, `${l}%`), mix(hue, `${d}%`));
const edge = (k) => (k === 1 ? 'var(--chart-edge)' : `calc(var(--chart-edge) * ${k})`);

/**
 * Every member that paints a RAMP, with its ramp classes and the base it mixes toward. A ramp
 * scales from its member's own EMPTY END — `--<member>-base`, the base the shipped ramp mixes
 * toward — so a finish moves the band without moving where "nothing" sits. Read per member
 * rather than as one `var(--a, var(--b, …))` chain: a fallback chain of role-less tokens is
 * what the HARD RULE #11 contract gate refuses, and it would be a guess besides.
 */
function rampMembers() {
  const { loadAll } = require('../lib/components');
  const out = [];
  for (const m of loadAll()) {
    // A mark the status table paints (progress-fill: its manifest calls its LENGTH a ramp,
    // and its paint is its status) never carries the ramp stamp, so a ramp rule for it is dead.
    const owned = new Set(STATUS_MARKS.flatMap((x) => [...x.sel.matchAll(/\.([a-z][a-z0-9-]*)/g)].map((c) => c[1])));
    const rows = (m.kernel?.marks || []).filter((r) => r.encodes === 'ramp' && (r.paint === 'fill' || r.paint === 'bg') && !owned.has(r.class));
    if (!rows.length) continue;
    const dir = path.join(ROOT, 'lib', 'components', m.bucket, m.name);
    const css = fs.readdirSync(dir).filter((f) => f.endsWith('.css')).map((f) => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    const base = css.includes(`--${m.name}-base:`) ? `var(--${m.name}-base)` : 'var(--bg)';
    out.push({ name: m.name, base, plain: rows.filter((r) => !r.bears).map((r) => r.class), text: rows.filter((r) => r.bears).map((r) => r.class) });
  }
  return out;
}

/** The text-bearing mark classes, from every chart manifest's `kernel.marks`. */
function bearingClasses() {
  const { loadAll } = require('../lib/components');
  const out = { fill: new Set(), bg: new Set() };
  for (const m of loadAll()) {
    for (const r of m.kernel?.marks || []) {
      if (r.bears && r.encodes === 'hue' && (r.paint === 'fill' || r.paint === 'bg')) out[r.paint].add(r.class);
    }
  }
  return { fill: [...out.fill].sort(), bg: [...out.bg].sort() };
}

function rule(finish, mark, decls) {
  const sel = [`section.chart-finish-${finish} :where(${mark})`, `figure.chart-finish-${finish} :where(${mark})`].join(',\n');
  return `${sel} {\n${decls.map((d) => `  ${d} !important;`).join('\n')}\n}`;
}

/** Paint declarations for one body + edge, in the property set `paint` names. */
function paintDecls(paint, body, ink, k) {
  if (paint === 'fill') return [`fill: ${body}`, `stroke: ${ink}`, `stroke-width: ${edge(k)}`, 'vector-effect: non-scaling-stroke'];
  return [`background: ${body}`, `box-shadow: inset 0 0 0 ${edge(k)} ${ink}`];
}

function build() {
  const bears = bearingClasses();
  const ramps = rampMembers();
  const out = [];
  const w = (s) => out.push(s);
  w('/* GENERATED by tools/build-chart-finish-css.js — do not edit by hand.');
  w(' * The `chart-finish:` register\'s rules. The header of the generator explains every choice');
  w(' * below; engineering/chart-styling.md §3 is the design. */');

  for (const name of CHART_FINISHES) {
    const f = F[name];
    const tone = name === 'tone';
    BASE = BODY_BASE[name];
    w(`\n/* ══ ${name.toUpperCase()} ${'═'.repeat(70 - name.length)} */`);

    // ── the slot table, re-pointed under tone ───────────────────────────────
    // Anything that reads --mark-hue / --mark-ink (a name, a leader, a member's own rule)
    // follows the one hue without a rule of its own. Custom properties take !important too.
    if (tone) {
      w('\n/* The slot table, re-pointed: one hue, eight value steps, one ink. */');
      for (const n of SLOTS) {
        w(rule(name, `[data-hue="${n}"]`, [
          `--mark-hue: ${mix(ONE, `${TONE[n - 1]}%`)}`,
          `--mark-body: ${mix(ONE, `${TONE[n - 1]}%`)}`,
          `--mark-ink: ${ONE_INK}`,
        ]));
      }
      // The quadrant keeps a per-cell slot table of its own (`--cell-ink`, which its zone
      // names read); under tone every cell names in the one ink.
      w(rule(name, '[data-cell]', [`--cell-ink: ${ONE_INK}`]));
    }

    // ── HUE — the body a finish is named for ────────────────────────────────
    w('\n/* HUE — the body a finish is named for, under the mark\'s ink edge. */');
    for (const n of SLOTS) {
      const body = tone ? mix(ONE, `${TONE[n - 1]}%`) : pair(hueOf(n), f.body);
      const ink = tone ? ONE_INK : inkOf(n);
      for (const paint of ['fill', 'bg']) {
        w(rule(name, `[data-hue="${n}"][data-encodes="hue"][data-paint="${paint}"]`, paintDecls(paint, body, ink, f.edge)));
      }
    }

    // ── HUE on a mark that carries text ─────────────────────────────────────
    // The register CAPS the level; the finish still picks one inside the cap. Emitted after
    // the plain rule at the same specificity, so source order hands it the mark.
    w('\n/* HUE on a mark that CARRIES TEXT — the quieter level its text was measured against. */');
    for (const n of SLOTS) {
      const body = tone
        ? ld(mix(ONE, `${TONE_TEXT[n - 1]}%`), mix(ONE, `${TONE_TEXT_D[n - 1]}%`))
        : pair(hueOf(n), f.backdrop);
      const ink = tone ? ONE_INK : inkOf(n);
      for (const paint of ['fill', 'bg']) {
        if (!bears[paint].length) continue;
        const cls = `:is(${bears[paint].map((c) => `.${c}`).join(', ')})`;
        // An HTML mark's own text was colored for the full-strength body (the journey actor
        // initial is white); at this level it takes the ink the level was measured against.
        const text = paint === 'bg' ? ['color: var(--text-body)'] : [];
        w(rule(name, `${cls}[data-hue="${n}"][data-encodes="hue"][data-paint="${paint}"]`, [...paintDecls(paint, body, ink, f.edgeBackdrop), ...text]));
      }
    }

    // ── STATUS — the body joins the finish; the status stays on the edge ────
    w('\n/* STATUS — the member\'s own status channel. Under tone the body joins the one hue');
    w('   and the status is carried by its edge, which is its own semantic ink. */');
    for (const s of STATUS_MARKS) {
      const lvl = s.bears ? 'backdrop' : 'body';
      const body = tone
        ? (s.bears ? ld(mix(ONE, `${TONE_TEXT[0]}%`), mix(ONE, `${TONE_TEXT_D[0]}%`)) : mix(ONE, `${TONE[1]}%`))
        : pair(s.hue, f[lvl]);
      const decls = paintDecls(s.paint, body, s.ink, s.bears ? f.edgeBackdrop : f.edge);
      // A status pill's gradient is a background-IMAGE; the shorthand clears it.
      w(rule(name, s.sel, decls));
    }

    // ── RAMP — a magnitude, so the finish SCALES the band ────────────────────
    // --mix stays the datum; the floor and the span are the finish's. A ramp's own stroke
    // (the cell gap) is the member's, except under etching, where the line is the identity.
    w('\n/* RAMP — scaled into the finish\'s band; --mix stays the datum. */');
    const rampAt = ([lo, k], base) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--mix, 50%) * ${k}), ${base})`;
    const rampStroke = name === 'etching'
      ? [`stroke: color-mix(in oklab, ${ONE_INK} 75%, transparent)`, `stroke-width: ${edge(1)}`, 'vector-effect: non-scaling-stroke']
      : [];
    for (const m of ramps) {
      // A ramp that prints its value takes the shorter text band (see `rampText`), as two
      // whole colors inside light-dark(), never a percentage.
      for (const [classes, body] of [
        [m.plain, rampAt(f.ramp, m.base)],
        [m.text, ld(rampAt(f.rampText[0], m.base), rampAt(f.rampText[1], m.base))],
      ]) {
        if (!classes.length) continue;
        const cls = `:is(${classes.map((c) => `.${c}`).join(', ')})`;
        w(rule(name, `${cls}[data-encodes="ramp"][data-paint="fill"]`, [`fill: ${body}`, ...rampStroke]));
        w(rule(name, `${cls}[data-encodes="ramp"][data-paint="bg"]`, [`background: ${body}`]));
      }
    }
    // A HEATMAP VALUE is printed on its cell, and the theme solves its ink per step against
    // the SHIPPED fill (--heatmap-stepN-ink). A finish changes the fill under the text, so no
    // fixed ink holds: measured, the strong ink fell to 3.34:1 on the a11y themes' top step,
    // where white clears 6.4:1, and on indaco the reverse. So the browser picks the ink from
    // the cell's own color: the value's fill is the step's body, taken through relative-color
    // syntax to black above OKLCH L 0.565 and white below it. That lightness is where the two
    // meet (relative luminance ~0.18), so either side clears ~4.5:1 on every theme. The step's
    // --mix is the heatmap's own (--heatmap-stepN, else the member's default). The first
    // declaration is the fallback for a renderer without relative color; the second replaces it.
    const STEP_MIX = [18, 36.5, 55, 73.5, 92];
    const inkOn = (cell) => `oklch(from ${cell} clamp(0, (0.565 - l) * 999, 1) 0 0)`;
    const textBand = f.rampText;
    STEP_MIX.forEach((pct, i) => {
      const at = ([lo, k]) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--heatmap-step${i + 1}, ${pct}%) * ${k}), var(--heatmap-base))`;
      w(rule(name, `.heatmap-value[data-step="${i + 1}"]`, [
        'fill: var(--text-heading)',
        `fill: ${ld(inkOn(at(textBand[0])), inkOn(at(textBand[1])))}`,
      ]));
    });

    // ── LAYERED — translucent and composited, so a FLAT alpha ────────────────
    // A gradient here reads as a fourth color where two polygons cross.
    w('\n/* LAYERED — a flat alpha of the series body; the edge carries the series. */');
    for (const n of SLOTS) {
      const body = tone ? mix(ONE, `${TONE[n - 1]}%`) : pair(hueOf(n), f.body);
      const alpha = tone ? String(Math.round((0.2 + 0.4 * (TONE[n - 1] / 92)) * 1000) / 1000) : String(f.layered);
      w(rule(name, `[data-hue="${n}"][data-encodes="layered"][data-paint="fill"]`, [
        `fill: ${body}`, `fill-opacity: ${alpha}`, `stroke: ${tone ? ONE_INK : inkOf(n)}`,
      ]));
    }

    // ── the quadrant's zone tints ────────────────────────────────────────────
    // Furniture, not marks — but colored, so a finish that left them alone would leave four
    // pastel rectangles behind whatever it did to the dots.
    w('\n/* The quadrant ZONE tints — colored furniture, so they move with the finish. */');
    for (let c = 0; c < 4; c++) {
      const body = tone ? mix(ONE, `${TONE[c]}%`) : pair(hueOf(c + 1), f.backdrop);
      w(rule(name, `.quadrant-tint[data-cell="${c}"]`, [`fill: ${body}`, `fill-opacity: ${tone ? '0.38' : '0.5'}`]));
    }
  }
  return out.join('\n') + '\n';
}

function main() {
  const css = build();
  if (check) {
    const current = fs.existsSync(OUT_FILE) ? fs.readFileSync(OUT_FILE, 'utf8') : '';
    if (current !== css) {
      console.error('[build-chart-finish-css] STALE — run `node tools/build-chart-finish-css.js` and commit ' + path.relative(ROOT, OUT_FILE));
      process.exit(1);
    }
    if (!silent) console.log('[build-chart-finish-css] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, css);
  if (!silent) console.log(`[build-chart-finish-css] wrote ${path.relative(ROOT, OUT_FILE)} (${(css.match(/\{\n/g) || []).length} rules)`);
}

if (require.main === module) main();

module.exports = { build, F, TONE, TONE_TEXT, TONE_TEXT_D, STATUS_MARKS };
