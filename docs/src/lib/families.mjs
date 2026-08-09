// Presentation grouping for the component reference. The engine's disk buckets
// (lib/components/<bucket>/<name>/) group by Function — what a slide DOES for
// the audience — which scatters look-alikes (every split-* lands in a different
// bucket; "charts" is only the narrow chart/ bucket). For BROWSING, a
// shape/material taxonomy reads more intuitively. This is a presentation lens
// only: it never moves files or changes URLs.
//
// Used at build time (Astro frontmatter) to SSR the default grouping, and the
// same orders are shipped to the client (component-browser.js) so the "Group
// by" switch can re-group without a round trip.

// Ordered families. Each component appears in exactly one; every one of the 52
// components is covered (see test below in the page build). Keep split-* whole
// and let "Charts & diagrams" be the broad data-viz family.
export const FAMILY_DEFS = [
	{ key: 'titles', label: 'Titles & breaks', members: ['title', 'divider', 'closing'] },
	{ key: 'statements', label: 'Statements', members: ['big-number', 'content', 'quote'] },
	{ key: 'numbers', label: 'Numbers & KPIs', members: ['kpi', 'stats'] },
	{ key: 'lists', label: 'Lists & inventories', members: ['list', 'list-tabular', 'checklist', 'agenda', 'actors', 'glossary', 'list-steps', 'list-criteria', 'logo-wall', 'q-and-a'] },
	{ key: 'cards', label: 'Cards', members: ['cards-grid', 'cards-stack'] },
	{ key: 'compare', label: 'Compare', members: ['compare-prose', 'compare-table', 'decision', 'matrix-2x2', 'redline', 'verdict-grid', 'pricing'] },
	{ key: 'timelines', label: 'Timelines & roadmaps', members: ['timeline-list', 'roadmap'] },
	{ key: 'charts', label: 'Charts & diagrams', members: ['journey', 'gantt', 'kanban', 'piechart', 'progress', 'quadrant', 'radar', 'state-chart', 'word-cloud', 'diagram', 'funnel', 'map'] },
	{ key: 'splits', label: 'Split layouts', members: ['split-panel', 'split-compare'] },
	{ key: 'codemath', label: 'Code & math', members: ['code', 'compare-code', 'math'] },
	{ key: 'legal', label: 'Legal', members: ['authority-chain', 'citation-card', 'obligation-matrix', 'regulatory-update', 'statute-stack'] },
	{ key: 'images', label: 'Images', members: ['image'] },
];

const NAME_TO_FAMILY = new Map();
for (const def of FAMILY_DEFS) for (const n of def.members) NAME_TO_FAMILY.set(n, def.key);

/** Family key for a component name ('other' if somehow unmapped). */
export function familyOf(name) {
	return NAME_TO_FAMILY.get(name) || 'other';
}

// Function lens (the 7 audience-functions) + Substance lens orders, mirrored
// to the client. Labels are Title Case.
const FUNCTION_ORDER = ['anchor', 'statement', 'inventory', 'comparison', 'progression', 'evidence', 'imagery'];
const SUBSTANCE_ORDER = ['prose', 'structure', 'series', 'graph', 'mixed'];
const tc = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/**
 * Build the flat catalog the nav + index browse from.
 * @param {object[]} manifests  loadAll() output
 * @param {(m:object)=>string} bucketOf  manifestBucket
 */
export function buildCatalog(manifests, bucketOf) {
	const labelOf = new Map(FAMILY_DEFS.map((d) => [d.key, d.label]));
	return manifests
		.map((m) => {
			const family = familyOf(m.name);
			return {
				name: m.name,
				bucket: bucketOf(m),
				function: m.function,
				substance: m.substance,
				form: m.form,
				family,
				familyLabel: labelOf.get(family) || 'Other',
				description: m.description || '',
				// Carried for the intent ranker (intent-search.ts), not for browse: the
				// manifest's "use this when…" prose is the second-strongest match signal
				// after `description`, and nothing else on the client has it.
				purpose: m.purpose || '',
				tags: Array.isArray(m.tags) ? m.tags : [],
			};
		})
		.sort((a, b) => a.name.localeCompare(b.name));
}

/** The lens definitions shipped to the client (id, label, ordered keys). */
export function buildLenses() {
	return [
		{ id: 'family', label: 'Family', field: 'family', order: FAMILY_DEFS.map((d) => ({ key: d.key, label: d.label })) },
		{ id: 'function', label: 'Function', field: 'function', order: FUNCTION_ORDER.map((k) => ({ key: k, label: tc(k) })) },
		{ id: 'substance', label: 'Substance', field: 'substance', order: SUBSTANCE_ORDER.map((k) => ({ key: k, label: tc(k) })) },
		{ id: 'az', label: 'A–Z', field: null, order: null },
	];
}

/**
 * Group a catalog (already filtered/ordered) by a lens. Shared by SSR and the
 * client so both produce identical structure.
 * @returns {{key:string,label:string,items:object[]}[]}
 */
export function groupCatalog(items, lensId) {
	const lens = buildLenses().find((l) => l.id === lensId) || buildLenses()[0];
	if (lens.id === 'az') {
		const groups = new Map();
		for (const it of items) {
			const letter = (it.name[0] || '#').toUpperCase();
			if (!groups.has(letter)) groups.set(letter, []);
			groups.get(letter).push(it);
		}
		return [...groups.keys()]
			.sort()
			.map((letter) => ({ key: letter, label: letter, items: groups.get(letter) }));
	}
	const out = [];
	for (const { key, label } of lens.order) {
		const members = items.filter((it) => it[lens.field] === key);
		if (members.length) out.push({ key, label, items: members });
	}
	// Anything the lens order didn't account for (defensive).
	const seen = new Set(lens.order.map((o) => o.key));
	const rest = items.filter((it) => !seen.has(it[lens.field]));
	if (rest.length) out.push({ key: 'other', label: 'Other', items: rest });
	return out;
}
