/**
 * chart-roles.js — the chart TEXT LADDER: every piece of text a chart prints plays one ROLE, and each role has one
 * size on a page read on a phone.
 *
 * WHY. A chart set every label in its own drawing units, and the drawing was scaled to its box, so on a 1080-wide
 * page shown ~323pt wide on a phone (the owner's iPhone, 2026-11-10) ticks printed at 5-6pt, category names and
 * values at 6-7pt, and only the pie key reached 12.6pt. The owner chose a curated ladder by role (a bake-off of three
 * steps, then the middle one with its floor raised to 11pt), and a role audit of every text in the 28 kinds
 * (engineering/decisions/2026-11-03-responsive-tables.md § 32).
 *
 * THE ROLES, in pt on the phone:
 *   key       13  a key entry, and its value ("Deck production 46%")
 *   heading   13  a structural heading inside a chart (a kanban column, a journey stage)
 *   direct    12  a NAME on the drawing: a series, a point, a layer, a node, a bar
 *   value     12  a number that is the data ("+1.4M", a heatmap cell)
 *   region    12  the name of an area of the plot (a quadrant zone, a radar sector, a flow group)
 *   callout   12  an author's annotation
 *   category  11  a category-axis name, or a row or column of a grid ("FY24", "Jan 2026")
 *   tick      11  a number on a value scale ("10M")
 *   title     11  an axis title ("LIKELIHOOD")
 *   note      11  secondary text tied to a mark ("vs 5M", "$40M xs $50M", an edge's label)
 *   status    11  a status word or pill ("at risk", "Q2 2026")
 *   glyph     11  a number or initial inside a marker
 * The HTML kinds' running items keep the deck's body size (`--fs-body`), and the word cloud sizes its words by weight
 * (word-cloud.transform.js `WC_STEPS_PT`); both are named in the role audit as their own cases.
 *
 * HOW. A chart on a 1080-wide page (portrait, square, story, mobile) draws once to learn how many page px one of its
 * drawing units prints at, then again with every role's size converted to units at that scale
 * (chart-family.dispatch.js `run`). While it draws, `roleU(role, fallback)` hands the kernels the role's size in
 * units; on every other page it hands back `fallback`, so a landscape slide and a pane draw exactly as before. The
 * same sizes reach the stylesheet as `--chart-fs-<role>` on each drawing's `<svg>`, so the paint and the layout agree.
 * The HTML kinds read the same ladder as cqi tokens (chart-family.styles.css § THE PHONE LADDER, `--chart-role-*`), kept equal to
 * ROLE_PT by test/unit/plugins/chart-roles.test.js.
 */

const { formBox } = require('./chart-form-state');

// The width a 1080-wide page is drawn at on the owner's phone, in pt (measured off the owner's iPhone screenshots in
// Acrobat, 2026-11-10: the page 760px of a 923px screenshot of a 393pt screen).
const PHONE_PT = 323;
const PAGE_PX = 1080;
const ptPx = (pt) => (pt * PAGE_PX) / PHONE_PT;
/** A phone pt as cqi of a 1080-wide slide (1pt = 0.31cqi). */
const ptCqi = (pt) => +((ptPx(pt) / PAGE_PX) * 100).toFixed(3);

// THE LADDER, in pt on the phone (the owner's pick, 2026-11-10).
const ROLE_PT = Object.freeze({
  key: 13, heading: 13, direct: 12, value: 12, region: 12, callout: 12,
  category: 11, tick: 11, title: 11, note: 11, status: 11, glyph: 11,
});
const ROLES = Object.freeze(Object.keys(ROLE_PT));

/** The role sizes in page px on a 1080-wide page. */
function stepPx() {
  return Object.fromEntries(ROLES.map((r) => [r, +ptPx(ROLE_PT[r]).toFixed(2)]));
}

// The draw in progress: role sizes in page px and the page px one drawing unit prints at. Rendering is synchronous,
// so `withRoles` sets this for exactly one chart's drawing and nothing else reads it in between.
let active = null;

/**
 * The size of `role` in the current drawing's units, or `fallback` when no ladder is active (or the role is unknown).
 * @param {string} role
 * @param {number} fallback — the kind's own size for this text, in its units
 */
function roleU(role, fallback) {
  if (!active || !(active.unitPx > 0) || !(active.px[role] > 0)) return fallback;
  return +(active.px[role] / active.unitPx).toFixed(3);
}

/**
 * How much larger `role` prints than the kind's own `base` size: 1 when no ladder is active. For a width a kind
 * tuned to its label size (a label lane, a name column): it grows with the text it holds, so a word that fit today
 * still fits on the ladder instead of breaking mid-word.
 */
function roleScale(role, base) {
  return roleU(role, base) / base;
}

/** Whether a ladder is active for the drawing in progress. */
const rolesActive = () => !!active;

/** Run `fn` with the ladder active at `unitPx` page px per drawing unit, in a chart box `boxPx` (page px). */
function withRoles(px, unitPx, fn, boxPx = null) {
  const prev = active;
  active = { px, unitPx, boxPx };
  try { return fn(); } finally { active = prev; }
}

/** A size given in phone pt, in the current drawing's units; `fallback` when no ladder is active. For a kind whose
 *  sizes are not one role (the word cloud's steps). */
function ptU(pt, fallback) {
  return active && active.unitPx > 0 ? +(ptPx(pt) / active.unitPx).toFixed(3) : fallback;
}

/** The chart box in the current drawing's units, or null when no ladder is active. */
function rolesBoxU() {
  // On the chart form kernel the box is the canvas the kernel handed the kind (chart-form-state.js), which the dispatch
  // shrinks when a kind's notes would outgrow it.
  const form = formBox();
  if (active && form) return form;
  return active && active.boxPx && active.unitPx > 0
    ? { w: active.boxPx.w / active.unitPx, h: active.boxPx.h / active.unitPx } : null;
}

// The custom property each role reaches the stylesheet by, spelled out so the ownership gate's runtime-written
// scan (tools/check-ownership.js `runtimeWrittenTokens`) sees every one this module writes.
const ROLE_TOKENS = Object.freeze([
  ['--chart-fs-key', 'key'], ['--chart-fs-heading', 'heading'], ['--chart-fs-direct', 'direct'],
  ['--chart-fs-value', 'value'], ['--chart-fs-region', 'region'], ['--chart-fs-callout', 'callout'],
  ['--chart-fs-category', 'category'], ['--chart-fs-tick', 'tick'], ['--chart-fs-title', 'title'],
  ['--chart-fs-note', 'note'], ['--chart-fs-status', 'status'], ['--chart-fs-glyph', 'glyph'],
]);

/** The `style` declarations that hand every role's size to the stylesheet, in units at `unitPx`. */
function roleStyle(px, unitPx) {
  return ROLE_TOKENS.map(([token, r]) => `${token}:${+(px[r] / unitPx).toFixed(3)}px`).join(';');
}

/**
 * Put the role sizes on every `<svg>` a chart drew, so `font-size: var(--chart-fs-<role>, <today>)` in the
 * stylesheet paints what the kernel laid out.
 */
function stampRoles(html, px, unitPx) {
  const decl = roleStyle(px, unitPx);
  // `data-chart-roles` marks a drawing that carries the sizes: the stylesheet sizes text by role only inside one, so a
  // drawing the ladder could not measure keeps its own sizes rather than an unset variable.
  // A scan, not a regex: the kernels' markup is ours, and a linear walk needs no complexity verdict.
  const src = String(html);
  let out = '';
  let at = 0;
  for (let i = src.indexOf('<svg', at); i >= 0; i = src.indexOf('<svg', at)) {
    const next = src[i + 4];
    const end = src.indexOf('>', i);
    if (end < 0) break;
    if (next !== ' ' && next !== '>' && next !== '\n' && next !== '\t') { out += src.slice(at, i + 4); at = i + 4; continue; }
    const attrs = src.slice(i + 4, end);
    const s = attrs.indexOf(' style="');
    out += src.slice(at, i) + (s >= 0
      ? `<svg data-chart-roles${attrs.slice(0, s)} style="${decl};${attrs.slice(s + 8)}>`
      : `<svg data-chart-roles${attrs} style="${decl}">`);
    at = end + 1;
  }
  return out + src.slice(at);
}

module.exports = { PHONE_PT, PAGE_PX, ROLES, ROLE_PT, ROLE_TOKENS, ptPx, ptCqi, stepPx, roleU, roleScale, ptU, rolesBoxU, rolesActive, withRoles, roleStyle, stampRoles };
