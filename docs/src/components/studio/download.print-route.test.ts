// Which browsers Print routes to the real PDF instead of the hidden print frame (download.js `needsPdfToPrint`).
// A browser that prints the TOP document for a hidden frame's `print()` hands the author one page: a picture of the
// Studio (Android Firefox, 2026-11-12; Firefox and every phone in engineering/decisions/2026-06-14-deck-print-styling.md).
import { describe, expect, it } from 'vitest';
import { needsPdfToPrint } from './download';

const UA = {
	androidFirefox: 'Mozilla/5.0 (Android 14; Mobile; rv:132.0) Gecko/132.0 Firefox/132.0',
	androidChrome: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36',
	iPhoneSafari: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1',
	iPhoneFirefox: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/132.0 Mobile/15E148 Safari/605.1.15',
	macFirefox: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.6; rv:132.0) Gecko/20100101 Firefox/132.0',
	winChrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
	macSafari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_6) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15',
};

describe('needsPdfToPrint', () => {
	it('sends every phone and every Firefox to the PDF', () => {
		expect(needsPdfToPrint(UA.androidFirefox, 'Linux armv8l', 5, true)).toBe(true);
		expect(needsPdfToPrint(UA.androidChrome, 'Linux armv8l', 5, true)).toBe(true);
		expect(needsPdfToPrint(UA.iPhoneSafari, 'iPhone', 5, true)).toBe(true);
		expect(needsPdfToPrint(UA.iPhoneFirefox, 'iPhone', 5, true)).toBe(true);
		expect(needsPdfToPrint(UA.macFirefox, 'MacIntel', 0, false)).toBe(true);
		// An iPad that reports itself as a Mac: the touch points give it away.
		expect(needsPdfToPrint(UA.macSafari, 'MacIntel', 5, true)).toBe(true);
	});
	it('keeps the print dialog where it prints every page', () => {
		expect(needsPdfToPrint(UA.winChrome, 'Win32', 0, false)).toBe(false);
		expect(needsPdfToPrint(UA.macSafari, 'MacIntel', 0, false)).toBe(false);
	});
	it('treats a finger-first device as a phone whatever it says', () => {
		expect(needsPdfToPrint(UA.winChrome, 'Win32', 10, true)).toBe(true);
	});
});
