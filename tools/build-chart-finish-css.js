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
// 4.5:1. The levels and their measurement are finish-coherence.md §Levels (in
// engineering/decisions/2026-09-07-chart-design-language/); the two modes differ.
const TONE_TEXT = [30, 27, 24, 21, 18, 15, 12, 9];
const TONE_TEXT_D = [35, 31, 28, 24, 21, 17, 14, 10];

/** The levels, per finish (finish-coherence.md §Levels). `[light, dark]` pairs. */
const F = {
  pigment: { body: [82, 82], backdrop: [40, 46], ramp: [16, 0.54], rampText: [[16, 0.54], [16, 0.37]], layered: 0.35, edge: 1, edgeBackdrop: 1 },
  // Etching's ramp is wider than its whisper of a body: a ramp's identity is VALUE, and the
  // prototype's 6→28% band left a dark-mode heatmap nearly one flat navy — the flattening defect
  // in the magnitude channel. 6→43% keeps it the quietest of the three and still readable.
  etching: { body: [30, 40], backdrop: [14, 19], ramp: [6, 0.4], rampText: [[6, 0.4], [6, 0.4]], layered: 0.18, edge: 2, edgeBackdrop: 3 },
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
//
// `keysText`: a KEY whose marks carry text takes their level, though it carries none itself —
// under tone a gantt key at the middle step sat beside bars at the text step, and the key
// stopped matching the chart. A state-chart tile or key dot that is `deferred` is left alone:
// its hollowness is its background, which a finish would fill (an SVG shape's is
// `fill-opacity`, which a finish does not touch, so the shape keeps `deferred`).
const STATUS_MARKS = [
  { sel: '.gantt-bar[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  { sel: '.gantt-milestone[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false },
  { sel: '.gantt-legend-swatch[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false, keysText: true },
  { sel: ':is(.state-node, .state-node-row)[data-s]:not([data-s="deferred"])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: true },
  { sel: '.state-node-shape[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  { sel: '.state-dot[data-s]:not([data-s="deferred"])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: false, keysText: true },
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
/**
 * The ink that clears a body, picked by the browser from the body's own color: black above
 * OKLCH L 0.565, white below it. At that lightness the two meet (relative luminance ~0.18), so
 * either side clears ~4.5:1 on ANY body — the only guarantee that holds across 33 themes, where
 * a fixed ink failed on some (--text-body on a 40% cuoio body read 2.62:1).
 */
const inkOn = (cell) => `oklch(from ${cell} clamp(0, (0.565 - l) * 999, 1) 0 0)`;
/**
 * A rule that needs relative color, behind the @supports that proves the engine has it. The
 * condition is the ink's own expression, channel math included, not a bare `oklch(from red l c
 * h)`: an engine that parsed relative color but not the clamp on a channel would pass a bare
 * guard, apply the body and drop the ink (checker finding). Chrome 131 and WebKit 26 pass it;
 * Chrome 118 fails it.
 */
const SUPPORTS = `@supports (color: ${inkOn('red')})`;
const supports = (css) => `${SUPPORTS} {\n${css}\n}`;

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
    // A class every member shares (`chart-key-swatch`) is scoped to this member's figure, so
    // one member's ramp rule cannot reach another member's key: the map's rule mixes toward
    // --map-base, which a heatmap slide does not define.
    const scoped = (c) => (SHARED_CLASSES.has(c) ? `${m.kernel.figureClass} .${c}` : c);
    out.push({
      name: m.name, base,
      plain: rows.filter((r) => !r.bears).map((r) => scoped(r.class)),
      text: rows.filter((r) => r.bears).map((r) => scoped(r.class)),
    });
  }
  return out;
}

/**
 * A KEY takes the level of the mark it keys, so a key never shows a different step from its
 * marks. Most keys key a mark that carries no text and need no entry; a key that stands for a
 * TEXT-BEARING mark is listed here against that mark's class.
 */
const KEY_FOLLOWS = { 'fc-key-swatch': 'fc-shape' };

/**
 * Members whose identity is a STROKE (`paint: "none"` series path), which no finish reaches.
 * Tone leaves every mark of theirs alone, dots and bands included: a tonal dot on a line that
 * kept its category hue is a mark that no longer matches its own series. Pigment and etching
 * keep a dot's hue, so they may repaint it.
 */
const STROKE_MEMBERS = ['line', 'slope'];

/** Mark classes more than one member writes; a ramp rule scopes them to its own figure. */
const SHARED_CLASSES = new Set(['chart-key-swatch']);

/** The text-bearing mark classes, from every chart manifest's `kernel.marks`. */
function bearingClasses() {
  const { loadAll } = require('../lib/components');
  const out = { fill: new Set(), bg: new Set() };
  for (const m of loadAll()) {
    for (const r of m.kernel?.marks || []) {
      if (r.bears && r.encodes === 'hue' && (r.paint === 'fill' || r.paint === 'bg')) out[r.paint].add(r.class);
    }
  }
  for (const [key, mark] of Object.entries(KEY_FOLLOWS)) {
    if (out.fill.has(mark) || out.bg.has(mark)) out[swatchPaint(key)].add(key);
  }
  return { fill: [...out.fill].sort(), bg: [...out.bg].sort() };
}

/** How a key swatch takes paint, from the manifests (an HTML swatch is `bg`, an SVG one `fill`). */
function swatchPaint(cls) {
  const { loadAll } = require('../lib/components');
  for (const m of loadAll()) for (const r of m.kernel?.marks || []) if (r.class === cls) return r.paint;
  throw new Error(`KEY_FOLLOWS names ${cls}, which no manifest declares`);
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

/** Every mark class a stroke member declares, for tone to leave alone. */
function strokeMemberClasses() {
  const { loadAll } = require('../lib/components');
  return loadAll().filter((m) => STROKE_MEMBERS.includes(m.name))
    .flatMap((m) => (m.kernel?.marks || []).map((r) => r.class))
    .filter((c) => !SHARED_CLASSES.has(c)).sort();
}

function build() {
  const bears = bearingClasses();
  const leave = strokeMemberClasses();
  const notLeft = `:not(${leave.map((c) => `.${c}`).join(', ')})`;
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

    // ── quadrant's own cell table, under tone ───────────────────────────────
    // The quadrant keeps a per-cell slot table of its own (`--cell-ink`), which its zone names
    // read. Its tints move with a finish (below), so under tone every cell names in the one ink.
    // The FAMILY slot table (`--mark-hue` / `--mark-ink`) is deliberately NOT re-pointed: its
    // only readers a finish does not already paint are stroke- and type-painted (line's series
    // path, slope), and reaching them that way walks around `paint: "none"` — measured, it
    // washed line's series 5–8 out to near-white on a light canvas.
    // The quadrant's zone names take this ink on its zone tints; both wait (TEXT WAITS, below).
    if (tone) w(supports(rule(name, '[data-cell]', [`--cell-ink: ${ONE_INK}`])));

    // ── containers, under tone ───────────────────────────────────────────────
    // A container (a tinted kanban column, a slotted flowchart group) is never repainted as a
    // mark: that buried a group's title under an 82% body. But its faint tint is still a
    // category hue, so under tone its OWN hue property is re-pointed to the one hue. It keeps
    // its level and its structure, the key keeps matching it, and its title wears the one ink.
    if (tone) {
      // A container carries its own title (a kanban column's header, a flowchart group's name),
      // so its re-point waits with every other text-bearing mark (TEXT WAITS, below).
      // The done lane is keyed to the pass STATUS, and a status keeps its hue.
      w(supports([
        rule(name, '.kanban-column:not([data-done])', [`--col-hue: ${ONE}`]),
        rule(name, ':is(.fc-group, .fc-key-swatch[data-kind="group"])[data-slot]', [`--fc-group-hue: ${ONE}`]),
        rule(name, '.fc-group-title[data-slot]', [`fill: ${ONE_INK}`]),
      ].join('\n')));
      // A roadmap's phase color is a container color too: one property per phase column,
      // workstream lane and horizon card, read by its pill, its stripe and its card rule. The
      // `.roadmap` inside :where() matches the finished section itself, so no other table on
      // the slide is reached and the head keeps (0,1,1).
      // The phase pill's text is `--cat-on-mark`, solved for the shipped phase colors, not the
      // one hue: on it the a11y themes' dark faces read 1.54:1 and burgundy dark 4.44:1. So the
      // pill picks black or white from its own ground, as every other text-bearing mark does,
      // and the whole re-point waits on the engine that can pick it (TEXT WAITS, below).
      const pill = ':is(.roadmap .horizon-meta, .roadmap thead th:not(:first-child) > code)';
      w(supports([
        rule(name, ':is(.roadmap thead th:not(:first-child), .roadmap td:first-child, .roadmap .horizon-card)', [
          `--phase-accent: ${ONE}`,
          `--phase-ink: ${ONE_INK}`,
        ]),
        rule(name, pill, [`color: ${inkOn(ONE)}`]),
      ].join('\n')));
    }

    // ── HUE — the body a finish is named for ────────────────────────────────
    w('\n/* HUE — the body a finish is named for, under the mark\'s ink edge. */');
    for (const n of SLOTS) {
      const body = tone ? mix(ONE, `${TONE[n - 1]}%`) : pair(hueOf(n), f.body);
      const ink = tone ? ONE_INK : inkOf(n);
      for (const paint of ['fill', 'bg']) {
        // A text-bearing mark is left to its own rule below, which waits on relative color.
        // Without this it would take the full body here, under ink solved for the shipped one.
        const notText = bears[paint].length ? `:not(${bears[paint].map((c) => `.${c}`).join(', ')})` : '';
        w(rule(name, `:is([data-hue="${n}"], [data-key-hue="${n}"])[data-encodes="hue"][data-paint="${paint}"]${notText}${tone ? notLeft : ''}`, paintDecls(paint, body, ink, f.edge)));
      }
    }

    // ── HUE on a mark that carries text ─────────────────────────────────────
    // The register CAPS the level; the finish still picks one inside the cap. Emitted after
    // the plain rule at the same specificity, so source order hands it the mark.
    w('\n/* HUE on a mark that CARRIES TEXT — the quieter level its text was measured against. */');
    for (const n of SLOTS) {
      const [bodyL, bodyD] = tone
        ? [mix(ONE, `${TONE_TEXT[n - 1]}%`), mix(ONE, `${TONE_TEXT_D[n - 1]}%`)]
        : [mix(hueOf(n), `${f.backdrop[0]}%`), mix(hueOf(n), `${f.backdrop[1]}%`)];
      const body = ld(bodyL, bodyD);
      const ink = tone ? ONE_INK : inkOf(n);
      for (const paint of ['fill', 'bg']) {
        if (!bears[paint].length) continue;
        const cls = `:is(${bears[paint].map((c) => `.${c}`).join(', ')})`;
        // An HTML mark's own text was colored for the full-strength body (the journey actor
        // initial is white), so it takes the ink its own body clears. TEXT WAITS: no fixed ink
        // clears every theme (--text-body read 3.54:1 on concrete's status pill, --text-heading
        // 3.34:1 on an a11y heatmap step, measured in WebKit with relative color removed), so
        // on an engine that cannot pick the ink, a mark that carries text keeps its shipped
        // paint and ink, which each theme's gates already hold. Every other mark still moves.
        const sel = `${cls}[data-hue="${n}"][data-encodes="hue"][data-paint="${paint}"]`;
        const text = paint === 'bg' ? [`color: ${ld(inkOn(bodyL), inkOn(bodyD))}`] : [];
        w(supports(rule(name, sel, [...paintDecls(paint, body, ink, f.edgeBackdrop), ...text])));
      }
    }

    // ── STATUS — a meaning, so it keeps its own hue under every finish ───────
    // The prototype sent a status body to the one hue under tone and left the status on the
    // edge. On the render that made a gantt key of four identical swatches — done, live,
    // at-risk and blocked told apart by a 1px outline — which is the flattening defect
    // (finish-render-defects.md) in the status channel. A status is not one of the eight
    // categories tone collapses; it is a meaning the reader must decode. So under tone it
    // keeps its hue at tone's quiet level (the text-bearing step for a mark that carries text,
    // the middle step for one that does not), and the finish still quiets it.
    w('\n/* STATUS — the member\'s own status channel; the hue is the meaning, so it stays. */');
    for (const s of STATUS_MARKS) {
      // A status that carries text takes tone's text level under pigment too: a status hue can
      // be far darker than a category's (concrete's is near-black), and at pigment's 40% the
      // text on it read 3.6:1 where tone's 30% held on every theme.
      const textLevel = s.bears || s.keysText;
      const lvl = textLevel ? (name === 'pigment' ? [TONE_TEXT[0], TONE_TEXT_D[0]] : f.backdrop) : f.body;
      const body = tone
        ? (textLevel ? pair(s.hue, [TONE_TEXT[0], TONE_TEXT_D[0]]) : pair(s.hue, [TONE[2], TONE[2]]))
        : pair(s.hue, lvl);
      const decls = paintDecls(s.paint, body, s.ink, s.bears ? f.edgeBackdrop : f.edge);
      // A status pill's gradient is a background-IMAGE; the shorthand clears it.
      if (s.bears && s.paint === 'bg') {
        const [l, d] = tone || name === 'pigment' ? [TONE_TEXT[0], TONE_TEXT_D[0]] : f.backdrop;
        decls.push(`color: ${ld(inkOn(mix(s.hue, `${l}%`)), inkOn(mix(s.hue, `${d}%`)))}`);
      }
      // TEXT WAITS (above): a status that carries text, and a key that follows one, move only
      // where the engine can pick the text's ink; elsewhere both keep the shipped paint.
      w(textLevel ? supports(rule(name, s.sel, decls)) : rule(name, s.sel, decls));
    }

    // ── RAMP — a magnitude, so the finish SCALES the band ────────────────────
    // --mix stays the datum; the floor and the span are the finish's. A ramp's own stroke
    // (the cell gap) is the member's, except under etching, where the line is the identity.
    w('\n/* RAMP — scaled into the finish\'s band; --mix stays the datum. */');
    const rampAt = ([lo, k], base) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--mix) * ${k}), ${base})`;
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
        // A ramp that prints its value waits with its text (TEXT WAITS, above).
        const wrap = classes === m.text ? supports : (css) => css;
        w(wrap(rule(name, `${cls}[data-encodes="ramp"][data-paint="fill"]`, [`fill: ${body}`, ...rampStroke])));
        w(wrap(rule(name, `${cls}[data-encodes="ramp"][data-paint="bg"]`, [`background: ${body}`])));
      }
    }
    // A HEATMAP VALUE is printed on its cell, and the theme solves its ink per step against
    // the SHIPPED fill (--heatmap-stepN-ink). A finish changes the fill under the text, so no
    // fixed ink holds: measured, the strong ink fell to 3.34:1 on the a11y themes' top step,
    // where white clears 6.4:1, and on indaco the reverse. So the browser picks the ink from
    // the cell's own color: the value's fill is the step's body, taken through relative-color
    // syntax to black above OKLCH L 0.565 and white below it. That lightness is where the two
    // meet (relative luminance ~0.18), so either side clears ~4.5:1 on every theme. The step's
    // --mix is the heatmap's own (--heatmap-stepN, else the member's default, which
    // chart-finish-css.test.js pins to heatmap.styles.css). It sits behind @supports with its
    // cell's text band (TEXT WAITS, above): a declaration carrying var() always parses, so a
    // plain one would fail at computed-value time on an engine without relative color and
    // leave the value on the default black fill. There, the cell and its value keep the
    // shipped fill and the ink the theme solved for it.
    const STEP_MIX = [18, 36.5, 55, 73.5, 92];
    const textBand = f.rampText;
    STEP_MIX.forEach((pct, i) => {
      const at = ([lo, k]) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--heatmap-step${i + 1}, ${pct}%) * ${k}), var(--heatmap-base))`;
      w(supports(rule(name, `.heatmap-value[data-step="${i + 1}"]`, [
        `fill: ${ld(inkOn(at(textBand[0])), inkOn(at(textBand[1])))}`,
      ])));
    });

    // ── LAYERED — translucent and composited, so a FLAT alpha ────────────────
    // A gradient here reads as a fourth color where two polygons cross.
    w('\n/* LAYERED — a flat alpha of the series body; the edge carries the series. */');
    for (const n of SLOTS) {
      const body = tone ? mix(ONE, `${TONE[n - 1]}%`) : pair(hueOf(n), f.body);
      const alpha = tone ? String(Math.round((0.2 + 0.4 * (TONE[n - 1] / 92)) * 1000) / 1000) : String(f.layered);
      w(rule(name, `[data-hue="${n}"][data-encodes="layered"][data-paint="fill"]${tone ? notLeft : ''}`, [
        `fill: ${body}`, `fill-opacity: ${alpha}`, `stroke: ${tone ? ONE_INK : inkOf(n)}`,
      ]));
    }

    // ── the quadrant's zone tints ────────────────────────────────────────────
    // Furniture, not marks — but colored, so a finish that left them alone would leave four
    // pastel rectangles behind whatever it did to the dots.
    w('\n/* The quadrant ZONE tints — colored furniture, so they move with the finish. */');
    for (let c = 0; c < 4; c++) {
      const body = tone ? mix(ONE, `${TONE[c]}%`) : pair(hueOf(c + 1), f.backdrop);
      // The zone names are printed on these tints, so they wait with the text (TEXT WAITS).
      w(supports(rule(name, `.quadrant-tint[data-cell="${c}"]`, [`fill: ${body}`, `fill-opacity: ${tone ? '0.38' : '0.5'}`])));
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

module.exports = { build, F, TONE, TONE_TEXT, TONE_TEXT_D, STATUS_MARKS, KEY_FOLLOWS, STROKE_MEMBERS };
