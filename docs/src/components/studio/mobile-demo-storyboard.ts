// The PHONE-NATIVE Studio walkthrough — the single-pane sibling of demo-storyboard.ts.
//
// A phone (≤699px) shows ONE pane at a time (`mobilePane: 'edit' | 'preview'`), so the
// desktop demo's magic — editor + preview side by side, watch it render AS you type — is
// physically impossible. This storyboard replaces simultaneity with a RHYTHM: per-slide
// alternation. Tap Edit → type a slide → tap Preview to reveal it → repeat. The preview is
// the star; the editor is a brief, narrated punctuation that proves "it's just Markdown."
// (Design: engineering/decisions/2026-07-04-studio-demo-walkthrough.md § Phone-native.)
//
// Two constraints from the mobile Studio shape the beat grammar:
//   1. The pane is CONDITIONALLY RENDERED, so the editor UNMOUNTS on Preview. Typing can
//      only happen while Edit is mounted, and a swap BACK to Edit remounts it (re-init from
//      the `source` state, which typeTail keeps current — so accumulated slides survive).
//      Each swap-to-edit therefore gates on `until(editorMounted)` before typing.
//   2. The slide-nav rail is a segment on mobile, so desktop's `railReady(k)` has nothing
//      to read. Each reveal is timed by a `settle` past the preview's render debounce —
//      parent-DOM only, no preview-iframe coupling (same discipline as the desktop script).
//
// The interpreter runs `say → point+click → act → type → until → gesture → settle`, so a
// single beat can't both swap-then-wait AND type (type would fire before the until gate).
// The per-slide unit is thus THREE beats: tap-Edit(+wait) · type · tap-Preview(+reveal).

import { type Step, storyboard, type Walkthrough } from '../../lib/vetrina';
import type { StudioActions } from './demo-storyboard';

// The phone deck — four showpieces, not the desktop six-slide board narrative. Short and
// sweet: a title, one punchy number, a chart (the "wait, that came from Markdown?" beat),
// and a close. Authored to the shipped component contracts (anchor/title, statement/
// big-number, chart/radar, anchor/closing) — the same shapes the galleries prove.
const SLIDES = [
	'<!-- _class: title -->\n\n# Q4 Board Update\n\n`Board · Q4 2026`\n\nGrowth held; spend stayed disciplined.',
	'<!-- _class: big-number -->\n\n`Net Revenue Retention`\n\n- 127%\n  - Expansion outran churn every month this quarter.',
	'<!-- _class: radar -->\n\n`Scale · 0–10`\n\n## Where the platform bet is paying off.\n\n- This quarter\n  - Coverage `8`\n  - Reliability `9`\n  - Velocity `7`\n  - Cost control `8`\n  - Sentiment `9`\n- A year ago\n  - Coverage `5`\n  - Reliability `6`\n  - Velocity `4`\n  - Cost control `6`\n  - Sentiment `5`',
	'<!-- _class: closing -->\n\n## Fund the expansion motion — it is the cheapest growth we have.\n\n`Q1 plan follows`',
];
const SEP = '\n\n---\n\n';
/** The source after the first `k` slides have been typed (ctx.type diffs this against the
 *  run baseline and appends only the new tail via typeTail — so it round-trips across the
 *  editor's unmount/remount, the doc and the baseline staying in lockstep). */
const upTo = (k: number) => SLIDES.slice(0, k).join(SEP);

// Selectors — the mobile controls. The pane toggle carries `data-demo` anchors (added to
// PaneBtn in StudioShell); the deck switcher / New-deck item are not mobile-gated; Present /
// Share / Toggle Architect ride the mobile pane bar with aria-labels; the theme picker lives
// in the Inspector SHEET and is reachable because the stage resolves against the whole doc.
const SEL = {
	editor: '#studio-pane-editor',
	preview: '#studio-pane-preview',
	paneEdit: '[data-demo="pane-edit"]',
	panePreview: '[data-demo="pane-preview"]',
	deckSwitcher: '[data-demo="deck-switcher"]',
	theme: '[aria-label="Choose theme"]',
	architect: '[aria-label="Toggle Architect"]',
	present: '[aria-label="Present"]',
	share: '[aria-label="Share"]',
} as const;
/** The New Deck item lives in a Radix menu portalled to <body> — a whole-document thunk. */
const newDeckItem = () => document.querySelector<HTMLElement>('[data-demo="new-deck"]');
/** True once the editor pane has REMOUNTED after a swap-to-edit — its CodeMirror content
 *  node is in the DOM, so `typeTail` has a live view to append into. The `until` gate that
 *  makes per-slide alternation safe on a surface where the editor comes and goes. */
const editorMounted = () => !!document.querySelector(`${SEL.editor} .cm-content`);
/** True once the live preview has actually PAINTED a slide. The mobile pane swap REMOUNTS the
 *  preview (a fresh iframe that reloads + re-renders), so the reveal MUST wait for the real
 *  paint — a fixed settle races the reload and you never see the slide render (the whole point
 *  of a live demo). The preview is a SAME-ORIGIN srcdoc frame (component-transformer threat
 *  model §5.1), so its document is readable from here; `contentDocument` is null mid-load, so
 *  optional chaining reports "not painted yet" until the engine has rendered a `.lattice`. */
const previewPainted = (): boolean => {
	const doc = document.querySelector<HTMLIFrameElement>('[aria-label="Live deck preview"] iframe')?.contentDocument;
	const slide = doc?.querySelector('.lattice');
	return !!slide && (slide.textContent ?? '').trim().length > 0;
};
/** True once the preview is DISPLAYING slide `k` — its "Slide N / M" header reads N === k — AND
 *  has painted. Gating on the specific slide (not just "something painted") means the reveal
 *  shows the slide JUST TYPED, never the stale first slide the remount can flash before it
 *  advances. The counter is parent-DOM; the paint is the same-origin frame check above. */
const previewShowsSlide = (k: number) => (): boolean => {
	const m = document.querySelector(SEL.preview)?.textContent?.match(/Slide\s+(\d+)\s*\/\s*(\d+)/);
	return !!m && Number(m[1]) === k && previewPainted();
};

/** One slide of the per-slide-alternation core: tap Edit and wait for the remount, type the
 *  slide, then tap Preview, WAIT for the engine to paint it, and linger so the viewer sees it.
 *  `reveal` narrates the flip; `wow` circles the (now really painted) preview. */
function buildSlide(k: number, opts: { teach?: string; reveal: string; cadence?: number; wow?: boolean }): Step<StudioActions>[] {
	return [
		// Tap Edit → swap → wait for the editor to remount before any typing.
		{ say: opts.teach, point: SEL.paneEdit, click: true, act: (a) => a.setMobilePane('edit'), until: editorMounted, settle: 400 },
		// Type slide k (ctx.type appends only the new tail; the editor is mounted + focused).
		{ point: SEL.editor, type: { target: SEL.editor, text: upTo(k), cadence: opts.cadence ?? 8 }, settle: 350 },
		// Tap Preview → swap → WAIT until the preview is actually SHOWING slide k, painted (not a
		// settle racing the iframe reload, not a stale first-slide flash) → then linger ~2.2s so
		// the rendered slide really registers. The circle (wow) plays after `until`, so it rings
		// the right, painted slide.
		{ say: opts.reveal, point: SEL.panePreview, click: true, act: (a) => a.setMobilePane('preview'), until: previewShowsSlide(k), settle: 2200, ...(opts.wow ? { circle: SEL.preview } : {}) },
	];
}

const steps: Step<StudioActions>[] = [
	{
		say: 'The Studio — on your phone. A live demo that builds a deck, coaches it, and ships it. Tap anywhere to take over.',
		settle: 1900,
	},
	// Every deck starts from the deck menu — visible in the top bar on every pane.
	{
		say: 'Every deck starts the same way — from the deck menu.',
		point: SEL.deckSwitcher,
		click: true,
		act: (a) => a.openDeckMenu(true),
		settle: 950,
	},
	{
		say: 'New deck — a blank canvas, titled “My First Deck.”',
		point: newDeckItem,
		click: true,
		// A real, persisted deck (deduped first, so a re-run never doubles it). Because we're
		// on the Preview pane the editor is unmounted, so its doc is minted blank on the next
		// swap-to-edit — no seed to append onto.
		act: (a) => {
			a.createFirstDeck();
			a.openDeckMenu(false);
			a.setMobilePane('preview');
		},
		settle: 900,
	},
	// ── The four showpieces, each type-then-reveal. Slide 1 teaches the mechanism; the
	//    radar is the "it drew a CHART from Markdown?" beat, so it gets the circle. ──
	...buildSlide(1, { teach: 'You write in plain Markdown on the Edit pane…', reveal: '…then tap Preview — a boardroom-grade layout, instantly.', cadence: 22, wow: true }),
	...buildSlide(2, { teach: 'One punchy number.', reveal: 'The whole slide is the metric.', cadence: 10 }),
	...buildSlide(3, { teach: 'A few lines with values…', reveal: '…and the engine draws the chart.', cadence: 8, wow: true }),
	...buildSlide(4, { teach: 'And a close.', reveal: 'Four slides, drafted in a tap.', cadence: 8 }),
	// ── Reskin: the Inspector opens as a sheet; pick a theme, close it to reveal the reshade. ──
	{
		say: 'Reskin the whole deck with one theme — the layouts never change, only the palette.',
		act: (a) => a.openInspector(true),
		settle: 700,
	},
	{
		point: SEL.theme,
		click: true,
		act: (a) => a.setPalette('cuoio'),
		settle: 800,
	},
	{
		say: 'Light or dark — instantly.',
		act: (a) => {
			a.openInspector(false);
			a.toggleMode();
		},
		circle: SEL.preview,
		settle: 1800, // close the sheet, then linger on the reshaded + mode-flipped deck
	},
	// ── The Coach — a sheet on mobile; scores the deck board-ready. ──
	{
		say: 'The Architect Coach scores the deck against a boardroom rubric.',
		point: SEL.architect,
		click: true,
		act: (a) => {
			a.openArchitect(true);
			a.setArchitectTab('coach');
		},
		settle: 2200, // let the score land + the viewer read it
	},
	{
		act: (a) => a.openArchitect(false),
		instant: true,
		settle: 250,
	},
	// ── Present, then Share — both full-screen/sheet from the pane bar. ──
	{
		say: 'Board-ready. Present it full-screen…',
		point: SEL.present,
		click: true,
		act: (a) => a.openPresent(true),
		settle: 2200,
	},
	{
		act: (a) => a.openPresent(false),
		instant: true,
		settle: 250,
	},
	{
		say: '…or export a pixel-perfect PDF, ready for the boardroom.',
		point: SEL.share,
		click: true,
		act: (a) => a.openShare(true),
		settle: 2200,
	},
	{
		act: (a) => a.openShare(false),
		instant: true,
		settle: 250,
	},
	// ── Land on the finished deck in the preview. ──
	{
		say: 'This is the Studio in your pocket. Now go build yours.',
		point: SEL.panePreview,
		click: true,
		act: (a) => a.setMobilePane('preview'),
		circle: SEL.preview,
		settle: 3000,
	},
];

export const studioMobileWalkthrough: Walkthrough<StudioActions> = storyboard<StudioActions>('', steps);
