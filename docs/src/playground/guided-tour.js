// Shared guided-tour launcher for the docs workspaces (today the Playground). It owns the parts a
// tour needs that are not the tour: a "Tour" button in the topbar, a one-time offer on a visitor's
// first arrival, a global on/off honored everywhere (the Workspace settings write it), and the
// rule that tours only run on the production site.
//
// It no longer draws anything. The tour itself is a Vetrina walkthrough (playground-tour.js), and
// the offer is a card the page's React shell shows: a browser plays no sound until the visitor
// clicks, so the card is where they test their audio before a narrated tour speaks. This module
// only asks for it, by calling `onStart`.
//
// (It used to wrap driver.js, a spotlight-and-popover library. driver.js was picked over intro.js
// and Shepherd for being MIT and framework-free; Vetrina replaced it in
// engineering/decisions/2026-10-20-first-run-onboarding.md.)
import '../styles/guided-tour.css';
import { isPreviewHost } from './preview-host.js';
import { onToursEnabledChange, toursEnabled } from './tour-prefs.js';

const SEEN_PREFIX = 'lattice-tour-seen-';

// Tours ship to every build but only ACTIVATE on the production site. The page build stamps
// `data-tours="on"` on <html> for production (GitHub Pages / a main-branch Cloudflare deploy) and
// "off" for local dev and the Cloudflare *.pages.dev PR previews (docs/src/lib/deploy-env.mjs).
// Fail closed: only an explicit "on" runs them. Belt-and-suspenders: also fail closed at RUNTIME on
// any preview host, regardless of the build stamp, because a tour overlay over a PR preview blocks
// the very controls a reviewer came to test.
//
// `?tour=1` forces the offer on any host, for support and QA.
export function toursAllowedHere() {
	try {
		if (new URLSearchParams(location.search).get('tour') === '1') return true;
		if (isPreviewHost(location.hostname)) return false;
		return document.documentElement.dataset.tours === 'on';
	} catch {
		return false;
	}
}

/**
 * Wire a guided tour into the current page.
 *
 * @param {object} opts
 * @param {string} opts.key        Stable id for the localStorage "seen" flag.
 * @param {() => void} opts.onStart  Offer the tour (the page shows its start card). Called on the
 *        Tour button and once, automatically, on a first visit.
 * @param {string} [opts.buttonLabel='Tour']
 * @param {string} [opts.buttonTitle='Take a guided tour of this page']
 * @param {boolean}[opts.autoStart=true]  Offer once on a first visit.
 * @param {number} [opts.autoStartDelay=550]  ms to let controllers mount first.
 * @param {string|Element|null} [opts.mountTarget='.sh-actions']  Where to place the replay button
 *        (the shared <SiteHeader> action cluster). `null` mounts no button.
 * @returns {{ start: () => void, seen: () => boolean, markSeen: () => void }}
 */
export function initGuidedTour(opts) {
	const { key, onStart, buttonLabel = 'Tour', buttonTitle = 'Take a guided tour of this page', autoStart = true, autoStartDelay = 550, mountTarget = '.sh-actions' } = opts || {};

	const noop = { start() {}, seen: () => true, markSeen() {} };
	if (!key || typeof onStart !== 'function') return noop;
	// Production-only: no button, no offer on dev / preview deploys.
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

	const start = () => onStart();

	// Topbar button — created and torn down on demand so the Workspace "Guided tours" setting can
	// flip it without a reload.
	const actions = mountTarget == null ? null : typeof mountTarget === 'string' ? document.querySelector(mountTarget) : mountTarget;
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

	// Honor the global flag, and react to it live on this page.
	onToursEnabledChange((on) => (on ? mountButton() : unmountButton()));

	if (toursEnabled()) {
		mountButton();
		// First-visit offer. Marked seen the moment it fires so a reload or an early close never
		// re-interrupts the same visitor.
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
