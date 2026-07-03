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
 *   excludes     array   — (optional) semi-universals this layout opts
 *                          out of (must be a subset of
 *                          SEMI_UNIVERSAL_VARIANTS).
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
 *                          Each value: {label?, caption, sample}.
 *   anatomyBlock string  — (optional) ID into the canonical ASCII catalog
 *                          (tools/ascii-preview.py build). The generator
 *                          resolves it; the manifest never carries the
 *                          drawing itself.
 *   sample       string  — (optional) full slide markdown for the default-
 *                          appearance slide of <name>.gallery.md (real prose,
 *                          unlike `skeleton` which is a placeholder template).
 *
 * The formal JSON Schema lives at lib/components/manifest.schema.json.
 */



const fs = require('node:fs');
const path = require('node:path');

const FUNCTIONS = Object.freeze([
  'anchor',
  'statement',
  'inventory',
  'comparison',
  'progression',
  'evidence',
  'imagery',
]);

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
const BUCKETS = Object.freeze([
  ...FUNCTIONS,
  'chart',
  'diagram',
  'math',
  'code',
  'legal',
  'connect',
]);

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

const FORMS = Object.freeze([
  'bookend',
  'divider',
  'canvas',
  'grid',
  'stack',
  'ledger',
  'panel',
  'matrix',
  'scatter',
  'spatial',
  'timeline',
  'split',
]);

const SUBSTANCES = Object.freeze(['prose', 'structure', 'series', 'graph']);

// The focusable axes a layout may declare via the manifest `focusAxes` field —
// MUST mirror SUPPORTED_AXES in lib/transformers/focus.js (the resolver) and
// FOCUS_AXES in lib/authoring/lint-core.js. A layout opts into per-axis focus
// highlighting by listing the axes its body structure supports (a `<table>` →
// row/col/cell, a top-level list/grid → item, a code block → line). The
// autocomplete-parity test gates every declared value against this set.
const SUPPORTED_AXES = Object.freeze(['item', 'row', 'col', 'cell', 'line']);

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
  chrome: Object.freeze(['silent', 'no-header', 'no-footer', 'no-paginate', 'form', 'no-form', 'no-progress']),
  social: Object.freeze(['safe']),
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
const SEMI_UNIVERSAL_VARIANTS = Object.freeze(['compact', 'loose', 'accent', 'claim-bleed']);

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
  tone: Object.freeze(['tone-pass', 'tone-warn', 'tone-fail', 'tone-skip']),
  scale: Object.freeze(['scale-l', 'scale-xl', 'scale-2xl']),
  period: Object.freeze(['with-period', 'no-period']),
  density: Object.freeze(['compact', 'loose']),
  claim: Object.freeze(['claim-framed', 'claim-quiet', 'claim-hero', 'claim-bleed']),
});

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
  const excludes = new Set(Array.isArray(manifest.excludes) ? manifest.excludes : []);
  const out = new Set();
  for (const v of UNIVERSAL_VARIANTS) out.add(v);
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

/**
 * Validate a parsed manifest object. Returns an array of human-readable
 * error strings; empty array means valid. `source` is included in error
 * messages when provided (e.g. file path).
 */
function validate(m, source) {
  const errors = [];
  const prefix = source ? `${source}: ` : '';
  if (typeof m !== 'object' || m === null) {
    return [`${prefix}manifest must be an object`];
  }
  if (typeof m.name !== 'string' || !m.name) {
    errors.push(`${prefix}name must be a non-empty string`);
  } else if (!/^[a-z][a-z0-9-]*$/.test(m.name)) {
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
  if (typeof m.description !== 'string' || !m.description) {
    errors.push(`${prefix}description must be a non-empty string`);
  }
  if (typeof m.skeleton !== 'string' || !m.skeleton) {
    errors.push(`${prefix}skeleton must be a non-empty string`);
  }
  if (m.purpose !== undefined && (typeof m.purpose !== 'string' || !m.purpose)) {
    errors.push(`${prefix}purpose must be a non-empty string if present`);
  }
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
        if (!SEMI_UNIVERSAL_VARIANTS.includes(v)) {
          errors.push(`${prefix}excludes entry '${v}' must be one of the semi-universal variants: ${SEMI_UNIVERSAL_VARIANTS.join(', ')}`);
        }
      }
    }
  }
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
  if (m.dataCompletion !== undefined && typeof m.dataCompletion !== 'boolean') {
    errors.push(`${prefix}dataCompletion must be a boolean if present`);
  }
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
  // Content-capacity contract — how many elements the layout holds along its
  // axis, so the linter can warn before an overflow (advisory). See
  // engineering/decisions/2026-06-17-content-capacity-contract.md.
  if (m.capacity !== undefined) {
    const c = m.capacity;
    if (typeof c !== 'object' || c === null || Array.isArray(c)) {
      errors.push(`${prefix}capacity must be an object if present`);
    } else {
      const allowed = new Set(['axis', 'min', 'sweet', 'soft', 'hard', 'escalateTo', 'note']);
      for (const k of Object.keys(c)) {
        if (!allowed.has(k)) errors.push(`${prefix}capacity has unknown key '${k}'`);
      }
      if (!SUPPORTED_AXES.includes(c.axis)) {
        errors.push(`${prefix}capacity.axis must be one of: ${SUPPORTED_AXES.join(', ')} (got ${JSON.stringify(c.axis)})`);
      } else if (Array.isArray(m.focusAxes) && m.focusAxes.length && !m.focusAxes.includes(c.axis)) {
        errors.push(`${prefix}capacity.axis '${c.axis}' must be one of the layout's focusAxes (${m.focusAxes.join(', ')})`);
      }
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
      // The declared axis must be MEASURABLE in the component's own sample (or
      // skeleton) — guards against an inert contract, e.g. axis 'col' on a
      // layout authored as a nested list, where the counter always returns 0 and
      // the warning can never fire. Only meaningful for a well-formed axis.
      if (SUPPORTED_AXES.includes(c.axis)) {
        const exemplar = typeof m.sample === 'string' && m.sample ? m.sample
          : (typeof m.skeleton === 'string' ? m.skeleton : '');
        if (exemplar && countPrimaryCollection(exemplar, c.axis) === 0) {
          errors.push(`${prefix}capacity.axis '${c.axis}' is not measurable in the component's sample/skeleton — the capacity rule could never fire. Check the axis matches how the layout is authored.`);
        }
      }
    }
  }
  // Prose-density budget — how many WORDS each element along its axis gets
  // before the slide loses brevity (phase 2 of the capacity contract; advisory,
  // surfaced as a review suggestion). See
  // engineering/decisions/2026-06-30-prose-density-budget.md.
  if (m.density !== undefined) {
    const d = m.density;
    if (typeof d !== 'object' || d === null || Array.isArray(d)) {
      errors.push(`${prefix}density must be an object if present`);
    } else {
      const allowed = new Set(['axis', 'soft', 'hard', 'note']);
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
      // Per-element word counting (lib/authoring/prose-budgets.js elementWordCounts)
      // is implemented for `item` and `row` only — reject the others so a density
      // block can't validate yet silently produce zero suggestions forever.
      const DENSITY_AXES = ['item', 'row'];
      if (d.axis !== undefined) {
        if (!SUPPORTED_AXES.includes(d.axis)) {
          errors.push(`${prefix}density.axis must be one of: ${SUPPORTED_AXES.join(', ')} (got ${JSON.stringify(d.axis)})`);
        } else if (!DENSITY_AXES.includes(d.axis)) {
          errors.push(`${prefix}density.axis '${d.axis}' is not yet counted — per-element word budgets are implemented for ${DENSITY_AXES.join(' / ')} only`);
        }
      } else if (!axis) {
        errors.push(`${prefix}density needs an axis — declare density.axis or a capacity block to inherit it from`);
      } else if (!DENSITY_AXES.includes(axis)) {
        errors.push(`${prefix}density.axis (inherited '${axis}' from capacity) is not yet counted — set density.axis to ${DENSITY_AXES.join(' / ')}, the implemented set`);
      }
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
      // The axis must be MEASURABLE in the component's own sample/skeleton — the
      // same inert-contract guard capacity uses, so a density block on an axis the
      // layout never authors can't ship.
      if (axis && SUPPORTED_AXES.includes(axis)) {
        const exemplar = typeof m.sample === 'string' && m.sample ? m.sample
          : (typeof m.skeleton === 'string' ? m.skeleton : '');
        if (exemplar && countPrimaryCollection(exemplar, axis) === 0) {
          errors.push(`${prefix}density.axis '${axis}' is not measurable in the component's sample/skeleton — the density rule could never fire. Check the axis matches how the layout is authored.`);
        }
      }
    }
  }
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
        if (typeof vdoc.caption !== 'string' || !vdoc.caption) {
          errors.push(`${prefix}variantDocs."${vname}".caption must be a non-empty string`);
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
  if (m.stressSample !== undefined && (typeof m.stressSample !== 'string' || !m.stressSample)) {
    errors.push(`${prefix}stressSample must be a non-empty string if present`);
  }
  if (m.galleryAuthored !== undefined && typeof m.galleryAuthored !== 'boolean') {
    errors.push(`${prefix}galleryAuthored must be a boolean if present`);
  }
  // Card-style layouts forbid inline `- **Title.** body` format in samples
  // (body text inherits font-weight:700 from the parent li). Use nested-list
  // format instead: `- Title\n  - body`. See CARD_STYLE_LAYOUTS docstring.
  if (CARD_STYLE_LAYOUTS.includes(m.name)) {
    const inlineTitle = (s) => (s ? findInlineTitleBodyLine(s) || findOrderedInlineTitleBodyLine(s) : null);
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
      const offender = text ? findInlineTitleBodyLine(text) : null;
      if (offender) {
        errors.push(
          `${prefix}${label} uses inline '- **Title.** body' on a ledger/numbered ` +
          `layout ('${m.name}') — this layout wants a numbered list ('1. Name\\n   - body'), ` +
          `not an unordered bold lead-in. First offending line: ${JSON.stringify(offender)}`,
        );
      }
    }
  }

  // Statement-style ordered-list layouts forbid `**bold**` inside the
  // ordered items — the counter grid splits a <strong> span out of the
  // statement, mangling the row. Use plain declarative statements.
  if (STATEMENT_OL_LAYOUTS.includes(m.name)) {
    const offender = m.sample ? findBoldOrderedStatement(m.sample) : null;
    if (offender) {
      errors.push(
        `${prefix}sample uses '**bold**' inside an ordered-list statement on '${m.name}' — ` +
        `its counter layout renders each item as a grid row, so a <strong> span splits the ` +
        `statement across cells. Use plain declarative statements. First offending line: ${JSON.stringify(offender)}`,
      );
    }
    if (m.variantDocs) {
      for (const [vname, vdoc] of Object.entries(m.variantDocs)) {
        const vOffender = vdoc?.sample ? findBoldOrderedStatement(vdoc.sample) : null;
        if (vOffender) {
          errors.push(
            `${prefix}variantDocs."${vname}".sample uses '**bold**' in an ordered-list statement ` +
            `on '${m.name}'. Use plain statements. First offending line: ${JSON.stringify(vOffender)}`,
          );
        }
      }
    }
  }

  // Panel-split layouts require each right-panel list item to carry a nested
  // body — slotLabelLift only bolds the title when a nested body delimits it.
  // A bodyless top-level item (inline `- Title. body` or bare `- Title`) gets
  // no <strong> and renders as flat body text. Check sample + skeleton.
  if (SPLIT_SLOT_LAYOUTS.includes(m.name)) {
    for (const [field, src] of [['sample', m.sample], ['skeleton', m.skeleton]]) {
      const offender = src ? findSplitBodylessItem(src) : null;
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

  function ingest(manifestPath, label) {
    const m = loadOne(manifestPath);
    if (seen.has(m.name)) {
      throw new Error(`duplicate manifest name: ${m.name} (in ${label})`);
    }
    seen.add(m.name);
    out.push(m);
  }

  function tryManifestInDir(parentDir, name) {
    // Dotted convention (Phase 1+): <parent>/<name>/<name>.manifest.json
    const dotted = path.join(parentDir, name, `${name}.manifest.json`);
    // Legacy folder shape pre-Phase 1: <parent>/<name>/manifest.json
    const legacy = path.join(parentDir, name, 'manifest.json');
    if (fs.existsSync(dotted)) return { path: dotted, label: `${name}/${name}.manifest.json` };
    if (fs.existsSync(legacy)) return { path: legacy, label: `${name}/manifest.json` };
    return null;
  }

  const entries = fs.readdirSync(root, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name.startsWith('_')) continue;
    if (entry.name === 'index.js') continue;
    if (entry.name.endsWith('.schema.json')) continue;

    if (entry.isFile() && entry.name.endsWith('.json')) {
      ingest(path.join(root, entry.name), entry.name);
      continue;
    }

    if (!entry.isDirectory()) continue;

    // Bucket-nested (Phase 3+): if the directory name is a known bucket,
    // recurse and treat each child as a component folder. The loader
    // checks for a manifest at the bucket level first so a future
    // bucket-named component (unlikely) is still loadable.
    if (BUCKETS.includes(entry.name)) {
      const selfMatch = tryManifestInDir(root, entry.name);
      if (selfMatch) {
        ingest(selfMatch.path, selfMatch.label);
        continue;
      }
      const bucketRoot = path.join(root, entry.name);
      const bucketEntries = fs.readdirSync(bucketRoot, { withFileTypes: true });
      for (const child of bucketEntries) {
        if (!child.isDirectory()) continue;
        if (child.name.startsWith('_')) continue;
        const match = tryManifestInDir(bucketRoot, child.name);
        if (match) ingest(match.path, `${entry.name}/${match.label}`);
      }
      continue;
    }

    // Per-component folder at root.
    const match = tryManifestInDir(root, entry.name);
    if (match) ingest(match.path, match.label);
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
  MIXED_SUBSTANCE,
  UNIVERSAL_GROUPS,
  UNIVERSAL_VARIANTS,
  SEMI_UNIVERSAL_VARIANTS,
  EXCLUSIVE_AXES,
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
