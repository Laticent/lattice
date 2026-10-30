// LINKS — the document half of editing a link by pointing at it: find the link the caret is in, set one on a selection,
// change its address, take it off, and put a new one at the caret. The panel is LinkPanel.tsx; it calls only these.
//
//   · A link is prosemirror-markdown's `link` mark ({ href, title }), written back as `[text](href "title")` or `<href>`.
//   · An address goes through `normalizeHref` before it reaches the document, so the serializer never writes a destination that
//     ends the link early (a space, a parenthesis), one the engine refuses to draw (`javascript:`, `data:`; markdown-it's own
//     `validateLink`), or one the next parse would re-encode. A refusal is a sentence the panel shows, never a silent drop.
//   · A locked slide takes no link change, and a fenced block holds no marks.
//   · Each change is one transaction, so it is one undo step.

import MarkdownIt from 'markdown-it';
import type { Mark, Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, TextSelection } from 'prosemirror-state';
import { deckSchema } from './deck-doc';

const linkType = () => deckSchema.marks.link;

/** A link in the document: the range its mark covers and the mark's attributes. */
export interface LinkRange {
	from: number;
	to: number;
	href: string;
	title: string | null;
}

/** What "Insert → Link" writes when nothing is selected: a word to type over. */
export const LINK_PLACEHOLDER = 'link';

/** The schemes a slide may link to. Everything else with a scheme is refused (markdown-it draws `javascript:` and `data:` as text). */
const SAFE_SCHEMES = new Set(['http', 'https', 'mailto', 'tel']);

/** markdown-it's own link rules: the address is written as the parser would normalize it, and refused where it would refuse it. */
const md = new MarkdownIt();

/**
 * An address as the author typed it, made safe to write as a Markdown link destination, or the reason it cannot be.
 * A bare email gains `mailto:`, a bare host (`example.com/x`) `https://`, and a host with a port (`localhost:3000`) `http://`
 * for a local host and `https://` otherwise; a relative path or `#anchor` stays as it is. The result is then written as
 * markdown-it normalizes it (`normalizeLink`), so the next parse reads back the same bytes, with parentheses percent-encoded
 * because the serializer writes the destination bare. Refused: an empty address, a scheme other than http, https, mailto and
 * tel, a control character, and anything markdown-it's `validateLink` refuses.
 */
export function normalizeHref(input: string): { href: string } | { error: string } {
	// Entities and backslash escapes are decoded first, as the parser will decode them: `&#106;avascript:` is `javascript:`.
	let href = md.utils.unescapeAll(input.trim());
	if (!href) return { error: 'Type an address for the link.' };
	// biome-ignore lint/suspicious/noControlCharactersInRegex: a control character is exactly what is being refused.
	if (/[\u0000-\u001f\u007f]/.test(href)) return { error: 'The address holds a line break or another character a link cannot carry.' };
	if (/^[^\s@/:?#]+@[^\s@/:?#]+\.[a-z]{2,}$/i.test(href)) href = `mailto:${href}`;
	else if (/^(?:localhost|[^:/?#\s\\]*\.[^:/?#\s\\]+):\d+(?:[/?#]|$)/i.test(href)) {
		// `host:port`, where the host is `localhost` or holds a dot. Without a scheme a browser reads `localhost:` as one. A dotless
		// word before the colon is a scheme (`javascript:1/…`) and goes to the check below. A bracketed IPv6 host is not offered:
		// markdown-it percent-encodes the brackets, which no browser accepts.
		href = `${/^(?:localhost|127\.0\.0\.1)(?::|$)/i.test(href) ? 'http' : 'https'}://${href}`;
	} else {
		const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(href)?.[1]?.toLowerCase();
		if (scheme && !SAFE_SCHEMES.has(scheme)) return { error: `A slide cannot link to a ${scheme}: address. Use a web address (https://…) or an email (mailto:…).` };
		// No scheme: a path, an anchor or a bare host. A dot and a top-level name before the first slash name a host.
		if (!scheme && !/^[./#?]/.test(href) && /^[^/?#\s\\]*\.[a-z]{2,}\.?(?:[/?#]|$)/i.test(href)) href = `https://${href}`;
	}
	// An `&` that starts an entity stays as it is here: the serializer writes it as `&amp;` (deck-markdown.ts `entitySafeHref`).
	href = md.normalizeLink(href).replace(/\(/g, '%28').replace(/\)/g, '%29');
	if (!md.validateLink(href)) return { error: 'A slide cannot link to this address. Use a web address (https://…) or an email (mailto:…).' };
	return { href };
}

/** The link mark in a set of marks, or undefined. */
const linkIn = (marks: readonly Mark[]): Mark | undefined => marks.find((m) => m.type === linkType());

/**
 * The whole link around a position: the run of adjacent text in one textblock that carries the SAME link mark (same href and
 * title). Null when the position is not in a link.
 */
export function linkAt(doc: PMNode, pos: number): LinkRange | null {
	const $pos = doc.resolve(pos);
	const parent = $pos.parent;
	if (!parent.inlineContent) return null;
	// The child the position is in, or the one just before it when it sits at the end of a link.
	const index = $pos.index();
	const candidates = [index, index - 1].filter((i) => i >= 0 && i < parent.childCount);
	let hit: { i: number; mark: Mark } | null = null;
	for (const i of candidates) {
		const mark = linkIn(parent.child(i).marks);
		if (mark) {
			hit = { i, mark };
			break;
		}
	}
	if (!hit) return null;
	const { mark } = hit;
	let first = hit.i;
	let last = hit.i;
	while (first > 0 && mark.isInSet(parent.child(first - 1).marks)) first--;
	while (last < parent.childCount - 1 && mark.isInSet(parent.child(last + 1).marks)) last++;
	const start = $pos.start();
	let from = start;
	for (let i = 0; i < first; i++) from += parent.child(i).nodeSize;
	let to = from;
	for (let i = first; i <= last; i++) to += parent.child(i).nodeSize;
	return { from, to, href: String(mark.attrs.href ?? ''), title: (mark.attrs.title as string | null) ?? null };
}

/** The link the selection is in or covers: the caret's link, or the link a selection lies wholly inside. */
export function selectedLink(state: EditorState): LinkRange | null {
	const { from, to, empty } = state.selection;
	const at = linkAt(state.doc, from);
	if (!at) return null;
	if (empty || (to <= at.to && from >= at.from)) return at;
	return null;
}

/**
 * Why a link cannot be set or changed where the selection is, or null when it can. Declines on a locked slide, in a fenced
 * block, and across blocks (one link is one run of text in one line).
 */
export function linkBlocker(state: EditorState): string | null {
	const { $from, $to } = state.selection;
	if ($from.depth >= 1 && $from.node(1)?.attrs.locked) return 'This slide is edited in Markdown, so a link cannot be changed here.';
	if (!$from.parent.inlineContent || $from.parent.type.spec.code) return 'Put the cursor in a line of text to add a link.';
	if (!$from.sameParent($to)) return 'Select text on one line to make it a link.';
	return null;
}

/**
 * Set a link with this address. On an existing link (the caret in it, or a selection inside it) the whole link takes the new
 * address and keeps its text and title. On a selection, the selected text becomes the link. With an empty caret outside a
 * link, the address itself is written as the link's text. Refuses (returns false) where `linkBlocker` says, or when the
 * address does not normalize.
 */
export function setLink(input: string, target?: LinkRange | null): Command {
	return (state, dispatch) => {
		const norm = normalizeHref(input);
		if ('error' in norm || linkBlocker(state)) return false;
		const existing = target === undefined ? selectedLink(state) : target;
		if (dispatch) {
			const tr = state.tr;
			if (existing) {
				tr.removeMark(existing.from, existing.to, linkType()).addMark(existing.from, existing.to, linkType().create({ href: norm.href, title: existing.title }));
			} else if (state.selection.empty) {
				const { from } = state.selection;
				const marks = state.storedMarks ?? state.selection.$from.marks();
				const text = norm.href.replace(/^mailto:/, '');
				tr.insert(from, deckSchema.text(text, linkType().create({ href: norm.href }).addToSet(marks)));
				tr.setSelection(TextSelection.create(tr.doc, from + text.length));
			} else {
				const { from, to } = state.selection;
				tr.removeMark(from, to, linkType()).addMark(from, to, linkType().create({ href: norm.href }));
			}
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}

/** Take the link off its text, keeping the text. Refuses on a locked slide or when there is no link. */
export function removeLink(target?: LinkRange | null): Command {
	return (state, dispatch) => {
		const link = target === undefined ? selectedLink(state) : target;
		if (!link || linkBlocker(state)) return false;
		if (dispatch) dispatch(state.tr.removeMark(link.from, link.to, linkType()).scrollIntoView());
		return true;
	};
}

/**
 * "Insert → Link" with nothing selected: write a placeholder word as a link to an empty-for-now address and select it, so the
 * panel can open on it and the first keystroke in the text replaces it. With a selection, nothing is written: the panel sets
 * the link on the selection when the author gives the address. Returns the range the panel should edit.
 */
export function startLink(state: EditorState, dispatch?: (tr: import('prosemirror-state').Transaction) => void): { from: number; to: number } | null {
	if (linkBlocker(state)) return null;
	const { from, to, empty } = state.selection;
	if (!empty) return { from, to };
	const existing = selectedLink(state);
	if (existing) return { from: existing.from, to: existing.to };
	if (dispatch) {
		const marks = state.storedMarks ?? state.selection.$from.marks();
		const tr = state.tr.insert(from, deckSchema.text(LINK_PLACEHOLDER, marks));
		tr.setSelection(TextSelection.create(tr.doc, from, from + LINK_PLACEHOLDER.length));
		dispatch(tr.scrollIntoView());
	}
	return { from, to: from + LINK_PLACEHOLDER.length };
}

/** An address the panel may open in a new tab: a web or mail address only, never a relative path the Studio would resolve. */
export const isOpenableHref = (href: string): boolean => /^(?:https?|mailto):/i.test(href);
