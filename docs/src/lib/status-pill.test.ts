import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sonner is a DOM-mounted singleton; what this module owns is the OPTIONS OBJECT
// it hands over, so the toast function is the seam worth stubbing.
const toast = vi.fn();
vi.mock('sonner', () => ({ toast: (...args: unknown[]) => toast(...args) }));

const { STATUS_DURATION, STATUS_TOAST_ID, showStatus } = await import('./status-pill');

/** The options object from the nth call (0-based). */
function opts(n: number): Record<string, unknown> {
	return toast.mock.calls[n]?.[1] as Record<string, unknown>;
}

describe('showStatus', () => {
	beforeEach(() => toast.mockClear());

	it('writes every message to the one id, so a second message REPLACES the first', () => {
		showStatus('Deck created.');
		showStatus('Renamed to “Q3”.');
		expect(toast).toHaveBeenCalledTimes(2);
		expect(opts(0).id).toBe(STATUS_TOAST_ID);
		expect(opts(1).id).toBe(STATUS_TOAST_ID);
		// Same id both times is the whole mechanism: Sonner rewrites the existing
		// toast instead of stacking a second one.
		expect(opts(0).id).toBe(opts(1).id);
	});

	// THE LOAD-BEARING ONE. Sonner merges by id (`{...toast, ...data}`), so a key
	// this function omits would silently inherit the previous message's value —
	// stale explanatory lines riding along under new text, in the card shape rather
	// than the capsule. Passing `description: undefined` is what clears it.
	it('passes `description` on every call, as undefined when there is none', () => {
		showStatus('Imported 2 themes.', { description: 'Refused scene-a — its motion plan is not valid.' });
		showStatus('Deck saved.');
		expect(opts(0).description).toBe('Refused scene-a — its motion plan is not valid.');
		expect('description' in opts(1)).toBe(true);
		expect(opts(1).description).toBeUndefined();
	});

	it('never carries an action — an affordance keeps its own toast', () => {
		showStatus('Deck deleted.');
		expect('action' in opts(0)).toBe(false);
	});

	it('dwells for the Studio default, and honors an override', () => {
		showStatus('Deck saved.');
		showStatus('A longer read that needs longer on screen.', { duration: 8000 });
		expect(opts(0).duration).toBe(STATUS_DURATION);
		expect(opts(1).duration).toBe(8000);
	});
});
