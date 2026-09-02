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
 * #23): it names no surface anyone else can drive, and the walk it compared
 * against was DELETED by the same commit, so the one artifact the claim is about
 * stopped existing the moment the claim was made. This file makes both numbers
 * re-derivable by running the repo.
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHAT AN INDEPENDENT REVIEW CHANGED (#2016).
 *
 * The first cut of this file was itself unreviewed, and a checker plus a red team
 * found that three of its arms measured less than they claimed. A measuring
 * instrument whose failure mode is a comfortable green is worse than no
 * instrument, so the corrections are load-bearing and are listed here rather than
 * buried:
 *
 *   - THE COVERAGE GUARD DID NOT BIND. It scanned for six hardcoded keyword
 *     NAMES, so an ordinary tightening (`maxLength`, `minLength`, `maximum`,
 *     `maxItems`) entered the schema, was enforced by ajv, compared on nothing,
 *     and left `missing` empty and the corpus size unmoved. The census below is
 *     derived from the schema instead, keyed by JSON POINTER, and it REFUSES any
 *     construct the generator has no strategy for. A namesake elsewhere no longer
 *     satisfies coverage here.
 *   - THE GENERATOR COULD NOT REACH THE SCHEMA'S OWN CONDITIONAL. It walked only
 *     top-level `properties`. The one region this schema puts logic in —
 *     `allOf[0].then` / `else` — and any nested object block were both invisible,
 *     which is the `adapt.capacity` defect family the whole gate was built for.
 *     It now descends into nested properties and both conditional arms.
 *   - THE PIN WAS A COUNT, NOT A FINGERPRINT. `length === 51` holds across any
 *     offsetting edit (drop a `pattern`, add a property). The corpus is pinned as
 *     a sorted id fingerprint, so a change in COMPOSITION fails too.
 *   - THE SUPERSET CLAIM WAS CHECKED IN ONE DIRECTION ONLY. Every probe was a
 *     defect, so "the walker rejects something ajv accepts" — the case that makes
 *     `superset` false — could not be observed. Legal variants drawn from the
 *     real tree now check it.
 *   - THE DRAFT ARM WAS A TAUTOLOGY. Both dialects compile this schema to
 *     BYTE-IDENTICAL validator code, so "84 cases, zero disagreements" was one
 *     trivially true fact repeated 84 times. That identity is now asserted
 *     DIRECTLY (it is a far stronger statement than any sample), and a negative
 *     control proves the comparison rig can still detect a real divergence.
 *
 * WHAT IT STILL DOES NOT CLAIM. Equivalence is proved over a corpus DERIVED FROM
 * THE SCHEMA, not over every possible manifest. That is why the census refuses
 * unsupported constructs: the corpus may be incomplete, but it may not be
 * incomplete SILENTLY.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// The dialect comes from the CLASS, not from the `$schema` string: ajv's default
// export is its draft-07 implementation and `ajv/dist/2020` is the 2020-12 one,
// and each REFUSES the other's `$schema` (measured). Naming it `Ajv7` invited the
// reading that re-pointing `$schema` selects the semantics — it does not, and a
// future "simplification" to one class would make the whole draft arm decorative.
const AjvDraft07 = require('ajv');
const { makeAjv } = require('../../../tools/manifest-schemas.js');

const ROOT = path.resolve(__dirname, '../../..');
const THEMES_DIR = path.join(ROOT, 'themes');
const SCHEMA_PATH = 'themes/theme.schema.json';

const schema = JSON.parse(fs.readFileSync(path.join(ROOT, SCHEMA_PATH), 'utf8'));

/**
 * The corpus, pinned two ways. The SIZE catches growth; the FINGERPRINT (a hash of
 * the sorted mutation ids) catches a change in COMPOSITION that leaves the size
 * alone — dropping one property's `pattern` while adding another property is a real
 * loss of coverage that a bare count cannot see. Both numbers are quoted in
 * engineering/decisions/2026-09-01-manifest-schema-gate.md and must move together.
 */
const CORPUS_SIZE = 55;
const CORPUS_FINGERPRINT = '3b49f539bb83c72a';

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
//   git show 71539f7:tools/check-ownership.js | sed -n '698,766p'
//
// The range is 698-766, NOT 698-760 as this comment first said: the function's
// closing brace is at 766, and 761-766 hold the `uniqueItems` and `minItems`
// checks. A reader following the old range diffed a copy missing two of the nine
// rules and would have concluded this transcription had invented them.
//
// And the NAME still exists at HEAD — `tools/check-ownership.js:710` is now a
// four-line delegator to `manifestSchemas.checkFamily`. The WALK is gone, which
// is what this file compares against; grepping the name at HEAD finds an ajv
// shim, not the implementation under test.
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
// THE KEYWORD CENSUS, keyed by JSON POINTER.
//
// The guard this replaces scanned for six hardcoded keyword NAMES and treated a
// namesake anywhere as covering a keyword everywhere. Four ordinary tightenings
// (`maxLength`, `minLength`, `maximum`, `maxItems`) therefore entered the schema,
// were enforced by ajv, were compared on nothing, and left the guard green.
//
// So the census walks the schema and records `keyword@pointer` for every
// ASSERTION it finds, wherever it sits. Two things then have to hold, and both
// are asserted below: the generator emits a mutation for each of them, and the
// schema uses no construct the generator has no strategy for. The second is what
// keeps the corpus honestly incomplete rather than silently incomplete.
// ─────────────────────────────────────────────────────────────────────────────

/** Keys that carry a SUBSCHEMA or an annotation — not assertions needing a mutation. */
const STRUCTURAL = new Set([
  '$schema', '$id', '$anchor', '$ref', '$defs', 'definitions', '$comment',
  'title', 'description', 'default', 'examples', 'deprecated', 'readOnly', 'writeOnly',
  'properties', 'allOf', 'if', 'then', 'else', 'items',
]);

/**
 * Constructs the generator HAS a mutation strategy for. Anything else in the
 * schema fails the census by name rather than being skipped — the whole point of
 * the rewrite. Extending the schema past this list is a deliberate act that has
 * to extend `violate()` with it.
 */
const SUPPORTED = new Set([
  'type', 'enum', 'const', 'pattern', 'minimum', 'maximum', 'minLength', 'maxLength',
  'minItems', 'maxItems', 'uniqueItems', 'required', 'additionalProperties',
]);

/** Recurse into these; each holds a subschema (or a map/array of them). */
function childSchemas(node, pointer) {
  const out = [];
  for (const [k, v] of Object.entries(node.properties ?? {})) out.push([v, `${pointer}/properties/${k}`]);
  for (const [i, v] of (node.allOf ?? []).entries()) out.push([v, `${pointer}/allOf/${i}`]);
  // `then` / `else` assert; `if` SELECTS. A manifest that fails the `if` condition is
  // not invalid — it is simply governed by the `else` arm, so there is no "violate
  // the `if`" mutation to write. Both seeds exist precisely to cover both arms, so
  // the selector is exercised even though it is not censused.
  for (const arm of ['then', 'else']) if (node[arm]) out.push([node[arm], `${pointer}/${arm}`]);
  if (node.items && typeof node.items === 'object') out.push([node.items, `${pointer}/items`]);
  return out;
}

/** Every `keyword@pointer` the schema asserts, plus every construct we cannot mutate. */
function census(node = schema, pointer = '', acc = { needed: new Set(), unsupported: new Set() }) {
  if (!node || typeof node !== 'object') return acc;
  for (const key of Object.keys(node)) {
    if (STRUCTURAL.has(key)) continue;
    // `additionalProperties: true` asserts nothing; only the closed form does.
    if (key === 'additionalProperties' && node[key] !== false) {
      if (typeof node[key] === 'object') acc.unsupported.add(`additionalProperties(subschema)@${pointer || '/'}`);
      continue;
    }
    if (!SUPPORTED.has(key)) { acc.unsupported.add(`${key}@${pointer || '/'}`); continue; }
    acc.needed.add(`${key}@${pointer || '/'}`);
  }
  for (const [child, ptr] of childSchemas(node, pointer)) census(child, ptr, acc);
  return acc;
}

// ─────────────────────────────────────────────────────────────────────────────
// THE MUTATION CORPUS.
//
// Hand-listing the mutations would reproduce the defect this whole gate exists to
// fix: a checker that covers whatever its author happened to think of and reports
// nothing about the rest. So the generator walks the schema — top-level
// properties, NESTED object properties, and BOTH arms of the conditional — and
// emits one mutation per assertion the census found, over two REAL seeds chosen
// to sit on opposite arms of the schema's one `if`/`then`/`else` (a `base` theme
// needs `tier` + `darkCounterpart`; everything else needs `extends`).
// ─────────────────────────────────────────────────────────────────────────────

/** A value of the wrong type for `spec.type`, so the `type` keyword is the one that fires. */
function wrongTyped(spec) {
  const types = new Set(Array.isArray(spec.type) ? spec.type : [spec.type]);
  if (!types.has('array')) return ['wrong', 'type'];
  if (!types.has('integer') && !types.has('number')) return 7.5;
  return 'a string';
}

/** A value violating exactly `keyword` of `spec`. Throws for anything unsupported. */
function violate(spec, keyword) {
  switch (keyword) {
    case 'type': return wrongTyped(spec);
    case 'enum': return '__illegal__';
    case 'const': return '__not_the_const__';
    case 'pattern': return 'Not A Slug!';
    case 'minimum': return spec.minimum - 1;
    case 'maximum': return spec.maximum + 1;
    case 'minLength': return '';
    case 'maxLength': return 'x'.repeat(spec.maxLength + 1);
    case 'minItems': return [];
    case 'maxItems': return Array.from({ length: spec.maxItems + 1 }, (_, i) => (spec.items?.enum ?? ['a', 'b'])[i % (spec.items?.enum ?? ['a', 'b']).length]);
    case 'uniqueItems': { const v = spec.items?.enum?.[0] ?? 'dup'; return [v, v]; }
    default: throw new Error(`violate(): no strategy for keyword \`${keyword}\``);
  }
}

/** The ajv keyword each mutation kind must actually provoke — a mutation that fires
 *  something else proves nothing about the rule it is named for. `items` is the one
 *  rename: ajv reports the ITEM subschema's own keyword, at `/<prop>/0`. */
const EXPECTED_AJV_KEYWORD = {
  type: 'type', enum: 'enum', const: 'const', pattern: 'pattern',
  minimum: 'minimum', maximum: 'maximum', minLength: 'minLength', maxLength: 'maxLength',
  minItems: 'minItems', maxItems: 'maxItems', uniqueItems: 'uniqueItems',
  required: 'required', additionalProperties: 'additionalProperties',
  // The one rename: for `items` ajv reports the ITEM subschema's own keyword, at
  // `/<prop>/0`. The mutation still proves what it is named for.
  items: 'enum',
};

/** Set `path` (an array of keys) to `value`, creating intermediate objects. */
function setAt(obj, path, value) {
  let cur = obj;
  for (const k of path.slice(0, -1)) { if (typeof cur[k] !== 'object' || cur[k] === null) cur[k] = {}; cur = cur[k]; }
  cur[path.at(-1)] = value;
}
function deleteAt(obj, path) {
  let cur = obj;
  for (const k of path.slice(0, -1)) { if (typeof cur[k] !== 'object' || cur[k] === null) return; cur = cur[k]; }
  delete cur[path.at(-1)];
}

function mutationsFor(seedName, seed) {
  const out = [];
  const add = (id, kind, covers, why, mutate) => {
    const manifest = JSON.parse(JSON.stringify(seed));
    mutate(manifest);
    out.push({ id: `${seedName}/${id}`, kind, covers, why, seed: seedName, manifest });
  };

  /**
   * Required, at a given object pointer. The base set and each conditional arm are
   * emitted SEPARATELY rather than merged, because they are different assertions at
   * different pointers and the census now checks coverage pointer by pointer — a
   * merged set would let one arm's rule stand in for the other's.
   */
  const requiredAt = (node, path, pointer) => {
    const emit = (names, covers) => {
      for (const r of [...new Set(names)].sort()) {
        if (seedValueAt(path.concat(r)) === undefined) continue; // deleting an absent field mutates nothing
        add(`required:${[...path, r].join('.')}`, 'required', covers, `deletes required \`${r}\``, (m) => deleteAt(m, [...path, r]));
      }
    };
    emit(node.required ?? [], `required@${pointer || '/'}`);
    for (const [i, rule] of (node.allOf ?? []).entries()) {
      for (const arm of ['then', 'else']) emit(rule[arm]?.required ?? [], `required@${pointer}/allOf/${i}/${arm}`);
    }
  };
  const seedValueAt = (path) => path.reduce((cur, k) => (cur && typeof cur === 'object' ? cur[k] : undefined), seed);

  /** Walk one object node: its assertions, its properties, and its conditional arms. */
  const walk = (node, path, pointer) => {
    requiredAt(node, path, pointer);
    // The node's OWN `type` — at the root this is "a manifest must be an object",
    // which the first cut reported as covered (a namesake on some property satisfied
    // the name-level guard) while never once feeding a non-object.
    if (node.type && path.length === 0) {
      out.push({
        id: `${seedName}/type:<root>`, kind: 'type', covers: `type@${pointer || '/'}`,
        why: 'the manifest root is not an object', seed: seedName, manifest: 'a manifest that is a string',
      });
    }

    for (const [key, spec] of Object.entries(node.properties ?? {}).sort(([a], [b]) => a.localeCompare(b))) {
      const at = [...path, key];
      const label = at.join('.');
      const propPtr = `${pointer}/properties/${key}`;
      for (const kw of Object.keys(spec)) {
        if (STRUCTURAL.has(kw) || !SUPPORTED.has(kw)) continue;
        if (kw === 'additionalProperties') continue; // handled at the object level below
        if (kw === 'uniqueItems' && spec.uniqueItems !== true) continue;
        add(`${kw}:${label}`, kw, `${kw}@${propPtr}`, `\`${label}\` violating ${kw}`, (m) => setAt(m, at, violate(spec, kw)));
      }
      // `items` carries its own subschema; a value outside the item enum is the mutation.
      if (spec.items?.enum) {
        add(`items:${label}`, 'items', `enum@${propPtr}/items`, `\`${label}\` holding a value outside its item enum`, (m) => setAt(m, at, ['__illegal__']));
      }
      // NESTED objects — the `adapt.capacity` defect family, invisible to the first cut.
      if (spec.type === 'object' && spec.properties) walk(spec, at, propPtr);
      if (spec.type === 'object' && spec.additionalProperties === false) {
        add(`additionalProperties:${label}`, 'additionalProperties', `additionalProperties@${propPtr}`, `an undeclared field inside \`${label}\``, (m) => setAt(m, [...at, 'slicng'], 'the one-letter typo, one level down'));
      }
    }

    // The CONDITIONAL arms. The generator reads `required` out of them above; a
    // `properties` block there constrains only the manifests on that arm, which is
    // exactly why there are two seeds.
    for (const [i, rule] of (node.allOf ?? []).entries()) {
      for (const arm of ['then', 'else']) {
        const armNode = rule[arm];
        if (!armNode?.properties) continue;
        for (const [key, spec] of Object.entries(armNode.properties).sort(([a], [b]) => a.localeCompare(b))) {
          const at = [...path, key];
          for (const kw of Object.keys(spec)) {
            if (STRUCTURAL.has(kw) || !SUPPORTED.has(kw) || kw === 'additionalProperties') continue;
            add(`${arm}.${kw}:${at.join('.')}`, kw, `${kw}@${pointer}/allOf/${i}/${arm}/properties/${key}`, `\`${at.join('.')}\` violating the ${arm}-arm ${kw}`, (m) => setAt(m, at, violate(spec, kw)));
          }
        }
      }
    }
  };

  walk(schema, [], '');

  // `additionalProperties: false` at the ROOT — the one keyword belonging to no property.
  if (schema.additionalProperties === false) {
    add('additionalProperties', 'additionalProperties', 'additionalProperties@/', 'an undeclared top-level field', (m) => { m.slicng = 'the one-letter typo, in theme clothing'; });
    // A PROTOTYPE-NAMED key is the same defect wearing a name `props[k]` resolves
    // truthily against `Object.prototype`, so the walker's `if (!spec)` never fires
    // and its `additionalProperties` branch is skipped entirely. ajv emits a
    // `hasOwnProperty` guard. This is a real divergence class the first corpus could
    // not express, and it is why the margin below is four cases rather than two.
    add('additionalProperties:prototype', 'additionalProperties', 'additionalProperties@/', 'an undeclared field named after an Object.prototype member', (m) => { m.constructor = 'not a constructor'; });
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
  return [...mutationsFor('indaco', base), ...mutationsFor('a11y-achromatopsia', derived)];
}

/**
 * LEGAL VARIANTS — the direction nothing checked.
 *
 * Every probe above is a defect, so the corpus can only ever observe "ajv passed
 * what the walker caught". The case that makes `superset` FALSE is the mirror:
 * the walker rejecting something ajv accepts. That is not hypothetical — the
 * transcribed `typeOk` knows `string | integer | array | null | object` and
 * silently returns false for `number` and `boolean`, so the day the schema grows
 * one boolean flag the walker rejects every legal value of it while the corpus
 * reports "zero regressions".
 *
 * The variants are drawn from the REAL tree rather than invented: each takes a
 * seed and sets one declared property to a value that some shipped theme carries,
 * which is legal by construction because the tree is clean.
 */
function legalVariants() {
  const manifests = realManifests();
  const seeds = manifests.filter(([n]) => n === 'indaco' || n === 'a11y-achromatopsia');
  const seen = new Map();
  for (const [, m] of manifests) {
    for (const [k, v] of Object.entries(m)) {
      if (!schema.properties[k]) continue;
      if (!seen.has(k)) seen.set(k, []);
      const vals = seen.get(k);
      if (!vals.some((x) => JSON.stringify(x) === JSON.stringify(v))) vals.push(v);
    }
  }
  const out = [];
  for (const [seedName, seed] of seeds) {
    for (const [key, values] of [...seen].sort(([a], [b]) => a.localeCompare(b))) {
      for (const v of values) {
        const manifest = JSON.parse(JSON.stringify(seed));
        manifest[key] = v;
        out.push({ id: `${seedName}/${key}=${JSON.stringify(v)}`, property: key, manifest });
      }
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// CLAIM 1 — WALKER EQUIVALENCE
// ─────────────────────────────────────────────────────────────────────────────

test('the census binds: every assertion the schema makes has a mutation, and nothing is silently unsupported', () => {
  const { needed, unsupported } = census();
  // A construct with no mutation strategy must FAIL here rather than be skipped.
  // This is the guard the first cut lacked: it scanned six hardcoded keyword names,
  // so `maxLength` / `minLength` / `maximum` / `maxItems` were invisible to it.
  assert.deepEqual(
    [...unsupported].sort(), [],
    'the schema uses a construct the mutation generator has no strategy for — extend `violate()` and `SUPPORTED`, do not skip it',
  );
  // POINTER-EXACT, not name-level. The first cut compared bare keyword NAMES, so a
  // `pattern` on one property counted as covering a `pattern` on every other — and a
  // root `type` counted as covered while no probe ever fed a non-object.
  const emitted = new Set(mutationCorpus().map((c) => c.covers));
  const missing = [...needed].filter((k) => !emitted.has(k)).sort();
  assert.deepEqual(missing, [], `the corpus emits no mutation for: ${missing.join(', ')}`);
  const stale = [...emitted].filter((k) => !needed.has(k)).sort();
  assert.deepEqual(stale, [], `the corpus emits mutations for assertions the schema no longer makes: ${stale.join(', ')}`);
});

test('the corpus is pinned by COMPOSITION, not just by size', () => {
  const corpus = mutationCorpus();
  const ids = corpus.map((c) => c.id).sort();
  // PINNED as a fingerprint. `length === N` alone holds across any offsetting edit
  // — drop a `pattern`, add a property, and the count is unchanged while what is
  // actually compared has moved. Growing or reshaping the schema fails HERE and
  // forces the table in engineering/decisions/2026-09-01-manifest-schema-gate.md
  // to be updated with it, which is the point.
  assert.equal(corpus.length, CORPUS_SIZE, `mutation corpus size changed (${corpus.length}) — update the decision record with the new number`);
  assert.equal(
    require('node:crypto').createHash('sha256').update(ids.join('\n')).digest('hex').slice(0, 16),
    CORPUS_FINGERPRINT,
    `mutation corpus COMPOSITION changed while its size did not.\nCurrent ids:\n${ids.join('\n')}`,
  );
  assert.ok(corpus.some((c) => c.seed === 'indaco'), 'the `base` arm is unexercised');
  assert.ok(corpus.some((c) => c.seed === 'a11y-achromatopsia'), 'the non-`base` arm is unexercised');
});

test('every mutation is a real defect, and provokes the RULE IT IS NAMED FOR', () => {
  // Two guards, because they fail differently. A generator emitting legal manifests
  // would report a flattering equivalence over cases neither side rejects; a
  // generator emitting manifests that are broken for the WRONG reason would report a
  // real-looking equivalence over cases that say nothing about the named rule.
  const validate = makeAjv().compile(schema);
  const notADefect = mutationCorpus().filter((c) => validate(c.manifest)).map((c) => c.id);
  assert.deepEqual(notADefect, [], `these "mutations" are legal manifests, so they prove nothing: ${notADefect.join(', ')}`);

  const misfired = [];
  for (const c of mutationCorpus()) {
    validate(c.manifest);
    const fired = new Set((validate.errors ?? []).map((e) => e.keyword));
    const expected = EXPECTED_AJV_KEYWORD[c.kind];
    assert.ok(expected, `no EXPECTED_AJV_KEYWORD entry for mutation kind \`${c.kind}\``);
    if (!fired.has(expected)) misfired.push(`${c.id}: expected \`${expected}\`, ajv fired [${[...fired].join(', ')}]`);
  }
  assert.deepEqual(misfired, [], `mutations that break something other than the rule they are named for:\n${misfired.join('\n')}`);
});

test('EQUIVALENCE: ajv rejects every mutation the retired walker rejected (zero regressions)', () => {
  const validate = makeAjv().compile(schema);
  const regressions = mutationCorpus()
    .filter((c) => walkerRejects(c.manifest) && validate(c.manifest))
    .map((c) => `${c.id} — ${c.why}`);
  assert.deepEqual(regressions, [], `ajv passed what the retired walker caught:\n${regressions.join('\n')}`);
});

test('SUPERSET: the margin is exactly these cases, and they are the ones the swap bought', () => {
  // "Strict superset" is two claims, and the second is the reason the swap was
  // worth making. Pinned by COMPOSITION rather than by `length > 0`: the old
  // `margin.length > 0` could not fail independently of the assertion after it, so
  // it asserted nothing. What is worth knowing is when the margin CHANGES.
  const validate = makeAjv().compile(schema);
  const margin = mutationCorpus().filter((c) => !walkerRejects(c.manifest) && !validate(c.manifest)).map((c) => c.id).sort();
  assert.deepEqual(margin, [
    'a11y-achromatopsia/additionalProperties:prototype',
    'a11y-achromatopsia/type:$schema',
    'indaco/additionalProperties:prototype',
    'indaco/type:$schema',
  ], 'the ajv-only margin moved');
  // The two classes, named — because the decision record got the attribution wrong
  // and credited this margin to the gate's `$schema`-LINK arm (arm 3 of
  // `checkFamily`), which this file never calls. What the walker actually misses is
  // (a) that `$schema` must be a STRING, since it `continue`s past the key
  // entirely, and (b) any undeclared key whose name is an `Object.prototype` member.
  assert.ok(margin.some((id) => id.includes('type:$schema')), 'the walker\'s skipped `$schema` should be in the margin');
  assert.ok(margin.some((id) => id.includes('prototype')), 'the prototype-named key class should be in the margin');
});

test('SUPERSET, the other direction: the walker rejects nothing ajv accepts', () => {
  // Without this, `superset` is unfalsifiable — every other probe is a defect, so
  // the walker being STRICTER than the schema (rejecting legal manifests) could
  // never be observed. `typeOk`'s missing `number`/`boolean` arms are exactly that
  // failure waiting on a one-line schema change.
  const validate = makeAjv().compile(schema);
  const overzealous = legalVariants()
    .filter((c) => validate(c.manifest) && walkerRejects(c.manifest))
    .map((c) => c.id);
  assert.deepEqual(overzealous, [], `the retired walker rejects manifests ajv accepts, so it is not a subset:\n${overzealous.join('\n')}`);
  assert.ok(legalVariants().length >= 33, `expected a real set of legal variants, got ${legalVariants().length}`);
  // REFUSE rather than skip — the same posture as the census. The variants are drawn
  // from the shipped tree, so a property NO theme carries yet gets no legal probe at
  // all, and this arm goes quietly green on exactly the case it exists for: a newly
  // declared field whose legal values the walker cannot type-check. Measured: with a
  // `boolean` field that a theme carries, this arm fires; with the same field unused,
  // the whole file passed. Naming the gap here is what closes it.
  const exercised = new Set(legalVariants().map((c) => c.property));
  const unexercised = Object.keys(schema.properties).filter((k) => !exercised.has(k)).sort();
  assert.deepEqual(
    unexercised, [],
    `no shipped theme carries ${unexercised.join(', ')}, so no LEGAL value of it is ever compared. ` +
      'Give a theme the field, or this direction of the superset claim does not cover it.',
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
const DRAFT_OPTS = { allErrors: true, strict: true, strictRequired: false };

/** ajv compiles a schema to JavaScript; normalize its gensym numbering so two
 *  compilations are comparable, and drop the 2020-12 `evaluated` preamble, which is
 *  dead code unless the schema uses `unevaluatedProperties`/`unevaluatedItems`. */
function validatorBody(fn) {
  const src = fn.toString();
  return src
    .slice(src.indexOf('let vErrors'))
    .replace(/\b(validate|err|_errs|valid|_valid|data|missing|pattern|func|schema|len|ifClause|outer|evaluated)\d+\b/g, '$1#')
    .replace(/const evaluated# = validate#\.evaluated;if\(evaluated#\.dynamicProps\)\{evaluated#\.props = undefined;\}if\(evaluated#\.dynamicItems\)\{evaluated#\.items = undefined;\}/, '');
}

test('DRAFT: the two dialects compile this schema to the SAME CODE — which is the whole claim', () => {
  // This replaces a comparison that could not fail. The first cut ran 33 manifests
  // plus 51 mutations through both validators and reported "zero disagreements" —
  // but the two compile to byte-identical JavaScript here, so that was one trivially
  // true fact repeated 84 times, not a sample of 84. Asserting the identity directly
  // is strictly stronger: it holds for EVERY possible input, not just the 84 tried.
  const body2020 = validatorBody(makeAjv().compile(schema));
  const body07 = validatorBody(new AjvDraft07(DRAFT_OPTS).compile(asDraft07()));
  assert.equal(body07, body2020, 'the draft bump changed the compiled validator, so it may have changed meaning');
  assert.ok(body2020.length > 1000, `expected a substantial validator body, got ${body2020.length} chars`);
});

test('DRAFT: the comparison rig can actually detect a divergence (negative control)', () => {
  // Guard the guard. "The two agree" is worthless from a rig that cannot disagree,
  // and the arm above would pass just as happily if both sides were the same object.
  // A tuple-form `items` is the classic draft-07 → 2020-12 break: draft-07 reads it
  // as a positional tuple, 2020-12 reads `items` as a single subschema and wants
  // `prefixItems`. Under `strict` ajv REFUSES it on both sides — which is itself the
  // detection, and is why the migration cannot silently change meaning here.
  const tuple = { type: 'object', properties: { pair: { type: 'array', items: [{ type: 'string' }, { type: 'integer' }] } } };
  assert.throws(() => makeAjv().compile({ ...tuple, $schema: 'https://json-schema.org/draft/2020-12/schema' }), 'the 2020-12 side should refuse a tuple `items`');
  assert.throws(() => new AjvDraft07(DRAFT_OPTS).compile({ ...tuple, $schema: 'http://json-schema.org/draft-07/schema#' }), 'the draft-07 side should refuse a tuple `items` under strict');

  // And a 2020-only keyword is refused by the draft-07 class, so a schema that grew
  // one could never pass this file quietly.
  const only2020 = { type: 'object', dependentRequired: { a: ['b'] } };
  assert.doesNotThrow(() => makeAjv().compile({ ...only2020, $schema: 'https://json-schema.org/draft/2020-12/schema' }));
  assert.throws(() => new AjvDraft07(DRAFT_OPTS).compile({ ...only2020, $schema: 'http://json-schema.org/draft-07/schema#' }), 'draft-07 should refuse `dependentRequired`');
});

test('the two ajv classes really are different dialects (neither can stand in for the other)', () => {
  // The dialect is the CLASS, not the `$schema` string. Each refuses the other's
  // meta-schema, so a mis-wired comparison throws rather than passing — the failure
  // mode this file most needs to not have.
  assert.throws(() => new AjvDraft07(DRAFT_OPTS).compile(schema), /draft\/2020-12/);
  assert.throws(() => makeAjv().compile(asDraft07()), /draft-07/);
});

test('the theme schema really did move to 2020-12 (the migration this claim is about)', () => {
  assert.equal(schema.$schema, 'https://json-schema.org/draft/2020-12/schema');
  assert.doesNotThrow(() => new AjvDraft07(DRAFT_OPTS).compile(asDraft07()));
});
