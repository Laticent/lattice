// The site's primary navigation — ONE source of truth.
//
// Every surface renders from this model through the single shared
// <SiteHeader> (src/components/site/SiteHeader.astro) + its <NavActions>
// island, plus the Starlight mobile sidebar (Sidebar.astro). Nothing
// re-declares the nav inline anymore, so it can't drift across pages.
//
// Taxonomy: three families besides Home (the logo) and GitHub —
//   • apps     — the interactive surfaces you OPEN: the Studio first, then the
//                Playground. Inline on desktop, ahead of the content links,
//                because the Studio is the product's front door (the
//                succession doc's P4 "nav demotion" slice). They used to sit
//                behind a "Tools" disclosure alongside the Drawing Board and
//                the Workbench; that disclosure is gone — one hop, not two.
//   • content  — Docs (the whole learning track), Components (the reference),
//                Features, Comparison. Always inline on desktop.
//   • libraries — the framework-free sibling libraries, one disclosure.
//
// The Drawing Board and the Workbench are GONE — the Studio succeeded both and
// their routes were deleted (2026-07-03-studio-succession.md P5). `/drawing-board`
// and `/workbench` now redirect to `/studio/` (astro.config.mjs), so old links and
// bookmarks still land somewhere useful. Do not re-add them here.
//
// `match` lists the path segments that mark an item "current" (aria-current).
// Docs is a SECTION: any of its pages light up the single Docs entry. Callers
// pass their base-aware `url()` helper and compute current from the request
// pathname via `isCurrent` below.

export const GITHUB_URL = 'https://github.com/Laticent/lattice';

// The inline content destinations — visible directly in the desktop bar.
export function contentNav(url) {
	return [
		{
			label: 'Docs',
			href: url('overview/'),
			match: ['overview', 'introduction', 'principles', 'story', 'getting-started', 'guides', 'model', 'spec'],
			desc: 'Guides, the model, the LFM spec',
		},
		{ label: 'Components', href: url('components/'), match: ['components'], desc: 'Every layout, live' },
		{ label: 'Features', href: url('features/'), match: ['features'], desc: 'What the engine does' },
		{ label: 'Comparison', href: url('comparison/'), match: ['comparison'], desc: 'Lattice vs the field' },
	];
}

// The interactive apps — inline on desktop, ahead of the content links, and
// listed first inside the mobile menu and the command palette. Order is the
// message: the Studio is the whole loop, the Playground is the quick try.
export function appsNav(url) {
	return [
		{
			label: 'Studio',
			href: url('studio/'),
			match: ['studio'],
			desc: 'Write, review, present — in the browser',
			// A preview surface. The optional `badge` rides through every nav
			// surface via the shared renderers; it stays until the Studio drops
			// the preview label of its own accord, not because it got promoted.
			badge: 'Preview',
		},
		{ label: 'Playground', href: url('playground/'), match: ['playground'], desc: 'Paste Markdown, see it render' },
	];
}

// The framework-free sibling LIBRARIES — every workspace library in the root package.json, each
// published to npm as `pkg` (engineering/decisions/2026-10-08-library-audit.md). Grouped under one
// "Libraries" disclosure on desktop, listed flat in the mobile menu + command palette, and drawn as
// cards on the home page. A library with a standalone showcase demo (own chrome, reached by URL)
// links to it; a library with no demo page links to its README on GitHub and carries an empty
// `match` (no route of ours is "inside" it). LTT is listed under specsNav instead: it is a format
// first, and @laticent/ltt is its reference implementation (spec audit §8.5). nav.test.ts fails
// when a workspace package is missing from both lists, which is how LTT and Tavola went unlisted.
// Anima is internal (no package, no build), so it is not listed.
export function librariesNav(url) {
	const readme = (name) => `${GITHUB_URL}/tree/main/docs/src/lib/${name}#readme`;
	return [
		{ label: 'Suono', href: url('suono'), match: ['suono'], pkg: '@laticent/suono', desc: 'Audio scheduler + owned clock' },
		{ label: 'Lente', href: url('lente'), match: ['lente'], pkg: '@laticent/lente', desc: 'Reader lenses, human-approved' },
		{ label: 'Cadenza', href: url('cadenza'), match: ['cadenza'], pkg: '@laticent/cadenza', desc: 'Caption + timeline engine' },
		{ label: 'Vetrina', href: url('vetrina'), match: ['vetrina'], pkg: '@laticent/vetrina', desc: 'Self-driving walkthrough' },
		{ label: 'Trama', href: url('trama'), match: ['trama'], pkg: '@laticent/trama', desc: 'Graph layout + elbow routing' },
		{ label: 'Segno', href: url('segno'), match: ['segno'], pkg: '@laticent/segno', desc: 'Grammar engine + notation' },
		{ label: 'Calco', href: url('calco'), match: ['calco'], pkg: '@laticent/calco', desc: 'Slides to editable office files' },
		{ label: 'Tavola', href: readme('tavola'), match: [], pkg: '@laticent/tavola', desc: 'Peer-to-peer live editing', external: true },
	];
}

// The public SPECS published on the site (spec/*.md, projected by tools/build-spec-docs.js), drawn
// as the home page's Specs group. `pkg` is each spec's reference implementation, so the workspace
// check in nav.test.ts counts @laticent/ltt here. A spec still in draft (LPM, LFM 1.1) is not
// listed until it is ratified and published.
export function specsNav(url) {
	return [
		{ label: 'LFM 1.0', href: url('spec/lfm/'), match: ['spec/lfm'], pkg: '@laticent/lattice', desc: 'The Markdown dialect decks are written in', cta: 'Read the spec' },
		{ label: 'Diagnostic Protocol', href: url('spec/diagnostics/'), match: ['spec/diagnostics'], pkg: '@laticent/lattice', desc: 'Findings and fixes a linter reports', cta: 'Read the spec' },
		{ label: 'LTT 1.0', href: url('spec/ltt/'), match: ['spec/ltt'], pkg: '@laticent/ltt', desc: 'When each word of a narration is spoken', cta: 'Read the spec' },
	];
}

// The flat ordered list (Studio · Playground · Docs · Components · Features ·
// Comparison · the libraries), kept for surfaces that present one undivided
// menu — the Starlight mobile sidebar and the command palette's "Go to" group.
// The apps lead here too, so "first link" means the same thing on every
// surface, not just the desktop bar.
export function primaryNav(url) {
	return [...appsNav(url), ...contentNav(url), ...librariesNav(url)];
}

// True when the current request path falls inside an item's section, so the
// same logic drives "you are here" on every surface (docs pages light up Docs).
export function isCurrent(item, pathname) {
	return item.match.some((seg) => pathname.includes('/' + seg));
}

// True when any Libraries-group route is current — lights the "Libraries" disclosure.
export function librariesActive(pathname, url) {
	return librariesNav(url).some((item) => isCurrent(item, pathname));
}
