// The STUDIO WALKTHROUGH storyboard — the script the demo director plays. It reuses
// the exec-board-update journey (a Q4 board deck the Coach scores board-ready), so
// the demo showcases a REAL, deterministic success path: compose → coach → present
// → export, with no AI call and no key spend (HARD RULE #24). Every `act` closure
// pokes a real Studio setter; the selectors only tell the cursor where to point.

import type { DemoStep, Storyboard } from './demo-director';
import { setGroupToken } from './slide-directives';
import { setFinish, setStampStyle } from './slide-provenance';

// The mutually-exclusive per-slide STATE group (lib UNIVERSAL_GROUPS.state) — set
// `wip` and the others are cleared. Hardcoded here so the storyboard stays a plain
// data module (no lintVocab handoff needed for the closing flourish).
const STATE_MEMBERS = ['wip', 'draft', 'tbd', 'confidential', 'redacted', 'archived', 'pinned', 'revised'] as const;

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
	slideSettings: '[aria-label="Slide settings"]',
	deckSwitcher: '[data-demo="deck-switcher"]',
	newDeck: '[data-demo="new-deck"]',
} as const;

const steps: DemoStep[] = [
	{
		say: 'The Studio — a ~90-second live demo that drives itself: it builds a board deck, coaches it, and ships it.',
		settle: 1800,
	},
	// The first-time experience starts where every deck does — the deck switcher.
	{
		say: 'Every deck starts the same way — from the deck menu.',
		moveTo: SEL.deckSwitcher,
		click: true,
		act: (a) => a.openDeckMenu(true),
		settle: 950,
	},
	{
		say: 'New deck — a blank canvas, titled “My First Deck.”',
		moveTo: SEL.newDeck,
		click: true,
		// A real, persisted deck (deduped first, so a re-run never doubles it). It
		// blanks the canvas, switches to it, and closes the menu — the newcomer keeps it.
		act: (a) => {
			a.createFirstDeck();
			a.openDeckMenu(false);
		},
		settle: 900,
	},
	{
		say: 'You write in plain Markdown on the left…',
		moveTo: SEL.editor,
		click: true,
		settle: 300,
	},
	// Slide 1 is the hero — typed at a readable pace so the eye can follow it land.
	{
		say: '…and the engine renders it live on the right, as you type.',
		type: upTo(1),
		cadence: 24,
		settle: 550,
	},
	// The first "look what it made" beat — circle the preview while its frame glows.
	{
		moveTo: SEL.preview,
		circle: SEL.preview,
		say: 'Every slide is a boardroom-grade layout — no fiddling with boxes.',
		settle: 900,
	},
	// Build the rest slide by slide. Each slide is typed, then held past the preview's
	// ~140ms render debounce, so the preview repaints THAT slide before the next —
	// editor and preview stay in sync (a single fast burst freezes the preview on the
	// last-rendered slide until it settles). Reads as "watch the deck build."
	{
		say: 'Now watch the rest build — slide by slide.',
		moveTo: SEL.editor,
		click: true,
		type: upTo(2),
		cadence: 7,
		settle: 340,
	},
	{ type: upTo(3), cadence: 6, settle: 380 },
	{ type: upTo(4), cadence: 6, settle: 320 },
	{ type: upTo(5), cadence: 6, settle: 320 },
	{ type: upTo(6), cadence: 6, settle: 420 },
	{
		moveTo: SEL.rail,
		say: 'Six slides, drafted in seconds. Jump to any of them.',
		act: (a) => a.gotoSlide(2),
		click: true,
		settle: 950,
	},
	{
		say: 'Reskin the entire deck with one theme — the layouts never change, only the palette.',
		act: (a) => a.openInspector(true),
		settle: 400,
	},
	// Circle the preview again on the reskin, so the eye catches the whole deck reshade.
	{
		moveTo: SEL.theme,
		click: true,
		act: (a) => a.setPalette('cuoio'),
		circle: SEL.preview,
		settle: 900,
	},
	{
		moveTo: SEL.mode,
		say: 'Light or dark, instantly — the theme carries both.',
		click: true,
		act: (a) => a.toggleMode(),
		settle: 1100,
	},
	{
		moveTo: SEL.architect,
		say: 'The Architect Coach scores the deck against a boardroom rubric.',
		click: true,
		act: (a) => {
			a.openArchitect(true);
			a.setArchitectTab('coach');
		},
		settle: 1650,
	},
	{
		say: 'Board-ready. Now present it full-screen…',
		moveTo: SEL.present,
		click: true,
		act: (a) => a.openPresent(true),
		settle: 1650,
	},
	{
		act: (a) => a.openPresent(false),
		settle: 400,
	},
	{
		say: '…or export a pixel-perfect PDF, ready for the boardroom.',
		moveTo: SEL.share,
		click: true,
		act: (a) => a.openShare(true),
		settle: 1750,
	},
	{
		act: (a) => a.openShare(false),
		settle: 350,
	},
	// ── The closing flourish: polish the hero via its own settings, then present it. ──
	{
		say: 'One last thing — let’s make the title unmistakably yours.',
		moveTo: SEL.rail,
		act: (a) => a.gotoSlide(0),
		click: true,
		settle: 900,
	},
	{
		say: 'Every slide has its own controls.',
		moveTo: SEL.slideSettings,
		click: true,
		act: (a) => a.openSlideSettings(true),
		settle: 800,
	},
	{
		say: 'A finish — Nimbus lays a soft glow behind the title…',
		act: (a) => a.mutateSlide((c) => setFinish(c, 'nimbus')),
		settle: 950,
	},
	{
		say: '…and a status stamp — WIP, in a bracket.',
		act: (a) => {
			a.mutateSlide((c) => setGroupToken(c, STATE_MEMBERS, 'wip'));
			a.mutateSlide((c) => setStampStyle(c, 'bracket'));
		},
		settle: 1000,
	},
	// Close the drawer to reveal the polished preview, and spotlight the trade: one
	// changed line of source ↔ a transformed title.
	{
		say: 'One line of source changed…',
		act: (a) => a.openSlideSettings(false),
		circle: SEL.editor,
		settle: 400,
	},
	{
		say: '…a boardroom-beautiful title.',
		circle: SEL.preview,
		settle: 900,
	},
	// Slam into Present, full-screen, on the glowing hero.
	{
		say: 'This is the Studio. Now go build yours.',
		moveTo: SEL.present,
		click: true,
		act: (a) => a.openPresent(true),
		settle: 3200,
	},
];

export const studioWalkthrough: Storyboard = {
	seed: '',
	steps,
};
