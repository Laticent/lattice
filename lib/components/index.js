/**
 * Component manifest loader + validator.
 *
 * Each layout in Lattice ships a JSON manifest in `lib/components/<name>.json`
 * describing it for the catalog, scaffolder, IDE snippets, and docs. The
 * rendering pipeline (CSS rules, JS post-processors, Mermaid integration)
 * is unchanged — the manifest is metadata, not behavior.
 *
 * See design/design-system.md §6 for the contract and rationale.
 *
 * Schema (required unless noted):
 *
 *   name         string  — the `_class` directive value (kebab-case)
 *   function     enum    — one of FUNCTIONS (catalog family)
 *   form         enum    — one of FORMS (spatial composition)
 *   substance    enum    — one of SUBSTANCES (engine plugin contract);
 *                          or MIXED_SUBSTANCE ('mixed') for panel-form
 *                          components that combine more than one
 *                          substance in one component. See §5/§13.
 *   description  string  — one-sentence human description
 *   tags         array   — 3-5 search tags from the controlled vocabulary
 *                          (TAG_GROUPS). The searcher's layer: complementary
 *                          to F/F/S, never a restatement of an axis value.
 *   skeleton     string  — markdown emitted by the scaffolder
 *   purpose      string  — (optional) when to use, 2-3 sentences
 *   variants     array   — (optional) LAYOUT-SPECIFIC modifier names.
 *                          Must NOT contain UNIVERSAL_VARIANTS or
 *                          SEMI_UNIVERSAL_VARIANTS — those are added
 *                          automatically by effectiveVariants().
 *   excludes     array   — (optional) universal modifiers this layout does
 *                          not offer: a MODIFIER_GROUPS group name ("table")
 *                          or a single universal token ("compact").
 *                          Everything is offered by default.
 *   families     array   — (optional) family-modifier groups this layout opts
 *                          into (a subset of FAMILY_NAMES, e.g.
 *                          ["state-markers"]); makes the family's scoped
 *                          modifiers (checks-*, heat) discoverable in
 *                          autocomplete next to where the layout is defined.
 *   dataCompletion boolean — (optional) the layout has a static body-data
 *                          vocabulary the editor completes (e.g. map regions);
 *                          must match the editor's DATA_SOURCE_COMPONENTS
 *                          registry (gated by the autocomplete-parity test).
 *   slots        object  — (optional) implicit content structure
 *   example      string  — (optional, deprecated) relative path to a snippet
 *                          file; superseded by the generated <name>.gallery.md
 *                          sibling.
 *   docs         string  — (optional, deprecated) deep link into a reference
 *                          doc; superseded by the generated <name>.docs.md
 *                          sibling.
 *   whenToUse    array   — (optional) [{title, body}, …] bulleted authoring
 *                          guidance consumed by build-component-docs.js.
 *   antiPatterns array   — (optional) [{title, body}, …] "don't" callouts,
 *                          same shape as whenToUse for symmetric rendering.
 *   related      array   — (optional) [{name, when}, …] see-also pointers
 *                          to other components.
 *   variantDocs  object  — (optional) per-variant prose for the docs/gallery
 *                          generator. Keys MUST be a subset of variants[].
 *                          Each value: {label?, summary, sample}.
 *   anatomyBlock string  — (optional) ID into the canonical ASCII catalog
 *                          (tools/ascii-preview.py build). The generator
 *                          resolves it; the manifest never carries the
 *                          drawing itself.
 *   sample       string  — (optional) full slide markdown for the default-
 *                          appearance slide of <name>.gallery.md (real prose,
 *                          unlike `skeleton` which is a placeholder template).
 *   commonMistakes array — (optional) [{mistake, fix}, …] AUTHORING-time
 *                          errors — made once this component is already
 *                          chosen, unlike antiPatterns (SELECTION-time: don't
 *                          reach for this component at all).
 *   variantDecisionRule array — (optional) [{variant, useWhen}, …] the signal
 *                          that should drive picking one variant over another;
 *                          `variant` is a token from variants[] or "default".
 *   dataShapeGuidance array — (optional) [string, …] terse rules on the SHAPE
 *                          of author-supplied data (cardinality, formatting,
 *                          sort order, label length) — for data-driven
 *                          components, beyond the generic capacity/density
 *                          item-count budgets.
 *
 * The formal JSON Schema lives at lib/components/manifest.schema.json.
 */


const fs = require('node:fs');
const path = require('node:path');
const { pkgRootFrom } = require('../core/pkg-root');
const { listComponentFolders } = require('../packages/fs.js');

// ── The manifest contract: manifest.schema.json is the SOURCE OF TRUTH ────
// The structural contract (field names, types, enums, required-ness) is
// declared ONCE, in the JSON Schema, and this validator DERIVES its
// vocabularies from it — derived values cannot drift, and the schema's own
// content is fixture-pinned in test/unit/components/schema-source-of-truth
// .test.js so a schema edit must change a test fixture in the same diff
// (change-coupling data showed them co-changing 21x, hand-synced, and they
// had already diverged in both directions). Semantic rules the schema can't
// express (measurability, cross-field constraints, sample-form lints) remain
// code, below.
//
// The schema is READ from the package root at load time, not `require`d — the
// same rule lattice-emulator.js:92 already states for package.json, for the same
// reason, and this file was the case it missed. esbuild treats a relative
// `require` as a local import and INLINES the file, so dist/lattice-emulator.js
// froze one era's schema while `loadAll()` below went on reading
// lib/components/**/*.manifest.json from DISK at run time. A bundle older than the
// tree then rejected manifests the loose source accepted, and said so in the most
// misleading way available: `unknown manifest key 'x' — not in
// manifest.schema.json … add the field there first`, pointing the author at a
// schema that already HAS the field. Reading the contract from the same root the
// manifests come from makes the two one era by construction.
//
// `pkgRootFrom` resolves to the repo root from lib/components/index.js AND from
// dist/lattice-emulator.js, so the one path below is the same directory
// lattice-emulator.js hands `loadAll()`. It is a SHARED walk on purpose: two copies
// of it would only have to disagree once for the contract and the manifests it
// governs to come from different trees (HARD RULE #15).
//
// The `require` stays as the FALLBACK, and it is not dead: esbuild still inlines
// it, which is what keeps the bundle working if lib/ is ever absent (package.json
// `files` ships it today, so that is a belt, not the braces).
//
// ENOENT is the ONLY silent fallback, and the narrowness is the point. A blanket
// catch reinstates exactly this bug: a schema with one fat-fingered comma parses in
// neither place, but the loose source RETHROWS from `require` and shows the author
// their typo, while a swallowed SyntaxError leaves the bundle validating the live
// tree against the build-day schema again — with no way to observe it, and with the
// same misleading `unknown manifest key` error at the end. Anything but a missing
// file is therefore announced. It still falls back rather than throwing: an
// unreadable-but-present schema (EACCES on a locked-down install) is a consumer's
// problem to hear about, not a reason to make the CLI refuse to start.
const SCHEMA_PATH = path.join(pkgRootFrom(__dirname), 'lib', 'components', 'manifest.schema.json');
const MANIFEST_SCHEMA = (() => {
  try {
    return JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf8'));
  } catch (e) {
    if (e && e.code !== 'ENOENT') {
      // Deliberately says "if this is the bundle". The two surfaces diverge here and
      // the first draft of this string claimed the bundle's behavior on both: in
      // dist/lattice-emulator.js the fallback is an esbuild-inlined object, so the
      // warning really is followed by a render against the build-day schema — but in
      // the loose source the fallback re-reads this same broken file and throws, so
      // nothing is "validated against" anything. Saying so plainly beats a sentence
      // that is false on the surface a developer is most likely reading it from.
      process.emitWarning(
        `could not read ${SCHEMA_PATH} (${e.message}) — falling back to the schema ` +
          'compiled into this build. If this is the bundled CLI, manifests are about to be ' +
          'validated against a possibly-stale contract, so an "unknown manifest key" error ' +
          'below may name a field the schema on disk already declares; from the source ' +
          'tree the underlying error follows immediately. Either way: fix this file.',
        'LatticeManifestSchema',
      );
    }
    return require('./manifest.schema.json');
  }
})();
// Deep-freeze BOTH copies. An accidental mutation (enum.push, a new property key)
// would silently rewrite the contract for the whole process; the checker
// demonstrated it live. Two objects need freezing now, not one: the parsed copy
// above is private to this module, while tools/check-ownership.js and
// lib/layout/gate.js take the require-cache copy — which this module used to freeze
// as a side effect of `require`ing it, and would otherwise stop protecting.
(function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o)) deepFreeze(v);
  }
  return deepFreeze;
})(MANIFEST_SCHEMA)(require('./manifest.schema.json'));
const SCHEMA_PROPS = MANIFEST_SCHEMA.properties;

const FUNCTIONS = Object.freeze(SCHEMA_PROPS.function.enum);


/**
 * Disk-layout buckets under lib/components/<bucket>/<name>/.
 *
 * Three kinds of buckets:
 *   - The seven function families (anchor … imagery) — bucket === function.
 *   - Four substance-defined exceptions, each colocating components
 *     built around a specific KIND of rendered content (today's
 *     implementation may not be tomorrow's, so the bucket describes
 *     the category, not the library):
 *       `chart`   — data visualizations (today: internal SVG kernel)
 *       `diagram` — topological / network visuals (today: Mermaid)
 *       `math`    — typeset equations (today: KaTeX)
 *       `code`    — syntax-highlighted source code (today: highlight.js)
 *   - One domain family: `legal` — colocates components that share
 *     authoring vocabulary, citation conventions, and audience use case
 *     even though they span four different function families.
 *
 * For most components `bucket === function`; the substance and domain
 * exceptions declare their bucket explicitly in the manifest. The
 * audience-function taxonomy in design-system.md §3 is preserved
 * regardless — see §9 for the disk-vs-function rationale.
 */
const BUCKETS = Object.freeze(SCHEMA_PROPS.bucket.enum);


/**
 * Resolve the disk bucket for a manifest. Returns the explicit `bucket`
 * field when present; otherwise defaults to the `function` value.
 * Used by groupByBucket() and by the disk-layout-aware loader.
 */
function manifestBucket(m) {
  if (!m || typeof m !== 'object') return undefined;
  if (typeof m.bucket === 'string' && m.bucket) return m.bucket;
  if (typeof m.function === 'string' && m.function) return m.function;
  return undefined;
}

const FORMS = Object.freeze(SCHEMA_PROPS.form.enum);


const SUBSTANCES = Object.freeze(SCHEMA_PROPS.substance.enum.filter((s) => s !== 'mixed'));

// The focusable axes a layout may declare via the manifest `focusAxes` field —
// MUST mirror SUPPORTED_AXES in lib/transformers/focus.js (the resolver) and
// FOCUS_AXES in lib/authoring/lint-core.js. A layout opts into per-axis focus
// highlighting by listing the axes its body structure supports (a `<table>` →
// row/col/cell, a top-level list/grid → item, a code block → line, a chart's
// marks → mark, its series → series). The autocomplete-parity test gates every
// declared value against this set.
const SUPPORTED_AXES = Object.freeze(SCHEMA_PROPS.focusAxes.items.enum);

// The COLLECTION axes — the ones a capacity, density or split counts elements
// along. A subset of the focus axes: `mark` and `series` address a chart's marks
// by attribute, and there is no collection of them for a budget to count.
const COLLECTION_AXES = Object.freeze(SCHEMA_PROPS.capacity.properties.axis.enum);

/**
 * Escape hatch for components that legitimately combine more than one
 * substance in one slot (prose + structure). Allowed only when
 * `form === 'panel'`: the panel form is what makes combining substances
 * coherent (one prominent item + supporting structure). No component
 * currently declares `substance: "mixed"` — the hatch stays dormant but
 * remains a general capability.
 *
 * Kept OUT of SUBSTANCES so the four-plugin-contract statement stays
 * true: 'mixed' is not a plugin, it's a declaration that the component
 * composes two existing contracts. See design-system.md §5 + §13.
 */
const MIXED_SUBSTANCE = 'mixed';

/**
 * Universal variants apply to every layout. Manifests must NOT list
 * them in their `variants` field — they are added automatically by
 * `effectiveVariants()`. The validator flags any manifest that lists
 * a universal as a `variants` entry.
 *
 * Grouped here for documentation; UNIVERSAL_VARIANTS is the flat union.
 *
 * See design/design-system.md §6.5.
 */
const UNIVERSAL_GROUPS = Object.freeze({
  mood: Object.freeze(['dark']),
  decoration: Object.freeze([
    'treatment-none',
    'tint-corner at-tl',
    'mark-orbit',
    'tint-vignette',
    'tint-edge at-right',
    'mark-threads',
  ]),
  typography: Object.freeze([
    'with-period',
    'no-period',
    'scale-l',
    'scale-xl',
    'scale-2xl',
  ]),
  // `form` and `no-form` LEFT this set (2026-09-20). Form is the composition model,
  // not a chrome control an author toggles — see the retired-form lint rules, which
  // coach a deck still carrying either token toward deleting it.
  chrome: Object.freeze(['silent', 'no-header', 'no-footer', 'no-paginate', 'no-progress']),
  // note — suppress below-note promotion on this slide, so a trailing paragraph that
  // follows a list or a table stays body copy instead of becoming a hairline-ruled
  // footnote. Its own family rather than a `chrome` entry, and the distinction is real:
  // `chrome` suppresses the running FRAME (header, footer, page number, rail), none of
  // which is the author's words. This one is about the author's own last sentence, so
  // `silent` deliberately does NOT imply it. Kernel: lib/core/below-note.js.
  // See engineering/decisions/2026-08-04-below-note-opt-out.md.
  // `note-warn` marks the slide's callout as an alarm — the drawn warning
  // triangle (--shape-warning) in the warn token, so a superseded-figures or
  // caveat note reads as one without a typed `⚠` (HARD RULE #29).
  note: Object.freeze(['no-note', 'note-warn']),
  social: Object.freeze(['safe']),
  // Two independent switches over the universal table treatment, NOT an exclusive
  // axis — an unstriped table that also fills the stage is a legitimate pair.
  // Each is the author-facing spelling of a custom property (base.variants.css).
  // `state-cells` joins them as a third table switch: it opts the slide's <td>
  // cells into the universal state-marker decoding (the six markers →
  // the color-blind-safe status disc) that obligation-matrix and matrix-grid
  // get by layout. HARD RULE #29's answer to a typed `✓` in a comparison table.
  // `row-label` / `no-row-label` overrule the per-table measurement in
  // lib/core/table-row-label.js, which decides whether a table's first column
  // reads as a row label. Universal rather than `table`-component-only so a
  // plain table can opt IN — base declines the bet by default because it is
  // wrong on an ordinal, a status tick, a citation index and a single-column
  // table. See engineering/decisions/2026-09-20-table-component.md.
  table: Object.freeze(['table-plain', 'table-fill', 'state-cells', 'row-label', 'no-row-label']),
  state: Object.freeze([
    'wip',
    'draft',
    'tbd',
    'confidential',
    'redacted',
    'archived',
    'pinned',
    'revised',
  ]),
  tone: Object.freeze(['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip']),
  // insight — rename the callout eyebrow (the universal Key Insight panel + the
  // split-compare verdict tag, which share the `--insight-label` seam). A curated
  // boardroom vocabulary; the token is accepted on every slide but only shows
  // where a callout exists. The two defaults are exposed as explicit modifiers
  // (insight-key / insight-recommendation) so either can move onto the other
  // surface. See engineering/decisions/2026-07-17-insight-label-vocabulary.md.
  insight: Object.freeze([
    'insight-key',
    'insight-recommendation',
    'insight-takeaway',
    'insight-verdict',
    'insight-so-what',
    'insight-bottom-line',
    'insight-the-ask',
    'insight-our-view',
    'insight-implication',
    'insight-next-step',
    'insight-why',
  ]),
  // claim — let content claim the stage (2026-07-03 decision). `quiet`/`hero`
  // are universal (every component); `claim-framed` is the no-op per-slide
  // opt-out marker (renders no CSS — the standard-frame default). `bleed` is
  // semi-universal (opt-out via `excludes` on prose-dense layouts where
  // edge-to-edge crops content).
  claim: Object.freeze(['claim-quiet', 'claim-hero', 'claim-framed']),
});
const UNIVERSAL_VARIANTS = Object.freeze(
  Object.values(UNIVERSAL_GROUPS).flatMap((g) => [...g])
);

/**
 * Semi-universal variants apply to most layouts but not all. Manifests
 * either accept them (default) or opt out via the `excludes` field.
 * Like universals, semi-universals must NOT be listed in `variants` —
 * acceptance is the default, opt-out is explicit.
 */
const SEMI_UNIVERSAL_VARIANTS = Object.freeze(['compact', 'accent', 'claim-bleed']);

// Stamp + tone STYLE axes — the SHAPE a state / tone marker renders in, orthogonal to
// the semantic marker. Canonical vocabulary lives in the resolve registers (which also
// own the deck-wide `stamp:` / `tone:` front-matter mapping); re-exported here so the
// lint vocabulary and the Studio drawer read the SAME list the CSS + registers do.
// `STAMP_STYLES.boardroom` is the curated subset the drawer surfaces first.
const { STAMP_STYLES, STAMP_STYLE_NAMES, STAMP_STYLE_TOKENS } = require('../core/resolve-stamp');
const { TONE_STYLE_NAMES, TONE_STYLE_TOKENS } = require('../core/resolve-tone-style');
const { SPECTRUM_NAMES, SPECTRUM_TOKENS } = require('../core/resolve-spectrum');

/**
 * Mutually-exclusive per-slide axes — the token groups where at most ONE member
 * may appear on a single `_class`. This is the ONE source of truth for exclusivity,
 * consumed by BOTH the `conflicting-variants` lint rule (which flags a slide
 * carrying two members) and the Studio's per-slide drawer (which renders each axis
 * as a single-select). Membership is a SUBSET of the universal/semi-universal
 * vocabularies above — not a re-list of a whole group — because a group can mix
 * axes (typography carries the `scale-*` axis AND the independent `with/no-period`
 * pair). A parity test (test/unit/components/exclusive-axes.test.js) asserts every
 * token here is a real universal/semi-universal, so this can't drift.
 *
 * NB: state stamps (`wip`…) are deliberately NOT here — the engine permits multiple
 * and the drawer single-selects them only as a UX nicety, not a render conflict.
 * The `finish-*` axis is exclusive too but DYNAMIC (preset + saved names), so the
 * lint rule and drawer handle it specially rather than by a static token list.
 */
const EXCLUSIVE_AXES = Object.freeze({
  // NOTE: `dark`/`light` (the color-mode canvas) are NOT an exclusive axis here.
  // `dark` is a universal variant but `light` is a base modifier (kept clear of the
  // `divider.light` component variant), and this axis vocabulary must stay universal/
  // semi-universal (exclusive-axes.test.js + the Studio drawer). A slide carrying both
  // is a rare hand-authored footgun (CSS resolves it deterministically — `section.light`
  // follows `section.dark`, so light wins); the real deck-wide-vs-per-slide case is
  // handled by deckClassPropagate, which drops the deck token when a slide pins its own.
  tone: Object.freeze(['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip']),
  // One callout label per slide — two `insight-*` tokens fight on the shared
  // `--insight-label` (last wins), so the drawer single-selects them.
  insight: Object.freeze([
    'insight-key',
    'insight-recommendation',
    'insight-takeaway',
    'insight-verdict',
    'insight-so-what',
    'insight-bottom-line',
    'insight-the-ask',
    'insight-our-view',
    'insight-implication',
    'insight-next-step',
    'insight-why',
  ]),
  scale: Object.freeze(['scale-l', 'scale-xl', 'scale-2xl']),
  period: Object.freeze(['with-period', 'no-period']),
  // No `density` axis: `loose` is retired (2026-07-03), and `compact` is a lone
  // standalone toggle — with one member there is nothing to be mutually exclusive
  // WITH, so it belongs in SEMI_UNIVERSAL_VARIANTS, not here (an exclusive axis needs ≥2).
  claim: Object.freeze(['claim-framed', 'claim-quiet', 'claim-hero', 'claim-bleed']),
});

/**
 * Base, frame and animation modifiers — accepted on every slide but defined in
 * base / stage CSS or read by the live host, not in any manifest. They used to
 * live in lib/authoring/lint.js; they moved here so MODIFIER_GROUPS below can
 * place every accepted token in exactly one group, and lint.js imports them back.
 *
 * BASE_MODIFIERS: `light` is the universal LIGHT-canvas modifier, the mirror of
 * the universal `dark`. It is a base modifier rather than a universal VARIANT so it
 * stays clear of the pre-existing `divider.light` component variant (a manifest
 * can't list a universal variant); base.modifiers.css `section.light` flips the
 * canvas. The other six are COMPONENT-SCOPED aliases that the linter accepts on any
 * slide: `mirror` (image/scene/split-panel/compare-prose), `left` (image alias +
 * tint-edge placement), `numbered` (list/divider/cards-stack), `horizontal`
 * (cards-stack/state-chart), `briefing` (kpi) and `overflow` (the engine's own
 * marker). They are NOT offered as universals — see the `aliases` group.
 *
 * FRAME_MODIFIERS: the stage/footer controls that read the same on every `form`
 * frame (lib/forms/cell/stage/stage.css): two alignment axes (#527) plus the footer
 * band's hug-vs-inset position (#16).
 *
 * ANIMATION_MODIFIERS: behavior hooks the live host reads (no CSS of their own).
 * The closed motion vocabulary across three axes — Play (`motion-on`/`off`), Style
 * (`motion-build`/`together`/`rise`) and Speed (`motion-auto`/`slow`/`normal`/`fast`)
 * — §0.75, docs/src/playground/anima-host-sel.ts. `chart-anima` is the legacy
 * `motion-on motion-build` alias. Enumerated, not prefix-matched, so a typo like
 * `motion-biuld` is flagged rather than silently accepted as a runtime no-op.
 */
const BASE_MODIFIERS = Object.freeze(['mirror', 'left', 'numbered', 'overflow', 'briefing', 'horizontal', 'light']);
const FRAME_MODIFIERS = Object.freeze([
  'align-top', 'align-middle', 'align-bottom',
  'align-left', 'align-center', 'align-right',
  'fill-center', 'fill-anchor', 'fill-optical',
  'footer-inset',
]);
const ANIMATION_MODIFIERS = Object.freeze([
  'chart-anima',
  'motion-on', 'motion-off',
  'motion-build', 'motion-together', 'motion-rise',
  'motion-auto', 'motion-slow', 'motion-normal', 'motion-fast',
]);

const {
  SPECTRUM_EDGE_TOKENS, SPECTRUM_CARD_TOKENS, SPECTRUM_CARD_EDGE_TOKENS, SPECTRUM_TRIM_TOKENS,
} = require('../core/resolve-spectrum');
const { RULE_TOKENS } = require('../core/resolve-rule');
const { EYEBROW_TOKENS } = require('../core/resolve-eyebrow');
const { INLINE_CODE_TOKENS } = require('../core/resolve-inline-code');
const { HEADLINE_TOKENS } = require('../core/resolve-headline');
const { LIFT_TOKENS } = require('../core/resolve-lift');
const { CARDS_TOKENS } = require('../core/resolve-cards');
const { CORNERS_TOKENS } = require('../core/resolve-corners');
const { GUARDS_TOKENS } = require('../core/resolve-guards');

/**
 * MODIFIER_GROUPS — every modifier a slide accepts WITHOUT a manifest declaring
 * it, grouped by what it controls. This is the one registry behind three things:
 *
 *   1. the linter's universal vocabulary (lib/authoring/lint.js reads the flat
 *      union, `UNIVERSAL_MODIFIER_TOKENS`);
 *   2. a manifest's `excludes`, which may name a whole GROUP (`"table"`) or a
 *      single token (`"table-fill"`) — everything is offered by default, and one
 *      word removes a family (validated here, expanded by `excludedModifiers`);
 *   3. the editor's `_class:` completion, which reads each group's shape so it can
 *      behave like shell completion: sections in this ORDER, one pick per
 *      exclusive axis, dependents only after the token they qualify.
 *
 * Group fields:
 *   tokens     the group's members.
 *   axes       sub-lists whose members are mutually exclusive (pick one). A group
 *              with `exclusive: true` is a single axis over all its tokens.
 *   follows    token → dependents offered only once that token is on the line
 *              (`tint-corner` → `at-tl` …). Dependents are accepted everywhere by
 *              the `at-` lint prefix; they are listed so completion can offer them.
 *   surface    the part of the slide the group acts on — a surface name, or a
 *              map of token (or `*`) → surface when members differ. Absent means
 *              `slide`: the group acts on the slide as a whole and is offered after
 *              every component. Anything else is offered only where the component
 *              has that surface (lib/components/surfaces.js derives them from the
 *              component's own anatomy and render), so no manifest lists modifiers.
 *   offer      false → accepted by the linter but never offered as a universal
 *              (component-scoped aliases; a manifest that owns one lists it as a
 *              variant and it is offered there).
 *
 * A group name must not collide with a token, so an `excludes` entry is never
 * ambiguous (pinned by test/unit/components/modifier-groups.test.js).
 * See engineering/decisions/2026-09-24-positional-class-completion.md.
 */
const MODIFIER_GROUPS = Object.freeze([
  { name: 'mood', label: 'Canvas', tokens: ['dark', 'light'], exclusive: true },
  { name: 'claim', label: 'Claim', tokens: ['claim-framed', 'claim-quiet', 'claim-hero', 'claim-bleed'], exclusive: true },
  { name: 'density', label: 'Density', tokens: ['compact'] },
  { name: 'accent', label: 'Accent', tokens: ['accent'] },
  { name: 'typography', label: 'Typography', tokens: ['with-period', 'no-period', 'scale-l', 'scale-xl', 'scale-2xl'], surface: { 'with-period': 'heading', 'no-period': 'heading', '*': 'slide' }, axes: [['with-period', 'no-period'], ['scale-l', 'scale-xl', 'scale-2xl']] },
  { name: 'headline', label: 'Headline', tokens: [...HEADLINE_TOKENS], exclusive: true, surface: 'heading' },
  { name: 'rule', label: 'Heading rule', tokens: [...RULE_TOKENS], exclusive: true, surface: 'heading' },
  { name: 'eyebrow', label: 'Eyebrow', tokens: [...EYEBROW_TOKENS], exclusive: true, surface: 'eyebrow' },
  { name: 'inline-code', label: 'Inline code', tokens: [...INLINE_CODE_TOKENS] },
  { name: 'insight', label: 'Insight label', tokens: [...UNIVERSAL_GROUPS.insight], exclusive: true, surface: 'insight-label' },
  { name: 'note', label: 'Note', tokens: [...UNIVERSAL_GROUPS.note], surface: { 'no-note': 'below-note', 'note-warn': 'key-insight' } },
  { name: 'table', label: 'Table', tokens: [...UNIVERSAL_GROUPS.table], axes: [['row-label', 'no-row-label']], surface: 'table' },
  { name: 'state', label: 'State stamp', tokens: [...UNIVERSAL_GROUPS.state] },
  { name: 'tone', label: 'Review tone', tokens: [...UNIVERSAL_GROUPS.tone], exclusive: true },
  { name: 'stamp-style', label: 'Stamp shape', tokens: [...STAMP_STYLE_TOKENS], exclusive: true },
  { name: 'tone-style', label: 'Tone shape', tokens: [...TONE_STYLE_TOKENS], exclusive: true },
  { name: 'cards', label: 'Card spacing', tokens: [...CARDS_TOKENS], exclusive: true, surface: 'card-row' },
  { name: 'lift', label: 'Card lift', tokens: [...LIFT_TOKENS], exclusive: true, surface: 'card-surface' },
  { name: 'corners', label: 'Corners', tokens: [...CORNERS_TOKENS], exclusive: true },
  // The `fit:` register's per-slide overrides (report / heal / trim), plus `guards-*`, its old
  // spelling. Listed so `_class: fit-report` lints clean — `guards-strict` was documented as a
  // per-slide override and flagged `unknown-class` until this group existed.
  { name: 'fit', label: 'Fit', tokens: [...GUARDS_TOKENS], exclusive: true },
  { name: 'card-rail', label: 'Card rail', tokens: [...SPECTRUM_CARD_TOKENS, ...SPECTRUM_CARD_EDGE_TOKENS], axes: [[...SPECTRUM_CARD_TOKENS], [...SPECTRUM_CARD_EDGE_TOKENS]], surface: 'card-rail' },
  { name: 'spectrum', label: 'Brand bar', tokens: [...SPECTRUM_TOKENS, ...SPECTRUM_EDGE_TOKENS, ...SPECTRUM_TRIM_TOKENS], axes: [[...SPECTRUM_TOKENS], [...SPECTRUM_EDGE_TOKENS], [...SPECTRUM_TRIM_TOKENS]] },
  {
    name: 'decoration', label: 'Decoration',
    tokens: ['treatment-none', 'tint-corner', 'tint-vignette', 'tint-edge', 'mark-orbit', 'mark-threads'],
    follows: { 'tint-corner': ['at-tl', 'at-tr', 'at-bl', 'at-br'], 'tint-edge': ['at-top', 'at-right', 'at-bottom', 'at-left'] },
  },
  { name: 'frame', label: 'Stage frame', tokens: [...FRAME_MODIFIERS], axes: [['align-top', 'align-middle', 'align-bottom'], ['align-left', 'align-center', 'align-right'], ['fill-center', 'fill-anchor', 'fill-optical']] },
  { name: 'chrome', label: 'Chrome', tokens: [...UNIVERSAL_GROUPS.chrome] },
  { name: 'social', label: 'Social', tokens: [...UNIVERSAL_GROUPS.social] },
  { name: 'motion', label: 'Motion', tokens: [...ANIMATION_MODIFIERS], axes: [['motion-on', 'motion-off'], ['motion-build', 'motion-together', 'motion-rise'], ['motion-auto', 'motion-slow', 'motion-normal', 'motion-fast']], surface: 'chart-marks' },
  { name: 'aliases', label: 'Aliases', tokens: BASE_MODIFIERS.filter((t) => t !== 'light'), offer: false },
].map((g) => Object.freeze(g)));

const MODIFIER_GROUP_BY_NAME = new Map(MODIFIER_GROUPS.map((g) => [g.name, g]));
/** Every token any group holds, plus each group's `follows` dependents. */
const UNIVERSAL_MODIFIER_TOKENS = Object.freeze([...new Set(MODIFIER_GROUPS.flatMap((g) => [
  ...g.tokens, ...Object.values(g.follows || {}).flat(),
]))]);
const UNIVERSAL_MODIFIER_SET = new Set(UNIVERSAL_MODIFIER_TOKENS);

/** The universal tokens a list of `excludes` entries names (groups expanded). */
function expandExcludes(entries) {
  const out = new Set();
  for (const e of Array.isArray(entries) ? entries : []) {
    const g = MODIFIER_GROUP_BY_NAME.get(e);
    if (g) for (const t of [...g.tokens, ...Object.values(g.follows || {}).flat()]) out.add(t);
    else out.add(e);
  }
  return out;
}

/** The surface `token` of group `g` acts on (`slide` when the group names none). */
function surfaceOf(g, token) {
  if (!g.surface) return 'slide';
  if (typeof g.surface === 'string') return g.surface;
  return g.surface[token] || g.surface['*'] || 'slide';
}

/**
 * The manifest's own opt-outs, groups expanded — the escape hatch for a component
 * that HAS a surface but deliberately ignores a modifier on it (`claim-bleed` on a
 * dense table). Surface-based offering handles everything else. Sorted.
 */
function excludedModifiers(manifest) {
  return [...expandExcludes(manifest?.excludes)].sort();
}

/**
 * Family (scoped) modifiers — cross-cutting modifiers that apply to a SUBSET
 * of layouts, so they're neither universal (every layout) nor a single
 * component's `variant`. They live in CSS as section modifiers; this registry
 * is what makes them discoverable — the autocomplete suggests them ONLY on the
 * components in scope (`familyModifiersFor`), and the lint vocabulary accepts
 * them everywhere (`FAMILY_MODIFIER_TOKENS`).
 *
 * Membership is declared two ways, chosen by what the family is scoped to:
 *   - **per-layout** → the manifest's `families: ["state-markers"]` field, so a
 *     layout opts in next to where it's defined (co-located; no edit here when a
 *     new state-bearing layout is added).
 *   - **per-bucket** → the group's `buckets` here, when the family is genuinely
 *     bucket-wide (the whole chart bucket gets the `canvas` surface).
 *
 *   state-markers — the checkbox disc-style variants (`checks-*`) + the `heat`
 *                   load/risk overlay, for layouts that declare the family.
 *   chart         — the opt-in `canvas` surface panel, for the chart bucket.
 *
 * See design/design-system.md §6.5 and lib/base/base.docs.md.
 */
const FAMILY_MODIFIERS = Object.freeze({
  'state-markers': Object.freeze({
    modifiers: Object.freeze([
      'checks-ringed', 'checks-knockout', 'checks-bold', 'checks-outline', 'checks-tonal', 'heat',
    ]),
    // Membership is per-layout: a manifest opts in via `families: ["state-markers"]`.
  }),
  chart: Object.freeze({
    modifiers: Object.freeze(['canvas']),
    buckets: Object.freeze(['chart']),
  }),
});
/** Flat union of every family-modifier token — for the lint vocabulary. */
const FAMILY_MODIFIER_TOKENS = Object.freeze([
  ...new Set(Object.values(FAMILY_MODIFIERS).flatMap((g) => [...g.modifiers])),
]);
/** Every family-group name. */
const FAMILY_NAMES = Object.freeze(Object.keys(FAMILY_MODIFIERS));
/**
 * The family groups a manifest may opt into via `families` — only the per-layout
 * ones. Bucket-scoped families (`g.buckets`) are applied automatically from the
 * component's bucket, so opting in by name would be meaningless; the validator
 * rejects it.
 */
const OPT_IN_FAMILY_NAMES = Object.freeze(
  Object.entries(FAMILY_MODIFIERS).filter(([, g]) => !g.buckets).map(([name]) => name)
);
/**
 * Family modifiers applicable to a manifest: the union of every group the
 * manifest opts into by name (`m.families`) and every group scoped to the
 * manifest's bucket (`g.buckets`). Kept in step with the lint vocabulary by the
 * autocomplete-parity test.
 */
function familyModifiersFor(m) {
  const bucket = manifestBucket(m);
  const declared = new Set(Array.isArray(m.families) ? m.families : []);
  const out = new Set();
  for (const [name, g] of Object.entries(FAMILY_MODIFIERS)) {
    if (declared.has(name) || g.buckets?.includes(bucket)) {
      for (const mod of g.modifiers) out.add(mod);
    }
  }
  return [...out];
}

/**
 * Controlled tag vocabulary — the SEARCHER's layer, complementary to the
 * Function/Form/Substance classification axes.
 *
 * Function/Form/Substance answer "what kind of thing is this" for the
 * designer. Tags answer "what does an author search for before they know
 * the component's name": the colloquial/visual name, the occasion they're
 * authoring for, the input material in hand, and the task. They feed the
 * docs portal's client-side filter and the generated reference.
 *
 * Two rules keep tags valuable rather than noisy (both enforced by
 * validate(), the second also by tools/check-ownership.js):
 *
 *   1. Controlled — every tag MUST be a member of this vocabulary. New
 *      search vocabulary is added here deliberately, not coined per
 *      manifest, so the facets cluster across components.
 *   2. Complementary — a tag MUST NOT repeat the component's own
 *      name / function / form / substance / bucket. Tags carry only the
 *      vocabulary the four axes can't (e.g. `swimlane`, `board-deck`,
 *      `percentage`), never a restatement of the axis itself.
 *
 * Grouped by dimension for documentation; TAGS is the flat union. The
 * "don't let it drift" guard (a tag used by exactly one component must be
 * allow-listed in SINGLETON_TAGS, and no vocabulary term may be unused)
 * lives in tools/check-ownership.js — it is a cross-component property,
 * not a per-manifest one. See design/design-system.md §7 (Discovery).
 */
const TAG_GROUPS = Object.freeze({
  // Colloquial / visual names an author searches before knowing the layout.
  idiom: Object.freeze([
    'dashboard', 'scorecard', 'two-by-two', 'swimlane', 'stoplight',
    'pull-quote', 'flowchart', 'changelog', 'donut', 'spider',
    'org-chart', 'hero-number', 'tag-cloud',
  ]),
  // Where the component gets reached for — meeting, phase, domain.
  occasion: Object.freeze([
    'board-deck', 'pitch', 'planning', 'strategy', 'compliance',
    'contract', 'regulation', 'onboarding', 'retrospective', 'workflow',
    'agile', 'okr', 'kickoff',
  ]),
  // The input material in hand — "I have a ___".
  material: Object.freeze([
    'metric', 'percentage', 'milestones', 'quotation', 'ranking',
    'proportion', 'formula', 'definition', 'ownership', 'status',
    'risk', 'process', 'citation', 'reference', 'snippet',
    'states', 'themes', 'requirements', 'visual',
  ]),
  // What the author is trying to do — task synonyms.
  task: Object.freeze([
    'summary', 'takeaway', 'walkthrough', 'prioritize', 'tradeoff',
    'recommendation', 'overview', 'contrast', 'transformation', 'assessment',
    'positioning', 'sequence', 'showcase', 'agenda-setting', 'section-break',
  ]),
});
const TAGS = Object.freeze(Object.values(TAG_GROUPS).flatMap((g) => [...g]));
const TAGS_SET = new Set(TAGS);

/** Min / max searchable tags a manifest must declare. */
const TAGS_MIN = 3;
const TAGS_MAX = 5;

/**
 * Compute the full variant set for a manifest, including universals and
 * any non-excluded semi-universals. Pure function of the manifest +
 * the universal vocabularies above. Used by the scaffolder's --list
 * output, the snippet description, and the docs catalog generator.
 *
 * Returns a sorted, deduplicated array of strings.
 */
function effectiveVariants(manifest) {
  // `excludes` may name a group or a token (MODIFIER_GROUPS); a multi-token
  // decoration string ('tint-corner at-tl') drops when any of its tokens is excluded.
  const excludes = expandExcludes(manifest.excludes);
  const out = new Set();
  for (const v of UNIVERSAL_VARIANTS) if (!v.split(/\s+/).some((t) => excludes.has(t))) out.add(v);
  for (const v of SEMI_UNIVERSAL_VARIANTS) if (!excludes.has(v)) out.add(v);
  if (Array.isArray(manifest.variants)) {
    for (const v of manifest.variants) out.add(v);
  }
  return [...out].sort();
}

// The card/split/statement/number layout sets and the inline-footgun detectors
// now live in the pure, browser-safe lint core (single source of truth), so this
// validator and the Drawing Board in-browser Architect panel run the SAME checks.
// See lib/authoring/lint-core.js.
const {
  CARD_STYLE_LAYOUTS,
  LEDGER_OL_LAYOUTS,
  STATEMENT_OL_LAYOUTS,
  SPLIT_SLOT_LAYOUTS,
  NUMBER_SLOT_LAYOUTS,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
  findBoldOrderedStatement,
  findSplitBodylessItem,
  countPrimaryCollection,
} = require("../authoring/lint-core");

// The component transform DSL's safety gate (pure — no fs/jsdom). A manifest's
// optional `transform` field is UNTRUSTED (shareable + AI-generable), so it is
// validated at load against the closed element/attribute allowlists, the closed
// selector sub-grammar, the known-op/known-capability sets, and the
// prototype-pollution firewall. See engineering/decisions/2026-06-29-component-
// transform-dsl.md §6/§12. (The DSL is not yet wired into the render pipeline;
// this is the manifest-boundary gate that must exist before it is.)
const { validateTransform } = require('../core/transform-dsl/schema');

// ── Manifest checkers ────────────────────────────────────────────────────
// validate() used to be one 500-line function with cyclomatic complexity 209
// — the worst outlier the quality assessment found (engineering/
// quality-assessment.md). It is now a pipeline of single-concern checkers.
// Every checker has the same shape — (m, prefix, errors), appending
// human-readable strings — and MANIFEST_CHECKS runs them in the original
// check order, so the emitted error list is unchanged. To add a manifest
// rule: write one checker, slot it into MANIFEST_CHECKS where its errors
// should appear.

// name, function, bucket, form, substance — the F/F/S axes every manifest must place itself on.
function checkIdentity(m, prefix, errors) {
  if (typeof m.name !== 'string' || !m.name) {
    errors.push(`${prefix}name must be a non-empty string`);
  } else if (!new RegExp(SCHEMA_PROPS.name.pattern).test(m.name)) {
    errors.push(`${prefix}name must be kebab-case (got ${JSON.stringify(m.name)})`);
  }
  if (!FUNCTIONS.includes(m.function)) {
    errors.push(`${prefix}function must be one of: ${FUNCTIONS.join(', ')} (got ${JSON.stringify(m.function)})`);
  }
  if (m.bucket !== undefined && !BUCKETS.includes(m.bucket)) {
    errors.push(`${prefix}bucket must be one of: ${BUCKETS.join(', ')} (got ${JSON.stringify(m.bucket)})`);
  }
  if (!FORMS.includes(m.form)) {
    errors.push(`${prefix}form must be one of: ${FORMS.join(', ')} (got ${JSON.stringify(m.form)})`);
  }
  if (m.substance === MIXED_SUBSTANCE) {
    if (m.form !== 'panel') {
      errors.push(`${prefix}substance "mixed" is only allowed when form is "panel" (got form ${JSON.stringify(m.form)})`);
    }
  } else if (!SUBSTANCES.includes(m.substance)) {
    errors.push(`${prefix}substance must be one of: ${SUBSTANCES.join(', ')}, or "${MIXED_SUBSTANCE}" on panel forms (got ${JSON.stringify(m.substance)})`);
  }
}

// the controlled search-tag vocabulary (required, complementary to the axes).
function checkTags(m, prefix, errors) {
  // Searchable tags — controlled vocabulary, strictly complementary to the
  // F/F/S axes. Required: every shipped component must be findable by tag.
  if (m.tags === undefined) {
    errors.push(`${prefix}tags is required — declare ${TAGS_MIN}-${TAGS_MAX} search tags from the controlled vocabulary (see TAG_GROUPS)`);
  } else if (!Array.isArray(m.tags)) {
    errors.push(`${prefix}tags must be an array`);
  } else {
    if (m.tags.length < TAGS_MIN || m.tags.length > TAGS_MAX) {
      errors.push(`${prefix}tags must have ${TAGS_MIN}-${TAGS_MAX} entries (got ${m.tags.length})`);
    }
    if (new Set(m.tags).size !== m.tags.length) {
      errors.push(`${prefix}tags entries must be unique`);
    }
    const bucket = typeof m.bucket === 'string' && m.bucket ? m.bucket : m.function;
    const ownAxes = new Set([m.name, m.function, m.form, m.substance, bucket].filter(Boolean));
    for (const t of m.tags) {
      if (typeof t !== 'string' || !t) {
        errors.push(`${prefix}tags entries must be non-empty strings (got ${JSON.stringify(t)})`);
        continue;
      }
      if (!TAGS_SET.has(t)) {
        errors.push(`${prefix}tag '${t}' is not in the controlled vocabulary — add it to TAG_GROUPS in lib/components/index.js or pick an existing tag`);
      }
      if (ownAxes.has(t)) {
        errors.push(`${prefix}tag '${t}' duplicates the component's own name/function/form/substance/bucket — tags must be complementary, carrying only what the axes don't`);
      }
    }
  }
}

// description, skeleton, purpose — the human-readable contract fields.
function checkProse(m, prefix, errors) {
  if (typeof m.description !== 'string' || !m.description) {
    errors.push(`${prefix}description must be a non-empty string`);
  }
  if (typeof m.skeleton !== 'string' || !m.skeleton) {
    errors.push(`${prefix}skeleton must be a non-empty string`);
  }
  if (m.purpose !== undefined && (typeof m.purpose !== 'string' || !m.purpose)) {
    errors.push(`${prefix}purpose must be a non-empty string if present`);
  }
}

// declared variants + semi-universal excludes.
function checkVariants(m, prefix, errors) {
  if (m.variants !== undefined) {
    if (!Array.isArray(m.variants)) {
      errors.push(`${prefix}variants must be an array if present`);
    } else {
      for (const v of m.variants) {
        if (typeof v !== 'string' || !v) {
          errors.push(`${prefix}variants entries must be non-empty strings (got ${JSON.stringify(v)})`);
          continue;
        }
        if (UNIVERSAL_VARIANTS.includes(v)) {
          errors.push(`${prefix}variant '${v}' is universal — remove from manifest (it is added automatically)`);
        }
        if (SEMI_UNIVERSAL_VARIANTS.includes(v)) {
          errors.push(`${prefix}variant '${v}' is semi-universal — remove from manifest; opt out via "excludes" if it does not apply`);
        }
      }
    }
  }
  if (m.excludes !== undefined) {
    if (!Array.isArray(m.excludes)) {
      errors.push(`${prefix}excludes must be an array if present`);
    } else {
      for (const v of m.excludes) {
        if (typeof v !== 'string' || !v) {
          errors.push(`${prefix}excludes entries must be non-empty strings (got ${JSON.stringify(v)})`);
          continue;
        }
        const group = MODIFIER_GROUP_BY_NAME.get(v);
        const neverOffered = MODIFIER_GROUPS.find((g) => g.offer === false && g.tokens.includes(v));
        if (group && group.offer === false) {
          errors.push(`${prefix}excludes entry '${v}' names the '${v}' group, which is never offered — nothing to exclude`);
        } else if (neverOffered) {
          errors.push(`${prefix}excludes entry '${v}' is in the never-offered '${neverOffered.name}' group — nothing to exclude`);
        } else if (!group && !UNIVERSAL_MODIFIER_SET.has(v)) {
          errors.push(`${prefix}excludes entry '${v}' is neither a modifier group (${MODIFIER_GROUPS.filter((g) => g.offer !== false).map((g) => g.name).join(', ')}) nor a universal modifier token`);
        } else if (Array.isArray(m.variants) && m.variants.includes(v)) {
          errors.push(`${prefix}excludes entry '${v}' is one of this component's own variants — a component cannot exclude what it declares`);
        }
      }
    }
  }
}

// opt-in family membership (bucket-scoped families apply automatically).
function checkFamilies(m, prefix, errors) {
  if (m.families !== undefined) {
    if (!Array.isArray(m.families)) {
      errors.push(`${prefix}families must be an array if present`);
    } else {
      for (const f of m.families) {
        if (typeof f !== 'string' || !f) {
          errors.push(`${prefix}families entries must be non-empty strings (got ${JSON.stringify(f)})`);
          continue;
        }
        if (!OPT_IN_FAMILY_NAMES.includes(f)) {
          const why = FAMILY_NAMES.includes(f)
            ? `'${f}' is bucket-scoped — it applies automatically from the bucket, not via "families"`
            : `'${f}' is not a known family`;
          errors.push(`${prefix}families entry ${why}. Opt-in families: ${OPT_IN_FAMILY_NAMES.join(', ')}`);
        }
      }
    }
  }
}

// the dataCompletion flag.
function checkDataCompletion(m, prefix, errors) {
  if (m.dataCompletion !== undefined && typeof m.dataCompletion !== 'boolean') {
    errors.push(`${prefix}dataCompletion must be a boolean if present`);
  }
}

// The `kernel` block — how a component's section transform is DISPATCHED.
//
// This is the manifest half of LPM Phase 1: `tools/build-chart-registry.js`
// reads these blocks and freezes the dispatch table chart-family.js runs on, so
// a chart is a folder-drop and no central file names it. Which is exactly why
// the block is validated HERE, at load, rather than only in the build gate: the
// generator's own input is these manifests, so a malformed block would emit a
// registry that fails at require time in every bundle, with the stack pointing
// at generated code instead of at the manifest that caused it.
//
// Chart bucket only, deliberately. The generated registry addresses a kernel as
// `../<name>/<name>.transform` relative to `_chart-family/`, and the family's
// chart-frame wrap is what consumes `figureClass`; neither holds for a
// component outside the bucket. Widening it is a Phase-2 decision (the ADR's
// `block` kind), not a silent one.
//
// `figureClass` is the block's ONLY key, and the extra-key arm below says so out
// loud rather than leaving a typo to `additionalProperties: false` in a schema
// this validator does not run. The kernel's path and entrypoint are convention;
// declaring them would have restated what the loader already requires, and an
// unexercised `entry` field is a facility Phase 2 would inherit and cite.
// See engineering/decisions/2026-09-01-manifest-driven-chart-dispatch.md.
//
// `marks` is the block's second key, added for the finish work: every DATA MARK
// the kernel paints, with the three facts a finish is decided by — how it takes
// paint, what its body encodes, and whether it carries text. It lives here for
// the same reason `figureClass` does. The alternative was a hand-written table
// in the finish's own module, and that table was wrong every time it was
// checked: it declared `funnel-band` text-bearing (the labels sit in the LEFT
// GUTTER, 0 of 5 bands carry any) and gave `cell-filled` no slot, collapsing six
// categories to one hue. A class that is inferred is a class that can be
// inferred wrongly.
const KERNEL_FIGURE_RE = new RegExp(SCHEMA_PROPS.kernel.properties.figureClass.pattern);
const KERNEL_MARK_PROPS = SCHEMA_PROPS.kernel.properties.marks.items.properties;
const KERNEL_MARK_CLASS_RE = new RegExp(KERNEL_MARK_PROPS.class.pattern);
const KERNEL_PAINTS = KERNEL_MARK_PROPS.paint.enum;
const KERNEL_ENCODINGS = KERNEL_MARK_PROPS.encodes.enum;
const KERNEL_BUCKETS = ['chart'];

function checkKernel(m, prefix, errors) {
  if (m.kernel === undefined) return;
  const k = m.kernel;
  if (typeof k !== 'object' || k === null || Array.isArray(k)) {
    errors.push(`${prefix}kernel must be an object if present`);
    return;
  }
  const bucket = typeof m.bucket === 'string' && m.bucket ? m.bucket : m.function;
  if (!KERNEL_BUCKETS.includes(bucket)) {
    errors.push(
      `${prefix}kernel is only dispatched for the ${KERNEL_BUCKETS.join('/')} bucket ` +
      `(this manifest's is "${bucket}"). A block here would be read by nothing.`);
  }
  if (typeof k.figureClass !== 'string' || !KERNEL_FIGURE_RE.test(k.figureClass)) {
    errors.push(
      `${prefix}kernel.figureClass must be a kebab-case class name — the class on the ` +
      `figure root the kernel emits (got ${JSON.stringify(k.figureClass)})`);
  }
  checkKernelMarks(k, prefix, errors);
  for (const key of Object.keys(k)) {
    if (key !== 'figureClass' && key !== 'marks') {
      errors.push(
        `${prefix}kernel.${key} is not part of the block. The kernel is found by convention at ` +
        `${m.name}.transform.js and its entrypoint is transformSection; figureClass and marks are ` +
        `the facts that are not derivable.`);
    }
  }
}

// `kernel.marks` — the data marks this kernel paints. Shape only; whether a
// declared class is actually WRITTEN by the transform, and whether `bears` holds
// against a real render, are the two gates outside the loader
// (`checkChartMarks` in tools/check-ownership.js, and
// `tools/chart-language-census.js --check`). Those need the filesystem and a
// browser respectively, and this validator runs in the browser bundle.
function checkKernelMarks(k, prefix, errors) {
  if (!Array.isArray(k.marks)) {
    errors.push(
      `${prefix}kernel.marks must be an array of the data marks this kernel paints — ` +
      `the elements whose paint carries a datum. A chart with no mark to paint is not a chart; ` +
      `if the member draws only type or only strokes, declare that mark with paint "none".`);
    return;
  }
  if (!k.marks.length) {
    errors.push(`${prefix}kernel.marks must list at least one mark.`);
    return;
  }
  const seen = new Set();
  k.marks.forEach((mark, i) => {
    const at = `${prefix}kernel.marks[${i}]`;
    if (typeof mark !== 'object' || mark === null || Array.isArray(mark)) {
      errors.push(`${at} must be an object`);
      return;
    }
    if (typeof mark.class !== 'string' || !KERNEL_MARK_CLASS_RE.test(mark.class)) {
      errors.push(
        `${at}.class must be the kebab-case class the transform writes on this mark ` +
        `(got ${JSON.stringify(mark.class)})`);
    } else if (seen.has(mark.class)) {
      errors.push(
        `${at}.class "${mark.class}" is declared twice. One class, one row — two rows can ` +
        `disagree, and a finish reads whichever it matched first.`);
    } else {
      seen.add(mark.class);
    }
    if (!KERNEL_PAINTS.includes(mark.paint)) {
      errors.push(
        `${at}.paint must be one of ${KERNEL_PAINTS.join(' / ')} — how the mark takes paint ` +
        `(got ${JSON.stringify(mark.paint)})`);
    }
    if (!KERNEL_ENCODINGS.includes(mark.encodes)) {
      errors.push(
        `${at}.encodes must be one of ${KERNEL_ENCODINGS.join(' / ')} — what the body encodes ` +
        `(got ${JSON.stringify(mark.encodes)})`);
    }
    if (typeof mark.bears !== 'boolean') {
      errors.push(
        `${at}.bears must be a boolean — does this mark carry a text label inside its own box ` +
        `(got ${JSON.stringify(mark.bears)})`);
    }
    // The one cross-field rule, and it runs ONE WAY ONLY. No body means nothing
    // for an encoding to live in, so `paint: "none"` forces `encodes: "none"` —
    // and the failure that rule prevents is a finish retreating a body that does
    // not exist, which on a stroked mark means stepping the STROKE, the mark
    // itself (a finish that reached line's series path took it to 2.18:1 light,
    // 1.26:1 dark).
    //
    // The CONVERSE is not a rule, and an earlier revision that made it one was
    // wrong about real members. (`state-chart`'s node was the third example
    // until 2026-09-24, when a status began to paint the node itself; its body
    // encodes `hue` now.) `map`'s bare basemap region
    // is painted `--map-base` and is the ground the choropleth sits on.
    // `journey-stage` paints one constant ground under a categorical `::before`
    // rail. A body that carries no datum is the freest case a finish has, not a
    // contradiction — which is why `encodes: "none"` covers both "no body" and
    // "a body that means nothing", and `paint` is what tells them apart.
    if (mark.paint === 'none' && mark.encodes !== 'none') {
      errors.push(
        `${at}: paint "none" says this mark has no body, but encodes ` +
        `${JSON.stringify(mark.encodes)} says the body carries a datum. A mark with nothing to ` +
        `paint encodes nothing in it — if the datum rides the STROKE or the TYPE, that is what ` +
        `paint "none" is recording, and encodes must be "none" too.`);
    }
    for (const key of Object.keys(mark)) {
      if (!['class', 'paint', 'encodes', 'bears'].includes(key)) {
        errors.push(`${at}.${key} is not part of a mark declaration.`);
      }
    }
  });
}

// The `projection` block — how a component's rendered visual travels OFF the slide.
//
// Validated here, at load, for the same reason `kernel` is: the generator's own
// input is these manifests, so a malformed block emits a catalog that throws at
// import time in five bundles with a stack pointing at generated code rather than
// at the manifest that caused it.
//
// The block exists because eight hand-maintained rosters were each encoding one
// fact under a different name, and FOUR of them held the identical twelve names
// (`CHART_TOKEN_COMPONENTS`, `KEYED_CHART_LAYOUTS`, `CLEAN_SVG_LAYOUTS`, and a
// third copy inside a `page.evaluate` in tools/export-chart-svg.js). None went
// red on omission — that is the whole defect. See
// engineering/decisions/2026-09-13-projected-rosters.md.
//
// NOT bucket-restricted, unlike `kernel`. `figure` describes a rendered visual,
// and four of the components that have one are outside the chart bucket
// (diagram, image, video, math); `data` describes substance, and three of those
// are in `evidence` / `statement`. A bucket restriction here would have
// re-created the roster it replaces.
const PROJECTION_FIGURES = SCHEMA_PROPS.projection.properties.figure.enum;

function checkProjection(m, prefix, errors) {
  if (m.projection === undefined) return;
  const p = m.projection;
  if (typeof p !== 'object' || p === null || Array.isArray(p)) {
    errors.push(`${prefix}projection must be an object if present`);
    return;
  }
  if (p.figure !== undefined && !PROJECTION_FIGURES.includes(p.figure)) {
    errors.push(
      `${prefix}projection.figure must be one of ${PROJECTION_FIGURES.join(' | ')} ` +
      `(got ${JSON.stringify(p.figure)})`);
  }
  if (p.data !== undefined && p.data !== true) {
    errors.push(
      `${prefix}projection.data is only ever true — absence is the default, so there ` +
      `is no negative to declare (got ${JSON.stringify(p.data)})`);
  }
  // `frame` is what a LISTENER is told the encoding MEANS, before any number — see the
  // schema's own description. Two rules, both of which a real draft got wrong:
  //
  //  · IT IS A CLAUSE, NOT A SENTENCE. Callers compose it ("Nine terms, sized by how
  //    often each came up") and capitalize it themselves, so a leading capital or a
  //    trailing period lands mid-track as "Nine terms, Sized by … .".
  //  · IT MEANS NOTHING WITHOUT DATA. A frame describes how VALUES are encoded, so a
  //    component that declares no `data` has nothing for it to frame, and the
  //    narration that reads it would never see the block.
  if (p.frame !== undefined) {
    if (typeof p.frame !== 'string' || !p.frame.trim()) {
      errors.push(`${prefix}projection.frame must be a non-empty string if present`);
    } else {
      if (/^[A-Z]/.test(p.frame)) {
        errors.push(
          `${prefix}projection.frame is a lowercase CLAUSE, not a sentence — the caller ` +
          `composes and capitalizes it (got ${JSON.stringify(p.frame)})`);
      }
      if (/[.!?]$/.test(p.frame.trim())) {
        errors.push(
          `${prefix}projection.frame must not end in terminal punctuation — the caller ` +
          `terminates it (got ${JSON.stringify(p.frame)})`);
      }
    }
    if (p.data !== true) {
      errors.push(
        `${prefix}projection.frame explains how this component encodes VALUES, so it ` +
        `needs projection.data — a component with no data has nothing to frame.`);
    }
  }
  if (p.figure === undefined && p.data === undefined) {
    errors.push(
      `${prefix}projection is empty. A block that declares neither figure nor data is ` +
      `read by nothing; delete it rather than leaving a stub that looks answered.`);
  }
  for (const key of Object.keys(p)) {
    if (key !== 'figure' && key !== 'data' && key !== 'frame') {
      errors.push(
        `${prefix}projection.${key} is not part of the block — it carries figure, data and frame only.`);
    }
  }
}

// which content axes _focus highlighting can address.
function checkFocusAxes(m, prefix, errors) {
  if (m.focusAxes !== undefined) {
    if (!Array.isArray(m.focusAxes)) {
      errors.push(`${prefix}focusAxes must be an array if present`);
    } else {
      for (const axis of m.focusAxes) {
        if (typeof axis !== 'string' || !axis) {
          errors.push(`${prefix}focusAxes entries must be non-empty strings (got ${JSON.stringify(axis)})`);
          continue;
        }
        if (!SUPPORTED_AXES.includes(axis)) {
          errors.push(`${prefix}focusAxes entry '${axis}' is not a focus axis. One of: ${SUPPORTED_AXES.join(', ')}`);
        }
      }
    }
  }
}

// Shared by capacity + density: the declared axis must be MEASURABLE in the
// component's own sample (or skeleton) — guards against an inert contract,
// e.g. axis 'col' on a layout authored as a nested list, where the counter
// always returns 0 and the warning can never fire.
function checkAxisMeasurable(m, axis, field, prefix, errors) {
  if (!COLLECTION_AXES.includes(axis)) return;
  const exemplar = typeof m.sample === 'string' && m.sample ? m.sample
    : (typeof m.skeleton === 'string' ? m.skeleton : '');
  if (exemplar && countPrimaryCollection(exemplar, axis) === 0) {
    errors.push(`${prefix}${field} '${axis}' is not measurable in the component's sample/skeleton — the ${field.split('.')[0]} rule could never fire. Check the axis matches how the layout is authored.`);
  }
}

function checkCapacityAxis(m, c, prefix, errors) {
  if (!COLLECTION_AXES.includes(c.axis)) {
    errors.push(`${prefix}capacity.axis must be one of: ${COLLECTION_AXES.join(', ')} (got ${JSON.stringify(c.axis)})`);
  } else if (Array.isArray(m.focusAxes) && m.focusAxes.length && !m.focusAxes.includes(c.axis)) {
    errors.push(`${prefix}capacity.axis '${c.axis}' must be one of the layout's focusAxes (${m.focusAxes.join(', ')})`);
  }
}

function checkCapacityBounds(c, prefix, errors) {
  const bounds = ['min', 'sweet', 'soft', 'hard'];
  for (const b of bounds) {
    if (c[b] !== undefined && (!Number.isInteger(c[b]) || c[b] < 1)) {
      errors.push(`${prefix}capacity.${b} must be a positive integer if present`);
    }
  }
  if (!Number.isInteger(c.soft) || !Number.isInteger(c.hard)) {
    errors.push(`${prefix}capacity requires integer soft and hard bounds`);
  }
  // min ≤ sweet ≤ soft ≤ hard among the bounds that are defined.
  const seq = bounds.map((b) => c[b]).filter((v) => Number.isInteger(v));
  for (let i = 1; i < seq.length; i++) {
    if (seq[i] < seq[i - 1]) {
      errors.push(`${prefix}capacity bounds must be non-decreasing (min ≤ sweet ≤ soft ≤ hard)`);
      break;
    }
  }
}

function checkCapacityEscalation(c, prefix, errors) {
  if (c.escalateTo !== undefined) {
    if (!Array.isArray(c.escalateTo) || c.escalateTo.length === 0) {
      errors.push(`${prefix}capacity.escalateTo must be a non-empty array of strings if present`);
    } else {
      for (const e of c.escalateTo) {
        if (typeof e !== 'string' || !e) {
          errors.push(`${prefix}capacity.escalateTo entries must be non-empty strings (got ${JSON.stringify(e)})`);
        }
      }
    }
  }
  if (c.note !== undefined && (typeof c.note !== 'string' || !c.note)) {
    errors.push(`${prefix}capacity.note must be a non-empty string if present`);
  }
}

// the content-capacity contract (element counts before overflow).
function checkCapacity(m, prefix, errors) {
  // Content-capacity contract — how many elements the layout holds along its
  // axis, so the linter can warn before an overflow (advisory). See
  // engineering/decisions/2026-06-17-content-capacity-contract.md.
  if (m.capacity === undefined) return;
  const c = m.capacity;
  if (typeof c !== 'object' || c === null || Array.isArray(c)) {
    errors.push(`${prefix}capacity must be an object if present`);
    return;
  }
  const allowed = new Set(Object.keys(SCHEMA_PROPS.capacity.properties));
  for (const k of Object.keys(c)) {
    if (!allowed.has(k)) errors.push(`${prefix}capacity has unknown key '${k}'`);
  }
  checkCapacityAxis(m, c, prefix, errors);
  checkCapacityBounds(c, prefix, errors);
  checkCapacityEscalation(c, prefix, errors);
  checkAxisMeasurable(m, c.axis, 'capacity.axis', prefix, errors);
}

// Per-element word counting (lib/authoring/prose-budgets.js elementWordCounts)
// is implemented for `item` and `row` only — reject the others so a density
// block can't validate yet silently produce zero suggestions forever.
const DENSITY_AXES = ['item', 'row'];

function checkDensityAxis(d, axis, prefix, errors) {
  if (d.axis !== undefined) {
    if (!COLLECTION_AXES.includes(d.axis)) {
      errors.push(`${prefix}density.axis must be one of: ${COLLECTION_AXES.join(', ')} (got ${JSON.stringify(d.axis)})`);
    } else if (!DENSITY_AXES.includes(d.axis)) {
      errors.push(`${prefix}density.axis '${d.axis}' is not yet counted — per-element word budgets are implemented for ${DENSITY_AXES.join(' / ')} only`);
    }
  } else if (!axis) {
    errors.push(`${prefix}density needs an axis — declare density.axis or a capacity block to inherit it from`);
  } else if (!DENSITY_AXES.includes(axis)) {
    errors.push(`${prefix}density.axis (inherited '${axis}' from capacity) is not yet counted — set density.axis to ${DENSITY_AXES.join(' / ')}, the implemented set`);
  }
}

function checkDensityBounds(d, prefix, errors) {
  for (const b of ['soft', 'hard']) {
    if (!Number.isInteger(d[b]) || d[b] < 1) {
      errors.push(`${prefix}density.${b} must be a positive integer (words per element)`);
    }
  }
  if (Number.isInteger(d.soft) && Number.isInteger(d.hard) && d.hard < d.soft) {
    errors.push(`${prefix}density bounds must satisfy soft ≤ hard (got soft ${d.soft}, hard ${d.hard})`);
  }
  if (d.note !== undefined && (typeof d.note !== 'string' || !d.note)) {
    errors.push(`${prefix}density.note must be a non-empty string if present`);
  }
}

// the prose-density budget (words per element).
function checkDensity(m, prefix, errors) {
  // Prose-density budget — how many WORDS each element along its axis gets
  // before the slide loses brevity (phase 2 of the capacity contract; advisory,
  // surfaced as a review suggestion). See
  // engineering/decisions/2026-06-30-prose-density-budget.md.
  if (m.density === undefined) return;
  const d = m.density;
  if (typeof d !== 'object' || d === null || Array.isArray(d)) {
    errors.push(`${prefix}density must be an object if present`);
    return;
  }
  const allowed = new Set(Object.keys(SCHEMA_PROPS.density.properties));
  for (const k of Object.keys(d)) {
    if (!allowed.has(k)) errors.push(`${prefix}density has unknown key '${k}'`);
  }
  // axis defaults to capacity.axis when omitted. NOTE: unlike capacity,
  // density does NOT require axis ∈ focusAxes — focusAxes governs _focus
  // HIGHLIGHTING (which can treat a ledger as table rows), while density
  // counts the MARKDOWN the author writes (a ledger authored as a bullet
  // list is the `item` axis). glossary is the canonical case: focusAxes
  // ['row'] but authored as items. The real guard is measurability below.
  const axis = d.axis !== undefined ? d.axis : m.capacity?.axis;
  checkDensityAxis(d, axis, prefix, errors);
  checkDensityBounds(d, prefix, errors);
  // The same inert-contract guard capacity uses, so a density block on an
  // axis the layout never authors can't ship.
  if (axis) checkAxisMeasurable(m, axis, 'density.axis', prefix, errors);
}

// named slot selectors/descriptions.
function checkSlots(m, prefix, errors) {
  if (m.slots !== undefined) {
    if (typeof m.slots !== 'object' || m.slots === null || Array.isArray(m.slots)) {
      errors.push(`${prefix}slots must be an object if present`);
    } else {
      for (const [slotName, slot] of Object.entries(m.slots)) {
        if (typeof slot !== 'object' || slot === null) {
          errors.push(`${prefix}slot "${slotName}" must be an object`);
          continue;
        }
        if (typeof slot.selector !== 'string' || !slot.selector) {
          errors.push(`${prefix}slot "${slotName}" must have a non-empty "selector" string`);
        }
        if (typeof slot.description !== 'string' || !slot.description) {
          errors.push(`${prefix}slot "${slotName}" must have a non-empty "description" string`);
        }
        if (slot.required !== undefined && typeof slot.required !== 'boolean') {
          errors.push(`${prefix}slot "${slotName}" required must be boolean if present`);
        }
      }
    }
  }
}

// whenToUse / antiPatterns / related — the picker guidance blocks.
function checkGuidance(m, prefix, errors) {
  if (m.whenToUse !== undefined) {
    if (!Array.isArray(m.whenToUse)) {
      errors.push(`${prefix}whenToUse must be an array if present`);
    } else {
      m.whenToUse.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`${prefix}whenToUse[${i}] must be an object`);
          return;
        }
        if (typeof entry.title !== 'string' || !entry.title) {
          errors.push(`${prefix}whenToUse[${i}].title must be a non-empty string`);
        }
        if (typeof entry.body !== 'string' || !entry.body) {
          errors.push(`${prefix}whenToUse[${i}].body must be a non-empty string`);
        }
      });
    }
  }
  if (m.antiPatterns !== undefined) {
    if (!Array.isArray(m.antiPatterns)) {
      errors.push(`${prefix}antiPatterns must be an array if present`);
    } else {
      m.antiPatterns.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`${prefix}antiPatterns[${i}] must be an object`);
          return;
        }
        if (typeof entry.title !== 'string' || !entry.title) {
          errors.push(`${prefix}antiPatterns[${i}].title must be a non-empty string`);
        }
        if (typeof entry.body !== 'string' || !entry.body) {
          errors.push(`${prefix}antiPatterns[${i}].body must be a non-empty string`);
        }
      });
    }
  }
  if (m.related !== undefined) {
    if (!Array.isArray(m.related)) {
      errors.push(`${prefix}related must be an array if present`);
    } else {
      m.related.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null) {
          errors.push(`${prefix}related[${i}] must be an object`);
          return;
        }
        if (typeof entry.name !== 'string' || !entry.name) {
          errors.push(`${prefix}related[${i}].name must be a non-empty string`);
        }
        if (typeof entry.when !== 'string' || !entry.when) {
          errors.push(`${prefix}related[${i}].when must be a non-empty string`);
        }
      });
    }
  }
}

// per-variant summary/sample docs (each key must be a declared variant).
function checkVariantDocs(m, prefix, errors) {
  // Total coverage (2026-07-05 Specimen Book decision §2.1): every declared
  // variant MUST have a variantDocs entry, or the gallery generator silently
  // drops its slide and the variant is documented nowhere. If the variant is
  // an axis default (variantAxes[].default), its entry documents the axis and
  // the toggle — see design/editorial.md §Specimen voice for the template.
  if (Array.isArray(m.variants) && m.variants.length) {
    const documented = m.variantDocs && typeof m.variantDocs === 'object' && !Array.isArray(m.variantDocs)
      ? new Set(Object.keys(m.variantDocs))
      : new Set();
    for (const v of m.variants) {
      if (!documented.has(v)) {
        errors.push(
          `${prefix}variants[] declares "${v}" but variantDocs has no "${v}" entry — every variant gets a gallery slide. ` +
          `Add variantDocs."${v}" = { summary: <one sentence: what the variant changes and when to reach for it>, sample: <full slide markdown demonstrating it> } ` +
          `(template + interim voice rule: design/editorial.md §Specimen voice)`
        );
      }
    }
  }
  if (m.variantDocs !== undefined) {
    if (typeof m.variantDocs !== 'object' || m.variantDocs === null || Array.isArray(m.variantDocs)) {
      errors.push(`${prefix}variantDocs must be an object if present`);
    } else {
      const declaredVariants = new Set(Array.isArray(m.variants) ? m.variants : []);
      for (const [vname, vdoc] of Object.entries(m.variantDocs)) {
        if (!declaredVariants.has(vname)) {
          errors.push(`${prefix}variantDocs key "${vname}" is not in variants[] — add it to variants or remove it from variantDocs`);
        }
        if (typeof vdoc !== 'object' || vdoc === null) {
          errors.push(`${prefix}variantDocs."${vname}" must be an object`);
          continue;
        }
        if (typeof vdoc.summary !== 'string' || !vdoc.summary) {
          errors.push(`${prefix}variantDocs."${vname}".summary must be a non-empty string`);
        }
        if (typeof vdoc.sample !== 'string' || !vdoc.sample) {
          errors.push(`${prefix}variantDocs."${vname}".sample must be a non-empty string`);
        }
        if (vdoc.label !== undefined && (typeof vdoc.label !== 'string' || !vdoc.label)) {
          errors.push(`${prefix}variantDocs."${vname}".label must be a non-empty string if present`);
        }
      }
    }
  }
}

// commonMistakes / variantDecisionRule / dataShapeGuidance — the per-
// component agent-contract fields (2026-07-26 fine-grained-agent-docs pilot).
// Authoring-time (not selection-time) guidance: see manifest.schema.json for
// the commonMistakes/antiPatterns distinction.
function checkAgentContract(m, prefix, errors) {
  if (m.commonMistakes !== undefined) {
    if (!Array.isArray(m.commonMistakes)) {
      errors.push(`${prefix}commonMistakes must be an array if present`);
    } else {
      // Track by mistake text (case/whitespace-insensitive): the docs-site
      // view keys its <li> on this string, so a duplicate isn't just
      // redundant prose — it's a React key collision waiting to happen.
      const seenMistakes = new Set();
      m.commonMistakes.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          errors.push(`${prefix}commonMistakes[${i}] must be an object`);
          return;
        }
        if (typeof entry.mistake !== 'string' || !entry.mistake.trim()) {
          errors.push(`${prefix}commonMistakes[${i}].mistake must be a non-empty string`);
        } else {
          const key = entry.mistake.trim().toLowerCase();
          if (seenMistakes.has(key)) {
            errors.push(`${prefix}commonMistakes[${i}].mistake is a duplicate of an earlier entry`);
          } else {
            seenMistakes.add(key);
          }
        }
        if (typeof entry.fix !== 'string' || !entry.fix.trim()) {
          errors.push(`${prefix}commonMistakes[${i}].fix must be a non-empty string`);
        }
      });
    }
  }
  if (m.variantDecisionRule !== undefined) {
    if (!Array.isArray(m.variantDecisionRule)) {
      errors.push(`${prefix}variantDecisionRule must be an array if present`);
    } else {
      const declaredVariants = new Set(['default', ...(Array.isArray(m.variants) ? m.variants : [])]);
      const seenVariants = new Set();
      m.variantDecisionRule.forEach((entry, i) => {
        if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
          errors.push(`${prefix}variantDecisionRule[${i}] must be an object`);
          return;
        }
        if (typeof entry.variant !== 'string' || !entry.variant.trim()) {
          errors.push(`${prefix}variantDecisionRule[${i}].variant must be a non-empty string`);
        } else if (!declaredVariants.has(entry.variant)) {
          errors.push(`${prefix}variantDecisionRule[${i}].variant "${entry.variant}" is not "default" or in variants[]`);
        } else if (seenVariants.has(entry.variant)) {
          errors.push(`${prefix}variantDecisionRule[${i}].variant "${entry.variant}" is a duplicate — every variant gets at most one decision-rule entry`);
        } else {
          seenVariants.add(entry.variant);
        }
        if (typeof entry.useWhen !== 'string' || !entry.useWhen.trim()) {
          errors.push(`${prefix}variantDecisionRule[${i}].useWhen must be a non-empty string`);
        }
      });
    }
  }
  if (m.dataShapeGuidance !== undefined) {
    if (!Array.isArray(m.dataShapeGuidance)) {
      errors.push(`${prefix}dataShapeGuidance must be an array if present`);
    } else {
      // Same rationale as commonMistakes above: the docs-site view keys
      // its <li> on this string.
      const seenRules = new Set();
      m.dataShapeGuidance.forEach((entry, i) => {
        if (typeof entry !== 'string' || !entry.trim()) {
          errors.push(`${prefix}dataShapeGuidance[${i}] must be a non-empty string`);
        } else {
          const key = entry.trim().toLowerCase();
          if (seenRules.has(key)) {
            errors.push(`${prefix}dataShapeGuidance[${i}] is a duplicate of an earlier entry`);
          } else {
            seenRules.add(key);
          }
        }
      });
    }
  }
}

// variant grouping axes for the docs (members must be declared variants).
function checkVariantAxes(m, prefix, errors) {
  if (m.variantAxes !== undefined) {
    if (!Array.isArray(m.variantAxes)) {
      errors.push(`${prefix}variantAxes must be an array if present`);
    } else {
      const declared = new Set(Array.isArray(m.variants) ? m.variants : []);
      for (const ax of m.variantAxes) {
        if (typeof ax !== 'object' || ax === null) {
          errors.push(`${prefix}variantAxes entries must be objects`);
          continue;
        }
        if (typeof ax.label !== 'string' || !ax.label) {
          errors.push(`${prefix}variantAxes[].label must be a non-empty string`);
        }
        if (!Array.isArray(ax.members) || ax.members.length === 0) {
          errors.push(`${prefix}variantAxes."${ax.label}".members must be a non-empty array`);
        } else {
          for (const mem of ax.members) {
            if (!declared.has(mem)) {
              errors.push(`${prefix}variantAxes."${ax.label}" member "${mem}" is not in variants[]`);
            }
          }
          if (ax.default !== undefined && !ax.members.includes(ax.default)) {
            errors.push(`${prefix}variantAxes."${ax.label}".default "${ax.default}" is not one of its members`);
          }
        }
      }
    }
  }
}

// anatomyBlock, sample, the transform DSL rules, stressSample, galleryAuthored.
function checkSampleFields(m, prefix, errors) {
  if (m.anatomyBlock !== undefined) {
    if (typeof m.anatomyBlock !== 'string' || !m.anatomyBlock) {
      errors.push(`${prefix}anatomyBlock must be a non-empty string if present`);
    } else if (!/^[a-zA-Z][a-zA-Z0-9-]*$/.test(m.anatomyBlock)) {
      errors.push(`${prefix}anatomyBlock must match /^[a-zA-Z][a-zA-Z0-9-]*$/ (got ${JSON.stringify(m.anatomyBlock)})`);
    }
  }
  if (m.sample !== undefined && (typeof m.sample !== 'string' || !m.sample)) {
    errors.push(`${prefix}sample must be a non-empty string if present`);
  }
  // Declarative structural-transform rules (the transform DSL). Fail-closed: a
  // single unsafe/unknown construct rejects the manifest, surfacing the DSL gate's
  // own messages. (Authoritative safety lives in validateTransform, not this file.)
  if (m.transform !== undefined) {
    const { ok, errors: tErrors } = validateTransform(m.transform);
    if (!ok) for (const e of tErrors) errors.push(`${prefix}transform: ${e}`);
  }
  // stressSample is RETIRED (Specimen Book migration complete, PR 4): every
  // manifest carries stressDoc { summary, sample } or a reasoned exemption.
  if (m.stressSample !== undefined) {
    errors.push(`${prefix}stressSample is retired — use stressDoc { summary, sample } (2026-07-05 Specimen Book decision §2.2)`);
  }
  // stressDoc { summary, sample } — the target spelling; stressSample is the
  // deprecated alias accepted during the voice migration (2026-07-05 decision).
  if (m.stressDoc !== undefined) {
    if (typeof m.stressDoc !== 'object' || m.stressDoc === null || Array.isArray(m.stressDoc)) {
      errors.push(`${prefix}stressDoc must be an object { summary, sample } if present`);
    } else {
      if (typeof m.stressDoc.summary !== 'string' || !m.stressDoc.summary) {
        errors.push(`${prefix}stressDoc.summary must be a non-empty string (one sentence naming the limit shown)`);
      }
      if (typeof m.stressDoc.sample !== 'string' || !m.stressDoc.sample) {
        errors.push(`${prefix}stressDoc.sample must be a non-empty string`);
      }
    }
  }
  // Graduated gate (Specimen Book §2.2, PR 4 — 0 violators by construction):
  // a declared capacity requires the stress slide that demonstrates it.
  if (m.capacity !== undefined && m.stressDoc === undefined) {
    errors.push(`${prefix}capacity is declared but stressDoc is missing — every capacity-bearing component ships its stress slide (design/editorial.md §Specimen voice)`);
  }
  if (m.specimenVoice !== undefined && typeof m.specimenVoice !== 'boolean') {
    errors.push(`${prefix}specimenVoice must be a boolean if present`);
  }
  if (m.galleryAuthored !== undefined && typeof m.galleryAuthored !== 'boolean') {
    errors.push(`${prefix}galleryAuthored must be a boolean if present`);
  }
}

// card-style layouts: samples/skeletons must use nested-list form, never inline '- **Title.** body'.
function checkCardStyleForms(m, prefix, errors) {
  // Card-style layouts forbid inline `- **Title.** body` format in samples
  // (body text inherits font-weight:700 from the parent li). Use nested-list
  // format instead: `- Title\n  - body`. See CARD_STYLE_LAYOUTS docstring.
  if (CARD_STYLE_LAYOUTS.includes(m.name)) {
    // String-guard, not truthy-guard: a non-string sample (already reported by
    // checkProse/checkSampleFields) must not crash the form lint (lint-core
    // assumes strings).
    const inlineTitle = (s) => (typeof s === 'string' && s ? findInlineTitleBodyLine(s) || findOrderedInlineTitleBodyLine(s) : null);
    const offender = inlineTitle(m.sample);
    if (offender) {
      errors.push(
        `${prefix}sample uses inline '- **Title.** body' format on a card-style ` +
        `layout — body inherits parent li's bold. Use nested-list format ` +
        `('- Title\\n  - body') instead. First offending line: ${JSON.stringify(offender)}`,
      );
    }
    // The skeleton is the scaffolder template AND the docs "Authoring" block,
    // so it must teach the same nested form the sample/CSS require — not the
    // inline form. (Historically only `sample` was linted, so skeletons drifted.)
    const skelOffender = inlineTitle(m.skeleton);
    if (skelOffender) {
      errors.push(
        `${prefix}skeleton uses inline '- **Title.** body' format on a card-style ` +
        `layout — the scaffolder + docs Authoring block would teach the wrong form. ` +
        `Use nested-list format ('- Title\\n  - body'). First offending line: ${JSON.stringify(skelOffender)}`,
      );
    }
    if (m.variantDocs) {
      for (const [vname, vdoc] of Object.entries(m.variantDocs)) {
        const vOffender = inlineTitle(vdoc?.sample);
        if (vOffender) {
          errors.push(
            `${prefix}variantDocs."${vname}".sample uses inline format on a ` +
            `card-style layout. First offending line: ${JSON.stringify(vOffender)}`,
          );
        }
      }
    }
  }
}

// ledger/numbered layouts: samples must use the numbered form, not an unordered bold lead-in.
function checkLedgerForms(m, prefix, errors) {
  // Ledger / numbered layouts (ol > li body slot) forbid the UNORDERED
  // `- **Title.** body` shape in samples — they want the numbered ledger form
  // (`1. Name\n   - body`). The unordered bold lead-in is wrong list type AND
  // the body inherits the title's bold. See LEDGER_OL_LAYOUTS docstring.
  if (LEDGER_OL_LAYOUTS.includes(m.name)) {
    const samples = [['sample', m.sample], ['skeleton', m.skeleton]];
    if (m.variantDocs) {
      for (const [vname, vdoc] of Object.entries(m.variantDocs)) {
        samples.push([`variantDocs."${vname}".sample`, vdoc?.sample]);
      }
    }
    for (const [label, text] of samples) {
      const offender = typeof text === 'string' && text ? findInlineTitleBodyLine(text) : null;
      if (offender) {
        errors.push(
          `${prefix}${label} uses inline '- **Title.** body' on a ledger/numbered ` +
          `layout ('${m.name}') — this layout wants a numbered list ('1. Name\\n   - body'), ` +
          `not an unordered bold lead-in. First offending line: ${JSON.stringify(offender)}`,
        );
      }
    }
  }
}

// statement ordered-list layouts: no **bold** inside ordered items (the counter grid splits it).
function checkStatementOlForms(m, prefix, errors) {
  // Statement-style ordered-list layouts forbid `**bold**` inside the
  // ordered items — the counter grid splits a <strong> span out of the
  // statement, mangling the row. Use plain declarative statements.
  if (STATEMENT_OL_LAYOUTS.includes(m.name)) {
    const offender = typeof m.sample === 'string' && m.sample ? findBoldOrderedStatement(m.sample) : null;
    if (offender) {
      errors.push(
        `${prefix}sample uses '**bold**' inside an ordered-list statement on '${m.name}' — ` +
        `its counter layout renders each item as a grid row, so a <strong> span splits the ` +
        `statement across cells. Use plain declarative statements. First offending line: ${JSON.stringify(offender)}`,
      );
    }
    if (m.variantDocs) {
      for (const [vname, vdoc] of Object.entries(m.variantDocs)) {
        const vOffender = typeof vdoc?.sample === 'string' && vdoc.sample ? findBoldOrderedStatement(vdoc.sample) : null;
        if (vOffender) {
          errors.push(
            `${prefix}variantDocs."${vname}".sample uses '**bold**' in an ordered-list statement ` +
            `on '${m.name}'. Use plain statements. First offending line: ${JSON.stringify(vOffender)}`,
          );
        }
      }
    }
  }
}

// panel-split layouts: every right-panel item needs a nested body for slotLabelLift.
function checkSplitSlotForms(m, prefix, errors) {
  // Panel-split layouts require each right-panel list item to carry a nested
  // body — slotLabelLift only bolds the title when a nested body delimits it.
  // A bodyless top-level item (inline `- Title. body` or bare `- Title`) gets
  // no <strong> and renders as flat body text. Check sample + skeleton.
  if (SPLIT_SLOT_LAYOUTS.includes(m.name)) {
    for (const [field, src] of [['sample', m.sample], ['skeleton', m.skeleton]]) {
      const offender = typeof src === 'string' && src ? findSplitBodylessItem(src) : null;
      if (offender) {
        errors.push(
          `${prefix}${field} has a top-level list item with no nested body on split ` +
          `layout '${m.name}' — slotLabelLift only bolds the title when a nested body ` +
          `delimits it, so this renders as flat text. Use nested format ` +
          `('- Title\\n  - body'). First offending line: ${JSON.stringify(offender)}`,
        );
      }
    }
  }
}

// the Fit Ladder carousel recipe (schema `split`) — strategy must be a real
// carouselize() splitter; historically unvalidated, so a typo (or an
// Object.prototype name) fell through silently at render time.
function checkSplit(m, prefix, errors) {
  if (m.split === undefined) return;
  const spec = SCHEMA_PROPS.split;
  const sp = m.split;
  if (typeof sp !== 'object' || sp === null || Array.isArray(sp)) {
    errors.push(`${prefix}split must be an object if present`);
    return;
  }
  const allowed = new Set(Object.keys(spec.properties));
  for (const k of Object.keys(sp)) {
    if (!allowed.has(k)) errors.push(`${prefix}split has unknown key '${k}' (allowed: ${Object.keys(spec.properties).join(', ')})`);
  }
  const strategies = spec.properties.strategy.enum;
  if (!strategies.includes(sp.strategy)) {
    errors.push(`${prefix}split.strategy must be one of: ${strategies.join(', ')} (got ${JSON.stringify(sp.strategy)})`);
  }
  if (sp.axis !== undefined && !COLLECTION_AXES.includes(sp.axis)) {
    errors.push(`${prefix}split.axis must be one of: ${COLLECTION_AXES.join(', ')} (got ${JSON.stringify(sp.axis)})`);
  }
  if (sp.perPage !== undefined && (!Number.isInteger(sp.perPage) || sp.perPage < 1)) {
    errors.push(`${prefix}split.perPage must be a positive integer if present`);
  }
  for (const f of ['intro', 'family', 'note']) {
    if (sp[f] !== undefined && (typeof sp[f] !== 'string' || !sp[f])) {
      errors.push(`${prefix}split.${f} must be a non-empty string if present`);
    }
  }
  if (sp.roles !== undefined) {
    if (!Array.isArray(sp.roles)) errors.push(`${prefix}split.roles must be an array if present`);
    else for (const r of sp.roles) {
      if (typeof r !== 'string' || !r) errors.push(`${prefix}split.roles entries must be non-empty strings (got ${JSON.stringify(r)})`);
    }
  }
}

// the schema declares additionalProperties:false — enforce it. Any top-level
// key outside manifest.schema.json's properties is a typo or an undeclared
// contract extension; extend the SCHEMA first (it is the source of truth).
function checkUnknownKeys(m, prefix, errors) {
  for (const k of Object.keys(m)) {
    if (!Object.hasOwn(SCHEMA_PROPS, k)) {
      errors.push(`${prefix}unknown manifest key '${k}' — not in manifest.schema.json (the schema is the source of truth; add the field there first)`);
    }
  }
}

const MANIFEST_CHECKS = [
  checkIdentity,
  checkTags,
  checkProse,
  checkVariants,
  checkFamilies,
  checkDataCompletion,
  checkKernel,
  checkProjection,
  checkFocusAxes,
  checkCapacity,
  checkDensity,
  checkSlots,
  checkGuidance,
  checkVariantDocs,
  checkAgentContract,
  checkVariantAxes,
  checkSampleFields,
  checkCardStyleForms,
  checkLedgerForms,
  checkStatementOlForms,
  checkSplitSlotForms,
  checkSplit,
  checkUnknownKeys,
];

/**
 * Validate a parsed manifest object. Returns an array of human-readable
 * error strings; empty array means valid. `source` is included in error
 * messages when provided (e.g. file path).
 */
function validate(m, source) {
  const prefix = source ? `${source}: ` : '';
  if (typeof m !== 'object' || m === null) {
    return [`${prefix}manifest must be an object`];
  }
  const errors = [];
  for (const check of MANIFEST_CHECKS) check(m, prefix, errors);
  return errors;
}

/**
 * Load and validate a single manifest from a file path. Throws on
 * invalid JSON or failed validation. Returns the manifest object.
 */
function loadOne(filePath) {
  const text = fs.readFileSync(filePath, 'utf8');
  let m;
  try {
    m = JSON.parse(text);
  } catch (e) {
    throw new Error(`${filePath}: invalid JSON — ${e.message}`);
  }
  const source = path.relative(process.cwd(), filePath);
  const errors = validate(m, source);
  if (errors.length) {
    throw new Error(`Invalid manifest:\n  ${errors.join('\n  ')}`);
  }
  return m;
}

/**
 * Load every manifest in the given directory (defaults to this directory).
 * Accepts three shapes:
 *   1. Flat:           lib/components/<name>.json
 *   2. Per-component:  lib/components/<name>/<name>.manifest.json
 *                      lib/components/<name>/manifest.json (pre-Phase 1)
 *   3. Bucket-nested:  lib/components/<bucket>/<name>/<name>.manifest.json
 *
 * The bucket-nested shape (added in Phase 1) groups components by their
 * `bucket` field. Directories whose name matches a BUCKETS value are
 * treated as bucket containers; the loader recurses one level into them.
 *
 * Returns an array sorted by name. Throws if any manifest fails
 * validation or if two manifests share the same name (which would
 * happen if both shapes exist for the same component during migration).
 */
function loadAll(dir) {
  const root = dir || __dirname;
  const out = [];
  const seen = new Set();
  // The walk is the package spine's (lib/packages/fs.js `listComponentFolders`), so the
  // build's package index and every `loadAll` caller agree on which folders are
  // components. A directory named for a known bucket is walked as a bucket; any other
  // folder at the root is read as a component folder (the fixture and legacy shapes).
  for (const f of listComponentFolders(root, { isBucket: (name) => BUCKETS.includes(name) })) {
    const m = loadOne(f.manifest);
    if (seen.has(m.name)) {
      throw new Error(`duplicate manifest name: ${m.name} (in ${f.label})`);
    }
    seen.add(m.name);
    out.push(m);
  }

  out.sort((a, b) => a.name.localeCompare(b.name));
  return out;
}

/**
 * Group an array of manifests by function family. Returns an object
 * keyed by function name, with arrays of manifests as values. Functions
 * with no manifests are present as empty arrays — useful for the
 * scaffolder's `--list` output, which prints every family.
 */
function groupByFunction(manifests) {
  const out = Object.create(null);
  for (const fn of FUNCTIONS) out[fn] = [];
  for (const m of manifests) out[m.function].push(m);
  return out;
}

/**
 * Group an array of manifests by disk bucket. Returns an object keyed
 * by bucket name, with arrays of manifests as values. Buckets with no
 * manifests are present as empty arrays. Used by the bucket-gallery
 * generator and by tools that want to enumerate the disk layout
 * (independent of the audience-function taxonomy).
 */
function groupByBucket(manifests) {
  const out = Object.create(null);
  for (const b of BUCKETS) out[b] = [];
  for (const m of manifests) {
    const bucket = manifestBucket(m);
    if (!out[bucket]) out[bucket] = [];
    out[bucket].push(m);
  }
  return out;
}

module.exports = {
  FUNCTIONS,
  BUCKETS,
  FORMS,
  SUBSTANCES,
  SUPPORTED_AXES,
  COLLECTION_AXES,
  MIXED_SUBSTANCE,
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
  BASE_MODIFIERS,
  FRAME_MODIFIERS,
  ANIMATION_MODIFIERS,
  MODIFIER_GROUPS,
  UNIVERSAL_MODIFIER_TOKENS,
  expandExcludes,
  excludedModifiers,
  surfaceOf,
  FAMILY_MODIFIERS,
  FAMILY_MODIFIER_TOKENS,
  FAMILY_NAMES,
  OPT_IN_FAMILY_NAMES,
  familyModifiersFor,
  TAG_GROUPS,
  TAGS,
  TAGS_MIN,
  TAGS_MAX,
  CARD_STYLE_LAYOUTS,
  LEDGER_OL_LAYOUTS,
  STATEMENT_OL_LAYOUTS,
  SPLIT_SLOT_LAYOUTS,
  NUMBER_SLOT_LAYOUTS,
  validate,
  effectiveVariants,
  findInlineTitleBodyLine,
  findOrderedInlineTitleBodyLine,
  findBoldOrderedStatement,
  findSplitBodylessItem,
  loadOne,
  loadAll,
  groupByFunction,
  groupByBucket,
  manifestBucket,
};
