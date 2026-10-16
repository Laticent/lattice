// Every static conformance clause, over every instance its contract finds
// (engineering/decisions/2026-10-15-conformance-harness.md §6). The first describe is the matrix;
// the second proves each clause fails, for its own reason, on its own fixture (§6.3 rule 4); the
// third proves the runner and the ledger bite, so a green matrix cannot be a vacuous one.
const { describe, test } = require('node:test');
const assert = require('node:assert/strict');
const { loadContracts, runContract, fixtureProblems, readLedger, ledgerProblems, contractProblems } = require('../../../lib/conformance');

const contracts = loadContracts();
const ledger = readLedger();
const runs = contracts.map((c) => [c, runContract(c, { ledger })]);

describe('conformance: every instance meets every clause', () => {
  test('at least one contract is registered (reach)', () => assert.ok(contracts.length >= 1));
  for (const [c, run] of runs) {
    test(`${c.kind}: the contract is well-formed and every clause reached its instances`, () => assert.deepEqual(run.problems, []));
    test(`${c.kind}: no failing cell`, () => {
      const fails = run.cells.filter((x) => x.verdict === 'fail').map((x) => `${x.clause} × ${x.instance}: ${x.reason}`);
      assert.deepEqual(fails, []);
    });
  }
  test('the ledger: every entry names a live failure, a reason, and its clause\'s day', () => {
    const cells = runs.flatMap(([, r]) => r.cells);
    const clauses = new Map(contracts.flatMap((c) => c.clauses.map((cl) => [cl.id, cl])));
    assert.deepEqual(ledgerProblems(ledger, cells, clauses), []);
  });
});

describe('the deck-settings table and its prose cover the same keys', () => {
  // lib/core/deck-settings.prose.js is split from the table for bundle weight only; a row with no
  // words would print blank in the editor and on the reference page.
  const { DECK_SETTINGS } = require('../../../lib/core/deck-settings');
  const { DECK_SETTING_PROSE } = require('../../../lib/core/deck-settings.prose');
  test('every row has prose with an info line, and no prose names a missing row', () => {
    const keys = new Set(DECK_SETTINGS.map((r) => r.key));
    assert.deepEqual(DECK_SETTINGS.filter((r) => !DECK_SETTING_PROSE[r.key]?.info).map((r) => r.key), []);
    assert.deepEqual(Object.keys(DECK_SETTING_PROSE).filter((k) => !keys.has(k)), []);
  });
});

describe('conformance: each clause fails on its fixture, for its own reason', () => {
  for (const c of contracts) test(c.kind, () => assert.deepEqual(fixtureProblems(c), []));
});

describe('conformance: the deck-setting MEASUREMENT can produce a failing fact', () => {
  // The fixtures state their facts by hand, so they prove the clauses. This proves measure():
  // a key nothing reads, the spec lacks and its doc never names is measured as exactly that.
  const contract = contracts.find((c) => c.kind === 'deck-setting');
  const ctx = contract.context();
  const phantom = contract.measure('zzphantom', { key: 'zzphantom', kind: 'text', offer: false, docs: 'design/skills/lens.md', spec: '2.3' }, ctx);
  test('a phantom key has no reader, no §2.3 line, no case and no doc mention', () => {
    assert.deepEqual(phantom.readers, []);
    assert.equal(phantom.inSpec, false);
    assert.equal(phantom.specCases, 0);
    assert.equal(phantom.docMentions, false);
  });
  test('and the clauses that read those facts fail on it', () => {
    const failing = contract.clauses.filter((c) => (c.level === 'always' || c.applies(phantom, ctx)) && c.check(phantom, ctx)).map((c) => c.id);
    for (const id of ['deck-setting.read', 'deck-setting.spec-row', 'deck-setting.documented', 'deck-setting.lint-knows-key']) assert.ok(failing.includes(id), id);
  });
  test('a real key is measured as read, specified and cased', () => {
    const lift = contract.measure('lift', { key: 'lift' }, ctx);
    assert.ok(lift.readers.includes('lib/core/resolve-lift.js'), lift.readers.join(', '));
    assert.equal(lift.inSpec, true);
    assert.ok(lift.specCases >= 1);
  });
});

describe('conformance: the runner and the ledger bite (failing arms)', () => {
  const [contract] = contracts;
  test('a twin that fails a clause is reported', () => {
    const broken = { ...contract, clauses: contract.clauses.map((cl, i) => (i === 0 ? { ...cl, fixtures: { ...cl.fixtures, passes: cl.fixtures.fails } } : cl)) };
    assert.ok(fixtureProblems(broken).some((p) => p.includes('must pass every clause')));
  });
  test('a fixture that fails some OTHER clause is reported', () => {
    const [a, b] = contract.clauses;
    const swapped = { ...contract, clauses: [{ ...a, fixtures: { ...a.fixtures, fails: b.fixtures.fails } }, ...contract.clauses.slice(1)] };
    assert.ok(fixtureProblems(swapped).some((p) => p.startsWith(`${a.id}: fixture`)));
  });
  test('a clause whose enumeration goes blind fails its reach', () => {
    const blind = { ...contract, enumerate: () => [] };
    assert.ok(runContract(blind).problems.some((p) => p.includes('fewer than')));
  });
  test('a clause with no catch and no reason is malformed', () => {
    const lazy = { ...contract, clauses: [{ ...contract.clauses[0], catches: [], catchesNone: undefined }] };
    assert.ok(contractProblems(lazy).some((p) => p.includes('names no catch')));
  });
  test('a stale, late-seeded or reasonless debt entry is refused', () => {
    const run = runContract(contract);
    const clauses = new Map(contract.clauses.map((cl) => [cl.id, cl]));
    const [cell] = run.cells.filter((x) => x.verdict === 'pass');
    const stale = ledgerProblems([{ clause: cell.clause, instance: cell.instance, reason: 'a reason long enough', seeded: clauses.get(cell.clause).added }], run.cells, clauses);
    assert.ok(stale.some((p) => p.includes('STALE')));
    const late = ledgerProblems([{ clause: cell.clause, instance: cell.instance, reason: 'x', seeded: '2099-01-01' }], run.cells, clauses);
    assert.ok(late.some((p) => p.includes('only the day')) && late.some((p) => p.includes('reason')));
  });
});
