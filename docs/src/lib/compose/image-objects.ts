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

import { Fragment, type Node as PMNode, Slice } from 'prosemirror-model';
import { type Command, type EditorState, NodeSelection } from 'prosemirror-state';
import type { EditorView } from 'prosemirror-view';
// THE placed-picture rule (lib/core/placed-picture.mjs): whether a picture is the slide's photo is the engine's decision, and
// Compose asks the same function the engine does rather than spelling it out (engineering/decisions/2026-10-16-media-plugins.md §9, 2026-11-11).
import { boundaryParser } from '../../../../lib/core/boundary-parser.mjs';
import frontMatterKey from '../../../../lib/core/front-matter-key.js';
import { backgroundDirectiveOf, backgroundImagePlaces, placedPictureInSlide } from '../../../../lib/core/placed-picture.mjs';
// The component names (the stage catalog's keys, as reserved-names.ts reads them): a slide's LAYOUT is its first class word
// that names a component, so a modifier-only slide (`_class: dark`) is a content slide (inversion, F7).
import STAGE_CATALOG from '../../../../lib/forms/cell/masthead/stage-catalog.generated.js';
import { deckClassWords, deckPlacingClasses } from '../deck-placing-classes';
import { setClassTokens } from '../slide-directives';
import { deckSchema, serializeSlideNode } from './deck-doc';
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
	const at = directives.findIndex((x) => classPayloadOf(x) !== null);
	// A new class is written as the drawer writes one (`setClassTokens`, lib/core/meta-edit.mjs `writeMeta`: a `_class` comment on a slide
	// with no record); a record's class is rewritten in the record, every other field kept.
	if (at < 0) return [setClassTokens('', tokens.slice()), ...directives];
	if (/^\s*<!--\s*(?:\{|@meta\{)/.test(directives[at])) {
		const next = setClassTokens(directives[at], tokens.slice());
		return next === directives[at] && classPayloadOf(next) !== tokens.join(' ') ? null : directives.map((x, i) => (i === at ? next : x)).filter(Boolean);
	}
	const line = `<!-- _class: ${tokens.join(' ')} -->`;
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
		tr.replaceWith(pos, pos + 1, asPlainPicture(node));
	}
	tr.setSelection(NodeSelection.create(tr.doc, pos)).setMeta(objectsKey, { edited: true });
	view.dispatch(tr);
	return true;
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

/**
 * Whether a background image CARRIED to this slide is already its photo, so no picture on it is placed: the front matter's
 * `backgroundImage:` and a running `<!-- backgroundImage: … -->` on this slide or an earlier one carry forward, and the slide's
 * own `<!-- _backgroundImage: … -->` replaces them for that slide (the engine's directive overlay; the kernel reads that one from
 * the slide's own text). The Studio's text readers ask the same question of lib/core/slide-placing-context.js.
 */
function carriedBackgroundPlaces(state: EditorState, slideIndex: number): boolean {
	const own = ((state.doc.child(slideIndex)?.attrs.directives as string[] | null) ?? []).some((d) => backgroundDirectiveOf(d)?.spot);
	if (own) return false;
	let carried: string | null = frontMatterKey.topLevelFrontMatterValue(String(state.doc.attrs.frontMatter ?? ''), 'backgroundImage');
	for (let i = 0; i <= slideIndex && i < state.doc.childCount; i++) {
		state.doc.child(i).descendants((n) => {
			if (n.type.name !== 'comment') return true;
			const dir = backgroundDirectiveOf(String(n.attrs.text ?? ''));
			if (dir && !dir.spot) carried = dir.value;
			return false;
		});
	}
	return backgroundImagePlaces(carried);
}

/** The kernel's answer for one slide under these classes, kept per slide node (nodes are immutable, so an edit makes a new one):
 *  the ordinal of its placed picture among its pictures, or -1. */
const placedBySlide = new WeakMap<PMNode, Map<string, number>>();
function placedOrdinal(slide: PMNode, classes: readonly string[]): number {
	const key = classes.join(' ');
	let bySlide = placedBySlide.get(slide);
	if (!bySlide) placedBySlide.set(slide, (bySlide = new Map()));
	let ordinal = bySlide.get(key);
	if (ordinal === undefined) {
		ordinal = placedPictureInSlide(serializeSlideNode(slide), [...classes], { md: boundaryParser })?.ordinal ?? -1;
		bySlide.set(key, ordinal);
	}
	return ordinal;
}

/** Whether the picture at `offset` inside `slide` is the one the engine places under these classes: the kernel reads the slide's
 *  Markdown and names its placed picture by its place among the slide's pictures, which is this node's place in the tree. */
function placedAtOffset(slide: PMNode, offset: number, classes: readonly string[]): boolean {
	const want = placedOrdinal(slide, classes);
	if (want < 0) return false;
	let ordinal = 0;
	let found = -1;
	slide.descendants((n, at) => {
		if (found >= 0) return false;
		if (!isImage(n)) return true;
		if (at === offset) found = ordinal;
		ordinal++;
		return true;
	});
	return found === want;
}

/** Whether the picture at `pos` is the one the engine places on its slide under these classes. */
function isPlacedPicture(state: EditorState, pos: number, classes: readonly string[]): boolean {
	const $at = state.doc.resolve(pos);
	if ($at.depth < 1) return false;
	return placedAtOffset($at.node(1), pos - $at.before(1) - 1, classes);
}

/** The picture an old `![bg …]` one becomes when it is placed (`placeImage`): its description as its name, no keywords. */
function asPlainPicture(node: PMNode): PMNode {
	const title = (node.attrs.title as string | null) ?? '';
	return imageType().create({ ...node.attrs, alt: title ? descriptionAsAlt(title) : '', title: null }, null, node.marks);
}

/** Whether the old `![bg …]` picture at `pos`, once placed as the plain picture it becomes, is the one an `image` slide places. */
function placeableBgPicture(state: EditorState, pos: number, classes: readonly string[]): boolean {
	const node = state.doc.nodeAt(pos);
	const $at = state.doc.resolve(pos);
	if (!node || $at.depth < 1) return false;
	const offset = pos - $at.before(1) - 1;
	const slide = $at.node(1).replace(offset, offset + 1, new Slice(Fragment.from(asPlainPicture(node)), 0, 0));
	return placedAtOffset(slide, offset, classes);
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
	const frontMatter = (state.doc.attrs.frontMatter as string) || '';
	const deck = deckClassWords(frontMatter);
	// A slide with no class of its own takes the carried one, as the engine does: the badge then says what the slide draws.
	const carried = carriedClassBefore(state, $at.index(0));
	// A background carried from the front matter or an earlier slide is the slide's photo: nothing on it is placed, and only
	// the comment that carries it can change that.
	const carriedBackground = carriedBackgroundPlaces(state, $at.index(0));
	const inherited = deck.length > 0 || carried !== null || carriedBackground;
	const effective = own.length ? own : (carried ?? []);
	// The classes the engine resolves for the slide: its own (or the carried one), plus the deck's without its component names.
	const classes = [...effective, ...deckPlacingClasses(frontMatter)];
	const alt = (node.attrs.alt as string | null) ?? '';
	// A picture is placed only when the engine places it. An old `![bg …]` one never is since the engine break (2026-11-13): the
	// engine draws it as an ordinary picture, the lint warns, and Placement below turns it into the picture it should be.
	const placement = bgKeywords(alt) === null && !carriedBackground && isPlacedPicture(state, pos, classes) ? placementOf(classes) : 'none';
	// It may be placed when the engine WOULD place it once the slide places a picture: the same rule, asked of the slide as an
	// `image` slide (an old `![bg …]` alt loses its keywords when it is placed, so it is asked as the plain picture it becomes).
	const placeable = bgKeywords(alt) !== null ? placeableBgPicture(state, pos, tokensWithPlacement(classes, 'right')) : isPlacedPicture(state, pos, tokensWithPlacement(classes, 'right'));
	return { placement, canPlace: placeable && !inherited && canPlaceOn(own) && !inLockedSlide(state, pos) };
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
