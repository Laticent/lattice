// Find and rewrite `asset:<name>` references in a deck's markdown, leaving code alone. Pure: no storage, no DOM.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.
//
// WHY CODE IS LEFT ALONE. A deck that teaches the syntax shows `asset:hero` inside a fenced block or an inline
// code span. That text is documentation, and rewriting it to a new name would change what the slide says. Only a
// reference that renders — prose, an image, a front-matter value — is a reference.

// What counts as code, and so is left alone. It follows CommonMark's BLOCK rules, because that is what decides where a code span
// can start and end, and errs toward "prose" where a container (a list item, a quote) makes a line's meaning uncertain: a
// reference wrongly left alone keeps working through the photo's old name, while one wrongly rewritten changes a code sample.
//   - a fenced block (``` or ~~~): closed by a fence of the same mark and at least the same length. A fence opened inside a list
//     item ends when the item does (a later line indented less than the fence), and one opened at the top level runs to the end;
//   - a top-level indented code block: four spaces or a tab after a blank line, outside a list;
//   - an HTML block that starts a line with <pre>, <script>, <style> or <textarea>: raw text up to the line holding its closing
//     tag, blank lines included. (An inline <code> in a sentence is NOT code here: markdown inside it still renders.)
//   - an inline code span, which never crosses a block boundary: a blank line, a list item, a heading, a quote or a rule ends it.
// Every scan moves forward only, so the work is proportional to the length of the deck.

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;
const LIST_MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const INDENTED = /^(?: {4,}|\t)/;
const ATX_HEADING = /^ {0,3}#{1,6}(?:\s|$)/;
const THEMATIC_BREAK = /^ {0,3}([-*_])(?: *\1){2,} *$/;
const QUOTE = /^ {0,3}>/;
const HTML_RAW_OPEN = /^ {0,3}<(pre|script|style|textarea)(?:[\s>]|$)/i;

const indentOf = (line: string): number => line.length - line.trimStart().length;
/** A line that begins a new block, so an inline code span cannot reach across it. */
const startsBlock = (line: string): boolean => LIST_MARKER.test(line) || ATX_HEADING.test(line) || THEMATIC_BREAK.test(line) || QUOTE.test(line);

/** Run `fn` over every part of `source` that is not code. */
export function mapOutsideCode(source: string, fn: (prose: string) => string): string {
	const lines = source.split('\n');
	const out: string[] = [];
	let fence: { mark: string; len: number; indent: number } | null = null;
	let rawHtml: string | null = null; // the closing tag a raw HTML block waits for
	let paragraph: string[] = [];
	let prevBlank = true;
	let prevHeading = false;
	let listy = false; // inside a list, where an indented line is list content, not code
	let codeRun = false; // inside an indented code block
	const flush = () => {
		if (!paragraph.length) return;
		// A loop, not `out.push(...lines)`: spreading a very long block into arguments overflows the call stack.
		for (const l of mapInlineCode(paragraph.join('\n'), fn).split('\n')) out.push(l);
		paragraph = [];
	};
	for (const line of lines) {
		if (rawHtml) {
			out.push(line);
			if (line.toLowerCase().includes(rawHtml)) rawHtml = null;
			continue;
		}
		if (fence) {
			const close = FENCE_OPEN.exec(line);
			const closes = close && close[2][0] === fence.mark && close[2].length >= fence.len && close[3].trim() === '';
			// A fence inside a list item ends where the item does: a later line indented less than the fence.
			if (!closes && fence.indent >= 2 && line.trim() !== '' && indentOf(line) < fence.indent) {
				fence = null;
			} else {
				out.push(line);
				if (closes) fence = null;
				continue;
			}
		}
		if (line.trim() === '') {
			flush();
			out.push(line);
			prevBlank = true;
			prevHeading = false;
			continue;
		}
		const open = FENCE_OPEN.exec(line);
		const fenceIndent = open ? open[1].length : 0;
		// A backtick fence's info string may not contain a backtick (that would be an inline span, not a fence). An indent of four
		// or more is a fence only inside a list; at the top level it is an indented code block or a lazy line of a paragraph.
		if (open && !(open[2][0] === '`' && open[3].includes('`')) && (fenceIndent <= 3 || listy)) {
			flush();
			out.push(line);
			fence = { mark: open[2][0], len: open[2].length, indent: fenceIndent };
			prevBlank = false;
			prevHeading = false;
			codeRun = false;
			continue;
		}
		const raw = HTML_RAW_OPEN.exec(line);
		if (raw) {
			flush();
			out.push(line);
			const closing = `</${raw[1].toLowerCase()}>`;
			if (!line.toLowerCase().includes(closing)) rawHtml = closing;
			prevBlank = false;
			prevHeading = false;
			codeRun = false;
			continue;
		}
		if (INDENTED.test(line) && (codeRun || (prevBlank && !listy))) {
			flush();
			out.push(line);
			codeRun = true;
			prevBlank = false;
			prevHeading = false;
			continue;
		}
		codeRun = false;
		if (LIST_MARKER.test(line)) listy = true;
		else if (prevBlank && !INDENTED.test(line)) listy = false;
		// A list item, a heading, a quote or a rule starts a new block, and the line after a heading does too.
		if (startsBlock(line) || prevHeading) flush();
		paragraph.push(line);
		prevHeading = ATX_HEADING.test(line);
		if (prevHeading) flush();
		prevBlank = false;
	}
	flush();
	return out.join('\n');
}

/** Inline code spans: a run of N backticks closes at the next run of exactly N, and an unmatched run is plain text.
 *  One pass to list the backtick runs, then each opener looks forward for its closer with a pointer that only moves ahead. */
function mapInlineCode(text: string, fn: (prose: string) => string): string {
	if (!text.includes('`')) return fn(text);
	const runs: { at: number; len: number }[] = [];
	for (let i = 0; i < text.length; ) {
		if (text[i] !== '`') {
			i++;
			continue;
		}
		let j = i;
		while (text[j] === '`') j++;
		runs.push({ at: i, len: j - i });
		i = j;
	}
	const byLen = new Map<number, number[]>();
	for (let idx = 0; idx < runs.length; idx++) {
		const list = byLen.get(runs[idx].len);
		if (list) list.push(idx);
		else byLen.set(runs[idx].len, [idx]);
	}
	const ptr = new Map<number, number>();
	let out = '';
	let last = 0;
	for (let k = 0; k < runs.length; k++) {
		const list = byLen.get(runs[k].len) as number[];
		let p = ptr.get(runs[k].len) ?? 0;
		while (p < list.length && list[p] <= k) p++;
		ptr.set(runs[k].len, p);
		if (p >= list.length) continue; // no closer: plain text
		const close = runs[list[p]];
		out += fn(text.slice(last, runs[k].at)) + text.slice(runs[k].at, close.at + close.len);
		last = close.at + close.len;
		k = list[p];
	}
	return out + fn(text.slice(last));
}

/** `source` with every `asset:<from>` that renders rewritten to `asset:<to>`. Whole names only (`asset:hero-2` is
 *  untouched when renaming `hero`), case-insensitive like the grammar, and never inside code. */
export function renameAssetRefsOutsideCode(source: string, from: string, to: string): string {
	if (!/asset:/i.test(source)) return source;
	const want = from.toLowerCase();
	// A whole name only: not `asset:hero-2`, and not `asset:hero.jpg`, which the grammar does not accept as a reference
	// (lib/core/remote-ref.js `assetName`) and a deck that wrote it shows the stand-in either way.
	const ref = /\basset:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/gi;
	return mapOutsideCode(source, (prose) => prose.replace(ref, (whole, name: string) => (name.toLowerCase() === want ? `asset:${to}` : whole)));
}

/** Does `source` write `asset:<name>` anywhere that renders? The same test the rewrite uses, so a count of decks that
 *  "still use the old name" is exactly the decks the rewrite would change. */
export function usesAssetOutsideCode(source: string, name: string): boolean {
	return renameAssetRefsOutsideCode(source, name, `${name}-x`) !== source;
}

/** How many of `sources` write `asset:<name>` anywhere that renders. */
export function decksUsingOutsideCode(name: string, sources: readonly string[]): number {
	return sources.filter((s) => usesAssetOutsideCode(s, name)).length;
}
