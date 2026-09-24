// Which guide pages teach a grammar a component reads. A component's reference
// page is built from its manifest, which describes the component's own slots; a
// grammar SHARED across components (the six state marks, the ten status words,
// label sets) is taught once, in a guide, and every component that reads it
// points there rather than restating it. This map is that pointer, kept on the
// site side because it names site routes, which a manifest must not know.
//
// Pinned by component-guides.test.ts: every component named here must exist,
// and every slug must be a real page, so a rename cannot leave a dead link.

const MARKS = { slug: 'guides/status/answers', title: 'The six answers', when: 'what each state marker means' };
const LAYOUTS = {
	slug: 'guides/status/marks-in-layouts',
	title: 'Marks in layouts',
	when: 'this layout’s words for each mark, and renaming them with a label set',
};
const STATUS_WORDS = {
	slug: 'guides/status/component-pills',
	title: 'Pills a component places',
	when: 'the ten status words, and where this component reads one',
};
const POSITIONAL = {
	slug: 'guides/status/component-pills',
	title: 'Pills a component places',
	when: 'the pill slots this component fills from position',
};
const BRACE_PILLS = { slug: 'guides/status/pills', title: 'Pills you place', when: 'the `{LABEL}` brace pill' };

/** @type {Record<string, { slug: string, title: string, when: string }[]>} */
export const COMPONENT_GUIDES = {
	checklist: [MARKS, LAYOUTS],
	'verdict-grid': [MARKS, LAYOUTS],
	pricing: [MARKS, LAYOUTS],
	'obligation-matrix': [MARKS, LAYOUTS],
	roadmap: [MARKS, LAYOUTS, POSITIONAL],
	table: [MARKS, { ...LAYOUTS, when: 'the `state-cells` switch that draws marks in table cells' }],
	'matrix-grid': [
		{ ...LAYOUTS, when: 'why `[x]` `[-]` `[ ]` mean a POSITION here, not an answer' },
	],
	progress: [STATUS_WORDS],
	'timeline-list': [{ ...STATUS_WORDS, when: 'the status word after the title, and the date pill before it' }],
	kanban: [STATUS_WORDS],
	gantt: [STATUS_WORDS],
	'state-chart': [STATUS_WORDS],
	slope: [STATUS_WORDS],
	'regulatory-update': [POSITIONAL],
	glossary: [POSITIONAL],
	'list-tabular': [BRACE_PILLS],
};

/** The guides for one component, or an empty list. */
export function guidesFor(name) {
	return COMPONENT_GUIDES[name] || [];
}
