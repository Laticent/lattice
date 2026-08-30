/**
 * Layout Studio scaffold — a validated draft → the files a graduation PR needs,
 * and the in-browser asset record. Pure, fs-free: returns strings/objects; the
 * caller downloads them (Phase 3), packs them into a `.latticepack` (Phase 6),
 * or writes `lib/components/<bucket>/<name>/` for a PR (graduation, Phase 5).
 *
 * The file names + folder shape mirror the engine's own layout
 * (`lib/components/<bucket>/<name>/<name>.{manifest.json,styles.css,skeleton.md}`)
 * so the standalone-portable and repo-bound legs share ONE structure —
 * graduating is a copy, not a re-author (see the Lattice Pack note).
 */

const { NAME_RE } = require('./gate.js');

// The manifest field order the repo's own manifests use, so a scaffolded
// manifest reads like a hand-authored one. Unknown/empty fields are omitted.
const MANIFEST_ORDER = [
  '$schema', 'name', 'function', 'bucket', 'form', 'substance', 'adapt',
  'tags', 'description', 'purpose', 'slots', 'skeleton', 'sample',
];

/** A clean, ordered manifest object (drops empty optionals). */
function manifestObject(manifest, { schemaRef = true } = {}) {
  const m = manifest || {};
  const out = {};
  if (schemaRef) out.$schema = '../../manifest.schema.json';
  for (const key of MANIFEST_ORDER) {
    if (key === '$schema') continue;
    const v = m[key];
    if (v == null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (typeof v === 'object' && !Array.isArray(v) && Object.keys(v).length === 0) continue;
    if (typeof v === 'string' && !v.trim()) continue;
    out[key] = v;
  }
  // bucket defaults to function on disk (manifest.schema.json), but we emit it
  // explicitly so a downloaded scaffold is unambiguous about its folder.
  if (out.bucket == null && out.function != null) out.bucket = out.function;
  // Adaptivity is a required declaration (checkAdaptDeclarations). A fresh layout
  // adapts by the universal cqi scaling + orientation-aware type until the author
  // ships per-family @container layouts, so it scaffolds as `native`; flip to
  // `reflow` when those land. Mirror an explicit author choice if one was given.
  if (out.adapt == null) out.adapt = { mode: 'native' };
  else if (out.adapt.mode == null) out.adapt = { mode: 'native', ...out.adapt };
  return out;
}

/** Pretty manifest JSON (2-space), trailing newline. */
function manifestJson(manifest, opts) {
  return `${JSON.stringify(manifestObject(manifest, opts), null, 2)}\n`;
}

/** A styles.css string with a provenance header, trailing newline. */
function stylesCss(name, css) {
  const header = `/* ${name} — authored in the Lattice Workbench (Layout Studio).
 * Palette-blind: every color is a token (var(--…)). Scoped to .${name}.
 * See <name>.manifest.json for the component contract.
 */\n`;
  const body = String(css || '').trim();
  return `${header}\n${body}\n`;
}

/** A skeleton.md string, trailing newline. */
function skeletonMd(skeleton) {
  return `${String(skeleton || '').trim()}\n`;
}

/**
 * The graduation file set, keyed by the path RELATIVE to the component folder
 * (`lib/components/<bucket>/<name>/`). Same names the engine uses.
 */
function scaffoldFiles({ name, css, manifest, skeleton } = {}) {
  const n = (manifest?.name) || name;
  if (!NAME_RE.test(n || '')) throw new Error(`component name must be a lowercase slug, got: ${n}`);
  const skel = skeleton != null ? skeleton : manifest?.skeleton;
  return {
    [`${n}.manifest.json`]: manifestJson({ ...manifest, name: n }),
    [`${n}.styles.css`]: stylesCss(n, css),
    [`${n}.skeleton.md`]: skeletonMd(skel),
  };
}

/** The folder path a graduation PR drops the scaffold into. */
function scaffoldDir(manifest) {
  const m = manifest || {};
  const bucket = m.bucket || m.function;
  return `lib/components/${bucket}/${m.name}/`;
}

/**
 * The in-browser asset record (the `kind:'component'` shape from the asset
 * note). Library-scoped by default (`deckId:null`), provenance `studio`.
 */
function componentAsset({ name, css, manifest, skeleton } = {}, { id, deckId = null, provenance = 'studio' } = {}) {
  const n = (manifest?.name) || name;
  if (!NAME_RE.test(n || '')) throw new Error(`component name must be a lowercase slug, got: ${n}`);
  return {
    ...(id ? { id } : {}),
    deckId,
    kind: 'component',
    name: n,
    bucket: (manifest && (manifest.bucket || manifest.function)) || null,
    text: String(css || ''),
    manifest: { ...manifest, name: n },
    skeleton: skeleton != null ? skeleton : manifest?.skeleton,
    provenance,
    addedAt: Date.now(),
  };
}

module.exports = {
  MANIFEST_ORDER, manifestObject, manifestJson, stylesCss, skeletonMd,
  scaffoldFiles, scaffoldDir, componentAsset,
};
