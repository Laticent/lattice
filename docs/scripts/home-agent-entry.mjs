// The homepage's agent entry, read from the built HTML (#3522 E2-S01). check-discovery.mjs runs
// it on dist/index.html. It parses the page with the same HTML parser md-twins.mjs uses rather
// than with patterns, so it sees what a browser sees: a tag inside a comment, a <template>, a
// <noscript> or a <script> is not a tag, and any quoting of an attribute reads the same.

import { fromHtml } from 'hast-util-from-html';
import { selectAll } from 'hast-util-select';
import { AGENT_ENTRY, HOME_AGENT_LINKS } from '../src/lib/discovery.mjs';

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
	const tree = fromHtml(html);
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
