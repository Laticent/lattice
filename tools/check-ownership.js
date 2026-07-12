#!/usr/bin/env node
/**
 * Ownership / collision guard for the Lattice build.
 *
 * Several Lattice layers intentionally "share shape": every theme defines
 * the same token names, several transformers compose on the same slide
 * class, and every component CSS file scopes its rules under a class. That
 * shared shape is a feature — until two things claim the same name *by
 * accident*, at which point the loser is silently clobbered (last theme
 * wins, last transformer wins, last `<name>.styles.css` of a duplicated
 * name wins). The single-canonical-file build makes those clobbers
 * invisible, so this guard makes them loud instead: it hard-fails the
 * build on any unexpected collision, and forces intentional co-ownership
 * to be declared in an explicit allow-list below.
 *
 * Checks (all hard-fail):
 *   1. Transformer names are unique across the registry.
 *   2. A layout token owned by >1 transformer must be allow-listed in
 *      CO_OWNED_LAYOUTS (the image scrim/asset/text-panel trio is the
 *      one legitimate case today).
 *   3. Component names are unique across buckets (the CSS bundler and the
 *      docs generator both key by name; a duplicate silently drops one).
 *   4. No top-level selector is defined by more than one component's
 *      `<name>.styles.css`. Two files defining the same selector is the
 *      literal clobber: once concatenated into dist/lattice.css, the
 *      later one wins silently. Intentional duplicates go in
 *      SHARED_SELECTORS. (Self-scoping under `.<name>` is encouraged but
 *      not enforced — chart components legitimately restyle generated
 *      mermaid / function-plot SVG classes under `section`.)
 *   5. Every base palette (a theme that `@import 'lattice'`) defines the
 *      core token contract REQUIRED_THEME_TOKENS. Themes deliberately
 *      inherit most engine defaults from lattice.css `:root` and override
 *      selectively; only the core surface tokens are mandatory. A missing
 *      core token means the palette silently renders on engine defaults.
 *   6. Every layout variant a component actually implements — a modifier
 *      class chained onto its root element, or a name in its transform's
 *      dispatch array — is declared in the manifest `variants[]`. An
 *      undeclared variant is invisible: the docs/gallery generator only
 *      surfaces variants[] ∩ variantDocs, so the variant ships with no
 *      docs entry, no gallery slide, and no regression PDF (the drift
 *      that stranded radar/quadrant/word-cloud's variant catalogs).
 *      Structural root classes and documented aliases are escape-hatched
 *      via STRUCTURAL_ROOT_CLASSES / VARIANT_DECL_IGNORE.
 *
 * Usage:
 *   node tools/check-ownership.js            # report; exit 1 on any collision
 *   node tools/check-ownership.js --json     # machine-readable report
 *
 * Pure-ish: reads the manifests, the transformer registry, the component
 * CSS files, and themes/. No writes. Wired into `npm run build` and the
 * pre-commit hook.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  loadAll, manifestBucket, BUCKETS,
  UNIVERSAL_VARIANTS, SEMI_UNIVERSAL_VARIANTS, TAGS,
} = require('../lib/components');
const { TRANSFORMERS } = require('../lib/transformers/registry');
const { PAIRS: TOKEN_CROSSWALK } = require('../lib/tokens/crosswalk');
const { findHexLiterals } = require('../lib/layout/gate'); // HARD RULE #3 hex matcher (reused, not reinvented)

const ROOT = path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const THEMES_DIR = path.join(ROOT, 'themes');
const LIB_DIR = path.join(ROOT, 'lib');
// Layout-specific variants are styled in two places: a component's own
// <name>.styles.css, AND the shared base.modifiers.css (where the cross-
// cutting modifier block lives — e.g. obligation-matrix .pills/.lanes,
// split-panel/cards-stack .mirror). checkVariantDeclaration scans both so a
// variant defined only in base.modifiers can't go undeclared.
const BASE_MODIFIERS_CSS = path.join(ROOT, 'lib', 'base', 'base.modifiers.css');

// ── Allow-lists: declared, intentional shared shape ──────────────────────

// Layout class tokens legitimately owned by more than one transformer.
// The three image transformers compose on the same `image` slide: the
// asset places the <img>, the scrim overlays a gradient, the text-panel
// wraps the prose. They are designed to co-fire — see
// lib/transformers/registry.js and the image component docs.
const CO_OWNED_LAYOUTS = new Set(['image']);

// Top-level selectors that more than one component is allowed to define
// (normalized: whitespace collapsed to single spaces). Each entry is a
// documented, intentional shared rule — without it the duplicate-selector
// check hard-fails. Empty today: no two component files define the same
// selector. Populate only for a deliberate shared treatment.
const SHARED_SELECTORS = new Set([]);

// Class tokens that sit on a component's root element but are NOT
// author-facing layout variants — so checkVariantDeclaration must not
// demand a `variants[]` entry for them. Two legitimate kinds:
//   - the bare-default modifier a layout documents as "this IS the
//     default appearance" (kpi `briefing`),
//   - a preserved legacy spelling that aliases a declared variant
//     (image `left` → `mirror`).
// Keyed by component name → set of ignored root-class tokens. Add an
// entry only with a one-line justification; the default expectation is
// that every root modifier is a declared variant.
const VARIANT_DECL_IGNORE = new Map([
  ['kpi', new Set(['briefing'])],            // bare default appearance, documented as such
  ['image', new Set(['left'])],              // legacy alias of `mirror` (base.modifiers.css)
  ['state-chart', new Set(['horizontal'])],  // documented back-compat alias of `lr inline`
  ['word-cloud', new Set(['canvas'])],        // chart-family-wide surface modifier, not a word-cloud-specific variant
]);

// Class tokens that may appear chained onto a component's root element
// but are shared structural scaffolding, not author-selectable variants.
// `chart-frame` is the wrapper the chart family applies to every chart
// section (section.<chart>.chart-frame); it is engine chrome, present on
// every chart regardless of variant.
// `lat-split-cards` is the cover-cards body marker the auto-split kernel stamps on a
// reshaped (transposed-to-cards) split page — engine chrome, not an author variant, exactly
// parallel to the `lat-split-native` cover-paginate body marker.
// `print` is the deck-wide PRINT canvas mode (a color-mode sibling of dark/light),
// stamped on every section when a deck is exported in print; a `section.print.<component>`
// rule (e.g. journey's print ramp re-resolution) is print-mode chrome, not an author
// variant of that component — exactly like a `section.dark.<component>` override would be.
const STRUCTURAL_ROOT_CLASSES = new Set(['chart-frame', 'lat-split-cards', 'lat-split-native', 'print']);

// Search tags that legitimately apply to exactly ONE component — a
// genuinely-unique idiom or material with no sibling that shares it
// (`spider` is radar's alone; `formula` is math's alone). Every OTHER tag
// must be used by ≥2 components so the search facets cluster; a new
// singleton is almost always a typo or a tag that should be reused. Add an
// entry here only with that justification. The default expectation is reuse.
const SINGLETON_TAGS = new Set([
  'formula',    // math — typeset equations
  'donut',      // piechart — the donut idiom
  'spider',     // radar — the spider/radar idiom
  'tag-cloud',  // word-cloud — the tag-cloud idiom
  'org-chart',  // diagram — org-chart idiom
  'themes',     // word-cloud — recurring themes/terms
  'definition', // glossary — term definitions
  'states',     // state-chart — state machine states
  'section-break', // divider — section-boundary idiom (was shared with subtopic, merged into divider.light 2026-06-07)
]);

// Core token contract every base palette must define directly. These are
// the surface tokens the portal and base layout consume without an engine
// fallback; everything else a theme may inherit from lattice.css `:root`.
const REQUIRED_THEME_TOKENS = Object.freeze([
  '--bg', '--bg-alt', '--border',
  '--text-heading', '--text-body', '--text-secondary', '--text-muted',
  '--accent', '--accent-soft', '--surface-inverse',
]);

// HARD RULE #4: typography is a CLOSED 12-token, role-named `--fs-*` system
// (engineering/typography.md §1) — never t-shirt sizes (`--fs-md`/`--fs-lg`) or
// any ad-hoc name. `--fs-scale` is the cqi scale base the 12 derive from. A new
// `--fs-*` DECLARATION outside this set is the regression this gate blocks;
// adding a 13th role token is a deliberate act that updates this list + the doc.
const CANONICAL_FS_TOKENS = Object.freeze(new Set([
  '--fs-meta', '--fs-body-compact', '--fs-body', '--fs-message', '--fs-emphasis',
  '--fs-h1', '--fs-h2', '--fs-h3', '--fs-h4', '--fs-h5', '--fs-h6',
  '--fs-hero',
  '--fs-scale',
]));

// ── Selector parsing (paren-aware) ────────────────────────────────────────

/** Strip /* *​/ comments. */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/**
 * Extract the top-level style-rule selector preludes from a stylesheet.
 * Walks character by character tracking brace depth and paren depth so
 * commas and braces inside :is(...) / :where(...) / [attr] don't confuse
 * the scan. Selectors inside @media / @supports blocks are included (they
 * still need to be scoped); the bodies of @keyframes / @font-face are not
 * style rules and are skipped.
 *
 * Returns an array of selector-list strings (one per `{`), each still
 * comma-joined; split with splitTopLevel() for individual selectors.
 */
function topLevelSelectors(css) {
  const clean = stripComments(css);
  const selectors = [];
  let buf = '';
  let paren = 0;
  // Stack of block kinds: 'atSkip' (keyframes/font-face — ignore inner
  // rule preludes) or 'rule'/'atNest' (media/supports — collect inner).
  const stack = [];
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i];
    if (ch === '(') paren++;
    else if (ch === ')') paren--;

    if (paren > 0) {
      buf += ch;
      continue;
    }

    if (ch === '{') {
      const prelude = buf.trim();
      buf = '';
      const insideSkip = stack.includes('atSkip');
      if (prelude.startsWith('@')) {
        const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
        stack.push(name === 'keyframes' || name === 'font-face' ? 'atSkip' : 'atNest');
      } else {
        if (prelude && !insideSkip) selectors.push(prelude);
        stack.push('rule');
      }
    } else if (ch === '}') {
      buf = '';
      stack.pop();
    } else if (ch === ';' && stack[stack.length - 1] !== 'rule') {
      // A declaration terminator outside a rule body (e.g. an @import
      // prelude) — reset the prelude buffer.
      buf = '';
    } else {
      buf += ch;
    }
  }
  return selectors;
}

/** Split a selector list on top-level commas (paren-aware). */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let bracket = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    if (ch === ',' && depth === 0 && bracket === 0) {
      parts.push(buf.trim());
      buf = '';
    } else {
      buf += ch;
    }
  }
  if (buf.trim()) parts.push(buf.trim());
  return parts;
}

/** Every `.class` token in a selector. */
function classTokens(selector) {
  return [...selector.matchAll(/\.([\w-]+)/g)].map((m) => m[1]);
}

/**
 * `.class` tokens at the top level of a compound selector — i.e. chained
 * directly onto the element, ignoring anything inside a functional
 * pseudo-class like `:not(...)`, `:has(...)`, `:is(...)`. Used to find
 * modifier classes without mistaking a `:not(:has(.foo))` presence check
 * for a modifier.
 */
function topLevelClassTokens(compound) {
  let depth = 0;
  let outside = '';
  for (const ch of compound) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (depth === 0) outside += ch;
  }
  return classTokens(outside);
}

/**
 * True if `selector` is scoped to component `name`: it references a class
 * token that is either exactly `<name>` or in the component's BEM
 * namespace `<name>-*` (e.g. `gantt` owns `.gantt`, `.gantt-chart`,
 * `.gantt-lane`). Token-exact so `image` does not match `imagery`.
 */
function isScopedTo(selector, name) {
  return classTokens(selector).some((c) => c === name || c.startsWith(`${name}-`));
}

/**
 * Split a complex selector into its compound selectors on the top-level
 * combinators (descendant whitespace, `>`, `+`, `~`), paren- and
 * bracket-aware so `:is(a > b)` / `[attr~="x y"]` stay intact. Each
 * returned string is the run of simple selectors targeting one element.
 */
function splitCompounds(selector) {
  const compounds = [];
  let depth = 0;
  let bracket = 0;
  let buf = '';
  const flush = () => {
    if (buf.trim()) compounds.push(buf.trim());
    buf = '';
  };
  for (const ch of selector) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === '[') bracket++;
    else if (ch === ']') bracket--;
    if (depth === 0 && bracket === 0 && (ch === '>' || ch === '+' || ch === '~' || /\s/.test(ch))) {
      flush();
      continue;
    }
    buf += ch;
  }
  flush();
  return compounds;
}

/**
 * Layout-specific modifier class tokens a component's CSS applies to its
 * own root element — i.e. classes chained directly onto `.<name>`
 * (`section.<name>.<modifier>`), excluding the name, its `<name>-*` BEM
 * namespace, and the universal / semi-universal modifier vocabularies.
 * Descendant/structural classes (`.<name> .cell`) and attribute-driven
 * variants (`[data-variant="x"]`) are intentionally not returned here —
 * structural classes are not author modifiers, and attribute variants
 * come from the transform array instead (see transformModifierTokens).
 */
function cssRootModifierTokens(css, name) {
  const universal = new Set([...UNIVERSAL_VARIANTS, ...SEMI_UNIVERSAL_VARIANTS]);
  const mods = new Set();
  for (const list of topLevelSelectors(css)) {
    for (const sel of splitTopLevel(list)) {
      for (const compound of splitCompounds(sel)) {
        // Only classes at the top level of the compound are chained
        // modifiers; classes nested inside `:not(:has(.x))` / `:is(...)`
        // reference descendants or presence conditions, not modifiers.
        const tokens = topLevelClassTokens(compound);
        if (!tokens.includes(name)) continue; // not the component's root element
        for (const t of tokens) {
          if (t === name || t.startsWith(`${name}-`)) continue;
          if (universal.has(t)) continue;
          if (STRUCTURAL_ROOT_CLASSES.has(t)) continue;
          mods.add(t);
        }
      }
    }
  }
  return mods;
}

/** Locate a component's <name>.transform.js across the bucket-nested tree. */
function componentTransformPath(m) {
  const bucket = manifestBucket(m);
  const candidates = [
    path.join(COMPONENTS_DIR, bucket, m.name, `${m.name}.transform.js`),
    path.join(COMPONENTS_DIR, m.name, `${m.name}.transform.js`),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

/**
 * Variant names a transform branches on, read from its
 * `const *_MODIFIERS = [...]` / `*_VARIANTS = [...]` array literals.
 * Source-text scan (no eval) — these arrays are the canonical list a
 * transform dispatches over (e.g. RADAR_MODIFIERS, QUADRANT_MODIFIERS).
 */
function transformModifierTokens(src) {
  const universal = new Set([...UNIVERSAL_VARIANTS, ...SEMI_UNIVERSAL_VARIANTS]);
  const mods = new Set();
  const arrays = src.matchAll(/\b(?:const|let|var)\s+\w*(?:MODIFIERS|VARIANTS)\s*=\s*\[([^\]]*)\]/g);
  for (const arr of arrays) {
    for (const lit of arr[1].matchAll(/['"]([\w-]+)['"]/g)) {
      if (!universal.has(lit[1])) mods.add(lit[1]);
    }
  }
  return mods;
}

/**
 * Cross-check: every layout variant a component actually implements —
 * in its CSS (root-element modifier classes) or its transform (the
 * dispatch array) — must be declared in the manifest `variants[]`, or
 * the docs/gallery generator silently omits it (the radar/quadrant/
 * word-cloud drift class). The inverse (declared-but-unimplemented) is
 * left to manual review; this guard only catches the invisible-variant
 * case. False positives are escape-hatched via VARIANT_DECL_IGNORE.
 */
function checkVariantDeclaration(manifests, errors) {
  const baseModifiersCss = fs.existsSync(BASE_MODIFIERS_CSS)
    ? fs.readFileSync(BASE_MODIFIERS_CSS, 'utf8')
    : '';
  for (const m of manifests) {
    const declared = new Set(Array.isArray(m.variants) ? m.variants : []);
    const ignore = VARIANT_DECL_IGNORE.get(m.name) || new Set();
    const implemented = new Set();

    const cssPath = componentStylesPath(m);
    if (cssPath) {
      for (const t of cssRootModifierTokens(fs.readFileSync(cssPath, 'utf8'), m.name)) {
        implemented.add(t);
      }
    }
    // Also scan the shared modifier stylesheet — many layout variants
    // (e.g. obligation-matrix .pills/.lanes) are defined there, not in the
    // component's own CSS, and would otherwise escape the check.
    for (const t of cssRootModifierTokens(baseModifiersCss, m.name)) {
      implemented.add(t);
    }
    const txPath = componentTransformPath(m);
    if (txPath) {
      for (const t of transformModifierTokens(fs.readFileSync(txPath, 'utf8'))) {
        implemented.add(t);
      }
    }

    const missing = [...implemented]
      .filter((v) => !declared.has(v) && !ignore.has(v))
      .sort();
    if (missing.length) {
      errors.push(
        `component "${m.name}" implements variant(s) absent from its manifest "variants": ${missing.join(', ')}. ` +
        `Declare each in "variants" with a matching "variantDocs" entry so the docs/gallery generator surfaces it; ` +
        `if a token is internal structure rather than an author modifier, add it to VARIANT_DECL_IGNORE in tools/check-ownership.js.`,
      );
    }
  }
}

/**
 * Cross-check the search-tag vocabulary CLUSTERS. Per-manifest validity
 * (membership in the controlled vocabulary, the complementary rule, the
 * 3-5 count) is already enforced by validate() at load time; this guard
 * adds the cross-component property that vocabulary alone can't express:
 *
 *   - Every tag used by exactly one component must be allow-listed in
 *     SINGLETON_TAGS. An un-allow-listed singleton is the tag-equivalent
 *     of the invisible-variant drift — a one-off term that fragments
 *     search instead of clustering it (the author searches `roadmap` and
 *     finds nothing because the lone tag was `roadmapping`).
 *   - No vocabulary term may be DEAD (used by zero components). Dead
 *     vocabulary is noise the next author has to wade through; prune it
 *     from TAG_GROUPS or assign it.
 */
function checkTagClustering(manifests, errors) {
  const usage = new Map();
  for (const t of TAGS) usage.set(t, 0);
  for (const m of manifests) {
    if (!Array.isArray(m.tags)) continue;
    for (const t of m.tags) usage.set(t, (usage.get(t) || 0) + 1);
  }
  const singletons = [];
  const dead = [];
  for (const [t, n] of usage) {
    if (n === 0) dead.push(t);
    else if (n === 1 && !SINGLETON_TAGS.has(t)) singletons.push(t);
  }
  if (singletons.length) {
    errors.push(
      `search tag(s) used by exactly one component: ${singletons.sort().join(', ')}. ` +
      `A tag must cluster (≥2 components) so the docs-portal filter groups, not fragments. ` +
      `Reuse the tag on a sibling component, or — if it is genuinely unique to one layout — ` +
      `add it to SINGLETON_TAGS in tools/check-ownership.js with a one-line justification.`,
    );
  }
  if (dead.length) {
    errors.push(
      `tag vocabulary term(s) used by no component: ${dead.sort().join(', ')}. ` +
      `Dead vocabulary is search noise — assign each term to a component or remove it from TAG_GROUPS in lib/components/index.js.`,
    );
  }
}

// ── Theme token parsing ────────────────────────────────────────────────────

function parseThemeTokens(css) {
  const clean = stripComments(css);
  const names = new Set();
  for (const m of clean.matchAll(/(--[\w-]+)\s*:/g)) names.add(m[1]);
  return names;
}

/** Base palettes: theme files that `@import 'lattice'`. */
function listBasePalettes() {
  const out = [];
  for (const file of fs.readdirSync(THEMES_DIR).sort()) {
    if (!file.endsWith('.css')) continue;
    const css = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
    if (!/@import\s+['"]lattice['"]/.test(css)) continue;
    out.push({ name: file.replace(/\.css$/, ''), tokens: parseThemeTokens(css) });
  }
  return out;
}

// ── Checks ──────────────────────────────────────────────────────────────────

function checkTransformerNames(errors) {
  const seen = new Map();
  for (const t of TRANSFORMERS) {
    if (!t.name) {
      errors.push(`transformer with no name: ${JSON.stringify(t.selector || t)}`);
      continue;
    }
    if (seen.has(t.name)) {
      errors.push(`duplicate transformer name "${t.name}" — names must be unique across the registry.`);
    }
    seen.set(t.name, t);
  }
}

function checkLayoutOwnership(errors) {
  const owners = new Map(); // layout token → [transformer names]
  for (const t of TRANSFORMERS) {
    const layouts = Array.isArray(t.layouts) ? t.layouts : [];
    for (const raw of layouts) {
      // Normalize 'image.full' → base token 'image' for co-ownership.
      const token = String(raw).split('.')[0];
      if (!owners.has(token)) owners.set(token, []);
      owners.get(token).push(t.name);
    }
  }
  for (const [token, names] of owners) {
    const distinct = [...new Set(names)];
    if (distinct.length > 1 && !CO_OWNED_LAYOUTS.has(token)) {
      errors.push(
        `layout "${token}" is claimed by multiple transformers (${distinct.join(', ')}). ` +
        `If this co-ownership is intentional, add "${token}" to CO_OWNED_LAYOUTS in tools/check-ownership.js; ` +
        `otherwise one transformer's transform silently clobbers the other.`,
      );
    }
  }
}

function checkComponentNames(manifests, errors) {
  const seen = new Map(); // name → bucket
  for (const m of manifests) {
    const bucket = manifestBucket(m);
    if (seen.has(m.name)) {
      errors.push(
        `duplicate component name "${m.name}" in buckets "${seen.get(m.name)}" and "${bucket}". ` +
        `The CSS bundler and docs generator key by name; a duplicate silently drops one.`,
      );
    }
    seen.set(m.name, bucket);
  }
}

/** Locate a component's <name>.styles.css across the bucket-nested tree. */
function componentStylesPath(m) {
  const bucket = manifestBucket(m);
  const candidates = [
    path.join(COMPONENTS_DIR, bucket, m.name, `${m.name}.styles.css`),
    path.join(COMPONENTS_DIR, m.name, `${m.name}.styles.css`),
    path.join(COMPONENTS_DIR, m.name, 'styles.css'),
  ];
  return candidates.find((p) => fs.existsSync(p)) || null;
}

function checkComponentCss(manifests, errors) {
  const owners = new Map(); // normalized selector → Set<component name>
  for (const m of manifests) {
    const cssPath = componentStylesPath(m);
    if (!cssPath) continue;
    const css = fs.readFileSync(cssPath, 'utf8');
    const local = new Set();
    for (const list of topLevelSelectors(css)) {
      for (const sel of splitTopLevel(list)) {
        if (!sel) continue;
        local.add(sel.replace(/\s+/g, ' '));
      }
    }
    for (const sel of local) {
      if (!owners.has(sel)) owners.set(sel, new Set());
      owners.get(sel).add(m.name);
    }
  }
  for (const [sel, comps] of owners) {
    if (comps.size > 1 && !SHARED_SELECTORS.has(sel)) {
      errors.push(
        `selector "${sel}" is defined by multiple components (${[...comps].join(', ')}). ` +
        `Concatenated into dist/lattice.css, the later component's rule silently clobbers the earlier. ` +
        `If the shared rule is intentional, add the selector to SHARED_SELECTORS in tools/check-ownership.js.`,
      );
    }
  }
}

// Recursively list every .css file under a directory.
function listCssFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listCssFiles(p, out);
    else if (e.name.endsWith('.css')) out.push(p);
  }
  return out;
}

// Post-flip token-tier lint (universal-token canonical flip, ADR §11.5).
// The legacy per-theme vocabulary is retired; this keeps it retired and bans
// the naming anti-pattern that motivated the flip:
//   1. No DECLARATION may reuse a retired name (the crosswalk `old` side) —
//      a regression reintroducing `--c1-light` / `--c-stroke` / `--bg-dark` /
//      `--scale-500` / `--dark-*` fails the build.
//   2. No token NAME may end in a color-scheme word `-light` / `-dark` — that
//      tier-suffix overload (a TIER named like the color-scheme + light-dark())
//      is exactly what the flip eliminated. Color-scheme lives only inside the
//      light-dark() VALUE; `--scheme-dark-*` / `--on-dark-*` carry "dark" as a
//      role PREFIX (they don't end in it), so they pass.
// Comments are stripped first, so historical "(was --bg-dark)" notes don't trip.
const RETIRED_TOKEN_NAMES = new Set(TOKEN_CROSSWALK.map((p) => `--${p.old}`));

function checkRetiredTokenNames(errors) {
  const files = [...listCssFiles(LIB_DIR), ...listCssFiles(THEMES_DIR)];
  for (const file of files) {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    const seen = new Set();
    for (const m of css.matchAll(/(--[a-z0-9-]+)\s*:/g)) {
      const name = m[1];
      if (seen.has(name)) continue;
      seen.add(name);
      if (RETIRED_TOKEN_NAMES.has(name)) {
        errors.push(
          `retired token "${name}" is declared in ${rel} — the canonical flip retired it ` +
          `(lib/tokens/crosswalk.js). Use its universal name (see the crosswalk / ADR §7).`,
        );
      } else if (/-(light|dark)$/.test(name)) {
        errors.push(
          `token "${name}" in ${rel} ends in a color-scheme word (-light/-dark) — the retired ` +
          `tier-suffix anti-pattern. Name it for its ROLE; color-scheme lives in the light-dark() value.`,
        );
      }
    }
  }
}

// Pure core for HARD RULE #4: the non-canonical `--fs-*` names DECLARED in a CSS
// string (declarations only — `--fs-x:` — so `var(--fs-h${n})` usages and prose
// never trip it). Comments must already be stripped by the caller.
function nonCanonicalFsTokens(css) {
  const out = [];
  const seen = new Set();
  for (const m of css.matchAll(/(--fs-[a-z0-9-]+)\s*:/g)) {
    const name = m[1];
    if (seen.has(name)) continue;
    seen.add(name);
    if (!CANONICAL_FS_TOKENS.has(name)) out.push(name);
  }
  return out;
}

// Pure core for HARD RULE #20: the NONZERO `margin` declarations in a stylesheet.
// `margin` lives outside the box, so it is invisible to getBoundingClientRect() /
// offsetHeight AND it margin-collapses — both corrupt the height math a measuring
// layout (virtual lists, the Fit Spine) depends on. Space with `padding` (inside the
// box) and `gap` (between flex/grid children), which measure cleanly. An all-zero
// reset (`margin: 0`, `margin: 0 0`) adds no space and so can't distort measurement —
// it is exempt; everything else (lengths, `auto`, negatives) is an offending margin.
// The `(?<![\w.-])` guard keeps `scroll-margin*` from matching (the `-`) AND the `.margin`
// VARIANT-CLASS selector `section.x.margin:is(…)` from reading as a `margin:` property (the
// `.`); the longhand-suffix whitelist keeps `margin-trim` (and any other `margin-*`) out.
// Strip comments first. See engineering/gotchas.md.
const MARGIN_PROP =
  /(?<![\w.-])margin(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?\s*:\s*([^;}{]+)/g;

function offendingMargins(css) {
  const out = [];
  for (const m of css.matchAll(MARGIN_PROP)) {
    const value = m[1].replace(/!important/g, '').trim();
    if (!value) continue;
    const allZero = value.split(/\s+/).every((t) => /^0[a-z%]*$/.test(t));
    if (!allZero) out.push(value);
  }
  return out;
}

// HARD RULE #4 gate — no non-canonical `--fs-*` token may be DECLARED anywhere
// in the engine CSS (engineering/typography.md §1).
function checkTypographyTokens(errors) {
  for (const file of [...listCssFiles(LIB_DIR), ...listCssFiles(THEMES_DIR)]) {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const name of nonCanonicalFsTokens(css)) {
      errors.push(
        `non-canonical typography token "${name}" declared in ${rel} — HARD RULE #4: ` +
        `the 12-token role-named --fs-* system is closed (engineering/typography.md §1). ` +
        `Map it to a role token (e.g. --fs-message / --fs-body-compact), not a t-shirt size.`,
      );
    }
  }
}

// HARD RULE #20 — ZERO nonzero `margin` declarations in the engine layout CSS (lib/).
// margin sits outside the box, so it is invisible to getBoundingClientRect()/offsetHeight
// and it margin-collapses — both corrupt the height math a measuring layout (the overflow
// probe, autosplit, the Fit Spine) depends on. Space with `gap`/`padding`, which measure
// cleanly. This is no longer an exceed-only ratchet: the layout budget is 0, and the only
// margins allowed are the explicitly enumerated SANCTIONED list below — each provably the
// one answer. A new, unlisted margin fails the build; a sanction that no longer matches
// any declaration ALSO fails (so the allowlist can't rot). Adding a sanction requires a
// PR justification, never a silent edit.
//
// 271 → 39 → 12 → 0: the component sweep (#551) cleared lib/components; the independent
// slices + contract-tier retirement (#557, #563) cleared base.modifiers/chart-family/
// forms/contracts; the stage-flow keystone (2026-06-27-stage-flow-no-margins.md) moved the
// base typographic rhythm (h2–h6/p `margin-bottom`, the hr centering, the eyebrow / KEY-
// INSIGHT / below-note / display-math riders) onto the `.cell-stage` `gap` + `padding`.
// What remains is the single irreducible flex auto-push, sanctioned here.
const LAYOUT_MARGIN_BUDGET = 0;

// The enumerated allowlist. Each entry is a margin that is provably the only answer; the
// gate subtracts one matching declaration per entry. `file` is repo-relative; `value` is
// the trimmed declaration value (post-`!important`-strip) to match.
const SANCTIONED_MARGINS = [
  {
    file: 'lib/base/base.modifiers.css',
    value: 'auto',
    why: 'irreducible flex auto-push: shoves a trailing pill/label to the row end in a flex '
       + 'row. Horizontal-only (never touches height math) and a single-item end-shove has no '
       + '`gap`/`padding` equivalent. See the base.modifiers comment at the declaration.',
  },
];

// HARD RULE #20 gate — keep `margin` out of the engine's layout CSS; space with
// `gap`/`padding`, which measure cleanly (engineering/gotchas.md). Layout budget 0 +
// the SANCTIONED allowlist above.
function checkMarginDiscipline(errors) {
  // Collect every offending (file, value) across lib/.
  const offences = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const value of offendingMargins(css)) offences.push({ file: rel, value });
  }
  // Consume one offence per sanction (by file + value); track sanctions that match nothing.
  const remaining = [...offences];
  const staleSanctions = [];
  for (const s of SANCTIONED_MARGINS) {
    const i = remaining.findIndex((o) => o.file === s.file && o.value.trim() === s.value);
    if (i === -1) staleSanctions.push(s);
    else remaining.splice(i, 1);
  }
  if (remaining.length > LAYOUT_MARGIN_BUDGET) {
    const byFile = {};
    for (const o of remaining) byFile[o.file] = (byFile[o.file] || 0) + 1;
    const top = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([f, n]) => `${f} (${n})`).join(', ');
    errors.push(
      `${remaining.length} unsanctioned nonzero margin declaration(s) in engine CSS ` +
      `(HARD RULE #20: layout budget is 0). margin is invisible to measurement and margin-collapses — ` +
      `space with \`gap\`/\`padding\` instead (engineering/gotchas.md). If a margin is provably the only ` +
      `answer, add it to SANCTIONED_MARGINS in tools/check-ownership.js with a justification. Offending: ${top}.`,
    );
  }
  for (const s of staleSanctions) {
    errors.push(
      `stale margin sanction in tools/check-ownership.js — \`${s.value}\` in ${s.file} is no longer ` +
      `present (HARD RULE #20). Remove the SANCTIONED_MARGINS entry so the allowlist stays honest.`,
    );
  }
}

// HARD RULE #3 — NO hex colour literals in the engine's LAYOUT CSS; always `var(--token)`.
// A hardcoded hex can't follow the palette (it's the same colour in every theme + colour
// mode) and dodges the WCAG-AA contract the tokens carry. The hex gate (`lib/layout/gate.js`
// `findHexLiterals`) already runs on the Layout-Studio authoring path; this extends it to the
// SHIPPED layout CSS (lib/), the surface checkMarginDiscipline walks. Budget 0 + an enumerated
// SANCTIONED list, same shape as #20: a new unlisted hex fails; a sanction matching nothing
// ALSO fails (the allowlist can't rot).
//
// Two principled exemptions (NOT counted): (1) token-DEFINITION files (`*.tokens.css`) where
// `--token: #hex` legitimately lives, and (2) hex that sits inside a `var(--token, …#hex…)`
// FALLBACK — that IS "use `var(--token)`", with a default; the chart-family hue tokens
// (`var(--chart-cat1, light-dark(#…, #…))`) are all of this form. `themes/*.css` are the
// palettes themselves (the hex source) and are out of scope entirely (lib/ only, like #20).
const LAYOUT_HEX_BUDGET = 0;

// The enumerated allowlist — each a FIXED colour that is provably not theme-able. `{file, hex,
// count, why}`; the gate consumes `count` matching occurrences (case-insensitive) per entry.
const SANCTIONED_HEX = [
  {
    file: 'lib/base/base.modifiers.css', hex: '#d4351c', count: 2,
    why: 'overflow-warning ring + tab fill — a FIXED danger red, deliberately NOT a theme token '
       + 'so the authoring alarm reads identically loud in every palette and colour mode '
       + '(documented at the declaration, base.modifiers.css "OVERFLOW WARNING").',
  },
  {
    file: 'lib/base/base.modifiers.css', hex: '#fff', count: 1,
    why: 'overflow-tab label ink — fixed white on the fixed danger red above; same exception.',
  },
];

// Offset-preserving comment strip (mirrors lib/layout/gate.js): blanks comment bytes but keeps
// indices stable so findHexLiterals' offsets align for the var()-containment check below.
function stripCommentsKeepOffsets(css) {
  return String(css || '').replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '));
}

// Is the hex at `idx` inside a `var( … )` call (i.e. a token fallback default)? Walk back to the
// nearest `var(` and check the parens are still open at `idx` — `var(--x, light-dark(#hex,…))`
// reads depth ≥ 1 at the hex, a bare `background: #hex` reads depth 0.
function hexInsideVar(css, idx) {
  const v = css.lastIndexOf('var(', idx);
  if (v === -1) return false;
  let depth = 0;
  for (let i = v; i < idx; i++) {
    if (css[i] === '(') depth++;
    else if (css[i] === ')') depth--;
  }
  return depth > 0;
}

// HARD RULE #3 gate — keep raw hex out of the engine's layout CSS; use `var(--token)`. Budget 0
// + the SANCTIONED allowlist above; `*.tokens.css` and `var(…)` fallback defaults are exempt.
function checkHexLiterals(errors) {
  const offences = []; // { file, hex } (hex lower-cased)
  for (const file of listCssFiles(LIB_DIR)) {
    if (/\.tokens\.css$/.test(file)) continue; // token-definition layer — hex is the point
    const rel = path.relative(ROOT, file);
    const css = stripCommentsKeepOffsets(fs.readFileSync(file, 'utf8'));
    for (const hit of findHexLiterals(css)) {
      if (hexInsideVar(css, hit.index)) continue; // `var(--token, #fallback)` — compliant
      offences.push({ file: rel, hex: hit.hex.toLowerCase() });
    }
  }
  const remaining = [...offences];
  const staleSanctions = [];
  for (const s of SANCTIONED_HEX) {
    const want = s.hex.toLowerCase();
    let consumed = 0;
    for (let n = 0; n < s.count; n++) {
      const i = remaining.findIndex((o) => o.file === s.file && o.hex === want);
      if (i === -1) break;
      remaining.splice(i, 1);
      consumed++;
    }
    if (consumed < s.count) staleSanctions.push({ ...s, consumed });
  }
  if (remaining.length > LAYOUT_HEX_BUDGET) {
    const byFile = {};
    for (const o of remaining) byFile[o.file] = (byFile[o.file] || 0) + 1;
    const top = Object.entries(byFile).sort((a, b) => b[1] - a[1]).slice(0, 5)
      .map(([f, n]) => `${f} (${n})`).join(', ');
    errors.push(
      `${remaining.length} unsanctioned hex colour literal(s) in engine layout CSS ` +
      `(HARD RULE #3: always \`var(--token)\` so colour follows the palette + keeps WCAG AA). ` +
      `Replace with the matching token, or — if the colour is provably fixed (not theme-able) — ` +
      `add it to SANCTIONED_HEX in tools/check-ownership.js with a justification. Offending: ${top}.`,
    );
  }
  for (const s of staleSanctions) {
    errors.push(
      `stale hex sanction in tools/check-ownership.js — \`${s.hex}\` ×${s.count} in ${s.file} now ` +
      `matches only ${s.consumed} (HARD RULE #3). Update the SANCTIONED_HEX count so the allowlist stays honest.`,
    );
  }
}

// ── HARD RULE #21: US English is the house dialect ───────────────────────────
// Curated, HIGH-CONFIDENCE British spellings (with the inflections that actually
// occur), listed EXPLICITLY so a stem can't over-match — `\b(...)\b` keeps `centre`
// from firing inside `epicentre`, and only UNAMBIGUOUS UK/US pairs are listed, so the
// many words US keeps in the British-looking form (`dialogue`, `analysis`, `exercise`,
// `comprise`, `advise`, `surprise`, `cancellation`, `practice` the noun) are
// deliberately ABSENT to avoid false positives. Detection is case-insensitive. Add a
// form only when the UK→US distinction is unambiguous.
const UK_ENGLISH_FORMS = [
  // -our → -or
  'colour', 'colours', 'coloured', 'colouring', 'colourful', 'colourless',
  'behaviour', 'behaviours', 'behavioural',
  'favour', 'favours', 'favoured', 'favouring', 'favourable', 'favourite', 'favourites',
  'flavour', 'flavours', 'flavoured', 'honour', 'honours', 'honoured',
  'labour', 'labours', 'laboured', 'rumour', 'rumours', 'neighbour', 'neighbours',
  // -re → -er
  'centre', 'centres', 'centred', 'centring',
  'metre', 'metres', 'litre', 'litres', 'fibre', 'fibres', 'theatre', 'theatres', 'calibre',
  // -ise/-isation → -ize/-ization (explicit verb roots only — NEVER a blunt -ise stem)
  'normalise', 'normalised', 'normalises', 'normalising', 'normalisation',
  'optimise', 'optimised', 'optimises', 'optimising', 'optimisation',
  'organise', 'organised', 'organises', 'organising', 'organisation',
  'recognise', 'recognised', 'recognises', 'recognising',
  'emphasise', 'emphasised', 'emphasises', 'emphasising',
  'summarise', 'summarised', 'summarises', 'summarising',
  'prioritise', 'prioritised', 'prioritises', 'prioritising',
  'minimise', 'minimised', 'minimises', 'minimising',
  'maximise', 'maximised', 'maximises', 'maximising',
  'customise', 'customised', 'customises', 'customising',
  'standardise', 'standardised', 'standardises',
  'categorise', 'categorised', 'categorises', 'categorising',
  'specialise', 'specialised', 'specialises',
  'initialise', 'initialised', 'initialises', 'initialising',
  'utilise', 'utilised', 'utilises', 'utilising',
  'realise', 'realised', 'realises', 'realising',
  'finalise', 'finalised', 'finalises',
  'capitalise', 'capitalised', 'capitalises',
  'visualise', 'visualised', 'visualises', 'visualising',
  'analyse', 'analysed', 'analysing', // NOT 'analyses' — that's also the US plural noun of "analysis"
  'apologise', 'apologised', 'apologises', 'apologising',
  // -ence → -ense / misc unambiguous
  'defence', 'defences', 'offence', 'offences', 'licence', 'licences', 'pretence', 'pretences',
  'catalogue', 'catalogues', 'analogue', 'analogues',
  'artefact', 'artefacts',
  'grey', 'greys', 'greyed', 'greyscale',
  'whilst', 'amongst',
  'fulfil', 'fulfils', 'enrol', 'enrols', 'instil', 'skilful', 'wilful',
  'cancelled', 'cancelling', 'labelled', 'labelling', 'modelling',
  'signalling', 'travelled', 'travelling', 'marvellous',
  'judgement', 'judgements', 'acknowledgement', 'acknowledgements', 'ageing',
  'programme', 'programmes', 'practise', 'practised', 'practises',
];

// Files exempt from the US-English scan. Four kinds: this gate's own dictionary and
// its test fixtures (they CONTAIN the British forms as data — without this the gate
// flags itself); the append-only CHANGELOG ledger (past entries are frozen history,
// like the decision docs — new entries are policed at PR review, not the gate); and a
// generated/vendored playground bundle that inlines third-party libraries we don't
// control. Dated engineering/decisions/ records are skipped by path in
// listRepoTextFiles; minified/`*.generated.*` bundles by filename.
const US_ENGLISH_SELF_EXEMPT = new Set([
  'tools/check-ownership.js',
  'test/unit/cli/check-ownership.test.js',
  'CHANGELOG.md',
  'docs/public/playground/lattice-playground.js',
  // Gitignored copy staged by docs/scripts/sync-portal.mjs — a duplicate of
  // the generated dist/docs/components.md, whose sources are already counted.
  'docs/public/components.md',
]);

const US_TEXT_EXTS = new Set(['.md', '.js', '.mjs', '.ts', '.tsx', '.css', '.json', '.yml', '.yaml', '.html', '.astro']);
const US_SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'coverage', '.scratch']);

// Repo-wide text files in the enforced US-English scope. Walks from ROOT, skips
// generated/vendor trees and the dated engineering/decisions/ records, and drops the
// self-exempt dictionary/fixtures.
function listRepoTextFiles(dir = ROOT, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    const rel = path.relative(ROOT, p);
    if (e.isDirectory()) {
      if (US_SKIP_DIRS.has(e.name)) continue;
      if (e.name.startsWith('.') && e.name !== '.github') continue; // hidden dirs (.git/.vscode/.claude) — keep .github
      if (rel === path.join('engineering', 'decisions')) continue; // historical records
      // Gitignored build artifacts the docs dev/build stages into public/ —
      // duplicates of already-counted sources. A clean checkout doesn't have
      // them, so counting them made the gate red on any tree that had merely
      // RUN the docs site while CI stayed green (observed: 1351 → 1517 with
      // the artifacts present). Same reason components.md is exempted below.
      // See engineering/decisions/2026-07-02-website-copy-positioning.md §8.5.
      if (rel === path.join('docs', 'public', 'playground', 'v')) continue;
      // Playwright's gitignored run outputs (docs/.gitignore): the HTML report
      // vendors Playwright's own viewer JS (which carries British spellings we
      // don't author) and test-results holds failure snapshots of app copy.
      // Same local-only false-red class as playground/v above — a clean
      // checkout/CI never has them; any tree that RAN `npm run test:e2e` does.
      if (rel === path.join('docs', 'playwright-report') || rel === path.join('docs', 'test-results')) continue;
      listRepoTextFiles(p, out);
    } else if (
      US_TEXT_EXTS.has(path.extname(e.name)) &&
      !e.name.startsWith('.') && // hidden files (.c8rc.json, …) aren't house prose
      !/\.(min|generated)\.[a-z]+$/.test(e.name) && // minified / generated bundles
      // Emulator HTML sidecars are transient, gitignored render artifacts — the
      // emulator writes a `<name>.html` next to every `<name>.pdf` it renders
      // (gallery sidecars like `<name>.gallery.{light,dark}.html`, and the
      // sidecar next to a committed `examples/<deck>.pdf`). The committed sibling
      // is the .pdf (binary, uncounted); the .html is NEVER house prose. The
      // pre-commit pdf-rebuild step renders decks in parallel with this scan, so a
      // sidecar can flicker into existence mid-walk and spuriously fail the budget
      // (a flaky local-only failure CI never sees on its clean checkout). Skip them.
      !/\.gallery\.(light|dark)\.html$/.test(e.name) &&
      // Deck render sidecars more broadly — the emulator writes <name>.html next to
      // EVERY <name>.pdf it renders (examples/, baseline-decks/, exemplars/), and the
      // pre-commit pdf-rebuild regenerates them; the committed artifact is the .pdf.
      // Skip any .html that has a sibling .md of the same basename (a deck render
      // sidecar, never house prose) — same transient-flicker reason as galleries.
      !(path.extname(e.name) === '.html' && fs.existsSync(p.replace(/\.html$/, '.md'))) &&
      !US_ENGLISH_SELF_EXEMPT.has(rel)
    ) {
      out.push(p);
    }
  }
  return out;
}

// HARD RULE #21 ratchet — the frozen ceiling of British spellings across the repo's
// living text surfaces. EXCEED-only (mirrors the margin gate): a NEW British spelling
// fails the build; the existing backlog is tracked in migration tickets and burned
// down by lowering US_ENGLISH_BUDGET as it drops. Target zero.
const US_ENGLISH_BUDGET = 1338;

function checkUsEnglish(errors) {
  const re = new RegExp(`\\b(${UK_ENGLISH_FORMS.join('|')})\\b`, 'gi');
  let total = 0;
  const byFile = [];
  for (const file of listRepoTextFiles()) {
    const n = (fs.readFileSync(file, 'utf8').match(re) || []).length;
    if (n) {
      total += n;
      byFile.push([path.relative(ROOT, file), n]);
    }
  }
  if (total > US_ENGLISH_BUDGET) {
    byFile.sort((a, b) => b[1] - a[1]);
    const top = byFile.slice(0, 5).map(([f, n]) => `${f} (${n})`).join(', ');
    errors.push(
      `British spellings rose to ${total}, above the budget of ${US_ENGLISH_BUDGET} (HARD RULE #21 — ` +
      `US English is the house dialect). Use the US spelling (-or not -our, -ize not -ise, -er not -re; ` +
      `gray, license, defense, catalog, while). Existing usages are tracked for migration — don't add new ` +
      `ones; as the backlog drops, lower US_ENGLISH_BUDGET in tools/check-ownership.js. Heaviest files: ${top}.`,
    );
  }
}

function checkThemeTokenParity(errors) {
  const palettes = listBasePalettes();
  if (!palettes.length) {
    errors.push('no base palettes found (no theme `@import \'lattice\'`) — cannot verify theme token contract.');
    return;
  }
  for (const p of palettes) {
    const missing = REQUIRED_THEME_TOKENS.filter((t) => !p.tokens.has(t));
    if (missing.length) {
      errors.push(
        `theme "${p.name}" is missing ${missing.length} core token(s): ${missing.join(', ')}. ` +
        `Every base palette must define the core surface tokens directly — define them in themes/${p.name}.css.`,
      );
    }
  }
}

// Derived from the manifest schema (the contract's source of truth) — was a hand-mirror.
const ADAPT_MODES = new Set(require('../lib/components/manifest.schema.json').properties.adapt.properties.mode.enum);

/**
 * Cross-check the adaptivity DECLARATION (manifest `adapt.mode`) against reality,
 * so the manifest can never silently drift from the code (the jank this replaces —
 * 7 charts that reflowed but declared nothing, with no gate to catch it). See
 * engineering/decisions/2026-06-20-adaptive-manifest-contract.md. Deterministic —
 * no rendering. Four rules:
 *
 *   1. COMPLETE   — every component declares a valid `adapt.mode`.
 *   2. ANTI-DRIFT — a component whose own CSS carries `@container … aspect-ratio`
 *      (the canonical box-local reflow signal) MUST be `reflow`. This is the
 *      enforceable core: CSS reflow can't masquerade as native. (JS/transform/
 *      mermaid reflowers have no such marker; they are author-declared `reflow`
 *      and render-backed by their transforms — out of this static gate's reach by
 *      design, documented in the decision doc.)
 *   3. CONSISTENT — `single-orientation` ⟺ the `orientation` field lists exactly
 *      one orientation; `native` must support BOTH (it adapts by scaling, so it
 *      can't be orientation-restricted).
 *   4. SANE       — `native` must NOT carry `@container … aspect-ratio` (the
 *      contrapositive of rule 2, stated for a clear message).
 */
function checkAdaptDeclarations(manifests, errors) {
  const CONTAINER_ASPECT = /@container[^{]*aspect-ratio/;
  // The shared chart-frame CSS carries a box-local `@container … aspect-ratio`
  // rule that restructures `.chart-body` on tall boxes for EVERY chart-frame
  // member — so a chart's reflow can live there, not in its own styles.css. The
  // anti-drift rule must see it, or a chart could declare `native` while inheriting
  // box-local reflow (the false-negative the maker-checker caught). Union it in for
  // chart-bucket components, the way checkVariantDeclaration unions base.modifiers.
  const chartFamilyCss = (() => {
    const p = path.join(COMPONENTS_DIR, 'chart', '_chart-family', 'chart-family.css');
    return fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  })();
  for (const m of manifests) {
    const mode = m.adapt?.mode;
    if (!mode || !ADAPT_MODES.has(mode)) {
      errors.push(
        `${m.name}: missing/invalid adapt.mode (got ${JSON.stringify(mode)}). ` +
        `Declare one of: ${[...ADAPT_MODES].join(', ')}. See engineering/decisions/2026-06-20-adaptive-manifest-contract.md.`,
      );
      continue;
    }
    const cssPath = componentStylesPath(m);
    let css = cssPath ? fs.readFileSync(cssPath, 'utf8') : '';
    if (manifestBucket(m) === 'chart') css += `\n${chartFamilyCss}`;
    const hasContainerReflow = CONTAINER_ASPECT.test(css);
    // orientation defaults to BOTH when omitted (the manifest's documented default).
    const orientation = Array.isArray(m.orientation) ? m.orientation : ['landscape', 'portrait'];

    if (hasContainerReflow && mode !== 'reflow') {
      errors.push(
        `${m.name}: declares adapt.mode "${mode}" but its CSS uses \`@container … aspect-ratio\` ` +
        `(box-local reflow) — must be "reflow". Fix the manifest or remove the @container rule.`,
      );
    }
    if (mode === 'single-orientation' && orientation.length !== 1) {
      errors.push(
        `${m.name}: adapt.mode "single-orientation" requires the \`orientation\` field to list ` +
        `exactly one orientation (got [${orientation.join(', ')}]).`,
      );
    }
    if (mode === 'native' && orientation.length !== 2) {
      errors.push(
        `${m.name}: adapt.mode "native" must support BOTH orientations (it adapts by scaling), ` +
        `but \`orientation\` is [${orientation.join(', ')}]. Use "single-orientation" if it is deliberately one.`,
      );
    }
  }
}

// Every component must declare its layout-solver intent — `adapt.priority`, the
// slots/roles in importance order (what leads, what sheds first). The Fit Spine's
// solver chooses collapse / shed / split by READING this, never by inferring from
// content, so undeclared intent is a build error, not a silent default (the §4
// Munger inversion: a solver that guesses is worse than the overflow ring). The §6
// backfill brought all 52 components to coverage; this gate keeps it from
// regressing. `keepTogether` / `droppable` stay advisory (declared-or-justified-
// empty) — only `priority` is universally required. See
// engineering/decisions/2026-06-22-solver-intent-backfill.md.
function checkSolverIntentDeclared(manifests, errors) {
  for (const m of manifests) {
    const p = m.adapt?.priority;
    const ok = Array.isArray(p) && p.length > 0 && p.every((s) => typeof s === 'string' && s.length > 0);
    if (!ok) {
      errors.push(
        `${m.name}: missing adapt.priority — the layout solver refuses to act on undeclared ` +
        `intent (Fit Spine §4/§6). Declare slots/roles in importance order, highest first. ` +
        `See engineering/decisions/2026-06-22-solver-intent-backfill.md.`,
      );
    }
  }
}

// HARD RULE #22 — untrusted slide HTML reaches a preview frame ONLY through
// `sanitizeSlideHtml`. The docs-site Studio renders untrusted markdown (shared /
// AI-generated decks + component skeletons) into a SAME-ORIGIN, un-sandboxed
// `srcdoc` iframe; un-sanitized engine HTML there is XSS → OpenRouter-key theft
// (#616). A frame BUILDER is any docs/src module that assembles a live preview
// document — recognised by the split runtime-`<script>` injection idiom
// (`'<scr' + 'ipt`) every builder uses — and each MUST call `sanitizeSlideHtml`
// on the slide HTML before it goes in. (Files that only ASSIGN a builder's output
// to `.srcdoc` — e.g. drawing-board-present/export — carry no marker and need no
// entry; the sanitize happened in the builder they call.) Allowlist + anti-rot,
// same shape as #3/#20: a NEW builder not listed fails (forces the sanitize call),
// a listed builder that drops the call fails, and a stale entry fails.
const PREVIEW_BUILDER_MARKER = /['"]<scr['"]\s*\+\s*['"]ipt/;
const SANITIZE_CALL = /sanitizeSlideHtml\s*\(/;
const SANCTIONED_PREVIEW_BUILDERS = [
  { file: 'docs/src/playground/deck-preview.js', why: 'buildSrcdoc + renderDeck (the latter also sanitizes the patchSections innerHTML path).' },
  { file: 'docs/src/lib/single-slide-render.ts', why: 'srcdoc() — landing islands / specimens / workbench single-slide preview.' },
  { file: 'docs/src/playground/presenter-window.js', why: 'buildStageDoc — the shared dual-screen presenter AND rehearsal stage (drawing-board-practice delegates here, P3b).' },
  { file: 'docs/src/playground/drawing-board-focus.js', why: 'frame — the focus-edit fragment preview.' },
];

function listSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.astro') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listSourceFiles(p, out);
    else if (/\.(?:js|ts|tsx|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

function checkPreviewHtmlSinks(errors) {
  const DOCS_SRC = path.join(ROOT, 'docs', 'src');
  const sanctioned = new Map(SANCTIONED_PREVIEW_BUILDERS.map((s) => [s.file, s]));
  const seen = new Set();
  for (const file of listSourceFiles(DOCS_SRC)) {
    const rel = path.relative(ROOT, file);
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) continue; // tests assert payloads, not preview frames
    const src = fs.readFileSync(file, 'utf8');
    if (!PREVIEW_BUILDER_MARKER.test(src)) continue;
    seen.add(rel);
    if (!sanctioned.has(rel)) {
      errors.push(
        `${rel} builds a live preview frame (injects the runtime <script>) but is not a sanctioned ` +
        `preview builder (HARD RULE #22). Untrusted engine HTML in a same-origin srcdoc is XSS / ` +
        `OpenRouter-key theft (#616) — sanitize the slide HTML via sanitizeSlideHtml ` +
        `(lib/core/sanitize-slide-html.js, re-exported by docs/src/lib/sanitize-slide-html.js) before it enters the frame, then add this file to ` +
        `SANCTIONED_PREVIEW_BUILDERS in tools/check-ownership.js with a justification.`,
      );
    } else if (!SANITIZE_CALL.test(src)) {
      errors.push(
        `${rel} is a sanctioned preview builder but no longer calls sanitizeSlideHtml (HARD RULE #22) — ` +
        `restore the call or its srcdoc reopens the #616 XSS hole.`,
      );
    }
  }
  for (const s of SANCTIONED_PREVIEW_BUILDERS) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale preview-builder sanction in tools/check-ownership.js — ${s.file} no longer builds a ` +
        `preview frame (HARD RULE #22). Remove the SANCTIONED_PREVIEW_BUILDERS entry so the allowlist stays honest.`,
      );
    }
  }
}

// HARD RULE #22, part 2 — the returning-visitor SNAPSHOT is a SECOND untrusted-HTML path,
// but a MAIN-DOCUMENT one the srcdoc-builder check above can't see: the Studio caches the
// last rendered slide's HTML in localStorage and `studio.astro`'s pre-paint replay injects
// it via `innerHTML` into the TOP (un-sandboxed, same-origin) document, and that HTML derives
// from whatever deck the user last viewed (incl. a shared / AI-generated one) → #616 XSS →
// OpenRouter-key theft. The srcdoc gate above scans only `.js/.ts` for the split-`<script>`
// idiom, so it sees NEITHER the `.astro` injection sink NOR the capture module.
//
// The ACTUAL trust boundary is the VALUE stored under the key — the replay reads it raw, so
// safety needs every WRITER to have sanitized. So this gate keys on the WRITE, not on today's
// syntax:
//   • PRODUCER (`snapshot-cache.js`) is the SOLE sanctioned writer + the sanitize chokepoint —
//     it MUST keep its sanitizeSlideHtml calls. Any OTHER docs/src file that WRITES the key
//     (`localStorage.setItem`) fails: a second, unsanitized writer would poison the replay.
//   • SINK (`studio.astro` REPLAY) reads the already-sanitized value; safe because the producer
//     is the only writer. A NEW file that reads the snapshot (the raw key OR the exported
//     `SNAPSHOT_KEY`/`loadSnapshot` API — both idiomatic) and injects it into a document (a
//     WIDE verb set) must be sanctioned here, for review, even though the sole-writer rule
//     already makes the value clean.
// COVERAGE BOUNDARY (be honest — a syntactic gate is defense-in-depth, not a proof): scanned
// scope is `docs/src` only; a raw script under `docs/public` is out of scope. The load-bearing
// guarantee is the sole-sanitizing-writer rule + `saveSnapshot`'s storage-boundary sanitize,
// NOT sink enumeration. Same allowlist + anti-rot shape as the srcdoc gate above.
// See engineering/decisions/2026-07-11-preview-performance-diagnosis.md.
const SNAPSHOT_KEY_LITERAL = 'lattice-studio-last-slide';
// A wide main-document injection verb set (the srcdoc gate's `.innerHTML=|set:html` misses most).
const SNAPSHOT_INJECT_MARKER = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|dangerouslySetInnerHTML|set:html/;
const SNAPSHOT_WRITE_MARKER = /\.setItem\s*\(/;
const SANCTIONED_SNAPSHOT_SINKS = [
  { file: 'docs/src/playground/snapshot-cache.js', role: 'producer', why: 'The SOLE writer of the snapshot key — saveSnapshot sanitizes at the storage boundary AND captureFromFrame at the capture chokepoint, so the stored value is always clean.' },
  { file: 'docs/src/pages/studio.astro', role: 'sink', why: 'REPLAY_JS pre-paint injects the already-sanitized snapshot into the instant-shell; safe because the producer is the only writer.' },
];

// A file is "part of the snapshot path" if it names the raw key OR pulls the key/loader symbol
// from snapshot-cache (the exported API — the idiomatic reader the literal-only test missed).
function referencesSnapshot(src) {
  if (src.includes(SNAPSHOT_KEY_LITERAL)) return true;
  return /from\s+['"][^'"]*snapshot-cache/.test(src) && /\b(?:SNAPSHOT_KEY|loadSnapshot)\b/.test(src);
}

function listSnapshotFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.astro') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listSnapshotFiles(p, out);
    else if (/\.(?:js|ts|tsx|mjs|cjs|astro)$/.test(e.name)) out.push(p); // NOTE: includes .astro
  }
  return out;
}

function checkSnapshotHtmlSinks(errors) {
  const DOCS_SRC = path.join(ROOT, 'docs', 'src');
  const sanctioned = new Map(SANCTIONED_SNAPSHOT_SINKS.map((s) => [s.file, s]));
  const seen = new Set();
  for (const file of listSnapshotFiles(DOCS_SRC)) {
    const rel = path.relative(ROOT, file);
    if (/\.test\.(?:[tj]sx?|mjs|cjs)$/.test(rel)) continue; // tests assert payloads, not real sinks
    const src = fs.readFileSync(file, 'utf8');
    if (!referencesSnapshot(src)) continue; // not part of the snapshot path
    const s = sanctioned.get(rel);
    if (s) {
      seen.add(rel);
      if (s.role === 'producer' && !SANITIZE_CALL.test(src)) {
        errors.push(
          `${rel} is the sole snapshot writer but no longer calls sanitizeSlideHtml (HARD RULE #22) — ` +
          `restore the sanitize at capture + storage, or the replay injects unsanitized HTML into the top document (#616 XSS).`,
        );
      }
      continue;
    }
    // Unsanctioned file on the snapshot path: a WRITER (poisons the value) or a SINK (injects it).
    if (SNAPSHOT_WRITE_MARKER.test(src)) {
      errors.push(
        `${rel} writes the '${SNAPSHOT_KEY_LITERAL}' snapshot key but is not the sanctioned producer (HARD RULE #22) — ` +
        `only the sanitizing producer (snapshot-cache.js) may store it; a second writer could store unsanitized HTML the ` +
        `pre-paint replay injects into the top document (#616 XSS). Route the write through saveSnapshot, or add this file to ` +
        `SANCTIONED_SNAPSHOT_SINKS with a justification.`,
      );
    } else if (SNAPSHOT_INJECT_MARKER.test(src)) {
      errors.push(
        `${rel} injects snapshot-derived HTML into a document but is not a sanctioned snapshot sink (HARD RULE #22) — the ` +
        `snapshot is untrusted, main-document, un-sandboxed HTML. Ensure it flows only from the sanitized snapshot-cache ` +
        `producer, then add this file to SANCTIONED_SNAPSHOT_SINKS in tools/check-ownership.js with a justification.`,
      );
    }
  }
  for (const s of SANCTIONED_SNAPSHOT_SINKS) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale snapshot-sink sanction in tools/check-ownership.js — ${s.file} no longer references the snapshot key ` +
        `(HARD RULE #22). Remove the SANCTIONED_SNAPSHOT_SINKS entry so the allowlist stays honest.`,
      );
    }
  }
}

// ── HARD RULE #24: OpenRouter budget — our paid key stays off the site AND out of tests ──
// Two separate invariants (engineering/workflow.md §OpenRouter budget):
//   1. NO EXPOSURE — our server-side OPEN_ROUTER_KEY must never reach the deployed site.
//      docs/ is a STATIC bundle shipped to the browser; the Playground uses the USER's own
//      OpenRouter key via OAuth (bring-your-own-key), so docs/ has zero reason to name our
//      key. A reference there would inline it into the bundle (leak) AND spend our budget on
//      the live site. (docs/ legitimately calls openrouter.ai with the USER's key — only OUR
//      key NAME is forbidden there, not the endpoint.)
//   2. NO ABUSE — our key must never be spent by the automated suite: no `test/**` file reads
//      it or hits the live API, no CI workflow injects it, no `test`-family npm script invokes
//      a spender. The one sanctioned spender is on-demand + opt-in (OPENROUTER_ALLOW_SPEND).
const OPENROUTER_KEY_NAME = /OPEN_ROUTER_KEY/; // the bare name catches bracket/destructure reads too
// The gate's own test fixtures legitimately CONTAIN the key name as data (they build probe
// files) — exempt them so the scan doesn't flag itself, same as the US-English dictionary.
const OPENROUTER_SCAN_EXEMPT = new Set(['test/unit/cli/check-ownership.test.js']);
// The ONLY paths allowed to spend our key — on-demand, opt-in, cost-printing (rule #24).
const SANCTIONED_OPENROUTER_SPENDERS = ['tools/component-gen-eval.mjs', 'tools/generate-voice-samples.mjs'];

// Workflows allowed to spend the key: sanctioned, budgeted, self-skipping when the secret is
// unset, and — critically — OFF the PR/commit critical path (nightly schedule / workflow_dispatch,
// never pull_request/push/merge_group, which fire constantly). This is the CI home for live E2E.
const SANCTIONED_OPENROUTER_WORKFLOWS = [
  '.github/workflows/studio-e2e-nightly.yml', // nightly Studio live-AI E2E — ~1c/night, self-skips without the secret (#696)
];

// docs/ CODE files, incl. `.astro` — whose build-time frontmatter runs at build and inlines
// its result into the STATIC bundle, so a key read there ships to the browser. A DEDICATED
// walk: the shared listSourceFiles omits `.astro` (and widening it would change what HARD
// RULE #22 scans). Walks all of docs/ so docs/astro.config.* and build scripts are covered.
// Prose `.md` is intentionally excluded — a doc may name the var without shipping it.
const DOCS_CODE_EXT = /\.(?:astro|ts|tsx|js|mjs|cjs)$/;
function listDocsCodeFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    // Skip generated/vendor trees AND `e2e/` (Playwright specs are test code, not compiled
    // into the shipped bundle) — invariant 1 guards the SITE BUILD, not tests.
    if (['node_modules', 'dist', '.astro', 'e2e'].includes(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listDocsCodeFiles(p, out);
    // `.spec`/`.test` files don't ship either — exclude them from the site-exposure scan.
    else if (DOCS_CODE_EXT.test(e.name) && !/\.(?:spec|test)\.[jt]sx?$/.test(e.name)) out.push(p);
  }
  return out;
}

function checkOpenRouterBudget(errors) {
  // Invariant 1 — no exposure to the deployed site (incl. `.astro` build-time frontmatter).
  for (const file of listDocsCodeFiles(path.join(ROOT, 'docs'))) {
    if (OPENROUTER_KEY_NAME.test(fs.readFileSync(file, 'utf8'))) {
      errors.push(
        `${path.relative(ROOT, file)} references OPEN_ROUTER_KEY — our server-side key must NEVER ` +
        `reach the site (HARD RULE #24). The deployed docs are a static bundle; the Playground uses ` +
        `the USER's own OpenRouter key via OAuth. A reference here leaks our key into the bundle and ` +
        `spends our budget on the live site. Keep the site bring-your-own-key.`,
      );
    }
  }
  // Invariant 2a — no spend in the automated suite. We key on OUR env key NAME only, NOT the
  // openrouter.ai endpoint: spending our budget REQUIRES our key, and forbidding the endpoint
  // would wrongly flag the GOOD patterns — a Playwright/integration test that MOCKS the API
  // (`page.route('**/openrouter.ai/**', …)`) or drives the Playground on the USER's own / a test
  // key. Only a COMMITTED test that reads OUR key (and would then run in CI) is the budget hole.
  // (The bare name also catches bracket/destructure reads.)
  for (const file of listSourceFiles(path.join(ROOT, 'test'))) {
    const rel = path.relative(ROOT, file);
    if (OPENROUTER_SCAN_EXEMPT.has(rel)) continue;
    if (OPENROUTER_KEY_NAME.test(fs.readFileSync(file, 'utf8'))) {
      errors.push(
        `${rel} reads OPEN_ROUTER_KEY (HARD RULE #24) — the automated suite must never spend our ` +
        `budget. Mock the LLM (a page.route interceptor or the user-key Playground flow is fine), or ` +
        `run a real eval on demand via ${SANCTIONED_OPENROUTER_SPENDERS.join(', ')}. A throwaway ` +
        `prototype that hits the live API belongs in .scratch/ (gitignored, not shipped, not in CI).`,
      );
    }
  }
  // Invariant 2b — a workflow may spend the key ONLY if it's sanctioned AND runs off the
  // PR/commit critical path (nightly schedule / workflow_dispatch, budgeted, self-skipping when
  // the secret is unset). pull_request/push/merge_group fire constantly = the budget hole a
  // sanction can't bless. See engineering/decisions/2026-06-13-gate-strategy-change-detection.md.
  const wfDir = path.join(ROOT, '.github', 'workflows');
  const seenWf = new Set();
  if (fs.existsSync(wfDir)) {
    for (const f of fs.readdirSync(wfDir)) {
      if (!/\.ya?ml$/.test(f)) continue;
      const rel = `.github/workflows/${f}`;
      const src = fs.readFileSync(path.join(wfDir, f), 'utf8');
      if (!OPENROUTER_KEY_NAME.test(src)) continue;
      seenWf.add(rel);
      const header = src.split(/^jobs:/m)[0]; // the `on:` triggers live above `jobs:`
      const onPrPath = /^\s{1,4}(pull_request|push|merge_group)\s*:/m.test(header);
      if (!SANCTIONED_OPENROUTER_WORKFLOWS.includes(rel)) {
        errors.push(
          `${rel} references OPEN_ROUTER_KEY (HARD RULE #24) — a workflow may spend our budget only if ` +
          `it is a sanctioned, budgeted, nightly/dispatch live tier. Add it to ` +
          `SANCTIONED_OPENROUTER_WORKFLOWS in tools/check-ownership.js with justification, keep it OFF ` +
          `pull_request/push, and have it self-skip when the secret is unset.`,
        );
      } else if (onPrPath) {
        errors.push(
          `${rel} is a sanctioned OpenRouter workflow but triggers on pull_request/push/merge_group ` +
          `(HARD RULE #24) — a live-key tier must run nightly/dispatch only, off the PR critical path, ` +
          `or it spends our budget on every PR.`,
        );
      }
    }
  }
  // Anti-rot: a sanctioned workflow must still exist and still use the key.
  for (const rel of SANCTIONED_OPENROUTER_WORKFLOWS) {
    if (!seenWf.has(rel)) {
      errors.push(
        `stale OpenRouter workflow sanction in tools/check-ownership.js — ${rel} no longer references ` +
        `OPEN_ROUTER_KEY (or is gone). Remove the SANCTIONED_OPENROUTER_WORKFLOWS entry.`,
      );
    }
  }
  // Invariant 2c — no `test`-family npm script invokes a spender.
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  for (const [name, cmd] of Object.entries(pkg.scripts || {})) {
    if (name.startsWith('test') && /component-gen-eval|OPEN_ROUTER_KEY/.test(cmd)) {
      errors.push(
        `package.json script "${name}" invokes an OpenRouter spender (HARD RULE #24) — a \`test\` ` +
        `script must never spend our budget. Keep the eval on its own on-demand script.`,
      );
    }
  }
  // Anti-rot: every sanctioned spender must still exist.
  for (const rel of SANCTIONED_OPENROUTER_SPENDERS) {
    if (!fs.existsSync(path.join(ROOT, rel))) {
      errors.push(
        `stale OpenRouter sanction in tools/check-ownership.js — ${rel} no longer exists (HARD RULE #24). ` +
        `Remove the SANCTIONED_OPENROUTER_SPENDERS entry.`,
      );
    }
  }
}

// ── Voice-sample assets (docs/public/voice-samples) — the TTS preview cache ──
// The Studio's "Play sample" button plays a pre-generated file for a curated cloud
// voice instead of hitting the live (paid) OpenRouter TTS endpoint on every click
// (HARD RULE #24 §OpenRouter budget). tools/generate-voice-samples.mjs is the ONLY
// writer of docs/public/voice-samples/; this just keeps it honest against
// tts-voice-catalog.json — every requiresAsset engine's roster has exactly the
// files it should, no more, no less. The directory is generated on-demand (not
// committed by this repo's own CI, since it needs a live OpenRouter key), so an
// absent directory is NOT an error — only a present-but-mismatched one is.
const VOICE_CATALOG_PATH = path.join(ROOT, 'docs', 'src', 'playground', 'tts-voice-catalog.json');
const VOICE_SAMPLES_DIR = path.join(ROOT, 'docs', 'public', 'voice-samples');

function checkVoiceSampleAssets(errors) {
  if (!fs.existsSync(VOICE_SAMPLES_DIR)) return; // not generated in this checkout — fine, it's opt-in tooling
  const catalog = JSON.parse(fs.readFileSync(VOICE_CATALOG_PATH, 'utf8'));
  const engines = catalog.engines || {};
  const seenDirs = fs.readdirSync(VOICE_SAMPLES_DIR, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);

  for (const [slug, def] of Object.entries(engines)) {
    const dir = path.join(VOICE_SAMPLES_DIR, slug);
    if (!def.requiresAsset) {
      if (seenDirs.includes(slug)) {
        errors.push(
          `docs/public/voice-samples/${slug}/ exists but requiresAsset is false for "${slug}" in ` +
          `tts-voice-catalog.json — either flip requiresAsset to true (it now needs the cache) or ` +
          `delete the stale directory.`,
        );
      }
      continue;
    }
    if (!fs.existsSync(dir)) {
      errors.push(
        `docs/public/voice-samples/${slug}/ is missing — "${slug}" is requiresAsset:true in ` +
        `tts-voice-catalog.json. Run tools/generate-voice-samples.mjs --engine ${slug} ` +
        `(OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1) to populate it, or set requiresAsset:false if ` +
        `it no longer needs caching.`,
      );
      continue;
    }
    const ext = def.audioFormat === 'wav' ? 'wav' : 'mp3';
    // Mirrors tools/generate-voice-samples.mjs's own safeFilename EXACTLY — a voice
    // id can carry a ":" (invalid in a Windows filename, e.g. MAI-Voice-2's ids).
    const want = new Set(def.cachedVoices.map((id) => `${id.replace(/:/g, '_')}.${ext}`));
    // The full listing (not filtered to `.${ext}`) — a file with the WRONG
    // extension (e.g. a stray .mp3 in a wav-format engine's directory) is exactly
    // as orphaned as one with a retired voice id, and should be flagged the same way.
    const have = new Set(fs.readdirSync(dir));
    for (const f of want) {
      if (!have.has(f)) {
        errors.push(
          `docs/public/voice-samples/${slug}/${f} is missing — run tools/generate-voice-samples.mjs ` +
          `--engine ${slug} (OPEN_ROUTER_KEY=… OPENROUTER_ALLOW_SPEND=1) to (re)generate it.`,
        );
      }
    }
    for (const f of have) {
      if (!want.has(f)) {
        errors.push(
          `docs/public/voice-samples/${slug}/${f} is a stale/orphaned sample — its voice id isn't in ` +
          `tts-voice-catalog.json's "${slug}" roster anymore. Delete it, or restore the voice to the catalog.`,
        );
      }
    }
  }
  for (const slug of seenDirs) {
    if (!(slug in engines)) {
      errors.push(
        `docs/public/voice-samples/${slug}/ has no matching engine in tts-voice-catalog.json — delete ` +
        `the stale directory.`,
      );
    }
  }
}

// ── Vetrina (docs/src/lib/vetrina) — the walkthrough library ────────────────
// Two structural antibodies from the design's Munger-inversion pass
// (engineering/decisions/2026-07-05-vetrina-walkthrough-library.md §13, §6.1):
// keep the open-sourceable core mechanically decoupled, and freeze the gesture
// alphabet so it can't sprawl into a sticker pack. Same allowlist + anti-rot
// shape the repo already trusts for margins / hex / preview-sinks (HARD RULE #15).

const VETRINA_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'vetrina');
// The core is framework-free and self-contained: every import must resolve
// INSIDE the folder (`./x`). A bare specifier (npm dep) or a `../` escape couples
// it to the host and breaks the "standalone, zero host deps" promise (§13). The
// one sanctioned outside dep is `react`/`react-dom` in the thin adapter, which
// §13 designates the peer-dep seam — keyed to that filename so nothing else can
// launder a host import through it.
const VETRINA_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/g;
const VETRINA_ADAPTER = 'react.ts'; // the sole file allowed to import the peer framework
const VETRINA_ADAPTER_DEPS = new Set(['react', 'react-dom']);

function checkVetrinaBoundary(errors) {
  if (!fs.existsSync(VETRINA_DIR)) return; // library not present — nothing to guard
  for (const file of listSourceFiles(VETRINA_DIR)) {
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.js')) continue; // tests use the dev test runner (a devDep, not host coupling)
    const isAdapter = base === VETRINA_ADAPTER;
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(VETRINA_IMPORT)) {
      const spec = m[1];
      if (spec.startsWith('./')) continue; // in-folder relative — fine
      if (spec.startsWith('node:')) continue; // node built-in — allowed (SSR-safe core)
      if (isAdapter && VETRINA_ADAPTER_DEPS.has(spec)) continue; // the sanctioned peer-dep seam
      errors.push(
        `${rel} imports '${spec}', which escapes the Vetrina folder. The walkthrough library is ` +
        `open-sourceable and MUST stay self-contained (design doc §13): imports resolve inside ` +
        `docs/src/lib/vetrina/ (\`./x\`) only. The one exception is react/react-dom in the ${VETRINA_ADAPTER} ` +
        `adapter (the peer-dep seam). Move shared code into the folder, or route host glue through the adapter.`,
      );
    }
  }
}

// ── Cadenza (docs/src/lib/cadenza) — the caption/timeline engine ────────────
// The same self-containment antibody as Vetrina, and stricter: Cadenza is the
// pure timing/caption core (engineering/decisions/2026-07-07-cadenza-caption-timeline.md)
// and is designed to SPIN OFF as a zero-dependency library. It owns no audio and
// no DOM and has NO peer-dep seam, so EVERY import must resolve inside the folder
// (`./x`); a bare specifier (npm/Lattice dep) or a `../` escape breaks the "zero
// Lattice deps / spin-off-able" promise the ADR repeatedly makes.
const CADENZA_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'cadenza');
const CADENZA_IMPORT = /(?:^|\n)\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]/g;

function checkCadenzaBoundary(errors) {
  if (!fs.existsSync(CADENZA_DIR)) return; // library not present — nothing to guard
  for (const file of listSourceFiles(CADENZA_DIR)) {
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.js')) continue; // tests use the dev runner (vitest), not host coupling
    const src = fs.readFileSync(file, 'utf8');
    for (const m of src.matchAll(CADENZA_IMPORT)) {
      const spec = m[1];
      if (spec.startsWith('./')) continue; // in-folder relative — fine
      if (spec.startsWith('node:')) continue; // node built-in — allowed (SSR-safe core)
      errors.push(
        `${rel} imports '${spec}', which escapes the Cadenza folder. The caption/timeline engine is ` +
        `zero-dependency and spin-off-able (2026-07-07-cadenza-caption-timeline.md): every import must ` +
        `resolve inside docs/src/lib/cadenza/ (\`./x\`). Move shared code into the folder — Cadenza has no ` +
        `peer-dep seam and must not couple to the host.`,
      );
    }
  }
}

// The gesture alphabet is a CURATED vocabulary, not a motion library: a gesture
// earns its place by carrying a distinct MEANING the eye reads (§6.1), so the
// `Gesture` union in stage.ts is frozen to exactly this registry. Adding one is
// an allowlist edit that forces the "what meaning?" question — a NEW member in
// the type that isn't sanctioned fails, and a stale sanction the type dropped
// fails, so the two can't drift.
const SANCTIONED_GESTURES = {
  wave: 'greeting / hello (the opening flourish)',
  circle: '"look here / this just rendered" — a glow on the bounding box + the cursor orbiting it',
  check: 'success / done / correct',
  cross: 'wrong / rejected / deleted',
  shake: '"no — careful / try again" (universal negation)',
};

function checkSanctionedGestures(errors) {
  const stage = path.join(VETRINA_DIR, 'stage.ts');
  if (!fs.existsSync(stage)) return; // library not present
  const src = fs.readFileSync(stage, 'utf8');
  const decl = src.match(/export\s+type\s+Gesture\s*=\s*([^;]+);/);
  if (!decl) {
    errors.push(
      `Vetrina: could not find the \`export type Gesture = …\` union in docs/src/lib/vetrina/stage.ts — ` +
      `the SANCTIONED_GESTURES gate can't verify the frozen alphabet (§6.1). Restore the declaration.`,
    );
    return;
  }
  const declared = new Set((decl[1].match(/'([a-z]+)'/g) || []).map((s) => s.replace(/'/g, '')));
  const sanctioned = new Set(Object.keys(SANCTIONED_GESTURES));
  for (const g of declared) {
    if (!sanctioned.has(g)) {
      errors.push(
        `Vetrina: gesture '${g}' is declared in the Gesture union but not in SANCTIONED_GESTURES ` +
        `(§6.1 / HARD RULE #15). A gesture earns its place by carrying a distinct MEANING — add '${g}' ` +
        `to SANCTIONED_GESTURES in tools/check-ownership.js with the meaning it says, or drop it.`,
      );
    }
  }
  for (const g of sanctioned) {
    if (!declared.has(g)) {
      errors.push(
        `Vetrina: SANCTIONED_GESTURES lists '${g}', but the Gesture union in stage.ts no longer declares ` +
        `it — remove the stale entry so the frozen alphabet stays honest (§6.1).`,
      );
    }
  }
}

// ── Runner ────────────────────────────────────────────────────────────────

// Prose-density coverage — every TEXT-BEARING layout declares a `density` word
// budget, or is on the exempt allowlist with its reason. Without this gate the
// 26 hand-set budgets silently rot and a NEW prose layout ships unbudgeted with
// no error (the red-team's #4). Allowlist + anti-rot, same shape as #20/#22: a
// component with neither density nor an exempt entry fails (forces the
// budget-or-exempt decision); a stale exempt entry — a name that no longer
// exists, OR one that now HAS a density block — also fails, so the list can't
// drift. The boundary test (decision doc §6): can the author tighten this
// element's words without losing required content? If not (data viz, code,
// figures, anchors, [x]-cell grids, verbatim citations, single-block prose),
// it's exempt. See engineering/decisions/2026-06-30-prose-density-budget.md.
const SANCTIONED_DENSITY_EXEMPT = {
  // anchors — bookends; covered by the universal title/eyebrow/subtitle budgets.
  title: 'bookend — universal title/eyebrow budgets cover it',
  divider: 'bookend — section break, minimal text',
  closing: 'bookend — universal budgets cover it',
  // data viz — content is a data series/graph, not prose.
  funnel: 'data viz — series, not prose',
  gantt: 'data viz — schedule, not prose',
  journey: 'data viz — stage map, not prose bodies',
  map: 'data viz — geographic series',
  piechart: 'data viz — series',
  progress: 'data viz — series',
  quadrant: 'data viz — scatter',
  radar: 'data viz — scatter series',
  roadmap: 'data viz — timeline matrix',
  'state-chart': 'data viz — state graph',
  'word-cloud': 'data viz — weighted terms, not prose',
  // code — budgeted by line count, not words.
  code: 'code — line-based, not word-based',
  'compare-code': 'code — line-based',
  // figural — non-prose substance.
  diagram: 'figural — graph, not prose',
  math: 'figural — typeset equation',
  image: 'figural — picture',
  video: 'figural — poster + QR, not prose (heading/caption are universal budgets)',
  'logo-wall': 'figural — logos',
  // connect — QR cards; fields are credentials/identity values (ssid, email), not prose.
  wifi: 'connect — Wi-Fi credentials, not prose',
  contact: 'connect — vCard identity fields, not prose',
  // data grids — [x]/checkmark cells / feature matrices; word-counting mis-fires.
  'obligation-matrix': 'data grid — [x] cells, not prose',
  pricing: 'data grid — feature checklist, terse labels',
  // verbatim — a quoted statute is intentionally long; trimming would falsify it.
  'citation-card': 'verbatim — a cited statute, not authorable prose',
  // single-block prose — one block, governed by the universal key-insight/title
  // budgets + the whole-slide wall-of-text rule, not a per-element axis.
  quote: 'single-block — one quotation, key-insight budget applies',
  'big-number': 'single-block — a hero number + short caption',
  content: 'single-block — freeform prose, wall-of-text rule governs it',
  redline: 'single-block — a diff, not item prose',
};

function checkDensityCoverage(manifests, errors) {
  const names = new Set(manifests.map((m) => m.name));
  for (const m of manifests) {
    if (m.density) continue;
    if (!(m.name in SANCTIONED_DENSITY_EXEMPT)) {
      errors.push(
        `${m.name}: no \`density\` word budget and not on the exempt allowlist. Either add a ` +
        `density block (calibrate with tools/calibrate-density.js) or, if its elements aren't ` +
        `authorable prose, add it to SANCTIONED_DENSITY_EXEMPT in tools/check-ownership.js with ` +
        `its reason. See engineering/decisions/2026-06-30-prose-density-budget.md §6.`,
      );
    }
  }
  // Anti-rot: every exempt entry must name a real component that still lacks a
  // density block — otherwise the exemption is stale.
  for (const name of Object.keys(SANCTIONED_DENSITY_EXEMPT)) {
    if (!names.has(name)) {
      errors.push(`SANCTIONED_DENSITY_EXEMPT lists '${name}', which is not a component — remove the stale entry.`);
    } else if (manifests.find((m) => m.name === name)?.density) {
      errors.push(`SANCTIONED_DENSITY_EXEMPT lists '${name}', but it now HAS a density block — remove the stale exemption.`);
    }
  }
}

// HARD RULE (chart-color static palette, 2026-07-12) — the chart family ships FLAT paint.
// The `@supports not (light-dark)` fork is deleted; every chart colour compiles at build time to a
// flat literal read via plain `var()`. A modern colour FUNCTION (`color-mix()`/`light-dark()`) in a
// shipped chart PAINT — or a `var()`/modern-fn in a `fill=`/`stroke=`/`stop-color=` presentation
// ATTRIBUTE (flaky on old WebKit) — is the exact regression the compilation exists to end: it drops
// to black on old engines while riding through modern-only CI unseen (#925/#936). This gate scans the
// shipped chart surface and fails the build on any such paint. The `>>> chart-palette-recipe >>>`
// regions ARE the sanctioned build-time colour SOURCE (stripped from the bundle, compiled to planes),
// so they're excluded. See engineering/decisions/2026-07-12-chart-color-static-palette.md.
const CHART_PAINT_DIRS = [
  path.join(LIB_DIR, 'components', 'chart'),
  path.join(LIB_DIR, 'components', 'math'),
  path.join(LIB_DIR, 'integrations', 'mermaid'),
];

// Remove each `>>> chart-palette-recipe … <<< chart-palette-recipe` region — the whole enclosing
// comment span (the sentinels live inside `/* … */`), so the recipe's build-time color-mix SOURCE
// is not mistaken for a shipped paint.
function stripRecipeRegions(css) {
  let out = '';
  let i = 0;
  for (;;) {
    const marker = css.indexOf('>>> chart-palette-recipe', i);
    if (marker === -1) { out += css.slice(i); break; }
    const open = css.lastIndexOf('/*', marker);
    const closeMarker = css.indexOf('<<< chart-palette-recipe', marker);
    if (closeMarker === -1) { out += css.slice(i); break; } // unterminated — the compiler errors on this
    const close = css.indexOf('*/', closeMarker);
    out += css.slice(i, open === -1 ? marker : open);
    i = close === -1 ? css.length : close + 2;
  }
  return out;
}

function checkChartPaintFlatness(errors) {
  // (1) CSS — with the recipe regions removed, NO color-mix()/light-dark() may remain anywhere in the
  // chart CSS (a paint OR an un-compiled token def; the recipe region is the only sanctioned home).
  for (const dir of CHART_PAINT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of listCssFiles(dir)) {
      const rel = path.relative(ROOT, file);
      const css = stripComments(stripRecipeRegions(fs.readFileSync(file, 'utf8')));
      for (const m of css.matchAll(/([a-zA-Z-]+)\s*:\s*([^;{}]*(?:color-mix|light-dark)\([^;{}]*)/g)) {
        errors.push(
          `chart paint flatness: ${rel} — \`${m[1]}: ${m[2].trim().slice(0, 70)}\` ships ` +
          `color-mix()/light-dark() outside a \`>>> chart-palette-recipe >>>\` region. Old WebKit ` +
          `drops it (→ black). Move the formula into the component's recipe region so it compiles to ` +
          `a flat token, and read it via plain var(). See 2026-07-12-chart-color-static-palette.md.`,
        );
      }
    }
  }
  // (2) Transforms — inline `style="…color-mix/light-dark…"` in emitted SVG, and `var()`/modern-fn in
  // a `fill=`/`stroke=`/`stop-color=` presentation ATTRIBUTE (flaky on old WebKit → black).
  for (const dir of CHART_PAINT_DIRS) {
    if (!fs.existsSync(dir)) continue;
    for (const file of listSourceFiles(dir)) {
      if (!file.endsWith('.js')) continue;
      const rel = path.relative(ROOT, file);
      const js = stripComments(fs.readFileSync(file, 'utf8'));
      for (const m of js.matchAll(/style=(["'`])([^"'`]*(?:color-mix|light-dark)\([^"'`]*)\1/g)) {
        errors.push(
          `chart paint flatness: ${rel} — inline \`style="${m[2].slice(0, 60)}"\` emits ` +
          `color-mix()/light-dark() in an SVG paint (breaks old WebKit → black). Read a compiled ` +
          `--chart-cat-N-* / component recipe token via plain var() instead.`,
        );
      }
      for (const m of js.matchAll(/\b(fill|stroke|stop-color)=(["'`])((?:var\(|[^"'`]*(?:color-mix|light-dark)\()[^"'`]*)\2/g)) {
        errors.push(
          `chart paint flatness: ${rel} — \`${m[1]}="${m[3].slice(0, 50)}"\` puts var()/color-mix() ` +
          `in a PRESENTATION ATTRIBUTE (flaky on old WebKit → black). Move it to a CSS rule ` +
          `(\`${m[1]}: var(--token)\` keyed on a class) — CSS var() is old-safe.`,
        );
      }
    }
  }
}

function run() {
  const manifests = loadAll();
  const errors = [];
  checkTransformerNames(errors);
  checkLayoutOwnership(errors);
  checkComponentNames(manifests, errors);
  checkComponentCss(manifests, errors);
  checkVariantDeclaration(manifests, errors);
  checkTagClustering(manifests, errors);
  checkThemeTokenParity(errors);
  checkRetiredTokenNames(errors);
  checkTypographyTokens(errors);
  checkMarginDiscipline(errors);
  checkHexLiterals(errors);
  checkUsEnglish(errors);
  checkAdaptDeclarations(manifests, errors);
  checkSolverIntentDeclared(manifests, errors);
  checkDensityCoverage(manifests, errors);
  checkPreviewHtmlSinks(errors);
  checkSnapshotHtmlSinks(errors);
  checkOpenRouterBudget(errors);
  checkVoiceSampleAssets(errors);
  checkVetrinaBoundary(errors);
  checkCadenzaBoundary(errors);
  checkSanctionedGestures(errors);
  checkChartPaintFlatness(errors);
  return {
    errors,
    counts: {
      transformers: TRANSFORMERS.length,
      components: manifests.length,
      buckets: BUCKETS.length,
      palettes: listBasePalettes().length,
    },
  };
}

function main(argv) {
  const { errors, counts } = run();
  if (argv.includes('--json')) {
    process.stdout.write(`${JSON.stringify({ ok: errors.length === 0, errors, counts }, null, 2)}\n`);
    return errors.length === 0 ? 0 : 1;
  }
  if (errors.length) {
    process.stderr.write(`ownership check FAILED — ${errors.length} collision(s):\n\n`);
    for (const e of errors) process.stderr.write(`  ✗ ${e}\n\n`);
    return 1;
  }
  process.stdout.write(
    `ownership check OK — ${counts.transformers} transformers, ${counts.components} components ` +
    `across ${counts.buckets} buckets, ${counts.palettes} palettes. No accidental collisions.\n`,
  );
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  run,
  topLevelSelectors,
  splitTopLevel,
  splitCompounds,
  isScopedTo,
  classTokens,
  cssRootModifierTokens,
  transformModifierTokens,
  checkVariantDeclaration,
  checkAdaptDeclarations,
  checkSolverIntentDeclared,
  checkDensityCoverage,
  SANCTIONED_DENSITY_EXEMPT,
  checkTagClustering,
  checkRetiredTokenNames,
  RETIRED_TOKEN_NAMES,
  checkTypographyTokens,
  nonCanonicalFsTokens,
  offendingMargins,
  checkMarginDiscipline,
  LAYOUT_MARGIN_BUDGET,
  SANCTIONED_MARGINS,
  checkPreviewHtmlSinks,
  checkSnapshotHtmlSinks,
  SANCTIONED_SNAPSHOT_SINKS,
  SNAPSHOT_INJECT_MARKER,
  SNAPSHOT_WRITE_MARKER,
  SNAPSHOT_KEY_LITERAL,
  listSnapshotFiles,
  referencesSnapshot,
  checkOpenRouterBudget,
  SANCTIONED_OPENROUTER_SPENDERS,
  SANCTIONED_OPENROUTER_WORKFLOWS,
  checkVoiceSampleAssets,
  listSourceFiles,
  SANCTIONED_PREVIEW_BUILDERS,
  PREVIEW_BUILDER_MARKER,
  SANITIZE_CALL,
  checkHexLiterals,
  LAYOUT_HEX_BUDGET,
  SANCTIONED_HEX,
  checkUsEnglish,
  listRepoTextFiles,
  UK_ENGLISH_FORMS,
  US_ENGLISH_BUDGET,
  CANONICAL_FS_TOKENS,
  parseThemeTokens,
  listBasePalettes,
  CO_OWNED_LAYOUTS,
  SHARED_SELECTORS,
  REQUIRED_THEME_TOKENS,
  SINGLETON_TAGS,
  checkVetrinaBoundary,
  checkCadenzaBoundary,
  checkSanctionedGestures,
  SANCTIONED_GESTURES,
  checkChartPaintFlatness,
  stripRecipeRegions,
  CHART_PAINT_DIRS,
  VETRINA_DIR,
  VETRINA_ADAPTER,
  VETRINA_IMPORT,
};
