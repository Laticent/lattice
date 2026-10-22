// COMPOSE IMAGES — the document half: what an image is, how it is changed, and how one goes in.
//
// A markdown image (`![alt](src)`, a Library photo as `![alt](asset:harbor)`, a background as `![bg right](asset:x)`)
// is prosemirror-markdown's own inline `image` node: an atom with `src`, `alt` and `title`. Compose now draws it
// (components/studio/image-node-view.ts) and opens one editor on it (InlineObjectEditor.tsx), through the same open-editor
// state a pill uses (`objectsKey`, inline-objects.ts), so a tap, Enter, Undo and Done behave the same on both.
//
// Design: engineering/decisions/2026-10-21-compose-point-and-click.md §6. Pure ProseMirror and strings: the part that
// knows about the Library (which photos exist, what URL draws one) lives in the component layer.
//
//   · A pick is its own undo step, and replaces the node rather than patching it, for the reason `editObject` does:
//     the open editor's position is mapped through the edit, and a replaced range maps cleanly.
//   · The slide's markdown is written by prosemirror-markdown's own image rule, so a slide the author did not touch
//     keeps its bytes (the emit baseline) and one they did touch writes `![alt](src "title")` as the editor always has.

import { closeHistory } from 'prosemirror-history';
import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
import { deckSchema } from './deck-doc';
import { objectsKey } from './inline-objects';

export const imageType = () => deckSchema.nodes.image;

/** Is this node an image Compose draws and edits? */
export function isImage(node: PMNode | null | undefined): boolean {
	return node?.type === imageType();
}

/** Where an image's bytes come from, as far as the editor draws it. Anything else gets a stand-in; the preview draws the real one. */
export type ImageSourceKind = 'asset' | 'data' | 'other';

export function imageSourceKind(src: string): ImageSourceKind {
	// The same shape the engine resolves (lib/core/media-sources.js): a name, no extension, no path.
	if (assetNameOf(src) !== null) return 'asset';
	// A data URI is the author's own bytes, in the document already: drawing it fetches nothing. The types are the engine's own
	// allowlist: a type it refuses draws as literal text on the slide, and Compose must not show a picture there.
	if (/^data:image\/(?:png|jpeg|gif|webp);base64,/i.test(src)) return 'data';
	return 'other';
}

/** The Library name in an `asset:` reference, or null. */
export function assetNameOf(src: string): string | null {
	return /^asset:([A-Za-z0-9][\w-]*)$/i.exec(src)?.[1] ?? null;
}

/**
 * A photo's description as an ALT TEXT. A description that starts with `bg` is the background directive (`bg right:90% sepia`), so a
 * Library caption (which a model can write) or an author's own words would turn the picture into a slide background. It is written as
 * a sentence instead. Only the placement chips write the directive.
 */
export function descriptionAsAlt(text: string): string {
	const one = text.replace(/[\r\n]+/g, ' ').trim();
	return bgKeywords(one) !== null ? `Image: ${one}` : one;
}

// ── The background directive ─────────────────────────────────────────────────

/** The words after `bg` in a background image's alt text (`right:40%` in `bg right:40%`), or null when this is not one. */
export function bgKeywords(alt: string): string | null {
	const m = /^bg(?:[^\S\r\n]+([^\r\n]*))?$/.exec(alt.trim());
	return m ? (m[1] ?? '').trim() : null;
}

export type BgSide = 'left' | 'right' | 'full';

/** Which side a background takes, as the engine reads it (lib/core/bg-image.js `bgSide`). */
export function bgSideOf(alt: string): BgSide {
	const k = bgKeywords(alt) ?? '';
	if (/\bright\b/.test(k)) return 'right';
	if (/\bleft\b/.test(k)) return 'left';
	return 'full';
}

/**
 * The alt text with the background's side changed and every other word kept (`bg right:40% blur` to `bg left:40% blur`).
 * A declared share (`:40%`) travels with the side word; going to `full` drops both. Null when the alt is not a background.
 */
export function withBgSide(alt: string, side: BgSide): string | null {
	const k = bgKeywords(alt);
	if (k === null) return null;
	const words = k.split(/\s+/).filter(Boolean);
	const at = words.findIndex((w) => /^(?:left|right)(?::[\w.%-]+)?$/.test(w));
	const share = at >= 0 ? (/:[\w.%-]+$/.exec(words[at])?.[0] ?? '') : '';
	if (side === 'full') {
		if (at >= 0) words.splice(at, 1);
	} else if (at >= 0) {
		words[at] = `${side}${share}`;
	} else {
		words.unshift(side);
	}
	return ['bg', ...words].join(' ');
}

// ── The writes ───────────────────────────────────────────────────────────────

export interface ImageEdit {
	src?: string;
	alt?: string;
}

/** Is the slide that holds `pos` locked (edited in Markdown, because Compose cannot round-trip it)? Its node identity must never change. */
export function inLockedSlide(state: EditorState, pos: number): boolean {
	return Boolean(state.doc.resolve(pos).node(1)?.attrs.locked);
}

/** A source the editor may write: one line, and one of the references a deck takes. A guard, not a grammar. */
function writableSrc(src: string): boolean {
	return src.length > 0 && src.length < 8192 && !/[\s<>"'`()\\]/.test(src);
}

/**
 * Change an image's source or alt text. Returns whether the node now says it: false when the node is gone, the value
 * is not one a deck can hold, or the structural guard refused (a locked slide).
 */
export function editImage(view: EditorView, pos: number, edit: ImageEdit): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (!isImage(node) || !node || inLockedSlide(view.state, pos)) return false;
	const attrs = { ...node.attrs } as { src: string; alt: string | null; title: string | null };
	if (edit.src !== undefined) {
		if (!writableSrc(edit.src)) return false;
		attrs.src = edit.src;
	}
	if (edit.alt !== undefined) attrs.alt = edit.alt.replace(/[\r\n]+/g, ' ');
	if (attrs.src === node.attrs.src && attrs.alt === node.attrs.alt) return true;
	// A pick is its own undo step: close the open history group first, so it never joins the typing before it.
	view.dispatch(closeHistory(view.state.tr));
	const tr = view.state.tr.replaceWith(pos, pos + 1, imageType().create(attrs, null, node.marks));
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true });
	view.dispatch(tr);
	const now = view.state.doc.nodeAt(pos);
	return Boolean(now && now.attrs.src === attrs.src && (now.attrs.alt ?? '') === (attrs.alt ?? ''));
}

/** Take the image out. A paragraph left empty by it goes too, so no blank line is left on the slide. */
export function removeImage(view: EditorView, pos: number): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (!isImage(node) || !node || inLockedSlide(view.state, pos)) return false;
	const $at = view.state.doc.resolve(pos);
	const before = view.state.doc;
	const alone = $at.parent.type.name === 'paragraph' && $at.parent.childCount === 1 && $at.depth >= 2;
	view.dispatch(closeHistory(view.state.tr));
	const tr = view.state.tr;
	if (alone) tr.delete($at.before(), $at.after());
	else tr.delete(pos, pos + node.nodeSize);
	tr.setMeta(objectsKey, { close: true });
	view.dispatch(tr);
	return view.state.doc !== before;
}

// ── The door ─────────────────────────────────────────────────────────────────

/** Why an image cannot go in at the caret, in words the author can use, or null when it can. */
export function insertImageBlocker(state: EditorState): string | null {
	const { $from } = state.selection;
	if ($from.node(1)?.attrs.locked) return 'This slide is edited in Markdown, so an image cannot be added here.';
	if ($from.parent.type.spec.code) return 'The cursor is in a code block. Move it into the slide text to add an image.';
	if ($from.depth < 2) return 'Put the cursor in the slide text to add an image.';
	return null;
}

/**
 * Put an image on the slide, in a paragraph of its own after the block the caret is in (an empty paragraph the caret
 * is in is used instead), and open its editor on it. A picture is a block of its own in every layout that takes one, and
 * a mid-sentence picture is the one an author rarely means, so the door never splits the caret's line.
 */
export function insertImage(src: string, alt: string): Command {
	return (state, dispatch) => {
		if (insertImageBlocker(state) || !writableSrc(src)) return false;
		const { $from } = state.selection;
		const node = imageType().create({ src, alt: alt.replace(/[\r\n]+/g, ' ') });
		const para = deckSchema.nodes.paragraph.create(null, node);
		// The slide's top-level block the caret sits in: doc → slide → block.
		let depth = $from.depth;
		while (depth > 1 && $from.node(depth - 1).type.name !== 'slide') depth--;
		const emptyHere = $from.parent.type.name === 'paragraph' && $from.parent.content.size === 0 && $from.depth === depth;
		if (dispatch) {
			const tr = state.tr;
			const at = emptyHere ? $from.before(depth) : $from.after(depth);
			if (emptyHere) tr.replaceWith(at, $from.after(depth), para);
			else tr.insert(at, para);
			// The node sits one step inside its paragraph.
			const imgPos = at + 1;
			tr.setSelection(NodeSelection.create(tr.doc, imgPos)).setMeta(objectsKey, { open: imgPos });
			dispatch(tr.scrollIntoView());
		}
		return true;
	};
}
