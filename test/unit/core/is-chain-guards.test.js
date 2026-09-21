const test = require('node:test');
const assert = require('node:assert/strict');
const { summarizeGraph } = require('../../../lib/core/state-graph-facts.js');

// ─────────────────────────────────────────────────────────────────────────────
// WHICH OF `isChain`'S GUARDS ARE LOAD-BEARING — brute-forced, not reasoned about.
//
// The predicate has four conditions and its comment used to assert, in prose, that
// three were "provably redundant". A checker pushed back: the claim was never
// tested, and a claim about which lines can safely change is exactly the kind that
// rots. It was also WRONG about one of them.
//
// So every machine up to four states is enumerated — every subset of the 16
// possible edges, in both edge orders, because `next` keeps the LAST edge out of a
// state and the order therefore changes the answer — and each guard is dropped in
// turn to see whether anything in that space can tell the difference.
//
// THE RESULT, which is the useful part:
//   · `states.length < 2` is LOAD-BEARING. A single state with a self-loop reads
//     as "a straight chain" without it. The old comment implied otherwise.
//   · `!edges.length` is redundant while the size guard stands, and only then.
//   · the BACK-EDGE test is the one that does most of the work.
//   · the out-degree and in-degree tests are a MUTUALLY redundant PAIR: dropping
//     either alone changes nothing in 132132 machines, dropping BOTH changes 120.
//     That is why a mutation test on either one finds nothing and neither may be
//     deleted — the shape that needs them is `2->3, 1->3, 1->2`.
// ─────────────────────────────────────────────────────────────────────────────

const GUARDS = ['size', 'edges', 'back', 'out', 'in'];

/** `isChain`, with any subset of its guards dropped. Kept deliberately separate
 *  from the kernel: a mutation harness that imports the thing it mutates can only
 *  prove the code agrees with itself. */
function isChainWith(states, edges, dropped) {
  const drop = new Set(dropped);
  const byIndex = new Map(states.map((s) => [s.index, s]));
  const resolved = edges
    .filter((e) => byIndex.has(e.from) && byIndex.has(e.to))
    .map((e) => ({ ...e, isSelf: e.to === e.from }));
  const outForward = new Map();
  const incoming = new Map();
  for (const e of resolved) {
    if (e.isSelf) continue;
    outForward.set(e.from, (outForward.get(e.from) || 0) + 1);
    incoming.set(e.to, (incoming.get(e.to) || 0) + 1);
  }
  const start = states[0];
  if (!drop.has('size') && states.length < 2) return false;
  if (!drop.has('edges') && !resolved.length) return false;
  if (!start) return false;
  const forward = resolved.filter((e) => !e.isSelf);
  if (!drop.has('back') && forward.some((e) => e.to < e.from)) return false;
  if (!drop.has('out') && states.some((s) => (outForward.get(s.index) || 0) > 1)) return false;
  if (!drop.has('in') && states.some((s) => (incoming.get(s.index) || 0) > 1)) return false;
  const next = new Map(forward.map((e) => [e.from, e.to]));
  const seen = new Set();
  let at = start.index;
  while (at != null && !seen.has(at)) {
    seen.add(at);
    at = next.get(at);
  }
  return seen.size === states.length;
}

/** Every machine of 1..4 states, every edge subset, both edge orders. */
function* machines() {
  for (let n = 1; n <= 4; n++) {
    const states = Array.from({ length: n }, (_, i) => ({ index: i + 1, label: `S${i + 1}` }));
    const pairs = [];
    for (let a = 1; a <= n; a++) for (let b = 1; b <= n; b++) pairs.push({ from: a, to: b });
    for (let mask = 0; mask < 1 << pairs.length; mask++) {
      const base = pairs.filter((_, i) => mask & (1 << i));
      yield { states, edges: base };
      yield { states, edges: [...base].reverse() };
    }
  }
}

test('the harness reproduces the kernel exactly, so its mutations mean something', () => {
  // Cell 1 of 2, and it has to come first: a mutation study whose baseline is not
  // the real predicate measures its own copy. Checked against `summarizeGraph`
  // itself over a slice of the same space.
  let checked = 0;
  for (const { states, edges } of machines()) {
    if (states.length !== 3) continue;
    assert.equal(
      isChainWith(states, edges, []),
      summarizeGraph({ states, transitions: edges }).isChain,
      `harness diverged on ${JSON.stringify(edges)}`,
    );
    checked++;
  }
  assert.ok(checked > 1000, `only ${checked} machines checked`);
});

test('each guard, dropped in turn, over every machine up to four states', () => {
  const alone = new Map(GUARDS.map((g) => [g, 0]));
  const pairs = new Map();
  let combos = 0;
  for (const { states, edges } of machines()) {
    combos++;
    const truth = isChainWith(states, edges, []);
    for (const g of GUARDS) if (isChainWith(states, edges, [g]) !== truth) alone.set(g, alone.get(g) + 1);
    for (const a of GUARDS) {
      for (const b of GUARDS) {
        if (a >= b) continue;
        if (isChainWith(states, edges, [a, b]) !== truth) pairs.set(`${a}+${b}`, (pairs.get(`${a}+${b}`) || 0) + 1);
      }
    }
  }
  assert.equal(combos, 132132, 'the search space moved — the counts below are only comparable within it');

  // THE SIZE GUARD IS LOAD-BEARING, which is what the old comment got wrong.
  assert.equal(alone.get('size'), 2);
  assert.equal(isChainWith([{ index: 1, label: 'Only' }], [{ from: 1, to: 1 }], ['size']), true);
  assert.equal(summarizeGraph({ states: [{ index: 1, label: 'Only' }], transitions: [{ from: 1, to: 1 }] }).isChain, false);

  // THE BACK-EDGE TEST does most of the work, and a two-state cycle is the cheapest
  // witness — the shape that narrated as "a straight chain with no forks" when this
  // line was once swept out of the tree by a docs-only commit.
  assert.equal(alone.get('back'), 408);

  // OUT-DEGREE AND IN-DEGREE ARE A MUTUALLY REDUNDANT PAIR. Neither can be killed
  // by a test on its own; together they are load-bearing 120 times. This is why
  // "no test covers this line" is not evidence it may be deleted.
  assert.equal(alone.get('out'), 0);
  assert.equal(alone.get('in'), 0);
  assert.equal(pairs.get('in+out'), 120);

  // AND THE EDGE-COUNT GUARD is redundant while the size guard stands.
  assert.equal(alone.get('edges'), 0);
  assert.equal(pairs.get('edges+size'), 4);
});
