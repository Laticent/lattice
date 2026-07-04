// The STUDIO WALKTHROUGH storyboard — the script the demo director plays. It reuses
// the exec-board-update journey (a Q4 board deck the Coach scores board-ready), so
// the demo showcases a REAL, deterministic success path: compose → coach → present
// → export, with no AI call and no key spend (HARD RULE #24). Every `act` closure
// pokes a real Studio setter; the selectors only tell the cursor where to point.

import type { DemoStep, Storyboard } from './demo-director';

// The six board slides, authored to the shipped component contracts (title / agenda
// / kpi / quote / stats / closing) — the same shapes exec-board-update.spec.ts proves.
const SLIDES = [
	'<!-- _class: title -->\n\n# Q4 Board Update\n\n`Board · Q4 2026`\n\nGrowth held; spend stayed disciplined.',
	'<!-- _class: agenda -->\n\n## What this update covers.\n\n1. The quarter in four numbers\n2. What customers told us\n3. How the funnel converted\n4. The ask for Q1',
	'<!-- _class: kpi -->\n\n`Financial · Q4 2026`\n\n## The quarter in four numbers\n\n1. $4.6M\n   - Net revenue\n   - target $4.4M · +16% YoY `On plan` `Board`\n2. +16%\n   - YoY growth\n   - vs +18% last quarter `On plan` `Investor`\n3. 155\n   - New logos\n   - target 130 · +19% `On plan` `Sales`\n4. 1.2%\n   - Net churn\n   - target < 2% `On plan` `Success`',
	'<!-- _class: quote -->\n\n> Expansion outpaced new business again — the platform bet is compounding.\n\n— Maya Chen, COO',
	'<!-- _class: stats -->\n\n`Funnel · Q4 2026`\n\n## How the funnel converted, stage to stage.\n\n1. 41%\n   - Trial → activation\n2. 63%\n   - Activation → paid\n3. 127%\n   - Net revenue retention\n4. 10 mo\n   - CAC payback',
	'<!-- _class: closing -->\n\n## Fund the expansion motion — it is the cheapest growth we have.\n\n`Q1 plan follows`',
];
const SEP = '\n\n---\n\n';
/** The source after the first `k` slides have been typed. */
const upTo = (k: number) => SLIDES.slice(0, k).join(SEP);

// Selectors — existing aria-labels / ids where they exist, plus a few `data-demo`
// anchors added in StudioShell for controls that carry only a `title`.
const SEL = {
	editor: '#studio-pane-editor',
	preview: '#studio-pane-preview',
	rail: 'nav[aria-label="Slide navigator"]',
	architect: '[aria-label="Toggle Architect"]',
	inspector: '[aria-label="Toggle Deck inspector"]',
	theme: '[aria-label="Choose theme"]',
	mode: '[data-demo="mode"]',
	present: '[data-demo="present"]',
	share: '[data-demo="share"]',
} as const;

const steps: DemoStep[] = [
	{
		say: 'Meet the Studio — one workspace to compose, coach, present, and export a deck.',
		settle: 1600,
	},
	{
		say: 'You write in plain Markdown on the left…',
		moveTo: SEL.editor,
		click: true,
		settle: 400,
	},
	{
		say: '…and the engine renders it live on the right, as you type.',
		type: upTo(1),
		cadence: 26,
		settle: 700,
	},
	{
		moveTo: SEL.preview,
		say: 'Every slide is a boardroom-grade layout — no fiddling with boxes.',
		settle: 1500,
	},
	{
		say: 'A `---` starts each new slide. Here comes the rest of the board update…',
		moveTo: SEL.editor,
		click: true,
		type: upTo(3),
		cadence: 9,
		settle: 500,
	},
	// Split the remaining slides into a second beat so each typed run stays under
	// the director's instant-paste threshold and actually animates as typing.
	{
		type: upTo(6),
		cadence: 7,
		settle: 800,
	},
	{
		moveTo: SEL.rail,
		say: 'Six slides, drafted in seconds. Jump to any of them.',
		act: (a) => a.gotoSlide(2),
		click: true,
		settle: 1500,
	},
	{
		say: 'Reskin the entire deck with one theme — the layouts never change, only the palette.',
		act: (a) => a.openInspector(true),
		settle: 500,
	},
	{
		moveTo: SEL.theme,
		click: true,
		act: (a) => a.setPalette('cuoio'),
		settle: 1400,
	},
	{
		moveTo: SEL.mode,
		say: 'Light or dark, instantly — the theme carries both.',
		click: true,
		act: (a) => a.toggleMode(),
		settle: 1500,
	},
	{
		moveTo: SEL.architect,
		say: 'The Architect Coach scores the deck against a boardroom rubric.',
		click: true,
		act: (a) => {
			a.openArchitect(true);
			a.setArchitectTab('coach');
		},
		settle: 2200,
	},
	{
		say: 'Board-ready. Now present it full-screen…',
		moveTo: SEL.present,
		click: true,
		act: (a) => a.openPresent(true),
		settle: 2200,
	},
	{
		act: (a) => a.openPresent(false),
		settle: 500,
	},
	{
		say: '…or export a pixel-perfect PDF, ready for the boardroom.',
		moveTo: SEL.share,
		click: true,
		act: (a) => a.openShare(true),
		settle: 2400,
	},
	{
		act: (a) => a.openShare(false),
		settle: 400,
	},
	{
		say: "That's the Studio. Click anywhere to start building your own deck.",
		settle: 2600,
	},
];

export const studioWalkthrough: Storyboard = {
	seed: '',
	steps,
};
