/**
 * THE CARET'S LINE, CARRIED BETWEEN THE TWO EDITORS. Fuoco's focus holds the caret line's text as the reporting
 * editor saw it: the Markdown source sends the raw line (`## Revenue grew`), Compose sends the block's text
 * (`Revenue grew`). When the author switches editors, the editor that mounts puts its caret on the same line of the
 * focused slide instead of the slide's first line. Both sides compare a plain form: the line with its block markers
 * (heading, list, quote, task) and inline emphasis stripped. No match, or two lines with the same text, falls back to
 * the slide's start, which is what both editors did before.
 */

/** A line with its Markdown block markers and inline emphasis removed, whitespace collapsed. */
export function plainLine(line: string): string {
	return line
		.replace(/^\s*(?:>\s*)*/, '')
		.replace(/^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/, '')
		.replace(/(\*\*|__|\*|_|`|~~)/g, '')
		.replace(/\s+/g, ' ')
		.trim();
}

/**
 * Where the caret goes in `source[from, end)` for a line whose plain form is `plainLine(line)`: the offset of that
 * line's first character, or -1 when no line matches, or more than one does (the caret would be a guess).
 */
export function lineOffsetIn(source: string, from: number, end: number, line: string): number {
	const want = plainLine(line);
	if (!want) return -1;
	let found = -1;
	let at = from;
	while (at < end) {
		const nl = source.indexOf('\n', at);
		const lineEnd = nl === -1 || nl > end ? end : nl;
		if (plainLine(source.slice(at, lineEnd)) === want) {
			if (found !== -1) return -1;
			found = at;
		}
		if (nl === -1) break;
		at = nl + 1;
	}
	return found;
}
