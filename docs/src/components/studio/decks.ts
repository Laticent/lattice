// Demo decks for the Studio prototype. Plain Markdown using shipped Lattice
// component classes — the Compose preview renders these LIVE through the engine
// (DeckPreview), so they must be valid deck source authored to each component's
// contract (lib/components/<bucket>/<name>/<name>.docs.md). Every slide is a real
// board-grade component — no bare Markdown — so navigating the deck reads like a
// finished boardroom pack, not notes.

export type StudioDeck = {
	id: string;
	title: string;
	meta: string;
	/** Per-slide source; joined with `\n\n---\n\n` for the engine. */
	slides: string[];
};

export const DECKS: StudioDeck[] = [
	{
		// The newcomer's first deck (DECKS[0] → the first-run default). It is itself a
		// board-grade deck ABOUT Lattice: brief, one distinct component per slide, so a
		// first-time author learns the system by reading a beautiful deck, then edits it
		// or starts their own. Design: engineering/decisions/2026-06-30-studio-newcomer-onboarding.md.
		id: 'welcome',
		// A deck is named by its first heading (studio-store.titleFromSource), so this
		// declared title must BE that heading — it is only the seed/fallback for the
		// index, and a drift test (decks.test.ts) fails if the two ever disagree.
		title: 'Markdown for the boardroom',
		meta: '7 slides',
		slides: [
			`<!-- _class: title -->\n\n# Markdown for the boardroom\n\n\`Lattice · A guided tour\`\n\nWrite plain text. Ship a deck with the taste built in.`,
			`<!-- _class: big-number -->\n\n\`The whole idea\`\n\n- 0\n  - boxes to drag — you write Markdown, the engine designs the slide.`,
			`<!-- _class: stats -->\n\n\`What's in the box\`\n\n## Everything you need to ship, already designed.\n\n1. 53\n   - components\n2. 14\n   - themes\n3. 4\n   - export formats\n4. 1\n   - source file`,
			`<!-- _class: cards-grid -->\n\n## Four moves, from blank page to boardroom.\n\n- Write.\n  - Plain Markdown — headings, lists, tables, even \`$math$\`. No drawing tools.\n- Choose a component.\n  - Tag a slide with one directive and it composes itself to the boardroom bar.\n- Render anywhere.\n  - One source becomes a PDF, a PowerPoint, an HTML deck, or a PNG set.\n- Restyle in a click.\n  - Swap the theme; every slide re-skins, and the layout never drifts.`,
			`<!-- _class: split-compare -->\n\n\`Why Lattice\`\n\n## Drag-the-box tools vs. a deck that designs itself.\n\nBoth put pixels on a slide. Only one keeps its taste when the content changes.\n\n- Slide editors\n  - You place every box, line, and color by hand\n  - Restyling means re-touching slides one by one\n  - Consistency depends on whoever edited last\n- Lattice\n  - You write the content; the engine composes the slide\n  - One theme restyles the whole deck, instantly\n  - The design system holds the line on every slide\n\n> Stop maintaining slides — write the substance and let the engine handle the finish.`,
			`<!-- _class: list-steps timeline -->\n\n## From keystroke to boardroom, in one pass.\n\n1. Write\n   - *Author the deck as plain Markdown in any editor.*\n2. Render\n   - *The engine lays out every slide in your theme.*\n3. Ship\n   - *Export to PDF, PowerPoint, HTML, or PNG — same source.*`,
			`<!-- _class: closing -->\n\n## Now make it yours — edit any slide, or start a new deck.\n\n\`Your move\``,
		],
	},
	{
		id: 'q3-board',
		title: 'Q3 Board Review',
		meta: '6 slides',
		slides: [
			`<!-- _class: title -->\n\n# Q3 Board Review\n\n\`Board · Q3 2026\`\n\nSteady growth, disciplined spend.`,
			`<!-- _class: agenda -->\n\n## What this review covers.\n\n1. The quarter in four numbers\n2. What customers told us\n3. How the funnel converted\n4. Where we invest next`,
			`<!-- _class: kpi -->\n\n\`Financial · Q3 2026\`\n\n## The quarter in four numbers\n\n1. $4.2M\n   - Net revenue\n   - target $4.0M · +18% YoY \`On plan\` \`Board\`\n2. +18%\n   - YoY growth\n   - vs +12% last quarter \`On plan\` \`Investor\`\n3. 142\n   - New logos\n   - target 120 · +18% \`On plan\` \`Sales\`\n4. 1.4%\n   - Net churn\n   - target < 2% \`On plan\` \`Success\``,
			`<!-- _class: quote -->\n\n> Retention did the heavy lifting this quarter — the base expanded faster than we closed new logos.\n\n— Maya Chen, COO`,
			`<!-- _class: stats -->\n\n\`Funnel · Q3 2026\`\n\n## How the funnel converted, stage to stage.\n\n1. 38%\n   - Trial → activation\n2. 61%\n   - Activation → paid\n3. 124%\n   - Net revenue retention\n4. 11 mo\n   - CAC payback`,
			`<!-- _class: closing -->\n\n## Invest behind retention — it is the cheapest growth we have.\n\n\`Q4 plan follows\``,
		],
	},
	{
		id: 'product-strategy',
		title: 'FY26 Product Strategy',
		meta: '5 slides',
		slides: [
			`<!-- _class: title -->\n\n# FY26 Product Strategy\n\n\`Product · FY26\`\n\nThree bets, one platform.`,
			`<!-- _class: agenda -->\n\n## The plan in four moves.\n\n1. Where the leverage is\n2. The three bets\n3. What we stop doing\n4. The one metric that matters`,
			`<!-- _class: kpi -->\n\n\`Leverage · FY26\`\n\n## Where the leverage is\n\n1. 3×\n   - Faster onboarding\n   - target 2× · +50% \`On plan\` \`Product\`\n2. 92%\n   - Gross margin\n   - +4pp YoY \`On plan\` \`Finance\`\n3. 11\n   - Net-new integrations\n   - target 8 · +38% \`On plan\` \`Platform\``,
			`<!-- _class: cards-grid -->\n\n## Three bets, one platform.\n\n- Compose\n  - Author once, present anywhere — Markdown in, boardroom out.\n- Reader\n  - Meet the audience where they are: deck, summary, or one-pager.\n- Studio\n  - One workspace; no tool-switching between edit, present, and theme.`,
			`<!-- _class: closing -->\n\n## One platform, three bets — shipped this year.\n\n\`Roadmap in the appendix\``,
		],
	},
];

/** The full engine source for a deck (slides joined with separators). */
export function deckSource(deck: StudioDeck): string {
	return deck.slides.join('\n\n---\n\n');
}

/** A safe `.md` filename from a deck title — slugified, never empty. */
export function deckFilename(title: string): string {
	const slug = String(title ?? '')
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
	return `${slug || 'deck'}.md`;
}
