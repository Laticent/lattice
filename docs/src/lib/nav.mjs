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
// The Drawing Board (`/drawing-board/`) and the Workbench (`/workbench/`) are
// DELIBERATELY ABSENT. Both are development-frozen and superseded by the
// Studio (engineering/decisions/2026-07-03-studio-succession.md §4). Their
// routes still resolve — this is a nav demotion, not a removal — so an old
// link or bookmark keeps working until the routes are deleted (§6 P5). Do not
// re-add them here.
//
// `match` lists the path segments that mark an item "current" (aria-current).
// Docs is a SECTION: any of its pages light up the single Docs entry. Callers
// pass their base-aware `url()` helper and compute current from the request
// pathname via `isCurrent` below.

export const GITHUB_URL = 'https://github.com/slidewright/lattice';

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

// The framework-free sibling LIBRARIES, each with a standalone showcase demo (own chrome,
// reached by URL). Grouped under one "Libraries" disclosure on desktop, listed flat in the mobile
// menu + command palette. Anima's demo lands with its build (not listed yet).
export function librariesNav(url) {
	return [
		{ label: 'Suono', href: url('suono'), match: ['suono'], desc: 'Audio scheduler + owned clock' },
		{ label: 'Lente', href: url('lente'), match: ['lente'], desc: 'Reader lenses, human-approved' },
		{ label: 'Cadenza', href: url('cadenza'), match: ['cadenza'], desc: 'Caption + timeline engine' },
		{ label: 'Vetrina', href: url('vetrina'), match: ['vetrina'], desc: 'Self-driving walkthrough' },
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
