// The TOUR TOOLKIT — the shared, responsive plumbing every "Show Me" tour composes from.
//
// One tour remains (`first-look`, the showcase); the rest became lessons (lessons/, 2026-10-05).
// It drives the Studio with these physics:
//   • Desktop / tablet show editor + preview SIDE BY SIDE — type on the left, watch it render on
//     the right, in one beat.
//   • A phone (≤699px) shows ONE swappable pane — so a "build a slide" beat becomes THREE beats:
//     tap Edit → type → tap Preview → reveal.
// The responsive branch lives HERE, in `revealSlide`, so a tour just says "reveal slide k with this
// teach line and this reveal line." Everything is authored to
// the Teaching Beat (`read: true` + a caption sized by `readMs`) so a human has time to digest.
//
// Selectors resolve ROOT-scoped (Vetrina default). The New-Deck item is portalled to <body>, so it
// needs a whole-document thunk.

import { type Step, storyboard, type Walkthrough } from '../../../lib/vetrina/index.js';
import type { StudioActions } from '../studio-actions';

export type TourStep = Step<StudioActions>;
/** A tour is built responsively from one flag — the same script adapts to phone vs. side-by-side. */
export type TourBuild = (opts: { mobile: boolean }) => Walkthrough<StudioActions>;

// ── Canonical slide sources (authored to the shipped component contracts) ──────────────────────
export const SLIDE = {
	title: '<!-- _class: title -->\n\n# Q4 Board Update\n\n`Board · Q4 2026`\n\nGrowth held; spend stayed disciplined.',
	bigNumber: '<!-- _class: big-number -->\n\n`Net Revenue Retention`\n\n- 127%\n  - Expansion outran churn every month this quarter.',
	radar:
		'<!-- _class: radar -->\n\n`[{Scale, 0..10}]`\n\n## Where the platform bet is paying off.\n\n- This quarter\n  - Coverage `8`\n  - Reliability `9`\n  - Velocity `7`\n  - Cost control `8`\n  - Sentiment `9`\n- A year ago\n  - Coverage `5`\n  - Reliability `6`\n  - Velocity `4`\n  - Cost control `6`\n  - Sentiment `5`',
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
} as const;
/** The New Deck item lives in a Radix menu portalled to <body> — a whole-document thunk. */
export const newDeckItem = (): HTMLElement | null => document.querySelector<HTMLElement>('[data-demo="new-deck"]');

// ── Readiness gates (parent-DOM; the same signals the e2e trusts) ───────────────────────────────
/** True once the deck has PARSED into ≥ `k` slides — the desktop rail shows one button per slide. */
export const railReady = (k: number) => (): boolean => document.querySelectorAll(`${SEL.rail} button`).length >= k;
/** True once the editor's content node is live (both mobile panes stay mounted, so effectively
 *  always true — a cheap guard kept in case the layout ever reverts to conditional).
 *
 *  EITHER editor, because `editMode` picks which one is mounted and no tour changes it: an author
 *  who switched to Compose and then started a tour was gating every typing beat on a CodeMirror
 *  node that mode does not render. That is not a no-op — an unmet `until` spins to `holdUntil`'s
 *  timeout and advances with a warning, so each beat of a phone tour cost ~15 seconds of nothing.
 *  `#studio-pane-editor` wraps both editors, so `SEL.editor` already resolves in either mode; only
 *  this predicate was shaped for one of them. */
export const editorMounted = (): boolean => !!document.querySelector(`${SEL.editor} .cm-content, ${SEL.editor} .cs-host .ProseMirror`);
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
