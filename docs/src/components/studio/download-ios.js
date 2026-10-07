// Saving a file on iOS — loaded by download.js only on an iPhone or iPad.

import { clearPendingSave, hasPendingSave, iosNeedsShareSheet, setPendingSave } from './download.js';

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


// THE WAITING BATCH. One Save toast can wait at a time (notify's single action slot), so saves
// that land while it waits join it instead of replacing it: a re-export under the SAME name
// replaces that file (the author changed an option and exported again), and a DIFFERENT name
// joins it ("3 files are ready"), so Fabricate's multi-file theme export offers every file,
// not the last. One tap shares the whole batch. The batch starts over once its toast is gone —
// tapped, timed out, or retired by the Share sheet (download.js `dismissPendingSave`).
/** @type {Map<string, { file: File, onSaved?: () => void }>} */
const batch = new Map();
let batchAt = 0;

/** Offer `blob` through the share sheet, behind a "Save" toast the user taps. */
function offerShareSheet(filename, blob, saveWithAnchor, onSaved) {
	const file = new File([blob], filename, { type: blob.type });
	const sharer = /** @type {Navigator & { canShare?: (d: { files?: File[] }) => boolean }} */ (navigator);
	if (typeof sharer.share !== 'function' || !sharer.canShare?.({ files: [file] })) {
		saveWithAnchor(filename, blob);
		onSaved?.();
		return;
	}
	if (!hasPendingSave() || Date.now() - batchAt > SAVE_TOAST_MS) batch.clear();
	batch.set(filename, { file, onSaved });
	batchAt = Date.now();
	const items = [...batch.values()];
	const opts = {
		label: 'Save',
		duration: SAVE_TOAST_MS,
		onClick: () => {
			batch.clear();
			clearPendingSave();
			// Files only: a `title` rides along as a second item, and Save to Files wrote it out as
			// a 19-byte "text" file beside the PDF on the owner's iPhone.
			sharer.share({ files: items.map((i) => i.file) }).then(
				() => {
					for (const i of items) i.onSaved?.();
				},
				(err) => {
					// AbortError = the user closed the sheet; anything else, save the old way.
					if (err?.name === 'AbortError') return;
					for (const i of items) {
						saveWithAnchor(i.file.name, i.file);
						i.onSaved?.();
					}
				},
			);
		},
	};
	// notify.ts's NOTIFY_ACTION_EVENT, by its string: importing notify from this lazy module
	// would grow first-paint JS on the Studio and Playground (see that export). The listener
	// cancels the event when it shows the toast; uncancelled, nobody did, so save plainly.
	const message = items.length === 1 ? `${filename} is ready` : `${items.length} files are ready`;
	const detail = { message, opts };
	const shown = !window.dispatchEvent(new CustomEvent('lattice:notify-action', { cancelable: true, detail }));
	if (shown) {
		setPendingSave(/** @type {{ handle?: unknown }} */ (detail).handle ?? null);
		return;
	}
	batch.clear();
	saveWithAnchor(filename, blob);
	onSaved?.();
}

/** Save on an iPhone or iPad through the share sheet (`saveWithAnchor`, handed in so this
 *  module stays leaf-only, is the fallback when the share sheet cannot take the file). */
export function saveOnIOS(filename, blob, saveWithAnchor, onSaved) {
	offerShareSheet(filename, blob, saveWithAnchor, onSaved);
}

export { iosNeedsShareSheet };
