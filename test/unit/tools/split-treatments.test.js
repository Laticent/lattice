/**
 * §0c's generated treatment table + §8 rule 11's attestation precondition.
 *
 * Both of these replaced a hand-maintained claim with a derivation, and both are
 * worth a NEGATIVE CONTROL: a gate that has never been seen to fail is a gate nobody
 * knows works. The §0c table rotted three ways while looking correct ("59" against a
 * catalog of 61, two components missing entirely, one placed against the code), and
 * the oracle's rule-11 sentence was satisfied on paper by a tool that did none of it.
 */

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..', '..', '..');
const { collect, render, splice, ringsAgainstPlacement } = require(path.join(ROOT, 'tools', 'build-split-treatments.js'));
const { attestationProblems, GRANDFATHERED } = require(path.join(ROOT, 'tools', 'bless-split-oracle.js'));
const { TREATMENTS, TREATMENT_LABELS } = require(path.join(ROOT, 'lib', 'core', 'split-facts.js'));

test('§0c treatment table', async (t) => {
  await t.test('places every component in the live catalog', () => {
    const { rows, errors } = collect();
    assert.deepStrictEqual(errors, [], 'a component with no treatment is a placement decision nobody made');
    const catalog = require(path.join(ROOT, 'lib', 'components')).loadAll();
    assert.strictEqual(rows.length, catalog.length,
      'the table must cover the catalog exactly — the hand-maintained version claimed 59 against 61');
  });

  await t.test('the committed table is what the map renders', () => {
    const doc = fs.readFileSync(
      path.join(ROOT, 'engineering', 'decisions', '2026-07-22-structure-derived-split-patterns.md'), 'utf8',
    );
    const { rows } = collect();
    assert.strictEqual(splice(doc, render(rows)), doc, 'run `npm run split:treatments` and commit');
  });

  await t.test('names the components the hand-maintained table lost', () => {
    // The three specific drifts #1234 found. Pinned by name, because the whole point
    // of generating the table is that these can never silently recur.
    const doc = fs.readFileSync(
      path.join(ROOT, 'engineering', 'decisions', '2026-07-22-structure-derived-split-patterns.md'), 'utf8',
    );
    const table = doc.slice(doc.indexOf('<!-- split-treatments:begin -->'), doc.indexOf('<!-- split-treatments:end -->'));
    for (const name of ['matrix-grid', 'premise']) {
      assert.ok(table.includes(`\`${name}\``), `${name} was placed only in split-facts.js, never in the prose`);
    }
    // roadmap was recorded `atomic` a release after #1209 moved the code to read-across.
    assert.strictEqual(TREATMENTS.roadmap, 'read-across');
    const readAcrossRow = table.split('\n').find((l) => l.startsWith(`| ${TREATMENT_LABELS['read-across']}`));
    assert.ok(readAcrossRow?.includes('`roadmap`'), 'roadmap renders under the treatment the code gives it');
  });

  await t.test('the ° marker means "this placement describes a split it never opted into"', () => {
    // Not simply "un-enrolled": an atomic component is SUPPOSED to ring, and a
    // read-across component keeping whole is one of that treatment's two intended
    // outcomes. Marking those would make the marker noise.
    assert.strictEqual(ringsAgainstPlacement({ treatment: 'list-light', enrolled: false }), true);
    assert.strictEqual(ringsAgainstPlacement({ treatment: 'list-light', enrolled: true }), false);
    assert.strictEqual(ringsAgainstPlacement({ treatment: 'atomic', enrolled: false }), false);
    assert.strictEqual(ringsAgainstPlacement({ treatment: 'read-across', enrolled: false }), false);
    assert.strictEqual(ringsAgainstPlacement({ treatment: 'needs-call', enrolled: false }), false);
  });
});

test('§8 rule 11 — the oracle records a verified default, it never mints one', async (t) => {
  await t.test('the committed record satisfies the precondition', () => {
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'oracle', 'split-oracle.json'), 'utf8'));
    assert.deepStrictEqual(attestationProblems(record.components, record.verified || {}), []);
  });

  await t.test('NEGATIVE CONTROL — a newly enrolled component with no attestation is refused', () => {
    const problems = attestationProblems({ 'brand-new': { enrolled: true } }, {});
    const mine = problems.filter((p) => p.startsWith('brand-new'));
    assert.strictEqual(mine.length, 1, 'this is the exact hole rule 11 named: the first --bless minted the default');
    assert.match(mine[0], /never mints one/);
  });

  // `attestationProblems` also audits GRANDFATHERED against the facts it is handed, so
  // a synthetic one-component set reports every grandfathered name as missing. That is
  // correct behavior on a real catalog; here it is noise, so each case reads only the
  // problems about its own subject.
  const about = (name, facts, verified) => attestationProblems(facts, verified).filter((p) => p.startsWith(`${name}:`));

  await t.test('an attestation naming a deck that is not committed verifies nothing', () => {
    const problems = about('thing', { thing: { enrolled: true } }, { thing: { deck: 'examples/does-not-exist.md', by: '#1' } });
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /does not exist/);
  });

  await t.test('an attestation with no sign-off is refused', () => {
    const problems = about('thing', { thing: { enrolled: true } }, { thing: { deck: 'package.json' } });
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /needs a `by`/);
  });

  await t.test('an attestation for a component that cannot split is stale', () => {
    const problems = about('thing', { thing: { enrolled: false } }, { thing: { deck: 'package.json', by: '#1' } });
    assert.strictEqual(problems.length, 1);
    assert.match(problems[0], /NOT enrolled/);
  });

  await t.test('GRANDFATHERED is shrink-only — a resolved or removed name must leave it', () => {
    // Every grandfathered name must still be a real, enrolled component. The list is a
    // backlog of unverified enrollments; an entry for anything else is a claim about
    // nothing, and the ratchet only counts if it cannot quietly hold stale names.
    const record = JSON.parse(fs.readFileSync(path.join(ROOT, 'test', 'oracle', 'split-oracle.json'), 'utf8'));
    for (const name of GRANDFATHERED) {
      assert.ok(record.components[name], `${name} is grandfathered but not a component`);
      assert.strictEqual(record.components[name].enrolled, true, `${name} is grandfathered but no longer enrolled — drop it`);
    }
    // ...and the check itself says so, rather than passing silently.
    const stale = attestationProblems({ [GRANDFATHERED[0]]: { enrolled: false } }, {});
    assert.ok(stale.some((p) => /no longer enrolled/.test(p)));
  });
});
