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
