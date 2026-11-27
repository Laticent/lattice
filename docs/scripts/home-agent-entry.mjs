// The agent links in a built page's HTML (#3522 E2-S01), as check-discovery.mjs reads them: the
// llms.txt describedby tag on every page, and the homepage's agent entry. Pages are parsed with
// the HTML parser md-twins.mjs uses, never with patterns, so they read the way a browser reads
// them: a tag inside a comment, a <template> or a <script> is not a tag, any quoting of an
// attribute reads the same, and a "</head>" inside a script string ends nothing. The parser runs
// with scripting off, which makes a <noscript>'s contents elements, so `liveTree` drops each
// <noscript> first: a scripting browser, which is what an agent's fetcher emulates when it
// renders, never sees them.

import { fromHtml } from 'hast-util-from-html';
import { selectAll } from 'hast-util-select';
import { AGENT_ENTRY, DESCRIBEDBY_LINK, HOME_AGENT_LINKS } from '../src/lib/discovery.mjs';

/** The page as a browser with scripting on would build it, minus every <noscript>. */
function liveTree(html) {
	const tree = fromHtml(html);
	(function prune(node) {
		if (!node.children) return;
		node.children = node.children.filter((c) => !(c.type === 'element' && c.tagName === 'noscript'));
		for (const c of node.children) prune(c);
	})(tree);
	return tree;
}

/** A site-relative href (an optional base path in front) that ends at `target`; never another origin. */
const pointsAt = (href, target) => typeof href === 'string' && !/^[a-z][a-z0-9+.-]*:|^\/\//i.test(href) && href.endsWith(target);

/** hast gives `rel` as a list and `type` as a string; compare both case-blind. */
const rels = (el) => [].concat(el.properties.rel ?? []).map((r) => String(r).toLowerCase());
const typeOf = (el) => String(el.properties.type ?? '').toLowerCase();

/**
 * What the homepage's HTML, as served, is missing of its agent entry: [] when it carries one
 * `<a data-agent-entry>` to AGENT_ENTRY and each HOME_AGENT_LINKS tag. `exists(path)` says
 * whether a site path (no leading slash) was built. An href may carry the site's base in front,
 * so a site-relative href is matched on its end; an absolute URL never matches.
 */
export function homeAgentEntryProblems(html, exists) {
	const tree = liveTree(html);
	const problems = [];
	const anchors = selectAll('a[data-agent-entry]', tree);
	if (anchors.length !== 1) problems.push(`expected one <a data-agent-entry> to ${AGENT_ENTRY}, found ${anchors.length}`);
	for (const a of anchors) if (!pointsAt(a.properties.href, AGENT_ENTRY)) problems.push(`<a data-agent-entry> points at ${a.properties.href || 'nothing'}, not ${AGENT_ENTRY}`);
	const links = selectAll('link', tree);
	for (const want of HOME_AGENT_LINKS) {
		const got = links.filter((l) => rels(l).includes(want.rel) && pointsAt(l.properties.href, want.href));
		if (got.length !== 1) problems.push(`expected one <link rel="${want.rel}" href="…${want.href}">, found ${got.length}`);
		else if (typeOf(got[0]) !== want.type) problems.push(`<link rel="${want.rel}"> has type ${typeOf(got[0]) || 'none'}, want ${want.type}`);
	}
	for (const target of new Set([AGENT_ENTRY, ...HOME_AGENT_LINKS.map((l) => l.href)]))
		if (!exists(target.slice(1))) problems.push(`${target} is linked from the homepage but was not built`);
	return problems;
}

/**
 * What is wrong with a page's llms.txt describedby link: [] when it carries exactly one live
 * `<link rel="describedby">`, and that one points at DESCRIBEDBY_LINK's href with its type.
 * Counting every describedby link, not one exact string, catches a second one written another
 * way and one that sits inside a script string.
 */
export function describedbyProblems(html) {
	// The <head> alone: parsing whole pages (up to 600 KB) cost the build 2.4 s; the head is a
	// few KB, and a tag written into a script string there still reads as script text.
	const end = html.indexOf('</head>');
	const head = end < 0 ? html : html.slice(0, end + '</head>'.length);
	const all = selectAll('link', liveTree(head)).filter((l) => rels(l).includes(DESCRIBEDBY_LINK.rel));
	if (all.length !== 1) return [`has ${all.length} <link rel="describedby"> (want exactly 1, to ${DESCRIBEDBY_LINK.href}; scripts/md-twins.mjs writes it)`];
	const [l] = all;
	const problems = [];
	if (!pointsAt(l.properties.href, DESCRIBEDBY_LINK.href)) problems.push(`<link rel="describedby"> points at ${l.properties.href || 'nothing'}, not ${DESCRIBEDBY_LINK.href}`);
	if (typeOf(l) !== DESCRIBEDBY_LINK.type) problems.push(`<link rel="describedby"> has type ${typeOf(l) || 'none'}, want ${DESCRIBEDBY_LINK.type}`);
	return problems;
}
