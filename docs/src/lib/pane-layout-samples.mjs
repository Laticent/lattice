// The pane layouts' Playground samples and Explore walks (see ./pane-layout-entries.mjs for the
// entries themselves, and why these live in a file of their own). Every sample is lint-clean and
// renders as two panes: docs/src/lib/pane-layout-entries.test.ts renders each one.
import { COLUMNS_DESCRIPTION, ROWS_DESCRIPTION } from './pane-layout-entries.mjs';

const COLUMNS_SAMPLE = `<!-- _class: columns 60/40 -->

\`Q3 review\`

## Services outgrew licenses for the first time.

<!-- _pane: bar -->
### Revenue by line
\`$M, trailing four quarters\`

- Licenses \`42\`
- Services \`47\`
- Training \`9\`

<!-- _pane: list -->
### What changed

- Services passed licenses in March
- Two renewals slipped to Q4

> The mix shift is structural, not seasonal.
`;

const COLUMNS_OUTLINE = `<!-- _class: columns -->

\`Support · after the migration\`

## The migration halved support tickets.

### Before

- 1,240 tickets a month
- 31 hours to first reply
- Four tools to answer one question

### After

- 610 tickets a month
- 6 hours to first reply
- One console for every question
`;

const COLUMNS_TABLE = `<!-- _class: columns 40/60 dark -->

## Two vendors cleared the security review.

<!-- _pane: list -->
### Cleared

- Northwind
- Contoso

<!-- _pane: table -->
### Findings by vendor

| Vendor | Critical | High | Status |
|---|---|---|---|
| Northwind | 0 | 1 | Cleared |
| Contoso | 0 | 2 | Cleared |
| Fabrikam | 2 | 4 | Rejected |

> Fabrikam can re-apply after its Q1 fixes.
`;

const ROWS_SAMPLE = `<!-- _class: rows -->

## Hiring kept pace with the plan through Q3.

<!-- _pane: progress -->
### Hired against plan

- Engineering \`98%\`
- Sales \`92%\` \`at-risk\`

<!-- _pane: table -->
### By function

| Function | Plan | Hired |
|---|---|---|
| Engineering | 120 | 118 |
| Sales | 60 | 55 |
`;

const ROWS_CONTEXT = `<!-- _class: rows 35/65 -->

## Three regions carried the quarter.

### What happened

Two renewals and a price rise lifted EMEA and APAC; North America held.

<!-- _pane: bar -->
### Revenue by region
\`$M, Q3\`

- North America \`4.2\`
- EMEA \`3.1\`
- APAC \`1.8\`
`;

/** Add a footer under the slide's `_class`, as the component galleries do (`injectFooter`). */
const withFooter = (md, footer) => md.replace(/^(<!--\s*_class:[^>]*-->)/, `$1\n<!-- _footer: "${footer}" -->`);

const titleSlide = (name, eyebrow, description) => ({
	kind: 'title',
	caption: description,
	md: `<!-- _class: title silent -->\n\n# ${name}\n\n\`${eyebrow}\`\n\n${description}`,
});

/**
 * The Playground's extra: each layout's one-slide `sample` (what Edit loads) and its Explore walk
 * `plan`, in `galleryPlan`'s shape (tools/build-component-docs.js). Imported by the Playground
 * page and its asset sync only, never by the Studio (see pane-layout-entries.mjs).
 */
export const PANE_LAYOUT_SAMPLES = {
	columns: {
		sample: COLUMNS_SAMPLE,
		plan: [
			titleSlide('columns', 'Layout · two panes side by side', COLUMNS_DESCRIPTION),
			{ kind: 'default', caption: 'A chart and what it means, at 60/40.', md: withFooter(COLUMNS_SAMPLE, 'Default · columns 60/40') },
			{ kind: 'example:outline', caption: 'No markers: each ### starts a text pane.', md: withFooter(COLUMNS_OUTLINE, 'Outline · columns') },
			{ kind: 'example:table', caption: 'A list beside a table, on a dark slide.', md: withFooter(COLUMNS_TABLE, 'List and table · columns 40/60 dark') },
		],
	},
	rows: {
		sample: ROWS_SAMPLE,
		plan: [
			titleSlide('rows', 'Layout · two panes stacked', ROWS_DESCRIPTION),
			{ kind: 'default', caption: 'Progress over the table behind it.', md: withFooter(ROWS_SAMPLE, 'Default · rows') },
			{ kind: 'example:context', caption: 'A line of context over a chart, at 35/65.', md: withFooter(ROWS_CONTEXT, 'Context and chart · rows 35/65') },
		],
	},
};
