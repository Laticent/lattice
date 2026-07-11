/**
 * Unit: the Drawing Board settings module's persisted readers.
 *
 * The DOM (the settings panel itself) is verified headless. Here we prove the pure
 * persistence helper the chat feeds and the strip reads — the per-Lattice spend
 * tally — with in-memory localStorage/sessionStorage stubs (the module's reads are
 * guarded, so it loads in Node; we only need the globals when exercising spend).
 */

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

function memStore() {
  const m = new Map();
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
  };
}

describe('per-Lattice spend tally (recordSpend / readSpend)', () => {
  test('accumulates session + all-time from usage.cost; ignores junk/non-positive', async () => {
    global.localStorage = memStore();
    global.sessionStorage = memStore();
    const { recordSpend, readSpend } = await import('../../../docs/src/playground/drawing-board-settings.js');

    assert.deepEqual(readSpend(), { total: 0, session: 0, totalTokens: 0, sessionTokens: 0 });

    recordSpend(0.0375, 1200); // a real reply: cost + tokens
    recordSpend(0.02, 800);
    const s = readSpend();
    assert.ok(Math.abs(s.total - 0.0575) < 1e-9, 'all-time cost sums');
    assert.ok(Math.abs(s.session - 0.0575) < 1e-9, 'session cost sums');
    assert.equal(s.sessionTokens, 2000, 'session tokens sum');
    assert.equal(s.totalTokens, 2000, 'all-time tokens sum');

    // a free reply ($0) still burns tokens — tokens are recorded independently of cost
    recordSpend(0, 500);
    assert.ok(Math.abs(readSpend().total - 0.0575) < 1e-9, 'free reply adds no cost');
    assert.equal(readSpend().sessionTokens, 2500, 'free reply still adds tokens');

    // non-positive / non-numeric costs are ignored (never corrupt the tally)
    recordSpend(-1);
    recordSpend('nope');
    recordSpend(null);
    recordSpend(undefined);
    assert.ok(Math.abs(readSpend().total - 0.0575) < 1e-9, 'junk ignored');

    delete global.localStorage;
    delete global.sessionStorage;
  });

  test('session is independent of all-time (different stores)', async () => {
    const local = memStore();
    global.localStorage = local;
    global.sessionStorage = memStore(); // fresh "tab" — empty session
    local.setItem('lattice-db-spend-total', '5.00'); // pretend prior sessions spent $5
    const { readSpend } = await import('../../../docs/src/playground/drawing-board-settings.js');
    const s = readSpend();
    assert.equal(s.total, 5);
    assert.equal(s.session, 0, 'a new tab starts the session tally at 0');
    delete global.localStorage;
    delete global.sessionStorage;
  });
});

describe('budgetStatus (pure budget evaluation)', () => {
  let budgetStatus;
  test('load', async () => { ({ budgetStatus } = await import('../../../docs/src/playground/drawing-board-settings.js')); });

  test('no cap, no account → always ok, never blocked', () => {
    const s = budgetStatus({ sessionSpend: 999 });
    assert.equal(s.level, 'ok');
    assert.equal(s.blocked, false);
  });

  test('self-cap: warns at 80%, over at 100%', () => {
    assert.equal(budgetStatus({ sessionSpend: 3, cap: 10 }).level, 'ok'); // 30%
    assert.equal(budgetStatus({ sessionSpend: 8, cap: 10 }).level, 'warn'); // 80%
    assert.equal(budgetStatus({ sessionSpend: 10, cap: 10 }).level, 'over'); // 100%
    assert.equal(budgetStatus({ sessionSpend: 12, cap: 10 }).level, 'over');
  });

  test('blocked only when over AND mode is stop', () => {
    assert.equal(budgetStatus({ sessionSpend: 10, cap: 10, mode: 'alert' }).blocked, false);
    assert.equal(budgetStatus({ sessionSpend: 10, cap: 10, mode: 'stop' }).blocked, true);
    assert.equal(budgetStatus({ sessionSpend: 8, cap: 10, mode: 'stop' }).blocked, false); // only warn
  });

  test('credit ceiling: low at ≤20% of a known limit, exhausted at ≤0', () => {
    assert.equal(budgetStatus({ account: { limit: 10, remaining: 5 } }).level, 'ok'); // 50% left
    assert.equal(budgetStatus({ account: { limit: 10, remaining: 1.5 } }).level, 'warn'); // 15% left
    assert.equal(budgetStatus({ account: { limit: 10, remaining: 0 } }).level, 'over');
  });

  test('no-limit key: floor drives the low-balance warning', () => {
    assert.equal(budgetStatus({ account: { limit: null, remaining: 5 }, floor: 2 }).level, 'ok');
    assert.equal(budgetStatus({ account: { limit: null, remaining: 1.5 }, floor: 2 }).level, 'warn');
    assert.equal(budgetStatus({ account: { limit: null, remaining: 8 } }).level, 'ok'); // no floor, no limit → can't warn
  });

  test('takes the worst severity across both gauges', () => {
    // cap only warns, but credit is exhausted → over
    const s = budgetStatus({ sessionSpend: 8, cap: 10, account: { limit: 10, remaining: 0 }, mode: 'stop' });
    assert.equal(s.level, 'over');
    assert.equal(s.blocked, true);
    assert.match(s.message, /reached your|exhausted/);
  });
});
