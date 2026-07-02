// Shared guided-tour helper for the docs workspaces (Playground · Workbench ·
// Drawing Board). Wraps driver.js (MIT, ~5 KB, zero-dep) so every page gets the
// same behaviour from one place: a "Tour" button in the topbar, a one-time
// auto-start on a visitor's first arrival, a global on/off honoured everywhere
// (the Drawing Board settings drawer writes it), and palette-blind popover
// styling that reads the same design tokens as the rest of the site.
//
// driver.js was chosen over intro.js / Shepherd.js when this repo was still
// MIT and their AGPL-3.0 terms were a poison pill; the repo is AGPL-3.0 itself
// now, but driver.js remains the right pick — MIT and framework-agnostic, which
// matches this site's vanilla-JS / plain-CSS stack exactly.
//
// Per-page step decks live beside this file (playground-tour.js,
// workbench-tour.js, drawing-board-tour.js); they describe WHICH elements to
// spotlight and, via `onReveal`, how to bring a target on screen — the
// workspaces show one pane at a time on mobile, so a step's target may sit in
// an inactive tab. This module owns HOW the tour runs.
import { driver } from 'driver.js';
import 'driver.js/dist/driver.css';
import '../styles/guided-tour.css';
import { isPreviewHost } from './preview-host.js';
import { onToursEnabledChange, toursEnabled } from './tour-prefs.js';

const SEEN_PREFIX = 'lattice-tour-seen-';

// Tours ship to every build but only ACTIVATE on the production site. The page
// build stamps `data-tours="on"` on <html> for production (GitHub Pages / a
// main-branch Cloudflare deploy) and "off" for local dev and the Cloudflare
// *.pages.dev PR previews (see docs/src/lib/deploy-env.mjs). Fail closed: only
// an explicit "on" runs them.
//
// The build-time stamp depends on `CF_PAGES` reaching the build; when a preview
// is built without it the stamp wrongly reads "on", and the tour's full-screen
// overlay then TRAPS POINTER EVENTS over the whole workspace — blocking the
// editor, preview, present AND practice, so no interactive feature can be
// reviewed on the PR preview. Belt-and-suspenders: also fail closed at RUNTIME on
// any preview host, regardless of the build stamp.
export function toursAllowedHere() {
	try {
		if (isPreviewHost(location.hostname)) return false;
		return document.documentElement.dataset.tours === 'on';
	} catch {
		return false;
	}
}

function prefersReducedMotion() {
	try {
		return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
	} catch {
		return false;
	}
}

// A step is kept when it has no element (a centered modal card) or its target
// exists in the DOM. Existence — not current visibility — is the test on
// purpose: on a phone the target may be in a tab-hidden pane, and `onReveal`
// switches to that pane before the spotlight lands. Steps whose selector
// resolves to nothing are dropped so the tour never strands on empty space.
function isStepLive(step) {
	if (!step?.element) return true;
	if (typeof step.element !== 'string') return Boolean(step.element);
	return Boolean(document.querySelector(step.element));
}

/**
 * Wire a guided tour into the current page.
 *
 * @param {object} opts
 * @param {string} opts.key        Stable id for the localStorage "seen" flag.
 * @param {Array}  opts.steps      driver.js step objects (element + popover).
 * @param {(el: Element, step: object) => void} [opts.onReveal]  Bring a step's
 *        target on screen (e.g. switch the active mobile tab). Runs before each
 *        spotlight; a no-op on desktop where every pane is already visible.
 * @param {string} [opts.buttonLabel='Tour']
 * @param {string} [opts.buttonTitle='Take a guided tour of this page']
 * @param {boolean}[opts.autoStart=true]  Auto-run once on a first visit.
 * @param {number} [opts.autoStartDelay=550]  ms to let controllers mount first.
 * @param {string|Element|null} [opts.mountTarget='.sh-actions']  Where to
 *        place the replay "?" button (the shared <SiteHeader> action cluster).
 *        Pass `null` for a tour the caller drives itself (e.g. an overlay that
 *        owns its own trigger) — no button is mounted.
 * @returns {{ start: () => void, seen: () => boolean, markSeen: () => void }}
 */
export function initGuidedTour(opts) {
	const {
		key,
		steps,
		onReveal,
		buttonLabel = 'Tour',
		buttonTitle = 'Take a guided tour of this page',
		autoStart = true,
		autoStartDelay = 550,
		mountTarget = '.sh-actions',
	} = opts || {};

	const noop = { start() {}, seen: () => true, markSeen() {} };
	if (!key || !Array.isArray(steps) || steps.length === 0) return noop;
	// Production-only: no button, no auto-run on dev / preview deploys.
	if (!toursAllowedHere()) return noop;

	const seenKey = SEEN_PREFIX + key;
	const seen = () => {
		try {
			return localStorage.getItem(seenKey) === '1';
		} catch {
			return false;
		}
	};
	const markSeen = () => {
		try {
			localStorage.setItem(seenKey, '1');
		} catch {}
	};

	// Resolve the step's element and hand it to the page's reveal hook so the
	// right tab is showing before driver measures and positions the popover.
	const reveal = (element, step) => {
		if (typeof onReveal !== 'function') return;
		const el =
			element ||
			(typeof step?.element === 'string'
				? document.querySelector(step.element)
				: step?.element);
		if (!el) return;
		try {
			onReveal(el, step);
		} catch {}
	};

	const start = () => {
		const live = steps.filter(isStepLive);
		if (live.length === 0) return;
		const tour = driver({
			showProgress: true,
			allowClose: true,
			animate: !prefersReducedMotion(),
			smoothScroll: !prefersReducedMotion(),
			overlayColor: 'rgba(16, 18, 22, 0.62)',
			overlayOpacity: 1,
			stagePadding: 6,
			stageRadius: 8,
			popoverClass: 'lattice-tour',
			nextBtnText: 'Next',
			prevBtnText: 'Back',
			doneBtnText: 'Done',
			progressText: '{{current}} of {{total}}',
			// Switch to the target's pane before each spotlight (mobile tabs).
			onHighlightStarted: (element, step) => reveal(element, step),
			steps: live,
		});
		tour.drive();
	};

	// Topbar button — created and torn down on demand so the Drawing Board's
	// "Guided tours" setting can flip it without a reload. `mountTarget: null`
	// skips it entirely for a caller-driven tour (the overlay owns its trigger).
	const actions =
		mountTarget == null
			? null
			: typeof mountTarget === 'string'
				? document.querySelector(mountTarget)
				: mountTarget;
	let btn = null;
	const mountButton = () => {
		if (!actions || btn) return;
		btn = document.createElement('button');
		btn.type = 'button';
		btn.className = 'tour-btn';
		btn.title = buttonTitle;
		btn.setAttribute('aria-label', buttonTitle);
		btn.innerHTML = `<span class="tour-btn-glyph" aria-hidden="true">?</span><span class="tour-btn-label">${buttonLabel}</span>`;
		btn.addEventListener('click', () => {
			markSeen();
			start();
		});
		actions.insertBefore(btn, actions.firstChild);
	};
	const unmountButton = () => {
		if (btn) {
			btn.remove();
			btn = null;
		}
	};

	// Honour the global flag, and react to it live on this page (the Drawing
	// Board settings toggle dispatches through tour-prefs).
	const applyEnabled = (on) => {
		if (on) mountButton();
		else unmountButton();
	};
	onToursEnabledChange(applyEnabled);

	if (toursEnabled()) {
		mountButton();
		// First-visit auto-run. Marked seen the moment it fires so a reload or an
		// early close never re-interrupts the same visitor.
		if (autoStart && !seen()) {
			window.setTimeout(() => {
				if (seen() || !toursEnabled()) return;
				markSeen();
				start();
			}, autoStartDelay);
		}
	}

	return { start, seen, markSeen };
}
