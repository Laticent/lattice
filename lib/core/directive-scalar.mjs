/**
 * lib/core/directive-scalar.mjs — read a directive's scalar value in one pass: drop a trailing YAML `# comment`, trim,
 * drop one pair of outer quotes, trim.
 *
 * It replaces the chain `.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()` that `paginateOn`,
 * `hideOn` (meta-keys.mjs) and `hideValue` (hide-directive.mjs) each ran on every directive value the engine renders.
 * Both patterns backtrack (regex PR 3, followups.d/3045-p2-regex-recheck-gate.md): `\s+#` retries the whole whitespace
 * run from every start inside it, so a run of n spaces costs n² steps, and recheck cannot decide the back-reference in
 * the second. The functions below keep the regexes' exact meaning, edge cases included, which the seeded differential
 * fuzz in test/unit/core/directive-scalar.test.js holds against the old patterns.
 */

/** ECMAScript `\s`: WhiteSpace plus LineTerminator. */
const isSpace = (c) =>
	c === 0x20 || (c >= 0x09 && c <= 0x0d) || c === 0xa0 || c === 0x1680 || (c >= 0x2000 && c <= 0x200a) ||
	c === 0x2028 || c === 0x2029 || c === 0x202f || c === 0x205f || c === 0x3000 || c === 0xfeff;

/** The characters `.` does not match without the `s` flag. */
const isLineTerminator = (c) => c === 0x0a || c === 0x0d || c === 0x2028 || c === 0x2029;

/**
 * `s.replace(/\s+#.*$/, '')`: cut at the first whitespace run that is followed by `#` when no line terminator comes
 * after that `#` (`.*$` without the `m` flag must reach the end of the string). Every start inside one run ends at the
 * same `#` or at none, so the run's first character is the leftmost match.
 */
export function stripHashComment(s) {
	let lastBreak = -1;
	for (let i = s.length - 1; i >= 0; i--) {
		if (isLineTerminator(s.charCodeAt(i))) {
			lastBreak = i;
			break;
		}
	}
	let i = 0;
	while (i < s.length) {
		if (!isSpace(s.charCodeAt(i))) {
			i++;
			continue;
		}
		let j = i;
		while (j < s.length && isSpace(s.charCodeAt(j))) j++;
		if (j < s.length && s.charCodeAt(j) === 0x23 /* # */ && j > lastBreak) return s.slice(0, i);
		i = j;
	}
	return s;
}

/**
 * `s.replace(/^(['"])(.*)\1$/, '$2')`: drop one pair of matching outer quotes when nothing between them is a line
 * terminator (`.` does not match one).
 */
export function unquote(s) {
	if (s.length < 2) return s;
	const q = s.charCodeAt(0);
	if ((q !== 0x22 && q !== 0x27) || s.charCodeAt(s.length - 1) !== q) return s;
	for (let i = 1; i < s.length - 1; i++) if (isLineTerminator(s.charCodeAt(i))) return s;
	return s.slice(1, -1);
}

/** A directive's scalar value: no trailing `# comment`, no outer quotes, trimmed. */
export function directiveScalar(value) {
	return unquote(stripHashComment(String(value ?? '')).trim()).trim();
}
