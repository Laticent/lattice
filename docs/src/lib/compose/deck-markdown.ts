import { defaultMarkdownParser, defaultMarkdownSerializer, MarkdownSerializer } from 'prosemirror-markdown';
import type { Node as PMNode } from 'prosemirror-model';

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
// The one deviation from ProseMirror's defaults: bullets serialize as `-` (the
// Lattice house marker, HARD RULE #5's card grammar) instead of the default `*`.

// biome-ignore lint/suspicious/noExplicitAny: prosemirror-markdown's serializer state is loosely typed upstream; we mirror its own node signatures.
type SerializerState = any;

const latticeNodes = {
	...defaultMarkdownSerializer.nodes,
	// Bullet lists use `-` (Lattice), not the default `*`. Same 2-space continuation
	// indent, so nesting under an ordered item stays at the `   - ` depth the engine
	// reads. (renderList's second arg is the child-line indent.)
	bullet_list(state: SerializerState, node: PMNode) {
		state.renderList(node, '  ', () => `${(node.attrs.bullet as string) || '-'} `);
	},
};

/** The Lattice markdown serializer — ProseMirror doc → Lattice markdown. */
export const latticeMarkdownSerializer = new MarkdownSerializer(latticeNodes, defaultMarkdownSerializer.marks);

/** Parse one slide's prose (markdown) into a ProseMirror document. */
export function parseSlideProse(md: string): PMNode {
	const doc = defaultMarkdownParser.parse(md);
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
