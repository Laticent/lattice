// The reference Markdown language (design §5.6), the `@laticent/squadra/markdown` entry.
//
// Squadra writes no Markdown parser. It adapts a DECK MODEL, the document model the Segno deck
// pipeline builds (S0 and S1: ingest, front matter, the CommonMark block pass, slides), into
// Squadra's node shape. The model arrives from the host as a function, so Squadra keeps its "no
// dependencies" promise: Lattice hands in `@laticent/segno-markdown`'s `deckModel` configured as its
// engine parses (lib/core/deck-model.mjs), and another host can hand in any parser that answers the
// same questions (`MarkdownModel` below).
//
// WHAT THE TREE HOLDS. `deck` → an optional `front-matter`, then one `slide` per chunk between two
// top-level thematic breaks, with the `break` between them. Inside a slide, every block the model
// records as a range: `paragraph`, `heading` and `cell` (the inline text of a paragraph, a heading or
// a table cell), `fence`, `code-block`, `comment` (an HTML comment block), `html-block`, and
// `plugin-block` (a block a host's parser rule claimed, its token type in `attrs.type`). They sit flat under their
// slide in document order, with `attrs.level` saying how deep in lists and quotes each one is.
// Containers (lists, items, quotes, tables) are not nodes yet: the model's range views do not
// expose them, and no migrated rule reads them. They join when one does.
//
// OFFSETS. Every span indexes `Source.text`. Design §5.7 asks the host to hand over S0 text (no
// BOM, LF line ends); when a host does not, this language maps the model's offsets back onto the
// text it was given, so a finding still lands on the author's characters.
//
// INERT. Fenced and indented code blocks, as the model reads them, which is markdown-it's reading
// token for token. A language built on this one may add more (lattice-deck does not, yet).

import type { Language, Node, Shape, Source, Span } from './types.js';

/** A body-line range the model records: a fence, a comment block, a leaf, a plugin block. */
export interface MarkdownRange {
	/** markdown-it's token type: `fence`, `code_block`, `html_block`, `paragraph`, `heading`, `td`, `math_block`, … */
	readonly type: string;
	readonly fromLine: number;
	/** One past the last line, as markdown-it's `token.map` ends. */
	readonly toLine: number;
	/** markdown-it's `token.level`: 0 at the top of a slide. */
	readonly level: number;
	/** The slide it sits in, an index into `slides`. */
	readonly slide: number;
}

export interface MarkdownSlide {
	readonly fromLine: number;
	readonly toLine: number;
	/** The line of the break that opens the slide, or -1 for the first. */
	readonly sepLine: number;
}

/** What this language asks of a deck model: `@laticent/segno-markdown`'s `DeckModel` answers it. */
export interface MarkdownModel {
	/** The S0 text every offset below indexes. */
	readonly text: string;
	/** Where the body starts in `text` (the front matter's length, or 0). */
	readonly bodyStart: number;
	/** Every chunk between two top-level breaks, the empty leading one included. */
	readonly slides: readonly MarkdownSlide[];
	/** The body opens with a break, so the engine renders no slide for the empty chunk before it. */
	readonly leadingEmpty?: boolean;
	/** HTML comment blocks. */
	readonly directives: readonly MarkdownRange[];
	/** Every other HTML block. */
	readonly html: readonly MarkdownRange[];
	/** Fenced and indented code blocks. */
	readonly fences: readonly MarkdownRange[];
	/** Blocks a plugin rule claimed. */
	readonly plugins: readonly MarkdownRange[];
	/** The inline text of paragraphs, headings and table cells. */
	readonly leaves: readonly MarkdownRange[];
	/** Offset in the body where a body line starts, and where it ends (its `\n`). */
	lineStart(line: number): number;
	lineEnd(line: number): number;
	/** A fence's info string. */
	fenceInfo?(range: MarkdownRange): string;
}

/** The tree this language returns: a `deck` node that also carries the model it was read from. */
export interface MarkdownTree extends Node {
	readonly model: MarkdownModel;
	/** Model offsets → `Source.text` offsets (identity when the host handed over S0 text). */
	readonly at: (offset: number, end?: boolean) => number;
	readonly inertSpans: readonly Span[];
	readonly header: Span | null;
	readonly slideNodes: readonly Node[];
}

export interface MarkdownLanguageOptions {
	/** Builds the model of a source's text. */
	readonly model: (text: string) => MarkdownModel;
	/** Defaults to `markdown`. A language that builds on this one passes its own. */
	readonly id?: string;
	readonly version?: string;
}

const BLOCK_KIND: Readonly<Record<string, string>> = {
	paragraph: 'paragraph',
	heading: 'heading',
	th: 'cell',
	td: 'cell',
	inline: 'paragraph',
	fence: 'fence',
	code_block: 'code-block',
	html_block: 'html-block',
};
const KINDS = ['deck', 'front-matter', 'slide', 'break', 'paragraph', 'heading', 'cell', 'fence', 'code-block', 'comment', 'html-block', 'plugin-block'];

/**
 * Model offsets back onto the text the host handed over. S0 strips a leading BOM and folds `\r\n`
 * to `\n` (a lone `\r` becomes `\n` in place, which moves nothing). `removed` lists, in model
 * offsets, where a source character was dropped; a span's start maps past a dropped `\r` and its
 * end stops before one, so a line's span never takes in its `\r`.
 */
function offsetMap(source: string, folded: string): (offset: number, end?: boolean) => number {
	if (source === folded) return (o) => o;
	const removed: number[] = [];
	let i = 0;
	let o = 0;
	if (source.charCodeAt(0) === 0xfeff) {
		removed.push(0);
		i = 1;
	}
	for (; i < source.length; i++, o++) {
		if (source.charCodeAt(i) === 13 && source.charCodeAt(i + 1) === 10) {
			removed.push(o);
			i++;
		}
	}
	return (offset, end = false) => {
		let lo = 0;
		let hi = removed.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (end ? removed[mid] < offset : removed[mid] <= offset) lo = mid + 1;
			else hi = mid;
		}
		return offset + lo;
	};
}

/** The reference Markdown language over a host's deck model. */
export function markdownLanguage(opts: MarkdownLanguageOptions): Language<MarkdownTree> {
	return {
		id: opts.id ?? 'markdown',
		version: opts.version ?? '1',
		kinds: KINDS,
		parse(source: Source) {
			const model = opts.model(source.text);
			const at = offsetMap(source.text, model.text);
			const base = model.bodyStart;
			const lineFrom = (line: number) => at(base + model.lineStart(line));
			const lineTo = (line: number) => at(base + model.lineEnd(line), true);
			const rangeNode = (kind: string, r: MarkdownRange, attrs: Record<string, string | number> = {}): Node => ({
				kind,
				from: lineFrom(r.fromLine),
				to: r.toLine > r.fromLine ? lineTo(r.toLine - 1) : lineFrom(r.fromLine),
				kids: [],
				attrs: { level: r.level, ...attrs },
			});
			const perSlide: Node[][] = model.slides.map(() => []);
			const inertSpans: Span[] = [];
			for (const r of model.fences) {
				const n = rangeNode(BLOCK_KIND[r.type] ?? 'fence', r, r.type === 'fence' && model.fenceInfo ? { info: model.fenceInfo(r) } : {});
				perSlide[r.slide]?.push(n);
				if (n.to > n.from) inertSpans.push({ from: n.from, to: n.to });
			}
			for (const r of model.directives) perSlide[r.slide]?.push(rangeNode('comment', r));
			for (const r of model.html) perSlide[r.slide]?.push(rangeNode('html-block', r));
			for (const r of model.plugins) perSlide[r.slide]?.push(rangeNode('plugin-block', r, { type: r.type }));
			for (const r of model.leaves) perSlide[r.slide]?.push(rangeNode(BLOCK_KIND[r.type] ?? 'paragraph', r));
			inertSpans.sort((a, b) => a.from - b.from);

			const kids: Node[] = [];
			const header = base > 0 ? { from: 0, to: at(base, true) } : null;
			if (header) kids.push({ kind: 'front-matter', from: header.from, to: header.to, kids: [] });
			const slideNodes: Node[] = [];
			model.slides.forEach((s, index) => {
				if (s.sepLine >= 0) kids.push({ kind: 'break', from: lineFrom(s.sepLine), to: lineTo(s.sepLine), kids: [] });
				const from = lineFrom(s.fromLine);
				const to = s.toLine > s.fromLine ? lineTo(s.toLine - 1) : from;
				const blocks = perSlide[index].sort((a, b) => a.from - b.from || a.to - b.to);
				const node: Node = { kind: 'slide', from, to, kids: blocks, attrs: { index } };
				slideNodes.push(node);
				kids.push(node);
			});
			const tree: MarkdownTree = { kind: 'deck', from: 0, to: source.text.length, kids, model, at, inertSpans, header, slideNodes };
			return { tree, errors: [] };
		},
		inert(tree) {
			return tree.inertSpans;
		},
		shape(tree, source): Shape {
			return { units: tree.slideNodes.length, header: tree.header, inert: tree.inertSpans.map((s) => source.text.slice(s.from, s.to)) };
		},
		facts: {
			/** The number of chunks between breaks (the slides as authored, the empty leading one included). */
			'deck.slides': (tree) => tree.slideNodes.length,
		},
		locate(tree, span) {
			const slides = tree.slideNodes;
			let lo = 0;
			let hi = slides.length - 1;
			if (hi < 0 || (tree.header && span.from < tree.header.to)) return { slide: 0 };
			while (lo < hi) {
				const mid = (lo + hi + 1) >> 1;
				if (slides[mid].from <= span.from) lo = mid;
				else hi = mid - 1;
			}
			return { slide: lo + 1 };
		},
	};
}
