/**
 * Form manifest loader + validator — the engine-read single source of truth
 * for Lattice's Form composition model (Form = Frame + Cell + Tile).
 *
 * Mirrors lib/components/index.js (HARD RULE 15 — reuse the manifest-loader
 * pattern, don't clone it): a folder-per-noun catalog the engine reads, so
 * "author once, consumers select a Frame" is real and adding a Frame/Tile is a
 * folder, not edits to three render kernels (design/forms.md §11;
 * engineering/decisions/2026-06-15-form-implementation.md §6).
 *
 * On-disk layout (design/forms.md §11):
 *
 *   lib/forms/
 *     frame/<frame>/<frame>.manifest.json   slicers — the selectable structural "themes"
 *     tile/<tile>/<tile>.manifest.json       fillers — the registry rows, one folder each
 *     cell/<cell>/<cell>.cell.json           the shared, resolution-blind slot definitions
 *     schema/cell.schema.json                JSON-schema for a Cell
 *     schema/frame.schema.json               JSON-schema for a Frame
 *     schema/tile.schema.json                JSON-schema for a Tile
 *
 * NODE-ONLY: this loader reads the filesystem. It is consumed by the build
 * generator (tools/build-forms.js) and the Node render paths. The browser
 * playground bundle must NOT import it — plugins.js keeps the derived skip set
 * fs-free by deriving it at Node load and baking a fallback (see
 * lib/integrations/markdown-it/plugins.js header). See design/forms.md §5/§6.
 */

const fs = require('node:fs');
const path = require('node:path');

const FORMS_DIR = __dirname;

// Enums mirrored from the schemas (kept here so validate() is fs-free of the
// JSON-schema file at call time, like lib/components/index.js).
const Z_PLANES = Object.freeze([0, 1, 2, 3, 4]);
const CELL_REGIONS = Object.freeze([
  'masthead', 'masthead-lede', 'masthead-bay',
  'stage',
  'footer', 'footer-left', 'progress-centre', 'pagination-right',
  'overlay',
]);
const OCCUPANT_KINDS = Object.freeze(['surface', 'chrome', 'content', 'review', 'frame']);
const TILE_KINDS = Object.freeze(['surface', 'chrome', 'content', 'review']);
const FILL_MODES = Object.freeze(['start', 'center', 'optical-center', 'anchor', 'end']);
const CAPACITIES = Object.freeze(['one', 'stack']);
// The aspect families a Frame may declare `slicing` for. 'wide' is the unstamped
// authored default (lib/adaptive/families.js), so it is NEVER a slicing key.
const SLICING_FAMILIES = Object.freeze(['square', 'tall', 'strip']);
// 'framed' (a Frame nested inside a content Cell) was considered and rejected —
// see engineering/decisions/2026-06-18-frame-recursion-cells.md.
const FRAME_KINDS = Object.freeze(['root', 'sovereign']);
const TILE_STATUSES = Object.freeze(['shipped', 'partial', 'new']);
// Mirrors lib/components FORMS (the twelve Frame types).
const FORMS = Object.freeze([
  'bookend', 'divider', 'canvas', 'grid', 'stack', 'ledger',
  'panel', 'matrix', 'scatter', 'spatial', 'timeline', 'split',
]);

const kebab = (s) => typeof s === 'string' && /^[a-z][a-z0-9-]*$/.test(s);

// ── validators ──────────────────────────────────────────────────────────────

function validateCell(c, source) {
  const errors = [];
  const p = source ? `${source}: ` : '';
  if (typeof c !== 'object' || c === null) return [`${p}cell must be an object`];
  if (!kebab(c.id)) errors.push(`${p}cell id must be kebab-case (got ${JSON.stringify(c.id)})`);
  if (!CELL_REGIONS.includes(c.region)) errors.push(`${p}cell region must be one of ${CELL_REGIONS.join(', ')} (got ${JSON.stringify(c.region)})`);
  if (!Z_PLANES.includes(c.z)) errors.push(`${p}cell z must be 0..4 (got ${JSON.stringify(c.z)})`);
  if (!Array.isArray(c.accepts) || c.accepts.length === 0) errors.push(`${p}cell accepts must be a non-empty array`);
  else for (const k of c.accepts) if (!OCCUPANT_KINDS.includes(k)) errors.push(`${p}cell accepts kind ${JSON.stringify(k)} must be one of ${OCCUPANT_KINDS.join(', ')}`);
  if (!CAPACITIES.includes(c.capacity)) errors.push(`${p}cell capacity must be one|stack (got ${JSON.stringify(c.capacity)})`);
  if (!FILL_MODES.includes(c.fill)) errors.push(`${p}cell fill must be one of ${FILL_MODES.join(', ')} (got ${JSON.stringify(c.fill)})`);
  if (c.gap !== undefined && typeof c.gap !== 'string') errors.push(`${p}cell gap must be a string token name if present`);
  if (c.clip !== undefined && typeof c.clip !== 'boolean') errors.push(`${p}cell clip must be a boolean if present`);
  if (c.geometry !== undefined && (typeof c.geometry !== 'object' || c.geometry === null || Array.isArray(c.geometry))) errors.push(`${p}cell geometry must be an object if present`);
  if (c.css !== undefined && typeof c.css !== 'boolean') errors.push(`${p}cell css must be a boolean if present`);
  return errors;
}

function validateFrame(f, source) {
  const errors = [];
  const p = source ? `${source}: ` : '';
  if (typeof f !== 'object' || f === null) return [`${p}frame must be an object`];
  if (!kebab(f.id)) errors.push(`${p}frame id must be kebab-case (got ${JSON.stringify(f.id)})`);
  if (!FORMS.includes(f.form)) errors.push(`${p}frame form must be one of ${FORMS.join(', ')} (got ${JSON.stringify(f.form)})`);
  if (!FRAME_KINDS.includes(f.kind)) errors.push(`${p}frame kind must be one of ${FRAME_KINDS.join(', ')} (got ${JSON.stringify(f.kind)})`);
  if (typeof f.exemptFromChrome !== 'boolean') errors.push(`${p}frame exemptFromChrome must be a boolean`);
  if (typeof f.description !== 'string' || !f.description) errors.push(`${p}frame description must be a non-empty string`);
  if (!Array.isArray(f.cells)) errors.push(`${p}frame cells must be an array`);
  else for (const id of f.cells) if (!kebab(id)) errors.push(`${p}frame cells entry must be kebab-case (got ${JSON.stringify(id)})`);
  if (!Array.isArray(f.suppresses)) errors.push(`${p}frame suppresses must be an array`);
  else for (const id of f.suppresses) if (!kebab(id)) errors.push(`${p}frame suppresses entry must be kebab-case (got ${JSON.stringify(id)})`);
  errors.push(...validateSlicing(f, p));
  return errors;
}

// Validate a Frame's optional `slicing` block (the responsive-Frame contract,
// 2026-06-21-reflow-as-form-capability.md §7). Structural only — referential
// checks (cell ids ∈ frame.cells, relocation kind/capacity) live in
// checkIntegrity, which has the whole catalog. `wide` is the unstamped default,
// so it is NEVER a slicing key.
// One slicing placement ({ region, tokens }) for cell `cellId` in family `fam`.
function validateSlicingPlace(place, fam, cellId, p, errors) {
  if (typeof place !== 'object' || place === null || Array.isArray(place)) {
    errors.push(`${p}frame slicing.${fam}.${cellId} must be an object`);
    return;
  }
  for (const k of Object.keys(place)) if (k !== 'region' && k !== 'tokens') errors.push(`${p}frame slicing.${fam}.${cellId} has unknown key ${JSON.stringify(k)} (allowed: region, tokens)`);
  if ('region' in place && place.region !== null && !CELL_REGIONS.includes(place.region)) errors.push(`${p}frame slicing.${fam}.${cellId}.region must be null or one of ${CELL_REGIONS.join(', ')} (got ${JSON.stringify(place.region)})`);
  if (place.tokens !== undefined) {
    if (typeof place.tokens !== 'object' || place.tokens === null || Array.isArray(place.tokens)) errors.push(`${p}frame slicing.${fam}.${cellId}.tokens must be an object`);
    else for (const tn of Object.keys(place.tokens)) {
      if (!/^--[a-z][a-z0-9-]*$/.test(tn)) errors.push(`${p}frame slicing.${fam}.${cellId}.tokens name ${JSON.stringify(tn)} must be a --custom-property`);
      if (typeof place.tokens[tn] !== 'string') errors.push(`${p}frame slicing.${fam}.${cellId}.tokens.${tn} must be a string`);
    }
  }
}

function validateSlicing(f, p) {
  const errors = [];
  if (f.slicing === undefined) return errors;
  if (typeof f.slicing !== 'object' || f.slicing === null || Array.isArray(f.slicing)) {
    return [`${p}frame slicing must be an object if present`];
  }
  for (const fam of Object.keys(f.slicing)) {
    if (!SLICING_FAMILIES.includes(fam)) {
      errors.push(`${p}frame slicing family ${JSON.stringify(fam)} must be one of ${SLICING_FAMILIES.join(', ')} ('wide' is the default, never declared)`);
      continue;
    }
    const famSlice = f.slicing[fam];
    if (typeof famSlice !== 'object' || famSlice === null || Array.isArray(famSlice)) {
      errors.push(`${p}frame slicing.${fam} must be an object`);
      continue;
    }
    for (const cellId of Object.keys(famSlice)) {
      if (!kebab(cellId)) errors.push(`${p}frame slicing.${fam} key ${JSON.stringify(cellId)} must be a kebab-case cell id`);
      validateSlicingPlace(famSlice[cellId], fam, cellId, p, errors);
    }
  }
  return errors;
}

function validateTile(t, source) {
  const errors = [];
  const p = source ? `${source}: ` : '';
  if (typeof t !== 'object' || t === null) return [`${p}tile must be an object`];
  if (!kebab(t.id)) errors.push(`${p}tile id must be kebab-case (got ${JSON.stringify(t.id)})`);
  if (!TILE_KINDS.includes(t.kind)) errors.push(`${p}tile kind must be one of ${TILE_KINDS.join(', ')} (got ${JSON.stringify(t.kind)})`);
  if (!Array.isArray(t.fits) || t.fits.length === 0) errors.push(`${p}tile fits must be a non-empty array`);
  else for (const id of t.fits) if (!kebab(id)) errors.push(`${p}tile fits entry must be kebab-case (got ${JSON.stringify(id)})`);
  if (!Z_PLANES.includes(t.z)) errors.push(`${p}tile z must be 0..4 (got ${JSON.stringify(t.z)})`);
  if (typeof t.population !== 'string' || !t.population) errors.push(`${p}tile population must be a non-empty string`);
  if (t.hideToken !== undefined && t.hideToken !== null && typeof t.hideToken !== 'string') errors.push(`${p}tile hideToken must be a string or null if present`);
  if (!TILE_STATUSES.includes(t.status)) errors.push(`${p}tile status must be one of ${TILE_STATUSES.join(', ')} (got ${JSON.stringify(t.status)})`);
  return errors;
}

// ── loaders ──────────────────────────────────────────────────────────────────

function loadOne(filePath, validator, key) {
  const text = fs.readFileSync(filePath, 'utf8');
  let m;
  try {
    m = JSON.parse(text);
  } catch (e) {
    throw new Error(`${filePath}: invalid JSON — ${e.message}`);
  }
  const source = path.relative(process.cwd(), filePath);
  const errors = validator(m, source);
  if (errors.length) throw new Error(`Invalid ${key} manifest:\n  ${errors.join('\n  ')}`);
  return m;
}

/**
 * Load every <id>/<id>.<suffix> under a subdirectory, sorted by id.
 * Throws on a duplicate id or a validation failure.
 */
function loadDir(subdir, suffix, validator, kind) {
  const root = path.join(FORMS_DIR, subdir);
  const out = [];
  const seen = new Set();
  if (!fs.existsSync(root)) return out;
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory() || entry.name.startsWith('_')) continue;
    const file = path.join(root, entry.name, `${entry.name}.${suffix}`);
    if (!fs.existsSync(file)) continue;
    const m = loadOne(file, validator, kind);
    if (seen.has(m.id)) throw new Error(`duplicate ${kind} id: ${m.id} (in ${subdir}/${entry.name})`);
    seen.add(m.id);
    out.push(m);
  }
  out.sort((a, b) => a.id.localeCompare(b.id));
  return out;
}

const loadCells = () => loadDir('cell', 'cell.json', validateCell, 'cell');
const loadFrames = () => loadDir('frame', 'manifest.json', validateFrame, 'frame');
const loadTiles = () => loadDir('tile', 'manifest.json', validateTile, 'tile');

/**
 * Load the whole catalog (cells, frames, tiles) and run referential integrity:
 *   - every Tile.fits → a real Cell id
 *   - every Cell.accepts kind is satisfied by ≥1 real Tile (the 'frame' kind —
 *     a fixed chrome-band sub-split, NOT recursion — is met by any Frame existing)
 *   - every Frame.cells / Frame.suppresses → a real Cell id
 * Throws on the first integrity failure (load-bearing — a broken catalog must
 * fail loud, like the component ownership guard).
 */
function loadCatalog() {
  const cells = loadCells();
  const frames = loadFrames();
  const tiles = loadTiles();
  const errors = checkIntegrity({ cells, frames, tiles });
  if (errors.length) throw new Error(`Form catalog integrity failed:\n  ${errors.join('\n  ')}`);
  return { cells, frames, tiles };
}

/** Tile.fits must reference real Cells. */
function checkTileFits({ tiles, cellIds }, errors) {
  for (const t of tiles) {
    for (const id of t.fits) {
      if (!cellIds.has(id)) errors.push(`tile "${t.id}" fits unknown cell "${id}"`);
    }
  }
}

/** Frame.cells / Frame.suppresses must reference real Cells. */
function checkFrameCellRefs({ frames, cellIds }, errors) {
  for (const f of frames) {
    for (const id of f.cells) if (!cellIds.has(id)) errors.push(`frame "${f.id}" produces unknown cell "${id}"`);
    for (const id of f.suppresses) if (!cellIds.has(id)) errors.push(`frame "${f.id}" suppresses unknown cell "${id}"`);
  }
}

/** Frame.slicing referential integrity: every placed cell is one the Frame
 * produces, and any cross-band RELOCATION respects the kind-contract (forms.md
 * §7) AND capacity (a `stack` cell must not move into a `capacity:one` slot —
 * it would overflow). See 2026-06-21-reflow-as-form-capability.md §7. */
function checkSlicingIntegrity({ cells, frames }, errors) {
  const cellById = new Map(cells.map((c) => [c.id, c]));
  const cellByRegion = new Map(); // band region → its Cell (the slot a relocation lands in)
  for (const c of cells) if (!cellByRegion.has(c.region)) cellByRegion.set(c.region, c);
  for (const f of frames) {
    if (!f.slicing) continue;
    const produced = new Set(f.cells);
    for (const fam of Object.keys(f.slicing)) {
      for (const cellId of Object.keys(f.slicing[fam])) {
        if (!produced.has(cellId)) {
          errors.push(`frame "${f.id}" slicing.${fam} places cell "${cellId}" not in its cells`);
          continue;
        }
        const place = f.slicing[fam][cellId];
        const moved = cellById.get(cellId);
        if (!place || !place.region || !moved || place.region === moved.region) continue; // same-band or drop — no relocation target to check
        const target = cellByRegion.get(place.region);
        if (!target) { errors.push(`frame "${f.id}" slicing.${fam} relocates "${cellId}" to region "${place.region}" that has no Cell`); continue; }
        for (const kind of (moved.accepts || [])) {
          if (!(target.accepts || []).includes(kind)) errors.push(`frame "${f.id}" slicing.${fam} relocates "${cellId}" (accepts "${kind}") into "${target.id}" which does not accept "${kind}" (kind-contract, forms.md §7)`);
        }
        if (moved.capacity === 'stack' && target.capacity !== 'stack') errors.push(`frame "${f.id}" slicing.${fam} relocates stack cell "${cellId}" into single-capacity "${target.id}" — would overflow`);
      }
    }
  }
}

/** Every Cell.accepts kind satisfied by ≥1 Tile. The 'frame' kind is the fixed
 * chrome-band sub-split (masthead→lede/bay, footer→zones), NOT recursion — it is
 * met by any Frame existing. (Recursive frames-in-cells rejected: see the ADR.) */
function checkCellKindsSatisfied({ cells, tiles, haveFrames }, errors) {
  const kindFits = new Map(); // kind → Set<cellId> a Tile of that kind fits into
  for (const t of tiles) {
    if (!kindFits.has(t.kind)) kindFits.set(t.kind, new Set());
    for (const id of t.fits) kindFits.get(t.kind).add(id);
  }
  for (const c of cells) {
    for (const kind of c.accepts) {
      if (kind === 'frame') {
        if (!haveFrames) errors.push(`cell "${c.id}" accepts "frame" but no Frame exists`);
        continue;
      }
      const fits = kindFits.get(kind);
      if (!fits || !fits.has(c.id)) {
        errors.push(`cell "${c.id}" accepts "${kind}" but no Tile of kind "${kind}" fits into it`);
      }
    }
  }
}

/** Pure referential-integrity check. Returns an array of error strings.
 * A pipeline of the four named sub-checks above, run in the original order. */
function checkIntegrity({ cells, frames, tiles }) {
  const errors = [];
  const ctx = { cells, frames, tiles, cellIds: new Set(cells.map((c) => c.id)), haveFrames: frames.length > 0 };
  checkTileFits(ctx, errors);
  checkFrameCellRefs(ctx, errors);
  checkSlicingIntegrity(ctx, errors);
  checkCellKindsSatisfied(ctx, errors);
  return errors;
}

/**
 * Collect every CSS custom-property NAME a Cell manifest references in its
 * geometry/gap (e.g. --masthead-h, --frame-x). A Cell is resolution-blind:
 * geometry references token NAMES defined in the 2D CSS renderer (lib/base +
 * lib/forms/cell/<id>/<id>.css), never px literals (design/forms.md §6). This is
 * the *data* side of the manifest↔CSS consistency gate
 * (2026-06-16-form-manifest-medium-independent-contract.md §4 — the "light"
 * coupling that makes the catalog load-bearing). Pure / fs-free, so the browser
 * bundle and unit tests can use it. Returns [{ cell, field, token }].
 */
function collectGeometryTokenRefs(cells) {
  const refs = [];
  const TOKEN = /--[a-z0-9-]+/gi;
  for (const c of cells) {
    const fields = [['gap', c.gap]];
    if (c.geometry) {
      fields.push(['geometry.size', c.geometry.size], ['geometry.inset', c.geometry.inset]);
    }
    for (const [field, val] of fields) {
      if (typeof val !== 'string') continue;
      for (const token of val.match(TOKEN) || []) refs.push({ cell: c.id, field, token });
    }
  }
  return refs;
}

/**
 * The pure assertion behind the manifest↔CSS gate: every geometry/gap token a
 * Cell references MUST be a member of `definedTokens` — the set of `--name`
 * custom properties actually defined in the 2D CSS renderer. So a renamed/removed
 * token can no longer leave a manifest pointing at nothing (the drift the
 * 2026-06-15-manifest-css-audit surfaced by hand). The build tool
 * (tools/build-forms.js) supplies `definedTokens` by scanning the source CSS;
 * kept pure here so it is unit-testable without fs. Returns error strings (empty
 * = consistent).
 */
function checkManifestCssRefs(cells, definedTokens) {
  const errors = [];
  for (const { cell, field, token } of collectGeometryTokenRefs(cells)) {
    if (!definedTokens.has(token)) {
      errors.push(
        `cell "${cell}" ${field} references CSS token ${token}, which is not defined in any lib CSS — manifest↔CSS drift (see 2026-06-16-form-manifest-medium-independent-contract.md §4)`,
      );
    }
  }
  return errors;
}

/**
 * §4.1 — Cell-CSS presence. A Cell declares `css` (default true) = "ships a
 * co-located 2D stylesheet". The build asserts BOTH directions against the
 * filesystem: a Cell that should render must have its `<id>.css`, and a Cell
 * marked `css:false` (a pure token/coordinate contract) must NOT have one (catches
 * an orphaned sheet or a forgotten `css:false`). `presentIds` is the set of cell
 * ids that actually have a `<id>.css` on disk — supplied by the build (fs); pure
 * here. Returns error strings (empty = consistent).
 */
function checkCellCssPresence(cells, presentIds) {
  const errors = [];
  for (const c of cells) {
    const expects = c.css !== false; // default true
    const present = presentIds.has(c.id);
    if (expects && !present) {
      errors.push(`cell "${c.id}" expects a co-located stylesheet lib/forms/cell/${c.id}/${c.id}.css but none exists (set "css": false if it is a pure token-contract Cell)`);
    } else if (!expects && present) {
      errors.push(`cell "${c.id}" is marked "css": false but a co-located ${c.id}.css exists — remove the file or the flag`);
    }
  }
  return errors;
}

/**
 * §4.4 — `suppresses` integrity. A sovereign Frame lists chrome Cells it hides.
 * Two invariants the existing referential check (unknown-cell) doesn't cover:
 *   1. A Frame must NOT suppress the `stage` Cell — the content region can't be
 *      removed (it is where the Frame's own occupant renders).
 *   2. `cells` ∩ `suppresses` = ∅ — a Frame can't both produce and suppress the
 *      same Cell (self-contradiction).
 * (We deliberately do NOT tie `exemptFromChrome` to `suppresses` 1:1 — `minimal`
 * is non-exempt yet suppresses `progress-centre`, so no clean iff exists.) Pure.
 */
function checkSuppressIntegrity(frames) {
  const errors = [];
  for (const f of frames) {
    const produced = new Set(f.cells || []);
    for (const id of f.suppresses || []) {
      if (id === 'stage') errors.push(`frame "${f.id}" suppresses the content "stage" cell — the stage can never be suppressed`);
      if (produced.has(id)) errors.push(`frame "${f.id}" both produces and suppresses cell "${id}"`);
    }
  }
  return errors;
}

/**
 * §4.3 — z-plane ↔ z-index monotonicity. Each Cell/Tile declares a semantic `z`
 * plane (0 canvas · 1 atmosphere · 2 content · 3 chrome · 4 annotation); its
 * co-located CSS may realize that with a concrete `z-index`. Across the
 * **co-located Form Cell/Tile sheets** the realization must NOT invert the plane
 * order: a lower plane may never paint at a higher-or-equal z-index than a higher
 * plane. (Scope is the Form nouns' own sheets — z-index in lib/base or component
 * CSS that paints into the same section is out of this gate's lane.) `items` =
 * [{ id, plane, zindex }] for every numeric z-index found in a co-located sheet
 * (supplied by the build; pure here). Returns error strings.
 */
function checkZPlaneZIndex(items) {
  const errors = [];
  for (let i = 0; i < items.length; i++) {
    for (let j = 0; j < items.length; j++) {
      const a = items[i];
      const b = items[j];
      if (a.plane < b.plane && a.zindex >= b.zindex) {
        errors.push(`z-plane inversion: "${a.id}" (plane ${a.plane}, z-index ${a.zindex}) must paint below "${b.id}" (plane ${b.plane}, z-index ${b.zindex}) — lower plane needs a lower z-index`);
      }
    }
  }
  return errors;
}

/**
 * The engine's FORM_TOGGLE_SKIP set, DERIVED from the frame manifests: the
 * sorted set of Frame ids whose manifest declares exemptFromChrome:true. Adding
 * a sovereign Frame folder auto-extends this — the OCP win (design/forms.md §11;
 * ADR §6). Equals the historical hardcoded set by construction (asserted by
 * test/unit/forms/forms-manifest.test.js).
 */
function frameToggleSkip(frames) {
  const list = frames || loadFrames();
  return list.filter((f) => f.exemptFromChrome).map((f) => f.id).sort();
}

module.exports = {
  Z_PLANES,
  CELL_REGIONS,
  OCCUPANT_KINDS,
  TILE_KINDS,
  FILL_MODES,
  CAPACITIES,
  FRAME_KINDS,
  TILE_STATUSES,
  FORMS,
  validateCell,
  validateFrame,
  validateTile,
  loadCells,
  loadFrames,
  loadTiles,
  loadCatalog,
  checkIntegrity,
  collectGeometryTokenRefs,
  checkManifestCssRefs,
  checkCellCssPresence,
  checkSuppressIntegrity,
  checkZPlaneZIndex,
  frameToggleSkip,
};
