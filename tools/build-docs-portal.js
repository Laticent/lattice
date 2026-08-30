#!/usr/bin/env node
/**
 * Aggregate every component manifest into the canonical machine + plain-text
 * reference, emitted in two forms:
 *
 *   dist/docs/components.md    — one self-contained Markdown document: a
 *                           generated table of contents (bucket →
 *                           component) followed by the full per-component
 *                           reference, reusing the exact prose the
 *                           per-component docs.md generator emits.
 *   dist/docs/components.pick.md — the PICK surface: one line per component, the
 *                              whole catalog in ~3k tokens. Skim/grep this to CHOOSE;
 *                              read the component's docs.md to author inside it.
 *   dist/docs/components.json — machine-readable catalog for agents/tooling:
 *                           every component's axes, tags, slots, skeleton,
 *                           and when/anti/related prose, plus the controlled
 *                           vocabularies, in one flat deterministic document.
 *   dist/docs/grammar.json — the machine-readable per-component grammar for
 *                           LFM (Lattice-Flavored Markdown): each component's
 *                           _class token, slots (selector + required), the
 *                           modifier tokens it accepts, and the shared state-
 *                           marker / fence sub-grammars. A third projection of
 *                           the same manifest source. See spec/LFM-1.0.md.
 *
 * The browsable, themable HTML edition is no longer a single generated blob
 * here — it is the docs site's per-component pages (docs/src/pages/components/
 * [bucket]/[name].astro), which render live previews + an in-browser editor
 * from these same manifests. This generator owns only the two single-file
 * artifacts that ship in the npm tarball (the .md human reference and the
 * .json agent catalog).
 *
 * It also still resolves the palette tokens (paletteCss / listBasePalettes)
 * that tools/build-landing-tokens.js consumes — one place that turns
 * themes/<name>.css into concrete {light, dark} token blocks.
 *
 * The manifest is the single source of truth — the same fields the
 * per-component docs.md generator (tools/build-component-docs.js) reads,
 * so both outputs stay automatically in sync with the docs.md files.
 *
 * Deterministic and idempotent: re-running with no manifest change
 * produces byte-identical output.
 *
 * Usage:
 *   node tools/build-docs-portal.js            # build both files
 *   node tools/build-docs-portal.js --check    # CI gate (stale = exit 1)
 *
 * Exit codes:
 *   0  success (or --check: up to date)
 *   1  --check: an output is stale relative to the manifests
 */

const fs = require('node:fs');
const path = require('node:path');
const { loadAll, groupByBucket, BUCKETS, manifestBucket } = require('../lib/components');
const {
  FUNCTIONS, FORMS, SUBSTANCES, TAG_GROUPS,
  UNIVERSAL_GROUPS, UNIVERSAL_VARIANTS, SEMI_UNIVERSAL_VARIANTS, EXCLUSIVE_AXES, effectiveVariants,
  FAMILY_MODIFIERS, familyModifiersFor,
} = require('../lib/components');
const { blocksFor } = require('../lib/core/authoring-blocks');
const { BUCKET_BLURBS } = require('./build-bucket-galleries');
const { renderDocs } = require('./build-component-docs');
const { ORIENTATION_TO_FAMILIES, FAMILY_NAMES } = require('../lib/adaptive/families');
const { themeChain } = require('../lib/theme/chain.mjs');
const { THEME_EDGES } = require('../lib/theme/edges.generated.mjs');
const { ensureContrast, hexToOklch, oklabDistance, withLightness } = require('../lib/theme/color.js');
const { solveInk, bestEffortInk, feasibleRange, MIN_DIST } = require('../lib/theme/cat-ink.js');

// The capacity to publish, matching what `tools/build-component-docs.js` prints in
// `<name>.docs.md` — the SAME derivation, so the prose surface and this machine
// catalog can never state different budgets for one component. Some components
// declare their budget only per-family under `adapt.capacity.<family>`; `wide` is
// the family to publish (16:9 is the box a deck is authored in, and the one family
// where nothing paginates past the budget). A per-family block with no `axis` is
// deliberately skipped: `matrix-2x2` and `split-compare` retired theirs, and with
// no countable axis lint-core enforces nothing, so publishing a number would state
// a promise nothing keeps. See the capacityBlock() note in build-component-docs.js.
// Returns the spread-ready entry (`{ capacity }` or `{}`) rather than the value, so
// the catalog's object literal derives it in ONE call — the `...(f(m) ? {k: f(m)} : {})`
// shape reads fine but evaluates twice, and drifts the moment the helper grows.
function capacityEntry(m) {
  const flat = m.capacity;
  if (flat) return { capacity: flat };
  const fam = m.adapt?.capacity;
  if (!fam?.wide || !fam.axis) return {};
  // `family: 'wide'` is not decoration. The prose surface says "at a wide @size";
  // without the marker this object is a flat budget that reads as family-blind, and
  // a consumer sizing a PORTRAIT deck against it would be reading the wrong box's
  // number. The per-family numbers stay in `adapt.capacity` for anyone who needs
  // them; this says which one was lifted.
  return { capacity: { axis: fam.axis, ...fam.wide, family: 'wide' } };
}

// A component's user-facing variant looks: its declared `variants` narrowed to the
// ones carrying `variantDocs` — the identical derivation the playground and the
// component reference use (playground.astro, components/[bucket]/[name].astro). An
// undocumented declared variant is a documentation gap, not a surfaced look, so it
// stays out of the catalog and the two surfaces never disagree.
function documentedVariants(m) {
  const declared = Array.isArray(m.variants) ? m.variants : [];
  const docs = m.variantDocs || {};
  return declared.filter((v) => docs[v]);
}

// Box-families a component supports: explicit `adapt.families`, else derived from
// the legacy `orientation` so the catalog stays honest for unmigrated components.
// See engineering/decisions/2026-06-18-component-adaptive-sizing.md.
function familiesFor(m) {
  if (m.adapt && Array.isArray(m.adapt.families) && m.adapt.families.length) {
    return FAMILY_NAMES.filter((f) => m.adapt.families.includes(f));
  }
  const orientation = Array.isArray(m.orientation) ? m.orientation : ['landscape', 'portrait'];
  const set = new Set(orientation.flatMap((o) => ORIENTATION_TO_FAMILIES[o] || []));
  return FAMILY_NAMES.filter((f) => set.has(f));
}

const ROOT = path.join(__dirname, '..');
const COMPONENTS_DIR = path.join(ROOT, 'lib', 'components');
const THEMES_DIR = path.join(ROOT, 'themes');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const MD_FILE = path.join(DOCS_DIR, 'components.md');
const JSON_FILE = path.join(DOCS_DIR, 'components.json');
const PICK_FILE = path.join(DOCS_DIR, 'components.pick.md');
const GRAMMAR_FILE = path.join(DOCS_DIR, 'grammar.json');

// The browsable HTML reference now lives at the docs-site components route.
const PORTAL_URL = 'https://slidewright.github.io/lattice/components/';

// Palette tokens resolved per palette / per mode for the landing-page token
// CSS (tools/build-landing-tokens.js consumes paletteCss()). Everything else
// the docs site needs it derives from these in its own stylesheet.
const PORTAL_TOKENS = [
  'bg', 'bg-alt', 'border',
  'text-heading', 'text-body', 'text-muted',
  // The DECORATION half of what --text-muted used to be (#1715): rules, hairlines,
  // empty/skipped marks. The docs chrome reads it too, and a token the portal does
  // not emit is a token the docs site reads and never resolves.
  'muted-mark',
  'accent', 'accent-soft', 'on-accent', 'surface-inverse',
  // The per-palette categorical series (each tuned per palette AND light/dark),
  // so the docs chrome can use distinct-but-on-palette colors — e.g. the Card
  // icon tiles cycle through these instead of Starlight's fixed rainbow.
  'chart-cat1', 'chart-cat2', 'chart-cat3', 'chart-cat4',
  'chart-cat5', 'chart-cat6', 'chart-cat7', 'chart-cat8',
  // The status trio (pass/warn/fail). Every base palette defines it (as a
  // light-dark() pair), but until it was on this list it lived ONLY inside the
  // slide iframe's theme — so any docs CHROME outside a slide (a diagnostics
  // overlay, a badge, a status pill portaled to <body>) that used var(--pass)
  // fell through to a static hex fallback and couldn't adapt to light/dark.
  // Emitting it here makes the trio resolve on `document.body`, per palette + mode.
  'pass', 'warn', 'fail',
];

// ── The Studio editor's SYNTAX INK tier ───────────────────────────────────
//
// `--syntax-string-ink` / `--syntax-number-ink` / `--syntax-keyword-ink`: the three
// code-token colors the Studio's CodeMirror editors and chat code blocks paint, solved
// to read as TEXT on the EDITOR canvas (`--bg` / `--bg-alt`) rather than on the slide's
// dark code panel. Derived here, not declared by any palette — the same shape the
// status FILL tokens below already use, and the same recipe as `--cat-N-ink`
// (`lib/theme/cat-ink.js`: hold hue and chroma, move lightness by binary search until
// it clears AA on both surfaces).
//
// WHY A NEW TIER AND NOT `--hljs-*` DIRECTLY. `--hljs-*` ARE the repo's real code-token
// colors, and they are the right SEED — but they are tuned for `--code-bg`, a panel that
// is dark on every palette in both modes, and the editor's canvas is `--bg`. Measured
// over 18 base palettes x 2 modes x {string, number}: 21 of 36 rows put a raw `--hljs-*`
// below AA on the editor canvas, worst 1.01:1 (concrete/light `--hljs-number` #C8B880 on
// #B8B8B5 — invisible). Dropping them in as-is would be materially worse than the status
// trio #1703 shipped, which is why that PR took the cheap path.
//
// (#1703 also stated a WRONG reason for taking it: that `--hljs-*` cannot join
// PORTAL_TOKENS because the four a11y-* palettes declare none and `resolveToken` throws
// on partial coverage. `a11y-base` extends `onyx`, which declares the full syntax
// family, so all 18 base palettes resolve them — verified, and the claim is corrected in
// `editor-theme.ts` where it was load-bearing. The real blocker was the surface, above.)
const SYNTAX_INK_ROLES = ['keyword', 'string', 'number'];

/**
 * The roles held clear of the editor's OTHER colors, and of each other. See step 2 of
 * `deriveSyntaxInks` for why `keyword` is deliberately not one of them.
 */
const SYNTAX_INK_REPELLED = ['string', 'number'];

/**
 * Which token seeds each syntax role, per palette.
 *
 * `keyword` seeds from `--accent` — the color the editor already paints keywords,
 * headings, tags and links, so the tier reproduces the shipping appearance on every
 * palette where accent already clears AA (34 of 36 palette-modes: `solveInk`
 * returns a seed that already clears UNCHANGED). It exists to catch the two that do not —
 * mustard/light,
 * `--accent` #8C6A18 at 3.89:1 against its own canvas, a pre-existing legibility failure
 * on this very surface.
 *
 * THERE IS NO `muted` ROLE, AND THAT IS A DECISION, NOT AN OVERSIGHT. One was added and then
 * removed. The motivation was real — `--text-muted` carries no AA guarantee against the canvas
 * and is below AA on 44 of 72 palette-mode-surface pairs (worst 2.11:1 on magnolia/light against
 * `--bg-alt`, 2.47:1 against `--bg`) — and it is the token `studioHighlight` paints COMMENTS and
 * PUNCTUATION with. Repairing it here looked free.
 *
 * It is not free, because this solve has only one lever. `solveInk` moves LIGHTNESS AWAY FROM
 * THE CANVAS, and away from the canvas is exactly where `--text-body` already sits — so raising
 * the comment's contrast necessarily walks it toward the body text it exists to be quieter than.
 * `MIN_DIST` is a floor against collision; nothing in the design is a ceiling against being too
 * loud. Measured on `cuoio` light, the site's DEFAULT palette and mode: comment-to-body OKLab
 * distance fell from 0.198 to 0.038 — 1.09x the very `MIN_DIST` this file calls "collapsed" when
 * it happens between two syntax roles. 26 of 36 palette-modes lost separation; none gained any.
 * The ORDERING survives (the comment stays quieter than the body on every row), which is what
 * made it look safe; the MARGIN is what vanished.
 *
 * And it could not be completed here even in principle: `editor-theme.ts` also paints
 * `.cm-gutters` and `.cm-completionDetail` from `--text-muted`, so lifting only the comment row
 * left the line numbers at 2.64:1 beside a 5.07:1 comment — the chrome DIMMER than the content it
 * numbers, an inverted hierarchy introduced by the repair itself. Fixing that properly means
 * repairing `--text-muted` so the gutter, the completion chrome, the docs captions and the comment
 * row move together: a theme-token change with a far wider blast radius than this tier. Tracked
 * separately, not smuggled in here.
 *
 * `string` / `number` seed from the palette's own `--hljs-string` / `--hljs-number`, so
 * the editor and the deck's rendered code panel agree on what a string IS: indaco gets
 * its Night Owl tan, cuoio its terracotta, laguna its sage — instead of one status green
 * everywhere.
 *
 * EXCEPT ON THE FOUR a11y-* PALETTES, where they seed from `--pass` / `--warn` instead.
 * Those palettes exist to avoid a specific hue confusion, and their syntax family is
 * inherited wholesale from `onyx`: green 144deg and yellow-green 104deg, a pair that is
 * exactly the red-green axis `a11y-deuteranopia` and `-protanopia` are built to avoid,
 * and meaningless under `-achromatopsia`. Their status pair is the distinction each of
 * those palettes has CURATED as safe under its own condition — blue 250deg / amber 76deg
 * for deuteranopia and protanopia, green 150deg / red-orange 35deg for tritanopia, and a
 * deliberate two-step GRAYSCALE (#4D4D4D / #6E6E6E) for achromatopsia, which is the
 * "collapse to lightness only" answer that palette already gives every other decision.
 * Measured separation of the status pair on those palettes: OKLab dE 0.118-0.268, against
 * 0.101 for the inherited syntax pair — so this is the safer pair on the measurement as
 * well as on the intent.
 *
 * The a11y family is asked BY NAME, as `isModeInvariant` above already does and for the
 * same reason: there is no structural signal that separates them from `onyx`, which
 * shares their grayscale categorical cycle and is a monochrome BRAND rather than a
 * color-vision accommodation. onyx keeps its own hued syntax pair.
 *
 * The deeper fix — giving the a11y palettes their own `--hljs-*` family, so their SLIDE
 * code panels stop rendering confusable syntax too — is a per-palette design job across
 * twelve tokens and four palettes, off this change's path (HARD RULE #18). Tracked, not
 * smuggled in here.
 */
function syntaxInkSeeds(name) {
  const safePair = name.startsWith('a11y-');
  return {
    keyword: 'accent',
    string: safePair ? 'pass' : 'hljs-string',
    number: safePair ? 'warn' : 'hljs-number',
  };
}

// Palettes surfaced first in the dropdown (the two canonical palettes
// named in CLAUDE.md); the rest follow alphabetically.
const PALETTE_PRIORITY = ['indaco', 'cuoio'];

// ── Theme token resolution ────────────────────────────────────────────────
//
// Each base palette (a theme that declares no parent — it sits at the root of
// its chain) declares
// the portal tokens either directly (carbone — inherently dark) or via the
// CSS light-dark(L, R) function with the dark side referencing --dark-*
// vars in the same file. We resolve each token to a concrete {light, dark}
// pair so a consumer needs no runtime CSS engine — it just swaps token
// blocks keyed by [data-palette][data-mode].

/** Parse a theme stylesheet into a flat var map, :root winning over
 *  :where(:root). Comments AND `@import` statements are stripped first: comments
 *  so braces in prose don't confuse the block scan, and @imports because the
 *  block regex captures everything up to `{` as the selector — so a `:root {…}`
 *  sitting right after `@import 'a11y-base';` would otherwise take the selector
 *  `@import 'a11y-base'; :root`, fail the `:root` test, and be dropped. That
 *  silently lost the a11y palettes' OWN status trio (they override only
 *  --pass/--warn/--fail in that post-import :root block), so they fell through to
 *  onyx's green/red — the exact red-green colors those palettes exist to avoid.
 *  Theme token blocks have no nested braces. */
function parseThemeVars(css) {
  // The @import strip is url()- and quote-aware: a naive /@import[^;]*;/ would stop at a
  // `;` *inside* `url("a;b.css")` or a quoted specifier and corrupt the following block. No
  // Lattice theme uses that form today (all are `@import 'name';`), but match the whole
  // statement — url(...) / "..." / '...' then any media query — up to its real `;`.
  const clean = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@import\s+(?:url\([^)]*\)|"[^"]*"|'[^']*')\s*[^;]*;/g, '');
  // THREE tiers, not two. The third one is now empty of custom properties by contract
  // and is kept deliberately. `:root:root` is (0,2,0), and palettes reached for it while
  // the CLI export concatenated the engine bundle AFTER the palette — matching the
  // selector WHOLE (which is right, and is what keeps a descendant rule out) meant the
  // doubled block fell through the `isRoot` test entirely, invisible here while it was
  // the winning declaration everywhere else. #1527 flipped that concat and
  // `checkPackedRootReach` now FAILS a theme custom property declared above plain
  // `:root`, so nothing should reach tier 2 today. It stays because the ranking is what
  // makes that true rather than lucky: drop the tier and a re-introduced doubled block
  // goes back to being silently invisible here, which is the failure this was written
  // for. (`a11y-base`'s `color-scheme` pin is still doubled and still legitimate — a
  // different competitor — but it is not a custom property, so it never reaches this.)
  // engineering/decisions/2026-08-24-status-trio-single-root.md
  const tiers = [new Map(), new Map(), new Map()];   // :where(:root) < :root < :root:root
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const body = m[2];
    const tier = selector.split(',').reduce((best, raw) => {
      const part = raw.trim();
      if (/^:where\(\s*:root\s*\)$/.test(part)) return Math.max(best, 0);
      if (/^:root$/.test(part)) return Math.max(best, 1);
      if (/^(?::root){2,}$/.test(part)) return Math.max(best, 2);
      return best;
    }, -1);
    if (tier < 0) continue;
    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      tiers[tier].set(d[1], d[2].trim());
    }
  }
  const merged = new Map(tiers[0]);
  for (const t of [tiers[1], tiers[2]]) for (const [k, v] of t) merged.set(k, v);
  return merged;
}

/** Flatten a theme's var map across its chain (parents first, self last), so a thin
 *  palette that inherits most tokens (e.g. a11y-deuteranopia → a11y-base → onyx)
 *  resolves the FULL contract, not just its own overrides.
 *
 *  The chain comes from the MANIFEST (`extends`, baked into `THEME_EDGES`), not from
 *  regexing `@import` out of the stylesheet — the CSS directive is Marp's copy of the
 *  same edge, and this file's copy of that regex was one of five left in tools/. See
 *  engineering/decisions/2026-08-16-manifest-is-the-theme-contract.md. (`parseThemeVars`
 *  still STRIPS the directive from the text; that is a separate concern — see its
 *  docblock for the `:root` block it would otherwise swallow.) `lattice` (the engine
 *  base) is not a theme edge and is absent from the graph — it carries no tokens here. */
function flattenThemeVars(name) {
  const merged = new Map();
  for (const n of themeChain(name, THEME_EDGES)) {
    const css = fs.readFileSync(path.join(THEMES_DIR, `${n}.css`), 'utf8');
    for (const [k, v] of parseThemeVars(css)) merged.set(k, v);
  }
  return merged;
}

/** Mode-invariant palettes (a11y-*) force `color-scheme: light`, so their site
 *  tokens must be the LIGHT resolution in BOTH modes (the dark toggle is inert). */
function isModeInvariant(name) {
  return name.startsWith('a11y-');
}

/** Recursively expand var(--x) / var(--x, fallback) references to literals. */
function expandVars(map, value, depth = 0) {
  if (depth > 24) return value;
  return value.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g, (whole, name, fb) => {
    const v = map.get(name);
    if (v != null) return expandVars(map, v, depth + 1);
    if (fb != null) return expandVars(map, fb, depth + 1);
    return whole;
  });
}

/** Split a string on top-level commas (paren-aware). */
function splitTopLevel(s) {
  const parts = [];
  let depth = 0;
  let buf = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(buf);
      buf = '';
    } else {
      buf += ch;
    }
  }
  parts.push(buf);
  return parts;
}

/** Resolve a single token to {light, dark}. Returns null if undefined. */
/**
 * Collapse EVERY `light-dark()` in a value to one arm, not just a whole-value one.
 *
 * The first cut matched `/^light-dark\((.*)\)$/` — anchored — which is correct for a
 * surface token and silently wrong for a value that merely CONTAINS pairs. carbone's
 * `--spectrum` is a gradient whose three stops each carry their own arm (a gradient
 * cannot be wrapped: `light-dark()` is a color function), so it fell through to the
 * `{light: expanded, dark: expanded}` default and shipped the literal text
 * `light-dark(#DFE6EF, #0E0E10)` into docs/src/styles/lattice-tokens.generated.css —
 * an artifact whose whole contract is that it is RESOLVED. It was the only
 * `light-dark(` left in the repo's generated output, and build:check was green.
 */
function collapseLightDark(value, arm) {
  let out = String(value);
  for (let guard = 0; guard < 32; guard += 1) {
    const at = out.indexOf('light-dark(');
    if (at === -1) break;
    let depth = 0;
    let end = -1;
    for (let i = at + 'light-dark('.length - 1; i < out.length; i += 1) {
      if (out[i] === '(') depth += 1;
      else if (out[i] === ')') {
        depth -= 1;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end === -1) break;                       // unbalanced — leave it rather than corrupt it
    const args = splitTopLevel(out.slice(at + 'light-dark('.length, end));
    if (args.length < 2) break;
    const pick = (arm === 'dark' ? args[1] : args[0]).trim();
    out = out.slice(0, at) + pick + out.slice(end + 1);
  }
  return out.trim();
}

function resolveToken(map, tokenName) {
  const raw = map.get(`--${tokenName}`);
  if (raw == null) return null;
  const expanded = expandVars(map, raw).trim();
  return { light: collapseLightDark(expanded, 'light'), dark: collapseLightDark(expanded, 'dark') };
}

/**
 * Solve one palette-mode's syntax ink tier: `seeds` (role → hex) against the editor
 * canvas, kept clear of the roles the editor paints from OTHER tokens.
 *
 * TWO STEPS, and the second is the one the `--cat-N-ink` tier does not need.
 *
 * 1. LEGIBILITY. `solveInk` — hue and chroma held, lightness bisected until the value
 *    clears AA + margin against BOTH `--bg` and `--bg-alt`. A seed that already clears
 *    comes back untouched, which is what keeps `keyword` visually identical to `--accent`
 *    on the 34 palette-modes where accent is already legible.
 *
 * 2. SEPARATION FROM THE FIXED ROLES. A slide's categorical inks only have to be
 *    tellable from EACH OTHER, so `solveInkArm`'s anti-collapse pass is enough there. An
 *    editor surface is different: the tier lands among four colors it does not control
 *    and cannot move — `--text-muted` (comments and punctuation), `--text-body`
 *    (identifiers), `--text-heading` (property names), and whatever `keyword` resolved to
 *    — and a string that reads as a comment is the same defect as a string that reads as
 *    another string. Measured, this is not hypothetical: the solve's minimum-move
 *    placement puts `a11y-achromatopsia`'s number ink BYTE-IDENTICAL to its
 *    `--text-muted` (#6E6E6E), because both are "the least darkening of a mid-gray that
 *    clears AA on white" and there is only one such value.
 *
 *    So each role is pushed along its own feasible direction — `feasibleRange`'s `dir`,
 *    which is AWAY from the canvas and therefore monotonically MORE legible, so the push
 *    can never undo step 1 — until it sits at least `MIN_DIST` in OKLab from every fixed
 *    role and every role already placed. Roles are placed in a FIXED order (keyword,
 *    string, number) rather than nearest-first: the output is committed to a generated
 *    file that a staleness gate compares byte-for-byte, so determinism matters more than
 *    minimizing total movement.
 *
 * ONLY `string` AND `number` ARE REPELLED (`SYNTAX_INK_REPELLED`), and the exclusion is
 * the point rather than an oversight. `keyword` is not a new color — it is `--accent`,
 * which the editor ALREADY paints keywords, headings, tags and links with, made legible.
 * On 13 palette-modes across seven palettes, `--accent` is deliberately IDENTICAL to
 * `--text-heading` — a monochrome palette choosing its ink as its accent. Measured on the
 * emitted sheet: byte-identical on `onyx` and `concrete` (both modes), the four `a11y-*`
 * (both modes), and `atelier` LIGHT; the shared value is #000000 on the light arms and
 * #FFFFFF / #ECECE8 on onyx/dark and concrete/dark, so there is no lightness left to push
 * into in either direction. (`ardesia` at dE 0.0945 and `atelier`/dark at 0.0768 are NOT in
 * this group — an earlier draft called them "near enough", which at 2.2-2.7x MIN_DIST they
 * are not.) Repelling it would invent an off-brand accent on every one of those rows
 * to solve a collision the palette author chose. So `keyword` is solved for legibility,
 * and then joins `placed` so the two roles that ARE new stay clear of it.
 *
 * Returns `{ inks, moved, exhausted, illegible }`. `exhausted` names any role that ran out of
 * lightness axis before clearing everything — the honest failure, reported rather than
 * parked silently. Nothing in the shipped palettes reaches it (see the gate in
 * `test/unit/palette/syntax-ink.test.js`), and a future palette that does gets a named
 * error instead of a collapsed editor.
 */
function deriveSyntaxInks({ seeds, bg, bgAlt, avoid }) {
  const inks = {};
  const moved = [];
  const exhausted = [];
  const illegible = [];
  const placed = [...avoid]; // fixed roles first; each solved role joins as it lands
  for (const role of SYNTAX_INK_ROLES) {
    const seed = seeds[role];
    const range = feasibleRange(seed, bg, bgAlt);
    // NO LEGIBLE SHADE EXISTS. `solveInk` returns null when neither lightness pole clears
    // AA on both surfaces, which is a fact about the canvas PAIR — a straddle (one surface
    // wants a dark ink, the other a light one) or two surfaces too close together. This
    // caller writes a COMMITTED file, so it must be as loud as the cosmetic case below: the
    // first cut fell through to `bestEffortInk` and reported nothing, so a 1.63:1 ink would
    // have built clean while a 0.02 dE near-collision broke the whole docs-token build. That
    // asymmetry was exactly backwards.
    const solved = solveInk(seed, bg, bgAlt);
    let ink = solved ?? bestEffortInk(seed, bg, bgAlt);
    if (!solved) illegible.push(role);
    if (SYNTAX_INK_REPELLED.includes(role) && range && placed.some((h) => oklabDistance(ink, h) < MIN_DIST)) {
      // Safety coordinates: u = dir * L, so larger u is always further from the canvas
      // and always still AA-legal (the feasible interval is one-sided and unbounded in
      // that direction up to the pole — see `feasibleRange`).
      const { dir } = range;
      const uMax = dir === -1 ? 0 : 1;
      const step = MIN_DIST / 8;
      const clears = (hex) => placed.every((h) => oklabDistance(hex, h) >= MIN_DIST);
      let u = dir * hexToOklch(ink).L;
      let candidate = ink;
      while (u < uMax && !clears(candidate)) {
        u = Math.min(u + step, uMax);
        candidate = withLightness(seed, Math.min(Math.max(dir * u, 0), 1));
      }
      // TEST THE POLE ITSELF, which the first cut never did. It re-tested `u <= uMax` before
      // re-testing the candidate, and `u` walks in steps of MIN_DIST/8 from an arbitrary
      // starting lightness — so it essentially never lands ON uMax, and the clamped pole
      // candidate was computed and then discarded unexamined. Clamping the step to uMax and
      // judging on `clears(candidate)` rather than on where `u` ended removes both that
      // systematic blind spot and the symmetric hazard (accepting a candidate the loop never
      // cleared because `u` landed inside the 1e-9 tolerance).
      if (!clears(candidate)) exhausted.push(role);
      else {
        ink = candidate;
        moved.push(role);
      }
    }
    inks[role] = ink;
    placed.push(ink);
  }
  return { inks, moved, exhausted, illegible };
}

/** Ordered list of selectable base palettes (those that declare no parent).
 *
 *  `edges` is injectable so a test can hand in the OTHER encoding of the same
 *  graph — `edgesFromManifests`, which keeps root keys with an undefined value
 *  where the generated map omits them. The answer must not depend on which one
 *  it gets; see test/unit/theme/base-palette-predicate.test.js. Only the default
 *  is memoized. */
let _basePalettes = null;
function listBasePalettes(edges = THEME_EDGES) {
  if (_basePalettes && edges === THEME_EDGES) return _basePalettes;
  const names = [];
  for (const file of fs.readdirSync(THEMES_DIR).sort()) {
    if (!file.endsWith('.css')) continue;
    const name = file.replace(/\.css$/, '');
    // A brand palette declares no parent — a chain of ONE, itself. (Asked of the
    // MANIFEST, not of the CSS: `@import 'lattice'` is Marp's copy of that same
    // fact.) Asked through `themeChain` rather than by probing the edge map
    // directly, because the two representations of that map differ on root
    // palettes and only the resolver reconciles them: `edgesFromManifests` writes
    // `{indaco: undefined}` (key present) while the generated `THEME_EDGES` omits
    // the key entirely, so `Object.hasOwn` answers "has a parent" correctly for
    // one and backwards for the other. `themeChain` also guards the prototype
    // chain, which a bare `THEME_EDGES[name]` would not.
    //
    // The a11y palettes DO have a parent (a11y-* → a11y-base → onyx) yet are
    // first-class selectable themes too — so a deck/site set to one restyles
    // everywhere. a11y-base is a shared partial (not selectable); -dark isn't a
    // base palette.
    const a11ySelectable = name.startsWith('a11y-') && name !== 'a11y-base' && !name.endsWith('-dark');
    if (themeChain(name, edges).length > 1 && !a11ySelectable) continue;
    names.push(name);
  }
  const priority = PALETTE_PRIORITY.filter((p) => names.includes(p));
  const rest = names.filter((p) => !priority.includes(p)).sort();
  const ordered = [...priority, ...rest];
  if (edges === THEME_EDGES) _basePalettes = ordered;
  return ordered;
}

/** Resolve every palette's portal tokens to {light, dark} sets. */
function resolvePalettes() {
  return listBasePalettes().map((name) => {
    // Flatten the @import chain so a thin palette (a11y-* inheriting onyx)
    // resolves the full token contract, not just its own overrides.
    const map = flattenThemeVars(name);
    const invariant = isModeInvariant(name);
    // Each mode block must resolve light-dark() to the arg matching THAT block's
    // actual canvas scheme — a dark surface takes the dark arg, a light surface
    // the light arg — because the block's --bg is what the token is painted on.
    // For a normal palette this is just per-mode. It also fixes the two edge
    // shapes with ONE rule: (a) a11y-* render their LIGHT (white) canvas in both
    // toggles → light arg in both (the old `invariant` special-case); (b) carbone
    // has a FLAT dark --bg in both toggles → dark arg in BOTH, so the light-mode
    // block stops pairing a light-tuned --fail (#A02323) against its dark canvas
    // at 2.28:1. Derived from --bg, never the toggle — same source of truth as the
    // color-scheme emission below (isDarkSurface).
    const bgR = resolveToken(map, 'bg');
    if (!bgR) throw new Error(`theme "${name}" is missing token --bg`);
    const lightSchemeDark = isDarkSurface(bgR.light);
    const darkSchemeDark = isDarkSurface(invariant ? bgR.light : bgR.dark);
    const pick = (r, schemeDark) => (schemeDark ? r.dark : r.light);
    const light = {};
    const dark = {};
    for (const t of PORTAL_TOKENS) {
      const r = resolveToken(map, t);
      if (!r) throw new Error(`theme "${name}" is missing token --${t}`);
      light[t] = pick(r, lightSchemeDark);
      dark[t] = pick(r, darkSchemeDark);
    }
    // --spectrum is a GRADIENT (not part of the flat-color PORTAL_TOKENS contract), so
    // it's resolved and carried separately. Emitting it onto the token blocks lets the
    // Studio's Compose surface paint the deck's REAL spectrum ribbon (its structural-trim
    // divider), instead of falling back to a plain accent ramp.
    const spec = resolveToken(map, 'spectrum');
    if (spec) {
      const tidy = (s) => s.replace(/\s+/g, ' ').trim(); // collapse the multi-line gradient source
      light.spectrum = tidy(pick(spec, lightSchemeDark));
      dark.spectrum = tidy(pick(spec, darkSchemeDark));
    }
    // Status FILL tokens — a white-text-safe companion to the foreground trio. The
    // foreground --pass/--warn/--fail are tuned to READ as text and go BRIGHT in dark mode,
    // so a `bg-[var(--fail)] text-white` chip/button inverts to ~2:1. Derive a fill by
    // darkening the resolved status hue — `light[s]`, i.e. the arg matching the light
    // block's canvas scheme (the light arg for normal palettes; the DARK arg for carbone,
    // whose canvas is dark in both modes) — via OKLCH lightness until white text clears AA
    // (4.5:1), and emit the SAME value in both modes so a status button looks identical
    // light/dark. Hue-preserving, so the a11y palettes keep their colorblind-safe fill
    // (blue/amber, grayscale) instead of a hardcoded red/green.
    for (const s of ['pass', 'warn', 'fail']) {
      // FAIL LOUD on anything but a 6-digit hex, in the same spirit as isDarkSurface below.
      // Every palette resolves --pass/--warn/--fail to a 6-digit hex today; a non-hex value
      // means a future theme expressed its status color as color-mix()/oklch()/light-dark()
      // we can't darken here. We require SIX digits specifically (not 3) so the guard matches
      // the emission contract — the fills are asserted 6-digit hex in portal-color-scheme.test.js,
      // and a 3-digit token that already cleared AA would slip through here and then fail that
      // test opaquely. Passing a non-hex through un-repaired would ship an un-contrast-checked
      // fill under white text — the ~2:1 failure this token exists to prevent — so we throw and
      // force the author to extend the parser rather than silently regress AA.
      if (!/^#[0-9a-f]{6}$/i.test(String(light[s]).trim())) {
        throw new Error(
          `status fill: --${s} "${light[s]}" (palette "${name}") is not a 6-digit hex literal, so ` +
            `its white-text-safe fill can't be derived. Extend the parser (or resolve --${s} ` +
            `to 6-digit hex) rather than let a bright status color ship as an un-checked fill.`,
        );
      }
      const base = ensureContrast(light[s], '#ffffff', 4.5, 'darken');
      light[`${s}-fill`] = base;
      dark[`${s}-fill`] = base;
    }
    // The editor SYNTAX INK tier, per mode against that mode's own canvas pair. Seeded
    // from tokens that are NOT all on PORTAL_TOKENS (`--hljs-string` / `--hljs-number`),
    // so they are resolved here the way --spectrum is, and a palette missing one is a
    // loud failure rather than a silently skipped role: every base palette resolves the
    // syntax family today (onyx declares it; a11y-base extends onyx), and a future
    // palette that breaks the chain must be noticed, not defaulted around.
    const seedNames = syntaxInkSeeds(name);
    for (const [set, schemeDark] of [[light, lightSchemeDark], [dark, darkSchemeDark]]) {
      const seeds = {};
      for (const [role, token] of Object.entries(seedNames)) {
        const r = resolveToken(map, token);
        if (!r) throw new Error(`theme "${name}" is missing token --${token}, the ${role} syntax ink seed`);
        seeds[role] = pick(r, schemeDark);
      }
      // FAIL LOUD ON A NON-HEX SEED OR CANVAS, naming the theme, the token and the role. The
      // solve is hex-only, and without this the value travels into `hexToOklch` and surfaces as
      // `not a hex color: color-mix(in oklab, …)` from deep inside lib/theme/color.js — naming
      // nothing, and taking the WHOLE docs token sheet (and therefore `build:check`) down with it.
      // That is precisely the failure `lib/theme/cat-ink.js` documents as the thing its own
      // null-check exists to prevent, and the status-fill block above already guards the same way
      // for the same reason. Non-hex token values are a live shape here: the generated sheet
      // already carries `color-mix(...)` for the `--chart-cat*` family.
      for (const [label, value] of [['--bg', set.bg], ['--bg-alt', set['bg-alt']],
        ...Object.entries(seeds).map(([role, hex]) => [`--${seedNames[role]} (the ${role} seed)`, hex])]) {
        if (!/^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(String(value ?? '').trim())) {
          throw new Error(
            `theme "${name}": ${label} resolves to "${value}", which is not a hex literal, so the ` +
              'syntax ink tier cannot solve it. Resolve the token to hex, or extend deriveSyntaxInks ' +
              'to read the notation — do not let it reach the OKLCH solver, which reports the value ' +
              'without naming the theme, the token or the role.',
          );
        }
      }
      const { inks, exhausted, illegible } = deriveSyntaxInks({
        seeds,
        bg: set.bg,
        bgAlt: set['bg-alt'],
        // The colors the editor paints from OTHER tokens and cannot move. `--text-muted`
        // carries comments AND punctuation, `--text-body` identifiers, `--text-heading` property
        // names — see `studioHighlight` in docs/src/components/studio/editor-theme.ts.
        //
        // MEASURED COVERAGE, because an earlier draft called this half "not hypothetical" and it
        // is: regenerating the sheet with `avoid: []` produces a BYTE-IDENTICAL file. On all 18
        // shipped palettes this constraint has never moved a value — every collision the tier
        // actually resolves is ink-vs-ink, handled by the `placed` accumulator. The guard stays
        // because a future palette can collide here and it costs nothing, but it is unexercised
        // today and says so rather than borrowing the ink-vs-ink pass's evidence.
        avoid: [set['text-heading'], set['text-body'], set['text-muted']],
      });
      if (illegible.length) {
        throw new Error(
          `theme "${name}": no legible syntax ink exists for ${illegible.join(', ')} on the ` +
            `${set === light ? 'light' : 'dark'} canvas (--bg ${set.bg} / --bg-alt ${set['bg-alt']}). ` +
            'No shade of the seed hue clears AA against BOTH surfaces, so this is a fact about the ' +
            'canvas pair rather than the hue: either the two surfaces straddle the legible range ' +
            '(one wants a dark ink, the other a light one) or they are too close in lightness for ' +
            'any shade to clear both. Bring --bg and --bg-alt onto the same side of the canvas, or ' +
            'widen the gap between them.',
        );
      }
      if (exhausted.length) {
        throw new Error(
          `theme "${name}": no legible, distinguishable syntax ink for ${exhausted.join(', ')} on the ` +
            `${set === light ? 'light' : 'dark'} canvas (--bg ${set.bg} / --bg-alt ${set['bg-alt']}). ` +
            'After clearing AA there is no lightness left that also stays clear of the roles this ' +
            'solve holds it against: --text-heading, --text-body, --text-muted, AND the syntax inks ' +
            'already placed (keyword, then string, then number). On the shipped palettes it is ' +
            'always the already-placed inks that run the axis out, not the text roles — so widen ' +
            "the categorical distance between this palette's --hljs-string and --hljs-number, or " +
            're-hue the seed. This is a property of the palette: re-running reproduces it.',
        );
      }
      for (const role of SYNTAX_INK_ROLES) set[`syntax-${role}-ink`] = inks[role];
    }
    return { name, light, dark };
  });
}

/** The emitted names of the syntax ink tier, in declaration order. */
const SYNTAX_INK_TOKENS = SYNTAX_INK_ROLES.map((r) => `syntax-${r}-ink`);

/** True when a resolved `--bg` hex reads as a dark surface, so the block should
 *  declare `color-scheme: dark` and the browser paints native widgets
 *  (scrollbars, form controls, spellcheck) to match. Derived from the actual
 *  background — NOT the mode toggle — so it stays correct for the edge palettes:
 *  carbone (dark in both modes → dark scheme in both) and the a11y-* palettes
 *  (white in both modes → light scheme in both).
 *
 *  FAILS LOUD on a non-hex `--bg`. `resolvePalettes` expands every palette's
 *  `--bg` to a literal today, so a non-hex value means a future theme expressed
 *  its background as `color-mix()` / `oklch()` / `light-dark()` that we can't
 *  read here. Guessing `light` would silently repaint a dark canvas's native
 *  widgets light — the exact bug this derivation exists to prevent — so we throw
 *  and force the author to extend the parser instead of shipping a wrong scheme. */
function isDarkSurface(bg) {
  const raw = String(bg).trim();
  const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(raw);
  if (!m) {
    throw new Error(
      `isDarkSurface: --bg "${raw}" is not a hex literal, so its color-scheme ` +
        `can't be derived. Extend the parser (or resolve --bg to hex) rather ` +
        `than let a dark surface silently emit color-scheme: light.`,
    );
  }
  let h = m[1];
  if (h.length === 3) h = h.split('').map((c) => c + c).join('');
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  // Perceived luminance (Rec. 601); < 128 of 255 is a dark surface.
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

/** Emit the per-palette / per-mode CSS token blocks. Each block also declares
 *  `color-scheme` so the browser renders its native widgets in the matching
 *  light/dark style — the keystone that makes scrollbars and form controls
 *  respect the site's mode. See docs/src/styles/landing.css for the on-brand
 *  scrollbar/accent tint that layers on top. */
function paletteCss() {
  const blocks = [];
  for (const p of resolvePalettes()) {
    const decls = (set) =>
      `color-scheme:${isDarkSurface(set.bg) ? 'dark' : 'light'};` +
      PORTAL_TOKENS.map((t) => `--${t}:${set[t]};`).join('') +
      (set.spectrum ? `--spectrum:${set.spectrum};` : '') +
      ['pass-fill', 'warn-fill', 'fail-fill'].map((t) => (set[t] ? `--${t}:${set[t]};` : '')).join('') +
      SYNTAX_INK_TOKENS.map((t) => `--${t}:${set[t]};`).join('');
    blocks.push(`html[data-palette="${p.name}"][data-mode="light"]{${decls(p.light)}}`);
    blocks.push(`html[data-palette="${p.name}"][data-mode="dark"]{${decls(p.dark)}}`);
  }
  return blocks.join('\n');
}

// ── Text helpers ─────────────────────────────────────────────────────────
function tc(s) {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}

function sortedMembers(list) {
  return list.slice().sort((a, b) => a.name.localeCompare(b.name));
}

function bucketTitle(bucket) {
  return tc(bucket);
}

function bucketTagline(bucket) {
  const blurb = BUCKET_BLURBS[bucket] || bucket;
  const idx = blurb.indexOf(' — ');
  return idx >= 0 ? blurb.slice(idx + 3) : blurb;
}

/** Relative path (from dist/docs/) to a component's light gallery PDF, or null. */
function galleryHref(m) {
  const bucket = manifestBucket(m);
  const abs = path.join(COMPONENTS_DIR, bucket, m.name, `${m.name}.gallery.light.pdf`);
  if (!fs.existsSync(abs)) return null;
  return path.relative(DOCS_DIR, abs).split(path.sep).join('/');
}

/** The component's effective DEFAULT framing alignment (what `headline: auto` resolves to) —
 *  DERIVED from its own CSS, not hand-authored. A layout centers its masthead by default when it
 *  sets the shared `--headline-justify` axis to `center` as the FALLBACK, either on the
 *  `.masthead-lede` (Form band) or on its `section.<name>` root (an anchor that centers the whole
 *  frame). Variant-qualified rules (e.g. `list-steps.timeline`, `divider.light`) are NOT the
 *  default, so they're skipped — the field reports the base component's alignment. Everything else
 *  is `left` (the base masthead-lede origin). See engineering/decisions/2026-07-20-mass-head-alignment.md.
 *
 *  Coverage boundary (2026-07-22 trio) — this is a flat regex, not a CSS parser. The pattern it
 *  detects is an `align-items: var(--headline-justify, center)` declaration (the center FALLBACK on
 *  the axis); it assumes: (a) that rule is TOP-LEVEL — one inside a `@media`/`@container` body is
 *  read as the base default; (b) no commented-out center rule; (c) the `section.<name>`
 *  guard matches DESCENDANTS too, so a centered caption/footnote in the component's own styles.css
 *  would misread as a centered masthead; (d) the variant-skip only fires for DOCUMENTED variants
 *  (`documentedVariants`), so deleting a variant's docs can flip its base component to `center`.
 *  No current component trips any of these — the exact-set assertion in
 *  test/unit/tools/headline-default.test.js is the rot-guard that catches it if one ever does. */
function headlineDefault(m) {
  const abs = path.join(COMPONENTS_DIR, manifestBucket(m), m.name, `${m.name}.styles.css`);
  if (!fs.existsSync(abs)) return 'left';
  const css = fs.readFileSync(abs, 'utf8');
  const variants = documentedVariants(m);
  const centerAxis = /align-items:\s*var\(--headline-justify,\s*center\)/;
  const rules = css.match(/[^{}]+\{[^{}]*\}/g) || [];
  for (const rule of rules) {
    const brace = rule.indexOf('{');
    const selector = rule.slice(0, brace);
    if (!centerAxis.test(rule.slice(brace))) continue;
    // A variant-specific rule (its selector names one of the component's variants) is not the default.
    if (variants.some((v) => new RegExp(`\\.${v}\\b`).test(selector))) continue;
    if (/\.masthead-lede/.test(selector) || new RegExp(`section\\.${m.name}\\b`).test(selector)) return 'center';
  }
  return 'left';
}

// ── Markdown reference ──────────────────────────────────────────────────────

/** Add `by` levels to every ATX heading, skipping fenced code blocks. */
function demoteHeadings(md, by) {
  let inFence = false;
  return md
    .split('\n')
    .map((line) => {
      if (/^```/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      const m = line.match(/^(#{1,6}) (.*)$/);
      if (!m) return line;
      const level = Math.min(6, m[1].length + by);
      return `${'#'.repeat(level)} ${m[2]}`;
    })
    .join('\n');
}

/** Rewrite the cross-file links in a generated docs.md body so they resolve
 *  from dist/docs/components.md: related → in-page anchors, design-system →
 *  sibling design/, gallery → the rendered light PDF. */
function rewriteLinks(md, m) {
  // Related-component links are emitted in-place-correct as cross-bucket
  // paths (../../<bucket>/<name>/<name>.docs.md); collapse to in-page anchors
  // for the single-file portal.
  let out = md.replace(/\]\(\.\.\/\.\.\/[a-z0-9-]+\/([a-z0-9-]+)\/\1\.docs\.md\)/g, '](#$1)');
  // The design-system pointer is emitted four levels up (in-place-correct for
  // lib/components/<bucket>/<name>/); the portal sits at dist/docs/, so root
  // is two levels up.
  out = out.replace(/\]\(\.\.\/\.\.\/\.\.\/\.\.\/design\//g, '](../../design/');
  out = out.replace(/\]\(\.\.\/\.\.\/docs\/([^)]+)\)/g, '](./$1)');
  const gh = galleryHref(m);
  if (gh) out = out.replace(/\]\(\.\/[a-z0-9-]+\.gallery\.light\.pdf\)/g, `](${gh})`);
  return out;
}

function renderPortalMd(manifests) {
  const grouped = groupByBucket(manifests);
  const orderedBuckets = BUCKETS.filter((b) => (grouped[b] || []).length);

  const out = [];
  out.push('# Lattice — Component Reference');
  out.push('');
  out.push('> Canonical reference for every Lattice slide component, aggregated from the component manifests (the single source of truth). Generated by `tools/build-docs-portal.js` — do not edit by hand; edit the manifests and re-run `npm run docs:portal`.');
  out.push('');
  // NO TOTALS HERE — see the `count` note in renderPortalJson. This line used to
  // read `**N components · M buckets.**`, which is exactly the line two concurrent
  // PRs cannot both be right about: each adding a component writes the same N+1,
  // git takes it without a conflict, and the committed number lands one short.
  out.push(`**Every component, grouped by bucket.** For the browsable edition — live previews, an in-browser editor, every palette — see the [component pages](${PORTAL_URL}).`);
  out.push('');
  out.push('## Contents');
  out.push('');
  for (const bucket of orderedBuckets) {
    out.push(`- [${bucketTitle(bucket)}](#${bucket}) — ${bucketTagline(bucket)}`);
    for (const m of sortedMembers(grouped[bucket])) {
      out.push(`  - [\`${m.name}\`](#${m.name})`);
    }
  }
  out.push('');

  for (const bucket of orderedBuckets) {
    out.push(`## ${bucketTitle(bucket)}`);
    out.push('');
    out.push(`*${bucketTagline(bucket)}*`);
    out.push('');
    for (const m of sortedMembers(grouped[bucket])) {
      // renderDocs starts at `# name`; demote by 2 so it nests under the
      // bucket h2 as `### name`, then rewrite cross-file links.
      let body = renderDocs(m);
      body = demoteHeadings(body, 2);
      body = rewriteLinks(body, m);
      out.push(body.trimEnd());
      out.push('');
    }
  }

  return `${out.join('\n')}\n`;
}

// ── JSON: machine-readable catalog (for agents/tooling) ─────────────────────
//
// One flat, deterministic document an agent can load in a single read to
// know the whole catalog: every component's axes, tags, slots, skeleton,
// and the when/anti/related prose, plus the controlled vocabularies the
// fields draw from. Source of truth is the manifests; this is the flat
// aggregate. No timestamps — byte-identical across runs with no manifest
// change, so the --check stale gate is meaningful.
function renderPortalJson(manifests) {
  const components = manifests.map((m) => ({
    name: m.name,
    bucket: manifestBucket(m),
    function: m.function,
    form: m.form,
    substance: m.substance,
    // Visualizations only: what the picture is DRAWN with (svg/hybrid/html) and
    // why. Consumers use it to know whether chart-motion moves the whole figure
    // and whether an SVG export captures it. See manifest.schema.json `render`.
    ...(m.render ? { render: m.render, renderNote: m.renderNote } : {}),
    orientation: Array.isArray(m.orientation) ? m.orientation : ['landscape', 'portrait'],
    families: familiesFor(m),
    ...(m.adapt ? { adapt: m.adapt } : {}),
    tags: Array.isArray(m.tags) ? m.tags : [],
    description: m.description,
    purpose: m.purpose || null,
    // A component's variants = its DECLARED forms filtered to those that are
    // DOCUMENTED (`variantDocs[v]`) — the exact set the playground and component
    // reference surface (docs/src/pages/playground.astro, [name].astro). Filtering
    // here locks the Studio's variant looks to the playground's definition so the
    // two can never drift (an undocumented declared variant is a doc gap, not a
    // user-facing look). Today every declared variant is documented, so this is a
    // no-op on current output; it guards the future.
    variants: documentedVariants(m),
    ...(Array.isArray(m.variantAxes) && m.variantAxes.length ? { variantAxes: m.variantAxes } : {}),
    effectiveVariants: effectiveVariants(m),
    familyModifiers: familyModifiersFor(m),
    ...(Array.isArray(m.focusAxes) && m.focusAxes.length ? { focusAxes: m.focusAxes } : {}),
    ...capacityEntry(m),
    ...(m.density ? { density: m.density } : {}),
    slots: m.slots || {},
    // The OPTIONAL editorial blocks this layout actually renders, in document
    // order (#1651). `slots` describe a component's own anatomy; these are the two
    // universal trailing beats an author can add to almost any slide — the
    // key-insight callout and the below-note footnote — and both are OPT-OUT, so
    // "which layouts drop them" was knowledge only the render kernel and a CSS
    // `:not()` chain held. A quote renders NEITHER (it claims its blockquote as the
    // quotation and its trailing paragraph as the attribution), while its
    // `effectiveVariants` still lists `insight-key` and `no-note` — those are
    // universal MODIFIERS, accepted everywhere, with no host to attach to here.
    // Publishing the blocks separately is what lets a consumer tell the two apart.
    authoring: { blocks: blocksFor(m.name) },
    skeleton: m.skeleton,
    whenToUse: Array.isArray(m.whenToUse) ? m.whenToUse : [],
    antiPatterns: Array.isArray(m.antiPatterns) ? m.antiPatterns : [],
    related: Array.isArray(m.related) ? m.related : [],
    // Derived: the default framing alignment (`headline: auto` result) — `left` or `center`.
    headlineDefault: headlineDefault(m),
    galleryHref: galleryHref(m),
  }));
  const doc = {
    $comment: 'Generated by tools/build-docs-portal.js from the component manifests — do not edit by hand. The machine-readable companion to components.md / the docs-site component pages. See design/design-system.md §7 and AGENTS.md.',
    vocabularies: {
      functions: [...FUNCTIONS],
      forms: [...FORMS],
      substances: [...SUBSTANCES],
      buckets: [...BUCKETS],
      tags: Object.fromEntries(Object.entries(TAG_GROUPS).map(([k, v]) => [k, [...v]])),
      universalVariants: [...UNIVERSAL_VARIANTS],
      universalGroups: Object.fromEntries(Object.entries(UNIVERSAL_GROUPS).map(([k, g]) => [k, [...g]])),
      semiUniversalVariants: [...SEMI_UNIVERSAL_VARIANTS],
      exclusiveAxes: Object.fromEntries(Object.entries(EXCLUSIVE_AXES).map(([k, g]) => [k, [...g]])),
      familyModifiers: Object.fromEntries(
        Object.entries(FAMILY_MODIFIERS).map(([k, g]) => [k, [...g.modifiers]]),
      ),
    },
    // NO `count` FIELD, DELIBERATELY (#1594). An aggregate over every manifest is
    // the one value two concurrent PRs cannot both be right about: each adds a
    // component, each writes the same N+1, git's three-way merge takes the
    // identical line from both sides WITHOUT a conflict, and the committed file
    // lands one short — which `build:check` then rejects INSIDE the merge queue,
    // on a `main` the PR never saw, silently clearing its auto-merge. Same shape
    // and same fix as the decision index's tally
    // (engineering/decisions/2026-08-10-decisions-index-merge-queue-race.md).
    // `components.length` is the number, computed by the reader, always right.
    // Pinned by test/unit/cli/docs-portal-merge-race.test.js, which replays the
    // merge rather than banning a field name.
    components,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ── LFM grammar projection ───────────────────────────────────────────────
// The shared cross-component grammars. These mirror the canonical handlers in
// lib/integrations/markdown-it/plugins.js (stateClassesFor + the verdict-grid /
// obligation-matrix / checklist / roadmap state plugins, and functionPlotFences)
// and the chart-family Mermaid registration. They are declared here — as
// lib/authoring/lint.js declares its own modifier lists — because the plugin
// module exports the behavior, not these vocabularies. Keep in sync if the
// plugin set changes; the grammar.json --check gate makes drift loud.

// The universal state-token marker grammar (lib/integrations/markdown-it/plugins.js
// `stateClassesFor`). The `semantic` is universal across every state-marker
// component; the `shape` is the canonical state-token CSS recipe used by
// checklist / verdict-grid / obligation-matrix / pricing. The chart-family
// `roadmap` reuses the same markers + semantics but maps them to its own
// shape classes (state-shipped / state-wip / state-planned / state-skipped) —
// see `stateMarkersNote` below. `[ ]` is overloaded: neutral
// todo/planned/exempt in checklist/roadmap/obligation-matrix, "not met" in
// verdict-grid.
const STATE_MARKERS = {
  '[x]': { semantic: 'pass', shape: 'state-full', gfm: true },
  '[ ]': { semantic: 'neutral-or-fail', shape: 'state-todo|state-empty', gfm: true,
    note: 'Context-dependent: todo/planned/exempt in checklist/roadmap/obligation-matrix; not-met in verdict-grid.' },
  '[-]': { semantic: 'warn', shape: 'state-half', gfm: false },
  '[/]': { semantic: 'skip', shape: 'state-slashed', gfm: false },
};
const STATE_MARKERS_NOTE = 'semantic is universal; shape is the canonical state-token recipe (checklist/verdict-grid/obligation-matrix/pricing). The chart-family roadmap maps the same markers/semantics to its own shape classes (state-shipped/state-wip/state-planned/state-skipped).';

// Components that read the shared state-marker grammar — the markdown-it state
// plugins keyed on these class names in lib/integrations/markdown-it/plugins.js
// (verdict-grid + pricing share one plugin; checklist and obligation-matrix
// each have their own), plus the chart-family `roadmap`, which reads the same
// markers via its own transform.
const STATE_MARKER_COMPONENTS = ['checklist', 'verdict-grid', 'obligation-matrix', 'pricing', 'roadmap'];

// Fenced sub-languages LFM recognizes (info string → degraded form). The fence
// body is NOT Markdown — it is the config language of the library that renders
// it, owned by that library and the component that uses it, not by LFM. Each
// degrades to a plain code block in an LFM-unaware renderer. The fence is named
// after its renderer (like `mermaid`), not branded — `latticeplot` is retained
// as a DEPRECATED alias of `functionplot` for one release.
const FENCES = {
  functionplot: { sublanguage: 'function-plot', body: 'json', usedBy: ['math'], deprecatedAliases: ['latticeplot'], degradesTo: 'code-block' },
  mermaid: { sublanguage: 'mermaid', body: 'mermaid', usedBy: ['diagram'], degradesTo: 'code-block' },
};

/**
 * Project the component manifests into dist/docs/grammar.json — the
 * machine-readable per-component grammar for LFM (Lattice-Flavored Markdown).
 * A third projection of the same manifest source that backs components.json
 * (catalog) and the linter vocabulary. For each component it records the
 * `_class` token, its slots (selector + required + description), which slots
 * are required, the modifier tokens it accepts, and whether it reads the shared
 * state-marker / fence sub-grammars. Deterministic and idempotent.
 * See spec/LFM-1.0.md §4 and spec/diagnostics.md.
 */
function renderGrammarJson(manifests) {
  const stateSet = new Set(STATE_MARKER_COMPONENTS);
  const components = manifests.map((m) => {
    const slots = m.slots || {};
    const requiredSlots = Object.entries(slots)
      .filter(([, s]) => s && s.required === true)
      .map(([k]) => k);
    return {
      name: m.name,
      classToken: m.name,
      bucket: manifestBucket(m),
      substance: m.substance,
      skeleton: m.skeleton,
      slots,
      requiredSlots,
      modifiers: effectiveVariants(m),
      familyModifiers: familyModifiersFor(m),
      readsStateMarkers: stateSet.has(m.name),
    };
  });
  const doc = {
    $comment: 'Generated by tools/build-docs-portal.js from the component manifests — do not edit by hand. The machine-readable per-component grammar for LFM (Lattice-Flavored Markdown). See spec/LFM-1.0.md and spec/diagnostics.md.',
    spec: 'LFM 1.0',
    specHref: 'https://github.com/slidewright/lattice/blob/main/spec/LFM-1.0.md',
    classDirective: '<!-- _class: <name> [modifier …] -->',
    stateMarkers: STATE_MARKERS,
    stateMarkersNote: STATE_MARKERS_NOTE,
    stateMarkerComponents: [...STATE_MARKER_COMPONENTS].sort(),
    fences: FENCES,
    // No `count` here either — same reason as renderPortalJson above (#1594).
    components,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

const PURPOSE_CAP = 160;

// Endings that look like a sentence stop but are not. Carried over from
// build-decisions-index.js, where the same summarizer shipped first: without it
// "Use for tabular data, e.g. specs or key/value pairs." cuts at `e.g.` and renders a
// nonsense row that ends in a period, so nothing downstream can tell it was cut.
const ABBREVIATION = /\b(vs|e\.g|i\.e|etc|cf|approx|fig|no|vol|ch|st|dr|mr|ms|jr|sr|inc|ltd|al)\.$/i;

/**
 * The capacity cell.
 *
 * A budget is only meaningful WITH the deck size it was measured at. `capacityEntry`
 * attaches `family: 'wide'` for exactly this reason, and its comment warns that a
 * consumer sizing a portrait deck against a family-blind number "would be reading the
 * wrong box's number" — which is what the first cut of this projection did by dropping
 * the marker. Measured against the real linter, `list item:5/6/6` is the wide budget
 * while a `size: mobile` deck warns at 5 and a `tall` deck tolerates 7: the one column
 * both understated and overstated the truth depending on the deck.
 *
 * So a budget that varies across families is marked `*`, and the legend says the number
 * shown is the wide/default one. Components whose families all agree (`matrix-2x2`'s
 * four quadrants, `split-compare`'s two sides) need no marker — and they DO have a
 * count budget even though their `axis` was deliberately retired, so they render their
 * numbers rather than the `—` that used to claim they had none.
 */
function capacityCell(m) {
  const flat = capacityEntry(m).capacity;
  const fam = m.adapt?.capacity;
  const families = fam ? ['wide', 'square', 'tall', 'strip'].map((k) => fam[k]).filter(Boolean) : [];
  const varies =
    families.length > 1 &&
    families.some((f) => f.sweet !== families[0].sweet || f.soft !== families[0].soft || f.hard !== families[0].hard);
  const mark = varies ? '*' : '';
  if (flat) return `${flat.axis}:${flat.sweet}/${flat.soft}/${flat.hard}${mark}`;
  if (families.length) {
    const f = fam.wide ?? families[0];
    // No axis: the count is real, the SPLIT axis was retired (a 2x2 read is destroyed
    // by splitting between quadrants). Render the count without an axis label.
    return `${fam.axis ? `${fam.axis}:` : ''}${f.sweet}/${f.soft}/${f.hard}${mark}`;
  }
  return '—';
}

/**
 * Project the manifests into dist/docs/components.pick.md — the PICK surface: one line
 * per component, the whole catalog in ~3.5k tokens.
 *
 * Why a fourth projection rather than a smaller components.json. AGENTS.md draws the
 * line itself — "components.json is for *picking*; each component's docs.md is for
 * *authoring inside* the one you picked" — but the file it pointed at carried the
 * authoring detail too, so picking cost 95k tokens. Worse, that file is 11,437 lines:
 * a default read surfaces the alphabetical front and stops, so the practical outcome
 * was a pick biased toward `actors`…`code` rather than an expensive-but-correct one.
 *
 * Nothing is dropped: components.json keeps every field (the Studio's SlidePicker,
 * deck-export, the playground bundle and the LFM spec all read it), and the authoring
 * detail is in the per-component docs.md that HARD RULE #6 already sends you to.
 */
function renderPickMd(manifests) {
  // EVERY cell is escaped, not just the prose one. `escalateTo`, tags and `related` are
  // free-form manifest strings, and markdown-it silently TRUNCATES an over-long row to
  // the header's column count — so one stray pipe in a tag shifts every later fact
  // under the wrong header and drops the last column entirely, with no error anywhere.
  const cell = (s) =>
    String(s ?? '')
      .replace(/\s+/g, ' ')
      .replace(/\\/g, '\\\\')
      .replace(/\|/g, '\\|')
      .trim();

  // First sentence, capped. A cut is ALWAYS marked — including when the first sentence
  // fits, because manifest purposes are written head-first ("Use for X…") and tail-last
  // ("…for Y, use `Z` instead"), so stopping at the sentence boundary silently drops the
  // discriminating half and renders as a confident complete claim. The marker is the
  // difference between "this is the whole story" and "open the docs.md".
  const summarize = (full) => {
    let sentence = full.match(/^(.{20,}?[.!?])(\s|$)/)?.[1] ?? full;
    while (sentence.length < full.length && ABBREVIATION.test(sentence)) {
      const rest = full.slice(sentence.length).replace(/^\s+/, '');
      if (!rest) break;
      sentence = `${sentence} ${rest.match(/^(.{20,}?[.!?])(\s|$)/)?.[1] ?? rest}`;
    }
    let cutByCap = false;
    if (sentence.length > PURPOSE_CAP) {
      let cut = sentence.slice(0, PURPOSE_CAP);
      const space = cut.lastIndexOf(' ');
      if (space > PURPOSE_CAP * 0.6) cut = cut.slice(0, space);
      sentence = cut.replace(/[\s,;:.—-]+$/, '');
      cutByCap = true;
    }
    // Marked only when the CAP cut it. Every purpose has more prose than its first
    // sentence, so marking that case would put an ellipsis on all 61 rows and mean
    // nothing; the first-sentence contract is stated once in the header instead.
    return cutByCap ? `${sentence} …` : sentence;
  };

  const known = new Set(manifests.map((m) => m.name));
  const rows = manifests.map((m) => {
    const cap = capacityEntry(m).capacity;
    const escalate = cap && Array.isArray(cap.escalateTo) ? cap.escalateTo : [];
    // A relation naming a component that does not exist would be laundered onto the
    // primary pick surface, where it reads as a peer — `q-and-a` still points at a
    // long-gone `faq`, and following it earns an `unknown-class` lint error whose fix
    // text sends you to the very file this surface exists to avoid loading.
    const related = (Array.isArray(m.related) ? m.related : [])
      .map((r) => (typeof r === 'string' ? r : r?.name))
      .filter((n) => n && known.has(n));
    return [
      cell(m.name),
      cell(manifestBucket(m)),
      cell(`${m.form}/${m.function}/${m.substance}`),
      cell(capacityCell(m)),
      cell(escalate.join(', ')),
      cell((Array.isArray(m.tags) ? m.tags : []).join(' ')),
      cell(related.join(' ')),
      summarize(cell(m.purpose || m.description)),
    ];
  });
  // Canonical bucket order — the narrative sequence CLAUDE.md, components.md and the
  // docs site all read in. Alphabetical would scramble the taxonomy on the one surface
  // an agent reads top to bottom.
  const bucketRank = new Map(BUCKETS.map((b, i) => [b, i]));
  rows.sort((a, b) => (bucketRank.get(a[1]) ?? 99) - (bucketRank.get(b[1]) ?? 99) || a[0].localeCompare(b[0], 'en'));

  const head = ['component', 'bucket', 'form/function/substance', 'capacity', 'escalates to', 'tags', 'see also', 'purpose'];
  const table = [`| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`, ...rows.map((r) => `| ${r.join(' | ')} |`)];

  return `# Component pick list

Generated by \`tools/build-docs-portal.js\` from the component manifests — do not edit
by hand. One line per component: enough to CHOOSE one, and nothing more.

**How to use this file.** Skim or \`grep\` it (\`grep -i comparison\`,
\`grep 'item:.*/8/'\`), pick a component, then open its
\`lib/components/<bucket>/<name>/<name>.docs.md\` for slots, skeleton, variants and
anti-patterns — HARD RULE #6 requires that before you write the slide. Tools that need
the full machine record read \`components.json\`; this file is not a substitute for it.

**A zero-hit \`grep\` means read the 61 rows, not that no component fits.** Rows carry
names, tags and a one-line purpose — not the full \`whenToUse\` prose — so a search for
\`swot\`, \`screenshot\` or \`bullet\` can miss a component that handles it. The whole table
is ~60 lines; skimming it is the fallback.

**Every \`purpose\` here is the FIRST SENTENCE of the manifest’s.** Manifest prose is
written head-first ("Use for X…") and tail-last ("…for Y, use \`Z\` instead"), so the
half telling you when NOT to use a component is deliberately not on this surface — it
is in the component’s \`.docs.md\`, which HARD RULE #6 requires you to open before
writing the slide anyway. Check the \`see also\` column before committing. A \`…\` marks
a first sentence long enough to be cut as well.

**\`capacity\`** is \`axis:sweet/soft/hard\` — the ideal count, the count past which it
crowds, and the count past which it overflows. **Count your content before committing
to a component**: if your count exceeds \`hard\`, pick something from *escalates to* or
split across slides. \`npm run lint:deck\` warns after the fact (\`capacity-crowd\` /
\`capacity-overflow\`); this column is how you avoid the rework.

**A \`*\` means the budget VARIES BY DECK SIZE**, and the number shown is the wide
(16:9) one. A \`mobile\`/\`strip\` deck holds fewer, a \`tall\` deck often more — \`list\` is
5/6/6 wide but crowds at 5 on mobile. For any deck that is not wide, read the
per-family numbers in the component's \`.docs.md\` before counting.

A \`—\` capacity means **no count budget is published** for this component — not that it
holds unlimited items. Where the budget is a prose length rather than a count (a title,
a big number), the component's \`.docs.md\` is the record.

**\`escalates to\`** is where to go when your count blows the budget; **\`see also\`** is
where to go when the SHAPE is wrong — the components this one is most often confused
with. Each relation's \`when\` clause is in this component's \`.docs.md\`.

${table.join('\n')}
`;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function build() {
  const manifests = loadAll();
  return {
    md: renderPortalMd(manifests),
    json: renderPortalJson(manifests),
    pick: renderPickMd(manifests),
    grammar: renderGrammarJson(manifests),
    count: manifests.length,
  };
}

function isStale(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return current !== content;
}

function main(argv) {
  const check = argv.includes('--check');
  const { md, json, pick, grammar, count } = build();
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const targets = [
    { file: MD_FILE, content: md, label: 'dist/docs/components.md' },
    { file: JSON_FILE, content: json, label: 'dist/docs/components.json' },
    { file: PICK_FILE, content: pick, label: 'dist/docs/components.pick.md' },
    { file: GRAMMAR_FILE, content: grammar, label: 'dist/docs/grammar.json' },
  ];

  if (check) {
    const stale = targets.filter((t) => isStale(t.file, t.content));
    if (stale.length) {
      for (const t of stale) {
        process.stderr.write(`stale: ${t.label} — run \`node tools/build-docs-portal.js\` to regenerate.\n`);
      }
      return 1;
    }
    process.stdout.write('docs portal up to date.\n');
    return 0;
  }

  let wrote = 0;
  for (const t of targets) {
    if (isStale(t.file, t.content)) {
      fs.writeFileSync(t.file, t.content);
      process.stdout.write(`wrote ${t.label}\n`);
      wrote += 1;
    }
  }
  if (!wrote) process.stdout.write('no changes (docs portal up to date).\n');
  else process.stdout.write(`${count} components, ${listBasePalettes().length} palettes.\n`);
  return 0;
}

if (require.main === module) process.exit(main(process.argv.slice(2)));

module.exports = {
  renderPortalMd,
  renderPortalJson,
  renderGrammarJson,
  renderPickMd,
  capacityEntry,
  resolvePalettes,
  listBasePalettes,
  paletteCss,
  isDarkSurface,
  PORTAL_TOKENS,
  SYNTAX_INK_ROLES,
  SYNTAX_INK_REPELLED,
  SYNTAX_INK_TOKENS,
  syntaxInkSeeds,
  deriveSyntaxInks,
  build,
  MD_FILE,
  JSON_FILE,
  GRAMMAR_FILE,
  PICK_FILE,
};
