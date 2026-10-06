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

/** Trigger a client-side download for a Blob. Browser-only; a no-op-safe guard keeps
 *  it from throwing in a non-DOM environment (tests). */
/** @param {string} filename @param {Blob} blob */
export function downloadBlob(filename, blob) {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
	const url = namedFileUrl(blob, filename);
	downloadUrl(url, filename);
	revokeLater(url);
}

// Trigger a client-side file download for a text blob (the Share "hand off the
// source" path). Guarded so it stays a no-op in a non-DOM environment (tests).
/** @param {string} filename @param {string} text @param {string} [mime] */
export function downloadText(filename, text, mime = 'text/markdown') {
	if (typeof Blob === 'undefined') return;
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }));
}
