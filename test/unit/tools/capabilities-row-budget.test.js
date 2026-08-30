/**
 * Unit: the per-ROW budget on engineering/capabilities.md
 * (`ROW_CAP` in tools/build-capabilities.js).
 *
 * The catalog is read by GREP — HARD RULE #15 sends every "am I about to reinvent
 * this?" question to it, and what that reader pays is the rows a query returns, not
 * the file. So the budget is per-row, and this suite asserts the check that enforces
 * it rather than anything about the live catalog.
 *
 * NO ASSERTION HERE READS THE COMMITTED FILE, deliberately. A test like "the widest
 * live row is under the cap" is an aggregate over every capability in the repo: it
 * goes red when an unrelated PR adds a script, and it bills whoever trips it for 300
 * predecessors' contributions. That is the #1547 mistake, and `build-decisions-index`
 * already had it removed once. The freshness of the committed file is
 * `capabilities:check`'s job; the budget is this one's.
 */
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { rowCostProblems, ROW_CAP } = require('../../../tools/build-capabilities.js');

const rowOf = (name, len) => `| \`${name}\` | ${'x'.repeat(len)} |`;
/** Pad a description so the WHOLE rendered row lands on exactly `total` characters. */
const rowExactly = (name, total) => rowOf(name, total - rowOf(name, 0).length);

describe('capabilities row budget', () => {
  it('passes a row inside the cap', () => {
    assert.deepEqual(rowCostProblems([rowExactly('bench', ROW_CAP - 1)]), []);
  });

  it('passes a row exactly at the cap', () => {
    const row = rowExactly('bench', ROW_CAP);
    assert.equal(row.length, ROW_CAP);
    assert.deepEqual(rowCostProblems([row]), []);
  });

  it('fails a row one character over, and names the capability', () => {
    const problems = rowCostProblems([rowExactly('contrast:player', ROW_CAP + 1)]);
    assert.equal(problems.length, 1);
    assert.match(problems[0], /^contrast:player: /);
    assert.match(problems[0], new RegExp(`${ROW_CAP + 1} characters`));
  });

  it("names the tool header as where the detail goes — the lever, not just the breach", () => {
    const [problem] = rowCostProblems([rowExactly('intent:pick-agents', ROW_CAP + 200)]);
    assert.match(problem, /tool's own header/);
  });

  it('reports every over-cap row, not just the first', () => {
    const problems = rowCostProblems([
      rowExactly('a', ROW_CAP + 1),
      rowExactly('b', 100),
      rowExactly('c', ROW_CAP + 50),
    ]);
    assert.deepEqual(problems.map((p) => p.split(':')[0]), ['a', 'c']);
  });

  it('still identifies a row whose name is not backticked', () => {
    const [problem] = rowCostProblems([`| plain name | ${'x'.repeat(ROW_CAP)} |`]);
    assert.ok(problem.startsWith('| plain name |'), problem.slice(0, 40));
  });

  it('is a character budget, so a multi-byte row is not billed twice', () => {
    // The rows are full of em dashes and arrows; length is UTF-16 units, not bytes.
    const row = `| \`x\` | ${'—'.repeat(ROW_CAP)} |`;
    assert.equal(rowCostProblems([row]).length, 1);
    assert.match(rowCostProblems([row])[0], new RegExp(`${row.length} characters`));
  });
});
