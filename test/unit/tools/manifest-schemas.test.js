/**
 * Unit: tools/manifest-schemas.js — the one JSON-Schema gate over every
 * hand-authored manifest family.
 *
 * WHAT THESE TESTS ARE FOR. The gate replaced three hand-written checkers of
 * three different strengths, and the weakest of them passed everything for
 * months. So a test that only asserts "the tree is clean" would reproduce the
 * original defect exactly: a checker that never bites looks identical to a tree
 * with nothing wrong. Every arm below therefore plants a specific, real defect
 * and demands the gate catch THAT one, plus a control proving the untouched
 * tree stays silent.
 *
 * The headline case is `slicing` → `slicng`: a one-letter typo in an OPTIONAL
 * block that silently deletes the `standard` frame's whole responsive behavior.
 * Before this gate it returned zero errors from every checker in the repo.
 */

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const components = require('../../../lib/components/index.js');
const forms = require('../../../lib/forms/index.js');
const ownership = require('../../../tools/check-ownership.js');

const {
  FAMILIES,
  checkManifestSchemas,
  checkFamily,
  family,
  listAllManifests,
  listFamilyManifests,
} = require('../../../tools/manifest-schemas.js');

const ROOT = path.resolve(__dirname, '../../..');

/** A temp directory holding one flat manifest, for the per-family bite tests. */
function fixture(name, manifest) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-manifest-'));
  fs.writeFileSync(path.join(dir, name), JSON.stringify(manifest, null, 2));
  return dir;
}

function biteWith(famName, file, manifest) {
  const dir = fixture(file, manifest);
  try {
    const errors = [];
    checkFamily(errors, family(famName), { dir });
    return errors;
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const read = (rel) => JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));

// ── The tree as it stands ────────────────────────────────────────────────────

test('every manifest in the tree passes its family schema', () => {
  const errors = [];
  checkManifestSchemas(errors);
  assert.deepEqual(errors, [], `expected a clean tree, got:\n${errors.join('\n')}`);
});

test('the registry claims every hand-authored manifest in the tree', () => {
  const claimed = new Set(FAMILIES.flatMap((f) => listFamilyManifests(f)));
  const orphans = listAllManifests().filter((f) => !claimed.has(f));
  assert.deepEqual(orphans, [], 'a manifest no family claims is a manifest nothing checks');
});

test('each family actually governs files (a schema for nothing is dead)', () => {
  for (const fam of FAMILIES) {
    assert.ok(listFamilyManifests(fam).length > 0, `${fam.family} (${fam.schema}) governs zero manifests`);
  }
});

test('cells are .cell.json, not .manifest.json — a manifest-only glob misses all of them', () => {
  // Pinned because it is the trap this registry was written around: the first
  // survey of the repo used a `*.manifest.json` glob and reported the cell
  // schema as an orphan describing zero files. It describes ten.
  const cells = listFamilyManifests(family('form cell'));
  assert.equal(family('form cell').ext, '.cell.json');
  assert.ok(cells.length >= 10, `expected the cell family to be non-trivial, got ${cells.length}`);
  assert.ok(cells.every((f) => f.endsWith('.cell.json')));
});

test('all five schemas declare the same JSON Schema draft', () => {
  // theme.schema.json sat on draft-07 while the other four were on 2020-12, so
  // a single validator could not compile the set without special-casing one.
  const drafts = new Set(FAMILIES.map((f) => read(f.schema).$schema));
  assert.equal(drafts.size, 1, `expected one draft across the schemas, got ${[...drafts].join(', ')}`);
  assert.equal([...drafts][0], 'https://json-schema.org/draft/2020-12/schema');
});

// ── The gate BITES ───────────────────────────────────────────────────────────

test('BITES: the frame `slicing` -> `slicng` typo that every previous checker passed', () => {
  const frame = read('lib/forms/frame/standard/standard.manifest.json');
  assert.ok(frame.slicing, 'fixture assumes the standard frame declares slicing');
  frame.slicng = frame.slicing;
  delete frame.slicing;
  const errors = biteWith('form frame', 'probe.manifest.json', frame);
  assert.ok(
    errors.some((e) => /unknown field `slicng`/.test(e)),
    `expected the typo to be caught, got ${JSON.stringify(errors)}`,
  );
});

test('BITES: a NESTED undeclared field, which the flat component validator cannot see', () => {
  // The real find: three shipped manifests carried prose two levels down, in
  // `adapt.capacity`, where `validate()` in lib/components/index.js never looks.
  const kpi = read('lib/components/evidence/kpi/kpi.manifest.json');
  kpi.adapt.capacity.wide.nonsense = 1;
  const errors = biteWith('component', 'probe.manifest.json', kpi);
  assert.ok(
    errors.some((e) => /unknown field `adapt\.capacity\.wide\.nonsense`/.test(e)),
    `expected the nested field to be named in full, got ${JSON.stringify(errors)}`,
  );
});

test('BITES: a missing required field, a bad enum, and an unknown key', () => {
  const cell = read('lib/forms/cell/overlay/overlay.cell.json');

  const noRegion = { ...cell };
  delete noRegion.region;
  assert.ok(
    biteWith('form cell', 'probe.cell.json', noRegion).some((e) => /missing required field `region`/.test(e)),
  );

  assert.ok(
    biteWith('form cell', 'probe.cell.json', { ...cell, region: 'nowhere' }).some((e) =>
      /has `region: "nowhere"`, which is not one of/.test(e),
    ),
  );

  assert.ok(
    biteWith('form cell', 'probe.cell.json', { ...cell, bogus: 1 }).some((e) => /unknown field `bogus`/.test(e)),
  );
});

test('BITES: a wrong TYPE names the offending value, not just the rule', () => {
  // ajv's own wording ("must be string") omits what was actually there, so a
  // reader has to open the file to learn what went wrong. The house wording quotes it.
  const cell = read('lib/forms/cell/overlay/overlay.cell.json');
  const errors = biteWith('form cell', 'probe.cell.json', { ...cell, z: 'three' });
  assert.ok(
    errors.some((e) => /has `z: "three"` but the schema says/.test(e)),
    `expected the value quoted back, got ${JSON.stringify(errors)}`,
  );
});

test('BITES: a typo\'d KEYWORD inside a schema file — the same disease one level up', () => {
  // A schema that silently checks nothing is exactly what this gate exists to
  // abolish, so a misspelled keyword must fail the build rather than pass.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-schema-'));
  try {
    const broken = read('lib/forms/schema/tile.schema.json');
    broken.properties.id.patttern = '^x$';
    const rel = 'tile.schema.json';
    fs.writeFileSync(path.join(dir, rel), JSON.stringify(broken));
    const errors = [];
    checkFamily(errors, { ...family('form tile'), schema: rel }, { root: dir, dir });
    assert.ok(
      errors.some((e) => /unknown keyword: "patttern"/.test(e)),
      `expected the schema itself to be rejected, got ${JSON.stringify(errors)}`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('BITES: an unregistered manifest family, and a `$schema` pointing at the wrong one', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-root-'));
  try {
    // A minimal but REAL root: the small families copied whole, components stubbed
    // with one genuine manifest so every family is non-empty.
    for (const d of ['themes', 'lib/forms']) fs.cpSync(path.join(ROOT, d), path.join(tmp, d), { recursive: true });
    fs.mkdirSync(path.join(tmp, 'lib/components/anchor/title'), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, 'lib/components/manifest.schema.json'),
      path.join(tmp, 'lib/components/manifest.schema.json'),
    );
    fs.copyFileSync(
      path.join(ROOT, 'lib/components/anchor/title/title.manifest.json'),
      path.join(tmp, 'lib/components/anchor/title/title.manifest.json'),
    );

    const clean = [];
    checkManifestSchemas(clean, tmp);
    assert.deepEqual(clean, [], `the stub root must start clean, got:\n${clean.join('\n')}`);

    // Arm 1 — a manifest no family covers.
    fs.mkdirSync(path.join(tmp, 'lib/newthing'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib/newthing/x.manifest.json'), '{}');
    const orphan = [];
    checkManifestSchemas(orphan, tmp);
    assert.ok(
      orphan.some((e) => /lib\/newthing\/x\.manifest\.json is a manifest no schema family covers/.test(e)),
      `expected the unregistered manifest to be caught, got ${JSON.stringify(orphan)}`,
    );
    fs.rmSync(path.join(tmp, 'lib/newthing'), { recursive: true, force: true });

    // Arm 3 — a `$schema` link that resolves to another family's contract.
    const tilePath = path.join(tmp, 'lib/forms/tile/annotation/annotation.manifest.json');
    const tile = JSON.parse(fs.readFileSync(tilePath, 'utf8'));
    tile.$schema = '../../schema/frame.schema.json';
    fs.writeFileSync(tilePath, JSON.stringify(tile, null, 2));
    const mislinked = [];
    checkManifestSchemas(mislinked, tmp);
    assert.ok(
      mislinked.some((e) => /governed by lib\/forms\/schema\/tile\.schema\.json/.test(e)),
      `expected the wrong \`$schema\` link to be caught, got ${JSON.stringify(mislinked)}`,
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── The two fields the gate found on its first run ───────────────────────────

test('the prose fields the gate found are DECLARED, not silently tolerated', () => {
  const schema = read('lib/components/manifest.schema.json');
  const cap = schema.properties.adapt.properties.capacity;
  const perFamily = cap.patternProperties['^(wide|square|tall|strip)$'];

  // `axisRetired` is a tombstone whose ABSENCE of `axis` is the behavior:
  // splitFactsFor() reads `adapt.capacity.axis` as a split opt-in, so restoring
  // the key re-enrolls a component its own design resolution excluded.
  assert.ok(cap.properties.axisRetired, 'adapt.capacity.axisRetired must be declared');
  assert.match(cap.properties.axisRetired.description, /tombstone/i);

  // `note` is the per-family counterpart of the long-declared flat capacity.note.
  assert.ok(perFamily.properties.note, 'adapt.capacity.<family>.note must be declared');
  assert.ok(schema.properties.capacity.properties.note, 'the flat capacity.note it mirrors must still exist');

  // Both blocks stay closed — declaring these two must not have opened the door.
  assert.equal(cap.additionalProperties, false);
  assert.equal(perFamily.additionalProperties, false);
});

test('the components that carry those fields still validate', () => {
  for (const rel of [
    'lib/components/comparison/matrix-2x2/matrix-2x2.manifest.json',
    'lib/components/comparison/split-compare/split-compare.manifest.json',
    'lib/components/evidence/kpi/kpi.manifest.json',
  ]) {
    const errors = biteWith('component', 'probe.manifest.json', read(rel));
    assert.deepEqual(errors, [], `${rel} must pass: ${errors.join('; ')}`);
  }
});

// ── The registry vs. the runtime loaders ─────────────────────────────────────

/**
 * THE ONLY ARM THAT CAN REPORT WHAT THE REGISTRY IS MISSING.
 *
 * `FAMILIES` is a hand-maintained list with directory-shape assumptions baked in,
 * and this PR's whole premise is that a hand-maintained list cannot report its own
 * gaps. The coverage arm catches a manifest nobody claims, but only for filenames
 * it thinks to look for — so the registry could still drift from what the engine
 * ACTUALLY loads and every arm would stay green.
 *
 * The loaders are the independent producer. `loadAll`, `loadCatalog` and
 * `listThemeManifests` decide what really exists at runtime; if the gate's list and
 * theirs disagree, one of them is wrong and a human should look. This is what
 * caught nothing today and will catch the sixth family.
 */
test('the registry claims exactly what the component loader loads', () => {
  const loaded = new Set(components.loadAll().map((m) => m.name));
  const claimed = new Set(
    listFamilyManifests(family('component')).map((f) => path.basename(path.dirname(f))),
  );
  assert.deepEqual(
    [...loaded].filter((n) => !claimed.has(n)),
    [],
    'loadAll() loads a component the schema gate never checks',
  );
  assert.deepEqual(
    [...claimed].filter((n) => !loaded.has(n)),
    [],
    'the gate checks a component the engine never loads',
  );
});

test('the registry claims exactly what the forms loader loads', () => {
  const cat = forms.loadCatalog();
  for (const [famName, rows] of [
    ['form frame', cat.frames],
    ['form cell', cat.cells],
    ['form tile', cat.tiles],
  ]) {
    const loaded = new Set(rows.map((r) => r.id));
    const claimed = new Set(
      listFamilyManifests(family(famName)).map((f) => path.basename(path.dirname(f))),
    );
    assert.deepEqual([...loaded].filter((n) => !claimed.has(n)), [], `${famName}: loaded but unchecked`);
    assert.deepEqual([...claimed].filter((n) => !loaded.has(n)), [], `${famName}: checked but never loaded`);
  }
});

test('the registry claims exactly the theme manifests the theme gates enumerate', () => {
  const loaded = new Set([...ownership.listThemeManifests().keys()]);
  const claimed = new Set(
    listFamilyManifests(family('theme')).map((f) => path.basename(f).replace(/\.manifest\.json$/, '')),
  );
  assert.deepEqual([...loaded].filter((n) => !claimed.has(n)), [], 'enumerated but unchecked');
  assert.deepEqual([...claimed].filter((n) => !loaded.has(n)), [], 'checked but not a known theme');
});

// ── Regressions found by the adversarial trio ────────────────────────────────

test('BITES: a typo inside a SLOT — 61 manifests set slots.*.required', () => {
  // `build-component-docs.js:264` reads `slot.required` to write the "required"
  // column of every Agent contract. `slots.additionalProperties` had no
  // `additionalProperties: false`, so `required` -> `requird` silently flipped that
  // column to "no" — the slicng failure mode, in the family the gate covers most.
  const kpi = read('lib/components/evidence/kpi/kpi.manifest.json');
  kpi.slots.title.requird = kpi.slots.title.required;
  delete kpi.slots.title.required;
  const errors = biteWith('component', 'probe.manifest.json', kpi);
  assert.ok(
    errors.some((e) => /unknown field `slots\.title\.requird`/.test(e)),
    `expected the slot typo to be caught, got ${JSON.stringify(errors)}`,
  );
});

test('the slots subschema is closed, and all 180 slots use only its three keys', () => {
  const slot = read('lib/components/manifest.schema.json').properties.slots.additionalProperties;
  assert.equal(slot.additionalProperties, false, 'slots.<name> must reject undeclared keys');
  const used = new Set();
  for (const f of listFamilyManifests(family('component'))) {
    for (const s of Object.values(read(f).slots ?? {})) for (const k of Object.keys(s)) used.add(k);
  }
  assert.deepEqual([...used].sort(), ['description', 'required', 'selector']);
});

test('the sweep skips dot-directories and parked `_` directories', () => {
  // A `.claude/worktrees/` checkout (reserved in .gitignore) made ONE `git worktree
  // add` fail build:check with a bogus error per manifest in it. A parked `_draft/`
  // is skipped by both runtime loaders, so the gate must skip it too.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-skip-'));
  try {
    for (const rel of ['.claude/worktrees/feat/themes', '.scratch-exp', 'lib/forms/frame/_draft']) {
      fs.mkdirSync(path.join(tmp, rel), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel, 'x.manifest.json'), '{"totally":"unchecked"}');
    }
    assert.deepEqual(listAllManifests(tmp), [], 'the sweep must not walk dot- or `_`-directories');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the swept filename set is DERIVED from the registry, not hardcoded', () => {
  // Hardcoding `.manifest.json` / `.cell.json` made a sixth family with a new
  // suffix invisible to the very sweep that exists to catch a sixth family.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-ext-'));
  try {
    fs.mkdirSync(path.join(tmp, 'x'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'x/a.lens.json'), '{}');
    fs.writeFileSync(path.join(tmp, 'x/b.manifest.json'), '{}');
    const fake = [...FAMILIES, { family: 'lens', schema: 'x', dir: 'x', ext: '.lens.json' }];
    assert.ok(listAllManifests(tmp, fake).includes('x/a.lens.json'), 'a registered suffix must be swept');
    assert.ok(!listAllManifests(tmp, [FAMILIES[0]]).includes('x/a.lens.json'), 'an unregistered one must not');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('BITES: a `$schema` that is absolute, or missing entirely', () => {
  // `http://json-schema.org/draft-07/schema#` is the likeliest wrong paste — it is
  // what themes/theme.schema.json itself carried until this change — and an editor
  // following it gets the META-schema, not the theme contract.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-ref-'));
  try {
    fs.cpSync(path.join(ROOT, 'themes'), path.join(tmp, 'themes'), { recursive: true });
    for (const [label, mutate, pattern] of [
      ['absolute', (j) => { j.$schema = 'http://json-schema.org/draft-07/schema#'; }, /an absolute URL/],
      ['missing', (j) => { delete j.$schema; }, /declares no `\$schema`/],
    ]) {
      const p = path.join(tmp, 'themes/indaco.manifest.json');
      const j = JSON.parse(fs.readFileSync(p, 'utf8'));
      mutate(j);
      fs.writeFileSync(p, JSON.stringify(j, null, 2));
      const errors = [];
      checkFamily(errors, family('theme'), { root: tmp });
      assert.ok(errors.some((e) => pattern.test(e)), `${label}: got ${JSON.stringify(errors)}`);
      fs.copyFileSync(path.join(ROOT, 'themes/indaco.manifest.json'), p);
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('one typo in a schema reports ONE cause, not one error per shipped manifest', () => {
  // Returning [] on compile failure dropped all 61 component manifests out of
  // `claimed`, so the coverage arm then told a reviewer to DELETE each of them.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-compile-'));
  try {
    fs.cpSync(path.join(ROOT, 'lib/components'), path.join(tmp, 'lib/components'), { recursive: true });
    const sp = path.join(tmp, 'lib/components/manifest.schema.json');
    const schema = JSON.parse(fs.readFileSync(sp, 'utf8'));
    schema.properties.name.patttern = '^x$';
    fs.writeFileSync(sp, JSON.stringify(schema, null, 2));
    const errors = [];
    checkManifestSchemas(errors, tmp);
    // Only lib/components is copied here, so the other four families correctly
    // report "governs zero files"; scope the assertion to the component family.
    const componentErrors = errors.filter((e) => /lib\/components/.test(e));
    assert.equal(
      componentErrors.length,
      1,
      `expected one cause, got ${componentErrors.length}:\n${componentErrors.join('\n')}`,
    );
    assert.match(componentErrors[0], /unknown keyword: "patttern"/);
    assert.deepEqual(errors.filter((e) => /delete the file/.test(e)), [], 'must not tell anyone to delete a shipped manifest');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a failing `if`/`then` arm reports the missing field ONCE', () => {
  // ajv reports the conditional alongside the real failure; the hand-written walker
  // this replaced emitted one line, and talking more while saying the same thing is
  // a regression.
  const noTier = read('themes/indaco.manifest.json');
  delete noTier.tier;
  const errors = biteWith('theme', 'probe.manifest.json', noTier);
  assert.equal(errors.length, 1, `expected one line, got ${JSON.stringify(errors)}`);
  assert.match(errors[0], /missing required field `tier`/);
});

test('a root-level type error names the root instead of an empty field', () => {
  assert.ok(
    biteWith('form cell', 'probe.cell.json', [1, 2]).some((e) => /the manifest root/.test(e)),
    'a top-level array must not render as ``: [1,2]``',
  );
});

// ── The skip rules must AGREE WITH THE LOADERS, not invent policy ────────────

/**
 * These four pin the corrections an independent checker found in the first cut
 * of the skip logic. Each one was a real divergence from what the engine loads,
 * and three of them were introduced by the fix for the previous finding — which
 * is why they are pinned rather than trusted.
 */
test('the sweep skips node_modules and dist at ANY depth, not just the root', () => {
  // `docs/` is its own npm package, so `docs/node_modules` exists (743 packages,
  // 4193 directories). Root-anchoring the skip walked all of it — 9x on the sweep,
  // and one dependency shipping a bare `manifest.json` fixture would have failed
  // build:check for everyone with "delete the file" pointing inside node_modules.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-nested-'));
  try {
    for (const rel of ['docs/node_modules/pkg/fixtures', 'docs/dist/assets', 'lib/x/coverage']) {
      fs.mkdirSync(path.join(tmp, rel), { recursive: true });
      fs.writeFileSync(path.join(tmp, rel, 'manifest.json'), '{}');
      fs.writeFileSync(path.join(tmp, rel, 'a.manifest.json'), '{}');
    }
    assert.deepEqual(listAllManifests(tmp), [], 'a nested third-party or generated tree must not be swept');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a nested dot-directory is NOT skipped — loadAll does not skip one either', () => {
  // The dot-skip exists for `.claude/worktrees/` at the repo root. Applying it at
  // every depth traded that false positive for a FALSE NEGATIVE: `loadAll` skips
  // only `_` bucket children, so `anchor/.hidden/.hidden.manifest.json` would load
  // into the shipped catalog with both arms blind to it.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-dot-'));
  try {
    fs.mkdirSync(path.join(tmp, '.claude/worktrees/feat'), { recursive: true });
    fs.writeFileSync(path.join(tmp, '.claude/worktrees/feat/a.manifest.json'), '{}');
    fs.mkdirSync(path.join(tmp, 'lib/components/anchor/.hidden'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib/components/anchor/.hidden/.hidden.manifest.json'), '{}');

    const swept = listAllManifests(tmp);
    assert.ok(!swept.some((f) => f.startsWith('.claude/')), 'a root dot-directory must be skipped');
    assert.ok(
      swept.includes('lib/components/anchor/.hidden/.hidden.manifest.json'),
      'a NESTED dot-directory must still be swept — the engine loads it',
    );
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('the flat (theme) family applies no `_` filter, because listThemeManifests does not', () => {
  // `listThemeManifests` filters on the extension alone. Excluding `_`-prefixed
  // FILES in the lister while the sweep still saw them manufactured a guaranteed
  // "no schema family covers" error for a theme every other theme gate reads.
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-flat-'));
  try {
    fs.cpSync(path.join(ROOT, 'themes'), path.join(tmp, 'themes'), { recursive: true });
    fs.copyFileSync(
      path.join(ROOT, 'themes/indaco.manifest.json'),
      path.join(tmp, 'themes/_parked.manifest.json'),
    );
    const claimed = listFamilyManifests(family('theme'), tmp);
    assert.ok(claimed.includes('themes/_parked.manifest.json'), 'the lister must claim it');
    assert.ok(listAllManifests(tmp).includes('themes/_parked.manifest.json'), 'the sweep must see it');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('a `_`-prefixed DIRECTORY is skipped by lister and sweep alike — both loaders skip it', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-underscore-'));
  try {
    fs.mkdirSync(path.join(tmp, 'lib/forms/frame/_draft'), { recursive: true });
    fs.writeFileSync(path.join(tmp, 'lib/forms/frame/_draft/_draft.manifest.json'), '{}');
    assert.deepEqual(listAllManifests(tmp), []);
    assert.deepEqual(listFamilyManifests(family('form frame'), tmp), []);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

// ── checkAjvBoundary — the gate that had no test ─────────────────────────────

/**
 * A gate nobody can watch fail is the defect this whole PR is about, and this one
 * shipped with zero tests directly beneath a comment in check-ownership.js saying
 * gates are exported "so the suite can drive them against synthetic fixtures".
 */
test('checkAjvBoundary BITES on the ajv family and stays quiet on the real tree', () => {
  const { checkAjvBoundary } = ownership;
  const clean = [];
  checkAjvBoundary(clean);
  assert.deepEqual(clean, [], `the shipped tree must be clean, got:\n${clean.join('\n')}`);

  const probe = path.join(ROOT, 'lib', '__ajv_boundary_probe__.js');
  for (const [spec, shouldBite] of [
    ["require('ajv')", true],
    ["require('ajv/dist/2020')", true],
    // Same devDependency leak wearing a different name — matching only `ajv` let these through.
    ["require('ajv-formats')", true],
    ["require('ajv-keywords')", true],
    ["require('my-ajv-helper')", false],
    ["require('./ajv')", false],
  ]) {
    fs.writeFileSync(probe, `const x = ${spec};\nmodule.exports = x;\n`);
    try {
      const errors = [];
      checkAjvBoundary(errors);
      assert.equal(
        errors.length > 0,
        shouldBite,
        `${spec}: expected ${shouldBite ? 'a finding' : 'silence'}, got ${JSON.stringify(errors)}`,
      );
    } finally {
      fs.rmSync(probe, { force: true });
    }
  }
});

test('checkAjvBoundary reports one file importing ajv two ways ONCE', () => {
  const { checkAjvBoundary } = ownership;
  const probe = path.join(ROOT, 'lib', '__ajv_dedupe_probe__.js');
  fs.writeFileSync(probe, "const a = require('ajv');\nconst b = require('ajv');\nmodule.exports = [a, b];\n");
  try {
    const errors = [];
    checkAjvBoundary(errors);
    assert.equal(errors.length, 1, `expected one line per spec, got ${JSON.stringify(errors)}`);
  } finally {
    fs.rmSync(probe, { force: true });
  }
});

test('the `if` filter can never swallow the LAST error — a failed manifest always reports', () => {
  // The worst outcome this gate has is a manifest that FAILED validation and says
  // nothing, which is indistinguishable from one that passed.
  //
  // This drives the fallback through an INJECTED validator rather than a real
  // schema, on purpose. No natural if-only case exists: five hand-built adversarial
  // schema/data pairs and an 8,456-mutation fuzz all produced a concrete keyword
  // error alongside the `if` one (a `then: false` arm, for instance, also emits
  // `boolean schema is false`). The fallback exists for a case nobody can currently
  // produce — so a test that waits for one would assert nothing, and an earlier cut
  // of this test did exactly that: it passed while the fallback never ran.
  const stubAjv = {
    compile() {
      const fn = () => false;
      fn.errors = [{ keyword: 'if', instancePath: '', schemaPath: '#/if', params: {}, message: 'must match "then" schema' }];
      return fn;
    },
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lattice-iffall-'));
  try {
    fs.writeFileSync(path.join(dir, 'x.schema.json'), JSON.stringify({ type: 'object' }));
    fs.writeFileSync(path.join(dir, 'probe.manifest.json'), JSON.stringify({ kind: 'banned' }));
    const errors = [];
    checkFamily(
      errors,
      { family: 'probe', schema: 'x.schema.json', dir: '.', ext: '.manifest.json' },
      { root: dir, dir, ajv: stubAjv },
    );
    assert.equal(errors.length, 1, `expected exactly the fallback, got ${JSON.stringify(errors)}`);
    assert.match(errors[0], /gate defect/, 'the fallback must say this is a GATE defect, not just a manifest one');
    // The raw text is JSON.stringify'd, so its inner quotes arrive escaped.
    assert.match(errors[0], /must match \\"then\\" schema/, 'it must carry the raw ajv text for diagnosis');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
