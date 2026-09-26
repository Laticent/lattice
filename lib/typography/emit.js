/**
 * Typography token emitter — turns the lib/typography/scale.js manifest into the
 * `--fs-*` CSS blocks bundled into dist/lattice.css by tools/build-css.js.
 *
 * One source of truth (the manifest), one emitter (here): a role's size lives in
 * exactly one place, so the landscape/square/portrait scales can never drift apart
 * by hand-edit. See engineering/decisions/2026-06-20-typography-categories.md.
 *
 * Output shape (cascade-ordered):
 *   :root, section                       { --fs-*: <landscape calc>; --pill-fs … }
 *   section[data-orientation="square"]   { --fs-*: <square calc> }
 *   section[data-orientation="portrait"] { --fs-*: <portrait calc> }
 *
 * Every token is `coefficient × var(--_sec-1cqi, 1cqi)` — width-relative, routed
 * through the section's runtime-stamped 1cqi (the SAME mechanism the hand-written
 * tokens used). Roles outside NO_FS_SCALE also multiply by `var(--fs-scale)` (the
 * per-deck/per-slide size knob). The retired `× var(--canvas-scale)` term is gone:
 * orientation now changes the COEFFICIENT, not a uniform multiplier. Landscape
 * coefficients are unchanged and landscape sections stay unstamped, so every
 * landscape/HD/4k export is byte-identical.
 */

const { ROLES, SCALES, CATEGORY_SELECTOR, NO_FS_SCALE } = require('./scale');

const CQI = 'var(--_sec-1cqi, 1cqi)';

// One `--fs-<role>: calc(...)` declaration. h1/h2 (NO_FS_SCALE) skip --fs-scale so
// the dominant title tier holds its designed size while readable tiers grow (§7).
function declFor(role, coeff) {
  // The meta role also takes the venue's label lift (`--venue-meta-lift`, 1 unless a
  // `venue-*` class sets it — typography.md §7 "Venue").
  const lift = role === 'meta' ? ' * var(--venue-meta-lift, 1)' : '';
  const scaled = NO_FS_SCALE.has(role) ? '' : ` * var(--fs-scale)${lift}`;
  return `  --fs-${role}: calc(${coeff} * ${CQI}${scaled});`;
}

// The token block for one category. `withAliases` is true only for the landscape
// default block, which also defines the role-aliased chrome tokens (e.g. --pill-fs
// = the meta role) so they re-resolve per section: when section[data-orientation]
// overrides --fs-meta, an alias declared on `:root, section` follows because it is
// substituted against the section's own --fs-meta.
function blockFor(category, selector, { withAliases = false } = {}) {
  const scale = SCALES[category];
  const lines = ROLES.map((role) => declFor(role, scale[role]));
  if (withAliases) {
    // Pill chrome shares the meta role. Kept as an alias (not a raw value) so a
    // theme/component can retarget --pill-fs without re-deriving the size.
    lines.push('  --pill-fs: var(--fs-meta);');
  }
  return `${selector} {\n${lines.join('\n')}\n}`;
}

/**
 * The full generated typography CSS (no trailing newline). Consumed by
 * tools/build-css.js, which frames it with a `/* === … === *\/` banner.
 */
function typographyTokensCss() {
  return [
    '/* GENERATED from lib/typography/scale.js by lib/typography/emit.js — do not',
    ' * hand-edit. Curated landscape/square/portrait type scales; orientation picks',
    ' * the coefficient (no --canvas-scale type multiplier). Landscape is the default',
    ' * (unstamped → byte-identical). See',
    ' * engineering/decisions/2026-06-20-typography-categories.md. */',
    blockFor('landscape', CATEGORY_SELECTOR.landscape, { withAliases: true }),
    blockFor('square', CATEGORY_SELECTOR.square),
    blockFor('portrait', CATEGORY_SELECTOR.portrait),
  ].join('\n');
}

module.exports = { typographyTokensCss };
