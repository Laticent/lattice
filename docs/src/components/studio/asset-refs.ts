// Find and rewrite `asset:<name>` references in a deck's markdown, leaving code alone. Pure: no storage, no DOM.
// Decision note: engineering/decisions/2026-10-12-library-media-assets.md § Rename can rewrite the decks.
//
// WHY CODE IS LEFT ALONE. A deck that teaches the syntax shows `asset:hero` inside a fenced block or an inline code span.
// That text is documentation, and rewriting it would change what the slide says. Only a reference that renders is a reference.
//
// THE PARSER DECIDES, NOT THIS FILE. Where a code block, an HTML block or a paragraph starts and ends is exactly what the engine's
// own markdown-it (the `commonmark` preset, HTML on, tables and strikethrough) says it is. An earlier version re-implemented those
// block rules by hand, and three independent reviews kept finding one more shape it read differently from the renderer (a table row,
// a setext heading, a fence in a list item). Now the block structure comes from `parse()`, and the only rule written here is how
// backticks pair inside ONE paragraph, which CommonMark defines as a run of N backticks closing at the next run of exactly N.
//
// A reference is something the renderer RESOLVES, so it is rewritten when it is
//   - a value in the front matter (`logo: asset:hero`);
//   - the destination of an image or link in a paragraph, heading, list item, quote or table cell, outside an inline code span
//     (`![](asset:hero)`, `[r]: asset:hero`);
//   - an attribute value inside an HTML tag (`<img src="asset:hero">`), which the engine resolves like any image.
// It is left alone as bare text (a sentence that mentions `asset:hero` is a mention, not a picture), in a fenced or indented code
// block, in the text of a raw HTML block (a `<pre>`, a `<script>`), and in an inline code span. If the references in a paragraph cannot be matched one-to-one with the parser's text for it, that paragraph is left
// alone: a reference wrongly left alone keeps working through the photo's old name, one wrongly rewritten changes a code sample.

import MarkdownIt from 'markdown-it';

let parser: MarkdownIt | null = null;
/** The engine's own configuration (lib/engine/index.js): the `commonmark` preset, raw HTML on, plus tables and strikethrough. */
const markdown = (): MarkdownIt => {
	parser ??= new MarkdownIt('commonmark', { html: true }).enable(['table', 'strikethrough']);
	return parser;
};

const FRONT_MATTER = /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/;
/** A whole name only: not `asset:hero-2`, and not `asset:hero.jpg`, which the grammar does not accept as a reference
 *  (lib/core/remote-ref.js `assetName`) and a deck that wrote it shows the stand-in either way. */
const refPattern = () => /\basset:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/gi;
/** An HTML start tag on one line. Only inside one is an `asset:` an attribute value; `var a = "asset:hero"` in a `<script>` is text. */
const HTML_TAG = /<[A-Za-z][^<>]*>/g;
/** The value of an attribute (`src="asset:x"`) or a CSS `url(asset:x)` inside a tag. */
const attrRefPattern = () => /((?:=\s*["'])|(?:url\(\s*["']?))asset:([A-Za-z0-9][A-Za-z0-9_-]*)(?![A-Za-z0-9_-]|\.[A-Za-z0-9])/gi;

/** Is the reference at `at` the destination of an image or link, or of a link reference definition? That is `](asset:…`, `]( asset:…`,
 *  `](<asset:…`, or `]: asset:…`. Anywhere else in running text it is a mention. */
function isDestination(text: string, at: number): boolean {
	let j = at - 1;
	if (text[j] === '<') j--;
	while (j >= 0 && (text[j] === ' ' || text[j] === '\t')) j--;
	return (text[j] === '(' || text[j] === ':') && text[j - 1] === ']';
}

/** The ranges `[start, end)` of the inline code spans in one paragraph's text: a run of N backticks closes at the next run of exactly
 *  N, and an unmatched run is plain text. A backslash before an OPENING backtick makes it a literal backtick (a closer needs no such
 *  check: backslashes are literal inside a span). One pass to list the runs, then a pointer per run length that only moves ahead. */
export function codeSpanRanges(text: string): [number, number][] {
	const out: [number, number][] = [];
	if (!text.includes('`')) return out;
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
	for (let k = 0; k < runs.length; k++) {
		let slashes = 0;
		for (let b = runs[k].at - 1; b >= 0 && text[b] === '\\'; b--) slashes++;
		if (slashes % 2 === 1) continue; // an escaped backtick is text, not an opener
		const list = byLen.get(runs[k].len) as number[];
		let p = ptr.get(runs[k].len) ?? 0;
		while (p < list.length && list[p] <= k) p++;
		ptr.set(runs[k].len, p);
		if (p >= list.length) continue; // no closer: plain text
		const close = runs[list[p]];
		out.push([runs[k].at, close.at + close.len]);
		k = list[p];
	}
	return out;
}

type Group = { first: number; last: number; flags: boolean[] };

/** `source` with every `asset:<from>` that renders rewritten to `asset:<to>`. Whole names only, case-insensitive like the grammar. */
export function renameAssetRefsOutsideCode(source: string, from: string, to: string): string {
	if (!/asset:/i.test(source)) return source;
	const want = from.toLowerCase();
	const swap = (whole: string, name: string) => (name.toLowerCase() === want ? `asset:${to}` : whole);

	const frontMatter = FRONT_MATTER.exec(source)?.[0] ?? '';
	const body = source.slice(frontMatter.length);
	const lines = body.split('\n');
	const tokens = markdown().parse(body, {});

	// What each line is, as the parser sees it. Default `prose`: a line no block claimed (a link reference definition) is a reference.
	const kind: ('prose' | 'code' | 'html' | 'group')[] = lines.map(() => 'prose');
	const groups = new Map<string, Group>();
	for (const t of tokens) {
		if (!t.map) continue;
		const [a, b] = t.map;
		if (t.type === 'fence' || t.type === 'code_block') for (let l = a; l < b; l++) kind[l] = 'code';
		else if (t.type === 'html_block') for (let l = a; l < b; l++) kind[l] = 'html';
		else if (t.type === 'inline') {
			// A table row is several inline tokens (one per cell) over the same lines, so they share one group, in order.
			const key = `${a}:${b}`;
			const group = groups.get(key) ?? { first: a, last: b, flags: [] };
			const spans = codeSpanRanges(t.content);
			for (const m of t.content.matchAll(refPattern())) {
				const at = m.index ?? 0;
				group.flags.push(isDestination(t.content, at) && !spans.some(([s, e]) => at >= s && at < e));
			}
			groups.set(key, group);
			for (let l = a; l < b; l++) kind[l] = 'group';
		}
	}

	const byFirstLine = new Map<number, Group>();
	for (const g of groups.values()) byFirstLine.set(g.first, g);

	const out: string[] = [];
	for (let l = 0; l < lines.length; l++) {
		const line = lines[l];
		if (kind[l] === 'prose') {
			// A line no block claimed (a link reference definition): only a destination is a reference.
			out.push(line.replace(refPattern(), (whole, name: string, at: number) => (isDestination(line, at) ? swap(whole, name) : whole)));
		} else if (kind[l] === 'html') {
			// The text of a raw HTML block is not markdown, so a `<pre>` or `<script>` sample stays; an attribute value inside a
			// tag is a real reference.
			out.push(line.replace(HTML_TAG, (tag) => tag.replace(attrRefPattern(), (whole, pre: string, name: string) => (name.toLowerCase() === want ? `${pre}asset:${to}` : whole))));
		} else if (kind[l] === 'group') {
			const g = byFirstLine.get(l);
			if (!g) continue; // a later line of a group already emitted
			const text = lines.slice(g.first, g.last).join('\n');
			const found = [...text.matchAll(refPattern())].length;
			if (found !== g.flags.length) {
				// The parser's text and the source disagree on how many references there are: leave the paragraph alone.
				for (const original of lines.slice(g.first, g.last)) out.push(original);
				continue;
			}
			let n = 0;
			const rewritten = text.replace(refPattern(), (whole, name: string, at: number) => (g.flags[n++] && isDestination(text, at) ? swap(whole, name) : whole));
			for (const piece of rewritten.split('\n')) out.push(piece);
		} else {
			out.push(line);
		}
	}
	return frontMatter.replace(refPattern(), swap) + out.join('\n');
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
