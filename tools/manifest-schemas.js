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
 * reproduces it by construction. It is a devDependency, and this module is
 * required only from tools/, never from lib/ — `checkAjvBoundary` in
 * tools/check-ownership.js enforces that rather than trusting this sentence.
 * The boundary is about the LIBRARY: `tools/` is not in package.json `files`,
 * so a `require('ajv')` in lib/ would ship a devDependency to consumers and
 * inline a validator into a browser bundle.
 *
 * It is NOT about the schema JSON, and an earlier draft of this comment claimed
 * otherwise. lib/layout/gate.js:34 already requires manifest.schema.json on
 * purpose, and esbuild inlines the whole file — descriptions included — into
 * docs/src/playground/layout-core.generated.js for the Studio. So a `description`
 * here is not a private note to a maintainer: it is shipped bytes in a browser
 * bundle and a tooltip in an author's editor. Keep them to a line and a pointer
 * at the decision record; two of them landed at 778 and 589 characters and had
 * to be cut.
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
 * Top-level directories the repo-wide sweep must not walk: generated output,
 * third-party code, the throwaway area. A manifest under any of these is not
 * hand-authored, so it is not this gate's business.
 *
 * ANCHORED AT THE ROOT, deliberately. Matching a bare name at any depth would
 * also skip `lib/coverage/` or a `dist/` inside a real family — a hiding place
 * for exactly the unchecked manifest arm 1 exists to find.
 */
const SKIP_ROOTS = new Set(['node_modules', 'dist', 'test-results', 'coverage']);

/**
 * A directory the sweep and the family listers both skip at ANY depth.
 *
 * Two rules, and both mirror the runtime loaders rather than inventing policy:
 *   · a DOT directory — `.git`, `.scratch`, `.vscode`, and critically
 *     `.claude/worktrees/`, which `.gitignore` reserves for transient agent
 *     worktrees. Walking it made a single `git worktree add` fail `build:check`
 *     (and therefore the pre-push hook) with one bogus error per manifest in the
 *     checkout — up to 131, none of them real. A gate that fires on work the
 *     author never touched is the one people learn to bypass.
 *   · an UNDERSCORE-prefixed directory — `loadDir` in lib/forms/index.js and
 *     `loadAll` in lib/components/index.js both skip these, so a parked
 *     `_draft/` is by convention not part of the catalog. The gate must agree
 *     with the loaders about what exists, or it polices files nothing loads.
 */
const isSkippedDir = (name) => name.startsWith('.') || name.startsWith('_');

/**
 * The filename suffixes the sweep looks for, DERIVED from the registry rather
 * than hardcoded — plus the one legacy shape a lister cannot express.
 *
 * Hardcoding the two suffixes reintroduced this gate's own disease one level up:
 * a sixth family with a new suffix (`foo.lens.json`) was invisible to the very
 * sweep that exists to catch a sixth family. Deriving them means adding a row to
 * FAMILIES is enough.
 *
 * `manifest.json` is listed separately because it is NOT a suffix match:
 * `'manifest.json'.endsWith('.manifest.json')` is false. `loadAll` still accepts
 * that pre-Phase-1 folder shape (lib/components/index.js), so without this entry
 * a component could be loaded into the shipped catalog while slipping BOTH arms.
 */
function sweptNames(families = FAMILIES) {
  return { suffixes: [...new Set(families.map((f) => f.ext))], exact: ['manifest.json'] };
}

/** Every hand-authored manifest path in the tree, repo-relative, sorted. */
function listAllManifests(root = ROOT, families = FAMILIES) {
  const { suffixes, exact } = sweptNames(families);
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
        if (isSkippedDir(e.name)) continue;
        if (!rel && SKIP_ROOTS.has(e.name)) continue;
        walk(rel ? `${rel}/${e.name}` : e.name);
      } else if (suffixes.some((s) => e.name.endsWith(s)) || exact.includes(e.name)) {
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
  // `_`-prefixed directories are skipped to match the runtime loaders, which
  // treat them as parked and never load them (see isSkippedDir).
  const subdirs = (dir) =>
    fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory() && !isSkippedDir(d.name))
      .map((d) => d.name);

  if (fam.flat) {
    for (const f of fs.readdirSync(base)) {
      if (f.endsWith(fam.ext) && !f.startsWith('_')) out.push(`${fam.dir}/${f}`);
    }
    return out.sort();
  }
  // <dir>/<name>/<name><ext>, or <dir>/<bucket>/<name>/<name><ext> when nested.
  const leaves = fam.nested
    ? subdirs(base).flatMap((b) =>
        subdirs(path.join(base, b)).flatMap((d) => [
          `${fam.dir}/${b}/${d}/${d}${fam.ext}`,
          // The pre-Phase-1 folder shape `loadAll` still accepts. Claimed here so
          // it is SHAPE-checked rather than merely reported as an orphan.
          `${fam.dir}/${b}/${d}/manifest.json`,
        ]),
      )
    : subdirs(base).map((d) => `${fam.dir}/${d}/${d}${fam.ext}`);
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

/**
 * `/adapt/capacity/wide` → `adapt.capacity.wide`; the root → ''.
 *
 * Unescapes each JSON Pointer token (`~1` → `/`, `~0` → `~`, in that order per
 * RFC 6901) so the field NAME in a message matches the field whose value the
 * same message quotes — `valueAt` already unescapes, and the two disagreeing
 * would print a name that does not exist.
 */
const dotted = (instancePath) =>
  instancePath
    .split('/')
    .slice(1)
    .map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'))
    .join('.');

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
  // The root has no field name, so every branch that interpolates `scope` bare
  // needs this — `has \`: [1,2]\`` reads as a formatting bug, not a defect report.
  // The guard existed on `enum` only and was missing from the other four.
  const where = scope || 'the manifest root';

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
        `has \`${where}: ${shown(valueAt(data, err.instancePath))}\`, which is not one of ` +
        `${(p.allowedValues ?? []).map((v) => JSON.stringify(v)).join(' | ')}.`
      );
    case 'pattern':
      return `has \`${where}: ${shown(valueAt(data, err.instancePath))}\`, which does not match ${p.pattern}.`;
    case 'type':
      return `has \`${where}: ${shown(valueAt(data, err.instancePath))}\` but the schema says ${JSON.stringify(p.type)}.`;
    case 'minimum':
    case 'maximum':
    case 'minLength':
    case 'maxLength':
    case 'minItems':
    case 'maxItems':
      return `has \`${where}: ${shown(valueAt(data, err.instancePath))}\` — ${err.message}.`;
    case 'uniqueItems':
      return `has duplicate entries in \`${where}\`.`;
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
    // STILL CLAIM the family's files. The family exists and is registered; its
    // schema merely cannot compile. Returning [] instead dropped all 61 component
    // manifests out of `claimed`, so one `patttern` typo in the schema produced 62
    // errors — 61 of them telling a reviewer to DELETE shipped components. One
    // cause should read as one error.
    return dir ? [] : listFamilyManifests(fam, root);
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
    //
    // `if` errors are dropped. ajv reports the CONDITIONAL alongside the real
    // failure, so a theme missing `tier` produced two lines — the actionable one
    // plus a bare `must match "then" schema`, which names no field and tells the
    // author nothing. The hand-written walker this replaced emitted one line, and
    // a replacement that talks more while saying the same thing is a regression.
    if (!validate(data)) {
      for (const err of validate.errors) {
        if (err.keyword === 'if') continue;
        errors.push(`${label} ${formatError(err, data, fam.schema)}`);
      }
    }

    // Arm 3 — SELF-REFERENCE. Skipped for fixture dirs, whose relative depth is
    // not the real tree's, so a correct link there would resolve wrong here.
    //
    // A MISSING or ABSOLUTE `$schema` fails too, and both were silent before.
    // Exempting `https?:` let through the single most plausible wrong paste —
    // `http://json-schema.org/draft-07/schema#`, which is what theme.schema.json
    // itself carried until this change — and an editor following it gets the
    // META-schema, not the theme contract. That is precisely the harm this arm
    // names, so the arm cannot be the thing that waves it through.
    if (!dir) {
      const ref = data.$schema;
      if (typeof ref !== 'string' || ref === '') {
        errors.push(
          `${label} declares no \`$schema\`. Every manifest links to the contract that governs it ` +
            `(${fam.schema}) — that link is what gives an editor inline completion, and all 131 manifests carry one.`,
        );
      } else if (/^[a-z][a-z0-9+.-]*:/i.test(ref)) {
        errors.push(
          `${label} declares \`"$schema": "${ref}"\`, an absolute URL. It must be a RELATIVE path to ` +
            `${fam.schema}; an absolute one points an editor at whatever that URL serves (often the JSON Schema ` +
            'meta-schema) rather than at this repo\'s contract.',
        );
      } else {
        const resolved = path.relative(root, path.resolve(path.dirname(abs), ref)).split(path.sep).join('/');
        if (resolved !== fam.schema) {
          errors.push(
            `${label} declares \`"$schema": "${ref}"\`, which resolves to ${resolved || '(outside the repo)'}, ` +
              `but this is a ${fam.family} manifest governed by ${fam.schema}. An editor follows that link for inline ` +
              'completion, so a wrong one offers the author the wrong contract.',
          );
        }
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
