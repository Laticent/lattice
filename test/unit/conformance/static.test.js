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

describe('conformance: the component MEASUREMENT can produce failing facts', () => {
  // The fixtures state their facts by hand, so they prove the clauses. This builds a throwaway
  // lib/components tree with one of every defect and proves measure() reads each one out of files.
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const contract = contracts.find((c) => c.kind === 'component');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'conf-comp-'));
  const put = (rel, text) => { fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true }); fs.writeFileSync(path.join(root, rel), text); };
  put('b/zz-orphan/zz-orphan.styles.css', 'section.zz-orphan { padding-left: 4px; margin-right: 2px; text-align: left; /* right: 9px; */ }\n');
  put('b/zz-bad/zz-bad.manifest.json', JSON.stringify({
    name: 'zz-bad', variants: ['tall', 'wide'], variantAxes: [{ label: 'Size', members: ['tall', 'huge'] }],
    capacity: { axis: 'item', soft: 6, hard: 4, escalateTo: ['nosuch-component'] },
  }));
  put('b/zz-bad/zz-bad.styles.css', 'section.zz-bad { margin-inline-start: 1px; }\n');
  put('b/zz-bad/zz-bad.gallery.md', '---\nmarp: true\n---\n\n<!-- _class: zz-bad tall -->\n\n## A\n');
  put('b/_shared/stray.css', 'x { color: red; }\n');
  put('zzflat/zzflat.styles.css', 'a { margin: 0 0 0 4px; }\n');
  const ctx = contract.contextAt(root);
  const byName = new Map(contract.enumerate(ctx).map((i) => [i.name, i]));
  test('CSS with no manifest, and its physical declarations (comments not counted)', () => {
    const o = byName.get('zz-orphan');
    assert.equal(o.hasManifest, false);
    assert.equal(o.hasStyles, true);
    assert.equal(o.physical, 3);
  });
  test('a variant the gallery never draws, one lint does not know, a bad axis and a bad capacity', () => {
    const b = byName.get('zz-bad');
    assert.deepEqual(b.unrenderedVariants, ['wide']);
    // The linter's vocabulary is global, so a variant of a REAL component is never refused; what it
    // refuses here is the unknown component name, which is why both variants come back.
    assert.deepEqual(b.lintRefusedVariants, ['tall', 'wide']);
    assert.ok(b.axisProblems.some((p) => p.includes("'huge'")));
    assert.ok(b.capacityProblems.some((p) => p.includes('above capacity.hard')) && b.capacityProblems.some((p) => p.includes('nosuch-component')));
    assert.equal(b.physical, 0);
  });
  test('a FLAT folder (lib/components/<name>/) is an instance too, and its shorthand is counted', () => {
    assert.equal(byName.get('zzflat').physical, 1);
    assert.equal(byName.get('zzflat').hasManifest, false);
  });
  test('a shared folder holding a sheet build-css.js never names', () => {
    assert.deepEqual(byName.get('_shared').strayCss, [{ file: 'stray.css', wired: false }]);
  });
  test('and the clauses that read those facts fail on them', () => {
    const failing = (inst) => contract.clauses.filter((c) => (c.level === 'always' || c.applies(inst, ctx)) && c.check(inst, ctx)).map((c) => c.id);
    assert.ok(failing(byName.get('zz-orphan')).includes('component.files-both-ways'));
    for (const id of ['component.variants-rendered', 'component.variant-known-to-lint', 'component.axes-coherent', 'component.capacity-coherent']) assert.ok(failing(byName.get('zz-bad')).includes(id), id);
    assert.ok(failing(byName.get('_shared')).includes('component.css-wired'));
  });
  test('the physical-property counter counts declarations, not classes, custom properties or comments', () => {
    const css = '.a.left:hover{ } .b{ margin-left:1px; --x-left: 2px; left:0; text-align:right; border-top-left-radius:2px; padding-inline-start:1px } /* right: 9px */';
    assert.equal(contract.physicalCount(css), 4);
  });
  test('a real component is measured as having a manifest, a sheet and drawn variants', () => {
    const real = contract.enumerate(contract.context()).find((i) => i.name === 'cards-grid');
    assert.equal(real.hasManifest && real.hasStyles, true);
    assert.deepEqual(real.unrenderedVariants, []);
    assert.equal(real.declaresCards, true);
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
    const counted = contracts.find((c) => c.kind === 'component');
    const crun = runContract(counted);
    const cclauses = new Map(counted.clauses.map((cl) => [cl.id, cl]));
    const over = crun.cells.find((x) => x.clause === 'component.logical-properties' && x.verdict === 'fail');
    const entry = (ceiling) => ({ clause: over.clause, instance: over.instance, reason: 'a reason long enough', seeded: cclauses.get(over.clause).added, ceiling });
    const debtCells = crun.cells.map((x) => (x === over ? { ...x, verdict: 'debt' } : x));
    assert.ok(ledgerProblems([entry(over.measure - 1)], debtCells, cclauses).some((p) => p.includes('above its ceiling')));
    assert.ok(ledgerProblems([entry(over.measure + 1)], debtCells, cclauses).some((p) => p.includes('lower the ceiling')));
    assert.ok(ledgerProblems([{ ...entry(0), ceiling: undefined }], debtCells, cclauses).some((p) => p.includes('needs an integer ceiling')));
    assert.deepEqual(ledgerProblems([entry(over.measure)], debtCells, cclauses), []);
    const late = ledgerProblems([{ clause: cell.clause, instance: cell.instance, reason: 'x', seeded: '2099-01-01' }], run.cells, clauses);
    assert.ok(late.some((p) => p.includes('only the day')) && late.some((p) => p.includes('reason')));
  });
});
