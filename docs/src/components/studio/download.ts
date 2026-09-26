import { notify } from '@/lib/notify';
import { saveFile } from '@/lib/platform';

// Save a Blob as a file the user keeps. Every Studio export lands here, and this hands
// it to the platform seam (`lib/platform.js`), which clicks a download link in a browser
// and shows the native save dialog on the desktop. Fire-and-forget: no caller acts on
// the outcome today, and the web path must not await before its click (see saveFile).
export function downloadBlob(filename: string, blob: Blob): void {
	void saveFile(filename, blob).then((result) => {
		if (result === 'failed') reportSaveFailure(filename);
	});
}

/** The one toast for a save that did not happen (a disk error, a denied write). A dismissed
 *  dialog is a choice, not a failure, and says nothing. */
export function reportSaveFailure(filename: string): void {
	notify(`Could not save ${filename}.`);
}

// Trigger a client-side file download for a text blob (the Share "hand off the
// source" path). Guarded so it stays a no-op in a non-DOM environment (tests).
export function downloadText(filename: string, text: string, mime = 'text/markdown'): void {
	if (typeof Blob === 'undefined') return;
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
