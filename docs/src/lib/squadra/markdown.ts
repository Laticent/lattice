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
// `plugin-block` (a block a host's parser rule claimed, its token type in `attrs.type`). When the model
// lists its containers (`containers`), they are nodes too and the blocks nest inside them: `list`
// (`attrs.ordered`) → `item`, `quote`, and `table` → `row`. Every block keeps `attrs.level`, its
// depth in markdown-it's token stream. A model without `containers` gives the blocks flat under their
// slide, in document order.
//
// SPANS ARE LINE-GRANULAR. The model records line ranges, so a block's span runs from the start of
// its first line to the end of its last: a paragraph in a list item takes in the `- ` before it, and a
// table row is the finest table unit (markdown-it maps no cell). Finer spans come from the S2 and S3
// passes that read inside a line.
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
	/** The line ranges of lists, items, quotes, tables and rows (`bullet_list`, `ordered_list`, `list_item`, `blockquote`, `table`, `tr`). Optional. */
	readonly containers?: readonly MarkdownRange[];
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
const CONTAINER_KIND: Readonly<Record<string, string>> = {
	bullet_list: 'list',
	ordered_list: 'list',
	list_item: 'item',
	blockquote: 'quote',
	table: 'table',
	tr: 'row',
};
const KINDS = ['deck', 'front-matter', 'slide', 'break', 'paragraph', 'heading', 'cell', 'fence', 'code-block', 'comment', 'html-block', 'plugin-block', 'list', 'item', 'quote', 'table', 'row'];

/** A node under construction: its kids are filled in by `nest`. */
type Open = Node & { kids: Node[]; readonly container: boolean; readonly level: number };

/**
 * Nest a slide's blocks inside its containers. A node goes under the innermost container that holds
 * its span and sits shallower in the token stream; the sort puts a container before what it holds
 * when both start on one line (wider first, then shallower).
 */
function nest(nodes: Open[]): Node[] {
	nodes.sort((a, b) => a.from - b.from || b.to - a.to || a.level - b.level);
	const top: Node[] = [];
	const stack: Open[] = [];
	for (const n of nodes) {
		while (stack.length) {
			const p = stack[stack.length - 1];
			if (p.from <= n.from && n.to <= p.to && p.level < n.level) break;
			stack.pop();
		}
		(stack.length ? stack[stack.length - 1].kids : top).push(n);
		if (n.container) stack.push(n);
	}
	return top;
}

/**
 * Model offsets back onto the text the host handed over. S0 strips a leading BOM and folds `\r\n`
 * to `\n` (a lone `\r` becomes `\n` in place, which moves nothing). `removed` lists, in model
 * offsets, where a source character was dropped. A model offset that sits at a dropped `\r` (the
 * `\n` of a `\r\n`, which is where an empty line starts and a line ends) maps BEFORE the `\r`, for
 * a span's start and end alike: a line's span never takes in its `\r`, and no span starts between
 * the two characters of a `\r\n`, where an insert would split the line end. The BOM is dropped at
 * offset 0 and maps past, so no span starts before it.
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
	const bom = source.charCodeAt(0) === 0xfeff ? 1 : 0;
	return (offset) => {
		let lo = bom;
		let hi = removed.length;
		while (lo < hi) {
			const mid = (lo + hi) >> 1;
			if (removed[mid] < offset) lo = mid + 1;
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
			const rangeNode = (kind: string, r: MarkdownRange, attrs: Record<string, string | number | boolean> = {}, container = false): Open => {
				let last = r.toLine - 1;
				// A range can take in the blank lines that end it (markdown-it's map does for a list, and for a comment block
				// its container ends); the span stops at the block's text, so it stays inside its container's.
				while (last > r.fromLine && !model.text.slice(base + model.lineStart(last), base + model.lineEnd(last)).trim()) last--;
				return {
					kind,
					from: lineFrom(r.fromLine),
					to: r.toLine > r.fromLine ? lineTo(last) : lineFrom(r.fromLine),
					kids: [],
					attrs: { level: r.level, ...attrs },
					container,
					level: r.level,
				};
			};
			const perSlide: Open[][] = model.slides.map(() => []);
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
			for (const r of model.containers ?? []) {
				const kind = CONTAINER_KIND[r.type];
				if (kind) perSlide[r.slide]?.push(rangeNode(kind, r, kind === 'list' ? { ordered: r.type === 'ordered_list' } : {}, true));
			}
			inertSpans.sort((a, b) => a.from - b.from);

			const kids: Node[] = [];
			const header = base > 0 ? { from: 0, to: at(base, true) } : null;
			if (header) kids.push({ kind: 'front-matter', from: header.from, to: header.to, kids: [] });
			const slideNodes: Node[] = [];
			model.slides.forEach((s, index) => {
				if (s.sepLine >= 0) kids.push({ kind: 'break', from: lineFrom(s.sepLine), to: lineTo(s.sepLine), kids: [] });
				const from = lineFrom(s.fromLine);
				const to = s.toLine > s.fromLine ? lineTo(s.toLine - 1) : from;
				const node: Node = { kind: 'slide', from, to, kids: nest(perSlide[index]), attrs: { index } };
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
