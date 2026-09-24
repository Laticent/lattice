/**
 * files → a validated package (engineering/decisions/2026-09-23-portable-packages.md §3.2, §3.4).
 *
 * Input is a folder's files as a map of FILE NAME → contents. Only the manifest's
 * contents (and a theme's stylesheet, for its `@theme` projection) are read; every
 * other value may be `null`, so the build can pass a folder listing without loading
 * gallery PDFs into memory.
 *
 * THE MANIFEST OWNS THE NAME. Every file's role is found by its SUFFIX
 * (`kpi.styles.css` → `styles.css`), never by trusting its prefix, and the prefix is
 * then checked against the manifest's `name` as a projection. Two modes:
 *
 *   strict  (the repo gate)  a projection that disagrees is an ERROR. A renamed
 *                            folder, a file left behind by a rename, or a theme whose
 *                            `@theme` says another name fails the build.
 *   lenient (import)         a projection that disagrees is a RENAME the caller
 *                            applies with `write.js`. A browser saves `brand (1).zip`,
 *                            a user renames a folder, IndexedDB has no filenames at
 *                            all; the manifest travels inside, so it wins.
 *
 * Pure: no fs, so it bundles into the browser with the rest of the spine.
 */

const { FORMAT, MANIFEST_ROLE, TYPES, NAME_RE, kindOf, rolesOf, fileName } = require('./kinds.js');
const { themeDirectiveName } = require('../theme/parse.js');

/**
 * The role a file name plays for a kind, and the prefix in front of it.
 * `null` when the file matches no role (an asset, or a stray file).
 */
function roleOf(kind, file) {
  for (const role of rolesOf(kind)) {
    if (file === role) return { role, prefix: '' };
    if (file.endsWith(`.${role}`)) return { role, prefix: file.slice(0, -(role.length + 1)) };
  }
  return null;
}

/** The first `*.manifest.json` (or a bare `manifest.json`) in the file map. */
function manifestFiles(files) {
  return Object.keys(files).filter((f) => f === MANIFEST_ROLE || f.endsWith(`.${MANIFEST_ROLE}`));
}

function asText(v) {
  if (v == null) return null;
  if (typeof v === 'string') return v;
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return String(v);
}

/**
 * @param {Record<string, string|Uint8Array|null>} files  file name → contents
 * @param {{ type?: string, folder?: string, strict?: boolean }} [opts]
 *   `type`   the type the location implies (a repo root). A manifest `type` must agree.
 *   `folder` the folder's own name, for layouts that have one. Checked as a projection.
 *   `strict` projections must already match (the repo gate). Default false (import).
 * @returns {{ ok: boolean, errors: string[], renames: string[], pkg: object|null }}
 *   `pkg.dropped` lists the files a lenient read left behind (a README in a theme zip).
 */
function readPackage(files, { type, folder, strict = false } = {}) {
  const errors = [];
  const renames = [];
  const fail = () => ({ ok: false, errors, renames, pkg: null });

  const found = manifestFiles(files || {});
  if (found.length !== 1) {
    errors.push(found.length ? `more than one manifest: ${found.join(', ')}` : 'no manifest (<name>.manifest.json)');
    return fail();
  }
  const manifestFile = found[0];
  let manifest;
  try {
    manifest = JSON.parse(asText(files[manifestFile]) ?? '');
  } catch (e) {
    errors.push(`${manifestFile} is not valid JSON: ${e.message}`);
    return fail();
  }
  if (manifest === null || typeof manifest !== 'object' || Array.isArray(manifest)) {
    errors.push(`${manifestFile} must be a JSON object`);
    return fail();
  }

  const name = manifest.name;
  if (typeof name !== 'string' || !NAME_RE.test(name)) {
    errors.push(`${manifestFile}: "name" must be a lowercase slug starting with a letter (got ${JSON.stringify(name)})`);
    return fail();
  }

  // The type: declared by the manifest, implied by the location, or both — and then equal.
  if (manifest.type !== undefined && !TYPES.includes(manifest.type)) {
    errors.push(`${manifestFile}: "type" must be one of ${TYPES.join(', ')} (got ${JSON.stringify(manifest.type)})`);
    return fail();
  }
  if (type !== undefined && !TYPES.includes(type)) throw new Error(`readPackage: unknown type ${JSON.stringify(type)}`);
  if (manifest.type && type && manifest.type !== type) {
    errors.push(`${manifestFile} says "type": "${manifest.type}", but it sits where ${type} packages live`);
    return fail();
  }
  const resolved = manifest.type || type;
  if (!resolved) {
    errors.push(`${manifestFile} has no "type", and nothing else says what kind of package this is`);
    return fail();
  }
  if (manifest.format !== undefined && manifest.format !== FORMAT) {
    errors.push(
      `${manifestFile}: "format": ${JSON.stringify(manifest.format)} — this Lattice reads format ${FORMAT}` +
        (typeof manifest.format === 'number' && manifest.format > FORMAT ? '; the package was made by a newer Lattice' : ''),
    );
    return fail();
  }
  const kind = kindOf(resolved);

  // Projection 1: the folder name.
  if (folder !== undefined && folder !== name) {
    (strict ? errors : renames).push(`folder "${folder}" → "${name}" (the manifest's name)`);
  }

  // Projection 2: every role file's prefix. TWO PASSES, so a file already named for
  // the manifest always wins its role: a component asset that merely ENDS in a role
  // suffix (`logo.docs.md` beside `kpi.docs.md`) stays an asset instead of being
  // renamed over the real file.
  const roles = {};
  const assets = [];
  const outputs = [];
  const dropped = [];
  const notOurs = (file) => {
    if (kind.assets) assets.push(file);
    else if (strict) errors.push(`${file} is not a ${resolved} file (expected ${[...kind.required, ...kind.optional].map((r) => fileName(name, r)).join(', ')})`);
    // An import may carry a README or a stray file; it is left behind, and said so.
    else dropped.push(file);
  };
  const sorted = Object.keys(files).sort();
  const mismatched = [];
  for (const file of sorted) {
    const hit = roleOf(kind, file);
    if (!hit) {
      notOurs(file);
      continue;
    }
    if (hit.prefix !== name) {
      mismatched.push([file, hit]);
      continue;
    }
    if (kind.outputs.includes(hit.role)) outputs.push(file);
    else roles[hit.role] = file;
  }
  for (const [file, hit] of mismatched) {
    const isOutput = kind.outputs.includes(hit.role);
    if (!isOutput && roles[hit.role]) {
      // The role is already played by a correctly named file.
      notOurs(file);
      continue;
    }
    const want = fileName(name, hit.role);
    if (strict) errors.push(`${file} should be ${want} — the manifest's name is "${name}"`);
    else renames.push(`${file} → ${want}`);
    if (isOutput) outputs.push(file);
    else roles[hit.role] = file;
  }
  for (const role of kind.required) {
    if (!roles[role]) errors.push(`missing ${fileName(name, role)}`);
  }

  // Projection 3: a theme's `@theme` directive.
  if (resolved === 'theme' && roles.css) {
    const declared = themeDirectiveName(asText(files[roles.css]));
    if (declared !== name) {
      const what = declared ? `declares \`@theme ${declared}\`` : 'declares no `@theme`';
      if (strict) errors.push(`${roles.css} ${what} — the manifest's name is "${name}"`);
      else renames.push(`@theme ${declared ?? '(none)'} → @theme ${name}`);
    }
  }

  if (errors.length) return fail();
  const code = kind.code.some((r) => roles[r]);
  return {
    ok: true,
    errors,
    renames,
    pkg: { type: resolved, name, format: FORMAT, manifest, files, roles, assets, outputs, dropped, code },
  };
}

module.exports = { readPackage, roleOf, asText };
