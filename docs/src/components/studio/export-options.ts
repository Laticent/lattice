// Export options — what review layers ride along into an exported artifact.
//
// The deck's three channels export to their NATIVE homes automatically: the
// speaker note → the PPTX notes field, the accessibility description → the PPTX
// image alt text / HTML aria. Comments are the exception: they are app-state
// review feedback (not the deck source), so whether they enter a shared artifact
// is a per-export DECISION the author makes at export time — a wrong assumption
// either way is bad (leak private review notes into a board PDF, OR silently drop
// the feedback the recipient needs). This module models that decision + turns the
// chosen comments into the sticky-note payload the PDF exporter consumes.
//
// See engineering/decisions/2026-07-04-comments-layer.md (the PDF sticky-note
// export was the documented follow-on this delivers).

import { listComments, type SlideComment } from './slide-comments';

/** Which comments ride into the export. */
export type CommentScope = 'all' | 'open';

export type ExportOptions = {
	/** Add the deck's comments to the PDF as sticky-note annotations. */
	commentsInPdf: boolean;
	/** All comments, or only the unresolved (open) ones. */
	commentScope: CommentScope;
};

/** A single PDF sticky note — a title (who) + the comment body. */
export type PdfAnnotation = { title: string; contents: string };

/** Does a scope admit this comment? `open` drops resolved ones. */
function inScope(c: SlideComment, scope: CommentScope): boolean {
	return scope === 'all' || !c.resolved;
}

/**
 * Is this comment placeable — in scope AND anchored to a slide that still exists?
 * `slideCount` (the deck's rendered slide count) bounds the anchor: a comment left
 * on slide 5 that now points past a shortened deck (slides deleted after commenting,
 * the documented index-anchoring limit) has no page to land on. Both the panel count
 * and the export payload use THIS predicate, so "N notes" always equals N embedded —
 * the two can never disagree. Omit `slideCount` to skip the upper bound.
 */
function placeable(c: SlideComment, scope: CommentScope, slideCount?: number): boolean {
	if (!inScope(c, scope)) return false;
	if (c.slide < 1) return false;
	if (slideCount != null && c.slide > slideCount) return false;
	return true;
}

/** How many comments a deck would contribute under a scope (for the panel count). */
export function commentCount(deckId: string | undefined, scope: CommentScope, slideCount?: number): number {
	if (!deckId) return 0;
	return listComments(deckId).filter((c) => placeable(c, scope, slideCount)).length;
}

/**
 * Build the per-page sticky-note payload for the PDF exporter. The result is
 * index-aligned to the deck's slides: `annotations[i]` is the note list for the
 * (0-based) page i / 1-based slide i+1 — the same 1-based slide index a comment is
 * anchored to and the deck rail shows. Empty/absent entries mean "no notes on that
 * page". A resolved comment is tagged in its title so the reader can tell state.
 *
 * Note on alignment: comments anchor to the SOURCE slide index (front matter
 * stripped — the rail's basis), which is 1:1 with the rendered PDF pages for a
 * normal deck. A layout that auto-splits one source slide into several rendered
 * pages (`split: headings`) can drift here — the same known index-anchoring limit
 * the comments decision doc records; reorder-stable anchoring is the Yjs-era fix.
 * `slideCount` bounds the anchor so a comment pointing past a shortened deck is
 * dropped rather than silently lost off the end (see `placeable`); pass it so the
 * embedded count matches the panel's.
 */
export function buildCommentAnnotations(deckId: string | undefined, scope: CommentScope, slideCount?: number): PdfAnnotation[][] {
	const byPage: PdfAnnotation[][] = [];
	if (!deckId) return byPage;
	for (const c of listComments(deckId)) {
		if (!placeable(c, scope, slideCount)) continue;
		const page = c.slide - 1;
		(byPage[page] ||= []).push({
			title: c.resolved ? `${c.author} · resolved` : c.author,
			contents: c.body,
		});
	}
	return byPage;
}
