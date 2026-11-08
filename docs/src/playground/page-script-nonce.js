// page-script-nonce.js — the one script nonce a page load seals its preview frames with.
//
// Its own module, not a line in preview-csp.js, because preview-csp.js rides in the deck-preview
// chunk that the Playground and the home page load eagerly, and neither seals a frame with a
// nonce. Only the Studio preview (single-slide-render.ts) and the Stage (stage-window.js) import
// this, so the 90 bytes stay on the routes that use them (docs/scripts/check-route-budget.mjs).

/**
 * One script nonce per page load, shared by every builder that seals its frame with
 * `previewCspMeta({ scriptNonce })` (the Studio preview, the Stage). Random, so a shared deck's
 * markup cannot carry it; constant for the page, so a rewrite of the same document is
 * byte-identical and render signatures keep matching. See the BYOK lifecycle note §4 and
 * `scriptSources` in lib/core/subresource-csp.mjs.
 */
export const PAGE_SCRIPT_NONCE = (() => {
	const b = new Uint8Array(18);
	globalThis.crypto.getRandomValues(b);
	return btoa(String.fromCharCode(...b)).replace(/\+/g, '-').replace(/\//g, '_');
})();

