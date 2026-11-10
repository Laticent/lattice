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

import type { Node as PMNode } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
// The engine's own scheme allowlist (a leaf `module.exports`, as the docs dev shim needs): the shortcut is drawn through the
// record, so an address the record refuses (`http:`) is never placed, and Compose must not say it is (inversion, F5).
import urlScheme from '../../../../lib/core/url-scheme.js';
// The component names (the stage catalog's keys, as reserved-names.ts reads them): a slide's LAYOUT is its first class word
// that names a component, so a modifier-only slide (`_class: dark`) is a content slide (inversion, F7).
import STAGE_CATALOG from '../../../../lib/forms/cell/masthead/stage-catalog.generated.js';
import { deckSchema } from './deck-doc';
import { classPayloadOf } from './deck-source';
import { closeFiloGroup } from './filo-history';
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
	view.dispatch(closeFiloGroup(view.state.tr));
	const tr = view.state.tr.replaceWith(pos, pos + 1, imageType().create(attrs, null, node.marks));
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true });
	view.dispatch(tr);
	const now = view.state.doc.nodeAt(pos);
	return Boolean(now && now.attrs.src === attrs.src && (now.attrs.alt ?? '') === (attrs.alt ?? ''));
}

// ── Placement: the slide's, not the picture's ──────────────────────────────

/**
 * Where a picture sits is the SLIDE's choice (engineering/decisions/2026-10-16-media-plugins.md §8 decision 2, and the owner's
 * shortcut decision of 2026-11-10): an `image` slide makes `![title](src)` its photo panel (`mirror` for the left side), a
 * `bleed` slide makes it the background, any other slide shows it in the text. Compose writes the slide's class, never Marp's
 * `![bg …]` keywords; an old `![bg …]` picture it is asked to place loses them, the same mapping `lint:deck --fix` uses.
 */
export type Placement = 'left' | 'right' | 'full' | 'none';

/** The class tokens of a slide's directives (the first `_class` comment), or []. */
function slideClassTokens(directives: readonly string[]): string[] {
	const d = directives.find((x) => classPayloadOf(x) !== null);
	return d ? (classPayloadOf(d) ?? '').trim().split(/\s+/).filter(Boolean) : [];
}

/** The placement a slide's classes give its picture. */
export function placementOf(tokens: readonly string[]): Placement {
	// A collage packs every picture as a tile, whatever else the slide says (the engine's host table; the parity table).
	if (tokens.includes('collage')) return 'none';
	if (tokens.includes('image')) return tokens.includes('mirror') ? 'left' : 'right';
	if (tokens.includes('bleed')) return 'full';
	return 'none';
}

/** Whether Compose may place a picture on a slide of these classes: one whose layout is `content`, `image` or none. A quote or a
 *  chart has a layout of its own, and turning it into an `image` slide is a layout change, made where layouts are chosen. */
export function canPlaceOn(tokens: readonly string[]): boolean {
	const layout = tokens.find((t) => Object.hasOwn(STAGE_CATALOG as Record<string, string>, t));
	return layout === undefined || layout === 'content' || layout === 'image';
}

/** The slide's class tokens with this placement: every other token kept, in order. */
export function tokensWithPlacement(tokens: readonly string[], p: Placement): string[] {
	// `mirror` is the image layout's side here; on any other layout it is that layout's own word, and stays.
	const wasImage = tokens.includes('image');
	const rest = tokens.filter((t) => t !== 'content' && t !== 'image' && t !== 'bleed' && (t !== 'mirror' || !wasImage));
	if (p === 'left') return ['image', ...rest.filter((t) => t !== 'mirror'), 'mirror'];
	if (p === 'right') return ['image', ...rest];
	if (p === 'full') return ['content', ...rest, 'bleed'];
	return ['content', ...rest];
}

/** The slide's directives with its class set to `tokens`, or null when its class sits in a comment Compose does not rewrite. */
function directivesWithClass(directives: readonly string[], tokens: readonly string[]): string[] | null {
	const line = `<!-- _class: ${tokens.join(' ')} -->`;
	const at = directives.findIndex((x) => classPayloadOf(x) !== null);
	if (at < 0) return [line, ...directives];
	// Only a comment that holds the class alone is rewritten: a compound one carries other keys this must not touch.
	if (!/^\s*<!--\s*_class\s*:[^>]*-->\s*$/.test(directives[at])) return null;
	return directives.map((x, i) => (i === at ? line : x));
}

/**
 * Place the picture at `pos`: the slide's class takes the placement, and an old `![bg …]` alt becomes the picture's name (its
 * description, or nothing). One undo step. False when the node is gone, the slide is locked, its layout is not one a picture
 * places on, or its class sits in a compound comment.
 */
export function placeImage(view: EditorView, pos: number, p: Placement): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (!isImage(node) || !node || inLockedSlide(view.state, pos)) return false;
	const $at = view.state.doc.resolve(pos);
	const slidePos = $at.before(1);
	const slide = $at.node(1);
	const directives = (slide.attrs.directives as string[] | null) ?? [];
	const tokens = slideClassTokens(directives);
	if (!placementAt(view.state, pos).canPlace) return false;
	const next = directivesWithClass(directives, tokensWithPlacement(tokens, p));
	if (!next) return false;
	const alt = (node.attrs.alt as string | null) ?? '';
	const wasBg = bgKeywords(alt) !== null;
	view.dispatch(closeFiloGroup(view.state.tr));
	const tr = view.state.tr.setNodeMarkup(slidePos, undefined, { ...slide.attrs, directives: next });
	if (wasBg) {
		// The old description becomes the name, once: kept as both it read the same words twice (inversion, F9).
		const title = (node.attrs.title as string | null) ?? '';
		tr.replaceWith(pos, pos + 1, imageType().create({ ...node.attrs, alt: title ? descriptionAsAlt(title) : '', title: null }, null, node.marks));
	}
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true });
	view.dispatch(tr);
	return true;
}

/** The deck's own `class:` in its front matter (`class: bleed`), which the engine appends to every slide's class. */
function deckClassTokens(frontMatter: string): string[] {
	const line = /^class[ \t]*:(.*)$/m.exec(frontMatter || '');
	// Quotes go, as the engine strips them; brackets and commas stay, as the engine keeps them (`class: [bleed]` places
	// nothing there, so it places nothing here: inversion, F6).
	return line ? line[1].replace(/["']/g, ' ').trim().split(/\s+/).filter(Boolean) : [];
}

/**
 * The CARRIED class reaching this slide, or null for none: the last `<!-- class: … -->` (no underscore) on this slide or an
 * earlier one. Only `_x` comments are a slide's directives (deck-source.ts `splitSlideDirectives`); a carried one stays in the
 * prose as a `comment` node, which is where this reads it (inversion, F6: the directives-only read never found one).
 */
function carriedClassBefore(state: EditorState, slideIndex: number): string[] | null {
	let carried: string[] | null = null;
	for (let i = 0; i <= slideIndex && i < state.doc.childCount; i++) {
		state.doc.child(i).descendants((n) => {
			if (n.type.name !== 'comment') return true;
			const text = String(n.attrs.text ?? '');
			const payload = /^\s*<!--\s*_/.test(text) ? null : classPayloadOf(text);
			if (payload !== null) carried = payload.trim().split(/\s+/).filter(Boolean);
			return false;
		});
	}
	return carried;
}

/** Whether the slide already places a photo another way: an old `![bg …]` picture other than this one, or a lone record. */
function placesPhotoAlready(slide: PMNode, except: PMNode): boolean {
	let found = false;
	slide.descendants((n) => {
		if (found) return false;
		if (isImage(n) && n !== except && bgKeywords((n.attrs.alt as string | null) ?? '') !== null) found = true;
		// A record is an `inline_object` atom (its text is the source, no backticks) or code-marked text.
		if (n.type.name === 'paragraph' && /^\s*`?@image\{[^\n]*\}`?\s*$/.test(n.textContent)) found = true;
		return !found;
	});
	return found;
}

/** Whether the picture at `pos` is the slide's ONLY lone picture, as a direct paragraph of the slide: the one the engine places. */
function soleLonePicture(state: EditorState, pos: number): boolean {
	const $at = state.doc.resolve(pos);
	if ($at.depth !== 2 || $at.parent.childCount !== 1) return false;
	const node = state.doc.nodeAt(pos);
	if (!node) return false;
	// What the engine refuses to place: a Marp keyword alt (any case), an address the record's allowlist refuses, or a slide
	// that already places a photo (plugins.js `lonePicture`, `placesPhotoAlready`; inversion, F1, F4, F5).
	const alt = (node.attrs.alt as string | null) ?? '';
	if (bgKeywords(alt) === null && /^bg(?:\s|$)/i.test(alt.trim())) return false;
	if (!urlScheme.urlVerdict(String(node.attrs.src ?? '').trim()).ok) return false;
	if (placesPhotoAlready($at.node(1), node)) return false;
	let lone = 0;
	$at.node(1).forEach((block) => {
		if (block.type.name === 'paragraph' && block.childCount === 1 && isImage(block.firstChild)) lone++;
	});
	return lone === 1;
}

/**
 * The placement of the picture at `pos` and whether it may be changed here, for the panel and the badge. The placement reads
 * what the engine reads: the slide's own class plus the deck's `class:`. It may be changed only where writing this slide's
 * `_class` decides it: no deck-wide or carried class in play, a layout that takes a picture, and the slide's only lone picture
 * (the checker on this change: a deck-wide `bleed` came back after `placeImage` reported success).
 */
export function placementAt(state: EditorState, pos: number): { placement: Placement; canPlace: boolean } {
	const node = state.doc.nodeAt(pos);
	if (!isImage(node) || !node) return { placement: 'none', canPlace: false };
	const $at = state.doc.resolve(pos);
	const ownDirectives = ($at.node(1).attrs.directives as string[] | null) ?? [];
	const own = slideClassTokens(ownDirectives);
	const deck = deckClassTokens((state.doc.attrs.frontMatter as string) || '');
	// A slide with no class of its own takes the carried one, as the engine does: the badge then says what the slide draws.
	const carried = carriedClassBefore(state, $at.index(0));
	const inherited = deck.length > 0 || carried !== null;
	const effective = own.length ? own : (carried ?? []);
	const alt = (node.attrs.alt as string | null) ?? '';
	const sole = soleLonePicture(state, pos);
	// An old `![bg …]` picture is placed by its keywords until it is placed again; a plain one only when the engine places it.
	const placement = bgKeywords(alt) !== null ? bgSideOf(alt) : sole ? placementOf([...effective, ...deck.filter((t) => t !== 'image')]) : 'none';
	return { placement, canPlace: sole && !inherited && canPlaceOn(own) && !inLockedSlide(state, pos) };
}

/** Take the image out. A paragraph left empty by it goes too, so no blank line is left on the slide. */
export function removeImage(view: EditorView, pos: number): boolean {
	const node = view.state.doc.nodeAt(pos);
	if (!isImage(node) || !node || inLockedSlide(view.state, pos)) return false;
	const $at = view.state.doc.resolve(pos);
	const before = view.state.doc;
	const alone = $at.parent.type.name === 'paragraph' && $at.parent.childCount === 1 && $at.depth >= 2;
	view.dispatch(closeFiloGroup(view.state.tr));
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
	if ($from.node(1)?.attrs.locked) return 'This slide is edited in Source, so an image cannot be added here.';
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
