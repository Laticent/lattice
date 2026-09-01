/**
 * The ONE declaration of which manifest families exist, which schema governs
 * each, and how a manifest is checked against it.
 *
 * WHY THIS FILE EXISTS. Lattice keeps four kinds of hand-authored JSON manifest
 * — components, themes, and the Form model's frames / cells / tiles — and every
 * one of them already shipped a `*.schema.json` beside it. Those schema files
 * were inert. Nothing in the repo ran a JSON-Schema validator, so each family
 * grew its OWN hand-written checker instead, and the three of them disagreed
 * about how much they checked:
 *
 *   · components — `validate()` in lib/components/index.js DERIVES its
 *     vocabularies from the schema and rejects unknown TOP-LEVEL keys. Real
 *     enforcement, but flat: it never descends into `adapt.capacity`, so three
 *     shipped manifests carried prose parked in undeclared nested fields for
 *     months and every gate stayed green.
 *   · themes — `checkThemeManifestShape` in tools/check-ownership.js read the
 *     schema at runtime and walked a deliberate subset of it (required,
 *     additionalProperties, enum, type, pattern, and the one if/then/else).
 *     Its own docblock said: "If it ever needs more, reach for a real validator
 *     rather than growing this." This file is that step.
 *   · forms — `validateFrame` / `validateTile` / `validateCell` in
 *     lib/forms/index.js never read their schemas at all. The enums are
 *     hand-copied ("Enums mirrored from the schemas", lib/forms/index.js), and
 *     unknown keys passed silently. Renaming the OPTIONAL `slicing` block on
 *     the `standard` frame to `slicng` — a one-letter typo that deletes the
 *     frame's whole responsive behavior — returned zero errors.
 *
 * Three hand-written checkers of three different strengths IS the bug. A schema
 * that nothing runs is a comment that looks like a contract.
 *
 * WHAT THIS FILE DOES NOT REPLACE. A JSON Schema describes the SHAPE of one
 * file in isolation. It cannot say "this theme claims to be a dark variant, so
 * its CSS must import a base" (`checkThemeRoles`) or "every cell id named in a
 * frame's `slicing` must exist in that frame's `cells`" (`checkIntegrity` in
 * lib/forms/index.js). Those cross-artifact gates stay exactly where they are
 * and keep running. This file owns shape only, so each side does the half it
 * can actually see.
 *
 * WHY ajv, AND WHY IT IS dev-ONLY. ajv understands the whole JSON Schema
 * language, so there is no rule we forgot to implement that then fails silently
 * — which is the very failure mode being fixed here, and a homegrown walker
 * reproduces it by construction. It is a devDependency and this module is
 * required only from tools/, never from lib/. That boundary matters: the
 * hand-copied enums in lib/forms/index.js and lib/components/index.js exist to
 * keep schema JSON out of the browser bundles, and reaching the component gate
 * through the wrong door once pulled a 41 KB manifest schema into the theme
 * bundle (changelog.d/1841). Manifests are validated at BUILD time, by the
 * build's own tooling; nothing here ships to a browser.
 *
 * Wired into `checkManifestSchemas` in tools/check-ownership.js, which
 * `npm run build:check` already runs in CI and in the pre-push hook — so this
 * adds no CI job, no CI step, and no git hook.
 */



const fs = require('node:fs');
const path = require('node:path');
const Ajv2020 = require('ajv/dist/2020');

const ROOT = path.resolve(__dirname, '..');

/**
 * THE REGISTRY. Every hand-authored manifest in the repo belongs to exactly one
 * row, and `checkFamilyCoverage` below fails the build on any manifest that
 * belongs to none — because a new family that nobody registers is a new family
 * nobody checks, which is how forms stayed unchecked in the first place.
 *
 * `dir` is scanned one level deep for a folder per artifact (`<name>/<name><ext>`),
 * except `flat` families whose manifests sit directly in `dir`.
 *
 * NOTE the cell extension. Cells are `<name>.cell.json`, NOT `.manifest.json`.
 * A `*.manifest.json` glob silently misses all ten of them.
 */
const FAMILIES = Object.freeze([
  {
    family: 'component',
    schema: 'lib/components/manifest.schema.json',
    dir: 'lib/components',
    ext: '.manifest.json',
    nested: true, // lib/components/<bucket>/<name>/<name>.manifest.json
  },
  {
    family: 'theme',
    schema: 'themes/theme.schema.json',
    dir: 'themes',
    ext: '.manifest.json',
    flat: true, // themes/<name>.manifest.json
  },
  {
    family: 'form frame',
    schema: 'lib/forms/schema/frame.schema.json',
    dir: 'lib/forms/frame',
    ext: '.manifest.json',
  },
  {
    family: 'form cell',
    schema: 'lib/forms/schema/cell.schema.json',
    dir: 'lib/forms/cell',
    ext: '.cell.json',
  },
  {
    family: 'form tile',
    schema: 'lib/forms/schema/tile.schema.json',
    dir: 'lib/forms/tile',
    ext: '.manifest.json',
  },
]);

/**
 * Directories a repo-wide manifest sweep must not walk: generated output, third-party
 * code, and the sanctioned throwaway area. A manifest under any of these is not
 * hand-authored, so it is not this gate's business.
 */
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git', 'test-results', '.scratch', 'coverage']);

/** Every hand-authored manifest path in the tree, repo-relative, sorted. */
function listAllManifests(root = ROOT) {
  const out = [];
  const walk = (rel) => {
    let entries;
    try {
      entries = fs.readdirSync(path.join(root, rel), { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(rel ? `${rel}/${e.name}` : e.name);
      } else if (e.name.endsWith('.manifest.json') || e.name.endsWith('.cell.json')) {
        out.push(rel ? `${rel}/${e.name}` : e.name);
      }
    }
  };
  walk('');
  return out.sort();
}

/** The manifest paths one family claims, repo-relative, sorted. */
function listFamilyManifests(fam, root = ROOT) {
  const base = path.join(root, fam.dir);
  if (!fs.existsSync(base)) return [];
  const out = [];
  if (fam.flat) {
    for (const f of fs.readdirSync(base)) {
      if (f.endsWith(fam.ext)) out.push(`${fam.dir}/${f}`);
    }
    return out.sort();
  }
  // <dir>/<name>/<name><ext>, or <dir>/<bucket>/<name>/<name><ext> when nested.
  const leaves = fam.nested
    ? fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .flatMap((b) =>
          fs
            .readdirSync(path.join(base, b.name), { withFileTypes: true })
            .filter((d) => d.isDirectory())
            .map((d) => `${fam.dir}/${b.name}/${d.name}/${d.name}${fam.ext}`),
        )
    : fs
        .readdirSync(base, { withFileTypes: true })
        .filter((d) => d.isDirectory())
        .map((d) => `${fam.dir}/${d.name}/${d.name}${fam.ext}`);
  for (const p of leaves) if (fs.existsSync(path.join(root, p))) out.push(p);
  return out.sort();
}

/**
 * One ajv instance, configured once.
 *
 * `strict: true` is doing real work beyond validating the manifests: it rejects
 * an unknown KEYWORD in a schema file, so a `patttern` typo in the schema fails
 * the build instead of silently checking nothing. That is this whole gate's own
 * failure mode, one level up.
 *
 * `strictRequired` is off because these schemas legitimately declare a field's
 * requiredness in an `allOf`/`if`/`then` arm separate from where the property is
 * defined — theme.schema.json requires `tier` only for curated palettes. That is
 * valid JSON Schema; ajv's objection is a style rule, not a spec rule.
 */
function makeAjv() {
  return new Ajv2020({ allErrors: true, strict: true, strictRequired: false });
}

/** The value an ajv `instancePath` (a JSON Pointer) points at, or undefined. */
function valueAt(data, instancePath) {
  if (!instancePath) return data;
  let cur = data;
  for (const raw of instancePath.split('/').slice(1)) {
    const key = raw.replace(/~1/g, '/').replace(/~0/g, '~');
    if (cur == null || typeof cur !== 'object') return undefined;
    cur = cur[key];
  }
  return cur;
}

/** `/adapt/capacity/wide` → `adapt.capacity.wide`; the root → ''. */
const dotted = (instancePath) => instancePath.replace(/^\//, '').replace(/\//g, '.');

/**
 * Render one ajv error in the house wording.
 *
 * ajv's own messages ("must be equal to one of the allowed values") name the rule
 * but not the offending value, so a reader has to open both the manifest and the
 * schema to learn what went wrong. The phrasing below is inherited from the
 * hand-written theme checker this replaces, which quoted the value and listed the
 * legal ones — strictly more useful, and pinned by check-ownership.test.js.
 */
function formatError(err, data, schemaPath) {
  const p = err.params ?? {};
  const scope = dotted(err.instancePath);
  const at = scope ? `\`${scope}\` ` : '';
  // The field the error is ABOUT, and its value — for keyword errors that is the
  // instancePath itself; for `required`/`additionalProperties` it is a child of it.
  const child = (name) => (scope ? `${scope}.${name}` : name);
  const shown = (v) => (v === undefined ? 'undefined' : JSON.stringify(v));

  switch (err.keyword) {
    case 'required':
      return `is missing required field \`${child(p.missingProperty)}\` (see ${schemaPath}).`;
    case 'additionalProperties':
      return (
        `carries unknown field \`${child(p.additionalProperty)}\`. Add it to ${schemaPath} with its meaning, ` +
        'or remove it — an undeclared field is one no gate can check.'
      );
    case 'enum':
      return (
        `has \`${scope || 'the manifest root'}: ${shown(valueAt(data, err.instancePath))}\`, which is not one of ` +
        `${(p.allowedValues ?? []).map((v) => JSON.stringify(v)).join(' | ')}.`
      );
    case 'pattern':
      return `has \`${scope}: ${shown(valueAt(data, err.instancePath))}\`, which does not match ${p.pattern}.`;
    case 'type':
      return `has \`${scope}: ${shown(valueAt(data, err.instancePath))}\` but the schema says ${JSON.stringify(p.type)}.`;
    case 'minimum':
    case 'maximum':
    case 'minLength':
    case 'maxLength':
    case 'minItems':
    case 'maxItems':
      return `has \`${scope}: ${shown(valueAt(data, err.instancePath))}\` — ${err.message}.`;
    case 'uniqueItems':
      return `has duplicate entries in \`${scope}\`.`;
    default:
      return `${at}${err.message}.`;
  }
}

/**
 * THE GATE. Validates every hand-authored manifest against its family's schema,
 * and proves the registry above still covers the tree.
 *
 * Three arms, and each catches something the other two cannot:
 *   1. COVERAGE — a manifest belonging to no registered family. Without this the
 *      gate certifies whatever it happens to know about, which is how three
 *      forms families sat unchecked behind a schema that described them.
 *   2. SHAPE — the manifest against its schema, nested fields included.
 *   3. SELF-REFERENCE — each manifest's own `$schema` points at the file that
 *      actually governs it. That link is what gives editors inline completion,
 *      and a copy-pasted wrong one sends an author's tooling to the wrong
 *      contract while every other gate here still passes.
 */
function checkManifestSchemas(errors, root = ROOT) {
  const ajv = makeAjv();
  const claimed = new Set();
  for (const fam of FAMILIES) {
    for (const file of checkFamily(errors, fam, { root, ajv })) claimed.add(file);
  }

  // Arm 1 — COVERAGE.
  for (const file of listAllManifests(root)) {
    if (claimed.has(file)) continue;
    errors.push(
      `${file} is a manifest no schema family covers, so nothing checks its shape. ` +
        'Add its family to FAMILIES in tools/manifest-schemas.js (with a schema beside the manifests it governs), ' +
        'or delete the file.',
    );
  }
}

/**
 * Check ONE family and return the repo-relative manifest paths it claimed.
 *
 * `dir` overrides where the manifests are read from while the schema still comes
 * from the real tree, which is how the gate's own tests point it at a fixture
 * directory holding a deliberately broken manifest.
 */
function checkFamily(errors, fam, { root = ROOT, dir = null, ajv = makeAjv() } = {}) {
  let schema;
  try {
    schema = JSON.parse(fs.readFileSync(path.join(root, fam.schema), 'utf8'));
  } catch (e) {
    errors.push(`${fam.schema} could not be read: ${e.message}`);
    return [];
  }

  let validate;
  try {
    validate = ajv.compile(schema);
  } catch (e) {
    errors.push(
      `${fam.schema} is not a valid JSON Schema: ${e.message}. ` +
        'Fix the schema — every manifest in this family is unchecked until it compiles.',
    );
    return [];
  }

  // A fixture dir stands in for the family's own directory, so read it flat: a
  // temp dir holds `probe.manifest.json`, not `probe/probe.manifest.json`.
  const files = dir
    ? fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(fam.ext))
        .sort()
        .map((f) => path.join(dir, f))
    : listFamilyManifests(fam, root).map((f) => path.join(root, f));

  if (files.length === 0 && !dir) {
    errors.push(
      `${fam.schema} governs zero files — the ${fam.family} family found no manifests under ${fam.dir}/. ` +
        'Either the directory moved (update FAMILIES in tools/manifest-schemas.js) or the schema is dead and should be deleted.',
    );
  }

  const claimed = [];
  for (const abs of files) {
    const label = dir ? path.basename(abs) : path.relative(root, abs).split(path.sep).join('/');
    if (!dir) claimed.push(label);
    let data;
    try {
      data = JSON.parse(fs.readFileSync(abs, 'utf8'));
    } catch (e) {
      errors.push(`${label} is not valid JSON: ${e.message}`);
      continue;
    }

    // Arm 2 — SHAPE.
    if (!validate(data)) {
      for (const err of validate.errors) {
        errors.push(`${label} ${formatError(err, data, fam.schema)}`);
      }
    }

    // Arm 3 — SELF-REFERENCE. Skipped for fixture dirs, whose relative depth is
    // not the real tree's, so a correct link there would resolve wrong here.
    if (!dir && typeof data.$schema === 'string' && !/^https?:/.test(data.$schema)) {
      const resolved = path.relative(root, path.resolve(path.dirname(abs), data.$schema)).split(path.sep).join('/');
      if (resolved !== fam.schema) {
        errors.push(
          `${label} declares \`"$schema": "${data.$schema}"\`, which resolves to ${resolved || '(outside the repo)'}, ` +
            `but this is a ${fam.family} manifest governed by ${fam.schema}. An editor follows that link for inline ` +
            'completion, so a wrong one offers the author the wrong contract.',
        );
      }
    }
  }
  return claimed;
}

/** The registry row for a family, by name. Throws rather than silently checking nothing. */
function family(name) {
  const fam = FAMILIES.find((f) => f.family === name);
  if (!fam) throw new Error(`unknown manifest family "${name}" (known: ${FAMILIES.map((f) => f.family).join(', ')})`);
  return fam;
}

module.exports = {
  FAMILIES,
  checkManifestSchemas,
  checkFamily,
  family,
  listAllManifests,
  listFamilyManifests,
  makeAjv,
  formatError,
};
