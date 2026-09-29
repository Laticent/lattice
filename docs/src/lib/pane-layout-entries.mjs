// THE PANE LAYOUTS, AS PICKER ENTRIES.
//
// `columns` and `rows` are LAYOUTS, not components: they have no manifest, no component page and
// no bucket (engineering/decisions/2026-09-28-generic-pane-layouts-authoring.md §2.1). The engine
// and the linter know them from lib/core/pane-spec.js `LAYOUTS`. But an author browsing the
// Playground's picker or the Studio's add-slide gallery looks for them where every other slide
// shape lives, so each picker adds these two entries beside the manifests.
//
// Each entry is MANIFEST-SHAPED (name, function, form, substance, description, purpose, tags,
// sample, skeleton) so the pickers' shared code (families.mjs `buildCatalog`, the search index,
// the walk) takes it without a special case. Where they sit in the three groupings is the owner's
// ruling of 2026-09-29: Family "Split layouts", beside split-panel and split-compare, where people
// already look for a side-by-side slide; Function and Substance a group of their own, "Layout",
// because a layout does nothing by itself — its panes do the work.
//
// `label` is the Studio's plain-English name for the insert menu (§7.2: "Two columns", "Top and
// bottom"); the Playground lists class names, so it shows `name`. The Playground's samples and
// Explore walks are `PANE_LAYOUT_SAMPLES` in ./pane-layout-samples.mjs — a separate FILE, because
// the Studio imports this one into its budgeted eager bundle (docs/route-budget.json) and the
// bundler kept the samples in it when they shared a module. Every skeleton here, like every sample
// there, is lint-clean and renders as two panes (docs/src/lib/pane-layout-entries.test.ts).

const COLUMNS_SKELETON = `<!-- _class: columns -->

## The slide's point, in one line.

### First pane

- A point
- Another point

### Second pane

- A point
- Another point
`;

const ROWS_SKELETON = `<!-- _class: rows -->

## The slide's point, in one line.

### Top pane

- A point
- Another point

### Bottom pane

- A point
- Another point
`;

export const COLUMNS_DESCRIPTION = 'Two components side by side on one slide, at a ratio you choose.';
export const ROWS_DESCRIPTION = 'Two components stacked on one slide, one above the other.';

export const PANE_LAYOUT_ENTRIES = [
	{
		name: 'columns',
		label: 'Two columns',
		layout: true,
		function: 'layout',
		form: 'split',
		substance: 'layout',
		description: COLUMNS_DESCRIPTION,
		purpose:
			'Use when two components make one point together: a chart and what it means, before and after, a list beside a table. Write `_class: columns` (or `columns 60/40`), then each pane as a `### title` under an optional `<!-- _pane: component -->`.',
		tags: ['layout', 'two columns', 'side by side', 'split', 'panes', 'two up', 'before and after', 'compare'],
		skeleton: COLUMNS_SKELETON,
	},
	{
		name: 'rows',
		label: 'Top and bottom',
		layout: true,
		function: 'layout',
		form: 'split',
		substance: 'layout',
		description: ROWS_DESCRIPTION,
		purpose:
			'Use when two wide components make one point together: progress over a table, context over a chart. Write `_class: rows` (or `rows 35/65`), then each pane as a `### title` under an optional `<!-- _pane: component -->`.',
		tags: ['layout', 'rows', 'stacked', 'top and bottom', 'split', 'panes', 'two up'],
		skeleton: ROWS_SKELETON,
	},
];

/** The bucket a picker files a layout under (it has no engine bucket). */
export const LAYOUT_BUCKET = 'layout';
