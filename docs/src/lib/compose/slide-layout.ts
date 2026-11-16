// THE LAYOUT OF A WHOLE SLIDE, from Compose's layout button (LayoutMenu.tsx).
//
// The pane gallery already answers "what does this pane hold, and will its text survive a change"
// (pane-model.ts). This is the same question one level up: the slide's own `_class`. It shares the
// fit test (`bodyFit`) and the starter shape (`paneStarter`) with the pane code, so a slide and a
// pane can never disagree about what "keeps your text" means.
//
// What a slide's BODY is: everything after its heading block (the eyebrow pills above the `#`/`##`,
// the heading, a subtitle pill under it) and before its coda (a closing Key Insight blockquote, a
// `— ` attribution line, speaker notes). A layout change never touches the heading block or the coda:
// those belong to the slide, whatever draws its body.
//
// Design and review: engineering/decisions/2026-11-15-compose-layout-button.md.

import { Fragment, type Node as PMNode } from 'prosemirror-model';
import type { EditorState, Transaction } from 'prosemirror-state';
import { parseSlideProse } from './deck-markdown';
import { closeFiloGroup } from './filo-history';
import { directivesWithClass, slideClassTokens } from './image-objects';
import { bodyFit, childPos, isPill, paneStarter, slideAt } from './pane-model';
import type { PaneNeeds } from './pane-needs';

/** The child range `[from, to)` of a slide's BODY: after its heading block, before its coda. */
export function slideBodyRange(slide: PMNode): { from: number; to: number } {
	let from = 0;
	while (from < slide.childCount && slide.child(from).type.name === 'comment') from++;
	// The heading block: pills (eyebrows) then a `#` or `##`, then a subtitle pill.
	let k = from;
	while (k < slide.childCount && isPill(slide.child(k))) k++;
	const h = k < slide.childCount ? slide.child(k) : null;
	if (h && h.type.name === 'heading' && h.attrs.level <= 2) {
		from = k + 1;
		if (from < slide.childCount && isPill(slide.child(from))) from++;
	}
	const coda = (n: PMNode) => n.type.name === 'comment' || n.type.name === 'blockquote' || (n.type.name === 'paragraph' && /^—\s/.test(n.textContent));
	let to = slide.childCount;
	while (to > from && coda(slide.child(to - 1))) to--;
	// A body of nothing but coda shapes (a quote slide) is the body itself, as a pane's is.
	if (to === from) to = slide.childCount;
	return { from, to };
}

/** The component a slide holds now: its first class token, or `content`. */
export function slideComponent(slide: PMNode): string {
	return slideClassTokens((slide.attrs.directives as string[]) || [])[0] || 'content';
}

/** Why Compose cannot change this slide's layout, in words, or null when it can: a slide it cannot round-trip is edited in
 *  Source, and a class that shares its comment with other settings would lose them in a rewrite. */
export function layoutBlocker(slide: PMNode): string | null {
	if (slide.attrs.locked) return 'This slide is edited in Source';
	const directives = (slide.attrs.directives as string[]) || [];
	const tokens = slideClassTokens(directives);
	if (!directivesWithClass(directives, tokens.length ? [...tokens, 'x'] : ['x'])) return 'This slide’s class shares a comment with other settings. Change it in Source';
	return null;
}

/** Whether `cls` can draw this slide's body as it stands ('keeps') or needs its example ('fresh'). */
export function slideFit(slide: PMNode, needs: PaneNeeds, doc: Document): (cls: string) => 'keeps' | 'fresh' {
	const { from, to } = slideBodyRange(slide);
	const nodes: PMNode[] = [];
	for (let k = from; k < to; k++) if (slide.child(k).type.name !== 'comment') nodes.push(slide.child(k));
	return bodyFit(slide, nodes, slideComponent(slide), needs, doc);
}

export type SlideLayoutChoice = {
	/** The slide's whole class: the component first, then its modifiers. */
	tokens: string[];
	/** The body to put in place of the slide's own (a component's starter), or null to keep it. */
	starter: string | null;
};

/**
 * Give the slide at `slidePos` this layout: its `_class` set to `choice.tokens`, and when
 * `choice.starter` is set its body swapped for that starter. The heading block, the coda and any
 * speaker note in the body stay. One history step of its own. Null when nothing would change, the
 * slide is locked (Compose cannot round-trip it), or its class sits in a compound comment.
 */
export function applySlideLayout(state: EditorState, slidePos: number, choice: SlideLayoutChoice): Transaction | null {
	const at = slideAt(state.doc, slidePos);
	if (!at || at.slide.attrs.locked) return null;
	const directives = (at.slide.attrs.directives as string[]) || [];
	const same = slideClassTokens(directives).join(' ') === choice.tokens.join(' ');
	if (same && choice.starter === null) return null;
	const next = same ? directives : directivesWithClass(directives, choice.tokens);
	if (!next) return null;
	const tr = state.tr;
	if (choice.starter !== null) {
		const { from, to } = slideBodyRange(at.slide);
		const parsed = parseSlideProse(choice.starter).content.toJSON();
		let content = parsed ? Fragment.fromJSON(state.schema, parsed) : Fragment.empty;
		for (let k = from; k < to; k++) if (at.slide.child(k).type.name === 'comment') content = content.addToEnd(at.slide.child(k));
		if (content.size) tr.replaceWith(childPos(at.slide, at.start, from), childPos(at.slide, at.start, to), content);
	}
	if (!same) tr.setNodeMarkup(slidePos, undefined, { ...at.slide.attrs, directives: next });
	return closeFiloGroup(tr);
}

/** Put a slide back as it was (`original`, read before the first change): the layout menu's Undo,
 *  which takes back a whole visit to the menu in one step however many picks it held. */
export function restoreSlide(state: EditorState, slidePos: number, original: PMNode): Transaction | null {
	const at = slideAt(state.doc, slidePos);
	if (!at || at.slide.eq(original)) return null;
	return closeFiloGroup(state.tr.replaceWith(slidePos, slidePos + at.slide.nodeSize, original));
}

/** A component's starter as a slide BODY: its skeleton less the directives and heading block. A closing
 *  quote stays only for a component that reads one as its own. */
export function slideStarter(skeleton: string, keepQuote: boolean): string {
	return paneStarter(skeleton, keepQuote);
}

/** The modifiers a slide keeps when it changes layout (the layout menu, LayoutMenu.tsx): every token after the component
 *  except the looks the OLD layout owned (cards-grid `four` means nothing on `stats`). Base modifiers (`scale-l`, `tint-…`)
 *  and a deck's own classes stay: a change of layout never drops a class the author added, even one the catalog does not
 *  know, and `lint:deck` says so if the new layout cannot use it. */
export function keptModifiers(tokens: readonly string[], from: { variants?: readonly string[] } | undefined): string[] {
	const own = new Set((from?.variants ?? []).flatMap((v) => v.split(/\s+/)));
	return tokens.slice(1).filter((t) => !own.has(t));
}
