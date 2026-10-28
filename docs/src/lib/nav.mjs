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
//   • catalog  — Libraries and Plugins: two plain links to the two hubs, which
//                introduce every library and plugin. The menus never list the
//                individual entries (that is what the hubs are for); the ⌘K
//                palette finds them by name.

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

// The CATALOG — two hubs, one link each. Every surface that lists destinations (the desktop
// bar, the mobile Sheet, the Starlight mobile sidebar) shows these two and NOT the individual
// libraries and plugins: the hub is the one place that introduces them, so the menus stay
// short (src/pages/libraries/, src/pages/plugins/). The individual entries below are still
// one ⌘K query away (`searchOnly`) and drawn as cards on the home page.
export function catalogNav(url) {
	return [
		{ label: 'Libraries', href: url('libraries/'), match: ['libraries'], desc: 'The parts Lattice is built from' },
		{ label: 'Plugins', href: url('plugins/'), match: ['plugins'], desc: 'New syntax for any slide' },
	];
}

// The framework-free sibling LIBRARIES — every workspace library in the root package.json, each
// published to npm as `pkg` (engineering/decisions/2026-10-08-library-audit.md). Each has a demo
// at /libraries/<slug>/ and a Learn page beside it; the hub and both pages are built from
// src/content/catalog/libraries/<slug>.md, in the same order as this list (nav.test.ts holds
// both lines). LTT is listed under specsNav instead: it is a format first, and @laticent/ltt is
// its reference implementation (spec audit §8.5). nav.test.ts fails when a workspace package is
// missing from both lists, which is how LTT and Tavola once went unlisted. Anima is internal (no
// package, no build), so it is not listed.
const lib = (url, label, pkg, desc) => {
	const slug = label.toLowerCase();
	return { label, href: url(`libraries/${slug}/`), match: [`libraries/${slug}`], pkg, desc, searchOnly: true };
};
export function librariesNav(url) {
	return [
		lib(url, 'Suono', '@laticent/suono', 'Smooth, interruptible audio playback'),
		lib(url, 'Cadenza', '@laticent/cadenza', 'Captions that light up word by word'),
		lib(url, 'Vetrina', '@laticent/vetrina', 'Product tours that drive your real app'),
		lib(url, 'Lente', '@laticent/lente', 'A view for every reader, each approved'),
		lib(url, 'Trama', '@laticent/trama', 'Diagrams with lines that never collide'),
		lib(url, 'Segno', '@laticent/segno', 'Typed text into typed data, safely'),
		lib(url, 'Calco', '@laticent/calco', 'Web slides to editable PowerPoint'),
		lib(url, 'Tavola', '@laticent/tavola', 'Edit together from a link, no server'),
		lib(url, 'Fuoco', '@laticent/fuoco', 'Every view of a document on one focus'),
		lib(url, 'Mosaico', '@laticent/mosaico', 'Pictures of any shape, packed exactly'),
		lib(url, 'Veduta', '@laticent/veduta', 'Long lists that stay fast, because only what you see exists'),
		lib(url, 'Fluido', '@laticent/fluido', 'Content that fits any box, and breaks only where it may'),
		lib(url, 'Filo', '@laticent/filo', 'One undo history for every way a document changes'),
	];
}

// The author-facing PLUGINS (lib/plugins/<name>/), each with a live demo at /plugins/<slug>/
// and a Learn page beside it, built from src/content/catalog/plugins/<slug>.md. Two shipped
// plugins are deliberately absent: chart-family is plumbing no author names, and anima's scene
// format is not settled yet — the Plugins hub explains both under "Under the hood".
const plugin = (url, label, slug, desc) => ({ label, href: url(`plugins/${slug}/`), match: [`plugins/${slug}`], desc, searchOnly: true });
export function pluginsNav(url) {
	return [
		plugin(url, 'Math', 'math', 'TeX equations on any slide'),
		plugin(url, 'Mermaid', 'mermaid', 'Diagrams from a text fence'),
		plugin(url, 'Sparks', 'sparks', 'A chart the size of a word'),
		plugin(url, 'Pills', 'pills', 'A label set inside your sentence'),
		plugin(url, 'Icons', 'icons', 'Drawn icons, written in a word'),
		plugin(url, 'Avatars', 'avatars', 'A face for every name'),
		plugin(url, 'Function plots', 'function-plot', 'Graphs of y = f(x)'),
		plugin(url, 'Code', 'code', 'Highlighted code in any language'),
		plugin(url, 'Video', 'video', 'A clip drawn as a poster that links to it'),
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
// Comparison · Libraries · Plugins), kept for surfaces that present one undivided
// menu — the Starlight mobile sidebar, the mobile Sheet and the command palette.
// The apps lead here too, so "first link" means the same thing on every
// surface, not just the desktop bar.
export function primaryNav(url) {
	return [...appsNav(url), ...contentNav(url), ...catalogNav(url)];
}

// What the ⌘K palette can reach: the primary nav, plus every library and plugin. Those carry
// `searchOnly`, so the palette lists them only once the visitor types a query — an empty
// palette shows the same short list as the menus.
export function findableNav(url) {
	return [...primaryNav(url), ...librariesNav(url), ...pluginsNav(url)];
}

// True when the current request path falls inside an item's section, so the
// same logic drives "you are here" on every surface (docs pages light up Docs).
export function isCurrent(item, pathname) {
	return item.match.some((seg) => pathname.includes('/' + seg));
}
