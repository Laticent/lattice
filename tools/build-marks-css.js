#!/usr/bin/env node
/**
 * Generates lib/components/chart/_chart-family/marks.generated.css — the chart finishes' rules.
 *
 * A finish moves color; it never adds or removes it, and it never touches structure
 * (engineering/chart-styling.md §3). The deck picks one with `marks:`
 * (lib/core/resolve-marks.js), which stamps `marks-<name>` on every section;
 * this writes the rules those classes switch on into
 * lib/components/chart/_chart-family/marks.generated.css, which tools/build-css.js
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
 * SPECIFICITY IS KEPT LOW ON PURPOSE. Each rule is `section.marks-X :where(<mark>)` (X is one finish, or an
 * `:is()` of several: the shared rules read the `--finish-*` values and name no finish)
 * — (0,1,1) — with `!important`, because member paint arrives as inline `url(#)` gradient
 * fills. `!important` alone beats every member rule (no chart member marks paint
 * `!important`). What must beat a FINISH is a texture: the a11y themes paint their
 * categorical pattern fills with `!important` rules of (0,3,1) and up, and themes load after
 * lattice.css. Were this rule any more specific, picking a finish would strip the texture
 * channel from a colorblind reader. So a theme's texture wins, and that is the design.
 *
 * TWO ARMS, NOT A LEADING `:is()`, for every mark rule. `section.…` is the slide; `figure.…` is Read·Article's
 * re-hosted chart, which carries the token over (prose-projection.mjs `withMarks`). The ONE leading `:is()` is the
 * token blocks' third head (`:is(section, figure).marks-X .chart-frame`): it declares values, not paint, and must
 * reach the frame a pane nests, where the chart family's variables live.
 *
 * WIDTHS. An SVG `stroke-width` is in viewBox units (chart-styling.md §2), so an edge is
 * `calc(var(--chart-edge) * k)` under `vector-effect: non-scaling-stroke`. An HTML mark
 * takes its edge as an inset box-shadow, never a border: a border changes the box, and a
 * finish never touches structure.
 *
 *   node tools/build-marks-css.js           write the file
 *   node tools/build-marks-css.js --check   freshness gate (build:check)
 */

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const OUT_FILE = path.join(ROOT, 'lib', 'components', 'chart', '_chart-family', 'marks.generated.css');
const check = process.argv.includes('--check');
const silent = process.argv.includes('--silent');

const { MARKS_FINISHES } = require('../lib/core/resolve-marks');

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
  // concept's curated solid at full strength, and its text is `--chart-on-mark` at 7:1.
  // A text-free ramp (a map) climbs to the FULL category solid under pigment, like every other pigment mark: the
  // kernel's --mix spans 24→88, so ×1.136 lands the top value at 100% of the solid and the lowest near 27% over the
  // land. The earlier [16, 0.54] band topped out at 64%, which read as tone, not pigment.
  pigment: { body: [100, 100], backdrop: [100, 100], ramp: [0, 1.136], rampText: [[0, 1], [0, 1]], layered: 0.22, edge: 1, edgeBackdrop: 1, border: 1 },
  // Etch's ramp is wider than its whisper of a body: a ramp's identity is VALUE, and the
  // prototype's 6→28% band left a dark-mode heatmap nearly one flat navy — the flattening defect
  // in the magnitude channel. 6→43% keeps it the quietest of the three and still readable.
  etch: { body: [30, 40], backdrop: [14, 19], ramp: [6, 0.5], rampText: [[6, 0.5], [6, 0.5]], layered: 0.1, edge: 2.6, edgeBackdrop: 3, border: 0 },
  // `ramp` is the band a text-free ramp takes (a map region). `rampText` is the band a ramp that PRINTS ITS VALUE takes
  // (a heatmap cell), as [light, dark]. Tone's two used to differ (70% on light, near 50% on dark) because a fixed ink had to
  // clear the top step. Each value now picks its own ink (`inkOn`, behind the @supports below), which clears 4.58:1 on any
  // body, so the band no longer protects the text, and a finish whose premise is "value is the datum" may not flatten the
  // ramp for it: tone's dark top step against an empty cell was 1.67:1 and is measured in the PR. Etch keeps its whisper.
  // A ramp already encodes VALUE, which is tone's whole idea, so on a ramp member tone and pigment differ only by band.
  tone: { ramp: [10, 0.82], rampText: [[10, 0.82], [10, 0.82]], edge: 1, edgeBackdrop: 2.5, border: 0 },
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
  // The progress fill carries no text: its readout sits on the slide past the bar's end (`.progress-pct`,
  // the fill's sibling in progress.styles.css), so the text never lands on the body and the fill does
  // not need a text level: `bears: false`. As `true`
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
 *   pigment  `--chart-on-mark`: each theme curates it with its solids, at 7:1 on every one of them
 *            (chart-solids.test.js).
 *   etch, tone  `--text-heading`: their text tiers are paler than the family's `-fill` tier, on which
 *            chart-contrast.test.js holds `--text-heading` (at least 6.9:1 on a category fill, 5.46:1 on a status).
 */
const textInk = (finish) => (finish === 'pigment' ? 'var(--chart-on-mark)' : 'var(--text-heading)');
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
/** The signal ring for a mark whose edge is `k` edges wide: 1.3 hairlines times k (`--state-signal-w` is the 1.3). */
const ring = (k) => `calc(var(--state-signal-w) * ${k})`;

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
 * Members whose identity is a STROKE (`paint: "none"` series path): all edge and no body.
 * Tone leaves every mark of theirs alone, dots and bands included: a tonal dot on a line that
 * kept its category hue is a mark that no longer matches its own series. Pigment and etch
 * keep a dot's hue, so they may repaint it.
 */
const STROKE_MEMBERS = ['line', 'slope', 'ep-curve'];

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

/**
 * The selector head for a rule that serves `finishes`. One finish keeps the class on both arms
 * (`section.marks-etch`); a set of them takes `:is()`, which is as specific as its most specific
 * member, so every head stays (0,1,1) with `:where()` after it.
 */
function head(tag, finishes) {
  const names = [].concat(finishes);
  return names.length === 1 ? `${tag}.marks-${names[0]}` : `${tag}:is(${names.map((n) => `.marks-${n}`).join(', ')})`;
}

function rule(finishes, mark, decls, important = true) {
  const sel = [`${head('section', finishes)} :where(${mark})`, `${head('figure', finishes)} :where(${mark})`].join(',\n');
  return `${sel} {\n${decls.map((d) => `  ${d}${important ? ' !important' : ''};`).join('\n')}\n}`;
}

/** Every mark class a stroke member declares, for tone to leave alone. */
function strokeMemberClasses() {
  const { loadAll } = require('../lib/components');
  return loadAll().filter((m) => STROKE_MEMBERS.includes(m.name))
    .flatMap((m) => (m.kernel?.marks || []).map((r) => r.class))
    .filter((c) => !SHARED_CLASSES.has(c)).sort();
}

// ── THE FINISH TOKENS ────────────────────────────────────────────────────────────────────────────────────────────────
// A finish is a block of VALUES on the section, the way `dark` is, and every mark rule below reads them. No rule names
// a finish except the ones that are that finish's alone (tone's containers, pigment's neutral regions). The tokens carry
// numbers and a base, never a color the mark would resolve differently (the hue and the ink edge are read at the mark),
// so a rule's only job is to say WHICH mark takes WHICH token. They are plain declarations: nothing here is `!important`,
// because nothing here paints.
const T = {
  base: '--finish-base', ink: '--finish-ink', edge: '--finish-edge', edgeText: '--finish-edge-text',
  hue: (n) => `--finish-hue-${n}`, body: (n) => `--finish-body-${n}`, bodyD: (n) => `--finish-body-d-${n}`,
  text: (n) => `--finish-text-${n}`, textD: (n) => `--finish-text-d-${n}`,
  layer: (n) => `--finish-layer-${n}`, layerInk: (n) => `--finish-layer-ink-${n}`,
  status: '--finish-status', statusD: '--finish-status-d', statusText: '--finish-status-text', statusTextD: '--finish-status-text-d',
  rampLo: '--finish-ramp-lo', rampK: '--finish-ramp-k',
  rampTextLo: '--finish-ramp-text-lo', rampTextK: '--finish-ramp-text-k',
  rampTextDLo: '--finish-ramp-text-d-lo', rampTextDK: '--finish-ramp-text-d-k',
};
const tv = (name) => `var(${name})`;
/** A hue taken to a percent toward the finish base: the one expression every body, text body and ink picker reads. */
const tmix = (hue, pct) => `color-mix(in oklab, ${hue} ${tv(pct)}, ${tv(T.base)})`;
const tld = (hue, l, d) => `light-dark(${tmix(hue, l)}, ${tmix(hue, d)})`;
const tEdge = (token) => `calc(var(--chart-edge) * ${tv(token)})`;
const tRing = (token) => `calc(var(--state-signal-w) * ${tv(token)})`;
const num = (v) => String(v);

/** The values one finish sets on its section. */
function finishTokens(name) {
  const f = F[name];
  const tone = name === 'tone';
  const d = [
    `${T.base}: ${BODY_BASE[name]}`,
    `${T.ink}: ${textInk(name)}`,
    `${T.edge}: ${num(f.edge)}`,
    `${T.edgeText}: ${num(f.edgeBackdrop)}`,
    // 1 keeps a pill's, bar's and key tile's border; 0 drops it, so an ink edge drawn as an inset ring has no halo outside it.
    `--finish-border: ${f.border}`,
  ];
  for (const n of SLOTS) {
    const i = n - 1;
    d.push(`${T.hue(n)}: ${tone ? ONE : hueOf(n)}`);
    d.push(`${T.body(n)}: ${tone ? TONE[i] : f.body[0]}%`, `${T.bodyD(n)}: ${tone ? TONE[i] : f.body[1]}%`);
    d.push(`${T.text(n)}: ${tone ? TONE[i] : f.backdrop[0]}%`, `${T.textD(n)}: ${tone ? TONE[i] : f.backdrop[1]}%`);
    // Tone's alpha runs 0.32 (the strongest slot) down to 0.104. It used to run 0.6 down to 0.24, and three
    // translucent polygons at that strength stack to a mid-tone center that no ink can read a scale tick on
    // (near-black on concrete's overlap measured 3.73:1, the unfinished paint 4.67:1). tools/chart-finish-reach.mjs
    // RUNS holds it: no theme or mode may push a text run under its threshold that the unfinished paint cleared.
    d.push(`${T.layer(n)}: ${tone ? Math.round((0.06 + 0.14 * (TONE[i] / 92)) * 1000) / 1000 : f.layered}`);
    // The outline is the series: 1px under pigment and tone, 2px under etch. Under tone it takes the series' step of the
    // one ink (the same steps a line uses), dashed from the fifth series, so overlapping polygons stay apart.
    d.push(`${T.layerInk(n)}: ${tone ? `color-mix(in oklab, ${ONE_INK} ${[100, 80, 64, 52][i % 4]}%, var(--bg))` : inkOf(n)}`);
  }
  // A status keeps its own hue under every finish; the finish sets only the level. A mark that carries text takes the
  // quieter one. Under tone the plain level is the middle step and the text level is the first text step.
  d.push(`${T.status}: ${tone ? TONE[2] : f.body[0]}%`, `${T.statusD}: ${tone ? TONE[2] : f.body[1]}%`);
  d.push(`${T.statusText}: ${tone ? TONE_TEXT[0] : f.backdrop[0]}%`, `${T.statusTextD}: ${tone ? TONE_TEXT_D[0] : f.backdrop[1]}%`);
  d.push(`${T.rampLo}: ${f.ramp[0]}%`, `${T.rampK}: ${f.ramp[1]}`);
  d.push(`${T.rampTextLo}: ${f.rampText[0][0]}%`, `${T.rampTextK}: ${f.rampText[0][1]}`);
  d.push(`${T.rampTextDLo}: ${f.rampText[1][0]}%`, `${T.rampTextDK}: ${f.rampText[1][1]}`);
  // The values name the chart family's own variables (`--chart-cat-N-hue`, `--chart-on-mark`), and a custom property
  // resolves where it is DECLARED. Those variables live on the chart's own frame (`section.chart-frame`, `.chart-frame`),
  // which is the slide in a plain chart slide and a nested element in a pane, where the slide is a `lat-pane-host` that
  // carries none of them. A block on the slide alone gave every pane chart a black fill; a second target on the frame
  // resolves the values where the variables are.
  const heads = [`section.marks-${name}`, `figure.marks-${name}`, `:is(section, figure).marks-${name} .chart-frame`];
  return [`${heads.join(',\n')} {`, ...d.map((x) => `  ${x};`), '}'].join('\n');
}

const ALL = MARKS_FINISHES;
// Etch and tone move a ramp's text band, a heatmap value and a hub-spoke icon; pigment is the member's own span there.
const MOVERS = ALL.filter((n) => n !== 'pigment');

function build() {
  const bears = bearingClasses();
  const leave = strokeMemberClasses();
  const notLeft = `:not(${leave.map((c) => `.${c}`).join(', ')})`;
  const onlyLeft = `:is(${leave.map((c) => `.${c}`).join(', ')})`;
  // Tone paints a series stroke's dots and bands in their own hue, so a tonal dot never stops matching its series.
  const keepsHue = ALL.filter((n) => n !== 'tone');
  const ramps = rampMembers();
  const out = [];
  const w = (s) => out.push(s);
  w('/* GENERATED by tools/build-marks-css.js — do not edit by hand.');
  w(' * The `marks:` register\'s rules. The header of the generator explains every choice');
  w(' * below; engineering/chart-styling.md §3 is the design.');
  w(' *');
  w(' * A finish is a block of --finish-* values on the section, the way `dark` is. The rules after the');
  w(' * three blocks read those values and name no finish, except the few that are one finish\'s alone. */');

  w('\n/* ══ THE FINISHES — the values each one sets ══ */');
  for (const name of ALL) w(`\n/* ${name} */\n${finishTokens(name)}`);

  const MARK_BODY = 'light-dark(var(--finish-mark-body-l), var(--finish-mark-body-d))';
  const MARK_TEXT = 'light-dark(var(--finish-mark-text-l), var(--finish-mark-text-d))';
  const paintShared = (paint, body, ink, edgeToken) => {
    if (paint === 'fill') return [`fill: ${body}`, `stroke: ${ink}`, `stroke-width: ${tEdge(edgeToken)}`, 'vector-effect: non-scaling-stroke'];
    return [`background: ${body}`, `box-shadow: inset 0 0 0 ${tEdge(edgeToken)} ${ink}`];
  };

  // ── THE SLOT — which category a mark is, said once per slot ──────────────
  // A mark's slot picks its own values from the finish's tokens and sets them as private properties on the mark; the
  // rules below then say which KIND of mark paints with them, and name no slot. The category ink is read at the mark,
  // so a member that re-points its inks below the section (the word cloud) keeps its own.
  const SLOT_SEL = `:is(${SLOTS.map((n) => `[data-hue="${n}"], [data-key-hue="${n}"]`).join(', ')})`;
  const HUE_SEL = `:is(${SLOTS.map((n) => `[data-hue="${n}"]`).join(', ')})`;
  w('\n/* ══ THE SLOT — the finish\'s values for the category a mark is. ══ */');
  for (const n of SLOTS) {
    w(rule(ALL, `:is([data-hue="${n}"], [data-key-hue="${n}"])`, [
      // Two plain colors per level, never one light-dark(): the HTML player's dual-mode pass hoists a light-dark() in a
      // custom property to :root, where a mark's own value beats it, so dark mode kept the light level. In a real
      // property (the fill, below) it is scoped to its own rule and survives.
      `--finish-mark-body-l: ${tmix(tv(T.hue(n)), T.body(n))}`,
      `--finish-mark-body-d: ${tmix(tv(T.hue(n)), T.bodyD(n))}`,
      `--finish-mark-text-l: ${tmix(tv(T.hue(n)), T.text(n))}`,
      `--finish-mark-text-d: ${tmix(tv(T.hue(n)), T.textD(n))}`,
      // The edge is the mark's own category ink under EVERY finish, tone included: tone has one hue for bodies, and the
      // edge is the one place the category survives (tone-is-the-third-finish.md).
      `--finish-mark-edge: ${inkOf(n)}`,
      `--finish-mark-layer: ${tv(T.layer(n))}`,
      `--finish-mark-layer-ink: ${tv(T.layerInk(n))}`,
    ], false));
  }

  // ── HUE — the body a finish is named for ────────────────────────────────
  w('\n/* ══ HUE — the body a finish is named for, under the mark\'s category-ink edge. ══ */');
  for (const paint of ['fill', 'bg']) {
    // A text-bearing mark is left to its own rule below, which waits on relative color.
    // Without this it would take the full body here, under ink solved for the shipped one.
    const notText = bears[paint].length ? `:not(${bears[paint].map(bearSel).join(', ')})` : '';
    const base = `${SLOT_SEL}[data-encodes="hue"][data-paint="${paint}"]${notText}`;
    const decls = paintShared(paint, MARK_BODY, 'var(--finish-mark-edge)', T.edge);
    w(rule(ALL, base + notLeft, decls));
    // A series stroke's dots and bands: tone leaves them whole, pigment and etch repaint them.
    w(rule(keepsHue, base + onlyLeft, decls));
  }

  w('\n/* HUE on a mark that CARRIES TEXT — the quieter level its text was measured against. */');
  for (const paint of ['fill', 'bg']) {
    if (!bears[paint].length) continue;
    const cls = `:is(${bears[paint].map(bearSel).join(', ')})`;
    // An HTML mark's own text was colored for the full-strength body (the journey actor
    // initial is white), so it takes the ink its own body clears. TEXT WAITS: no fixed ink
    // clears every theme (--text-body read 3.54:1 on concrete's status pill, --text-heading
    // 3.34:1 on an a11y heatmap step, measured in WebKit with relative color removed), so
    // on an engine that cannot pick the ink, a mark that carries text keeps its shipped
    // paint and ink, which each theme's gates already hold. Every other mark still moves.
    const sel = `${cls}${SLOT_SEL}[data-encodes="hue"][data-paint="${paint}"]`;
    const text = paint === 'bg' ? [`color: ${tv(T.ink)}`] : [];
    w(supports(rule(ALL, sel, [...paintShared(paint, MARK_TEXT, 'var(--finish-mark-edge)', T.edgeText), ...text])));
  }

  // ── STATUS — a meaning, so it keeps its own hue under every finish ───────
  // The prototype sent a status body to the one hue under tone and left the status on the
  // edge. On the render that made a gantt key of four identical swatches — done, live,
  // at-risk and blocked told apart by a 1px outline — which is the flattening defect
  // (finish-render-defects.md) in the status channel. A status is not one of the eight
  // categories tone collapses; it is a meaning the reader must decode. So under tone it
  // keeps its hue at tone's quiet level, and the finish still quiets it.
  w('\n/* STATUS — the member\'s own status channel; the hue is the meaning, so it stays. */');
  for (const s of STATUS_MARKS) {
    // A status that carries text takes the text level under every finish: a status hue can be far darker than a
    // category's (concrete's is near-black), and at pigment's 40% the text on it read 3.6:1 where tone's 30% held.
    const textLevel = s.bears || s.keysText;
    const body = textLevel ? tld(s.hue, T.statusText, T.statusTextD) : tld(s.hue, T.status, T.statusD);
    const kTok = s.bears ? T.edgeText : T.edge;
    const decls = paintShared(s.paint, body, s.ink, kTok);
    // THE SIGNAL RING SCALES WITH THE EDGE. An exception's ring replaces its edge, and "nothing else rings" only
    // reads if the ring is the heavier line: 1.3x the edge this finish gives the mark. Fixed at 1.3 hairlines it
    // sat under etch's 2-3x and tone's 2.5x edges, so a done bar outlined louder than an at-risk one (#2887).
    // Only an HTML box draws its ring from its own `--chart-ring` (an inset shadow); an SVG shape's ring is a sibling
    // element, set by name below.
    if (s.paint === 'bg') decls.push(`--chart-ring: ${tRing(kTok)}`);
    // A status pill's gradient is a background-IMAGE; the shorthand clears it.
    if (s.bears && s.paint === 'bg') {
      decls.push(`color: ${tv(T.ink)}`);
      // A state tile's INDEX numeral takes its ink from `--state-index-ink`, which the member fixes to
      // `--text-body` (state-chart.styles.css). That held on the shipped tint, and on a stated tile's
      // vivid hue, but the neutral tile's finish body is darker than its shipped tint: cuoio's numeral fell
      // from 5.95:1 to 4.31:1. Where the finish moves the body, the numeral picks its ink from it too.
      // A status tile's own name and badge read `--state-node-ink` (the status ink), solved for the shipped tint.
      if (s.nodeInk) decls.push(`--state-node-ink: ${tv(T.ink)}`);
      if (s.indexInk) decls.push(`--state-index-ink: ${tv(T.ink)}`);
    }
    // TEXT WAITS (above): a status that carries text, and a key that follows one, move only
    // where the engine can pick the text's ink; elsewhere both keep the shipped paint.
    w(textLevel ? supports(rule(ALL, s.sel, decls)) : rule(ALL, s.sel, decls));
  }

  // An SVG mark's ring is its own element beside the shape (`.chart-signal-ring`, a gantt bar's), so it cannot
  // inherit the shape's width and is reached by name, at the edge of the text-bearing mark it rings.
  // It waits behind the same guard as the bar's own wider edge (TEXT WAITS), so an engine that keeps the bar's
  // shipped edge keeps its shipped ring too.
  w(supports(rule(ALL, '.chart-signal-ring', [`--chart-ring: ${tRing(T.edgeText)}`])));
  // A milestone diamond and a key swatch carry no text, so their edge is the plain one and their ring follows it.
  w(supports(rule(ALL, ':is(polygon.chart-signal-ring, .gantt-legend .chart-signal-ring)', [`--chart-ring: ${tRing(T.edge)}`])));

  // ── TEXT ON A MARK — every caption, numeral and name printed on a finished body takes the finish's text ink ──
  // Each of these is a sibling of its mark in the SVG (a gantt caption beside its rect, a state caption and its
  // index numeral beside the tile's shape, a flowchart name beside its node), so it cannot inherit the mark's
  // ink and is reached by name. A caption beside its bar (`data-pos="after"`) sits on the canvas and keeps the
  // member's ink, and an author-colored caption (`data-text`) or an author-filled node (`data-fill`) keeps the
  // author's: both were chosen for exactly the tier a finish paints. A DEFERRED mark is hollow (an 18% wash or none),
  // so its caption or name sits on the slide and keeps the member's canvas ink, in every member alike.
  w(supports(rule(ALL, [
    '.gantt-bar-label[data-pos="inside"]:not([data-s="deferred"])',
    '.state-node-group:not([data-text]) > .state-label-t:not([data-s="deferred"])',
    '.state-index-t[data-s]',
    '.state-node-group:has(> .state-node-shape:not([data-s])) .state-index-t',
    '.fc-node-group:not([data-text]):not([data-fill]):not([data-s="deferred"]) > .fc-name',
  ].join(', '), [`fill: ${tv(T.ink)}`])));

  // ── RAMP — a magnitude, so the finish SCALES the band ────────────────────
  // --mix stays the datum; the floor and the span are the finish's. A ramp's own stroke
  // (the cell gap) is the member's, except under etch, where the line is the identity.
  w('\n/* RAMP — scaled into the finish\'s band; --mix stays the datum. */');
  const rampAt = (lo, k, base) => `color-mix(in oklab, ${ONE} calc(${tv(lo)} + var(--mix) * ${tv(k)}), ${base})`;
  const rampStroke = [`stroke: color-mix(in oklab, ${ONE_INK} 75%, transparent)`, `stroke-width: ${edge(1)}`, 'vector-effect: non-scaling-stroke'];
  for (const m of ramps) {
    // A ramp that prints its value takes the shorter text band (see `rampText`), as two whole colors inside
    // light-dark(), never a percentage. Pigment's text band IS the member's own span ([0, 1]: `--mix` as shipped), so it
    // changes nothing about the cells and emits nothing for them nor for their values: the theme-solved ink
    // (--heatmap-stepN-ink, ~100 hand-tuned declarations) keeps the cell it was solved for.
    for (const [classes, body, who] of [
      [m.plain, rampAt(T.rampLo, T.rampK, m.base), ALL],
      [m.text, `light-dark(${rampAt(T.rampTextLo, T.rampTextK, m.base)}, ${rampAt(T.rampTextDLo, T.rampTextDK, m.base)})`, MOVERS],
    ]) {
      if (!classes.length) continue;
      const cls = `:is(${classes.map((c) => `.${c}`).join(', ')})`;
      // A ramp that prints its value waits with its text (TEXT WAITS, above).
      const wrap = classes === m.text ? supports : (css) => css;
      w(wrap(rule(who, `${cls}[data-encodes="ramp"][data-paint="fill"]`, [`fill: ${body}`])));
      w(wrap(rule(who, `${cls}[data-encodes="ramp"][data-paint="bg"]`, [`background: ${body}`])));
      if (MOVERS.includes('etch')) w(wrap(rule('etch', `${cls}[data-encodes="ramp"][data-paint="fill"]`, rampStroke)));
    }
  }
  // A HEATMAP VALUE is printed on its cell, and the theme solves its ink per step against
  // the SHIPPED fill (--heatmap-stepN-ink). A finish changes the fill under the text, so no
  // fixed ink holds: measured, the strong ink fell to 3.34:1 on the a11y themes' top step,
  // where white clears 6.4:1, and on indaco the reverse. So the browser picks the ink from
  // the cell's own color: the value's fill is the step's body, taken to black above relative
  // luminance 0.1791 and white below it (inkOn). The step's --mix is the heatmap's own
  // (--heatmap-stepN, else the member's default, which marks-css.test.js pins to
  // heatmap.styles.css). It sits behind @supports with its cell's text band (TEXT WAITS):
  // a declaration carrying var() always parses, so a plain one would fail at computed-value
  // time on an engine without relative color. There, the cell and its value keep the shipped
  // fill and the ink the theme solved for it.
  const STEP_MIX = [18, 36.5, 55, 73.5, 92];
  STEP_MIX.forEach((pct, i) => {
    const at = (lo, k) => `color-mix(in oklab, ${ONE} calc(${tv(lo)} + var(--heatmap-step${i + 1}, ${pct}%) * ${tv(k)}), var(--heatmap-base))`;
    w(supports(rule(MOVERS, `.heatmap-value[data-step="${i + 1}"]`, [
      `fill: light-dark(${inkOn(at(T.rampTextLo, T.rampTextK))}, ${inkOn(at(T.rampTextDLo, T.rampTextDK))})`,
    ])));
  });

  // ── A TOWER SHARE FIGURE — printed on its share. Outside a finish the figure reads its ink off --mark-body
  // (tower.styles.css), solved for the shipped share; a finish paints the share's `fill` directly. A share CARRIES
  // TEXT (`bears: true`), so every finish paints it at the text-bearing tier, and the figure takes the one ink
  // curated for that tier.
  w('\n/* TOWER SHARE FIGURE — the ink curated for a text-bearing body. */');
  w(supports(rule(ALL, `.tower-share-value${HUE_SEL}`, [`--tower-ink: ${tv(T.ink)}`])));

  // ── A HUB-SPOKE ICON — a drawing on a disc, so it takes the ink its disc clears ──
  // The icon (`{icon=…}`, engineering/decisions/2026-09-29-inline-icons.md § 14) is a sibling
  // of its disc, not a child, so it cannot read the disc's paint. Under a finish the disc takes the bodies
  // above, and measured, no fixed ink held (a pigment group disc 2.27:1 on onyx dark, an etch status disc
  // 1.62:1). So under etch and tone the icon picks black or white from the SAME body its disc gets (the
  // finish tokens the group rule and the status rule read, so the two cannot drift), and waits on relative
  // color like every text ink here. Pigment's disc is a curated solid, so its icon takes the curated ink.
  w('\n/* HUB-SPOKE ICON — the ink its disc\'s finish body clears. */');
  w(supports(rule('pigment', `.hub-spoke-icon${HUE_SEL}`, [`--hs-icon-ink: ${tv(T.ink)}`])));
  // The disc's body is the mark's own (THE SLOT), and the icon is a mark of the same slot: one rule for every slot.
  w(supports(rule(MOVERS, `.hub-spoke-icon${HUE_SEL}`, [`--hs-icon-ink: ${`light-dark(${inkOn('var(--finish-mark-body-l)')}, ${inkOn('var(--finish-mark-body-d)')})`}`])));
  const hsStatus = STATUS_MARKS.find((x) => x.sel.includes('.hub-spoke-node'));
  w(supports(rule('pigment', '.hub-spoke-icon[data-s]', [`--hs-icon-ink: ${tv(T.ink)}`])));
  w(supports(rule(MOVERS, '.hub-spoke-icon[data-s]', [`--hs-icon-ink: light-dark(${inkOn(tmix(hsStatus.hue, T.status))}, ${inkOn(tmix(hsStatus.hue, T.statusD))})`])));

  // ── LAYERED — translucent and composited, so a FLAT alpha ────────────────
  // A gradient here reads as a fourth color where two polygons cross.
  w('\n/* LAYERED — a flat alpha of the series body; the edge carries the series. */');
  {
    const base = `${HUE_SEL}[data-encodes="layered"][data-paint="fill"]`;
    const decls = [
      `fill: ${MARK_BODY}`, 'fill-opacity: var(--finish-mark-layer)', 'stroke: var(--finish-mark-layer-ink)',
      `stroke-width: ${tEdge(T.edge)}`, 'vector-effect: non-scaling-stroke',
    ];
    w(rule(ALL, base + notLeft, decls));
    w(rule(keepsHue, base + onlyLeft, decls));
  }
  // The radar's scale ticks sit in the CENTER, where every series polygon overlaps, and they are small
  // muted text (`--text-muted`, 9px). The member's own fill is a gradient that is nearly clear there
  // (stop-opacity 0.10 at the center); a finish's fill is FLAT, so the overlap builds up and the tick
  // fell from 5.13:1 to 3.20:1 (pigment), 4.18:1 (etch) and 1.60:1 (tone) on indaco. Lowering the alpha
  // enough to hold the tick would erase the polygons, so the tick takes the strongest ink instead.
  // tools/chart-finish-reach.mjs RUNS measures it on every theme and mode.
  w('\n/* The radar scale ticks sit on the overlap of every series, so they take the heading ink. */');
  w(rule(ALL, '.radar-tick', ['fill: var(--text-heading)']));

  // ════════════════════════════════════════════════════════════════════════
  // What follows is ONE finish's alone: a treatment the others do not have, so it cannot be a value.
  // ════════════════════════════════════════════════════════════════════════
  for (const name of ALL) {
    const f = F[name];
    const tone = name === 'tone';
    BASE = BODY_BASE[name];
    w(`\n/* ══ ${name.toUpperCase()} ONLY ${'═'.repeat(66 - name.length)} */`);

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
      // A group disc takes tone's body, and on dark it reaches the dimmed hub's own lightness (tone's top step sat
      // OKLab 0.08 from the hub on mustard-dark, under the 0.15 floor the dimmed hub holds with no finish), so the hub
      // goes back to the full heading ink it wears on light. Only a chart that draws a GROUP needs it: a neutral
      // satellite is held under the hub by its own mix, so a neutral or status-only chart keeps the dimmed hub.
      // Pigment's hub is the first-hue solid (REGIONS) and groups are washes there; etch's body (40%) never comes near the hub.
      // The hub is the deepest mark on the slide: the one hue at full strength (its name is the page ground, from the member).
      w(rule(name, '.hub-spoke-hub', [`fill: ${ONE}`, `stroke: ${ONE}`]));
      // The hub's name and value sit on that solid, so they take the solid's own ink (white on a light-face palette solid, 4.6:1
      // or better on a dark-face one); the member's page-ground ink measured 3.69:1 on indaco dark.
      w(rule(name, '.hub-spoke-svg:not(:has(:is(.hub-spoke-node, .hub-spoke-leaf)[data-hue])) :is(.hub-spoke-hub-name, .hub-spoke-hub-value)', ['fill: var(--chart-on-mark)']));
      // A chart that draws GROUPS keeps the heading-ink hub: a group disc takes tone's deep step, which reaches the one hue's own lightness.
      w(rule(name, '.hub-spoke-svg:has(:is(.hub-spoke-node, .hub-spoke-leaf)[data-hue]) .hub-spoke-hub', ['fill: var(--text-heading)', 'stroke: var(--text-heading)']));
      // A neutral satellite (no status, no hue) is a pale step with the one ink edge, like every etch body.
      w(rule(name, ':is(.hub-spoke-node, .hub-spoke-leaf):not([data-s]):not([data-hue])', [`fill: ${mix(ONE, `${TONE[5]}%`)}`, `stroke: ${ONE_INK}`]));
      // ONE INK FOR EVERY EDGE. With one ladder the bodies already tell the categories apart by depth, so the outline no
      // longer has to carry the category's hue: every mark wears the one tone ink, and a tone chart is one hue plus status.
      w(rule(name, SLOT_SEL, ['--finish-mark-edge: var(--chart-cat-1-ink)'], false));
      // ONE LADDER. A text-bearing mark takes the same eight steps as every other body, so category N is the same shade on
      // a tower, a matrix grid and a pie. Its text picks black or white from its OWN body (inkOn clears 4.58:1 on any
      // body), instead of one fixed ink curated for a pale ladder.
      const pickInk = `light-dark(${inkOn('var(--finish-mark-text-l)')}, ${inkOn('var(--finish-mark-text-d)')})`;
      if (bears.bg.length) w(supports(rule(name, `:is(${bears.bg.map(bearSel).join(', ')})${SLOT_SEL}[data-encodes="hue"][data-paint="bg"]`, [`color: ${pickInk}`])));
      // A real property, not the member's `--tower-ink` custom property: the player's dual-mode pass hoists a light-dark() in a custom property to :root.
      w(supports(rule(name, `.tower-share-value${HUE_SEL}`, [`fill: ${pickInk}`])));
      // A MATRIX GRID under tone. Each row is a category and the member colors the row's label and its empty cells'
      // outlines from the row's own hue (`--row-hue`, `--row-ink`), so a tone grid showed one hue in its filled cells and six
      // in its labels and outlines. The row's hue is re-pointed to the one hue, as a kanban column's and a roadmap phase's
      // are; the filled cells keep the one ladder (a row's depth is its category).
      w(rule(name, '.matrix-grid-figure tbody tr', [`--row-hue: ${ONE}`, `--row-ink: ${ONE_INK}`]));
      // A waterfall's Plan / Actual anchors are neutral columns; under tone they are a solid step of the one hue, like tone's other bars.
      w(rule(name, '.waterfall-bar[data-s="total"]', [`fill: ${mix(ONE, `${TONE[1]}%`)}`, `stroke: ${ONE_INK}`]));
      // A tone grid's filled cells read like the quadrant's zones: one flat pale tint of the tone hue, the heading ink on it.
      // The row label and the cell's own text carry the meaning, so depth no longer has to say which row a cell is in.
      w(supports(rule(name, `.cell-filled${SLOT_SEL}[data-encodes="hue"][data-paint="bg"]`, [
        `background-color: color-mix(in oklab, ${ONE} ${TONE[5]}%, var(--bg))`,
        'color: var(--text-heading)',
      ])));
      // Tone dashes a layered series from the fifth, so overlapping outlines stay apart.
      for (const n of SLOTS.filter((x) => x > 4)) w(rule(name, `[data-hue="${n}"][data-encodes="layered"][data-paint="fill"]${notLeft}`, ['stroke-dasharray: 5 3']));
      // A SERIES STROKE under tone — line and ep-curve. The stroke is the whole mark, so a series cannot take a body step.
      // It takes a step of the one ink (the steps a layered outline uses, deep enough to clear 3:1 as a line), and is told
      // apart from its neighbors by a dash pattern as well as depth, with its dots and its end label in the same color.
      const STROKE_STEP = [100, 88, 78, 68];
      const STROKE_DASH = ['none', '7 3.5', '1.8 3.2', '8 3 1.8 3'];
      for (const n of SLOTS) {
        const i = n - 1;
        const ink = `color-mix(in oklab, ${ONE_INK} ${STROKE_STEP[i % 4]}%, var(--bg))`;
        w(supports(rule(name, `:is(.line-path, .ep-path)[data-hue="${n}"]`, [`stroke: ${ink}`, `stroke-dasharray: ${STROKE_DASH[i % 4]}`, ...(i % 4 === 2 ? ['stroke-width: 2.3'] : [])])));
        w(supports(rule(name, `:is(.line-dot, .ep-dot)[data-hue="${n}"]`, [`fill: ${ink}`])));
      }
      w(rule(name, ':is(.cart-series, .line-name, .ep-name)[data-hue]', [`fill: ${ONE_INK}`]));
    }

    // ── WORD CLOUD and SLOPE under etch and tone — a word's or a line's color is arbitrary or a status, and both finishes
    // read it as a second hue, so the words step by weight and the lines are the one hue ───────────────────────────
    if (tone || name === 'etch') {
    // A WORD CLOUD under etch and tone. A word's color is arbitrary by default (the categorical inks in rank order, so "pricing" is
    // magenta for no data reason), and its size already carries the weight. Tone makes color say the same thing a second,
    // quiet way, in the tone hue like every other tone chart: the loudest word wears the one tone ink and each tier steps
    // toward the theme's muted ink, which is the quietest ink the palette guarantees readable. (`spectrum`'s own stops are
    // not used: their deepest step is near-black on a light slide, which no other tone chart has.)
    // The tone ink is a 3:1 GRAPHICAL ink, and on a dark slide it measures about 3.7:1 as text, under the 4.5:1 a word owes. So
    // a word's loudest step takes the ink as is on light and 65% of it toward the heading ink on dark (the mix a matrix
    // grid's filled-cell text already takes), and each quieter tier mixes in 25% more of the muted ink.
    const wordInk = `light-dark(${ONE_INK}, color-mix(in oklab, ${ONE_INK} 65%, var(--text-heading)))`;
    for (const [tier, pct] of [[5, 100], [4, 75], [3, 50], [2, 25]]) {
      w(rule(name, `.wc-word[data-tier="${tier}"]`, [`fill: ${pct === 100 ? wordInk : `color-mix(in oklab, ${wordInk} ${pct}%, var(--text-muted))`}`]));
    }
    w(rule(name, '.wc-word[data-tier="1"]', ['fill: var(--text-muted)']));
    // A slope's lines are one quiet ink by default; a marked line (the signal) is the one ink at full strength, its
    // direction carried by the geometry. The quiet ink is a pale step of the one hue, not grey.
    w(supports(rule(name, '.slope-svg:not(.slope-signal) .slope-line:not([data-s]), .slope-svg.slope-signal .slope-line[data-dir="flat"]:not([data-s])', [`stroke: color-mix(in oklab, ${ONE_INK} 52%, var(--bg))`])));
    w(supports(rule(name, '.slope-svg .slope-line[data-s]', [`stroke: ${ONE_INK}`, 'stroke-width: 1.9'])));
    w(supports(rule(name, '.slope-svg.slope-slopegraph .slope-dot[data-s]', [`fill: ${ONE_INK}`])));
    w(supports(rule(name, '.slope-svg.slope-slopegraph:not(.slope-signal) .slope-dot:not([data-s]), .slope-svg.slope-slopegraph.slope-signal .slope-dot[data-dir="flat"]:not([data-s])', [`fill: color-mix(in oklab, ${ONE_INK} 62%, var(--bg))`])));
    }

    // ── A SERIES STROKE — line and ep-curve ─────────────────────────────────────────────────────────
    // The stroke IS the mark (paint `none`: no body, so all of it is edge). ETCH draws the line heavier,
    // because under etch the line is the identity and a line chart has no outline to make it one. TONE draws
    // the series in steps of its one ink with a dash per series (below, in tone's own block).
    if (name === 'etch') {
      w(rule(name, ':is(.line-path, .ep-path)', ['stroke-width: 2.6']));
    }
    if (name === 'etch') {
      // A bullet's measure is the datum; its range bands are a 36/22/10/4% grey wash. At etch's 30% body the bar was paler
      // than the band it sits on, so the row read upside down. The measure takes the category ink at half strength.
      w(rule(name, '.bullet-measure[data-hue]', ['fill: light-dark(color-mix(in oklab, var(--finish-mark-edge) 52%, var(--bg)), color-mix(in oklab, var(--finish-mark-edge) 60%, var(--bg)))']));
    }

    {
    // A node with no category and no status is a flowchart's or state chart's NEUTRAL tile. Every finish draws it in the first hue: a grey
    // or slate neutral read as a second color beside the other marks, so the tile takes it; a status node and a category node (the `:not`s) keep theirs. Set on the member's own hue property rather
    // than re-pointing `--chart-neutral-hue`, which test/helpers/chart-color.js reads from dist as the theme's grey.
    const bare = ':not([data-s]):not([data-slot])';
    w(supports(rule(name, `:is(.fc-node, .fc-node-group)${bare}`, [`--fc-hue: ${ONE}`])));
    w(supports(rule(name, `:is(.state-node, .state-node-shape, .state-label-t, .state-node-row, .gantt-bar, .gantt-milestone, .gantt-bar-label, .gantt-legend-swatch)${bare}`, [`--fill-hue: ${ONE}`])));
    }
    if (name === 'etch') {
      // Etch's Plan / Actual anchors: the same pale wash and edge every other etch body wears, in the first hue.
      w(rule(name, '.waterfall-bar[data-s="total"]', [`fill: ${pair(ONE, f.body)}`, `stroke: ${inkOf(1)}`]));
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
      // Etch draws every cell's edge in its band's ink, so the critical band's ring and its key disc's ring scale with
      // that edge, as a status mark's ring does (STATUS above): the exception stays the heaviest line. Tone's cell
      // line is a canvas seam (`--bg`), not an ink edge, so its ring needs nothing.
      if (name === 'etch') w(rule(name, ':is(.risk-band-ring, .risk-key-marker[data-band="critical"])', [`--chart-ring: ${ring(f.edge)}`]));
    }

    // ── KANBAN — a board of neutral tiles gets the finish's first hue ──────────────────────────────────────────────
    // The shipped board is grey cards under a hairline (category no longer paints the surface; status does), which left it
    // the one chart no finish reached. A card with no status takes the finish's wash and a first-hue accent edge, and each
    // lane's title rule takes the first hue; a status card and the done lane keep their status color.
    {
      const wash = name === 'pigment' ? 12 : name === 'tone' ? 12 : null;
      const tint = wash !== null ? `color-mix(in oklab, ${ONE} ${wash}%, var(--bg))` : `light-dark(color-mix(in oklab, ${ONE} ${f.backdrop[0]}%, var(--bg)), color-mix(in oklab, ${ONE} ${f.backdrop[1]}%, var(--bg)))`;
      // Pigment is the default finish and its card keeps the shipped surface: a tint under the inline code a card carries
      // measured 4.19:1 on carbone (palette-sweep), so pigment takes the accent edge and the lane rule only.
      const cardDecls = [`box-shadow: inset ${name === 'pigment' ? 5 : name === 'etch' ? 4 : 3}px 0 0 ${name === 'pigment' ? ONE : ONE_INK}`];
      if (name !== 'pigment') cardDecls.unshift(`background: ${tint}`);
      w(supports(rule(name, '.kanban-card:not([data-s])', cardDecls)));
      w(supports(rule(name, '.kanban-column:not([data-done]) .kanban-column-header', [`border-bottom-color: ${ONE}`])));
    }

    // ── A NEUTRAL hub-spoke node — no status and no hue ─────────────────────
    // Its shipped body is a flat neutral (`--hs-neutral-body`, a strong mix of the body ink), which is already
    // pigment's solid look and tone's one ink, so those two keep it. Etch is the pale one with the 2px edge:
    // left alone, a whole etched chart read as pigment with two recolored nodes.
    if (name === 'etch') {
      const body = pair(ONE, f.backdrop);
      w(rule(name, ':is(.hub-spoke-node, .hub-spoke-leaf):not([data-s]):not([data-hue])', [
        `fill: ${body}`, `stroke: ${ONE_INK}`, `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke',
      ]));
      w(supports(rule(name, '.hub-spoke-icon:not([data-s]):not([data-hue])', [
        `--hs-icon-ink: ${ld(inkOn(mix('var(--text-body)', `${f.backdrop[0]}%`)), inkOn(mix('var(--text-body)', `${f.backdrop[1]}%`)))}`,
      ])));
    }
    // The HUB is the one mark with no category and no status, and the member makes it the page's heading ink, solid. Under
    // etch every other body retreats to a whisper, so the hub was the loudest mark on the slide, louder than the blocked and
    // at-risk discs it exists to be read beside. It takes the neutral satellite's whisper and 2x edge, its name in the heading
    // ink. Tone keeps the member's solid hub: tone's claim is depth, and the largest mark is its deepest step.
    if (name === 'etch') {
      const body = pair(ONE, f.backdrop);
      w(rule(name, '.hub-spoke-hub', [`fill: ${body}`, `stroke: ${ONE_INK}`, `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke']));
      w(rule(name, ':is(.hub-spoke-hub-name, .hub-spoke-hub-value)', ['fill: var(--text-heading)']));
    }
    if (name === 'pigment') {
      // Pigment paints the neutral node with the neutral SOLID, like every other unstated mark in the family.
      w(rule(name, ':is(.hub-spoke-node, .hub-spoke-leaf):not([data-s]):not([data-hue])', [
        `fill: ${ONE}`, `stroke: ${ONE_INK}`, `stroke-width: ${edge(f.edge)}`, 'vector-effect: non-scaling-stroke',
      ]));
      w(supports(rule(name, '.hub-spoke-icon:not([data-s]):not([data-hue])', [`--hs-icon-ink: ${textInk(name)}`])));
    }

    // ── A JOURNEY STAGE BAR — one constant ground (`encodes: none`), the heaviest mark on the slide ────
    // Pigment paints it with the neutral solid and the solid ink; tone keeps the shipped slate; etch is the pale one
    // with the 2px edge, in the stage's own
    // accent. The stage name's ink is `--journey-stage-fg`, solved against the shipped ground and a paler one holds.
    if (name === 'pigment') {
      w(supports(rule(name, ':is(.journey-stage, .journey-vstage-name)', [
        `background: ${ONE}`, `color: ${textInk(name)}`,
      ])));
    }
    if (name === 'etch') {
      w(rule(name, ':is(.journey-stage, .journey-vstage-name)', [
        `background: ${pair(ONE, f.backdrop)}`,
        `box-shadow: inset 0 0 0 ${edge(f.edge)} ${ONE_INK}`,
        '--section-accent: var(--chart-cat-1-ink)',
      ]));
    }
    if (tone) {
      // Tone's stage bar is a pale step of the one hue with the one ink on its top rule: the shipped slate was a second color.
      w(rule(name, ':is(.journey-stage, .journey-vstage-name)', [`background: ${mix(ONE, `${TONE[5]}%`)}`, '--section-accent: var(--chart-cat-1-ink)']));
    }

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
      w(rule(name, '.risk-cell[data-band="critical"]', ['fill: color-mix(in oklab, var(--fail-vivid-mark) 82%, var(--on-mark-shade, black))', 'stroke: var(--bg)', 'stroke-width: 1.2']));
      // A waterfall's Plan and Actual are totals, not a direction: the neutral solid, the bar's full strength.
      w(rule(name, '.waterfall-bar[data-s="total"]', [`fill: ${ONE}`, `stroke: ${ONE}`]));
      // The hub-spoke HUB is the one mark with no category and no status: the neutral solid, its name in the solid ink.
      w(rule(name, '.hub-spoke-hub', [`fill: ${ONE}`, `stroke: ${ONE}`]));
      w(rule(name, ':is(.hub-spoke-hub-name, .hub-spoke-hub-value)', ['fill: var(--chart-on-mark)']));
      // A roadmap workstream cell is a row header: neutral ground, its phase kept on the left rule.
      // It carries the workstream's name, so it moves with the other text-bearing marks (TEXT WAITS).
      w(supports(rule(name, '.roadmap td:first-child', ['background: var(--bg-alt)'])));
      // A journey stage's top rule was a category color per stage, decoration that read as data.
      w(rule(name, '.journey-stage', [`--section-accent: ${ONE}`]));
      // Under pigment a quadrant bubble is its DEEP category fill, so a value printed inside it takes the one ink of
      // every chart mark, as a bar's label does; heading ink there was dark on a deep fill on the light face. A value
      // printed above a small bubble sits on the canvas and keeps the heading ink, and etch and tone keep it too: their
      // bubble is a pale wash.
      w(rule(name, '.quadrant-bubble-value[data-pos="inside"]', ['fill: var(--chart-on-mark)']));
      // A radar's compass quarters (`radar quadrant`) are GROUND under the series, so each wears a pale tint of its
      // category, the way a status ground is a tint of its status: the shading the variant exists for, with the
      // polygon and the scale numbers readable on it. As a text-bearing mark they took the deep category fill, which
      // drowned the polygon of the same hue and put dark scale numbers on dark blue.
      for (const n of SLOTS) {
        // A sector carries its quarter's name, so it moves with the other text-bearing marks (TEXT WAITS).
        w(supports(rule(name, `.radar-sector[data-hue="${n}"]`, [`fill: light-dark(color-mix(in oklab, var(--chart-cat-${n}-hue) 12%, var(--bg)), color-mix(in oklab, var(--chart-cat-${n}-hue) 22%, var(--bg)))`, 'fill-opacity: 1'])));
      }
      // A free-standing area under a line is a quantity, not the line: held back on BOTH canvases. The member sets
      // full strength on dark for its old darkened wash; at the deep solid that covered the line, its dots and the
      // grid. A stacked band (`.line-band`) is the data itself and keeps its full strength.
      w(rule(name, '.line-area', ['fill-opacity: 0.62']));
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
      console.error('[build-marks-css] STALE — run `node tools/build-marks-css.js` and commit ' + path.relative(ROOT, OUT_FILE));
      process.exit(1);
    }
    if (!silent) console.log('[build-marks-css] up to date.');
    return;
  }
  fs.writeFileSync(OUT_FILE, css);
  if (!silent) console.log(`[build-marks-css] wrote ${path.relative(ROOT, OUT_FILE)} (${(css.match(/\{\n/g) || []).length} rules)`);
}

if (require.main === module) main();

module.exports = { build, F, TONE, TONE_TEXT, TONE_TEXT_D, STATUS_MARKS, KEY_FOLLOWS, STROKE_MEMBERS };
