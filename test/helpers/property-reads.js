/**
 * Count the nodes a walk visits, instead of timing it (HARD RULE #32, F1 in
 * engineering/decisions/2026-11-06-flaky-tests.md).
 *
 * A grammar analysis or a code generator that walks a reused piece once per PATH instead of once per piece costs
 * 2^depth on a grammar that reuses each level twice. Its tests used to assert `elapsed < 500 ms`. That passes or fails
 * on the machine's load; a count of visits passes or fails on the code alone. The walk touches no string, so
 * test/helpers/work-count.js sees nothing of it.
 *
 * `countReads(root, key)` returns a deep copy of `root` in which every plain object that owns `key` is a Proxy counting
 * the reads of `key`, `reads()`, the running total, and `nodes`, how many such objects there are (a shared one once). A walker reads a node's tag (`e.t` in Segno's `Expr`) each time
 * it visits the node, so the total is the visit count. A piece shared by several parents stays ONE shared copy, so a
 * graph walk sees it once and a tree walk sees it once per path. An array of objects is copied with its elements; an
 * array of numbers or of arrays (a CharSet) and any object that is not a plain object are kept as they are.
 *
 * `limit` makes a regression fail fast: the read past it throws, so a walk gone exponential stops at the bound instead
 * of hanging the test runner, which cannot interrupt a synchronous loop. Pass a number, or a function of `nodes`.
 *
 * What it cannot see: a walker that caches the tag in a field of its own, or that copies the input before walking it.
 * @template T
 * @param {T} root
 * @param {string} key
 * @param {{ limit?: number | ((nodes: number) => number) }} [options]
 * @returns {{ value: T, reads: () => number, nodes: number }}
 */
function countReads(root, key, { limit: bound = Infinity } = {}) {
  let limit = Infinity; // set once the copy is built, so a bound per node can see the count
  let reads = 0;
  let nodes = 0;
  const copies = new Map();
  const isObject = (v) => v !== null && typeof v === 'object';
  const wrap = (v) => {
    if (!isObject(v)) return v;
    if (copies.has(v)) return copies.get(v);
    if (Array.isArray(v)) {
      if (!v.some((x) => isObject(x) && !Array.isArray(x))) return v;
      const out = [];
      copies.set(v, out);
      for (const x of v) out.push(wrap(x));
      return out;
    }
    const proto = Object.getPrototypeOf(v);
    if (proto !== Object.prototype && proto !== null) return v;
    const target = Object.create(proto);
    const counted = Object.hasOwn(v, key);
    if (counted) nodes++;
    const out = counted
      ? new Proxy(target, {
          get(t, k, r) {
            if (k === key && ++reads > limit) throw new Error(`countReads: more than ${limit} reads of "${key}"`);
            return Reflect.get(t, k, r);
          },
        })
      : target;
    copies.set(v, out);
    for (const k of Object.keys(v)) target[k] = wrap(v[k]);
    return out;
  };
  const value = wrap(root);
  limit = typeof bound === 'function' ? bound(nodes) : bound;
  return { value, reads: () => reads, nodes };
}

module.exports = { countReads };
