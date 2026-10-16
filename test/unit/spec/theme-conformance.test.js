
// The theme contract's shared test cases (spec/conformance/theme/) on the reference
// implementation, the arm that bites, and the spec's token table held to the code.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { listCases, runCase } = require('../../../tools/theme-conformance.js');
const { REQUIRED_TOKENS } = require('../../../lib/theme/derive.js');
const { ENGINE_DEFAULTED_TOKENS, FALLBACK_ONLY_TOKENS } = require('../../../lib/theme/gate.js');

const cases = listCases();

describe('theme conformance: every shared case passes on the reference implementation', () => {
  test('cases cover the token contract, light and dark, the manifest and the refusals', () => {
    const sections = new Set(cases.map((c) => String(c.section)));
    for (const s of ['4.1', '4.2', '5', '6']) assert.ok(sections.has(s), `§${s} has a case`);
  });
  for (const c of cases) test(`${c.kind} · ${c.name}`, () => assert.deepEqual(runCase(c), []));
});

describe('theme conformance: a wrong expectation fails (the arm that bites)', () => {
  for (const c of cases) {
    test(`${c.kind} · ${c.name}`, () => {
      const expect = structuredClone(c.expect);
      if ('valid' in expect) expect.valid = !expect.valid;
      else expect.ok = !expect.ok;
      assert.ok(runCase({ ...c, expect }).length, 'a flipped verdict still passed');
    });
  }
});

describe('spec/THEME-1.0.md §4.1 names exactly the tokens the code requires', () => {
  const spec = fs.readFileSync(path.join(__dirname, '../../../spec/THEME-1.0.md'), 'utf8');
  const table = spec.slice(spec.indexOf('| Group | Tokens |'), spec.indexOf('† the engine defaults it'));
  const listed = [...table.matchAll(/`--([a-z0-9_-]+)`( [†‡])?/g)].map((m) => ({ name: m[1], mark: (m[2] || '').trim() }));
  const required = Object.values(REQUIRED_TOKENS).flatMap((g) => [...g]);

  test('the same names, none missing and none extra', () => {
    assert.deepEqual(listed.map((t) => t.name).sort(), [...required].sort());
  });
  test('† marks exactly the engine-defaulted tokens, ‡ exactly the fallback-only ones', () => {
    assert.deepEqual(listed.filter((t) => t.mark === '†').map((t) => t.name).sort(), Object.keys(ENGINE_DEFAULTED_TOKENS).sort());
    assert.deepEqual(listed.filter((t) => t.mark === '‡').map((t) => t.name).sort(), Object.keys(FALLBACK_ONLY_TOKENS).sort());
  });
});
