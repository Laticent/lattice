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
 *   `:root:root { color-scheme: light }`     a HARD pin (a11y-base: color-vision
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
    const imports = [...css.matchAll(/@import\s+['"]([^'"]+)['"]/g)].map((x) => x[1]);
    const imp = imports[0] ?? null;
    const shown = imports.length ? imports.map((i) => `'${i}'`).join(' + ') : 'nothing';
    const tokens = parseThemeTokens(cssText).size;

    if (imports.length > 1) {
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

// ── Frame chrome stays out of flow under a slide `finish:` ────────────────────────
// `base.finish.css` lifts slide content above the finish backdrop. The z-index is the
// intent; the `position: relative` that carries it must NOT reach a child that already
// positions ITSELF, because on such a child it is destructive twice — `top`/`left`
// re-base from the frame onto the flow position, and the element starts consuming stage
// height it was designed never to take. So that rule carries a `:where()` exclusion list
// of the out-of-flow chrome, and THIS gate keeps the list honest.
//
// WHY A GATE AND NOT A COMMENT. The list is exactly the shape this repo has been bitten
// by: `.overflow-tab` defended itself with `!important` and `.illegible-tab`, written
// later, did not — the same defect, shipped, because nothing checked. The first cut of
// the exclusion list repeated it: built from an empirical sweep over a six-layout probe
// deck, it missed `.lat-split-rail`, which only appears when a split run has no footer
// Cell. An enumeration that is not gated is an enumeration that is already stale.
//
// It fails BOTH ways, like SANCTIONED_MARGINS / SANCTIONED_HEX / SANCTIONED_LAYER_BLOCKS:
//   · a KNOWN section-level chrome hook that engine CSS still positions absolutely but the
//     rule no longer excludes — someone deleting an entry, or renaming a class;
//   · an excluded name that nothing positions any more — so the list cannot rot quiet.
//
// WHAT THIS GATE DOES NOT DO, stated plainly so nobody trusts it further than it goes: it
// does NOT discover chrome nobody has enumerated. `SECTION_LEVEL_CHROME` below is a hand-
// written set, and a genuinely new section-level element is invisible here until someone
// adds it. A fully derived static version was built and abandoned — deciding "can this
// selector match a direct child of a section, and does it lose to (0,2,1)?" from CSS text
// alone means reimplementing specificity AND bundle source order, and it produced 38
// candidates of which nearly all were false positives; the waiver list that would have
// silenced them is the same ungated enumeration in a new coat.
// THE DERIVED CHECK IS EMPIRICAL, and it lives in
// test/integration/invariants/frame-chrome-out-of-flow.test.js: render a deck, toggle
// `.finish` off and on, and assert NO direct child of any section changes its computed
// position. That asks the real cascade instead of modelling it, needs no list at all, and
// is what actually caught `.lattice-bg` — whose photo silently collapsed to height 0 on
// the `spotlight` and `statement` compositions.
//
// The subject is deliberately narrow: a top-level rule whose selector's LAST compound is a
// bare tag or single class (`section header`, `.lat-split-rail`) and which declares
// `position: absolute`. A selector that pins its own parent (`section.image .lattice-bg`,
// `.cell-footer > .x`) is out of scope — it either cannot be a direct child of a `finish`
// section or already outranks the rule at (0,2,1).
const FINISH_CHROME_RULE = 'section.finish > *:not(.backdrop, :where(';

/** Hooks that are absolutely positioned somewhere in engine CSS and CAN be a `section` child. */
function absolutelyPositionedSectionChildHooks() {
  const hooks = new Map(); // hook → first file that positions it
  for (const file of listCssFiles(LIB_DIR)) {
    const rel = path.relative(ROOT, file);
    if (rel.endsWith('base.finish.css')) continue; // the rule under test
    const css = stripComments(fs.readFileSync(file, 'utf8'));
    // Rule bodies that declare `position: absolute` (not inside a `:not()`/`@supports` arg).
    const ruleRe = /([^{}]+)\{([^{}]*)\}/g;
    let m;
    while ((m = ruleRe.exec(css))) {
      const selectorList = m[1];
      const body = m[2];
      if (!/(^|[;\s])position\s*:\s*absolute/.test(body)) continue;
      for (const sel of selectorList.split(',')) {
        const s = sel.trim();
        if (!s || s.includes('::') || s.includes('@')) continue; // pseudo-elements aren't children
        const last = s.split(/[\s>+~]+/).filter(Boolean).pop() || '';
        // A bare tag (header/footer) or a single leading-class hook (.lat-split-rail),
        // optionally tag-qualified (img.deck-logo). Anything else is parent-scoped.
        const bare = /^([a-z][a-z0-9-]*)$/.exec(last);
        const cls = /^([a-z][a-z0-9-]*)?\.([a-zA-Z][\w-]*)$/.exec(last);
        if (bare && ['header', 'footer'].includes(bare[1])) hooks.set(bare[1], rel);
        else if (cls) hooks.set(`.${cls[2]}`, rel);
      }
    }
  }
  return hooks;
}

/**
 * Read the frame-chrome exclusion list out of base.finish.css. Pure, so the failure
 * modes below are reachable from a test without writing to lib/.
 *
 * Returns `{ excluded }` or `{ error }` — never a half-parsed list. THAT IS THE POINT.
 * An unterminated `:where(` makes `indexOf` return -1, and `slice(listStart, -1)` then
 * silently yields the whole REST OF THE STYLESHEET split on commas: a garbage "exclusion
 * list" that would drown the real check in bogus stale-entry errors, or worse, satisfy it
 * by accident. The same applies when the next `)` turns up only in a LATER rule — a `{`
 * in between says this declaration block ended first. A build gate that mis-parses its
 * own subject is worse than no gate, because it reports confidently on something that
 * isn't there. Caught in PR review.
 */
function parseFinishChromeExclusions(css) {
  const at = css.indexOf(FINISH_CHROME_RULE);
  if (at === -1) {
    return { error:
      'base.finish.css no longer carries the frame-chrome exclusion rule ' +
      `(\`${FINISH_CHROME_RULE}…\`). If the stacking fix was replaced, remove ` +
      'checkFinishChromeExclusions with it; do not let the gate certify nothing.' };
  }
  const listStart = at + FINISH_CHROME_RULE.length;
  const listEnd = css.indexOf(')', listStart);
  const blockOpen = css.indexOf('{', listStart);
  if (listEnd === -1 || (blockOpen !== -1 && blockOpen < listEnd)) {
    return { error:
      'base.finish.css\'s frame-chrome exclusion list is malformed — the `:where(` opened by ' +
      `\`${FINISH_CHROME_RULE}\` is never closed before the declaration block. Fix the ` +
      'selector; checkFinishChromeExclusions cannot verify a list it cannot parse.' };
  }
  return { excluded: css.slice(listStart, listEnd).split(',').map((s) => s.trim()).filter(Boolean) };
}

function checkFinishChromeExclusions(errors) {
  const finishFile = path.join(LIB_DIR, 'base', 'base.finish.css');
  const parsed = parseFinishChromeExclusions(fs.readFileSync(finishFile, 'utf8'));
  if (parsed.error) { errors.push(parsed.error); return; }
  const excluded = parsed.excluded;

  const hooks = absolutelyPositionedSectionChildHooks();
  // Only chrome that can actually BE a direct child is in scope. `header`/`footer` and the
  // engine's injected chrome qualify; a component's inner part (`.panel-right`, `.seg`) is
  // built inside its own subtree and never docks at section level, so the candidate set is
  // narrowed to hooks the engine docks onto a section — enumerated by the injectors.
  const SECTION_LEVEL_CHROME = new Set([
    'header', 'footer',
    '.deck-logo',        // lib/runtime applyDeckLogo* / applyDeckLogoToHtml — first child
    '.overflow-tab',     // the overflow watcher (defends itself with !important)
    '.illegible-tab',    // the legibility watcher
    '.lat-split-rail',   // lib/core/footer-dock.js — section level when there is no footer Cell
    '.lattice-bg',       // the image layout's photo panel — a direct child on every composition
  ]);

  const missing = [];
  for (const [hook, file] of hooks) {
    if (!SECTION_LEVEL_CHROME.has(hook)) continue;
    if (hook === '.overflow-tab') continue; // asserts position:absolute !important itself
    const named = excluded.some((e) => e === hook || e.endsWith(hook));
    if (!named) missing.push(`${hook} (positioned in ${file})`);
  }
  const stale = excluded.filter((e) => {
    const hook = e.startsWith('.') ? e : (e.includes('.') ? `.${e.split('.').pop()}` : e);
    return !hooks.has(hook) && !hooks.has(e);
  });

  if (missing.length) {
    errors.push(
      `${missing.length} out-of-flow section chrome element(s) are NOT excluded from ` +
      'base.finish.css\'s `position: relative` rule, so a `finish:` deck drags them into ' +
      'flow — displacing them AND making them consume stage height. Add them to the ' +
      `\`:where(…)\` list. Offending: ${missing.join(', ')}.`,
    );
  }
  for (const e of stale) {
    errors.push(
      `stale frame-chrome exclusion in base.finish.css — \`${e}\` is no longer positioned ` +
      'absolutely anywhere in engine CSS. Remove it from the `:where(…)` list so the ' +
      'exclusion set stays honest.',
    );
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
    file: 'lib/base/base.modifiers.css', hex: '#fff', count: 2,
    why: 'overflow-tab + type-floor-tab label ink — fixed white on the fixed authoring fills; same exception.',
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
const US_ENGLISH_BUDGET = 1307;

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
// every slide — and `base.variants.css` explicitly says "a theme may override
// `--spectrum-quiet`". A palette that accepts that invitation would put the token
// in the theme vocabulary, and a `:root`-only model would then demand a contract
// row for a token that IS defaulted. So:
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
    if (!parsed || parsed.endsLiteral) continue;
    const line = s.slice(0, i).split('\n').length;
    const selector = selectorAt(i);
    if (!into.has(parsed.token)) into.set(parsed.token, []);
    into.get(parsed.token).push({
      where: `${label}:${line}`,
      kind: 'css',
      rootRead: selector === null || isUnconditionalRoot(selector),
      chain: parsed.chain,
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
  const rescued = (name, read) =>
    defaulted(name, read) || (read.chain ?? []).some((c) => contract.has(c) || defaulted(c, read));
  return [...bareReads.keys()]
    .filter((t) => {
      if (!themeTokens.has(t) || contract.has(t)) return false;
      return bareReads.get(t).some((r) => !rescued(t, r));
    })
    .sort();
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
const SANCTIONED_PREVIEW_BUILDERS = [
  { file: 'docs/src/playground/deck-preview.js', why: 'buildSrcdoc + renderDeck (the latter also sanitizes the patchSections innerHTML path).' },
  { file: 'docs/src/lib/single-slide-render.ts', why: 'srcdoc() — landing islands / specimens / the Studio\'s single-slide preview.' },
  { file: 'docs/src/components/studio/present/presenter-window.js', why: 'buildStageDoc — the Studio\'s dual-screen presenter AND rehearsal stage.' },
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
const CLASS_OR_CLASS_ONLY_PSEUDO = String.raw`(?:\.[\w-]+|:(?:not|is|where)\((?:\s*\.[\w-]+\s*,?)+\))`;
const DIAGRAM_SCOPE_SAFE_SELECTOR = new RegExp(`^(?::root|section${CLASS_OR_CLASS_ONLY_PSEUDO}*)$`);

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
function catPaletteSource(name, seen = new Set()) {
  if (seen.has(name)) return '';
  seen.add(name);
  if (name === 'lattice') return fs.readFileSync(path.join(LIB_DIR, 'base', 'base.tokens.css'), 'utf8');
  const file = path.join(THEMES_DIR, `${name}.css`);
  if (!fs.existsSync(file)) return '';
  const css = fs.readFileSync(file, 'utf8');
  let out = '';
  // Comments FIRST: several themes discuss `@import 'lattice';` in prose, and a
  // raw scan treats that sentence as a real import. Harmless where the named
  // theme is imported anyway, silently wrong the moment a comment names one that
  // is not — it would flatten a foreign palette's tokens into the gate's map.
  for (const m of catStripComments(css).matchAll(/@import\s+['"]([^'"]+)['"]/g)) out += `${catPaletteSource(m[1], seen)}\n`;
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

function checkCatContrast(errors) {
  checkCatInkDeclared(errors);
  checkCatInkFallback(errors);
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

function run() {
  const manifests = loadAll();
  const errors = [];
  checkCssSyntax(errors);
  checkUniversalTableGuard(manifests, errors);
  checkTransformerNames(errors);
  checkLayoutOwnership(errors);
  checkComponentNames(manifests, errors);
  checkComponentCss(manifests, errors);
  checkVariantDeclaration(manifests, errors);
  checkTagClustering(manifests, errors);
  checkThemeTokenParity(errors);
  checkNoSafeDefaultTokens(errors);
  checkRetiredTokenNames(errors);
  checkTypographyTokens(errors);
  checkMarginDiscipline(errors);
  checkMathRendererParity(errors);
  checkSectionBoxOwnership(errors);
  checkSectionCqAnchoring(errors);
  checkCascadeLayers(errors);
  checkFinishChromeExclusions(errors);
  checkHexLiterals(errors);
  checkUsEnglish(errors);
  checkAdaptDeclarations(manifests, errors);
  checkSolverIntentDeclared(manifests, errors);
  checkRenderNature(manifests, errors);
  checkDensityCoverage(manifests, errors);
  checkDiagramScopeSelectors(errors);
  checkClassAttrReads(errors);
  checkFrontMatterReaders(errors);
  checkPreviewHtmlSinks(errors);
  checkSnapshotHtmlSinks(errors);
  checkOpenRouterBudget(errors);
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
  checkFinishChromeExclusions,
  parseFinishChromeExclusions,
  absolutelyPositionedSectionChildHooks,
  checkCommittedPdfs,
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
  SANCTIONED_SECTION_BOXES,
  checkMarginDiscipline,
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
  checkPreviewHtmlSinks,
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
  SANCTIONED_PREVIEW_BUILDERS,
  PREVIEW_BUILDER_MARKER,
  SANITIZE_CALL,
  checkHexLiterals,
  checkSplitOracle,
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
  checkNoSafeDefaultTokens,
  noSafeDefaultTokens,
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
