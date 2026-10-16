/**
 * lib/conformance/contract.js — the shape of a conformance contract, and its validator.
 *
 * A CONTRACT is one checklist per kind of thing (deck setting, component, theme, …): an
 * `enumerate()` that FINDS every instance itself, and a list of CLAUSES, each one item on the
 * checklist. Design and rules: engineering/decisions/2026-10-15-conformance-harness.md §6.
 * This is the thin core §6.1 asks for — a shape, a runner (run.js) and a ledger (ledger.js) —
 * not a framework: a contract is plain data plus functions, and the existing gates stay where
 * they are.
 *
 * A clause:
 *   id       `<kind>.<name>`, unique, stable (a ledger entry and a fixture name it)
 *   level    'always' · 'conditional' (applies when `applies(instance)` is true) ·
 *            'if-present' (the same, for an optional part)
 *   tier     'static' (reads files and data, runs in `npm test`). Phase 2 adds 'render'.
 *   applies  (instance, ctx) → boolean, for a conditional or if-present clause
 *   check    (instance, ctx) → null when it holds, else a one-line reason it does not
 *   fixtures { fails, passes } — names of fixture instances under
 *            test/conformance/fixtures/<kind>/: the first must fail with THIS clause's id and
 *            no other, the second, a near-twin, must pass every clause (§6.3 rule 4)
 *   reach    the fewest instances the clause must apply to, so an enumeration that comes back
 *            empty fails instead of passing vacuously (§6.3 rule 5)
 *   catches  what the clause caught: live defects on the day it landed, or fix commits it would
 *            have failed. Never empty without `catchesNone` (§6.3 rule 8)
 *   catchesNone  the reason, when `catches` is empty
 *   added    the date the clause landed; ledger debt may be seeded only on that date (§6.3 rule 1)
 *   why      the doc that states the expectation
 */

const LEVELS = new Set(['always', 'conditional', 'if-present']);
const TIERS = new Set(['static']);

/**
 * The problems with a contract's SHAPE, or [] — run before any clause, so a malformed contract
 * fails loudly rather than checking less than it claims.
 *
 * @param {object} contract
 * @returns {string[]}
 */
function contractProblems(contract) {
  const out = [];
  if (!contract || typeof contract.kind !== 'string' || !/^[a-z][a-z-]*$/.test(contract.kind)) return ['a contract needs a kebab-case `kind`'];
  const k = contract.kind;
  if (typeof contract.enumerate !== 'function') out.push(`${k}: enumerate() is missing`);
  if (typeof contract.instanceId !== 'function') out.push(`${k}: instanceId() is missing`);
  if (!Array.isArray(contract.clauses) || !contract.clauses.length) out.push(`${k}: a contract with no clauses governs nothing`);
  const ids = new Set();
  for (const c of contract.clauses || []) {
    const where = `${k}: clause ${c?.id ?? '(no id)'}`;
    if (typeof c?.id !== 'string' || !c.id.startsWith(`${k}.`)) out.push(`${where}: id must start with '${k}.'`);
    if (ids.has(c?.id)) out.push(`${where}: duplicate id`);
    ids.add(c?.id);
    if (!LEVELS.has(c?.level)) out.push(`${where}: level must be one of ${[...LEVELS].join(', ')}`);
    if (!TIERS.has(c?.tier)) out.push(`${where}: tier must be one of ${[...TIERS].join(', ')}`);
    if (c?.level !== 'always' && typeof c?.applies !== 'function') out.push(`${where}: a ${c?.level} clause needs applies()`);
    if (typeof c?.check !== 'function') out.push(`${where}: check() is missing`);
    if (!c?.fixtures?.fails || !c?.fixtures?.passes) out.push(`${where}: needs fixtures { fails, passes } (§6.3 rule 4)`);
    if (!Number.isInteger(c?.reach) || c.reach < 1) out.push(`${where}: needs reach ≥ 1 (§6.3 rule 5)`);
    if (!Array.isArray(c?.catches) || (!c.catches.length && !c.catchesNone)) out.push(`${where}: names no catch and no reason (§6.3 rule 8)`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c?.added || '')) out.push(`${where}: needs added: 'YYYY-MM-DD'`);
    if (typeof c?.why !== 'string' || !c.why) out.push(`${where}: needs why: the doc that states the expectation`);
  }
  return out;
}

module.exports = { contractProblems, LEVELS, TIERS };
