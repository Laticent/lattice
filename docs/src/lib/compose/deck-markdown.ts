import MarkdownIt from 'markdown-it';
import {
	defaultMarkdownParser,
	defaultMarkdownSerializer,
	MarkdownParser,
	MarkdownSerializer,
	MarkdownSerializerState,
	schema as mdSchema,
} from 'prosemirror-markdown';
import { type Node as PMNode, Schema } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

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

/** The prose schema — prosemirror-markdown's block/mark set PLUS the table nodes.
 *  `deckSchema` (deck-doc) is built by wrapping THIS schema's nodes in a slide node,
 *  so the table node specs are identical on both sides of the JSON bridge. */
export const proseSchema = new Schema({
	nodes: mdSchema.spec.nodes.append(composeTableNodes),
	marks: mdSchema.spec.marks,
});

// ── Parser ─────────────────────────────────────────────────────────────────────
// A dedicated markdown-it (CommonMark preset + `table` ONLY — strikethrough,
// tasklists, etc. stay locked for now) plus token→node rules for the GFM table.
// `thead`/`tbody` are transparent (`ignore`), so their child rows attach directly
// to the `table` node, matching prosemirror-tables' flat `table → table_row+` shape.
const tableTokenizer = new MarkdownIt('commonmark', { html: false }).enable('table');

// biome-ignore lint/suspicious/noExplicitAny: markdown-it Token is loosely typed upstream.
function alignAttrs(token: any) {
	const style: string = token.attrGet?.('style') || '';
	const m = /text-align:(left|center|right)/.exec(style);
	return { align: m ? m[1] : null };
}

/** The Lattice markdown parser — Lattice slide prose → ProseMirror document. */
export const latticeMarkdownParser = new MarkdownParser(proseSchema, tableTokenizer, {
	...defaultMarkdownParser.tokens,
	table: { block: 'table' },
	thead: { ignore: true },
	tbody: { ignore: true },
	tr: { block: 'table_row' },
	th: { block: 'table_header', getAttrs: alignAttrs },
	td: { block: 'table_cell', getAttrs: alignAttrs },
});

// ── Serializer ───────────────────────────────────────────────────────────────
const DELIM: Record<string, string> = { left: ':---', center: ':---:', right: '---:', null: '---' };

/** Serialize one cell's inline content to a single GFM-safe line. */
function serializeCell(state: SerializerState, cell: PMNode): string {
	// A throwaway sub-state renders just this cell's inline content to a string
	// (the main state writes to one shared buffer, so it can't be reused per-cell).
	const sub = new MarkdownSerializerState(state.nodes, state.marks, state.options);
	sub.renderInline(cell);
	let out = sub.out.replace(/\n+/g, ' ').trim();
	// LFM state markers (`[x] [-] [ ] [/]`) and literal brackets are the signature
	// cell syntax; the base serializer escapes `[`/`]` as link syntax, which would
	// break the engine's `^\[([x-/ ])\]` marker regex. Un-escape brackets so markers
	// survive verbatim.
	out = out.replace(/\\([[\]])/g, '$1');
	// GFM: a raw pipe splits cells, so escape any not-already-escaped pipe.
	out = out.replace(/(?<!\\)\|/g, '\\|');
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
	// A thematic break serializes as `***`, NEVER the default `---`. Inside a slide a
	// bare `---` line IS the deck's slide separator (`splitSlides` cuts on `/\n-{3,}\n/`),
	// so an author typing `***`/`___`/`- - -` (all valid engine `<hr>` forms) must not have
	// it degrade into a slide split that silently drops the next slide's `_class`. `***`
	// is an equivalent `<hr>` that the separator regex can never match.
	horizontal_rule(state: SerializerState, node: PMNode) {
		state.write('***');
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
