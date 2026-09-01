/**
 * Unit: the two EQUIVALENCE claims behind the manifest-schema gate (#1977).
 *
 * WHY THIS FILE EXISTS. `engineering/decisions/2026-09-01-manifest-schema-gate.md`
 * rests on two claims that nothing in the tree could reproduce:
 *
 *   1. WALKER EQUIVALENCE — replacing the hand-written `checkThemeManifestShape`
 *      with ajv lost no coverage ("39 mutations, zero regressions; ajv is a
 *      strict superset").
 *   2. DRAFT EQUIVALENCE — moving `themes/theme.schema.json` from draft-07 to
 *      2020-12 changed no meaning ("zero disagreements").
 *
 * Both were agent-reported. An agent's transcript is not evidence (HARD RULE
 * #23): it names no surface anyone else can drive, and the retired walker was
 * DELETED by the same commit, so the one artifact the claim is about stopped
 * existing the moment the claim was made. This file makes both numbers
 * re-derivable by running the repo.
 *
 * WHAT IT DOES NOT CLAIM. Equivalence is proved over a corpus DERIVED FROM THE
 * SCHEMA, not over every possible manifest. A mutation family the generator does
 * not emit is a mutation family neither implementation is compared on — so the
 * generator is written to walk the schema's own keywords, and `mutationCorpus`
 * asserts it covered every keyword the schema actually uses. That check is what
 * stops the corpus quietly shrinking to the cases that pass.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const Ajv7 = require('ajv');
const { makeAjv } = require('../../../tools/manifest-schemas.js');

const ROOT = path.resolve(__dirname, '../../..');
const THEMES_DIR = path.join(ROOT, 'themes');
const SCHEMA_PATH = 'themes/theme.schema.json';

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_PATH), 'utf8'));

/** Every real theme manifest, as [name, manifest] — the population both claims are about. */
function realManifests() {
  return fs
    .readdirSync(THEMES_DIR)
    .filter((f) => f.endsWith('.manifest.json'))
    .sort()
    .map((f) => [f.replace(/\.manifest\.json$/, ''), JSON.parse(fs.readFileSync(path.join(THEMES_DIR, f), 'utf8'))]);
}

// ─────────────────────────────────────────────────────────────────────────────
// THE RETIRED WALKER, transcribed from `checkThemeManifestShape` at 71539f7
// (tools/check-ownership.js, deleted by #1977).
//
// The walk below is character-for-character the original. The ONE change is its
// input: the original called `listThemeManifests(themesDir)` and read the schema
// off disk itself; this takes both as arguments so a corpus can drive it. Nothing
// inside the loop is adapted, because an "equivalent" walker that is quietly more
// forgiving than the one that shipped would prove the wrong thing.
//
// Recover the original to diff against this:
//   git show 71539f7:tools/check-ownership.js | sed -n '698,760p'
// ─────────────────────────────────────────────────────────────────────────────
function retiredWalker(errors, walkerSchema, manifests) {
  const props = walkerSchema.properties ?? {};
  const typeOk = (v, t) => {
    const types = Array.isArray(t) ? t : [t];
    return types.some((x) => (
      x === 'string' ? typeof v === 'string'
        : x === 'integer' ? Number.isInteger(v)
          : x === 'array' ? Array.isArray(v)
            : x === 'null' ? v === null
              : x === 'object' ? (v && typeof v === 'object' && !Array.isArray(v))
                : false));
  };

  for (const [name, m] of manifests) {
    const where = `themes/${name}.manifest.json`;

    // Required — the base set, plus whichever arm of the conditional applies.
    const required = new Set(walkerSchema.required ?? []);
    for (const rule of walkerSchema.allOf ?? []) {
      const cond = rule.if?.properties ?? {};
      const matches = Object.entries(cond).every(([k, c]) => m[k] === c.const);
      for (const r of (matches ? rule.then : rule.else)?.required ?? []) required.add(r);
    }
    for (const r of required) {
      if (m[r] === undefined) errors.push(`${where} is missing required field \`${r}\` (see themes/theme.schema.json).`);
    }

    for (const [k, v] of Object.entries(m)) {
      if (k === '$schema') continue;
      const spec = props[k];
      if (!spec) {
        if (walkerSchema.additionalProperties === false) {
          errors.push(`${where} carries unknown field \`${k}\`. Add it to themes/theme.schema.json with its meaning, or remove it — an undeclared field is one no gate can check.`);
        }
        continue;
      }
      if (spec.enum && !spec.enum.includes(v)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\`, which is not one of ${spec.enum.map((x) => JSON.stringify(x)).join(' | ')}.`);
        continue;
      }
      if (spec.type && !typeOk(v, spec.type)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\` but the schema says ${JSON.stringify(spec.type)}.`);
        continue;
      }
      if (spec.pattern && typeof v === 'string' && !new RegExp(spec.pattern).test(v)) {
        errors.push(`${where} has \`${k}: ${JSON.stringify(v)}\`, which does not match ${spec.pattern}.`);
      }
      if (Number.isInteger(spec.minimum) && typeof v === 'number' && v < spec.minimum) {
        errors.push(`${where} has \`${k}: ${v}\`, below the minimum of ${spec.minimum}.`);
      }
      if (spec.items?.enum && Array.isArray(v)) {
        for (const item of v) {
          if (!spec.items.enum.includes(item)) {
            errors.push(`${where} has \`${k}\` containing ${JSON.stringify(item)}, which is not one of ${spec.items.enum.map((x) => JSON.stringify(x)).join(' | ')}.`);
          }
        }
        if (spec.uniqueItems && new Set(v).size !== v.length) errors.push(`${where} has duplicate entries in \`${k}\`.`);
        if (Number.isInteger(spec.minItems) && v.length < spec.minItems) errors.push(`${where} has \`${k}\` with fewer than ${spec.minItems} entr(y/ies).`);
      }
    }
  }
}

/** Does the retired walker reject this manifest? */
const walkerRejects = (manifest) => {
  const errors = [];
  retiredWalker(errors, schema, [['probe', manifest]]);
  return errors.length > 0;
};

// ─────────────────────────────────────────────────────────────────────────────
// THE MUTATION CORPUS, derived from the schema's own keywords.
//
// Hand-listing the mutations would reproduce the defect this whole gate exists
// to fix: a checker that covers whatever its author happened to think of, and
// reports nothing about the rest. So the generator walks `properties` and emits
// one mutation per keyword it finds, over two REAL seed manifests chosen to sit
// on opposite arms of the schema's one `if`/`then`/`else` (a `base` theme needs
// `tier` + `darkCounterpart`; everything else needs `extends`).
// ─────────────────────────────────────────────────────────────────────────────

/** A value of the wrong type for `spec.type`, so the `type` keyword is the one that fires. */
function wrongTyped(spec) {
  const types = new Set(Array.isArray(spec.type) ? spec.type : [spec.type]);
  if (!types.has('array')) return ['wrong', 'type'];
  if (!types.has('integer')) return 7.5;
  return 'a string';
}

function mutationsFor(seedName, seed) {
  const out = [];
  const add = (id, why, mutate) => {
    const manifest = JSON.parse(JSON.stringify(seed));
    mutate(manifest);
    out.push({ id: `${seedName}/${id}`, why, seed: seedName, manifest });
  };

  // `required`, both arms of the conditional included — the arm that applies is
  // whichever this seed sits on, which is why there are two seeds.
  const required = new Set(schema.required ?? []);
  for (const rule of schema.allOf ?? []) {
    for (const arm of ['then', 'else']) for (const r of rule[arm]?.required ?? []) required.add(r);
  }
  for (const r of [...required].sort()) {
    if (seed[r] === undefined) continue; // deleting an absent field mutates nothing
    add(`required:${r}`, `deletes required \`${r}\``, (m) => delete m[r]);
  }

  // One mutation per keyword each declared property actually uses.
  for (const [key, spec] of Object.entries(schema.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
    if (spec.enum) add(`enum:${key}`, `\`${key}\` outside its enum`, (m) => { m[key] = '__illegal__'; });
    if (spec.pattern) add(`pattern:${key}`, `\`${key}\` violating ${spec.pattern}`, (m) => { m[key] = 'Not A Slug!'; });
    if (spec.type) add(`type:${key}`, `\`${key}\` of the wrong type`, (m) => { m[key] = wrongTyped(spec); });
    if (Number.isInteger(spec.minimum)) add(`minimum:${key}`, `\`${key}\` below ${spec.minimum}`, (m) => { m[key] = spec.minimum - 1; });
    if (spec.items?.enum) add(`items:${key}`, `\`${key}\` holding a value outside its item enum`, (m) => { m[key] = ['__illegal__']; });
    if (spec.uniqueItems) add(`uniqueItems:${key}`, `\`${key}\` with a duplicate`, (m) => { m[key] = [spec.items.enum[0], spec.items.enum[0]]; });
    if (Number.isInteger(spec.minItems)) add(`minItems:${key}`, `\`${key}\` shorter than ${spec.minItems}`, (m) => { m[key] = []; });
  }

  // `additionalProperties: false` — the one keyword that belongs to no property.
  if (schema.additionalProperties === false) {
    add('additionalProperties', 'an undeclared top-level field', (m) => { m.slicng = 'the one-letter typo, in theme clothing'; });
  }
  return out;
}

/** The whole corpus, over both `if` arms. */
function mutationCorpus() {
  const byName = new Map(realManifests());
  const base = byName.get('indaco');
  const derived = byName.get('a11y-achromatopsia');
  assert.ok(base && base.role === 'base', 'seed assumption: themes/indaco.manifest.json is a `base` theme');
  assert.ok(derived && derived.role !== 'base', 'seed assumption: themes/a11y-achromatopsia.manifest.json is not a `base` theme');
  const corpus = [...mutationsFor('indaco', base), ...mutationsFor('a11y-achromatopsia', derived)];

  // The generator must have EMITTED something for every keyword the schema uses.
  // Without this the corpus can silently shrink to whatever still passes, which
  // is the failure mode the gate itself was built to end.
  const used = new Set();
  const collect = (node) => {
    if (!node || typeof node !== 'object') return;
    for (const k of ['enum', 'pattern', 'type', 'minimum', 'uniqueItems', 'minItems']) if (node[k] !== undefined) used.add(k);
    if (node.items?.enum) used.add('items');
    for (const v of Object.values(node.properties ?? {})) collect(v);
  };
  collect(schema);
  used.add('required');
  used.add('additionalProperties');
  const emitted = new Set(corpus.map((c) => c.id.split('/')[1].split(':')[0]));
  const missing = [...used].filter((k) => !emitted.has(k)).sort();
  assert.deepEqual(missing, [], `the corpus emits no mutation for schema keyword(s): ${missing.join(', ')}`);
  return corpus;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM 1 — WALKER EQUIVALENCE
// ─────────────────────────────────────────────────────────────────────────────

test('the corpus is the size the decision record cites, and covers both `if` arms', () => {
  const corpus = mutationCorpus();
  // PINNED so the record and the harness cannot drift apart. Growing the schema
  // grows the corpus and fails here — update BOTH this number and the count in
  // engineering/decisions/2026-09-01-manifest-schema-gate.md, which is the point.
  assert.equal(corpus.length, 51, 'mutation corpus size changed — update the decision record with the new number');
  assert.ok(corpus.some((c) => c.seed === 'indaco'), 'the `base` arm is unexercised');
  assert.ok(corpus.some((c) => c.seed === 'a11y-achromatopsia'), 'the non-`base` arm is unexercised');
  // Every mutation must actually be a defect: a generator emitting valid
  // manifests would report a flattering, meaningless equivalence.
  const validate = makeAjv().compile(schema);
  const notADefect = corpus.filter((c) => validate(c.manifest)).map((c) => c.id);
  assert.deepEqual(notADefect, [], `these "mutations" are legal manifests, so they prove nothing: ${notADefect.join(', ')}`);
});

test('EQUIVALENCE: ajv rejects every mutation the retired walker rejected (zero regressions)', () => {
  const validate = makeAjv().compile(schema);
  const regressions = mutationCorpus()
    .filter((c) => walkerRejects(c.manifest) && validate(c.manifest))
    .map((c) => `${c.id} — ${c.why}`);
  assert.deepEqual(regressions, [], `ajv passed what the retired walker caught:\n${regressions.join('\n')}`);
});

test('SUPERSET: ajv also rejects mutations the retired walker waved through', () => {
  // "Strict superset" is two claims, and the second one is the reason the swap
  // was worth making. The walker's own `if (k === '$schema') continue;` is the
  // clearest margin: it never checked the link that gives an author's editor its
  // completion, which is exactly what arm 3 of the gate now owns.
  const validate = makeAjv().compile(schema);
  const margin = mutationCorpus()
    .filter((c) => !walkerRejects(c.manifest) && !validate(c.manifest))
    .map((c) => c.id);
  assert.ok(margin.length > 0, 'no mutation separates the two — this is equality, not a superset');
  assert.ok(
    margin.some((id) => id.includes('$schema')),
    `expected the walker's skipped \`$schema\` to be part of the margin, got: ${margin.join(', ')}`,
  );
});

test('both implementations agree the real tree is clean', () => {
  const manifests = realManifests();
  const walkerErrors = [];
  retiredWalker(walkerErrors, schema, manifests);
  assert.deepEqual(walkerErrors, [], `the retired walker rejects the shipped themes:\n${walkerErrors.join('\n')}`);
  const validate = makeAjv().compile(schema);
  const ajvRejects = manifests.filter(([, m]) => !validate(m)).map(([n]) => n);
  assert.deepEqual(ajvRejects, [], `ajv rejects the shipped themes: ${ajvRejects.join(', ')}`);
});

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM 2 — DRAFT EQUIVALENCE (draft-07 → 2020-12)
// ─────────────────────────────────────────────────────────────────────────────

/** The same schema text, re-pointed at draft-07 — the only edit #1977 made to it. */
const asDraft07 = () => ({ ...schema, $schema: 'http://json-schema.org/draft-07/schema#' });

test('DRAFT: both drafts return the same verdict on every real theme and every mutation', () => {
  const opts = { allErrors: true, strict: true, strictRequired: false };
  const v2020 = makeAjv().compile(schema);
  const v07 = new Ajv7(opts).compile(asDraft07());

  const cases = [
    ...realManifests().map(([name, m]) => ({ id: `themes/${name}`, manifest: m })),
    ...mutationCorpus(),
  ];
  const disagreements = cases
    .filter((c) => v2020(c.manifest) !== v07(c.manifest))
    .map((c) => c.id);
  assert.deepEqual(disagreements, [], `the draft bump changed a verdict on: ${disagreements.join(', ')}`);
  // Guard the guard: a comparison over an empty set agrees with everything.
  assert.ok(cases.length >= 33 + 51, `expected the real tree plus the corpus, got ${cases.length} cases`);
});

test('DRAFT: both drafts report the same failing keyword at the same place', () => {
  // A matching verdict is the weak half of the claim — two validators can agree a
  // manifest is broken while disagreeing about WHY, and the "why" is the line an
  // author reads. Compared as a set of `keyword@instancePath`, since neither draft
  // promises an error ORDER.
  const opts = { allErrors: true, strict: true, strictRequired: false };
  const v2020 = makeAjv().compile(schema);
  const v07 = new Ajv7(opts).compile(asDraft07());
  const shape = (validate, m) => {
    validate(m);
    return [...new Set((validate.errors ?? []).map((e) => `${e.keyword}@${e.instancePath || '/'}`))].sort();
  };
  const differing = mutationCorpus()
    .filter((c) => JSON.stringify(shape(v2020, c.manifest)) !== JSON.stringify(shape(v07, c.manifest)))
    .map((c) => `${c.id}: 2020-12 ${JSON.stringify(shape(v2020, c.manifest))} vs draft-07 ${JSON.stringify(shape(v07, c.manifest))}`);
  assert.deepEqual(differing, [], `the drafts disagree about what is wrong:\n${differing.join('\n')}`);
});

test('the theme schema really did move to 2020-12 (the migration this claim is about)', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  // And the draft-07 form still compiles, so the comparison above is a real one
  // rather than a silently-skipped arm.
  assert.doesNotThrow(() => new Ajv7({ allErrors: true, strict: true, strictRequired: false }).compile(asDraft07()));
});
