// preview-host.js — pure, import-free host classification for the guided tour.
//
// Extracted from guided-tour.js (which imports CSS, a docs-only dependency absent from CI's
// root install) so the Node unit suite can test it directly.
//
// A host that is unambiguously a dev / PR-preview surface — never a production
// site. `*.pages.dev` is Cloudflare Pages (every preview today is served there;
// the production docs are GitHub Pages), and localhost is `astro dev`/`preview`.
// Used as a RUNTIME backstop so the tour's pointer-trapping overlay never runs
// on a preview even when the build-time `CF_PAGES` stamp is missing/wrong.
export function isPreviewHost(hostname) {
	const h = String(hostname || '').toLowerCase();
	return h === 'localhost' || h === '127.0.0.1' || h === '[::1]' || h.endsWith('.pages.dev');
}
