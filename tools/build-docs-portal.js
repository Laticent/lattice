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
const { BUCKET_BLURBS } = require('./build-bucket-galleries');
const { renderDocs } = require('./build-component-docs');
const { ORIENTATION_TO_FAMILIES, FAMILY_NAMES } = require('../lib/adaptive/families');

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
const GRAMMAR_FILE = path.join(DOCS_DIR, 'grammar.json');

// The browsable HTML reference now lives at the docs-site components route.
const PORTAL_URL = 'https://slidewright.github.io/lattice/components/';

// Palette tokens resolved per palette / per mode for the landing-page token
// CSS (tools/build-landing-tokens.js consumes paletteCss()). Everything else
// the docs site needs it derives from these in its own stylesheet.
const PORTAL_TOKENS = [
  'bg', 'bg-alt', 'border',
  'text-heading', 'text-body', 'text-muted',
  'accent', 'accent-soft', 'on-accent', 'surface-inverse',
  // The per-palette categorical series (each tuned per palette AND light/dark),
  // so the docs chrome can use distinct-but-on-palette colours — e.g. the Card
  // icon tiles cycle through these instead of Starlight's fixed rainbow.
  'chart-cat1', 'chart-cat2', 'chart-cat3', 'chart-cat4',
  'chart-cat5', 'chart-cat6', 'chart-cat7', 'chart-cat8',
];

// Palettes surfaced first in the dropdown (the two canonical palettes
// named in CLAUDE.md); the rest follow alphabetically.
const PALETTE_PRIORITY = ['indaco', 'cuoio'];

// ── Theme token resolution ────────────────────────────────────────────────
//
// Each base palette (themes/<name>.css that `@import 'lattice'`) declares
// the portal tokens either directly (carbone — inherently dark) or via the
// CSS light-dark(L, R) function with the dark side referencing --dark-*
// vars in the same file. We resolve each token to a concrete {light, dark}
// pair so a consumer needs no runtime CSS engine — it just swaps token
// blocks keyed by [data-palette][data-mode].

/** Parse a theme stylesheet into a flat var map, :root winning over
 *  :where(:root). Comments are stripped first so braces in prose don't
 *  confuse the block scan; theme token blocks have no nested braces. */
function parseThemeVars(css) {
  const clean = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const whereMap = new Map();
  const rootMap = new Map();
  for (const m of clean.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = m[1].trim();
    const body = m[2];
    const isWhere = /:where\(\s*:root\s*\)/.test(selector);
    const isRoot = /(^|,)\s*:root\s*(,|$)/.test(selector);
    if (!isWhere && !isRoot) continue;
    const target = isWhere ? whereMap : rootMap;
    for (const d of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
      target.set(d[1], d[2].trim());
    }
  }
  const merged = new Map(whereMap);
  for (const [k, v] of rootMap) merged.set(k, v);
  return merged;
}

/** Theme-name @imports a stylesheet declares (comments stripped so a banner's
 *  literal `@import '<self>'` prose can't self-match; minified no-space form
 *  handled). `lattice` (the base) is excluded — it carries no tokens. */
function themeImports(css) {
  return [...css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/@import\s*['"]([A-Za-z0-9_-]+)['"]/g)]
    .map((m) => m[1])
    .filter((n) => n !== 'lattice');
}

/** Flatten a theme's var map across its @import chain (deps first, self last),
 *  so a thin palette that inherits most tokens (e.g. a11y-deuteranopia →
 *  a11y-base → onyx) resolves the FULL contract, not just its own overrides. */
function flattenThemeVars(name, seen = new Set()) {
  if (seen.has(name)) return new Map();
  seen.add(name);
  const css = fs.readFileSync(path.join(THEMES_DIR, `${name}.css`), 'utf8');
  const merged = new Map();
  for (const imp of themeImports(css)) {
    for (const [k, v] of flattenThemeVars(imp, seen)) merged.set(k, v);
  }
  for (const [k, v] of parseThemeVars(css)) merged.set(k, v);
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
function resolveToken(map, tokenName) {
  const raw = map.get(`--${tokenName}`);
  if (raw == null) return null;
  const expanded = expandVars(map, raw).trim();
  const ld = expanded.match(/^light-dark\(([\s\S]*)\)$/);
  if (ld) {
    const args = splitTopLevel(ld[1]);
    if (args.length >= 2) {
      return { light: args[0].trim(), dark: args[1].trim() };
    }
  }
  return { light: expanded, dark: expanded };
}

/** Ordered list of selectable base palettes (those importing lattice). */
let _basePalettes = null;
function listBasePalettes() {
  if (_basePalettes) return _basePalettes;
  const names = [];
  for (const file of fs.readdirSync(THEMES_DIR).sort()) {
    if (!file.endsWith('.css')) continue;
    const css = fs.readFileSync(path.join(THEMES_DIR, file), 'utf8');
    const name = file.replace(/\.css$/, '');
    // Brand palettes import lattice directly. The a11y palettes import it
    // transitively (a11y-* → a11y-base → onyx → lattice) and are first-class
    // selectable themes too — so a deck/site set to one restyles everywhere.
    // a11y-base is a shared partial (not selectable); -dark isn't a base palette.
    const a11ySelectable = name.startsWith('a11y-') && name !== 'a11y-base' && !name.endsWith('-dark');
    if (!/@import\s*['"]lattice['"]/.test(css) && !a11ySelectable) continue;
    names.push(name);
  }
  const priority = PALETTE_PRIORITY.filter((p) => names.includes(p));
  const rest = names.filter((p) => !priority.includes(p)).sort();
  _basePalettes = [...priority, ...rest];
  return _basePalettes;
}

/** Resolve every palette's portal tokens to {light, dark} sets. */
function resolvePalettes() {
  return listBasePalettes().map((name) => {
    // Flatten the @import chain so a thin palette (a11y-* inheriting onyx)
    // resolves the full token contract, not just its own overrides.
    const map = flattenThemeVars(name);
    const invariant = isModeInvariant(name);
    const light = {};
    const dark = {};
    for (const t of PORTAL_TOKENS) {
      const r = resolveToken(map, t);
      if (!r) throw new Error(`theme "${name}" is missing token --${t}`);
      light[t] = r.light;
      // Mode-invariant palettes (a11y-*) force the light scheme — emit the light
      // resolution in both modes so the dark toggle is inert on the site too.
      dark[t] = invariant ? r.light : r.dark;
    }
    // A palette whose light and dark surfaces are identical is single-mode
    // (e.g. carbone — inherently dark, or the mode-invariant a11y palettes).
    const singleMode = light.bg === dark.bg && light['text-heading'] === dark['text-heading'];
    return { name, light, dark, singleMode };
  });
}

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
      PORTAL_TOKENS.map((t) => `--${t}:${set[t]};`).join('');
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
  out.push(`**${manifests.length} components · ${orderedBuckets.length} buckets.** For the browsable edition — live previews, an in-browser editor, every palette — see the [component pages](${PORTAL_URL}).`);
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
    orientation: Array.isArray(m.orientation) ? m.orientation : ['landscape', 'portrait'],
    families: familiesFor(m),
    ...(m.adapt ? { adapt: m.adapt } : {}),
    tags: Array.isArray(m.tags) ? m.tags : [],
    description: m.description,
    purpose: m.purpose || null,
    variants: Array.isArray(m.variants) ? m.variants : [],
    ...(Array.isArray(m.variantAxes) && m.variantAxes.length ? { variantAxes: m.variantAxes } : {}),
    effectiveVariants: effectiveVariants(m),
    familyModifiers: familyModifiersFor(m),
    ...(Array.isArray(m.focusAxes) && m.focusAxes.length ? { focusAxes: m.focusAxes } : {}),
    ...(m.capacity ? { capacity: m.capacity } : {}),
    ...(m.density ? { density: m.density } : {}),
    slots: m.slots || {},
    skeleton: m.skeleton,
    whenToUse: Array.isArray(m.whenToUse) ? m.whenToUse : [],
    antiPatterns: Array.isArray(m.antiPatterns) ? m.antiPatterns : [],
    related: Array.isArray(m.related) ? m.related : [],
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
    count: components.length,
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
// module exports the behaviour, not these vocabularies. Keep in sync if the
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

// Fenced sub-languages LFM recognises (info string → degraded form). The fence
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
    count: components.length,
    components,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

// ── CLI ────────────────────────────────────────────────────────────────────
function build() {
  const manifests = loadAll();
  return {
    md: renderPortalMd(manifests),
    json: renderPortalJson(manifests),
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
  const { md, json, grammar, count } = build();
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const targets = [
    { file: MD_FILE, content: md, label: 'dist/docs/components.md' },
    { file: JSON_FILE, content: json, label: 'dist/docs/components.json' },
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
  resolvePalettes,
  listBasePalettes,
  paletteCss,
  isDarkSurface,
  PORTAL_TOKENS,
  build,
  MD_FILE,
  JSON_FILE,
  GRAMMAR_FILE,
};
