// The TOUR TOOLKIT — the shared, responsive plumbing every "Show Me" tour composes from.
//
// Five tours tell five different stories, but they drive the SAME Studio with the same physics:
//   • Desktop / tablet show editor + preview SIDE BY SIDE — type on the left, watch it render on
//     the right, in one beat.
//   • A phone (≤699px) shows ONE swappable pane — so a "build a slide" beat becomes THREE beats:
//     tap Edit → type → tap Preview → reveal.
// Rather than fork every tour, the responsive branch lives HERE, in `revealSlide`, and each tour
// just says "reveal slide k with this teach line and this reveal line." Everything is authored to
// the Teaching Beat (`read: true` + a caption sized by `readMs`) so a human has time to digest.
//
// Selectors resolve ROOT-scoped (Vetrina default). Present/Share carry a `data-demo` on desktop
// but only an `aria-label` in the mobile pane bar, so those use a UNION selector that matches
// either. The New-Deck item is portalled to <body>, so it needs a whole-document thunk.

import { type Step, storyboard, type Walkthrough } from '../../../lib/vetrina';
import type { StudioActions } from '../studio-actions';

export type TourStep = Step<StudioActions>;
/** A tour is built responsively from one flag — the same script adapts to phone vs. side-by-side. */
export type TourBuild = (opts: { mobile: boolean }) => Walkthrough<StudioActions>;

// ── Canonical slide sources (authored to the shipped component contracts) ──────────────────────
export const SLIDE = {
	title: '<!-- _class: title -->\n\n# Q4 Board Update\n\n`Board · Q4 2026`\n\nGrowth held; spend stayed disciplined.',
	bigNumber: '<!-- _class: big-number -->\n\n`Net Revenue Retention`\n\n- 127%\n  - Expansion outran churn every month this quarter.',
	radar:
		'<!-- _class: radar -->\n\n`Scale · 0–10`\n\n## Where the platform bet is paying off.\n\n- This quarter\n  - Coverage `8`\n  - Reliability `9`\n  - Velocity `7`\n  - Cost control `8`\n  - Sentiment `9`\n- A year ago\n  - Coverage `5`\n  - Reliability `6`\n  - Velocity `4`\n  - Cost control `6`\n  - Sentiment `5`',
	quote: '<!-- _class: quote -->\n\n> Expansion outpaced new business again — the platform bet is compounding.\n\n— Maya Chen, COO',
	kpi: '<!-- _class: kpi -->\n\n`Financial · Q4 2026`\n\n## The quarter in four numbers\n\n1. $4.6M\n   - Net revenue\n   - target $4.4M · +16% YoY `On plan` `Board`\n2. +16%\n   - YoY growth\n   - vs +18% last quarter `On plan` `Investor`\n3. 155\n   - New logos\n   - target 130 · +19% `On plan` `Sales`\n4. 1.2%\n   - Net churn\n   - target < 2% `On plan` `Success`',
	closing: '<!-- _class: closing -->\n\n## Fund the expansion motion — it is the cheapest growth we have.\n\n`Q1 plan follows`',
} as const;

const SEP = '\n\n---\n\n';
/** The cumulative source after the first `k` of `slides` have been typed. */
export const upTo = (slides: string[], k: number): string => slides.slice(0, k).join(SEP);

// ── Selectors ──────────────────────────────────────────────────────────────────────────────────
export const SEL = {
	editor: '#studio-pane-editor',
	preview: '#studio-pane-preview',
	rail: 'nav[aria-label="Slide navigator"]',
	paneEdit: '[data-demo="pane-edit"]',
	panePreview: '[data-demo="pane-preview"]',
	deckSwitcher: '[data-demo="deck-switcher"]',
	// The deck-theme control inside the deck-scope Settings panel. (Was
	// '[aria-label="Choose theme"]', which matched NOTHING — the real label is
	// "Choose deck theme"; the reskin() cursor pointed at a missing node.)
	theme: '[aria-label="Choose deck theme"]',
	architect: '[aria-label="Toggle Architect"]',
	mode: '[data-demo="mode"]',
	slideSettings: '[aria-label="Slide settings"]',
	// Union selectors — desktop carries data-demo, the mobile pane bar carries only aria-label.
	present: '[data-demo="present"], [aria-label="Present"]',
	share: '[data-demo="share"], [aria-label="Share"]',
} as const;
/** The New Deck item lives in a Radix menu portalled to <body> — a whole-document thunk. */
export const newDeckItem = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-demo="new-deck"]');

// ── Readiness gates (parent-DOM; the same signals the e2e trusts) ───────────────────────────────
/** True once the deck has PARSED into ≥ `k` slides — the desktop rail shows one button per slide. */
export const railReady = (k: number) => (): boolean => document.querySelectorAll(`${SEL.rail} button`).length >= k;
/** True once the editor's CodeMirror content node is live (both mobile panes stay mounted, so
 *  effectively always true — a cheap guard kept in case the layout ever reverts to conditional). */
export const editorMounted = (): boolean => !!document.querySelector(`${SEL.editor} .cm-content`);
/** True once the live preview (a SAME-ORIGIN srcdoc frame) has PAINTED a slide. */
export const previewPainted = (): boolean => {
	const doc = document.querySelector<HTMLIFrameElement>('[aria-label="Live deck preview"] iframe')?.contentDocument;
	const slide = doc?.querySelector('.lattice');
	return !!slide && (slide.textContent ?? '').trim().length > 0;
};
/** True once the phone preview is DISPLAYING slide `k` (its "Slide N / M" header) AND has painted. */
export const previewShowsSlide = (k: number) => (): boolean => {
	const m = document.querySelector(SEL.preview)?.textContent?.match(/Slide\s+(\d+)\s*\/\s*(\d+)/);
	return !!m && Number(m[1]) === k && previewPainted();
};

const mkType = (target: string, text: string, cadence: number): TourStep['type'] => ({ target, text, cadence });

// ── Beat builders — every taught beat is a Teaching Beat (read the caption, then act) ────────────

/** A pure narration beat: show a line, draw the eye to it, dwell to read. No action — used for
 *  a scenario opener or a chapter card. `hold` adds a LAND pause after the read dwell. */
export function teachBeat(say: string, hold = 0): TourStep {
	return { say, read: true, settle: hold };
}

/** Open the deck menu and mint the real, persisted "My First Deck" (deduped, blanked). On a phone
 *  it lands on Preview so the fresh editor mints blank on the first swap. Two beats: open, create. */
export function newDeck(mobile: boolean, opener: string, creator: string): TourStep[] {
	return [
		{ say: opener, read: true, point: SEL.deckSwitcher, click: true, act: (a) => a.openDeckMenu(true), settle: 500 },
		{
			say: creator,
			read: true,
			point: newDeckItem,
			click: true,
			act: (a) => {
				a.createFirstDeck();
				a.openDeckMenu(false);
				if (mobile) a.setMobilePane('preview');
			},
			settle: 700,
		},
	];
}

/** Reveal slide `k` of `slides`, responsively. DESKTOP: read the teach line, type on the left,
 *  wait for the parse, circle the render. PHONE: read the teach line while tapping to Edit, type,
 *  then read the reveal line while tapping to Preview, wait for slide `k` to paint, linger. */
export function revealSlide(
	mobile: boolean,
	slides: string[],
	k: number,
	opts: { teach: string; reveal: string; cadence?: number; wow?: boolean; land?: number },
): TourStep[] {
	const cadence = opts.cadence ?? (mobile ? 9 : 8);
	const src = upTo(slides, k);
	const wow = opts.wow ? { circle: SEL.preview } : {};
	if (mobile) {
		return [
			{ say: opts.teach, read: true, point: SEL.paneEdit, click: true, act: (a) => a.setMobilePane('edit'), until: editorMounted, settle: 250 },
			{ point: SEL.editor, type: mkType(SEL.editor, src, cadence), settle: 300 },
			// Reveal: swap to Preview AND navigate to the slide just typed. The controlled setSource
			// path resets the active slide to 1, so without this the preview would stay on slide 1 —
			// the viewer would never see the new slide, and `previewShowsSlide(k)` would spin to its
			// timeout. gotoSlide(k-1) shows slide k and resolves the gate at once. The reveal caption
			// rides the `land` linger (no separate read-dwell — one read per slide, on the teach line).
			{ say: opts.reveal, point: SEL.panePreview, click: true, act: (a) => { a.setMobilePane('preview'); a.gotoSlide(k - 1); }, until: previewShowsSlide(k), settle: opts.land ?? 1500, ...wow },
		];
	}
	return [
		{ say: opts.teach, read: true, point: SEL.editor, click: true, settle: 200 },
		{ say: opts.reveal, type: mkType(SEL.editor, src, cadence), until: railReady(k), settle: opts.land ?? 900, ...wow },
	];
}

/** Reskin the deck via a theme, then flip light/dark — the "layouts hold, only the palette moves"
 *  beat. The theme picker (`[aria-label="Choose deck theme"]`) lives INSIDE the deck-scope Inspector on
 *  BOTH surfaces (a docked column on desktop, a sheet on a phone), so open it first — otherwise the
 *  cursor would point at nothing and the deck would reshade with no visible cause. Drives the same
 *  panel the author uses, at deck scope. Close it on the mode flip. */
export function reskin(mobile: boolean, say: string, modeSay: string): TourStep[] {
	return [
		{ say, read: true, act: (a) => a.openInspector(true), settle: mobile ? 500 : 400 },
		{ point: SEL.theme, click: true, act: (a) => a.setPalette('cuoio'), circle: SEL.preview, settle: 800 },
		{
			say: modeSay,
			read: true,
			act: (a) => {
				a.openInspector(false);
				a.toggleMode();
			},
			circle: SEL.preview,
			settle: 1200,
		},
	];
}

/** The Architect Coach scores the deck board-ready — open, let the score land + read, close. */
export function coach(say: string): TourStep[] {
	return [
		{
			say,
			read: true,
			point: SEL.architect,
			click: true,
			act: (a) => {
				a.openArchitect(true);
				a.setArchitectTab('coach');
			},
			settle: 2000,
		},
		{ act: (a) => a.openArchitect(false), instant: true, settle: 300 },
	];
}

/** Present full-screen, hold, close. */
export function present(say: string): TourStep[] {
	return [
		{ say, read: true, point: SEL.present, click: true, act: (a) => a.openPresent(true), settle: 2000 },
		{ act: (a) => a.openPresent(false), instant: true, settle: 300 },
	];
}

/** Export a PDF — open the Share sheet, hold, close. */
export function share(say: string): TourStep[] {
	return [
		{ say, read: true, point: SEL.share, click: true, act: (a) => a.openShare(true), settle: 2000 },
		{ act: (a) => a.openShare(false), instant: true, settle: 300 },
	];
}

/** Land the tour on the finished preview with a closing line. */
export function landing(mobile: boolean, say: string): TourStep[] {
	return [
		{
			say,
			read: true,
			point: mobile ? SEL.panePreview : SEL.preview,
			click: mobile,
			act: mobile ? (a) => a.setMobilePane('preview') : undefined,
			circle: SEL.preview,
			settle: 2600,
		},
	];
}

/** Compile a tour's steps into a Walkthrough. */
export const toWalkthrough = (steps: TourStep[]): Walkthrough<StudioActions> => storyboard<StudioActions>('', steps);
