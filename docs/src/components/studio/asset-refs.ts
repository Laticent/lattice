// Find and rewrite `asset:<name>` references in a deck's markdown, leaving code alone. Pure: no storage, no DOM.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md §Editing a photo's metadata.
//
// WHY CODE IS LEFT ALONE. A deck that teaches the syntax shows `asset:hero` inside a fenced block or an inline
// code span. That text is documentation, and rewriting it to a new name would change what the slide says. Only a
// reference that renders — prose, an image, a front-matter value — is a reference.

// What counts as code, and so is left alone. It follows CommonMark where the answer is local and certain, and errs toward
// "prose" where it is not (a container, such as a list item, decides what an indented line means). A reference wrongly
// left alone keeps working through the photo's old name; one wrongly rewritten changes a code sample, so the rules below
// are the ones that can be decided from the line itself.
//   - a fenced block (``` or ~~~, any indentation), closed by a fence of the same mark and at least the same length;
//   - a top-level indented code block: four spaces or a tab, after a blank line, outside a list;
//   - an HTML <pre>, <code>, <script> or <style> element;
//   - an inline code span, which never crosses a blank line (a paragraph ends it).
// Every scan moves forward only, so the work is proportional to the length of the deck.

const FENCE_OPEN = /^(\s*)(`{3,}|~{3,})(.*)$/;
const LIST_MARKER = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const INDENTED = /^(?: {4,}|\t)/;

/** Run `fn` over every part of `source` that is not code. */
export function mapOutsideCode(source: string, fn: (prose: string) => string): string {
	const lines = source.split('\n');
	const out: string[] = [];
	let fence: { mark: string; len: number } | null = null;
	let paragraph: string[] = [];
	let prevBlank = true;
	let listy = false; // inside a list, where an indented line is list content, not code
	let codeRun = false; // inside an indented code block
	const flush = () => {
		if (!paragraph.length) return;
		out.push(...mapHtmlCode(paragraph.join('\n'), (t) => mapInlineCode(t, fn)).split('\n'));
		paragraph = [];
	};
	for (const line of lines) {
		if (fence) {
			out.push(line);
			const close = FENCE_OPEN.exec(line);
			if (close && close[2][0] === fence.mark && close[2].length >= fence.len && close[3].trim() === '') fence = null;
			continue;
		}
		if (line.trim() === '') {
			flush();
			out.push(line);
			prevBlank = true;
			continue;
		}
		const open = FENCE_OPEN.exec(line);
		// A backtick fence's info string may not contain a backtick (that would be an inline span, not a fence).
		if (open && !(open[2][0] === '`' && open[3].includes('`'))) {
			flush();
			out.push(line);
			fence = { mark: open[2][0], len: open[2].length };
			prevBlank = false;
			codeRun = false;
			continue;
		}
		if (INDENTED.test(line) && (codeRun || (prevBlank && !listy))) {
			flush();
			out.push(line);
			codeRun = true;
			prevBlank = false;
			continue;
		}
		codeRun = false;
		if (LIST_MARKER.test(line)) listy = true;
		else if (prevBlank && !INDENTED.test(line)) listy = false;
		paragraph.push(line);
		prevBlank = false;
	}
	flush();
	return out.join('\n');
}

/** Pass HTML <pre>, <code>, <script> and <style> elements through untouched, and run `fn` over the text between them.
 *  An opening tag with no closing tag one is plain text. Each tag's next position is looked up at most until it passes. */
function mapHtmlCode(text: string, fn: (prose: string) => string): string {
	if (!text.includes('<')) return fn(text);
	const lower = text.toLowerCase();
	const names = ['pre', 'code', 'script', 'style'];
	const next: Record<string, number> = {};
	let out = '';
	let i = 0;
	for (;;) {
		let at = -1;
		let which = '';
		for (const n of names) {
			if (next[n] === undefined || (next[n] !== -1 && next[n] < i)) next[n] = nextOpen(lower, n, i);
			if (next[n] !== -1 && (at === -1 || next[n] < at)) {
				at = next[n];
				which = n;
			}
		}
		if (at === -1) break;
		const close = lower.indexOf(`</${which}>`, at);
		if (close === -1) {
			next[which] = -1; // no closing tag anywhere after: this name is plain text from here on
			continue;
		}
		const end = close + which.length + 3;
		out += fn(text.slice(i, at)) + text.slice(at, end);
		i = end;
	}
	return out + fn(text.slice(i));
}

/** The next `<name` at or after `from` that is a whole tag name, or -1. */
function nextOpen(lower: string, name: string, from: number): number {
	const needle = `<${name}`;
	for (let i = lower.indexOf(needle, from); i !== -1; i = lower.indexOf(needle, i + needle.length)) {
		const c = lower[i + needle.length] ?? '>';
		if (c === '>' || c === '/' || c === ' ' || c === '\t' || c === '\n') return i;
	}
	return -1;
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
