// The LESSON KIT — three beat helpers every Studio lesson is written from.
//
// A lesson answers one question ("How do I export a PDF?") in three to six beats, on the deck the
// user already has open. It never resets the Studio the way a tour does: the point is to learn on
// your own work. Design record: engineering/decisions/2026-10-05-studio-lessons.md.
//
// The three helpers:
//   tell     — say a line, point at something, let it be read. Nobody acts.
//   yourTurn — point at a real control and WAIT for the user to use it. If they do, the real control
//              does its real job. If they wait `TURN_MS`, the lesson says so and does it for them,
//              through `perform`. Either way the lesson moves on. This one helper is what makes a
//              lesson both "walk me through" and "show me" without asking the user to pick.
//   settle   — wait until the app is ready for the next beat (a sheet opened, a slide painted).
//
// Honesty is Vetrina's: the cursor is theater, and every real effect comes from an action the host
// supplied. `press` calls the real control's `click()`, which sends no `pointerdown`, so Vetrina's
// take-over guard does not mistake it for the user; any OTHER real input still ends the lesson.

import { type RunContext, storyboard, type Target, type Walkthrough, wait, waitFor } from '../../../lib/vetrina/index.js';
import type { StudioCommandId } from '../studio-commands';
import { SHARED_LINES } from './lines';

/** What a lesson may do to the Studio. Every member is bound to real state by `use-studio-lesson`. */
export type LessonActions = {
	/** Run a command from the shared action list, exactly as its palette row would. */
	run: (id: StudioCommandId) => void;
	/** Click a real control. A no-op when the target is not on screen. */
	press: (target: Aim) => void;
	/** Apply a deck theme by palette name. */
	setPalette: (name: string) => void;
	/** Add a slide of Markdown after the last slide, and show it. */
	appendSlide: (markdown: string) => void;
};

/** What a lesson can read about where it is running, fixed when it starts. */
export type LessonEnv = {
	/** True on a phone (≤699px), where the Studio shows one pane at a time. */
	mobile: boolean;
	/** The deck's palette when the lesson started. */
	palette: string;
	/** Every palette a lesson may switch to. */
	palettes: readonly string[];
};

export type LessonCtx = RunContext<LessonActions>;
export type LessonBuild = (env: LessonEnv) => Walkthrough<LessonActions>;

/** How long a "your turn" beat waits for the user before doing it for them. Long enough to find a
 *  control the cursor is already resting on; short enough that someone who only wants to watch is
 *  not left staring at a still screen. */
export const TURN_MS = 7000;

/** Extra time Vetrina's own turn timeout allows on top of `TURN_MS`, to cover the cursor's travel
 *  before the window starts. A backstop only: the window itself is timed from arrival. */
const BACKSTOP_MS = 10_000;

/** The line a lesson says when the user waited and it does the step itself. */
export const TAKEOVER_LINE: string = SHARED_LINES.takeover;

/** Can a person see and press this element? A box is not enough: the pre-paint skeleton keeps an
 *  exact copy of the header (same label, same box) inside an `inert`, `aria-hidden` layer the
 *  browser does not paint. Measured on the real Studio: a lesson aimed at that copy, so the user's
 *  click on the real Present button read as "other input" and ended the lesson. */
function usable(el: HTMLElement): boolean {
	const r = el.getBoundingClientRect();
	if (r.width === 0 || r.height === 0) return false;
	if (el.closest('[inert], [aria-hidden="true"]')) return false;
	return typeof el.checkVisibility === 'function' ? el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) : true;
}

/** First usable element matching the selectors, tried IN ORDER and searched in the whole document.
 *  Whole-document because Radix portals menus and sheets to `<body>`, outside the Studio root.
 *  In order, so a stable `data-demo` anchor wins over a label fallback. First-usable because the
 *  Studio renders some controls more than once and hides the copies a width does not use (the
 *  phone pane bar's Present vs. the header's). */
export function visible(...selectors: string[]): () => HTMLElement | null {
	return () => {
		for (const sel of selectors) {
			for (const el of document.querySelectorAll<HTMLElement>(sel)) if (usable(el)) return el;
		}
		return null;
	};
}

/** A target Vetrina can aim at ANYWHERE in the document. The stage resolves a bare selector inside
 *  the Studio root, which misses every portalled menu and sheet, so a selector becomes a
 *  `visible()` thunk first. */
export function aim(target: Aim): Target {
	if (Array.isArray(target)) return visible(...target);
	return typeof target === 'string' ? visible(target) : (target as Target);
}

function resolve(target: Aim): Element | null {
	const t = aim(target);
	const r = typeof t === 'function' ? t() : t;
	return r instanceof Element ? r : null;
}

/** Where a beat points: a selector, a list of selectors tried in order, or any Vetrina target. */
export type Aim = Target | readonly string[];

/** Keys a keyboard user presses to use a control or move through the menu it sits in. */
const TURN_KEYS = new Set(['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End']);

/** Did this real event aim at `el`? A pointer press inside it; or, from the keyboard, Enter or
 *  Space on it, or a key that moves through the same menu or list. Without the second half a
 *  keyboard user could not finish a two-step lesson: Enter opens the deck menu, and ArrowDown to
 *  reach "New deck" read as "the user took over" and ended the lesson. */
export function aimsAt(el: Element, e: Event): boolean {
	if (e.type === 'keydown') {
		const k = (e as KeyboardEvent).key;
		const focus = document.activeElement;
		if (!TURN_KEYS.has(k) || !(focus instanceof Element)) return false;
		if (el.contains(focus)) return true;
		const group = el.closest('[role="menu"], [role="listbox"]');
		return group?.contains(focus) ?? false;
	}
	return e.target instanceof Node && el.contains(e.target);
}

/** Say a line and point at something. Nobody acts; the beat holds long enough to read. */
export async function tell(ctx: LessonCtx, beat: { say: string; point?: Aim; circle?: Aim }): Promise<void> {
	const point = beat.point && resolve(beat.point) ? aim(beat.point) : undefined;
	const circle = beat.circle && resolve(beat.circle) ? aim(beat.circle) : undefined;
	await storyboard<LessonActions>('', [{ say: beat.say, read: true, point, circle, settle: 400 }])(ctx);
}

/**
 * Point at a real control and wait for the user to use it; if they wait, do it for them.
 *
 * Resolves to who acted: `'user'` when their own press matched, `'lesson'` when the lesson ran
 * `perform`, and `'nobody'` when nothing happened — the beat has no `perform` (a step the lesson
 * deliberately leaves to the user, like a download), or its control is not on screen and the beat
 * gave no `missing` line.
 *
 * A control that is not on screen skips the wait, because the lesson cannot ask anyone to press
 * what is not there. It performs only when the beat says, in `missing`, what it is doing instead:
 * performing under the beat's own "Click X" line would edit the user's deck while telling them it
 * was their turn. (Found by review: "How do I write a slide?" at the Read stop, where the editor is
 * inert, added a slide to the real deck without a turn.)
 */
export async function yourTurn(
	ctx: LessonCtx,
	beat: { say: string; target: Aim; perform?: (a: LessonActions) => void | Promise<void>; missing?: string; turnMs?: number },
): Promise<'user' | 'lesson' | 'nobody'> {
	const el = resolve(beat.target);
	if (!el) {
		if (!beat.perform || !beat.missing) return 'nobody';
		await storyboard<LessonActions>('', [{ say: beat.missing, read: true, act: beat.perform, settle: 300 }])(ctx);
		return 'lesson';
	}
	const target = aim(beat.target);
	// LISTEN BEFORE POINTING. The caption goes up as the cursor sets off, and a reader who acts on
	// it presses the control while the cursor is still traveling. Armed after the theater, that
	// press arrived before anything was waiting for it and Vetrina's guard took it as "the user
	// took over" — measured on the real Studio, where it ended the lesson on the very click it
	// asked for. Armed first, the press resolves the turn whenever it lands.
	//
	// THE TURN WINDOW STARTS WHEN THE CURSOR ARRIVES, not when the turn is armed. Vetrina's own
	// timeout starts at arming, so it would spend the cursor's travel and settle out of the user's
	// seven seconds; it is set long here as a backstop, and the real window is the race below.
	const turnMs = beat.turnMs ?? TURN_MS;
	const turn = ctx.awaitUser({ match: (e) => aimsAt(el, e), timeout: turnMs + BACKSTOP_MS, onTimeout: 'resume' });
	turn.catch(() => {}); // an abort rejects both; the theater's rejection is the one that propagates
	await storyboard<LessonActions>('', [{ say: beat.say, point: target }])(ctx);
	const window = wait(turnMs, ctx.signal).then(() => 'waited' as const);
	window.catch(() => {});
	const ev = await Promise.race([turn, window]);
	if (ev !== 'waited' && ev.type !== 'vetrina:timeout') return 'user';
	if (!beat.perform) return 'nobody';
	await storyboard<LessonActions>('', [{ say: TAKEOVER_LINE, point: target, click: true, act: beat.perform, settle: 300 }])(ctx);
	return 'lesson';
}

/** Hold until the app is ready for the next beat. Gives up quietly after `timeout` and returns
 *  false, so a slow surface costs a pause rather than a stuck lesson. */
export async function settle(ctx: LessonCtx, ready: () => boolean, timeout = 4000): Promise<boolean> {
	await waitFor(ctx, ready, { timeout });
	try {
		return ready();
	} catch {
		return false;
	}
}

/** Selectors lessons share. `data-demo` anchors are the Studio's stable tour hooks. */
export const SEL = {
	editor: '#studio-pane-editor',
	preview: '#studio-pane-preview',
	deckSwitcher: '[data-demo="deck-switcher"]',
	newDeck: '[data-demo="new-deck"]',
	addSlide: '[aria-label="Add slide"]',
	pickerBlank: '[data-demo="picker-blank"]',
	theme: '[data-demo="theme"]',
	present: ['[data-demo="present"]', '[aria-label="Present"]'],
	share: ['[data-demo="share"]', '[aria-label="Share"]'],
	sharePdf: '[data-demo="share-pdf"]',
	pdfDownload: '[data-demo="pdf-download"]',
} as const satisfies Record<string, Aim>;
