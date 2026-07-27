/**
 * Deck authoring linter — Node surface. The machine-checkable form of the
 * markdown footgun rules CLAUDE.md and the component docs warn about in prose.
 *
 * The actual checks live in the pure, browser-safe ./lint-core.js (the single
 * source, also re-exported by lib/components/index.js and run by the Drawing
 * Board's Architect panel). This module is the NODE binding: it builds the
 * name/modifier VOCABULARY from the live manifests, then delegates to
 * lintTextWith. tools/lint-deck.js is the CLI wrapper.
 *
 * Rules (severity): see lint-core.js. `lintText(source)` returns findings:
 *   { slide, rule, severity, classToken, line, message, fix }
 */

const {
  loadAll,
  effectiveVariants,
  UNIVERSAL_GROUPS,
  UNIVERSAL_VARIANTS,
  SEMI_UNIVERSAL_VARIANTS,
  EXCLUSIVE_AXES,
  STAMP_STYLES,
  STAMP_STYLE_NAMES,
  STAMP_STYLE_TOKENS,
  TONE_STYLE_NAMES,
  TONE_STYLE_TOKENS,
  SPECTRUM_NAMES,
  SPECTRUM_TOKENS,
  FAMILY_MODIFIER_TOKENS,
} = require('../components');
const core = require('./lint-core');
const fs = require('node:fs');
const path = require('node:path');
const { parseSizes } = require('../engine/css.js');
const { FINISH_NAMES } = require('../core/resolve-finish');
const { MODE_NAMES } = require('../core/resolve-mode');
const { COLOR_MODE_NAMES } = require('../core/resolve-color-mode');
const { SPLIT_NAMES } = require('../core/resolve-split');
const { CLAIM_NAMES } = require('../core/resolve-claim');
const { LIFT_NAMES, LIFT_TOKENS } = require('../core/resolve-lift');
const {
  SPECTRUM_EDGE_NAMES,
  SPECTRUM_EDGE_TOKENS,
  SPECTRUM_CARD_NAMES,
  SPECTRUM_CARD_TOKENS,
  SPECTRUM_CARD_EDGE_NAMES,
  SPECTRUM_CARD_EDGE_TOKENS,
  SPECTRUM_TRIM_NAMES,
  SPECTRUM_TRIM_TOKENS,
} = require('../core/resolve-spectrum');
const { RULE_NAMES, RULE_TOKENS } = require('../core/resolve-rule');
const { EYEBROW_NAMES, EYEBROW_TOKENS } = require('../core/resolve-eyebrow');
const { HEADLINE_NAMES, HEADLINE_TOKENS } = require('../core/resolve-headline');

// Recognized root modifiers that are neither universals nor declared layout
// variants — documented base aliases / structural tokens. (`heat` and `canvas`
// moved to FAMILY_MODIFIERS — family-scoped, accepted via FAMILY_MODIFIER_TOKENS
// below but suggested only on their in-scope components.)
// `light` is the universal LIGHT-canvas modifier — the mirror of the universal
// `dark` (UNIVERSAL_GROUPS.mood). It lives here, as a base modifier accepted on
// every component, rather than as a universal VARIANT, so it stays clear of the
// pre-existing `divider.light` component variant (a manifest can't list a universal
// variant). base.modifiers.css `section.light` flips the canvas to light; deck-wide
// `class: light` propagates it. See lib/core/color-mode.js.
const BASE_MODIFIERS = ['mirror', 'left', 'numbered', 'overflow', 'briefing', 'horizontal', 'light'];

// Universal FRAME modifiers — the author's-call stage/footer controls that read
// the same on every `form` frame (defined in lib/forms/cell/stage/stage.css, not a
// component manifest, so they need explicit registration here). Two stage-content
// alignment axes (#527) plus the footer band's hug-vs-inset position (#16). Merged
// into the universal vocabulary below so autocomplete offers them everywhere and
// the linter doesn't flag them as unknown.
const FRAME_MODIFIERS = [
  'align-top', 'align-middle', 'align-bottom',
  'align-left', 'align-center', 'align-right',
  'fill-center', 'fill-anchor', 'fill-optical',
  'footer-inset',
];

// Animation modifiers — behavior hooks the live host reads (no CSS of their own),
// accepted on any section so the deck-level `class:` / slide `_class:` opt-in isn't
// flagged as an unknown class. The full CLOSED motion vocabulary across three axes:
// Play (`motion-on`/`motion-off`), Style (`motion-build`/`together`/`rise`), and Speed
// (`motion-auto`/`slow`/`normal`/`fast`) — §0.75, docs/src/playground/anima-host-sel.ts;
// `chart-anima` is the legacy `motion-on motion-build` alias. Enumerated (not matched by a
// `motion-` prefix) so a typo like `motion-biuld` / `motion-onn` is flagged, not silently
// accepted as a runtime no-op. All are no-ops on a non-chart section — safe everywhere.
const ANIMATION_MODIFIERS = [
  'chart-anima',
  'motion-on', 'motion-off',
  'motion-build', 'motion-together', 'motion-rise',
  'motion-auto', 'motion-slow', 'motion-normal', 'motion-fast',
];

// Map basemaps — the region/group vocabulary that feeds the `map` "did you
// mean" lint rule. Required directly (they're JSON); the geometry rides along
// but only the names are used here.
const MAP_BASEMAPS = {
  us: require('../components/chart/map/map.basemap.json'),
  world: require('../components/chart/map/map.basemap.world.json'),
};
const normMapName = (s) => String(s).toLowerCase().replace(/[.’']/g, '').replace(/\s+/g, ' ').trim();

/**
 * The registered `@size` table as plain data: name → { width, height }.
 *
 * Parsed from the shipped theme CSS with the ENGINE's own `parseSizes`, so the
 * linter and the renderer can never disagree about what `size: story` means
 * (HARD RULE #1). lint-core is pure and cannot read files, so this is injected
 * through the vocab; without it lint-core falls back to a name table that a
 * newly-registered `@size` would slip past.
 */
function buildSizeVocab() {
  try {
    const css = fs.readFileSync(path.join(__dirname, '..', '..', 'dist', 'lattice.css'), 'utf8');
    return Object.fromEntries(parseSizes(css));
  } catch {
    return undefined;   // no dist yet — lint-core uses its fallback table
  }
}

/**
 * Build the `{ us, world }` map vocabulary lint-core's region rule consumes:
 * `valid` is every normalized name/code/alias/group the basemap resolves;
 * `names` is the canonical display labels (countries/states + group labels) the
 * "did you mean" suggests from. Pure data from the baked basemaps.
 */
function buildMapVocab() {
  const out = {};
  for (const [which, bm] of Object.entries(MAP_BASEMAPS)) {
    const valid = new Set();
    const names = [];
    for (const [id, r] of Object.entries(bm.regions)) {
      valid.add(normMapName(id));
      valid.add(normMapName(r.name));
      names.push(r.name);
    }
    for (const a of Object.keys(bm.aliases || {})) valid.add(normMapName(a));
    for (const [slug, g] of Object.entries(bm.groups || {})) {
      valid.add(normMapName(slug));
      valid.add(normMapName(g.label));
      for (const a of g.aliases || []) valid.add(normMapName(a));
      names.push(g.label);
    }
    out[which] = { valid, names };
  }
  return out;
}

/**
 * Build the recognized-token vocabulary from the live manifests: every component
 * name, and the union of every component's effective variants plus the
 * universal / semi-universal / base modifier vocabularies. Pass an explicit
 * `manifests` array to lint against a fixed catalog (tests). Returns
 * `{ names: Set, modifiers: Set, universalModifiers: Set, mapRegions,
 * finishNames }` — a superset of the `{ names, modifiers }` shape lintTextWith
 * consumes.
 */
function buildVocab(manifests) {
  const ms = manifests || loadAll();
  const names = new Set(ms.map((m) => m.name));
  // The universals: modifiers any component accepts (base aliases + semi-
  // universals + the universal-variant decorations). Tracked on their own so the
  // editor's autocomplete can offer a component's own variants first and
  // universals after; `modifiers` stays the full union the linter validates.
  // Universals include multi-token decoration strings ('tint-corner at-tl');
  // split so each fragment registers.
  const universalModifiers = new Set([...BASE_MODIFIERS, ...FRAME_MODIFIERS, ...ANIMATION_MODIFIERS, ...SEMI_UNIVERSAL_VARIANTS, ...STAMP_STYLE_TOKENS, ...TONE_STYLE_TOKENS, ...SPECTRUM_TOKENS, ...SPECTRUM_EDGE_TOKENS, ...SPECTRUM_CARD_TOKENS, ...SPECTRUM_CARD_EDGE_TOKENS, ...SPECTRUM_TRIM_TOKENS, ...RULE_TOKENS, ...EYEBROW_TOKENS, ...HEADLINE_TOKENS, ...LIFT_TOKENS]);
  for (const u of UNIVERSAL_VARIANTS) for (const t of u.split(/\s+/)) universalModifiers.add(t);
  const modifiers = new Set(universalModifiers);
  for (const m of ms) for (const v of effectiveVariants(m)) for (const t of v.split(/\s+/)) modifiers.add(t);
  // Family (scoped) modifiers — accepted by the linter everywhere; the
  // autocomplete scopes them per component via the catalog's `familyModifiers`.
  for (const t of FAMILY_MODIFIER_TOKENS) modifiers.add(t);
  // Content-capacity contract — name → { axis, min, sweet, soft, hard,
  // escalateTo, note } for the layouts that declare it. Plain data (no Sets),
  // so it serializes straight through to the browser handoff. Feeds the
  // capacity lint rule. See engineering/decisions/2026-06-17-content-capacity-contract.md.
  //
  // PER-FAMILY counts ride along under `families`. The same component holds a
  // very different number in each box — cards-grid measures a ceiling of 6 at
  // wide and 3 at tall — so a single flat number cannot be right for all four,
  // and enforcing one meant a portrait deck was linted against a landscape
  // budget. `adapt.capacity.<family>` already carried the finer numbers; nothing
  // read them until now (#1218 follow-up). The flat block stays as the fallback
  // and keeps axis / min / escalateTo / note, which are family-independent.
  const capacity = {};
  for (const m of ms) {
    if (!m.capacity) continue;
    const families = m.adapt?.capacity;
    capacity[m.name] = families
      ? { ...m.capacity, families: Object.fromEntries(
          Object.entries(families).filter(([k]) => k !== 'axis')) }
      : m.capacity;
  }
  // The GROUP STRUCTURE of the universals (mood/decoration/typography/chrome/state/
  // tone) + the mutually-exclusive axes — carried through so the Studio drawer can
  // render grouped, single-select controls from the SAME generated vocabulary the
  // linter uses, never a hand-list that would drift (HARD RULE #7/#15). Plain data,
  // so it serializes straight to the browser handoff.
  const universalGroups = Object.fromEntries(Object.entries(UNIVERSAL_GROUPS).map(([k, g]) => [k, [...g]]));
  const exclusiveAxes = Object.fromEntries(Object.entries(EXCLUSIVE_AXES).map(([k, g]) => [k, [...g]]));
  // Per-component claim opt-outs (name → the excluded claim tokens, e.g.
  // ['claim-bleed']). A prose-dense/table layout excludes `claim-bleed` because
  // content run to the true edge gets cropped; the lint warns if it's used
  // anyway (the guard rail — 2026-07-03 claim decision §8). Plain data so it
  // serializes to the browser handoff.
  const claimExcludes = {};
  for (const m of ms) {
    const cl = (Array.isArray(m.excludes) ? m.excludes : []).filter((e) => e.startsWith('claim-'));
    if (cl.length) claimExcludes[m.name] = cl;
  }
  const stampStyles = { boardroom: [...STAMP_STYLES.boardroom], range: [...STAMP_STYLES.range] };
  // The registered `@size` table, name → { width, height }, parsed from the
  // shipped theme with the ENGINE's own parser — one source of truth for what a
  // `size:` directive resolves to (HARD RULE #1). lint-core derives the deck's
  // adaptive family from this rather than matching size NAMES against a list,
  // so a theme that registers a new `@size` is classified correctly instead of
  // silently falling through to `wide`.
  const sizes = buildSizeVocab();
  return { names, modifiers, universalModifiers, capacity, sizes, claimExcludes, mapRegions: buildMapVocab(), finishNames: [...FINISH_NAMES], modeNames: [...MODE_NAMES], colorModeNames: [...COLOR_MODE_NAMES], splitNames: [...SPLIT_NAMES], claimNames: [...CLAIM_NAMES], universalGroups, semiUniversalVariants: [...SEMI_UNIVERSAL_VARIANTS], exclusiveAxes, stampStyles, toneStyles: [...TONE_STYLE_TOKENS], stampStyleNames: [...STAMP_STYLE_NAMES], toneStyleNames: [...TONE_STYLE_NAMES], spectrumNames: [...SPECTRUM_NAMES], spectrumEdgeNames: [...SPECTRUM_EDGE_NAMES], spectrumCardNames: [...SPECTRUM_CARD_NAMES], spectrumCardEdgeNames: [...SPECTRUM_CARD_EDGE_NAMES], spectrumTrimNames: [...SPECTRUM_TRIM_NAMES], ruleNames: [...RULE_NAMES], eyebrowNames: [...EYEBROW_NAMES], headlineNames: [...HEADLINE_NAMES], liftNames: [...LIFT_NAMES] };
}

/**
 * Lint deck source. `opts.vocab` (a `{ names, modifiers }` built by buildVocab)
 * or `opts.manifests` (a fixed catalog) override the default live-manifest vocab.
 */
function lintText(source, opts = {}) {
  const vocab = opts.vocab || buildVocab(opts.manifests);
  return core.lintTextWith(source, vocab);
}

module.exports = {
  lintText,
  buildVocab,
  buildMapVocab,
  isKnownModifier: core.isKnownModifier,
  CLASS_DIRECTIVE: core.CLASS_DIRECTIVE,
  MODIFIER_PREFIXES: core.MODIFIER_PREFIXES,
  BASE_MODIFIERS,
  FRAME_MODIFIERS,
};
