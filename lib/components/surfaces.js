/**
 * lib/components/surfaces.js
 *
 * WHICH PARTS OF A SLIDE A COMPONENT HAS — the half of `_class:` completion that
 * the component supplies. Every modifier group in MODIFIER_GROUPS
 * (lib/components/index.js) names the SURFACE it acts on; this module answers,
 * per component, which surfaces exist. The editor then offers a modifier only
 * where its surface exists, so nobody writes a list of modifiers into 71
 * manifests and nobody sorts modifiers into "universal" and "shared" by hand:
 * a modifier on the `slide` surface is offered everywhere, one on the `table`
 * surface only where there is a table.
 *
 * Each surface is DERIVED from the cheapest exact source that already exists —
 * never a new hand-kept list:
 *
 *   slide         every slide.
 *   heading       a slot selector names an h1–h6, or the skeleton/sample writes one.
 *   eyebrow       the skeleton/sample opens a block with a lone inline-code line
 *                 (the kicker base.accent-finish.css styles), or a slot selects `code`.
 *   table         a slot selector names `table`, or the skeleton/sample writes one.
 *   card-row      the manifest declares a `cards` composition (resolve-cards.js
 *                 governs no other component).
 *   card-surface  the component's stylesheet reads `var(--elevation-card)` — the
 *                 only thing `lifted` / `flat` switch (base.tokens.css).
 *   card-rail     the component is named in the card-rail paint rule of
 *                 base.accent-finish.css — the only place `spectrum-card-*` lands.
 *   chart-marks   a file in the component's folder draws `data-mark` SVG or a
 *                 `data-scene-spec` — what the motion host animates
 *                 (docs/src/playground/anima-host-sel.ts).
 *   key-insight / below-note / insight-label
 *                 the render's own answers (lib/core/authoring-blocks.js).
 *
 * `CONTENT_SURFACES` are the ones an author can ADD to any slide by writing them
 * (a table, a heading, an eyebrow line). The editor also turns those on when the
 * slide it is completing actually contains one — see classTokenOptions in
 * docs/src/playground/slide-context.js. The rest belong to the component's own
 * rendering and cannot be conjured by content.
 *
 * Node-only (reads stylesheets); runs at build time in tools/build-docs-portal.js.
 * The derivation is the FALLBACK. The render proof (tools/check-modifier-effects.js)
 * renders every component with and without each modifier, and its measurement —
 * committed as lib/core/modifier-effects.generated.json — replaces the derived
 * answer for every surface it probes (publishedSurfaces below).
 * See engineering/decisions/2026-09-24-positional-class-completion.md.
 */

const fs = require('node:fs');
const path = require('node:path');

const SURFACES = Object.freeze([
  'slide', 'heading', 'eyebrow', 'table',
  'card-row', 'card-surface', 'card-rail', 'chart-marks',
  'key-insight', 'below-note', 'insight-label',
]);
const CONTENT_SURFACES = Object.freeze(['heading', 'eyebrow', 'table']);

const HEADING_SEL = /(?:^|[\s>,(+~])h[1-6](?![\w-])/;
const TABLE_SEL = /(?:^|[\s>,(+~])(?:table|thead|tbody|tr|td|th)(?![\w-])/;
const CODE_SEL = /(?:^|[\s>,(+~])code(?![\w-])/;

/** The authored markdown a component ships as its own example. */
function authoredText(m) {
  return [m.skeleton, m.sample, m.stressDoc?.sample].filter(Boolean).join('\n');
}

/** Markdown content signals — shared in spirit with the editor's slide scan. */
const hasHeadingLine = (md) => /^#{1,6}\s+\S/m.test(md);
const hasTableLine = (md) => /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/m.test(md);
const hasEyebrowLine = (md) => /^\s*`[^`\n]+`\s*$/m.test(md);

let cache = null;
function sharedFacts(root) {
  if (cache && cache.root === root) return cache;
  const accent = fs.readFileSync(path.join(root, 'lib/base/base.accent-finish.css'), 'utf8');
  // The rail paint rule: the selector list that ends in the one block reading
  // `var(--sp-card-img)`. Every class named in it is a railed component.
  const railNames = new Set();
  const at = accent.indexOf('background-image: var(--sp-card-img)');
  if (at !== -1) {
    const open = accent.lastIndexOf('{', at);
    const prevClose = accent.lastIndexOf('}', open);
    const selectors = accent.slice(prevClose + 1, open).replace(/\/\*[\s\S]*?\*\//g, '');
    for (const mm of selectors.matchAll(/\.([a-z][a-z0-9-]*)/g)) railNames.add(mm[1]);
  }
  cache = { root, railNames };
  return cache;
}

function folderText(dir, test) {
  let out = '';
  for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) if (test(f)) out += fs.readFileSync(path.join(dir, f), 'utf8');
  return out;
}

/**
 * The surfaces `m` renders, sorted. `ctx.dir` is the component's folder;
 * `ctx.hosts` is `{ 'key-insight', 'below-note', 'insight-label' }` → boolean from
 * authoring-blocks (a missing key counts as present, the opt-out default).
 */
function componentSurfaces(m, { dir, hosts = {}, root = path.join(__dirname, '..', '..') } = {}) {
  const out = new Set(['slide']);
  const selectors = Object.values(m.slots || {}).map((s) => String(s?.selector || ''));
  const md = authoredText(m);
  if (selectors.some((s) => HEADING_SEL.test(s)) || hasHeadingLine(md)) out.add('heading');
  if (selectors.some((s) => CODE_SEL.test(s)) || hasEyebrowLine(md)) out.add('eyebrow');
  if (selectors.some((s) => TABLE_SEL.test(s)) || hasTableLine(md)) out.add('table');
  if (m.cards) out.add('card-row');
  if (dir) {
    if (folderText(dir, (f) => f.endsWith('.css')).includes('var(--elevation-card')) out.add('card-surface');
    if (/data-mark|data-scene-spec/.test(folderText(dir, (f) => /\.(m?js)$/.test(f)))) out.add('chart-marks');
  }
  if (sharedFacts(root).railNames.has(m.name)) out.add('card-rail');
  for (const s of ['key-insight', 'below-note', 'insight-label']) if (hosts[s] !== false) out.add(s);
  return [...out].sort();
}

// The surfaces the render proof probes (tools/check-modifier-effects.js).
const PROBED_SURFACES = Object.freeze(['heading', 'eyebrow', 'table', 'card-row', 'card-surface', 'card-rail', 'chart-marks']);

let effects = null;
function measuredEffects() {
  if (effects) return effects;
  try {
    effects = require('../core/modifier-effects.generated.json').components || {};
  } catch {
    effects = {};
  }
  return effects;
}

/**
 * What the editor is told about `m`: the derived surfaces, with every PROBED one
 * replaced by what the render proof measured (lib/core/modifier-effects.generated.json)
 * when it has measured this component. A component the proof has not seen yet keeps
 * its derivation. Returns `{ surfaces, variantSurfaces?, inertSurfaces? }`.
 */
function publishedSurfaces(m, derived, measured = measuredEffects()) {
  const e = measured[m.name];
  if (!e) return { surfaces: derived };
  const surfaces = [...new Set([...derived.filter((s) => !PROBED_SURFACES.includes(s)), ...(e.surfaces || [])])].sort();
  return {
    surfaces,
    ...(e.variants && Object.keys(e.variants).length ? { variantSurfaces: e.variants } : {}),
    ...(e.inert?.length ? { inertSurfaces: e.inert } : {}),
  };
}

module.exports = { SURFACES, CONTENT_SURFACES, PROBED_SURFACES, componentSurfaces, publishedSurfaces };
