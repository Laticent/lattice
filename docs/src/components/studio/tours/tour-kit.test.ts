import { afterEach, describe, expect, it } from 'vitest';
import { railReady } from './tour-kit';

// A tour waits for the deck it typed to reach k slides. Where the slide map sits beside the slide it replaces the pill
// navigator, so the wait must read the map's tiles too, or every typed slide hangs until Vetrina's 15 s give-up.
afterEach(() => {
	document.body.innerHTML = '';
});

describe('railReady', () => {
	it('counts the pills', () => {
		document.body.innerHTML = '<nav aria-label="Slide navigator"><button></button><button></button></nav>';
		expect(railReady(2)()).toBe(true);
		expect(railReady(3)()).toBe(false);
	});
	it('counts the slide map when the pills are hidden, by its highest mounted tile', () => {
		document.body.innerHTML = '<nav data-map-rail="vertical"><button data-unit="0"></button><button data-unit="2"></button></nav>';
		expect(railReady(3)()).toBe(true);
		expect(railReady(4)()).toBe(false);
	});
});
