/**
 * Which regexes a call runs, and whether recheck calls each one linear: a hang guard without a clock.
 *
 * A test that guards a regex against catastrophic backtracking used to time a hostile input and fail past N seconds
 * (a `flaky-ok` hang guard). That is F4 in engineering/decisions/2026-11-06-flaky-tests.md: on a slow enough machine it
 * fails on correct code, and on a fast enough one a quadratic pattern still passes. The backtracking happens inside one
 * `exec`, so counting work (test/helpers/work-count.js) cannot see it either.
 *
 * So this asks the automaton instead. `traceRegexes(fn)` runs `fn` with `RegExp.prototype.exec` wrapped and records
 * every pattern executed. Every regex method a string or a RegExp offers (`test`, `match`, `matchAll`, `replace`,
 * `replaceAll`, `search`, `split`) reaches the pattern through `exec` once the prototype's `exec` is not the built-in
 * one (ECMA-262 RegExpExec), so the wrap sees them all. `assertLinearRegexes(fn)` then looks each one up in
 * tools/regex-census.json, the table recheck wrote (`npm run regex:census`), and fails on any pattern whose verdict is
 * not `safe`, and on any pattern the table does not hold (a `new RegExp(string)`, or one from a dependency), unless the
 * caller names it in `allow` with a reason. No timing, no recheck at test time: the verdict is the committed one, and
 * `checkRegexCensus` holds that table to lib/**.
 *
 * Known limits: a regex run by native code that never consults the prototype (none in Node's own string methods, but a
 * native addon could) is not seen; a pattern built at run time is only as checked as the `allow` reason says.
 */
const fs = require('node:fs');
const path = require('node:path');

const TABLE = path.join(__dirname, '..', '..', 'tools', 'regex-census.json');

/** `/source/flags` with its flags sorted, the form a RegExp's `source` and `flags` produce. */
function normalKey(source, flags) {
	return `/${source}/${[...flags].sort().join('')}`;
}

let verdictCache = null;
/** The census's verdicts keyed on normalKey: { key: 'safe' | 'polynomial' | 'exponential' | 'unknown' }. */
function censusVerdicts() {
	if (verdictCache) return verdictCache;
	const { verdicts } = JSON.parse(fs.readFileSync(TABLE, 'utf8'));
	verdictCache = new Map();
	for (const [key, v] of Object.entries(verdicts)) {
		const end = key.lastIndexOf('/');
		verdictCache.set(normalKey(key.slice(1, end), key.slice(end + 1)), typeof v === 'string' ? v : v.verdict);
	}
	return verdictCache;
}

/**
 * Run `fn` and record every regex it executes. Returns { result, keys } where `keys` is the distinct normalKeys run.
 * The wrap is removed before this returns, even when `fn` throws.
 */
function traceRegexes(fn) {
	const original = RegExp.prototype.exec;
	const keys = new Set();
	RegExp.prototype.exec = function exec(s) {
		keys.add(normalKey(this.source, this.flags));
		return original.call(this, s);
	};
	try {
		return { result: fn(), keys };
	} finally {
		RegExp.prototype.exec = original;
	}
}

/**
 * Run `fn`, then fail when any regex it ran is not linear by the census. `allow` maps a normalKey the census cannot hold
 * (built at run time, or a dependency's) to the reason it is safe here. Returns `fn`'s result and the keys it ran, so the
 * caller can also assert that the path it meant to guard was the one taken.
 */
function assertLinearRegexes(fn, { allow = {} } = {}) {
	const { result, keys } = traceRegexes(fn);
	const verdicts = censusVerdicts();
	const slow = [];
	const unknown = [];
	for (const k of keys) {
		if (Object.hasOwn(allow, k)) continue;
		// `split` runs a copy of its regex with `y` added (ECMA-262 @@split), so `/,/` arrives as `/,/y`. Sticky only drops
		// start positions, so the unsticky verdict bounds it.
		const v = verdicts.get(k) ?? (k.endsWith('y') ? verdicts.get(k.replace(/y$/, '')) : undefined);
		if (v === undefined) unknown.push(k);
		else if (v !== 'safe') slow.push(`${k} (${v})`);
	}
	if (slow.length || unknown.length) {
		const lines = [];
		if (slow.length) lines.push(`ran ${slow.length} regex(es) recheck does not call linear: ${slow.join(', ')}`);
		if (unknown.length) lines.push(`ran ${unknown.length} regex(es) tools/regex-census.json does not hold (built at run time, or a dependency's); name each in \`allow\` with why it is safe: ${unknown.join(', ')}`);
		throw new Error(lines.join('\n'));
	}
	return { result, keys };
}

module.exports = { traceRegexes, assertLinearRegexes, normalKey };
