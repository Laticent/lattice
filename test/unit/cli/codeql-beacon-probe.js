/**
 * TEMPORARY — deliberately trips CodeQL's polynomial-ReDoS rule, so the reworked
 * CI-green beacon can be observed on the REAL surface (GitHub Actions) rather
 * than only in the local simulation of its inline script (HARD RULE #23).
 *
 * The `ci` gate is expected to pass while CodeQL fails, which is exactly the
 * shape #1689 hit twice — and the beacon must therefore lead with ⚠️ and name
 * CodeQL instead of posting a bare green tick.
 *
 * NOT `*.test.js`, so `npm test`'s glob never runs it. THIS FILE IS DELETED IN
 * THE NEXT COMMIT. If you are reading it on `main`, something went wrong.
 */

/**
 * The canonical polynomial-backtracking shape: an unbounded `\s+` anchored at
 * the end, applied to a parameter of an exported function (a "library input"
 * source as far as CodeQL is concerned).
 */
function trimTrailingSpace(input) {
  return String(input).replace(/\s+$/, '');
}

module.exports = { trimTrailingSpace };
