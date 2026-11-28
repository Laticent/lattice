// LTT 1.0's version and closed-core rules (spec/LTT-1.0.md §Versions, §The core), as shared cases a second
// implementation can run: docs/src/lib/ltt/conformance/validate/*.json. Each case names an LTT, whether a 1.x reader
// accepts it, and a phrase each expected problem contains. Failing arm: a validator that accepted every version, or
// one that ignored unknown core fields, turns `newer-major` or `closed-core-field` red.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const DIR = path.join(__dirname, '../../../docs/src/lib/ltt/conformance/validate');
const cases = fs
  .readdirSync(DIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({ file: f, ...JSON.parse(fs.readFileSync(path.join(DIR, f), 'utf8')) }));

test('the version and closed-core cases exist', () => {
  assert.deepEqual(cases.map((c) => c.file).sort(), ['closed-core-field.json', 'newer-major.json', 'newer-minor-unknown-fields.json']);
});

for (const c of cases) {
  test(`${c.file}: ${c.name}`, async () => {
    const { validateLtt } = await import('@laticent/ltt');
    const problems = validateLtt(c.ltt);
    assert.equal(problems.length === 0, c.valid, problems.join('\n'));
    for (const phrase of c.problems) assert.ok(problems.some((p) => p.includes(phrase)), `no problem mentions "${phrase}": ${problems.join(' | ')}`);
  });
}
