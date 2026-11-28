/**
 * lib/core/directive-scalar.mjs — a directive's scalar value in one pass: drop a trailing YAML `# comment`, trim, drop
 * one pair of outer quotes, trim. It replaces `.replace(/\s+#.*$/, '').trim().replace(/^(['"])(.*)\1$/, '$2').trim()`
 * in `paginateOn`, `hideOn` (meta-keys.mjs) and `hideValue` (hide-directive.mjs): `\s+#` retried a blank run from every
 * start inside it (n² on a long run), and recheck cannot decide the back-reference (regex PR 3). Same meaning, edge
 * cases included: test/unit/core/directive-scalar.test.js holds it to the old patterns by a seeded fuzz. Kept small: the
 * docs editor and the Studio's lint bundle load it eagerly.
 */

const BLANK = /\s/; // one character at a time: linear
const BREAK = /[\n\r\u2028\u2029]/; // what `.` does not match

/**
 * `s.replace(/\s+#.*$/, '')`: cut at the first blank run followed by `#` with no line break after that `#`. Every start
 * inside one run reaches the same `#` or none, so the run's first character is the leftmost match.
 */
export function stripHashComment(s) {
	const lastBreak = Math.max(s.lastIndexOf('\n'), s.lastIndexOf('\r'), s.lastIndexOf('\u2028'), s.lastIndexOf('\u2029'));
	let i = 0;
	while (i < s.length) {
		if (!BLANK.test(s[i])) {
			i++;
			continue;
		}
		let j = i;
		while (j < s.length && BLANK.test(s[j])) j++;
		if (s[j] === '#' && j > lastBreak) return s.slice(0, i);
		i = j;
	}
	return s;
}

/** `s.replace(/^(['"])(.*)\1$/, '$2')`: one pair of matching outer quotes, no line break between them. */
export function unquote(s) {
	const q = s[0];
	return s.length > 1 && (q === '"' || q === "'") && s.at(-1) === q && !BREAK.test(s.slice(1, -1)) ? s.slice(1, -1) : s;
}

/** A directive's scalar value: no trailing `# comment`, no outer quotes, trimmed. */
export function directiveScalar(value) {
	return unquote(stripHashComment(String(value ?? '')).trim()).trim();
}
