// Stage-window kernel — the AUDIENCE surface (2026-08-24, the Stage/console split).
//
// The Stage is the deck and nothing else: a chrome-free window you put on the
// projector while the presenter's console stays in the browser on the laptop.
// Before this existed, Present had two presenter cockpits and no audience
// surface at all, so projecting the deck showed the room the Exit button, the
// lens picker, the staging pills, the slide counter and the progress rail.
// See `engineering/decisions/2026-08-24-stage-console-split.md`.
//
// The DOCUMENT is not built here. `buildStageDoc()` in `presenter-window.js`
// already produces exactly this surface — it fit-scales the current slide to
// fill the window, carries no chrome, and listens for `{pv: index}` — because
// the presenter popup already fed it to two iframes. This module only owns the
// WINDOW: opening it, keeping it fed, and noticing when it goes away.
//
// Both HARD RULE #22 channels are discharged inside `buildStageDoc` itself
// (`sanitizeSlideHtml` on the markup, `sanitizeStyleText` on the stylesheet),
// so nothing here assembles a document and nothing here owes a guard call.

import { placeOnExternalScreen } from './screen-placement.js';

// How often we look to see whether the human closed the Stage. The stage
// document is deliberately DUMB — unlike the presenter popup it never posts
// anything back, so there is no `closed` beacon to listen for and polling the
// handle is the only honest signal. One second is well under human reaction
// time for "why is my console still saying the Stage is live".
const CLOSED_POLL_MS = 1000;

/**
 * Own the audience window.
 *
 * Hooks:
 *   • buildDoc()  → the stage document string (the Studio's `buildPresenterStageDoc`).
 *                   May return '' before the deck has finished rendering; the
 *                   window still opens, and `refresh()` fills it when the doc lands.
 *   • getIndex()  → the slide index the room should be looking at, right now.
 *   • onToggle(open) → reflect open/closed in the opener's UI (optional). Fires on
 *                   a human closing the window too, which is what drives the
 *                   console's "Stage disconnected" state.
 *
 * Returns `{ toggle, sync, refresh, close, isOpen }`. `toggle()` MUST run inside a
 * user gesture or the popup blocker eats it.
 */
export function createStageController({ buildDoc, getIndex, onToggle }) {
	let stageWin = null;
	// Sends are DROPPED until the document has loaded. `postMessage` does not queue
	// for a listener that does not exist yet, and the stage doc attaches its
	// `message` handler while parsing — so a send fired between `document.write`
	// and parse would vanish silently and leave the room on the wrong slide.
	let stageReady = false;
	let pollId = null;

	function isOpen() {
		return !!(stageWin && !stageWin.closed);
	}

	function sync() {
		if (!isOpen() || !stageReady) return;
		try {
			// `?? 0` not `|| 0` — slide index 0 is a legitimate value, not "missing".
			stageWin.postMessage({ pv: getIndex() ?? 0 }, '*');
		} catch {
			/* gone */
		}
	}

	// Write a freshly built document into the open window and re-arm the load gate.
	// Used for the first paint AND for `refresh()`, because the Stage holds no state
	// of its own worth preserving — the current index is re-sent immediately after.
	function writeDoc() {
		if (!isOpen()) return;
		const doc = buildDoc();
		if (!doc) return; // deck not rendered yet — `refresh()` will come back
		stageReady = false;
		try {
			stageWin.document.open();
			stageWin.document.write(doc);
			stageWin.document.close();
		} catch {
			return; /* gone mid-write */
		}
		armLoadGate();
	}

	// Same-origin popup, so we can watch its own `load`. The stage doc's inline
	// script runs during parse, so by `load` its message listener is attached — and
	// `load` still fires even if the engine runtime fails to fetch, so this cannot
	// wedge on a bad network.
	function armLoadGate() {
		if (!isOpen()) return;
		const onLoad = () => {
			stageReady = true;
			sync();
		};
		try {
			// A `document.write` that already completed can leave us past the event.
			if (stageWin.document.readyState === 'complete') {
				onLoad();
				return;
			}
			stageWin.addEventListener('load', onLoad, { once: true });
		} catch {
			/* gone */
		}
	}

	// The Stage never speaks, so closure is discovered rather than announced.
	function startPoll() {
		stopPoll();
		pollId = setInterval(() => {
			if (!isOpen()) teardown();
		}, CLOSED_POLL_MS);
	}
	function stopPoll() {
		if (pollId != null) {
			clearInterval(pollId);
			pollId = null;
		}
	}

	function teardown() {
		stopPoll();
		stageReady = false;
		stageWin = null;
		onToggle?.(false);
	}

	function close() {
		if (stageWin && !stageWin.closed) {
			try {
				stageWin.close();
			} catch {
				/* gone */
			}
		}
		teardown();
	}

	function open() {
		if (isOpen()) return true;
		// Must open from the user gesture (popup-blocker-safe). Named so a second
		// press reuses the same window rather than littering the desktop.
		const win = window.open('', 'lattice-stage', 'width=1280,height=720');
		if (!win) return false; // blocked — the caller tells the human why
		stageWin = win;
		stageReady = false;
		writeDoc();
		// Enhancement, never depended on: lands the Stage on the projector where the
		// permission allows it, and does nothing at all where it does not.
		placeOnExternalScreen(win);
		startPoll();
		onToggle?.(true);
		return true;
	}

	function toggle() {
		if (isOpen()) {
			close();
			return false;
		}
		return open();
	}

	// Re-send the whole document — the deck, palette, theme or lens changed under us.
	// Cheap enough to be unconditional: the Stage carries no scroll position, no
	// selection and no focus worth preserving.
	function refresh() {
		if (!isOpen()) return;
		writeDoc();
	}

	return { toggle, sync, refresh, close, isOpen };
}
