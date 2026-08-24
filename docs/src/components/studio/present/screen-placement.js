// Where a second window LANDS — the one piece of screen knowledge shared by every
// popup Present opens.
//
// Extracted from `presenter-window.js`'s `autoPlacePresenter` (2026-08-24, the
// Stage/console split) because the Stage needs the identical lookup and a second
// copy would be a second thing to keep right. See
// `engineering/decisions/2026-08-24-stage-console-split.md`.
//
// WHICH window gets sent here is the part the split changed. Under the old model
// the PRESENTER window was auto-placed on the external screen, which is backwards:
// the external screen is the projector, so it belongs to the audience. The Stage
// goes there; the presenter's console stays on the laptop with the browser.

/**
 * Move `win` onto the first external (non-internal) screen, when the Window
 * Management permission has been granted.
 *
 * ENHANCEMENT ONLY — every failure path is a no-op that leaves the window where
 * the browser put it, which the human can still drag. `getScreenDetails` is
 * absent in Firefox and Safari entirely, and prompts (or has been denied) in
 * Chromium, so the common case is that this does nothing at all and the caller
 * must not depend on it having worked.
 *
 * Detect to decide whether to OFFER; verify the outcome to decide whether it
 * WORKED — a capability bit answers for the engine, not for the app hosting it.
 * Nothing here reports success, precisely because a `moveTo` that silently lands
 * nowhere is indistinguishable from one that worked.
 */
export async function placeOnExternalScreen(win) {
	try {
		if (!('getScreenDetails' in window)) return;
		const details = await window.getScreenDetails();
		// `isInternal` is the reliable signal (the laptop panel); `currentScreen`
		// is the fallback for a multi-monitor desktop where no screen is internal.
		const ext = details.screens.find((s) => !s.isInternal) || details.screens.find((s) => s !== details.currentScreen);
		if (ext) win.moveTo(ext.availLeft, ext.availTop);
	} catch {
		/* permission denied / unsupported — leave the window where it opened */
	}
}
