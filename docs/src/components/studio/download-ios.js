// Saving a file on iOS — loaded by download.js only on an iPhone or iPad.

import { iosNeedsShareSheet, setPendingSave } from './download.js';

// ONE NATIVE SAVE ON iOS. Every iOS browser is Safari's engine underneath, and the non-Safari
// ones save a page's download with their own script. Firefox for iOS's DownloadHelper.js names
// a `blob:` download from a Content-Disposition header or else the URL's last segment — the
// UUID — and never reads the `download` attribute it is handed (the owner's iPhone 15 Pro:
// `<uuid>.<ext>`). No page-side name survives that path. So on iOS every browser, Safari
// included, gets the share sheet with a named File (the owner's call: one consistent, native
// iOS save): "Save to Files" keeps the name. iOS opens the sheet only inside a tap, and an
// export finishes seconds after its tap, so the sheet waits behind a "Save" toast — the same
// two-tap shape iOS Print already uses (PrintOptionsPanel).
const SAVE_TOAST_MS = 30_000;


/** Offer `blob` through the share sheet, behind a "Save" toast the user taps. */
function offerShareSheet(filename, blob, saveWithAnchor) {
	const file = new File([blob], filename, { type: blob.type });
	const sharer = /** @type {Navigator & { canShare?: (d: { files?: File[] }) => boolean }} */ (navigator);
	if (typeof sharer.share !== 'function' || !sharer.canShare?.({ files: [file] })) {
		saveWithAnchor(filename, blob);
		return;
	}
	const opts = {
		label: 'Save',
		duration: SAVE_TOAST_MS,
		onClick: () => {
			// Files only: a `title` rides along as a second item, and Save to Files wrote it out as
			// a 19-byte "text" file beside the PDF on the owner's iPhone.
			sharer.share({ files: [file] }).catch((err) => {
				// AbortError = the user closed the sheet; anything else, save the old way.
				if (err?.name !== 'AbortError') saveWithAnchor(filename, blob);
			});
		},
	};
	// notify.ts's NOTIFY_ACTION_EVENT, by its string: importing notify from this lazy module
	// would grow first-paint JS on the Studio and Playground (see that export). The listener
	// cancels the event when it shows the toast; uncancelled, nobody did, so save plainly.
	const detail = { message: `${filename} is ready`, opts };
	const shown = !window.dispatchEvent(new CustomEvent('lattice:notify-action', { cancelable: true, detail }));
	if (shown) setPendingSave(/** @type {{ handle?: unknown }} */ (detail).handle ?? null);
	else saveWithAnchor(filename, blob);
}

/** Save on an iPhone or iPad: the share sheet where the browser drops the name, else the
 *  ordinary link download (`saveWithAnchor`, handed in so this module stays leaf-only). */
export { iosNeedsShareSheet };

export function saveOnIOS(filename, blob, saveWithAnchor) {
	if (iosNeedsShareSheet()) offerShareSheet(filename, blob, saveWithAnchor);
	else saveWithAnchor(filename, blob);
}
