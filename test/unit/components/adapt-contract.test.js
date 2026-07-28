const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const { loadAll, manifestBucket } = require('../../../lib/components');
const { checkAdaptDeclarations, checkSolverIntentDeclared } = require('../../../tools/check-ownership');

const ROOT = path.join(__dirname, '..', '..', '..');
const COMPONENTS = path.join(ROOT, 'lib', 'components');
const VALID = new Set(['reflow', 'native', 'single-orientation']);

// Every component declares a valid adapt.mode — the contract is COMPLETE.
// (engineering/decisions/2026-06-20-adaptive-manifest-contract.md)
test('every component declares a valid adapt.mode', () => {
  const manifests = loadAll();
  assert.ok(manifests.length >= 50, 'expected the full component catalog');
  for (const m of manifests) {
    const mode = m.adapt?.mode;
    assert.ok(VALID.has(mode), `${m.name}: adapt.mode is ${JSON.stringify(mode)} (must be one of ${[...VALID].join(', ')})`);
  }
});

// The anti-drift invariant holds across the real tree: any component whose CSS
// carries `@container … aspect-ratio` is declared `reflow`. Re-derived here so a
// future @container rule added without flipping the manifest fails this test too
// (belt-and-braces with the build:check gate).
test('@container aspect-ratio CSS implies adapt.mode reflow', () => {
  const RE = /@container[^{]*aspect-ratio/;
  for (const m of loadAll()) {
    const bucket = manifestBucket(m);
    const candidates = [
      path.join(COMPONENTS, bucket, m.name, `${m.name}.styles.css`),
      path.join(COMPONENTS, m.name, `${m.name}.styles.css`),
      path.join(COMPONENTS, m.name, 'styles.css'),
    ];
    const css = candidates.filter(fs.existsSync).map((p) => fs.readFileSync(p, 'utf8')).join('\n');
    if (RE.test(css)) {
      assert.strictEqual(m.adapt.mode, 'reflow', `${m.name} has @container aspect-ratio CSS but adapt.mode is "${m.adapt.mode}"`);
    }
  }
});

// The gate logic rejects the failure shapes (synthetic manifests, no CSS on disk).
test('checkAdaptDeclarations flags invalid declarations', () => {
  const cases = [
    { name: '__x', bucket: 'evidence', adapt: { mode: 'wat' } },                                  // invalid enum
    { name: '__x', bucket: 'evidence', adapt: { mode: 'single-orientation' }, orientation: ['landscape', 'portrait'] }, // single but two
    { name: '__x', bucket: 'evidence', adapt: { mode: 'native' }, orientation: ['landscape'] },   // native but one
    { name: '__x', bucket: 'evidence' },                                                          // missing adapt
  ];
  for (const m of cases) {
    const errors = [];
    checkAdaptDeclarations([m], errors);
    assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(m.adapt || null)} / orient=${JSON.stringify(m.orientation)}`);
  }
});

// …and accepts the valid shapes.
test('checkAdaptDeclarations accepts valid declarations', () => {
  const cases = [
    { name: '__x', bucket: 'evidence', adapt: { mode: 'native' }, orientation: ['landscape', 'portrait'] },
    { name: '__x', bucket: 'evidence', adapt: { mode: 'native' } },                               // omitted orientation = both
    { name: '__x', bucket: 'evidence', adapt: { mode: 'single-orientation' }, orientation: ['landscape'] },
    // `reflow` may be single-orientation — but since #1220 it must also SHIP one of
    // the four mechanisms, so this case carries the cheapest of them (a carousel
    // reshape recipe) rather than claiming reflow with nothing behind it.
    { name: '__x', bucket: 'evidence', adapt: { mode: 'reflow' }, orientation: ['landscape'], split: { strategy: 'cover-cards' } },
  ];
  for (const m of cases) {
    const errors = [];
    checkAdaptDeclarations([m], errors);
    assert.deepStrictEqual(errors, [], `expected no error for ${JSON.stringify(m)}`);
  }
});

// The OTHER direction of the anti-drift invariant, added in #1220: a manifest may
// not claim `reflow` while shipping none of the four mechanisms. The check was
// one-directional for a long time, and six components sat in exactly that state —
// `premise` painted its landscape 34% claim rail in a 980px phone box, wrapping the
// claim one word per line, while its manifest told authoring agents it adapted.
test('checkAdaptDeclarations rejects a reflow declaration with no mechanism', () => {
  const errors = [];
  checkAdaptDeclarations([{ name: '__x', bucket: 'evidence', adapt: { mode: 'reflow' } }], errors);
  assert.strictEqual(errors.length, 1, 'expected exactly one error for a bare reflow claim');
  assert.match(errors[0], /ships NONE of the four mechanisms/);
});

// The solver-intent gate is COMPLETE across the real tree: every component
// declares adapt.priority, so the solver never has to guess (Fit Spine §4/§6;
// engineering/decisions/2026-06-22-solver-intent-backfill.md).
test('every component declares a non-empty adapt.priority', () => {
  const errors = [];
  checkSolverIntentDeclared(loadAll(), errors);
  assert.deepStrictEqual(errors, [], `undeclared solver intent:\n${errors.join('\n')}`);
});

// The gate rejects undeclared / malformed intent…
test('checkSolverIntentDeclared flags missing or empty adapt.priority', () => {
  const cases = [
    { name: '__x', adapt: { mode: 'native' } },                       // no priority
    { name: '__x', adapt: { mode: 'native', priority: [] } },         // empty
    { name: '__x', adapt: { mode: 'native', priority: ['', 'a'] } },  // empty member
    { name: '__x', adapt: { mode: 'native', priority: 'title' } },    // not an array
    { name: '__x' },                                                  // no adapt at all
  ];
  for (const m of cases) {
    const errors = [];
    checkSolverIntentDeclared([m], errors);
    assert.ok(errors.length > 0, `expected an error for ${JSON.stringify(m.adapt || null)}`);
  }
});

// …and accepts a real priority declaration.
test('checkSolverIntentDeclared accepts a non-empty string array', () => {
  const errors = [];
  checkSolverIntentDeclared([{ name: '__x', adapt: { mode: 'native', priority: ['title', 'items'] } }], errors);
  assert.deepStrictEqual(errors, []);
});
