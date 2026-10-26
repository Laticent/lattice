// The eager-path copy of download.js's isIOSLike, for deck-import-accept.ts. It is a copy,
// not an import in either direction, because Rolldown places download.js in the same chunk
// as anything download.js imports: when download.js imported this file, all of download.js
// moved onto the Studio's first paint (+874 gzip bytes, check:route-budget). ios-like.test.ts
// holds the two copies to the same answers.

const nav = () => (typeof navigator === 'undefined' ? null : navigator);

/** iPhone, iPod or iPad — iPadOS 13+ reports as a Mac, so touch points disambiguate. */
export function isIOSLike(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
