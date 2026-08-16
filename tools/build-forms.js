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
// The Cell id → DOM class map, so §4.3 can attribute a z-index to the noun its SELECTOR
// targets rather than to the folder the sheet happens to sit in (see collectZPlaneZIndex).
const { CELL_DOM_CLASS } = require('../lib/forms/frame-conformance');

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

// Every `z-index` declared in a co-located Cell/Tile sheet, paired with the manifest `z`
// plane of the noun the RULE TARGETS — the filesystem side of the §4.3 check.
//
// ATTRIBUTION IS BY SELECTOR, NOT BY FILE, and that distinction is load-bearing: a Cell's
// rules do not all live in its own folder. `.cell-footer` is styled in
// lib/forms/cell/stage/stage.css (the two bands are written as one flex cell-tree), so a
// file-keyed collector reads the footer's `--z-chrome` as a claim by `cell/stage` and
// reports a disagreement that is entirely its own. Keying on the DOM class the rule
// actually selects — via frame-conformance's CELL_DOM_CLASS map plus the `tile-<id>`
// convention — asks which noun the declaration is about.
//
// Comments are stripped first. A z-index mentioned in prose is not a rule, and a gate that
// can read its own documentation as its subject is how the retired frame-chrome gate came
// to certify a rule that had already been deleted.
//
// Captures the `--z-*` TOKEN when there is one and the raw number when there is not; §4.3
// treats a bare number as a failure in its own right.
// Returns [{ id, plane, token, zindex }] (one entry per z-index occurrence).
function collectZPlaneZIndex({ cells, tiles }) {
  const planeById = new Map();
  const classToId = new Map();
  for (const c of cells) {
    planeById.set(`cell/${c.id}`, c.z);
    const cls = CELL_DOM_CLASS[c.id];
    if (cls) classToId.set(cls, `cell/${c.id}`);
  }
  for (const t of tiles) {
    planeById.set(`tile/${t.id}`, t.z);
    classToId.set(`tile-${t.id}`, `tile/${t.id}`);
  }
  const ZI = /z-index\s*:\s*([^;}]+)/gi;
  const RULE = /([^{}]+)\{([^{}]*)\}/g;
  const items = [];
  for (const noun of ['cell', 'tile']) {
    const dir = path.join(FORMS_DIR, noun);
    if (!fs.existsSync(dir)) continue;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (!e.isDirectory()) continue;
      const cssPath = path.join(dir, e.name, `${e.name}.css`);
      if (!fs.existsSync(cssPath)) continue;
      const own = `${noun}/${e.name}`;
      if (planeById.get(own) === undefined) continue; // css without a manifest — caught elsewhere
      const css = fs.readFileSync(cssPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
      let m;
      while ((m = RULE.exec(css))) {
        const selector = m[1];
        const body = m[2];
        for (const z of body.matchAll(ZI)) {
          // The noun whose class the selector names; the sheet's OWN noun when it names none
          // (a rule like `section.form { … }` in the stage sheet is the stage speaking).
          let id = own;
          for (const [cls, nounId] of classToId) {
            if (selector.includes(`.${cls}`)) { id = nounId; break; }
          }
          const raw = z[1].trim().replace(/\s*!important$/, '');
          const token = /^var\(\s*(--z-[a-z0-9-]+)/.exec(raw);
          items.push({
            id,
            plane: planeById.get(id),
            token: token ? token[1] : null,
            zindex: /^-?\d+$/.test(raw) ? Number(raw) : raw,
          });
        }
      }
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
