// The ONE way the Studio hands a file to the browser (HARD RULE #15). Plain JS with JSDoc
// types, not TS: deck-export.js imports it, and Node's own test runner loads deck-export.js
// directly, where an extensionless `.ts` import does not resolve. Every export —
// PDF, PPTX, HTML, Markdown, zips, the workspace backup, the Library — saves through here.
//
// WHY A `File`, NOT A `Blob`. A `blob:` URL ends in a UUID. Name the file only with the
// anchor's `download` attribute and any browser that drops that hint saves
// `76f752a8-….html`: the UUID for a name, the extension guessed from the MIME type. The
// owner hit exactly that on lattice.style in Firefox, for every export, while a clean
// Firefox 142 profile named the same exports correctly — so the hint is dropped by
// something in the profile, which we cannot see or fix. A `blob:` URL made from a named
// `File` carries the name itself: Firefox reports it as the download's filename even with
// no `download` attribute (measured: no hint + `Blob` → no name; no hint + `File` → the
// File's name), and its PDF viewer uses it for the tab title and its own Save, where a
// `Blob` gives `<title> - <uuid>` and `document.pdf`.
//
// WHY THE DEFERRED REVOKE. Revoking in the same tick as the click relies on the browser
// having read the URL already. A save dialog can hold the download open, so the URL
// lives for a minute instead; a minute of one export's bytes is cheap.

const REVOKE_AFTER_MS = 60_000;

// FIREFOX (AND CHROME) ON iOS. Every iOS browser is Safari's engine underneath, and the
// non-Safari ones save a page's download with their own script. Firefox for iOS's
// DownloadHelper.js names a `blob:` download from a Content-Disposition header or else the
// URL's last segment — the UUID — and never reads the `download` attribute it is handed
// (the owner's iPhone 15 Pro, on the #2555 preview: still `<uuid>.<ext>`). No page-side
// name survives that path, so those browsers get the share sheet with a named File
// instead: "Save to Files" keeps the name. iOS opens the sheet only inside a tap, and an
// export finishes seconds after its tap, so the sheet waits behind a "Save" toast — the
// same two-tap shape iOS Print already uses (PrintOptionsPanel). Safari honors the
// `download` attribute, so it keeps the one-tap download.
const SAVE_TOAST_MS = 60_000;

const nav = () => (typeof navigator === 'undefined' ? null : navigator);

/** iPhone, iPod or iPad — iPadOS 13+ reports as a Mac, so touch points disambiguate. */
export function isIOSLike(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

/** An iOS browser that is not Safari (Firefox `FxiOS`, Chrome `CriOS`, Edge `EdgiOS`, …).
 *  Safari is the one whose user agent carries `Version/… Safari/` and no other brand. */
export function iosNeedsShareSheet(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	if (!isIOSLike(ua, platform, touchPoints)) return false;
	const brand = /\b(FxiOS|CriOS|EdgiOS|OPiOS|OPT|DuckDuckGo|Ddg|GSA|YaBrowser|Brave)\//.test(ua);
	const safari = /\bVersion\/[\d.]+.*\bSafari\//.test(ua);
	return brand || !safari;
}

/** Offer `blob` through the share sheet, behind a "Save" toast the user taps. */
function offerShareSheet(filename, blob) {
	const file = new File([blob], filename, { type: blob.type });
	const sharer = /** @type {Navigator & { canShare?: (d: { files?: File[] }) => boolean }} */ (navigator);
	if (typeof sharer.share !== 'function' || !sharer.canShare?.({ files: [file] })) {
		saveWithAnchor(filename, blob);
		return;
	}
	// Loaded only here, so Node-run tests that import deck-export.js never resolve it.
	import('../../lib/notify').then(({ notifyAction }) => {
		notifyAction(`${filename} is ready`, {
			label: 'Save',
			duration: SAVE_TOAST_MS,
			onClick: () => {
				sharer.share({ files: [file], title: filename }).catch((err) => {
					// AbortError = the user closed the sheet; anything else, save the old way.
					if (err?.name !== 'AbortError') saveWithAnchor(filename, blob);
				});
			},
		});
	});
}

/** A `blob:` URL that carries `filename` — the name a browser falls back to when it
 *  ignores the anchor's `download` attribute, and the name a PDF opened in a tab shows. */
/** @param {Blob} blob @param {string} filename @returns {string} */
export function namedFileUrl(blob, filename) {
	const file = typeof File === 'function' ? new File([blob], filename, { type: blob.type }) : blob;
	return URL.createObjectURL(file);
}

/** Revoke a URL from `namedFileUrl` once any download it started has had time to read it. */
/** @param {string} url */
export function revokeLater(url) {
	setTimeout(() => {
		try {
			URL.revokeObjectURL(url);
		} catch {
			/* already revoked */
		}
	}, REVOKE_AFTER_MS);
}

/** Point an existing link at `blob`, named `filename` — for a link the user clicks
 *  themselves rather than one we click for them. Returns the URL so the caller can
 *  revoke it when the link is re-armed. */
/** @param {HTMLAnchorElement} a @param {string} filename @param {Blob} blob @returns {string} */
export function armDownloadLink(a, filename, blob) {
	const url = namedFileUrl(blob, filename);
	a.href = url;
	a.download = filename;
	return url;
}

/** Save an already-made URL (from `namedFileUrl`) as `filename`. The caller owns the URL. */
/** @param {string} url @param {string} filename */
export function downloadUrl(url, filename) {
	if (typeof document === 'undefined') return;
	const a = document.createElement('a');
	a.href = url;
	a.download = filename;
	document.body.appendChild(a);
	a.click();
	a.remove();
}

/** @param {string} filename @param {Blob} blob */
function saveWithAnchor(filename, blob) {
	const url = namedFileUrl(blob, filename);
	downloadUrl(url, filename);
	revokeLater(url);
}

/** Save a Blob as `filename`: a one-tap download, or on a non-Safari iOS browser the
 *  two-tap share sheet (see above). Browser-only; a no-op-safe guard keeps it from
 *  throwing in a non-DOM environment (tests). */
/** @param {string} filename @param {Blob} blob */
export function downloadBlob(filename, blob) {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
	if (iosNeedsShareSheet()) {
		offerShareSheet(filename, blob);
		return;
	}
	saveWithAnchor(filename, blob);
}

// Trigger a client-side file download for a text blob (the Share "hand off the
// source" path). Guarded so it stays a no-op in a non-DOM environment (tests).
/** @param {string} filename @param {string} text @param {string} [mime] */
export function downloadText(filename, text, mime = 'text/markdown') {
	if (typeof Blob === 'undefined') return;
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
