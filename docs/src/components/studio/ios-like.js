// Kept out of download.js so a caller on the Studio's eager path (deck-import-accept.ts)
// can ask "is this iOS?" without loading the download machinery with it.

const nav = () => (typeof navigator === 'undefined' ? null : navigator);

/** iPhone, iPod or iPad — iPadOS 13+ reports as a Mac, so touch points disambiguate. */
export function isIOSLike(ua = nav()?.userAgent || '', platform = nav()?.platform || '', touchPoints = nav()?.maxTouchPoints || 0) {
	return /iPad|iPhone|iPod/.test(ua) || (platform === 'MacIntel' && touchPoints > 1);
}
