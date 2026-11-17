// One source for what the docs site tells crawlers and agents about itself (issue #3207).
//
// Three consumers read this file, and they must agree:
//   - `astro.config.mjs` passes `isIndexable` to the sitemap as its filter, so a page the
//     site asks search engines NOT to index is never also listed for them to index;
//   - `src/pages/robots.txt.ts` and `src/pages/llms.txt.ts` build their text from it;
//   - `scripts/check-discovery.mjs` reads the built `dist/` after `astro build` and fails
//     when a page's `<meta name="robots" content="noindex">` and this list disagree, in
//     either direction. That is what stops the list from rotting: a new noindex page that
//     nobody adds here fails the build rather than shipping a mixed signal.
//
// Kept pure (no `import.meta`, no fs) so the Astro config, the endpoints and a plain Node
// script can all import it.

/** The production origin. Matches the `site` fallback in astro.config.mjs. */
export const PRODUCTION_ORIGIN = 'https://lattice.style';

/**
 * Pages that carry `<meta name="robots" content="noindex">`, as path prefixes with a
 * trailing slash. Each one is a demo, a prototype or a gift card, not a page a stranger
 * should land on from a search: the per-library demo shells (their Learn pages ARE
 * indexed), the throwaway `/proto/` routes, the Vetrina fixtures, and the gift card.
 */
export const NOINDEX_PREFIXES = Object.freeze([
	'/gift/',
	'/offline/',
	'/proto/',
	'/vetrina-exemplars/',
	'/vetrina-tour/',
	// `/libraries/<name>/` is noindex; `/libraries/` and `/libraries/<name>/learn/` are not.
	// A prefix cannot say that, so the pattern below does.
]);

const LIBRARY_DEMO = /^\/libraries\/[^/]+\/$/;

/** True when `pathname` (e.g. `/guides/cli/`) should be listed in the sitemap. */
export function isIndexable(pathname) {
	if (LIBRARY_DEMO.test(pathname)) return false;
	return !NOINDEX_PREFIXES.some((p) => pathname.startsWith(p));
}

/**
 * The canonical URL for a page, or `undefined` when the build has no `site` (a bare
 * `astro dev` with SITE_URL unset). Absent is better than guessed: a wrong canonical
 * tells a search engine to drop the page in favor of a URL that may not exist.
 */
export function canonicalUrl(site, pathname) {
	return site ? new URL(pathname, site).href : undefined;
}

/**
 * robots.txt. One group for every crawler — search engines and AI crawlers alike
 * (Googlebot, Bingbot, GPTBot, ClaudeBot, PerplexityBot all honor `User-agent: *`). A
 * per-bot group that repeats the same rules adds lines and nothing else; the day a bot
 * needs a different rule is the day it gets its own group.
 *
 * A preview build (`index: false`, per deploy-env.mjs) disallows everything. Today's PR
 * previews do not reach that branch — they are built in GitHub Actions without CF_PAGES —
 * so `public/_headers` sends them `X-Robots-Tag: noindex` instead (Cloudflare reads that
 * file; GitHub Pages, the production host, ignores it).
 */
export function robotsTxt({ site, index }) {
	if (!index) {
		return '# A preview deploy. The real site is https://lattice.style.\nUser-agent: *\nDisallow: /\n';
	}
	const lines = ['User-agent: *', 'Allow: /', ''];
	if (site) lines.push(`Sitemap: ${new URL('/sitemap-index.xml', site).href}`, '');
	return lines.join('\n');
}

/**
 * llms.txt (https://llmstxt.org): a short router for an AI agent, not an index of every
 * page. engineering/decisions/2026-09-05-agent-kit-by-destination.md §4 set the shape:
 * "ship it then — as a router of ~2 KB, not an index". Every link below is a page this
 * site builds, and `scripts/check-discovery.mjs` fails the build when one is not.
 */
export const LLMS_LINKS = Object.freeze({
	Start: [
		['/introduction/', 'Introduction', 'What Lattice is and the model behind it'],
		['/getting-started/', 'Getting started', 'Install, write a first deck, render a PDF'],
		['/guides/authoring/', 'Authoring guide', 'How to write a deck: front matter, slides, layouts'],
	],
	Reference: [
		['/components/', 'Component reference', 'Every slide layout (`_class:`) with its slots and variants; each component also has its own page and `.md` copy under /components/<bucket>/<name>/'],
		['/reference/front-matter/', 'Front matter', 'Every deck-level front-matter key'],
		['/reference/cli/', 'CLI reference', 'The `lattice` command line: render, export, lint'],
		['/guides/themes/', 'Themes', 'Palettes and color modes'],
	],
	Optional: [
		// A card-grid catalog, not an article, so it has no .md copy: linked as the page.
		['/features/', 'Features', 'The full capability list', { page: true }],
		['/comparison/', 'Comparison', 'Lattice against AI generators, Office, code engines and design tools'],
		['/spec/lfm/', 'LFM specification', 'The Lattice Flavored Markdown specification'],
	],
});

/**
 * Markdown twins (scripts/md-twins.mjs): every content page has a plain-Markdown copy at its own
 * path plus `.md`. `/components/` is the one page whose twin another step already writes: the
 * whole component reference, from tools/build-docs-portal.js.
 */
export const EXISTING_TWINS = Object.freeze({ '/components/': '/components.md' });

/** `/guides/cli/` → `/guides/cli.md`; `/` → `/index.md`. */
export const twinPath = (route) => EXISTING_TWINS[route] ?? (route === '/' ? '/index.md' : `${route.replace(/\/$/, '')}.md`);

export const REPO_URL = 'https://github.com/Laticent/lattice';
export const AGENT_KIT_URL = 'https://github.com/Laticent/lattice/tree/dist-kits/agent';

export function llmsTxt({ site }) {
	const abs = (p) => (site ? new URL(p, site).href : p);
	const out = [
		'# Lattice',
		'',
		'> A slide-deck engine that renders boardroom-ready PDF, PPTX and HTML decks from plain Markdown. Each slide picks a layout with `<!-- _class: name -->`; a theme supplies the palette. Open source (AGPL-3.0), runs offline.',
		'',
		`Source: ${REPO_URL}. An agent writing decks should start from the agent kit (${AGENT_KIT_URL}), which carries a one-line-per-layout picker and the authoring rules.`,
		'',
		'Every docs, component and catalog page has a plain-Markdown copy at its own path plus `.md` (`/guides/cli/` → `/guides/cli.md`), linked from the page as `<link rel="alternate" type="text/markdown">`. The links below point at those copies.',
		'',
	];
	for (const [section, links] of Object.entries(LLMS_LINKS)) {
		out.push(`## ${section}`, '');
		for (const [p, title, note, opts] of links) out.push(`- [${title}](${abs(p.endsWith('/') && !opts?.page ? twinPath(p) : p)}): ${note}`);
		out.push('');
	}
	return out.join('\n');
}
