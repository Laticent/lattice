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

// iOS saving lives in download-ios.js and loads only on an iPhone or iPad: it is about 1.5 KB
// of first-paint JS the Studio and Playground would otherwise ship to every desktop
// (docs/route-budget.json). Why iOS needs it at all is written up there.
const nav = () => (typeof navigator === 'undefined' ? null : navigator);

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

/** Every iPhone and iPad browser saves through the share sheet — Safari included. The owner's
 *  call (2026-10-06): one native iOS save, the same in every iOS browser, rather than a
 *  one-tap download in Safari and a share sheet everywhere else. Every iOS browser is Safari's
 *  engine; the difference was only which ones drop the file name (Firefox does). */
export function iosNeedsShareSheet(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	return isIOSLike(ua, platform, touchPoints);
}

// The iOS "Save" toast a save is waiting on (download-ios.js), so a surface that moves on —
// the Share sheet switching format or closing — can retire it. Kept here, not in the lazy iOS
// chunk, so ShareSheet can call it without loading that chunk. The handle comes back from
// notify.ts's NOTIFY_ACTION_EVENT listener; the dismissal goes out as its NOTIFY_DISMISS_EVENT.
/** @type {unknown} */
let pendingSave = null;

/** Retire the waiting iOS Save toast, if there is one. */
export function dismissPendingSave() {
	if (pendingSave && typeof window !== 'undefined') {
		window.dispatchEvent(new CustomEvent('lattice:notify-dismiss', { detail: { handle: pendingSave } }));
	}
	pendingSave = null;
}

/** Record the toast a new iOS save is waiting on. A raise into notify's still-live action slot
 *  reuses its id, so the handle can be the SAME toast: retiring it then would remove the toast
 *  just raised (the second export in a row showed nothing at all). Only a different toast is
 *  retired. @param {unknown} handle */
export function setPendingSave(handle) {
	if (handle !== pendingSave) dismissPendingSave();
	pendingSave = handle;
}

/** Whether a Save toast is waiting (download-ios.js starts a new batch when none is). */
export function hasPendingSave() {
	return pendingSave !== null;
}

/** Forget the waiting toast without retiring it — it closed itself on the tap. */
export function clearPendingSave() {
	pendingSave = null;
}

/** iPhone, iPod or iPad — iPadOS 13+ reports as a Mac, so touch points disambiguate. */
export function isIOSLike(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}

/** Save an already-made URL (from `namedFileUrl`) as `filename`. The caller owns the URL.
 *  @param {string} url @param {string} filename */
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

/** Save a Blob as `filename`: a one-tap download, or on iOS (every browser) the two-tap share
 *  sheet (download-ios.js). `onSaved` runs once the file is actually handed over — at once for
 *  a download, after the share sheet for iOS — so a caller that records a save (the workspace
 *  backup's "last backup") never records one the author has not made yet. Browser-only; a
 *  no-op-safe guard keeps it from throwing in a non-DOM environment (tests).
 *  @param {string} filename @param {Blob} blob @param {{ onSaved?: () => void }} [opts] */
export function downloadBlob(filename, blob, opts = {}) {
	if (typeof document === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return;
	if (isIOSLike()) {
		import('./download-ios.js').then(
			(ios) => ios.saveOnIOS(filename, blob, saveWithAnchor, opts.onSaved),
			// The iOS chunk failed to load (a stale tab after a deploy): still save, the old way.
			() => {
				saveWithAnchor(filename, blob);
				opts.onSaved?.();
			},
		);
		return;
	}
	saveWithAnchor(filename, blob);
	opts.onSaved?.();
}

// Trigger a client-side file download for a text blob (the Share "hand off the
// source" path). Guarded so it stays a no-op in a non-DOM environment (tests).
/** @param {string} filename @param {string} text @param {string} [mime] @param {{ onSaved?: () => void }} [opts] */
export function downloadText(filename, text, mime = 'text/markdown', opts = {}) {
	if (typeof Blob === 'undefined') return;
	downloadBlob(filename, new Blob([text], { type: `${mime};charset=utf-8` }), opts);
}
