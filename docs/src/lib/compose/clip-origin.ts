/**
 * A PER-SESSION token stamped on every node this editor copies, and required before a pasted
 * node's ATTRIBUTES are believed.
 *
 * `parseDOM` rules match by CSS selector, so they match in ANY pasted HTML — including HTML from
 * a page the author does not control. An attribute is not content: the schema carries it into the
 * document without it ever appearing on screen, and from there into the deck source and the
 * exported artifact. A shape check alone does not close that, because the dangerous values are
 * perfectly well-formed ones. What separates the two cases is PROVENANCE: an attribute is
 * trustworthy when it came out of this editor and never otherwise.
 *
 * The token is random per page load, so a foreign document cannot carry a valid one; a copy from
 * this session round-trips, and anything else falls back to the attribute's default — which is
 * always the pre-bridge behavior, and therefore never a regression.
 *
 * Cost, stated plainly: copying between two Studio TABS does not carry these attributes. That is
 * the safe direction, and the Markdown pane is the way across.
 *
 * ONE MODULE, TWO CONSUMERS (HARD RULE #1). `deck-doc` uses it for a slide's `directives`, and
 * `comment-block` for a comment's text. It lives here rather than in `deck-doc` because
 * `comment-block` is imported BY `deck-doc` (through `deck-markdown`), so importing back would be
 * a cycle — and because a second, independently-generated token would silently mean two editors'
 * worth of trust instead of one.
 */
export const CLIP_ORIGIN: string = (() => {
	try {
		const c = globalThis.crypto;
		if (c?.randomUUID) return c.randomUUID();
		if (c?.getRandomValues) return Array.from(c.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, '0')).join('');
	} catch {
		/* no crypto (an old jsdom) — fall through */
	}
	// Last resort. Weaker, but it still has to be GUESSED by an attacker writing a static page,
	// and the fallback only runs where `crypto` is absent.
	return `l${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;
})();
