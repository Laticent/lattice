/**
 * THE CARET'S LINE, CARRIED BETWEEN THE TWO EDITORS. Fuoco's focus holds the caret line's text as the reporting
 * editor saw it: the Markdown source sends the raw line (`## Revenue grew`), Compose sends the block's text
 * (`Revenue grew`). When the author switches editors, the editor that mounts puts its caret on the same line of the
 * focused slide instead of the slide's first line. Both sides compare a plain form: the line with its block markers
 * (heading, list, quote, task) and inline emphasis stripped. No match, or two lines with the same text, falls back to
 * the slide's start, which is what both editors did before.
 */

/**
 * A line's plain form and, for each of its characters, the column it came from in the raw line. The plain form is the
 * line with its block markers (quote, heading, list, task, number) and inline emphasis (`**` `__` `*` `_` `` ` `` `~~`)
 * removed and whitespace collapsed: what Compose shows for that Markdown line. The map is what lets the caret keep its
 * COLUMN across the two editors, not only its line (owner, iPhone, 2026-11-11).
 */
export function plainMap(line: string): { plain: string; raw: number[] } {
	let i = /^\s*(?:>\s*)*/.exec(line)?.[0].length ?? 0;
	i += /^(?:#{1,6}\s+|[-*+]\s+(?:\[[ xX]\]\s+)?|\d+[.)]\s+)/.exec(line.slice(i))?.[0].length ?? 0;
	const chars: string[] = [];
	const raw: number[] = [];
	while (i < line.length) {
		const marker = /^(?:\*\*|__|~~|\*|_|`)/.exec(line.slice(i, i + 2));
		if (marker) {
			i += marker[0].length;
			continue;
		}
		const c = line[i];
		if (/\s/.test(c)) {
			if (chars.length && chars[chars.length - 1] !== ' ') {
				chars.push(' ');
				raw.push(i);
			}
		} else {
			chars.push(c);
			raw.push(i);
		}
		i++;
	}
	while (chars.length && chars[chars.length - 1] === ' ') {
		chars.pop();
		raw.pop();
	}
	return { plain: chars.join(''), raw };
}

/** A line with its Markdown block markers and inline emphasis removed, whitespace collapsed. */
export function plainLine(line: string): string {
	return plainMap(line).plain;
}

/**
 * A caret column as the editor being left saw it: Compose's is already plain; Source's is a raw column in its Markdown
 * line, which the arriving editor converts (so the shell, on the startup path, needs none of this module).
 */
export type CarriedColumn = { col: number; raw?: string } | null;

/** A carried column in the plain form, or null. */
export function plainColumnOfCarried(c: CarriedColumn | undefined): number | null {
	if (!c) return null;
	return c.raw === undefined ? c.col : plainColumnOf(c.raw, c.col);
}

/** The caret's column in the plain form, for a caret at raw column `col` of `line` (Source to Compose). */
export function plainColumnOf(line: string, col: number): number {
	const { raw } = plainMap(line);
	let n = 0;
	while (n < raw.length && raw[n] < col) n++;
	return n;
}

/** The raw column of `line` for a caret at plain column `col` (Compose to Source): before that plain character, or
 *  just after the last one when the caret is at the end of the text. */
export function rawColumnFor(line: string, col: number): number {
	const { raw } = plainMap(line);
	if (!raw.length) return line.length;
	if (col <= 0) return raw[0];
	if (col >= raw.length) return raw[raw.length - 1] + 1;
	return raw[col];
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
