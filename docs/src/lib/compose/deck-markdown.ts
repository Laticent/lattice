import MarkdownIt from 'markdown-it';
import {
	defaultMarkdownParser,
	defaultMarkdownSerializer,
	MarkdownParser,
	MarkdownSerializer,
	MarkdownSerializerState,
	schema as mdSchema,
} from 'prosemirror-markdown';
import { type NodeSpec, type Node as PMNode, Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';
import { commentBlockRule, commentNodeSpec } from './comment-block';

// The deck-model library core — Lattice slide prose ⟷ ProseMirror document,
// LOSSLESS. This is the foundation the Compose editor (Option B, one true
// document) rests on, and the reason we moved off Lexical: ProseMirror's
// markdown layer is markdown-it based, so it parses and re-emits NESTED lists —
// a KPI/cards/stats slide's `- ` detail lines under a numbered item — without
// flattening them, which the Lexical round-trip could not do.
//
// Cadenza-shaped: pure, framework-free, owns no DOM — text in, a typed doc out,
// text back. The editor view (prosemirror-view) and the Quiet Page chrome are
// built ON this; they never re-implement the round-trip.
//
// Deviations from ProseMirror's defaults:
//  - bullets serialize as `-` (the Lattice house marker, HARD RULE #5's card grammar);
//  - thematic breaks serialize as `***` (a bare `---` is the slide separator);
//  - GFM TABLES are modeled as real schema nodes and round-tripped to pipe syntax
//    (2026-07-19-compose-table-editing.md), so a table slide is edited in place
//    instead of being locked read-only. LFM state markers (`[x] [-] [ ] [/]`) and
//    literal pipes inside cells survive byte-stable.

// biome-ignore lint/suspicious/noExplicitAny: prosemirror-markdown's serializer state is loosely typed upstream; we mirror its own node signatures.
type SerializerState = any;

// ── Table nodes ───────────────────────────────────────────────────────────────
// prosemirror-tables' node set, with GFM-single-line cells (`inline*`, not the
// default `block+`) and a per-cell `align` attr carrying GFM column alignment. We
// deliberately do NOT enable colwidth-carrying resize or cell merging: neither is
// expressible in GFM, so allowing them would silently break the round-trip (see
// the design doc, Axis B). colspan/rowspan/colwidth still exist on the cell spec
// (the module manages them) but stay at their defaults and never serialize.
const composeTableNodes = tableNodes({
	tableGroup: 'block',
	cellContent: 'inline*',
	cellAttributes: {
		align: {
			default: null,
			getFromDOM: (dom) => (dom as HTMLElement).style.textAlign || null,
			setDOMAttr: (value, attrs) => {
				if (value) attrs.style = `text-align:${value}`;
			},
		},
	},
});

// ── Code blocks keep the author's fence ──────────────────────────────────────
// prosemirror-markdown's `code_block` carries the info string (`params`) and nothing
// about the fence that wrapped it, and its serializer writes backticks for every block.
// So a `~~~mermaid` fence came back as ```mermaid on the first edit of its slide — the
// same render, the same body, different bytes in a file the author wrote on purpose
// (examples/mermaid-tilde-fences.md). `marker` is the opener exactly as written (`~~~`,
// ```` ```` ````); empty means "no preference" — an indented block, or a fence the insert
// door made — and serializes the upstream way.
const FENCE_MARKER = /^(`{3,}|~{3,})$/;
const mdCodeBlock = mdSchema.spec.nodes.get('code_block') as NodeSpec;
const codeBlockSpec: NodeSpec = {
	...mdCodeBlock,
	attrs: { params: { default: '' }, marker: { default: '' } },
	// The clipboard contract (see deck-doc's slide spec): an attr `toDOM`/`parseDOM` do
	// not carry is an attr a paste re-creates at its default.
	parseDOM: [
		{
			tag: 'pre',
			preserveWhitespace: 'full',
			getAttrs: (dom: HTMLElement) => {
				const marker = dom.getAttribute('data-marker') || '';
				return { params: dom.getAttribute('data-params') || '', marker: FENCE_MARKER.test(marker) ? marker : '' };
			},
		},
	],
	toDOM(node) {
		const attrs: Record<string, string> = {};
		if (node.attrs.params) attrs['data-params'] = node.attrs.params as string;
		if (node.attrs.marker) attrs['data-marker'] = node.attrs.marker as string;
		return ['pre', attrs, ['code', 0]];
	},
};

/** The fence to write around `body`: the author's own marker, lengthened only when a
 *  body line could be read as its CLOSER — a run of the same character at least as long,
 *  then only whitespace.
 *
 *  ANY indent counts, deliberately wider than CommonMark's zero-to-three spaces: Compose's
 *  own fence scanner (`fenceRanges`, slide-directives.ts) reads an indented run as a
 *  closer too, and that scanner decides which slides lock and which directives hoist. A
 *  fence it mis-closes would leave math after it unlocked. Lengthening one line too often
 *  costs nothing; the upstream serializer lengthened on any run at all. */
export function fenceFor(marker: string, body: string): string {
	const char = marker[0];
	let len = marker.length;
	const closer = char === '~' ? /^[ \t]*(~{3,})[ \t]*$/ : /^[ \t]*(`{3,})[ \t]*$/;
	for (const line of body.split('\n')) {
		const m = closer.exec(line);
		if (m && m[1].length >= len) len = m[1].length + 1;
	}
	return char.repeat(len);
}

/** The prose schema — prosemirror-markdown's block/mark set PLUS the table nodes and the
 *  authoring-comment atom. `deckSchema` (deck-doc) is built by wrapping THIS schema's nodes in a
 *  slide node, so every node spec is identical on both sides of the JSON bridge. */
export const proseSchema = new Schema({
	nodes: mdSchema.spec.nodes.update('code_block', codeBlockSpec).append(composeTableNodes).addToEnd('comment', commentNodeSpec),
	marks: mdSchema.spec.marks,
});

// ── Parser ─────────────────────────────────────────────────────────────────────
// A dedicated markdown-it (CommonMark preset + `table` ONLY — strikethrough,
// tasklists, etc. stay locked for now) plus token→node rules for the GFM table.
// `thead`/`tbody` are transparent (`ignore`), so their child rows attach directly
// to the `table` node, matching prosemirror-tables' flat `table → table_row+` shape.
const tableTokenizer = new MarkdownIt('commonmark', { html: false }).enable('table').use(commentBlockRule);

// biome-ignore lint/suspicious/noExplicitAny: markdown-it Token is loosely typed upstream.
function alignAttrs(token: any) {
	const style: string = token.attrGet?.('style') || '';
	const m = /text-align:(left|center|right)/.exec(style);
	return { align: m ? m[1] : null };
}

/** The Lattice markdown parser — Lattice slide prose → ProseMirror document. */
export const latticeMarkdownParser = new MarkdownParser(proseSchema, tableTokenizer, {
	...defaultMarkdownParser.tokens,
	// `markup` is the opening run exactly as written — `~~~`, ```` ``` ````, ```` ```` ````.
	fence: { block: 'code_block', getAttrs: (tok) => ({ params: tok.info || '', marker: tok.markup || '' }), noCloseToken: true },
	table: { block: 'table' },
	// The whole `<!-- … -->` arrives as one token; its `content` is the source bytes.
	lattice_comment: { node: 'comment', getAttrs: (tok) => ({ text: tok.content }) },
	thead: { ignore: true },
	tbody: { ignore: true },
	tr: { block: 'table_row' },
	th: { block: 'table_header', getAttrs: alignAttrs },
	td: { block: 'table_cell', getAttrs: alignAttrs },
});

// ── Serializer ───────────────────────────────────────────────────────────────
const DELIM: Record<string, string> = { left: ':---', center: ':---:', right: '---:', null: '---' };

// The serializer state's constructor and `out` buffer are typed `@internal` upstream, but are
// the documented way to render a fragment to a string; reach them through a minimal surface.
const SubState = MarkdownSerializerState as unknown as new (
	nodes: SerializerState,
	marks: SerializerState,
	options: SerializerState,
) => { renderInline(n: PMNode): void; out: string };

/** Serialize one cell's inline content to a single GFM-safe line. */
function serializeCell(state: SerializerState, cell: PMNode): string {
	// A throwaway sub-state renders just this cell's inline content to a string
	// (the main state writes to one shared buffer, so it can't be reused per-cell).
	const sub = new SubState(state.nodes, state.marks, state.options);
	sub.renderInline(cell);
	let out = sub.out.replace(/\n+/g, ' ').trim();
	// Un-escape ONLY a leading LFM state marker's brackets — the engine's exact
	// `^\[([x-/ ])\]` shape — so `[x] [-] [ ] [/]` survive verbatim. Every OTHER escaped
	// bracket stays escaped: a user's `\[literal\]` or an escaped `\[text\](url)` must NOT
	// silently become a live link/image (checker Bug 2).
	out = out.replace(/^\\\[([x\-/ ])\\\]/, '[$1]');
	// GFM: a raw pipe splits cells, so escape every literal pipe. Match any run of backslashes
	// BEFORE the pipe and carry them through, so the escape covers the whole escape sequence — a
	// bare `replace(/\|/g, …)` would be an INCOMPLETE escape (it ignores a preceding backslash, so
	// a literal `x\|y`, rendered `x\\|y`, would keep its pipe raw and split the cell — checker Bug 1
	// / CodeQL js/incomplete-sanitization). `renderInline` never emits a syntactic `\|`, so every
	// pipe here is literal; prefixing one backslash to `(\\*)|` yields the correct GFM escape.
	out = out.replace(/(\\*)\|/g, (match) => `\\${match}`);
	return out;
}

/** Serialize a whole `table` node to GFM pipe syntax (header row, delimiter row,
 *  body rows). Rendered in one pass because the delimiter row needs the column
 *  count + alignment from the header row. */
function serializeTable(state: SerializerState, node: PMNode) {
	const rows: string[][] = [];
	node.forEach((row: PMNode) => {
		const cells: string[] = [];
		row.forEach((cell: PMNode) => {
			cells.push(serializeCell(state, cell));
		});
		rows.push(cells);
	});
	if (!rows.length) return;
	const aligns: (string | null)[] = [];
	node.firstChild?.forEach((cell: PMNode) => {
		aligns.push(cell.attrs.align as string | null);
	});
	const line = (cells: string[]) => `| ${cells.join(' | ')} |`;
	state.write(`${line(rows[0])}\n`);
	state.write(`${line(aligns.map((a) => DELIM[a ?? 'null'] || '---'))}\n`);
	for (let i = 1; i < rows.length; i++) {
		state.write(line(rows[i]));
		if (i < rows.length - 1) state.write('\n');
	}
	state.closeBlock(node);
}

const latticeNodes = {
	...defaultMarkdownSerializer.nodes,
	// Bullet lists use `-` (Lattice), not the default `*`. Same 2-space continuation
	// indent, so nesting under an ordered item stays at the `   - ` depth the engine
	// reads. (renderList's second arg is the child-line indent.)
	bullet_list(state: SerializerState, node: PMNode) {
		state.renderList(node, '  ', () => `${(node.attrs.bullet as string) || '-'} `);
	},
	// A thematic break serializes as `***`, never the default `---` — but the REASON given
	// here was wrong, and correcting it matters more than the choice it justified.
	//
	// It said `***` "is an equivalent `<hr>` that the separator regex can never match", i.e.
	// a form an author could use without it degrading into a slide split. That was true of
	// the old caller-side splitter and false of the ENGINE: `splitOnHr` breaks on every
	// top-level markdown-it `hr`, so `***`, `___` and `- - -` were all slide splits in the
	// render already. The "safe" form was safe only from the code that was supposed to be
	// modeling the render.
	//
	// A TOP-LEVEL break is now parsed as the slide boundary it is, so this serializer only
	// ever emits a rule that lives INSIDE a container (a blockquote, a list item), where the
	// engine keeps it below level 0. `***` stays the right spelling there for a narrower
	// reason that does hold: a `---` written at a low indent can close its container and
	// become a top-level break, and `***` at any indent cannot be mistaken for anything the
	// deck's own separator convention uses.
	horizontal_rule(state: SerializerState, node: PMNode) {
		state.write('***');
		state.closeBlock(node);
	},
	// An authoring comment writes its source bytes back VERBATIM — no escaping, no reflow.
	// That is the point of carrying them on the node: the round-trip has nothing to get wrong.
	comment(state: SerializerState, node: PMNode) {
		state.write(node.attrs.text as string);
		state.closeBlock(node);
	},
	// A fence the author wrote comes back with the marker they wrote (see `codeBlockSpec`).
	// With no marker it is the upstream serializer, byte for byte.
	code_block(state: SerializerState, node: PMNode, parent: PMNode, index: number) {
		const marker = node.attrs.marker as string;
		if (!marker) return defaultMarkdownSerializer.nodes.code_block(state, node, parent, index);
		const fence = fenceFor(marker, node.textContent);
		state.write(`${fence}${(node.attrs.params as string) || ''}\n`);
		state.text(node.textContent, false);
		state.write('\n');
		state.write(fence);
		state.closeBlock(node);
	},
	// GFM tables — the whole grid in one pass (see serializeTable). The row/cell nodes
	// are consumed there, so their own serializers are no-ops.
	table: serializeTable,
	table_row() {},
	table_header() {},
	table_cell() {},
};

/** The Lattice markdown serializer — ProseMirror doc → Lattice markdown. */
export const latticeMarkdownSerializer = new MarkdownSerializer(latticeNodes, defaultMarkdownSerializer.marks);

/** Parse one slide's prose (markdown) into a ProseMirror document. */
export function parseSlideProse(md: string): PMNode {
	const doc = latticeMarkdownParser.parse(md);
	if (!doc) throw new Error('compose: markdown did not parse to a document');
	return doc;
}

/** Serialize a ProseMirror document back to Lattice slide prose. */
export function serializeSlideProse(doc: PMNode): string {
	return latticeMarkdownSerializer.serialize(doc);
}

/** parse → serialize, the round-trip the whole engine's fidelity rests on. */
export function roundTripSlideProse(md: string): string {
	return serializeSlideProse(parseSlideProse(md));
}
