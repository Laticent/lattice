import { describe, expect, it } from 'vitest';
import { isIOSLike as downloadCopy } from './download';
import { isIOSLike } from './ios-like';

// ios-like.js copies download.js's check to keep download.js off the Studio's eager path.
// The copies must give the same answer for every device the check tells apart.
const CASES: Array<[string, string, number, boolean]> = [
	['Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5, true],
	['Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)', 'iPad', 5, true],
	['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5, true], // iPadOS 13+
	['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0, false], // a real Mac
	['Mozilla/5.0 (Windows NT 10.0; Win64; x64)', 'Win32', 0, false],
	['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 'Linux armv8l', 5, false],
];

describe('isIOSLike (ios-like.js)', () => {
	it.each(CASES)('%s on %s with %i touch points → %s', (ua, platform, touch, want) => {
		expect(isIOSLike(ua, platform, touch)).toBe(want);
		expect(downloadCopy(ua, platform, touch)).toBe(want);
	});
});
