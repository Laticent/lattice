/**
 * Count the work a hostile input costs, instead of timing it (HARD RULE #32, F1 in
 * engineering/decisions/2026-11-06-flaky-tests.md).
 *
 * A "stays linear on hostile input" test used to assert `elapsed < 500 ms`. That passes or fails on the machine's
 * load. A count passes or fails on the code alone.
 *
 * `scanWork(fn)` sees RESCANNING: a loop that searches from every opener to the end of the text (an unclosed `<!--`
 * flood, `url(` repeated, nested parentheses) does n searches of about n characters each. It wraps the string searches
 * (`indexOf`, `lastIndexOf`, `includes`, `startsWith`) and `RegExp.prototype.exec`, which `test`, `match`, `matchAll`,
 * `replace` and `split` all reach once the prototype is patched, and totals the characters each call covered: from
 * where it started to where it matched, or to the end when it did not. A linear scan covers each character a bounded
 * number of times, so the total is a small multiple of the input.
 *
 * It OVERCOUNTS one shape: a failed `^`-anchored, non-sticky regex is charged the rest of the text, though V8 tries only
 * the one position. markdown-it's `HTML_TAG_RE` fails like that at every `<`, so `md.parse` on `<a b` repeated reads as
 * about 20,000 per character while it runs in linear time. The error is on the safe side (a false alarm, never a
 * missed rescan), so count the function that owns the scan rather than a whole render that passes through markdown-it.
 *
 * `charReads(fn)` sees a hand-written walker: it counts `charCodeAt` / `codePointAt` calls, `slice` / `substring` copies and the arrays an Array
 * search walks, and returns `scanWork`'s count beside them.
 *
 * What neither can see, and nothing here can:
 * - a walker that indexes `s[k]` or loops over an array with `for`, which needs a counter in the product
 *   (`comments(text, work)` in lib/core/meta-record.mjs);
 * - BACKTRACKING inside one regex exec (an ambiguous `\s*` either side of an optional piece). V8's backtrack counter
 *   (`--regexp-backtracks-before-fallback`) rises about once per start position, so a linear and a quadratic pattern
 *   on 40,000 characters both count 30,000 to 100,000, and release Node prints no bytecode trace. A guard against that
 *   shape stays a hang guard sized by F4: an input the old pattern needs seconds for, a bound far above the linear
 *   cost, and `// flaky-ok:` with both numbers on the line.
 */
/**
 * Run `fn` and return `{ result, scanned }`: the characters every string search and regex exec covered while it ran.
 * @template T
 * @param {() => T} fn
 * @returns {{ result: T, scanned: number }}
 */
function scanWork(fn) {
  const S = String.prototype;
  const R = RegExp.prototype;
  const orig = { indexOf: S.indexOf, lastIndexOf: S.lastIndexOf, includes: S.includes, startsWith: S.startsWith, exec: R.exec };
  let scanned = 0;
  let depth = 0; // a wrapped call that calls another wrapped one (exec inside a regex `includes`) counts once
  const counted = (fn) => function (...args) {
    if (depth) return fn.apply(this, args);
    depth++;
    try { return fn.apply(this, args); } finally { depth--; }
  };
  const str = (s) => (typeof s === 'string' ? s : String(s));
  const from = (len, at) => Math.min(len, Math.max(0, Math.trunc(Number(at) || 0)));
  S.indexOf = counted(function (needle, at) {
    const s = str(this); const start = from(s.length, at); const hit = orig.indexOf.call(s, needle, at);
    scanned += (hit === -1 ? s.length : hit + String(needle).length) - start;
    return hit;
  });
  S.lastIndexOf = counted(function (needle, at) {
    const s = str(this); const hit = orig.lastIndexOf.call(s, needle, at);
    const end = at === undefined ? s.length : from(s.length, at) + String(needle).length;
    scanned += Math.max(0, Math.min(s.length, end) - (hit === -1 ? 0 : hit));
    return hit;
  });
  S.includes = counted(function (needle, at) {
    const s = str(this); const start = from(s.length, at); const hit = orig.indexOf.call(s, needle, start);
    scanned += (hit === -1 ? s.length : hit + String(needle).length) - start;
    return hit !== -1;
  });
  S.startsWith = counted(function (needle, at) {
    scanned += String(needle).length;
    return orig.startsWith.call(this, needle, at);
  });
  R.exec = counted(function (s) {
    const text = str(s);
    const start = this.global || this.sticky ? from(text.length, this.lastIndex) : 0;
    const m = orig.exec.call(this, text);
    // A failed sticky attempt (how `split` walks) still looked at the character it stood on.
    scanned += m ? m.index + m[0].length - start : this.sticky ? Math.min(1, text.length - start) : text.length - start;
    return m;
  });
  try {
    return { result: fn(), scanned };
  } finally {
    Object.assign(S, { indexOf: orig.indexOf, lastIndexOf: orig.lastIndexOf, includes: orig.includes, startsWith: orig.startsWith });
    R.exec = orig.exec;
  }
}

/**
 * Run `fn` and count the work a hand-written walker does, which `scanWork` cannot see: every `charCodeAt` and
 * `codePointAt` call, the characters every `slice` and `substring` copies, and the length of every array an Array
 * search (`some`, `includes`, `indexOf`, …) walks. A loop
 * that indexes `s[k]` or walks an array with `for` is not seen. Returns `scanWork`'s `result` and `scanned` too.
 * @template T
 * @param {() => T} fn
 * @returns {{ result: T, scanned: number, reads: number }}
 */
function charReads(fn) {
  const S = String.prototype;
  const A = Array.prototype;
  const orig = { charCodeAt: S.charCodeAt, codePointAt: S.codePointAt, slice: S.slice, substring: S.substring };
  const searches = ['some', 'every', 'find', 'findIndex', 'findLast', 'findLastIndex', 'includes', 'indexOf', 'lastIndexOf', 'filter'];
  const origA = Object.fromEntries(searches.map((k) => [k, A[k]]));
  let reads = 0;
  S.charCodeAt = function (i) { reads++; return orig.charCodeAt.call(this, i); };
  S.codePointAt = function (i) { reads++; return orig.codePointAt.call(this, i); };
  // A copy costs its length: a scan that slices the rest of the text at every step is quadratic without one read.
  S.slice = function (...a) { const out = orig.slice.apply(this, a); reads += out.length; return out; };
  S.substring = function (...a) { const out = orig.substring.apply(this, a); reads += out.length; return out; };
  for (const k of searches) A[k] = function (...args) { reads += this.length; return origA[k].apply(this, args); };
  try {
    const { result, scanned } = scanWork(fn);
    return { result, scanned, reads };
  } finally {
    Object.assign(S, orig);
    Object.assign(A, origA);
  }
}

module.exports = { scanWork, charReads };
