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
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { EXTRA_NAMES, EXTRA_GALLERIES } = require('./build-bucket-galleries');
const {
  loadAll, manifestBucket, BUCKETS,
  UNIVERSAL_VARIANTS, SEMI_UNIVERSAL_VARIANTS, TAGS,
} = require('../lib/components');
const { TRANSFORMERS } = require('../lib/transformers/registry');
const { PAIRS: TOKEN_CROSSWALK } = require('../lib/tokens/crosswalk');
const { findHexLiterals } = require('../lib/layout/gate'); // HARD RULE #3 hex matcher (reused, not reinvented)
const { FINISH_REGISTER } = require('../lib/core/resolve-finish'); // skill-freshness: authoritative finish list
const { resolveTokenExpr } = require('../lib/core/resolve-token-expr'); // cat-contrast: the engine's own custom-property evaluator (reused, not reinvented)
const { oklabDistance } = require('../lib/theme/color.js'); // cat-contrast: perceptual distance for the ink collapse arm
// changelog fragments: the assembler owns the format — this gate only reports it (reused, not reinvented)
const { fragmentProblems: changelogFragmentProblems } = require('./changelog');
// #1595: the contrast floor a token's value must meet, read off its role-based name.
// One source — the floors live there, not here (reused, not reinvented).
const { contractDrop, contractOf, SANCTIONED_TOKEN_CONTRACTS } = require('../lib/tokens/contracts');
// font-metrics pin: the table and the digests live together, beside what they
// describe — this gate only compares them against the bytes on disk.
const { GLYPH_UPPER, GLYPH_UPPER_FONTS } = require('../lib/components/chart/_chart-family/svg-label');

const ROOT = path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const THEMES_DIR = path.join(ROOT, 'themes');
const LIB_DIR = path.join(ROOT, 'lib');
const SKILLS_DIR = path.join(ROOT, 'design', 'skills');
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
  // Both halves of the muted tier (#1715). `--muted-mark` is here for the same reason
  // the rest are: 73 engine reads consume it with no engine fallback, so a palette that
  // omits it drops every rule, hairline, grid line and skipped mark it paints.
  '--text-heading', '--text-body', '--text-secondary', '--text-muted', '--muted-mark',
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

// ── Theme manifests: the ONE scope declaration ─────────────────────────────
//
// `themes/<name>.manifest.json` declares a palette's IDENTITY and ROLE — never a
// token name and never a token value. That split is the whole design: the manifest
// owns SCOPE (which themes a rule applies to), the code owns CONTRACT (what the
// rule requires). A manifest that listed tokens would be a second copy of the CSS,
// and this repo has already run that experiment — `token-parity.test.js` and
// `theme-scorecard.js` are two hand-written token lists of one contract and they
// drifted (95 vs 91), with `carta` missing from both.
//
// Scope used to be inferred three different, non-nested ways (this function's
// `@import 'lattice'` predicate → 14 files; `checkCatInkDeclared`'s per-file
// `--cat-1-mark` heuristic → 15; `derive-cat-ink.js`'s → 15) plus five hardcoded
// name arrays. `carta` fell out of two of them entirely and was gated by neither.
// Now it is declared once and read everywhere. See
// engineering/decisions/2026-08-09-theme-token-contract.md.

/** Every theme manifest, keyed by name. Throws on malformed JSON — a manifest that
 *  cannot be read is a build failure, not a silently skipped file. */
function listThemeManifests(themesDir = THEMES_DIR) {
  const out = new Map();
  for (const file of fs.readdirSync(themesDir).sort()) {
    if (!file.endsWith('.manifest.json')) continue;
    const p = path.join(themesDir, file);
    let m;
    try {
      m = JSON.parse(fs.readFileSync(p, 'utf8'));
    } catch (e) {
      throw new Error(`themes/${file} is not valid JSON: ${e.message}`);
    }
    // `null`, an array, or a scalar all parse fine and then blow up as a raw TypeError
    // in whichever gate touches them first. Fail here, where the message names the file.
    if (m === null || typeof m !== 'object' || Array.isArray(m)) {
      throw new Error(`themes/${file} must be a JSON object (got ${Array.isArray(m) ? 'an array' : String(m === null ? 'null' : typeof m)}).`);
    }
    out.set(file.replace(/\.manifest\.json$/, ''), m);
  }
  return out;
}

/** Theme CSS files on disk, by name. */
function listThemeFiles(themesDir = THEMES_DIR) {
  const out = new Map();
  for (const file of fs.readdirSync(themesDir).sort()) {
    if (!file.endsWith('.css')) continue;
    out.set(file.replace(/\.css$/, ''), fs.readFileSync(path.join(themesDir, file), 'utf8'));
  }
  return out;
}

/**
 * Base palettes — the themes that declare the full token contract.
 *
 * SCOPE COMES FROM THE MANIFEST (`role: "base"`), not from re-sniffing the CSS.
 * `checkThemeRoles` separately proves every declared role matches what the file
 * actually does, so this stays honest without every caller re-deriving it.
 */
function listBasePalettes() {
  const manifests = listThemeManifests();
  const files = listThemeFiles();
  const out = [];
  for (const [name, m] of manifests) {
    if (m.role !== 'base') continue;
    const css = files.get(name);
    if (css === undefined) continue; // G1 reports the orphan; don't double-fail here
    out.push({ name, tokens: parseThemeTokens(css), manifest: m });
  }
  return out;
}


// ── Checks ──────────────────────────────────────────────────────────────────

/** Surface tokens whose light/dark arms decide whether a palette has two faces. */
const FACE_TOKENS = ['bg', 'bg-alt', 'text-body', 'text-heading', 'border', 'accent'];

/**
 * The palette's own root `color-scheme`, WITH its specificity — which is load-bearing:
 *
 *   `:where(:root) { color-scheme: light }`  a zero-specificity DEFAULT. Every base
 *                                           palette ships one; an author override wins.
 *   `:root { color-scheme: dark }`           a PIN. The `-dark` wrappers use this.
 *   `:root { … }` + `:root:root { … }`       a HARD pin, declared at BOTH (a11y-base: color-vision
 *                                           separation is tuned for one canvas).
 *
 * A pin narrows the palette to one face. A default does not — carbone ships a `dark`
 * default and is dark-only for a different reason: it declares FLAT surface hexes and
 * opts out of `light-dark()` switching entirely (`themes/carbone.css` says so in its
 * own header), so there is no second face to resolve.
 */
function themeRootScheme(cssText) {
  const css = stripComments(cssText);
  const pin = /^[ \t]*(:root(?::root)*)\s*\{[^}]*color-scheme\s*:\s*([a-z]+)/m.exec(css);
  if (pin) return { mode: pin[2], pinned: true };
  const def = /:where\(:root\)\s*\{[^}]*color-scheme\s*:\s*([a-z]+)/.exec(css);
  if (def) return { mode: def[1], pinned: false };
  return null;
}

/**
 * Split `light-dark(A, B)` into its two arms, PAREN-AWARE.
 *
 * A naive `/light-dark\(\s*([^,]+),\s*([^)]+)\)/` gets both arms wrong the moment one
 * contains a comma or a paren of its own — `light-dark(var(--x), var(--x))` truncates
 * the second arm to `var(--x` and reads as two DIFFERENT arms, which is the exact
 * false-negative this gate exists to prevent (a palette re-tuned to degenerate arms
 * would keep its declared second face and the gate would stay green). Shipped palettes
 * happen to use `light-dark(#hex, var(--scheme-dark-*))`, so the naive form was right
 * only by luck of the arm ordering.
 */
function splitLightDark(value) {
  const open = value.indexOf('light-dark(');
  if (open === -1) return null;
  let depth = 0;
  let comma = -1;
  const start = open + 'light-dark('.length;
  for (let i = start; i < value.length; i += 1) {
    const c = value[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      if (depth === 0) {
        return comma === -1 ? null : [value.slice(start, comma).trim(), value.slice(comma + 1, i).trim()];
      }
      depth -= 1;
    } else if (c === ',' && depth === 0 && comma === -1) comma = i;
  }
  return null;
}

/** True when any surface token declares a genuinely different light vs dark arm. */
function themeArmsDiffer(cssText) {
  const css = stripComments(cssText);
  for (const t of FACE_TOKENS) {
    // `(?:^|[;{\s])` so `--panel-bg:` can never be read as `--bg:`.
    const m = new RegExp(`(?:^|[;{\\s])--${t}\\s*:\\s*([^;]+);`, 'm').exec(css);
    if (!m) continue;
    const arms = splitLightDark(m[1]);
    if (arms && arms[0] !== arms[1]) return true;
  }
  return false;
}

/** The faces a palette actually has, derived from its CSS — the truth `modes` is checked against. */
function themeActualModes(name, files, manifests, seen = new Set()) {
  if (seen.has(name)) return ['light'];
  seen.add(name);
  const css = files.get(name);
  if (css === undefined) return ['light'];
  const scheme = themeRootScheme(css);
  if (scheme?.pinned) return [scheme.mode];
  if (themeArmsDiffer(css)) return ['light', 'dark'];
  const parent = manifests.get(name)?.extends;
  if (parent && files.has(parent)) return themeActualModes(parent, files, manifests, seen);
  return scheme ? [scheme.mode] : ['light', 'dark'];
}

/**
 * G1 — BIJECTION. Every `themes/*.css` has a manifest and every manifest has a file,
 * and the manifest's `name` matches its filename.
 *
 * This is the gate none of the eight previous theme enumerations could have. `carta`
 * is a shipped base palette that `token-parity.test.js` and `theme-scorecard.js` both
 * omitted from their hardcoded arrays, so neither checked it — for months, silently,
 * because a hardcoded list cannot report what is missing from it. A declared scope can.
 */
function checkThemeManifestCoverage(errors, themesDir = THEMES_DIR) {
  const files = listThemeFiles(themesDir);
  const manifests = listThemeManifests(themesDir);
  for (const name of files.keys()) {
    if (!manifests.has(name)) {
      errors.push(
        `themes/${name}.css has no manifest. Every theme declares its identity and role in ` +
        `themes/${name}.manifest.json (schema: themes/theme.schema.json) — that declaration is ` +
        'what every theme gate reads its scope from, so an undeclared palette is an ungated one.',
      );
    }
  }
  for (const [name, m] of manifests) {
    if (!files.has(name)) {
      errors.push(`themes/${name}.manifest.json has no themes/${name}.css. Delete the stale manifest or add the palette.`);
      continue;
    }
    if (m.name !== name) {
      errors.push(
        `themes/${name}.manifest.json declares name "${m.name}" but its filename says "${name}". ` +
        'The name IS the identifier a deck\'s `theme:` resolves to, so the two cannot disagree.',
      );
    }
  }
}

/**
 * G1b — THE MANIFEST MATCHES ITS SCHEMA.
 *
 * `themes/theme.schema.json` is the field reference, and until this gate existed it was
 * decoration: nothing in the repo runs a JSON-Schema validator, so a manifest could
 * omit a required field, misspell an enum value, or carry an unknown key and every gate
 * stayed green. That is not a wash against the hand-maintained lists this replaced — it
 * is worse. Deleting `tier` from `themes/indaco.manifest.json` drops the DEFAULT palette
 * out of `CURATED`, out of `BUILTIN_PALETTES`, out of the picker, and `StudioShell` then
 * resets every visitor sitting on it — all from one absent JSON field, where the old
 * breakage needed a visible name deleted from an array in a reviewed diff.
 *
 * Enforced FROM the schema file rather than a hand mirror of it, so the schema is the
 * single declaration it claims to be. Deliberately a small subset — `required`,
 * `additionalProperties`, `enum`, `type`, `pattern`, and the one `if/then/else` — which
 * is everything this schema actually uses. If it ever needs more, reach for a real
 * validator rather than growing this.
 */
function checkThemeManifestShape(errors, themesDir = THEMES_DIR) {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(path.join(THEMES_DIR, 'theme.schema.json'), 'utf8'));
  } catch (e) {
    errors.push(`themes/theme.schema.json could not be read: ${e.message}`);
    return;
  }
  const props = schema.properties ?? {};
  const typeOk = (v, t) => {
    const types = Array.isArray(t) ? t : [t];
    return types.some((x) => (
      x === 'string' ? typeof v === 'string'
        : x === 'integer' ? Number.isInteger(v)
          : x === 'array' ? Array.isArray(v)
            : x === 'null' ? v === null
              : x === 'object' ? (v && typeof v === 'object' && !Array.isArray(v))
                : false));
  };

  for (const [name, m] of listThemeManifests(themesDir)) {
    const where = `themes/${name}.manifest.json`;

    // Required — the base set, plus whichever arm of the conditional applies.
    const required = new Set(schema.required ?? []);
    for (const rule of schema.allOf ?? []) {
      const cond = rule.if?.properties ?? {};
      const matches = Object.entries(cond).every(([k, c]) => m[k] === c.const);
      for (const r of (matches ? rule.then : rule.else)?.required ?? []) required.add(r);
    }
    for (const r of required) {
      if (m[r] === undefined) errors.push(`${where} is missing required field \`${r}\` (see themes/theme.schema.json).`);
    }

    for (const [k, v] of Object.entries(m)) {
      if (k === '$schema') continue;
      const spec = props[k];
      if (!spec) {
        if (schema.additionalProperties === false) {
          errors.push(`${where} carries unknown field \`${k}\`. Add it to themes/theme.schema.json with its meaning, or remove it — an undeclared field is one no gate can check.`);
        }
        continue;
      }
      if (spec.enum && !spec.enum.includes(v)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\`, which is not one of ${spec.enum.map((x) => JSON.stringify(x)).join(' | ')}.`);
        continue;
      }
      if (spec.type && !typeOk(v, spec.type)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\` but the schema says ${JSON.stringify(spec.type)}.`);
        continue;
      }
      if (spec.pattern && typeof v === 'string' && !new RegExp(spec.pattern).test(v)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\`, which does not match ${spec.pattern}.`);
      }
      if (Number.isInteger(spec.minimum) && typeof v === 'number' && v < spec.minimum) {
        errors.push(`${where} has \`${k}: ${v}\`, below the minimum of ${spec.minimum}.`);
      }
      if (spec.items?.enum && Array.isArray(v)) {
        for (const item of v) {
          if (!spec.items.enum.includes(item)) {
            errors.push(`${where} has \`${k}\` containing ${JSON.stringify(item)}, which is not one of ${spec.items.enum.map((x) => JSON.stringify(x)).join(' | ')}.`);
          }
        }
        if (spec.uniqueItems && new Set(v).size !== v.length) errors.push(`${where} has duplicate entries in \`${k}\`.`);
        if (Number.isInteger(spec.minItems) && v.length < spec.minItems) errors.push(`${where} has \`${k}\` with fewer than ${spec.minItems} entr(y/ies).`);
      }
    }
  }
}

/**
 * G2 — ROLE AGREES WITH THE FILE. A manifest may not lie about what kind of theme it is.
 *
 * Same shape as `checkAdaptDeclarations`: the manifest declares intent, the gate proves
 * it against the real source. `base` imports the engine and declares the contract;
 * `variant-dark` imports a base and declares no tokens of its own; `derived-variant`
 * imports the theme it names in `extends`.
 */
function checkThemeRoles(errors, themesDir = THEMES_DIR) {
  const files = listThemeFiles(themesDir);
  const manifests = listThemeManifests(themesDir);
  for (const [name, m] of manifests) {
    const cssText = files.get(name);
    if (cssText === undefined) continue; // G1 owns the orphan
    const css = stripComments(cssText);
    // EVERY import, not just the first. Reading only the first let a second
    // `@import 'carbone';` sit under `@import 'lattice';` and pull in an entirely
    // different palette with the gate green — the declaration would be true about the
    // line it named and silent about the one that mattered.
    // `\s*` (not `\s+`) and comment-stripped: the dist palettes ship the import
    // minified as `@import"indaco";`, which the `\s+` form MISSED — this gate would
    // then report a correct theme as declaring `extends` while importing nothing. That
    // divergence is the one the theme-graph work exists to end, so it is fixed here in
    // G2 rather than duplicated into a second gate.
    // See engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md.
    const imports = [...css.matchAll(/@import\s*(['"])([^'"]+)\1\s*;?/g)].map((x) => x[2]);
    // COUNT separately from EXTRACT. The strict backreferenced form above cannot read a
    // mismatched-quote import (`@import "x';`) — correctly, it is not a valid name — but
    // that also made a SECOND such line invisible to the >1 guard below, which is the one
    // thing this block's comment calls load-bearing. Count every theme-name-ish import,
    // `url(…)` excluded, so a smuggled second edge is still reported.
    const importCount = [...css.matchAll(/@import\s*(?!url\()['"]?[^;\n]*;/g)].length;
    const imp = imports[0] ?? null;
    const shown = imports.length ? imports.map((i) => `'${i}'`).join(' + ') : 'nothing';
    const tokens = parseThemeTokens(cssText).size;

    if (imports.length > 1 || importCount > 1) {
      errors.push(
        `theme "${name}" @imports ${shown}. A theme extends exactly one thing — the engine, or one other theme — ` +
        'because that single edge is what `role`/`extends` declares and what every scope decision reads.',
      );
    }

    if (m.role === 'base') {
      if (imp !== 'lattice') {
        errors.push(`theme "${name}" declares role "base" but @imports ${shown} — a base palette extends the engine ('lattice').`);
      }
      if (m.extends !== undefined) {
        errors.push(`theme "${name}" declares role "base" and an \`extends\` — a base palette extends the engine, not another theme. Drop \`extends\`.`);
      }
      if (tokens === 0) {
        errors.push(`theme "${name}" declares role "base" but declares no tokens of its own — a base palette carries the contract, so this is a variant, not a base.`);
      }
    } else {
      if (!m.extends) {
        errors.push(`theme "${name}" declares role "${m.role}" but no \`extends\` — say which theme it builds on.`);
      } else if (imp !== m.extends) {
        errors.push(`theme "${name}" declares \`extends: "${m.extends}"\` but @imports ${shown}. The declaration must match the file.`);
      }
      if (m.role === 'variant-dark' && tokens > 0) {
        errors.push(
          `theme "${name}" declares role "variant-dark" but declares ${tokens} token(s) of its own. ` +
          'A variant-dark is a thin wrapper that only pins the canvas; a file that overrides tokens is a "derived-variant".',
        );
      }
      if (m.role === 'derived-variant' && tokens === 0) {
        errors.push(
          `theme "${name}" declares role "derived-variant" but overrides no tokens. ` +
          'A file that only pins the canvas is a "variant-dark".',
        );
      }
    }

    if (m.family === 'a11y' && m.cvd === undefined && !name.endsWith('-base')) {
      errors.push(`theme "${name}" is in the a11y family but names no \`cvd\` — say which color-vision deficiency it targets, or make it the family's shared base.`);
    }
    // The picker lists base palettes and the CVD palettes; both need a swatch.
    const listed = m.role === 'base' || m.cvd !== undefined;
    if (listed && !m.swatch) {
      errors.push(`theme "${name}" is listed in the palette picker but declares no \`swatch\` — the picker dot is curated data that cannot be derived from the palette.`);
    }
    if (listed && !Number.isInteger(m.order)) {
      errors.push(`theme "${name}" is listed in the palette picker but declares no \`order\` — menu position is curated (the brand group leads with indaco, not alphabetically), so it cannot be derived.`);
    }
  }

  // Order must be unique WITHIN a group, or the generated catalog's sort is arbitrary
  // and the menu silently reshuffles between builds.
  const groups = new Map();
  for (const [name, m] of manifests) {
    if (!files.has(name)) continue;
    const key = m.cvd ? 'a11y' : (m.role === 'base' ? m.tier : null);
    if (key == null || !Number.isInteger(m.order)) continue;
    if (!groups.has(key)) groups.set(key, new Map());
    const seen = groups.get(key);
    if (seen.has(m.order)) {
      errors.push(`themes "${seen.get(m.order)}" and "${name}" both declare order ${m.order} in the "${key}" picker group — the menu order would be arbitrary.`);
    } else {
      seen.set(m.order, name);
    }
  }
}

// ─── Theme identity: ONE owner, two verified projections ──────────────────
// A palette's name exists in three places — the manifest's `name` field, the
// filename, and the `@theme` directive in the CSS — and until 2026-08-16 NOTHING
// bound them. `checkThemeRoles` keys by filename and never reads `@theme` at all,
// so `themes/foo.css` declaring `@theme bar` would pass every gate and register
// under a name nobody expects. All 32 palettes agreed by discipline alone, and
// design/skills/theme.md already told authors the directive "MUST match the
// filename" — a promise the machine did not keep.
//
// THE MANIFEST OWNS THE NAME. It is already the single declaration of which
// palettes exist (tools/build-theme-catalog.js reads it for the picker, roles,
// swatches). The filename and `@theme` are PROJECTIONS of that owner, and this
// gate is what makes them projections rather than independent copies.
//
// Why `@theme` stays in the source CSS at all, when `@size` did not: the source
// file is itself a published artifact. `@workwel/lattice/themes/<name>.css` is a
// package export README.md documents as "a Marp theme file", and Marpit THROWS
// without the directive — where a missing `@size` merely degraded to the default
// box. Identity has to travel with the bytes; geometry did not.
// See engineering/decisions/2026-08-16-theme-identity-ownership.md.
const THEME_DIRECTIVE_RE = /@theme\s+([A-Za-z0-9_-]+)/;
function checkThemeIdentity(errors, themesDir = THEMES_DIR) {
  const files = listThemeFiles(themesDir);
  const manifests = listThemeManifests(themesDir);

  for (const [fileName, cssText] of files) {
    const declared = THEME_DIRECTIVE_RE.exec(cssText)?.[1];
    if (!declared) {
      errors.push(
        `themes/${fileName}.css declares no \`@theme\`. The file is a published export ` +
        `(\`@workwel/lattice/themes/${fileName}.css\`) that README.md calls a Marp theme file, and ` +
        `Marp throws without the directive. Add \`/* @theme ${fileName} */\` as the first line.`,
      );
      continue;
    }
    if (declared !== fileName) {
      errors.push(
        `themes/${fileName}.css declares \`@theme ${declared}\` — the filename says "${fileName}". ` +
        `A theme registers under the name in the directive, so these disagreeing means the palette ` +
        `loads under a name no picker, manifest, or \`@import\` refers to. Make them match.`,
      );
    }
    const m = manifests.get(fileName);
    if (m && m.name !== undefined && m.name !== fileName) {
      errors.push(
        `themes/${fileName}.manifest.json declares \`"name": "${m.name}"\` — the filename says ` +
        `"${fileName}". The manifest OWNS the theme's name; the filename and \`@theme\` are ` +
        `projections of it, so all three have to agree.`,
      );
    }
  }

  // The engine base is not in themes/, but it is registered by name like any other
  // theme (`@import 'lattice'` resolves against it), so its directive is load-bearing too.
  const baseCss = fs.readFileSync(path.join(ROOT, 'lib', '_theme.css'), 'utf8');
  const baseName = THEME_DIRECTIVE_RE.exec(baseCss)?.[1];
  if (baseName !== 'lattice') {
    errors.push(
      `lib/_theme.css declares \`@theme ${baseName ?? '(nothing)'}\` — it must be \`lattice\`. ` +
      `Every palette says \`@import 'lattice'\`, and that import resolves against this name; ` +
      `change it and all 32 palettes silently collapse to scaffold-only CSS.`,
    );
  }
}

// ─── Theme registration passes the name, never searches for it ────────────
// `ThemeStore.add(name, css)` takes identity as an argument. The one-argument
// `add(css)` form recovers it from `@theme` and survives only for external
// consumers of the published `./engine` export and the documented
// `window.LatticePlayground.addThemes` API.
//
// In-repo callers must pass the name, because they all HAVE it — the fetcher
// fetched by name, the Studio serialized with one, a shared payload carries
// `{ name, css }`, the CLI has a path. `theme-fetch.ts` was the clearest case:
// `if (!PG.hasTheme(name)) PG.addThemes([css])` used the name and threw it away on
// the same line, leaving `add` to regex it back out of the sheet.
//
// The searched form is not merely redundant, it is unsafe: a sheet with no
// directive registers NOTHING and returns a `false` no caller checks.
// Roots scanned for theme registrations. A MISSING root is an error, not a silent
// skip: the sanction list already had a staleness check while the root list did
// not, so a renamed directory would have quietly dropped coverage to zero while
// the gate kept reporting OK — the asymmetry exactly backwards.
const THEME_REG_ROOTS = ['lib', 'docs/src', 'tools', 'lattice-emulator.js'];
// `test/**` is deliberately OUT of scope: ~30 suites construct engines with bare
// CSS to exercise the legacy path itself, and gating them would mean rewriting the
// tests that PROVE the legacy path still works. Stated here because the omission is
// a real limit on the claim, not an oversight — a new engine host copied from a test
// will use the legacy shape and no gate will say so.
const THEME_REG_EXTS = new Set(['.js', '.mjs', '.ts', '.tsx']);
// Sites that legitimately cannot pass a name. Each needs its justification here;
// the gate also fails on a STALE entry, so the list cannot rot.
const SANCTIONED_UNNAMED_THEME_REGISTRATIONS = [
  {
    file: 'lib/engine/index.js',
    why: 'the engine\'s OWN legacy dispatch — `addThemes` forwards an entry that carries no '
       + '`name`/`css` fields to the one-argument `add`, which is what keeps the published '
       + 'bare-CSS shape working for external consumers.',
  },
  {
    file: 'lattice-emulator.js',
    why: 'ONLY under the `--css` / positional layout-CSS override, where the caller substitutes '
       + 'their own engine stylesheet and its identity is genuinely whatever it declares. The '
       + 'DEFAULT path constructs `dist/lattice.css` itself and now passes `{ name: \'lattice\' }`.',
  },
];


/**
 * Does this expression provably evaluate to entries that CARRY A NAME?
 *
 * The first cut of this helper checked only "is it an object literal", which the
 * adversarial trio broke immediately: `...xs.map((c) => ({ css: c }))` and even
 * `...xs.map(() => ({}))` passed. A nameless entry is exactly what sends
 * `ThemeStore.add` back to regexing `@theme` out of a 1.5 MB sheet — the thing this
 * gate exists to prevent — so the gate was certifying its own failure mode.
 *
 * Two further holes it closed: a NESTED map spreads arrays rather than entries, and
 * taking only the FIRST `return` let a later bare-CSS return hide behind an early
 * object literal. Every return is checked now.
 */
function hasNameProperty(node, ts) {
  return node.properties.some((prop) => {
    if (ts.isShorthandPropertyAssignment(prop)) return prop.name.text === 'name';
    if (ts.isPropertyAssignment(prop)) {
      const k = prop.name;
      return (ts.isIdentifier(k) || ts.isStringLiteral(k)) && k.text === 'name';
    }
    // A spread inside the entry (`{ ...entry }`) could carry a name we cannot see;
    // treat it as unknown rather than assume, and let the caller report it.
    return false;
  });
}
/** One entry: an object literal that carries a `name`. */
function producesNamedEntry(node, ts) {
  if (ts.isParenthesizedExpression(node)) return producesNamedEntry(node.expression, ts);
  if (ts.isObjectLiteralExpression(node)) return hasNameProperty(node, ts);
  return false;
}

/**
 * An ARRAY of entries — what a spread must produce.
 *
 * This helper has been wrong three times, each in the same direction: it answered
 * "does SOME path look right" when the question is "can ANY path be wrong". The
 * defects, all found by review rather than by a test, and all now covered by
 * test/unit/tools/theme-registration-gate.test.js:
 *
 *   - it accepted any object literal, so `.map(c => ({ css: c }))` — nameless — passed;
 *   - it conflated one entry with an array of them, so a NESTED map passed;
 *   - it took only the FIRST `return`, so a later bare-CSS return hid behind an
 *     early object literal;
 *   - it ignored a FALL-THROUGH path: `.map(x => { if (x.ok) return {…}; })` yields
 *     `undefined` for the else case, which registers nothing and returns a `false`
 *     nobody checks — the exact silent no-op this gate exists to abolish;
 *   - it ignored `async`, so `.map(async x => ({…}))` produced an array of PROMISES,
 *     carrying neither name nor css, and registered zero themes.
 *
 * So the rule is now conservative by construction: the callback must be plain (not
 * async, not a generator), and either an expression body or a block whose LAST
 * statement is a `return` — a block that can complete without returning is reported,
 * because that is precisely the fall-through case. Anything unproven is reported.
 */
function producesNamedEntryArray(node, ts) {
  if (ts.isParenthesizedExpression(node)) return producesNamedEntryArray(node.expression, ts);
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.length > 0 && node.elements.every((el) => producesNamedEntry(el, ts));
  }
  if (!ts.isCallExpression(node) || !ts.isPropertyAccessExpression(node.expression)
      || node.expression.name.text !== 'map') return false;
  const fn = node.arguments[0];
  if (!fn || !(ts.isArrowFunction(fn) || ts.isFunctionExpression(fn))) return false;
  // `async` yields Promises; a generator yields an iterator. Neither is an entry.
  if (fn.asteriskToken) return false;
  if (fn.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)) return false;
  if (!ts.isBlock(fn.body)) return producesNamedEntry(fn.body, ts);

  // A block that can finish WITHOUT returning yields `undefined` on that path.
  const last = fn.body.statements[fn.body.statements.length - 1];
  if (!last || !ts.isReturnStatement(last)) return false;

  const returns = [];
  const walk = (n) => {
    // Do not descend into anything that owns its OWN `return`: nested functions,
    // and also object METHODS, accessors and class bodies — attributing those to
    // the callback made the gate fire on correct code.
    if (n !== fn.body && (ts.isArrowFunction(n) || ts.isFunctionExpression(n)
        || ts.isFunctionDeclaration(n) || ts.isMethodDeclaration(n)
        || ts.isGetAccessorDeclaration(n) || ts.isSetAccessorDeclaration(n)
        || ts.isClassDeclaration(n) || ts.isClassExpression(n))) return;
    if (ts.isReturnStatement(n)) returns.push(n);
    ts.forEachChild(n, walk);
  };
  walk(fn.body);
  return returns.length > 0 && returns.every((r) => r.expression && producesNamedEntry(r.expression, ts));
}

/**
 * Find theme registrations that hand over a stylesheet without its name.
 *
 * PARSED, NOT SCRUBBED. The first cut of this gate blanked comments and string
 * literals with a hand-rolled character scanner and then regex-matched the result.
 * It was broken in both directions and the adversarial trio proved both:
 *   - A regex literal containing a quote (`/url\((['"]?)fonts/`, which is real code in
 *     docs/src/lib/theme-fetch.ts) opened a phantom string that blanked the following
 *     lines. Reverting a REAL call site in that same file to bare CSS passed the gate
 *     green — the file the decision record cites as "the clearest case".
 *   - An apostrophe in a docblock closed a phantom string, so prose was scanned as
 *     code and the gate fired on files with no violation at all.
 * Roughly 9% of scanned files lost most of their code to the scrubber. A gate with a
 * silent blind spot is worse than no gate, because the invariant is then believed to
 * be machine-held. TypeScript's parser is already a devDependency and handles .js,
 * .mjs, .ts and .tsx — including regex literals, JSX and templates — so the scan is
 * now over a real AST and the scrubber is gone.
 *
 * The text pre-filter is a cost optimization only: a file that never mentions the
 * method cannot contain a call to it, so skipping it cannot cause a miss.
 */
function checkThemeRegistrationCallSites(errors) {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    errors.push(
      'theme-registration gate cannot run: `typescript` is not installed. It is a devDependency ' +
      'and this gate parses real ASTs rather than scrubbing text — run `npm ci`.',
    );
    return;
  }

  const found = [];
  /** The call's argument list, as source text, for the error message. */
  const textOf = (node, src) => {
    const t = src.text.slice(node.getStart(src), node.getEnd()).replace(/\s+/g, ' ');
    return t.length > 60 ? `${t.slice(0, 57)}…` : t;
  };

  const scanFile = (rel, abs) => {
    const raw = fs.readFileSync(abs, 'utf8');
    if (!raw.includes('addThemes') && !raw.includes('.add(')) return; // cannot contain a call
    const src = ts.createSourceFile(abs, raw, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const report = (node, why) => {
      const { line } = src.getLineAndCharacterOfPosition(node.getStart(src));
      found.push({ file: rel, line: line + 1, entry: textOf(node, src), why });
    };

    // A parameter of an enclosing function is a legitimate PASS-THROUGH: the facade in
    // lib/playground/index.js forwards its caller's list verbatim and cannot inspect it.
    const isEnclosingParam = (node, name) => {
      for (let p = node.parent; p; p = p.parent) {
        const params = p.parameters;
        if (params?.some((prm) => ts.isIdentifier(prm.name) && prm.name.text === name)) return true;
      }
      return false;
    };

    const visit = (node) => {
      if (ts.isCallExpression(node)) {
        const callee = node.expression;
        const method = ts.isPropertyAccessExpression(callee) ? callee.name.text
          : ts.isIdentifier(callee) ? callee.text
            : null;

        if (method === 'addThemes') {
          const arg = node.arguments[0];
          if (arg && ts.isArrayLiteralExpression(arg)) {
            for (const el of arg.elements) {
              // A SPREAD must produce an array of named entries; a plain element must
              // BE one. Checking both with one predicate is what let a nested map pass.
              const ok = ts.isSpreadElement(el)
                ? producesNamedEntryArray(el.expression, ts)
                : producesNamedEntry(el, ts);
              if (!ok) report(el, 'array element does not provably carry a `name` — pass `{ name, css }`');
            }
          } else if (arg && !(ts.isIdentifier(arg) && isEnclosingParam(node, arg.text))) {
            // Not an inline array: the previous gate's regex required `addThemes([`, so
            // `const list = [css]; addThemes(list)` evaded it entirely.
            report(arg, 'argument is not an inline array literal, so its shape cannot be checked here');
          }
        }

        // The raw store is reachable as `engine.themes` (lib/engine/index.js returns it),
        // so `themes.add(css)` is a third door to the same behavior. Two arguments is the
        // named contract; one is the searched form.
        if (method === 'add' && ts.isPropertyAccessExpression(callee)
            && /themes?$/i.test(callee.expression.getText(src)) && node.arguments.length === 1) {
          report(node.arguments[0], '`themes.add(css)` is the searched form — pass `add(name, css)`');
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  };

  for (const r of THEME_REG_ROOTS) {
    const p = path.join(ROOT, r);
    if (!fs.existsSync(p)) {
      errors.push(
        `theme-registration gate root "${r}" does not exist (tools/check-ownership.js THEME_REG_ROOTS). ` +
        `A renamed or moved root must not silently reduce this gate's coverage — update the list.`,
      );
      continue;
    }
    const walk = (f) => {
      const st = fs.statSync(f);
      if (st.isDirectory()) {
        for (const e of fs.readdirSync(f).sort()) {
          if (e === 'node_modules' || e === 'public') continue;
          walk(path.join(f, e));
        }
        return;
      }
      if (!THEME_REG_EXTS.has(path.extname(f)) || f.includes('.generated.')) return;
      scanFile(path.relative(ROOT, f), f);
    };
    walk(p);
  }

  const stale = [...SANCTIONED_UNNAMED_THEME_REGISTRATIONS];
  for (const f of found) {
    const i = stale.findIndex((s) => s.file === f.file);
    if (i !== -1) { stale.splice(i, 1); continue; }
    errors.push(
      `${f.file}:${f.line}: theme registration hands over a stylesheet without its name — ${f.why} ` +
      `(\`${f.entry}\`). Pass the name you already have: \`addThemes([{ name, css }])\`. The one-argument ` +
      `form recovers the name by regex and, on a sheet with no \`@theme\`, registers nothing while ` +
      `returning a \`false\` nobody checks. If this call site genuinely cannot know the name, add it to ` +
      `SANCTIONED_UNNAMED_THEME_REGISTRATIONS with the reason.`,
    );
  }
  for (const s of stale) {
    errors.push(
      `stale unnamed-theme-registration sanction in tools/check-ownership.js — ${s.file} no longer ` +
      `registers a theme without its name. Remove the entry so the allowlist stays honest.`,
    );
  }
}

/**
 * G3 — `modes` AGREES WITH THE CSS, and `darkCounterpart` points at a real wrapper.
 *
 * This is what makes carbone's dark-only-ness an ASSERTED fact rather than a comment
 * (#1302). If someone gives carbone a light face without updating the manifest — or
 * accidentally degenerates another palette's arms — the gate fires either way.
 */
function checkThemeModes(errors, themesDir = THEMES_DIR) {
  const files = listThemeFiles(themesDir);
  const manifests = listThemeManifests(themesDir);
  for (const [name, m] of manifests) {
    if (!files.has(name)) continue; // G1 owns the orphan
    const actual = themeActualModes(name, files, manifests).slice().sort();
    const declared = (m.modes ?? []).slice().sort();
    if (actual.join(',') !== declared.join(',')) {
      errors.push(
        `theme "${name}" declares modes [${declared.join(', ')}] but its CSS provides [${actual.join(', ')}]. ` +
        'A palette has a face for a mode when its surface tokens resolve to a distinct value there — ' +
        'a `:root` pin narrows to one face, degenerate `light-dark()` arms mean there is only ever one. ' +
        'Fix whichever is wrong; do not just re-declare.',
      );
    }
    if (m.role === 'base') {
      const expected = files.has(`${name}-dark`) ? `${name}-dark` : null;
      const got = m.darkCounterpart ?? null;
      if (got !== expected) {
        errors.push(
          `theme "${name}" declares darkCounterpart ${got === null ? 'null' : `"${got}"`} but ` +
          `${expected === null ? `themes/${name}-dark.css does not exist` : `themes/${expected}.css does`}. ` +
          'The counterpart is declared rather than inferred from the filename so this cannot drift.',
        );
      }
      if (got && manifests.get(got)?.extends !== name) {
        errors.push(`theme "${name}" names "${got}" as its dark counterpart, but that manifest does not \`extends: "${name}"\`.`);
      }
    }
  }
}

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

/**
 * Every `related` entry names a component that EXISTS.
 *
 * `checkManifest` (lib/components/index.js) validates a related entry's SHAPE — array,
 * non-empty `name`, non-empty `when` — and cannot check existence, because it sees one
 * manifest in isolation. Nothing else did, so `q-and-a` pointed at `faq` for months: a
 * name that was never a component in this repo (no files were ever deleted for it; the
 * string was introduced with #1627's manifest prose).
 *
 * A dangling name is not a cosmetic typo. `renderPickMd` filters unknown names off the
 * pick surface, which is why that one file stayed clean — but the relation still reaches
 * `<name>.docs.md` as a RELATIVE LINK (`../faq/faq.docs.md`, a 404), the gallery deck's
 * "See also" slide, and `dist/docs/components.json`, which ships into the playground
 * bundle and every exported deck. HARD RULE #6 sends an author to `.docs.md` before they
 * write the slide, so the documentation was routing them to `_class: faq` and an
 * `unknown-class` lint error.
 *
 * Per-component and order-independent, so two concurrent PRs adding components both pass
 * after a mechanical merge (#1547).
 */
function checkRelatedTargets(manifests, errors) {
  const known = new Set(manifests.map((m) => m.name));
  for (const m of manifests) {
    if (!Array.isArray(m.related)) continue;
    for (const entry of m.related) {
      const name = typeof entry === 'string' ? entry : entry?.name;
      if (!name || known.has(name)) continue;
      errors.push(
        `${m.name}: related entry "${name}" is not a component. A dangling relation is ` +
        `rendered as a relative link in ${m.name}.docs.md (a 404), as a "See also" row in ` +
        'the gallery, and in dist/docs/components.json — only the pick surface filters it. ' +
        'Point it at a real component or drop the entry, and fix any prose naming it too.',
      );
    }
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

/**
 * A palette token declared ONLY above plain `:root` never reaches a packed render.
 *
 * `lib/engine/css.js` packs a theme the way Marpit does, rewriting `:root` onto the
 * slide `<section>` — but the rewrite only touches a `:root` preceded by a combinator
 * or start-of-string, so in `:root:root` the SECOND one survives literally:
 *
 *   :root:root { --x: red }  ->  article.lattice > :where(section):not([\20 root]):root
 *
 * That trailing `:root` needs the `<section>` to be the document root. It never matches.
 * So `(:root){2,}` is INERT on every packed path — the Studio, the docs Playground, the
 * Specimen, and export-to-Marp, whose rewrite is marp-core's own (measured under real
 * marp-cli: a `:root:root`-only trio paints base's `#2D6A3F`, a `:root` one paints the
 * palette's). `engineering/gotchas/marp.md` documents the same class for `:root[…]`.
 *
 * The bump existed because the CLI export used to concatenate the engine bundle AFTER
 * the palette, so a plain `:root` override lost on source order there while every static
 * check passed. #1527 flipped that concat (2026-08-24-palette-cascade-flip.md): the
 * engine sheet loads first now, so plain `:root` wins the export on source order AND
 * packs everywhere else. One declaration reaches all four paths, and the bump became
 * either dead weight (the status trio, declared at both — #1698) or an outright defect
 * (`--panel-edge-mark`, declared ONLY there: base's `var(--accent)` painted instead,
 * which on onyx IS the panel fill — a 1.00:1 edge, #1797).
 *
 * So the contract is now the simple one: declare it at plain `:root`. This gate fails a
 * CUSTOM PROPERTY that appears under a repeated-`:root` selector without also appearing
 * at plain `:root` in the same file.
 *
 * ENVELOPE, stated rather than implied, INCLUDING where it is porous. It matches a
 * selector that is `(:root){2,}` and nothing else, or a comma-separated list with such a
 * part in it. It deliberately does NOT judge `:root.print` / `:root[data-x]` (conditional
 * overrides, a different contract) or `:root :root` (a descendant, inert everywhere and a
 * shape nothing here writes). Two known holes, neither reachable by anything in `themes/`
 * today and both left rather than papered over: a `:root` nested inside an `@media` /
 * `@supports` block counts as an unconditional plain declaration, and a `{` or `}` inside
 * a declaration value (a `url()`, a quoted string) desyncs the brace scan for that block.
 * If a theme ever needs either, this needs a real parser rather than a wider regex.
 *
 * SCOPED TO `--*` PROPERTIES, and the reason is not "custom properties are what we care
 * about". It is that `color-scheme` has a DIFFERENT competitor. `a11y-base` declares its
 * `color-scheme: light` pin at BOTH forms and that pair is permanent: on the unpacked CLI
 * export the thing it must outrank is the deck's own `style:` directive, which the shell
 * emits LAST by construction, so no concat order can help and specificity is the only
 * lever; on the packed paths the plain half is what lands, as a DIRECT declaration on the
 * section, beating the injected `:root{color-scheme:MODE}` that every
 * `docs/src/lib/single-slide-render.ts` frame carries — the component reference pages, the
 * Studio, the landing previews — by directness rather than by specificity. Measured on a
 * real page: with `:root:root` alone all four a11y palettes followed that injected dark
 * scheme and painted rgb(0,0,0) where their fixed CVD-safe canvas should be white. (NOT the
 * Playground, which an earlier version of this comment named: its frame injects nothing and
 * its dark mode swaps to a `-dark` theme the a11y palettes do not have.) So this gate must not judge that
 * property, and the exemption is a statement about the competitor, not about the shape.
 * engineering/decisions/2026-08-24-status-trio-single-root.md
 */
const REPEATED_ROOT = /^(?::root){2,}$/;

/**
 * Split a selector list on TOP-LEVEL commas only — a comma inside `:is()`, `:not()`,
 * `:where()` or an attribute value is part of one compound, not a separator.
 */
function selectorParts(sel) {
  const out = [];
  let depth = 0, quote = null, cur = '';
  for (const ch of sel) {
    if (quote) { cur += ch; if (ch === quote) quote = null; continue; }
    if (ch === '"' || ch === "'") { quote = ch; cur += ch; continue; }
    if (ch === '(' || ch === '[') depth++;
    else if (ch === ')' || ch === ']') depth--;
    if (ch === ',' && depth === 0) { out.push(cur.trim()); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur.trim());
  return out.filter(Boolean);
}

/**
 * A declaration is inert on the packed paths only when NO part of its selector reaches.
 *
 * `ANY part is a repeated :root` was the first cut and it was wrong in the worse direction —
 * a FALSE POSITIVE that blocks a theme whose token demonstrably paints. `:root:root, section`
 * packs to `…:not([\20 root]):root, article.lattice > section`: the first arm never matches,
 * the second one matches every slide. The gate told the author the declaration was inert and
 * "falls back to the engine default", which is the opposite of what the browser does.
 *
 * So: inert iff EVERY top-level part is a repeated `:root`. Anything else — a bare `section`,
 * a class, an `:is()` — is a live arm, and a live arm makes the declaration reach.
 */
const isInertRoot = (sel) => {
  const parts = selectorParts(sel);
  return parts.length > 0 && parts.every((p) => REPEATED_ROOT.test(p));
};
/** Does any top-level part declare at plain `:root`? */
const hasPlainRoot = (sel) => selectorParts(sel).some((p) => p === ':root');

function rootDeclSites(css) {
  const out = { plain: new Set(), overSpecific: new Map() };   // token -> selector
  // Comment-stripped, so a docblock naming these selectors in prose cannot be mistaken
  // for a rule — a live trap: the first cut of the tool that WROTE these blocks matched
  // `:root:root` inside its own explanation.
  const src = stripComments(css);
  // Every rule, then the selector tested WHOLE. An anchor-on-the-previous-`}` form reads
  // fine and silently halves the result: the first match consumes the brace the second
  // one needs, so two adjacent root blocks parse as one. Measured — the predecessor of
  // this scan reported all 18 palettes missing a block every file had.
  for (const m of src.matchAll(/([^{}]*)\{([^{}]*)\}/g)) {
    // Drop anything up to the last `;` — a theme opens with `@import 'parent';`, which the
    // brace scan otherwise swallows into the next rule's "selector".
    const sel = m[1].replace(/^[\s\S]*;/, '').trim();
    const plain = hasPlainRoot(sel);
    const over = !plain && isInertRoot(sel);
    if (!plain && !over) continue;
    for (const d of m[2].matchAll(/(--[a-z0-9-]+)\s*:/gi)) {
      if (plain) out.plain.add(d[1]);
      else if (!out.overSpecific.has(d[1])) out.overSpecific.set(d[1], sel);
    }
  }
  return out;
}

// `dir` is a parameter ONLY so the two error branches can be driven from a fixture. The
// live-tree call passes nothing. Without it the error paths were untestable, and the first
// cut of their test asserted an empty array nothing wrote to — a test that read as coverage
// and certified the gate instead of exercising it.
function checkPackedRootReach(errors, dir = path.join(ROOT, 'themes')) {
  if (!fs.existsSync(dir)) return;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.css')).sort()) {
    const { plain, overSpecific } = rootDeclSites(fs.readFileSync(path.join(dir, f), 'utf8'));
    for (const [tok, sel] of overSpecific) {
      if (plain.has(tok)) {
        errors.push(
          `themes/${f}: ${tok} is declared at BOTH \`:root\` and \`${sel}\`. The second is dead `
          + 'weight since #1527 flipped the export concat — plain `:root` now wins the CLI '
          + 'export on source order and packs onto the slide everywhere else. Drop the '
          + `\`${sel}\` copy; two declarations that must be hand-kept in sync is how a palette `
          + 'ends up shipping two different greens depending on the surface.',
        );
        continue;
      }
      errors.push(
        `themes/${f}: ${tok} is declared ONLY at \`${sel}\`, so it is inert on every PACKED `
        + 'path — the Studio, the docs Playground, the Specimen and export-to-Marp all rewrite '
        + '`:root` onto the slide <section> and the repeated `:root` survives literally, where '
        + `it can never match. The slide falls back to the engine default. Declare ${tok} at `
        + 'plain `:root`: since #1527 that reaches the CLI export too.',
      );
    }
  }
}

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

// ─── Label-voice font gate ────────────────────────────────────────────────
// `--font-mono` is the CODE voice, and it is the ONE type token the `sketch`
// finish deliberately does not re-point (real `code`/`pre`/math must stay
// unambiguous — lib/base/base.sketch.css). `--font-label` is the LABEL voice,
// and it DEFAULTS to `var(--font-mono)` (lib/base/base.tokens.css) — so the two
// render identically on every theme, and reaching for the wrong one is
// invisible until someone turns the finish on.
//
// That is exactly what happened: 95 label-voice sites pinned `--font-mono`
// directly, so the sketch finish could not reach them and they stayed
// machine-faced on a hand-drawn slide — the running header and footer on EVERY
// slide, the title/closing eyebrow, every card number badge, every BEFORE/AFTER
// chip, every chart legend value. The finish re-points a token; a site that
// names the other token is simply out of its reach, and no test could see it
// because the default render is byte-identical.
//
// So `font-family: var(--font-mono)` in engine CSS is now an enumerated
// privilege, not a default. Budget 0 + the allowlist below. A new, unlisted
// `--font-mono` font-family fails the build; a sanction that no longer matches
// any declaration ALSO fails, so the list can't rot. If a label needs the mono
// FEEL rather than code semantics, re-point `--font-label` in the theme — do
// not pin `--font-mono` at the call site.
//
// Scope note: this gate reads `font-family` declarations only. The token seam
// itself (`--font-label: var(--font-mono)` in base.tokens.css) is a custom-
// property declaration, not a font-family, so it needs no sanction.
// See engineering/decisions/2026-08-12-sketch-label-voice.md.
const LABEL_VOICE_MONO_BUDGET = 0;

// Every `font-family` that may name --font-mono, and why it is code voice and
// not label voice. `file` is repo-relative; `count` is how many declarations in
// that file are sanctioned (several files carry more than one).
const SANCTIONED_MONO_FONTS = [
  {
    file: 'lib/base/base.elements.css',
    selector: 'section code',
    count: 1,
    why: 'the inline `code` chip — literal source the reader may retype. The eyebrow '
       + 'modifier overrides it back to --font-label, so an eyebrow authored as backtick '
       + 'inline-code still rides the label voice.',
  },
  {
    file: 'lib/components/code/code/code.styles.css',
    selector: 'pre > code',
    count: 1,
    why: 'fenced code block.',
  },
  {
    file: 'lib/components/code/compare-code/compare-code.styles.css',
    selector: 'pre > code',
    count: 2,
    why: 'the two fenced code blocks (split + block variants). The COLUMN LABELS above '
       + 'them are label voice and route through --font-label.',
  },
  {
    file: 'lib/integrations/highlight-js/highlight-js.css',
    selector: 'code.hljs',
    count: 1,
    why: 'the highlighted code block.',
  },
  {
    file: 'lib/integrations/highlight-js/highlight-js.css',
    selector: 'mermaid-error',
    count: 3,
    why: 'the three mermaid-error parts (label, message, detail). An error surface quotes the '
       + 'author\'s own source back at them, so it must stay literal and unambiguous — and it '
       + 'must never read as deck content.',
  },
  {
    file: 'lib/integrations/mermaid/mermaid.css',
    selector: 'data-mermaid-state',
    count: 1,
    why: 'mermaid source that has not rendered yet — still source, briefly visible.',
  },
  {
    file: 'lib/components/math/math/math.styles.css',
    selector: '.matrix',
    count: 1,
    why: 'the matrix variable column — a 4em mono grid whose alignment IS the layout.',
  },
  {
    file: 'lib/components/math/math/math.styles.css',
    selector: 'functionplot',
    count: 2,
    why: 'function-plot axis/tick notation, and its error surface.',
  },
  {
    file: 'lib/components/math/math/math.styles.css',
    selector: '.math-error',
    count: 1,
    why: 'quotes the author\'s own TeX back at them verbatim.',
  },
  {
    file: 'lib/components/connect/wifi/wifi.styles.css',
    selector: '.qr-row dd.qr-mono',
    count: 1,
    why: 'the wifi SSID / password literal. A password must be transcribable without '
       + 'ambiguity (0 vs O, l vs 1), which is a code-voice requirement even though the '
       + 'surrounding slide is prose.',
  },
  {
    file: 'lib/base/base.modifiers.css',
    selector: '-tab',
    count: 3,
    why: 'the three engine diagnostic tabs (overflow-tab / illegible-tab / fixme-tab). '
       + 'These are authoring-time instrument chrome, not deck content — they must read as '
       + 'the engine talking, and must NOT pick up a deck finish.',
  },
];

// Pure core: every `font-family` declaration in a stylesheet whose value names
// --font-mono. Strip comments first (the prose above and in base.sketch.css
// discusses the token by name).
const FONT_FAMILY_PROP = /font-family\s*:\s*([^;}{]+)/g;

// Every `font-family` naming --font-mono, WITH THE SELECTOR it sits under.
//
// The selector is what makes a sanction specific. Keying only on {file, count} —
// the first cut — could not say WHICH declaration was blessed, so a file could
// swap a sanctioned rule for an unsanctioned one and keep its count, and the gate
// would pass. That is the weaker half of the `SANCTIONED_MARGINS` design (which
// pins `value`) applied to a property whose value text is identical everywhere,
// so `value` carries no information here and the selector has to.
//
// The selector is recovered by walking back to the `{` that opens the block and
// then to the previous `}`/`*/`/blank line — the same shape the repo's other
// selector-aware readers use. It is normalized to a single line so a sanction can
// name a stable substring rather than reproducing the whole comma list.
function monoFontFamilies(css) {
  const out = [];
  for (const m of css.matchAll(FONT_FAMILY_PROP)) {
    const value = m[1].replace(/!important/g, '').trim();
    if (!/--font-mono\b/.test(value)) continue;
    const open = css.lastIndexOf('{', m.index);
    let start = 0;
    if (open !== -1) {
      const prev = Math.max(
        css.lastIndexOf('}', open),
        css.lastIndexOf('*/', open),
        css.lastIndexOf('\n\n', open),
      );
      start = prev === -1 ? 0 : prev + 1;
    }
    const selector = (open === -1 ? '' : css.slice(start, open))
      .replace(/\s+/g, ' ')
      .replace(/^[}/*\s]+/, '')
      .trim();
    out.push({ value, selector });
  }
  return out;
}

function checkLabelVoiceFont(errors) {
  const offences = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const hit of monoFontFamilies(css)) offences.push({ file: rel, ...hit });
  }
  // Consume offences per sanction by FILE + SELECTOR MATCH, so a sanction names the
  // declaration it blesses rather than just how many that file may have. `count` is
  // kept as the multiplicity (a `:is()` list can legitimately repeat a shape), and a
  // sanction that matches fewer than it claims is reported as stale — the same
  // two-directional contract SANCTIONED_MARGINS has.
  const remaining = [...offences];
  for (const s of SANCTIONED_MONO_FONTS) {
    let consumed = 0;
    for (let i = remaining.length - 1; i >= 0 && consumed < s.count; i--) {
      if (remaining[i].file !== s.file) continue;
      if (s.selector && !remaining[i].selector.includes(s.selector)) continue;
      remaining.splice(i, 1); consumed++;
    }
    if (consumed < s.count) {
      errors.push(
        `stale --font-mono sanction in tools/check-ownership.js — ${s.file}` +
        (s.selector ? ` / \`${s.selector}\`` : '') +
        ` is sanctioned for ${s.count} \`font-family: var(--font-mono)\` declaration(s) but ` +
        `${consumed} matched. Fix the \`selector\`/\`count\` (or drop the entry) so the ` +
        `allowlist stays honest.`,
      );
    }
  }
  if (remaining.length > LABEL_VOICE_MONO_BUDGET) {
    const top = remaining.slice(0, 5)
      .map((o) => `${o.file} \`${o.selector.slice(0, 70) || '(unknown selector)'}\``).join('; ');
    errors.push(
      `${remaining.length} unsanctioned \`font-family: var(--font-mono)\` declaration(s) in engine ` +
      `CSS (budget is ${LABEL_VOICE_MONO_BUDGET}). --font-mono is the CODE voice and is the one type ` +
      `token the \`sketch\` finish does not re-point, so a label that names it renders machine-faced ` +
      `on a hand-drawn slide — and is invisible on every other theme, because --font-label defaults ` +
      `to var(--font-mono). Use \`var(--font-label)\` for eyebrows, column heads, chips, counters, ` +
      `captions and chart values. If the text is genuinely code, data-to-transcribe, or engine ` +
      `diagnostic chrome, add it to SANCTIONED_MONO_FONTS with a justification. Offending: ${top}.`,
    );
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

// ─── Section-box ownership gate ───────────────────────────────────────────
// The slide box belongs to the DECK, not to a component. The geometry has one
// source: the `size:` front-matter directive resolves through resolveSize() to
// a named `@size` (hd 1280x720, square 1080x1080, …), which every render path
// then pins onto the section — the engine scaffold as `article.lattice > section`
// (lib/engine/css.js), the PDF/HTML export as
// `section[data-lattice-slide] { width/height !important }`
// (lattice-emulator.js), the live preview via its own frame CSS. A component
// that also sizes the section element is a second, competing source of truth
// for a value the deck already decided, and the paths do NOT agree on who wins.
//
// That is not a theoretical hazard. `section.premise { height: 100% }` shipped
// in #1207. The export was unharmed only because the emulator's rule carries
// `!important`. In the live Playground it resolved against `article.lattice`, whose
// inline height the preview's fit() routine sets to the height of the WHOLE
// FILMSTRIP — so the section became as tall as every slide stacked together.
// Measured on the real Playground at 390px: section 2517px === .lattice 2517px,
// against ~667px of actual content. lib/runtime/index.js stampOrientation() then
// read that 1280x2517 box (aspect 0.51) as portrait and applied the portrait
// type scale (--fs-h1 9.05x vs landscape 5x) to a landscape slide. Every CI gate
// stayed green: golden-diff compares PDFs, and the PDF was correct.
//
// Note the percentage did NOT degenerate to content height — it resolved
// against a perfectly definite containing block that simply was not the slide.
// That is why "it looked fine in the export" proves nothing here.
//
// Vertical placement inside the slide is `align-items` / `justify-content` /
// `padding`, never a section-level box. A descendant may size itself freely
// (`section.foo .card { height: 100% }` is fine) — this guards only the section
// element itself.
//
// Logical properties are included because `block-size` IS `height`; omitting
// them would leave a synonym-shaped hole. `aspect-ratio` is included because it
// re-derives one axis from the other, which is the same defect by another name.
const SECTION_BOX_PROPS = [
  'height', 'min-height', 'max-height',
  'width', 'min-width', 'max-width',
  'block-size', 'min-block-size', 'max-block-size',
  'inline-size', 'min-inline-size', 'max-inline-size',
  'aspect-ratio', 'contain-intrinsic-size', 'zoom',
];
// Directories whose CSS can style a section. `lib/base/base.modifiers.css` is a
// documented second home for component variants (see checkVariantDeclaration,
// which scans it for the same reason), and a theme is `packTheme`-scoped to the
// same cascade position — both could set a section box and neither is under
// lib/components.
const SECTION_BOX_ROOTS = [
  path.join(LIB_DIR, 'components'),
  path.join(LIB_DIR, 'base'),
  path.join(LIB_DIR, 'forms'),
  path.join(ROOT, 'themes'),
];

/**
 * Every rule in `css` whose selector list targets the SECTION element itself.
 *
 * A brace-tracking scan, not a regex over the whole sheet: the first cut of this
 * gate used `/(^|\})\s*(section…)\{([^{}]*)\}/g`, which CONSUMED the `}` it
 * anchored on, so the rule immediately after any match was never inspected —
 * two adjacent `section.foo { … }` rules meant the second was invisible, and
 * that is the single most common way this defect is written. It also could not
 * see inside `@media`/`@container`, could not handle nested braces, and was
 * case-sensitive against a case-insensitive language. Exported for unit tests.
 */
function sectionBoxOffences(css) {
  const src = stripComments(css);
  const out = [];
  let selStart = 0;
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      const prelude = src.slice(selStart, i).trim();
      stack.push(prelude);
      selStart = i + 1;
      continue;
    }
    if (ch !== '}') continue;
    const prelude = stack.pop() || '';
    // Declarations of THIS block are everything since the last brace, minus any
    // nested blocks — nested content was already consumed by its own `}`.
    const body = src.slice(selStart, i);
    selStart = i + 1;
    if (prelude.startsWith('@')) continue; // at-rule prelude — its children were scanned
    if (!targetsSectionElement(prelude)) continue;
    for (const prop of SECTION_BOX_PROPS) {
      // `(^|;)` so `max-height` never matches the `height` probe, and `-`
      // excluded before the prop so `--card-height` / `padding-block` are safe.
      const re = new RegExp(`(?:^|;)\\s*${prop}\\s*:\\s*([^;}]+)`, 'i');
      const d = body.match(re);
      if (d) out.push({ selector: prelude.replace(/\s+/g, ' '), decl: `${prop}: ${d[1].trim()}` });
    }
  }
  return out;
}

/**
 * True when a selector LIST contains at least one compound that ends at the
 * `section` element — `section`, `section.foo`, `SECTION.foo:hover`,
 * `:is(section.a, section.b)` — but not one that descends past it
 * (`section.foo .card`, `section.foo > *`, `section.foo::before`).
 *
 * A bare `section` counts, and is the WORST case rather than an edge case: a
 * theme is packTheme-scoped to `article.lattice > section`, exactly the scaffold's
 * own specificity but emitted after it, so it would silently re-box every slide
 * in every deck.
 */
// Split on `sep` only at paren depth 0, so the commas inside `:is(ul, ol)` or
// `:not(.a, .b)` do not split the selector they qualify. Naive splitting is what
// made the first cut of this gate report `section.foo:not(:has(.x)) > p::before`
// as a section-box rule — it tore the `:not(` open and read the `section.foo`
// fragment as a whole selector.
function splitSelectorParts(str, sep) {
  const out = [];
  let depth = 0;
  let cur = '';
  for (const ch of str) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (depth === 0 && sep.includes(ch)) { out.push(cur); cur = ''; continue; }
    cur += ch;
  }
  out.push(cur);
  return out.map((s) => s.trim()).filter(Boolean);
}

/**
 * True when a selector list's SUBJECT — the last compound of any selector in it —
 * is an element `matches()` accepts. Recurses into an `:is()`/`:where()` grouping
 * standing alone as that compound, so `> :is(td, th)` is not a free pass, and
 * skips pseudo-ELEMENT subjects (a generated box, not the element's own).
 */
function subjectTargetsElement(selectorList, matches) {
  for (const sel of splitSelectorParts(selectorList, ',')) {
    const compounds = splitSelectorParts(sel, ' \t\n>+~');
    const last = compounds[compounds.length - 1];
    if (!last) continue;
    if (/::/.test(last.replace(/\([^)]*\)/g, ''))) continue;
    const el = /^([a-z][\w-]*)/i.exec(last);
    if (el && matches(el[1].toLowerCase())) return true;
    const grouped = last.match(/^:(?:is|where)\((.*)\)$/i);
    if (grouped && subjectTargetsElement(grouped[1], matches)) return true;
  }
  return false;
}

function targetsSectionElement(selectorList) {
  return subjectTargetsElement(selectorList, (el) => el === 'section');
}

// Budget is a hard zero outside this allowlist. A new exception is a reviewed
// entry here with its justification — the way SANCTIONED_MARGINS / SANCTIONED_HEX
// work — never an edit to the detector. The gate also fails on a STALE entry, so
// the list cannot rot.
const SANCTIONED_SECTION_BOXES = [
  // The fluid viewer's whole mechanism is to UNPIN the section from the authored
  // fixed px box so the runtime re-derives orientation from a viewport-filling
  // box (engineering/decisions/2026-06-21-fluid-box-viewer-design.md). This is a
  // VIEW MODE redefining the deck's own geometry, not a component competing with
  // it — and it is inert by construction: every rule is gated on
  // `:root[data-lattice-view="fluid"]`, which only the fluid viewer sets, so no
  // normal deck, gallery, or export render ever matches it.
  { file: 'lib/base/base.fluid-view.css', decl: 'height: 100dvh !important' },
  { file: 'lib/base/base.fluid-view.css', decl: 'min-height: 100svh' },
  {
    file: 'lib/base/base.fluid-view.css',
    decl: 'width: min(100%, 100dvh * var(--fill-max-aspect)) !important',
  },
];

function checkSectionBoxOwnership(errors) {
  const offences = [];
  for (const root of SECTION_BOX_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of listCssFiles(root)) {
      const rel = path.relative(ROOT, file);
      for (const o of sectionBoxOffences(fs.readFileSync(file, 'utf8'))) {
        offences.push({ file: rel, ...o });
      }
    }
  }
  const remaining = [];
  const staleSanctions = [...SANCTIONED_SECTION_BOXES];
  for (const o of offences) {
    const i = staleSanctions.findIndex((s) => s.file === o.file && s.decl === o.decl);
    if (i === -1) remaining.push(o);
    else staleSanctions.splice(i, 1);
  }
  for (const o of remaining) {
    errors.push(
      `${o.file}: \`${o.selector}\` sets \`${o.decl}\` on the SECTION element. The slide box belongs ` +
      `to the deck — the \`size:\` directive resolves to a named \`@size\` and each render path pins ` +
      `it onto the section itself. A component-level box is a competing source of truth, and the paths ` +
      `disagree on who wins: the export survives only because lattice-emulator.js uses \`!important\`, ` +
      `while in the live Playground a percentage resolves against \`article.lattice\` — whose height is the ` +
      `whole FILMSTRIP — so the slide silently stops clipping and the runtime then mis-stamps ` +
      `data-orientation from the wrong aspect (#1207). Invisible to golden-diff, which only compares ` +
      `PDFs. Place content with align-items/justify-content/padding, or scope the size to a descendant.`,
    );
  }
  for (const s of staleSanctions) {
    errors.push(
      `stale section-box sanction in tools/check-ownership.js — \`${s.decl}\` in ${s.file} is no ` +
      `longer present. Remove the SANCTIONED_SECTION_BOXES entry so the allowlist stays honest.`,
    );
  }
}

// ─── Size-registry ownership gate ─────────────────────────────────────────
// The engine owns the page box (lib/engine/sizes.js). No SOURCE stylesheet
// declares `@size`, and every MARP-FACING ARTIFACT carries the full table.
//
// Until 2026-08-16 the registry lived in a `/* @theme … */` comment that the
// engine regexed back out — a round trip that cost 33 byte-identical copies
// across `themes/*.css` + `lib/_theme.css`, a 34th in the Theme Studio
// serializer, and a names-only duplicate in the browser-safe linter, which
// could not read a CSS comment at all. Geometry moved into a module every one
// of those consumers imports, and `tools/build-css.js stampSizeDirectives()`
// writes the `@size` block into dist/ for the one consumer that genuinely reads
// it from a stylesheet: Marp. See
// engineering/decisions/2026-08-16-size-registry-ownership.md.
//
// BOTH DIRECTIONS, deliberately. A one-way check would let the move rot from
// either end: a reintroduced table in a theme is a second source of truth the
// renderer now ignores (so it would be silently inert, the #1218 failure shape),
// and a dropped stamp is a silently wrong page size in every exported deck —
// invisible to every in-repo render, since nothing here reads geometry from CSS
// any more.
const SIZE_DECL_RE = /@size\s+[A-Za-z0-9:_-]+\s+\S+\s+\S+/;
// Source roots that must be free of `@size` declarations. (Prose mentioning
// "the mobile @size" in a comment is fine — the regex wants a full declaration.)
const SIZE_FREE_ROOTS = ['themes', 'lib'];
// Marp-facing artifacts that MUST carry the stamped table. `dist/marp-kit` is
// built on demand (`npm run marp-kit:build`), so it is checked when present.
const SIZE_STAMPED_ARTIFACTS = [
  'dist/lattice.css',
  'dist/lattice.min.css',
  'dist/marp-kit/lattice.min.css',
];
function checkSizeRegistryOwnership(errors) {
  const { SIZES } = require('../lib/engine/sizes');
  const { parseSizes } = require('../lib/engine/css');
  const registered = Object.keys(SIZES);

  for (const root of SIZE_FREE_ROOTS) {
    const dir = path.join(ROOT, root);
    if (!fs.existsSync(dir)) continue;
    for (const file of listCssFiles(dir)) {
      if (!SIZE_DECL_RE.test(fs.readFileSync(file, 'utf8'))) continue;
      errors.push(
        `${path.relative(ROOT, file)}: declares \`@size\`. Geometry belongs to the engine's registry ` +
        `(lib/engine/sizes.js), not to a stylesheet — the renderer resolves \`size:\` against the ` +
        `registry and would IGNORE this table, so it is a second source of truth that is silently ` +
        `inert. Add or edit the canvas in lib/engine/sizes.js; the build stamps the \`@size\` block ` +
        `into the Marp-facing artifacts for you. See ` +
        `engineering/decisions/2026-08-16-size-registry-ownership.md.`,
      );
    }
  }

  // Every dist/themes/*.min.css too — the Export-to-Marp bundle ships whichever
  // palette the deck uses, so a stamp that only reached the base is a half-fix.
  const distThemes = path.join(ROOT, 'dist', 'themes');
  const artifacts = [...SIZE_STAMPED_ARTIFACTS];
  if (fs.existsSync(distThemes)) {
    for (const f of fs.readdirSync(distThemes).sort()) {
      if (f.endsWith('.min.css')) artifacts.push(`dist/themes/${f}`);
    }
  }
  for (const rel of artifacts) {
    const file = path.join(ROOT, rel);
    if (!fs.existsSync(file)) continue;
    // Read the artifact with the ENGINE's own `@size` parser, not a fresh regex —
    // the check then fails on exactly what Marp would fail to read (HARD RULE #1).
    const stamped = parseSizes(fs.readFileSync(file, 'utf8'));
    const missing = registered.filter((name) => {
      const got = stamped.get(name);
      return !got || got.width !== SIZES[name].width || got.height !== SIZES[name].height;
    });
    if (missing.length) {
      errors.push(
        `${rel}: the Marp \`@size\` stamp is missing or has drifted for: ${missing.join(', ')}. ` +
        `marp-cli and the Marp for VS Code extension read the page geometry out of the theme ` +
        `comment and only ever see dist/, so an unstamped artifact exports every deck at the wrong ` +
        `page size — and no in-repo render would notice, because the engine reads its registry ` +
        `instead. Re-run \`npm run css:build\` (and \`npm run marp-kit:build\`); the stamp lives in ` +
        `tools/build-css.js stampSizeDirectives().`,
      );
    }
  }
}

// ── The section's own `cq*` units must be ANCHORED to the slide ───────────────
// A `container-type: size` element cannot query ITSELF, so a bare `cqi`/`cqh` in a
// declaration that lands on the `<section>` falls back to the initial containing
// block. In the export the ICB happens to BE the slide box (the emulator sets the
// viewport to it), so the value is right by luck; in every browser host the ICB is
// the HOST VIEWPORT, so the slide's own geometry silently tracks whatever iframe it
// is previewed in. That is not a cosmetic drift: the docs-site Playground scales a
// filmstrip iframe to the pane while the Studio pins its iframe to the slide box, so
// the SAME deck laid out differently in the two surfaces and they disagreed about
// which slides overflow (measured: a 17px swing in stage height between a 900px pane
// and a phone's 355px one, and 2 of the 117 gallery slides changing verdict on pane
// width alone). Descendants and pseudo-elements are fine — their `cq*` resolves
// against the section — so this is exactly the section-subject case, which is what
// `targetsSectionElement` already identifies for the section-box gate.
//
// The fix is always the same shape: `calc(var(--_sec-1cqi, 1cqi) * N)` (or
// `--_sec-1cqh` on the height axis). Those stamps are written per-section by
// lib/runtime/index.js `patchSectionGeometry` from the real slide box, and the bare
// fallback keeps the export path byte-identical. Budget 0 + an allowlist, same shape
// as the margin / hex / layer gates. See engineering/gotchas.md "A slide's own
// padding changes when the preview pane is resized".
const SECTION_CQ_BUDGET = 0;

// Reviewed exceptions, each with its justification. A stale entry fails too, so the
// list cannot rot.
// EMPTY, and that is the achieved state, not an aspiration: every section-own
// `cq*` in the engine is anchored. The fluid VIEW MODE, which legitimately
// re-derives the slide box from the viewport, needs no entry — it does its work
// with `dvh`/`svh` on the box itself, not with a section-own `cq*`.
const SANCTIONED_SECTION_CQ = [];

// `cq*` lengths in a declaration, ignoring the anchored form (`var(--_sec-1cq*, 1cq*)`,
// whose bare fallback is the intended export path) and custom-property declarations
// (a token is not itself applied to the section; its CONSUMER is, and that consumer is
// what this gate sees).
function sectionCqOffences(css) {
  const src = stripComments(css);
  const out = [];
  let selStart = 0;
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') {
      // With native nesting, the text before a nested block is `decls; selector` —
      // everything up to the LAST `;` belongs to the ENCLOSING rule and would
      // otherwise be swallowed with the prelude and never scanned.
      const chunk = src.slice(selStart, i);
      const cut = chunk.lastIndexOf(';');
      const owner = sectionOwner(stack);
      if (cut !== -1 && owner) scanDecls(chunk.slice(0, cut), owner, out);
      stack.push((cut === -1 ? chunk : chunk.slice(cut + 1)).trim());
      selStart = i + 1;
      continue;
    }
    if (ch !== '}') continue;
    const prelude = stack.pop() || '';
    const body = src.slice(selStart, i);
    selStart = i + 1;
    // An at-rule NESTED INSIDE a section rule (`section.a { @media print { … } }`)
    // still applies to the section — walk out to the nearest real selector rather
    // than skipping, which is how `padding: 5cqi` hid inside an `@media` block.
    const owner = prelude.startsWith('@') ? sectionOwner(stack) : (targetsSectionElement(prelude) ? prelude : null);
    if (!owner) continue;
    for (const o of scanDecls(body, owner)) out.push(o);
  }
  return out;
}

// The two stamps that exist (lib/runtime/index.js `patchSectionGeometry`). Anything
// else — `cqb`, `cqw`, `cqmin`, `cqmax` — has no anchor to route through and is
// always an offence; `var(--_sec-1cqb, 1cqb)` LOOKS anchored and silently is not.
const ANCHORED_AXES = ['cqi', 'cqh'];

/**
 * Does this declaration VALUE carry a container-query length that will resolve against
 * the ICB? Shared by both arms so they cannot drift.
 *
 * Case-insensitive, because CSS units are (`5CQI` is a valid leak, and the sibling
 * section-box gate's header records case-sensitivity as a defect it already fixed
 * once). Strings and `url()` are stripped first — `url("img-5cqi.png")` is not a
 * length. The ANCHORED form is stripped too, with a fallback naming the SAME axis:
 * `var(--_sec-1cqh, 1cqi)` would measure height in preview and width in export.
 */
function bareCqIn(value) {
  let v = value
    .replace(/url\([^)]*\)/gi, '')
    .replace(/"[^"]*"|'[^']*'/g, '');
  for (const unit of ANCHORED_AXES) {
    v = v.replace(new RegExp(`var\\(\\s*--_sec-1${unit}\\s*,\\s*1${unit}\\s*\\)`, 'gi'), '');
  }
  // A reference with no fallback is a different (missing-fallback) bug, not a bare unit.
  v = v.replace(/var\(\s*--_sec-1cq[a-z]+\s*\)/gi, '');
  return /[\d.]cq[a-z]+\b/i.test(v);
}

// The nearest enclosing rule that targets the section itself, skipping at-rule
// preludes (`@media`, `@container`, `@supports`) and native-nesting `&` levels —
// declarations inside those still land on the section.
function sectionOwner(stack) {
  for (let i = stack.length - 1; i >= 0; i--) {
    const s = stack[i];
    if (!s || s.startsWith('@') || /^&/.test(s)) continue;
    return targetsSectionElement(s) ? s : null;
  }
  return null;
}

// Scan one rule body's declarations. Split out so both the plain path and the
// nested-block path (declarations sitting BEFORE a nested `{`) use it — a nested
// rule used to swallow everything declared above it in the same block.
function scanDecls(body, prelude, out = []) {
  for (const raw of body.split(';')) {
    const decl = raw.trim();
    // A custom property is not applied to anything by itself — its CONSUMER is, and
    // that consumer is what this scan sees. (One exception matters and is checked
    // separately below: a token declared ONLY at `:root` cannot be anchored at all,
    // because `var()` substitutes on `html`, where the stamp does not exist.)
    if (!decl || decl.startsWith('--')) continue;
    if (bareCqIn(decl)) {
      out.push({ selector: prelude.replace(/\s+/g, ' ').slice(0, 70), decl: decl.replace(/\s+/g, ' ') });
    }
  }
  return out;
}

/**
 * The other half, and the one that bit hardest: a custom property whose value routes
 * through `var(--_sec-1cq*)` but which is declared ONLY in a rule that does not match
 * the section. `var()` is substituted at computed-value time on the element the
 * declaration APPLIES to — for a `:root` rule that is `html`, where the stamp does not
 * exist — so the fallback is baked into the inherited value and the token still
 * resolves against the ICB. It LOOKS anchored and is not.
 *
 * This is not hypothetical: this gate's own first version shipped exactly that, and it
 * passed every other check. The `--sp-*` scale gets it right by declaring on
 * `:root, section` so the section copy re-substitutes per slide; that duplication is
 * load-bearing, not decoration. A token also declared in a section-subject rule
 * anywhere in the same file is fine — that copy is the one that does the work.
 */
function rootOnlyAnchorOffences(css) {
  const src = stripComments(css);
  const decls = []; // { prop, sel, sectionSubject }
  let selStart = 0;
  const stack = [];
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === '{') { stack.push(src.slice(selStart, i).trim()); selStart = i + 1; continue; }
    if (ch !== '}') continue;
    const prelude = stack.pop() || '';
    const body = src.slice(selStart, i);
    selStart = i + 1;
    if (prelude.startsWith('@')) continue;
    for (const raw of body.split(';')) {
      const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/i.exec(raw);
      if (!m || !/var\(\s*--_sec-1cq[a-z]+/.test(m[2])) continue;
      decls.push({ prop: m[1], sel: prelude.replace(/\s+/g, ' ').slice(0, 70), onSection: targetsSectionElement(prelude) });
    }
  }
  const anchoredSomewhere = new Set(decls.filter((d) => d.onSection).map((d) => d.prop));
  return decls.filter((d) => !d.onSection && !anchoredSomewhere.has(d.prop));
}

/**
 * The arm that actually covers the reported bug's SHAPE. A bare `cq*` reaches the
 * section's own box through a TOKEN more often than it is written there directly:
 *
 *   :root { --frame-inset-y: 1.875cqi }
 *   section.form { --footer-reserve: calc(var(--frame-inset-y) + …);
 *                  padding-bottom: var(--footer-reserve) }
 *
 * Neither declaration trips a literal-unit scan — the consumer holds no `cq` token,
 * and the declaration site is a custom property. That is #1243 itself, and it is also
 * `section.compact`'s `--sp-*` overrides and `--tone-rail`, both of which survived the
 * first version of this gate while it reported "budget 0, achieved".
 *
 * So: seed the set with every token a SECTION-SUBJECT rule uses in a real property,
 * close it over token→token references (a length resolves where it is USED, so the
 * whole chain lands on the section), and flag any declaration of a token in that set
 * whose value carries a bare `cq*`. Tokens consumed only by descendants or pseudo-
 * elements are NOT in the set — their `cq*` resolves against the section already, and
 * "anchoring" one would move it 11% (border box vs content box).
 */
function sectionOwnTokenLeaks(files) {
  const declsByToken = new Map(); // token → [{ file, value }]
  const seed = new Set();
  const refs = (v) => [...v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map((m) => m[1]);
  for (const { file, css } of files) {
    const src = stripComments(css);
    let selStart = 0;
    const stack = [];
    for (let i = 0; i < src.length; i++) {
      const ch = src[i];
      if (ch === '{') { stack.push(src.slice(selStart, i).trim()); selStart = i + 1; continue; }
      if (ch !== '}') continue;
      const prelude = stack.pop() || '';
      const body = src.slice(selStart, i);
      selStart = i + 1;
      if (prelude.startsWith('@')) continue;
      const onSection = targetsSectionElement(prelude);
      for (const raw of body.split(';')) {
        const m = /^\s*(--[a-z0-9-]+)\s*:\s*([\s\S]+)$/.exec(raw);
        if (m) {
          if (!declsByToken.has(m[1])) declsByToken.set(m[1], []);
          declsByToken.get(m[1]).push({ file, value: m[2].replace(/\s+/g, ' ').trim() });
          continue;
        }
        if (onSection) for (const t of refs(raw)) seed.add(t);
      }
    }
  }
  // Transitive closure: a token used by a section-own property drags in whatever its
  // own value references — the bare unit can sit any number of hops up the chain.
  const queue = [...seed];
  while (queue.length) {
    for (const d of declsByToken.get(queue.pop()) || []) {
      for (const t of refs(d.value)) if (!seed.has(t)) { seed.add(t); queue.push(t); }
    }
  }
  const out = [];
  for (const token of seed) {
    for (const d of declsByToken.get(token) || []) {
      if (bareCqIn(d.value)) out.push({ file: d.file, token, value: d.value.slice(0, 60) });
    }
  }
  return out;
}

// Wider than SECTION_BOX_ROOTS on purpose: `section.compact`'s spacing overrides live
// in lib/shared and the scaffold's berths in lib/integrations, both outside the
// section-BOX gate's roots — and both leaked. This gate walks all engine CSS.
const SECTION_CQ_ROOTS = [LIB_DIR, path.join(ROOT, 'themes')];

function checkSectionCqAnchoring(errors) {
  const offences = [];
  for (const root of SECTION_CQ_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of listCssFiles(root)) {
      const rel = path.relative(ROOT, file);
      for (const o of sectionCqOffences(fs.readFileSync(file, 'utf8'))) offences.push({ file: rel, ...o });
    }
  }
  const remaining = [];
  const staleSanctions = [...SANCTIONED_SECTION_CQ];
  for (const o of offences) {
    const i = staleSanctions.findIndex((s) => s.file === o.file && o.decl.startsWith(s.decl));
    if (i === -1) remaining.push(o);
    else staleSanctions.splice(i, 1);
  }
  if (remaining.length > SECTION_CQ_BUDGET) {
    const top = remaining.slice(0, 6).map((o) => `${o.file} \`${o.selector}\` → ${o.decl}`).join('; ');
    errors.push(
      `${remaining.length} bare container-query unit(s) in declarations that land on the SECTION element ` +
      `(budget ${SECTION_CQ_BUDGET}). A \`container-type: size\` element cannot query itself, so these resolve ` +
      `against the ICB — the HOST VIEWPORT in a browser preview — and the slide's own geometry then tracks the ` +
      `preview pane instead of the slide (the Playground/Studio overflow disagreement). Anchor to the slide: ` +
      `\`calc(var(--_sec-1cqi, 1cqi) * N)\`, or \`--_sec-1cqh\` on the height axis. Offending: ${top}.`,
    );
  }
  for (const s of staleSanctions) {
    errors.push(
      `stale section-cq sanction in tools/check-ownership.js — \`${s.decl}\` in ${s.file} is no longer ` +
      `present. Remove the SANCTIONED_SECTION_CQ entry so the allowlist stays honest.`,
    );
  }
  // …and the anchored form that cannot work: declared only where the stamp isn't.
  const rootOnly = [];
  for (const root of SECTION_CQ_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of listCssFiles(root)) {
      const rel = path.relative(ROOT, file);
      for (const o of rootOnlyAnchorOffences(fs.readFileSync(file, 'utf8'))) rootOnly.push({ file: rel, ...o });
    }
  }
  // …and the shape that reaches the section's own box through a TOKEN.
  const cssFiles = [];
  for (const root of SECTION_CQ_ROOTS) {
    if (!fs.existsSync(root)) continue;
    for (const file of listCssFiles(root)) {
      cssFiles.push({ file: path.relative(ROOT, file), css: fs.readFileSync(file, 'utf8') });
    }
  }
  const tokenLeaks = sectionOwnTokenLeaks(cssFiles);
  if (tokenLeaks.length) {
    const top = tokenLeaks.slice(0, 6).map((o) => `${o.file} ${o.token}: ${o.value}`).join('; ');
    errors.push(
      `${tokenLeaks.length} token(s) carrying a bare container-query unit reach the SECTION'S OWN box ` +
      `through a var() chain. A length resolves where it is USED, so the whole chain lands on the section, ` +
      `where \`container-type: size\` sends it to the ICB — the host viewport in a browser. This is the shape ` +
      `#1243 was: \`:root{--frame-inset-y:1.875cqi}\` → \`--footer-reserve\` → \`section.form{padding-bottom}\`, ` +
      `where neither declaration holds a literal unit next to a section selector. Anchor the token ` +
      `(\`calc(N * var(--_sec-1cqi, 1cqi))\`) — note this is only correct because a SECTION-OWN consumer ` +
      `exists; a token read only by descendants must stay bare. Offending: ${top}.`,
    );
  }
  if (rootOnly.length) {
    const top = rootOnly.slice(0, 6).map((o) => `${o.file} \`${o.sel}\` → ${o.prop}`).join('; ');
    errors.push(
      `${rootOnly.length} token(s) route through \`var(--_sec-1cq*)\` but are declared ONLY where the stamp ` +
      `does not exist. \`var()\` is substituted on the element the declaration APPLIES to — for a \`:root\` rule ` +
      `that is \`html\` — so the fallback is baked into the inherited value and the token still resolves against ` +
      `the ICB. It reads as anchored and is not. Declare it on \`:root, section\` (like the --sp-* scale) so the ` +
      `section copy re-substitutes the stamp per slide. Offending: ${top}.`,
    );
  }
}

// HARD RULE #20 gate — keep `margin` out of the engine's layout CSS; space with
// `gap`/`padding`, which measure cleanly (engineering/gotchas.md). Layout budget 0 +
// the SANCTIONED allowlist above.
/**
 * A multi-layer `background:` shorthand may not contain a `var()`. Budget 0 (#1528).
 *
 * One undefined `var()` invalidates the WHOLE declaration at computed-value time, and the
 * property then takes its INITIAL value — it does NOT fall back to an earlier rule that set
 * the same property. So in `background: var(--spectrum) top / 100% 1px no-repeat, var(--bg)`
 * a missing ribbon token took the CANVAS with it: measured in Chromium 131, a `_class: dark`
 * slide rendered white with its near-white headline invisible on it.
 *
 * WHY THIS RULE AND NOT A TOKEN LIST. The first cut of this guard enumerated the tokens it
 * considered droppable (`--spectrum*`, `--sp-fill-*`, `--accent`) and the ones it considered
 * load-bearing (`--bg`, `--code-bg`, …). Two independent adversarial passes defeated it four
 * ways, each with a rule a reasonable author would write:
 *   · a single layer naming BOTH a droppable and a surface token (the `color-mix(… var(--accent)
 *     …, var(--bg-alt))` idiom, live in roadmap.styles.css) collapsed the two indices and the
 *     second layer's canvas was never considered;
 *   · `BACKGROUND:` — CSS property names are case-insensitive, the scan was not;
 *   · a droppable token outside the list (there are 107 theme tokens with no engine `:root`
 *     default: `--cat-N-fill`, `--pass`/`--warn`/`--fail`, `--diagram-*`, `--brand-alt`, …);
 *   · a surface token outside the list (`--accent-soft`, `--tag-bg`, `--pass-bg`, …).
 * All four lose the canvas in real Chromium. The structural rule needs no judgment about
 * which layer is load-bearing, has no list to rot, and subsumes every one of them.
 *
 * It is also reachable TODAY: after #1528, `lib/**` contains exactly ONE multi-layer
 * `background:` shorthand and it reads no `var()` at all (an all-literal rgba stack), so the
 * budget is 0 with an empty allowlist rather than a ratchet.
 *
 * A SINGLE-layer `background: var(--x)` is fine and deliberately not matched: an invalid
 * declaration there costs exactly the decoration it was painting, which is the correct
 * degradation. The hazard is only ever one layer taking another down with it.
 */
const SANCTIONED_BACKGROUND_LAYERS = [];

/** Split a `background` value on its TOP-LEVEL commas — the layer separators. */
function backgroundLayers(value) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i++) {
    const c = value[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) { out.push(value.slice(start, i)); start = i + 1; }
  }
  out.push(value.slice(start));
  return out;
}

/** Every multi-layer `background:` shorthand in `css` that reads a `var()`, with its line. */
function varInMultiLayerBackground(css) {
  const s = stripComments(css);
  const out = [];
  // `i` flag: CSS property names are case-insensitive, so `BACKGROUND:` is the same
  // declaration. Omitting it was one of the four evasions found by the trio.
  for (const m of s.matchAll(/(^|[;{])\s*background\s*:([^;}]*)/gi)) {
    const layers = backgroundLayers(m[2]);
    if (layers.length > 1 && layers.some((l) => /var\(/.test(l))) {
      out.push({ line: s.slice(0, m.index).split('\n').length, value: m[2].trim() });
    }
  }
  return out;
}

function checkBackgroundLayerVars(errors) {
  const offenders = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const rel = path.relative(ROOT, file);
    for (const hit of varInMultiLayerBackground(fs.readFileSync(file, 'utf8'))) {
      offenders.push({ file: rel, line: hit.line, value: hit.value });
    }
  }
  const remaining = [...offenders];
  const stale = [];
  for (const s of SANCTIONED_BACKGROUND_LAYERS) {
    const i = remaining.findIndex((o) => o.file === s.file && o.value.includes(s.value));
    if (i === -1) stale.push(s);
    else remaining.splice(i, 1);
  }
  if (remaining.length) {
    const top = remaining.slice(0, 4).map((o) => `${o.file}:${o.line}`).join(', ');
    errors.push(
      `${remaining.length} multi-layer \`background:\` shorthand(s) in engine CSS read a var() ` +
      `(budget 0). One undefined var() invalidates the WHOLE declaration and the property falls to ` +
      'its INITIAL value, so a missing theme token takes the OTHER layers with it — that is how a ' +
      '`_class: dark` slide rendered white with an invisible headline (#1528). Split into ' +
      '`background-color:` + `background-image:` longhands so a miss costs only the layer that ' +
      `named the token. Offending: ${top}. If a shorthand is provably the only answer, add it to ` +
      'SANCTIONED_BACKGROUND_LAYERS in tools/check-ownership.js with its justification.',
    );
  }
  for (const s of stale) {
    errors.push(
      `stale background-layer sanction in tools/check-ownership.js — \`${s.value}\` in ${s.file} is ` +
      'no longer present. Remove the SANCTIONED_BACKGROUND_LAYERS entry so the allowlist stays honest.',
    );
  }
}

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

// ─── Stage-inset ownership (Forms inset rule, design/forms.md §6.1, #1598) ──
// THE RULE: the stage owns the outer inset; a body owns only the spacing between
// its own elements. HARD RULE #20 already fixes WHAT to space with (`padding` and
// `gap`, never `margin`); this fixes WHICH BOX the outer inset belongs to.
//
// WHAT THIS GATE CATCHES, and why it is a grep and not a render. A body re-derives
// the frame inset in a shape that reads as SIZING: it takes the container's own
// width in container units and subtracts a spacing token —
// `width: calc(100cqi - 2 * var(--sp-2xl))`. That is not a width, it is an inset
// wearing a width's clothes, and it is invisible as a defect because the box it
// produces looks deliberate: the chart is centered, it is inside the frame, and
// nothing overflows. It cost 128px per side on every chart (frame + calc + the
// body's own padding = 192 against prose's 64) and 64px on every diagram, for
// years, and #680 costed the chart's inline debt at HALF the real number because
// the calc reads as sizing rather than as spacing.
//
// It is measurable — a rendered body's border box should equal its stage's content
// box — and `tools/check-chart-fit.js` DOES assert exactly that on a real render at
// three sizes. This gate is the cheap half of the pair: it runs browser-free inside
// `build:check`, on EVERY component (not just the charts a fixture happens to
// cover), and it fires the moment the shape is typed rather than after a 3-render
// sweep somebody has to remember to run.
//
// TWO CHECKS, because the defect has two natural spellings and they need different
// scopes:
//
//   (a) REPO-WIDE — a container-unit SUBTRACTION on a sizing property. There is no
//       legitimate reason to compute "my container's width, less some spacing"
//       inside a frame whose inset is already `--frame-x`; the container-unit
//       basis is what makes it an inset rather than a size.
//
//   (b) BODY SHEETS ONLY — `padding` (or a `padding-*` longhand) on a rule whose
//       subject is a known BODY element: `.chart-body`, `.mermaid`, `.mermaid-svg`.
//       This is the easiest wrong move of all — "inset the chart a bit more" is
//       spelled `padding` by anyone who has not read design/forms.md §6.1 — and
//       (a) cannot see it, because a container-unit subtraction in `padding` is
//       spacing that says so and is the rule's OWN idiom. Two exits, both from the
//       rule's second clause rather than bolted on: a selector naming `.canvas`
//       (the chart's glass panel PAINTS a surface, so it earns an internal inset)
//       and a selector naming `figure` (the Read·Article projection is not a Form
//       — it re-hosts a body with no `.cell-stage` above it, so there is no stage
//       there to own anything).
//
// KNOWN HOLES, stated rather than implied. (a) cannot see a pre-evaluated fraction
// (`width: 90cqi` is the same defect with the arithmetic already done — and the
// comment this change deleted literally taught that spelling), and (b) only knows
// the three body classes named below. Both are covered by the RENDER assertion in
// check-chart-fit.js, which measures the box chain instead of reading the CSS.
// That is why the pair exists; neither half is sufficient alone.
//
// Budget 0 + a sanction list, failing BOTH ways like SANCTIONED_MARGINS: an
// unlisted offender fails, and a listed sanction that no longer matches fails too,
// so the allowlist cannot rot into a silent pass.
const SANCTIONED_STAGE_INSETS = [
  // This list was empty while check (b) ran on the inline axis only. Widening it
  // back to BOTH axes (the block pair's retirement — a body's block padding is not
  // a clip margin after all) brings back the one entry it briefly carried, and this
  // time the entry is correct rather than incidental: it is a seam, and a seam that
  // provably cannot be spelled any other way.
  {
    file: 'lib/integrations/highlight-js/highlight-js.css',
    prop: 'padding-bottom',
    value: 'var(--sp-sm) (on `.mermaid:has(+ .mermaid-error)`)',
    why: 'The gap between a failed diagram and the parser-error block beneath it. It '
      + 'cannot be a `margin-top` on the error block — HARD RULE #20, and that block is '
      + 'bordered and filled, so a margin there bleeds its fill and cannot be measured. It '
      + 'cannot be the container\'s `gap` either: the container is the stage, whose gap is '
      + 'one value shared by every seam in the column, so expressing it there moves other '
      + 'seams to fix this one. So it lands on the diagram container (which paints no '
      + 'background) as the previous sibling — spacing between two of the container\'s own '
      + 'children, which is the half of the rule a box IS allowed to own, wearing a '
      + 'padding\'s clothes only because the sibling it spaces cannot carry it.',
  },
];

// The body elements the Forms inset rule governs — the boxes that dock in a stage
// cell. Adding one here is how a newly-migrated component joins check (b).
const INSET_BODY_SELECTORS = ['.chart-body', '.mermaid-svg', '.mermaid'];

/**
 * Blank out `var(--name)` references, keeping the parens balanced and the length
 * stable. Load-bearing: a token NAME contains hyphens, so a naive "is there a `-`
 * after 100cqi" test fires on the entirely legitimate
 * `calc(100cqi * var(--canvas-scale))`. Only an operator hyphen should count.
 */
function blankVarRefs(value) {
  return value.replace(/var\(\s*--[\w-]+/g, (m) => `var(${'x'.repeat(m.length - 4)}`);
}

// The INLINE-axis sizing properties, plus custom properties (a `--w:` holding the
// shape and a `width: var(--w)` reading it is the same defect, one indirection
// away). Deliberately NOT the block axis: `height: calc(100cqh - var(--masthead-h))`
// is an ordinary "fill the container minus a reserved band", which is not what this
// rule is about — the outer inset is an INLINE concern, and firing on the block axis
// would push legitimate code into the allowlist, which is how an allowlist rots.
const INLINE_SIZE_PROPS =
  /^(?:width|min-width|max-width|inline-size|min-inline-size|max-inline-size|flex-basis|--[\w-]+)$/;

/**
 * (a) A full-container basis, less a SPACING TOKEN, on an inline sizing property:
 * `calc(100cqi - 2 * var(--sp-2xl))` and its spellings. Three conjuncts, each one
 * narrowing a false-positive class the trio found:
 *   · basis `100cq[iw]` or `100%` — the whole of the container, not a fraction;
 *   · a subtraction inside a math function (`calc`/`min`/`max`/`clamp`);
 *   · the subtrahend names a SPACING token (`--sp-*`) or a FRAME token — which is
 *     what makes it an inset rather than arithmetic. `max-width: calc(100cqi - 2px)`
 *     is a hairline correction, not a re-derived frame inset, and must not fire.
 * The cost of that last conjunct is stated in the KNOWN HOLES note above: a
 * hard-coded `calc(100cqi - 128px)` escapes (a) and is left to the render assertion.
 */
function offendingStageInsets(css) {
  const out = [];
  // Declaration values only (after `:`, up to `;`/`}`), so a selector or an
  // at-rule preamble can never trip it.
  const DECL = /(^|[;{])\s*(--[\w-]+|[a-zA-Z-]+)\s*:\s*([^;{}]*)/g;
  // The WHOLE container, and the very next operator is a subtraction. Both halves
  // are load-bearing: `calc(100% / 3 - 2 * var(--sp-md) / 3)` is an N-up track
  // width (a FRACTION of the container, less its share of the gaps) and appears
  // legitimately in pricing and cards-grid — matching a bare `100%` anywhere in the
  // expression fired on all five of them.
  const BASIS = /(?:calc|min|max|clamp)\([^;]*(?:\b100cq(?:[iw]|min|max)\b|(?<![\d.])100%)\s*-\s/;
  const SPACING = /var\(\s*--(?:sp-|frame-)/;
  let m = DECL.exec(css);
  while (m !== null) {
    const [, , prop, value] = m;
    // Only SIZING properties: a container-unit subtraction in `padding`/`gap`/
    // `translate` is spacing that says so, and is check (b)'s business, not (a)'s.
    if (INLINE_SIZE_PROPS.test(prop)) {
      // `var(--name)` refs are blanked first: a token NAME contains hyphens, so an
      // unguarded operator test fires on `calc(100cqi * var(--canvas-scale))`.
      // A DIVISION means a track width, not an inset: `calc((100% - 2 * var(--sp-lg))
      // / 3)` is math's 3-up column (the container, less its gaps, split three ways).
      // A re-derived frame inset never divides — it subtracts and stops.
      const probe = blankVarRefs(value);
      if (BASIS.test(probe) && SPACING.test(value) && !probe.includes('/')) {
        out.push({ prop, value: value.trim().replace(/\s+/g, ' ') });
      }
    }
    m = DECL.exec(css);
  }
  return out;
}

/**
 * (b) `padding` on a body element's own rule. Walks (selector, block) pairs so the
 * exits can key on the SELECTOR — `.canvas` (the body paints a panel there) and
 * `figure` (the Read·Article projection, which has no stage) — rather than on a
 * file path, which would exempt whole sheets instead of the cases that earn it.
 */
function offendingBodyPadding(css) {
  const out = [];
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  let m = RULE.exec(css);
  while (m !== null) {
    const selector = m[1].trim().replace(/\s+/g, ' ');
    const block = m[2];
    // The rule's SUBJECT (its last compound), not any ancestor in the selector:
    // `section.chart-frame .chart-body { padding }` offends, `.chart-body p {}`
    // does not — that padding belongs to the `p`. Functional pseudos are emptied
    // first so a class named only INSIDE one (`.mermaid:has(+ .mermaid-error)`)
    // does not read as the subject, and classes are compared WHOLE — substring
    // matching made `.mermaid` swallow `.mermaid-error`, a painted box that earns
    // its padding, and `.mermaid-error-detail` with it.
    let subject = selector.split(',')[0].trim();
    let prev;
    do { prev = subject; subject = subject.replace(/:(?:is|where|not|has)\([^()]*\)/g, ''); }
    while (subject !== prev);
    subject = subject.split(/[\s>+~]+/).filter(Boolean).pop() || '';
    const subjectClasses = new Set([...subject.matchAll(/\.([\w-]+)/g)].map((c) => c[1]));
    const subjectsBody = INSET_BODY_SELECTORS.some((cls) => subjectClasses.has(cls.slice(1)));
    if (subjectsBody && !/\.canvas|figure/.test(selector)) {
      for (const d of block.split(';')) {
        const [prop, ...rest] = d.split(':');
        const value = rest.join(':').trim();
        // BOTH AXES, as of the block pair's retirement. This used to be INLINE
        // only, on the reading that a body's BLOCK padding is a CLIP MARGIN — the
        // slack a chart paints into — because removing it clipped nine decks
        // (#1598 §7). That experiment MOVED the padding to the stage, which is a
        // different change with the opposite sign: the body is `flex: 1`, so its
        // border box is the stage either way, and moving the padding out collapses
        // the CLIP box onto the layout box while zeroing it grows the CONTENT box
        // and leaves the clip boundary where it was. Re-measured zeroed rather than
        // moved: `overflow:check` over all 268 decks came back identical to
        // baseline, and `check-chart-fit` went 3 clips to 1 — the padding was
        // CAUSING overflow on the bodies pinned to natural height, not absorbing it.
        // The exits are unchanged and are the whole of the exception: a body that
        // PAINTS a surface (`.canvas`) or has no stage to own anything (the
        // Read·Article `figure` projection) earns its own padding. See the
        // `--chart-panel-y` note in chart-family.css.
        if (/^\s*padding(?:-(?:inline|block|top|right|bottom|left))?(?:-(?:start|end))?\s*$/.test(prop)
          && value && !/^0(?:px|em|rem|%)?$/.test(value)) {
          out.push({ prop: prop.trim(), value: `${value} (on \`${selector}\`)` });
        }
      }
    }
    m = RULE.exec(css);
  }
  return out;
}

function checkStageInsetOwnership(errors) {
  const offences = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const rel = path.relative(ROOT, file);
    for (const o of offendingStageInsets(css)) offences.push({ file: rel, ...o });
    for (const o of offendingBodyPadding(css)) offences.push({ file: rel, ...o });
  }
  // A sanction with no stated reason is a waiver, not a record — the error text and
  // design/forms.md §6.1 both promise "with its justification", so require it.
  for (const s of SANCTIONED_STAGE_INSETS) {
    if (!s.why?.trim()) {
      errors.push(
        `SANCTIONED_STAGE_INSETS entry for ${s.file} (${s.prop}) has no \`why\` — a sanction ` +
        'without a stated justification is a silent waiver. Add one or delete the entry.',
      );
    }
  }
  const remaining = [...offences];
  const stale = [];
  for (const s of SANCTIONED_STAGE_INSETS) {
    const i = remaining.findIndex((o) => o.file === s.file && o.prop === s.prop && o.value === s.value);
    if (i === -1) stale.push(s);
    else remaining.splice(i, 1);
  }
  if (remaining.length) {
    const top = remaining.slice(0, 5).map((o) => `${o.file} (${o.prop}: ${o.value})`).join(', ');
    errors.push(
      `${remaining.length} container-width inset(s) in engine CSS (budget 0). ` +
      '`calc(100cq* − <spacing>)` on a sizing property is an OUTER INSET wearing a width\'s ' +
      'clothes: the frame already insets the body once via --frame-x, so this re-derives it a ' +
      'second time and the figure pays twice (design/forms.md §6.1 — the stage owns the outer ' +
      'inset, a body owns only the spacing between its own elements). Fill the box that already ' +
      'carries the inset (`width: 100%`) and put any component-specific inset on the STAGE CELL ' +
      `(\`section.<x> > .cell-stage { padding: … }\`). Offending: ${top}. If a container-width ` +
      'subtraction is provably the only answer, add it to SANCTIONED_STAGE_INSETS in ' +
      'tools/check-ownership.js with its justification.',
    );
  }
  for (const s of stale) {
    errors.push(
      `stale stage-inset sanction in tools/check-ownership.js — \`${s.value}\` in ${s.file} is no ` +
      'longer present. Remove the SANCTIONED_STAGE_INSETS entry so the allowlist stays honest.',
    );
  }
}

// ── The slide's DEPTH axis: every layering decision names a plane ─────────────────
// A slide is a small stack of named planes (`--z-canvas` … `--z-alarm`,
// base.tokens.css § depth axis), and this gate is what keeps the engine on them.
// Before the model, engine CSS ran on 50 hand-picked integers over an ad-hoc ladder
// (-1, 0, 1, 2, 3, 50, 100, 2147483000): a Tile whose manifest declared plane 1
// (atmosphere) sat at `z-index: -1` and painted UNDER the finish field it is defined
// to sit above, and `citation-card.styles.css` carries a comment recording the same
// bug found and patched independently. Two authors, two local fixes, no shared rule.
//
// WHAT THIS GATE CHECKS — the half of the model that is decidable from CSS text:
//
//   1. NO MAGIC INTEGERS. Any `z-index` outside the LOCAL BAND 0–9 must be a `--z-*`
//      token. The band is what an occupant's internals get (a rail behind a node is
//      `z-index: 1`); it is safe because the band sits BETWEEN `--z-atmosphere` (-1) and
//      `--z-chrome` (30) by arithmetic — NOT because anything isolates it. Anything reaching
//      beyond the band is claiming a slide-scale position and has to name which one.
//      (An earlier version of this note said the stage must not isolate because doing so made
//      the print path rasterize a hairline. That was a `pdftoppm` artifact, not a PDF fact —
//      see the decision note § The wash that was a rasterizer. Whether the stage should
//      isolate is now an open design question, not a settled prohibition.)
//
//   2. NO DECORATIVE OR PHANTOM TOKENS, both directions: a plane token nothing reads is
//      an error, and so is a `var(--z-…)` the scale does not define — the latter because
//      an undefined custom property makes the whole declaration invalid at compute time,
//      so the element silently falls back to `z-index: auto`. That is the flat behavior
//      the model exists to remove, wearing a token's clothes.
//
// AND WHAT IT DELIBERATELY DOES NOT CHECK: whether a given element sits on the RIGHT
// plane. That needs to know which elements are direct children of a `section`, and
// deciding that from CSS text alone does not work — the removed gate tried it, abandoned
// it at "38 candidates, nearly all false positives", and a rebuilt version here fired on
// `.state-chart-edges`, `.scene-control` and `.panel-eyebrow`, none of which is a section
// child. So that half is EMPIRICAL and lives in
// test/integration/invariants/slide-planes.test.js: render a corpus of decks, walk every
// real direct child of every section, and assert its computed z-index is a plane value.
// That asks the DOM instead of modelling it, and it needs no enumeration at all — the
// same division of labour the gate this replaced arrived at for its own derived check.
//
// WHAT REPLACED WHAT. This gate stands where `checkFinishChromeExclusions` did. That
// one kept base.finish.css's `:where(header, footer, img.deck-logo, …)` exclusion list
// honest — the list that stopped a blanket `position: relative` from dragging
// out-of-flow chrome into flow (2026-08-04-finish-stacking-displaces-frame-chrome.md).
// Planes deleted the blanket rule, so the list and its gate went with it.
//
// A PARTING LESSON FROM ITS REMOVAL, which is why check 1 strips comments first: that
// gate located its subject with `css.indexOf('section.finish > *:not(.backdrop, :where(')`
// on the RAW file. When the rule was deleted and quoted in the comment explaining the
// deletion, the gate found the quote, parsed the comment as its exclusion list, and
// passed — certifying a rule that no longer existed, which is precisely the outcome its
// own error message was written to prevent. A gate must not be able to read its own
// obituary as its subject. engineering/decisions/2026-08-12-slide-plane-model.md.

// Files whose z-index values are NOT slide layering and are out of scope:
//   · base.tokens.css — where the scale itself is defined.
//   · the fluid-view toggle reads `--z-viewer`, which is a DOCUMENT-level value, not a
//     slide plane; it is a token either way, so check 1 passes it without an exemption.
const Z_PLANE_TOKENS_FILE = path.join(LIB_DIR, 'base', 'base.tokens.css');
const Z_LOCAL_BAND_MAX = 9;


/** The `--z-*` plane tokens defined in base.tokens.css, in declaration order.
 *  The `@property` prelude is `--z-name {`, not `--z-name:`, so the descriptor block is
 *  invisible to this pattern by construction — that is what `registeredPlaneTokens()`
 *  below is for, and why the two are cross-checked. */
function definedPlaneTokens() {
  const css = stripComments(fs.readFileSync(Z_PLANE_TOKENS_FILE, 'utf8'));
  return [...css.matchAll(/(--z-[a-z0-9-]+)\s*:\s*(-?\d+)\s*;/g)].map((m) => ({ name: m[1], value: Number(m[2]) }));
}

/** The `--z-*` planes REGISTERED with `@property`, as {name, initial}. */
function registeredPlaneTokens() {
  const css = stripComments(fs.readFileSync(Z_PLANE_TOKENS_FILE, 'utf8'));
  const out = [];
  for (const m of css.matchAll(/@property\s+(--z-[a-z0-9-]+)\s*\{([^}]*)\}/g)) {
    const body = m[2];
    const initial = /initial-value\s*:\s*(-?\d+)/.exec(body);
    const syntax = /syntax\s*:\s*["']([^"']+)["']/.exec(body);
    const inherits = /inherits\s*:\s*(true|false)/.exec(body);
    out.push({
      name: m[1],
      initial: initial ? Number(initial[1]) : null,
      syntax: syntax ? syntax[1].trim() : null,
      inherits: inherits ? inherits[1] === 'true' : null,
    });
  }
  return out;
}

/**
 * Every `z-index` declaration in engine CSS, with its selector and whether it uses a
 * token. Comments are stripped FIRST — see the obituary note above.
 * Returns [{ file, selector, raw, token, value }].
 */
function collectZIndexDeclarations() {
  const out = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const rel = path.relative(ROOT, file);
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(css))) {
      const selector = m[1].trim().replace(/\s+/g, ' ');
      for (const d of m[2].matchAll(/(^|[;\s])z-index\s*:\s*([^;}]+)/g)) {
        const raw = d[2].trim().replace(/\s*!important$/, '');
        const token = /^var\(\s*(--z-[a-z0-9-]+)/.exec(raw);
        out.push({
          file: rel,
          selector,
          raw,
          token: token ? token[1] : null,
          value: /^-?\d+$/.test(raw) ? Number(raw) : null,
        });
      }
    }
  }
  return out;
}

function checkZPlanes(errors) {
  const tokens = definedPlaneTokens();
  const byName = new Map(tokens.map((t) => [t.name, t.value]));
  const decls = collectZIndexDeclarations().filter((d) => !d.file.endsWith('base.tokens.css'));

  // ── 1 · no magic integers outside the local band ─────────────────────────────────
  // UNREADABLE values are errors, not passes. `value` is null for anything that is not a
  // bare integer and `token` is null for anything that is not a `var(--z-*)`, so a value in
  // any third syntax — `calc(30 + 25)`, `var(--lift)`, a keyword — used to satisfy both
  // filters and sail through. That is not hypothetical: the adversarial pass landed
  // `z-index: var(--lift)` at 9999 and `z-index: calc(30 + 25)` (above --z-alarm) inside a
  // component and the gate reported zero errors. It matters more here than it would in a
  // model that isolates: containment in this engine is ARITHMETIC — the 0–9 band sits
  // between atmosphere and chrome and nothing isolates it — so this gate IS the containment,
  // and a gate that reads one syntax out of three is not one.
  for (const d of decls) {
    if (d.value !== null || d.token !== null) continue;
    errors.push(
      `${d.file}: \`${d.selector}\` declares \`z-index: ${d.raw}\`, which this gate cannot ` +
      'read. A slide-scale z-index must be a `--z-*` plane token and a local one must be a bare ' +
      `integer in 0–${Z_LOCAL_BAND_MAX}; a \`calc()\`, an indirect custom property, or a keyword ` +
      'is neither, so nothing can check where it lands. Write the plane, or the band.',
    );
  }

  const magic = decls.filter((d) => d.value !== null && (d.value < 0 || d.value > Z_LOCAL_BAND_MAX));
  for (const d of magic) {
    errors.push(
      `${d.file}: \`${d.selector}\` declares \`z-index: ${d.raw}\`. If this element renders ` +
      `INSIDE a component or a Tile, use the local band 0–${Z_LOCAL_BAND_MAX} — it already sits ` +
      'between `--z-atmosphere` and `--z-chrome`, so it needs no token and no isolation. Only an ' +
      'element that can be a DIRECT CHILD of `section` names a plane, with a `--z-*` token ' +
      '(base.tokens.css § depth axis) — reaching for one from inside a component is how the ' +
      'citation-card glyph ended up sunk behind an opaque canvas.',
    );
  }

  // ── 2 · no decorative tokens, and none pointing at a plane that does not exist ──
  const used = new Set(decls.map((d) => d.token).filter(Boolean));
  for (const t of tokens) {
    if (!used.has(t.name)) {
      errors.push(
        `stale plane token in lib/base/base.tokens.css — \`${t.name}\` is defined but no engine ` +
        'CSS reads it. A plane nothing paints on is a name pretending to be a model; remove it, ' +
        'or land the rule that uses it in the same change.',
      );
    }
  }
  // ── 3 · every plane is REGISTERED, and its fallback agrees with its declaration ──
  // `@property` is what stops a bad value silently becoming `z-index: auto`. It is also a
  // SECOND source of truth for every plane's number, and the two are written a dozen lines
  // apart. Nothing else in the toolchain reads the descriptor block: this function's own
  // `definedPlaneTokens()` regex cannot match `--z-name {`, and check-css-values.js skips
  // descriptor at-rules whole. So a typo in `syntax:`, a dropped `initial-value:`, or a
  // drifted number silently unregisters the property or points the fallback at the wrong
  // plane — with zero gate failures and zero pixel change until it reaches the one surface
  // where it matters (the packed Studio path, where `packTheme` moves `:root` onto the
  // section and `initial-value` becomes the live fallback).
  const registered = new Map(registeredPlaneTokens().map((r) => [r.name, r]));
  for (const t of tokens) {
    const r = registered.get(t.name);
    if (!r) {
      errors.push(
        `lib/base/base.tokens.css: \`${t.name}\` is declared but not registered with ` +
        '`@property`. An unregistered plane accepts any value, so `--z-canvas: auto` from a ' +
        'deck or theme flattens it to `z-index: auto` instead of being rejected. Add ' +
        `\`@property ${t.name} { syntax: "<integer>"; inherits: true; initial-value: ${t.value}; }\`.`,
      );
      continue;
    }
    if (r.syntax !== '<integer>') {
      errors.push(
        `lib/base/base.tokens.css: \`@property ${t.name}\` declares \`syntax: "${r.syntax}"\`. ` +
        'A plane is an integer; any other syntax lets a non-integer through, which is the ' +
        'flattening this registration exists to prevent.',
      );
    }
    if (r.inherits !== true) {
      errors.push(
        `lib/base/base.tokens.css: \`@property ${t.name}\` declares \`inherits: ${r.inherits}\`. ` +
        'A plane must inherit. The scale is declared on `:root, section`, and every element that ' +
        'reads a plane is a DESCENDANT of the section — a non-inheriting registration would hand ' +
        'them the initial value instead of the declared one, which is the same flattening the ' +
        'registration exists to prevent. It is also the one descriptor the fallback reasoning in ' +
        'base.tokens.css argues from at length, so a silent flip there makes that comment false.',
      );
    }
    if (r.initial !== t.value) {
      errors.push(
        `lib/base/base.tokens.css: \`@property ${t.name}\` has \`initial-value: ${r.initial}\` ` +
        `but the token is declared \`${t.value}\`. These are the same plane written twice; when ` +
        'they disagree, an invalid value falls back to a DIFFERENT plane than the one every ' +
        'other rule reads. Keep them identical.',
      );
    }
  }
  for (const r of registered.keys()) {
    if (!byName.has(r)) {
      errors.push(
        `lib/base/base.tokens.css: \`@property ${r}\` registers a plane the scale does not ` +
        'declare. A registration with no declaration supplies a fallback for a plane nothing ' +
        'paints on — remove it, or land the declaration in the same change.',
      );
    }
  }

  for (const d of decls) {
    if (d.token && !byName.has(d.token)) {
      errors.push(
        `${d.file}: \`${d.selector}\` reads \`${d.token}\`, which base.tokens.css does not define. ` +
        'A `var()` on an undefined custom property makes the whole declaration invalid at compute ' +
        'time, so the element silently falls back to `z-index: auto` — the flat behavior the plane ' +
        'model exists to remove, wearing a token\'s clothes.',
      );
    }
  }

}

// ── HARD RULE #26: cascade layers stay INERT — engine CSS admits no layer blocks ──
// The bundle emits a 7-name `@layer` order (build-css.js LAYER_DECLARATION) but NO
// rule is wrapped in a layer: plain SOURCE ORDER decides the cascade. Wrapping even
// one file in `@layer` while the rest stay unlayered springs the rule-3 trap
// (unlayered beats layered regardless of specificity) → the layered rule silently
// loses; Phase 3.5b broke 100% of canary pages this way. Full activation is VETOED
// while export-to-Marp ships marp-core's unlayered scaffold Lattice cannot wrap
// (engineering/decisions/2026-06-18-layer-activation-scope.md, R-PATH). So the
// invariant is: engine CSS admits NO layer blocks. Budget 0 + an (empty) allowlist,
// same shape as #20/#3 — a new block fails; a sanction matching nothing ALSO fails.
// Scans lib/ source AND the built dist bundle (catches vendored KaTeX + JS-generated
// blocks the lib walk never sees), matching named + anonymous `@layer{}` and
// `@import … layer()` — the three ways a layered rule actually reaches a browser.
const { OUTPUT: LATTICE_BUNDLE, LAYER_DECLARATION } = require('./build-css');
const BUILD_CSS_SRC = path.join(ROOT, 'tools', 'build-css.js');

// The canonical layer order (names only). The gate asserts LAYER_DECLARATION parses
// to exactly this — a silent reorder/rename fails the build. Single source of the
// STRING is build-css.js; this is the pinned assertion target.
const CANONICAL_LAYER_ORDER = [
  'base', 'root', 'scaffold', 'components', 'semi-universal', 'universal', 'diagram-overrides',
];

// Stable sentinel the bundle must emit adjacent to the declaration so a dist reader
// learns the layers are inert (Part B). Kept in sync with build-css.js LAYER_INERT_NOTE.
// ── Math renderer parity (HARD RULE #1 — one source of truth across render paths) ──
//
// Lattice typesets with KaTeX; marp-core typesets with MathJax. A deck taken
// through export-to-Marp or the copy-and-go kit therefore arrives with a
// DIFFERENT DOM for the same `$$…$$`, and the two structures map 1:1:
//
//   .katex-display  ↔  mjx-container[display="true"]
//   .katex          ↔  mjx-container
//
// Engine CSS must name both halves or the layout silently engages on one surface
// and not the other — which is exactly how it shipped: every math hero equation
// was gated on `p:has(> .katex-display)`, matched nothing on a MathJax render,
// and the kit's own math slide came out a postage stamp in 45% dead space. The
// component was then fixed and `base.modifiers.css` was NOT, so a `$$…$$` on any
// non-math slide lost its vertical rhythm on the same surface — the same bug,
// one file away, inside the same change.
//
// So the pairing is a gate, not a comment: any engine CSS selector naming a
// `.katex*` class must carry its `mjx-container` counterpart.
const SANCTIONED_KATEX_ONLY = [
  {
    file: 'lib/components/math/math/math.styles.css',
    selector: 'section.math.compare .katex .katex-mathml',
    why:
      'KaTeX-only by design. This pins KaTeX\'s hidden MathML alternative out of the '
      + 'multicol fragmentation flow. marp-core\'s MathJax emits a bare <mjx-container> '
      + 'around an inline <svg> and NO assistive MathML at all, so there is no '
      + 'counterpart node to pin — a mjx- half would match nothing. The absence is an '
      + 'accessibility gap recorded in lib/core/marp-fidelity.js, not a layout one.',
  },
];

/**
 * Selectors in engine CSS that name a `.katex*` class without a MathJax counterpart.
 *
 * Reuses `topLevelSelectors` + `splitTopLevel` rather than its own regex (HARD
 * RULE #15). The first cut matched `([^{}]+)\{[^{}]*\}`, which had two holes a
 * reviewer caught: it never descended into `@media` / `@supports` / `@container`,
 * so a KaTeX-only rule nested in one would bypass the gate entirely, and it
 * treated a whole selector LIST as one string, so `a .katex, b mjx-container`
 * passed on the strength of a counterpart that applies to a different element.
 * Neither is reachable in today's corpus — but a gate exists to bind the author
 * who has not written the rule yet, and both holes are exactly the drift it is
 * here to stop.
 *
 * Checked PER SELECTOR, so the pairing must be inside one selector — `:is(.katex,
 * mjx-container)`, the form the whole engine uses. A comma list that pairs across
 * two selectors is rejected on purpose: it is indistinguishable, without resolving
 * the elements, from two unrelated selectors that happen to share a rule body.
 */
function katexOnlySelectors(css) {
  const out = [];
  for (const rule of topLevelSelectors(css)) {
    for (const part of splitTopLevel(rule)) {
      const selector = part.trim().replace(/\s+/g, ' ');
      if (!selector) continue;
      if (!/\.katex[\w-]*/.test(selector)) continue;
      if (/mjx-container/.test(selector)) continue;
      out.push(selector);
    }
  }
  return out;
}

function checkMathRendererParity(errors) {
  const offences = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const rel = path.relative(ROOT, file);
    for (const selector of katexOnlySelectors(fs.readFileSync(file, 'utf8'))) {
      offences.push({ file: rel, selector });
    }
  }
  const remaining = [...offences];
  const stale = [];
  for (const s of SANCTIONED_KATEX_ONLY) {
    const i = remaining.findIndex((o) => o.file === s.file && o.selector === s.selector);
    if (i === -1) stale.push(s);
    else remaining.splice(i, 1);
  }
  if (remaining.length) {
    const top = remaining.slice(0, 5).map((o) => `${o.file}: \`${o.selector}\``).join('; ');
    errors.push(
      `${remaining.length} engine CSS selector(s) style KaTeX without a MathJax counterpart. `
      + 'Lattice renders KaTeX, marp-core renders MathJax, so a rule naming only `.katex` / '
      + '`.katex-display` engages on one surface and silently does nothing on the other. Pair it: '
      + '`.katex-display` ↔ `mjx-container[display="true"]`, `.katex` ↔ `mjx-container` '
      + '(see lib/components/math/math/math.styles.css). If a rule is deliberately KaTeX-only, '
      + `add it to SANCTIONED_KATEX_ONLY in tools/check-ownership.js with the reason. Offending: ${top}.`,
    );
  }
  for (const s of stale) {
    errors.push(
      `stale SANCTIONED_KATEX_ONLY entry: ${s.file} \`${s.selector}\` no longer exists. `
      + 'Remove it so the allowlist cannot rot.',
    );
  }
}

const LAYER_INERT_SENTINEL = 'LATTICE-LAYERS-INERT';

const LAYER_BLOCK_BUDGET = 0;

// Empty by design: engine CSS layers nothing today. Activating layers is a
// coordinated full-bundle pass (per the R-PATH doc) that would add entries here
// WITH justification, never a silent file wrap. Each entry: {file, why}.
const SANCTIONED_LAYER_BLOCKS = [];

// Pure, testable: the layer-block openers + `@import … layer` statements in a
// stylesheet (comments stripped, case-insensitive). Named `@layer x {`, anonymous
// `@layer {`, and `@import … layer(…)` all count; the harmless statement form
// `@layer a, b, c;` (a `;` before any `{`) does NOT, and a file named "layer.css"
// in an `@import` url can't false-positive (the url is stripped before the test).
function layerBlocksIn(css) {
  // Strip comments AND string literals up front, so an `@layer`/`layer` token
  // inside a comment or a `content: "…"` value can't false-positive — a real
  // layer block or `@import` is never inside a string. The url() strip then
  // stops a file literally named `layer.css` in an `@import` from matching.
  const clean = stripComments(css).replace(/"[^"]*"|'[^']*'/g, '""');
  const hits = [];
  for (const m of clean.matchAll(/@layer\b[^;{]*\{/gi)) hits.push(m[0].replace(/\s+/g, ' ').trim());
  for (const m of clean.matchAll(/@import\b[^;]*;/gi)) {
    const bare = m[0].replace(/url\([^)]*\)/gi, '');
    if (/\blayer\b/i.test(bare)) hits.push(m[0].replace(/\s+/g, ' ').trim());
  }
  return hits;
}

// HARD RULE #26 gate — no partial/isolated layering in engine CSS.
function checkCascadeLayers(errors) {
  // 1. Footgun guard — no layer block in engine CSS source OR the built bundle.
  const offences = [];
  for (const file of listCssFiles(LIB_DIR)) {
    const rel = path.relative(ROOT, file);
    for (const opener of layerBlocksIn(fs.readFileSync(file, 'utf8'))) offences.push({ file: rel, opener });
  }
  if (fs.existsSync(LATTICE_BUNDLE)) {
    // Backstop for openers from non-lib sources (vendored KaTeX, JS-generated
    // blocks); a lib opener mirrored into dist is attributed to its lib file, not
    // double-counted.
    const libOpeners = new Set(offences.map((o) => o.opener));
    const rel = path.relative(ROOT, LATTICE_BUNDLE);
    for (const opener of layerBlocksIn(fs.readFileSync(LATTICE_BUNDLE, 'utf8'))) {
      if (!libOpeners.has(opener)) offences.push({ file: rel, opener });
    }
  }
  const remaining = [...offences];
  const staleSanctions = [];
  for (const s of SANCTIONED_LAYER_BLOCKS) {
    const i = remaining.findIndex((o) => o.file === s.file);
    if (i === -1) staleSanctions.push(s);
    else remaining.splice(i, 1);
  }
  if (remaining.length > LAYER_BLOCK_BUDGET) {
    const top = remaining.slice(0, 5).map((o) => `${o.file}: \`${o.opener}\``).join('; ');
    errors.push(
      `${remaining.length} cascade-layer block(s) in engine CSS (HARD RULE #26: budget 0). ` +
      `Wrapping a rule in @layer while the rest stay unlayered springs the rule-3 trap — the ` +
      `layered rule silently loses regardless of specificity (engineering/cascade.md). Engine CSS ` +
      `layers nothing; full activation is a coordinated pass, not a file wrap. Offending: ${top}.`,
    );
  }
  for (const s of staleSanctions) {
    errors.push(
      `stale layer-block sanction in tools/check-ownership.js — ${s.file} no longer has a ` +
      `@layer block (HARD RULE #26). Remove the SANCTIONED_LAYER_BLOCKS entry so the allowlist stays honest.`,
    );
  }
  // 2. Order pin — the emitted declaration must parse to CANONICAL_LAYER_ORDER.
  const m = /@layer\s+([^;{]+);/i.exec(LAYER_DECLARATION);
  const declared = m ? m[1].split(',').map((s) => s.trim()).filter(Boolean) : [];
  if (declared.join(' | ') !== CANONICAL_LAYER_ORDER.join(' | ')) {
    errors.push(
      `the @layer declaration order in tools/build-css.js drifted from CANONICAL_LAYER_ORDER ` +
      `(HARD RULE #26): declared [${declared.join(', ')}] vs canonical [${CANONICAL_LAYER_ORDER.join(', ')}]. ` +
      `Update CANONICAL_LAYER_ORDER only with a reviewed reason.`,
    );
  }
  // 3. Inert-note sentinel — build-css.js must emit the reader-facing warning
  //    adjacent to the declaration (source-checked so minification can't strip it).
  if (!fs.readFileSync(BUILD_CSS_SRC, 'utf8').includes(LAYER_INERT_SENTINEL)) {
    errors.push(
      `the '${LAYER_INERT_SENTINEL}' inert-note sentinel is missing from tools/build-css.js ` +
      `(HARD RULE #26). The bundle must warn a dist reader that the @layer order is inert; ` +
      `restore the LAYER_INERT_NOTE emission adjacent to LAYER_DECLARATION.`,
    );
  }
}

// HARD RULE #3 — NO hex color literals in the engine's LAYOUT CSS; always `var(--token)`.
// A hardcoded hex can't follow the palette (it's the same color in every theme + color
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

// The enumerated allowlist — each a FIXED color that is provably not theme-able. `{file, hex,
// count, why}`; the gate consumes `count` matching occurrences (case-insensitive) per entry.
const SANCTIONED_HEX = [
  {
    file: 'lib/base/base.modifiers.css', hex: '#d4351c', count: 2,
    why: 'overflow-warning ring + tab fill — a FIXED danger red, deliberately NOT a theme token '
       + 'so the authoring alarm reads identically loud in every palette and color mode '
       + '(documented at the declaration, base.modifiers.css "OVERFLOW WARNING").',
  },
  {
    file: 'lib/base/base.modifiers.css', hex: '#fff', count: 2,
    why: 'overflow-tab + type-floor-tab label ink — fixed white on the fixed authoring fills; same exception.',
  },
  {
    file: 'lib/base/base.modifiers.css', hex: '#f0e442', count: 2,
    why: 'FIX-ME culprit outline + tab fill — the third authoring alarm, in Okabe-Ito CVD-safe '
       + 'yellow so it stays distinguishable from the overflow red and the type-floor amber when a '
       + 'slide earns more than one at once. Same fixed-color exception as those two: an authoring '
       + 'alarm must read identically loud in every palette and color mode. Inherited from the JS '
       + 'overlay this replaced, which used the identical hue (documented at the declaration, '
       + 'base.modifiers.css "THE FIX-ME SIGNAL").',
  },
  {
    file: 'lib/base/base.modifiers.css', hex: '#1a1300', count: 1,
    why: 'FIX-ME tab label ink — near-black on the fixed yellow chip (~15.8:1); same exception.',
  },
  {
    file: 'lib/base/base.modifiers.css', hex: '#b8730a', count: 2,
    why: 'TYPE-FLOOR warning ring + tab fill (§8 rule 8) — the same fixed-authoring-alarm exception '
       + 'as the overflow red above, in amber so the two signals stay distinguishable: the box FITS, '
       + 'the figure has scaled its own labels below the legibility floor (1% of slide height, '
       + 'preset-invariant), and the fix is a '
       + 'simpler figure rather than less content (documented at the declaration, base.modifiers.css '
       + '"The TYPE-FLOOR ring").',
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
      `${remaining.length} unsanctioned hex color literal(s) in engine layout CSS ` +
      `(HARD RULE #3: always \`var(--token)\` so color follows the palette + keeps WCAG AA). ` +
      `Replace with the matching token, or — if the color is provably fixed (not theme-able) — ` +
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
// The curated British→American dictionary moved to tools/us-english.js so the
// commit-msg hook can warn from the SAME list this gate enforces (HARD RULE #1 —
// two readers, one source). Membership is unchanged by that move: 170 forms, and
// the suite asserts the count so a pair cannot be dropped in the shuffle. Why the
// list is explicit rather than a stem rule, and what is deliberately absent, is
// documented there.
const { UK_ENGLISH_FORMS } = require('./us-english');

// Files exempt from the US-English scan. Four kinds: this gate's own dictionary and
// its test fixtures (they CONTAIN the British forms as data — without this the gate
// flags itself); the append-only CHANGELOG ledger (past entries are frozen history,
// like the decision docs — new entries are policed at PR review, not the gate); and a
// generated/vendored playground bundle that inlines third-party libraries we don't
// control. Dated engineering/decisions/ records are skipped by path in
// listRepoTextFiles; minified/`*.generated.*` bundles by filename.
const US_ENGLISH_SELF_EXEMPT = new Set([
  'tools/check-ownership.js',
  'tools/us-english.js',
  'test/unit/cli/check-ownership.test.js',
  'test/unit/tools/us-english.test.js',
  'CHANGELOG.md',
  // Same frozen-history exemption as CHANGELOG.md, and for literally the same prose:
  // this file IS the pre-release `## Unreleased` section, moved out verbatim (#1735).
  // Leaving it in scope would newly charge the gate for ~18k lines that were exempt the
  // day before the move, on a ratchet whose whole point is that it only ever goes down.
  'changelog/pre-release-archive.md',
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
    // The emulator writes an .html sibling beside every PDF it renders
    // (lattice-emulator.js:2752, unconditional — no flag suppresses it), and
    // examples/**/*.html is gitignored (.gitignore:56-57). Same local-only
    // false-red class as playground/v below: a clean checkout and CI never have
    // these; any tree that previewed an example deck does, at ~375 hits for one
    // 70-slide deck — roughly a third of the whole repo-wide budget below, which
    // is a RATCHET, so no figure quoted here would stay current. Matched on the
    // PATH, not a directory name — examples/ must stay in scope so the .md decks
    // are still counted.
    //
    // The sibling-.md test at the bottom of this walk already catches the
    // ordinary case, and does so today (measured 2026-08-25: rendering
    // examples/a11y.md leaves examples/a11y.html behind and check:ownership
    // still exits 0). This rule is deliberately redundant with it, because it
    // does not depend on the deck's .md surviving beside its render — a renamed
    // or deleted deck strands the sidecar, and an explicit
    // `npx lattice <deck> examples/x.html` never had a sibling at all.
    if (/^examples[/\\].*\.html$/.test(rel)) continue;
    if (e.isDirectory()) {
      if (US_SKIP_DIRS.has(e.name)) continue;
      // Hidden dirs (.git/.vscode/…) are skipped, but .github and .claude are house
      // PROSE an agent reads and acts on — roster cards, workflow scripts, issue
      // templates, CI job names. .claude/** was out of scope until 2026-08-30 and
      // measured ZERO British spellings on the day it came in, so closing the hole
      // cost nothing and the budget did not move; leaving it open would have let the
      // agent instructions drift in a dialect the docs they point at forbid.
      if (e.name.startsWith('.') && e.name !== '.github' && e.name !== '.claude') continue;
      if (rel === path.join('engineering', 'decisions')) continue; // historical records
      // Gitignored build artifacts the docs dev/build stages into public/ —
      // duplicates of already-counted sources. A clean checkout doesn't have
      // them, so counting them made the gate red on any tree that had merely
      // RUN the docs site while CI stayed green (observed: 1351 → 1517 with
      // the artifacts present). Same reason components.md is exempted below.
      // See engineering/decisions/2026-07-02-website-copy-positioning.md §8.5.
      if (rel === path.join('docs', 'public', 'playground', 'v')) continue;
      // Its sibling, and a stronger case: `playground/hljs/` is 156 minified
      // highlight.js grammars (tools/build-hljs-languages.js), gitignored like
      // `v/` above. The hits in there are third-party LANGUAGE KEYWORDS, not
      // prose anyone here writes — Erlang's `behaviour`, GML's `colour`,
      // Mercury's `initialise`/`finalise`, pgsql's `analyse`: 6 in total, which
      // is enough on its own to put a tree that has merely run `npm run build`
      // over a budget CI meets on a clean checkout. Renaming an Erlang keyword
      // is not a migration this house can perform.
      if (rel === path.join('docs', 'public', 'playground', 'hljs')) continue;
      // Same class, different producer: `release/` is the gitignored output of
      // a release run (tools/release.js). `notes-v<x.y.z>.md` is a verbatim
      // copy of a CHANGELOG section — and CHANGELOG.md is itself exempt below
      // — so counting it double-charges an already-exempt source at ~70 hits
      // and blows the budget. That fired for real: the release aborted on its
      // own notes file, mid-run, after the version was already bumped.
      // Matched by path, not by name — `test/unit/release/` stays in scope.
      if (rel === 'release') continue;
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
//
// PINNED TO THE ACTUAL COUNT, and that is the point. It sat at 1336 against a real count
// of 1307 — 29 units of slack, which is not headroom, it is a hole: five new British
// spellings entered on this branch (`CENTRE`, `centre`, `honours`, `behaviour`,
// `neighbour`, all in test files, one of them in a test NAME that printed on every run)
// and the gate stayed green through all of them. A ratchet with slack does not ratchet.
// The rule's own instruction is to lower this as the backlog drops; lowering it to the
// measured count is what makes the next one fail on the first offence.
// Re-measure with a temporary `= 0` — the failure message prints the live total.
//
// 1307 → 1303 (2026-08-17): the gotchas split made `engineering/gotchas.md` a generated
// index that quotes every entry heading, and a heading appears TWICE in its row (link
// text + anchor), so three headings carrying `grey`/`grey`/`centred` counted six times
// over and pushed the total to 1312. The headings were corrected rather than the budget
// raised — which also retired those three from the backlog, hence 1303 and not 1307.
//
// 1291 → 1285 (2026-08-30): re-measured while extracting the dictionary to
// tools/us-english.js, and the backlog had been burned down 6 below the pin by
// intervening merges without anyone lowering it. (The 1303 the note above lands
// on was itself lowered to 1291 without a ledger line; this is that ledger line
// catching up.) Six units of slack is six free
// British spellings, which is the exact hole the paragraph above was written
// about. Re-measured against tracked files only — the one untracked file in
// scope (the gitignored katex bundle) carries zero, so a clean CI checkout
// counts the same 1285 this tree does.
const US_ENGLISH_BUDGET = 1285;

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

// HARD RULE #29 ratchet — the frozen ceiling of typed shape glyphs across the DECKS
// we ship. EXCEED-only, same shape as US_ENGLISH_BUDGET: a new one fails the build,
// the remaining backlog is burned down by lowering this. Target zero.
// Re-measure with a temporary `= 0` — the failure message prints the live total.
//
// TARGET REACHED, and the number means something narrower than it looks: zero of
// the CURATED table in lib/core/shape-glyphs.js, not zero typed shapes. The
// backlog measured 182 across 39 decks when the gate went in (re-measured against
// origin/main with this exact kernel — an earlier "198" came from a broader draft
// scope and was wrong), and every one was converted in the same change.
//
// Pinned to the MEASURED number, never above it — a budget with slack is not a
// ratchet, it is a hole, and #1852 showed exactly how five new entries walk
// through 29 units of one. At zero this is no longer a burn-down; it is a floor,
// and the next typed glyph ON THE TABLE fails the build. A shape the table does
// not carry is not caught by either surface; add the row first.
const TYPED_GLYPH_BUDGET = 0;

// ══════════════════════════════════════════════════════════════════════════
// HARD RULE #29 — typed glyphs never reach a rendered surface.
// ══════════════════════════════════════════════════════════════════════════
// A "shape glyph" is a character doing the job of a drawing: ✓ ✗ → ❯ ● ⚠. The
// curated table, the reasons, and the per-glyph advice all live in ONE kernel
// (lib/core/shape-glyphs.js) shared with the authoring linter — HARD RULE #1.
//
// TWO ARMS, and they are deliberately not the same shape, because the two
// surfaces have different owners:
//
//   ENGINE (budget 0) — our own stylesheets and the JS that writes strings
//   into rendered markup. We own these, so a typed glyph is a defect with a
//   named fix: paint the `--icon-*` / `--mark-*` mask. Zero, with an
//   allowlist that must stay live.
//
//   DECKS (exceed-only ratchet) — markdown someone authored. The house style
//   is to use the state markers and let the engine draw, and the committed
//   decks are being migrated to it; but the AUTHORING rule is coaching, not
//   enforcement ("we warn, we coach"). So the gate holds the line on OUR
//   decks — the examples, exemplars, galleries and fixtures we ship as the
//   reference for how to write one — and the lint rule handles everybody
//   else's with a warning.
//
// A `*.docs.md` is prose ABOUT a component, never projected, so it is out of
// scope; so is `engineering/decisions/**`, which is a dated archive.
const { shapeGlyphRe, stripFencedCode, shapeGlyphAdvice, isQuadrantAxisEyebrow } = require('../lib/core/shape-glyphs.js');
const { splitTopLevel: splitDeckSlides } = require('../lib/authoring/slide-split.js');
const { slideClassDirectives } = require('../lib/core/class-directive-scan.mjs');

// A `quadrant` slide's axis eyebrow is the component's axis DSL, not chrome, so
// neither this gate nor `lint:deck` counts it. The PREDICATE is the kernel's
// (isQuadrantAxisEyebrow) and the slide walk uses the same primitives the linter
// uses — splitTopLevel + slideClassDirectives — because this was previously a
// hand-rolled scanner here and a role check there, and they disagreed in both
// directions: a deck-wide `<!-- class: quadrant -->` failed the build while the
// linter called the file clean, and any backticked eyebrow on a quadrant slide
// hid a typed glyph from the budget.
function stripQuadrantAxisEyebrows(text) {
  const slides = splitDeckSlides(text);
  const directives = slideClassDirectives(text);
  const out = [];
  slides.forEach((slide, idx) => {
    const tokens = (directives[idx]?.payload || '').split(/\s+/).filter(Boolean);
    out.push(slide.split('\n')
      .map((line) => (isQuadrantAxisEyebrow(line, tokens) ? ' '.repeat(line.length) : line))
      .join('\n'));
  });
  // The DECK arm only counts matches, so the join needs to preserve glyphs and
  // nothing else — it deliberately does NOT claim to preserve line numbers, and
  // no caller reads one off this result.
  return out.join('\n');
}

// The deck ROOTS the authoring linter itself walks (tools/lint-deck.js
// `discoverDecks`). Kept in step deliberately: the gate and `lint:deck --all`
// disagreeing about what counts as a deck is how a file ends up governed by
// neither, which is exactly what happened — examples/split-envelope.md carries
// no `marp: true` (Lattice is the engine; the key is optional), so a
// front-matter-only test skipped it while the linter warned on it.
const GLYPH_DECK_ROOTS = Object.freeze([
  'examples/', 'exemplars/', 'test/integration/baseline-decks/',
]);

function isGlyphDeck(rel, text) {
  if (!rel.endsWith('.md')) return false;
  if (rel.endsWith('.docs.md')) return false; // prose ABOUT a component, never projected
  if (rel.startsWith('engineering/decisions/')) return false; // a dated archive
  // Two halves, and each catches what the other misses. The ROOTS are the
  // linter's; the front-matter half then picks up a deck that lives outside them
  // (test/fixtures/*, themes/palette-audit.md) and declares itself. A path list
  // alone would also have swept in design/design-system.md and design/forms.md —
  // 79 glyphs of reference PROSE, not slides — which is why there is no
  // `design/` root here.
  if (GLYPH_DECK_ROOTS.some((r) => rel.startsWith(r))) return true;
  if (rel.endsWith('.gallery.md')) return true;
  return /^---\r?\n[\s\S]*?\bmarp:\s*true/m.test(text.slice(0, 400));
}

// Decks whose typed glyphs are the POINT — converting them deletes what the
// deck is for. The gate fails on a STALE entry (a listed deck that no longer
// carries a glyph), so this list cannot rot into permission nobody needs.
const SANCTIONED_GLYPH_DECKS = Object.freeze([
  {
    file: 'examples/speech-symbols.md',
    why: 'The arrows and marks are FIXTURES: the deck proves the read-aloud lexicon ' +
      'pronounces them (lib/core/../cadenza symbols). Converting them deletes the thing under test.',
  },
  {
    file: 'test/fixtures/glyph-sub-fallback-labels.md',
    why: 'The fixture for glyph SUBSTITUTION and font fallback — the exact failure mode ' +
      'HARD RULE #29 exists to prevent. It must keep typing the glyphs to keep measuring them.',
  },
  {
    file: 'examples/gantt-component-redesign.md',
    why: 'Documents the RETIRED gantt span delimiter by showing it: "`Q1 → Q2` errors with a ' +
      '`..` fix". The glyph is quoted as the wrong input, inside code ticks.',
  },
]);

// Engine files whose typed glyphs are load-bearing and must NOT become masks.
// Each entry names the file and the measurement that settled it.
const SANCTIONED_GLYPH_CHROME = Object.freeze([
  {
    file: 'themes/a11y-base.css',
    why: 'The GRAYSCALE-SAFE SHAPE CHANNEL for color-blind readers, and a mask cannot ' +
      'carry it. Three measured properties are load-bearing and all three are lost by a ' +
      'background-image: (1) `content: <string> / <alt>` with an EMPTY alt is the only ' +
      'mechanism that actually keeps the shape out of the accessibility tree — `speak: ' +
      'never` and `speak: none` were both measured over CDP Accessibility.getFullAXTree ' +
      'and neither works; (2) the glyph keeps sized with the type, which a fixed-box mask ' +
      'does not; (3) each declaration is DOUBLED as a cross-engine pair, because an engine ' +
      'that cannot parse the alt form drops the whole declaration and the shape vanishes ' +
      'for exactly the readers it exists for. See the docblock above the rules.',
  },
  {
    file: 'lib/base/base.print-textures.css',
    why: 'The print mode\'s half of the same grayscale shape channel, same idiom, same ' +
      'reasons — a toner-only page has no color to fall back on.',
  },
]);

// Our own stylesheets — the surface where a typed glyph is unambiguously a
// defect, because we own the declaration and an icon token is right there.
//
// Engine JS is deliberately NOT gated. Distinguishing a string bound for the
// DOM from a console.warn, a `--help` banner, an AI prompt or a trailing
// comment needs to parse the module, and a heuristic that cannot tell them
// apart cries wolf until somebody switches the gate off — this draft did
// exactly that, flagging a Symbol() sentinel's comment and a prompt string.
// The two JS sites that genuinely wrote a glyph into rendered markup
// (chart-family's axis arrows, state-chart's transition chips) were moved into
// CSS chrome, and test/unit/core/shape-glyphs.test.js pins them there by name.
function listEngineGlyphSurfaces() {
  const out = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (e.name.endsWith('.css') && !/\.(min|generated)\./.test(e.name)) out.push(p);
    }
  };
  walk(LIB_DIR);
  walk(THEMES_DIR);
  return out;
}

// A CSS `content:` value is the one way our stylesheets put a character into
// the rendered document. Comments are stripped FIRST: a docblock explaining a
// `content:` rule is documentation of this very rule, and matching it made the
// gate report four files that declare nothing (math, content, split-panel,
// cycle's prose). Escaped codepoints (\\2713) and literal characters are the
// same thing to the renderer, so the value is decoded before matching.
const CSS_COMMENT_RE = /\/\*[\s\S]*?\*\//g;
// `(?<![\w-])` so a CUSTOM PROPERTY named `--content:` is not scanned as if it
// were the `content` property — it is an author's own variable and may hold
// anything. (Two narrower holes remain and are known: a `;` or `}` INSIDE a
// quoted content string ends the match early. Neither is live in this tree, and
// closing them needs a real value parser rather than a wider regex.)
const CSS_CONTENT_RE = /(?<![\w-])content\s*:\s*([^;}]*)/g;

/**
 * Decode CSS `\XXXXXX` escapes in a declaration value so an escaped glyph and a
 * literal one look the same to the scanner.
 *
 * The `{1,6}` is greedy and CSS puts no separator between an escape and a
 * following hex-range character, so `content:"\2192abc"` parses as a SIX-digit
 * escape well past U+10FFFF. Unguarded, String.fromCodePoint threw a RangeError
 * that aborted check-ownership entirely — the whole build:check and the pre-push
 * hook — with a stack naming neither the file nor the rule. An out-of-range
 * escape is left as written: it is a malformed escape, not a shape glyph, and
 * this is not the gate that should be reporting it.
 *
 * Exported for the unit test; the crash is the reason it has a name at all.
 */
function decodeCssEscapes(value) {
  return String(value).replace(/\\([0-9a-fA-F]{1,6})\s?/g, (whole, hex) => {
    const cp = parseInt(hex, 16);
    return cp >= 0 && cp <= 0x10ffff ? String.fromCodePoint(cp) : whole;
  });
}

function checkTypedGlyphs(errors) {
  // ── ENGINE ARM (budget 0) ──────────────────────────────────────────────
  const chromeExempt = new Map(SANCTIONED_GLYPH_CHROME.map((s) => [s.file, s]));
  const chromeSeen = new Set();
  const engineHits = [];
  for (const file of listEngineGlyphSurfaces()) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    // Blank comments rather than delete them, so a hit's line number still
    // points at the real line in the file on disk.
    const text = fs.readFileSync(file, 'utf8')
      .replace(CSS_COMMENT_RE, (c) => c.replace(/[^\n]/g, ' '));
    const hits = [];
    let m;
    const re = new RegExp(CSS_CONTENT_RE.source, 'g');
    while ((m = re.exec(text)) !== null) {
      const decoded = decodeCssEscapes(m[1]);
      for (const g of decoded.match(shapeGlyphRe()) || []) {
        hits.push({ glyph: g, line: text.slice(0, m.index).split('\n').length });
      }
    }
    if (!hits.length) continue;
    if (chromeExempt.has(rel)) { chromeSeen.add(rel); continue; }
    engineHits.push({ rel, hits });
  }

  for (const { rel, hits } of engineHits) {
    const first = hits[0];
    errors.push(
      `${rel}:${first.line} types a shape glyph into rendered output (${hits.length} in this file, ` +
      `HARD RULE #29 — typed glyphs never reach a rendered surface). ` +
      `${shapeGlyphAdvice(first.glyph, 'engine')} ` +
      `The icon tokens are in lib/base/base.tokens.css; the mask idiom is the --mark-* block ` +
      `beside them. If the glyph is genuinely load-bearing, add the file to ` +
      `SANCTIONED_GLYPH_CHROME in tools/check-ownership.js with the measurement that settled it.`,
    );
  }
  for (const s of SANCTIONED_GLYPH_CHROME) {
    if (!chromeSeen.has(s.file)) {
      errors.push(
        `SANCTIONED_GLYPH_CHROME lists ${s.file}, but it no longer types a shape glyph — ` +
        `remove the entry (HARD RULE #29; a stale sanction is permission nobody is using).`,
      );
    }
  }

  // ── DECK ARM (exceed-only ratchet) ─────────────────────────────────────
  const sanctioned = new Map(SANCTIONED_GLYPH_DECKS.map((s) => [s.file, s]));
  const sanctionSeen = new Set();
  let total = 0;
  const byFile = [];
  for (const file of listRepoTextFiles()) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const text = fs.readFileSync(file, 'utf8');
    if (!isGlyphDeck(rel, text)) continue;
    // A glyph inside a ``` fence is quoted material (two decks quote the CLI's
    // own ⚠ overflow warning verbatim), not slide chrome. See stripFencedCode.
    const n = (stripQuadrantAxisEyebrows(stripFencedCode(text)).match(shapeGlyphRe()) || []).length;
    if (!n) continue;
    if (sanctioned.has(rel)) { sanctionSeen.add(rel); continue; }
    total += n;
    byFile.push([rel, n]);
  }
  for (const s of SANCTIONED_GLYPH_DECKS) {
    if (!sanctionSeen.has(s.file)) {
      errors.push(
        `SANCTIONED_GLYPH_DECKS lists ${s.file}, but it no longer carries a typed glyph — ` +
        `remove the entry (HARD RULE #29; a stale sanction is permission nobody is using).`,
      );
    }
  }
  if (total > TYPED_GLYPH_BUDGET) {
    byFile.sort((a, b) => b[1] - a[1]);
    const top = byFile.slice(0, 5).map(([f, n]) => `${f} (${n})`).join(', ');
    errors.push(
      `typed shape glyphs in shipped decks rose to ${total}, above the budget of ` +
      `${TYPED_GLYPH_BUDGET} (HARD RULE #29). A typed ✓ / → / ❯ is not drawn by us: the deck's ` +
      `type family has no glyph for it, so every machine substitutes a different font, a color ` +
      `emoji, or a hollow box. Write the state marker (\`[x]\` \`[-]\` \`[ ]\` \`[/]\`) or the word, ` +
      `and let the engine draw — \`npm run lint:deck -- <file>\` names the fix per glyph. As the ` +
      `backlog drops, lower TYPED_GLYPH_BUDGET in tools/check-ownership.js. Heaviest: ${top}.`,
    );
  }
}

function checkThemeTokenParity(errors) {
  const palettes = listBasePalettes();
  if (!palettes.length) {
    errors.push('no base palettes found (no manifest declares `role: "base"`) — cannot verify theme token contract.');
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

// ── The NO-SAFE-DEFAULT contract (#1457) ──────────────────────────────────────
//
// `lib/theme/derive.js`'s REQUIRED_TOKENS is what the Studio's generator promises
// to emit. It shipped 21 tokens short, and the shortfall was invisible to every
// theme gate in this file for one structural reason: THEY ALL SCAN `themes/`, and
// a generated theme never lands there. It lands in a browser, in an asset bundle,
// in someone's export.
//
// So the omission surfaced as a render bug instead. Measured on the export CLI:
// `--c-container` / `--c-container-edge` are read through
// `lib/core/mermaid-theme-map.js`, whose PDF-path reader warns and substitutes a
// BLACK SENTINEL that ships — solid black subgraph boxes on 5 of 8 slides of
// examples/containment-tier.md. `--spectrum` is read bare inside `background:`
// shorthands, so a miss invalidates the whole declaration at computed-value time
// and `section.dark` / `.divider` lost their canvas entirely, painting near-white
// text on white paper.
//
// The old fix was to widen the list by hand, which is how it got short in the
// first place. This gate computes the obligation instead:
//
//   a THEME token          — declared at :root by at least one shipped palette,
//                            i.e. part of the vocabulary a theme is expected to own
//   with NO ENGINE DEFAULT — see WHAT COUNTS AS A DEFAULT below
//   read with NO FALLBACK  — a bare `var(--x)` in lib/**.css, or an entry in the
//                            Mermaid map (whose reader has no fallback parameter at
//                            all — a miss IS the sentinel)
//   ⟹ must be in REQUIRED_TOKENS.
//
// WHAT COUNTS AS A DEFAULT DEPENDS ON WHO IS READING, and collapsing that
// distinction produces a false positive the engine's own comment invites. The
// engine defaults `--spectrum-quiet` on `section {}` — the slide root, matched by
// every slide. `base.variants.css` USED to say "a theme may override
// `--spectrum-quiet`"; that invitation was false and has been corrected (#1546) —
// `section` is a descendant of `:root`, so the engine's declaration wins on every
// slide and a theme's `:root` value reaches nothing. The distinction this arm draws
// survives the correction unchanged, and is if anything better founded by it: a
// `:root`-only model would demand a contract row for a token that IS defaulted, and
// `--spectrum-quiet` is defaulted precisely because the `section` declaration is the
// one that reaches the read. So:
//
//   read through CSS `var()`     a declaration on `:root` OR on the bare `section`
//                                slide root is a real default — the cascade reaches
//                                every slide either way.
//   read through the Mermaid map ONLY `:root` counts. That reader is not CSS: the
//                                export path's `parsePaletteVars` scans `:root`
//                                blocks out of the palette TEXT, so a `section`
//                                declaration is invisible to it and the miss still
//                                becomes the black sentinel.
//
// There is deliberately no allowlist. A token caught here has two honest exits and
// both are cheap: derive it (add the contract row), or give the read its
// `var(--x, <fallback>)` — which is the same choice `--cat-N-ink` already made,
// and why that family does not appear here despite having no :root default.
const NO_SAFE_DEFAULT_MAP_READERS = ['lib/core/mermaid-theme-map.js'];

/**
 * `{ selector, body }` rule blocks, brace-aware, comments stripped — RECURSING
 * THROUGH AT-RULES. A `:root` default wrapped in `@media`, `@supports`, `@layer` or
 * `@container` is still a default, and the first cut only read top level: wrapping
 * `base.tokens.css` in `@layer tokens { … }` produced 15 false positives on a gate
 * with no allowlist, and HARD RULE #26 says a coordinated layer-activation pass is
 * anticipated. `@keyframes` is skipped — its `from`/`to`/percent preludes are not
 * selectors.
 *
 * `body` is the block's own text with any NESTED rule removed, so a declaration
 * inside `section { &.dark { … } }` is not harvested as the outer selector's.
 */
function cssRuleBlocks(css, { _depth = 0 } = {}) {
  const s = stripComments(css);
  const out = [];
  let depth = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '{') {
      if (depth === 0) { prelude = s.slice(start, i).trim().replace(/\s+/g, ' '); start = i + 1; }
      depth++;
    } else if (ch === '}') {
      depth--;
      if (depth === 0) {
        const body = s.slice(start, i);
        if (prelude.startsWith('@')) {
          const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
          // A conditional/grouping at-rule wraps real rules — descend. Keyframes do not.
          if (name !== 'keyframes' && name !== 'font-face' && _depth < 6) {
            out.push(...cssRuleBlocks(body, { _depth: _depth + 1 }));
          }
        } else {
          out.push({ selector: prelude, body });
        }
        start = i + 1;
      }
    }
  }
  return out;
}

/** A block body with every NESTED rule stripped, so only its own declarations remain. */
function ownDeclarations(body) {
  let out = '';
  let depth = 0;
  for (const ch of body) {
    if (ch === '{') { depth++; continue; }
    if (ch === '}') { depth--; continue; }
    if (depth === 0) out += ch;
  }
  return out;
}

/**
 * True for a selector that applies UNCONDITIONALLY at the document root — the only
 * kind that is a default for the Mermaid map's reader. `:root:root` (a11y-base's
 * specificity hard pin) and `:where(:root)` (a zero-specificity default) both
 * qualify; `:root.print` does not, because it waits for a class. One part of a
 * selector LIST is enough: `:root, section { … }` declares at the root.
 */
function isUnconditionalRoot(selector) {
  return splitTopLevel(selector).some((part) => {
    const bare = part.trim().replace(/:(?:where|is)\(\s*:root\s*\)/g, ':root');
    return /^(:root)+$/.test(bare);
  });
}

/**
 * True for a selector that applies unconditionally to EVERY SLIDE — `:root`, or the
 * bare `section` slide root. A declaration here is a real default for anything read
 * through CSS (every slide is a `section`, and slide content inherits from it), but
 * NOT for the Mermaid map, whose reader parses `:root` blocks out of the palette
 * text and never sees a `section` rule. `section.print` does not qualify: it waits
 * for a band.
 */
function isSlideRoot(selector) {
  if (isUnconditionalRoot(selector)) return true;
  return splitTopLevel(selector).some((part) => {
    const bare = part.trim().replace(/:(?:where|is)\(\s*section\s*\)/g, 'section');
    return bare === 'section';
  });
}

/** Custom-property names declared under `accept`-ed selectors in one stylesheet. */
function scopedTokens(css, accept) {
  const names = new Set();
  for (const { selector, body } of cssRuleBlocks(css)) {
    if (!accept(selector)) continue;
    for (const m of ownDeclarations(body).matchAll(/(?:^|[;{])\s*--([\w-]+)\s*:/g)) names.add(m[1]);
  }
  return names;
}

/** Custom-property names declared under an unconditional `:root` in one stylesheet. */
function rootScopedTokens(css) {
  return scopedTokens(css, isUnconditionalRoot);
}

/** Custom-property names declared at `:root` OR on the bare `section` slide root. */
function slideScopedTokens(css) {
  return scopedTokens(css, isSlideRoot);
}

/**
 * The enclosing rule prelude for every byte offset in `css`, as sorted
 * `{ start, end, selector }` ranges. Offsets are preserved (comments are BLANKED,
 * not removed), so a range can be matched against a `RegExp.index` from the same
 * text. At-rules contribute their inner rules, not themselves.
 */
function ruleRanges(css, from = 0, out = [], depth = 0) {
  let d = 0;
  let start = 0;
  let prelude = '';
  for (let i = 0; i < css.length; i++) {
    const ch = css[i];
    if (ch === '{') {
      if (d === 0) { prelude = css.slice(start, i).trim().replace(/\s+/g, ' '); start = i + 1; }
      d++;
    } else if (ch === '}') {
      d--;
      if (d === 0) {
        if (prelude.startsWith('@')) {
          const name = prelude.slice(1).split(/[\s({]/)[0].toLowerCase();
          if (name !== 'keyframes' && name !== 'font-face' && depth < 6) {
            ruleRanges(css.slice(start, i), from + start, out, depth + 1);
          }
        } else {
          out.push({ start: from + start, end: from + i, selector: prelude });
        }
        start = i + 1;
      }
    }
  }
  return out.sort((a, b) => a.start - b.start);
}

/**
 * True for a `:root` block the EXPORT PATH actually parses. `parsePaletteVars`
 * (lattice-emulator.js) matches `/:root\s*\{/`, so `:root` must sit immediately
 * before the brace: `:root {` and `:root:root {` qualify, `:root, section {` and
 * `:where(:root) {` do NOT — the reader never sees them. The gate used to treat all
 * four as equivalent, which is MORE PERMISSIVE THAN THE READER IT MODELS: 12 tokens
 * in `base.tokens.css`'s `:root, section` block are already counted as `:root`
 * defaults and are invisible to the export. None is a map token today; adding a
 * `--c-*` or `--diagram-*` there would have been excused by the gate and
 * black-sentinelled by the export.
 */
function isExportParsedRoot(selector) {
  return /(^|[\s,])(:root)+\s*$/.test(String(selector).trim());
}

/**
 * Every `var(--name)` read in `css` that carries NO SAFE fallback, as
 * `name → [{ where, kind, rootRead }, …]`.
 *
 * Comments are blanked with `stripCommentsKeepOffsets`, NOT deleted: deleting them
 * removes their newlines too, so every reported line number came out shifted by the
 * comment volume above it. The first cut of this arm did exactly that, and the wrong
 * number was copied out of its output into a decision record before anyone read the
 * file it pointed at.
 *
 * `rootRead` records whether the read is made INSIDE an unconditional `:root` block,
 * because that decides which defaults can rescue it. Custom properties resolve on
 * the element that USES them, and `:root` is `html` — an ANCESTOR of `section` — so
 * a `section { --x: … }` default never reaches a `var(--x)` read inside a `:root`
 * rule. `--spectrum` and `--spectrum-vertical` are read exactly there
 * (`base.variants.css`'s `--sp-fill-rainbow-*`), so deciding this per TOKEN rather
 * than per READ would have let one `section` declaration excuse the very tokens
 * whose absence loses the canvas. Verified in Chromium: with the default on
 * `section` and the read at `:root`, the whole `background` shorthand computes to
 * `none`.
 *
 * A fallback is only as safe as what it RESOLVES to, which is not a syntactic
 * property. `var(--x, )` and `var(--x, var(--never-declared))` are invalid at
 * computed-value time — the exact failure this gate exists to prevent — while
 * `var(--cat-1-texture, var(--cat-1-fill))` is completely safe because `--cat-1-fill`
 * is itself contract-guaranteed. So each read carries its fallback CHAIN and the
 * chain is resolved in `noSafeDefaultTokens`, where the contract and the engine
 * defaults are in scope. A chain ending in a literal is safe outright and is not
 * recorded at all.
 */

/** The matching `)` for the `(` at `open`, or -1. */
function matchParen(s, open) {
  let d = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') d++;
    else if (s[i] === ')' && --d === 0) return i;
  }
  return -1;
}

/**
 * Parse the inside of a `var(…)` → `{ token, chain, endsLiteral }`. `chain` is the
 * fallback tokens in order; `endsLiteral` is true when the chain bottoms out in
 * anything that is not another bare `var()`.
 */
function parseVarChain(inner) {
  const m = String(inner).match(/^\s*--([\w-]+)\s*(?:,([\s\S]*))?$/);
  if (!m) return null;
  const rest = (m[2] ?? '').trim();
  if (m[2] === undefined) return { token: m[1], chain: [], endsLiteral: false };
  if (!rest) return { token: m[1], chain: [], endsLiteral: false }; // `var(--x, )`
  if (rest.startsWith('var(')) {
    const close = matchParen(rest, 3);
    const nested = close === -1 ? null : parseVarChain(rest.slice(4, close));
    if (nested) return { token: m[1], chain: [nested.token, ...nested.chain], endsLiteral: nested.endsLiteral };
  }
  return { token: m[1], chain: [], endsLiteral: true };
}

function bareVarReads(css, label, into = new Map()) {
  const s = stripCommentsKeepOffsets(css);
  const ranges = ruleRanges(s);
  const selectorAt = (idx) => {
    for (const r of ranges) if (idx >= r.start && idx < r.end) return r.selector;
    return null; // outside any rule — a bare declaration list; treat as root-scoped
  };
  for (let i = s.indexOf('var('); i !== -1; i = s.indexOf('var(', i + 1)) {
    const close = matchParen(s, i + 3);
    if (close === -1) continue;
    const parsed = parseVarChain(s.slice(i + 4, close));
    if (!parsed) continue;
    const line = s.slice(0, i).split('\n').length;
    const selector = selectorAt(i);
    if (!into.has(parsed.token)) into.set(parsed.token, []);
    // A chain terminating in a LITERAL is recorded, flagged, NOT skipped. It always
    // resolves, so `noSafeDefaultTokens` still treats it as rescued and the main gate's
    // behavior is unchanged — but the #1545 LEDGER has to see it, because
    // `var(--x, var(--y, transparent))` is a cheap-exit fallback pointing at --y, and
    // skipping it let a sanctioned token be silently re-pointed at a different-contract
    // token with the gate green (found by the adversarial trio, HARD RULE #25).
    into.get(parsed.token).push({
      where: `${label}:${line}`,
      kind: 'css',
      rootRead: selector === null || isUnconditionalRoot(selector),
      chain: parsed.chain,
      endsLiteral: parsed.endsLiteral,
    });
  }
  return into;
}

/**
 * Every token the token→Mermaid map reads. Sourced from the map's OWN
 * `diagramThemeTokens()`, which the module documents as being "for gates that audit
 * coverage", rather than re-scraped with a `{ var: '…' }` regex (HARD RULE #15).
 *
 * STATED HONESTLY: the regex was not producing a wrong answer. Both extractions
 * return the same 38 tokens today, because every `joinVars` name also appears as a
 * `var:` entry elsewhere in the map — an earlier version of this comment claimed the
 * regex "missed joinVars entries", and it did not. The switch buys robustness, not a
 * bug fix: a `joinVars`-only token, a nested entry, or Biome reformatting a quote
 * would each have blinded the regex silently, and this arm is the ONLY path into the
 * gate for `--c-container` / `--c-container-edge`, which have no bare CSS read at
 * all.
 */
function mermaidMapTokenReads(tokens, label, into = new Map()) {
  for (const name of tokens) {
    if (!into.has(name)) into.set(name, []);
    into.get(name).push({ where: label, kind: 'map' });
  }
  return into;
}

/**
 * The tokens with no safe default that are read without one. Pure, so the gate can
 * be bitten with synthetic input instead of only asserted empty over the shipped
 * tree.
 *
 * THE DECISION IS PER READ, not per token, because which defaults can rescue a read
 * depends on where the read is:
 *
 *   a MAP read            only an export-parsed `:root` block rescues it — that
 *                         reader scans the palette TEXT with `/:root\s*\{/`, so a
 *                         `section` rule, a `:root, section` list and a
 *                         `:where(:root)` wrapper are all invisible to it.
 *   a CSS read at :root   only a `:root` default rescues it. `section { --x }` is
 *                         set on a DESCENDANT of `:root`, so it cannot reach a
 *                         `var(--x)` written inside a `:root` rule.
 *   any other CSS read    `:root` or the bare `section` slide root both rescue it.
 *
 * One unrescued read is enough to report the token.
 */
function noSafeDefaultTokens({ themeTokens, rootDefaults, slideDefaults, mapDefaults, bareReads, contract }) {
  const defaulted = (name, read) => {
    if (read.kind === 'map') return (mapDefaults ?? rootDefaults).has(name);
    if (read.rootRead) return rootDefaults.has(name);
    return slideDefaults.has(name);
  };
  // A read is rescued by a default the reader can reach — on the token itself, or on
  // any token its fallback chain falls through to. A chain token that is CONTRACT
  // -guaranteed rescues it too: every theme emits it, so the chain always resolves.
  // `endsLiteral` reads are recorded now (so the #1545 ledger can compare their chain), and
  // a chain bottoming out in a literal ALWAYS resolves — so it is rescued here, exactly as
  // it was when such reads were skipped outright. The main gate's population is unchanged.
  const rescued = (name, read) =>
    defaulted(name, read) || read.endsLiteral === true
    || (read.chain ?? []).some((c) => contract.has(c) || defaulted(c, read));
  return [...bareReads.keys()]
    .filter((t) => {
      if (!themeTokens.has(t) || contract.has(t)) return false;
      return bareReads.get(t).some((r) => !rescued(t, r));
    })
    .sort();
}

/**
 * The tokens that take `checkNoSafeDefaultTokens`'s SECOND exit — a theme token, absent
 * from `REQUIRED_TOKENS`, whose every read is rescued ONLY by a `var()` fallback.
 *
 * WHY THIS LIST EXISTS (#1545). The gate offers two honest exits when it fires: derive
 * the token (an hour of color work) or give the read a fallback (ten seconds). The second
 * is HARD-RULE-#3-legal and permanently removes the token from the gate's view, because a
 * read with a resolving fallback is not reported by design. That is the exact construction
 * that produced the defect the gate exists to prevent: `--cat-N-ink` carried a fallback at
 * every read, was gated by `checkCatInkFallback`, and was STILL missing from the generator
 * for a year — degrading onto `--cat-N-mark`, a value repaired to the 3:1 GRAPHICAL floor
 * and then painted as label text needing 4.5:1. Measured in
 * 2026-08-10-no-safe-default-token-contract.md: 176 of 200 sampled `brand-mono` themes
 * carried a sub-AA label that way.
 *
 * So this is NOT an allowlist for shipping broken — the gate's no-allowlist stance on the
 * DERIVE exit is deliberate and unchanged. It is a ledger for the CHEAP exit, so taking it
 * is a recorded decision rather than a silent one. Fails BOTH ways, like SANCTIONED_MARGINS
 * / SANCTIONED_HEX: an unlisted token is an error, and a listed token that no longer takes
 * the exit is a stale entry that must be removed.
 *
 * The bar for an entry: say what the fallback LANDS ON and why that value carries the same
 * contract the read needs. `--cat-N-ink`'s did not — that is the whole lesson.
 */
const SANCTIONED_FALLBACK_READS = [
  ...Array.from({ length: 12 }, (_, i) => ({
    token: `cat-${i + 1}-texture`,
    fallback: `cat-${i + 1}-fill`,
    why:
      'the texture channel is OPTIONAL by design: a texture is redundant encoding layered ' +
      'over a categorical fill, so falling back to that slot\'s own fill is the un-textured ' +
      'rendering, which is exactly what a non-texture theme should look like. The fallback ' +
      'lands on a CONTRACT token with the same role, not on a different one — unlike ' +
      '--cat-N-ink, which fell onto a value repaired to the 3:1 graphical floor and was then ' +
      'painted as 4.5:1 label text. Whether a GENERATED theme should carry a texture channel ' +
      'at all is a live design question, not a defect in this fallback: only four pattern ' +
      'sets exist and each bakes a literal gray/concrete ramp in lib/core/accessibility-' +
      'textures.js, so a derived theme cannot point at one without gray chips that contradict ' +
      'its own --cat-N-fill. Tracked in #1562; see engineering/textures.md.',
  })),
  {
    token: 'spectrum-solid',
    fallback: 'accent',
    why:
      'a per-theme OVERRIDE, not a required slot. `--spectrum-solid` exists only so a theme ' +
      'whose accent is too near-black to read as a bar (onyx, concrete) can name a different ' +
      'hue for the solid spectrum style; every other theme wants exactly --accent, which is a ' +
      'contract token. The fallback IS the intended value for the common case, so a theme ' +
      'omitting it is correct rather than degraded.',
  },
];

/**
 * Tokens whose reads are ALL rescued, and where at least one read is rescued ONLY by a
 * fallback chain rather than by an engine default — i.e. the ones sitting in the gate's
 * blind spot because someone took (or inherited) the cheap exit.
 *
 * Deliberately narrower than the issue's own population. #1545 counts "declared by shipped
 * palettes, absent from REQUIRED_TOKENS, and read only with fallbacks", which is 17 tokens
 * and reproduces exactly. This adds one term — that NO engine default rescues the read —
 * which drops the ones whose fallback is incidental (the three --marp-slide-*-color) and
 * leaves 13. A token the engine also defaults is not taking this exit at all: its reads
 * resolve whether or not anyone wrote a fallback, so a ledger row for it would carry no
 * decision.
 *
 * --code-inline-fg WAS in that dropped set and no longer is, which is worth recording
 * because the change looks like a regression and is the opposite. Its engine default
 * (`--code-inline-fg: var(--accent)` in base.tokens.css) was deleted on 2026-08-17: on the
 * CLI path that default was concatenated AFTER the palette and beat every theme's own,
 * deeper value, shipping a 4.36:1 chip on a card. The token is now in REQUIRED_TOKENS and
 * derived, so it leaves this population by the front door — contract membership — rather
 * than by an engine default rescuing a read nobody audited.
 *
 * EVERY via-chain read is returned, not just the first. The ledger checks each one against
 * the fallback it claims, and a divergent chain on read #12 of 19 is exactly the silent
 * drift this exists to catch.
 */
function fallbackOnlyTokens({ themeTokens, rootDefaults, slideDefaults, mapDefaults, bareReads, contract }) {
  const defaulted = (name, read) => {
    if (read.kind === 'map') return (mapDefaults ?? rootDefaults).has(name);
    if (read.rootRead) return rootDefaults.has(name);
    return slideDefaults.has(name);
  };
  // Taking the cheap exit means the fallback routes through ANOTHER TOKEN — that is the
  // shape that can silently drift onto a different contract, which is what --cat-N-ink did.
  // A chain through a token counts even when it bottoms out in a literal
  // (`var(--x, var(--y, transparent))`), because the re-point to --y is the risk and the
  // literal tail merely hid it from the scanner (found by the red team).
  //
  // A fallback that is an inline EXPRESSION with no token hop — `var(--x, #ccc)`, or
  // `var(--chart-cat1-ink, color-mix(… var(--text-heading)))` — is deliberately NOT in this
  // population. There is no second token for it to drift onto: the fallback is the value,
  // written at the read. Requiring a ledger row for it would tax the safest form of the
  // pattern and say nothing a reviewer could act on.
  const rescuedByChain = (read) =>
    (read.chain ?? []).some((c) => contract.has(c) || defaulted(c, read))
    || (read.endsLiteral === true && (read.chain ?? []).length > 0);
  const out = [];
  for (const token of [...bareReads.keys()].sort()) {
    if (!themeTokens.has(token) || contract.has(token)) continue;
    const reads = bareReads.get(token);
    // An unrescued read means the gate itself fires; that is the loud path, not this one.
    if (reads.some((r) => !defaulted(token, r) && !rescuedByChain(r))) continue;
    const viaChain = reads.filter((r) => !defaulted(token, r) && rescuedByChain(r));
    if (viaChain.length) {
      out.push({
        token,
        where: viaChain[0].where,
        chain: viaChain[0].chain ?? [],
        reads: viaChain.map((r) => ({ where: r.where, chain: r.chain ?? [] })),
      });
    }
  }
  return out;
}

function checkNoSafeDefaultTokens(errors, { themesDir = THEMES_DIR, libDir = LIB_DIR } = {}) {
  const declared = themesDir === THEMES_DIR ? listThemeManifests() : null;
  const themeFiles = declared
    ? [...declared.keys()].sort().map((n) => path.join(themesDir, `${n}.css`)).filter((f) => fs.existsSync(f))
    : fs.readdirSync(themesDir).filter((f) => f.endsWith('.css')).sort().map((f) => path.join(themesDir, f));
  if (!themeFiles.length) {
    errors.push('checkNoSafeDefaultTokens found no palettes to read the theme token vocabulary from — the contract is unverifiable.');
    return;
  }
  const themeTokens = new Set();
  for (const f of themeFiles) for (const t of rootScopedTokens(fs.readFileSync(f, 'utf8'))) themeTokens.add(t);

  const rootDefaults = new Set();
  const slideDefaults = new Set();
  const mapDefaults = new Set();
  const bareReads = new Map();
  let cssFiles = 0;
  for (const f of listCssFiles(libDir)) {
    const css = fs.readFileSync(f, 'utf8');
    cssFiles += 1;
    for (const t of rootScopedTokens(css)) rootDefaults.add(t);
    for (const t of slideScopedTokens(css)) slideDefaults.add(t);
    for (const t of scopedTokens(css, isExportParsedRoot)) mapDefaults.add(t);
    bareVarReads(css, path.relative(ROOT, f), bareReads);
  }
  let mapTokens = 0;
  for (const rel of NO_SAFE_DEFAULT_MAP_READERS) {
    const full = path.join(ROOT, rel);
    if (!fs.existsSync(full)) {
      errors.push(`checkNoSafeDefaultTokens expected a token-map reader at ${rel} and it is gone — either restore it or drop it from NO_SAFE_DEFAULT_MAP_READERS.`);
      continue;
    }
    let tokens;
    try {
      tokens = require(full).diagramThemeTokens();
    } catch (err) {
      // An uncaught throw here takes EVERY gate in this file down with a raw
      // TypeError. Name the contract that broke instead.
      errors.push(`checkNoSafeDefaultTokens could not read the token list from ${rel} — it must export \`diagramThemeTokens()\` returning the palette tokens its map reads (${err.message}).`);
      continue;
    }
    if (!Array.isArray(tokens) || !tokens.length) {
      errors.push(`checkNoSafeDefaultTokens got no tokens from ${rel}'s diagramThemeTokens(). That arm is the ONLY path into this gate for --c-container and --c-container-edge (they have no bare CSS read at all), so an empty list silently drops the two tokens whose absence paints black boxes.`);
      continue;
    }
    mapTokens += tokens.length;
    mermaidMapTokenReads(tokens, rel, bareReads);
  }
  // FAIL LOUD ON AN EMPTY SCAN. Each input is an intersection term, so any of them
  // coming back empty makes the gate report clean — the failure mode where a gate is
  // also a claim. A regex change, a moved directory, or a renamed export must read
  // as broken here, not as green.
  if (!themeTokens.size || !rootDefaults.size || !bareReads.size || !cssFiles || !mapTokens) {
    errors.push(
      'checkNoSafeDefaultTokens scanned successfully but came back with an empty input set ' +
      `(theme tokens ${themeTokens.size}, engine :root defaults ${rootDefaults.size}, bare reads ${bareReads.size}, ` +
      `lib CSS files ${cssFiles}, map tokens ${mapTokens}) — every one of those is an intersection term, so an ` +
      'empty one silently makes this gate pass. Something moved or stopped parsing; fix the scan rather than ' +
      'trusting the green.',
    );
    return;
  }

  const contract = new Set(require('../lib/theme/derive.js').requiredTokenList());
  const missing = noSafeDefaultTokens({ themeTokens, rootDefaults, slideDefaults, mapDefaults, bareReads, contract });
  if (missing.length) {
    const shown = missing.slice(0, 6).map((t) => `--${t} (${bareReads.get(t)[0].where})`).join(', ');
    errors.push(
      `${missing.length} token(s) have NO SAFE DEFAULT — shipped palettes declare them, lib/ reads them with no ` +
      `var() fallback, and the engine declares no default those reads can reach — yet REQUIRED_TOKENS in ` +
      `lib/theme/derive.js does not promise them: ${shown}${missing.length > 6 ? `, +${missing.length - 6} more` : ''}. ` +
      'A theme generated outside this repo (the Studio) therefore ships without them, and a miss does not degrade: ' +
      'the Mermaid map substitutes a black sentinel that renders, and a bare read inside a `background:` shorthand ' +
      'invalidates the whole declaration. Either derive the token in deriveTheme and add it to REQUIRED_TOKENS, or ' +
      'give every read a `var(--x, <fallback>)` that terminates in a literal. There is no allowlist — and note ' +
      'which exit you are taking: the fallback exit is what --cat-N-ink already does, and it is exactly how the ' +
      'ink tier went missing from the generator for a year without any gate noticing.',
    );
  }

  // ── The SECOND exit, made auditable (#1545) ────────────────────────────────
  // Taking the cheap exit is legitimate; taking it SILENTLY is what let the ink tier sit
  // outside the contract for a year. Every token now in that blind spot must carry a
  // justification here, and a justification that no longer describes reality must go.
  //
  // Scoped to the REAL palettes: the ledger is a global constant describing the shipped
  // tree, so comparing it against a synthetic `themesDir` would emit a stale error per
  // entry for every token that dir happens not to declare. That seam exists so the gate
  // can be bitten with synthetic input; keep it usable.
  if (themesDir !== THEMES_DIR) return;

  const fallbackOnly = fallbackOnlyTokens({ themeTokens, rootDefaults, slideDefaults, mapDefaults, bareReads, contract });
  const sanctioned = new Map(SANCTIONED_FALLBACK_READS.map((s) => [s.token, s]));
  if (sanctioned.size !== SANCTIONED_FALLBACK_READS.length) {
    const seen = new Set();
    const dupes = new Set();
    for (const { token } of SANCTIONED_FALLBACK_READS) {
      if (seen.has(token)) dupes.add(token);
      seen.add(token);
    }
    errors.push(`duplicate SANCTIONED_FALLBACK_READS entries in tools/check-ownership.js: ${[...dupes].map((t) => `--${t}`).join(', ')}. One row per token, or the justifications can disagree with each other.`);
  }
  const unlisted = fallbackOnly.filter((f) => !sanctioned.has(f.token));
  if (unlisted.length) {
    const shown = unlisted.slice(0, 6).map((f) => `--${f.token} (${f.where} → ${f.chain.map((c) => `--${c}`).join(' → ') || 'literal'})`).join(', ');
    errors.push(
      `${unlisted.length} theme token(s) are outside REQUIRED_TOKENS and invisible to the no-safe-default gate ` +
      `because every read carries a var() fallback, with no record of that being a decision: ${shown}` +
      `${unlisted.length > 6 ? `, +${unlisted.length - 6} more` : ''}. That is the gate's CHEAP exit, and it is ` +
      'the exact construction that produced the defect the gate exists to prevent — --cat-N-ink had a fallback at ' +
      'every read and was still missing from the generator for a year, degrading onto a value repaired to the 3:1 ' +
      'graphical floor and then painted as 4.5:1 label text. Either derive the token, or add it to ' +
      'SANCTIONED_FALLBACK_READS in tools/check-ownership.js saying what the fallback LANDS ON and why that value ' +
      'carries the same contract the read needs (a record, not a waiver — same idiom as SANCTIONED_MARGINS/#20 and ' +
      'SANCTIONED_PREVIEW_BUILDERS/#22).',
    );
  }

  // A sanction goes wrong in TWO ways, and only one of them is the token disappearing.
  // The other is the token still being fallback-only while the fallback it claims has
  // changed underneath it — re-point `var(--cat-1-texture, var(--cat-1-fill))` at
  // `--cat-1-mark` and every other arm here stays green (the chain still resolves, the
  // token is still fallback-only) while the recorded justification, which says in as many
  // words that it lands on the same-role token and NOT on a mark, becomes false. That is
  // the --cat-N-ink construction exactly, so the `fallback` field is CHECKED, not just
  // recorded, on EVERY via-chain read rather than the first.
  const byToken = new Map(fallbackOnly.map((f) => [f.token, f]));
  const stale = [];
  for (const s of SANCTIONED_FALLBACK_READS) {
    const live = byToken.get(s.token);
    if (!live) { stale.push(`--${s.token}`); continue; }
    const wrong = live.reads.filter((r) => (r.chain[0] ?? null) !== s.fallback);
    if (wrong.length) {
      const shown = wrong.slice(0, 3).map((r) => `${r.where} → ${r.chain.length ? `--${r.chain[0]}` : 'literal'}`).join(', ');
      errors.push(
        `SANCTIONED_FALLBACK_READS says --${s.token} falls back to --${s.fallback}, but ${wrong.length} of ` +
        `${live.reads.length} read(s) fall back to something else: ${shown}${wrong.length > 3 ? ', …' : ''}. ` +
        'Either restore the fallback, or rewrite the entry — a justification that names the wrong target is how ' +
        '--cat-N-ink degraded onto the 3:1 graphical floor while every gate stayed green.',
      );
    }
  }
  if (stale.length) {
    errors.push(
      `${stale.length} stale fallback sanction(s) in tools/check-ownership.js — ${stale.join(', ')} no longer reach ` +
      'the gate through a fallback-only read (derived, reads changed, or the palettes stopped declaring them). ' +
      'Remove the SANCTIONED_FALLBACK_READS entries so the ledger stays honest.',
    );
  }
}

// Derived from the manifest schema (the contract's source of truth) — was a hand-mirror.
const ADAPT_MODES = new Set(require('../lib/components/manifest.schema.json').properties.adapt.properties.mode.enum);

/**
 * Carousel strategies that RESHAPE a member for the box, and therefore count as
 * `adapt.mode: "reflow"` on their own. Deliberately a short allowlist, not
 * "any `split.strategy`".
 *
 * The first cut accepted any strategy at all, and an independent checker showed
 * what that bought: 15 of 49 reflow-declaring components carry SOME strategy, so
 * all 15 auto-passed regardless of what they shipped — including `premise`, which
 * gained `cover-paginate` in the same change. Delete `premise`'s entire family
 * reflow block, the exact state this gate exists to make impossible, and the gate
 * stayed green. A gate that cannot catch the defect that motivated it is worse
 * than no gate, because it is also a claim.
 *
 * The line is whether the recipe changes a member's STRUCTURE for the box or
 * merely distributes members across pages:
 *   · cover-cards TRANSPOSES a table row into a card with the column headers as
 *     labelled fields — a wide read-across table cannot paginate out of
 *     HORIZONTAL overflow, so the shape itself has to change. That is a reflow.
 *   · cover-paginate (premise, glossary, q-and-a, authority-chain,
 *     regulatory-update, statute-stack) puts a cover in front and splits the run.
 *     Every page renders the SAME composition as the unsplit slide. Useful, not a
 *     reflow — those components must show a real mechanism of their own.
 * Add a strategy here only with the transposition it performs written down.
 */
const RESHAPE_STRATEGIES = new Set(['cover-cards']);

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
 *   4. SANE       — `native` must NOT carry a `[data-family=…]` reflow rule (the
 *      contrapositive of rule 2, stated for a clear message).
 */
function checkAdaptDeclarations(manifests, errors) {
  // The family stamp the engine writes from the deck geometry (lib/adaptive/
  // families.js). This REPLACED `@container … aspect-ratio` in #1218 — a container
  // query measures the section's content box, which drifts off the deck aspect, so
  // the whole square tier was silently inert. Matching the attribute (not the
  // at-rule) is what keeps this gate seeing real reflow.
  const FAMILY_REFLOW = /\[data-family\s*=/;
  // The shared chart-frame CSS carries a family reflow rule that restructures
  // `.chart-body` on tall boxes for EVERY chart-frame member — so a chart's reflow
  // can live there, not in its own styles.css. The anti-drift rule must see it, or a
  // chart could declare `native` while inheriting reflow (the false-negative the
  // maker-checker caught). Union it in for chart-bucket components, the way
  // checkVariantDeclaration unions base.modifiers.
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
    // COMMENT-STRIPPED. Every one of these tests asks "does this stylesheet carry a
    // reflow RULE", and a `[data-family="tall"]` quoted in prose is not one — these
    // files are heavily commented, and several comments quote the idiom precisely
    // because it is the thing being explained. Raw text would let a component keep
    // its `reflow` promise on the strength of a code sample in a comment.
    // `familyReflowingComponents` in check-family-tiers.js already did this; the two
    // gates were answering the same question different ways.
    const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '');
    let css = cssPath ? stripComments(fs.readFileSync(cssPath, 'utf8')) : '';
    if (manifestBucket(m) === 'chart') css += `\n${stripComments(chartFamilyCss)}`;
    const hasContainerReflow = FAMILY_REFLOW.test(css);
    // orientation defaults to BOTH when omitted (the manifest's documented default).
    const orientation = Array.isArray(m.orientation) ? m.orientation : ['landscape', 'portrait'];

    if (hasContainerReflow && mode !== 'reflow') {
      errors.push(
        `${m.name}: declares adapt.mode "${mode}" but its CSS uses \`[data-family=…]\` ` +
        `(family reflow) — must be "reflow". Fix the manifest or remove the family rule.`,
      );
    }
    // …AND THE OTHER DIRECTION. The check above only ever caught CSS-without-a-
    // declaration; a manifest could claim `reflow` and ship NO reflow rule at all and
    // this gate stayed silent. Six components were in exactly that state — `premise`
    // rendered its landscape `1fr auto` split in a 980px-wide fluid box, so the lede
    // column wrapped one word per line and each ladder row's `10.9375cqi` name column
    // truncated "Remember" to "R…". The manifest is the machine-readable contract the
    // docs and authoring agents read, so an unkept promise there is worse than an
    // undeclared behavior: it actively tells a consumer the component adapts.
    //
    // ALL THREE mechanisms the schema recognizes, not just the CSS one. `reflow` is
    // defined as "ships DISTINCT per-family structural layouts (via `[data-family=…]`
    // CSS, a `*.transform.js` that branches geometry on orientation, or the mermaid
    // reorient)". A CSS-only check is a FALSE POSITIVE machine: `diagram` carries no
    // layout CSS at all and reflows through `lib/integrations/mermaid/reorient.js`,
    // which rewrites a flowchart's direction token LR→TB on a portrait box. Checking
    // only for `[data-family=]` would have demanded it re-declare itself `native`,
    // i.e. the gate would have driven a TRUE declaration into a false one.
    //
    // `[data-orientation]` counts as CSS reflow too — it is the older deck-wide stamp
    // and several components legitimately still use it (portrait ∪ square is exactly
    // the square ∪ tall ∪ strip set, so the two spellings select the same slides).
    const ORIENTATION_REFLOW = /\[data-orientation\s*=/;
    const cssReflow = hasContainerReflow || ORIENTATION_REFLOW.test(css);
    // A sibling transform that branches on the box (`*.transform.js` next to the
    // manifest), or a mermaid-bearing component, which the shared reorient covers.
    const dir = cssPath ? path.dirname(cssPath) : null;
    // Comment-stripped for the same reason as the CSS above — and note this arm
    // currently admits NO component that the CSS test would not already admit. It
    // is here because the schema names it as a mechanism, so a future transform
    // that branches geometry on the box must not be rejected; but it is untested
    // surface, and it is the loosest of the four. Tighten it before relying on it.
    const jsComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const transformReflow = dir && fs.existsSync(dir)
      && fs.readdirSync(dir).filter((f) => f.endsWith('.transform.js')).some((f) => (
        /orientation|data-family|familyFor|portrait|reorient/.test(jsComments(fs.readFileSync(path.join(dir, f), 'utf8')))
      ));
    // STRUCTURAL, not a substring of the manifest. A first cut tested the whole
    // manifest JSON for /mermaid/i and quietly excused `video`, `image`, `scene`,
    // `journey` and `state-chart` — every one of which mentions Mermaid only in
    // PROSE ("reach for a Mermaid graph instead when…"). What actually makes the
    // reorient apply is the component authoring a mermaid FENCE, so test that.
    const mermaidReflow = /```\s*mermaid/i.test(`${m.skeleton || ''}\n${m.sample || ''}`);
    // A carousel RESHAPE recipe is the fourth mechanism, and it is box-conditional by
    // construction: auto-split is skipped outright on a landscape @size
    // (lattice-emulator.js `AUTOSPLIT_APPLIES`), so a `split.strategy` fires only on
    // square/tall/strip. `compare-table` is the case — a wide read-across table cannot
    // paginate out of HORIZONTAL overflow, so `cover-cards` transposes each row into a
    // card with the column headers as labelled fields. That is "the box is
    // restructured, not just scaled" as squarely as any CSS rule; it simply keys on the
    // class carousel.js adds rather than on `[data-family]`. Verified it needs no CSS
    // tier as well: all five variants render at `size: mobile` with zero overflow, so
    // the native table degrades gracefully when the reshape does not run.
    const splitReflow = RESHAPE_STRATEGIES.has(m.split?.strategy);
    if (mode === 'reflow' && !cssReflow && !transformReflow && !mermaidReflow && !splitReflow) {
      errors.push(
        `${m.name}: declares adapt.mode "reflow" but ships NONE of the four mechanisms — ` +
        `no \`[data-family=…]\`/\`[data-orientation=…]\` CSS, no orientation-branching ` +
        `*.transform.js, no mermaid reorient, no carousel \`split.strategy\` reshape. ` +
        `It has one composition and paints it in every ` +
        `box, while the manifest tells authoring agents it adapts. Either ship the reflow, or ` +
        `declare the mode it actually has ("native" / "single-orientation"). See ` +
        `engineering/decisions/2026-06-20-adaptive-manifest-contract.md.`,
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

// Every VISUALIZATION declares what its picture is drawn with — the `render`
// field (`svg` | `hybrid` | `html`) plus a `renderNote` justifying it. This is the
// COVERAGE half of the declare-derive-gate contract: it is static, so it lives in
// the browser-free `build:check` and fails the moment a visualization ships
// without the pair, or ships a note that only restates the enum. The TRUTH half —
// does the declaration match the rendered export — needs a real browser and lives
// in tools/check-render-nature.js (`npm run check:render-nature`).
//
// Two directions, because both silences are bad. A visualization that declares
// NOTHING leaves the question the field exists to answer unanswered. A
// NON-visualization that declares it anyway is worse: check-render-nature only
// derives the visualization family, so a stray `render` elsewhere would be exactly
// the ungated assertion this whole mechanism exists to prevent.
//
// See engineering/decisions/2026-07-27-render-nature-declaration.md.
const RENDER_NATURES = new Set(require('../lib/components/manifest.schema.json').properties.render.enum);
const RENDER_BUCKETS = new Set(['chart', 'diagram']);
// The substance floor. Read from the schema so the two can never disagree — and
// enforced HERE because nothing else enforces it: the manifest loader's only
// schema-derived check is on key NAMES, so `"minLength": 40` was decoration
// until this line existed. A floor is what actually kills the vacuous note; the
// pattern below only catches the handful of phrasings that clear it by padding.
const RENDER_NOTE_MIN = require('../lib/components/manifest.schema.json').properties.renderNote.minLength;
// A note that only names its own enum value explains nothing.
const EMPTY_NOTE = /^(it |this )?(component |layout )?(is |renders |renders as |draws |uses )?(pure |plain |all )?(svg|html|hybrid)\b[\s.]*$/i;

function checkRenderNature(manifests, errors) {
  for (const m of manifests) {
    const isViz = RENDER_BUCKETS.has(manifestBucket(m));
    const declared = m.render;
    const note = typeof m.renderNote === 'string' ? m.renderNote.trim() : '';

    if (!isViz) {
      if (declared !== undefined || m.renderNote !== undefined) {
        errors.push(
          `${m.name}: declares \`render\`/\`renderNote\` but is not a visualization (bucket ` +
          `"${manifestBucket(m)}", not chart/diagram). check-render-nature.js only derives the ` +
          `visualization family, so a declaration here would never be checked. Remove it.`,
        );
      }
      continue;
    }
    if (!RENDER_NATURES.has(declared)) {
      errors.push(
        `${m.name}: missing/invalid \`render\` (got ${JSON.stringify(declared)}). Every visualization ` +
        `declares what its picture is drawn with: ${[...RENDER_NATURES].join(' | ')}. ` +
        `Run \`npm run check:render-nature -- --report\` to see what it actually renders.`,
      );
    }
    if (!note) {
      errors.push(
        `${m.name}: declares \`render: ${JSON.stringify(declared)}\` with no \`renderNote\` — the field ` +
        `states the shape, the note states why. Name what each side is made of and what forced it.`,
      );
    } else if (note.length < RENDER_NOTE_MIN || EMPTY_NOTE.test(note)) {
      errors.push(
        `${m.name}: \`renderNote\` says nothing beyond \`render\` (${JSON.stringify(note)}; ` +
        `${note.length} chars, floor is ${RENDER_NOTE_MIN}). Say what forced the choice — a shared ` +
        `coordinate system, a measured box, arbitrary rotation, text that must stay selectable.`,
      );
    } else if (declared === 'hybrid' && !(/\bsvg\b/i.test(note) && /\bhtml\b/i.test(note))) {
      // BOTH words, not either. The seam is the entire value of the hybrid
      // verdict, and a one-sided note is worse than useless — "every visible part
      // is drawn as SVG" alongside `render: "hybrid"` is self-contradictory, and
      // an `||` here would have waved it through.
      errors.push(
        `${m.name}: \`render: "hybrid"\` but its \`renderNote\` names only one side ` +
        `(needs to say what is SVG *and* what is HTML). That boundary is the whole point of the ` +
        `hybrid value — an author needs to know which half animates and which half an SVG export ` +
        `leaves behind.`,
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

// A preview builder assembles ONE document out of TWO caller-influenced strings, and
// until 2026-08-17 this gate only knew about the second:
//
//     '…<style id="lattice-theme">' + themeCss + '</style></head><body>' + slideHtml
//                                     ^ STYLE_SINK_MARKER                  ^ SANITIZE_CALL
//
// The stylesheet channel is a script-execution path in its own right. A `<style>`
// element's content is HTML RAWTEXT, which ends at the first `</style` and knows nothing
// about CSS comments or strings — so a `</style>` carried in theme CSS ends the element
// and everything after it is parsed as MARKUP in the live, same-origin, un-sandboxed
// frame, no matter how well the slide HTML beside it was sanitized. Measured in Chromium
// 131: `</style>` alone runs script; closing the CSS comment with `*​/` alone does not.
// A theme's `description` reaches this string model-populated (Fabricate seeds it from
// the reply), so the input is untrusted by construction.
//
// The gate therefore checks BOTH channels, and they are independent: a builder with no
// `<style>` element owes nothing here, and one that has both owes both calls. See
// engineering/decisions/2026-08-17-theme-css-is-a-preview-sink.md.
const STYLE_SINK_MARKER = /<style[\s>]/i;
const SANITIZE_STYLE_CALL = /sanitizeStyleText\s*\(/;

// DISCOVERY for the stylesheet channel, and it is deliberately NOT the runtime-`<script>`
// idiom the markup arm keys on. That idiom marks a live PREVIEW frame; it has no causal
// relation to "assembles a document containing untrusted CSS", and keying on it missed
// `share-export.ts` — whose `buildSelfContainedDoc` embeds the same composed sheet in the
// same `<style>` shape, into a file that is DOWNLOADED AND SHARED. That one has a real
// author→recipient split, where the preview frame is mostly self-XSS. Found by a
// Munger-inversion pass on the first cut of this gate.
//
// The honest marker for the class is "assembles a whole HTML document". Measured over
// `docs/src`: it selects exactly five files, all of them real document assemblers, with
// no false positives — where a looser "embeds a `<style>` with an interpolation" marker
// selects 22, most of them our own font/chart CSS.
const DOC_ASSEMBLER_MARKER = /<!doctype html/i;
// The roots the STYLESHEET arm walks — every SHIPPED surface that assembles a whole
// HTML document a human then opens. A root is a directory or a single file.
//
// It shipped as `docs/src` alone, and that was half the class: the CLI export pipeline
// assembles the same document from the same caller CSS (`lattice-emulator.js`'s `htmlDoc`
// scaffold takes a `--css` layout sheet and a theme file, both caller-supplied by
// construction) and was not scanned at ALL, so the same breakout could recur there in
// silence. Measured over the repo, the marker selects 2 files outside `docs/src` under
// these roots — both genuine — where a whole-repo walk selects 14, the other 12 being
// `dist/` build products, frozen decision-doc probes, a bench, and local measurement tools
// that never reach a recipient. So the line is drawn at "ships", not at "exists":
// (An earlier draft of this comment said 13/11 — that figure quietly excluded `.test.mjs`,
// which this walk does not. Corrected here as well as in the note, because this comment is
// what the next person maintaining the gate actually reads.)
//
//   · `dist/` is GENERATED from these very files, and HARD RULE #2 forbids hand-editing
//     it — a gate demanding a fix there would demand the one fix that is never allowed.
//     `listSourceFiles` skips it, and no root names it.
//   · `tools/` and `test/` build documents to MEASURE something on this machine; nothing
//     they emit is handed to anyone.
//
// Widening this set widens HARD RULE #22. Its test pins the set by value, so it cannot
// move without saying so out loud.
const DOC_STYLE_SINK_ROOTS = ['docs/src', 'lib/export', 'lattice-emulator.js'];
// A document assembler that legitimately does not call the sanitizer, with the reason.
// Same anti-rot shape as the other allowlists: a stale entry fails.
//
// EMPTY BY DESIGN. Its one entry was `docs/src/playground/player-core.generated.js`,
// excused because "the fix belongs at its generator" and that generator is the export
// pipeline, which wants export sign-off rather than a silent edit. The generator
// (`lib/export/player-core.mjs`) is guarded as of the change that added the export roots
// above, so the bundle inherits the call and the entry became a sanction for a fix that
// had already landed — exactly the stale lie this list's rot check exists to catch.
const SANCTIONED_STYLE_SINK_EXEMPT = [];
const SANCTIONED_PREVIEW_BUILDERS = [
  { file: 'docs/src/playground/deck-preview.js', why: 'buildSrcdoc + renderDeck (the latter also sanitizes the patchSections innerHTML path); the theme/component CSS bakes into the document <style>.' },
  { file: 'docs/src/lib/single-slide-render.ts', why: 'srcdoc() — landing islands / specimens / the Studio\'s single-slide preview; themeStyleContent() is the one place theme + author CSS is baked, and the RESTYLE fast path re-swaps it.' },
  { file: 'docs/src/components/studio/present/stage-window.js', why: 'buildStageDoc — the Studio\'s Stage window AND rehearsal stage; embeds the deck\'s composed CSS in the stage <style>. Under `standalone` the same document is a top-level window the audience reads, so the stylesheet channel matters there most.' },
];

// ── HARD RULE #22, the POST-SANITIZE INJECTION shape (#1246) ────────────────────
//
// The other three arms of #22 all guard the moment a preview DOCUMENT is assembled.
// `lib/runtime` runs INSIDE that document and writes more markup into it, after every
// one of those guards has already run — so the sanitizer is one step too early for
// anything the runtime injects, and no existing gate can see it: `checkPreviewHtmlSinks`
// asks whether a builder CALLS `sanitizeSlideHtml`, and the builder does.
//
// This is a CENSUS, not a guard requirement, and the difference is deliberate. The
// dangerous sink here takes SVG back from a third-party renderer (Mermaid), and
// re-sanitizing it is not available: measured through the real `createSlideSanitizer`,
// DOMPurify deletes `<foreignObject>` and `<style>` — which is every htmlLabels node
// label and every diagram's generated styling. What actually contains the payload is
// Mermaid's own `securityLevel: 'strict'` (a Mermaid SECURE KEY, so a deck's `%%{init}%%`
// cannot opt back out), and that is a behavioral property of a floating dependency
// rather than of this repo. So the durable requirement is the one #1246's acceptance
// criteria asked for: a NEW render path cannot inject post-sanitize DOM without someone
// writing down where its markup comes from.
//
// `sink` is the receiver expression plus the operation, and `count` pins how many times
// it appears — because the file-scoped shape every other #22 arm uses would certify a
// SECOND injection point hiding behind an already-legitimate one (#1731 §9.8, finding 7,
// in a different channel). A stale entry fails too, so the list cannot rot.
const SANCTIONED_RUNTIME_MARKUP_SINKS = [
  {
    file: 'lib/runtime/index.js',
    sink: 'target.innerHTML',
    count: 3,
    provenance:
      'THIRD PARTY (2 of 3) — the SVG mermaid.render() returns, injected on the fresh-render path and ' +
      'again on the mermaidSvgCache replay of the same string. Contained by securityLevel:\'strict\', ' +
      'pinned behaviorally in docs/e2e/mermaid-post-sanitize.spec.ts, NOT by a sanitizer: DOMPurify ' +
      'strips <foreignObject> and <style>, i.e. every node label and all diagram styling. The third is ' +
      'the empty-string clear before a re-render, which parses no markup.',
  },
  {
    file: 'lib/runtime/index.js',
    sink: 'errEl.innerHTML',
    count: 1,
    provenance: 'OURS — clears the themed diagram error block to the empty string before it is rebuilt from text nodes.',
  },
  // `li.innerHTML` and `td.innerHTML` USED TO BE HERE, declared "OURS — already-sanitized
  // text". That reasoning was WRONG and the census said so in writing, which is the exact
  // failure a provenance census exists to prevent: both read their label from
  // `element.textContent`, which DECODES entities, so markup the sanitizer had deliberately
  // left inert came back live and `innerHTML` re-parsed it. Demonstrated on the real
  // Playground (`top.__pwned = 1`). They are now built with `document.createElement` +
  // `textContent` (`badgeSpan` in lib/runtime/index.js), so there is no sink to declare.
  // Do NOT re-add an entry here to "cover" a reinstated innerHTML — fix the sink instead.
  {
    file: 'lib/runtime/index.js',
    sink: 'document.body.insertAdjacentHTML',
    count: 1,
    provenance:
      'OURS — texturePatternDefs(), a fixed <svg><defs> of categorical texture patterns generated from ' +
      'lib/tokens with no caller-supplied input at all.',
  },
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

// ── Fixed e2e sleeps are sanctioned, one entry per (file, duration) ─────────────
// A fixed `page.waitForTimeout(n)` in the e2e suite is a bet that a loaded CI box finishes
// inside an interval somebody guessed. On a NIGHTLY suite, losing that bet produces a red
// indistinguishable from a real failure (#1526). Some are still correct — an assertion whose
// pass condition is "and then nothing else happened" cannot be polled, and the tick of a
// hand-rolled polling loop is not a settle at all — so this is an ALLOWLIST, not a ban.
//
// WHY A GATE AND NOT A SWEEP. #1564 judged 21 of them, one at a time, and that judgment cost
// a measurement pass, a checker and an inversion. Nothing protected it: new sleeps land from
// unrelated feature PRs at about the rate a sweep removes them — `gallery-preview-budget`
// added 11 the same week #1526 was filed and was never counted in it. Left ungated, the count
// returns and, worse, the ABSENCE of a justification stays ambiguous between "judged and
// kept" and "nobody ever looked". This list makes that difference explicit and checkable.
//
// COUNTS ARE OF WAITS, NOT OF `waitForTimeout(` MATCHES. #1526 recorded back-gesture as "14"
// because that is the grep. Its `settle` is ONE declaration called 23 times, so the file's
// real figure is 24. A gate that counted text would certify that file as nearly clean while
// 23 fixed waits sat behind one helper — so a sleep that is the whole body of a named
// single-expression helper is counted at its CALL SITES, recorded here as `via`.
//
// Three ways to fail, and the last two are the point:
//   · an UNLISTED (file, duration) — a new sleep nobody justified;
//   · a STALE entry whose sleep is gone — the allowlist rotting into fiction;
//   · a COUNT that drifted — e.g. a 24th `settle(page)` call, which no text grep would see.
const SANCTIONED_E2E_SLEEPS = [
  {
    file: 'docs/e2e/stage-placement.spec.ts', ms: 1200, count: 3,
    why: 'ABSENCE ASSERTIONS on an ASYNC path. `autoPlaceStage` runs off the open gesture as a '
       + 'promise chain, so "the Stage was never moved" and "the Stage was never fullscreened" '
       + 'have no signal to poll — a poll goes green on its first tick, before the placement it '
       + 'is meant to catch could have been attempted. All three are the cases where the correct '
       + 'behavior is that NOTHING happens: a single screen (which must never take the display '
       + 'from the console the presenter drives), a refused Window Management permission, and an '
       + 'engine with no Window Management at all. Everything pollable around them already is — '
       + 'the popup via `context.waitForEvent(\'page\')`, the deck paint via `not.toBeEmpty()`, '
       + 'the slide index via `toBeVisible`, and every case where placement SHOULD happen is an '
       + '`expect.poll` on the recorded call rather than a wait.',
  },
  {
    file: 'docs/e2e/stage-window.spec.ts', ms: 400, count: 5,
    why: 'ABSENCE ASSERTIONS, four of them, all the same "and then nothing happened" shape. (1) The '
       + 'ECHO: the Stage and the console both drive the deck now, and the relay that carries a Stage '
       + 'gesture to the console invites a move posted out, applied, and posted back as a second move '
       + '— so the cell presses once and asserts the counter is STILL on the same slide. (2) The LINK '
       + 'GUARD, once per shape: a click on a deck link inside the projected copy used to strand the '
       + 'console and hand a foreign origin `window.opener` on the origin holding the user\'s API key, '
       + 'and the assertion is that the URL did NOT change — measured across all three shapes that '
       + 'survive the sanitizer, because the first selector caught only the plain anchor and a real '
       + 'click on an SVG `xlink:href` navigated. (3) The PINCH and the trackpad `ctrl`+wheel: both '
       + 'were read as swipes and turned the deck (#1294 again), and the fix is that they now do '
       + 'NOTHING, which is again an absence. None has a signal to poll — a poll goes green on its '
       + 'first tick, before the navigation or the extra advance it is meant to catch could commit. '
       + '(5) The REWRITE FLICKER: a site palette change is announced and the presenter view must '
       + 'not blink off while the Stage document is rebuilt — the assertion is a 16ms SAMPLER over '
       + 'that window reading zero, so the wait is what gives the sampler a window to sample. '
       + 'Everything pollable around them already is: the popup via `context.waitForEvent(\'page\')`, '
       + 'the deck paint via `not.toBeEmpty()`, every slide ARRIVAL via `toBeVisible`, and the pill '
       + 'state via `toHaveAttribute`.',
  },
  {
    file: 'docs/e2e/stage-window.spec.ts', ms: 3000, count: 1,
    why: 'ABSENCE ASSERTION over an ACCUMULATOR, which is what makes this length safe rather '
       + 'than merely long. A Stage the presenter closes by hand must revert the console and say '
       + 'NOTHING — a notice for an act you just performed is the one people learn to dismiss '
       + 'unread, which costs the case it exists for (2026-08-24-stage-console-split.md §13). The '
       + 'wait outlives the TWO deadlines the notice could arrive on: the loss classification '
       + 'samples `window.closed` for up to 600ms (a hand-closed window still reports '
       + '`closed === false` when its own unload beat lands, measured), and the liveness poll '
       + 'fires every 2000ms. There is no signal to poll for a thing that must never happen. '
       + 'THE TRAP THIS ENTRY ORIGINALLY WALKED INTO, recorded because the number looks like a '
       + 'derivation either way: the first draft read `toHaveCount(0)` on the toaster at the end '
       + 'of the wait, and `notify` is `toast(msg, {duration: 2600})` with a 200ms unmount — so '
       + 'the toast it forbids is GONE FROM THE DOM by ~2800ms and the read could not see it. '
       + 'Two deadlines were derived and a third clock (how long the notice lives) decided '
       + 'whether the assertion had anything to look at, which made LENGTHENING the wait the '
       + 'thing that broke it. The cell now installs a MutationObserver BEFORE the close and '
       + 'accumulates every toast text that appears, so an auto-dismissal cannot hide one and the '
       + 'wait can be as long as the deadlines require. Its POSITIVE CONTROL is inside the same '
       + 'cell — it re-opens the Stage, navigates it away, and awaits the same log filling — so a '
       + 'Studio whose toaster never rendered cannot satisfy it. Verified by mutation: the cell '
       + 'now fails on its OWN assertion, where before it failed on the control.',
  },
  // ── #1246, the post-sanitize injection suite ─────────────────────────────────
  // Both are the canonical "and then nothing happened" shape this allowlist exists for:
  // the assertion is that a payload did NOT execute and did NOT reach the network, and an
  // absence has no signal to poll — a poll would go green on its first tick, before the
  // payload it is meant to catch had any chance to fire. Everything POLLABLE in these
  // specs already is: the diagram's own `data-mermaid-state` settle stamp and the rendered
  // label are awaited with `expect`, so the wait covers only the gap between "the payload
  // is in the live DOM" and "we conclude it did nothing".
  {
    file: 'docs/e2e/mermaid-post-sanitize.spec.ts', ms: 1500, count: 1,
    why: 'ABSENCE ASSERTION. The script-vector table injects a payload into a rendered node label '
       + 'and then asserts `top.__pwned` is still undefined and no request left the frame. The '
       + 'render itself is polled (data-mermaid-state + the label element); this is the settle '
       + 'window for an execution that must never come. COUNT SEMANTICS, stated because this gate '
       + 'counts TEXT matches and its docblock says counts are of WAITS: this single occurrence '
       + 'sits inside a `for (const v of SCRIPT_VECTORS)` loop and therefore executes once per '
       + 'vector — NINE times, ~13.5s of the suite. A table-driven loop is the same shape as the '
       + 'helper-hiding-N-waits case that gate was written for; the `via` mechanism only covers '
       + 'named helpers, so it is written down here instead.',
  },
  {
    file: 'docs/e2e/mermaid-post-sanitize.spec.ts', ms: 1000, count: 1,
    why: 'ABSENCE ASSERTION, post-interaction. After clicking a node whose `click` directive '
       + 'carries a javascript: URL, the assertion is that no navigation and no request followed. '
       + 'A click has no completion signal when the correct outcome is that nothing happens.',
  },
  // ── judged in #1618 ──────────────────────────────────────────────────────────
  // The 12000ms entry is RETIRED. Its justification claimed a poll "would go green
  // without ever waking the frozen tab" and that 12s "outlasts several 5s
  // heartbeats" — the first was a rationalization (the DRIVE signal, how many ticks
  // the woken page has run, is perfectly pollable even though the ASSERTION is an
  // absence) and the second was wrong arithmetic (12s is two beats, not several).
  // The spec now polls the page's own tick counter and then asserts.
  {
    file: 'docs/e2e/crash-sentinel.spec.ts', ms: 1500, count: 2,
    why: 'JUDGED KEEP (crash recording made opt-in). The expected outcome IS "nothing changes": '
       + 'with the Workspace switch off, a console.error must produce no session record and no tab '
       + 'mirror, and there is nothing to poll for a write that must never happen — the recorder is '
       + 'not running, so it has no heartbeat, no listener and no counter to observe. The length is '
       + 'DERIVED rather than guessed: the only timer that could turn a console error into a write '
       + 'is the CONSOLE_PERSIST_MS throttle (1000ms in lib/crash-sentinel.ts), so the wait clears '
       + 'it with margin. If that constant moves, this must move with it. TWO of them: the same '
       + 'assertion runs once on Chromium and once as a tagged @webkit-phone twin, because the tag '
       + 'system is per-project and exclusive and this is a privacy control on the engine the '
       + 'original report came from.',
  },
  {
    file: 'docs/e2e/crash-sentinel.spec.ts', ms: 2000, count: 1,
    why: 'JUDGED KEEP (#1618, re-judged when the crash toast was retired). The one that remains '
       + 'is the window during which the page is STOPPED and the other tab wipes: the stopped '
       + 'page by definition runs nothing to poll, and the length only has to exceed the wipe, '
       + 'which is a single synchronous storage write. The clean-session wait went with the '
       + 'toast — "an ordinary visit raises no crash report" is now asserted on the Workspace '
       + 'row, which is durable state and can simply be awaited. The 3000ms entry that once '
       + 'stood here is retired with the freeze-observation window it measured — the skip '
       + 'predicate reads whether the page HEARD the wipe rather than counting ticks.',
  },
  // ── judged in #1564 ──────────────────────────────────────────────────────────
  {
    file: 'docs/e2e/back-gesture.spec.ts', ms: 650, count: 23, via: 'settle',
    why: 'PARTLY JUDGED (#1564). Spans drawer-paints -> drawer-REGISTERS the history entry a '
       + 'following goBack() pops. Genuinely unpollable at a door transition (Menu -> Themes '
       + 'pushes nothing: history.length holds and __latticeOverlayBack is already true) and at '
       + 'the post-reload adopt. The remaining call sites are NOT individually judged — most look '
       + 'like dead time before an auto-retrying assertion; a few precede a synchronous '
       + 'history.length read or an absence assertion and are load-bearing. See the comment at '
       + 'the declaration. Reducing this count is the next slice in that file.',
  },
  {
    file: 'docs/e2e/back-gesture.spec.ts', ms: 1200, count: 1,
    why: 'JUDGED KEEP (#1564). The regression is the MENU COMING BACK after the child closes, so '
       + 'the pass is "and then nothing else happened" — a poll for count===0 fires at the first '
       + 'zero (~410-460ms measured) and never sees a later re-open. Two known limits, recorded '
       + 'at the call site: it samples ONCE at t=1200ms, and the interval was calibrated on a '
       + 'build where the bug does not exist. A MutationObserver record-then-assert-empty would '
       + 'be strictly stronger and is the intended fix.',
  },
  {
    file: 'docs/e2e/present-beat.spec.ts', ms: 60, count: 3,
    why: 'NOT A SETTLE (#1564). These are the poll INTERVALS of hand-rolled sampling loops that '
       + 'read a value at the instant a slide advances. An auto-retrying matcher would wait out '
       + 'the 4s hold under test, which is exactly how the first version of that spec passed '
       + 'against the unfixed build. Removing them removes the loop.',
  },
  {
    file: 'docs/e2e/present-beat.spec.ts', ms: 1500, count: 1,
    why: 'MEASUREMENT WINDOW (#1564), not a settle. "The fill advances with the clock" is a RATE, '
       + 'and for a rate the SAMPLE POINT carries the power, not the bound. Sampling the baseline '
       + 'at the first non-zero value (0.047px at ~110ms) let one sub-pixel tick satisfy the '
       + 'assertion, so a fill that started then STALLED passed. Shortening this dwell is what '
       + 'breaks the test.',
  },
  {
    file: 'docs/e2e/present-beat.spec.ts', ms: 4500, count: 1,
    why: 'JUDGED KEEP (#1564). Asserts no surviving timer resumed playback across the beat the '
       + 'tap interrupted — an absence, which no poll expresses. A BUDGET derived from a '
       + 'configured constant (lattice-present-slide-beat = 4000, set in the beforeEach), not a '
       + 'guess.',
  },

  // ── INHERITED, NOT JUDGED — the backlog #1526 still owes ─────────────────────
  // Seeded when this gate landed so the tree is honest about what nobody has examined.
  // Each is a claim only that the sleep EXISTS, never that it is correct. Replacing one
  // with a named signal, or judging it and rewriting this `why`, is the work.
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 160, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 180, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 400, count: 2, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  // Was `docs/e2e/gallery-preview-budget.spec.ts` @ 600ms until #1654 lifted that spec's
  // local `openGallery` into the shared `openAddSlide` fixture helper (the launcher rename
  // made an open-coded `getByRole` ambiguous, so every caller had to route through one
  // opener). Same wait, same mobile drawer route, new file — MOVED, NOT JUDGED. The gate
  // caught the move as an unsanctioned wait plus a stale entry, which is exactly its job.
  { file: 'docs/e2e/studio-fixture.ts', ms: 600, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575), moved from gallery-preview-budget.spec.ts in #1654. Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 1200, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 2500, count: 2, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 4000, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/gallery-preview-budget.spec.ts', ms: 4500, count: 2, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/present-guide.spec.ts', ms: 120, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/present-guide.spec.ts', ms: 5000, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/preview-nav.spec.ts', ms: 400, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). Never counted by #1526.' },
  { file: 'docs/e2e/pwa.spec.ts', ms: 600, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/reader-alarms.spec.ts', ms: 3000, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/reader-alarms.spec.ts', ms: 4500, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  {
    file: 'docs/e2e/studio-header-fit.spec.ts', ms: 'SETTLE_STEP_MS', count: 1,
    why: 'UNJUDGED — inherited at gate introduction (#1575), and INVISIBLE to every count '
       + 'before it: the argument is a constant, not a literal, so #1526\'s census and this '
       + 'gate\'s own first regex both missed it. Shape is a bounded read-until-two-identical '
       + 'poll (SETTLE_TRIES = 40), so it is probably a poll interval rather than a settle — '
       + 'but nobody has judged it.',
  },
  {
    file: 'docs/e2e/studio-jargon-alignment.spec.ts', ms: 50, count: 1,
    why: 'JUDGED KEEP (#1523). Deliberate after that PR: the rail click preceding it has already '
       + 'put the preview on the slide under test, so the assertion is true BEFORE the click '
       + 'being tested does anything. A poll passes instantly against that stale-but-correct '
       + 'state and never observes the click.',
  },
  {
    file: 'docs/e2e/studio-jargon-alignment.spec.ts', ms: 100, count: 1,
    why: 'JUDGED KEEP (#1523). Same class as the 50ms above — "no change" is the pass, which a '
       + 'poll cannot distinguish from "not yet changed".',
  },
  { file: 'docs/e2e/studio-preview-perf.spec.ts', ms: 500, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/studio-preview-perf.spec.ts', ms: 700, count: 2, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/studio-preview-perf.spec.ts', ms: 800, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  { file: 'docs/e2e/webpage-export.spec.ts', ms: 500, count: 1, why: 'UNJUDGED — inherited at gate introduction (#1575). On #1526 backlog.' },
  // Arrived from main while this PR was open — the ratchet caught them, which is the point.
  { file: 'docs/e2e/math-compare-webkit.spec.ts', ms: 400, count: 1, why: 'UNJUDGED — landed in #1561 after this gate was written; the gate flagged it on rebase.' },
  {
    file: 'docs/e2e/playground-first-paint.spec.ts', ms: 1500, count: 7,
    why: 'MEASUREMENT WINDOW (#1589/#1588/#1590), not a settle. Every one of these follows a '
       + 'signal that has ALREADY been awaited (`.pg-preview-wrap.is-live`, the walk position, '
       + 'the 404 toast) and then keeps the per-frame sampler running for a beat, because what '
       + 'this file asserts is "and then nothing moved". Polling cannot express that: an '
       + 'auto-retrying matcher fires at the first frame that satisfies it and never sees the '
       + 'second geometry arriving after. The bound is the 0.2s shell-to-filmstrip cross-fade '
       + 'plus room for a late correction pass; shortening it is what stops these cases '
       + 'catching the defect they were written for. Three were inherited from #1581 and were '
       + 'UNJUDGED; they are judged now and the four added here are the same shape.',
  },
  { file: 'docs/e2e/present-chunk-hr.spec.ts', ms: 1500, count: 1, why: 'UNJUDGED — landed after this gate was written; the gate flagged it on rebase.' },
  {
    file: 'docs/e2e/site-chrome-first-paint.spec.ts', ms: 1500, count: 1,
    why: 'MEASUREMENT WINDOW (#1592), not a settle. Hydration itself is polled — Astro removes '
       + 'the `ssr` attribute from `<astro-island>` when the component mounts, so the case asks '
       + 'for that instead of guessing an interval. This dwell is what follows it: the defect '
       + 'was a CORRECTION PASS, so the sampler has to keep running for a beat after the moment '
       + 'that pass would have fired, and "no second value appeared" is an absence no poll '
       + 'expresses.',
  },
];

// Extensions Playwright's default testMatch admits. NOT `listSourceFiles`, which omits
// `.mts`/`.cts`/`.jsx` — widening that shared walker would change what other gates scan.
const E2E_EXTS = /\.(?:[cm]?[jt]sx?)$/;

function listE2EFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listE2EFiles(p, out);
    else if (E2E_EXTS.test(e.name)) out.push(p);
  }
  return out;
}

/**
 * Census of FIXED WAITS under an e2e directory, grouped by (file, argument).
 *
 * PARSED, not grepped, and deliberately so. Two hand-rolled attempts got this wrong in ways
 * that mattered: a `\d+`-only regex silently missed `waitForTimeout(SETTLE_STEP_MS)`, and a
 * hand-written comment/string blanker read the three backticks inside the regex literal
 * `/^\s*(```|~~~)/` (studio-preview-perf.spec.ts:72) as a template literal and swallowed the
 * rest of that file — hiding four real sleeps with the build green. A JS lexer written in
 * regex is a false-pass generator; the compiler already has one.
 *
 * THE CONTRACT:
 *  · comments and string/template literals cannot be miscounted — the parser never sees them
 *    as code, and a sleep quoted in prose is not a call expression;
 *  · the argument may be any expression; a non-numeric one is keyed by its TEXT
 *    (`SETTLE_STEP_MS`), so renaming a literal to a constant does not escape the ledger;
 *  · a sleep that is the ENTIRE body of a named function — `const f = … =>`, `function f()`,
 *    async or not, concise body or a single-statement block — counts once per REFERENCE to
 *    that name, recorded as `via`. Bodies that merely CONTAIN a sleep among other work are
 *    not helpers and count once, which is why `readHeaderSettled` counts 1;
 *  · an EXPORTED sleep helper is counted across every file in the directory;
 *  · NOT modelled, and therefore counted as one: runtime multiplicity (a sleep inside a
 *    loop). Tests pin that as a known limit.
 */
function e2eSleepCensus(dir) {
  let ts;
  try {
    ts = require('typescript');
  } catch {
    throw new Error('checkE2ESleeps needs the `typescript` devDependency to parse the e2e suite');
  }
  const files = listE2EFiles(dir);
  const parsed = files.map((f) => ({
    file: f,
    rel: path.relative(ROOT, f).replace(/\\/g, '/'),
    sf: ts.createSourceFile(f, fs.readFileSync(f, 'utf8'), ts.ScriptTarget.Latest, true),
  }));

  // FAIL LOUD ON A FILE WE COULD NOT PARSE. `createSourceFile` is error-TOLERANT: it recovers
  // from a syntax error and hands back a partial tree without throwing, so a malformed spec
  // silently contributes zero sleeps and the ledger shrinks with the build green. That is the
  // third time this census has been able to miss a real sleep quietly (a `\d+`-only regex, a
  // hand-rolled string blanker, and this), so the parse result is now checked rather than
  // trusted. A gate that cannot see a file must say so, not certify it.
  const unparsable = parsed.filter((x) => (x.sf.parseDiagnostics || []).length > 0);
  if (unparsable.length) {
    const names = unparsable.map((x) => x.rel).join(', ');
    throw new Error(
      `checkE2ESleeps could not parse ${unparsable.length} e2e file(s): ${names}. ` +
      'A parse failure makes the sleep census silently incomplete, so it is an error rather ' +
      'than a smaller inventory. Fix the syntax (or narrow E2E_EXTS if the file is not a spec).',
    );
  }

  const eachNode = (node, fn) => { fn(node); node.forEachChild((c) => eachNode(c, fn)); };

  /**
   * References to `name`, excluding its own declaration and import/export specifiers.
   *
   * `member` flips which side counts. A free helper is referenced bare (`settle(p)`), so a
   * `.settle` property access is somebody else's symbol and must NOT count. An object-property
   * or class-method helper is the opposite: every call site IS `h.settle(p)`, so excluding
   * property accesses reported 1 for a helper called N times — a `via` that implied call-site
   * counting which never happened.
   *
   * KNOWN LIMIT, shared by both modes: this is textual identifier matching with no scope or
   * import resolution, so a shadowed local of the same name, or a same-named symbol in a file
   * that never imports the helper, inflates the count. That direction fails LOUD (a drifted
   * count), which is why it is tolerated rather than solved with a type checker.
   */
  const refCount = (name, sf, member = false) => {
    let n = 0;
    eachNode(sf, (node) => {
      if (!ts.isIdentifier(node) || node.text !== name) return;
      const p = node.parent;
      if (!p) return;
      if ((ts.isVariableDeclaration(p) || ts.isFunctionDeclaration(p) || ts.isParameter(p)
        || ts.isPropertyAssignment(p) || ts.isMethodDeclaration(p)) && p.name === node) return;
      if (ts.isImportSpecifier(p) || ts.isExportSpecifier(p) || ts.isImportClause(p)) return;
      const isMemberRef = ts.isPropertyAccessExpression(p) && p.name === node;
      if (member ? !isMemberRef : isMemberRef) return;
      n++;
    });
    return n;
  };

  /** The named function whose ENTIRE body is this call, if any. */
  const sleepHelperFor = (call) => {
    let body = call.parent && ts.isAwaitExpression(call.parent) ? call.parent : call;
    // `(p) => (p.waitForTimeout(650))` is a concise body too; the ParenthesizedExpression broke
    // the identity check and silently reported 1 where the truth was N.
    while (body.parent && ts.isParenthesizedExpression(body.parent)) body = body.parent;
    const outer = body.parent;
    if (!outer) return null;
    let fnNode = null;
    if (ts.isArrowFunction(outer) && outer.body === body) fnNode = outer; // concise body
    else if ((ts.isExpressionStatement(outer) || ts.isReturnStatement(outer)) && outer.parent
      && ts.isBlock(outer.parent) && outer.parent.statements.length === 1) {
      const fn = outer.parent.parent;
      if (fn && (ts.isArrowFunction(fn) || ts.isFunctionDeclaration(fn) || ts.isFunctionExpression(fn)
        || ts.isMethodDeclaration(fn))) fnNode = fn;
    }
    if (!fnNode) return null;
    if (ts.isMethodDeclaration(fnNode) && ts.isIdentifier(fnNode.name)) {
      return { name: fnNode.name.text, exported: false, member: true };
    }
    if (ts.isFunctionDeclaration(fnNode) && fnNode.name) {
      return { name: fnNode.name.text, exported: !!fnNode.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) };
    }
    const decl = fnNode.parent;
    if (decl && ts.isPropertyAssignment(decl) && ts.isIdentifier(decl.name)) {
      return { name: decl.name.text, exported: false, member: true }; // `{ settle: (p) => … }`
    }
    if (decl && ts.isVariableDeclaration(decl) && ts.isIdentifier(decl.name)) {
      const stmt = decl.parent?.parent;
      return { name: decl.name.text, exported: !!(stmt && ts.canHaveModifiers(stmt) && ts.getModifiers(stmt)?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword)) };
    }
    return null;
  };

  const rows = new Map();
  for (const { rel, sf } of parsed) {
    eachNode(sf, (node) => {
      if (!ts.isCallExpression(node)) return;
      const callee = node.expression;
      // `page['waitForTimeout'](500)` is an ElementAccessExpression: neither a property access
      // nor a bare identifier. Omitting it was a TOTAL bypass — the call produced no row at all
      // and needed no sanction.
      const name = ts.isPropertyAccessExpression(callee) ? callee.name.text
        : ts.isIdentifier(callee) ? callee.text
        : ts.isElementAccessExpression(callee) && ts.isStringLiteralLike(callee.argumentExpression)
          ? callee.argumentExpression.text
          : null;
      if (name !== 'waitForTimeout') return;

      const arg = node.arguments[0];
      const numeric = arg && ts.isNumericLiteral(arg);
      const key = arg ? (numeric ? String(Number(arg.text.replace(/_/g, ''))) : arg.getText(sf).trim()) : '(none)';

      const helper = sleepHelperFor(node);
      let count = 1;
      let via;
      if (helper) {
        const scope = helper.exported ? parsed : parsed.filter((x) => x.sf === sf);
        // No -1: refCount already excludes the declaration's own name node.
        const refs = scope.reduce((a, x) => a + refCount(helper.name, x.sf, helper.member), 0);
        if (refs > 0) { count = refs; via = helper.name; }
      }

      const rowKey = `${rel}|${key}`;
      const cur = rows.get(rowKey) || { file: rel, ms: numeric ? Number(key) : key, count: 0, via: undefined };
      cur.count += count;
      if (via) cur.via = via;
      rows.set(rowKey, cur);
    });
  }
  return [...rows.values()].sort((a, b) => a.file.localeCompare(b.file) || String(a.ms).localeCompare(String(b.ms)));
}

/** `1200` reads as `1200ms`; a non-numeric argument reads as the expression it actually is. */
function fmtSleep(ms) {
  return typeof ms === 'number' ? `${ms}ms` : `\`${ms}\``;
}

function checkE2ESleeps(errors, e2eDir = path.join(ROOT, 'docs', 'e2e'), sanctions = SANCTIONED_E2E_SLEEPS) {
  const census = e2eSleepCensus(e2eDir);
  // NUL as the separator, not `|`: a sleep argument is arbitrary expression TEXT, so
  // `waitForTimeout(a || b)` puts pipes inside the key and a printable separator could both
  // collide and mangle the message on the way out.
  const keyOf = (file, ms) => `${file}\u0000${ms}`;

  // A duplicate (file, ms) pair would be last-wins in the lookup below AND both entries would
  // be marked seen — so the loser is neither enforced nor reported stale. Name it, building the
  // message from the entry's own fields rather than by unpicking the key.
  const firstSeen = new Map();
  for (const s of sanctions) {
    const k = keyOf(s.file, s.ms);
    if (firstSeen.has(k)) {
      errors.push(
        `duplicate SANCTIONED_E2E_SLEEPS entries for ${s.file} @ ${fmtSleep(s.ms)} — ` +
        'one silently shadows the other; merge them.',
      );
    } else {
      firstSeen.set(k, s);
    }
  }
  const listed = firstSeen;
  const seen = new Set();

  for (const row of census) {
    const key = keyOf(row.file, row.ms);
    const s = listed.get(key);
    if (!s) {
      seen.add(key);
      errors.push(
        `${row.file} has ${row.count} unsanctioned fixed wait(s) of ${fmtSleep(row.ms)} ` +
        `(the #1526 sweep, gated by #1575). A fixed sleep on the nightly suite is a bet a loaded box ` +
        `finishes inside a guessed interval — name the signal it waits for and poll it bounded, or ` +
        `if the expected outcome is "nothing changes" keep it and add an entry to ` +
        `SANCTIONED_E2E_SLEEPS in tools/check-ownership.js saying why.`,
      );
      continue;
    }
    seen.add(key);
    if (s.count !== row.count) {
      errors.push(
        `${row.file} now has ${row.count} fixed wait(s) of ${fmtSleep(row.ms)}, but SANCTIONED_E2E_SLEEPS ` +
        `records ${s.count}` + (row.via ? ` (counted at the call sites of \`${row.via}\`)` : '') +
        `. Judge the new one and update the entry — a drifting count is how 23 waits hid behind ` +
        `one helper while #1526 recorded the file as "14".`,
      );
    }
  }

  for (const s of sanctions) {
    if (!seen.has(keyOf(s.file, s.ms))) {
      errors.push(
        `stale e2e-sleep sanction in tools/check-ownership.js — ${s.file} no longer has a ` +
        `${fmtSleep(s.ms)} fixed wait (#1575). Remove the SANCTIONED_E2E_SLEEPS entry so the allowlist ` +
        `stays honest.`,
      );
    }
  }
}

// ── The preview's diagram SCOPE KEY invariant (#1332 step 3) ────────────────────
//
// `lib/core/diagram-scope.js` keys the preview's Mermaid palette on a section's CLASS
// LIST plus its inline style, so two sections agreeing on both share one resolved
// palette — that grouping is what keeps the cost at one build per band instead of one
// per slide. It is sound only while every declaration of a diagram token comes from
// `:root` or a `section` + class compound. A token declared from a POSITIONAL selector
// (`section:nth-of-type(3)`), an ATTRIBUTE selector, `:has()`, or a container query
// would let two same-classed sections resolve differently and share a key anyway — and
// the failure mode is one slide reading another slide's ink, which is the #1326 bug.
//
// That invariant used to live in a comment saying "no theme does this". This gates it,
// because the codebase already declares custom properties from attribute selectors on
// sections (`section[data-orientation=portrait]`, `section.form[data-family=tall]`, …)
// — none of them a diagram token today, so the idiom is one edit away from the hazard.
//
// Scope: the TRANSITIVE closure of every token `diagramThemeTokens()` reads — a token
// that feeds a diagram token through `var()` sets it just as effectively.
// `:root`, or `section` plus any number of CLASS qualifiers — including a functional
// pseudo-class whose own argument is class-only (`section.dark:not(.print)`, which every
// texture pin uses and which the class-list scope key covers exactly). What is REJECTED
// is a qualifier the key cannot see: a positional pseudo-class, an attribute selector, a
// `:has()`, or a descendant/sibling combinator.
// A REPEATED `:root` is admitted, because it cannot vary per slide — the axis THIS check
// guards. It matches the same single element and carries no qualifier the class-list key
// can miss, so two same-classed slides can never resolve different palettes through it.
//
// It is NOT merely a specificity bump, and an earlier version of this comment said it was.
// `lib/engine/css.js` packs a theme the way Marpit does, rewriting a `:root` that follows a
// combinator; the SECOND `:root` in `:root:root` follows neither, so it survives literally
// onto the `<section>` — where `:root` cannot match. The doubled form is therefore INERT on
// the engine and export-to-Marp paths and live only on the unpacked CLI export path.
// `engineering/gotchas/marp.md` documents the same class for `:root[…]`.
//
// It is admitted here on the per-slide axis alone, and it is not a form anything should be
// WRITING any more: since #1527 flipped the export concat, plain `:root` wins there too, and
// `checkPackedRootReach` above fails a theme token declared only above plain `:root` (that
// inertness was a live 1.00:1 defect, #1797). This check is the wrong place to enforce that
// — rejecting the shape outright would forbid a selector that is merely useless rather than
// per-slide-variant, which is not the trade this check is about. The rejected shapes are
// unchanged: positional pseudo-class, attribute selector, `:has()`, descendant / sibling
// combinator.
const CLASS_OR_CLASS_ONLY_PSEUDO = String.raw`(?:\.[\w-]+|:(?:not|is|where)\((?:\s*\.[\w-]+\s*,?)+\))`;
const DIAGRAM_SCOPE_SAFE_SELECTOR = new RegExp(`^(?:(?::root)+|section${CLASS_OR_CLASS_ONLY_PSEUDO}*)$`);

function diagramTokenClosure() {
  const { diagramThemeTokens } = require('../lib/core/mermaid-theme-map');
  // SOURCES, not just the built bundle: `dist/lattice.css` is generated, so scanning it
  // alone lets a violation in `lib/**.css` pass on a stale tree. The bundle is kept in the
  // list because it also carries the base-layer defaults the closure walks through.
  const files = [path.join(ROOT, 'dist', 'lattice.css')];
  const cssDirs = [path.join(ROOT, 'themes'), path.join(ROOT, 'lib')];
  const collect = (dir) => {
    if (!fs.existsSync(dir)) return;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.name === 'node_modules' || e.name === 'dist') continue;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) collect(p);
      else if (e.name.endsWith('.css')) files.push(p);
    }
  };
  for (const d of cssDirs) collect(d);
  const sources = files.filter((f) => fs.existsSync(f)).map((f) => ({ f, css: stripComments(fs.readFileSync(f, 'utf8')) }));
  // token -> every token named by a var() inside any of its declared values.
  const feeds = new Map();
  for (const { css } of sources) {
    for (const m of css.matchAll(/--([\w-]+)\s*:\s*([^;{}]+)/g)) {
      const deps = [...m[2].matchAll(/var\(\s*--([\w-]+)/g)].map((d) => d[1]);
      if (!feeds.has(m[1])) feeds.set(m[1], new Set());
      for (const d of deps) feeds.get(m[1]).add(d);
    }
  }
  const closure = new Set(diagramThemeTokens());
  const queue = [...closure];
  while (queue.length) {
    for (const dep of feeds.get(queue.pop()) || []) {
      if (!closure.has(dep)) { closure.add(dep); queue.push(dep); }
    }
  }
  return { closure, sources };
}

function checkDiagramScopeSelectors(errors) {
  let closure;
  let sources;
  try {
    ({ closure, sources } = diagramTokenClosure());
  } catch (e) {
    errors.push(`checkDiagramScopeSelectors could not build the diagram token closure: ${e.message}`);
    return;
  }
  for (const { f, css } of sources) {
    const rel = path.relative(ROOT, f);
    for (const rule of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      const declared = [...rule[2].matchAll(/--([\w-]+)\s*:/g)].map((m) => m[1]).filter((t) => closure.has(t));
      if (!declared.length) continue;
      // Drop anything up to the last at-statement terminator: a prelude captured by the
      // brace regex can trail an `@import 'a11y-base';` from the line above it.
      const prelude = rule[1].replace(/^[\s\S]*;/, '');
      if (prelude.trim().startsWith('@')) continue; // an at-rule prelude, not a selector
      for (const sel of prelude.split(',').map((x) => x.trim().replace(/\s+/g, ' ')).filter(Boolean)) {
        if (DIAGRAM_SCOPE_SAFE_SELECTOR.test(sel)) continue;
        errors.push(
          `${rel} declares diagram token(s) ${declared.map((t) => `--${t}`).join(', ')} from the selector ` +
          `"${sel}", which is not \`:root\` or a \`section\` + class compound. The preview keys its ` +
          `Mermaid palette on a section's CLASS LIST (lib/core/diagram-scope.js, #1332 step 3), so a token ` +
          `set by a positional / attribute / :has() / container selector lets two same-classed slides ` +
          `resolve DIFFERENT palettes and still share one — i.e. one slide renders with another slide's ` +
          `baked ink (#1326). Move the declaration onto a class compound, or change the scope key to ` +
          `cover this axis.`,
        );
      }
    }
  }
}

// ── #1358 — a class-attribute regex must carry a LEFT BOUNDARY ───────────────
//
// A Lattice `<section>` carries BOTH attributes, in this order:
//
//   <section id="1" data-class="content" class="content no-note form" …>
//
// `data-class` is the RAW `_class:` directive payload (mirrored from marp-core);
// `class` is the RESOLVED list, with the deck-wide `class:` register, `form`, the
// default component, `finish-*` and `mode-*` merged in. A bare `/class="([^"]*)"/`
// matches LEFTMOST — so it reads the raw payload, and every token the engine added
// is invisible. It fails in the worst direction: a plausible class list that renders,
// on exactly the slides that name their own `_class:`.
//
// That shipped twice before anyone noticed (#1358): below-note promoted a trailing
// paragraph on `class: no-note` + `_class: content`, and `wrapImageText` skipped the
// `.image-text` panel on `class: image` + `_class: dark` — the second a silent
// divergence from the DOM path, which reads `className` and is right for free.
// The fix is one shared reader (`readClassAttr`, lib/core/section-walk.js); this gate
// is what stops the idiom growing back.
//
// KEYED ON AN UNAMBIGUOUS REGEX SHAPE, not on the string `class="`: the trigger is a
// `class` attribute match followed by a CAPTURE CONSTRUCT (an optional group opener, then a
// character class or `.`, then a quantifier). That is a pattern and never literal markup, so
// the hundreds of `<div class="…">` template strings in this repo cannot false-positive.
//
// The trigger and the guard set below are BOTH wider than the first cut, which an adversarial
// review walked straight through. It missed `[^"]+` (one character), `(.*?)`, `([\w -]*)`, and
// the `class\s*=\s*"` spelling that `lib/transformers/pill-tag.js` actually ships; and it
// ACCEPTED `\s*class=` / `\s?class=` — zero-width quantifiers, i.e. no guard at all, and the
// single likeliest thing to write after being told "add a leading `\s`" — while REJECTING
// `(?:^|\s)class=` and `(?<!-)class=`, both strictly correct. A ratchet that passes the bug
// and blocks the fix is worse than no ratchet, because the decision doc cites its existence
// as the reason the idiom cannot grow back.
//
// COVERAGE BOUNDARY, stated plainly, in two parts.
//   SPELLING: this catches regex reads. `split('class="')`, a `new RegExp` built from a
//   VARIABLE, and a DOM `getAttribute` are all out of reach.
//   SCOPE: `lib`, `docs/src`, `docs/scripts`, `tools` and the root emulator, at
//   `.js/.ts/.tsx/.mjs/.cjs/.astro`. `test/**` is excluded (tests assert payloads, not render
//   behavior) and so is generated `dist/**`.
// The load-bearing guarantee is `readClassAttr` being the one reader; this is the ratchet
// that keeps new code pointed at it.
const CLASS_ATTR_REGEX = /class(?:\\?s\*)?=(?:\\?s\*)?"(?:\((?:\?:)?)?(?:\[[^\]]*\]|\.)[*+?]/g;
// A guard is anything that pins the match to a real attribute BOUNDARY. `\b` is NOT one —
// the `-`→`c` transition inside `data-class` is a word boundary, which is the whole trap.
// Written to survive a regex LITERAL (`\s`) and a `new RegExp` template (`\\s`) alike:
//   • a whitespace atom, optionally `+` — but NEVER `*` or `?`, which are zero-width and
//     therefore not guards at all;
//   • a character class containing one, same quantifier rule;
//   • an alternation that pins start-of-string or whitespace — `(?:^|\s)`, `(^|\s)`,
//     `(?:\s|^)` — which is the STRICTEST correct form, since it also handles a bare
//     attribute string;
//   • a negative lookbehind that excludes `-`, in any spelling: `(?<!-)`, `(?<![-\w])`,
//     `(?<![\w-])`;
//   • a literal trailing `-`, i.e. the pattern deliberately targets `data-class` or some
//     other `*-class` attribute.
const CLASS_ATTR_GUARD = new RegExp(`(?:${[
  '\\\\{1,2}s\\+?',
  '\\[[^\\]]*\\\\{1,2}s[^\\]]*\\]\\+?',
  '\\((?:\\?:)?(?:\\^\\|\\\\{1,2}s|\\\\{1,2}s\\|\\^)\\)',
  '\\(\\?<!(?:-|\\[[^\\]]*-[^\\]]*\\])\\)',
  '-',
].map((a) => `(?:${a})`).join('|')})$`);
// Files that legitimately keep an unguarded form, with the reason. Empty today, and
// the gate fails on a STALE entry so it cannot rot into a blanket exemption.
const SANCTIONED_CLASS_ATTR_READS = [];

// ── Front-matter scalar readers ───────────────────────────────────────────────
//
// A front-matter VALUE is cleaned in exactly one place: `frontMatterScalar`
// (lib/core/front-matter-key.js). The idiom below — strip a leading quote, strip a
// trailing quote — is what a hand-rolled reader looks like, and every copy of it was a
// reader that answered differently from the engine. The one that shipped:
// `theme: cuoio  # brand` kept the comment as part of the palette name, so the deck
// silently fell back to the default while Export-to-Marp (real YAML) rendered cuoio.
// Two decks from one source, which is #1416's whole failure class.
//
// Deliberately keyed on the CLEANING idiom, not on "a regex mentioning a key name":
// the latter cannot be told apart from the dozens of legitimate `^key:` matchers that
// only need to LOCATE a line (`paceLine`, `deckClassRefusals*`, the linter's finders).
// Locating a line is fine. Deciding what its value MEANS is what must be shared.
const FM_SCALAR_IDIOM = /\.replace\(\s*\/\^\['"\]\/\s*,\s*''\s*\)/g;
// The SECOND shape, and the one that actually shipped the defect: a front-matter key/value
// pattern that captures the value and anchors to `$`. Eleven `resolve-*` kernels carried it
// (`/^[ \t]*finish:[ \t]*["']?([A-Za-z0-9_-]+)["']?[ \t]*$/m`). The anchor is the bug — a
// trailing YAML comment makes the WHOLE pattern fail, so the register silently resolves to
// nothing while the engine's own parse reads the value fine. Gated separately from the
// cleaning idiom because a kernel can carry this one without carrying that one, which is
// exactly how eleven of them passed a gate written only for the first shape.
const FM_ANCHORED_VALUE = /\/\^\[ \\t\]\*[A-Za-z-]+:\[ \\t\]\*\[["'\\]*\]\?\(\[[^\]]+\]\+\)/g;
// The reader that OWNS the rule, plus mirrors that cannot import it, each with a reason.
// The gate fails on a STALE entry too, so a mirror that gets routed through the shared
// rule cannot leave its exemption behind to cover the next hand-rolled one.
const SANCTIONED_FM_SCALAR_READERS = [
  {
    file: 'lib/core/front-matter-key.js',
    why: 'defines frontMatterScalar — this IS the shared rule',
  },
  {
    file: 'lib/core/resolve-pace.mjs',
    why:
      'ESM the docs site imports directly; Rollup will not resolve named exports off a CJS '
      + 'file outside its root, so requiring front-matter-key.js fails `astro build` while '
      + 'passing vitest and tsc. Sync-gated instead by `front-matter-scalar-parity` in '
      + 'test/unit/core/pace-names.test.js, which drives both over the same shapes.',
  },
  {
    file: 'lib/core/glossary-auto.mjs',
    why:
      'Same ESM/Rollup constraint as resolve-pace.mjs — the docs site imports it directly '
      + 'in render-engine.ts. Mirrors the rule inline and is covered by the same '
      + '`front-matter-scalar-parity` test.',
  },
];

function checkFrontMatterReaders(errors) {
  const sanctioned = new Map(SANCTIONED_FM_SCALAR_READERS.map((s) => [s.file, s]));
  const seen = new Set();
  const roots = [
    path.join(ROOT, 'lib'),
    path.join(ROOT, 'docs', 'src'),
    path.join(ROOT, 'docs', 'scripts'),
    path.join(ROOT, 'tools'),
  ];
  const files = [
    ...roots.flatMap((d) => listClassAttrFiles(d)),
    ...[path.join(ROOT, 'lattice-emulator.js')].filter((f) => fs.existsSync(f)),
  ];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    // Tests assert the rule's OUTPUT (and one deliberately writes the idiom down to prove
    // the mirror matches), so they are not readers in the sense this gate polices.
    if (/\.test\.(?:[tj]sx?|mjs|cjs)$/.test(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const spans = commentSpans(src);
    const inProse = (i) => spans.some(([a, b]) => i >= a && i < b); // prose may name the pattern
    let flagged = false;
    for (const [re, what, fix] of [
      [FM_SCALAR_IDIOM, 'hand-rolls a front-matter scalar (strip-leading-quote / strip-trailing-quote)',
        '`frontMatterScalar`'],
      [FM_ANCHORED_VALUE, 'reads a front-matter value with a `$`-anchored pattern, so a trailing YAML comment makes the whole match fail',
        '`frontMatterValue` / `frontMatterName`'],
    ]) {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) {
        if (inProse(m.index)) continue;
        seen.add(rel);
        if (sanctioned.has(rel)) { flagged = true; break; }
        errors.push(
          `${rel}:${src.slice(0, m.index).split('\n').length} ${what}. That is how a reader ends `
          + `up disagreeing with the engine — \`theme: cuoio  # brand\` resolved to no known `
          + `palette on the CLI/export path while the engine's own parse read \`cuoio\`. Read it `
          + `with ${fix} (lib/core/front-matter-key.js), or add this file to `
          + `SANCTIONED_FM_SCALAR_READERS in tools/check-ownership.js with the reason it cannot.`,
        );
        flagged = true;
        break;
      }
      if (flagged) break;
    }
  }
  for (const s of SANCTIONED_FM_SCALAR_READERS) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale front-matter-reader sanction in tools/check-ownership.js — ${s.file} no longer `
        + `hand-rolls a front-matter scalar. Remove the SANCTIONED_FM_SCALAR_READERS entry so `
        + `the allowlist cannot rot into a blanket exemption.`,
      );
    }
  }
}

// ── The LF ingest-boundary list is a GATE, not a comment (#1349 → #1357 → #1388, #1524) ──
//
// A Windows-authored deck exported in the WRONG PALETTE because ONE front-matter reader of
// ~55 lacked a `\r?`. The repair was not "add `\r?` to that reader" — fifty-odd readers each
// independently remembering it is a design that guarantees the next one forgets. Author text
// is made canonical at an INGEST instead: LF endings, no leading BOM, so no reader downstream
// has to care (`engineering/decisions/2026-08-04-line-endings-lf-boundaries.md`).
//
// WHAT THAT TRADE ACTUALLY BUYS, and why this file has to police it. Centralizing converts N
// redundant partial guarantees into ONE guarantee plus a list that must stay true — so the
// value of the whole design is exactly the accuracy of the boundary list. That list rotted
// TWICE inside #1357 itself (`.gitattributes` said "two others" when there were six; the
// shared helper claimed to be "the ONE function in docs/src" while `deck-source.ts` had been
// doing byte-identical work since #1170), and both times a human caught it, not a machine.
//
// Then it rotted a third time, in the way that matters most: the note's `## What shipped`
// section said this gate existed. It did not. Nine places cited `checkLineEndingBoundaries` /
// `SANCTIONED_EOL_BOUNDARIES` as shipped and load-bearing — CLAUDE.md's doc-index row that
// tells every agent what to do when adding a markdown ingest, `.gitattributes`, the changelog
// and four source comments — while `build:check` ran nothing, because there was nothing to
// run. #1388 (`export-marp` is an unlisted boundary: a BOM'd deck exports in the wrong
// palette) is #1349 recurring one file over, and it reasoned that "the gate cannot see it"
// because the file was missing from the list. The real reason was that the list was fiction.
// #1524 is that finding; this is the gate.
//
// A `## What shipped` heading is a claim, and nothing in the tree checks it.
//
// THE SIX ARMS. Each one is a way the list can become a lie, and each has been watched fail:
//   1. a listed boundary that STOPPED normalizing (the guarantee silently withdrawn);
//   2. a listed boundary whose FILE IS GONE — a stale entry, so the list cannot rot;
//   3. a listed boundary whose normalization COUNT moved, where the count is load-bearing
//      (the engine has two public doors, and #1357 measured what happens when only one of
//      them normalizes: `geometry()` reported 1280x720 while `render()` used 960x720 on the
//      same lone-CR deck — a host fit-scaling against a box the render does not use);
//   4. an UNLISTED normalizer — a second implementation of the fold outside the list, which
//      is precisely what makes the list untrustworthy rather than merely incomplete. This arm
//      is what found `lib/core/boundary-parser.mjs`, a tenth boundary nobody had written down;
//   5. `\r?\n` used to NORMALIZE where a boundary needs `\r\n?`. The first covers Windows CRLF
//      *and* classic-Mac lone CR at identical cost; a reader-style `\r?\n` structurally cannot
//      match a lone CR, because there is no `\n` to anchor on. Not academic: a lone-CR deck
//      mis-SPLIT into slides, so it produced a different page count, not just a palette.
//   6. an ingest that never normalizes AT ALL — a `utf8` read whose front-matter anchor is
//      `^---` followed by a literal newline. Arms 1-5 all key on a fold that EXISTS, so none
//      of them can fail on the shape the whole policy was built for: #1349 and #1388 were both
//      readers with NO fold. An independent checker ran that probe against this gate and found
//      it green over `tools/export-chart-svg.js`, a user-facing CLI reading an author's deck
//      raw. See the arm's own block below for why it is narrow.
//
// Arm 4 keys on the RAW fold idiom, never on a call to the shared helper — delegating to
// `normalizeSourceText` is the behavior this design wants, so flagging its callers would
// punish the right answer. A file that folds line endings for some purpose OTHER than making
// an ingest canonical belongs in SANCTIONED_EOL_NON_BOUNDARIES with its reason, and that list
// is stale-checked too.

// `.replace(/\r\n?/g, …)` — the canonical fold. Matched as source text, so the pattern below
// is doubly escaped: `\\r` here is the two characters a backslash-r occupies in the file.
//
// WIDER THAN THE ONE SPELLING THE TREE HAPPENS TO USE, deliberately, because this pattern does
// two jobs that pull in opposite directions: arm 4 uses it to FIND folds (too narrow = a real
// second normalizer slips past) and arm 1 uses it to CONFIRM one (too narrow = a listed
// boundary that switched to an equivalent spelling is reported as having stopped normalizing,
// which blocks a PR on correct code). `replaceAll` is the one a maker reaches for without
// thinking; `split(/\r\n?/).join('\n')` is the same fold written as a partition.
const EOL_FOLD_IDIOM = /(?:\.replace(?:All)?\(\s*\/\\r\\n\?\/[gimsuy]*\s*,|\.split\(\s*\/\\r\\n\?\/[gimsuy]*\s*\))/g;
// `.replace(/^\uFEFF/, …)` — the BOM strip that rides with it. A BOM is what Notepad,
// PowerShell `>` and Visual Studio emit ALONGSIDE CRLF, and it defeats the same `^---` anchor:
// a BOM'd deck declaring `theme: cuoio` exported in `indaco`, lost its `size:`, and rendered
// its own front matter as a visible extra slide. It also diverged BY PATH — `Blob.text()`
// strips a BOM during the UTF-8 decode, `fs.readFileSync(p, 'utf8')` does not — so the same
// file rendered correctly in the Studio and wrong through the CLI.
// Both spellings count: the literal BOM character (what the first eight boundaries carry) and
// the `\\uFEFF` escape. The literal is house style but it is an INVISIBLE character in the
// source, so an editor or a careless paste can drop it and leave the line looking identical —
// the escape is the legible form and this gate will not punish a boundary for choosing it.
const EOL_BOM_STRIP = /\.replace\(\s*\/\^(?:\uFEFF|\\uFEFF)\/\s*,/g;
// A fold in the WRONG DIRECTION, used as a normalization: `\r?\n` or `\r\n` where a boundary
// needs `\r\n?`. BOTH are caught, and the second is the one that was missed first: `\r\n`
// carries the identical defect — no `\n` to anchor a lone CR on — while looking nothing like
// the spelling the rule names, and four live sites were folding that way, unlisted and silent
// (`tier-filter.js`, the two index builders, `changelog.js`).
//
// Deliberately narrow in the other axis: it requires the replacement to be a bare newline, so a
// reader's `\r?\n` inside a front-matter pattern (`/^---\r?\n/`) and an escaper that folds
// newlines into a `\n` LITERAL (`contact.transform.js`'s vCard writer) are both left alone.
// Only a fold that claims to canonicalize is caught.
const EOL_WRONG_FOLD = /\.replace(?:All)?\(\s*\/(?:\\r\?\\n|\\r\\n)\/[gimsuy]*\s*,\s*(['"`])\\n\1/g;

// Arm 6's two halves. `EOL_UTF8_READ` is any `utf8` text read; `EOL_STRICT_FM_ANCHOR` is a
// front-matter anchor followed by a LITERAL newline and nothing else — `/^---\n/`,
// `startsWith('---\n')`. That narrowness is the whole design of this arm.
//
// The first cut matched any `/^---` not followed by `\r`, and it was WRONG in a way worth
// keeping written down: it fired on four SLIDE-SEPARATOR splits (`/^---\s*$/m`,
// `/^---[ \t]*$/gm`) over repo-committed gallery decks. Those are not the #1349 shape at all —
// `\s` matches `\r`, and `$` under `/m` matches before a CRLF too, so both already tolerate the
// endings this rule is about. Flagging them would have taught the next reader that the arm is
// noise. What #1349 actually was is an anchor that admits exactly one byte after the fence.
const EOL_UTF8_READ = /readFileSync\s*\([^)]*['"]utf-?8['"]|\.text\(\)|readFile\s*\([^)]*['"]utf-?8['"]/;
const EOL_STRICT_FM_ANCHOR = /\/\^---\\n|startsWith\(\s*['"`]---\\n/g;

const EOL_BOUNDARY_ROOTS = ['lib', 'tools', 'docs/src', 'docs/scripts'];
const EOL_BOUNDARY_FILES = ['lattice-emulator.js'];

/**
 * The authoritative boundary list. `expect` defaults to the full ingest idiom — BOM strip AND
 * `\r\n?` fold — because a boundary owes both; `.gitattributes` is not JavaScript and declares
 * its own. `count` is optional and pins how many normalization sites the file must carry, for
 * the files where more than one is load-bearing.
 */
const SANCTIONED_EOL_BOUNDARIES = [
  {
    file: '.gitattributes',
    expect: /^\*\s+text=auto\s+eol=lf\s*$/m,
    why: 'the GIT boundary. `text=auto eol=lf` pins the working tree, so a Windows clone checks '
       + 'out LF and cannot commit CRLF back. Everything below is a RUNTIME boundary; this one '
       + 'is why the tree itself stays clean.',
  },
  {
    file: 'lib/engine/index.js',
    count: 2,
    why: 'render() AND geometry() — the engine\'s two public doors. Both parse front matter, so '
       + 'both must agree; #1357 measured the divergence when only render() normalized. The '
       + 'count is pinned because a door added later would inherit the old bug silently.',
  },
  {
    file: 'lattice-emulator.js',
    why: 'readFileOrDie — the CLI\'s only door for author text, and the one that actually fixes '
       + '#1349. The emulator calls resolve-palette on raw file text OUTSIDE the engine\'s '
       + 'render(), so nothing downstream could rescue it.',
  },
  {
    file: 'tools/lint-deck.js',
    why: 'the file read. Without it a Windows author got DIFFERENT LINT ADVICE for identical '
       + 'content — the lint is a reader like any other.',
  },
  {
    file: 'tools/export-marp.js',
    why: 'the deck read in exportMarp(). #1388: this ingest was never normalized, so a BOM\'d or '
       + 'CRLF deck exported to a Marp bundle in the wrong palette — #1349 recurring one file '
       + 'over, at the ninth ingest, because the gate that was supposed to catch it did not exist.',
  },
  {
    file: 'tools/export-chart-svg.js',
    why: 'the deck read in main(). The TENTH ingest, and the one that proves arm 6 earns its '
       + 'place: it had no fold for the other five arms to inspect, so it was invisible to them '
       + 'while `frontmatterTheme` anchored on `/^---\\n/` — stricter than the reader #1349 was '
       + 'about. A BOM\'d or Windows-saved `theme: cuoio` deck exported every chart SVG in the '
       + 'default palette.',
  },
  {
    file: 'lib/core/resolve-palette.js',
    why: 'normalizes its own input rather than growing another `\\r?`. Belt-and-braces now that '
       + 'the read boundaries normalize, and kept because this is the reader #1349 was actually '
       + 'about — a `\\r?\\n` pattern here is what the whole policy exists to make unnecessary.',
  },
  {
    file: 'lib/core/boundary-parser.mjs',
    why: 'normalizeSource() — the boundary path\'s door. Found by arm 4 while writing this gate: '
       + 'a TENTH boundary that no prose list named. Spelled identically to the engine\'s line '
       + 'rather than imported, because the dependency runs lib/engine -> lib/core; '
       + 'test/unit/core/boundary-parser.test.js pins the two spellings together.',
  },
  {
    file: 'docs/src/lib/normalize-source-text.ts',
    why: 'the shared `docs/src` helper — the ONE raw implementation in the docs site. Every other '
       + 'docs/src ingest (StudioShell\'s file open, studio-store\'s session merge, '
       + 'asset-bundle\'s zip read, compose/deck-source) DELEGATES to it, which is why those are '
       + 'not listed here: arm 4 flags a second implementation, never a caller of the first.',
  },
  {
    file: 'docs/src/components/studio/ai/architect-edits.js',
    why: 'parseEdits — a model reply is external input and models emit CRLF. Carries the pattern '
       + 'inline rather than importing the helper: this is plain JS loaded directly by '
       + '`node --test`, so it cannot import a `.ts` file.',
  },
  {
    file: 'lib/exemplars/tier-filter.js',
    why: 'splitDeck() — takes deck source and decides whether it HAS front matter by testing '
       + '`^---`, so a BOM defeats that anchor exactly as a CRLF does and the whole frontmatter '
       + 'block reads as body. Found by arm 5 (it was folding `\\r\\n`, which cannot match a '
       + 'lone CR) and had no BOM strip at all.',
  },
  {
    file: 'lib/layout/ai.js',
    why: 'coerceComponent — a generated component skeleton is markdown spliced into deck source, '
       + 'so a trailing `\\r` arrives as part of a card title.',
  },
];

/**
 * Folds that are NOT ingest boundaries. Recorded rather than ignored, so arm 4 stays a real
 * question ("is this a boundary?") instead of a blanket exemption. Stale entries fail.
 */
const SANCTIONED_EOL_NON_BOUNDARIES = [
  {
    file: 'tools/build-decisions-index.js',
    why: 'reads REPO-COMMITTED notes, not author text. `.gitattributes` (`* text=auto eol=lf`, '
       + 'the first boundary in the list above) already guarantees LF in the working tree on '
       + 'every platform, so this fold is tolerance for a locally CRLF-saved note and nothing '
       + 'downstream of it decides a palette or a slide count. A BOM here breaks the index build '
       + 'loudly rather than producing a silently wrong artifact.',
  },
  {
    file: 'tools/build-gotchas-index.js',
    why: 'same shape as the decisions index above — repo-committed markdown behind '
       + '`.gitattributes`, folded for tolerance rather than to make author text canonical.',
  },
  {
    file: 'lib/authoring/notes-core.js',
    why: 'a COMPARISON fold, not an ingest. stripNotesFromSource matches note bodies that came '
       + 'back from RENDERED slide HTML (where markdown-it already normalized) against raw '
       + 'source text; the fold canonicalizes the CANDIDATE for that one comparison and the '
       + 'source itself flows on untouched. It strips no BOM for the same reason — there is no '
       + 'document here whose front matter could be defeated.',
  },
];

function checkLineEndingBoundaries(
  errors,
  sanctions = SANCTIONED_EOL_BOUNDARIES,
  exempt = SANCTIONED_EOL_NON_BOUNDARIES,
  root = ROOT,
) {
  const countMatches = (src, re) => {
    re.lastIndex = 0;
    let n = 0;
    while (re.exec(src)) n += 1;
    return n;
  };

  // ── Arms 1–3: every listed boundary still normalizes, still exists, still counts ──
  for (const s of sanctions) {
    const abs = path.join(root, s.file);
    if (!fs.existsSync(abs)) {
      errors.push(
        `stale line-ending sanction in tools/check-ownership.js — ${s.file} no longer exists. `
        + `Remove the SANCTIONED_EOL_BOUNDARIES entry so the boundary list stays honest; a list `
        + `that names a file nobody ships is how the last one rotted `
        + `(engineering/decisions/2026-08-04-line-endings-lf-boundaries.md).`,
      );
      continue;
    }
    const src = fs.readFileSync(abs, 'utf8');
    if (s.expect) {
      // A `/g` here would carry `lastIndex` between calls — this function runs once per
      // `build:check` AND four times per test file in the same process, so the second call
      // would resume mid-file and report a boundary as broken at random.
      if (s.expect.global || s.expect.sticky) {
        errors.push(
          `SANCTIONED_EOL_BOUNDARIES entry for ${s.file} declares a stateful \`expect\` regex `
          + `(\`g\`/\`y\` flag). Drop the flag — .test() on a global regex advances lastIndex, so `
          + `repeat calls in one process would report this boundary as broken at random.`,
        );
        continue;
      }
      if (!s.expect.test(src)) {
        errors.push(
          `${s.file} is a sanctioned line-ending boundary but no longer matches its declared `
          + `normalization (${s.expect}). Restore it or remove the SANCTIONED_EOL_BOUNDARIES entry.`,
        );
      }
      continue;
    }
    const folds = countMatches(src, EOL_FOLD_IDIOM);
    const boms = countMatches(src, EOL_BOM_STRIP);
    if (folds === 0 || boms === 0) {
      errors.push(
        `${s.file} is a sanctioned line-ending boundary but no longer normalizes author text `
        + `(fold sites: ${folds}, BOM strips: ${boms}; both must be nonzero). An ingest owes BOTH `
        + `\`.replace(/^\\uFEFF/, '')\` and \`.replace(/\\r\\n?/g, '\\n')\` — a BOM defeats the `
        + `\`^---\` front-matter anchor exactly like a CRLF does, and it is worse: it also diverges `
        + `BY PATH, because Blob.text() strips one during the UTF-8 decode and fs.readFileSync does `
        + `not. Restore the normalization, or remove the entry if this stopped being an ingest.`,
      );
      continue;
    }
    // BOTH halves are pinned, not just the fold. Pinning only the fold left the exact hole the
    // count exists to close, one channel over: a refactor could drop `render()`'s BOM strip while
    // `geometry()` kept its own, and the gate stayed green on 2 folds + 1 BOM strip. The BOM is
    // the half this file's own comment calls the worse one, because it also diverges BY PATH.
    for (const [what, got] of [['fold', folds], ['BOM-strip', boms]]) {
      if (s.count != null && got !== s.count) {
        errors.push(
          `${s.file} declares ${s.count} line-ending normalization site(s) in `
          + `SANCTIONED_EOL_BOUNDARIES but carries ${got} ${what}(s). The count is pinned because `
          + `this file has more than one door and they must agree — normalizing only one of the `
          + `engine's two public doors made geometry() report 1280x720 while render() used `
          + `960x720 on the same lone-CR deck (#1357). Normalize the new door too, or update the `
          + `count with the reason.`,
        );
      }
    }
  }

  // ── Arms 4–5: nothing folds line endings outside the list, and nobody folds it backwards ──
  const listed = new Set(sanctions.map((s) => s.file));
  const excused = new Map(exempt.map((e) => [e.file, e]));
  const seenExempt = new Set();
  const files = [
    ...EOL_BOUNDARY_ROOTS.flatMap((d) => listClassAttrFiles(path.join(root, d))),
    ...EOL_BOUNDARY_FILES.map((f) => path.join(root, f)).filter((f) => fs.existsSync(f)),
  ];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    // Tests assert the rule's OUTPUT and one deliberately writes both spellings down to prove
    // they differ, so they are not boundaries in the sense this gate polices. Generated bundles
    // inline their sources' folds and are regenerated from them, never hand-edited (#2).
    if (/\.test\.(?:[tj]sx?|mjs|cjs)$/.test(rel) || /\.generated\.[a-z]+$/.test(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    const spans = commentSpans(src);
    const inProse = (i) => spans.some(([a, b]) => i >= a && i < b); // prose may name the pattern
    const lineOf = (i) => src.slice(0, i).split('\n').length;
    const firstLive = (re) => {
      re.lastIndex = 0;
      let m;
      while ((m = re.exec(src))) if (!inProse(m.index)) return m.index;
      return -1;
    };

    // A file both lists excuse is answered ONCE, before any arm runs. The first cut ran arm 5
    // ahead of this and never consulted `excused` at all, so a legitimate comparison-fold
    // written `\r?\n` red-lit `build:check` for everyone with NO legal remedy: listing it as a
    // non-boundary added a bogus stale-sanction error on top, and the fix its message implied
    // (switch to `\r\n?`) simply moved the failure to arm 4. A gate a maker cannot satisfy is
    // worse than no gate, because the only way past it is to edit the gate.
    if (excused.has(rel)) {
      if (firstLive(EOL_FOLD_IDIOM) !== -1 || firstLive(EOL_WRONG_FOLD) !== -1) seenExempt.add(rel);
      continue;
    }

    EOL_WRONG_FOLD.lastIndex = 0;
    let w;
    while ((w = EOL_WRONG_FOLD.exec(src))) {
      if (inProse(w.index)) continue;
      errors.push(
        `${rel}:${lineOf(w.index)} normalizes line endings with a pattern that cannot match a `
        + `lone CR (\`\\r?\\n\` or \`\\r\\n\`) where a boundary needs \`\\r\\n?\`. The last covers `
        + `Windows CRLF AND classic-Mac lone CR at identical cost; the other two structurally `
        + `CANNOT match a lone CR, because there is no \`\\n\` to anchor on. A lone-CR deck `
        + `mis-SPLIT into slides — a different page count, not just a different palette. Spell it `
        + `\`\\r\\n?\`, then declare the site: SANCTIONED_EOL_BOUNDARIES if it is a markdown `
        + `ingest (strip the BOM too), SANCTIONED_EOL_NON_BOUNDARIES with its reason if it is not `
        + `(engineering/decisions/2026-08-04-line-endings-lf-boundaries.md).`,
      );
    }

    if (listed.has(rel)) continue;
    const fold = firstLive(EOL_FOLD_IDIOM);
    if (fold !== -1) {
      errors.push(
        `${rel}:${lineOf(fold)} folds line endings to LF but is not in `
        + `SANCTIONED_EOL_BOUNDARIES. A second implementation of the fold outside the list is what `
        + `makes the list untrustworthy rather than merely incomplete — the whole design is "one `
        + `guarantee plus a list that must stay true". If this is a markdown INGEST, strip the BOM `
        + `too and add it to SANCTIONED_EOL_BOUNDARIES with its justification (in docs/src, call `
        + `normalizeSourceText instead unless the file cannot import TypeScript). If it folds for `
        + `some other reason, add it to SANCTIONED_EOL_NON_BOUNDARIES saying which.`,
      );
      continue;
    }

    // ── Arm 6: an ingest that never normalizes AT ALL ─────────────────────────────────
    // The other five arms all key on a fold that EXISTS — they police how it is spelled and
    // whether it is written down. None of them can see the defect the whole policy was built
    // for: #1349 was a reader with NO normalization, and #1388 was the same thing one file
    // over. A gate that only inspects existing folds certifies a tree in which the next
    // unnormalized ingest is invisible, which is how `tools/export-chart-svg.js` sat in `tools/`
    // reading a deck raw and anchoring on `/^---\n/` — stricter than the reader #1349 was
    // about — while every doc in the repo said the loop was closed.
    //
    // The signal is deliberately conjunctive and cheap: the file READS text (`utf8`) and
    // ANCHORS FRONT MATTER on `^---` without tolerating a `\r`. Either half alone is common and
    // harmless; together they are a front-matter parse over bytes nobody canonicalized, which is
    // exactly the #1349 shape. It cannot catch every unnormalized ingest — one that parses front
    // matter some other way still slips — so this narrows the blind spot rather than closing it,
    // and the docblock above says so rather than claiming otherwise.
    // This file is where the pattern is WRITTEN DOWN in order to be searched for, which is the
    // same reason `commentSpans` exists three arms up. It reads no author text.
    if (rel === 'tools/check-ownership.js') continue;
    if (EOL_UTF8_READ.test(src) && firstLive(EOL_STRICT_FM_ANCHOR) !== -1) {
      const at = firstLive(EOL_STRICT_FM_ANCHOR);
      errors.push(
        `${rel}${at === -1 ? '' : `:${lineOf(at)}`} reads text as utf8 and anchors front matter on `
        + `\`^---\` without normalizing line endings first. That is #1349 exactly: a BOM or a CRLF `
        + `defeats the \`^---\` anchor, so the front matter is read as BODY and the deck exports in `
        + `the DEFAULT palette, silently. Normalize at the read — \`.replace(/^\\uFEFF/, '')\` then `
        + `\`.replace(/\\r\\n?/g, '\\n')\` — and add the file to SANCTIONED_EOL_BOUNDARIES. If it `
        + `only ever sees repo-committed text (LF by .gitattributes), say so in `
        + `SANCTIONED_EOL_NON_BOUNDARIES instead.`,
      );
    }
  }
  for (const e of exempt) {
    if (!seenExempt.has(e.file)) {
      errors.push(
        `stale line-ending non-boundary sanction in tools/check-ownership.js — ${e.file} no longer `
        + `folds line endings. Remove the SANCTIONED_EOL_NON_BOUNDARIES entry so the exemption list `
        + `cannot rot into a blanket waiver.`,
      );
    }
  }
}

// Comment SPANS, not comment LINES. The line-based first cut skipped any line whose leading
// text began `*`, which a continuation line of a multi-line expression also does — so a live
// matcher could be parked past the gate by putting it after `  * factor;`. Spans are anchored
// at line start (`^[ \t]*`), so a `/*` inside a string literal cannot open a bogus span that
// swallows real code. Prose still gets to write the bad pattern down, which this file and
// `section-walk.js`'s docblock both need in order to explain it.
function commentSpans(src) {
  const spans = [];
  for (const re of [/^[ \t]*\/\*[\s\S]*?\*\//gm, /^[ \t]*\/\/.*$/gm]) {
    let m;
    while ((m = re.exec(src))) spans.push([m.index, m.index + m[0].length]);
  }
  return spans;
}

const CLASS_ATTR_EXTS = /\.(?:js|ts|tsx|mjs|cjs|astro)$/;
function listClassAttrFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.astro') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listClassAttrFiles(p, out);
    else if (CLASS_ATTR_EXTS.test(e.name)) out.push(p);
  }
  return out;
}

function classAttrOffences(dirs = {}) {
  const roots = dirs.roots || [
    path.join(ROOT, 'lib'),
    path.join(ROOT, 'docs', 'src'),
    path.join(ROOT, 'docs', 'scripts'),
    path.join(ROOT, 'tools'),
  ];
  // The root emulator only — there is no root `lattice-runtime.js` (the runtime's source is
  // `lib/runtime/**`, already covered by the `lib` root), and naming a file that does not
  // exist reads as a coverage claim the gate does not honor.
  const extra = dirs.files || [path.join(ROOT, 'lattice-emulator.js')];
  const files = [...roots.flatMap((d) => listClassAttrFiles(d)), ...extra.filter((f) => fs.existsSync(f))];
  const out = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    if (/\.test\.(?:[tj]sx?|mjs|cjs)$/.test(rel)) continue; // tests assert payloads, not render behavior
    const src = fs.readFileSync(file, 'utf8');
    const spans = commentSpans(src);
    CLASS_ATTR_REGEX.lastIndex = 0;
    let m;
    while ((m = CLASS_ATTR_REGEX.exec(src))) {
      const before = src.slice(Math.max(0, m.index - 24), m.index);
      if (CLASS_ATTR_GUARD.test(before)) continue;
      if (spans.some(([a, b]) => m.index >= a && m.index < b)) continue;
      out.push({ file: rel, line: src.slice(0, m.index).split('\n').length, snippet: m[0] });
    }
  }
  return out;
}

function checkClassAttrReads(errors) {
  const sanctioned = new Map(SANCTIONED_CLASS_ATTR_READS.map((s) => [s.file, s]));
  const seen = new Set();
  for (const o of classAttrOffences()) {
    seen.add(o.file);
    if (sanctioned.has(o.file)) continue;
    errors.push(
      `${o.file}:${o.line} matches a class attribute with no left boundary (\`${o.snippet}…\`) — it will read ` +
      `\`data-class="<raw _class: payload>"\` instead of the RESOLVED class list, which is #1358. Read it with ` +
      `\`readClassAttr\` (lib/core/section-walk.js), or guard the pattern with a leading \`\\s\`. ` +
      `\`\\b\` is not a guard: the boundary inside \`data-class\` is a word boundary.`,
    );
  }
  for (const s of SANCTIONED_CLASS_ATTR_READS) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale class-attribute sanction in tools/check-ownership.js — ${s.file} no longer matches a class ` +
        `attribute unguarded (#1358). Remove the SANCTIONED_CLASS_ATTR_READS entry so the allowlist stays honest.`,
      );
    }
  }
}

// `root`/`sanctions` are injected ONLY so the gate's own test can drive it over a scratch
// tree. Writing probe files into the real `docs/src` — the first shape of that test — is a
// self-inflicted red build: `node --test` runs files concurrently, so a probe present for
// one test is seen by every other check scanning the same tree, and a crash between write
// and cleanup leaves a file that fails `build:check` outright. It did exactly that once.
function checkPreviewHtmlSinks(errors, sanctions = SANCTIONED_PREVIEW_BUILDERS, root = ROOT, exempt = SANCTIONED_STYLE_SINK_EXEMPT) {
  const DOCS_SRC = path.join(root, 'docs', 'src');
  const sanctioned = new Map(sanctions.map((s) => [s.file, s]));
  const seen = new Set();
  for (const file of listSourceFiles(DOCS_SRC)) {
    const rel = path.relative(root, file);
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
      continue;
    }
    if (!SANITIZE_CALL.test(src)) {
      errors.push(
        `${rel} is a sanctioned preview builder but no longer calls sanitizeSlideHtml (HARD RULE #22) — ` +
        `restore the call or its srcdoc reopens the #616 XSS hole.`,
      );
    }
  }
  for (const s of sanctions) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale preview-builder sanction in tools/check-ownership.js — ${s.file} no longer builds a ` +
        `preview frame (HARD RULE #22). Remove the SANCTIONED_PREVIEW_BUILDERS entry so the allowlist stays honest.`,
      );
    }
  }
  checkDocumentStyleSinks(errors, exempt, root);
  checkCssTreeRewrapSinks(errors, root);
}

/**
 * HARD RULE #22, STYLESHEET channel — every `docs/src` module that assembles a WHOLE HTML
 * document containing caller CSS must run that CSS through `sanitizeStyleText`.
 *
 * Discovery is by document assembly, NOT by the preview-builder marker, and that is the
 * whole point: the runtime-`<script>` idiom marks a live preview frame and has no causal
 * relation to "embeds untrusted CSS". Keying the stylesheet arm on it missed
 * `share-export.ts`, whose `buildSelfContainedDoc` puts the same composed sheet in the same
 * `<style>` shape into a file that is DOWNLOADED AND SHARED — the one path here with a real
 * author-to-recipient split, where a preview frame is mostly self-XSS.
 *
 * A `<style>`'s content is HTML RAWTEXT: it ends at the first `</style`, inside a CSS
 * comment or string just the same, and the remainder is parsed as markup.
 *
 * Scope is `DOC_STYLE_SINK_ROOTS` — the docs site AND the CLI export pipeline. See that
 * constant for why the roots stop where they do.
 */
function checkDocumentStyleSinks(errors, exempt = SANCTIONED_STYLE_SINK_EXEMPT, root = ROOT) {
  const excused = new Map(exempt.map((e) => [e.file, e]));
  const seen = new Set();
  // A root is a directory to walk or a single file to read; `lattice-emulator.js` is the
  // latter, and resolving it by `listSourceFiles` would silently scan nothing.
  const files = [];
  for (const r of DOC_STYLE_SINK_ROOTS) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) listSourceFiles(abs, files);
    else files.push(abs);
  }
  for (const file of files) {
    // Compare and REPORT in posix form: the allowlist and the tests are written with `/`,
    // and `path.relative` hands back `\` on Windows. The markup arm above is deliberately
    // left as it was — its non-normalization is pre-existing and off this change's path
    // (HARD RULE #18), and it is inert on every platform CI runs.
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (!DOC_ASSEMBLER_MARKER.test(src) || !STYLE_SINK_MARKER.test(src)) continue;
    seen.add(rel);
    if (excused.has(rel)) continue;
    if (!SANITIZE_STYLE_CALL.test(src)) {
      errors.push(
        `${rel} assembles a complete HTML document with a <style> element but does not call ` +
        `sanitizeStyleText (HARD RULE #22, stylesheet channel). A <style>'s content is HTML RAWTEXT — ` +
        `a \`</style>\` carried in theme or author CSS ends the element even from inside a CSS comment ` +
        `or string, and everything after it is parsed as markup. In a same-origin preview frame that is ` +
        `script execution and OpenRouter-key theft (#616, HARD RULE #24); in a downloaded export it is ` +
        `the same, aimed at whoever opens the file. Pass the stylesheet through sanitizeStyleText ` +
        `(lib/core/sanitize-style-text.mjs), or add this file to SANCTIONED_STYLE_SINK_EXEMPT with a reason.`,
      );
    }
  }
  for (const e of exempt) {
    if (!seen.has(e.file)) {
      errors.push(
        `stale style-sink exemption in tools/check-ownership.js — ${e.file} no longer assembles a ` +
        `document with a <style> element (HARD RULE #22). Remove the SANCTIONED_STYLE_SINK_EXEMPT entry ` +
        `so the allowlist stays honest.`,
      );
    }
  }
}

/**
 * HARD RULE #22, STYLESHEET channel, THIRD shape — the css-tree RE-WRAP.
 *
 * `checkDocumentStyleSinks` keys on document assembly, which structurally cannot see a
 * module that assembles no document and instead takes CSS back OUT of one, runs it through
 * `prunePlayerCss` / `prunePlayerFontFaces`, and puts it back in a FRESH `<style>` element.
 * That round trip is a css-tree parse→generate, and css-tree normalizes the escape into a
 * live terminator again:
 *
 *     IN   section::after{content:"<\/style>"}
 *     OUT  section::after{content:"</style>"}
 *
 * So whatever guarded the document upstream is undone at the re-wrap, and the re-wrap owes
 * the call itself. There are two such sites and they are twins: the CLI's
 * (`lattice-emulator.js`) and the browser's (`player-prune-browser.ts`, whose output
 * `share-export.ts` mounts in a same-origin frame and then hands to a recipient). The
 * first cut of this work guarded one of the two, and a red-team pass drove the other to a
 * real cross-origin fetch from the shipped artifact — which is exactly the kind of
 * one-twin fix a gate exists to stop happening a third time.
 *
 * Scope is `DOC_STYLE_SINK_ROOTS`, and the marker is the MECHANISM: a file that calls a
 * prune AND rebuilds a `<style>` element. A prune consumer that only reads sizes owes
 * nothing, and a `<style>` re-wrap with no prune is the document guard's business, not
 * this one's.
 *
 * PER SITE, not per file — and that difference is the whole point of adding a check rather
 * than widening an existing one. Every other arm of #22 is satisfied by one call anywhere
 * in the file (§5 of the governing note lists that weakness; §4b finding 7 is a second
 * unguarded sink hiding behind a guarded one). Both re-wrap files rebuild TWO elements and
 * call the guard elsewhere besides, so a file-scoped rule here would have certified either
 * twin with its CSS re-wrap stripped — measured, not assumed. Each `<style…>` rebuild
 * therefore has to carry the call between its own opener and its own closer.
 *
 * Returns the discovered files, so its test can assert the known two are still found
 * rather than trusting a green run over an empty set.
 *
 * WHAT IT CANNOT SEE — stated here because the other two arms state theirs (§5, §9.5 of the
 * governing note) and an undeclared envelope is how a gate gets trusted past its worth. All
 * measured against THIS implementation, all SILENT while genuinely re-wrapping pruned CSS:
 *
 *   · the `<style>` opener and closer hoisted into constants (`const OPEN = '<style>'`), so
 *     the element never appears next to the value. Nothing short of a parser sees this one;
 *   · the prune in one module and the re-wrap in another (taint is tracked per file);
 *   · more than 400 characters between the opener and the closer;
 *   · the prune imported under an alias (`import { prunePlayerCss as prune }`);
 *   · the same code in a `.astro` file — `listSourceFiles` takes only js/ts/tsx/mjs/cjs;
 *   · a guard applied to the WRONG tainted value inside one interpolation.
 *
 * Shapes it DOES catch, listed because an earlier proximity-based cut missed all of them:
 * `replaceAll`, `split().join()`, slice-concatenation, a replacer carrying a long comment,
 * a one-level alias of the prune result, a second tainted value beside a guarded one, and a
 * `sanitizeStyleText(` that appears only inside a comment. It also no longer fires on
 * correctly-guarded code that hoists the sanitized value into a local first.
 *
 * What it buys is that the shape both real twins use cannot lose its guard silently, and
 * that a new re-wrap written any ordinary way is caught. That is worth having and is not the
 * same as coverage — the durable defense for these sites is the guard census in
 * `test/unit/export/style-guard-census.test.js`, which pins the call count by value.
 */
function checkCssTreeRewrapSinks(errors, root = ROOT) {
  const PRUNE_CALL = /\bprunePlayer(?:Css|FontFaces)\s*\(/;
  // One `<style…>` rebuild: the opener, then everything up to the matching closer. Both
  // the template-literal (`${…}`) and the concatenation (`' + x + '`) forms land here.
  const REWRAP_SITE = /<style[^>]*>((?:(?!<\/style)[\s\S]){0,400}?)<\/style/gi;
  // Names that HOLD pruned CSS: assigned straight from a prune, plus one level of aliasing
  // (`cssResult = pruned` is the real shape in both twins). Tracking the VALUE is what makes
  // this precise, and it replaced a proximity heuristic — "is there a `.replace(` within 160
  // characters" — that was wrong in both directions: it missed a re-wrap done with
  // `replaceAll`/`split().join()`/slice-concat, or one whose replacer carried a comment (the
  // most likely accidental shape in a codebase that comments inside callbacks), and it fired
  // on correctly-guarded code that hoisted the sanitized value into a local first.
  const TAINT_FROM_PRUNE = /(?:const|let|var)?\s*\b([A-Za-z_$][\w$]*)\s*=\s*[^;\n]*\bprunePlayer(?:Css|FontFaces)\s*\(/g;
  const ALIAS_OF = (name) => new RegExp(`(?:const|let|var)?\\s*\\b([A-Za-z_$][\\w$]*)\\s*=\\s*[^;\\n]*\\b${name}\\b`, 'g');
  // A name is CLEAN once it is assigned from the guard: `const safe = sanitizeStyleText(x)`.
  const CLEANED = /(?:const|let|var)?\s*\b([A-Za-z_$][\w$]*)\s*=\s*sanitizeStyleText\s*\(/g;
  const files = [];
  for (const r of DOC_STYLE_SINK_ROOTS) {
    const abs = path.join(root, r);
    if (!fs.existsSync(abs)) continue;
    if (fs.statSync(abs).isDirectory()) listSourceFiles(abs, files);
    else files.push(abs);
  }
  const seen = [];
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (/\.test\.[cm]?[jt]s$/.test(rel)) continue;
    const src = fs.readFileSync(file, 'utf8');
    if (!PRUNE_CALL.test(src)) continue;
    // Which locals hold pruned CSS, and which have been through the guard.
    const tainted = new Set([...src.matchAll(TAINT_FROM_PRUNE)].map((x) => x[1]));
    for (const base of [...tainted]) {
      for (const a of src.matchAll(ALIAS_OF(base))) if (a[1] !== base) tainted.add(a[1]);
    }
    const cleaned = new Set([...src.matchAll(CLEANED)].map((x) => x[1]));
    for (const c of cleaned) tainted.delete(c);
    if (!tainted.size) continue;
    const mentionsTaint = (text) => [...tainted].some((n) => new RegExp(`\\b${n}\\b`).test(text));
    let found = false;
    for (const m of src.matchAll(REWRAP_SITE)) {
      const body = m[1];
      // A literal body (no interpolation, no concatenation) is our own static CSS.
      if (!/\$\{|['"`]\s*\+|\+\s*['"`]/.test(body)) continue;
      // Only elements built out of PRUNED CSS are this check's business. `lattice-emulator.js`'s
      // base64 font block is a fixed manifest in the same file and must stay out.
      if (!mentionsTaint(body)) continue;
      found = true;
      // EVERY interpolation carrying a tainted value must carry the call, not just one
      // somewhere in the body. "Somewhere in the body" is satisfied by a second, guarded
      // value sitting beside an unguarded one — and by a `sanitizeStyleText(` written inside
      // a COMMENT. Both were measured passing an earlier cut of this check while the pruned
      // CSS went out raw.
      const interpolations = body.match(/\$\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/g) || [];
      const carriers = interpolations.filter(mentionsTaint);
      if (carriers.length && carriers.every((x) => SANITIZE_STYLE_CALL.test(x))) continue;
      // Concatenation form (`'<style>' + x + '</style>'`) has no `${…}` to inspect, so it
      // falls back to the whole body — weaker, and stated as such in the docblock.
      if (!carriers.length && SANITIZE_STYLE_CALL.test(body)) continue;
      errors.push(
        `${rel} rebuilds a <style> element from css-tree-pruned CSS without sanitizeStyleText ` +
        `(HARD RULE #22, stylesheet channel): \`${m[0].slice(0, 70).replace(/\s+/g, ' ')}…\`. ` +
        `css-tree's parse→generate normalizes \`<\\/style\` back into a live element terminator, ` +
        `so the guard applied where the document was assembled is undone here — and the result ` +
        `is downloaded by a recipient. Re-sanitize the pruned CSS at THIS re-wrap; a call ` +
        `elsewhere in the file does not cover it.`,
      );
    }
    if (found) seen.push(rel);
  }
  return seen;
}

/**
 * HARD RULE #22, FOURTH shape — POST-SANITIZE INJECTION inside the preview frame (#1246).
 *
 * See `SANCTIONED_RUNTIME_MARKUP_SINKS` for why this is a census of PROVENANCE rather than
 * a demand for a sanitize call. In short: the sink that matters takes SVG back from a
 * third-party renderer, and re-sanitizing it deletes the diagram (measured — DOMPurify
 * drops `<foreignObject>` and `<style>`). What is enforceable, and what #1246's acceptance
 * criteria actually asked for, is that a new injection point cannot land silently.
 *
 * WHAT IT CANNOT SEE — stated here because the other three arms state their envelopes, and
 * an undeclared envelope is how a gate gets trusted past its worth. All of these write
 * markup into the live frame while staying silent:
 *
 *   · a sink reached through a variable holding the property name
 *     (`el[prop] = s`, `const k = 'innerHTML'`), and a BRACKET-INDEXED receiver
 *     (`nodes[i].innerHTML = s`) — the receiver pattern is dotted names only;
 *   · `document.createElement` + `appendChild` of a parsed fragment — no string sink at all,
 *     which is a legitimate and SAFER shape, but also an unmonitored one;
 *   · `DOMParser`/`Range` obtained under an alias whose receiver name differs from the
 *     declared one (the census keys on the receiver TEXT, so `r2.createContextualFragment`
 *     is simply a new, undeclared sink — it fires, which is the safe direction);
 *   · anything in `lib/runtime/*.generated.js`, which is build output;
 *   · a sink in a module OUTSIDE `lib/runtime` that the frame imports.
 *
 * The last one is the real scope boundary and it is deliberate: `lib/runtime` is the code
 * that runs inside the preview frame, downstream of every sanitize the other arms enforce.
 * Widening to all of `lib` would census hundreds of Node-side sites with no frame at all.
 *
 * Comments are stripped before matching — a sink named only in a comment satisfying a text
 * matcher is a MEASURED evasion in this repo (#1731 §9.8), not a hypothetical.
 *
 * @param {string[]} errors    collected error strings
 * @param {Array}    sanctions the census (injectable, so probes need no committed entry)
 * @param {string}   root      repo root (injectable, so probes live in a temp tree)
 */
function checkRuntimeMarkupSinks(errors, sanctions = SANCTIONED_RUNTIME_MARKUP_SINKS, root = ROOT) {
  // A RECEIVER is a dotted chain that may end in a call or an index, because that is how people
  // actually write this: `document.querySelector('.x').innerHTML`, `nodes[0].innerHTML`,
  // `new DOMParser().parseFromString(…)`. The first cut matched dotted identifiers ONLY, so the
  // single most idiomatic shape in the whole class passed silently.
  const RECEIVER = String.raw`[\w$]+(?:\([^()]*\)|\[[^\][]*\]|\.[\w$]+)*`;
  // `(?:\+)?=(?!=)` so a `+=` APPEND counts — a plain markup append, invisible to the first cut —
  // while `==` / `===` / `!=` stay reads.
  const ASSIGN = new RegExp(`(${RECEIVER})\\.(innerHTML|outerHTML|srcdoc)\\s*(?:\\+)?=(?!=)`, 'g');
  const CALL = new RegExp(
    `(${RECEIVER})\\.(insertAdjacentHTML|createContextualFragment|setHTMLUnsafe|setHTML|parseFromString|writeln|write)\\s*\\(`,
    'g',
  );
  // `setAttribute('srcdoc', …)` is the same sink as `.srcdoc =`, spelled so that no property
  // assignment appears at all.
  const SET_ATTR = new RegExp(`(${RECEIVER})\\.setAttribute\\s*\\(\\s*['"\`](srcdoc)['"\`]`, 'gi');
  const dir = path.join(root, 'lib', 'runtime');
  const found = new Map(); // `${rel} ${sink}` -> count
  const files = [];
  if (fs.existsSync(dir)) listSourceFiles(dir, files);
  for (const file of files) {
    const rel = path.relative(root, file).split(path.sep).join('/');
    if (/\.generated\.[cm]?js$/.test(rel) || /\.test\.[cm]?[jt]s$/.test(rel)) continue;
    // REUSE the repo's conservative stripper (HARD RULE #15) rather than a local regex. The first
    // cut used `/(^|[^:])\/\/.*$/gm`, which truncates any line holding `//` inside a STRING or a
    // REGEX LITERAL — hiding a real sink written beside a protocol-relative URL, and drifting a
    // committed count for a reason nobody could see. `stripCodeComments` removes only FULL-LINE
    // `//` comments, so a TRAILING comment mentioning a sink can still be counted; that is the
    // SAFE direction (the author declares it) and it is stated in the envelope above.
    const code = stripCodeComments(fs.readFileSync(file, 'utf8'));
    for (const re of [ASSIGN, CALL, SET_ATTR]) {
      for (const m of code.matchAll(re)) {
        // `document.write` parses markup; `stream.write` / `logger.write` do not. The receiver's
        // last segment must END in `document`, so `contentDocument.write` and
        // `ownerDocument.write` — both real sinks the first cut dropped — count. Anything else is
        // DISCARDED rather than becoming an entry: a deliberate false negative, because `.write(`
        // is far too common on streams to make every one of them a census row. (The first cut's
        // comment claimed the opposite of what its code did.)
        if ((m[2] === 'write' || m[2] === 'writeln') && !/(^|\.)[\w$]*document$/i.test(m[1])) continue;
        const sink = `${m[1]}.${m[2].toLowerCase() === 'srcdoc' && /setAttribute/i.test(m[0]) ? 'setAttribute(srcdoc)' : m[2]}`;
        const key = `${rel} ${sink}`;
        found.set(key, (found.get(key) || 0) + 1);
      }
    }
  }
  // A duplicate (file, sink) would SILENTLY SHADOW in the Map below — last one wins — leaving a
  // wrong count and its provenance in the list enforcing nothing. `checkE2ESleeps` in this same
  // file already detects exactly this hazard; not doing it here re-opened a hole its neighbour
  // had already closed.
  const seenSanctionKeys = new Set();
  for (const entry of sanctions) {
    const key = `${entry.file} ${entry.sink}`;
    if (seenSanctionKeys.has(key)) {
      errors.push(
        `SANCTIONED_RUNTIME_MARKUP_SINKS has a duplicate entry for ${entry.file} \`${entry.sink}\` — one ` +
        `silently shadows the other, so its count enforces nothing. Merge them into a single entry ` +
        `with the real count.`,
      );
    }
    seenSanctionKeys.add(key);
  }
  const declared = new Map(sanctions.map((s) => [`${s.file} ${s.sink}`, s]));
  for (const [key, count] of found) {
    const [rel, sink] = key.split(' ');
    const entry = declared.get(key);
    if (!entry) {
      errors.push(
        `${rel} writes markup into the live preview frame via \`${sink}\` and is not in ` +
        `SANCTIONED_RUNTIME_MARKUP_SINKS (HARD RULE #22, post-sanitize injection). lib/runtime runs ` +
        `INSIDE a document the preview builder already sanitized, so anything injected here is ` +
        `downstream of every guard #22 enforces — the same gap #1246 reported for the Mermaid SVG. ` +
        `Add an entry stating the markup's PROVENANCE: whose renderer produced it, and what contains ` +
        `it if the answer is not "ours".`,
      );
      continue;
    }
    if (entry.count !== count) {
      errors.push(
        `${rel} now has ${count} \`${sink}\` markup sink(s); SANCTIONED_RUNTIME_MARKUP_SINKS declares ` +
        `${entry.count}. A count is the pin here precisely because a file-scoped rule would certify a ` +
        `NEW injection point hiding behind an already-legitimate one. If you ADDED one, state its ` +
        `provenance; if you REMOVED one, drop the count so the list stays honest. ` +
        `Declared provenance: ${entry.provenance}`,
      );
    }
  }
  for (const [key, entry] of declared) {
    if (found.has(key)) continue;
    errors.push(
      `SANCTIONED_RUNTIME_MARKUP_SINKS has a stale entry: ${entry.file} no longer has a \`${entry.sink}\` ` +
      `markup sink (HARD RULE #22). Remove it so the allowlist keeps describing the tree.`,
    );
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
// BOTH snapshot keys: the Studio's single-slide store and the Playground's first-section
// store. Same trust boundary (untrusted main-document HTML injected pre-paint) → same gate.
const SNAPSHOT_KEY_LITERALS = ['lattice-studio-last-slide', 'lattice-docs-pg-last-slide'];
// A wide main-document injection verb set (the srcdoc gate's `.innerHTML=|set:html` misses most).
const SNAPSHOT_INJECT_MARKER = /\.innerHTML\s*=|\.outerHTML\s*=|insertAdjacentHTML|document\.write|createContextualFragment|dangerouslySetInnerHTML|set:html/;
const SNAPSHOT_WRITE_MARKER = /\.setItem\s*\(/;
const SANCTIONED_SNAPSHOT_SINKS = [
  { file: 'docs/src/playground/snapshot-cache.js', role: 'producer', why: 'The SOLE writer of BOTH snapshot keys — saveSnapshotTo sanitizes at the storage boundary AND captureFromFrame / captureFirstSectionFromFrame at the capture chokepoint, so every stored value is clean.' },
  { file: 'docs/src/pages/playground.astro', role: 'sink', why: 'The pre-paint replay injects the already-sanitized Playground first-section snapshot into #pg-ssr-slidebox; safe because the producer is the only writer.' },
  { file: 'docs/src/components/playground/PlaygroundApp.tsx', role: 'sink', why: 'React adopts the pre-painted shell via dangerouslySetInnerHTML; the value flows only from window.__pgShellHtml, set by the sanctioned playground.astro replay from the sanitized snapshot (the producer is the only writer).' },
  // (The Studio retired its snapshot capture + replay entirely — its instant-shell is now a
  // static Nacre skeleton with no per-visitor content — so studio.astro / StudioShell are no
  // longer on the snapshot path. Only the Playground still uses snapshot-cache.js. See
  // engineering/decisions/2026-07-21-studio-preview-one-skeleton.md.)
];

// A file is "part of the snapshot path" if it names a raw key OR pulls a key/loader/
// capture/save symbol from snapshot-cache — the exported API. The capture/save symbols
// matter because a SINK can source the HTML INDIRECTLY (React reads window.__pgShellHtml,
// not loadSnapshot), so keying only on the reader symbols left the real injection sink
// (PlaygroundApp's dangerouslySetInnerHTML) invisible to the gate (red-team finding). These
// symbols are PLAYGROUND-specific on purpose (the Studio no longer touches the snapshot path
// at all), so an unrelated `localStorage.setItem` elsewhere can't false-positive.
function referencesSnapshot(src) {
  if (SNAPSHOT_KEY_LITERALS.some((k) => src.includes(k))) return true;
  return /from\s+['"][^'"]*snapshot-cache/.test(src) && /\b(?:SNAPSHOT_KEY|PG_SNAPSHOT_KEY|loadSnapshot|loadPlaygroundSnapshot|captureFirstSectionFromFrame|savePlaygroundSnapshot)\b/.test(src);
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
        `${rel} writes a snapshot key (${SNAPSHOT_KEY_LITERALS.join(' / ')}) but is not the sanctioned producer (HARD RULE #22) — ` +
        `only the sanitizing producer (snapshot-cache.js) may store it; a second writer could store unsanitized HTML the ` +
        `pre-paint replay injects into the top document (#616 XSS). Route the write through saveSnapshot / savePlaygroundSnapshot, or add this file to ` +
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
const SANCTIONED_OPENROUTER_SPENDERS = ['tools/component-gen-eval.mjs', 'tools/generate-voice-samples.mjs', 'tools/intent-bakeoff/judge-eval.mjs'];

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
    // ALWAYS mp3, for every engine — `audioFormat` names what the PROVIDER returns, while the
    // generator encodes a PCM-only response to mp3 before committing it, so the sample set is
    // one codec throughout. This gate is therefore also what keeps a re-introduced .wav from
    // silently landing back in the tree: it now reads as an orphan in every engine directory.
    const ext = 'mp3';
    // Mirrors tools/generate-voice-samples.mjs's own safeFilename EXACTLY — a voice
    // id can carry a ":" (invalid in a Windows filename, e.g. MAI-Voice-2's ids).
    const want = new Set(def.cachedVoices.map((id) => `${id.replace(/:/g, '_')}.${ext}`));
    // The full listing (not filtered to `.${ext}`) — a file with the WRONG
    // extension (e.g. a leftover .wav from before the samples were compressed) is exactly
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

// ── Suono (docs/src/lib/suono) — the audio playback/sequencing engine ───────
// The same self-containment antibody as Cadenza, plus a HARDER security invariant
// baked into the design (engineering/decisions/2026-07-12-suono-audio-library.md):
// Suono is bytes-only — it holds no network, no key, no remote import — so every
// import must resolve inside the folder (`./x`) or be a `node:` built-in. A bare
// specifier or a `../` escape both breaks the spin-off promise AND risks dragging
// the network/key concern back over the boundary this library exists to keep out.
const SUONO_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'suono');
// Collect a module specifier from EVERY import form, not just the tidy static `… from 'x'` — a
// red-team pass showed the single-`from` regex let a real host/remote coupling slip through as a
// side-effect import (`import 'x'`), a dynamic `import('x')`, or a `require('x')`. Each pattern
// captures the specifier in group 1.
// Strip comments before scanning so (a) a `;` hidden in a comment between `import` and `from` can't
// stop the gap-match and let a real host import slip, and (b) an `import … from '…'` sitting INSIDE a
// block/line comment can't false-positive. (A `//` inside a string like 'http://x' gets truncated,
// but the import is still flagged — over-catching a security boundary is safe; under-catching isn't.)
function stripJsComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, '');
}
const SUONO_SPEC_PATTERNS = [
  // import/export … from 'x'. Gap is `[^;=`]*?`: crosses NEWLINES (catches a multi-line `{ … }` wrap)
  // but stops at `;` (statement boundary), `=` (an `export const X = …` assignment, not an import), or
  // a backtick (a template literal that merely CONTAINS import-like text) — the false-positive shapes
  // the round-3 red team found. A real import/re-export never has `=`/backtick before its `from`.
  // The leading anchor is `(?:^|[\n;{}(])` — not just `^|\n` — so a top-level import placed AFTER
  // another statement on the same line (`const x=0;import three from 'three'`) is still caught; the
  // Anima adversarial trio (H1) showed the newline-only anchor let that valid ESM escape every pattern.
  /(?:^|[\n;{}(])\s*(?:import|export)\b[^;=`]*?\bfrom\s*['"]([^'"]+)['"]/g,
  /(?:^|[\n;{}(])\s*import\s+['"]([^'"]+)['"]/g,                      // side-effect import 'x'
  /\b(?:import|require)\s*\(\s*['"]([^'"]+)['"]/g,                    // dynamic import('x') / require('x')
];

function checkSuonoBoundary(errors) {
  if (!fs.existsSync(SUONO_DIR)) return; // library not present — nothing to guard
  for (const file of listSourceFiles(SUONO_DIR)) {
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.js')) continue; // tests use the dev runner (vitest), not host coupling
    const src = stripJsComments(fs.readFileSync(file, 'utf8'));
    const seen = new Set();
    for (const pattern of SUONO_SPEC_PATTERNS) {
      for (const m of src.matchAll(pattern)) {
        const spec = m[1];
        if (spec.startsWith('./')) continue; // in-folder relative — fine
        if (spec.startsWith('node:')) continue; // node built-in — allowed (SSR-safe core)
        if (seen.has(spec)) continue; // don't double-report a spec two patterns both matched
        seen.add(spec);
        errors.push(
          `${rel} imports '${spec}', which escapes the Suono folder. The audio engine is zero-dependency, ` +
          `bytes-only, and spin-off-able (2026-07-12-suono-audio-library.md): every import (static, ` +
          `side-effect, dynamic \`import()\`, or \`require()\`) must resolve inside docs/src/lib/suono/ ` +
          `(\`./x\`). Move shared code into the folder — Suono has no peer-dep seam and must not couple ` +
          `to the host (or reach the network/a key).`,
        );
      }
    }
  }
}

// ── Anima (docs/src/lib/anima) — the animation core ─────────────────────────
// Same self-containment antibody as Cadenza/Suono: Anima is the pure animation core
// (engineering/decisions/2026-07-17-anima-animation-library.md) — a scene spec → a
// timeline of engine-neutral snapshots — designed to spin off as a zero-dependency,
// no-DOM/no-WebGL library. It has NO peer-dep seam in Stage 1 (a backend's engine dep,
// e.g. `three`, lands later behind ANIMA_ADAPTER_DEPS), so EVERY import must resolve
// inside the folder (`./x`) or be a `node:` built-in. Reuses the robust multi-form Suono
// specifier patterns — catches side-effect / dynamic `import()` / `require()` / multi-line
// escapes, not just the tidy single-line `from` (the precise shape a lazy backend's
// `import('three')` would take).
const ANIMA_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'anima');
// The sanctioned engine dep each BACKEND adapter may import — kept OUT of the pure core.
// Everything not listed here (the whole core) may import only in-folder relatives + `node:`;
// a listed backend file may additionally import its ONE engine dep. Keyed by anima-relative
// path. A backend that imports an unlisted bare dep — or the core importing ANY — fails.
const ANIMA_ADAPTER_DEPS = {
  'backends/zdog.ts': ['zdog'],
  'backends/vivus.ts': ['vivus'],
};

function checkAnimaBoundary(errors) {
  if (!fs.existsSync(ANIMA_DIR)) return; // library not present — nothing to guard
  for (const file of listSourceFiles(ANIMA_DIR)) {
    const rel = path.relative(ROOT, file);
    const relInLib = path.relative(ANIMA_DIR, file).split(path.sep).join('/');
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.js')) continue; // tests use vitest, not host coupling
    const allowed = ANIMA_ADAPTER_DEPS[relInLib] || [];
    const src = stripJsComments(fs.readFileSync(file, 'utf8'));
    const seen = new Set();
    for (const pattern of SUONO_SPEC_PATTERNS) {
      for (const m of src.matchAll(pattern)) {
        const spec = m[1];
        if (spec.startsWith('.')) {
          // A relative import must resolve INSIDE the anima folder — so `./x` and an
          // intra-lib `../x` (a backend reaching the core) are fine, but a `../../lib/host`
          // escape is not (it resolves outside ANIMA_DIR).
          const resolved = path.resolve(path.dirname(file), spec);
          if (resolved === ANIMA_DIR || resolved.startsWith(ANIMA_DIR + path.sep)) continue;
        } else {
          if (spec.startsWith('node:')) continue; // node built-in — allowed (SSR-safe core)
          if (allowed.includes(spec)) continue; // this backend's sanctioned engine dep
        }
        if (seen.has(spec)) continue; // don't double-report a spec two patterns both matched
        seen.add(spec);
        errors.push(
          `${rel} imports '${spec}', which escapes the Anima folder. The animation CORE is ` +
            `zero-dependency and spin-off-able (2026-07-17-anima-animation-library.md): every import ` +
            `(static, side-effect, dynamic \`import()\`, or \`require()\`) must resolve inside ` +
            `docs/src/lib/anima/ (\`./x\` or an intra-lib \`../x\`) or be a \`node:\` built-in. A backend ` +
            `may import ONLY its sanctioned engine dep (ANIMA_ADAPTER_DEPS).`,
        );
      }
    }
  }
}

// ── Lente (docs/src/lib/lente) — the reader-lens engine ─────────────────────
// Same self-containment antibody as Cadenza/Suono: Lente is the pure reader-lens core
// (engineering/decisions/2026-07-13-lente-reader-lenses.md), designed to spin off as a
// zero-dependency, no-DOM library. It has NO peer-dep seam, so EVERY import must resolve
// inside the folder (`./x`); a bare specifier or a `../` escape breaks the spin-off-able
// promise. Reuses the robust multi-form Suono specifier patterns.
const LENTE_DIR = path.join(ROOT, 'docs', 'src', 'lib', 'lente');

function checkLenteBoundary(errors) {
  if (!fs.existsSync(LENTE_DIR)) return; // library not present — nothing to guard
  for (const file of listSourceFiles(LENTE_DIR)) {
    const rel = path.relative(ROOT, file);
    const base = path.basename(file);
    if (base.endsWith('.test.ts') || base.endsWith('.test.js')) continue; // tests use the dev runner (vitest), not host coupling
    const src = stripJsComments(fs.readFileSync(file, 'utf8'));
    const seen = new Set();
    for (const pattern of SUONO_SPEC_PATTERNS) {
      for (const m of src.matchAll(pattern)) {
        const spec = m[1];
        if (spec.startsWith('./')) continue; // in-folder relative — fine
        if (spec.startsWith('node:')) continue; // node built-in — allowed (SSR-safe core)
        if (seen.has(spec)) continue;
        seen.add(spec);
        errors.push(
          `${rel} imports '${spec}', which escapes the Lente folder. The reader-lens engine is ` +
          `zero-dependency, no-DOM, and spin-off-able (2026-07-13-lente-reader-lenses.md): every import ` +
          `(static, side-effect, dynamic \`import()\`, or \`require()\`) must resolve inside ` +
          `docs/src/lib/lente/ (\`./x\`). In particular the read path (project.ts) must never reach the ` +
          `suggester (suggest.ts) except through the folder's own exports. Move shared code into the folder.`,
        );
      }
    }
  }
}

// ── Audio playback boundary — Suono is the ONLY WebAudio player ──────────────
// Suono (docs/src/lib/suono) owns ALL real audio playback. No other module may
// create a raw AudioContext or drive voice-model's imperative playback
// (`.speak({…})` / `.playBlob()`) — those are the hand-rolled scheduler Suono
// replaced (2026-07-12-suono-audio-library.md §slice 2). Consumers build a
// `stage.sequence({ produce: voice.synthOne, … })` instead (read-aloud.ts,
// cadenza.astro). Both files that were once grandfathered here are gone from the
// list: voice-model.js became a byte source in slice 2c-final, and
// drawing-board-practice.js was deleted with the Drawing Board's route
// (2026-07-03-studio-succession.md P5). The allowlist reached zero and stays there.
// Allowlist + anti-rot (same shape as #22): a NEW violator fails (migrate it to
// Suono), and a stale entry — a listed file that no longer plays audio — fails,
// so the list can't silently rot.
const RAW_AUDIO_PATTERNS = [
  /\bnew\s+(?:window\.)?AudioContext\s*\(/, // raw WebAudio context
  /\bnew\s+(?:window\.)?webkitAudioContext\s*\(/,
  /\bwindow\.webkitAudioContext\b/, // the `AC = window.AudioContext || window.webkitAudioContext` fallback
  /\.playBlob\s*\(/, // voice-model's blob playback
  /\.speak\s*\(\s*\{/, // voice-model's OBJECT-arg speak({text,…}) — NOT speechSynthesis.speak(utterance)
];
// Slice 2c-final (voice-model → byte-source only) emptied this: voice-model.js no longer creates a
// raw AudioContext or plays audio (it produces bytes; Suono plays), and the frozen Drawing Board's
// read-aloud/audition were stripped. The allowlist is now ZERO — all audio playback goes through
// Suono, and this gate keeps it that way (a NEW raw-audio consumer fails outright; nothing is
// grandfathered anymore). Keep the gate; a re-added entry needs a real, dated retirement reason.
const SANCTIONED_LEGACY_AUDIO = [];
function collectAudioSourceFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === 'dist' || e.name === '.astro') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) collectAudioSourceFiles(p, out);
    else if (/\.(?:js|ts|tsx|mjs|cjs|astro)$/.test(e.name)) out.push(p); // include .astro (cadenza's inline script)
  }
  return out;
}
function checkAudioPlaybackBoundary(errors) {
  const DOCS_SRC = path.join(ROOT, 'docs', 'src');
  const SUONO_REL = path.join('docs', 'src', 'lib', 'suono');
  const sanctioned = new Map(SANCTIONED_LEGACY_AUDIO.map((s) => [s.file, s]));
  const seen = new Set();
  for (const file of collectAudioSourceFiles(DOCS_SRC)) {
    const rel = path.relative(ROOT, file);
    if (rel.endsWith('.test.ts') || rel.endsWith('.test.js')) continue; // tests mock the engine, not a real player
    if (rel === SUONO_REL || rel.startsWith(SUONO_REL + path.sep)) continue; // Suono IS the player
    const src = stripJsComments(fs.readFileSync(file, 'utf8'));
    if (!RAW_AUDIO_PATTERNS.some((re) => re.test(src))) continue;
    seen.add(rel);
    if (!sanctioned.has(rel)) {
      errors.push(
        `${rel} creates a raw AudioContext or drives voice-model playback (\`.speak({…})\` / ` +
        `\`.playBlob()\`) outside Suono. All audio playback goes through the Suono library ` +
        `(docs/src/lib/suono, 2026-07-12-suono-audio-library.md): build a ` +
        `\`stage.sequence({ produce: voice.synthOne, … })\` as read-aloud.ts and cadenza.astro do. If ` +
        `this is a frozen surface being retired (not migrated), add it to SANCTIONED_LEGACY_AUDIO in ` +
        `tools/check-ownership.js with the retirement reason.`,
      );
    }
  }
  for (const s of SANCTIONED_LEGACY_AUDIO) {
    if (!seen.has(s.file)) {
      errors.push(
        `stale legacy-audio sanction in tools/check-ownership.js — ${s.file} no longer creates a raw ` +
        `AudioContext or calls voice-model playback. Remove its SANCTIONED_LEGACY_AUDIO entry so the ` +
        `allowlist stays honest (the surface was retired or migrated to Suono).`,
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
// Two families, and the second one earned its place by naming something the first
// cannot. The original five are all about the TOUR's own state — hello, look here,
// it worked, it failed, careful. None of them can name a piece of the host's PROSE,
// so a pointer whose only verb is "go somewhere" says "this" by travelling, which is
// why the Guide rung read as a karaoke follower. The DEICTIC four are chosen by the
// SHAPE of the thing being named, which is what makes the variety motivated rather
// than a die roll, and each one's cursor rests where its own stroke ends.
const SANCTIONED_GESTURES = {
  wave: 'greeting / hello (the opening flourish)',
  circle: '"look here / this just rendered" — a glow on the bounding box + the cursor orbiting it',
  check: 'success / done / correct',
  cross: 'wrong / rejected / deleted',
  shake: '"no — careful / try again" (universal negation)',
  underline: '"this line" — a stroke swept along the baseline of one line of text (deictic)',
  wash: '"these words" — a highlighter band per line rect of a phrase inside a longer block (deictic)',
  bracket: '"this whole block" — a soft outline just outside a multi-line block or card (deictic)',
  tap: '"this one" — a ripple on something small and discrete, where a ring would be a dot (deictic)',
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
  scene: 'figural — an Anima poster still (inline svg), not prose (heading/caption are universal budgets)',
  'logo-wall': 'figural — logos',
  // connect — QR cards; fields are credentials/identity values (ssid, email), not prose.
  wifi: 'connect — Wi-Fi credentials, not prose',
  contact: 'connect — vCard identity fields, not prose',
  // data grids — [x]/checkmark cells / feature matrices; word-counting mis-fires.
  'obligation-matrix': 'data grid — [x] cells, not prose',
  'matrix-grid': 'data grid — [x] cells, not prose',
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

// ── design/skills/ freshness ─────────────────────────────────────────────
// The seven design/skills/*.md files deliberately RESTATE canon and code
// specifics (design/skills/README.md explains why: an agent building an
// artifact mid-task shouldn't chase links). That sanctioned duplication is only
// safe if it stays TRUE — so this gate ties each skill's inlined COUNTABLE facts
// to their machine source and hard-fails when they drift. Each numeric assertion
// pins a stable marker phrase in the prose; if the phrase is gone the gate fails
// too, so a fact can't silently rot by being reworded away from the checker.
// This is the mechanism that turns "duplication debt" into "enforced-fresh fast
// path" (2026-07 adversarial-trio review of the skills). It gates enumerable facts
// (counts, the required-token list) AND — added in the 2026-07-17 recertification —
// the load-bearing CONCEPT markers of the categorical model (three-layer contrast,
// the texture channel, checkCatContrast), because that mental model, not just a
// number, is what drifted under #1022. Prose, taste, and recipes remain on human
// review — the gate pins the facts a rewrite could silently falsify.
//
// SCOPE (be honest about what green means): this verifies enumerated counts + the
// concept keywords WITHIN the design/skills/*.md files. It does NOT reach the
// neighbor canon those skills point at (themes/README.md, the themes/*.css header
// comments, the tools/new-theme.js stamped checklist, engineering/decisions/*) —
// those are ungated and stay on human review. Green ≠ "the whole categorical canon
// is fresh"; it means the gated skill facts are.
// Count the categorical chart-hue slots the chart family actually declares
// (`--chart-cat-N-hue:` declarations in chart-family.css). This is the source of
// chart-component.md's "`--chart-cat1..8`" claim. Returns null on a structural
// change so the caller can fail closed rather than silently miscount.
function chartCatSlotCount() {
  const p = path.join(COMPONENTS_DIR, 'chart', '_chart-family', 'chart-family.css');
  if (!fs.existsSync(p)) return null;
  const css = fs.readFileSync(p, 'utf8');
  const slots = new Set();
  for (const m of css.matchAll(/--chart-cat-(\d+)-hue\s*:/g)) slots.add(Number(m[1]));
  return slots.size || null;
}

// Count the full per-theme token CONTRACT the way token-parity.test.js defines it
// (the authoritative source theme.md cites). Eval-free: count quoted literals plus
// the per-iteration names the one `Array.from({length:N})` generates (N × the
// number of template-literal names it maps). Returns null if the CONTRACT block
// can't be parsed — the caller treats null as a loud error (fail closed), so a
// structural change surfaces instead of silently passing a stale number.
function contractTokenCount() {
  const p = path.join(ROOT, 'test', 'unit', 'palette', 'token-parity.test.js');
  if (!fs.existsSync(p)) return null;
  const src = fs.readFileSync(p, 'utf8');
  const m = src.match(/const CONTRACT = \[([\s\S]*?)\n\];/);
  if (!m) return null;
  // Strip line comments first, so a `// note with 'quotes' or ...` inside the
  // CONTRACT array can't skew the literal/spread counts below.
  const body = m[1].replace(/\/\/[^\n]*/g, '');
  // Fail closed on any spread we don't model. The ONLY understood construct is a
  // single `...Array.from({ length: N }, …)`. A `...SHARED_CONST` spread, or a
  // second Array.from, would silently under/over-count and defeat the check — so
  // if the spread count doesn't match exactly one recognized Array.from, bail to
  // null (→ the caller's loud "could not derive… structural change?" error).
  const spreads = (body.match(/\.\.\./g) || []).length;
  const arrayFroms = [...body.matchAll(/Array\.from\(\s*\{\s*length:\s*(\d+)\s*\}/g)];
  if (spreads !== arrayFroms.length || arrayFroms.length > 1) return null;
  // Every quoted literal must be token-shaped (lowercase, digits, `-`, `_`). A
  // quote that ISN'T a token name means the structure changed and the count would
  // be wrong — bail to null (honest "fix the parser") rather than return a
  // plausible-but-wrong number that misdirects the fix to the skill.
  const quotedLits = body.match(/'[^']*'/g) || [];
  if (quotedLits.some((q) => !/^'[a-z0-9_-]+'$/.test(q))) return null;
  const templates = (body.match(/`[^`]*`/g) || []).length;      // names generated per iteration
  const generated = arrayFroms.length ? Number(arrayFroms[0][1]) * templates : 0;
  return quotedLits.length + generated;
}

function skillFreshnessAssertions() {
  const universalCount = UNIVERSAL_VARIANTS.length;               // 35 today
  const finishCount = Object.keys(FINISH_REGISTER).length;       // 10 today (none + 9)
  const chartCats = chartCatSlotCount();                          // 8 today
  const contractCount = contractTokenCount();                    // 91 today
  return [
    {
      file: 'finish.md',
      marker: /Ships today \((\d+) values\)/,
      actual: finishCount,
      what: 'shipped finish count',
      source: 'FINISH_REGISTER (lib/core/resolve-finish.js)',
    },
    {
      file: 'component.md',
      marker: /The (\d+) buckets:/,
      actual: BUCKETS.length,
      what: 'bucket count',
      source: 'BUCKETS (lib/components)',
    },
    {
      file: 'component.md',
      marker: /Tier 1 Universal \((\d+)\)/,
      actual: universalCount,
      what: 'Tier-1 universal-variant count',
      source: 'UNIVERSAL_VARIANTS (lib/components)',
    },
    {
      file: 'theme.md',
      marker: /(\d+) required core tokens/,
      actual: REQUIRED_THEME_TOKENS.length,
      what: 'required core-token count',
      source: 'REQUIRED_THEME_TOKENS',
    },
    {
      file: 'theme.md',
      marker: /(\d+)-token contract/,   // every "N-token contract" phrasing must agree
      actual: contractCount,
      what: 'full per-theme token-contract count',
      source: 'CONTRACT (test/unit/palette/token-parity.test.js)',
    },
    {
      file: 'chart-component.md',
      marker: /--chart-cat1\.\.(\d+)/,
      actual: chartCats,
      what: 'chart categorical slot count',
      source: '--chart-cat-N-hue declarations (chart-family.css)',
    },
  ];
}

// ─── Categorical three-layer contrast gate (HARD-RULE-adjacent) ──────────────
// The `--cat-*` cycle shipped 10 themes with `fill == mark` on all 12 slots, so
// every categorical branch rendered one color (ardesia's mindmap was all-gray).
// The real contract is three contrast layers on the diagram node ("leaf"):
//   ① edge/border (mark) vs canvas  ≥ 3.0  (WCAG 1.4.11 graphical object)
//   ② leaf fill vs canvas           — intentionally LOW; the ① border delineates
//   ③ label text (on-fill ink) vs leaf fill ≥ 4.5 (WCAG AA normal text)
// plus an anti-collapse floor: fill and mark must differ (the original bug set
// them equal → contrast 1.0). Runs over EVERY hue-based theme, both modes, so a
// collapse or a sub-AA recolor can't silently reship.
//
// ④ ON-CANVAS INK — `--cat-N-ink` vs `--bg` AND `--bg-alt` ≥ 4.5 (#1263). Layers
// ①–③ all judge the category against ITSELF (its own chip, its own border); this
// one judges it against the SLIDE, which is where `math.theorem`, `split-panel`
// and `premise` actually paint categorical text. Nothing bounded that pair, so
// `math.theorem` shipped 11 of 56 combinations below AA on the raw mark.
//
// COVERAGE DIFFERS BY LAYER, ON PURPOSE. Layers ①–③ are the HUE contract, and
// a11y-* palettes are its sanctioned exception (they separate by luminance +
// texture, not hue) — so those palettes skip ①–③. Layer ④ is not about hue at
// all, it is about whether small text is legible, which no palette is exempt
// from; it runs over EVERY palette including a11y-*. Skipping the whole theme
// (what this gate used to do) would have let the a11y family ship a 2.26:1 ink.
// See engineering/decisions/2026-07-15-categorical-token-contract.md.
const CAT_TEXT_FLOOR = 4.5;      // ③ ④ AA normal text
const CAT_EDGE_FLOOR = 3.0;      // ① WCAG 1.4.11 graphical
const CAT_COLLAPSE_FLOOR = 1.25; // fill vs mark — catches fill==mark (1.0)
// Perceptual floor (OKLab ΔE) below which two categorical INKS read as one color.
// Set just under 0.0105 — the tightest pair `indaco`'s own CURATED dark cycle
// ships — so the arm fires on a real collapse without second-guessing a spacing
// the design already accepts. Only ever applied where the MARKS are further apart
// than this, i.e. where the distinction existed before the solve.
const CAT_INK_COLLAPSE_DIST = 0.010;
const CAT_PRINT_CHROMA_MAX = 6;  // ④ print band: max sRGB max-min on a printed ink (B&W-safe)

function catStripComments(s) { return s.replace(/\/\*[\s\S]*?\*\//g, ''); }
// LAST declaration wins, mirroring the CSS cascade (an override later in the
// file supersedes an earlier default). NOTE: this is a flat parser — it does not
// model @media (prefers-color-scheme) blocks. That is fine because the house
// dark-mode pattern is light-dark() in a single declaration (the whole token
// architecture), not @media overrides; a theme that shipped its dark palette via
// @media would be off-pattern and is out of this gate's model.
function catParseTokens(css) {
  const m = new Map();
  for (const x of catStripComments(css).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    m.set(x[1], x[2].trim()); // last wins
  }
  return m;
}
// Resolve a token (or literal) to a #rrggbb hex in the given mode.
//
// The EVALUATION is delegated to lib/core/resolve-token-expr — the engine's own
// custom-property evaluator, the one the offline Mermaid bridge already uses
// (var() with fallback, light-dark() arms, color-mix() in oklab/srgb, all
// paren-balanced). This gate used to carry a hand-rolled second evaluator that
// understood only var() and light-dark(); it was replaced rather than extended
// when --cat-N-ink arrived. The ink is a plain light-dark() of two hexes today, so
// the swap is no longer load-bearing for THAT token — it stands on HARD RULE #15
// (reuse the engine's evaluator, don't keep a second one) and on the coverage it
// adds: 96 values across the shipped palettes resolve now that did not before.
//
// What this wrapper adds on top is the FAIL-CLOSED contract the callers rely
// on: resolveTokenExpr returns its input verbatim when it cannot reduce a value
// (right for a renderer, wrong for a gate), so anything that is not a hex comes
// back as null here. Callers treat null on a REQUIRED token as a loud error,
// never a silent skip.
function catResolve(map, tokenOrVal, mode) {
  const raw = tokenOrVal.startsWith('--') ? map.get(tokenOrVal) : tokenOrVal;
  if (!raw) return null;
  // resolveTokenExpr keys its var table on the BARE name (`bg`), not `--bg`.
  const vars = catBareVars(map);
  const out = resolveTokenExpr(String(raw).trim(), vars, mode === 'dark');
  const hx = String(out).trim().match(/^#([0-9A-Fa-f]{6}|[0-9A-Fa-f]{3})$/);
  if (!hx) return null;
  const h = hx[1].length === 3 ? hx[1].split('').map((c) => c + c).join('') : hx[1];
  return `#${h.toLowerCase()}`;
}
// `--name` → `name` view of a token map. Deliberately NOT memoized per map: a
// WeakMap cache here returns a STALE value when a REFERENCED token is mutated
// between calls on the same Map (`--a: var(--b)` keeps resolving to the old --b),
// and catResolve is exported and driven with hand-built maps by the unit tests.
// Rebuilding is O(tokens) and the whole gate runs a few thousand resolutions —
// milliseconds. Correct-by-construction beats a micro-optimization in a gate.
function catBareVars(map) {
  const v = Object.create(null);
  for (const [k, val] of map) v[k.replace(/^--/, '')] = val;
  return v;
}
function catRelLum(hex) {
  const n = hex.replace('#', '');
  const ch = [0, 2, 4].map((i) => {
    const c = parseInt(n.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
}
function catContrast(a, b) {
  if (!a || !b) return null;
  const x = catRelLum(a), y = catRelLum(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

// Every palette with its @import chain flattened — base first, then each import,
// then the file itself, mirroring the cascade. `@import 'lattice'` resolves to
// lib/base/base.tokens.css, the SOURCE (not dist/, which is regenerated by the
// very build this gate runs inside). Two things need the flattening: the derived
// --cat-N-ink tier is declared in base.tokens.css, not in any theme; and the
// a11y-* palettes reach the cycle through `@import 'onyx'`, so read alone they
// look like a theme with no categorical tokens at all.
// `themesDir` is threaded through the recursion so a caller can point the whole
// flatten at a fixture tree. It defaults to the real one, so every existing caller
// is unchanged — but without it a `themesDir` argument on a GATE is a lie: the gate
// would list fixture filenames and then read the real files' contents, and a
// mutation test against the fixture would pass because nothing it wrote was ever
// read. That is how this was found.
function catPaletteSource(name, seen = new Set(), themesDir = THEMES_DIR) {
  if (seen.has(name)) return '';
  seen.add(name);
  if (name === 'lattice') return fs.readFileSync(path.join(LIB_DIR, 'base', 'base.tokens.css'), 'utf8');
  const file = path.join(themesDir, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  // Comments FIRST: several themes discuss `@import 'lattice';` in prose, and a
  // raw scan treats that sentence as a real import. Harmless where the named
  // theme is imported anyway, silently wrong the moment a comment names one that
  // is not — it would flatten a foreign palette's tokens into the gate's map.
  for (const m of catStripComments(css).matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${catPaletteSource(m[1], seen, themesDir)}\n`;
  return `${out}${css}`;
}

// The `section.print` remap block from base.modifiers.css, as a token map layered
// OVER a palette. Print is a THIRD canvas that light-dark() cannot reach: it
// re-points --bg / --bg-alt / --text-heading / --cat-N-mark / --cat-N-ink at the
// B&W --print-* band. The ink has to be judged against the print surfaces too — and
// judged here rather than assumed, because an earlier cut of this tier derived the
// ink at :root, which froze the theme hue and put carbone's printed labels at 1.29:1
// on white while the rules beside them printed gray.
function catPrintOverlay(errors) {
  const css = catStripComments(fs.readFileSync(path.join(LIB_DIR, 'base', 'base.modifiers.css'), 'utf8'));
  const at = css.indexOf('section.print {');
  if (at === -1) { errors.push('checkCatContrast could not find the `section.print` block in lib/base/base.modifiers.css — the print band is unverifiable.'); return null; }
  const end = css.indexOf('\n}', at);
  if (end === -1) { errors.push('checkCatContrast could not find the end of the `section.print` block — the print band is unverifiable.'); return null; }
  const map = catParseTokens(css.slice(at, end));
  // A TRUNCATED overlay is the dangerous failure, not a missing one: the scan ends
  // at the first column-0 `}`, so a nested block added inside `section.print` would
  // silently cut it short, the missing tokens would fall through to the palette's
  // SCREEN values, and the print arm would cheerfully judge the wrong colors green.
  // Demand every input the ink derivation and its surfaces actually need.
  const required = ['--bg', '--bg-alt', '--text-heading', ...Array.from({ length: 12 }, (_, i) => `--cat-${i + 1}-mark`)];
  const missing = required.filter((t) => !map.has(t));
  if (missing.length) {
    errors.push(`checkCatContrast read the section.print block but it is missing ${missing.length} token(s) the print arm needs: ${missing.join(', ')}. Either the print band stopped remapping them, or the block scan was truncated by a nested rule (it ends at the first column-0 "}").`);
    return null;
  }
  return map;
}

// Every palette that owns a mark cycle must also own a CURATED ink cycle.
//
// --cat-N-ink used to be derived in CSS from --cat-N-mark. That was contrast-safe
// and off brand: the mix pole has to track the canvas, the only token that does is
// --text-heading, and on a palette whose heading ink is itself chromatic that drags
// the mark's hue by up to 14.9 degrees while mixing away a third of the chroma. The
// values are now generated per theme by tools/derive-cat-ink.js — hue and chroma
// held, lightness solved — and committed beside the fill/mark cycle. So the check
// is no longer "is the derivation declared in a reachable place" but the ordinary
// one every other categorical token gets: is it THERE.
//
// (`derive-cat-ink --check` separately proves the committed values still match the
// recipe. This gate proves they exist and clear AA; that one proves they were not
// hand-edited off the curve. Neither subsumes the other.)
function checkCatInkDeclared(errors, themesDir = THEMES_DIR) {
  // SCOPE COMES FROM THE MANIFESTS when scanning the real themes dir. This used to
  // `readdirSync` every `.css`, which meant any stray file in themes/ silently became
  // a gate subject — an untracked scratch palette dropped there during an
  // investigation was reported as a broken THEME rather than as what it was. Scope is
  // declared now, so this gate speaks only about palettes the repo has declared, and a
  // stray file gets one accurate message from `checkThemeManifestCoverage` ("no
  // manifest") instead of a misleading one from here. It is still refused — dropping a
  // probe palette into `themes/` fails the build, which is the correct answer for a
  // directory every theme gate reads; use a scratch directory. (The `themesDir`
  // override keeps this callable against a
  // synthetic fixture directory, which is how the gate is unit-tested; a fixture dir
  // has no manifests, so it falls back to scanning.)
  const declared = themesDir === THEMES_DIR ? listThemeManifests() : null;
  const files = declared
    ? [...declared.keys()].sort().map((n) => `${n}.css`)
    : fs.readdirSync(themesDir).filter((f) => f.endsWith('.css')).sort();
  for (const file of files) {
    const name = file.replace(/\.css$/, '');
    const full = path.join(themesDir, file);
    if (!fs.existsSync(full)) continue; // G1 reports a manifest with no CSS
    const own = catStripComments(fs.readFileSync(full, 'utf8'));
    if (!/--cat-1-mark\s*:/.test(own)) continue; // inherits its cycle, and its ink with it
    const missing = [];
    for (let n = 1; n <= 12; n += 1) if (!new RegExp(`--cat-${n}-ink\\s*:`).test(own)) missing.push(`--cat-${n}-ink`);
    if (missing.length) {
      errors.push(
        `theme "${name}" declares a categorical mark cycle but is missing ${missing.length} of its 12 on-canvas ink slots (${missing.slice(0, 3).join(', ')}${missing.length > 3 ? ', …' : ''}). ` +
        'Run `node tools/derive-cat-ink.js` to generate them — the ink is curated per theme, not derived at render time.',
      );
    }
  }
}

/**
 * Every READ of `--cat-N-ink` in lib/ must carry its `var(--cat-N-mark)` fallback.
 *
 * This is the arm that actually closes the class. The tier has no `:root` default
 * — deliberately, because the emulator's export bundle concatenates the theme
 * BEFORE lib/base/base.tokens.css, so a default there wins on equal specificity
 * and reverts every curated ink to its mark on the PDF path (measured in Chromium:
 * atelier's curated #006D70 became the mark #008386). The fallback therefore lives
 * at each consumer, which is order-independent and correct — but a per-site
 * convention with nothing enforcing it survives exactly as long as the next
 * author's memory. A theme built outside this repo (the Studio's Fabricate path,
 * lib/theme/derive.js) declares marks and no inks, so a bare `var(--cat-N-ink)`
 * there resolves to NOTHING and the property falls back to its inherited value:
 * that is the `.horizons` bug's exact shape, where every phase eyebrow collapsed
 * onto one flat --accent, silently, and only off-repo.
 *
 * The slot numbers must MATCH: `var(--cat-3-ink, var(--cat-7-mark))` is a typo the
 * eye slides over, and it would paint category 3 in category 7's hue.
 */
function checkCatInkFallback(errors, libDir = LIB_DIR) {
  const offenders = [];
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(css|js|mjs)$/.test(e.name)) continue;
      const src = catStripComments(fs.readFileSync(p, 'utf8'));
      for (const m of src.matchAll(/var\(\s*--cat-(\d+)-ink\s*(,?)([^)]*)/g)) {
        const n = m[1];
        const rest = `${m[2]}${m[3]}`;
        if (!new RegExp(`^,\\s*var\\(\\s*--cat-${n}-mark\\b`).test(rest.trim())) {
          const line = src.slice(0, m.index).split('\n').length;
          offenders.push(`${path.relative(ROOT, p)}:${line} — var(--cat-${n}-ink${rest.trim() ? `${rest.trim()}` : ''}…`);
        }
      }
    }
  };
  walk(libDir);
  if (offenders.length) {
    errors.push(
      `${offenders.length} read(s) of --cat-N-ink omit the required \`, var(--cat-N-mark)\` fallback: ` +
      `${offenders.slice(0, 5).join('; ')}${offenders.length > 5 ? `, +${offenders.length - 5} more` : ''}. ` +
      'The tier has no :root default on purpose (the export bundle loads the theme before the base, so a ' +
      'default would override every curated ink), so the fallback belongs at each consumer — and the slot ' +
      'numbers must match. A bare read renders nothing on any theme generated outside this repo.',
    );
  }
}

/**
 * The --cat-N-ink pairs in one arm that read as a single color WHERE THE MARKS DO
 * NOT — i.e. separation the ink solve destroyed, rather than separation the
 * palette never had. Pure, so it can be tested against synthetic arms instead of
 * only asserted empty over the shipped ones.
 */
function catInkCollapsePairs(inks, marks) {
  const out = [];
  for (let i = 0; i < inks.length; i += 1) {
    for (let j = i + 1; j < inks.length; j += 1) {
      const inkGap = oklabDistance(inks[i], inks[j]);
      if (inkGap >= CAT_INK_COLLAPSE_DIST) continue;
      // Inherited from the marks → a palette fact, not a generator failure.
      if (oklabDistance(marks[i], marks[j]) < CAT_INK_COLLAPSE_DIST) continue;
      out.push(`--cat-${i + 1}-ink/--cat-${j + 1}-ink ${inkGap.toFixed(4)} (${inks[i]} vs ${inks[j]})`);
    }
  }
  return out;
}

/**
 * The twelve `--hljs-*` syntax colors, against the code panel they are painted on.
 *
 * #1527. Twelve tokens x 32 themes x 2 modes and **no contrast test anywhere** —
 * the one large token family the categorical gate above does not reach. That gap
 * hid a real defect: `cuoio`'s `--hljs-literal` sat at 4.05:1 on its own `--code-bg`,
 * under the AA floor for code text. Nobody saw it because the export bundle then
 * concatenated the theme BEFORE the base, so the base's `#ff5874` painted instead of
 * the theme's value — which is exactly why #1527's concat flip needed this gate to land
 * ahead of it. A curated value nobody has ever rendered is a value nobody has ever
 * checked. The flip has landed; every value this gate scores is now a value that
 * paints.
 *
 * FLOOR: `CAT_TEXT_FLOOR` (4.5). Syntax highlighting is small text on a panel;
 * there is no "graphical" reading of it. Held to the bare AA floor rather than
 * AA + margin, so the gate reports a real WCAG failure and not a house preference
 * — the extra margin belongs in the repair, and `derive-cat-ink`'s solver applies
 * it there.
 *
 * SURFACE: `--code-bg`, resolved per theme per mode through `catResolve` — the
 * same resolver the categorical arms use, so the two cannot disagree about what a
 * token resolves to (HARD RULE #15).
 */
const HLJS_TOKENS = Object.freeze([
  'built_in', 'comment', 'keyword', 'literal', 'number', 'params',
  'punctuation', 'string', 'tag', 'title', 'type', 'variable',
].map((t) => `--hljs-${t}`));

/**
 * NO EXEMPTIONS. All twelve tokens are held to the floor, including the two that
 * are deliberately quiet.
 *
 * The first cut of this gate exempted `--hljs-comment` and `--hljs-punctuation`,
 * on the argument that de-emphasis IS the design and that holding them to 4.5:1
 * would make a comment as loud as the statement it annotates. The measurement
 * behind it was real — 64 comment and 46 punctuation values under the floor,
 * against 4 for every other token combined — but the conclusion did not follow.
 * The exemption was reasoning about the WRONG END of the scale: de-emphasis is a
 * question of where a token sits RELATIVE to the code around it, and the floor is
 * a question of whether a human can read it at all. Both can be satisfied, because
 * the floor is 4.5:1 and the content tokens sit far above it.
 *
 * So the 110 values were repaired instead of excused, each lifted through
 * `ensureContrast` (OKLCH, hue and chroma held, first step that clears) — the
 * MINIMUM movement that reaches the floor, which lands them at 4.5–4.7:1. The
 * hierarchy was verified afterwards rather than assumed: across all 64
 * theme-modes, no token that carries CODE sits below the repaired comment. Say it
 * that way and not "the comment is the quietest thing in the panel" — the looser
 * sentence shipped in the first cut and was false in 26 of 66 theme-modes, because
 * `--hljs-punctuation` is lifted to the same floor and lands a few hundredths
 * either side. Comment and punctuation are peers at the bottom by design; what
 * must never invert is comment against the code.
 *
 * The lesson is worth keeping: an exemption that comes with a big number attached
 * is the shape of a defect being counted rather than fixed.
 */

function checkHljsContrast(errors, themesDir = THEMES_DIR) {
  const failures = [];
  let evaluated = 0;
  let themesScanned = 0;
  const unreadable = [];
  // THE BASE IS SCANNED FIRST, and it is not optional. `lattice` is the palette
  // `dist/lattice.css` ships — what a deck renders with before any theme is picked,
  // and what `regression-gate.mjs` itself renders every golden with — so it is the
  // most-read palette in the repo, not an edge case.
  //
  // The first cut of this gate skipped it, on the reasoning quoted in the loop
  // below: a theme with no syntax colors of its own "inherits the base's, which the
  // base is responsible for". Nothing made the base responsible. It shipped
  // `--hljs-comment: #637777` — Night Owl's value, tuned for Night Owl's #011627 —
  // at 3.63:1 on the base's darker #001d33, and no gate could say so. It was found
  // by asking why a full 340-render regression sweep showed no drift after fourteen
  // themes changed color: the sweep renders with `dist/lattice.css`, whose comment
  // color the theme edits never touched.
  const scan = ['lattice', ...fs.readdirSync(themesDir).sort()
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace(/\.css$/, ''))];
  const maps = new Map(scan.map((n) => [n, catParseTokens(catPaletteSource(n, new Set(), themesDir))]));

  // WHICH PANELS A BASE VALUE CAN LAND ON — the pair that actually renders, which is
  // the thing this gate has been wrong about twice.
  //
  // Before #1527 the export concatenated `paletteCSS + layoutCSS`, so the base loaded
  // AFTER the theme and its `--hljs-*` won on EVERY panel; a theme's own syntax ramp
  // never painted there. Pairing base-with-base and theme-with-theme modeled a world
  // that did not exist yet and left the shipping one unmeasured — the hole that hid
  // indaco rendering `--hljs-literal` at 3.71:1 and `--hljs-comment` at 3.06:1 while
  // this gate reported clean and a "Fixed" changelog entry shipped.
  //
  // The flip landed, so the base no longer wins anywhere: its value is the FALLBACK
  // for a token a theme's chain never declares, and it paints on that theme's panel.
  // Widening back to "every panel in the corpus" would now score a combination nothing
  // renders — the same defect from the other side.
  //
  // TODAY THAT FALLBACK SET IS EMPTY: all 32 palettes declare all twelve. An empty
  // population is a gate that cannot fail, so it is not left implicit — the base is
  // always judged against its OWN panel (`dist/lattice.css` with no theme is what the
  // golden corpus and every un-themed consumer render with), and a theme that stops
  // declaring a token adds its panel here the moment it does.
  const panels = new Map();   // bg -> the palette/mode that owns it, for the message
  const inheritedPanels = new Map();   // token -> Map(bg -> owner) for themes that inherit it
  for (const [name, map] of maps) {
    for (const mode of ['light', 'dark']) {
      const bg = catResolve(map, '--code-bg', mode);
      if (!bg) continue;
      if (!panels.has(bg)) panels.set(bg, `${name}/${mode}`);
      if (name === 'lattice') continue;
      for (const token of HLJS_TOKENS) {
        if (map.has(token)) continue;
        if (!inheritedPanels.has(token)) inheritedPanels.set(token, new Map());
        if (!inheritedPanels.get(token).has(bg)) inheritedPanels.get(token).set(bg, `${name}/${mode}`);
      }
    }
  }

  for (const name of scan) {
    const map = maps.get(name);
    // A theme that declares no syntax colors of its own inherits the base's, which
    // is now checked above rather than assumed — nothing further here.
    if (!HLJS_TOKENS.some((t) => map.has(t))) continue;
    themesScanned += 1;
    for (const mode of ['light', 'dark']) {
      const own = catResolve(map, '--code-bg', mode);
      if (!own) continue;   // unresolvable surface — the token-parity gate owns that
      // The base is judged against its own panel plus every panel that INHERITS the
      // token; a theme only against its own, because a theme's value cannot paint on
      // another theme's panel.
      const inheritedFor = (token) => [...(inheritedPanels.get(token)?.keys() ?? [])];
      for (const token of HLJS_TOKENS) {
        if (!map.has(token)) continue;
        const fg = catResolve(map, token, mode);
        if (!fg) {
          // NOT a silent skip. `catResolve` returns null for any notation it cannot
          // read — rgb()/hsl()/oklch()/a named color/8-digit hex — and skipping
          // those quietly makes the gate evadable by changing notation alone, which
          // contradicts the resolver's own documented contract above.
          unreadable.push(`${name} ${token} = ${String(map.get(token)).trim()}`);
          continue;
        }
        const against = name === 'lattice' ? [own, ...inheritedFor(token).filter((b) => b !== own)] : [own];
        for (const bg of against) {
          evaluated += 1;
          const ratio = catContrast(fg, bg);   // the same helper the categorical arms use
          if (ratio < CAT_TEXT_FLOOR) {
            const where = bg === own ? '--code-bg' : `--code-bg of ${inheritedPanels.get(token)?.get(bg) ?? panels.get(bg)}`;
            failures.push(`${name}/${mode} ${token} ${fg} on ${where} ${bg} = ${ratio.toFixed(2)}:1`);
          }
        }
      }
      // De-emphasis is a RELATIVE property no contrast number can see. Lifting
      // comment and punctuation to the same floor collapsed them into one gray in
      // eight palettes (concrete reached OKLab dE 0.0030, 1.01:1 against each
      // other) — legible, and indistinguishable, which is a different defect from
      // the one the lift fixed. Judged against the repo's own collapse floor.
      const cmt = map.has('--hljs-comment') && catResolve(map, '--hljs-comment', mode);
      const pun = map.has('--hljs-punctuation') && catResolve(map, '--hljs-punctuation', mode);
      if (cmt && pun) {
        const dist = oklabDistance(cmt, pun);
        if (dist < CAT_INK_COLLAPSE_DIST) {
          failures.push(
            `${name}/${mode} --hljs-comment ${cmt} and --hljs-punctuation ${pun} collapse — ` +
            `OKLab dE ${dist.toFixed(4)} < ${CAT_INK_COLLAPSE_DIST}`,
          );
        }
      }
    }
  }
  if (unreadable.length) {
    errors.push(
      `${unreadable.length} \`--hljs-*\` value(s) are in a notation catResolve cannot read, so they were never ` +
      `measured: ${unreadable.slice(0, 6).join('; ')}${unreadable.length > 6 ? `, +${unreadable.length - 6} more` : ''}. ` +
      'Write the value as a hex literal (or a light-dark()/var()/color-mix() of hex literals) so the floor applies. ' +
      'An unreadable value is an UNCHECKED value, not a passing one.',
    );
  }
  // A gate that cannot fail is also a claim (#1535). Twelve tokens across the
  // curated palettes is hundreds of pairs; a near-zero count means the scan broke.
  if (evaluated < 100) {
    errors.push(
      `checkHljsContrast evaluated only ${evaluated} token-mode pairs across ${themesScanned} theme(s) — ` +
      'the curated palettes declare twelve syntax colors each, so this is a broken scan, not a clean tree.',
    );
    return;
  }
  if (failures.length) {
    errors.push(
      `${failures.length} \`--hljs-*\` syntax color(s) fall below the ${CAT_TEXT_FLOOR}:1 AA floor on their own ` +
      `--code-bg: ${failures.slice(0, 8).join('; ')}${failures.length > 8 ? `, +${failures.length - 8} more` : ''}. ` +
      'Lift the value in OKLCH holding hue and chroma (the move derive-cat-ink makes for the ink tier) rather ' +
      'than picking a new color by eye — the palette author chose the hue. Since #1527 the export loads ' +
      'the base BEFORE the theme, so a theme\'s own syntax ramp is what paints on every path — a failure ' +
      'here is a failure a reader sees, not a latent one.',
    );
  }
}

function checkCatContrast(errors) {
  checkCatInkDeclared(errors);
  checkCatInkFallback(errors);
  checkHljsContrast(errors);
  const printOverlay = catPrintOverlay(errors);
  let scanned = 0;
  let evaluated = 0;    // ①–③ slot×mode pairs actually contrast-checked — the real coverage metric
  let inkScanned = 0;
  const inkScannedNames = new Set();
  let inkEvaluated = 0; // ④ slot×mode×surface pairs — its own metric, since its scope is wider
  for (const file of fs.readdirSync(THEMES_DIR).sort()) {
    if (!file.endsWith('.css')) continue;
    const name = file.replace(/\.css$/, '');
    const map = catParseTokens(catPaletteSource(name));
    if (!map.has('--cat-1-fill')) continue; // not a palette / no categorical cycle

    // ④ ON-CANVAS INK — every palette, a11y-* included. See the header note: this
    // layer asks whether small text is legible, which no palette is exempt from.
    // THREE canvases, not two: light, dark, and the PRINT band (`section.print`
    // remaps the ink's own inputs, so it lands somewhere neither mode covers).
    inkScanned += 1;
    inkScannedNames.add(name);
    for (const mode of ['light', 'dark', 'print']) {
      // Print is a light-scheme band by construction (`section.print` pins
      // color-scheme: light), layered over the palette exactly as the cascade does.
      const scheme = mode === 'print' ? 'light' : mode;
      const m = mode === 'print' ? new Map([...map, ...(printOverlay ?? [])]) : map;
      if (mode === 'print' && !printOverlay) {
        errors.push('checkCatContrast could not read the section.print block in lib/base/base.modifiers.css — the print band is unverifiable.');
        continue;
      }
      const bg = catResolve(m, '--bg', scheme);
      const bgAlt = catResolve(m, '--bg-alt', scheme);
      if (!bg || !bgAlt) {
        errors.push(`theme "${name}" ${mode}: --${!bg ? 'bg' : 'bg-alt'} did not resolve to a color — the contrast gate cannot verify on-canvas ink legibility.`);
        continue;
      }
      for (let n = 1; n <= 12; n += 1) {
        const catInk = catResolve(m, `--cat-${n}-ink`, scheme);
        if (!catInk) {
          errors.push(`theme "${name}" ${mode}: --cat-${n}-ink did not resolve to a color — the on-canvas categorical ink is unverifiable. It is generated per palette by tools/derive-cat-ink.js; run that to write the block. There is deliberately NO :root default in lib/base/base.tokens.css (the export bundle loads the theme before the base, so a default there would override every curated ink) — consumers carry the fallback instead, as var(--cat-${n}-ink, var(--cat-${n}-mark)).`);
          continue;
        }
        for (const [surface, hex] of [['--bg', bg], ['--bg-alt', bgAlt]]) {
          inkEvaluated += 1;
          const r = catContrast(catInk, hex);
          if (r < CAT_TEXT_FLOOR) {
            errors.push(
              `theme "${name}" ${mode}: --cat-${n}-ink vs ${surface} is ${r.toFixed(2)}:1, ` +
              `below the ${CAT_TEXT_FLOOR}:1 AA floor. Categorical text on the slide (math.theorem labels, ` +
              `split-panel card labels, premise row terms) must be legible on the canvas it sits on.`,
            );
          }
        }
        // The print band's whole promise is B&W-safety: a printed label must be
        // ink, not a theme hue. A chromatic print ink means `section.print`'s remap
        // is not reaching this slot — the exact regression that once shipped a gray
        // rule beside a carbone-blue label.
        if (mode === 'print') {
          const [pr, pg, pb] = [1, 3, 5].map((i) => Number.parseInt(catInk.slice(i, i + 2), 16));
          const chroma = Math.max(pr, pg, pb) - Math.min(pr, pg, pb);
          if (chroma > CAT_PRINT_CHROMA_MAX) {
            errors.push(
              `theme "${name}" print: --cat-${n}-ink resolves to ${catInk}, which carries chroma ${chroma} ` +
              `(max ${CAT_PRINT_CHROMA_MAX}). The print band must be B&W-safe. The printed ink aliases the ` +
              `printed mark, a gray ramp, so this means either that ramp was re-tuned off the band or ` +
              `section.print stopped remapping --cat-${n}-ink.`,
            );
          }
        }
      }
    }

    // ④b ANTI-COLLAPSE ON THE INK CYCLE. Legibility is not the only thing a
    // categorical tier owes: twelve slots that all render the same color have
    // stopped being categorical. Solving each slot for the least move that clears
    // AA can converge — on a ramp that differs only in lightness, every slot fails
    // in the same direction and lands on one value (a11y dark did exactly this,
    // 12 slots to one hex, and layer ④ certified it green because it was legible).
    // The generator now spends the whole budget on legibility once an arm has
    // collapsed; this arm is what notices if that ever stops happening.
    //
    // EVERY palette, a11y included — no exemption. The a11y family is exempt from
    // the HUE contract because it separates by luminance and texture, but a
    // luminance ramp is exactly a thing that can collapse, and it did: a11y dark
    // solved to one hex on all twelve slots. The generator's uniform-shift keeps the
    // ramp's spacing, so a11y passes this arm honestly rather than by exemption.
    // MEASURED PERCEPTUALLY (OKLab ΔE), not by hex identity. `new Set(hexes).size
    // === 12` calls concrete's dark arm — twelve values spanning two units out of
    // 255 — a distinct cycle, which is true only to a string comparator.
    //
    // And judged against the MARKS, because the floor is not the same question as
    // the collapse. The shipped palettes' own curated ink separation runs
    // continuously from 0.0013 (concrete dark) through 0.0065 (cuoio dark) to 0.055
    // (carbone) — there is no gap to put an absolute floor in that does not fail a
    // palette for a property it INHERITED from its own marks. So a pair is a
    // collapse only when the inks are closer than COLLAPSE_DIST *and* the marks
    // were not: that is the generator having destroyed a distinction the palette
    // carried, which is this arm's actual subject.
    for (const mode of ['light', 'dark']) {
      const inks = [];
      const marks = [];
      for (let n = 1; n <= 12; n += 1) {
        inks.push(catResolve(map, `--cat-${n}-ink`, mode));
        marks.push(catResolve(map, `--cat-${n}-mark`, mode));
      }
      if (inks.some((v) => !v) || marks.some((v) => !v)) continue;
      const worst = catInkCollapsePairs(inks, marks);
      if (worst.length) {
        errors.push(
          `theme "${name}" ${mode}: ${worst.length} --cat-N-ink pair(s) sit closer than ${CAT_INK_COLLAPSE_DIST} ` +
          `OKLab apart while their MARKS are distinguishable — the ink solve collapsed a distinction the ` +
          `palette carries: ${worst.slice(0, 4).join('; ')}. A categorical cycle whose ink collapses has ` +
          'stopped encoding the category. Re-run `node tools/derive-cat-ink.js` (its anti-collapse pass ' +
          'restores the marks\' own separation), or re-hue the marks.',
        );
      }
    }

    // ①–③ THE HUE CONTRACT — a11y-* separate by luminance + texture, not hue, and
    // are the sanctioned exception to these three layers only.
    if (/^a11y-/.test(name)) continue;
    scanned += 1;
    // The rendered mindmap label uses var(--cat-on-fill) unconditionally (mermaid.css),
    // with no base default — so that IS the ink, and its absence is a real defect.
    for (const mode of ['light', 'dark']) {
      const ink = catResolve(map, '--cat-on-fill', mode);
      // --cat-on-mark is the ink for text ON the saturated mark itself (the
      // categorical corner tag: decision / roadmap / compare-prose deep tags,
      // which set their background to var(--cat-N-mark)). Usually it flips per
      // canvas (white on the saturated light-mode mark, near-black on the pale
      // dark-mode mark); the vivid-mark themes (carbone) instead pin a flat
      // near-black. Either way it must clear the mark in BOTH modes — verify both.
      const markInk = catResolve(map, '--cat-on-mark', mode);
      const bg = catResolve(map, '--bg', mode);
      // Fail CLOSED: a required token that doesn't reduce to a color means the gate
      // cannot verify this theme — that is an error, never a silent skip. (A future
      // theme using color-mix() for these will trip this and must extend the gate or
      // declare an exemption, rather than quietly losing contrast coverage.)
      if (!ink) { errors.push(`theme "${name}" ${mode}: --cat-on-fill did not resolve to a color — the contrast gate cannot verify label legibility.`); continue; }
      if (!markInk) { errors.push(`theme "${name}" ${mode}: --cat-on-mark did not resolve to a color — the contrast gate cannot verify tag-on-mark legibility.`); continue; }
      if (!bg) { errors.push(`theme "${name}" ${mode}: --bg did not resolve to a color — the contrast gate cannot verify edge/canvas contrast.`); continue; }
      for (let n = 1; n <= 12; n += 1) {
        const fill = catResolve(map, `--cat-${n}-fill`, mode);
        const mark = catResolve(map, `--cat-${n}-mark`, mode);
        if (!fill || !mark) {
          errors.push(`theme "${name}" ${mode}: --cat-${n}-${!fill ? 'fill' : 'mark'} did not resolve to a color — the contrast gate cannot verify this slot.`);
          continue;
        }
        evaluated += 1;
        const edge = catContrast(mark, bg);
        const text = catContrast(ink, fill);
        const markText = catContrast(markInk, mark);
        const collapse = catContrast(fill, mark);
        if (edge < CAT_EDGE_FLOOR) {
          errors.push(
            `theme "${name}" ${mode}: --cat-${n}-mark (edge/border) vs --bg is ${edge.toFixed(2)}:1, ` +
            `below the ${CAT_EDGE_FLOOR}:1 graphical floor (WCAG 1.4.11). The branch/border must read against the canvas.`,
          );
        }
        if (text < CAT_TEXT_FLOOR) {
          errors.push(
            `theme "${name}" ${mode}: label ink (--cat-on-fill) vs --cat-${n}-fill is ${text.toFixed(2)}:1, ` +
            `below the ${CAT_TEXT_FLOOR}:1 AA floor. The node label must be legible on its fill.`,
          );
        }
        if (markText < CAT_TEXT_FLOOR) {
          errors.push(
            `theme "${name}" ${mode}: tag ink (--cat-on-mark) vs --cat-${n}-mark is ${markText.toFixed(2)}:1, ` +
            `below the ${CAT_TEXT_FLOOR}:1 AA floor. The categorical corner tag (decision/roadmap/compare-prose) must be legible on its mark.`,
          );
        }
        if (collapse < CAT_COLLAPSE_FLOOR) {
          errors.push(
            `theme "${name}" ${mode}: --cat-${n}-fill and --cat-${n}-mark are ${collapse.toFixed(2)}:1 apart — ` +
            `the categorical-collapse bug (fill == mark → node and branch one color). Fill and mark must be distinct tiers of the hue.`,
          );
        }
      }
    }
  }
  if (!scanned) errors.push('checkCatContrast found no hue-based themes to verify — the theme scan is broken.');
  // Coverage backstop: scanned themes must actually produce evaluations. Guards against
  // a silent-skip regression where themes match the filters but no slot is contrast-checked.
  else if (evaluated < scanned * 24) {
    errors.push(`checkCatContrast evaluated only ${evaluated} of the expected ${scanned * 24} slot×mode pairs — some slots did not resolve; coverage is incomplete.`);
  }
  // The ink layer's backstop is BY NAME, not by ratio. A ratio cannot catch the
  // regression it exists to catch: drop a whole palette family from the scan and
  // inkScanned and inkEvaluated shrink together, so `inkEvaluated < inkScanned * K`
  // stays satisfied and the gate reports nothing. Name every palette file that
  // failed to get scanned instead — that is unfixable by proportional shrinkage.
  const inkExpected = fs.readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.css') && !f.includes('audit'))
    .map((f) => f.replace(/\.css$/, ''));
  const inkMissed = inkExpected.filter((t) => !inkScannedNames.has(t));
  if (inkMissed.length) {
    errors.push(`checkCatContrast never verified --cat-N-ink on ${inkMissed.length} palette(s): ${inkMissed.join(', ')}. Every shipped palette must be judged on the ink layer — no exemptions.`);
  }
  if (inkEvaluated !== inkScanned * 72) {
    errors.push(`checkCatContrast evaluated ${inkEvaluated} --cat-N-ink slot×mode×surface pairs, expected exactly ${inkScanned * 72} (12 slots × 3 canvases × 2 surfaces) — some slot did not resolve; coverage is incomplete.`);
  }
}

// HARD RULE #27 — every subagent runs on Opus, and says so. Model tiering was
// tried here and retired (engineering/decisions/2026-07-28-model-tiering-retirement.md):
// what looked like cheap "lookup" work in this repo turns out to need the whole
// cascade / token / HARD-RULE picture in context to answer correctly rather than
// plausibly, and a downshifted agent fails in the expensive direction — well-formed,
// confident, wrong, and past every machine gate.
//
// Omitting `model:` would ALSO yield Opus today, by inheriting the session's. The
// gate still demands it be named, because an unstated policy is an accident of the
// current `/model` setting rather than a property of the repo. Two surfaces:
//   • `.claude/agents/*.md` — the roster. Frontmatter needs `model: opus`; a typo
//     (`opus-5`) silently falls back to inheritance instead of erroring.
//   • `.claude/workflows/*.{js,mjs,cjs}` (recursively) — every `agent()` call needs
//     `model:` in its options, resolved from the **AST**, not from text. Three
//     successive text-based versions of this check were all unsound, in both
//     directions (review on #1187): file-wide counting let any stray `{label, model}`
//     object mask an unpinned stage; a balanced-paren scan then still accepted a pin
//     that appeared in a prompt STRING, in a NESTED object, or in an inner call's
//     options, while wrongly REJECTING valid code whose options held an inline object,
//     a callback, or a `)` inside a regex — and a URL in a prompt broke it outright.
//     Parsing ends that whole class: `agent(…)` is a CallExpression whose LAST argument
//     is the options object, and nothing textual can impersonate one.
// COVERAGE BOUNDARY (be honest): this gate sees COMMITTED files only. An ad-hoc
// `Agent()` call in a live session is invisible to it — that path rides on the
// roster + the CLAUDE.md dispatch line, not on this check.
// See engineering/model-policy.md.
const acorn = require('acorn');
// One tier, by decision. `sonnet`, `haiku` and `fable` are rejected BY NAME rather
// than quietly accepted — re-adding one is a coordinated change across this list,
// engineering/model-policy.md, CLAUDE.md, engineering/workflow.md, .github/labels.json,
// the work-item form, AND the two ratchet tests that assert the collapse
// (test/unit/cli/check-ownership.test.js, test/unit/tools/sync-labels.test.js — they
// are MEANT to go red here). See engineering/model-policy.md § If a tier is ever added back.
const AGENT_MODELS = ['opus'];
const AGENTS_DIR = path.join(ROOT, '.claude', 'agents');
const WORKFLOWS_DIR = path.join(ROOT, '.claude', 'workflows');

// Minimal AST walker — acorn-walk is present but only transitively, so it is not
// safe to require. Visits every node with a `type`, skipping position bookkeeping.
function walkAst(node, visit) {
  if (!node || typeof node !== 'object') return;
  if (Array.isArray(node)) {
    for (const child of node) walkAst(child, visit);
    return;
  }
  if (typeof node.type === 'string') visit(node);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc' || key === 'range') continue;
    walkAst(node[key], visit);
  }
}

// LAST match, not first — object-literal semantics are last-wins, so
// `{ model: 'opus', model: 'sonnet' }` evaluates to `sonnet`. Reading the FIRST
// `model` certified that object as pinned while it ran on a cheaper model: a
// false PASS through the only machine enforcement HARD RULE #27 has. Found by the
// red-team pass on #1240; `.claude/` is excluded from lint, so Biome's
// noDuplicateObjectKeys never sees it either.
const propIndexNamed = (obj, name) =>
  obj.properties.findLastIndex(
    (p) => p.type === 'Property' && !p.computed &&
      ((p.key.type === 'Identifier' && p.key.name === name) || (p.key.type === 'Literal' && p.key.value === name)),
  );
const propNamed = (obj, name) => {
  const i = propIndexNamed(obj, name);
  return i === -1 ? undefined : obj.properties[i];
};

// Every `agent(...)` call in a workflow, with whether its options pin a model.
// Returns { error } when the file cannot be parsed — an unreadable workflow is
// reported, never treated as compliant.
function agentCallPins(src) {
  let ast;
  try {
    ast = acorn.parse(src, {
      ecmaVersion: 'latest',
      sourceType: 'module',
      allowReturnOutsideFunction: true, // workflow scripts top-level `return`
      allowAwaitOutsideFunction: true, //  …and top-level `await`
    });
  } catch (e) {
    return { error: e.message, calls: [] };
  }

  // `const spawn = agent` aliases the call, and a module-level `const opts = {...}`
  // may hold the options. Both were live bypasses under text scanning.
  //
  // The two are collected with DELIBERATELY different breadth, because getting them
  // wrong fails in opposite directions (both halves found in review on #1187):
  //
  //  • OPTIONS objects — module-level `const` ONLY. This is the soundness boundary.
  //    Accepting any declarator would let a block-scoped `const opts = {…}` in an
  //    unrelated function, or a `let` reassigned before the call, satisfy an
  //    `agent(p, opts)` elsewhere in the file — a false PASS certifying an unpinned
  //    stage. A module-level `const` is the one binding that is unambiguous without
  //    real scope analysis; anything else stays unresolved and is REPORTED.
  //
  //  • ALIASES — any scope. Narrowing these does not prevent a false pass, it just
  //    stops the gate seeing the call at all: a function-scoped `const spawn = agent`
  //    would make `spawn(p, {…})` invisible rather than flagged. Broader detection
  //    errs toward reporting, which is the safe direction here.
  const aliases = new Set(['agent']);
  walkAst(ast, (n) => {
    if (n.type === 'VariableDeclarator' && n.id.type === 'Identifier' &&
        n.init?.type === 'Identifier' && aliases.has(n.init.name)) aliases.add(n.id.name);
  });

  const objectConsts = new Map();
  for (const stmt of ast.body) {
    const decl = stmt.type === 'ExportNamedDeclaration' ? stmt.declaration : stmt;
    if (decl?.type !== 'VariableDeclaration' || decl.kind !== 'const') continue;
    for (const d of decl.declarations) {
      if (d.id.type === 'Identifier' && d.init?.type === 'ObjectExpression') objectConsts.set(d.id.name, d.init);
    }
  }

  const calls = [];
  walkAst(ast, (n) => {
    if (n.type !== 'CallExpression' || n.callee.type !== 'Identifier' || !aliases.has(n.callee.name)) return;
    const last = n.arguments[n.arguments.length - 1];
    let options = null;
    if (last?.type === 'ObjectExpression') options = last;
    else if (last?.type === 'Identifier' && objectConsts.has(last.name)) options = objectConsts.get(last.name);

    if (!options) {
      calls.push({ label: null, pinned: false, reason: 'options-unresolved', value: null });
      return;
    }
    const modelIdx = propIndexNamed(options, 'model');
    const model = modelIdx === -1 ? undefined : options.properties[modelIdx];
    const label = propNamed(options, 'label');
    // A spread AFTER the pin overrides it: `{ model: 'opus', ...OVERRIDE }` runs on
    // whatever OVERRIDE.model says. Resolving that needs real value analysis, so the
    // honest answer is "cannot tell" — REPORT it rather than certify the visible pin.
    // (A spread BEFORE the pin is harmless: the later literal wins.) Found by the
    // red-team pass on #1240, alongside the duplicate-key hole above; both certified
    // a stage as pinned while it ran on a cheaper model.
    const lastSpreadIdx = options.properties.findLastIndex((p) => p.type === 'SpreadElement');
    // Distinguish WHY a call isn't pinned. Collapsing these into one message sends
    // someone hunting for a missing field when the value is the actual problem
    // (found in review on #1187) — the roster half already separates them.
    const [reason, value] =
      lastSpreadIdx > modelIdx ? ['spread-override', null]
      : !model ? ['missing', null]
      : model.value.type !== 'Literal' ? ['dynamic', null]
      : AGENT_MODELS.includes(model.value.value) ? ['pinned', model.value.value]
      : ['invalid', String(model.value.value)];
    calls.push({
      label:
        label?.value.type === 'Literal' ? String(label.value.value)
        : label?.value.type === 'TemplateLiteral' ? label.value.quasis.map((q) => q.value.cooked).join('…')
        : null,
      pinned: reason === 'pinned',
      reason,
      value,
    });
  });
  return { error: null, calls };
}

// Workflow sources, recursively — `.mjs` and a subdirectory were both silent
// escape hatches when this filtered a flat `.js` listing.
function listWorkflowFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listWorkflowFiles(p, out);
    else if (/\.(?:js|mjs|cjs)$/.test(e.name)) out.push(p);
  }
  return out;
}

// Agent definitions, recursively and directory-safe. The roster half used to be a
// flat `readdirSync` + `endsWith('.md')`, which left two holes the red-team pass on
// #1240 probed: an agent in a SUBDIRECTORY was invisible (while the workflow half
// above already recursed — an undocumented asymmetry), and a DIRECTORY named `x.md`
// made the later readFileSync throw an uncaught EISDIR, killing build:check with a
// stack trace instead of a gate error. README.md documents the roster rather than
// defining an agent — the harness registers agents by frontmatter, so it is not a
// missing pin.
function listAgentFiles(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listAgentFiles(p, out);
    else if (e.name.endsWith('.md') && e.name !== 'README.md') out.push(p);
  }
  return out;
}

// The YAML scalar after `model:` — tolerant of what a human will actually write.
// A raw \S+ capture would take `'sonnet'` WITH its quotes and reject valid YAML, and
// would reject a trailing `# comment` outright; both are false positives that teach
// people to distrust the gate. Strip the comment, then the quotes.
function declaredModel(frontmatter) {
  const m = /^model:[ \t]*(.*)$/m.exec(frontmatter);
  if (!m) return null;
  const value = m[1]
    .replace(/\s+#.*$/, '') // trailing YAML comment
    .trim()
    .replace(/^(['"])([\s\S]*)\1$/, '$2') // surrounding quotes, either style
    .trim();
  return value || null; // a bare `model:` with no value declares nothing
}

// `dirs` is injectable so the tests can drive the REAL function over fixture trees
// and assert its actual errors. The previous tests asserted against a re-implementation
// of this logic, which meant deleting the gate's call site left the suite green —
// found by the maker-checker pass on #1187.
function checkAgentModelPinning(errors, dirs = {}) {
  const agentsDir = dirs.agents || AGENTS_DIR;
  const workflowsDir = dirs.workflows || WORKFLOWS_DIR;
  // A MISSING roster is not "nothing to check" — it means the enforcement surface
  // CLAUDE.md and engineering/model-policy.md point at is gone, so the Opus-only
  // policy stops being stated anywhere and reverts to whatever the session happens
  // to be set to. Treat it exactly like an empty one. (The workflows half below
  // early-returns instead, and that asymmetry is deliberate: no workflows dir means
  // no agent() calls exist, so there is nothing that COULD drift.)
  if (!fs.existsSync(agentsDir)) {
    errors.push(
      '.claude/agents/ does not exist — the roster is the enforcement surface for HARD RULE #27, ' +
      'and without it nothing states the Opus-only policy. Restore it, or retire the rule in ' +
      'CLAUDE.md and engineering/model-policy.md and delete this gate.',
    );
  } else {
    const agents = listAgentFiles(agentsDir);
    if (!agents.length) {
      errors.push(
        '.claude/agents/ has no agent definitions — the roster is the enforcement surface for ' +
        'HARD RULE #27; an empty roster leaves the Opus-only policy unstated. ' +
        'Restore it or retire the rule in engineering/model-policy.md.',
      );
    }
    for (const file of agents) {
      const rel = path.relative(ROOT, file);
      const src = fs.readFileSync(file, 'utf8');
      const fm = /^---\r?\n([\s\S]*?)\r?\n---/.exec(src); // \r? — CRLF is still valid frontmatter
      if (!fm) {
        errors.push(`${rel} has no YAML frontmatter — HARD RULE #27 needs a \`model:\` field there.`);
        continue;
      }
      const declared = declaredModel(fm[1]);
      if (!declared) {
        errors.push(
          `${rel} declares no \`model:\` in its frontmatter (HARD RULE #27), so its tier is whatever ` +
          `the session happens to be set to rather than a property of this repo. Add \`model: opus\` ` +
          `— see engineering/model-policy.md.`,
        );
      } else if (!AGENT_MODELS.includes(declared)) {
        errors.push(
          `${rel} pins \`model: ${declared}\` (HARD RULE #27). This repo runs every agent on \`opus\`; ` +
          `model tiering was tried and retired because a downshifted agent fails silently here ` +
          `(engineering/model-policy.md). Use \`opus\`. (A real tier name runs at that tier; a name ` +
          `the harness does not recognize at all falls back to the session model rather than ` +
          `erroring — both are silent, which is why this is gated.)`,
        );
      }
    }
  }
  for (const file of listWorkflowFiles(workflowsDir)) {
    const rel = path.relative(ROOT, file);
    const { error, calls } = agentCallPins(fs.readFileSync(file, 'utf8'));
    if (error) {
      errors.push(
        `${rel} does not parse (${error}) — the HARD RULE #27 gate cannot read its agent() calls, ` +
        `so it cannot confirm their \`model:\` pins. Fix the syntax.`,
      );
      continue;
    }
    calls.forEach((call, i) => {
      if (call.pinned) return;
      const which = call.label ? `\`${call.label}\`` : `#${i + 1}`;
      const head = `${rel}: agent() call ${which}`;
      errors.push(
        {
          'options-unresolved':
            `${head} passes options the gate cannot resolve statically (HARD RULE #27) — pass an ` +
            `inline object literal, or a module-level \`const\`, so the \`model:\` pin is checkable.`,
          'spread-override':
            `${head} spreads into its options AFTER the \`model:\` key (HARD RULE #27), so the ` +
            `spread silently wins at runtime and the visible pin proves nothing. Put the spread ` +
            `BEFORE \`model: 'opus'\`, or inline the options, so the pin is the last word.`,
          dynamic:
            `${head} computes its \`model:\` rather than naming one (HARD RULE #27), so the gate ` +
            `cannot confirm the tier. Use the string literal \`'opus'\`.`,
          invalid:
            `${head} pins \`model: '${call.value}'\` (HARD RULE #27). This repo runs every agent ` +
            `on \`opus\`; model tiering was tried and retired (engineering/model-policy.md). ` +
            `Use \`'opus'\`.`,
          missing:
            `${head} passes no \`model:\` in its options (HARD RULE #27), so that stage's tier is ` +
            `whatever the session is set to rather than a property of this repo. Add ` +
            `\`model: 'opus'\` to its options per engineering/model-policy.md.`,
        }[call.reason],
      );
    });
  }
}

function checkSkillFreshness(errors) {
  if (!fs.existsSync(SKILLS_DIR)) return; // skills not present — nothing to guard
  for (const a of skillFreshnessAssertions()) {
    const file = path.join(SKILLS_DIR, a.file);
    if (!fs.existsSync(file)) {
      errors.push(`design/skills/${a.file} is missing — the skill-freshness gate expects it.`);
      continue;
    }
    const src = fs.readFileSync(file, 'utf8');
    // Enforce EVERY occurrence of the marker, not just the first — a skill states a
    // count in several human-read places (prose + skeleton + checklist), and a later
    // one can drift while the first stays right. matchAll catches all of them.
    const matches = [...src.matchAll(new RegExp(a.marker.source, `${a.marker.flags.replace('g', '')}g`))];
    if (!matches.length) {
      errors.push(
        `design/skills/${a.file}: the skill-freshness marker for the ${a.what} is gone ` +
        `(expected text matching ${a.marker}). Keep the marker phrasing so the gate can verify the ` +
        `count against ${a.source}, or update the marker in tools/check-ownership.js (checkSkillFreshness).`,
      );
      continue;
    }
    // Fail closed: an assertion whose source count couldn't be determined (null)
    // means the gate can't verify this fact — a loud error, never a silent pass.
    if (a.actual == null) {
      errors.push(
        `design/skills/${a.file}: the skill-freshness gate could not derive the ${a.what} from ` +
        `${a.source} (structural change?). Fix the source-reader in checkSkillFreshness ` +
        `(tools/check-ownership.js) so the ${a.what} can be verified again.`,
      );
      continue;
    }
    for (const mm of matches) {
      const claimed = Number(mm[1]);
      if (claimed !== a.actual) {
        errors.push(
          `design/skills/${a.file}: states ${a.what} = ${claimed}, but ${a.source} has ${a.actual}. ` +
          `A self-contained skill inlines this fact — update the skill's number to ${a.actual}.`,
        );
        break;
      }
    }
  }
  // Every required core token must be NAMED in theme.md, so a token rename can't
  // silently rot the theme skill's teaching (its skeleton + required-list teach them).
  const themeFile = path.join(SKILLS_DIR, 'theme.md');
  if (fs.existsSync(themeFile)) {
    const themeSrc = fs.readFileSync(themeFile, 'utf8');
    const missing = REQUIRED_THEME_TOKENS.filter((t) => !themeSrc.includes(t));
    if (missing.length) {
      errors.push(
        `design/skills/theme.md omits ${missing.length} required core token(s): ${missing.join(', ')}. ` +
        `The theme skill must name every REQUIRED_THEME_TOKENS entry.`,
      );
    }
    // The categorical mental model drifted once already (2026-07 recolor #1022):
    // theme.md taught the retired L≈87/L≈32 recipe and a fixed non-flipping ink,
    // both of which now FAIL checkCatContrast. These markers pin the load-bearing
    // concepts of the current model so a future rewrite that drops them re-rots the
    // skill and is caught here — not just when a NUMBER changes.
    const conceptMarkers = [
      { needle: '--cat-N-texture', what: 'the categorical texture adoption channel (engineering/textures.md)' },
      { needle: 'three-layer', what: 'the three-layer categorical contrast contract (#1022)' },
      { needle: 'checkCatContrast', what: 'the checkCatContrast gate that enforces the categorical contract' },
    ];
    // Search only the TEACHING body, not the "Canonical sources" footer — otherwise
    // a lone link in the footer satisfies the check even if the recipe prose that
    // actually teaches the concept was gutted. The concept must be TAUGHT, not merely
    // mentioned. (Fail closed if the footer heading is absent: search the whole file.)
    const canonIdx = themeSrc.search(/^##\s+Canonical sources/m);
    const teaching = canonIdx === -1 ? themeSrc : themeSrc.slice(0, canonIdx);
    const droppedConcepts = conceptMarkers.filter((c) => !teaching.includes(c.needle));
    if (droppedConcepts.length) {
      errors.push(
        `design/skills/theme.md no longer teaches ${droppedConcepts.length} load-bearing categorical ` +
        `concept(s): ${droppedConcepts.map((c) => `${c.what} [expected the string "${c.needle}"]`).join('; ')}. ` +
        `The theme skill must teach the current categorical model (three-layer contrast + texture channel), ` +
        `not the retired L≈87/L≈32 recipe.`,
      );
    }
  }
  // component.md taught `@layer components` (2026-07), but @layer is inert here and
  // a layered component rule LOSES to an unlayered base rule regardless of specificity
  // (engineering/cascade.md) — following it produced a component whose CSS silently lost
  // the cascade. chart-component.md carried the SAME wrapper in its CSS skeleton (a chart
  // IS a component; every shipped chart CSS — piechart, funnel, map — is unlayered), and
  // the original guard only covered component.md, so it survived the #1032 pass. Pin the
  // correction across BOTH CSS-authoring skills: neither may show an `@layer … {` block
  // wrapper in its CSS, and each must TEACH the unlayered convention (the word "unlayered").
  const CSS_AUTHORING_SKILLS = ['component.md', 'chart-component.md'];
  for (const skill of CSS_AUTHORING_SKILLS) {
    const f = path.join(SKILLS_DIR, skill);
    if (!fs.existsSync(f)) continue;
    const src = fs.readFileSync(f, 'utf8');
    // Match any @layer BLOCK wrapper — `@layer {`, `@layer components {`, `@layer x {` —
    // not just the exact historical string, so a differently-named or anonymous wrapper
    // can't slip the guard. The optional-single-name + `\s*\{` shape deliberately does NOT
    // match the sanctioned declaration form `@layer a, b, c;` (no block), and avoids the
    // cross-file greedy false-match a broad `[^;{]*\{` would cause against prose that
    // mentions `@layer` far above some later `{`.
    if (/@layer(\s+[\w-]+)?\s*\{/.test(src)) {
      errors.push(
        `design/skills/${skill} shows an \`@layer … {\` block wrapper in its CSS. Component/chart CSS is ` +
        'UNLAYERED here (engineering/cascade.md) — a layered rule loses to unlayered base rules regardless ' +
        'of specificity. Remove the wrapper; use bare selectors. (Keep any prose mention of the wrapper ' +
        'without an opening brace so this gate does not false-fire.)',
      );
    }
    if (!/unlayered/i.test(src)) {
      errors.push(
        `design/skills/${skill} no longer teaches the UNLAYERED CSS convention (expected the word ` +
        '"unlayered"). Component/chart CSS carries no `@layer` wrapper (cascade.md); the skill must say so.',
      );
    }
  }
}

// §8 rule 5 + rule 11 — the STANDING ORACLE for split behaviour
// (engineering/decisions/2026-07-22-structure-derived-split-patterns.md). Rule 5 asks for
// "a committed, blessed golden of {component → (axis, read-across, cover-class,
// reshape-class)}, gated in build:check, so a later DOM refactor that drifts a *default*
// fails CI"; rule 11 adds that the record documents a VERIFIED default and never mints one.
//
// Two things fail here, and they catch different classes of defect:
//   (a) TREATMENT CONSISTENCY — a manifest that contradicts its own §0c placement. This is
//       the #1193 class: `matrix-2x2` is resolved as an atomic text grid and `split-compare`
//       as read-across, yet both shipped a live split axis (declared under `adapt.capacity`,
//       which reads like a per-family count estimate but the registry consumes as an OPT-IN),
//       so a portrait render shredded a 2×2 into pages showing two of four quadrants. §0c's
//       own follow-on list named the first and missed the second — prose cannot fail CI.
//   (b) RECORD DRIFT — any change to a component's derived split facts that was not blessed.
//       `npm run oracle:bless` updates the record deliberately; the diff is the review artifact.
function checkSplitOracle(manifests, errors) {
  const { splitFactsFor, treatmentViolations } = require('../lib/core/split-facts');
  const ORACLE = path.join(ROOT, 'test', 'oracle', 'split-oracle.json');
  for (const m of manifests) {
    for (const v of treatmentViolations(m, splitFactsFor(m))) errors.push(v);
  }
  let record = null;
  try { record = JSON.parse(fs.readFileSync(ORACLE, 'utf8')); } catch { /* handled below */ }
  const blessed = record?.components || null;
  if (!blessed) {
    errors.push(
      'split oracle record missing or unreadable (test/oracle/split-oracle.json) — §8 rule 5 ' +
      'requires a committed blessed golden. Run `npm run oracle:bless`.',
    );
    return;
  }
  const fresh = {};
  for (const m of manifests) fresh[m.name] = splitFactsFor(m);
  // §8 rule 11's PRECONDITION, not just its drift half. Diffing recomputed manifest
  // facts can only catch a default that MOVED; it says nothing about whether the
  // default was right the first time, so before this the first `--bless` on a newly
  // enrolled component minted its split behavior and the gate then defended it. The
  // check lives in bless-split-oracle.js and is shared, so the tool that writes the
  // record and the gate that reads it cannot disagree about what "verified" means.
  for (const p of require('./bless-split-oracle').attestationProblems(fresh, record.verified || {})) {
    errors.push(p);
  }
  for (const name of Object.keys(fresh)) {
    if (!blessed[name]) {
      errors.push(
        `${name}: not in the blessed split oracle. A new component's split behavior is a ` +
        `DECISION, not a default (§8 rule 11) — confirm its §0c treatment, then ` +
        `\`npm run oracle:bless\`.`,
      );
      continue;
    }
    for (const k of Object.keys(fresh[name])) {
      const a = JSON.stringify(fresh[name][k]);
      const b = JSON.stringify(blessed[name][k]);
      if (a !== b) {
        errors.push(
          `${name}.${k}: split behaviour DRIFTED from the blessed oracle (${b} → ${a}). ` +
          `If intended, \`npm run oracle:bless\` and justify it in the PR; the record is ` +
          `the review artifact (§8 rule 5). If not, the manifest change has a side effect ` +
          `on how this component splits.`,
        );
      }
    }
  }
  for (const name of Object.keys(blessed)) {
    if (!fresh[name]) {
      errors.push(
        `${name}: in the blessed split oracle but no longer a component — a STALE entry ` +
        `(the record must not rot). Re-bless after confirming the removal was intended.`,
      );
    }
  }
}

/**
 * Every engine/theme stylesheet must PARSE cleanly.
 *
 * esbuild's CSS parser is deliberately forgiving: it warns about a construct it
 * cannot read, drops it, and emits the rest — so `npm run build` succeeded on a
 * bundle carrying literal garbage, and nothing downstream ever said so. The
 * warnings were there the whole time; the minifier just discarded them
 * (`tools/minify-css.js` destructured `{ code }`).
 *
 * That is not cosmetic. A stray `` ` `` in radar.styles.css — a fenced example
 * inside a comment that a bad edit spliced a real rule into — made Marp's
 * stricter postcss reject the WHOLE bundle: `Cannot register theme CSS:
 * lattice.css`, i.e. every Export-to-Marp deck rendering with no palette at all.
 * One unreadable character 265KB into a minified file cost the entire theme.
 *
 * So the signal is promoted to a gate, per FILE (the bundle's line numbers point
 * nowhere useful). Budget 0 — a CSS parse warning is a defect, never a ratchet.
 */
function checkCssSyntax(errors) {
  const esbuild = require('esbuild');
  for (const file of [...listCssFiles(LIB_DIR), ...listCssFiles(THEMES_DIR)]) {
    const rel = path.relative(ROOT, file);
    let warnings = [];
    try {
      ({ warnings } = esbuild.transformSync(fs.readFileSync(file, 'utf8'), { loader: 'css' }));
    } catch (err) {
      errors.push(`${rel}: CSS does not parse — ${err.message.split('\n')[0]}`);
      continue;
    }
    for (const w of warnings) {
      errors.push(
        `${rel}:${w.location?.line ?? '?'}: CSS parse warning — ${w.text}. esbuild drops what ` +
        `it cannot read and builds anyway, but Marp's postcss rejects the whole bundle, so a ` +
        `single unreadable token costs the entire theme registration. Budget is 0.`,
      );
    }
  }
}

// ── Universal table guard (anti-rot for base.elements.css's deny list) ───────
//
// base.elements.css gives every slide a default `<table>` treatment — the gap
// #1292 exposed: until it landed, EVERY table rule in the engine was scoped to a
// component, so a plain GFM table on a `content` slide, a base-modifier slide, or
// an un-classed slide rendered at raw browser defaults.
//
// That default is scoped to the stage's own child AND guarded by a deny list of
// the components that style `<table>` themselves. The deny list is the fragile
// part, and specificity does NOT make it optional — a component rule (0,1,N)
// beats the base element rules (0,0,N) only for the properties it DECLARES, so a
// universal zebra or cell border lands unopposed on a specialist that never
// declared one (compare-table and statute-stack.lane declare no zebra;
// math.derivation borders `tbody tr`, not `td`). A NEW table component that
// forgets the deny entry therefore ships silently double-styled.
//
// So the list is gated the way #22/#24 gate theirs: a component that styles a
// table element and is NOT denied fails, and a denied component that no longer
// styles one fails as stale.
//
// Entries are CLASS SETS, not names, because ownership is at the granularity the
// owning CSS actually claims: `math` styles a table only under `.derivation`, and
// `statute-stack` only under `.lane`. A name-granularity entry for either would
// withhold the default from a bare `_class: math` slide — reintroducing the very
// defect. So a claim of `section.math.derivation td` is denied by `:not(.math
// .derivation)` and NOT by `:not(.math)`, and the gate enforces both directions:
// every claim must be COVERED by some entry (the entry's classes are a subset of
// the claim's), and every entry must EXACTLY equal some claim (so an over-broad
// entry like `:not(.math)` fails instead of silently over-withholding).
//
// COVERAGE BOUNDARY (be honest): a CLAIM is a rule whose SUBJECT — the last
// compound in the selector — is a table element, AND whose selector chains a class
// directly onto a `section`/`figure` compound naming a known component. That is
// the idiom every component uses. Three things are deliberately not claims:
//   • a rule that merely MENTIONS a table in a non-subject position
//     (base.modifiers' `:is(ul,ol,blockquote,table) + p` below-note promotion
//     styles the `<p>`, not the table);
//   • cross-cutting decoration naming no component (base.focus's
//     `[data-focus-*] tr.lat-focus` row treatments), which decorates whatever
//     table it lands on and claims nothing;
//   • base's own SUPPORT rules for the universal treatment — today the dark-bookend
//     ink rebind in base.modifiers.css — which are written `section:is(.title, …)`
//     precisely so they do not read as a claim.
// A fourth check has nothing to do with claims: every rule IN the guard block must
// carry the SAME deny set. See universalTableDenyEntries for why a union is wrong.
//
// KNOWN BLIND SPOTS, recorded rather than papered over — "it cannot rot" would be
// an overstatement, and these are the specific holes:
//   • a component that scopes with an attribute BEFORE its class
//     (`section[data-family="strip"].glossary td`) — the repo stamps `data-family`
//     widely, so this ordering is one refactor away;
//   • native CSS nesting (`section.foo { & td { … } }`) — zero uses in lib/ today,
//     so this is a tripwire rather than a present hole;
//   • `themes/*.css`, which this gate does not walk;
//   • a component the Studio GENERATES at runtime. lib/layout/ai.js tells the
//     generator to style `section.<name> table/thead th/td` with `border-bottom`
//     and says nothing about a zebra, so a generated component's table can take
//     base's row wash unopposed. Its class never appears in lib/, so no gate here
//     can see it and no entry could be added — the fix, if it becomes real, is in
//     the generator's prompt, not here.
const TABLE_ELEMENTS = new Set(['table', 'thead', 'tbody', 'tfoot', 'tr', 'td', 'th', 'caption', 'col', 'colgroup']);
const UNIVERSAL_TABLE_CSS = path.join(ROOT, 'lib', 'base', 'base.elements.css');

/**
 * True when the selector's SUBJECT targets a table element. Delegates to the
 * shared subject resolver (HARD RULE #15) rather than re-deriving it, which is
 * what buys the `> :is(td, th)` case — base.focus.css's resident idiom for
 * styling a cell pair, and a form an author would reasonably copy.
 */
function subjectIsTableElement(sel) {
  return subjectTargetsElement(sel, (el) => TABLE_ELEMENTS.has(el));
}

/** `.a.b` → sorted ['a','b']; the canonical key for a deny entry / a claim. */
function classSetKey(classes) {
  return [...new Set(classes)].sort().join('.');
}

/**
 * Deny entries declared by the universal-table guard, PER table-subject selector.
 *
 * Per-selector, not unioned, and that is the whole point. The block is six rules
 * that each repeat the full guard; a union would report `math.derivation` guarded
 * as long as ONE of the six still named it, so dropping it from just the `td` rule
 * — the exact case that doubles math.derivation's borders — would pass silently.
 * That is the most likely form of rot in a hand-repeated selector, so the gate
 * demands every rule carry the identical set and reports any that is short.
 */
function universalTableDenyEntries(guardCss) {
  const perSelector = [];
  for (const sel of topLevelSelectors(guardCss).flatMap(splitTopLevel)) {
    if (!subjectIsTableElement(sel)) continue;
    const entries = new Set();
    for (const m of sel.matchAll(/:not\(((?:\.[a-z][a-z0-9-]*)+)\)/g)) {
      entries.add(classSetKey(m[1].split('.').filter(Boolean)));
    }
    perSelector.push({ sel: sel.trim(), entries });
  }
  return perSelector;
}

/**
 * Ownership claims on `<table>`: class-set key → the file + selector proving it.
 * A claim is a table-element-subject rule whose selector chains classes directly
 * onto a `section`/`figure` compound naming a known component (see the coverage
 * boundary above). `dirs.libDir` is injectable so the unit test can point the
 * scan at a fixture tree.
 */
function universalTableClaims(componentNames, dirs = {}) {
  const libDir = dirs.libDir || LIB_DIR;
  const guardCss = dirs.guardCss || UNIVERSAL_TABLE_CSS;
  const claims = new Map();
  for (const file of listCssFiles(libDir)) {
    if (file === guardCss) continue;
    const rel = path.relative(ROOT, file);
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    for (const sel of topLevelSelectors(css).flatMap(splitTopLevel)) {
      if (!subjectIsTableElement(sel)) continue;
      for (const m of sel.matchAll(/(?:section|figure)((?:\.[a-z][a-z0-9-]*)+)/g)) {
        const classes = m[1].split('.').filter(Boolean);
        if (!classes.some((c) => componentNames.has(c))) continue;
        const key = classSetKey(classes);
        if (!claims.has(key)) claims.set(key, `${rel} — ${sel.trim()}`);
      }
    }
  }
  return claims;
}

function checkUniversalTableGuard(manifests, errors, dirs = {}) {
  const componentNames = new Set(manifests.map((m) => m.name));
  const guardCssPath = dirs.guardCss || UNIVERSAL_TABLE_CSS;
  const perSelector = universalTableDenyEntries(stripComments(fs.readFileSync(guardCssPath, 'utf8')));
  const relGuard = path.relative(ROOT, guardCssPath);

  if (perSelector.length === 0 || perSelector.every((r) => r.entries.size === 0)) {
    errors.push(
      `${relGuard} declares no universal-table deny guard. The default table treatment must ` +
      `exclude the components that style <table> themselves — see the UNIVERSAL TABLE block's ` +
      `header for why specificity alone does not do it.`,
    );
    return;
  }

  // 0. UNIFORMITY — every rule in the block repeats the SAME guard. The union of
  //    all of them is meaningless: a rule missing one `:not()` is unguarded FOR
  //    THAT PROPERTY, which is precisely how this block breaks.
  const widest = perSelector.reduce((a, b) => (b.entries.size > a.entries.size ? b : a));
  const denied = widest.entries;
  for (const rule of perSelector) {
    const missing = [...denied].filter((d) => !rule.entries.has(d));
    if (missing.length === 0) continue;
    errors.push(
      `a universal-table rule in ${relGuard} does not carry the full deny guard — it is missing ` +
      `${missing.map((m) => `':not(.${m.split('.').join('.')})'`).join(', ')}:\n    ${rule.sel}\n` +
      `Each rule in the UNIVERSAL TABLE block repeats the guard, and a rule that drops an entry ` +
      `is unguarded FOR THE PROPERTIES IT SETS — the deny list is only as strong as its weakest ` +
      `rule. Restore the entry, or remove it from every rule if the component really is gone.`,
    );
  }

  const claims = universalTableClaims(componentNames, { ...dirs, guardCss: guardCssPath });
  const asSet = (key) => new Set(key.split('.'));

  // 1. COVERAGE — every claim is denied by some entry whose classes it carries.
  for (const [key, where] of claims) {
    const claimClasses = asSet(key);
    const covered = [...denied].some((d) => [...asSet(d)].every((c) => claimClasses.has(c)));
    if (covered) continue;
    errors.push(
      `'${key.split('.').join(' + ')}' styles a table element (${where}) but no universal-table ` +
      `deny entry in ${relGuard} covers it. base's default table treatment would land on it for ` +
      `every property it does not itself declare (a zebra wash, a cell border) — silent ` +
      `double-styling. Add ':not(.${key.split('.').join('.')})' to each guard in the UNIVERSAL ` +
      `TABLE block.`,
    );
  }

  // 2. EXACTNESS — every entry names a real claim, at the claim's own granularity.
  //    A stale entry withholds the default from a component that has nothing of its
  //    own; an over-BROAD entry (':not(.math)' when only '.math.derivation' claims a
  //    table) does the same to every slide missing the variant, which is the bug this
  //    check exists to prevent recurring.
  for (const entry of denied) {
    if (claims.has(entry)) continue;
    const broaderThan = [...claims.keys()].filter((k) => {
      const kc = asSet(k);
      return [...asSet(entry)].every((c) => kc.has(c));
    });
    errors.push(broaderThan.length
      ? `over-broad universal-table deny entry ':not(.${entry.split('.').join('.')})' in ` +
        `${relGuard} — no CSS claims a table at that granularity; the actual claim is ` +
        `'${broaderThan[0].split('.').join(' + ')}'. As written the guard also withholds the ` +
        `default from slides carrying only '${entry.split('.').join('.')}', which get raw browser ` +
        `defaults — the defect the UNIVERSAL TABLE block exists to close. Narrow the entry to ` +
        `':not(.${broaderThan[0].split('.').join('.')})'.`
      : `stale universal-table deny entry ':not(.${entry.split('.').join('.')})' in ${relGuard} — ` +
        `no engine CSS scopes a table-element rule to it any more, so the guard is withholding ` +
        `the default table treatment from a component that has nothing of its own. Remove it.`);
  }
}


// ── Committed PDFs: every one is OWNED (HARD RULE #18; #1279) ───────────────────
//
// The defect this closes is not "three globs were too narrow". It is that THE SET OF
// COMMITTED ARTIFACTS WAS NOT THE SET ANY GATE KNEW ABOUT, and nothing asserted they
// matched. `lib/base/_logo/logo.gallery.{light,dark}.pdf` shipped with no builder to
// rebuild them, no pixel-diff to report them and no fit ratchet to measure them —
// three independent blind spots on one path — and they were caught by hand. Widening
// the three globs fixes those two files. This asserts the CLASS: every PDF in
// `git ls-files` is claimed by a rule naming how it is PRODUCED and what WATCHES it.
//
// Each rule must match at least one file, so the table cannot rot: delete a deck and
// its now-empty rule fails, exactly like SANCTIONED_MARGINS and
// SANCTIONED_PREVIEW_BUILDERS.
//
// `watcher: null` is an explicit, reviewable statement that a PDF has no automated
// watcher — not an oversight. It is the honest answer for a reviewer deliverable whose
// own README says it is not a regression baseline, and for evidence frozen beside a
// dated decision record, where rebuilding would destroy the thing being evidenced.
// Does the input the `producer:` field NAMES actually exist for this file?
//
// Every rule below claims a producer, and for most of them the producer is "the sibling
// markdown, rendered". A bare path regex does not check that claim: it certified
// `examples/hand-dropped-orphan.pdf`, `design/bogus.gallery.pdf` and
// `test/integration/baseline-decks/bogus.pdf` as OWNED, with a named producer, for files
// that do not exist and that nothing would ever write. The `lib/base` arm was hardened
// against exactly this in an earlier round and the other nine rules were not — so the
// gate asserted the class for one tenth of the class. (HARD RULE #25 red team, round 3.)
//
// A missing sibling now falls through to the orphan branch, which is the honest answer:
// nothing rebuilds it, so nothing is watching it.
function hasSourceDeck(f, srcName) {
  const src = srcName || f.replace(/\.pdf$/, '.md');
  try {
    return fs.existsSync(path.join(ROOT, src));
  } catch {
    return false;
  }
}

const PDF_OWNERSHIP = [
  {
    // `lib/base/**` is admitted ONLY for a gallery build-bucket-galleries actually
    // knows how to build. The first cut matched all of `lib/base/**` on the strength of
    // EXTRA_GALLERIES existing — so a SECOND hand-authored gallery dropped under
    // lib/base would have passed the "it has a producer" gate with no producer, which
    // is #1279's exact defect recurring under a green check. The gate has to assert the
    // `producer:` field is true of the file, not that a regex matched it. (Red team.)
    // The lib/base arm matches the EXACT PATH the producer writes, not the basename.
    // Matching the name alone certified `lib/base/_bogus/logo.gallery.light.pdf` and
    // `lib/base/logo.gallery.dark.pdf` — files build-bucket-galleries would never write —
    // which is #1279's own defect one directory level away, under a green gate. The
    // gate has to assert the `producer:` field is true OF THIS FILE. (Red team.)
    test: (f) => (/^lib\/components\/.+\.gallery\.(light|dark)\.pdf$/.test(f)
      && hasSourceDeck(f, f.replace(/\.(light|dark)\.pdf$/, '.md')))
      || EXTRA_NAMES.some((n) => f === `${path.relative(ROOT, EXTRA_GALLERIES[n]).split(path.sep).join('/')}/${n}.gallery.light.pdf`
        || f === `${path.relative(ROOT, EXTRA_GALLERIES[n]).split(path.sep).join('/')}/${n}.gallery.dark.pdf`),
    what: 'component, bucket and hand-authored galleries',
    producer: 'tools/build-galleries.js · tools/build-bucket-galleries.js (EXTRA_GALLERIES covers the ones outside lib/components)',
    watcher: 'build:galleries:check · build:bucket-galleries:check · npm run regress (pixel) · tools/golden-diff.mjs (PR montage) · overflow:check',
  },
  {
    test: (f) => /^examples\/[a-z][a-z0-9-]*-gallery\.(light|dark)\.pdf$/.test(f),
    what: 'consolidated showcase galleries',
    producer: 'tools/build-showcase-galleries.js',
    watcher: 'build:showcase-galleries:check · overflow:check',
  },
  {
    test: (f) => /^examples\/([a-z][a-z0-9-]*\/)?[a-z][a-z0-9-]*\.pdf$/.test(f)
      && !/-gallery\.(light|dark)\.pdf$/.test(f) && !f.startsWith('examples/chart-theme-gallery/')
      && hasSourceDeck(f),
    what: 'per-feature demo decks (HARD RULE #9) and the token-contrast set',
    producer: 'sibling .md via tools/build-staged-pdfs.js (pre-commit)',
    // `overflow:check` alone used to be named here and it OVERSTATED the claim: it
    // re-renders the markdown to a scratch dir and deletes it, so it never opens the
    // committed artifact. `regress --scope decks` does (#1379).
    watcher: 'npm run regress (pixel, --scope decks) · overflow:check',
  },
  {
    test: (f) => /^exemplars\/[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*\.pdf$/.test(f) && hasSourceDeck(f),
    what: 'the worked boardroom exemplars',
    producer: 'tools/build-exemplar-pdfs.js · tools/build-staged-pdfs.js (pre-commit)',
    watcher: 'npm run regress (pixel, --scope decks) · test:integration:exemplars · overflow:check',
  },
  {
    test: (f) => /^design\/[a-z][a-z0-9-]*\.gallery\.pdf$/.test(f) && hasSourceDeck(f),
    what: 'design-system demo decks (they live with their owner, not under examples/)',
    producer: 'sibling .md via tools/build-staged-pdfs.js (pre-commit)',
    watcher: 'npm run regress (pixel, --scope decks) · overflow:check',
  },
  {
    test: (f) => /^test\/integration\/baseline-decks\/[a-z][a-z0-9-]*\.pdf$/.test(f) && hasSourceDeck(f),
    what: 'the CI baseline deck',
    producer: 'sibling .md via tools/build-staged-pdfs.js (pre-commit)',
    watcher: 'npm run regress (pixel, --scope decks) · test:integration (page-count assertions) · overflow:check',
  },
  {
    test: (f) => f === 'themes/palette-audit.pdf' && hasSourceDeck(f),
    what: "the theme designer's palette audit",
    producer: 'sibling .md via tools/build-staged-pdfs.js (pre-commit)',
    // Still outside the OVERFLOW corpus on purpose — a designer's sweep, not a shipped
    // deck — but it has a sibling deck and a committed PDF, so the pixel gate reaches it
    // like any other deck golden. That is the point of deriving that corpus from
    // `git ls-files` rather than hand-listing directories (#1379).
    watcher: 'npm run regress (pixel, --scope decks)',
  },
  {
    test: (f) => f === 'kit/Sample-Deck.pdf',
    what: 'the Marp kit sample deck',
    producer: 'tools/build-marp-kit.js — rendered by REAL marp-cli against dist/marp-kit',
    // Deliberately NOT rebuilt through Lattice's own renderer: this PDF exists to show
    // what a recipient's marp-cli produces, so regenerating it with our engine would
    // quietly replace the artifact with one made by the engine it is being compared to.
    watcher: null,
  },
  {
    test: (f) => f.startsWith('examples/chart-theme-gallery/'),
    what: 'the chart bucket rendered under three curated chart palettes',
    producer: 'by hand: lib/components/chart/chart.gallery.md re-rendered per theme (see that folder README)',
    watcher: null, // Its own README: "reviewer deliverables, not regression baselines."
  },
  {
    test: (f) => /^engineering\/decisions\/\d{4}-\d{2}-\d{2}-.+\.pdf$/.test(f),
    what: 'evidence attached to a dated decision record',
    producer: 'none — a frozen artifact of the decision it sits beside',
    watcher: null, // A dated record is a snapshot; rebuilding it would destroy the evidence.
  },
];

/**
 * The two verdicts, as a PURE function of a file list — which is what makes them
 * testable.
 *
 * `checkCommittedPdfs` shells out to `git ls-files` against a module-level `ROOT`, so
 * neither of its failure branches had any injection point: the four tests written for it
 * asserted that the REAL tree is clean and that the table's fields are populated, and
 * inverting the orphan condition or deleting the stale-rule loop outright left the suite
 * green. The CHANGELOG meanwhile claimed the gate was "proven with deliberately-broken
 * canaries in all three directions" — true when it was run by hand, and pointing at
 * evidence that no longer existed. A gate whose failure path cannot be exercised is a
 * gate that certifies nothing. (HARD RULE #23 / #25 checker, round 3.)
 *
 * @param {string[]} files repo-relative PDF paths
 * @returns {{orphans:string[], staleRules:string[]}}
 */
function auditPdfOwnership(files) {
  const hits = PDF_OWNERSHIP.map(() => 0);
  const orphans = [];
  for (const f of files) {
    const i = PDF_OWNERSHIP.findIndex((r) => r.test(f));
    if (i < 0) orphans.push(f);
    else hits[i] += 1;
  }
  return {
    orphans,
    staleRules: PDF_OWNERSHIP.filter((_r, i) => hits[i] === 0).map((r) => r.what),
  };
}

// ─── NUL bytes in tracked text ─────────────────────────────────────────────
// A NUL byte in a text source makes git treat the whole file as BINARY: the diff
// renders as "Binary file not shown", so review sees nothing at all — not the
// change, not the corruption. Two of the eleven errors catalogued in #1252 were
// exactly this, and both were pushed: `tools/check-lint-coverage.js` (commit
// bb8d8a58) and `docs/src/lib/deck-link.test.ts`, whose 18 tests all vanished
// from the diff. Neither reached `main`, and neither was caught by a gate — one
// by a review agent, one by a diffstat that looked wrong.
//
// Both came from the same habit the ticket names: scripted span-replacement that
// computes byte offsets and writes without re-reading the result. That habit is
// discipline (#1252's intervention 2). THIS gate is the cheap mechanical half —
// it cannot stop the bad edit, but it makes the corruption impossible to push
// past `build:check`, which is what "caught by a human, twice" was standing in
// for.
//
// Scope is tracked files with a TEXT extension, as `git ls-files` reports them.
// Binary payloads (fonts, PDFs, images) legitimately carry NULs and are skipped by
// the extension partition below. `dist/**` is NOT in scope, contrary to what this
// comment claimed until #1780: the whole tree is gitignored, so `git ls-files`
// never returns a path under it and the gate has never once looked there. Nothing
// is hiding — `dist/` was scanned directly and is clean, because esbuild
// re-serializes a separator as an escape on its own (`dist/lattice-emulator.js`
// carries `var BACK_SEP = "\0";`) — but a sentence claiming coverage that does
// not exist is how a generator emitting one would go unnoticed.
//
// The ALLOWLIST is EMPTY, and that is the finished state — not a list nobody has
// needed yet.
//
// This gate shipped (2026-08-23) sanctioning the five files that already carried
// a raw NUL, each using one as a composite-key separator inside a string or
// template literal — `${a}<NUL>${b}` — rather than the `\u0000` escape that is
// byte-identical at runtime. Two of them, `AcronymEditor.tsx` (byte 2747) and
// `tools/change-coupling.js` (byte 4089), carried theirs inside the first 8000
// bytes `text=auto` inspects, so git called them binary and `git diff` on either
// printed "Binary files … differ" — review saw nothing at all.
//
// The other three carried theirs PAST byte 8000 and so still diffed as text. They
// were latent, not safe — but not for the reason the first cut of this comment
// gave. It said they were "one prepended paragraph from flipping," which has the
// mechanism exactly backwards: git tests `memchr(buf, 0, min(size, 8000))`, so
// PREPENDING moves the NUL to a higher offset, further from the window. What flips
// such a file is DELETION above the NUL — a hoisted constant, a dropped block.
// Measured on `tools/check-family-tiers.js` (NUL at 47123): prepending 2,200 bytes
// left it a text diff; deleting 40,000 bytes above the NUL turned it binary. The
// conclusion the sentence was defending survives — a latent NUL can become a
// binary diff later, so the gate reads the WHOLE file rather than the first 8000
// bytes — it just gets there by the opposite edit.
//
// #1780 rewrote all ten NULs as their `\uXXXX` escapes, and with them the two raw
// 0x01 bytes sharing two of the same lines in `AcronymEditor.tsx`. Those two are
// NOT the same defect: git's heuristic keys on NUL alone, so a 0x01 never makes a
// file diff as binary (measured — inserting one at byte 200 still gives a text
// diff, and the vendored `mermaid-v11.min.js` carries one unremarked). They went
// because they were invisible bytes on a line being rewritten anyway, which is a
// good enough reason on its own and a different one from the harm above.
//
// The rewrite was verified STRUCTURALLY rather than by re-running the transform:
// the committed blob and the rewritten file were walked in lockstep, asserting
// that every divergence was exactly one raw control byte standing against its
// six-character escape, and that both streams were consumed to the end. That
// shape matters more than it sounds. The obvious check — replace the escapes back
// and compare — reports a false FAILURE on `lib/core/chart-narration.js`, whose
// regex character class already contains the text `\u0000` as part of a
// double-escaped `\\u0000`. A verifier that cannot tell those apart would have
// been read as corruption and sent someone hunting a defect that was not there.
//
// The list is checked BOTH ways, like SANCTIONED_MARGINS: an unlisted file with a
// NUL fails, and a listed file WITHOUT one fails as a stale sanction. With the
// list empty the stale arm has nothing to say and the first arm covers every
// tracked text file — which is the shape to keep. A future entry owes a reason
// that a RAW byte is the only answer, and for a separator it never is: the escape
// compiles to the identical string.
const SANCTIONED_NUL_FILES = [];

const NUL_TEXT_EXTENSIONS = [
  '.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.astro', '.css', '.scss', '.md', '.mdx',
  '.json', '.jsonc', '.yml', '.yaml', '.html', '.svg', '.sh', '.txt', '.toml', '.py',
  '.vtt', '.webmanifest', '.patch', '.gitignore', '.gitattributes', '.nvmrc',
];

// The BINARY half of the same partition. Every tracked file must fall in one list
// or the other, and `nul-byte-gate.test.js` fails on any extension in neither —
// which is the only way an allowlist like this does not rot.
//
// The first cut listed the text extensions alone, and `.astro` was missing: 40
// tracked docs-site source files, exactly the kind this repo writes, invisible to
// the gate. The test that should have caught it asserted a hand-written subset was
// present in the array it was testing — self-referential, so it could not fail for
// the one thing that mattered, a MISSING extension.
const NUL_BINARY_EXTENSIONS = [
  '.pdf', '.png', '.jpg', '.jpeg', '.gif', '.webp', '.avif', '.ico', '.mp3', '.mp4',
  '.wav', '.woff', '.woff2', '.ttf', '.otf', '.eot', '.zip', '.pptx', '.docx', '.xlsx',
];

/**
 * The verdict, as a PURE function of a file list and a reader — which is what
 * makes the FAILURE branch exercisable. `checkCommittedPdfs` above carries the
 * scar that motivates this shape: a gate that shells straight to `git` has no
 * injection point, so its tests can only assert the real tree is clean, and
 * inverting the condition leaves them green.
 *
 * @param {string[]} files repo-relative paths
 * @param {(f:string)=>Buffer} read
 * @returns {string[]} paths whose bytes contain a NUL
 */
function findNulBytes(files, read) {
  const hits = [];
  for (const f of files) {
    if (!NUL_TEXT_EXTENSIONS.some((ext) => f.toLowerCase().endsWith(ext))) continue;
    let buf;
    try {
      buf = read(f);
    } catch {
      continue; // a listed-but-unreadable path (a broken symlink, a deleted file) is not this gate's business
    }
    if (buf.includes(0)) hits.push(f);
  }
  return hits;
}

/**
 * The two verdicts, as a PURE function of the hit list and the allowlist — the
 * shape `checkCommittedPdfs` above had to learn: a check that shells straight to
 * `git` has no injection point, so its tests can only assert the real tree is
 * clean, and inverting the condition leaves them green.
 *
 * @param {string[]} hits files found to contain a NUL
 * @param {string[]} sanctioned the allowlist
 * @returns {{unlisted:string[], stale:string[]}}
 */
function auditNulBytes(hits, sanctioned) {
  return {
    unlisted: hits.filter((f) => !sanctioned.includes(f)),
    stale: sanctioned.filter((f) => !hits.includes(f)),
  };
}

function checkNulBytes(errors) {
  let tracked;
  try {
    // No `.trim()`: `-z` is used precisely so paths arrive byte-exact rather than
    // C-quoted, and trimming would re-corrupt a path with leading/trailing
    // whitespace — which would then be silently SKIPPED (the read throws), hiding
    // a NUL in exactly the file least likely to be looked at. `filter(Boolean)`
    // alone drops the trailing empty element, which is all that is needed.
    tracked = execFileSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
      .split('\0').filter(Boolean);
  } catch (e) {
    // Same rule as checkCommittedPdfs: only a missing git / non-repo checkout is
    // a legitimate skip. Anything else is a defect in THIS gate.
    if (!/ENOENT|not a git repository/i.test(String(e.message || e))) throw e;
    return;
  }
  if (!tracked.length) {
    errors.push('checkNulBytes found NO tracked files — a broken query, not an empty repo.');
    return;
  }

  const { unlisted, stale } = auditNulBytes(
    findNulBytes(tracked, (f) => fs.readFileSync(path.join(ROOT, f))),
    SANCTIONED_NUL_FILES,
  );

  if (unlisted.length) {
    errors.push(
      `${unlisted.length} tracked text file(s) contain a raw NUL byte. Git classifies a file `
      + 'as BINARY when one falls in the first 8000 bytes, and then its diff reads "Binary files '
      + '… differ" — review sees nothing at all (#1252, which caught two of these by hand):\n      '
      + unlisted.slice(0, 12).join('\n      ')
      + (unlisted.length > 12 ? `\n      … and ${unlisted.length - 12} more` : '')
      + '\n    Write the separator as the \\u0000 ESCAPE (byte-identical at runtime) instead of the '
      + 'raw byte. If it is not deliberate, rewrite the file from source rather than patching bytes: '
      + 'the usual cause is a scripted span-replacement that computed an offset into the wrong encoding.',
    );
  }
  for (const f of stale) {
    errors.push(
      `SANCTIONED_NUL_FILES lists "${f}", which no longer contains a NUL byte — a stale `
      + 'sanction. Remove the entry: an allowlist that outlives its defect silently re-opens the hole '
      + 'it was documenting.',
    );
  }
}

function checkCommittedPdfs(errors) {
  let committed;
  try {
    committed = execFileSync('git', ['ls-files', '*.pdf'], { cwd: ROOT, encoding: 'utf8' })
      .split('\n').map((x) => x.trim()).filter(Boolean);
  } catch (e) {
    // ONLY a missing git / non-repo checkout is a legitimate skip. Any other error is a
    // defect in THIS gate, and swallowing it would make the gate certify nothing while
    // reporting success — the exact failure mode it exists to prevent. (The first cut
    // used a bare `catch {}`, which would have gone permanently and silently inert if
    // `execFileSync` had not been imported.)
    if (!/ENOENT|not a git repository/i.test(String(e.message || e))) throw e;
    return;
  }
  if (!committed.length) {
    errors.push('checkCommittedPdfs found NO committed PDFs — the repo ships hundreds, so '
      + 'this is a broken query, not an empty set.');
    return;
  }

  const { orphans, staleRules } = auditPdfOwnership(committed);
  if (orphans.length) {
    errors.push(
      `${orphans.length} committed PDF(s) are owned by NOTHING — no rule in PDF_OWNERSHIP `
      + '(tools/check-ownership.js) claims them, so nothing rebuilds them, nothing pixel-diffs '
      + "them and nothing measures them for fit. That is how lib/base/_logo's goldens went "
      + `stale unnoticed (#1279):\n      ${orphans.slice(0, 12).join('\n      ')}`
      + (orphans.length > 12 ? `\n      … and ${orphans.length - 12} more` : '')
      + '\n    Give it a producer and a watcher, or add a rule saying honestly that it has none.',
    );
  }
  for (const what of staleRules) {
    errors.push(
      `PDF_OWNERSHIP rule "${what}" matches NO committed PDF — a stale `
      + 'sanction. Remove it, or fix the pattern: a rule that matches nothing is a rule '
      + 'that will silently stop covering the files it was written for.',
    );
  }
}

// ── #1595: is a fallback's TARGET held to the same contract as the read? ─────
//
// #1566 shipped the ledger: `SANCTIONED_FALLBACK_READS` records what a `var()`
// fallback lands on and enforces the target mechanically. What it cannot check is
// whether that target carries the SAME CONTRACT — the judgment that would have
// caught `--cat-N-ink` on its merits rather than on its paperwork.
//
// The contract lives in ONE place and it is the token's own NAME: HARD RULE #11
// already makes role-based names canonical and gates them, so `-ink` is text at
// 4.5:1, `-mark` is a shape at 3:1, `-fill` is a surface with no floor.
// `lib/tokens/contracts.js` reads the floor off the name — a dozen patterns, not
// a per-token list that goes stale the first time someone adds a token and
// forgets it (the shape #1560's first cut shipped and had to undo).
//
// Three arms, because the three populations have genuinely different standing:
//
//   1. THE LEDGER, budget 0. Every sanctioned fallback-only token must land on a
//      target with a floor at least as high. This is the issue's actual ask and it
//      is satisfiable TODAY — all 13 rows (twelve --cat-N-texture plus
//      --spectrum-solid) are same-role area hops.
//   2. THE REPO-WIDE BACKLOG, a PINNED SET. 23 distinct chains in lib/ drop a
//      floor: 8 are the `--cat-N-ink → --cat-N-mark` the repo itself MANDATES
//      (`checkCatInkFallback`), the rest an unaudited `→ --accent` family. They are
//      pre-existing and off this change's path, so HARD RULE #18 says LOG them
//      rather than sweep them in. A pinned set, not a count ratchet: a count lets
//      one drop be swapped for another silently, and with a population this small
//      the set costs nothing more and names exactly which chain is new.
//   3. UNCLASSIFIED NAMES, budget 0. A name that declares no role is not a silent
//      pass; it is a HARD RULE #11 conformance failure, listed in
//      SANCTIONED_TOKEN_CONTRACTS with an explicit floor until it is renamed.
//
// engineering/decisions/2026-08-11-fallback-contract-floors.md
//
/**
 * The floor-dropping fallbacks that exist TODAY. Deliberately named `KNOWN_`
 * rather than `SANCTIONED_` — these are LOGGED, not blessed. Nothing here has been
 * measured AA-clean; the list exists so the population cannot grow while it drains,
 * and so removing one shows up as a diff.
 *
 * Fails both ways: an unlisted drop errors, AND an entry that no longer occurs
 * errors as stale — a fixed chain must be deleted from this list, which is what
 * makes draining visible.
 *
 * Two families, and they are not equally defensible:
 *
 *  (a) `--cat-N-ink → --cat-N-mark` — REQUIRED by `checkCatInkFallback`, and a
 *      known 4.5→3.0 drop. The tier has no `:root` default, originally because the
 *      export bundle concatenated the theme BEFORE the base, so a default there would
 *      win and revert every curated ink to its mark (#1527). The fallback therefore
 *      lives at each consumer, and `--cat-N-mark` is the only same-slot value that
 *      exists. In practice the drop is off the path — `derive-cat-ink.js` emits the
 *      tier for every shipped palette — but a theme generated outside this repo lands
 *      on it, which is exactly the 176-of-200 measurement.
 *
 *      **#1527's concat flip has landed, and it removed the REASON this drop has to
 *      exist** — a `:root` ink default would now lose to a palette's own, as intended.
 *      Draining these eight rows is therefore unblocked and still not done: it means
 *      declaring twelve more defaults and holding them to AA on every canvas, which is
 *      its own change with its own case (base.tokens.css records the same at the
 *      `--cat-N-ink` block).
 *
 *  (b) `→ --accent` — the second `--cat-N-ink`, and NOT audited. `--accent` carries
 *      no floor against anything: it is the theme's brand hue, near-black in onyx
 *      and concrete. A `*-ink` read that degrades onto it is a 4.5:1 text
 *      requirement resolving to a value nothing holds to any contrast at all. No
 *      claim is made here that these are AA-clean; they are pre-existing, off this
 *      change's path (HARD RULE #18), and tracked for their own pass.
 */
const KNOWN_CONTRACT_DROPS = [
  // (a) mandated by checkCatInkFallback — 4.5:1 → 3:1, same slot.
  ...[1, 2, 3, 4, 5, 6, 7, 8].map((n) => `--cat-${n}-ink → --cat-${n}-mark`),
  // (b) → --accent, unaudited. Text tier.
  '--code-inline-fg → --accent',
  // '--ink → --accent' was here until #1715. It was not merely a floor drop: `--ink` was
  // declared NOWHERE, so the fallback won on every theme forever. The four reads now point
  // straight at `--text-heading`, a REQUIRED_TOKENS contract token that needs no fallback,
  // and `checkPhantomFallbackTokens` below stops the class from recurring.
  '--jur-ink → --accent',
  '--lane-ink → --accent',
  '--on-dark-watermark → --accent',
  '--panel-label-ink → --accent',
  '--phase-ink → --accent',
  '--row-ink → --accent',
  '--tier-ink → --accent',
  // (b) → --accent, unaudited. Graphical tier — a 3:1 shape onto an unfloored hue.
  '--cat-4-mark → --accent',
  '--cat-7-mark → --accent',
  '--lane-jur → --accent',
  '--panel-mark → --accent',
  '--pill-border → --accent',
  // A text token onto a SURFACE. journey's mood swatch label falls back to the
  // swatch's own background, which is the one value guaranteed NOT to contrast
  // with it. Distinct from (b) and the sharpest single row in the list.
  '--mood-ink → --mood-bg',
  // (c) THREE-LINK CHAINS, where the read lands two hops away on --accent:
  // `var(--cat-N-ink, var(--cat-N-mark, var(--accent)))` in math.styles.css. The
  // pairwise view shows only ink→mark (4.5→3, family (a) above); the read-to-final
  // comparison shows where it ACTUALLY lands on a theme with neither tier, which
  // is 4.5 → no floor at all. Strictly worse than the two-link form and invisible
  // until the end-to-end arm was added.
  '--cat-4-ink → --accent',
  '--cat-7-ink → --accent',
];

/**
 * Every token-hop `var(--a, var(--b))` in lib/, as `{ token, target, where }`.
 * Reuses `bareVarReads` (HARD RULE #15) — the same scanner the ledger and the
 * no-safe-default gate read from, so the three cannot disagree about what a
 * fallback chain is.
 *
 * `//` line comments are stripped from .js/.mjs first. Without that, a JSDoc line
 * in `lib/theme/derive.js` documenting the very pattern this gate polices
 * (`var(--cat-N-ink, var(--cat-N-mark))`) is scanned as a real read, and the gate
 * reports a token named `--cat-N-ink` that does not exist. `bareVarReads` strips
 * only `/* … *​/`, which is right for CSS and short for JS.
 */
function fallbackHops(libDir = LIB_DIR) {
  const stripLineComments = (s) => s.split('\n').map((l) => (/^\s*\/\//.test(l) ? '' : l)).join('\n');
  const into = new Map();
  const walk = (dir) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) { walk(p); continue; }
      if (!/\.(css|js|mjs)$/.test(e.name)) continue;
      let src = fs.readFileSync(p, 'utf8');
      if (/\.(js|mjs)$/.test(e.name)) src = stripLineComments(src);
      bareVarReads(src, path.relative(ROOT, p), into);
    }
  };
  walk(libDir);
  const hops = [];
  for (const [token, reads] of into) {
    for (const r of reads) {
      if (!r.chain?.length) continue;
      let from = token;
      for (const target of r.chain) { hops.push({ token: from, target, where: r.where }); from = target; }
      // THE READ AGAINST THE FINAL TARGET, not only adjacent pairs. A comparison
      // that steps pair-by-pair is defeated by laundering a NON-COLOR token
      // through the middle: `var(--cat-2-ink, var(--anchor-x, var(--cat-2-fill)))`
      // is two hops, ink→metric and metric→area, and `contractDrop` returns null
      // for both because a floor cannot be compared against a length. At runtime
      // `--anchor-x` need not even exist, so the read resolves to `--cat-2-fill`
      // exactly as the two-link version does — the one the gate catches. Comparing
      // the read to where it actually lands closes that.
      if (r.chain.length > 1) hops.push({ token, target: r.chain[r.chain.length - 1], where: r.where });
    }
  }
  return hops;
}

/**
 * Arm 1 + 3 over the ledger's own rows: the recorded claim, checked.
 *
 * Role-STRICT, not merely floor-non-dropping. The ledger's `--cat-N-texture` row
 * justifies itself in as many words as landing "on a CONTRACT token with the same
 * role", and that is the claim to check. A floor comparison alone would accept
 * re-pointing it at `--cat-N-mark` — the floor goes UP, which is safe for
 * contrast and wrong for the chip, which would paint in the deep mark hue instead
 * of the pale fill. Role equality is only meaningful because the three tiers are
 * coarse (ink · graphical · area); see the NO_FLOOR note in lib/tokens/contracts.js.
 */
function ledgerContractProblems(rows = SANCTIONED_FALLBACK_READS) {
  const problems = [];
  for (const row of rows) {
    const verdict = contractDrop(row.token, row.fallback);
    const [a, b] = [contractOf(row.token), contractOf(row.fallback)];
    if (a && b && a.role !== b.role && !verdict) {
      problems.push(
        `SANCTIONED_FALLBACK_READS: --${row.token} is ${a.role} and its fallback --${row.fallback} is ` +
        `${b.role} — a ROLE CHANGE. The floor does not drop, so this is not a contrast defect, but the row's ` +
        'justification claims the same role and it no longer does: an area token falling back to a graphical ' +
        'one paints the deep hue where the pale one belongs. Point it at a same-role token, or rewrite the ' +
        'justification to say what changed and why it is still right.',
      );
      continue;
    }
    if (verdict?.unclassified) {
      problems.push(
        `SANCTIONED_FALLBACK_READS: --${row.token} → --${row.fallback} — no declared role for ` +
        `${verdict.unclassified.map((t) => `--${t}`).join(' and ')}. A token with no role has no contract to ` +
        'compare, so the ledger\'s justification cannot be checked. Rename it to the role vocabulary ' +
        '(HARD RULE #11), or declare its floor in SANCTIONED_TOKEN_CONTRACTS (lib/tokens/contracts.js).',
      );
      continue;
    }
    if (verdict) {
      problems.push(
        `SANCTIONED_FALLBACK_READS: --${row.token} (${verdict.fromRole}, ${verdict.from}:1) falls back to ` +
        `--${row.fallback} (${verdict.toRole}, ${verdict.to}:1) — the target is held to a WEAKER contract than ` +
        'the read needs. That is the --cat-N-ink defect exactly: a value repaired to the graphical floor, ' +
        'then painted as label text. Point the fallback at a same-role token, or derive the token ' +
        '(REQUIRED_TOKENS + lib/theme/derive.js).',
      );
    }
  }
  return problems;
}

function checkFallbackContracts(errors, libDir = LIB_DIR) {
  for (const p of ledgerContractProblems()) errors.push(p);

  // ONE walk. `fallbackHops` re-reads every .css/.js/.mjs under lib/ (~260ms), and
  // the first cut called it twice — once for the scan and once for the empty-scan
  // guard — which put a quarter-second of pure waste into every `build:check`.
  const hops = fallbackHops(libDir);

  // A gate that cannot fail is also a claim (#1535). Every arm below is an
  // assertion about a scan; if the scan found nothing at all, it found nothing
  // because it is broken — lib/ carries hundreds of token-hop fallbacks.
  if (!hops.length) {
    errors.push(
      'checkFallbackContracts scanned lib/ and found NO token-hop var() fallbacks at all. ' +
      'There are hundreds — this is a broken scan, not a clean tree.',
    );
    return;
  }

  const drops = new Map();
  const unclassified = new Map();
  for (const hop of hops) {
    const verdict = contractDrop(hop.token, hop.target);
    if (verdict?.unclassified) {
      for (const t of verdict.unclassified) {
        if (!unclassified.has(t)) unclassified.set(t, hop.where);
      }
      continue;
    }
    if (!verdict) continue;
    const key = `--${verdict.token} → --${verdict.target} (${verdict.from}:1 → ${verdict.to}:1)`;
    if (!drops.has(key)) drops.set(key, hop.where);
  }

  if (unclassified.size) {
    const shown = [...unclassified.entries()].slice(0, 8).map(([t, w]) => `--${t} (${w})`).join(', ');
    errors.push(
      `${unclassified.size} token(s) in a var() fallback chain declare NO ROLE in their name, so their ` +
      `contract cannot be compared: ${shown}${unclassified.size > 8 ? `, +${unclassified.size - 8} more` : ''}. ` +
      'HARD RULE #11 makes role-based names canonical — rename to the vocabulary (`-ink` text, `-mark` ' +
      'graphical, `-fill`/`-bg` surface), or, when the name is not ours to change, declare the floor in ' +
      'SANCTIONED_TOKEN_CONTRACTS (lib/tokens/contracts.js) with the reason.',
    );
  }

  const known = new Set(KNOWN_CONTRACT_DROPS);
  if (known.size !== KNOWN_CONTRACT_DROPS.length) {
    errors.push('duplicate KNOWN_CONTRACT_DROPS entries in tools/check-ownership.js — one row per chain.');
  }
  const fresh = [...drops.keys()].filter((k) => !known.has(k.replace(/ \(.*\)$/, '')));
  if (fresh.length) {
    const shown = fresh.slice(0, 6).map((k) => `${k} at ${drops.get(k)}`).join('; ');
    errors.push(
      `${fresh.length} var() fallback(s) DROP a contrast floor and are not in KNOWN_CONTRACT_DROPS: ${shown}` +
      `${fresh.length > 6 ? `, +${fresh.length - 6} more` : ''}. A read of a 4.5:1 text token that degrades onto ` +
      'a 3:1 shape — or onto --accent, which carries no floor at all — is the --cat-N-ink defect: 176 of 200 ' +
      'sampled brand-mono themes shipped a sub-AA label that way (#1595). Point the fallback at a same-role ' +
      'token, derive the token, or write the value inline at the read (an inline color-mix has no second token ' +
      'to drift onto). Adding a row here is logging a defect, not fixing one — do it only for something you ' +
      'did not introduce.',
    );
  }
  // SANCTIONED_TOKEN_CONTRACTS needs the same staleness arm, and the first cut did
  // not give it one — while `lib/tokens/contracts.js` claimed in a comment that it
  // "cannot rot". A per-token escape hatch with no rot guard is exactly the artifact
  // the classifier's own design argument disqualifies, so the claim was false in the
  // one place it mattered. A token that no longer appears in any fallback chain has
  // no contract left to declare.
  const namesInHops = new Set(hops.flatMap((h) => [h.token, h.target]));
  const staleContracts = SANCTIONED_TOKEN_CONTRACTS
    .filter((s) => !namesInHops.has(s.token))
    .map((s) => `--${s.token}`);
  if (staleContracts.length) {
    errors.push(
      `${staleContracts.length} SANCTIONED_TOKEN_CONTRACTS entr(ies) name a token that appears in no ` +
      `var() fallback chain in lib/: ${staleContracts.join(', ')}. Each row exists to give a token whose ` +
      'NAME cannot carry its role a declared floor; a token the gate never looks at has no contract to ' +
      'declare. Delete the row — most likely it was renamed into the role vocabulary (HARD RULE #11), ' +
      'which is the outcome the row is waiting for.',
    );
  }

  const seen = new Set([...drops.keys()].map((k) => k.replace(/ \(.*\)$/, '')));
  const stale = KNOWN_CONTRACT_DROPS.filter((k) => !seen.has(k));
  if (stale.length) {
    errors.push(
      `${stale.length} KNOWN_CONTRACT_DROPS entr(ies) no longer occur in lib/: ${stale.join(', ')}. ` +
      'The drop was fixed — delete the row. A stale entry is how a list stops covering what it was written for, ' +
      'and here it would also hide the fact that the backlog is draining.',
    );
  }
}

// ─── The muted tier's two floors (#1715) ───────────────────────────────────
//
// `--text-muted` carried TWO declared contracts that contradicted each other, and
// both were written down. Its NAME says text: `lib/tokens/contracts.js` reads the
// floor off the name and returns `{floor: 4.5, role: 'ink'}` for it, because HARD
// RULE #11 makes role-based names canonical. Its own DECLARATION said the
// opposite — every one of the fourteen palettes annotated the line "decorative /
// de-emphasized — chrome, empty/skipped marks, glyphs; WCAG-exempt", and
// `lib/theme/derive.js` said "Muted is DECORATIVE / WCAG-exempt — pass through, no
// repair."
//
// Measured, the value followed the comment and the READS followed the name: below
// AA on 44 of 72 palette-mode-surface pairs (worst 2.11:1, magnolia/light on
// `--bg-alt`) while 53 engine-CSS sites painted real text with it.
//
// #1715 split the role rather than picking a winner, because both readings were
// describing something real: `--text-muted` keeps the name and gains the floor the
// name always promised, and the decoration — rules, hairlines, empty/skipped marks,
// glyph washes — moved to `--muted-mark`, which is named for what it is and takes
// the 3:1 graphical floor. This gate is what makes each half stay true.
//
/**
 * PINNED LITERALS. 4.5 is WCAG AA for normal text and 3.0 is WCAG 1.4.11 for
 * graphical objects; they are written here rather than imported from
 * `lib/theme/color.js` for the reason #1720 §5 records — a gate that takes its
 * floor from the thing it is measuring cannot fail when that thing moves.
 * `CAT_TEXT_FLOOR` above is the same 4.5 and is deliberately not reused: this arm
 * must keep biting even if that constant is retuned for the categorical tier.
 */
const MUTED_TEXT_FLOOR = 4.5;
const MUTED_MARK_FLOOR = 3.0;

/**
 * A CEILING, not a floor — the property the split's own design depends on and the one
 * nothing else in the repo owns.
 *
 * `--text-muted` used to be defined by its distance from `--text-body`; after #1715 its
 * only enforced property is its distance from the CANVAS. Those pull in opposite
 * directions: repairing muted to AA walks it toward the body ink it exists to be quieter
 * than. Measured across the split, 24 of 36 palette-modes lost separation and none gained
 * any — median −20.4%, worst cuoio/light at −80.8% (0.198 → 0.038).
 *
 * A floor alone therefore cannot express the contract. `lib/theme/cat-ink.js` learned the
 * same thing for the categorical ink tier and carries `MIN_DIST` for exactly this reason;
 * the muted tier shipped with the floor and not the ceiling, and an inversion pass found
 * that `lib/theme/derive.js` will manufacture `--text-muted` BYTE-IDENTICAL to
 * `--text-body` from plausible Studio essentials while every gate stays green.
 *
 * 0.030 rather than cat-ink's 0.035: cuoio/light ships at 0.0380 and this pins today's
 * worst as the worst the repo will ever tolerate, with a little room for a re-solve to
 * round. It is deliberately NOT a fresh computation of the same solve — it reads the
 * committed values, so a solver change that moved both sides together would still trip it.
 */
const MUTED_SEPARATION_FLOOR = 0.030;

function checkMutedTierFloors(errors, themesDir = THEMES_DIR) {
  const themes = fs.readdirSync(themesDir)
    .filter((f) => f.endsWith('.css'))
    .map((f) => f.replace(/\.css$/, ''));
  let measured = 0;
  let measuredThemes = 0;

  for (const name of themes) {
    const map = catParseTokens(catPaletteSource(name, new Set(), themesDir));
    // A palette that declares neither token resolves both through its import chain
    // and is measured wherever it lands; one that declares no --bg at all is not a
    // palette (a11y-base is a shared partial) and is skipped by that test alone.
    if (!map.has('--bg') && !map.has('--text-muted')) continue;
    measuredThemes++;

    // PRESENCE, not just value. Checking only the value of a DECLARED token means a
    // palette that omits `--muted-mark` entirely passes silently — and then 76 engine
    // reads of it are invalid at computed-value time on that palette, taking every
    // hairline, grid line, quadrant frame, radar grid, state ring and skipped mark
    // with them. Verified by experiment: stripping --muted-mark from indaco produced
    // ZERO errors before this arm existed.
    //
    // The obligation is keyed on the SIBLING: a palette that authors its own
    // `--text-muted` is a palette that owns this tier and must author both halves.
    // The `-dark` wrappers and the a11y family declare neither and resolve through
    // their import chain, which is correct and stays silent.
    const own = fs.readFileSync(path.join(themesDir, `${name}.css`), 'utf8');
    for (const [text, mark] of [
      ['--text-muted', '--muted-mark'],
      ['--scheme-dark-text-muted', '--scheme-dark-muted-mark'],
    ]) {
      const declaresText = new RegExp(`^\\s*${text}\\s*:`, 'm').test(own);
      const declaresMark = new RegExp(`^\\s*${mark}\\s*:`, 'm').test(own);
      if (declaresText && !declaresMark) {
        errors.push(
          `themes/${name}.css declares ${text} but not ${mark}. A palette that authors the `
          + 'muted TEXT tier owns the muted DECORATION tier too — without it, every engine read '
          + `of ${mark} is invalid at computed-value time on this palette and the rules, `
          + 'hairlines, grid lines and skipped marks it paints disappear (#1715).');
      }
    }

    for (const mode of ['light', 'dark']) {
      const bg = catResolve(map, '--bg', mode);
      const bgAlt = catResolve(map, '--bg-alt', mode);
      if (!bg || !bgAlt) continue;

      // THE CEILING. A quiet tier must stay perceptibly quieter than the body text it
      // exists to be quieter than, or it is a name with no behavior. Checked before the
      // floors so a collapse is reported even on a palette whose values otherwise pass.
      //
      // BOTH quiet tiers, not just muted. `--text-secondary` carries the same contract
      // ("secondary content, AA on both canvases"), is repaired against the same two
      // surfaces a few lines apart in lib/theme/derive.js, and its committed worst is
      // 0.0384 — 0.0004 from muted's 0.0380, i.e. the same value to within noise. It was
      // measured nowhere: #1776 gave the STUDIO meter the row and left the build-time
      // gate over themes/ measuring muted alone, which is a population a fabricated
      // theme never joins and a gate an author never sees, in opposite directions.
      const bodyForSep = catResolve(map, '--text-body', mode);
      for (const quiet of ['--text-muted', '--text-secondary']) {
        const quietForSep = catResolve(map, quiet, mode);
        if (!quietForSep || !bodyForSep) continue;
        const sep = oklabDistance(quietForSep, bodyForSep);
        if (!(sep >= MUTED_SEPARATION_FLOOR)) {
          errors.push(
            `${name}/${mode}: ${quiet} ${quietForSep} sits OKLab ${sep.toFixed(4)} from `
            + `--text-body ${bodyForSep}, under the ${MUTED_SEPARATION_FLOOR} separation floor. `
            + 'A quiet tier defined only by its distance from the canvas collapses into the body '
            + 'ink it exists to be quieter than — the floor cannot express this on its own (#1715).');
        }
      }

      // THE SAME PREDICATE, THE OPPOSITE ROLE. `--text-label` is EMPHASIS, not a quiet
      // tier — "accent-hued labels / kickers" (design/theming.md) — and on palettes with
      // chroma to spare it is separated from body by HUE rather than by a lightness step,
      // which is why it is measured here and not in the loop above. It still has to be
      // TELLABLE FROM BODY, and on cuoio it had stopped being: light label #6F604F against
      // body #6b5d4f decomposed to dL 0.0109, da -0.0002, db 0.0045 — no hue distinction at
      // all, OKLab 0.0118 from body and 0.0638 from the accent it is meant to carry. AA held
      // the whole time (contentPairs() and structural-text-contrast.test.js both pass it),
      // because a floor against the CANVAS cannot see two inks converging on each other.
      // Committed worst after that palette was re-tuned: 0.0355 (brina/dark).
      const labelForSep = catResolve(map, '--text-label', mode);
      if (labelForSep && bodyForSep) {
        const sep = oklabDistance(labelForSep, bodyForSep);
        if (!(sep >= MUTED_SEPARATION_FLOOR)) {
          errors.push(
            `${name}/${mode}: --text-label ${labelForSep} sits OKLab ${sep.toFixed(4)} from `
            + `--text-body ${bodyForSep}, under the ${MUTED_SEPARATION_FLOOR} separation floor. `
            + 'A label tier is accent-hued EMPHASIS; one that has drifted onto the body ink is '
            + 'a kicker nobody can see is a kicker, and its AA reading against the canvas says '
            + 'nothing about that.');
        }
      }

      for (const [token, floor, what] of [
        ['--text-muted', MUTED_TEXT_FLOOR, 'de-emphasized TEXT'],
        ['--muted-mark', MUTED_MARK_FLOOR, 'de-emphasized DECORATION'],
      ]) {
        const value = catResolve(map, token, mode);
        // FAIL CLOSED. `catContrast` returns null on a value it cannot read and
        // `null < 4.5` is TRUE in JS while `NaN < 4.5` is FALSE — either way,
        // guessing here is how a gate ends up measuring nothing. An unreadable
        // value on a palette that declares the token is an error in its own right.
        if (!value) {
          if (map.has(token)) {
            errors.push(
              `checkMutedTierFloors: ${name}/${mode} declares ${token} but it does not resolve to a `
              + 'hex, so nothing can be measured. Fail closed rather than skip.');
          }
          continue;
        }
        for (const [surface, surfaceHex] of [['--bg', bg], ['--bg-alt', bgAlt]]) {
          const ratio = catContrast(value, surfaceHex);
          if (typeof ratio !== 'number' || Number.isNaN(ratio)) {
            errors.push(
              `checkMutedTierFloors: ${name}/${mode} — ${token} vs ${surface} did not produce a `
              + 'number. Fail closed.');
            continue;
          }
          measured++;
          if (ratio < floor) {
            errors.push(
              `${name}/${mode}: ${token} ${value} on ${surface} ${surfaceHex} is ${ratio.toFixed(2)}:1, `
              + `below its ${floor}:1 floor (${what}). ${token === '--text-muted'
                ? 'This token is named for TEXT and lib/tokens/contracts.js classifies it as ink at '
                  + '4.5 — if the value is meant to be decorative, the read belongs on --muted-mark '
                  + 'instead (#1715).'
                : 'A rule, hairline or empty mark still has to be visible — WCAG 1.4.11 (#1715).'}`);
          }
        }
      }
    }
  }

  // ANTI-VACUOUS, and DERIVED from what the run INTENDS to measure rather than from a
  // number typed here. Each theme file contributes 2 modes x 2 tokens x 2 surfaces = 8
  // measurements, so the floor is `themes.length * 8`.
  //
  // The first cut said "14 palettes x 2 modes x 2 tokens x 2 surfaces is 112" and then
  // set the floor to `themes.length * 2`. Both halves were wrong: `themes` is every
  // `.css` in the directory — 32 of them, including the 17 `-dark` wrappers, the five
  // a11y files and `a11y-base` — and the real count is 256. So the guard sat at 64 and
  // would have tolerated losing 75% of coverage silently. That is the same decay #1720
  // recorded in its own harness, where a literal 200 was 93% of the expected 216 and
  // quietly became 69% when the count grew.
  // TWO guards, because one derived from `themes.length` cannot see the palette list
  // ITSELF collapsing — it scales down with the loss and stays green. Verified: pointing
  // the gate at a directory holding two themes passed the derived floor cleanly. So the
  // corpus size is floored on its own, well under today's 32 so a palette can be retired
  // without a false alarm, and far above the "the readdir broke" case.
  const MIN_THEME_FILES = 20;
  if (themes.length < MIN_THEME_FILES) {
    errors.push(
      `checkMutedTierFloors found only ${themes.length} theme file(s) in ${path.relative(ROOT, themesDir)} `
      + `— the repo ships 32, so under ${MIN_THEME_FILES} means the scan is broken, not that palettes were retired.`);
    return;
  }
  // Derived from the palettes actually MEASURED, not from the file count. Keying it to
  // `themes.length` made the gate false-positive on the one case its own comment sanctions:
  // adding a non-palette partial (a second `a11y-base`, which the loop skips by design)
  // raised the expectation by 8 while the measurement stayed put, and the gate reported
  // "the palette scan is broken, not the tree" about a tree that was fine. It also made
  // every real failure emit that line as a spurious second error.
  const expected = measuredThemes * 8;
  if (measured < expected) {
    errors.push(
      `checkMutedTierFloors made ${measured} measurement(s) across ${measuredThemes} palette(s), `
      + `fewer than the ${expected} it intends (2 modes x 2 tokens x 2 surfaces each). Either a `
      + 'palette is missing one of the two tokens — the arm above says which, and fixing that '
      + 'clears this line too — or the scan itself is broken.');
  }
}

// ─── a11y syntax separation UNDER the condition (#1715) ────────────────────
//
// `checkHljsContrast` holds every `--hljs-*` to AA against `--code-bg`, and on the
// four `a11y-*` palettes it PASSED the whole time — every inherited value cleared
// the floor comfortably. Contrast was never what was wrong there.
//
// What was wrong is that two colors can both clear contrast and still be the SAME
// COLOR to the reader the palette exists for. Until #1715 the four declared no
// syntax family at all, so `a11y-base`'s import of `onyx` gave them onyx's:
// `--hljs-string` green at hue 144° beside `--hljs-keyword` red at 17° — the
// red-green axis `a11y-deuteranopia` and `a11y-protanopia` are named for. Measured
// through the simulation, 17 of 55 role pairs on deuteranopia were distinct to a
// normal-sighted reader and collapsed under the condition; 19 of 55 on
// achromatopsia, where hue carries nothing at all.
//
// So this gate measures the SIMULATED values, which no existing gate did:
// `tools/cvd-audit.js` covers the categorical cycle and the status trio but not
// the syntax family, and it has never had an achromatopsia arm at all.
const A11Y_SYNTAX_CONDITIONS = Object.freeze([
  { theme: 'a11y-deuteranopia', condition: 'deuteranopia' },
  { theme: 'a11y-protanopia', condition: 'protanopia' },
  { theme: 'a11y-tritanopia', condition: 'tritanopia' },
  { theme: 'a11y-achromatopsia', condition: 'achromatopsia' },
]);

/** The twelve roles a palette declares. `.hljs-meta` and `.hljs-name` are not
 *  separate tokens — highlight-js.css routes them to `--hljs-type` / `--hljs-tag`. */
const HLJS_ROLES = Object.freeze(['comment', 'keyword', 'built_in', 'number', 'literal',
  'string', 'title', 'type', 'variable', 'params', 'tag', 'punctuation']);

/**
 * PINNED LITERALS, not imported from whatever produced the values — a floor that
 * moves with its producer cannot fail for the reason that matters (#1720 §5, where
 * a gate reusing the recipe's own constants tolerated a 3.2x weakening).
 *
 * Two floors because the two conditions are structurally different, and one number
 * covering both would be the weaker of the two everywhere:
 *
 *   DICHROMACY — two axes survive (lightness, plus position on the one chromatic
 *   axis the condition leaves), so the families are spaced on both. Measured today:
 *   deuteranopia 0.1194, protanopia 0.1143, tritanopia 0.1285.
 *
 *   MONOCHROMACY — only lightness survives, so six roles plus `--code-text` share
 *   one axis and the ceiling is arithmetic. Measured today: 0.0511.
 *
 * Both are far above `checkCatContrast`'s 0.010 collapse floor and the syntax
 * tier's own 0.035 MIN_DIST; neither reaches the 0.15 `tools/cvd-audit.js` uses for
 * CATEGORICAL distinctness, which is a bar for large flat areas of color rather
 * than for small text carrying italics and language structure as well.
 */
const HLJS_SEP_FLOOR_DICHROMACY = 0.11;
const HLJS_SEP_FLOOR_MONOCHROMACY = 0.048;

/**
 * comment and punctuation are BOTH quiet by design, so holding them to the floor
 * above would be asking the palette to make its two de-emphasis roles shout at
 * each other. They are not exempt, though: `checkHljsContrast` polices exactly
 * that pair by name against the repo's 0.010 collapse floor, after an earlier
 * change lifted both to the same AA target and merged them into one gray in eight
 * palettes. That gate owns the pair; this one steps aside rather than duplicating
 * it with a second, different number (HARD RULE #15).
 */
const HLJS_QUIET_PAIR = Object.freeze(['comment', 'punctuation']);

function checkHljsSeparation(errors, themesDir = THEMES_DIR) {
  const { simulate } = require('../lib/theme/cvd.js');
  const { oklabDistance } = require('../lib/theme/color.js');
  let compared = 0;

  for (const { theme, condition } of A11Y_SYNTAX_CONDITIONS) {
    const file = path.join(themesDir, `${theme}.css`);
    if (!fs.existsSync(file)) {
      errors.push(`checkHljsSeparation: themes/${theme}.css is missing — the gate cannot run.`);
      continue;
    }
    // The EMITTED file, flattened through its @import chain — the same reader
    // checkHljsContrast uses, so the two cannot disagree about what a palette says.
    const map = catParseTokens(catPaletteSource(theme, new Set(), themesDir));
    // These palettes are mode-invariant (a11y-base pins color-scheme: light), so
    // 'light' is the only mode that renders. Asking for it explicitly rather than
    // looping both keeps the gate honest about what it measured.
    const mode = 'light';

    // EVERY ROLE THE PALETTE MUST DECLARE ITSELF. Before #1715 these resolved
    // through the a11y-base -> onyx import, which is exactly the defect; so a role
    // that is not declared in this palette's OWN file is an error, not an inherit.
    const own = fs.readFileSync(file, 'utf8');
    const missing = HLJS_ROLES.filter((r) => !new RegExp(`--hljs-${r}\\s*:`).test(own));
    if (missing.length) {
      errors.push(
        `themes/${theme}.css declares no --hljs-${missing.join(', --hljs-')} of its own, so it `
        + "inherits onyx's syntax family through a11y-base — the red-green pair this palette "
        + 'exists to avoid (#1715).');
      continue;
    }

    // The panel, and the UN-highlighted text on it. A syntax role that collides
    // with `--code-text` is as unreadable as two roles colliding, so it is a FIXED
    // member of the set rather than a bystander.
    const bg = catResolve(map, '--code-bg', mode);
    const codeText = catResolve(map, '--code-text', mode);
    // FAIL CLOSED on an operand we cannot read. `oklabDistance` on an unparseable
    // value throws, and a `try`-wrapped skip would make the gate pass while
    // measuring nothing — the shape #1720 had to repair in checkSyntaxInkContrast.
    if (!bg || !codeText) {
      errors.push(
        `checkHljsSeparation: ${theme} — could not resolve `
        + `${!bg ? '--code-bg' : '--code-text'} to a hex, so nothing can be measured against it.`);
      continue;
    }

    const vals = new Map([['code-text', codeText]]);
    let unresolved = null;
    for (const role of HLJS_ROLES) {
      const hex = catResolve(map, `--hljs-${role}`, mode);
      if (!hex) { unresolved = role; break; }
      vals.set(role, hex);
    }
    if (unresolved) {
      errors.push(`checkHljsSeparation: ${theme} — --hljs-${unresolved} does not resolve to a hex.`);
      continue;
    }

    const floor = condition === 'achromatopsia'
      ? HLJS_SEP_FLOOR_MONOCHROMACY : HLJS_SEP_FLOOR_DICHROMACY;
    const entries = [...vals];

    // HOW MUCH COLLAPSE IS "DESIGN"? The pair-skip below treats byte-identical roles as
    // deliberate, which they are — but nothing capped the number of them, and a red team
    // showed the consequence: set TEN of the twelve roles to one color on all four palettes
    // and this gate reports zero errors, because every collapsed pair is skipped and the
    // survivors still clear the comparison count. Syntax highlighting would be gone from the
    // palettes whose entire purpose is that it stays separable, certified by the gate written
    // to protect it.
    //
    // The design is SIX groups, so six distinct values. Floored at five to leave one group
    // free to merge without a gate edit, which is a design call; going below that is not.
    const DISTINCT_MIN = 5;
    const distinct = new Set(HLJS_ROLES.map((r) => String(vals.get(r)).toLowerCase()));
    if (distinct.size < DISTINCT_MIN) {
      errors.push(
        `${theme}: its twelve --hljs-* roles resolve to only ${distinct.size} distinct color(s), `
        + `under the ${DISTINCT_MIN} this palette's six-group design emits. Roles made `
        + 'DELIBERATELY identical are skipped by the separation arm below, so a wholesale '
        + 'collapse would otherwise pass every check while erasing syntax highlighting on the '
        + 'palettes that most need it (#1715).');
    }
    for (let i = 0; i < entries.length; i++) {
      for (let j = i + 1; j < entries.length; j++) {
        const [na, ha] = entries[i];
        const [nb, hb] = entries[j];
        // Roles the palette makes DELIBERATELY identical are not a collapse — they
        // are the design (a twelve-way color distinction does not survive a
        // dichromacy). Only pairs the palette claims are different are measured.
        if (ha.toLowerCase() === hb.toLowerCase()) continue;
        // The two quiet roles are checkHljsContrast's to police; see HLJS_QUIET_PAIR.
        if (HLJS_QUIET_PAIR.includes(na) && HLJS_QUIET_PAIR.includes(nb)) continue;
        compared++;
        const d = oklabDistance(simulate(ha, condition), simulate(hb, condition));
        if (!(d >= floor)) {
          // `--code-text` is in the set but is NOT an --hljs-* token, so it gets its
          // own name in the message rather than a fabricated `--hljs-code-text`.
          const nameOf = (n) => (n === 'code-text' ? '--code-text' : `--hljs-${n}`);
          errors.push(
            `${theme}: ${nameOf(na)} (${ha}) and ${nameOf(nb)} (${hb}) are different colors that `
            + `render ΔE ${d.toFixed(4)} apart UNDER ${condition} — below the ${floor} floor. `
            + 'Two colors that both clear contrast can still be the same color to the reader this '
            + 'palette is for (#1715).');
        }
      }
    }
  }

  // ANTI-VACUOUS. Every arm above `continue`s on a problem it reports, so a broken
  // reader could report one error and zero comparisons; a run that measured nothing
  // is a failure whatever else it said.
  if (compared < 20) {
    errors.push(
      `checkHljsSeparation made only ${compared} comparison(s) across `
      + `${A11Y_SYNTAX_CONDITIONS.length} palettes — it should make dozens, so the scan is broken.`);
  }
}

// ─── Phantom token reads (#1715) ───────────────────────────────────────────
//
// A token READ that no palette declares and no code writes. `--ink` was read four
// times in `lib/base/base.finish.css` as `var(--ink, var(--accent))` from #1606
// until #1715, and `git log -S"--ink:" -- lib themes` is empty: it was phantom
// from the moment the reads were written. The fallback therefore won on every
// theme forever, so a rule whose own comment says "a neutral text-colored rim"
// shipped in the BRAND hue.
//
// WHY NEITHER EXISTING GATE SAW IT, which is the whole reason this one exists:
//
//   `checkNoSafeDefaultTokens`'s `fallbackOnlyTokens` arm opens with
//   `if (!themeTokens.has(token) …) continue;` — its population is limited to
//   tokens SOME shipped palette declares. No palette declares `--ink`, so a
//   phantom falls outside the arm entirely. A phantom is invisible to the gate
//   built to police fallbacks precisely BECAUSE it is a phantom.
//
//   `checkDanglingTokenReads` scans `docs/src` and accepts a token declared
//   ANYWHERE it looked, `docs/src` included. Seven page-local `.astro` prototypes
//   (cadenza, vetrina, lente, suono, the two proto pages) carry their own private
//   `--paper/--stage/--ink/--muted` palette, and those declarations rescued
//   `--ink` for the whole repo — including `chart-anima.ts`, a module whose output
//   renders inside a SLIDE, where a docs page's `:root` block does not exist.
//
// So the rule here is "declared in the ENGINE, or provably WRITTEN at runtime",
// and the writer must be a WRITE the scanner can see rather than a ledger row
// somebody asserted.
//
/**
 * Custom properties the ENGINE itself declares — `lib/**.css`, `dist/**.css`,
 * `themes/**.css`. Deliberately NARROWER than `checkDanglingTokenReads`'s set,
 * for the `.astro`-prototype reason above; the same narrowing
 * `checkAnimaColorVocabulary` already makes, and shared with it (HARD RULE #15).
 *
 * Names are stored WITHOUT the leading `--`, because that is the form
 * `bareVarReads` returns. Both sides normalize through `bareName`; an earlier cut
 * of this gate compared `--`-prefixed declarations against bare read names, so
 * every hop was skipped and the gate reported a clean tree on a tree that still
 * had `--ink` in it.
 */
function engineDeclaredTokens() {
  const out = new Set();
  const files = [
    ...listFilesByExt(LIB_DIR, ['.css']),
    ...listFilesByExt(path.join(ROOT, 'dist'), ['.css']),
    ...listFilesByExt(path.join(ROOT, 'themes'), ['.css']),
  ];
  const into = new Set();
  for (const f of files) declaredCustomProps(fs.readFileSync(f, 'utf8'), into);
  for (const t of into) out.add(bareName(t));
  return { tokens: out, fileCount: files.length };
}

/** `--foo` / `foo` → `foo`. The one normalization both sides of this gate use. */
function bareName(t) { return String(t).replace(/^--/, ''); }

/**
 * Custom properties something WRITES at render time. Three idioms, and all three
 * are live in this repo — which is the point: runtime-set is proven by a write,
 * never asserted by a ledger entry that nothing re-checks.
 *
 *   1. `--x:` inside a JS/TS template literal (generated CSS text) — how
 *      `--fin-backdrop-mask-opaque` is set, by `finish-generate.ts`.
 *   2. `setProperty('--x', …)` — how `--stat-emphasis` and `--safe-bottom` are set.
 *   3. `['--x', value]` PAIR ARRAYS — how `plugins.js` emits the five `--logo-*`
 *      placement tokens into an inline `style`. `declaredCustomProps` does not
 *      recognize this form, and without it two real writers read as phantoms.
 *
 * COMMENTS ARE STRIPPED FIRST, and that is not tidiness. `declaredCustomProps` matches
 * `--x:` anywhere in the text, so a PROSE MENTION counted as a proven write — including
 * front-matter keys discussed in comments (`--class`, `--theme`, `--paginate`) and, worst,
 * any token this repo documents by name. Measured before the fix: 27 of 137 entries (20%)
 * existed only in comments. The failure that matters is specific: re-introduce
 * `var(--ink, var(--accent))` while ANY non-test file under `lib/**` or `docs/src/**`
 * mentions `--ink:` in a comment — which the decision record for this very change makes
 * likely — and `resolves()` returns true, so the gate goes green on the exact defect it
 * exists to catch. Arm B already stripped comments for the same reason; this scan did not.
 *
 * SOURCED FROM CODE, NOT FROM PAGES: `lib/**.{js,mjs}` plus `docs/src`
 * TypeScript/JavaScript emitters, and deliberately NOT `.astro` or `.css` under
 * `docs/src` — a page-local prototype palette is not a writer of engine tokens,
 * and treating it as one is exactly the hole that hid `--ink`. Tests are excluded
 * for the same reason (`test/unit/export/html-player.test.js` declares `--ink:`
 * in a fixture).
 */
function runtimeWrittenTokens() {
  const out = new Set();
  const files = [
    ...listFilesByExt(LIB_DIR, ['.js', '.mjs']),
    ...listFilesByExt(path.join(ROOT, 'docs', 'src'), ['.ts', '.tsx', '.js', '.mjs']),
  ].filter((f) => !/\.test\./.test(path.basename(f)));
  for (const f of files) {
    const src = stripCodeComments(fs.readFileSync(f, 'utf8'));
    const into = new Set();
    declaredCustomProps(src, into);
    for (const t of into) out.add(bareName(t));
    for (const m of src.matchAll(/\[\s*['"`](--[A-Za-z0-9_-]+)['"`]\s*,/g)) out.add(bareName(m[1]));
  }
  return { tokens: out, fileCount: files.length };
}

/**
 * Tokens read in engine CSS that NOTHING in this repo declares or writes, because
 * a DECK sets them. These are real and there are two of them — not the 43-entry
 * allowlist a naive "every bare read in lib/" gate would need, which is why this
 * gate's arm A is scoped to FALLBACK CHAINS (`fallbackHops`) rather than every
 * bare read: a bare `var(--x, auto)` with a literal default is the normal shape of
 * an author knob, and policing it would be all allowlist and no signal.
 *
 * Fails on a STALE entry too, so the list cannot rot.
 */
const AUTHOR_SET_ENGINE_TOKENS = Object.freeze([
  { token: 'fill', why: 'progress: "Authors pin a categorical hue with `--fill`" (progress.styles.css:87). '
    + 'A deck-set knob; the engine only ever reads it, and --chart-cat-1-hue is the default.' },
  { token: 'font', why: 'base.finish: `var(--font-display, var(--font, serif))` — a defensive hop for a '
    + 'consumer theme that sets a generic --font. Ends on a literal, so the rim always resolves.' },
  // The BARE-READ arm's population. Each is a per-deck or per-slide knob an AUTHOR sets in
  // deck CSS; nothing in the repo writes them, and each read carries its own literal default.
  { token: 'fin-edge-repeat', why: 'base.finish: a finish slot a deck or a Studio-fabricated finish sets.' },
  { token: 'footerleft-inset', why: 'footer-left cell: per-deck placement knob, defaults inline.' },
  { token: 'footerleft-w', why: 'footer-left cell: per-deck width knob, defaults inline.' },
  { token: 'pagination-inset', why: 'pagination-right cell: per-deck placement knob, defaults inline.' },
  { token: 'progress-inset', why: 'progress-centre cell: per-deck placement knob, defaults inline.' },
  { token: 'horizon-count', why: 'roadmap horizons: a per-deck column count, defaults inline.' },
  { token: 'qr-ink', why: 'connect/_qr-card: the QR module color, set per deck so a card can match a brand.' },
  { token: 'qr-paper', why: 'connect/_qr-card: the QR quiet-zone color, set per deck alongside --qr-ink.' },
]);

/**
 * #1715's gate. Two arms, ONE rule, budget 0.
 *
 * ARM A — every fallback chain in `lib/`. `fallbackHops()` is the only scanner
 * that enumerates `var(--a, var(--b))` with NO `themeTokens` restriction, so it is
 * the only arm that can see a token no palette declares. Both ends of every hop
 * must be engine-declared, runtime-written, or author-set.
 *
 * ARM B — the docs modules that emit CSS/SVG destined for a SLIDE, where
 * `bareVarReads` is run over the WHOLE file so a BARE read is caught too. Arm A
 * would have missed `chart-anima.ts:216` entirely: `'var(--ink)'` has no fallback
 * at all, and it is the DEFAULT emphasis stroke that `chart-anima-hydrate.ts`
 * uses in production (`highlightMarks: worstMarks(svg)`, no `highlightColor`).
 * `resolveColor` (anima/backends/paint.ts) sets that value on a probe span
 * parented to the host and reads `getComputedStyle`; `color` is INHERITED, so an
 * undeclared property made the declaration invalid at computed-value time and the
 * probe returned the HOST's own text color. Wrong, not absent — the same
 * correction #1720 §7 had to make about this exact mechanism.
 *
 * The emitter list fails on a stale entry, so a renamed or deleted module is a
 * red build rather than an arm that quietly stops scanning.
 */
const SLIDE_BOUND_DOCS_EMITTERS = Object.freeze([
  { file: 'docs/src/lib/chart-anima.ts',
    why: 'emits the inline `stroke:` baked into the chart asset an Anima scene mounts INSIDE a slide.' },
  { file: 'docs/src/components/studio/finish-generate.ts',
    why: 'generates the CSS text of every Studio-fabricated finish, applied to a slide section.' },
]);

function checkPhantomTokenReads(errors) {
  const declared = engineDeclaredTokens();
  const runtime = runtimeWrittenTokens();
  const authorSet = new Set(AUTHOR_SET_ENGINE_TOKENS.map((r) => bareName(r.token)));

  // FAIL CLOSED. Every input is an intersection term: an empty one makes this gate
  // pass while measuring nothing, which is the failure mode it exists to prevent.
  if (declared.fileCount === 0 || declared.tokens.size < 100) {
    errors.push(
      `checkPhantomTokenReads scanned ${declared.fileCount} engine stylesheet(s) and found `
      + `${declared.tokens.size} declared token(s) — the engine ships hundreds, so this is a broken `
      + 'scan, not a clean tree.');
    return;
  }
  if (runtime.fileCount === 0 || runtime.tokens.size === 0) {
    errors.push(
      `checkPhantomTokenReads found ${runtime.tokens.size} runtime-written token(s) across `
      + `${runtime.fileCount} module(s) — the engine writes dozens, so the writer scan is broken.`);
    return;
  }
  const resolves = (t) => declared.tokens.has(t) || runtime.tokens.has(t) || authorSet.has(t);

  // ── Arm A: fallback chains in lib/ ────────────────────────────────────────
  const hops = fallbackHops();
  if (!hops.length) {
    errors.push('checkPhantomTokenReads: fallbackHops() returned no chains from lib/ — a broken scan.');
    return;
  }
  const phantom = new Map(); // bare token -> Set(where)
  for (const h of hops) {
    for (const end of [h.token, h.target]) {
      const t = bareName(end);
      if (resolves(t)) continue;
      if (!phantom.has(t)) phantom.set(t, new Set());
      phantom.get(t).add(h.where);
    }
  }

  // ── Arm C: BARE reads in engine CSS ───────────────────────────────────────
  // Arm A walks fallback CHAINS, so a bare `var(--typo)` in lib/**.css is invisible to it —
  // and `checkDanglingTokenReads` scans docs/src for reads, treating lib/ and dist/ as
  // DEFINITION sources only. Between them, nothing scanned engine CSS for a read that
  // resolves to nothing. That is the shape a mistyped rename takes, and #1715 renamed ~250
  // reads in one pass, so the gate that exists to catch phantom reads was scoped away from
  // this change's own dominant risk. A red team demonstrated it: `--muted-marks` for
  // `--muted-mark` on one line, `check:ownership` green, and in real Chromium the
  // declaration dies at computed-value time — `stroke` goes `none`, `background-color` goes
  // transparent, a `border-*-color` falls back to `currentColor` and paints at full body-ink
  // strength.
  //
  // Template-literal reads (`var(--chart-cat-${n})`) are skipped: the scanner sees a
  // truncated prefix, not a token.
  for (const f of listFilesByExt(LIB_DIR, ['.css'])) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    fs.readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").split('\n').forEach((line, i) => {
      if (/var\(\s*--[A-Za-z0-9_-]+\$\{/.test(line)) return;
      for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const t = bareName(m[1]);
        if (resolves(t)) continue;
        if (!phantom.has(t)) phantom.set(t, new Set());
        phantom.get(t).add(`${rel}:${i + 1}`);
      }
    });
  }

  // ── Arm B: slide-bound docs emitters, BARE reads included ─────────────────
  for (const { file } of SLIDE_BOUND_DOCS_EMITTERS) {
    const abs = path.join(ROOT, file);
    if (!fs.existsSync(abs)) {
      errors.push(
        `checkPhantomTokenReads: SLIDE_BOUND_DOCS_EMITTERS names ${file}, which does not exist. `
        + 'Re-point or delete the entry rather than leaving an arm that scans nothing.');
      continue;
    }
    const src = stripCodeComments(fs.readFileSync(abs, 'utf8'));
    const reads = bareVarReads(src, file);
    if (!reads.size) {
      errors.push(
        `checkPhantomTokenReads: ${file} is listed as a slide-bound emitter but yielded ZERO var() `
        + 'reads. Either it stopped emitting CSS (drop the entry) or the scan broke.');
      continue;
    }
    for (const [token, rs] of reads) {
      const t = bareName(token);
      if (resolves(t)) continue;
      if (!phantom.has(t)) phantom.set(t, new Set());
      for (const r of rs) phantom.get(t).add(r.where);
    }
  }

  if (phantom.size) {
    const shown = [...phantom].sort()
      .map(([t, w]) => `--${t} (${[...w].slice(0, 4).join(', ')})`).join('\n      ');
    errors.push(
      `${phantom.size} PHANTOM token read(s): read in engine CSS or a slide-bound emitter, but no `
      + 'palette declares them and nothing writes them at render time, so the fallback (or the '
      + "inherited value) wins on every theme forever. That is how --ink shipped a 'neutral ink' "
      + `vignette rim in the brand hue from #1606 to #1715:\n      ${shown}\n`
      + '      Fix: point the read at a token that exists (a REQUIRED_TOKENS contract token needs no '
      + 'fallback at all), or — if a DECK is meant to set it — add it to AUTHOR_SET_ENGINE_TOKENS '
      + 'with the reason.');
  }

  // The author-set list is LOGGED, not blessed: a stale entry is an error, so the
  // list shrinks visibly rather than rotting.
  // Read in EITHER arm — a token excused as author-set may appear as a bare read (most of
  // them do) rather than in a fallback chain, and counting only chains made every bare-read
  // entry look stale the moment arm C landed.
  const everRead = new Set();
  for (const h of hops) { everRead.add(bareName(h.token)); everRead.add(bareName(h.target)); }
  for (const f of listFilesByExt(LIB_DIR, ['.css'])) {
    const src = fs.readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of src.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) everRead.add(bareName(m[1]));
  }
  const stale = AUTHOR_SET_ENGINE_TOKENS
    .filter((r) => !everRead.has(bareName(r.token)) || declared.tokens.has(bareName(r.token)));
  if (stale.length) {
    errors.push(
      `${stale.length} AUTHOR_SET_ENGINE_TOKENS entr(ies) are stale — no longer read as a fallback `
      + `chain in lib/, or now declared by the engine: ${stale.map((r) => `--${r.token}`).join(', ')}. `
      + 'Delete them; a list that outlives what it excuses stops describing the tree.');
  }
}

/**
 * HARD RULE #10's landing spot is `changelog.d/`, not `CHANGELOG.md`
 * `## Unreleased` — one file per PR, so two PRs never edit the same region and
 * the merge queue cannot eject either one on a `CHANGELOG.md` conflict (#1593;
 * seven ejections in one evening before this).
 *
 * The FORMAT IS DEFINED ONCE, in tools/changelog.js — the module that assembles
 * a fragment at release time is the module that says what a valid one looks
 * like. This gate only surfaces what it reports, so the two cannot drift into
 * disagreeing (the same `rowFor` discipline #1547 used for the decision index).
 *
 * Fails both ways: a malformed fragment errors, and a MISSING `changelog.d/`
 * errors too — a gate that scans nothing is also a claim.
 */
function checkChangelogFragments(errors) {
  for (const problem of changelogFragmentProblems()) errors.push(problem);
}

// ─── Font-metrics pin ──────────────────────────────────────────────────────
// `GLYPH_UPPER` (lib/components/chart/_chart-family/svg-label.js) is a per-glyph
// advance table for the two faces uppercase tracked chart labels paint in. It
// decides how wide a quadrant corner name or a radar sector name is ESTIMATED to
// be, which decides where the line breaks AND the box `deCollideLabels`/
// `placeLabels` route other labels around.
//
// It is a measurement of two specific woff2 files, frozen as literals — and so
// are the browser measurements the unit suite compares it against (`MEASURED` in
// test/unit/transformers/svg-label.test.js). BOTH SIDES OF THAT COMPARISON SIT
// IN THIS REPO and neither is derived from the font. Bump
// assets/fonts/outfit-700.woff2 and the painted width moves while the table and
// the recorded "measurements" hold still: the unit suite stays green,
// `build:check` stays green, and labels start overrunning their boxes silently.
// A label that overruns also hands the de-collision pass a box narrower than the
// painted glyphs, so a neighboring name prints straight through it.
//
// That is the defect class this gate exists for — not "the table is wrong" but
// "nothing can notice the table going wrong." It fails the build the moment a
// pinned face's bytes move. It does NOT re-derive the table: re-deriving needs a
// real browser, and putting one inside `build:check` would make artifact
// freshness depend on the installed Chromium, so a CI browser bump could redden
// the gate with nothing wrong in the tree. `npm run fonts:measure` is the
// on-demand re-derivation (tools/measure-glyph-advances.js), following the
// `tools/calibrate-*` precedent rather than the `tools/derive-*` one.
//
// KEY PARITY IS ENFORCED BOTH WAYS: a face with a table but no pin fails, and a
// pin naming a face the table dropped fails as stale — the same two-directional
// contract SANCTIONED_MARGINS and SANCTIONED_MONO_FONTS carry, so a third face
// cannot be added un-pinned and the pin cannot rot.
//
// AND EVERY SUPPLY OF EACH FACE, not just the first. Each face ships twice from
// source — `assets/fonts/` for the engine and the export, and a separately
// vendored `docs/src/playground/fonts/` copy that `font-embed.js` inlines into
// the Studio's live preview, which paints these labels through this same kernel.
// Pinning only `assets/` would leave the Studio's supply free to move under a
// green build. `dist/**` copies are generated from `assets/` and already
// byte-diffed by `build:check`, so they are deliberately not listed.
function checkFontMetricsPin(errors, opts = {}) {
  const { fontsRoot = ROOT, tables = GLYPH_UPPER, pins = GLYPH_UPPER_FONTS } = opts;
  const faces = Object.keys(tables);
  const pinned = Object.keys(pins);

  // A gate that scans nothing is also a claim. With both sides empty every loop
  // below is a no-op and this reports green having verified nothing — the exact
  // shape of failure it was written to remove.
  if (!faces.length && !pinned.length) {
    errors.push(
      'font-metrics pin verified nothing — both GLYPH_UPPER and GLYPH_UPPER_FONTS are empty in ' +
      'lib/components/chart/_chart-family/svg-label.js. Either the table was gutted or the export ' +
      'broke; a green result here would be a claim about zero faces.',
    );
    return;
  }

  for (const face of faces) {
    if (pins[face]) continue;
    errors.push(
      `GLYPH_UPPER has a "${face}" face but GLYPH_UPPER_FONTS does not pin one ` +
      '(lib/components/chart/_chart-family/svg-label.js). An unpinned face is a table of ' +
      'measurements no gate can tie to any bytes: swap that face\'s woff2 and every check stays ' +
      'green while its labels overrun. Add a { family, file, sha256 } entry for it.',
    );
  }
  for (const face of pinned) {
    if (tables[face]) continue;
    errors.push(
      `stale font-metrics pin in lib/components/chart/_chart-family/svg-label.js — ` +
      `GLYPH_UPPER_FONTS pins "${face}" but GLYPH_UPPER has no such face. Drop the entry so the ` +
      'pin keeps naming exactly the faces the table measures.',
    );
  }

  for (const face of pinned) {
    const pin = pins[face];
    // EVERY hand-maintained supply of the face, not just the first. A face that
    // ships from two source trees (assets/ for the engine, docs/src/playground/
    // for the Studio's inlined preview fonts) is only pinned when BOTH are — the
    // unpinned one is a silent swap channel exactly like the one this closes.
    const sources = pin.sources || [];
    if (!sources.length) {
      errors.push(
        `GLYPH_UPPER_FONTS.${face} pins no source files — \`sources\` is empty or missing, so this ` +
        'gate would verify nothing for that face and report green. List every hand-maintained ' +
        'woff2 the face ships from as { file, sha256 }.',
      );
      continue;
    }
    for (const src of sources) {
      const abs = path.join(fontsRoot, src.file);
      if (!fs.existsSync(abs)) {
        errors.push(
          `font-metrics pin points at a missing file — GLYPH_UPPER_FONTS.${face} names ` +
          `\`${src.file}\`, which is not on disk. The ${face} face's advance table is measured ` +
          'against bytes that no longer exist; re-point the pin or restore the file.',
        );
        continue;
      }
      const actual = crypto.createHash('sha256').update(fs.readFileSync(abs)).digest('hex');
      if (actual === src.sha256) continue;
      errors.push(
        `font drift — \`${src.file}\` (${pin.family}, the ${face} face) no longer matches the ` +
        `bytes GLYPH_UPPER was measured against.\n      pinned ${src.sha256}\n      actual ${actual}\n` +
        '    The per-glyph advance table in lib/components/chart/_chart-family/svg-label.js is a ' +
        'measurement of the OLD file, and so is the MEASURED array in ' +
        'test/unit/transformers/svg-label.test.js — neither moves on its own, so without this gate ' +
        'the whole suite would stay green while quadrant and radar labels overran their boxes. ' +
        'Re-measure with `npm run fonts:measure` (real Chromium, the shipped faces, the labels\' own ' +
        'CSS), paste the rows it prints into GLYPH_UPPER, update the MEASURED array from its ' +
        '`--strings` output, then update this sha256. Do NOT just update the sha256.',
      );
    }
  }
}

// ── Dangling token reads in docs-site chrome (#1688) ───────────────────────────
//
// A `var(--X)` whose `--X` is declared NOWHERE is not a theming bug you can see
// coming. It has two endings and both are quiet:
//   · WITH a fallback — `var(--chart-2, #9c3f00)` — the hex wins on every palette
//     and every mode, forever. The surface looks fine. It simply never themes,
//     and the `var()` is what makes it look like it does.
//   · WITHOUT one — `color-mix(in srgb, var(--accent) 7%, var(--card))` — the
//     custom property is invalid at computed-value time, which invalidates the
//     WHOLE declaration, so the element falls to its initial value rather than to
//     the previous rule. That is the mechanism that rendered a divider slide
//     white-on-white at 1.0:1 (2026-08-10-no-safe-default-token-contract.md §1).
//
// Twice now this shipped and was found only by reading: `--db-sev-error` /
// `--db-sev-warning` in the lint popup (#1684), then `--chart-2` / `--chart-3` /
// `--chart-4` across 15 Studio files on all 36 palette x mode rows (#1688). Both
// were cheap to catch mechanically and expensive to notice by eye, because the
// failure renders. This gate closes that.
//
// WHY IT IS SAFE TO BE BROAD. The definition set is the union of every custom
// property declared in `docs/src/**` (CSS, CSS-in-JS, inline-style object keys,
// `setProperty`) AND every one the engine declares in `lib/**.css` / `dist/**.css`
// — the latter because the playground bundles and starter decks run INSIDE the
// slide iframe where engine CSS is loaded, so `--fs-body` there is a real read.
// A token defined anywhere reachable is never reported. What survives that union
// is genuinely undeclared.
//
// EXCLUSIONS, and why each is not a hole:
//   · `*.test.*` — tests assert on deliberately fake tokens (`--nope`, `--fg`).
//   · `**/dist/**` under docs/src — vendored build output (Vetrina), not authored
//     here; HARD RULE #2's "never hand-edit generated" cuts both ways.
//   · Comments are stripped, so a record like this one that NAMES a retired token
//     does not trip the gate it documents.
//   · Third-party namespaces (`--sl-` Starlight, `--radix-`, `--tw-`) are declared
//     by packages we do not scan; their absence here says nothing.
//
// Everything else either gets fixed or gets a row below with a justification —
// same idiom as SANCTIONED_MARGINS (#20) and SANCTIONED_PREVIEW_BUILDERS (#22),
// and, like those, a STALE row is an error too, so the ledger cannot rot.
const SANCTIONED_DANGLING_TOKEN_READS = [
  {
    token: '--token',
    why:
      'not a CSS read at all — the literal string "var(--token)" as PROSE. It appears in landing copy ' +
      'teaching the palette-blind rule, in Studio helper text, and inside the Architect/Anima LLM ' +
      'prompts that tell a model to emit palette tokens rather than hex. There is no element whose ' +
      'color depends on it, so there is nothing to resolve.',
  },
  {
    token: '--font-serif',
    why:
      'an OPTIONAL host hook whose fallback is a complete font stack, not a color: ' +
      '`var(--font-serif, Georgia, "Times New Roman", serif)` in the Compose editor. The fallback IS ' +
      'the intended rendering — the editor wants a serif reading surface regardless of palette — so ' +
      'nothing degrades when no theme names one. The engine\'s font vocabulary is --font-body / ' +
      '-display / -label / -mono; whether Compose should adopt one of those is a typography decision, ' +
      'not a token defect.',
  },
  {
    token: '--font-heading',
    why:
      'guided-tour.css reads `var(--font-heading, var(--font-body, inherit))` — the chain terminates ' +
      'on --font-body, which the ENGINE does declare, so this degrades onto a real token rather than ' +
      'onto a literal. Same optional-hook shape as --font-serif, one rung safer.',
  },
  {
    token: '--pg-deck-aspect',
    why:
      'a structural (non-color) playground hook with a literal fallback that is the shipping value: ' +
      '`aspect-ratio: var(--pg-deck-aspect, 16 / 9)`. Nothing sets it today, so the fallback is not a ' +
      'degraded path — it is the only path, and 16/9 is the deck aspect. Kept as a named seam for a ' +
      'future non-16/9 deck rather than deleted.',
  },
  {
    token: '--pg-topbar-h',
    why:
      'the same shape: `top: calc(var(--pg-topbar-h, 56px) + 10px)` positions the focus-restore ' +
      'affordance. A length with a literal fallback cannot invalidate a color or silently stop ' +
      'theming; the worst case is an offset measured against a stale constant.',
  },
];

/**
 * Strip comments so a record ABOUT a dangling token is not itself reported.
 *
 * Block comments go wholesale (this also covers JSX `{/* … *\/}` and the CSS
 * comments inside `.astro` style blocks). Line comments are removed only when the
 * `//` opens the line, which is where every false positive in this repo actually
 * lives — a conservative rule that cannot eat a `https://` inside a string, at the
 * cost of missing a trailing `// var(--x)` after code. That residue is a false
 * POSITIVE (over-reporting), never a miss, so it fails toward the safe side and is
 * sanctionable if it ever appears.
 */
function stripCodeComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => (/^\s*\/\//.test(line) ? '' : line))
    .join('\n');
}

function listFilesByExt(dir, exts, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) listFilesByExt(p, exts, out);
    else if (exts.some((x) => e.name.endsWith(x))) out.push(p);
  }
  return out;
}

/** Every custom property this source DECLARES — CSS rules, CSS-in-JS strings,
 *  inline-style object keys (`'--tone': …`), and `el.style.setProperty('--x', …)`. */
function declaredCustomProps(src, into) {
  for (const m of src.matchAll(/(--[A-Za-z0-9_-]+)\s*['"`]?\s*:/g)) into.add(m[1]);
  for (const m of src.matchAll(/setProperty\(\s*['"`](--[A-Za-z0-9_-]+)/g)) into.add(m[1]);
  return into;
}

const DANGLING_SCAN_EXTS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.astro', '.css'];
const DANGLING_THIRD_PARTY = [/^--sl-/, /^--radix-/, /^--tw-/];

function checkDanglingTokenReads(errors, dirs = {}) {
  const docsSrc = dirs.docsSrc ?? path.join(ROOT, 'docs', 'src');
  const libDir = dirs.libDir ?? LIB_DIR;
  const distDir = dirs.distDir ?? path.join(ROOT, 'dist');

  const docsFiles = listFilesByExt(docsSrc, DANGLING_SCAN_EXTS);
  const engineCss = [...listFilesByExt(libDir, ['.css']), ...listFilesByExt(distDir, ['.css'])];

  const defined = new Set();
  for (const f of [...docsFiles, ...engineCss]) declaredCustomProps(fs.readFileSync(f, 'utf8'), defined);

  const authored = docsFiles.filter((f) => {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    return !/\.test\./.test(rel) && !/(^|\/)dist\//.test(rel);
  });

  const reads = new Map();   // token -> [where]
  for (const f of authored) {
    const rel = path.relative(ROOT, f).split(path.sep).join('/');
    stripCodeComments(fs.readFileSync(f, 'utf8')).split('\n').forEach((line, i) => {
      for (const m of line.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)/g)) {
        const t = m[1];
        if (defined.has(t) || DANGLING_THIRD_PARTY.some((r) => r.test(t))) continue;
        if (!reads.has(t)) reads.set(t, []);
        reads.get(t).push(`${rel}:${i + 1}`);
      }
    });
  }

  // FAIL LOUD ON AN EMPTY SCAN — each input is an intersection term, so a moved
  // directory or a regex that stopped matching would make this gate report clean
  // while checking nothing. A gate is also a claim.
  if (!docsFiles.length || !engineCss.length || defined.size < 100) {
    errors.push(
      `checkDanglingTokenReads scanned successfully but came back nearly empty (docs sources ${docsFiles.length}, ` +
      `engine CSS ${engineCss.length}, declared tokens ${defined.size}) — every one of those is an intersection ` +
      'term, so an empty one silently makes this gate pass. Fix the scan rather than trusting the green.',
    );
    return;
  }

  const sanctioned = new Map(SANCTIONED_DANGLING_TOKEN_READS.map((s) => [s.token, s]));
  if (sanctioned.size !== SANCTIONED_DANGLING_TOKEN_READS.length) {
    const seen = new Set();
    const dupes = new Set();
    for (const { token } of SANCTIONED_DANGLING_TOKEN_READS) {
      if (seen.has(token)) dupes.add(token);
      seen.add(token);
    }
    errors.push(
      `duplicate SANCTIONED_DANGLING_TOKEN_READS entries in tools/check-ownership.js: ${[...dupes].join(', ')}. ` +
      'One row per token, or the justifications can disagree with each other.',
    );
  }

  const unlisted = [...reads.entries()].filter(([t]) => !sanctioned.has(t));
  if (unlisted.length) {
    const shown = unlisted
      .slice(0, 6)
      .map(([t, where]) => `${t} (${where.length}x, e.g. ${where[0]})`)
      .join(', ');
    errors.push(
      `${unlisted.length} token(s) are READ by docs-site chrome and DECLARED NOWHERE — not in docs/src, not in the ` +
      `engine's lib/ or dist/ CSS: ${shown}${unlisted.length > 6 ? `, +${unlisted.length - 6} more` : ''}. ` +
      'A read like this does not fail loudly. With a fallback the literal wins on every palette AND every mode, so ' +
      'the surface looks themed and never is (--chart-2 did this across 15 files and 36 palette x mode rows, #1688); ' +
      'without one the undefined property invalidates the WHOLE declaration at computed-value time, so the element ' +
      'drops to its initial value rather than to the previous rule. Point the read at a token that exists — the ' +
      'palette trio is --pass/--warn/--fail (and --pass-fill/--warn-fill/--fail-fill under white text), the neutrals ' +
      'are --text-heading/--text-body/--text-muted, and Tailwind BRIDGE names (--card, --muted-foreground) are ' +
      'spelled --color-* in styles/tailwind.css so they work in a CLASS but not in a raw var(). If the read is ' +
      'deliberate, add it to SANCTIONED_DANGLING_TOKEN_READS with what the fallback lands on and why that is the ' +
      'intended rendering rather than a degraded one.',
    );
  }

  // Scoped to the REAL tree. The ledger is a global constant describing docs/src as
  // shipped, so comparing it against a synthetic `docsSrc` would report every row as
  // stale purely because that fixture does not contain the read — which is exactly
  // what the `--chart-2` bite below hit, and it would drown the one error that
  // matters. The seam exists so this gate can be bitten with synthetic input; keep it
  // usable, the same way checkNoSafeDefaultTokens guards its own ledger.
  if (docsSrc !== path.join(ROOT, 'docs', 'src')) return;

  const stale = SANCTIONED_DANGLING_TOKEN_READS.filter((s) => !reads.has(s.token)).map((s) => s.token);
  if (stale.length) {
    errors.push(
      `${stale.length} stale SANCTIONED_DANGLING_TOKEN_READS entr(y/ies) in tools/check-ownership.js — ` +
      `${stale.join(', ')} no longer reaches this gate (the read was fixed, removed, or the token is now declared). ` +
      'Delete the row so the ledger keeps describing the tree it claims to describe.',
    );
  }
}

/**
 * Every token in Anima's closed scene-color vocabulary must be declared by the ENGINE.
 *
 * WHY THIS IS NOT COVERED BY `checkDanglingTokenReads`, which scans the same directory for
 * the same `var(--x)` literals. That gate accepts a token declared ANYWHERE it looked —
 * including in `docs/src` itself, where `lattice-tokens.generated.css` declares the docs
 * chrome's own tier. An Anima scene does not render in the docs chrome. It renders inside
 * a SLIDE, against the deck's theme, so a docs-only token resolves to nothing there and
 * the part's `fill:` is dropped at computed-value time. This gate narrows the search to
 * `lib/**.css` + `dist/**.css` — the CSS a rendered deck actually carries.
 *
 * The vocabulary is the validator's allow-set AND the source of the Architect prompt's
 * examples (`SCENE_COLOR_TOKENS`, docs/src/lib/anima/scene-palette.ts), so one wrong entry
 * both teaches a model a dead color and green-lights it on the way back in. That pairing
 * is what shipped `var(--text)` in the prompt for months (#1688).
 */
function checkAnimaColorVocabulary(errors) {
  const file = path.join(ROOT, 'docs', 'src', 'lib', 'anima', 'scene-palette.ts');
  if (!fs.existsSync(file)) {
    errors.push(`checkAnimaColorVocabulary: ${path.relative(ROOT, file)} is missing — the gate cannot run.`);
    return;
  }
  // COMMENTS STRIPPED FIRST. The scan looks for `var(--x)` literals, so a commented-out entry
  // — `// 'var(--text)',  // tried this, it is a phantom, see #1688` — was matched and turned
  // the build RED for a token that is not in the runtime array. Recording why a token was
  // rejected, right where the rejection lives, is exactly what a future author should do.
  const src = stripCodeComments(fs.readFileSync(file, 'utf8'));
  const block = /export const SCENE_COLOR_TOKENS\s*=\s*\[([\s\S]*?)\]\s*as const;/.exec(src);
  if (!block) {
    errors.push(
      'checkAnimaColorVocabulary: could not find `export const SCENE_COLOR_TOKENS = [ … ] as const;` in ' +
      'docs/src/lib/anima/scene-palette.ts. The list moved or changed shape — re-point this gate rather than ' +
      'leaving it silently matching nothing.',
    );
    return;
  }
  // THE ARRAY BODY MUST BE STRING LITERALS AND NOTHING ELSE, or this gate is one level of
  // indirection away from useless. A spread (`...EXTRA_TOKENS,`) or a template literal
  // (`` `var(--${'text'})` ``) puts entries into SCENE_COLOR_TOKENS — and therefore into the
  // Architect prompt, which is generated from it — that the scan never sees. That is not a
  // theoretical hole: `...['var(--syntax-keyword-ink)']` would smuggle THIS CHANGE'S OWN
  // docs-only tier into the scene vocabulary, where `checkDanglingTokenReads` would also pass
  // it (that gate accepts a token declared anywhere, docs/src included) and a slide would render
  // it as an undeclared property. The #1688 defect, reintroduced through the gate written to
  // stop it. So: reject any body element that is not a quoted string.
  const body = block[1];
  const residue = body.replace(/'[^']*'|"[^"]*"|,|\s/g, '');
  if (residue.length) {
    errors.push(
      'checkAnimaColorVocabulary: SCENE_COLOR_TOKENS contains something other than plain string ' +
      `literals (leftover: ${JSON.stringify(residue.slice(0, 60))}). A spread, a template literal or ` +
      'a computed entry puts tokens into the list — and into the Architect prompt built from it — ' +
      'that this gate cannot see, which is the #1688 defect coming back through its own gate. ' +
      'Write the entries out as quoted literals.',
    );
    return;
  }
  const tokens = [...body.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*\)/g)].map((m) => m[1]);
  if (!tokens.length) {
    errors.push('checkAnimaColorVocabulary: SCENE_COLOR_TOKENS parsed to zero entries — a broken scan, not a clean tree.');
    return;
  }
  const engineDeclared = new Set();
  const engineCss = [...listFilesByExt(LIB_DIR, ['.css']), ...listFilesByExt(path.join(ROOT, 'dist'), ['.css'])];
  for (const f of engineCss) declaredCustomProps(fs.readFileSync(f, 'utf8'), engineDeclared);
  if (!engineCss.length || engineDeclared.size < 100) {
    errors.push(
      `checkAnimaColorVocabulary scanned ${engineCss.length} engine stylesheet(s) and found ${engineDeclared.size} ` +
      'declared tokens — both are intersection terms, so an empty one makes this gate pass while checking nothing.',
    );
    return;
  }
  const missing = tokens.filter((t) => !engineDeclared.has(t));
  if (missing.length) {
    errors.push(
      `${missing.length} Anima scene color token(s) are NOT declared in the engine's CSS: ${missing.join(', ')}. ` +
      'A scene painted with one renders in the WRONG color, not in none: an undeclared custom ' +
      'property is invalid at computed-value time, and `color`/`fill` INHERIT, so the part takes the ' +
      "host's inherited color — `backends/paint.ts` resolves it through getComputedStyle, which makes " +
      'that concrete. Measured in real Chromium; an earlier cut of #1688 built a coercion on the ' +
      'opposite premise ("it renders with no color") and had to revert it as a self-inflicted ' +
      'regression, so the premise is spelled out here rather than left to be re-derived. Either the ' +
      'name is wrong (the engine has --text-body / --text-heading, never --text) or the token needs ' +
      'declaring in lib/base/base.tokens.css. Remove it from SCENE_COLOR_TOKENS in ' +
      'docs/src/lib/anima/scene-palette.ts rather than shipping a vocabulary entry the renderer ' +
      'cannot honor.',
    );
  }
}

/**
 * The Studio editor's derived SYNTAX INK tier must be legible on the editor canvas and
 * tellable apart from the colors the same editor paints from other tokens.
 *
 * WHY A SECOND GATE AND NOT `checkHljsContrast`. That gate holds `--hljs-*` to AA against
 * `--code-bg`, the slide's dark code PANEL. This tier is the same hues on a different
 * surface — the Studio editor's `--bg` / `--bg-alt` — and the two answers are not related:
 * 21 of 36 palette-modes put a raw `--hljs-*` below AA on the editor canvas while passing
 * the panel gate, worst 1.01:1. Extending `checkHljsContrast` to a second surface would
 * make it fail on values that are correct for the panel they are tuned for, so the tier
 * gets its own floor against its own surface.
 *
 * IT READS THE COMMITTED STYLESHEET, not `resolvePalettes()`. The first cut called the
 * producer's own function and its docblock claimed to read the emitted values — which was
 * simply false, and it mattered twice over: a hand-edit to
 * `docs/src/styles/lattice-tokens.generated.css` was invisible to it, and "asserts
 * properties of what shipped" was a claim about a computation, not about the file. It now
 * parses the `html[data-palette][data-mode]` blocks out of that file.
 *
 * ITS FLOORS ARE PINNED LITERALS, NOT IMPORTS — and that is the whole reason it can bite.
 * The first cut reused `CAT_TEXT_FLOOR` (4.5) and `CAT_INK_COLLAPSE_DIST` (0.010) while the
 * recipe targets AA + 0.15 = 4.65 and `MIN_DIST` = 0.035. Measured: dropping `MARGIN` to 0
 * in `lib/theme/cat-ink.js` emits 4.5005:1 and the gate PASSED; weakening `MIN_DIST` from
 * 0.035 to 0.011 emitted 0.0110 and the gate PASSED. So it tolerated a 3.2x weakening of
 * the separation target and the complete removal of the contrast margin, while its own
 * comment advertised both as bites. Importing the constants would be worse still — lower
 * `MIN_DIST` and the gate lowers with it, which is the same trap as recomputing with the
 * producer's function.
 *
 * So the floors below are what the tier PROMISES, written down here independently:
 *
 *   AA_ABSOLUTE   4.5    the accessibility floor. Below this the value is a defect.
 *   AA_MARGIN     4.6    the recipe solves to 4.65 deliberately, so "a later rounding or
 *                        regeneration cannot land under the floor" (cat-ink.js). A value
 *                        between 4.5 and 4.6 is still accessible but means the margin was
 *                        SPENT — which is the defect one regeneration before it is visible.
 *   SEPARATION    0.030  under the 0.035 target, far above the 0.010 generic collapse floor.
 *
 * Every operand is hex-guarded before it is measured. `catContrast` returns NaN on a value
 * it cannot parse and `NaN < 4.5` is `false`, so an unparseable canvas or text role would
 * have made this gate pass while measuring nothing — fail-open, in a gate. The generated
 * file already carries `color-mix(...)` values for other token families, so that is a live
 * shape rather than a hypothetical one.
 */
const SYNTAX_INK_AA_ABSOLUTE = 4.5;
const SYNTAX_INK_AA_MARGIN = 4.6;
const SYNTAX_INK_SEPARATION = 0.030;
const SYNTAX_INK_GENERATED_CSS = path.join(ROOT, 'docs', 'src', 'styles', 'lattice-tokens.generated.css');

/** The `html[data-palette][data-mode]` token blocks, parsed out of the committed sheet. */
function parseGeneratedPaletteBlocks(file) {
  const css = fs.readFileSync(file, 'utf8');
  const blocks = new Map();
  for (const m of css.matchAll(/html\[data-palette="([^"]+)"\]\[data-mode="(light|dark)"\]\{([^}]*)\}/g)) {
    const set = {};
    for (const d of m[3].matchAll(/--([a-z0-9-]+)\s*:\s*([^;]+);/g)) set[d[1]] = d[2].trim();
    blocks.set(`${m[1]}/${m[2]}`, set);
  }
  return blocks;
}

function checkSyntaxInkContrast(errors) {
  let TOKENS;
  try {
    ({ SYNTAX_INK_TOKENS: TOKENS } = require('./build-docs-portal'));
  } catch (e) {
    errors.push(
      `checkSyntaxInkContrast could not load SYNTAX_INK_TOKENS from tools/build-docs-portal.js: ${e.message}. ` +
      'A renamed export takes this gate down silently otherwise — fix the import rather than deleting the check.',
    );
    return;
  }
  if (!Array.isArray(TOKENS) || !TOKENS.length) {
    errors.push('checkSyntaxInkContrast: SYNTAX_INK_TOKENS is empty — a broken scan, not a clean tree.');
    return;
  }
  if (!fs.existsSync(SYNTAX_INK_GENERATED_CSS)) {
    errors.push(`checkSyntaxInkContrast: ${path.relative(ROOT, SYNTAX_INK_GENERATED_CSS)} is missing — run \`npm run docs:landing-tokens\`.`);
    return;
  }
  const blocks = parseGeneratedPaletteBlocks(SYNTAX_INK_GENERATED_CSS);
  if (blocks.size < 20) {
    errors.push(
      `checkSyntaxInkContrast parsed only ${blocks.size} palette-mode blocks out of ` +
      `${path.relative(ROOT, SYNTAX_INK_GENERATED_CSS)} — 18 base palettes x 2 modes is 36, so this is a ` +
      'broken parse, not a clean tree.',
    );
    return;
  }
  // The editor roles this tier lands among and cannot move (studioHighlight in
  // docs/src/components/studio/editor-theme.ts): `--text-heading` for property names,
  // `--text-body` for identifiers, `--text-muted` for comments AND punctuation.
  //
  // `--text-muted` is measured here for SEPARATION only, never for CONTRAST, and the
  // distinction is load-bearing: it is below AA on 44 of 72 palette-mode-surface pairs
  // (worst 2.11:1). This tier does not own that token and does not repair it — see
  // `editor-theme.ts` for why pulling those rows into the tier was tried and reverted.
  const FIXED = ['text-heading', 'text-body', 'text-muted'];
  // `keyword` is `--accent` made legible and is deliberately allowed to coincide with
  // `--text-heading`: on 13 palette-modes across seven palettes (`onyx`, `concrete`, the four
  // `a11y-*`, `atelier`/light) the two tokens are BYTE-IDENTICAL, because a monochrome palette
  // chose its ink as its accent. See `deriveSyntaxInks`.
  //
  // THE COST, stated rather than left implicit: `keyword` is therefore never separation-checked
  // at all, so a keyword ink that collided with `--text-body` (identifiers) would go unflagged.
  // None does today — the nearest is well clear — but the surface is unguarded, and "worst dE
  // 0.0350" is a claim about the REPELLED roles only.
  const REPELLED = new Set(['syntax-string-ink', 'syntax-number-ink']);
  const HEX = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
  const failures = [];
  const unreadable = [];
  let evaluated = 0;
  for (const [key, set] of blocks) {
    const operands = [...TOKENS, ...FIXED, 'bg', 'bg-alt'];
    for (const name of operands) {
      const v = set[name];
      if (v == null) { unreadable.push(`${key} --${name} is absent from the block`); continue; }
      if (!HEX.test(String(v).trim())) unreadable.push(`${key} --${name} = ${v} is not a hex literal`);
    }
    for (const token of TOKENS) {
      const ink = set[token];
      if (!ink || !HEX.test(String(ink).trim())) continue;   // already reported above
      for (const surface of ['bg', 'bg-alt']) {
        const bg = set[surface];
        if (!bg || !HEX.test(String(bg).trim())) continue;
        evaluated += 1;
        const ratio = catContrast(ink, bg);
        if (!Number.isFinite(ratio)) { unreadable.push(`${key} --${token} vs --${surface}: contrast did not compute`); continue; }
        if (ratio < SYNTAX_INK_AA_ABSOLUTE) {
          failures.push(`${key} --${token} ${ink} on --${surface} ${bg} = ${ratio.toFixed(2)}:1, BELOW the ${SYNTAX_INK_AA_ABSOLUTE}:1 AA floor`);
        } else if (ratio < SYNTAX_INK_AA_MARGIN) {
          failures.push(
            `${key} --${token} ${ink} on --${surface} ${bg} = ${ratio.toFixed(2)}:1 — above AA but the recipe's ` +
            `margin is gone (it solves to 4.65; anything under ${SYNTAX_INK_AA_MARGIN} means MARGIN was spent or dropped)`,
          );
        }
      }
      if (!REPELLED.has(token)) continue;
      const others = [
        ...FIXED.map((f) => [`--${f}`, set[f]]),
        ...TOKENS.filter((t) => t !== token).map((t) => [`--${t}`, set[t]]),
      ];
      for (const [label, other] of others) {
        if (!other || !HEX.test(String(other).trim())) continue;
        evaluated += 1;
        const dist = oklabDistance(ink, other);
        if (!Number.isFinite(dist)) { unreadable.push(`${key} --${token} vs ${label}: distance did not compute`); continue; }
        if (dist < SYNTAX_INK_SEPARATION) {
          failures.push(
            `${key} --${token} ${ink} sits ${dist.toFixed(4)} from ${label} ${other} in OKLab — under the ` +
            `${SYNTAX_INK_SEPARATION} the repulsion pass exists to hold (it targets 0.035)`,
          );
        }
      }
    }
  }
  if (unreadable.length) {
    errors.push(
      `${unreadable.length} syntax-ink operand(s) could not be measured, so they were NOT checked: ` +
      `${unreadable.slice(0, 6).join('; ')}${unreadable.length > 6 ? `, +${unreadable.length - 6} more` : ''}. ` +
      'An unmeasurable value is an UNCHECKED value, not a passing one — this gate fails closed on purpose.',
    );
  }
  // A gate that cannot fail is also a claim. 36 blocks x 3 tokens x (2 surfaces + 4 separation
  // pairs for the two repelled roles) is well over 200 measurements.
  if (evaluated < 200) {
    errors.push(
      `checkSyntaxInkContrast made only ${evaluated} measurements across ${blocks.size} blocks — ` +
      'that is a broken scan, not a clean tree.',
    );
    return;
  }
  if (failures.length) {
    errors.push(
      `${failures.length} Studio syntax ink value(s) fail on the editor canvas: ${failures.slice(0, 8).join('; ')}` +
      `${failures.length > 8 ? `, +${failures.length - 8} more` : ''}. The tier is derived by deriveSyntaxInks ` +
      'in tools/build-docs-portal.js — fix the recipe (or the palette seed it reads) rather than the emitted ' +
      'value, which `npm run docs:landing-tokens` regenerates over.',
    );
  }
}

function run() {
  const manifests = loadAll();
  const errors = [];
  checkCssSyntax(errors);
  checkUniversalTableGuard(manifests, errors);
  checkTransformerNames(errors);
  checkLayoutOwnership(errors);
  checkComponentNames(manifests, errors);
  checkComponentCss(manifests, errors);
  checkRelatedTargets(manifests, errors);
  checkVariantDeclaration(manifests, errors);
  checkTagClustering(manifests, errors);
  checkThemeTokenParity(errors);
  checkNoSafeDefaultTokens(errors);
  checkRetiredTokenNames(errors);
  checkPackedRootReach(errors);
  checkTypographyTokens(errors);
  checkLabelVoiceFont(errors);
  checkMarginDiscipline(errors);
  checkStageInsetOwnership(errors);
  checkBackgroundLayerVars(errors);
  checkMathRendererParity(errors);
  checkSectionBoxOwnership(errors);
  checkSizeRegistryOwnership(errors);
  checkThemeIdentity(errors);
  checkThemeRegistrationCallSites(errors);
  checkSectionCqAnchoring(errors);
  checkCascadeLayers(errors);
  checkZPlanes(errors);
  checkHexLiterals(errors);
  checkUsEnglish(errors);
  checkTypedGlyphs(errors);
  checkAdaptDeclarations(manifests, errors);
  checkSolverIntentDeclared(manifests, errors);
  checkRenderNature(manifests, errors);
  checkDensityCoverage(manifests, errors);
  checkDiagramScopeSelectors(errors);
  checkClassAttrReads(errors);
  checkFrontMatterReaders(errors);
  checkLineEndingBoundaries(errors);
  checkPreviewHtmlSinks(errors);
  checkRuntimeMarkupSinks(errors);
  checkSnapshotHtmlSinks(errors);
  checkOpenRouterBudget(errors);
  checkE2ESleeps(errors);
  checkVoiceSampleAssets(errors);
  checkVetrinaBoundary(errors);
  checkCadenzaBoundary(errors);
  checkAnimaBoundary(errors);
  checkSuonoBoundary(errors);
  checkLenteBoundary(errors);
  checkAudioPlaybackBoundary(errors);
  checkSanctionedGestures(errors);
  checkThemeManifestCoverage(errors);
  checkThemeManifestShape(errors);
  checkThemeRoles(errors);
  checkThemeModes(errors);
  checkCatContrast(errors);
  checkSkillFreshness(errors);
  checkAgentModelPinning(errors);
  checkSplitOracle(manifests, errors);
  checkCommittedPdfs(errors);
  checkNulBytes(errors);
  checkChangelogFragments(errors);
  checkDanglingTokenReads(errors);
  checkAnimaColorVocabulary(errors);
  checkSyntaxInkContrast(errors);
  checkFontMetricsPin(errors);
  checkFallbackContracts(errors);
  checkPhantomTokenReads(errors);
  checkHljsSeparation(errors);
  checkMutedTierFloors(errors);
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
  checkRelatedTargets,
  run,
  checkE2ESleeps,
  e2eSleepCensus,
  SANCTIONED_E2E_SLEEPS,
  // Theme-manifest gates + their pure helpers, exported so the suite can drive them
  // against synthetic fixtures rather than only asserting the shipped tree is clean —
  // a gate only proves something if you can watch it fail.
  checkThemeManifestCoverage,
  checkThemeManifestShape,
  checkThemeRoles,
  checkThemeModes,
  themeRootScheme,
  themeArmsDiffer,
  themeActualModes,
  splitLightDark,
  listThemeManifests,
  checkZPlanes,
  definedPlaneTokens,
  collectZIndexDeclarations,
  checkCommittedPdfs,
  checkNulBytes,
  findNulBytes,
  auditNulBytes,
  NUL_BINARY_EXTENSIONS,
  SANCTIONED_NUL_FILES,
  NUL_TEXT_EXTENSIONS,
  checkChangelogFragments,
  checkFontMetricsPin,
  checkFallbackContracts,
  ledgerContractProblems,
  fallbackHops,
  checkPhantomTokenReads,
  checkHljsSeparation,
  checkMutedTierFloors,
  A11Y_SYNTAX_CONDITIONS,
  HLJS_ROLES,
  engineDeclaredTokens,
  runtimeWrittenTokens,
  AUTHOR_SET_ENGINE_TOKENS,
  SLIDE_BOUND_DOCS_EMITTERS,
  KNOWN_CONTRACT_DROPS,
  SANCTIONED_TOKEN_CONTRACTS,
  auditPdfOwnership,
  PDF_OWNERSHIP,
  checkUniversalTableGuard,
  universalTableDenyEntries,
  universalTableClaims,
  subjectIsTableElement,
  TABLE_ELEMENTS,
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
  checkRenderNature,
  RENDER_NATURES,
  RENDER_BUCKETS,
  RENDER_NOTE_MIN,
  checkDensityCoverage,
  SANCTIONED_DENSITY_EXEMPT,
  checkTagClustering,
  checkRetiredTokenNames,
  checkPackedRootReach,
  rootDeclSites,
  RETIRED_TOKEN_NAMES,
  checkTypographyTokens,
  nonCanonicalFsTokens,
  offendingMargins,
  sectionBoxOffences,
  sectionCqOffences,
  rootOnlyAnchorOffences,
  sectionOwnTokenLeaks,
  checkSectionCqAnchoring,
  SECTION_CQ_BUDGET,
  SANCTIONED_SECTION_CQ,
  targetsSectionElement,
  SECTION_BOX_PROPS,
  checkSectionBoxOwnership,
  checkSizeRegistryOwnership,
  checkThemeIdentity,
  checkThemeRegistrationCallSites,
  SANCTIONED_SECTION_BOXES,
  checkLabelVoiceFont,
  LABEL_VOICE_MONO_BUDGET,
  SANCTIONED_MONO_FONTS,
  monoFontFamilies,
  checkMarginDiscipline,
  checkBackgroundLayerVars,
  varInMultiLayerBackground,
  SANCTIONED_BACKGROUND_LAYERS,
  checkMathRendererParity,
  katexOnlySelectors,
  LAYOUT_MARGIN_BUDGET,
  SANCTIONED_MARGINS,
  layerBlocksIn,
  checkCascadeLayers,
  LAYER_BLOCK_BUDGET,
  SANCTIONED_LAYER_BLOCKS,
  CANONICAL_LAYER_ORDER,
  LAYER_INERT_SENTINEL,
  checkClassAttrReads,
  classAttrOffences,
  SANCTIONED_CLASS_ATTR_READS,
  checkLineEndingBoundaries,
  SANCTIONED_EOL_BOUNDARIES,
  SANCTIONED_EOL_NON_BOUNDARIES,
  EOL_FOLD_IDIOM,
  EOL_BOM_STRIP,
  EOL_WRONG_FOLD,
  checkPreviewHtmlSinks,
  checkDocumentStyleSinks,
  checkCssTreeRewrapSinks,
  checkRuntimeMarkupSinks,
  DOC_ASSEMBLER_MARKER,
  SANCTIONED_STYLE_SINK_EXEMPT,
  DOC_STYLE_SINK_ROOTS,
  checkSnapshotHtmlSinks,
  SANCTIONED_SNAPSHOT_SINKS,
  SNAPSHOT_INJECT_MARKER,
  SNAPSHOT_WRITE_MARKER,
  SNAPSHOT_KEY_LITERALS,
  listSnapshotFiles,
  referencesSnapshot,
  checkOpenRouterBudget,
  SANCTIONED_OPENROUTER_SPENDERS,
  SANCTIONED_OPENROUTER_WORKFLOWS,
  checkVoiceSampleAssets,
  listSourceFiles,
  checkDanglingTokenReads,
  checkAnimaColorVocabulary,
  checkSyntaxInkContrast,
  SANCTIONED_DANGLING_TOKEN_READS,
  stripCodeComments,
  listFilesByExt,
  SANCTIONED_PREVIEW_BUILDERS,
  SANCTIONED_RUNTIME_MARKUP_SINKS,
  PREVIEW_BUILDER_MARKER,
  SANITIZE_CALL,
  STYLE_SINK_MARKER,
  SANITIZE_STYLE_CALL,
  checkHexLiterals,
  checkSplitOracle,
  LAYOUT_HEX_BUDGET,
  SANCTIONED_HEX,
  checkUsEnglish,
  listRepoTextFiles,
  UK_ENGLISH_FORMS,
  US_ENGLISH_BUDGET,
  TYPED_GLYPH_BUDGET,
  decodeCssEscapes,
  SANCTIONED_GLYPH_DECKS,
  checkTypedGlyphs,
  CANONICAL_FS_TOKENS,
  parseThemeTokens,
  listBasePalettes,
  CO_OWNED_LAYOUTS,
  SHARED_SELECTORS,
  REQUIRED_THEME_TOKENS,
  SINGLETON_TAGS,
  checkVetrinaBoundary,
  checkCadenzaBoundary,
  checkAnimaBoundary,
  ANIMA_DIR,
  ANIMA_ADAPTER_DEPS,
  SUONO_SPEC_PATTERNS,
  stripJsComments,
  checkSuonoBoundary,
  checkLenteBoundary,
  checkAudioPlaybackBoundary,
  SANCTIONED_LEGACY_AUDIO,
  RAW_AUDIO_PATTERNS,
  checkSanctionedGestures,
  SANCTIONED_GESTURES,
  checkSkillFreshness,
  skillFreshnessAssertions,
  checkAgentModelPinning,
  declaredModel,
  agentCallPins,
  listWorkflowFiles,
  AGENT_MODELS,
  checkCatContrast,
  catResolve,
  catContrast,
  checkCatInkDeclared,
  CAT_TEXT_FLOOR,
  CAT_EDGE_FLOOR,
  CAT_COLLAPSE_FLOOR,
  CAT_INK_COLLAPSE_DIST,
  catInkCollapsePairs,
  checkCatInkFallback,
  checkHljsContrast,
  HLJS_TOKENS,
  checkNoSafeDefaultTokens,
  noSafeDefaultTokens,
  fallbackOnlyTokens,
  SANCTIONED_FALLBACK_READS,
  cssRuleBlocks,
  rootScopedTokens,
  slideScopedTokens,
  isUnconditionalRoot,
  isSlideRoot,
  isExportParsedRoot,
  scopedTokens,
  ruleRanges,
  parseVarChain,
  bareVarReads,
  mermaidMapTokenReads,
  VETRINA_DIR,
  VETRINA_ADAPTER,
  VETRINA_IMPORT,
};
