// THE INLINE OBJECT NODE — what a pill, a spark or an avatar IS in the Compose document.
//
// The notation (`{SHIPPED, c2}`, `~{12 14 17}`, `!{Ada Okafor}`) is a code span in the deck source.
// In the Compose document it is one ATOM node carrying that source text verbatim, so the editor
// treats it as one unit: a tap selects it, an arrow key steps over it, Backspace takes all of it,
// and there is no caret inside it for a touch keyboard to chase. The node adds nothing to the
// bytes: it serializes back to exactly the code span it came from.
//
// Design: engineering/decisions/2026-10-13-compose-inline-notation-editors.md (§12, the rework).
// This file is the SCHEMA half (spec, paste guard, serializer). What turns text into a node, what a
// node looks like and what a click does live in `inline-objects.ts`.
//
// Nothing here knows what a pill is. `src` is a string the engine's kernel gives meaning to, so a
// new kind (a spark, an avatar) needs no schema change.

import { Mark, type NodeSpec, type Node as PMNode } from 'prosemirror-model';
import { CLIP_ORIGIN } from './clip-origin';

/**
 * The shape a source must have to be a node at all: one line, braced, with an optional `~`, `!` or `^`
 * sigil. This is a SAFETY check, not a grammar: the kernel decides whether a source is a pill. It
 * exists for the one path where the source arrives from outside, a paste. A newline in `src` would
 * end the code span when the node is written back, and what follows would be parsed as deck
 * structure (a `---` slide boundary, a `<!-- _backgroundImage: … -->` directive).
 */
export const INLINE_OBJECT_SRC = /^[~!^]?\{[^\n\r`]*\}$/;

/** Longest source an object may carry. The notation is a line of options, never a document. */
export const INLINE_OBJECT_MAX = 512;

/** Is `src` a source an object node may carry? */
export function isObjectSource(src: unknown): src is string {
	return typeof src === 'string' && src.length <= INLINE_OBJECT_MAX && INLINE_OBJECT_SRC.test(src);
}

/** Read the source off pasted DOM. Only this editor's own copies are believed (see CLIP_ORIGIN); anything else
 *  returns false, so the `<code>` falls through to the ordinary code mark and stays text. */
function readSource(src: string | null, origin: string | null): { src: string } | false {
	return origin === CLIP_ORIGIN && isObjectSource(src) ? { src } : false;
}

export const inlineObjectSpec: NodeSpec = {
	group: 'inline',
	inline: true,
	atom: true,
	selectable: true,
	draggable: false,
	attrs: { src: {} },
	// Plain-text copy and `textContent` see the notation, as they did when it was a code span.
	leafText: (node) => node.attrs.src as string,
	toDOM: (node) => ['code', { 'data-inline-object': node.attrs.src as string, 'data-lattice-origin': CLIP_ORIGIN, spellcheck: 'false' }, node.attrs.src as string],
	parseDOM: [
		{
			tag: 'code[data-inline-object]',
			priority: 60, // ahead of the code mark's own `code` rule
			getAttrs: (dom) => readSource((dom as HTMLElement).getAttribute('data-inline-object'), (dom as HTMLElement).getAttribute('data-lattice-origin')),
		},
	],
};

/** The backtick run that fences `src` as a code span, exactly as prosemirror-markdown's `code` mark writes it. */
function fenceFor(src: string, side: -1 | 1): string {
	let len = 0;
	for (const m of src.matchAll(/`+/g)) len = Math.max(len, m[0].length);
	let out = len > 0 && side > 0 ? ' `' : '`';
	out += '`'.repeat(len);
	if (len > 0 && side < 0) out += ' ';
	return out;
}

/** Is this sibling a code span in the written deck: another object, or text with the code mark? */
function isCodeSpan(node: PMNode | null | undefined): boolean {
	return Boolean(node && (node.type.name === 'inline_object' || (node.isText && node.marks.some((m) => m.type.name === 'code'))));
}

/** Two siblings write as touching code spans when both are, and no other mark opens or closes between them. */
function touchesAsCode(a: PMNode | null | undefined, b: PMNode): boolean {
	if (!a || !isCodeSpan(a) || !isCodeSpan(b)) return false;
	const plain = (n: PMNode) => n.marks.filter((m) => m.type.name !== 'code');
	return Mark.sameSet(plain(a), plain(b));
}

/**
 * Write an object back as the code span it came from.
 *
 * Two code spans cannot touch in Markdown (`{A}``{B}` is ONE span, so both would stop being pills on
 * the next load), so an object that touches another code span is separated from it by a space. The
 * editor already keeps them apart (`normalizeObjects`); this is the last resort for a document that
 * got past it, and it writes the space on the object's side only: an object that follows another
 * object leads with it, one that precedes code text trails with it.
 */
export function serializeInlineObject(state: { write(s: string): void }, node: PMNode, parent?: PMNode, index?: number): void {
	// Defense in depth: no source reaches the deck with a line break in it, whatever built the node.
	const src = (node.attrs.src as string).replace(/[\r\n]+/g, ' ');
	const prev = parent && index !== undefined && index > 0 ? parent.child(index - 1) : null;
	const next = parent && index !== undefined && index + 1 < parent.childCount ? parent.child(index + 1) : null;
	const lead = touchesAsCode(prev, node) ? ' ' : '';
	const trail = next && next.type.name !== 'inline_object' && touchesAsCode(next, node) ? ' ' : '';
	state.write(lead + fenceFor(src, -1) + src + fenceFor(src, 1) + trail);
}
