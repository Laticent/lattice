/**
 * Does a rewritten regex match exactly what the old one matched? A seeded differential fuzz.
 *
 * Draining tools/regex-census.json means rewriting a slow pattern into a linear one that must behave the same. Hand-made
 * examples check the cases the author thought of; this draws `n` strings from an alphabet built for the pattern (its own
 * literal characters plus the edges of the classes it uses: blanks, a newline, a letter, a digit, punctuation), runs both
 * regexes through `exec` from every start a global scan would reach, and returns the first input where the match index
 * or any capture differs. The PRNG is seeded (mulberry32) and the seed is in the report, so a failure reproduces (HARD
 * RULE #32, F5).
 *
 * `same(a, b)` compares whole scans; `differ(a, b, opts)` returns `null` or { input, seed, old, new }.
 */

/** mulberry32: a small seeded PRNG, the same one the rest of the suite uses for a reproducible draw. */
function mulberry32(seed) {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

const EDGES = [' ', ' ', '\t', '\n', '\r', 'a', 'Z', '0', '9', '-', '_', '.', ',', ':', ';', '"', "'", '<', '>', '/', '=', '#', '|', '(', ')', '[', ']', '{', '}', '*', '\\', ' '];

/** The characters worth drawing for `re`: every printable character its source names, plus EDGES. */
function alphabetFor(...res) {
	const set = new Set(EDGES);
	for (const re of res) for (const ch of re.source.replace(/\\[dDwWsSbBnrtfv]/g, '')) if (ch >= ' ' && ch !== '\\') set.add(ch);
	return [...set];
}

/** Every match a global scan of `s` reaches: [[index, ...captures]]. A non-global regex reports its first match only. */
function scan(re, s) {
	const g = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
	const out = [];
	for (let m = g.exec(s); m; m = g.exec(s)) {
		out.push([m.index, ...m]);
		if (!re.flags.includes('g')) break;
		if (m[0] === '') g.lastIndex++;
	}
	return out;
}

/**
 * The first input of `n` seeded draws (lengths 0 to `maxLen`) on which `a` and `b` scan differently, or null. `inputs`
 * adds hand-picked cases that are always tried first.
 */
function differ(a, b, { seed = 1, n = 5000, maxLen = 40, alphabet = alphabetFor(a, b), inputs = [] } = {}) {
	const rand = mulberry32(seed);
	const cases = [...inputs];
	for (let i = 0; i < n; i++) {
		const len = Math.floor(rand() * (maxLen + 1));
		let s = '';
		for (let j = 0; j < len; j++) s += alphabet[Math.floor(rand() * alphabet.length)];
		cases.push(s);
	}
	for (const input of cases) {
		const x = JSON.stringify(scan(a, input));
		const y = JSON.stringify(scan(b, input));
		if (x !== y) return { input, seed, old: x, new: y };
	}
	return null;
}

module.exports = { differ, scan, alphabetFor, mulberry32 };
