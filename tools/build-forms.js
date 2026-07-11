#!/usr/bin/env node
/**
 * Generate dist/docs/forms.json — the machine-readable catalog of Lattice's
 * Form composition model (Frame + Cell + Tile), beside dist/docs/components.json.
 * Also runs the **manifest↔CSS consistency gate** (the "light" coupling of
 * engineering/decisions/2026-06-16-form-manifest-medium-independent-contract.md
 * §4.2): every Cell geometry/gap CSS-token ref must be defined in lib CSS, else
 * the build fails — so a renamed token can't leave a manifest pointing at nothing.
 *
 * Mirrors tools/build-docs-portal.js (HARD RULE 15 — reuse the generator
 * pattern): load the manifests via the shared loader (lib/forms), project them
 * into one flat deterministic document, and gate freshness with --check. The
 * source of truth is lib/forms/{frame,tile,cell}/**; this file is generated, so
 * never hand-edit dist/docs/forms.json. Wired into tools/build.js after the
 * component doc portal.
 *
 * Usage:
 *   node tools/build-forms.js            # regenerate dist/docs/forms.json
 *   node tools/build-forms.js --check    # verify it is fresh (CI gate); exit 1 if stale
 *
 * See design/forms.md §11 and engineering/decisions/2026-06-15-form-implementation.md §6.
 */

const fs = require('node:fs');
const path = require('node:path');
const {
  loadCatalog,
  frameToggleSkip,
  checkManifestCssRefs,
  checkCellCssPresence,
  checkSuppressIntegrity,
  checkZPlaneZIndex,
} = require('../lib/forms');

const ROOT = path.join(__dirname, '..');
const DOCS_DIR = path.join(ROOT, 'dist', 'docs');
const JSON_FILE = path.join(DOCS_DIR, 'forms.json');
const LIB_DIR = path.join(ROOT, 'lib');
const FORMS_DIR = path.join(LIB_DIR, 'forms');

// Every `--name` custom property DEFINED (name immediately followed by `:`) in
// any source CSS under lib/. This is the 2D CSS renderer's token vocabulary; the
// manifest↔CSS gate (below) asserts every Cell geometry/gap ref resolves into it.
// Definitions only — `var(--x)` usages have `)` not `:` after the name, so they
// don't match. Scanning source (not dist/) keeps the gate decoupled from the
// build artifact.
function collectDefinedCssTokens() {
  const defined = new Set();
  const DEF = /(--[a-z0-9-]+)\s*:/gi;
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith('.css')) {
        // Strip /* … */ comments first so a token name mentioned in a comment
        // (e.g. `/* No --mark-todo: … */`) can't masquerade as a definition —
        // keeps the "defined" set honest to its name.
        const css = fs.readFileSync(abs, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
        for (const m of css.matchAll(DEF)) defined.add(m[1]);
      }
    }
  };
  walk(LIB_DIR);
  return defined;
}

// The set of Cell ids that actually have a co-located lib/forms/cell/<id>/<id>.css
// on disk — the filesystem side of the §4.1 Cell-CSS-presence check.
function collectCellCssPresence() {
  const dir = path.join(FORMS_DIR, 'cell');
  const present = new Set();
  if (!fs.existsSync(dir)) return present;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory() && fs.existsSync(path.join(dir, e.name, `${e.name}.css`))) present.add(e.name);
  }
  return present;
}

// Every numeric `z-index` declared in a co-located Cell/Tile sheet, paired with
// that noun's manifest `z` plane — the filesystem side of the §4.3 z-plane↔z-index
// check. Comments are stripped first (a z-index mentioned in prose isn't a rule).
// Returns [{ id, plane, zindex }] (one entry per numeric z-index occurrence).
function collectZPlaneZIndex({ cells, tiles }) {
  const planeById = new Map();
  for (const c of cells) planeById.set(`cell/${c.id}`, c.z);
  for (const t of tiles) planeById.set(`tile/${t.id}`, t.z);
  const ZI = /z-index\s*:\s*(-?\d+)/gi;
  const items = [];
  for (const noun of ['cell', 'tile']) {
    const dir = path.join(FORMS_DIR, noun);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const cssPath = path.join(dir, e.name, `${e.name}.css`);
      if (!fs.existsSync(cssPath)) continue;
      const plane = planeById.get(`${noun}/${e.name}`);
      if (plane === undefined) continue; // css without a manifest — caught elsewhere
      const css = fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      for (const m of css.matchAll(ZI)) items.push({ id: `${noun}/${e.name}`, plane, zindex: Number(m[1]) });
    }
  }
  return items;
}

// The manifest↔CSS consistency gate (the "light" coupling that makes the Form
// catalog load-bearing — 2026-06-16-form-manifest-medium-independent-contract.md
// §4). Runs all four checks: §4.2 geometry/gap token-refs resolve · §4.1 Cell-CSS
// presence · §4.4 suppresses integrity · §4.3 z-plane↔z-index monotonicity. Throws
// with every drift listed; called before generate AND --check so a broken contract
// fails loud, like the component ownership guard.
function assertManifestCssConsistency({ cells, frames, tiles }) {
  const errors = [
    ...checkManifestCssRefs(cells, collectDefinedCssTokens()),
    ...checkCellCssPresence(cells, collectCellCssPresence()),
    ...checkSuppressIntegrity(frames),
    ...checkZPlaneZIndex(collectZPlaneZIndex({ cells, tiles })),
    ...checkSlicingTokenRefs(frames),
  ];
  if (errors.length) {
    throw new Error(`Form manifest↔CSS consistency failed:\n  ${errors.join('\n  ')}`);
  }
}

// Every same-band `slicing` token (the build GENERATES the [data-family] rule
// that SETS it) must be READ via var() in its target Cell's co-located CSS —
// otherwise the generated rule is dead (sets a custom property nothing consumes).
// The dual of checkManifestCssRefs: that gate asserts a token is DEFINED; this one
// asserts a slicing token is USED. See 2026-06-21-reflow-as-form-capability.md §7.
function checkSlicingTokenRefs(frames) {
  const errors = [];
  const cellDir = path.join(FORMS_DIR, 'cell');
  const cssCache = new Map();
  const cellCss = (cellId) => {
    if (cssCache.has(cellId)) return cssCache.get(cellId);
    const file = path.join(cellDir, cellId, `${cellId}.css`);
    const css = fs.existsSync(file) ? fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '') : '';
    cssCache.set(cellId, css);
    return css;
  };
  for (const f of frames) {
    if (!f.slicing) continue;
    for (const fam of Object.keys(f.slicing)) {
      for (const cellId of Object.keys(f.slicing[fam])) {
        const tokens = f.slicing[fam][cellId]?.tokens;
        if (!tokens) continue;
        const css = cellCss(cellId);
        for (const name of Object.keys(tokens)) {
          if (!css.includes(`var(${name}`)) {
            errors.push(`frame "${f.id}" slicing.${fam}.${cellId} sets ${name} but lib/forms/cell/${cellId}/${cellId}.css never reads it via var(${name}, …) — dead generated rule`);
          }
        }
      }
    }
  }
  return errors;
}

function renderJson() {
  const { cells, frames, tiles } = loadCatalog();
  const doc = {
    $comment: 'Generated by tools/build-forms.js from lib/forms/{frame,tile,cell}/** — do not edit by hand. The machine-readable catalog of the Form composition model (Frame + Cell + Tile). See design/forms.md §11.',
    model: 'Form 1.0',
    modelHref: 'https://github.com/slidewright/lattice/blob/main/design/forms.md',
    counts: { frames: frames.length, cells: cells.length, tiles: tiles.length },
    // The engine's chrome-skip set, derived from the frame manifests.
    formToggleSkip: frameToggleSkip(frames),
    frames,
    cells,
    tiles,
  };
  return `${JSON.stringify(doc, null, 2)}\n`;
}

function isStale(file, content) {
  const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : null;
  return current !== content;
}

function main(argv) {
  const check = argv.includes('--check');
  // Gate first: a manifest↔CSS drift fails loud before we touch the catalog.
  assertManifestCssConsistency(loadCatalog());
  const json = renderJson();
  fs.mkdirSync(DOCS_DIR, { recursive: true });
  const label = 'dist/docs/forms.json';
  if (check) {
    if (isStale(JSON_FILE, json)) {
      process.stderr.write(`stale: ${label} — run \`node tools/build-forms.js\` to regenerate.\n`);
      return 1;
    }
    process.stdout.write('forms catalog up to date.\n');
    return 0;
  }
  if (isStale(JSON_FILE, json)) {
    fs.writeFileSync(JSON_FILE, json);
    process.stdout.write(`wrote ${label}\n`);
  } else {
    process.stdout.write('no changes (forms catalog up to date).\n');
  }
  return 0;
}

if (require.main === module) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    // Clean gate failure (e.g. manifest↔CSS drift) — message, not a raw stack.
    process.stderr.write(`${e.message}\n`);
    process.exit(1);
  }
}

module.exports = {
  renderJson,
  JSON_FILE,
  collectDefinedCssTokens,
  collectCellCssPresence,
  collectZPlaneZIndex,
  assertManifestCssConsistency,
  checkSlicingTokenRefs,
};
