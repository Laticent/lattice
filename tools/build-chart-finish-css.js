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
  // `rampText` is the member's own span, [0, 1] (`--mix` as shipped, 18%→92% on a heatmap). Pigment is
  // the DEFAULT finish, so it may not take a ramp's magnitude channel away: the earlier [16, 0.54] /
  // [16, 0.37] band was cut when a cell's text ink was a fixed color and had to clear the top step, and
  // it halved the top-to-empty contrast (3.54 → 1.92 light, 3.03 → 1.51 dark on indaco). The ink is
  // now picked per cell (`inkOn`, behind the @supports below), so the band no longer has to protect it.
  // tools/chart-finish-reach.mjs measures the span against the unfinished paint on every theme.
  // Pigment IS the solids (chart-family.styles.css § THE SOLID TIER): every body, with text on it or not, is the
  // concept's curated solid at full strength, and its text is `--chart-solid-ink` at 7:1.
  // A text-free ramp (a map) climbs to the FULL category solid under pigment, like every other pigment mark: the
  // kernel's --mix spans 24→88, so ×1.136 lands the top value at 100% of the solid and the lowest near 27% over the
  // land. The earlier [16, 0.54] band topped out at 64%, which read as tone, not pigment.
  pigment: { body: [100, 100], backdrop: [100, 100], ramp: [0, 1.136], rampText: [[0, 1], [0, 1]], layered: 0.22, edge: 1, edgeBackdrop: 1 },
  // Etch's ramp is wider than its whisper of a body: a ramp's identity is VALUE, and the
  // prototype's 6→28% band left a dark-mode heatmap nearly one flat navy — the flattening defect
  // in the magnitude channel. 6→43% keeps it the quietest of the three and still readable.
  etch: { body: [30, 40], backdrop: [14, 19], ramp: [6, 0.4], rampText: [[6, 0.4], [6, 0.4]], layered: 0.1, edge: 2, edgeBackdrop: 3 },
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
// stopped matching the chart. A state-chart tile or key swatch that is `deferred` is left alone:
// its hollowness is its background, which a finish would fill (an SVG shape's is
// `fill-opacity`, which a finish does not touch, so the shape keeps `deferred`).
const STATUS_MARKS = [
  { sel: '.gantt-bar[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  // An UNSTATED gantt mark is the neutral mute ramp (gantt.styles.css: "no status means no status"),
  // and it still wears the finish: a bar with no status beside bars that have one must not keep the
  // member's own vertical gradient while its neighbors go flat.
  { sel: '.gantt-bar:not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  { sel: '.gantt-milestone:not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false },
  { sel: '.gantt-legend-swatch:not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false, keysText: true },
  { sel: '.gantt-milestone[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false },
  { sel: '.gantt-legend-swatch[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: false, keysText: true },
  { sel: ':is(.state-node, .state-node-row)[data-s]:not([data-s="deferred"])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: true, nodeInk: true },
  // An UNSTATED state tile is the neutral `--muted-mark` tile (state-chart.styles.css), and it keeps
  // pace with the stated tiles beside it for the same reason as the gantt marks above. Its KEY has no
  // unstated row on purpose: the only key swatches without a status are the SVG edge-style lines, and
  // a `bg` rule would paint a box behind a line.
  { sel: ':is(.state-node, .state-node-row):not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: true, indexInk: true },
  // The SVG shape the state chart's layout pass draws is the tile people see; the `<li>` above is its
  // harness. An unstated shape keeps the member's `url(#sc-fill-0)` gradient unless a finish owns it too.
  { sel: '.state-node-shape:not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  { sel: '.state-node-shape[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'fill', bears: true },
  // The state chart's and the flowchart's key is the shared graph key (`_chart-family/graph-key.js`):
  // its status swatch follows the tiles it keys, and both charts' tiles are finished.
  // Each chart names its status hue in its own channel (state chart `--fill-*`, flowchart `--fc-*`), so the shared
  // key's swatch is reached once per chart, scoped by the key's `data-chart`.
  { sel: '[data-chart="state-chart"] .fc-key-swatch[data-s]:not([data-s="deferred"])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: false, keysText: true },
  { sel: '[data-chart="flowchart"] .fc-key-swatch[data-s]:not([data-s="deferred"])', hue: 'var(--fc-hue)', ink: 'var(--fc-hue-mark)', paint: 'bg', bears: false, keysText: true },
  // The progress fill's readout sits on its OWN plate (`.progress-pct`, progress.styles.css), so the
  // text never lands on the body and the fill does not need a text level: `bears: false`. As `true`
  // it took pigment's 40%/46% text level, which in dark mode is near-black against the slide. An
  // UNSTATED bar is the categorical slot (cat 1) and wears the same finish as a stated one, so a
  // chart never has one gradient bar among flat siblings.
  { sel: '.progress-fill[data-s]', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: false },
  { sel: '.progress-fill:not([data-s])', hue: 'var(--fill-hue)', ink: 'var(--fill-ink)', paint: 'bg', bears: false },
  // A flowchart node painted from a status word, or from no color at all (the neutral tile). A slot node is
  // a hue mark (`data-hue`) and is painted by the HUE rule. An author's explicit `fill`/`border` is left alone.
  { sel: '.fc-shape[data-s]:not([data-s="deferred"])', hue: 'var(--fc-hue)', ink: 'var(--fc-hue-mark)', paint: 'fill', bears: true },
  { sel: '.fc-shape:not([data-s]):not([data-slot]):not([data-fill])', hue: 'var(--fc-hue)', ink: 'var(--fc-hue-mark)', paint: 'fill', bears: true },
  // The HTML harness tile each node is measured from (hidden once the layout pass has drawn the SVG shape).
  { sel: '.fc-node[data-s]:not([data-s="deferred"])', hue: 'var(--fc-hue)', ink: 'var(--fc-hue-mark)', paint: 'bg', bears: true },
  { sel: '.fc-node:not([data-s]):not([data-slot]):not([data-fill])', hue: 'var(--fc-hue)', ink: 'var(--fc-hue-mark)', paint: 'bg', bears: true },
  { sel: '.chart-status[data-s]', hue: 'var(--chart-status-hue)', ink: 'var(--chart-status-ink)', paint: 'bg', bears: true },
  { sel: '.waterfall-bar[data-s="up"]', hue: 'var(--state-pass-hue)', ink: 'var(--state-pass-ink)', paint: 'fill', bears: false },
  { sel: '.waterfall-bar[data-s="down"]', hue: 'var(--state-fail-hue)', ink: 'var(--state-fail-ink)', paint: 'fill', bears: false },
  // hub-spoke paints a status on the one spoke that carries it — its node, or a tiered leaf —
  // from its own channel (hub-spoke.styles.css re-points --hs-state-* per status word).
  { sel: ':is(.hub-spoke-node, .hub-spoke-leaf)[data-s]', hue: 'var(--hs-state-hue)', ink: 'var(--hs-state-ink)', paint: 'fill', bears: false },
];

// What a body mixes toward. Pigment reproduces the family's shipped body tier
// (`--chart-cat-N-body`: the hue over `--chart-cat-base`, which is BLACK in dark mode).
// Etch and tone mix toward the CANVAS instead: a whisper or a value step taken toward
// black lands darker than the slide itself and reads as a hole, not a quiet mark. In light
// mode the two bases are the same color, so only the dark face differs.
let BASE = 'var(--chart-cat-base)';
const BODY_BASE = { pigment: 'var(--chart-cat-base)', etch: 'var(--bg)', tone: 'var(--bg)' };
const ONE = 'var(--chart-cat-1-hue)';
const ONE_INK = 'var(--chart-cat-1-ink)';
/**
 * The ink for TEXT on a mark, one per finish and never picked per body (a per-body black-or-white cleared 4.5:1,
 * read as mud at a median of 5.6:1, and changed the text color from chart to chart).
 *   pigment  `--chart-solid-ink`: each theme curates it with its solids, at 7:1 on every one of them
 *            (chart-solids.test.js).
 *   etch, tone  `--text-heading`: their text tiers are paler than the family's `-fill` tier, on which
 *            chart-contrast.test.js holds `--text-heading` (at least 6.9:1 on a category fill, 5.46:1 on a status).
 */
const textInk = (finish) => (finish === 'pigment' ? 'var(--chart-solid-ink)' : 'var(--text-heading)');
const hueOf = (n) => `var(--chart-cat-${n}-hue)`;
const inkOf = (n) => `var(--chart-cat-${n}-ink)`;
const mix = (hue, pct) => (pct === '100%' ? hue : `color-mix(in oklab, ${hue} ${pct}, ${BASE})`);
const ld = (a, b) => (a === b ? a : `light-dark(${a}, ${b})`);
const pair = (hue, [l, d]) => ld(mix(hue, `${l}%`), mix(hue, `${d}%`));
/**
 * The ink that clears a body, picked by the browser from the body's own color: black above
 * CIE relative luminance Y 0.1791, white below it. That is the exact point where the two inks give
 * the same contrast (both 4.58:1), so on ANY body the worse of the two is at least that. It is
 * the only guarantee that holds across 33 themes, where a fixed ink failed on some (--text-body
 * on a 40% cuoio body read 2.62:1).
 *
 * It switches on LUMINANCE, not OKLCH lightness. The first version used OKLCH L 0.565 as the
 * midpoint, and L is not luminance for a saturated hue: a red body at L 0.571 took black ink at
 * 4.31:1 where white gave 4.87:1 (onyx, heatmap top step), and the `* 999` blend zone around the
 * switch returned a mid-grey ink on a body of about the same lightness: 1.003:1 on rgb(210 40 70).
 * The slope is 1e6 so that zone is a rounding error of Y. Measured over a 52-per-channel sRGB grid
 * (140,608 bodies): worst 4.582:1 here, 1.003:1 for the OKLCH form. The ink is grey, written as xyz
 * (white is x 0.95047, y 1, z 1.08883 in D65) scaled by the switch.
 */
const inkOn = (cell) => {
  const k = 'clamp(0, (0.1791 - y) * 1000000, 1)';
  return `color(from ${cell} xyz-d65 calc(0.95047 * ${k}) ${k} calc(1.08883 * ${k}))`;
};
/**
 * A rule that needs relative color, behind the @supports that proves the engine has it. The
 * condition is the ink's own expression, channel math included, not a bare `color(from red xyz-d65
 * x y z)`: an engine that parsed relative color but not the clamp on a channel would pass a bare
 * guard, apply the body and drop the ink (checker finding). Checked in the real engines:
 * Chromium 131, Firefox 142 and WebKit 26 pass it and pick white on rgb(205 60 63); Chrome 118
 * predates relative color and fails it.
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
 * kept its category hue is a mark that no longer matches its own series. Pigment and etch
 * keep a dot's hue, so they may repaint it.
 */
const STROKE_MEMBERS = ['slope'];

/** Mark classes more than one member writes; a ramp rule scopes them to its own figure. */
const SHARED_CLASSES = new Set(['chart-key-swatch']);

/** A bearing entry is a class name, or (for a scoped key) a whole selector. */
const bearSel = (c) => (c.includes(' ') ? c : `.${c}`);

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
  // The family's shared key swatch (`chart-key-swatch`) keys whatever its member draws. Where that member's hue mark
  // carries text (a tower share), the key takes the text tier too, scoped to the member's figure: a solid swatch
  // beside a tinted share is a key that does not match its mark.
  for (const m of loadAll()) {
    const marks = m.kernel?.marks || [];
    const key = marks.find((r) => r.class === 'chart-key-swatch' && (r.paint === 'fill' || r.paint === 'bg'));
    const bodies = marks.filter((r) => r.encodes === 'hue' && r.class !== 'chart-key-swatch' && (r.paint === 'fill' || r.paint === 'bg'));
    // Only where EVERY hue body the key stands for carries text: a radar's or a quadrant's key also keys dots,
    // which stay solid, so their key stays with the plain rule.
    if (key && bodies.length && bodies.every((r) => r.bears)) {
      out[key.paint].add(`.${m.kernel.figureClass} .chart-key-swatch`);
    }
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
      // A hub-spoke group's connector band, twig, arrowhead and satellite name are the
      // group's hue at a faint level or as ink, never a body — so, like a container, they
      // keep their level and join the one hue through the member's own group property.
      // Left alone they kept eight category hues beside tonal discs and a tonal key. No text
      // sits on a band (a name sits on the canvas), so nothing here waits on relative color.
      w(rule(name, ':is(.hub-spoke-neck, .hub-spoke-twig, .hub-spoke-arrow, .hub-spoke-name)[data-hue]', [
        `--hs-group-hue: ${ONE}`,
        `--hs-group-ink: ${ONE_INK}`,
      ]));
      // A roadmap's phase color is a container color too: one property per phase column,
      // workstream lane and horizon card, read by its pill, its stripe and its card rule. The
      // `.roadmap` inside :where() matches the finished section itself, so no other table on
      // the slide is reached and the head keeps (0,1,1).
      // The phase pill's text is `--cat-on-mark`, solved for the shipped phase colors, not the
      // one hue: on it the a11y themes' dark faces read 1.54:1 and burgundy dark 4.44:1. So the
      // pill picks black or white from its own ground, as every other text-bearing mark does,
      // and the whole re-point waits on the engine that can pick it (TEXT WAITS, below).
      const pill = ':is(.roadmap .horizon-head > .lat-pill, .roadmap thead th:not(:first-child) > .lat-pill)';
      w(supports([
        rule(name, ':is(.roadmap thead th:not(:first-child), .roadmap td:first-child, .roadmap .horizon-card)', [
          `--phase-accent: ${ONE}`,
          `--phase-ink: ${ONE_INK}`,
        ]),
        rule(name, pill, [`--lat-pill-ink: ${inkOn(ONE)}`]),
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
        const notText = bears[paint].length ? `:not(${bears[paint].map(bearSel).join(', ')})` : '';
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
      // Pigment's text-bearing body IS the family's curated fill tier, read as the token.
      const body = ld(bodyL, bodyD);
      const ink = tone ? ONE_INK : inkOf(n);
      for (const paint of ['fill', 'bg']) {
        if (!bears[paint].length) continue;
        const cls = `:is(${bears[paint].map(bearSel).join(', ')})`;
        // An HTML mark's own text was colored for the full-strength body (the journey actor
        // initial is white), so it takes the ink its own body clears. TEXT WAITS: no fixed ink
        // clears every theme (--text-body read 3.54:1 on concrete's status pill, --text-heading
        // 3.34:1 on an a11y heatmap step, measured in WebKit with relative color removed), so
        // on an engine that cannot pick the ink, a mark that carries text keeps its shipped
        // paint and ink, which each theme's gates already hold. Every other mark still moves.
        const sel = `${cls}:is([data-hue="${n}"], [data-key-hue="${n}"])[data-encodes="hue"][data-paint="${paint}"]`;
        const text = paint === 'bg' ? [`color: ${textInk(name)}`] : [];
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
      const lvl = textLevel ? f.backdrop : f.body;
      const body = tone
        ? (textLevel ? pair(s.hue, [TONE_TEXT[0], TONE_TEXT_D[0]]) : pair(s.hue, [TONE[2], TONE[2]]))
        : pair(s.hue, lvl);
      const decls = paintDecls(s.paint, body, s.ink, s.bears ? f.edgeBackdrop : f.edge);
      // A status pill's gradient is a background-IMAGE; the shorthand clears it.
      if (s.bears && s.paint === 'bg') {
        decls.push(`color: ${textInk(name)}`);
        // A state tile's INDEX numeral takes its ink from `--state-index-ink`, which the member fixes to
        // `--text-body` (state-chart.styles.css). That held on the shipped tint, and on a stated tile's
        // vivid hue, but the neutral tile's finish body is darker than its shipped tint: cuoio's numeral fell
        // from 5.95:1 to 4.31:1. Where the finish moves the body, the numeral picks its ink from it too.
        // A status tile's own name and badge read `--state-node-ink` (the status ink), solved for the shipped tint.
        if (s.nodeInk) decls.push(`--state-node-ink: ${textInk(name)}`);
        if (s.indexInk) decls.push(`--state-index-ink: ${textInk(name)}`);
      }
      // TEXT WAITS (above): a status that carries text, and a key that follows one, move only
      // where the engine can pick the text's ink; elsewhere both keep the shipped paint.
      w(textLevel ? supports(rule(name, s.sel, decls)) : rule(name, s.sel, decls));
    }

    // ── TEXT ON A MARK — every caption, numeral and name printed on a finished body takes the finish's text ink ──
    // Each of these is a sibling of its mark in the SVG (a gantt caption beside its rect, a state caption and its
    // index numeral beside the tile's shape, a flowchart name beside its node), so it cannot inherit the mark's
    // ink and is reached by name. A caption beside its bar (`data-pos="after"`) sits on the canvas and keeps the
    // member's ink, and an author-colored caption (`data-text`) or an author-filled node (`data-fill`) keeps the
    // author's: both were chosen for exactly the tier a finish paints.
    w(supports(rule(name, [
      '.gantt-bar-label[data-pos="inside"]',
      '.state-node-group:not([data-text]) > .state-label-t',
      '.state-index-t[data-s]',
      '.state-node-group:has(> .state-node-shape:not([data-s])) .state-index-t',
      '.fc-node-group:not([data-text]):not([data-fill]):not([data-s="deferred"]) > .fc-name',
    ].join(', '), [`fill: ${textInk(name)}`])));

    // ── RAMP — a magnitude, so the finish SCALES the band ────────────────────
    // --mix stays the datum; the floor and the span are the finish's. A ramp's own stroke
    // (the cell gap) is the member's, except under etch, where the line is the identity.
    w('\n/* RAMP — scaled into the finish\'s band; --mix stays the datum. */');
    const rampAt = ([lo, k], base) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--mix) * ${k}), ${base})`;
    const rampStroke = name === 'etch'
      ? [`stroke: color-mix(in oklab, ${ONE_INK} 75%, transparent)`, `stroke-width: ${edge(1)}`, 'vector-effect: non-scaling-stroke']
      : [];
    // A finish whose text band IS the member's own span ([0, 1]: `--mix` as shipped) changes nothing about
    // the cells, so it emits nothing for them and nothing for their values: the theme-solved ink
    // (--heatmap-stepN-ink, ~100 hand-tuned declarations) keeps the cell it was solved for. Only pigment
    // is the identity, and it is the default, so most decks never see a heatmap rule from a finish.
    const memberSpan = f.rampText.every(([lo, k]) => lo === 0 && k === 1);
    for (const m of ramps) {
      // A ramp that prints its value takes the shorter text band (see `rampText`), as two
      // whole colors inside light-dark(), never a percentage.
      for (const [classes, body] of [
        [m.plain, rampAt(f.ramp, m.base)],
        [m.text, ld(rampAt(f.rampText[0], m.base), rampAt(f.rampText[1], m.base))],
      ]) {
        if (!classes.length) continue;
        if (memberSpan && classes === m.text) continue;
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
    if (!memberSpan) STEP_MIX.forEach((pct, i) => {
      const at = ([lo, k]) => `color-mix(in oklab, ${ONE} calc(${lo}% + var(--heatmap-step${i + 1}, ${pct}%) * ${k}), var(--heatmap-base))`;
      w(supports(rule(name, `.heatmap-value[data-step="${i + 1}"]`, [
        `fill: ${ld(inkOn(at(textBand[0])), inkOn(at(textBand[1])))}`,
      ])));
    });

    // ── A SERIES STROKE — line and ep-curve ─────────────────────────────────────────────────────────
    // The stroke IS the mark (paint `none`: no body, no edge to carry identity), so a finish may not give it the
    // body rule above; that stepped a stroke to 2.18:1 on light. It gets rules of its own, and every rule keeps
    // the stroke at or above the graphical 3:1 the family holds. ETCH draws the line heavier, because under
    // etch the line is the identity and a line chart has no outline to make it one. TONE draws every series
    // in the one ink at four steps (a step is a mix of the INK, which is far darker than the hue, so the
    // lightest step still clears the canvas), and series 5-8 repeat the steps dashed, so a series is never
    // told apart by a lightness step alone and the order survives grayscale print.
    if (name === 'etch') {
      w(rule(name, ':is(.line-path, .ep-path)', ['stroke-width: 2.6']));
    }
    if (tone) {
      const LINE_STEP = [100, 80, 64, 52];
      for (const n of SLOTS) {
        const step = `color-mix(in oklab, ${ONE_INK} ${LINE_STEP[(n - 1) % 4]}%, var(--bg))`;
        const dash = n > 4 ? ['stroke-dasharray: 5 3'] : [];
        w(rule(name, `:is(.line-path, .ep-path)[data-hue="${n}"]`, [`stroke: ${step}`, ...dash]));
        w(rule(name, `:is(.line-dot, .ep-dot)[data-hue="${n}"]`, [`fill: ${step}`]));
        w(rule(name, `:is(.line-area, .line-band)[data-hue="${n}"]`, [`fill: ${step}`, 'fill-opacity: 0.38']));
      }
      // A word-cloud word colored from a category (`--wc-color: var(--chart-cat-N-ink)`, baked inline) wears the one
      // ink; the accent word and the muted words are emphasis, not category, and keep theirs.
      w(supports(rule(name, '.wc-word[style*="--chart-cat-"]', [`fill: color-mix(in oklab, ${ONE_INK} 60%, var(--text-heading))`])));
      // A series NAME wears the one ink: under tone the line it names is no longer its category hue.
      w(rule(name, '.cart-series[data-hue]', [`fill: ${ONE_INK}`]));
    }

    // ── RISK BANDS — a severity ramp whose hue is the meaning ───────────────
    // The matrix's four bands rise in strength with severity (risk-matrix.styles.css), so order survives
    // grayscale print. Pigment IS that shipped ramp, so it adds nothing. Etch takes the same order at about
    // a third of the strength and draws each cell's edge in the band's ink at 2px (the line is the identity,
    // and it turns the cell hairline into a visible grid). Tone keeps the status hues, quieter, with a 1px edge.
    if (name !== 'pigment') {
      const BANDS = [
        ['low', 'pass', { etch: [10, 18], tone: [14, 22] }],
        ['medium', 'warn', { etch: [16, 26], tone: [24, 32] }],
        ['high', 'fail', { etch: [26, 38], tone: [40, 48] }],
        ['critical', 'fail', { etch: [44, 56], tone: [66, 70] }],
      ];
      w('\n/* RISK BANDS — the status hue is the meaning; the finish sets the strength and the edge. */');
      for (const [band, st, lv] of BANDS) {
        const [l, d] = lv[name];
        w(rule(name, `.risk-cell[data-band="${band}"]`, [
          `fill: ${ld(mix(`var(--state-${st}-hue)`, `${l}%`), mix(`var(--state-${st}-hue)`, `${d}%`))}`,
          `stroke: ${name === 'etch' ? `var(--state-${st}-ink)` : 'var(--bg)'}`,
          `stroke-width: ${name === 'etch' ? edge(f.edge) : '1.2'}`,
          ...(name === 'etch' ? ['vector-effect: non-scaling-stroke'] : []),
        ]));
      }
    }

    // ── A NEUTRAL hub-spoke node — no status and no hue ─────────────────────
    // Its shipped body is a flat neutral (`--hs-neutral-body`, a strong mix of the body ink), which is already
    // pigment's solid look and tone's one ink, so those two keep it. Etch is the pale one with the 2px edge:
    // left alone, a whole etched chart read as pigment with two recolored nodes.
    if (name === 'etch') {
      const body = ld(mix('var(--hs-neutral-ink)', `${f.backdrop[0]}%`), mix('var(--hs-neutral-ink)', `${f.backdrop[1]}%`));
      w(rule(name, ':is(.hub-spoke-node, .hub-spoke-leaf):not([data-s]):not([data-hue])', [
        `fill: ${body}`, 'stroke: var(--hs-neutral-ink)', `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke',
      ]));
      w(supports(rule(name, '.hub-spoke-icon:not([data-s]):not([data-hue])', [
        `--hs-icon-ink: ${ld(inkOn(mix('var(--text-body)', `${f.backdrop[0]}%`)), inkOn(mix('var(--text-body)', `${f.backdrop[1]}%`)))}`,
      ])));
    }
    if (name === 'pigment') {
      // Pigment paints the neutral node with the neutral SOLID, like every other unstated mark in the family.
      w(rule(name, ':is(.hub-spoke-node, .hub-spoke-leaf):not([data-s]):not([data-hue])', [
        'fill: var(--chart-neutral-hue)', 'stroke: var(--hs-neutral-ink)', `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke',
      ]));
      w(supports(rule(name, '.hub-spoke-icon:not([data-s]):not([data-hue])', [`--hs-icon-ink: ${textInk(name)}`])));
    }

    // ── A JOURNEY STAGE BAR — one constant ground (`encodes: none`), the heaviest mark on the slide ────
    // Pigment paints it with the neutral solid and the solid ink; tone keeps the shipped slate; etch is the pale one
    // with the 2px edge, in the stage's own
    // accent. The stage name's ink is `--journey-stage-fg`, solved against the shipped ground and a paler one holds.
    if (name === 'pigment') {
      w(supports(rule(name, ':is(.journey-stage, .journey-vstage-name)', [
        'background: var(--chart-neutral-hue)', `color: ${textInk(name)}`,
      ])));
    }
    if (name === 'etch') {
      w(rule(name, ':is(.journey-stage, .journey-vstage-name)', [
        'background: color-mix(in oklab, var(--journey-stage-bg) 38%, var(--bg))',
        `box-shadow: inset 0 0 0 ${edge(f.edge)} var(--section-accent, currentColor)`,
      ]));
    }

    // ── A HUB-SPOKE ICON — a drawing on a disc, so it takes the ink its disc clears ──
    // The icon (`{icon=…}`, engineering/decisions/2026-09-29-inline-icons.md § 14) is a sibling
    // of its disc, not a child, so it cannot read the disc's paint. Its ink is fixed per mode
    // for the shipped bodies and clears 3:1 there; under a finish the disc takes the bodies
    // above, and measured, no fixed ink held (a pigment group disc 2.27:1 on onyx dark, an
    // etch status disc 1.62:1). So the icon picks black or white from the SAME body this
    // finish gives its disc (the group rule and the status rule above, read from the same
    // tables, so the two cannot drift), and waits on relative color like every text ink here.
    w('\n/* HUB-SPOKE ICON — the ink its disc\'s finish body clears. */');
    const iconInk = ([a, b]) => ld(inkOn(a), inkOn(b));
    for (const n of SLOTS) {
      const arms = tone ? [mix(ONE, `${TONE[n - 1]}%`), mix(ONE, `${TONE[n - 1]}%`)] : [mix(hueOf(n), `${f.body[0]}%`), mix(hueOf(n), `${f.body[1]}%`)];
      w(supports(rule(name, `.hub-spoke-icon[data-hue="${n}"]`, [`--hs-icon-ink: ${name === 'pigment' ? textInk(name) : iconInk(arms)}`])));
    }
    // ── A TOWER SHARE FIGURE — printed on its share. Outside a finish the figure reads its ink off --mark-body
    // (tower.styles.css), solved for the shipped share; a finish paints the share's `fill` directly. A share CARRIES
    // TEXT (`bears: true`), so every finish paints it at the text-bearing tier, and the figure takes the one ink
    // curated for that tier (`textInk`).
    w('\n/* TOWER SHARE FIGURE — the ink curated for a text-bearing body. */');
    for (const n of SLOTS) w(supports(rule(name, `.tower-share-value[data-hue="${n}"]`, [`--tower-ink: ${textInk(name)}`])));
    const hsStatus = STATUS_MARKS.find((x) => x.sel.includes('.hub-spoke-node'));
    const sArms = tone ? [mix(hsStatus.hue, `${TONE[2]}%`), mix(hsStatus.hue, `${TONE[2]}%`)] : [mix(hsStatus.hue, `${f.body[0]}%`), mix(hsStatus.hue, `${f.body[1]}%`)];
    w(supports(rule(name, '.hub-spoke-icon[data-s]', [`--hs-icon-ink: ${name === 'pigment' ? textInk(name) : iconInk(sArms)}`])));

    // ── LAYERED — translucent and composited, so a FLAT alpha ────────────────
    // A gradient here reads as a fourth color where two polygons cross.
    w('\n/* LAYERED — a flat alpha of the series body; the edge carries the series. */');
    for (const n of SLOTS) {
      const body = tone ? mix(ONE, `${TONE[n - 1]}%`) : pair(hueOf(n), f.body);
      // Tone's alpha runs 0.32 (the strongest slot) down to 0.104. It used to run 0.6 down to 0.24, and three
      // translucent polygons at that strength stack to a mid-tone center that no ink can read a scale tick on
      // (near-black on concrete's overlap measured 3.73:1, the unfinished paint 4.67:1). tools/chart-finish-reach.mjs
      // RUNS holds it: no theme or mode may push a text run under its threshold that the unfinished paint cleared.
      const alpha = tone ? String(Math.round((0.06 + 0.14 * (TONE[n - 1] / 92)) * 1000) / 1000) : String(f.layered);
      // The outline is the series: 1px under pigment and tone, 2px under etch. Under tone it takes the series' step of
      // the one ink (the same steps a line uses), dashed from the fifth series, so overlapping polygons stay apart.
      const lstep = `color-mix(in oklab, ${ONE_INK} ${[100, 80, 64, 52][(n - 1) % 4]}%, var(--bg))`;
      w(rule(name, `[data-hue="${n}"][data-encodes="layered"][data-paint="fill"]${tone ? notLeft : ''}`, [
        `fill: ${body}`, `fill-opacity: ${alpha}`, `stroke: ${tone ? lstep : inkOf(n)}`,
        `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke',
        ...(tone && n > 4 ? ['stroke-dasharray: 5 3'] : []),
      ]));
    }
    // The radar's scale ticks sit in the CENTER, where every series polygon overlaps, and they are small
    // muted text (`--text-muted`, 9px). The member's own fill is a gradient that is nearly clear there
    // (stop-opacity 0.10 at the center); a finish's fill is FLAT, so the overlap builds up and the tick
    // fell from 5.13:1 to 3.20:1 (pigment), 4.18:1 (etch) and 1.60:1 (tone) on indaco. Lowering the alpha
    // enough to hold the tick would erase the polygons, so the tick takes the strongest ink instead.
    // tools/chart-finish-reach.mjs RUNS measures it on every theme and mode.
    w('\n/* The radar scale ticks sit on the overlap of every series, so they take the heading ink. */');
    w(rule(name, '.radar-tick', ['fill: var(--text-heading)']));

    // ── REGIONS — pigment puts color on the MARKS and keeps the ground under them neutral ──
    // Apple's HIG: "use color sparingly" and "add visual separation between contiguous areas of color". A zone, a
    // band header or a total is ground, not data, so the base finish paints it neutral and lets the marks on it carry
    // the color. Etch and tone keep their own treatments of the same furniture.
    if (name === 'pigment') {
      w('\n/* REGIONS — the ground is neutral; color sits on the marks (HIG: color sparingly). */');
      // A radar series is a line with dots: a translucent fill per series overlaps into a color in no palette.
      w(rule(name, '.radar-poly', ['fill: none', 'stroke-width: calc(var(--chart-edge) * 2.5)']));
      // A risk band IS a status (low · medium · high · critical), so it wears the status fill, deep enough to stand off
      // the slide by itself and seamed with the canvas. Critical is the DEEPEST step, the vivid fail fill taken 18%
      // toward black, so it outranks `high` in both intensities; its ring and marks come from the kernel
      // (risk-matrix.styles.css says the same).
      for (const [band, st] of [['low', 'pass'], ['medium', 'warn'], ['high', 'fail']]) {
        w(rule(name, `.risk-cell[data-band="${band}"]`, [`fill: var(--state-${st}-hue)`, 'stroke: var(--bg)', 'stroke-width: 1.2']));
      }
      w(rule(name, '.risk-cell[data-band="critical"]', ['fill: color-mix(in oklch, var(--fail-solid-vivid) 82%, black)', 'stroke: var(--bg)', 'stroke-width: 1.2']));
      // A waterfall's Plan and Actual are totals, not a direction: the neutral solid, the bar's full strength.
      w(rule(name, '.waterfall-bar[data-s="total"]', ['fill: var(--chart-neutral-hue)', 'stroke: var(--chart-neutral-hue)']));
      // The hub-spoke HUB is the one mark with no category and no status: the neutral solid, its name in the solid ink.
      w(rule(name, '.hub-spoke-hub', ['fill: var(--chart-neutral-hue)', 'stroke: var(--chart-neutral-hue)']));
      w(rule(name, ':is(.hub-spoke-hub-name, .hub-spoke-hub-value)', ['fill: var(--chart-solid-ink)']));
      // A roadmap workstream cell is a row header: neutral ground, its phase kept on the left rule.
      // It carries the workstream's name, so it moves with the other text-bearing marks (TEXT WAITS).
      w(supports(rule(name, '.roadmap td:first-child', ['background: var(--bg-alt)'])));
      // A journey stage's top rule was a category color per stage, decoration that read as data.
      w(rule(name, '.journey-stage', ['--section-accent: var(--chart-neutral-hue)']));
    }

    // ── the quadrant's zone tints ────────────────────────────────────────────
    // Furniture, not marks — but colored, so a finish that left them alone would leave four
    // pastel rectangles behind whatever it did to the dots.
    w('\n/* The quadrant ZONE tints — colored furniture, so they move with the finish. */');
    for (let c = 0; c < 4; c++) {
      // Pigment's zones are the neutral ground (REGIONS, above): the dots carry the category color.
      const body = tone ? mix(ONE, `${TONE[c]}%`) : name === 'pigment' ? 'var(--bg-alt)' : pair(hueOf(c + 1), f.backdrop);
      // The zone names are printed on these tints, so they wait with the text (TEXT WAITS).
      w(supports(rule(name, `.quadrant-tint[data-cell="${c}"]`, [`fill: ${body}`, `fill-opacity: ${tone ? '0.38' : name === 'pigment' ? '1' : '0.5'}`])));
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
