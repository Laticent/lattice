// How full this browser's localStorage allowance is.
//
// Deck text, settings, drafts, comments and the boot pointer share one allowance per origin.
// When it fills, a deck edit is refused (studio-store.ts `saveSource` reports it), which is
// too late to help: the author learns about it at the moment their work stops saving. This
// module measures the fill so the Studio can warn first, past `LOCAL_WARN_AT`.
//
// THE ALLOWANCE, measured on 2026-11-11 by filling localStorage until `setItem` threw
// (Playwright, one origin, 100 K-character values then 1 K top-ups; counting key + value):
//   · Chromium and Firefox: 5,242,272 characters, whatever the characters are.
//   · WebKit (Safari, the Tauri app's webview): the same for Latin-1 text, and 2,621,131 once
//     the values hold a non-Latin-1 character (an em dash is enough): WebKit stores such a
//     string at two bytes per character.
// So use is counted in Chromium's units, and on WebKit an entry holding any non-Latin-1
// character counts twice. Not an exact model of any engine's bookkeeping, and not meant to be:
// a warning at 80% needs to be right to within a few percent, not to the character.
//
// Pure apart from reading localStorage and `navigator`; `localStorageUse` takes both as
// parameters so tests can pass their own.

/** The allowance in characters (key + value), measured in Chromium and Firefox. */
export const LOCAL_ALLOWANCE = 5_242_272;
/** Warn when use passes this fraction of the allowance. */
export const LOCAL_WARN_AT = 0.8;

export type LocalStorageUse = {
	/** Characters stored, in Chromium's units (doubled per entry with non-Latin-1 text on WebKit). */
	used: number;
	allowance: number;
	/** used / allowance, 0 when storage is unreadable. */
	fraction: number;
	/** Past `LOCAL_WARN_AT`. */
	warn: boolean;
};

// Any UTF-16 code unit above U+00FF.
const WIDE = /[\u0100-\uffff]/;

/** WebKit stores a string with any non-Latin-1 character at two bytes per character. */
export function isWebKit(nav: { vendor?: string } | undefined = typeof navigator === 'undefined' ? undefined : navigator): boolean {
	return nav?.vendor === 'Apple Computer, Inc.';
}

type Store = Pick<Storage, 'length' | 'key' | 'getItem'>;

export function localStorageUse(store: Store | undefined = typeof localStorage === 'undefined' ? undefined : localStorage, webkit = isWebKit()): LocalStorageUse {
	let used = 0;
	try {
		if (store) {
			for (let i = 0; i < store.length; i++) {
				const k = store.key(i);
				if (k == null) continue;
				const v = store.getItem(k) ?? '';
				const n = k.length + v.length;
				used += webkit && (WIDE.test(k) || WIDE.test(v)) ? 2 * n : n;
			}
		}
	} catch {
		/* storage unavailable: report empty rather than a false alarm */
		used = 0;
	}
	const fraction = used / LOCAL_ALLOWANCE;
	return { used, allowance: LOCAL_ALLOWANCE, fraction, warn: fraction >= LOCAL_WARN_AT };
}

/** "4.4 M of 5.2 M characters (84%)" — the words the warnings use. */
export function describeLocalUse(u: LocalStorageUse): string {
	// A no-break space, so a narrow panel never wraps between the number and its unit.
	const m = (n: number) => `${(n / 1_000_000).toFixed(1)}\u00a0M`;
	return `${m(u.used)} of ${m(u.allowance)} characters (${Math.round(u.fraction * 100)}%)`;
}
